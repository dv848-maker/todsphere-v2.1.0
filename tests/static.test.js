'use strict';
// Runs the single-page app's static checks (scripts/check.js) as part of `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

test('index.html passes the static checks (scripts compile, ids unique, handlers and assets resolve)', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'check.js')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /check OK/);
});
