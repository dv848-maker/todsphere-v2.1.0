/*!
 * TODSphere — PDF reports (station report, ranking report, methodology sheet) built with jsPDF
 * from the engine's canonical result objects. Every number comes from the result object and is
 * formatted with the engine's shared formatter, so reports match the UI, exports and the API.
 * Works in the browser and in Node (tests generate and inspect the PDFs).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nppe-engine.js'), require('./nppe-io.js'), require('./nppe-recommendations.js'));
  else root.TODSphereReport = factory(root.TODSphereNPPE, root.TODSphereIO, root.TODSphereRecommendations);
}(typeof self !== 'undefined' ? self : this, function (NPPE, IO, REC) {
  'use strict';
  var F = NPPE.format, IND = NPPE.METHODOLOGY.indicators, DIM = NPPE.METHODOLOGY.dimensions;
  var ACCENT = [37, 99, 235];
  var WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  var ASCII_MAP = { 'β': 'beta', 'α': 'alpha', 'ρ': 'rho', 'Σ': 'Sum', 'Δ': 'd', 'ε': 'eps', 'π': 'pi', '≥': '>=', '≤': '<=', '−': '-', '→': '->', '←': '<-',
    '≈': '~', '≠': '!=', '√': 'sqrt', '∑': 'Sum', '⁶': '^6', '₂': '2', '₅': '5', '₁': '1', '₀': '0', '✓': 'yes', '✗': 'no', '⚠': '!', '∞': 'inf' };
  function ascii(s) {
    return String(s).replace(/[\s\S]/g, function (c) {
      if (ASCII_MAP[c] !== undefined) return ASCII_MAP[c];
      var code = c.charCodeAt(0);
      if (code <= 0xFF || WINANSI_EXTRA.indexOf(c) >= 0) return c;
      if (code >= 0xD800 && code <= 0xDFFF) return '';
      return '?';
    });
  }

  function Writer(jsPDF, opts) {
    opts = opts || {};
    this.doc = new jsPDF('p', 'mm', 'a4');
    this.unicode = !!(opts.fonts && opts.fonts.regular);
    if (this.unicode) {
      this.doc.addFileToVFS('Inter-Regular.ttf', opts.fonts.regular); this.doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
      if (opts.fonts.bold) { this.doc.addFileToVFS('Inter-Bold.ttf', opts.fonts.bold); this.doc.addFont('Inter-Bold.ttf', 'Inter', 'bold'); }
      this.hasBold = !!opts.fonts.bold;
    }
    this.face = this.unicode ? 'Inter' : 'helvetica';
    this.y = 18; this.lm = 15; this.w = 180; this.bottom = 280;
    this.footerText = opts.footer || '';
  }
  Writer.prototype.t = function (s) { return this.unicode ? String(s === undefined || s === null ? '' : s) : ascii(s === undefined || s === null ? '' : s); };
  Writer.prototype.font = function (style, size, color) {
    this.doc.setFont(this.face, style === 'bold' && (!this.unicode || this.hasBold) ? 'bold' : 'normal');
    if (size) this.doc.setFontSize(size);
    var c = color || [30, 30, 30]; this.doc.setTextColor(c[0], c[1], c[2]);
  };
  Writer.prototype.np = function () { this.doc.addPage(); this.y = 18; };
  Writer.prototype.chk = function (h) { if (this.y + h > this.bottom) this.np(); };
  Writer.prototype.lines = function (text, width, size) { this.doc.setFontSize(size); return this.doc.splitTextToSize(this.t(text), width); };
  Writer.prototype.h1 = function (text) {
    this.chk(16); this.y += 2; this.font('bold', 13, ACCENT); this.doc.text(this.t(text), this.lm, this.y);
    this.y += 2; this.doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]); this.doc.setLineWidth(0.4); this.doc.line(this.lm, this.y, this.lm + this.w, this.y); this.y += 6;
  };
  Writer.prototype.h2 = function (text) { this.chk(10); this.font('bold', 10.5, [40, 40, 40]); this.doc.text(this.t(text), this.lm, this.y); this.y += 5.5; };
  Writer.prototype.p = function (text, opts) {
    opts = opts || {}; var size = opts.size || 9, lh = size * 0.42;
    var l = this.lines(text, this.w - (opts.indent || 0), size);
    for (var i = 0; i < l.length; i++) { this.chk(lh + 1); this.font(opts.bold ? 'bold' : 'normal', size, opts.color || [45, 45, 45]); this.doc.text(l[i], this.lm + (opts.indent || 0), this.y); this.y += lh; }
    this.y += opts.after === undefined ? 1.8 : opts.after;
  };
  Writer.prototype.bullet = function (text) {
    var l = this.lines(text, this.w - 5, 9); this.chk(l.length * 3.8 + 1);
    this.font('normal', 9, [45, 45, 45]); this.doc.text('•', this.lm + 1, this.y); this.doc.text(l, this.lm + 5, this.y); this.y += l.length * 3.8 + 1;
  };
  Writer.prototype.note = function (text, color) {
    var l = this.lines(text, this.w - 6, 8.2), h = l.length * 3.5 + 4; this.chk(h + 2);
    var c = color || [240, 244, 255]; this.doc.setFillColor(c[0], c[1], c[2]); this.doc.rect(this.lm, this.y - 3, this.w, h, 'F');
    this.doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]); this.doc.setLineWidth(0.6); this.doc.line(this.lm, this.y - 3, this.lm, this.y - 3 + h);
    this.font('normal', 8.2, [60, 60, 70]); this.doc.text(l, this.lm + 3, this.y + 0.5); this.y += h + 2;
  };
  Writer.prototype.table = function (headers, rows, widths, opts) {
    opts = opts || {}; var self = this, size = opts.size || 7.8, lh = size * 0.4, pad = 1.2;
    var total = widths.reduce(function (a, b) { return a + b; }, 0), scale = total > this.w ? this.w / total : 1;
    widths = widths.map(function (w) { return w * scale; });
    function header() {
      var hl = headers.map(function (h, i) { return self.lines(h, widths[i] - 2 * pad, size); });
      var hh = Math.max.apply(null, hl.map(function (l) { return l.length; })) * lh + 2.6;
      self.chk(hh + 6);
      self.doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]); self.doc.rect(self.lm, self.y - 3, widths.reduce(function (a, b) { return a + b; }, 0), hh, 'F');
      self.font('bold', size, [255, 255, 255]);
      var x = self.lm; hl.forEach(function (l, i) { self.doc.text(l, x + pad, self.y); x += widths[i]; });
      self.y += hh;
    }
    header();
    rows.forEach(function (r, ri) {
      var cl = r.map(function (c, i) { return self.lines(c === null || c === undefined ? '' : c, widths[i] - 2 * pad, size); });
      var h = Math.max.apply(null, cl.map(function (l) { return l.length; })) * lh + 2.2;
      if (self.y + h > self.bottom) { self.np(); header(); }
      if (ri % 2 === 0) { self.doc.setFillColor(246, 248, 252); self.doc.rect(self.lm, self.y - 3, widths.reduce(function (a, b) { return a + b; }, 0), h, 'F'); }
      var x = self.lm;
      cl.forEach(function (l, i) { self.font(i === 0 && opts.boldFirst !== false ? 'bold' : 'normal', size, [35, 35, 35]); self.doc.text(l, x + pad, self.y); x += widths[i]; });
      self.y += h;
    });
    this.y += 3;
  };
  Writer.prototype.finish = function () {
    var n = this.doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      this.doc.setPage(i);
      this.doc.setDrawColor(200, 200, 200); this.doc.setLineWidth(0.2); this.doc.line(this.lm, 287, this.lm + this.w, 287);
      this.font('normal', 6.8, [120, 120, 120]);
      this.doc.text(this.t(this.footerText), this.lm, 291);
      this.doc.text(this.t('Page ' + i + ' of ' + n), this.lm + this.w, 291, { align: 'right' });
    }
    return this.doc;
  };
  Writer.prototype.cover = function (title, subtitle, lines, badge) {
    var d = this.doc;
    d.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]); d.rect(0, 0, 210, 44, 'F');
    this.font('bold', 20, [255, 255, 255]); d.text(this.t(title), this.lm, 17);
    this.font('normal', 11, [255, 255, 255]); d.text(this.t(subtitle), this.lm, 26);
    this.font('normal', 8.5, [230, 236, 255]);
    (lines || []).forEach(function (l, i) { d.text(this.t(l), this.lm, 33 + i * 4.2); }, this);
    if (badge) {
      var col = badge.mode === 'paper-default' ? [5, 150, 105] : badge.mode === 'experimental' ? [220, 38, 38] : [217, 119, 6];
      d.setFillColor(col[0], col[1], col[2]); d.roundedRect(140, 8, 55, 9, 2, 2, 'F');
      this.font('bold', 7.5, [255, 255, 255]); d.text(this.t(badge.text), 167.5, 13.8, { align: 'center' });
    }
    this.y = 54;
  };

  function modeText(mode) { return mode === 'paper-default' ? 'PAPER DEFAULT CONFIGURATION' : mode === 'experimental' ? 'EXPERIMENTAL CONFIGURATION' : 'USER-ADJUSTED CONFIGURATION'; }
  function footer(obj) { return 'TODSphere ' + NPPE.SOFTWARE.version + ' · ' + NPPE.METHODOLOGY.id + ' v' + NPPE.METHODOLOGY.version + ' · config ' + obj.config.mode + ' ' + obj.config.hash; }

  var LIMITATIONS = [
    'NPPE rankings are screening outputs intended to inform, not replace, planning judgement. They are not a compliance assessment and have not been validated against external outcomes such as ridership, expert assessment or perception surveys.',
    'OpenStreetMap indicators measure mapped reality. Bus stops, banks, eateries and building footprints can be incompletely mapped; zero scores may reflect mapping gaps.',
    'Q is a screening signal of relative near-road exposure from assumed traffic volumes and transferred emission factors; it is not a predicted concentration. It reaches 0 whenever the regional background exceeds the national standards.',
    'The thresholds and weights are transparent tool defaults, not calibrated values; any deviation from the paper default is recorded in this report.'
  ];

  /**
   * Station report. ctx (all optional): {fonts, perception, supplementary, rankingContext, sensitivity,
   * overrides, llmNarrative, aq, generatedAt}
   */
  function stationReport(jsPDF, result, ctx) {
    ctx = ctx || {};
    var W = new Writer(jsPDF, { fonts: ctx.fonts, footer: footer(result) }), st = result.station, c = result.composites, dg = result.diagnostics;
    var where = st.name ? st.name : (st.lat != null ? F.fixed(st.lat, 5) + '° N, ' + F.fixed(st.lon, 5) + '° E' : 'Supplied indicators');
    W.cover('TODSphere', 'NPPE station screening report', [where + ' · catchment radius ' + st.radius + ' m',
      'Generated ' + (ctx.generatedAt || new Date().toISOString()) + ' · ' + result.methodology.name],
      { mode: result.config.mode, text: modeText(result.config.mode) });

    W.h1('1. Summary');
    W.table(['Measure', 'Value', 'Reading'], [
      ['A1 — TODSphere composite (weighted arithmetic mean of 7 indicators)', F.score1(c.A1), NPPE.gradeBand(c.A1) + ' (display legend)'],
      ['A2 — arithmetic mean of the four dimensions', F.score1(c.A2), ''],
      ['A3 — geometric mean of the four dimensions (floor 1)', F.score1(c.A3), 'partially compensatory'],
      ['β — balance ratio A3/A2', F.ratio2(dg.beta), dg.beta === null ? 'undefined (A2 = 0)' : dg.beta >= 0.98 ? 'even profile' : dg.beta <= 0.7 ? 'strongly uneven profile' : 'uneven profile'],
      ['Limiting dimension', dg.limitingDimensionName + ' (' + dg.limitingDimension + ')', 'first priority for intervention'],
      ['Node–place index (N+P)/2 · gap N−P', F.score1(dg.nodePlaceIndex) + ' · ' + F.score1(dg.nodePlaceGap), dg.nodePlaceClass + ' (|N−P| ≤ 10 is balanced)']
    ], [92, 28, 60]);
    W.note('The manuscript recommends reading A3, β and the limiting dimension together and using the compensatory score A1 as a secondary, weight-sensitive summary (Section 5.2). A1 is the score displayed by TODSphere.');

    W.h1('2. Station and catchment');
    var nn = st.nearestNetworkStation;
    W.table(['Item', 'Value'], [
      ['Location', st.lat != null ? F.fixed(st.lat, 6) + ', ' + F.fixed(st.lon, 6) : 'not supplied'],
      ['Nearest metro/rail station (embedded network)', nn ? nn.name + ' (' + nn.line + '), ' + F.dist(nn.distance) : 'n/a'],
      ['Catchment', 'circle of radius r = ' + st.radius + ' m centred on the location (A = πr² = ' + F.fixed(NPPE.util.area(st.radius), 3) + ' km²)'],
      ['Search square (amenity, land use, green, roads)', 'half-side max(1.8r, 1,500 m) capped at 2,500 m = ' + F.int(st.searchHalfSide) + ' m'],
      ['Input mode', result.inputMode === 'computed-from-osm' ? 'computed from OpenStreetMap features' : 'indicator scores supplied by the user'],
      ['OSM database timestamp', (result.provenance && result.provenance.osmBase) || 'n/a'],
      ['Background air quality', (result.provenance && result.provenance.aqSource ? result.provenance.aqSource + ' (' + (result.provenance.aqStatus || '') + ', ' + (result.provenance.aqTime || '') + ')' : 'n/a')]
    ], [70, 110]);

    W.h1('3. The seven NPPE indicators');
    W.table(['Code', 'Indicator', 'Dimension', 'Score', 'Weight', 'Norm. weight', 'Contribution to A1'],
      IO.indicatorRows(result).map(function (r) { return [r.code, r.name, r.dimensionName, F.int(r.score), String(r.weight), F.fixed(r.normalisedWeight, 3), F.fixed(r.contribution, 2)]; }),
      [12, 52, 24, 16, 16, 24, 30]);
    W.h2('Dimension scores');
    W.table(['Dimension', 'Indicators', 'Score', 'Share of A1 weight'], DIM.map(function (d) {
      return [NPPE.DIMENSIONS[d].name + ' (' + d + ')', NPPE.DIMENSIONS[d].indicators.join(', '), F.score1(result.dimensions[d]), F.pct(result.weights.dimensionShareA1[d])];
    }), [45, 45, 30, 40]);
    if (result.inputMode === 'computed-from-osm') {
      W.h2('Intermediate quantities');
      W.table(['Code', 'Intermediate quantities'], IND.map(function (k) { return [k, IO.indicatorDetail(result, k)]; }), [14, 166]);
      var A = result.indicators.A;
      if (A && A.categories) {
        W.h2('Amenity accessibility by category');
        W.table(['Category', 'Weight', 'Nearest facility', 'Facilities within d1', 'Category score'], Object.keys(A.categories).map(function (k) {
          var x = A.categories[k]; return [x.label, F.fixed(x.weight, 2), x.nearest_m === null ? 'none mapped' : F.dist(x.nearest_m), String(x.countWithinD1), F.int(x.score)];
        }), [35, 20, 40, 40, 30]);
      }
    }

    var Q = result.indicators.Q;
    if (Q && Q.totals) {
      W.h1('4. Air-quality screening (Q)');
      W.table(['Pollutant', 'Background B', 'Near-road ΔC', 'Total C', 'Standard', 'Exceeds'], [
        ['PM2.5 (µg/m³)', F.fixed(Q.background.pm25, 1), F.fixed(Q.increments.pm25, 2), F.conc(Q.totals.pm25), '40', Q.exceedances.pm25 ? 'yes' : 'no'],
        ['NO2 (µg/m³)', F.fixed(Q.background.no2, 1), F.fixed(Q.increments.no2, 2), F.conc(Q.totals.no2), '40', Q.exceedances.no2 ? 'yes' : 'no'],
        ['PM10 (µg/m³)', F.fixed(Q.background.pm10, 1), F.fixed(Q.increments.pm10, 2), F.conc(Q.totals.pm10), '60', Q.exceedances.pm10 ? 'yes' : 'no']
      ], [36, 30, 30, 28, 26, 20]);
      var nr = Q.nearRoad;
      W.p('R = 0.40 C2.5/40 + 0.35 C_NO2/40 + 0.25 C10/60 = ' + F.fixed(Q.ratio, 3) + '; Q = clamp(100 − 80(R − 0.5)) = ' + Q.score + '. Nearest major road: ' + (nr.majorRoadFound ? nr.majorRoadClass + ' at ' + F.dist(nr.majorRoadDistance_m) + ' (AADT ' + F.int(nr.aadt) + ' veh/day, ' + nr.aadtSource + ')' : 'none in the search square') + '; class-weighted road-length density ρ = ' + F.fixed(nr.roadDensity, 2) + ' km/km². Emission factors (mg/veh/km): PM2.5 ' + Q.emissionFactors.pm25 + ', PM10 ' + Q.emissionFactors.pm10 + ', NO2 ' + Q.emissionFactors.no2 + '.');
      if (Q.saturatedAtZero) W.note('Q is at its floor of 0 because the background exceeds the national standards; in this state Q does not discriminate between stations (manuscript Section 5.3).', [255, 247, 237]);
      if (ctx.aq && ctx.aq.naqi) W.p('Supplementary (not used in Q): India NAQI from the live background = ' + ctx.aq.naqi.aqi + ' (' + ctx.aq.naqi.category + ', dominant ' + ctx.aq.naqi.dominant + ').', { size: 8, color: [90, 90, 90] });
    }

    var sec = 5;
    if (ctx.rankingContext) {
      var rc = ctx.rankingContext;
      W.h1(sec++ + '. Position among saved stations');
      W.p('Among ' + rc.n + ' saved station(s) scored with the same configuration: rank ' + F.rank(rc.ranks.A1) + ' on A1, ' + F.rank(rc.ranks.A3) + ' on A3 and ' + F.rank(rc.ranks.NP) + ' on the node–place index' + (rc.type ? '; typology group ' + rc.type : '') + '.');
    }
    if (ctx.sensitivity) {
      var sv = ctx.sensitivity;
      W.h1(sec++ + '. Weight sensitivity (Monte Carlo)');
      W.table(['Composite', 'Mean', 'SD', 'CV', '5th pct.', '95th pct.'], [
        ['A1 (indicator weights ±50%)', F.score1(sv.A1.mean), F.fixed(sv.A1.sd, 2), F.pct(sv.A1.cv), F.score1(sv.A1.p05), F.score1(sv.A1.p95)],
        ['A3 (dimension weights ±50%)', F.score1(sv.A3.mean), F.fixed(sv.A3.sd, 2), F.pct(sv.A3.cv), F.score1(sv.A3.p05), F.score1(sv.A3.p95)]
      ], [60, 22, 22, 22, 26, 26]);
      W.p(sv.nsim + ' draws, seed ' + sv.seed + ', each weight multiplied by U(0.5, 1.5) and renormalised (manuscript Section 3.6).', { size: 8 });
    }
    if (ctx.perception) {
      var pc = ctx.perception;
      W.h1(sec++ + '. Actual (calculated) vs perceived');
      W.note(pc.note, [255, 251, 235]);
      W.table(['Code', 'Indicator', 'Calculated', 'Perceived', 'Gap', 'Status'], IND.map(function (k) {
        var r = pc.indicators[k]; return [k, NPPE.INDICATORS[k].name, F.int(r.actual), F.score1(r.perceived), F.score1(r.gap), r.direction];
      }), [12, 50, 22, 22, 18, 56]);
      W.table(['Composite', 'Calculated', 'Perceived'], [['A1', F.score1(pc.composites.actual.A1), F.score1(pc.composites.perceived.A1)], ['A2', F.score1(pc.composites.actual.A2), F.score1(pc.composites.perceived.A2)], ['A3', F.score1(pc.composites.actual.A3), F.score1(pc.composites.perceived.A3)]], [60, 40, 40]);
      W.p('Classification (heuristic, midpoint 50): ' + pc.classification + '. Perceived responses: ' + (ctx.perceptionSample || 'n not recorded') + '.', { size: 8.5 });
      if (ctx.fusion) W.p('Exploratory dual score (not part of the NPPE method): α = ' + F.ratio2(ctx.fusion.alpha) + ' → ' + F.score1(ctx.fusion.value) + '.', { size: 8.5 });
    }
    if (ctx.supplementary && Object.keys(ctx.supplementary).length) {
      W.h1(sec++ + '. Supplementary measures (not part of the NPPE composite)');
      W.table(['Measure', 'Score', 'Note'], Object.keys(ctx.supplementary).map(function (k) { var s = ctx.supplementary[k]; return [s.label, F.int(s.score), s.note || 'legacy TODSphere measure; excluded from all composites']; }), [60, 20, 100]);
    }

    W.h1(sec++ + '. Priorities and planning prompts');
    W.p('First priority (limiting dimension): ' + REC.PRIORITY[dg.limitingDimension], { bold: true });
    IND.forEach(function (k) {
      var r = REC.forIndicator(k, result.scores[k]);
      if (r.band === 'strong') return;
      W.h2(k + ' — ' + r.title + ' (' + F.int(result.scores[k]) + ', ' + r.bandLabel + ')');
      r.items.forEach(function (i) { W.bullet(i); });
      W.p('Sources: ' + r.cite, { size: 7.5, color: [110, 110, 110] });
    });
    W.note(REC.disclaimer);
    if (ctx.llmNarrative && ctx.llmNarrative.text) {
      W.h2('AI-generated narrative (' + (ctx.llmNarrative.source || 'LLM') + ') — unverified');
      W.note('Generated by a large language model at the user\'s request. It may contain errors or fabricated references and must be checked before use. It does not change any score.', [255, 247, 237]);
      String(ctx.llmNarrative.text).split(/\n+/).forEach(function (l) { if (l.trim()) W.p(l.trim(), { size: 8.5 }); });
    }

    if (result.dataQuality.warnings.length) {
      W.h1(sec++ + '. Data-quality warnings');
      result.dataQuality.warnings.forEach(function (w) { W.bullet(w); });
    }

    W.h1(sec++ + '. Configuration and reproducibility');
    W.table(['Setting', 'Value'], IO.reproducibility(result), [70, 110]);
    if (ctx.overrides && ctx.overrides.length) {
      W.h2('Evidence-calibration overrides accepted by the user');
      W.table(['Parameter', 'Old', 'New', 'Source', 'Confidence'], ctx.overrides.map(function (o) { return [o.name || o.key, String(o.old_value), String(o.new_value) + ' ' + (o.unit || ''), o.source || '', o.confidence || '']; }), [40, 22, 26, 70, 22]);
    }
    W.h2('Method (generated from the active configuration)');
    W.table(['Code', 'Indicator', 'Definition', 'Wt'], IO.methodologyRows(result.config.mode === 'paper-default' ? undefined : configFromSummary(result.config)).map(function (r) { return [r[0], r[1], r[3], String(r[4])]; }), [10, 28, 132, 10], { size: 7 });
    W.p('Dimensions: N = T; P = weighted mean of D, L, W; Pe = A; E = weighted mean of G, Q (with default weights P = (D+L+W)/3 and E = (10G + 12Q)/22). A1 = Σ w_j s_j / Σ w_j; A2 = (N + P + Pe + E)/4; A3 = [max(N,1) max(P,1) max(Pe,1) max(E,1)]^(1/4); β = A3/A2.', { size: 8 });

    W.h1(sec++ + '. Limitations');
    LIMITATIONS.forEach(function (l) { W.bullet(l); });
    W.p('Data: © OpenStreetMap contributors (ODbL); CAMS atmospheric composition via Open-Meteo (CC BY 4.0).', { size: 7.5, color: [110, 110, 110] });
    return W.finish();
  }

  function configFromSummary(cs) {
    // Rebuild a config from a result's config summary (weights, radius, emission factors, dimension weights).
    return NPPE.createConfig({ weights: cs.weights, dimensionWeights: cs.dimensionWeights, catchment: { radius: cs.radius }, air: { emissionFactors: cs.emissionFactors }, experimental: cs.experimental });
  }

  /** Multi-station ranking report (Table 3 format, typology and robustness). ctx: {fonts, robustness, title, typeNames} */
  function rankingReport(jsPDF, ranking, ctx) {
    ctx = ctx || {};
    var W = new Writer(jsPDF, { fonts: ctx.fonts, footer: footer(ranking) });
    W.cover('TODSphere', ctx.title || 'NPPE multi-station ranking', [ranking.stations.length + ' stations · catchment radius ' + ranking.config.radius + ' m', 'Generated ' + (ranking.computedAt || new Date().toISOString())],
      { mode: ranking.config.mode, text: modeText(ranking.config.mode) });
    W.h1('1. Station results (Table 3 format)');
    W.table(['No.', 'Station', 'N', 'P', 'Pe', 'E', 'A1 (rank)', 'A3 (rank)', 'NP rank', 'β', 'Lim.', 'Type'], ranking.stations.map(function (s, i) {
      var r = s.result; return [String(i + 1), r.station.name, F.int(r.dimensions.N), F.int(r.dimensions.P), F.int(r.dimensions.Pe), F.int(r.dimensions.E),
        F.score1(r.composites.A1) + ' (' + F.rank(s.ranks.A1) + ')', F.score1(r.composites.A3) + ' (' + F.rank(s.ranks.A3) + ')', F.rank(s.ranks.NP), F.ratio2(r.diagnostics.beta), r.diagnostics.limitingDimension, s.type === null ? '–' : String(s.type)];
    }), [9, 38, 10, 10, 10, 10, 20, 20, 13, 12, 10, 10], { size: 7.2, boldFirst: false });
    if (ranking.summary) {
      var d = ranking.summary.descriptive;
      W.p('Means: N ' + F.score1(d.N.mean) + ', P ' + F.score1(d.P.mean) + ', Pe ' + F.score1(d.Pe.mean) + ', E ' + F.score1(d.E.mean) + ', A1 ' + F.score1(d.A1.mean) + ', A3 ' + F.score1(d.A3.mean) + (d.beta ? ', β ' + F.ratio2(d.beta.mean) : '') + '. Spearman ρ: NP–A1 ' + F.ratio2(ranking.summary.spearman.NP_A1) + ', NP–A3 ' + F.ratio2(ranking.summary.spearman.NP_A3) + ', A1–A3 ' + F.ratio2(ranking.summary.spearman.A1_A3) + '. Node–place classes: ' + ranking.summary.nodePlace.balanced + ' balanced, ' + ranking.summary.nodePlace.nodeDominant + ' node-dominant, ' + ranking.summary.nodePlace.placeDominant + ' place-dominant.', { size: 8.5 });
      W.p('Ranks: 1 = best; ties receive average ranks. The ranking basis reported first is A3 with β and the limiting dimension (manuscript Section 5.2).', { size: 8 });
    }
    if (ranking.typology) {
      W.h1('2. Typology (Ward clustering of N, P, Pe, E)');
      var names = ctx.typeNames || {};
      W.table(['Type', 'n', 'N', 'P', 'Pe', 'E', 'A1', 'A3', 'β', 'Members'], Object.keys(ranking.typology.profiles).map(function (t) {
        var p = ranking.typology.profiles[t]; return [t + (names[t] ? ' ' + names[t] : ''), String(p.size), F.score1(p.N), F.score1(p.P), F.score1(p.Pe), F.score1(p.E), F.score1(p.A1), F.score1(p.A3), F.ratio2(p.beta), p.members.join(', ')];
      }), [26, 7, 11, 11, 11, 11, 11, 11, 10, 71], { size: 7 });
      W.p('Silhouette width by number of groups: ' + Object.keys(ranking.typology.silhouette).map(function (k) { return k + ': ' + F.ratio2(ranking.typology.silhouette[k]); }).join(', ') + '. Groups used: ' + ranking.typology.k + ' (best silhouette at ' + ranking.typology.kBest + ').', { size: 8.5 });
    }
    var rb = ctx.robustness;
    if (rb) {
      W.h1('3. Robustness');
      var rows = [['Six weighting schemes (SAW)', "Kendall's W (ties corrected)", F.fixed(rb.weights.kendall.W, 3) + ' (p ' + (rb.weights.kendall.p < 0.001 ? '< 0.001' : F.fixed(rb.weights.kendall.p, 3)) + ')'],
        ['', 'Lowest ρ with configured default', F.ratio2(Math.min.apply(null, Object.keys(rb.weights.rhoVsDefault).map(function (k) { return rb.weights.rhoVsDefault[k]; })))],
        ['SAW, WPM, WASPAS, TOPSIS, VIKOR, EDAS, A3', "Kendall's W", F.fixed(rb.mcdm.kendall.W, 3)],
        ['', 'Pairwise ρ minimum / mean', F.ratio2(rb.mcdm.rhoMin) + ' / ' + F.ratio2(rb.mcdm.rhoMean)]];
      if (rb.montecarlo) {
        var mc = rb.montecarlo;
        rows.push(['±50% perturbation, A1', 'Median ρ (5th pct.); top-5 / bottom-5 retained', F.ratio2(mc.A1_pm50.rhoMedian) + ' (' + F.ratio2(mc.A1_pm50.rhoP05) + '); ' + F.pct(mc.A1_pm50.top5Retained) + ' / ' + F.pct(mc.A1_pm50.bottom5Retained)]);
        rows.push(['±50% perturbation, A3', 'Median ρ (5th pct.); top-5 / bottom-5 retained', F.ratio2(mc.A3_pm50.rhoMedian) + ' (' + F.ratio2(mc.A3_pm50.rhoP05) + '); ' + F.pct(mc.A3_pm50.top5Retained) + ' / ' + F.pct(mc.A3_pm50.bottom5Retained)]);
        rows.push(['Flat Dirichlet, A1', 'Median ρ (5th pct.)', F.ratio2(mc.A1_simplex.rhoMedian) + ' (' + F.ratio2(mc.A1_simplex.rhoP05) + ')']);
      }
      W.table(['Test', 'Statistic', 'Value'], rows, [62, 66, 52]);
      if (rb.montecarlo) W.p(rb.montecarlo.nsim + ' Monte Carlo draws, seed ' + rb.montecarlo.seed + ', PRNG ' + rb.montecarlo.prng + '. The manuscript used NumPy PCG64; Monte Carlo statistics therefore agree within sampling error rather than digit-for-digit.', { size: 8 });
    }
    if (ctx.radius || ctx.seasonal) {
      W.h1('4. Radius and season');
      if (ctx.radius) W.table(['Radii', 'ρ A1', 'ρ A3', 'ρ N', 'ρ P', 'ρ Pe', 'ρ E'], Object.keys(ctx.radius.pairs).map(function (k) { var p = ctx.radius.pairs[k]; return [k + ' m', F.ratio2(p.A1), F.ratio2(p.A3), F.ratio2(p.N), F.ratio2(p.P), F.ratio2(p.Pe), F.ratio2(p.E)]; }), [34, 24, 24, 24, 24, 24, 24]);
      if (ctx.seasonal) W.table(['Month', 'Mean Q', 'Mean E', 'Mean A1', 'Mean A3', 'ρ A1', 'ρ A3'], ctx.seasonal.map(function (m) { return [m.month, F.score1(m.Q_mean), F.score1(m.E_mean), F.score1(m.A1_mean), F.score1(m.A3_mean), F.ratio2(m.rho_A1), F.ratio2(m.rho_A3)]; }), [24, 24, 24, 26, 26, 24, 24]);
    }
    if (ctx.verification) {
      W.h1('Verification against the manuscript');
      W.p(ctx.verification.passed + ' of ' + ctx.verification.total + ' stored manuscript values reproduced' + (ctx.verification.ok ? ' (all).' : '. Failed: ' + ctx.verification.checks.filter(function (c) { return !c.pass; }).map(function (c) { return c.name; }).join(', ')), { bold: true });
    }
    W.h1('Configuration and reproducibility');
    W.table(['Setting', 'Value'], [['Software', ranking.software.name + ' ' + ranking.software.version], ['Methodology', ranking.methodology.id + ' v' + ranking.methodology.version],
      ['Configuration', ranking.config.label + ' [' + ranking.config.mode + ']'], ['Configuration hash', ranking.config.hash],
      ['Weights (T,D,L,W,A,G,Q)', IND.map(function (k) { return ranking.config.weights[k]; }).join(', ')], ['Deviations from paper default', ranking.config.deviations.length ? ranking.config.deviations.map(function (d) { return d.path; }).join(', ') : 'none'],
      ['Computed at', ranking.computedAt]], [70, 110]);
    LIMITATIONS.forEach(function (l) { W.bullet(l); });
    return W.finish();
  }

  /** Methodology sheet generated from the configuration. ctx: {fonts, config} */
  function methodologyReport(jsPDF, ctx) {
    ctx = ctx || {};
    var cfg = ctx.config && ctx.config.hash ? ctx.config : NPPE.createConfig(ctx.config);
    var W = new Writer(jsPDF, { fonts: ctx.fonts, footer: 'TODSphere ' + NPPE.SOFTWARE.version + ' · ' + NPPE.METHODOLOGY.id + ' v' + NPPE.METHODOLOGY.version + ' · methodology sheet · config ' + cfg.mode + ' ' + cfg.hash });
    W.cover('TODSphere', 'Methodology sheet — NPPE seven-indicator framework', [NPPE.METHODOLOGY.reference.slice(0, 118), NPPE.METHODOLOGY.reference.slice(118)], { mode: cfg.mode, text: modeText(cfg.mode) });
    W.h1('1. Framework');
    W.p('The Node–Place–People–Ecology (NPPE) framework organises seven open-data indicators into four dimensions: Node (T), Place (D, L, W), People (A) and Ecology (G, Q). Each indicator is scored 0–100, higher meaning better TOD readiness. Three composites are computed: A1, the weighted arithmetic mean of the seven indicators (the score displayed by TODSphere); A2, the arithmetic mean of the four dimension scores; and A3, their geometric mean. The balance ratio β = A3/A2 = 1 − Atkinson(ε = 1) measures evenness across dimensions and the limiting dimension is the dimension with the lowest score.');
    W.h1('2. Indicators (generated from the active configuration)');
    W.table(['Code', 'Indicator', 'Dimension', 'Definition', 'Weight'], IO.methodologyRows(cfg).map(function (r) { return [r[0], r[1], r[2], r[3], String(r[4])]; }), [10, 26, 17, 117, 12], { size: 7 });
    W.h1('3. Dimensions, composites and diagnostics');
    ['N = T', 'P = (w_D D + w_L L + w_W W)/(w_D + w_L + w_W)  — with default weights (D + L + W)/3', 'Pe = A', 'E = (w_G G + w_Q Q)/(w_G + w_Q)  — with default weights (10G + 12Q)/22',
      'A1 = Σ_j w_j s_j / Σ_j w_j over the seven indicators', 'A2 = (N + P + Pe + E)/4', 'A3 = [max(N,1) · max(P,1) · max(Pe,1) · max(E,1)]^(1/4)', 'β = A3/A2; limiting dimension = argmin(N, P, Pe, E)',
      'Node–place index NP = (N + P)/2; gap N − P; balanced if |N − P| ≤ 10, node-dominant if N − P > 10, place-dominant if N − P < −10',
      'Typology: Ward hierarchical clustering of (N, P, Pe, E), not re-standardised; groups relabelled by descending mean A3'].forEach(function (l) { W.bullet(l); });
    W.h1('4. Data acquisition');
    W.p('OpenStreetMap via the Overpass API. Query A returns rail and metro stations, bus stops and stations, building footprints (catchment bounding square), shops, education/health/banking/food amenities, parks, playgrounds and gardens, and residential/commercial/industrial/retail land use (search square). Query B returns the road and path network with geometry (search square). Output limits: 5,000 (A) and 2,000 (B) elements; responses reaching a limit are flagged. If the combined query A is refused, it is issued in three parts whose de-duplicated union equals the combined query. Background air quality: CAMS via the Open-Meteo air-quality API (current hourly value); if unavailable, the tool uses documented seasonal Delhi-NCR averages and labels the result as a fallback.');
    W.h1('5. Robustness tools');
    ['Weights: default, equal indicator, equal dimension, entropy, CRITIC and MEREC weights; SAW ranks; Kendall\'s W with tie correction.', 'Aggregation: SAW, WPM, WASPAS (λ = 0.5), TOPSIS, VIKOR (v = 0.5), EDAS and A3.',
      'Monte Carlo: each weight multiplied by U(0.5, 1.5) and renormalised (A1 indicator weights, A3 dimension weights), 10,000 draws; flat-Dirichlet stress test.', 'Catchment radius (500/800/1,000 m) and monthly CAMS background (season).'].forEach(function (l) { W.bullet(l); });
    W.h1('6. Configuration');
    W.table(['Setting', 'Value'], [['Configuration', cfg.label + ' [' + cfg.mode + ']'], ['Hash', cfg.hash], ['Deviations from paper default', cfg.deviations.length ? cfg.deviations.map(function (d) { return d.path + ' = ' + JSON.stringify(d.value) + ' (paper ' + JSON.stringify(d.paper) + ')'; }).join('; ') : 'none']], [60, 120]);
    W.h1('7. Discrepancy notes');
    W.bullet('NO2 emission factor: every result reported in the manuscript uses 147.0 mg/veh/km (the NO2 value of Raparthi et al. 2021). The TODSphere build that produced station_indicators.csv used 92.9 mg/veh/km, which is the VOC value; the manuscript analysis rescales the increments. TODSphere 2.1 uses 147.0 by default; the legacy value is available only as a labelled preset.');
    W.bullet('Monte Carlo statistics use a different pseudo-random generator from the manuscript (NumPy PCG64) and agree within sampling error.');
    W.h1('8. Limitations');
    LIMITATIONS.forEach(function (l) { W.bullet(l); });
    return W.finish();
  }

  var MANUAL = [
    { h: '1. Purpose', p: ['TODSphere screens the transit-oriented development (TOD) readiness of station areas with the Node–Place–People–Ecology (NPPE) framework. Seven open-data indicators — transit accessibility (T), built density (D), land-use diversity (L), walkability (W), amenity accessibility (A), green space (G) and near-road air quality (Q) — are computed in the browser from OpenStreetMap and CAMS, grouped into four dimensions and combined into three composites (A1, A2, A3) with two diagnostics (balance ratio β and limiting dimension).',
      'Outputs are screening results that inform, not replace, planning judgement. They have not been validated against ridership, expert or perception assessments.'] },
    { h: '2. Starting TODSphere', b: ['Open index.html in Chrome, Edge or Firefox (no installation), or run "npm start" and open http://127.0.0.1:8080/ to use the local server and the JSON API.', 'An internet connection is needed for OpenStreetMap (Overpass API), CAMS air quality (Open-Meteo) and map tiles.', 'Click a location on the map; the default catchment radius is 800 m (manuscript default).'] },
    { h: '3. GIS Analysis tab', b: ['Seven NPPE indicators grouped by dimension, each with its weight and the intermediate quantities used to compute it.', 'Dimension scores N, P, Pe, E; composites A1 (the TODSphere composite), A2 and A3; balance ratio β; limiting dimension; node–place index and class.', 'Near-road air-quality screening: CAMS background, near-road increment, totals, the standards-weighted ratio R and Q.', 'Data-quality warnings (e.g. no buildings or banks mapped) that help distinguish real deficits from mapping gaps.', 'Supplementary measures (multi-modal, first/last mile, street connectivity, housing proxy, employment proxy, NMT and transit-service scores) are legacy TODSphere measures shown for context only; they are not part of any NPPE composite.'] },
    { h: '4. Perceived TOD and Dual Score tabs (Actual vs Perceived)', b: ['Enter Likert ratings (1–5) for the seven NPPE indicators, or upload survey responses (CSV/XLSX template). Ratings map linearly to 0–100.', 'The comparison lists calculated and perceived scores, gaps, dimension scores and composites. Invalid or missing ratings are counted and excluded, never imputed.', 'The dual score α·A1(calculated) + (1 − α)·A1(perceived) and the α heuristics are exploratory tools; they are not part of the NPPE method and are not external validation.'] },
    { h: '5. Settings tab', b: ['Configuration status: "Paper default" (manuscript configuration), "User-adjusted" (any change of weights, radius or parameters, listed in every report) or "Experimental" (enrichment data used in scoring).', 'Presets: paper default, 500 m and 1,000 m sensitivity catchments, equal indicator weights and the legacy NO2 emission factor of the original build.', 'Weights: seven sliders (defaults 18, 16, 16, 16, 12, 10, 12). Reset returns to the paper default.', 'Evidence calibration: upload documents; an LLM proposes values with sources; nothing is applied until accepted; accepted values are listed in reports and can be reverted.', 'Enrichment APIs (Google, TomTom, HERE, WAQI, OpenWeatherMap, OpenRouteService) add map overlays. They change scores only if "Experimental: use enrichment in scoring" is enabled.'] },
    { h: '6. Research tab', b: ['Data coverage: a heuristic indicator of input richness per indicator (not a validation measure).', 'Weight sensitivity: seeded Monte Carlo with each weight multiplied by U(0.5, 1.5) (10,000 draws), for A1 and A3.', 'Assessment history (stored in this browser), multi-respondent aggregation and research exports (JSON, CSV, XLSX, GeoJSON, BibTeX, methodology PDF).'] },
    { h: '7. Ranking tab', b: ['Save analysed stations or import a CSV with columns station, T, D, L, W, A, G, Q (optional lat, lon).', 'Load the manuscript dataset (21 Noida Metro Aqua Line stations) to reproduce Table 3 and the robustness tests, with an automatic check against the stored manuscript values.', 'Rankings on A1, A2, A3 and the node–place index (1 = best, ties averaged), Ward typology, robustness to weights, MCDM method, Monte Carlo perturbation, radius and season.', 'Exports: ranking CSV/XLSX and a ranking PDF report.'] },
    { h: '8. Reproducibility', b: ['Every result carries the software version, methodology version, configuration mode and hash, weights, radius, emission factors, deviations from the paper default, OSM database timestamp, Overpass server and air-quality source/time.', 'The command "npm run reproduce" reproduces the manuscript tables from data/paper and verifies them against the stored values.'] },
    { h: '9. Troubleshooting', b: ['"Overpass unavailable": public servers are busy; wait and retry. TODSphere retries across servers and never scores on missing data.', 'Air quality shows "fallback": the CAMS service did not respond; seasonal Delhi-NCR averages are used and labelled.', 'Zero scores for banks, eateries or bus stops may reflect incomplete OpenStreetMap mapping.', 'Q = 0 in winter or pre-monsoon months: the background exceeds the national standards and Q stops discriminating (manuscript Section 5.3).'] },
    { h: '10. Credits', p: ['Developed by D. Sai Kiran Varma under the supervision of Dr Shalini Rankavat, Transportation Planning Lab, Shiv Nadar Institution of Eminence, Delhi NCR, India. Map data © OpenStreetMap contributors (ODbL). Air quality: CAMS via Open-Meteo (CC BY 4.0).'] }
  ];
  /** User manual. ctx: {fonts} */
  function manualReport(jsPDF, ctx) {
    ctx = ctx || {};
    var W = new Writer(jsPDF, { fonts: ctx.fonts, footer: 'TODSphere ' + NPPE.SOFTWARE.version + ' · user manual · ' + NPPE.METHODOLOGY.id + ' v' + NPPE.METHODOLOGY.version });
    W.cover('TODSphere', 'User manual', ['Version ' + NPPE.SOFTWARE.version + ' · ' + NPPE.METHODOLOGY.name], null);
    MANUAL.forEach(function (s) { W.h1(s.h); (s.p || []).forEach(function (t) { W.p(t); }); (s.b || []).forEach(function (t) { W.bullet(t); }); });
    W.h1('11. Indicator definitions (paper default)');
    W.table(['Code', 'Indicator', 'Definition', 'Wt'], IO.methodologyRows().map(function (r) { return [r[0], r[1], r[3], String(r[4])]; }), [10, 28, 132, 10], { size: 7 });
    return W.finish();
  }

  return { stationReport: stationReport, rankingReport: rankingReport, methodologyReport: methodologyReport, manualReport: manualReport, ascii: ascii, LIMITATIONS: LIMITATIONS, MANUAL: MANUAL };
}));
