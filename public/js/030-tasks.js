// ---------------------------------------------------------------- tasks
function nextOcc(it) {
  if (!rep(it)) return it.date ? day(it.date) : null;
  for (let i = 0; i < 400; i++) {
    const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
    if (occurs(it, d) && !isDone(it, d)) return d;
  }
  return null;
}

function rel(due) {
  const ms = due - new Date(), a = Math.abs(ms), min = Math.round(a / 60000), h = Math.round(a / 3600000), dd = Math.round(a / 86400000);
  const t = min < 60 ? `${min} min` : h < 24 ? `${h} h` : `${dd} day${dd === 1 ? '' : 's'}`;
  return ms < 0 ? [`${t} overdue`, 'late'] : [`in ${t}`, h < 24 ? 'soon' : 'ok'];
}

// Tasks that share a title and a day (Moodle's "Attendance at the exercise sessions", six times) become one row with a count.
function mergeTasks(list) {
  const out = [], seen = new Map();
  for (const o of list) {
    const [it, d] = o, k = `${it.type}|${it.title.trim().toLowerCase()}|${d ? ymd(d) : ''}|${it.done ? 1 : 0}`;
    if (seen.has(k)) seen.get(k).push(o); else { const g = [o]; seen.set(k, g); out.push(g); }
  }
  return out;
}
function taskRow(it, d, group) {
  const done = d ? isDone(it, d) : it.done, c = color(it.category);
  const meta = [];
  meta.push(`<span class="kind">${KIND[it.type]}</span>`);
  if (it.category) meta.push(`<span><i class="dot" style="background:${c}"></i> ${esc(it.category)}</span>`);
  if (d) {
    const due = dueAt(it, d);
    const times = group && group.length > 1 ? [...new Set(group.map(([x]) => x.time).filter(Boolean))].sort().join(', ') : it.time;
    meta.push(`<span>${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}${times ? ', ' + times : ''}</span>`);
    if (!done) { const [t, k] = rel(due); meta.push(`<span class="pill ${k}">${t}</span>`); }
  }
  if (d && !done && (it.nudges || []).length) { const r = activeRule(it, dueAt(it, d), new Date()); if (r) meta.push(`<span class="pill nudge" title="Repeating reminder in force">🔔 every ${everyLabel(r.every)}</span>`); }
  if (it.priority && PRIO[it.priority]) meta.push(`<span class="prio" style="--pc:${PRIO[it.priority][1]}">${PRIO[it.priority][0]}</span>`);
  const subs = it.subtasks || [], sdone = subs.filter((x) => x.done).length;
  if (subs.length) meta.push(`<span class="pill">${sdone}/${subs.length} steps</span>`);
  if ((it.attachments || []).length) meta.push(`<span class="clip" title="${it.attachments.length} file${it.attachments.length === 1 ? '' : 's'}">${CLIP}${it.attachments.length}</span>`);
  if (rep(it)) meta.push('<span>↻ ' + it.repeat + '</span>');
  const stepList = subs.length ? `<div class="subs">${subs.map((x) => `<div class="substep ${x.done ? 'done' : ''}" data-sid="${x.id}"><button type="button" class="circle sm ${x.done ? 'on' : ''}" data-substep aria-label="Tick step"></button><span>${esc(x.text)}</span></div>`).join('')}</div>` : '';
  const late = d && !done && dueAt(it, d) < new Date();
  return `<div class="trow ${done ? 'done' : ''} ${late ? 'late' : ''}" data-id="${it.id}" data-d="${d ? ymd(d) : ''}" ${group && group.length > 1 ? `data-ids="${group.map(([x]) => x.id).join(',')}"` : ''}><button type="button" class="circle ${done ? 'on' : ''}" data-tick aria-label="${group && group.length > 1 ? 'Tick all off' : 'Tick off'}"></button><div class="tx"><div class="ti">${esc(it.title)}${group && group.length > 1 ? ` <b class="cnt" title="${group.length} on this day: ticking it ticks them all">${group.length}</b>` : ''}</div><div class="me">${meta.join('')}</div>${stepList}</div></div>`;
}

function renderTasks() {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const open = [], doneL = [];
  for (const it of items) {
    if (it.type === 'event' || !vis(it) || (typeF === 'event')) continue;
    const d = nextOcc(it);
    if (!rep(it) && it.done) doneL.push([it, d]); else open.push([it, d]);
  }
  const key = ([it, d]) => (d ? dueAt(it, d).getTime() : Infinity), prank = { high: 0, medium: 1, low: 2 };
  const pr = (o) => (prank[o[0].priority] ?? 3);
  open.sort((a, b) => (key(a) === key(b) ? 0 : key(a) < key(b) ? -1 : 1) || pr(a) - pr(b));
  const B = { Overdue: [], Today: [], Tomorrow: [], 'This week': [], Later: [], 'No date': [] };
  for (const o of open) {
    const [it, d] = o;
    if (!d) B['No date'].push(o);
    else if (dueAt(it, d) < now) B.Overdue.push(o);
    else { const diff = Math.round((d - today) / 86400000); (diff === 0 ? B.Today : diff === 1 ? B.Tomorrow : diff <= 7 ? B['This week'] : B.Later).push(o); }
  }
  let h = '';
  for (const [name, list] of Object.entries(B)) if (list.length) h += `<section class="gcard ${name === 'Overdue' ? 'red' : ''}"><div class="grp ${name === 'Overdue' ? 'red' : ''}"><span>${name}</span><span>${list.length}</span></div>` + mergeTasks(list).map((g) => taskRow(g[0][0], g[0][1], g)).join('') + '</section>';
  if (!open.length) h += '<div class="empty">Nothing left to do.</div>';
  if (doneL.length) {
    h += `<button class="showdone" id="showDone">${showDone ? 'Hide' : 'Show'} ${doneL.length} completed</button>`;
    if (showDone) h += `<section class="gcard"><div class="grp"><span>Completed</span><span>${doneL.length}</span></div>` + mergeTasks(doneL.reverse()).map((g) => taskRow(g[0][0], g[0][1], g)).join('') + '</section>';
  }
  $('tlist').innerHTML = h;
  $('tsub').textContent = `${open.length} open${B.Overdue.length ? ` · ${B.Overdue.length} overdue` : ''}`;
  const urgent = B.Overdue.length + B.Today.length;
  $('badge').hidden = !urgent; $('badge').textContent = urgent;
  $('badge').style.background = B.Overdue.length ? '#ff4d4f' : '#f59e0b';
  document.title = `${urgent ? `(${urgent}) ` : ''}${S.name}`;
}

function render() { applyTheme(); renderCal(); renderTasks(); renderHistory(); renderBin(); refreshDuePop(); }
