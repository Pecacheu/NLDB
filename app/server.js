//NLDB, Pecacheu 2025. GNU GPL v3
const VER='2.0.1';

import fs from 'fs/promises';
import read from 'readline';
import path from 'path';
import http from 'http';
import https from 'https';
import C from 'chalk';
import mdb from 'mongodb';
import TypeSense from 'typesense';
import ar2 from 'argon2';
import sharp from 'sharp';
import {RateLimiterMemory} from 'rate-limiter-flexible';
import router from 'raiutils/router';
import schema from 'raiutils/schema';
import UUID from 'raiutils/uuid';
import 'raiutils';

//Load Config
const ConfFmt={
	debug:{t:'int',min:0,max:2,req:0},
	dbUri:{t:'str'},
	tsHost:{t:'str'},
	host:{t:'str'},
	mail:{t:'str'},
	mailPass:{t:'str'},
	mailPort:{t:'int',min:0,max:25565},
	port:{t:'int',min:0,max:25565},
	sslKey:{t:'str',req:0},
	sslCert:{t:'str',req:0},
	tknExpDays:{t:'float',min:0},
	maxUploadMb:{t:'int',min:0},
	auth:{t:'str',f:"builtin|wildapricot"},
	authUri:{t:'str',req:"auth==='wildapricot'"},
	apiKey:{t:'str',req:"auth==='wildapricot'"}
}, App=import.meta.dirname,
Conf=JSON.parse(await fs.readFile(path.join(App, "../config.json")));

schema.checkSchema(Conf, ConfFmt);

const MsMin=60000,
MsHour=60*MsMin,
MsDay=24*MsHour,
TknCheckInt=MsHour,
LimWaitPoll=100, //.1s
LimWaitMax=30000/LimWaitPoll, //30s
NameMax=1000,
DataMax=10000,
MaxLogLen=500,
MaxPageSizeAnon=200,
MaxPageSize=2000,
MaxSearch=10,
Web=path.join(App, "../web"),
Res=Web+"/u",
VDir={'utils.js': path.join(App, "node_modules/raiutils/utils.min.js")},
LogDateFmt={sec:true, suf:false, year:false, df:true},
ExpFmt={suf:false, year:false, df:true},
//Calc Params
TknExp=Conf.tknExpDays*MsDay,
TknExpSec=TknExp/1000,
MaxUpload=Conf.maxUploadMb*1000000,
SrvOpt=Conf.sslKey?{key:await fs.readFile(Conf.sslKey), cert:await fs.readFile(Conf.sslCert)}:null,
print=console.log,
//Colors
C_USR = C.yellow,
C_TKN = C.magenta,
C_VAL = C.cyan,
//Rate Limits
AuthLim = new RateLimiterMemory({points:2, duration:4}),
UpLim = new RateLimiterMemory({points:10, duration:1});

let WS, LOvr=1, TS, DB, Cat, CatID, CatMagic, Usr, Tkn,
Lock, CID, RDU, OAuthUri, TknUri, UsrInfoUri;

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
	await utils.waitInit();
	const ips=utils.getIPs(), [sysOS, arch, cpu]=utils.getOS();
	print("IP:",ips,`OS: ${sysOS}, ${arch}\nCPU: ${cpu}\n\n`+C.yellow(`NLDB v${VER}`));

	print("Loading icons...");
	await fs.mkdir(Res, {recursive:true});
	await sharp(App+"/logoSml.png").metadata(); //Test Sharp
	await fs.stat(Res+"/logoSml.png").catch(() => {LOvr=0});

	print("Loading database...");
	DB = new mdb.MongoClient(Conf.dbUri).db('nldb');
	Cat = DB.collection('cat'), DB.u = DB.collection('usr');
	let c=await DB.u.findOne({_id:0});
	if(!c) await DB.u.insertOne(WS);
	else if(c._v !== VER) { //Version Migration
		print(C.bgBlue(`Migrating from ${c._v} to ${VER}`));
		await Cat.dropIndexes(), await DB.u.dropIndexes();
		for await(c of DB.listCollections()) {
			let d=DB.collection(c=c.name);
			await d.dropIndexes();
			//TODO TEMP migration to new name format
			if(c.startsWith('itm.')) await DB.renameCollection(c, c.slice(4)+'.p');
			else if(c.startsWith('inv.')) await DB.renameCollection(c, c.slice(4)+'.i');
			else if(c.startsWith('loc.')) await DB.renameCollection(c, c.slice(4)+'.l');
			else if(c.startsWith('log.')) await DB.renameCollection(c, c.slice(4)+'.h');
		}
		await DB.u.updateOne({_id:0}, {$set:{_v:VER}});
	}
	await Cat.createIndex({m:1}, {unique:1});
	await mkIndexes(DB.u, [{n:1},{e:1}], {unique:1});

	print("Loading search...");
	c=new URL(Conf.tsHost);
	TS = new TypeSense.Client({
		nodes:[{protocol:c.protocol.slice(0,-1), host:c.hostname, port:c.port}],
		apiKey:'xyz', connectionTimeoutSeconds:2
	});
	TS._f={};
	//Recreate indexes on restart
	for(c of await TS.collections().retrieve()) await TS.collections(c.name).delete();
	await mLoop(1), setInterval(mLoop, TknCheckInt);

	const rqCb=async (rq,re) => {
		if(Conf.debug>1) msg("[REQ]",rq.url);
		re.sendDate=false; let r,e;
		try {r=await onReq(rq,re)} catch(er) {e=er} finally {
			dbUnlock(rq); if(r||e) endReq(re,r,e); else router.handle(Web,rq,re,VDir);
		}
	}
	(SrvOpt?https.createServer(SrvOpt, rqCb):http.createServer(rqCb)).listen(Conf.port, () => {
		print("Listening at "+C.bgGreen(`http${SrvOpt?'s':''}://${Conf.host}:${Conf.port}`));
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
		if(!SrvOpt) print(C.bgYellow("Login from insecure connection"));
		if(Conf.auth === 'wildapricot') {
			res.writeHead(307,'',{location:OAuthUri});
			res.end(); return 2;
		} else if(Conf.auth !== 'builtin') throw "No Login System";
	} else if(pn === '/auth') {
		await limit(AuthLim,1);
		if(!SrvOpt) print(C.bgYellow("Auth from insecure connection"));
		let q=utils.fromQuery(uri.search), qc={...q};
		delete qc.p;
		msg("[AUTH]", req.socket.remoteAddress, qc);
		let k=await getAuth(req,q), t=Tkn[k];
		if(k==='V') return k;
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
			(async () => Res+'/'+(ql?"logo":await UUID.genUUID()))()
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
		return ql?1:(fn+ext).slice(Res.length+1);
	} else if(pn === '/logo.png' || pn === '/logoSml.png') {
		await router.serve((LOvr?Res:App)+pn, req, res);
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
	/*if(re.pn == '/up') { //TODO Log to file
		let s=`[${date()}] ${re.un||"Anonymous"} Update `+re.qr;
		if(e) s+=" Failed: "+e;
		else if(re.ld) s+=' '+(Array.isArray(re.ld)?'['+re.ld.join(', ')+']':JSON.stringify(re.ld));
		fs.writeFile("db.log",s+'\n',{flag:'a'},e=>{if(e) msg(C.red(e.stack))});
	}*/
	let te=e instanceof TknExpErr;
	if(te || e instanceof ConfirmErr) {
		res.writeHead(te?410:409,'',te?{'set-cookie':"k=;Max-Age=0"}:{});
		return err(e.message), res.end(e.message);
	}
	if(e) err(e);
	else if(r===2) return;
	else if(Conf.debug) {
		let t=typeof r;
		if(t==='object') r=JSON.stringify(r);
		else if(t!=='string') r=r.toString();
		print(C.dim(r!==1?`(${r.length}) `+
			(r.length>MaxLogLen?r.slice(0,MaxLogLen)+'...':r):"Done"));
	}
	res.writeHead(e?500:200,''), res.end(e?e.toString():r);
}

//============================================== Search ==============================================

const IDX={
	u:{n:1, e:1},
	p:{n:1, m:1, d:1, i:0},
	i:{s:1, q:'int32', p:0, l:0},
	l:{n:1, _fn:1}
};
IDX.a={...IDX.p, ...IDX.i, ...IDX.l};

async function mkTSIndex(c) {
	let n=c?c._id:'usr', fd=c?IDX.a:IDX.u,f,t,d;
	//Create index
	if(!(n in TS._f)) {
		t=c?[{name:'_t', type:'string', facet:true}]:[];
		for(f in fd) {
			d=fd[f], f={name:f, type:'string', optional:true};
			if(d===1) f.infix=true; else {f.index=false; if(d) f.type=d}
			t.push(f);
		}
		await TS.collections().create({name:n, fields:t}), TS._f[n]=1;
	}
	//Sync docs
	await (c?['p','i','l']:['u']).eachAsync(async t => {
		let tbl=getTbl(t,c||0),m=[],p={},nd=[],f,d;
		print(C.bgCyan("Syncing index "+tbl.s.namespace.collection));
		for(f in IDX[t]) m.push({[f]:{$exists:1}}), p[f]=1;
		for await(d of tbl.find({$or:m}, {projection:p})) if(d._id) {
			d.id=d._id, delete d._id; if(c) d._t=t;
			nd.push(d);
		}
		if(nd.length) await TS.collections(n).documents().import(nd, {action:'upsert'});
	});
}
async function dropTSIndex(c) {
	await TS.collections(c._id).delete().catch(()=>{});
}

function _sync(tbl, fn) {
	let cn = tbl.c?tbl.c._id:'usr';
	(async() => {try {await fn(TS.collections(cn))}
	catch(e) {err(new Error("CacheError", {cause:e}))}})();
}
function _updDat(tbl, dat, id) {
	let s=dat.$set, u=dat.$unset;
	if(s||u) {
		let nd={},f,v,h;
		if(id) nd.id=id;
		for(f in IDX[tbl.t]) {
			v=u&&f in u?null:s?s[f]:undefined;
			if(v!==undefined) nd[f]=v, h=1;
		}
		if(h) return nd;
	}
}

const R_TSEsc=/`/g, R_SM=/<(\/)?mark>/g;

//Update DB & sync index
async function insOne(tbl, dat) {
	await tbl.insertOne(dat);
	let nd,f,v;
	for(f in IDX[tbl.t]) {
		v=dat[f];
		if(v!==undefined) (nd||(nd={id:dat._id}))[f]=v;
	}
	if(nd) {
		if(tbl.c) nd._t=tbl.t;
		_sync(tbl, c => c.documents().upsert(nd));
	}
}
async function delOne(tbl, id) {
	let d=await tbl.deleteOne({_id:id});
	if(d.deletedCount !== 1) throw "Entity not found";
	_sync(tbl, c => c.documents(id).delete({ignore_not_found:true}));
}
async function delMany(tbl, pat) {
	await tbl.deleteMany(pat);
	let f=[],p;
	//Escape filter vals
	for(p in pat) f.push(`${p}:=\`${pat[p].replace(R_TSEsc, '\\`')}\``);
	f={ignore_not_found:true, filter_by:f.join('&&')};
	_sync(tbl, c => c.documents().delete(f));
}
async function updOne(tbl, id, dat) {
	let d=await tbl.updateOne({_id:id}, dat);
	if(d.matchedCount !== 1) throw "Entity not found";
	if(d=_updDat(tbl,dat,id)) _sync(tbl, c => c.documents().update(d));
	//TODO Perhaps we should use a delayed write buffer with the bulk endpoint for performance?
}
async function updAll(tbl, dat) {
	await tbl.updateMany({}, dat);
	if(dat=_updDat(tbl,dat)) {
		let f=tbl.c?{filter_by:'_t:='+tbl.t}:{};
		_sync(tbl, c => c.documents().update(dat,f));
	}
}

function _sDoc(r) {
	let d=r.document, h=r.highlight,k;
	d._id=d.id, delete d.id, delete d._t;
	for(k in h) d[k]=h[k].snippet.replace(R_SM,'<$1k>');
	return d;
}
async function search(cat, tkn, type, query, _ne) {
	if(type==='u' && !hasAuth(tkn,A_USR)) return {}; //Req A_USR for user search
	let r=IDX[type],q=[],d=[],f,g;
	for(f in r) if(r[f]===1) q.push(f), d.push('fallback');
	q={q:query, query_by:q, infix:d, group_limit:MaxSearch, limit:MaxSearch};
	if(type!=='u') {
		if(type==='a') q.group_by='_t',g=1;
		else q.filter_by='_t:='+type;
	}
	r=TS.collections(type==='u'?'usr':cat._id).documents().search(q);
	//Search ext locs
	if(!_ne && (type==='a' || type==='l') && cat.e) {
		d={l:[]}, q=[r];
		for(f of cat.e) {
			if(!(f=CatID[f])) throw "Bad Ext Cat ID #"+f;
			if(hasAuth(tkn,A_RD,f)) q.push(search(f, tkn, 'l', query, 1));
		}
		q=await Promise.all(q);
		q.each(s => {d.l.push(...s.l)},1), r=q[0];
	} else d={}, r=await r;
	//Parse result
	q=r.grouped_hits||[r.hits];
	for(f of q) {
		if(g) type=f.group_key[0], f=f.hits;
		f.forEach((r,i) => f[i]=_sDoc(r));
		d[type]=f;
	}
	return d;
}

//============================================== Database ==============================================

async function dbLock(l) {
	if(!l || (Lock && Lock.l===l)) return;
	while(Lock && Lock.l!==l) await Lock.p;
	Lock={l:l}, Lock.p=new Promise(r=>Lock.r=r);
}
async function waitUnlock() {
	if(Lock) {
		print(C.dim("Waiting on lock..."));
		while(Lock) await Lock.p, await utils.sleep(1);
	}
}
function dbUnlock(l) {if(Lock && Lock.l===l) Lock.r(),Lock=0}

function WSCk(t) {
	if(!t) t=WS;
	t=[VER, numToClr(t.c1), numToClr(t.c2)];
	if(MErr) t.push(MErr);
	return utils.setCookie('w', t.join('~'), -1);
}

async function loadCats(mkIdx) {
	CatID={}, CatMagic=[];
	for await(let c of Cat.find()) await addCat(c,mkIdx);
}
async function addCat(nc, mkIdx) {
	let id=nc._id, c = CatID[id] = CatMagic[nc.m] = {
		itm:DB.collection(`${id}.p`), inv:DB.collection(`${id}.i`),
		loc:DB.collection(`${id}.l`), log:DB.collection(`${id}.h`),
		_id:id, m:nc.m
	}
	c.itm.t='p', c.inv.t='i', c.loc.t='l', c.log.t='h';
	c.itm.c=c.inv.c=c.loc.c=c.log.c=c;
	await updateCat(c,nc);
	if(mkIdx) {
		if(mkIdx===2) await mkTSIndex(c);
		await c.itm.createIndex({n:1}, {unique:1});
		await mkIndexes(c.inv, [{p:1}, {l:1}]);
		await c.inv.createIndex({s:1,p:1}, {unique:1,
			partialFilterExpression:{s:{$type:'string'}}});
		await c.loc.createIndex({p:1});
		await c.loc.createIndex({n:1}, {unique:1});
	}
}
async function updateCat(c,nc) {
	updateCache(c,nc,CatDataFmt);
	if(c.h) await mkIndexes(c.log, [{t:1},{d:1},{p:1},{i:1},{l:1},{o:1},{h:1}]);
}

function mkIndexes(db, il, opts) {
	return il.eachAsync(async d => {await db.createIndex(d,opts)});
}

async function loadUsers() {
	Usr={}, Tkn={};
	for await(let u of DB.u.find()) {
		if(!u._id) continue;
		delete u.p;
		for(let k in u.k) Tkn[k]=u;
		Usr[u._id]=u;
	}
	await mkTSIndex();
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
A_RD=2**0, A_USR=2**1, A_ITM=2**2,
A_UP=2**3, A_CAT=2**4, A_WS=2**5,
//Auth Defaults
A_DEF=A_CAT-1, A_MAX=(2**6)-1,

/*
A_RD	Read Access (Global & Per-cat)
A_USR	View Users & Contacts (Global only)
A_ITM	Edit Access (Global & Per-cat)
A_UP	Upload Files (Global only)
A_CAT	Create & Edit Categories (Global & Per-cat)
A_WS	Edit Workspace Settings (Global only)
*/

//Field Types
I_TEXT=1, I_AREA=2, I_NUM=3, I_EMAIL=4, I_COLOR=5,
I_FILE=6, I_SWITCH=7, I_DROP=9, I_MULTI=10,
I_DATE=11, I_DATETIME=12;

//Default Workspace Config
WS={_id:0, _v:VER, r:true, a:{g:A_DEF}, c1:0xF25D26, c2:0x6ABF40};

//============================================== Commands ==============================================

const DomainFmt="[a-zA-Z0-9-](?:\\.?[a-zA-Z0-9-])*",
URLFmt=`(?:https?:\\/\\/${DomainFmt})?(?:[\\/.]?[a-zA-Z0-9-_])*`,
EmailFmt="[a-z0-9.!#$%&'`*+/=^_{}|~-]+@"+DomainFmt,
DomainOpt={t:'str|str',f:[null,DomainFmt],max:[0,NameMax]},
URLOpt={t:'str|str',f:[null,URLFmt],max:[0,NameMax]},
IDFmt={t:'str',len:11},
IDFmtOpt={t:'str|str',len:[0,11],req:0},
NameFmt={t:'str',min:1,max:NameMax},
CIDFmt={t:'str',f:'[a-z0-9]+',req:0},
BoolOpt={t:'bool',req:0},
CVField={
	t:{t:'str',f:'f'}, //Val Type
	i:CIDFmt, //Val Key ID
	n:NameFmt, //Display Name
},
CVFmt={t:'list', min:0, f:[
	//Field
	{...CVField, d:{t:'int',min:I_TEXT,max:I_AREA}, v:{t:'str'}},
	{...CVField, d:{t:'int',val:I_NUM}, m:{t:'float'}, x:{t:'float'}, p:{t:'int',min:0}, v:{t:'float'}},
	{...CVField, d:{t:'int',val:I_EMAIL}, v:{t:'str',f:EmailFmt}},
	{...CVField, d:{t:'int',val:I_COLOR}, v:{t:'int',min:0,max:0xFFFFFF}},
	{...CVField, d:{t:'int',val:I_FILE}, v:URLOpt},
	{...CVField, d:{t:'int',val:I_SWITCH}, v:{t:'bool'}},
	{...CVField, d:{t:'int',val:I_DROP}, v:{t:'str'}, e:BoolOpt, o:{t:'list',c:'str'}},
	{...CVField, d:{t:'int',val:I_MULTI}, v:{t:'list',c:'str',min:0}, e:BoolOpt, o:{t:'list',c:'str'}},
	{...CVField, d:{t:'int',min:I_DATE,max:I_DATETIME}, v:{t:'int'}},
	{t:{t:'str',f:'k'}, n:NameFmt, v:URLOpt}, //Link
	{t:{t:'str',f:'h'}, n:NameFmt}, //Heading
	{t:{t:'str',f:'t'}, n:{t:'str'}}, //Text
	{t:{t:'str',f:'p|i|l|u'}, i:CIDFmt, n:NameFmt, v:IDFmtOpt} //Part/Inv/Loc
]},
CVarType=['p','i','l'],
WSDataFmt={
	e:DomainOpt, //Email Domain
	r:{t:'bool'}, //Anon Read-Only
	q:{t:'bool'}, //Enable Invite Codes
	v:{t:'dict',c:{t:'int',min:0}}, //Invite Codes
	a:{ //Default Auth
		t:'dict',
		k:{t:'str|str',len:[11,null],f:[null,'g']},
		c:{t:'int',min:0,max:A_MAX}
	},
	c1:{t:'int',min:0,max:0xFFFFFF}, //Primary Color
	c2:{t:'int',min:0,max:0xFFFFFF} //Accent Color
	//i bool: Brand Logo
}, UsrDataFmt={
	e:{t:'str',f:EmailFmt,max:NameMax}, //Email
	n:{t:'str',min:2,max:NameMax}, //Nickname
	b:{t:'str',req:0}, //Bio
	c1:{t:'int',min:0,max:0xFFFFFF}, //Primary Color
	c2:{t:'int',min:0,max:0xFFFFFF} //Accent Color
	//a dict{cid|'g': int}: Auth Mask (cat/global)
	//p str: Pwd Hash
	//k dict: Tokens
}, UsrProj={n:1, e:1},
UsrViewProj={n:1, e:1, b:1, a:1},
CatDataFmt={
	n:NameFmt, //Name
	h:BoolOpt, //Track History
	i:BoolOpt, //Multi Inv
	e:{t:'list',c:IDFmt,min:0,req:0}, //Ext Locs
	pv:CVFmt, iv:CVFmt, lv:CVFmt //Custom Vars
	//TODO s:[subCats]
	//cat.s - _id:id, n:name, v:[varFields]
}, ItmDataFmt={
	n:NameFmt, //Name
	//TODO a:[altNames]
	//TODO s:IDFmtOpt, //SubCat ID
	d:{t:'str',req:0}, //Desc
	m:{t:'str',max:NameMax,req:0}, //Mfg
	i:{t:'str',max:NameMax,req:0}, //Icon URI
	v:CVFmt //Custom Vars
	//_i dict: Inv Data, if Multi Inv is off
	//_c uuid: Cat ID
}, ItmProj={
	n:1, d:1, m:1, i:1, l:1
}, InvDataFmt={
	//p uuid: Part ID
	l:IDFmt, //Loc ID
	q:{t:'int',min:1}, //Qty
	s:{t:'str',max:NameMax,req:0}, //SN
	//_c uuid: Cat ID
}, InvProj={
	p:1, l:1, q:1, s:1
}, LocDataFmt={
	n:NameFmt, //Name
	d:{t:'str',req:0}, //Desc
	p:IDFmtOpt, //Parent ID
	v:CVFmt //Custom Vars
	//_fn str: Full Name
	//_c uuid: Cat ID
}, LocProj={
	n:1, d:1, p:1, _fn:1
};

async function dbCmd(q,req,res) {
	let [t,k]=getTkn(req), id,c,d,j,n;
	if(req===0 && res===0) t={CON:1,e:"Console"};
	msg("[CMD]", q, t?C_USR(t.e)+` [${C_TKN(k)}]`:'');
	reqAuth(t,A_RD);
	if(!t || !t.CON) await waitUnlock();
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
		WSDataFmt.v.c.min=Date.now()-3600000; //Set min code exp
		schema.checkSchema(j=q[1], WSDataFmt, 1);
		if(j.e) j.e=j.e.toLowerCase();
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
	case 'su': //Settings Update [data]
		reqAuth(t,0,0,1);
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_OBJ,"Data",DataMax);
		j=q[1];
		if(j.e) {
			j.e=j.e.toLowerCase();
			if(WS.e && !j.e.endsWith('@'+WS.e)) throw "Email not authorized on this domain";
		}
		schema.checkSchema(j, UsrDataFmt, 1);
		await updOne(DB.u, t._id, dbSet(j));
		updateCache(t,j);
		return 1;
	case 'lo': //Log Out
		reqAuth(t,0,0,1);
		await delTkn(k).catch(err);
		res.writeHead(200,'',{'set-cookie':"k=;Max-Age=0"});
		res.end(); return 2;
	case 'di': //Delete Image
		reqAuth(t,A_WS);
		if(q.length !== 2) throw "Bad Args";
		if(q[1] === 'l') {
			if(LOvr) await Promise.all([
				fs.rm(Res+"/logo.png"),
				fs.rm(Res+"/logoSml.png")
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
		updateCache(d={},c,CatDataFmt);
		d._id=c._id;
		return d;
	//List Part/Inv/Log [cid|pid, skip, pageSize[, extraInfo]] -or- List Loc [cid|pid]
	case 'pl': case 'il': case 'll': case 'hl':
		q.l=q[0]==='ll', q.h=q[0]==='hl', n=q.length;
		if(q.l ? n !== 2 : (n !== 4 && n !== 5)) throw "Bad Args";
		if(!(c=CatID[q[1]])) {
			if(q[0]==='il' || q.h) c=catFromID(id=q[1]);
			else if(q.l) c=catFromID(q[1]);
			if(!c) throw "Bad Cat ID";
		}
		if(q.length>4) asType(q,4,T_INT,"ExtraInfo",1);
		reqAuth(t, q.h?A_ITM:A_RD, c);
		j=getOf(q,ItmProj,InvProj,LocProj,0);
		//Extra Info - Custom Vars
		if(q[4] && (q.v=c[q[0][0]+'v'])) {
			j={...j};
			for(n of q.v) if(n.i) j['#c_'+n.i]=1;
		}
		d=[];
		if(id) d.push({$match:q.h ? {$or:[{p:id},{i:id},{l:id},
			{o:id},{h:id}]} : {$or:[{p:id},{l:id}]}});
		d.push({$sort:q.h?{d:-1}:{n:1}});
		if(!q.l) {
			//Extra Info
			if(q[4] && q[0]==='pl' && !c.i) q.x=[ //Single Inv
				{$lookup:{from:c.inv.s.namespace.collection,
					localField:'_i', foreignField:'_id', as:'_i'}},
				{$project:{...j, _i:{$arrayElemAt:['$_i', 0]}}}
			]; else q.x=j?[{$project:j}]:[];
			//Paging
			asType(q,2,T_INT,"Skip");
			asType(q,3,T_INT,"PageSize");
			q[2]=Math.max(q[2],0), q[3]=Math.max(q[3],0);
			utils.bounds(q[3],0,t?MaxPageSize:MaxPageSizeAnon);
			d.push({$facet:{
				m:[{$count:'c'}],
				d:[{$skip:q[2]}, {$limit:q[3]}, ...q.x],
			}});
		} else if(j) d.push({$project:j});
		j=await getTbl(q,c).aggregate(d).toArray(), d={};
		if(c._id !== q[1]) d.c=c._id; //Send Cat ID if != pid
		if(!q.l) { //Has Next Page
			j=j[0];
			if(!(n=j.m[0]) || n.c > q[2]+q[3]) d.n=1;
			if(q.h) for(n of j.d) n.d=n.d.getTime(); //Convert Dates to UTC time
			d.d=j.d;
		} else d.d=j;
		return d;
	case 'ul': //List User
		reqAuth(t, A_USR);
		return await DB.u.find({_id:{$ne:0}}, {projection:UsrProj}).toArray();
	case 'u': //Get User [id]
		if(q.length !== 2) throw "Bad Args";
		asType(q,1,T_ID);
		reqAuth(t, A_USR);
		d=await DB.u.findOne({_id:q[1]}, {projection:UsrViewProj});
		if(!d) throw "User not found";
		if(!hasAuth(t,A_WS)) for(n of Object.keys(d.a)) if(n!=='g') delete d.a[n];
		return d;
	case 'p': case 'i': case 'l': case 'h': //Get Part/Inv/Loc/Log [id]
		if(q.length !== 2) throw "Bad Args";
		c=catFromID(q[1]);
		reqAuth(t,A_RD,c);
		q.p=q[0]==='p';
		if(q.p && !c.i) { //Single Inv
			d=(await c.itm.aggregate([
				{$match:{_id:q[1]}},
				{$lookup:{from:c.inv.s.namespace.collection,
					localField:'_i', foreignField:'_id', as:'_i'}}
			]).toArray())[0];
		} else d=await getTbl(q,c).findOne({_id:q[1]});
		if(!d) throw "Entity not found";
		d._c=c._id;
		if(q.p && !c.i) {
			d._i=d._i[0];
			if(!d._i) throw `Invalid part: Missing inv data (To fix manually, `+
				`enable "Separate Items & Inventory" in cat settings)`;
		}
		return d;
	case 'pi': //Get PID for Inv [id]
		if(q.length !== 2) throw "Bad Args";
		c=catFromID(q[1]);
		reqAuth(t,A_RD,c);
		d=await c.inv.findOne({_id:q[1]}, {projection:{p:1}});
		if(!d) throw "Entity not found";
		return d.p;
	case 'q': //Search
		if(q.length !== 4) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		reqAuth(t,A_RD,c);
		asType(q,2,0,"Type",1);
		asType(q,3,0,"Name",NameMax);
		n=q[2], j=q[3];
		if(n==='a') {
			d=await Promise.all([search(c,t,'a',j), search(0,t,'u',j)]);
			c={};
			for(n of d) for(t in n) if((j=n[t]).length)
				t in c?c[t].push(...j):(c[t]=j);
			return c;
		}
		return await search(c,t,n,j);
	case 'ic': //ID Cache [cid]
		if(q.length !== 2) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		reqAuth(t,A_RD,c);
		d={}, j=[getCache(c,'p',d), getCache(c,'l',d)];
		if(hasAuth(t, A_USR)) j.push(getCache(0,'u',d));
		if(c.e) for(n of c.e) {
			if(!(n=CatID[n])) throw "Bad Ext Cat ID #"+n;
			if(hasAuth(t,A_RD,n)) j.push(getCache(n,'l',d));
		}
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
		j=q[1];
		//Custom vars
		for(d of CVarType) checkCVars(j[d+'v'],{},0,0,d);
		await Cat.insertOne(c={_id:id, m:n, ...j});
		await addCat(c,2);
		return id;
	/*case 'sn': //New SubCat [cid, name] -> id
		reqAuth(t,A_CAT);
		if(q.length !== 3) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad Cat ID";
		asType(q,2,0,"Name",NameMax);
		id=(await UUID.genUUID(null,c.m)).toString();
		d=await Cat.updateOne({_id:q[1]}, {$push:{s:{_id:id, n:q[2]}}});
		if(d.modifiedCount !== 1) throw "Cat not found";
		return id;*/
	//New Part/Loc [cid, data] -or- New Inv [pid, data] -> id
	case 'pn': case 'in': case 'ln':
		q.i=q[0]==='in', q.l=q[0]==='ln';
		if(q.length !== 3) throw "Bad Args";
		if(!(c=q.i?catFromID(q[1]):CatID[q[1]])) throw "Bad Cat ID";
		reqAuth(t,A_ITM,c);
		if(q.i) asType(q,1,T_ID,"Part ID");
		asType(q,2,T_OBJ,"Data",DataMax);
		n=getCmnt(j=q[2]), q.v=getCVals(j);
		schema.checkSchema(j, getOf(q,ItmDataFmt,InvDataFmt,LocDataFmt));
		j._id=id=(await UUID.genUUID(null,c.m)).toString();
		q.tbl=getTbl(q,c);
		if(q.l) { //Verify loc tree, calc fn
			await dbLock(req);
			d=await q.tbl.find({}, {projection:{n:1, p:1}}).toArray();
			d.push(j), tblToTree(d,0,1);
		} else if(q.i) { //Verify part ID
			d=await c.itm.findOne({_id:q[1]});
			if(!d) throw "Part not found";
			if(!c.i && d._i) throw "Cannot create inventory in Single Inv mode";
			j.p=q[1];
		}
		q.cat=c;
		checkCVars(j.v, q);
		setCVals(q.v, j.v, q, j);
		await insOne(q.tbl, j);
		if(q.i && !c.i) //Single Inv
			await updOne(q.tbl, q[1], {$set:{_i:id}});
		d=q.i?{q:j.q, p:j.p, l:j.l}:{n:j.n};
		if(q.l && j.p) d.h=j.p;
		dbLog(c, getOf(q,LOG_PC,LOG_IC,LOG_LC), id, q[0][0], t, n, d);
		return id;
	//-------- Update --------
	case 'cu': //Cat Update [id, data[, confirm]]
		if(q.length !== 3 && q.length !== 4) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad ID";
		reqAuth(t,A_CAT,c);
		asType(q,2,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[2], CatDataFmt, 1);
		if('i' in j) { //Test migration to multi/single inv mode
			await dbLock(req);
			q.i=c.i, c.i=j.i;
			try {await chkItems(c)}
			catch(e) {c.i=q.i; await chkItems(c); throw e}
		}
		//Custom vars
		for(n of CVarType) {
			if(!(q.j=j[n+'v'])) continue;
			q.q={cat:c, tbl:getTbl(n,c), cf:!!q[3]};
			checkCVars(q.j, q.q, q.del={}, c, n);
			if(q.del.$unset) await updAll(q.q.tbl, q.del);
		}
		d=await Cat.updateOne({_id:q[1]}, dbSet(j));
		if(d.matchedCount !== 1) throw "Cat not found";
		await updateCat(c,j);
		return 1;
	case 'pu': case 'iu': case 'lu': //Part/Inv/Loc Update [id, data[, confirm]]
		if(q.length !== 3 && q.length !== 4) throw "Bad Args";
		c=catFromID(id=q[1]);
		reqAuth(t,A_ITM,c);
		asType(q,2,T_OBJ,"Data",DataMax);
		n=getCmnt(j=q[2]), q.v=getCVals(j);
		schema.checkSchema(j, getOf(q,ItmDataFmt,InvDataFmt,LocDataFmt), 1);
		q.tbl=getTbl(q,c);
		if(q[0]==='lu' && ('n' in j || 'p' in j)) { //Verify loc tree, calc fn
			await dbLock(req);
			d=await q.tbl.find({}, {projection:{n:1, p:1}}).toArray();
			let a=d.each(l => l._id===id?l:null);
			if(!a) throw "Entity not found";
			q.ol=a.p, updateCache(a,j);
			tblToTree(d,0,2);
			q.d=a, j._fn=a._fn;
		} else if(q[0]==='iu' && ('l' in j || 'q' in j)) { //Get old loc
			q.a=await q.tbl.findOne({_id:id});
			if(!q.a) throw "Entity not found";
			q.p=q.a.p, q.ol=q.a.l, q.oq=q.a.q;
		}
		q.j=dbSet(j);
		//Custom vars
		if(j.v || q.v) {
			if(j.v) await dbLock(req);
			let a=q.a;
			if(!a) {
				a=await q.tbl.findOne({_id:id});
				if(!a) throw "Entity not found";
			}
			q.cf=!!q[3], q.cat=c, q.upd=1;
			checkCVars(j.v, q, q.j, a);
			setCVals(q.v, j.v||a.v, q, q.j);
		}
		await updOne(q.tbl, id, q.j);
		if(q.d && q.d.c) { //Update fn for all descendants
			let v,p=[],fn=a => {for(v of a.c) {
				p.push(updOne(q.tbl, v._id, {$set:{_fn:v._fn}}));
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
	case 'uu': //User Update [id, data]
		if(q.length !== 3) throw "Bad Args";
		reqAuth(t,A_WS,c);
		asType(q,2,T_OBJ,"Data",DataMax);
		schema.checkSchema(j=q[2], {a:WSDataFmt.a});
		if(q[1]===t._id && !(j.a.g&A_USR && j.a.g&A_WS))
			throw "Oops, you can't revoke your own admin access!";
		d=await DB.u.updateOne({_id:q[1]}, dbSet(j)), n=Usr[q[1]];
		if(d.matchedCount !== 1 || !n) throw "User not found";
		updateCache(n,j);
		return 1;
	//-------- Delete --------
	case 'cd': //Del Cat [id]
		reqAuth(t,A_WS);
		if(q.length !== 2) throw "Bad Args";
		if(!(c=CatID[q[1]])) throw "Bad ID";
		await dbLock(req);
		d=await Cat.deleteOne({_id:q[1]});
		await Promise.all([dropTSIndex(c), loadCats()]);
		if(d.deletedCount !== 1) throw "Cat not found";
		return 1;
	//TODO case 'sd': //Del SubCat
	case 'pd': case 'id': case 'ld': //Del Part/Item/Location [id, cmnt]
		if(q.length !== 2 && q.length !== 3) throw "Bad Args";
		c=catFromID(id=q[1]);
		reqAuth(t,A_ITM,c);
		asType(q,2,0,"Comment",NameMax,1);
		q.tbl=getTbl(q,c);
		if(q[0]==='id') {
			let a=await q.tbl.findOne({_id:id});
			if(!a) throw "Entity not found";
			q.p=a.p;
			if(!c.i) await delOne(c.itm, q.p); //Del part w/ inv in Single Inv
		} else if(q[0]==='pd') await delMany(c.inv, {p:q.p});
		await delOne(q.tbl, id);
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

async function getCache(cat, type, dat) {
	let dl=await getTbl(type,cat).find(type==='u'?{_id:{$ne:0}}:{},
		{projection:type==='l'?{_fn:1}:{n:1}}).toArray(),d,n;
	for(d of dl) if(n=d._fn||d.n) dat[d._id]=n;
}

//============================================== Custom Data ==============================================

//Check validity of custom var table
function checkCVars(cVar, q, j, jOld, key='') {
	if(!cVar) return;
	let c,o,i,ck={},ce=[],co=jOld && jOld[key+'v'];
	if(co) co=cvToDict(co);
	for(c of cVar) try {
		if(!(i=c.i)) continue;
		if(i in ck) throw "Duplicate ID";
		ck[i]=c;
		if(co && (o=co[i])) { //Existing var
			if(c.t!==o.t || c.d!==o.d) {
				if(q.cf) o._d=1; else ce.push(o.n);
			}
		}
		//Verify vars schema
		if(q.ltm) schema.checkSchema(c, CVFmt.f);
	} catch(e) {throw schema.errAt('CV #'+i,e)}
	if(ce.length)
		throw new ConfirmErr(`This action will erase values of ${ce.join(', ')}`);
	//Delete vals for removed vars
	if(key) key='c_';
	if(co) for(i in co) if(!(i in ck) || co[i]._d) {
		o='#'+key+i; if(key || o in jOld) (j.$unset||(j.$unset={}))[o]=1;
		o+='!o'; if(key || o in jOld) (j.$unset||(j.$unset={}))[o]=1;
		delete co[i]._d;
	}
	//Verify vals schema
	if(q && q.ltm) {
		q.del={};
		setCVals(getCVals(j), cVar, q);
		c=Object.keys(q.del);
		if(c.length) {
			print(`Delete ${j.n} (#${j._id}) Unused CVs:`,c);
			q.ltm.push(updOne(q.tbl, j._id, {$unset:q.del}));
		}
	}
}

//Custom vars list -> dict by ID
function cvToDict(cv) {
	if(!cv) throw "Setting CVals, but no matching CVar list found";
	let c,ck={};
	for(c of cv) if(c.i) ck[c.i]=c;
	return ck;
}

//Extract custom vals from data dict
function getCVals(j) {
	let k,cv;
	for(k in j) if(k.startsWith('#'))
		(cv||(cv={}))[k]=j[k], delete j[k];
	return cv;
}

//Update custom vals
function setCVals(cVal, cVar, q, j) {
	if(!cVal) return;
	let k,v,o,i,c,ik,ck;
	for(k in cVal) try {
		i=k.slice(1), v=cVal[k];
		if(o=i.endsWith('!o')) i=i.slice(0,-2);
		if(i.startsWith('c_')) { //Cat Var
			if(!ck) ck=cvToDict(q.cat[q[0][0]+'v']);
			c=ck[i.slice(2)]; if(c) c={...c};
		} else { //Itm Var
			if(!ik) ik=cvToDict(cVar);
			c=ik[i];
		}
		if(!c) {
			if(q.ltm) {q.del[k]=1; continue} //Add to delete queue
			throw "No such CV key";
		}
		if(o) {
			if(c.t!=='f' || !c.e || (c.d!==I_DROP && c.d!==I_MULTI))
				throw "Opts list only supported on editable DROP or MULTI type";
			i=c.o, c.o=v;
		} else i=c.v, c.v=v;
		schema.checkSchema(c, CVFmt.f);
		//Set or unset val
		if(q.ltm) continue; //Check schema only
		if(i==null ? valToBool(v) : JSON.stringify(v)!==JSON.stringify(i)) {
			if(q.upd) (j.$set||(j.$set={}))[k]=v; else j[k]=v;
		} else if(q.upd) (j.$unset||(j.$unset={}))[k]=1;
	} catch(e) {throw schema.errAt(k,e)}
}

//============================================== User Auth ==============================================

class TknExpErr extends Error {
	constructor(e) {super(e||"Expired token"), this.name='TknExpErr'}
}
class ConfirmErr extends Error {
	constructor(e) {super(e+". Are you sure?"), this.name='ConfirmErr'}
}

function hasAuth(t,lv,cat) {
	if(lv===A_RD && WS.r) return 1; //Anon read-only
	if(t && t.CON===1) return 1; //Console
	if(!t || !t.k) return; //Bad token
	return !lv || ((t.a[cat]||t.a.g) & lv);
}
function reqAuth(t,lv,cat,noCon) {
	if(noCon && t && t.CON) throw "Console cannot run this command";
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
		u.k[k]=new Date();
		let r={$set:{k:u.k}};
		if(b) {
			if(q.s) throw "Account already exists";
			if(!await ar2.verify(u.p, t.p)) throw '';
		}
		r=await DB.u.updateOne({_id:u._id}, r);
		if(r.modifiedCount !== 1) throw "Unknown error";
	} else { //New User
		if(b && !q.s) throw '';
		if(WS.q) {
			if(!q.v) return 'V';
			if(!WS.v || !WS.v[q.v]) throw "Invalid or expired invite code";
			await delInvite(q.v);
		}
		let id=(await UUID.genUUID()).toString(), a=WS.a;
		if(!Object.keys(Usr).length) a={g:A_MAX}; //Give first user admin
		u={_id:id, e:t.e, a:a, c1:WS.c1, c2:WS.c2, k:{[k]:new Date()}};
		if(b) {
			let n=t.e.slice(0,t.e.indexOf('@')), x=n.indexOf('.');
			u.n=n.charAt(0).toUpperCase()+(x!==-1 ? n.slice(1,x)+n.charAt(x+1).toUpperCase() : n.slice(1));
			u.p=await ar2.hash(t.p, {hashLength:48});
		} else u.n=t.n;
		await insOne(DB.u, u);
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

//============================================== Maintenance ==============================================

let LTMLast, MErr, MR;

//Run periodic maintenance
async function mLoop(LTM) {
	if(MR) return; MR=1;
	if(!LTM) LTM=Date.now()-LTMLast >= MsDay;
	if(LTM) await dbLock(LTM={});
	try {await mRun(LTM)}
	catch(e) {err(e), MErr=`${e}`, WS._c=WSCk()}
	finally {dbUnlock(LTM), MR=0}
}
async function mRun(LTM) {
	let now=new Date();
	if(LTM) LTMLast=now.getTime();
	print(C.dim(C.yellow(`[Running ${LTM?"long term ":''
		}maintenance @ ${utils.formatDate(now,LogDateFmt)}]`)));
	//Refresh WS, Cat, Usr cache
	if(LTM) {
		await Promise.all([loadCats(1), loadUsers(),
			async () => WS=await DB.u.findOne({_id:0})]);
		WS._c=WSCk();
	}
	//Expire tokens
	let k,t,d,x,p=[];
	for(k of Object.keys(Tkn)) {
		t=Tkn[k], d=t.k[k], x=now-d;
		print("Token", C_TKN(k), "for", C_USR(t.e),
			"last seen", C_VAL(utils.formatDate(d,ExpFmt)),
			"expires in", C.bold(C.blue(Math.ceil((TknExp-x)/3600000)+'h')));
		if(x >= TknExp) p.push(delTkn(k).catch(err));
	}
	//Push token cache to DB
	for(let k of Object.keys(Usr)) {
		p.push(async () => {
			let u=Usr[k], r=await DB.u.updateOne({_id:k}, {$set:{k:u.k}});
			if(r.matchedCount !== 1) {
				print(C.red(`User ${u.e} deleted`));
				for(r in u.k) delete Tkn[r];
				delete Usr[k];
			}
		});
	}
	await Promise.all(p);
	//Expire invites
	if(WS.v) for(k in WS.v) {
		d=new Date(WS.v[k]);
		if(now > d) {
			print("Invite", C_TKN(k), "expired", C_VAL(utils.formatDate(d,ExpFmt)));
			await delInvite(k);
		}
	}
	//Unused tables
	let c;
	if(LTM) for await(k of DB.listCollections()) {
		k=k.name;
		if(k!=='cat' && k!=='usr') {
			x=k.indexOf('.'), t=k.slice(x+1), c=k.slice(0,x);
			if(x===-1 || !(c in CatID) || (t!=='p' && t!=='i' && t!=='l' && t!=='h')) {
				print(C.bgRed("Dropped unused table", k));
				await DB.collection(k).drop();
			}
		}
	}
	//Check cats
	if(LTM) for(c in CatID) {
		c=CatID[c];
		print(`- Checking Cat ${c.n} (#${c._id})`);
		if(!(c.m>0 && c.m<256)) throw "Bad Magic "+c.m;
		await Promise.all([chkCat(c), chkItems(c), chkInv(c), chkLocs(c)]);
		await mkTSIndex(c);
	}
	//TODO Auto-purge unused uploaded files
}

async function chkCat(c) {
	let lc,u;
	//Delete invalid cats from Ext Loc list
	if(c.e) for(lc of c.e) if(!CatID[lc] || lc===c._id) u=1, delete c.e[lc];
	if(u) await Cat.updateOne({_id:c._id}, {$set:{e:c.e}});
}
async function chkItems(c) {
	let i,m,p=[];
	for await(i of c.itm.find({}, {projection:{d:0, m:0, i:0}})) try {
		//Check magic
		m=new UUID(i._id).getMagic();
		if(m !== c.m) throw `ID Magic ${m} != Cat Magic ${c.m}`;
		if(c.i) { //Multi Inv
			if('_i' in i) p.push(c.itm.updateOne({_id:i._id}, {$unset:{_i:1}}));
		} else { //Single Inv
			let il=await c.inv.find({p:i._id}, {projection:{q:1}}).toArray(),q=0;
			if(!il.length) throw "Part has no inv data";
			il.each(n => {q+=n.q, p.push(c.inv.deleteOne({_id:n._id}))},1);
			il=il[0];
			if(q) p.push(c.inv.updateOne({_id:il._id}, {$set:{q:il.q+q}}));
			if(i._i !== il._id) p.push(c.itm.updateOne({_id:i._id}, {$set:{_i:il._id}}));
		}
		//Update history name
		if(c.h) p.push(c.log.updateOne({t:LOG_PC, p:i._id}, {$set:{n:i.n}}));
		checkCVars(i.v, {0:'p', ltm:p, cat:c, tbl:c.itm}, i);
	} catch(e) {throw schema.errAt(`Itm ${i.n} (#${i._id})`,e)}
	await Promise.all(p);
}
async function chkInv(c) {
	let i,m,ml,p=[];
	//Check for missing loc
	ml=await c.loc.findOne({$or:[{n:"Missing"},{n:"Unknown"}]}, {projection:{_id:1}});
	if(ml) ml=ml._id;
	for await(i of c.inv.find({}, {projection:{q:0, s:0}})) try {
		//Check magic
		m=new UUID(i._id).getMagic();
		if(m !== c.m) throw `ID Magic ${m} != Cat Magic ${c.m}`;
		//Check for part/loc
		if(!await c.itm.findOne({_id:i.p})) {
			print(C.bgRed(`Deleted Inv #${i._id} w/ missing part`));
			p.push(c.inv.deleteOne({_id:i._id}));
		} else if(!await c.loc.findOne({_id:i.l})) {
			print(`Inv #${i._id} has missing loc`);
			if(!ml) ml=await dbCmd(['ln',c._id,'"n":"Unknown"'],0,0);
			p.push(c.inv.updateOne({_id:i._id}, {$set:{l:ml}}));
		}
		checkCVars(i.v, {0:'i', ltm:p, cat:c, tbl:c.inv}, i);
	} catch(e) {throw schema.errAt(`Inv #${i._id}`,e)}
	await Promise.all(p);
}
async function chkLocs(c) {
	let ll=await c.loc.find({}, {projection:{d:0, _fn:0}}).toArray(),m,p=[];
	tblToTree(ll, l => {try {
		//Check magic
		m=new UUID(l._id).getMagic();
		if(m !== c.m) throw `ID Magic ${m} != Cat Magic ${c.m}`;
		//Update full name
		p.push(c.loc.updateOne({_id:l._id}, {$set:{_fn:l._fn}}));
		//Update history name
		if(c.h) p.push(c.log.updateOne({t:LOG_LC, l:l._id}, {$set:{n:l.n}}));
		checkCVars(l.v, {0:'l', ltm:p, cat:c, tbl:c.loc}, l);
	} catch(e) {throw schema.errAt(`Loc ${l.n} (#${l._id})`,e)}},1);
	await Promise.all(p);
}

async function genTkn() {
	let u=await UUID.genUUID(), r=await UUID.randBytes(24);
	u=u.toString()+r.toString('base64url');
	if(Tkn[u]) throw "Token collision!?";
	return u;
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

async function delInvite(k) {
	delete WS.v[k];
	await DB.u.updateOne({_id:0}, {$unset:{['v.'+k]:1}});
}

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
		if(v instanceof Object) return Object.keys(v).length>0;
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

function err(e) {console.error(C.red(e.stack||e))}
function msg() {
	let d=utils.formatDate(new Date(), LogDateFmt);
	Array.prototype.splice.call(arguments,0,0,C.green(`[${d}]`));
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

const R_CS=/''|'.*?[^\\]'|{.+}|\[.+\]|[^\s]+/g,
R_CJ=/^'/, R_CR=/\\(')/g;

read.createInterface({input:process.stdin,
		output:process.stdout}).on('line', async cs => {
	let c=[],m;
	while(m=R_CS.exec(cs)) {
		if(R_CJ.test(m=m[0])) m=m.replace(R_CR,'$1');
		c.push(m);
	}
	try {print('->',await dbCmd(c,0,0))}
	catch(e) {print('->',C.red(e.stack||e))}
});