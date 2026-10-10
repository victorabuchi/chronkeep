// Takes the screenshots the landing page film is made of, from the real app with demo data.
//   node scripts/shots.js            writes site/film/*.webp and site/film/film.json
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { launch, sleep } = require('./cdp');
const { demo, pretendNow } = require('./demo-data');

const OUT = path.join(__dirname, '..', 'site', 'film');
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });

// A fresh copy of the app with the demo week in it (each set of pictures changes the data, so each gets its own).
async function startApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-shots-')), file = path.join(dir, 'data.json'), port = await freePort();
  fs.writeFileSync(file, JSON.stringify({ settings: { notifyMac: false, notifyPhone: false, digestHour: -1, nagHours: 0 }, profile: { name: 'Victor Abuchi', email: 'victor@example.com', phone: '', photo: '' }, items: demo() }));
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port), CHRONKEEP_DATA: file, CHRONKEEP_NO_DESKTOP: '1' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/state')).ok) break; } catch {} await sleep(100); }
  return { base, stop: () => server.kill() };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await launch();
  const film = {};
  try {
    await chrome.pretendNow(pretendNow());
    const web = require('./shots-web');
    for (const set of (process.env.ONLY ? [process.env.ONLY] : ['desktop', 'phone'])) {
      const app = await startApp();
      try { await web.run({ chrome, base: app.base, OUT, film, sleep }, set); } finally { app.stop(); }
    }
  } finally { await chrome.close(); }
  const file = path.join(OUT, 'film.json'), old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(file, JSON.stringify({ ...old, ...film }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
