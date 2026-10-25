import {db,json,method,deviceId,userRecord,activePremium,wordCount} from '../lib/server.js';

export default async function handler(req,res){
 if(!method(req,res,['POST'])) return;
 const id=deviceId(req); if(!id) return json(res,400,{error:'A valid device ID is required.'});
 const feature=req.body?.feature, text=String(req.body?.text||'').trim();
 if(!['modify','cut'].includes(feature)) return json(res,400,{error:'Feature must be modify or cut.'});
 if(!text) return json(res,400,{error:'Please enter text.'});
 const words=wordCount(text); if(words>20000) return json(res,413,{error:'এক ক্লিকে সর্বোচ্চ ২০,০০০ শব্দ দেওয়া যাবে।',wordCount:words});
 if(!process.env.GEMINI_API_KEY) return json(res,503,{error:'AI চালু করতে Vercel Environment Variables-এ GEMINI_API_KEY সেট করতে হবে।'});
 const d=db(), ref=d.collection('users').doc(id); let source='free';
 try {
  await d.runTransaction(async tx=>{
   let snap=await tx.get(ref); if(!snap.exists){ tx.set(ref,{deviceId:id,modifyFree:20000,cutFree:20000,modifyPremium:0,cutPremium:0,everPremium:false,subscriptionExpiresAt:null,createdAt:new Date().toISOString()}); snap=await tx.get(ref); }
   const u=snap.data(); if(!u.everPremium && ((u.modifyFree||0)>20000 || (u.cutFree||0)>20000)){const patch={};if((u.modifyFree||0)>20000)patch.modifyFree=20000;if((u.cutFree||0)>20000)patch.cutFree=20000;tx.update(ref,patch);Object.assign(u,patch);} const prem=activePremium(u), freeKey=feature+'Free', premiumKey=feature+'Premium';
   if(u.ownerAccess===true){source='owner';}
   else if(prem && (u[premiumKey]||0)>=words){source='premium';tx.update(ref,{[premiumKey]:(u[premiumKey]||0)-words,updatedAt:new Date().toISOString()});}
   else if(prem && (u[premiumKey]||0)>0){throw new Error('PREMIUM_BALANCE_TOO_LOW');}
   else if(prem){throw new Error('PREMIUM_BALANCE_EMPTY');}
   else if(u.everPremium){throw new Error('SUBSCRIPTION_EXPIRED');}
   else if((u[freeKey]||0)>=words){source='free';tx.update(ref,{[freeKey]:(u[freeKey]||0)-words,updatedAt:new Date().toISOString()});}
   else if((u[freeKey]||0)>0){throw new Error('BALANCE_TOO_LOW');}
   else {throw new Error('BALANCE_EMPTY');}
  });
 } catch(e){
  const messages={PREMIUM_BALANCE_TOO_LOW:'এই ফিচারের প্রিমিয়াম ব্যালেন্সে এত শব্দ নেই। ছোট অংশ দিন অথবা প্যাকেজ নিন।',PREMIUM_BALANCE_EMPTY:'এই ফিচারের প্রিমিয়াম ব্যালেন্স শেষ। প্যাকেজ নিন।',SUBSCRIPTION_EXPIRED:'আপনার প্রিমিয়াম মেয়াদ শেষ। নতুন প্যাকেজ নিন; আর ফ্রি ক্রেডিট দেওয়া হবে না।',BALANCE_TOO_LOW:'এই ফিচারের অবশিষ্ট ফ্রি ক্রেডিটের চেয়ে ইনপুট বড়। ছোট অংশ দিন বা প্রিমিয়াম নিন।',BALANCE_EMPTY:'এই ফিচারের ফ্রি ক্রেডিট শেষ। প্রিমিয়াম প্যাকেজ নিন.'};
  return json(res, e.message in messages?402:500,{error:messages[e.message]||'Usage could not be reserved.'});
 }
 try {
  const system=feature==='modify'
   ? 'You are Modify Plus Cut, a careful Bengali story-script editor. Preserve story meaning and character names. Format narration as কথক: and dialogue as চরিত্রের নাম: with a blank line between segments. Correct obvious spelling and punctuation only where appropriate. Do not invent plot events. Reply with the edited text only.'
   : 'You are Modify Plus Cut story dialogue separator. Group each character’s dialogue accurately, preserve the exact original wording, and return clear sections headed by each character name. Keep narration in a separate কথক section. Do not invent dialogue. Use blank lines between separate segments. Reply with the result only.';
  const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text}]}],generationConfig:{temperature:0.2,maxOutputTokens:8192}})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.error?.message||`Gemini API request failed (${response.status})`);
  const output=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim(); if(!output) throw new Error('Empty AI response');
  return json(res,200,{result:output,inputWords:words,outputWords:wordCount(output),feature,chargedFrom:source});
 } catch(e){
  // Restore credits if the model request failed after a reservation.
  if(source==='free' || source==='premium') { try { const balanceKey=feature+(source==='premium'?'Premium':'Free'); await ref.update({[balanceKey]: (Number((await ref.get()).get(balanceKey))||0) + words,updatedAt:new Date().toISOString()}); } catch {} }
  return json(res,502,{error:'Gemini AI চালানো যায়নি। ক্রেডিট ফেরত দেওয়ার চেষ্টা করা হয়েছে। GEMINI_API_KEY, GEMINI_MODEL access, API quota ও error details পরীক্ষা করুন।'});
 }
}
