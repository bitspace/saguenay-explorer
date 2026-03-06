import * as THREE from "https://unpkg.com/three@0.178.0/build/three.module.js";

const app = document.getElementById("app");
const hudSpeed = document.getElementById("hud-speed");
const hudAlt = document.getElementById("hud-alt");
const hudHeading = document.getElementById("hud-heading");

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa7c3d7, 120, 2200);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 130, 180);

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

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(5000, 5000, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0x507c99,
    metalness: 0.18,
    roughness: 0.58,
    transparent: true,
    opacity: 0.88,
  }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = 48;
scene.add(water);

// Procedural placeholder terrain with broad ridge/valley forms to mimic Saguenay relief.
const terrainSize = 2600;
const terrainSegments = 220;
const terrain = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
terrain.rotateX(-Math.PI / 2);

const pos = terrain.attributes.position;
const v = new THREE.Vector3();

for (let i = 0; i < pos.count; i += 1) {
  v.fromBufferAttribute(pos, i);

  const nx = v.x / terrainSize;
  const nz = v.z / terrainSize;

  const broadHills = Math.sin(nx * Math.PI * 3.8) * 36 + Math.cos(nz * Math.PI * 3.1) * 30;
  const mediumNoise = Math.sin((nx + nz * 0.7) * Math.PI * 15) * 9;

  const fjordAxis = Math.exp(-Math.pow((nx * 0.9 + nz * 0.25) * 2.8, 2));
  const valleyCut = -fjordAxis * 42;

  const northRise = Math.max(0, nz) * 65;
  const height = 70 + broadHills + mediumNoise + valleyCut + northRise;

  pos.setY(i, Math.max(18, height));
}

terrain.computeVertexNormals();

const terrainMesh = new THREE.Mesh(
  terrain,
  new THREE.MeshStandardMaterial({
    color: 0x7b9470,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: false,
  }),
);
scene.add(terrainMesh);

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
  if (!(key in keyMap)) {
    return;
  }

  keyDown.add(key);
  keyMap[key]();
  event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!keyDown.has(key)) {
    return;
  }

  keyDown.delete(key);
  updateMovementState();
  event.preventDefault();
});

function damp(value, amount, dt) {
  return THREE.MathUtils.damp(value, 0, amount, dt);
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

  camera.position.y = THREE.MathUtils.clamp(camera.position.y, 25, 1200);

  const speed = Math.hypot(forwardVel, strafeVel, verticalVel);
  const heading = THREE.MathUtils.radToDeg(camera.rotation.y);

  hudSpeed.textContent = `${speed.toFixed(1)} m/s`;
  hudAlt.textContent = `${camera.position.y.toFixed(1)} m`;
  hudHeading.textContent = `${((heading % 360) + 360).toFixed(0)}°`;

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
