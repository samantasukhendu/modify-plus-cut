
import crypto from 'node:crypto';
import {db,json,method,verifySession,sign,PLANS,FieldValue,adminPasswordRecord,hashPassword,passwordMatches} from '../lib/server.js';

const secureEqual=(a,b)=>{
 const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
 return x.length===y.length&&crypto.timingSafeEqual(x,y);
};

export default async function handler(req,res){
 if(req.method==='POST' && req.body?.action==='login'){
  if(!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return json(res,503,{error:'Set ADMIN_PASSWORD and SESSION_SECRET in Vercel Environment Variables.'});
  const d = db();
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const attemptId = crypto.createHash('sha256').update(ip).digest('hex');
  const attemptRef = d.collection('adminLoginAttempts').doc(attemptId);
  const now = Date.now(), windowMs = 15 * 60 * 1000, maxAttempts = 5;
  let blocked = false;
  await d.runTransaction(async tx => {
   const snap = await tx.get(attemptRef), data = snap.exists ? snap.data() : {};
   const start = Number(data.windowStart || 0), count = start && now - start < windowMs ? Number(data.count || 0) : 0;
   if (count >= maxAttempts) { blocked = true; return; }
   tx.set(attemptRef, {windowStart: count ? start : now, count: count + 1, updatedAt: new Date(now).toISOString()});
  });
  if (blocked) return json(res,429,{error:'অনেকবার ভুল পাসওয়ার্ড দেওয়া হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।'});
  const auth = await adminPasswordRecord();
  const valid = auth.passwordHash ? passwordMatches(req.body.password, auth.passwordHash) : secureEqual(req.body.password,process.env.ADMIN_PASSWORD);
  if(!valid) return json(res,401,{error:'Incorrect admin password.'});
  await attemptRef.delete();
  const token=sign({admin:true,version:Number(auth.version||0),exp:Date.now()+8*60*60*1000});
  res.setHeader('Set-Cookie',`mpc_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
  return json(res,200,{ok:true});
 }

 if(req.method==='POST' && req.body?.action==='logout'){
  res.setHeader('Set-Cookie','mpc_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  return json(res,200,{ok:true});
 }

 if(req.method==='GET' && req.query?.action==='session') return json(res,200,{authenticated:await verifySession(req)});
 if(!await verifySession(req)) return json(res,401,{error:'Admin login required.'});
 if(!['GET','PATCH','DELETE'].includes(req.method)) return method(req,res,['GET','PATCH','DELETE']);

 const d=db();

 if(req.method==='GET'){
  const [payments,users,reviews,chats,legacyUsedUtrs]=await Promise.all([
   d.collection('payments').orderBy('createdAt','desc').limit(200).get(),
   d.collection('users').orderBy('createdAt','desc').limit(200).get(),
   d.collection('reviews').orderBy('createdAt','desc').limit(200).get(),
   d.collection('chatMessages').orderBy('createdAt','desc').limit(200).get(),
   d.collection('used_utrs').limit(200).get()
  ]);
  const serial=s=>s.docs.map(x=>({
   id:x.id,...x.data(),
   createdAt:x.data().createdAt?.toDate?.()?.toISOString?.()||x.data().createdAt||null,
   updatedAt:x.data().updatedAt?.toDate?.()?.toISOString?.()||x.data().updatedAt||null
  }));
  return json(res,200,{
   payments:serial(payments),
   users:serial(users),
   reviews:serial(reviews),
   messages:serial(chats),
   legacyUsedUtrs:serial(legacyUsedUtrs)
  });
 }

 if(req.method==='PATCH'){
  const {type,id,action,reply}=req.body||{};

  if(action==='change-password'){
   const oldPassword=String(req.body?.oldPassword||''), newPassword=String(req.body?.newPassword||'');
   if(newPassword.length<12 || newPassword.length>200) return json(res,400,{error:'নতুন পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে।'});
   const auth=await adminPasswordRecord();
   const oldValid=auth.passwordHash ? passwordMatches(oldPassword,auth.passwordHash) : secureEqual(oldPassword,process.env.ADMIN_PASSWORD);
   if(!oldValid) return json(res,401,{error:'বর্তমান পাসওয়ার্ড সঠিক নয়।'});
   const hashed=hashPassword(newPassword);
   await d.collection('systemSettings').doc('adminAuth').set({
    passwordHash:hashed,
    version:Number(auth.version||0)+1,
    updatedAt:FieldValue.serverTimestamp()
   });
   res.setHeader('Set-Cookie','mpc_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
   return json(res,200,{ok:true,message:'পাসওয়ার্ড পরিবর্তন হয়েছে। নিরাপত্তার জন্য আবার নতুন পাসওয়ার্ড দিয়ে লগইন করুন।'});
  }

  if(!id && !(type==='payment')) return json(res,400,{error:'Missing item ID.'});

  if(type==='payment'){
   const ref=d.collection('payments').doc(id);
   const snap=await ref.get();
   if(!snap.exists)return json(res,404,{error:'Payment not found.'});
   const p=snap.data();

   if(!['approve','reject'].includes(action))return json(res,400,{error:'Action must be approve or reject.'});
   if(p.status!=='pending')return json(res,409,{error:'This payment request has already been processed.'});

   if(action==='reject'){
    await ref.update({status:'rejected',updatedAt:FieldValue.serverTimestamp()});
    await d.collection('transactionIds').doc(p.transactionHash).set({
     status:'rejected',
     paymentId:id,
     deviceId:p.deviceId,
     transactionId:p.transactionId,
     updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    return json(res,200,{ok:true,status:'rejected'});
   }

   const plan=PLANS[p.country]?.find(x=>x.id===p.planId);
   if(!plan)return json(res,400,{error:'Package configuration mismatch.'});

   const verifiedAmount=Number(req.body?.verifiedAmount);
   if(!Number.isFinite(verifiedAmount) || verifiedAmount!==Number(plan.amount)) {
    return json(res,400,{error:`পেমেন্টের পরিমাণ প্যাকেজের নির্ধারিত দামের সঙ্গে মিলতে হবে (${plan.currency} ${plan.amount})। অনুমোদন করা হয়নি।`});
   }

   const subscriptionDays=Number(plan.days || 30);

   await d.runTransaction(async tx=>{
    const ps=await tx.get(ref);
    if(!ps.exists||ps.data().status!=='pending')throw new Error('ALREADY_PROCESSED');

    const ur=d.collection('users').doc(p.deviceId);
    const us=await tx.get(ur);
    const old=us.exists?us.data():{};

    // নতুন প্যাকেজ অনুমোদনের সময় থেকেই নতুন মেয়াদ শুরু হবে।
    const expiry=Date.now()+subscriptionDays*24*60*60*1000;

    tx.set(ur,{
     deviceId:p.deviceId,
     modifyFree:old.modifyFree??20000,
     cutFree:old.cutFree??20000,

     // পুরোনো ক্রেডিটের সঙ্গে যোগ নয়; নতুন প্যাকেজের পরিমাণ বসবে।
     modifyPremium:plan.modifyCredits,
     cutPremium:plan.cutCredits,

     everPremium:true,
     subscriptionExpiresAt:new Date(expiry).toISOString(),

     // নতুন প্যাকেজের সংস্করণ ও অনুমোদিত পেমেন্টের ID।
     creditVersion:(Number(old.creditVersion)||0)+1,
     premiumGrantId:id,

     updatedAt:FieldValue.serverTimestamp(),
     createdAt:old.createdAt||FieldValue.serverTimestamp()
    },{merge:true});

    tx.update(ref,{
     status:'approved',
     verifiedAmount,
     approvedAt:FieldValue.serverTimestamp(),
     updatedAt:FieldValue.serverTimestamp(),
     verifiedBy:'admin'
    });

    tx.set(d.collection('transactionIds').doc(p.transactionHash),{
     status:'approved',
     paymentId:id,
     deviceId:p.deviceId,
     transactionId:p.transactionId,
     updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
   });

   return json(res,200,{ok:true,status:'approved',subscriptionDays});
  }

  if(type==='chat' && action==='reply'){
   if(!String(reply||'').trim())return json(res,400,{error:'Reply text is required.'});
   await d.collection('chatMessages').add({
    deviceId:id,
    from:'admin',
    message:String(reply).slice(0,4000),
    createdAt:FieldValue.serverTimestamp()
   });
   return json(res,200,{ok:true});
  }

  if(type==='review' && action==='approve'){
   await d.collection('reviews').doc(id).update({status:'approved',updatedAt:FieldValue.serverTimestamp()});
   return json(res,200,{ok:true});
  }

  if(type==='review' && action==='reject'){
   await d.collection('reviews').doc(id).update({status:'rejected',updatedAt:FieldValue.serverTimestamp()});
   return json(res,200,{ok:true});
  }

  if(type==='user' && action==='reset-device'){
   return json(res,400,{error:'Device transfer/reset is deliberately not exposed here. Verify ownership manually before changing device binding.'});
  }

  return json(res,400,{error:'Unsupported admin action.'});
 }

 if(req.method==='DELETE'){
  const {type,id,deviceId}=req.body||{};

  if(type==='chat' && deviceId){
   const snap=await d.collection('chatMessages').where('deviceId','==',deviceId).get();
   const batch=d.batch();
   snap.docs.forEach(x=>batch.delete(x.ref));
   await batch.commit();
   return json(res,200,{ok:true,deleted:snap.size});
  }

  if(type==='review' && id){
   await d.collection('reviews').doc(id).delete();
   return json(res,200,{ok:true});
  }

  return json(res,400,{error:'Unsupported delete action.'});
 }
}
