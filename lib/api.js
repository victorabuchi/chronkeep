// The routes that read and change a person's data: items, bin, calendars, profile, settings, note, backups and files.
// Shared by the local server (one person, files on disk) and the cloud server (many people, Postgres).
// ctx: { getDb, setDb, save, prime, files: { put, get, remove, removeAll }, backups: { list, now, read } }
const crypto = require('crypto');
const ics = require('./ics');
const calsync = require('./calsync');
const Recur = require('../public/recur.js');
const { defaults, normalize } = require('./model');
const { send, readBody, readRaw, cleanName } = require('./http');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStamp = (d = new Date()) => ymd(d);
const MAX_FILE = 10 * 1024 * 1024, MAX_FILES = 10;
// Only plain pictures, PDFs, text, audio and video open in the browser; everything else downloads.
const INLINE = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain|audio\/[\w.+-]+|video\/[\w.+-]+)$/;

function createApi(ctx) {
  const publicFeed = (f) => { let host = ''; try { host = new URL(f.url).host; } catch {} return { id: f.id, name: f.name, category: f.category, kind: f.kind === 'assignment' ? 'assignment' : 'event', enabled: f.enabled !== false, lastSync: f.lastSync || 0, lastError: f.lastError || '', count: f.count || 0, host }; };
  const syncing = new Set();
  const kindOf = (k) => (k === 'assignment' ? 'assignment' : 'event');
  // reminders and repeating reminders new items of that kind usually get
  const importOpts = (kind) => { const d = ctx.getDb(), set = d.settings; return { prime: ctx.prime, today: ymd(new Date()), reminders: (set.reminderDefaults[kind] || []).slice(), nudges: kind === 'assignment' ? (set.nudgeDefaults.assignment || []) : [] }; };
  const ensureCategory = (name) => { const db = ctx.getDb(); if (name && !db.settings.categories.some((c) => c.name === name)) db.settings.categories.push({ name, color: '#0e8fb0' }); };
  // Downloads one calendar link and brings its events into the planner.
  async function syncFeed(feed) {
    const db = ctx.getDb();
    if (syncing.has(feed.id)) return { created: 0, updated: 0, removed: 0 };
    syncing.add(feed.id);
    try {
      const text = await calsync.fetchCalendar(feed.url);
      const res = calsync.importText(db, { id: feed.id, category: feed.category, kind: kindOf(feed.kind) }, text, importOpts(kindOf(feed.kind)));
      feed.lastSync = Date.now(); feed.lastError = ''; feed.count = db.items.filter((i) => i.source && i.source.feed === feed.id).length;
      ctx.save();
      return res;
    } catch (e) {
      feed.lastSync = Date.now(); feed.lastError = e.message; ctx.save();
      throw e;
    } finally { syncing.delete(feed.id); }
  }

  // Answers the request and returns true, or returns false when the path is not one of these.
  async function route(req, res, url) {
    const p = url.pathname;
    let db = ctx.getDb();
    if (p === '/api/state' && req.method === 'GET') { send(res, 200, { settings: db.settings, items: db.items, notepad: db.notepad, profile: db.profile, trash: db.trash, ...(ctx.state ? ctx.state() : {}) }); return true; }
  // Calendars: follow links (a timetable, Google Calendar...), import a file, export your own items.
  if (p === '/api/feeds' && req.method === 'GET') return send(res, 200, db.feeds.map(publicFeed));
  if (p === '/api/feeds' && req.method === 'POST') {
    const b = await readBody(req), name = String(b.name || '').trim().slice(0, 60), url = String(b.url || '').trim(), category = String(b.category || '').trim().slice(0, 40);
    if (!name) return send(res, 400, { error: 'Give the calendar a name.' });
    const feed = { id: crypto.randomUUID(), name, url, category, kind: kindOf(b.kind), enabled: true, lastSync: 0, lastError: '', count: 0 };
    try { new URL(url); } catch { return send(res, 400, { error: 'That is not a web address.' }); }
    db.feeds.push(feed);
    try { const r = await syncFeed(feed); ensureCategory(category); ctx.save(); return send(res, 200, { feed: publicFeed(feed), result: r }); }
    catch (e) { db.feeds = db.feeds.filter((f) => f !== feed); ctx.save(); return send(res, 400, { error: e.message }); }
  }
  const fm = p.match(/^\/api\/feeds\/([\w-]+)(\/sync)?$/);
  if (fm) {
    const feed = db.feeds.find((f) => f.id === fm[1]);
    if (!feed) return send(res, 404, {});
    if (fm[2] && req.method === 'POST') {
      try { return send(res, 200, { feed: publicFeed(feed), result: await syncFeed(feed) }); } catch (e) { return send(res, 502, { error: e.message, feed: publicFeed(feed) }); }
    }
    if (!fm[2] && req.method === 'PUT') {
      const b = await readBody(req);
      if ('name' in b) feed.name = String(b.name).trim().slice(0, 60) || feed.name;
      if ('enabled' in b) feed.enabled = !!b.enabled;
      if ('category' in b) { feed.category = String(b.category).trim().slice(0, 40); ensureCategory(feed.category); for (const it of db.items) if (it.source && it.source.feed === feed.id) it.category = feed.category; }
      // Changing what the calendar holds (lessons or deadlines) reads it again, so its items change type at once.
      if ('kind' in b && kindOf(b.kind) !== kindOf(feed.kind)) {
        feed.kind = kindOf(b.kind);
        try { const result = await syncFeed(feed); ctx.save(); return send(res, 200, { ...publicFeed(feed), result }); }
        catch (e) { ctx.save(); return send(res, 502, { error: `Saved, but the calendar could not be read again: ${e.message}`, feed: publicFeed(feed) }); }
      }
      ctx.save(); return send(res, 200, publicFeed(feed));
    }
    if (!fm[2] && req.method === 'DELETE') {
      let removed = 0;
      if (url.searchParams.get('events') === 'remove') { const n = db.items.length; db.items = db.items.filter((i) => !(i.source && i.source.feed === feed.id)); removed = n - db.items.length; }
      else for (const it of db.items) if (it.source && it.source.feed === feed.id) delete it.source;
      db.ignored = db.ignored.filter((k) => !k.startsWith(feed.id + '|'));
      db.feeds = db.feeds.filter((f) => f !== feed); ctx.save();
      return send(res, 200, { ok: true, removed });
    }
  }
  if (p === '/api/import' && req.method === 'POST') {
    const b = await readBody(req), name = String(b.name || 'calendar').slice(0, 80), category = String(b.category || '').trim().slice(0, 40);
    try {
      const r = calsync.importText(db, { id: 'file:' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), category, kind: kindOf(b.kind) }, String(b.ics || ''), importOpts(kindOf(b.kind)));
      ensureCategory(category); ctx.save(); return send(res, 200, r);
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (p === '/api/calendar.ics' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="chronkeep.ics"' });
    return res.end(ics.build(db.items.filter((i) => !i.source), { name: db.settings.name }));
  }

  if (p === '/api/profile' && req.method === 'PUT') {
    const b = await readBody(req), next = { ...db.profile };
    if ('name' in b) next.name = String(b.name).trim().slice(0, 80);
    if ('email' in b) {
      const e = String(b.email).trim().slice(0, 120);
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return send(res, 400, { error: 'That email does not look right.' });
      next.email = e;
    }
    if ('phone' in b) {
      const ph = String(b.phone).trim().slice(0, 30);
      if (ph && !/^[0-9+()\-.\s]{5,30}$/.test(ph)) return send(res, 400, { error: 'Use digits, spaces, + ( ) - only for the phone number.' });
      next.phone = ph;
    }
    if ('photo' in b) {
      const ph = String(b.photo || '');
      if (ph && !/^data:image\/(jpeg|png|webp);base64,/.test(ph)) return send(res, 400, { error: 'That picture could not be used.' });
      if (ph.length > 600000) return send(res, 400, { error: 'That picture is too large.' });
      next.photo = ph;
    }
    db.profile = next; ctx.save(); return send(res, 200, db.profile);
  }
  if (p === '/api/export' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="chronkeep-export-${ymd(new Date())}.json"` });
    return res.end(JSON.stringify({ exportedAt: new Date().toISOString(), profile: db.profile, settings: db.settings, items: db.items, notepad: db.notepad, bin: db.trash, calendars: db.feeds.map(publicFeed) }, null, 2));
  }
  if (p === '/api/account' && req.method === 'DELETE') {
    const want = db.profile.email || 'DELETE';
    if (String((await readBody(req)).confirm || '').trim().toLowerCase() !== want.toLowerCase()) return send(res, 400, { error: 'The confirmation did not match.' });
    await ctx.backups.now('pre-delete');
    await ctx.files.removeAll(db.items.concat(db.trash).map((x) => x.id));
    ctx.setDb(defaults()); ctx.save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/settings' && req.method === 'PUT') { db.settings = { ...db.settings, ...(await readBody(req)) }; ctx.save(); return send(res, 200, db.settings); }
  if (p === '/api/notepad' && req.method === 'PUT') { db.notepad = { html: String((await readBody(req)).html ?? ''), at: new Date().toISOString() }; ctx.save(); return send(res, 200, db.notepad); }

  // Backups: daily copies of the data file, kept for two weeks. Restoring keeps a copy of what was there.
  if (p === '/api/backups' && req.method === 'GET') return send(res, 200, await ctx.backups.list());
  if (p === '/api/backups' && req.method === 'POST') { const n = await ctx.backups.now(`manual-${dayStamp()}-${new Date().toTimeString().slice(0, 5).replace(':', '')}`); return send(res, 200, { name: n }); }
  const bm = p.match(/^\/api\/backups\/([\w.-]+)\/restore$/);
  if (bm && req.method === 'POST') {
    const data = await ctx.backups.read(bm[1]);
    if (!data || !Array.isArray(data.items)) return send(res, 400, { error: 'That backup could not be read.' });
    await ctx.backups.now(`pre-restore-${Date.now()}`);
    ctx.setDb(normalize(data)); ctx.save();
    return send(res, 200, { ok: true });
  }
  // The bin: deleted items wait here for 30 days and can be put back.
  if (p === '/api/trash' && req.method === 'DELETE') { await ctx.files.removeAll(db.trash.map((t) => t.id)); db.trash = []; ctx.save(); return send(res, 200, { ok: true });  }
  const tm = p.match(/^\/api\/trash\/([\w-]+)(\/restore)?$/);
  if (tm) {
    const i = db.trash.findIndex((x) => x.id === tm[1]);
    if (i < 0) return send(res, 404, {});
    if (tm[2] && req.method === 'POST') {
      const { deletedAt, ...item } = db.trash.splice(i, 1)[0];
      if (item.source) db.ignored = db.ignored.filter((k) => k !== `${item.source.feed}|${item.source.key}`);
      ctx.prime(item); db.items.push(item); ctx.save(); return send(res, 200, item);
    }
    if (!tm[2] && req.method === 'DELETE') { await ctx.files.removeAll([db.trash[i].id]); db.trash.splice(i, 1); ctx.save(); return send(res, 200, { ok: true }); }
  }

  if (p === '/api/items' && req.method === 'POST') {
    const it = { id: crypto.randomUUID(), type: 'todo', title: '', notes: '', date: '', time: '', endTime: '', location: '', priority: '', subtasks: [], attachments: [], done: false, doneOn: [], reminders: [], nudges: [], repeat: 'none', category: '', ...(await readBody(req)) };
    ctx.prime(it); db.items.push(it); ctx.save(); return send(res, 200, it);
  }
  // Attachments
  const fup = p.match(/^\/api\/items\/([\w-]+)\/files$/);
  if (fup && req.method === 'POST') {
    const item = db.items.find((x) => x.id === fup[1]);
    if (!item) return send(res, 404, { error: 'That item no longer exists.' });
    if ((item.attachments || []).length >= MAX_FILES) return send(res, 400, { error: `An item can have up to ${MAX_FILES} files.` });
    const data = await readRaw(req, MAX_FILE);
    if (!data) return send(res, 413, { error: 'That file is larger than 10 MB.' });
    if (!data.length) return send(res, 400, { error: 'That file is empty.' });
    const meta = { id: crypto.randomBytes(4).toString('hex'), name: cleanName(url.searchParams.get('name')), size: data.length, type: String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].toLowerCase(), addedAt: Date.now() };
    await ctx.files.put(item.id, meta.id, data);
    item.attachments = [...(item.attachments || []), meta]; ctx.save();
    return send(res, 200, meta);
  }
  const fget = p.match(/^\/api\/files\/([\w-]+)\/([a-f0-9]{8})$/);
  if (fget && req.method === 'GET') {
    const item = db.items.find((x) => x.id === fget[1]), meta = item && (item.attachments || []).find((a) => a.id === fget[2]);
    const bytes = meta && (await ctx.files.get(item.id, meta.id));
    if (!bytes) { res.writeHead(404); return res.end('Not found'); }
    const inline = INLINE.test(meta.type);
    res.writeHead(200, { 'Content-Type': inline ? meta.type : 'application/octet-stream', 'Content-Length': meta.size, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=0' });
    return res.end(bytes);
  }
  const fdel = p.match(/^\/api\/items\/([\w-]+)\/files\/([a-f0-9]{8})$/);
  if (fdel && req.method === 'DELETE') {
    const item = db.items.find((x) => x.id === fdel[1]);
    if (!item || !(item.attachments || []).some((a) => a.id === fdel[2])) return send(res, 404, {});
    item.attachments = item.attachments.filter((a) => a.id !== fdel[2]); await ctx.files.remove(item.id, fdel[2]); ctx.save();
    return send(res, 200, { ok: true });
  }
  // "Only this one": take a single occurrence out of a repeating series. The series skips that day and a
  // separate, non-repeating item takes its place, carrying whatever changes were made.
  const om = p.match(/^\/api\/items\/([\w-]+)\/occurrence$/);
  if (om && req.method === 'POST') {
    const orig = db.items.find((x) => x.id === om[1]), b = await readBody(req), occ = String(b.occ || '');
    if (!orig || !Recur.isRepeat(orig) || !/^\d{4}-\d{2}-\d{2}$/.test(occ)) return send(res, 400, { error: 'That is not a repeating item.' });
    const ALLOWED = ['type', 'title', 'notes', 'location', 'date', 'time', 'endTime', 'endDate', 'category', 'reminders', 'nudges'];
    const patch = Object.fromEntries(Object.entries(b.patch || {}).filter(([k]) => ALLOWED.includes(k)));
    const copy = { ...JSON.parse(JSON.stringify(orig)), id: crypto.randomUUID(), repeat: 'none', repeatUntil: '', skip: [], doneOn: [], done: (orig.doneOn || []).includes(occ), doneAt: null, lastNag: 0, date: occ, ...patch };
    delete copy.source; copy.attachments = [];
    orig.skip = [...new Set([...(orig.skip || []), occ])]; orig.doneOn = (orig.doneOn || []).filter((x) => x !== occ);
    ctx.prime(orig); ctx.prime(copy); db.items.push(copy); ctx.save();
    return send(res, 200, { original: orig, created: copy });
  }
  const m = p.match(/^\/api\/items\/([\w-]+)$/);
  if (m) {
    const i = db.items.findIndex((x) => x.id === m[1]);
    if (i < 0) return send(res, 404, {});
    if (req.method === 'PUT') {
      const patch = await readBody(req);
      delete patch.attachments; delete patch.source; // files and calendar links change only through their own routes
      db.items[i] = { ...db.items[i], ...patch, id: m[1] };
      if (['date', 'time', 'reminders', 'repeat', 'nudges', 'skip', 'repeatUntil', 'endDate'].some((k) => k in patch)) { db.items[i].lastNag = 0; ctx.prime(db.items[i]); }
      ctx.save(); return send(res, 200, db.items[i]);
    }
    if (req.method === 'DELETE') { const [gone] = db.items.splice(i, 1); if (gone.source) db.ignored = [...db.ignored.slice(-4999), `${gone.source.feed}|${gone.source.key}`]; db.trash.unshift({ ...gone, deletedAt: Date.now() }); db.trash.length = Math.min(db.trash.length, 200); ctx.save(); return send(res, 200, db.trash[0]); }
  }

    return false;
  }
  // The routes answer with `return send(...)`, so "handled" means a response was started.
  const handle = async (req, res, url) => { const r = await route(req, res, url); return r === true || res.headersSent; };
  return { handle, syncFeed, publicFeed };
}

module.exports = { createApi, INLINE, MAX_FILE, MAX_FILES, dayStamp };
