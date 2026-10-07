/* MARGIN surface diorama (js/surface-view.js).
   The ops surface world as an independent module: metre-unit terrain + horizon
   context + calibrated rover + ephemeris sky + mast/walkaround cameras +
   drive playback, reading sim state (V, S) but owning no renderer, no loop,
   no game logic. Moved verbatim from js/ops-view.js (only signatures gained
   an explicit V parameter); behavior identical by construction.
   Import cycle note: this module imports two small presenters owned by
   js/ops-view.js (createBodyTextSprite, buildCraftMarker — single home, no
   duplication). Deferred use only (inside function bodies), so the
   ops-view <-> surface-view cycle is safe: neither module touches the other
   at load time. */
import * as THREE from 'three';
import { loadRoverGltf, calibrateRover } from './kit-assembly.js';
import { bodyWorld, UNITS_PER_KM, tex } from './orrery.js';
import { SOLAR_CONSTANT_W_M2 } from './solar-system-accuracy.js';
import { createBodyTextSprite, buildCraftMarker } from './ops-view.js';

const _t = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _zero = new THREE.Vector3(0, 0, 0);
/* NOTE: _m4/_q1/_enu/_mk/_thetaJ2000 and the SURF_* tables are declared once
   each alongside the code that owns them (moved verbatim); do NOT re-add
   them here — duplicate top-level consts kill the module at link time. */

/* Pass-A diagnostic mode (`?terrain-debug`): isolation toggles + debug shading
   modes + stats readout for the expert-directed artifact hunt. URL-gated;
   zero effect on normal loads. See plans_notes/SURFACE_RENDER_PASSES.md. */
const SURF_DEBUG = (() => {
  try { return new URLSearchParams(location.search).has("terrain-debug"); }
  catch (e) { return false; }
})();
const surfDbg = {
  V: null, panel: null, statsEl: null, timer: 0, frames: 0, lastT: 0, fps: 0,
  showBump: true, showRocks: true, showOuter: true, showShadows: true,
  showGlare: true, lockExposure: false, mode: "full", lockedExp: 0,
};
/** Exposure override for the ops-view frame loop: fixed value or null. */
export function surfDebugExposure() {
  if (!SURF_DEBUG || !surfDbg.lockExposure || !surfDbg.V) return null;
  return surfDbg.lockedExp || null;
}

/* Starmap isolation spin (`?sky-spin[=degPerSec|warp]`): unplugs the star sphere
   from all ephemeris/time input and rotates it steadily about the J2000 polar
   axis from its entry orientation, 0→360° looping. Bare `?sky-spin` and
   `=warp` both follow the warp (true apparent rate,
   13.176°/mission-day × V.viewRate, so ~132°/s at the default 10 d/s warp);
   an explicit number pins a fixed wall rate instead (legacy fixed mode).
   Pause freezes either mode. Sun/Earth/planets/lighting stay data-driven —
   stars only. URL-gated; zero effect on normal loads. If this spin renders
   smooth while the data-driven sky jumps, the defect is on the time/input
   side; if this jumps too, it is on the render side (fps, texture, camera). */
const SKY_SPIN = (() => {
  try {
    const q = new URLSearchParams(location.search);
    if (!q.has("sky-spin")) return { on: false, deg: 0, warp: false };
    const raw = ((q.get("sky-spin") || "").trim() || "").toLowerCase();
    if (raw === "" || raw === "warp" || raw === "w") return { on: true, deg: 0, warp: true };
    const v = parseFloat(raw);
    const deg = isFinite(v) ? Math.max(-180, Math.min(180, v)) : 10;
    return { on: true, deg: (deg === 0 ? 10 : deg), warp: false };
  } catch (e) { return { on: false, deg: 0, warp: false }; }
})();
/* Resolved isolation-spin rate (deg/wall-s). Fixed mode: the parsed value.
   Warp mode: the true apparent sky rate for the current exact sim rate —
   debug-only explanatory constant 360/27.321661 ≈ 13.176°/mission-day times
   V.viewRate. Never touches ephemeris or mission time. */
function skySpinDegPerS(V) {
  if (!SKY_SPIN.warp) return SKY_SPIN.deg;
  const rate = (V && isFinite(V.viewRate) && V.viewRate > 0) ? V.viewRate : 0;
  return 13.176 * rate;
}
const _skySpinBadge = { el: null, lastDeg: 1e9 };

/* Steady-spin site longitude (USER-DIRECTED approximation — documented
   deviation from exact-time rendering, see updateSurfSky). Mean synchronous
   rate: 360° per sidereal month (27.321661 d) ≈ 13.176°/mission-day. The spin
   advances by this rate times ACTUAL mission-day deltas (V.simDays
   differences): pause-safe (delta 0), warp-exact at every warp, no wall
   clock, no independent rate. Same rotational sense as truth by construction
   (it advances the same longitude variable the ephemeris path produces).
   Phase vs JPL truth oscillates at equation-of-center scale (≈ ±7°,
   bounded, non-accumulating; libration was already ignored). Sun/Earth/
   planets/lighting stay on exact JPL geometry — disclosed divergence only.
   `?truth-sky` bypasses the spin and restores direct ephemeris posing. */
const SPIN_RATE_DEG_PER_DAY = 360 / 27.321661;
const TRUTH_SKY = (() => {
  try { return new URLSearchParams(location.search).has("truth-sky"); }
  catch (e) { return false; }
})();

/* Exact-time celestial presentation (no astronomical clock below V.simDays):
   the surface sky renders the CURRENT presentation timestamp every frame —
   quaternions/positions recomputed from true JPL geometry, never chased, so
   no lag can accumulate and no snap threshold exists. Temporal continuity at
   high warp comes from the ops-view motion-blur shutter (whole-frame
   integration of true rendered positions), not from rendering old
   timestamps. Pause-exact: with rate 0 the timestamp freezes, so the frame
   converges sharp. Sim truth (S.surface ce/cn/seg, V.simDays, derive(S)) is
   never written. 2D fallback keeps reading truth directly. Zero per-frame
   allocation (existing scratch vectors/matrices only). */
const SURF_SMOOTH = {
  roverMinMPerS: 14, // parked/pause ease rate (running lag is ~0, so gaps tiny)
  roverMaxMPerS: 600,// warp-adaptive cap ceiling (~10 m/frame, never teleports)
  roverHeadroom: 1.6,// chase runs 1.6x the mean display rate: glued, no ripple
};
const _sunTrue = new THREE.Vector3();
/* `?no-sweep` (Phase-4 A/B diagnostic): disables the rotational sweep mesh so
   a live browser can compare integrated vs sharp-only rendering and measure
   the GPU cost difference. URL-gated; zero effect on normal loads. */
const NO_SWEEP = (() => {
  try { return new URLSearchParams(location.search).has("no-sweep"); }
  catch (e) { return false; }
})();
/* Phase-4.1 sky-signal instrumentation (`?time-debug` only — normal loads pay
   one boolean check per frame and nothing else). Captures, per rendered
   frame, every stage of V.simDays → skymap quaternion so the first frozen
   stage can be identified live. Preallocated struct, zero per-frame
   allocation; scene traverse runs only under this gate. TEMPORARY diagnostic
   scaffolding — remove after the anomaly is root-caused, do not build on it. */
const SKY_DIAG = (() => {
  try { return new URLSearchParams(location.search).has("time-debug"); }
  catch (e) { return false; }
})();
function skyDbgState() {
  return {
    sim: NaN, inp: NaN, lon: NaN, dLon: 0, lonInit: false, lonT: NaN,
    eph: new THREE.Vector3(), ephD: 0, ephInit: false,
    mfp0: 0, mfp1: 0, mfp2: 0, matInit: false, matChg: false,
    qWrite: 0, qChg: false, _wrote: false, qDot: 1, qInit: false, qSignFlip: false,
    m2fp0: 0, m2fp1: 0, m2fp2: 0, mainInit: false, mainChg: false,
    prevQ: new THREE.Quaternion(),
    meshN: 0, meshSame: false, meshVis: false, meshPar: false, meshRO: 0,
    mesh: null, meshChg: false,
    motD: 0, sweepN: 0,
    writeGap: 0, chgGap: 0,
  };
}
/* Phase-3 presentation motion state (previous/current render poses).
   STATE ARCHITECTURE ONLY — no blur, no interpolation, no visual change.
   The sim/ephemeris pipeline is untouched; this struct merely COPIES the
   already-computed exact current poses once per rendered frame so Phase 4
   can integrate over a real (previous → current) motion interval instead of
   reconstructing motion from timestamps. Timestamps here are frame samples
   (overwritten every advance), never integrated — not a clock. All
   vectors/quaternions preallocated (factory runs once per surface build;
   planet slots once per planet-set); the per-frame advance path allocates
   nothing. */
/* Phase-4 sweep scratch (derived render state only — mot untouched).
   _qSwA carries qDelta = skyPrev⁻¹ × skyCur; _qSwB carries skyPrev⁻¹. */
const _qSwA = new THREE.Quaternion();
const _qSwB = new THREE.Quaternion();
function motionState() {
  return {
    _init: false, _tels: NaN, _warned: false,
    _pSky: false, _pSun: false, _pBody: false,
    prevDays: NaN, curDays: NaN, dDays: 0,
    skyPrev: new THREE.Quaternion(), skyCur: new THREE.Quaternion(),
    skyValid: false, skyDeg: 0,
    sunPrev: new THREE.Vector3(), sunCur: new THREE.Vector3(),
    sunValid: false, sunDeg: 0,
    earthPrev: new THREE.Vector3(), earthCur: new THREE.Vector3(),
    earthSpinPrev: 0, earthSpinCur: 0,
    bodies: null, bodyValid: false, earthM: 0, planetM: 0,
    sweepTaps: 0, sweepMode: "off", sweepActive: false, sweepFinite: false,
  };
}
/* Lifecycle reset: next advance initializes prev == cur (zero interval).
   Called on surface entry; teleport cuts are detected per-frame via
   V.teleports instead (same >500 d re-anchor counter the shutter uses). */
function motionReset(M) {
  if (!M) return;
  M._init = false; M._tels = NaN; M._warned = false;
  M._pSky = false; M._pSun = false; M._pBody = false;
  M.prevDays = NaN; M.curDays = NaN; M.dDays = 0;
  M.skyValid = false; M.skyDeg = 0;
  M.sunValid = false; M.sunDeg = 0;
  M.bodyValid = false; M.earthM = 0; M.planetM = 0;
  M.sweepTaps = 0; M.sweepMode = "off"; M.sweepActive = false; M.sweepFinite = false;
  M.earthSpinPrev = 0; M.earthSpinCur = 0;
}
/* Measurement-only angular separations (degrees) for diagnostics. The |dot|
   makes the quaternion measure antipode-safe; this observes pose pairs, it
   never interpolates them — no shortest-path write is introduced. */
function quatDeg(a, b) {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}
function vecDeg(a, b) {
  const la = a.length(), lb = b.length();
  if (!(la > 1e-9) || !(lb > 1e-9)) return 0;
  const d = Math.max(-1, Math.min(1, a.dot(b) / (la * lb)));
  return Math.acos(d) * 180 / Math.PI;
}
function _fin3(v) {
  return v && isFinite(v.x + v.y + v.z);
}

/* Surface camera (mast + walkaround). Mast: 2 m eye over the rover on the
   terrain normal, gaze along the rover heading (toward the prime target),
   persistent cockpit free-look offsets. Walkaround: OrbitControls about the
   rover with a terrain-floor clamp. Pause-exact: nothing here advances. */
function updateSurfaceCamera(V) {
  const F = V.surf;
  if (!F || !F.roverPos) return;
  if (V.camMode === 'surface') {
    // Walkaround: keep the controls target glued to the rover, floor above ground.
    // Honest-timelapse delta-follow (T3): the camera rides the rover's frame
    // delta each tick, so driving at warp never stretches the leash — the
    // 150 m clamp below is a backstop that no longer trips in normal use
    // (it used to cut the frame every few sols at warp).
    try {
      if (F.roverPos) {
        if (V.surfCamAnchor) {
          _t2.subVectors(F.roverPos, V.surfCamAnchor);
          _t2.y = 0;
          if (_t2.lengthSq() > 400 * 400) {
            /* Site change / re-entry: re-seed, never lurch. */
            V.surfCamAnchor.copy(F.roverPos);
          } else if (_t2.lengthSq() > 1e-10) {
            V.camera.position.add(_t2);
            V.surfCamAnchor.copy(F.roverPos);
          }
        } else {
          V.surfCamAnchor = F.roverPos.clone();
        }
      }
      V.controls.target.set(F.roverPos.x, F.roverPos.y + 1.0, F.roverPos.z);
      const gy = surfHeightAt(F.patch, V.camera.position.x, V.camera.position.z) + 0.5;
      if (V.camera.position.y < gy) V.camera.position.y = gy;
      // Leashed to the subject: walkaround never loses the rover (was 800 m).
      const d = V.camera.position.distanceTo(V.controls.target);
      if (d > 150) {
        _t2.subVectors(V.camera.position, V.controls.target).normalize();
        V.camera.position.copy(V.controls.target).addScaledVector(_t2, 150);
      }
    } catch (e) {}
    return;
  }
  // Mast (default surface view, incl. unknown modes).
  V.camMode = 'mast';
  try {
    surfNormalAt(F.patch, F.roverPos.x, F.roverPos.z, _t);
    V.camera.up.copy(_t);
    V.camera.position.set(
      F.roverPos.x + _t.x * 2.0,
      F.roverPos.y + _t.y * 2.0,
      F.roverPos.z + _t.z * 2.0);
    // Gaze: rover heading toward the prime target (patch centre), levelled.
    _t2.set(-F.roverPos.x, 0, -F.roverPos.z);
    if (_t2.lengthSq() < 1e-6) _t2.set(0, 0, 1);
    _t2.normalize().add(V.camera.position);
    V.controls.target.copy(_t2);
    V.camera.lookAt(_t2);
    const lk = V.cockpitLook;
    if (lk) {
      if (lk.yaw) V.camera.rotateY(lk.yaw);
      if (lk.pitch) V.camera.rotateX(lk.pitch);
    }
  } catch (e) {}
}

/* ── Phase-5 surface diorama (metre units, own scene, same renderer/camera) ──
   A bounded 3×3 km patch of REAL LOLA relief (js/surface-data.js bake) with the
   calibrated 3.0 m rover at the touchdown point. Own scene because orbital
   units (1u≈21M km) cannot hold metre geometry in fp32 — but the SAME rig
   recipe: sun colour 0xfff2d8, irradiance 1361 W/m², the exposureForBody iris
   law, ACES. Parity by construction, not a second lighting path. Built lazily
   on first surface entry (never at boot); disposed in stop(). */
/* ── Surface diorama v2 (metre units, own scene, same renderer/camera) ──
   Inner 3×3 km patch (200×200 real LOLA heights) + outer 48×48 km B1 horizon
   context (120×120, same grids, curvature drop baked on both — zero fake
   geology at the seam), calibrated 3.0 m rover, measured-roughness drape.
   Own scene because orbital units cannot hold metres in fp32 — but the SAME
   rig recipe: sun colour 0xfff2d8, irradiance 1361 W/m², exposureForBody iris,
   ACES. Built lazily on first surface entry (never at boot); disposed in
   stop(). */
function decF32(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Float32Array(u.buffer);
}
function decU8(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
/* Decode-once: replaces site.h/slope-view with live typed arrays IN PLACE
   (same object identity and keys — game.js hazard readers and every sampler
   keep working untouched). Heights f32 metres; slope stays the plain v1
   array (game.js parity); roughness CanvasTexture cached on the site. */
function decodeSite(site) {
  if (!site || site._dec) return site;
  try {
    site.h = decF32(site.in.h);
    site.n = site.in.n;
    site.sizeM = site.in.sizeM;
    site.postM = site.sizeM / (site.n - 1);
    const oh = decF32(site.out.h);
    site.outH = oh;
    if (site.rough && site.rough.b) {
      const ru = decU8(site.rough.b), rn = site.rough.n;
      const cv = document.createElement('canvas');
      cv.width = cv.height = rn;
      const cx2 = cv.getContext('2d');
      const im = cx2.createImageData(rn, rn);
      for (let i = 0; i < rn * rn; i++) {
        const mn = site.rough.min, mx = site.rough.max;
        const t = mx > mn ? (ru[i] / 255) : 0.5;
        // Measured roughness → material roughness (darker = smoother).
        // Display-only mapping of a measured quantity, disclosed (SOURCES §13).
        const v = Math.round(255 * (1 - t * 0.55));
        im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
        im.data[i * 4 + 3] = 255;
      }
      cx2.putImageData(im, 0, 0);
      const tx = new THREE.CanvasTexture(cv);
      tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
      site.roughTex = tx;
    }
    site._dec = true;
  } catch (e) { /* decode failure → buildSurface refuses (null), orbital stays */ }
  return site;
}
function surfHeightAt(patch, x, z) {
  const n = patch.n, post = patch.sizeM / (n - 1);
  const fi = (x + patch.sizeM / 2) / post, fj = (z + patch.sizeM / 2) / post;
  const i0 = Math.max(0, Math.min(n - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(n - 2, Math.floor(fj)));
  const fx = Math.max(0, Math.min(1, fi - i0)), fz = Math.max(0, Math.min(1, fj - j0));
  const h = patch.h, g = (jj, ii) => h[jj * n + ii];
  const base = g(j0, i0) * (1 - fx) * (1 - fz) + g(j0, i0 + 1) * fx * (1 - fz)
    + g(j0 + 1, i0) * (1 - fx) * fz + g(j0 + 1, i0 + 1) * fx * fz;
  // Part-8: geometric large bowls ride 3D grounding (mesh/rover/rocks/camera
  // only — patch.h itself is never modified, sim and 2D stay pure LOLA).
  return base + visualCraterOffset(patch, x, z);
}
function surfNormalAt(patch, x, z, out) {
  const e = patch.sizeM / (patch.n - 1);
  const dx = (surfHeightAt(patch, x + e, z) - surfHeightAt(patch, x - e, z)) / (2 * e);
  const dz = (surfHeightAt(patch, x, z + e) - surfHeightAt(patch, x, z - e)) / (2 * e);
  return out.set(-dx, 1, -dz).normalize();
}
/* Part-8 (geometric depth): the largest analytical bowls (D 18–45 m) live in
   REAL mesh vertices + 3D grounding — never in patch.h (sim, hazard grids,
   and the 2D fallback stay pure LOLA; only vertical 3D placement diverges,
   horizontal traverse parity untouched). One seeded set per site cached on
   the patch (plain data, no GPU), spatial-hashed for O(1) lookup. */
function largeCraters(patch) {
  if (patch._large) return patch._large;
  let cseed = (0x1A6E01 ^ (((patch.lat0 || 0) * 977 + (patch.lon0 || 0) * 131) | 0)) >>> 0;
  const crnd = () => (cseed = (cseed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const half = patch.sizeM / 2, list = [];
  for (let c = 0; c < 150; c++) {
    const D = 18 + 27 * Math.pow(crnd(), 1.8);
    list.push({ x: (crnd() * 2 - 1) * (half - 60), z: (crnd() * 2 - 1) * (half - 60),
      R: D / 2, depth: 0.15 * D, rimH: 0.04 * D });
  }
  const cell = 150, grid = new Map();
  list.forEach((cr, idx) => {
    const ccx = Math.floor((cr.x + half) / cell), ccz = Math.floor((cr.z + half) / cell);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const k = (ccx + i) * 4096 + (ccz + j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(idx);
    }
  });
  patch._large = { list, grid, cell, half };
  return patch._large;
}
function visualCraterOffset(patch, x, z) {
  let y = 0;
  try {
    const L = largeCraters(patch);
    const cell = L.grid.get(Math.floor((x + L.half) / L.cell) * 4096 + Math.floor((z + L.half) / L.cell));
    if (!cell) return 0;
    for (let n = 0; n < cell.length; n++) {
      const cr = L.list[cell[n]];
      const dx = x - cr.x, dz = z - cr.z;
      if (Math.abs(dx) > cr.R * 1.5 || Math.abs(dz) > cr.R * 1.5) continue;
      const r = Math.hypot(dx, dz);
      if (r <= cr.R) { const t = 1 - (r / cr.R) * (r / cr.R); y -= cr.depth * t; }
      else if (r <= cr.R * 1.5) { const t = (r - cr.R) / (0.5 * cr.R); y += cr.rimH * Math.exp(-t * t * 4); }
    }
  } catch (e) {}
  return y;
}
/* Traverse display convention (shared with the game.js Canvas2D fallback):
   CONTINUOUS sim kilometres (ce/cn = P(sol−1+df), refreshed per game tick)
   × dscale → patch metres, north = −z. The diorama compresses
   the whole traverse into the 3 km patch (D4, labeled in HUD); the final
   1.5 km runs 1:1. Same formula both renderers — positions can never drift.
   Falls back to stepped e/n (old saves, pre-landing). */
function surfDisplayXZ() {
  try {
    const F = (typeof S !== 'undefined') ? S.surface : null;
    if (F && isFinite(F.e) && isFinite(F.n) && F.dscale > 0) {
      /* Sub-tick lookahead (presentation only — sim truth stays the per-tick
         ce/cn + seg ring): evaluate the SHARED surfEvalAt (game.js, single
         implementation) at sC_tick + lead*rate, so every rendered frame
         advances along simulated truth instead of holding at the tick value
         then leaping. lead capped 0.1 s to match the sim's 100 ms dt clamp
         (same thread — the view can never legitimately lead truth by more),
         and the adaptive tick lag headrooms it (no clamp-hold at warp, no
         overshoot past the newest sample: surfEvalAt holds the endpoint).
         Rate 0 while paused (freeze-exact). Next tick re-anchors. */
      try {
        const rate = F._dRate;
        if ((typeof surfEvalAt === 'function') && isFinite(rate) && rate > 0 &&
            isFinite(F._dSC) && isFinite(F._dTick)) {
          const nowMs = performance.now();
          const lead = Math.min(0.1, Math.max(0, (nowMs - F._dTick) / 1000));
          const extra = lead * rate;
          if (extra > 1e-9) {
            const r = surfEvalAt(F._dSC + extra);
            if (r && isFinite(r.e) && isFinite(r.n))
              return { x: r.e * 1000 * F.dscale, z: -r.n * 1000 * F.dscale };
          }
        }
      } catch (e2) { /* tick value stands */ }
      const e0 = isFinite(F.ce) ? F.ce : F.e, n0 = isFinite(F.cn) ? F.cn : F.n;
      return { x: e0 * 1000 * F.dscale, z: -n0 * 1000 * F.dscale };
    }
  } catch (e) {}
  return { x: 0, z: 0 };
}
/* Segment display delta (sim km): the direction the rover is actually
   travelling on the evaluated sol segment — heading reference for the 3D
   model. Prefers the game.js per-tick segment direction (F.de/dn, single
   implementation); falls back to ce/cn↔pe/pn, then e/n (old saves).
   Zero while dwelling/charging (caller keeps last heading). */
function surfDisplayDelta() {
  try {
    const F = (typeof S !== 'undefined') ? S.surface : null;
    if (F && isFinite(F.e) && isFinite(F.n) && F.dscale > 0) {
      const k = 1000 * F.dscale;
      if (isFinite(F.de) && isFinite(F.dn))
        return { dx: F.de * k, dz: -F.dn * k };
      const e = isFinite(F.ce) ? F.ce : F.e, n = isFinite(F.cn) ? F.cn : F.n;
      const pe = isFinite(F.pe) ? F.pe : F.e, pn = isFinite(F.pn) ? F.pn : F.n;
      return { dx: (e - pe) * k, dz: -(n - pn) * k };
    }
  } catch (e) {}
  return { dx: 0, dz: 0 };
}
/* Site ENU basis. lonE defaults to the site longitude; pass an effective
   longitude to include tidal-lock rotation (see surfLonEff). */
function surfENU(site, out, lonE) {
  const phi = site.lat0 * Math.PI / 180;
  const lam = ((lonE === undefined ? site.lon0 : lonE)) * Math.PI / 180;
  out.up.set(Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi));
  out.east.set(-Math.sin(lam), Math.cos(lam), 0);
  out.north.set(-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi));
  return out;
}
/* Tidal lock: the Moon turns with its orbit (360° per 27.3 d), so the site's
   topocentric frame must rotate with the Moon's orbital longitude. Without
   this the stars hang fixed forever and diurnal motion dies. Physical
   libration (±8°) still ignored (documented); positions stay exact. */
const _mk = new THREE.Vector3();
const _gc = new THREE.Vector3();
let _thetaJ2000 = null;
function surfLonEff(site, moonKm, simDays) {
  try {
    // Tidal-lock rate MUST come from the Moon's GEOCENTRIC longitude (Moon minus
    // Earth: 13.2°/day, the true 27.3 d spin). The heliocentric longitude is
    // Earth's annual motion (~1°/day) — using it froze the sun in the sky.
    bodyWorld('moon', _p, simDays || 0);
    bodyWorld('earth', _gc, simDays || 0);
    _p.sub(_gc);
    if (_thetaJ2000 === null || !isFinite(_thetaJ2000)) {
      // _t/_t2 scratch only: _mk aliases the caller's moonKm — never touch it.
      bodyWorld('moon', _t, 0);
      bodyWorld('earth', _t2, 0);
      _t.sub(_t2);
      _thetaJ2000 = Math.atan2(_t.y, _t.x) * 180 / Math.PI;
    }
    const th = Math.atan2(_p.y, _p.x) * 180 / Math.PI;
    let d = (th - _thetaJ2000) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return site.lon0 + d;
  } catch (e) { return site.lon0; }
}
const _enu = { up: null, east: null, north: null };
function surfMoonKm(V, out, daysOverride) {
  try {
    // Single-clock rule: never the stepped mission target position (it jumps
    // per game frame while the tidal frame moves continuously). daysOverride
    // carries the exact presentation timestamp (same value feeds lonEff/
    // bodyDir below, so sun-vs-stars can never disagree).
    bodyWorld('moon', _p, isFinite(daysOverride) ? daysOverride : (V.simDays || 0));
    return out.set(_p.x / UNITS_PER_KM, _p.y / UNITS_PER_KM, _p.z / UNITS_PER_KM);
  } catch (e) { return out.set(384400, 0, 0); }
}
/* Sky time: the surface sky renders V.simDays (the per-frame view clock owned
   by the ops-view animate loop) EXACTLY — no chase, no cap, no snap. The
   single exact value feeds moonKm + lonEff + bodyDir + spin together, so
   sun-vs-stars can never disagree and no lag can accumulate; high-warp
   continuity comes from the whole-frame shutter, not from old timestamps.
   Pause freezes the timestamp, so the frame converges sharp. */
function surfBodyDir(key, moonKm, out, days) {
  try {
    bodyWorld(key, _p, days || 0);
    out.set(_p.x / UNITS_PER_KM - moonKm.x, _p.y / UNITS_PER_KM - moonKm.y, _p.z / UNITS_PER_KM - moonKm.z);
    if (out.lengthSq() < 1e-12) out.set(0, 0, 1);
    return out.normalize();
  } catch (e) { return out.set(0, 1, 0); }
}
/* Exact Sun direction shared by the main path and the sun-trail ghosts
   (single implementation — no second sun math). Moon→Sun J2000 unit vector
   (via -moonKm) expressed in the given site ENU basis. _t carries the J2000
   direction on return for callers that also place billboards via place(). */
function sunTrueFromFrame(moonKmV, enu, out) {
  _t.set(-moonKmV.x, -moonKmV.y, -moonKmV.z).normalize();
  const eu = _t.dot(enu.up);
  const el = Math.asin(Math.max(-1, Math.min(1, eu)));
  const ee = _t.dot(enu.east), en = _t.dot(enu.north);
  const azS = Math.atan2(ee, en), ceS = Math.cos(el);
  out.set(Math.sin(azS) * ceS, Math.sin(el), -Math.cos(azS) * ceS).normalize();
  return out;
}
/* Honest rock dressing (disclosed illustration, zero sim effect): ONE 2500-
   instance mesh from a SEEDED LCG (deterministic per entry state) —
   1500 pebbles (0.08–0.5 m) within r150 m of touchdown so ejecta reads at
   mast height, plus 1000 boulders (0.5–2.5 m) patch-wide preferring MEASURED
   steep slopes. No sculpted landforms, no invented craters; sub-DEM blocks
   are statistically plausible but individually illustrative. */
function buildRocks(scene, patch) {
  const NEAR = 1500, FAR = 1000, COUNT = NEAR + FAR;
  // Part-3 (breccia): detail-2 icosahedron, radially noised ±20% by a
  // position hash (deterministic, no allocation), welded smooth normals +
  // baked bottom contact shadow in vertex colors. Reads as ejecta, not dice.
  // Part-9 (Play-Doh): folded ridge displacement (1-|sin| creases) instead
  // of smooth sine waves — fracture planes, not inflated balloons. Same
  // ±20% amplitude, deterministic position hash, welded smooth normals.
  const geo = new THREE.IcosahedronGeometry(1, 2);
  try {
    const pa = geo.attributes.position;
    const hsh = (x, y, z) => {
      const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let k = 0; k < pa.count; k++) {
      const vx = pa.getX(k), vy = pa.getY(k), vz = pa.getZ(k);
      const seedQ = hsh(vx, vy, vz) * 6.2832;
      const f1 = 1 - Math.abs(Math.sin(vx * 5.2 + seedQ));
      const f2 = 1 - Math.abs(Math.cos(vy * 4.7 + seedQ * 1.3));
      const f3 = 1 - Math.abs(Math.sin(vz * 6.1 + seedQ * 0.7));
      const s = 1 + (((f1 + f2 + f3) / 3) - 0.5) * 0.44;
      pa.setXYZ(k, vx * s, vy * s, vz * s);
    }
    // Weld duplicated polyhedron verts by rounded key, average face normals.
    const acc = new Map();
    const keyOf = (k) => pa.getX(k).toFixed(4) + ',' + pa.getY(k).toFixed(4) + ',' + pa.getZ(k).toFixed(4);
    const ax = new THREE.Vector3(), bx = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let f = 0; f < pa.count; f += 3) {
      ax.set(pa.getX(f + 1) - pa.getX(f), pa.getY(f + 1) - pa.getY(f), pa.getZ(f + 1) - pa.getZ(f));
      bx.set(pa.getX(f + 2) - pa.getX(f), pa.getY(f + 2) - pa.getY(f), pa.getZ(f + 2) - pa.getZ(f));
      fn.crossVectors(ax, bx);
      for (let v = 0; v < 3; v++) {
        const key = keyOf(f + v), e = acc.get(key);
        if (e) { e.x += fn.x; e.y += fn.y; e.z += fn.z; }
        else acc.set(key, { x: fn.x, y: fn.y, z: fn.z });
      }
    }
    const na = new Float32Array(pa.count * 3), ca = new Float32Array(pa.count * 3);
    const sstep = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    for (let k = 0; k < pa.count; k++) {
      const e = acc.get(keyOf(k)) || { x: 0, y: 1, z: 0 };
      const il = 1 / (Math.hypot(e.x, e.y, e.z) || 1);
      na[k * 3] = e.x * il; na[k * 3 + 1] = e.y * il; na[k * 3 + 2] = e.z * il;
      // Baked contact shadow: bottom third dark even outside the shadow box.
      const c = 0.55 + 0.45 * sstep(-0.6, 0.3, pa.getY(k));
      ca[k * 3] = c; ca[k * 3 + 1] = c; ca[k * 3 + 2] = c;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(na, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  } catch (e) { /* faceted fallback stands */ }
  // Part-5 (P): dust-coated base — boulders wear the same regolith as soil.
  const mat = new THREE.MeshStandardMaterial({ color: 0x6e6e70, roughness: 1, metalness: 0, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
    eu = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3(),
    nv = new THREE.Vector3();
  let seed = 0xC0FFEE;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const half = patch.sizeM / 2 - 20;
  // Touchdown-centered foreground disc (clamped in-patch; traverse start).
  let cx = 0, cz = 0;
  try {
    const p = surfDisplayXZ();
    if (isFinite(p.x) && isFinite(p.z)) {
      cx = Math.max(-half + 310, Math.min(half - 310, p.x));
      cz = Math.max(-half + 310, Math.min(half - 310, p.z));
    }
  } catch (e) { /* patch-centre cluster stands */ }
  // Part-5 (P): rim-arc clustering — 70% of rocks sit in arcs around the
  // steepest measured-slope loci (crater walls ARE the steep loci: honest
  // rim proxy from real DEM, no invented ejecta rays). Mare floors stay
  // clean powder. Greedy top-48 with 40 m separation, seeded deterministic.
  const rimC = [];
  try {
    const cand = [];
    for (let s = 0; s < 6000; s++) {
      const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
      surfNormalAt(patch, x, z, nv);
      const sl = Math.acos(Math.max(-1, Math.min(1, nv.y))) * 180 / Math.PI;
      cand.push([sl, x, z]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    for (const [sl, x, z] of cand) {
      if (rimC.length >= 48) break;
      let ok = true;
      for (const c of rimC) {
        const dx = x - c[0], dz = z - c[1];
        if (dx * dx + dz * dz < 1600) { ok = false; break; }
      }
      if (ok) rimC.push([x, z]);
    }
  } catch (e) { /* uniform fallback stands */ }
  const rimArc = () => {
    if (!rimC.length) return null;
    const c = rimC[(rnd() * rimC.length) | 0];
    const a = rnd() * Math.PI * 2 + (rnd() - 0.5) * 3.5; // arc segment
    const r = 15 + rnd() * 45;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  };
  const drop = (x, z, sc) => {
    // Part-9 (spawn clipping): no boulder >0.12 m within 5.5 m of touchdown
    // (rover chassis ~3 m + clearance). Pebbles stay — grit belongs there.
    const dtx = x - cx, dtz = z - cz;
    if (sc > 0.12 && dtx * dtx + dtz * dtz < 30.25) return false;
    const gy = surfHeightAt(patch, x, z);
    eu.set(rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI);
    q.setFromEuler(eu);
    // Squashed + lightly sunk (Part-7: −0.15·r — −0.25 buried pebbles).
    sv.set(sc * (0.7 + rnd() * 0.6), sc * (0.5 + rnd() * 0.4) * 0.6, sc * (0.7 + rnd() * 0.6));
    pv.set(x, gy + sv.y * 0.15 - 0.15 * sc, z);
    m4.compose(pv, q, sv);
    return true;
  };
  const _col = new THREE.Color();
  const tint = () => {
    // ±10% dust variation around the regolith base.
    const g = 0.9 + rnd() * 0.2;
    return _col.setRGB(g, g, g);
  };
  let placed = 0, guard = 0;
  // Part-7 (foreground): the touchdown disc doesn't follow the rover, so
  // pebble the whole drive — corridor from touchdown toward patch center
  // (the prime-target proxy the mast gaze already assumes), ±60 m wide.
  // Static, seeded, zero per-frame cost; traverse path is deterministic.
  const corr = (t) => {
    const px = cx + (0 - cx) * t, pz = cz + (0 - cz) * t;
    const dx = 0 - cx, dz = 0 - cz;
    const L = Math.hypot(dx, dz) || 1;
    const off = (rnd() + rnd() - 1) * 60;
    return [px + (-dz / L) * off, pz + (dx / L) * off];
  };
  for (let c = 0; c < 800 && placed < NEAR; c++) {
    const [x, z] = corr(rnd());
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    if (drop(x, z, 0.08 + Math.pow(rnd(), 1.6) * 0.32) === false) continue;
    mesh.setMatrixAt(placed, m4);
    try { mesh.setColorAt(placed, tint()); } catch (e) {}
    placed++;
  }
  while (placed < NEAR && guard++ < NEAR * 60) {
    let x, z;
    if (rnd() < 0.55) {
      const pt = rimArc();
      if (!pt) continue;
      x = pt[0]; z = pt[1];
    } else {
      // Dense touchdown disc (r40): guaranteed near-field grit at landing.
      const a = rnd() * Math.PI * 2, r = 40 * Math.sqrt(rnd());
      x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
    }
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    if (drop(x, z, 0.08 + Math.pow(rnd(), 1.6) * 0.42) === false) continue;
    mesh.setMatrixAt(placed, m4);
    try { mesh.setColorAt(placed, tint()); } catch (e) {}
    placed++;
  }
  guard = 0;
  while (placed < COUNT && guard++ < FAR * 60) {
    let x, z;
    if (rnd() < 0.7) {
      const pt = rimArc();
      if (!pt) continue;
      x = pt[0]; z = pt[1];
    } else {
      x = (rnd() * 2 - 1) * half; z = (rnd() * 2 - 1) * half;
      // Uniform share still prefers broken ground (floors stay clean).
      surfNormalAt(patch, x, z, nv);
      const sl = Math.acos(Math.max(-1, Math.min(1, nv.y))) * 180 / Math.PI;
      if (sl < 2 && rnd() > 0.5) continue;
    }
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    if (drop(x, z, 0.5 + Math.pow(rnd(), 1.8) * 2.0) === false) continue;
    mesh.setMatrixAt(placed, m4);
    try { mesh.setColorAt(placed, tint()); } catch (e) {}
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  try { if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; } catch (e) {}
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
/* Part-5/8 (M+N): patch-wide meso + horizon maps from decoded LOLA heights.
   Meso: bicubic-upsampled patch.h[] → 2048² float (1.46 m/texel) + seeded
   6–18 m analytical bowls → central-difference normals → RGBA8 DataTexture,
   repeat 1 (unique world locations — zero tiling). Alpha packs local
   crater Δh for the relief-offset pass. ≥18 m bowls live in geometry, so
   the texture band stops at 18 m (no double relief). Texture row 0 = v0 =
   south (+z), matching PlaneGeometry's untouched uv attribute (v=1 ↔ north).
   Horizon: DEM + mid stamps + geometric large bowls marched in 4 world dirs
   (±x, ±z) with exponential texel steps to ~400 m → max slope → sin(θH)
   packed RGBA8 1024² (R=+x G=−x B=+z A=−z). patch.h[] untouched — sim
   pristine. Built once per site entry (covered by the LAND blackout). */
function buildMesoMaps(patch) {
  const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
  const N = 2048, HN = 1024, size = patch.sizeM, half = size / 2;
  const n = patch.n, h = patch.h;
  const post = size / (N - 1);
  const H = new Float32Array(N * N);
  const ci = (v) => v < 0 ? 0 : v > n - 1 ? n - 1 : v;
  const src = (jj, ii) => h[ci(jj) * n + ci(ii)];
  const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  for (let ty = 0; ty < N; ty++) {
    const gj = (n - 1) - (ty / (N - 1)) * (n - 1); // row 0 = south = patch row n-1
    const j0 = Math.floor(gj), fj = gj - j0;
    for (let tx = 0; tx < N; tx++) {
      const gi = (tx / (N - 1)) * (n - 1);
      const i0 = Math.floor(gi), fi = gi - i0;
      const r0 = catmull(src(j0 - 1, i0 - 1), src(j0 - 1, i0), src(j0 - 1, i0 + 1), src(j0 - 1, i0 + 2), fi);
      const r1 = catmull(src(j0, i0 - 1), src(j0, i0), src(j0, i0 + 1), src(j0, i0 + 2), fi);
      const r2 = catmull(src(j0 + 1, i0 - 1), src(j0 + 1, i0), src(j0 + 1, i0 + 1), src(j0 + 1, i0 + 2), fi);
      const r3 = catmull(src(j0 + 2, i0 - 1), src(j0 + 2, i0), src(j0 + 2, i0 + 1), src(j0 + 2, i0 + 2), fi);
      H[ty * N + tx] = catmull(r0, r1, r2, r3, fj);
    }
  }
  // Seeded analytical bowls, 6–18 m band (meters — the buffer is meters):
  // texture-only illustration, same disclosure class as the rock dressing.
  // Part-8: ≥18 m bowls live in REAL geometry (mesh + grounding), so the
  // texture band stops at 18 m — no double relief. DEM backup kept for the
  // relief-offset alpha channel below.
  const DEM0 = H.slice();
  let cseed = 0x9E5017;
  const crnd = () => (cseed = (cseed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const stampInto = (HH, D, dDratio, rimRatio) => {
    const R = D / 2, depth = dDratio * D, rimH = rimRatio * D;
    const cx = (crnd() * 2 - 1) * (half - 40), cz = (crnd() * 2 - 1) * (half - 40);
    const fx = (cx + half) / post, fz = (half - cz) / post;
    const ext = Math.ceil((R * 1.5) / post);
    const ix = Math.round(fx), iy = Math.round(fz);
    for (let j = -ext; j <= ext; j++) for (let i = -ext; i <= ext; i++) {
      const tx = ix + i, ty = iy + j;
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
      const dx = (i - (fx - ix)) * post, dz = (j - (fz - iy)) * post;
      const r = Math.hypot(dx, dz);
      const k = ty * N + tx;
      if (r <= R) { const t = 1 - (r / R) * (r / R); HH[k] -= depth * t; }
      else if (r <= R * 1.5) { const t = (r - R) / (0.5 * R); HH[k] += rimH * Math.exp(-t * t * 4); }
    }
  };
  const stampBowl = (D, dDratio, rimRatio) => stampInto(H, D, dDratio, rimRatio);
  for (let c = 0; c < 300; c++) // Part-9: 4.5–6 m closes the velvet/meso gap
    stampBowl(4.5 + 1.5 * Math.pow(crnd(), 1.5), 0.15 + 0.03 * crnd(), 0.04);
  for (let c = 0; c < 500; c++) // eroded 6–10 m
    stampBowl(6 + 4 * Math.pow(crnd(), 1.5), 0.06 + 0.02 * crnd(), 0.03);
  for (let c = 0; c < 450; c++) // sharp 10–14 m
    stampBowl(10 + 4 * Math.pow(crnd(), 1.8), 0.15 + 0.03 * crnd(), 0.04);
  for (let c = 0; c < 250; c++) // sharp 14–18 m
    stampBowl(14 + 4 * Math.pow(crnd(), 2.0), 0.15 + 0.03 * crnd(), 0.04);
  // Tangent-space normals: T=+x east, B=+v=north(−z). True m/m slopes —
  // no arbitrary strength constant. Alpha packs local crater Δh (vs the
  // pre-stamp DEM) for the relief-offset pass: (Δh+6)/8, range −6..+2 m.
  const meso = new Uint8Array(N * N * 4);
  const Hat = (x, y) => H[(y < 0 ? 0 : y > N - 1 ? N - 1 : y) * N + (x < 0 ? 0 : x > N - 1 ? N - 1 : x)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gx = (Hat(x + 1, y) - Hat(x - 1, y)) / (2 * post);
    const gv = (Hat(x, y + 1) - Hat(x, y - 1)) / (2 * post);
    const nx = -gx, ny = -gv, nzz = 1;
    const il = 1 / (Math.hypot(nx, ny, nzz) || 1);
    const o = (y * N + x) * 4;
    meso[o] = Math.round((nx * il * 0.5 + 0.5) * 255);
    meso[o + 1] = Math.round((ny * il * 0.5 + 0.5) * 255);
    meso[o + 2] = Math.round((nzz * il * 0.5 + 0.5) * 255);
    meso[o + 3] = Math.round(Math.max(0, Math.min(1, (H[y * N + x] - DEM0[y * N + x] + 6) / 8)) * 255);
  }
  const mesoTex = new THREE.DataTexture(meso, N, N, THREE.RGBAFormat);
  mesoTex.wrapS = mesoTex.wrapT = THREE.ClampToEdgeWrapping;
  mesoTex.minFilter = THREE.LinearMipmapLinearFilter;
  mesoTex.magFilter = THREE.LinearFilter;
  mesoTex.anisotropy = 8;
  mesoTex.needsUpdate = true;
  // Horizon march buffer: H plus the geometric large bowls (their own-bowl
  // crescents must cast). Normals/alpha above stay large-free — geometry
  // already carries ≥18 m, no double relief anywhere.
  const H2 = H.slice();
  try {
    const L = largeCraters(patch);
    for (const cr of L.list) {
      const fx = (cr.x + half) / post, fz = (half - cr.z) / post;
      const ext = Math.ceil((cr.R * 1.5) / post);
      const ix = Math.round(fx), iy = Math.round(fz);
      for (let j = -ext; j <= ext; j++) for (let i = -ext; i <= ext; i++) {
        const tx = ix + i, ty = iy + j;
        if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
        const dx = (i - (fx - ix)) * post, dz = (j - (fz - iy)) * post;
        const r = Math.hypot(dx, dz);
        const k = ty * N + tx;
        if (r <= cr.R) { const t = 1 - (r / cr.R) * (r / cr.R); H2[k] -= cr.depth * t; }
        else if (r <= cr.R * 1.5) { const t = (r - cr.R) / (0.5 * cr.R); H2[k] += cr.rimH * Math.exp(-t * t * 4); }
      }
    }
  } catch (e) { /* march falls back to H without large bowls */ }
  // Horizon march with exponential texel offsets from 1: near-rim crescents
  // resolve (1.5 m first step) while 14 fetches still reach ~400 m.
  const hz = new Uint8Array(HN * HN * 4);
  const hstep = size / (HN - 1);
  const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
  const STX = [1, 2, 3, 5, 8, 12, 18, 27, 40, 60, 90, 130, 190, 270];
  const wH2 = (x, z) => {
    const tx = Math.round((x + half) / post), ty = Math.round((half - z) / post);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return -1e9;
    return H2[ty * N + tx];
  };
  for (let hy = 0; hy < HN; hy++) for (let hx = 0; hx < HN; hx++) {
    const x0 = -half + hx * hstep, z0 = half - hy * hstep;
    const h0 = wH2(x0, z0);
    const o = (hy * HN + hx) * 4;
    for (let d = 0; d < 4; d++) {
      let best = -1e9;
      for (let s2 = 0; s2 < STX.length; s2++) {
        const dist = STX[s2] * post;
        const sl = (wH2(x0 + DX[d] * dist, z0 + DZ[d] * dist) - h0) / dist;
        if (sl > best) best = sl;
      }
      const sinH = best / Math.sqrt(1 + best * best);
      hz[o + d] = Math.round(Math.max(0, Math.min(1, sinH * 0.5 + 0.5)) * 255);
    }
  }
  const horizonTex = new THREE.DataTexture(hz, HN, HN, THREE.RGBAFormat);
  horizonTex.wrapS = horizonTex.wrapT = THREE.ClampToEdgeWrapping;
  horizonTex.minFilter = THREE.LinearFilter;
  horizonTex.magFilter = THREE.LinearFilter;
  horizonTex.needsUpdate = true;
  try {
    if (typeof performance !== 'undefined')
      console.log('[surf] meso+horizon build ' + ((performance.now() - t0) | 0) + ' ms');
  } catch (e) {}
  return { mesoTex, horizonTex };
}
function buildSurface(siteId) {
  const P = (typeof SURFACE_PATCHES !== 'undefined') ? SURFACE_PATCHES : null;
  const patch = P && P.sites ? decodeSite(P.sites[siteId]) : null;
  if (!patch || !patch._dec) return null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  // Airless horizon: vacuum-sharp to the 48 km LOLA rim (bounds honesty kept
  // by the in-world patch label, not fog).
  scene.fog = new THREE.Fog(0x000000, 12000, 38000);
  const n = patch.n, size = patch.sizeM;
  // Part-8 (geometric depth): 750² mesh (~4 m spacing) so D ≥ 18 m bowls
  // have REAL rims/floors with parallax and silhouette. Y == surfHeightAt
  // exactly (bilinear DEM + geometric large bowls): rover, rocks, camera,
  // track, and dust ground on precisely this surface.
  const SEG = 750, VN = SEG + 1;
  const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const vstep = size / SEG;
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    const idx = j * VN + i;
    const x = -size / 2 + i * vstep, z = -size / 2 + j * vstep;
    pos.setX(idx, x);
    pos.setZ(idx, z);
    let y = surfHeightAt(patch, x, z);
    // 2 m skirt flange on the patch edge hides T-junction cracks vs the outer mesh.
    if (i === 0 || j === 0 || i === VN - 1 || j === VN - 1) y -= 2;
    pos.setY(idx, y);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  /* Part-3: micro-detail lives ONLY in the baked RGB normal map (USE_NORMALMAP
     and USE_BUMPMAP are mutually exclusive in three — a bumpMap alongside the
     normal map would be silently ignored). Micro-grain derivatives are
     composited into the bake itself (make_detail_texture.mjs). No runtime
     grain texture, no bump slot. */
  /* Display grading (no data change): neutral regolith gray + vertex tint.
     Height fraction from real DEM; slope from the computed mesh normals
     (which include the geometric large bowls); Laplacian from mesh heights.
     Pure display math over the visual surface, no invention. */
  let hmn = 1e9, hmx = -1e9;
  const py = pos.array, ny = geo.attributes.normal.array;
  const VCC = VN * VN;
  for (let k = 0; k < VCC; k++) { const v = py[k * 3 + 1]; if (v < hmn) hmn = v; if (v > hmx) hmx = v; }
  const hspan = Math.max(1, hmx - hmn);
  const vpost = size / SEG, D2G = 180 / Math.PI;
  const colArr = new Float32Array(VCC * 3);
  const clamp1 = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
  for (let k = 0; k < VCC; k++) {
    const t = (py[k * 3 + 1] - hmn) / hspan;
    // Slope shade from the computed mesh normals (DEM + geometric bowls).
    const sl = Math.acos(clamp1(ny[k * 3 + 1])) * D2G;
    // Crevice/ridge definition from mesh heights (discrete Laplacian,
    // bowls darker, crests lighter, ±8%).
    const ix = k % VN, jx = (k / VN) | 0;
    const ixp = ix + 1 > VN - 1 ? k : k + 1, ixm = ix - 1 < 0 ? k : k - 1;
    const jxp = jx + 1 > VN - 1 ? k : k + VN, jxm = jx - 1 < 0 ? k : k - VN;
    const cav = Math.max(-1, Math.min(1,
      (py[ixp * 3 + 1] + py[ixm * 3 + 1] + py[jxp * 3 + 1] + py[jxm * 3 + 1] - 4 * py[k * 3 + 1]) / (2 * vpost)));
    const g = (0.52 + t * 0.16) * (1 - Math.min(45, sl) / 45 * 0.5) * (1 - cav * 0.08);
    colArr[k * 3] = g; colArr[k * 3 + 1] = g; colArr[k * 3 + 2] = g;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  // Part-5 (M): patch-wide meso + horizon maps (built once per site entry;
  // nulls on failure → plain material, never a broken program).
  let mesoHorizon = null;
  try { mesoHorizon = buildMesoMaps(patch); } catch (e) { mesoHorizon = null; }
  // 1-texel flat placeholder: keeps USE_NORMALMAP_TANGENTSPACE defined from
  // first compile, so the program is identical before/after the micro map
  // arrives (texture swap only — no recompile, steady state).
  const flatN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  try { flatN.needsUpdate = true; } catch (e) {}
  // Part-2 (D): regolith has no dielectric sheen — MeshPhysicalMaterial with
  // zero specular lobe (vendored r160 public API; same lights/shadows, no
  // chunk surgery). LOLA roughness drape stays OUT of roughnessMap: planetary
  // "smooth plains" are not PBR-glossy. Uniform roughness 1.0.
  // Part-3 (noon color): neutral charcoal-grey base; airless sunlight is set
  // on the sun light itself (0xfffcf8).
  // Part-5 (M+O): ONE contained program patch — meso-normal blend, horizon
  // shadow gate, Lommel-Seeliger+opposition transfer. Anchors verified
  // against the vendored r160 chunk strings (main-scope tbn mat3;
  // getDirectionalLightInfo directional loop). Same lights, no second rig.
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x78787a, roughness: 1.0, metalness: 0.0,
    specularIntensity: 0.0,
    vertexColors: true,
    normalMap: flatN,
    normalScale: new THREE.Vector2(1.1, 1.1)
  });
  if (mesoHorizon && mesoHorizon.mesoTex && mesoHorizon.horizonTex) {
    try {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uMesoMap = { value: mesoHorizon.mesoTex };
        shader.uniforms.uHorizonMap = { value: mesoHorizon.horizonTex };
        shader.uniforms.uSunDirENU = { value: sdir };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vMesoUv;\nvarying vec3 vWorldPosition;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMesoUv = uv;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec2 vMesoUv;
            varying vec3 vWorldPosition;
            uniform sampler2D uMesoMap;
            uniform sampler2D uHorizonMap;
            uniform vec3 uSunDirENU;`)
          .replace('#include <normal_fragment_maps>', `vec3 macroNormal = normal;
            #include <normal_fragment_maps>
            {
              // Part-8 (parallax depth): 2-step relief offset along the world
              // view ray using crater height from the meso alpha channel.
              // Bowls recess at grazing angles instead of foreshortening flat.
              vec3 wV = normalize( cameraPosition - vWorldPosition );
              vec2 rayUV = ( wV.xz / max( wV.y, 0.15 ) ) / 3000.0;
              float h0 = ( texture2D( uMesoMap, vMesoUv ).a - 0.75 ) * 8.0;
              float h1 = ( texture2D( uMesoMap, vMesoUv + rayUV * h0 ).a - 0.75 ) * 8.0;
              vec2 duv = vMesoUv + rayUV * ( 0.5 * ( h0 + h1 ) );
              vec3 mesoN = texture2D( uMesoMap, duv ).xyz * 2.0 - 1.0;
              normal = normalize( tbn * normalize( mesoN ) );
              // Part-9 (poured cement): second micro sample at 17.3x rotated
              // 37 deg (2.2 mm texels near the rover), counter-rotated so sun
              // direction stays exact; distance-faded 2.5-24 m to stop far
              // shimmer. Pore term keeps powdery read at zero phase.
              float camDist = length( vViewPosition );
              float gritFade = 1.0 - smoothstep( 2.5, 24.0, camDist );
              vec2 baseNxy = texture2D( normalMap, vNormalMapUv ).xy * 2.0 - 1.0;
              float pore = dot( baseNxy, baseNxy );
              if ( gritFade > 0.001 ) {
                vec2 uvScaled = vNormalMapUv * 17.3;
                vec2 gritUv = vec2(
                  uvScaled.x * 0.7986 - uvScaled.y * 0.6018,
                  uvScaled.x * 0.6018 + uvScaled.y * 0.7986 );
                vec2 gRaw = texture2D( normalMap, gritUv ).xy * 2.0 - 1.0;
                vec2 gritNxy = vec2(
                  gRaw.x * 0.7986 + gRaw.y * 0.6018,
                  -gRaw.x * 0.6018 + gRaw.y * 0.7986 );
                normal = normalize( vec3( normal.xy + ( tbn * vec3( gritNxy, 0.0 ) ).xy * ( 0.95 * gritFade ), normal.z ) );
                pore = mix( pore, dot( gRaw, gRaw ), gritFade * 0.75 );
              }
              diffuseColor.rgb *= clamp( 1.04 - pore * 0.48, 0.76, 1.04 );
            }`)
          .replace('getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
            {
              // Sun/fill split by intensity (sun 1361 vs fill <= 6, 200x
              // apart): horizon gate + lunar transfer hit sunlight only;
              // earthshine fill stays Lambertian (dim, other direction).
              float maxC = max( directLight.color.r, max( directLight.color.g, directLight.color.b ) );
              if ( maxC > 100.0 ) {
                // Horizon gate at the relief-displaced UV (consistent with
                // the meso sample above): RGBA8 packs sin(horizon elev) for
                // +x,-x,+z,-z (encoded 0..1, decode x2-1); solar-disc
                // penumbra +-0.00465.
                vec3 wV2 = normalize( cameraPosition - vWorldPosition );
                vec2 rayUV2 = ( wV2.xz / max( wV2.y, 0.15 ) ) / 3000.0;
                float hh0 = ( texture2D( uMesoMap, vMesoUv ).a - 0.75 ) * 8.0;
                float hh1 = ( texture2D( uMesoMap, vMesoUv + rayUV2 * hh0 ).a - 0.75 ) * 8.0;
                vec2 duv = vMesoUv + rayUV2 * ( 0.5 * ( hh0 + hh1 ) );
                vec4 hSin = texture2D( uHorizonMap, duv ) * 2.0 - 1.0;
                vec2 wgt = uSunDirENU.xz * uSunDirENU.xz;
                float hS = ( uSunDirENU.x > 0.0 ? hSin.r : hSin.g ) * wgt.x
                         + ( uSunDirENU.z > 0.0 ? hSin.b : hSin.a ) * wgt.y;
                float terrainShadow = smoothstep( hS - 0.00465, hS + 0.00465, uSunDirENU.y );
                // Part-8 (photometric depth): LS denominator from the saved
                // macro vertex normal; RE_Direct's internal dotNL keeps the
                // perturbed normal, so sun-facing walls brighten and shaded
                // walls darken directionally. No symmetric cavity term: it
                // painted a 360-degree donut over both halves (deleted).
                float cosI_macro = max( dot( macroNormal, directLight.direction ), 0.05 );
                float cosE_macro = max( dot( macroNormal, geometryViewDir ), 0.05 );
                float cosI_detail = max( dot( normal, directLight.direction ), 0.0001 );
                float cosG = clamp( dot( directLight.direction, geometryViewDir ), -0.999, 0.999 );
                float tanHalfG = sqrt( ( 1.0 - cosG ) / ( 1.0 + cosG ) );
                float opposition = 1.0 + 0.45 / ( 1.0 + tanHalfG / 0.065 );
                float detailContrast = clamp( pow( cosI_detail / cosI_macro, 1.5 ), 0.20, 1.65 );
                // Part-9 (wet concrete): grazing blowup damped + forward-scatter
                // gate. Verified numbers: old grazing transfer 11.6x; eps 0.22
                // with proposal numerator 1.35 would darken ZENITH 30% (0.98
                // to 0.69), so numerator is 2.18 (zenith 0.986 identical,
                // grazing 5.7x, x0.45 gate = 2.5x into the sun). cosG is
                // rotation-invariant, valid in any frame.
                float backscatterGate = mix( 0.45, 1.0, smoothstep( -0.85, 0.25, cosG ) );
                float lunarTransfer = ( 0.80 * ( 2.18 / ( cosI_macro + cosE_macro + 0.22 ) ) + 0.20 ) * opposition * backscatterGate;
                directLight.color *= terrainShadow * lunarTransfer * detailContrast;
              }
            }`);
      };
      mat.customProgramCacheKey = () => 'lunar-v8-geometric-relief';
    } catch (e) { /* plain physical material stands */ }
  }
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  // Part-5 (N): terrain does NOT cast — 39 cm self-shadow texels were the
  // barcode acne. Rims cast via the baked horizon gate instead; the dynamic
  // map resolves 5 cm rover wheels and rock contact only.
  terrain.castShadow = false;
  scene.add(terrain);
  // Seeded measured-slope rock field (illustration layer, see buildRocks).
  let rocks = null;
  try { rocks = buildRocks(scene, patch); } catch (e) { rocks = null; }
  // Outer B1 context ring: same grids/datum, curvature-baked, sunk 1.5 m to
  // kill z-fighting where it underlaps the inner patch.
  let outerMesh = null;
  try {
    const oh = decF32(patch.out.h), on = patch.out.n, osz = patch.out.sizeM;
    const og = new THREE.PlaneGeometry(osz, osz, on - 1, on - 1);
    og.rotateX(-Math.PI / 2);
    const op = og.attributes.position;
    for (let j = 0; j < on; j++) for (let i = 0; i < on; i++) {
      const idx = j * on + i;
      op.setX(idx, -osz / 2 + i * (osz / (on - 1)));
      op.setZ(idx, -osz / 2 + j * (osz / (on - 1)));
      op.setY(idx, oh[idx]);
    }
    op.needsUpdate = true;
    // Artifact fix (A): cut a 2.9×2.9 km hole so the coarse outer sheet can
    // never bridge inner craters. Drop index triangles fully inside the inner
    // footprint; the 50 m overlap ring + inner 2 m skirt remain the stitch.
    try {
      const idx = og.getIndex();
      if (idx) {
        const kept = [];
        const ax = new Float32Array(3), az = new Float32Array(3);
        for (let t = 0; t < idx.count; t += 3) {
          for (let k = 0; k < 3; k++) {
            const vi = idx.getX(t + k);
            ax[k] = op.getX(vi); az[k] = op.getZ(vi);
          }
          const inside = (x, z) => Math.abs(x) < 1450 && Math.abs(z) < 1450;
          if (inside(ax[0], az[0]) && inside(ax[1], az[1]) && inside(ax[2], az[2])) continue;
          kept.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
        }
        og.setIndex(kept);
      }
    } catch (e) { /* hole-cut must never break the skirt */ }
    og.computeVertexNormals();
    // Same measured-height tint as the inner patch so the skirt is not a flat
    // wall: brightness follows real relief, slope reads darker.
    try {
      const ocol = new Float32Array(on * on * 3);
      let omn = 1e18, omx = -1e18;
      for (let k = 0; k < on * on; k++) { const v = oh[k]; if (v < omn) omn = v; if (v > omx) omx = v; }
      const osp = Math.max(1, omx - omn), opost = osz / (on - 1);
      for (let k = 0; k < on * on; k++) {
        const t = (oh[k] - omn) / osp;
        const ix = k % on, jx = (k / on) | 0;
        const ax = oh[jx * on + Math.min(on - 1, ix + 1)], bx = oh[jx * on + Math.max(0, ix - 1)];
        const az = oh[Math.min(on - 1, jx + 1) * on + ix], bz = oh[Math.max(0, jx - 1) * on + ix];
        const sl = Math.atan(Math.hypot(ax - bx, az - bz) / (2 * opost)) * D2G;
        const cav = Math.max(-1, Math.min(1, (ax + bx + az + bz - 4 * oh[k]) / (2 * opost)));
        const g = (0.52 + t * 0.16) * (1 - Math.min(45, sl) / 45 * 0.5) * (1 - cav * 0.08);
        ocol[k * 3] = g; ocol[k * 3 + 1] = g; ocol[k * 3 + 2] = g;
      }
      og.setAttribute('color', new THREE.BufferAttribute(ocol, 3));
    } catch (e) { /* untinted skirt still stands */ }
    const om = new THREE.MeshStandardMaterial({ color: 0x78787a, roughness: 1, metalness: 0, vertexColors: true });
    const outer = new THREE.Mesh(og, om);
    outer.position.y = -1.5;
    outer.receiveShadow = false;
    outer.castShadow = false;
    scene.add(outer);
    outerMesh = outer;
  } catch (e) { /* inner patch stands alone */ }
  // Shared-rig recipe in metre units: solar irradiance + exposureForBody iris.
  // Direction goes live per-frame (topocentric sun); initialised here.
  // Part-3 (noon color): airless sunlight is neutral white, not warm haze.
  const sun = new THREE.DirectionalLight(0xfffcf8, SOLAR_CONSTANT_W_M2);
  const sdir = new THREE.Vector3(1, 0.2, 0).normalize();
  sun.position.copy(sdir).multiplyScalar(600);
  sun.castShadow = true;
  // Part-5 (N): single tight frustum, always — ±80 m at 2048² = 7.8 cm
  // texels for rover wheels + rock contact. Terrain never casts (horizon
  // gate handles ridges), so no acne regime exists at any camera mode.
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
  sun.shadow.camera.near = 200; sun.shadow.camera.far = 1100;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target);
  const amb = new THREE.AmbientLight(0x334455, 0.4);
  scene.add(amb);
  // Earthshine fill (directional, from the LIVE Earth vector): the only
  // honest night light on the Moon. Physical earthshine (~0.15 W/m²) would
  // expose black under our metered iris, so this carries a disclosed ~40×
  // legibility boost (ESH=6 vs sun 1361) — enough to shade bowls at night,
  // 0.4% of sunlight by day (invisible). No shadow casting (perf).
  // Without it, night/PSR terrain is ambient-flat: real bowls read as ponds
  // while the rover correctly dips into them ("going under").
  const esh = new THREE.DirectionalLight(0x9fb6dd, 0.0);
  esh.castShadow = false;
  scene.add(esh); scene.add(esh.target);
  const eshDir = new THREE.Vector3(0, 1, 0);
  // Bounded-patch label (bounds honesty, in-world).
  let label = null;
  try {
    label = createBodyTextSprite(
      (siteId === 'shackleton' ? 'SHACKLETON RIM' : siteId === 'malapert' ? 'MONS MALAPERT' : 'TRANQUILLITATIS')
      + ' · 3×3 KM TRUE M + 48 KM LOLA CONTEXT', '#8d93a1', 512);
    label.position.set(0, 60, -400);
    const ls = 60;
    label.scale.set(ls * 2, ls * 0.5, 1);
    scene.add(label);
  } catch (e) {}
  const sky = buildSurfSky(scene);
  const F = { scene, sun, amb, terrain, grain: null, rocks, rover: null, marker: null,
    siteId, patch, sunDir: sdir, label, sky, detailTex: null, nightF: 0,
    mot: motionState(),
    mesoTex: (mesoHorizon && mesoHorizon.mesoTex) || null,
    horizonTex: (mesoHorizon && mesoHorizon.horizonTex) || null,
    outer: outerMesh, esh, eshDir, _stdMat: mat, _dbgBasic: null, _slopeAttr: null, _curvAttr: null };
  // Part-5 (M): micro velvet normal map swaps the flat placeholder on
  // arrival (same slot/defines — texture upload only, no recompile).
  // repeat 150 = 20 m tiles of sub-meter velvet; normalScale 0.3 gentle.
  // (Comment stale as of Part-7: scale is 1.1; repeat unchanged.)
  const detailCommon = (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(150, 150); // 20 m tiles: texel ≈ 3.9 cm
    try {
      t.anisotropy = ((F.gl ? F.gl.capabilities.getMaxAnisotropy() : 4) || 4);
    } catch (e) { try { t.anisotropy = 4; } catch (e2) {} }
    try { t.needsUpdate = true; } catch (e) {}
  };
  try {
    new THREE.TextureLoader().load('assets/textures/lroc_nac_tile.png', (t) => {
      try {
        if (!F.scene || !mat) return;
        detailCommon(t);
        const old = mat.normalMap;
        mat.normalMap = t;
        mat.normalScale = new THREE.Vector2(1.1, 1.1); // Part-7: 0.3 buried grit
        mat.needsUpdate = true;
        F.detailTex = t;
        try { if (old && old !== t && old.dispose) old.dispose(); } catch (e2) {}
        // Part-9 (Play-Doh): share the velvet with the breccia — spherical
        // rock UVs pick up pitted texture at 0.9 scale (one recompile, once).
        try {
          if (F.rocks && F.rocks.material && !F.rocks.material.normalMap) {
            F.rocks.material.normalMap = t;
            F.rocks.material.normalScale.set(0.9, 0.9);
            F.rocks.material.needsUpdate = true;
          }
        } catch (e3) { /* smooth fallback stands */ }
      } catch (e) { /* velvet stands down */ }
    }, undefined, () => { /* velvet stands down */ });
  } catch (e) { /* velvet stands down */ }
  return F;
}
/* Real-time ephemeris sky: camera-centered group in the surface scene.
   Earth = 3D textured sphere (true 1.9° disc, shared sun lights its phase);
   Sun = true-size disc + modest glare sprite along the light vector;
   planets = REAL textured globes at true angular size (shared orbital
   textures, shared sun → true phase automatically), not marker dots;
   stars = Hipparcos vectors. All fog:false. Zero new data, zero network. */
const SURF_SKY_D = 43000;
const SURF_PLANETS = [
  { key: 'mercury', map: 'mercury', km: 2439.7 },
  { key: 'venus', map: 'venus', km: 6051.8 },
  { key: 'mars', map: 'mars', km: 3389.5 },
  { key: 'jupiter', map: 'jupiter', km: 69911 },
  { key: 'saturn', map: 'saturn', km: 58232 }
];
function buildSurfSky(scene) {
  const group = new THREE.Group();
  group.name = 'surf_sky';
  scene.add(group);
  const dot = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx2 = cv.getContext('2d');
    const g = cx2.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx2.fillStyle = g; cx2.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    return t;
  })();
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(200, 40),
    // depthWrite off: at 42 km with a 0.25 m near plane the depth precision
    // cannot resolve the disc against the horizon — it flickered. The disc
    // is background: terrain wins occlusion via depth TEST, not writes.
    // transparent: lets the disc fade across the rise/set band instead of
    // popping (same thresholds as before, now continuous).
    new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false, toneMapped: false, depthWrite: false, transparent: true }));
  group.add(sunDisc);
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dot, color: 0xfff2d8, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  glare.scale.set(1700, 1700, 1);
  group.add(glare);
  let earth = null;
  try {
    const emap = tex('earth');
    earth = new THREE.Mesh(
      new THREE.SphereGeometry(745, 40, 28),
      new THREE.MeshStandardMaterial({ map: emap || null, color: emap ? 0xffffff : 0x6a86b0,
        roughness: 1, metalness: 0, fog: false, depthWrite: false }));
    earth.rotation.z = -23.44 * Math.PI / 180; // axis tilt toward ecliptic north
    earth.castShadow = false; earth.receiveShadow = false;
    group.add(earth);
  } catch (e) { earth = null; }
  const planets = [];
  try {
    for (const p of SURF_PLANETS) {
      let pm = null;
      try {
        const pmap = tex(p.map);
        pm = new THREE.Mesh(
          new THREE.SphereGeometry(1, 24, 18),
          new THREE.MeshStandardMaterial({
            map: pmap || null, color: pmap ? 0xffffff : 0x8d93a1,
            roughness: 1, metalness: 0, fog: false, depthWrite: false }));
        pm.castShadow = false; pm.receiveShadow = false;
      } catch (e) { pm = null; }
      if (!pm) continue;
      pm.userData.bodyKey = p.key;
      pm.userData.bodyKm = p.km;
      group.add(pm);
      planets.push(pm);
    }
  } catch (e) {}
  // Skymap instead of flat points: the vendored 8K Hipparcos render
  // (same asset as the orbital sky sphere) on a BackSide sphere INSIDE the
  // camera-following group, so it inherits the tidal-lock rotation exactly
  // like the points did. J2000 frame shared with the ephemeris math, so the
  // existing R = S·Eᵀ quaternion orients it with no new calibration.
  const ret = { group, sunDisc, glare, earth, planets, map: null, dot };
  try {
    new THREE.TextureLoader().load('assets/textures/stars_8k.jpg', (hTex) => {
      try {
        hTex.colorSpace = THREE.SRGBColorSpace;
        hTex.minFilter = THREE.LinearFilter;
        hTex.magFilter = THREE.LinearFilter;
        try { hTex.anisotropy = 4; } catch (e) {}
        hTex.needsUpdate = true;
        const skyGeo = new THREE.SphereGeometry(SURF_SKY_D - 1000, 64, 40);
        const skyMat = new THREE.MeshBasicMaterial({
          map: hTex, side: THREE.BackSide, depthWrite: false,
          fog: false, toneMapped: false });
        /* T5: the 8K map arrives mid-session (slow on file://) — fade in
           over ~1 s instead of popping the stars in one frame. */
        skyMat.transparent = true;
        skyMat.opacity = 0;
        const skyMesh = new THREE.Mesh(skyGeo, skyMat);
        skyMesh.name = 'surfSkymap';
        skyMesh.renderOrder = -1;
        skyMesh.frustumCulled = false;
        group.add(skyMesh);
        ret.map = skyMesh;
        /* Phase-4 rotational sweep (presentation-only temporal exposure, ONE
           extra draw): same sphere geometry + same texture as the main
           skymap, driven by a small shader that integrates the texture along
           the exact qPrev→qCur arc (up to 16 taps, additive, endpoint-sharp
           main mesh untouched). Replaces the old discrete ghost quartet —
           ghosts are not created at all. Hidden unless a frame enables it
           (see updateSkySweep) and never under ?sky-spin. No new assets, no
           extra scene renders, no per-star CPU. */
        try {
          const sweepUni = {
            uMap: { value: hTex },
            uQPrevInv: { value: { x: 0, y: 0, z: 0, w: 1 } },
            uAxis: { value: { x: 0, y: 1, z: 0 } },
            uAngle: { value: 0 },
            uTapsF: { value: 0 },
            uWeight: { value: 0 },
          };
          const sweepMat = new THREE.ShaderMaterial({
            uniforms: sweepUni,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            fog: false,
            side: THREE.BackSide,
            vertexShader: [
              "varying vec3 vDir;",
              "void main() {",
              "  vDir = position;",
              "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
              "}",
            ].join("\n"),
            /* Tap math (all derived render state, exact by construction):
               - uQPrevInv maps the current pixel dir back through the
                 previous orientation; uAxis/uAngle encode
                 qDelta = skyPrev⁻¹ × skyCur (shortest arc, CPU-normalized).
               - tap i samples slerp(I,qDelta,t)⁻¹ × base at t=(i+.5)/N,
                 i.e. rotAA(base, axis, −angle·t): t=1 reproduces the current
                 endpoint texel, t→0 the previous one. Midpoint rule.
               - dir→uv inverts the vendored SphereGeometry mapping EXACTLY
                 (verified against vendor/three.module.min.js: pole-row
                 ±0.5/64 offsets included), so taps land on the same texels
                 the main mesh shows. Pole singularity pinned (u=0.5).
               - toneMapped:false (like the main material) keeps the shared
                 sRGB texture decode + output encode identical, so the sweep
                 is photometrically matched; weight normalizes by tap count
                 so tap density never brightens the sky. */
            fragmentShader: [
              "uniform sampler2D uMap;",
              "uniform vec4 uQPrevInv;",
              "uniform vec3 uAxis;",
              "uniform float uAngle;",
              "uniform float uTapsF;",
              "uniform float uWeight;",
              "varying vec3 vDir;",
              "vec3 quatApply(vec4 q, vec3 v) {",
              "  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);",
              "}",
              "vec3 rotAA(vec3 v, vec3 k, float a) {",
              "  float c = cos(a), s = sin(a);",
              "  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);",
              "}",
              "vec2 dirToUv(vec3 d) {",
              "  float y = clamp(d.y, -1.0, 1.0);",
              "  float th = acos(y);",
              "  float st = sin(th);",
              "  float u = (st < 1e-4) ? 0.5 : fract(atan(d.z, -d.x) / 6.283185307179586);",
              "  float vRow = (th / 3.141592653589793) * 40.0;",
              "  float uOff = (vRow < 0.5) ? (0.5 / 64.0) : (((40.0 - vRow) < 0.5) ? (-0.5 / 64.0) : 0.0);",
              "  return vec2(u + uOff, 1.0 - th / 3.141592653589793);",
              "}",
              "void main() {",
              "  vec3 dir = normalize(vDir);",
              "  vec3 base = quatApply(uQPrevInv, dir);",
              "  vec3 acc = vec3(0.0);",
              "  for (int i = 0; i < 16; i++) {",
              "    if (float(i) >= uTapsF - 0.5) break;",
              "    float t = (float(i) + 0.5) / uTapsF;",
              "    vec3 di = rotAA(base, uAxis, -uAngle * t);",
              "    acc += texture2D(uMap, dirToUv(normalize(di))).rgb;",
              "  }",
              "  acc /= max(uTapsF, 1.0);",
              "  gl_FragColor = vec4(acc * uWeight, 1.0);",
              "  #include <tonemapping_fragment>",
              "  #include <colorspace_fragment>",
              "}",
            ].join("\n"),
          });
          sweepMat.toneMapped = false;
          const sweepMesh = new THREE.Mesh(skyGeo, sweepMat);
          sweepMesh.name = 'surfSkymapSweep';
          sweepMesh.renderOrder = 0;
          sweepMesh.frustumCulled = false;
          sweepMesh.visible = false;
          group.add(sweepMesh);
          ret.sweep = { mesh: sweepMesh, mat: sweepMat, uni: sweepUni };
        } catch (e) { ret.sweep = null; }
        try { ret.fadeT0 = performance.now(); } catch (e) { ret.fadeT0 = 0; }
      } catch (e) { /* black sky stands */ }
    }, undefined, () => { /* black sky stands */ });
  } catch (e) { /* black sky stands */ }
  /* Sun trail ghosts (presentation-only, max 2 disc + 2 glare pairs): disc
     clones share the sunDisc geometry, glare clones share the dot texture —
     no new assets, no extra render passes, a few extra draws. Posed at exact
     interior sun directions (see trail loop — zero extra ephemeris, same
     scratch as the star samples) with rise/set-fade-scaled opacity. The
     transparent main disc cannot streak through frame accumulation at full
     daylight opacity (opaque result wins), so these carry high-warp sun
     continuity while the main disc stays sharp at the current exact vector.
     Created once here (needs no skymap texture), hidden unless a frame
     enables them. */
  ret.sunTrail = [];
  try {
    for (let gi = 0; gi < 2; gi++) {
      const gd = new THREE.Mesh(sunDisc.geometry, new THREE.MeshBasicMaterial({
        color: 0xfff6e0, fog: false, toneMapped: false,
        depthWrite: false, transparent: true, opacity: 0 }));
      gd.name = 'surfSunTrail' + gi;
      gd.visible = false;
      group.add(gd);
      const gg = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dot, color: 0xfff2d8, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      gg.name = 'surfGlareTrail' + gi;
      gg.scale.set(1700, 1700, 1);
      gg.visible = false;
      group.add(gg);
      ret.sunTrail.push({ disc: gd, glare: gg });
    }
  } catch (e) { ret.sunTrail = []; }
  return ret;
}
/* ENU placement: east→+x, up→+y, north→−z. Earth spin at the true sidereal
   rate off simDays (phase arbitrary, documented); axis pre-tilted. */
function updateSurfSky(V, dtArg) {
  const F = V.surf;
  if (!F || !F.sky || !V.camera) return;
  try {
    const sk = F.sky;
    sk.group.position.copy(V.camera.position);
    /* Exact celestial timestamp (presentation reads VC-1 directly — V.simDays
       stays the truth the HUD/log/2D read): every reader below (moonKm,
       lonEff, bodyDir, spin) shares this ONE current value, so sun-vs-stars
       can never disagree, no lag accumulates, and no snap threshold exists.
       Phase-3 motion state (F.mot) captures the resulting exact poses at the
       end of this function — one advance per call, single call site
       (ops-view animate) — for future motion integration. Timestamps there
       are frame samples, never a clock (never integrated, never advanced
       independently). */
    const trueDays = V.simDays || 0;
    const visDays = trueDays;
    const M = F.mot || (F.mot = motionState());
    /* Phase-4.1: diagnostic struct (one-time alloc, debug gate only). */
    if (SKY_DIAG && !F._skydbg) { try { F._skydbg = skyDbgState(); } catch (e) {} }
    const D = (SKY_DIAG && F._skydbg) ? F._skydbg : null;
    if (D) { D.sim = V.simDays || 0; D.inp = visDays; }
    /* Isolation-spin flag for the ops-view shutter (below): while ?sky-spin
       unplugs the stars, frame accumulation must not average discrete spin
       orientations into a static-looking mush. Debug-only; untouched on
       normal loads. */
    try { V.surfSpinIso = SKY_SPIN.on ? true : false; } catch (e) {}
    // Tidal lock: rotate the site frame with the Moon's orbital longitude so
    // stars wheel overhead at the true 27.3 d rate (no rotation = dead sky).
    const moonKm = surfMoonKm(V, _mk, visDays);
    if (D) {
      /* Ephemeris fingerprint: normalized geocentric-moon direction + angular
         delta vs previous frame (0 when the ephemeris output freezes). */
      try {
        _t.copy(_mk);
        if (_t.lengthSq() > 1e-18) {
          _t.normalize();
          D.ephD = D.ephInit ? Math.acos(Math.max(-1, Math.min(1, _t.dot(D.eph)))) * 180 / Math.PI : 0;
          if (!isFinite(D.ephD)) D.ephD = 0;
          D.eph.copy(_t); D.ephInit = true;
        }
      } catch (e) { /* fingerprint never breaks the frame */ }
    }
    if (!_enu.up) { _enu.up = new THREE.Vector3(); _enu.east = new THREE.Vector3(); _enu.north = new THREE.Vector3(); }
    /* Site longitude for this frame: TRUE ephemeris value, then the
       USER-DIRECTED steady spin (see SPIN_RATE_DEG_PER_DAY). The spin keeps
       the same variable, sense, and axis conventions — only its advance is
       steady (mean rate × mission-day deltas) instead of episodic. Anchored
       to truth at entry/teleport/clock-regression; `?truth-sky` bypasses.
       Sun/Earth/planets keep exact JPL geometry (disclosed divergence). */
    const trueLon = surfLonEff(F.patch, moonKm, visDays);
    let spinLon = trueLon;
    if (!TRUTH_SKY) {
      try {
        const cutT = !M._init || ((V.teleports | 0) !== (M._tels | 0)) ||
          !(isFinite(F._spinLon) && isFinite(F._spinDay)) || visDays < F._spinDay;
        if (cutT) { F._spinLon = trueLon; F._spinDay = visDays; }
        else if (visDays !== F._spinDay) {
          F._spinLon += SPIN_RATE_DEG_PER_DAY * (visDays - F._spinDay);
          F._spinDay = visDays;
        }
        spinLon = F._spinLon;
      } catch (e) { spinLon = trueLon; }
    }
    if (D) {
      /* Diagnostic tracks the RENDERED longitude (spin) plus true longitude
         (drift monitor): dLon measures what the player sees advancing. */
      try {
        if (D.lonInit && isFinite(D.lon) && isFinite(spinLon)) {
          let dd = (spinLon - D.lon) % 360;
          if (dd > 180) dd -= 360;
          if (dd < -180) dd += 360;
          D.dLon = dd;
        } else D.dLon = 0;
        D.lon = spinLon; D.lonT = trueLon; D.lonInit = true;
      } catch (e) {}
    }
    surfENU(F.patch, _enu, spinLon);
    // Starfield orientation: the skymap sphere shares the J2000 frame with
    // the ephemeris math — one quaternion wheels the whole sky at the true
    // rate, zero per-star cost, exact by construction. Anisotropy upgrades
    // once the renderer ref lands (enterSurface runs before textures return).
    if (sk.map) {
      try {
        _m4.set(
          _enu.east.x, _enu.east.y, _enu.east.z, 0,
          _enu.up.x, _enu.up.y, _enu.up.z, 0,
          -_enu.north.x, -_enu.north.y, -_enu.north.z, 0,
          0, 0, 0, 1);
        if (D) {
          /* Matrix fingerprint (first row) + change flag vs previous frame. */
          try {
            const e0 = _m4.elements;
            D.matChg = D.matInit &&
              (e0[0] !== D.mfp0 || e0[1] !== D.mfp1 || e0[2] !== D.mfp2);
            D.mfp0 = e0[0]; D.mfp1 = e0[1]; D.mfp2 = e0[2]; D.matInit = true;
          } catch (e2) {}
        }
        if (D) { D.qWrite++; D._wrote = true; }
        sk.map.quaternion.setFromRotationMatrix(_m4);
        if (D) {
          /* Value-change vs previous frame. First-sample guard: prevQ starts
             as identity, so the first comparison would be bogus — initialize
             from the first real write instead. Sign flip gets its own field:
             qDot≈−1 means hemisphere discontinuity, qDot≈0 means ≈180°
             physical rotation (dot ≈ cos(θ/2)); qChg tracks physical change
             independent of ±q equivalence. */
          try {
            const qa = sk.map.quaternion, qp = D.prevQ;
            if (!D.qInit) {
              qp.copy(qa);
              D.qInit = true;
              D.qDot = 1;
              D.qChg = false;
              D.qSignFlip = false;
            } else {
              const ds = qa.x * qp.x + qa.y * qp.y + qa.z * qp.z + qa.w * qp.w;
              D.qDot = Math.max(-1, Math.min(1, ds));
              if (!isFinite(D.qDot)) D.qDot = 1;
              D.qSignFlip = D.qDot < -1 + 1e-9;
              D.qChg = Math.abs(D.qDot) < 1 - 1e-9;
              qp.copy(qa);
            }
          } catch (e2) { D.qChg = false; D.qSignFlip = false; }
          /* Independent mesh-transform evidence (not a copy of the quaternion
             flags): fingerprint of the composed local matrix. updateMatrix()
             is recomputed here (idempotent — the renderer performs the same
             composition; this only removes render-lag from the measurement).
             Catches the case where the property changes but the transform
             does not (compose path / matrixAutoUpdate / aliasing). */
          try {
            try { sk.map.updateMatrix(); } catch (e3) {}
            const me = sk.map.matrix.elements;
            if (!D.mainInit) {
              D.m2fp0 = me[0]; D.m2fp1 = me[1]; D.m2fp2 = me[2];
              D.mainInit = true; D.mainChg = false;
            } else {
              D.mainChg = (me[0] !== D.m2fp0 || me[1] !== D.m2fp1 || me[2] !== D.m2fp2);
              D.m2fp0 = me[0]; D.m2fp1 = me[1]; D.m2fp2 = me[2];
            }
          } catch (e2) { D.mainChg = false; }
        }
      } catch (e) {}

      /* ?sky-spin isolation: unplug the stars from ephemeris/time and spin
         steadily about the polar axis from the entry orientation (0→360°
         looping). Data path above still runs (sun/Earth/planets need it) but
         no longer touches the star sphere once the base is captured. */
      if (SKY_SPIN.on) {
        try {
          const nowMs = performance.now();
          if (!sk._dbgBase) {
            sk._dbgBase = sk.map.quaternion.clone();
            sk._dbgAng = 0; sk._dbgT = nowMs;
          }
          if (V.running !== false && isFinite(sk._dbgT) && isFinite(sk._dbgAng)) {
            const spinRate = skySpinDegPerS(V);
            const step = Math.max(0, Math.min(0.5, (nowMs - sk._dbgT) / 1000)) * spinRate;
            sk._dbgAng = (((sk._dbgAng + step) % 360) + 360) % 360;
            sk._dbgSpinRate = spinRate;
          }
          sk._dbgT = nowMs;
          _qDbg.setFromAxisAngle(_ZAXIS, (sk._dbgAng || 0) * Math.PI / 180);
          sk.map.quaternion.copy(sk._dbgBase).premultiply(_qDbg);
          const whole = Math.floor(sk._dbgAng || 0);
          if (whole !== _skySpinBadge.lastDeg) {
            _skySpinBadge.lastDeg = whole;
            if (!_skySpinBadge.el) {
              const b = document.createElement('div');
              b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(5,10,20,.92);border:1px solid #2a3a55;color:#cfe0ff;font:11px/1.6 monospace;padding:8px 10px;white-space:pre";
              document.body.appendChild(b);
              _skySpinBadge.el = b;
            }
            _skySpinBadge.el.textContent =
              "SKY-SPIN (stars unplugged from data)\n" +
              "angle " + whole + "°/360 @ " +
              (SKY_SPIN.warp
                ? ("warp " + (isFinite(sk._dbgSpinRate) ? sk._dbgSpinRate.toFixed(1) : "?") + "°/s")
                : (SKY_SPIN.deg + "°/s")) + " wall" +
              (V.running === false ? " · PAUSED" : "");
          }
        } catch (e) { /* data orientation stands */ }
      }
      try {
        if (!sk.mapAniso && V.renderer && sk.map.material && sk.map.material.map) {
          sk.map.material.map.anisotropy = V.renderer.capabilities.getMaxAnisotropy();
          sk.map.material.map.needsUpdate = true;
          sk.mapAniso = true;
        }
      } catch (e) { /* default anisotropy stands */ }
      /* T5: fade the late-arriving skymap in (wall clock — entry theater,
         converges even while paused). */
      try {
        if (sk.map && sk.map.material && sk.map.material.transparent
            && sk.map.material.opacity < 1) {
          const nowMs = performance.now();
          sk.map.material.opacity =
            Math.min(1, Math.max(0, (nowMs - (sk.fadeT0 || nowMs)) / 1000));
        }
      } catch (e) { /* black sky stands */ }
    }
    const place = (out, d, D) => {
      // unit J2000 dir -> ENU scene metres (east +x, up +y, north −z)
      const e = d.dot(_enu.east), n = d.dot(_enu.north), u = Math.max(-1, Math.min(1, d.dot(_enu.up)));
      const ce = Math.sqrt(Math.max(0, 1 - u * u));
      const az = Math.atan2(e, n);
      return out.set(Math.sin(az) * ce * D, u * D, -Math.cos(az) * ce * D);
    };
    // Sun: shared vector drives disc, glare lookAt, AND the light (below).
    // TRUE elevation — no artificial floor. The old 1.2° polar clamp pinned
    // the sun at grazing incidence (horizontal slide + shadow-acne dance +
    // disc/horizon depth-fight = the reported slide-and-flicker). True night
    // is dark terrain + stars + Earth; the ambient floor keeps it navigable.
    // EXACT direction: F.sunDir is set to the true geometry at the current
    // timestamp every frame — no exponential chase (a 4/s chase lags ramp
    // targets by rate/4, i.e. ~56 d at MAX warp, divorcing lighting from the
    // star field). High-warp continuity comes from the whole-frame shutter,
    // which integrates true positions; the astronomy itself stays current.
    sunTrueFromFrame(moonKm, _enu, _sunTrue);
    F.sunDir.copy(_sunTrue);
    const el = Math.asin(Math.max(-1, Math.min(1, _sunTrue.dot(_enu.up))));
    /* Phase-4.1: sun azimuth/elevation stamps for the polar-circling vs
       reversal diagnosis (debug only — pure stores, no behavior change). */
    if (SKY_DIAG && F) {
      try {
        const se = _sunTrue.dot(_enu.east), sn = _sunTrue.dot(_enu.north);
        F._dbgSunAz = Math.atan2(se, sn) * 180 / Math.PI;
        F._dbgSunEl = el * 180 / Math.PI;
      } catch (e) {}
    }
    _v1.copy(F.sunDir).multiplyScalar(SURF_SKY_D - 1000);
    sk.sunDisc.position.copy(_v1);
    try { sk.sunDisc.lookAt(V.camera.position); } catch (e) {}
    sk.glare.position.copy(_v1);
    // Night factor for the earthshine fill (0 in daylight, 1 past -3°).
    // EXACT: evaluated at the current timestamp, no chase (a 3/s chase lags
    // ramp targets by rate/3 — ~75 d at MAX warp — same divorce as the sun).
    try {
      F.nightF = Math.max(0, Math.min(1, (-el) / 0.05));
    } catch (e) { F.nightF = 0; }
    // Below-horizon sun: fade the disc/glare out across the hysteresis band
    // instead of popping (polar sites live with the sun scraping the horizon
    // for weeks — verified: Shackleton sunEl within +-0.44 deg over 70 d —
    // so a boolean would strobe the lighting on consecutive days). The light
    // itself stays driven by the true continuous elevation above; only the
    // billboards fade. F._sunPops counts band crossings for ?time-debug.
    try {
      // Fade follows the exact (current-timestamp) elevation; truth still
      // owns the mission clock/HUD.
      const elV = Math.asin(Math.max(-1, Math.min(1, F.sunDir.dot(_enu.up))));
      if (typeof F.sunUp !== 'boolean') { F.sunUp = elV > -0.01; F._sunPops = 0; }
      else if (F.sunUp && !(elV > -0.015)) { F.sunUp = false; F._sunPops = (F._sunPops | 0) + 1; }
      else if (!F.sunUp && (elV > -0.005)) { F.sunUp = true; F._sunPops = (F._sunPops | 0) + 1; }
      const f = Math.max(0, Math.min(1, (elV + 0.015) / 0.01));
      F._sunFadeF = f; // rise/set fade reused by the sun-trail ghosts (presentation gain)
      if (sk.sunDisc.material) { sk.sunDisc.material.opacity = f; }
      if (sk.glare.material) { sk.glare.material.opacity = 0.28 * f; }
      sk.sunDisc.visible = f > 0.01;
      sk.glare.visible = f > 0.01 && (!SURF_DEBUG || surfDbg.showGlare);
    } catch (e) {}
    if (sk.earth) {
      // days passed explicitly (this helper takes no V — bare-V reads used
      // to throw and pin Earth at zenith). Visual clock: Earth hangs ~fixed
      // in the locked sky, so this mostly stabilises phase, not position.
      surfBodyDir('earth', moonKm, _t, visDays);
      try { F.eshDir.copy(_t); } catch (e) {}
      place(sk.earth.position, _t, 45000);
      const sd = visDays * 2 * Math.PI / 0.9973;
      sk.earth.rotation.y = sd % (Math.PI * 2);
    }
    for (const sp of sk.planets) {
      try {
        // Live distance → true angular radius (small-angle); 8 m floor keeps
        // inferior planets findable at ~1 px (disclosed exaggeration).
        // Visual clock: planets glide with the same capped sky, never teleport
        // against the stars.
        bodyWorld(sp.userData.bodyKey, _p, visDays);
        _t.set(_p.x / UNITS_PER_KM - moonKm.x, _p.y / UNITS_PER_KM - moonKm.y, _p.z / UNITS_PER_KM - moonKm.z);
        const distKm = _t.length() || 1;
        _t.divideScalar(distKm);
        place(sp.position, _t, SURF_SKY_D - 500);
        const r = Math.max(8, (SURF_SKY_D - 500) * (sp.userData.bodyKm / Math.max(1, distKm)));
        sp.scale.setScalar(r);
        sp.visible = (_t.dot(_enu.up)) > -0.02;
      } catch (e) {}
    }
    /* Trail-ghost orientations (presentation only) — LAST: reuses the _mk /
       _enu / _m4 scratch after every other reader has consumed it. Subdivides
       the honest frame interval [prevDays, curDays] into K+1 exact
       timestamps; each ghost takes one interior sample — genuine trajectory
       points from the same surfLonEff/JPL path as the main sphere, never a
       clock. Count is deterministic from the step size (0 at/below ~10 d/s
       warp, up to 4); total trail weight 0.30 additive over the sharp exact
       main sphere. The opaque main sphere cannot streak through frame
       accumulation (opaque wins), so these carry high-warp continuity. */
    /* Sun trail slots (presentation only, max 2 pairs at fixed thirds of the
       honest frame interval): exact interior sun directions via the single
       sunTrueFromFrame implementation — zero ephemeris beyond these two
       samples. Opacity follows the rise/set fade. Hidden at low warp, on cut
       frames, below the fade band, and (as before) under ?sky-spin. Sun
       disc/glare rendering itself is unchanged (scope exclusion). */
    try {
      const prevD = (M._init && isFinite(M.prevDays)) ? M.prevDays : visDays;
      const stepD = visDays - prevD;
      /* No trail across a scene-cut frame: if the teleport counter moved
         since the last motion advance, this frame spans a discontinuity —
         pairs stay hidden and the advance below re-anchors prev == cur. */
      const cutFrame = M._init && ((V.teleports | 0) !== (M._tels | 0));
      let sunK = 0;
      const fadeF0 = isFinite(F._sunFadeF) ? F._sunFadeF : 1;
      if (sk.sunTrail && !SKY_SPIN.on && !cutFrame
          && isFinite(stepD) && stepD > 0.25 && fadeF0 > 0.01) sunK = 2;
      if (sk.sunTrail) for (let sj = 0; sj < sk.sunTrail.length; sj++) {
        const pair = sk.sunTrail[sj];
        if (!pair) continue;
        if (sj < sunK) {
          const tS = prevD + stepD * (sj + 1) / 3;
          surfMoonKm(V, _mk, tS);
          /* Interior samples follow the SAME spun longitude (linear
             back-extrapolation — exact for steady spin), never the frozen
             direct value, so trail ghosts sit on the rendered path. */
          let spinS;
          if (!TRUTH_SKY && isFinite(F._spinLon) && isFinite(F._spinDay)) {
            spinS = F._spinLon + SPIN_RATE_DEG_PER_DAY * (tS - F._spinDay);
          } else {
            spinS = surfLonEff(F.patch, _mk, tS);
          }
          surfENU(F.patch, _enu, spinS);
          sunTrueFromFrame(_mk, _enu, _sunTrue);
          place(_v1, _t, SURF_SKY_D - 1000);
          if (pair.disc) {
            pair.disc.position.copy(_v1);
            try { pair.disc.lookAt(V.camera.position); } catch (e2) {}
            pair.disc.material.opacity = 0.15 * fadeF0;
            pair.disc.visible = true;
          }
          if (pair.glare) {
            pair.glare.position.copy(_v1);
            pair.glare.material.opacity = 0.07 * fadeF0;
            pair.glare.visible = (!SURF_DEBUG || surfDbg.showGlare);
          }
        } else {
          if (pair.disc) pair.disc.visible = false;
          if (pair.glare) pair.glare.visible = false;
        }
      }
    } catch (e) { /* sun trail never breaks the frame */ }
    /* Phase-3 motion-state advance — EXACTLY ONCE per updateSurfSky call
       (verified single call site: ops-view animate surface block). Copies the
       already-computed exact current poses above into the cur slots after
       shifting the previous slots. Pure capture: no astronomy, no
       interpolation, no visual change — the scene renders from the same
       objects as before. */
    try {
      advanceMotion(F, V, sk, visDays, M);
    } catch (e) { /* capture never breaks the frame */ }
    /* Phase-4 rotational sweep — poses the sweep mesh from the FRESH motion
       interval [skyPrev → skyCur] (advance above just published it). One
       extra draw integrating the true arc in-shader; the sharp endpoint
       stays on the untouched main mesh. See updateSkySweep. */
    try {
      updateSkySweep(F, sk, M);
    } catch (e) { /* sweep never breaks the frame */ }
    /* Phase-4.1 end-of-frame diagnostics: mesh audit (answers one-vs-stale
       skymap), mot/sweep mirror, write/change gap counters. Debug gate only;
       runs after every other reader so observed state is final. */
    if (D) {
      try {
        let n = 0, found = null;
        F.scene.traverse((o) => {
          try { if (o && o.name === 'surfSkymap') { n++; found = o; } } catch (e2) {}
        });
        D.meshN = n;
        D.meshSame = !!found && found === sk.map;
        D.meshChg = !!found && found !== D.mesh;
        D.mesh = found;
        if (found) {
          D.meshVis = !!found.visible;
          D.meshPar = found.parent === sk.group;
          D.meshRO = found.renderOrder | 0;
        }
      } catch (e) { /* audit never breaks the frame */ }
      try {
        D.motD = M ? M.skyDeg : 0;
        D.sweepN = M ? (M.sweepTaps | 0) : 0;
        if (D._wrote) { D.writeGap = 0; D._wrote = false; }
        else D.writeGap++;
        if (D.qChg) { D.chgGap = 0; }
        else D.chgGap++;
      } catch (e) {}
    }
  } catch (e) { /* sky must never break the frame */ }
}
/* Phase-4 sweep pose (presentation only — derived render state, mot untouched).
   qDelta = skyPrev⁻¹ × skyCur, shortest-arc normalized (w<0 negated so an
   equivalent-sign pair can never integrate a near-360° arc for a small
   motion), axis/angle extracted with a near-zero guard. Tap/weight policy is
   keyed on the ACTUAL angular displacement, never on warp: <0.5° off (sharp
   only); 0.5–2° light (4 taps, ramped weight); 2–8° moderate (8 taps);
   >8° full (16 taps, hard cap). Thresholds are analytic — tune live, not here.
   Photometry: taps averaged (÷N) times a fixed 0.30 trail weight, so density
   never brightens the sky; at ~0 the mesh hides and the frame is
   pixel-identical to the pre-Phase-4 renderer. */
function updateSkySweep(F, sk, M) {
  const sw = sk ? sk.sweep : null;
  const off = (reason) => {
    if (sw) sw.mesh.visible = false;
    if (M) { M.sweepTaps = 0; M.sweepMode = "off"; M.sweepActive = false; }
  };
  if (!sw || !M || !M._init || NO_SWEEP) { off(); return; }
  if (SKY_SPIN.on) { off(); return; } // stars unplugged: nothing truthful to integrate
  if (!M.skyValid || !M._pSky) { off(); return; }
  _qSwA.copy(M.skyPrev).invert();
  _qSwA.multiply(M.skyCur);
  if (!isFinite(_qSwA.x + _qSwA.y + _qSwA.z + _qSwA.w)) { M.sweepFinite = false; off(); return; }
  _qSwA.normalize();
  if (_qSwA.w < 0) { _qSwA.x *= -1; _qSwA.y *= -1; _qSwA.z *= -1; _qSwA.w *= -1; }
  const wc = Math.max(-1, Math.min(1, _qSwA.w));
  let theta = 2 * Math.acos(wc);
  if (!isFinite(theta)) { M.sweepFinite = false; off(); return; }
  let ax = 0, ay = 1, az = 0;
  const sh = Math.sin(theta / 2);
  if (Math.abs(sh) > 1e-6) {
    ax = _qSwA.x / sh; ay = _qSwA.y / sh; az = _qSwA.z / sh;
    const al = Math.hypot(ax, ay, az);
    if (al > 1e-9 && isFinite(al)) { ax /= al; ay /= al; az /= al; }
    else { ax = 0; ay = 1; az = 0; theta = 0; }
  } else { theta = 0; }
  const thetaDeg = theta * 180 / Math.PI;
  let taps = 0, mode = "off", weight = 0;
  if (isFinite(thetaDeg) && thetaDeg >= 0.5) {
    if (thetaDeg < 2) {
      taps = 4; mode = "light";
      const rt = Math.max(0, Math.min(1, (thetaDeg - 0.5) / 1.5));
      weight = 0.30 * rt * rt * (3 - 2 * rt);
    } else if (thetaDeg < 8) { taps = 8; mode = "moderate"; weight = 0.30; }
    else { taps = 16; mode = "full"; weight = 0.30; }
  }
  M.sweepTaps = taps; M.sweepMode = mode; M.sweepFinite = true;
  M.sweepActive = taps > 0 && weight > 0;
  if (!M.sweepActive) { sw.mesh.visible = false; return; }
  _qSwB.copy(M.skyPrev).invert();
  if (!isFinite(_qSwB.x + _qSwB.y + _qSwB.z + _qSwB.w)) { M.sweepFinite = false; off(); return; }
  _qSwB.normalize();
  sw.uni.uQPrevInv.value.x = _qSwB.x; sw.uni.uQPrevInv.value.y = _qSwB.y;
  sw.uni.uQPrevInv.value.z = _qSwB.z; sw.uni.uQPrevInv.value.w = _qSwB.w;
  sw.uni.uAxis.value.x = ax; sw.uni.uAxis.value.y = ay; sw.uni.uAxis.value.z = az;
  sw.uni.uAngle.value = theta;
  sw.uni.uTapsF.value = taps;
  sw.uni.uWeight.value = weight;
  sw.mesh.visible = true;
}
/* Phase-3 advance (see motionState): prev ← last cur, cur ← just-computed
   scene values. First frame after entry, or a teleport-cut teleport counter
   change (the existing >500 d re-anchor), initializes prev == cur so no
   false motion interval is ever published. Pause needs no special case:
   V.simDays is frozen, so cur == prev and every delta reads 0 by
   construction. Warp changes need no special case: the next state simply
   captures actual truth. */
function advanceMotion(F, V, sk, visDays, M) {
  if (!M) return;
  const tels = (V && isFinite(V.teleports)) ? (V.teleports | 0) : 0;
  const first = !M._init;
  const cut = !first && (tels !== (M._tels | 0));
  if (!first && !cut) {
    M.prevDays = M.curDays;
    M.skyPrev.copy(M.skyCur);
    M.sunPrev.copy(M.sunCur);
    M.earthPrev.copy(M.earthCur); M.earthSpinPrev = M.earthSpinCur;
    if (M.bodies) for (let i = 0; i < M.bodies.length; i++) {
      M.bodies[i].prev.copy(M.bodies[i].cur); M.bodies[i].sPrev = M.bodies[i].sCur;
    }
  }
  M.curDays = visDays;
  M.skyValid = false;
  if (sk.map) {
    M.skyCur.copy(sk.map.quaternion);
    M.skyValid = _fin3(M.skyCur) && isFinite(M.skyCur.w) &&
      Math.abs(M.skyCur.length() - 1) < 1e-3;
  }
  M.sunCur.copy(F.sunDir);
  M.sunValid = _fin3(M.sunCur) && M.sunCur.lengthSq() > 0.25;
  M.bodyValid = false;
  let eOk = false, pOk = true;
  if (sk.earth) {
    M.earthCur.copy(sk.earth.position);
    M.earthSpinCur = sk.earth.rotation.y;
    eOk = _fin3(M.earthCur) && isFinite(M.earthSpinCur);
  }
  const n = (sk.planets && sk.planets.length) ? sk.planets.length : 0;
  if (!M.bodies || M.bodies.length !== n) {
    M.bodies = []; // (re)built on planet-set change only — never per frame
    for (let i = 0; i < n; i++) {
      M.bodies.push({ prev: new THREE.Vector3(), cur: new THREE.Vector3(),
        sPrev: 1, sCur: 1, ok: false, pOk: false });
    }
  }
  for (let i = 0; i < n; i++) {
    const sp = sk.planets[i], sl = M.bodies[i];
    if (!sp || !sl) { pOk = false; continue; }
    sl.cur.copy(sp.position);
    sl.sCur = sp.scale.x;
    sl.ok = _fin3(sl.cur) && isFinite(sl.sCur);
    if (!sl.ok) pOk = false;
  }
  M.bodyValid = eOk && pOk;
  if (first || cut) {
    M.prevDays = M.curDays;
    M.skyPrev.copy(M.skyCur); M.sunPrev.copy(M.sunCur);
    M.earthPrev.copy(M.earthCur); M.earthSpinPrev = M.earthSpinCur;
    if (M.bodies) for (let i = 0; i < M.bodies.length; i++) {
      M.bodies[i].prev.copy(M.bodies[i].cur); M.bodies[i].sPrev = M.bodies[i].sCur;
      M.bodies[i].pOk = M.bodies[i].ok; // prev == cur, so prev-validity mirrors cur
    }
    M.dDays = 0; M.skyDeg = 0; M.sunDeg = 0; M.earthM = 0; M.planetM = 0;
  } else {
    M.dDays = M.curDays - M.prevDays;
    M.skyDeg = (M.skyValid && M._pSky) ? quatDeg(M.skyPrev, M.skyCur) : 0;
    M.sunDeg = (M.sunValid && M._pSun) ? vecDeg(M.sunPrev, M.sunCur) : 0;
    M.earthM = (eOk && M._pBody) ? M.earthCur.distanceTo(M.earthPrev) : 0;
    let pm = 0;
    if (M.bodyValid && M._pBody && M.bodies) for (let i = 0; i < M.bodies.length; i++) {
      const sl = M.bodies[i];
      if (sl.ok && sl.pOk) {
        const d = sl.cur.distanceTo(sl.prev);
        if (d > pm) pm = d;
      }
    }
    M.planetM = pm;
    if (M.bodies) for (let i = 0; i < M.bodies.length; i++) M.bodies[i].pOk = M.bodies[i].ok;
  }
  M._pSky = M.skyValid; M._pSun = M.sunValid; M._pBody = M.bodyValid;
  M._init = true; M._tels = tels;
  if (!M._warned && ((sk.map && !M.skyValid) || !M.sunValid)) {
    M._warned = true;
    try { console.warn("[surf] motion state invalid pose captured (diagnostic only)"); } catch (e) {}
  }
}
function surfPlaceRover(V) {
  const F = V.surf;
  if (!F || F.rover) return;
  try {
    loadRoverGltf().then((gltf) => {
      try {
        if (!V.surfActive || !V.surf || V.surf !== F || !gltf || !gltf.scene) return;
        const cal = calibrateRover(gltf.scene.clone(true)); // true 3.0 m span
        cal.updateMatrixWorld(true);
        // Lift comes from the calibration (wheel-referenced); measure the full
        // bbox only as a fallback for models with no named wheel assembly.
        let lift = (cal.userData && isFinite(cal.userData.groundLift))
          ? cal.userData.groundLift : 1.1;
        if (!isFinite(lift)) {
          const bb = new THREE.Box3().setFromObject(cal);
          lift = bb.isEmpty() ? 1.1 : -bb.min.y;
        }
        F.roverLift = lift;
        const p = surfDisplayXZ();
        const gy = surfHeightAt(F.patch, p.x, p.z);
        cal.position.set(p.x, gy + F.roverLift, p.z);
        cal.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        F.scene.add(cal);
        F.rover = cal;
        F.roverPos = new THREE.Vector3(p.x, gy + F.roverLift, p.z);
        F.roverQuat = cal.quaternion.clone();
        F.sun.target.position.copy(F.roverPos);
        F.sun.position.copy(F.roverPos).addScaledVector(F.sunDir, 600);
        // Findability dot at the true touchdown point (marker convention).
        const dot = buildCraftMarker();
        dot.position.copy(F.roverPos);
        dot.visible = true;
        F.scene.add(dot);
        F.marker = dot;
        // Wheel-track ribbon + dust pool (capped, scene-owned → auto-disposed).
        F.track = makeTrackRibbon(F.scene);
        F.dust = makeDustPool(F.scene);
      } catch (e) { /* rover stays absent; marker/label carry position */ }
    }).catch(() => {});
  } catch (e) {}
}
/* Traverse target (display metres, SIM TRUTH): surfDisplayXZ evaluates the
   shared game.js P(sC) at sC_tick + lead*rate — exact on average, never past
   simulated truth. updateSurfRover chases this target at ≤14 m/s wall, so the
   RENDERED rover cruises continuously through battery stall sols; the target
   itself (and the 2D map/HUD/log) stays exact. Pause eases to truth. */
function surfChase(V, dt) {
  return surfDisplayXZ();
}
const SURF_TRACK_MAX = 300;
function makeTrackRibbon(scene) {
  const g = new THREE.BufferGeometry();
  const posArr = new Float32Array(SURF_TRACK_MAX * 4 * 3);
  g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  const idx = [];
  for (let q = 0; q < SURF_TRACK_MAX; q++) {
    const v = q * 4;
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  g.setIndex(idx);
  g.setDrawRange(0, 0);
  // Disturbed-regolith tone: close to the terrain gray, warmer/darker enough
  // to read as a trail, never as khaki fill. polygonOffset kills slope
  // poke-through (bilinear sampler vs mesh plane can differ by cm).
  const m = new THREE.MeshStandardMaterial({ color: 0x847f75, roughness: 1, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, pts: [], lastX: 1e9, lastZ: 1e9, quads: 0 };
}
function trackPush(F, x, z) {
  const T = F.track;
  if (!T) return;
  if (Math.hypot(x - T.lastX, z - T.lastZ) < 4) return;
  T.lastX = x; T.lastZ = z;
  T.pts.push([x, z]);
  if (T.pts.length > 1500) T.pts.splice(0, T.pts.length - 1500);
  const n = Math.min(SURF_TRACK_MAX, T.pts.length - 1);
  const attr = T.mesh.geometry.getAttribute('position');
  for (let q = 0; q < n; q++) {
    const a = T.pts[T.pts.length - 2 - q], b = T.pts[T.pts.length - 1 - q];
    if (!a || !b) break;
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const segLen = Math.hypot(dx, dz);
    if (segLen > 30) {
      // Teleport/warp jump (chase snaps >400 m): collapse to a zero-area quad
      // instead of drawing a dark band across the patch. Fixes khaki "ponds".
      for (let k = 0; k < 4; k++) attr.setXYZ(q * 4 + k, a[0], -9999, a[1]);
      continue;
    }
    const l = segLen || 1; dx /= l; dz /= l;
    const nx = -dz * 0.25, nz = dx * 0.25; // 0.5 m trail, not a 1.2 m band
    const vs = [[a[0] + nx, a[1] + nz], [a[0] - nx, a[1] - nz],
                [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz]];
    for (let k = 0; k < 4; k++) {
      const gy = surfHeightAt(F.patch, vs[k][0], vs[k][1]) + 0.10;
      attr.setXYZ(q * 4 + k, vs[k][0], gy, vs[k][1]);
    }
  }
  T.quads = n;
  T.mesh.geometry.setDrawRange(0, n * 6);
  attr.needsUpdate = true;
}
const SURF_DUST_N = 120;
/* Soft round sprite for dust points. PointsMaterial has no implicit round
   falloff — an untextured point renders as a hard square that fills the frame
   at close range (seen as floating gray quads around the rover). One shared
   CanvasTexture, same radial-dot recipe as the sky glare above. */
let _dustDot = null;
function dustDot() {
  if (_dustDot) return _dustDot;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx2 = cv.getContext('2d');
  const g = cx2.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx2.fillStyle = g; cx2.fillRect(0, 0, 64, 64);
  _dustDot = new THREE.CanvasTexture(cv);
  return _dustDot;
}
function makeDustPool(scene) {
  const g = new THREE.BufferGeometry();
  const posArr = new Float32Array(SURF_DUST_N * 3);
  for (let i = 0; i < SURF_DUST_N; i++) posArr[i * 3 + 1] = -9999;
  g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  const m = new THREE.PointsMaterial({ color: 0x9a938a, size: 0.25, map: dustDot(),
    transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true,
    alphaTest: 0.02 });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, vel: new Float32Array(SURF_DUST_N * 3), life: new Float32Array(SURF_DUST_N), head: 0 };
}
function dustUpdate(V, F, dt, moving, hx, hz) {
  const Dp = F.dust;
  if (!Dp) return;
  const attr = Dp.pts.geometry.getAttribute('position');
  if (moving && V.running !== false) {
    for (let k = 0; k < 3; k++) {
      const i = Dp.head; Dp.head = (Dp.head + 1) % SURF_DUST_N;
      const gy = surfHeightAt(F.patch, hx, hz);
      attr.setXYZ(i, hx + (Math.random() - 0.5) * 2, gy + 0.4, hz + (Math.random() - 0.5) * 2);
      Dp.vel[i * 3] = (Math.random() - 0.5) * 1.2;
      Dp.vel[i * 3 + 1] = 0.8 + Math.random() * 1.2;
      Dp.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      Dp.life[i] = 0.9 + Math.random() * 0.6;
    }
  }
  if (V.running !== false) {
    for (let i = 0; i < SURF_DUST_N; i++) {
      if (Dp.life[i] <= 0) continue;
      Dp.life[i] -= dt;
      if (Dp.life[i] <= 0) { attr.setY(i, -9999); continue; }
      attr.setXYZ(i,
        attr.getX(i) + Dp.vel[i * 3] * dt,
        Math.max(-9990, attr.getY(i) + Dp.vel[i * 3 + 1] * dt),
        attr.getZ(i) + Dp.vel[i * 3 + 2] * dt);
      Dp.vel[i * 3 + 1] -= 1.6 * dt;
    }
    attr.needsUpdate = true;
  }
}
/* Per-frame rover drive: grounded to interpolated height, slerped onto the
   terrain normal along the direction of travel. Small deltas only — no snaps. */
/* Part-5 (N): single tight shadow frustum — no mode switching to do.
   Kept as a named no-op anchor so updateSurfRover's call site reads
   intentionally; texel snap uses the fixed 160 m / 2048 grid (7.8 cm). */
function surfShadowMode(V) {
  const F = V && V.surf;
  if (F && !F._shadowTS) { try { F._shadowTS = 160 / 2048; } catch (e) {} }
}
const _m4 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qDbg = new THREE.Quaternion();
const _XAXIS = new THREE.Vector3(1, 0, 0);
const _ZAXIS = new THREE.Vector3(0, 0, 1);
function updateSurfRover(V, dt) {
  const F = V.surf;
  if (!F || !F.rover || !F.roverPos) return;
  try { surfShadowMode(V); } catch (e) {}
  const dtC = Math.min(0.1, Math.max(0, dt || 0.016));
  /* Visual rover chase (presentation only — surfChase()/ce/cn stay the truth
     the 2D map, HUD and log read): glide toward the sim target instead of
     snapping per tick. Cap is warp-adaptive (1.6x the mean display rate from
     the seg ring, 14–600 m/s) so the visual stays glued at every warp with
     no perpetual lag and no ripple; stall sols still hold once glued, because
     the hold is real sim state. Site changes (>400 m) re-seed, never lurch. */
  const tgt = surfChase(V, dtC);
  let chaseCap = SURF_SMOOTH.roverMinMPerS;
  let dispV = 0; // display speed m/s wall (leg × rate) for the video glide below
  try {
    const SF = (typeof S !== 'undefined') ? S.surface : null;
    const rate = (SF && isFinite(SF._dRate)) ? SF._dRate : 0; // sol/s wall
    let legM = 0.5 * 1000 * ((SF && SF.dscale > 0) ? SF.dscale : 0.1);
    if (SF && SF.seg && SF.seg.length >= 2) {
      const A = SF.seg[SF.seg.length - 2], B = SF.seg[SF.seg.length - 1];
      const dSol = (B[0] - A[0]) || 1;
      legM = Math.hypot(B[1] - A[1], B[2] - A[2]) * 1000 *
        ((SF.dscale > 0) ? SF.dscale : 0.1) / Math.max(1e-9, dSol);
    }
    if (rate > 0 && legM > 1e-6)
      chaseCap = Math.max(SURF_SMOOTH.roverMinMPerS,
        Math.min(SURF_SMOOTH.roverMaxMPerS, legM * rate * SURF_SMOOTH.roverHeadroom));
    if (isFinite(rate) && isFinite(legM) && rate > 0 && legM > 0) dispV = legM * rate;
  } catch (e) { chaseCap = SURF_SMOOTH.roverMinMPerS; }
  if (!isFinite(F._visX) || !isFinite(F._visZ)) { F._visX = tgt.x; F._visZ = tgt.z; }
  else {
    const gx = tgt.x - F._visX, gz = tgt.z - F._visZ;
    const gap = Math.hypot(gx, gz);
    if (gap > 400) { F._visX = tgt.x; F._visZ = tgt.z; }
    else if (gap > 1e-9) {
      // VIDEO presentation roll: constant trailing speed with a floor, capped
      // at the truth point. The sim holds whole sols (battery trickle, charge,
      // dwell) — truth genuinely waits there. A chase that only closes the gap
      // slams shut then parks every hold sol. Instead the display rolls at the
      // trailing-average truth speed and never below a crawl floor, so it
      // keeps moving through holds, trails bursts, and converges exactly at
      // the destination (slightly after truth — the accepted PRESENTATION lag
      // vs the 2D marker). Never past truth, pause-exact when not running.
      let step = gap;
      try {
        if (V.running === false) step = 0;
        else {
          const pvx = (F._tPX !== undefined) ? F._tPX : tgt.x;
          const pvz = (F._tPZ !== undefined) ? F._tPZ : tgt.z;
          F._tPX = tgt.x; F._tPZ = tgt.z;
          const vInst = dtC > 1e-6 ? Math.hypot(tgt.x - pvx, tgt.z - pvz) / dtC : 0;
          if (!isFinite(F._vEma)) F._vEma = vInst;
          else F._vEma += (vInst - F._vEma) * (1 - Math.exp(-dtC / 30));
          // Floor from dispV (leg × rate — smooth by construction, unlike the
          // spiky per-frame truth jumps): keeps the roll alive through holds.
          const floor = Math.max(8, 0.35 * (isFinite(dispV) ? Math.min(dispV, 600) : 0));
          const v = Math.max(isFinite(F._vEma) ? F._vEma : 0, floor);
          step = Math.min(gap, v * dtC);
        }
      } catch (e) { step = Math.min(gap, chaseCap * dtC); }
      if (step > 0) { F._visX += gx / gap * step; F._visZ += gz / gap * step; }
    }
  }
  const shown = { x: F._visX, z: F._visZ };
  const moving = Math.hypot(shown.x - (F.lastRX !== undefined ? F.lastRX : shown.x),
    shown.z - (F.lastRZ !== undefined ? F.lastRZ : shown.z)) > 1e-4;
  F.lastRX = shown.x; F.lastRZ = shown.z;
  try {
    const gy = surfHeightAt(F.patch, shown.x, shown.z);
    surfNormalAt(F.patch, shown.x, shown.z, _t);
    F.rover.position.set(shown.x, gy + (F.roverLift || 1.1), shown.z);
    /* Face VISUAL travel direction (chase heading — strategy: the sim delta
       still seeds the very first frame so a fresh entry never faces +Z by
       default, then the visual delta owns it, so dwelling/charging holds the
       last heading instead of snapping). Slerp stays C1. */
    const dg = surfDisplayDelta();
    let hx = shown.x - (F._prevVX !== undefined ? F._prevVX : shown.x);
    let hz = shown.z - (F._prevVZ !== undefined ? F._prevVZ : shown.z);
    F._prevVX = shown.x; F._prevVZ = shown.z;
    if (hx * hx + hz * hz < 1e-10 && (!F.roverQuat) && (dg.dx * dg.dx + dg.dz * dg.dz >= 1e-8)) {
      hx = dg.dx; hz = dg.dz;
    }
    if (hx * hx + hz * hz >= 1e-10 || !F.roverQuat) {
      _t2.set(hx, 0, hz);
      if (_t2.lengthSq() < 1e-10) _t2.set(0, 0, 1);
      _t2.normalize();
      // Object3D convention (non-camera): +Z toward the target point.
      _m4.lookAt(_t2, _zero, _t);
      _q1.setFromRotationMatrix(_m4);
      if (!F.roverQuat) F.roverQuat = _q1.clone();
      else F.roverQuat.slerp(_q1, 1 - Math.exp(-3 * dtC));
      F.rover.quaternion.copy(F.roverQuat);
    }
    F.roverPos.set(shown.x, gy + (F.roverLift || 1.1), shown.z);
    /* T8 brake-dip (rotation only — position untouched, decays to zero):
       latch on VISUAL motion (not the sim segment) so battery stall sols
       don't each fire a nod — one nod per real visual halt. Timer advances
       only while running (pause-exact). Scene-owned F; sim never reads it. */
    try {
      const segMoving = moving;
      if (V.running === false) { /* frozen mid-dip */ }
      else if (segMoving) { F._dipArmed = true; F._dipT = 99; }
      else if (F._dipArmed) { F._dipArmed = false; F._dipT = 0; }
      else F._dipT = Math.min(99, (F._dipT === undefined ? 99 : F._dipT) + dtC);
      const dipT = (F._dipT === undefined) ? 99 : F._dipT;
      if (dipT < 0.6 && F.roverQuat) {
        F.rover.quaternion.copy(F.roverQuat);
        _q2.setFromAxisAngle(_XAXIS, -0.02618 * Math.exp(-dipT * 8));
        F.rover.quaternion.multiply(_q2);
      }
    } catch (e) { /* nod never breaks the drive */ }
    if (V.running !== false && moving) trackPush(F, shown.x, shown.z);
    dustUpdate(V, F, Math.min(0.1, Math.max(0, dt)), moving, shown.x, shown.z);
    if (F.marker) {
      F.marker.position.copy(F.roverPos);
      // Close-up convention (mirrors orbital updateCraftMarker): within ~15 m
      // the true-scale model fills the frame, so the findability beacon would
      // sit on top of the rover as a green wash. Beacon only at range.
      try {
        const d = V.camera ? V.camera.position.distanceTo(F.roverPos) : 1e9;
        F.marker.visible = d >= 15;
      } catch (e) { F.marker.visible = false; }
      F.sun.target.position.copy(F.roverPos);
      F.sun.position.copy(F.roverPos).addScaledVector(F.sunDir, 600);
      // Texel-snapped follow (world-axis, kills sub-texel crawl shimmer):
      // rounding the light offset to the fixed 160 m / 2048 grid (7.8 cm)
      // stops shadow edges swimming as the sun creeps.
      try {
        const TS = F._shadowTS || (160 / 2048);
        _v1.copy(F.sun.position).sub(F.roverPos);
        _v1.set(Math.round(_v1.x / TS) * TS, Math.round(_v1.y / TS) * TS, Math.round(_v1.z / TS) * TS);
        F.sun.position.copy(F.roverPos).add(_v1);
      } catch (e) { /* unsnapped follow still exact in direction */ }
    }
    // Earthshine follow: rover-locked, intensity by true night factor.
    try {
      if (F.esh) {
        F.esh.position.copy(F.roverPos).addScaledVector(F.eshDir, 600);
        F.esh.target.position.copy(F.roverPos);
        F.esh.intensity = 6 * (F.nightF || 0);
      }
    } catch (e) { /* night fill never breaks the drive */ }
    // Part-3: normalScale stays fixed at 1.5 — material-wide distance fading
    // flattened the entire patch at once; anisotropic mips now own filtering.
    // (No per-frame material work here.)
  } catch (e) { /* drive visuals never break the frame */ }
}
/* Pass-A debug panel + isolation logic. All toggles act on the live surface
   state only; modes swap the terrain material among cached variants. */
function dbgAttr(F, kind) {
  // Lazily built diagnostic color attributes from measured heights:
  // slope (grayscale), curvature (diverging), height (blue→green→red).
  const key = kind === "slope" ? "_slopeAttr" : kind === "curv" ? "_curvAttr" : "_heightAttr";
  if (F[key]) return F[key];
  const hn = F.patch.h, n = F.patch.n, post = F.patch.sizeM / (n - 1);
  const arr = new Float32Array(n * n * 3);
  let hmn = 1e18, hmx = -1e18;
  if (kind === "height") for (let k = 0; k < n * n; k++) { const v = hn[k]; if (v < hmn) hmn = v; if (v > hmx) hmx = v; }
  const hsp = Math.max(1e-9, hmx - hmn);
  for (let k = 0; k < n * n; k++) {
    const ix = k % n, jx = (k / n) | 0;
    const hx1 = hn[jx * n + Math.min(n - 1, ix + 1)], hx0 = hn[jx * n + Math.max(0, ix - 1)];
    const hz1 = hn[Math.min(n - 1, jx + 1) * n + ix], hz0 = hn[Math.max(0, jx - 1) * n + ix];
    let r, g, b;
    if (kind === "slope") {
      const sl = Math.atan(Math.hypot(hx1 - hx0, hz1 - hz0) / (2 * post)) * 180 / Math.PI;
      r = g = b = Math.min(1, sl / 30);
    } else if (kind === "curv") {
      const cav = (hx1 + hx0 + hz1 + hz0 - 4 * hn[k]) / (2 * post);
      r = g = b = 0.5 + Math.max(-0.5, Math.min(0.5, cav * 0.5));
    } else {
      const t = (hn[k] - hmn) / hsp; // blue=low → green → red=high
      r = Math.min(1, Math.max(0, t * 2 - 0.25)); b = Math.min(1, Math.max(0, 1.25 - t * 2)); g = 1 - Math.abs(t - 0.5);
    }
    arr[k * 3] = r; arr[k * 3 + 1] = g; arr[k * 3 + 2] = b;
  }
  F[key] = new THREE.BufferAttribute(arr, 3);
  return F[key];
}
function dbgApply(F) {
  if (!F || !F.scene) return;
  const d = surfDbg;
  try {
    const m = F.terrain.material;
    const wantN = d.showBump ? (F.detailTex || null) : null;
    if (m.normalMap !== wantN) { m.normalMap = wantN; m.needsUpdate = true; }
  } catch (e) {}
  try { if (F.rocks) F.rocks.visible = d.showRocks; } catch (e) {}
  try { if (F.outer) F.outer.visible = d.showOuter; } catch (e) {}
  try { F.sun.castShadow = d.showShadows; } catch (e) {}
  try { if (F.sky && F.sky.glare) F.sky.glare.visible = d.showGlare; } catch (e) {}
  try {
    if (!F._dbgBasic) F._dbgBasic = new THREE.MeshBasicMaterial({ vertexColors: true });
    const geo = F.terrain.geometry;
    if (!F._fullAttr) { try { F._fullAttr = geo.getAttribute("color"); } catch (e) {} }
    if (d.mode === "full") {
      if (F._fullAttr) { try { geo.setAttribute("color", F._fullAttr); } catch (e) {} }
      if (F.terrain.material !== F._stdMat) { F.terrain.material = F._stdMat; }
    } else {
      if (d.mode === "slope") geo.setAttribute("color", dbgAttr(F, "slope"));
      else if (d.mode === "curv") geo.setAttribute("color", dbgAttr(F, "curv"));
      else if (d.mode === "height") geo.setAttribute("color", dbgAttr(F, "height"));
      if (F.terrain.material !== F._dbgBasic) { F.terrain.material = F._dbgBasic; }
    }
  } catch (e) {}
}
function dbgPanel(F, V) {
  dbgRemove();
  if (!SURF_DEBUG) return;
  surfDbg.V = V;
  const el = document.createElement("div");
  el.id = "surfdbg";
  el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(5,10,20,.92);border:1px solid #2a3a55;color:#cfe0ff;font:11px/1.5 monospace;padding:8px 10px;max-width:230px";
  const d = surfDbg;
  const box = (k, label) =>
    `<label style="display:block"><input type="checkbox" data-dbg="${k}" ${d[k] ? "checked" : ""}> ${label}</label>`;
  const modes = ["full", "flat", "slope", "curv", "height"].map((m) =>
    `<button data-dbgmode="${m}" style="margin:1px;padding:1px 6px;${d.mode === m ? "font-weight:bold" : ""}">${m}</button>`).join("");
  el.innerHTML = `<b>TERRAIN DEBUG</b><br>${box("showBump", "detail maps")}${box("showRocks", "rocks")}${box("showOuter", "outer ring")}${box("showShadows", "shadows")}${box("showGlare", "sun glare")}${box("lockExposure", "lock exposure")}<div>${modes}</div><pre id="surfdbgstats" style="margin:4px 0 0"></pre>`;
  el.addEventListener("change", (ev) => {
    const k = ev.target && ev.target.dataset && ev.target.dataset.dbg;
    if (!k || !(k in surfDbg)) return;
    surfDbg[k] = !!ev.target.checked;
    if (k === "lockExposure" && V && V.renderer) surfDbg.lockedExp = V.renderer.toneMappingExposure;
    const F2 = V.surf; if (F2) dbgApply(F2);
  });
  el.addEventListener("click", (ev) => {
    const m = ev.target && ev.target.dataset && ev.target.dataset.dbgmode;
    if (!m) return;
    surfDbg.mode = m;
    const F2 = V.surf; if (F2) dbgApply(F2);
    el.querySelectorAll("[data-dbgmode]").forEach((b) => { b.style.fontWeight = b.dataset.dbgmode === m ? "bold" : ""; });
  });
  document.body.appendChild(el);
  surfDbg.panel = el;
  surfDbg.statsEl = el.querySelector("#surfdbgstats");
  surfDbg.frames = 0; surfDbg.lastT = performance.now();
  const tick = () => {
    if (!surfDbg.panel || !surfDbg.panel.isConnected) return;
    surfDbg.timer = setTimeout(tick, 500);
    try {
      const now = performance.now();
      const fps = surfDbg.frames * 1000 / Math.max(1, now - surfDbg.lastT);
      surfDbg.frames = 0; surfDbg.lastT = now;
      const VV = surfDbg.V, FF = VV && VV.surf;
      let calls = -1, tris = -1, texs = -1;
      try {
        const inf = VV.renderer.info;
        calls = inf.render.calls; tris = inf.render.triangles; texs = inf.memory.textures;
      } catch (e) {}
      let dist = -1;
      try { dist = VV.camera.position.distanceTo(FF.roverPos); } catch (e) {}
      const sh = FF && FF.sun ? FF.sun.shadow.mapSize.x : -1;
      surfDbg.statsEl.textContent =
        `fps ${fps.toFixed(0)} calls ${calls} tris ${(tris / 1e6).toFixed(2)}M tex ${texs}\n` +
        `cam ${dist >= 0 ? dist.toFixed(1) + " m" : "?"} shadow ${sh} lod ${FF ? FF.patch.n : "?"}`;
    } catch (e) {}
  };
  tick();
  const cnt = () => { surfDbg.frames++; if (surfDbg.panel && surfDbg.panel.isConnected) requestAnimationFrame(cnt); };
  requestAnimationFrame(cnt);
}
function dbgRemove() {
  try { if (surfDbg.timer) clearTimeout(surfDbg.timer); } catch (e) {}
  surfDbg.timer = 0;
  try { if (surfDbg.panel && surfDbg.panel.parentNode) surfDbg.panel.parentNode.removeChild(surfDbg.panel); } catch (e) {}
  surfDbg.panel = null; surfDbg.statsEl = null; surfDbg.V = null;
}
function enterSurface(V) {
  let siteId = null;
  try {
    const Ld = (typeof S !== 'undefined') ? S.landing : null;
    siteId = Ld ? Ld.site : null;
    if (!siteId && typeof S !== 'undefined' && S.levelId === 'l2') siteId = S.site;
  } catch (e) {}
  if (!siteId) return false;
  if (!V.surf || V.surf.siteId !== siteId) {
    disposeSurface(V);
    const F = buildSurface(siteId);
    if (!F) return false;
    V.surf = F;
  }
  V.surfActive = true;
  surfPlaceRover(V);
  V.surfCamAnchor = null; // walkaround delta-follow re-seeds on next frame
  /* Exact-time re-seed (hidden by the LAND blackout): motion state resets so
     the first computed frame initializes prev == cur (zero interval), rover
     visual re-inits on next frame — entry never glides in from a stale
     site. No clock is carried across entries. */
  try {
    if (V.surf) {
      if (!V.surf.mot) V.surf.mot = motionState();
      motionReset(V.surf.mot);
      V.surf.mot._tels = (V.teleports | 0);
      /* Diagnostic first-sample guards restart on entry: the next computed
         frame initializes comparisons instead of diffing pre-entry poses. */
      if (V.surf._skydbg) { V.surf._skydbg.qInit = false; V.surf._skydbg.mainInit = false; }
      /* Steady-spin anchor resets with entry (re-anchors to truth below). */
      try { V.surf._spinLon = NaN; V.surf._spinDay = NaN; } catch (e) {}
      V.surf._visX = NaN; V.surf._visZ = NaN;
    }
  } catch (e) {}
  V.camMode = 'mast';
  V.glide = null;
  /* Metre-scene clip + orbit range (restored on exit): far past the 48 km
     skirt, near at 0.25 m (fp32-safe to 30 km), walkaround leashed to 150 m. */
  try {
    V.camera.far = 65000; V.camera.near = 0.25;
    V.camera.updateProjectionMatrix();
    if (V.controls) {
      V.controls.maxDistance = 150; // walkaround stays with the rover
      V.controls.minDistance = 2; // never inside the model
    }
  } catch (e) {}
  try { if (V.controls) V.controls.enabled = false; } catch (e) {}
  /* T10: damping stays ON (creation default) — the walkaround translates
     camera and target as a rigid frame per tick, so damping can only ever
     act on user drag/zoom input, never on rover motion. */
  try { if (V.controls) V.controls.enableDamping = false; } catch (e) {}
  try {
    if (V.cockpitLook) { V.cockpitLook.yaw = 0; V.cockpitLook.pitch = 0; V.cockpitLook.drag = false; }
  } catch (e) {}
  if (SURF_DEBUG && V.surf) { try { dbgPanel(V.surf, V); dbgApply(V.surf); } catch (e) {} }
  // Renderer ref for capability-gated texture settings (anisotropy on
  // arrival; Part-3 removed the runtime grain texture — nothing to set here).
  try {
    if (V.surf) V.surf.gl = V.renderer || null;
  } catch (e) {}
  return true;
}
function exitSurface(V) {
  V.surfActive = false;
  try { dbgRemove(); } catch (e) {}
  try {
    if (V.camera) { V.camera.far = 1500; V.camera.updateProjectionMatrix(); }
    if (V.controls) { V.controls.maxDistance = 60; V.controls.minDistance = 0; V.controls.maxPolarAngle = Math.PI; }
  } catch (e) {}
}
function disposeSurface(V) {
  const F = V.surf;
  V.surf = null; V.surfActive = false;
  try { dbgRemove(); } catch (e) {}
  if (!F) return;
  try {
    // Instanced rock field owns GPU instance buffers geometry.dispose misses.
    if (F.rocks) { try { F.rocks.dispose(); } catch (e) {} F.rocks = null; }
    if (F.detailTex) { try { F.detailTex.dispose(); } catch (e) {} F.detailTex = null; }
    // Meso/horizon are F-owned GPU uploads (built per site entry).
    if (F.mesoTex) { try { F.mesoTex.dispose(); } catch (e) {} F.mesoTex = null; }
    if (F.horizonTex) { try { F.horizonTex.dispose(); } catch (e) {} F.horizonTex = null; }
    F.scene.traverse((o) => {
      try { if (o.geometry) o.geometry.dispose(); } catch (e) {}
      try {
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) {
          // Shared textures (_dustDot) are module-owned, not
          // scene-owned: disposing them here would churn re-uploads.
          // Detail maps are disposed explicitly above (traverse would
          // double-dispose via material slots — dispose() is idempotent,
          // but explicit ownership keeps the contract clear).
          try { if (m.map && m.map !== _dustDot) m.map.dispose(); } catch (e) {}
          try { m.dispose(); } catch (e) {}
        }
      } catch (e) {}
    });
    if (F._dbgBasic) { try { F._dbgBasic.dispose(); } catch (e) {} F._dbgBasic = null; }
  } catch (e) {}
}
export {
  decF32, decU8, decodeSite,
  surfHeightAt, surfNormalAt, surfDisplayXZ, surfDisplayDelta,
  surfENU, surfLonEff, surfMoonKm, surfBodyDir,
  buildSurface, buildSurfSky, updateSurfSky,
  surfPlaceRover, surfChase,
  makeTrackRibbon, trackPush, makeDustPool, dustUpdate,
  updateSurfRover, updateSurfaceCamera,
  enterSurface, exitSurface, disposeSurface
};
