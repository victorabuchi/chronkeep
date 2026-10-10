// ChronKeep in the cloud: many people, each with their own account, on one server.
//   node cloud/server.js      (needs DATABASE_URL and SESSION_SECRET, see cloud/README.md)
// The web app (public/) is served to signed-in people at /app, the phone app talks to /api/sync.
// Local runs read .env (on Render the settings come from the dashboard instead).
try { for (const line of require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)="?(.*?)"?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch { /* no .env */ }
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const auth = require('./auth');
const pages = require('./pages');
const mail = require('./mail');
const { createApi, MAX_FILE } = require('../lib/api');
const { send, readBody, types } = require('../lib/http');
const { defaults, normalize } = require('../lib/model');
const { stamp, changesSince, applyChanges } = require('../lib/sync');

const PUBLIC = path.join(__dirname, '..', 'public'), SITE = path.join(__dirname, '..', 'site');
const { assembleApp } = require('../lib/assets');
const HOME = '/app';
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// ---- each person's document, kept in memory while they are active and written after every change ----
const live = new Map(); // userId -> { doc, at }
async function docOf(userId) {
  let e = live.get(userId);
  if (!e) {
    const doc = await db.loadDoc(userId);
    if (!doc) return null;
    e = { doc, at: Date.now() };
    live.set(userId, e);
    if (live.size > 300) for (const [id, v] of live) if (Date.now() - v.at > 600000) live.delete(id);
    // one backup a day, taken the first time they are seen that day
    db.backupNow(userId, doc, today()).catch(() => {});
  }
  e.at = Date.now();
  return e;
}

const redirect = (res, to, headers = {}) => { res.writeHead(302, { Location: to, ...headers }); res.end(); };
const html = (res, body, code = 200) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); };
const readForm = async (req) => {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 100000) break; chunks.push(c); }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
};
const back = (res, path, params) => redirect(res, `${path}?${new URLSearchParams(params)}`);
const emailOf = (v) => String(v || '').trim().toLowerCase().slice(0, 254);
const sameOriginOk = (req) => { const o = req.headers.origin; return !o || (() => { try { return new URL(o).host === String(req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim(); } catch { return false; } })(); };

// ---- signing up and in ----
async function signUp({ name, email, password }) {
  const secretHash = await auth.hashPassword(password);
  return db.createUser({ email, name, provider: 'password', subject: email, secretHash });
}
async function passwordSignIn(email, password) {
  const idt = await db.identity('password', email);
  if (!idt) { await auth.burnPasswordCheck(password); return null; }
  if (!(await auth.verifyPassword(password, idt.secret_hash))) return null;
  await db.touchIdentity(idt.id, idt.user_id);
  return idt.user_id;
}
// Google or Apple: the same verified email joins the existing account, otherwise a new one is made.
async function providerSignIn(provider, subject, email, name) {
  const idt = await db.identity(provider, subject);
  if (idt) { await db.touchIdentity(idt.id, idt.user_id); return idt.user_id; }
  let user = await db.userByEmail(email);
  if (!user) user = await db.createUser({ email, name: (name || email.split('@')[0] || 'You').slice(0, 80), provider, subject });
  else { await db.addIdentity(user.id, provider, subject); await db.q('update users set last_sign_in_at = now() where id = $1', [user.id]); }
  return user.id;
}

const stateCookieOptions = (provider) => ({ maxAge: 600, path: `/auth/${provider}`, sameSite: provider === 'apple' ? 'None' : 'Lax' });

async function authRoutes(req, res, url) {
  const p = url.pathname;
  if (p === '/auth/signup' && req.method === 'POST') {
    const f = await readForm(req), name = String(f.name || '').trim().slice(0, 80), email = emailOf(f.email), password = String(f.password || '');
    if (f.website) return back(res, '/signup', { error: 'missing' });
    if (!name || !email.includes('@')) return back(res, '/signup', { error: 'missing', name, email });
    if (password.length < auth.MIN_PASSWORD) return back(res, '/signup', { error: 'short', name, email });
    if (await db.userByEmail(email)) return back(res, '/signup', { error: 'taken', name, email });
    let user; try { user = await signUp({ name, email, password }); } catch { return back(res, '/signup', { error: 'taken', name, email }); }
    return redirect(res, HOME, { 'Set-Cookie': auth.sessionCookie(user.id) });
  }
  if (p === '/auth/login' && req.method === 'POST') {
    const f = await readForm(req), email = emailOf(f.email), password = String(f.password || '');
    if (!email || !password) return back(res, '/login', { error: 'missing', email });
    if (auth.isThrottled(email)) return back(res, '/login', { error: 'throttled', email });
    const id = await passwordSignIn(email, password);
    if (id) { auth.clearFailures(email); return redirect(res, HOME, { 'Set-Cookie': auth.sessionCookie(id) }); }
    auth.recordFailure(email);
    return back(res, '/login', { error: 'invalid', email });
  }
  if (p === '/auth/logout' && req.method === 'POST') return redirect(res, '/', { 'Set-Cookie': auth.clearCookie() });
  // password reset by email
  if (p === '/auth/forgot' && req.method === 'POST') {
    const email = emailOf((await readForm(req)).email), user = email && (await db.userByEmail(email));
    if (user && (await db.identity('password', email))) {
      await mail.sendReset(email, `${auth.origin(req)}/reset?token=${encodeURIComponent(auth.mintReset(user.id))}`);
    }
    return redirect(res, '/forgot?sent=1');
  }
  if (p === '/auth/reset' && req.method === 'POST') {
    const f = await readForm(req), userId = auth.readReset(f.token), password = String(f.password || '');
    if (!userId) return redirect(res, '/forgot?error=reset');
    if (password.length < auth.MIN_PASSWORD) return redirect(res, `/reset?token=${encodeURIComponent(f.token)}&error=short`);
    const user = await db.userById(userId);
    if (!user) return redirect(res, '/forgot?error=reset');
    const secretHash = await auth.hashPassword(password);
    await db.q(`insert into auth_identities (user_id, provider, subject, secret_hash, last_used_at) values ($1,'password',$2,$3, now()) on conflict (provider, subject) do update set secret_hash = excluded.secret_hash, last_used_at = now()`, [user.id, user.email, secretHash]);
    return redirect(res, HOME, { 'Set-Cookie': auth.sessionCookie(user.id) });
  }
  // Sign in with Google / Apple. A phone app opens these with ?intent=mobile&challenge=… and gets the answer at chronkeep://auth.
  for (const provider of ['google', 'apple']) {
    const ready = provider === 'google' ? auth.googleReady : auth.appleReady;
    const profile = provider === 'google' ? auth.googleProfile : auth.appleProfile;
    const urlOf = provider === 'google' ? auth.googleAuthUrl : auth.appleAuthUrl;
    if (p === `/auth/${provider}` && req.method === 'GET') {
      const mobile = url.searchParams.get('intent') === 'mobile', challenge = mobile ? String(url.searchParams.get('challenge') || '').slice(0, 100) : null;
      if (!ready()) return redirect(res, mobile ? auth.appReturn({ error: `${provider === 'google' ? 'Google' : 'Apple'} sign-in did not finish. Try again.` }) : `/login?error=${provider}`);
      const state = `${mobile ? 'app.' : ''}${crypto.randomBytes(24).toString('base64url')}`;
      const opts = stateCookieOptions(provider), cookies = [auth.cookie(`ck_${provider}`, state, opts)];
      if (mobile) cookies.push(auth.cookie(`ck_${provider}_app`, challenge, opts));
      return redirect(res, urlOf(req, state), { 'Set-Cookie': cookies });
    }
    if (p === `/auth/${provider}/callback` && ((provider === 'google' && req.method === 'GET') || (provider === 'apple' && req.method === 'POST'))) {
      const form = provider === 'apple' ? await readForm(req) : Object.fromEntries(url.searchParams);
      const jar = auth.cookiesOf(req.headers.cookie), expected = jar[`ck_${provider}`] || '', challenge = jar[`ck_${provider}_app`] || '';
      const clear = [auth.clearCookie(`ck_${provider}`, `/auth/${provider}`), auth.clearCookie(`ck_${provider}_app`, `/auth/${provider}`)];
      const state = String(form.state || ''), code = String(form.code || ''), fromApp = state.startsWith('app.');
      const fail = () => redirect(res, fromApp ? auth.appReturn({ error: `${provider === 'google' ? 'Google' : 'Apple'} sign-in did not finish. Try again.` }) : `/login?error=${provider}`, { 'Set-Cookie': clear });
      if (!ready() || !code || !expected || !auth.same(state, expected)) return fail();
      const who = await profile(code, req);
      if (!who) return fail();
      let name = who.name || '';
      if (provider === 'apple') { try { const u = JSON.parse(form.user || '{}'); name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' ').trim(); } catch { name = ''; } }
      const userId = await providerSignIn(provider, who.sub, who.email, name);
      if (fromApp) return redirect(res, auth.appReturn(challenge ? { code: auth.mintHandoff(userId, challenge) } : { token: auth.mintSession(userId) }), { 'Set-Cookie': clear });
      return redirect(res, HOME, { 'Set-Cookie': [...clear, auth.sessionCookie(userId)] });
    }
  }
  return false;
}

// ---- the phone app's sign-in ----
async function mobileRoutes(req, res, url) {
  const p = url.pathname;
  // which sign-in buttons the phone should show
  if (p === '/api/mobile/providers' && req.method === 'GET') return send(res, 200, { google: auth.googleReady(), apple: auth.appleReady() }), true;
  if (p === '/api/mobile/login' && req.method === 'POST') {
    const b = await readBody(req), email = emailOf(b.email), password = String(b.password || '');
    if (!email || !password) return send(res, 400, { error: 'Enter your email address and password.' }), true;
    if (auth.isThrottled(email)) return send(res, 429, { error: 'Too many attempts. Wait a few minutes.' }), true;
    const id = await passwordSignIn(email, password);
    if (id) { auth.clearFailures(email); return send(res, 200, { token: auth.mintSession(id) }), true; }
    auth.recordFailure(email);
    return send(res, 401, { error: 'That email and password do not match.' }), true;
  }
  if (p === '/api/mobile/signup' && req.method === 'POST') {
    const b = await readBody(req), name = String(b.name || '').trim().slice(0, 80), email = emailOf(b.email), password = String(b.password || '');
    if (!name || !email.includes('@')) return send(res, 400, { error: 'Enter your name and email address.' }), true;
    if (password.length < auth.MIN_PASSWORD) return send(res, 400, { error: `Use at least ${auth.MIN_PASSWORD} characters for your password.` }), true;
    if (await db.userByEmail(email)) return send(res, 409, { error: 'There is already an account with that email. Log in instead.' }), true;
    try { const u = await signUp({ name, email, password }); return send(res, 200, { token: auth.mintSession(u.id) }), true; } catch { return send(res, 409, { error: 'There is already an account with that email.' }), true; }
  }
  if (p === '/api/mobile/apple' && req.method === 'POST') {
    const b = await readBody(req), who = await auth.appleNativeProfile(String(b.identityToken || ''), String(b.nonce || ''));
    if (!who) return send(res, 401, { error: 'Apple sign-in did not finish. Try again.' }), true;
    const id = await providerSignIn('apple', who.sub, who.email, String(b.name || '').trim());
    return send(res, 200, { token: auth.mintSession(id) }), true;
  }
  if (p === '/api/mobile/exchange' && req.method === 'POST') {
    const b = await readBody(req), id = auth.redeemHandoff(String(b.code || ''), String(b.verifier || ''));
    if (!id || !(await db.userById(id))) return send(res, 401, { error: 'That sign-in did not finish. Try again.' }), true;
    return send(res, 200, { token: auth.mintSession(id) }), true;
  }
  return false;
}

// ---- a signed-in person's data ----
async function apiRoutes(req, res, url, userId) {
  const entry = await docOf(userId);
  if (!entry) { res.setHeader('Set-Cookie', auth.clearCookie()); return send(res, 401, { error: 'Sign in required' }); }
  const user = await db.userById(userId);
  const p = url.pathname;
  let doc = () => entry.doc, dirty = false;
  const ctx = {
    getDb: () => entry.doc,
    // a restore or reset swaps the whole document; the sync bookkeeping stays so deletions are noticed
    setDb: (next) => { next.sync = entry.doc.sync; entry.doc = next; },
    save: () => { dirty = true; },
    prime: () => {},
    state: () => ({ cloud: { id: user.id, email: user.email, name: user.name } }),
    files: {
      put: (item, att, data) => db.filePut(userId, item, att, data),
      get: (item, att) => db.fileGet(userId, item, att),
      remove: (item, att) => db.fileRemove(userId, item, att),
      removeAll: (ids) => db.filesRemoveFor(userId, ids),
    },
    backups: {
      list: () => db.backupList(userId),
      now: (label) => db.backupNow(userId, entry.doc, label),
      read: (name) => db.backupRead(userId, name),
    },
  };
  const finish = async () => { if (dirty) { stamp(entry.doc); await db.saveDoc(userId, entry.doc); dirty = false; } };
  void doc;

  if (p === '/api/logout' && req.method === 'POST') { res.setHeader('Set-Cookie', auth.clearCookie()); return send(res, 200, { ok: true }); }
  if (p === '/api/me' && req.method === 'GET') return send(res, 200, { id: user.id, email: user.email, name: user.name });
  // Devices send what changed and the revision they last saw; they get back what changed since.
  if (p === '/api/sync' && req.method === 'POST') {
    const b = await readBody(req, 40 * 1024 * 1024), since = Number(b.cursor) || 0;
    const { stale } = applyChanges(entry.doc, b.changes || {});
    stamp(entry.doc); await db.saveDoc(userId, entry.doc);
    return send(res, 200, { ...changesSince(entry.doc, since), stale, serverTime: Date.now() });
  }
  if (p === '/api/account' && req.method === 'DELETE') {
    const want = (user.email || 'DELETE').toLowerCase();
    if (String((await readBody(req)).confirm || '').trim().toLowerCase() !== want) return send(res, 400, { error: 'The confirmation did not match.' });
    await db.deleteUser(userId); live.delete(userId);
    res.setHeader('Set-Cookie', auth.clearCookie());
    return send(res, 200, { ok: true });
  }
  if (p === '/api/export' && req.method === 'GET') {
    const d = entry.doc;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="chronkeep-export-${today()}.json"` });
    return res.end(JSON.stringify({ exportedAt: new Date().toISOString(), profile: d.profile, settings: d.settings, items: d.items, notepad: d.notepad, bin: d.trash, calendars: d.feeds.map((f) => ({ id: f.id, name: f.name, category: f.category, enabled: f.enabled, lastSync: f.lastSync, count: f.count })) }, null, 2));
  }
  const api = createApi(ctx);
  const handled = await api.handle(req, res, url);
  await finish();
  return handled;
}

// ---- files ----
const serveFile = (res, file) => {
  if (!file.startsWith(PUBLIC) && !file.startsWith(SITE)) { res.writeHead(404); return res.end('Not found'); }
  let stat; try { stat = fs.statSync(file); } catch { res.writeHead(404); return res.end('Not found'); }
  if (stat.isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
};
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };

const handler = async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://x'), p = url.pathname, q = Object.fromEntries(url.searchParams);
  try {
    if (p === '/healthz') return send(res, 200, { ok: true });
    // Changes must come from this site's own pages or from an app (which sends no Origin).
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOriginOk(req) && !/^\/auth\/apple\/callback$/.test(p)) { res.writeHead(403); return res.end('Cross-site request refused'); }
    const userId = auth.sessionUserId(req);

    if (p.startsWith('/auth/') && (await authRoutes(req, res, url)) !== false) return;
    if (p.startsWith('/api/mobile/') && (await mobileRoutes(req, res, url))) return;
    if (p.startsWith('/api/')) {
      if (!userId) return send(res, 401, { error: 'Sign in required' });
      await apiRoutes(req, res, url, userId);
      if (!res.headersSent) send(res, 404, {});
      return;
    }

    // pages
    if (p === '/') return html(res, fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'));
    if (['/login', '/signup', '/forgot'].includes(p)) { if (userId && p !== '/forgot') return redirect(res, HOME); return html(res, p === '/login' ? pages.loginPage(q) : p === '/signup' ? pages.signupPage(q) : pages.forgotPage(q)); }
    if (p === '/reset') return html(res, pages.resetPage(q.token || '', q));
    if (p === '/privacy') return html(res, pages.privacyPage());
    if (p === '/terms') return html(res, pages.termsPage());
    if (p === '/app' || p === '/app/') { if (!userId) return redirect(res, '/login'); res.setHeader('Cache-Control', 'no-store'); return serveFile(res, path.join(PUBLIC, 'index.html')); }
    if (p === '/app.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }); return res.end(assembleApp(path.join(PUBLIC, 'js'))); }
    if (p.startsWith('/site/')) return serveFile(res, path.join(SITE, p.slice(6)));
    if (['/index.html', '/login.html'].includes(p)) { res.writeHead(404); return res.end('Not found'); }
    return serveFile(res, path.join(PUBLIC, p));
  } catch (e) {
    console.error(req.method, p, e);
    if (!res.headersSent) send(res, 500, { error: 'Something went wrong on our side. Try again.' });
  }
};

async function start() {
  await db.connect();
  const port = process.env.PORT || 3000;
  const server = http.createServer(handler);
  server.listen(port, () => console.log(`ChronKeep cloud on port ${port}`));
  return server;
}
if (require.main === module) start().catch((e) => { console.error(e); process.exit(1); });
module.exports = { start, handler };
