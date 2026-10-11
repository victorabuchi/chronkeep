// Browser push: reminders as real notifications on a computer or phone browser, even with the tab closed.
// Each browser that allows notifications is one row in push_subs; a job looks at everyone's data every minute.
const webpush = require('web-push');
const db = require('./db');
const { due, initState, wallNow } = require('../lib/reminders');

let vapid = null;
// The signing keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY if set, otherwise they are made once and kept in the database.
async function keys() {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  else {
    const row = (await db.q("select value from server_kv where key = 'vapid'")).rows[0];
    if (row) vapid = JSON.parse(row.value);
    else {
      const made = webpush.generateVAPIDKeys();
      await db.q("insert into server_kv (key, value) values ('vapid', $1) on conflict (key) do nothing", [JSON.stringify(made)]);
      vapid = JSON.parse((await db.q("select value from server_kv where key = 'vapid'")).rows[0].value);
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@chronkeep.app', vapid.publicKey, vapid.privateKey);
  return vapid;
}

const validSub = (s) => s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';

async function subscribe(userId, sub, tz, doc) {
  if (!validSub(sub)) throw new Error('That browser sent no push address.');
  await db.q('insert into push_subs (user_id, endpoint, sub, tz) values ($1, $2, $3, $4) on conflict (user_id, endpoint) do update set sub = excluded.sub, tz = excluded.tz', [userId, sub.endpoint, JSON.stringify(sub), String(tz || 'UTC').slice(0, 64)]);
  const have = (await db.q('select 1 from push_state where user_id = $1', [userId])).rows.length;
  if (!have) await db.q('insert into push_state (user_id, state) values ($1, $2) on conflict (user_id) do nothing', [userId, JSON.stringify(initState(doc, wallNow(tz)))]);
}
async function unsubscribe(userId, endpoint) { await db.q('delete from push_subs where user_id = $1 and endpoint = $2', [userId, endpoint]); }
async function isSubscribed(userId, endpoint) { return (await db.q('select 1 from push_subs where user_id = $1 and endpoint = $2', [userId, endpoint])).rows.length > 0; }

// Sends to every browser of one person. Browsers that have gone away (the push service says 404/410) are forgotten.
async function sendTo(userId, msg) {
  await keys();
  const subs = (await db.q('select endpoint, sub from push_subs where user_id = $1', [userId])).rows;
  let sent = 0;
  for (const r of subs) {
    try { await webpush.sendNotification(r.sub, JSON.stringify(msg), { TTL: 3600, urgency: 'high' }); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await unsubscribe(userId, r.endpoint); else console.error('Push failed:', e.statusCode || '', e.body || e.message); }
  }
  return sent;
}

// Every minute: whose reminders have fallen due since the last look?
async function job(docOf) {
  let users;
  try { users = (await db.q('select distinct on (s.user_id) s.user_id, s.tz, p.state from push_subs s left join push_state p on p.user_id = s.user_id order by s.user_id, s.created_at desc')).rows; } catch (e) { console.error('Push job:', e.message); return 0; }
  let n = 0;
  for (const u of users) {
    try {
      const entry = await docOf(u.user_id);
      if (!entry) continue;
      const now = wallNow(u.tz), state = u.state && u.state.last ? u.state : initState(entry.doc, now);
      for (const m of due(entry.doc, state, now)) {
        n += await sendTo(u.user_id, { title: m.title, body: m.body, tag: m.tag, url: m.itemId ? `/app?open=${m.itemId}` : '/app' });
      }
      await db.q('insert into push_state (user_id, state) values ($1, $2) on conflict (user_id) do update set state = excluded.state', [u.user_id, JSON.stringify(state)]);
    } catch (e) { console.error('Push job for', u.user_id, e.message); }
  }
  return n;
}

module.exports = { keys, subscribe, unsubscribe, isSubscribed, sendTo, job, validSub };
