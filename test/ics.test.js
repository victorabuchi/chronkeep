process.env.TZ = 'Europe/Helsinki'; // the tests expect Helsinki local time
const test = require('node:test');
const assert = require('node:assert/strict');
const ics = require('../lib/ics');

const cal = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.map((e) => `BEGIN:VEVENT\r\n${e}\r\nEND:VEVENT\r\n`).join('')}END:VCALENDAR\r\n`;

test('a timetable event with a named time zone, folded and escaped text', () => {
  const [e] = ics.parse(cal('UID:a@1\r\nDTSTART;TZID=Europe/Helsinki:20261030T140000\r\nDTEND;TZID=Europe/Helsinki:20261030T160000\r\nSUMMARY:(KUOPIO): Insights\\, from data\r\nLOCATION:E24+25 - Room\\, Kuopio\r\nDESCRIPTION:Teacher: A\\, B\\nGroup: R2\r\n \\nMore'));
  assert.equal(e.title, '(KUOPIO): Insights, from data');
  assert.equal(e.location, 'E24+25 - Room, Kuopio');
  assert.equal(e.notes, 'Teacher: A, B\nGroup: R2\nMore');
  assert.deepEqual([e.date, e.time, e.endTime, e.endDate], ['2026-10-30', '14:00', '16:00', '']);
});

test('times in other zones become Helsinki time, across daylight saving', () => {
  const t = (tz, d) => ics.parse(cal(`UID:z\r\nDTSTART;TZID=${tz}:${d}\r\nSUMMARY:x`))[0];
  assert.equal(t('America/New_York', '20261012T090000').time, '16:00'); // EDT (-4) to EEST (+3)
  assert.equal(t('America/New_York', '20260310T090000').time, '15:00'); // EDT (-4) to EET (+2)
  assert.equal(t('America/New_York', '20260302T090000').time, '16:00'); // EST (-5) to EET (+2)
  assert.equal(t('UTC', '20261012T060000').time, '09:00');
  const z = ics.parse(cal('UID:u\r\nDTSTART:20261012T060000Z\r\nSUMMARY:x'))[0];
  assert.deepEqual([z.date, z.time], ['2026-10-12', '09:00']);
  const late = ics.parse(cal('UID:l\r\nDTSTART:20261012T230000Z\r\nSUMMARY:x'))[0];
  assert.deepEqual([late.date, late.time], ['2026-10-13', '02:00']); // crosses midnight in local time
});

test('floating times and unknown zones are kept as written', () => {
  assert.equal(ics.parse(cal('UID:f\r\nDTSTART:20261012T101500\r\nSUMMARY:x'))[0].time, '10:15');
  assert.equal(ics.parse(cal('UID:g\r\nDTSTART;TZID=Not/AZone:20261012T101500\r\nSUMMARY:x'))[0].time, '10:15');
});

test('all-day and multi-day events', () => {
  const [one, many] = ics.parse(cal('UID:1\r\nDTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013\r\nSUMMARY:one', 'UID:2\r\nDTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261015\r\nSUMMARY:many'));
  assert.deepEqual([one.date, one.time, one.endDate], ['2026-10-12', '', '']);
  assert.deepEqual([many.date, many.time, many.endDate], ['2026-10-12', '', '2026-10-14']);
});

test('end from DURATION, and an overnight event', () => {
  assert.equal(ics.parse(cal('UID:d\r\nDTSTART:20261012T090000\r\nDURATION:PT1H30M\r\nSUMMARY:x'))[0].endTime, '10:30');
  const n = ics.parse(cal('UID:n\r\nDTSTART:20261012T220000\r\nDTEND:20261013T020000\r\nSUMMARY:x'))[0];
  assert.deepEqual([n.time, n.endTime, n.endDate], ['22:00', '02:00', '2026-10-13']);
});

test('weekly repeat on chosen days, with a count and an excluded day', () => {
  const evs = ics.parse(cal('UID:w\r\nDTSTART:20261012T090000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5\r\nEXDATE:20261014T090000\r\nSUMMARY:x'));
  assert.deepEqual(evs.map((e) => e.date), ['2026-10-12', '2026-10-19', '2026-10-21', '2026-10-26']); // 5 made, 1 excluded
  assert.equal(new Set(evs.map((e) => e.key)).size, evs.length);
});

test('daily with UNTIL, monthly, and every other week', () => {
  assert.equal(ics.parse(cal('UID:d\r\nDTSTART:20261012T090000\r\nRRULE:FREQ=DAILY;UNTIL=20261015T235959Z\r\nSUMMARY:x')).length, 4);
  assert.deepEqual(ics.parse(cal('UID:m\r\nDTSTART:20261031T090000\r\nRRULE:FREQ=MONTHLY;COUNT=3\r\nSUMMARY:x')).map((e) => e.date), ['2026-10-31', '2026-12-31', '2027-01-31']); // no 31st in November
  assert.deepEqual(ics.parse(cal('UID:b\r\nDTSTART:20261012T090000\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3\r\nSUMMARY:x')).map((e) => e.date), ['2026-10-12', '2026-10-26', '2026-11-09']);
});

test('cancelled events are skipped and a changed occurrence replaces the original', () => {
  const evs = ics.parse(cal(
    'UID:c1\r\nDTSTART:20261012T090000\r\nSTATUS:CANCELLED\r\nSUMMARY:gone',
    'UID:r\r\nDTSTART:20261012T090000\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:series',
    'UID:r\r\nRECURRENCE-ID:20261013T090000\r\nDTSTART:20261013T130000\r\nSUMMARY:moved one',
  ));
  assert.equal(evs.some((e) => e.title === 'gone'), false);
  assert.deepEqual(evs.map((e) => `${e.date} ${e.time} ${e.title}`), ['2026-10-12 09:00 series', '2026-10-13 13:00 moved one', '2026-10-14 09:00 series']);
});

test('junk input does not crash', () => {
  assert.deepEqual(ics.parse(''), []);
  assert.deepEqual(ics.parse('not a calendar'), []);
  assert.deepEqual(ics.parse(cal('UID:x\r\nSUMMARY:no start')), []);
});

test('export: events and tasks, escaped, folded and readable again', () => {
  const items = [
    { id: 'e1', type: 'event', title: 'Lecture, part 1; Ä', date: '2026-10-12', time: '10:00', endTime: '12:00', location: 'Room 5', notes: 'Line one\nLine two', reminders: [10, 60], repeat: 'weekly' },
    { id: 'a1', type: 'assignment', title: 'Essay '.repeat(30), date: '2026-10-14', time: '23:59', reminders: [1440], done: false },
    { id: 'd1', type: 'event', title: 'Trip', date: '2026-10-20', time: '', endDate: '2026-10-22' },
  ];
  const text = ics.build(items);
  assert.ok(text.endsWith('\r\n') && text.startsWith('BEGIN:VCALENDAR'));
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line.length}`);
  assert.match(text, /SUMMARY:Lecture\\, part 1\; Ä/);
  assert.match(text, /BEGIN:VTODO[\s\S]*DUE:20261014T235900/);
  assert.match(text, /TRIGGER:-PT1440M/);
  assert.match(text, /DTEND;VALUE=DATE:20261023/); // exclusive end for the 3-day trip
  const back = ics.parse(text, { horizonDays: 800 });
  const lecture = back.find((e) => e.title.startsWith('Lecture'));
  assert.deepEqual([lecture.date, lecture.time, lecture.endTime, lecture.location, lecture.notes], ['2026-10-12', '10:00', '12:00', 'Room 5', 'Line one\nLine two']);
  const trip = back.find((e) => e.title === 'Trip');
  assert.deepEqual([trip.date, trip.endDate], ['2026-10-20', '2026-10-22']);
});

test('export: a repeat with an end date and a skipped day reads back correctly', () => {
  const text = ics.build([{ id: 'r1', type: 'event', title: 'Gym', date: '2026-10-12', time: '07:00', endTime: '08:00', repeat: 'weekly', repeatUntil: '2026-11-02', skip: ['2026-10-19'], reminders: [] }]);
  assert.match(text, /RRULE:FREQ=WEEKLY;UNTIL=20261102T235900/);
  assert.match(text, /EXDATE:20261019T070000/);
  assert.deepEqual(ics.parse(text, { horizonDays: 900 }).map((e) => e.date), ['2026-10-12', '2026-10-26', '2026-11-02']);
});
