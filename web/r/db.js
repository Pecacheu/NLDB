//NLDB ©2021 Pecacheu. GNU GPL v3.0
'use strict';
let Usr, Itm, Cat, Edit, EditDone, Menu;
const Types=['text','num','date','dt','email','tel','range','cb','sel','selm','fl','fi','sc'],
SMsgDel=3000, SErrDel=8000;

window.onload = () => {
	search.firstChild.placeholder='Search'; //TODO: How does this look?
	nAdd.onclick=addMenu.wrap();
	nUsr.onclick = () => {
		if(Usr) utils.remCookie('dbtkn'),utils.remCookie('dbusr'),utils.onNav();
		else location='/login'+location.search;
	}
	nBack.onclick = () => {
		if(Edit) {
			cont.textContent='', setEdit(0);
			if(Itm.id) itemViewDraw(); else catViewDraw();
		} else if(Itm && Itm.sc && !Itm.id) utils.go('?c:'+Itm.sc);
		else utils.go('/');
	}
	nEdit.onclick = () => {
		setEdit(!Edit); setAS(document,Edit);
		if(Menu) Menu.rem();
	}
	if(!utils.mobile) utils.addClass('menu',{overflow:'hidden !important'});
	uVer.textContent=utils.VER;
}
function setEdit(e,h,a) {
	Edit=e, nBack.src='r/'+(e?'exit':'back')+'.svg',
	nEdit.src='r/'+(e?'done':'edit')+'.svg', nAdd.src='r/'+(e||!Itm?'add':'qr')+'.svg';
	if(a!=null) nAdd.hidden=a; else if(Itm) nAdd.hidden=(Itm&&!Itm.id&&!e);
	if(h!=null) nEdit.hidden=h;
}
window.onresize = () => {
	hdr.style.visibility=(hdr.boundingRect.left < 190)?'hidden':null;
	if(Itm) fAlign();
}
window.onkeydown = e => {
	if(e.key == 'Home') return utils.go('/');
	if(e.key == 'Alt' || e.key == 'ContextMenu') return setEdit(!Edit);
	if(e.key == 'Insert' && !nAdd.hidden) return nAdd.onclick();
	if(Menu && e.key == 'Escape') return Menu.rem();
	if(EditDone) {
		if(e.key == 'Enter') EditDone(1); else if(e.key == 'Escape') EditDone();
	} else if(e.key == 'Escape' && !nBack.hidden) nBack.onclick();
}
utils.onNav = () => {
	//Loader:
	let ls=load.style, ts=load.firstChild.style,
	t=setTimeout(() => ts.animation='lr .8s ease-in infinite', 200);
	ls.display=null, ls.opacity=1;
	//View Render:
	let p,i=location.search.substr(1); Usr=utils.getCookie('dbusr');
	nUsr.className=Usr?'user':null, nUsr.lastChild.textContent=Usr||'';
	console.log('NAV',i);
	if(i.startsWith('c:')) p=catView(i.substr(2));
	else if(i.startsWith('s:')) p=catView(i.substr(2),1);
	else if(i.startsWith('t:')) p=tableView(i.substr(2));
	else if(i) p=itemView(i); else p=indexView();
	p.then(onresize).catch(e => {console.error(e),cont.innerHTML=e}).finally(() => {
		ls.opacity=0, ts.animation=null; clearTimeout(t);
		setTimeout(() => ls.display='none', 220);
	});
}

//============================================== Database ==============================================

function getUri(uri,es,b) {
	return new Promise((re,rj) => utils.loadAjax(uri,
		(e,r) => {if(e) rj("<b>"+(es?es+' ':'')+"Error "+e+":</b> "+r); else re(r)},b?'POST':null,b));
}
function dbPost(t,d) {console.log(t,d);return getUri('up?'+t,'Upload',JSON.stringify(d))}
async function dbReq() {
	let a=[]; for(let i=0,l=arguments.length; i<l; i++) a[i]=encodeURIComponent(arguments[i]);
	console.log(a),a=await getUri('db?'+a.join(';'),'DB'); return a?JSON.parse(a):0;
}
//async function dbCat() {Cat=await dbReq('t','itm')}

function iTyp(t) {let n=Types.indexOf(t);if(n==-1)throw "No Type "+t;return n}
async function dbSave() {
	if(this.SV) return; this.disabled=this.SV=1; if(Edit) nEdit.onclick();
	let s=utils.mkEl('span',this.parentNode,null,{verticalAlign:'middle'});
	try {if(Itm.id) { //Item Save:
		//id = Item ID | s = Sub-Category | n = Name | u = Custom Names |
		//t = Custom Types | v = Custom Values | cX = Cat Value | sX = Sub Value
		let e={id:Itm.id, c:Itm.c, s:tDbStr(Itm.SF.f.value)||null,
			n:Itm.NF.val.trim()||null, u:[],t:[],v:[]};

		Itm.cf.forEach((f,i) => e['c'+i]=f.val.trim()==Itm.cl[i+1].v?null:f.val); //Cat
		Itm.sf.forEach((f,i) => e['s'+i]=f.val.trim()==Itm.sl[i].v?null:f.val); //Sub
		for(let cl=cont.children,i=Itm.FO+1,l=cl.length,f; i<l; i++) //Usr
			f=cl[i], e.u.push(f.name), e.t.push(iTyp(f.d.t)), e.v.push(f.val.toString()||null);

		await dbPost('i',e); if(e.s != Itm.e.s) setTimeout(utils.onNav,500);
		else Itm.e=e, document.title=hdr.textContent=e.n||"Item #"+Itm.id;
	} else { //Cat Save:
		//i = Index | n = Name | t = Type | v = Default Value
		let e=[],n; if(Itm.s) n=Itm.DF.f.num, e=[{t:n?n-1:null}];
		for(let cl=cont.children,i=Itm.FO+1,l=cl.length,f; i<l; i++)
			f=cl[i], e.push({n:f.name, t:iTyp(f.d.t), v:f.val.toString()||null});
		await dbPost(Itm.s?'c':'s',[(Itm.sc?Itm.sc+'-':'')+tDbStr(Itm.t),e]);

		if((n=tCase(Itm.NF.val)) != Itm.t) { //Rename:
			await dbReq(Itm.s?'cn':'sn',tDbStr(Itm.t),tDbStr(n));
			document.title=hdr.textContent=(s?"Sub: ":"Cat: ")+(Itm.t=n);
		}
	}
	s.textContent=" Saved!";
	} catch(e) {this.SV=2,console.error(e),s.innerHTML=' '+e}
	setTimeout(() => {this.disabled=this.SV=0,s.remove()}, this.SV==2?SErrDel:SMsgDel);
}

async function newItem(c) {
	try {utils.go('?'+await dbReq('n',c))}
	catch(e) {console.error(e),cont.innerHTML=e}
}

async function newSub(c) {
	try {await dbReq('nc',c);utils.go('?c:'+c)}
	catch(e) {console.error(e),cont.innerHTML=e}
}

//============================================== View Load ==============================================

async function indexView() {
	Itm=0, search.style.display=null, cont.textContent='',
	cont.style='', document.title=hdr.textContent="NovaLabs Inventory";
	setEdit(0,1,0); nBack.hidden=1;
	let d=await dbReq('a'),c; Cat=Object.keys(d);
	for(c in d) {
		console.log("Check",c,d[c].length);
		d[c].forEach(e => {e.c=c,idxItem(e)});
	}
}

const TBD=["Item ID","Sub-Category","Name"];
async function tableView(c) {
	cont.style.overflowX='scroll', cont.style.paddingBottom=10,
	Itm=0, search.style.display=null, cont.textContent='',
	document.title=hdr.textContent="NovaLabs Inventory";
	setEdit(0,1,1); nBack.hidden=0;

	let d=await dbReq('l',c),tb,r,n;
	d[1].forEach(e => {
		if(!tb) tb=[TBD.concat(d[0])];
		tb.push(r=[e.id,tCase(e.s),e.n]);
		for(n=0;'c'+n in e;n++) r.push(e['c'+n]);
		for(n=0;'s'+n in e;n++) r.push(e['s'+n]);
	});
	drawTbl(tb);
}

async function itemView(id) {
	Itm=await dbReq('i',id);

	//Clear Page & Setup:
	cont.style='', cont.textContent=Itm?'':"Item Not Found!", search.style.display='none',
	document.title=hdr.textContent=Itm?(Itm.e.n||"Item #"+id):"Unknown Item";
	setEdit(0,!Itm,!Itm); nBack.hidden=0; if(!Itm) return;

	let s=['']; Itm.sc.forEach(e => s.push((e==Itm.e.s?'|':'')+tCase(e)));
	Cat=Itm.cat, Itm.id=id, Itm.sc=s; console.log(Itm); itemViewDraw();
}

async function catView(cn,s) {
	let sc,c=await dbReq(s?'s':'c',cn), t=tCase(cn);
	if(s) {
		let n=cn.indexOf('-'); if(n==-1) throw "Invalid Sub-Category!";
		sc=cn.substr(0,n), t=t.substr(n+1);
	}

	//Clear Page & Setup:
	cont.textContent=c?'':"No Such Category!", search.style.display='none',
	cont.style='', document.title=hdr.textContent=(s?"Sub: ":"Cat: ")+t;
	setEdit(0,!c,1); nBack.hidden=0; if(!c) return;

	Itm={c:c[0],t:t,s:c[1],sc:sc};
	catViewDraw();
}

/*function drawLoginView() {
	//Clear Page & Setup:
	hNavBack.hidden = hEdit.hidden = hAdd.hidden = true;
	content.textContent = ''; search.style.display = 'none';
	document.title = header.textContent = "User Login";
	
	//Draw Login Prompt:
	drawSection("login",true); const u = drawField("username",'text',null,null,true).f,
	p = drawField("password",'password',null,null,true).f; u.disabled = p.disabled = false;
	utils.mkEl('button',content,null,null,"Login").onclick = function() {
		if(u.value && p.value) {
			utils.setCookie('lsLogin',u.value+','+p.value,Date.now()+30000);//,true
			window.location = '';
		}
	}
}*/

//============================================== View Render ==============================================

function idxItem(e) {
	let i=utils.mkDiv(cont,'li'); i.onclick=utils.go.wrap('?'+e.id);
	utils.mkDiv(i,'pre',{background:"url(r/unknown.svg) center / cover"});
	utils.mkDiv(i,'desc',null,'<h2>'+(e.n||"Item #"+e.id)+"</h2><br><p>"+
		tCase(e.c+(e.s?" | "+e.s:''))+(e.d==null?'':'\n'+e.d)+"</p>");
}

/*function dbSearch() {
	//TODO: Sanitize searchbar input on cli & server end
	//let d=(await dbReq("select * from pg_catalog.pg_tables where schemaname='itm' like "+this.value)).rows;
	/*for(let i=0,l=Cat.length,t,r,n,m; i<l; i++) {
		t=Cat[i], r=(await dbReq("select * from itm."+t)).rows
		console.log("Check",t,r.length);
		n=0, m=r.length; Cat[i]=t; console.log("Check",t,r.length);
			for(; n<m; n++) cont.innerHTML += r[n]+"<br>"; //drawItem(r[n]);
	}*
}*/

/*let Test=[
	{t:'sc', n:'more'},
	{t:'date', n:'Date Added'},
	{t:'cost', n:'Item Price', v:15},
	{t:'num', n:'Item Count', v:5},
	{t:'num', n:'Decimal Test', v:[5,0,12,4]},
	{t:'text', n:'Color', v:'Dark Blue'},
	{t:'email', n:'Contact', v:'liamg@gmail.com'},
	{t:'sc', n:'More Testing'},
	{t:'tel', n:'tel', v:'703-111-1221'},
	{t:'fl', n:'r/test.png', v:'Test Link'},
	{t:'fl', n:'r/test.png'},
	{t:'range', n:'slider', v:75},
	{t:'fi', n:'r/test.png', v:'Test Image'},
	{t:'selm', n:'Multi-Select', v:["Option A","Option B","Option C","Option D"]},
	{t:'sel', n:'Dropdown', v:["Option A","Option B"]}
];*/

function itemViewDraw() {
	Itm.cf=[], Itm.sf=[], Itm.uf=[];
	utils.mkDiv(cont,null,{lineBreak:'anywhere'},JSON.stringify(Itm.e)).noGrab=1;
	let sv=utils.mkEl('p',cont); sv.noGrab=1,aBtn(sv,"Save",dbSave,'field');
	drawSection("Item ID #"+Itm.id,1);
	//TODO: Change Category
	let cs=[]; Cat.forEach((e,i) => cs[i]=(e==Itm.c?'|':'')+tCase(e));
	drawField("category",'sel',cs,1).f.disabled=1;

	Itm.SF=drawField("sub-category",'sel',Itm.sc,1);
	Itm.NF=drawField("name",'text',Itm.e.n,1);

	drawSection(Itm.c,1), Itm.cl.forEach(e => {
		if(e.i==-1) return; Itm.cf.push(drawItem({t:e.t,n:e.n,
			v:Itm.e['c'+e.i],p:e.v},'tcat',1));
	});
	if(Itm.e.s) drawSection(Itm.e.s,1), Itm.sl.forEach(e =>
		Itm.sf.push(drawItem({t:e.t,n:e.n,v:Itm.e['s'+e.i],p:e.v},'tsub',1)));

	Itm.FO=drawSection("other",1).index;
	if(Itm.e.u) Itm.e.u.forEach((n,i) => drawItem({n:n,t:Itm.e.t[i],v:Itm.e.v[i]},'user'));
	fAlign();
}

function catViewDraw() {
	utils.mkDiv(cont,null,{lineBreak:'anywhere'},JSON.stringify(Itm.c)).noGrab=1;
	let sv=utils.mkEl('p',cont); sv.noGrab=1,aBtn(sv,"Save",dbSave,'field');

	drawSection("Editing "+(Itm.sc?"Sub-":'')+"Category: "+Itm.t,1);
	if(Itm.sc) drawField("category",'text',tCase(Itm.sc),1).f.disabled=1;
	Itm.NF=drawField("name",'text',Itm.t,1); Itm.NF.f.disabled=1; //TODO: Change Name

	cvEdit(Itm.c.length-1); if(Itm.s) {
		Itm.s.forEach((e,i) => Itm.s[i]=tCase(e)); let f=drawField("sub-categories",'sel',Itm.s,1);
		aBtn(f,"Edit",() => {let v=f.f.value; if(v) utils.go('?s:'+tDbStr(Itm.t+'-'+v))},'field');
		aBtn(f,"New",addMenu.wrap(1),'field');
	}

	Itm.FO=drawSection("Fields",1).index;
	Itm.c.forEach(e => {if(e.i!=-1) drawItem(e)});
	fAlign();
}

function cvEdit(l) {
	if(!Itm.s) return;
	let d=Itm.c[0].t,v; if(l==null) v=1,l=cont.childElementCount-Itm.FO-1;
	d=drawField("default field",'num',[d==null?0:d+1,0,l],1);
	utils.mkEl('span',d,null,{fontSize:'12pt'}," (Shown in index view; 0 = Disabled)");
	if(v) Itm.DF.replaceWith(d); Itm.DF=d;
}

function itmEdit() { fAlign(); if(!Itm.id) cvEdit(); }

//============================================== Menu Render ==============================================

function addMenu(e) {
	if(Menu) Menu.rem(); let m=utils.mkDiv(null,'menu');
	m.s1=utils.mkEl('span',m), m.s2=utils.mkEl('span',m), m.s3=utils.mkEl('span',m),
	Menu=m, m.noGrab=1, m.rem=()=>{m.remove(),Menu=null}
	if(e === 1) {
		e=0; m.s1.remove(); utils.addText(m.s2,"Name:");
		let n=utils.mkEl('input',m.s2,'field'); n.type='text';
		aBtn(m.s3,"Cancel",m.rem); aBtn(m.s3,"Create Sub-Cat", () => {
			let v=tDbStr(n.value); if(v) m.rem(),newSub(v);
		});
	} else if(e) {
		m.s1.style.display=m.s2.style.display='none'; let f=e.f, opt=f.options;
		aBtn(m.s3,"Done",m.rem);
		aBtn(m.s3,"Remove Selected Option(s)",() => {
			let rem=[]; for(let i=0,l=opt.length; i<l; i++) if(opt[i].selected) rem.push(opt[i]);
			for(let i=0,l=rem.length; i<l; i++) rem[i].remove(); f.oninput();
		});
		aBtn(m.s3,"Add Option",() => {
			m.s2.style.display=null; m.s3.textContent='';
			utils.addText(m.s2,"Name:"); let n=utils.mkEl('input',m.s2,'field');
			utils.addText(m.s2,"Index:"); let i=utils.mkEl('input',m.s2,'field');
			utils.numField(i,0,opt.length); i.set(opt.length);
			aBtn(m.s3,"Done",() => {
				n=n.value.trim(); if(n) {
					let o=utils.mkEl('option',null,null,null,n); o.value=n;
					opt.add(o,opt[i.num]); o.selected=1;
				}
				f.oninput(); addMenu(e);
			});
		});
		cont.insertChildAt(m,e.index+1); scrollTo(0,m.boundingRect.bottom);
	} else if(!Itm) {
		utils.addText(m.s2,"Category: "); let c=utils.mkEl('select',m.s2,'field');
		Cat.forEach(e => utils.mkEl('option',c,null,null,tCase(e)).value=e);
		//utils.mkEl('option',c,null,null,"New").value='';
		m.s1.remove(); aBtn(m.s3,"Cancel",m.rem);
		aBtn(m.s3,"View",() => {if(c.value) m.rem(),utils.go('?t:'+c.value)});
		aBtn(m.s3,"Edit",() => {if(c.value) m.rem(),utils.go('?c:'+c.value)});
		aBtn(m.s3,"New Item",() => {if(c.value) m.rem(),newItem(c.value)});
		//aBtn(m.s3,"Manage",m.rem);
	} else if(!Edit) {
		m.s1.remove(); genCode(m.s2); aBtn(m.s3,"Done",m.rem); aBtn(m.s3,"Print",prCode);
		aBtn(m.s3,"Download",() => {utils.dlData(Itm.id+'.png',m.qr.toDataURL())});
	} else {
		aBtn(m.s1,"Text Field",aClick); aBtn(m.s1,"Number Field",aClick); aBtn(m.s1,"Date Field",aClick);
		aBtn(m.s2,"Dropdown Menu",aClick); aBtn(m.s2,"Email/Phone Number",aClick); aBtn(m.s2,"Slider",aClick);
		aBtn(m.s3,"Checkbox",aClick); aBtn(m.s3,"Image/File Link",aClick); aBtn(m.s3,"Section",aClick);
	}
	if(!e) cont.appendChild(m),scrollTo(0,9999);
}

function aBtn(p,n,f,c) {utils.mkEl('button',p,c,null,n).onclick=f}
function aSet(t,n,v) {
	Menu.rem(); t=drawItem({t:t,n:n,v:v}); setAS(t,1);
	t=t.style,t.animation='fadein 1s'; setTimeout(()=>t.animation=null,2000);
	itmEdit();
}
function aClick() {
	let m=Menu, t=this.textContent; switch(t) {
	case "Text Field": aSet('text',t);
	break; case "Number Field":
		m.s1.textContent=m.s2.textContent=m.s3.textContent='';
		utils.addText(m.s2,"Min:"); let min=utils.mkEl('input',m.s2,'field');
		utils.addText(m.s2,"Max:"); let max=utils.mkEl('input',m.s2,'field');
		utils.numField(min,null,null,2); utils.numField(max,null,null,2);
		min.onblur=max.onblur=function() {if(min.num>max.num) this.focus()}
		utils.addText(m.s2,"Percision:"); let dp=utils.mkEl('input',m.s2,'field');
		utils.numField(dp,0,10);
		aBtn(m.s3,"Done",() => {
			let m=min.num, x=max.num, n=m==x;
			if(m<=x) aSet('num',t,[0,n?null:m,n?null:x,dp.num]);
		});
	break; case "Date Field":
		m.s1.textContent='', m.s2.remove(), m.s3.remove();
		aBtn(m.s1,"Date",() => aSet('date',t));
		aBtn(m.s1,"Date & Time",() => aSet('dt',t));
	break; case "Dropdown Menu":
		m.s1.textContent='', m.s2.remove(), m.s3.remove();
		aBtn(m.s1,"Dropdown",() => aSet('sel',"Dropdown"));
		aBtn(m.s1,"Multi-Select",() => aSet('selm',"Multi-Select"));
	break; case "Email/Phone Number":
		m.s1.textContent='', m.s2.remove(), m.s3.remove();
		aBtn(m.s1,"Email",() => aSet('email',"Email"));
		aBtn(m.s1,"Phone Number",() => aSet('tel',"Phone"));
	break; case "Slider": aSet('range',t);
	break; case "Checkbox": aSet('cb',t);
	break; case "Image/File Link":
		m.s1.remove(); m.s2.textContent=m.s3.textContent='';
		utils.addText(m.s2,"Link:"); let lk=utils.mkEl('input',m.s2,'field link'),
		lc=utils.mkEl('input',m.s2,'field',{margin:'4 6 4 0'}),
		fc=utils.mkDiv(m.s2,null,{width:0,height:0,overflow:'hidden'}),
		fr=utils.mkEl('iframe',fc); lc.type='checkbox';
		lk.onblur = () => { if(lk.value != fr.src) {
			if(!fr.src) fc.style.width='100%', fc.style.height=200;
			if(!fr.parentElement) fc.textContent='', fc.appendChild(fr);
			fr.src=lk.value, fc.ds=null;
		}}
		aBtn(m.s3,"Cancel",m.rem);
		aBtn(m.s3,"Add File",() => {if(fc.ds||lk.value) aSet(lc.checked?'fi':'fl',fc.ds||lk.value)});
		aBtn(m.s3,"File Uploader",() => {
			uploadFile((d,f) => {
				fc.style.width='100%', fc.style.height=200; fr.remove();
				fc.ds="data:"+f.type+";base64,"+btoa(d);
				if(d) fc.innerHTML="<img style='height:100%;width:auto' src='"+fc.ds+"'>";
			});
		});
	break; case "Section": aSet('sc',t);
	}
}

//============================================== Item Render ==============================================

function fAlign() {
	alItm(Array.prototype.slice.call(cont.children,Itm.FO+1));
	if(Itm.cf) alItm(Itm.cf); if(Itm.sf) alItm(Itm.sf);
}
function alItm(f) {
	let m=0,w=utils.w,a;
	if(f[0]) f.forEach(e => {e=e.f&&e.firstChild.boundingRect.right;if(e>m) m=e});
	m+=5, a=w<m+w*.65-12+20; f.forEach(e => {
		if(!e.f) return;
		e.firstChild.style.marginRight=Math.max(m-e.firstChild.boundingRect.right,0);
		if(a) e.f.style.width='100%',e.f.style.maxWidth='none';
		else e.f.style.width=e.f.style.maxWidth=null;
	});
}

function drawItem(f,n,l) {
	if(typeof f.t=='number') f.t=Types[f.t];
	let p; if(f.t=='sc') p=drawSection(f.n,l);
	else if(f.t=='fl' || f.t=='fi') p=drawLink(f.n,f.v,f.t=='fi',l);
	else if(f.t) p=drawField(f.n,f.t,f.v,l);
	else throw "No such type @ "+n+" index "+f.i;
	if(p.f&&f.p) p.f.placeholder=f.p;
	p.d=f; return p;
}

function drawSection(txt, lock) {
	let s=utils.mkEl('h4',cont); utils.mkEl('span',s,null,null,tCase(txt));
	if(lock) s.noGrab=1; else addSubBtn('drag',s),addSubBtn('sub',s);
	s.name=txt, s.lock=lock; return s;
}

function drawTbl(d) {
	let f=utils.mkEl('tbody',utils.mkEl('table',cont));
	for(let i=0,l=d.length,r,e,b,c; i<l; i++) {
		r=d[i], e=utils.mkEl('tr',f);
		for(b=0,c=r.length; b<c; b++) utils.mkEl(i?'td':'th',e,null,null,r[b]);
	}
	return f;
}

function drawField(txt, type, val, lock) {
	let f,p=utils.mkEl('p',cont), sl=type.startsWith('sel');
	utils.mkEl('span',p,null,{marginRight:5.5},tCase(txt)+':');
	if(sl) {
		f=utils.mkEl('select',p,'field'); if(type=='selm') f.multiple=1;
		if(typeof val=='string') val=val.split(',');
		if(val) for(let i=0,l=val.length,v,s,o; i<l; i++) {
			v=val[i], s=v.startsWith('|'); if(s) v=v.substr(1);
			o=utils.mkEl('option',f,null,null,v); o.value=v; if(s) o.selected=1;
		}
	} else {
		f=utils.mkEl('input',p,'field'); f.type=type; if(val) f.value=val;
		switch(type) {
			case 'dt': f.type='datetime-local'; if(val) f.value=val;
			break; case 'num':
				if(typeof val=='string') {
					val=val.split(',');
					for(let i=0,l=val.length; i<l; i++) val[i]=val[i]==null?null:Number(val[i]);
				} else if(!Array.isArray(val)) val=[val];
				utils.numField(f,val[1],val[2],val[3]); f.set(val[0]);
			break; case 'cost': utils.costField(f);
			break; case 'range': p.ta=utils.mkEl('span',p);
			break; case 'cb': f.type='checkbox', f.checked=Number(val);
		}
	}
	if(f.num != null) {
		let m=''; if(val[3]) m=','+val[1]+','+val[2]+','+val[3];
		else if(val[2] != null) m=','+val[1]+','+val[2]; else if(val[1]) m=','+val[1];
		(f.onnuminput=() => p.val=f.num+m)();
	} else (f.oninput=() => {
		if(sl) {
			let v=[],o=f.options,i=0,l=o.length;
			for(; i<l; i++) v[i]=(o[i].selected?'|':'')+o[i].text; p.val=v.join();
		} else if(type=='cb') p.val=f.checked?1:0;
		else {p.val=f.value; if(type=='range') p.ta.textContent=' '+f.value+'%'}
	})();
	if(!Usr) f.disabled=1; if(lock) p.noGrab=1;
	else { addSubBtn('drag',p),addSubBtn('sub',p); if(sl) addSubBtn('add',p); }
	p.name=txt, p.lock=lock, p.f=f; return p;
}

function drawLink(url, txt, img, lock) {
	let p=utils.mkEl('p',cont);
	if(img) {
		let i=utils.mkEl('img',p,'fImg',null,txt);
		i.title=txt||'', i.src=url, i.onclick=()=>{if(!Edit) location=url};
	} else utils.mkEl('a',p,null,null,txt||url).href=url;
	if(lock) p.noGrab=1; else addSubBtn('drag',p),addSubBtn('sub',p);
	p.name=url, p.val=txt, p.lock=lock; return p;
}

//============================================== Item Edit ==============================================

function addSubBtn(type, par) {
	let b=utils.mkDiv(par,'addSub',{display:'none'}), o=utils.mkEl('img',b); o.src='r/'+type+'.svg';
	function down(e) {
		if(EditDone) return false; o.src='r/'+type+'Down.svg';
		if(e) e.preventDefault(), addEventListener('mouseup',up), addEventListener('touchend',up);
	}
	function up(e) {
		o.src='r/'+type+'.svg'; if(e.type) e.preventDefault();
		removeEventListener('mouseup',up), removeEventListener('touchend',up);
		if(type=='sub' && e.target==o) par.remove(),itmEdit();
		else if(type=='add') addMenu(par); else if(type=='drag') EditDone=null;
	}
	if(type=='drag') makeGrabable(par,b,down,up), par.firstChild.addEventListener('click',editName);
	else b.onmousedown=b.ontouchstart=down;
}
function setAS(e,d) {
	for(let b=e.getElementsByClassName('addSub'),i=0,l=b.length; i<l; i++) b[i].style.display=d?null:'none';
}

function editName(e) {
	if(!Edit) return;
	let s=getComputedStyle(this), f=utils.mkEl('input',null,'rn',{color:s.color,font:s.font}),
	p=this.parentNode,v=this.textContent.trim(),vc; if(v.endsWith(':')) v=v.substr(0,v.length-1),vc=1;
	f.oninput = () => f.style.width=utils.textWidth(f.value+' ',f.style.font);
	EditDone = f.onblur = e => {
		if(e) {
			let nv=f.value.trim();
			if(this.tagName=='IMG') this.textContent=this.title=p.val=nv;
			else if(this.tagName=='A') p.val=nv, this.textContent=nv?nv:this.href;
			else if(nv) p.name=tCase(nv), this.textContent=p.name+(vc?':':'');
		}
		EditDone=f.onblur=null; f.replaceWith(this); itmEdit();
	}
	f.type='text',f.value=v; e.preventDefault();
	this.replaceWith(f); f.oninput(); f.focus();
}

function tDbStr(s,c) {s=s.trim().toLowerCase();return c?s.replace(/\s+/g,'_'):s}
function tCase(s) {
	s=s.trim(); if(!s) return '';
	s=s.replace(/_/g,' ').split(/(?=[^a-zA-Z](?=[a-zA-Z]))/g);
	for(let i=0,l=s.length,w; i<l; i++) {
		w=s[i]; if(i==0) s[i]=w[0].toUpperCase()+w.substr(1);
		else if(s[i].length > 1) s[i]=w[0]+w[1].toUpperCase()+w.substr(2);
	}
	return s.join('');
}

//============================================== Grabable ==============================================

function makeGrabable(el,btn,down,up) {
	let cb=e => {if(down()===false) return;let g=new Grabber(el,e);g.ondrop=up,EditDone=g.cancel}
	btn.addEventListener('mousedown',cb), btn.addEventListener('touchstart',cb);
}

function Grabber(el,e,hb) {
	const par=el.parentElement, rect=el.boundingRect, rects=[],
	sr=utils.mkDiv(document.body,'grabScroll',{top:document.body.scrollHeight}),
	initSX=scrollX, initSY=scrollY, sInd=el.index, self=this;
	let mX,mY,oX,oY,tNum,select=null;
	//Get Initial Cursor/Touch Pos:
	if(e != null && (e.type == 'touchstart' || e.type == 'mousedown')) {
		let t=e; if(e.type == 'touchstart') t=e.changedTouches[0], tNum=t.identifier;
		oX=t.clientX-rect.left, oY=t.clientY-rect.top;
	}
	//Create Dropzone Region:
	const drop=utils.mkDiv(par,'grabInsert',{width:rect.width,height:rect.height}); drop.noGrab=1;
	//Create Element Container:
	const cont=utils.mkDiv(null,'grabMoving',{width:rect.width,height:rect.height}), cs=cont.style;
	cont.noGrab=1; el.remove(); cont.appendChild(el);
	//Cache Elemnet Sizes/Positions:
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
		let t=getTouch(e); if(!t) return; mX=t.clientX, mY=t.clientY;
		if(oX == null) oX=mX-rect.left, oY=mY-rect.top;
		cs.left=mX-oX+scrollX, cs.top=mY-oY+scrollY;
		findDropRegion(mX+scrollX-initSX, mY+scrollY-initSY);
		e.preventDefault();
	}
	function onDrop(e) {
		if(e && !getTouch(e)) return;
		if(!select) return onCancel(); else onCancel(true); let d=(select===drop);
		if(self.ondrop && self.ondrop.call(self,d?par.childElementCount+1:select.index) === false)
			par.insertChildAt(el, sInd);
		else if(d) par.appendChild(el); else par.insertBefore(el, select);
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
				else try { par.insertBefore(drop, r.e); } catch(err) {return select=null}
				return select=r.e;
			}
		}
		select=null;
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
	let p=utils.mkDiv(document.body,'upPop'), c=utils.mkDiv(p,'upClose',null,"Close"),
	up=new Uploader(['.png','.jpg','.jpeg','.svg'], utils.mkDiv(p,'upBox'));
	c.onclick=() => {p.style.opacity=0,setTimeout(()=>{p.remove()},1200)}
	setTimeout(()=>{p.style.opacity=1},1); up.onFileLoad=(d,f)=>{cb(d,f),c.onclick()}
}

//Settings:
const LabelText="<strong>Choose a file</strong> or drag it here.",
UploadText="<i>Reading File...</i>", DoneText="File Loaded Successfully!",
ErrorTextL="<i>Error:</i> ", ErrorTextR="!<br><strong>Try Again?</strong>";

/*Callbacks:
onFileLoad - Called once per file. An error can be returned as a string
onLoadDone - Called once all files in a drop are processed. An error can be returned as a string*/

//HTML5 Upload API v1.2 by Pecacheu
function Uploader(extList, par, maxFiles, doneMsg) {
	const self=this; if(!(maxFiles>0)) maxFiles=1;
	if(typeof extList=='string') extList=[extList];
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
	function dropRst() {document.body.style.cursor=null, ip.value=null, fb.ondrop=ip.onchange=drop}
	function drop(e) {
		fb.ondrop=ip.onchange=null; dragOut(e); txt(UploadText); document.body.style.cursor='wait';
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
			if(extList && extList.indexOf(n.substr(n.lastIndexOf('.')).toLowerCase()) == -1)
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

function genCode(e) {
	let qr=new QRCodeStyling({width:2048,height:2048,margin:50,data:location.origin+'?'+Itm.id,
	image:"r/logo.png",imageOptions:{imageSize:0.5},dotsOptions:{type:'dots',color:'#f56d3c'},
	cornersSquareOptions:{type:'extra-rounded',color:'#5a5a5e'},cornersDotOptions:{type:'dot',color:'#5a5a5e'}});
	qr.append(e); qr=(Menu.qr=e.lastChild).style; qr.width='65%',qr.maxWidth=500;
}
function prCode() {
	let u=Menu.qr.toDataURL();
	printJS({printable:u,type:'image',imageStyle:'width:2in;border:1px solid #000'});
	URL.revokeObjectURL(u);
}