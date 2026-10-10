(() => {
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
const api = async (m, u, b) => (await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();
const store = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

const DEF = { name: 'ChronKeep', userName: '', accent: '#3b5bdb', theme: 'auto', weekStart: 1, showWeekends: true, dayStart: 7, dayEnd: 22, dueTime: '23:59', nagHours: 6, digestHour: 8, reminderDefaults: { assignment: [4320, 1440, 180, 30], event: [10], todo: [0] }, nudgeDefaults: { assignment: [{ from: 'day', every: 60 }, { from: 60, every: 10 }], event: [], todo: [] }, categories: [], notifyMac: true, notifyPhone: true, ntfyTopic: '' };
// Whatever the server sends, the page always has every setting it needs.
const norm = (x) => ({ ...DEF, ...x, reminderDefaults: { ...DEF.reminderDefaults, ...(x && x.reminderDefaults) }, nudgeDefaults: { ...DEF.nudgeDefaults, ...(x && x.nudgeDefaults) }, categories: (x && x.categories) || [] });
let S = norm({}), items = [], notepad = { html: '', at: null };
let P = { name: '', email: '', phone: '', photo: '' };
let trash = [];
let sec = { lan: false, hasPin: false, urls: [] };
let page = ['tasks', 'settings', 'customize', 'history', 'bin'].includes(load('planner:page')) ? load('planner:page') : 'cal', view = load('planner:view') || 'week', cur = new Date(), typeF = 'all', showDone = false, autoscroll = true, calShown = false, navDir = 0;

const color = (c) => (S.categories.find((x) => x.name === c) || { color: S.accent }).color;
const vis = (it) => typeF === 'all' || it.type === typeF;
const hm = (t) => t;

function occurs(it, d) {
  if (!it.date) return false;
  const s = day(it.date), dd = day(ymd(d));
  if (dd < s) return false;
  if (it.repeat === 'daily') return true;
  if (it.repeat === 'weekly') return dd.getDay() === s.getDay();
  if (it.repeat === 'monthly') return dd.getDate() === s.getDate();
  return ymd(dd) === it.date;
}
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

// ---------------------------------------------------------------- theme
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  const r = document.documentElement.style;
  r.setProperty('--accent', S.accent);
  $('brand').textContent = S.name;
  $('userName').textContent = P.name || 'Your account';
  $('userEmail').textContent = P.email || 'Personal planner';
  $('initials').textContent = (P.name || S.name || 'C').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  $('initials').hidden = !!P.photo; $('avatarImg').hidden = !P.photo; if (P.photo) $('avatarImg').src = P.photo;
}

// ---------------------------------------------------------------- calendar
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekDays() {
  const start = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - ((cur.getDay() - S.weekStart + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)).filter((d) => S.showWeekends || (d.getDay() !== 0 && d.getDay() !== 6));
}

function title(days) {
  if (view === 'month') return `${MON[cur.getMonth()]} ${cur.getFullYear()}`;
  if (view === 'day') return `${DOWL[cur.getDay()]}, ${MON[cur.getMonth()]} ${cur.getDate()}, ${cur.getFullYear()}`;
  const a = days[0], b = days[days.length - 1];
  return a.getMonth() === b.getMonth() ? `${MON[a.getMonth()]} ${a.getDate()} to ${b.getDate()}, ${b.getFullYear()}` : `${MON[a.getMonth()].slice(0, 3)} ${a.getDate()} to ${MON[b.getMonth()].slice(0, 3)} ${b.getDate()}, ${b.getFullYear()}`;
}

function chip(it, d, month) {
  const done = isDone(it, d), c = color(it.category), task = it.type !== 'event';
  const late = task && !done && dueAt(it, d) < new Date();
  return `<div class="chip ${done ? 'done' : ''} ${late ? 'late' : ''}" ${rep(it) ? '' : 'draggable="true"'} data-id="${it.id}" data-d="${ymd(d)}" style="--c:${c}" title="${esc(it.title)}">${task ? `<button type="button" class="tick ${done ? 'on' : ''}" data-tick aria-label="Tick off"></button>` : ''}<span class="nm">${esc(it.title)}</span>${it.time ? `<span class="tm">${it.time}</span>` : ''}</div>`;
}

// Overlapping events share the column width.
function lanes(list) {
  list.sort((a, b) => a.s - b.s || a.e - b.e);
  let group = [], gEnd = 0;
  const flush = () => { const n = Math.max(0, ...group.map((g) => g.lane)) + 1; group.forEach((g) => (g.n = n)); group = []; gEnd = 0; };
  for (const ev of list) {
    if (group.length && ev.s >= gEnd) flush();
    const used = group.filter((g) => g.e > ev.s).map((g) => g.lane);
    let l = 0; while (used.includes(l)) l++;
    ev.lane = l; group.push(ev); gEnd = Math.max(gEnd, ev.e);
  }
  flush();
  return list;
}

function renderGrid(days) {
  const n = days.length, rows = S.dayEnd - S.dayStart, top0 = S.dayStart * 60, now = new Date(), todayS = ymd(now);
  let head = `<div class="dhead corner"></div>`, due = `<div class="due lab">DUE</div>`, cols = '';
  for (const d of days) {
    const t = ymd(d) === todayS;
    head += `<div class="dhead ${t ? 'today' : ''}"><span class="dw">${DOW[d.getDay()]}</span><span class="dn">${d.getDate()}</span></div>`;
    const dayItems = items.filter((it) => vis(it) && occurs(it, d));
    const timed = [], dueList = [];
    for (const it of dayItems) {
      if (it.type === 'event' && it.time) {
        const [h, m] = it.time.split(':').map(Number), s = h * 60 + m;
        const [eh, em] = (it.endTime || '').split(':').map(Number);
        const e = it.endTime ? Math.max(s + 15, eh * 60 + em) : s + 60;
        if (e <= top0 || s >= S.dayEnd * 60) dueList.push(it); else timed.push({ it, s: Math.max(s, top0), e: Math.min(e, S.dayEnd * 60) });
      } else dueList.push(it);
    }
    dueList.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    due += `<div class="due ${t ? 'today' : ''}" data-drop="${ymd(d)}">${dueList.map((it) => chip(it, d)).join('')}</div>`;
    let evs = lanes(timed).map((ev) => {
      const c = color(ev.it.category), w = 100 / ev.n;
      return `<div class="ev" data-id="${ev.it.id}" data-d="${ymd(d)}" style="top:${((ev.s - top0) / 60) * HH}px;height:${Math.max(26, ((ev.e - ev.s) / 60) * HH - 2)}px;left:calc(${ev.lane * w}% + 1px);width:calc(${w}% - 3px);--c:${c}"><div class="tm">${ev.it.time}${ev.it.endTime ? ' to ' + ev.it.endTime : ''}</div><div class="nm">${esc(ev.it.title)}</div>${ev.it.category ? `<div class="sb">${esc(ev.it.category)}</div>` : ''}<i class="rz" aria-hidden="true"></i></div>`;
    }).join('');
    if (t) { const m = now.getHours() * 60 + now.getMinutes(); if (m >= top0 && m <= S.dayEnd * 60) evs += `<div class="nowline" style="top:${((m - top0) / 60) * HH}px"></div>`; }
    cols += `<div class="daycol ${t ? 'today' : ''}" data-col="${ymd(d)}">${evs}</div>`;
  }
  const gut = Array.from({ length: rows }, (_, i) => `<span style="top:${i * HH + (i ? 0 : 2)}px">${S.dayStart + i}:00</span>`).join('');
  return `<div class="stick"><div class="cols" style="--n:${n}">${head}</div><div class="cols" style="--n:${n}">${due}</div></div><div class="cols" style="--n:${n};--rows:${rows}"><div class="gut">${gut}</div>${cols}</div>`;
}

function renderMonth() {
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() - S.weekStart + 7) % 7));
  const weeks = Math.ceil((((first.getDay() - S.weekStart + 7) % 7) + new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()) / 7);
  let h = `<div class="month" style="grid-template-rows:auto repeat(${weeks},minmax(104px,1fr))">`;
  for (let i = 0; i < 7; i++) h += `<div class="mh">${DOW[(i + +S.weekStart) % 7]}</div>`;
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const list = items.filter((it) => vis(it) && occurs(it, d)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    h += `<div class="mday ${d.getMonth() !== cur.getMonth() ? 'other' : ''} ${ymd(d) === ymd(new Date()) ? 'today' : ''}" data-go="${ymd(d)}"><span class="n">${d.getDate()}</span>${list.slice(0, 4).map((it) => chip(it, d)).join('')}${list.length > 4 ? `<span class="more">+${list.length - 4} more</span>` : ''}</div>`;
  }
  return h + '</div>';
}

function renderCal() {
  const days = view === 'week' ? weekDays() : [cur];
  $('ctitle').textContent = title(days);
  const wk = (() => { const t = new Date(Date.UTC(days[0].getFullYear(), days[0].getMonth(), days[0].getDate() + 3)); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 86400000 + 1 - ((t.getUTCDay() + 6) % 7) + 3) / 7); })();
  $('eyebrow').textContent = view === 'week' ? `Week ${wk}` : view === 'day' ? 'Day' : 'Month';
  const box = $('calscroll'), keep = box.scrollTop;
  box.innerHTML = view === 'month' ? renderMonth() : renderGrid(days);
  document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
  if (view !== 'month' && autoscroll) {
    const m = new Date().getHours() * 60 + new Date().getMinutes();
    const to = days.some((d) => ymd(d) === ymd(new Date())) ? Math.max(0, ((m - S.dayStart * 60) / 60) * HH - box.clientHeight * 0.4) : 0;
    if (calShown) { box.scrollTop = 0; box.scrollTo({ top: to, behavior: 'smooth' }); } else box.scrollTop = to;
  } else box.scrollTop = keep;
  if (autoscroll && calShown) { box.style.setProperty('--dir', navDir); box.classList.remove('flip'); void box.offsetWidth; box.classList.add('flip'); }
  calShown = true; navDir = 0;
  autoscroll = false;
}

// ---------------------------------------------------------------- tasks
function nextOcc(it) {
  if (!rep(it)) return it.date ? day(it.date) : null;
  for (let i = 0; i < 400; i++) {
    const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
    if (occurs(it, d) && !isDone(it, d)) return d;
  }
  return null;
}

function rel(due) {
  const ms = due - new Date(), a = Math.abs(ms), min = Math.round(a / 60000), h = Math.round(a / 3600000), dd = Math.round(a / 86400000);
  const t = min < 60 ? `${min} min` : h < 24 ? `${h} h` : `${dd} day${dd === 1 ? '' : 's'}`;
  return ms < 0 ? [`${t} overdue`, 'late'] : [`in ${t}`, h < 24 ? 'soon' : 'ok'];
}

function taskRow(it, d) {
  const done = d ? isDone(it, d) : it.done, c = color(it.category);
  const meta = [];
  meta.push(`<span class="kind">${KIND[it.type]}</span>`);
  if (it.category) meta.push(`<span><i class="dot" style="background:${c}"></i> ${esc(it.category)}</span>`);
  if (d) {
    const due = dueAt(it, d);
    meta.push(`<span>${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}${it.time ? ', ' + it.time : ''}</span>`);
    if (!done) { const [t, k] = rel(due); meta.push(`<span class="pill ${k}">${t}</span>`); }
  }
  if (d && !done && (it.nudges || []).length) { const r = activeRule(it, dueAt(it, d), new Date()); if (r) meta.push(`<span class="pill nudge" title="Repeating reminder in force">🔔 every ${everyLabel(r.every)}</span>`); }
  if (rep(it)) meta.push('<span>↻ ' + it.repeat + '</span>');
  const late = d && !done && dueAt(it, d) < new Date();
  return `<div class="trow ${done ? 'done' : ''} ${late ? 'late' : ''}" data-id="${it.id}" data-d="${d ? ymd(d) : ''}"><button type="button" class="circle ${done ? 'on' : ''}" data-tick aria-label="Tick off"></button><div class="tx"><div class="ti">${esc(it.title)}</div><div class="me">${meta.join('')}</div></div></div>`;
}

function renderTasks() {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const open = [], doneL = [];
  for (const it of items) {
    if (it.type === 'event' || !vis(it) || (typeF === 'event')) continue;
    const d = nextOcc(it);
    if (!rep(it) && it.done) doneL.push([it, d]); else open.push([it, d]);
  }
  const key = ([it, d]) => (d ? dueAt(it, d).getTime() : Infinity);
  open.sort((a, b) => key(a) - key(b));
  const B = { Overdue: [], Today: [], Tomorrow: [], 'This week': [], Later: [], 'No date': [] };
  for (const o of open) {
    const [it, d] = o;
    if (!d) B['No date'].push(o);
    else if (dueAt(it, d) < now) B.Overdue.push(o);
    else { const diff = Math.round((d - today) / 86400000); (diff === 0 ? B.Today : diff === 1 ? B.Tomorrow : diff <= 7 ? B['This week'] : B.Later).push(o); }
  }
  let h = '';
  for (const [name, list] of Object.entries(B)) if (list.length) h += `<section class="gcard ${name === 'Overdue' ? 'red' : ''}"><div class="grp ${name === 'Overdue' ? 'red' : ''}"><span>${name}</span><span>${list.length}</span></div>` + list.map(([it, d]) => taskRow(it, d)).join('') + '</section>';
  if (!open.length) h += '<div class="empty">Nothing left to do.</div>';
  if (doneL.length) {
    h += `<button class="showdone" id="showDone">${showDone ? 'Hide' : 'Show'} ${doneL.length} completed</button>`;
    if (showDone) h += `<section class="gcard"><div class="grp"><span>Completed</span><span>${doneL.length}</span></div>` + doneL.reverse().map(([it, d]) => taskRow(it, d)).join('') + '</section>';
  }
  $('tlist').innerHTML = h;
  $('tsub').textContent = `${open.length} open${B.Overdue.length ? ` · ${B.Overdue.length} overdue` : ''}`;
  const urgent = B.Overdue.length + B.Today.length;
  $('badge').hidden = !urgent; $('badge').textContent = urgent;
  $('badge').style.background = B.Overdue.length ? '#ff4d4f' : '#f59e0b';
  document.title = `${urgent ? `(${urgent}) ` : ''}${S.name}`;
}

function render() { applyTheme(); renderCal(); renderTasks(); renderHistory(); renderBin(); }

// ---------------------------------------------------------------- repeating reminders editor
function nudgeEditor(box, rules, onChange) {
  const draw = () => {
    rules.sort((a, b) => rank(b) - rank(a));
    const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    box.innerHTML = `<div class="nud">${rules.map((r, i) => `<div class="nrow"><select data-i="${i}" data-k="from" aria-label="Start">${opt(FROM, r.from)}</select><span>every</span><select data-i="${i}" data-k="every" aria-label="Interval">${opt(EVERY.some(([v]) => v === +r.every) ? EVERY : [...EVERY, [+r.every, `${r.every} min`]], r.every)}</select><button type="button" class="nx" data-x="${i}" aria-label="Remove">✕</button></div>`).join('')}<button type="button" class="btn ghost sm" data-add>+ Add a repeating reminder</button></div>`;
    box.querySelectorAll('select').forEach((el) => (el.onchange = () => { const r = rules[el.dataset.i]; r[el.dataset.k] = el.dataset.k === 'from' ? (el.value === 'day' ? 'day' : +el.value) : +el.value; onChange?.(); draw(); }));
    box.querySelectorAll('[data-x]').forEach((el) => (el.onclick = () => { rules.splice(el.dataset.x, 1); onChange?.(); draw(); }));
    box.querySelector('[data-add]').onclick = () => { rules.push({ from: 525600, every: 30 }); onChange?.(); draw(); };
  };
  draw();
}

// ---------------------------------------------------------------- pages
function setPage(p) {
  if (page === 'customize' && p !== 'customize') document.documentElement.style.setProperty('--accent', S.accent); // drop an unsaved colour preview
  page = p; store('planner:page', p);
  $('main').classList.toggle('tpage', p === 'tasks');
  $('main').classList.toggle('spage', p === 'settings');
  $('main').classList.toggle('hpage', p === 'history');
  $('main').classList.toggle('bpage', p === 'bin');
  $('railBin').classList.toggle('on', p === 'bin');
  if (p === 'bin') renderBin();
  $('railHistory').classList.toggle('on', p === 'history');
  $('main').classList.toggle('cpage', p === 'customize');
  $('railSet').classList.toggle('on', p === 'customize');
  if (p === 'customize') fillCustomize();
  $('railSettings').classList.toggle('on', p === 'settings');
  if (p === 'settings') { fillProfile(); loadBackups(); }
  $('tasks').classList.toggle('full', p === 'tasks');
  $('railCal').classList.toggle('on', p === 'cal');
  $('navTasks').classList.toggle('on', p === 'tasks');
  if (p === 'cal') { autoscroll = true; renderCal(); }
  const fresh = { tasks: $('tlist'), history: $('hList'), bin: $('binList') }[p];
  if (fresh) { fresh.classList.add('fresh'); setTimeout(() => fresh.classList.remove('fresh'), 900); }
}

// ---------------------------------------------------------------- item form
let editing = null, fType = 'assignment', fRem = [], fNud = [], remTouched = false;
function chipSet(box, selected, onChange) {
  const draw = () => {
    box.innerHTML = REM.map(([m, l]) => `<button type="button" data-m="${m}" class="${selected.includes(m) ? 'on' : ''}">${l}</button>`).join('');
    box.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      const m = +b.dataset.m, i = selected.indexOf(m);
      i < 0 ? selected.push(m) : selected.splice(i, 1);
      onChange?.(); draw();
    }));
  };
  draw();
}
function setType(t, fresh) {
  fType = t;
  document.querySelectorAll('#fType button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  $('fDateL').textContent = t === 'assignment' ? 'Due date' : t === 'event' ? 'Date' : 'Date (optional)';
  $('fTimeL').textContent = t === 'assignment' ? 'Due time' : t === 'event' ? 'Start time' : 'Time (optional)';
  $('fEndWrap').hidden = t !== 'event';
  if (fresh && !remTouched) { fRem = [...(S.reminderDefaults[t] || [])]; chipSet($('fRem'), fRem, () => (remTouched = true)); fNud = (S.nudgeDefaults[t] || []).map((r) => ({ ...r })); nudgeEditor($('fNud'), fNud, () => (remTouched = true)); }
  if (fresh && t === 'assignment' && !$('fTime').value && !editing) $('fTime').value = S.dueTime;
}
function openForm(it, preset = {}) {
  editing = it; remTouched = !!it;
  $('fHead').textContent = it ? 'Edit' : 'New';
  $('fCat').innerHTML = '<option value="">None</option>' + S.categories.map((c) => `<option>${esc(c.name)}</option>`).join('');
  $('fTitle').value = it?.title || ''; $('fCat').value = it?.category || preset.category || '';
  $('fDate').value = it ? it.date : preset.date || ymd(cur); $('fTime').value = it ? it.time || '' : preset.time || '';
  $('fEnd').value = it?.endTime || preset.endTime || ''; $('fRepeat').value = it?.repeat || 'none'; $('fNotes').value = it?.notes || '';
  fRem = it ? [...(it.reminders || [])] : [];
  chipSet($('fRem'), fRem, () => (remTouched = true));
  fNud = it ? (it.nudges || []).map((r) => ({ ...r })) : [];
  nudgeEditor($('fNud'), fNud, () => (remTouched = true));
  setType(it ? it.type : preset.type || 'assignment', !it);
  $('fDel').hidden = !it;
  $('dlg').showModal(); $('fTitle').focus();
}
$('fType').onclick = (e) => { const b = e.target.closest('button'); if (b) setType(b.dataset.t, true); };
$('form').onsubmit = async () => {
  let time = $('fTime').value;
  if (fType === 'assignment' && $('fDate').value && !time) time = S.dueTime;
  const body = { type: fType, title: $('fTitle').value.trim(), category: $('fCat').value, date: $('fDate').value, time, endTime: fType === 'event' ? $('fEnd').value : '', reminders: [...fRem].sort((a, b) => b - a), nudges: fNud.map((r) => ({ ...r })), repeat: $('fRepeat').value, notes: $('fNotes').value };
  if (editing) Object.assign(editing, await api('PUT', '/api/items/' + editing.id, body));
  else items.push(await api('POST', '/api/items', body));
  render();
};
$('fCancel').onclick = () => $('dlg').close();
$('fDel').onclick = async () => {
  const it = editing;
  $('dlg').close();
  await removeItem(it);
};

// ---------------------------------------------------------------- settings
let cats = [], setA, setE, setT, nudA, nudE, nudT;
function drawCats() {
  $('sCats').innerHTML = cats.map((c, i) => `<div class="catrow"><input type="color" value="${c.color}" data-i="${i}" data-k="color"><input type="text" value="${esc(c.name)}" data-i="${i}" data-k="name"><button type="button" class="btn ghost" data-x="${i}">✕</button></div>`).join('');
  $('sCats').querySelectorAll('input').forEach((el) => (el.oninput = () => (cats[el.dataset.i][el.dataset.k] = el.value)));
  $('sCats').querySelectorAll('[data-x]').forEach((el) => (el.onclick = () => { cats.splice(el.dataset.x, 1); drawCats(); }));
}
// Who can open ChronKeep: this computer only, or other devices with a PIN.
function fillSecurity() {
  $('secLan').checked = sec.lan; $('secLan').disabled = !sec.hasPin; $('secPin').value = ''; $('secPin').placeholder = sec.hasPin ? 'New PIN to change it' : 'Choose a PIN';
  $('secSetPin').textContent = sec.hasPin ? 'Change PIN' : 'Set PIN'; $('secRemove').hidden = !sec.hasPin; $('secOut').hidden = !sec.lan;
  $('secNote').textContent = sec.lan ? 'Other devices on your Wi-Fi can open ChronKeep with the PIN. Open one of the addresses below on that device.' : 'ChronKeep can only be opened from this computer. To use it on your phone or another computer on your Wi-Fi, set a PIN and allow other devices.';
  $('secUrls').innerHTML = sec.lan ? sec.urls.map((u) => `<b>${esc(u)}</b>`).join('<br>') : '';
}
async function setSecurity(body, okText) {
  const r = await fetch('/api/security', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) { flash($('secMsg'), d.error || 'Could not change that.', true); fillSecurity(); return; }
  sec = d; fillSecurity(); flash($('secMsg'), okText); setTimeout(() => flash($('secMsg'), ''), 3000);
}
$('secSetPin').onclick = () => setSecurity({ pin: $('secPin').value }, 'PIN saved');
$('secLan').onchange = (e) => setSecurity({ lan: e.target.checked }, e.target.checked ? 'Other devices allowed' : 'This computer only');
$('secOut').onclick = () => setSecurity({ signOutOthers: true }, 'Signed out');
$('secRemove').onclick = () => { if (confirm('Remove the PIN? Other devices will lose access.')) setSecurity({ pin: null }, 'PIN removed'); };

// Start with the Mac (a launch agent). Turning it on from a hand-started server makes that server hand over and restart.
async function fillAutostart() {
  const st = await api('GET', '/api/autostart');
  $('autoCard').hidden = !st.supported; $('autoOn').checked = st.enabled;
}
$('autoOn').onchange = async (e) => {
  const want = e.target.checked;
  const r = await fetch('/api/autostart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enable: want }) });
  const d = await r.json();
  if (!r.ok) { flash($('autoMsg'), d.error || 'Could not change that.', true); e.target.checked = !want; return; }
  if (!d.restarting) return flash($('autoMsg'), want ? 'On. ChronKeep will start at login.' : 'Off');
  flash($('autoMsg'), 'Restarting ChronKeep, one moment…');
  for (let i = 0; i < 40; i++) { await sleep(1000); try { if ((await fetch('/api/state')).ok) return location.reload(); } catch {} }
  flash($('autoMsg'), 'ChronKeep did not come back. Start it again from the terminal.', true);
};

function fillCustomize() {
  $('sName').value = S.name; $('sAccent').value = S.accent; $('sHex').value = S.accent; $('sHex').classList.remove('bad'); $('sTheme').value = S.theme;
  $('sWeek').value = S.weekStart; $('sDayStart').value = S.dayStart; $('sDayEnd').value = S.dayEnd; $('sWeekend').value = S.showWeekends ? '1' : '0'; $('sDue').value = S.dueTime;
  $('sNag').value = S.nagHours; $('sDigest').value = S.digestHour;
  $('sMac').checked = S.notifyMac; $('sPhone').checked = S.notifyPhone; $('sTopic').value = S.ntfyTopic;
  setA = [...S.reminderDefaults.assignment]; setE = [...S.reminderDefaults.event]; setT = [...S.reminderDefaults.todo];
  chipSet($('sRemA'), setA); chipSet($('sRemE'), setE); chipSet($('sRemT'), setT);
  const cp = (a) => (a || []).map((r) => ({ ...r }));
  nudA = cp(S.nudgeDefaults.assignment); nudE = cp(S.nudgeDefaults.event); nudT = cp(S.nudgeDefaults.todo);
  nudgeEditor($('sNudA'), nudA); nudgeEditor($('sNudE'), nudE); nudgeEditor($('sNudT'), nudT);
  cats = S.categories.map((c) => ({ ...c })); drawCats();
  $('customMsg').textContent = '';
  fillSecurity(); fillAutostart();
}
$('mSettings').onclick = () => { $('userMenu').hidden = true; setPage('customize'); };
// Type a hex code and the colour loads at once; nothing is saved until Save.
const ACCENT = '#3b5bdb';
const hexOf = (v) => { v = v.trim().replace(/^#?/, '#').toLowerCase(); if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join(''); return /^#[0-9a-f]{6}$/.test(v) ? v : null; };
const preview = (hex) => document.documentElement.style.setProperty('--accent', hex);
$('sHex').oninput = (e) => { const h = hexOf(e.target.value); e.target.classList.toggle('bad', !h && e.target.value.trim() !== ''); if (h) { $('sAccent').value = h; preview(h); } };
$('sHex').onblur = (e) => { const h = hexOf(e.target.value); e.target.value = h || $('sAccent').value; e.target.classList.remove('bad'); };
$('sAccent').oninput = (e) => { $('sHex').value = e.target.value; $('sHex').classList.remove('bad'); preview(e.target.value); };
$('sHexReset').onclick = () => { $('sHex').value = ACCENT; $('sAccent').value = ACCENT; $('sHex').classList.remove('bad'); preview(ACCENT); };
// Closing without saving puts the saved colour back.
$('addCat').onclick = () => { cats.push({ name: 'New course', color: '#888888' }); drawCats(); };
$('sCancel').onclick = () => { preview(S.accent); fillCustomize(); $('customMsg').textContent = 'Changes discarded'; setTimeout(() => ($('customMsg').textContent = ''), 2000); };
async function saveSettings() {
  S = norm(await api('PUT', '/api/settings', {
    name: $('sName').value || 'ChronKeep', accent: hexOf($('sHex').value) || $('sAccent').value, theme: $('sTheme').value,
    weekStart: +$('sWeek').value, dayStart: Math.min(+$('sDayStart').value, 22), dayEnd: Math.max(+$('sDayEnd').value, +$('sDayStart').value + 1), showWeekends: $('sWeekend').value === '1', dueTime: $('sDue').value || '23:59',
    nagHours: +$('sNag').value, digestHour: +$('sDigest').value, notifyMac: $('sMac').checked, notifyPhone: $('sPhone').checked, ntfyTopic: $('sTopic').value.trim(),
    reminderDefaults: { assignment: setA, event: setE, todo: setT }, nudgeDefaults: { assignment: nudA, event: nudE, todo: nudT }, categories: cats.filter((c) => c.name.trim()),
  }));
  render();
}
$('sSave').onclick = async () => { await saveSettings(); $('customMsg').textContent = 'Saved'; setTimeout(() => ($('customMsg').textContent = ''), 2500); };
$('sMacSet').onclick = () => api('POST', '/api/mac-settings');
$('sTest').onclick = async () => { await saveSettings(); api('POST', '/api/test'); };
$('mTest').onclick = () => { $('userMenu').hidden = true; api('POST', '/api/test'); };

// ---------------------------------------------------------------- events
$('calscroll').addEventListener('click', (e) => {
  if (suppressClick) return;
  const tick = e.target.closest('[data-tick]');
  const el = e.target.closest('[data-id]');
  if (tick && el) return toggle(el.dataset.id, el.dataset.d);
  if (el) return openForm(items.find((x) => x.id === el.dataset.id));
  const col = e.target.closest('[data-col]');
  if (col && e.target === col) {
    const mins = Math.floor(((e.offsetY / HH) * 60 + S.dayStart * 60) / 30) * 30;
    return openForm(null, { date: col.dataset.col, time: `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`, type: 'event' });
  }
  const go = e.target.closest('[data-go]');
  if (go) { cur = day(go.dataset.go); view = 'day'; store('planner:view', view); autoscroll = true; render(); }
});
$('tlist').addEventListener('click', (e) => {
  if (e.target.id === 'showDone') { showDone = !showDone; return renderTasks(); }
  const row = e.target.closest('.trow');
  if (!row) return;
  if (e.target.closest('[data-tick]')) return toggle(row.dataset.id, row.dataset.d);
  openForm(items.find((x) => x.id === row.dataset.id));
});
$('quick').onsubmit = async (e) => {
  e.preventDefault();
  const title = $('qTitle').value.trim();
  if (!title) return;
  const type = $('qType').value, date = $('qDate').value;
  items.push(await api('POST', '/api/items', { type, title, date, time: $('qTime').value || (type === 'assignment' && date ? S.dueTime : ''), reminders: date ? [...S.reminderDefaults[type]] : [], nudges: date ? (S.nudgeDefaults[type] || []).map((r) => ({ ...r })) : [] }));
  $('qTitle').value = ''; $('qTime').value = ''; render(); $('qTitle').focus();
};
$('btnAdd').onclick = () => openForm(null);
const step = (n) => {
  if (view === 'month') cur = new Date(cur.getFullYear(), cur.getMonth() + n, 1);
  else cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + n * (view === 'week' ? 7 : 1));
  navDir = n; autoscroll = true; render();
};
$('prev').onclick = () => step(-1); $('next').onclick = () => step(1);
const goToday = () => { navDir = cur < new Date() ? 1 : -1; cur = new Date(); autoscroll = true; render(); };
$('todayBtn').onclick = goToday;
$('viewSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) { view = b.dataset.v; store('planner:view', view); autoscroll = true; render(); } };
document.querySelectorAll('[data-typetabs]').forEach((box) => (box.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; typeF = b.dataset.f; document.querySelectorAll('[data-typetabs] button').forEach((x) => (x.dataset.on = x.dataset.f === typeF)); render(); }));
$('navTasks').onclick = () => setPage('tasks');
$('railCal').onclick = () => setPage('cal');
// The logo and name: back to the home page (the calendar, at today); already there, refresh it.
$('home').onclick = (e) => {
  e.preventDefault();
  if (page === 'cal') return location.reload();
  cur = new Date(); setPage('cal');
};
$('railSet').onclick = () => $('mSettings').click();
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
  const k = e.key;
  if (k === '/') { e.preventDefault(); $('q').focus(); }
  else if (k === 'n') { e.preventDefault(); openForm(null); }
  else if (k === '?') { e.preventDefault(); $('help').showModal(); }
  else if (k === 't') { setPage('cal'); goToday(); }
  else if (['m', 'w', 'd'].includes(k)) { view = { m: 'month', w: 'week', d: 'day' }[k]; store('planner:view', view); setPage('cal'); autoscroll = true; render(); }
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && page === 'cal') { e.preventDefault(); step(k === 'ArrowLeft' ? -1 : 1); }
  else if ('123456'.includes(k) && k) setPage(['cal', 'tasks', 'history', 'bin', 'settings', 'customize'][+k - 1]);
});
// ---------------------------------------------------------------- notification centre
let nTab = 'upcoming', nData = { history: [], upcoming: [] };
const KINDS = { reminder: ['Reminder', 'var(--b)'], repeat: ['Repeating', '#8b5cf6'], overdue: ['Overdue', 'var(--neg)'], summary: ['Summary', 'var(--warn)'], test: ['Test', 'var(--muted)'] };
function whenText(ms) {
  const d = new Date(ms), now = new Date(), diff = ms - now.getTime();
  if (Math.abs(diff) < 3600000) { const m = Math.round(Math.abs(diff) / 60000); return diff < 0 ? (m < 1 ? 'just now' : `${m} min ago`) : (m < 1 ? 'now' : `in ${m} min`); }
  const dd = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const label = dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : dd === -1 ? 'Yesterday' : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}`;
  return `${label}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function drawNotifs() {
  document.querySelectorAll('.ntabs button').forEach((b) => (b.dataset.on = b.dataset.n === nTab));
  const list = nTab === 'upcoming' ? nData.upcoming : nData.history;
  $('nList').innerHTML = list.length ? list.map((n, i) => {
    const [kl, kc] = KINDS[n.kind] || KINDS.reminder;
    return `<button type="button" class="nitem ${n.itemId && items.some((x) => x.id === n.itemId) ? 'link' : ''}" data-i="${i}"><i class="ndot" style="background:${kc}"></i><span class="nbody"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></span><span class="nwhen"><em style="color:${kc}">${kl}</em>${whenText(n.at)}</span></button>`;
  }).join('') : `<div class="nempty">${nTab === 'upcoming' ? 'Nothing scheduled. Add a deadline with a reminder and it shows up here.' : 'No notifications sent yet.'}</div>`;
}
async function loadNotifs() { try { nData = await api('GET', '/api/notifications'); } catch {} drawNotifs(); }
$('btnBell').onclick = async (e) => {
  e.stopPropagation();
  const pop = $('nPop');
  if (!pop.hidden) { pop.hidden = true; return; }
  $('userMenu').hidden = true; pop.hidden = false; drawNotifs(); await loadNotifs();
};
document.querySelectorAll('.ntabs button').forEach((b) => (b.onclick = () => { nTab = b.dataset.n; drawNotifs(); }));
$('nPop').onclick = (e) => {
  e.stopPropagation();
  const row = e.target.closest('.nitem');
  if (!row) return;
  const n = (nTab === 'upcoming' ? nData.upcoming : nData.history)[+row.dataset.i], it = n && items.find((x) => x.id === n.itemId);
  if (it) { $('nPop').hidden = true; openForm(it); }
};
$('nTasks').onclick = () => { $('nPop').hidden = true; setPage('tasks'); };
document.addEventListener('click', () => ($('nPop').hidden = true));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('nPop').hidden = true; });
$('userBtn').onclick = (e) => { e.stopPropagation(); $('nPop').hidden = true; $('userMenu').hidden = !$('userMenu').hidden; };
document.addEventListener('click', () => ($('userMenu').hidden = true));
const noteBtn = () => $('btnNote').setAttribute('aria-pressed', PlannerNote.isOpen());
$('btnNote').onclick = () => { PlannerNote.toggle(notepad); noteBtn(); };
document.addEventListener('note:closed', noteBtn);

// ---------------------------------------------------------------- calendar drag and drop
let suppressClick = false;
const snap15 = (m) => Math.round(m / 15) * 15;
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minsAt = (col, y) => S.dayStart * 60 + ((y - col.getBoundingClientRect().top) / HH) * 60;
const endClick = () => { suppressClick = true; setTimeout(() => (suppressClick = false), 0); };
const fmtDay = (ds) => `${DOW[day(ds).getDay()]} ${day(ds).getDate()} ${MON[day(ds).getMonth()].slice(0, 3)}`;

// Drag on empty space to create an event for that span.
function startCreate(e, col) {
  const top0 = S.dayStart * 60, lim = S.dayEnd * 60, a = snap15(minsAt(col, e.clientY)), y0 = e.clientY;
  let b = a + 60, moved = false;
  const ghost = document.createElement('div'); ghost.className = 'ev ghost'; col.appendChild(ghost);
  const draw = () => { const s = Math.min(a, b), t = Math.max(a, b); ghost.style.cssText = `top:${((s - top0) / 60) * HH}px;height:${Math.max(16, ((t - s) / 60) * HH)}px;left:1px;right:2px`; ghost.innerHTML = `<div class="tm">${hhmm(s)} to ${hhmm(t)}</div><div class="nm">New event</div>`; };
  const move = (ev) => { if (!moved && Math.abs(ev.clientY - y0) < 6) return; moved = true; b = Math.max(top0, Math.min(lim, snap15(minsAt(col, ev.clientY)))); if (b === a) b = a + 15; draw(); };
  const up = () => {
    removeEventListener('pointermove', move); ghost.remove();
    if (!moved) return;
    endClick(); const s = Math.min(a, b), t = Math.max(a, b);
    openForm(null, { date: col.dataset.col, time: hhmm(s), endTime: hhmm(t), type: 'event' });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true });
}

// Drag an event to move it (any day, any time), or pull its bottom edge to resize it.
function startEventDrag(e, el) {
  const it = items.find((x) => x.id === el.dataset.id);
  if (!it || !it.time) return;
  const resize = !!e.target.closest('.rz'), x0 = e.clientX, y0 = e.clientY, s0 = toMin(it.time), dur = it.endTime ? Math.max(15, toMin(it.endTime) - s0) : 60;
  const cols = [...document.querySelectorAll('.daycol')], colAt = (x) => cols.find((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
  let moved = false, nd = el.dataset.d, ns = s0, ne = s0 + dur;
  const label = () => { const t = el.querySelector('.tm'); if (t) t.textContent = `${hhmm(ns)} to ${hhmm(ne)}`; };
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    if (!moved) { moved = true; el.classList.add('dragging'); document.body.classList.add('dragging-ev'); }
    const dm = ((ev.clientY - y0) / HH) * 60;
    if (resize) { ne = Math.max(s0 + 15, Math.min(S.dayEnd * 60, snap15(s0 + dur + dm))); el.style.height = `${((ne - s0) / 60) * HH - 2}px`; return label(); }
    ns = Math.max(S.dayStart * 60, Math.min(S.dayEnd * 60 - 15, snap15(s0 + dm))); ne = ns + dur;
    const c = rep(it) ? null : colAt(ev.clientX);
    if (c) { nd = c.dataset.col; if (el.parentElement !== c) c.appendChild(el); el.style.left = '1px'; el.style.width = 'calc(100% - 3px)'; }
    el.style.top = `${((ns - S.dayStart * 60) / 60) * HH}px`; label();
  };
  const up = async () => {
    removeEventListener('pointermove', move); document.body.classList.remove('dragging-ev');
    if (!moved) return;
    endClick(); el.classList.remove('dragging');
    const before = { date: it.date, time: it.time, endTime: it.endTime || '' }, body = { time: hhmm(ns), endTime: hhmm(ne) };
    if (!rep(it) && !resize) body.date = nd;
    if (resize) body.time = it.time;
    if (body.time === before.time && body.endTime === before.endTime && (body.date === undefined || body.date === before.date)) return render();
    Object.assign(it, await api('PUT', '/api/items/' + it.id, body)); render();
    toast(resize ? `"${it.title}" now ends at ${body.endTime}` : `Moved "${it.title}" to ${rep(it) ? 'every' : fmtDay(it.date)} at ${it.time}`, 'Undo', async () => { Object.assign(it, await api('PUT', '/api/items/' + it.id, before)); render(); });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true });
}
$('calscroll').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.pointerType === 'touch') return;
  const ev = e.target.closest('.ev:not(.ghost)'), col = e.target.closest('[data-col]');
  if (ev && !e.target.closest('[data-tick]')) return startEventDrag(e, ev);
  if (col && e.target === col) startCreate(e, col);
});

// Drag a deadline (or an all-day item) onto another day to reschedule it.
let dragId = null;
$('calscroll').addEventListener('dragstart', (e) => {
  const chip = e.target.closest && e.target.closest('.chip[draggable=true]');
  if (!chip) return;
  dragId = chip.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
  requestAnimationFrame(() => chip.classList.add('dragging'));
});
$('calscroll').addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.dragging,.dropover').forEach((n) => n.classList.remove('dragging', 'dropover')); });
$('calscroll').addEventListener('dragover', (e) => { const t = e.target.closest('[data-drop],[data-go]'); if (!dragId || !t) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.dropover').forEach((n) => n !== t && n.classList.remove('dropover')); t.classList.add('dropover'); });
$('calscroll').addEventListener('drop', async (e) => {
  const t = e.target.closest('[data-drop],[data-go]');
  if (!dragId || !t) return;
  e.preventDefault();
  const it = items.find((x) => x.id === dragId), nd = t.dataset.drop || t.dataset.go;
  document.querySelectorAll('.dropover').forEach((n) => n.classList.remove('dropover'));
  if (!it || nd === it.date) return;
  const before = it.date;
  Object.assign(it, await api('PUT', '/api/items/' + it.id, { date: nd })); render();
  toast(`Moved "${it.title}" to ${fmtDay(nd)}`, 'Undo', async () => { Object.assign(it, await api('PUT', '/api/items/' + it.id, { date: before })); render(); });
});

// A live time guide under the cursor over empty time slots.
const guide = Object.assign(document.createElement('div'), { id: 'tguide', hidden: true }); document.body.appendChild(guide);
$('calscroll').addEventListener('mousemove', (e) => {
  const col = e.target.closest('[data-col]');
  if (!col || e.target !== col || document.body.classList.contains('dragging-ev') || e.buttons) { guide.hidden = true; return; }
  guide.hidden = false; guide.textContent = hhmm(Math.max(S.dayStart * 60, snap15(minsAt(col, e.clientY))));
  guide.style.left = `${e.clientX + 14}px`; guide.style.top = `${e.clientY + 12}px`;
});
$('calscroll').addEventListener('mouseleave', () => (guide.hidden = true));

// ---------------------------------------------------------------- toasts
function toast(msg, action, fn) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  if (action) el.querySelector('button').onclick = () => { close(); fn?.(); };
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  setTimeout(close, 6000);
}

// ---------------------------------------------------------------- bin: deleted items, recoverable for 30 days
async function removeItem(it) {
  const gone = await api('DELETE', '/api/items/' + it.id);
  items = items.filter((x) => x.id !== it.id); trash.unshift(gone); render();
  toast(`Moved "${it.title}" to the bin`, 'Undo', () => restoreItem(it.id));
}
async function restoreItem(id) {
  const back = await api('POST', `/api/trash/${id}/restore`);
  if (back && back.id) { trash = trash.filter((x) => x.id !== id); items.push(back); render(); toast(`Restored "${back.title}"`); }
}
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? '' : 's'} ago`; };
function renderBin() {
  const n = trash.length;
  $('binBadge').hidden = !n; $('binBadge').textContent = n;
  $('binEmpty').hidden = !n;
  $('binList').innerHTML = n ? `<section class="gcard hgroup">${trash.map((it) => {
    const c = color(it.category), left = Math.max(0, 30 - Math.floor((Date.now() - it.deletedAt) / 86400000));
    const meta = [`<span class="kind">${KIND[it.type]}</span>`];
    if (it.category) meta.push(`<span><i class="dot" style="background:${c}"></i> ${esc(it.category)}</span>`);
    if (it.date) meta.push(`<span>${it.type === 'event' ? '' : 'Due '}${DOW[day(it.date).getDay()]} ${day(it.date).getDate()} ${MON[day(it.date).getMonth()].slice(0, 3)}${it.time ? ', ' + it.time : ''}</span>`);
    meta.push(`<span>Deleted ${ago(it.deletedAt)}</span><span>${left} day${left === 1 ? '' : 's'} left</span>`);
    return `<div class="hrow binrow" data-id="${it.id}"><span class="evmark" style="--c:${c}">${it.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="3"/></svg>'}</span><div class="tx"><div class="ti">${esc(it.title)}</div><div class="me">${meta.join('')}</div></div><span class="binact"><button type="button" class="btn sm" data-restore>Restore</button><button type="button" class="btn ghost sm danger" data-purge>Delete forever</button></span></div>`;
  }).join('')}</section>` : '<div class="empty scard">The bin is empty. Anything you delete lands here first, so you can always get it back.</div>';
}
$('binList').addEventListener('click', async (e) => {
  const row = e.target.closest('.binrow');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('[data-restore]')) return restoreItem(id);
  if (e.target.closest('[data-purge]')) { await api('DELETE', '/api/trash/' + id); trash = trash.filter((x) => x.id !== id); renderBin(); toast('Deleted for good'); }
});
$('binEmpty').onclick = async () => {
  if (!confirm(`Delete ${trash.length} item${trash.length === 1 ? '' : 's'} for good? This cannot be undone.`)) return;
  await api('DELETE', '/api/trash'); trash = []; renderBin(); toast('Bin emptied');
};
$('railBin').onclick = () => setPage('bin');

// ---------------------------------------------------------------- history: completed and past
let hF = 'all';
const endOf = (it, d) => {
  const x = new Date(d);
  if (it.endTime) { const [h, m] = it.endTime.split(':').map(Number); x.setHours(h, m, 0, 0); }
  else if (it.time) { const [h, m] = it.time.split(':').map(Number); x.setHours(h, m + 60, 0, 0); }
  else x.setHours(23, 59, 59, 0);
  return x;
};
function historyRows() {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), rows = [];
  for (const it of items) {
    if (!it.date) { if (it.type !== 'event' && it.done) rows.push({ it, d: null, when: it.doneAt || 0, kind: 'done' }); continue; }
    if (it.type !== 'event') {
      if (!rep(it) && it.done) rows.push({ it, d: day(it.date), when: it.doneAt || dueAt(it, day(it.date)).getTime(), kind: 'done' });
      if (rep(it)) for (const ds of it.doneOn || []) rows.push({ it, d: day(ds), when: dueAt(it, day(ds)).getTime(), kind: 'done' });
    } else if (!rep(it)) {
      if (endOf(it, day(it.date)) < now) rows.push({ it, d: day(it.date), when: dueAt(it, day(it.date)).getTime(), kind: 'past' });
    } else {
      for (let i = 0; i < 120; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        if (d < day(it.date)) break;
        if (occurs(it, d) && endOf(it, d) < now) rows.push({ it, d, when: dueAt(it, d).getTime(), kind: 'past' });
      }
    }
  }
  return rows.sort((a, b) => b.when - a.when);
}
const lateText = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? '' : 's'}`; };
function groupLabel(ms) {
  const d = new Date(ms), now = new Date(), dd = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (!ms) return 'Earlier';
  if (dd <= 0) return 'Today';
  if (dd === 1) return 'Yesterday';
  if (dd < 7) return DOWL[d.getDay()];
  return `${MON[d.getMonth()]} ${d.getFullYear()}`;
}
function historyRow(r) {
  const it = r.it, c = color(it.category), meta = [`<span class="kind">${KIND[it.type]}</span>`];
  if (it.category) meta.push(`<span><i class="dot" style="background:${c}"></i> ${esc(it.category)}</span>`);
  if (r.d) meta.push(`<span>${it.type === 'event' ? '' : 'Due '}${DOW[r.d.getDay()]} ${r.d.getDate()} ${MON[r.d.getMonth()].slice(0, 3)}${it.time ? ', ' + it.time + (it.endTime ? ' to ' + it.endTime : '') : ''}</span>`);
  let lead;
  if (r.kind === 'done') {
    lead = `<button type="button" class="circle on" data-undo title="Mark as not done" aria-label="Mark as not done"></button>`;
    if (!rep(it) && it.doneAt) {
      const done = new Date(it.doneAt), late = r.d ? it.doneAt - dueAt(it, r.d).getTime() : 0;
      meta.push(`<span>Completed ${DOW[done.getDay()]} ${done.getDate()} ${MON[done.getMonth()].slice(0, 3)}, ${pad(done.getHours())}:${pad(done.getMinutes())}</span>`);
      if (r.d && it.type === 'assignment') meta.push(late > 0 ? `<span class="pill late">${lateText(late)} late</span>` : `<span class="pill ok">On time</span>`);
    }
  } else lead = `<span class="evmark" style="--c:${c}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg></span>`;
  return `<div class="hrow" data-id="${it.id}" data-d="${r.d ? ymd(r.d) : ''}">${lead}<div class="tx"><div class="ti">${esc(it.title)}</div><div class="me">${meta.join('')}</div></div>${r.kind === 'done' ? '<button type="button" class="linkbtn undo" data-undo>Undo</button>' : ''}</div>`;
}
function renderHistory() {
  const all = historyRows(), rows = all.filter((r) => hF === 'all' || r.it.type === hF), now = Date.now(), m30 = now - 30 * 86400000;
  const doneRecent = all.filter((r) => r.kind === 'done' && r.when >= m30), withData = doneRecent.filter((r) => r.it.type === 'assignment' && !rep(r.it) && r.it.doneAt && r.d);
  const onTime = withData.filter((r) => r.it.doneAt <= dueAt(r.it, r.d).getTime()).length;
  $('hStats').innerHTML = [
    [doneRecent.length, 'Completed in the last 30 days'],
    [withData.length ? Math.round((onTime / withData.length) * 100) + '%' : 'None yet', 'Assignments finished on time'],
    [all.filter((r) => r.kind === 'past' && r.when >= m30).length, 'Events in the last 30 days'],
  ].map(([n, l]) => `<div class="hstat"><b>${n}</b><span>${l}</span></div>`).join('');
  document.querySelectorAll('#histTabs button').forEach((b) => (b.dataset.on = b.dataset.h === hF));
  $('hCount').textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) { $('hList').innerHTML = `<div class="empty scard">${hF === 'event' ? 'No past events yet.' : 'Nothing here yet. Tick off an assignment or to-do and it will show up here.'}</div>`; return; }
  let h = '', last = null;
  for (const r of rows) {
    const g = groupLabel(r.when);
    if (g !== last) { if (last !== null) h += '</section>'; h += `<section class="gcard hgroup"><div class="grp"><span>${g}</span></div>`; last = g; }
    h += historyRow(r);
  }
  $('hList').innerHTML = h + '</section>';
}
$('histTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { hF = b.dataset.h; renderHistory(); } };
$('hList').addEventListener('click', (e) => {
  const row = e.target.closest('.hrow');
  if (!row) return;
  if (e.target.closest('[data-undo]')) return toggle(row.dataset.id, row.dataset.d);
  openForm(items.find((x) => x.id === row.dataset.id));
});
$('railHistory').onclick = () => setPage('history');

// ---------------------------------------------------------------- settings page (account)
let photoNew = null; // null = unchanged, '' = removed, otherwise a new picture
const showPhoto = (src) => { $('photoImg').hidden = !src; $('photoIcon').hidden = !!src; if (src) $('photoImg').src = src; $('photoPick').textContent = src ? 'Change photo' : 'Add a photo'; $('photoRemove').hidden = !src; };
function fillProfile() {
  photoNew = null; $('pName').value = P.name; $('pEmail').value = P.email; $('pPhone').value = P.phone; showPhoto(P.photo);
  $('profileMsg').textContent = ''; $('delConfirm').value = ''; $('delBtn').disabled = true; $('delMsg').textContent = '';
  $('delLabel').textContent = P.email ? `Type ${P.email} to confirm` : 'Type DELETE to confirm';
}
const flash = (el, text, bad) => { el.textContent = text; el.classList.toggle('bad', !!bad); };
$('photoBtn').onclick = $('photoPick').onclick = () => $('photoFile').click();
$('photoRemove').onclick = () => { photoNew = ''; showPhoto(''); };
$('photoFile').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) return flash($('profileMsg'), 'Choose a picture.', true);
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 240 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    photoNew = c.toDataURL('image/jpeg', 0.82); showPhoto(photoNew); flash($('profileMsg'), '');
  } catch { flash($('profileMsg'), 'That picture could not be read. Try a JPG or PNG.', true); }
};
$('profileForm').onsubmit = async (e) => {
  e.preventDefault();
  const body = { name: $('pName').value, email: $('pEmail').value, phone: $('pPhone').value };
  if (photoNew !== null) body.photo = photoNew;
  const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) return flash($('profileMsg'), data.error || 'Could not save.', true);
  P = data; photoNew = null; applyTheme(); fillProfile(); flash($('profileMsg'), 'Saved');
  setTimeout(() => flash($('profileMsg'), ''), 2500);
};
$('delConfirm').oninput = (e) => { $('delBtn').disabled = e.target.value.trim().toLowerCase() !== (P.email || 'DELETE').toLowerCase(); };
$('delForm').onsubmit = async (e) => {
  e.preventDefault();
  const r = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: $('delConfirm').value }) });
  if (!r.ok) return flash($('delMsg'), (await r.json()).error || 'Could not delete.', true);
  try { Object.keys(localStorage).filter((k) => k.startsWith('planner:')).forEach((k) => localStorage.removeItem(k)); } catch {}
  location.reload();
};
// Backups
const backupLabel = (n) => {
  const m = n.match(/^data-(\d{4}-\d{2}-\d{2})\.json$/);
  if (m) return `Daily, ${fmtDay(m[1])}`;
  if (/pre-delete/.test(n)) return 'Before account deletion';
  if (/pre-restore/.test(n)) return 'Before a restore';
  const mm = n.match(/^data-manual-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})\.json$/);
  return mm ? `Manual, ${fmtDay(mm[1])} ${mm[2]}:${mm[3]}` : n;
};
async function loadBackups() {
  const list = await api('GET', '/api/backups');
  $('bList').innerHTML = list.length ? list.slice(0, 8).map((b) => `<div class="brow"><span><b>${esc(backupLabel(b.name))}</b><small>${Math.max(1, Math.round(b.size / 1024))} KB</small></span><button type="button" class="btn ghost sm" data-restore="${esc(b.name)}">Restore</button></div>`).join('') : '<p class="note">No backups yet.</p>';
}
$('bList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-restore]');
  if (!b || !confirm('Replace your current data with this backup? What you have now is saved as a backup first.')) return;
  const r = await fetch(`/api/backups/${encodeURIComponent(b.dataset.restore)}/restore`, { method: 'POST' });
  if (!r.ok) return flash($('bMsg'), 'That backup could not be restored.', true);
  location.reload();
});
$('bNow').onclick = async () => { await api('POST', '/api/backups'); await loadBackups(); flash($('bMsg'), 'Backed up'); setTimeout(() => flash($('bMsg'), ''), 2500); };
$('railSettings').onclick = () => setPage('settings');
$('mKeys').onclick = () => { $('userMenu').hidden = true; $('help').showModal(); };
$('helpClose').onclick = () => $('help').close();
$('mProfile').onclick = () => { $('userMenu').hidden = true; setPage('settings'); };

// ---------------------------------------------------------------- search
// Finds items on any date, not only the ones on screen.
let sList = [], sIdx = 0;
function drawSearch() {
  const box = $('sres'), t = $('q').value.trim().toLowerCase();
  if (!t) { box.hidden = true; return; }
  const words = t.split(/\s+/), today = new Date().setHours(0, 0, 0, 0);
  sList = items
    .filter((it) => { const hay = `${it.title} ${it.notes} ${it.category} ${KIND[it.type]} ${it.date}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => (!!a.done - !!b.done) || Math.abs(day(a.date || '2100-01-01') - today) - Math.abs(day(b.date || '2100-01-01') - today))
    .slice(0, 8);
  sIdx = Math.min(sIdx, Math.max(0, sList.length - 1));
  box.hidden = false;
  box.innerHTML = sList.length ? sList.map((it, i) => {
    const when = it.date ? `${DOW[day(it.date).getDay()]} ${day(it.date).getDate()} ${MON[day(it.date).getMonth()].slice(0, 3)}${it.time ? ', ' + it.time : ''}` : 'No date';
    return `<button type="button" class="sr ${i === sIdx ? 'on' : ''}" data-i="${i}" role="option"><i class="dot" style="background:${color(it.category)}"></i><span class="st ${it.done ? 'dn' : ''}">${esc(it.title)}</span><span class="sm">${KIND[it.type]} · ${when}</span></button>`;
  }).join('') : '<div class="sempty">No matches</div>';
}
function pickSearch(it) {
  if (!it) return;
  $('q').value = ''; $('sres').hidden = true; $('q').blur();
  if (it.date) { cur = day(it.date); autoscroll = true; }
  setPage('cal'); render(); openForm(it);
}
$('q').addEventListener('input', () => { sIdx = 0; drawSearch(); });
$('q').addEventListener('focus', drawSearch);
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + sList.length) % Math.max(1, sList.length); drawSearch(); }
  else if (e.key === 'Enter') { e.preventDefault(); pickSearch(sList[sIdx]); }
  else if (e.key === 'Escape') { $('q').value = ''; $('sres').hidden = true; $('q').blur(); }
});
$('sres').addEventListener('mousedown', (e) => { const b = e.target.closest('.sr'); if (b) { e.preventDefault(); pickSearch(sList[+b.dataset.i]); } });
document.addEventListener('click', (e) => { if (!e.target.closest('.swrap')) $('sres').hidden = true; });

// ---------------------------------------------------------------- start
(async () => {
  const st = await api('GET', '/api/state');
  P = { ...P, ...st.profile }; trash = st.trash || []; sec = st.security || sec; S = norm(st.settings); items = st.items; notepad = st.notepad || notepad;
  setPage(page);
  render();
  if (PlannerNote.wasOpen()) { PlannerNote.open(notepad); noteBtn(); }
  setInterval(() => { if (!document.querySelector('dialog[open]')) { renderCal(); renderTasks(); } }, 60000);
})();
})();
