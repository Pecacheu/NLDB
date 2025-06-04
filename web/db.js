//NLDB, Pecacheu 2025. GNU GPL v3
'use strict';

let Usr, Dat, Edit, DB, TH, LScr, safeHTML;

//============================================== UI & Nav ==============================================

/*Disco Mode
let hue=0;
setInterval(() => {
	DB.style.setProperty('--h1', hue);
	DB.style.setProperty('--h2', hue+180);
	DB.mt.content=DB.tc=getComputedStyle(DB).getPropertyValue('--hdr-bg');
	if((hue+=1) >= 360) hue -= 360;
}, 50);*/

onload=() => {
	DB=document.body;
	DB.mt=document.querySelector('meta[name=theme-color]');
	setTheme(Number(utils.getCookie('t')));
	//Login Page
	if(!window.MENU) {
		BL.onclick=BS.onclick=login;
		return DB=utils.onNav=onscroll=onkeydown=null;
	}
	safeHTML=HtmlSanitizer.SanitizeHtml;
	//Header
	HSB.onclick=searchMenu;
	HMB.onclick=userMenu;
	BACK.onclick=async () => {
		if(Dat && (Edit || Dat.dty)) {
			delete Dat.dty; setEdit(0); utils.onNav();
		} else if(history.state==='NLDB') utils.goBack();
		else go('/');
	}
	EDIT.onclick=() => {Edit?editor(NE_TYPE[DB._v]):setEdit(1)}
	//Menu
	MENU.bs=new bootstrap.Modal(MENU), OC.bs=new bootstrap.Offcanvas(OC);
	MENU.addEventListener('hidden.bs.modal', () => {MB.textContent='',MENU.w=0});
	O_CF.onclick=() => editor(DB._v, DB._i);
	O_TH.onclick=() => {setTheme(TH?0:1,1),userMenu()}
	O_LI.onclick=() => go('/login',1);
	O_LO.onclick=() => {
		if(!Edit) dbGet('lo').then(() => {go('/'),userMenu()}).catch(err);
	}
	UV.textContent=utils.VER;
}

function setTheme(t,c) {
	if(c) utils.setCookie('t',t);
	DB.setAttribute('data-bs-theme',t?'light':'dark');
	DB.mt.content=DB.tc=getComputedStyle(DB).getPropertyValue('--hdr-bg');
	TH=t;
}
async function login(e) {
	e.preventDefault();
	//TODO Enforce password rules for decent security?
	ERR.textContent='';
	let d={u:USR.value, p:PWD.value};
	if(this===BS) d.s=1; //This is BS!
	try {
		await getUri('/auth',utils.toQuery(d));
		go('/',1);
	} catch(e) {
		console.error(e);
		ERR.innerHTML=e;
	}
}

//Touch Keyboard Detect
if('visualViewport' in window) {
	let TK,TO,LT,EL,SX,SY;
	function rst(sh) {
		EL=MENU.bs._isShown?MENU:DB, SX=EL.scrollLeft, SY=EL.scrollTop;
		if(sh) TO=setTimeout(() => {EL.style.height=visualViewport.height,TO=0}, 200);
	}
	visualViewport.onresize=e => {
		if(TO) clearTimeout(TO);
		let h=e.target.height; TK=(h*e.target.scale)/utils.h < .75;
		if(TK) rst(1); else if(EL) EL.style.height='';
	}
	document.documentElement.ontouchstart=e => {
		if(TK) LT=e.touches[0], rst();
	}
	document.documentElement.addEventListener('touchmove', e => {
		if(TK) {
			e.preventDefault(); let t;
			if(LT && e.touches.length === 1 && (t=e.changedTouches[0])
					.identifier === LT.identifier) {
				SX += LT.screenX-t.screenX, SY += LT.screenY-t.screenY;
				(MENU.bs._isShown?MENU:DB).scrollTo(SX, SY), LT=t;
			}
		}
	}, {passive:false})
}
onresize=() => {
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

utils.onNav = async () => {
	let q=location.search.slice(1);
	[DB._v, DB._i] = parseNav(DB._q=q);
	//Loader
	DB.removeAttribute('load');
	let ls=LOAD.style, ts=LOAD.firstChild.style, t=setTimeout(() => {
		ts.animation='lr .8s ease-in infinite', DB.mt.content='#000';
	},200);
	ls.display=null, ls.opacity=1;
	//Header
	Usr=utils.getCookie('u');
	HMB.className=Usr?'user':'';
	HMB.lastChild.textContent=Usr||'';
	O_SE.hidden=!Usr;
	O_CF.hidden=!Usr || !DB._q;
	setEdit(Edit), EDIT.hidden=!Usr;
	//Draw View
	CONT.textContent='';
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
		clearTimeout(t); DB.mt.content=DB.tc;
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
	CONT.textContent=JSON.stringify(Dat,null,'\t');
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
	let s=mkInput(MB,"Search for anything...");
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
	if(Usr) O_USR.textContent=`Logged in as ${Usr}`;
	O_LI.hidden=!(O_USR.hidden=O_LO.hidden=!Usr);
	O_TH.innerHTML=`<i class=bi>&#x${TH?"F497;</i><span>Dark Mode":
		"F5A2;</i><span>Light Mode"}</span>`;
	OC.bs.show();
}

async function editor(type, id) {try {
	let d,f,i={};
	async function menu(t,tn) {
		if(id) d=await dbGet(t,id);
		mkMenu(id?"Editing "+d.n:"New "+tn,1,650);
		f=utils.mkEl('table',MB,'fTbl');
	}
	async function edit() {try {
		let a=arguments;
		if(d || a[0]!=='c') Array.prototype.splice.call(a,1,0,d?d._id:DB._i);
		a[0]=a[0]+(d?'u':'n');
		await dbPost(...a);
		MENU.bs.hide();
		utils.onNav();
	} catch(e) {err(e)}}

	switch(type) {
	case 'p':
		await menu('p',"Part");
		i.n=mkInput(f,"Name",1,d&&d.n);
		i.d=mkInput(f,"Description",2,d&&d.d);
		//TODO Cat fields, subcat fields, custom fields
		//TODO Only send if value changed
		M_BS.onclick=() => edit('p',{
			n:i.n.value, d:i.d.value
			//m:mfg, s:subId, c:cmnt, cv:catVars, sv:subVars, v:vars
		});
	break; case 'c':
		await menu('c',"Category");
		i.n=mkInput(f,"Name",1,d&&d.n);
		i.h=mkInput(f,"Track History",3,d?d.h:1);
		//TODO Cat custom fields
		M_BS.onclick=() => edit('c',{
			n:i.n.value, h:i.h.checked
		});
	break; default:
		throw "Bad View Mode";
	}
	MENU.bs.show();
} catch(e) {err(e)}}

//============================================== Item Render ==============================================

//============================================== Item Edit ==============================================

//============================================== Database ==============================================

const ES={db:"DB", up:"Upload"}, _eRX = /[^\w <>,.:;?/\\!@#$^*()"'|_+={}\[\]-]/g;
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
		let eu=ES[uri]; if(!eu) throw e;
		e=`${e}`, u=e.indexOf(':');
		throw `<b>${eu} ${e.slice(0,u+1)}</b> ${e.slice(u+2)} @ <i>${d}</i>`;
	}
	if(r.status!==200) {
		let eu=ES[uri];
		throw eu?`<b>${eu} Code ${r.status}:</b> ${b} @ <i>${d}</i>`:b;
	}
	return b;
}
async function _DBQ(a,b) {
	Array.prototype.forEach.call(a,(n,i) => {a[i]=_enp(n,b)});
	b=await getUri('db',Array.prototype.join.call(a,'&'),b);
	b=!b||b==='1'||JSON.parse(b), console.debug(...a,b);
	return b;
}
function dbGet() {return _DBQ(arguments)}
function dbPost() {return _DBQ(arguments,1)}

//============================================== Support ==============================================

function mkInput(par, name, mode, val) {
	let r,l,i;
	if(par.tagName==='TABLE') r=utils.mkEl('tr',par);
	if(mode===3) {
		if(r) r=utils.mkEl('td',r), r.colSpan=2;
		i=utils.mkDiv(r||par,'form-check form-switch');
		if(r) l=utils.mkEl('label',i,'form-check-label');
		i=utils.mkEl('input',i,'form-check-input');
		i.type='checkbox', i.role='switch';
		i.setAttribute('switch','');
	} else {
		if(r) l=utils.mkEl('label', utils.mkEl('td',r), 'col-form-label');
		i=utils.mkEl(mode===2?'textarea':'input', r?utils.mkEl('td',r):par, 'form-control');
	}
	i.title=name;
	if(l) l.htmlFor=i.id='f'+par.childElementCount, l.textContent=name;
	else i.placeholder=name;
	i.onblur=() => i.value=mode===1?tCase(i.value):i.value.trim();
	if(mode===2) utils.autosize(i,10);
	if(val) mode===3?i.checked=val:mode===2?i.set(val):i.value=val;
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
	if(!s) return ''; s=s.replace(R_TU,' ').trim().split(R_TS);
	s.forEach((w,i) => {s[i]=(i?w[0]:'')+w[i?1:0].toUpperCase()+w.slice(i?2:1)});
	return s.join('');
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