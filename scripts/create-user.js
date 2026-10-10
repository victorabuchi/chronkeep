// Creates an account (or sets a new password for an existing one) straight in the database from .env.
//   CK_EMAIL=you@example.com CK_NAME="Your Name" CK_PASSWORD='…' node scripts/create-user.js
const fs = require('node:fs');
const path = require('node:path');
// a minimal .env reader, so no extra package is needed
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)="?(.*?)"?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const db = require('../cloud/db');
const auth = require('../cloud/auth');

(async () => {
  const email = String(process.env.CK_EMAIL || '').trim().toLowerCase(), name = process.env.CK_NAME || email.split('@')[0], password = process.env.CK_PASSWORD || '';
  if (!email.includes('@') || password.length < auth.MIN_PASSWORD) throw new Error('Set CK_EMAIL and CK_PASSWORD (at least 10 characters).');
  await db.connect();
  const secretHash = await auth.hashPassword(password);
  const user = await db.userByEmail(email);
  if (!user) { await db.createUser({ email, name, provider: 'password', subject: email, secretHash }); console.log('Created the account for', email); }
  else {
    await db.q(`insert into auth_identities (user_id, provider, subject, secret_hash, last_used_at) values ($1,'password',$2,$3, now()) on conflict (provider, subject) do update set secret_hash = excluded.secret_hash`, [user.id, email, secretHash]);
    console.log('Set a new password for', email);
  }
  await db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
