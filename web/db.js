//NLDB, Pecacheu 2025. GNU GPL v3
'use strict';

let Usr, Dat, Cat, Edit, DB, WS, LM, LScr, safeHTML, MStack=[];
const R_UC=/[A-Z]/, TknExp=48*3600000;

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
	if(!lp) NV.textContent=WS[0];
	setTheme(Number(localStorage.getItem('t')), 0, '#'+WS[1], '#'+WS[2]);
	//Login Page
	if(lp) {
		BL.onclick=BS.onclick=login;
		return DB=utils.onNav=onresize=onscroll=onkeydown=null;
	}
	//Header
	safeHTML=HtmlSanitizer.SanitizeHtml;
	SHB.onclick=() => searchMenu();
	MHB.onclick=userMenu;
	HHB.onclick=() => go('?h:p,'+DB._i);
	BACK.onclick=async () => {
		if(Dat && (Edit || Dat.dty)) {
			setEdit(0);
			if(Dat.dty) delete Dat.dty, utils.onNav();
		} else if(history.state==='NLDB') utils.goBack();
		else go('/');
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
	MENU.addEventListener('hidden.bs.modal', () => {MB.textContent='',MENU.w=0});
	CFG.onclick=() => editor(DB._v, DB._i);
	O_LL.onclick=locView;
	O_HL.onclick=() => go('?h:'+Cat._id);
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
	let k=utils.getCookie('k');
	if(k) utils.setCookie('k',k,TknExp);
	else if(Usr) logout();
	MHB.className=Usr?'user':'';
	MHB.lastChild.textContent=Usr?Usr.ns:'';
	O_SE.hidden=!Usr;
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
			case 'h': await hlView(); break;
			default:
				if(q) {await setCat(); throw "Bad Path"}
				await catView();
		}
	} catch(e) {
		console.error(e);
		setEdit(0), EDIT.hidden=O_HL.hidden=O_LL.hidden=1
		CONT.innerHTML=safeHTML(`<p style='color:red'>${e}</p>`);
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
	BACK.hidden=!DB._q && !e, CFG.hidden=!Usr || !DB._q || e;
	SHB.hidden=(MHB.hidden=!(SAVE.hidden=!e||DB._v!=='p'))||!DB._v;
	HHB.hidden=e||DB._v!=='p';
}

//============================================== View Draw ==============================================

async function catView() {
	document.title="NLDB";
	Dat=await dbGet('cl'), await setCat();
	if(!Dat.length) return CONT.innerHTML="<i class=na>No categories yet...</i>";
	let c=utils.mkDiv(CONT,'cl'),d,a;
	for(d of Dat) {
		a=utils.mkEl('a',c,null,null,'<i class=bi>&#xF8C4;</i><br>');
		utils.addText(a,d.n), mkLink(a,`?c:${d._id}`);
	}
}

async function plView() {
	Dat=(await Promise.all([dbGet('pl',DB._i), setCat(DB._i)]))[0];
	if(!Dat.length) return CONT.innerHTML="<i class=na>No parts yet...</i>";
	let c=utils.mkDiv(CONT,'pl'),d;
	utils.mkEl('h1',c).textContent=Cat.n;
	for(d of Dat) draw(c,'p',d);
}

async function hlView() {
	Dat=(await Promise.all([dbGet('hl',DB._i), setCat(DB._i)]))[0];
	if(!Dat.length) return CONT.innerHTML="<i class=na>No events yet...</i>";
	let c=utils.mkDiv(CONT,'pl'),d;
	utils.mkEl('h1',c).textContent="History: "+Cat.n;
	for(d of Dat) draw(c,'h',d);
}

async function partView() {
	Dat=await dbGet('p',DB._i), await setCat(Dat._c);
	let c=utils.mkDiv(CONT,'pv'), td=c, i=Dat.i;
	if(i) {
		let tt=utils.mkEl('tr',utils.mkEl('table',c));
		utils.mkEl('img',utils.mkEl('td',tt)).src=lnkToUri(i);
		td=utils.mkEl('td',tt);
	}
	utils.mkEl('h1',td).textContent=Dat.n;
	if(Dat.m) utils.mkEl('h2',td).textContent=Dat.m;
	if(Dat.d) utils.mkEl('p',c,null,null,safeHTML(Dat.d));
	utils.mkEl('code',c,null,{marginBottom:'1rem',display:'block'}).
		textContent=JSON.stringify(Dat,null,1);
	utils.mkEl('h2',c,'hr').textContent=Cat.n;
	utils.mkEl('h2',c,'hr',null,"Item");
	//TODO Custom fields
}

async function locView() {

}

//============================================== Item Draw ==============================================

function draw(par, type, d) {
	let a;
	switch(type) {
	case 'p':
		a=utils.mkEl('a',utils.mkEl('p',par)), a.textContent=`${d.n} (${d.d})`;
		mkLink(a,`?p:${d._id}`);
	break; default:
		utils.mkEl('p',par).textContent=JSON.stringify(d);
	}
}

//============================================== Menus ==============================================

const S_TABS={a:"All", p:"Parts", i:"Inventory", l:"Locations", u:"People"},
F_TYPE={f:"Field", h:"Heading", t:"Text", p:"Item", i:"Inventory", l:"Location", u:"User"},
NE_TYPE={'':'c', c:'p', p:'v'};

function mkMenu(name, btns, width, nc) {
	if(MB.m && MENU.bs._isShown) MStack.push([MB.m, [...MB.children],
		M_OK.onclick, M_DEL.onclick, M_CPY.onclick]);
	MB.m=arguments;
	M_T.textContent=name, M_H.hidden=name==null;
	M_F.hidden=!btns, M_DEL.hidden=btns<2, M_CPY.hidden=btns<3;
	MENU.style.setProperty('--bs-modal-width', (MENU.w=(width||500))+'px');
	MENU.bs._config.backdrop=btns?'static':true;
	if(!nc) MB.textContent='';
	onresize();
}
function showMenu() {MENU.bs.show()}
function hideMenu() {MStack=[], MENU.bs.hide()}

//TODO Retain last search str & results
function searchMenu(sel='a') {
	mkMenu();
	let s=mkInput(MB,"Search for anything...",I_TEXT),
	tl=utils.mkEl('ul',MB,'nav nav-underline'),
	rl=utils.mkDiv(MB,'pl'), sa=sel==='a',t,e,ns,ac;
	for(t in S_TABS) {
		e=utils.mkEl('a',utils.mkEl('li',tl,'nav-item'),'nav-link'+
			(t===sel?' active':'')+(sa?'':' disabled'),null,S_TABS[t]);
		e.href='#', e.t=t, e.onclick=sa?sTab:e => e.preventDefault();
	}
	tl.t=sel, tl.s=s, s.onblur=null;

	s.oninput=async () => {try {
		if(ns) return ns=2;
		ns=1, setTimeout(() => {
			let n=ns===2; ns=0; if(n) s.oninput();
		},300);
		if(ac) ac.abort();
		let q=s.value, t=tl.t, r;
		ac=new AbortController();
		q=q?await dbGet(ac, 'q', Cat._id, t, q):[];
		rl.textContent='';
		if(Array.isArray(q)) for(r of q) draw(rl,t,r);
		else for(t in q) {
			utils.mkEl('h3',rl,'hr').textContent=S_TABS[t];
			for(r of q[t]) draw(rl,t,r);
		}
		ac=null;
	} catch(e) {
		if(e.name==='AbortError') console.debug("Aborted search");
		else err(e);
	}}
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
			if(f.multiple) {
				v=[];
				f.options.each(o => {o.selected&&v.push(o.value)});
			} else if(f.tagName==='SELECT') {
				v=f.value;
				if(Number.isFinite(b=Number(v))) v=b;
			} else {
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
	case 'c':
		let cd=DB._v===''?Dat:await dbGet('cl'), cl={},c;
		for(c of cd) if(c._id!==id) cl[c._id]=c.n;
		await menu('c',"Category");
		input('n', "Name", I_TEXT);
		input('h', "Track History", I_SWITCH, D.c?D.c.h:1);
		input('i', "Separate Items & Inventory", I_SWITCH, D.c?D.c.i:1);
		c=input('e', "External Locations", I_MULTI, null, cl);
		if(!cd.length) c.parentElement.hidden=1;
		//TODO Cat custom fields
	break; case 'p':
		await menu('p',"Part");
		input('n', "Name / PN", I_TEXT);
		input('m', "OEM (Optional)", I_TEXT);
		input('d', "Description", I_AREA);
		input('i', "Icon", I_FILE);
		//s:subId, v:vars
		//TODO Cat fields, subcat fields, custom fields
		input('_h', "Comment", I_TEXT).c.hidden=!!id;
	break; case 'v':
		await menu('v',"Custom Field");
		input('t', "Type", I_DROP, null, F_TYPE);
		input('d', "Data Type", I_DROP, null, I_TYPE);
		input('i', "Data ID", I_TEXT);
		let i=I.v, ni=input('n', "Name", I_TEXT), ti=mkInput(MB, "Text", I_AREA),
			fv=mkInput(MB, "Fixed Value", I_SWITCH);
		ti.c.remove();
		let sb=utils.mkEl('button', MB, 'btn btn-success', null, "Select Entry");
		sb.onclick=() => searchMenu(sb.s);
		i.d.onchange=e => {
			if(e) i.v.c.remove();
			let t=Number(i.d.value);
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
			let t=i.t.value;
			if(fv.c.hidden = t==='t'||t==='h') fv.checked=0;
			fv.onchange();
			i.n.c.replaceWith((i.n=t==='t'?ti:ni).c);
			i.d.c.hidden = t!=='f';
			if(t==='f') i.d.value=1, i.d.onchange();
			else i.v.c.remove(), delete i.v, i.d.value='';
			sb.s=t==='p'||t==='i'||t==='l'||t==='u'?t:0;
			sb.hidden=!sb.s;
		})();
		OK=async () => {
			if(!i.i.c.hidden && !i.i.value) throw "Data ID Required";
			await edit('v',DB._i);
		}
	break; case 's':
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
			await dbGet(...d), hideMenu();
		});
	}
	M_CPY.onclick=async () => {
		id=0,D={},delete MB.m;
		await menu(T,TN,1).catch(err);
		I[T]._h.c.hidden=0;
		MENU.scrollTo({top:0,behavior:'smooth'});
	}
	showMenu();
} catch(e) {err(e)}}

//============================================== Item Render ==============================================

//============================================== Item Edit ==============================================

//============================================== Database ==============================================

const R_EX=/[^\w <>,.:;?/\\!@#$^*()"'|_+={}\[\]-]/g, R_JS=/^[\[{]/;
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
	if(r.status===410 && uri==='/db') logout(1);
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
	O_HL.hidden=(O_LL.hidden=!Usr||!Cat)||!Cat.h||DB._v==='h';
}

//============================================== Support ==============================================

const I_TEXT=1, I_AREA=2, I_EMAIL=3, I_COLOR=4, I_FILE=5,
I_SWITCH=6, I_LINK=7, I_DROP=8, I_MULTI=9, I_TYPE={};
I_TYPE[I_TEXT]="Text", I_TYPE[I_AREA]="Text Area", I_TYPE[I_EMAIL]="Email", I_TYPE[I_COLOR]="Color",
I_TYPE[I_FILE]="Image / File", I_TYPE[I_SWITCH]="Switch", I_TYPE[I_LINK]="Link", I_TYPE[I_DROP]="Dropdown",
I_TYPE[I_MULTI]="Multi-Select";

function mkInput(par, name, type, val, opts) {
	let r=par.id==='MB' && !M_F.hidden, l,i,c,b;
	switch(type) {
	case I_TEXT: case I_AREA: case I_EMAIL:
		if(r) r=utils.mkDiv(par), l=utils.mkEl('label',r,'lbl');
		i=utils.mkEl(type===I_AREA?'textarea':'input', r||par,
			'form-control'+(l?' iLbl':''));
		if(type===I_EMAIL) i.type='email';
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
		return i;
	default:
		throw "Unknown input type "+type;
	}
	i.title=name;
	if(l) l.htmlFor=i.id='f'+par.childElementCount, l.textContent=name;
	else i.placeholder=name;
	if(type===I_TEXT) i.onblur=() => i.value=tCase(i.value);
	else if(type===I_AREA || type===I_EMAIL) i.onblur=() => i.value=i.value.trim();
	if(type===I_AREA) utils.autosize(i,10);
	if(val) type===I_SWITCH?i.checked=val:i.set?i.set(val):i.value=val;
	return i;
}

function err(e) {
	console.error(e);
	mkMenu("Error");
	MB.innerHTML=safeHTML(`<p style='color:red'>${e}</p>`);
	showMenu();
}

function mkLink(l,u) {l.href=u,l.onclick=_lClk}
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