//NLDB, Pecacheu 2025. GNU GPL v3
'use strict';

let Usr, Dat, Edit, DB, WS, LM, LScr, safeHTML;
const R_UC=/[A-Z]/;

//============================================== UI & Nav ==============================================

/*Disco Mode
let hue=0;
setInterval(() => {
	DB.style.setProperty('--h1', hue);
	DB.style.setProperty('--h2', hue+180);
	DB.mt.content=DB.tc=getComputedStyle(DB).getPropertyValue('--hdr-bg');
	if((hue+=1) >= 360) hue -= 360;
}, 50);

--h1:16;
--sl1:89%, 55%;
--h2:100;*/

onload=() => {try {
	DB=document.body;
	DB.mt=document.querySelector('meta[name=theme-color]');
	let lp=!('MENU' in window), ck=utils.getCookies();
	//User
	Usr=ck.u||localStorage.getItem('u');
	if(!ck.k) logout();
	else if(!lp && Usr) {
		Usr=JSON.parse(Usr);
		let n=Usr.n, x=n.slice(1).search(R_UC)+1;
		Usr.ns=n.charAt(0)+(x?n.charAt(x):n.charAt(1).toUpperCase());
		Usr.c1='#'+Usr.c1.toString(16), Usr.c2='#'+Usr.c2.toString(16);
		if(ck.u) utils.remCookie('u'), localStorage.setItem('u',ck.u);
	}
	//Workspace
	if(!(WS=ck.w)) throw "Failed to load workspace (Check your cookie settings)";
	WS=WS.split('~');
	if(!lp) NV.textContent=WS[0];
	WS.c1='#'+WS[1], WS.c2='#'+WS[2];
	//Theme
	let h=Usr||WS, h1=getHSL(h.c1), h2=getHSL(h.c2);
	DB.style.setProperty('--h1', h1[0]);
	DB.style.setProperty('--sl1', `${h1[1]}%,${h1[2]}%`);
	DB.style.setProperty('--h2', h2[0]);
	setTheme(Number(localStorage.getItem('t')));
	//Login Page
	if(lp) {
		BL.onclick=BS.onclick=login;
		return DB=utils.onNav=onresize=onscroll=onkeydown=null;
	}
	//Header
	safeHTML=HtmlSanitizer.SanitizeHtml;
	HSB.onclick=searchMenu;
	HMB.onclick=userMenu;
	BACK.onclick=async () => {
		if(Dat && (Edit || Dat.dty)) {
			delete Dat.dty, setEdit(0), utils.onNav();
		} else if(history.state==='NLDB') utils.goBack();
		else go('/');
	}
	EDIT.onclick=() => {Edit?editor(NE_TYPE[DB._v]):setEdit(1)}
	//Menu
	MENU.bs=new bootstrap.Modal(MENU), OC.bs=new bootstrap.Offcanvas(OC);
	MENU.addEventListener('hidden.bs.modal', () => {MB.textContent='',MENU.w=0});
	O_CF.onclick=() => editor(DB._v, DB._i);
	O_TH.onclick=() => {setTheme(LM?0:1,1),userMenu()}
	O_SE.onclick=() => editor('s');
	O_LI.onclick=() => go('/login',1);
	O_LO.onclick=() => {
		if(!Edit) dbGet('lo').then(() => logout(2)).catch(err);
	}
	UV.textContent=utils.VER;
} catch(e) {
	utils.onNav=null;
	for(let c in utils.getCookies()) utils.remCookie(c);
	if('localStorage' in window) localStorage.clear();
	alert(e);
}}

function setTheme(lm, upd) {
	if(upd) localStorage.setItem('t',lm);
	DB.setAttribute('data-bs-theme',lm?'light':'dark');
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
	Usr=null; utils.remCookie('k');
	localStorage.clear();
	if(f===2) utils.onNav(),userMenu();
	else if(f===1) utils.onNav(1);
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
}
onscroll=() => {
	let h=scrollY-LScr > 0;
	HDR.classList.toggle('hide',h);
	FTR.classList.toggle('hide',h);
	LScr=scrollY;
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

utils.onNav = async e => {
	let q=location.search.slice(1);
	[DB._v, DB._i] = parseNav(DB._q=q);
	//Loader
	DB.removeAttribute('load');
	let ls=LOAD.style, ts=LOAD.firstChild.style, t=setTimeout(() => {
		ts.animation='lr .8s ease-in infinite', DB.mt.content='#000';
	},200);
	ls.display=null, ls.opacity=1;
	//Header
	HMB.className=Usr?'user':'';
	HMB.lastChild.textContent=Usr?Usr.ns:'';
	O_SE.hidden=!Usr;
	O_CF.hidden=!Usr || !DB._q;
	setEdit(Edit), EDIT.hidden=!Usr;
	//Draw View
	CONT.textContent='';
	if(e===1) return;
	try {
		/*if(i.startsWith('l:')) await listView(i.slice(2));
		else if(i.startsWith('t:')) await tableView(i.slice(2));
		else if(i.startsWith('c:')) await catView(i.slice(2));
		else if(i.startsWith('s:')) await catView(i.slice(2),1);
		else if(i) await itemView(i);*/
		switch(DB._v) {
			case 'p': await partView(); break;
			case 'c': await plView(); break;
			default:
				if(q) throw "Bad Path";
				await catView();
		}
	} catch(e) {
		console.error(e);
		setEdit(0), EDIT.hidden=1;
		CONT.innerHTML=safeHTML(`<span style='color:red'>${e}</span>`);
	} finally {
		onresize(), clearTimeout(t); DB.mt.content=DB.tc;
		ls.opacity=0, ts.animation=null, ls.zIndex=980;
		setTimeout(() => ls.display='none',220);
		DB.setAttribute('load','');
	}
}

function go(uri, force) {
	if(Dat && (Edit || Dat.dty)) {
		if(Dat.dty) return err("You haven't saved your changes! Please press Save or Cancel.");
		let s=uri.indexOf('?');
		if(s!==-1) editor(...parseNav(uri.slice(s+1)));
	} else if(force) location=uri;
	else utils.go(uri,'NLDB');
}

function parseNav(q) {
	let x=q.indexOf(':');
	return [x===-1?'':q.slice(0,x), x===-1?'':q.slice(x+1)];
}

function setEdit(e) {
	Edit=e;
	BACK.innerHTML=`<i class=bi>&#x${e?'F62A':'F12C'};</i>`;
	EDIT.innerHTML=`<i class=bi${e?'>&#xF4FE':' style="font-size:20px">&#xF4C8'};</i>`;
	BACK.title=e?"Cancel":"Back", EDIT.title=e?"Add":"Edit";
	BACK.hidden=!DB._q && !e;
}

//============================================== Views ==============================================

async function catView() {
	document.title="NLDB";
	Dat=await dbGet('cl');
	if(!Dat.length) return CONT.innerHTML="<i class=na>No categories yet...</i>";
	let c=utils.mkDiv(CONT,'cl'),d,a;
	for(d of Dat) {
		a=utils.mkEl('a',c,null,null,'<i class=bi>&#xF8C4;</i><br>');
		utils.addText(a,d.n), mkLink(a,`?c:${d._id}`);
	}
}

async function plView() {
	Dat=await dbGet('pl',DB._i);
	if(!Dat.length) return CONT.innerHTML="<i class=na>No parts yet...</i>";
	let c=utils.mkDiv(CONT,'pl'),d,a;
	for(d of Dat) {
		a=utils.mkEl('a',utils.mkDiv(c)), a.textContent=`${d.n} (${d.d})`;
		mkLink(a,`?p:${d._id}`);
	}
}

async function partView() {
	Dat=await dbGet('p',DB._i);
	let c=utils.mkDiv(CONT,'pv');
	utils.mkEl('h1',c).textContent=Dat.n;
	if(Dat.m) utils.mkEl('h2',c).textContent=Dat.m;
	if(Dat.d) utils.mkEl('p',c,null,null,safeHTML(Dat.d));
	utils.mkEl('code',c).textContent=JSON.stringify(Dat,null,1);
}

//============================================== View Render ==============================================

//============================================== Menus ==============================================

const S_TABS=["All", "Parts", "Inventory", "Locations", "People"],
NE_TYPE={'':'c', c:'p'};

function mkMenu(name, btns, width) {
	M_T.textContent=name, M_H.hidden=name==null, M_F.hidden=!btns;
	MENU.style.setProperty('--bs-modal-width', (MENU.w=(width||500))+'px');
	MENU.bs._config.backdrop=btns?'static':true;
	onresize();
}

function searchMenu() {
	mkMenu();
	let s=mkInput(MB,"Search for anything...",I_TEXT);
	//Tabs
	let tl=utils.mkEl('ul',MB,'nav nav-underline');
	S_TABS.forEach((t,i) => {
		t=utils.mkEl('a',utils.mkEl('li',tl,'nav-item'),'nav-link'+(i?'':' active'),null,t);
		t.href='#', t.onclick=sTab;
	});
	MENU.bs.show();
	setTimeout(() => s.focus(),200);
}
function sTab(e) {
	e.preventDefault();
	for(let c of this.parentElement.parentElement.children)
		c.firstChild.classList.remove('active');
	this.classList.add('active');
}

function userMenu() {
	if(Usr) O_USR.textContent=`Logged in as ${Usr.n}`;
	O_LI.hidden=!(O_USR.hidden=O_LO.hidden=!Usr);
	O_TH.innerHTML=`<i class=bi>&#x${LM?"F497;</i><span>Dark Mode":
		"F5A2;</i><span>Light Mode"}</span>`;
	OC.bs.show();
}

async function editor(type, id) {try {
	let D,I={};
	async function menu(t,tn) {
		if(id) D=await dbGet(t,id);
		mkMenu(id?"Editing "+D.n:"New "+tn,1,650);
	}
	function input() {
		let x=D||1, a=arguments, k=Array.prototype.splice.call(a,0,1);
		a[2]=D&&D[k]||a[2], a.length=3;
		a=mkInput(MB, ...a);
		if(k) (I[x]||(I[x]={}))[k]=a;
		return a;
	}
	async function sync(f) {
		M_BS.disabled=1;
		await f().catch(err);
		M_BS.disabled=0;
	}
	async function edit(t,d=D,nu) {
		if(!M_BS.disabled) return sync(() => edit(t,d,nu));
		let a=[t+(d?'u':'n')], nd={}, x=I[d||1], k,v,c;
		if(d || t!=='c') a[1] = d?d._id:DB._i;
		a.push(nd);
		for(k in x) {
			v=x[k].value;
			switch(x[k].type) {
				case 'color': v=parseInt(v.slice(1),16);
				break; case 'checkbox': v=x[k].checked;
			}
			if(!d || (v?d[k]!==v:d[k])) nd[k]=v,c=1;
		}
		if(c) await dbPost(...a);
		if(!nu) MENU.bs.hide(), utils.onNav();
	}

	//Draw menu
	switch(type) {
	case 'p':
		await menu('p',"Part");
		input('n', "Name / PN", I_TEXT);
		input('m', "OEM (Optional)", I_TEXT);
		input('d', "Description", I_AREA);
		//s:subId, c:cmnt, cv:catVars, sv:subVars, v:vars
		//TODO Cat fields, subcat fields, custom fields
		//TODO Only send if value changed
		M_BS.onclick=() => edit('p');
	break; case 'c':
		await menu('c',"Category");
		input('n', "Name", I_TEXT);
		input('h', "Track History", I_SWITCH, D?D.h:1);
		//TODO Cat custom fields
		M_BS.onclick=() => edit('c');
	break; case 's':
		//TODO Fetch full WS settings via dbGet
		mkMenu("Settings",1,600);
		D=Usr, utils.mkEl('h2',MB,null,null,"User Settings");
		input('n', "Display Name", I_TEXT);
		input('e', "Email", I_EMAIL);
		input('c1', "Primary Color", I_COLOR);
		input('c2', "Accent Color", I_COLOR);
		input(0, "Reset Colors", I_LINK).onclick=e => {
			I[Usr].c1.value=WS.c1, I[Usr].c2.value=WS.c2;
			e.preventDefault();
		}
		input(0, "Reset Password", I_LINK);
		//TODO Only show if user has permission to edit these
		D=WS, utils.mkEl('hr',MB);
		utils.mkEl('h2',MB,null,null,"Workspace Settings");
		input('e', "Email Domain", I_EMAIL, '*');
		let u=D={}; input('i', "Brand Logo", I_FILE), D=WS;
		input('c1', "Default Primary Color", I_COLOR);
		input('c2', "Default Accent Color", I_COLOR);
		//TODO input(null, "<info icon> Help & About", I_LINK);
		M_BS.onclick=() => sync(async () => {
			let f=I[u].i.files[0], p=[];//p=[edit('u',Usr,1), edit('w',WS,1)];
			if(f) p.push(getUri('/up?icon',f,1));
			await Promise.all(p);
			MENU.bs.hide(), utils.onNav();
		});
	break; default:
		throw "Bad View Mode";
	}
	MENU.bs.show();
} catch(e) {err(e)}}

//============================================== Item Render ==============================================

//============================================== Item Edit ==============================================

//============================================== Database ==============================================

const _eRX = /[^\w <>,.:;?/\\!@#$^*()"'|_+={}\[\]-]/g;
function _enc(x) {return '%'+x.charCodeAt(0).toString(16).toUpperCase()}
function _enp(s,b) {
	if(typeof s==='object') s=JSON.stringify(s).slice(1,-1);
	return b?s.replace(_eRX, _enc):encodeURIComponent(s);
}

async function getUri(uri,d,b) {
	let u,r={mode:'same-origin', cache:'no-store'};
	if(b) r.method="POST", r.body=d, u=uri; else u=uri+'?'+d;
	try {r=await fetch(new Request(u,r)), b=await r.text()}
	catch(e) {
		b=tCase(uri.slice(1)), e=`${e}`, u=e.indexOf(':');
		throw `<b>${b} ${e.slice(0,u+1)}</b> ${e.slice(u+2)} @ <i>${d}</i>`;
	}
	if(r.status===410 && uri==='/db') logout(1);
	if(r.status!==200) {
		throw `<b>${tCase(uri.slice(1))} Code ${r.status}:</b> ${b} @ <i>${d}</i>`;
	}
	return b;
}
async function _DBQ(a,b) {
	Array.prototype.forEach.call(a,(n,i) => {a[i]=_enp(n,b)});
	b=await getUri('/db',Array.prototype.join.call(a,'&'),b);
	b=!b||b==='1'||JSON.parse(b), console.debug(...a,b);
	return b;
}
function dbGet() {return _DBQ(arguments)}
function dbPost() {return _DBQ(arguments,1)}

//============================================== Support ==============================================

const I_TEXT=1,
I_AREA=2,
I_EMAIL=3,
I_COLOR=4,
I_FILE=5,
I_SWITCH=6,
I_LINK=7;

function mkInput(par, name, type, val) {
	let r=par.id==='MB' && !M_F.hidden, l,i,c,b;
	switch(type) {
	case I_TEXT: case I_AREA: case I_EMAIL:
		if(r) r=utils.mkDiv(par), l=utils.mkEl('label',r,'lbl');
		i=utils.mkEl(type===I_AREA?'textarea':'input', r||par,
			'form-control'+(l?' iLbl':''));
		if(type===I_EMAIL) i.type='email';
	break; case I_COLOR:
		r=utils.mkDiv(par,'cInp');
		i=utils.mkEl('input',r,'form-control form-control-color');
		l=utils.mkEl('label',r);
		i.type='color';
	break; case I_FILE:
		//TODO Handle preview/filename for pre-existing URL from 'val' param, get mime type
		r=utils.mkDiv(par);
		l=utils.mkEl('label',r,'lbl');
		c=utils.mkDiv(r,'form-control iLbl');
		i=utils.mkEl('input',c), i.type='file';
		c=utils.mkEl('span',c);
		b=utils.mkEl('button',r,'btn tabB',null,"Clear");
		utils.center(b,'x');
		b.onclick=() => {i.value='',i.onchange()}
		(i.onchange=(_,f) => {
			if(f==null) f=i.files[0];
			if(!f) return c.textContent="No file chosen", b.hidden=1;
			if(!f.type.startsWith("image/"))
				return c.textContent=f.name, b.hidden=0;
			let rd=new FileReader();
			rd.onload=() => {
				c.innerHTML=`<img src='${rd.result}' style='width:100%'>`;
				b.hidden=0;
			}
			rd.readAsDataURL(f);
		})(0,val);
	break; case I_SWITCH:
		l=utils.mkDiv(par,'form-switch');
		i=utils.mkEl('input',l,'form-check-input');
		l=utils.mkEl('label',l);
		i.type='checkbox', i.role='switch';
		i.setAttribute('switch','');
	break; case I_LINK:
		i=utils.mkEl('a',par,'iLnk');
		i.href=val||'#', i.textContent=name;
		return i;
	default:
		throw "Unknown input type "+type;
	}
	i.title=name;
	if(l) l.htmlFor=i.id='f'+par.childElementCount, l.textContent=name;
	else i.placeholder=name;
	if(type===I_FILE) return i;
	i.onblur=() => i.value=type===I_TEXT?tCase(i.value):i.value.trim();
	if(type===I_AREA) utils.autosize(i,10);
	if(val) type===I_SWITCH?i.checked=val:type===I_AREA?i.set(val):i.value=val;
	return i;
}

function err(e) {
	console.error(e);
	mkMenu("Error");
	MB.innerHTML=safeHTML(`<span style='color:red'>${e}</span>`);
	MENU.bs.show();
}

function mkLink(l,u) {l.href=u,l.onclick=_lClk}
function _lClk(e) {e.preventDefault(),go(this.href)}

const R_TU=/_|:|\s+/g, R_TS=/(?=[^a-zA-Z][a-zA-Z])/g;

function tCase(s) {
	if(!(s=s.replace(R_TU,' ').trim())) return ''; s=s.split(R_TS);
	s.forEach((w,i) => {s[i]=(i?w[0]:'')+w[i?1:0].toUpperCase()+w.slice(i?2:1)});
	return s.join('');
}

function getHSL(hex) {
	return utils.rgbToHsl(...utils.hexToRgb(hex)).map(n => Math.round(n));
}

//============================================== Grabable ==============================================
/*
function makeGrabable(el,btn,down,up) {
	let cb=e => {if(down()===false) return;let g=new Grabber(el,e);g.ondrop=up,EditDone=g.cancel}
	btn.addEventListener('mousedown',cb), btn.addEventListener('touchstart',cb);
}

function Grabber(el,e,hb) {
	const par=el.parentElement, rect=el.boundingRect, rects=[],
	sr=utils.mkDiv(DB,'grabScroll',{top:DB.scrollHeight}),
	initSX=scrollX, initSY=scrollY, sInd=el.index, self=this;
	let mX,mY,oX,oY,tNum,sel=null;
	//Get Initial Cursor/Touch Pos:
	if(e != null && (e.type == 'touchstart' || e.type == 'mousedown')) {
		let t=e; if(e.type == 'touchstart') t=e.changedTouches[0], tNum=t.identifier;
		oX=t.clientX-rect.x, oY=t.clientY-rect.y;
	}
	//Create Dropzone Region:
	const drop=utils.mkDiv(par,'grabInsert',{width:rect.width,height:rect.height}); drop.noGrab=1;
	//Create Element Container:
	const cont=utils.mkDiv(null,'grabMoving',{width:rect.width,height:rect.height}), cs=cont.style;
	cont.noGrab=1; el.remove(); cont.appendChild(el);
	//Cache Element Sizes/Positions:
	for(let i=0,c=par.children,l=c.length,re,r; i<l; i++) {
		re=c[i], r=re.boundingRect.expand(hb||10), r.e=re;
		if(!re.noGrab || re === drop) rects.push(r);
	}
	//Final Setup & Event Listeners:
	par.appendChild(cont);
	if(!e || e.type == 'mousedown')
		addEventListener('mousemove',onDrag,{passive:false}),addEventListener('mouseup',onDrop);
	if(!e || e.type == 'touchstart')
		addEventListener('touchmove',onDrag,{passive:false}),addEventListener('touchend',onDrop);
	addEventListener('keydown', onCancel); onDrag(e);
	function onDrag(e) {
		e.preventDefault(); let t=getTouch(e); if(!t) return;
		mX=t.clientX, mY=t.clientY; if(oX==null) oX=mX-rect.x, oY=mY-rect.y;
		cs.left=mX-oX, cs.top=mY-oY; findDropRegion(mX+scrollX-initSX, mY+scrollY-initSY);
	}
	function onDrop(e) {
		if(e && !getTouch(e)) return;
		if(!sel) return onCancel(); else onCancel(true); let d=(sel===drop);
		if(self.ondrop && self.ondrop.call(self,d?par.childElementCount+1:sel.index) === false)
			par.insertChildAt(el, sInd);
		else if(d) par.appendChild(el); else par.insertBefore(el, sel);
	}
	function onCancel(noIns) {
		if(typeof noIns == 'object' && noIns.type == 'keydown' && noIns.key != 'Escape') return;
		drop.remove(), cont.remove(), el.remove(), sr.remove(),
		removeEventListener('mousemove', onDrag), removeEventListener('mouseup', onDrop),
		removeEventListener('touchmove', onDrag), removeEventListener('touchend', onDrop),
		removeEventListener('keydown', onCancel);
		if(noIns !== true) { par.insertChildAt(el, sInd); if(self.ondrop) self.ondrop.call(self,-1); }
	}
	function findDropRegion(x, y) {
		drop.remove(); for(let i=0,l=rects.length,r; i<l; i++) {
			r=rects[i]; if(r.contains(x,y)) {
				if(r.e === drop) par.appendChild(drop);
				else try { par.insertBefore(drop, r.e); } catch(err) {return sel=null}
				return sel=r.e;
			}
		}
		sel=null;
	}
	function getTouch(e) {
		if(e.type == 'touchmove') {
			let t=e.changedTouches; if(tNum == null) return t[0];
			for(let i=0,l=t.length; i<l; i++) if(t[i].identifier == tNum) return t[i];
		} else return e;
	}
	this.drop=onDrop, this.cancel=onCancel, this.target=el;
	if(e) e.preventDefault();
}

//============================================== Uploader ==============================================

function uploadFile(cb) {
	let p=utils.mkDiv(DB,'upPop'), c=utils.mkDiv(p,'upClose',null,"Close"),
	up=new Uploader(null,utils.mkDiv(p,'upBox'));
	c.onclick=()=>{p.style.opacity=0,setTimeout(()=>{p.remove()},1200)}
	setTimeout(()=>{p.style.opacity=1},1); up.onFileLoad=(d,f)=>{cb(d,f),c.onclick()}
}

//Settings:
const LabelText="<strong>Choose a file</strong> or drag it here.",
UploadText="<i>Reading File...</i>", DoneText="File Loaded Successfully!",
ErrorTextL="<i>Error:</i> ", ErrorTextR="!<br><strong>Try Again?</strong>";

/*Callbacks:
onFileLoad - Called once per file. An error can be returned as a string
onLoadDone - Called once all files in a drop are processed. An error can be returned as a string*

//HTML5 Upload API v1.3 by Pecacheu
function Uploader(extList, par, maxFiles, doneMsg) {
	const self=this; if(!maxFiles) maxFiles=1;
	//Layout:
	let fb=utils.mkDiv(par,'upFileBox'), uc=utils.mkDiv(fb,'upContents'), ic=utils.mkDiv(uc,'icon'),
	lb=utils.mkEl('label',uc), ip=utils.mkEl('input',uc), tx=utils.mkEl('span',uc,null,{display:'none'});
	ip.type='file',ip.id='upInput'; if(extList) ip.accept=extList.join();
	lb.setAttribute('for','upInput'); lb.innerHTML=LabelText;
	//Listeners:
	fb.ondrag=prv; fb.ondragover=fb.ondragenter=dragOver;
	fb.ondragleave=fb.ondragend=dragOut; dropRst();
	function prv(e) {e.preventDefault(),e.stopPropagation()}
	function dragOver(e) {prv(e),fb.classList.add('upDragOver')}
	function dragOut(e) {prv(e),fb.classList.remove('upDragOver')}
	function dropRst() {DB.style.cursor=null, ip.value=null, fb.ondrop=ip.onchange=drop}
	function drop(e) {
		fb.ondrop=ip.onchange=null; dragOut(e); txt(UploadText); DB.style.cursor='wait';
		let f; if(e.type=='drop') f=e.dataTransfer.files; else if(e.type=='change') f=e.target.files;
		if(!f || !f.length) return txt(LabelText),dropRst();
		if(f.length>maxFiles) return txt(ErrorTextL+"Too many files"+ErrorTextR),dropRst();
		setTimeout(()=>{parseNext(f,0)},1);
	}
	function parseNext(fl,f) {
		let e; if(f==fl.length) {
			if(self.onLoadDone) e=self.onLoadDone.call(self);
			if(e) txt(ErrorTextL+e+ErrorTextR); else txt(doneMsg||DoneText); dropRst();
		} else {
			let n=fl[f].name, r=new FileReader();
			if(extList && extList.indexOf(n.slice(n.lastIndexOf('.')).toLowerCase()) == -1)
				return txt(ErrorTextL+"Invalid file type"+ErrorTextR),dropRst();
			r.readAsBinaryString(fl[f]); r.onload=e => {
				let d=e.target.result;
				if(!d) return txt(ErrorTextL+"No data read"+ErrorTextR),dropRst();
				if(self.onFileLoad) e=self.onFileLoad.call(self,d,fl[f]);
				if(e) return txt("<i>Error in "+n+":</i> "+e+ErrorTextR),dropRst();
				parseNext(fl,f+1);
			}
		}
	}
	function txt(t) {
		let ls=lb.style, ts=tx.style;
		if(t==LabelText || t.startsWith("<i>Err")) lb.innerHTML=t, ls.display=null, ts.display='none';
		else tx.innerHTML=t, ls.display='none', ts.display=null, tx.className=(t==DoneText?'doneAnim':'');
	}
}

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