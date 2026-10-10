// The page's script lives in public/js/NN-name.js, one file per section, in order. The server joins them into the
// single app.js the browser loads, so it is one scope exactly as if it had always been one file (no build step).
const fs = require('fs');
const path = require('path');

function assembleApp(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^\d+-.*\.js$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return `(() => {\n${files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')}\n})();\n`;
}
module.exports = { assembleApp };
