// Reading and writing iCalendar (.ics): timetable feeds, Google/Apple exports, and ChronKeep's own export.
// Times are turned into the computer's local date and time, which is what ChronKeep stores.

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ---- reading ----------------------------------------------------------------------------------
const unfold = (t) => t.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
const unescapeText = (s) => String(s).replace(/\\[nN]/g, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');

function parseLine(line) {
  let inQuote = false, colon = -1;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') inQuote = !inQuote; else if (c === ':' && !inQuote) { colon = i; break; } }
  if (colon < 0) return null;
  const [name, ...ps] = line.slice(0, colon).split(';'), params = {};
  for (const p of ps) { const eq = p.indexOf('='); if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function zoneOffsetMs(tzid, utcMs) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tzid, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}
// A wall-clock time in a named zone, as a moment in time.
function wallToUtc(y, mo, d, h, mi, s, tzid) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = guess - zoneOffsetMs(tzid, guess);
  const again = guess - zoneOffsetMs(tzid, utc);
  return again === utc ? utc : again;
}

// DTSTART / DTEND / EXDATE value -> { date, time, allDay } in local time.
function parseWhen(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (m[4] === undefined || params.VALUE === 'DATE') return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '', allDay: true };
  const [h, mi, s] = [+m[4], +m[5], +(m[6] || 0)];
  let local;
  if (m[7]) local = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  else if (params.TZID) { try { local = new Date(wallToUtc(y, mo, d, h, mi, s, params.TZID)); } catch { local = new Date(y, mo - 1, d, h, mi, s); } }
  else local = new Date(y, mo - 1, d, h, mi, s);
  return { date: ymd(local), time: hm(local), allDay: false };
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const sec = (+m[2] || 0) * 604800 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0);
  return (m[1] === '-' ? -1 : 1) * sec * 1000;
}

const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const at = (date, time) => new Date(`${date}T${time || '00:00'}:00`);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Occurrences (local start dates) of a repeating event, up to a horizon.
function expand(startDate, startTime, rule, exdates, horizon) {
  const r = Object.fromEntries(rule.split(';').map((p) => p.split('=')));
  const freq = r.FREQ, interval = Math.max(1, +r.INTERVAL || 1), count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? parseWhen(r.UNTIL, {}) : null, untilDate = until ? until.date : '9999-12-31';
  // UNTIL is a moment, not a day: an occurrence later on the last day does not count.
  const untilKey = until ? `${until.date}T${until.allDay ? '23:59' : until.time}` : '9999-12-31T23:59';
  const start = new Date(`${startDate}T00:00:00`), out = [], limit = 500;
  const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => WD[x.slice(-2)]).filter((x) => x !== undefined) : [];
  const bymd = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : [];
  const push = (d) => { if (ymd(d) >= startDate && `${ymd(d)}T${startTime || '00:00'}` <= untilKey && !exdates.has(ymd(d)) && out.length < limit && d <= horizon) out.push(ymd(d)); };
  let made = 0;
  const done = () => made >= count || out.length >= limit;
  if (freq === 'DAILY') { for (let d = new Date(start); d <= horizon && ymd(d) <= untilDate && made < count && out.length < limit; d = addDays(d, interval)) { made++; push(d); } }
  else if (freq === 'WEEKLY') {
    const days = byday.length ? byday : [start.getDay()];
    for (let wk = new Date(addDays(start, -start.getDay())); wk <= horizon && ymd(wk) <= untilDate && !done(); wk = addDays(wk, 7 * interval)) {
      for (const wd of [...days].sort((a, b) => a - b)) { const d = addDays(wk, wd); if (ymd(d) < startDate) continue; if (made >= count) break; made++; push(d); }
    }
  } else if (freq === 'MONTHLY') {
    for (let k = 0; !done(); k += interval) {
      const first = new Date(start.getFullYear(), start.getMonth() + k, 1);
      if (first > horizon) break;
      const days = bymd.length ? bymd : [start.getDate()];
      for (const dm of days) { const d = new Date(first.getFullYear(), first.getMonth(), dm); if (d.getMonth() !== first.getMonth() || ymd(d) < startDate) continue; if (made >= count) break; made++; push(d); }
    }
  } else if (freq === 'YEARLY') {
    for (let k = 0; !done(); k += interval) { const d = new Date(start.getFullYear() + k, start.getMonth(), start.getDate()); if (d > horizon) break; made++; push(d); }
  } else push(start);
  return out;
}

// Returns events: { key, uid, title, notes, location, date, time, endTime, endDate }
function parse(text, { horizonDays = 400 } = {}) {
  const lines = unfold(String(text)).split('\n');
  const raw = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = [];
    else if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; }
    else if (cur && line) { const p = parseLine(line); if (p) cur.push(p); }
  }
  const horizon = new Date(Date.now() + horizonDays * 86400000);
  const out = [], overrides = new Map(), masters = [];
  for (const props of raw) {
    const get = (n) => props.find((p) => p.name === n);
    if ((get('STATUS') || {}).value === 'CANCELLED') continue;
    const s = get('DTSTART'); if (!s) continue;
    const start = parseWhen(s.value, s.params); if (!start) continue;
    let end = null;
    if (get('DTEND')) end = parseWhen(get('DTEND').value, get('DTEND').params);
    else if (get('DURATION')) {
      const ms = parseDuration(get('DURATION').value);
      if (ms !== null) { const e = new Date(at(start.date, start.time).getTime() + ms); end = start.allDay ? { date: ymd(e), time: '', allDay: true } : { date: ymd(e), time: hm(e), allDay: false }; }
    }
    const ev = {
      uid: (get('UID') || {}).value || `${start.date}-${start.time}-${(get('SUMMARY') || {}).value || ''}`,
      title: unescapeText((get('SUMMARY') || {}).value || '(no title)').trim(),
      notes: unescapeText((get('DESCRIPTION') || {}).value || '').trim(),
      location: unescapeText((get('LOCATION') || {}).value || '').trim(),
      date: start.date, time: start.time, endTime: '', endDate: '',
    };
    if (end) {
      if (start.allDay) { const last = ymd(addDays(at(end.date, ''), -1)); if (last > start.date) ev.endDate = last; }
      else { ev.endTime = end.time; if (end.date > start.date) ev.endDate = end.date; }
    }
    const rid = get('RECURRENCE-ID');
    if (rid) { const w = parseWhen(rid.value, rid.params); if (w) overrides.set(`${ev.uid}|${w.date}`, { ...ev, key: `${ev.uid}#${w.date}` }); continue; }
    const rr = get('RRULE');
    masters.push({ ev, rr: rr ? rr.value : null, ex: new Set(props.filter((p) => p.name === 'EXDATE').flatMap((p) => p.value.split(',').map((v) => (parseWhen(v, p.params) || {}).date).filter(Boolean))) });
  }
  for (const { ev, rr, ex } of masters) {
    if (!rr) { out.push({ ...ev, key: ev.uid }); continue; }
    const spanDays = ev.endDate ? Math.round((at(ev.endDate, '') - at(ev.date, '')) / 86400000) : 0;
    for (const d of expand(ev.date, ev.time, rr, ex, horizon)) {
      if (overrides.has(`${ev.uid}|${d}`)) continue;
      out.push({ ...ev, key: `${ev.uid}#${d}`, date: d, endDate: spanDays ? ymd(addDays(at(d, ''), spanDays)) : '' });
    }
  }
  out.push(...overrides.values());
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// ---- writing ----------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const bytes = Buffer.from(line);
  if (bytes.length <= 75) return line;
  const out = []; let i = 0, first = true;
  while (i < bytes.length) {
    let n = first ? 75 : 74;
    while (i + n < bytes.length && (bytes[i + n] & 0xc0) === 0x80) n--; // never cut a character in half
    out.push((first ? '' : ' ') + bytes.slice(i, i + n).toString()); i += n; first = false;
  }
  return out.join('\r\n');
}
const stamp = (date, time) => `${date.replace(/-/g, '')}${time ? 'T' + time.replace(':', '') + '00' : ''}`;
const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// ChronKeep items -> .ics. Events become events; assignments and to-dos become tasks with a due date.
function build(items, { name = 'ChronKeep' } = {}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ChronKeep//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`];
  const now = utcStamp(Date.now());
  const alarms = (it) => (it.reminders || []).map((m) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.title)}`, `TRIGGER:-PT${Math.max(0, m)}M`, 'END:VALARM']).flat();
  const rrule = (it) => {
    if (!it.repeat || it.repeat === 'none') return [];
    const timed = it.type === 'event' && it.time;
    const until = it.repeatUntil ? `;UNTIL=${timed ? stamp(it.repeatUntil, '23:59') : stamp(it.repeatUntil)}` : '';
    const skipped = (it.skip || []).map((d) => (timed ? `EXDATE:${stamp(d, it.time)}` : `EXDATE;VALUE=DATE:${stamp(d)}`));
    return [`RRULE:FREQ=${it.repeat.toUpperCase()}${until}`, ...skipped];
  };
  for (const it of items) {
    if (!it.date) continue;
    const uid = `${it.id}@chronkeep`;
    if (it.type === 'event') {
      const allDay = !it.time;
      L.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${now}`, `SUMMARY:${esc(it.title)}`);
      if (allDay) { L.push(`DTSTART;VALUE=DATE:${stamp(it.date)}`, `DTEND;VALUE=DATE:${stamp(ymd(addDays(at(it.endDate || it.date, ''), 1)))}`); }
      else { L.push(`DTSTART:${stamp(it.date, it.time)}`); const e = it.endTime ? stamp(it.endDate || it.date, it.endTime) : stamp(ymd(new Date(at(it.date, it.time).getTime() + 3600000)), hm(new Date(at(it.date, it.time).getTime() + 3600000))); L.push(`DTEND:${e}`); }
      if (it.location) L.push(`LOCATION:${esc(it.location)}`);
      if (it.notes) L.push(`DESCRIPTION:${esc(it.notes)}`);
      L.push(...rrule(it), ...alarms(it), 'END:VEVENT');
    } else {
      L.push('BEGIN:VTODO', `UID:${uid}`, `DTSTAMP:${now}`, `SUMMARY:${esc(it.title)}`, `DUE${it.time ? '' : ';VALUE=DATE'}:${stamp(it.date, it.time)}`);
      if (it.notes) L.push(`DESCRIPTION:${esc(it.notes)}`);
      if (it.done) L.push('STATUS:COMPLETED'); else L.push('STATUS:NEEDS-ACTION');
      L.push(...rrule(it), ...alarms(it), 'END:VTODO');
    }
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

module.exports = { parse, build, parseWhen, parseDuration, expand, unfold, unescapeText };
