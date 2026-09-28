#!/usr/bin/env node
'use strict';
/**
 * TODSphere local server: serves the browser application and a versioned JSON API backed by the
 * same authoritative engine (src/nppe-engine.js) that the browser uses. Zero dependencies.
 *
 *   node server/server.js            # http://127.0.0.1:8080
 *   PORT=9000 HOST=0.0.0.0 node server/server.js
 *
 * API endpoints are defined below under the versioned /api/v1 routes.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const NPPE = require('../src/nppe-engine.js');
const IO = require('../src/nppe-io.js');
const PAPER = require('../src/nppe-paper.js');
const DATA = require('../src/paper-data.js');

const ROOT = path.resolve(__dirname, '..');
const API_VERSION = 'v1';
const LIMITS = { bodyDefault: 1 << 20, bodyScore: 16 << 20, stations: 500, nsimMax: 20000, elements: 200000 };
const STATIC_ALLOW = [/^\/index\.html$/, /^\/src\/[\w.-]+\.js$/, /^\/lib\/[\w./-]+$/, /^\/fonts\/[\w.-]+\.ttf$/, /^\/favicon\.ico$/];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.tex': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };

class ApiError extends Error { constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details || null; } }

function send(res, status, body, headers) {
  const isStr = typeof body === 'string' || Buffer.isBuffer(body);
  const payload = isStr ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, Object.assign({ 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
    'X-TODSphere-Version': NPPE.SOFTWARE.version, 'X-NPPE-Methodology': NPPE.METHODOLOGY.id + '/' + NPPE.METHODOLOGY.version }, headers || {}));
  res.end(payload);
}
function sendError(res, e) {
  const status = e.status || (e.name === 'NPPEError' ? 422 : 500);
  const code = e.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
  if (status === 500) console.error('[TODSphere] internal error:', e);
  send(res, status, { error: { code, message: status === 500 ? 'Internal server error' : e.message, details: e.details || null }, software: NPPE.SOFTWARE });
}

function readJSON(req, limit) {
  return new Promise((resolve, reject) => {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (!ct.startsWith('application/json')) return reject(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds ' + limit + ' bytes'));
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds ' + limit + ' bytes')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return reject(new ApiError(400, 'EMPTY_BODY', 'A JSON request body is required'));
      try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object'); resolve(v); }
      catch (err) { reject(new ApiError(400, 'INVALID_JSON', 'Request body is not a valid JSON object')); }
    });
    req.on('error', reject);
  });
}

function buildConfig(body) {
  if (body.config === undefined || body.config === null) return NPPE.createConfig();
  if (typeof body.config === 'string') {
    const p = NPPE.PRESETS[body.config];
    if (!p) throw new ApiError(422, 'UNKNOWN_PRESET', 'Unknown configuration preset "' + body.config + '"', { presets: Object.keys(NPPE.PRESETS) });
    return NPPE.createConfig(p.overrides, { id: body.config, label: p.label });
  }
  if (typeof body.config !== 'object' || Array.isArray(body.config)) throw new ApiError(422, 'INVALID_CONFIG', 'config must be a preset name or an object of overrides');
  const allowed = ['weights', 'dimensionWeights', 'catchment', 'air', 'experimental'];
  const extra = Object.keys(body.config).filter((k) => allowed.indexOf(k) < 0);
  if (extra.length) throw new ApiError(422, 'INVALID_CONFIG', 'Unsupported configuration key(s): ' + extra.join(', '), { allowed });
  return NPPE.createConfig(body.config);
}
function num(v, name, min, max) {
  if (typeof v !== 'number' || !isFinite(v)) throw new ApiError(422, 'INVALID_INPUT', name + ' must be a finite number');
  if ((min !== undefined && v < min) || (max !== undefined && v > max)) throw new ApiError(422, 'INVALID_INPUT', name + ' must be between ' + min + ' and ' + max);
  return v;
}
function stationInput(body) {
  const input = {};
  if (body.station !== undefined) {
    if (typeof body.station !== 'object' || Array.isArray(body.station)) throw new ApiError(422, 'INVALID_INPUT', 'station must be an object');
    input.station = { id: body.station.id, name: body.station.name !== undefined ? String(body.station.name).slice(0, 200) : undefined, lat: body.station.lat, lon: body.station.lon };
  }
  if (body.indicators) { input.indicators = body.indicators; return input; }
  if (body.elements || body.features) {
    if (!body.location) throw new ApiError(422, 'INVALID_INPUT', 'location {lat, lon} is required with elements/features');
    input.location = { lat: num(body.location.lat, 'location.lat', -90, 90), lon: num(body.location.lon, 'location.lon', -180, 180) };
    if (body.radius !== undefined) input.radius = num(body.radius, 'radius', 100, 5000);
    if (!body.background) throw new ApiError(422, 'MISSING_DATA', 'background {pm25, pm10, no2} (µg/m³) is required to compute Q');
    input.background = { pm25: num(body.background.pm25, 'background.pm25', 0, 2000), pm10: num(body.background.pm10, 'background.pm10', 0, 5000), no2: num(body.background.no2, 'background.no2', 0, 2000) };
    if (body.elements) {
      if (!Array.isArray(body.elements)) throw new ApiError(422, 'INVALID_INPUT', 'elements must be an array of Overpass elements');
      if (body.elements.length > LIMITS.elements) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Too many elements (max ' + LIMITS.elements + ')');
      input.features = NPPE.classifyElements(body.elements);
    } else input.features = body.features;
    input.provenance = { source: 'api', osmBase: body.osmBase || null, aqSource: body.backgroundSource || 'supplied by API client' };
    return input;
  }
  throw new ApiError(422, 'INVALID_INPUT', 'Provide "indicators" {T,D,L,W,A,G,Q} or "elements" (Overpass JSON elements) with "location" and "background"');
}
function stationsList(body) {
  if (!Array.isArray(body.stations) || body.stations.length === 0) throw new ApiError(422, 'INVALID_INPUT', 'stations must be a non-empty array of {name, indicators}');
  if (body.stations.length > LIMITS.stations) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'At most ' + LIMITS.stations + ' stations');
  return body.stations.map((s, i) => {
    if (!s || typeof s !== 'object' || !s.indicators) throw new ApiError(422, 'INVALID_INPUT', 'stations[' + i + '] needs an indicators object');
    return { id: s.id !== undefined ? s.id : i + 1, name: s.name !== undefined ? String(s.name).slice(0, 200) : 'Station ' + (i + 1), lat: s.lat, lon: s.lon, indicators: s.indicators };
  });
}

const reproCache = new Map();
function paperReproduction(nsim, seed) {
  const key = nsim + ':' + seed;
  if (!reproCache.has(key)) {
    const cfg = NPPE.createConfig(), r = PAPER.reproduce(DATA, cfg, { nsim, seed });
    reproCache.set(key, { verification: PAPER.verify(DATA, r), ranking: r.ranking, robustness: r.robustness, radius: r.radius, seasonal: r.seasonal, annualQ: r.annualQ });
    if (reproCache.size > 8) reproCache.delete(reproCache.keys().next().value);
  }
  return reproCache.get(key);
}

const routes = {
  'GET /api/v1/health': async () => ({ status: 'ok', software: NPPE.SOFTWARE, methodology: { id: NPPE.METHODOLOGY.id, version: NPPE.METHODOLOGY.version }, time: new Date().toISOString() }),
  'GET /api/v1/methodology': async () => ({ software: NPPE.SOFTWARE, methodology: NPPE.METHODOLOGY, indicators: NPPE.INDICATORS, dimensions: NPPE.DIMENSIONS,
    paperConfig: NPPE.PAPER_CONFIG, presets: Object.fromEntries(Object.entries(NPPE.PRESETS).map(([k, v]) => [k, v.label])),
    indicatorDefinitions: IO.methodologyRows().map((r) => ({ code: r[0], name: r[1], dimension: r[2], definition: r[3], weight: r[4] })) }),
  'POST /api/v1/config/validate': async (req) => { const body = await readJSON(req, LIMITS.bodyDefault); const c = buildConfig(body); return { valid: true, config: { id: c.id, label: c.label, mode: c.mode, hash: c.hash, deviations: c.deviations } }; },
  'POST /api/v1/score': async (req, q) => {
    const body = await readJSON(req, LIMITS.bodyScore), cfg = buildConfig(body);
    const result = NPPE.scoreStation(stationInput(body), cfg, { timestamp: body.timestamp });
    if (q.format === 'csv') return { __raw: IO.resultToCSV(result), type: 'text/csv; charset=utf-8', filename: IO.fileStem(result) + '.csv' };
    return result;
  },
  'POST /api/v1/air-quality': async (req) => {
    const body = await readJSON(req, LIMITS.bodyDefault), cfg = buildConfig(body);
    if (!body.background) throw new ApiError(422, 'MISSING_DATA', 'background {pm25, pm10, no2} is required');
    let inc = body.increments;
    if (!inc && body.nearRoad) {
      const nr = body.nearRoad;
      const aadt = nr.aadt !== undefined ? num(nr.aadt, 'nearRoad.aadt', 0, 1e7) : (cfg.air.aadt[nr.roadClass] !== undefined ? cfg.air.aadt[nr.roadClass] * cfg.air.urbanFactor : null);
      if (aadt === null) throw new ApiError(422, 'INVALID_INPUT', 'nearRoad needs aadt or a roadClass in ' + Object.keys(cfg.air.aadt).join(', '));
      inc = NPPE.nearRoadIncrements({ majorRoadDistance_m: num(nr.distance, 'nearRoad.distance', 0, 1e7), aadt, roadDensity: nr.roadDensity === undefined ? 0 : num(nr.roadDensity, 'nearRoad.roadDensity', 0, 1e4) }, cfg);
    }
    if (!inc) throw new ApiError(422, 'MISSING_DATA', 'Provide increments {pm25, pm10, no2} or nearRoad {distance, roadClass|aadt, roadDensity}');
    const out = NPPE.airQualityScore(body.background, inc, cfg);
    return { Q: out.score, ratio: out.ratio, totals: out.totals, increments: { pm25: inc.pm25, pm10: inc.pm10, no2: inc.no2 }, saturatedAtZero: out.saturatedAtZero, exceedances: out.exceedances,
      config: { mode: cfg.mode, hash: cfg.hash, emissionFactors: cfg.air.emissionFactors }, note: 'Screening signal of relative near-road exposure; not a predicted concentration.' };
  },
  'POST /api/v1/rank': async (req, q) => {
    const body = await readJSON(req, LIMITS.bodyDefault), cfg = buildConfig(body);
    const k = body.options && body.options.typologyK !== undefined ? num(body.options.typologyK, 'options.typologyK', 2, 10) : 4;
    const rk = NPPE.rankStations(stationsList(body), cfg, { typologyK: k, timestamp: body.timestamp });
    if (q.format === 'csv') return { __raw: IO.rankingToCSV(rk), type: 'text/csv; charset=utf-8', filename: 'TODSphere_ranking.csv' };
    return rk;
  },
  'POST /api/v1/robustness': async (req) => {
    const body = await readJSON(req, LIMITS.bodyDefault), cfg = buildConfig(body), o = body.options || {};
    const nsim = o.nsim === undefined ? 10000 : num(o.nsim, 'options.nsim', 100, LIMITS.nsimMax);
    const seed = o.seed === undefined ? 20260922 : num(o.seed, 'options.seed', 0, 4294967295);
    const st = stationsList(body);
    if (st.length < 3) throw new ApiError(422, 'INSUFFICIENT_DATA', 'Robustness analysis needs at least 3 stations');
    return NPPE.robustness(st, cfg, { nsim: Math.round(nsim), seed: Math.round(seed), montecarlo: o.montecarlo !== false });
  },
  'GET /api/v1/paper/reproduce': async (req, q) => {
    const nsim = q.nsim === undefined ? 10000 : num(Number(q.nsim), 'nsim', 100, LIMITS.nsimMax);
    const seed = q.seed === undefined ? 20260922 : num(Number(q.seed), 'seed', 0, 4294967295);
    return paperReproduction(Math.round(nsim), Math.round(seed));
  },
  'GET /api/v1/paper/dataset': async () => DATA
};

function serveStatic(req, res, pathname) {
  if (pathname === '/' ) pathname = '/index.html';
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (e) { return send(res, 400, { error: { code: 'BAD_PATH', message: 'Malformed path' } }); }
  if (decoded.includes('\0') || decoded.includes('..') || !STATIC_ALLOW.some((re) => re.test(decoded))) return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  const file = path.join(ROOT, decoded);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    let u;
    try { u = new URL(req.url, 'http://localhost'); } catch (e) { return send(res, 400, { error: { code: 'BAD_REQUEST', message: 'Malformed URL' } }); }
    u.query = Object.fromEntries(u.searchParams);
    const p = u.pathname.replace(/\/+$/, '') || '/';
    if (p.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const handler = routes[req.method + ' ' + p];
      if (!handler) {
        const exists = Object.keys(routes).some((k) => k.endsWith(' ' + p));
        return sendError(res, exists ? new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method ' + req.method + ' not allowed on ' + p) : new ApiError(404, 'NOT_FOUND', 'Unknown API endpoint ' + p, { apiVersion: API_VERSION, endpoints: Object.keys(routes) }));
      }
      try {
        const out = await handler(req, u.query || {});
        if (out && out.__raw !== undefined) return send(res, 200, out.__raw, { 'Content-Type': out.type, 'Content-Disposition': 'attachment; filename="' + out.filename + '"' });
        return send(res, 200, out);
      } catch (e) { return sendError(res, e); }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Static files support GET and HEAD only' } });
    return serveStatic(req, res, p);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080), host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => {
    console.log('TODSphere ' + NPPE.SOFTWARE.version + ' (' + NPPE.METHODOLOGY.id + ' v' + NPPE.METHODOLOGY.version + ') serving http://' + host + ':' + port + '/');
    console.log('API: http://' + host + ':' + port + '/api/v1/health');
  });
}

module.exports = { createServer, LIMITS, API_VERSION };
