//Node Webserver v3.4, Pecacheu 2025. GNU GPL v3

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import chalk from 'chalk';
const root = import.meta.dirname;
let debug;

const types = {
	'.html': "text/html",
	'.php':  "text/html",
	'.css':  "text/css",
	'.png':  "image/png",
	'.svg':  "image/svg+xml",
	'.js':   "application/javascript",
	'.pdf':  "application/pdf",
	'.mp4':  "video/mp4",
	'.ogg':  "video/ogg",
	'.webm': "video/webm"
}, ex = {types:types, root:root};

let MAX_ETAG=1048576, //1MB
FAST_ETAG=true;

ex.handle = async (dirPath, req, res, virtualDir) => {
	let f;
	try {
		let fn=await resolve(dirPath, new URL(req.url,'http://a').pathname, virtualDir), hdr={},
			stat=200, ext=path.extname(fn), ct=types[ext], rng=req.headers.range, str;
		if(ct) hdr["content-type"] = ct;
		f=await fs.open(fn);
		let dl=(await f.stat()).size;
		if(rng) { //Range
			if(!rng.startsWith('bytes=') || (rng=rng.slice(6).split('-'))
				.length !== 2 || !rng[0]) return await rngErr(f,dl,rng,res);
			let rs=Number(rng[0]), re=Number(rng[1]);
			if(!re) re=dl-1;
			if(rs>=dl || re>=dl || rs>=re) return await rngErr(f,dl,rng,res);
			str=f.createReadStream({start:rs, end:re});
			hdr["accept-ranges"] = 'bytes';
			hdr["content-range"] = `bytes ${rs}-${re}/${dl}`;
			stat=206;
		} else if(!FAST_ETAG && dl <= MAX_ETAG) {
			str=await f.readFile();
			let h=crypto.createHash('sha1');
			h.update(str);
			hdr.etag=h.digest('base64url');
		} else if(FAST_ETAG) hdr.etag=dl.toString();

		if(hdr.etag && hdr.etag === req.headers['if-none-match'])
			return res.writeHead(304,''),res.end(),f.close();
		if(!str) str=f.createReadStream();

		res.writeHead(stat,'',hdr);
		if(str instanceof Buffer) res.write(str),res.end(); else str.pipe(res);
		res.on('close', () => f.close());
		if(debug) log(fn.slice(root.length), ct);
	} catch(e) {
		let nf=e.code==='ENOENT';
		if(debug||!nf) nf?err("-- Not found"):err("-- Read",e);
		sendCode(res, nf?404:500, nf?"Resource Not Found":e);
		if(f) f.close();
	}
}

async function rngErr(f,fl,rng,res) {
	if(debug) err("-- Bad Range",rng);
	let h={"content-range": 'bytes */'+fl};
	res.writeHead(416,'',h); res.end();
	f.close();
}

function err(m,e) {console.error(chalk.red(m,e))}
function log(name, hasType) {console.log(chalk.dim(`-- Served '${name}'`+
	(hasType?` with type '${path.extname(name).slice(1)}'`:'')))}

async function resolve(rootDir, uri, vDir) {
	if(uri.indexOf('..') !== -1) throw "Bad path";
	let fn = path.join(root, processUri(rootDir, uri, vDir));
	try {
		let stat = await fs.stat(fn);
		if(stat.isDirectory()) return path.join(fn,'/index.html'); //Try index
		return fn;
	} catch(e) {
		if(!path.extname(fn)) return fn+'.html'; //Try with ext
		throw e;
	}
}

function processUri(root, uri, vDir) {
	if(Array.isArray(vDir)) {
		for(let i=0,l=vDir.length,f; i<l; ++i) {
			f=parseUriSub(uri, vDir[i]); if(f) return f;
		}
	} else if(typeof(vDir) === 'string') {
		const f=parseUriSub(uri, vDir); if(f) return f;
	}
	return root+uri;
}

function parseUriSub(uri, dir) {
	while(dir.slice(-1) === '/') dir = dir.slice(0,-1);
	let name, ni=dir.lastIndexOf('/');
	if(ni === -1) name = '/'+dir; else { name = dir.slice(ni); if(name.length <= 1) return null; }
	if(uri.startsWith(name)) {
		if(uri.length > name.length && uri.charAt(name.length) !== '/') return null;
		return dir+uri.slice(name.length);
	}
	return null;
}

function sendCode(res, code, msg) {
	res.writeHead(code,''), res.write(`<pre style='font-size:16pt'>${msg}</pre>`), res.end();
}

Object.defineProperty(ex, 'debug', {set:d => debug=d});
export default ex;