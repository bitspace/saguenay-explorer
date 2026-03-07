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
- Runtime terrain loading (implemented):
  - Client streams nearby Terrarium tiles (`z11`) around camera position
  - Basic LOD rings: high detail center tile, lower detail outer rings
  - Tile-level visibility culling and prioritized load queue
- Optional imagery overlay:
  - Google Map Tiles API satellite tile draped per loaded terrain tile
  - Reads key from `.env` (`MAP_TILES_API_KEY` or `GOOGLE_MAPS_API_KEY`)
- Optional helper script (not required at runtime):
  - `./scripts/fetch_terrarium_tile.sh`
  - Downloads a local reference tile to `assets/terrain/`

## Project Structure
- `index.html` - app shell
- `src/styles.css` - styling and HUD
- `src/main.js` - Three.js scene, streamed DEM terrain, Google satellite overlay, and controls
- `scripts/fetch_terrarium_tile.sh` - DEM tile downloader + metadata writer
- `docs/implementation-spec.md` - concrete build and data pipeline plan

## Google Map Tiles Setup
1. Enable `Map Tiles API` in your GCP project.
2. Add a key to `.env` (already gitignored), for example:
   - `MAP_TILES_API_KEY=your_key_here`
3. Ensure key restrictions allow:
   - Referrer: `http://localhost:5173/*`
   - API: `Map Tiles API`

## Current Limitations
- The `.env` key-loading path is intended for local development convenience.
- In production, use a safer key-delivery approach and strict key restrictions.
- Terrain collision/ground-following and road/label overlays are not implemented yet.

## Attribution
- Terrain tiles from `https://github.com/tilezen/joerd/blob/master/docs/terrarium.md`
- Hosted dataset: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`

## Next Iterations
1. Add hysteresis to reduce LOD/tile churn during sharp turns.
2. Add water/fjord mask and POI overlays.
3. Add road/label overlays from vector data.
