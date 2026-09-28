# Changelog

All notable changes to TODSphere are documented here.

## [2.1.0] — 2026-09-28

This release packages the TODSphere research software as a citable archival release.

### Included

- Single authoritative NPPE scoring engine in `src/nppe-engine.js`.
- Seven indicators: transit accessibility, built density, land-use diversity, walkability, amenity accessibility, green space and near-road air-quality screening.
- Node, Place, People and Ecology dimensions with A1, A2 and A3 composites.
- Station ranking, typology and robustness analysis.
- Browser application with CSV, JSON, XLSX, GeoJSON and PDF outputs.
- Zero-dependency Node.js server and versioned JSON API.
- Bundled reference dataset and reproduction utility.
- Automated unit, API, output and static-integrity tests.
- CITATION.cff, Zenodo metadata, MIT licence and third-party notices.

### Scientific and implementation notes

- The paper-default configuration is frozen and identified by a configuration hash in outputs.
- The near-road air-quality component is a screening signal based on stated assumptions and emission factors; it is not a pollutant-concentration prediction.
- OpenStreetMap and CAMS/Open-Meteo inputs remain governed by their respective data licences and can change over time.
- The bundled reference/reproduction workflow verifies stored software-analysis values; it is not independent empirical validation of the methodology.
- Legacy and experimental configurations are explicitly labelled when used.

### Release hygiene

- Removed stale placeholder repository URLs and unselected-license placeholders.
- Added reproducibility and static-check scripts required by the package commands.
- Added the SIL Open Font License text for bundled fonts.
- Removed obsolete test helpers that referenced files not included in this release.
