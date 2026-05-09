import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const canvas = document.getElementById('c');
const stage = document.getElementById('stage');
const viewport = document.getElementById('viewport');

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(window.devicePixelRatio);

const ASPECT = 16 / 9;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f2f2);

const camera = new THREE.PerspectiveCamera(40, ASPECT, 0.1, 1000);

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
  new THREE.MeshBasicMaterial({ visible: false })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1, 0);
orbit.enableDamping = true;

const tc = new TransformControls(camera, renderer.domElement);
tc.setSize(1.1);
tc.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
scene.add(tc);

// --- Selection + highlight ---
const selectables = [];
let selected = null;

function clearHighlight(obj) {
  if (!obj) return;
  obj.traverse(o => {
    if (o.material && o.userData._origEmissive !== undefined) {
      o.material.emissive.setHex(o.userData._origEmissive);
      delete o.userData._origEmissive;
    }
  });
}
function applyHighlight(obj) {
  if (!obj) return;
  obj.traverse(o => {
    if (o.material && o.material.emissive) {
      o.userData._origEmissive = o.material.emissive.getHex();
      o.material.emissive.setHex(0x224477);
    }
  });
}

function setSelected(obj) {
  clearHighlight(selected);
  selected = obj;
  applyHighlight(obj);
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
const accentColor = 0x4488dd;

function makeJointMesh(geometry, color) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 })
  );
}

function makeMannequin() {
  const root = new THREE.Group();
  root.userData.kind = 'figureRoot';

  const pelvis = new THREE.Group();
  pelvis.position.y = 1.0;
  pelvis.userData.partName = 'pelvis';
  root.add(pelvis);

  const torsoG = new THREE.BoxGeometry(0.55, 0.7, 0.32);
  torsoG.translate(0, 0.35, 0);
  const torso = makeJointMesh(torsoG, skinColor);
  torso.userData.kind = 'joint';
  torso.userData.partName = 'torso';
  pelvis.add(torso);
  selectables.push(torso);

  const headG = new THREE.SphereGeometry(0.18, 24, 18);
  headG.translate(0, 0.2, 0);
  const head = makeJointMesh(headG, skinColor);
  head.position.set(0, 0.7, 0);
  head.userData.kind = 'joint';
  head.userData.partName = 'head';
  torso.add(head);
  selectables.push(head);

  function makeLimbSegment(parent, w, h, d, x, y, z, name) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, -h / 2, 0);
    const m = makeJointMesh(g, skinColor);
    m.position.set(x, y, z);
    m.userData.kind = 'joint';
    m.userData.partName = name;
    parent.add(m);
    selectables.push(m);
    return m;
  }

  function makeArm(side) {
    const sx = side === 'L' ? -0.38 : 0.38;
    const upper = makeLimbSegment(torso, 0.16, 0.4, 0.16, sx, 0.62, 0, side + '_upperArm');
    makeLimbSegment(upper, 0.14, 0.38, 0.14, 0, -0.4, 0, side + '_lowerArm');
  }
  makeArm('L');
  makeArm('R');

  function makeLeg(side) {
    const sx = side === 'L' ? -0.14 : 0.14;
    const upper = makeLimbSegment(pelvis, 0.2, 0.5, 0.2, sx, 0, 0, side + '_upperLeg');
    makeLimbSegment(upper, 0.18, 0.45, 0.18, 0, -0.5, 0, side + '_lowerLeg');
  }
  makeLeg('L');
  makeLeg('R');

  // Visible root handle (disc at feet) so the whole figure is selectable
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5 })
  );
  handle.position.y = 0.02;
  handle.userData.kind = 'figureHandle';
  handle.userData.figureRoot = root;
  root.add(handle);
  selectables.push(handle);

  return root;
}

// --- Pose presets ---
const POSES = {
  reset: {},
  tpose: {
    L_upperArm: [0, 0, -Math.PI / 2],
    R_upperArm: [0, 0, Math.PI / 2],
  },
  apose: {
    L_upperArm: [0, 0, -Math.PI / 5],
    R_upperArm: [0, 0, Math.PI / 5],
  },
  armsup: {
    L_upperArm: [Math.PI, 0, -0.1],
    R_upperArm: [Math.PI, 0, 0.1],
  },
  walk: {
    L_upperArm: [-0.6, 0, 0],
    L_lowerArm: [-0.4, 0, 0],
    R_upperArm: [0.6, 0, 0],
    R_lowerArm: [-0.4, 0, 0],
    L_upperLeg: [0.5, 0, 0],
    L_lowerLeg: [-0.2, 0, 0],
    R_upperLeg: [-0.5, 0, 0],
    R_lowerLeg: [-0.6, 0, 0],
  },
  sit: {
    L_upperLeg: [-Math.PI / 2, 0, 0.05],
    L_lowerLeg: [Math.PI / 2 - 0.1, 0, 0],
    R_upperLeg: [-Math.PI / 2, 0, -0.05],
    R_lowerLeg: [Math.PI / 2 - 0.1, 0, 0],
    L_upperArm: [-0.3, 0, -0.1],
    R_upperArm: [-0.3, 0, 0.1],
  },
};

function applyPoseToFigure(figureRoot, pose) {
  // reset all joint rotations first
  figureRoot.traverse(o => {
    if (o.userData.partName) o.rotation.set(0, 0, 0);
  });
  // apply
  figureRoot.traverse(o => {
    const p = pose[o.userData.partName];
    if (p) o.rotation.set(p[0] || 0, p[1] || 0, p[2] || 0);
  });
}

function getSelectedFigureRoot() {
  let p = selected;
  while (p) {
    if (p.userData && p.userData.kind === 'figureRoot') return p;
    p = p.parent;
  }
  return null;
}

function applyPoseSmart(poseName) {
  const pose = POSES[poseName] || {};
  let target = getSelectedFigureRoot();
  if (!target) {
    // fall back to all figures
    scene.children.forEach(c => {
      if (c.userData && c.userData.kind === 'figureRoot') applyPoseToFigure(c, pose);
    });
  } else {
    applyPoseToFigure(target, pose);
  }
}

// --- Camera presets ---
const CAMERA_PRESETS = {
  front:  [0, 1.5, 5],
  threeQ: [3.2, 1.8, 4],
  side:   [5, 1.5, 0.01],
  back:   [0, 1.5, -5],
  high:   [3, 4.5, 4],
  low:    [3, 0.4, 4],
};
function setCameraPreset(name) {
  const p = CAMERA_PRESETS[name];
  if (!p) return;
  camera.position.set(p[0], p[1], p[2]);
  orbit.target.set(0, 1, 0);
  orbit.update();
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

function addObject(obj) {
  scene.add(obj);
  setSelected(obj);
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
  if (Math.hypot(dx, dy) > 4) return;
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
    const o = kind === 'mannequin' ? makeMannequin() : makePrimitive(kind);
    addObject(o);
  });
});

document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

document.querySelectorAll('[data-pose]').forEach(btn => {
  btn.addEventListener('click', () => applyPoseSmart(btn.dataset.pose));
});

document.querySelectorAll('[data-cam]').forEach(btn => {
  btn.addEventListener('click', () => setCameraPreset(btn.dataset.cam));
});

// Snap toggle
let snapEnabled = false;
const snapBtn = document.getElementById('snapBtn');
function setSnap(on) {
  snapEnabled = on;
  if (on) {
    tc.setTranslationSnap(0.25);
    tc.setRotationSnap(THREE.MathUtils.degToRad(15));
    tc.setScaleSnap(0.1);
  } else {
    tc.setTranslationSnap(null);
    tc.setRotationSnap(null);
    tc.setScaleSnap(null);
  }
  snapBtn.classList.toggle('active', on);
}
snapBtn.addEventListener('click', () => setSnap(!snapEnabled));

document.getElementById('parentBtn').addEventListener('click', () => {
  if (!selected) return;
  let p = selected.parent;
  while (p && p !== scene) {
    if (p.userData.kind === 'figureRoot') { setSelected(p); return; }
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
  const keep = new Set([grid, ground, tc, dir, fill]);
  const toRemove = [];
  scene.children.forEach(c => {
    if (c.isLight || keep.has(c)) return;
    toRemove.push(c);
  });
  toRemove.forEach(c => scene.remove(c));
  selectables.length = 0;
  addObject(makeMannequin());
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const W = 1920, H = 1080;
  const orig = new THREE.Vector2();
  renderer.getSize(orig);
  const origPR = renderer.getPixelRatio();

  // Hide gizmo + highlight for clean shot
  const wasVisible = tc.visible;
  tc.visible = false;
  const heldSel = selected;
  clearHighlight(heldSel);

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  // aspect doesn't change (16:9 → 16:9), no need to update camera.aspect
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');

  // restore
  renderer.setPixelRatio(origPR);
  renderer.setSize(orig.x, orig.y, false);
  tc.visible = wasVisible;
  applyHighlight(heldSel);

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

// --- Resize: fit a 16:9 box inside #stage ---
function resize() {
  const padding = 24; // matches #stage padding (12 each side)
  const sw = stage.clientWidth - padding;
  const sh = stage.clientHeight - padding;
  let w = sw, h = sw / ASPECT;
  if (h > sh) { h = sh; w = sh * ASPECT; }
  w = Math.floor(w); h = Math.floor(h);
  viewport.style.width = w + 'px';
  viewport.style.height = h + 'px';
  renderer.setSize(w, h, false);
  // camera aspect is fixed at 16/9
}
window.addEventListener('resize', resize);
resize();

// --- Initial scene ---
addObject(makeMannequin());
setMode('translate');
setCameraPreset('threeQ');

// --- Loop ---
function tick() {
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
