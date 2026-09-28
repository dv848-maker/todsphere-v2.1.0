'use strict';
// Unit tests: indicator boundaries, normalisation, weights, aggregation, Q screening,
// missing/invalid data, extreme values, determinism and configuration governance.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/nppe-engine.js');
const { generate, offset } = require('./helpers/synthetic-osm.js');

const CFG = E.createConfig();
const LAT = 28.470953, LON = 77.512775; // Alpha 1
const BG = { pm25: 58.0, pm10: 93.1, no2: 10.0 };
const ALL = (v) => ({ T: v, D: v, L: v, W: v, A: v, G: v, Q: v });
const allFinite = (o) => JSON.stringify(o, (k, v) => { if (typeof v === 'number' && !isFinite(v) && v !== 1e9) throw new Error('non-finite ' + k + '=' + v); return v; });

function pointsAt(n, distM, tags, extra) {
  return Array.from({ length: n }, (_, i) => { const p = offset(LAT, LON, distM * Math.cos(i), distM * Math.sin(i)); return Object.assign({ lat: p.lat, lon: p.lon, tags: tags || {} }, extra || {}); });
}
const EMPTY = () => ({ metro: [], bus: [], buildings: [], shops: [], schools: [], colleges: [], healthcare: [], green: [], banks: [], food: [], roads: [], landuse: [] });

test('T: metro distance bands 400/800/1500 m and bus-stop bands', () => {
  const far = { network: [{ line: 'x', stations: [] }] };
  const at = (d) => { const F = EMPTY(); F.metro = pointsAt(1, d); return E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG, network: far.network }, CFG).T; };
  assert.equal(at(100).S_metro, 100);
  { const t6 = at(600); assert.ok(Math.abs(t6.S_metro - (100 - (t6.nearestMetro_m - 400) / 400 * 40)) < 1e-9 && Math.abs(t6.S_metro - 80) < 0.5); }
  { const t11 = at(1150); assert.ok(Math.abs(t11.S_metro - (60 - (t11.nearestMetro_m - 800) / 700 * 40)) < 1e-9 && Math.abs(t11.S_metro - 40) < 0.5); }
  assert.equal(at(2000).S_metro, 15);
  assert.equal(at(100).score, 65); // 0.65*100 + 0.35*0
  const F = EMPTY(); F.metro = pointsAt(1, 100); F.bus = pointsAt(8, 300);
  const t = E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG, network: far.network }, CFG).T;
  assert.equal(t.S_bus, 100); assert.equal(t.score, 100);
  F.bus = pointsAt(1, 150); // one stop within 200 m => 40 + 15
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG, network: far.network }, CFG).T.S_bus, 55);
  // no metro within 5 km => T = S_bus only
  const G = EMPTY(); G.bus = pointsAt(3, 300);
  assert.equal(E.computeIndicators(G, { lat: LAT, lon: LON, radius: 800, background: BG, network: far.network }, CFG).T.score, 60);
});

test('D: 400 footprints/km2 scores 100; 0 buildings scores 0; capped at 100', () => {
  const r = 800, a = E.util.area(r), F = EMPTY();
  F.buildings = pointsAt(Math.round(200 * a), 100);
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: r, background: BG }, CFG).D.score, 50);
  F.buildings = pointsAt(Math.round(400 * a) + 1, 100);
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: r, background: BG }, CFG).D.score, 100);
  F.buildings = pointsAt(5000, 100);
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: r, background: BG }, CFG).D.score, 100);
  assert.equal(E.computeIndicators(EMPTY(), { lat: LAT, lon: LON, radius: r, background: BG }, CFG).D.score, 0);
});

test('L: Shannon entropy over 8 classes normalised by ln 8, x120, capped', () => {
  const F = EMPTY();
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).L.score, 0);
  F.shops = pointsAt(5, 100); // only commercial => H = 0
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).L.score, 0);
  // perfectly even over 8 classes => H/ln8 = 1 => 120 => capped 100
  F.landuse = ['residential', 'industrial', 'retail'].map((lu) => ({ lat: LAT, lon: LON, tags: { landuse: lu } }));
  F.shops = pointsAt(1, 100); F.schools = pointsAt(1, 100); F.healthcare = pointsAt(1, 100); F.green = pointsAt(1, 100); F.food = pointsAt(1, 100);
  const L = E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).L;
  assert.ok(Math.abs(L.H_normalised - 1) < 1e-12); assert.equal(L.score, 100);
  // two equal classes => H = ln2 => 120 ln2/ln8 = 40
  const G = EMPTY(); G.shops = pointsAt(1, 100); G.food = pointsAt(1, 100);
  assert.equal(E.computeIndicators(G, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).L.score, 40);
});

test('W: link-density and pedestrian bands; floor 15*0.6 = 9 with no roads', () => {
  assert.equal(E.computeIndicators(EMPTY(), { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).W.score, 9);
  const F = EMPTY();
  F.roads = pointsAt(30, 100).map((p, i) => ({ tags: { highway: 'footway' }, geometry: [{ lat: p.lat, lon: p.lon }], id: i }));
  const W = E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).W;
  assert.equal(W.S_ped, 100); assert.equal(W.S_link, 15); assert.equal(W.score, 49);
  // roads with empty geometry are ignored, not crashing
  F.roads.push({ tags: { highway: 'primary' }, geometry: [] });
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).W.segmentsWithinR, 30);
});

test('A: Gaussian decay per category, count bonus, weights 0.25/0.20/0.20/0.15/0.20', () => {
  const F = EMPTY();
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).A.score, 0);
  F.healthcare = pointsAt(1, 100); // within d0 => 100 + 5 bonus => capped 100
  let A = E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).A;
  assert.equal(A.categories.health.score, 100); assert.equal(A.score, 25);
  F.healthcare = pointsAt(1, 1000); // Gaussian: 100 exp(-(500)^2 / (2*1000^2)) + 5
  A = E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).A;
  { const dd = A.categories.health.nearest_m; assert.ok(Math.abs(A.categories.health.decay - 100 * Math.exp(-Math.pow(dd - 500, 2) / (2 * 1000 * 1000))) < 1e-9); assert.equal(A.categories.health.countBonus, 5); }
  F.healthcare = pointsAt(1, 1600); // beyond d1 => 0, no count
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).A.categories.health.score, 0);
  const wsum = CFG.amenity.categories.reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(wsum - 1) < 1e-12, 'amenity category weights sum to 1');
});

test('G: WHO 300 m proximity bands and density bands', () => {
  const F = EMPTY();
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).G.score, 0);
  F.green = pointsAt(1, 250); // prox 90, density 1/2.01 = 0.5 => 15 (any)
  const G = E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).G;
  assert.equal(G.S_prox, 90); assert.equal(G.S_den, 15); assert.equal(G.score, 53);
});

test('Q: screening formula, clamping at 0 and 100, ratio at the standards', () => {
  const z = { pm25: 0, pm10: 0, no2: 0 };
  // at the standards: R = 0.40 + 0.35 + 0.25 = 1 => Q = 100 - 80*0.5 = 60
  assert.equal(E.airQualityScore({ pm25: 40, pm10: 60, no2: 40 }, z, CFG).score, 60);
  assert.equal(E.airQualityScore({ pm25: 0, pm10: 0, no2: 0 }, z, CFG).score, 100);
  const hi = E.airQualityScore({ pm25: 500, pm10: 900, no2: 200 }, z, CFG);
  assert.equal(hi.score, 0); assert.ok(hi.saturatedAtZero);
  // totals rounded to 0.1 before the ratio (as in the tool)
  const r = E.airQualityScore({ pm25: 10.04, pm10: 10.04, no2: 10.04 }, z, CFG);
  assert.deepEqual({ ...r.totals }, { pm25: 10, pm10: 10, no2: 10 });
  assert.throws(() => E.airQualityScore({ pm25: NaN, pm10: 1, no2: 1 }, z, CFG), /background.pm25/);
  assert.throws(() => E.airQualityScore({ pm25: 1, pm10: 1, no2: 1 }, { pm25: -1, pm10: 0, no2: 0 }, CFG), /increments.pm25/);
});

test('Q: near-road increment dC = AADT EF/1e6 (50/d)^0.7 (1 + 0.05 rho), major road by vertex distance', () => {
  const F = EMPTY(), p = offset(LAT, LON, 100, 0);
  F.roads = [{ tags: { highway: 'motorway' }, geometry: [{ lat: p.lat, lon: p.lon }] }];
  const q = E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).Q;
  const aadt = 50000 * 1.15, rho = (0.3 * 1.2) / E.util.area(800), d = q.nearRoad.majorRoadDistance_m;
  assert.ok(Math.abs(d - 100) < 0.5);
  const geo = Math.pow(50 / d, 0.7) * (1 + 0.05 * rho);
  assert.ok(Math.abs(q.increments.no2 - aadt * 147.0 / 1e6 * geo) < 1e-9);
  assert.ok(Math.abs(q.increments.pm25 - aadt * 44.2 / 1e6 * geo) < 1e-9);
  // distances below 10 m are floored at 10 m
  F.roads = [{ tags: { highway: 'trunk' }, geometry: [{ lat: LAT, lon: LON }] }];
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).Q.effectiveDistance_m, 10);
  // tertiary and *_link roads are not "major" for the increment
  F.roads = [{ tags: { highway: 'tertiary' }, geometry: [{ lat: p.lat, lon: p.lon }] }, { tags: { highway: 'primary_link' }, geometry: [{ lat: p.lat, lon: p.lon }] }];
  assert.equal(E.computeIndicators(F, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG).Q.nearRoad.majorRoadFound, false);
});

test('aggregation: A1, A2, A3, beta and limiting dimension by hand', () => {
  const s = { T: 65, D: 20, L: 66, W: 63, A: 0, G: 73, Q: 55 }; // Depot
  const r = E.aggregate(s, CFG);
  assert.ok(Math.abs(r.composites.A1 - (18 * 65 + 16 * 20 + 16 * 66 + 16 * 63 + 12 * 0 + 10 * 73 + 12 * 55) / 100) < 1e-12);
  assert.ok(Math.abs(r.dimensions.P - (20 + 66 + 63) / 3) < 1e-12);
  assert.ok(Math.abs(r.dimensions.E - (10 * 73 + 12 * 55) / 22) < 1e-12);
  assert.equal(r.dimensions.Pe, 0); assert.equal(r.dimensions.N, 65);
  const A2 = (65 + r.dimensions.P + 0 + r.dimensions.E) / 4;
  const A3 = Math.pow(65 * r.dimensions.P * 1 * r.dimensions.E, 0.25); // floor of 1 for Pe = 0
  assert.ok(Math.abs(r.composites.A2 - A2) < 1e-12); assert.ok(Math.abs(r.composites.A3 - A3) < 1e-9);
  assert.ok(Math.abs(r.diagnostics.beta - A3 / A2) < 1e-12);
  assert.equal(r.diagnostics.limitingDimension, 'Pe'); assert.deepEqual(r.diagnostics.zeroDimensions, ['Pe']);
  // dimension shares of A1 with default weights: 18/48/12/22 %
  const sh = r.weights.dimensionShareA1;
  assert.deepEqual([sh.N, sh.P, sh.Pe, sh.E].map((v) => Math.round(v * 100)), [18, 48, 12, 22]);
  const nw = Object.values(r.weights.normalised).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(nw - 1) < 1e-12, 'normalised weights sum to 1');
  assert.ok(Math.abs(Object.values(r.contributions).reduce((a, b) => a + b, 0) - r.composites.A1) < 1e-9);
});

test('boundary values never produce NaN/Infinity', () => {
  [0, 1e-12, 1, 50, 99.999, 100].forEach((v) => {
    const r = E.scoreStation({ indicators: ALL(v) }, CFG);
    allFinite({ c: r.composites, d: r.dimensions });
    assert.ok(Math.abs(r.composites.A1 - v) < 1e-9 && Math.abs(r.composites.A2 - v) < 1e-9);
    if (v === 0) { assert.equal(r.diagnostics.beta, null); assert.equal(r.composites.A3, 1); }
    else assert.ok(r.diagnostics.beta > 0);
  });
  // extreme synthetic map (very dense) and an empty map
  [2, 0].forEach((density) => {
    const { A, B } = generate({ seed: 7, lat: LAT, lon: LON, radius: 800, density });
    const r = E.scoreStation({ features: E.classifyElements(A.concat(B)), location: { lat: LAT, lon: LON }, radius: 800, background: BG }, CFG);
    E.METHODOLOGY.indicators.forEach((k) => assert.ok(r.scores[k] >= 0 && r.scores[k] <= 100 && Number.isInteger(r.scores[k]), k));
    allFinite({ c: r.composites, d: r.dimensions });
  });
});

test('missing and invalid data are rejected explicitly (never imputed)', () => {
  assert.throws(() => E.scoreStation({ indicators: { T: 50, D: 50, L: 50, W: 50, A: 50, G: 50 } }, CFG), (e) => e.code === 'MISSING_DATA' && e.details.missing[0] === 'Q');
  assert.throws(() => E.scoreStation({ indicators: { ...ALL(50), A: null } }, CFG), (e) => e.code === 'MISSING_DATA');
  assert.throws(() => E.scoreStation({ indicators: { ...ALL(50), D: 101 } }, CFG), (e) => e.code === 'INVALID_INPUT');
  assert.throws(() => E.scoreStation({ indicators: { ...ALL(50), D: NaN } }, CFG), (e) => e.code === 'INVALID_INPUT');
  assert.throws(() => E.scoreStation({ indicators: { ...ALL(50), D: '50' } }, CFG), (e) => e.code === 'INVALID_INPUT');
  assert.throws(() => E.scoreStation({}, CFG), (e) => e.code === 'INVALID_INPUT');
  assert.throws(() => E.computeIndicators(EMPTY(), { lat: LAT, lon: LON, radius: 800 }, CFG), (e) => e.code === 'MISSING_DATA');
  assert.throws(() => E.computeIndicators(null, { lat: LAT, lon: LON, radius: 800, background: BG }, CFG), (e) => e.code === 'MISSING_DATA');
  assert.throws(() => E.computeIndicators(EMPTY(), { lat: 95, lon: LON, radius: 800, background: BG }, CFG), (e) => e.code === 'INVALID_INPUT');
});

test('configuration governance: paper default vs user-adjusted vs experimental', () => {
  assert.throws(() => { CFG.weights.T = 99; }, TypeError, 'paper config is frozen');
  assert.throws(() => { E.PAPER_CONFIG.weights.T = 99; }, TypeError);
  const u = E.createConfig({ weights: { Q: 20 } });
  assert.equal(u.mode, 'user-adjusted');
  assert.deepEqual(u.deviations, [{ path: 'weights.Q', paper: 12, value: 20 }]);
  assert.notEqual(u.hash, CFG.hash);
  assert.equal(E.createConfig({ weights: { Q: 12 } }).hash, CFG.hash, 'hash depends only on values');
  assert.equal(E.createConfig({ experimental: { enrichmentInScoring: true } }).mode, 'experimental');
  assert.equal(E.createConfig(E.PRESETS['legacy-build-ef'].overrides).deviations[0].path, 'air.emissionFactors.no2');
  assert.throws(() => E.createConfig({ weights: { T: -1 } }), (e) => e.code === 'INVALID_CONFIG');
  assert.throws(() => E.createConfig({ weights: { G: 0, Q: 0 } }), /dimension E/);
  assert.throws(() => E.createConfig({ weights: { X: 3 } }), /not an NPPE indicator/);
  assert.throws(() => E.createConfig({ catchment: { radius: 20 } }), /radius/);
  assert.throws(() => E.createConfig({ air: { emissionFactors: { no2: -3 } } }), /emissionFactors.no2/);
  // weights are relative: scaling all weights leaves A1 unchanged
  const x = { T: 65, D: 100, L: 78, W: 85, A: 62, G: 100, Q: 49 };
  const scaled = E.createConfig({ weights: { T: 36, D: 32, L: 32, W: 32, A: 24, G: 20, Q: 24 } });
  assert.ok(Math.abs(E.aggregate(x, scaled).composites.A1 - E.aggregate(x, CFG).composites.A1) < 1e-12);
});

test('determinism: identical inputs give identical results; ranking is order-invariant', () => {
  const { A, B } = generate({ seed: 11, lat: LAT, lon: LON, radius: 800 });
  const F = E.classifyElements(A.concat(B));
  const r1 = E.scoreStation({ features: F, location: { lat: LAT, lon: LON }, background: BG }, CFG, { timestamp: 'x' });
  const r2 = E.scoreStation({ features: F, location: { lat: LAT, lon: LON }, background: BG }, CFG, { timestamp: 'x' });
  assert.deepEqual(r1, r2);
  const st = [{ name: 'a', indicators: ALL(40) }, { name: 'b', indicators: ALL(70) }, { name: 'c', indicators: ALL(40) }, { name: 'd', indicators: { ...ALL(60), A: 0 } }];
  const k1 = E.rankStations(st, CFG), k2 = E.rankStations(st.slice().reverse(), CFG);
  const byName = (k) => Object.fromEntries(k.stations.map((s) => [s.result.station.name, s.ranks]));
  assert.deepEqual(byName(k1), byName(k2));
  assert.equal(byName(k1).a.A1, 3.5, 'ties receive average ranks');
  const m1 = E.robustness(st, CFG, { nsim: 500, seed: 5 }), m2 = E.robustness(st, CFG, { nsim: 500, seed: 5 });
  assert.deepEqual(m1.montecarlo, m2.montecarlo, 'seeded Monte Carlo is reproducible');
  const s1 = E.stationWeightSensitivity(r1, CFG, { nsim: 1000, seed: 3 }), s2 = E.stationWeightSensitivity(r1, CFG, { nsim: 1000, seed: 3 });
  assert.deepEqual(s1, s2);
  assert.ok(s1.A1.min <= r1.composites.A1 + 1e-9 || s1.A1.max >= r1.composites.A1 - 1e-9);
});

test('Overpass queries: paper tag filters, extents and output limits; split union equals combined', () => {
  const q = E.buildOverpassQueries(LAT, LON, 800, CFG);
  assert.match(q.A, /^\[out:json\]\[timeout:30\];\(/);
  assert.match(q.A, /out center qt 5000;$/); assert.match(q.B, /out geom qt 2000;$/);
  assert.equal(q.searchHalfSide, 1500);
  const partsBody = q.Asplit.map((s) => s.replace(/^\[out:json\]\[timeout:30\];\(/, '').replace(/\);out center qt 5000;$/, '')).join('');
  const whole = q.A.replace(/^\[out:json\]\[timeout:30\];\(/, '').replace(/\);out center qt 5000;$/, '');
  const stmts = (s) => s.split(';').filter(Boolean).sort();
  assert.deepEqual(stmts(partsBody), stmts(whole));
  const m = E.mergeElements([[{ type: 'way', id: 1 }, { type: 'node', id: 1 }], [{ type: 'way', id: 1 }, { type: 'way', id: 2 }]]);
  assert.deepEqual(m.map((e) => e.type + e.id), ['way1', 'node1', 'way2']);
});

test('display formatter: correct rounding with ties-to-even (matches the manuscript tables)', () => {
  assert.equal(E.format.score1(57.25), '57.2'); assert.equal(E.format.score1(57.35), '57.4'); // 57.35 is 57.35000000000000142...
  assert.equal(E.format.score1(0.15), '0.1'); // 0.1499999...
  assert.equal(E.format.int(27.5), '28'); assert.equal(E.format.int(28.5), '28');
  assert.equal(E.format.ratio2(0.985), '0.98'); // 0.98499999...
  assert.equal(E.format.score1(-0.04), '0.0'); assert.equal(E.format.score1(NaN), '–');
  assert.equal(E.format.dist(1e9), 'n/a'); assert.equal(E.format.rank(14.5), '14.5');
  assert.equal(E.gradeBand(80), 'Excellent'); assert.equal(E.gradeBand(79.99), 'Good'); assert.equal(E.gradeBand(null), 'n/a');
});

test('statistics helpers: ranks, Spearman, Kendall W with ties and chi-square p-value', () => {
  assert.deepEqual(E.stats.rankDesc([10, 20, 20, 5]), [3, 1.5, 1.5, 4]);
  assert.equal(E.stats.spearman([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(E.stats.spearman([1, 1, 1], [1, 2, 3]), null, 'constant input gives null, not NaN');
  const kw = E.stats.kendallW([[1, 2, 3], [1, 2, 3], [1, 2, 3]]);
  assert.ok(Math.abs(kw.W - 1) < 1e-12);
  assert.ok(Math.abs(E.stats.chi2Survival(3.841458820694124, 1) - 0.05) < 1e-9);
  assert.ok(Math.abs(E.stats.chi2Survival(18.307038053275146, 10) - 0.05) < 1e-9);
  assert.equal(E.stats.percentile([1, 2, 3, 4], 50), 2.5);
});

test('perception module: Likert mapping, aggregation without imputation, comparison', () => {
  assert.equal(E.perception.likertToScore(1), 0); assert.equal(E.perception.likertToScore(5), 100); assert.equal(E.perception.likertToScore('3'), 50);
  assert.equal(E.perception.likertToScore(0), null); assert.equal(E.perception.likertToScore(6), null); assert.equal(E.perception.likertToScore('x'), null);
  const agg = E.perception.aggregateResponses([{ T: 5, D: 3 }, { T: 4, D: 'bad' }, { T: 3 }], ['T', 'D']);
  assert.equal(agg.T.n, 3); assert.equal(agg.T.mean, 75);
  assert.equal(agg.D.n, 1); assert.equal(agg.D.invalid, 1); assert.equal(agg.D.missing, 1);
  const act = E.scoreStation({ indicators: { T: 65, D: 100, L: 78, W: 85, A: 62, G: 100, Q: 49 } }, CFG);
  const cmp = E.perception.compare(act, ALL(50), CFG);
  assert.equal(cmp.indicators.D.gap, -50); assert.equal(cmp.indicators.D.consonant, false);
  assert.equal(cmp.indicators.T.consonant, true);
  assert.match(cmp.note, /not external validation/);
  assert.throws(() => E.perception.compare(act, { T: 50 }, CFG), (e) => e.code === 'MISSING_DATA');
  assert.equal(E.perception.fuse(0.5, 60, 40), 50);
  assert.throws(() => E.perception.fuse(1.5, 60, 40));
  const ah = E.perception.alphaHeuristics(act.scores, ALL(50));
  assert.ok(ah.range[0] >= 0 && ah.range[1] <= 1); assert.match(ah.note, /not a statistical confidence interval/);
});
