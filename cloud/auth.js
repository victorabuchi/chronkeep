// Signing in: passwords (scrypt), signed session values (cookie for the web, bearer token for the phone),
// the hand-over that finishes a browser sign-in inside the phone app, and Sign in with Google and Apple.
// The same design as Pursecast's sign-in, written for plain Node.
const crypto = require('crypto');

const SESSION_COOKIE = 'ck_session', SESSION_DAYS = 30, MIN_PASSWORD = 10;
const APP_SCHEME = 'chronkeep://auth';

const secret = () => {
  const v = process.env.SESSION_SECRET;
  if (!v || v.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)');
  return v;
};
const hmac = (data, label = '') => crypto.createHmac('sha256', secret()).update(label + data).digest('base64url');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---- sessions ----
function mintSession(userId) {
  const data = Buffer.from(JSON.stringify({ userId, exp: Date.now() + SESSION_DAYS * 86400000 })).toString('base64url');
  return `${data}.${hmac(data)}`;
}
function readSessionValue(value) {
  const [data, sig] = String(value || '').split('.');
  if (!data || !sig || !same(sig, hmac(data))) return null;
  try { const p = JSON.parse(Buffer.from(data, 'base64url').toString()); return typeof p.userId === 'string' && p.exp > Date.now() ? p.userId : null; } catch { return null; }
}
const cookiesOf = (header) => { const out = {}; for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } return out; };
// The signed-in person's id: from the bearer token the phone sends, or from the cookie.
function sessionUserId(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer (.+)$/i)?.[1];
  return readSessionValue(bearer || cookiesOf(req.headers.cookie)[SESSION_COOKIE]);
}
const cookie = (name, value, { maxAge, path = '/', sameSite = 'Lax' } = {}) => `${name}=${encodeURIComponent(value)}; HttpOnly; Path=${path}; SameSite=${sameSite}; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' || sameSite === 'None' ? '; Secure' : ''}`;
const sessionCookie = (userId) => cookie(SESSION_COOKIE, mintSession(userId), { maxAge: SESSION_DAYS * 86400 });
const clearCookie = (name = SESSION_COOKIE, path = '/') => cookie(name, '', { maxAge: 0, path });

// ---- passwords ----
const N = 16384, R = 8, P = 1, KEYLEN = 64;
const derive = (password, salt, n, r, p) => new Promise((res, rej) => crypto.scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return ['scrypt', N, R, P, salt.toString('base64url'), (await derive(password, salt, N, R, P)).toString('base64url')].join('$');
}
async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url'), key = await derive(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}
// Same cost as a real check, so an unknown email takes as long as a wrong password.
const burnPasswordCheck = (password) => verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86));

// ---- throttle: failed passwords per email, per process ----
const failures = new Map(), WINDOW = 15 * 60000, MAX_FAILURES = 8;
const recent = (k, now) => { const l = (failures.get(k) || []).filter((t) => now - t < WINDOW); failures.set(k, l); return l; };
const isThrottled = (k, now = Date.now()) => recent(k, now).length >= MAX_FAILURES;
const recordFailure = (k, now = Date.now()) => recent(k, now).push(now);
const clearFailures = (k) => failures.delete(k);

// ---- hand-over to the phone app (PKCE) ----
const mintHandoff = (userId, challenge) => { const data = Buffer.from(JSON.stringify({ u: userId, c: challenge, e: Date.now() + 120000 })).toString('base64url'); return `${data}.${hmac(data, 'handoff.')}`; };
function redeemHandoff(code, verifier) {
  const [data, sig] = String(code || '').split('.');
  if (!data || !sig || String(verifier || '').length < 32 || !same(sig, hmac(data, 'handoff.'))) return null;
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (typeof p.u !== 'string' || typeof p.c !== 'string' || p.e < Date.now()) return null;
    return same(crypto.createHash('sha256').update(verifier).digest('base64url'), p.c) ? p.u : null;
  } catch { return null; }
}
// a password reset link, good for 15 minutes
const mintReset = (userId) => { const data = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + 15 * 60000 })).toString('base64url'); return `${data}.${hmac(data, 'reset.')}`; };
function readReset(token) { const [data, sig] = String(token || '').split('.'); if (!data || !sig || !same(sig, hmac(data, 'reset.'))) return null; try { const p = JSON.parse(Buffer.from(data, 'base64url').toString()); return typeof p.u === 'string' && p.e > Date.now() ? p.u : null; } catch { return null; } }
const appReturn = (params) => `${APP_SCHEME}?${new URLSearchParams(params)}`;

// ---- where the app lives ----
const origin = (req) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || (process.env.NODE_ENV === 'production' ? 'https' : 'http')).split(',')[0].trim();
  return `${proto}://${host}`;
};

// ---- Sign in with Google ----
const googleReady = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const googleRedirect = (req) => `${origin(req)}/auth/google/callback`;
const googleAuthUrl = (req, state) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirect(req), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' })}`;
async function googleProfile(code, req) {
  const token = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirect(req), grant_type: 'authorization_code' }), signal: AbortSignal.timeout(15000) });
  if (!token.ok) return null;
  const { access_token } = await token.json();
  if (!access_token) return null;
  const me = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(15000) });
  if (!me.ok) return null;
  const p = await me.json();
  if (!p.sub || !p.email || p.email_verified !== true) return null;
  return { sub: p.sub, email: p.email.toLowerCase(), name: String(p.name || p.given_name || p.email.split('@')[0] || 'You').slice(0, 80) };
}

// ---- Sign in with Apple (web) ----
const appleReady = () => Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
const appleRedirect = (req) => `${origin(req)}/auth/apple/callback`;
const appleAuthUrl = (req, state) => `https://appleid.apple.com/auth/authorize?${new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID, redirect_uri: appleRedirect(req), response_type: 'code', response_mode: 'form_post', scope: 'name email', state })}`;
function appleClientSecret() {
  const key = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: process.env.APPLE_KEY_ID }), body = b64({ iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: process.env.APPLE_CLIENT_ID });
  return `${head}.${body}.${crypto.createSign('SHA256').update(`${head}.${body}`).sign({ key, dsaEncoding: 'ieee-p1363' }, 'base64url')}`;
}
const claims = (jwt) => { try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString()); } catch { return null; } };
async function appleProfile(code, req) {
  const res = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID, client_secret: appleClientSecret(), code, grant_type: 'authorization_code', redirect_uri: appleRedirect(req) }), signal: AbortSignal.timeout(15000) });
  if (!res.ok) { console.error('Apple token exchange failed', res.status, (await res.text()).slice(0, 200)); return null; }
  const c = claims((await res.json()).id_token);
  if (!c || c.iss !== 'https://appleid.apple.com' || c.aud !== process.env.APPLE_CLIENT_ID || !c.sub || !c.email || (c.email_verified !== true && c.email_verified !== 'true')) return null;
  return { sub: c.sub, email: c.email.toLowerCase() };
}

// ---- Sign in with Apple (iPhone app): the identity token is made for the app, so it is checked against Apple's keys ----
let keys = null;
async function appleKeys() {
  if (keys && Date.now() - keys.at < 3600000) return keys.list;
  const res = await fetch('https://appleid.apple.com/auth/keys', { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('Apple keys unavailable');
  keys = { at: Date.now(), list: (await res.json()).keys };
  return keys.list;
}
async function appleNativeProfile(identityToken, nonce) {
  const [h, p, s] = String(identityToken).split('.');
  if (!h || !p || !s || !nonce) return null;
  try {
    const head = JSON.parse(Buffer.from(h, 'base64url').toString());
    if (head.alg !== 'RS256') return null;
    const jwk = (await appleKeys()).find((k) => k.kid === head.kid);
    if (!jwk || !crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'))) return null;
    const c = claims(identityToken);
    if (c.iss !== 'https://appleid.apple.com' || c.aud !== (process.env.APPLE_APP_ID || 'com.victorabuchi.chronkeep') || !c.sub || !c.email || c.exp * 1000 < Date.now()) return null;
    if (c.email_verified !== true && c.email_verified !== 'true') return null;
    if (c.nonce !== crypto.createHash('sha256').update(nonce).digest('hex')) return null;
    return { sub: c.sub, email: c.email.toLowerCase() };
  } catch { return null; }
}

module.exports = { SESSION_COOKIE, MIN_PASSWORD, mintSession, sessionUserId, sessionCookie, clearCookie, cookie, cookiesOf, hashPassword, verifyPassword, burnPasswordCheck, isThrottled, recordFailure, clearFailures, mintHandoff, redeemHandoff, mintReset, readReset, appReturn, origin, googleReady, googleAuthUrl, googleProfile, appleReady, appleAuthUrl, appleProfile, appleNativeProfile, same };
