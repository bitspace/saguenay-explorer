# Saguenay Explorer Implementation Spec

## Objective
Build a responsive web-based first-person flyover over Saguenay, QC with moderate terrain fidelity and strong interactivity.

## Technical Stack
- Three.js (WebGL)
- ES modules (no build step for MVP)
- Static hosting (GitHub Pages / Netlify / Vercel)

## Coordinate Strategy
- Local tangent-like meter space centered on a Saguenay tile center.
- Convert DEM samples into local `x, y, z` meters.
- Keep camera and terrain in meter-scale units for movement tuning.

## Terrain Data Pipeline (Implemented)
1. Source DEM tile from Mapzen Terrarium (`elevation-tiles-prod`).
2. Compute tile index (`z/x/y`) for a target lat/lon.
3. Download PNG tile + metadata JSON with:
   - `./scripts/fetch_terrarium_tile.sh [lat lon zoom out_dir name_prefix]`
4. Decode terrain in app using Terrarium formula:
   - `height_m = R * 256 + G + B / 256 - 32768`

## Runtime Terrain Strategy (Current)
- Dynamic multi-tile DEM mesh around camera at `z11`.
- LOD rings by tile distance:
  - Ring 0: high detail (255 segments)
  - Ring 1: medium detail (96 segments)
  - Ring 2: low detail (48 segments)
- Optional Google satellite imagery drape via Map Tiles API:
  - `POST /v1/createSession`
  - `GET /v1/2dtiles/{z}/{x}/{y}?session=...&key=...`
- Fog and simple materials for performance.

## Runtime Terrain Strategy (Next)
- Tile-level frustum culling and prioritized load queue.
- Extend to 3+ LOD rings with hysteresis to reduce tile churn.
- Height sampling for collision floor and altitude cues.

## Controls
- `w`: forward thrust
- `s`: backward thrust
- `a`: yaw left
- `d`: yaw right
- `q`: strafe left
- `e`: strafe right
- `PageUp`: ascend
- `PageDown`: descend

## Performance Budget (MVP)
- 60 FPS target on mid-tier laptop GPU.
- Max active terrain triangles: ~300k.
- Avoid expensive shadows initially.
- Fog and atmospheric perspective to hide lower LOD transitions.

## Milestones
1. MVP: procedural terrain + keyboard fly controls.
2. Real DEM tile ingest + static DEM terrain rendering.
3. Runtime multi-tile chunk loading and LOD.
4. Water/river mask and POI overlays.
5. Optional guided tour path mode.
