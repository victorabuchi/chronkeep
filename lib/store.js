// Storage for ChronKeep: atomic saves, recovery from a damaged file, and rotating backups.
const fs = require('fs');
const path = require('path');

const pad = (n) => String(n).padStart(2, '0');
const dayStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const backupDir = (file) => path.join(path.dirname(file), 'backups');
const DATED = /^data-\d{4}-\d{2}-\d{2}\.json$/;

// Write to a temp file, then rename over the real one, so a crash mid-save cannot leave half a file.
function save(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function list(file) {
  const dir = backupDir(file);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /^data-.*\.json$/.test(n)).map((n) => {
    const st = fs.statSync(path.join(dir, n));
    return { name: n, size: st.size, at: st.mtimeMs };
  }).sort((a, b) => b.at - a.at);
}

function prune(file, keepDays, keepLabeled) {
  const dir = backupDir(file), all = list(file);
  const dated = all.filter((b) => DATED.test(b.name)), labeled = all.filter((b) => !DATED.test(b.name));
  for (const b of [...dated.slice(keepDays), ...labeled.slice(keepLabeled)]) fs.rmSync(path.join(dir, b.name), { force: true });
}

// A copy of the data file under a label ("pre-delete", "manual-1030") kept for later.
function backupNow(file, label) {
  if (!fs.existsSync(file)) return null;
  const dir = backupDir(file);
  fs.mkdirSync(dir, { recursive: true });
  const name = `data-${label}.json`;
  fs.copyFileSync(file, path.join(dir, name));
  prune(file, 14, 20);
  return name;
}

// One backup per day, the first time the server is running that day.
function dailyBackup(file) {
  if (!fs.existsSync(file)) return null;
  const name = `data-${dayStamp()}.json`, dest = path.join(backupDir(file), name);
  if (fs.existsSync(dest)) return null;
  return backupNow(file, dayStamp());
}

// Reads the data file. If it is damaged it is kept aside (never overwritten) and the newest good backup is used.
function load(file) {
  if (!fs.existsSync(file)) return { data: null, recoveredFrom: null };
  try { return { data: JSON.parse(fs.readFileSync(file, 'utf8')), recoveredFrom: null }; } catch {}
  const aside = `${file.replace(/\.json$/, '')}.corrupt-${Date.now()}.json`;
  fs.renameSync(file, aside);
  for (const b of list(file)) {
    try { return { data: JSON.parse(fs.readFileSync(path.join(backupDir(file), b.name), 'utf8')), recoveredFrom: b.name, keptAs: aside }; } catch {}
  }
  return { data: null, recoveredFrom: null, keptAs: aside };
}

function readBackup(file, name) {
  if (!/^data-[\w.-]+\.json$/.test(name)) return null;
  const p = path.join(backupDir(file), name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

module.exports = { save, load, list, backupNow, dailyBackup, readBackup, dayStamp };
