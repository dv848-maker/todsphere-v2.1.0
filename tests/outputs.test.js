'use strict';
// Output integrity: every download format is generated in Node, re-opened and compared with the
// engine's result, so UI, reports, CSV/XLSX/JSON/GeoJSON downloads show identical numbers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const NPPE = require('../src/nppe-engine.js');
const IO = require('../src/nppe-io.js');
const REPORT = require('../src/nppe-report.js');
const PAPER = require('../src/nppe-paper.js');
const DATA = require('../src/paper-data.js');
const XLSX = require('../lib/xlsx.full.min.js');
const { jsPDF } = require('../lib/jspdf.umd.min.js');
const { generate } = require('./helpers/synthetic-osm.js');

const CFG = NPPE.createConfig();
const LAT = 28.470953, LON = 77.512775;
const FONTS = { regular: fs.readFileSync(path.join(__dirname, '..', 'fonts', 'Inter-Regular.ttf')).toString('base64'), bold: fs.readFileSync(path.join(__dirname, '..', 'fonts', 'Inter-Bold.ttf')).toString('base64') };

function liveResult() {
  const { A, B } = generate({ seed: 42, lat: LAT, lon: LON, radius: 800 });
  return NPPE.scoreStation({ features: NPPE.classifyElements(A.concat(B)), location: { lat: LAT, lon: LON }, radius: 800, background: { pm25: 58, pm10: 93.1, no2: 10 },
    station: { name: 'Alpha 1, test' }, provenance: { osmBase: '2026-09-22T13:33:36Z', overpassServers: ['https://overpass-api.de/api/interpreter'], queryMode: 'combined', aqSource: 'Open-Meteo / CAMS', aqStatus: 'live', aqTime: '2026-09-22T15:30' } }, CFG);
}
function pdfText(buf) {
  // jsPDF writes uncompressed content streams: collect literal strings shown with Tj.
  const s = buf.toString('latin1'), out = [];
  const re = /\(((?:\\.|[^\\)])*)\)\s*Tj/g; let m;
  while ((m = re.exec(s))) out.push(m[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'));
  return out.join('\n');
}
function pdfValid(buf) {
  const s = buf.toString('latin1');
  assert.equal(s.slice(0, 5), '%PDF-');
  assert.match(s.slice(-8), /%%EOF/);
  assert.match(s, /startxref\s+\d+/);
  const pages = (s.match(/\/Type \/Page[^s]/g) || []).length;
  assert.ok(pages >= 1);
  return pages;
}

test('CSV export: RFC 4180 round-trip; values equal the engine result', () => {
  const r = liveResult(), csv = IO.resultToCSV(r), rows = IO.parseCSV(csv);
  assert.deepEqual(rows[0], ['section', 'code', 'name', 'dimension', 'value', 'weight', 'normalised_weight', 'contribution_to_A1', 'notes']);
  const get = (sec, code) => rows.find((x) => x[0] === sec && x[1] === code);
  NPPE.METHODOLOGY.indicators.forEach((k) => { assert.equal(Number(get('indicator', k)[4]), r.scores[k]); assert.equal(Number(get('indicator', k)[5]), CFG.weights[k]); });
  ['A1', 'A2', 'A3'].forEach((k) => assert.ok(Math.abs(Number(get('composite', k)[4]) - r.composites[k]) < 1e-6));
  ['N', 'P', 'Pe', 'E'].forEach((d) => assert.ok(Math.abs(Number(get('dimension', d)[4]) - r.dimensions[d]) < 1e-6));
  assert.equal(get('diagnostic', 'limiting')[4], r.diagnostics.limitingDimension);
  assert.ok(rows.some((x) => x[0] === 'metadata' && x[2] === 'Configuration hash' && x[4] === CFG.hash));
  // formula-injection protection and quoting
  assert.equal(IO.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(IO.csvCell('-3'), '-3'); assert.equal(IO.csvCell('a,b'), '"a,b"'); assert.equal(IO.csvCell(NaN), '');
});

test('JSON export: complete, parseable and identical to the engine result', () => {
  const r = liveResult(), j = JSON.parse(IO.resultToJSON(r, { perception: null }));
  assert.equal(j.schema, NPPE.RESULT_SCHEMA);
  assert.deepEqual(j.composites, r.composites); assert.deepEqual(j.scores, r.scores); assert.deepEqual(j.config, r.config);
  assert.equal(j.methodology.id, 'NPPE-7'); assert.equal(j.software.version, NPPE.SOFTWARE.version);
  assert.ok(j.provenance.computedAt && j.provenance.osmBase);
  assert.ok(!('perception' in j), 'null extras omitted');
});

test('XLSX export: workbook opens and holds the engine values', () => {
  const r = liveResult(), cmp = NPPE.perception.compare(r, { T: 50, D: 75, L: 50, W: 25, A: 100, G: 50, Q: 0 }, CFG);
  const sheets = IO.resultToXLSXSheets(r, { perception: cmp }), wb = XLSX.utils.book_new();
  Object.keys(sheets).forEach((n) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets[n]), n.slice(0, 31)));
  const back = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  assert.deepEqual(back.SheetNames.slice(0, 4), ['Indicators', 'Dimensions & composites', 'Air-quality screening', 'Actual vs Perceived']);
  const ind = XLSX.utils.sheet_to_json(back.Sheets.Indicators, { header: 1 });
  NPPE.METHODOLOGY.indicators.forEach((k, i) => { assert.equal(ind[i + 1][0], k); assert.equal(ind[i + 1][3], r.scores[k]); });
  const dc = XLSX.utils.sheet_to_json(back.Sheets['Dimensions & composites'], { header: 1 });
  assert.ok(Math.abs(dc.find((x) => /^A3/.test(x[0]))[1] - r.composites.A3) < 1e-6);
  const pv = XLSX.utils.sheet_to_json(back.Sheets['Actual vs Perceived'], { header: 1 });
  assert.equal(pv[1][0], 'T'); assert.equal(pv[1][3], 50);
});

test('GeoJSON export: valid FeatureCollection with point and catchment polygon', () => {
  const r = liveResult(), g = JSON.parse(IO.resultToGeoJSON(r));
  assert.equal(g.type, 'FeatureCollection'); assert.equal(g.features.length, 2);
  assert.deepEqual(g.features[0].geometry.coordinates, [LON, LAT]);
  assert.equal(g.features[0].properties.A1, Number(r.composites.A1.toFixed(6)));
  const ring = g.features[1].geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1], 'closed ring');
});

test('station PDF report: valid PDF whose numbers match the engine (ASCII font path)', () => {
  const r = liveResult(), cmp = NPPE.perception.compare(r, { T: 50, D: 75, L: 50, W: 25, A: 100, G: 50, Q: 0 }, CFG);
  const sens = NPPE.stationWeightSensitivity(r, CFG, { nsim: 2000, seed: 1 });
  const doc = REPORT.stationReport(jsPDF, r, { perception: cmp, sensitivity: sens, supplementary: { nmt: { label: 'NMT score', score: 41 } }, overrides: [{ name: 'Background PM2.5', old_value: 55, new_value: 60, unit: 'µg/m³', source: 'p. 3', confidence: 'high' }] });
  const buf = Buffer.from(doc.output('arraybuffer'));
  const pages = pdfValid(buf); assert.ok(pages >= 3, 'multi-page report');
  const txt = pdfText(buf), F = NPPE.format;
  [F.score1(r.composites.A1), F.score1(r.composites.A2), F.score1(r.composites.A3), F.ratio2(r.diagnostics.beta), CFG.hash, 'PAPER DEFAULT CONFIGURATION',
    'Actual (calculated) vs perceived', 'not part of the NPPE composite', 'Evidence-calibration overrides', 'Limitations'].forEach((s) => assert.ok(txt.includes(s), 'report contains ' + s));
  NPPE.METHODOLOGY.indicators.forEach((k) => assert.ok(txt.includes(F.int(r.scores[k])), k));
  assert.ok(!/[^\x00-\xff]/.test(txt), 'ASCII path contains no unsupported glyphs');
  assert.ok(txt.includes('beta'), 'Greek letters are transliterated without an embedded font');
});

test('station PDF with embedded Inter font (Unicode) and methodology/ranking PDFs are valid', () => {
  const r = liveResult();
  pdfValid(Buffer.from(REPORT.stationReport(jsPDF, r, { fonts: FONTS }).output('arraybuffer')));
  const m = Buffer.from(REPORT.methodologyReport(jsPDF, { config: CFG }).output('arraybuffer'));
  pdfValid(m);
  const mt = pdfText(m);
  ['147', '44.2', '118.1', '0.65 S_metro', 'L = min(100, 120 H/ln 8)', 'PAPER DEFAULT CONFIGURATION'].forEach((s) => assert.ok(mt.includes(s), 'methodology contains ' + s));
  const repro = PAPER.reproduce(DATA, CFG, { nsim: 1000 });
  const rk = Buffer.from(REPORT.rankingReport(jsPDF, repro.ranking, { robustness: repro.robustness, radius: repro.radius, seasonal: repro.seasonal, verification: PAPER.verify(DATA, repro), typeNames: DATA.typeNames }).output('arraybuffer'));
  pdfValid(rk);
  const rt = pdfText(rk);
  ['77.0 (2)', '21.3 (16)', '80.6 (1)', '0.962', '0.967'].forEach((s) => assert.ok(rt.includes(s), 'ranking report contains ' + s));
});

test('user-adjusted configuration is flagged in every output', () => {
  const cfg = NPPE.createConfig({ weights: { Q: 30 } });
  const r = NPPE.scoreStation({ indicators: { T: 65, D: 100, L: 78, W: 85, A: 62, G: 100, Q: 49 } }, cfg);
  assert.equal(r.config.mode, 'user-adjusted');
  assert.ok(r.dataQuality.warnings.some((w) => /deviates from the paper default/.test(w)));
  assert.ok(IO.resultToCSV(r).includes('weights.Q: 12'));
  assert.ok(pdfText(Buffer.from(REPORT.stationReport(jsPDF, r).output('arraybuffer'))).includes('USER-ADJUSTED CONFIGURATION'));
});

test('ranking CSV equals the engine ranking; station table import validates input', () => {
  const repro = PAPER.reproduce(DATA, CFG, { robustness: false });
  const rows = IO.parseCSV(IO.rankingToCSV(repro.ranking));
  assert.deepEqual(rows[0], IO.RANK_HEADER);
  repro.ranking.stations.forEach((s, i) => {
    const row = rows[i + 1];
    assert.equal(row[1], s.result.station.name);
    assert.ok(Math.abs(Number(row[IO.RANK_HEADER.indexOf('A3')]) - s.result.composites.A3) < 1e-6);
    assert.equal(Number(row[IO.RANK_HEADER.indexOf('rank_A3')]), s.ranks.A3);
  });
  // round trip: exported ranking -> import -> identical ranking
  const parsed = IO.parseStationTable(IO.rankingToCSV(repro.ranking));
  assert.equal(parsed.errors.length, 0); assert.equal(parsed.stations.length, 21);
  const again = NPPE.rankStations(parsed.stations, CFG);
  again.stations.forEach((s, i) => assert.equal(s.result.composites.A3, repro.ranking.stations[i].result.composites.A3));
  const bad = IO.parseStationTable('station,T,D,L,W,A,G,Q\nX,50,50,50,50,50,50,\nY,50,50,50,50,50,50,120\nZ,1,2,3,4,5,6,7\n');
  assert.equal(bad.stations.length, 1); assert.equal(bad.errors.length, 2);
  assert.throws(() => IO.parseStationTable('station,T,D\nx,1,2\n'), /Missing required column/);
});
