//NLDB ©2021 Pecacheu. GNU GPL v3.0
const VERSION='v1.2.3';

import router from './router.js'; import uuid from './uuid.js';
import https from 'https'; import chalk from 'chalk'; import pg from 'pg';
import fs from 'fs'; import url from 'url';
let DB, SrvIp;

//Config Options:
const Debug=0, Port=50, Path="/web", ReqTimeout=5000, UExp=8*3600,
DbOpt = {host:'localhost',user:'postgres',database:'nldb',password:'petepass'},
SrvOpt = {key:fs.readFileSync('../keys/privkey.pem'), cert:fs.readFileSync('../keys/fullchain.pem')};

//Auth Keys:
const AKey=fs.readFileSync('apikey','utf-8').split(':'), AuthUri="https://oauth.wildapricot.org/auth/token",
PtlUri=`https://portal.nova-labs.org/sys/login/OAuthLogin?client_id=${AKey[0]}&scope=auto&redirect_uri=`,
ApiUri="https://api.wildapricot.org/v2/accounts/";

export function begin(ips) {
	console.log(chalk.yellow("NLDB "+VERSION));
	SrvIp=(ips?ips[0]:'localhost'); if(Debug == 2) router.debug=Debug;
	DB=new pg.Client(DbOpt); DB.connect().then(() => {
		console.log("Connected to DB!"); initSrv(); runInput();
	});
}

function initSrv() {
	https.createServer(SrvOpt, (rq,re) => {
		if(Debug) console.log("[ROUTER]",rq.url);
		onReq(rq,re).then(r => {if(r) router.handle(Path,re,rq)})
			.catch(e => res(re,0,e)).finally(() => dbUnlock(rq));
	}).listen(Port, () => {
		console.log("Listening at "+chalk.bgGreen('https://'+SrvIp+':'+Port));
	});
}

//============================================== Requests ==============================================

let Lock, Cat, RDU, Tkn={};
const SP=/'/g, TP=/-/g, TVal=/^[a-z][a-z0-9_]{0,63}$/, AS="select * from ",
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

async function onReq(rq,re) {
	let u=url.parse(rq.url), pn=u.pathname;
	if(pn == '/db') {
		let ua,q=u.query.split(';'),c,t,d;
		for(let i=1,l=q.length; i<l; i++) q[i]=decodeURIComponent(q[i]);
		await dbLock(rq); console.log("DB Req:",q); ua=cAuth(rq);
		switch(q[0]) {
		case 'a': //List All
			if(!Cat) await tCat();
			d={}; for(let i=0,l=Cat.length,c,dr; i<l; i++) {
				dr=(await dbReq(`select t from tcat.${c=Cat[i]} where i=-1`))[0].t;
				if(dr != null) dr='c'+dr;
				d[c]=await dbReq(`select id,s,n${(dr?','+dr:'')} from itm.${c} order by n`);
				d[c].forEach(e => {e.d=e[dr],delete e[dr]}); //Swap e[dr] -> e.c
			}
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
			res(re,0);
		break; case 'c': //Category
			RA(ua), c=qt(q[1]);
			try {res(re,await Promise.all([dbReq(AS+`tcat.${c} order by i`), gSub(c)]))}
			catch(e) {if(e.toString().endsWith('exist')) res(re,0); else throw e}
		break; case 's': //Subcat
			RA(ua); try {res(re,[await dbReq(AS+`tsub.${qt(q[1])} order by i`)])}
			catch(e) {if(e.toString().endsWith('exist')) res(re,0); else throw e}
		break; case 'n': //New Item
			RA(ua), c=qt(q[1]); console.log("Generating UUID");
			try {t=await uuid.genUUID()} catch(e) {throw "UUID "+e}
			await dbReq(`insert into itm.${c}(id) values ('${t}')`);
			res(re,'"'+t+'"');
		break; case 'nc': case 'ns': //New Cat
			RA(ua), c=qt(q[1]), t=q[0]=='nc', d=c.indexOf('0');
			if(t) {if(d!=-1) throw "Bad Cat "+c} else { //Check for Sub
				if(!Cat) await tCat(); let n=c.substr(0,d);
				if(d==-1 || Cat.indexOf(n)==-1) throw "Bad Cat "+n;
			}
			d=(t?'tcat.':'tsub.')+c;
			try {await dbReq('begin'); //Start transaction
			await dbReq(`create table ${d} (i smallint, n varchar(255), t smallint, v text, primary key(i))`);
			if(t) await Promise.all([dbReq(`insert into ${d} values(-1)`), dbReq(`create table itm.${c} (id char(11), s varchar(255), n varchar(255), u varchar(255)[], t smallint[], v text[], primary key(id))`)]);
			await dbReq('commit'); res(re,0); //End transaction
			if(t) await tCat();
			} catch(e) {await dbReq('rollback');throw e}
		/*break; case 'cn': case 'sn': //Rename Cat
			//if(!Cat) await tCat();
			let c=q[0]=='cn', s=c?'tcat.':'tsub.', to=qt(q[1]), tn=qt(q[2]);
			await dbReq(`alter table ${s+to} rename to ${tn}`);
			if(c) await dbReq(`alter table itm.${to} rename to ${tn}`);
			//await dbReq(`alter table itm.${to} rename to ${tn}`);
			res(re,0);*/
		break; default:
			throw "Inval Request";
		}
	} else if(pn == '/up') {
		if(rq.method != 'POST') throw "Upload must be POST!";
		let t=u.query, d=JSON.parse(await rqData(rq)),c;
		await dbLock(rq); console.log("Update Req:",t,d); RA(cAuth(rq));
		switch(t) {
		case 'i': //Update Item:
			c=qt(d.c); if(d.s!=null) { //Check for Sub
				if(!Cat) await tCat(); d.s=qt(d.s);
				if(d.s.indexOf('0')!=-1 || (await gSub(c)).indexOf(d.s)==-1) throw "Bad Sub "+d.s;
			}
			if(d.u || d.t || d.v) { //Check Custom
				t=d.t.length; if(d.u.length!=t || d.v.length!=t) throw "Length Mismatch!";
			}
			t=[]; for(let k in d) if(k!='c'&&k!='id') t.push(li(k,d[k]));
			await uReq(`update itm.${c} set ${t.join()} where id=${qs(d.id)}`);
			res(re,0);
		break; case 'c': case 's': //Update Cat:
			if(d.length!=2 || !Array.isArray(d[1])) throw "Bad Format";
			t=t=='c'?1:0, c=qt(d[0]); let ct=(t?'tcat.':'tsub.')+c, p=t?'c':'s', l=d[1].length,
			od=await dbReq(`select i,n from ${ct} order by i`), ol=od.length; d=d[1];
			try {await dbReq('begin'); //Start transaction
			if(t) await uReq(`update ${ct} set t=${qs(d[0].t,1)} where i=-1`); //Cat
			else c=c.substr(0,c.indexOf('0')); //Sub
			//Test Values:
			for(let n=t,e; n<l; n++) e=d[n],e.nv=qs(e.n),e.t=qs(e.t),e.v=qs(e.v,1);
			//Add Rows:
			for(let n=t,i,e,o,r; n<l; n++) {
				e=d[n],i=n-t; console.log("Set Row "+i);
				if(n>=ol) r=[uReq(`insert into ${ct} values (${i},${e.nv},${e.t},${e.v})`),
					dbReq(`alter table itm.${c} add if not exists ${p+i} text`)];
				else r=[uReq(`update ${ct} set n=${e.nv},t=${e.t},v=${e.v} where i=${i}`)];
				if((o=nFind(od,e.n))!=-1 && o!=n) { //Swap Columns:
					e.s=od[o], e.o=o-t; console.log("Col Swap",e.n,o,'<->',n);
					r.push(dbReq(`update itm.${c} set ${p+i}=${p+e.o}, ${p+e.o}=${p+i}`));
					od[o]=od[n],od[n]=e.s;
				}
				await Promise.all(r);
			}
			//Delete Rows:
			console.log("Check Rem",l,ol); if(ol>l) {
				l-=t,ol-=t; await uReq(`delete from ${ct} where i between ${l} and ${ol-1}`,1);
				if(!t) { //Calc Max Sub Col:
					let sc=await gSub(c), n=ct.substr(ct.indexOf('0')+1);
					for(let i=0,h=sc.length,s; i<h; i++) if((s=sc[i])!=n) {
						s=(await dbReq(`select i from tsub.${c}0${s}`)).length; if(s>l) l=s;
					}
					console.log("Max Sub-Cat",l);
				}
				for(let i=l; i<ol; i++) await dbReq(`alter table itm.${c} drop ${p+i}`);
			}
			await dbReq('commit'); res(re,0); //End transaction
			} catch(e) {await dbReq('rollback');throw e}
		break; default:
			throw "Inval Update";
		}
	} else if(pn == '/login') {
		console.log("Login Redirect"); RDU=encodeURIComponent('https://'+rq.headers.host+'/auth');
		re.writeHead(307,{Location:PtlUri+RDU+"&state="+encodeURIComponent(u.query)}); re.end();
	} else if(pn == '/auth') {
		let k,q=fromQuery(u.query), c=';Secure;Max-Age='+UExp, l='/?'+decodeURIComponent(q.state);
		console.log("Auth User",q); if(!q.code || !RDU) throw "Bad Auth"; k=await getAuth(q.code);
		re.writeHead(307, ['Location',l,'Set-Cookie','dbtkn='+k+c,'Set-Cookie','dbusr='+Tkn[k].us+c]);
		re.end();
	} else return 1;
}

function nFind(t,n) {for(let i=0,l=t.length; i<l; i++) if(t[i].n==n) return i; return -1}
async function gSub(c) {
	let s=await dbReq(TS+`'tsub' and tablename like '${c}0%'`), r=c.length+1;
	s.forEach((e,i) => s[i]=e.tablename.substr(r)); return s;
}
async function tCat() {
	let r=await dbReq(TS+"'tcat'"); Cat=[];
	r.forEach((e,i) => Cat[i]=e.tablename);
}

//============================================== User Auth ==============================================

function RA(a) {if(!a) throw "Authentication Required!"}
function cAuth(rq) {
	let t=rq.headers.cookie, k=getCookie(t,'dbtkn'), u=getCookie(t,'dbusr');
	if(!k) return; if(!(t=Tkn[k]) || u!=t.us) throw "Expired Token!";
	console.log("Token:",k,"User:",chalk.yellow(t.n)); return 1;
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
	console.log("Token:",k,"User:",chalk.yellow(t.n=t.d.FirstName+' '+t.d.LastName),t);
	t.us=t.d.FirstName.substr(0,1)+t.d.LastName.substr(0,1);
	setTimeout(() => {delete Tkn[k];console.log("User Exp",t.n)}, UExp*1000);
	Tkn[k]=t; return k;
}

//============================================== Helper Functions ==============================================

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

//From Utils.js
function fromQuery(str) {
	if(str.startsWith('?')) str=str.substr(1);
	function parse(params, pairs) {
		const pair=pairs[0], spl=pair.indexOf('='),
		key=decodeURIComponent(pair.substr(0,spl)),
		value=decodeURIComponent(pair.substr(spl+1));
		if(params[key] == null) params[key] = value;
		else if(typeof params[key] == 'array') params[key].push(value);
		else params[key] = [params[key],value];
		return pairs.length == 1 ? params : parse(params, pairs.slice(1));
	} return str.length == 0 ? {} : parse({}, str.split('&'));
}

//From Utils.js
function getCookie(cl,n) {
	let n2=' '+n; if(!cl) return null; cl=cl.split(';');
	for(let i=0,l=cl.length,c,e,s; i<l; i++) {
		c=cl[i], e=c.indexOf('='); s=c.substr(0,e);
		if(s==n || s==n2) return decodeURIComponent(c.substr(e+1));
	}
	return null;
}

async function dbLock(l) {
	if(Lock && Lock.l!=l) await Lock.p;
	Lock={l:l}; Lock.p=new Promise(r=>Lock.r=r);
}
function dbUnlock(l) {if(Lock && Lock.l==l) Lock.r(),Lock=0}

function uReq(q) {return dbReq(q,1).then(r => {if(r.rowCount<1) throw "Update Failed"})}
function dbReq(q,nr) {console.log(chalk.cyan(q)),q=DB.query(q);return nr?q:q.then(r => r.rows)}
function res(re,r,e) {
	if(typeof r=='object') r=JSON.stringify(r);
	let hd; if(e) {
		console.log(chalk.red(e.stack||e)); if(e.toString().startsWith('Expired'))
			hd=['Set-Cookie','dbtkn=0;Max-Age=0','Set-Cookie','dbusr=0;Max-Age=0'];
	} else console.log(chalk.dim(r||null));
	re.writeHead(e?500:200,hd), re.end(e?e.toString():r);
}

function rqData(rq) {
	return new Promise(r => {
		let d=''; rq.setEncoding('utf8');
		rq.on('data',c => d+=c); rq.on('end',() => r(d));
	});
}

function runInput() {
	console.log("Type 'q' to quit.");
	process.stdin.resume(); process.stdin.setEncoding('utf8');
	process.stdin.on('data', cmd => {
		for(let s; (s=cmd.search(/[\n\r]/)) != -1;) cmd=cmd.substring(0,s);
		if(cmd == 'exit' || cmd == 'q') {
			console.log(chalk.magenta("Exiting...")); process.exit();
		}
	});
}