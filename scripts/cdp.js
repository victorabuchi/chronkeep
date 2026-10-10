// A tiny Chrome DevTools driver (no dependencies) for taking real screenshots of the running app.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME = process.env.CHROME || '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(port = 9333) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-chrome-'));
  const child = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  let list;
  for (let i = 0; i < 50; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.some((t) => t.type === 'page')) break; } catch {} await sleep(200); }
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); // the film is always shown in light
  const api = {
    send,
    // Makes the page believe it is `when`, and keeps the clock running from there.
    async pretendNow(when) {
      const off = when.getTime() - Date.now();
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const R = Date, off = ${off}; class D extends R { constructor(...a) { a.length ? super(...a) : super(R.now() + off); } static now() { return R.now() + off; } } window.Date = D; })();` });
    },
    async viewport(w, h, dpr = 2, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile }); },
    async goto(url) { await send('Page.navigate', { url }); await sleep(900); },
    async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
    async shot(file, { format = 'png', quality } = {}) { const r = await send('Page.captureScreenshot', { format, ...(quality ? { quality } : {}), fromSurface: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
    // the box of an element, in CSS pixels, for pointing the film's cursor at it
    async rect(selector) { return api.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`); },
    sleep,
    async close() { try { ws.close(); } catch {} child.kill(); },
  };
  return api;
}
module.exports = { launch, sleep };
