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
  const resize = !!e.target.closest('.rz'), x0 = e.clientX, y0 = e.clientY, s0 = toMin(it.time), multi = Recur.spanDays(it) > 0, dur = it.endTime && !multi ? Math.max(15, toMin(it.endTime) - s0) : 60;
  const isFirst = el.dataset.first !== '0', isLast = el.dataset.last !== '0', occ = el.dataset.occ || it.date, k = Math.round((day(el.dataset.d) - day(occ)) / 86400000);
  if (resize && (!isLast || multi)) return; // long events are resized in the edit form
  const cols = [...document.querySelectorAll('.daycol')], colAt = (x) => cols.find((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
  let moved = false, nd = el.dataset.d, ns = s0, ne = s0 + dur;
  const label = () => { const t = el.querySelector('.tm'); if (t) t.textContent = `${hhmm(ns)} to ${hhmm(ne)}`; };
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    if (!moved) { moved = true; el.classList.add('dragging'); document.body.classList.add('dragging-ev'); }
    const dm = ((ev.clientY - y0) / HH) * 60;
    if (resize) { ne = Math.max(s0 + 15, Math.min(S.dayEnd * 60, snap15(s0 + dur + dm))); el.style.height = `${((ne - s0) / 60) * HH - 2}px`; return label(); }
    if (isFirst) { ns = Math.max(S.dayStart * 60, Math.min(S.dayEnd * 60 - 15, snap15(s0 + dm))); ne = ns + dur; }
    const c = rep(it) ? null : colAt(ev.clientX);
    if (c) { nd = ymd(new Date(day(c.dataset.col).getTime() - k * 86400000 + 3600000)); if (el.parentElement !== c) c.appendChild(el); el.style.left = '1px'; el.style.width = 'calc(100% - 3px)'; }
    if (isFirst) el.style.top = `${((ns - S.dayStart * 60) / 60) * HH}px`;
    if (isFirst && !multi) label();
  };
  const up = async () => {
    removeEventListener('pointermove', move); document.body.classList.remove('dragging-ev');
    if (!moved) return;
    endClick(); el.classList.remove('dragging');
    const before = { date: it.date, time: it.time, endTime: it.endTime || '', endDate: it.endDate || '' }, body = { time: hhmm(ns), endTime: multi ? (it.endTime || '') : hhmm(ne) };
    if (!rep(it) && !resize) { body.date = nd; if (it.endDate) body.endDate = ymd(new Date(day(it.endDate).getTime() + (day(nd) - day(it.date)) + 3600000)); }
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
