process.env.TZ = 'Europe/Helsinki';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuick, describe } = require('../public/quick');

const NOW = new Date(2026, 9, 10, 15, 0); // Saturday 10 October 2026, 15:00
const CATS = [{ name: 'Study' }, { name: 'Work' }, { name: 'Robotics' }];
const q = (s, cats = CATS) => parseQuick(s, { now: NOW, categories: cats });
const brief = (r) => [r.title, r.type, r.date, r.time, r.category, r.repeat];

test('the example: an assignment with a day and a time', () => {
  assert.deepEqual(brief(q('Robotics report due Sunday 11pm', [])), ['Robotics report', 'assignment', '2026-10-11', '23:00', '', '']);
});
test('tomorrow with a time', () => assert.deepEqual(brief(q('Submit essay tomorrow 5pm', [])), ['Submit essay', 'assignment', '2026-10-11', '17:00', '', '']));
test('a weekday and a 24 hour time make an event', () => assert.deepEqual(brief(q('Lecture on friday at 10:00', [])), ['Lecture', 'event', '2026-10-16', '10:00', '', '']));
test('no date or time is a plain to-do, even with an event word', () => assert.deepEqual(brief(q('Call mum', [])), ['Call mum', 'todo', '', '', '', '']));
test('buy something is a to-do', () => assert.deepEqual(brief(q('Buy milk', [])), ['Buy milk', 'todo', '', '', '', '']));
test('a repeat on a weekday', () => assert.deepEqual(brief(q('Gym every monday 7am', [])), ['Gym', 'event', '2026-10-12', '07:00', '', 'weekly']));
test('day and month words', () => {
  assert.deepEqual(brief(q('Math exam 12 oct 9am', [])), ['Math exam', 'assignment', '2026-10-12', '09:00', '', '']);
  assert.deepEqual(brief(q('Dentist october 20 at 14:30', [])), ['Dentist', 'event', '2026-10-20', '14:30', '', '']);
  assert.equal(q('Party 3rd of november', []).date, '2026-11-03');
});
test('a date that already passed this year means next year', () => assert.equal(q('Birthday 5 march', []).date, '2027-03-05'));
test('numeric dates are day first, and a dotted time is not a date', () => {
  assert.deepEqual([q('Report 12.10.', []).date, q('Report 12.10.2026', []).date, q('Report 12/10', []).date], ['2026-10-12', '2026-10-12', '2026-10-12']);
  const r = q('Dentist 14.30 tomorrow', []); assert.deepEqual([r.time, r.date], ['14:30', '2026-10-11']);
});
test('relative days', () => {
  assert.equal(q('Report in 3 days', []).date, '2026-10-13');
  assert.equal(q('Project in 2 weeks', []).date, '2026-10-24');
  assert.equal(q('Quiz day after tomorrow', []).date, '2026-10-12');
});
test('next friday is next week, this sunday is tomorrow, next sunday is a week later', () => {
  assert.equal(q('Essay next friday', []).date, '2026-10-16');
  assert.equal(q('Essay sunday', []).date, '2026-10-11');
  assert.equal(q('Essay next sunday', []).date, '2026-10-18');
});
test('in N hours sets today and the time', () => { const r = q('Call in 2 hours', []); assert.deepEqual([r.date, r.time], ['2026-10-10', '17:00']); });
test('tonight, midnight and noon', () => {
  assert.deepEqual([q('Read tonight', []).date, q('Read tonight', []).time], ['2026-10-10', '20:00']);
  assert.equal(q('Essay due sunday midnight', []).time, '23:59');
  assert.equal(q('Lunch tomorrow noon', []).time, '12:00');
});
test('small hours are read as afternoon, 7 to 11 stay in the morning', () => {
  assert.equal(q('Meeting tomorrow at 3', []).time, '15:00');
  assert.equal(q('Meeting tomorrow at 9', []).time, '09:00');
  assert.equal(q('Meeting tomorrow 12am', []).time, '00:00');
});
test('a course by #tag or "for"', () => {
  assert.deepEqual(brief(q('Essay due friday #study')), ['Essay', 'assignment', '2026-10-16', '', 'Study', '']);
  assert.equal(q('Essay for work').category, 'Work');
});
test('a course name inside the title keeps the word in the title', () => {
  const r = q('Robotics lab report due sunday'); assert.deepEqual([r.title, r.category], ['Robotics lab report', 'Robotics']);
});
test('an invalid date stays in the title', () => { const r = q('Pay invoice 31.2.', []); assert.equal(r.date, ''); });
test('a bare number is not a time', () => { const r = q('Read chapter 5', []); assert.deepEqual([r.time, r.date], ['', '']); });
test('empty and odd input never throw', () => { for (const s of ['', '   ', '!!!', '12', 'due', 'at', '😀 party tomorrow']) assert.doesNotThrow(() => q(s)); assert.equal(q('').title, ''); });
test('describe reads well', () => assert.equal(describe(q('Robotics report due Sunday 11pm #study')), 'Assignment · Sun 11 Oct, 23:00 · Study'));
