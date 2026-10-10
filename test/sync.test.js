const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { defaults } = require('../lib/model');
const { stamp, changesSince, applyChanges } = require('../lib/sync');

const item = (id, title, updatedAt = 1) => ({ id, type: 'todo', title, notes: '', date: '', time: '', done: false, doneOn: [], reminders: [], nudges: [], repeat: 'none', category: '', updatedAt });
const fresh = () => stamp(defaults(), 1000);

describe('stamping', () => {
  it('gives changed items a revision and leaves unchanged ones alone', () => {
    const d = fresh(); d.items.push(item('a', 'One'));
    stamp(d, 2000);
    const rv = d.items[0].rv; assert.ok(rv > 0); assert.equal(d.items[0].updatedAt, 2000);
    stamp(d, 3000); assert.equal(d.items[0].rv, rv); assert.equal(d.items[0].updatedAt, 2000);
    d.items[0].title = 'Two'; stamp(d, 4000);
    assert.ok(d.items[0].rv > rv); assert.equal(d.items[0].updatedAt, 4000);
  });
  it('records a deletion for good as a tombstone, but not a move to the bin', () => {
    const d = fresh(); d.items.push(item('a', 'One')); stamp(d, 2000);
    const [gone] = d.items.splice(0, 1); d.trash.push({ ...gone, deletedAt: 2500 }); stamp(d, 3000);
    assert.equal(d.sync.tombs.length, 0); assert.equal(d.trash[0].id, 'a');
    d.trash.length = 0; stamp(d, 4000);
    assert.deepEqual(d.sync.tombs.map((t) => t.id), ['a']);
  });
  it('notices changes to settings and the note', () => {
    const d = fresh(), rv = d.sync.parts.settings.rv;
    d.settings.accent = '#112233'; d.notepad = { html: 'hello', at: 'x' }; stamp(d, 2000);
    assert.ok(d.sync.parts.settings.rv > rv); assert.equal(d.sync.parts.notepad.updatedAt, 2000);
  });
});

describe('fingerprints', () => {
  it('do not depend on the order of keys, as Postgres jsonb reorders them', () => {
    const d = fresh(); d.items.push(item('a', 'One')); stamp(d, 2000);
    const rv = d.items[0].rv, reordered = Object.fromEntries(Object.entries(d.items[0]).reverse());
    d.items[0] = reordered; stamp(d, 3000);
    assert.equal(d.items[0].rv, rv);
  });
});

describe('changes since', () => {
  it('returns only what is newer than the cursor', () => {
    const d = fresh(); d.items.push(item('a', 'One')); stamp(d, 2000);
    const first = changesSince(d, 0); assert.equal(first.items.length, 1);
    d.items.push(item('b', 'Two')); stamp(d, 3000);
    const next = changesSince(d, first.cursor);
    assert.deepEqual(next.items.map((x) => x.id), ['b']);
    assert.equal(changesSince(d, next.cursor).items.length, 0);
  });
  it('tells a device about deletions it missed', () => {
    const d = fresh(); d.items.push(item('a', 'One')); stamp(d, 2000);
    const c = changesSince(d, 0).cursor; d.items.length = 0; stamp(d, 3000);
    assert.deepEqual(changesSince(d, c).tombstones.map((t) => t.id), ['a']);
  });
});

describe('applying a device\'s changes', () => {
  it('adds new items and takes newer edits, refusing older ones', () => {
    const d = fresh();
    applyChanges(d, { items: [item('a', 'Phone', 5000)] }, 6000);
    assert.equal(d.items[0].title, 'Phone');
    const r = applyChanges(d, { items: [item('a', 'Old', 4000)] }, 6000);
    assert.equal(d.items[0].title, 'Phone'); assert.deepEqual(r.stale, ['a']);
    applyChanges(d, { items: [item('a', 'Newer', 7000)] }, 8000);
    assert.equal(d.items[0].title, 'Newer');
    stamp(d, 9000); assert.equal(d.items[0].updatedAt, 7000, 'applying does not look like a second change');
  });
  it('moves an item to the bin and back', () => {
    const d = fresh(); applyChanges(d, { items: [item('a', 'X', 2000)] }, 3000);
    applyChanges(d, { trash: [{ ...item('a', 'X', 4000), deletedAt: 4000 }] }, 5000);
    assert.deepEqual([d.items.length, d.trash.length], [0, 1]);
    applyChanges(d, { items: [item('a', 'X', 6000)] }, 7000);
    assert.deepEqual([d.items.length, d.trash.length], [1, 0]);
  });
  it('deletes for good, and does not let an older copy come back', () => {
    const d = fresh(); applyChanges(d, { items: [item('a', 'X', 2000)] }, 3000);
    applyChanges(d, { tombstones: [{ id: 'a', at: 4000 }] }, 5000);
    assert.equal(d.items.length, 0);
    const r = applyChanges(d, { items: [item('a', 'X', 3500)] }, 5000);
    assert.equal(d.items.length, 0); assert.deepEqual(r.stale, ['a']);
    applyChanges(d, { items: [item('a', 'Again', 6000)] }, 7000);
    assert.equal(d.items[0].title, 'Again');
  });
  it('keeps a newer edit over an older delete', () => {
    const d = fresh(); applyChanges(d, { items: [item('a', 'X', 9000)] }, 9500);
    const r = applyChanges(d, { tombstones: [{ id: 'a', at: 8000 }] }, 9600);
    assert.equal(d.items.length, 1); assert.deepEqual(r.stale, ['a']);
  });
  it('merges settings by recency and shares only the shared keys', () => {
    const d = fresh();
    applyChanges(d, { parts: { settings: { value: { accent: '#abcdef', notifyMac: true }, updatedAt: 5000 } } }, 6000);
    assert.equal(d.settings.accent, '#abcdef'); assert.equal(d.settings.notifyMac, true, 'device-only key was not taken');
    const before = JSON.stringify(defaults().settings.notifyMac);
    assert.equal(JSON.stringify(d.settings.notifyMac), before);
    applyChanges(d, { parts: { settings: { value: { accent: '#000000' }, updatedAt: 4000 } } }, 6000);
    assert.equal(d.settings.accent, '#abcdef');
  });
  it('refuses a second copy of the same calendar event', () => {
    const d = fresh(), ev = (id) => ({ ...item(id, 'Lecture', 5000), source: { feed: 'f', key: 'k' } });
    applyChanges(d, { items: [ev('one')] }, 6000);
    const r = applyChanges(d, { items: [ev('two')] }, 6000);
    assert.deepEqual(d.items.map((i) => i.id), ['one']); assert.deepEqual(r.stale, ['two']);
  });
  it('refuses odd ids and clamps a clock far in the future', () => {
    const d = fresh(); applyChanges(d, { items: [item('../x', 'Bad', 5)] }, 10);
    assert.equal(d.items.length, 0);
    applyChanges(d, { items: [item('a', 'Future', 1e15)] }, 1000);
    assert.ok(d.items[0].updatedAt < 1e6);
  });
});
