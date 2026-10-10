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
// Resizing a picture takes a moment. Saving waits for it, so a quick press of Save never loses the photo.
let photoWork = Promise.resolve();
async function readPhoto(file) {
  if (!file.type.startsWith('image/')) return flash($('profileMsg'), 'Choose a picture.', true);
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 240 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    photoNew = c.toDataURL('image/jpeg', 0.82); showPhoto(photoNew); flash($('profileMsg'), '');
  } catch { flash($('profileMsg'), 'That picture could not be read. Try a JPG or PNG.', true); }
}
$('photoFile').onchange = (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) photoWork = readPhoto(file); };
$('profileForm').onsubmit = async (e) => {
  e.preventDefault();
  await photoWork;
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
