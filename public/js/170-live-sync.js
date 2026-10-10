// ---------------------------------------------------------------- keeping up with the server
// Buttons on notifications, calendar syncs and other windows change data behind this page's back.
function showBanner() { $('banner').hidden = macStatus !== 'denied' || sessionStorage.getItem('planner:banner') === '1'; }
$('bannerOpen').onclick = () => api('POST', '/api/mac-settings');
$('bannerHide').onclick = () => { try { sessionStorage.setItem('planner:banner', '1'); } catch {} showBanner(); };
async function syncFromServer() {
  if (document.hidden || document.querySelector('dialog[open]') || document.body.classList.contains('dragging-ev')) return;
  try {
    const st = await api('GET', '/api/state');
    if (JSON.stringify(st.items) !== JSON.stringify(items) || JSON.stringify(st.trash || []) !== JSON.stringify(trash)) { items = st.items; trash = st.trash || []; render(); }
    if ((st.mac || 'unknown') !== macStatus) { macStatus = st.mac || 'unknown'; showBanner(); }
  } catch {}
}
setInterval(syncFromServer, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncFromServer(); });
