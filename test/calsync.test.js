process.env.TZ = 'Europe/Helsinki';
const test = require('node:test');
const assert = require('node:assert/strict');
const sync = require('../lib/calsync');

const ev = (uid, date, time, title = 'Lecture') => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${date.replace(/-/g, '')}T${time.replace(':', '')}00\r\nDTEND:${date.replace(/-/g, '')}T${String(+time.slice(0, 2) + 1).padStart(2, '0')}${time.slice(3)}00\r\nSUMMARY:${title}\r\nEND:VEVENT\r\n`;
const cal = (...e) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${e.join('')}END:VCALENDAR\r\n`;
const mk = () => ({ items: [], ignored: [] });
const src = { id: 'f1', category: 'Timetable' };
const opts = (primed = []) => ({ prime: (i) => primed.push(i.id), today: '2026-10-10', reminders: [10] });

test('first sync adds events with the source category and default reminders', () => {
  const db = mk(), primed = [];
  const r = sync.importText(db, src, cal(ev('a', '2026-10-12', '10:00'), ev('b', '2026-10-13', '12:00', 'Seminar')), opts(primed));
  assert.deepEqual(r, { created: 2, updated: 0, removed: 0 });
  assert.equal(db.items.length, 2);
  assert.deepEqual(db.items.map((i) => [i.type, i.category, i.reminders, i.source.feed]), [['event', 'Timetable', [10], 'f1'], ['event', 'Timetable', [10], 'f1']]);
  assert.equal(primed.length, 2); // past reminders are silenced
});

test('syncing again changes nothing and never duplicates', () => {
  const db = mk(); const text = cal(ev('a', '2026-10-12', '10:00'));
  sync.importText(db, src, text, opts());
  const r = sync.importText(db, src, text, opts());
  assert.deepEqual(r, { created: 0, updated: 0, removed: 0 });
  assert.equal(db.items.length, 1);
});

test('a moved event is updated in place, keeping what you added yourself', () => {
  const db = mk();
  sync.importText(db, src, cal(ev('a', '2026-10-12', '10:00')), opts());
  const id = db.items[0].id; db.items[0].reminders = [30, 60]; db.items[0].category = 'Study';
  const primed = [];
  const r = sync.importText(db, src, cal(ev('a', '2026-10-14', '13:00', 'Lecture (room changed)')), opts(primed));
  assert.deepEqual(r, { created: 0, updated: 1, removed: 0 });
  assert.deepEqual([db.items[0].id, db.items[0].date, db.items[0].time, db.items[0].title, db.items[0].reminders, db.items[0].category], [id, '2026-10-14', '13:00', 'Lecture (room changed)', [30, 60], 'Study']);
  assert.equal(primed.length, 1); // a new time re-arms its reminders
});

test('events that disappear are removed if ahead, kept if already past', () => {
  const db = mk();
  sync.importText(db, src, cal(ev('past', '2026-10-01', '10:00'), ev('future', '2026-10-20', '10:00'), ev('stay', '2026-10-21', '10:00')), opts());
  const r = sync.importText(db, src, cal(ev('stay', '2026-10-21', '10:00')), opts());
  assert.deepEqual(r, { created: 0, updated: 0, removed: 1 });
  assert.deepEqual(db.items.map((i) => i.source.key).sort(), ['past', 'stay']);
});

test('an event you deleted does not come back', () => {
  const db = mk(); const text = cal(ev('a', '2026-10-12', '10:00'), ev('b', '2026-10-13', '10:00'));
  sync.importText(db, src, text, opts());
  db.ignored.push('f1|a'); db.items = db.items.filter((i) => i.source.key !== 'a');
  const r = sync.importText(db, src, text, opts());
  assert.equal(r.created, 0);
  assert.deepEqual(db.items.map((i) => i.source.key), ['b']);
});

test('two sources do not touch each other', () => {
  const db = mk();
  sync.importText(db, { id: 'f1', category: 'A' }, cal(ev('same', '2026-10-12', '10:00')), opts());
  sync.importText(db, { id: 'f2', category: 'B' }, cal(ev('same', '2026-10-12', '10:00')), opts());
  assert.equal(db.items.length, 2);
  sync.importText(db, { id: 'f2', category: 'B' }, cal(), opts());
  assert.deepEqual(db.items.map((i) => i.source.feed), ['f1']);
});

test('your own items are never touched by a sync', () => {
  const db = mk(); db.items.push({ id: 'mine', type: 'event', title: 'Mine', date: '2026-10-20', source: undefined });
  sync.importText(db, src, cal(), opts());
  assert.equal(db.items.length, 1);
});

test('not a calendar is refused', () => {
  assert.throws(() => sync.importText(mk(), src, '<html>nope</html>', opts()), /does not look like a calendar/);
});

test('fetching: errors read well, a good calendar passes', async () => {
  const resp = (body, status = 200) => async () => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => body });
  await assert.rejects(sync.fetchCalendar('nonsense'), /not a web address/);
  await assert.rejects(sync.fetchCalendar('file:///etc/passwd'), /http or https/);
  await assert.rejects(sync.fetchCalendar('https://x.test/a.ics', resp('', 404)), /error \(404\)/);
  await assert.rejects(sync.fetchCalendar('https://x.test/a.ics', resp('<html>login</html>')), /did not return a calendar/);
  await assert.rejects(sync.fetchCalendar('https://x.test/a.ics', async () => { throw new Error('down'); }), /Could not reach/);
  assert.match(await sync.fetchCalendar('https://x.test/a.ics', resp(cal())), /BEGIN:VCALENDAR/);
});
