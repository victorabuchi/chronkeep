process.env.TZ = 'Europe/Helsinki';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/recur');

const ev = (o) => ({ type: 'event', date: '2026-10-12', repeat: 'none', ...o });
const list = (it, from, n) => { const out = []; for (let i = 0; i < n; i++) { const d = new Date(from + 'T00:00'); d.setDate(d.getDate() + i); const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; if (R.occursOn(it, s)) out.push(s); } return out; };

test('a single item appears on its day only', () => assert.deepEqual(list(ev({}), '2026-10-10', 7), ['2026-10-12']));
test('weekly, daily and monthly repeats', () => {
  assert.deepEqual(list(ev({ repeat: 'weekly' }), '2026-10-10', 25), ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
  assert.equal(list(ev({ repeat: 'daily' }), '2026-10-10', 5).length, 3);
  assert.deepEqual(list(ev({ repeat: 'monthly', date: '2026-10-31' }), '2026-10-01', 100), ['2026-10-31', '2026-12-31']);
});
test('a repeat stops after its end date, the end date itself still counts', () => {
  assert.deepEqual(list(ev({ repeat: 'weekly', repeatUntil: '2026-10-26' }), '2026-10-10', 30), ['2026-10-12', '2026-10-19', '2026-10-26']);
  assert.deepEqual(list(ev({ repeat: 'daily', repeatUntil: '2026-10-13' }), '2026-10-10', 10), ['2026-10-12', '2026-10-13']);
});
test('skipped days are left out', () => assert.deepEqual(list(ev({ repeat: 'weekly', skip: ['2026-10-19'] }), '2026-10-10', 25), ['2026-10-12', '2026-10-26', '2026-11-02']));
test('events running over midnight or several days', () => {
  assert.equal(R.spanDays(ev({ time: '22:00', endTime: '02:00' })), 1);
  assert.equal(R.spanDays(ev({ time: '09:00', endTime: '10:00' })), 0);
  assert.equal(R.spanDays(ev({ time: '09:00', endTime: '10:00', endDate: '2026-10-14' })), 2);
  assert.equal(R.spanDays(ev({ endDate: '2026-10-15' })), 3);
  assert.equal(R.spanDays({ type: 'assignment', date: '2026-10-12', endDate: '2026-10-15' }), 0); // only events span
});
test('startFor finds the occurrence that covers a day', () => {
  const trip = ev({ endDate: '2026-10-14' });
  assert.deepEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((d) => R.startFor(trip, d)), [null, '2026-10-12', '2026-10-12', '2026-10-12', null]);
  const weekly = ev({ repeat: 'weekly', time: '22:00', endTime: '02:00' });
  assert.equal(R.startFor(weekly, '2026-10-20'), '2026-10-19'); // the early hours belong to Monday night's event
  assert.equal(R.startFor(weekly, '2026-10-21'), null);
});
test('segments of a multi-day timed event, clamped to the hours shown', () => {
  const it = ev({ time: '20:00', endTime: '10:00', endDate: '2026-10-14' });
  assert.deepEqual(R.segment(it, '2026-10-12', 420, 1320), { occ: '2026-10-12', first: true, last: false, start: 1200, end: 1320 });
  assert.deepEqual(R.segment(it, '2026-10-13', 420, 1320), { occ: '2026-10-12', first: false, last: false, start: 420, end: 1320 });
  assert.deepEqual(R.segment(it, '2026-10-14', 420, 1320), { occ: '2026-10-12', first: false, last: true, start: 420, end: 600 });
  assert.equal(R.segment(it, '2026-10-15', 420, 1320), null);
  assert.deepEqual(R.segment(ev({ time: '10:00' }), '2026-10-12', 420, 1320), { occ: '2026-10-12', first: true, last: true, start: 600, end: 660 }); // no end time = one hour
});
test('when an occurrence is over', () => {
  assert.equal(R.endOf(ev({ time: '22:00', endTime: '02:00' }), '2026-10-12').toISOString(), new Date(2026, 9, 13, 2, 0).toISOString());
  assert.equal(R.endOf(ev({}), '2026-10-12').getHours(), 23);
});

test('a morning part that ends before the first hour shown is reported as ending early', () => {
  const night = ev({ time: '22:00', endTime: '02:00' });
  assert.deepEqual(R.segment(night, '2026-10-12', 420, 1320), { occ: '2026-10-12', first: true, last: false, start: 1320, end: 1320 });
  const next = R.segment(night, '2026-10-13', 420, 1320);
  assert.deepEqual([next.first, next.last, next.end <= 420], [false, true, true]); // the page puts this one in the top row
});
