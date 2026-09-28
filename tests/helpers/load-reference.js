'use strict';
// Extracts the scoring functions of the TODSphere build that produced the manuscript's
// station_indicators.csv (reference/tod-calculator-v2-paper-build.html) and evaluates them in an
// isolated VM context, so tests can compare the engine with the original code on identical inputs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.resolve(__dirname, '..', '..', 'reference', 'tod-calculator-v2-paper-build.html');

function sliceBalanced(src, start, open, close) {
  let depth = 0, i = src.indexOf(open, start);
  for (; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced block at ' + start);
}
function fn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('reference function not found: ' + name);
  return sliceBalanced(src, start, '{', '}');
}

function loadReference() {
  const html = fs.readFileSync(FILE, 'utf8');
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const metroStart = script.indexOf('const METRO_LINES = [');
  const metro = sliceBalanced(script, metroStart, '[', ']') + ';';
  const utils = ['hav', 'area', 'cl', 'getAADT', 'rew'].map((n) => fn(script, n)).join('\n');
  const d2r = script.match(/const d2r=.*?;/)[0];
  const ef = script.match(/const EF=\{.*?\}\};/)[0];
  const calc = ['calcTransit', 'calcDensity', 'calcDiversity', 'calcWalk', 'calcAmenity', 'calcGreen', 'calcAir', 'composite'].map((n) => fn(script, n)).join('\n');
  const procSrc = fn(script, 'proc');
  const code = [metro, d2r, utils, ef, calc,
    'function classify(els){const res={metro:[],bus:[],buildings:[],shops:[],schools:[],colleges:[],healthcare:[],green:[],banks:[],food:[],roads:[],landuse:[]};' + procSrc + ' proc(els); return res;}',
    'globalThis.__ref = {METRO_LINES, EF, hav, area, cl, getAADT, rew, calcTransit, calcDensity, calcDiversity, calcWalk, calcAmenity, calcGreen, calcAir, composite, classify};'
  ].join('\n');
  const ctx = { Math, Object, Array, JSON, console, R: 800, liveAQ: null, paramOverrides: null,
    W: { transit: 18, density: 16, diversity: 16, walk: 16, amenity: 12, green: 10, air: 12 } };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'tod-calculator-v2-paper-build.html' });
  const ref = ctx.__ref;
  return {
    ref,
    /** Run the paper build's scoring with a given radius and background. */
    score(elements, lat, lon, radius, background) {
      ctx.R = radius;
      ctx.liveAQ = { pm25: background.pm25, pm10: background.pm10, no2: background.no2, status: 'live' };
      const D = ref.classify(elements);
      const S = { transit: ref.calcTransit(D, lat, lon), density: ref.calcDensity(D), diversity: ref.calcDiversity(D), walk: ref.calcWalk(D, lat, lon),
        amenity: ref.calcAmenity(D, lat, lon), green: ref.calcGreen(D, lat, lon), air: ref.calcAir(D, lat, lon) };
      return { D, S, composite: ref.composite(S) };
    }
  };
}

module.exports = { loadReference, FILE };
