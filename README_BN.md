# Modify Plus Cut — full-stack Vercel project

এই প্রজেক্টে পুরোনো `index.html`-এর বদলে সম্পূর্ণ ফ্রন্টএন্ড এবং Vercel serverless API যুক্ত করা হয়েছে। এটি একই Vercel প্রজেক্টে deploy করার উপযোগী; তবে লাইভ Firebase, AI এবং SMS credential সেট না করা পর্যন্ত সব সুবিধা কাজ করবে না। কোনো API key বা service-account key HTML-এ রাখা হয়নি।

## অন্তর্ভুক্ত সুবিধা

- প্রথমবার Terms modal; সম্মতি `mpc_terms_v1` হিসেবে browser-এ রাখা হয়। শর্তের বাংলা মূল লেখাটি অপরিবর্তিত রাখা হয়েছে।
- Home order: Modify, Cut, Premium, Help & Telegram, Reviews & Comments.
- নতুন device ID-তে server-side free balance: Modify 20,000 এবং Cut 20,000 শব্দ। আলাদা balance; localStorage clear করলেই server balance reset হয় না।
- প্রতি request-এ সর্বোচ্চ 20,000 input words।
- India plans: ₹199 (100,000 + 100,000), ₹299 (180,000 + 180,000), ₹399 (250,000 + 250,000), PhonePe/Google Pay, 30 days.
- Bangladesh plans: ৳279 (100,000 + 100,000), ৳419 (180,000 + 180,000), ৳559 (250,000 + 250,000), bKash, 30 days.
- কোনো annual plan নেই এবং app-এ UPI/bKash নম্বর দেখানো হয় না। Transaction ID pending হিসেবে জমা হয়; admin approve না করলে Prime চালু হয় না। একই UTR/Transaction ID hash-এর unique Firestore document ও Firestore transaction দিয়ে duplicate জমা আটকানো হয়; দ্বিতীয়বার দিলে “এই UTR আগেই ব্যবহার হয়েছে।” দেখায়।
- Subscription expiry এবং per-feature premium balances server-এ থাকে না। এক feature-এর credit শেষ হলেও অন্য feature-এর balance আলাদা থাকে। Premium শেষ হলে free credits পুনরায় দেওয়া হয় না (`everPremium` flag)।
- Admin login-এ একই IP থেকে ১৫ মিনিটে ৫টি ভুল চেষ্টার পর সাময়িক rate limit প্রয়োগ করা হয়। Admin login server-side environment variable দিয়ে শুরু হয়; পরবর্তীতে Admin Panel থেকে পাসওয়ার্ড পরিবর্তন করলে নতুন পাসওয়ার্ডের scrypt hash Firestore-এ থাকে (plain password নয়), session version বদলে পুরোনো session বাতিল হয়; cookie HttpOnly, Secure, SameSite=Strict। Admin payment approve/reject, users দেখা, chat reply/clear, review approve/reject করতে পারে। Chat clear payment records মুছে না।
- Chat ও approved reviews Firestore-এ persist করে। Reviews admin approval ছাড়া public হয় না।
- Optional SMS via Twilio; credentials না দিলে SMS disabled থাকবে, কিন্তু payment request pending হিসেবে database-এ সংরক্ষিত হবে।
- Real AI Modify/Cut Google Gemini API দিয়ে চলে; `GEMINI_API_KEY` না থাকলে স্পষ্ট setup error দেখাবে।

## Deploy-এর আগে দরকারি সেটআপ

### 1. একই Vercel project
পুরোনো প্রজেক্টের deployment repository-তে এই ফোল্ডারের ফাইলগুলো আপডেট করুন; নতুন Vercel project বানাবেন না। Vercel-এ root directory এই প্রজেক্টের root রাখুন। `npm install` করে deploy দিন। পুরোনো Vercel URL একই থাকবে যদি existing project-এই redeploy করা হয়।

### 2. Firebase
এই অ্যাপ পুরোনো project ID `modifly-plus-cut`-এর Firestore ব্যবহার করতে পারে। Firebase Console → Project settings → Service accounts থেকে service-account JSON তৈরি করুন। JSON ফাইলটি কখনও GitHub বা chat-এ আপলোড করবেন না। Local terminal-এ base64 বানান:

```bash
base64 -w 0 service-account.json
```

Vercel → Project → Settings → Environment Variables-এ `FIREBASE_SERVICE_ACCOUNT_BASE64` নামে base64 value রাখুন। Windows PowerShell-এ base64 বানাতে:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

এই server-side SDK Firestore-এ access করে। Service account শুধু বিশ্বস্ত owner account-এ রাখুন; key leak হলে Firebase-এ key revoke করুন।

### 3. Admin password
Vercel Environment Variables-এ `ADMIN_PASSWORD` হিসেবে একটি শক্তিশালী admin password দিন, `OWNER_ACCESS_PASSWORD`-এ owner lifetime unlock password দিন (দুটো একই রাখতে চাইলে `OWNER_ACCESS_PASSWORD` ফাঁকা রাখলে `ADMIN_PASSWORD` fallback হবে), এবং `SESSION_SECRET`-এ random 32+ character secret দিন। পুরোনো HTML-এ থাকা password check সরিয়ে দেওয়া হয়েছে; password আর client code-এ নেই। পুরোনো password রাখতে চাইলে সেটি শুধু Vercel-এর `ADMIN_PASSWORD` environment variable-এ নিজে সেট করুন; নিরাপত্তার জন্য নতুন দীর্ঘ password নেওয়া উত্তম। Env variable বদলালে redeploy করুন। Admin Panel: অ্যাপের নিচের Admin বোতাম। অ্যাপের উপরে `Owner Unlock` দিয়ে owner password দিলে ওই device record-এ lifetime owner access চালু হবে; এই owner access কোনো 30-day package balance খরচ করবে না। একই password দিয়ে আপনার অন্য device-এও unlock করা যায়, তবে password গোপন রাখুন।

Admin Panel-এ লগইন করার পর Change Admin Password-এ বর্তমান পাসওয়ার্ড ও কমপক্ষে ১২ অক্ষরের নতুন পাসওয়ার্ড দিন। পরিবর্তনের পর পুরোনো admin session বাতিল হবে। শুরুতে `ADMIN_PASSWORD` অবশ্যই Vercel Environment Variables-এ সেট করতে হবে; কাউকে chat-এ পাঠাবেন না।

`SESSION_SECRET` তৈরি করার উদাহরণ:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 4. AI provider
Vercel Environment Variables-এ `GEMINI_API_KEY` দিন। ঐচ্ছিকভাবে `GEMINI_MODEL` সেট করুন; ডিফল্ট `gemini-2.5-flash`। Google AI Studio: https://aistudio.google.com/ । নির্বাচিত মডেলে ফ্রি quota থাকতে পারে, কিন্তু rate limit/availability পরিবর্তিত হতে পারে এবং unlimited free ব্যবহারের নিশ্চয়তা নেই। বড় গল্পে model-এর context/output সীমা থাকতে পারে; 20,000-word input limit মানেই সম্পূর্ণ গল্পের output নিশ্চিত নয়।

### 5. Owner SMS (ঐচ্ছিক)
SMS চালু করতে Vercel-এ `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `OWNER_PHONE_NUMBER` দিন। Twilio account/SMS সক্ষমতা ও destination country support লাগবে। Owner number বা secret source code-এ লিখবেন না। এগুলো সেট না করা পর্যন্ত অ্যাপ SMS পাঠাতে পারবে না।

### 6. Payment verification
এই build-এ UTR/Transaction ID **manual review workflow**: user request জমা দেয় → admin pending list-এ দেখে → payment provider app/statement-এ টাকা সত্যি এসেছে কি না নিজে যাচাই করে Approve/Reject করে। শুধু UTR-এর format দেখে payment verified করা হয় না। PhonePe/GPay/bKash-এর merchant/payment verification API credentials না থাকায় direct automatic provider verification দাবি করা হচ্ছে না।

## গুরুত্বপূর্ণ সীমাবদ্ধতা/সুরক্ষা

- Browser-based anonymous device ID ব্যবহার করা হয়েছে। এটি server-side usage ধরে রাখে এবং সাধারণ browser storage clear করলেও server balance মুছে না; কিন্তু browser/device ID মুছে ফেলা, অন্য browser, বা ID spoofing-এর বিরুদ্ধে এটি শক্তিশালী account authentication নয়। “এক ডিভাইসেই চিরতরে” নিশ্চয়তা দিতে login/OTP + server-side device enrollment/recovery policy যোগ করতে হবে।
- পুরোনো code-এর subscription expiry `localStorage`-এ ছিল; সেটি নির্ভরযোগ্য central record ছিল না। Firestore-এর পুরোনো `used_utrs` collection মুছে ফেলা হয় না, কিন্তু শুধু browser-এ থাকা পুরোনো expiry-কে নিরাপদে স্বয়ংক্রিয়ভাবে migrate করা সম্ভব নয়। Admin-কে পুরোনো UTR/statement মিলিয়ে existing customer-দের manually verify করতে হবে।
- Firebase project/database, Vercel env, AI provider, Twilio SMS ও payment provider credentials এই source package থেকে নিজে তৈরি/চালু করা যায় না; account owner-এর configuration দরকার।
- “সারা জীবন” ব্যবহার করার জন্য domain/Vercel/Firebase/API provider account সক্রিয় রাখতে হবে; free-tier quotas, hosting policy, API charges বা provider changes থাকলে এগুলো প্রভাব ফেলতে পারে। কোনো সফটওয়্যার হোস্টিং ও third-party service ছাড়া আজীবন চালু থাকার গ্যারান্টি দিতে পারে না।
- Terms-এর মূল বাংলা লেখা অপরিবর্তিত রাখা হয়েছে; Free Modify 20,000 এবং Free Cut 20,000—দুটিই server-side logic-এর সঙ্গে মিলিয়ে রাখা হয়েছে।

## API routes

- `GET /api/config`
- `GET /api/usage`
- `POST /api/ai` — `{ feature: "modify" | "cut", text }`
- `GET/POST /api/payment`
- `GET/POST /api/chat`
- `GET/POST /api/reviews`
- `POST /api/admin` — login/logout; `GET /api/admin` — admin data; `PATCH /api/admin` — approve/reject/reply; `DELETE /api/admin` — clear chat.

## Before public launch checklist

1. Firebase env set and test Firestore writes/reads.
2. Strong admin password and random session secret set.
3. AI key + billing set; test a short Bengali story.
4. Owner SMS credentials configured if SMS is needed.
5. Confirm the exact existing Vercel project is updated (not a separate project).
6. Test payment request, duplicate transaction ID, admin approve/reject, 30-day expiry, separate balances, chat/review persistence.
7. Consider user login/OTP before relying on device binding for paid subscriptions.