import * as THREE from "https://unpkg.com/three@0.178.0/build/three.module.js";

const app = document.getElementById("app");
const hudSpeed = document.getElementById("hud-speed");
const hudAlt = document.getElementById("hud-alt");
const hudHeading = document.getElementById("hud-heading");
const hudCardinal = document.getElementById("hud-cardinal");
const hudSurface = document.getElementById("hud-surface");
const attribution = document.getElementById("attribution");

const TERRAIN_TILE = {
  lat: 48.4283,
  lon: -71.0619,
  zoom: 10,
  imagePath: "./assets/terrain/saguenay-center-z10-x309-y354.png",
};

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa7c3d7, 140, 3000);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 7000);
camera.position.set(0, 240, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x9fc2db, 1);
app.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xdbefff, 0x4a6170, 1.1);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff0da, 1.0);
sun.position.set(-300, 400, 200);
scene.add(sun);

const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(9000, 9000, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x6f8570, roughness: 0.98 }),
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -10;
scene.add(farGround);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(9000, 9000, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0x4b7693,
    metalness: 0.14,
    roughness: 0.62,
    transparent: true,
    opacity: 0.84,
  }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = 0;
scene.add(water);

const keyDown = new Set();
const movement = {
  forward: 0,
  strafe: 0,
  vertical: 0,
  turn: 0,
};

const maxSpeed = 220;
const maxVerticalSpeed = 140;
const accel = 300;
const verticalAccel = 220;
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

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load terrain image: ${path}`));
    image.src = path;
  });
}

async function createTerrainMesh() {
  const image = await loadImage(TERRAIN_TILE.imagePath);

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  const { data } = ctx.getImageData(0, 0, image.width, image.height);

  const tileSizeMeters = metersPerPixelAtLatitude(TERRAIN_TILE.lat, TERRAIN_TILE.zoom) * image.width;
  const geometry = new THREE.PlaneGeometry(tileSizeMeters, tileSizeMeters, image.width - 1, image.height - 1);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < position.count; i += 1) {
    const px = Math.min(image.width - 1, Math.max(0, Math.round(uv.getX(i) * (image.width - 1))));
    const py = Math.min(image.height - 1, Math.max(0, Math.round((1 - uv.getY(i)) * (image.height - 1))));
    const idx = (py * image.width + px) * 4;

    const height = decodeTerrariumHeight(data[idx], data[idx + 1], data[idx + 2]);
    position.setY(i, height);

    if (height < minHeight) minHeight = height;
    if (height > maxHeight) maxHeight = height;
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x7f9772,
    roughness: 0.95,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geometry, material);

  const centerPx = Math.floor(image.width / 2);
  const centerPy = Math.floor(image.height / 2);
  const centerIdx = (centerPy * image.width + centerPx) * 4;
  const centerHeight = decodeTerrariumHeight(data[centerIdx], data[centerIdx + 1], data[centerIdx + 2]);

  return { mesh, material, minHeight, maxHeight, centerHeight };
}

async function applyGoogleSatelliteTexture(material) {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    hudSurface.textContent = "DEM (local) - no key";
    return;
  }

  const sessionToken = await createGoogleMapsSession(apiKey);
  const tile = lonLatToTile(TERRAIN_TILE.lon, TERRAIN_TILE.lat, TERRAIN_TILE.zoom);
  const tileUrl =
    `https://tile.googleapis.com/v1/2dtiles/${TERRAIN_TILE.zoom}/${tile.x}/${tile.y}` +
    `?session=${encodeURIComponent(sessionToken)}&key=${encodeURIComponent(apiKey)}`;

  const texture = await new THREE.TextureLoader().loadAsync(tileUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  material.map = texture;
  material.color.setHex(0xffffff);
  material.roughness = 0.92;
  material.needsUpdate = true;

  hudSurface.textContent = "Google Satellite";
  attribution.hidden = false;
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(0.05, clock.getDelta());

  camera.rotation.y += movement.turn * turnSpeed * dt;

  forwardVel += movement.forward * accel * dt;
  strafeVel += movement.strafe * accel * dt;
  verticalVel += movement.vertical * verticalAccel * dt;

  forwardVel = THREE.MathUtils.clamp(forwardVel, -maxSpeed, maxSpeed);
  strafeVel = THREE.MathUtils.clamp(strafeVel, -maxSpeed, maxSpeed);
  verticalVel = THREE.MathUtils.clamp(verticalVel, -maxVerticalSpeed, maxVerticalSpeed);

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

  camera.position.y = THREE.MathUtils.clamp(camera.position.y, -50, 2000);

  const speed = Math.hypot(forwardVel, strafeVel, verticalVel);
  const heading = THREE.MathUtils.radToDeg(camera.rotation.y);
  const normalizedHeading = (heading % 360) + 360;

  hudSpeed.textContent = `${speed.toFixed(1)} m/s`;
  hudAlt.textContent = `${camera.position.y.toFixed(1)} m`;
  hudHeading.textContent = `${(normalizedHeading % 360).toFixed(0)}°`;
  hudCardinal.textContent = headingToCardinal(normalizedHeading);

  renderer.render(scene, camera);
}

async function init() {
  try {
    const terrain = await createTerrainMesh();
    scene.add(terrain.mesh);

    camera.position.set(0, terrain.centerHeight + 220, 380);
    water.position.y = Math.max(0, Math.min(terrain.minHeight + 5, 15));

    try {
      await applyGoogleSatelliteTexture(terrain.material);
    } catch (error) {
      hudSurface.textContent = "DEM (local) - google failed";
      console.error(error);
    }
  } catch (error) {
    console.error(error);
  }

  animate();
}

init();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
