// Start ChronKeep when you log in to your Mac, and restart it if it stops (a macOS launch agent).
// CLI: node lib/autostart.js install | uninstall | status
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const LABEL = process.env.CHRONKEEP_LABEL || 'com.victorabuchi.chronkeep';
const ROOT = path.join(__dirname, '..');
const PLIST = path.join(os.homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const LOGS = path.join(os.homedir(), 'Library/Logs/ChronKeep');
const domain = () => `gui/${process.getuid()}`;
const supported = () => process.platform === 'darwin';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function plist() {
  const env = { PATH: process.env.PATH || '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' };
  for (const k of ['PORT', 'CHRONKEEP_DATA']) if (process.env[k]) env[k] = process.env[k];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${esc(LABEL)}</string>
  <key>ProgramArguments</key><array><string>${esc(process.execPath)}</string><string>${esc(path.join(ROOT, 'server.js'))}</string></array>
  <key>WorkingDirectory</key><string>${esc(ROOT)}</string>
  <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${esc(k)}</key><string>${esc(v)}</string>`).join('')}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>AbandonProcessGroup</key><true/>
  <key>StandardOutPath</key><string>${esc(path.join(LOGS, 'server.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(path.join(LOGS, 'server.log'))}</string>
</dict></plist>
`;
}

const loaded = () => { try { execFileSync('launchctl', ['print', `${domain()}/${LABEL}`], { stdio: 'ignore' }); return true; } catch { return false; } };
const status = () => ({ supported: supported(), enabled: fs.existsSync(PLIST), running: supported() && loaded(), managed: process.env.XPC_SERVICE_NAME === LABEL });

// Registers the agent. If a hand-started server is running on the same port it steps aside a moment later,
// so the launch agent's copy can take over.
function install({ handOver = false } = {}) {
  if (!supported()) throw new Error('Auto-start is only available on macOS.');
  fs.mkdirSync(LOGS, { recursive: true });
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.writeFileSync(PLIST, plist());
  const cmd = `launchctl bootout ${domain()}/${LABEL} 2>/dev/null; launchctl bootstrap ${domain()} '${PLIST}'`;
  if (handOver) spawn('sh', ['-c', `sleep 1.2; ${cmd}`], { detached: true, stdio: 'ignore' }).unref();
  else { try { execFileSync('sh', ['-c', cmd], { stdio: 'ignore' }); } catch (e) { throw new Error('launchctl could not load the agent.'); } }
}

// Removes the agent. If this server was started by it, a plain copy takes its place so ChronKeep stays open.
function uninstall({ keepRunning = false } = {}) {
  if (!supported()) return;
  const restart = keepRunning ? `sleep 1.5; cd '${ROOT}'; nohup '${process.execPath}' server.js >/dev/null 2>&1 &` : '';
  const cmd = `launchctl bootout ${domain()}/${LABEL} 2>/dev/null; rm -f '${PLIST}'; ${restart}`;
  if (keepRunning) spawn('sh', ['-c', cmd], { detached: true, stdio: 'ignore' }).unref();
  else { try { execFileSync('sh', ['-c', cmd], { stdio: 'ignore' }); } catch {} }
}

module.exports = { status, install, uninstall, LABEL, PLIST };

if (require.main === module) {
  const [, , cmd] = process.argv;
  try {
    if (cmd === 'install') { install(); console.log('Installed. ChronKeep now starts when you log in.'); }
    else if (cmd === 'uninstall') { uninstall(); console.log('Removed.'); }
    else console.log(JSON.stringify(status()));
  } catch (e) { console.error(e.message); process.exit(1); }
}
