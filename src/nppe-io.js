/*!
 * TODSphere — export/serialisation builders. Pure functions over the engine's canonical result
 * objects, shared by the browser downloads (CSV, JSON, XLSX, GeoJSON), the PDF reports and the
 * HTTP API, so every output shows the same numbers. No DOM access.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nppe-engine.js'));
  else root.TODSphereIO = factory(root.TODSphereNPPE);
}(typeof self !== 'undefined' ? self : this, function (NPPE) {
  'use strict';
  var IND = NPPE.METHODOLOGY.indicators, DIM = NPPE.METHODOLOGY.dimensions, F = NPPE.format;

  function num(v, dp) { return (typeof v === 'number' && isFinite(v)) ? (dp === undefined ? v : Number(v.toFixed(dp))) : (v === undefined ? null : v); }

  // -------------------------------------------------------------------------
  // CSV (RFC 4180; spreadsheet formula-injection protection for text cells)
  // -------------------------------------------------------------------------
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false, i = 0, s = String(text).replace(/^﻿/, '');
    for (; i < s.length; i++) {
      var ch = s[i];
      if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r[0] || '').trim() !== ''; });
  }

  // -------------------------------------------------------------------------
  // Station result
  // -------------------------------------------------------------------------
  function fileStem(result, kind) {
    var st = result.station || {}, name = (st.name || (st.lat != null ? st.lat.toFixed(4) + '_' + st.lon.toFixed(4) : 'station')).replace(/[^A-Za-z0-9_.-]+/g, '_');
    var date = (result.provenance && result.provenance.computedAt || new Date().toISOString()).slice(0, 10);
    return 'TODSphere_' + (kind || 'NPPE') + '_' + name + '_' + date;
  }

  function reproducibility(result) {
    var c = result.config, p = result.provenance || {};
    return [
      ['Software', result.software.name + ' ' + result.software.version + ' (' + result.software.engine + ' ' + result.software.engineVersion + ')'],
      ['Methodology', result.methodology.id + ' v' + result.methodology.version + ' — ' + result.methodology.name],
      ['Configuration', c.label + ' [' + c.mode + ']'],
      ['Configuration hash', c.hash],
      ['Deviations from paper default', c.deviations.length ? c.deviations.map(function (d) { return d.path + ': ' + JSON.stringify(d.paper) + ' → ' + JSON.stringify(d.value); }).join('; ') : 'none'],
      ['Indicator weights (T,D,L,W,A,G,Q)', IND.map(function (k) { return c.weights[k]; }).join(', ')],
      ['Dimension weights for A2/A3 (N,P,Pe,E)', DIM.map(function (d) { return c.dimensionWeights[d]; }).join(', ')],
      ['Catchment radius (m)', c.radius],
      ['Search square half-side (m)', c.searchHalfSide],
      ['Emission factors PM2.5/PM10/NO2 (mg/veh/km)', [c.emissionFactors.pm25, c.emissionFactors.pm10, c.emissionFactors.no2].join(' / ')],
      ['Input mode', result.inputMode],
      ['Computed at (UTC)', p.computedAt || ''],
      ['OSM database timestamp', p.osmBase || 'n/a'],
      ['Overpass server(s)', p.overpassServers ? p.overpassServers.join(', ') : (p.overpassServer || 'n/a')],
      ['Overpass query mode', p.queryMode || 'n/a'],
      ['Background air quality source', p.aqSource || 'n/a'],
      ['Background air quality time', p.aqTime || 'n/a'],
      ['Background air quality status', p.aqStatus || 'n/a']
    ];
  }

  function indicatorRows(result) {
    return IND.map(function (k) {
      var meta = NPPE.INDICATORS[k], s = result.scores[k];
      return { code: k, name: meta.name, dimension: meta.dimension, dimensionName: NPPE.DIMENSIONS[meta.dimension].name,
        score: s, weight: result.weights.indicator[k], normalisedWeight: result.weights.normalised[k], contribution: result.contributions[k] };
    });
  }

  function indicatorDetail(result, k) {
    var i = result.indicators[k] || {};
    switch (k) {
      case 'T': return i.S_metro === undefined ? '' : 'S_metro ' + F.score1(i.S_metro) + ', S_bus ' + F.int(i.S_bus) + ' (' + i.busStopsWithinR + ' stop(s) within r; nearest stop ' + F.dist(i.nearestBus_m) + '); nearest metro/rail ' + F.dist(i.nearestMetro_m);
      case 'D': return i.buildings === undefined ? '' : i.buildings + ' footprints / ' + F.fixed(i.area_km2, 3) + ' km² = ' + F.int(i.density_per_km2) + ' per km² (target 400)';
      case 'L': return i.H === undefined ? '' : 'H = ' + F.fixed(i.H, 3) + ', H/ln8 = ' + F.fixed(i.H_normalised, 3) + '; ' + i.activeClasses + '/8 classes present (' + i.total + ' features)';
      case 'W': return i.S_link === undefined ? '' : i.segmentsWithinR + ' segments within r (' + F.int(i.segments_per_km2) + '/km²) → S_link ' + i.S_link + '; ' + i.pedestrianSegments + ' pedestrian segments → S_ped ' + i.S_ped;
      case 'A': return !i.categories ? '' : Object.keys(i.categories).map(function (c) { var x = i.categories[c]; return x.label + ' ' + F.int(x.score) + (x.nearest_m != null ? ' (' + F.dist(x.nearest_m) + ')' : ' (none)'); }).join('; ');
      case 'G': return i.S_prox === undefined ? '' : 'nearest green ' + F.dist(i.nearestGreen_m) + ' → S_prox ' + i.S_prox + '; ' + i.greenFeatures + ' features → S_den ' + i.S_den;
      case 'Q': return !i.totals ? '' : 'C = B + ΔC: PM2.5 ' + F.conc(i.totals.pm25) + ', NO2 ' + F.conc(i.totals.no2) + ', PM10 ' + F.conc(i.totals.pm10) + ' µg/m³; R = ' + F.fixed(i.ratio, 3);
      default: return '';
    }
  }

  function resultToCSV(result, extras) {
    var rows = [['section', 'code', 'name', 'dimension', 'value', 'weight', 'normalised_weight', 'contribution_to_A1', 'notes']];
    indicatorRows(result).forEach(function (r) {
      rows.push(['indicator', r.code, r.name, r.dimension, r.score, r.weight, num(r.normalisedWeight, 6), num(r.contribution, 6), indicatorDetail(result, r.code)]);
    });
    DIM.forEach(function (d) { rows.push(['dimension', d, NPPE.DIMENSIONS[d].name, d, num(result.dimensions[d], 6), result.config.dimensionWeights[d], '', '', 'weighted mean of ' + NPPE.DIMENSIONS[d].indicators.join(', ')]); });
    rows.push(['composite', 'A1', 'Weighted arithmetic mean of indicators (TODSphere composite)', '', num(result.composites.A1, 6), '', '', '', 'displayed ' + F.score1(result.composites.A1)]);
    rows.push(['composite', 'A2', 'Arithmetic mean of dimensions', '', num(result.composites.A2, 6), '', '', '', 'displayed ' + F.score1(result.composites.A2)]);
    rows.push(['composite', 'A3', 'Geometric mean of dimensions (floor 1)', '', num(result.composites.A3, 6), '', '', '', 'displayed ' + F.score1(result.composites.A3)]);
    var dg = result.diagnostics;
    rows.push(['diagnostic', 'beta', 'Balance ratio A3/A2', '', num(dg.beta, 6), '', '', '', 'displayed ' + F.ratio2(dg.beta)]);
    rows.push(['diagnostic', 'limiting', 'Limiting dimension', '', dg.limitingDimension, '', '', '', dg.limitingDimensionName]);
    rows.push(['diagnostic', 'NP', 'Node–place index (N+P)/2', '', num(dg.nodePlaceIndex, 6), '', '', '', '']);
    rows.push(['diagnostic', 'N-P', 'Node–place gap', '', num(dg.nodePlaceGap, 6), '', '', '', dg.nodePlaceClass]);
    var q = result.indicators.Q;
    if (q && q.background) {
      ['pm25', 'pm10', 'no2'].forEach(function (p) {
        rows.push(['air_quality', p, 'Background (CAMS) / near-road increment / total', 'E', num(q.totals[p], 1), '', '', '', 'B=' + num(q.background[p], 2) + '; dC=' + num(q.increments[p], 4) + ' µg/m3']);
      });
      rows.push(['air_quality', 'R', 'Standards-weighted ratio', 'E', num(q.ratio, 6), '', '', '', 'Q = clamp(100 - 80 (R - 0.5))']);
      rows.push(['air_quality', 'd_major', 'Distance to nearest major road (m)', 'E', q.nearRoad.majorRoadFound ? num(q.nearRoad.majorRoadDistance_m, 1) : '', '', '', '', q.nearRoad.majorRoadClass + '; AADT ' + num(q.nearRoad.aadt, 0)]);
    }
    if (extras && extras.perception) {
      var pc = extras.perception;
      IND.forEach(function (k) { var r = pc.indicators[k]; rows.push(['perceived', k, NPPE.INDICATORS[k].name, NPPE.INDICATORS[k].dimension, num(r.perceived, 4), '', '', '', 'calculated ' + r.actual + '; gap ' + num(r.gap, 4) + '; ' + r.direction]); });
      rows.push(['perceived', 'A1', 'Perceived A1', '', num(pc.composites.perceived.A1, 6), '', '', '', 'gap vs calculated ' + num(pc.composites.gapA1, 4)]);
    }
    if (extras && extras.supplementary) {
      Object.keys(extras.supplementary).forEach(function (k) {
        var s = extras.supplementary[k];
        rows.push(['supplementary_not_in_NPPE', k, s.label, '', s.score, '', '', '', 'Not part of the NPPE composite (legacy TODSphere measure)']);
      });
    }
    reproducibility(result).forEach(function (kv) { rows.push(['metadata', '', kv[0], '', kv[1], '', '', '', '']); });
    (result.dataQuality.warnings || []).forEach(function (w) { rows.push(['warning', '', w, '', '', '', '', '', '']); });
    return toCSV(rows);
  }

  function resultToJSON(result, extras) {
    var out = NPPE.util.clone(result);
    out.export = { format: 'todsphere.nppe.export/1', exportedAt: new Date().toISOString() };
    if (extras) Object.keys(extras).forEach(function (k) { if (extras[k] !== undefined && extras[k] !== null) out[k] = NPPE.util.clone(extras[k]); });
    return JSON.stringify(out, null, 2);
  }

  function resultToXLSXSheets(result, extras) {
    var sheets = {};
    var ind = [['Code', 'Indicator', 'Dimension', 'Score (0–100)', 'Weight', 'Normalised weight', 'Contribution to A1', 'Intermediate quantities']];
    indicatorRows(result).forEach(function (r) { ind.push([r.code, r.name, r.dimensionName, r.score, r.weight, num(r.normalisedWeight, 6), num(r.contribution, 6), indicatorDetail(result, r.code)]); });
    sheets.Indicators = ind;
    var dc = [['Measure', 'Value', 'Displayed', 'Definition']];
    DIM.forEach(function (d) { dc.push([NPPE.DIMENSIONS[d].name + ' (' + d + ')', num(result.dimensions[d], 6), F.score1(result.dimensions[d]), 'Weighted mean of ' + NPPE.DIMENSIONS[d].indicators.join(', ')]); });
    dc.push(['A1 — TODSphere composite', num(result.composites.A1, 6), F.score1(result.composites.A1), 'Σ w_j s_j / Σ w_j over the seven indicators']);
    dc.push(['A2 — dimension-balanced mean', num(result.composites.A2, 6), F.score1(result.composites.A2), '(N + P + Pe + E) / 4']);
    dc.push(['A3 — geometric composite', num(result.composites.A3, 6), F.score1(result.composites.A3), '[max(N,1) max(P,1) max(Pe,1) max(E,1)]^(1/4)']);
    dc.push(['β — balance ratio', num(result.diagnostics.beta, 6), F.ratio2(result.diagnostics.beta), 'A3 / A2 = 1 − Atkinson(ε = 1)']);
    dc.push(['Limiting dimension', result.diagnostics.limitingDimension, result.diagnostics.limitingDimensionName, 'argmin over N, P, Pe, E']);
    dc.push(['Node–place index', num(result.diagnostics.nodePlaceIndex, 6), F.score1(result.diagnostics.nodePlaceIndex), '(N + P) / 2']);
    dc.push(['Node–place gap (N − P)', num(result.diagnostics.nodePlaceGap, 6), result.diagnostics.nodePlaceClass, 'balanced if |N − P| ≤ 10']);
    sheets['Dimensions & composites'] = dc;
    var q = result.indicators.Q;
    if (q && q.background) {
      var aq = [['Pollutant', 'Background B (µg/m³)', 'Near-road increment ΔC (µg/m³)', 'Total C = round1(B + ΔC)', 'Standard (µg/m³)', 'Ratio weight']];
      [['PM2.5', 'pm25'], ['NO2', 'no2'], ['PM10', 'pm10']].forEach(function (p) {
        aq.push([p[0], num(q.background[p[1]], 3), num(q.increments[p[1]], 6), num(q.totals[p[1]], 1), result.config && NPPE.PAPER_CONFIG.air.standards[p[1]], NPPE.PAPER_CONFIG.air.ratioWeights[p[1]]]);
      });
      aq.push([]);
      aq.push(['Ratio R', num(q.ratio, 6)]); aq.push(['Q', q.score]);
      aq.push(['Nearest major road', q.nearRoad.majorRoadFound ? q.nearRoad.majorRoadClass : 'none found']);
      aq.push(['Distance to major road (m)', q.nearRoad.majorRoadFound ? num(q.nearRoad.majorRoadDistance_m, 1) : null]);
      aq.push(['AADT of that road (veh/day)', num(q.nearRoad.aadt, 0), q.nearRoad.aadtSource]);
      aq.push(['Class-weighted road-length density ρ (km/km²)', num(q.nearRoad.roadDensity, 4)]);
      aq.push(['Emission factors PM2.5/PM10/NO2 (mg/veh/km)', [q.emissionFactors.pm25, q.emissionFactors.pm10, q.emissionFactors.no2].join(' / ')]);
      aq.push(['Note', 'Screening signal of relative near-road exposure; not a predicted concentration (manuscript Sections 3.3 and 5.5).']);
      sheets['Air-quality screening'] = aq;
    }
    if (extras && extras.perception) {
      var pc = extras.perception, pr = [['Code', 'Indicator', 'Calculated', 'Perceived', 'Gap (perceived − calculated)', 'Status']];
      IND.forEach(function (k) { var r = pc.indicators[k]; pr.push([k, NPPE.INDICATORS[k].name, r.actual, num(r.perceived, 4), num(r.gap, 4), r.direction]); });
      pr.push([]); pr.push(['A1', 'Composite', num(pc.composites.actual.A1, 6), num(pc.composites.perceived.A1, 6), num(pc.composites.gapA1, 6), pc.composites.gapClass]);
      pr.push(['Note', pc.note]);
      sheets['Actual vs Perceived'] = pr;
    }
    var cfg = [['Setting', 'Value']].concat(reproducibility(result));
    sheets.Configuration = cfg;
    var warn = [['Data-quality warnings']].concat((result.dataQuality.warnings || []).map(function (w) { return [w]; }));
    if (warn.length > 1) sheets.Warnings = warn;
    return sheets;
  }

  function circlePolygon(lat, lon, radius, n) {
    var pts = [];
    for (var i = 0; i <= (n || 64); i++) {
      var a = 2 * Math.PI * i / (n || 64), dy = radius * Math.cos(a) / 111000, dx = radius * Math.sin(a) / (111000 * Math.cos(lat * Math.PI / 180));
      pts.push([Number((lon + dx).toFixed(7)), Number((lat + dy).toFixed(7))]);
    }
    return pts;
  }
  function resultToGeoJSON(result) {
    var st = result.station, props = { name: st.name, radius_m: st.radius, config_mode: result.config.mode, config_hash: result.config.hash,
      methodology: result.methodology.id + ' v' + result.methodology.version, software: result.software.name + ' ' + result.software.version, computed_at: result.provenance.computedAt };
    IND.forEach(function (k) { props[k] = result.scores[k]; });
    DIM.forEach(function (d) { props[d] = num(result.dimensions[d], 6); });
    props.A1 = num(result.composites.A1, 6); props.A2 = num(result.composites.A2, 6); props.A3 = num(result.composites.A3, 6);
    props.beta = num(result.diagnostics.beta, 6); props.limiting = result.diagnostics.limitingDimension;
    props.NP = num(result.diagnostics.nodePlaceIndex, 6); props.np_class = result.diagnostics.nodePlaceClass;
    var fc = { type: 'FeatureCollection', features: [] };
    if (st.lat != null) {
      fc.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [st.lon, st.lat] }, properties: props });
      fc.features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [circlePolygon(st.lat, st.lon, st.radius)] }, properties: { name: (st.name || 'catchment') + ' catchment', radius_m: st.radius } });
    }
    return JSON.stringify(fc, null, 2);
  }

  // -------------------------------------------------------------------------
  // Ranking
  // -------------------------------------------------------------------------
  var RANK_HEADER = ['no', 'station', 'lat', 'lon', 'T', 'D', 'L', 'W', 'A', 'G', 'Q', 'N', 'P', 'Pe', 'E', 'A1', 'rank_A1', 'A2', 'rank_A2', 'A3', 'rank_A3', 'NP', 'rank_NP', 'shift_NP_to_A3', 'beta', 'limiting', 'np_class', 'type', 'config_mode', 'config_hash'];
  function rankingRows(ranking) {
    return ranking.stations.map(function (s, i) {
      var r = s.result;
      return [i + 1, r.station.name, r.station.lat, r.station.lon].concat(IND.map(function (k) { return r.scores[k]; }))
        .concat(DIM.map(function (d) { return num(r.dimensions[d], 6); }))
        .concat([num(r.composites.A1, 6), s.ranks.A1, num(r.composites.A2, 6), s.ranks.A2, num(r.composites.A3, 6), s.ranks.A3,
          num(r.diagnostics.nodePlaceIndex, 6), s.ranks.NP, s.shifts.NP_to_A3, num(r.diagnostics.beta, 6), r.diagnostics.limitingDimension,
          r.diagnostics.nodePlaceClass, s.type, ranking.config.mode, ranking.config.hash]);
    });
  }
  function rankingToCSV(ranking) { return toCSV([RANK_HEADER].concat(rankingRows(ranking))); }
  function rankingToXLSXSheets(ranking, robustness) {
    var sheets = { Ranking: [RANK_HEADER].concat(rankingRows(ranking)) };
    var t3 = [['No.', 'Station', 'N', 'P', 'Pe', 'E', 'A1 (rank)', 'A3 (rank)', 'NP rank', 'β', 'Lim.', 'Type']];
    ranking.stations.forEach(function (s, i) {
      var r = s.result;
      t3.push([i + 1, r.station.name, F.int(r.dimensions.N), F.int(r.dimensions.P), F.int(r.dimensions.Pe), F.int(r.dimensions.E),
        F.score1(r.composites.A1) + ' (' + F.rank(s.ranks.A1) + ')', F.score1(r.composites.A3) + ' (' + F.rank(s.ranks.A3) + ')', F.rank(s.ranks.NP),
        F.ratio2(r.diagnostics.beta), r.diagnostics.limitingDimension, s.type === null ? '' : s.type]);
    });
    sheets['Table 3 format'] = t3;
    if (ranking.typology) {
      var ty = [['Type', 'Stations', 'N', 'P', 'Pe', 'E', 'A1', 'A3', 'β', 'Members']];
      Object.keys(ranking.typology.profiles).forEach(function (t) { var p = ranking.typology.profiles[t]; ty.push([+t, p.size, num(p.N, 4), num(p.P, 4), num(p.Pe, 4), num(p.E, 4), num(p.A1, 4), num(p.A3, 4), num(p.beta, 4), p.members.join('; ')]); });
      ty.push([]); ty.push(['Silhouette by k'].concat(Object.keys(ranking.typology.silhouette).map(function (k) { return 'k=' + k + ': ' + F.fixed(ranking.typology.silhouette[k], 3); })));
      ty.push(['k used', ranking.typology.k, 'k with best silhouette', ranking.typology.kBest]);
      sheets.Typology = ty;
    }
    if (robustness) {
      var rb = [['Test', 'Statistic', 'Value']];
      rb.push(['Six weighting schemes (SAW)', "Kendall's W (tie-corrected)", num(robustness.weights.kendall.W, 6)]);
      rb.push(['', 'chi-square / p', num(robustness.weights.kendall.chi2, 4) + ' / ' + robustness.weights.kendall.p]);
      Object.keys(robustness.weights.rhoVsDefault).forEach(function (k) { rb.push(['', 'Spearman ρ vs configured default: ' + k, num(robustness.weights.rhoVsDefault[k], 6)]); });
      rb.push(['SAW, WPM, WASPAS, TOPSIS, VIKOR, EDAS, A3', "Kendall's W", num(robustness.mcdm.kendall.W, 6)]);
      rb.push(['', 'Pairwise ρ min / mean', num(robustness.mcdm.rhoMin, 6) + ' / ' + num(robustness.mcdm.rhoMean, 6)]);
      if (robustness.montecarlo) {
        var mc = robustness.montecarlo;
        [['±50% perturbation, A1', mc.A1_pm50], ['±50% perturbation, A3', mc.A3_pm50], ['Flat Dirichlet (whole simplex), A1', mc.A1_simplex]].forEach(function (x) {
          rb.push([x[0], 'Median ρ (5th pct.)', num(x[1].rhoMedian, 4) + ' (' + num(x[1].rhoP05, 4) + ')']);
          rb.push(['', 'Top-5 / bottom-5 retained', num(x[1].top5Retained, 4) + ' / ' + num(x[1].bottom5Retained, 4)]);
        });
        rb.push(['Monte Carlo', 'draws / seed / PRNG', mc.nsim + ' / ' + mc.seed + ' / ' + mc.prng]);
      }
      sheets.Robustness = rb;
    }
    sheets.Configuration = [['Setting', 'Value'], ['Software', ranking.software.name + ' ' + ranking.software.version], ['Methodology', ranking.methodology.id + ' v' + ranking.methodology.version],
      ['Configuration', ranking.config.label + ' [' + ranking.config.mode + ']'], ['Configuration hash', ranking.config.hash],
      ['Weights (T,D,L,W,A,G,Q)', IND.map(function (k) { return ranking.config.weights[k]; }).join(', ')], ['Radius (m)', ranking.config.radius], ['Computed at', ranking.computedAt]];
    return sheets;
  }

  /** Parse an uploaded station table (CSV text or array-of-arrays). Columns: station/name, T..Q, optional lat, lon. */
  function parseStationTable(input) {
    var rows = typeof input === 'string' ? parseCSV(input) : input;
    if (!rows || rows.length < 2) throw new Error('The station table needs a header row and at least one station.');
    var h = rows[0].map(function (x) { return String(x).trim(); }), idx = {};
    h.forEach(function (c, i) { var k = c.replace(/\s*\(.*\)\s*$/, ''); idx[k] = i; idx[k.toLowerCase()] = i; });
    var nameCol = idx.station !== undefined ? idx.station : (idx.name !== undefined ? idx.name : idx.Station);
    var missing = IND.filter(function (k) { return idx[k] === undefined; });
    if (nameCol === undefined) missing.unshift('station');
    if (missing.length) throw new Error('Missing required column(s): ' + missing.join(', ') + '. Expected: station, T, D, L, W, A, G, Q (optional lat, lon).');
    var out = [], errors = [];
    rows.slice(1).forEach(function (r, i) {
      if (!r || r.every(function (c) { return String(c).trim() === ''; })) return;
      var ind = {}, bad = [];
      IND.forEach(function (k) { var v = String(r[idx[k]] === undefined ? '' : r[idx[k]]).trim(); var n = v === '' ? NaN : Number(v); if (!isFinite(n) || n < 0 || n > 100) bad.push(k + '=' + (v || 'blank')); ind[k] = n; });
      var name = String(r[nameCol] || '').trim() || ('Station ' + (i + 1));
      if (bad.length) { errors.push('Row ' + (i + 2) + ' (' + name + '): ' + bad.join(', ')); return; }
      var lat = idx.lat !== undefined ? Number(r[idx.lat]) : NaN, lon = idx.lon !== undefined ? Number(r[idx.lon]) : NaN;
      out.push({ id: name, name: name, lat: isFinite(lat) ? lat : undefined, lon: isFinite(lon) ? lon : undefined, indicators: ind });
    });
    return { stations: out, errors: errors };
  }

  // -------------------------------------------------------------------------
  // Methodology table generated from the configuration (no hand-copied constants)
  // -------------------------------------------------------------------------
  function methodologyRows(config) {
    var c = config && config.hash ? config : NPPE.createConfig(config), t = c.transit, w = c.weights, a = c.air;
    var bands = function (b, unit) { return b.map(function (x) { return x[1] + ' for ≥' + x[0] + (unit || ''); }).join(', '); };
    return [
      ['T', 'Transit accessibility', 'Node', 'T = ' + t.metroWeight + ' S_metro + ' + t.busWeight + ' S_bus. S_metro: ' + t.metroFullScore + ' within ' + t.metroFull + ' m of the nearest metro/rail station, linear to ' + t.metroMidScore + ' at ' + t.metroMid + ' m and ' + t.metroFarScore + ' at ' + t.metroFar + ' m, ' + t.metroBeyondScore + ' beyond. S_bus: ' + bands(t.busBands.slice().reverse(), ' stops') + ' within r, +' + t.nearStopBonus + ' if a stop lies within ' + t.nearStopDistance + ' m (cap 100). If no metro within ' + t.metroSearchLimit + ' m, T = S_bus.', w.T],
      ['D', 'Built density', 'Place', 'D = min(100, 100 (N_b/A)/' + c.density.target + '); N_b = building footprints returned for the catchment bounding square, A = πr².', w.D],
      ['L', 'Land-use diversity', 'Place', 'L = min(100, ' + c.diversity.scale + ' H/ln ' + c.diversity.classes.length + '), H = Shannon entropy of feature counts in ' + c.diversity.classes.length + ' classes (' + c.diversity.classes.join(', ') + ') within the search square.', w.L],
      ['W', 'Walkability', 'Place', 'W = ' + c.walk.linkWeight + ' S_link + ' + c.walk.pedWeight + ' S_ped; S_link = ' + bands(c.walk.linkBands, ' seg/km²') + ', else ' + c.walk.linkFloor + '; S_ped = ' + bands(c.walk.pedBands, ' footway/path/cycleway/pedestrian segments') + ', else ' + c.walk.pedFloor + ' (segments whose midpoint lies within r).', w.W],
      ['A', 'Amenity accessibility', 'People', 'A = Σ_c w_c min(100, g_c(d_c) + min(' + c.amenity.countBonusCap + ', ' + c.amenity.countBonusPerFacility + ' n_c)); ' + c.amenity.categories.map(function (x) { return x.label + ' w=' + x.weight + ' (d0 ' + x.d0 + ', d1 ' + x.d1 + ' m)'; }).join('; ') + '; g(d) = 100 for d ≤ d0, 100 exp[−(d−d0)²/2(d1−d0)²] for d0 < d < d1, 0 beyond.', w.A],
      ['G', 'Green space', 'Ecology', 'G = ' + c.green.proxWeight + ' S_prox + ' + c.green.densityWeight + ' S_den; S_prox = ' + c.green.proxBands.map(function (x) { return x[1] + ' within ' + x[0] + ' m'; }).join(', ') + ', else ' + c.green.proxBeyond + '; S_den = ' + bands(c.green.densityBands, ' /km²') + ', ' + c.green.densityAnyScore + ' if any.', w.G],
      ['Q', 'Air quality (near-road screening)', 'Ecology', 'Q = min(100, max(0, 100 − ' + a.scoreSlope + '(R − ' + a.scorePivot + '))), R = ' + a.ratioWeights.pm25 + ' C2.5/' + a.standards.pm25 + ' + ' + a.ratioWeights.no2 + ' C_NO2/' + a.standards.no2 + ' + ' + a.ratioWeights.pm10 + ' C10/' + a.standards.pm10 + '; C = round(B + ΔC, 0.1); ΔC = (AADT·EF/10⁶)(' + a.referenceDistance + '/d)^' + a.decayExponent + '(1 + ' + a.roadDensityCoefficient + ' ρ); EF (mg/veh/km) PM2.5 ' + a.emissionFactors.pm25 + ', PM10 ' + a.emissionFactors.pm10 + ', NO2 ' + a.emissionFactors.no2 + '; AADT × ' + a.urbanFactor + ' by road class; d = distance to nearest ' + a.majorClasses.join('/') + ' road (≥ ' + a.minDistance + ' m).', w.Q]
    ];
  }

  return { toCSV: toCSV, parseCSV: parseCSV, csvCell: csvCell, fileStem: fileStem, reproducibility: reproducibility, indicatorRows: indicatorRows, indicatorDetail: indicatorDetail,
    resultToCSV: resultToCSV, resultToJSON: resultToJSON, resultToXLSXSheets: resultToXLSXSheets, resultToGeoJSON: resultToGeoJSON,
    rankingToCSV: rankingToCSV, rankingToXLSXSheets: rankingToXLSXSheets, rankingRows: rankingRows, RANK_HEADER: RANK_HEADER,
    parseStationTable: parseStationTable, methodologyRows: methodologyRows };
}));
