import * as THREE from "three";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.querySelector("#game");
const loading = document.querySelector("#loading");
const menu = document.querySelector("#menu");
const loadBar = document.querySelector("#loadBar");
const loadText = document.querySelector("#loadText");
const menuShip = document.querySelector("#menuShip");
const speedValue = document.querySelector("#speedValue");
const throttleValue = document.querySelector("#throttleValue");
const verticalValue = document.querySelector("#verticalValue");
const dampValue = document.querySelector("#dampValue");
const shipLabel = document.querySelector("#shipLabel");
const shipMarkerLayer = document.querySelector("#shipMarkers");
const zoneLabel = document.querySelector("#zoneLabel");
const targetReadout = document.querySelector("#targetReadout");
const radar = document.querySelector("#radar");
const radarCtx = radar.getContext("2d");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 90000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const clock = new THREE.Clock();
const keys = new Map();
const pointer = { locked: false, yaw: 0, pitch: 0 };
const markerWorld = new THREE.Vector3();
const markerCameraSpace = new THREE.Vector3();
const markerScreen = new THREE.Vector2();
const tempVec = new THREE.Vector3();

const EARTH_CENTER = new THREE.Vector3(0, 0, 0);
const EARTH_RADIUS_KM = 6371.0;
const EARTH_MU_KM3S2 = 398600.4418;
const MOON_RADIUS_KM = 1737.4;
const MOON_DISTANCE_KM = 384400;
const WORLD_UNITS_PER_KM = 0.08;
const SIM_TIME_WARP = 45;
const EARTH_RADIUS = EARTH_RADIUS_KM * WORLD_UNITS_PER_KM;
const ORBIT_ALTITUDE_KM = 700;
const ORBIT_RADIUS_KM = EARTH_RADIUS_KM + ORBIT_ALTITUDE_KM;
const ORBIT_RADIUS = ORBIT_RADIUS_KM * WORLD_UNITS_PER_KM;
const ORBIT_SPEED_KM_SEC = Math.sqrt(EARTH_MU_KM3S2 / ORBIT_RADIUS_KM);
const ORBIT_ANGULAR_SPEED = Math.sqrt(EARTH_MU_KM3S2 / (ORBIT_RADIUS_KM ** 3));
const ORBIT_PERIOD_SEC = (Math.PI * 2) / ORBIT_ANGULAR_SPEED;
const ORBIT_INCLINATION = THREE.MathUtils.degToRad(23.4);

const satelliteConfigs = [
  { name: "SMAP-01", role: "NASA/JPL satellite", model: "./assets/models/satellites/SMAP.glb", phase: 0, size: 4, rotation: [0, Math.PI, 0] },
  { name: "GOES-R", role: "NOAA/NASA satellite", model: "./assets/models/satellites/GOES-R_1m.glb", phase: Math.PI * 0.5, size: 5, rotation: [0, Math.PI, 0] },
  { name: "SMAP-02", role: "NASA/JPL satellite", model: "./assets/models/satellites/SMAP.glb", phase: Math.PI, size: 4, rotation: [0, Math.PI, 0] },
  { name: "GOES-R-B", role: "NOAA/NASA satellite", model: "./assets/models/satellites/GOES-R_1m.glb", phase: Math.PI * 1.5, size: 5, rotation: [0, Math.PI, 0] },
];

let satellites = [];
let activeIndex = 0;
let skySphere;
let earth;
let moon;
let started = false;
let loadDone = false;
let orbitBaseAngle = -1.2;
const modelTestMode = new URLSearchParams(window.location.search).get("modeltest") === "1";

class Satellite {
  constructor(config) {
    this.config = config;
    this.root = new THREE.Group();
    this.root.name = config.name;
    this.angle = orbitBaseAngle + config.phase;
    this.velocity = new THREE.Vector3();
    this.markerElement = null;
    scene.add(this.root);
  }

  setVisual(object) {
    this.visual = object;
    if (this.config.rotation) this.visual.rotation.set(...this.config.rotation);
    normalizeObjectSize(this.visual, this.config.size);
    solidifyMaterials(this.visual);
    this.root.add(this.visual);
  }

  update(baseAngle) {
    this.angle = baseAngle + this.config.phase;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const incCos = Math.cos(ORBIT_INCLINATION);
    const incSin = Math.sin(ORBIT_INCLINATION);
    this.root.position.set(
      cos * ORBIT_RADIUS,
      sin * ORBIT_RADIUS * incSin,
      sin * ORBIT_RADIUS * incCos,
    );
    this.velocity.set(-sin, cos * incSin, cos * incCos).normalize().multiplyScalar(ORBIT_SPEED_KM_SEC);
    alignToVelocity(this.root, this.velocity, 1, 1);
    if (this.visual) this.visual.rotateZ(0.002);
  }
}

async function main() {
  setupLights();
  setupSky();
  setupEarthMoon();
  await loadSatellites();
  setupEvents();
  updateMenuShip();
  loading.classList.add("hidden");
  if (modelTestMode) started = true;
  else menu.classList.remove("hidden");
  loadDone = true;
  animate();
}

function setupLights() {
  scene.add(new THREE.AmbientLight(0x506070, 0.55));
  scene.add(new THREE.HemisphereLight(0xbfdfff, 0x080b12, 1.05));

  const sunLight = new THREE.DirectionalLight(0xffffff, 3.4);
  sunLight.position.set(-9000, 2600, 4200);
  scene.add(sunLight);

  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(160, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff1b8 }),
  );
  sunGlow.position.copy(sunLight.position).normalize().multiplyScalar(16000);
  sunGlow.name = "Distant Sun Light Source";
  scene.add(sunGlow);
}

function setupSky() {
  const texture = textureLoader.load("./assets/textures/milky_way_eso0932a.jpg");
  texture.colorSpace = THREE.SRGBColorSpace;
  skySphere = new THREE.Mesh(
    new THREE.SphereGeometry(30000, 64, 32),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide }),
  );
  scene.add(skySphere);
}

function setupEarthMoon() {
  const earthTexture = textureLoader.load("./assets/textures/earth_daymap_2k.jpg");
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 128, 64),
    new THREE.MeshStandardMaterial({
      map: earthTexture,
      emissive: 0xffffff,
      emissiveMap: earthTexture,
      emissiveIntensity: 0.16,
      roughness: 0.72,
      metalness: 0,
    }),
  );
  earth.name = "Earth";
  scene.add(earth);

  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(ORBIT_RADIUS, 0.85, 8, 256),
    new THREE.MeshBasicMaterial({ color: 0x6bdcff, transparent: true, opacity: 0.34 }),
  );
  orbit.rotation.x = Math.PI / 2 - ORBIT_INCLINATION;
  scene.add(orbit);

  const moonTexture = textureLoader.load("./assets/textures/moon_2k.jpg");
  moonTexture.colorSpace = THREE.SRGBColorSpace;
  moon = new THREE.Mesh(
    new THREE.SphereGeometry(MOON_RADIUS_KM * WORLD_UNITS_PER_KM, 64, 32),
    new THREE.MeshStandardMaterial({
      map: moonTexture,
      emissive: 0xffffff,
      emissiveMap: moonTexture,
      emissiveIntensity: 0.08,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  moon.position.set(MOON_DISTANCE_KM * WORLD_UNITS_PER_KM, 0, -9000);
  moon.name = "Static Moon";
  scene.add(moon);
}

async function loadSatellites() {
  satellites = [];
  let done = 0;
  const tasks = satelliteConfigs.map(async (config) => {
    const satellite = new Satellite(config);
    satellites.push(satellite);
    const model = await loadGltf(config.model);
    satellite.setVisual(model);
    satellite.update(orbitBaseAngle);
    done += 1;
    loadBar.style.width = `${Math.round((done / satelliteConfigs.length) * 100)}%`;
    loadText.textContent = `Loaded ${config.name}`;
  });
  loadBar.style.width = "20%";
  loadText.textContent = "Loading satellite models";
  await Promise.all(tasks);
  loadBar.style.width = "100%";
  loadText.textContent = "Earth orbit ready";
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function normalizeObjectSize(object, targetSize) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) return;
  const scale = targetSize / maxDimension;
  object.scale.setScalar(scale);
  object.position.sub(center.multiplyScalar(scale));
}

function solidifyMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.frustumCulled = false;
    const isArray = Array.isArray(child.material);
    const materials = isArray ? child.material : [child.material];
    const mapped = materials.map((mat) => {
      const next = mat?.clone ? mat.clone() : new THREE.MeshStandardMaterial({ color: 0xcfd8df });
      next.transparent = false;
      next.opacity = 1;
      next.depthWrite = true;
      next.depthTest = true;
      next.side = THREE.DoubleSide;
      next.needsUpdate = true;
      return next;
    });
    child.material = isArray ? mapped : mapped[0];
  });
}

function setupEvents() {
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (event) => {
    keys.set(event.code, true);
    if (event.code === "KeyN") setActiveSatellite(activeIndex + 1, true);
    if (event.code === "KeyB") setActiveSatellite(activeIndex - 1, true);
    if (event.code === "KeyR") resetOrbit();
    if (event.code === "Escape") document.exitPointerLock?.();
  });
  window.addEventListener("keyup", (event) => keys.set(event.code, false));
  canvas.addEventListener("click", () => canvas.requestPointerLock?.());
  document.addEventListener("pointerlockchange", () => {
    pointer.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener("mousemove", (event) => {
    if (!pointer.locked) return;
    pointer.yaw += THREE.MathUtils.clamp(event.movementX * 0.0025, -0.55, 0.55);
    pointer.pitch += THREE.MathUtils.clamp(event.movementY * -0.0025, -0.55, 0.55);
  });

  document.querySelector("#startBtn").addEventListener("click", startGame);
  document.querySelector("#hudStartBtn").addEventListener("click", () => canvas.requestPointerLock?.());
  document.querySelector("#nextShipBtn").addEventListener("click", () => setActiveSatellite(activeIndex + 1, true));
  document.querySelector("#hudShipBtn").addEventListener("click", () => setActiveSatellite(activeIndex + 1, true));
  document.querySelector("#hudPrevBtn").addEventListener("click", () => setActiveSatellite(activeIndex - 1, true));
  document.querySelector("#mapBtn").addEventListener("click", () => {});
  document.querySelector("#hudMapBtn").addEventListener("click", () => {});
  document.querySelector("#hudCamBtn").addEventListener("click", () => {});
  document.querySelector("#hudResetBtn").addEventListener("click", resetOrbit);
}

function startGame() {
  started = true;
  menu.classList.add("hidden");
  canvas.requestPointerLock?.();
}

function setActiveSatellite(index, snapCamera = false) {
  activeIndex = (index + satellites.length) % satellites.length;
  updateMenuShip();
  if (snapCamera) updateCamera(1);
}

function activeSatellite() {
  return satellites[activeIndex];
}

function resetOrbit() {
  orbitBaseAngle = -1.2;
  for (const satellite of satellites) satellite.update(orbitBaseAngle);
  setActiveSatellite(activeIndex, true);
}

function updateMenuShip() {
  const satellite = activeSatellite();
  if (!satellite) return;
  menuShip.innerHTML = `<b>${satellite.config.name}</b> / ${satellite.config.role}<br>Altitude ${ORBIT_ALTITUDE_KM} km / Period ${(ORBIT_PERIOD_SEC / 60).toFixed(1)} min`;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (!loadDone) return;

  if (started || modelTestMode) orbitBaseAngle += ORBIT_ANGULAR_SPEED * SIM_TIME_WARP * dt;
  for (const satellite of satellites) satellite.update(orbitBaseAngle);

  earth.rotation.y += dt * 0.012;
  moon.rotation.y += dt * 0.004;
  skySphere.position.copy(camera.position);

  updateCamera(dt);
  updateHud();
  updateMarkers();
  renderer.render(scene, camera);
}

function updateCamera(dt) {
  const satellite = activeSatellite();
  if (!satellite) return;
  const movement = satellite.velocity.clone().normalize();
  const radial = satellite.root.position.clone().normalize();
  const desired = satellite.root.position.clone()
    .addScaledVector(movement, -34)
    .addScaledVector(radial, 20);
  camera.position.lerp(desired, Math.min(1, dt * 3.8));
  const target = satellite.root.position.clone()
    .addScaledVector(movement, 14)
    .addScaledVector(radial, 2);
  camera.lookAt(target);
}

function updateHud() {
  const satellite = activeSatellite();
  if (!satellite) return;
  const nearest = nearestSatellite(satellite);
  speedValue.textContent = ORBIT_SPEED_KM_SEC.toFixed(2);
  throttleValue.textContent = "AUTO";
  verticalValue.textContent = `${ORBIT_ALTITUDE_KM} KM`;
  dampValue.textContent = `x${SIM_TIME_WARP}`;
  shipLabel.textContent = `CONTROL: ${satellite.config.name} // ${satellite.config.role} // THIRD PERSON`;
  zoneLabel.textContent = "MAP: EARTH ORBIT";
  targetReadout.innerHTML = `
    TARGET LOCK<br>
    <b>${nearest.satellite.config.name}</b><br>
    RANGE ${(nearest.distance / WORLD_UNITS_PER_KM).toFixed(0)} KM<br>
    ALTITUDE ${ORBIT_ALTITUDE_KM} KM<br>
    PERIOD ${(ORBIT_PERIOD_SEC / 60).toFixed(1)} MIN
  `;
  drawOrbitMap(satellite);
}

function nearestSatellite(satellite) {
  let best = null;
  let bestDistance = Infinity;
  for (const other of satellites) {
    if (other === satellite) continue;
    const distance = satellite.root.position.distanceTo(other.root.position);
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return { satellite: best, distance: bestDistance };
}

function drawOrbitMap(active) {
  radarCtx.clearRect(0, 0, radar.width, radar.height);
  const cx = radar.width / 2;
  const cy = radar.height / 2;
  const scale = 64 / ORBIT_RADIUS_KM;
  radarCtx.fillStyle = "rgba(1, 10, 18, .72)";
  radarCtx.fillRect(0, 0, radar.width, radar.height);

  const earthRadius = EARTH_RADIUS_KM * scale;
  const earthGradient = radarCtx.createRadialGradient(cx - 5, cy - 7, 1, cx, cy, earthRadius);
  earthGradient.addColorStop(0, "#e0ffff");
  earthGradient.addColorStop(0.45, "#2d9fe5");
  earthGradient.addColorStop(1, "#123a88");
  radarCtx.fillStyle = earthGradient;
  radarCtx.beginPath();
  radarCtx.arc(cx, cy, earthRadius, 0, Math.PI * 2);
  radarCtx.fill();

  radarCtx.strokeStyle = "rgba(228, 170, 85, .82)";
  radarCtx.lineWidth = 2;
  radarCtx.beginPath();
  radarCtx.arc(cx, cy, ORBIT_RADIUS_KM * scale, 0, Math.PI * 2);
  radarCtx.stroke();

  for (const satellite of satellites) {
    const radius = ORBIT_RADIUS_KM * scale;
    const x = cx + Math.cos(satellite.angle) * radius;
    const y = cy + Math.sin(satellite.angle) * radius;
    radarCtx.fillStyle = satellite === active ? "#e4aa55" : "#50c8f0";
    radarCtx.beginPath();
    radarCtx.arc(x, y, satellite === active ? 4 : 3, 0, Math.PI * 2);
    radarCtx.fill();
    radarCtx.fillStyle = "rgba(223, 246, 255, .9)";
    radarCtx.font = "10px Arial";
    radarCtx.fillText(satellite.config.name.replace(/-.*/, ""), x + 6, y - 4);
  }
}

function updateMarkers() {
  if (!shipMarkerLayer) return;
  const active = activeSatellite();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  for (const satellite of satellites) {
    if (satellite === active) {
      hideMarker(satellite);
      continue;
    }
    const marker = ensureMarker(satellite);
    marker.style.display = "";
    markerWorld.copy(satellite.root.position);
    markerCameraSpace.copy(markerWorld).applyMatrix4(camera.matrixWorldInverse);
    const inFront = markerCameraSpace.z < -1;
    const projected = markerWorld.clone().project(camera);
    const sx = inFront ? projected.x : -projected.x;
    const sy = inFront ? projected.y : -projected.y;
    let x = (sx * 0.5 + 0.5) * width;
    let y = (-sy * 0.5 + 0.5) * height;
    const onScreen = inFront && projected.x > -0.88 && projected.x < 0.88 && projected.y > -0.78 && projected.y < 0.78;
    if (!onScreen) {
      const angle = Math.atan2(y - centerY, x - centerX);
      const edge = pointOnScreenEdge(angle, width, height);
      x = edge.x;
      y = edge.y;
    }
    const angleDeg = Math.atan2(y - centerY, x - centerX) * THREE.MathUtils.RAD2DEG;
    const distanceKm = active.root.position.distanceTo(satellite.root.position) / WORLD_UNITS_PER_KM;
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.style.setProperty("--marker-angle", `${angleDeg}deg`);
    marker.classList.toggle("edge", !onScreen);
    marker.innerHTML = `<span class="marker-name">${satellite.config.name}</span><span class="marker-distance">${distanceKm.toFixed(0)} KM</span>`;
  }
}

function ensureMarker(satellite) {
  if (satellite.markerElement) return satellite.markerElement;
  const marker = document.createElement("div");
  marker.className = "ship-marker";
  shipMarkerLayer.appendChild(marker);
  satellite.markerElement = marker;
  return marker;
}

function hideMarker(satellite) {
  if (satellite.markerElement) satellite.markerElement.style.display = "none";
}

function pointOnScreenEdge(angle, width, height) {
  const marginX = 74;
  const marginTop = 88;
  const marginBottom = 154;
  const maxX = width * 0.5 - marginX;
  const maxY = height * 0.5 - marginBottom;
  const minY = -(height * 0.5 - marginTop);
  const dx = Math.cos(angle) || 0.0001;
  const dy = Math.sin(angle) || 0.0001;
  let scale = Infinity;
  if (dx > 0) scale = Math.min(scale, maxX / dx);
  if (dx < 0) scale = Math.min(scale, -maxX / dx);
  if (dy > 0) scale = Math.min(scale, maxY / dy);
  if (dy < 0) scale = Math.min(scale, minY / dy);
  tempVec.set(width * 0.5 + dx * scale, height * 0.5 + dy * scale, 0);
  markerScreen.set(
    THREE.MathUtils.clamp(tempVec.x, marginX, width - marginX),
    THREE.MathUtils.clamp(tempVec.y, marginTop, height - marginBottom),
  );
  return markerScreen;
}

function alignToVelocity(root, velocity, dt, strength = 1) {
  if (velocity.lengthSq() < 0.001) return;
  const target = root.position.clone().sub(velocity);
  const look = new THREE.Matrix4().lookAt(root.position, target, root.position.clone().normalize());
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(look);
  root.quaternion.slerp(targetQuat, Math.min(1, dt * strength));
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

main().catch((error) => {
  console.error(error);
  loadText.textContent = `Load error: ${error.message}`;
});
