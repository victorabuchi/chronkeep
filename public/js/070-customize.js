// ---------------------------------------------------------------- settings
let cats = [], setA, setE, setT, nudA, nudE, nudT;
function drawCats() {
  $('sCats').innerHTML = cats.map((c, i) => `<div class="catrow"><input type="color" value="${c.color}" data-i="${i}" data-k="color"><input type="text" value="${esc(c.name)}" data-i="${i}" data-k="name"><button type="button" class="btn ghost" data-x="${i}">✕</button></div>`).join('');
  $('sCats').querySelectorAll('input').forEach((el) => (el.oninput = () => (cats[el.dataset.i][el.dataset.k] = el.value)));
  $('sCats').querySelectorAll('[data-x]').forEach((el) => (el.onclick = () => { cats.splice(el.dataset.x, 1); drawCats(); }));
}
// Calendars: links to follow, files to import.
const ago2 = (ms) => (ms ? ago(ms) : 'never');
async function reloadState() { const st = await api('GET', '/api/state'); S = norm(st.settings); items = st.items; trash = st.trash || []; render(); }
async function loadFeeds() {
  feeds = await api('GET', '/api/feeds');
  $('feedCat').innerHTML = S.categories.map((c) => `<option ${c.name === 'Timetable' ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + (S.categories.some((c) => c.name === 'Timetable') ? '' : '<option selected>Timetable</option>');
  const kindName = (f) => (f.kind === 'assignment' ? 'deadlines' : 'timetable');
  $('feedList').innerHTML = feeds.length ? feeds.map((f) => `<div class="brow" data-fid="${f.id}"><span><b>${esc(f.name)}</b><small style="${f.lastError ? 'color:var(--neg)' : ''}">${f.lastError ? esc(f.lastError) : `${f.count} ${f.kind === 'assignment' ? 'deadline' : 'event'}${f.count === 1 ? '' : 's'} · ${kindName(f)} · synced ${ago2(f.lastSync)} · ${esc(f.category || 'no course')}`}</small></span><span class="binact"><button type="button" class="btn ghost sm" data-edit>Edit</button><button type="button" class="btn ghost sm" data-sync>Sync</button><button type="button" class="btn ghost sm danger" data-drop>Remove</button></span></div>`).join('') : '<p class="note">No calendar links yet.</p>';
}
const syncText = (r) => (r.created || r.updated || r.removed ? `${r.created} added, ${r.updated} updated, ${r.removed} removed` : 'Already up to date');
$('feedAdd').onclick = async () => {
  const body = { name: $('feedName').value, url: $('feedUrl').value, category: $('feedCat').value, kind: $('feedKind').value };
  $('feedAdd').disabled = true; flash($('feedMsg'), 'Adding…');
  const r = await fetch('/api/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), d = await r.json();
  $('feedAdd').disabled = false;
  if (!r.ok) return flash($('feedMsg'), d.error || 'Could not add that.', true);
  $('feedName').value = ''; $('feedUrl').value = ''; flash($('feedMsg'), '');
  toast(`${d.feed.name}: ${d.result.created} event${d.result.created === 1 ? '' : 's'} added`);
  await reloadState(); await loadFeeds();
};
$('feedList').addEventListener('click', async (e) => {
  const row = e.target.closest('[data-fid]'); if (!row) return;
  const f = feeds.find((x) => x.id === row.dataset.fid);
  // Edit: rename it, give it another course, or say it holds deadlines instead of lessons (or the other way round).
  if (e.target.closest('[data-edit]')) {
    const cats = S.categories.map((c) => c.name), opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    row.classList.add('editing');
    row.innerHTML = `<div class="feededit"><label class="field">Name<input data-n maxlength="60" value="${esc(f.name)}"></label>
      <label class="field">Course<select data-c>${opt('', 'No course', f.category)}${cats.map((c) => opt(c, c, f.category)).join('')}${f.category && !cats.includes(f.category) ? opt(f.category, f.category, f.category) : ''}</select></label>
      <label class="field">What it contains<select data-k>${opt('event', 'Timetable: lessons and events, shown in the hours', f.kind)}${opt('assignment', 'Deadlines: exercises and assignments, shown as tasks', f.kind)}</select></label>
      <div class="frm"><button type="button" class="btn sm" data-save>Save</button><button type="button" class="btn ghost sm" data-cancel>Cancel</button><span class="msg" role="status"></span></div></div>`;
    row.querySelector('[data-n]').focus();
    return;
  }
  if (e.target.closest('[data-cancel]')) return loadFeeds();
  if (e.target.closest('[data-save]')) {
    const b = e.target.closest('button'); b.disabled = true; row.querySelector('.msg').textContent = 'Saving…';
    const body = { name: row.querySelector('[data-n]').value, category: row.querySelector('[data-c]').value, kind: row.querySelector('[data-k]').value };
    const r = await fetch(`/api/feeds/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), d = await r.json();
    if (!r.ok && !d.feed) { b.disabled = false; row.querySelector('.msg').textContent = d.error || 'Could not save that.'; return; }
    toast(r.ok ? (d.result ? `${body.name}: now ${body.kind === 'assignment' ? 'deadlines' : 'a timetable'}, ${syncText(d.result)}` : `${body.name} saved`) : d.error);
    await reloadState(); return loadFeeds();
  }
  if (e.target.closest('[data-sync]')) {
    const b = e.target.closest('button'); b.disabled = true; b.textContent = 'Syncing…';
    const r = await fetch(`/api/feeds/${f.id}/sync`, { method: 'POST' }), d = await r.json();
    toast(r.ok ? `${f.name}: ${syncText(d.result)}` : `${f.name}: ${d.error}`);
    await reloadState(); return loadFeeds();
  }
  if (e.target.closest('[data-drop]')) {
    if (!confirm(`Stop following "${f.name}"?`)) return;
    const withEvents = f.count > 0 && confirm(`Also remove the ${f.count} events imported from it?\n\nOK removes them. Cancel keeps them as normal events.`);
    await fetch(`/api/feeds/${f.id}?events=${withEvents ? 'remove' : 'keep'}`, { method: 'DELETE' });
    await reloadState(); await loadFeeds(); toast(withEvents ? 'Calendar and its events removed' : 'Calendar removed, events kept');
  }
});
$('icsFile').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const r = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, ics: await file.text(), category: $('feedCat').value, kind: $('feedKind').value }) }), d = await r.json();
  if (!r.ok) return flash($('feedMsg'), d.error || 'Could not import that file.', true);
  toast(`${file.name}: ${syncText(d)}`); await reloadState();
};

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
async function fillMacNote() {
  try { macStatus = (await api('GET', '/api/mac-status')).status; } catch {}
  showBanner();
  $('macNote').textContent = macStatus === 'ok' ? 'macOS is allowing ChronKeep notifications.' : macStatus === 'denied' ? 'macOS is blocking ChronKeep notifications. Press the button above and allow ChronKeep.' : '';
  $('macNote').style.color = macStatus === 'denied' ? 'var(--neg)' : '';
}
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
  fillSecurity(); fillAutostart(); fillMacNote(); loadFeeds();
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
