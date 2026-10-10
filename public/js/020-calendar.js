// ---------------------------------------------------------------- calendar
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekDays() {
  const start = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - ((cur.getDay() - S.weekStart + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)).filter((d) => S.showWeekends || (d.getDay() !== 0 && d.getDay() !== 6));
}

function title(days) {
  if (view === 'month') return `${MON[cur.getMonth()]} ${cur.getFullYear()}`;
  if (view === 'day') return `${DOWL[cur.getDay()]}, ${MON[cur.getMonth()]} ${cur.getDate()}, ${cur.getFullYear()}`;
  const a = days[0], b = days[days.length - 1];
  return a.getMonth() === b.getMonth() ? `${MON[a.getMonth()]} ${a.getDate()} to ${b.getDate()}, ${b.getFullYear()}` : `${MON[a.getMonth()].slice(0, 3)} ${a.getDate()} to ${MON[b.getMonth()].slice(0, 3)} ${b.getDate()}, ${b.getFullYear()}`;
}

function chip(it, d, month) {
  const cont = it.type === 'event' && it.time && Recur.startFor(it, d) !== ymd(d);
  const done = isDone(it, d), c = color(it.category), task = it.type !== 'event';
  const late = task && !done && dueAt(it, d) < new Date();
  return `<div class="chip ${done ? 'done' : ''} ${late ? 'late' : ''}" ${rep(it) ? '' : 'draggable="true"'} data-id="${it.id}" data-d="${ymd(d)}" data-occ="${it.type === 'event' ? Recur.startFor(it, d) || ymd(d) : ymd(d)}" style="--c:${c}" title="${esc(it.title)}">${task ? `<button type="button" class="tick ${done ? 'on' : ''}" data-tick aria-label="Tick off"></button>` : ''}<span class="nm">${it.priority === 'high' ? '<b class="hi" title="High priority">!</b> ' : ''}${esc(it.title)}</span>${it.time ? `<span class="tm">${cont ? (Recur.segment(it, d, 0, 1440).last && it.endTime ? 'until ' + it.endTime : 'continues') : it.time}</span>` : ''}</div>`;
}

// Overlapping events share the column width.
function lanes(list) {
  list.sort((a, b) => a.s - b.s || a.e - b.e);
  let group = [], gEnd = 0;
  const flush = () => { const n = Math.max(0, ...group.map((g) => g.lane)) + 1; group.forEach((g) => (g.n = n)); group = []; gEnd = 0; };
  for (const ev of list) {
    if (group.length && ev.s >= gEnd) flush();
    const used = group.filter((g) => g.e > ev.s).map((g) => g.lane);
    let l = 0; while (used.includes(l)) l++;
    ev.lane = l; group.push(ev); gEnd = Math.max(gEnd, ev.e);
  }
  flush();
  return list;
}

function renderGrid(days) {
  const n = days.length, rows = S.dayEnd - S.dayStart, top0 = S.dayStart * 60, now = new Date(), todayS = ymd(now);
  let head = `<div class="dhead corner"></div>`, due = `<div class="due lab">DUE</div>`, cols = '';
  for (const d of days) {
    const t = ymd(d) === todayS;
    head += `<div class="dhead ${t ? 'today' : ''}"><span class="dw">${DOW[d.getDay()]}</span><span class="dn">${d.getDate()}</span></div>`;
    const dayItems = items.filter((it) => vis(it) && showsOn(it, d));
    const timed = [], dueList = [];
    for (const it of dayItems) {
      if (it.type === 'event' && it.time) {
        const sg = Recur.segment(it, d, top0, S.dayEnd * 60), e = sg.first && sg.last ? Math.max(sg.start + 15, sg.end) : sg.end; // a part that ends before the first hour shown goes in the top row
        if (e <= top0 || sg.start >= S.dayEnd * 60) dueList.push(it); else timed.push({ it, sg, s: Math.max(sg.start, top0), e: Math.min(e, S.dayEnd * 60) });
      } else dueList.push(it);
    }
    dueList.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    due += `<div class="due ${t ? 'today' : ''}" data-drop="${ymd(d)}">${dueList.map((it) => chip(it, d)).join('')}</div>`;
    let evs = lanes(timed).map((ev) => {
      const c = color(ev.it.category), w = 100 / ev.n;
      const sg = ev.sg, label = sg.first && sg.last ? `${ev.it.time}${ev.it.endTime ? ' to ' + ev.it.endTime : ''}` : sg.first ? `${ev.it.time} and on` : sg.last ? `until ${ev.it.endTime || 'the evening'}` : 'All day';
      return `<div class="ev ${sg.first ? '' : 'cont-up'} ${sg.last ? '' : 'cont-down'}" data-id="${ev.it.id}" data-d="${ymd(d)}" data-occ="${sg.occ}" data-first="${sg.first ? 1 : 0}" data-last="${sg.last ? 1 : 0}" style="top:${((ev.s - top0) / 60) * HH}px;height:${Math.max(26, ((ev.e - ev.s) / 60) * HH - 2)}px;left:calc(${ev.lane * w}% + 1px);width:calc(${w}% - 3px);--c:${c}"><div class="tm">${label}</div><div class="nm">${esc(ev.it.title)}</div>${ev.it.location ? `<div class="sb">${esc(ev.it.location)}</div>` : ev.it.category ? `<div class="sb">${esc(ev.it.category)}</div>` : ''}<i class="rz" aria-hidden="true"></i></div>`;
    }).join('');
    if (t) { const m = now.getHours() * 60 + now.getMinutes(); if (m >= top0 && m <= S.dayEnd * 60) evs += `<div class="nowline" style="top:${((m - top0) / 60) * HH}px"></div>`; }
    cols += `<div class="daycol ${t ? 'today' : ''}" data-col="${ymd(d)}">${evs}</div>`;
  }
  const gut = Array.from({ length: rows }, (_, i) => `<span style="top:${i * HH + (i ? 0 : 2)}px">${S.dayStart + i}:00</span>`).join('');
  return `<div class="stick"><div class="cols" style="--n:${n}">${head}</div><div class="cols" style="--n:${n}">${due}</div></div><div class="cols" style="--n:${n};--rows:${rows}"><div class="gut">${gut}</div>${cols}</div>`;
}

function renderMonth() {
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() - S.weekStart + 7) % 7));
  const weeks = Math.ceil((((first.getDay() - S.weekStart + 7) % 7) + new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()) / 7);
  let h = `<div class="month" style="grid-template-rows:auto repeat(${weeks},minmax(104px,1fr))">`;
  for (let i = 0; i < 7; i++) h += `<div class="mh">${DOW[(i + +S.weekStart) % 7]}</div>`;
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const list = items.filter((it) => vis(it) && showsOn(it, d)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    h += `<div class="mday ${d.getMonth() !== cur.getMonth() ? 'other' : ''} ${ymd(d) === ymd(new Date()) ? 'today' : ''}" data-go="${ymd(d)}"><span class="n">${d.getDate()}</span>${list.slice(0, 4).map((it) => chip(it, d)).join('')}${list.length > 4 ? `<span class="more">+${list.length - 4} more</span>` : ''}</div>`;
  }
  return h + '</div>';
}

function renderCal() {
  const days = view === 'week' ? weekDays() : [cur];
  $('ctitle').textContent = title(days);
  const wk = (() => { const t = new Date(Date.UTC(days[0].getFullYear(), days[0].getMonth(), days[0].getDate() + 3)); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 86400000 + 1 - ((t.getUTCDay() + 6) % 7) + 3) / 7); })();
  $('eyebrow').textContent = view === 'week' ? `Week ${wk}` : view === 'day' ? 'Day' : 'Month';
  const box = $('calscroll'), keep = box.scrollTop;
  box.innerHTML = view === 'month' ? renderMonth() : renderGrid(days);
  document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
  if (view !== 'month' && autoscroll) {
    const m = new Date().getHours() * 60 + new Date().getMinutes();
    const to = days.some((d) => ymd(d) === ymd(new Date())) ? Math.max(0, ((m - S.dayStart * 60) / 60) * HH - box.clientHeight * 0.4) : 0;
    if (calShown) { box.scrollTop = 0; box.scrollTo({ top: to, behavior: 'smooth' }); } else box.scrollTop = to;
  } else box.scrollTop = keep;
  if (autoscroll && calShown) { box.style.setProperty('--dir', navDir); box.classList.remove('flip'); void box.offsetWidth; box.classList.add('flip'); }
  calShown = true; navDir = 0;
  autoscroll = false;
}
