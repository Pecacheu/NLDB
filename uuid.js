//Snap UUID Generator v1.2 ©2021 Pecacheu. GNU GPL v3.0
'use strict';
const ID_DEL=500;
import fs from 'fs'; import os from 'os'; import crypto from 'crypto';
let Exp={},IDCount,UT; try { IDCount=Number(fs.readFileSync('uuid')); } catch(e) {}
if(!(IDCount>=0 && IDCount<=255)) console.error("IDCount Error, resetting."),IDCount=0;
export default Exp;

//64-bit UUID
//<U8 CryptoRand XOR CPUUptime><U16 CryptoRand><U8 Counter><U32 UTC Sec>
Exp.genUUID = async () => {
	return new Promise((r,j) => {
		crypto.randomBytes(3, (e,b) => {
			if(e) return j(e); let u=Buffer.allocUnsafe(8);
			u.writeUInt8(b.readUInt8() ^ (os.uptime()&0xFF));
			u.writeUInt16LE(b.readUInt16LE(1),1); u.writeUInt8(IDCount,3);
			u.writeUInt32LE(Date.now()/10000,4); if(++IDCount == 256) IDCount=0;
			if(UT) clearTimeout(UT);
			UT=setTimeout(() => {UT=0;fs.writeFileSync('uuid',IDCount.toString())},ID_DEL);
			r(u.toString('base64').substr(0,11));
		});
	});
}

//Get date UUID was created
Exp.getUUIDDate = u => {
	let d=Buffer.from(u,'base64').readUInt32LE(4)*10000;
	return d<1621543800000?0:d;
}

//Convert UUID to hex for burning
Exp.UUIDToHex = u => {
	let s=Buffer.from(u,'base64').toString('hex');
	return s.match(/.{2}/g).reverse().join('');
}