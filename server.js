//NLDB, Pecacheu 2025. GNU GPL v3
const VER='v2.0 Beta 1';

import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import chalk from 'chalk';
import mdb from 'mongodb';
import ar2 from 'argon2';
import sharp from 'sharp';
import router from 'raiutils/router';
import schema from 'raiutils/schema';
import UUID from 'raiutils/uuid';
import 'raiutils';

const TknExpSec=24*3600, //24h
TknExp=TknExpSec*1000,
TknCheckInt=3600000, //1h
MaxUpload=10000000, //10MB
NameMax=1000,
DataMax=10000,
MaxLogLen=700,
Root=import.meta.dirname,
Path=path.join(Root, "web"),
Utils={"utils.js": path.join(Root, "node_modules/raiutils/utils.min.js")},
LogDateFmt={sec:true, suf:false, year:false, df:true},
Conf=JSON.parse(await fs.readFile('config.json')),
SrvOpt=Conf.sslKey?{key:await fs.readFile(Conf.sslKey), cert:await fs.readFile(Conf.sslCert)}:null,
print=console.log, Tkn={};

//Default Workspace Config
let WS={_id:0, c1:0xF25D26, c2:0x6ABF40},
Ico, DB, Cat, CatID, CatMagic, Lock,
CID, RDU, OAuthUri, TknUri, UsrInfoUri;

if(Conf.debug>1) router.debug=1;

//Auth Keys
if(Conf.auth === 'wildapricot') {
	CID=Conf.apiKey.split(':')[0];
	RDU=encodeURIComponent(`https://${Conf.host}:${Conf.port}/auth`);
	OAuthUri=Conf.authUri+`?client_id=${CID}&scope=auto&redirect_uri=${RDU}`;
	TknUri="https://oauth.wildapricot.org/auth/token";
	UsrInfoUri="https://api.wildapricot.org/v2/accounts/";
}

async function begin() {
	const ips=utils.getIPs(), [sysOS, arch, cpu]=utils.getOS();
	print("IP:",ips,`OS: ${sysOS}, ${arch}\nCPU: ${cpu}\n\n`+chalk.yellow(`NLDB ${VER}`));

	print("Loading icon...");
	await sharp(Root+"/icon128.png").metadata(); //Test Sharp
	await fs.stat(Path+"/icon128.png").catch(() => {Ico=1});

	print("Loading database...");
	DB = new mdb.MongoClient(Conf.dbUri).db('nldb'), Cat = DB.collection('cat');
	DB.u = DB.collection('usr'), DB.w = DB.collection('ws');
	WS=(await DB.w.findOne()) || (await DB.w.insertOne(WS),WS);
	loadWS(), await loadCats();
	for await(let u of DB.u.find()) {
		let kl=u.k; delete u.k;
		for(let k of kl) Tkn[k]=u;
	}
	setInterval(tknExpLoop, TknCheckInt);
	await tknExpLoop();

	const rqCb=async (rq,re) => {
		if(Conf.debug>1) msg("[REQ]",rq.url);
		re.sendDate=false; let r,e;
		try {(r=await onReq(rq,re))} catch(er) {e=er} finally {
			dbUnlock(rq); if(r||e) endReq(re,r,e); else router.handle(Path,rq,re,Utils);
		}
	}
	(SrvOpt?https.createServer(SrvOpt, rqCb):http.createServer(rqCb)).listen(Conf.port, () => {
		print("Listening at "+chalk.bgGreen(`http${SrvOpt?'s':''}://${Conf.host}:${Conf.port}`));
	});
}

//============================================== Requests ==============================================

const SEC_CK=";Secure";

async function onReq(req, res) {
	let uri=new URL(req.url,'http://a'), pn=res.pn=uri.pathname;
	if(pn === '/db') {
		let q=(req.method==='POST')?(await reqData(req)).toString('utf8'):uri.search.slice(1);
		if(q.length < 1) throw "Bad Args";
		q=q.split('&'); q.forEach((r,i) => q[i]=decodeURIComponent(r));
		return await dbCmd(q,req,res);
	} else if(pn === '/login') {
		if(!SrvOpt) throw "Insecure Connection";
		if(Conf.auth === 'wildapricot') {
			res.writeHead(307,'',{location:OAuthUri});
			res.end(); return 2;
		} else if(Conf.auth === 'builtin') return;
		throw "No Login System";
	} else if(pn === '/auth') {
		//TODO Rate limit auth endpoint to 1 per 2s
		if(!SrvOpt) throw "Insecure Connection";
		let q=utils.fromQuery(uri.search), qc={...q};
		delete qc.p;
		msg("[AUTH]", req.socket.remoteAddress, qc);
		let k=await getAuth(req,q), t=Tkn[k];
		msg(chalk.yellow(t.e), "got new token", chalk.magenta(k));
		res.writeHead(307, '', {location:'/', 'set-cookie':
			[`k=${k};Max-Age=`+TknExpSec+SEC_CK, "u="+JSON.stringify(t)+SEC_CK]});
		res.end(); return 2;
	} else if(pn === '/up') {
		//TODO Only allow authenticated user, rate limit to 10 per 1s
		//let q=uri.search, ico=q==='icon', fn=ico?'icon.png':await UUID.genUUID();
		//Path+'/u/'+fn;
		//u=await UUID.genUUID()
		//Image magick stuff for icon to generate 128
		//Convert to png
	} else if(Ico && (pn === '/icon.png' || pn === '/icon128.png')) {
		await router.serve(Root+pn, req, res);
		return 2;
	}
	if(pn === '/' || pn === '/login') res.setHeader('set-cookie', WS._c);
}

function reqData(req) {
	return new Promise((r,j) => {
		let b=[],tl=0;
		req.on('data',c => {
			if(b==null) return;
			tl += c.length;
			if(tl > MaxUpload) {
				req.destroy(), b=null;
				j("Request too large!");
			} else b.push(c);
		});
		req.on('end',() => r(Buffer.concat(b)));
	});
}

//============================================== Database ==============================================

async function dbLock(l) {
	while(Lock && Lock.l!==l) await Lock.p;
	Lock={l:l}, Lock.p=new Promise(r=>Lock.r=r);
}
function dbUnlock(l) {if(Lock && Lock.l===l) Lock.r(),Lock=0}

function loadWS() {
	WS._c=utils.setCookie('w', [VER,
		WS.c1.toString(16), WS.c2.toString(16)].join('~'), -1);
}

async function loadCats() {
	CatID=CatMagic=[];
	for await(let c of Cat.find()) addCat(c);
}
function addCat(c) {
	let id=c._id;
	CatID[id] = CatMagic[c.m] = {
		itm:DB.collection(`itm.${id}`), inv:DB.collection(`inv.${id}`),
		loc:DB.collection(`loc.${id}`), log:DB.collection(`log.${id}`),
		_id:id, m:c.m, n:c.n, h:c.h
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

function catFromID(id) {
	let c=CatMagic[new UUID(id).getMagic()];
	if(!c) throw "Bad Cat ID";
	return c;
}

//Get Part/Inv/Loc/Log collection
function getTbl(q,c) {
	switch(q[0][0]) {
		case 'p': return c.itm;
		case 'i': return c.inv;
		case 'l': return c.loc;
		case 'h': return c.log;
	}
}

//Convert dict to Mongo $set and $unset
function dbSet(d) {
	let s={},k,v; for(k in d) {
		if(v=d[k]) (s.$set||(s.$set={}))[k]=v;
		else (s.$unset||(s.$unset={}))[k]=1;
	}
	return s;
}

const CVFmt={t:'str|int',min:[1,null]},
EmailFmt="[a-z0-9.!#$%&'`*+/=^_{}|~-]+@((\\.)?[a-zA-Z0-9-])+",
UsrDataFmt={
	e:{t:'str',f:EmailFmt,max:NameMax},
	n:{t:'str',min:2,max:NameMax},
	c1:{t:'int',min:0,max:0xFFFFFF},
	c2:{t:'int',min:0,max:0xFFFFFF}
},
CatDataFmt={
	n:{t:'str',min:1,max:NameMax},
	h:{t:'bool',req:false},
	v:{t:'dict',c:{t:'str',min:1},req:false}
},
ItmDataFmt={
	n:{t:'str',min:1,max:NameMax},
	d:{t:'str',req:false},
	m:{t:'str',max:NameMax,req:false},
	s:{t:'uuid',req:false},
	c:{t:'str',max:NameMax,req:false},
	cv:{t:'dict',c:CVFmt,req:false},
	sv:{t:'dict',c:CVFmt,req:false},
	v:{t:'dict',c:CVFmt,req:false}
}, InvDataFmt={
	l:{t:'uuid'},
	q:{t:'int',min:0},
	s:{t:'str',max:NameMax,req:false},
	d:{t:'str',max:NameMax,req:false},
	v:{t:'dict',c:CVFmt,req:false}
}, LocDataFmt={
	n:{t:'str',min:1,max:NameMax},
	p:{t:'uuid',req:false},
	v:{t:'dict',c:CVFmt,req:false}
};

//TODO Create log table entries whenever performing action inside cat

async function dbCmd(q,req,res) {
	let k=req&&utils.getCookie('k',req.headers.cookie||''), t=k&&Tkn[k], id,c,d,j,n;
	msg("[CMD]", q, t?chalk.yellow(t.e):'');
	if(k && !t) return 3;
	switch(q[0]) {
	//---- Users & Settings ----
	case 'lo': //Log Out
		await delTkn(k).catch(err);
		res.writeHead(200,'',{'set-cookie':"k=;Max-Age=0"});
		res.end(); return 2;
	case 'uu': //Update User [{e:email, n:name}]
		if(!t) throw "Not logged in";
		if(q.length !== 1) throw "Bad Args";
		asType(q,2,T_OBJ,"Data",DataMax);
		j=q[2], j.e=j.e.trim().toLowerCase();
		schema.checkSchema(j, UsrDataFmt, 1);
		d=await DB.u.updateOne({_id:t._id}, dbSet(j));
		if(d.modifiedCount !== 1) return 3;
		return 1;
	//---- Read ----
	case 'cl': //List Cats
		c=utils.copy(CatID,2);
		c.sort((a,b) => a.n.localeCompare(b.n));
		c.project({_id:1, n:1});
		return c;
	case 'c': //Cat Summary [cid]
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_ID);
		d=await Cat.findOne({_id:q[1]});
		if(!d) throw "Not found";
		return d;
	case 'pl': case 'il': case 'll': case 'hl': //List Part/Inv/Loc/Log [cid]
		if(q.length !== 2) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		//TODO Paged results up to 1K at a time
		return await getTbl(q,c).find().toArray();
	case 'p': case 'i': case 'l': case 'h': //Get Part/Inv/Loc/Log [id]
		if(q.length !== 2) throw "Bad Args";
		c=catFromID(q[1]);
		d=await getTbl(q,c).findOne({_id:q[1]});
		if(!d) throw "Not found";
		return d;
	//---- Create ----
	case 'cn': //New Cat [{n:name, h:trackHistory, v:catVars}]
		//TODO This should require max admin perms
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_OBJ,"Data",DataMax);
		schema.checkSchema(q[1], CatDataFmt);
		id=(await UUID.genUUID()).toString();
		await dbLock(req);
		await loadCats();
		//Find free magic
		n=0; while(1) {
			j=0; for(c in CatID) if(n===CatID[c].m) {j=1; break}
			if(!j) break;
			if(++n > 255) throw "Too many categories (Max is 255)";
		}
		await Cat.insertOne(c={_id:id, m:n, ...q[1]});
		addCat(c);
		return 1;
	case 'sn': //New SubCat [cid, name]
		if(q.length !== 3) throw "Bad Args";
		if(!CatID[q[1]]) throw "Bad Cat ID";
		asType(q,2,0,"Name",NameMax);
		id=(await UUID.genUUID(null,c.m)).toString();
		d=await Cat.updateOne({_id:q[1]}, {$push:{s:{_id:id, n:q[2]}}});
		if(d.modifiedCount !== 1) {await loadCats(); throw "Cat not found"}
		return 1;
	case 'pn': //New Part [cid, {n:name, d:desc, m:mfg, s:subId, c:cmnt, cv:catVars, sv:subVars, v:vars}]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		asType(q,2,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[2], ItmDataFmt);
		id=(await UUID.genUUID(null,c.m)).toString(), d={_id:id};
		for(n in j) if(n!=='c') d[n]=j[n];
		await getTbl(q,c).insertOne(d);
		dbLog(c, LOG_PN, id, t, j.c, {n:j.n});
		return 1;
	case 'in': //New Inv [cid, itemId, {l:loc, q:qty, s:SN, d:dateCodeOrPO, v:vars}]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		asType(q,2,T_ID,"Item ID");
		asType(q,3,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[3], InvDataFmt);
		id=(await UUID.genUUID(null,c.m)).toString(), d={_id:id, i:q[2]};
		for(n in j) if(n!=='c') d[n]=j[n];
		await getTbl(q,c).insertOne(d);
		dbLog(c, LOG_IN, id, t, j.c, {n:j.n, l:j.l});
		return 1;
	case 'ln': //New Loc [cid, {n:name, p:parent, v:vars}]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		asType(q,2,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[2], LocDataFmt);
		id=(await UUID.genUUID(null,c.m)).toString(), d={_id:id};
		for(n in j) if(n!=='c') d[n]=j[n];
		await getTbl(q,c).insertOne(d);
		dbLog(c, LOG_LN, id, t, j.c, {n:j.n});
		return 1;
	//---- Update ----
	case 'cu': //Cat Update [id, {n:name, h:trackHistory, v:catVars}]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad ID";
		asType(q,2,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[2], CatDataFmt, 1);
		d=await Cat.updateOne({_id:q[1]}, dbSet(j));
		if(d.modifiedCount !== 1) {await loadCats(); throw "Cat not found"}
		if(j.n!=null) c.n=j.n;
		if(j.h!=null) c.h=j.h;
		return 1;
	case 'pu': //Part Update [id, {n:name, d:desc, m:mfg, s:subId, c:cmnt, cv:catVars, sv:subVars, v:vars}]
		if(q.length !== 3) throw "Bad Args";
		c=catFromID(q[1]);
		asType(q,2,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[2], ItmDataFmt, 1);
		d=await getTbl(q,c).updateOne({_id:q[1]}, dbSet(j));
		if(d.modifiedCount !== 1) throw "Part not found";
		//TODO Update name in history log if name changed?
		return 1;
	//case 'iu': case 'lu': //Update Part/Inv/Loc
	//case 'im': case 'lm': //Move Inv/Loc
	//case 'ia': //Adjust Inv Stock
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
	if(!cat.h) return;
	try {
		let d=new Date(), id=(await UUID.genUUID(null,cat.m)).toString();
		d={_id:id, t:type, d:d, e:eid};
		if(t) d.u=t._id;
		if(data) for(let k in data) d[k]=data[k];
		if(cmnt) d.c=cmnt;
		await cat.log.insertOne(d);
	} catch(e) {err(e)}
}

function endReq(res,r,e) {
	/*if(re.pn == '/up') { //Log to file
		let s=`[${date()}] ${re.un||"Anonymous"} Update `+re.qr;
		if(e) s+=" Failed: "+e;
		else if(re.ld) s+=' '+(Array.isArray(re.ld)?'['+re.ld.join(', ')+']':JSON.stringify(re.ld));
		fs.writeFile("db.log",s+'\n',{flag:'a'},e=>{if(e) msg(chalk.red(e.stack))});
	}*/
	if(e) err(e);
	else if(r===2) return;
	else if(r===3) {
		res.writeHead(410,'',{'set-cookie':"k=;Max-Age=0"});
		return res.end("Expired Token");
	} else {
		let t=typeof r;
		if(t==='object') r=JSON.stringify(r);
		else if(t!=='string') r=r.toString();
		print(chalk.dim(r!==1?`(${r.length}) `+
			(r.length>MaxLogLen?r.slice(0,MaxLogLen)+'...':r):"Done"));
	}
	res.writeHead(e?500:200,''), res.end(e?e.toString():r);
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
		print("Token for", chalk.yellow(Tkn[k].e), "issued", d, "AGE IS", n-d, "OF", TknExp);
		//TODO Update exp date based on last db cmd call
		if(n-d >= TknExp) await delTkn(k).catch(err);
	}
}

async function genTkn() {
	let u=await UUID.genUUID(), r=await UUID.randBytes(24);
	return u.toString()+r.toString('base64url');
}
async function delTkn(k) {
	let t=Tkn[k];
	if(!t) throw "Token Not Found"; delete Tkn[k];
	msg("Token", chalk.magenta(k), "for", chalk.yellow(t.e), "expired");
	t=await DB.u.updateOne({_id:t._id}, {$pull:{k:k}});
	if(t.modifiedCount !== 1) throw "User not found";
}

async function loginFail(e) {
	//Random delay to prevent timing attacks
	await utils.delay(utils.rand(500,3000));
	throw e||"Incorrect email or password";
}

async function getAuth(req,q) {
	let t,b;
	if(Conf.auth === 'wildapricot') {
		if(!q.code) throw "Bad Auth";
		let d=JSON.parse(await httpReq(TknUri, 'POST', {
			'content-type':'application/x-www-form-urlencoded',
			authorization:"Basic "+Buffer.from(Conf.apiKey).toString('base64')
		}, `grant_type=authorization_code&code=${q.code}&client_id=${CID}&redirect_uri=${RDU}&scope=auto`)),
		a=d.access_token, x=d.expires_in;
		t={u:d.Permissions[0].AccountId};
		if(!a || !(x>0) || !t.u) throw "Bad WA Token";
		//WA User Data
		d=JSON.parse(await httpReq(UsrInfoUri+t.u+'/contacts/me', 'GET', {authorization:"Bearer "+a}));
		t.e=d.Email, t.n=d.FirstName+d.LastName.charAt(0);
		if(Conf.debug) print("WA Auth",d,t);
	} else if(Conf.auth === 'builtin') {
		if(!q.u || !q.p) throw "Bad Auth";
		try {schema.checkSchema({e:q.u},UsrDataFmt,1)} catch(e) {throw "Bad Email"}
		t={e:q.u, p:q.p}, b=1;
	} else {
		throw "No Login System";
	}
	t.e=t.e.trim().toLowerCase();
	let k=await genTkn();
	await dbLock(req);
	let u=await DB.u.findOne({e:t.e});
	if(u) { //Login
		let r={$push:{k:k}};
		if(b) {
			if(q.s) await loginFail("Account already exists");
			if(!await ar2.verify(u.p, t.p)) await loginFail();
		}
		r=await DB.u.updateOne({_id:u._id}, r);
		if(r.modifiedCount !== 1) throw "Unknown error";
	} else { //New User
		if(b && !q.s) await loginFail();
		let id=(await UUID.genUUID()).toString();
		u={_id:id, e:t.e, c1:WS.c1, c2:WS.c2, k:[k]};
		if(b) {
			let n=t.e.slice(0,t.e.indexOf('@')), x=n.indexOf('.');
			u.n=n.charAt(0).toUpperCase()+(x!==-1 ? n.slice(1,x)+n.charAt(x+1).toUpperCase() : n.slice(1));
			u.p=await ar2.hash(t.p, {hashLength:48});
		} else u.n=t.n;
		await DB.u.insertOne(u);
	}
	//Cache user info wo/ sensitive keys
	delete u.k, delete u.p;
	Tkn[k]=u;
	dbUnlock(req);
	return k;
}

//============================================== Support ==============================================

function err(e) {console.error(chalk.red(e.stack||e))}
function msg() {
	let d=utils.formatDate(new Date(), LogDateFmt);
	Array.prototype.splice.call(arguments,0,0,chalk.green(`[${d}]`));
	print(...arguments);
}

async function httpReq(uri, meth, hdr, body) {
	let r={method:meth}; if(hdr) r.headers=hdr; if(body) r.body=body;
	r=await fetch(new Request(uri,r)); let b=await r.text();
	if(r.status!==200) {
		let q=uri.indexOf('?'); if(q!==-1) uri=uri.slice(0,q);
		throw `Code ${r.status}${b?" "+b:''} @ ${uri}`;
	}
	return b;
}

//TODO Add to Utils.js
Array.prototype.project=function(p) {
	let o,k; for(o of this) for(k of Object.keys(o)) if(!p[k]) delete o[k];
}

//============================================== Main ==============================================

await begin();

const R_CS=/[^\s"]+|""|".*?[^\\]"/g;

process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', async cs => {
	let c=[],m;
	while(m=R_CS.exec(cs)) c.push(m[0].startsWith('"')?JSON.parse(m[0]):m[0]);
	try {print('->',await dbCmd(c))}
	catch(e) {print('->',chalk.red(e.stack||e))}
});