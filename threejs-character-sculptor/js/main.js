import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SculptMesh } from './sculptMesh.js';
import { PRESETS } from './presets.js';
import { exportModel, download } from './exporters.js';

// ---------------------------------------------------------------------------
// Brush catalogue

const ICON = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TOOLS = [
  { id: 'draw', label: 'Draw', hint: 'Push the surface out along its normal. Invert to carve in.',
    icon: ICON('<path d="M3 17c4 0 4-8 9-8s5 8 9 8"/>') },
  { id: 'clay', label: 'Clay', hint: 'Build up flat layers of clay, like adding strips by hand.',
    icon: ICON('<path d="M3 17h18"/><path d="M6 17v-4h12v4"/><path d="M9 13v-3h6v3"/>') },
  { id: 'inflate', label: 'Inflate', hint: 'Swell the surface outward in every direction. Great for cheeks and muscles.',
    icon: ICON('<circle cx="12" cy="12" r="5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>') },
  { id: 'smooth', label: 'Smooth', hint: 'Relax bumps and soften forms. Hold Shift with any brush to smooth.',
    icon: ICON('<path d="M3 15c3-3 6-3 9 0s6 3 9 0"/>') },
  { id: 'flatten', label: 'Flatten', hint: 'Press the surface onto a plane to make planes and hard edges.',
    icon: ICON('<path d="M3 16h18"/><path d="M5 12l3-3 3 3 3-3 3 3 2-2"/>') },
  { id: 'pinch', label: 'Pinch', hint: 'Pull nearby surface toward the brush to sharpen edges.',
    icon: ICON('<path d="M4 6l6 6-6 6"/><path d="M20 6l-6 6 6 6"/>') },
  { id: 'crease', label: 'Crease', hint: 'Cut sharp grooves for lips, eyelids and wrinkles. Invert for ridges.',
    icon: ICON('<path d="M3 8l9 9 9-9"/>') },
  { id: 'grab', label: 'Grab', hint: 'Drag a chunk of the model around to change proportions and pose.',
    icon: ICON('<path d="M8 11V5a1.5 1.5 0 013 0v5"/><path d="M11 10V4a1.5 1.5 0 013 0v6"/><path d="M14 10V6a1.5 1.5 0 013 0v7c0 4-3 7-6 7s-4-1-6-4l-2-3a1.5 1.5 0 012.5-1.5L8 14v-3"/>') },
  { id: 'paint', label: 'Paint', hint: 'Paint vertex colour onto the model. Exported with GLB.',
    icon: ICON('<path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 21h6"/>') },
];

const DEFAULT_STRENGTH = { draw: 0.5, clay: 0.5, inflate: 0.4, smooth: 0.6, flatten: 0.5, pinch: 0.5, crease: 0.5, grab: 1, paint: 0.7 };
const SWATCHES = ['#e8c4a8', '#c68a6a', '#8d5a3b', '#b5483b', '#e0b84a', '#4f7a4a', '#3c6aa8', '#6b4a8f', '#2a2a2e', '#f2f0eb'];
const DETAIL = { low: 120, medium: 170, high: 240 };
const BASE_COLOR = '#d9c3b0';

// ---------------------------------------------------------------------------
// Renderer, scene, camera

const container = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);

const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
key.position.set(2, 3, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
key.shadow.camera.right = key.shadow.camera.top = 1.5;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.01;
scene.add(key);
const rim = new THREE.DirectionalLight(0xbfd4ff, 1.2);
rim.position.set(-3, 2, -2);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x3a3229, 0.6));

const floor = new THREE.Group();
const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.ShadowMaterial({ opacity: 0.28 }));
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.receiveShadow = true;
floor.add(shadowCatcher);
const grid = new THREE.PolarGridHelper(1.6, 8, 6, 64, 0x555b66, 0x3b4049);
grid.position.y = 0.001;
grid.material.transparent = true;
grid.material.opacity = 0.5;
floor.add(grid);
scene.add(floor);

// ---------------------------------------------------------------------------
// Materials

function makeMatcap(stops, highlight = 0.9, rimColor = null) {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(s * 0.38, s * 0.32, s * 0.02, s * 0.5, s * 0.5, s * 0.52);
  stops.forEach(([o, c]) => grad.addColorStop(o, c));
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  if (rimColor) {
    const r = g.createRadialGradient(s * 0.5, s * 0.5, s * 0.36, s * 0.5, s * 0.5, s * 0.5);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, rimColor);
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }
  const hl = g.createRadialGradient(s * 0.34, s * 0.28, 0, s * 0.34, s * 0.28, s * 0.14);
  hl.addColorStop(0, `rgba(255,255,255,${highlight})`);
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const materials = {
  studio: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }),
  'matcap-clay': new THREE.MeshMatcapMaterial({ vertexColors: true, matcap: makeMatcap([[0, '#fff'], [0.55, '#9a9a9a'], [1, '#2a2a2a']], 0.35, 'rgba(255,255,255,0.25)') }),
  'matcap-wax': new THREE.MeshMatcapMaterial({ vertexColors: true, matcap: makeMatcap([[0, '#ffb6a0'], [0.5, '#c0402e'], [1, '#3a0d08']], 0.8, 'rgba(255,120,90,0.35)') }),
  'matcap-jade': new THREE.MeshMatcapMaterial({ vertexColors: true, matcap: makeMatcap([[0, '#d6ffe6'], [0.5, '#4f9d76'], [1, '#0f2d22']], 0.9, 'rgba(160,255,210,0.35)') }),
  'matcap-chrome': new THREE.MeshMatcapMaterial({ vertexColors: true, matcap: makeMatcap([[0, '#ffffff'], [0.35, '#9aa6b8'], [0.6, '#2b2f38'], [0.8, '#c8cfda'], [1, '#1a1c20']], 1, 'rgba(255,255,255,0.4)') }),
};
// Matcaps treat vertex colours as a tint; keep the clay look neutral by default.

// ---------------------------------------------------------------------------
// Sculpt mesh + cursor

const sculpt = new SculptMesh(materials.studio);
scene.add(sculpt.mesh);

function makeCursor(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
  );
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
  );
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthTest: false, side: THREE.DoubleSide }),
  );
  g.add(ring, dot, fill);
  g.renderOrder = 10;
  g.children.forEach((c) => (c.renderOrder = 10));
  g.visible = false;
  scene.add(g);
  return g;
}
const cursor = makeCursor(0xffffff);
const mirrorCursor = makeCursor(0xffffff);
mirrorCursor.children.forEach((c) => (c.material.opacity *= 0.5));

const _z = new THREE.Vector3(0, 0, 1);
function placeCursor(c, point, normal, radius) {
  c.position.copy(point).addScaledVector(normal, 0.002);
  c.quaternion.setFromUnitVectors(_z, normal);
  c.scale.setScalar(radius);
  c.visible = true;
}

// ---------------------------------------------------------------------------
// State

const state = {
  tool: 'draw',
  radius: 0.08,
  strength: 0.5,
  strengthByTool: { ...DEFAULT_STRENGTH },
  symmetry: true,
  invert: false,
  paintColor: new THREE.Color('#b5483b'),
  preset: 'humanoid',
};
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 40;

// ---------------------------------------------------------------------------
// Controls. The sculpt pointerdown listener is registered BEFORE OrbitControls
// so it can disable orbiting when the press lands on the model.

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const ndc = new THREE.Vector2();
const canvas = renderer.domElement;

let stroke = null;
canvas.addEventListener('pointerdown', onPointerDown);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.rotateSpeed = 0.8;
controls.minDistance = 0.3;
controls.maxDistance = 8;
controls.autoRotateSpeed = 2;
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('pointerleave', () => { if (!stroke) hideCursors(); });

function pick(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(sculpt.mesh, false);
  return hits[0] || null;
}

function hitNormal(hit) {
  return hit.face.normal.clone().normalize();
}

function effectiveTool(e) {
  return e.shiftKey && state.tool !== 'grab' && state.tool !== 'paint' ? 'smooth' : state.tool;
}

function onPointerDown(e) {
  if (e.button !== 0 || stroke) return;
  const hit = pick(e.clientX, e.clientY);
  if (!hit) return; // let OrbitControls handle it
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
  pushUndo();

  const tool = effectiveTool(e);
  const invert = state.invert !== (e.ctrlKey || e.altKey || e.metaKey);
  stroke = { id: e.pointerId, tool, invert, lastX: e.clientX, lastY: e.clientY, lastDab: hit.point.clone(), travelled: 0 };

  if (tool === 'grab') {
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    stroke.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, hit.point);
    stroke.start = hit.point.clone();
    sculpt.beginGrab(hit.point, state.radius, state.symmetry);
  } else {
    applyDab(hit.point, tool, invert);
    commitFrame(tool);
  }
  updateCursor(hit);
}

function onPointerMove(e) {
  if (!stroke) {
    if (e.buttons === 0) updateCursor(pick(e.clientX, e.clientY));
    else hideCursors();
    return;
  }
  if (e.pointerId !== stroke.id) return;

  if (stroke.tool === 'grab') {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const p = raycaster.ray.intersectPlane(stroke.plane, new THREE.Vector3());
    if (p) {
      const d = p.sub(stroke.start);
      sculpt.updateGrab(d.x, d.y, d.z);
      sculpt.markDirty();
      const pt = stroke.start.clone().add(d);
      placeCursor(cursor, pt, camera.getWorldDirection(new THREE.Vector3()).negate(), state.radius);
      mirrorCursor.visible = false;
    }
    return;
  }

  // Resample the pointer path so fast strokes stay continuous.
  const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const points = coalesced.length ? coalesced : [e];
  const spacing = state.radius * 0.22;
  let lastHit = null;
  for (const pe of points) {
    const dx = pe.clientX - stroke.lastX, dy = pe.clientY - stroke.lastY;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
    for (let s = 1; s <= steps; s++) {
      const hit = pick(stroke.lastX + (dx * s) / steps, stroke.lastY + (dy * s) / steps);
      if (!hit) continue;
      lastHit = hit;
      stroke.travelled += hit.point.distanceTo(stroke.lastDab);
      stroke.lastDab.copy(hit.point);
      if (stroke.travelled >= spacing) {
        stroke.travelled = 0;
        applyDab(hit.point, stroke.tool, stroke.invert);
      }
    }
    stroke.lastX = pe.clientX; stroke.lastY = pe.clientY;
  }
  commitFrame(stroke.tool);
  if (lastHit) updateCursor(lastHit); else hideCursors();
}

function onPointerUp(e) {
  if (!stroke || e.pointerId !== stroke.id) return;
  if (stroke.tool === 'grab') {
    sculpt.endGrab();
    sculpt.refit();
  }
  stroke = null;
  controls.enabled = true;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  updateStats();
}

const _m = new THREE.Vector3();
function applyDab(point, tool, invert) {
  const s = tool === state.tool ? state.strength : state.strengthByTool[tool];
  sculpt.dab(tool, point, state.radius, s, invert, state.paintColor);
  // On the centre line the mirrored dab would overlap the first one.
  if (state.symmetry && Math.abs(point.x) > state.radius * 0.15) {
    _m.set(-point.x, point.y, point.z);
    sculpt.dab(tool, _m, state.radius, s, invert, state.paintColor);
  }
}

function commitFrame(tool) {
  if (tool === 'paint') sculpt.markDirty({ positions: false, colors: true });
  else { sculpt.markDirty(); sculpt.refit(); }
}

function updateCursor(hit) {
  if (!hit) return hideCursors();
  const n = hitNormal(hit);
  placeCursor(cursor, hit.point, n, state.radius);
  if (state.symmetry) {
    placeCursor(mirrorCursor, new THREE.Vector3(-hit.point.x, hit.point.y, hit.point.z), new THREE.Vector3(-n.x, n.y, n.z), state.radius);
  } else mirrorCursor.visible = false;
}

function hideCursors() { cursor.visible = false; mirrorCursor.visible = false; }

// ---------------------------------------------------------------------------
// Undo / redo

function pushUndo() {
  undoStack.push(sculpt.snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  syncUndoButtons();
}
function undo() {
  if (!undoStack.length || stroke) return;
  redoStack.push(sculpt.snapshot());
  sculpt.restore(undoStack.pop());
  syncUndoButtons();
}
function redo() {
  if (!redoStack.length || stroke) return;
  undoStack.push(sculpt.snapshot());
  sculpt.restore(redoStack.pop());
  syncUndoButtons();
}
function syncUndoButtons() {
  document.getElementById('undo').disabled = !undoStack.length;
  document.getElementById('redo').disabled = !redoStack.length;
}

// ---------------------------------------------------------------------------
// Model creation

const busy = document.getElementById('busy');

function frameModel(preset) {
  const { target, bounds: b } = PRESETS[preset];
  // Fit the model's height (or width on narrow screens) with some margin.
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const h = b.max[1] - b.min[1];
  const w = (b.max[0] - b.min[0]) / camera.aspect;
  const dist = (Math.max(h, w) * 0.62) / Math.tan(halfFov) + (b.max[2] - b.min[2]) / 2;
  controls.target.fromArray(target);
  camera.position.set(target[0] + dist * 0.25, target[1] + h * 0.08, target[2] + dist);
  controls.update();
}

function placeFloor() {
  const box = sculpt.mesh.geometry.boundingBox;
  floor.position.y = box.min.y;
  key.target.position.set(0, (box.min.y + box.max.y) / 2, 0);
  key.target.updateMatrixWorld();
}

async function newModel(preset, detail = 'medium') {
  busy.hidden = false;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const sdf = PRESETS[preset];
  const b = sdf.bounds;
  const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const t0 = performance.now();
  sculpt.build(sdf, size / DETAIL[detail], BASE_COLOR);
  sculpt.mesh.material = materials[document.getElementById('material').value];
  console.info(`Built ${preset} (${detail}) in ${(performance.now() - t0).toFixed(0)} ms`);
  state.preset = preset;
  hideCursors();
  undoStack.length = 0;
  redoStack.length = 0;
  syncUndoButtons();
  placeFloor();
  frameModel(preset);
  updateStats();
  busy.hidden = true;
}

function updateStats() {
  document.getElementById('stats').textContent =
    `${sculpt.vertexCount.toLocaleString()} vertices · ${sculpt.faceCount.toLocaleString()} triangles`;
}

// ---------------------------------------------------------------------------
// UI wiring

const toolsEl = document.getElementById('tools');
TOOLS.forEach((t, i) => {
  const b = document.createElement('button');
  b.className = 'tool';
  b.dataset.tool = t.id;
  b.title = `${t.label} (${i + 1})`;
  b.innerHTML = `${t.icon}<span class="label">${t.label}</span><span class="key">${i + 1}</span>`;
  b.addEventListener('click', () => setTool(t.id));
  toolsEl.appendChild(b);
});

const radiusEl = document.getElementById('radius');
const strengthEl = document.getElementById('strength');
const symEl = document.getElementById('symmetry');
const invEl = document.getElementById('invert');

function setTool(id) {
  state.strengthByTool[state.tool] = state.strength;
  state.tool = id;
  state.strength = state.strengthByTool[id];
  strengthEl.value = state.strength;
  const t = TOOLS.find((x) => x.id === id);
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
  document.getElementById('tool-name').textContent = t.label;
  document.getElementById('tool-hint').textContent = t.hint;
  document.getElementById('paint-row').hidden = id !== 'paint';
  const c = id === 'paint' ? state.paintColor : new THREE.Color(0xffffff);
  [cursor, mirrorCursor].forEach((g) => g.children.forEach((m) => m.material.color.copy(c)));
  syncOutputs();
}

function setRadius(r) {
  state.radius = THREE.MathUtils.clamp(r, +radiusEl.min, +radiusEl.max);
  radiusEl.value = state.radius;
  syncOutputs();
  cursor.scale.setScalar(state.radius);
  mirrorCursor.scale.setScalar(state.radius);
}

function syncOutputs() {
  document.getElementById('radius-out').textContent = state.radius.toFixed(3);
  document.getElementById('strength-out').textContent = Math.round(state.strength * 100) + '%';
}

radiusEl.addEventListener('input', () => setRadius(+radiusEl.value));
strengthEl.addEventListener('input', () => { state.strength = +strengthEl.value; syncOutputs(); });
symEl.addEventListener('change', () => { state.symmetry = symEl.checked; if (!state.symmetry) mirrorCursor.visible = false; });
invEl.addEventListener('change', () => { state.invert = invEl.checked; });

const paintEl = document.getElementById('paint-color');
function setPaint(hex) {
  paintEl.value = hex;
  state.paintColor.set(hex);
  if (state.tool === 'paint') setTool('paint');
}
paintEl.addEventListener('input', () => setPaint(paintEl.value));
const swatchEl = document.getElementById('swatches');
SWATCHES.forEach((hex) => {
  const b = document.createElement('button');
  b.style.background = hex;
  b.title = hex;
  b.addEventListener('click', () => setPaint(hex));
  swatchEl.appendChild(b);
});
document.getElementById('fill').addEventListener('click', () => { pushUndo(); sculpt.fillColor(state.paintColor); });

document.getElementById('smooth-all').addEventListener('click', () => { pushUndo(); sculpt.smoothAll(2, 0.5); });
document.getElementById('mirror').addEventListener('click', () => { pushUndo(); sculpt.mirror(false); });
document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);

const materialEl = document.getElementById('material');
materialEl.addEventListener('change', () => {
  sculpt.mesh.material = materials[materialEl.value];
  sculpt.mesh.material.wireframe = document.getElementById('wireframe').checked;
});
document.getElementById('wireframe').addEventListener('change', (e) => {
  Object.values(materials).forEach((m) => (m.wireframe = e.target.checked));
});
document.getElementById('turntable').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; });
document.getElementById('floor').addEventListener('change', (e) => { floor.visible = e.target.checked; });
document.getElementById('reset-view').addEventListener('click', () => frameModel(state.preset));

// Settings drawer on small screens
const settingsEl = document.getElementById('settings');
const toggleSettings = document.getElementById('toggle-settings');
toggleSettings.addEventListener('click', () => {
  const open = settingsEl.classList.toggle('open');
  toggleSettings.setAttribute('aria-expanded', String(open));
});

// New model dialog
const dialog = document.getElementById('new-dialog');
document.getElementById('new-model').addEventListener('click', () => dialog.showModal());
dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'ok') return;
  const fd = new FormData(dialog.querySelector('form'));
  newModel(fd.get('preset'), fd.get('detail'));
});

// Export menu
const exportBtn = document.getElementById('export-btn');
const exportMenu = document.getElementById('export-menu');
exportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; });
document.addEventListener('click', () => (exportMenu.hidden = true));
exportMenu.addEventListener('click', async (e) => {
  const kind = e.target.dataset.export;
  if (!kind) return;
  exportMenu.hidden = true;
  if (kind === 'png') return screenshot();
  await exportModel(kind, sculpt.mesh, `sculpt-${state.preset}`);
});

function screenshot() {
  const vis = [cursor.visible, mirrorCursor.visible];
  hideCursors();
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => download(blob, `sculpt-${state.preset}.png`), 'image/png');
  [cursor.visible, mirrorCursor.visible] = vis;
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea, dialog')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k >= '1' && k <= '9' && TOOLS[+k - 1]) setTool(TOOLS[+k - 1].id);
  else if (k === '[') setRadius(state.radius / 1.15);
  else if (k === ']') setRadius(state.radius * 1.15);
  else if (k === 'x') { symEl.checked = !symEl.checked; symEl.dispatchEvent(new Event('change')); }
  else if (k === 'i') { invEl.checked = !invEl.checked; state.invert = invEl.checked; }
  else if (k === 'w') { const w = document.getElementById('wireframe'); w.checked = !w.checked; w.dispatchEvent(new Event('change')); }
  else if (k === 'f') frameModel(state.preset);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Boot

setTool('draw');
setRadius(state.radius);
syncUndoButtons();
await newModel('humanoid', window.innerWidth < 760 ? 'low' : 'medium');

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// Expose for debugging / automated tests.
window.sculptor = { sculpt, state, camera, controls, setTool, newModel, undo, redo };
