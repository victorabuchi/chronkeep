// Small helpers shared by the local and the cloud server.
const path = require('path');

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = (req, limit = 12 * 1024 * 1024) => new Promise((r) => {
  let b = '', size = 0;
  req.on('data', (c) => { size += c.length; if (size > limit) { req.destroy(); return r({}); } b += c; });
  req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } });
});
const readRaw = (req, limit) => new Promise((resolve) => {
  const chunks = []; let size = 0, over = false;
  req.on('data', (c) => { size += c.length; if (size > limit) { over = true; chunks.length = 0; } else if (!over) chunks.push(c); });
  req.on('end', () => resolve(over ? null : Buffer.concat(chunks)));
  req.on('error', () => resolve(null));
});
const cleanName = (n) => path.basename(String(n || 'file')).replace(/[^\w.\- ()\[\]]+/g, '_').slice(-120) || 'file';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

module.exports = { send, readBody, readRaw, cleanName, types };
