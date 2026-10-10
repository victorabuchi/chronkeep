// Keeping a person's data the same on every device: web, phone and anything else.
//
// The cloud server keeps one document per person (the same shape as data.json) plus a `sync` section:
//   rev    a counter that goes up whenever something changes
//   fp     a short fingerprint of every item as last seen, so a change is noticed whoever made it
//   tombs  ids that were deleted for good, so a device that was offline hears about it
//   parts  the same for the single things: settings, profile, note, calendars
// Every changed thing gets `rv` (the revision it changed at). A device remembers the last revision it saw and
// asks for everything newer. When two devices changed the same thing, the later `updatedAt` wins.
const crypto = require('crypto');

const PARTS = ['settings', 'profile', 'notepad', 'feeds', 'ignored'];
// Settings that mean the same on every device (notification channels are per device).
const SHARED_SETTINGS = ['name', 'accent', 'theme', 'weekStart', 'showWeekends', 'dayStart', 'dayEnd', 'allDayHour', 'dueTime', 'reminderDefaults', 'nudgeDefaults', 'nagHours', 'digestHour', 'categories'];
const MAX_TOMBS = 5000, SKEW = 5 * 60000;

// Keys sorted, because Postgres hands jsonb back in its own key order.
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null');
const fp = (v) => crypto.createHash('sha1').update(stable(v)).digest('base64url').slice(0, 12);
const itemFp = (it) => { const { updatedAt, rv, lastNag, ...rest } = it; return fp(rest); };
const sharedSettings = (s) => Object.fromEntries(SHARED_SETTINGS.filter((k) => k in s).map((k) => [k, s[k]]));
const partValue = (doc, name) => (name === 'settings' ? sharedSettings(doc.settings) : name === 'feeds' ? doc.feeds : doc[name]);

function ensure(doc) {
  if (!doc.sync) doc.sync = { rev: 0, fp: {}, tombs: [], parts: {} };
  const s = doc.sync;
  s.fp = s.fp || {}; s.tombs = s.tombs || []; s.parts = s.parts || {}; s.rev = s.rev || 0;
  return s;
}

// Notices what changed since the last call (whoever changed it) and stamps it. Call before saving.
function stamp(doc, now = Date.now()) {
  const s = ensure(doc), seen = new Set();
  for (const list of [doc.items, doc.trash]) {
    for (const it of list) {
      seen.add(it.id);
      const f = itemFp(it);
      if (s.fp[it.id] !== f) { s.fp[it.id] = f; it.updatedAt = Math.max(now, 0); it.rv = ++s.rev; s.tombs = s.tombs.filter((t) => t.id !== it.id); }
    }
  }
  for (const id of Object.keys(s.fp)) if (!seen.has(id)) { delete s.fp[id]; s.tombs.push({ id, at: now, rv: ++s.rev }); }
  if (s.tombs.length > MAX_TOMBS) s.tombs = s.tombs.slice(-MAX_TOMBS);
  for (const name of PARTS) {
    const f = fp(partValue(doc, name)), part = s.parts[name];
    if (!part) s.parts[name] = { fp: f, updatedAt: now, rv: ++s.rev };
    else if (part.fp !== f) { part.fp = f; part.updatedAt = now; part.rv = ++s.rev; }
  }
  return doc;
}

// Everything newer than `since`, for a device that last saw that revision.
function changesSince(doc, since = 0) {
  const s = ensure(doc), newer = (x) => (x.rv || 0) > since;
  const parts = {};
  for (const name of PARTS) if (s.parts[name] && s.parts[name].rv > since) parts[name] = { value: partValue(doc, name), updatedAt: s.parts[name].updatedAt };
  return {
    cursor: s.rev,
    items: doc.items.filter(newer),
    trash: doc.trash.filter(newer),
    tombstones: s.tombs.filter(newer).map(({ id, at }) => ({ id, at })),
    parts,
  };
}

// Takes in what a device changed. The newer `updatedAt` wins, per item and per part.
// Returns the ids that were refused because the server's copy is newer (the device gets them in the next pull).
function applyChanges(doc, c = {}, now = Date.now()) {
  const s = ensure(doc), stale = [];
  const at = (x) => Math.min(Number(x) || 0, now + SKEW);
  const find = (id) => { let i = doc.items.findIndex((x) => x.id === id); if (i >= 0) return { list: doc.items, i }; i = doc.trash.findIndex((x) => x.id === id); return i >= 0 ? { list: doc.trash, i } : null; };
  const tomb = (id) => s.tombs.find((t) => t.id === id);
  const take = (incoming, intoTrash) => {
    if (!incoming || typeof incoming.id !== 'string' || !/^[\w-]{1,64}$/.test(incoming.id)) return;
    const when = at(incoming.updatedAt), have = find(incoming.id), t = tomb(incoming.id);
    // the same calendar event already here under another id (two devices imported the same link): keep the first
    if (incoming.source && [...doc.items, ...doc.trash].some((x) => x.id !== incoming.id && x.source && x.source.feed === incoming.source.feed && x.source.key === incoming.source.key)) return stale.push(incoming.id);
    if (t && t.at >= when) return stale.push(incoming.id);
    if (have && (have.list[have.i].updatedAt || 0) >= when) return stale.push(incoming.id);
    if (have) have.list.splice(have.i, 1);
    const { rv, ...item } = incoming;
    item.updatedAt = when;
    (intoTrash ? doc.trash : doc.items).push(item);
    s.fp[item.id] = itemFp(item); item.rv = ++s.rev;
    s.tombs = s.tombs.filter((x) => x.id !== item.id);
  };
  for (const it of c.items || []) take(it, false);
  for (const it of c.trash || []) take({ ...it, deletedAt: it.deletedAt || now }, true);
  for (const tb of c.tombstones || []) {
    const have = find(tb.id), when = at(tb.at);
    if (have && (have.list[have.i].updatedAt || 0) > when) { stale.push(tb.id); continue; }
    if (have) have.list.splice(have.i, 1);
    delete s.fp[tb.id];
    s.tombs = s.tombs.filter((x) => x.id !== tb.id); s.tombs.push({ id: tb.id, at: when, rv: ++s.rev });
  }
  for (const name of PARTS) {
    const inc = (c.parts || {})[name];
    if (!inc || inc.value === undefined) continue;
    const part = s.parts[name], when = at(inc.updatedAt);
    if (part && part.updatedAt >= when) { stale.push(name); continue; }
    if (name === 'settings') doc.settings = { ...doc.settings, ...sharedSettings(inc.value) };
    else if (name === 'profile') doc.profile = { ...doc.profile, ...inc.value };
    else if (name === 'notepad') doc.notepad = { html: String(inc.value.html ?? ''), at: inc.value.at || new Date(when).toISOString() };
    else if (name === 'feeds') doc.feeds = Array.isArray(inc.value) ? inc.value : doc.feeds;
    else if (name === 'ignored') doc.ignored = Array.isArray(inc.value) ? inc.value.slice(-5000) : doc.ignored;
    s.parts[name] = { fp: fp(partValue(doc, name)), updatedAt: when, rv: ++s.rev };
  }
  if (s.tombs.length > MAX_TOMBS) s.tombs = s.tombs.slice(-MAX_TOMBS);
  return { stale };
}

module.exports = { stamp, changesSince, applyChanges, SHARED_SETTINGS, PARTS };
