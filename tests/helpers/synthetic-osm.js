'use strict';
// Seeded generator of synthetic Overpass responses (queries A and B) around a location.
// Used to compare the engine with the paper build and to exercise edge cases.

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ROAD_CLASSES = ['motorway', 'motorway_link', 'trunk', 'primary', 'primary_link', 'secondary', 'tertiary', 'residential', 'unclassified', 'pedestrian', 'footway', 'cycleway', 'path'];
const AMENITIES = ['school', 'kindergarten', 'college', 'university', 'hospital', 'clinic', 'pharmacy', 'doctors', 'bank', 'atm', 'restaurant', 'cafe', 'fast_food', 'marketplace'];
const LANDUSE = ['residential', 'commercial', 'industrial', 'retail'];
const LEISURE = ['park', 'playground', 'garden'];

function offset(lat, lon, dx, dy) { return { lat: lat + dy / 111000, lon: lon + dx / (111000 * Math.cos(lat * Math.PI / 180)) }; }

/**
 * @returns {{A: object[], B: object[]}} Overpass-style elements
 * opts: {seed, lat, lon, extent (m), density (0..1 multiplier), emptyProbability}
 */
function generate(opts) {
  const r = rng(opts.seed || 1), lat = opts.lat, lon = opts.lon, ext = opts.extent || 2500, dens = opts.density === undefined ? 1 : opts.density;
  let id = 1;
  const pt = () => offset(lat, lon, (r() * 2 - 1) * ext, (r() * 2 - 1) * ext);
  const n = (k) => Math.floor(r() * k * dens);
  const A = [], B = [];
  for (let i = 0, m = n(4); i < m; i++) { const p = pt(); A.push({ type: 'node', id: id++, lat: p.lat, lon: p.lon, tags: { railway: r() < 0.5 ? 'station' : 'subway_entrance' } }); }
  for (let i = 0, m = n(14); i < m; i++) { const p = pt(); A.push({ type: 'node', id: id++, lat: p.lat, lon: p.lon, tags: r() < 0.8 ? { highway: 'bus_stop' } : { amenity: 'bus_station' } }); }
  for (let i = 0, m = n(900); i < m; i++) { const p = offset(lat, lon, (r() * 2 - 1) * (opts.radius || 800), (r() * 2 - 1) * (opts.radius || 800)); const t = { building: r() < 0.7 ? 'yes' : 'residential' }; if (r() < 0.03) t.shop = 'supermarket'; A.push({ type: 'way', id: id++, center: p, tags: t }); }
  for (let i = 0, m = n(80); i < m; i++) { const p = pt(); A.push({ type: r() < 0.7 ? 'node' : 'way', id: id++, lat: p.lat, lon: p.lon, tags: { shop: 'convenience' } }); }
  for (let i = 0, m = n(60); i < m; i++) { const p = pt(); const t = { amenity: AMENITIES[Math.floor(r() * AMENITIES.length)] }; if (r() < 0.2) t.building = 'yes'; A.push({ type: 'node', id: id++, lat: p.lat, lon: p.lon, tags: t }); }
  for (let i = 0, m = n(30); i < m; i++) { const p = pt(); A.push({ type: 'way', id: id++, center: p, tags: { leisure: LEISURE[Math.floor(r() * 3)] } }); }
  for (let i = 0, m = n(40); i < m; i++) { const p = pt(); A.push({ type: 'way', id: id++, center: p, tags: { landuse: LANDUSE[Math.floor(r() * 4)] } }); }
  // an element without coordinates (e.g. relation without center) must not crash anything
  A.push({ type: 'relation', id: id++, tags: { amenity: 'hospital' } });
  for (let i = 0, m = n(260); i < m; i++) {
    const cls = ROAD_CLASSES[Math.floor(r() * ROAD_CLASSES.length)], k = 1 + Math.floor(r() * 7), start = pt(), geom = [start];
    for (let j = 1; j < k; j++) { const prev = geom[j - 1]; geom.push(offset(prev.lat, prev.lon, (r() * 2 - 1) * 150, (r() * 2 - 1) * 150)); }
    B.push({ type: 'way', id: id++, tags: { highway: cls }, geometry: geom.map((g) => ({ lat: g.lat, lon: g.lon })) });
  }
  if (r() < 0.2) B.push({ type: 'way', id: id++, tags: { highway: 'primary' }, geometry: [] });
  return { A, B };
}

module.exports = { generate, rng, offset };
