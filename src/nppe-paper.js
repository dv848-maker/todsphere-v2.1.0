/*!
 * TODSphere — manuscript reproduction workflow. Turns the manuscript's station dataset
 * (src/paper-data.js, generated from data/paper/analysis) into Table 3 and the four families of
 * robustness tests (Table 4) using ONLY the authoritative engine (src/nppe-engine.js).
 * Shared by the browser app, the CLI (scripts/reproduce-paper.js), the HTTP API and the tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nppe-engine.js'));
  else root.TODSpherePaper = factory(root.TODSphereNPPE);
}(typeof self !== 'undefined' ? self : this, function (NPPE) {
  'use strict';
  var PM25_BUILD = 44.2, PM10_BUILD = 118.1;

  /** Near-road increments rescaled to the configured emission factors (increments are linear in EF). */
  function increments(row, dataset, cfg) {
    var ef = cfg.air.emissionFactors;
    return { pm25: row.tPM25 * ef.pm25 / PM25_BUILD, pm10: row.tPM10 * ef.pm10 / PM10_BUILD, no2: row.tNO2 * ef.no2 / dataset.efNO2Build };
  }

  function rowsAt(dataset, radius) {
    return dataset.rows.filter(function (r) { return r.radius === radius; });
  }

  /** Station inputs (indicator scores incl. Q from the live CAMS background) at one radius. */
  function stationInputs(dataset, config, radius) {
    var cfg = (config && config.hash && config.mode) ? config : NPPE.createConfig(config);
    radius = radius || 800;
    return rowsAt(dataset, radius).map(function (r) {
      var q = NPPE.airQualityScore(dataset.live[r.station], increments(r, dataset, cfg), cfg);
      return {
        id: r.station, name: r.station, lat: r.lat, lon: r.lon,
        indicators: { T: r.T, D: r.D, L: r.L, W: r.W, A: r.A, G: r.G, Q: q.score },
        airQuality: { background: dataset.live[r.station], increments: increments(r, dataset, cfg), totals: q.totals, ratio: q.ratio },
        source: { osmBase: r.osm_base, server: r.server, radius: r.radius }
      };
    });
  }

  function segmentOf(dataset, name) {
    var s = dataset.segments || {};
    for (var k in s) if (s[k].indexOf(name) >= 0) return k;
    return null;
  }

  /** Full reproduction: ranking (Table 3), robustness (Table 4 i–ii), radius (iii), season (iv). */
  function reproduce(dataset, config, options) {
    options = options || {};
    var cfg = (config && config.hash && config.mode) ? config : NPPE.createConfig(config);
    var inputs = stationInputs(dataset, cfg, 800);
    var ranking = NPPE.rankStations(inputs, cfg, { typologyK: options.typologyK || 4, timestamp: options.timestamp });
    var robust = options.robustness === false ? null : NPPE.robustness(inputs, cfg, { nsim: options.nsim || 10000, seed: options.seed === undefined ? 20260922 : options.seed, montecarlo: options.montecarlo !== false });
    var radiusRows = [];
    dataset.rows.forEach(function (r) {
      var q = NPPE.airQualityScore(dataset.live[r.station], increments(r, dataset, cfg), cfg).score;
      radiusRows.push({ station: r.station, radius: r.radius, T: r.T, D: r.D, L: r.L, W: r.W, A: r.A, G: r.G, Q: q });
    });
    var radius = NPPE.radiusSensitivity(radiusRows, cfg);
    var liveByCell = {}, st = rowsAt(dataset, 800).map(function (r) {
      var cell = dataset.cellOf[r.station]; liveByCell[cell] = dataset.live[r.station];
      return { station: r.station, cell: cell, scores: { T: r.T, D: r.D, L: r.L, W: r.W, A: r.A, G: r.G }, increments: increments(r, dataset, cfg) };
    });
    var byMonth = {};
    Object.keys(dataset.monthly).forEach(function (cell) {
      Object.keys(dataset.monthly[cell].months).forEach(function (m) { (byMonth[m] = byMonth[m] || {})[cell] = dataset.monthly[cell].months[m]; });
    });
    var seasonal = NPPE.seasonalSensitivity(st, liveByCell, byMonth, cfg);
    var annualQ = st.map(function (s) { return NPPE.airQualityScore(dataset.monthly[s.cell].annual, s.increments, cfg).score; });
    return { schema: 'todsphere.nppe.paper-reproduction/1', dataset: { title: dataset.title, osmRetrieval: dataset.osmRetrieval, airQuality: dataset.airQuality, emissionFactorNote: dataset.emissionFactorNote },
      config: ranking.config, inputs: inputs, ranking: ranking, robustness: robust, radius: radius, seasonal: seasonal,
      annualQ: { mean: NPPE.stats.mean(annualQ), min: Math.min.apply(null, annualQ), max: Math.max.apply(null, annualQ) },
      segments: dataset.segments, typeNames: dataset.typeNames };
  }

  /** Compare a reproduction (paper-default config) with the values stored from the manuscript. */
  function verify(dataset, repro) {
    var exp = dataset.expected, checks = [], ok = true;
    function add(name, got, want, tol) { var pass = (typeof want === 'string') ? got === want : Math.abs(got - want) <= (tol || 1e-9); if (!pass) ok = false; checks.push({ name: name, got: got, expected: want, pass: pass }); }
    var byName = {}; repro.ranking.stations.forEach(function (s) { byName[s.result.station.name] = s; });
    var dn = { N: 'Node', P: 'Place', Pe: 'People', E: 'Ecology' };
    exp.stations.forEach(function (e) {
      var s = byName[e.station]; if (!s) { ok = false; checks.push({ name: e.station, pass: false, got: 'missing', expected: 'present' }); return; }
      add(e.station + ' Q', s.result.scores.Q, e.Q, 0);
      add(e.station + ' A1', s.result.composites.A1, e.A1); add(e.station + ' A2', s.result.composites.A2, e.A2); add(e.station + ' A3', s.result.composites.A3, e.A3);
      add(e.station + ' beta', s.result.diagnostics.beta, e.beta, 1e-12);
      add(e.station + ' limiting', dn[s.result.diagnostics.limitingDimension], e.limiting);
      add(e.station + ' rank A1', s.ranks.A1, e.r_A1, 0); add(e.station + ' rank A3', s.ranks.A3, e.r_A3, 0); add(e.station + ' rank NP', s.ranks.NP, e.r_NP, 0);
      add(e.station + ' type', s.type, e.type, 0);
    });
    if (repro.robustness) {
      add('Kendall W (weights)', repro.robustness.weights.kendall.W, exp.weightsKendallW, 1e-12);
      add('Kendall W (MCDM)', repro.robustness.mcdm.kendall.W, exp.mcdmKendallW, 1e-12);
    }
    add('A1 corridor mean', repro.ranking.summary.descriptive.A1.mean, exp.A1mean);
    add('A3 corridor mean', repro.ranking.summary.descriptive.A3.mean, exp.A3mean);
    return { ok: ok, passed: checks.filter(function (c) { return c.pass; }).length, total: checks.length, checks: checks };
  }

  return { reproduce: reproduce, verify: verify, stationInputs: stationInputs, increments: increments, segmentOf: segmentOf };
}));
