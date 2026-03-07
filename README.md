# Saguenay Explorer

Web-based Three.js first-person flyover prototype for Saguenay, QC, Canada.

## MVP Scope
- First-person navigation with keyboard controls:
  - `w`: forward
  - `a`: turn left
  - `d`: turn right
  - `s`: backward
  - `q`: strafe left
  - `e`: strafe right
  - `PageUp`: move up
  - `PageDown`: move down
- Real elevation terrain from streamed Terrarium DEM tiles around Saguenay.
- High interactivity prioritized over terrain resolution.

## Run
This project is intentionally no-build for quick iteration.

1. Serve the folder with any static server:
   - `python3 -m http.server 5173`
2. Open:
   - `http://localhost:5173`

## Terrain Data Pipeline (Current)
- DEM source: Mapzen Terrarium (`elevation-tiles-prod`)
- Fetch script:
  - `./scripts/fetch_terrarium_tile.sh`
- Default fetch target:
  - `assets/terrain/saguenay-center-z10-x309-y354.png`
  - `assets/terrain/saguenay-center-z10-x309-y354.json`
- Runtime terrain loading:
  - Client streams nearby Terrarium tiles (`z11`) around camera position
  - Basic LOD rings: high detail center tile, lower detail outer rings
- Optional imagery overlay:
  - Google Map Tiles API satellite tile draped per loaded terrain tile
  - Reads key from `.env` (`MAP_TILES_API_KEY` or `GOOGLE_MAPS_API_KEY`)

## Project Structure
- `index.html` - app shell
- `src/styles.css` - styling and HUD
- `src/main.js` - Three.js scene, DEM decoding, Google satellite overlay, and controls
- `scripts/fetch_terrarium_tile.sh` - DEM tile downloader + metadata writer
- `docs/implementation-spec.md` - concrete build and data pipeline plan

## Google Map Tiles Setup
1. Enable `Map Tiles API` in your GCP project.
2. Add a key to `.env` (already gitignored), for example:
   - `MAP_TILES_API_KEY=your_key_here`
3. Ensure key restrictions allow:
   - Referrer: `http://localhost:5173/*`
   - API: `Map Tiles API`

## Attribution
- Terrain tiles from `https://github.com/tilezen/joerd/blob/master/docs/terrarium.md`
- Hosted dataset: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`

## Next Iterations
1. Add tile-level frustum culling and request prioritization.
2. Add water/fjord mask and POI overlays.
3. Add road/label overlays from vector data.
