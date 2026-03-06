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
- Real elevation terrain from a Terrarium DEM tile centered on Saguenay.
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

## Project Structure
- `index.html` - app shell
- `src/styles.css` - styling and HUD
- `src/main.js` - Three.js scene, Terrarium terrain decoding, and controls
- `scripts/fetch_terrarium_tile.sh` - DEM tile downloader + metadata writer
- `docs/implementation-spec.md` - concrete build and data pipeline plan

## Attribution
- Terrain tiles from `https://github.com/tilezen/joerd/blob/master/docs/terrarium.md`
- Hosted dataset: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`

## Next Iterations
1. Add multi-tile chunk loading around the camera.
2. Add terrain LOD rings and culling.
3. Add water/fjord mask and POI overlays.
