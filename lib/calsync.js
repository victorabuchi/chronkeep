// Subscribing to calendar links and importing calendar files.
const crypto = require('crypto');
const ics = require('./ics');

const MAX_BYTES = 8 * 1024 * 1024;

// Downloads a calendar link. Throws a message that is fit to show to the person.
async function fetchCalendar(url, fetchFn = fetch) {
  let u;
  try { u = new URL(url); } catch { throw new Error('That is not a web address.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Use an http or https link.');
  let res;
  try { res = await fetchFn(u.toString(), { signal: AbortSignal.timeout(20000), headers: { Accept: 'text/calendar, */*' }, redirect: 'follow' }); }
  catch (e) { throw new Error(e && e.name === 'TimeoutError' ? 'The calendar took too long to answer.' : 'Could not reach that link.'); }
  if (!res.ok) throw new Error(`The link answered with an error (${res.status}).`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('That calendar is too large.');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('That calendar is too large.');
  if (!/^\s*BEGIN:VCALENDAR/i.test(text)) throw new Error('That link did not return a calendar.');
  return text;
}

const FIELDS = ['title', 'notes', 'location', 'date', 'time', 'endTime', 'endDate'];
const fieldsOf = (ev) => ({ type: 'event', title: ev.title, notes: ev.notes, location: ev.location, date: ev.date, time: ev.time, endTime: ev.endTime, endDate: ev.endDate });

// Brings the items that came from one source in line with the events it lists now.
//  - new events are added (with the usual reminders), changed ones are updated, ones you deleted stay deleted
//  - events that vanished from the source are removed if they are still ahead of us (cancelled), kept if past
function applyEvents(db, source, events, { prime, today, reminders = [] }) {
  const existing = new Map(db.items.filter((i) => i.source && i.source.feed === source.id).map((i) => [i.source.key, i]));
  const ignored = new Set(db.ignored || []);
  const seen = new Set(), res = { created: 0, updated: 0, removed: 0 };
  for (const ev of events) {
    if (ignored.has(`${source.id}|${ev.key}`)) continue;
    seen.add(ev.key);
    const it = existing.get(ev.key), f = fieldsOf(ev);
    if (!it) {
      const item = { id: crypto.randomUUID(), done: false, doneOn: [], reminders: [...reminders], nudges: [], repeat: 'none', category: source.category || '', ...f, source: { feed: source.id, key: ev.key } };
      prime(item); db.items.push(item); res.created++;
    } else if (FIELDS.some((k) => (it[k] || '') !== (f[k] || ''))) {
      const timeChanged = it.date !== f.date || it.time !== f.time;
      Object.assign(it, f);
      if (timeChanged) prime(it);
      res.updated++;
    }
  }
  for (const [key, it] of existing) {
    if (seen.has(key)) continue;
    if ((it.endDate || it.date) >= today) { db.items = db.items.filter((x) => x !== it); res.removed++; }
  }
  return res;
}

// Reads calendar text and applies it. Throws if there is nothing readable in it.
function importText(db, source, text, opts) {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That does not look like a calendar file.');
  return applyEvents(db, source, ics.parse(text), opts);
}

module.exports = { fetchCalendar, applyEvents, importText };
