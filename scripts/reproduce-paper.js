#!/usr/bin/env node
'use strict';

const NPPE = require('../src/nppe-engine.js');
const PAPER = require('../src/nppe-paper.js');
const DATA = require('../src/paper-data.js');

const nsim = Number(process.env.NSIM || 10000);
const seed = Number(process.env.SEED || 20260922);
if (!Number.isInteger(nsim) || nsim < 100 || nsim > 20000) throw new Error('NSIM must be an integer from 100 to 20000');
if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('SEED must be an integer from 0 to 4294967295');

const cfg = NPPE.createConfig();
const repro = PAPER.reproduce(DATA, cfg, { nsim, seed });
const verification = PAPER.verify(DATA, repro);

console.log('TODSphere ' + NPPE.SOFTWARE.version + ' — manuscript/reference-data reproduction');
console.log('Methodology: ' + NPPE.METHODOLOGY.id + ' v' + NPPE.METHODOLOGY.version);
console.log('Configuration: ' + cfg.id + ' (' + cfg.hash + ')');
console.log('Verification: ' + (verification.ok ? 'PASS' : 'FAIL') + ' — ' + verification.passed + '/' + verification.total + ' checks');
console.log('Stations: ' + repro.ranking.stations.length);
console.log('A1 corridor mean: ' + repro.ranking.summary.descriptive.A1.mean.toFixed(6));
console.log('A3 corridor mean: ' + repro.ranking.summary.descriptive.A3.mean.toFixed(6));

if (!verification.ok) {
  for (const c of verification.checks.filter(x => !x.pass)) console.error('FAIL:', c.name, 'got=', c.got, 'expected=', c.expected);
  process.exitCode = 1;
}
