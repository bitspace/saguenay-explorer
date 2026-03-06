# Saguenay Explorer Implementation Spec

## Objective
Build a responsive web-based first-person flyover over Saguenay, QC with moderate terrain fidelity and strong interactivity.

## Technical Stack
- Three.js (WebGL)
- ES modules (no build step for MVP)
- Static hosting (GitHub Pages / Netlify / Vercel)

## Coordinate Strategy
- Local tangent plane around Saguenay center (approx. 48.43, -71.06).
- Convert geospatial DEM samples into local `x, y, z` meters.
- Keep camera and terrain in meter-scale units for movement tuning.

## Terrain Data Pipeline (Planned)
1. Source DEM for Saguenay area (CDEM/SRTM/Copernicus DEM).
2. Clip AOI around municipal extent + fjord corridor.
3. Reproject to metric CRS suitable for Quebec workflows.
4. Resample to performance-oriented resolutions:
   - Near chunks: 128x128 / 256x256
   - Far chunks: 64x64
5. Export tiled heightmaps and optional color masks:
   - `assets/terrain/z{L}/tile_x_y.bin` (Float32 or Uint16)
   - Metadata JSON for bounds, scale, and min/max elevation.

## Runtime Terrain Strategy
- Chunked terrain manager centered on camera.
- 2-3 LOD rings based on distance.
- Frustum culling and pooled meshes.
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
2. DEM ingest script + one static terrain tile set.
3. Runtime chunked LOD system.
4. Water/river mask and POI overlays.
5. Optional guided tour path mode.
