import * as THREE from "https://unpkg.com/three@0.178.0/build/three.module.js";

const app = document.getElementById("app");
const hudSpeed = document.getElementById("hud-speed");
const hudAlt = document.getElementById("hud-alt");
const hudHeading = document.getElementById("hud-heading");
const hudCardinal = document.getElementById("hud-cardinal");
const hudSurface = document.getElementById("hud-surface");
const hudPois = document.getElementById("hud-pois");
const attribution = document.getElementById("attribution");

const TERRAIN_CENTER = {
  lat: 48.4283,
  lon: -71.0619,
  zoom: 11,
};

const TERRAIN_TILE_SIZE_PX = 256;
const TERRAIN_FETCH_TEMPLATE =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const TERRAIN_LOD_RINGS = [
  { radius: 0, segments: 255 },
  { radius: 1, segments: 96 },
  { radius: 2, segments: 48 },
];

const TERRAIN_MAX_RADIUS = TERRAIN_LOD_RINGS[TERRAIN_LOD_RINGS.length - 1].radius;
const TERRAIN_SYNC_INTERVAL_SECONDS = 0.2;
const TERRAIN_MAX_CONCURRENT_LOADS = 2;
const TERRAIN_ALWAYS_VISIBLE_RADIUS = 1;
const POI_LABEL_FONT = "600 16px 'IBM Plex Sans', sans-serif";

const FJORD_MASK_POINTS = [
  { lat: 48.432, lon: -70.92, rx: 900, rz: 300 },
  { lat: 48.405, lon: -70.985, rx: 900, rz: 280 },
  { lat: 48.395, lon: -71.055, rx: 860, rz: 260 },
  { lat: 48.41, lon: -71.14, rx: 760, rz: 240 },
];

const POIS = [
  { name: "La Baie", lat: 48.334, lon: -70.879 },
  { name: "Chicoutimi", lat: 48.428, lon: -71.064 },
  { name: "Jonquiere", lat: 48.416, lon: -71.25 },
  { name: "Saguenay", lat: 48.423, lon: -71.072 },
];

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa7c3d7, 160, 3600);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(0, 240, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x9fc2db, 1);
app.appendChild(renderer.domElement);

const terrainGroup = new THREE.Group();
scene.add(terrainGroup);
const overlayGroup = new THREE.Group();
scene.add(overlayGroup);

const hemiLight = new THREE.HemisphereLight(0xdbefff, 0x4a6170, 1.1);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff0da, 1.0);
sun.position.set(-300, 400, 200);
scene.add(sun);

const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(12000, 12000, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x6f8570, roughness: 0.98 }),
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -10;
scene.add(farGround);

const waterMeshes = [];

const keyDown = new Set();
const movement = {
  forward: 0,
  strafe: 0,
  vertical: 0,
  turn: 0,
};

const maxSpeed = 260;
const maxVerticalSpeed = 150;
const accel = 320;
const verticalAccel = 230;
const drag = 6;
const turnSpeed = 1.8;

let forwardVel = 0;
let strafeVel = 0;
let verticalVel = 0;

const keyMap = {
  w: () => (movement.forward = 1),
  s: () => (movement.forward = -1),
  q: () => (movement.strafe = -1),
  e: () => (movement.strafe = 1),
  a: () => (movement.turn = 1),
  d: () => (movement.turn = -1),
  PageUp: () => (movement.vertical = 1),
  PageDown: () => (movement.vertical = -1),
};

const terrainTiles = new Map();
const tileRequests = new Map();
const decodedTileCache = new Map();
let terrainLoadQueue = [];
let activeTerrainLoads = 0;

const googleTiles = {
  apiKey: "",
  session: "",
  ready: false,
  failed: false,
};

let terrainSyncTimer = 0;
let minLoadedHeight = Number.POSITIVE_INFINITY;
let maxLoadedHeight = Number.NEGATIVE_INFINITY;
let poiRenderedCount = 0;

const cameraFrustum = new THREE.Frustum();
const frustumMatrix = new THREE.Matrix4();
const forwardScratch = new THREE.Vector3();
const toTileScratch = new THREE.Vector3();
const tileSphereScratch = new THREE.Sphere(new THREE.Vector3(), 1);

function tileKey(x, y) {
  return `${x}/${y}`;
}

function tileRequestKey(x, y, segments) {
  return `${x}/${y}/${segments}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateMovementState() {
  movement.forward = keyDown.has("w") ? 1 : keyDown.has("s") ? -1 : 0;
  movement.strafe = keyDown.has("e") ? 1 : keyDown.has("q") ? -1 : 0;
  movement.turn = keyDown.has("a") ? 1 : keyDown.has("d") ? -1 : 0;
  movement.vertical = keyDown.has("PageUp") ? 1 : keyDown.has("PageDown") ? -1 : 0;
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!(key in keyMap)) return;

  keyDown.add(key);
  keyMap[key]();
  event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!keyDown.has(key)) return;

  keyDown.delete(key);
  updateMovementState();
  event.preventDefault();
});

function damp(value, amount, dt) {
  return THREE.MathUtils.damp(value, 0, amount, dt);
}

function metersPerPixelAtLatitude(latDeg, zoom) {
  const latRad = THREE.MathUtils.degToRad(latDeg);
  return (Math.cos(latRad) * 2 * Math.PI * 6378137) / (256 * 2 ** zoom);
}

function decodeTerrariumHeight(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

function headingToCardinal(headingDeg) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalized = (headingDeg % 360 + 360) % 360;
  const index = Math.round(normalized / 45) % directions.length;
  return directions[index];
}

function parseEnvValue(raw) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadApiKeyFromEnvFile() {
  try {
    const response = await fetch("./.env", { cache: "no-store" });
    if (!response.ok) return "";

    const body = await response.text();
    const lines = body.split(/\r?\n/);

    for (const line of lines) {
      const cleaned = line.trim();
      if (!cleaned || cleaned.startsWith("#") || !cleaned.includes("=")) continue;

      const sep = cleaned.indexOf("=");
      const key = cleaned.slice(0, sep).trim();
      const value = parseEnvValue(cleaned.slice(sep + 1));

      if (key === "MAP_TILES_API_KEY" || key === "GOOGLE_MAPS_API_KEY") {
        return value;
      }
    }

    return "";
  } catch {
    return "";
  }
}

async function resolveApiKey() {
  if (window.__APP_CONFIG__) {
    const fromConfig =
      window.__APP_CONFIG__.MAP_TILES_API_KEY || window.__APP_CONFIG__.GOOGLE_MAPS_API_KEY || "";
    if (fromConfig) return fromConfig;
  }

  return loadApiKeyFromEnvFile();
}

function lonLatToTile(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = THREE.MathUtils.degToRad(lat);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function lonLatToTileFloat(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = THREE.MathUtils.degToRad(lat);
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function terrariumTileUrl(zoom, x, y) {
  return TERRAIN_FETCH_TEMPLATE
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

async function createGoogleMapsSession(apiKey) {
  const response = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mapType: "satellite",
      language: "en-US",
      region: "CA",
      scale: "scaleFactor1x",
      highDpi: false,
      imageFormat: "png",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Map Tiles session failed (${response.status}): ${body}`);
  }

  const session = await response.json();
  if (!session.session) {
    throw new Error("Map Tiles session token was missing in response.");
  }

  return session.session;
}

function loadImage(path, crossOrigin = "") {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = crossOrigin;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${path}`));
    image.src = path;
  });
}

async function decodeTileHeights(x, y) {
  const cacheKey = tileKey(x, y);
  if (decodedTileCache.has(cacheKey)) {
    return decodedTileCache.get(cacheKey);
  }

  const image = await loadImage(terrariumTileUrl(TERRAIN_CENTER.zoom, x, y), "anonymous");

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  const decoded = { width: image.width, height: image.height, data };
  decodedTileCache.set(cacheKey, decoded);
  return decoded;
}

function buildTerrainGeometry(decoded, segments, tileSizeMeters) {
  const geometry = new THREE.PlaneGeometry(tileSizeMeters, tileSizeMeters, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < position.count; i += 1) {
    const px = clamp(Math.round(uv.getX(i) * (decoded.width - 1)), 0, decoded.width - 1);
    const py = clamp(Math.round((1 - uv.getY(i)) * (decoded.height - 1)), 0, decoded.height - 1);
    const idx = (py * decoded.width + px) * 4;

    const height = decodeTerrariumHeight(decoded.data[idx], decoded.data[idx + 1], decoded.data[idx + 2]);
    position.setY(i, height);

    if (height < minHeight) minHeight = height;
    if (height > maxHeight) maxHeight = height;
  }

  geometry.computeVertexNormals();

  const centerPx = Math.floor(decoded.width / 2);
  const centerPy = Math.floor(decoded.height / 2);
  const centerIdx = (centerPy * decoded.width + centerPx) * 4;
  const centerHeight = decodeTerrariumHeight(
    decoded.data[centerIdx],
    decoded.data[centerIdx + 1],
    decoded.data[centerIdx + 2],
  );

  return { geometry, minHeight, maxHeight, centerHeight };
}

async function applyGoogleSatelliteTexture(material, x, y) {
  if (!googleTiles.ready) return;

  const tileUrl =
    `https://tile.googleapis.com/v1/2dtiles/${TERRAIN_CENTER.zoom}/${x}/${y}` +
    `?session=${encodeURIComponent(googleTiles.session)}&key=${encodeURIComponent(googleTiles.apiKey)}`;

  const texture = await new THREE.TextureLoader().loadAsync(tileUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  material.map = texture;
  material.color.setHex(0xffffff);
  material.roughness = 0.92;
  material.needsUpdate = true;
}

function lodForDistance(dist) {
  for (const ring of TERRAIN_LOD_RINGS) {
    if (dist <= ring.radius) return ring.segments;
  }
  return TERRAIN_LOD_RINGS[TERRAIN_LOD_RINGS.length - 1].segments;
}

const centerTile = lonLatToTile(TERRAIN_CENTER.lon, TERRAIN_CENTER.lat, TERRAIN_CENTER.zoom);
const tileSizeMeters = metersPerPixelAtLatitude(TERRAIN_CENTER.lat, TERRAIN_CENTER.zoom) * TERRAIN_TILE_SIZE_PX;

function worldToTileIndex(worldX, worldZ) {
  return {
    x: centerTile.x + Math.round(worldX / tileSizeMeters),
    y: centerTile.y + Math.round(worldZ / tileSizeMeters),
  };
}

function tileToWorldPosition(x, y) {
  return {
    x: (x - centerTile.x) * tileSizeMeters,
    z: (y - centerTile.y) * tileSizeMeters,
  };
}

function lonLatToWorldPosition(lon, lat) {
  const tile = lonLatToTileFloat(lon, lat, TERRAIN_CENTER.zoom);
  return {
    x: (tile.x - centerTile.x) * tileSizeMeters,
    z: (tile.y - centerTile.y) * tileSizeMeters,
  };
}

function setWaterLevel(level) {
  for (const waterMesh of waterMeshes) {
    waterMesh.position.y = level;
  }
}

function createLabelSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(10, 18, 28, 0.72)";
  ctx.fillRect(12, 12, canvas.width - 24, canvas.height - 24);
  ctx.fillStyle = "#f4f8fb";
  ctx.font = POI_LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(300, 90, 1);
  sprite.renderOrder = 10;
  return sprite;
}

async function sampleHeightAtLonLat(lon, lat) {
  const tileFloat = lonLatToTileFloat(lon, lat, TERRAIN_CENTER.zoom);
  const x = Math.floor(tileFloat.x);
  const y = Math.floor(tileFloat.y);
  const decoded = await decodeTileHeights(x, y);

  const px = clamp(Math.round((tileFloat.x - x) * (decoded.width - 1)), 0, decoded.width - 1);
  const py = clamp(Math.round((tileFloat.y - y) * (decoded.height - 1)), 0, decoded.height - 1);
  const idx = (py * decoded.width + px) * 4;
  return decodeTerrariumHeight(decoded.data[idx], decoded.data[idx + 1], decoded.data[idx + 2]);
}

function createFjordMask() {
  for (const point of FJORD_MASK_POINTS) {
    const pos = lonLatToWorldPosition(point.lon, point.lat);
    const mask = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshStandardMaterial({
        color: 0x4b7693,
        metalness: 0.1,
        roughness: 0.6,
        transparent: true,
        opacity: 0.86,
      }),
    );
    mask.rotation.x = -Math.PI / 2;
    mask.scale.set(point.rx, point.rz, 1);
    mask.position.set(pos.x, 0, pos.z);
    mask.renderOrder = 2;
    overlayGroup.add(mask);
    waterMeshes.push(mask);
  }
}

async function createPoiOverlays() {
  poiRenderedCount = 0;
  hudPois.textContent = `0/${POIS.length}`;

  for (const poi of POIS) {
    try {
      const world = lonLatToWorldPosition(poi.lon, poi.lat);
      const groundHeight = await sampleHeightAtLonLat(poi.lon, poi.lat);

      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(6, 6, 120, 16),
        new THREE.MeshStandardMaterial({
          color: 0xffc94d,
          emissive: 0x5a3c00,
          emissiveIntensity: 0.45,
          roughness: 0.35,
          metalness: 0.18,
        }),
      );
      marker.position.set(world.x, groundHeight + 62, world.z);
      marker.renderOrder = 8;
      overlayGroup.add(marker);

      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(16, 24, 16),
        new THREE.MeshStandardMaterial({
          color: 0xfff3b0,
          emissive: 0xffd166,
          emissiveIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.05,
        }),
      );
      beacon.position.set(world.x, groundHeight + 135, world.z);
      beacon.renderOrder = 9;
      overlayGroup.add(beacon);

      const label = createLabelSprite(poi.name);
      label.position.set(world.x, groundHeight + 190, world.z);
      overlayGroup.add(label);

      poiRenderedCount += 1;
      hudPois.textContent = `${poiRenderedCount}/${POIS.length}`;
    } catch (error) {
      console.warn(`POI failed: ${poi.name}`, error);
      hudPois.textContent = `${poiRenderedCount}/${POIS.length} (error)`;
    }
  }
}

function updateCameraFrustum() {
  camera.updateMatrixWorld();
  frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  cameraFrustum.setFromProjectionMatrix(frustumMatrix);
}

function isTileLikelyVisible(x, y, currentTile) {
  const dx = x - currentTile.x;
  const dy = y - currentTile.y;
  const ringDistance = Math.max(Math.abs(dx), Math.abs(dy));
  if (ringDistance <= TERRAIN_ALWAYS_VISIBLE_RADIUS) {
    return true;
  }

  const worldPos = tileToWorldPosition(x, y);
  const verticalCenter =
    Number.isFinite(minLoadedHeight) && Number.isFinite(maxLoadedHeight)
      ? (minLoadedHeight + maxLoadedHeight) * 0.5
      : 200;
  const radius = Math.sqrt(2) * (tileSizeMeters * 0.5) + 500;

  tileSphereScratch.center.set(worldPos.x, verticalCenter, worldPos.z);
  tileSphereScratch.radius = radius;

  return cameraFrustum.intersectsSphere(tileSphereScratch);
}

function tilePriority(target, currentTile, cameraForward) {
  const dx = target.x - currentTile.x;
  const dy = target.y - currentTile.y;
  const ringDistance = Math.max(Math.abs(dx), Math.abs(dy));
  const worldPos = tileToWorldPosition(target.x, target.y);

  toTileScratch.set(worldPos.x - camera.position.x, 0, worldPos.z - camera.position.z);
  let isAhead = true;
  if (toTileScratch.lengthSq() > 1e-6) {
    toTileScratch.normalize();
    const facingDot = cameraForward.dot(toTileScratch);
    isAhead = facingDot > 0;
  }

  const visibleBias = target.visible ? 0 : 100;
  const aheadBias = isAhead ? -4 : 8;
  const lodBias = target.segments === TERRAIN_LOD_RINGS[0].segments ? -6 : 0;

  return visibleBias + ringDistance * 12 + aheadBias + lodBias;
}

function processTerrainLoadQueue() {
  while (activeTerrainLoads < TERRAIN_MAX_CONCURRENT_LOADS && terrainLoadQueue.length > 0) {
    const next = terrainLoadQueue.shift();
    const requestId = tileRequestKey(next.x, next.y, next.segments);

    if (tileRequests.has(requestId)) {
      continue;
    }

    activeTerrainLoads += 1;
    ensureTerrainTile(next.x, next.y, next.segments)
      .catch((error) => console.error(error))
      .finally(() => {
        activeTerrainLoads = Math.max(0, activeTerrainLoads - 1);
        processTerrainLoadQueue();
      });
  }
}

function disposeTile(tile) {
  terrainGroup.remove(tile.mesh);
  tile.mesh.geometry.dispose();

  if (tile.mesh.material.map) {
    tile.mesh.material.map.dispose();
  }

  tile.mesh.material.dispose();
}

async function ensureTerrainTile(x, y, segments) {
  const key = tileKey(x, y);
  const existing = terrainTiles.get(key);

  if (existing && existing.segments === segments) {
    return existing;
  }

  const requestId = tileRequestKey(x, y, segments);
  if (tileRequests.has(requestId)) {
    return tileRequests.get(requestId);
  }

  const promise = (async () => {
    const decoded = await decodeTileHeights(x, y);
    const built = buildTerrainGeometry(decoded, segments, tileSizeMeters);

    minLoadedHeight = Math.min(minLoadedHeight, built.minHeight);
    maxLoadedHeight = Math.max(maxLoadedHeight, built.maxHeight);

    const material = new THREE.MeshStandardMaterial({
      color: 0x7f9772,
      roughness: 0.95,
      metalness: 0.02,
    });

    const mesh = new THREE.Mesh(built.geometry, material);
    const worldPos = tileToWorldPosition(x, y);
    mesh.position.set(worldPos.x, 0, worldPos.z);

    terrainGroup.add(mesh);

    if (existing) {
      disposeTile(existing);
    }

    const tile = { x, y, segments, mesh, centerHeight: built.centerHeight };
    terrainTiles.set(key, tile);

    try {
      await applyGoogleSatelliteTexture(material, x, y);
    } catch {
      // Keep DEM-only material when Google imagery fails for a tile.
    }

    return tile;
  })();

  tileRequests.set(requestId, promise);

  try {
    return await promise;
  } finally {
    tileRequests.delete(requestId);
  }
}

function syncTerrainTiles(force = false) {
  if (!force && terrainSyncTimer < TERRAIN_SYNC_INTERVAL_SECONDS) {
    return;
  }

  terrainSyncTimer = 0;
  updateCameraFrustum();

  const currentTile = worldToTileIndex(camera.position.x, camera.position.z);
  camera.getWorldDirection(forwardScratch);
  forwardScratch.y = 0;
  forwardScratch.normalize();
  const desired = new Map();

  for (let dy = -TERRAIN_MAX_RADIUS; dy <= TERRAIN_MAX_RADIUS; dy += 1) {
    for (let dx = -TERRAIN_MAX_RADIUS; dx <= TERRAIN_MAX_RADIUS; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      if (distance > TERRAIN_MAX_RADIUS) continue;

      const x = currentTile.x + dx;
      const y = currentTile.y + dy;
      const segments = lodForDistance(distance);
      const visible = isTileLikelyVisible(x, y, currentTile);
      desired.set(tileKey(x, y), { x, y, segments, visible });
    }
  }

  const queue = [];

  for (const target of desired.values()) {
    const existing = terrainTiles.get(tileKey(target.x, target.y));
    if (!existing || existing.segments !== target.segments) {
      const requestId = tileRequestKey(target.x, target.y, target.segments);
      if (!tileRequests.has(requestId)) {
        queue.push({
          x: target.x,
          y: target.y,
          segments: target.segments,
          priority: tilePriority(target, currentTile, forwardScratch),
        });
      }
    }
  }

  queue.sort((a, b) => a.priority - b.priority);
  terrainLoadQueue = queue;
  processTerrainLoadQueue();

  for (const [key, tile] of terrainTiles.entries()) {
    if (!desired.has(key)) {
      disposeTile(tile);
      terrainTiles.delete(key);
      continue;
    }

    const target = desired.get(key);
    tile.mesh.visible = target.visible;
  }

  if (Number.isFinite(minLoadedHeight) && Number.isFinite(maxLoadedHeight)) {
    setWaterLevel(clamp(minLoadedHeight + 4, -5, 20));
  }
}

async function initGoogleTiles() {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    hudSurface.textContent = "DEM (local) - no key";
    googleTiles.failed = true;
    return;
  }

  try {
    const session = await createGoogleMapsSession(apiKey);
    googleTiles.apiKey = apiKey;
    googleTiles.session = session;
    googleTiles.ready = true;
    hudSurface.textContent = "Google Satellite";
    attribution.hidden = false;
  } catch (error) {
    googleTiles.failed = true;
    hudSurface.textContent = "DEM (local) - google failed";
    console.error(error);
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(0.05, clock.getDelta());
  terrainSyncTimer += dt;

  camera.rotation.y += movement.turn * turnSpeed * dt;

  forwardVel += movement.forward * accel * dt;
  strafeVel += movement.strafe * accel * dt;
  verticalVel += movement.vertical * verticalAccel * dt;

  forwardVel = clamp(forwardVel, -maxSpeed, maxSpeed);
  strafeVel = clamp(strafeVel, -maxSpeed, maxSpeed);
  verticalVel = clamp(verticalVel, -maxVerticalSpeed, maxVerticalSpeed);

  if (!movement.forward) forwardVel = damp(forwardVel, drag, dt);
  if (!movement.strafe) strafeVel = damp(strafeVel, drag, dt);
  if (!movement.vertical) verticalVel = damp(verticalVel, drag, dt);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  camera.position.addScaledVector(forward, forwardVel * dt);
  camera.position.addScaledVector(right, strafeVel * dt);
  camera.position.y += verticalVel * dt;

  camera.position.y = clamp(camera.position.y, -50, 3000);

  const speed = Math.hypot(forwardVel, strafeVel, verticalVel);
  const heading = THREE.MathUtils.radToDeg(Math.atan2(forward.x, -forward.z));
  const normalizedHeading = (heading + 360) % 360;

  hudSpeed.textContent = `${speed.toFixed(1)} m/s`;
  hudAlt.textContent = `${camera.position.y.toFixed(1)} m`;
  hudHeading.textContent = `${normalizedHeading.toFixed(0)}°`;
  hudCardinal.textContent = headingToCardinal(normalizedHeading);

  syncTerrainTiles();

  renderer.render(scene, camera);
}

async function init() {
  createFjordMask();
  await initGoogleTiles();

  try {
    const center = await ensureTerrainTile(centerTile.x, centerTile.y, TERRAIN_LOD_RINGS[0].segments);
    camera.position.set(0, center.centerHeight + 220, tileSizeMeters * 0.3);
  } catch (error) {
    console.error(error);
  }

  await createPoiOverlays();
  syncTerrainTiles(true);
  animate();
}

init();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
