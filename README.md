# TODSphere

**Open-data screening of transit-oriented development (TOD) with the Node–Place–People–Ecology (NPPE)
framework.**

TODSphere computes seven open-data indicators for any station area directly in the web browser:
transit accessibility, built density, land-use diversity, walkability, amenity accessibility, green space and
near-road air quality. The indicators come from OpenStreetMap and CAMS. The tool combines them into three
composite scores and reports two diagnostics, the balance ratio β and the limiting dimension. It also
ranks a corridor and tests how robust that ranking is.

TODSphere 2.1 implements exactly the method of the manuscript:

> Varma, D. S. K. & Rankavat, S. *Node, place, people and ecology: an open-data framework and tool for
> screening transit-oriented development along an Indian metro corridor.* (manuscript under review)

It reproduces all 214 station-level and corridor-level values of the manuscript's Tables 3 and 4
(`npm run reproduce`).

| | |
|---|---|
| Software version | 2.1.0 (see [CHANGELOG.md](CHANGELOG.md)) |
| Methodology | `NPPE-7 v1.0.0`, paper-default configuration hash `116c56f1315b8353` |
| Runtime | Any modern browser. Node.js ≥ 18 only for the local server, API, tests and reproduction script |
| Dependencies | None to install; vendored browser libraries in `lib/` (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)) |
| Database | None. The app keeps settings, saved stations and history in the browser's `localStorage` |

> **Screening, not validation.** NPPE scores are screening outputs that inform planning judgement. They
> have not been validated against ridership, expert assessment or surveys. The *Perceived* and *Actual vs
> Perceived* modules compare the scores with perceptions. They are diagnostic tools, not external
> validation.

## Contents

1. [Quick start](#quick-start)
2. [Installation](#installation)
3. [Configuration and environment](#configuration-and-environment)
4. [Using the app](#using-the-app)
5. [Reproducing the manuscript](#reproducing-the-manuscript)
6. [API](#api)
7. [Development](#development)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)
11. [Known limitations](#known-limitations)
12. [Citation and licence](#citation-and-licence)

Further documentation:

- [docs/METHODOLOGY.md](docs/METHODOLOGY.md): the exact equations and the discrepancy register.
- [docs/API.md](docs/API.md): the API reference.
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): the data sources.
- [docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md): how to reproduce the manuscript's results.
- [docs/TESTING.md](docs/TESTING.md): the test suite.
- [docs/RELEASING.md](docs/RELEASING.md): GitHub, Zenodo and DOI steps.
- [docs/MANUSCRIPT_TEXT.md](docs/MANUSCRIPT_TEXT.md): optional text to insert in the manuscript.

## Quick start

```bash
node server/server.js        # or: npm start
```

Open <http://127.0.0.1:8080/> and click a location on the map. On Windows, double-click
`start-todsphere.bat`, which starts the server and opens a chromeless Edge window.

You can also open `index.html` directly from the file system, with no server. The whole app then works
except for one thing: PDF reports cannot load the embedded Inter font and fall back to ASCII transliteration
(for example, "beta" instead of β).

## Installation

1. Install **Node.js 18 or newer** from <https://nodejs.org>. You only need it for the server, the API, the tests
   and the reproduction script. Check with `node --version`.
2. Get the source: `git clone https://github.com/OWNER/todsphere.git` or download and unzip a release.
3. There is nothing else to install. `npm install` is not needed because the project has no npm dependencies.

The browser needs internet access for these services:

- map tiles;
- the Overpass API, for OpenStreetMap data;
- the Open-Meteo air-quality API;
- optional context services.

The manuscript reproduction works offline.

## Configuration and environment

| Variable | Default | Used by |
|---|---|---|
| `PORT` | `8080` | `server/server.js`, `start-todsphere.bat` |
| `HOST` | `127.0.0.1` | `server/server.js`; set to `0.0.0.0` only behind a reverse proxy |
| `TODSPHERE_NO_BROWSER` | unset | `start-todsphere.bat`; `1` starts only the server |

There is no `.env` file and no secret is required.

**Optional enrichment keys.** Google Places, TomTom, HERE, WAQI, OpenWeatherMap and OpenRouteService keys, and
LLM keys for evidence calibration, are entered in the **Settings** tab. They are stored only in that browser's
`localStorage` and are never written to exports. Enrichment data never enter the NPPE scores unless you
explicitly enable the labelled **experimental** mode.

**Scientific configuration.** The status bar in the GIS Analysis and Settings tabs shows the active configuration.

- **Green, paper default.** Identical to the manuscript's configuration.
- **Amber, user-adjusted.** Weights, radius or air-quality parameters have been changed. Every change is
  listed as a deviation.
- **Red, experimental.** Non-paper inputs are included.

Every result, export, report and API response records the mode, the configuration hash and the deviations.
The paper default is frozen in code and cannot change silently.

## Using the app

| Tab | Purpose |
|---|---|
| **GIS Analysis** | Click a location or search a station. See the seven indicators, dimensions N/P/Pe/E, composites A1/A2/A3, β, limiting dimension, node–place class, intermediate quantities, distances, context layers, recommendations and downloads (PDF, CSV, JSON, XLSX, GeoJSON) |
| **Perceived TOD** | Survey-based perception scores (Likert import or manual entry). Exploratory |
| **Actual vs Perceived** | Gap analysis between NPPE and perceived scores. Diagnostic, not validation |
| **Ranking** | Save stations, import a station table or load the manuscript dataset. Ranks on A1/A2/A3, Ward typology, robustness (weighting schemes, six MCDM methods, Kendall's W, Monte Carlo) and exports |
| **Research** | Data coverage, sensitivity analysis, history, respondent data, weather context, research exports |
| **Settings** | Presets (`paper-default`, `legacy-build-ef`, `catchment-500`, `catchment-1000`, `equal-indicator-weights`), weights, radius, optional keys, experimental switch |

The scoring is performed by `src/nppe-engine.js`, the only NPPE engine. It serves the dashboard, the
ranking, the reports, the exports, the API and the tests alike.

## Reproducing the manuscript

```bash
npm run reproduce
```

This prints Table 3 and Table 4 and checks 214 stored values. It also writes `out/paper/*.csv`, `.xlsx`,
`.json` and `.pdf`. The same check runs in the browser: **Ranking → Load manuscript dataset → Run robustness
tests**. It is also available at `GET /api/v1/paper/reproduce`. See [docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md).

## API

`node server/server.js` serves the app and a versioned JSON API under `/api/v1`. The endpoints are
`health`, `methodology`, `config/validate`, `score`, `air-quality`, `rank`, `robustness`,
`paper/reproduce` and `paper/dataset`. The engine can also be used as a Node module
(`require('./src/nppe-engine.js')`). See [docs/API.md](docs/API.md).

## Development

```text
index.html                 single-page app (UI only; calls the engine)
src/nppe-engine.js         authoritative NPPE engine (indicators, aggregation, ranking, robustness, config)
src/nppe-io.js             CSV / JSON / XLSX / GeoJSON builders
src/nppe-report.js         PDF reports (station, ranking, methodology, manual)
src/nppe-recommendations.js indicator- and dimension-level recommendations
src/nppe-paper.js          manuscript reproduction and verification
src/paper-data.js          generated from data/paper (npm run build:paper-data)
server/server.js           zero-dependency HTTP server and API
scripts/                   reproduce-paper, build-paper-data, check (static checks)
data/paper/                the manuscript's analysis package (data, results, Python scripts)
reference/                 the TODSphere build that produced the manuscript's data (for equivalence tests)
tests/                     node:test suites
lib/, fonts/               vendored libraries and fonts
```

Conventions:

- The modules are UMD, so they work both as browser globals and under `require`.
- Do not duplicate scoring logic in `index.html`. Call the engine.
- Any change to a paper-default parameter must go into a named preset or a user setting, never into
  `PAPER_CONFIG`. The golden tests fail otherwise.
- Run `npm test` before committing.
- After editing `data/paper`, run `npm run build:paper-data`.

## Testing

```bash
npm test          # 51 tests: golden values from the paper, reference equivalence, unit, outputs, API, static checks
npm run check     # static checks of index.html only
```

See [docs/TESTING.md](docs/TESTING.md) for what each suite covers.

## Deployment

TODSphere is a static site plus an optional Node server.

- **Static hosting** (GitHub Pages, any web server). Publish `index.html`, `src/`, `lib/` and `fonts/`. Every
  browser feature works; the `/api/v1` endpoints are then unavailable.
- **Node server.** Run `HOST=127.0.0.1 PORT=8080 node server/server.js` behind a reverse proxy (nginx, Caddy,
  IIS) that terminates TLS. The server has no authentication and no rate limiting. Do not expose it
  directly to the internet. Add those controls at the proxy.
- **Public Overpass and Nominatim servers** have usage policies. Heavy or institutional use should point
  to a self-hosted Overpass instance.

## Troubleshooting

| Symptom | Cause and remedy |
|---|---|
| "No NPPE score was computed: Query … could not be retrieved from any Overpass server" | All Overpass servers failed or timed out. Wait a minute and retry. Public instances are rate-limited. TODSphere deliberately does not score incomplete data |
| Q labelled **fallback** | The Open-Meteo air-quality API was unreachable, so seasonal Delhi-NCR averages were used. Retry for live CAMS data |
| Output-limit warning (5,000 / 2,000 elements) | A dense area hit the manuscript's query limits. The result is flagged. Use a smaller radius or interpret with care |
| Live indicators differ slightly from the manuscript | OpenStreetMap is edited continuously. Check the OSM timestamp in the JSON export. Use `npm run reproduce` for the frozen dataset |
| PDF shows "beta" instead of β | The page was opened via `file://`, so the font could not be loaded. Use the server or the launcher |
| Status bar amber/red | The configuration differs from the paper default. Settings → preset **paper-default** restores it |
| `EADDRINUSE` on start | The port is busy. Set `PORT=8081` |
| Tests fail after editing `data/paper` | Regenerate `src/paper-data.js` with `npm run build:paper-data` |

## Known limitations

These limitations are also printed in every report.

- The scores are screening indicators and have not been externally validated.
- OSM completeness varies, and zero scores may reflect gaps in the mapping.
- Q is a relative near-road screening signal built from assumed AADT and transferred emission factors, not a
  predicted concentration.
- Live results drift with OSM and CAMS updates.
- The Monte Carlo generator differs from the manuscript's NumPy generator, so its statistics agree at the
  reported precision only.
- The legacy v2 measures, NAQI, weather, land cover, enrichment APIs, LLM calibration and perception modules
  are context or exploratory tools outside the NPPE method.

The documented discrepancies are listed in [docs/METHODOLOGY.md §6](docs/METHODOLOGY.md#6-discrepancies-and-decisions).

## Citation and licence

Please cite both the software and the manuscript. [CITATION.cff](CITATION.cff) holds the software metadata.
GitHub shows it as "Cite this repository".

The DOI will be added after the first Zenodo release; see [docs/RELEASING.md](docs/RELEASING.md). No
DOI has been issued yet.

**Licence: not yet selected.** See [LICENSE](LICENSE). Third-party components keep their own licences
([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

Map data © OpenStreetMap contributors (ODbL). Air-quality data: CAMS via Open-Meteo (CC BY 4.0).
