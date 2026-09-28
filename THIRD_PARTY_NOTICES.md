# Third-party components

TODSphere vendors the following components unchanged. Each remains under its own licence, and the licence
text or notice is kept inside each minified file where the upstream project provides one.

| Component | Version | File(s) | Licence |
|---|---|---|---|
| Leaflet | 1.9.4 | `lib/leaflet.js`, `lib/leaflet.css`, `lib/images/*` | BSD 2-Clause |
| jsPDF | 2.5.1 | `lib/jspdf.umd.min.js` | MIT |
| SheetJS Community Edition (xlsx) | 0.20.3 | `lib/xlsx.full.min.js` | Apache 2.0 |
| PDF.js (Mozilla) | 3.11.174 | `lib/pdf.min.js`, `lib/pdf.worker.min.js` | Apache 2.0 |
| Inter (Rasmus Andersson) | as shipped with TODSphere v2 | `fonts/Inter-Regular.ttf`, `fonts/Inter-Bold.ttf` | SIL Open Font License 1.1 |
| JetBrains Mono | as shipped with TODSphere v2 | `fonts/JetBrainsMono-Regular.ttf` | SIL Open Font License 1.1 |

Services called at run time are not redistributed. Their terms are listed in
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md). They include:

- OpenStreetMap and Overpass (ODbL);
- Open-Meteo and CAMS (CC BY 4.0);
- Nominatim;
- the tile providers;
- the optional provider APIs.

The manuscript dataset in `data/paper/` contains statistics derived from OpenStreetMap
(© OpenStreetMap contributors, ODbL 1.0) and CAMS (via Open-Meteo, CC BY 4.0).

The Leaflet and PDF.js versions come from the file headers. The jsPDF and SheetJS versions were read from
the loaded modules. The font files do not record their versions. Before a public release, add the full
OFL licence texts of the two fonts (OFL.txt).
