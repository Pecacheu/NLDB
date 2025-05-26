//NLDB, Pecacheu 2025. GNU GPL v3
const VER='v2.0 a2';

import fs from 'fs/promises';
import http from 'http';
import https from 'https';
import chalk from 'chalk';
import mdb from 'mongodb';
import router from './router.js';
import UUID from './uuid.js';

const Path="/web",
ReqTimeout=20000,
LoginTimeout=480000,
TknExpSec=3600,
TknExp=TknExpSec*1000,
TknCheckInt=3600000,
//MaxUpload=10000000, //10MB
NameMax=1000,
DataMax=10000,
MaxLogLen=700,
LogDateFmt={sec:true, suf:false, year:false, df:true},
Conf=JSON.parse(await fs.readFile('config.json')),
SrvOpt=Conf.sslKey?{key:await fs.readFile(Conf.sslKey), cert:await fs.readFile(Conf.sslCert)}:null,
print=console.log, CL=[], LReq={}, Tkn={};
let DB, Cat, Lock, CID, RDU, OAuthUri, TknUri, UsrInfoUri;

if(Conf.debug>1) router.debug=1;

//Auth Keys
if(Conf.auth === 'wildapricot') {
	CID=Conf.apiKey.split(':')[0];
	RDU=encodeURIComponent(`https://${Conf.host}:${Conf.port}/auth`);
	OAuthUri=Conf.authUri+`?client_id=${CID}&scope=auto&redirect_uri=${RDU}&state=`;
	TknUri="https://oauth.wildapricot.org/auth/token";
	UsrInfoUri="https://api.wildapricot.org/v2/accounts/";
}

async function begin() {
	const ips=utils.getIPs(), [sysOS, arch, cpu]=utils.getOS();
	print("IP:",ips,`OS: ${sysOS}, ${arch}\nCPU: ${cpu}\n`);

	print(chalk.yellow(`NLDB ${VER}`));
	if(sysOS !== 'Linux') {
		print(chalk.yellow(chalk.underline("Warning: Thumbnail generation via ImageMagick only supported on Linux")));
	}
	//TODO else setup ImageMagick stuff

	print("Loading database...");
	DB = new mdb.MongoClient(Conf.dbUri).db('nldb');
	Cat = DB.collection('cat'), DB.u = DB.collection('usr');
	for await(let c of Cat.find()) loadCat(c._id);
	for await(let u of DB.u.find()) {
		let kl=u.k; delete u.k;
		print("USER",u,"HAS TOKENS",kl);
		for(let k of kl) Tkn[k]=u;
	}
	setInterval(tknExpLoop, TknCheckInt);
	await tknExpLoop();

	const rqCb=async (rq,re) => {
		if(Conf.debug>1) msg("[REQ]",rq.url);
		re.sendDate=false; let r,e;
		try {(r=await onReq(rq,re))} catch(er) {e=er} finally {
			dbUnlock(rq); if(r||e) endReq(re,r,e); else router.handle(Path,rq,re);
		}
	}
	(SrvOpt?https.createServer(SrvOpt, rqCb):http.createServer(rqCb)).listen(Conf.port, () => {
		print("Listening at "+chalk.bgGreen(`http${SrvOpt?'s':''}://${Conf.host}:${Conf.port}`));
	});
}

//============================================== Requests ==============================================

async function onReq(req, res) {
	let uri=new URL(req.url,'http://a'), pn=res.pn=uri.pathname;
	if(pn === '/db') { //DB Cmd
		let q=(req.method==='POST')?(await reqData(req)).toString('utf8'):uri.search.slice(1);
		if(q.length < 1) throw "Bad Args";
		q=q.split('&'); q.forEach((r,i) => q[i]=decodeURIComponent(r));
		return await dbCmd(q,req,res);
	} else if(pn === '/login') {
		//TODO Rate limit login and auth endpoints
		msg("[LOGIN]",req.socket.remoteAddress);
		if(!SrvOpt) throw "Insecure Connection";
		if(!OAuthUri) throw "No Login System";
		d=await genTkn();
		LReq[d]=setTimeout(() => {delete LReq[d]}, LoginTimeout);
		res.writeHead(307,'',{location:OAuthUri+encodeURIComponent(d)});
		res.end(); return 2;
	} else if(pn === '/auth') {
		let q=utils.fromQuery(uri.search), k=LReq[q.state], c=';Secure;Max-Age='+TknExpSec;
		msg("[AUTH]",q);
		if(!q.code) throw "Bad Auth";
		if(!k || Tkn[k]) throw "Expired Token";
		clearTimeout(k), delete LReq[q.state];
		let t=await getAuth(q.code);

		await dbLock(req);
		let u=await DB.u.findOne({e:t.e});
		if(u) {
			let r=await DB.u.updateOne({_id:u._id}, {n:t.n, ns:t.ns, e:t.e, $push:{k:k}});
			if(r.modifiedCount !== 1) throw "User not found";
		} else {
			let id=(await UUID.genUUID()).toString();
			await DB.u.insertOne(u={_id:id, n:t.n, ns:t.ns, e:t.e, k:[k]});
		}
		Tkn[k]=u;
		dbUnlock(req);

		re.writeHead(307,'',{location:'/', 'set-cookie':['k='+k+c,'u='+u.ns+c]});
		re.end(); return 2;
	}
}

function reqData(req) {
	return new Promise((r,j) => {
		let b=[],tl=0;
		req.on('data',c => {
			tl += b.length;
			if(tl > 0) { //MaxUpload
				req.destroy();
				j("Request too large!"); //TODO Test if end is still called
			} else b.push(c);
		});
		req.on('end',() => {
			print(`Ended req with ${b.length} buffers`);
			r(Buffer.concat(b));
		});
	});
}

//============================================== Database ==============================================

async function dbLock(l) {
	while(Lock && Lock.l!==l) await Lock.p;
	Lock={l:l}; Lock.p=new Promise(r=>Lock.r=r);
}
function dbUnlock(l) {if(Lock && Lock.l===l) Lock.r(),Lock=0}

function loadCat(id) {
	CL[id] = {
		itm: DB.collection(`itm.${id}`), inv: DB.collection(`inv.${id}`),
		loc: DB.collection(`loc.${id}`), log: DB.collection(`log.${id}`)
	}
}

/*Data Formats
cat - _id:id, n:name, v:[varFields], s:[subCats]
cat.s - _id:id, n:name, v:[varFields]
itm.[cat] - _id:id, s:subCat, n:nameOrMPN, m:mfg, a:[altPNs], d:desc, cv:{catVars}, sv:{subVars}, v:{uniqueVars},
	_i:[inv], _b:createdBy, _c:createdOn, _u:lastUpdated, _h:history
inv.[cat] - _id:id, i:itmId, l:loc, q:qty, s:SN, d:dateCodeOrPO, v:{uniqueVars},
	_i:item, _b:addedBy, _c:createdOn, _u:lastUpdated, _h:history
loc.[cat] - _id:id, n:name, p:parent, v:[uniqueVars], _f:fullName
log.[cat] - _id:id, t:evType, d:date, e:entityId, u:userId, n:nameIfCreate, l:locIdIfNotLocEvent, o:newLocIdIfMove, c:comment,
	_n:nameIfNotCreate, _l:oldLocFullName, _o:newLocFullName

TODO Indexes for inv.i and inv.l

History types
1 - LOG_PN - Create Item
2 - LOG_IN - Create Stock
3 - LOG_LN - Create Location
4 - Delete Item?
5 - Adjust Stock?
6 - Move Stock?
7 - Delete Stock?
8 - Move Location?
9 - Delete Location?

Names and altPNs for items must be unique in cat
Starting with _ = Cached & can be regenerated
*/

const LOG_PN=1, LOG_IN=2, LOG_LN=3,
T_ID=1, T_ARR=2, T_OBJ=3;

//Get Part/Inv/Loc/Log collection
function getTbl(q,c) {
	switch(q[0][0]) {
		case 'p': return c.itm;
		case 'i': return c.inv;
		case 'l': return c.loc;
		case 'h': return c.log;
	}
}

//TODO ChuSchema
//TODO Make sure schema format never includes keys that start with '$'
function checkSchema() {}

const ItmDataFmt={
	n:{t:'str',max:NameMax},
	d:{t:'str',req:false},
	m:{t:'str',max:NameMax,req:false},
	s:{t:'uuid',req:false},
	c:{t:'str',max:NameMax,req:false},
	cv:{t:'dict',f:'str|num',req:false},
	sv:{t:'dict',f:'str|num',req:false},
	v:{t:'dict',f:'str|num',req:false}
}, InvDataFmt={
	l:{t:'uuid'},
	q:{t:'int',min:0},
	s:{t:'str',max:NameMax,req:false},
	d:{t:'str',max:NameMax,req:false},
	v:{t:'dict',f:'str|num',req:false}
}, LocDataFmt={
	n:{t:'str',max:NameMax},
	p:{t:'uuid',req:false},
	v:{t:'dict',f:'str|num',req:false}
};

//TODO Create log table entries whenever performing action inside cat

async function dbCmd(q,req,res) {
	msg("[CMD]",q);
	let k=req&&utils.getCookie('k',req.headers.cookie), t=k&&Tkn[k], id,c,d,j,n;
	switch(q[0]) {
	//---- User ----
	case 'lo': //Log Out
		try {await delTkn(k)} catch(e) {console.error(e)}
		res.writeHead(200,'',{'set-cookie':['k=0;Max-Age=0','u=0;Max-Age=0']});
		res.end(); return 2;
	//---- Read ----
	case 'cl': //List Cats
		return await Cat.find({}, {sort:['n'], projection:{_id:1, n:1}}).toArray();
	case 'a': //Cat Summary [cid]
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_ID);
		d=await Cat.findOne({_id:q[1]});
		if(!d) throw "Not found";
		return d;
	case 'pl': case 'il': case 'll': case 'hl': //List Part/Inv/Loc/Log [cid]
		if(q.length !== 2) throw "Bad Args";
		if(!(c=CL[q[1]])) throw "Bad Cat ID";
		//TODO Paged results up to 1K at a time
		return await getTbl(q,c).find().toArray();
	case 'p': case 'i': case 'l': case 'h': //Get Part/Inv/Loc/Log [cid, id]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CL[q[1]])) throw "Bad Cat ID";
		asType(q,2,T_ID);
		d=await getTbl(q,c).findOne({_id:q[2]});
		if(!d) throw "Not found";
		return d;
	//---- Create ----
	case 'cn': //New Cat [name]
		//TODO This should require max admin perms
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,0,"Name",NameMax);
		id=(await UUID.genUUID()).toString();
		await Cat.insertOne({_id:id, n:q[1]});
		loadCat(id);
		return 1;
	case 'sn': //New SubCat [cid, name]
		if(q.length !== 3) throw "Bad Args";
		asType(q,1,T_ID);
		asType(q,2,0,"Name",NameMax);
		id=(await UUID.genUUID()).toString();
		d=await Cat.updateOne({_id:q[1]}, {$push: {s:{_id:id, n:q[2]}}});
		if(d.modifiedCount !== 1) throw "Cat not found";
		return 1;
	case 'pn': //New Part [cid, {n:name, d:desc, m:mfg, s:subId, c:cmnt, cv:catVars, sv:subVars, v:vars}]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CL[q[1]])) throw "Bad Cat ID";
		asType(q,2,T_OBJ,"Data",DataMax);
		checkSchema(j=q[2], ItmDataFmt);
		id=(await UUID.genUUID()).toString(), d={_id:id};
		for(n in j) if(n!=='c') d[n]=j[n];
		await getTbl(q,c).insertOne(d);
		dbLog(c, LOG_PN, id, t, j.c, {n:j.n});
		return 1;
	case 'in': //New Inv [cid, itemId, {l:loc, q:qty, s:SN, d:dateCodeOrPO, v:vars}]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CL[q[1]])) throw "Bad Cat ID";
		asType(q,2,T_ID,"Item ID");
		asType(q,3,T_OBJ,"Data",DataMax);
		checkSchema(j=q[3], InvDataFmt);
		id=(await UUID.genUUID()).toString(), d={_id:id, i:q[2]};
		for(n in j) if(n!=='c') d[n]=j[n];
		await getTbl(q,c).insertOne(d);
		dbLog(c, LOG_IN, id, t, j.c, {n:j.n, l:j.l});
		return 1;
	case 'ln': //New Loc [cid, {n:name, p:parent, v:vars}]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CL[q[1]])) throw "Bad Cat ID";
		asType(q,2,T_OBJ,"Data",DataMax);
		checkSchema(j=q[2], LocDataFmt);
		id=(await UUID.genUUID()).toString(), d={_id:id};
		for(n in j) if(n!=='c') d[n]=j[n];
		await getTbl(q,c).insertOne(d);
		dbLog(c, LOG_LN, id, t, j.c, {n:j.n});
		return 1;
	//---- Update ----
	case 'pu': //Part Update [cid, id, {n:name, d:desc, m:mfg, s:subId, c:cmnt, cv:catVars, sv:subVars, v:vars}]
		if(q.length !== 4) throw "Bad Args";
		if(!(c=CL[q[1]])) throw "Bad Cat ID";
		asType(q,2,T_ID);
		asType(q,3,T_OBJ,"Data",DataMax);
		checkSchema(j=q[3], PartDataFmt);
		d=await getTbl(q,c).updateOne({_id:q[2]}, j);
		if(d.modifiedCount !== 1) throw "Part not found";
		//TODO Update name in history log if name changed?
		return 1;
	//case 'iu': case 'lu': //Update Part/Inv/Loc
	//case 'im': case 'lm': //Move Inv/Loc
	//case 'ia': //Adjust Inv Stock
	/*break; case 'cn': case 'sn': //Rename Cat
	//if(!Cat) await tCat();
	let c=q[0]=='cn', s=c?'tcat.':'tsub.', to=qt(q[1]), tn=qt(q[2]);
	await dbReq(`alter table ${s+to} rename to ${tn}`);
	if(c) await dbReq(`alter table itm.${to} rename to ${tn}`);
	//await dbReq(`alter table itm.${to} rename to ${tn}`);
	res(re);*/
	//---- Delete ----
	//case 'dc': //Del Cat
		//TODO This should require max admin perms
	//case 'ds': //Del SubCat
	//case 'dp': //Del Part
	//case 'di': //Del Item
	//case 'dl': //Del Loc
	//TODO
	default:
		throw "Unknown cmd";
	}
}

function asType(q,i,t,n,max,opt) {
	if(t === T_ID && q[i].length !== UUID.LEN) throw "Bad "+(n||"ID");
	q[i]=q[i].trim();
	if(!q[i]) {
		if(opt) return;
		throw n+" Required";
	}
	if(max && q[i].length > max) throw n+" Too Long";
	switch(t) {
		case T_ARR: q[i]=JSON.parse(`[${q[i]}]`); break;
		case T_OBJ: q[i]=JSON.parse(`{${q[i]}}`);
	}
}

async function dbLog(cat, type, eid, t, cmnt, data) {
	try {
		let d=new Date(), id=(await UUID.genUUID()).toString();
		d={_id:id, t:type, d:d, e:eid};
		if(t) d.u=t._id;
		if(data) for(let k in data) d[k]=data[k];
		if(cmnt) d.c=cmnt;
		await cat.log.insertOne(d);
	} catch(e) {console.error(e)}
}

function endReq(res,r,e) {
	/*if(re.pn == '/up') { //Log to file
		let s=`[${date()}] ${re.un||"Anonymous"} Update `+re.qr;
		if(e) s+=" Failed: "+e;
		else if(re.ld) s+=' '+(Array.isArray(re.ld)?'['+re.ld.join(', ')+']':JSON.stringify(re.ld));
		fs.writeFile("db.log",s+'\n',{flag:'a'},e=>{if(e) msg(chalk.red(e.stack))});
	}*/
	let t=typeof r;
	if(e) chalk.red(e.stack||e); else {
		if(t==='object') r=JSON.stringify(r);
		else if(r!==2 && t!=='string') r=r.toString();
		print(chalk.dim(r!==1?`(${r.length}) `+
			(r.length>MaxLogLen?r.slice(0,MaxLogLen)+'...':r):"Done"));
	}
	if(r!==2) res.writeHead(e?500:200,''), res.end(e?e.toString():r);
}

//============================================== User Auth ==============================================

/*function RA(a,lv) {
	if(!a) throw "Login Required!";
	if(!(a=Perms[a.d.Email]) || !(a>=lv)) throw "Sorry, you have insufficient permissions.";
}
function cAuth(rq) {
	let t=rq.headers.cookie, k=getCookie(t,'dbtkn'), u=getCookie(t,'dbusr');
	if(!k) return; if(!(t=Tkn[k]) || u!=t.us) throw "Expired Token!";
	log("Token:",k,"User:",chalk.yellow(t.n),"Perms:",Perms[t.e]);
	return t;
}*/

async function tknExpLoop() {
	let n=new Date(),tk=Object.keys(Tkn),k,d;
	for(k of tk) {
		d=new UUID(k.slice(0,UUID.LEN)).getDate();
		print("TOKEN",k,"WITH DATE",d,"AGE IS",n-d,"OF MAX",TknExp);
		if(n-d >= TknExp) await delTkn(k);
	}
}

async function genTkn() {
	let u=await UUID.genUUID(), r=await UUID.randBytes(24);
	return u.toString()+r.toString('base64url');
}
async function delTkn(k) {
	let t=Tkn[k]; if(!t) throw "Token Not Found";
	delete Tkn[k];
	print(chalk.bgRed("USER",t,"HAS EXPIRED TOKEN",k));
	t=await DB.u.updateOne({_id:t._id}, {$pull:{k:k}});
	if(t.modifiedCount !== 1) throw "User not found";
}

async function getAuth(c) {
	let d=JSON.parse(await httpsReq(TknUri, 'POST', {
		'content-type':'application/x-www-form-urlencoded',
		authorization:"Basic "+Buffer.from(Conf.apiKey).toString('base64')
	}, `grant_type=authorization_code&code=${c}&client_id=${CID}&redirect_uri=${RDU}&scope=auto`)),
	k=d.access_token, x=d.expires_in, t={u:d.Permissions[0].AccountId};
	if(!k||!(x>0)||!t.u) throw "Bad Token";
	//WA User Data
	d=JSON.parse(await httpsReq(UsrInfoUri+t.u+'/contacts/me', 'GET', {authorization:"Bearer "+k}));
	t.n=d.FirstName+' '+d.LastName, t.ns=d.FirstName.substr(0,1)+d.LastName.substr(0,1), t.e=d.Email;
	if(Conf.debug) print("WA Auth",d,t);
	return t;
}

//============================================== Support ==============================================

function msg() {
	let d=utils.formatDate(new Date(), LogDateFmt);
	Array.prototype.splice.call(arguments,0,0,chalk.green(`[${d}]`));
	print(...arguments);
}

function httpsReq(uri, mt, hdr, rb) {
	return new Promise((res,rej) => {
		let dat='',tt,re,rq=https.request(uri, {method:mt,headers:hdr}, r => {
			re=r, r.setEncoding('utf8'), r.on('data', d => dat+=d), r.on('end', rEnd);
		}).on('error', rEnd);
		if(rb) rq.write(rb); rq.end();
		tt=setTimeout(() => rEnd(Error("Timed Out")), ReqTimeout);
		function rEnd(e) {
			if(rq.ee) return; if(e) rq.destroy(); rq.ee=1; clearTimeout(tt);
			if(!e && re.statusCode != 200) rej(Error("Code "+re.statusCode+(dat?" "+dat:'')+" "+uri));
			else res(dat);
		}
	});
}

//============================================== Main ==============================================

await begin();

const C_REX=/[^\s"]+|""|".*?[^\\]"/g;

process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', async cs => {
	let c=[],m;
	while(m=C_REX.exec(cs)) c.push(m[0].startsWith('"')?JSON.parse(m[0]):m[0]);
	try {print('->',await dbCmd(c))}
	catch(e) {print('->',chalk.red(e.stack||e))}
});