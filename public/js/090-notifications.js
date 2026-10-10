// ---------------------------------------------------------------- notification centre
let nTab = 'upcoming', nData = { history: [], upcoming: [] };
const KINDS = { action: ['Action', 'var(--pos)'], reminder: ['Reminder', 'var(--b)'], repeat: ['Repeating', '#8b5cf6'], overdue: ['Overdue', 'var(--neg)'], summary: ['Summary', 'var(--warn)'], test: ['Test', 'var(--muted)'] };
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
