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
- Moderately accurate terrain approximation (procedural placeholder now, real DEM pipeline documented).
- High interactivity prioritized over terrain resolution.

## Run
This project is intentionally no-build for quick iteration.

1. Serve the folder with any static server:
   - `python3 -m http.server 5173`
2. Open:
   - `http://localhost:5173`

## Project Structure
- `index.html` - app shell
- `src/styles.css` - styling and HUD
- `src/main.js` - Three.js scene, terrain, and controls
- `docs/implementation-spec.md` - concrete build and data pipeline plan

## Next Iterations
1. Replace procedural terrain with DEM-based mesh (CDEM / SRTM / Copernicus).
2. Add chunked LOD terrain streaming.
3. Add water/fjord mask and POI overlays.
