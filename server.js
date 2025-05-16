//NLDB, Pecacheu 2025. GNU GPL v3
const VER='v2.0 a1';

import fs from 'fs/promises';
import http from 'http';
import https from 'https';
//import {exec} from 'child_process';
import chalk from 'chalk';
import mdb from 'mongodb';
import router from './router.js';
import UUID from './uuid.js';

const Path="/web",
/*
ReqTimeout=5000,
UExp=8*3600,
MaxUpload=10000000, //10MB
*/
MaxLogLen=700,
/*
Perms = JSON.parse(fs.readFileSync('perms.json'));

//Auth Keys:
const AKey=fs.readFileSync('apikey','utf8').split(':'), AuthUri="https://oauth.wildapricot.org/auth/token",
PtlUri=`https://portal.nova-labs.org/sys/login/OAuthLogin?client_id=${AKey[0]}&scope=auto&redirect_uri=`,
ApiUri="https://api.wildapricot.org/v2/accounts/";
*/
LogDateFmt={sec:true, suf:false, year:false, df:true},
Conf=JSON.parse(await fs.readFile('config.json')),
SrvOpt=Conf.sslKey?{key:await fs.readFile(Conf.sslKey), cert:await fs.readFile(Conf.sslCert)}:null,
print=console.log, CL=[];
let DB, Cat, Lock; //RDU, Tkn={};

if(Conf.debug>1) router.debug=1;

async function begin() {
	const ips=utils.getIPs(), [sysOS, arch, cpu]=utils.getOS(), srvIP=ips?ips[0]:'localhost';
	print("IP:",ips,`OS: ${sysOS}, ${arch}\nCPU: ${cpu}\n`);

	print(chalk.yellow(`NLDB ${VER}`));
	if(sysOS !== 'Linux') {
		print(chalk.yellow(chalk.underline("Warning: Thumbnail generation via ImageMagick only supported on Linux")));
	}
	//TODO else setup ImageMagick stuff

	print("Loading database...");
	DB = new mdb.MongoClient(Conf.dbUri).db('nldb');
	Cat = DB.collection('cat');
	for await(let c of Cat.find()) loadCat(new UUID(c._id).toString());

	const rqCb=async (rq,re) => {
		if(Conf.debug) msg("[REQ]",rq.url);
		let r,err;
		try {(r=await onReq(rq,re))} catch(e) {err=e} finally {
			dbUnlock(rq); if(r||err) res(re,r,err); else router.handle(Path,re,rq);
		}
	}
	(SrvOpt?https.createServer(SrvOpt, rqCb):http.createServer(rqCb)).listen(Conf.port, () => {
		print("Listening at "+chalk.bgGreen(`http${SrvOpt?'s':''}://${srvIP}:${Conf.port}`));
	});
}

//============================================== Requests ==============================================

/*
const FN=/[^\w.]/, SP=/'/g, TP=/-/g, TVal=/^[a-z][a-z0-9_]{0,63}$/, AS="select * from ",
TS="select tablename from pg_catalog.pg_tables where schemaname=";
function qs(s,n) {
	if(typeof s=='number') return s;
	if(!s) { if(n) return null; throw "Bad Param "+s; }
	return "'"+s.toString().replace(SP,"''")+"'";
}
function qt(s) {
	if(!s || typeof s!='string' || !TVal.test(s=s.replace(TP,'0')))
		throw "Bad Name "+s; return s;
}
function ql(a) {
	let s='',i=0,l=a.length; if(!l) return null;
	for(; i<l; i++) s+=(s?',':'')+qs(a[i],1); return 'array['+s+']';
}
function li(k,v) {return qt(k)+'='+(Array.isArray(v)?ql(v):qs(v,1))}
*/
async function onReq(req, res) {
	let u=new URL(req.url,'http://a'), pn=u.pathname;
	res.pn=pn, res.q=u.search;
	if(pn === '/db') { //DB Cmd
		if(res.q.length < 2) throw "Bad args";
		let q=res.q.slice(1).split(';');
		q.forEach((r,i) => q[i]=decodeURIComponent(r));
		return await dbCmd(q);
	}
/*		let ua,q=u.query.split(';'),c,t,d;
		for(let i=1,l=q.length; i<l; i++) q[i]=decodeURIComponent(q[i]);
		await dbLock(rq); msg("DB Req:",q); ua=cAuth(rq); if(ua) re.un=ua.n;
		switch(q[0]) {
		break; case 'a': //Cat Summary
			c=qt(q[1]), t=(await dbReq(`select t from tcat.${c} where i=-1`))[0].t;
			if(t!=null) t='c'+t;
			d=await dbReq(`select id,s,n,ico${(t?','+t:'')} from itm.${c} order by s,n`);
			d.forEach(e => {e.d=e[t],delete e[t]}); //Swap e[t] -> e.d
			res(re,d);
		break; case 'l': //List Cat
			c=qt(q[1]), t=await Promise.all([
				dbReq(`select n from tcat.${c} where i>=0 order by i`),
				dbReq(AS+`itm.${c} order by n`)]);
			t[0].forEach((e,i) => {t[0][i]=e.n});
			t[1].forEach(e => {delete e.u,delete e.t,delete e.v});
			res(re,t);
		break; case 'i': //Get Item
			if(!Cat) await tCat();
			t=qs(q[1]); if(t.length != 13) throw "Bad ID";
			for(let i=0,l=Cat.length,c,e; i<l; i++) {
				c=Cat[i], e=await dbReq(AS+`itm.${c} where id=${t}`);
				if(!e.length) continue; e=e[0];
				let p=[dbReq(AS+`tcat.${c} order by i`), gSub(c)];
				if(e.s) p[2]=dbReq(AS+`tsub.${c}0${e.s} order by i`);
				p=await Promise.all(p);
				return res(re,{e:e,c:c,cat:Cat,cl:p[0],sl:e.s?p[2]:[],sc:p[1]});
			}
			res(re);
		break; case 'c': //Category
			RA(ua,1), c=qt(q[1]);
			try {res(re,await Promise.all([dbReq(AS+`tcat.${c} order by i`), gSub(c)]))}
			catch(e) {if(e.toString().endsWith('exist')) res(re); else throw e}
		break; case 's': //Subcat
			RA(ua,1); try {res(re,[await dbReq(AS+`tsub.${qt(q[1])} order by i`)])}
			catch(e) {if(e.toString().endsWith('exist')) res(re); else throw e}
		break; case 'n': //New Item
			RA(ua,1), c=qt(q[1]); log("Generating UUID");
			try {t=await uuid.genUUID()} catch(e) {throw "UUID "+e}
			await dbReq('begin'); try { //Start transaction
				await dbReq(`insert into itm.${c}(id) values ('${t}')`);
				if(q[2]) { //Copy from item
					let cpy=qs(q[2]), e=(await dbReq(AS+`itm.${c} where id=${cpy}`))[0], l=[];
					for(let k in e) if(k!='id'&&k!='n') l.push(li(k,e[k]));
					await uReq(`update itm.${c} set ${l.join()} where id='${t}'`);
				}
				await dbReq('commit'); res(re,'"'+t+'"'); //End transaction
			} catch(e) {await dbReq('rollback');throw e}
		break; case 'nc': case 'ns': //New Cat
			c=qt(q[1]), t=q[0]=='nc', d=c.indexOf('0'), RA(ua,t?3:2);
			if(t) {if(d!=-1) throw "Bad Cat "+c} else { //Check for Sub
				if(!Cat) await tCat(); let n=c.substr(0,d);
				if(d==-1 || Cat.indexOf(n)==-1) throw "Bad Cat "+n;
			}
			d=(t?'tcat.':'tsub.')+c;
			await dbReq('begin'); try { //Start transaction
				await dbReq(`create table ${d} (i smallint, n varchar(255), t smallint, v text, primary key(i))`);
				if(t) await Promise.all([dbReq(`insert into ${d} values(-1)`), dbReq(`create table itm.${c} (id char(11), s varchar(255), n varchar(255), u varchar(255)[], t smallint[], v text[], ico varchar(255), primary key(id))`)]);
				await dbReq('commit'); res(re); //End transaction
				if(t) await tCat();
			} catch(e) {await dbReq('rollback');throw e}
		/*break; case 'cn': case 'sn': //Rename Cat
			//if(!Cat) await tCat();
			let c=q[0]=='cn', s=c?'tcat.':'tsub.', to=qt(q[1]), tn=qt(q[2]);
			await dbReq(`alter table ${s+to} rename to ${tn}`);
			if(c) await dbReq(`alter table itm.${to} rename to ${tn}`);
			//await dbReq(`alter table itm.${to} rename to ${tn}`);
			res(re);*
		break; default:
			throw "Inval Request";
		}
	} else if(pn == '/up') {
		if(rq.method != 'POST') throw "Upload must be POST!";
		let t=re.qr, up=t.startsWith('u'), d=await rqData(rq),c,e;
		if(d.length>MaxUpload) throw "File too large! Max is 10MB.";
		if(!up) d=JSON.parse(d),await dbLock(rq);
		msg("Update Req:",t,up?d.length:d); c=cAuth(rq); if(c) re.un=c.n; RA(c,2);
		if(up) { //Upload File
			if(t.length<4 || t.length>100 || FN.test(t)) throw "Bad Name";
			t=Path.substr(1)+'/u/'+t.substr(1); log("Writing",t);
			await fs.promises.writeFile(t,d);
			if(t.endsWith('.heic')) {
				let nf=ext(t).f+'.jpg'; log("Converting",nf);
				await runCmd(`convert ${t} -quality 85% ${nf}`);
				log("Erasing Temp"); await fs.promises.rm(t);
			}
			return res(re);
		}
		switch(t) {
		case 'i': //Update Item:
			c=qt(d.c); if(d.s!=null) { //Check for Sub
				if(!Cat) await tCat(); d.s=qt(d.s);
				if(d.s.indexOf('0')!=-1 || (await gSub(c)).indexOf(d.s)==-1) throw "Bad Sub "+d.s;
			}
			if(d.u || d.t || d.v) { //Check Custom
				t=d.t.length; if(d.u.length!=t || d.v.length!=t) throw "Length Mismatch!";
			}
			up=qs(d.id), t=[], re.ld=[], e=(await dbReq(AS+`itm.${c} where id=${up}`))[0];
			for(let k in d) {
				if(d[k]!=null && d[k].length===0) d[k]=null;
				if(k!='c' && k!='id' && d[k]!=e[k])
					t.push(li(k,d[k])),re.ld.push(`${k}:${e[k]}->${d[k]}`);
			}
			if(t.length) await uReq(`update itm.${c} set ${t.join()} where id=${qs(d.id)}`);
			res(re);
		break; case 'c': case 's': //Update Cat:
			if(d.length!=2 || !Array.isArray(d[1])) throw "Bad Format";
			t=t=='c'?1:0, c=qt(d[0]); let ct=(t?'tcat.':'tsub.')+c, p=t?'c':'s', l=d[1].length,
			od=await dbReq(`select i,n from ${ct} order by i`), ol=od.length; d=d[1];
			for(let n=t,e; n<l; n++) { //Test Values
				e=d[n],e.nv=qs(e.n),e.t=qs(e.t),e.v=qs(e.v,1);
				if(TL(e.n)=='name' || nFind(d,e.n)!=n) throw "Dup Name "+e.n;
			}
			await dbReq('begin'); try { //Start transaction
			if(t) await uReq(`update ${ct} set t=${qs(d[0].t,1)} where i=-1`); //Cat
			else c=c.substr(0,c.indexOf('0')); //Sub
			//Add Rows:
			for(let n=t,i,e,o,r; n<l; n++) {
				e=d[n],i=n-t; log("Set Row "+i);
				if(n>=ol) r=[uReq(`insert into ${ct} values (${i},${e.nv},${e.t},${e.v})`),
					dbReq(`alter table itm.${c} add if not exists ${p+i} text`)];
				else r=[uReq(`update ${ct} set n=${e.nv},t=${e.t},v=${e.v} where i=${i}`)];
				if((o=nFind(od,e.n))!=null && o!=n) { //Swap Columns:
					e.s=od[o], e.o=o-t; log("Col Swap",e.n,o,'<->',n);
					r.push(dbReq(`update itm.${c} set ${p+i}=${p+e.o}, ${p+e.o}=${p+i}`));
					od[o]=od[n],od[n]=e.s;
				}
				await Promise.all(r);
			}
			//Delete Rows:
			log("Check Rem",l,ol); if(ol>l) {
				l-=t,ol-=t; await uReq(`delete from ${ct} where i between ${l} and ${ol-1}`,1);
				if(!t) { //Calc Max Sub Col:
					let sc=await gSub(c), n=ct.substr(ct.indexOf('0')+1);
					for(let i=0,h=sc.length,s; i<h; i++) if((s=sc[i])!=n) {
						s=(await dbReq(`select i from tsub.${c}0${s}`)).length; if(s>l) l=s;
					}
					log("Max Sub-Cat",l);
				}
				for(let i=l; i<ol; i++) await dbReq(`alter table itm.${c} drop ${p+i}`);
			}
			await dbReq('commit'); res(re); //End transaction
			} catch(e) {await dbReq('rollback');throw e}
		break; default:
			throw "Inval Update";
		}
	}*/ else if(pn == '/login') {
		//msg("Login Redirect"); RDU=encodeURIComponent('https://'+rq.headers.host+'/auth');
		//re.writeHead(307,{Location:PtlUri+RDU+"&state="+encodeURIComponent(u.query)}); re.end();
		//TODO TEMP REDIRECT SKIP AUTH
		let k='testtkn', c=';Secure;Max-Age='+UExp, t=Tkn[k]={n:"Test User", us:"TU", d:{Email:"test@example.com"}};
		log("Token:",k,"User:",chalk.yellow(t.n),t);
		re.writeHead(307, ['Location','/','Set-Cookie','dbtkn='+k+c,'Set-Cookie','dbusr='+t.us+c]);
		re.end();
	} /*else if(pn == '/auth') {
		let k,q=fromQuery(u.query), c=';Secure;Max-Age='+UExp,
		s=decodeURIComponent(q.state), l='/'+(s!='null'?'?'+s:'');
		msg("Auth User",q); if(!q.code || !RDU) throw "Bad Auth"; k=await getAuth(q.code);
		re.writeHead(307, ['Location',l,'Set-Cookie','dbtkn='+k+c,'Set-Cookie','dbusr='+Tkn[k].us+c]);
		re.end();
	}*/
}
/*
function TL(s) {return s?s.toLowerCase():s}
function nFind(t,n) {n=TL(n);return t.each((d,i) => TL(d.n)==n?i:null)}
async function gSub(c) {
	let s=await dbReq(TS+`'tsub' and tablename like '${c}0%'`), r=c.length+1;
	s.each((e,i) => {s[i]=e.tablename.substr(r)}); return s;
}
async function tCat() {
	let r=await dbReq(TS+"'tcat'"); Cat=[];
	r.each((e,i) => {Cat[i]=e.tablename});
}*/

//============================================== Database ==============================================

const NameFmt=/[A-Z][\w\- ]*\w/;

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

//Convert _id into UUID
function fromDbId(doc) {
	doc.id = new UUID(doc._id).toString();
	delete doc._id;
}
function toDbId(id) {return new UUID(id).toLong()}

async function dbCmd(q) {
	msg("[CMD]",q);
	let id,c,d;
	switch(q[0]) {
	//---- Read ----
	case 'cl': //List Cat
		d=await Cat.find({}, {sort: ['n'], projection: {_id:1, n:1}}).toArray();
		for(c of d) fromDbId(c);
		return d;
	//TODO
	//---- Update ----
	//TODO
	//---- Create ----
	case 'nc': //New Cat
		if(q.length !== 2) throw "Bad args";
		if(!NameFmt.test(q[1])) throw "Bad name";
		id=await UUID.genUUID();
		await Cat.insertOne({_id:id.toLong(), n:q[1]});
		loadCat(id.toString());
		return 1;
	case 'ns': //New SubCat
		if(q.length !== 3) throw "Bad args";
		if(q[1].length !== UUID.LEN) throw "Bad ID";
		if(!NameFmt.test(q[2])) throw "Bad name";
		id=await UUID.genUUID();
		d=await Cat.updateOne({_id:toDbId(q[1])}, {$push: {s:{_id:id.toLong(), n:q[2]}}});
		if(d.modifiedCount !== 1) throw "Cat not found";
		return 1;
	//case 'np': //New Part
	//case 'ni': //New Item
	//TODO
	//---- Delete ----
	//TODO
	default:
		throw "Unknown cmd";
/*
			await dbReq(`create table ${d} (i smallint, n varchar(255), t smallint, v text, primary key(i))`);
			if(t) await Promise.all([dbReq(`insert into ${d} values(-1)`), dbReq(`create table itm.${c} (id char(11), s varchar(255), n varchar(255), u varchar(255)[], t smallint[], v text[], ico varchar(255), primary key(id))`)]);
			await dbReq('commit'); res(re); //End transaction
			if(t) await tCat();
		} catch(e) {await dbReq('rollback');throw e}*/
	}
}


//function uReq(q) {return dbReq(q,1).then(r => {if(r.rowCount<1) throw "Update Failed"})}
//function dbReq(q,nr) {log(chalk.cyan(q)),q=DB.query(q);return nr?q:q.then(r => r.rows)}
function res(re,r,e) {
	/*if(re.pn == '/up') { //Log to file
		let s=`[${date()}] ${re.un||"Anonymous"} Update `+re.qr;
		if(e) s+=" Failed: "+e;
		else if(re.ld) s+=' '+(Array.isArray(re.ld)?'['+re.ld.join(', ')+']':JSON.stringify(re.ld));
		fs.writeFile("db.log",s+'\n',{flag:'a'},e=>{if(e) msg(chalk.red(e.stack))});
	}*/
	if(typeof r=='object') r=JSON.stringify(r);
	let hd;
	if(e) {
		print(chalk.red(e.stack||e));
		if(e.toString().startsWith('Expired')) hd=['Set-Cookie','dbtkn=0;Max-Age=0',
			'Set-Cookie','dbusr=0;Max-Age=0'];
	} else print(chalk.dim(r!==1?`(${r.length}) `+
		(r.length>MaxLogLen?r.slice(0,MaxLogLen)+'...':r):"Done"));
	re.writeHead(e?500:200,hd), re.end(e?e.toString():(r||0));
}
/*
function rqData(rq) {
	return new Promise(r => {
		let b=[]; rq.on('data',c => b.push(c));
		rq.on('end',() => r(Buffer.concat(b)));
	});
}

//============================================== User Auth ==============================================

function RA(a,lv) {
	if(!a) throw "Login Required!";
	if(!(a=Perms[a.d.Email]) || !(a>=lv)) throw "Sorry, you have insufficient permissions.";
}
function cAuth(rq) {
	let t=rq.headers.cookie, k=getCookie(t,'dbtkn'), u=getCookie(t,'dbusr');
	if(!k) return; if(!(t=Tkn[k]) || u!=t.us) throw "Expired Token!";
	log("Token:",k,"User:",chalk.yellow(t.n),"Perms:",Perms[t.d.Email]);
	return t;
}

async function getAuth(c) {
	let d=JSON.parse(await httpsReq(AuthUri, 'POST', {
		'Content-type':'application/x-www-form-urlencoded',
		Authorization:"Basic "+Buffer.from(AKey[0]+':'+AKey[1]).toString('base64')
	}, `grant_type=authorization_code&code=${c}&client_id=${AKey[0]}&redirect_uri=${RDU}&scope=auto`)),
	k=d.access_token, x=d.expires_in, t={u:d.Permissions[0].AccountId, r:d.refresh_token};
	if(!k||!t.r||!(x>0)) throw "Bad Token"; if(!t.u) throw "Bad UUID";
	//Get User Data:
	t.d=JSON.parse(await httpsReq(ApiUri+t.u+'/contacts/me', 'GET', {Authorization:"Bearer "+k}));
	log("Token:",k,"User:",chalk.yellow(t.n=t.d.FirstName+' '+t.d.LastName),t);
	t.us=t.d.FirstName.substr(0,1)+t.d.LastName.substr(0,1);
	setTimeout(() => {delete Tkn[k];log("User Exp",t.n)}, UExp*1000);
	Tkn[k]=t; return k;
}*/

//============================================== Support ==============================================

function msg() {
	let d=utils.formatDate(new Date(), LogDateFmt);
	Array.prototype.splice.call(arguments,0,0,chalk.green(`[${d}]`));
	print(...arguments);
}
/*
function httpsReq(uri, mt, hdr, rb) {
	return new Promise((res,rej) => {
		let dat='',tt,re,rq=https.request(uri, {method:mt,headers:hdr}, (r) => {
			re=r; r.setEncoding('utf8'); r.on('data', d => { dat+=d; }); r.on('end', rEnd);
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

function runCmd(cmd) {
	return new Promise((res,rej) => exec(cmd, (e,so,se) => {
		if(e||se) return rej(e||se); res(so);
	}));
}

function ext(s) {
	let n=s.lastIndexOf('.'), d=n==-1;
	return {f:d?s:s.substr(0,n),e:d?'':s.substr(n)};
}
*/
//============================================== Main ==============================================

await begin();

//TODO TEMP
print("Type 'q' to quit.");
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', async cmd => {
	cmd=cmd.replace(/[\n\r].*$/,'');
	try {
		if(cmd == 'exit' || cmd == 'q') print(chalk.magenta("Exiting...")),process.exit();
		else print('->',await dbCmd(cmd.split(' ')));
	} catch(e) {print('->',e)}
});