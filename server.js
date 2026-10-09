// ChronKeep server: zero dependencies. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data.json');
const PUBLIC = path.join(__dirname, 'public');

const defaults = () => ({
  settings: {
    name: 'ChronKeep',
    userName: 'Victor Abuchi',
    accent: '#3b5bdb',
    theme: 'auto',
    weekStart: 1,
    showWeekends: true,
    dayStart: 7,
    dayEnd: 22,
    allDayHour: 9,
    dueTime: '23:59', // assignments with no time are due at the end of the day
    // Minutes before the due time / start. 0 = at the time.
    reminderDefaults: { assignment: [4320, 1440, 180, 30], event: [10], todo: [0] },
    // Repeating reminders. Each rule: from = minutes before the deadline ('day' = from midnight
    // of the due day), every = minutes between reminders. The latest rule that applies wins.
    nudgeDefaults: { assignment: [{ from: 'day', every: 60 }, { from: 60, every: 10 }], event: [], todo: [] },
    nagHours: 6, // keep reminding about overdue, unticked items every N hours (0 = off)
    digestHour: 8, // a morning summary of today + overdue (-1 = off)
    categories: [
      { name: 'Study', color: '#7c5cf0' },
      { name: 'Work', color: '#0e8fb0' },
      { name: 'Personal', color: '#d6457a' },
      { name: 'Health', color: '#16a36a' },
    ],
    ntfyTopic: 'planner-' + crypto.randomBytes(6).toString('hex'),
    ntfyServer: 'https://ntfy.sh',
    // Shown on phone notifications (ntfy fetches it, so it must be a public URL).
    notifyIcon: 'https://raw.githubusercontent.com/victorabuchi/chronkeep/main/public/icon-512.png',
    notifyMac: true,
    notifyPhone: true,
  },
  items: [],
  notified: [],
  lastDigest: '',
  nudged: {},
  notepad: { html: '', at: null },
});

let db = defaults();
try {
  const saved = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  db = { ...db, ...saved, settings: { ...db.settings, ...saved.settings } };
} catch {}
// Settings saved by earlier versions: move to the current palette.
delete db.settings.headerColor;
if (db.settings.name === 'My Planner') db.settings.name = 'ChronKeep';
if (['#7b2d6b', '#6366f1', '#0f7a63'].includes(db.settings.accent)) db.settings.accent = '#3b5bdb';
const NEW = { Study: '#7c5cf0', Work: '#0e8fb0', Personal: '#d6457a', Health: '#16a36a' };
const OLD = ['#b57cf0', '#6b8fd1', '#e0709a', '#3fb59c', '#6366f1', '#f59e0b', '#10b981'];
for (const c of db.settings.categories) if (NEW[c.name] && OLD.includes(c.color)) c.color = NEW[c.name];
// Older items had a single `remind`.
for (const it of db.items) if (!Array.isArray(it.reminders)) it.reminders = it.remind != null && it.remind !== '' ? [Number(it.remind)] : [];
const save = () => fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
save();

// ---- notifications ----
// Mac popups come from a tiny ChronKeep.app (see mac/) so they show our icon and name.
// One at a time, because the app reads its message from a file. Falls back to a plain
// script notification if the app is missing.
const NOTIFIER = path.join(os.homedir(), 'Library/Application Support/ChronKeep/ChronKeep.app');
const NOTE_FILE = path.join(os.homedir(), 'Library/Caches/ChronKeep/notify.txt');
let macQueue = Promise.resolve();
function plainNotify(title, body) {
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  execFile('osascript', ['-e', `display notification "${esc(body)}" with title "${esc(title)}" sound name "Glass"`], () => {});
}
function macNotify(title, body) {
  if (process.platform !== 'darwin') return;
  macQueue = macQueue.then(() => new Promise((done) => {
    if (!fs.existsSync(NOTIFIER)) { plainNotify(title, body); return done(); }
    const one = (t) => String(t).replace(/\s+/g, ' ').trim();
    try {
      fs.mkdirSync(path.dirname(NOTE_FILE), { recursive: true });
      fs.writeFileSync(NOTE_FILE, `${one(title)}\n${one(body)}`);
    } catch { plainNotify(title, body); return done(); }
    execFile('open', ['-W', '-g', '-a', NOTIFIER], (err) => { if (err) plainNotify(title, body); done(); });
  }));
}
// Build the notifier app the first time, if this Mac does not have it yet.
if (process.platform === 'darwin' && !fs.existsSync(NOTIFIER)) execFile('sh', [path.join(__dirname, 'mac', 'build-notifier.sh')], (e) => e && console.error('Could not build the Mac notifier:', e.message));

function notify(title, body) {
  console.log(new Date().toLocaleTimeString(), 'notify:', title, '|', body);
  const s = db.settings;
  if (s.notifyMac) macNotify(title, body);
  if (s.notifyPhone && s.ntfyTopic) {
    fetch(`${s.ntfyServer.replace(/\/$/, '')}/${encodeURIComponent(s.ntfyTopic)}`, {
      method: 'POST',
      headers: { Title: title, Priority: 'high', Tags: 'bell', ...(s.notifyIcon ? { Icon: s.notifyIcon } : {}) },
      body,
    }).catch((e) => console.error('ntfy failed:', e.message));
  }
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function occursOn(item, d) {
  const start = new Date(item.date + 'T00:00');
  const day = new Date(ymd(d) + 'T00:00');
  if (day < start) return false;
  switch (item.repeat) {
    case 'daily': return true;
    case 'weekly': return day.getDay() === start.getDay();
    case 'monthly': return day.getDate() === start.getDate();
    default: return ymd(day) === item.date;
  }
}

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

function tick() {
  const now = new Date();
  let changed = false;
  const s = db.settings;

  for (const item of db.items) {
    if (!item.date) continue;
    // Reminders before the due time.
    for (let off = -1; off <= 8; off++) {
      const d = new Date(now); d.setDate(d.getDate() + off);
      if (!occursOn(item, d) || isDoneOn(item, d)) continue;
      const at = atOn(item, d);
      for (const rem of item.reminders || []) {
        const key = `${item.id}@${ymd(d)}@${rem}`;
        if (db.notified.includes(key)) continue;
        const fire = at.getTime() - rem * 60000;
        if (now.getTime() >= fire && now.getTime() < at.getTime() + 3600000) {
          const when = `${ymd(d) === ymd(now) ? 'today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${item.time ? ' at ' + item.time : ''}`;
          notify(`${label(item)}: ${item.title}`, `${rem > 0 ? `Due in ${lead(rem)} - ` : 'Due now - '}${when}${item.category ? ' - ' + item.category : ''}`);
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
        const key = `${item.id}@${ymd(d)}`;
        if (now.getTime() - (db.nudged[key] || 0) >= rule.every * 60000 - 2000) {
          const left = (due - now) / 60000;
          notify(`${label(item)}: ${item.title}`, `Due in ${human(left)} (${due.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${item.time ? ', ' + item.time : ''}). Reminding every ${human(rule.every)}. Tick it off to stop.`);
          db.nudged[key] = now.getTime(); changed = true;
        }
        break;
      }
    }
    // Overdue and still not ticked: keep nagging.
    if (s.nagHours > 0 && (item.repeat === 'none' || !item.repeat) && !item.done && item.type !== 'event') {
      const due = atOn(item, new Date(item.date + 'T00:00'));
      const since = now.getTime() - due.getTime();
      if (since > 0 && since < 14 * 86400000 && now.getTime() - (item.lastNag || due.getTime()) >= s.nagHours * 3600000) {
        notify(`OVERDUE: ${item.title}`, `${label(item)} was due ${due.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Tick it off in the planner when done.`);
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
      notify(`Today: ${today.length} due${overdue.length ? `, ${overdue.length} overdue` : ''}`, names);
    }
    db.lastDigest = ymd(now); changed = true;
  }

  if (Object.keys(db.nudged).length > 600) { const keep = ymd(new Date(Date.now() - 2 * 86400000)); for (const k of Object.keys(db.nudged)) if (k.split('@')[1] < keep) delete db.nudged[k]; }
  if (db.notified.length > 4000) db.notified = db.notified.slice(-2000);
  if (changed) save();
}
setInterval(tick, 20000);
tick();

// ---- http ----
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/api/state' && req.method === 'GET') return send(res, 200, { settings: db.settings, items: db.items, notepad: db.notepad });
  if (p === '/api/settings' && req.method === 'PUT') { db.settings = { ...db.settings, ...(await readBody(req)) }; save(); return send(res, 200, db.settings); }
  if (p === '/api/notepad' && req.method === 'PUT') { db.notepad = { html: String((await readBody(req)).html ?? ''), at: new Date().toISOString() }; save(); return send(res, 200, db.notepad); }
  if (p === '/api/test' && req.method === 'POST') { notify('ChronKeep test', 'Notifications are working!'); return send(res, 200, { ok: true }); }
  if (p === '/api/items' && req.method === 'POST') {
    const it = { id: crypto.randomUUID(), type: 'todo', title: '', notes: '', date: '', time: '', endTime: '', done: false, doneOn: [], reminders: [], nudges: [], repeat: 'none', category: '', ...(await readBody(req)) };
    prime(it); db.items.push(it); save(); return send(res, 200, it);
  }
  const m = p.match(/^\/api\/items\/([\w-]+)$/);
  if (m) {
    const i = db.items.findIndex((x) => x.id === m[1]);
    if (i < 0) return send(res, 404, {});
    if (req.method === 'PUT') {
      const patch = await readBody(req);
      db.items[i] = { ...db.items[i], ...patch, id: m[1] };
      if (['date', 'time', 'reminders', 'repeat', 'nudges'].some((k) => k in patch)) { db.items[i].lastNag = 0; prime(db.items[i]); }
      save(); return send(res, 200, db.items[i]);
    }
    if (req.method === 'DELETE') { db.items.splice(i, 1); save(); return send(res, 200, {}); }
  }
  // static
  const f = path.join(PUBLIC, p === '/' ? 'index.html' : p);
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`ChronKeep running: http://localhost:${PORT}`);
  console.log(`Phone notifications: install the "ntfy" app and subscribe to topic: ${db.settings.ntfyTopic}`);
});
