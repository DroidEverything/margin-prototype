/* MARGIN 3D presentation layer — modular NASA spacecraft composer.
   Sources (vendored static, NASA-only):
     models/nasa/satellite_kit_body_{1,2,3}.glb
     models/nasa/satellite_kit_wings_{1,2,3}.glb  (power / solar arrays)
     models/nasa/satellite_kit_radio_{1,2,3}.glb  (comms / dishes)
   Origin: NASA 3D Resources "Satellite Kit" (public domain, NASA media guidelines).
   The kit is modular BY DESIGN: body + wings + radio assemble at a shared origin.
   All 9 kit GLBs use KHR_draco_mesh_compression — decoded by the vendored
   static three r160 decoder (vendor/draco/, no network).
   Selection is derived from authoritative game state S (never duplicated sim):
     body  <- instrument count / dry mass tier
     wings <- power source class
     radio <- comms class
   Instruments have no per-unit NASA CAD, so the selected payload is shown as
   GENERIC procedural glyphs (one per instrument, shaped by its INSTR group:
   camera barrel / spectrometer box / boom / radar panel / arm / small antenna).
   They are labelled representative in-overlay, never flight hardware.
   Fallback: models/margin_mission_bus.glb (original MARGIN bus) if any kit part
   fails to load. Canvas2D bay preview remains the no-WebGL fallback. */
/* MARGIN 3D presentation layer — build-bay viewer (renderer + highlight).
   The craft itself is built by the ONE shared composer (js/kit-assembly.js),
   also used by ops — this file only frames, highlights and hosts it.
   Fixed missions (l2–l5) show their real NASA hero craft (HERO_BY_LEVEL);
   l1/sbx show the player's modular kit build. Canvas2D bay preview remains
   the no-WebGL fallback. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import {
  KIT, loadKitGltf, assembleKit, heroForLevel, normalizeHero,
  loadRoverGltf, calibrateRover, ROVER_TRUE_SPAN_M,
  bodyTierOf, wingTierOf, radioTierOf, wingScaleOf, radioScaleOf,
  engineSpecOf, keyOf, groupOfInstr, mountEngineRow, mountGlyphRow
} from './kit-assembly.js';

const DPR_CAP = 1.5;

/* --- selection: thin S-readers over the shared composer --- */
function selOfS() {
  try {
    return {
      n: ((typeof S !== 'undefined' && S.instruments) || []).length,
      power: (typeof S !== 'undefined') ? S.power : '',
      comms: (typeof S !== 'undefined') ? S.comms : '',
      prop: (typeof S !== 'undefined') ? S.prop : '',
      instr: ((typeof S !== 'undefined' && S.instruments) || []).slice(),
      level: (typeof S !== 'undefined') ? (S.levelId || '') : ''
    };
  } catch (e) { return { n: 0, power: '', comms: '', prop: '', instr: [], level: '' }; }
}
function pickBody() { try { return bodyTierOf(selOfS()); } catch (e) { return 1; } }
function pickWings() { try { return wingTierOf(selOfS()); } catch (e) { return 1; } }
function pickRadio() { try { return radioTierOf(selOfS()); } catch (e) { return 1; } }
function wingScale() { try { return wingScaleOf(selOfS().power); } catch (e) { return 1; } }
function radioScale() { try { return radioScaleOf(selOfS().comms); } catch (e) { return 1; } }
function pickEngine() { try { return engineSpecOf(selOfS().prop); } catch (e) { return null; } }
function pickKey() {
  try { return keyOf(selOfS()); }
  catch (e) { return pickBody() + ':' + pickWings() + ':' + pickRadio(); }
}
function groupOf(id) {
  try { return groupOfInstr(id, (typeof INSTR !== 'undefined') ? INSTR : []); }
  catch (e) { return ''; }
}
/* View-bay wrappers: old-row removal + highlight-group bookkeeping around the
   shared mounters (flags userData.engine / userData.generic). */
function refreshEngineRow() {
  try {
    if (!M3D.craft || !M3D.craft.getObjectByName) return;
    const old = M3D.craft.getObjectByName('engine_block');
    if (old) M3D.craft.remove(old);
    if (M3D.groups && M3D.groups.prop && old)
      M3D.groups.prop = M3D.groups.prop.filter(m => !m.userData.engine);
    const row = mountEngineRow(M3D.craft, pickEngine());
    if (!row) return;
    tagMeshes(row, 'prop');
    // the engine owns the prop highlight group now (drop the borrowed slice)
    M3D.groups.prop = M3D.groups.prop.filter(m => m.userData.engine);
  } catch (e) {}
}
function refreshGlyphRow() {
  try {
    if (!M3D.craft || !M3D.craft.getObjectByName) return;
    const old = M3D.craft.getObjectByName('generic_instruments');
    if (old) M3D.craft.remove(old);
    if (M3D.groups && M3D.groups.payload && old)
      M3D.groups.payload = M3D.groups.payload.filter(m => !m.userData.generic);
    const row = mountGlyphRow(M3D.craft, selOfS().instr, groupOf);
    if (!row) return;
    tagMeshes(row, 'payload'); // pulse with the payload highlight
  } catch (e) {}
}

const M3D = {
  ok: false, ready: false,
  renderer: null, scene: null, camera: null, controls: null, canvas: null,
  groups: {}, host: null, prev: null, highlight: null, targetGoal: null,
  distGoal: 0, raf: 0, lastW: 0, lastH: 0, idleTimer: 0, home: null,
  craft: null, key: null, loading: null
};

function eachMesh(fn) {
  for (const k of Object.keys(M3D.groups))
    for (const m of M3D.groups[k]) fn(m, k);
}
function clearHighlight() {
  eachMesh((m) => { try { m.material.emissiveIntensity = 0; } catch (e) {} });
  M3D.highlight = null;
}
function setHighlight(group) {
  clearHighlight();
  if (!group || !M3D.groups[group]) return;
  M3D.highlight = { group, t0: performance.now() };
  try {
    const box = new THREE.Box3();
    for (const m of M3D.groups[group]) box.expandByObject(m);
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      M3D.targetGoal = c;
      const size = box.getSize(new THREE.Vector3()).length();
      M3D.distGoal = THREE.MathUtils.clamp(size * 1.9, Math.max(size * 1.2, 0.05), 30);
    }
  } catch (e) {}
}

function size() {
  const cv = M3D.canvas;
  if (!cv || !cv.isConnected) return;
  const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
  if (w === M3D.lastW && h === M3D.lastH) return;
  M3D.lastW = w; M3D.lastH = h;
  M3D.camera.aspect = w / h;
  M3D.camera.updateProjectionMatrix();
  M3D.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  M3D.renderer.setSize(w, h, false);
}

function frame() {
  if (!M3D.host || !M3D.host.isConnected) { stop(); return; }
  size();
  M3D.raf = requestAnimationFrame(frame);
  const now = performance.now();
  if (M3D.highlight) {
    const k = (now - M3D.highlight.t0) / 1000;
    if (k > 1.6) { clearHighlight(); }
    else {
      /* Selection pulse: brief low warm amber, never a white wash. The old
         green pulse at 0.58 peak read as a white flash over lit metal. */
      const pulse = 0.10 + 0.12 * (0.5 + 0.5 * Math.sin(now * 0.009));
      for (const m of M3D.groups[M3D.highlight.group]) {
        try {
          m.material.emissive.setHex(0x8a5a1a);
          m.material.emissiveIntensity = pulse;
        } catch (e) {}
      }
    }
  }
  if (M3D.targetGoal) {
    M3D.controls.target.lerp(M3D.targetGoal, 0.07);
    const dir = M3D.camera.position.clone().sub(M3D.controls.target);
    const d = THREE.MathUtils.lerp(dir.length(), M3D.distGoal, 0.07);
    dir.setLength(d);
    M3D.camera.position.copy(M3D.controls.target).add(dir);
    if (M3D.camera.position.distanceTo(M3D.controls.target) < 0.05 &&
        M3D.controls.target.distanceTo(M3D.targetGoal) < 0.02) M3D.targetGoal = null;
  }
  M3D.controls.update();
  M3D.renderer.render(M3D.scene, M3D.camera);
}
function stop() {
  if (M3D.raf) cancelAnimationFrame(M3D.raf);
  M3D.raf = 0;
  if (M3D.canvas && M3D.canvas.parentElement) M3D.canvas.parentElement.removeChild(M3D.canvas);
  M3D.host = null; M3D.lastW = 0; M3D.lastH = 0;
}
function start(host) {
  if (M3D.host === host && M3D.raf) return;
  stop();
  M3D.host = host;
  host.appendChild(M3D.canvas);
  M3D.lastW = 0; M3D.lastH = 0;
  clearHighlight();
  size();
  if (M3D.home) {
    M3D.targetGoal = M3D.home.target.clone();
    M3D.distGoal = M3D.home.dist;
  }
  M3D.controls.autoRotate = true;
  if (!M3D.raf) M3D.raf = requestAnimationFrame(frame);
}

function fail() {
  stop();
  M3D.ok = false;
  try { document.body.classList.remove('v3on'); } catch (e) {}
  M3D.canvas = null;
}

function tagMeshes(root, group) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    try {
      o.material = o.material.clone();
      if (!o.material.emissive) o.material.emissive = new THREE.Color(0x000000);
      else o.material.emissive = new THREE.Color(0x000000);
      o.material.emissiveIntensity = 0;
    } catch (e) {}
    if (!M3D.groups[group]) M3D.groups[group] = [];
    if (M3D.groups[group].indexOf(o) < 0) M3D.groups[group].push(o);
  });
}

function frameCraft() {
  try {
    const box = new THREE.Box3().setFromObject(M3D.craft);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const sizeV = box.getSize(new THREE.Vector3()).length() || 2;
    M3D.controls.target.copy(c);
    // scale-relative framing: the NASA kit is centimetre-scale, the fallback
    // bus metre-scale — a fixed floor would park the camera far away.
    // Factor 1.9 fills the bay panel so tier/glyph differences read clearly.
    M3D.distGoal = THREE.MathUtils.clamp(sizeV * 1.9, Math.max(sizeV * 1.2, 0.05), 30);
    M3D.home = { target: c.clone(), dist: M3D.distGoal };
    const dir = M3D.camera.position.clone().sub(c);
    if (dir.lengthSq() < 1e-8) dir.set(0.55, 0.35, 0.75);
    dir.normalize();
    M3D.camera.position.copy(c).addScaledVector(dir, M3D.distGoal);
    M3D.camera.near = Math.max(0.005, M3D.distGoal * 0.02);
    M3D.camera.far = Math.max(200, M3D.distGoal * 60);
    M3D.camera.updateProjectionMatrix();
    M3D.controls.minDistance = Math.max(0.01, sizeV * 0.3);
  } catch (e) {}
}

/* L2 rover preview (Phase 3): the calibrated Perseverance hero parked beside
   the orbiter in the build bay. Parented UNDER the craft holder, so craft
   swaps carry it away for free and frameCraft (run before attach) never sees
   it. Bay display convention (cf. heroes at 2.5 units): 1.4-unit span for
   readability — true-metre calibration is preserved in userData for Phase-5
   surface placement. Tagged 'payload' so instrument changes pulse it with the
   kit it belongs to. Async + race-guarded; any failure (or non-L2, or no
   rover kit) skips silently and the preview is exactly yesterday's. Lazy:
   first fetch happens on first L2 compose — never at boot, never headless. */
function attachRoverPreview(craft, key) {
  try {
    let lvl = null, rv = null;
    try { lvl = (typeof S !== 'undefined') ? S.levelId : null; } catch (e) {}
    try { rv = (typeof S !== 'undefined') ? S.rover : null; } catch (e) {}
    if (lvl !== 'l2' || !rv) return;
    loadRoverGltf().then((gltf) => {
      try {
        if (M3D.key !== key || M3D.craft !== craft) return; // stale compose
        if (!gltf || !gltf.scene) return;
        if (craft.getObjectByName('rover_preview')) return;
        const cal = calibrateRover(gltf.scene.clone(true));
        const disp = new THREE.Group();
        disp.name = 'rover_preview';
        cal.scale.multiplyScalar(1.4 / ROVER_TRUE_SPAN_M);
        disp.add(cal);
        disp.position.set(2.1, -0.9, 0.6);
        craft.add(disp);
        tagMeshes(disp, 'payload');
      } catch (e) { /* preview stays orbiter-only */ }
    }).catch(() => { /* preview stays orbiter-only */ });
  } catch (e) { /* preview stays orbiter-only */ }
}

/* Compose hero or kit for the current selection key. Fixed missions (l2–l5)
   show their real NASA hero craft; l1/sbx show the player's kit build.
   Preloads once per key; concurrent sync() calls share the in-flight promise.
   Fallback: hero-load failure drops back to the kit assembly, then margin bus. */
function compose(skipHero) {
  const sel = selOfS();
  const hero = skipHero ? null : heroForLevel(sel.level);
  const key = hero ? ('hero:' + sel.level + ':' + hero.url) : pickKey();
  if (M3D.key === key && M3D.craft) return Promise.resolve();
  if (M3D.loading && M3D.loading.key === key) return M3D.loading.p;
  if (hero) {
    const p = loadKitGltf(hero.url).then((gltf) => {
      if (M3D.key === key && M3D.craft) { M3D.loading = null; return; }
      if (M3D.craft) { try { M3D.scene.remove(M3D.craft); } catch (e) {} M3D.groups = {}; }
      /* Centered hero: hero GLB coordinate origins vary widely across NASA
         exports (MRO origin sits near the solar array tip; -Y extends to -33;
         overall span ~90 units). Center the cloned scene about its bounding box
         at a canonical 2.5-unit size so it fits the build-bay framing cleanly
         and OrbitControls pivots about the body, not an empty point outside
         the frame. */
      const raw = normalizeHero(gltf.scene.clone(true));
      let craft = raw;
      try {
        raw.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(raw);
        if (!b.isEmpty()) {
          const c = b.getCenter(new THREE.Vector3());
          const sz = b.getSize(new THREE.Vector3());
          const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
          const k = 2.5 / maxDim;
          const holder = new THREE.Group();
          const inner = new THREE.Group();
          inner.position.set(-c.x * k, -c.y * k, -c.z * k);
          raw.scale.multiplyScalar(k);
          inner.add(raw);
          holder.add(inner);
          craft = holder;
        }
      } catch (e) {}
      craft.name = 'nasa_hero_' + sel.level;
      for (const k of ['payload', 'power', 'comms', 'prop', 'bus', 'shield', 'boom']) M3D.groups[k] = [];
      tagMeshes(craft, 'bus'); // single-piece hero: bus + payload highlight together
      M3D.groups.payload = M3D.groups.payload.concat(M3D.groups.bus);
      M3D.craft = craft;
      M3D.scene.add(craft);
      M3D.key = key;
      M3D.heroInfo = hero;
      frameCraft();
      attachRoverPreview(craft, key); // L2 rover alongside the orbiter (silent no-op elsewhere)
      M3D.ready = true;
      M3D.ok = true;
      try { document.body.classList.add('v3on'); } catch (e) {}
      M3D.loading = null;
    }).catch(() => {
      M3D.loading = null; M3D.key = null; // fall through to kit assembly
      return compose(true);
    });
    M3D.loading = { key, p };
    return p;
  }
  const urls = [KIT.bodies[bodyTierOf(sel)], KIT.wings[wingTierOf(sel)],
    KIT.radios[radioTierOf(sel)]];
  const p = Promise.all(urls.map(loadKitGltf)).then((gltfs) => {
    // swap assembled craft
    if (M3D.craft) {
      try { M3D.scene.remove(M3D.craft); } catch (e) {}
      M3D.groups = {};
    }
    const { group: craft, parts } = assembleKit(
      gltfs[0].scene, gltfs[1].scene, gltfs[2].scene,
      wingScale(), radioScale());
    M3D.heroInfo = null; // kit build: player's design, not a hero
    for (const k of ['payload', 'power', 'comms', 'prop', 'bus', 'shield', 'boom']) M3D.groups[k] = [];
    tagMeshes(parts[0], 'payload'); // bus body carries instruments
    M3D.groups.bus = M3D.groups.bus.concat(M3D.groups.payload);
    M3D.groups.prop = M3D.groups.prop.concat(M3D.groups.payload.slice(0, 1));
    M3D.groups.shield = M3D.groups.shield.concat(M3D.groups.payload.slice(0, 1));
    tagMeshes(parts[1], 'power');   // wings = power
    tagMeshes(parts[2], 'comms');   // radio = comms
    M3D.craft = craft;
    M3D.scene.add(craft);
    M3D.key = key;
    refreshEngineRow(); // procedural engine from prop choice (owns prop group)
    refreshGlyphRow();
    frameCraft();
    M3D.ready = true;
    M3D.ok = true;
    try { document.body.classList.add('v3on'); } catch (e) {}
    M3D.loading = null;
  }).catch(() => {
    // fallback: original MARGIN bus (honest fallback, not NASA)
    M3D.loading = null;
    return loadKitGltf(KIT.fallback).then((gltf) => {
      if (M3D.craft) { try { M3D.scene.remove(M3D.craft); } catch (e) {} M3D.groups = {}; }
      const model = gltf.scene.clone(true);
      for (const k of ['payload', 'power', 'comms', 'prop', 'bus', 'shield', 'boom']) M3D.groups[k] = [];
      model.traverse((o) => {
        if (!o.isMesh) return;
        try {
          o.material = o.material.clone();
          o.material.emissive = new THREE.Color(0x000000);
          o.material.emissiveIntensity = 0;
        } catch (e) {}
        const nm = (o.name || '').toLowerCase();
        let placed = false;
        const pats = {
          payload: ['optical_bench', 'camera_barrel', 'camera_lens'],
          power: ['solar_panel', 'array_root', 'array_rib', 'array_cross', 'array_hinge'],
          comms: ['hga_'], prop: ['propulsion_module', 'propellant_tank', 'thruster_'],
          bus: ['primary_bus', 'top_deck', 'side_radiator', 'lower_radiator'],
          shield: ['bay_blanket'], boom: ['boom_']
        };
        for (const k of Object.keys(pats)) {
          if (pats[k].some((pt) => nm.indexOf(pt) >= 0)) {
            M3D.groups[k].push(o); placed = true; break;
          }
        }
        if (!placed) M3D.groups.bus.push(o);
      });
      M3D.craft = model;
      M3D.scene.add(model);
      M3D.key = 'fallback';
      refreshGlyphRow();
      frameCraft();
      M3D.ready = true;
      M3D.ok = true;
      try { document.body.classList.add('v3on'); } catch (e) {}
    }).catch(() => fail());
  });
  M3D.loading = { key, p };
  return p;
}

function init() {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    M3D.renderer = renderer;
    M3D.canvas = renderer.domElement;
    M3D.canvas.className = 'v3canvas';
    M3D.canvas.setAttribute('role', 'img');
    M3D.canvas.setAttribute('aria-label', 'Interactive 3D spacecraft preview — NASA Satellite Kit (body + arrays + antenna assemble from your build choices) with generic instrument glyphs (representative, not flight hardware)');
    M3D.scene = new THREE.Scene();
    M3D.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.01, 200);
    M3D.camera.position.set(3.2, 1.8, 4.2);
    M3D.scene.add(new THREE.HemisphereLight(0x9fc0ff, 0x0a0f18, 0.6));
    const key = new THREE.DirectionalLight(0xfff2df, 1.15);
    key.position.set(3, 4, 2);
    M3D.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fa8ff, 0.55);
    rim.position.set(-4, -1, -3);
    M3D.scene.add(rim);
    M3D.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    M3D.renderer.toneMappingExposure = 1.05;
    M3D.controls = new OrbitControls(M3D.camera, M3D.canvas);
    M3D.controls.enableDamping = true;
    M3D.controls.dampingFactor = 0.08;
    M3D.controls.enablePan = false;
    M3D.controls.minDistance = 1.2;
    M3D.controls.maxDistance = 30;
    M3D.controls.maxPolarAngle = Math.PI * 0.85;
    M3D.controls.autoRotate = true;
    M3D.controls.autoRotateSpeed = -0.7;
    try { M3D.controls.domElement.style.touchAction = 'pan-y'; } catch (e) {}
    M3D.controls.addEventListener('start', () => {
      M3D.controls.autoRotate = false;
      if (M3D.idleTimer) clearTimeout(M3D.idleTimer);
    });
    M3D.controls.addEventListener('end', () => {
      if (M3D.idleTimer) clearTimeout(M3D.idleTimer);
      M3D.idleTimer = setTimeout(() => { M3D.controls.autoRotate = true; }, 5000);
    });
    window.addEventListener('resize', () => { M3D.lastW = 0; M3D.lastH = 0; });
  } catch (e) { fail(); return; }
  compose().then(() => { try { sync(); } catch (e) {} });
}

/* Presentation adapter: consumes S only. Called (guarded) from game.js render. */
function sync() {
  if (!M3D.renderer || !M3D.canvas) return;
  let host = null;
  try {
    if (typeof S !== 'undefined' && S.screen === 'build' && S.bstep)
      host = document.getElementById('v3' + S.bstep);
  } catch (e) { host = null; }
  if (!host) {
    if (M3D.host) { stop(); M3D.prev = null; clearHighlight(); }
    return;
  }
  /* refreshBuild() detaches + re-inserts the live host around repaint: if the
     canvas is still ours and M3D.host points at the detached node, re-point
     at the live DOM node instead of stop()/re-append (white flash). */
  try {
    if (M3D.host && M3D.host !== host && M3D.canvas &&
        M3D.canvas.parentElement === M3D.host && !M3D.host.isConnected &&
        M3D.host.id === host.id) {
      try { host.appendChild(M3D.canvas); } catch (e) {}
      M3D.host = host; M3D.lastW = 0; M3D.lastH = 0;
      if (!M3D.raf) M3D.raf = requestAnimationFrame(frame);
    }
  } catch (e) {}
  start(host);
  // recompose when the tier selection changed (e.g. 3rd instrument added)
  compose().then(() => {
    if (!M3D.ok || !M3D.ready) return;
    if (M3D.host !== host) return;
    const sel = { i: 0, p: null, c: null, r: null, s: null, k: pickKey() };
    try {
      sel.i = S.instruments.join(','); sel.p = S.power; sel.c = S.comms;
      sel.r = S.prop; sel.s = S.shield;
    } catch (e) {}
    const p = M3D.prev;
    if (p) {
      if (sel.k !== p.k) {
        // tier changed: show the new assembly, pulse what changed
        if (sel.i !== p.i) setHighlight('payload');
        else if (sel.p !== p.p) setHighlight('power');
        else if (sel.c !== p.c) setHighlight('comms');
        else if (sel.r !== p.r) setHighlight('prop');
        else setHighlight('bus');
      } else if (sel.i !== p.i) { refreshGlyphRow(); setHighlight('payload'); }
      else if (sel.p !== p.p) setHighlight('power');
      else if (sel.c !== p.c) setHighlight('comms');
      else if (sel.r !== p.r) setHighlight('prop');
      else if (sel.s !== p.s) setHighlight('shield');
    }
    M3D.prev = sel;
  }).catch(() => {});
}

function describeSelection() {
  return { body: pickBody() + 1, wings: pickWings() + 1, radio: pickRadio() + 1 };
}

window.M3D = { sync, get ok() { return M3D.ok; }, describeSelection };
init();
