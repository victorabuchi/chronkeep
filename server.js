// ChronKeep server: zero dependencies. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 3000;
const store = require('./lib/store');
const auth = require('./lib/auth');
const autostart = require('./lib/autostart');
const ics = require('./lib/ics');
const desktop = require('./lib/desktop');
const { assembleApp } = require('./lib/assets');
const calsync = require('./lib/calsync');
const Recur = require('./public/recur.js'); // the page uses the same file, so both agree on which days an item appears
const DATA = process.env.CHRONKEEP_DATA || path.join(__dirname, 'data.json');
const PUBLIC = path.join(__dirname, 'public');

const { defaults, normalize } = require('./lib/model');

const loaded = store.load(DATA);
if (loaded.keptAs) console.error(`data.json was damaged. It was kept as ${path.basename(loaded.keptAs)}${loaded.recoveredFrom ? ` and ${loaded.recoveredFrom} was loaded instead` : ' and no backup could be used, so ChronKeep started empty'}.`);
let db = normalize(loaded.data || {});
store.dailyBackup(DATA);
const save = () => store.save(DATA, db);
save();

// ---- attachments: files kept next to the data file, never inside the web folder ----
const UPLOADS = path.join(path.dirname(DATA), 'uploads');
const purgeFiles = (id) => fs.rmSync(path.join(UPLOADS, id), { recursive: true, force: true });
const { createApi } = require('./lib/api');
const api = createApi({
  getDb: () => db,
  setDb: (next) => { db = next; },
  save: () => save(),
  prime: (item) => prime(item),
  state: () => ({ security: secInfo(), mac: macStatus }),
  files: {
    async put(id, att, data) { fs.mkdirSync(path.join(UPLOADS, id), { recursive: true }); fs.writeFileSync(path.join(UPLOADS, id, att), data); },
    async get(id, att) { const f = path.join(UPLOADS, id, att); return fs.existsSync(f) ? fs.readFileSync(f) : null; },
    async remove(id, att) { fs.rmSync(path.join(UPLOADS, id, att), { force: true }); },
    async removeAll(ids) { ids.forEach(purgeFiles); },
  },
  backups: {
    async list() { return store.list(DATA); },
    async now(label) { return store.backupNow(DATA, label); },
    async read(name) { return store.readBackup(DATA, name); },
  },
});
const { syncFeed } = api;

// ---- notifications ----
// Mac popups come from a tiny ChronKeep.app (see mac/) so they show our icon and name.
// One at a time, because the app reads its message from a file. Falls back to a plain
// script notification if the app is missing.
const NOTIFIER = path.join(os.homedir(), 'Library/Application Support/ChronKeep/ChronKeep.app');
const NOTE_FILE = path.join(os.homedir(), 'Library/Caches/ChronKeep/notify.txt');
let macQueue = Promise.resolve();
const NATIVE = path.join(NOTIFIER, 'Contents/MacOS/ChronKeep');
let macStatus = 'unknown'; // 'ok' | 'denied' | 'unknown'
const oneLine = (t) => String(t).replace(/\s+/g, ' ').trim();
const runNative = (args) => new Promise((res) => execFile(NATIVE, args, { timeout: 15000 }, (err) => res(err ? (typeof err.code === 'number' ? err.code : 1) : 0)));
async function checkMac() {
  if (process.platform !== 'darwin' || !fs.existsSync(NATIVE)) return (macStatus = 'unknown');
  const c = await runNative(['--check']);
  return (macStatus = c === 0 ? 'ok' : c === 3 ? 'denied' : 'unknown');
}
function plainNotify(title, body) {
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  execFile('osascript', ['-e', `display notification "${esc(body)}" with title "${esc(title)}" sound name "Glass"`], () => {});
}
// The popup comes from ChronKeep.app (see mac/): our icon, plus Snooze and Done buttons. One at a time.
// Without it, or if it fails, a plain script notification is used instead.
// Linux and Windows: a plain desktop notification (Linux also gets Snooze and Done when notify-send supports buttons).
function otherDesktopNotify(title, body, meta) {
  try {
    if (process.platform === 'linux') {
      const c = desktop.linux(title, body, meta, path.join(__dirname, 'public', 'icon-192.png'));
      execFile(c.cmd, c.args, { timeout: c.waits ? 600000 : 15000 }, (err, stdout) => {
        const picked = String(stdout || '').trim();
        if (c.waits && (picked === 'snooze' || picked === 'done')) applyAction(meta.itemId, meta.date, picked, 10);
      });
    } else if (process.platform === 'win32') {
      const c = desktop.windows(title, body);
      execFile(c.cmd, c.args, { env: { ...process.env, ...c.env }, timeout: 15000, windowsHide: true }, () => {});
    }
  } catch { /* no notifier available: the planner and the phone still work */ }
}
function macNotify(title, body, meta = {}) {
  if (process.env.CHRONKEEP_NO_DESKTOP) return;
  if (process.platform === 'linux' || process.platform === 'win32') return otherDesktopNotify(title, body, meta);
  if (process.platform !== 'darwin') return;
  macQueue = macQueue.then(async () => {
    if (fs.existsSync(NATIVE)) {
      const args = ['--title', oneLine(title), '--body', oneLine(body)];
      if (meta.itemId) args.push('--item', meta.itemId, '--date', meta.date || '', '--port', String(PORT));
      const code = await runNative(args);
      if (code === 0) macStatus = 'ok'; else if (code === 3) macStatus = 'denied'; else plainNotify(title, body);
      return;
    }
    if (!fs.existsSync(NOTIFIER)) return plainNotify(title, body);
    await new Promise((done) => {
      try { fs.mkdirSync(path.dirname(NOTE_FILE), { recursive: true }); fs.writeFileSync(NOTE_FILE, `${oneLine(title)}\n${oneLine(body)}`); } catch { plainNotify(title, body); return done(); }
      execFile('open', ['-W', '-g', '-a', NOTIFIER], (err) => { if (err) plainNotify(title, body); done(); });
    });
  });
}
// Build the notifier app the first time, or upgrade the simple version when a Swift compiler is available.
if (process.env.CHRONKEEP_NO_DESKTOP) { /* tests: leave the notifier alone */ } else if (process.platform === 'darwin' && (!fs.existsSync(NOTIFIER) || (!fs.existsSync(NATIVE) && fs.existsSync('/usr/bin/swiftc')))) {
  execFile('sh', [path.join(__dirname, 'mac', 'build-notifier.sh')], (e) => { if (e) console.error('Could not build the Mac notifier:', e.message); checkMac(); });
} else checkMac();

// ---- Snooze and Done, from a notification button on the Mac or on the phone ----
const b64u = (x) => Buffer.from(x).toString('base64url');
const sign = (p) => crypto.createHmac('sha256', db.security.actionSecret).update(p).digest('base64url').slice(0, 24);
function actionToken(i, d, a, m) { const p = b64u(JSON.stringify({ i, d, a, m, e: Date.now() + 7 * 86400000 })); return `${p}.${sign(p)}`; }
function readToken(t) {
  const [p, sig] = String(t).split('.');
  if (!p || !sig) return null;
  const want = Buffer.from(sign(p)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o : null; } catch { return null; }
}
function applyAction(itemId, dateStr, action, minutes) {
  const item = db.items.find((x) => x.id === itemId);
  if (!item) return { error: 'That item no longer exists.' };
  const ds = dateStr || item.date || ymd(new Date()), key = `${item.id}@${ds}`;
  if (action === 'done') {
    if (item.repeat && item.repeat !== 'none') { item.doneOn = [...new Set([...(item.doneOn || []), ds])]; }
    else { item.done = true; item.doneAt = Date.now(); }
    delete db.snoozed[key];
    db.history.unshift({ at: Date.now(), title: `Done: ${item.title}`, body: 'Marked done from a notification', kind: 'action', itemId: item.id });
    db.history.length = Math.min(db.history.length, 100); save();
    return { ok: true, action };
  }
  if (action === 'snooze') {
    const m = Math.max(1, Math.min(1440, Number(minutes) || 10));
    db.snoozed[key] = Date.now() + m * 60000;
    db.history.unshift({ at: Date.now(), title: `Snoozed: ${item.title}`, body: `Reminders paused for ${human(m)}`, kind: 'action', itemId: item.id });
    db.history.length = Math.min(db.history.length, 100); save();
    return { ok: true, action, until: db.snoozed[key] };
  }
  return { error: 'Unknown action.' };
}
const isSnoozed = (id, ds) => (db.snoozed[`${id}@${ds}`] || 0) > Date.now();

// Snooze and Done buttons on the phone work when other devices can reach this computer (same Wi-Fi, PIN on).
function phoneButtons(meta) {
  const base = db.security.lan ? auth.lanUrls(PORT)[0] : null;
  if (!meta.itemId || !base) return {};
  const link = (a, m) => `${base}/api/act/${actionToken(meta.itemId, meta.date || '', a, m)}`;
  return { Actions: `http, Snooze 10 min, ${link('snooze', 10)}, method=POST, clear=true; http, Done, ${link('done')}, method=POST, clear=true`, Click: `${base}/?open=${meta.itemId}` };
}
function notify(title, body, meta = {}) {
  db.history.unshift({ at: Date.now(), title, body, kind: meta.kind || 'reminder', itemId: meta.itemId || null });
  db.history.length = Math.min(db.history.length, 100);
  save();
  console.log(new Date().toLocaleTimeString(), 'notify:', title, '|', body);
  const s = db.settings;
  if (s.notifyMac) macNotify(title, body, meta);
  if (s.notifyPhone && s.ntfyTopic) {
    fetch(`${s.ntfyServer.replace(/\/$/, '')}/${encodeURIComponent(s.ntfyTopic)}`, {
      method: 'POST',
      headers: { Title: title, Priority: ({ high: 'urgent', low: 'default' })[(db.items.find((x) => x.id === meta.itemId) || {}).priority] || 'high', Tags: 'bell', ...(s.notifyIcon ? { Icon: s.notifyIcon } : {}), ...phoneButtons(meta) },
      body,
    }).catch((e) => console.error('ntfy failed:', e.message));
  }
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const occursOn = (item, d) => Recur.occursOn(item, d);

const atOn = (item, d) => {
  const [h, m] = (item.time || `${pad(db.settings.allDayHour)}:00`).split(':').map(Number);
  const at = new Date(d);
  at.setHours(h, m, 0, 0);
  return at;
};
const isDoneOn = (item, d) => (item.repeat === 'none' || !item.repeat ? item.done : (item.doneOn || []).includes(ymd(d)));
const label = (it) => ({ assignment: 'Assignment', event: 'Event', todo: 'To-do' }[it.type] || 'To-do');
const human = (m) => {
  m = Math.round(m);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return d ? `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}` : h ? `${h} h${mi ? ` ${mi} min` : ''}` : `${mi} min`;
};
// The repeating-reminder rule in force right now: of the rules that have started, the most specific.
function activeRule(item, due, now) {
  const left = (due - now) / 60000;
  if (left <= 0) return null;
  let best = null;
  for (const r of item.nudges || []) {
    const from = r.from === 'day' ? (due - new Date(due).setHours(0, 0, 0, 0)) / 60000 : Number(r.from);
    if (left <= from && (!best || from < best.from)) best = { from, every: Number(r.every) };
  }
  return best;
}
const lead = (min) => (min >= 1440 ? `${Math.round(min / 1440)} day${min >= 2880 ? 's' : ''}` : min >= 60 ? `${Math.round(min / 60)} hour${min >= 120 ? 's' : ''}` : `${min} min`);

// Reminders already past when an item is saved stay quiet, so saving an
// assignment due tomorrow does not fire the "3 days before" one at once.
function prime(item) {
  db.notified = db.notified.filter((k) => !k.startsWith(item.id + '@'));
  for (const k of Object.keys(db.nudged)) if (k.startsWith(item.id + '@')) delete db.nudged[k];
  if (!item.date) return;
  const now = Date.now();
  for (let off = -1; off <= 8; off++) {
    const d = new Date(); d.setDate(d.getDate() + off);
    if (!occursOn(item, d)) continue;
    for (const rem of item.reminders || []) if (now >= atOn(item, d).getTime() - rem * 60000) db.notified.push(`${item.id}@${ymd(d)}@${rem}`);
  }
}

// What is still to come: one-off reminders, the next repeating reminder per item,
// overdue nags and the morning summary. Mirrors the rules tick() follows.
function upcoming() {
  const now = new Date(), nowMs = now.getTime(), horizon = nowMs + 7 * 86400000, out = [];
  const s = db.settings;
  for (const item of db.items) {
    if (!item.date) continue;
    let nudgeDone = false;
    for (let off = 0; off <= 30; off++) {
      const d = new Date(now); d.setDate(d.getDate() + off);
      if (!occursOn(item, d) || isDoneOn(item, d)) continue;
      const at = atOn(item, d);
      if (at.getTime() < nowMs - 3600000) continue;
      for (const rem of item.reminders || []) {
        const fire = at.getTime() - rem * 60000;
        if (fire > nowMs && fire < horizon && !db.notified.includes(`${item.id}@${ymd(d)}@${rem}`)) out.push({ at: fire, title: `${label(item)}: ${item.title}`, body: rem > 0 ? `Due in ${lead(rem)}` : 'Due now', kind: 'reminder', itemId: item.id });
      }
      if (!nudgeDone && (item.nudges || []).length && at.getTime() > nowMs) {
        nudgeDone = true;
        const rule = activeRule(item, at, now), last = db.nudged[`${item.id}@${ymd(d)}`] || 0;
        let next = null, every = null;
        if (rule) { next = Math.max(nowMs, last + rule.every * 60000); every = rule.every; }
        else {
          for (const r of item.nudges) {
            const from = r.from === 'day' ? (at - new Date(at).setHours(0, 0, 0, 0)) / 60000 : Number(r.from);
            const start = at.getTime() - from * 60000;
            if (start > nowMs && (next === null || start < next)) { next = start; every = Number(r.every); }
          }
        }
        if (next !== null && next < horizon) out.push({ at: next, title: `${label(item)}: ${item.title}`, body: `Repeating reminder, every ${human(every)} until it is done`, kind: 'repeat', itemId: item.id });
      }
      if (off > 14) break;
    }
    if (s.nagHours > 0 && (!item.repeat || item.repeat === 'none') && !item.done && item.type !== 'event') {
      const due = atOn(item, new Date(item.date + 'T00:00')).getTime();
      if (due < nowMs && nowMs - due < 14 * 86400000) out.push({ at: Math.max(nowMs, (item.lastNag || due) + s.nagHours * 3600000), title: `OVERDUE: ${item.title}`, body: `Reminding every ${human(s.nagHours * 60)} until you tick it off`, kind: 'overdue', itemId: item.id });
    }
  }
  for (const [key, until] of Object.entries(db.snoozed)) {
    const it = db.items.find((x) => x.id === key.split('@')[0]);
    if (it) out.push({ at: until, title: `${label(it)}: ${it.title}`, body: 'Snooze ends', kind: 'reminder', itemId: it.id });
  }
  if (s.digestHour >= 0) {
    const t = new Date(now); t.setHours(s.digestHour, 0, 0, 0);
    if (t.getTime() <= nowMs || db.lastDigest === ymd(now)) t.setDate(t.getDate() + 1);
    out.push({ at: t.getTime(), title: 'Morning summary', body: 'What is due today and what is overdue', kind: 'summary', itemId: null });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 30);
}

function tick() {
  const now = new Date();
  store.dailyBackup(DATA);
  for (const f of db.feeds) if (f.enabled !== false && Date.now() - (f.lastSync || 0) > 6 * 3600000) syncFeed(f).catch((e) => console.error(`Calendar "${f.name}":`, e.message));
  let changed = false;
  const s = db.settings;

  // A snooze that has run out: remind again.
  for (const [key, until] of Object.entries(db.snoozed)) {
    if (until > now.getTime()) continue;
    const [id, ds] = key.split('@'), it = db.items.find((x) => x.id === id);
    delete db.snoozed[key]; changed = true;
    if (it && !isDoneOn(it, new Date(ds + 'T00:00'))) notify(`${label(it)}: ${it.title}`, 'Your snooze is over.', { kind: 'reminder', itemId: id, date: ds });
  }

  for (const item of db.items) {
    if (!item.date) continue;
    // Reminders before the due time.
    for (let off = -1; off <= 8; off++) {
      const d = new Date(now); d.setDate(d.getDate() + off);
      if (!occursOn(item, d) || isDoneOn(item, d) || isSnoozed(item.id, ymd(d))) continue;
      const at = atOn(item, d);
      for (const rem of item.reminders || []) {
        const key = `${item.id}@${ymd(d)}@${rem}`;
        if (db.notified.includes(key)) continue;
        const fire = at.getTime() - rem * 60000;
        if (now.getTime() >= fire && now.getTime() < at.getTime() + 3600000) {
          const when = `${ymd(d) === ymd(now) ? 'today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${item.time ? ' at ' + item.time : ''}`;
          notify(`${label(item)}: ${item.title}`, `${rem > 0 ? `Due in ${lead(rem)}` : 'Due now'} (${when})${item.category ? ', ' + item.category : ''}`, { kind: 'reminder', itemId: item.id, date: ymd(d) });
          db.notified.push(key); changed = true;
        }
      }
    }
    // Repeating reminders until it is ticked off.
    if ((item.nudges || []).length) {
      for (let off = 0; off <= 8; off++) {
        const d = new Date(now); d.setDate(d.getDate() + off);
        if (!occursOn(item, d) || isDoneOn(item, d)) continue;
        const due = atOn(item, d), rule = activeRule(item, due, now);
        if (!rule) continue;
        if (isSnoozed(item.id, ymd(d))) break;
        const key = `${item.id}@${ymd(d)}`;
        if (now.getTime() - (db.nudged[key] || 0) >= rule.every * 60000 - 2000) {
          const left = (due - now) / 60000;
          notify(`${label(item)}: ${item.title}`, `Due in ${human(left)} (${due.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${item.time ? ', ' + item.time : ''}). Reminding every ${human(rule.every)}. Tick it off to stop.`, { kind: 'repeat', itemId: item.id, date: ymd(d) });
          db.nudged[key] = now.getTime(); changed = true;
        }
        break;
      }
    }
    // Overdue and still not ticked: keep nagging.
    if (s.nagHours > 0 && (item.repeat === 'none' || !item.repeat) && !item.done && item.type !== 'event' && !isSnoozed(item.id, item.date)) {
      const due = atOn(item, new Date(item.date + 'T00:00'));
      const since = now.getTime() - due.getTime();
      if (since > 0 && since < 14 * 86400000 && now.getTime() - (item.lastNag || due.getTime()) >= s.nagHours * 3600000) {
        notify(`OVERDUE: ${item.title}`, `${label(item)} was due ${due.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Tick it off in the planner when done.`, { kind: 'overdue', itemId: item.id, date: item.date });
        item.lastNag = now.getTime(); changed = true;
      }
    }
  }

  // Morning summary.
  if (s.digestHour >= 0 && now.getHours() >= s.digestHour && db.lastDigest !== ymd(now)) {
    const today = db.items.filter((it) => it.date && occursOn(it, now) && !isDoneOn(it, now) && it.type !== 'event' && (it.repeat !== 'none' || it.date === ymd(now)));
    const overdue = db.items.filter((it) => it.date && it.repeat === 'none' && !it.done && it.type !== 'event' && it.date < ymd(now));
    if (today.length || overdue.length) {
      const names = [...overdue.map((i) => '! ' + i.title), ...today.map((i) => i.title)].slice(0, 6).join(', ');
      notify(`Today: ${today.length} due${overdue.length ? `, ${overdue.length} overdue` : ''}`, names, { kind: 'summary' });
    }
    db.lastDigest = ymd(now); changed = true;
  }

  const keepTrash = db.trash.filter((t) => Date.now() - t.deletedAt < 30 * 86400000);
  if (keepTrash.length !== db.trash.length) { db.trash.filter((t) => !keepTrash.includes(t)).forEach((t) => purgeFiles(t.id)); db.trash = keepTrash; changed = true; }
  if (Object.keys(db.nudged).length > 600) { const keep = ymd(new Date(Date.now() - 2 * 86400000)); for (const k of Object.keys(db.nudged)) if (k.split('@')[1] < keep) delete db.nudged[k]; }
  if (db.notified.length > 4000) db.notified = db.notified.slice(-2000);
  if (changed) save();
}
setInterval(tick, Number(process.env.CHRONKEEP_TICK_MS) || 20000); // tests run it faster
tick();

// ---- http ----
const __t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const { send, readBody, types } = require('./lib/http');
const tries = auth.limiter();
const secInfo = () => ({ lan: db.security.lan, hasPin: !!db.security.pin, urls: db.security.lan ? auth.lanUrls(PORT) : [] });
const handler = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const remote = req.socket.remoteAddress || '', local = auth.isLoopback(remote);
  // 1. Only expected host names (blocks DNS rebinding from web pages).
  if (!auth.hostAllowed(req.headers.host, db.security.lan)) { res.writeHead(421); return res.end('Unexpected host'); }
  // 2. Changes must come from this app's own pages, never from another site.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin && !auth.sameOrigin(req.headers.origin, req.headers.host)) { res.writeHead(403); return res.end('Cross-site request refused'); }
  // The Snooze / Done links on a phone notification carry their own signature, so they need no sign-in.
  const am = p.match(/^\/api\/act\/([\w.-]+)$/);
  if (am && (req.method === 'POST' || req.method === 'GET')) {
    const o = readToken(am[1]);
    if (!o) return send(res, 400, { error: 'This link has expired.' });
    const r = applyAction(o.i, o.d, o.a, o.m);
    return send(res, r.error ? 404 : 200, r);
  }
  // 3. Other devices need the PIN. This computer does not.
  const token = auth.cookies(req.headers.cookie).ck;
  const signedIn = local || (token && db.security.sessions.includes(auth.sha(token)));
  if (!signedIn) {
    if (p === '/api/login' && req.method === 'POST') {
      if (tries.blocked(remote)) return send(res, 429, { error: 'Too many tries' });
      const { pin } = await readBody(req);
      if (!db.security.pin || !auth.checkPin(pin, db.security.pin)) { tries.fail(remote); await new Promise((r) => setTimeout(r, 700)); return send(res, 401, { error: 'Wrong PIN' }); }
      tries.ok(remote);
      const t = auth.newToken();
      db.security.sessions = [...db.security.sessions.slice(-19), auth.sha(t)]; save();
      res.setHeader('Set-Cookie', `ck=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
      return send(res, 200, { ok: true });
    }
    if (['/login.html', '/icon-192.png', '/favicon.ico'].includes(p)) { /* allowed: needed by the sign-in page */ }
    else if (p.startsWith('/api/')) return send(res, 401, { error: 'Sign in required' });
    else { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(PUBLIC, 'login.html'))); }
  }
  if (p === '/api/security' && req.method === 'PUT') {
    if (!local) return send(res, 403, { error: 'Change this from the computer ChronKeep runs on.' });
    const b = await readBody(req), sec = db.security, wasLan = sec.lan;
    if ('pin' in b) {
      if (b.pin === null || b.pin === '') { sec.pin = null; sec.lan = false; }
      else if (!auth.validPin(b.pin)) return send(res, 400, { error: 'Use 6 to 12 digits for the PIN.' });
      else sec.pin = auth.hashPin(String(b.pin));
      sec.sessions = [];
    }
    if ('lan' in b) { if (b.lan && !sec.pin) return send(res, 400, { error: 'Set a PIN first.' }); sec.lan = !!b.lan; }
    if ('signOutOthers' in b) sec.sessions = [];
    save();
    if (sec.lan !== wasLan) res.on('finish', () => setImmediate(relisten));
    return send(res, 200, secInfo());
  }
  // Start with the Mac: a launch agent that starts this server at login and restarts it if it stops.
  if (p === '/api/autostart' && req.method === 'GET') return send(res, 200, autostart.status());
  if (p === '/api/autostart' && req.method === 'POST') {
    if (!local) return send(res, 403, { error: 'Change this from the computer ChronKeep runs on.' });
    const { enable } = await readBody(req), st = autostart.status();
    if (!st.supported) return send(res, 400, { error: 'Auto-start is only available on macOS.' });
    try {
      if (enable) { autostart.install({ handOver: !st.managed }); send(res, 200, { ...autostart.status(), restarting: !st.managed }); if (!st.managed) res.on('finish', () => setTimeout(() => process.exit(0), 300)); }
      else { autostart.uninstall({ keepRunning: st.managed }); send(res, 200, { ...autostart.status(), enabled: false, restarting: st.managed }); }
    } catch (e) { return send(res, 500, { error: e.message }); }
    return;
  }
  if (await api.handle(req, res, url)) return;
  if (p === '/api/act' && req.method === 'POST') {
    const b = await readBody(req), r = applyAction(b.itemId, b.date, b.action, b.minutes);
    return send(res, r.error ? 404 : 200, r);
  }
  if (p === '/api/mac-status' && req.method === 'GET') return send(res, 200, { status: await checkMac() });
  if (p === '/api/logout' && req.method === 'POST') {
    if (token) db.security.sessions = db.security.sessions.filter((h) => h !== auth.sha(token)); save();
    res.setHeader('Set-Cookie', 'ck=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  if (p === '/api/notifications' && req.method === 'GET') return send(res, 200, { history: db.history.slice(0, 50), upcoming: upcoming() });
  if (p === '/api/mac-settings' && req.method === 'POST') {
    if (process.platform === 'darwin') execFile('open', ['x-apple.systempreferences:com.apple.Notifications-Settings.extension'], () => {});
    return send(res, 200, { ok: true });
  }
  if (p === '/api/test' && req.method === 'POST') { notify('ChronKeep test', 'Notifications are working!', { kind: 'test' }); return send(res, 200, { ok: true }); }
  // The page's script is assembled from public/js/*.js (see lib/assets.js).
  if (p === '/app.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }); return res.end(assembleApp(path.join(PUBLIC, 'js'))); }
  // static
  const f = path.join(PUBLIC, p === '/' ? 'index.html' : p);
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
};
const server = http.createServer(handler);
// Only this computer by default. Other devices on the network get in only when a PIN is set and "other devices" is on.
const hostNow = () => (db.security.lan && db.security.pin ? '0.0.0.0' : '127.0.0.1');
function listen() {
  server.listen(PORT, hostNow(), () => {
    console.log(`ChronKeep running: http://localhost:${PORT}${db.security.lan ? `  (also on your network: ${auth.lanUrls(PORT).join(', ')})` : '  (this computer only)'}`);
    console.log(`Phone notifications: install the "ntfy" app and subscribe to topic: ${db.settings.ntfyTopic}`);
  });
}
function relisten() { server.closeAllConnections(); server.close(() => listen()); }
listen();
