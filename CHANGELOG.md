# Changelog

All notable changes to TODSphere. Versions follow [Semantic Versioning](https://semver.org). The NPPE
methodology has its own version (`NPPE-7 v1.0.0`), which changes only if the scientific method changes.

## [2.1.0] — unreleased (prepared 28 September 2026)

This release aligns TODSphere with the NPPE manuscript. It changes no indicator, weight, equation or
threshold of the manuscript. Everything that computes scores now runs through one engine, and the release
can reproduce the manuscript exactly.

### Added
- `src/nppe-engine.js` is the single authoritative NPPE engine. The dashboard, ranking, reports, exports,
  API and tests all use it. It computes:
  - the seven indicators with every intermediate quantity;
  - the dimensions N/P/Pe/E and the composites A1, A2 and A3;
  - β (= 1 − Atkinson), the limiting dimension and the node–place index and class;
  - rankings with average ties and the Ward typology;
  - robustness: entropy, CRITIC and MEREC weights; SAW, WPM, WASPAS, TOPSIS, VIKOR and EDAS; Kendall's W
    with tie correction; seeded Monte Carlo and Dirichlet analyses;
  - radius and seasonal sensitivity.
- Configuration governance:
  - the paper default is frozen (hash `116c56f1315b8353`);
  - named presets are available;
  - configurations are marked `paper-default`, `user-adjusted` or `experimental`, with a list of
    deviations;
  - a status bar in the UI and a mode badge in every report show the active configuration.
- Methodology and version metadata (software version, methodology ID, configuration hash, provenance, OSM
  timestamp, CAMS status) in every result, export, report and API response.
- Manuscript reproduction:
  - the manuscript's analysis package is in `data/paper/`;
  - `npm run reproduce` checks 214 stored values;
  - the browser has a "Load manuscript dataset" option;
  - `GET /api/v1/paper/reproduce` runs the same check.
- The Ranking tab:
  - saved and imported stations and the manuscript dataset;
  - ranks on A1/A2/A3, rank shifts, the typology and robustness panels;
  - CSV/XLSX/PDF exports.
- A zero-dependency Node server with a versioned JSON API (`/api/v1`). It has schema validation, typed
  errors, request limits and deterministic output.
- PDF reports (station, ranking, methodology, manual) with the Inter font, so Greek letters and symbols
  display correctly. There are also CSV (protected against formula injection), JSON, XLSX and GeoJSON
  exports.
- 51 automated tests:
  - golden values from the paper;
  - equivalence with the paper build's indicator algorithms;
  - engine units;
  - outputs;
  - the API;
  - static checks.
- Documentation (README, methodology, API, data sources, reproducibility, testing, releasing),
  CITATION.cff, .zenodo.json, a LICENSE placeholder, third-party notices and a Windows launcher.

### Changed
- The Overpass acquisition now uses the manuscript's exact queries A and B, the search square and the
  three-part split fail-over. Queries have retry and back-off with `Retry-After` and server fail-over, and
  responses are validated and cached. Results flag the output limit.
- The NO₂ emission factor is 147.0 mg veh⁻¹ km⁻¹, the value used for all of the manuscript's results. The
  paper build's 92.9 is available as the preset `legacy-build-ef`. See docs/METHODOLOGY.md §6.
- Display rounding is shared by all outputs and uses ties-to-even, which is identical to the manuscript's
  tables.
- The perception module, the "dual score" and α-fusion are labelled exploratory. They are never
  presented as validation and never enter NPPE composites.
- The legacy v2 measures, NAQI, weather, land cover, enrichment APIs and LLM calibration are shown as
  context only. Enrichment enters scores only in the explicit experimental mode.

### Fixed (defects found in v2)
- Road ways returned with `out geom` were dropped (no centre), which made W and the near-road Q
  increments wrong.
- A failed Overpass query was silently scored as empty data. Now no score is computed and an explicit
  error is shown.
- Enrichment switched on automatically whenever API keys were saved.
- Changing the profile silently changed the radius to 1,000 m.
- The radius slider re-queried Overpass on every input event.
- The initial W weight did not match the sliders.
- The recommendations crashed with 12 keys.
- The ID `mcdmResults` was duplicated.
- Kendall's W had no tie correction and a wrong p-value.
- Unescaped OSM names and Nominatim results in popups and search results allowed cross-site scripting.
  Nominatim requests also had no timeout or abort.
- The perceived-score upload concatenated strings instead of adding numbers and used wrong IDs.
- PDF reports had duplicate page footers, crashed on `rect(null)` and used unsupported glyphs.

### Removed
- The unused duplicate library folder `libs/`. The app loads only `lib/`, and pptxgenjs, shp and turf were
  never referenced.

## [2.0] — TODSphere v2 (as received, `todsphere-v2 (2).zip`)

This is the baseline imported as the first commit of this repository.
