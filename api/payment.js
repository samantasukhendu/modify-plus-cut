import crypto from 'node:crypto';
import {db,json,method,deviceId,PLANS,FieldValue,sendOwnerSms} from '../lib/server.js';
export default async function handler(req,res){
 if(!method(req,res,['GET','POST'])) return;
 const id=deviceId(req); if(!id) return json(res,400,{error:'A valid device ID is required.'});
 const d=db();
 if(req.method==='GET'){const snap=await d.collection('payments').where('deviceId','==',id).orderBy('createdAt','desc').limit(20).get(); return json(res,200,{payments:snap.docs.map(x=>({id:x.id,...x.data()}))});}
 const {country,planId,method:payMethod,transactionId}=req.body||{};
 const plans=PLANS[country]; const plan=plans?.find(p=>p.id===planId);
 if(!plan) return json(res,400,{error:'Select a valid package and country.'});
 if(!plan.methods.includes(payMethod)) return json(res,400,{error:'Select a supported payment method for this country.'});
 const trx=String(transactionId||'').trim().replace(/\s+/g,''); if(!/^[A-Za-z0-9-]{8,40}$/.test(trx)) return json(res,400,{error:country==='BD'?'সঠিক Transaction ID লিখুন (৮–৪০টি ইংরেজি অক্ষর বা সংখ্যা)।':'সঠিক UTR নম্বর লিখুন (৮–৪০টি ইংরেজি অক্ষর বা সংখ্যা)।'});
 const trxHash=crypto.createHash('sha256').update(trx.toUpperCase()).digest('hex');
 const paymentRef=d.collection('payments').doc(); const usedRef=d.collection('transactionIds').doc(trxHash);
 try {
  await d.runTransaction(async tx=>{
   const used=await tx.get(usedRef); if(used.exists) throw new Error('DUPLICATE');
   tx.create(usedRef,{paymentId:paymentRef.id,deviceId:id,transactionId:trx,status:'pending',createdAt:FieldValue.serverTimestamp()});
   tx.create(paymentRef,{deviceId:id,country,planId,plan,method:payMethod,transactionId:trx,transactionHash:trxHash,status:'pending',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  });
 }catch(e){if(e.message==='DUPLICATE')return json(res,409,{error:country==='BD'?'এই Transaction ID আগেই ব্যবহার হয়েছে।':'এই UTR আগেই ব্যবহার হয়েছে।'}); return json(res,500,{error:'Could not submit payment request.'});}
 let sms={sent:false}; try { sms=await sendOwnerSms(`Modify Plus Cut payment request\nCountry: ${country}\nPlan: ${planId}\nAmount: ${plan.currency} ${plan.amount}\nMethod: ${payMethod}\nTransaction ID: ${trx}\nRequest: ${paymentRef.id}`); } catch {}
 return json(res,201,{ok:true,paymentId:paymentRef.id,status:'pending',message:'Payment request submitted. Premium activates only after admin verifies the payment.',smsSent:!!sms.sent});
}
