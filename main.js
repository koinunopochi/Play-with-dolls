import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const canvas = document.getElementById('c');
const stage = document.getElementById('stage');

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f2f2);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(3.5, 2.2, 5);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(5, 10, 5);
scene.add(dir);
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(-5, 3, -5);
scene.add(fill);

const grid = new THREE.GridHelper(10, 10, 0x999999, 0xcccccc);
scene.add(grid);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1, 0);
orbit.enableDamping = true;

const tc = new TransformControls(camera, renderer.domElement);
tc.setSize(0.8);
tc.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
scene.add(tc);

// --- Selection ---
const selectables = [];
let selected = null;

function setSelected(obj) {
  selected = obj;
  if (obj) tc.attach(obj);
  else tc.detach();
}

function setMode(mode) {
  tc.setMode(mode);
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

// --- Mannequin ---
const skinColor = 0xeac9a8;
const accentColor = 0x6699cc;

function makeJointMesh(geometry, color) {
  const m = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 })
  );
  m.userData.kind = 'joint';
  return m;
}

function makeMannequin() {
  const root = new THREE.Group();
  root.userData.kind = 'figureRoot';
  root.userData.label = 'figure';

  // Pelvis pivot
  const pelvis = new THREE.Group();
  pelvis.position.y = 1.0;
  root.add(pelvis);

  // Torso (pivot at bottom = pelvis top)
  const torsoG = new THREE.BoxGeometry(0.55, 0.7, 0.32);
  torsoG.translate(0, 0.35, 0);
  const torso = makeJointMesh(torsoG, skinColor);
  torso.userData.partName = 'torso';
  pelvis.add(torso);
  selectables.push(torso);

  // Neck/Head (pivot at neck base)
  const headG = new THREE.SphereGeometry(0.18, 24, 18);
  headG.translate(0, 0.2, 0);
  const head = makeJointMesh(headG, skinColor);
  head.position.set(0, 0.7, 0);
  head.userData.partName = 'head';
  torso.add(head);
  selectables.push(head);

  // Arm (pivot at shoulder/elbow = top)
  function makeLimbSegment(parent, w, h, d, x, y, z, name) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, -h / 2, 0); // pivot at top
    const m = makeJointMesh(g, skinColor);
    m.position.set(x, y, z);
    m.userData.partName = name;
    parent.add(m);
    selectables.push(m);
    return m;
  }

  function makeArm(side) {
    const sx = side === 'L' ? -0.38 : 0.38;
    const upper = makeLimbSegment(torso, 0.16, 0.4, 0.16, sx, 0.62, 0, side + '_upperArm');
    const lower = makeLimbSegment(upper, 0.14, 0.38, 0.14, 0, -0.4, 0, side + '_lowerArm');
    return { upper, lower };
  }
  makeArm('L');
  makeArm('R');

  function makeLeg(side) {
    const sx = side === 'L' ? -0.14 : 0.14;
    const upper = makeLimbSegment(pelvis, 0.2, 0.5, 0.2, sx, 0, 0, side + '_upperLeg');
    const lower = makeLimbSegment(upper, 0.18, 0.45, 0.18, 0, -0.5, 0, side + '_lowerLeg');
    return { upper, lower };
  }
  makeLeg('L');
  makeLeg('R');

  // Visible root handle (small disc at feet) so the whole figure is selectable
  const handleG = new THREE.CylinderGeometry(0.25, 0.25, 0.04, 24);
  const handle = new THREE.Mesh(
    handleG,
    new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5 })
  );
  handle.position.y = 0.02;
  handle.userData.kind = 'figureHandle';
  handle.userData.figureRoot = root;
  root.add(handle);
  selectables.push(handle);

  return root;
}

// --- Primitives ---
function makePrimitive(kind) {
  let geo;
  if (kind === 'box') geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  else if (kind === 'cylinder') geo = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 24);
  else if (kind === 'sphere') geo = new THREE.SphereGeometry(0.35, 24, 18);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcccccc, roughness: 0.7, metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.kind = 'primitive';
  mesh.position.set(
    (Math.random() - 0.5) * 1.5,
    kind === 'box' ? 0.3 : (kind === 'cylinder' ? 0.4 : 0.35),
    (Math.random() - 0.5) * 1.5
  );
  selectables.push(mesh);
  return mesh;
}

// --- Add helpers ---
function addObject(obj) {
  scene.add(obj);
  setSelected(obj.userData.kind === 'figureRoot' ? obj : obj);
}

// --- Picking ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  downPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !downPos) return;
  const dx = e.clientX - downPos.x;
  const dy = e.clientY - downPos.y;
  downPos = null;
  if (Math.hypot(dx, dy) > 4) return; // drag, not click
  if (tc.dragging) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(selectables, false);
  if (hits.length === 0) {
    setSelected(null);
    return;
  }
  const obj = hits[0].object;
  if (obj.userData.kind === 'figureHandle') {
    setSelected(obj.userData.figureRoot);
  } else {
    setSelected(obj);
  }
});

// --- UI wiring ---
document.querySelectorAll('[data-add]').forEach(btn => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.add;
    if (kind === 'mannequin') {
      const m = makeMannequin();
      addObject(m);
    } else {
      const p = makePrimitive(kind);
      addObject(p);
    }
  });
});

document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

document.getElementById('parentBtn').addEventListener('click', () => {
  if (!selected) return;
  // Walk up to next meaningful node (figureRoot) or scene
  let p = selected.parent;
  while (p && p !== scene) {
    if (p.userData.kind === 'figureRoot') {
      setSelected(p);
      return;
    }
    p = p.parent;
  }
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  if (!selected) return;
  let top = selected;
  while (top.parent && top.parent !== scene) top = top.parent;
  top.traverse(o => {
    const i = selectables.indexOf(o);
    if (i >= 0) selectables.splice(i, 1);
  });
  scene.remove(top);
  setSelected(null);
});

document.getElementById('deselectBtn').addEventListener('click', () => setSelected(null));

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('全部消してリセットします。よろしいですか?')) return;
  setSelected(null);
  // Remove user-added objects (everything except lights/grid/ground/tc)
  const keep = new Set([grid, ground, tc, dir, fill]);
  const toRemove = [];
  scene.children.forEach(c => {
    if (c.isLight) return;
    if (keep.has(c)) return;
    toRemove.push(c);
  });
  toRemove.forEach(c => scene.remove(c));
  selectables.length = 0;
  // Add a fresh mannequin so screen isn't empty
  addObject(makeMannequin());
});

document.getElementById('exportBtn').addEventListener('click', () => {
  // Hide gizmo for clean shot
  const wasVisible = tc.visible;
  tc.visible = false;
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  tc.visible = wasVisible;

  const a = document.createElement('a');
  a.href = url;
  a.download = `thumbnail-rough-${Date.now()}.png`;
  a.click();
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'g' || e.key === 'G') setMode('translate');
  else if (e.key === 'r' || e.key === 'R') setMode('rotate');
  else if (e.key === 's' || e.key === 'S') setMode('scale');
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    document.getElementById('deleteBtn').click();
  } else if (e.key === 'Escape') {
    setSelected(null);
  }
});

// --- Resize ---
function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Initial scene ---
addObject(makeMannequin());
setMode('translate');

// --- Loop ---
function tick() {
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
