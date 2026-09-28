'use strict';
// HTTP API tests: schemas, validation, error handling, determinism, and identity with the engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const NPPE = require('../src/nppe-engine.js');
const IO = require('../src/nppe-io.js');
const DATA = require('../src/paper-data.js');
const PAPER = require('../src/nppe-paper.js');
const { createServer } = require('../server/server.js');
const { generate } = require('./helpers/synthetic-osm.js');

let server, base;
test.before(() => new Promise((resolve) => { server = createServer().listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + server.address().port; resolve(); }); }));
test.after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, p, body, headers) {
  const res = await fetch(base + p, { method, headers: Object.assign(body !== undefined ? { 'Content-Type': 'application/json' } : {}, headers || {}), body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}
const PAPER_INPUTS = PAPER.stationInputs(DATA, NPPE.createConfig(), 800);
const ALPHA = PAPER_INPUTS.find((s) => s.name === 'Alpha 1');

test('health and methodology report version and configuration', async () => {
  const h = await call('GET', '/api/v1/health');
  assert.equal(h.status, 200); assert.equal(h.json.status, 'ok');
  assert.equal(h.json.software.version, NPPE.SOFTWARE.version);
  assert.equal(h.headers.get('x-nppe-methodology'), 'NPPE-7/1.0.0');
  const m = await call('GET', '/api/v1/methodology');
  assert.deepEqual(m.json.paperConfig.weights, { T: 18, D: 16, L: 16, W: 16, A: 12, G: 10, Q: 12 });
  assert.equal(m.json.indicatorDefinitions.length, 7);
  assert.ok(m.json.presets['legacy-build-ef']);
});

test('POST /score with indicators equals the engine (paper station Alpha 1)', async () => {
  const r = await call('POST', '/api/v1/score', { indicators: ALPHA.indicators, station: { name: 'Alpha 1' }, timestamp: 'T0' });
  assert.equal(r.status, 200);
  const e = NPPE.scoreStation({ indicators: ALPHA.indicators, station: { name: 'Alpha 1' } }, NPPE.createConfig(), { timestamp: 'T0' });
  assert.deepEqual(r.json, JSON.parse(JSON.stringify(e)));
  assert.equal(NPPE.format.score1(r.json.composites.A1), '79.7'); assert.equal(NPPE.format.score1(r.json.composites.A3), '80.6');
  assert.equal(r.json.config.mode, 'paper-default');
});

test('POST /score from raw Overpass elements equals engine; deterministic', async () => {
  const { A, B } = generate({ seed: 3, lat: 28.5, lon: 77.4, radius: 800 });
  const body = { elements: A.concat(B), location: { lat: 28.5, lon: 77.4 }, radius: 800, background: { pm25: 58, pm10: 93.1, no2: 10 }, timestamp: 'T0' };
  const r1 = await call('POST', '/api/v1/score', body), r2 = await call('POST', '/api/v1/score', body);
  assert.equal(r1.status, 200); assert.equal(r1.text, r2.text, 'identical responses for identical requests');
  const e = NPPE.scoreStation({ features: NPPE.classifyElements(A.concat(B)), location: { lat: 28.5, lon: 77.4 }, radius: 800, background: body.background, provenance: { source: 'api', osmBase: null, aqSource: 'supplied by API client' } }, NPPE.createConfig(), { timestamp: 'T0' });
  assert.deepEqual(r1.json.composites, e.composites); assert.deepEqual(r1.json.scores, e.scores);
});

test('POST /score?format=csv returns the same CSV as the browser export', async () => {
  const r = await call('POST', '/api/v1/score?format=csv', { indicators: ALPHA.indicators, station: { name: 'Alpha 1' }, timestamp: 'T0' });
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/csv/);
  const e = NPPE.scoreStation({ indicators: ALPHA.indicators, station: { name: 'Alpha 1' } }, NPPE.createConfig(), { timestamp: 'T0' });
  assert.equal(r.text, IO.resultToCSV(e));
});

test('validation: missing data, invalid values, bad JSON, wrong media type, unknown routes', async () => {
  let r = await call('POST', '/api/v1/score', { indicators: { T: 1, D: 2, L: 3, W: 4, A: 5, G: 6 } });
  assert.equal(r.status, 422); assert.equal(r.json.error.code, 'MISSING_DATA'); assert.deepEqual(r.json.error.details.missing, ['Q']);
  r = await call('POST', '/api/v1/score', { indicators: { T: 1, D: 2, L: 3, W: 4, A: 5, G: 6, Q: 101 } });
  assert.equal(r.status, 422); assert.equal(r.json.error.code, 'INVALID_INPUT');
  r = await call('POST', '/api/v1/score', '{not json', {}); assert.equal(r.status, 400); assert.equal(r.json.error.code, 'INVALID_JSON');
  r = await call('POST', '/api/v1/score', 'x', { 'Content-Type': 'text/plain' }); assert.equal(r.status, 415);
  r = await call('POST', '/api/v1/score', {}); assert.equal(r.status, 422);
  r = await call('POST', '/api/v1/score', { elements: [], location: { lat: 28.5, lon: 77.4 } }); assert.equal(r.status, 422); assert.equal(r.json.error.code, 'MISSING_DATA');
  r = await call('POST', '/api/v1/score', { indicators: ALPHA.indicators, config: { weights: { T: -1 } } }); assert.equal(r.status, 422); assert.equal(r.json.error.code, 'INVALID_CONFIG');
  r = await call('POST', '/api/v1/score', { indicators: ALPHA.indicators, config: { foo: 1 } }); assert.equal(r.status, 422);
  r = await call('POST', '/api/v1/score', { indicators: ALPHA.indicators, config: 'nope' }); assert.equal(r.status, 422); assert.equal(r.json.error.code, 'UNKNOWN_PRESET');
  r = await call('GET', '/api/v1/score'); assert.equal(r.status, 405);
  r = await call('GET', '/api/v1/unknown'); assert.equal(r.status, 404); assert.ok(r.json.error.details.endpoints.length > 5);
  r = await call('POST', '/api/v1/score', 'x'.repeat(17 << 20)); assert.equal(r.status, 413);
});

test('configuration presets and user adjustments are reported', async () => {
  const r = await call('POST', '/api/v1/score', { indicators: ALPHA.indicators, config: 'legacy-build-ef' });
  assert.equal(r.json.config.mode, 'user-adjusted'); assert.equal(r.json.config.emissionFactors.no2, 92.9);
  const v = await call('POST', '/api/v1/config/validate', { config: { weights: { Q: 20 } } });
  assert.equal(v.json.config.mode, 'user-adjusted'); assert.deepEqual(v.json.config.deviations, [{ path: 'weights.Q', paper: 12, value: 20 }]);
});

test('POST /air-quality reproduces Q for Pari Chowk (27) from background and increments', async () => {
  const row = DATA.rows.find((x) => x.station === 'Pari Chowk' && x.radius === 800);
  const inc = PAPER.increments(row, DATA, NPPE.createConfig());
  const r = await call('POST', '/api/v1/air-quality', { background: DATA.live['Pari Chowk'], increments: inc });
  assert.equal(r.status, 200); assert.equal(r.json.Q, 27);
  const r2 = await call('POST', '/api/v1/air-quality', { background: { pm25: 40, pm10: 60, no2: 40 }, nearRoad: { distance: 1e6, roadClass: 'motorway' } });
  assert.equal(r2.json.Q, 60);
  const r3 = await call('POST', '/api/v1/air-quality', { background: { pm25: 40, pm10: 60, no2: 40 } }); assert.equal(r3.status, 422);
});

test('POST /rank equals the engine and the manuscript Table 3 ranks', async () => {
  const stations = PAPER_INPUTS.map((s) => ({ name: s.name, lat: s.lat, lon: s.lon, indicators: s.indicators }));
  const r = await call('POST', '/api/v1/rank', { stations, timestamp: 'T0' });
  assert.equal(r.status, 200);
  const byName = Object.fromEntries(r.json.stations.map((s) => [s.result.station.name, s]));
  DATA.expected.stations.forEach((e) => { assert.equal(byName[e.station].ranks.A3, e.r_A3); assert.equal(byName[e.station].ranks.A1, e.r_A1); assert.equal(byName[e.station].type, e.type); });
  const csv = await call('POST', '/api/v1/rank?format=csv', { stations, timestamp: 'T0' });
  assert.equal(csv.text, IO.rankingToCSV(NPPE.rankStations(stations, NPPE.createConfig(), { timestamp: 'T0' })));
  const bad = await call('POST', '/api/v1/rank', { stations: [] }); assert.equal(bad.status, 422);
});

test('POST /robustness and GET /paper/reproduce reproduce Table 4 and verify the manuscript values', async () => {
  const stations = PAPER_INPUTS.map((s) => ({ name: s.name, indicators: s.indicators }));
  const r = await call('POST', '/api/v1/robustness', { stations, options: { nsim: 500, seed: 1 } });
  assert.equal(r.status, 200); assert.equal(NPPE.format.fixed(r.json.weights.kendall.W, 3), '0.962'); assert.equal(NPPE.format.fixed(r.json.mcdm.kendall.W, 3), '0.967');
  const tooMany = await call('POST', '/api/v1/robustness', { stations, options: { nsim: 1e9 } }); assert.equal(tooMany.status, 422);
  const two = await call('POST', '/api/v1/robustness', { stations: stations.slice(0, 2) }); assert.equal(two.status, 422);
  const p = await call('GET', '/api/v1/paper/reproduce?nsim=1000');
  assert.equal(p.status, 200); assert.equal(p.json.verification.ok, true); assert.equal(p.json.verification.passed, p.json.verification.total);
});

test('static server: serves the app and blocks path traversal and private files', async () => {
  const i = await call('GET', '/'); assert.equal(i.status, 200); assert.match(i.headers.get('content-type'), /text\/html/);
  const e = await call('GET', '/src/nppe-engine.js'); assert.equal(e.status, 200);
  for (const p of ['/.git/config', '/../package.json', '/src/../server/server.js', '/%2e%2e/%2e%2e/windows/win.ini', '/server/server.js', '/package.json']) {
    const r = await call('GET', p); assert.equal(r.status, 404, p);
  }
  const post = await call('POST', '/index.html', {}); assert.equal(post.status, 405);
});
