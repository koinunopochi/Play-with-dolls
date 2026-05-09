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

// Proxy used to transform multiple selected objects together.
const proxy = new THREE.Object3D();
proxy.userData.kind = 'proxy';
scene.add(proxy);

// --- Highlight ---
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
    if (o.material && o.material.emissive && o.userData._origEmissive === undefined) {
      o.userData._origEmissive = o.material.emissive.getHex();
      o.material.emissive.setHex(0x224477);
    }
  });
}

// --- Selection ---
const selectables = [];
let selection = []; // array of selected objects (single OR multiple top-level)

function isMultiSelect() { return selection.length > 1; }
function selectionPrimary() { return selection[0] || null; }

function isTopLevelInScene(obj) {
  return obj.parent === scene;
}

// For multi-select, we operate on top-level scene objects (figureRoot or primitive).
// If a body part is given, return its figureRoot. Otherwise walk up to a direct scene child.
function topLevelOf(obj) {
  let p = obj;
  while (p) {
    if (p.userData && p.userData.kind === 'figureRoot') return p;
    if (p.parent === scene) return p;
    p = p.parent;
  }
  return obj;
}

// Re-parent all proxy children back to scene preserving their world transforms.
function unloadProxy() {
  [...proxy.children].forEach(c => scene.attach(c));
  proxy.position.set(0, 0, 0);
  proxy.rotation.set(0, 0, 0);
  proxy.scale.set(1, 1, 1);
}

function refreshTransformTarget() {
  unloadProxy();
  if (selection.length === 0) {
    tc.detach();
    return;
  }
  if (selection.length === 1) {
    tc.attach(selection[0]);
    return;
  }
  // Multi: place proxy at centroid, parent all selected under it, attach gizmo.
  const centroid = new THREE.Vector3();
  const wp = new THREE.Vector3();
  selection.forEach(o => { o.getWorldPosition(wp); centroid.add(wp); });
  centroid.divideScalar(selection.length);
  proxy.position.copy(centroid);
  proxy.updateMatrixWorld(true);
  selection.forEach(o => proxy.attach(o));
  tc.attach(proxy);
}

function clearSelection() {
  selection.forEach(clearHighlight);
  unloadProxy();
  selection = [];
  tc.detach();
}

function setSingleSelection(obj) {
  clearSelection();
  if (!obj) return;
  selection = [obj];
  applyHighlight(obj);
  refreshTransformTarget();
}

function toggleInSelection(obj) {
  // Multi-select operates on top-level objects.
  const top = topLevelOf(obj);
  if (!top) return;

  // If existing selection has a body part (non-top-level), promote it to its figureRoot first.
  if (selection.length === 1 && !isTopLevelInScene(selection[0])) {
    const promoted = topLevelOf(selection[0]);
    clearHighlight(selection[0]);
    selection = [promoted];
    applyHighlight(promoted);
  }

  const idx = selection.indexOf(top);
  if (idx >= 0) {
    selection.splice(idx, 1);
    clearHighlight(top);
  } else {
    selection.push(top);
    applyHighlight(top);
  }
  refreshTransformTarget();
}

function setMode(mode) {
  tc.setMode(mode);
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

// --- Undo ---
const undoStack = [];
const UNDO_LIMIT = 100;
function pushUndo(fn) {
  undoStack.push(fn);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}
function performUndo() {
  const fn = undoStack.pop();
  if (fn) fn();
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
  figureRoot.traverse(o => {
    if (o.userData.partName) o.rotation.set(0, 0, 0);
  });
  figureRoot.traverse(o => {
    const p = pose[o.userData.partName];
    if (p) o.rotation.set(p[0] || 0, p[1] || 0, p[2] || 0);
  });
}

function getSelectedFigureRoots() {
  const roots = new Set();
  selection.forEach(o => {
    let p = o;
    while (p) {
      if (p.userData && p.userData.kind === 'figureRoot') { roots.add(p); break; }
      p = p.parent;
    }
  });
  return [...roots];
}

function applyPoseSmart(poseName) {
  const pose = POSES[poseName] || {};
  let targets = getSelectedFigureRoots();
  if (targets.length === 0) {
    scene.children.forEach(c => {
      if (c.userData && c.userData.kind === 'figureRoot') targets.push(c);
    });
  }
  if (targets.length === 0) return;

  // Snapshot rotations for undo
  const snap = [];
  targets.forEach(fr => {
    fr.traverse(o => {
      if (o.userData.partName) snap.push({ obj: o, rot: o.rotation.clone() });
    });
  });
  targets.forEach(fr => applyPoseToFigure(fr, pose));
  pushUndo(() => {
    snap.forEach(s => s.obj.rotation.copy(s.rot));
  });
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
  setSingleSelection(obj);
  // Collect descendants registered in selectables for undo's re-add
  const registered = [];
  obj.traverse(o => { if (selectables.includes(o)) registered.push(o); });
  pushUndo(() => {
    if (selection.includes(obj)) {
      const idx = selection.indexOf(obj);
      selection.splice(idx, 1);
      clearHighlight(obj);
      refreshTransformTarget();
    }
    registered.forEach(o => {
      const i = selectables.indexOf(o);
      if (i >= 0) selectables.splice(i, 1);
    });
    scene.remove(obj);
  });
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
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) clearSelection();
    return;
  }
  const hit = hits[0].object;
  const target = hit.userData.kind === 'figureHandle' ? hit.userData.figureRoot : hit;

  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    toggleInSelection(target);
  } else {
    setSingleSelection(target);
  }
});

// --- TransformControls undo hooks ---
let tcSnapshot = null;
tc.addEventListener('mouseDown', () => {
  const t = tc.object;
  if (!t) return;
  tcSnapshot = {
    target: t,
    pos: t.position.clone(),
    rot: t.rotation.clone(),
    scl: t.scale.clone(),
    // For multi-select, the proxy is the target. Children's local transforms
    // don't change during drag (only proxy does), so restoring proxy is enough,
    // BUT the user will eventually deselect, which re-parents children to scene.
    // We need to restore world transforms in that case; easiest is to also
    // snapshot each selected child's world matrix.
    multi: t === proxy ? selection.map(o => ({
      obj: o,
      worldMatrix: o.matrixWorld.clone(),
    })) : null,
  };
});
tc.addEventListener('mouseUp', () => {
  const s = tcSnapshot;
  tcSnapshot = null;
  if (!s) return;
  const changed = !s.pos.equals(s.target.position) ||
                  !s.rot.equals(s.target.rotation) ||
                  !s.scl.equals(s.target.scale);
  if (!changed) return;

  if (s.multi) {
    // Capture current world matrices to redo... actually we only need to undo.
    // Restore proxy if still in same selection state, else re-parent each obj
    // back to its parent at saved world transform.
    pushUndo(() => {
      // If proxy is still the TC target and selection unchanged, just restore proxy transform
      if (tc.object === proxy && proxy.children.length === s.multi.length &&
          s.multi.every(m => m.obj.parent === proxy)) {
        s.target.position.copy(s.pos);
        s.target.rotation.copy(s.rot);
        s.target.scale.copy(s.scl);
        return;
      }
      // Otherwise restore each object's world matrix by setting it on its current parent
      s.multi.forEach(m => {
        const o = m.obj;
        const parent = o.parent || scene;
        parent.updateMatrixWorld(true);
        const localFromWorld = new THREE.Matrix4()
          .copy(parent.matrixWorld).invert()
          .multiply(m.worldMatrix);
        localFromWorld.decompose(o.position, o.quaternion, o.scale);
      });
    });
  } else {
    pushUndo(() => {
      s.target.position.copy(s.pos);
      s.target.rotation.copy(s.rot);
      s.target.scale.copy(s.scl);
    });
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
  const cur = selectionPrimary();
  if (!cur) return;
  let p = cur.parent;
  while (p && p !== scene) {
    if (p.userData.kind === 'figureRoot') { setSingleSelection(p); return; }
    p = p.parent;
  }
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  if (selection.length === 0) return;
  // Determine top-level scene objects to remove
  const tops = new Set();
  selection.forEach(o => {
    let t = o;
    while (t.parent && t.parent !== scene && t.parent !== proxy) t = t.parent;
    if (t.parent === proxy) {
      // top-level was re-parented to proxy for multi-edit; the proxy holds it
      tops.add(t);
    } else if (t.parent === scene) {
      tops.add(t);
    }
  });

  // Snapshot for undo before mutating
  const removed = [];
  tops.forEach(top => {
    const originalParent = top.parent; // proxy or scene
    const worldMatrix = top.matrixWorld.clone();
    const registered = [];
    top.traverse(o => { if (selectables.includes(o)) registered.push(o); });
    removed.push({ top, originalParent, worldMatrix, registered });
  });

  // Perform removal: unload proxy first (returns items to scene), then remove from scene
  unloadProxy();
  selection = [];
  tc.detach();
  removed.forEach(r => {
    r.registered.forEach(o => {
      const i = selectables.indexOf(o);
      if (i >= 0) selectables.splice(i, 1);
    });
    clearHighlight(r.top);
    if (r.top.parent) r.top.parent.remove(r.top);
  });

  pushUndo(() => {
    removed.forEach(r => {
      scene.add(r.top);
      // Restore world transform
      scene.updateMatrixWorld(true);
      const local = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(r.worldMatrix);
      local.decompose(r.top.position, r.top.quaternion, r.top.scale);
      r.registered.forEach(o => { if (!selectables.includes(o)) selectables.push(o); });
    });
  });
});

document.getElementById('deselectBtn').addEventListener('click', () => clearSelection());

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('全部消してリセットします。よろしいですか?')) return;
  clearSelection();
  const keep = new Set([grid, ground, tc, proxy, dir, fill]);
  const toRemove = [];
  scene.children.forEach(c => {
    if (c.isLight || keep.has(c)) return;
    toRemove.push(c);
  });
  toRemove.forEach(c => scene.remove(c));
  selectables.length = 0;
  undoStack.length = 0;
  addObject(makeMannequin());
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const W = 1920, H = 1080;
  const orig = new THREE.Vector2();
  renderer.getSize(orig);
  const origPR = renderer.getPixelRatio();

  const wasVisible = tc.visible;
  tc.visible = false;
  const heldHL = [...selection];
  heldHL.forEach(clearHighlight);

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');

  renderer.setPixelRatio(origPR);
  renderer.setSize(orig.x, orig.y, false);
  tc.visible = wasVisible;
  heldHL.forEach(applyHighlight);

  const a = document.createElement('a');
  a.href = url;
  a.download = `thumbnail-rough-${Date.now()}.png`;
  a.click();
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;

  // Ctrl/Cmd + Z: undo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
    e.preventDefault();
    performUndo();
    return;
  }

  if (e.key === 'g' || e.key === 'G') setMode('translate');
  else if (e.key === 'r' || e.key === 'R') setMode('rotate');
  else if (e.key === 's' || e.key === 'S') setMode('scale');
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    document.getElementById('deleteBtn').click();
  } else if (e.key === 'Escape') {
    clearSelection();
  }
});

// --- Resize ---
function resize() {
  const padding = 24;
  const sw = stage.clientWidth - padding;
  const sh = stage.clientHeight - padding;
  let w = sw, h = sw / ASPECT;
  if (h > sh) { h = sh; w = sh * ASPECT; }
  w = Math.floor(w); h = Math.floor(h);
  viewport.style.width = w + 'px';
  viewport.style.height = h + 'px';
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

// --- Initial scene ---
addObject(makeMannequin());
undoStack.length = 0; // don't allow undoing the initial figure
setMode('translate');
setCameraPreset('threeQ');

function tick() {
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
