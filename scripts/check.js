#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'index.html',
  'LICENSE',
  'README.md',
  'CITATION.cff',
  '.zenodo.json',
  'package.json',
  'THIRD_PARTY_NOTICES.md',
  'src/nppe-engine.js',
  'src/nppe-io.js',
  'src/nppe-report.js',
  'src/nppe-recommendations.js',
  'src/nppe-paper.js',
  'src/paper-data.js',
  'server/server.js',
  'fonts/Inter-Regular.ttf',
  'fonts/Inter-Bold.ttf',
  'fonts/JetBrainsMono-Regular.ttf',
  'fonts/OFL.txt'
];

for (const p of required) {
  if (!fs.existsSync(path.join(root, p))) throw new Error('missing required file: ' + p);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const src of [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map(m => m[1])) {
  if (/^(https?:|data:|#)/.test(src)) continue;
  if (!fs.existsSync(path.join(root, src))) throw new Error('missing asset referenced by index.html: ' + src);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '2.1.0') throw new Error('package version mismatch');
if (pkg.license !== 'MIT') throw new Error('package license must be MIT');

const cff = fs.readFileSync(path.join(root, 'CITATION.cff'), 'utf8');
if (!cff.includes('repository-code: "https://github.com/dv848-maker/todsphere-v2.1.0"')) throw new Error('CITATION.cff repository URL mismatch');
if (!cff.includes('license: MIT')) throw new Error('CITATION.cff license missing');

const zenodo = JSON.parse(fs.readFileSync(path.join(root, '.zenodo.json'), 'utf8'));
if (zenodo.version !== '2.1.0' || zenodo.license !== 'MIT') throw new Error('.zenodo.json metadata mismatch');

const forbidden = ['OWNER/todsphere', 'LICENSE NOT YET SELECTED'];
for (const term of forbidden) {
  if (fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes(term)) throw new Error('stale placeholder in README: ' + term);
}

console.log('check OK');
