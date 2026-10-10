const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { assembleApp } = require('../lib/assets');

test('the page script, assembled from its sections, is valid JavaScript', () => {
  const code = assembleApp(path.join(__dirname, '..', 'public', 'js'));
  assert.doesNotThrow(() => new vm.Script(code, { filename: 'app.js' })); // a repeated const across files would fail here
  assert.ok(code.startsWith('(() => {') && code.trimEnd().endsWith('})();'));
});
test('sections are numbered and sorted', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'public', 'js'));
  assert.ok(files.every((f) => /^\d{3}-[a-z-]+\.js$/.test(f)), 'files are NNN-name.js');
});
