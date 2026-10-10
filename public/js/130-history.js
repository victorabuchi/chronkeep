// ---------------------------------------------------------------- history: completed and past
let hF = 'all';
const endOf = (it, d) => Recur.endOf(it, ymd(d));
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
  openForm(items.find((x) => x.id === row.dataset.id), { occ: row.dataset.d });
});
$('railHistory').onclick = () => setPage('history');
