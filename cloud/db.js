// Postgres access for the cloud server: users, sign-in identities, each person's document, files, backups.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { defaults, normalize } = require('../lib/model');
const { stamp } = require('../lib/sync');

let pool;
const q = async (text, params) => {
  try { return await pool.query(text, params); } catch (e) {
    if (['EADDRNOTAVAIL', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', '57P01'].includes(e.code) || /Connection terminated/.test(e.message)) return pool.query(text, params);
    throw e;
  }
};

async function connect(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set. On Supabase use the Session pooler string (port 5432); the direct connection is IPv6 only and does not work from Render.');
  const local = /localhost|127\.0\.0\.1/.test(url);
  pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX) || 4, ssl: local ? false : { rejectUnauthorized: false }, keepAlive: true, idleTimeoutMillis: 20000, connectionTimeoutMillis: 15000 });
  // An idle connection can be dropped by the network or the pooler. That must never stop the server: the pool just opens a new one.
  pool.on('error', (e) => console.error('Database connection dropped (a new one is opened when needed):', e.code || e.message));
  await q(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return pool;
}
const close = () => pool && pool.end();

// ---- people ----
const userByEmail = async (email) => (await q('select * from users where email = $1', [email])).rows[0] || null;
const userById = async (id) => (await q('select * from users where id = $1', [id])).rows[0] || null;

async function createUser({ email, name, provider, subject, secretHash }) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const u = (await c.query('insert into users (email, name, last_sign_in_at) values ($1, $2, now()) returning *', [email, name])).rows[0];
    await c.query('insert into auth_identities (user_id, provider, subject, secret_hash, last_used_at) values ($1, $2, $3, $4, now())', [u.id, provider, subject, secretHash || null]);
    const doc = normalize({ profile: { name, email, phone: '', photo: '' } });
    await c.query('insert into user_data (user_id, doc) values ($1, $2)', [u.id, JSON.stringify(stamp(doc))]);
    await c.query('commit');
    return u;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}
const identity = async (provider, subject) => (await q('select * from auth_identities where provider = $1 and subject = $2', [provider, subject])).rows[0] || null;
const touchIdentity = async (id, userId) => { await q('update auth_identities set last_used_at = now() where id = $1', [id]); await q('update users set last_sign_in_at = now() where id = $1', [userId]); };
const addIdentity = (userId, provider, subject) => q('insert into auth_identities (user_id, provider, subject, last_used_at) values ($1, $2, $3, now()) on conflict do nothing', [userId, provider, subject]);
const deleteUser = (id) => q('delete from users where id = $1', [id]);

// ---- documents ----
async function loadDoc(userId) {
  const row = (await q('select doc from user_data where user_id = $1', [userId])).rows[0];
  if (!row) return null;
  const doc = normalize(row.doc);
  doc.sync = row.doc.sync;
  return stamp(doc);
}
const saveDoc = (userId, doc) => q('insert into user_data (user_id, doc, updated_at) values ($1, $2, now()) on conflict (user_id) do update set doc = excluded.doc, updated_at = now()', [userId, JSON.stringify(doc)]);

// ---- files ----
const filePut = (userId, item, att, data) => q('insert into files (user_id, item_id, att_id, data) values ($1,$2,$3,$4) on conflict (user_id, item_id, att_id) do update set data = excluded.data', [userId, item, att, data]);
const fileGet = async (userId, item, att) => (await q('select data from files where user_id = $1 and item_id = $2 and att_id = $3', [userId, item, att])).rows[0]?.data || null;
const fileRemove = (userId, item, att) => q('delete from files where user_id = $1 and item_id = $2 and att_id = $3', [userId, item, att]);
const filesRemoveFor = (userId, ids) => (ids.length ? q('delete from files where user_id = $1 and item_id = any($2)', [userId, ids]) : null);

// ---- backups ----
async function backupList(userId) { return (await q('select name, length(doc::text) as size, extract(epoch from created_at) * 1000 as at from backups where user_id = $1 order by created_at desc limit 40', [userId])).rows.map((r) => ({ name: r.name, size: Number(r.size), at: Number(r.at) })); }
async function backupNow(userId, doc, label) {
  const name = `data-${label}.json`;
  await q('insert into backups (user_id, name, doc) values ($1,$2,$3) on conflict (user_id, name) do update set doc = excluded.doc, created_at = now()', [userId, name, JSON.stringify(doc)]);
  // keep 14 daily copies and 20 others
  await q(`delete from backups where user_id = $1 and name ~ '^data-\\d{4}-\\d{2}-\\d{2}\\.json$' and name not in (select name from backups where user_id = $1 and name ~ '^data-\\d{4}-\\d{2}-\\d{2}\\.json$' order by name desc limit 14)`, [userId]);
  await q(`delete from backups where user_id = $1 and name !~ '^data-\\d{4}-\\d{2}-\\d{2}\\.json$' and name not in (select name from backups where user_id = $1 and name !~ '^data-\\d{4}-\\d{2}-\\d{2}\\.json$' order by created_at desc limit 20)`, [userId]);
  return name;
}
async function backupRead(userId, name) { if (!/^data-[\w.-]+\.json$/.test(name)) return null; return (await q('select doc from backups where user_id = $1 and name = $2', [userId, name])).rows[0]?.doc || null; }

module.exports = { connect, close, q, userByEmail, userById, createUser, identity, touchIdentity, addIdentity, deleteUser, loadDoc, saveDoc, filePut, fileGet, fileRemove, filesRemoveFor, backupList, backupNow, backupRead, defaults };
