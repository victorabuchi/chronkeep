const test = require('node:test');
const assert = require('node:assert/strict');
const desktop = require('../lib/desktop');

const EVIL = `x"; rm -rf ~; $(touch /tmp/pwned) \`id\` ' -- --urgency=critical`;

test('linux: text is plain arguments after "--", so it cannot be read as an option or a command', () => {
  const c = desktop.linux('--icon=/etc/passwd', EVIL, {});
  assert.equal(c.cmd, 'notify-send');
  const i = c.args.indexOf('--');
  assert.deepEqual(c.args.slice(i + 1), ['--icon=/etc/passwd', EVIL.replace(/\s+/g, ' ')]);
  assert.ok(!c.args.slice(0, i).some((a) => a.includes('rm -rf')));
});
test('linux: buttons only for items, and an icon when there is one', () => {
  assert.equal(desktop.linux('a', 'b', {}).args.includes('-A'), false);
  const c = desktop.linux('a', 'b', { itemId: 'x' }, '/tmp/icon.png');
  assert.deepEqual([c.args.includes('snooze=Snooze 10 min'), c.args.includes('done=Done'), c.args.includes('-w'), c.waits], [true, true, true, true]);
  assert.equal(c.args[c.args.indexOf('-i') + 1], '/tmp/icon.png');
});
test('linux: long text is cut', () => assert.ok(desktop.linux('t'.repeat(999), 'b'.repeat(9999)).args.slice(-2).every((s) => s.length <= 600)));
test('windows: the script holds no user text, the text travels in environment variables', () => {
  const c = desktop.windows('Title with "quotes" and $(whoami)', EVIL);
  const script = Buffer.from(c.args[c.args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
  assert.equal(script, desktop.WINDOWS_SCRIPT);
  assert.ok(!script.includes('whoami') && !script.includes('rm -rf'));
  assert.equal(c.env.CK_TITLE, 'Title with "quotes" and $(whoami)');
  assert.match(script, /\$env:CK_TITLE/);
  assert.ok(c.args.includes('-NoProfile') && c.args.includes('-NonInteractive'));
});
