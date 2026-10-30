import {
  db,
  json,
  method,
  deviceId,
  activePremium,
  wordCount,
  FieldValue
} from '../lib/server.js';

const MAX_WORDS = 20000;
const MODEL_OUTPUT_TOKENS = 65536;

function getSystemInstruction(feature) {
  if (feature === 'modify') {
    return `তুমি Modify Plus Cut-এর বাংলা গল্প সম্পাদনা সহকারী। ব্যবহারকারী যে গল্প দেবেন, সেটিকে ভয়েস-ওভারের উপযোগী করে সাজাবে। নিচের নিয়মগুলো কঠোরভাবে মানবে:

১. গল্পের কোনো বাক্য, ঘটনা, সংলাপ, বর্ণনা, অনুচ্ছেদ বা বাক্যের ক্রম নিজের মতো করে লিখবে না, ছোট করবে না, বড় করবে না, বাদ দেবে না এবং নতুন কিছু যোগ করবে না।
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

function errorMessage(code) {
  const messages = {
    PREMIUM_BALANCE_TOO_LOW: 'এই ফিচারের প্রিমিয়াম ক্রেডিটে এত শব্দ নেই। ছোট অংশ দিন অথবা নতুন প্যাকেজ নিন।',
    PREMIUM_BALANCE_EMPTY: 'এই ফিচারের প্রিমিয়াম ক্রেডিট শেষ। এই ফিচারের জন্য নতুন প্যাকেজ নিন। অন্য ফিচারের ক্রেডিট আলাদা থাকবে।',
    SUBSCRIPTION_EXPIRED: 'আপনার প্রিমিয়াম মেয়াদ শেষ। নতুন প্যাকেজ নিন; আর ফ্রি ক্রেডিট দেওয়া হবে না।',
    BALANCE_TOO_LOW: 'এই ফিচারের অবশিষ্ট ফ্রি ক্রেডিটের চেয়ে ইনপুট বড়। ছোট অংশ দিন অথবা প্রিমিয়াম নিন।',
    BALANCE_EMPTY: 'এই ফিচারের ফ্রি ক্রেডিট শেষ। প্রিমিয়াম প্যাকেজ নিন।'
  };
  return messages[code] || null;
}

function usageErrorStatus(code) {
  return errorMessage(code) ? 402 : 500;
}

async function checkAndCharge(id, feature, words) {
  const firestore = db();
  const ref = firestore.collection('users').doc(id);
  let chargedFrom = 'free';

  await firestore.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const user = snap.exists
      ? snap.data()
      : {
          deviceId: id,
          modifyFree: 20000,
          cutFree: 20000,
          modifyPremium: 0,
          cutPremium: 0,
          everPremium: false,
          subscriptionExpiresAt: null
        };

    const patch = {};
    if (!user.everPremium) {
      if ((Number(user.modifyFree) || 0) > 20000) patch.modifyFree = 20000;
      if ((Number(user.cutFree) || 0) > 20000) patch.cutFree = 20000;
    }

    const currentUser = { ...user, ...patch };
    const premiumActive = activePremium(currentUser);
    const freeKey = `${feature}Free`;
    const premiumKey = `${feature}Premium`;

    if (currentUser.ownerAccess === true) {
      chargedFrom = 'owner';
    } else if (premiumActive) {
      const balance = Math.max(0, Number(currentUser[premiumKey]) || 0);
      if (balance < words) {
        throw new Error(balance > 0 ? 'PREMIUM_BALANCE_TOO_LOW' : 'PREMIUM_BALANCE_EMPTY');
      }
      patch[premiumKey] = balance - words;
      chargedFrom = 'premium';
    } else if (currentUser.everPremium) {
      throw new Error('SUBSCRIPTION_EXPIRED');
    } else {
      const balance = Math.max(0, Number(currentUser[freeKey]) || 0);
      if (balance < words) {
        throw new Error(balance > 0 ? 'BALANCE_TOO_LOW' : 'BALANCE_EMPTY');
      }
      patch[freeKey] = balance - words;
      chargedFrom = 'free';
    }

    const updates = { ...patch, updatedAt: FieldValue.serverTimestamp() };
    if (!snap.exists) {
      tx.set(ref, {
        deviceId: id,
        modifyFree: 20000,
        cutFree: 20000,
        modifyPremium: 0,
        cutPremium: 0,
        everPremium: false,
        subscriptionExpiresAt: null,
        createdAt: FieldValue.serverTimestamp(),
        ...updates
      });
    } else if (Object.keys(updates).length > 1) {
      tx.update(ref, updates);
    }
  });

  return chargedFrom;
}

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;

  const id = deviceId(req);
  if (!id) {
    return json(res, 400, { error: 'A valid device ID is required.' });
  }

  const feature = req.body?.feature;
  const text = String(req.body?.text || '').trim();

  if (!['modify', 'cut'].includes(feature)) {
    return json(res, 400, { error: 'Feature must be modify or cut.' });
  }
  if (!text) {
    return json(res, 400, { error: 'Please enter text.' });
  }

  const inputWords = wordCount(text);
  if (inputWords > MAX_WORDS) {
    return json(res, 413, {
      error: `এক ক্লিকে সর্বোচ্চ ${MAX_WORDS.toLocaleString('en-IN')} শব্দ দেওয়া যাবে।`,
      wordCount: inputWords
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return json(res, 503, {
      error: 'AI চালু করতে Vercel Environment Variables-এ GEMINI_API_KEY সেট করতে হবে।'
    });
  }

  // Check that Firebase is reachable before spending time on the AI request.
  // No credits are deducted at this stage.
  try {
    const firestore = db();
    const userRef = firestore.collection('users').doc(id);
    const snap = await userRef.get();
    const user = snap.exists
      ? snap.data()
      : { modifyFree: 20000, cutFree: 20000, modifyPremium: 0, cutPremium: 0, everPremium: false, subscriptionExpiresAt: null };
    const premiumActive = activePremium(user);
    const key = premiumActive ? `${feature}Premium` : `${feature}Free`;
    const balance = user.ownerAccess === true ? Infinity : Math.max(0, Number(user[key]) || 0);

    if (user.everPremium && !premiumActive && user.ownerAccess !== true) {
      return json(res, 402, { error: errorMessage('SUBSCRIPTION_EXPIRED') });
    }
    if (balance < inputWords) {
      const code = premiumActive
        ? (balance > 0 ? 'PREMIUM_BALANCE_TOO_LOW' : 'PREMIUM_BALANCE_EMPTY')
        : (balance > 0 ? 'BALANCE_TOO_LOW' : 'BALANCE_EMPTY');
      return json(res, 402, { error: errorMessage(code) });
    }
  } catch (e) {
    console.error('[Modify Plus Cut] Firebase pre-check failed:', e);
    return json(res, 500, {
      error: 'সার্ভারের Firebase/Firestore সংযোগে সমস্যা হচ্ছে। Vercel Logs এবং FIREBASE_SERVICE_ACCOUNT_BASE64 সেটিং পরীক্ষা করুন।'
    });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  let output;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: getSystemInstruction(feature) }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: MODEL_OUTPUT_TOKENS
          }
        })
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[Modify Plus Cut] Gemini API error:', response.status, payload.error?.message || 'No error message');
      if (response.status === 429) {
        return json(res, 503, { error: 'Gemini API-এর ব্যবহারসীমা/কোটা শেষ বা সাময়িকভাবে ব্যস্ত। কিছুক্ষণ পরে আবার চেষ্টা করুন। কোনো ক্রেডিট কাটা হয়নি।' });
      }
      if (response.status === 401 || response.status === 403) {
        return json(res, 503, { error: 'Gemini API key বা API permission-এ সমস্যা আছে। Vercel-এর GEMINI_API_KEY এবং Google AI Studio সেটিং পরীক্ষা করুন। কোনো ক্রেডিট কাটা হয়নি।' });
      }
      return json(res, 502, { error: `Gemini AI অনুরোধ সম্পন্ন করতে পারেনি (HTTP ${response.status})। কোনো ক্রেডিট কাটা হয়নি।` });
    }

    const candidate = payload.candidates?.[0];
    output = candidate?.content?.parts?.map(part => part.text || '').join('').trim();

    if (!output) {
      console.error('[Modify Plus Cut] Gemini returned no text:', JSON.stringify(payload).slice(0, 3000));
      return json(res, 502, { error: 'AI কোনো সম্পূর্ণ লেখা ফেরত দেয়নি। আবার চেষ্টা করুন বা গল্পটি ছোট অংশে দিন। কোনো ক্রেডিট কাটা হয়নি.' });
    }

    if (candidate?.finishReason === 'MAX_TOKENS') {
      return json(res, 502, { error: 'গল্পটির ফলাফল AI-এর একবারের আউটপুট সীমা ছাড়িয়েছে। গল্পটি কয়েকটি ছোট অংশে ভাগ করে দিন। কোনো ক্রেডিট কাটা হয়নি।' });
    }
  } catch (e) {
    console.error('[Modify Plus Cut] Gemini request failed:', e);
    return json(res, 502, { error: 'Gemini AI-এর সঙ্গে সংযোগ করা যায়নি। ইন্টারনেট/API সেটিং পরীক্ষা করে আবার চেষ্টা করুন। কোনো ক্রেডিট কাটা হয়নি।' });
  }

  // Deduct credits only after a usable AI result has been received.
  // The transaction rechecks the latest balance to prevent concurrent requests
  // from spending the same credits twice.
  let chargedFrom;
  try {
    chargedFrom = await checkAndCharge(id, feature, inputWords);
  } catch (e) {
    const message = errorMessage(e.message);
    if (message) {
      return json(res, 402, { error: message });
    }
    console.error('[Modify Plus Cut] Credit transaction failed:', e);
    return json(res, 500, {
      error: 'AI ফলাফল তৈরি হয়েছে, কিন্তু ক্রেডিট হিসাব আপডেট করা যায়নি। আবার চেষ্টা করার আগে অ্যাডমিনের সঙ্গে যোগাযোগ করুন।'
    });
  }

  return json(res, 200, {
    result: output,
    inputWords,
    outputWords: wordCount(output),
    feature,
    chargedFrom
  });
}
