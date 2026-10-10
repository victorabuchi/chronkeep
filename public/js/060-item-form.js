// ---------------------------------------------------------------- item form
let fOcc = null, fScope = 'all', fPrio = '', fSubs = [], fPending = [];
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
  $('fEndWrap').hidden = t !== 'event'; $('fLocWrap').hidden = t !== 'event'; $('fPrioWrap').hidden = t === 'event'; $('fSubWrap').hidden = t === 'event';
  if (fresh && !remTouched) { fRem = [...(S.reminderDefaults[t] || [])]; chipSet($('fRem'), fRem, () => (remTouched = true)); fNud = (S.nudgeDefaults[t] || []).map((r) => ({ ...r })); nudgeEditor($('fNud'), fNud, () => (remTouched = true)); }
  if (fresh && t === 'assignment' && !$('fTime').value && !editing) $('fTime').value = S.dueTime;
}
function openForm(it, preset = {}) {
  editing = it; remTouched = !!it;
  $('fHead').textContent = it ? 'Edit' : 'New';
  $('fCat').innerHTML = '<option value="">None</option>' + S.categories.map((c) => `<option>${esc(c.name)}</option>`).join('');
  $('fTitle').value = it?.title || ''; $('fCat').value = it?.category || preset.category || '';
  $('fDate').value = it ? it.date : preset.date || ymd(cur); $('fTime').value = it ? it.time || '' : preset.time || '';
  $('fEnd').value = it?.endTime || preset.endTime || ''; $('fLoc').value = it?.location || '';
  $('fSource').hidden = !(it && it.source); if (it && it.source) $('fSource').textContent = `From a calendar${feeds.find((f) => f.id === it.source.feed) ? ': ' + feeds.find((f) => f.id === it.source.feed).name : ''}. When that calendar changes, it overwrites the title, time and place here. Your reminders and course stay as you set them.`; $('fRepeat').value = it?.repeat || 'none'; $('fNotes').value = it?.notes || '';
  fRem = it ? [...(it.reminders || [])] : [];
  chipSet($('fRem'), fRem, () => (remTouched = true));
  fNud = it ? (it.nudges || []).map((r) => ({ ...r })) : [];
  nudgeEditor($('fNud'), fNud, () => (remTouched = true));
  setType(it ? it.type : preset.type || 'assignment', !it);
  $('fEndDate').value = it?.endDate || ''; $('fUntil').value = it?.repeatUntil || '';
  fPrio = it?.priority || ''; paintPrio(); fSubs = (it?.subtasks || []).map((x) => ({ ...x })); drawSubs(); fPending = []; drawFiles();
  fOcc = it && rep(it) && preset.occ ? preset.occ : null;
  setScope('all'); $('fScope').hidden = !fOcc; $('fScopeNote').hidden = true;
  syncRepeatUi();
  $('fDel').hidden = !it;
  $('dlg').showModal(); $('fTitle').focus();
}
$('fType').onclick = (e) => { const b = e.target.closest('button'); if (b) setType(b.dataset.t, true); };
// Priority, steps and files
const PRIO = { high: ['High', 'var(--neg)'], medium: ['Medium', 'var(--warn)'], low: ['Low', '#2b7bd6'] };
const paintPrio = () => document.querySelectorAll('#fPrio button').forEach((b) => (b.dataset.on = b.dataset.p === fPrio));
$('fPrio').onclick = (e) => { const b = e.target.closest('button'); if (b) { fPrio = b.dataset.p; paintPrio(); } };
const newId = () => Math.random().toString(36).slice(2, 10);
function drawSubs() {
  $('fSubs').innerHTML = fSubs.map((x, i) => `<div class="sub" data-i="${i}"><button type="button" class="circle sm ${x.done ? 'on' : ''}" data-st aria-label="Tick step"></button><input value="${esc(x.text)}" data-sv maxlength="120" aria-label="Step"><button type="button" class="x" data-sx aria-label="Remove step">×</button></div>`).join('');
}
$('fSubs').addEventListener('click', (e) => { const r = e.target.closest('.sub'); if (!r) return; const i = +r.dataset.i; if (e.target.closest('[data-st]')) { fSubs[i].done = !fSubs[i].done; drawSubs(); } else if (e.target.closest('[data-sx]')) { fSubs.splice(i, 1); drawSubs(); } });
$('fSubs').addEventListener('input', (e) => { const r = e.target.closest('.sub'); if (r && e.target.matches('[data-sv]')) fSubs[+r.dataset.i].text = e.target.value; });
$('fSubNew').addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const t = e.target.value.trim(); if (t) { fSubs.push({ id: newId(), text: t, done: false }); e.target.value = ''; drawSubs(); } });
const bytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const CLIP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m20.5 11.5-8.2 8.2a5.3 5.3 0 0 1-7.5-7.5l8.2-8.2a3.5 3.5 0 0 1 5 5l-8.2 8.2a1.8 1.8 0 0 1-2.5-2.5l7.5-7.5"/></svg>';
function drawFiles() {
  const have = (editing && editing.attachments) || [];
  $('fFiles').innerHTML = [...have.map((a) => `<div class="file" data-aid="${a.id}">${CLIP}<a href="/api/files/${editing.id}/${a.id}" target="_blank" rel="noopener">${esc(a.name)}</a><small>${bytes(a.size)}</small><button type="button" class="x" data-fx aria-label="Remove file">×</button></div>`), ...fPending.map((f, i) => `<div class="file pending" data-pi="${i}">${CLIP}<span>${esc(f.name)}</span><small>${bytes(f.size)}, saved with the item</small><button type="button" class="x" data-fx aria-label="Remove file">×</button></div>`)].join('');
}
async function uploadFile(id, f) {
  const r = await fetch(`/api/items/${id}/files?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
  const d = await r.json();
  if (!r.ok) { flash($('fFileMsg'), `${f.name}: ${d.error || 'could not be added'}`, true); return null; }
  return d;
}
$('fFileIn').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) { flash($('fFileMsg'), `${f.name} is larger than 10 MB.`, true); continue; }
    if (editing) { flash($('fFileMsg'), `Adding ${f.name}…`); const meta = await uploadFile(editing.id, f); if (meta) { editing.attachments = [...(editing.attachments || []), meta]; flash($('fFileMsg'), ''); } }
    else fPending.push(f);
  }
  drawFiles();
};
$('fFiles').addEventListener('click', async (e) => {
  const row = e.target.closest('.file'); if (!row || !e.target.closest('[data-fx]')) return;
  if (row.dataset.pi !== undefined) fPending.splice(+row.dataset.pi, 1);
  else { await api('DELETE', `/api/items/${editing.id}/files/${row.dataset.aid}`); editing.attachments = editing.attachments.filter((a) => a.id !== row.dataset.aid); }
  drawFiles();
});

// Repeating items: change the whole series, or only the occurrence you clicked.
const syncRepeatUi = () => { $('fUntilWrap').hidden = $('fRepeat').value === 'none' || fScope === 'this'; $('fRepeatWrap').style.visibility = fScope === 'this' ? 'hidden' : ''; };
function setScope(s) {
  fScope = s;
  document.querySelectorAll('#fScope button').forEach((b) => (b.dataset.on = b.dataset.scope === s));
  $('fScopeNote').hidden = !(fOcc && s === 'this'); if (fOcc) $('fScopeNote').textContent = `Changes apply only to the occurrence on ${fmtDay(fOcc)}. The rest of the series stays as it is.`;
  $('fDel').textContent = fOcc ? (s === 'this' ? 'Delete this one' : 'Delete series') : 'Delete';
  if (fOcc && editing) { $('fDate').value = s === 'this' ? fOcc : editing.date; }
  syncRepeatUi();
}
$('fScope').onclick = (e) => { const b = e.target.closest('button'); if (b) setScope(b.dataset.scope); };
$('fRepeat').onchange = syncRepeatUi;
$('form').onsubmit = async () => {
  let time = $('fTime').value;
  if (fType === 'assignment' && $('fDate').value && !time) time = S.dueTime;
  const body = { type: fType, title: $('fTitle').value.trim(), category: $('fCat').value, date: $('fDate').value, time, endTime: fType === 'event' ? $('fEnd').value : '', endDate: fType === 'event' ? $('fEndDate').value : '', location: fType === 'event' ? $('fLoc').value.trim() : '', reminders: [...fRem].sort((a, b) => b - a), nudges: fNud.map((r) => ({ ...r })), repeat: $('fRepeat').value, repeatUntil: $('fRepeat').value === 'none' ? '' : $('fUntil').value, notes: $('fNotes').value, priority: fType === 'event' ? '' : fPrio, subtasks: fType === 'event' ? [] : fSubs.filter((x) => x.text.trim()).map((x) => ({ id: x.id, text: x.text.trim(), done: !!x.done })) };
  if (body.endDate && body.endDate <= body.date) body.endDate = '';
  // An end time earlier than the start means it ends the next day.
  if (fType === 'event' && body.time && body.endTime && !body.endDate && toMin(body.endTime) <= toMin(body.time) && body.date) body.endDate = ymd(new Date(day(body.date).getTime() + 90000000));
  if (editing && fOcc && fScope === 'this') {
    const { repeat, repeatUntil, ...patch } = body, it = editing, before = { skip: it.skip || [], doneOn: it.doneOn || [] };
    const r = await api('POST', `/api/items/${it.id}/occurrence`, { occ: fOcc, patch });
    Object.assign(it, r.original); items.push(r.created); render();
    toast(`Changed only ${fmtDay(fOcc)}`, 'Undo', async () => { await api('DELETE', '/api/items/' + r.created.id); await api('DELETE', '/api/trash/' + r.created.id); Object.assign(it, await api('PUT', '/api/items/' + it.id, before)); items = items.filter((x) => x.id !== r.created.id); trash = trash.filter((x) => x.id !== r.created.id); render(); });
    return;
  }
  if (editing) Object.assign(editing, await api('PUT', '/api/items/' + editing.id, body));
  else {
    const made = await api('POST', '/api/items', body); items.push(made);
    for (const f of fPending) { const meta = await uploadFile(made.id, f); if (meta) made.attachments = [...(made.attachments || []), meta]; }
    fPending = [];
  }
  render();
};
$('fCancel').onclick = () => $('dlg').close();
$('fDel').onclick = async () => {
  const it = editing;
  $('dlg').close();
  if (fOcc && fScope === 'this') {
    const before = it.skip || [];
    Object.assign(it, await api('PUT', '/api/items/' + it.id, { skip: [...new Set([...before, fOcc])] })); render();
    const occ = fOcc;
    return toast(`Removed ${fmtDay(occ)} from "${it.title}"`, 'Undo', async () => { Object.assign(it, await api('PUT', '/api/items/' + it.id, { skip: before })); render(); });
  }
  await removeItem(it);
};
