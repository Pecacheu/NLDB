//NLDB, Pecacheu 2025. GNU GPL v3
'use strict';

let Usr, Dat, Cat, Edit, DB, WS, LM,
LScr, Loader, safeHTML, MStack=[], PageLen;
const R_UC=/[A-Z]/, LOC_LIM=2000, H_MIN={c:100, h:87};

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
	if(!ck.k) logout();
	else if(!lp && Usr) {
		Usr=JSON.parse(Usr), getNS();
		if(ck.u) utils.remCookie('u'), localStorage.setItem('u',ck.u);
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
	h.AllowedSchemas.splice(0,100,'/?p:','/?u:','/?l:','https:','data:');
	delete h.AllowedAttributes.id, delete h.AllowedTags.DIV;
	safeHTML=h.SanitizeHtml;
	//Header
	SHB.onclick=() => searchMenu();
	MHB.onclick=userMenu;
	HHB.onclick=() => go('?h:p,'+DB._i);
	BACK.onclick=async () => {
		if(Dat && (Edit || Dat.dty)) {
			setEdit(0);
			if(Dat.dty) delete Dat.dty, utils.onNav();
		} else goBack();
	}
	EDIT.onclick=() => {Edit?editor(NE_TYPE[DB._v]):setEdit(1)}
	//Menu
	MENU.bs=new bootstrap.Modal(MENU), OC.bs=new bootstrap.Offcanvas(OC);
	MENU.addEventListener('hide.bs.modal', e => {
		let m=MStack.pop();
		delete MB.m; if(!m) return;
		e.preventDefault(), mkMenu(...m[0]);
		for(let e of m[1]) MB.appendChild(e);
		M_OK.onclick=m[2], M_DEL.onclick=m[3], M_CPY.onclick=m[4];
	});
	MENU.addEventListener('hidden.bs.modal', () => {
		if(MENU.a===1) return MENU.bs.show(),MENU.a=0;
		M_OK.onclick=M_DEL.onclick=M_CPY.onclick=null;
		MB.textContent='', MENU.w=0;
	});
	MENU.addEventListener('shown.bs.modal', () => {
		if(MENU.a===2) MENU.bs.hide(),MENU.a=0;
	});
	CFG.onclick=() => editor(DB._v, DB._i);
	O_LL.onclick=() => go('?lt:'+Cat._id,2);
	O_HL.onclick=() => go('?h:'+Cat._id,2);
	O_TH.onclick=() => {setTheme(LM?0:1,1),userMenu()}
	O_SE.onclick=() => editor('s');
	O_LI.onclick=() => go('/login',1);
	O_LO.onclick=() => {
		if(!Edit) dbGet('lo').then(() => logout(1)).catch(err);
	}
	UV.textContent=utils.VER;
} catch(e) {
	utils.onNav=null;
	for(let c in utils.getCookies()) utils.remCookie(c);
	if('localStorage' in window) localStorage.clear();
	alert(e);
}}

function setTheme(lm, upd, c1, c2) {
	if(upd) localStorage.setItem('t',lm);
	DB.setAttribute('data-bs-theme',lm?'light':'dark');
	if(c1) {
		c1=getHSL(c1), c2=getHSL(c2);
		DB.style.setProperty('--h1', c1[0]);
		DB.style.setProperty('--sl1', `${c1[1]}%,${c1[2]}%`);
		DB.style.setProperty('--h2', c2[0]);
	}
	DB.mt.content=DB.tc=getComputedStyle(DB).getPropertyValue('--hdr-bg');
	LM=lm;
}
async function login(e) {
	e.preventDefault();
	//TODO Enforce password rules for decent security?
	ERR.textContent='';
	let d={u:USR.value, p:PWD.value};
	if(this===BS) d.s=1; //This is BS!
	ERR.innerHTML="Loading...";
	try {
		await getUri('/auth',utils.toQuery(d));
		go('/',1);
	} catch(e) {
		console.error(e);
		ERR.innerHTML=e;
	}
}
function logout(f) {
	if(!Usr) f=0;
	Usr=null; utils.remCookie('k');
	localStorage.clear();
	if(f) { //Refresh View
		utils.onNav();
		if(OC.bs._isShown) userMenu();
	}
}

//Touch Keyboard Detect
if('visualViewport' in window) {
	let TD;
	visualViewport.onresize=e => {
		let h=e.target.height, tk=(h*e.target.scale)/utils.h<.75;
		TD=tk && MENU.bs._isShown && visualViewport.height >
			MENU.firstChild.boundingRect.h+16;
	}
	document.documentElement.addEventListener('touchmove', e => {
		if(TD) e.preventDefault();
	}, {passive:false})
}
onresize=() => {
	DB.classList.toggle('fixed',DB.innerRect.h+48 <= utils.h);
	if(MENU.w) MENU.classList.toggle('mSnap',utils.w < MENU.w+56);
	calcPLen();
}
onscroll=() => {
	let h=scrollY-LScr > 0;
	HDR.classList.toggle('hide',h);
	FTR.classList.toggle('hide',h);
	LScr=scrollY;
	if(Loader && !Loader.l && DB.scrollHeight -
		utils.h - scrollY < 200) Loader._load();
}
/*onkeydown=e => {
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
}
onbeforeunload=() => Edit||Itm&&Itm.dty?"Are you sure?":null;*/

function calcPLen() {
	let m=H_MIN[DB._v];
	PageLen=m?Math.ceil(utils.h/m):10;
}

utils.onNav = async () => {
	let q=location.search.slice(1);
	DB._lv=DB._v||'';
	[DB._v, DB._i] = parseNav(DB._q=q);
	//Loader
	DB.removeAttribute('load');
	let ls=LOAD.style, ts=LOAD.firstChild.style, t=setTimeout(() => {
		ts.animation='lr .8s ease-in infinite', DB.mt.content='#000';
	},200);
	ls.display=null, ls.opacity=1;
	//Header
	let k=utils.getCookie('k');
	if(k) utils.setCookie('k',k,-1);
	else if(Usr) logout();
	MHB.className=Usr?'user':'';
	MHB.lastChild.textContent=Usr?Usr.ns:'';
	EDIT.hidden=(O_SE.hidden=!Usr) || DB._v==='h';
	setEdit(Edit,1);
	//Draw View
	if(Dat && Dat._ac) Dat._ac.abort();
	CONT.textContent='',Loader=Dat=0;
	calcPLen();
	try {
		switch(DB._v) {
			case 'c': await plView(); break;
			case 'lt': await ltView(); break;
			case 'l': await locView(); break;
			case 'h': await hlView(); break;
			case 'ul': await ulView(); break;
			case 'p': await partView(); break;
			default:
				if(q) {await setCat(); throw "Bad Path"}
				await catView();
		}
	} catch(e) {
		console.error(e);
		if(e.name==='AbortError') return;
		setEdit(0), EDIT.hidden=O_HL.hidden=O_LL.hidden=1;
		CONT.innerHTML=safeHTML(`<p style='color:red'>${e}</p>`);
	} finally {
		onresize(), clearTimeout(t); DB.mt.content=DB.tc;
		ls.opacity=0, ts.animation=null, ls.zIndex=980;
		setTimeout(() => ls.display='none',220);
		DB.setAttribute('load','');
	}
}

function go(uri, force) {
	let o=location.origin, u=new URL(uri,o), s=u.search.slice(1);
	o=u.origin===o && s;
	if(Dat && (Edit || Dat.dty)) {
		if(Dat.dty) return err("You haven't saved your changes! Please press Save or Cancel.");
		if(o && force!==2) return editor(...parseNav(s));
		setEdit(0);
	}
	if(force===1) location=uri;
	else if(o && s.startsWith('u:')) editor(...parseNav(s));
	else utils.go(uri);
}

function goBack() {
	if(Cat && DB._v!=='c') {
		if(DB._v==='l') ltSel();
		else if(DB._lv==='h') go('/?h:'+Cat._id);
		else go('/?c:'+Cat._id);
	} else go('/');
}

function parseNav(q) {
	let x=q.indexOf(':');
	return [x===-1?q:q.slice(0,x), x===-1?'':q.slice(x+1)];
}

function setEdit(e,f) {
	Edit=e;
	BACK.innerHTML=`<i class=bi>&#x${e?'F62A':'F12C'};</i>`;
	EDIT.innerHTML=`<i class=bi${e?'>&#xF4FE':' style="font-size:20px">&#xF4C8'};</i>`;
	BACK.title=e?DB._v==='p'?"Cancel":"Done":"Back", EDIT.title=e?"Add":"Edit";
	BACK.hidden=!DB._q && !e, CFG.hidden=EDIT.hidden || !DB._q || e;
	SHB.hidden=(MHB.hidden=!(SAVE.hidden=!e||DB._v!=='p'))||!DB._v;
	if(!f) setCat(Cat);
}

//============================================== View Draw ==============================================

async function catView() {
	setTitle();
	Dat=await dbGet('cl'), await setCat();
	if(!Dat.length) return CONT.innerHTML="<i class=na>No categories yet...</i>";
	let c=utils.mkDiv(CONT,'cl'),d;
	for(d of Dat) draw(c,'c',d);
}

async function plView(page=0) {
	let d=dbGet('pl', DB._i, page, PageLen),c,n;
	if(page) {
		d=await d, Dat.push(...d.d), n=d.n;
		c=CONT.firstChild, c.textContent='';
	} else {
		d=(await Promise.all([d, setCat(DB._i)]))[0];
		setTitle(Cat.n), Dat=d.d, n=d.n;
		if(!Dat.length) return CONT.innerHTML="<i class=na>No parts yet...</i>";
		c=utils.mkDiv(CONT,'pl');
	}
	utils.mkEl('h1',c).textContent=Cat.n;
	for(d of Dat) draw(c,'p',d);
	if(n) mkLoader(c,page,plView);
}

async function hlView(page=0) {
	let si=DB._i.split(','), t=si.length===2?si[0]:0, i=si[1]||si[0],
	d=dbGet('hl', i, page, PageLen),c,n;
	if(page) {
		d=await d, Dat.push(...d.d), n=d.n;
		c=CONT.firstChild, c.textContent='';
	} else {
		d=[d, dbGet('ul'), setCat(i)];
		if(t==='p') d.push(dbGet('p',i));
		d=await Promise.all(d), Dat=d[0].d, n=d[0].n;
		Dat.u={}, Dat.h={}, si=d[3];
		for(d of d[1]) Dat.u[d._id]=d; //Cache users
		Dat.t=(t?F_TYPE[t]+' ':'')+"History: "+(si?si.n:Cat.n);
		setTitle(Dat.t);
		if(!Dat.length) return CONT.innerHTML="<i class=na>No events yet...</i>";
		c=utils.mkDiv(CONT,'hl');
	}
	for(d of Dat) if(d.n&&(i=d.p||d.l)) Dat.h[i]=d.n; //Cache parts/locs
	utils.mkEl('h1',c).textContent=Dat.t;
	for(d of Dat) draw(c,'h',d);
	if(n) mkLoader(c,page,hlView);
}

//Location tree
async function ltView() {
	let i=DB._i,c,t;
	Dat=await dbGet('ll', i, 0, LOC_LIM);
	await setCat(Dat.c||i);
	setTitle(t="Locations: "+Cat.n);
	if(!Dat.d.length) return CONT.innerHTML="<i class=na>No locations yet...</i>";
	if(Dat.n) return err("Too many locations to parse!");
	c=utils.mkDiv(CONT,'lt');
	utils.mkEl('h1',c).textContent=t;
	try {
		tblToTree(Dat.d, (l,nd) => {
			let r=draw(c,'l',l,1);
			r.style.marginLeft=(25*nd)+'px';
			if(l._id===i) r.r.checked=1;
			r.r.oninput=() => ltSel(r);
		});
	} catch(e) {
		if(!(e instanceof TreeError)) throw e;
		CONT.textContent='', console.error(e);
		mkMenu("Fix Location Errors?", 1);
		MB.innerHTML=safeHTML(`<p style='color:red'>${e}</p><p>Moving these locations`+
			` to the root level should fix the error. Attempt this?</p>`);
		showMenu();
		M_OK.onclick=() => e.ids.eachAsync(async d => {
			await dbPost('lu',d._id,{p:''});
		}).then(() => {hideMenu(),utils.onNav()}).catch(err);
	}
}
function ltSel(r) {
	if(!r) for(let i of CONT.querySelectorAll('input:checked')) i.checked=0;
	[DB._v, DB._i] = parseNav(DB._q=r?'l:'+r._d._id:'lt:'+Cat._id);
	history.pushState('','','/?'+DB._q);
}

function locView() {
	//TODO Pick tree or list based on last used view
	return ltView();
}

//TODO Get to this view somehow?
async function ulView() {
	Dat=await dbGet('ul'), await setCat();
	let c=utils.mkDiv(CONT,'ul'),d;
	utils.mkEl('h1',c).textContent="Users";
	for(d of Dat) draw(c,'u',d);
}

async function partView() {
	let d=Dat=await dbGet('p',DB._i),
	c=utils.mkDiv(CONT,'pv'), td=c, i=Dat.i;
	await setCat(Dat._c);
	if(i) {
		let tt=utils.mkEl('tr',utils.mkEl('table',c));
		utils.mkEl('img',utils.mkEl('td',tt)).src=lnkToUri(i);
		td=utils.mkEl('td',tt);
	}
	setTitle((Dat.m?Dat.m+' ':'')+Dat.n);
	utils.mkEl('h1',td).textContent=Dat.n;
	if(Dat.m) utils.mkEl('h2',td).textContent=Dat.m;
	if(Dat.d) utils.mkEl('p',c,null,null,safeHTML(Dat.d));
	utils.mkEl('code',c,null,{marginBottom:'1rem',display:'block'}).
		textContent=JSON.stringify(Dat,null,1);
	utils.mkEl('h2',c,'hr').textContent=Cat.n;
	utils.mkEl('h2',c,'hr',null,"Item");
	//TODO Custom fields

	//Inventory
	c=utils.mkDiv(CONT,'iv');
	let r=utils.mkEl('h2',c,'hr itl',null,S_TABS.i);
	r=utils.mkDiv(r,'bGrp');
	let b=utils.mkEl('button',r,'rnb',null,"<i class=bi style='font-size:22px'>&#xF292;</i>");
	b.title="Item History";
	b=utils.mkEl('button',r,'rnb',null,"<i class=bi>&#xF4FE;</i>");
	b.title="Add Inventory";

	b=utils.mkDiv(c,null,null,"<i class=na>Loading...</i>");
	(async () => {
		Dat._ac=new AbortController();
		i=await dbGet(Dat._ac, 'il', DB._i, 0, PageLen);
		if(Dat !== d) return; //Other view loaded
		if(!i.length) return b.firstChild.textContent="No stock yet...";
		b.remove();
		for(d of i) draw(c,'i',d,1);
		//TODO Paging
	})().catch(err);
}

//============================================== Item Draw ==============================================

const T_LOG=[0, "Create Item", "Create Stock", "Create Location",
	"Delete Item", "Delete Stock", "Delete Location"];

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
		c=utils.mkEl('a',par,'pc');
		utils.mkDiv(c,'pcd',null,safeHTML(`${d.q} at <a href=/?l:${d.l}>${d.l}</a>`));
		if(d.s) utils.mkDiv(c,'pcd',null,"<i class=hcc>S/N</i> "+safeHTML(d.s));
		for(a of c.querySelectorAll('a')) mkLink(a);
		if(!nl) mkLink(c,`?p:${d.p}`);
	break; case 'l': //Location
		c=utils.mkEl(nl?'label':'a',par,'pc');
		utils.mkEl('h1',c).textContent=d.n;
		if(d.d) utils.mkEl('p',c).textContent =
			d.d.length>100?d.d.slice(0,100)+'...':d.d;
		if(nl) {
			c.r=a=utils.mkEl('input',c), a.type='radio', a.name='loc';
			c.htmlFor=a.id=pUID();
		} else mkLink(c,`?l:${d._id}`);
	break; case 'h': //History
		c=utils.mkEl('p',par,'hc'), a=utils.mkDiv(c);
		utils.mkEl('b',a).textContent=T_LOG[d.t];
		utils.mkDiv(a,'hcd').textContent=utils.formatDate(new Date(d.d));
		n=Dat.u[d.u], a=`<a href=/?u:${d.u}>${n?n.n:'Unknown User'}</a> `;
		switch(d.t) {
		case 1: //Create Item
			a+=`created <a href=/?p:${d.p}>${d.n}</a>`;
		break; case 3: //Create Location
			a+=`created <a href=/?l:${d.l}>${d.n}</a>`;
			if(d.pl) a+=` at <a href=/?l:${d.pl}>${Dat.h[d.pl]||'Loc #'+d.pl}</a>`;
		break; case 4: //Delete Item
			a+=`deleted ${Dat.h[d.p]||'Part #'+d.p}`;
		break; case 6: //Delete Location
			a+=`deleted ${Dat.h[d.l]||'Loc #'+d.l}`;
		break; default:
			n=utils.copy(d,1);
			delete n._id, delete n.d, delete n.c;
			a=JSON.stringify(n);
		}
		a=utils.mkDiv(c,null,null,safeHTML(a));
		for(a of a.querySelectorAll('a')) mkLink(a);
		if(d.c) utils.mkDiv(c,'hcc').textContent=d.c;
	break; case 'u': //User
		c=nl?par:utils.mkEl('a',par,'pc');
		a=utils.mkEl('h1',c);
		if(!nl) a.innerHTML=`<i class=bi>&#xF4CF;</i> `;
		utils.addText(a,d.n);
		a=utils.mkEl(nl?'a':'p',c), a.textContent=d.e;
		if(nl) a.href="mailto:"+d.e;
		else mkLink(c,`?u:${d._id}`);
	break; default:
		c=utils.mkEl('p',par,'pc');
		c.textContent=JSON.stringify(d);
	}
	c._d=d;
	return c;
}

//Loads more on scroll
function mkLoader(par, page, loadFn) {
	let l=Loader=utils.mkDiv(par,'scr',null,"<div>.</div>"), t=l.firstChild;
	l._load=() => {
		if(l.l) return;
		loadFn(page+1).catch(err).then(() => {l.remove(),clearInterval(l.l)});
		l.l=setInterval(() => {
			if(Loader !== l) clearInterval(l.l);
			if((t.textContent+='.').length>3) t.textContent='.';
		},250);
	}
}

//============================================== Menus ==============================================

const S_TABS={a:"All", p:"Parts", i:"Inventory", l:"Locations", u:"People"},
F_TYPE={f:"Field", h:"Heading", t:"Text", p:"Item", i:"Inventory", l:"Location", u:"User"},
NE_TYPE={'':'c', c:'p', p:'v', lt:'l', l:'l'};

function mkMenu(name, btns, width, nc) {
	if(MB.m && MENU.bs._isShown) MStack.push([MB.m, [...MB.children],
		M_OK.onclick, M_DEL.onclick, M_CPY.onclick]);
	MB.m=[name, btns, width];
	M_T.textContent=name, M_H.hidden=name==null;
	M_F.hidden=!btns, M_DEL.hidden=btns<2, M_CPY.hidden=btns<3;
	MENU.style.setProperty('--bs-modal-width', (MENU.w=(width||500))+'px');
	MENU.bs._config.backdrop=btns?'static':true;
	if(!nc) MB.textContent='';
	onresize();
}
function showMenu() {
	if(MENU.bs._isTransitioning) MENU.a=1;
	else MENU.bs.show();
}
function hideMenu(f) {
	if(f) MStack=[];
	if(MENU.bs._isTransitioning) MENU.a=2;
	else MENU.bs.hide();
}

function searchMenu(sel='a', iRes) {
	mkMenu();
	let s=mkInput(MB,"Search for anything...",I_TEXT),
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
	tl.t=sel, tl.s=s, s.onblur=null;
	s.oninput=async () => {try {
		if(ns) return ns=2;
		ns=1, setTimeout(() => {
			let n=ns===2; ns=0; if(n) s.oninput();
		},300);
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
	setTimeout(() => s.focus(),200);
}
function sTab(e) {
	e.preventDefault();
	let tl=this.parentElement.parentElement,t;
	for(t of tl.children) t.firstChild.classList.remove('active');
	this.classList.add('active'), tl.t=this.t, tl.s.oninput();
}

function userMenu() {
	if(Usr) O_USR.textContent=`Logged in as ${Usr.n}`;
	O_LI.hidden=!(O_USR.hidden=O_LO.hidden=!Usr);
	O_TH.innerHTML=`<i class=bi>&#x${LM?"F497;</i><span>Dark Mode":
		"F5A2;</i><span>Light Mode"}</span>`;
	OC.bs.show();
}

async function editor(type, id) {try {
	let T,TN,D={},I={},OK;
	async function menu(t,tn,nc) {
		T=t,TN=tn; if(id) D[t]=await dbGet(t,id);
		mkMenu(id?"Updating "+D[t].n:"New "+tn,
			id?type!=='c'?3:2:1, 650, nc);
	}
	function input() {
		let a=arguments, k=Array.prototype.splice.call(a,0,1);
		a[2]=D[T]&&D[T][k]||a[2]; if(a.length<3) a.length=3;
		a=mkInput(MB, ...a);
		if(k) (I[T]||(I[T]={}))[k]=a;
		return a;
	}
	async function sync(f) {
		M_OK.disabled=1;
		await f().then(r => {
			hideMenu();
			if(T==='c') Cat=0;
			if(typeof r==='string') setEdit(0),go(`?${type}:${r}`);
			else utils.onNav();
		}).catch(err);
		M_OK.disabled=0;
	}
	async function edit(t,pid) {
		let d=D[t], i=I[t], a=[t+(d?'u':'n')], nd={}, k,f,v,c,b;
		if(pid) a.push(pid);
		if(t!=='u' && t!=='w' && (d||(t!=='c'&&!pid))) a.push((d||Cat)._id);
		a.push(nd);
		for(k in i) {
			f=i[k];
			if(f._t===I_MULTI) {
				v=[];
				f.options.each(o => {o.selected&&v.push(o.value)});
			} else if(f._t===I_DROP) {
				v=f.value;
				if(Number.isFinite(b=Number(v))) v=b;
			} else if(typeof f._t==='string') v=f._id;
			else {
				v=f.value;
				switch(f.type) {
				case 'color':
					v=parseInt(v.slice(1),16);
				break; case 'file':
					b=f.files[0];
					v=b?await getUri('/up?i',b,1):f.fn;
				break; case 'checkbox':
					v=f.checked;
				}
				if(f.fn != null) { //File/Link
					let o=location.origin;
					b=new URL(v,o+"/u/"), b.hash='', v=b.toString();
					if(b.origin===o) v=v.slice(o.length);
					if(v.startsWith("/u/")) v=v.slice(3);
				}
			}
			b=valToBool(v);
			if(d ? b?JSON.stringify(d[k])!==
				JSON.stringify(v):k in d : b) nd[k]=v,c=1;
		}
		if(c) return await dbPost(...a);
	}

	//Draw menu
	switch(type) {
	case 'c': //Category
		let cd=DB._v===''?Dat:await dbGet('cl'), cl={},c;
		for(c of cd) if(c._id!==id) cl[c._id]=c.n;
		await menu('c',"Category");
		input('n', "Name", I_TEXT);
		input('h', "Track History", I_SWITCH, D.c?D.c.h:1);
		input('i', "Separate Items & Inventory", I_SWITCH, D.c?D.c.i:1);
		c=input('e', "External Locations", I_MULTI, null, cl);
		if(!cd.length) c.parentElement.hidden=1;
		//TODO Cat custom fields
	break; case 'p': //Part
		await menu('p',"Part");
		input('n', "Name / PN", I_TEXT);
		input('m', "OEM (Optional)", I_TEXT);
		input('d', "Description", I_AREA);
		input('i', "Icon", I_FILE);
		//s:subId, v:vars
		//TODO Cat fields, subcat fields, custom fields
	break; case 'l': //Location
		await menu('l',"Location");
		input('n', "Name", I_TEXT);
		input('d', "Description", I_AREA);
		input('p', "Parent", 'l');
	break; case 'v': //Custom Field
		await menu('v',"Custom Field");
		input('t', "Type", I_DROP, null, F_TYPE);
		input('d', "Data Type", I_DROP, null, I_TYPE);
		input('i', "Data ID", I_TEXT);
		let i=I.v, ni=input('n', "Name", I_TEXT), ti=mkInput(MB, "Text", I_AREA),
			fv=mkInput(MB, "Fixed Value", I_SWITCH);
		ti.c.remove();
		i.d.onchange=t => {
			if(i.v) i.v.c.remove();
			if(typeof t!=='string') t=Number(i.d.value);
			if(t===I_LINK) input('v',"URI",I_TEXT);
			else input('v',"Default Value",t);
		}
		i.i.onblur=() => i.i.value=i.i.value.trim().
			toLowerCase().replace(/\s+/g,'-');
		fv.onchange=() => {
			let t=i.t.value;
			if(i.i.c.hidden = t==='t'||t==='h'||fv.checked) i.i.value='';
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
		OK=async () => {
			if(!i.i.c.hidden && !i.i.value) throw "Data ID Required";
			await edit('v',DB._i);
		}
	break; case 's': //Settings
		[D.u, D.w] = await dbGet('s');
		mkMenu("Settings",1,600);
		function sUsr() {
			Usr.e=I.u.e.value, Usr.n=I.u.n.value, getNS();
			localStorage.setItem('u', JSON.stringify({u:Usr.e, n:Usr.n}));
		}
		function sClr() {
			setTheme(LM, 0, I.u.c1.value, I.u.c2.value);
		}

		T='u', utils.mkEl('h2',MB,null,null,"User Settings");
		input('n', "Display Name", I_TEXT);
		input('e', "Email", I_EMAIL);
		//TODO Add "Bio"
		input('c1', "Primary Color", I_COLOR).oninput=sClr;
		input('c2', "Accent Color", I_COLOR).oninput=sClr;
		input(0, "Reset Colors", I_LINK).onclick=e => {
			I.u.c1.set(D.w.c1), I.u.c2.set(D.w.c2);
			sClr(), e.preventDefault();
		}
		input(0, "Reset Password", I_LINK);
		//TODO Password reset

		if(D.w) {
			T='w', utils.mkEl('hr',MB);
			utils.mkEl('h2',MB,null,null,"Workspace Settings");
			if(!D.w.e) D.w.e='*';
			input('e', "Email Domain", I_EMAIL);
			D.l={i:D.w.i&&"/logo.png"}, T='l';
			input('i', "Brand Logo", I_FILE, null, 1);
			T='w';
			input('r', "Allow Anonymous Read-Only", I_SWITCH);
			input('c1', "Default Primary Color", I_COLOR);
			input('c2', "Default Accent Color", I_COLOR);
		}
		//TODO input(null, "<info icon> Help & About", I_LINK);

		sUsr(),sClr();
		OK=async () => {
			let p=[edit('u')];
			if(D.w) {
				p.push(edit('w'));
				let l=I.l.i, f=l.files[0];
				if(f) p.push(getUri('/up?l',f,1));
				else if(D.w.i && !l.fn) p.push(dbGet('di','l'));
			}
			await Promise.all(p);
			sUsr(),sClr(),userMenu();
		}
		//TODO On cancel, reset theme
		//setTheme(LM, 0, '#'+WS[1], '#'+WS[2])
	break; case 'u': //Contact Info
		D=await dbGet('u',id);
		mkMenu("Viewing User");
		draw(MB,'u',D,1);
	break; default:
		throw "Bad View Mode";
	}
	M_OK.onclick=() => sync(OK||(() => edit(T)));
	M_DEL.onclick=() => {
		let n=D[T].n, d=[T+'d',id];
		mkMenu(`Delete ${TN}?`,1);
		utils.mkEl('p',MB,null,null,safeHTML("Are you sure you want to <span style='color:red'>delete "+
			n+`</span>${T==='c'?", including <b>all</b> parts and data":""}?`));
		n=T!=='c'&&mkInput(MB, "Comment", I_TEXT);
		M_OK.onclick=() => sync(async () => {
			if(n && n.value) d.push(n.value);
			await dbGet(...d), hideMenu(1);
		});
	}
	if(type!=='c' && type!=='s') {
		input('_h', "Comment", I_TEXT).c.hidden=!!id;
		M_CPY.onclick=async () => {
			id=0,D={},delete MB.m;
			await menu(T,TN,1);
			I[T]._h.c.hidden=0;
			MENU.scrollTo({top:0,behavior:'smooth'});
		}
	}
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
	let u,r={mode:'same-origin', cache:'no-store', signal:sig};
	if(b) r.method="POST", r.body=d, u=uri; else u=uri+'?'+d;
	try {r=await fetch(new Request(u,r)), b=await r.text()}
	catch(e) {
		if(e.name==='AbortError') throw e;
		_dd(d), b=tCase(uri.slice(1)), e=`${e}`, u=e.indexOf(':');
		throw `<b>${b} ${e.slice(0,u+1)}</b> ${e.slice(u+2)}`;
	}
	if(r.status===410 && uri==='/db') logout(2);
	if(r.status!==200) {
		_dd(d);
		throw `<b>${tCase(uri.slice(1))} Code ${r.status}:</b> ${b}`;
	}
	return b;
}
async function _DBQ(a,b) {
	let as;
	if(a[0] instanceof AbortController)
		as=Array.prototype.splice.call(a,0,1)[0].signal;
	Array.prototype.forEach.call(a,(n,i) => {a[i]=_enp(n,b)});
	b=await getUri('/db',Array.prototype.join.call(a,'&'),b,as);
	b=!b||b==='1'||(R_JS.test(b)?JSON.parse(b):b);
	console.debug(...a,'->',b); return b;
}
function dbGet() {return _DBQ(arguments)}
function dbPost() {return _DBQ(arguments,1)}

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

async function setCat(c) {
	if(!Cat || c!==Cat._id) Cat=typeof c==='string'?await dbGet('c',c):c;
	O_LL.hidden=!Cat || DB._v[0]==='l', c=!Usr || !Cat;
	O_HL.hidden=c || !Cat.h || (DB._v==='h'&&DB._i[1]!==',');
	HHB.hidden=c || !Cat.h || Edit || DB._v!=='p';
}

//============================================== Support ==============================================

const I_TEXT=1, I_AREA=2, I_EMAIL=3, I_COLOR=4,
I_FILE=5, I_SWITCH=6, I_LINK=7, I_DROP=8, I_MULTI=9,
I_TYPE={
	[I_TEXT]:"Text", [I_AREA]:"Text Area", [I_EMAIL]:"Email", [I_COLOR]:"Color",
	[I_FILE]:"Image / File", [I_SWITCH]:"Switch", [I_LINK]:"Link", [I_DROP]:"Dropdown",
	[I_MULTI]:"Multi-Select"
};

function mkInput(par, name, type, val, opts) {
	let r=par.id==='MB' && !M_F.hidden, l,i,c,b;
	switch(type) {
	case I_TEXT: case I_AREA: case I_EMAIL:
	case 'p': case 'i': case 'l': case 'u':
		if(r) r=utils.mkDiv(par), l=utils.mkEl('label',r,'lbl');
		b=typeof type==='string';
		i=utils.mkEl(type===I_AREA?'textarea':'input', r||par,
			'form-'+(b?'select fsUA':'control')+(l?' iLbl':''));
		if(type===I_EMAIL) i.type='email';
		else if(b) {
			i.onclick=i.oninput=() => {searchMenu(type,i), i.value=i._v||''}
			i.set=d => {
				if(typeof d==='string') {
					i.value=F_TYPE[type]+" #"+(i._id=d);
					dbGet(type,d).then(i.set).catch(err);
				} else i.value=i._v=d._fn||d.n, i._id=d._id;
			}
		}
		i.c=r||i;
	break; case I_DROP: case I_MULTI:
		if(r) r=utils.mkDiv(par), l=utils.mkEl('label',r,'lbl');
		i=utils.mkEl('select', r||par, 'form-select'+(l?' iLbl':''));
		if(type===I_MULTI) i.multiple=1;
		for(c in opts) {
			b=utils.mkEl('option',i);
			b.value=c, b.textContent=opts[c];
			if(val && val.indexOf(c)!==-1) b.selected=1;
		}
		val=null, i.c=r||i;
	break; case I_COLOR:
		r=utils.mkDiv(par,'cInp');
		i=utils.mkEl('input',r,'form-control form-control-color');
		l=utils.mkEl('label',r), i.type='color', i.c=r;
		i.set=v => {
			if(typeof v==='number') v='#'+numToClr(v);
			i.value=v;
		}
	break; case I_FILE:
		r=utils.mkDiv(par);
		l=utils.mkEl('label',r,'lbl');
		c=utils.mkDiv(r,'form-control iLbl');
		i=utils.mkEl('input',c), i.type='file', i.c=r;
		c=utils.mkDiv(c,'fInp');
		b=utils.mkEl('button',r,'btn tabB',null,"Clear");
		utils.center(b,'x');
		b.onclick=() => {i.value='',i.onchange()}
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
			b.hidden=!u;
			if(n||!u) {
				c.textContent='';
				utils.mkEl('span',c).textContent=u||"No file chosen";
				if(opts) return;
				n=utils.mkEl('button',c,null,null,
					"<i class=bi style='font-size:24px'>&#xF471;</i>");
				n.title="External Link", n.onclick=ext;
			} else c.innerHTML=`<img src='${u}' style='width:100%'>`;
		}
		(i.onchange=(_,f) => {
			if(f==null) f=i.files[0];
			if(!f) return i.fn='',set();
			if(typeof f==='string') return i.fn=f,set(f);
			i.fn=f.name;
			if(!f.type.startsWith("image/")) return set(f.name,1);
			let rd=new FileReader();
			rd.onload=() => set(rd.result);
			rd.readAsDataURL(f);
		})(0,lnkToUri(val,1));
		val=null;
	break; case I_SWITCH:
		r=utils.mkDiv(par,'form-switch');
		i=utils.mkEl('input',r,'form-check-input');
		i.type='checkbox', i.role='switch', i.c=r;
		i.setAttribute('switch','');
		l=utils.mkEl('label',r);
	break; case I_LINK:
		i=utils.mkEl('a',par,'iLnk'), i.c=i;
		i.href=val||'#', i.textContent=name;
	break; default:
		throw "Unknown input type "+type;
	}
	i._t=type;
	if(type!==I_LINK) {
		i.title=name;
		if(l) l.htmlFor=i.id=pUID(), l.textContent=name;
		else i.placeholder=name;
		if(type===I_TEXT) i.onblur=() => i.value=tCase(i.value);
		else if(type===I_AREA || type===I_EMAIL) i.onblur=() => i.value=i.value.trim();
		if(type===I_AREA) utils.autosize(i,10);
		if(val) type===I_SWITCH?i.checked=val:i.set?i.set(val):i.value=val;
	}
	return i;
}

function err(e) {
	console.error(e);
	if(e.name==='AbortError') return;
	mkMenu("Error");
	MB.innerHTML=safeHTML(`<p style='color:red'>${e}</p>`);
	showMenu();
}

function setTitle(t) {document.title="NLDB"+(t?' - '+t:'')}
function mkLink(l,u) {u&&(l.href=u),l.onclick=_lClk}
function _lClk(e) {e.preventDefault(),go(this.href)}

const R_TU=/_|:|\s+/g, R_TS=/(?=[^a-zA-Z][a-zA-Z])/g;

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

/*
//============================================== QR Codes ==============================================

function genCode(e,uri,n) {
	let s,qr=new QRCodeStyling({width:2048,height:2048,margin:n?100:50,data:uri,
	image:"r/logo.png",qrOptions:{errorCorrectionLevel:'M'},imageOptions:{imageSize:0.5},
	dotsOptions:{type:'square',color:'#f56d3c'},cornersSquareOptions:{type:'extra-rounded',color:'#5a5a5e'},
	cornersDotOptions:{type:'dot',color:'#5a5a5e'}});
	qr.append(e); s=(Menu.qr=e.lastChild).style; s.width='65%',s.maxWidth=500;
	if(n) qr._canvasDrawingPromise.then(() => {
		let c=Menu.qr.getContext('2d'); c.putImageData(c.getImageData(0,0,2048,2048),0,65);
		c.font='150px Open Sans', c.fillStyle='#000'; c.fillText(n,1024-c.measureText(n).width/2,130);
	});
}
function prCode() {
	let u=Menu.qr.toDataURL();
	printJS({printable:u,type:'image',imageStyle:'width:3in;border:1px solid #000'});
	URL.revokeObjectURL(u);
}*/