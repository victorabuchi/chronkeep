// Takes the README pictures (docs/*.png) from the real app with demo data.   node scripts/docs-shots.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { launch, sleep } = require('./cdp');
const { demo, pretendNow } = require('./demo-data');

const OUT = path.join(__dirname, '..', 'docs');
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });

async function startApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-docs-')), file = path.join(dir, 'data.json'), port = await freePort();
  fs.writeFileSync(file, JSON.stringify({ settings: { notifyMac: false, notifyPhone: false, digestHour: -1, nagHours: 0 }, profile: { name: 'Victor Abuchi', email: 'victor@example.com', phone: '', photo: '' }, items: demo() }));
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port), CHRONKEEP_DATA: file, CHRONKEEP_NO_DESKTOP: '1' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/state')).ok) break; } catch {} await sleep(100); }
  return { base, stop: () => server.kill() };
}

(async () => {
  const c = await launch(9983), app = await startApp();
  try {
    await c.pretendNow(pretendNow());
    const open = async (w, h, dpr, mobile, js, dark) => {
      await c.viewport(w, h, dpr, mobile);
      await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
      await c.goto(app.base + '/'); await c.eval('localStorage.clear(); sessionStorage.clear()'); await c.goto(app.base + '/');
      for (let i = 0; i < 40 && !(await c.eval("document.querySelectorAll('.ev,.trow').length > 3")); i++) await sleep(150);
      await sleep(600); if (js) await c.eval(js); await sleep(700);
    };
    await open(1280, 800, 2, false); await c.shot(`${OUT}/calendar.png`);
    await open(1280, 800, 2, false, `document.querySelector('#navTasks').click()`); await c.shot(`${OUT}/tasks.png`);
    await open(1280, 800, 2, false, null, true); await c.shot(`${OUT}/calendar-dark.png`);
    await open(390, 780, 3, true); await c.shot(`${OUT}/phone.png`);
  } finally { app.stop(); await c.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
