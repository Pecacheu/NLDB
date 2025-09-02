//NLDB, Pecacheu 2025. GNU GPL v3
'use strict';

let Usr, Dat, Cat, IDCache, Edit, Dty, DB, WS, LM, LT, LScr,
Loader, safeHTML, MStack=[], MCmd, NavHist=[], PageLen;
const HELP_URI="https://github.com/Pecacheu/NLDB",
R_UC=/[A-Z]/, IDCMaxAge=3600000, ICLen=8,
ICExp=24*3600000, TblStrMax=100, SearchDelay=350,
H_MIN={p:56, l:56, c:100, ct:39, h:87};

//============================================== UI & Nav ==============================================

/*Disco Mode
let hue=0;
setInterval(() => {
	DB.style.setProperty('--h1', hue);
	DB.style.setProperty('--h2', hue+180);
	DB.mt.content=DB.tc=getComputedStyle(DB).getPropertyValue('--hdr-bg');
	if((hue+=1) >= 360) hue -= 360;
}, 50);*/

onload=() => {try {
	DB=document.body;
	DB.mt=document.querySelector('meta[name=theme-color]');
	let lp=!('MENU' in window), ck=utils.getCookies();
	//User
	Usr=ck.u||localStorage.getItem('u');
	if(ck.u) utils.remCookie('u');
	if(!lp && Usr) {
		Usr=JSON.parse(Usr);
		if(ck.k) Usr.k=ck.k; else if(Usr.k) utils.setCookie('k',Usr.k);
		localStorage.setItem('u', JSON.stringify(Usr)), getNS();
	}
	//Workspace & Theme
	if(!(WS=ck.w)) throw "Failed to load workspace (Check your cookie settings)";
	WS=WS.split('~');
	if(!lp) NV.textContent='v'+WS[0];
	setTheme(Number(localStorage.getItem('t')), 0, '#'+WS[1], '#'+WS[2]);
	//Login Page
	if(lp) {
		BL.onclick=BS.onclick=login;
		return DB=utils.onNav=onresize=onscroll=onkeydown=null;
	}
	//HTML Parser
	let h=HtmlSanitizer;
	h.AllowedSchemas.splice(0,100,'/?p:','/?i:','/?l:','/?u:','https:','data:');
	delete h.AllowedAttributes.id, delete h.AllowedTags.DIV;
	safeHTML=h.SanitizeHtml;
	//Header
	THB.onclick=() => go(`/?${DB._v}t:${DB._i}`);
	SHB.onclick=() => searchMenu();
	MHB.onclick=userMenu;
	BACK.onclick=async () => {
		if(Dat && (Edit||Dty)) {
			setEdit(0);
			if(Dty) Dty=0, utils.onNav(1);
		} else goBack();
	}
	EDIT.onclick=() => {Edit||DB._v[0]==='l'?editor(NE_TYPE[DB._v]):setEdit(1)}
	SAVE.onclick=async (_,dat=Dat) => {try {
		if(!dat || !dat._v) return;
		let d={},c;
		//Set custom vals
		await dat._v.children.eachAsync(async e => {
			if(!e.d.i) return;
			let k='#'+e.d.i, v=e.i.get?await e.i.get():e.i.value;
			if(neq(v, dat[k], e.d.v)) d[k]=v,c=1;
			//Options
			if(e.i.getOpts) {
				v=e.i.getOpts();
				if(neq(v, dat[k+':o'], e.d.o)) d[k+':o']=v,c=1;
			}
		});
		if(c) {
			await dbPost(DB._v[0]==='l'?'lu':'pu', dat._id, d);
			for(let k in d) dat[k]=d[k];
		}
		setEdit(Dty=0);
	} catch(e) {err(e)}}
	//Menu
	MENU.bs=new bootstrap.Modal(MENU), OC.bs=new bootstrap.Offcanvas(OC);
	MENU.addEventListener('hide.bs.modal', e => {
		if(MCmd.hide) MCmd.hide(1);
		let m=MStack.pop();
		delete MB.m; if(!m) return;
		e.preventDefault(), mkMenu(...m[0]), MCmd=m[2];
		for(e of m[1]) MB.appendChild(e);
		for(e in MCmd) if(Array.isArray(e=MCmd[e])) e[0].onclick=e[1];
		if(MCmd.show) MCmd.show();
	});
	MENU.addEventListener('hidden.bs.modal', () => {
		let a=MENU.a; MENU.a=0;
		if(a===1) return MENU.bs.show();
		_rstMenu(), MB.textContent='', MENU.w=0;
		if(Dty===1) Dty=0;
	});
	MENU.addEventListener('shown.bs.modal', () => {
		let a=MENU.a; MENU.a=0;
		if(a===2) return MENU.bs.hide();
		if(MCmd.show) MCmd.show(1);
	});
	CFG.onclick=() => editor(DB._v, DB._i);
	O_QR.onclick=() => genQr(location.href);
	O_LL.onclick=() => go('?ll:'+Cat._id,2);
	O_HL.onclick=() => go('?h:'+Cat._id,2);
	O_UL.onclick=() => go('?ul',2);
	O_TH.onclick=() => {setTheme(LM>1?(LM===3?2:3):(LM?0:1),1),userMenu()}
	O_SE.onclick=() => editor('s');
	O_LI.onclick=() => go('/login',1);
	O_LO.onclick=() => {
		if(!Edit) dbGet('lo').then(() => logout(1)).catch(err);
	}
	UV.textContent=utils.VER;
	//Show Error
	if(WS[3]) {
		mkMenu("Error during maintenance");
		utils.mkDiv(MB, null, {color:'red'}).textContent=WS[3];
		showMenu();
	}
} catch(e) {
	utils.onNav=null;
	for(let c in utils.getCookies()) utils.remCookie(c);
	if('localStorage' in window) localStorage.clear();
	alert(e); throw e;
}}

function setTheme(lm, upd, c1, c2) {
	if(upd) localStorage.setItem('t',lm);
	DB.setAttribute('data-bs-theme', lm===1||lm===3?'light':'dark');
	if(c1) {
		c1=getHSL(c1), c2=getHSL(c2);
		DB.style.setProperty('--h1', c1[0]);
		DB.style.setProperty('--sl1', `${c1[1]}%,${c1[2]}%`);
		DB.style.setProperty('--h2', c2[0]);
	}
	DB.mt.content=DB.tc=getComputedStyle(DB).getPropertyValue('--hdr-bg');
	DB.classList.toggle('retro', lm>1), LM=lm;
}
async function login(e) {
	e.preventDefault();
	//TODO Enforce password rules for decent security?
	ERR.textContent='';
	let d={u:USR.value, p:PWD.value}, v=IC.value;
	if(v) d.v=v;
	if(this===BS) d.s=1; //This is BS!
	ERR.innerHTML="Loading...";
	try {
		let r=await getUri('/auth',utils.toQuery(d));
		if(r==='V') {
			ERR.innerHTML=IC.hidden?'':"Invite code required";
			IC.hidden=0;
		} else go('/',1);
	} catch(e) {
		console.error(e);
		ERR.innerHTML=e;
	}
}
function logout(f) {
	if(!Usr) f=0;
	Usr=null, utils.remCookie('k');
	localStorage.clear();
	if(f) { //Refresh View
		utils.onNav(1);
		if(OC.bs._isShown) userMenu();
	}
}

//Touch Keyboard Detect
if('visualViewport' in window) {
	let TD;
	visualViewport.onresize=e => {
		let h=e.target.height, tk=(h*e.target.scale)/utils.h < .75;
		TD=tk && MENU.bs._isShown && visualViewport.height >
			MENU.firstChild.boundingRect.h+16;
	}
	document.documentElement.addEventListener('touchmove', e => {
		if(TD) e.preventDefault();
	}, {passive:false})
}
onresize=() => {
	let h=utils.h;
	if(DB._v && DB._v[0]==='l') {
		let v=CONT.querySelector('.lv'), f=CONT.firstChild;
		if(f) f.style.paddingBottom = v?v.boundingRect.h+'px':0;
		if(v) v.classList.toggle('lvFull', v.lastChild.boundingRect.bottom
			- v.firstChild.boundingRect.y + 200 > h);
	}
	if(MENU.w) MENU.classList.toggle('mSnap', utils.w < MENU.w+56);
	calcPLen();
}
onscroll=e => {
	e=e.target;
	if(e===document) e=DB;
	let sy=e.scrollTop, h=sy-LScr > 0;
	HDR.classList.toggle('hide',h);
	FTR.classList.toggle('hide',h);
	LScr=sy;
	if(Loader && !Loader.l && e.scrollHeight -
		utils.h - sy < 200) Loader._load();
}
/*TODO
onkeydown=e => {
	if(e.key == 'Home') return go('/');
	if(Usr) { //User-only commands
		if(e.key == 'ContextMenu') return setEdit(!Edit);
		if(e.key == 'Alt') return mDirty();
		if(e.key == 'Insert' && !nAdd.hidden) return nAdd.onclick();
		if(Menu && e.key == 'Escape') return Menu.rem();
	}
	if(EditDone) {
		if(e.key == 'Enter') EditDone(1); else if(e.key == 'Escape') EditDone();
	} else if(e.key == 'Escape' && !nBack.hidden) nBack.onclick();
}*/
onbeforeunload=() => Dty?1:null;
function calcPLen() {
	let m=H_MIN[DB._v];
	PageLen=m?Math.ceil(utils.h/m):10;
}

utils.onNav = async f => {
	let q=location.search.slice(1);
	DB._lv=DB._v||'';
	[DB._v, DB._i] = parseNav(DB._q=q);
	//Header
	MHB.className=Usr?'user':'';
	MHB.lastChild.textContent=Usr?Usr.ns:'';
	setEdit(Edit,1);
	//Draw View
	loadAbort();
	if(f===1) clear();
	calcPLen();
	try {
		switch(DB._v) {
			case 'c': await plView(); break;
			case 'ct': await plView(0,1); break;
			case 'p': case 'i': await partView(); break;
			case 'll': case 'l': await locView(); break;
			case 'h': await hlView(); break;
			case 'ul': await ulView(); break;
			default:
				if(q) {await setCat(); throw "Bad Path"}
				await catView();
		}
	} catch(e) {
		console.error(e);
		if(e.name==='AbortError') return;
		DB._v='', clear(), setEdit(0), EDIT.hidden=1;
		CONT.innerHTML=safeHTML(`<p style='color:red'>${e}</p>`);
	} finally {
		onresize(), clearTimeout(LT);
		LT=0, DB.mt.content=DB.tc;
		let ls=LOAD.style, ts=LOAD.firstChild.style;
		ls.opacity=0, ts.animation=null, ls.zIndex=980;
		setTimeout(() => ls.display='none',220);
		DB.setAttribute('load','');
	}
}

function go(uri, force, isBack) {
	let l=location, o=l.origin, u=new URL(uri,o), s=u.search.slice(1);
	if((o=u.origin===o) && !isBack && DB) { //History for goBack
		let v=DB._v, p=l.pathname+l.search;
		if(v[0]==='l') rmHist('l');
		else if(v==='i'||v==='p') rmHist('i','/?p:'+Dat._id);
		else rmHist(0,p);
		NavHist.push(p);
		if(NavHist.length > 5) NavHist.splice(0,1);
	}
	o=o&&s;
	if(Dat && (Edit||Dty)) {
		if(Dty) return err("You haven't saved your changes! Please press Save or Cancel.");
		if(o && force!==2) return editor(...parseNav(s));
		setEdit(0);
	}
	if(force===1) location=uri;
	else if(o && s.startsWith('u:')) viewUser(parseNav(s)[1]);
	else utils.go(uri);
}

function goBack() {
	let v=DB._v,n;
	if(v==='c') n='/';
	else if(v==='i' && Dat) rmHist('i',n='/?p:'+Dat._id);
	else if(NavHist.length) n=NavHist.pop();
	else n=Cat?'/?c:'+Cat._id:'/';
	if(n==='/') NavHist=[];
	go(n,0,1);
}

function parseNav(q) {
	let x=q.indexOf(':');
	return [x===-1?q:q.slice(0,x), x===-1?'':q.slice(x+1)];
}

function setEdit(e,f) {
	Edit=e;
	let v=DB._v, hv=v==='h', pv=v==='p'||v==='i',
	pe=e&&pv, uv=v==='ul', lv=v[0]==='l', ab=e||lv;
	EDIT.hidden=(O_SE.hidden=!Usr) || hv || pv || (e&&uv);
	EDIT.innerHTML=`<i class='bi${ab?"'>&#xF4FE":" i20'>&#xF4C8"};</i>`;
	EDIT.title=ab?"Add":"Edit";
	BACK.innerHTML=`<i class=bi>&#x${e?'F62A':'F12C'};</i>`;
	BACK.title=e?pv?"Cancel":"Done":"Back";
	BACK.hidden=!DB._q && !e;
	CFG.hidden=!Usr || hv || uv || !DB._q || ab;
	SHB.hidden=!v || uv || pe;
	THB.hidden=v!=='c';
	SAVE.hidden=!(MHB.hidden=pe);
	if(lv && (lv=CONT.querySelector('.lv .SAVE'))) lv.hidden=!e;
	if(!f) setCat(Cat);
}

//============================================== View Draw ==============================================

async function catView() {
	clear(), setTitle();
	Dat=await dbGet('cl'), await setCat();
	if(!Dat.length) return CONT.innerHTML="<i class=na>No categories yet...</i>";
	let c=utils.mkDiv(CONT,'cl'),d;
	for(d of Dat) draw(c,'c',d);
}

async function plView(skip=0, tbl) {
	let pl=PageLen, d=dbGet('pl', DB._i, skip, pl, ...(tbl?[1]:[])),c,n;
	if(skip) {
		d=await d, Dat.push(...d.d), n=d.n;
		c=CONT.firstChild, c.textContent='';
	} else {
		clear();
		d=[d, setCat(DB._i)];
		if(tbl) d.push(getCache(DB._i));
		d=(await Promise.all(d))[0];
		setTitle(Cat.n), Dat=d.d, n=d.n;
		if(!Dat.length) return CONT.innerHTML="<i class=na>No parts yet...</i>";
		c=utils.mkDiv(CONT,tbl?'':'pl');
	}
	utils.mkEl('h1',c).textContent=Cat.n;
	if(tbl) {
		let t=["Item ID", "Name", "OEM", "Description"];
		if(!Cat.i) t.push("Serial #", "Qty", "Location");
		tbl=[t];
		for(d of Dat) {
			t=[`<a href=/?p:${d._id}>${d._id}</a>`, tblStr(d.n), tblStr(d.m), tblStr(d.d)];
			if(!Cat.i && d._i) t.push(d._i.s, d._i.q, lnkID(d._i.l,'l'));
			tbl.push(t);
		}
		mkTable(c,tbl);
	} else for(d of Dat) draw(c,'p',d);
	if(n) mkLoader(c,skip+pl,s => plView(s,tbl));
}

async function hlView(skip=0) {
	let si=DB._i.split(','), t=si.length===2?si[0]:0, i=si[1]||si[0],
	pl=PageLen, d=dbGet('hl', i, skip, pl),c,n;
	if(skip) {
		d=(await Promise.all([d, getCache()]))[0];
		Dat.push(...d.d), n=d.n;
		c=CONT.firstChild, c.textContent='';
	} else {
		clear();
		d=await d, await setCat(t?d.c:i, 1);
		Dat=d.d, n=d.n;
	}
	//Add deleted parts/locs to cache
	for(d of Dat) if(d.n && (i=d.p||d.l) && !IDCache[i]) IDCache[i]=d.n;
	if(!skip) {
		setTitle(Dat.t=(t?lnkID(i,t,1,1):Cat.n)+": "+(t?F_TYPE[t]+' ':'')+"History");
		if(!Dat.length) return CONT.innerHTML="<i class=na>No events yet...</i>";
		c=utils.mkDiv(CONT,'hl');
	}
	utils.mkEl('h1',c).textContent=Dat.t;
	for(d of Dat) draw(c,'h',d);
	if(n) mkLoader(c,skip+pl,hlView);
}

//Location tree
async function locView() {
	let i=DB._i, v=DB._v, c=CONT.querySelector('.ll'),t;
	//Jump to item
	if(c) {
		if(v==='l') for(t of c.children) if(t._d && t._d._id===i) return lvSel(t);
		if(v==='ll' && i===Cat._id) return lvSel(0);
	}
	//Full reload
	clear();
	Dat=await dbGet('ll',i);
	await setCat(Dat.c||i);
	setTitle(t=Cat.n+": "+S_TABS.l);
	if(!Dat.d.length) return CONT.innerHTML="<i class=na>No locations yet...</i>";
	c=utils.mkDiv(CONT,'ll');
	utils.mkEl('h1',c).textContent=t;
	Dat=Dat.d;
	try {
		tblToTree(Dat, (l,nd) => {
			let r=draw(c,'l',l,1);
			r.style.marginLeft=(25*nd)+'px';
			if(l._id===i) lvSel(r);
			r.r.oninput=() => go('?l:'+l._id);
			if(IDCache) IDCache[l._id]=l._fn;
		});
	} catch(e) {
		if(!(e instanceof TreeError)) throw e;
		clear(), console.error(e);
		mkMenu("Fix Location Errors?", 1);
		MB.innerHTML=safeHTML(`<p style='color:red'>${e}</p><p>Moving these locations`+
			` to the root level should fix the error. Attempt this?</p>`);
		showMenu();
		menuBtn(M_OK, async () => {try {
			await e.ids.eachAsync(async d => {await dbPost('lu',d._id,{p:''})})
			hideMenu(), utils.onNav(1);
		} catch(e) {err(e)}});
		return;
	}
}

async function partView() {
	let i=DB._i, v=DB._v, c=CONT.querySelector('.iv'),p;
	//Jump to item
	if(c || (Cat && !Cat.i && v==='p')) {
		if(v==='i') for(p of c.children) if(p._d && p._d._id===i) return ivSel(p);
		if(v==='p' && i===Dat._id) return ivSel(0);
	}
	//Full reload
	clear();
	p=v==='p'?i:(await dbGet('i',i)).p; //TODO Get just part ID
	Dat=await dbGet('p',p), await setCat(Dat._c);
	if(IDCache) IDCache[Dat._id]=Dat.n;
	c=utils.mkDiv(CONT,'pv');
	let td=c, img=Dat.i;
	if(img) {
		let tt=utils.mkEl('tr',utils.mkEl('table',c));
		utils.mkEl('img',utils.mkEl('td',tt)).src=lnkToUri(img);
		td=utils.mkEl('td',tt);
	}
	setTitle((Dat.m?Dat.m+' ':'')+Dat.n);
	utils.mkEl('h1',td).textContent=Dat.n;
	if(Dat.m) utils.mkEl('h2',td).textContent=Dat.m;
	if(Dat.d) utils.mkEl('p',c,'desc',null,safeHTML(Dat.d));
	if(!Cat.i) draw(c,'i',Dat._i);
	drawCV('p',c,Dat);

	//Inventory
	if(Cat.i) {
		c=utils.mkDiv(CONT,'iv');
		let bg=utils.mkEl('h2',c,'hr itl',null,S_TABS.i);
		bg=utils.mkDiv(bg,'bGrp');
		let b;
		if(Cat.h) {
			b=utils.mkEl('button',bg,'rnb',null,"<i class='bi i22'>&#xF292;</i>");
			b.title="Event History", b.onclick=() => go('?h:p,'+p);
		}
		b=utils.mkEl('button',bg,'rnb',null,"<i class=bi>&#xF4FE;</i>");
		b.title="Add Inventory", b.onclick=() => editor('i');
		invView(c,p,0,i);
	} else if(v==='i') return go('?p:'+p,0,1);
}

async function ulView() {
	clear(), setTitle("Users");
	Dat=await dbGet('ul'), await setCat();
	let c=utils.mkDiv(CONT,'ul'),d;
	utils.mkEl('h1',c).textContent="Users";
	let tbl=[["User ID", "Name", "Email"]];
	for(d of Dat) tbl.push([`<a href=/?u:${d._id}>${d._id}</a>`, d.n, d.e]);
	tbl.push([`<a href=/?u:g>Global</a>`, "Default Settings", '']);
	mkTable(c,tbl);
}

//============================================== Item Draw ==============================================

const T_LOG=[0, "Create Item", "Create Stock", "Create Location", "Delete Item",
	"Delete Stock", "Delete Location", "Adjust Stock", "Move Stock", "Move Location"];

function lnkID(d, type, noLnk, noFN) {
	if(!d) return "None";
	let id=d[type]||d._id||d, s=d.n;
	if(!s && type!=='i') s=IDCache[id];
	if(s && noFN && type==='l') {
		let n=s.lastIndexOf(' - ');
		if(n!==-1) s=s.slice(n+3);
	}
	if(!s) s=type==='u' ? "Unknown User" : F_SHORT[type]+" #"+id;
	return noLnk?s:`<a href=/?${type}:${id}>${s}</a>`;
}

function draw(par, type, d, nl) {
	if(d===0) return;
	let c,a,n;
	switch(type) {
	case 'c': //Cat
		c=utils.mkEl('a',par,'cc',null,'<i class=bi>&#xF8C4;</i><br>');
		utils.addText(c,d.n), mkLink(c,`?c:${d._id}`);
	break; case 'p': //Part
		c=utils.mkEl('a',par,'pc'), a=utils.mkDiv(c);
		if(d.i) utils.mkEl('img',a).src=lnkToUri(d.i);
		a=utils.mkDiv(a);
		utils.mkEl('h1',a).textContent=d.n;
		if(d.m) utils.mkEl('h2',a).textContent=d.m;
		if(d.d) utils.mkEl('p',c).textContent =
			d.d.length>100?d.d.slice(0,100)+'...':d.d;
		mkLink(c,`?p:${d._id}`);
	break; case 'i': //Inventory
		c=utils.mkEl(nl?'label':'a',par,'pc');
		a=nl?'':` of ${lnkID(d.p,'p')}`;
		utils.mkDiv(c,'pcd',null,safeHTML(`<code>${d.q}</code>${a} at ${lnkID(d.l,'l')}`));
		if(d.s) utils.mkDiv(c,'pcd',null,"<i class=hcc>S/N</i> "+safeHTML(d.s));
		mkSubLinks(c);
		if(nl) {
			c.r=a=utils.mkEl('input',c), a.type='radio', a.name='inv';
			c.htmlFor=a.id=pUID();
		} else mkLink(c,`?i:${d._id}`);
	break; case 'l': //Location
		c=utils.mkEl(nl?'label':'a',par,'pc');
		utils.mkEl('h1',c).textContent=d.n;
		if(!nl && d._fn) utils.mkEl('h4',c,null).textContent=d._fn;
		if(d.d) utils.mkEl('p',c).textContent =
			d.d.length>100?d.d.slice(0,100)+'...':d.d;
		if(nl) {
			c.r=a=utils.mkEl('input',c), a.type='radio', a.name='loc';
			c.htmlFor=a.id=pUID();
		} else mkLink(c,`?l:${d._id}`);
	break; case 'h': //History
		c=utils.mkEl('p',par,'hc'), a=utils.mkDiv(c), n=T_LOG[d.t];
		utils.mkEl('b',a,'ht-'+n[0].toLowerCase()).textContent=n;
		utils.mkDiv(a,'hcd').textContent=utils.formatDate(new Date(d.d));
		a=lnkID(d.u,'u')+' ';
		switch(d.t) {
		case 1: //Create Item
			a+=`created ${lnkID(d,'p')}`;
		break; case 2: //Create Stock
			a+=`created ${lnkID(d,'i')} with <code>${d.q}</code> `+
				`of ${lnkID(d.p,'p')} at ${lnkID(d.l,'l')}`;
		break; case 3: //Create Location
			a+=`created ${lnkID(d,'l')}`;
			if(d.h) a+=` in ${lnkID(d.h,'l')}`;
		break; case 4: //Delete Item
			a+=`deleted ${lnkID(d,'p',1)}`;
		break; case 5: //Delete Stock
			a+=`deleted ${lnkID(d,'i',1)} of ${lnkID(d.p,'p')}`;
		break; case 6: //Delete Location
			a+=`deleted ${lnkID(d,'l',1)}`;
		break; case 7: //Adjust Stock
			a+=`changed ${lnkID(d,'i')} of ${lnkID(d.p,'p')} from `+
				`<code>${d.o}</code> to <code>${d.h}</code>`;
		break; case 8: //Move Stock
			a+=`moved ${lnkID(d,'i')} of ${lnkID(d.p,'p')} from `+
				`${lnkID(d.o,'l')} to ${lnkID(d.h,'l')}`;
		break; case 9: //Move Location
			a+=`moved ${lnkID(d,'l',0,1)} from ${lnkID(d.o,'l')} to ${lnkID(d.h,'l')}`;
		break; default:
			n=utils.copy(d,1);
			delete n._id, delete n.d, delete n.c;
			a=JSON.stringify(n);
		}
		a=utils.mkDiv(c,null,null,safeHTML(a));
		mkSubLinks(a);
		if(d.c) utils.mkDiv(c,'hcc').textContent=d.c;
	break; case 'u': //User
		c=nl?par:utils.mkEl('a',par,'pc');
		a=utils.mkEl('h1',c);
		if(!nl) a.innerHTML=`<i class=bi>&#xF4CF;</i> `;
		utils.addText(a,d.n), a=utils.mkEl('p',c);
		if(nl) a=utils.mkEl('a',a);
		a.textContent=d.e;
		if(nl) a.href="mailto:"+d.e;
		else mkLink(c,`?u:${d._id}`);
		if(d.a && d.a.g & A_WS) utils.mkEl('p',c,'hcc',null,"Admin");
		if(d.b) utils.mkEl('p',c,'desc',null,safeHTML(d.b));
	break; default:
		c=utils.mkEl('p',par,'pc');
		c.textContent=JSON.stringify(d);
	}
	c._d=d;
	return c;
}

async function lvSel(r) {
	if(r) r.r.checked=1;
	else for(let i of CONT.querySelectorAll('input:checked')) i.checked=0;
	//Location View
	let c=CONT.querySelector('.lv');
	if(!r) return c&&c.remove(),onresize();
	let d=await dbGet('l', r._d._id);
	if(c) c.textContent=''; else {
		c=utils.mkDiv(CONT,'lv');
		c.onscroll=onscroll;
	}
	let h=utils.mkEl('h1',c,'hr itl itlBar'), bg=utils.mkDiv(h,'bGrp');
	let b=utils.mkEl('button',bg,'rnb',null,"<i class='bi i22t'>&#xF282;</i>");
	b.title="Close", b.onclick=() => {
		if(Edit||Dty) return BACK.onclick();
		rmHist('l'),go('?ll:'+Cat._id,0,1);
	}
	utils.mkDiv(bg).textContent=d.n;

	bg=utils.mkDiv(h,'bGrp');
	if(Cat.h) {
		b=utils.mkEl('button',bg,'rnb',null,"<i class='bi i22'>&#xF292;</i>");
		b.title="Event History", b.onclick=() => go('?h:l,'+DB._i);
	}
	b=utils.mkEl('button',bg,'rnb',null,"<i class='bi i22'>&#xF4CA;</i>");
	b.title="Update", b.onclick=() => editor('l',DB._i);
	b=utils.mkEl('button',bg,'rnb',null,"<i class=bi>&#xF4FE;</i>");
	b.title="Add Child", b.onclick=() => editor('l',0);
	b=utils.mkEl('button',bg,'rnb SAVE',null,SAVE.innerHTML);
	b.title=SAVE.title, b.hidden=1, b.onclick=() => SAVE.onclick(0,d);

	if(d._fn) utils.mkEl('h2',c).textContent=d._fn;
	if(d.d) utils.mkEl('p',c,'desc',null,safeHTML(d.d));
	drawCV('l',c,d);
	let setSize=() => {onresize(), r.scrollIntoView()};
	invView(c, DB._i, setSize), setSize();
}

function ivSel(r) {
	if(r) r.r.checked=1;
	else for(let i of CONT.querySelectorAll('.iv input:checked')) i.checked=0;
}

function invView(c, id, cb, sel) {
	let fn, od=Dat, nl=c.className==='iv',
	ld=utils.mkDiv(c,null,null,"<i class=na>Loading...</i>");
	(fn=async (skip=0) => {
		Dat._ac=new AbortController();
		let r, pl=PageLen, il=(await Promise.all([
			dbGet(Dat._ac, 'il', id, skip, pl), getCache()]))[0];
		if(Dat !== od) return; //Other view loaded
		if(!il.d.length) return ld.firstChild.textContent="No stock yet...";
		ld.remove();
		for(let d of il.d) {
			r=draw(c,'i',d,nl);
			if(nl) {
				if(d._id===sel) ivSel(r);
				r.r.oninput=() => go('?i:'+d._id);
			}
		}
		if(il.n) mkLoader(c, skip+pl, fn);
		if(cb) cb();
	})().catch(err);
}

//Load more on scroll
function mkLoader(par, skip, loadFn) {
	let l=Loader=utils.mkDiv(par,'scr',null,"<div>.</div>"), t=l.firstChild;
	l._load=() => {
		if(l.l) return;
		loadFn(skip).catch(err).then(() => {l.remove(),clearInterval(l.l)});
		l.l=setInterval(() => {
			if(Loader !== l) clearInterval(l.l);
			if((t.textContent+='.').length>3) t.textContent='.';
		},250);
	}
}
function loadAbort() {
	if(Dat && Dat._ac) Dat._ac.abort(), delete Dat._ac;
}

//Draw custom vars
function drawCV(t, c, dat) {
	//utils.mkEl('h2',c,'hr').textContent=Cat.n;
	//TODO Cat vars
	if(dat.v) {
		utils.mkEl('h2',c,'hr',null,"Custom");
		let n=dat._v=utils.mkEl('div',c,'MB'),d,k,v,o;
		for(d of dat.v) {
			if(d.i) { //Val override
				k='#'+d.i, v=dat[k], o=dat[k+':o'], d={...d};
				if(v!=null) d._v=v; if(o!=null) d.o=o;
			}
			cValSet(n,1,d);
		}
	}
}

//============================================== Menus ==============================================

const S_TABS={a:"All", p:"Parts", i:"Inventory", l:"Locations", u:"People"},
F_TYPE={f:"Field", h:"Heading", t:"Text", p:"Item", i:"Inventory", l:"Location", u:"User"},
F_SHORT={p:"Part", i:"Inv", l:"Loc", u:"User"},
NE_TYPE={'':'c', c:'p', ct:'p', p:'v', ll:'l', l:'l'},
A_RD=2**0, A_USR=2**1, A_ITM=2**2, A_UP=2**3, A_CAT=2**4, A_WS=2**5;

function mkMenu(name, btns, width, nc) {
	if(MB.m && MENU.bs._isShown) MStack.push([MB.m, [...MB.children], MCmd]);
	_rstMenu(), MB.m=[name, btns, width];
	M_T.textContent=name, M_H.hidden=name==null;
	M_F.hidden=!btns, M_DEL.hidden=btns<2, M_CPY.hidden=btns<3;
	MENU.style.setProperty('--bs-modal-width', (MENU.w=(width||500))+'px');
	MENU.bs._config.backdrop=btns?'static':true;
	if(!nc) MB.textContent='';
	onresize();
}
function _rstMenu() {
	M_OK.onclick=M_DEL.onclick=M_CPY.onclick=null;
	MCmd={};
}
function menuBtn(btn, fn) {
	if(typeof btn==='string') MCmd[btn]=fn;
	else MCmd[btn.id]=[btn, btn.onclick=fn];
}
function showMenu() {
	let m=MStack[MStack.length-1],
	t=MENU.bs._isTransitioning;
	if(m && m[2].hide) m[2].hide();
	if(t || MENU.bs._isShown) {
		if(t) MENU.a=1;
		if(MCmd.show) MCmd.show(1);
	} else MENU.bs.show();
}
function hideMenu(f) {
	if(f) MStack=[];
	let t=MENU.bs._isTransitioning;
	if(t || !MENU.bs._isShown) {
		if(t) MENU.a=2;
		if(MCmd.hide) MCmd.hide(1);
	} else MENU.bs.hide();
}

function searchMenu(sel='a', iRes) {
	mkMenu();
	let s=mkInput(MB,"Search for anything...",I_TEXT,null,{nt:1}),
	tl=utils.mkEl('ul',MB,'nav nav-underline'),
	rl=utils.mkDiv(MB,'pl'), sa=sel==='a',t,e,ns,ac;
	if(sa && Cat._st) sel=Cat._st;
	for(t in S_TABS) {
		e=utils.mkEl('a',utils.mkEl('li',tl,'nav-item'),'nav-link'+
			(t===sel?' active':'')+(sa?'':' disabled'),null,S_TABS[t]);
		e.href='#', e.t=t, e.onclick=sa?sTab:e => e.preventDefault();
	}
	if(sa) {
		if(Cat._sq) s.value=Cat._sq;
		if(Cat._sr) res(Cat._sr, sel);
	}
	tl.t=sel, tl.s=s;
	s.onUpd=async () => {try {
		if(ns) return ns=2;
		ns=1, setTimeout(() => {
			let n=ns===2; ns=0; if(n) s.onUpd();
		}, SearchDelay);
		if(ac) ac.abort();
		let q=s.value, t=Cat._st=tl.t;
		ac=new AbortController(), Cat._sq=q;
		q=q?await dbGet(ac, 'q', Cat._id, t, q):[];
		ac=null; res(Cat._sr=q, t);
	} catch(e) {err(e)}}
	function res(rd,t) {
		rl.textContent=''; let r;
		if(Array.isArray(rd)) for(r of rd) doDraw(rl,t,r);
		else for(t in rd) {
			utils.mkEl('h3',rl,'hr').textContent=S_TABS[t];
			for(r of rd[t]) doDraw(rl,t,r);
		}
	}
	function doDraw(p,t,d) {
		let r=draw(p,t,d);
		r.onclick=e => {
			e.preventDefault();
			if(iRes) iRes.set(r._d); else go(r.href,2);
			if(iRes || t!=='u') hideMenu();
		}
	}
	showMenu();
	//Focus Search Bar
	let st,sb,ct=() => {clearInterval(st),st=0}
	s.onfocus=() => {if(st && !sb) sb=setTimeout(ct,500)}
	s.onblur=() => {clearTimeout(sb),sb=0}
	st=setInterval(() => {s.focus(); if(MB.firstChild !== s) ct()},10);
}
function sTab(e) {
	e.preventDefault();
	let tl=this.parentElement.parentElement,t;
	for(t of tl.children) t.firstChild.classList.remove('active');
	this.classList.add('active'), tl.t=this.t, tl.s.onUpd();
}

function userMenu() {
	if(Usr) O_USR.textContent=`Logged in as ${Usr.n}`;
	O_LI.hidden=!(O_USR.hidden=O_LO.hidden=!Usr);
	O_TH.innerHTML=`<i class=bi>&#x${LM===1||LM===3?"F497;</i><span>Dark Mode":
		"F5A2;</i><span>Light Mode"}</span>`;
	OC.bs.show();
}

//============================================== Editor ==============================================

async function editor(type, id, res) {try {
	if(Dty!==2) Dty=1;
	let T,TN,D={},I={},OK,HIDE,CL;
	async function menu(t,tn,nc,dat) {
		T=t,TN=tn; if(id) D[t]=dat||await dbGet(t,id);
		mkMenu(id?"Updating "+(D[t].n||tn):"New "+tn,
			id?type!=='c'?3:2:1, 650, nc);
	}
	function input() {
		let a=arguments, k=Array.prototype.splice.call(a,0,1)[0];
		a[2]=D[T]&&D[T][k]||a[2]; if(a.length<3) a.length=3;
		a=mkInput(MB, ...a);
		if(k) (I[T]||(I[T]={}))[k]=a;
		return a;
	}
	async function sync(f,del) {
		M_OK.disabled=1;
		try {
			let r=await f();
			hideMenu();
			if(T==='c') setCat();
			if(del || typeof r==='string') {
				clear();
				if(del) switch(type) {
					case 'i': go(`?p:${Dat._id}`); break;
					case 'p': go(`?c:${Cat._id}`); break;
					case 'l': go(`?ll:${Cat._id}`); break;
					default: go('/');
				} else setEdit(0),go(`?${type}:${r}`);
			} else if(r!==-1) utils.onNav(1);
		} catch(e) {err(e)}
		M_OK.disabled=0;
	}
	async function edit(t, pid, noDb) {
		let d=D[t], i=I[t], a=[t+(d?'u':'n')], nd={}, k,v,c;
		if(pid) a.push(pid);
		if(t!=='s' && t!=='w' && (d||(t!=='c'&&!pid))) a.push((d||Cat)._id);
		for(k in i) {
			v=i[k];
			v=v.c&&v.c.hidden ? null : v.get?await v.get():v.value;
			if(d ? neq(v,d[k]) : valToBool(v)) nd[k]=v,c=1;
		}
		if(noDb) return nd;
		a.push(nd);
		if(d && Dat.cf) a.push(1);
		if(c) return await dbPost(...a);
	}
	function catOpts() {
		let co={},c;
		for(c of CL) if(c._id!==id) co[c._id]=c.n;
		return co;
	}
	function perm(pid, name, cat) {
		let i=input(pid, name, cat?I_MULTI:I_SWITCH, null,
			cat?{o:{g:"<Global>", ...catOpts()}}:0);
		if(cat) (i.onblur=() => {
			if(i.firstChild.selected) i.children.each(o => {o.selected=0},1);
		})();
	}
	function cBtnSet(b,e) {
		b.innerHTML=`<i class='bi${e?" i20'>&#xF4C8":"'>&#xF4FE"};</i>`;
		b.title=e?"Edit":"Add";
	}
	function custom(t) {
		let dat=I[t].v={value:D[t]&&D[t].v};
		utils.mkEl('button', MB, 'btn btn-primary', null, "Custom Fields").onclick=() => {
			mkMenu("Custom Fields for "+(id?D[t].n:"New "+TN));
			let h=utils.mkEl('h2', MB, 'hr itl', null, `Custom ${F_TYPE[t]} Fields`),
			b=utils.mkEl('button', utils.mkDiv(h,'bGrp'), 'rnb');
			D.ce=utils.mkDiv(MB,'MB'), cBtnSet(b);
			b.onclick=() => editor('v',0,(_,d) => cValSet(D.ce,0,d));
			if(dat.value) for(let v of dat.value) cValSet(D.ce,0,v);
			new Grabable(D.ce);
			showMenu();
			menuBtn('show', c => c||D.ce._g.update(1));
			menuBtn('hide', c => {
				if(!c) return;
				let v=[],n=0,i,e;
				c=D.ce.children;
				for(e of c) {
					e=e.d;
					if(e.i===true) { //Find new ID
						do {i=alpha(n++)} while(c.each(x => i===x.d.i?1:null));
						e.i=i;
					}
					v.push(e);
				}
				dat.value=v;
			});
		}
	}

	//Draw menu
	switch(type) {
	case 'c': case 'ct': //Category
		CL=DB._v===''?Dat:await dbGet('cl');
		await menu('c',"Category");
		input('n', "Name", I_TEXT);
		input('h', "Track History", I_SWITCH, D.c?D.c.h:1);
		input('i', "Separate Items & Inventory", I_SWITCH, D.c?D.c.i:1);
		input('e', "External Locations", I_MULTI, null, {o:catOpts()});
		if(!CL.length) I.c.e.parentElement.hidden=1;
		//TODO Cat custom fields
	break; case 'p': //Part
		await menu('p',"Part");
		input('n', "Name / PN", I_TEXT);
		input('m', "OEM (Optional)", I_TEXT);
		input('d', "Description", I_AREA);
		input('i', "Icon", I_FILE);
		//TODO s:subId
		custom(T);
		if(Cat.i) break;
	case 'i': //Inventory
		let ii=T!=='p';
		if(ii) await menu('i',"Inventory of "+Dat.n);
		else {
			T='i', D.i=id&&Dat._i, utils.mkEl('hr',MB);
			utils.mkEl('h2',MB,null,null,"Inventory");
		}
		input('q', "Quantity", I_NUM, null, {min:1});
		input('l', "Location", 'l');
		input('s', "S/N", I_TEXT);
		//TODO Cat fields, subcat fields, custom fields
		OK=async () => {
			let pid=Dat._id;
			if(!ii) {
				pid=await edit('p');
				if(id) id=Dat._i._id;
			}
			try {await edit('i', id?0:pid)}
			catch(e) {
				//Del part if inv throws err
				if(!ii && !id) await dbGet('pd',pid);
				throw e;
			}
		}
		if(!ii) T='p';
	break; case 'l': //Location
		await menu('l',"Location");
		input('n', "Name", I_TEXT);
		input('d', "Description", I_AREA);
		input('p', "Parent", 'l', id===0?DB._i:null);
		custom(T);
	break; case 'v': //Custom Field
		await menu('v',"Custom Field",0,id&&id.d);
		input('t', "Type", I_DROP, null, {o:F_TYPE});
		input('d', "Data Type", I_DROP, null, {o:I_TYPE});
		let i=I.v, ni=input('n', "Name", I_TEXT), ti=mkInput(MB, "Text", I_AREA),
			fv=mkInput(MB, "Fixed Value", I_SWITCH);
		ti.c.remove();
		fv.checked=D.v&&!D.v.i;
		function setNumLimit() {
			let p=i.p.num;
			i.m.setRange(null, null, p);
			i.x.setRange(null, null, p);
			i.v.setRange(i.m.num, i.x.num, p);
		}
		i.d.onchange=t => {
			['v','e','p','m','x'].forEach(n => {if(i[n]) i[n].c.remove(), delete i[n]});
			if(typeof t!=='string' && !(t=i.d.get())) t=i.d.value=1;
			if(t===I_LINK) input('v',"URI",I_TEXT);
			else {
				let o;
				if(t===I_DROP || t===I_MULTI) {
					input('e', "Editable", I_SWITCH);
					o={o:D.v&&D.v.o, e:1};
					if(t===I_DROP) o.s=1;
					t=I_MULTI;
				} else if(t===I_NUM) {
					input('p',"Precision",t,null,{min:0}).onUpd=setNumLimit;
					input('m',"Min Limit",t).onUpd=setNumLimit;
					input('x',"Max Limit",t,999).onUpd=setNumLimit;
				}
				input('v',"Default Value",t,null,o);
				if(t===I_NUM) {
					setNumLimit();
					if(D.v) {
						if(D.v.m) i.m.set(D.v.m);
						if(D.v.x) i.x.set(D.v.x);
						if(D.v.v) i.v.set(D.v.v);
					}
				}
			}
		}
		fv.onchange=() => {
			if(i.e && (i.e.c.hidden = fv.checked)) i.e.checked=0;
		}
		(i.t.onchange=() => {
			let t=i.t.value, dv=t==='p'||t==='i'||t==='l'||t==='u';
			if(fv.c.hidden = t==='t'||t==='h') fv.checked=0;
			fv.onchange();
			i.n.c.replaceWith((i.n=t==='t'?ti:ni).c);
			i.d.c.hidden = t!=='f';
			if(t==='f'||dv) i.d.onchange(dv?t:0);
			else i.v&&i.v.c.remove(), delete i.v, i.d.value='';
		})();
		delete D.v;
		OK=async () => {
			if(!i.n.c.hidden && !i.n.value) throw "Name Required";
			if(fv.c.hidden) delete i.i; else i.i={value:!fv.checked};
			if(i.v && i.v.getOpts) i.o={value:i.v.getOpts()};
			res(id, await edit('v',0,1));
			return -1;
		}
	break; case 's': //Settings
		[D.s, D.w] = await dbGet('s');
		mkMenu("Settings",1,600);
		let ic, lmo=LM, sUsr=() => {
			Usr.e=I.s.e.value, Usr.n=I.s.n.value, getNS();
			localStorage.setItem('u', JSON.stringify({u:Usr.e, n:Usr.n, k:Usr.k}));
		}, sClr=upd => setTheme(LM, upd, I.s.c1.value, I.s.c2.value);

		T='s', utils.mkEl('h2',MB,null,null,"User Settings");
		input('n', "Display Name", I_TEXT);
		input('e', "Email", I_EMAIL);
		input('b', "Bio", I_AREA);
		input('c1', "Primary Color", I_COLOR).onUpd=() => sClr();
		input('c2', "Accent Color", I_COLOR).onUpd=() => sClr();
		input(0, "Reset Colors", I_LINK).onclick=e => {
			I.s.c1.set(D.w.c1), I.s.c2.set(D.w.c2);
			sClr(), e.preventDefault();
		}
		input(0, "Reset Password", I_LINK);
		//TODO Password reset
		input(0, "Retro Theme", I_SWITCH, LM>1).onUpd=e => {
			let s=LM===1||LM===3;
			LM=e.target.checked?(s?3:2):(s?1:0), sClr();
		}

		if(D.w) {
			T='w', utils.mkEl('hr',MB);
			utils.mkEl('h2',MB,null,null,"Workspace Settings");
			input('e', "Email Domain", I_EMAIL, '*');
			D.l={i:D.w.i&&"/logo.png"}, T='l';
			input('i', "Brand Logo", I_FILE, null, {nl:1});
			T='w';
			input('r', "Allow Anonymous Read-Only", I_SWITCH);
			input('q', "Require Invite Codes", I_SWITCH);
			T='q';
			ic=D.w.v?{...D.w.v}:{};
			let io={}, c, cs=c => c+` (Expires ${utils.
				formatDate(new Date(ic[c]), {time:false})})`;
			for(c in ic) io[c]=cs(c);
			input('v', "Invite Codes", I_MULTI, null, {o:io, e:1, add:(b,i) => {
				let s=i.s, v=s?s.value:newICode();
				mkMenu((s?"Edit":"New")+" Invite"+(s?' '+v:''),s?2:1,600);
				let ex=mkInput(MB, "Expires", I_DATE, s?ic[v]:Date.now()+ICExp);
				menuBtn(M_OK, () => {ic[v]=ex.get(), b.set(cs(v),v)});
				menuBtn(M_DEL, () => {delete ic[v], b.del()});
			}});
			(I.w.q.onUpd=() => {
				let v=I.w.q.checked; I.q.v.parentElement.hidden=!v;
				if(!v) I.q.v.textContent='',ic={};
			})();
			T='w';
			input('c1', "Default Primary Color", I_COLOR);
			input('c2', "Default Accent Color", I_COLOR);
		}

		let hl=utils.mkEl('a', MB, 'icon-link-hover', null,
			"<i class=bi>&#xF431;</i> <span>Help & About</span>");
		hl.href=HELP_URI, hl.onclick=() => Dty=0;

		sUsr(),sClr();
		OK=async () => {
			let p=[edit('s')];
			if(D.w) {
				if(I.w.e.value==='*') I.w.e.value='';
				I.w.v={value:ic};
				p.push(edit('w'));
				let l=I.l.i, f=l.files[0];
				if(f) p.push(getUri('/up?l',f,1));
				else if(D.w.i && !l.fn) p.push(dbGet('di','l'));
			}
			await Promise.all(p);
			if(IDCache) IDCache[D.s._id]=I.s.n.get();
			WS[1]=I.s.c1.value.slice(1);
			WS[2]=I.s.c2.value.slice(1);
			lmo=LM,sUsr(),sClr(1),userMenu();
		}
		//Reset theme
		HIDE=() => setTheme(lmo, 0, '#'+WS[1], '#'+WS[2]);
	break; case 'u': //Edit User
		[CL, D.a]=await Promise.all([
			dbGet('cl'),
			id==='g' ? (async () => (await dbGet('s'))[1])() : dbGet('u',id)
		]);
		mkMenu("Permissions for "+(id==='g'?"Global":D.a.n),1,650), T='a';
		for(let n=0,p=1,c; p<=A_WS; p=2**(++n)) for(c in D.a.a) {
			if(D.a.a[c] & p) (D.a[p]||(D.a[p]=[])).push(c);
		}
		perm(A_RD, "Read Access", 1);
		perm(A_ITM, "Edit Access", 1);
		perm(A_CAT, "Create & Edit Categories", 1);
		perm(A_USR, "View Users", 0);
		perm(A_UP, "Upload Files", 0);
		perm(A_WS, "Edit Workspace Settings", 0);
		CL.push({_id:'g'});
		OK=async () => {
			//Calc auth masks
			let av={},v,n=0,p=1,c;
			for(; p<=A_WS; p=2**(++n)) {
				v=I.a[p], v=v.get();
				for(c of CL) c=c._id, av[c] = (av[c]||0) + ((Array.isArray(v)?
					v.indexOf('g')!==-1 || v.indexOf(c)!==-1 : v)?p:0);
			}
			//Del redundant perms
			for(c of Object.keys(av)) if(c!=='g' && av[c]===av.g) delete av[c];
			c=id==='g'?'w':'u';
			D[c]=D.a, I[c]={a:{value:av}};
			await edit(c);
		}
	break; default:
		throw "Bad View Mode";
	}
	menuBtn('hide', c => {if(c) Dat.cf=0; if(HIDE) HIDE(c)});
	menuBtn(M_OK, () => sync(OK||(() => edit(T))));
	menuBtn(M_DEL, () => {
		if(type==='v') return id.remove(),hideMenu();
		let n=D[T].n||F_SHORT[type]+" #"+id;
		mkMenu(`Delete ${TN}?`,1);
		utils.mkEl('p',MB,null,null,safeHTML("Are you sure you want to <span style='color:red'>delete "+
			n+`</span>${T==='c'?", including <b>all</b> parts and data":""}?`));
		n=T!=='c' && Cat && Cat.h && mkInput(MB, "Comment", I_TEXT);
		menuBtn(M_OK, () => sync(async () => {
			let d=[T+'d',id];
			if(n && n.value) d.push(n.value);
			await dbGet(...d), hideMenu(1);
		},1));
	});
	if(Cat && type!=='s') {
		let hc=Cat.h && type!=='v';
		if(!id && hc) input('_h', "Comment", I_TEXT);
		menuBtn(M_CPY, async () => {
			id=0,D={},delete MB.m;
			let ok=M_OK.onclick;
			await menu(T,TN,1), menuBtn(M_OK,ok);
			if(!I[T]._h && hc) input('_h', "Comment", I_TEXT);
			MENU.scrollTo({top:0,behavior:'smooth'});
		});
	}
	showMenu();
} catch(e) {err(e)}}

function cValSet(p,io,d) {
	let i,o;
	switch(d.t) {
	case 'f': case 'p': case 'i': case 'l': case 'u': //Field
		if(d.d===I_DROP || d.d===I_MULTI) o={r:d.v, o:d.o, e:d.e};
		else if(d.d===I_NUM) o={r:d.v, min:d.m, max:d.x, dm:d.p};
		else o={r:d.v};
		i=mkInput(p, d.n, d.d||d.t, d._v!=null?d._v:d.v, o);
		i.setEn(o=io===1&&d.i);
		if(o) i.onUpd=() => Edit||(setEdit(1),Dty=2);
		i=i.c;
	break; case 'h': //Heading
		i=utils.mkEl('h2', p, 'hr');
		i.textContent=d.n;
	break; case 't': //Text
		i=utils.mkEl('p', p, 'desc');
		i.textContent=d.n;
	break; default: //TODO
		i=utils.mkEl('code', p, null, {display:'block'});
		i.textContent=JSON.stringify(d);
	}
	i.d=d;
	if(io!==1) {
		if(io) {
			if(d.i) d.i=io.d.i||true; //Keep old ID
			io.replaceWith(i);
		}
		i.onclick=() => editor('v',i,(id,d) => cValSet(p,id,d));
		i.classList.add('EClk');
	}
}

async function viewUser(id) {try {
	let d=await dbGet('u',id);
	mkMenu("Viewing User");
	draw(MB,'u',d,1);
	showMenu();
} catch(e) {err(e)}}

//============================================== Database ==============================================

const R_EX=/[&%]/g, R_JS=/^[\[{]/;
function _dd(d) {console.debug('->',typeof d==='string'?d.split('&'):d)}
function _enc(x) {return '%'+x.charCodeAt(0).toString(16).toUpperCase()}
function _enp(s,b) {
	if(typeof s==='object') s=JSON.stringify(s).slice(1,-1);
	return typeof s==='string'?b?s.replace(R_EX, _enc):encodeURIComponent(s):s;
}

async function getUri(uri,d,b,sig) {
	let u,r={cache:'no-store', signal:sig};
	if(b) r.method="POST", r.body=d, u=uri; else u=uri+'?'+d;
	try {r=await fetch(new Request(u,r)), b=await r.text()}
	catch(e) {
		if(e.name==='AbortError') throw e;
		_dd(d), b=tCase(uri.slice(1)), e=`${e}`, u=e.indexOf(':');
		throw `<b>${b} ${e.slice(0,u+1)}</b> ${e.slice(u+2)}`;
	}
	if(uri==='/db') {
		if(r.status===410) logout(2);
		else if(r.status===409) {
			b+=" (Press OK again to confirm)";
			Dat.cf=1;
		}
	}
	if(r.status!==200) {
		_dd(d);
		throw `<b>${tCase(uri.slice(1))} Code ${r.status}:</b> ${b}`;
	}
	return b;
}
async function dbCmd(args, postMode, url='') {
	let a;
	if(args[0] instanceof AbortController)
		a=Array.prototype.splice.call(args,0,1)[0].signal;
	Array.prototype.forEach.call(args,(n,i) => {args[i]=_enp(n,postMode)});
	a=await getUri(url+'/db', Array.prototype.join.call(args,'&'), postMode, a);
	a=!a||a==='1'||(R_JS.test(a)?JSON.parse(a):a);
	console.debug(...args,'->',a); return a;
}
function dbGet() {return dbCmd(arguments)}
function dbPost() {return dbCmd(arguments,1)}

//If DB considers val to be true
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
	return false;
}

//If vNew != vOld, w/ default vDef
function neq(vNew, vOld, vDef) {
	let b=valToBool(vNew), sv=JSON.stringify(vNew);
	if(vOld===undefined) vOld=vDef;
	if(vOld!==undefined) return b!=valToBool(vOld)
		|| JSON.stringify(vOld)!==sv;
	return b;
}

async function setCat(c,gc) {
	let p=[];
	if(c!==Cat && (!Cat || c!==Cat._id)) {
		if(typeof c==='string') p.push((async () =>
			Cat=await dbGet('c',c))()); else Cat=c;
		if(!gc) IDCache=0;
	}
	if(gc) p.push(getCache(c));
	if(p.length) await Promise.all(p);
	O_LL.hidden=!Cat || DB._v[0]==='l', c=!Usr || !Cat;
	O_HL.hidden=c || !Cat.h || (DB._v==='h' && DB._i[1]!==',');
	O_UL.hidden=!Usr || DB._v==='ul';
}

async function _gc(t) {
	let d=await dbGet(...arguments);
	if(d.n) throw "Too many entities of type "+t;
	return d.d;
}
async function getCache(cID) {
	let d=Date.now(),c;
	if(IDCache && d-IDCache.d <= IDCMaxAge) return;
	IDCache=c=await dbGet('ic', cID||Cat._id), c.d=d;
}

//============================================== Input ==============================================

const I_TEXT=1, I_AREA=2, I_NUM=3, I_EMAIL=4, I_COLOR=5,
I_FILE=6, I_SWITCH=7, I_LINK=8, I_DROP=9, I_MULTI=10,
I_DATE=11, I_DATETIME=12,
I_TYPE={
	[I_TEXT]:"Text", [I_AREA]:"Text Area", [I_NUM]:"Number", [I_EMAIL]:"Email",
	[I_COLOR]:"Color", [I_FILE]:"Image / File", [I_SWITCH]:"Switch", [I_LINK]:"Link",
	[I_DROP]:"Dropdown", [I_MULTI]:"Multi-Select", [I_DATE]:"Date", [I_DATETIME]:"Date & Time"
}, I_SKIP={};

function mkInput(par, name, type, val, opts) {
	if(!opts) opts={};
	let r=!opts.nt, l,i,c,b,rb;
	function rstBtn() {
		rb=utils.mkEl('button',i.c,'btn tabB');
		rb.onclick=() => i.set(rb.c?'':opts.r);
		utils.center(rb,'x');
	}
	function rstBtnMode(clr, rst) {
		rb.textContent=(rb.c=!!clr)?"Clear":"Reset";
		rb.hidden=i.disabled||(rb.h=!clr && !rst);
	}
	function onSet(e) {
		if(i.onUpd) i.onUpd(e);
		if(rb && rb.f) rstBtnMode(0, neq(i.get(),opts.r));
	}
	function setEn(e) {
		i.disabled=!e;
		if(rb) rb.hidden=!e||rb.h;
	}
	switch(type) {
	case I_TEXT: case I_AREA: case I_NUM: case I_EMAIL:
	case 'p': case 'i': case 'l': case 'u':
		if(r) r=utils.mkDiv(par), l=utils.mkEl('label',r,'lbl');
		b=typeof type==='string';
		i=utils.mkEl(type===I_AREA?'textarea':'input', r||par,
			'form-'+(b?'select fsUA':'control')+(l?' iLbl':''));
		i.c=r||i;
		if(type===I_NUM) {
			utils.numField(i, opts.min, opts.max, opts.dm, opts.sym);
			i.onnuminput=onSet;
		} else if(type===I_EMAIL) i.type='email';
		else if(b) {
			let s=() => {searchMenu(type,i), i.value=i._v||''};
			i.addEventListener('click',s), i.addEventListener('input',s);
			c=utils.mkDiv(c,'fInp');
			rstBtn();
			(i.set=async d => {
				let upd=i.onUpd;
				if(d && typeof d==='string') {
					i.value=i._v=F_TYPE[type]+" #"+(i._id=d);
					if(Cat) {
						await getCache(), d=IDCache[d];
						if(d) i.value=i._v=d;
					}
				} else if(d) i.value=i._v=d._fn||d.n, i._id=d._id;
				else i.value=i._v=i._id='';
				rstBtnMode(d, opts.r&&i._id!==opts.r);
				if(upd) upd();
			})(val);
			val=I_SKIP;
		}
	break; case I_DATE: case I_DATETIME:
		if(r) r=utils.mkDiv(par), l=utils.mkEl('label',r,'lbl');
		i=utils.mkEl('input', r||par, 'form-control'+(l?' iLbl':''));
		i.c=r||i, i.type='date'+(type===I_DATE?'':'time-local');
		i.set=v => {utils.setDateTime(i,v),onSet()}
		i.get=() => utils.getDateTime(i).getTime()||0;
	break; case I_DROP: case I_MULTI:
		if(r) r=utils.mkDiv(par,'inp'), l=utils.mkEl('label',r,'lbl');
		c=utils.mkDiv(r||par,'inp');
		i=utils.mkEl('select', c, 'form-select'+(l?' iLbl':''));
		i.c=r||i;
		i.addOpt=(n,v,idx) => {
			if(!n) throw "Bad value";
			let o=utils.mkEl('option'), c=i.children[idx];
			o.value=v==null?n:v, o.textContent=n, o.onclick=i.sel;
			if(c) i.insertBefore(o,c); else i.appendChild(o);
			return o;
		}
		i.getOpts=() => {
			let ol,k,v;
			i.options.each(o => {
				k=o.value, v=o.textContent;
				if(!ol) ol=k===v?[]:{};
				Array.isArray(ol) ? ol.push(v) : (ol[k]=v);
			});
			return ol;
		}
		i.get=() => {
			let v,n;
			if(type===I_MULTI && !opts.s) {
				v=[], i.options.each(o => {(opts.ns||o.selected)&&v.push(o.value)});
			} else {
				n=Number(v=i.value);
				if(Number.isFinite(n)) v=n;
			}
			return v;
		}
		i.setEn=e => {setEn(e); if(b) b.disabled=!e}
		if(type===I_MULTI) {
			i.multiple=1;
			if(opts.e) b=utils.mkEl('button',c,'rnb FAB');
			i.sel=() => {
				if(i.disabled) return;
				if(i.d) i.s.selected=0,i.sb(),onSet();
				else if(i.s) i.d=1;
			}
			i.sb=() => {
				//TODO opts.s, single-select for I_MULTI
				i.s=i.d=null;
				i.options.each(o => {o.selected&&(i.s!=null?(i.s=0):(i.s=o))});
				if(b) {
					b.innerHTML=`<i class='bi${i.s?" i20'>&#xF4C8":"'>&#xF4FE"};</i>`;
					b.title=i.s?"Edit":"Add";
				}
			}
			i.addEventListener('input',i.sb);
		}
		if(b) {
			b.del=() => {i.s.remove(),i.sb(),hideMenu(),onSet()}
			b.set=(n,v,idx) => {try {
				if(i.s) {
					i.s.textContent=n, i.s.value=v==null?n:v, c=i.children[idx];
					if(c) i.insertBefore(i.s,c); else i.appendChild(i.s);
				} else i.addOpt(n,v,idx);
				hideMenu(), onSet();
			} catch(e) {err(e)}}
			b.onclick=() => {
				if(opts.add) opts.add(b,i); else {
					mkMenu(b.title+" Option", i.s?2:1,600);
					let s=i.s, c=i.childElementCount,
					ni=mkInput(MB, "Name", I_TEXT, s&&s.textContent),
					ii=mkInput(MB, "Index", I_NUM, s?s.index:c, {min:0, max:s?c-1:c});
					menuBtn(M_OK, () => b.set(ni.value,null,ii.num));
					menuBtn(M_DEL, b.del);
				}
				showMenu();
			}
		}
		r=opts.o;
		if(Array.isArray(r)) {r={}; for(c of opts.o) r[c]=c}
		if(val!=null) {
			if(!Array.isArray(val)) val=val.toString().split(',');
			else if(type===I_DROP) throw "Bad val "+val;
		}
		for(c in r) {
			let o=i.addOpt(r[c],c);
			if(val && val.indexOf(c)!==-1) o.selected=1;
		}
		if(i.sb) i.sb();
		val=null;
	break; case I_COLOR:
		r=utils.mkDiv(par,'cInp');
		i=utils.mkEl('input',r,'form-control form-control-color');
		l=utils.mkEl('label',r), i.type='color', i.c=r;
		i.set=v => {
			if(typeof v==='number') v='#'+numToClr(v);
			i.value=v, onSet();
		}
	break; case I_FILE:
		r=utils.mkDiv(par);
		l=utils.mkEl('label',r,'lbl');
		c=utils.mkDiv(r,'form-control iLbl');
		i=utils.mkEl('input',c), i.type='file', i.c=r;
		c=utils.mkDiv(c,'fInp');
		if(opts.r) i.r=lnkToUri(opts.r,1);
		rstBtn();
		function ext() {
			let l=i.type==='file', s=i.style, f=c.firstChild, fs=f.style;
			if(l) i.value='', i.type='text', fs.opacity=0;
			else f.textContent="No file chosen", s.opacity=0, fs.opacity=1;
			setTimeout(() => {
				if(l) s.opacity=1;
				else i.value='', i.type='file';
			},l?1:200);
		}
		function set(u,n) {
			rstBtnMode(i.fn, i.r&&i.fn!==i.r);
			if(i.type==='text') i.value='';
			c.textContent='';
			if(n||!u) { //Clear
				utils.mkEl('span',c).textContent=u||"No file chosen";
				if(!opts.nl) {
					n=utils.mkEl('button',c,null,null,
						"<i class='bi i24'>&#xF471;</i>");
					n.title="External Link", n.onclick=ext;
				}
			} else { //Preview
				let p=utils.mkEl('img',c,null,{width:'100%'}); p.src=u;
				p.onerror=() => {if(DB.contains(p)) set("Image failed to load",1)}
			}
			onSet();
		}
		i.onfocus=() => {if(i.type==='text') i.fn='',set(' ',1)}
		i.onchange=(_,f) => {
			if(f==null) f=i.files?i.files[0]:lnkToUri(i.value,1);
			if(!f) return i.fn='',set();
			if(typeof f==='string') return i.fn=f,set(f);
			i.fn=f.name;
			if(!f.type.startsWith("image/")) return set(f.name,1);
			let rd=new FileReader();
			rd.onload=() => set(rd.result);
			rd.readAsDataURL(f);
		}
		i.get=async () => {
			let v,f,o=location.origin;
			if(i.type==='file' && (f=i.files[0])) {
				i.fn=await getUri('/up?i',f,1);
				i.value='';
			}
			f=new URL(i.fn, o+"/u/");
			f.hash='', v=f.toString();
			if(f.origin===o) v=v.slice(o.length);
			if(v.startsWith("/u/")) v=v.slice(3);
			return v;
		}
		(i.set=v => i.onchange(0,lnkToUri(v,1)))(val||'');
		val=I_SKIP;
	break; case I_SWITCH:
		r=utils.mkDiv(par,'form-switch');
		i=utils.mkEl('input',r,'form-check-input');
		i.type='checkbox', i.role='switch', i.c=r;
		i.setAttribute('switch','');
		l=utils.mkEl('label',r);
		i.set=v => {i.checked=v, onSet()}
	break; case I_LINK:
		i=utils.mkEl('a',par,'iLnk'), i.c=i;
		i.href=val||'#', i.textContent=name;
		val=I_SKIP;
	break; default:
		throw "Unknown input type "+type;
	}
	i._t=type, i.c.i=i;
	if(type!==I_LINK) {
		i.title=name;
		if(l) l.htmlFor=i.id=pUID(), l.textContent=name;
		else i.placeholder=name;
		if(type===I_TEXT) i.onblur=() => i.set(tCase(i.value));
		else if(type===I_AREA || type===I_EMAIL) i.onblur=() => i.set(i.value.trim());
		if(type===I_AREA) {
			utils.autosize(i,10); let s=i.set;
			i.set=v => {s(v),onSet(v)}
		}
	}
	if(!i.get) i.get=() => {
		if(type===I_NUM) return i.num;
		else if(type===I_SWITCH) return i.checked;
		else if(type===I_COLOR) return parseInt(i.value.slice(1),16);
		else if(typeof type==='string') return i._id;
		return i.value;
	}
	if(!i.set) i.set=v => {i.value=v, onSet()}
	if(!i.setEn) i.setEn=setEn;
	if(opts.r && !rb) rstBtn(), rb.f=1;
	if(val!==I_SKIP) {
		if(val) i.set(val); else onSet();
		i.addEventListener('input',onSet);
	}
	return i;
}

//============================================== Support ==============================================

function err(e) {
	console.error(e);
	if(e.name==='AbortError') return;
	mkMenu("Error");
	MB.innerHTML=safeHTML(`<p style='color:red'>${e}</p>`);
	showMenu();
}

function clear() {
	//Loader
	DB.removeAttribute('load');
	LT=setTimeout(() => {
		LOAD.firstChild.style.animation='lr .8s ease-in infinite';
		DB.mt.content='#000', LT=0;
	},200);
	let ls=LOAD.style;
	ls.display=null, ls.opacity=1;
	CONT.textContent='', Loader=Dat=0;
}
function setTitle(t) {document.title="NLDB"+(t?' - '+t:'')}
function mkLink(l,u) {u&&(l.href=u),l.onclick=_lClk}
function mkSubLinks(l) {for(l of l.querySelectorAll('a')) mkLink(l)}
function _lClk(e) {e.preventDefault(),e.stopPropagation(),go(this.href)}

const R_TU=/_|:|\s+/g, R_TS=/(?=[^a-zA-Z'][a-zA-Z'])/g;

function tblStr(s) {return s&&s.length>TblStrMax ? s.slice(0,TblStrMax-3)+'...' : s}
function tCase(s) {
	if(!(s=s.replace(R_TU,' ').trim())) return ''; s=s.split(R_TS);
	s.forEach((w,i) => {s[i]=(i?w[0]:'')+w[i?1:0].toUpperCase()+w.slice(i?2:1)});
	return s.join('');
}

function getNS() {
	let n=Usr.n, x=n.slice(1).search(R_UC)+1;
	Usr.ns=n.charAt(0)+(x?n.charAt(x):n.charAt(1).toUpperCase());
}
function lnkToUri(i,f) {
	if(i && i.indexOf('/')===-1) {
		if(!f) i=i.split('.'), i[0]+="Sml", i=i.join('.');
		return "/u/"+i;
	}
	return i;
}
function numToClr(n) {return utils.fixedNum(n,6,16).slice(2)}
function getHSL(hex) {return utils.rgbToHsl(...utils.hexToRgb(hex)).map(n => Math.round(n))}

//Unique random HTML ID
let PID=0;
function pUID() {
	if(++PID >= 0xFFFFFFFFFFF) PID=0;
	return '_P'+PID.toString(16);
}

//Num to alphanumeric
function alpha(n, uCase) {
	let v,s=''; n+=1;
	do {
		v=(n-1)%36, n=Math.ceil(n/36)-1;
		s=String.fromCharCode(v+(v>25?22:(uCase?65:97)))+s;
	} while(n>0);
	return s;
}

//Generate invite code
function newICode() {
	let rb=new Uint8Array(ICLen),n,s='';
	crypto.getRandomValues(rb);
	for(n of rb) s+=alpha(n%36,1);
	return s;
}

class TreeError extends Error {
	constructor(e, ids) {super(e), this.ids=ids, this.name='TreeError'}
}

function _dName(d) {return '#'+d._id+(d.n?` (${d.n})`:'')}
function tblToTree(tbl, runFn) {
	let ids={},d, tf=(n,nd) => {
		for(d in ids) if((d=ids[d]) && n?d.p===n._id:!d.p) {
			delete ids[d._id];
			if(runFn) runFn(d,nd);
			tf(d,nd+1);
		}
	}
	for(d of tbl) ids[d._id]=d;
	tf(0,0);
	if((d=Object.keys(ids)).length) {
		let s=''; d.forEach((e,i) => s+=(i?', ':'')+_dName(d[i]=ids[e]));
		throw new TreeError(`Unlinked entities ${s}`,d);
	}
}

function rmHist(t,p) {
	NavHist.each(h => (t&&h.startsWith('/?'+t))||(p&&h===p)?'!':null);
}

function mkTable(par, data) {
	par=utils.mkEl('table',utils.mkDiv(par,'tCont'),'table table-striped');
	utils.mkEl('tbody',par), par.d=data;
	let tb=par.firstChild,td,ls,g,v;
	data.forEach((r,i) => {
		let tr=utils.mkEl('tr',tb);
		r.e=tr, g=i?'td':'th';
		if(!ls&&i) ls=tr, r.s=1;
		for(v of r) {
			td=utils.mkEl(g,tr), td.t=par, td.d=v;
			if(typeof v==='string' && v.startsWith('<a')) td.innerHTML=safeHTML(v);
			else td.textContent=v||'';
			if(!i) td.onclick=_tSort;
			mkSubLinks(td);
		}
		/*TODO for Bulk Actions Update
		if(i) tr.onclick=e => {
			if(e.ctrlKey || e.shiftKey) {
				e.preventDefault();
				getSelection().removeAllRanges();
				if(e.shiftKey) {
					let a=ls.index, b=tr.index;
					tb.children.each(t => {
						t.classList.toggle('sel',ls.s);
					}, b>a?a:b, (a>b?a:b)+1);
				} else tr.s=tr.classList.toggle('sel'), ls=tr;
			}
		}*/
	});
	return par;
}
function _tSort() {
	let t=this.t, i=this.index, b=t.firstChild, h=t.d[0];
	if(i===t.s) t.n=!t.n; else t.s=i;
	let n=t.n?1:-1;
	t.d.sort((a,b) => (a===h||b===h)?0:(a=_sSort(a[i]), b=_sSort(b[i]), a<b?-n:a>b?n:0));
	b.textContent='', t.d.forEach(r => b.appendChild(r.e));
	b.firstChild.children.each(td => {
		td.textContent=(td.d||'')+(td.index!==t.s?'':t.n?' ↑':' ↓');
	});
}
function _sSort(s) {
	return typeof s==='string'?s.trim().toLowerCase():s==null?'':s;
}

//============================================== Grabable ==============================================

const DRAG_HOLD=250, HOLD_DROP=10;

class Grabable {
	constructor(e) {
		e._g=this, this.e=e;
		this.ob=new MutationObserver(() => {
			if(!document.body.contains(e)) this.update(0);
		});
		this.update(1);
	}
	update(en) {
		this.e.children.each(c => {
			c.classList.toggle('dragItm',en);
			if(en) {
				if(!c._gm) c._gm=e => this._down(c,e);
				c.addEventListener('pointerdown', c._gm);
			} else if(c._gm) {
				c.removeEventListener('pointerdown', c._gm);
			}
		});
		if(en) {
			if(!this._m) this._m=this._move.bind(this), this._u=this._up.bind(this);
			addEventListener('pointermove', this._m);
			addEventListener('pointerup', this._u);
			this.ob.observe(document.body, {childList:true, subtree:true});
		} else {
			removeEventListener('pointermove', this._m);
			removeEventListener('pointerup', this._u);
			this.ob.disconnect();
		}
	}
	_down(c,e) {
		if(this.t||this.c) return;
		this.x=e.clientX, this.y=e.clientY;
		this.t=setTimeout(() => this._drag(c,e),DRAG_HOLD);
	}
	_drag(c,e) {
		if(this.c) return;
		let ib=c.innerRect, b=c.boundingRect, s=c.style;
		s.width=b.w+'px', s.height=b.h+'px', s.transition='none';
		this.x=e.clientX-b.x, this.y=e.clientY-b.y, this.c=c, this.t=0;
		c._g=utils.mkDiv(this.e, 'dragBox', {width:b.w+'px', height:b.h+'px'});
		c._g.w=ib.w/3, c._g.h=ib.h/3;
		DB.appendChild(c), c.classList.add('drag');
		this.o=[...this.e.children];
		this.o.forEach(o => o._gr=o.boundingRect);
		this._move(e);
	}
	_move(e) {
		let c=this.c, x,y;
		if(c||this.t) x=e.clientX-this.x, y=e.clientY-this.y;
		if(c) {
			let s=c.style, a,dx,dy,rx,ry;
			s.left=x+'px', s.top=y+'px';
			getSelection().removeAllRanges();
			x+=c._g.w, y+=c._g.h;
			this.o.forEach(o => {
				dx=Math.abs(x-o._gr.centerX), dy=Math.abs(y-o._gr.centerY);
				if(!a || (dx<=rx && dy<=ry)) a=o, rx=dx, ry=dy;
			});
			if(a === c._g) this.e.appendChild(c._g);
			else this.e.insertBefore(c._g, a);
		} else if(this.t && (Math.abs(x)>HOLD_DROP || Math.abs(y)>HOLD_DROP)) {
			clearTimeout(this.t), this.t=0;
		}
	}
	_up() {
		if(this.t) clearTimeout(this.t), this.t=0;
		if(!this.c) return;
		let c=this.c, s=c.style;
		c._g.replaceWith(c), c.classList.remove('drag');
		s.left=s.top=s.width=s.height=s.transition='';
		delete c._g, delete this.c, delete this.o;
	}
}

//============================================== QR Codes ==============================================

function genQr(uri, name) {
	//TODO Toggle switch for name
	name=document.title.slice(7);
	mkMenu("QR Code");
	let qr=new QRCodeStyling({width:2048, height:2048, margin:name?100:50, data:uri,
		image:'/logo.png', qrOptions:{errorCorrectionLevel:'M'}, imageOptions:{imageSize:.5},
		dotsOptions:{type:'square',color:'#f56d3c'}, cornersSquareOptions:{type:'extra-rounded',color:'#5a5a5e'},
		cornersDotOptions:{type:'dot',color:'#5a5a5e'}});
	qr.append(MB);
	let e=MB.lastChild;
	if(name) qr._canvasDrawingPromise.then(() => {
		let c=e.getContext('2d'); c.putImageData(c.getImageData(0,0,2048,2048),0,65);
		c.font='150px Open Sans', c.fillStyle='#000'; c.fillText(name,1024-c.measureText(name).width/2,130);
	});
	utils.mkEl('button',MB,'btn btn-primary',null,"Print Code").onclick=() => printQr(e);
	showMenu();
}
function printQr(e) {
	let u=e.toDataURL();
	printJS({printable:u, type:'image', imageStyle:'width:3in;border:1px solid #000'});
	URL.revokeObjectURL(u);
}