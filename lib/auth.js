// Access control for ChronKeep: who may talk to the server.
const crypto = require('crypto');
const os = require('os');

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(pin, salt, 32).toString('hex') };
}
function checkPin(pin, rec) {
  if (!rec) return false;
  const a = Buffer.from(crypto.scryptSync(String(pin), rec.salt, 32).toString('hex')), b = Buffer.from(rec.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const validPin = (p) => /^[0-9]{6,12}$/.test(String(p));

const isLoopback = (addr) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

// Browsers send the address they typed in the Host header. Anything unexpected is refused, which stops
// a web page on the internet from reaching this server by pointing its own name at 127.0.0.1.
function hostAllowed(hostHeader, lan) {
  const h = String(hostHeader || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(h)) return true;
  if (!lan) return false;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(h) || h.endsWith('.local');
}
function sameOrigin(origin, host) { try { return new URL(origin).host === host; } catch { return false; } }

function cookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return out;
}

function lanUrls(port) {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) urls.push(`http://${n.address}:${port}`);
  return urls;
}

// Five wrong PINs from one address, then a one minute pause.
function limiter() {
  const tries = new Map();
  return {
    blocked(ip) { const t = tries.get(ip); return !!t && t.until > Date.now(); },
    fail(ip) { const t = tries.get(ip) || { n: 0, until: 0 }; t.n += 1; if (t.n >= 5) { t.until = Date.now() + 60000; t.n = 0; } tries.set(ip, t); },
    ok(ip) { tries.delete(ip); },
  };
}

module.exports = { sha, newToken, hashPin, checkPin, validPin, isLoopback, hostAllowed, sameOrigin, cookies, lanUrls, limiter };
