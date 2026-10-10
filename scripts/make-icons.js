// Renders the ChronKeep icon (scripts/icon.js) to every PNG/ICO the web app and the mobile app use.
// Usage: node scripts/make-icons.js [path to the chronkeep-mobile repo]
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp');
const icon = require('./icon');

const web = path.join(__dirname, '..', 'public');
const mob = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'chronkeep-mobile'), 'assets');

const jobs = [
  [icon.rounded, 64, path.join(web, 'favicon-64.png')],
  [icon.rounded, 32, path.join(web, 'favicon-32.png')],
  [icon.tile, 180, path.join(web, 'apple-touch-icon.png')],
  [icon.rounded, 192, path.join(web, 'icon-192.png')],
  [icon.rounded, 512, path.join(web, 'icon-512.png')],
  [icon.tile, 1024, path.join(mob, 'icon.png')],
  [icon.foreground, 1024, path.join(mob, 'android-icon-foreground.png'), true],
  [icon.rounded, 1024, path.join(mob, 'splash-icon.png'), true],
  [icon.rounded, 48, path.join(mob, 'favicon.png'), true],
  [icon.tile, 512, path.join(mob, 'play-store-icon.png')],
  [icon.mono, 96, path.join(mob, 'notification-icon.png'), true],
  [icon.rounded, 192, path.join(mob, 'mark.png'), true],
];

(async () => {
  const c = await launch(9982);
  await c.transparent();
  for (const [make, size, file] of jobs) {
    await c.viewport(size, size, 1);
    const svg = make().replace('<svg ', `<svg width="${size}" height="${size}" `);
    await c.goto('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`));
    await sleep(150);
    await c.shot(file);
    console.log(path.relative(process.cwd(), file));
  }
  await c.close();
  // favicon.ico: a PNG-in-ICO wrapper around the 64px render
  const png = fs.readFileSync(path.join(web, 'favicon-64.png'));
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = 64; head[7] = 64; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(web, 'favicon.ico'), Buffer.concat([head, png]));
  fs.unlinkSync(path.join(web, 'favicon-64.png'));
})();
