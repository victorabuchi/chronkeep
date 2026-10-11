// Which reminders are due right now, for one person's data. This is the cloud's version of the Mac server's tick():
// the same rules (reminders before the time, repeating reminders, overdue nags, morning summary), but it works from
// "what fell due since the last look" so it needs no per-item bookkeeping and cannot fire old reminders in a burst.
//
// All times are wall-clock times in the person's own time zone: pass `now` as a Date whose local fields read that
// wall-clock time (see wallNow). `state` is what we remember between looks: { last, nudged, nag, digest }.
const Recur = require('../public/recur.js');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const KIND = { assignment: 'Assignment', event: 'Event', todo: 'To-do' };
const lead = (m) => (m >= 1440 ? `${Math.round(m / 1440)} day${m >= 2880 ? 's' : ''}` : m >= 60 ? `${Math.round(m / 60)} hour${m >= 120 ? 's' : ''}` : `${m} min`);
const human = (m) => { m = Math.round(m); const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60; return d ? `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}` : h ? `${h} h${mi ? ` ${mi} min` : ''}` : `${mi} min`; };

// A Date whose local fields are the wall-clock time in `tz` right now.
function wallNow(tz, at = new Date()) {
  try { return new Date(at.toLocaleString('en-US', { timeZone: tz || 'UTC' })); } catch { return new Date(at.toLocaleString('en-US', { timeZone: 'UTC' })); }
}

const isDoneOn = (it, d) => (!it.repeat || it.repeat === 'none' ? !!it.done : (it.doneOn || []).includes(ymd(d)));
function atOn(it, d, S) {
  const [h, m] = (it.time || `${pad(S.allDayHour ?? 9)}:00`).split(':').map(Number);
  const at = new Date(d); at.setHours(h, m, 0, 0); return at;
}
function activeRule(it, due, now) {
  const left = (due - now) / 60000;
  if (left <= 0) return null;
  let best = null;
  for (const r of it.nudges || []) {
    const from = r.from === 'day' ? (due - new Date(due).setHours(0, 0, 0, 0)) / 60000 : Number(r.from);
    if (left <= from && (!best || from < best.from)) best = { from, every: Number(r.every) };
  }
  return best;
}
const when = (d, it) => `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${it.time ? ', ' + it.time : ''}`;

// A first state for someone who has just allowed notifications: nothing that is already overdue is nagged at once.
function initState(doc, now) {
  const S = doc.settings || {}, nag = {};
  for (const it of doc.items || []) if (it.date && !it.done && (!it.repeat || it.repeat === 'none') && it.type !== 'event' && atOn(it, new Date(it.date + 'T00:00'), S) < now) nag[it.id] = now.getTime();
  return { last: now.getTime(), nudged: {}, nag, digest: '' };
}

// Returns the notifications to send now: [{ title, body, itemId, tag }]. Changes `state`.
function due(doc, state, now) {
  const S = doc.settings || {}, out = [], nowMs = now.getTime();
  const since = Math.max(state.last || nowMs, nowMs - 20 * 60000); // never reach back further than 20 minutes
  state.nudged = state.nudged || {}; state.nag = state.nag || {};
  const push = (title, body, it, tag) => out.push({ title, body, itemId: it ? it.id : null, tag });

  for (const it of doc.items || []) {
    if (!it.date || it.deletedAt) continue;
    const label = KIND[it.type] || 'To-do';
    for (let off = -1; off <= 8; off++) {
      const d = new Date(now); d.setDate(d.getDate() + off);
      if (!Recur.occursOn(it, d) || isDoneOn(it, d)) continue;
      const at = atOn(it, d, S);
      for (const rem of it.reminders || []) {
        const fire = at.getTime() - rem * 60000;
        if (fire > since && fire <= nowMs) push(`${label}: ${it.title}`, `${rem > 0 ? `Due in ${lead(rem)}` : 'Due now'} (${when(d, it)})${it.category ? ', ' + it.category : ''}`, it, `${it.id}@${ymd(d)}@${rem}`);
      }
    }
    // repeating reminders until it is ticked off
    if ((it.nudges || []).length) {
      for (let off = 0; off <= 8; off++) {
        const d = new Date(now); d.setDate(d.getDate() + off);
        if (!Recur.occursOn(it, d) || isDoneOn(it, d)) continue;
        const dueAt = atOn(it, d, S), rule = activeRule(it, dueAt, now);
        if (!rule) continue;
        const key = `${it.id}@${ymd(d)}`;
        if (nowMs - (state.nudged[key] || 0) >= rule.every * 60000 - 2000) {
          push(`${label}: ${it.title}`, `Due in ${human((dueAt - now) / 60000)} (${when(d, it)}). Reminding every ${human(rule.every)} until you tick it off.`, it, key);
          state.nudged[key] = nowMs;
        }
        break;
      }
    }
    // overdue and still not ticked off
    if (S.nagHours > 0 && (!it.repeat || it.repeat === 'none') && !it.done && it.type !== 'event') {
      const dueAt = atOn(it, new Date(it.date + 'T00:00'), S), over = nowMs - dueAt.getTime();
      if (over > 0 && over < 14 * 86400000 && nowMs - (state.nag[it.id] || dueAt.getTime()) >= S.nagHours * 3600000) {
        push(`OVERDUE: ${it.title}`, `${label} was due ${when(dueAt, it)}. Tick it off when it is done.`, it, `${it.id}@overdue`);
        state.nag[it.id] = nowMs;
      }
    }
  }
  // morning summary
  if (S.digestHour >= 0 && now.getHours() >= S.digestHour && state.digest !== ymd(now)) {
    state.digest = ymd(now);
    const today = (doc.items || []).filter((it) => it.date && !it.deletedAt && it.type !== 'event' && Recur.occursOn(it, now) && !isDoneOn(it, now) && (it.repeat !== 'none' && it.repeat ? true : it.date === ymd(now)));
    const late = (doc.items || []).filter((it) => it.date && !it.deletedAt && !it.done && it.type !== 'event' && (!it.repeat || it.repeat === 'none') && it.date < ymd(now));
    if (today.length || late.length) push('Morning summary', `${today.length} due today${late.length ? `, ${late.length} overdue` : ''}${today[0] ? `. First: ${today[0].title}` : ''}`, null, 'summary');
  }
  state.last = nowMs;
  // forget memory of things long gone
  for (const [k, v] of Object.entries(state.nudged)) if (nowMs - v > 3 * 86400000) delete state.nudged[k];
  return out;
}

module.exports = { due, initState, wallNow };
