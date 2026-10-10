// Starts a real ChronKeep server on a spare port with its own temporary data folder.
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer({ data = {}, tick = 200, dir } = {}) {
  dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'ck-'));
  const file = path.join(dir, 'data.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ settings: { notifyMac: false, notifyPhone: false, digestHour: -1, nagHours: 0, ...(data.settings || {}) }, items: data.items || [] }));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), CHRONKEEP_DATA: file, CHRONKEEP_TICK_MS: String(tick), CHRONKEEP_NO_DESKTOP: '1', TZ: 'Europe/Helsinki' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/state')).ok) break; } catch {} await sleep(100); }
  const api = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, { method, headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return {
    port, dir, file, base, api, log: () => log,
    state: async () => (await api('GET', '/api/state')).data,
    stop: async () => { child.kill(); await new Promise((r) => child.once('exit', r)); },
    readData: () => JSON.parse(fs.readFileSync(file, 'utf8')),
  };
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
module.exports = { startServer, sleep, today, plusDays };
