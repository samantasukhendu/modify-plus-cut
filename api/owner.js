import crypto from 'node:crypto';
import {db,json,method,deviceId,FieldValue} from '../lib/server.js';
const secureEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
export default async function handler(req,res){
 if(!method(req,res,['POST']))return;
 const id=deviceId(req);if(!id)return json(res,400,{error:'A valid device ID is required.'});
 const secret=process.env.OWNER_ACCESS_PASSWORD||process.env.ADMIN_PASSWORD;
 if(!secret)return json(res,503,{error:'Set OWNER_ACCESS_PASSWORD in Vercel Environment Variables.'});
 if(!secureEqual(req.body?.password,secret))return json(res,401,{error:'Incorrect owner password.'});
 const d=db(),ref=d.collection('users').doc(id),snap=await ref.get();
 const base=snap.exists?snap.data():{deviceId:id,modifyFree:20000,cutFree:20000,modifyPremium:0,cutPremium:0,everPremium:false,subscriptionExpiresAt:null,createdAt:FieldValue.serverTimestamp()};
 await ref.set({...base,ownerAccess:true,ownerAccessGrantedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
 return json(res,200,{ok:true,ownerAccess:true,message:'Owner lifetime access enabled for this device record.'});
}
