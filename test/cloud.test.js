// The cloud server against a real Postgres. Skipped unless TEST_DATABASE_URL is set, for example
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/chronkeep_test npm test
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_;

describe('cloud server', { skip }, () => {
  let server, base, db;
  const uniq = () => crypto.randomBytes(4).toString('hex');
  before(async () => {
    process.env.SESSION_SECRET = 'x'.repeat(40); process.env.DATABASE_URL = URL_; process.env.APP_URL = '';
    db = require('../cloud/db'); await db.connect(URL_);
    const { handler } = require('../cloud/server');
    server = http.createServer(handler); await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { server.close(); await db.close(); });

  const call = async (method, p, { body, token, cookie, form } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + p, { method, headers, body: payload, redirect: 'manual' });
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers, location: res.headers.get('location'), cookie: (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ') };
  };
  const signup = async (email = `u${uniq()}@example.com`, name = 'Test Person') => {
    const r = await call('POST', '/api/mobile/signup', { body: { name, email, password: 'correct horse battery' } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); return { email, token: r.data.token };
  };

  it('serves the pages and refuses the app and the api without signing in', async () => {
    for (const p of ['/', '/login', '/signup', '/privacy', '/terms', '/forgot']) assert.equal((await call('GET', p)).status, 200, p);
    assert.equal((await call('GET', '/app')).location, '/login');
    assert.equal((await call('GET', '/api/state')).status, 401);
    assert.equal((await call('GET', '/healthz')).status, 200);
  });

  it('signs up on the web with a form, lands in the app, and can sign out and in again', async () => {
    const email = `w${uniq()}@example.com`;
    const bad = await call('POST', '/auth/signup', { form: { name: 'W', email, password: 'short' } });
    assert.match(bad.location, /error=short/);
    const ok = await call('POST', '/auth/signup', { form: { name: 'Web Person', email, password: 'correct horse battery' } });
    assert.equal(ok.location, '/app'); assert.match(ok.cookie, /ck_session=/);
    const state = await call('GET', '/api/state', { cookie: ok.cookie });
    assert.equal(state.status, 200); assert.equal(state.data.cloud.email, email); assert.equal(state.data.profile.name, 'Web Person');
    assert.equal((await call('GET', '/app', { cookie: ok.cookie })).status, 200);
    assert.match((await call('POST', '/auth/signup', { form: { name: 'W', email, password: 'correct horse battery' } })).location, /error=taken/);
    assert.match((await call('POST', '/auth/login', { form: { email, password: 'wrong wrong wrong' } })).location, /error=invalid/);
    const again = await call('POST', '/auth/login', { form: { email: email.toUpperCase(), password: 'correct horse battery' } });
    assert.equal(again.location, '/app');
  });

  it('keeps each person\'s data apart', async () => {
    const a = await signup(), b = await signup();
    const item = (await call('POST', '/api/items', { token: a.token, body: { type: 'todo', title: 'Mine' } })).data;
    assert.equal((await call('GET', '/api/state', { token: a.token })).data.items.length, 1);
    assert.equal((await call('GET', '/api/state', { token: b.token })).data.items.length, 0);
    assert.equal((await call('PUT', '/api/items/' + item.id, { token: b.token, body: { title: 'Stolen' } })).status, 404);
  });

  it('does the whole item lifecycle through the shared routes, saved to Postgres', async () => {
    const { token } = await signup();
    const a = (await call('POST', '/api/items', { token, body: { type: 'assignment', title: 'Report', date: '2026-10-20', time: '23:59' } })).data;
    await call('PUT', '/api/items/' + a.id, { token, body: { title: 'Report v2' } });
    await call('DELETE', '/api/items/' + a.id, { token });
    let st = (await call('GET', '/api/state', { token })).data; assert.deepEqual([st.items.length, st.trash.length], [0, 1]);
    await call('POST', `/api/trash/${a.id}/restore`, { token });
    st = (await call('GET', '/api/state', { token })).data; assert.equal(st.items[0].title, 'Report v2');
    const up = await fetch(`${base}/api/items/${a.id}/files?name=notes.txt`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: 'hello file' });
    const meta = await up.json(); assert.equal(meta.size, 10);
    const got = await fetch(`${base}/api/files/${a.id}/${meta.id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(await got.text(), 'hello file');
    assert.ok((await call('GET', '/api/backups', { token })).data.length >= 1, 'a daily backup exists');
  });

  it('syncs two devices: changes, deletions, bin and settings', async () => {
    const { token } = await signup();
    const now = Date.now() + 50, item = (id, title, at) => ({ id, type: 'todo', title, notes: '', date: '', time: '', done: false, doneOn: [], reminders: [], nudges: [], repeat: 'none', category: '', updatedAt: at });
    // phone pushes two items and a new accent
    const p1 = (await call('POST', '/api/sync', { token, body: { cursor: 0, changes: { items: [item('p1', 'From phone', now), item('p2', 'Second', now)], parts: { settings: { value: { accent: '#112233' }, updatedAt: now } } } } })).data;
    assert.ok(p1.cursor > 0);
    // the web sees them
    const web = (await call('GET', '/api/state', { token })).data;
    assert.deepEqual(web.items.map((i) => i.title).sort(), ['From phone', 'Second']); assert.equal(web.settings.accent, '#112233');
    // the web edits one and deletes another (through the normal routes)
    await call('PUT', '/api/items/p1', { token, body: { title: 'Edited on web' } });
    await call('DELETE', '/api/items/p2', { token });
    await call('DELETE', '/api/trash/p2', { token });
    // the phone asks what changed since its cursor
    const pull = (await call('POST', '/api/sync', { token, body: { cursor: p1.cursor, changes: {} } })).data;
    assert.deepEqual(pull.items.map((i) => i.title), ['Edited on web']);
    assert.deepEqual(pull.tombstones.map((t) => t.id), ['p2']);
    // an older offline edit loses
    const late = (await call('POST', '/api/sync', { token, body: { cursor: pull.cursor, changes: { items: [item('p1', 'Old offline edit', now - 5000)] } } })).data;
    assert.deepEqual(late.stale, ['p1']);
    assert.equal((await call('GET', '/api/state', { token })).data.items[0].title, 'Edited on web');
  });

  it('tells the phone which sign-in buttons to show', async () => {
    const r = await call('GET', '/api/mobile/providers');
    assert.deepEqual(Object.keys(r.data).sort(), ['apple', 'google']);
  });

  it('signs a phone in by password, and by the browser hand-over', async () => {
    const { email } = await signup();
    const login = await call('POST', '/api/mobile/login', { body: { email, password: 'correct horse battery' } });
    assert.equal(login.status, 200); assert.equal((await call('GET', '/api/me', { token: login.data.token })).data.email, email);
    assert.equal((await call('POST', '/api/mobile/login', { body: { email, password: 'nope nope nope' } })).status, 401);
    const auth = require('../cloud/auth'), id = (await call('GET', '/api/me', { token: login.data.token })).data.id;
    const verifier = crypto.randomBytes(32).toString('base64url'), challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const code = auth.mintHandoff(id, challenge);
    assert.equal((await call('POST', '/api/mobile/exchange', { body: { code, verifier: crypto.randomBytes(32).toString('base64url') } })).status, 401);
    assert.equal((await call('POST', '/api/mobile/exchange', { body: { code, verifier } })).status, 200);
  });

  it('resets a password with a signed link', async () => {
    const { email } = await signup(), auth = require('../cloud/auth'), db2 = require('../cloud/db');
    const user = await db2.userByEmail(email), token = auth.mintReset(user.id);
    assert.equal((await call('POST', '/auth/reset', { form: { token: 'bad', password: 'a brand new password' } })).location, '/forgot?error=reset');
    assert.equal((await call('POST', '/auth/reset', { form: { token, password: 'a brand new password' } })).location, '/app');
    assert.equal((await call('POST', '/api/mobile/login', { body: { email, password: 'a brand new password' } })).status, 200);
    assert.equal((await call('POST', '/api/mobile/login', { body: { email, password: 'correct horse battery' } })).status, 401);
  });

  it('exports, and deletes the account only on the right confirmation', async () => {
    const { token, email } = await signup();
    assert.equal((await call('GET', '/api/export', { token })).data.profile.email, email);
    assert.equal((await call('DELETE', '/api/account', { token, body: { confirm: 'wrong' } })).status, 400);
    assert.equal((await call('DELETE', '/api/account', { token, body: { confirm: email } })).status, 200);
    assert.equal((await call('GET', '/api/state', { token })).status, 401);
    assert.equal((await call('POST', '/api/mobile/login', { body: { email, password: 'correct horse battery' } })).status, 401);
  });

  it('refuses cross-site changes', async () => {
    const res = await fetch(base + '/auth/login', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a@b.c&password=x', redirect: 'manual' });
    assert.equal(res.status, 403);
  });
});
