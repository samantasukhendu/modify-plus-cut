
import {
  db,
  json,
  method,
  deviceId,
  activePremium,
  wordCount,
  FieldValue
} from '../lib/server.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;

  const id = deviceId(req);
  if (!id) {
    return json(res, 400, { error: 'A valid device ID is required.' });
  }

  const feature = req.body?.feature;
  const text = String(req.body?.text || '').trim();

  if (!['modify', 'cut'].includes(feature)) {
    return json(res, 400, {
      error: 'Feature must be modify or cut.'
    });
  }

  if (!text) {
    return json(res, 400, { error: 'Please enter text.' });
  }

  const words = wordCount(text);

  if (words > 20000) {
    return json(res, 413, {
      error: 'এক ক্লিকে সর্বোচ্চ ২০,০০০ শব্দ দেওয়া যাবে।',
      wordCount: words
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return json(res, 503, {
      error: 'AI চালু করতে Vercel Environment Variables-এ GEMINI_API_KEY সেট করতে হবে।'
    });
  }

  const d = db();
  const ref = d.collection('users').doc(id);
  let source = 'free';
  let reserved = false;

  try {
    await d.runTransaction(async tx => {
      // Firestore transaction-এ লেখার আগে সব পড়া সম্পন্ন করতে হবে।
      const snap = await tx.get(ref);

      const u = snap.exists
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

      if (!u.everPremium) {
        if ((u.modifyFree || 0) > 20000) patch.modifyFree = 20000;
        if ((u.cutFree || 0) > 20000) patch.cutFree = 20000;
      }

      const currentUser = { ...u, ...patch };
      const premiumActive = activePremium(currentUser);
      const freeKey = `${feature}Free`;
      const premiumKey = `${feature}Premium`;

      if (currentUser.ownerAccess === true) {
        source = 'owner';
      } else if (premiumActive) {
        const balance = Number(currentUser[premiumKey]) || 0;

        if (balance < words) {
          throw new Error(
            balance > 0
              ? 'PREMIUM_BALANCE_TOO_LOW'
              : 'PREMIUM_BALANCE_EMPTY'
          );
        }

        patch[premiumKey] = balance - words;
        source = 'premium';
        reserved = true;
      } else if (currentUser.everPremium) {
        throw new Error('SUBSCRIPTION_EXPIRED');
      } else {
        const balance = Number(currentUser[freeKey]) || 0;

        if (balance < words) {
          throw new Error(
            balance > 0 ? 'BALANCE_TOO_LOW' : 'BALANCE_EMPTY'
          );
        }

        patch[freeKey] = balance - words;
        source = 'free';
        reserved = true;
      }

      const updates = {
        ...patch,
        updatedAt: FieldValue.serverTimestamp()
      };

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
  } catch (e) {
    const messages = {
      PREMIUM_BALANCE_TOO_LOW:
        'এই ফিচারের প্রিমিয়াম ব্যালেন্সে এত শব্দ নেই। ছোট অংশ দিন অথবা এই ফিচারের জন্য নতুন প্যাকেজ নিন।',
      PREMIUM_BALANCE_EMPTY:
        'এই ফিচারের প্রিমিয়াম ব্যালেন্স শেষ। অন্য ফিচারের ব্যালেন্স আলাদা থাকবে। এই ফিচারের জন্য নতুন প্যাকেজ নিন।',
      SUBSCRIPTION_EXPIRED:
        'আপনার প্রিমিয়াম মেয়াদ শেষ। নতুন প্যাকেজ নিন; আর ফ্রি ক্রেডিট দেওয়া হবে না।',
      BALANCE_TOO_LOW:
        'এই ফিচারের অবশিষ্ট ফ্রি ক্রেডিটের চেয়ে ইনপুট বড়। ছোট অংশ দিন বা প্রিমিয়াম নিন।',
      BALANCE_EMPTY:
        'এই ফিচারের ফ্রি ক্রেডিট শেষ। প্রিমিয়াম প্যাকেজ নিন।'
    };

    return json(res, e.message in messages ? 402 : 500, {
      error: messages[e.message] || 'Usage could not be reserved.'
    });
  }

  try {
    const system = feature === 'modify'
      ? 'You are Modify Plus Cut, a careful Bengali story-script editor. Preserve story meaning and character names. Format narration as কথক: and dialogue as চরিত্রের নাম: with a blank line between segments. Correct obvious spelling and punctuation only where appropriate. Do not invent plot events. Reply with the edited text only.'
      : 'You are Modify Plus Cut story dialogue separator. Group each character’s dialogue accurately, preserve the exact original wording, and return clear sections headed by each character name. Keep narration in a separate কথক section. Do not invent dialogue. Use blank lines between separate segments. Reply with the result only.';

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        })
      }
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.error?.message ||
        `Gemini API request failed (${response.status})`
      );
    }

    const output = payload.candidates?.[0]?.content?.parts
      ?.map(p => p.text || '')
      .join('')
      .trim();

    if (!output) throw new Error('Empty AI response');

    return json(res, 200, {
      result: output,
      inputWords: words,
      outputWords: wordCount(output),
      feature,
      chargedFrom: source
    });
  } catch (e) {
    // Atomic increment prevents concurrent refunds from overwriting each other.
    if (reserved && (source === 'free' || source === 'premium')) {
      try {
        const balanceKey =
          `${feature}${source === 'premium' ? 'Premium' : 'Free'}`;

        await ref.update({
          [balanceKey]: FieldValue.increment(words),
          updatedAt: FieldValue.serverTimestamp()
        });
      } catch {
        // Refund failure must be checked in server logs/monitoring.
      }
    }

    return json(res, 502, {
      error: 'Gemini AI চালানো যায়নি। ক্রেডিট ফেরত দেওয়ার চেষ্টা করা হয়েছে। GEMINI_API_KEY, GEMINI_MODEL access ও API quota পরীক্ষা করুন।'
    });
  }
}
