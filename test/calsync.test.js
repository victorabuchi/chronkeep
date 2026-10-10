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

// ---- deadlines calendars (Moodle): shown as assignments, due when the window closes ----
const span = (uid, d1, t1, d2, t2, title) => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${d1.replace(/-/g, '')}T${t1.replace(':', '')}00\r\nDTEND:${d2.replace(/-/g, '')}T${t2.replace(':', '')}00\r\nSUMMARY:${title}\r\nEND:VEVENT\r\n`;
const point = (uid, d, t, title) => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${d.replace(/-/g, '')}T${t.replace(':', '')}00\r\nSUMMARY:${title}\r\nEND:VEVENT\r\n`;
const deadlines = { id: 'moodle', category: 'Study', kind: 'assignment' };
const dopts = (primed = []) => ({ prime: (i) => primed.push(i.id), today: '2026-10-10', reminders: [1440, 180], nudges: [{ from: 'day', every: 60 }] });

test('a deadlines calendar becomes assignments, due when the window closes', () => {
  const db = mk();
  const r = sync.importText(db, deadlines, cal(span('quiz', '2026-10-12', '08:00', '2026-10-14', '23:00', 'Quiz 5 closes'), point('ex', '2026-10-13', '23:59', 'Exercise 5 is due')), dopts());
  assert.equal(r.created, 2);
  const quiz = db.items.find((i) => i.title === 'Quiz 5 closes'), ex = db.items.find((i) => i.title === 'Exercise 5 is due');
  assert.deepEqual([quiz.type, quiz.date, quiz.time, quiz.endTime, quiz.endDate], ['assignment', '2026-10-14', '23:00', '', '']);
  assert.deepEqual([ex.type, ex.date, ex.time], ['assignment', '2026-10-13', '23:59']);
  assert.deepEqual([quiz.reminders, quiz.nudges.length, quiz.category], [[1440, 180], 1, 'Study']);
});

test('deadlines that had already passed when first seen start ticked off; timetable events do not', () => {
  const db = mk();
  sync.importText(db, deadlines, cal(point('old', '2026-10-02', '23:59', 'Exercise 1 is due'), point('new', '2026-10-13', '23:59', 'Exercise 5 is due')), dopts());
  const old = db.items.find((i) => i.title === 'Exercise 1 is due'), next = db.items.find((i) => i.title === 'Exercise 5 is due');
  assert.deepEqual([old.done, typeof old.doneAt, next.done], [true, 'number', false]);
  const db2 = mk();
  sync.importText(db2, { id: 'tt', category: '' }, cal(point('l', '2026-10-02', '10:00', 'Lecture')), dopts());
  assert.equal(db2.items[0].done, false);
});

test('switching a calendar from lessons to deadlines changes its items in place, with the right reminders', () => {
  const db = mk(), text = cal(span('x', '2026-10-12', '08:00', '2026-10-14', '23:00', 'Window'));
  sync.importText(db, { id: 'm', category: 'Study', kind: 'event' }, text, opts());
  assert.deepEqual([db.items[0].type, db.items[0].date, db.items[0].endDate, db.items[0].reminders], ['event', '2026-10-12', '2026-10-14', [10]]);
  const id = db.items[0].id;
  const r = sync.importText(db, { id: 'm', category: 'Study', kind: 'assignment' }, text, dopts());
  assert.deepEqual(r, { created: 0, updated: 1, removed: 0 });
  assert.equal(db.items.length, 1); assert.equal(db.items[0].id, id);
  assert.deepEqual([db.items[0].type, db.items[0].date, db.items[0].time, db.items[0].reminders], ['assignment', '2026-10-14', '23:00', [1440, 180]]);
  // and back again
  sync.importText(db, { id: 'm', category: 'Study', kind: 'event' }, text, opts());
  assert.deepEqual([db.items[0].type, db.items[0].date, db.items[0].endDate, db.items[0].reminders], ['event', '2026-10-12', '2026-10-14', [10]]);
});
