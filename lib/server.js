import crypto from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export function db() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!raw) throw new Error('Firebase is not configured: set FIREBASE_SERVICE_ACCOUNT_BASE64.');
    const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}
export { FieldValue };
export const PLANS = {
  IN: [
    { id:'in-299', country:'IN', currency:'INR', amount:299, modifyCredits:500000, cutCredits:500000, days:30, methods:['PhonePe','Google Pay'] },
    { id:'in-399', country:'IN', currency:'INR', amount:399, modifyCredits:700000, cutCredits:700000, days:30, methods:['PhonePe','Google Pay'] },
    { id:'in-499', country:'IN', currency:'INR', amount:499, modifyCredits:1000000, cutCredits:1000000, days:30, methods:['PhonePe','Google Pay'] }
  ],
  BD: [
    { id:'bd-419', country:'BD', currency:'BDT', amount:419, modifyCredits:500000, cutCredits:500000, days:30, methods:['bKash'] },
    { id:'bd-559', country:'BD', currency:'BDT', amount:559, modifyCredits:700000, cutCredits:700000, days:30, methods:['bKash'] },
    { id:'bd-699', country:'BD', currency:'BDT', amount:699, modifyCredits:1000000, cutCredits:1000000, days:30, methods:['bKash'] }
  ]
};
export const wordCount = s => (String(s || '').trim().match(/\S+/g) || []).length;
export const clean = (s, max=20000) => String(s ?? '').trim().slice(0,max);
export function json(res, status, data) { res.status(status).setHeader('Content-Type','application/json; charset=utf-8').send(JSON.stringify(data)); }
export function method(req, res, allowed) { if (!allowed.includes(req.method)) { res.setHeader('Allow', allowed.join(', ')); json(res,405,{error:'Method not allowed'}); return false; } return true; }
export function deviceId(req) {
 const id = String(req.headers['x-device-id'] || req.body?.deviceId || '').trim();
 if (!/^[a-zA-Z0-9_-]{20,100}$/.test(id)) return null;
 return id;
}
export function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(data).digest('base64url');
  return `${data}.${sig}`;
}
export async function adminPasswordRecord() {
  const d = db();
  const snap = await d.collection('systemSettings').doc('adminAuth').get();
  return snap.exists ? snap.data() : { passwordHash: null, version: 0 };
}
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
export function passwordMatches(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const got = crypto.scryptSync(String(password || ''), record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
export async function verifySession(req) {
  const token = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('mpc_admin='))?.slice('mpc_admin='.length);
  if (!token || !process.env.SESSION_SECRET) return false;
  const [data,sig] = token.split('.'); if (!data || !sig) return false;
  const expected = crypto.createHmac('sha256',process.env.SESSION_SECRET).update(data).digest();
  let actual; try { actual = Buffer.from(sig,'base64url'); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual,expected)) return false;
  try {
    const p=JSON.parse(Buffer.from(data,'base64url').toString());
    if (!(p.admin===true && p.exp>Date.now())) return false;
    const current = await adminPasswordRecord();
    return Number(p.version || 0) === Number(current.version || 0);
  } catch { return false; }
}
export async function sendOwnerSms(message) {
 const {TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, OWNER_PHONE_NUMBER} = process.env;
 if (![TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN,TWILIO_FROM_NUMBER,OWNER_PHONE_NUMBER].every(Boolean)) return {sent:false, reason:'SMS provider not configured'};
 const { default: twilio } = await import('twilio');
 await twilio(TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN).messages.create({body:message,from:TWILIO_FROM_NUMBER,to:OWNER_PHONE_NUMBER});
 return {sent:true};
}
export async function userRecord(id) {
 const d=db(), ref=d.collection('users').doc(id), snap=await ref.get();
 if (!snap.exists) {
   const initial={deviceId:id, modifyFree:20000, cutFree:20000, modifyPremium:0, cutPremium:0, everPremium:false, subscriptionExpiresAt:null, createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()};
   await ref.create(initial); return {...initial, createdAt:new Date().toISOString()};
 }
 const data=snap.data();
 // Cap existing never-premium free accounts at the current 20,000-per-feature limit without resetting consumed credits.
 if (!data.everPremium && ((data.modifyFree||0)>20000 || (data.cutFree||0)>20000)) {
   const patch={updatedAt:FieldValue.serverTimestamp()};
   if ((data.modifyFree||0)>20000) patch.modifyFree=20000;
   if ((data.cutFree||0)>20000) patch.cutFree=20000;
   await ref.update(patch);
   Object.assign(data,patch,{updatedAt:new Date().toISOString()});
 }
 return {id:snap.id,...data};
}
export function activePremium(user) { return user.ownerAccess===true || (user.everPremium===true && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt).getTime()>Date.now()); }