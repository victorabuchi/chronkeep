const HH = 56; // pixels per hour: keep in sync with --hh in app.css
const REM = [[0, 'At time'], [5, '5 min'], [10, '10 min'], [30, '30 min'], [60, '1 hour'], [180, '3 hours'], [720, '12 hours'], [1440, '1 day'], [2880, '2 days'], [4320, '3 days'], [10080, '1 week']];
const FROM = [[525600, 'Right away'], [10080, '7 days before'], [4320, '3 days before'], [2880, '2 days before'], [1440, '1 day before'], ['day', 'From the start of the due day'], [720, '12 hours before'], [360, '6 hours before'], [180, '3 hours before'], [60, '1 hour before'], [30, '30 min before']];
const EVERY = [[5, '5 min'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [360, '6 hours'], [720, '12 hours']];
const everyLabel = (m) => (EVERY.find(([v]) => v === +m) || [0, `${m} min`])[1];
const rank = (r) => (r.from === 'day' ? 1200 : +r.from);
// The repeating-reminder rule in force at this moment: the latest one that has started.
function activeRule(it, due, now) {
  const left = (due - now) / 60000;
  if (left <= 0) return null;
  let best = null;
  for (const r of it.nudges || []) { const from = r.from === 'day' ? (due - new Date(due).setHours(0, 0, 0, 0)) / 60000 : +r.from; if (left <= from && (!best || from < best.from)) best = { from, every: +r.every }; }
  return best;
}
const KIND = { assignment: 'Assignment', event: 'Event', todo: 'To-do' };
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (s) => new Date(s + 'T00:00');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (m, u, b) => {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  if (r.status === 401 && location.pathname === '/app') location.href = '/login'; // the cloud sign-in ran out
  return r.json();
};
const store = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

const DEF = { name: 'ChronKeep', userName: '', accent: '#3b5bdb', theme: 'auto', weekStart: 1, showWeekends: true, dayStart: 7, dayEnd: 22, dueTime: '23:59', nagHours: 6, digestHour: 8, reminderDefaults: { assignment: [4320, 1440, 180, 30], event: [10], todo: [0] }, nudgeDefaults: { assignment: [{ from: 'day', every: 60 }, { from: 60, every: 10 }], event: [], todo: [] }, categories: [], notifyMac: true, notifyPhone: true, ntfyTopic: '' };
// Whatever the server sends, the page always has every setting it needs.
const norm = (x) => ({ ...DEF, ...x, reminderDefaults: { ...DEF.reminderDefaults, ...(x && x.reminderDefaults) }, nudgeDefaults: { ...DEF.nudgeDefaults, ...(x && x.nudgeDefaults) }, categories: (x && x.categories) || [] });
let S = norm({}), items = [], notepad = { html: '', at: null };
let P = { name: '', email: '', phone: '', photo: '' };
let trash = [];
let sec = { lan: false, hasPin: false, urls: [] };
let macStatus = 'unknown';
let feeds = [];
let page = ['tasks', 'settings', 'customize', 'history', 'bin'].includes(load('planner:page')) ? load('planner:page') : 'cal', view = load('planner:view') || 'week', cur = new Date(), typeF = 'all', showDone = false, autoscroll = true, calShown = false, navDir = 0;

const color = (c) => (S.categories.find((x) => x.name === c) || { color: S.accent }).color;
const vis = (it) => typeF === 'all' || it.type === typeF;
const hm = (t) => t;

// Which days an item appears on lives in recur.js, shared with the server.
const occurs = (it, d) => Recur.occursOn(it, d);
// Events that run over midnight or several days also show on the days after they start.
const showsOn = (it, d) => (it.type === 'event' ? Recur.startFor(it, d) !== null : occurs(it, d));
const rep = (it) => it.repeat && it.repeat !== 'none';
const isDone = (it, d) => (rep(it) ? (it.doneOn || []).includes(ymd(d)) : !!it.done);
const dueAt = (it, d) => { const [h, m] = (it.time || (it.type === 'event' ? '00:00' : S.dueTime || '23:59')).split(':').map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

async function toggle(id, dateStr) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const completing = rep(it) ? !(it.doneOn || []).includes(dateStr) : !it.done;
  if (!rep(it)) { it.done = !it.done; it.doneAt = it.done ? Date.now() : null; }
  else { const a = it.doneOn || []; it.doneOn = a.includes(dateStr) ? a.filter((x) => x !== dateStr) : [...a, dateStr]; }
  const saved = api('PUT', '/api/items/' + id, { done: it.done, doneOn: it.doneOn, doneAt: it.doneAt });
  if (completing) {
    const sel = `[data-id="${id}"][data-d="${dateStr}"]`;
    const marks = document.querySelectorAll(`.trow${sel} .circle, .chip${sel} .tick`);
    marks.forEach((m) => m.classList.add('on', 'pop'));
    document.querySelectorAll(`.trow${sel}`).forEach((r) => r.classList.add('done'));
    if (marks[0]) { const b = marks[0].getBoundingClientRect(); burst(b.left + b.width / 2, b.top + b.height / 2); }
    toast(`Done: ${it.title}`, 'Undo', () => toggle(id, dateStr));
    const rows = document.querySelectorAll(`.trow${sel}`);
    if (rows.length) { await sleep(420); rows.forEach((r) => r.classList.add('leaving')); await sleep(280); }
  }
  render();
  await saved;
}
async function tickStep(id, sid, dateStr) {
  const it = items.find((x) => x.id === id), s = it && (it.subtasks || []).find((x) => x.id === sid);
  if (!s) return;
  s.done = !s.done; render();
  await api('PUT', '/api/items/' + id, { subtasks: it.subtasks });
  if (it.subtasks.every((x) => x.done) && !it.done) toast('All steps are done', 'Mark task done', () => toggle(id, dateStr));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A small burst of colour from the tick you just pressed.
function burst(x, y) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cols = [getComputedStyle(document.documentElement).getPropertyValue('--b').trim() || '#3b5bdb', '#f5b400', '#16a36a', '#d6457a', '#0e8fb0'];
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('i'); s.className = 'spark';
    s.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % cols.length]}`;
    document.body.appendChild(s);
    const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.5, d = 24 + Math.random() * 30;
    s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 }], { duration: 520 + Math.random() * 220, easing: 'cubic-bezier(.15,.8,.3,1)' }).onfinish = () => s.remove();
  }
}
