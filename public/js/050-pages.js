// ---------------------------------------------------------------- pages
function setPage(p) {
  if (page === 'customize' && p !== 'customize') document.documentElement.style.setProperty('--accent', S.accent); // drop an unsaved colour preview
  page = p; store('planner:page', p);
  // Back on the calendar after the full-screen assignments page: show everything again.
  if (p === 'cal' && (typeF === 'assignment' || typeF === 'todo')) { typeF = 'all'; document.querySelectorAll('[data-typetabs] button').forEach((x) => (x.dataset.on = x.dataset.f === 'all')); }
  $('main').classList.toggle('tpage', p === 'tasks');
  $('main').classList.toggle('spage', p === 'settings');
  $('main').classList.toggle('hpage', p === 'history');
  $('main').classList.toggle('bpage', p === 'bin');
  $('railBin').classList.toggle('on', p === 'bin');
  if (p === 'bin') renderBin();
  $('railHistory').classList.toggle('on', p === 'history');
  $('main').classList.toggle('cpage', p === 'customize');
  $('railSet').classList.toggle('on', p === 'customize');
  if (p === 'customize') fillCustomize();
  $('railSettings').classList.toggle('on', p === 'settings');
  if (p === 'settings') { fillProfile(); loadBackups(); }
  $('tasks').classList.toggle('full', p === 'tasks');
  $('railCal').classList.toggle('on', p === 'cal');
  $('navTasks').classList.toggle('on', p === 'tasks');
  if (p === 'cal') { autoscroll = true; renderCal(); }
  const fresh = { tasks: $('tlist'), history: $('hList'), bin: $('binList') }[p];
  if (fresh) { fresh.classList.add('fresh'); setTimeout(() => fresh.classList.remove('fresh'), 900); }
}
