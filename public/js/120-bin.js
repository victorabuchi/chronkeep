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
