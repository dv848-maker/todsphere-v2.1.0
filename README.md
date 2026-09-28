# TODSphere 2.1.0

**Open-data screening of transit-oriented development (TOD) with the Node–Place–People–Ecology (NPPE) framework.**

TODSphere is browser-based research software for station-area TOD screening. It computes seven indicators—transit accessibility, built density, land-use diversity, walkability, amenity accessibility, green space, and near-road air-quality screening—and combines them into Node, Place, People, and Ecology dimensions, composite scores, ranking, and robustness diagnostics.

> **Scope.** TODSphere is a planning-screening and research-support tool. Its scores are not a substitute for field validation, ridership analysis, statutory planning review, exposure modelling, or professional judgement.

## Release

- Software: **TODSphere 2.1.0**
- Methodology: **NPPE-7 v1.0.0**
- Repository: https://github.com/dv848-maker/todsphere-v2.1.0
- Licence: **MIT** for original TODSphere source code; bundled third-party components retain their own licences (see `THIRD_PARTY_NOTICES.md`).
- Runtime: modern web browser; Node.js 18+ for the local server/API/tests.

## Quick start

No npm dependencies are required.

```bash
node server/server.js
```

Then open `http://127.0.0.1:8080/`.

On Windows, `start-todsphere.bat` starts the local server and opens the application. The interface can also be opened directly from `index.html`; some browser security restrictions may affect local font/report behaviour.

## Main files

```text
index.html                  browser application
src/nppe-engine.js          NPPE scoring, ranking and robustness engine
src/nppe-io.js              CSV/JSON/XLSX/GeoJSON output helpers
src/nppe-report.js          PDF report generation
src/nppe-recommendations.js indicator/dimension recommendations
src/nppe-paper.js           bundled reference/reproduction utilities
src/paper-data.js           bundled reference dataset used by those utilities
server/server.js            zero-dependency local HTTP server and JSON API
tests/                      automated tests
lib/                        vendored browser libraries
fonts/                      bundled fonts and font licence notice
```

## Commands

```bash
npm start
npm test
npm run check
npm run reproduce
```

## Data and external services

Live analyses can query OpenStreetMap/Overpass and Open-Meteo/CAMS. Those services and datasets are not relicensed by the MIT licence. OpenStreetMap-derived material remains subject to ODbL terms; CAMS/Open-Meteo material is subject to its applicable attribution/licensing terms. See `THIRD_PARTY_NOTICES.md`.

Live results can change as external datasets are updated. The near-road air-quality indicator is a relative screening signal based on model assumptions and transferred emission factors; it is not a predicted pollutant concentration.

## Configuration

The software records its active configuration and configuration hash with outputs. The bundled baseline configuration is the configuration used for the associated research workflow. User changes are flagged in generated results so adjusted analyses can be distinguished from the baseline.

Optional external API keys entered in the interface are stored in the browser's local storage. Do not commit API keys, tokens, passwords, or other secrets to this repository.

## Testing and reproducibility

Run `npm test` and `npm run reproduce`. The test suite checks engine behaviour, API behaviour, exports, reports, and static application integrity. The reproduction command verifies the values stored with the bundled reference dataset. Reproduction of a software reference dataset should not be interpreted as independent empirical validation of the underlying TOD methodology.

## Citation

Citation metadata are provided in `CITATION.cff`. GitHub displays these through **Cite this repository**. A Zenodo DOI should be added to `CITATION.cff` only after Zenodo has issued or reserved it for this software release.

## Licence

Original TODSphere source code in this repository is released under the **MIT License**. See `LICENSE`. Third-party libraries, fonts, data, map content, and external services are governed by their respective licences and terms. See `THIRD_PARTY_NOTICES.md`.

## Authors

- D. Sai Kiran Varma — Shiv Nadar Institution of Eminence, Delhi NCR, India
- Shalini Rankavat — Department of Civil Engineering, School of Engineering, Shiv Nadar Institution of Eminence, Delhi NCR, India
