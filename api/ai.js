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

function errorMessage(code, feature) {
  const name = feature === 'modify' ? 'Modify' : 'Cut';

  const messages = {
    FREE_WORD_LIMIT:
      `আপনার ইনপুটে শব্দের সংখ্যা বেশি। আপনার অবশিষ্ট ফ্রি ক্রেডিট দিয়ে এত বড় ${name} করা সম্ভব হচ্ছে না। কম শব্দ দিয়ে আবার চেষ্টা করুন। বেশি শব্দের কাজ করতে চাইলে প্রিমিয়াম প্যাকেজ নিতে পারেন।`,

    FREE_CREDIT_FINISHED:
      `আপনার ফ্রি ${name} ক্রেডিট শেষ হয়ে গেছে। ${name} ব্যবহার চালিয়ে যেতে Premium প্যাকেজ নিন।`,

    PREMIUM_WORD_LIMIT:
      `আপনার অবশিষ্ট প্রিমিয়াম ${name} ক্রেডিট দিয়ে এত বড় কাজ করা সম্ভব হচ্ছে না। কম শব্দ দিয়ে আবার চেষ্টা করুন অথবা নতুন প্যাকেজ নিন।`,

    PREMIUM_CREDIT_FINISHED:
      `আপনার প্রিমিয়াম ${name} ক্রেডিট শেষ হয়ে গেছে। ${name} ব্যবহার চালিয়ে যেতে Premium প্যাকেজ নিন।`,

    SUBSCRIPTION_EXPIRED:
      'আপনার প্রিমিয়াম মেয়াদ শেষ হয়ে গেছে। নতুন Premium প্যাকেজ নিন।',

    GEMINI_ERROR:
      'সার্ভারে সমস্যা হচ্ছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',

    FIREBASE_ERROR:
      'সার্ভার সাময়িকভাবে ব্যস্ত। কিছুক্ষণ পরে আবার চেষ্টা করুন।'
  };

  return messages[code] || 'একটি সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।';
}

function isUsageError(code) {
  return [
    'FREE_WORD_LIMIT',
    'FREE_CREDIT_FINISHED',
    'PREMIUM_WORD_LIMIT',
    'PREMIUM_CREDIT_FINISHED',
    'SUBSCRIPTION_EXPIRED'
  ].includes(code);
}

function makeUsageError(code) {
  return Object.assign(new Error(code), { code });
}

/*
 * ক্রেডিট বাছাইয়ের মূল নিয়ম:
 * - Premium সক্রিয় থাকলে শুধু Premium credit ব্যবহার হবে।
 * - Premium সক্রিয় হলে Free balance পড়া/কাটা হবে না; অবশিষ্ট Free credit
 *   ডেটাবেসে থাকলেও তা আর কার্যকর বা ব্যবহারযোগ্য নয়।
 * - Premium একবার নেওয়ার পর মেয়াদ শেষ হলে Free credit-এ ফিরে যাওয়া যাবে না।
 * - Premium কখনো সক্রিয় না হলে তবেই Free credit ব্যবহার হবে।
 */
function checkCredit(user, feature, inputWords) {
  const freeField = feature === 'modify' ? 'modifyFree' : 'cutFree';
  const premiumField = feature === 'modify' ? 'modifyPremium' : 'cutPremium';

  if (user.ownerAccess === true) {
    return { source: 'owner', field: null, balance: Infinity };
  }

  const premiumActive = activePremium(user);

  if (premiumActive) {
    const premium = Math.max(0, Number(user[premiumField]) || 0);

    if (premium <= 0) {
      throw makeUsageError('PREMIUM_CREDIT_FINISHED');
    }
    if (inputWords > premium) {
      throw makeUsageError('PREMIUM_WORD_LIMIT');
    }

    return { source: 'premium', field: premiumField, balance: premium };
  }

  if (user.everPremium) {
    throw makeUsageError('SUBSCRIPTION_EXPIRED');
  }

  const free = Math.max(0, Number(user[freeField]) || 0);

  if (free <= 0) {
    throw makeUsageError('FREE_CREDIT_FINISHED');
  }
  if (inputWords > free) {
    throw makeUsageError('FREE_WORD_LIMIT');
  }

  return { source: 'free', field: freeField, balance: free };
}

async function readUserAndCheck(id, feature, words) {
  const firestore = db();
  const ref = firestore.collection('users').doc(id);
  const snap = await ref.get();

  const user = snap.exists ? snap.data() : {
    deviceId: id,
    modifyFree: 20000,
    cutFree: 20000,
    modifyPremium: 0,
    cutPremium: 0,
    everPremium: false,
    subscriptionExpiresAt: null
  };

  checkCredit(user, feature, words);
}

/*
 * AI ফলাফল পাওয়ার পর Firestore transaction-এর মধ্যে সর্বশেষ ব্যালান্স
 * আবার যাচাই করে ক্রেডিট কাটা হয়। ফলে একই সময়ে একাধিক অনুরোধ এলেও
 * একই ক্রেডিট দুবার খরচ হবে না।
 */
async function checkAndCharge(id, feature, words) {
  const firestore = db();
  const ref = firestore.collection('users').doc(id);
  let chargedFrom = 'free';

  await firestore.runTransaction(async tx => {
    const snap = await tx.get(ref);

    const user = snap.exists ? snap.data() : {
      deviceId: id,
      modifyFree: 20000,
      cutFree: 20000,
      modifyPremium: 0,
      cutPremium: 0,
      everPremium: false,
      subscriptionExpiresAt: null
    };

    const credit = checkCredit(user, feature, words);
    chargedFrom = credit.source;

    const updates = {
      updatedAt: FieldValue.serverTimestamp()
    };

    if (credit.field) {
      updates[credit.field] = credit.balance - words;
    }

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
    } else {
      tx.update(ref, updates);
    }
  });

  return chargedFrom;
}

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;

  const id = deviceId(req);
  if (!id) {
    return json(res, 400, {
      error: 'অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।'
    });
  }

  const feature = req.body?.feature;
  const text = String(req.body?.text || '').trim();

  if (!['modify', 'cut'].includes(feature)) {
    return json(res, 400, {
      error: 'অনুরোধটি সঠিক নয়। আবার চেষ্টা করুন।'
    });
  }

  if (!text) {
    return json(res, 400, {
      error: 'অনুগ্রহ করে গল্পের লেখা দিন।'
    });
  }

  const inputWords = wordCount(text);

  if (inputWords > MAX_WORDS) {
    return json(res, 413, {
      code: 'MAX_WORDS_EXCEEDED',
      error: `এক ক্লিকে সর্বোচ্চ ${MAX_WORDS.toLocaleString('en-IN')} শব্দ দেওয়া যাবে।`,
      wordCount: inputWords
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('[Modify Plus Cut] Gemini API configuration is missing.');
    return json(res, 503, {
      code: 'GEMINI_ERROR',
      error: errorMessage('GEMINI_ERROR', feature)
    });
  }

  // Firebase-এর প্রাথমিক যাচাই ব্যর্থ হলে কোনো ক্রেডিট কাটা হবে না।
  try {
    await readUserAndCheck(id, feature, inputWords);
  } catch (e) {
    if (isUsageError(e.code)) {
      return json(res, 402, {
        code: e.code,
        error: errorMessage(e.code, feature)
      });
    }

    console.error('[Modify Plus Cut] Firebase pre-check failed:', e);
    return json(res, 503, {
      code: 'FIREBASE_ERROR',
      error: errorMessage('FIREBASE_ERROR', feature)
    });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  let output;

  // Gemini ব্যর্থ হলে কোনো ক্রেডিট কাটা হবে না।
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: getSystemInstruction(feature) }]
          },
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
      console.error(
        '[Modify Plus Cut] Gemini API error:',
        response.status,
        payload.error?.message || 'No error message'
      );
      return json(res, 503, {
        code: 'GEMINI_ERROR',
        error: errorMessage('GEMINI_ERROR', feature)
      });
    }

    const candidate = payload.candidates?.[0];
    output = candidate?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    if (!output) {
      console.error(
        '[Modify Plus Cut] Gemini returned no text:',
        JSON.stringify(payload).slice(0, 3000)
      );
      return json(res, 502, {
        code: 'GEMINI_ERROR',
        error: errorMessage('GEMINI_ERROR', feature)
      });
    }

    if (candidate?.finishReason === 'MAX_TOKENS') {
      return json(res, 502, {
        code: 'GEMINI_ERROR',
        error: 'গল্পটির ফলাফল একবারে তৈরি করা সম্ভব হয়নি। গল্পটি কয়েকটি ছোট অংশে ভাগ করে দিন। কোনো ক্রেডিট কাটা হয়নি।'
      });
    }
  } catch (e) {
    console.error('[Modify Plus Cut] Gemini request failed:', e);
    return json(res, 503, {
      code: 'GEMINI_ERROR',
      error: errorMessage('GEMINI_ERROR', feature)
    });
  }

  // AI ফলাফল সফল হওয়ার পরেই সর্বশেষ ব্যালান্স যাচাই করে ক্রেডিট কাটা হবে।
  let chargedFrom;

  try {
    chargedFrom = await checkAndCharge(id, feature, inputWords);
  } catch (e) {
    if (isUsageError(e.code)) {
      return json(res, 402, {
        code: e.code,
        error: errorMessage(e.code, feature)
      });
    }

    console.error('[Modify Plus Cut] Firebase credit transaction failed:', e);
    return json(res, 503, {
      code: 'FIREBASE_ERROR',
      error: errorMessage('FIREBASE_ERROR', feature)
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
