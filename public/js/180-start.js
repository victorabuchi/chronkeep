// ---------------------------------------------------------------- start
window.matchMedia('(max-width: 640px)').addEventListener('change', () => { autoscroll = true; render(); });
// Signed in to the cloud version: your account is the email you signed up with, reminders come from the phone app,
// and the Mac-only and network cards do not apply.
function goCloud(who) {
  document.documentElement.classList.add('cloud');
  P = { ...P, email: P.email || who.email, name: P.name || who.name };
  $('mOut').hidden = false;
  $('mOut').onclick = async () => { await fetch('/auth/logout', { method: 'POST' }); location.href = '/'; };
  $('notifCard').innerHTML = '<strong>Notifications</strong><p class="note">Reminders arrive on your phone through the ChronKeep app, set up with the repeating-reminder rules above. Install it on your phone and sign in with this account.</p>';
}
(async () => {
  const st = await api('GET', '/api/state');
  P = { ...P, ...st.profile }; trash = st.trash || []; sec = st.security || sec; macStatus = st.mac || 'unknown'; S = norm(st.settings); items = st.items; notepad = st.notepad || notepad;
  if (st.cloud) goCloud(st.cloud);
  setPage(page);
  render();
  showBanner();
  const want = new URLSearchParams(location.search).get('open'); // clicking a notification opens the item
  if (want) { history.replaceState(null, '', location.pathname); const it = items.find((x) => x.id === want); if (it) { setPage('cal'); if (it.date) { cur = day(it.date); autoscroll = true; render(); } openForm(it); } }
  if (PlannerNote.wasOpen()) { PlannerNote.open(notepad); noteBtn(); }
  setInterval(() => { if (!document.querySelector('dialog[open]')) { renderCal(); renderTasks(); } }, 60000);
})();
