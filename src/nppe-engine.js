/*!
 * TODSphere NPPE engine — the single authoritative implementation of the
 * Node–Place–People–Ecology (NPPE) screening method used by every part of
 * TODSphere (map UI, rankings, reports, exports, research tools and the HTTP API).
 *
 * Methodology: Varma, D. S. K. & Rankavat, S. "Node, place, people and ecology:
 * an open-data framework and tool for screening transit-oriented development along
 * an Indian metro corridor" (manuscript). Seven indicators T, D, L, W, A, G, Q;
 * dimensions N = T, P = (D+L+W)/3, Pe = A, E = (10G+12Q)/22; composites A1 (weighted
 * arithmetic mean of indicators), A2 (arithmetic mean of dimensions), A3 (geometric
 * mean of dimensions with a floor of 1); balance ratio beta = A3/A2; limiting dimension.
 *
 * The indicator algorithms are ported line-for-line from the TODSphere build that
 * used to generate the bundled reference analysis;
 * tests/reference-equivalence.test.js proves equality on randomised inputs. The only
 * difference is the NO2 emission factor: the build used 92.9 mg/veh/km (the VOC value
 * of Raparthi et al. 2021) while every reported result uses the published NO2 value of
 * 147.0 mg/veh/km, the value used for the reported reference results; the legacy-build value is retained as an explicit preset.
 *
 * No DOM access. Works as a browser global (window.TODSphereNPPE) and as a CommonJS module.
 * SPDX-License-Identifier: see LICENSE
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TODSphereNPPE = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Version and methodology metadata
  // ---------------------------------------------------------------------------
  var SOFTWARE = Object.freeze({ name: 'TODSphere', version: '2.1.0', engine: 'nppe-engine', engineVersion: '1.0.0' });
  var METHODOLOGY = Object.freeze({
    id: 'NPPE-7',
    version: '1.0.0',
    name: 'Node–Place–People–Ecology (NPPE) screening framework, seven indicators',
    reference: 'Varma, D. S. K. & Rankavat, S. Node, place, people and ecology: an open-data framework and tool ' +
      'for screening transit-oriented development along an Indian metro corridor (manuscript, revision 4).',
    indicators: ['T', 'D', 'L', 'W', 'A', 'G', 'Q'],
    dimensions: ['N', 'P', 'Pe', 'E'],
    composites: ['A1', 'A2', 'A3']
  });
  var RESULT_SCHEMA = 'todsphere.nppe.result/1';

  var INDICATORS = Object.freeze({
    T: Object.freeze({ code: 'T', key: 'transit', name: 'Transit accessibility', dimension: 'N' }),
    D: Object.freeze({ code: 'D', key: 'density', name: 'Built density', dimension: 'P' }),
    L: Object.freeze({ code: 'L', key: 'diversity', name: 'Land-use diversity', dimension: 'P' }),
    W: Object.freeze({ code: 'W', key: 'walk', name: 'Walkability', dimension: 'P' }),
    A: Object.freeze({ code: 'A', key: 'amenity', name: 'Amenity accessibility', dimension: 'Pe' }),
    G: Object.freeze({ code: 'G', key: 'green', name: 'Green space', dimension: 'E' }),
    Q: Object.freeze({ code: 'Q', key: 'air', name: 'Air quality (near-road screening)', dimension: 'E' })
  });
  var DIMENSIONS = Object.freeze({
    N: Object.freeze({ code: 'N', name: 'Node', indicators: ['T'] }),
    P: Object.freeze({ code: 'P', name: 'Place', indicators: ['D', 'L', 'W'] }),
    Pe: Object.freeze({ code: 'Pe', name: 'People', indicators: ['A'] }),
    E: Object.freeze({ code: 'E', name: 'Ecology', indicators: ['G', 'Q'] })
  });
  var IND = METHODOLOGY.indicators;
  var DIM = METHODOLOGY.dimensions;

  // Embedded rail network used by T (identical to the paper build's METRO_LINES station list).
  var NETWORK = deepFreeze([
    { line: 'NMRC Aqua Line', stations: [
      ['Noida Sector 51', 28.585721, 77.375260], ['Noida Sector 50', 28.574356, 77.378236],
      ['Noida Sector 76', 28.565336, 77.379659], ['Noida Sector 101', 28.556051, 77.384946],
      ['Noida Sector 81', 28.549307, 77.389947], ['NSEZ', 28.532412, 77.394756],
      ['Noida Sector 83', 28.522278, 77.396440], ['Noida Sector 137', 28.510777, 77.403606],
      ['Noida Sector 142', 28.498946, 77.412849], ['Noida Sector 143', 28.494263, 77.422375],
      ['Noida Sector 144', 28.486295, 77.433069], ['Noida Sector 145', 28.479008, 77.442405],
      ['Noida Sector 146', 28.468759, 77.455201], ['Noida Sector 147', 28.459296, 77.466153],
      ['Noida Sector 148', 28.448065, 77.476601], ['Knowledge Park II', 28.457091, 77.500255],
      ['Pari Chowk', 28.463385, 77.508361], ['Alpha 1', 28.470953, 77.512775],
      ['Delta 1', 28.478421, 77.525750], ['GNIDA Office', 28.484623, 77.536536],
      ['Depot', 28.488981, 77.544023]] },
    { line: 'DMRC Blue Line (Noida)', stations: [
      ['Noida Sector 15', 28.584899, 77.311632], ['Noida Sector 16', 28.578101, 77.317796],
      ['Noida Sector 18', 28.570775, 77.326094], ['Botanical Garden', 28.563916, 77.334350],
      ['Noida Golf Course', 28.567373, 77.346358], ['Noida City Centre', 28.574684, 77.356212],
      ['Noida Sector 34', 28.580250, 77.363490], ['Noida Sector 52', 28.586870, 77.373020],
      ['Noida Sector 61', 28.597585, 77.372270], ['Noida Sector 59', 28.606530, 77.372680],
      ['Noida Sector 62', 28.616990, 77.373590], ['Noida Electronic City', 28.628260, 77.375000]] },
    { line: 'DMRC Magenta Line', stations: [['Botanical Garden', 28.563916, 77.334350]] }
  ]);

  // ---------------------------------------------------------------------------
  // Paper default configuration (manuscript Table 2 and Section 3.4). Frozen.
  // ---------------------------------------------------------------------------
  var PAPER_CONFIG = deepFreeze({
    id: 'paper-default',
    label: 'Paper default (NPPE manuscript, Table 2)',
    weights: { T: 18, D: 16, L: 16, W: 16, A: 12, G: 10, Q: 12 },
    dimensionWeights: { N: 0.25, P: 0.25, Pe: 0.25, E: 0.25 },
    a3Floor: 1,
    catchment: { radius: 800, radiusMin: 300, radiusMax: 2000, searchFactor: 1.8, searchMin: 1500, searchMax: 2500 },
    transit: {
      metroFull: 400, metroMid: 800, metroFar: 1500,
      metroFullScore: 100, metroMidScore: 60, metroFarScore: 20, metroBeyondScore: 15,
      metroSearchLimit: 5000,
      busBands: [[8, 100], [5, 80], [3, 60], [1, 40]],
      nearStopDistance: 200, nearStopBonus: 15,
      metroWeight: 0.65, busWeight: 0.35
    },
    density: { target: 400 },
    diversity: { classes: ['residential', 'commercial', 'industrial', 'retail', 'education', 'healthcare', 'green', 'food'], scale: 120 },
    walk: {
      linkBands: [[200, 100], [100, 75], [50, 55], [20, 35]], linkFloor: 15,
      pedBands: [[30, 100], [15, 75], [5, 50], [1, 25]], pedFloor: 0,
      linkWeight: 0.6, pedWeight: 0.4
    },
    amenity: {
      categories: [
        { key: 'health', label: 'Health', weight: 0.25, d0: 500, d1: 1500 },
        { key: 'education', label: 'Education', weight: 0.20, d0: 600, d1: 1500 },
        { key: 'shopping', label: 'Shopping', weight: 0.20, d0: 400, d1: 1000 },
        { key: 'banking', label: 'Banking', weight: 0.15, d0: 400, d1: 1000 },
        { key: 'food', label: 'Food', weight: 0.20, d0: 300, d1: 800 }
      ],
      countBonusPerFacility: 5, countBonusCap: 20
    },
    green: {
      proxBands: [[200, 100], [300, 90], [500, 70], [800, 40], [1200, 20]], proxBeyond: 0,
      densityBands: [[10, 100], [5, 75], [2, 50], [1, 30]], densityAnyScore: 15,
      proxWeight: 0.5, densityWeight: 0.5
    },
    air: {
      majorClasses: ['motorway', 'trunk', 'primary', 'secondary'],
      aadt: { motorway: 50000, trunk: 30000, primary: 12000, secondary: 6000, tertiary: 1500, residential: 250, service: 100, living_street: 80, unclassified: 500 },
      aadtDefault: 300, aadtNoMajorRoad: 250, urbanFactor: 1.15,
      roadClassWeights: { motorway: 1.2, trunk: 1.0, primary: 0.8, secondary: 0.5, tertiary: 0.3, residential: 0.1, service: 0.05 },
      roadClassWeightDefault: 0.15, segmentBaseKm: 0.3,
      // mg veh^-1 km^-1 (Raparthi et al. 2021). NO2 = 147.0 as used for every reported result.
      emissionFactors: { pm25: 44.2, pm10: 118.1, no2: 147.0 },
      decayExponent: 0.7, referenceDistance: 50, minDistance: 10, roadDensityCoefficient: 0.05,
      standards: { pm25: 40, no2: 40, pm10: 60 },
      ratioWeights: { pm25: 0.40, no2: 0.35, pm10: 0.25 },
      scorePivot: 0.5, scoreSlope: 80,
      defaultBackground: { pm25: 55, pm10: 95, no2: 28 },
      seasonalFallback: { winter: { pm25: 120, pm10: 220, no2: 45 }, monsoon: { pm25: 35, pm10: 70, no2: 18 }, other: { pm25: 55, pm10: 95, no2: 28 } },
      peakHourFactor: 0.09
    },
    overpass: { timeoutSeconds: 30, limitA: 5000, limitB: 2000 },
    diagnostics: { nodePlaceBalanceBand: 10 },
    experimental: { enrichmentInScoring: false }
  });

  var PRESETS = deepFreeze({
    'paper-default': { label: 'Paper default (NPPE manuscript)', overrides: {} },
    'legacy-build-ef': {
      label: 'Legacy build NO2 emission factor 92.9 (VOC value; NOT used for reported results)',
      overrides: { air: { emissionFactors: { no2: 92.9 } } }
    },
    'catchment-500': { label: 'Sensitivity: 500 m catchment (manuscript robustness test iii)', overrides: { catchment: { radius: 500 } } },
    'catchment-1000': { label: 'Sensitivity: 1,000 m catchment (manuscript robustness test iii)', overrides: { catchment: { radius: 1000 } } },
    'equal-indicator-weights': { label: 'Sensitivity: equal indicator weights', overrides: { weights: { T: 1, D: 1, L: 1, W: 1, A: 1, G: 1, Q: 1 } } }
  });

  // ---------------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------------
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.getOwnPropertyNames(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function isPlainObject(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function mergeDeep(base, over) {
    var out = clone(base);
    if (!isPlainObject(over)) return out;
    Object.keys(over).forEach(function (k) {
      if (isPlainObject(over[k]) && isPlainObject(out[k])) out[k] = mergeDeep(out[k], over[k]);
      else out[k] = clone(over[k]);
    });
    return out;
  }
  function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }
  var d2r = function (d) { return d * Math.PI / 180; };
  /** Haversine distance in metres (Earth radius 6,371,000 m), as in the paper build. */
  function hav(a, b, c, d) {
    var R = 6371000, x = d2r(c - a), y = d2r(d - b);
    var z = Math.pow(Math.sin(x / 2), 2) + Math.cos(d2r(a)) * Math.cos(d2r(c)) * Math.pow(Math.sin(y / 2), 2);
    return R * 2 * Math.atan2(Math.sqrt(z), Math.sqrt(1 - z));
  }
  /** Bounding square [south, west, north, east] of half-side r metres (paper build approximation). */
  function bbox(la, lo, r) { var a = r / 111000, b = r / (111000 * Math.cos(d2r(la))); return [la - a, lo - b, la + a, lo + b]; }
  /** Circular catchment area in km^2. */
  function area(r) { return Math.PI * Math.pow(r / 1000, 2); }
  function cl(v, a, b) { a = (a === undefined ? 0 : a); b = (b === undefined ? 100 : b); return Math.max(a, Math.min(b, v)); }
  function band(value, bands, floor) { for (var i = 0; i < bands.length; i++) if (value >= bands[i][0]) return bands[i][1]; return floor; }
  function round(x, dp) { if (!isFiniteNumber(x)) return x; var f = Math.pow(10, dp || 0); return Math.round(x * f) / f; }

  function NPPEError(code, message, details) {
    var e = new Error(message);
    e.name = 'NPPEError'; e.code = code; e.details = details || null;
    return e;
  }

  // ---------------------------------------------------------------------------
  // Configuration handling
  // ---------------------------------------------------------------------------
  function flatten(o, prefix, out) {
    out = out || {};
    Object.keys(o || {}).forEach(function (k) {
      var p = prefix ? prefix + '.' + k : k;
      if (isPlainObject(o[k])) flatten(o[k], p, out); else out[p] = o[k];
    });
    return out;
  }
  function canonicalJSON(o) {
    if (Array.isArray(o)) return '[' + o.map(canonicalJSON).join(',') + ']';
    if (isPlainObject(o)) return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canonicalJSON(o[k]); }).join(',') + '}';
    return JSON.stringify(o);
  }
  /** Deterministic 64-bit FNV-1a hash (hex) used to identify a configuration; not a security hash. */
  function fnv1a64(str) {
    var h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= (c + i) & 0xffff; h2 = Math.imul(h2, 0x01000193) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  var SCORING_KEYS = ['weights', 'dimensionWeights', 'a3Floor', 'catchment', 'transit', 'density', 'diversity', 'walk', 'amenity', 'green', 'air', 'diagnostics', 'experimental'];

  /**
   * Build a validated configuration. `overrides` is a (partial) object merged on top of the
   * paper defaults. Returns a frozen config with `mode`, `deviations` and `hash` fields.
   * mode: 'paper-default' | 'user-adjusted' | 'experimental'.
   */
  function createConfig(overrides, meta) {
    var cfg = mergeDeep(PAPER_CONFIG, overrides || {});
    validateConfig(cfg);
    var base = flatten(pick(PAPER_CONFIG, SCORING_KEYS)), now = flatten(pick(cfg, SCORING_KEYS));
    var deviations = [];
    Object.keys(now).forEach(function (k) {
      if (canonicalJSON(now[k]) !== canonicalJSON(base[k])) deviations.push({ path: k, paper: base[k] === undefined ? null : base[k], value: now[k] });
    });
    Object.keys(base).forEach(function (k) { if (!(k in now)) deviations.push({ path: k, paper: base[k], value: null }); });
    var experimental = !!(cfg.experimental && cfg.experimental.enrichmentInScoring);
    cfg.mode = experimental ? 'experimental' : (deviations.length ? 'user-adjusted' : 'paper-default');
    cfg.id = cfg.mode === 'paper-default' ? 'paper-default' : ((meta && meta.id) || cfg.mode);
    cfg.label = cfg.mode === 'paper-default' ? PAPER_CONFIG.label : ((meta && meta.label) || (experimental ? 'Experimental configuration' : 'User-adjusted configuration'));
    cfg.deviations = deviations;
    cfg.hash = fnv1a64(canonicalJSON(pick(cfg, SCORING_KEYS)));
    return deepFreeze(cfg);
  }
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; }

  function validateConfig(cfg) {
    var errs = [];
    IND.forEach(function (k) {
      var w = cfg.weights[k];
      if (!isFiniteNumber(w) || w < 0) errs.push('weights.' + k + ' must be a finite number >= 0 (got ' + w + ')');
    });
    Object.keys(cfg.weights).forEach(function (k) { if (IND.indexOf(k) < 0) errs.push('weights.' + k + ' is not an NPPE indicator'); });
    if (!errs.length) {
      var tot = IND.reduce(function (s, k) { return s + cfg.weights[k]; }, 0);
      if (!(tot > 0)) errs.push('indicator weights must sum to a positive number');
      DIM.forEach(function (d) {
        var dt = DIMENSIONS[d].indicators.reduce(function (s, k) { return s + cfg.weights[k]; }, 0);
        if (!(dt > 0)) errs.push('dimension ' + d + ' (' + DIMENSIONS[d].name + ') needs a positive total weight; set at least one of ' + DIMENSIONS[d].indicators.join('/') + ' above 0');
      });
    }
    DIM.forEach(function (d) {
      var w = cfg.dimensionWeights[d];
      if (!isFiniteNumber(w) || w <= 0) errs.push('dimensionWeights.' + d + ' must be a finite number > 0');
    });
    var c = cfg.catchment;
    if (!isFiniteNumber(c.radius) || c.radius < 100 || c.radius > 5000) errs.push('catchment.radius must be between 100 and 5000 m (got ' + c.radius + ')');
    ['pm25', 'pm10', 'no2'].forEach(function (p) {
      if (!isFiniteNumber(cfg.air.emissionFactors[p]) || cfg.air.emissionFactors[p] < 0) errs.push('air.emissionFactors.' + p + ' must be >= 0');
      if (!isFiniteNumber(cfg.air.standards[p]) || cfg.air.standards[p] <= 0) errs.push('air.standards.' + p + ' must be > 0');
    });
    if (!isFiniteNumber(cfg.air.decayExponent) || cfg.air.decayExponent < 0 || cfg.air.decayExponent > 5) errs.push('air.decayExponent must be in [0, 5]');
    if (!isFiniteNumber(cfg.air.urbanFactor) || cfg.air.urbanFactor <= 0) errs.push('air.urbanFactor must be > 0');
    if (!isFiniteNumber(cfg.a3Floor) || cfg.a3Floor <= 0) errs.push('a3Floor must be > 0');
    if (errs.length) throw NPPEError('INVALID_CONFIG', 'Invalid NPPE configuration: ' + errs.join('; '), errs);
  }

  var DEFAULT_CONFIG = createConfig();

  function resolveConfig(config) {
    if (!config) return DEFAULT_CONFIG;
    if (config.hash && config.mode && Object.isFrozen(config)) return config; // already built
    return createConfig(config);
  }

  function searchHalfSide(radius, cfg) {
    cfg = resolveConfig(cfg);
    var c = cfg.catchment;
    return Math.min(Math.max(radius * c.searchFactor, c.searchMin), c.searchMax);
  }

  // ---------------------------------------------------------------------------
  // Data acquisition helpers (query construction and classification)
  // Query strings are identical to the paper build (query A: POIs/buildings/land use,
  // query B: roads with geometry). The three-part split of A is the fallback the paper
  // used on servers that refused the combined query (union identical below output limits).
  // ---------------------------------------------------------------------------
  function buildOverpassQueries(lat, lon, radius, config) {
    var cfg = resolveConfig(config);
    var b = bbox(lat, lon, radius).join(',');
    var fb = bbox(lat, lon, searchHalfSide(radius, cfg)).join(',');
    var to = cfg.overpass.timeoutSeconds, la = cfg.overpass.limitA, lb = cfg.overpass.limitB;
    var transportAndShops = 'node["railway"~"station|halt|subway_entrance"](' + fb + ');'
      + 'node["station"="subway"](' + fb + ');'
      + 'node["highway"="bus_stop"](' + fb + ');'
      + 'node["amenity"="bus_station"](' + fb + ');';
    var shops = 'nwr["shop"](' + fb + ');';
    var amenitiesParksLanduse = 'nwr["amenity"~"school|kindergarten|college|university|hospital|clinic|pharmacy|doctors|bank|atm|restaurant|cafe|fast_food|marketplace"](' + fb + ');'
      + 'nwr["leisure"~"park|playground|garden"](' + fb + ');'
      + 'way["landuse"~"residential|commercial|industrial|retail"](' + fb + ');';
    var buildings = 'way["building"](' + b + ');';
    var head = '[out:json][timeout:' + to + '];(';
    var tailA = ');out center qt ' + la + ';';
    return {
      A: head + transportAndShops + buildings + shops + amenitiesParksLanduse + tailA,
      Asplit: [head + transportAndShops + shops + tailA, head + amenitiesParksLanduse + tailA, head + buildings + tailA],
      B: head + 'way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|pedestrian|footway|cycleway|path"](' + fb + ');' + ');out geom qt ' + lb + ';',
      bboxCatchment: bbox(lat, lon, radius), bboxSearch: bbox(lat, lon, searchHalfSide(radius, cfg)),
      searchHalfSide: searchHalfSide(radius, cfg), limits: { A: la, B: lb }
    };
  }

  /** Union of Overpass element arrays, de-duplicated by OSM type/id (keeps first occurrence). */
  function mergeElements(arrays) {
    var seen = Object.create(null), out = [];
    arrays.forEach(function (arr) {
      (arr || []).forEach(function (el) {
        var key = el && el.type !== undefined && el.id !== undefined ? el.type + '/' + el.id : null;
        if (key === null) { out.push(el); return; }
        if (!seen[key]) { seen[key] = true; out.push(el); }
      });
    });
    return out;
  }

  /**
   * Classify Overpass elements into the feature sets used by the seven indicators.
   * Identical to the paper build's `proc()` (one element can fall into several sets).
   */
  function classifyElements(elements) {
    var res = { metro: [], bus: [], buildings: [], shops: [], schools: [], colleges: [], healthcare: [], green: [], banks: [], food: [], roads: [], landuse: [] };
    (elements || []).forEach(function (el) {
      if (!el || typeof el !== 'object') return;
      var t = el.tags || {};
      var lat = el.lat || (el.center && el.center.lat);
      var lon = el.lon || (el.center && el.center.lon);
      var it = { lat: lat, lon: lon, tags: t, type: el.type, id: el.id, geometry: el.geometry };
      if (t.railway && /station|halt|subway_entrance/.test(t.railway) || t.station === 'subway') res.metro.push(it);
      if (t.highway === 'bus_stop' || t.amenity === 'bus_station') res.bus.push(it);
      if (t.building) res.buildings.push(it);
      if (t.shop || t.amenity === 'marketplace') res.shops.push(it);
      if (/school|kindergarten/.test(t.amenity) && !/college|university/.test(t.amenity)) res.schools.push(it);
      if (/college|university/.test(t.amenity)) res.colleges.push(it);
      if (/hospital|clinic|pharmacy|doctors/.test(t.amenity)) res.healthcare.push(it);
      if ((t.leisure && /park|playground|garden/.test(t.leisure)) || (t.landuse && /grass|meadow|forest|recreation_ground/.test(t.landuse))) res.green.push(it);
      if (/bank|atm/.test(t.amenity)) res.banks.push(it);
      if (/restaurant|cafe|fast_food/.test(t.amenity)) res.food.push(it);
      if (t.highway && el.type === 'way') res.roads.push(it);
      if (t.landuse && /residential|commercial|industrial|retail/.test(t.landuse)) res.landuse.push(it);
    });
    return res;
  }

  function featureCounts(F) {
    var o = {};
    Object.keys(F || {}).forEach(function (k) { o[k] = Array.isArray(F[k]) ? F[k].length : 0; });
    return o;
  }

  function networkStations(network) {
    var out = [];
    (network || NETWORK).forEach(function (line) {
      (line.stations || []).forEach(function (s) {
        if (Array.isArray(s)) out.push({ name: s[0], lat: s[1], lon: s[2], line: line.line });
        else out.push({ name: s.name, lat: s.lat, lon: s.lon, line: line.line || line.name });
      });
    });
    return out;
  }
  function nearestNetworkStation(lat, lon, network) {
    var best = null, bd = Infinity;
    networkStations(network).forEach(function (s) { var d = hav(lat, lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } });
    return best ? { name: best.name, line: best.line, distance: bd } : null;
  }

  // ---------------------------------------------------------------------------
  // The seven indicators (0–100). Each returns {score, ...intermediate quantities}.
  // ---------------------------------------------------------------------------
  function arr(F, k) { return (F && Array.isArray(F[k])) ? F[k] : []; }

  /** T — transit accessibility: T = 0.65 S_metro + 0.35 S_bus. */
  function indicatorT(F, lat, lon, radius, cfg, network) {
    var c = cfg.transit, md = 1e9;
    networkStations(network).forEach(function (st) { var x = hav(lat, lon, st.lat, st.lon); if (x < md) md = x; });
    arr(F, 'metro').forEach(function (m) { if (!m.lat) return; var x = hav(lat, lon, m.lat, m.lon); if (x < md) md = x; });
    var ms;
    if (md < c.metroFull) ms = c.metroFullScore;
    else if (md < c.metroMid) ms = c.metroFullScore - ((md - c.metroFull) / (c.metroMid - c.metroFull)) * (c.metroFullScore - c.metroMidScore);
    else if (md < c.metroFar) ms = c.metroMidScore - ((md - c.metroMid) / (c.metroFar - c.metroMid)) * (c.metroMidScore - c.metroFarScore);
    else ms = c.metroBeyondScore;
    var bus = arr(F, 'bus');
    var bc = bus.filter(function (b) { return b.lat && hav(lat, lon, b.lat, b.lon) < radius; }).length;
    var bs = band(bc, c.busBands, 0);
    var bd = 1e9;
    bus.forEach(function (b) { if (!b.lat) return; bd = Math.min(bd, hav(lat, lon, b.lat, b.lon)); });
    var bonus = bd < c.nearStopDistance;
    if (bonus) bs = Math.min(100, bs + c.nearStopBonus);
    var hasMetro = md < c.metroSearchLimit;
    var raw = hasMetro ? c.metroWeight * ms + c.busWeight * bs : bs;
    return { score: Math.round(cl(raw)), S_metro: ms, S_bus: bs, metroFeatures: arr(F, 'metro').length, busStopsWithinR: bc,
      nearestMetro_m: md, nearestBus_m: bd, nearStopBonus: bonus, metroWithinSearchLimit: hasMetro };
  }

  /** D — built density: D = min(100, 100 (Nb/A)/400). */
  function indicatorD(F, radius, cfg) {
    var a = area(radius), n = arr(F, 'buildings').length, den = n / a;
    return { score: Math.round(cl((den / cfg.density.target) * 100)), buildings: n, area_km2: a, density_per_km2: den };
  }

  /** L — land-use diversity: L = min(100, 120 H/ln 8) over eight classes. */
  function indicatorL(F, cfg) {
    var c = {}; cfg.diversity.classes.forEach(function (k) { c[k] = 0; });
    arr(F, 'landuse').forEach(function (l) {
      var lu = l.tags && l.tags.landuse;
      if (lu === 'residential') c.residential++; else if (lu === 'commercial') c.commercial++;
      else if (lu === 'industrial') c.industrial++; else if (lu === 'retail') c.retail++;
    });
    c.education = arr(F, 'schools').length + arr(F, 'colleges').length;
    c.healthcare = arr(F, 'healthcare').length; c.green = arr(F, 'green').length; c.food = arr(F, 'food').length;
    c.commercial += arr(F, 'shops').length;
    var keys = Object.keys(c), T = 0;
    keys.forEach(function (k) { T += c[k]; });
    if (!T) return { score: 0, H: 0, H_normalised: 0, counts: c, total: 0, activeClasses: 0 };
    var H = 0;
    keys.forEach(function (k) { var p = c[k] / T; if (p > 0) H -= p * Math.log(p); });
    var Hn = H / Math.log(keys.length);
    return { score: Math.round(cl(Hn * cfg.diversity.scale)), H: H, H_normalised: Hn, counts: c, total: T,
      activeClasses: keys.filter(function (k) { return c[k] > 0; }).length };
  }

  /** W — walkability: W = 0.6 S_link + 0.4 S_ped. */
  function indicatorW(F, lat, lon, radius, cfg) {
    var a = area(radius), c = cfg.walk;
    var rds = arr(F, 'roads').filter(function (r) {
      if (r.geometry && r.geometry.length > 0) { var m = r.geometry[Math.floor(r.geometry.length / 2)]; return hav(lat, lon, m.lat, m.lon) < radius; }
      return false;
    });
    var rc = rds.length, rd = rc / a;
    var sLink = band(rd, c.linkBands, c.linkFloor);
    var pc = rds.filter(function (r) { return r.tags && /footway|path|cycleway|pedestrian/.test(r.tags.highway); }).length;
    var sPed = band(pc, c.pedBands, c.pedFloor);
    return { score: Math.round(cl(c.linkWeight * sLink + c.pedWeight * sPed)), S_link: sLink, S_ped: sPed,
      segmentsWithinR: rc, segments_per_km2: rd, pedestrianSegments: pc };
  }

  /** A — amenity accessibility: Gaussian distance decay over five categories. */
  function indicatorA(F, lat, lon, cfg) {
    var c = cfg.amenity, sets = {
      health: arr(F, 'healthcare'), education: arr(F, 'schools').concat(arr(F, 'colleges')),
      shopping: arr(F, 'shops'), banking: arr(F, 'banks'), food: arr(F, 'food')
    };
    var ts = 0, det = {};
    c.categories.forEach(function (cat) {
      var items = sets[cat.key] || [];
      if (!items.length) { det[cat.key] = { label: cat.label, weight: cat.weight, score: 0, nearest_m: null, countWithinD1: 0 }; return; }
      var md = 1e9, cnt = 0;
      items.forEach(function (i) { if (!i.lat) return; var x = hav(lat, lon, i.lat, i.lon); md = Math.min(md, x); if (x <= cat.d1) cnt++; });
      var gd = md <= cat.d0 ? 100 : md >= cat.d1 ? 0 : 100 * Math.exp(-Math.pow(md - cat.d0, 2) / (2 * Math.pow(cat.d1 - cat.d0, 2)));
      var bn = Math.min(c.countBonusCap, cnt * c.countBonusPerFacility), cs = cl(gd + bn);
      det[cat.key] = { label: cat.label, weight: cat.weight, score: cs, decay: gd, countBonus: bn, nearest_m: md >= 1e9 ? null : md, countWithinD1: cnt };
      ts += cat.weight * cs;
    });
    return { score: Math.round(cl(ts)), categories: det };
  }

  /** G — green space: G = 0.5 S_prox + 0.5 S_den. */
  function indicatorG(F, lat, lon, radius, cfg) {
    var c = cfg.green, a = area(radius), g = arr(F, 'green'), n = g.length, md = 1e9;
    g.forEach(function (x) { if (!x.lat) return; md = Math.min(md, hav(lat, lon, x.lat, x.lon)); });
    var ps = c.proxBeyond;
    for (var i = 0; i < c.proxBands.length; i++) { if (md < c.proxBands[i][0]) { ps = c.proxBands[i][1]; break; } }
    var den = n / a, cs = band(den, c.densityBands, n > 0 ? c.densityAnyScore : 0);
    return { score: Math.round(cl(c.proxWeight * ps + c.densityWeight * cs)), S_prox: ps, S_den: cs, greenFeatures: n,
      nearestGreen_m: md >= 1e9 ? null : md, greenPerKm2: den };
  }

  function aadtFor(cls, cfg) {
    var a = cfg.air.aadt[cls];
    return (a === undefined ? cfg.air.aadtDefault : a) * cfg.air.urbanFactor;
  }
  function roadClassWeight(cls, cfg) { var w = cfg.air.roadClassWeights[cls]; return w === undefined ? cfg.air.roadClassWeightDefault : w; }

  /**
   * Near-road screening inputs from the road network: nearest major road (vertex distance),
   * its AADT and the class-weighted road-length density rho (km/km^2). As in the paper build.
   */
  function nearRoadInputs(F, lat, lon, radius, cfg, overrides) {
    var nm = { dist: 1e9, type: 'residential', aadt: cfg.air.aadtNoMajorRoad };
    var roads = arr(F, 'roads');
    roads.forEach(function (r) {
      if (!r.geometry || r.geometry.length < 1) return;
      var md2 = 1e9;
      r.geometry.forEach(function (p) { var x = hav(lat, lon, p.lat, p.lon); if (x < md2) md2 = x; });
      var hw = r.tags && r.tags.highway;
      if (cfg.air.majorClasses.indexOf(hw) >= 0 && md2 < nm.dist) nm = { dist: md2, type: hw, aadt: aadtFor(hw, cfg) };
    });
    var aadtSource = 'road-class default (tool screening assumption)';
    if (overrides && isFiniteNumber(overrides.aadt) && overrides.aadt > 0) { nm.aadt = overrides.aadt; aadtSource = overrides.aadtSource || 'user override'; }
    var a2 = area(radius), wrl = 0, ta = 0, rsc = 0;
    roads.forEach(function (r) {
      var hw = r.tags && r.tags.highway, w = roadClassWeight(hw, cfg), aa = aadtFor(hw, cfg), sl = cfg.air.segmentBaseKm;
      if (r.geometry && r.geometry.length > 1) for (var i = 1; i < r.geometry.length; i++) sl += hav(r.geometry[i - 1].lat, r.geometry[i - 1].lon, r.geometry[i].lat, r.geometry[i].lon) / 1000;
      wrl += sl * w; ta += aa; rsc++;
    });
    var avgA = rsc ? Math.round(ta / rsc) : cfg.air.aadtNoMajorRoad;
    return { majorRoadDistance_m: nm.dist, majorRoadFound: nm.dist < 1e9, majorRoadClass: nm.type, aadt: nm.aadt, aadtSource: aadtSource,
      roadDensity: wrl / a2, weightedRoadLength_km: wrl, averageAADT: avgA, vkt: Math.round(wrl * avgA * 0.01),
      peakHourVolume: Math.round(nm.aadt * cfg.air.peakHourFactor), roadCount: rsc };
  }

  /** Near-road increments (ug/m^3): dC = (AADT EF / 1e6) (50/d)^0.7 (1 + 0.05 rho). */
  function nearRoadIncrements(inputs, cfg) {
    var a = cfg.air, dm = Math.max(inputs.majorRoadDistance_m, a.minDistance);
    var geo = Math.pow(a.referenceDistance / dm, a.decayExponent) * (1 + inputs.roadDensity * a.roadDensityCoefficient);
    return {
      pm25: (inputs.aadt * a.emissionFactors.pm25 / 1e6) * geo,
      pm10: (inputs.aadt * a.emissionFactors.pm10 / 1e6) * geo,
      no2: (inputs.aadt * a.emissionFactors.no2 / 1e6) * geo,
      effectiveDistance_m: dm
    };
  }

  /**
   * Q — air-quality screening score from background B and near-road increment dC.
   * C = round1(B + dC); R = 0.40 C2.5/40 + 0.35 CNO2/40 + 0.25 C10/60; Q = clamp(100 - 80 (R - 0.5)).
   */
  function airQualityScore(background, increments, config) {
    var cfg = resolveConfig(config), a = cfg.air;
    ['pm25', 'pm10', 'no2'].forEach(function (p) {
      if (!isFiniteNumber(background && background[p]) || background[p] < 0) throw NPPEError('INVALID_INPUT', 'background.' + p + ' must be a finite number >= 0');
      if (!isFiniteNumber(increments && increments[p]) || increments[p] < 0) throw NPPEError('INVALID_INPUT', 'increments.' + p + ' must be a finite number >= 0');
    });
    var tot = {
      pm25: Math.round((background.pm25 + increments.pm25) * 10) / 10,
      pm10: Math.round((background.pm10 + increments.pm10) * 10) / 10,
      no2: Math.round((background.no2 + increments.no2) * 10) / 10
    };
    var ratio = a.ratioWeights.pm25 * (tot.pm25 / a.standards.pm25) + a.ratioWeights.no2 * (tot.no2 / a.standards.no2) + a.ratioWeights.pm10 * (tot.pm10 / a.standards.pm10);
    var unclamped = 100 - (ratio - a.scorePivot) * a.scoreSlope;
    return { score: Math.round(cl(unclamped)), ratio: ratio, totals: tot, unclampedScore: unclamped,
      saturatedAtZero: unclamped <= 0, exceedances: { pm25: tot.pm25 > a.standards.pm25, no2: tot.no2 > a.standards.no2, pm10: tot.pm10 > a.standards.pm10 } };
  }

  /** Seasonal fallback background used by the tool when the live CAMS service is unavailable. */
  function fallbackBackground(date, config) {
    var cfg = resolveConfig(config), m = (date instanceof Date ? date : new Date()).getMonth();
    var key = (m >= 10 || m <= 1) ? 'winter' : (m >= 6 && m <= 8) ? 'monsoon' : 'other';
    var v = cfg.air.seasonalFallback[key];
    return { pm25: v.pm25, pm10: v.pm10, no2: v.no2, season: key };
  }

  function indicatorQ(F, lat, lon, radius, cfg, background, overrides) {
    var inputs = nearRoadInputs(F, lat, lon, radius, cfg, overrides);
    var inc = nearRoadIncrements(inputs, cfg);
    var q = airQualityScore(background, inc, cfg);
    return { score: q.score, background: { pm25: background.pm25, pm10: background.pm10, no2: background.no2 },
      increments: { pm25: inc.pm25, pm10: inc.pm10, no2: inc.no2 }, totals: q.totals, ratio: q.ratio,
      unclampedScore: q.unclampedScore, saturatedAtZero: q.saturatedAtZero, exceedances: q.exceedances,
      nearRoad: inputs, effectiveDistance_m: inc.effectiveDistance_m, emissionFactors: clone(cfg.air.emissionFactors) };
  }

  /**
   * Compute all seven indicators from classified OSM features.
   * ctx: {lat, lon, radius, background:{pm25,pm10,no2}, network?, aadtOverride?}
   */
  function computeIndicators(features, ctx, config) {
    var cfg = resolveConfig(config);
    if (!ctx || !isFiniteNumber(ctx.lat) || !isFiniteNumber(ctx.lon) || ctx.lat < -90 || ctx.lat > 90 || ctx.lon < -180 || ctx.lon > 180)
      throw NPPEError('INVALID_INPUT', 'A valid location {lat, lon} is required');
    var radius = isFiniteNumber(ctx.radius) ? ctx.radius : cfg.catchment.radius;
    if (radius <= 0) throw NPPEError('INVALID_INPUT', 'radius must be > 0');
    if (!features || typeof features !== 'object') throw NPPEError('MISSING_DATA', 'OSM features are missing; the NPPE indicators cannot be computed');
    var bg = ctx.background;
    if (!bg) throw NPPEError('MISSING_DATA', 'Background air quality is missing; Q cannot be computed');
    var la = ctx.lat, lo = ctx.lon, net = ctx.network || NETWORK;
    return {
      T: indicatorT(features, la, lo, radius, cfg, net),
      D: indicatorD(features, radius, cfg),
      L: indicatorL(features, cfg),
      W: indicatorW(features, la, lo, radius, cfg),
      A: indicatorA(features, la, lo, cfg),
      G: indicatorG(features, la, lo, radius, cfg),
      Q: indicatorQ(features, la, lo, radius, cfg, bg, ctx.aadtOverride ? { aadt: ctx.aadtOverride, aadtSource: ctx.aadtOverrideSource } : null)
    };
  }

  // ---------------------------------------------------------------------------
  // Dimensions, composites and diagnostics
  // ---------------------------------------------------------------------------
  function scoresOf(indicators) {
    var s = {};
    IND.forEach(function (k) {
      var v = indicators ? indicators[k] : undefined;
      s[k] = (v && typeof v === 'object') ? v.score : v;
    });
    return s;
  }

  function validateScores(s, label) {
    var missing = [], invalid = [];
    IND.forEach(function (k) {
      var v = s[k];
      if (v === undefined || v === null || v === '') missing.push(k);
      else if (!isFiniteNumber(v) || v < 0 || v > 100) invalid.push(k + '=' + v);
    });
    if (missing.length) throw NPPEError('MISSING_DATA', (label || 'Indicator') + ' scores missing for ' + missing.join(', ') + '. NPPE composites require all seven indicators; missing values are never imputed.', { missing: missing });
    if (invalid.length) throw NPPEError('INVALID_INPUT', (label || 'Indicator') + ' scores must be finite numbers in [0, 100]: ' + invalid.join(', '), { invalid: invalid });
  }

  /** Dimension scores: weighted means of member indicators using the configured weights. */
  function dimensionScores(s, cfg) {
    var out = {};
    DIM.forEach(function (d) {
      var ks = DIMENSIONS[d].indicators, num = 0, den = 0;
      ks.forEach(function (k) { num += cfg.weights[k] * s[k]; den += cfg.weights[k]; });
      out[d] = num / den;
    });
    return out;
  }

  function aggregate(indicators, config) {
    var cfg = resolveConfig(config), s = scoresOf(indicators);
    validateScores(s);
    var wt = IND.reduce(function (a, k) { return a + cfg.weights[k]; }, 0);
    var A1 = IND.reduce(function (a, k) { return a + cfg.weights[k] * s[k]; }, 0) / wt;
    var dims = dimensionScores(s, cfg);
    var dwt = DIM.reduce(function (a, d) { return a + cfg.dimensionWeights[d]; }, 0);
    var A2 = DIM.reduce(function (a, d) { return a + cfg.dimensionWeights[d] * dims[d]; }, 0) / dwt;
    var A3 = Math.exp(DIM.reduce(function (a, d) { return a + (cfg.dimensionWeights[d] / dwt) * Math.log(Math.max(dims[d], cfg.a3Floor)); }, 0));
    var beta = A2 > 0 ? A3 / A2 : null;
    var limiting = DIM[0];
    DIM.forEach(function (d) { if (dims[d] < dims[limiting]) limiting = d; }); // first minimum, as pandas idxmin
    var NP = (dims.N + dims.P) / 2, gap = dims.N - dims.P, band = cfg.diagnostics.nodePlaceBalanceBand;
    var meanDim = DIM.reduce(function (a, d) { return a + dims[d]; }, 0) / DIM.length;
    var sdDim = Math.sqrt(DIM.reduce(function (a, d) { return a + Math.pow(dims[d] - meanDim, 2); }, 0) / DIM.length);
    var weightsNorm = {}, contributions = {}, dimShare = {};
    IND.forEach(function (k) { weightsNorm[k] = cfg.weights[k] / wt; contributions[k] = weightsNorm[k] * s[k]; });
    DIM.forEach(function (d) { dimShare[d] = DIMENSIONS[d].indicators.reduce(function (a, k) { return a + weightsNorm[k]; }, 0); });
    return {
      scores: s,
      dimensions: dims,
      composites: { A1: A1, A2: A2, A3: A3 },
      diagnostics: {
        beta: beta, atkinson: beta === null ? null : 1 - beta, limitingDimension: limiting,
        limitingDimensionName: DIMENSIONS[limiting].name,
        nodePlaceIndex: NP, nodePlaceGap: gap,
        nodePlaceClass: gap > band ? 'node-dominant' : gap < -band ? 'place-dominant' : 'balanced',
        dimensionCV: meanDim > 0 ? sdDim / meanDim : null,
        zeroDimensions: DIM.filter(function (d) { return dims[d] < cfg.a3Floor; })
      },
      weights: { indicator: clone(cfg.weights), normalised: weightsNorm, dimensionShareA1: dimShare, dimension: clone(cfg.dimensionWeights) },
      contributions: contributions
    };
  }

  function configSummary(cfg) {
    return {
      id: cfg.id, label: cfg.label, mode: cfg.mode, hash: cfg.hash,
      weights: clone(cfg.weights), dimensionWeights: clone(cfg.dimensionWeights),
      radius: cfg.catchment.radius, searchHalfSide: searchHalfSide(cfg.catchment.radius, cfg),
      emissionFactors: clone(cfg.air.emissionFactors), deviations: clone(cfg.deviations),
      experimental: clone(cfg.experimental)
    };
  }

  /**
   * Score one station. input is either
   *   {indicators:{T..Q}}                                  (pre-computed indicator scores), or
   *   {features, location:{lat,lon}, radius?, background, network?, aadtOverride?}  (raw data)
   * plus optional {station:{id,name,lat,lon}, provenance:{...}}.
   * Returns the canonical result object consumed by UI, reports, exports and the API.
   */
  function scoreStation(input, config, options) {
    var cfg = resolveConfig(config);
    options = options || {};
    if (!input || typeof input !== 'object') throw NPPEError('INVALID_INPUT', 'Station input must be an object');
    var indicators, mode, warnings = [];
    var loc = input.location || (input.station && isFiniteNumber(input.station.lat) ? { lat: input.station.lat, lon: input.station.lon } : null);
    var radius = isFiniteNumber(input.radius) ? input.radius : cfg.catchment.radius;
    if (input.features) {
      indicators = computeIndicators(input.features, { lat: loc && loc.lat, lon: loc && loc.lon, radius: radius, background: input.background, network: input.network, aadtOverride: input.aadtOverride, aadtOverrideSource: input.aadtOverrideSource }, cfg);
      mode = 'computed-from-osm';
      var fc = featureCounts(input.features);
      if (!fc.buildings) warnings.push('No building footprints returned: D is 0 (possible mapping gap).');
      if (!fc.roads) warnings.push('No road segments returned: W is at its floor and Q uses the no-major-road default.');
      if (!indicators.Q.nearRoad.majorRoadFound) warnings.push('No motorway/trunk/primary/secondary road in the search square: near-road increment is negligible.');
      if (indicators.Q.saturatedAtZero) warnings.push('Q is at its floor of 0: background concentrations exceed the national standards (manuscript Section 5.3).');
      ['health', 'education', 'shopping', 'banking', 'food'].forEach(function (k) {
        var c = indicators.A.categories[k]; if (c && c.score === 0) warnings.push('No ' + c.label.toLowerCase() + ' facility mapped within ' + ({ health: 1500, education: 1500, shopping: 1000, banking: 1000, food: 800 })[k] + ' m.');
      });
    } else if (input.indicators) {
      indicators = {};
      IND.forEach(function (k) { var v = input.indicators[k]; indicators[k] = (v && typeof v === 'object') ? clone(v) : { score: v }; });
      mode = 'supplied-indicators';
    } else {
      throw NPPEError('INVALID_INPUT', 'Provide either {indicators} or {features, location, background}');
    }
    var agg = aggregate(indicators, cfg);
    if (Array.isArray(input.warnings)) input.warnings.forEach(function (w) { if (w) warnings.unshift(String(w)); });
    if (cfg.mode !== 'paper-default') warnings.push('Configuration deviates from the paper default (' + cfg.deviations.length + ' change(s)); results are not directly comparable with the manuscript.');
    var st = input.station || {};
    return {
      schema: RESULT_SCHEMA,
      software: clone(SOFTWARE),
      methodology: { id: METHODOLOGY.id, version: METHODOLOGY.version, name: METHODOLOGY.name },
      config: configSummary(cfg),
      station: {
        id: st.id !== undefined ? st.id : null, name: st.name || null,
        lat: loc ? loc.lat : (isFiniteNumber(st.lat) ? st.lat : null), lon: loc ? loc.lon : (isFiniteNumber(st.lon) ? st.lon : null),
        radius: radius, searchHalfSide: searchHalfSide(radius, cfg),
        nearestNetworkStation: loc ? nearestNetworkStation(loc.lat, loc.lon, input.network) : null
      },
      inputMode: mode,
      indicators: indicators,
      scores: agg.scores,
      dimensions: agg.dimensions,
      composites: agg.composites,
      diagnostics: agg.diagnostics,
      weights: agg.weights,
      contributions: agg.contributions,
      dataQuality: { warnings: warnings, featureCounts: input.features ? featureCounts(input.features) : null },
      provenance: Object.assign({ computedAt: options.timestamp || new Date().toISOString() }, clone(input.provenance) || {})
    };
  }

  /** Grade band used by the TODSphere legend (display only; not part of the NPPE method). */
  function gradeBand(score) {
    if (!isFiniteNumber(score)) return 'n/a';
    return score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Moderate' : score >= 20 ? 'Low' : 'Poor';
  }

  /**
   * Correctly rounded fixed-point string with ties-to-even on exact binary ties — identical to
   * Python's format(x, '.nf'), which produced the manuscript's tables (e.g. 57.25 -> "57.2").
   */
  function fixed(v, dp) {
    if (!isFiniteNumber(v)) return '–';
    var s = Math.abs(v).toFixed(dp + 25), dot = s.indexOf('.'), tail = s.slice(dot + 1 + dp);
    if (tail[0] === '5' && /^50*$/.test(tail)) {
      var down = (Math.floor(Math.abs(v) * Math.pow(10, dp)));
      var r = (down % 2 === 0 ? down : down + 1) / Math.pow(10, dp);
      var out = r.toFixed(dp);
      return (v < 0 && Number(out) !== 0 ? '-' : '') + out;
    }
    var o = v.toFixed(dp);
    return /^-0(\.0*)?$/.test(o) ? o.slice(1) : o;
  }

  /** Shared display formatting so UI, reports and exports show identical numbers. */
  var format = {
    fixed: fixed,
    indicator: function (v) { return fixed(v, 0); },
    int: function (v) { return fixed(v, 0); },
    score1: function (v) { return fixed(v, 1); },
    ratio2: function (v) { return fixed(v, 2); },
    dist: function (m) { return (!isFiniteNumber(m) || m >= 1e8) ? 'n/a' : m < 1000 ? fixed(m, 0) + ' m' : fixed(m / 1000, 2) + ' km'; },
    conc: function (v) { return fixed(v, 1); },
    rank: function (r) { return isFiniteNumber(r) ? (r % 1 === 0 ? String(r) : fixed(r, 1)) : '–'; },
    pct: function (v) { return isFiniteNumber(v) ? fixed(v * 100, 1) + '%' : '–'; }
  };

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function sd(a, ddof) { ddof = ddof === undefined ? 1 : ddof; var m = mean(a); return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - ddof)); }
  /** Ranks with ties averaged; rank 1 = largest value when desc (scipy.stats.rankdata(-x, 'average')). */
  function rankData(values, desc) {
    var idx = values.map(function (v, i) { return i; });
    idx.sort(function (a, b) { var d = desc ? values[b] - values[a] : values[a] - values[b]; return d !== 0 ? d : a - b; });
    var ranks = new Array(values.length), i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++;
      var r = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) ranks[idx[k]] = r;
      i = j + 1;
    }
    return ranks;
  }
  function rankDesc(values) { return rankData(values, true); }
  function pearson(x, y) {
    var mx = mean(x), my = mean(y), sxy = 0, sx = 0, sy = 0;
    for (var i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) * (x[i] - mx); sy += (y[i] - my) * (y[i] - my); }
    return (sx > 0 && sy > 0) ? sxy / Math.sqrt(sx * sy) : null;
  }
  function spearman(x, y) { return pearson(rankData(x), rankData(y)); }
  /** numpy.percentile default (linear interpolation). */
  function percentile(values, q) {
    var a = values.slice().sort(function (p, r) { return p - r; });
    if (!a.length) return null;
    var pos = (a.length - 1) * q / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }
  function median(values) { return percentile(values, 50); }
  // Regularised upper incomplete gamma Q(a, x) (Numerical Recipes gser/gcf).
  function lnGamma(z) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015; for (var j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function gammaQ(a, x) {
    if (x < 0 || a <= 0) return NaN;
    if (x === 0) return 1;
    var gln = lnGamma(a);
    if (x < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    var b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (var i = 1; i < 1000; i++) {
      var an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; var dl = d * c; h *= dl; if (Math.abs(dl - 1) < 1e-15) break;
    }
    return Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  function chi2Survival(x, df) { return gammaQ(df / 2, x / 2); }
  /** Kendall's coefficient of concordance W with tie correction. rankMatrix: m raters x n objects. */
  function kendallW(rankMatrix) {
    var m = rankMatrix.length, n = m ? rankMatrix[0].length : 0;
    if (m < 2 || n < 2) return { W: null, chi2: null, df: n - 1, p: null, m: m, n: n };
    var Rj = new Array(n).fill(0);
    rankMatrix.forEach(function (row) { row.forEach(function (r, j) { Rj[j] += r; }); });
    var mR = mean(Rj), S = Rj.reduce(function (s, v) { return s + (v - mR) * (v - mR); }, 0), T = 0;
    rankMatrix.forEach(function (row) {
      var counts = {}; row.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
      Object.keys(counts).forEach(function (k) { var t = counts[k]; T += t * t * t - t; });
    });
    var denom = m * m * (n * n * n - n) - m * T;
    var W = denom > 0 ? 12 * S / denom : null;
    var chi2 = W === null ? null : m * (n - 1) * W;
    return { W: W, chi2: chi2, df: n - 1, p: chi2 === null ? null : chi2Survival(chi2, n - 1), m: m, n: n };
  }
  function describe(values, names) {
    var m = mean(values), s = values.length > 1 ? sd(values, 1) : 0, mn = Math.min.apply(null, values), mx = Math.max.apply(null, values);
    return { mean: m, sd: s, min: mn, max: mx, cv: m ? s / m : null,
      argmin: names ? names[values.indexOf(mn)] : values.indexOf(mn), argmax: names ? names[values.indexOf(mx)] : values.indexOf(mx) };
  }

  // Deterministic PRNG (xoshiro128**, seeded via splitmix32). Not numpy's PCG64; see docs.
  function createRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    function sm() { s = (s + 0x9e3779b9) >>> 0; var z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0; return (z ^ (z >>> 16)) >>> 0; }
    var a = sm(), b = sm(), c = sm(), d = sm();
    function next() {
      var r = Math.imul(b, 5); r = (r << 7) | (r >>> 25); r = Math.imul(r, 9) >>> 0;
      var t = b << 9;
      c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = (d << 11) | (d >>> 21);
      return r;
    }
    return {
      // 53-bit uniform in [0, 1)
      random: function () { return ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992; },
      uniform: function (lo, hi) { return lo + (hi - lo) * this.random(); },
      exponential: function () { var u; do { u = this.random(); } while (u <= 0); return -Math.log(u); }
    };
  }

  // ---------------------------------------------------------------------------
  // Multi-station ranking, diagnostics and typology
  // ---------------------------------------------------------------------------
  function stationResults(stations, cfg) {
    if (!Array.isArray(stations) || stations.length === 0) throw NPPEError('INVALID_INPUT', 'At least one station is required');
    return stations.map(function (st, i) {
      if (st && st.schema === RESULT_SCHEMA && st.config && st.config.hash === cfg.hash) return st;
      var ind = st.indicators || (st.scores ? st.scores : null);
      if (!ind) throw NPPEError('INVALID_INPUT', 'Station ' + (st && (st.name || st.id) || i + 1) + ' has no indicators');
      return scoreStation({ indicators: ind, station: { id: st.id !== undefined ? st.id : i + 1, name: st.name || ('Station ' + (i + 1)), lat: st.lat, lon: st.lon } }, cfg, { timestamp: st.computedAt });
    });
  }

  function wardLinkage(X) {
    var n = X.length, clusters = [], active = [];
    for (var i = 0; i < n; i++) { clusters.push({ id: i, members: [i], size: 1 }); active.push(i); }
    var D = {};
    function key(a, b) { return a < b ? a + ',' + b : b + ',' + a; }
    function euc(p, q) { var s = 0; for (var k = 0; k < p.length; k++) s += (p[k] - q[k]) * (p[k] - q[k]); return Math.sqrt(s); }
    for (i = 0; i < n; i++) for (var j = i + 1; j < n; j++) D[key(i, j)] = euc(X[i], X[j]);
    var Z = [], next = n;
    while (active.length > 1) {
      var best = null, ba = -1, bb = -1;
      for (var x = 0; x < active.length; x++) for (var y = x + 1; y < active.length; y++) {
        var dv = D[key(active[x], active[y])];
        if (best === null || dv < best) { best = dv; ba = active[x]; bb = active[y]; }
      }
      var ca = clusters[ba], cb = clusters[bb], nc = { id: next, members: ca.members.concat(cb.members), size: ca.size + cb.size };
      clusters[next] = nc;
      active = active.filter(function (c) { return c !== ba && c !== bb; });
      active.forEach(function (w) {
        var cw = clusters[w], daw = D[key(ba, w)], dbw = D[key(bb, w)], tot = ca.size + cb.size + cw.size;
        D[key(next, w)] = Math.sqrt(((cw.size + ca.size) * daw * daw + (cw.size + cb.size) * dbw * dbw - cw.size * best * best) / tot);
      });
      Z.push([Math.min(ba, bb), Math.max(ba, bb), best, nc.size]);
      active.push(next); next++;
    }
    return { Z: Z, clusters: clusters, n: n };
  }
  function cutTree(link, k) {
    var n = link.n, parent = [];
    for (var i = 0; i < 2 * n; i++) parent[i] = i;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    var order = link.Z.map(function (z, i) { return i; }).sort(function (a, b) { return link.Z[a][2] - link.Z[b][2] || a - b; });
    for (var m = 0; m < n - k; m++) {
      var z = link.Z[order[m]], newId = n + order[m];
      parent[find(z[0])] = newId; parent[find(z[1])] = newId;
    }
    var labels = [], map = {}, nextLabel = 1;
    for (i = 0; i < n; i++) { var r = find(i); if (!map[r]) map[r] = nextLabel++; labels.push(map[r]); }
    return labels;
  }
  function silhouette(X, labels) {
    var n = X.length, s = 0;
    function euc(p, q) { var t = 0; for (var k = 0; k < p.length; k++) t += (p[k] - q[k]) * (p[k] - q[k]); return Math.sqrt(t); }
    var uniq = labels.filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (uniq.length < 2 || uniq.length > n - 1) return null;
    for (var i = 0; i < n; i++) {
      var own = labels.filter(function (l, j) { return l === labels[i] && j !== i; }).length;
      if (own === 0) continue; // singleton: s = 0 (sklearn)
      var a = 0; for (var j = 0; j < n; j++) if (j !== i && labels[j] === labels[i]) a += euc(X[i], X[j]); a /= own;
      var b = Infinity;
      uniq.forEach(function (l) {
        if (l === labels[i]) return;
        var t = 0, c = 0; for (var j2 = 0; j2 < n; j2++) if (labels[j2] === l) { t += euc(X[i], X[j2]); c++; }
        b = Math.min(b, t / c);
      });
      s += (b - a) / Math.max(a, b);
    }
    return s / n;
  }

  /**
   * Typology: Ward clustering of the four dimension scores (not re-standardised), number of
   * clusters k (manuscript uses 4, the interpretable refinement of the silhouette-optimal k=2).
   * Clusters are relabelled 1..k in descending order of mean A3.
   */
  function typology(results, k) {
    var n = results.length;
    if (n < 3) return null;
    var X = results.map(function (r) { return DIM.map(function (d) { return r.dimensions[d]; }); });
    var link = wardLinkage(X), sil = {};
    for (var kk = 2; kk <= Math.min(6, n - 1); kk++) sil[kk] = silhouette(X, cutTree(link, kk));
    var kBest = null; Object.keys(sil).forEach(function (kk2) { if (sil[kk2] !== null && (kBest === null || sil[kk2] > sil[kBest])) kBest = +kk2; });
    var kUse = Math.max(2, Math.min(k || 4, n - 1));
    var raw = cutTree(link, kUse);
    var groups = {};
    raw.forEach(function (l, i) { (groups[l] = groups[l] || []).push(i); });
    var order = Object.keys(groups).sort(function (a, b) {
      var ma = mean(groups[a].map(function (i) { return results[i].composites.A3; }));
      var mb = mean(groups[b].map(function (i) { return results[i].composites.A3; }));
      return mb - ma || (+a) - (+b);
    });
    var labels = raw.map(function (l) { return order.indexOf(String(l)) + 1; });
    var profiles = {};
    order.forEach(function (l, t) {
      var idx = groups[l], p = { size: idx.length, members: idx.map(function (i) { return results[i].station.name; }) };
      DIM.forEach(function (d) { p[d] = mean(idx.map(function (i) { return results[i].dimensions[d]; })); });
      ['A1', 'A3'].forEach(function (c) { p[c] = mean(idx.map(function (i) { return results[i].composites[c]; })); });
      p.beta = mean(idx.map(function (i) { return results[i].diagnostics.beta; }));
      profiles[t + 1] = p;
    });
    return { method: 'Ward hierarchical clustering of N, P, Pe, E (Euclidean, not re-standardised)', k: kUse, kBest: kBest,
      silhouette: sil, labels: labels, profiles: profiles, linkage: link.Z };
  }

  /** Rank stations on A1, A2, A3 and the node–place index; add typology and corridor statistics. */
  function rankStations(stations, config, options) {
    var cfg = resolveConfig(config); options = options || {};
    var results = stationResults(stations, cfg);
    var col = function (f) { return results.map(f); };
    var A1 = col(function (r) { return r.composites.A1; }), A2 = col(function (r) { return r.composites.A2; }),
      A3 = col(function (r) { return r.composites.A3; }), NP = col(function (r) { return r.diagnostics.nodePlaceIndex; });
    var ranks = { A1: rankDesc(A1), A2: rankDesc(A2), A3: rankDesc(A3), NP: rankDesc(NP) };
    var typ = options.typology === false ? null : typology(results, options.typologyK || 4);
    var names = col(function (r) { return r.station.name; });
    var rows = results.map(function (r, i) {
      return { index: i, result: r, ranks: { A1: ranks.A1[i], A2: ranks.A2[i], A3: ranks.A3[i], NP: ranks.NP[i] },
        shifts: { NP_to_A3: ranks.NP[i] - ranks.A3[i], A1_to_A3: ranks.A1[i] - ranks.A3[i] },
        type: typ ? typ.labels[i] : null };
    });
    var summary = null;
    if (results.length >= 2) {
      var desc = {};
      IND.forEach(function (k) { desc[k] = describe(col(function (r) { return r.scores[k]; }), names); });
      DIM.forEach(function (d) { desc[d] = describe(col(function (r) { return r.dimensions[d]; }), names); });
      desc.A1 = describe(A1, names); desc.A2 = describe(A2, names); desc.A3 = describe(A3, names); desc.NP = describe(NP, names);
      var betas = col(function (r) { return r.diagnostics.beta; });
      if (betas.every(isFiniteNumber)) desc.beta = describe(betas, names);
      var shiftNP = rows.map(function (r) { return Math.abs(r.shifts.NP_to_A3); });
      summary = {
        n: results.length, descriptive: desc,
        spearman: { NP_A1: spearman(NP, A1), NP_A2: spearman(NP, A2), NP_A3: spearman(NP, A3), A1_A2: spearman(A1, A2), A1_A3: spearman(A1, A3), A2_A3: spearman(A2, A3) },
        nodePlace: {
          balanced: rows.filter(function (r) { return r.result.diagnostics.nodePlaceClass === 'balanced'; }).length,
          nodeDominant: rows.filter(function (r) { return r.result.diagnostics.nodePlaceClass === 'node-dominant'; }).length,
          placeDominant: rows.filter(function (r) { return r.result.diagnostics.nodePlaceClass === 'place-dominant'; }).length,
          meanAbsShiftNPtoA3: mean(shiftNP), maxAbsShiftNPtoA3: Math.max.apply(null, shiftNP),
          stationsShiftingAtLeast3: shiftNP.filter(function (v) { return v >= 3; }).length
        },
        limitingDimensionCounts: DIM.reduce(function (o, d) { o[d] = rows.filter(function (r) { return r.result.diagnostics.limitingDimension === d; }).length; return o; }, {})
      };
    }
    return { schema: 'todsphere.nppe.ranking/1', software: clone(SOFTWARE), methodology: { id: METHODOLOGY.id, version: METHODOLOGY.version },
      config: configSummary(cfg), rankingBasis: options.primary || 'A3', stations: rows, typology: typ, summary: summary,
      computedAt: options.timestamp || new Date().toISOString() };
  }

  // ---------------------------------------------------------------------------
  // Robustness analysis (manuscript Section 3.6): weights, MCDM methods, Monte Carlo
  // ---------------------------------------------------------------------------
  function colMax(X, j) { return Math.max.apply(null, X.map(function (r) { return r[j]; })); }
  function colMin(X, j) { return Math.min.apply(null, X.map(function (r) { return r[j]; })); }
  function colSum(X, j) { return X.reduce(function (s, r) { return s + r[j]; }, 0); }

  function weightsEntropy(X) {
    var n = X.length, m = X[0].length, k = 1 / Math.log(n), d = [];
    for (var j = 0; j < m; j++) {
      var sum = colSum(X, j), e = 0;
      for (var i = 0; i < n; i++) { var p = sum > 0 ? X[i][j] / sum : NaN; if (!(p > 0)) p = 1e-12; e += p * Math.log(p); }
      d.push(1 - (-k * e));
    }
    var t = d.reduce(function (s, v) { return s + v; }, 0);
    return d.map(function (v) { return v / t; });
  }
  function weightsCRITIC(X) {
    var n = X.length, m = X[0].length, Z = X.map(function (r) { return r.slice(); });
    for (var j = 0; j < m; j++) {
      var mn = colMin(X, j), rg = colMax(X, j) - mn; if (!(rg > 0)) rg = 1;
      for (var i = 0; i < n; i++) Z[i][j] = (X[i][j] - mn) / rg;
    }
    var cols = []; for (j = 0; j < m; j++) cols.push(Z.map(function (r) { return r[j]; }));
    var s = cols.map(function (c) { return sd(c, 1); });
    var C = cols.map(function (cj, a) {
      var tot = 0;
      cols.forEach(function (ck, b) {
        var r = pearson(cj, ck);
        if (r === null) r = 0; // numpy corrcoef NaN -> 0 (also on the diagonal of a constant column)
        else if (a === b) r = 1;
        tot += 1 - r;
      });
      return (isFiniteNumber(s[a]) ? s[a] : 0) * tot;
    });
    var t = C.reduce(function (x, v) { return x + v; }, 0);
    return C.map(function (v) { return t > 0 ? v / t : 1 / m; });
  }
  function weightsMEREC(X) {
    var n = X.length, m = X[0].length;
    var Xp = X.map(function (r) { return r.map(function (v) { return Math.max(v, 1); }); });
    var mins = []; for (var j = 0; j < m; j++) mins.push(colMin(Xp, j));
    var N = Xp.map(function (r) { return r.map(function (v, j2) { return mins[j2] / v; }); });
    var S = N.map(function (r) { return Math.log(1 + r.reduce(function (s, v) { return s + Math.abs(Math.log(v)); }, 0) / m); });
    var E = [];
    for (j = 0; j < m; j++) {
      var e = 0;
      for (var i = 0; i < n; i++) {
        var sj = 0; for (var k = 0; k < m; k++) if (k !== j) sj += Math.abs(Math.log(N[i][k]));
        e += Math.abs(Math.log(1 + sj / m) - S[i]);
      }
      E.push(e);
    }
    var t = E.reduce(function (x, v) { return x + v; }, 0);
    return E.map(function (v) { return t > 0 ? v / t : 1 / m; });
  }
  var MCDM = {
    SAW: function (X, w) { var mx = w.map(function (_, j) { return colMax(X, j); }); return X.map(function (r) { return r.reduce(function (s, v, j) { return s + (mx[j] > 0 ? v / mx[j] : 0) * w[j]; }, 0); }); },
    WPM: function (X, w) { var mx = w.map(function (_, j) { return colMax(X, j); }); return X.map(function (r) { return Math.exp(r.reduce(function (s, v, j) { return s + Math.log(Math.max(v, 1) / (mx[j] > 0 ? mx[j] : 1)) * w[j]; }, 0)); }); },
    WASPAS: function (X, w) { var a = MCDM.SAW(X, w), b = MCDM.WPM(X, w); return a.map(function (v, i) { return 0.5 * v + 0.5 * b[i]; }); },
    TOPSIS: function (X, w) {
      var nrm = w.map(function (_, j) { return Math.sqrt(X.reduce(function (s, r) { return s + r[j] * r[j]; }, 0)); });
      var V = X.map(function (r) { return r.map(function (v, j) { return (nrm[j] > 0 ? v / nrm[j] : 0) * w[j]; }); });
      var best = w.map(function (_, j) { return colMax(V, j); }), worst = w.map(function (_, j) { return colMin(V, j); });
      return V.map(function (r) {
        var dp = Math.sqrt(r.reduce(function (s, v, j) { return s + Math.pow(v - best[j], 2); }, 0));
        var dm = Math.sqrt(r.reduce(function (s, v, j) { return s + Math.pow(v - worst[j], 2); }, 0));
        return dp + dm > 0 ? dm / (dp + dm) : 0.5;
      });
    },
    VIKOR: function (X, w) {
      var fb = w.map(function (_, j) { return colMax(X, j); }), fw = w.map(function (_, j) { return colMin(X, j); });
      var T = X.map(function (r) { return r.map(function (v, j) { var rg = fb[j] - fw[j]; return w[j] * (fb[j] - v) / (rg > 0 ? rg : 1); }); });
      var S = T.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); }), R = T.map(function (r) { return Math.max.apply(null, r); });
      var sMin = Math.min.apply(null, S), sMax = Math.max.apply(null, S), rMin = Math.min.apply(null, R), rMax = Math.max.apply(null, R);
      return S.map(function (s, i) { return -(0.5 * (s - sMin) / Math.max(sMax - sMin, 1e-12) + 0.5 * (R[i] - rMin) / Math.max(rMax - rMin, 1e-12)); });
    },
    EDAS: function (X, w) {
      var av = w.map(function (_, j) { var a = colSum(X, j) / X.length; return a > 0 ? a : 1e-12; });
      var SP = X.map(function (r) { return r.reduce(function (s, v, j) { return s + w[j] * Math.max(0, v - av[j]) / av[j]; }, 0); });
      var SN = X.map(function (r) { return r.reduce(function (s, v, j) { return s + w[j] * Math.max(0, av[j] - v) / av[j]; }, 0); });
      var mSP = Math.max(Math.max.apply(null, SP), 1e-12), mSN = Math.max(Math.max.apply(null, SN), 1e-12);
      return SP.map(function (v, i) { return (v / mSP + (1 - SN[i] / mSN)) / 2; });
    }
  };
  var MCDM_ORDER = ['SAW', 'WPM', 'WASPAS', 'TOPSIS', 'VIKOR', 'EDAS'];

  function a1WithWeights(X, w) { var t = w.reduce(function (s, v) { return s + v; }, 0); return X.map(function (r) { return r.reduce(function (s, v, j) { return s + v * w[j]; }, 0) / t; }); }
  function a3WithWeights(D, wd) { var t = wd.reduce(function (s, v) { return s + v; }, 0); return D.map(function (r) { return Math.exp(r.reduce(function (s, v, j) { return s + Math.log(Math.max(v, 1)) * wd[j] / t; }, 0)); }); }
  function argsortAsc(a) { return a.map(function (v, i) { return i; }).sort(function (x, y) { return a[x] - a[y] || x - y; }); }

  function mcSummary(R, baseRank) {
    var n = baseRank.length, topN = Math.min(5, n), bs = argsortAsc(baseRank);
    var top5 = bs.slice(0, topN), bot5 = bs.slice(n - topN);
    var rhos = [], jt = [], jb = [], shift = 0;
    R.forEach(function (r, s) {
      if (s < 2000) rhos.push(spearman(r, baseRank));
      var o = argsortAsc(r), t = o.slice(0, topN), b = o.slice(n - topN);
      jt.push(t.filter(function (i) { return top5.indexOf(i) >= 0; }).length / topN);
      jb.push(b.filter(function (i) { return bot5.indexOf(i) >= 0; }).length / topN);
      r.forEach(function (v, i) { shift += Math.abs(v - baseRank[i]); });
    });
    var perStation = baseRank.map(function (_, i) {
      var col = R.map(function (r) { return r[i]; });
      return { median: median(col), p05: percentile(col, 5), p95: percentile(col, 95),
        pTop5: col.filter(function (v) { return v <= topN; }).length / R.length,
        pBottom5: col.filter(function (v) { return v >= n - topN + 1; }).length / R.length,
        pFirst: col.filter(function (v) { return v === 1; }).length / R.length };
    });
    return { rhoMedian: median(rhos), rhoP05: percentile(rhos, 5), top5Retained: mean(jt), bottom5Retained: mean(jb),
      meanAbsShift: shift / (R.length * n), maxP90Width: Math.max.apply(null, perStation.map(function (p) { return p.p95 - p.p05; })),
      perStation: perStation };
  }

  /**
   * Robustness tests for a station set scored with the PAPER weights (as in the manuscript).
   * options: {nsim=10000, seed=20260922, montecarlo=true}
   */
  function robustness(stations, config, options) {
    var cfg = resolveConfig(config); options = options || {};
    var results = stationResults(stations, cfg), n = results.length;
    if (n < 3) throw NPPEError('INSUFFICIENT_DATA', 'Robustness analysis needs at least 3 stations');
    var X = results.map(function (r) { return IND.map(function (k) { return r.scores[k]; }); });
    var Dm = results.map(function (r) { return DIM.map(function (d) { return r.dimensions[d]; }); });
    var wBase = IND.map(function (k) { return cfg.weights[k]; }), wt = wBase.reduce(function (s, v) { return s + v; }, 0);
    var wDef = wBase.map(function (v) { return v / wt; });
    var schemes = {
      'Configured default': wDef,
      'Equal (indicator)': IND.map(function () { return 1 / 7; }),
      'Equal (dimension)': [0.25, 0.25 / 3, 0.25 / 3, 0.25 / 3, 0.25, 0.125, 0.125],
      'Entropy': weightsEntropy(X), 'CRITIC': weightsCRITIC(X), 'MEREC': weightsMEREC(X)
    };
    var wRanks = {}; Object.keys(schemes).forEach(function (k) { wRanks[k] = rankDesc(MCDM.SAW(X, schemes[k])); });
    var wKW = kendallW(Object.keys(wRanks).map(function (k) { return wRanks[k]; }));
    var rhoVsDefault = {}; Object.keys(wRanks).forEach(function (k) { rhoVsDefault[k] = spearman(wRanks['Configured default'], wRanks[k]); });

    var agg = results.map(function (r) { return r.composites.A3; });
    var mRanks = {}; MCDM_ORDER.forEach(function (k) { mRanks[k] = rankDesc(MCDM[k](X, wDef)); });
    mRanks['NPPE-GM (A3)'] = rankDesc(agg);
    var mNames = Object.keys(mRanks), mKW = kendallW(mNames.map(function (k) { return mRanks[k]; }));
    var rhoM = {}, off = [];
    mNames.forEach(function (a) { rhoM[a] = {}; mNames.forEach(function (b) { var r = spearman(mRanks[a], mRanks[b]); rhoM[a][b] = r; if (a !== b) off.push(r); }); });
    var borda = new Array(n).fill(0);
    mNames.forEach(function (k) { mRanks[k].forEach(function (r, i) { borda[i] += n + 1 - r; }); });

    var mc = null;
    if (options.montecarlo !== false) {
      var nsim = options.nsim || 10000, rng = createRng(options.seed === undefined ? 20260922 : options.seed);
      var baseA1 = rankDesc(results.map(function (r) { return r.composites.A1; })), baseA3 = rankDesc(agg);
      var RA1 = [], RA3 = [], RS = [];
      var dwBase = DIM.map(function (d) { return cfg.dimensionWeights[d]; });
      for (var s = 0; s < nsim; s++) {
        var w = wBase.map(function (v) { return v * rng.uniform(0.5, 1.5); });
        RA1.push(rankDesc(a1WithWeights(X, w)));
        var wd = dwBase.map(function (v) { return v * rng.uniform(0.5, 1.5); });
        RA3.push(rankDesc(a3WithWeights(Dm, wd)));
        var ex = IND.map(function () { return rng.exponential(); });
        RS.push(rankDesc(a1WithWeights(X, ex)));
      }
      mc = { nsim: nsim, seed: options.seed === undefined ? 20260922 : options.seed, prng: 'xoshiro128** (splitmix32 seeding)',
        A1_pm50: mcSummary(RA1, baseA1), A3_pm50: mcSummary(RA3, baseA3), A1_simplex: mcSummary(RS, baseA1) };
    }
    return {
      schema: 'todsphere.nppe.robustness/1', software: clone(SOFTWARE), config: configSummary(cfg),
      stations: results.map(function (r) { return r.station.name; }),
      weights: { schemes: schemes, ranks: wRanks, kendall: wKW, rhoVsDefault: rhoVsDefault },
      mcdm: { ranks: mRanks, kendall: mKW, spearman: rhoM, rhoMin: Math.min.apply(null, off), rhoMean: mean(off), bordaRanks: rankDesc(borda) },
      montecarlo: mc
    };
  }

  /**
   * Catchment-radius sensitivity: rows = [{station, radius, T..Q}] (indicator scores per radius).
   * Returns Spearman correlations between each pair of radii for indicators, dimensions and composites.
   */
  function radiusSensitivity(rows, config) {
    var cfg = resolveConfig(config), byR = {};
    rows.forEach(function (r) { (byR[r.radius] = byR[r.radius] || {})[r.station] = r; });
    var radii = Object.keys(byR).map(Number).sort(function (a, b) { return a - b; });
    var comp = {};
    radii.forEach(function (rad) {
      comp[rad] = {};
      Object.keys(byR[rad]).forEach(function (st) {
        var res = aggregate(byR[rad][st], cfg), o = {};
        IND.forEach(function (k) { o[k] = res.scores[k]; }); DIM.forEach(function (d) { o[d] = res.dimensions[d]; });
        o.A1 = res.composites.A1; o.A3 = res.composites.A3; comp[rad][st] = o;
      });
    });
    var pairs = {}, levels = {};
    radii.forEach(function (rad) {
      var sts = Object.keys(comp[rad]);
      levels[rad] = { A1_mean: mean(sts.map(function (s) { return comp[rad][s].A1; })), A3_mean: mean(sts.map(function (s) { return comp[rad][s].A3; })) };
    });
    for (var i = 0; i < radii.length; i++) for (var j = i + 1; j < radii.length; j++) {
      var a = radii[i], b = radii[j], sts = Object.keys(comp[a]).filter(function (s) { return comp[b][s]; }), o = {};
      ['A1', 'A3'].concat(DIM, IND).forEach(function (k) { o[k] = spearman(sts.map(function (s) { return comp[a][s][k]; }), sts.map(function (s) { return comp[b][s][k]; })); });
      pairs[a + '-' + b] = o;
    }
    return { radii: radii, pairs: pairs, levels: levels };
  }

  /**
   * Seasonal sensitivity of Q, E and the composites (manuscript test iv).
   * stations: [{station, T..G (scores), increments:{pm25,pm10,no2}, cell}] ; backgrounds: {month: {cell: {pm25,pm10,no2}}}
   */
  function seasonalSensitivity(stations, baseline, backgrounds, config) {
    var cfg = resolveConfig(config);
    var baseRes = stations.map(function (st) { var ind = Object.assign({}, st.scores, { Q: airQualityScore(baseline[st.cell], st.increments, cfg).score }); return aggregate(ind, cfg); });
    var bA1 = baseRes.map(function (r) { return r.composites.A1; }), bA3 = baseRes.map(function (r) { return r.composites.A3; });
    return Object.keys(backgrounds).sort().map(function (month) {
      var res = stations.map(function (st) {
        var q = airQualityScore(backgrounds[month][st.cell], st.increments, cfg).score;
        return aggregate(Object.assign({}, st.scores, { Q: q }), cfg);
      });
      var Q = res.map(function (r) { return r.scores.Q; });
      var bg = stations.map(function (st) { return backgrounds[month][st.cell]; });
      return { month: month,
        bg_pm25: mean(bg.map(function (b) { return b.pm25; })), bg_pm10: mean(bg.map(function (b) { return b.pm10; })), bg_no2: mean(bg.map(function (b) { return b.no2; })),
        Q_mean: mean(Q), Q_sd: sd(Q, 1), E_mean: mean(res.map(function (r) { return r.dimensions.E; })),
        A1_mean: mean(res.map(function (r) { return r.composites.A1; })), A3_mean: mean(res.map(function (r) { return r.composites.A3; })),
        rho_A1: spearman(res.map(function (r) { return r.composites.A1; }), bA1), rho_A3: spearman(res.map(function (r) { return r.composites.A3; }), bA3) };
    });
  }

  /** Single-station weight sensitivity (Monte Carlo, ±50% as in the manuscript; seeded). */
  function stationWeightSensitivity(result, config, options) {
    var cfg = resolveConfig(config); options = options || {};
    var nsim = options.nsim || 10000, rng = createRng(options.seed === undefined ? 20260922 : options.seed);
    var s = scoresOf(result.indicators || result.scores); validateScores(s);
    var dims = result.dimensions || dimensionScores(s, cfg);
    var wBase = IND.map(function (k) { return cfg.weights[k]; }), dwBase = DIM.map(function (d) { return cfg.dimensionWeights[d]; });
    var x = IND.map(function (k) { return s[k]; }), dv = DIM.map(function (d) { return dims[d]; });
    var a1 = [], a3 = [], wn = IND.map(function () { return []; });
    for (var i = 0; i < nsim; i++) {
      var w = wBase.map(function (v) { return v * rng.uniform(0.5, 1.5); });
      var tw = w.reduce(function (p, v) { return p + v; }, 0);
      w.forEach(function (v, j) { wn[j].push(v / tw); });
      a1.push(a1WithWeights([x], w)[0]);
      var wd = dwBase.map(function (v) { return v * rng.uniform(0.5, 1.5); });
      a3.push(a3WithWeights([dv], wd)[0]);
    }
    function sum(v) { var m = mean(v), sdv = sd(v, 1); return { mean: m, sd: sdv, cv: m ? sdv / m : null, min: Math.min.apply(null, v), max: Math.max.apply(null, v), p05: percentile(v, 5), p95: percentile(v, 95) }; }
    // Influence of each indicator weight on A1: Pearson r between its normalised weight and A1 across draws.
    var influence = {};
    IND.forEach(function (k, j) { influence[k] = pearson(wn[j], a1); });
    return { nsim: nsim, seed: options.seed === undefined ? 20260922 : options.seed, perturbation: '±50% uniform, renormalised', A1: sum(a1), A3: sum(a3),
      weightInfluenceA1: influence, samplesA1: options.keepSamples ? a1 : undefined, samplesA3: options.keepSamples ? a3 : undefined };
  }

  // ---------------------------------------------------------------------------
  // Actual-vs-Perceived module (TODSphere perception module; NOT part of the NPPE manuscript)
  // ---------------------------------------------------------------------------
  var PERCEPTION_DEFAULTS = deepFreeze({ consonanceThreshold: 20, highlightThreshold: 15, compositeGapHigh: 25, compositeGapMedium: 10, classificationMidpoint: 50 });
  var perception = {
    note: 'Perceived scores are user-provided Likert ratings. Comparisons with the calculated NPPE indicators are diagnostic; they are not external validation of the NPPE method.',
    likertToScore: function (v) {
      var n = typeof v === 'string' ? Number(v.trim()) : v;
      if (!isFiniteNumber(n) || n < 1 || n > 5) return null;
      return ((n - 1) / 4) * 100;
    },
    /** Aggregate Likert rows [{T:4, D:3, ...}] -> mean score (0–100), sd, n and 95% CI per indicator; invalid cells are counted, never imputed. */
    aggregateResponses: function (rows, keys) {
      keys = keys || IND;
      var out = {};
      keys.forEach(function (k) {
        var vals = [], invalid = 0, missing = 0;
        (rows || []).forEach(function (r) {
          var raw = r ? r[k] : undefined;
          if (raw === undefined || raw === null || raw === '') { missing++; return; }
          var sc = perception.likertToScore(raw);
          if (sc === null) invalid++; else vals.push(sc);
        });
        var n = vals.length, m = n ? mean(vals) : null, s = n > 1 ? sd(vals, 1) : null;
        out[k] = { n: n, mean: m, sd: s, ci95: (n > 1) ? [m - 1.96 * s / Math.sqrt(n), m + 1.96 * s / Math.sqrt(n)] : null, invalid: invalid, missing: missing };
      });
      return out;
    },
    /** Compare the calculated result with perceived indicator scores (0–100). */
    compare: function (actual, perceivedScores, config, thresholds) {
      var cfg = resolveConfig(config), th = Object.assign({}, PERCEPTION_DEFAULTS, thresholds || {});
      var p = {}; IND.forEach(function (k) { p[k] = perceivedScores ? perceivedScores[k] : undefined; });
      validateScores(p, 'Perceived');
      var perc = aggregate(p, cfg), act = actual.schema === RESULT_SCHEMA ? actual : scoreStation({ indicators: actual }, cfg);
      var rows = {};
      IND.forEach(function (k) {
        var a = act.scores[k], q = perc.scores[k], gap = q - a;
        rows[k] = { actual: a, perceived: q, gap: gap, absGap: Math.abs(gap), consonant: Math.abs(gap) < th.consonanceThreshold,
          direction: Math.abs(gap) < th.consonanceThreshold ? 'consonant' : (a > q ? 'calculated higher than perceived' : 'perceived higher than calculated') };
      });
      var dims = {};
      DIM.forEach(function (d) { var a = act.dimensions[d], q = perc.dimensions[d]; dims[d] = { actual: a, perceived: q, gap: q - a }; });
      var aAvg = mean(IND.map(function (k) { return act.scores[k]; })), pAvg = mean(IND.map(function (k) { return perc.scores[k]; })), mid = th.classificationMidpoint;
      var cls = aAvg >= mid && pAvg >= mid ? 'Consonant TOD' : aAvg < mid && pAvg < mid ? 'Consonant non-TOD' : aAvg < mid ? 'Dissonant (perceived > calculated)' : 'Dissonant (calculated > perceived)';
      var gapA1 = perc.composites.A1 - act.composites.A1;
      return { note: perception.note, thresholds: th, indicators: rows, dimensions: dims,
        composites: { actual: clone(act.composites), perceived: clone(perc.composites), gapA1: gapA1,
          gapClass: Math.abs(gapA1) > th.compositeGapHigh ? 'high' : Math.abs(gapA1) > th.compositeGapMedium ? 'medium' : 'low' },
        perceivedDiagnostics: perc.diagnostics, classification: cls, calculatedMean: aAvg, perceivedMean: pAvg };
    },
    /** Exploratory fusion Dual = alpha * calculated + (1 - alpha) * perceived (not part of the NPPE manuscript). */
    fuse: function (alpha, calculated, perceived) {
      if (!isFiniteNumber(alpha) || alpha < 0 || alpha > 1) throw NPPEError('INVALID_INPUT', 'alpha must be in [0, 1]');
      if (!isFiniteNumber(calculated) || !isFiniteNumber(perceived)) throw NPPEError('MISSING_DATA', 'Both calculated and perceived composites are required');
      return alpha * calculated + (1 - alpha) * perceived;
    },
    /** Heuristic alpha suggestions (three heuristics and their spread). Exploratory only. */
    alphaHeuristics: function (calculatedScores, perceivedScores) {
      var g = IND.map(function (k) { return Math.max(calculatedScores[k], 1) / 100; }), p = IND.map(function (k) { return Math.max(perceivedScores[k], 1) / 100; });
      var gs = g.reduce(function (a, b) { return a + b; }, 0), ps = p.reduce(function (a, b) { return a + b; }, 0);
      var pg = g.map(function (v) { return v / gs; }), pp = p.map(function (v) { return v / ps; }), m = pg.map(function (v, i) { return (v + pp[i]) / 2; });
      function kl(a, b) { return a.reduce(function (s, v, i) { return s + (v > 0 && b[i] > 0 ? v * Math.log(v / b[i]) : 0); }, 0); }
      var kg = kl(pg, m), kp = kl(pp, m), jsd = (kg + kp) > 0 ? kp / (kg + kp) : 0.5;
      function ent(a) { return -a.reduce(function (s, v) { return s + (v > 0 ? v * Math.log(v) : 0); }, 0); }
      var hg = ent(pg), hp = ent(pp), er = (hg + hp) > 0 ? hg / (hg + hp) : 0.5;
      var bm = { T: 60, D: 50, L: 50, W: 50, A: 50, G: 40, Q: 50 }, met = IND.filter(function (k) { return calculatedScores[k] >= bm[k]; }).length;
      var cr = 0.3 + (met / IND.length) * 0.4, all = [jsd, er, cr], mn = mean(all), sdv = sd(all, 0);
      return { jsd: jsd, entropyRatio: er, criterionReferenced: cr, mean: mn, sd: sdv, range: [Math.max(0, mn - 1.96 * sdv), Math.min(1, mn + 1.96 * sdv)],
        note: 'Heuristic spread of three alpha heuristics (mean ± 1.96 SD of three values); not a statistical confidence interval.' };
    }
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    SOFTWARE: SOFTWARE, METHODOLOGY: METHODOLOGY, RESULT_SCHEMA: RESULT_SCHEMA,
    INDICATORS: INDICATORS, DIMENSIONS: DIMENSIONS, NETWORK: NETWORK,
    PAPER_CONFIG: PAPER_CONFIG, PRESETS: PRESETS, DEFAULT_CONFIG: DEFAULT_CONFIG,
    createConfig: createConfig, validateConfig: validateConfig, searchHalfSide: searchHalfSide,
    buildOverpassQueries: buildOverpassQueries, mergeElements: mergeElements, classifyElements: classifyElements, featureCounts: featureCounts,
    networkStations: networkStations, nearestNetworkStation: nearestNetworkStation,
    computeIndicators: computeIndicators, nearRoadInputs: function (F, lat, lon, radius, config, ov) { return nearRoadInputs(F, lat, lon, radius, resolveConfig(config), ov); },
    nearRoadIncrements: function (inputs, config) { return nearRoadIncrements(inputs, resolveConfig(config)); },
    airQualityScore: airQualityScore, fallbackBackground: fallbackBackground,
    aggregate: aggregate, scoreStation: scoreStation, rankStations: rankStations, typology: typology,
    robustness: robustness, radiusSensitivity: radiusSensitivity, seasonalSensitivity: seasonalSensitivity,
    stationWeightSensitivity: stationWeightSensitivity,
    weightSchemes: { entropy: weightsEntropy, critic: weightsCRITIC, merec: weightsMEREC }, MCDM: MCDM, MCDM_ORDER: MCDM_ORDER,
    stats: { mean: mean, sd: sd, rankData: rankData, rankDesc: rankDesc, spearman: spearman, pearson: pearson, percentile: percentile, median: median, kendallW: kendallW, chi2Survival: chi2Survival, describe: describe, createRng: createRng },
    perception: perception, PERCEPTION_DEFAULTS: PERCEPTION_DEFAULTS,
    gradeBand: gradeBand, format: format,
    util: { hav: hav, bbox: bbox, area: area, clamp: cl, round: round, canonicalJSON: canonicalJSON, hash: fnv1a64, clone: clone }
  };
}));
