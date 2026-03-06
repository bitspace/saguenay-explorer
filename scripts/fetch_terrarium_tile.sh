#!/usr/bin/env bash
set -euo pipefail

LAT="${1:-48.4283}"
LON="${2:--71.0619}"
ZOOM="${3:-10}"
OUT_DIR="${4:-assets/terrain}"
NAME_PREFIX="${5:-saguenay-center}"

read -r TILE_X TILE_Y MPP TILE_METERS <<VALUES
$(python3 - <<'PY' "$LAT" "$LON" "$ZOOM"
import math
import sys
lat = float(sys.argv[1])
lon = float(sys.argv[2])
zoom = int(sys.argv[3])
n = 2 ** zoom
x = int((lon + 180.0) / 360.0 * n)
lat_rad = math.radians(lat)
y = int((1.0 - math.log(math.tan(lat_rad) + (1.0 / math.cos(lat_rad))) / math.pi) / 2.0 * n)
mpp = math.cos(lat_rad) * (2.0 * math.pi * 6378137.0) / (256 * n)
print(x, y, mpp, mpp * 256)
PY
)
VALUES

mkdir -p "$OUT_DIR"
BASENAME="${NAME_PREFIX}-z${ZOOM}-x${TILE_X}-y${TILE_Y}"
PNG_PATH="${OUT_DIR}/${BASENAME}.png"
META_PATH="${OUT_DIR}/${BASENAME}.json"
URL="https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${TILE_X}/${TILE_Y}.png"

curl -fL "$URL" -o "$PNG_PATH"

cat > "$META_PATH" <<JSON
{
  "name": "${BASENAME}",
  "source": "Mapzen Terrarium via elevation-tiles-prod",
  "url": "${URL}",
  "lat": ${LAT},
  "lon": ${LON},
  "zoom": ${ZOOM},
  "tileX": ${TILE_X},
  "tileY": ${TILE_Y},
  "metersPerPixelAtLat": ${MPP},
  "tileSizeMetersAtLat": ${TILE_METERS},
  "format": "Terrarium PNG (height = R*256 + G + B/256 - 32768)"
}
JSON

echo "Saved DEM tile: ${PNG_PATH}"
echo "Saved metadata: ${META_PATH}"
