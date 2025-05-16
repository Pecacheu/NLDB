//Node.js Webserver Engine v3.3, Pecacheu 2025. GNU GPL v3

import path from 'path';
import fs from 'fs/promises';
const root = import.meta.dirname;
let debug, chalk;

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
}, vidTypes = ['.mp4', '.ogg', '.webm'],
ex = {types:types, root:root};

ex.handle = async (dirPath, res, req, virtualDir) => {
	try {
		let fn = await resolve(dirPath, new URL(req.url,'http://a').pathname, virtualDir),
		data = await fs.readFile(fn);
		//Send Data
		let hdr={}, stat=200, cType=types[path.extname(fn)];
		if(cType) hdr["Content-Type"] = cType;
		//Videos
		if(vidTypes.indexOf(path.extname(fn)) != -1) {
			if(req.headers["range"]) {
				hdr["Accept-Ranges"] = "bytes";
				let range=req.headers["range"].replace('=',' '), dl=data.length;
				hdr["Content-Range"] = range+(dl-1)+"/*";
				hdr["Content-Length"]=dl; stat=206;
			}
		}
		res.writeHead(stat,hdr); res.write(data); res.end();
		if(debug) log(fn.slice(root.length), cType);
	} catch(e) {
		let nf=e.code=='ENOENT';
		sendCode(res, nf?404:500, nf?"Resource Not Found":e);
		if(debug) console.log(chalk.red(nf?"-- Not found":"-- Read error: "+e));
	}
}

function log(name, hasType) {
	console.log(chalk.dim(`-- Served '${name}'`+
		(hasType?` with type '${path.extname(name).slice(1)}'`:'')));
}

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
	} else if(typeof(vDir) == 'string') {
		const f=parseUriSub(uri, vDir); if(f) return f;
	}
	return root+uri;
}

function parseUriSub(uri, dir) {
	while(dir.slice(-1) == '/') dir = dir.slice(0,-1);
	let name; const ni = dir.lastIndexOf('/');
	if(ni == -1) name = '/'+dir; else { name = dir.slice(ni); if(name.length <= 1) return null; }
	if(uri.startsWith(name)) {
		if(uri.length > name.length && uri.charAt(name.length) != '/') return null;
		return dir+uri.slice(name.length);
	}
	return null;
}

function sendCode(res, code, msg) {
	res.writeHead(code), res.write(`<pre style='font-size:16pt'>${msg}</pre>`), res.end();
}

Object.defineProperty(ex, 'debug', {set:d => {if(debug=d) import('chalk').then(c => chalk=c.default)}});
export default ex;