// ---------------------------------------------------------------- start
(async () => {
  const st = await api('GET', '/api/state');
  P = { ...P, ...st.profile }; trash = st.trash || []; sec = st.security || sec; macStatus = st.mac || 'unknown'; S = norm(st.settings); items = st.items; notepad = st.notepad || notepad;
  setPage(page);
  render();
  showBanner();
  const want = new URLSearchParams(location.search).get('open'); // clicking a notification opens the item
  if (want) { history.replaceState(null, '', location.pathname); const it = items.find((x) => x.id === want); if (it) { setPage('cal'); if (it.date) { cur = day(it.date); autoscroll = true; render(); } openForm(it); } }
  if (PlannerNote.wasOpen()) { PlannerNote.open(notepad); noteBtn(); }
  setInterval(() => { if (!document.querySelector('dialog[open]')) { renderCal(); renderTasks(); } }, 60000);
})();
