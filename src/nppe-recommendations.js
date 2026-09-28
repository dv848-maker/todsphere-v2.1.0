/*!
 * TODSphere — rule-based planning prompts for the seven NPPE indicators, used by the Dual-score
 * tab and the PDF report. These are prompts for professional deliberation, NOT outputs of the NPPE
 * method and not policy advice. The priority by limiting dimension follows manuscript Section 2.5:
 * the limiting dimension indicates which kind of intervention should come first.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TODSphereRecommendations = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PRIORITY = {
    N: 'Transport integration (Node is limiting): feeder bus services, stops within the catchment and first/last-mile links to the station.',
    P: 'Land-use intensification (Place is limiting): building intensity, land-use mix and a finer street and footpath network.',
    Pe: 'Service provision (People is limiting): everyday services — health, education, shopping, banking and food — within walking distance.',
    E: 'Environmental mitigation (Ecology is limiting): accessible green space and reduction of near-road exposure (set-backs, green buffers, traffic management).'
  };
  function band(score) { return score < 40 ? 'critical' : score < 60 ? 'needs' : score < 75 ? 'adequate' : 'strong'; }
  var BAND_LABEL = { critical: 'Critical (< 40)', needs: 'Needs improvement (40–59)', adequate: 'Adequate (60–74)', strong: 'Strong (≥ 75)' };
  var DB = {
    T: { title: 'Transit accessibility', cite: 'Cervero & Kockelman (1997); Ewing & Cervero (2010); MoHUA National TOD Policy (2017)',
      critical: ['Establish feeder bus routes and stops within the catchment; T varies only through bus stops at station-centred catchments.', 'Provide interim shared-mobility feeders (e-rickshaw, shuttle) between residential clusters and the station.', 'Check OpenStreetMap for unmapped bus stops before concluding that the deficit is real.'],
      needs: ['Add bus stops within 200 m of the station entrance and improve feeder frequency.', 'Create continuous, direct pedestrian access corridors to the station.'],
      adequate: ['Improve interchange quality between metro and bus (wayfinding, shelter, information).'],
      strong: ['Maintain feeder service levels and interchange quality.'] },
    D: { title: 'Built density', cite: 'Ewing & Cervero (2010); MoHUA (2017); URDPFI Guidelines (2014)',
      critical: ['Plan for intensification within the influence zone once services (People) are in place.', 'Verify building-footprint mapping: group housing may appear as few footprints (manuscript Section 5.5).'],
      needs: ['Encourage infill on vacant and under-used plots near the station.', 'Review FAR and parking norms within the TOD influence zone.'],
      adequate: ['Monitor development against the TOD zone plan.'],
      strong: ['Ensure infrastructure and service capacity keep pace with density.'] },
    L: { title: 'Land-use diversity', cite: 'Shannon (1948); Cervero & Kockelman (1997)',
      critical: ['Introduce mixed-use zoning and neighbourhood convenience centres near the station.'],
      needs: ['Permit ground-floor commercial uses in residential areas close to the station.', 'Add under-represented everyday uses (health, education, food).'],
      adequate: ['Maintain the land-use mix and avoid mono-functional redevelopment.'],
      strong: ['Protect the existing mix during redevelopment.'] },
    W: { title: 'Walkability', cite: 'Frank et al. (2010); IRC:103-2012',
      critical: ['Build continuous footpaths and safe crossings on routes to the station.', 'Open blocked pedestrian links between sectors to shorten walking routes.'],
      needs: ['Improve footpath continuity and add mid-block crossings on long blocks.', 'Map existing footways in OpenStreetMap where they are missing.'],
      adequate: ['Add shade, lighting and wayfinding on principal walking routes.'],
      strong: ['Maintain pedestrian infrastructure; consider pedestrian priority near entrances.'] },
    A: { title: 'Amenity accessibility', cite: 'Luo & Qi (2009); URDPFI Guidelines (2014)',
      critical: ['Provide or plan everyday services (clinic, school, shops, bank, eateries) within walking distance before densification.', 'Check whether zero category scores reflect missing services or missing mapping.'],
      needs: ['Fill the missing service categories shown in the amenity breakdown.', 'Co-locate services in a hub near the station.'],
      adequate: ['Improve quality and opening hours of existing services.'],
      strong: ['Maintain service coverage as population grows.'] },
    G: { title: 'Green space', cite: 'Annerstedt van den Bosch et al. (2016) — WHO 300 m access indicator',
      critical: ['Create accessible public green space within 300 m (pocket parks on vacant plots).'],
      needs: ['Improve access to existing parks and add green links to the station.'],
      adequate: ['Improve the quality and usability of existing green spaces.'],
      strong: ['Protect existing green space during intensification.'] },
    Q: { title: 'Air quality (near-road screening)', cite: 'Karner et al. (2010); Beckerman et al. (2008); CPCB NAAQS (2009)',
      critical: ['Where Q is low because of a nearby major road, use set-backs, green buffers and site layout to limit exposure of new residents.', 'If Q is 0 because the regional background exceeds the standards, the indicator does not discriminate between stations (manuscript Section 5.3); read the near-road increment instead.', 'Confirm with local traffic counts and monitoring before site-level decisions.'],
      needs: ['Apply traffic management and green buffers along adjacent major roads.'],
      adequate: ['Monitor near-road conditions as traffic grows.'],
      strong: ['Maintain distance between sensitive uses and major roads.'] }
  };
  function forIndicator(code, score) { var d = DB[code], b = band(score); return { code: code, title: d.title, band: b, bandLabel: BAND_LABEL[b], items: d[b], cite: d.cite }; }
  return { PRIORITY: PRIORITY, DB: DB, band: band, BAND_LABEL: BAND_LABEL, forIndicator: forIndicator,
    disclaimer: 'Rule-based prompts keyed to indicator score bands, for professional deliberation. They are not outputs of the NPPE method, not policy advice and not validated recommendations.' };
}));
