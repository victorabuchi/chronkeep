// ---------------------------------------------------------------- events
$('calscroll').addEventListener('click', (e) => {
  if (suppressClick) return;
  const dueBtn = e.target.closest('[data-due]');
  if (dueBtn) return openDuePop(dueBtn.dataset.due, dueBtn);
  const tick = e.target.closest('[data-tick]');
  const el = e.target.closest('[data-id]');
  if (tick && el) return toggle(el.dataset.id, el.dataset.d);
  if (el) return openForm(items.find((x) => x.id === el.dataset.id), { occ: el.dataset.occ || el.dataset.d });
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
  if (e.target.closest('[data-tick]')) {
    // a merged row ticks every task in it, one after the other
    if (row.dataset.ids) { (async () => { for (const id of row.dataset.ids.split(',')) await toggle(id, row.dataset.d); })(); return; }
    return toggle(row.dataset.id, row.dataset.d);
  }
  const st = e.target.closest('[data-substep]');
  if (st) return tickStep(row.dataset.id, st.closest('.substep').dataset.sid, row.dataset.d);
  openForm(items.find((x) => x.id === row.dataset.id), { occ: row.dataset.d });
});
$('quick').onsubmit = async (e) => {
  e.preventDefault();
  const title = $('qTitle').value.trim();
  if (!title) return;
  await createFromText(title, { type: $('qType').value, date: $('qDate').value, time: $('qTime').value });
  $('qTitle').value = ''; $('qTime').value = ''; $('qPrev').hidden = true; $('qTitle').focus();
};
$('qTitle').addEventListener('input', () => {
  const t = $('qTitle').value.trim();
  if (!t) return ($('qPrev').hidden = true);
  const { p, label } = previewOf(t, { type: $('qType').value, date: $('qDate').value, time: $('qTime').value });
  $('qPrev').hidden = !p.found.length; $('qPrev').innerHTML = `<span>Reads as</span> <b>${esc(label)}</b>`;
});
$('qType').addEventListener('change', () => $('qTitle').dispatchEvent(new Event('input')));
$('btnAdd').onclick = () => openForm(null);
const step = (n) => {
  if (view === 'month') cur = new Date(cur.getFullYear(), cur.getMonth() + n, 1);
  else cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + n * (view === 'week' ? (narrow() ? 3 : 7) : 1));
  navDir = n; autoscroll = true; render();
};
$('prev').onclick = () => step(-1); $('next').onclick = () => step(1);
const goToday = () => { navDir = cur < new Date() ? 1 : -1; cur = new Date(); autoscroll = true; render(); };
$('todayBtn').onclick = goToday;
$('viewSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) { view = b.dataset.v; store('planner:view', view); autoscroll = true; render(); } };
document.querySelectorAll('[data-typetabs]').forEach((box) => (box.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; typeF = b.dataset.f; document.querySelectorAll('[data-typetabs] button').forEach((x) => (x.dataset.on = x.dataset.f === typeF));
  // On the Tasks page the type box next to quick add follows the switch (and the other way round, below).
  if (page === 'tasks' && ['assignment', 'todo', 'event'].includes(typeF)) $('qType').value = typeF;
  render(); }));
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

// A card (the item dialog, the help, ...) closes when you tap anywhere outside it: no need to scroll down to Cancel.
document.addEventListener('click', (e) => {
  const dlg = e.target;
  if (!(dlg instanceof HTMLDialogElement) || !dlg.open) return;
  const r = dlg.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
});

// On the Tasks page, choosing a type in the box next to quick add switches the page to it: Assignment, To-do or Event.
$('qType').addEventListener('change', () => {
  if (page !== 'tasks') return;
  typeF = $('qType').value;
  document.querySelectorAll('[data-typetabs] button').forEach((x) => (x.dataset.on = x.dataset.f === typeF));
  render();
});
