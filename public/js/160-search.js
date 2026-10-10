// ---------------------------------------------------------------- search
// Finds items on any date, not only the ones on screen.
let sList = [], sIdx = 0;
function drawSearch() {
  const box = $('sres'), t = $('q').value.trim().toLowerCase();
  if (!t) { box.hidden = true; return; }
  const words = t.split(/\s+/), today = new Date().setHours(0, 0, 0, 0);
  sList = items
    .filter((it) => { const hay = `${it.title} ${it.notes} ${it.location || ''} ${it.category} ${KIND[it.type]} ${it.date}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => (!!a.done - !!b.done) || Math.abs(day(a.date || '2100-01-01') - today) - Math.abs(day(b.date || '2100-01-01') - today))
    .slice(0, 8);
  sIdx = Math.min(sIdx, sList.length);
  box.hidden = false;
  const raw = $('q').value.trim(), add = `<button type="button" class="sr add ${sIdx === sList.length ? 'on' : ''}" data-add role="option"><i class="plus">+</i><span class="st">Add "${esc(raw)}"</span><span class="sm">${esc(previewOf(raw, { type: 'todo' }).label)}</span></button>`;
  box.innerHTML = (sList.length ? sList.map((it, i) => {
    const when = it.date ? `${DOW[day(it.date).getDay()]} ${day(it.date).getDate()} ${MON[day(it.date).getMonth()].slice(0, 3)}${it.time ? ', ' + it.time : ''}` : 'No date';
    return `<button type="button" class="sr ${i === sIdx ? 'on' : ''}" data-i="${i}" role="option"><i class="dot" style="background:${color(it.category)}"></i><span class="st ${it.done ? 'dn' : ''}">${esc(it.title)}</span><span class="sm">${KIND[it.type]} · ${when}</span></button>`;
  }).join('') : '') + add;
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
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + sList.length + 1) % (sList.length + 1); drawSearch(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (sIdx === sList.length) { const text = $('q').value.trim(); $('q').value = ''; $('sres').hidden = true; $('q').blur(); if (text) createFromText(text, { type: 'todo' }); } else pickSearch(sList[sIdx]); }
  else if (e.key === 'Escape') { $('q').value = ''; $('sres').hidden = true; $('q').blur(); }
});
$('sres').addEventListener('mousedown', (e) => {
  const b = e.target.closest('.sr'); if (!b) return;
  e.preventDefault();
  if (b.dataset.add !== undefined) { const text = $('q').value.trim(); $('q').value = ''; $('sres').hidden = true; if (text) createFromText(text, { type: 'todo' }); } else pickSearch(sList[+b.dataset.i]);
});
document.addEventListener('click', (e) => { if (!e.target.closest('.swrap')) $('sres').hidden = true; });
