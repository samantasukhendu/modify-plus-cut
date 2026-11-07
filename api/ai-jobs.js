import crypto from 'node:crypto';
import { db, json, method, deviceId, activePremium, wordCount, FieldValue } from '../lib/server.js';

const MAX_WORDS = 20000;
const CHUNK_WORDS = 1000;
const MODIFY_CHUNK_WORDS = 1000;
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash'].filter(Boolean))];
const MODIFY_MODEL = 'gemini-3.8-flash';
function canTryNextModel(error) { return error?.message === 'AI_TIMEOUT' || [404, 503].includes(Number(error?.status)); }
function getSystemInstruction(feature) {
  if (feature === 'modify') {
    return `তুমি Modify Plus Cut-এর বাংলা গল্প সম্পাদনা সহকারী। ব্যবহারকারী যে গল্প দেবেন, সেটিকে ভয়েস-ওভারের উপযোগী করে সাজাবে। নিচের নিয়মগুলো কঠোরভাবে মানবে:

১. গল্পের কোনো বাক্য, ঘটনা, সংলাপ, বর্ণনা, অনুচ্ছেদ বা বাক্যের ক্রম নিজের মতো করে লিখবে না, ছোট করবে না, বড় করবে না, বাদ দেবে না এবং নতুন কিছু যোগ করবে।
২. মূল গল্পের শব্দ ও বাক্য যথাসম্ভব হুবহু রাখবে। কেবল স্পষ্ট বানানভুল সংশোধন করবে। প্রয়োজন হলে যতিচিহ্ন ঠিক করবে। বানান সংশোধনের বাইরে শব্দের পছন্দ বা বাক্যগঠন বদলাবে না।
৩. বর্ণনামূলক অংশের আগে “কথক:” লিখবে।
৪. কোনো চরিত্রের কথা বা সংলাপের আগে সেই চরিত্রের নাম লিখবে, যেমন “রাহুল:”. গল্পে নাম জানা না থাকলে নিজের থেকে নাম বানাবে না; উপযুক্ত সাধারণ পরিচয় ব্যবহার করবে, যেমন “অজ্ঞাত ব্যক্তি:”.
৫. সংলাপ ও কথকের অংশ আলাদা আলাদা রাখবে। প্রতিটি বক্তার অংশের পর একটি ফাঁকা লাইন দেবে, যাতে মানুষ সহজে ভয়েস-ওভার করতে পারেন।
৬. গল্পের শিরোনাম, লেখকের নাম, পর্ব/অধ্যায়ের নাম ও নম্বর অপরিবর্তিত রাখবে।
৭. গল্পের কোনো অংশ সংলাপ না বর্ণনা—এ বিষয়ে নিশ্চিত না হলে সেটিকে কথকের বর্ণনা হিসেবে রাখবে; নতুন সংলাপ তৈরি করবে না।
৮. শুধু সাজানো সম্পূর্ণ গল্প ফেরত দেবে। কোনো ভূমিকা, ব্যাখ্যা, মন্তব্য, সারাংশ বা অতিরিক্ত নির্দেশনা লিখবে না।`;
  }

  return `তুমি Modify Plus Cut-এর বাংলা গল্পের সংলাপ আলাদা করার সহকারী। ব্যবহারকারীর দেওয়া গল্প থেকে সব চরিত্রের সংলাপ নির্ভুলভাবে আলাদা করে সাজাবে। নিচের নিয়মগুলো কঠোরভাবে মানবে:

১. প্রথমে গল্পের শুরু থেকে শেষ পর্যন্ত সব চরিত্র শনাক্ত করবে।
২. একজন চরিত্রের গল্পের যেখানেই সংলাপ থাকুক, সেই চরিত্রের সব সংলাপ এক জায়গায় ধারাবাহিকভাবে একত্র করবে। এরপর পরের চরিত্রের সব সংলাপ একইভাবে সাজাবে। কোনো সংলাপ বাদ যাবে না।
৩. প্রতিটি সংলাপের আগে সংশ্লিষ্ট চরিত্রের নাম লিখবে।
৪. কথকের বর্ণনা সংলাপের সঙ্গে মেশাবে না। সব বর্ণনামূলক অংশ “কথক:” নামে আলাদা বিভাগে রাখবে।
৫. মূল সংলাপ ও বর্ণনার শব্দ, বাক্য, অর্থ বা ভাষা পরিবর্তন করবে না। বানান সংশোধন, পুনর্লিখন, সংক্ষিপ্তকরণ বা নতুন সংলাপ যোগ করবে না।
৬. একই চরিত্রের সংলাপগুলো গল্পে যে ক্রমে এসেছে, সেই ক্রম বজায় রাখবে। চরিত্রগুলোর বিভাগ সাজানোর সময় প্রথম যে চরিত্রের সংলাপ এসেছে তাকে আগে রাখবে; এরপর প্রথম উপস্থিতির ক্রম অনুসরণ করবে।
৭. গল্পের শিরোনাম, লেখকের নাম এবং পর্ব/অধ্যায়ের নাম ও নম্বর অক্ষত রাখবে। এগুলোকে কোনো চরিত্রের সংলাপ হিসেবে ধরবে না।
৮. প্রতিটি সংলাপ/বর্ণনার অংশের পর একটি ফাঁকা লাইন দেবে, যাতে মানুষ সহজে ভয়েস-ওভার করতে পারেন।
৯. কোনো বক্তার পরিচয় নিশ্চিত না হলে নিজের থেকে চরিত্রের নাম বানাবে না; “অজ্ঞাত ব্যক্তি:” লিখবে।
১০. শুধু সাজানো সম্পূর্ণ ফলাফল দেবে। কোনো ভূমিকা, ব্যাখ্যা, মন্তব্য, সারাংশ বা অতিরিক্ত নির্দেশনা লিখবে না।`;
}

function splitStory(text, maxWords = CHUNK_WORDS) {
  const paragraphs = String(text).split(/\n\s*\n/);
  const chunks = []; let current = '';
  const count = s => wordCount(s);
  const push = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
  for (const paragraph of paragraphs) {
    const p = paragraph.trim(); if (!p) continue;
    if (count(p) <= maxWords) {
      const candidate = current ? current + '\n\n' + p : p;
      if (count(candidate) <= maxWords) current = candidate;
      else { push(); current = p; }
    } else {
      push();
      const sentences = p.match(/[^.!?।]+[.!?।]?/g) || [p];
      for (const sentence of sentences) {
        const s = sentence.trim(); if (!s) continue;
        const candidate = current ? current + ' ' + s : s;
        if (count(candidate) <= maxWords) current = candidate;
        else { push(); current = s; }
      }
      push();
    }
  }
  push(); return chunks;
}
function balanceCode(user, feature, words) {
  if (user.ownerAccess === true) return null;
  if (activePremium(user)) {
    const b = Math.max(0, Number(user[`${feature}Premium`]) || 0);
    return b >= words ? null : (b ? 'PREMIUM_BALANCE_TOO_LOW' : 'PREMIUM_BALANCE_EMPTY');
  }
  if (user.everPremium) return 'SUBSCRIPTION_EXPIRED';
  const b = Math.min(MAX_WORDS, Math.max(0, Number(user[`${feature}Free`] ?? MAX_WORDS) || 0));
  return b >= words ? null : (b ? 'BALANCE_TOO_LOW' : 'BALANCE_EMPTY');
}
function usageError(res, code, feature) {
  const n = feature === 'modify' ? 'Modify' : 'Cut';
  const messages = {
    PREMIUM_BALANCE_TOO_LOW:`আপনার অবশিষ্ট প্রিমিয়াম ${n} ক্রেডিট দিয়ে এত বড় কাজ করা সম্ভব হচ্ছে না। কম শব্দ দিয়ে আবার চেষ্টা করুন অথবা নতুন প্যাকেজ নিন।`,
    PREMIUM_BALANCE_EMPTY:`আপনার প্রিমিয়াম ${n} ক্রেডিট শেষ হয়ে গেছে। নতুন Premium প্যাকেজ নিন।`,
    SUBSCRIPTION_EXPIRED:'আপনার প্রিমিয়াম মেয়াদ শেষ হয়ে গেছে। নতুন Premium প্যাকেজ নিন।',
    BALANCE_TOO_LOW:`আপনার অবশিষ্ট ফ্রি ${n} ক্রেডিট দিয়ে এত বড় কাজ করা সম্ভব হচ্ছে না।`,
    BALANCE_EMPTY:`আপনার ফ্রি ${n} ক্রেডিট শেষ হয়ে গেছে। Premium প্যাকেজ নিন.`
  };
  const status = code === 'SUBSCRIPTION_EXPIRED' || code.endsWith('_EMPTY') || code.endsWith('_TOO_LOW') ? 402 : 500;
  return json(res,status,{code,error:messages[code] || 'একটি সমস্যা হয়েছে।'});
}
async function gemini(text, feature, mode='chunk') {
  const key=process.env.GEMINI_API_KEY; if(!key) throw new Error('AI_NOT_CONFIGURED');
  let system=getSystemInstruction(feature);
  if (feature==='cut' && mode==='chunk') system += '\n\nগুরুত্বপূর্ণ: এটি সম্পূর্ণ গল্পের একটি অংশ। এই অংশে যত চরিত্র/কথক অংশ আছে সেগুলোই সাজাও। কোনো চরিত্র বা ঘটনা এই অংশে না থাকলে কল্পনা করবে না। পরে সব অংশ একত্রে বৈশ্বিকভাবে সাজানো হবে।';
  if (feature==='cut' && mode==='aggregate') system += '\n\nএটি বিভিন্ন অংশের মধ্যবর্তী ফলাফল। সব অংশ মিলিয়ে একই চরিত্রের সংলাপ এক জায়গায় একত্র করো। চরিত্রের প্রথম উপস্থিতির ক্রম এবং প্রতিটি চরিত্রের সংলাপের মূল ক্রম বজায় রাখো।';
  let lastError;
  for (const model of MODELS) {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),50000);
    try {
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text}]}],generationConfig:{temperature:0.1,maxOutputTokens:32768}})
      });
      const p=await r.json().catch(()=>({}));
      if(!r.ok){const e=new Error(p.error?.message || `Gemini HTTP ${r.status}`);e.status=r.status;throw e;}
      const out=p.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();
      if(!out || p.candidates?.[0]?.finishReason==='MAX_TOKENS') throw new Error('AI_INCOMPLETE');
      return out;
    } catch(e) {
      lastError=e.name==='AbortError'?new Error('AI_TIMEOUT'):e;
      if(!canTryNextModel(lastError)) throw lastError;
      console.warn(`[ai-jobs] model ${model} failed; trying fallback`,lastError.message);
    } finally { clearTimeout(timeout); }
  }
  throw lastError || new Error('AI_ERROR');
}
async function geminiStreamToResponse(text, feature, res) {
  const key=process.env.GEMINI_API_KEY; if(!key) throw new Error('AI_NOT_CONFIGURED');
  const system=getSystemInstruction(feature);
  let lastError;
  for (const model of [MODIFY_MODEL]) {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),55000);
    let emitted=false;
    try {
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text}]}],generationConfig:{maxOutputTokens:8192,thinkingConfig:{thinkingLevel:"LOW"}}})
      });
      if(!response.ok){const body=await response.text().catch(()=> '');const err=new Error(`Gemini HTTP ${response.status}: ${body.slice(0,500)}`);err.status=response.status;throw err;}
      res.statusCode=200;res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');
      let buffer='',full='';
      const reader=response.body.getReader();const decoder=new TextDecoder();
      while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let split;
        while((split=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,split).trim();buffer=buffer.slice(split+1);if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')continue;
          let packet;try{packet=JSON.parse(raw)}catch{continue;}
          const candidate=packet.candidates?.[0];const delta=(candidate?.content?.parts||[]).map(x=>x.text||'').join('');
          if(delta){full+=delta;emitted=true;res.write(`data: ${JSON.stringify({text:delta})}\n\n`);}
          if(candidate?.finishReason==='MAX_TOKENS')throw new Error('AI_INCOMPLETE');
        }
      }
      full=full.trim();if(!full)throw new Error('AI_EMPTY_RESULT');
      res.write(`data: ${JSON.stringify({done:true})}\n\n`);return full;
    } catch(e) {
      lastError=e.name==='AbortError'?new Error('AI_TIMEOUT'):e;
      // Once text has reached the browser, switching models could duplicate story text.
      if(emitted || !canTryNextModel(lastError)) throw lastError;
      console.warn(`[ai-jobs] streaming model ${model} failed before output; trying fallback`,lastError.message);
    } finally { clearTimeout(timeout); }
  }
  throw lastError || new Error('AI_ERROR');
}
function jobRef(d,id){return d.collection('aiJobs').doc(id);}
async function getJob(d,id,device){const ref=jobRef(d,id),s=await ref.get();if(!s.exists || s.data().deviceId!==device) return null;return {ref,data:s.data()};}

export default async function handler(req,res){
 if(!method(req,res,['POST'])) return;
 const device=deviceId(req); if(!device) return json(res,400,{error:'Device ID সঠিক নয়।'});
 const {action}=req.body||{}; const d=db(); let featureForError=req.body?.feature;
 try {
  if(action==='start'){
   const feature=req.body.feature, text=String(req.body.text||'').trim();
   if(!['modify','cut'].includes(feature)||!text) return json(res,400,{error:'গল্প ও সঠিক অপশন দিন।'});
   const words=wordCount(text); if(words>MAX_WORDS) return json(res,413,{code:'MAX_WORDS_EXCEEDED',error:'এক ক্লিকে সর্বোচ্চ ২০,০০০ শব্দ দেওয়া যাবে।',wordCount:words});
   const userRef=d.collection('users').doc(device),snap=await userRef.get();
   const user=snap.exists?snap.data():{deviceId:device,modifyFree:MAX_WORDS,cutFree:MAX_WORDS,modifyPremium:0,cutPremium:0,everPremium:false};
   const code=balanceCode(user,feature,words); if(code) return usageError(res,code,feature);
   const chunks=splitStory(text, feature==='modify' ? MODIFY_CHUNK_WORDS : CHUNK_WORDS); if(!chunks.length) return json(res,400,{error:'গল্প ভাগ করা যায়নি।'});
   const id=crypto.randomUUID().replaceAll('-',''); const ref=jobRef(d,id);
   await ref.set({deviceId:device,feature,inputWords:words,totalChunks:chunks.length,completedChunks:0,failedChunks:0,status:'processing',charged:false,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
   const batch=d.batch(); chunks.forEach((chunk,i)=>batch.set(ref.collection('chunks').doc(String(i).padStart(5,'0')),{index:i,text:chunk,status:'pending',attempts:0})); await batch.commit();
   return json(res,200,{jobId:id,totalChunks:chunks.length,inputWords:words,status:'processing'});
  }
  const jobId=String(req.body.jobId||''); if(!/^[a-f0-9]{32}$/.test(jobId)) return json(res,400,{error:'Job ID সঠিক নয়।'});
  const found=await getJob(d,jobId,device); if(!found) return json(res,404,{error:'কাজটি পাওয়া যায়নি।'});
  const {ref,data}=found; featureForError=data.feature;
  if(action==='status'){
   const snap=await ref.collection('chunks').orderBy('index').get();
   const rows=snap.docs.map(x=>x.data());
   return json(res,200,{jobId,status:data.status,totalChunks:data.totalChunks,completedChunks:rows.filter(x=>x.status==='completed').length,failedChunks:rows.filter(x=>x.status==='failed').length,charged:data.charged===true,result:data.result||null,inputWords:data.inputWords,outputWords:data.outputWords,chargedFrom:data.chargedFrom,...(req.body.includeChunks===true?{chunks:rows.map(x=>({index:x.index,status:x.status,attempts:x.attempts||0,error:x.error||null,...(req.body.includeResults===true&&x.status==='completed'?{result:x.result||''}:{})}))}:{})});
  }
  if(action==='process-stream'){
   if(data.feature!=='modify') return json(res,400,{error:'Streaming এই পরীক্ষায় শুধু Modify-এর জন্য চালু আছে।'});
   const index=Number(req.body.index); if(!Number.isInteger(index)||index<0||index>=data.totalChunks) return json(res,400,{error:'Chunk নম্বর সঠিক নয়।'});
   const cr=ref.collection('chunks').doc(String(index).padStart(5,'0'));
   const cs=await cr.get(); if(!cs.exists) return json(res,404,{error:'Chunk পাওয়া যায়নি।'});
   if(cs.data().status==='completed') return json(res,409,{error:'এই অংশ আগে থেকেই সম্পন্ন হয়েছে।'});
   await cr.set({status:'processing',attempts:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
   let result='';
   try { result=await geminiStreamToResponse(cs.data().text,'modify',res); await cr.set({status:'completed',result,updatedAt:FieldValue.serverTimestamp(),error:null},{merge:true}); }
   catch(e){await cr.set({status:'failed',error:String(e.message||'AI_ERROR').slice(0,300),updatedAt:FieldValue.serverTimestamp()},{merge:true});console.error('[ai-jobs] modify stream failed',e);if(!res.headersSent)return json(res,502,{code:'CHUNK_FAILED',error:'Modify অংশটি সম্পন্ন হয়নি।'});res.write(`event: error\ndata: ${JSON.stringify({error:'এই অংশটি সম্পন্ন করা যায়নি।'})}\n\n`);}
   if(res.headersSent){res.end();return;}
   return;
  }
  if(action==='process' || action==='retry'){
   const index=Number(req.body.index); if(!Number.isInteger(index)||index<0||index>=data.totalChunks) return json(res,400,{error:'Chunk নম্বর সঠিক নয়।'});
   const cr=ref.collection('chunks').doc(String(index).padStart(5,'0'));
   const cs=await cr.get(); if(!cs.exists) return json(res,404,{error:'Chunk পাওয়া যায়নি।'});
   if(cs.data().status==='completed') return json(res,200,{index,status:'completed',alreadyDone:true});
   await cr.set({status:'processing',attempts:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
   try { const result=await gemini(cs.data().text,data.feature,'chunk'); await cr.set({status:'completed',result,updatedAt:FieldValue.serverTimestamp(),error:null},{merge:true}); }
   catch(e){ await cr.set({status:'failed',error:String(e.message||'AI_ERROR').slice(0,300),updatedAt:FieldValue.serverTimestamp()},{merge:true}); console.error('[ai-jobs] chunk failed',e); return json(res,502,{code:'CHUNK_FAILED',error:'একটি অংশ সম্পন্ন হয়নি। Retry করে আবার চেষ্টা করুন।',index}); }
   const fresh=await ref.collection('chunks').get(); const done=fresh.docs.filter(x=>x.data().status==='completed').length; const failed=fresh.docs.filter(x=>x.data().status==='failed').length;
   await ref.set({completedChunks:done,failedChunks:failed,updatedAt:FieldValue.serverTimestamp()},{merge:true});
   return json(res,200,{index,status:'completed',completedChunks:done,totalChunks:data.totalChunks,failedChunks:failed});
  }
  if(action==='finalize'){
   const chunksSnap=await ref.collection('chunks').orderBy('index').get(); const chunks=chunksSnap.docs.map(x=>x.data());
   if(chunks.length!==data.totalChunks || chunks.some(x=>x.status!=='completed')) return json(res,409,{code:'CHUNKS_INCOMPLETE',error:'সব অংশ সম্পন্ন হয়নি। ব্যর্থ অংশগুলো Retry করুন।'});
   let result;
   if(data.feature==='modify') result=chunks.map(x=>x.result).join('\n\n').trim();
   else result=await gemini(chunks.map(x=>x.result).join('\n\n--- অংশ ---\n\n'),'cut','aggregate');
   const userRef=d.collection('users').doc(device); let chargedFrom='free';
   await d.runTransaction(async tx=>{
    const js=await tx.get(ref),us=await tx.get(userRef); if(!js.exists) throw new Error('JOB_MISSING');
    if(js.data().charged===true){chargedFrom=js.data().chargedFrom||'free';return;}
    const u=us.exists?us.data():{deviceId:device,modifyFree:MAX_WORDS,cutFree:MAX_WORDS,modifyPremium:0,cutPremium:0,everPremium:false};
    const code=balanceCode(u,data.feature,data.inputWords); if(code) throw new Error(code);
    const patch={updatedAt:FieldValue.serverTimestamp()};
    if(u.ownerAccess===true) chargedFrom='owner';
    else if(activePremium(u)){const k=`${data.feature}Premium`;patch[k]=Math.max(0,Number(u[k])||0)-data.inputWords;chargedFrom='premium';}
    else {const k=`${data.feature}Free`;patch[k]=Math.min(MAX_WORDS,Math.max(0,Number(u[k]??MAX_WORDS)||0))-data.inputWords;chargedFrom='free';}
    if(us.exists) tx.update(userRef,patch); else tx.set(userRef,{deviceId:device,modifyFree:MAX_WORDS,cutFree:MAX_WORDS,modifyPremium:0,cutPremium:0,everPremium:false,subscriptionExpiresAt:null,createdAt:FieldValue.serverTimestamp(),...patch});
    tx.update(ref,{charged:true,chargedFrom,status:'completed',result,inputWords:data.inputWords,outputWords:wordCount(result),completedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
   });
   const finalSnap=await ref.get(); const finalData=finalSnap.data();
   return json(res,200,{jobId,status:'completed',result:finalData.result,inputWords:finalData.inputWords,outputWords:finalData.outputWords,chargedFrom:finalData.chargedFrom,charged:true});
  }
  return json(res,400,{error:'অজানা action।'});
 }catch(e){
  if(['PREMIUM_BALANCE_TOO_LOW','PREMIUM_BALANCE_EMPTY','SUBSCRIPTION_EXPIRED','BALANCE_TOO_LOW','BALANCE_EMPTY'].includes(e.message)) return usageError(res,e.message,featureForError);
  console.error('[ai-jobs] server error',e); return json(res,503,{code:'SERVER_BUSY',error:'সার্ভার সাময়িকভাবে ব্যস্ত। কিছুক্ষণ পরে আবার চেষ্টা করুন।'});
 }
}
