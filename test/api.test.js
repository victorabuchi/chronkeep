const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { startServer, sleep, today, plusDays } = require('./helpers');

describe('items, bin, profile', () => {
  let s; before(async () => (s = await startServer())); after(() => s.stop());
  it('creates, updates and deletes into the bin, then restores and purges', async () => {
    const a = (await s.api('POST', '/api/items', { type: 'todo', title: 'One' })).data;
    assert.equal((await s.api('PUT', '/api/items/' + a.id, { title: 'Two' })).data.title, 'Two');
    assert.equal((await s.api('DELETE', '/api/items/' + a.id)).status, 200);
    let st = await s.state(); assert.deepEqual([st.items.length, st.trash.length], [0, 1]);
    assert.equal((await s.api('POST', `/api/trash/${a.id}/restore`)).data.title, 'Two');
    assert.equal((await s.api('POST', '/api/trash/nope/restore')).status, 404);
    await s.api('DELETE', '/api/items/' + a.id);
    await s.api('DELETE', '/api/trash/' + a.id);
    st = await s.state(); assert.deepEqual([st.items.length, st.trash.length], [0, 0]);
  });
  it('validates the profile', async () => {
    assert.equal((await s.api('PUT', '/api/profile', { email: 'nope' })).status, 400);
    assert.equal((await s.api('PUT', '/api/profile', { phone: 'abc<script>' })).status, 400);
    assert.equal((await s.api('PUT', '/api/profile', { photo: 'http://evil/x.png' })).status, 400);
    const ok = await s.api('PUT', '/api/profile', { name: 'Victor', email: 'v@example.com', phone: '+358 40 123 4567' });
    assert.deepEqual([ok.status, ok.data.name], [200, 'Victor']);
  });
  it('exports without calendar links and deletes an account only on the right confirmation', async () => {
    assert.equal((await s.api('DELETE', '/api/account', { confirm: 'wrong' })).status, 400);
    const exp = (await s.api('GET', '/api/export')).data; assert.ok(Array.isArray(exp.items) && !JSON.stringify(exp).includes('"url"'));
    assert.equal((await s.api('DELETE', '/api/account', { confirm: 'v@example.com' })).status, 200);
    assert.equal((await s.state()).profile.name, '');
  });
});

describe('storage: backups and recovery', () => {
  it('backs up daily, restores, and refuses odd names', async () => {
    const s = await startServer();
    try {
      assert.ok((await s.api('GET', '/api/backups')).data.length >= 1);
      await s.api('POST', '/api/items', { type: 'todo', title: 'Keep' });
      const name = (await s.api('POST', '/api/backups')).data.name;
      await s.api('POST', '/api/items', { type: 'todo', title: 'Later' });
      assert.equal((await s.api('POST', `/api/backups/${name}/restore`)).status, 200);
      assert.deepEqual((await s.state()).items.map((i) => i.title), ['Keep']);
      for (const bad of ['..%2F..%2Fetc%2Fpasswd', 'nope', 'data-x.json']) assert.notEqual((await s.api('POST', `/api/backups/${bad}/restore`)).status, 200);
    } finally { await s.stop(); }
  });
  it('recovers from a damaged data file and keeps the damaged copy', async () => {
    const s = await startServer();
    await s.api('POST', '/api/items', { type: 'todo', title: 'Survivor' });
    await s.api('POST', '/api/backups');
    await s.stop();
    fs.writeFileSync(s.file, fs.readFileSync(s.file, 'utf8').slice(0, 60)); // cut in half
    const again = await startServer({ dir: s.dir });
    try {
      assert.deepEqual((await again.state()).items.map((i) => i.title), ['Survivor']);
      assert.ok(fs.readdirSync(s.dir).some((f) => f.startsWith('data.corrupt-')));
      assert.ok(!fs.readdirSync(s.dir).some((f) => f.endsWith('.tmp')));
    } finally { await again.stop(); }
  });
});

describe('access control', () => {
  let s; before(async () => (s = await startServer())); after(() => s.stop());
  it('refuses unexpected hosts and cross-site changes', async () => {
    // fetch ignores a custom Host header, so this one is a raw request
    const raw = (host) => new Promise((resolve) => http.get({ host: '127.0.0.1', port: s.port, path: '/api/state', headers: { Host: host } }, (res) => { res.resume(); resolve(res.statusCode); }));
    assert.equal(await raw('evil.com'), 421);
    assert.equal(await raw('localhost:' + s.port), 200);
    assert.equal((await s.api('POST', '/api/items', { type: 'todo', title: 'x' }, { Origin: 'http://evil.com' })).status, 403);
    assert.equal((await s.api('POST', '/api/items', { type: 'todo', title: 'ok' }, { Origin: s.base })).status, 200);
  });
  it('enforces PIN rules and never exposes the hash', async () => {
    assert.equal((await s.api('PUT', '/api/security', { pin: '123' })).status, 400);
    assert.equal((await s.api('PUT', '/api/security', { lan: true })).status, 400);
    assert.equal((await s.api('PUT', '/api/security', { pin: '482916' })).data.hasPin, true);
    const dump = JSON.stringify((await s.api('GET', '/api/state')).data);
    assert.ok(!dump.includes('salt') && !dump.includes('actionSecret'));
  });
});

describe('notification buttons', () => {
  let s, id; before(async () => { s = await startServer(); id = (await s.api('POST', '/api/items', { type: 'assignment', title: 'Act on me', date: plusDays(1), time: '23:59' })).data.id; }); after(() => s.stop());
  const token = (o) => { const secret = s.readData().security.actionSecret, p = Buffer.from(JSON.stringify(o)).toString('base64url'); return `${p}.${crypto.createHmac('sha256', secret).update(p).digest('base64url').slice(0, 24)}`; };
  it('snoozes, then marks done', async () => {
    assert.equal((await s.api('POST', '/api/act', { itemId: id, action: 'snooze', minutes: 15 })).data.ok, true);
    assert.ok(s.readData().snoozed[`${id}@${plusDays(1)}`] > Date.now());
    assert.equal((await s.api('POST', '/api/act', { itemId: id, action: 'done' })).status, 200);
    assert.equal((await s.state()).items[0].done, true);
    assert.equal((await s.api('POST', '/api/act', { itemId: 'nope', action: 'done' })).status, 404);
  });
  it('accepts signed phone links, and rejects forged or expired ones', async () => {
    const id2 = (await s.api('POST', '/api/items', { type: 'todo', title: 'Phone', date: plusDays(1) })).data.id;
    const good = token({ i: id2, d: plusDays(1), a: 'done', m: 1, e: Date.now() + 60000 });
    assert.equal((await s.api('POST', '/api/act/' + good)).status, 200);
    assert.equal((await s.api('POST', '/api/act/' + good + 'x')).status, 400);
    assert.equal((await s.api('POST', '/api/act/' + token({ i: id2, d: '', a: 'done', m: 1, e: Date.now() - 1000 }))).status, 400);
  });
});

describe('reminders engine', () => {
  it('repeats on the rule in force, and snooze pauses it and wakes it', async () => {
    const s = await startServer({ tick: 150 });
    try {
      const id = (await s.api('POST', '/api/items', { type: 'assignment', title: 'Nudge me', date: today(), time: '23:59', nudges: [{ from: 525600, every: 0.02 }] })).data.id;
      await sleep(2200);
      const count = async () => (await s.api('GET', '/api/notifications')).data.history.filter((h) => h.kind === 'repeat' && h.itemId === id).length;
      const before = await count(); assert.ok(before >= 2, `expected repeats, saw ${before}`);
      await s.api('POST', '/api/act', { itemId: id, action: 'snooze', minutes: 1 });
      await sleep(2000);
      assert.equal(await count(), before, 'no repeats while snoozed');
      const up = (await s.api('GET', '/api/notifications')).data.upcoming;
      assert.ok(up.some((u) => u.itemId === id && u.body === 'Snooze ends'));
      await s.api('POST', '/api/act', { itemId: id, action: 'done' });
      const done = await count(); await sleep(1500);
      assert.equal(await count(), done, 'no repeats once done');
    } finally { await s.stop(); }
  });
  it('a reminder already past when the item is saved stays quiet', async () => {
    const s = await startServer({ tick: 150 });
    try {
      await s.api('POST', '/api/items', { type: 'assignment', title: 'Soon', date: today(), time: '23:59', reminders: [4320, 1440] });
      await s.api('POST', '/api/items', { type: 'event', title: 'Past', date: plusDays(-3), time: '10:00', reminders: [10] });
      await sleep(1200);
      assert.equal((await s.api('GET', '/api/notifications')).data.history.filter((h) => h.kind === 'reminder').length, 0);
    } finally { await s.stop(); }
  });
  it('lists upcoming reminders in time order', async () => {
    const s = await startServer();
    try {
      await s.api('POST', '/api/items', { type: 'assignment', title: 'B', date: plusDays(3), time: '12:00', reminders: [1440, 60] });
      const up = (await s.api('GET', '/api/notifications')).data.upcoming.filter((u) => u.kind === 'reminder');
      assert.deepEqual(up.map((u) => u.body), ['Due in 1 day', 'Due in 1 hour']);
      assert.ok(up[0].at < up[1].at);
    } finally { await s.stop(); }
  });
});

describe('calendars: feeds, import, export', () => {
  let s, fx, fxBase, body;
  const ev = (uid, date, time, title = 'Lecture') => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${date.replace(/-/g, '')}T${time.replace(':', '')}00\r\nDTEND:${date.replace(/-/g, '')}T${String(+time.slice(0, 2) + 1).padStart(2, '0')}${time.slice(3)}00\r\nSUMMARY:${title}\r\nEND:VEVENT\r\n`;
  const cal = (...e) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${e.join('')}END:VCALENDAR\r\n`;
  before(async () => {
    s = await startServer(); body = cal(ev('a', plusDays(3), '10:00'), ev('b', plusDays(4), '12:00', 'Seminar'));
    fx = http.createServer((req, res) => { if (req.url === '/cal.ics') { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(body); } else if (req.url === '/page') { res.end('<html>login</html>'); } else { res.writeHead(404); res.end(); } });
    await new Promise((r) => fx.listen(0, '127.0.0.1', r)); fxBase = `http://127.0.0.1:${fx.address().port}`;
  });
  after(async () => { fx.close(); await s.stop(); });
  it('follows a link, updates, removes cancelled events and never brings back deleted ones', async () => {
    const add = await s.api('POST', '/api/feeds', { name: 'Timetable', url: fxBase + '/cal.ics', category: 'Timetable' });
    assert.equal(add.data.result.created, 2);
    assert.ok(!JSON.stringify((await s.api('GET', '/api/feeds')).data).includes('cal.ics'), 'the link is never sent to the page');
    const fid = add.data.feed.id;
    assert.deepEqual((await s.api('POST', `/api/feeds/${fid}/sync`)).data.result, { created: 0, updated: 0, removed: 0 });
    body = cal(ev('a', plusDays(3), '14:00', 'Lecture moved')); // a moved, b cancelled
    assert.deepEqual((await s.api('POST', `/api/feeds/${fid}/sync`)).data.result, { created: 0, updated: 1, removed: 1 });
    const only = (await s.state()).items[0]; assert.deepEqual([only.time, only.title], ['14:00', 'Lecture moved']);
    await s.api('DELETE', '/api/items/' + only.id);
    assert.equal((await s.api('POST', `/api/feeds/${fid}/sync`)).data.result.created, 0);
    assert.equal((await s.api('DELETE', `/api/feeds/${fid}?events=remove`)).data.ok, true);
  });
  it('refuses bad links with readable messages', async () => {
    const msg = async (url) => (await s.api('POST', '/api/feeds', { name: 'x', url })).data.error;
    assert.match(await msg('nonsense'), /not a web address/);
    assert.match(await msg(fxBase + '/page'), /did not return a calendar/);
    assert.match(await msg(fxBase + '/missing'), /404/);
    assert.match(await msg('file:///etc/passwd'), /http or https/);
    assert.equal((await s.api('GET', '/api/feeds')).data.length, 0);
  });
  it('imports a file once, exports only your own items', async () => {
    assert.equal((await s.api('POST', '/api/import', { name: 'g.ics', ics: cal(ev('g', plusDays(5), '09:00', 'Dentist')) })).data.created, 1);
    assert.equal((await s.api('POST', '/api/import', { name: 'g.ics', ics: cal(ev('g', plusDays(5), '09:00', 'Dentist')) })).data.created, 0);
    assert.equal((await s.api('POST', '/api/import', { name: 'x', ics: '<html>' })).status, 400);
    await s.api('POST', '/api/items', { type: 'assignment', title: 'Mine', date: plusDays(2), time: '23:59' });
    const out = (await s.api('GET', '/api/calendar.ics')).data;
    assert.ok(out.includes('SUMMARY:Mine') && !out.includes('Dentist'));
  });
});

describe('attachments', () => {
  let s, id; before(async () => { s = await startServer(); id = (await s.api('POST', '/api/items', { type: 'todo', title: 'Files' })).data.id; }); after(() => s.stop());
  const up = (name, data, type = 'text/plain') => fetch(`${s.base}/api/items/${id}/files?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': type }, body: data });
  it('stores under random ids, cleans names, serves safely', async () => {
    const meta = await (await up('../../etc/passwd', 'hello')).json();
    assert.equal(meta.name, 'passwd');
    assert.deepEqual(fs.readdirSync(path.join(s.dir, 'uploads', id)), [meta.id]);
    const html = await (await up('<x>.html', '<script>1</script>', 'text/html')).json();
    const r = await fetch(`${s.base}/api/files/${id}/${html.id}`);
    assert.equal(r.headers.get('content-type'), 'application/octet-stream');
    assert.match(r.headers.get('content-disposition'), /^attachment/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(`${s.base}/api/files/${id}/deadbeef`)).status, 404);
  });
  it('limits size, count and tampering', async () => {
    assert.equal((await up('e', '')).status, 400);
    assert.equal((await up('big', Buffer.alloc(11 * 1024 * 1024))).status, 413);
    assert.equal((await s.api('PUT', '/api/items/' + id, { attachments: [{ id: 'aaaaaaaa', name: 'x', size: 1, type: 'text/plain' }] })).data.attachments.some((a) => a.id === 'aaaaaaaa'), false);
    for (let i = 0; i < 12; i++) await up('f' + i, 'x');
    assert.equal((await s.state()).items[0].attachments.length, 10);
    assert.equal((await fetch(`${s.base}/api/items/${id}/files?name=x`, { method: 'POST', headers: { Origin: 'http://evil.com' }, body: 'x' })).status, 403);
  });
  it('removes files when an item is deleted for good', async () => {
    await s.api('DELETE', '/api/items/' + id); assert.ok(fs.existsSync(path.join(s.dir, 'uploads', id)));
    await s.api('DELETE', '/api/trash/' + id); assert.ok(!fs.existsSync(path.join(s.dir, 'uploads', id)));
  });
});

describe('repeating series', () => {
  it('"only this one" splits an occurrence out and the series skips that day', async () => {
    const s = await startServer();
    try {
      const orig = (await s.api('POST', '/api/items', { type: 'event', title: 'Gym', date: plusDays(1), time: '07:00', endTime: '08:00', repeat: 'daily' })).data;
      const occ = plusDays(3);
      const r = (await s.api('POST', `/api/items/${orig.id}/occurrence`, { occ, patch: { title: 'Gym special', time: '09:00' } })).data;
      assert.deepEqual([r.original.skip, r.created.title, r.created.repeat, r.created.date, r.created.time], [[occ], 'Gym special', 'none', occ, '09:00']);
      assert.equal((await s.api('POST', `/api/items/${r.created.id}/occurrence`, { occ })).status, 400); // not a series
    } finally { await s.stop(); }
  });
});
