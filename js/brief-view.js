/* MARGIN briefing vista — thin adapter over js/orrery.js. Opens dwelling on
   the mission's planet INSIDE the same solar system the select dive travels,
   so the handoff is continuous: same bodies, same sun, same light. Entry is
   a short glide; the planet is framed right-of-center for the dossier layout.
   Reads LEVELS/S globals only. Silent CSS fallback covers file://. */
import * as THREE from 'three';
import {
  DPR_CAP, LEVEL_BODY, DAYS_PER_SEC, BODY_STYLE,
  buildStars, loadSpaceSkybox, buildSolarSystem, todayDays, bodyWorld, bodyWorldPhysical, frameOf,
  easeSmoother, exposureForBody, isPhysicalMode, frameDist, radiusWorld, UNITS_PER_KM
} from './orrery.js';

const V = {
  renderer: null, scene: null, camera: null, canvas: null,
  sys: null, starMat: null, bodies: null, flareMats: null, sunMat: null,
  simDays: 0, key: null, fly: null, savedPos: null, savedTgt: null,
  raf: 0, W: 0, H: 0, last: 0, failed: false
};

function stop() {
  if (V.raf) cancelAnimationFrame(V.raf);
  V.raf = 0;
  /* remember the viewpoint so objective toggles (which rebuild the DOM)
     resume seamlessly instead of replaying the entry glide */
  try {
    if (V.camera) {
      V.savedPos = V.camera.position.clone();
      const d = new THREE.Vector3();
      V.camera.getWorldDirection(d);
      V.savedTgt = V.camera.position.clone().addScaledVector(d, 4);
    }
  } catch (e) {}
  if (V.renderer) {
    try { V.renderer.dispose(); } catch (e) {}
    try { V.renderer.forceContextLoss(); } catch (e) {}
  }
  V.renderer = V.scene = V.camera = V.canvas = null;
  V.sys = V.bodies = V.flareMats = V.sunMat = V.fly = null;
  V.key = null;
  V.W = 0; V.H = 0; V.failed = false;
  try { document.body.classList.remove('brief3d'); } catch (e) {}
}

function levelKey() {
  try {
    const id = (typeof S !== 'undefined' && S.levelId) || 'l1';
    return LEVEL_BODY[id] || 'earth';
  } catch (e) { return 'earth'; }
}

const _p = new THREE.Vector3(), _t = new THREE.Vector3();

/* Framing offsets so the destination rests in the top-right clear zone
   (dossier top-left, panels lower band): NDC ≈ (+0.62, +0.55), clamped by the
   body's on-screen radius so a large disc can never be pushed off the edge. */
function frameOffsets(dist, bodyRadius) {
  const t = Math.tan(THREE.MathUtils.degToRad(V.camera.fov) / 2);
  const hh = Math.max(1e-9, dist * t), hw = Math.max(1e-9, hh * V.camera.aspect);
  const r = (bodyRadius > 0 && isFinite(bodyRadius)) ? bodyRadius : 0;
  return [
    Math.min(0.62, Math.max(0.12, 0.88 - r / hw)),
    Math.min(0.55, Math.max(0.08, 0.88 - r / hh))
  ];
}
/* Rotate the camera AFTER lookAt(planet) so the planet lands at the requested
   NDC: rotate in the camera's own local frame (exact at any pitch — the old
   aim-point offset read the post-lookAt quaternion each frame and compounded
   the offset until the destination left the frame, and its world-up basis
   broke down on high-pitch approaches). rotateY(+θ) looks left (planet moves
   right); rotateX(-θ) looks down (planet moves up). Constants per frame —
   no feedback loop, no compounding. */
function aimShift(nx, ny) {
  const t = Math.tan(THREE.MathUtils.degToRad(V.camera.fov) / 2);
  V.camera.rotateY(Math.atan(nx * t * V.camera.aspect));
  V.camera.rotateX(-Math.atan(ny * t));
}

/* Vista framing: the briefing dwells ON the destination, so the disc — not the
   legacy regional neighborhood distance — must own the frame. r*6 puts the body
   at ~50% of the frame height (the dossier sits over the top-left scrim), while
   never moving farther out than the tuned per-body distance. Physical mode keeps
   its own radius-based rule. */
function vistaRadius(key) {
  try { return radiusWorld(key) || 0; } catch (e) { return 0; }
}
function vistaDist(key) {
  const r = vistaRadius(key);
  if (isPhysicalMode()) return Math.max(frameDist(key), r * 6);
  const style = Math.max(0.45, ((BODY_STYLE[key] || {}).dist || 1));
  return r > 0 ? Math.min(style, r * 6) : style;
}
/* Camera placed on the same sun/terminator-aware approach direction that
   frameOf() chose, but at the VISTA distance — the target must own the frame,
   not sit in it as a dot. Returns outPos (and outTgt = body position). */
function vistaCam(key, simDays, outPos, outTgt) {
  frameOf(key, simDays, outPos, outTgt);
  const want = vistaDist(key);
  const cur = outPos.distanceTo(outTgt);
  if (want > 0 && cur > 1e-12 && isFinite(cur)) {
    outPos.sub(outTgt).multiplyScalar(want / cur).add(outTgt);
  }
  return outPos;
}

function size() {
  const cv = V.canvas;
  if (!cv || !cv.isConnected || !V.renderer) return;
  const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
  if (w === V.W && h === V.H) return;
  V.W = w; V.H = h;
  V.camera.aspect = w / h;
  V.camera.updateProjectionMatrix();
  V.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  V.renderer.setSize(w, h, false);
  if (V.starMat) V.starMat.uniforms.pr.value = V.renderer.getPixelRatio();
}

function frame(now) {
  if (!V.canvas || !V.canvas.isConnected) { stop(); return; }
  V.raf = requestAnimationFrame(frame);
  size();
  const dt = Math.min(0.1, (now - V.last) / 1000 || 0);
  V.last = now;
  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  V.simDays += still ? 0 : dt * DAYS_PER_SEC;
  try { window.__MARGIN_SIMDAYS = V.simDays; } catch (e) {}
  if (V.sunMat && V.sunMat.uniforms && V.sunMat.uniforms.uTime && !still) {
    V.sunMat.uniforms.uTime.value = (V.sunMat.uniforms.uTime.value + dt) % 3600;
  }
  if (V.camera) {
    /* the dwell sits ~1.35 u from the Sun — fade the flare with proximity
       so it never washes the frame (the bare disc stays: it IS close) */
    const cd = V.camera.position.length();
    const ff = Math.min(1, Math.max(0.05, (cd - 1.2) / 2.5));
    if (V.flareMats) for (const f of V.flareMats) f.m.opacity = f.base * (f.far ? Math.min(1, Math.max(0, (cd - 15) / 30)) : ff);
  }
  if (V.bodies) {
    const phys = isPhysicalMode();
    for (const key of Object.keys(V.bodies)) {
      const m = V.bodies[key];
      if (!m) continue;
      if (phys) { const pw = bodyWorldPhysical(key, _p, V.simDays, [0, 0, 0], UNITS_PER_KM); if (pw) m.position.copy(pw); }
      else m.position.copy(bodyWorld(key, _p, V.simDays));
      if (!still) m.rotation.y += dt * ((BODY_STYLE[key]||{}).spin || 0.1);
    }
  }
  if (V.key) {
    const dist = vistaDist(V.key);
    /* Visible disc radius (presentation or true) — lookPlace() uses it to keep
       the destination fully inside the frame at any body size. */
    const bodyR = vistaRadius(V.key);
    if (V.fly) {
      const F = V.fly;
      F.t += dt;
      const e = F.dur <= 0 ? 1 : easeSmoother(F.t / F.dur);
      vistaCam(V.key, V.simDays, _p, _t);
      V.camera.position.lerpVectors(F.p0, _p, e);
      V.camera.lookAt(_t);
      /* offsets from the CURRENT (mid-glide) camera distance keep the disc in
         the clear zone from the very first frame — using `dist` while the
         camera is still at p0 would overshoot the offset */
      const gd = V.camera.position.distanceTo(_t);
      const off = frameOffsets(gd, bodyR);
      aimShift(off[0], off[1]);
      if (e >= 1) V.fly = null;
    } else {
      vistaCam(V.key, V.simDays, _p, _t);
      V.camera.position.copy(_p);
      V.camera.lookAt(_t);
      const off = frameOffsets(dist, bodyR);
      aimShift(off[0], off[1]);
    }
    /* True-scale framing spans 1e-8–1e2 units across bodies: fit the depth
       range to the live camera distance every frame. */
    /* Depth range: bounded near simplifies precision at disc-scale dwells
       (far 300, near ≤0.01 keeps the ratio ≤ 30k) while still clearing the
       closest dwell we fly (r*6 for the Moon ≈ 0.024 u). */
    const cd = V.camera.position.distanceTo(_t);
    const nn = Math.max(1e-9, Math.min(0.01, cd * 0.02)), ff = Math.max(300, cd * 60 + 300);
    if (Math.abs(V.camera.near - nn) > 1e-12 || Math.abs(V.camera.far - ff) > 1e-6) {
      V.camera.near = nn; V.camera.far = ff; V.camera.updateProjectionMatrix();
    }
  }
  if (V.renderer && V.scene) V.renderer.render(V.scene, V.camera);
}

async function start(host) {
  const id = levelKey();
  let renderer;
  try {
    const cv = document.createElement('canvas');
    cv.className = 'briefcanvas';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Destination vista');
    host.appendChild(cv);
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch (e) { V.failed = true; return; }
  if (typeof bodyState !== 'function' || typeof LEVELS === 'undefined') { V.failed = true; return; }
  V.renderer = renderer;
  V.canvas = renderer.domElement;
  V.scene = new THREE.Scene();
  V.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 200);
  /* Same Hipparcos backdrop as the select view so vistas sit in real sky. */
  try {
    const skybox = loadSpaceSkybox();
    if (skybox) V.scene.background = skybox;
    if ('backgroundIntensity' in V.scene) V.scene.backgroundIntensity = 0.7;
  } catch (e) {}
  /* No local ambient here: buildSolarSystem owns the single physical rig
     (dim fill + decay-2 sunlight + shadows) so brief matches select. */
  const built = buildSolarSystem(V.scene, () => !!V.scene);
  V.bodies = built.bodies;
  V.flareMats = built.flareMats;
  V.sunMat = built.sunMat;
  const stars = buildStars();
  V.scene.add(stars.points);
  V.starMat = stars.mat;
  V.simDays = todayDays();
  /* adopt the shared live clock when fresh: same system, no time jump. */
  try {
    const s = window.__MARGIN_SIMDAYS;
    if (isFinite(s) && Math.abs(s - V.simDays) < 45) V.simDays = s;
  } catch (e) {}
  V.key = id;
  /* entry glide: open wide on the planet, settle into the dossier framing */
  const p1 = new THREE.Vector3(), t1 = new THREE.Vector3();
  vistaCam(id, V.simDays, p1, t1);
  const dist = vistaDist(id);
  const vR = vistaRadius(id);
  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (V.savedPos && V.savedTgt) {
    /* resume: same screen rebuilt under us (objective toggle) — continue
       exactly where we were, no replay */
    V.camera.position.copy(V.savedPos);
    V.camera.lookAt(V.savedTgt);
    V.fly = null;
  } else {
    const p0 = p1.clone().sub(t1).multiplyScalar(1.7).add(t1);
    V.camera.position.copy(p0);
    V.camera.lookAt(t1);
    const off0 = frameOffsets(p0.distanceTo(t1), vR);
    aimShift(off0[0], off0[1]);
    V.fly = still ? null : { t: 0, dur: 1.6, p0: p0.clone(), dist };
    if (still) {
      V.camera.position.copy(p1);
      V.camera.lookAt(t1);
      aimShift(frameOffsets(dist, vR)[0], frameOffsets(dist, vR)[1]);
    }
  }
  /* Dwell meters off the destination (t1 = planet position): measured
     irradiance × albedo, same law as the select view. Sun coupling follows. */
  try {
    const be = exposureForBody(V.key, t1.length());
    V.renderer.toneMappingExposure = be;
    if (V.sunMat && V.sunMat.uniforms && V.sunMat.uniforms.uExposure) {
      V.sunMat.uniforms.uExposure.value = be;
    }
  } catch (e) {}
  try { document.body.classList.add('brief3d'); } catch (e) {}
  V.W = 0; V.H = 0;
  size();
  V.last = performance.now();
  if (!V.raf) V.raf = requestAnimationFrame(frame);
}

/* Called (guarded) from game.js render(). */
function sync() {
  let host = null;
  try { host = document.getElementById('briefview'); } catch (e) { host = null; }
  if (!host) { if (V.raf || V.canvas) stop(); try { document.body.classList.remove('brief3d'); } catch (e) {} return; }
  if (V.canvas && V.canvas.isConnected && V.raf) return;
  stop();
  if (V.failed) return;
  start(host);
}

window.BriefView = { sync, debug };
/* QA probe: planet NDC + camera distance + body count + framing diagnostics */
function debug() {
  const out = { key: V.key, ndc: null, camDist: 0, bodies: 0, jup: null, sun: null, cam: null, flying: !!V.fly };
  try {
    if (!V.camera || !V.key) return out;
    out.camDist = +V.camera.position.length().toFixed(3);
    out.cam = [+V.camera.position.x.toFixed(3), +V.camera.position.y.toFixed(3), +V.camera.position.z.toFixed(3)];
    out.bodies = V.bodies ? Object.keys(V.bodies).length : 0;
    const body = V.bodies && V.bodies[V.key];
    if (body) {
      body.getWorldPosition(_p);
      out.planet = [+_p.x.toFixed(4), +_p.y.toFixed(4), +_p.z.toFixed(4)];
      out.planetDist = +V.camera.position.distanceTo(_p).toFixed(4);
      const v = _p.clone().project(V.camera);
      out.ndc = [+v.x.toFixed(3), +v.y.toFixed(3)];
    } else {
      frameOf(V.key, V.simDays, _p, _t);
      const v = _t.project(V.camera);
      out.ndc = [+v.x.toFixed(3), +v.y.toFixed(3)];
    }
    out.camY = [+V.camera.matrixWorld.elements[4].toFixed(3), +V.camera.matrixWorld.elements[5].toFixed(3), +V.camera.matrixWorld.elements[6].toFixed(3)];
    out.vista = +vistaDist(V.key).toFixed(4);
    out.radius = +vistaRadius(V.key).toFixed(5);
    bodyWorld('jupiter', _p, V.simDays);
    const j = _p.project(V.camera);
    out.jup = [+j.x.toFixed(3), +j.y.toFixed(3)];
    _p.set(0, 0, 0).project(V.camera);
    out.sun = [+_p.x.toFixed(3), +_p.y.toFixed(3)];
  } catch (e) {}
  return out;
}
try { sync(); } catch (e) {}
