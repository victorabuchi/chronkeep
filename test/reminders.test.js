const test = require('node:test');
const assert = require('node:assert/strict');
const { due, initState } = require('../lib/reminders');

const at = (s) => new Date(s); // local time, like the wall clock the module is given
const doc = (items, settings = {}) => ({ settings: { nagHours: 6, digestHour: -1, allDayHour: 9, ...settings }, items });
const item = (o) => ({ id: 'a', type: 'assignment', title: 'Robotics report', date: '2026-10-14', time: '15:00', repeat: 'none', done: false, reminders: [], nudges: [], category: 'Study', ...o });

test('a reminder fires once, when its moment passes', () => {
  const d = doc([item({ reminders: [180] })]), st = { last: at('2026-10-14T11:58').getTime() };
  assert.equal(due(d, st, at('2026-10-14T11:59')).length, 0);
  const got = due(d, st, at('2026-10-14T12:01'));
  assert.equal(got.length, 1);
  assert.match(got[0].title, /Assignment: Robotics report/);
  assert.match(got[0].body, /Due in 3 hours/);
  assert.equal(due(d, st, at('2026-10-14T12:02')).length, 0);
});

test('reminders that were already past when the item appeared stay quiet', () => {
  const d = doc([item({ reminders: [4320, 1440] })]), st = initState(d, at('2026-10-13T20:00'));
  assert.equal(due(d, st, at('2026-10-13T20:01')).length, 0);
});

test('a ticked-off item sends nothing', () => {
  const d = doc([item({ reminders: [180], done: true })]), st = { last: at('2026-10-14T11:58').getTime() };
  assert.equal(due(d, st, at('2026-10-14T12:01')).length, 0);
});

test('a repeating reminder repeats at its interval until the due time', () => {
  const d = doc([item({ nudges: [{ from: 60, every: 10 }] })]), st = { last: at('2026-10-14T13:50').getTime() };
  assert.equal(due(d, st, at('2026-10-14T13:55')).length, 0);
  assert.equal(due(d, st, at('2026-10-14T14:00')).length, 1);
  assert.equal(due(d, st, at('2026-10-14T14:05')).length, 0);
  assert.equal(due(d, st, at('2026-10-14T14:10')).length, 1);
});

test('overdue items are nagged every few hours, but not all at once when notifications are first allowed', () => {
  const d = doc([item({ date: '2026-10-12', time: '12:00' })]), st = initState(d, at('2026-10-14T09:00'));
  assert.equal(due(d, st, at('2026-10-14T09:01')).length, 0);
  assert.equal(due(d, st, at('2026-10-14T14:00')).length, 0);
  const got = due(d, st, at('2026-10-14T15:01'));
  assert.equal(got.length, 1);
  assert.match(got[0].title, /^OVERDUE/);
});

test('the morning summary goes out once a day', () => {
  const d = doc([item({ date: '2026-10-14' })], { digestHour: 8 }), st = initState(d, at('2026-10-14T07:00'));
  assert.equal(due(d, st, at('2026-10-14T07:30')).length, 0);
  const got = due(d, st, at('2026-10-14T08:01'));
  assert.equal(got[0].title, 'Morning summary');
  assert.equal(due(d, st, at('2026-10-14T08:02')).length, 0);
});

test('a long gap does not replay old reminders', () => {
  const d = doc([item({ reminders: [1440] })]), st = { last: at('2026-10-10T00:00').getTime() };
  assert.equal(due(d, st, at('2026-10-13T15:30')).length, 0);
});
