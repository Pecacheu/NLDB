//NLDB, Pecacheu 2025. GNU GPL v3
const VER='2.0 Beta 4';

import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import chalk from 'chalk';
import mdb from 'mongodb';
import ar2 from 'argon2';
import sharp from 'sharp';
import {RateLimiterMemory} from 'rate-limiter-flexible';
import router from 'raiutils/router';
import schema from 'raiutils/schema';
import UUID from 'raiutils/uuid';
import 'raiutils';

//Load Config
const ConfFmt={
	debug:{t:'int',min:0,max:2,req:false},
	dbUri:{t:'str'},
	host:{t:'str'},
	port:{t:'int',min:0,max:25565},
	sslKey:{t:'str',req:false},
	sslCert:{t:'str',req:false},
	tknExpDays:{t:'float',min:0},
	maxUploadMb:{t:'int',min:0},
	auth:{t:'str',f:"builtin|wildapricot"},
	authUri:{t:'str',req:"auth==='wildapricot'"},
	apiKey:{t:'str',req:"auth==='wildapricot'"}
}, Conf=JSON.parse(await fs.readFile('config.json'));

schema.checkSchema(Conf, ConfFmt);

const TknCheckInt=3600000, //1h
LimWaitPoll=100, //.1s
LimWaitMax=30000/LimWaitPoll, //30s
NameMax=1000,
DataMax=10000,
MaxLogLen=500,
MaxPageSize=2000,
Root=import.meta.dirname,
Path=path.join(Root, "web"),
Utils={"utils.js": path.join(Root, "node_modules/raiutils/utils.min.js")},
LogDateFmt={sec:true, suf:false, year:false, df:true},
SeenFmt={suf:false, year:false, df:true},
//Calc Params
TknExpSec=Conf.tknExpDays*24*3600,
MaxUpload=Conf.maxUploadMb*1000000,
TknExp=TknExpSec*1000,
SrvOpt=Conf.sslKey?{key:await fs.readFile(Conf.sslKey), cert:await fs.readFile(Conf.sslCert)}:null,
print=console.log, Usr={}, Tkn={},
//Colors
C_USR = chalk.yellow, C_TKN = chalk.magenta,
//Rate Limits
AuthLim = new RateLimiterMemory({points:2, duration:4}),
UpLim = new RateLimiterMemory({points:10, duration:1});

//Default Workspace Config
let WS={_id:0, r:true, c1:0xF25D26, c2:0x6ABF40},
LOvr=1, DB, Cat, CatID, CatMagic, Lock,
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
	print("IP:",ips,`OS: ${sysOS}, ${arch}\nCPU: ${cpu}\n\n`+chalk.yellow(`NLDB v${VER}`));

	print("Loading icons...");
	await fs.mkdir(Path+"/u", {recursive:true});
	await sharp(Root+"/logoSml.png").metadata(); //Test Sharp
	await fs.stat(Path+"/logoSml.png").catch(() => {LOvr=0});

	print("Loading database...");
	DB = new mdb.MongoClient(Conf.dbUri).db('nldb');
	Cat = DB.collection('cat'), DB.u = DB.collection('usr');
	WS=(await DB.u.findOne({_id:0})) || (await DB.u.insertOne(WS),WS);
	WS._c=WSCk(), await loadCats();
	for await(let u of DB.u.find()) {
		if(!u._id) continue;
		delete u.p;
		for(let k in u.k) Tkn[k]=u;
		Usr[u._id]=u;
	}
	await DB.u.createIndex({n:'text', e:'text'});
	setInterval(dbLoop, TknCheckInt);
	await dbLoop();

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
		let q=req.method==='POST' ? (await reqData(req)).toString('utf8') : uri.search.slice(1);
		if(q.length < 1) throw "Bad Args";
		q=q.split('&'), q.forEach((r,i) => q[i]=decodeURIComponent(r));
		return await dbCmd(q,req,res);
	} else if(pn === '/login') {
		if(!SrvOpt) throw "Insecure Connection";
		if(Conf.auth === 'wildapricot') {
			res.writeHead(307,'',{location:OAuthUri});
			res.end(); return 2;
		} else if(Conf.auth !== 'builtin') throw "No Login System";
	} else if(pn === '/auth') {
		await limit(AuthLim,1);
		if(!SrvOpt) throw "Insecure Connection";
		let q=utils.fromQuery(uri.search), qc={...q};
		delete qc.p;
		msg("[AUTH]", req.socket.remoteAddress, qc);
		let k=await getAuth(req,q), t=Tkn[k];
		msg(C_USR(t.e), "got new token", C_TKN(k));
		res.writeHead(307, '', {location:'/', 'set-cookie':
			[`k=${k};Max-Age=`+TknExpSec+SEC_CK, "u="+JSON.stringify({n:t.n,e:t.e})+SEC_CK]});
		res.end(); return 2;
	} else if(pn === '/up') {
		if(req.method !== 'POST') throw "Bad method";
		let [t,k]=getTkn(req), q=uri.search.slice(1), ql=q==='l', qi=q==='i';
		reqAuth(t, ql?A_WS:A_UP);
		await limit(UpLim,k);
		let img=sharp(await reqData(req)), ext='.webp', opt,
		[md,fn] = await Promise.all([
			img.metadata(),
			(async () => Path+(ql?"/logo":"/u/"+await UUID.genUUID()))()
		]);
		msg("[UP]", q, fn, md.format, md.width+'x'+md.height, C_USR(t.e));
		if(ql) ext='.png';
		else switch(md.format) {
			case 'png': opt={lossless:true}; break;
			case 'jpeg': opt={quality:80, effort:6}; break;
			case 'heif': opt={quality:80, effort:6}; break;
			default: throw "Unknown image format "+md.format;
		}
		img=img.autoOrient();
		if(opt) img=img.webp(opt);
		q=[img.toFile(fn+ext)];
		if(ql||qi) {
			let s=Math.min(ql?76:192, md.width, md.height);
			q.push(img.resize(s,s,{position:sharp.strategy.attention}).toFile(fn+'Sml'+ext));
		}
		await Promise.all(q);
		if(ql) LOvr=1;
		return ql?1:(fn+ext).slice(Path.length+3);
	} else if(!LOvr && (pn === '/logo.png' || pn === '/logoSml.png')) {
		await router.serve(Root+pn, req, res);
		return 2;
	} else if(pn.startsWith('/u/')) reqAuth(getTkn(req)[0],A_RD);
	if(pn === '/' || pn === '/login') {
		let t=getTkn(req)[0];
		res.setHeader('set-cookie', t?WSCk(t):WS._c);
	}
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

async function limit(rLim, key) {
	for(let i=0; 1; ++i) {
		try {return await rLim.consume(key,1)}
		catch(e) {if(i>LimWaitMax) throw "Rate limit exceeded"}
		await utils.delay(LimWaitPoll);
	}
}

function endReq(res,r,e) {
	/*if(re.pn == '/up') { //Log to file
		let s=`[${date()}] ${re.un||"Anonymous"} Update `+re.qr;
		if(e) s+=" Failed: "+e;
		else if(re.ld) s+=' '+(Array.isArray(re.ld)?'['+re.ld.join(', ')+']':JSON.stringify(re.ld));
		fs.writeFile("db.log",s+'\n',{flag:'a'},e=>{if(e) msg(chalk.red(e.stack))});
	}*/
	if(e instanceof TknExpErr) {
		res.writeHead(410,'',{'set-cookie':"k=;Max-Age=0"});
		return err(e.message), res.end(e.message);
	}
	if(e) err(e);
	else if(r===2) return;
	else {
		let t=typeof r;
		if(t==='object') r=JSON.stringify(r);
		else if(t!=='string') r=r.toString();
		print(chalk.dim(r!==1?`(${r.length}) `+
			(r.length>MaxLogLen?r.slice(0,MaxLogLen)+'...':r):"Done"));
	}
	res.writeHead(e?500:200,''), res.end(e?e.toString():r);
}

//============================================== Database ==============================================

async function dbLock(l) {
	while(Lock && Lock.l!==l) await Lock.p;
	Lock={l:l}, Lock.p=new Promise(r=>Lock.r=r);
}
async function waitUnlock() {
	if(Lock) {
		print(chalk.dim("Waiting on lock..."));
		while(Lock) await Lock.p, await utils.sleep(1);
	}
}
function dbUnlock(l) {if(Lock && Lock.l===l) Lock.r(),Lock=0}

function WSCk(t) {
	if(!t) t=WS;
	return utils.setCookie('w', [VER, numToClr(t.c1), numToClr(t.c2)].join('~'), -1);
}

async function loadCats() {
	CatID={}, CatMagic=[];
	for await(let c of Cat.find()) await addCat(c);
}
async function addCat(nc) {
	let id=nc._id,c = CatID[id] = CatMagic[nc.m] = {
		itm:DB.collection(`itm.${id}`), inv:DB.collection(`inv.${id}`),
		loc:DB.collection(`loc.${id}`), log:DB.collection(`log.${id}`),
		_id:id, m:nc.m
	}
	await updateCat(c,nc);
}
async function updateCat(c,nc) {
	updateCache(c,nc,CatDataFmt);
	await c.itm.createIndex({_id:'text', n:'text', d:'text', m:'text'});
	await [{p:1},{l:1},{_id:'text', s:'text'}].eachAsync(async d => {await c.inv.createIndex(d)});
	await [{p:1},{_id:'text', n:'text', _fn:'text'}].eachAsync(async d => {await c.loc.createIndex(d)});
	if(c.h) await [{d:1},{p:1},{i:1},{l:1},{o:1},{h:1}].eachAsync(async d => {await c.log.createIndex(d)});
}

//History Types
const LOG_PC=1, //Create Item	{t:1, d:date, u:userID, p:partID, n:name}
LOG_IC=2, //Create Stock		{t:2, d:date, u:userID, i:invID, q:qty, p:partID, l:locID}
LOG_LC=3, //Create Location		{t:3, d:date, u:userID, l:locID, n:name, h:parentID}
LOG_PD=4, //Delete Item			{t:4, d:date, u:userID, p:partID}
LOG_ID=5, //Delete Stock		{t:5, d:date, u:userID, i:invID, p:partID}
LOG_LD=6, //Delete Location		{t:6, d:date, u:userID, l:locID}
LOG_IA=7, //Adjust Stock		{t:7, d:date, u:userID, i:invID, p:partID, o:oldQty, h:newQty}
LOG_IM=8, //Move Stock			{t:8, d:date, u:userID, i:invID, p:partID, o:oldLoc, h:newLoc}
LOG_LM=9, //Move Location		{t:9, d:date, u:userID, l:locID, o:oldLoc, h:newLoc}
//Arg Types
T_ID=1, T_ARR=2, T_OBJ=3, T_INT=4,
//Auth Levels
A_RD=1, A_USR=2, A_ITM=3, A_UP=4, A_CAT=5, A_WS=6;

/*
A_RD	Read Access (Global & Per-cat)
A_USR	View Users & Contacts (Global only)
A_ITM	Edit Access (Global & Per-cat)
A_UP	Upload Files (Global only)
A_CAT	Create & Edit Categories (Global & Per-cat)
A_WS	Edit Workspace Settings (Global only)
*/

//============================================== Commands ==============================================

const CVFmt={t:'str|int',min:[1,null]},
DomainFmt="((\\.)?[a-zA-Z0-9-])+",
EmailFmt="[a-z0-9.!#$%&'`*+/=^_{}|~-]+@"+DomainFmt,
IDFmt={t:'str',len:11},
IDFmtOpt={t:'str|str',len:[0,11],req:false},
WSDataFmt={
	e:{t:'str|str',f:[null,DomainFmt],max:[0,NameMax]}, //Email Domain
	r:{t:'bool'}, //Anon Read-Only
	c1:{t:'int',min:0,max:0xFFFFFF}, //Primary Color
	c2:{t:'int',min:0,max:0xFFFFFF} //Accent Color
	//i bool: Brand Logo
}, UsrDataFmt={
	e:{t:'str',f:EmailFmt,max:NameMax}, //Email
	n:{t:'str',min:2,max:NameMax}, //Nickname
	b:{t:'str',req:false}, //Bio
	c1:{t:'int',min:0,max:0xFFFFFF}, //Primary Color
	c2:{t:'int',min:0,max:0xFFFFFF} //Accent Color
	//p str: Pwd Hash
	//k dict: Tokens
}, UsrProj={n:1, e:1},
UsrViewProj={n:1, e:1, b:1},
CatDataFmt={
	n:{t:'str',min:1,max:NameMax}, //Name
	h:{t:'bool',req:false}, //Track History
	i:{t:'bool',req:false}, //Multi Inv
	e:{t:'list',c:IDFmt,min:0,req:false}, //Ext Locs
	//TODO v:{t:'dict',c:{t:'str',min:1},req:false}
	//s:[subCats]
	//cat.s - _id:id, n:name, v:[varFields]
}, ItmDataFmt={
	n:{t:'str',min:1,max:NameMax}, //Name
	//TODO a:[altNames]
	d:{t:'str',req:false}, //Desc
	m:{t:'str',max:NameMax,req:false}, //Mfg
	i:{t:'str',max:NameMax,req:false}, //Icon URI
	//TODO s:IDFmtOpt, //SubCat ID
	//_c str: Cat ID
}, ItmProj={
	n:1, d:1, m:1, i:1
}, InvDataFmt={
	//p uuid: Part ID
	l:IDFmt, //Loc ID
	q:{t:'int',min:1}, //Qty
	s:{t:'str',max:NameMax,req:false}, //SN
	//d:dateCodeOrPO
	//TODO v:{t:'dict',c:CVFmt,req:false}
}, InvProj={
	p:1, l:1, q:1, s:1
}, LocDataFmt={
	n:{t:'str',min:1,max:NameMax}, //Name
	d:{t:'str',req:false}, //Desc
	p:IDFmtOpt, //Parent ID
	//TODO v:{t:'dict',c:CVFmt,req:false}
	//v:[uniqueVars]
	//_fn str: Full Name
}, LocProj={
	n:1, d:1, p:1, _fn:1
};

//TODO Ensure names and altPNs for items are unique in cat

async function dbCmd(q,req,res) {
	let [t,k]=getTkn(req), id,c,d,j,n;
	if(req==null && res==null) t={e:'Console'};
	msg("[CMD]", q, t?C_USR(t.e)+` [${C_TKN(k)}]`:'');
	reqAuth(t,A_RD);
	await waitUnlock();
	switch(q[0]) {
	//-------- Users & Settings --------
	case 's': //Settings
		reqAuth(t,0);
		c=utils.copy(t);
		delete c.k;
		d=[c];
		if(hasAuth(t,A_WS)) {
			d.push(c=utils.copy(WS,1));
			delete c._id, delete c._c;
			c.i=LOvr;
		}
		return d;
	case 'wu': //Workspace Update [data]
		reqAuth(t,A_WS);
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[1], WSDataFmt, 1);
		await dbLock(req);
		d=await DB.u.updateOne({_id:0}, dbSet(j));
		if(d.matchedCount !== 1) throw "Unknown error";
		if(j.c1||j.c2) for(n in Usr) {
			c={};
			if(j.c1 && Usr[n].c1===WS.c1) c.c1=j.c1;
			if(j.c2 && Usr[n].c2===WS.c2) c.c2=j.c2;
			if(c.c1||c.c2) {
				await DB.u.updateOne({_id:n}, dbSet(c));
				updateCache(Usr[n], c);
			}
		}
		updateCache(WS,j), WS._c=WSCk();
		return 1;
	case 'uu': //User Update [data]
		reqAuth(t,0);
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_OBJ,"Data",DataMax);
		j=q[1];
		if(j.e) j.e=j.e.trim().toLowerCase();
		schema.checkSchema(j, UsrDataFmt, 1);
		d=await DB.u.updateOne({_id:t._id}, dbSet(j));
		if(d.matchedCount !== 1) throw new TknExpErr();
		updateCache(t,j);
		return 1;
	case 'lo': //Log Out
		await delTkn(k).catch(err);
		res.writeHead(200,'',{'set-cookie':"k=;Max-Age=0"});
		res.end(); return 2;
	case 'di': //Delete Image
		reqAuth(t,A_WS);
		if(q.length !== 2) throw "Bad Args";
		if(q[1] === 'l') {
			if(LOvr) await Promise.all([
				fs.rm(Path+"/logo.png"),
				fs.rm(Path+"/logoSml.png")
			]), LOvr=0;
		} else {
			//TODO delete image
			throw "Not yet implemented";
		}
		return 1;
	//-------- Read --------
	case 'cl': //List Cats
		d=[];
		for(c in CatID) if(hasAuth(t, A_RD, c=CatID[c])) d.push({_id:c._id, n:c.n});
		d.sort((a,b) => a.n.localeCompare(b.n));
		return d;
	case 'c': //Cat Summary [cid|anyID]
		if(q.length !== 2) throw "Bad Args";
		if(!(c=CatID[q[1]]) && !(c=catFromID(q[1]))) throw "Bad Cat ID";
		reqAuth(t,A_RD,c);
		d=await Cat.findOne({_id:c._id});
		if(!d) throw "Cat not found";
		updateCache(c,d,CatDataFmt);
		return d;
	case 'pl': case 'il': case 'll': case 'hl': //List Part/Inv/Loc/Log [cid|pid, skip, pageSize]
		if(q.length !== 4) throw "Bad Args";
		if(!(c=CatID[q[1]])) {
			if(q[0]==='il' || q[0]==='hl') c=catFromID(id=q[1]);
			else if(q[0]==='ll') c=catFromID(q[1]);
			if(!c) throw "Bad Cat ID";
		}
		asType(q,2,T_INT,"Skip");
		asType(q,3,T_INT,"PageSize");
		n=q[0]==='hl';
		reqAuth(t, n?A_ITM:A_RD, c);
		j=getOf(q,ItmProj,InvProj,LocProj,0), d=[];
		if(id) d.push({$match:n ? {$or:[{p:id},{i:id},{l:id},
			{o:id},{h:id}]} : {$or:[{p:id},{l:id}]}});
		if(j) d.push({$project:j});
		d.push({$sort:n?{d:-1}:{n:1}});
		q[2]=Math.max(q[2],0);
		q[3]=utils.bounds(q[3],0,MaxPageSize);
		d.push({$facet:{
			metadata:[{$count:'c'}],
			data:[{$skip:q[2]}, {$limit:q[3]}],
		}});
		d=(await getTbl(q,c).aggregate(d).toArray())[0];
		if(n) for(n of d.data) n.d=n.d.getTime();
		n=!(n=d.metadata[0]) || n.c > q[2]+q[3];
		d={n:n?1:0, c:c._id, d:d.data};
		if(d.c===q[1]) delete d.c;
		return d;
	case 'ul': //List User
		reqAuth(t, A_USR);
		return await DB.u.find({_id:{$ne:0}},{projection:UsrProj}).toArray();
	case 'u': //Get User [id]
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_ID);
		reqAuth(t, A_USR);
		d=await DB.u.findOne({_id:q[1]},{projection:UsrViewProj});
		if(!d) throw "User not found";
		return d;
	case 'p': case 'i': case 'l': case 'h': //Get Part/Inv/Loc/Log [id]
		if(q.length !== 2) throw "Bad Args";
		c=catFromID(q[1]);
		reqAuth(t,A_RD,c);
		d=await getTbl(q,c).findOne({_id:q[1]});
		if(!d) throw "Entity not found";
		if(q[0]==='p') d._c=c._id;
		return d;
	case 'q': //Search
		if(q.length !== 4) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		reqAuth(t,A_RD,c);
		asType(q,2,0,"Type",1);
		asType(q,3,0,"Name",NameMax);
		n=q[2], j=q[3];
		if(n==='a') {
			d=await Promise.all([
				search(c,t,'p',j), search(c,t,'i',j),
				search(c,t,'l',j), search(0,t,'u',j)
			]);
			c={};
			for(n of d) if(n[1].length) c[n[0]]=n[1];
			return c;
		}
		return (await search(c,t,n,j))[1];
	case 'ic': //ID Cache [cid]
		if(q.length !== 2) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		reqAuth(t,A_RD,c);
		d={}, j=[getCache(c,'p',d), getCache(c,'l',d)];
		if(hasAuth(t, A_USR)) j.push(getCache(0,'u',d));
		await Promise.all(j);
		return d;
	//-------- Create --------
	case 'cn': //New Cat [data] -> id
		reqAuth(t,A_CAT);
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_OBJ,"Data",DataMax);
		schema.checkSchema(q[1], CatDataFmt);
		id=(await UUID.genUUID(null,0)).toString();
		await dbLock(req);
		await loadCats();
		//Find free magic
		n=1; while(1) {
			j=0; for(c in CatID) if(n===CatID[c].m) {j=1; break}
			if(!j) break;
			if(++n > 255) throw "Too many categories (Max is 255)";
		}
		await Cat.insertOne(c={_id:id, m:n, ...q[1]});
		await addCat(c);
		return id;
	case 'sn': //New SubCat [cid, name] -> id
		reqAuth(t,A_CAT);
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		asType(q,2,0,"Name",NameMax);
		id=(await UUID.genUUID(null,c.m)).toString();
		d=await Cat.updateOne({_id:q[1]}, {$push:{s:{_id:id, n:q[2]}}});
		if(d.modifiedCount !== 1) {await loadCats(); throw "Cat not found"}
		return id;
	//New Part/Loc [cid, data] -or- New Inv [pid, data] -> id
	case 'pn': case 'in': case 'ln':
		q.i=q[0]==='in';
		if(q.length !== 3) throw "Bad Args";
		if(!(c=q.i?catFromID(q[1]):CatID[q[1]])) throw "Bad Cat ID";
		reqAuth(t,A_ITM,c);
		if(q.i) asType(q,1,T_ID,"Part ID");
		asType(q,2,T_OBJ,"Data",DataMax);
		n=getCmnt(j=q[2]);
		schema.checkSchema(j, getOf(q,ItmDataFmt,InvDataFmt,LocDataFmt));
		j._id=id=(await UUID.genUUID(null,c.m)).toString();
		q.c=getTbl(q,c);
		if(q[0]==='ln') { //Verify loc tree, calc fn
			await dbLock(req);
			d=await q.c.find().toArray();
			d.push(j), tblToTree(d,0,1);
		} else if(q.i) { //Verify part ID
			d=await c.itm.findOne({_id:q[1]});
			if(!d) throw "Part not found";
			j.p=q[1];
		}
		await q.c.insertOne(j);
		d=q.i?{q:j.q, p:j.p, l:j.l}:{n:j.n};
		if(q[0]==='ln' && j.p) d.h=j.p;
		dbLog(c, getOf(q,LOG_PC,LOG_IC,LOG_LC), id, q[0][0], t, n, d);
		return id;
	//-------- Update --------
	case 'cu': //Cat Update [id, data]
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad ID";
		reqAuth(t,A_CAT,c);
		asType(q,2,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[2], CatDataFmt, 1);
		d=await Cat.updateOne({_id:q[1]}, dbSet(j));
		if(d.matchedCount !== 1) {await loadCats(); throw "Cat not found"}
		await updateCat(c,j);
		return 1;
	case 'pu': case 'iu': case 'lu': //Part/Inv/Loc Update [id, data]
		if(q.length !== 3) throw "Bad Args";
		c=catFromID(id=q[1]);
		reqAuth(t,A_ITM,c);
		asType(q,2,T_OBJ,"Data",DataMax);
		n=getCmnt(j=q[2]); //TODO Comment needs option on client side
		schema.checkSchema(j, getOf(q,ItmDataFmt,InvDataFmt,LocDataFmt), 1);
		q.c=getTbl(q,c);
		if(q[0]==='lu' && ('n' in j || 'p' in j)) { //Verify loc tree, calc fn
			console.log("RECALC LOC");
			await dbLock(req);
			d=await q.c.find().toArray();
			let a=d.each(l => l._id===id?l:null);
			if(!a) throw "Entity not found";
			q.ol=a.p, updateCache(a,j);
			tblToTree(d,0,2);
			q.d=a, j._fn=a._fn;
		} else if(q[0]==='iu' && ('l' in j || 'q' in j)) { //Get old loc
			let a=await q.c.findOne({_id:id});
			if(!a) throw "Entity not found";
			q.p=a.p, q.ol=a.l, q.oq=a.q;
		}
		d=await q.c.updateOne({_id:id}, dbSet(j));
		if(d.matchedCount !== 1) throw "Entity not found";
		if(q.d && q.d.c) { //Update fn for all descendants
			let v,p=[],fn=a => {for(v of a.c) {
				p.push(q.c.updateOne({_id:v._id}, {$set:{_fn:v._fn}}));
				if(v.c) fn(v);
			}}
			fn(q.d);
			await Promise.all(p);
		}
		if(q[0]==='lu' && 'p' in j) {
			dbLog(c, LOG_LM, id, q[0][0], t, n, {o:q.ol, h:j.p});
		} else if(q[0]==='iu') {
			if('l' in j) dbLog(c, LOG_IM, id, q[0][0], t, n, {p:q.p, o:q.ol, h:j.l});
			if('q' in j) dbLog(c, LOG_IA, id, q[0][0], t, n, {p:q.p, o:q.oq, h:j.q});
		}
		return 1;
	//-------- Delete --------
	case 'cd': //Del Cat [id]
		reqAuth(t,A_WS);
		if(q.length !== 2) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad ID";
		await dbLock(req);
		c.itm.drop(), c.inv.drop(), c.loc.drop(), c.log.drop();
		d=await Cat.deleteOne({_id:q[1]});
		await loadCats();
		if(d.deletedCount !== 1) throw "Cat not found";
		return 1;
	//TODO case 'sd': //Del SubCat
	case 'pd': case 'id': case 'ld': //Del Part/Item/Location [id, cmnt]
		if(q.length !== 2 && q.length !== 3) throw "Bad Args";
		c=catFromID(id=q[1]);
		reqAuth(t,A_ITM,c);
		asType(q,2,0,"Comment",NameMax,1);
		q.c=getTbl(q,c);
		if(q[0]==='id') {
			let a=await q.c.findOne({_id:id});
			if(!a) throw "Entity not found";
			q.p=a.p;
		}
		d=await q.c.deleteOne({_id:id});
		if(d.deletedCount !== 1) throw "Entity not found";
		dbLog(c, getOf(q,LOG_PD,LOG_ID,LOG_LD), id, q[0][0],
			t, q[2], q[0]==='id'?{p:q.p}:null);
		return 1;
	default:
		throw "Unknown cmd";
	}
}

function asType(q,i,t,n,max,opt) {
	let v=q[i];
	if(t === T_ID) {
		if(!v || v.length !== UUID.LEN) throw "Bad "+(n||"ID");
		if(max != null && new UUID(v).getMagic()!==max) throw "Bad Magic in ID";
	}
	if(v) q[i]=v=v.trim();
	if(!v) { if(opt) return; throw n+" Required"; }
	if(max && v.length > max) throw n+" Too Long";
	switch(t) {
		case T_INT: if(!Number.isInteger(q[i]=Number(v))) throw n+" not an int"; break;
		case T_ARR: q[i]=JSON.parse(`[${v}]`); break;
		case T_OBJ: q[i]=JSON.parse(`{${v}}`);
	}
}

async function dbLog(cat, type, eid, eType, tkn, cmnt, data) {
	if(!cat.h) return;
	try {
		let d=new Date(), id=(await UUID.genUUID(null,cat.m)).toString();
		d={_id:id, t:type, d:d, [eType]:eid};
		if(tkn) d.u=tkn._id;
		if(data) for(let k in data) if(valToBool(data[k])) d[k]=data[k];
		if(cmnt) d.c=cmnt;
		await cat.log.insertOne(d);
	} catch(e) {err(e)}
}
function getCmnt(d) {
	asType(d,'_h',0,"Comment",NameMax,1);
	let h=d._h; delete d._h; return h;
}

async function search(cat, tkn, type, query) {
	if(type==='u' && !hasAuth(tkn,A_USR)) return [type,[]]; //Req A_USR for user search
	cat=getTbl(type,cat);
	let o={score:{$meta:'textScore'}, sort:{score:{$meta:'textScore'}}},
		p=getOf(type,ItmProj,InvProj,LocProj,0,UsrProj);
	if(p) o.projection=p;
	return [type, await cat.find({$text:{$search:query}},o).toArray()];
}

async function getCache(cat, type, dat) {
	let dl=await getTbl(type,cat).find(type==='u'?{_id:{$ne:0}}:{},
		{projection:type==='l'?{_fn:1}:{n:1}}).toArray(),d,n;
	for(d of dl) if(n=d._fn||d.n) dat[d._id]=n;
}

//============================================== User Auth ==============================================

class TknExpErr extends Error {
	constructor(e) {super(e||"Expired token"), this.name='TknExpErr'}
}

function hasAuth(t,lv,cat) {
	if(lv===A_RD && WS.r) return 1; //Anon read-only
	if(!t || !t.k) return; //Bad token
	return 1; //TODO check permissions
}
function reqAuth(t,lv,cat) {
	t=hasAuth(t,lv,cat);
	if(t==null) throw new TknExpErr("Not logged in");
	if(!t) throw "Not authorized";
}
function getTkn(req) {
	let k=req&&req.headers.cookie,t;
	if(!req || !k) return [];
	k=k&&utils.getCookie('k',k), t=k&&Tkn[k];
	if(k && !t) throw new TknExpErr();
	if(t) t.k[k]=new Date();
	return [t,k];
}

let RunCtr=0;

//Run periodic maintenance
async function dbLoop() {
	let n=new Date(),tk=Object.keys(Tkn),k,t,d,x;
	print(chalk.dim(chalk.yellow(`[Running maintenance @ ${utils.formatDate(n,LogDateFmt)}]`)));
	//Expire tokens
	for(k of tk) {
		t=Tkn[k], d=t.k[k], x=n-d;
		print("Token", C_TKN(k), "for", C_USR(t.e),
			"last seen", chalk.cyan(utils.formatDate(d,SeenFmt)),
			"expires in", chalk.bold(chalk.blue(Math.ceil((TknExp-x)/3600000)+'h')));
		if(x >= TknExp) await delTkn(k).catch(err);
	}
	//Push token cache to DB
	tk=Object.keys(Usr);
	for(k of tk) {
		d=Usr[k];
		t=await DB.u.updateOne({_id:k}, {$set:{k:d.k}});
		if(t.matchedCount !== 1) {
			print(chalk.red(`User ${d.e} deleted`));
			for(t in d.k) delete Tkn[t];
			delete Usr[k];
		}
	}
	//if(++RunCtr >= 5)
	//TODO Auto-purge unused uploaded files every few runs
	//Refresh cat cache
	//Delete non-existent cat IDs from cat enabled locs
	//Update names in history
	//Delete inv for part IDs that don't exist
}

async function genTkn() {
	let u=await UUID.genUUID(), r=await UUID.randBytes(24);
	return u.toString()+r.toString('base64url');
}
async function delTkn(k) {
	let t=Tkn[k];
	if(!t) throw "Token Not Found";
	delete Tkn[k], delete t.k[k];
	msg("Token", C_TKN(k), "for", C_USR(t.e), "expired");
	let u={};
	u['k.'+k]=1;
	t=await DB.u.updateOne({_id:t._id}, {$unset:u});
	if(t.matchedCount !== 1) throw "User not found";
}

async function getAuth(req,q) {try {
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
		t={e:q.u, p:q.p}, b=1;
	} else throw "No Login System";
	t.e=t.e.trim().toLowerCase();
	try {schema.checkSchema({e:t.e},UsrDataFmt,1)} catch(e) {throw "Bad Email"}
	if(WS.e && !t.e.endsWith('@'+WS.e)) throw "Email not authorized on this domain";
	let k=await genTkn();
	await dbLock(req);
	let u=await DB.u.findOne({e:t.e});
	if(u) { //Login
		let r=u.k, d=new Date();
		r[k]=d, r={$set:{k:r}};
		if(b) {
			if(q.s) throw "Account already exists";
			if(!await ar2.verify(u.p, t.p)) throw '';
		}
		r=await DB.u.updateOne({_id:u._id}, r);
		if(r.modifiedCount !== 1) throw "Unknown error";
	} else { //New User
		if(b && !q.s) throw '';
		let id=(await UUID.genUUID()).toString();
		u={_id:id, e:t.e, c1:WS.c1, c2:WS.c2, k:{[k]:new Date()}};
		if(b) {
			let n=t.e.slice(0,t.e.indexOf('@')), x=n.indexOf('.');
			u.n=n.charAt(0).toUpperCase()+(x!==-1 ? n.slice(1,x)+n.charAt(x+1).toUpperCase() : n.slice(1));
			u.p=await ar2.hash(t.p, {hashLength:48});
		} else u.n=t.n;
		await DB.u.insertOne(u);
	}
	//Cache user info wo/ sensitive keys
	delete u.p;
	let i=u._id;
	if(Usr[i]) updateCache(Usr[i],u); else Usr[i]=u;
	Tkn[k]=Usr[i];
	dbUnlock(req);
	return k;
} catch(e) {
	//Random delay to prevent timing attacks
	await utils.delay(utils.rand(500,3000));
	throw e||"Incorrect email or password";
}}

//============================================== Support ==============================================

function catFromID(id) {
	let c=CatMagic[new UUID(id).getMagic()];
	if(!c) throw "Bad Cat ID";
	return c;
}

//Get Part/Inv/Loc/Log collection
function getOf() {
	let a=arguments,q=a[0],r;
	if(typeof q!=='string') q=q[0][0];
	switch(q) {
		case 'p': r=a[1]; break;
		case 'i': r=a[2]; break;
		case 'l': r=a[3]; break;
		case 'h': r=a[4]; break;
		case 'u': r=a[5];
	}
	if(r==null) throw "Bad Cmd";
	return r;
}
function getTbl(q,c) {return getOf(q, c.itm, c.inv, c.loc, c.log, DB.u)}

function valToBool(v) {
	switch(typeof v) {
	case 'number': return true;
	case 'string': return !!v;
	case 'boolean': return v;
	case 'object':
		if(Array.isArray(v)) return v.length>0;
		return !!v;
	}
	return 0;
}

//Convert JSON dict to Mongo $set and $unset
function dbSet(d) {
	let s={},k,v; for(k in d) {
		if(valToBool(v=d[k])) (s.$set||(s.$set={}))[k]=v;
		else (s.$unset||(s.$unset={}))[k]=1;
	}
	return s;
}

//Update cache d with vals from nd, with optional projection
function updateCache(d,nd,prj) {
	for(let k in nd) {
		if(prj && !prj[k]) continue;
		if(valToBool(nd[k])) d[k]=nd[k];
		else delete d[k];
	}
}

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

function numToClr(n) {return utils.fixedNum(n,6,16).slice(2)}

class TreeError extends Error {
	constructor(e, ids) {super(e), this.ids=ids, this.name='TreeError'}
}

function _dName(d) {return '#'+d._id+(d.n?` (${d.n})`:'')}
function tblToTree(tbl, runFn, calcFNs) {
	let ids={},d, tf=(n,nd,pf) => {
		if(calcFNs && n) pf+=n.n+" - ";
		for(d in ids) if((d=ids[d]) && n?d.p===n._id:!d.p) {
			delete ids[d._id];
			if(calcFNs) {
				d._fn = pf+d.n;
				if(calcFNs>1 && n) (n.c||(n.c=[])).push(d);
			}
			if(runFn) runFn(d,nd);
			tf(d,nd+1,pf);
		}
	}
	for(d of tbl) ids[d._id]=d;
	tf(0,0,'');
	if((d=Object.keys(ids)).length) {
		let s=''; d.forEach((e,i) => s+=(i?', ':'')+_dName(d[i]=ids[e]));
		throw new TreeError(`Unlinked entities ${s}`,d);
	}
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