/* MARGIN ground-to-orbit launch cinematic (js/launch-view.js).
   Rocket: PROCEDURAL dimensionally-true multi-stage aerospace simulation.
   Every stack is anchored to verified published figures (see MODELS_SOURCES.md
   and models/manifest/launch-vehicles.json):
     Falcon 9 / Heavy .... 70 m x 3.7 m, fairing 5.2 m x 13.1 m; FH = 3 cores
     Atlas V 401 ......... 57.3 m; CCB 32.46 m x 3.81 m; Centaur 12.68 m; fairing 12.0 m x 4 m
     Atlas V 551 ......... 62.5 m; same CCB/Centaur; 5-m fairing (17.36 m); 5 x AJ-60A SRB
     Vulcan VC4 / VC6 .... 61.6 m; booster 33.3 m x 5.4 m; Centaur V 11.7 m; 4 / 6 x GEM-63XL
     New Glenn ........... 98 m x 7 m; 7-m fairing; GS1 57.5 m
     SLS Block 1B (crew) . 111.6 m; core 64.6 m x 8.4 m; EUS 26.6 m; Orion 20.4 m; 2 x 5-seg SRB
     Saturn V ............ 110.6 m; S-IC 42 m x 10 m; S-II 24.8 m x 10 m; S-IVB 17.8 m; Apollo 26 m
   Presentation features:
     - Real multi-stage separation: Booster jettison, Stage 1 MECO/sep, Stage 2 ignition,
       clamshell split fairing jettison, and payload spacecraft release into orbit.
     - Multi-layered fire: Incandescent core, Mach shock diamonds, turbulent mantle,
       atmospheric expansion ("space jellyfish" vacuum plume), and individual booster flames.
     - Volumetric smoke: Horizontal flame trench billows, climbing ascent contrail trail.
     - Retractable umbilical launch tower arms, pad spotlights, and dynamic sky-to-orbit transition.
     - Procedural Web Audio sound effects (liftoff roar, staging thuds, spacecraft release).
     - Full offline-first support; zero external runtime dependencies; Canvas2D/skip fallback. */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { LAUNCH_ANIM } from './launch-anim-data.js';
import { STAR_VEC, STAR_MAG, STAR_BV } from './stars-data.js'; // HYG v4.0 (leaf module, zero deps)
import { helioKm, bvColor } from './orrery.js'; // P3: common astronomy authority (body states + B-V bins)
import { J2000_JD } from './solar-system-accuracy.js'; // P3: single-owner epoch anchor (leaf module, zero deps)
/* Custom plume: steep-cone + domain-warped ink edges (replaces vendor three-fire). */

/* Expert ascent tracks (launch-anim-data.js v1): monotone cubic
   (Fritsch-Carlson) interpolation with cut-aware camera segments, per the
   delivery contract. Tracks are built ONCE at module load — the frame loop
   only evaluates numbers, zero per-frame allocation. */
function pchipKeys(pairs) {
  const n = pairs.length;
  const xs = new Array(n), ys = new Array(n);
  for (let i = 0; i < n; i++) { xs[i] = pairs[i][0]; ys[i] = pairs[i][1]; }
  const h = new Array(n - 1), d = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  const m = new Array(n);
  if (n === 2) { m[0] = d[0]; m[1] = d[0]; }
  else {
    m[0] = ((2 * h[0] + h[1]) * d[0] - h[0] * d[1]) / (h[0] + h[1]);
    if (m[0] * d[0] <= 0) m[0] = 0;
    else if (d[0] * d[1] < 0 && Math.abs(m[0]) > Math.abs(3 * d[0])) m[0] = 3 * d[0];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] === 0 || d[i] === 0 || d[i - 1] * d[i] < 0) m[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
    }
    const l = n - 1;
    m[l] = ((2 * h[l - 1] + h[l - 2]) * d[l - 1] - h[l - 1] * d[l - 2]) / (h[l - 1] + h[l - 2]);
    if (m[l] * d[l - 1] <= 0) m[l] = 0;
    else if (d[l - 1] * d[l - 2] < 0 && Math.abs(m[l]) > Math.abs(3 * d[l - 1])) m[l] = 3 * d[l - 1];
  }
  return { xs, ys, m };
}
function pchipEval(pc, f) {
  const xs = pc.xs, ys = pc.ys, m = pc.m, n = xs.length;
  if (f <= xs[0]) return ys[0];
  if (f >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && f > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i], t = (f - xs[i]) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
}
/* Cut-aware track: a key with cut:true starts a fresh pchip segment. */
function buildCutTrack(entries, getV) {
  const segs = [];
  let cur = [];
  for (const e of entries) {
    if (e.cut && cur.length) { segs.push({ f0: cur[0].f, pc: pchipKeys(cur.map(p => [p.f, getV(p)])) }); cur = []; }
    cur.push(e);
  }
  if (cur.length) segs.push({ f0: cur[0].f, pc: pchipKeys(cur.map(p => [p.f, getV(p)])) });
  return segs;
}
function evalCutTrack(segs, f) {
  let s = segs[0];
  for (let i = 0; i < segs.length; i++) { if (f >= segs[i].f0) s = segs[i]; }
  return pchipEval(s.pc, f);
}
const ANIM = LAUNCH_ANIM;
const TRACKS = (() => {
  const cam = ANIM.cameras;
  return {
    camPos: [0, 1, 2].map(a => buildCutTrack(cam, e => e.pos[a])),
    camLook: [0, 1, 2].map(a => buildCutTrack(cam, e => e.look[a])),
    camShake: buildCutTrack(cam, e => e.shake || 0),
    rise: pchipKeys(ANIM.rocket.rise),
    rx: pchipKeys(ANIM.rocket.x),
    rz: pchipKeys(ANIM.rocket.rotZ)
  };
})();
/* Vehicle base position (display units) shared by kinematics, cameras and the
   ballistic debris integrator. Pure in f (reads live baseY only). */
const _bp = { x: 0, y: 1.0, z: 0 };
function animBasePos(f) {
  _bp.x = pchipEval(TRACKS.rx, f);
  // P2.1: vertical motion is the reference-altitude display mapping
  // (riseFromFlight), not the expert rise track — lateral x stays authored
  // (no sim source for downrange drift direction).
  _bp.y = (V.rocket && V.rocket.userData.baseY || SITE_DECK_Y) + riseFromFlight(f);
  _bp.z = 0;
  return _bp;
}
/* Vehicle velocity in units per ASCENT second (finite difference of the pure
   base-position function — no state). Drives debris ballistics. */
const WALL = ANIM.ascentWall || 42;
const _vv = { x: 0, y: 0, z: 0 };
function vehicleVel(f, out) {
  const e = 0.002;
  const fa = Math.max(0, f - e), fb = Math.min(1, f + e);
  const ax = pchipEval(TRACKS.rx, fa), ay = riseFromFlight(fa);
  const bx = pchipEval(TRACKS.rx, fb), by = riseFromFlight(fb);
  out.x = (bx - ax) / (fb - fa) / WALL;
  out.y = (by - ay) / (fb - fa) / WALL;
  out.z = 0;
  return out;
}
/* Ballistic coast in a debris piece's parent-local frame (translation-only
   approximation — parent rotation at release is ignored, reads fine on
   screen). Returns dtau (ascent seconds since release) for spin. */
const _db = { x: 0, y: 0, z: 0 };
function debrisBallistic(p1, vVeh, dvW, g, fEnd, f) {
  const dtau = Math.max(0, f - fEnd) * WALL;
  _db.x = p1.x + (vVeh.x + dvW[0]) * dtau;
  _db.y = p1.y + (vVeh.y + dvW[1]) * dtau + 0.5 * g * dtau * dtau;
  _db.z = (p1.z || 0) + (vVeh.z + dvW[2]) * dtau;
  return dtau;
}
/* Staging window in f: per-vehicle MET truth (byLv) preferred, nominal f
   window as fallback. Returns null when the event must not fire. */
function stageWindow(kind) {
  const P = profileFor(V.lvId);
  const by = ANIM.staging.byLv[V.lvId] || {};
  if (by[kind]) return [by[kind][0] / P.endMet, by[kind][1] / P.endMet, by[kind][0], by[kind][1]];
  const nom = ANIM.staging[kind === 'stage1' ? 'stage1' : kind];
  if (!nom || !nom.window) return null;
  return [nom.window[0], nom.window[1], nom.window[0] * P.endMet, nom.window[1] * P.endMet];
}
const _trenchFallback = { x: 0, y: -0.6, z: 0 };
const _bq = new THREE.Quaternion(); // booster plume orientation scratch (follows SRB tilt)
const _pp0 = new THREE.Vector3(); // plume anchor scratch (zero per-frame alloc)
const _pp1 = new THREE.Vector3(); // plume anchor scratch 2
const _pf = new THREE.Vector3(); // fire-light proximity scratch (zero per-frame alloc)
/* Close-range fire tamer: the trench-anchored light is tuned for pad-distance
   viewing; inside wall-graze closeups it nukes every surface (E ∝ 1/d^1.8).
   Scale it down as the camera closes in — lit smoke/glow quads (unlit) keep
   the pad's glory while nearby hardware regains gradient. */
function fireProxK() {
  try {
    if (!V.camera || !V.fireLight) return 1;
    _pf.copy(V.camera.position).sub(V.fireLight.position);
    return Math.min(1, Math.max(0.3, _pf.length() / 8));
  } catch (e) { return 1; }
}
/* Handoff pose scratch: intro/look-back poses. Written by the pose functions
   below, consumed in frame(). Zero per-frame allocation (module objects). */
const _hPA = new THREE.Vector3(), _hPB = new THREE.Vector3();
const _hLA = new THREE.Vector3(), _hLB = new THREE.Vector3();

/* Shared Draco setup (same pattern as js/kit-assembly.js — the pad GLBs are
   Draco-compressed and fail without it). */
let _envDraco = null;
function envGltfLoader() {
  const l = new GLTFLoader();
  try {
    if (!_envDraco) {
      _envDraco = new DRACOLoader();
      _envDraco.setDecoderPath('vendor/draco/');
    }
    l.setDRACOLoader(_envDraco);
  } catch (e) {}
  return l;
}

const DPR_CAP = 1.5;
const ASCENT_S = 42;
const ASCENT_REDUCED_S = 8;
/* Workstream A: compressed terminal-count beat prepended to the ascent.
   T_START_S = T-10:00 (GLS terminal count, per NASA reference). One built-in
   hold at T-04:00 demonstrates T-pausing / L-running. L- leads T- by
   HOLD_VALUE_S mission-clock seconds so the hold is legible. All compressed
   illustration — outcome truth stays in game.js. */
const COUNT_S = 14;
const COUNT_REDUCED_S = 4;
const HOLD_S = 2.5;
const HOLD_REDUCED_S = 1.0;
const T_START_S = 600;
const HOLD_T_S = 240;
const HOLD_VALUE_S = 90;
const STACK_UNITS = 12; // HISTORICAL normalization height (display units). P1 true-scale:
// rockets now build at FIXED site scale (SITE_VK) so heights vary truthfully
// (SLS ~12u, F9 ~7.5u). STACK_UNITS retained for camera-track reference only.

/* Verified stack geometries (metres). Anchored to NASA/manufacturer records. */
const LV_STACKS = {
  f9:    { h: 70,   s1: 41.2, s2: 13.8, coreD: 3.7,  fair: [13.1, 5.2], srb: [0, 0, 0], engines: 9, vacEngines: 1 },
  fhr:   { h: 70,   s1: 41.2, s2: 13.8, coreD: 3.7,  fair: [13.1, 5.2], srb: [0, 0, 0], triple: true, engines: 9, vacEngines: 1 },
  fhe:   { h: 70,   s1: 41.2, s2: 13.8, coreD: 3.7,  fair: [13.1, 5.2], srb: [0, 0, 0], triple: true, engines: 9, vacEngines: 1 },
  av401: { h: 57.3, s1: 32.46, s2: 12.68, coreD: 3.81, upD: 3.05, fair: [12.0, 4.0], srb: [0, 0, 0], engines: 2, vacEngines: 1 },
  av551: { h: 62.5, s1: 32.46, s2: 12.68, coreD: 3.81, upD: 3.05, fair: [17.36, 5.0], srb: [5, 20.0, 1.58], engines: 2, vacEngines: 1 },
  vc4:   { h: 61.6, s1: 33.3, s2: 11.7, coreD: 5.4,  fair: [15.5, 5.4], srb: [4, 21.9, 1.60], engines: 2, vacEngines: 2 },
  vc6:   { h: 61.6, s1: 33.3, s2: 11.7, coreD: 5.4,  fair: [15.5, 5.4], srb: [6, 21.9, 1.60], engines: 2, vacEngines: 2 },
  ng:    { h: 98,   s1: 57.5, s2: 18.6, coreD: 7.0,  fair: [21.9, 7.0], srb: [0, 0, 0], engines: 7, vacEngines: 2 },
  sls:   { h: 111.6, s1: 64.6, s2: 26.6, coreD: 8.4, fair: null, capsule: 20.4, srb: [2, 53.9, 3.66], engines: 4, vacEngines: 1 },
  saturn5:{ h: 110.6, s1: 42.0, s2: 24.8, coreD: 10.0, upD: 6.6, fair: [17.8, 6.6], srb: [0, 0, 0], engines: 5, vacEngines: 1 }
};

/* P2.1: reference-data readers. game.js FLIGHT_KEYS / flightStateAt /
   flightDownrangeAt are REFERENCE (verified-at-keys) + ESTIMATE (inter-key),
   NOT derive(S) engineering truth — see game.js header. Local LV_PROFILES is
   retained ONLY as a degraded fallback for standalone-module loads; the live
   path never reads it. */
const LV_PROFILES = {
  // keys: [MET s, alt km, vel m/s]
  f9:  { endMet: 540, twr: 1.41, maxQMet: 65,
    booster: null, meco: [150, 162], fairing: [175, 200], las: null, srbStagger: 0,
    keys: [[0,0,0],[65,12,450],[155,70,2150],[200,110,2700],[350,180,5500],[525,205,7800],[540,207,7800]] },
  fhr: { endMet: 540, twr: 1.60, maxQMet: 69,
    booster: [150, 162], meco: [211, 224], fairing: [247, 262], las: null, srbStagger: 0,
    keys: [[0,0,0],[69,12,450],[154,62,2000],[222,95,3000],[300,150,5000],[528,205,7800],[540,207,7800]] },
  fhe: { endMet: 540, twr: 1.60, maxQMet: 69,
    booster: [150, 162], meco: [211, 224], fairing: [247, 262], las: null, srbStagger: 0,
    keys: [[0,0,0],[69,12,450],[154,62,2000],[222,95,3000],[300,150,5000],[528,205,7800],[540,207,7800]] },
  av401:{ endMet: 800, twr: 1.17, maxQMet: 87, seco: 'EARTH-ESCAPE BURN COMPLETE (C3 8.2 CLASS)',
    booster: null, meco: [244, 260], fairing: [268, 284], las: null, srbStagger: 0,
    keys: [[0,0,0],[87,13,400],[244,90,3000],[268,115,3400],[500,200,6500],[796,300,10500],[800,302,10500]] },
  av551:{ endMet: 700, twr: 2.00, maxQMet: 46, seco: 'TRANSFER-ORBIT BURN COMPLETE',
    booster: [106, 122], meco: [266, 280], fairing: [203, 222], las: null, srbStagger: 1.5,
    keys: [[0,0,0],[46,10,500],[106,35,1200],[203,80,2500],[266,110,3500],[450,200,6500],[700,300,9000]] },
  vc4: { endMet: 660, twr: 1.50, maxQMet: 60,
    booster: [100, 115], meco: [300, 315], fairing: [330, 358], las: null, srbStagger: 0,
    keys: [[0,0,0],[60,12,450],[100,30,1000],[300,110,3200],[450,180,5500],[660,200,7800]] },
  vc6: { endMet: 660, twr: 1.70, maxQMet: 50,
    booster: [100, 115], meco: [280, 295], fairing: [320, 348], las: null, srbStagger: 0,
    keys: [[0,0,0],[50,11,480],[100,32,1100],[280,105,3200],[450,180,5500],[660,200,7800]] },
  ng:  { endMet: 780, twr: 1.40, maxQMet: 70,
    booster: null, meco: [190, 205], fairing: [220, 246], las: null, srbStagger: 0,
    keys: [[0,0,0],[70,13,450],[190,80,2400],[240,110,3000],[450,180,5500],[780,200,7800]] },
  sls: { endMet: 540, twr: 1.53, maxQMet: 70,
    booster: [132, 150], meco: [483, 497], fairing: [191, 207], las: [196, 212], srbStagger: 0,
    keys: [[0,0,0],[70,13,400],[132,45,1300],[196,90,2200],[300,120,4000],[483,160,7800],[540,165,7800]] },
  saturn5:{ endMet: 700, twr: 1.20, maxQMet: 75,
    booster: null, meco: [150, 165], s2co: [545, 560], fairing: null, las: [180, 196], srbStagger: 0,
    keys: [[0,0,0],[75,13,400],[150,68,2000],[330,120,5000],[545,190,7400],[700,185,7800]] }
};

/* P2.1 reference readers: game.js FLIGHT_KEYS / flightStateAt /
   flightDownrangeAt when present (live path), local LV_PROFILES only as a
   degraded fallback. Endpoints identical by construction (same key data). */
function profileFor(lvId) {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.FLIGHT_KEYS) {
      const G = globalThis.FLIGHT_KEYS;
      if (G[lvId]) return G[lvId];
      if (G.f9) return G.f9;
    }
  } catch (e) {}
  return LV_PROFILES[lvId] || LV_PROFILES.f9;
}
function flightStateAtLV(lvId, met) {
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.flightStateAt === 'function')
      return globalThis.flightStateAt(lvId, met);
  } catch (e) {}
  return interpKeys((LV_PROFILES[lvId] || LV_PROFILES.f9).keys, Math.max(0, met));
}
function flightDownrangeAtLV(lvId, met) {
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.flightDownrangeAt === 'function')
      return globalThis.flightDownrangeAt(lvId, met);
  } catch (e) {}
  return Math.pow(Math.max(0, met / Math.max(1, profileFor(lvId).endMet) - 0.12) / 0.88, 2.1) * 620;
}
/* Rise: pad-true-scale mapping (expert pad method — plans_notes/LAUNCH_TIMING_BRIEF.md).
   Delegates to game.js single-implementation padParams/riseOfAlt/flightStateAt
   (globalThis — game.js is the classic script that owns them); legacy 0.55
   formula kept as degraded fallback only. Endpoints exact (0 at release via
   riseOfAlt(0), 100 at SECO since alt(endMet)=Hm). */
function riseFromFlight(f, lvId) {
  try {
    const id = lvId || V.lvId;
    if (typeof globalThis !== 'undefined' && typeof globalThis.padParams === 'function' &&
        typeof globalThis.riseOfAlt === 'function' && typeof globalThis.flightStateAt === 'function') {
      const P = globalThis.padParams(id);
      const st = globalThis.flightStateAt(id, f * profileFor(id).endMet);
      return globalThis.riseOfAlt(st.alt * 1000, P.Hm);
    }
  } catch (e) {}
  try {
    const P = profileFor(lvId || V.lvId);
    const met = f * P.endMet;
    if (met < 9) return 0;
    const st = flightStateAtLV(lvId || V.lvId, met);
    const st9 = flightStateAtLV(lvId || V.lvId, 9);
    const stE = flightStateAtLV(lvId || V.lvId, P.endMet);
    const den = Math.max(1e-6, stE.alt - st9.alt);
    const r = Math.max(0, Math.min(1, (st.alt - st9.alt) / den));
    return 100 * Math.pow(r, 0.55);
  } catch (e) { return 0; }
}
/* Pad-phase wall map (expert method — PRESENTATION): real-time through
   tower-top + margin (w1), linear rate ramp over PAD_RAMP_S, constant catch-up
   after. Pure in omega so reduced-motion keeps SHAPE; endpoints exact so dRise
   stays 0 at both ends and f = MET/endMet keeps all MET-keyed windows valid. */
const PAD_RAMP_S = 6;
function metAtOmega(P, endMet, omega) {
  const W = ASCENT_S;
  const tw = omega * W;
  if (tw <= P.w1) return tw;
  const D = PAD_RAMP_S;
  const R = (endMet - P.w1 - D / 2) / (W - P.w1 - D / 2);
  const x = tw - P.w1;
  if (x <= D) return P.w1 + x + 0.5 * (R - 1) * x * x / D;
  return P.w1 + D * (1 + R) / 2 + R * (x - D);
}
/* 0→1 smoothstep helper (t*t*(3-2*t) on the clamped ratio). */
function smooth01(x, a, b) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/* Pad-honest altitude readout (expert pad method): metres below 1 km so the
   pad beat prints computed truth (0 m at hold, metres after release). */
function fmtAlt(km) {
  if (!isFinite(km) || km <= 0) return '0 m';
  if (km < 1) return Math.round(km * 1000) + ' m';
  if (km < 10) return km.toFixed(2) + ' km';
  return km.toFixed(1) + ' km';
}

/* Piecewise-linear interpolation over [MET, alt, vel] keyframes. */
function interpKeys(keys, met) {
  if (met <= keys[0][0]) return { alt: keys[0][1], vel: keys[0][2] };
  for (let i = 1; i < keys.length; i++) {
    if (met <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      const k = (met - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return { alt: a[1] + (b[1] - a[1]) * k, vel: a[2] + (b[2] - a[2]) * k };
    }
  }
  const l = keys[keys.length - 1];
  return { alt: l[1], vel: l[2] };
}

const V = {
  renderer: null, scene: null, camera: null, canvas: null, mount: null, hud: null,
  raf: 0, t0: 0, dur: ASCENT_S, countS: COUNT_S, ascS: ASCENT_S, holdS: HOLD_S, onDone: null, active: false, vehicleName: '',
  lvId: '', done: false, shake: 0,
  // Rocket components
  rocket: null, rocketGroup: null, stages: null,
  // Plumes & Lights
  corePlume: null, vacPlume: null, boosterPlumes: [],
  fireLight: null, padLights: [], shafts: [], chaseFill: null, nozzleMat: null,
  towerLamps: null, _flareMat: null, _flareTex: null, fieldLights: null, _dotTex: null,
  // Phase A: shared PBR probe + tiles (all procedural, file://-safe). Set once
  // before first render; disposed in stop(). Never toggled per-frame (recompile).
  _envTex: null, _pmrem: null, _paintRough: null, _groundGrain: null,
  _maxAniso: 1, _siteGround: null, _lampHousings: null,
  // Smoke & Particles
  padSmoke: [], contrailSmoke: [], condensationCone: null, padFireball: null,
  flameSmoke: [], _fsmokeTick: 0, _skyLiftS: 0, groundFog: [],
  fireMeshes: [],
  // Environment
  skyDome: null, stars: null, sun: null, visibleBodies: [], towerArms: [], beacons: [],
  // Workstream B: vendored LC-39 pad dressing + ground-system FX (all
  // progressive enhancement — the procedural pad below stays as fallback)
  env: [], envLoaded: false, tsmu: [], trenchPos: null, padGroup: null,
  nasaML: null, nasaMLOn: false, nasaCrawler: null,
  deluge: [], rofi: [], vent: [], skyGlow: null,
  // Audio
  audio: { ctx: null, rumbleGain: null, rumbleOsc: null, roarGain: null, roarBuffer: null, active: false }
};

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}

/* ══════════════════════════════════════════════════════════════
   PROCEDURAL TEXTURES (Offline, zero-network, 100% Canvas2D)
   ══════════════════════════════════════════════════════════════ */
function createSmokeTexture() {
  // Cumulus bank puff: many overlapping blobs + speckle so the pad cloud reads
  // as billowing smoke (ref: Artemis liftoff banks), not one soft dot.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 30; i++) {
    const x = 128 + (rnd() - 0.5) * 150;
    const y = 128 + (rnd() - 0.5) * 150;
    const r = 10 + rnd() * 26;
    const a = 0.14 + rnd() * 0.22;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(238,242,248,' + a.toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(210,217,228,' + (a * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(160,170,185,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  // Dark cores for depth between lit lobes.
  for (let i = 0; i < 30; i++) {
    const x = 128 + (rnd() - 0.5) * 120;
    const y = 128 + (rnd() - 0.5) * 120;
    const r = 6 + rnd() * 16;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(120,128,142,0.20)');
    g.addColorStop(1, 'rgba(120,128,142,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}
/* Phase A step 1: sRGB tagging + shared probe/tiles.
   Diffuse/emissive canvases are sRGB data — without the tag three reads them
   as linear and darks wash out. Roughness/normal/AO stay linear (never tag). */
function tagSRGB(t) {
  try {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, V._maxAniso || 1);
  } catch (e) {}
  return t;
}
function hash2(x, z) {
  try {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  } catch (e) { return 0.5; }
}
/* Shared 128² roughness tile, values 0.75–1.0 (mean 0.88): blotches + streaks.
   Material.roughness is set to target/0.88 so the product hits the target mean.
   UVs stay per-mesh — no shared atlas, so stage jettison cannot tear. */
function makePaintRoughTile() {
  if (V._paintRough) return V._paintRough;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const bx = Math.floor(x / 16), by = Math.floor(y / 16);
      const blotch = hash2(bx * 3.7, by * 5.1);
      const streak = hash2(Math.floor(x / 4), Math.floor(y / 32));
      let v = 0.75 + 0.18 * blotch + 0.07 * streak;
      if (v > 1) v = 1;
      const b = Math.round(v * 255);
      const i = (y * 128 + x) * 4;
      img.data[i] = b; img.data[i + 1] = b; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  V._paintRough = t;
  return t;
}
/* 512² tiled grain for the site ground (sRGB-tagged, multiplied by vertex colours). */
function makeGroundGrain() {
  if (V._groundGrain) return V._groundGrain;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  let seed = 987654321;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * 512, y = rnd() * 512;
    const g = 200 + Math.floor(rnd() * 55);
    ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.5)';
    ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(24, 24);
  tagSRGB(t);
  V._groundGrain = t;
  return t;
}
/* 4×3 emissive cell grid for lamp lenses (sRGB-tagged). */
function makeLensGridTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 40);
  ctx.fillStyle = 'rgba(120,110,100,0.55)';
  for (let ix = 0; ix <= 4; ix++) ctx.fillRect(ix * 16 - 1, 0, 2, 40);
  for (let iy = 0; iy <= 3; iy++) ctx.fillRect(0, iy * 13 - 1, 64, 2);
  const t = new THREE.CanvasTexture(c);
  tagSRGB(t);
  return t;
}
/* One-time environment probe: PMREMGenerator.fromScene of a vertex-coloured
   sky sphere + two HDR emissive panels. No file fetch, works on file://.
   Baked before the veil lifts (~10–30 ms once). Never RoomEnvironment (ES
   module import is fragile on file://). Never scene.environment (would
   silently re-light GLB materials) — applied per-material instead. */
function bakeEnvProbe() {
  if (V._envTex || !V.renderer) return V._envTex;
  try {
    const probe = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(50, 16, 12);
    const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
    const pp = skyGeo.attributes.position, cc = new Float32Array(pp.count * 3);
    const top = new THREE.Color(0x2a3d5c), bot = new THREE.Color(0x05070c);
    const tc = new THREE.Color();
    for (let i = 0; i < pp.count; i++) {
      const k = Math.max(0, Math.min(1, pp.getY(i) / 50 * 0.5 + 0.5));
      tc.copy(bot).lerp(top, k);
      cc[i * 3] = tc.r; cc[i * 3 + 1] = tc.g; cc[i * 3 + 2] = tc.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    probe.add(new THREE.Mesh(skyGeo, skyMat));
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    panelMat.color.setRGB(6, 5.2, 4.2);
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), panelMat);
    p1.position.set(18, 22, 8); p1.lookAt(0, 0, 0);
    probe.add(p1);
    const panelMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff });
    panelMat2.color.setRGB(1.2, 1.6, 2.2);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), panelMat2);
    p2.position.set(-20, 10, -14); p2.lookAt(0, 0, 0);
    probe.add(p2);
    if (!V._pmrem) {
      try { if (V._pmrem) V._pmrem.dispose(); } catch (e) {}
      V._pmrem = new THREE.PMREMGenerator(V.renderer);
    }
    const rt = V._pmrem.fromScene(probe, 0.04);
    V._envTex = rt.texture;
    skyGeo.dispose(); skyMat.dispose();
    p1.geometry.dispose(); p2.geometry.dispose();
    panelMat.dispose(); panelMat2.dispose();
  } catch (e) { V._envTex = null; }
  return V._envTex;
}
/* Hard dot sprite (lamp/facility points): round soft dot — PointsMaterial
   without a map rasterizes as squares (the floating-tablet artifact). */
/* Phase A step 2: PBR paint table. roughness = scalar (tile mean 0.88 brings
   the product to the target mean). env intensity lerps night→day. */
const PAINT = {
  core: { m: 0, r: 0.48, env: [0.5, 1.0], ns: 0.25 },
  fairing: { m: 0, r: 0.43, env: [0.5, 1.0], ns: 0.25 },
  interstage: { m: 0.15, r: 0.80, env: [0.5, 0.8], ns: 0.35 },
  srb: { m: 0, r: 0.57, env: [0.5, 1.0], ns: 0.20 },
  steel: { m: 0.7, r: 0.62, env: [0.6, 1.0], ns: 0 },
  darkMetal: { m: 0.8, r: 0.51, env: [0.6, 1.0], ns: 0 },
  nozzle: { m: 0.9, r: 0.40, env: [0.6, 1.0], ns: 0 },
  gold: { m: 0.9, r: 0.32, env: [0.6, 1.0], ns: 0.6 }
};
function applyPaintPBR(mat, kind, normalTex) {
  try {
    const p = PAINT[kind];
    if (!p) return mat;
    const k = (V.sun && isFinite(V.sun.dayF)) ? V.sun.dayF : 0;
    mat.metalness = p.m;
    mat.roughness = p.r;
    if (V._paintRough) mat.roughnessMap = V._paintRough;
    if (V._envTex) {
      mat.envMap = V._envTex;
      mat.envMapIntensity = p.env[0] + (p.env[1] - p.env[0]) * k;
    }
    if (normalTex && p.ns) {
      mat.normalMap = normalTex;
      mat.normalScale.set(p.ns, -p.ns); // grooves read as grooves under top light; flip if ridges
    }
  } catch (e) {}
  return mat;
}
/* 128×256 normal map derived from the same seam layout as the diffuse skin,
   so grooves align. Groove = -X tilt at vertical seams + -Y at weld rings. */
const _paintNormals = {};
function paintNormalTex(kind) {
  try {
    if (_paintNormals[kind]) return _paintNormals[kind];
    const W = 128, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const strength = kind === 'interstage' ? 3.0 : kind === 'gold' ? 5.0 : 2.0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let dx = 0, dy = 0;
        const sx = x % 32, sy = (y + 24) % 64;
        if (sx < 2) dx = -(2 - sx) * strength;
        else if (sx > 29) dx = (sx - 29) * strength;
        if (sy < 2) dy = -(2 - sy) * strength;
        if (kind === 'gold') {
          dx += (hash2(x * 0.7, y * 0.9) - 0.5) * 4;
          dy += (hash2(x * 1.3, y * 0.4) - 0.5) * 4;
        }
        const nx = Math.max(-1, Math.min(1, dx / 8));
        const ny = Math.max(-1, Math.min(1, dy / 8));
        const i = (y * W + x) * 4;
        img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    _paintNormals[kind] = t;
    return t;
  } catch (e) { return null; }
}
/* GLB re-light: give vendored Standard materials the probe at low intensity.
   Base colours untouched. Call inside the existing env traverses. */
function applyGlbEnv(root) {
  if (!V._envTex) return;
  try {
    const seen = new Set();
    root.traverse(o => {
      if (!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (m && m.isMeshStandardMaterial && !seen.has(m)) {
          seen.add(m);
          m.envMap = V._envTex;
          m.envMapIntensity = 0.3;
        }
      });
    });
  } catch (e) {}
}
/* Phase A step 4: LC-39B-like site ground (PRESENTATION, never survey truth).
   Annulus under the GLB (overlap 1.5u, y groundY-0.03) — never coplanar, so no
   z-fight and no polygonOffset needed on the base. GLB-fail fallback is a full
   disc (rIn=0) with a concrete apron tint r<6. +X=East/+Z=North site frame. */
function buildSiteGround(Rglb, groundY, glbOk) {
  try {
    if (V._siteGround) {
      if (V._siteGround.parent) V._siteGround.parent.remove(V._siteGround);
      V._siteGround.traverse(o => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        }
      });
      V._siteGround = null;
    }
    const grp = new THREE.Group();
    grp.name = 'site_ground';
    const dayF = (V.sun && isFinite(V.sun.dayF)) ? V.sun.dayF : 0;
    const dimK = dayF > 0.001 ? 1 : 0.8;
    const grain = makeGroundGrain();
    const rIn = glbOk ? Math.max(0.5, Rglb - 1.5) : 0;
    const g = new THREE.RingGeometry(rIn, 450, 96, 24);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    // KSC coastal scrub per LC-39B refs (PRESENTATION): mowed vivid green near
    // the pad, marsh green mid-field, dark palmetto clumps. Sand only trims the
    // concrete edge — the old sand-heavy mix read as desert.
    const c = new THREE.Color(), sand = new THREE.Color(0x8f8a68), scrub = new THREE.Color(0x557d3a);
    const marsh = new THREE.Color(0x4a6038), palm = new THREE.Color(0x2c3a26);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const t = THREE.MathUtils.smoothstep(r, 10, 45);
      c.copy(sand).lerp(scrub, Math.max(0, Math.min(1, t * (0.7 + 0.3 * hash2(x, z)))));
      const tm = THREE.MathUtils.smoothstep(r, 40, 110);
      c.lerp(marsh, tm * 0.7);
      if (hash2(x * 0.31 + 9.2, z * 0.29 + 3.7) > 0.70) c.lerp(palm, 0.6);
      c.multiplyScalar(dimK);
      if (!glbOk && r < 6) c.set(0x9a9892).multiplyScalar(dimK); // concrete apron, GLB absent only
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.95, metalness: 0 });
    if (V._envTex) { m.envMap = V._envTex; m.envMapIntensity = dayF > 0.001 ? 0.35 : 0.2; }
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = groundY - 0.03;
    mesh.receiveShadow = true;
    grp.add(mesh);
    // Concrete apron skirt (refs: beige pad + crawlerway fan extends well past
    // the deck). Band from the GLB overlap out +28 u, above the grass ring.
    try {
      const skIn = glbOk ? Math.max(0.5, Rglb - 1.5) : 5;
      const skg = new THREE.RingGeometry(skIn, skIn + 28, 64, 1);
      skg.rotateX(-Math.PI / 2);
      const skm = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.95, metalness: 0 });
      if (V._envTex) { skm.envMap = V._envTex; skm.envMapIntensity = dayF > 0.001 ? 0.35 : 0.2; }
      const sk = new THREE.Mesh(skg, skm);
      sk.position.y = groundY - 0.02;
      sk.receiveShadow = true;
      grp.add(sk);
    } catch (e) {}
    // Marsh water channels (refs: winding dark water through the green, ref 1).
    // 12 seeded blobs, kept out of the ocean sector (20–160°) and crawlerway
    // (205±12°). Flat dark planes, slight gloss; PRESENTATION, not survey.
    try {
      const wm = new THREE.MeshStandardMaterial({
        color: dayF > 0.001 ? 0x2e4a52 : 0x0a1418, roughness: 0.12, metalness: 0 });
      if (V._envTex) { wm.envMap = V._envTex; wm.envMapIntensity = dayF > 0.001 ? 0.8 : 0.2; }
      for (let bi = 0; bi < 12; bi++) {
        let bearing = (hash2(bi * 3.1, 7.7) * 360 + 360) % 360;
        if (bearing > 15 && bearing < 165) bearing += 180; // out of the ocean sector
        if (Math.abs(bearing - 205) < 14) bearing += 30; // off the crawlerway
        const th = bearing * Math.PI / 180;
        const rr = 60 + hash2(bi * 1.7, 2.3) * 120;
        const wl = 8 + hash2(bi * 2.9, 5.1) * 17, ww = 3 + hash2(bi * 4.3, 1.9) * 5;
        const wg = new THREE.PlaneGeometry(wl, ww);
        wg.rotateX(-Math.PI / 2);
        const wmesh = new THREE.Mesh(wg, wm);
        wmesh.position.set(Math.sin(th) * rr, groundY - 0.015, Math.cos(th) * rr);
        wmesh.rotation.y = hash2(bi * 6.1, 8.8) * Math.PI;
        wmesh.receiveShadow = true;
        grp.add(wmesh);
      }
    } catch (e) {}
    // Ocean: flat plane sector 90°±70° (bearing), inner ~160u, y groundY-0.1.
    // RingGeometry angle α runs +X→−Z after rotateX, so α = bearing−90°.
    try {
      const og = new THREE.RingGeometry(160, 450, 48, 1,
        -70 * Math.PI / 180, 140 * Math.PI / 180);
      og.rotateX(-Math.PI / 2);
      const om = new THREE.MeshStandardMaterial({
        color: dayF > 0.001 ? 0x1d4a68 : 0x02060c, roughness: 0.15, metalness: 0
      });
      if (V._envTex) { om.envMap = V._envTex; om.envMapIntensity = dayF > 0.001 ? 1.0 : 0.2; }
      const ocean = new THREE.Mesh(og, om);
      ocean.position.y = groundY - 0.1;
      ocean.receiveShadow = true;
      grp.add(ocean);
    } catch (e) {}
    // Treeline: open cylinder r140 h1.0 BackSide, skips the ocean sector.
    // CylinderGeometry verts use x=r·sinθ, z=r·cosθ → θ IS the bearing.
    try {
      const tg = new THREE.CylinderGeometry(140, 140, 1.0, 64, 1, true,
        160 * Math.PI / 180, 220 * Math.PI / 180);
      const tp = tg.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        if (tp.getY(i) > 0) tp.setY(i, tp.getY(i) + (hash2(i, 7) - 0.5) * 0.7);
      }
      tg.computeVertexNormals();
      const tm = new THREE.MeshBasicMaterial({
        color: dayF > 0.001 ? 0x2b3626 : 0x020403, side: THREE.BackSide, fog: true
      });
      const trees = new THREE.Mesh(tg, tm);
      trees.position.y = groundY + 0.5;
      grp.add(trees);
      // Night horizon lift: additive glow strip so the silhouette reads on black.
      if (!(dayF > 0.001)) {
        const gg = new THREE.CylinderGeometry(170, 170, 1.5, 64, 1, true,
          160 * Math.PI / 180, 220 * Math.PI / 180);
        const gm = new THREE.MeshBasicMaterial({ color: 0x2a1a0c, transparent: true,
          opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
          side: THREE.BackSide, fog: true });
        const glow = new THREE.Mesh(gg, gm);
        glow.position.y = groundY + 0.75;
        grp.add(glow);
      }
    } catch (e) {}
    // Crawlerway decal: ~4.0u wide (≈40m), bearing 205° → dir (sinθ,0,cosθ).
    try {
      const th = 205 * Math.PI / 180;
      const dx = Math.sin(th), dz = Math.cos(th);
      const cw = document.createElement('canvas');
      cw.width = 64; cw.height = 256;
      const cx = cw.getContext('2d');
      cx.fillStyle = '#8a867c'; cx.fillRect(0, 0, 64, 256);
      cx.fillStyle = '#6f6c64'; cx.fillRect(10, 0, 12, 256); cx.fillRect(42, 0, 12, 256);
      const cwt = new THREE.CanvasTexture(cw);
      tagSRGB(cwt);
      const cg = new THREE.PlaneGeometry(4.0, 60);
      cg.rotateX(-Math.PI / 2);
      const cm = new THREE.MeshStandardMaterial({ map: cwt, roughness: 0.95, metalness: 0,
        transparent: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
        polygonOffsetUnits: -2 });
      const cwm = new THREE.Mesh(cg, cm);
      cwm.position.set(dx * 36, groundY + 0.01, dz * 36);
      cwm.rotation.y = Math.atan2(dx, dz);
      cwm.receiveShadow = true;
      cwm.renderOrder = 1;
      grp.add(cwm);
    } catch (e) {}
    // ?bearing-debug: marker at 90° must land on the downrange axis. Remove after check.
    try {
      const qp = new URLSearchParams(window.location.search || '');
      if (qp.get('bearing-debug') === '1') {
        const mk = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff00ff }));
        mk.position.set(30, groundY + 2, 0); // bearing 90° → +X (east/downrange)
        grp.add(mk);
      }
    } catch (e) {}
    V.scene.add(grp);
    V.env.push(grp);
    V._siteGround = grp;
    V._siteGroundY = groundY;
  } catch (e) {}
}
/* Measure the GLB ground (env_concrete) → {R, groundY}. Falls back to plan
   values (file −28m → scene ≈−2.3, half-extent ≈18.8u) when unmeasurable. */
function measureGlbGround(g) {
  let R = 18.8, groundY = -2.3;
  try {
    const t = g.getObjectByName('env_concrete');
    const box = new THREE.Box3();
    if (t) box.setFromObject(t);
    else box.setFromObject(g);
    if (box && isFinite(box.min.x) && isFinite(box.max.x)) {
      const sx = (box.max.x - box.min.x) / 2, sz = (box.max.z - box.min.z) / 2;
      if (sx > 1 && sx < 200) R = Math.max(sx, sz);
      if (isFinite(box.min.y)) groundY = box.min.y;
    }
  } catch (e) {}
  return { R, groundY };
}
/* Phase A step 4: lamp housings at LAMP_HEADS. Dark metal body + lip + emissive
   4×3-cell lens facing the matching spot target. Spots themselves unchanged. */
function buildLampHousings() {
  if (V._lampHousings || !V.scene) return V._lampHousings;
  try {
    const G = new THREE.Group();
    G.name = 'lamp_housings';
    const metal = new THREE.MeshStandardMaterial({ color: 0x1a1f27, metalness: 0.8, roughness: 0.45 });
    if (V._envTex) { metal.envMap = V._envTex; metal.envMapIntensity = 0.6; }
    const bodyG = new THREE.BoxGeometry(0.22, 0.14, 0.10);
    const lipG = new THREE.BoxGeometry(0.235, 0.155, 0.018);
    const lensG = new THREE.PlaneGeometry(0.19, 0.11);
    const lensTex = makeLensGridTexture();
    const defs = [
      { i: 0, col: 0xfff1dc, tgt: [0, 6.0, 0], em: 3.0 },
      { i: 2, col: 0xfff1dc, tgt: [0, 6.0, 0], em: 3.0 },
      { i: 1, col: 0xffe8c4, tgt: [0, 2.5, 0], em: 2.0 },
      { i: 3, col: 0xd8e6ff, tgt: [0, 2.5, 0], em: 2.0 }
    ];
    const tv = new THREE.Vector3();
    for (const d of defs) {
      const h = new THREE.Group();
      h.position.fromArray(LAMP_HEADS[d.i]);
      const b = new THREE.Mesh(bodyG, metal);
      b.castShadow = false;
      const l = new THREE.Mesh(lipG, metal);
      l.position.z = 0.045;
      const lensMat = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.15,
        metalness: 0, emissive: d.col, emissiveMap: lensTex, emissiveIntensity: d.em });
      const le = new THREE.Mesh(lensG, lensMat);
      le.position.z = 0.0515;
      h.add(b); h.add(l); h.add(le);
      tv.set(d.tgt[0], d.tgt[1], d.tgt[2]);
      h.lookAt(tv); // lens +Z faces the target
      G.add(h);
    }
    V.scene.add(G);
    V.env.push(G);
    V._lampHousings = G;
    return G;
  } catch (e) { return null; }
}
function getDotTex() {
  if (V._dotTex) return V._dotTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  V._dotTex = new THREE.CanvasTexture(c);
  return V._dotTex;
}

function createRocketSkinTexture(type = 'core') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const ctx = c.getContext('2d');
  // Base off-white aerospace thermal tile / paint
  ctx.fillStyle = type === 'interstage' ? '#2c333d' : '#e7ecf2';
  ctx.fillRect(0, 0, 256, 512);

  // Vertical panel seams
  ctx.strokeStyle = type === 'interstage' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 256; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }

  // Horizontal weld rings and stage bands
  for (let y = 40; y < 512; y += 64) {
    ctx.strokeStyle = type === 'interstage' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }

  if (type === 'core') {
    // Black & white roll pattern band near top of stage
    ctx.fillStyle = '#1c222a';
    ctx.fillRect(0, 80, 128, 28);
    ctx.fillRect(128, 108, 128, 28);
    // American Flag / NASA Worm accent bar
    ctx.fillStyle = '#b92a2a';
    ctx.fillRect(70, 200, 116, 6);
    ctx.fillStyle = '#1e3c72';
    ctx.fillRect(70, 208, 116, 6);
  } else if (type === 'interstage') {
    // Interstage grid stiffeners / ventilation ports
    ctx.fillStyle = '#14181f';
    for (let x = 8; x < 256; x += 24) {
      for (let y = 16; y < 496; y += 32) {
        ctx.fillRect(x, y, 12, 18);
      }
    }
  } else if (type === 'fairing') {
    // Fairing split line (subtle vertical seam)
    ctx.strokeStyle = 'rgba(180, 50, 40, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 512); ctx.stroke();
    // Payload Acoustic tile pattern
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 512; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
    }
  }

  const t = new THREE.CanvasTexture(c);
  tagSRGB(t);
  return t;
}

function createFairingInsideTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a424e'; // Acoustic absorption blanket
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 128; i += 16) {
    ctx.strokeRect(i, 0, 16, 128);
    ctx.strokeRect(0, i, 128, 16);
  }
  const _fit = new THREE.CanvasTexture(c);
  tagSRGB(_fit);
  return _fit;
}

/* ══════════════════════════════════════════════════════════════
   PROCEDURAL SOUND SYNTHESIS (Zero audio assets, Web Audio API)
   ══════════════════════════════════════════════════════════════ */
function initLaunchAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = (window.Audio_ && window.Audio_.ctx) ? window.Audio_.ctx : new AudioContext();
    if (ctx.state === 'suspended') {
      const resume = () => { ctx.resume(); window.removeEventListener('click', resume); };
      window.addEventListener('click', resume);
    }
    V.audio.ctx = ctx;

    // 1. Low frequency engine rumble oscillator
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(42, ctx.currentTime);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, ctx.currentTime);

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, ctx.currentTime);

    osc.connect(filter);
    filter.connect(rumbleGain);
    rumbleGain.connect(ctx.destination);
    osc.start();
    V.audio.rumbleOsc = osc;
    V.audio.rumbleGain = rumbleGain;

    // 2. Filtered pink noise roar generator for engine exhaust
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(450, ctx.currentTime);

    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0.0001, ctx.currentTime);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(roarGain);
    roarGain.connect(ctx.destination);
    noiseSource.start();

    V.audio.roarGain = roarGain;
    V.audio.active = true;
  } catch (e) {
    V.audio.active = false;
  }
}

function playStagingSound(pitch = 180) {
  try {
    if (!V.audio.ctx || !V.audio.active) return;
    const ctx = V.audio.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.35);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

function updateAudio(f) {
  try {
    if (!V.audio.ctx || !V.audio.active) return;
    const ctx = V.audio.ctx;
    const isMuted = (window.Audio_ && window.Audio_.on === false);
    if (isMuted) {
      if (V.audio.rumbleGain) V.audio.rumbleGain.gain.setValueAtTime(0, ctx.currentTime);
      if (V.audio.roarGain) V.audio.roarGain.gain.setValueAtTime(0, ctx.currentTime);
      return;
    }

    let throttle = 0;
    const PA = profileFor(V.lvId);
    const metA = f * PA.endMet;
    const mecoA0 = PA.meco ? PA.meco[0] : PA.endMet * 0.6;
    const mecoA1 = PA.meco ? PA.meco[1] : PA.endMet * 0.62;
    if (metA < 5) {
      throttle = (metA / 5) * 0.7; // Ignition buildup
    } else if (metA < mecoA0) {
      throttle = 1.0; // Stage 1 / Boosters roar
    } else if (metA < mecoA1 + 15) {
      throttle = 0.05; // MECO coast
    } else if (metA < PA.endMet - 8) {
      throttle = 0.45; // Upper stage burn (muffled vacuum)
    } else {
      throttle = 0.0; // SECO / Orbit insertion silence
    }

    // High altitude vacuum muffles sound
    const airDensity = Math.max(0.08, 1 - f * 1.1);
    const targetVolume = throttle * 0.22 * airDensity;

    if (V.audio.rumbleGain) {
      V.audio.rumbleGain.gain.setTargetAtTime(targetVolume * 0.8, ctx.currentTime, 0.1);
      if (V.audio.rumbleOsc) {
        V.audio.rumbleOsc.frequency.setValueAtTime(38 + throttle * 24, ctx.currentTime);
      }
    }
    if (V.audio.roarGain) {
      V.audio.roarGain.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.1);
    }
  } catch (e) {}
}

function updateCountdownAudio(tMinus, ignK) {
  try {
    if (!V.audio.ctx || !V.audio.active) return;
    const ctx = V.audio.ctx;
    const isMuted = (window.Audio_ && window.Audio_.on === false);
    if (isMuted) {
      if (V.audio.rumbleGain) V.audio.rumbleGain.gain.setValueAtTime(0, ctx.currentTime);
      if (V.audio.roarGain) V.audio.roarGain.gain.setValueAtTime(0, ctx.currentTime);
      return;
    }
    // Near-silent pad until the engine-start beat; wall ignition ramp (V._ignK)
    // leads the compressed T-6 s callout so the roar matches the visible flame.
    const wallK = (isFinite(ignK) ? ignK : 0) * 0.5;
    const throttle = Math.max(tMinus <= 6 ? (6 - tMinus) / 6 * 0.5 : (tMinus < 15 ? 0.12 : 0), wallK);
    const targetVolume = throttle * 0.22;
    if (V.audio.rumbleGain) {
      V.audio.rumbleGain.gain.setTargetAtTime(targetVolume * 0.8, ctx.currentTime, 0.1);
      if (V.audio.rumbleOsc) V.audio.rumbleOsc.frequency.setValueAtTime(38 + throttle * 24, ctx.currentTime);
    }
    if (V.audio.roarGain) V.audio.roarGain.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.1);
  } catch (e) {}
}

function stopAudio() {
  try {
    if (V.audio.rumbleGain && V.audio.ctx) {
      V.audio.rumbleGain.gain.setValueAtTime(0, V.audio.ctx.currentTime);
    }
    if (V.audio.roarGain && V.audio.ctx) {
      V.audio.roarGain.gain.setValueAtTime(0, V.audio.ctx.currentTime);
    }
    V.audio.active = false;
  } catch (e) {}
}

/* ══════════════════════════════════════════════════════════════
   AEROSPACE ASCENT FLIGHT PROFILE & TIMELINE PHASES
   ══════════════════════════════════════════════════════════════ */
function ascentProfile(f, lvId) {
  // P2.1: alt/vel/downrange are CONSUMED from the reference flight state
  // (game.js flightStateAt/flightDownrangeAt via the readers above — REFERENCE
  // keys + ESTIMATE interpolation, not derive(S) truth) — never interpolated
  // locally except in the degraded-fallback path. MET = f*endMet
  // (cinematic compression; physical relationships preserved).
  const P = profileFor(lvId || V.lvId);
  const met = f * P.endMet;
  const kv = flightStateAtLV(lvId || V.lvId, met);
  // Downrange: reference ESTIMATE integral (game.js horizontal-remainder
  // tables). The old universal pow()/620 km rule-of-thumb is retired (kept
  // only inside the degraded-fallback reader above).
  const downrange = flightDownrangeAtLV(lvId || V.lvId, met); // km
  // g-profile: TWR opening, throttle-bucket dip at Max-Q, 0 in coast windows.
  const mecoMet = P.meco ? P.meco[0] : P.endMet * 0.6;
  let gForce;
  if (f < 0.08) gForce = 1.0;
  else {
    const burnK = Math.min(1, met / Math.max(1, mecoMet));
    const capG = P.twr > 1.8 ? 4.5 : 3.8;
    gForce = 1.0 + Math.pow(burnK, 1.5) * (capG - 1.0);
    // Throttle bucket: ~±15 s around Max-Q.
    if (Math.abs(met - P.maxQMet) < 15) gForce *= 0.8;
    // Coast: after MECO until stage-2 thrust builds, and after SECO.
    const vacIgn = mecoMet + 15;
    if ((met > P.meco[1] && met < vacIgn) || met > P.endMet - 8) gForce = 0.0;
    // SLS/Saturn V upper coast is long — keep 0 only near cutoffs (above).
  }
  return { alt: kv.alt, vel: kv.vel, downrange, gForce, met };
}

function phaseDetails(f, lvId) {
  // Per-vehicle MET-window callouts (Workstream C). The ignition/hold-down
  // beat is MET-keyed (~9 s) so slow heavies don't sit bolted for 40+ s.
  const P = profileFor(lvId || V.lvId);
  const met = f * P.endMet;
  if (met < 4) return { phase: 'IGNITION SEQUENCE', sub: 'FLAME TRENCH DELUGE & MAIN ENGINE IGNITION', stage: 'S1+BOOSTERS' };
  if (met < 9) return { phase: 'HOLD-DOWN & THRUST BUILDUP', sub: 'ALL ENGINES AT 100% THROTTLE', stage: 'S1+BOOSTERS' };
  const hasBoosters = !!(P.booster || (LV_STACKS[lvId || V.lvId] || {}).triple ||
    ((LV_STACKS[lvId || V.lvId] || {}).srb || [0])[0] > 0);
  const attachedBoosters = hasBoosters && !(P.booster && met >= P.booster[1]);
  const stageBadge = attachedBoosters ? 'S1+BOOSTERS' : 'STAGE 1';
  if (met < P.maxQMet - 15) return { phase: 'LIFTOFF — TOWER CLEARED', sub: 'ROLL AND PITCH PROGRAM INITIATED', stage: stageBadge };
  if (met < P.maxQMet + 2) return { phase: 'THROTTLE DOWN — MAX-Q', sub: 'PEAK DYNAMIC PRESSURE · ENGINES THROTTLED BACK', stage: stageBadge };
  if (met < P.maxQMet + 18) return { phase: 'GO AT THROTTLE UP', sub: 'THROUGH MAX-Q · FULL THRUST RESTORED', stage: stageBadge };
  if (P.booster && met >= P.booster[0] - 8 && met < P.booster[1] + 6)
    return { phase: 'BOOSTER SEPARATION', sub: 'SRB/SIDE CORES BURNOUT & JETTISON', stage: 'STAGE 1' };
  if (P.fairing && met >= P.fairing[0] - 12 && met < P.fairing[0])
    return { phase: 'AERO HEATING CLEAR', sub: 'FAIRING JETTISON ARMED · HEATING BELOW LIMIT', stage: 'STAGE 1' };
  if (P.fairing && met >= P.fairing[0] && met < P.fairing[1])
    return { phase: 'PAYLOAD FAIRING JETTISON', sub: 'FAIRING HALVES DEPLOYED — CRAFT EXPOSED', stage: 'STAGE 2 + PAYLOAD' };
  if (P.las && met >= P.las[0] - 6 && met < P.las[1])
    return { phase: 'ESCAPE SYSTEM JETTISON', sub: 'LAUNCH ABORT TOWER JETTISONED', stage: 'STAGE 1' };
  if (met < P.meco[0] - 10) return { phase: 'POWERED UPPER ASCENT', sub: 'DOWNRANGE GRAVITY TURN CONFIRMED', stage: stageBadge };
  if (met < P.meco[1] + 15) return { phase: 'MECO — MAIN ENGINE CUTOFF', sub: 'FIRST STAGE CORE SEPARATION', stage: 'INTERSTAGE' };
  if (P.s2co && met >= P.s2co[0] - 30 && met < P.s2co[1] + 15)
    return { phase: 'SECOND STAGE CUTOFF', sub: 'UPPER STAGE SEPARATION · ORBITAL BURN NEXT', stage: 'INTERSTAGE' };
  if (met < P.endMet - 25) return { phase: 'STAGE 2 IGNITION', sub: 'VACUUM EXPANSION BURN TOWARD ORBIT', stage: 'STAGE 2' };
  if (met < P.endMet - 8) return { phase: 'SECO — ORBIT INSERTION', sub: P.seco || 'TARGET ORBITAL VELOCITY ACHIEVED (7.8 km/s)', stage: 'STAGE 2' };
  return { phase: 'SPACECRAFT SEPARATION', sub: 'MISSION ADAPTER RELEASE — PROCEED TO OPS', stage: 'SPACECRAFT NOMINAL' };
}

/* ══════════════════════════════════════════════════════════════
   WORKSTREAM A: TERMINAL-COUNT CLOCKS (presentation only)
   T- = procedural sequence clock (pauses in holds).
   L- = wall clock to window open (runs through holds).
   MET runs from T-0. All compressed illustration; game.js owns truth.
   ══════════════════════════════════════════════════════════════ */
function countdownClock(tEl) {
  const countS = V.countS || COUNT_S;
  const holdS = V.holdS || HOLD_S;
  const moveS = Math.max(0.5, countS - holdS);
  const preS = moveS * ((T_START_S - HOLD_T_S) / T_START_S);
  if (tEl < countS) {
    let tMinus;
    let holding = false;
    if (tEl < preS) {
      const k = preS > 0 ? tEl / preS : 1;
      tMinus = T_START_S - (T_START_S - HOLD_T_S) * k;
    } else if (tEl < preS + holdS) {
      tMinus = HOLD_T_S;
      holding = true;
    } else {
      const postS = countS - preS - holdS;
      const k = postS > 0 ? (tEl - preS - holdS) / postS : 1;
      tMinus = HOLD_T_S * (1 - k);
    }
    // L- leads T- by the hold value still pending; runs continuously.
    const holdPending = tMinus > HOLD_T_S - 0.5 && tEl < preS + holdS
      ? HOLD_VALUE_S * (1 - Math.max(0, Math.min(1, (tEl - preS) / Math.max(0.001, holdS))))
      : (tEl < preS ? HOLD_VALUE_S : 0);
    const lMinus = Math.max(0, tMinus + holdPending);
    return { phase: 'countdown', tMinus: Math.max(0, tMinus), lMinus, holding };
  }
  const metS = (tEl - countS) / Math.max(0.001, V.ascS || ASCENT_S) * 540;
  return { phase: 'ascent', tMinus: 0, lMinus: 0, holding: false, metS };
}

function countdownPhaseDetails(tMinus, holding) {
  if (holding) return { phase: 'BUILT-IN HOLD — T-04:00', sub: 'T- PAUSED · L- RUNNING · HOLDING FOR WINDOW', stage: 'HOLD' };
  if (tMinus > 540) return { phase: 'TERMINAL COUNT — GLS', sub: 'GROUND LAUNCH SEQUENCER · AUTOMATED SEQUENCE', stage: 'GROUND' };
  if (tMinus > 480) return { phase: 'CREW ACCESS ARM', sub: 'RETRACT TO LAUNCH POSITION (CREWED: T-08:00)', stage: 'GROUND' };
  if (tMinus > 360) return { phase: 'INTERNAL POWER · FTS ARMED', sub: 'TANKS PRESSURIZED · RANGE SAFETY ARMED', stage: 'GROUND' };
  if (tMinus > 120) return { phase: 'ENGINE BLEED · APU START', sub: 'THERMAL CONDITIONING · HYDRAULICS PRESSURIZED', stage: 'GROUND' };
  if (tMinus > 30) return { phase: 'ALS HANDOFF ARMED', sub: 'GLS → ONBOARD SEQUENCER AT T-30 S', stage: 'GROUND' };
  if (tMinus > 15) return { phase: 'ALS HANDOFF — T-30 S', sub: 'ONBOARD CONTROL · ABORTS NOW AUTOMATIC', stage: 'GROUND' };
  if (tMinus > 6) return { phase: 'DELUGE · ROFI SPARKS', sub: 'TRENCH FLOODED · H2 BURN-OFF (DETAIL IN WS-B)', stage: 'S1+BOOSTERS' };
  if (tMinus > 0.5) return { phase: 'ENGINE START COMMAND', sub: 'STAGGERED IGNITION · THRUST BUILDUP', stage: 'S1+BOOSTERS' };
  return { phase: 'SRB IGNITION — LIFTOFF', sub: 'HOLD-DOWN RELEASE · MET CLOCK STARTS', stage: 'S1+BOOSTERS' };
}

function fmtClock(totalS, prefix) {
  const s = Math.max(0, Math.ceil(totalS));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return prefix + mm + ':' + ss;
}

/* ══════════════════════════════════════════════════════════════
   SCENE BUILDER: ENVIRONMENT, TOWER, PAD, SKY & CELESTIAL
   ══════════════════════════════════════════════════════════════ */
function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010204); // dome covers all pixels; this is fallback only
  // Night fog is near-black (day keeps the legacy blue-gray — gated below so
  // the future daytime pass starts pixel-identical).
  const _fogNight = !(V.sun && V.sun.dayF > 0.05);
  scene.fog = new THREE.FogExp2(_fogNight ? 0x02040a : 0x060b18, FOG_BASE_DENSITY); // P5: density driven per-frame from reference alt (updateEnvironment)
  V.scene = scene;

  // Lighting rig — night-launch look (Artemis refs): the 4 floodlight heads
  // below are the SOLE pre-launch sources; global wash is zero so the flame
  // (fireLight/skyGlow/uLift in updatePlumes) becomes the key light at ignition.
  // Day path (applySolarRig) restores wash; night stays spots-only.
  const hemi = new THREE.HemisphereLight(0x8faee0, 0x070b14, 0);
  scene.add(hemi);

  // Key moon light — OFF at night (spots-only rule); day hook re-aims/raises it.
  // Shadow frustum unchanged: covers the authored pad (masts at ±17 units)
  // and down to the trench floor (y ≈ -2.5).
  const sun = new THREE.DirectionalLight(0xfffaed, 0);
  sun.position.set(30, 45, 20);
  sun.castShadow = true;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 130;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  try { sun.shadow.normalBias = 0.02; } catch (e) {}
  scene.add(sun);

  // Launch pad fill / sea reflection — OFF at night (spots-only rule).
  const fill = new THREE.DirectionalLight(0x7090b8, 0);
  fill.position.set(-25, 10, -20);
  scene.add(fill);
  applySolarRig(V.sun, hemi, sun, fill); // Step-1 hook: night launches pixel-identical

  // High intensity dynamic fire light right beneath the rocket.
  // Initialized at the (authored) trench mouth; updatePlumes retargets it
  // every ascent frame, loadEnvironment() snaps it to trench_center exactly.
  const fireLight = new THREE.PointLight(0xff9425, 0, 80, 1.8);
  fireLight.position.set(0, -0.6, 0);
  V.fireLight = fireLight;
  scene.add(fireLight);

  // Chase fill: dim cool headlamp riding the camera through ascent so the
  // vehicle never reads pitch black off-plume (earthshine stand-in at night).
  // Zero through the count (spots-only rule); ramps in past tower-clear.
  const chaseFill = new THREE.PointLight(0x9db8dd, 0, 40, 1.8);
  scene.add(chaseFill);
  V.chaseFill = chaseFill;

  // Launch pad group: procedural hardware only. The deck, ground, trench,
  // lightning masts and water tower ship in the authored LC-39B GLB
  // (loadEnvironment); what remains here must animate (tower arms, TSMUs).
  const padGroup = new THREE.Group();
  padGroup.name = 'launch_pad';

  // Pad support pillars & hold-down clamp pedestals (kept: bolted through the
  // baked deck, deck top ≈ scene y 1.0)
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x485262, metalness: 0.5 }));
    applyPaintPBR(clamp.material, 'steel', null);
    clamp.position.set(Math.cos(a) * 2.2, 1.0, Math.sin(a) * 2.2);
    padGroup.add(clamp);
  }

  // Tail Service Mast Umbilicals: swing back into blast shields at T-0.
  // Procedural stand-ins (tiny); release timing is the truthful part.
  // Pivots stand on the baked deck (top ≈ y 1.0).
  V.tsmu = [];
  for (const sx of [-2.9, 2.9]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 1.0, 1.6);
    const mastArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 1.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x6a7688, metalness: 0.6, roughness: 0.4 })
    );
    applyPaintPBR(mastArm.material, 'steel', null);
    mastArm.position.set(0, 0.75, 0);
    pivot.add(mastArm);
    padGroup.add(pivot);
    V.tsmu.push(pivot);
  }

  // Service Tower (Launch Umbilical Tower) — KEPT procedural: arms retract.
  // Sunk so its base stands on the baked deck plate (≈ y -1.55).
  const towerGroup = new THREE.Group();
  towerGroup.position.set(3.4, -1.55, 0);
  const towerSteelMat = new THREE.MeshStandardMaterial({ color: 0x475163, metalness: 0.55, roughness: 0.45 });
  applyPaintPBR(towerSteelMat, 'steel', null);

  // Main lattice columns
  const towerH = 14.5;
  for (const dx of [-0.6, 0.6]) {
    for (const dz of [-0.6, 0.6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, towerH, 8), towerSteelMat);
      col.position.set(dx, towerH / 2, dz);
      towerGroup.add(col);
    }
  }

  // Horizontal floors and diagonal cross-braces
  for (let y = 1.8; y <= towerH; y += 1.8) {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), towerSteelMat);
    platform.position.y = y;
    towerGroup.add(platform);
  }

  // Lightning arrestor mast on top
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.08, 4.0, 8), new THREE.MeshStandardMaterial({ color: 0x8a97a8, metalness: 0.8 }));
  mast.position.set(0, towerH + 2.0, 0);
  towerGroup.add(mast);

  // Mast-tip beacons: spheres only (poles ship in the authored GLB).
  // Estimated tip positions until loadEnvironment() snaps them to the
  // mast_tip_0/1/2 nodes exactly. Beacon blink drives visibility (frame loop).
  V.beacons = [];
  {
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
    const tipEst = [[-14.77, 17.12, 3.96], [-13.01, 17.12, -9.11], [12.74, 17.12, -7.35]];
    for (let bi = 0; bi < 3; bi++) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), beaconMat.clone());
      beacon.position.set(tipEst[bi][0], tipEst[bi][1], tipEst[bi][2]);
      beacon.userData.phase = bi * 0.67;
      padGroup.add(beacon);
      V.beacons.push(beacon);
    }
  }

  // Retractable Umbilical Swing Arms
  V.towerArms = [];
  const armLevels = [3.2, 5.8, 8.6, 11.2];
  for (const ly of armLevels) {
    const armPivot = new THREE.Group();
    armPivot.position.set(-0.6, ly, 0);
    const armBeam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.35), new THREE.MeshStandardMaterial({ color: 0x7a8698, metalness: 0.6 }));
    armBeam.position.set(-1.2, 0, 0);
    armPivot.add(armBeam);
    towerGroup.add(armPivot);
    V.towerArms.push(armPivot);
  }

  // Pad floodlights (night only): seated AT the 4 measured env_lamps heads
  // (LAMP_HEADS — actual sources, not set-dressing). Highs rake the stack,
  // lows pool on the deck/ML — reference bottom-edge floodlight row. Reuses
  // V.padLights. No shadows (sun owns the one shadow map). Day-gated below
  // so the daytime pass starts clean.
  V.padLights = [];
  {
    const mkSpot = (color, intensity, dist, angle, pen, px, tgt) => {
      const s = new THREE.SpotLight(color, intensity, dist, angle, pen);
      s.position.set(px[0], px[1], px[2]);
      s.target.position.set(tgt[0], tgt[1], tgt[2]);
      scene.add(s); scene.add(s.target);
      V.padLights.push(s);
      return s;
    };
    // Key (camera-side NE head → stack). Wider penumbra so the pool feathers
    // out instead of ending in a hard edge. Aim lower so SLS (~12u) and
    // F9 (~7.5u) stacks both sit inside the cone.
    mkSpot(0xfff1dc, 95, 32, Math.PI / 6, 0.60, LAMP_HEADS[0], [0, 6.0, 0]);
    // Mirror key (NW head → stack), dimmer to keep key direction from the east.
    mkSpot(0xfff1dc, 55, 32, Math.PI / 6, 0.60, LAMP_HEADS[2], [0, 6.0, 0]);
    // Deck crosses: lower and hotter, so the base and ML read as bright pools
    // (reference: floodlit deck edge, black beyond).
    mkSpot(0xffe8c4, 55, 20, Math.PI / 5, 0.65, LAMP_HEADS[1], [0, 2.5, 0]);
    mkSpot(0xd8e6ff, 38, 20, Math.PI / 5, 0.65, LAMP_HEADS[3], [0, 2.5, 0]);
    try {
      const dayK = (V.sun && isFinite(V.sun.dayF)) ? V.sun.dayF : 0;
      if (dayK > 0.001) V.padLights.forEach(s => { s.intensity = 0; });
    } catch (e) {}
  }

  // Volumetric shafts: one open cone per floodlight head, apex at the lamp,
  // opening onto the matching SpotLight target with the matching cone angle.
  // Chapman "good-enough volumetrics" pattern (via threex.volumetricspotlight,
  // MIT — J. Etienne 2013) rewritten for modules + soft edges + smoke drift.
  V.shafts = [];
  {
    const defs = [
      { head: 0, tgt: [0, 6.0, 0], ang: Math.PI / 6, col: 0xfff1dc, boost: 0.45 },
      { head: 2, tgt: [0, 6.0, 0], ang: Math.PI / 6, col: 0xfff1dc, boost: 0.32 },
      { head: 1, tgt: [0, 2.5, 0], ang: Math.PI / 5, col: 0xffe8c4, boost: 0.32 },
      { head: 3, tgt: [0, 2.5, 0], ang: Math.PI / 5, col: 0xd8e6ff, boost: 0.24 }
    ];
    const DOWN = new THREE.Vector3(0, -1, 0); // build-time only (no per-frame alloc)
    // Shared head-flare material (one opacity for all four; driven in updateShafts).
    if (!V._flareTex) {
      const fc = document.createElement('canvas');
      fc.width = 128; fc.height = 128;
      const fx = fc.getContext('2d');
      const fg = fx.createRadialGradient(64, 64, 1, 64, 64, 64);
      fg.addColorStop(0, 'rgba(255,244,225,1)');
      fg.addColorStop(0.25, 'rgba(255,236,205,0.55)');
      fg.addColorStop(0.6, 'rgba(255,220,170,0.16)');
      fg.addColorStop(1, 'rgba(255,210,150,0)');
      fx.fillStyle = fg;
      fx.fillRect(0, 0, 128, 128);
      V._flareTex = new THREE.CanvasTexture(fc);
      tagSRGB(V._flareTex);
    }
    if (!V._flareMat) {
      V._flareMat = new THREE.SpriteMaterial({
        map: V._flareTex, color: 0xfff0d8, blending: THREE.AdditiveBlending,
        transparent: true, opacity: 0.35, depthWrite: false
      });
    }
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i], hp = LAMP_HEADS[d.head];
      _pp0.set(d.tgt[0] - hp[0], d.tgt[1] - hp[1], d.tgt[2] - hp[2]);
      const len = Math.max(0.5, _pp0.length());
      _pp0.divideScalar(len);
      const m = makeShaftMesh(len, Math.tan(d.ang) * len * 0.9, d.col, d.boost, i * 1.7);
      m.position.set(hp[0], hp[1], hp[2]);
      m.quaternion.setFromUnitVectors(DOWN, _pp0);
      const flare = new THREE.Sprite(V._flareMat); // apex child: position only
      flare.scale.set(1.0, 1.0, 1);
      m.add(flare);
      scene.add(m);
      V.shafts.push(m);
    }
  }

  // Tower lamp dots: steady warm points up the ML tower faces (reference:
  // towers carry lamps along their full height — this fixes the dark crown).
  // Faces come from the verified ML (built in loadML); until then, nothing
  // to hang lamps on. Gated on night in blinkBeacons. Placeholder stays null.
  V.towerLamps = null;

/* Derive the ML tower faces from the loaded geometry (one-time, build-time
   cost only): the tower is the slender tall part, so box the vertices above
   45% of ML height. 7 levels × 4 inset faces → 28 dots. */
function buildTowerLampsFromML() {
  try {
    if (V.towerLamps || !V.nasaML || !V.scene) return;
    V.nasaML.updateMatrixWorld(true);
    const wp = new THREE.Vector3(); // build-time scratch (never per-frame)
    let minY = 1e9, maxY = -1e9;
    V.nasaML.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes) return;
      const p = o.geometry.attributes.position;
      if (!p) return;
      for (let i = 0; i < p.count; i++) {
        wp.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (wp.y < minY) minY = wp.y;
        if (wp.y > maxY) maxY = wp.y;
      }
    });
    if (!(maxY > minY + 3)) return;
    const lo = minY + (maxY - minY) * 0.45, hi = minY + (maxY - minY) * 0.95;
    const bb = new THREE.Box3();
    let any = false;
    V.nasaML.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes) return;
      const p = o.geometry.attributes.position;
      if (!p) return;
      for (let i = 0; i < p.count; i++) {
        wp.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (wp.y >= lo && wp.y <= hi) { bb.expandByPoint(wp); any = true; }
      }
    });
    if (!any) return;
    const ix0 = bb.min.x + 0.05, ix1 = bb.max.x - 0.05;
    const iz0 = bb.min.z + 0.05, iz1 = bb.max.z - 0.05;
    const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
    const pts = [];
    for (let li = 0; li < 7; li++) {
      const y = lo + (hi - lo) * (li / 6);
      pts.push(ix0, y, cz, ix1, y, cz, cx, y, iz0, cx, y, iz1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    const mt = new THREE.PointsMaterial({
      color: 0xffc98a, size: 0.22, sizeAttenuation: true, map: getDotTex(),
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const lamps = new THREE.Points(g, mt);
    lamps.frustumCulled = false;
    lamps.renderOrder = 3;
    lamps.visible = false; // blinkBeacons enables at night once ML verifies
    V.scene.add(lamps);
    V.towerLamps = lamps;
    V._towerTop = { x: cx, y: hi, z: cz }; // crown anchor for TOWER-TOP-DOWN
  } catch (e) {}
  }

  // Distant facility lights: a sparse ring of warm/cool dots (pad buildings,
  // roads, far pads) so the night ground reads as a complex, not a void.
  // 1 draw call, night-only, always on once built.
  {
    const N = 44, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const warm = [1.0, 0.78, 0.52], cool = [0.62, 0.74, 0.95];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (i % 5) * 0.22;
      const r = 10 + (i % 7) * 5.2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.15 + (i % 3) * 0.2;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = (i % 4 === 3) ? cool : warm;
      const b = 0.5 + (i % 3) * 0.25;
      col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: 0.35, sizeAttenuation: true, vertexColors: true, map: getDotTex(),
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    pts.visible = false; // blinkBeacons enables at night
    scene.add(pts);
    V.fieldLights = pts;
  }

  padGroup.add(towerGroup);
  scene.add(padGroup);
  V.padGroup = padGroup; // hidden once the true-scale NASA ML loads
  // Phase A step 3: procedural pad casts (GLB does not). Set once at build.
  try {
    padGroup.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  } catch (e) {}
  // Phase A step 3: night single-spot shadow on the key head only (1024, once).
  try {
    const nightK = !V.sun || !(V.sun.dayF > 0.001);
    if (nightK && V.padLights && V.padLights[0]) {
      V.padLights[0].castShadow = true;
      if (V.padLights[0].shadow) {
        V.padLights[0].shadow.mapSize.set(1024, 1024);
        V.padLights[0].shadow.camera.near = 1;
        V.padLights[0].shadow.camera.far = 40;
        V.padLights[0].shadow.bias = -0.0005;
      }
    }
  } catch (e) {}
  // Phase A step 4: fallback site disc now (GLB covers center on success);
  // lamp housings at the measured heads (spots unchanged).
  try { buildSiteGround(18.8, -2.3, false); } catch (e) {}
  try { buildLampHousings(); } catch (e) {}

  // Step-1 sky (replaces symbolic Earth ball + random stars — deleted, no parallel path):
  // analytic camera-relative dome + HYG catalog field, both driven by V.sun.
  const dome = buildSkyDome(scene, V.sun ? V.sun.dir : null);
  V.skyDome = dome;
  V.env.push(dome);
  if (V.sun) {
    dome.material.uniforms.uDayF.value = V.sun.dayF;
    try {
      window.__LAUNCH_SUN = { elDeg: +(V.sun.el * 180 / Math.PI).toFixed(1),
        dayF: +V.sun.dayF.toFixed(2), jd: +V.sun.jd.toFixed(2), provider: V.sun.provider,
        bodies: (V.visibleBodies || []).map(b => b.body + ':' + b.altDeg) }; // P3 Test G
    } catch (e) {}
  }
  const pr = V.renderer ? Math.min(window.devicePixelRatio || 1, DPR_CAP) : 1;
  const starPts = buildRealStars(scene, V.sun ? V.sun.basis : null, pr);
  V.stars = starPts;
  V.env.push(starPts);

  // Far-space photo layer (high altitude only): reuses the already-vendored
  // stars_8k.jpg backdrop (same file ops-view uses — no new asset, no license
  // risk). uMapF rides the star gate (see updateEnvironment), so the pad and
  // early ascent stay pixel-identical. Async; missing texture = old behavior.
  // Far-space photo layer (high altitude only): reuses the already-vendored
  // stars_8k.jpg backdrop (same file ops-view uses — no new asset, no license
  // risk). uMapF rides the star gate (see updateEnvironment), so the pad and
  // early ascent stay pixel-identical. Async; missing texture = old behavior.
  try {
    const tl = new THREE.TextureLoader();
    tl.load('assets/textures/stars_8k.jpg', (t) => {
      try {
        if (!V.scene || !V.skyDome || !V.skyDome.material) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearFilter; // ops-view convention (no mipmap spike)
        t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        V.skyDome.material.uniforms.uMap.value = t;
      } catch (e) { try { t.dispose(); } catch (e2) {} }
    });
  } catch (e) {}

  // Initialize smoke & plume systems
  buildSmokeSystems(scene);
}

/* ══════════════════════════════════════════════════════════════
   SMOKE & CONTRAIL PARTICLE SYSTEMS
   ══════════════════════════════════════════════════════════════ */
/* Condensation collar master switch (owner direction 2026-10-04): the Max-Q
   vapor cone read as a fake sonic boom. OFF — build stays (cheap, keeps
   userData sizing guards valid), update gate below keeps it hidden. */
const COLLAR_ON = false;
function buildSmokeSystems(scene) {
  const smokeTex = createSmokeTexture();

  // 1. Pad Flame Trench Blast Smoke (billows horizontally during liftoff)
  V.padSmoke = [];
  const trenchPuffs = 64;
  for (let i = 0; i < trenchPuffs; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    const side = (i % 2 === 0) ? 1 : -1;
    s.userData = {
      seed: (i * 0.618033) % 1,
      side: side,
      delay: (i / trenchPuffs) * 0.05,
      birthY: 0.6
    };
    scene.add(s);
    V.padSmoke.push(s);
  }

  // 2. High-Altitude Rocket Contrail Particles (spawned along climb path)
  V.contrailSmoke = [];
  const contrailCount = 72;
  for (let i = 0; i < contrailCount; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    s.userData = { active: false, life: 0, maxLife: 1.0, size: 1.5 };
    scene.add(s);
    V.contrailSmoke.push(s);
  }

  // 3. Max-Q Condensation Collar (transonic Prandtl-Glauert vapor cloud).
  // Shock-ring haze, NOT a cone mesh: 1 nose-cap sprite + 4 ring sprites on
  // the pad smoke texture, fastened to the body axis with the plume pattern
  // (ignition clocks + low-passed intensity — no pops). Honesty note: this is
  // CONDENSATION in the transonic/supersonic regime (Max-Q MET ±12 s proxy).
  // The "boom" itself is heard on the ground (N-wave), never seen — and no
  // Mach claim is made (Mach is not computed anywhere in the renderer).
  const condCollar = new THREE.Group();
  condCollar.name = 'condensation_collar';
  condCollar.userData.bodyD = 0.6; // display-unit core diameter (set at start)
  condCollar.userData.noseD = 0.6; // display-unit head diameter (set at start)
  condCollar.userData.intS = 0; // low-passed intensity (fastening state)
  condCollar.userData.wasOn = false; // ignition clock flag
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex, color: 0xd8e4f2,
      transparent: true, opacity: 0, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    const ring = i > 0;
    s.userData = {
      seed: (i * 0.377 + 0.13) % 1, ring,
      ang: ring ? ((i - 1) / 4) * Math.PI * 2 : 0
    };
    condCollar.add(s);
  }
  condCollar.visible = false;
  V.condensationCone = condCollar;
  scene.add(condCollar);

  // 4. IOP/SS Deluge burst (Workstream B): trench steam at T-15 s -> liftoff.
  V.deluge = [];
  for (let i = 0; i < 18; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex, color: 0xdcecf5,
      transparent: true, opacity: 0, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    s.userData = { active: false, life: 0, seed: (i * 0.377) % 1 };
    scene.add(s);
    V.deluge.push(s);
  }

  // 5. ROFI sparklers (Workstream B): hydrogen burn-off shower under the bells.
  V.rofi = [];
  for (let i = 0; i < 26; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex, color: 0xffb03a, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    s.userData = { active: false, life: 0, seed: (i * 0.523) % 1 };
    scene.add(s);
    V.rofi.push(s);
  }

  // 6. Cryo venting wisps (Workstream B): vehicle vents during the count.
  V.vent = [];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex, color: 0xe8f2fa,
      transparent: true, opacity: 0, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    s.userData = { active: false, life: 0, seed: (i * 0.719) % 1 };
    scene.add(s);
    V.vent.push(s);
  }

  // 7. Horizon sky-glow (Artemis refs: the sky itself burns orange around the
  // pad at ignition). One huge additive sprite behind the pad, ignition-only.
  const glowMat = new THREE.SpriteMaterial({
    map: smokeTex, color: 0xff8a30, blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0, depthWrite: false
  });
  const skyGlow = new THREE.Sprite(glowMat);
  skyGlow.position.set(-6, 3, -16);
  skyGlow.scale.set(36, 18, 1);
  scene.add(skyGlow);
  V.skyGlow = skyGlow;

  // 8. Pad fireball (ref image 2: overexposed ignition fireball swallowing the
  // mount). Additive, MET-keyed 0-12 s, anchored at trench mouth.
  const fbMat = new THREE.SpriteMaterial({
    map: smokeTex, color: 0xffd9a0, blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0, depthWrite: false
  });
  const fireball = new THREE.Sprite(fbMat);
  fireball.position.set(0, 0.4, 0);
  fireball.scale.set(10, 7, 1);
  scene.add(fireball);
  V.padFireball = fireball;

  // 9. Under-flame smoke bed (ref: glowing vapor churning DIRECTLY below the
  // flame, distinct from the ground trench banks). Pool of additive fire-lit
  // puffs spawned at the live plume base through the low-altitude burn.
  V.flameSmoke = [];
  V._fsmokeTick = 0;
  for (let i = 0; i < 60; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex, color: 0xffc080, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    s.userData = {
      active: false, life: 0, seed: (i * 0.617) % 1,
      vx: 0, vy: 0, vz: 0, size: 1.5
    };
    scene.add(s);
    V.flameSmoke.push(s);
  }

  // 10. Still-state ground vapor (owner direction): thin cryo/humidity wisps
  // hugging the apron through the count — static placement (deterministic
  // ring, no spawn logic), slow breathing only. Burned off at ignition.
  V.groundFog = [];
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex, color: 0xaebdc9, blending: THREE.NormalBlending,
      transparent: true, opacity: 0, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.35;
    const r = 5.5 + (i % 4) * 2.2;
    const sc = 6 + (i % 5) * 1.1;
    s.position.set(Math.cos(a) * r, 0.25 + (i % 3) * 0.25, Math.sin(a) * r);
    s.scale.set(sc, sc * 0.45, 1);
    s.userData = { seed: (i * 0.377) % 1, base: 0.05 + (i % 4) * 0.012 };
    scene.add(s);
    V.groundFog.push(s);
  }
}

/* ══════════════════════════════════════════════════════════════
   Authored LC-39B environment (single GLB, expert-built).
   File is meters, Y-up, origin at pad center. Fixed scale 1/8.5 with
   position.y = 1.0 puts the ML deck top (file y=0) at scene y=1.0, under the
   rocket base; file ground (≈ -28 m) lands at ≈ -2.3. No measuring, no
   fallback pad: if the load fails the procedural tower/clamps still stand.
   launch_env_fss_optional.glb is NOT loaded (Shuttle-era, excluded).
   ══════════════════════════════════════════════════════════════ */
const ENV_URL = 'models/nasa/launch_env_lc39b.glb';
const ENV_SCALE = 1 / 8.5;
/* FIXED LC-39B WORLD FRAME (launch plan Phases 2/5 — site truth, not art).
   Site axes: +X = East, +Y = Up, +Z = North. Camera/plume/smoke axes are
   presentation; cardinal truth lives here. Deflector exhaust → North (+Z);
   catacomb → East (+X); PTCR/ECS → West (−X); LOX → Northwest; LH2 →
   Northeast (plan §13 — validation framework, not decoration).
   Fixed conversion (SLS-canonical, NASA MODEL MEASURED): 1 display unit =
   WORLD_M_PER_UNIT metres, from the live SLS audit (k = 0.1005 u/m →
   9.95 m/u, PAD_SCALE_AUDIT.md §2). The site NEVER rescales per vehicle. */
/* True-scale NASA ground hardware (nasa/NASA-3D-Resources, Draco-compressed).
   Native units are arbitrary per author — each asset carries its own measured
   metres-per-unit, reconciled once against NASA fact sheets (see
   plans_notes/PAD_SCALE_AUDIT.md). Static site scale uses the FIXED site
   conversion below (SLS canonical) — never the live rocket scale. */
const WORLD_M_PER_UNIT = 9.95; // 1 display unit = 9.95 m (SLS-canonical audit)
const SITE_VK = 1 / WORLD_M_PER_UNIT; // fixed display-units-per-metre (~0.1005)
const ML_URL = 'models/nasa/Mobile Launcher (assembled).glb';
const CRAWLER_URL = 'models/nasa/crawler.glb'; // retained for future rollout scene only
const ML_M_PER_UNIT = 47.5; // base 1.02u→48m, tower top 2.464u→117m ≈ ML 380ft
const CRAWLER_M_PER_UNIT = 4.7; // 8.77u→39.9m long, 7.19u→34.8m wide, ~8m tall
const ML_DECK_M = 14.3; // "0" deck 47 ft above the pad slab (mount base)
const SLAB_TOP_Y = -0.65; // old-env slab top == trench_center node (scene units)
const SITE_DECK_Y = SLAB_TOP_Y + ML_DECK_M / WORLD_M_PER_UNIT; // fixed deck ≈ 0.79
/* Floodlight heads (MEASURED, not authored): env_lamps merged mesh in
   launch_env_lc39b.glb holds 4 islands (Trimesh + DracoPy decode, 192 verts).
   File-metre centroids /8.5 + y+1.0 → scene display units (site frame
   +X East/+Y Up/+Z North, origin pad center). Order: NE/SE/NW/SW. */
const LAMP_HEADS = [
  [5.62, 4.20, 4.45],   // L0 NE (file [47.78, 27.18, 37.83])
  [5.62, 4.20, -4.45],  // L1 SE (file [47.78, 27.18, -37.83])
  [-3.98, 4.20, 4.45],  // L2 NW (file [-33.81, 27.18, 37.79])
  [-3.98, 4.20, -4.45]  // L3 SW (file [-33.81, 27.18, -37.79])
];
/* ML tower lamp columns: faces are MEASURED from the loaded ML geometry
   (buildTowerLampsFromML, called once the NASA ML verifies) — never
   hardcoded, so asset swaps can't leave floaters. */
const LIGHTNING_TOWERS_RECONSTRUCTED = [ // metres, RECONSTRUCTED FROM NASA DATA / NON-SURVEY
  { id: 'LT1', xM: -146, zM: 68 },   // ≈295°, r≈161 m
  { id: 'LT2', xM: 123,  zM: 40 },   // ≈72° east-side tower, r≈129 m
  { id: 'LT3', xM: -105, zM: -116 }  // ≈222°, r≈157 m
]; // Named auditable reference only — moves NO geometry (plan Phase 4).
/* Lightning towers (plan Phase 4): RECONSTRUCTED FROM NASA DATA / NON-SURVEY.
   Azimuths 295°/72°/222°, separations ~189/270/276 m → centre-relative metres
   (+X East, +Z North): LT1 ≈ (−146, +68), LT2 ≈ (+123, +40), LT3 ≈ (−105, −116).
   NOT official survey coordinates. Old merged steel mesh is kept UNSTRETCHED
   as temporary fallback until a NASA/CAD tower asset arrives — do NOT scale
   any tower mesh vertically (plan §16). No geometry is moved by this table. */
/* Crawler operational rule (plan Phase 6): absent at T-0. The crawler carries
   the ML to the pad then departs — no launch-shot parking coordinate exists.
   V.nasaCrawler stays null in the launch scene; the asset is NOT loaded here. */
/* Vehicle-interface rule (plan Phase 7): SLS keeps applicable ML arms; on
   smaller vehicles SLS-specific static arms must hide (clean gap — never
   stretch arms or add filler). Patterns below name SLS-only meshes IF found;
   empty = pending mesh audit of the adopted ML asset, geometry untouched. */
const SLS_ONLY_ARM_PATTERNS = [];

/* ══════════════════════════════════════════════════════════════
   STEP-1 ENVIRONMENT (Phase A audit §8): camera-relative horizon +
   analytic sky + solar hook + HYG star field. Replaces the 3-band sky,
   symbolic Earth ball and random stars (deleted below — no parallel paths).
   Sun math reads the SINGLE astronomy authority (window.Astronomy global,
   js/astronomy.js ECLIPTIC_J2000/SSB/TDB) — no second ephemeris. Stars reuse
   js/stars-data.js (HYG v4.0). All astro is fixed once at T-0: the 56 s
   cinematic moves the Sun 0.01° and rotates Earth 0.23° — negligible, so the
   sky is perfectly deterministic and costs zero per-frame astro (dome + stars
   recenter on the camera; uniforms only). Data classes: Sun vector MEASURED
   (JPL_DE441 or FALLBACK_KEPLER per provider label); date mapping ESTIMATED
   ±1 d (leap-year approx — sub-degree Sun error, visuals only); time-of-day
   PRESENTATION default (?tod= override for QA). */
const KSC_LAT = 28.627, KSC_LON = -80.621; // LC-39B approx deg (NASA documented pad location)
const EARTH_R_KM = 6371.0; // spherical-Earth visual approximation (documented)
const ATMO_H_KM = 8.5; // scale height, ESTIMATED standard-atmosphere value
const STEP1_OBLIQUITY = 23.43928; // J2000 mean obliquity, deg (standard constant; intentionally NOT OBLIQUITY_DEG.earth 23.4 — that 1-decimal value serves pole rendering, this needs full precision)
const TOD_DEFAULT = '02:00'; // UTC ≈ KSC late-evening (night) window — PRESENTATION default (tDep carries date only)

/* Decimal mission year → JD(UTC). Leap-year approx: ±1 d → <0.5° Sun error. */
function decYearToJD(t) {
  const y = Math.floor(t), fr = Math.max(0, t - y);
  return (Date.UTC(y, 0, 1) + fr * 365.25 * 864e5) / 864e5 + 2440587.5;
}
function parseTOD(s) {
  try {
    const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h + mi / 60;
  } catch (e) { return null; }
}
/* P3 shared frame adapter (single local transform, not a second authority):
   geocentric ecliptic-J2000 unit vector → scene ENU (+X east/+Y up/+Z north)
   alt/az using T-0 basis rows. Used by solarBasisFor (Sun) and
   visibleBodiesAtT0 (selector) so both agree by construction. */
function eclipticToAltAz(ex, ey, ez, B) {
  const ob = STEP1_OBLIQUITY * Math.PI / 180, co = Math.cos(ob), so = Math.sin(ob);
  const qx = ex, qy = ey * co - ez * so, qz = ey * so + ez * co; // → equatorial J2000
  const dx = qx * B.eX + qy * B.eY + qz * B.eZ;
  const dy = qx * B.uX + qy * B.uY + qz * B.uZ;
  const dz = qx * B.nX + qy * B.nY + qz * B.nZ;
  return { dx, dy, dz, alt: Math.asin(Math.max(-1, Math.min(1, dy))), az: Math.atan2(dx, dz) };
}
/* Solar basis for one launch: scene-unit Sun dir (+X east/+Y up/+Z north),
   elevation, day factor, LST/lat basis reused for the star conversion.
   Returns null → legacy night path (deterministic, guarded). */
function solarBasisFor(tDep, todH, dateOv) {
  try {
    let jd;
    if (dateOv) {
      const d = new Date(dateOv + 'T00:00:00Z');
      if (isNaN(d.getTime())) return null;
      jd = d.getTime() / 864e5 + 2440587.5 + todH / 24;
    } else {
      if (!isFinite(tDep)) return null;
      const y = Math.floor(tDep), fr = Math.max(0, tDep - y);
      const baseMs = Date.UTC(y, 0, 1) + fr * 365.25 * 864e5;
      const b = new Date(baseMs);
      jd = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) / 864e5 + 2440587.5 + todH / 24;
    }
    const A = (typeof globalThis !== 'undefined') ? globalThis.Astronomy : null;
    if (!A || typeof A.getHeliocentricState !== 'function') return null;
    const s = A.getHeliocentricState('earth', jd);
    if (!s || s.ok === false || !s.pos) return null;
    const il = 1 / Math.max(1e-9, Math.hypot(s.pos[0], s.pos[1], s.pos[2]));
    const ex = -s.pos[0] * il, ey = -s.pos[1] * il, ez = -s.pos[2] * il; // geocentric sun, ecliptic J2000
    const gmst = (280.46061837 + 360.98564736629 * (jd - J2000_JD)) * Math.PI / 180; // Meeus, ±0.1° (J2000 anchor: single-owner import)
    const lat = KSC_LAT * Math.PI / 180, lst = gmst + KSC_LON * Math.PI / 180;
    const cL = Math.cos(lst), sL = Math.sin(lst), cLa = Math.cos(lat), sLa = Math.sin(lat);
    // ENU basis rows in equatorial components (vector method — no azimuth convention risk)
    const basis = {
      eX: -sL, eY: cL, eZ: 0,
      nX: -sLa * cL, nY: -sLa * sL, nZ: cLa,
      uX: cLa * cL, uY: cLa * sL, uZ: sLa
    };
    const sun = eclipticToAltAz(ex, ey, ez, basis);
    const dayF = smooth01(sun.alt, -0.06, 0.28); // night below ≈−3°, full day above ≈16°
    return { dir: new THREE.Vector3(sun.dx, sun.dy, sun.dz).normalize(), el: sun.alt, dayF, jd,
      provider: s.provider || 'unknown', basis };
  } catch (e) { return null; }
}
/* B-V tints: single shared implementation (orrery.js bvColor, imported above). */
/* P3 T-0 visible-body selector (analytical; renders nothing by itself).
   Queries the COMMON authority once at the frozen T-0 JD — planets via orrery
   helioKm (same body-world state the orbital scenes use), the Moon via
   Astronomy.getRelativeState (raw ECLIPTIC_J2000; orrery's moonWorldPhysical
   applies a Y-up view mapping that is the wrong frame for this ENU adapter) —
   and projects with the SAME adapter as the Sun above. Lists naked-eye bodies
   above the horizon on a dark sky (dayF ≤ 0.05 gate: daylight washes all but
   the Sun, and stars are already gated off). Cached on V.visibleBodies at
   start(); zero per-frame cost. P3 renders no new meshes: default launches are
   daytime (empty by geometry — verified Test G); night cases are
   analysis-complete with rendering deferred (no invented magnitudes). */
const VISIBLE_CANDIDATES = ['moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
function visibleBodiesAtT0() {
  const out = [];
  try {
    if (!V.sun || !V.sun.basis || !isFinite(V.sun.jd)) return out;
    if (V.sun.dayF > 0.05) return out; // daylight: Sun only
    const simDays = V.sun.jd - J2000_JD;
    let earth = null;
    try { earth = helioKm('earth', simDays); } catch (e) { earth = null; }
    const rel = (body) => {
      if (body === 'moon') {
        try {
          const A = (typeof globalThis !== 'undefined') ? globalThis.Astronomy : null;
          if (!A || typeof A.getRelativeState !== 'function') return null;
          const s = A.getRelativeState('moon', 'earth', V.sun.jd);
          if (!s || s.ok === false || !s.pos) return null;
          return s;
        } catch (e) { return null; }
      }
      try {
        const b = helioKm(body, simDays);
        if (!b || !b.pos || !earth || !earth.pos) return null;
        return { pos: [b.pos[0] - earth.pos[0], b.pos[1] - earth.pos[1], b.pos[2] - earth.pos[2]],
          provider: b.provider || 'helioKm' };
      } catch (e) { return null; }
    };
    for (const body of VISIBLE_CANDIDATES) {
      const s = rel(body);
      if (!s) continue;
      const r = Math.hypot(s.pos[0], s.pos[1], s.pos[2]);
      if (!(r > 0) || !isFinite(r)) continue;
      const g = eclipticToAltAz(s.pos[0] / r, s.pos[1] / r, s.pos[2] / r, V.sun.basis);
      if (g.alt * 180 / Math.PI > -0.5)
        out.push({ body, altDeg: +(g.alt * 180 / Math.PI).toFixed(1),
          azDeg: +(g.az * 180 / Math.PI).toFixed(1), distKm: Math.round(r),
          provider: s.provider || 'unknown' });
    }
  } catch (e) {}
  return out;
}
/* Real HYG star field: equatorial J2000 vectors → fixed scene positions at the
   T-0 epoch basis. Built once; recentered on the camera per frame (zero
   parallax = correct for infinity; deterministic across runs and cuts).
   B-V tints: single implementation imported from orrery.js (bvColor). */
const STAR_VERT = [
  'attribute vec3 aColor; attribute float aSize;',
  'uniform float uPr; varying vec3 vC; varying vec3 vDir;',
  'void main(){ vC = aColor; vDir = position;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = aSize * uPr; gl_Position = projectionMatrix * mv; }'
].join('\n');
const STAR_FRAG = [
  'uniform float uVis, uDipY; varying vec3 vC; varying vec3 vDir;',
  'void main(){',
  '  float d = length(gl_PointCoord - 0.5);',
  '  float a = smoothstep(0.5, 0.06, d);',
  '  float hfade = smoothstep(uDipY - 0.01, uDipY + 0.06, normalize(vDir).y);',
  '  gl_FragColor = vec4(vC * uVis, 1.0) * (a * hfade);',
  '}'
].join('\n');
function buildRealStars(scene, basis, pr) {
  const n = STAR_VEC.length, R = 300;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n);
  const t = [0, 0, 0];
  const B = basis || null;
  for (let i = 0; i < n; i++) {
    const v = STAR_VEC[i], m = STAR_MAG[i];
    let sx = v[0], sy = v[1], sz = v[2];
    if (B) { // fixed T-0 equatorial→scene rotation (Earth rotation frozen for the cinematic)
      sx = v[0] * B.eX + v[1] * B.eY + v[2] * B.eZ;
      const uy = v[0] * B.uX + v[1] * B.uY + v[2] * B.uZ;
      const nz = v[0] * B.nX + v[1] * B.nY + v[2] * B.nZ;
      pos[i * 3] = sx * R; pos[i * 3 + 1] = uy * R; pos[i * 3 + 2] = nz * R;
    } else { pos[i * 3] = sx * R; pos[i * 3 + 1] = sy * R; pos[i * 3 + 2] = sz * R; }
    bvColor(STAR_BV[i], t);
    const bright = Math.min(1.6, Math.max(0.35, 1.6 - 0.22 * m));
    col[i * 3] = t[0] * bright; col[i * 3 + 1] = t[1] * bright; col[i * 3 + 2] = t[2] * bright;
    siz[i] = Math.max(1.2, 4.0 * Math.pow(10, -0.2 * m));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPr: { value: pr || 1 }, uVis: { value: 0 }, uDipY: { value: 0 } },
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = -5; // sky dome (-10) first, then stars, then world
  scene.add(points);
  return points;
}
/* Analytic sky dome: direction-space atmosphere over a camera-centered sphere.
   Density from camera altitude (exp(−h/H)); horizon dip from spherical-Earth
   geometry (cos δ = R/(R+h)); Sun disc + twilight band from the solar hook;
   below-dip directions render limb-brightened earth haze. One draw, ~1k tris. */
const SKY_VERT = [
  'varying vec3 vDir;',
  'void main(){ vDir = position;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_Position = projectionMatrix * mv; }'
].join('\n');
const SKY_FRAG = [
  'uniform vec3 uSunDir; uniform float uDayF, uDens, uDipY, uLift;',
  'uniform sampler2D uMap; uniform float uMapF, uMapGain;',
  'varying vec3 vDir;',
  'void main(){',
  '  vec3 d = normalize(vDir);',
  '  float sunD = dot(d, uSunDir);',
  '  float up = clamp(d.y, 0.0, 1.0);',
  '  float hband = pow(1.0 - up, 3.0);',
  '  vec3 dayCol = mix(vec3(0.090,0.210,0.520), vec3(0.520,0.640,0.780), hband);',
  '  vec3 nightCol = mix(vec3(0.001,0.002,0.005), vec3(0.006,0.009,0.022), hband);',
  '  vec3 spaceCol = vec3(0.004,0.006,0.014);',
  '  vec3 atmoCol = mix(nightCol, dayCol, uDayF);',
  '  vec3 col = mix(spaceCol, atmoCol, clamp(uDens * 1.4, 0.0, 1.0));',
  '  vec2 sk = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);',
  '  col += texture2D(uMap, sk).rgb * (uMapF * uMapGain);',
  '  float sunEl = uSunDir.y;',
  '  float twi = (1.0 - smoothstep(0.0, 0.35, abs(sunEl))) * step(sunEl, 0.25);',
  '  vec2 dxz = d.xz / max(length(d.xz), 1e-4);',
  '  vec2 sxz = uSunDir.xz / max(length(uSunDir.xz), 1e-4);',
  '  float toward = max(dot(dxz, sxz), 0.0);',
  '  float band = exp(-abs(d.y - 0.02) * 7.0);',
  '  col += vec3(0.55,0.22,0.08) * (pow(toward, 3.0) * band * twi * 0.6);',
  '  col += vec3(0.10,0.05,0.02) * band * (1.0 - uDayF) * 0.12 * clamp(uDens * 2.0, 0.0, 1.0);',
  '  float disc = smoothstep(0.999970, 0.999990, sunD);',
  '  float glow = pow(max(sunD, 0.0), 700.0) * 0.35 + pow(max(sunD, 0.0), 60.0) * 0.08;',
  '  float sunVis = clamp(uDayF + twi, 0.0, 1.0);',
  '  col += (vec3(1.0,0.95,0.88) * disc * 2.0 + vec3(1.0,0.85,0.65) * glow) * sunVis;',
  '  float below = 1.0 - smoothstep(uDipY - 0.015, uDipY + 0.015, d.y);',
  '  vec3 earthCol = mix(vec3(0.010,0.013,0.022), vec3(0.045,0.070,0.110), uDayF);',
  '  float limb = exp(-abs(d.y - uDipY) * 30.0);',
  '  earthCol += vec3(0.25,0.35,0.55) * limb * (0.05 + 0.95 * uDayF) * clamp(uDens * 3.0 + 0.1, 0.0, 1.0);',
  '  earthCol += vec3(0.10,0.18,0.15) * limb * (1.0 - uDayF) * 0.35 * clamp(uDens * 3.0 + 0.1, 0.0, 1.0);',
  '  col = mix(col, earthCol, below);',
  '  col += vec3(uLift, uLift * 0.72, uLift * 0.70) * mix(1.0, 0.30 + 0.70 * hband, 1.0 - uDayF);',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');
function buildSkyDome(scene, sunDir) {
  const g = new THREE.SphereGeometry(380, 32, 16);
  const sd = sunDir || new THREE.Vector3(0.5, -0.3, 0.4).normalize(); // legacy-night fallback dir
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sd.clone() }, uDayF: { value: 0 }, uDens: { value: 1 },
      uDipY: { value: 0 }, uLift: { value: 0 },
      uMap: { value: null }, uMapF: { value: 0 }, uMapGain: { value: 0.55 }
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: false
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  scene.add(m);
  return m;
}
/* Solar rig: night values are the Artemis-reference baseline (dim wash + spot
    pools, set in buildScene); day values are presentation tuning (SYMBOLIC),
    assigned absolute so the day curve is unaffected by the night baseline. */
function applySolarRig(sun, hemi, key, fill) {
  const k = (sun && isFinite(sun.dayF)) ? sun.dayF : 0;
  if (k <= 0.001) { // Phase A step 3 night: gentle floor, spots remain key
    // Physical-unit target; the floor derives itself from the renderer:
    // legacy mode (r<155 default, removed r165) π-scales punctual lights.
    // Tune from the pre-ignition shaded-core reading (0.2–0.3 sRGB), not the
    // number: drop to 0.04/0.025 if above 0.3, up if crushed.
    try {
      const legacyDiv = (V.renderer && V.renderer.useLegacyLights) ? Math.PI : 1;
      hemi.color.set(0x5a78b0); hemi.groundColor.set(0x05070c);
      hemi.intensity = 0.06 / legacyDiv; fill.intensity = 0.04 / legacyDiv;
      key.intensity = 0; key.castShadow = false; // set once here, never toggled per-frame
    } catch (e) {}
    return;
  }
  hemi.intensity = 0.38 + (0.95 - 0.38) * k;
  hemi.color.setHex(0x8faee0).lerp(new THREE.Color(0xbfd9ff), k);
  key.intensity = 1.35 + (2.8 - 1.35) * k;
  key.color.setHex(0xfffaed).lerp(new THREE.Color(0xfff3e2), k);
  key.position.copy(sun.dir).multiplyScalar(60);
  fill.intensity = 0.45 + (0.6 - 0.45) * k;
  try { key.castShadow = true; } catch (e) {} // set once here, never toggled per-frame
}
function loadEnvironment(opts) {
  const useBakedDeck = !opts || opts.useBakedDeck !== false;
  if (V.envLoaded || !V.scene) return;
  V.envLoaded = true;
  try {
    const loader = envGltfLoader();
    loader.load(ENV_URL, (gltf) => {
      try {
        if (!V.scene) return; // torn down mid-load
        const g = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!g) return;
        g.scale.setScalar(ENV_SCALE);
        g.position.y = 1.0;
        g.updateMatrixWorld(true);
        if (!useBakedDeck) {
          g.traverse(o => { if (o.isMesh && o.name && o.name.indexOf('ml_deck') === 0) o.visible = false; });
        }
        // Mast-tip beacons snap to the authored nodes; trench + fire light
        // anchor to trench_center (scene ≈ (0, -0.65, 0)).
        const tipV = new THREE.Vector3();
        for (let i = 0; i < 3; i++) {
          const tip = g.getObjectByName('mast_tip_' + i);
          if (tip && V.beacons[i]) {
            tip.getWorldPosition(tipV);
            V.beacons[i].position.copy(tipV);
          }
        }
        const trench = g.getObjectByName('trench_center');
        if (trench) {
          trench.getWorldPosition(tipV);
          V.trenchPos = tipV.clone();
          if (V.fireLight) V.fireLight.position.copy(V.trenchPos);
        }
        g.traverse(o => {
          if (!o.isMesh) return;
          o.receiveShadow = true;
          o.frustumCulled = false;
          o.castShadow = false; // Phase A: restrict casters to rocket/pad (no GLB acne)
        });
        applyGlbEnv(g);
        try {
          const m = measureGlbGround(g);
          buildSiteGround(m.R, m.groundY, true); // annulus under the verified deck
        } catch (e) {}
        V.scene.add(g);
        V.env.push(g);
        g.updateMatrixWorld(true);
        g.traverse(o => { o.matrixAutoUpdate = false; }); // static: no per-frame cost
        hideSupersededEnvParts(); // late arrival: hide parts the NASA ML replaced
        try {
          window.__LAUNCH_ENV = window.__LAUNCH_ENV || { loaded: [], failed: [] };
          window.__LAUNCH_ENV.loaded.push(ENV_URL + ' bakedDeck=' + useBakedDeck +
            ' trench=' + (V.trenchPos ? V.trenchPos.toArray().map(v => +v.toFixed(2)).join(',') : 'n/a'));
          console.info('[launch-view] environment loaded:', ENV_URL, 'meshes:',
            (() => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; })());
        } catch (e) {}
      } catch (e) {}
    }, undefined, (err) => {
      try {
        window.__LAUNCH_ENV = window.__LAUNCH_ENV || { loaded: [], failed: [] };
        window.__LAUNCH_ENV.failed.push(ENV_URL);
        console.warn('[launch-view] environment FAILED:', ENV_URL, err && (err.message || err));
      } catch (e) {}
    });
  } catch (e) {}
}

/* Hides old-env parts superseded by true-scale NASA models (idempotent —
   GLB loads race, so this runs at the end of EVERY env load callback). */
function hideSupersededEnvParts() {
  // Phase A step 4: GLB lamp boxes hide once procedural housings exist (idempotent;
  // visible=false also drops their shadow cast). Independent of the ML gate below.
  try {
    if (V._lampHousings) {
      (V.env || []).forEach(g => {
        try {
          g.traverse(o => {
            if (o.isMesh && o.name === 'env_lamps' && o.visible) o.visible = false;
          });
        } catch (e) {}
      });
    }
  } catch (e) {}
  if (!V.nasaMLOn) return; // nothing else superseded until the NASA ML verifies
  try {
    (V.env || []).forEach(g => {
      try {
        g.traverse(o => {
          if (o.isMesh && o.name &&
            (o.name.indexOf('ml_deck') === 0 || o.name.indexOf('crawler_polySurface') === 0)) {
            // Never hide the NASA replacements themselves (unnamed Mesh nodes).
            if (g !== V.nasaML && g !== V.nasaCrawler) o.visible = false;
          }
        });
      } catch (e) {}
    });
  } catch (e) {}
}
/* True-scale NASA ground hardware (see constants above + PAD_SCALE_AUDIT.md).
   FIXED SITE (P1 true-scale): ML scale = ML_M_PER_UNIT / WORLD_M_PER_UNIT,
   identical for every vehicle, and rockets now build at the same SITE_VK —
   SLS and small vehicles all read truthfully against the fixed pad (the old
   normalized-rocket oversize note is retired). Crawler is NOT loaded:
   absent at T-0 per operational rule (Phase 6). Called after V.rocket exists
   for ordering only (old-env slab must exist); scale no longer reads the
   rocket. On failure the procedural pad + old GLB parts stay visible. */
function loadML() {
  if (!V.scene || !V.rocket || !(V.envLoaded)) return;
  V.nasaCrawler = null; // operational truth: no crawler at launch (Phase 6)
  try {
    const loader = envGltfLoader();
    const placeStatic = (g) => {
      g.updateMatrixWorld(true);
      g.traverse(o => { o.matrixAutoUpdate = false; }); // static: no per-frame cost
    };
    loader.load(ML_URL, (gltf) => {
      try {
        if (!V.scene) return; // torn down mid-load
        const g = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!g) return;
        const mScale = ML_M_PER_UNIT / WORLD_M_PER_UNIT; // fixed site, not vk
        g.scale.setScalar(mScale);
        g.position.set(0, SLAB_TOP_Y, 0); // base bottom flush on the slab
        g.updateMatrixWorld(true);
        V.scene.add(g);
        V.env.push(g);
        applyGlbEnv(g);
        placeStatic(g);
        V.nasaML = g;
        V.nasaMLOn = true;
        try { buildTowerLampsFromML(); } catch (e) {} // lamp dots on real tower faces
        applyVehicleInterfaces(g); // Phase 7 rule (no-op until patterns known)
        hideSupersededEnvParts();
        // Procedural pad hardware is superseded — keep beacons (mast tips).
        try {
          (V.beacons || []).forEach(b => { try { V.scene.attach(b); } catch (e) {} });
        } catch (e) {}
        if (V.padGroup) V.padGroup.visible = false;
        try {
          window.__LAUNCH_ENV = window.__LAUNCH_ENV || { loaded: [], failed: [] };
          window.__LAUNCH_ENV.loaded.push(ML_URL + ' scale=' + mScale.toFixed(4) + ' fixed');
          console.info('[launch-view] ML loaded:', ML_URL);
        } catch (e) {}
      } catch (e) {}
    }, undefined, () => {
      try {
        window.__LAUNCH_ENV = window.__LAUNCH_ENV || { loaded: [], failed: [] };
        window.__LAUNCH_ENV.failed.push(ML_URL);
      } catch (e) {}
    });
  } catch (e) {}
}

/* Phase 7: hide SLS-specific static interfaces on smaller vehicles.
   Deterministic + auditable: hides only meshes matching SLS_ONLY_ARM_PATTERNS.
   List is empty pending a mesh audit of the adopted ML asset — until then this
   is a verified no-op and the clean physical gap is preserved (never stretched,
   never filled). SLS keeps everything. */
function applyVehicleInterfaces(mlRoot) {
  try {
    if (!mlRoot || V.lvId === 'sls') return;
    if (!SLS_ONLY_ARM_PATTERNS || !SLS_ONLY_ARM_PATTERNS.length) return;
    mlRoot.traverse(o => {
      try {
        const nm = (o.name || '').toLowerCase();
        if (!nm) return;
        for (let i = 0; i < SLS_ONLY_ARM_PATTERNS.length; i++) {
          if (nm.indexOf(SLS_ONLY_ARM_PATTERNS[i]) !== -1) { o.visible = false; break; }
        }
      } catch (e) {}
    });
  } catch (e) {}
}

/* Ground-system FX: deluge steam, ROFI sparks, cryo venting, TSMU release.
   clk is the Workstream-A clock; f the ascent fraction. Presentation only. */
function blinkBeacons(now) {
  if (!V.beacons) return;
  for (let i = 0; i < V.beacons.length; i++) {
    const b = V.beacons[i];
    const ph = (b.userData && b.userData.phase) || 0;
    b.visible = ((now * 0.001 + ph) % 2) < 1.3;
  }
  // Tower lamps: steady, ML-frame only, night only. Field lights: night only.
  try {
    const nightK = !V.sun || !(V.sun.dayF > 0.001);
    if (V.towerLamps) V.towerLamps.visible = !!V.nasaMLOn && nightK;
    if (V.fieldLights) V.fieldLights.visible = nightK;
  } catch (e) {}
}
function updatePadFx(clk, f, sdt) {
  const counting = !!(clk && clk.phase === 'countdown');
  const tMinus = counting ? clk.tMinus : -1;
  const dt = (isFinite(sdt) && sdt > 0) ? sdt : 0.016; // smoke wall clock (expert smoke method)

  // TSMU swing-back: final 3 s of the count; stowed through ascent.
  const tsmuFrac = counting ? Math.max(0, Math.min(1, (3 - tMinus) / 3)) : 1;
  if (V.tsmu) V.tsmu.forEach(p => { p.rotation.x = -tsmuFrac * 1.25; });

  // Horizon sky-glow: ignition beat only (peaks at T-0, tails to f 0.2 so the
  // look-back keeps its horizon fire).
  if (V.skyGlow) {
    const glow = counting
      ? (tMinus < 8 ? 0.28 * (1 - tMinus / 8) : 0)
      : (f < 0.2 ? 0.30 * (1 - f / 0.2) : 0);
    V.skyGlow.material.opacity = glow;
  }

  // Deluge steam: T-15 s through liftoff + first seconds of ascent.
  // Wall ignition (V._ignK) leads the compressed clock so the trench floods
  // while the visible flame builds.
  const metFx = counting ? -1 : f * profileFor(V.lvId).endMet;
  const ignOn = (V._ignK || 0) > 0;
  const delugeOn = (counting && (tMinus < 15 || ignOn)) || (!counting && metFx >= 0 && metFx < 15);
  const DY = (V.trenchPos && isFinite(V.trenchPos.y)) ? V.trenchPos.y + 0.2 : -0.4;
  for (let i = 0; i < V.deluge.length; i++) {
    const s = V.deluge[i];
    if (!s.userData.active) {
      // Ignition density: thin early wisps, ~50% flood at full ramp (ascent unchanged).
      const ignD = (counting && (V._ignK || 0) > 0) ? 0.15 + 0.35 * (V._ignK || 0) : 1;
      if (delugeOn && Math.random() < 0.35 * ignD) {
        s.userData.active = true;
        s.userData.life = 1.0;
        const a = Math.random() * Math.PI * 2;
        const r = 2.0 + Math.random() * 2.5;
        s.position.set(Math.cos(a) * r, DY, Math.sin(a) * r);
        s.userData.vx = Math.cos(a) * (2.5 + Math.random() * 2);
        s.userData.vz = Math.sin(a) * (2.5 + Math.random() * 2);
        s.userData.vy = 2.0 + Math.random() * 2.5;
      } else { s.material.opacity = 0; continue; }
    }
    s.userData.life -= dt * 0.55;
    if (s.userData.life <= 0) { s.userData.active = false; s.material.opacity = 0; continue; }
    s.position.x += s.userData.vx * dt;
    s.position.z += s.userData.vz * dt;
    s.position.y += s.userData.vy * dt;
    const sc = 2.5 + (1 - s.userData.life) * 6.0;
    s.scale.set(sc, sc, 1);
    const dHeightFade = Math.max(0.15, 1 - (s.position.y - 2) / 12);
    s.material.opacity = 0.35 * Math.sin(s.userData.life * Math.PI) * dHeightFade;
    // Flame-side tint (plan Phase 3): lit orange near the fire, gray with
    // distance — per-sprite materials, in-place lerp, no allocation.
    if (V.fireLight) {
      const fdx = s.position.x - V.fireLight.position.x;
      const fdy = s.position.y - V.fireLight.position.y;
      const fdz = s.position.z - V.fireLight.position.z;
      const fk = Math.exp(-Math.sqrt(fdx * fdx + fdy * fdy + fdz * fdz) / 10);
      s.material.color.copy(_C_SMOKE_BASE).lerp(_C_SMOKE_HOT, fk);
    }
  }

  // ROFI sparklers: hydrogen burn-off shower, T-12 s to T-0 (plus wall ignition).
  const rofiOn = counting && (tMinus < 12 || (V._ignK || 0) > 0);
  for (let i = 0; i < V.rofi.length; i++) {
    const s = V.rofi[i];
    if (!s.userData.active) {
      if (rofiOn && Math.random() < 0.6) {
        s.userData.active = true;
        s.userData.life = 1.0;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.6;
        s.position.set(Math.cos(a) * r, 0.9 + Math.random() * 0.5, Math.sin(a) * r);
        const sc = 0.4 + Math.random() * 0.5;
        s.scale.set(sc, sc, 1);
      } else { s.material.opacity = 0; continue; }
    }
    s.userData.life -= dt * 3.0;
    if (s.userData.life <= 0) { s.userData.active = false; s.material.opacity = 0; continue; }
    s.position.y -= dt * 1.5;
    s.material.opacity = 0.9 * s.userData.life * (0.6 + 0.4 * Math.sin(s.userData.life * 40 + s.userData.seed * 9));
  }

  // Cryo venting: slow wisps off the vehicle while the count runs high.
  const ventOn = counting && tMinus > 20;
  for (let i = 0; i < V.vent.length; i++) {
    const s = V.vent[i];
    if (!s.userData.active) {
      if (ventOn && Math.random() < 0.08) {
        s.userData.active = true;
        s.userData.life = 1.0;
        s.position.set((Math.random() - 0.5) * 3, 6 + Math.random() * 5, (Math.random() - 0.5) * 3);
      } else { s.material.opacity = 0; continue; }
    }
    s.userData.life -= dt * 0.5;
    if (s.userData.life <= 0) { s.userData.active = false; s.material.opacity = 0; continue; }
    s.position.x += dt * 0.6;
    const sc = 1.5 + (1 - s.userData.life) * 1.5;
    s.scale.set(sc, sc, 1);
    s.material.opacity = 0.14 * Math.sin(s.userData.life * Math.PI);
  }

  updateShafts(f);

  // Still-state ground vapor: breathe in place through the count, die at
  // ignition (burned/blown off) and stay dead through ascent.
  if (V.groundFog) {
    const fogK = counting ? (1 - (V._ignK || 0)) : (1 - smooth01(f, 0, 0.04));
    const tw = (typeof V._tw === 'number' && isFinite(V._tw)) ? V._tw : 0;
    for (let i = 0; i < V.groundFog.length; i++) {
      const s = V.groundFog[i];
      if (!(fogK > 0.003)) { s.material.opacity = 0; continue; }
      const br = 0.7 + 0.3 * Math.sin(tw * 0.5 + s.userData.seed * 9);
      s.material.opacity = s.userData.base * fogK * br;
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   HIGH-FIDELITY MODULAR ROCKET STACK BUILDER
   Anchored dimensionally to NASA/manufacturer published figures.
   Produces independent, stageable meshes with proper engine clusters.
   ══════════════════════════════════════════════════════════════ */
function buildModularStack(lvId, payloadCraft) {
  const cfg = LV_STACKS[lvId] || LV_STACKS.f9;
  const root = new THREE.Group();
  root.name = 'rocket_' + lvId;

  const coreMat = new THREE.MeshStandardMaterial({
    map: createRocketSkinTexture('core'),
    roughness: 0.42, metalness: 0.28
  });
  applyPaintPBR(coreMat, 'core', paintNormalTex('core'));
  const interstageMat = new THREE.MeshStandardMaterial({
    map: createRocketSkinTexture('interstage'),
    roughness: 0.65, metalness: 0.45
  });
  applyPaintPBR(interstageMat, 'interstage', paintNormalTex('interstage'));
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 0.5, metalness: 0.7 });
  applyPaintPBR(darkMetal, 'darkMetal', null);
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.35, metalness: 0.85 });
  applyPaintPBR(nozzleMat, 'nozzle', null);
  V.nozzleMat = nozzleMat; // driven hot while burning (bells must not silhouette)
  const nozzleInnerMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 }); // Glowing throat
  const fairingExtMat = new THREE.MeshStandardMaterial({
    map: createRocketSkinTexture('fairing'),
    roughness: 0.38, metalness: 0.22, side: THREE.FrontSide
  });
  applyPaintPBR(fairingExtMat, 'fairing', paintNormalTex('fairing'));
  const fairingIntMat = new THREE.MeshStandardMaterial({
    map: createFairingInsideTexture(),
    roughness: 0.85, metalness: 0.1, side: THREE.BackSide
  });

  const stages = {
    coreGroup: new THREE.Group(),
    stage1: new THREE.Group(),
    stage2: new THREE.Group(),
    boosters: [],
    fairingPort: null,
    fairingStbd: null,
    las: null,
    payload: null,
    coreEngines: [],
    vacEngine: null,
    boosterEngines: []
  };

  const upD = cfg.upD || cfg.coreD;
  let curY = 0;

  // ── 1. STAGE 1 (Core Stage) ──
  const s1Group = stages.stage1;
  s1Group.name = 'stage_1';

  // Core fuel tank
  const coreBody = new THREE.Mesh(new THREE.CylinderGeometry(cfg.coreD / 2, cfg.coreD / 2, cfg.s1, 32), coreMat);
  coreBody.position.y = cfg.s1 / 2;
  s1Group.add(coreBody);

  // Engine heat shield / thrust structure ring at bottom
  const s1Boattail = new THREE.Mesh(new THREE.CylinderGeometry(cfg.coreD / 2, cfg.coreD * 0.46, Math.min(2.0, cfg.s1 * 0.06), 32), darkMetal);
  s1Boattail.position.y = Math.min(1.0, cfg.s1 * 0.03);
  s1Group.add(s1Boattail);

  // Multi-engine cluster nozzles at base
  const nEngines = cfg.engines || 1;
  const engR = (cfg.coreD / 2) * 0.65;
  for (let i = 0; i < nEngines; i++) {
    const eGroup = new THREE.Group();
    // Bell: ConeGeometry is apex-up / mouth-down unrotated — exactly a nozzle
    // silhouette (narrow throat into the motor, wide exit below). Do NOT flip
    // it (rotation.x = PI turns bells into down-spikes — the reported artifact).
    const bell = new THREE.Mesh(new THREE.ConeGeometry(cfg.coreD * 0.11, cfg.coreD * 0.24, 20, 1, true), nozzleMat);
    eGroup.add(bell);

    // Glowing interior throat disk
    const throat = new THREE.Mesh(new THREE.CircleGeometry(cfg.coreD * 0.06, 16), nozzleInnerMat);
    throat.rotation.x = Math.PI / 2;
    throat.position.y = cfg.coreD * 0.08;
    eGroup.add(throat);

    if (nEngines === 1) {
      eGroup.position.set(0, -cfg.coreD * 0.12, 0);
    } else if (nEngines === 9) { // Octaweb (1 center + 8 ring)
      if (i === 0) eGroup.position.set(0, -cfg.coreD * 0.12, 0);
      else {
        const a = ((i - 1) / 8) * Math.PI * 2;
        eGroup.position.set(Math.cos(a) * engR, -cfg.coreD * 0.12, Math.sin(a) * engR);
      }
    } else {
      const a = (i / nEngines) * Math.PI * 2;
      eGroup.position.set(Math.cos(a) * engR, -cfg.coreD * 0.12, Math.sin(a) * engR);
    }
    s1Group.add(eGroup);
    stages.coreEngines.push(eGroup);
  }

  // Interstage adapter section
  const interstageH = Math.min(3.5, cfg.s1 * 0.09);
  const interstage = new THREE.Mesh(new THREE.CylinderGeometry(upD / 2, cfg.coreD / 2, interstageH, 32), interstageMat);
  interstage.position.y = cfg.s1 + interstageH / 2;
  s1Group.add(interstage);

  stages.coreGroup.add(s1Group);
  curY = cfg.s1 + interstageH;

  // ── 2. BOOSTERS (SRBs or Triple Cores) ──
  if (cfg.triple) { // Falcon Heavy 3-core
    const off = cfg.coreD * 1.05;
    for (const sx of [-off, off]) {
      const bGroup = new THREE.Group();
      bGroup.name = 'side_booster_' + (sx < 0 ? 'port' : 'stbd');
      const bCore = new THREE.Mesh(new THREE.CylinderGeometry(cfg.coreD / 2, cfg.coreD / 2, cfg.s1, 32), coreMat);
      bCore.position.y = cfg.s1 / 2;
      bGroup.add(bCore);

      const nose = new THREE.Mesh(new THREE.ConeGeometry(cfg.coreD / 2, cfg.coreD * 1.4, 32), coreMat);
      nose.position.y = cfg.s1 + cfg.coreD * 0.7;
      bGroup.add(nose);

      // Booster engines
      for (let k = 0; k < 9; k++) {
        // Unrotated apex-up bells (see core engines above — flipping makes spikes).
        const be = new THREE.Mesh(new THREE.ConeGeometry(cfg.coreD * 0.10, cfg.coreD * 0.22, 16, 1, true), nozzleMat);
        const a = (k / 8) * Math.PI * 2;
        const r = (k === 0) ? 0 : engR;
        be.position.set(k === 0 ? 0 : Math.cos(a) * r, -cfg.coreD * 0.11, k === 0 ? 0 : Math.sin(a) * r);
        bGroup.add(be);
      }
      bGroup.position.set(sx, 0, 0);
      bGroup.userData = { initPos: bGroup.position.clone(), dirX: sx > 0 ? 1 : -1, dirZ: 0,
        exitY: -0.22 * cfg.coreD }; // side-core bell mouth (local metres, pre-scale)
      stages.coreGroup.add(bGroup);
      stages.boosters.push(bGroup);
    }
  } else if (cfg.srb && cfg.srb[0] > 0) { // Solid Rocket Boosters (Atlas V, Vulcan, SLS)
    const count = cfg.srb[0], srbLen = cfg.srb[1], srbDia = cfg.srb[2];
    const srbMat = new THREE.MeshStandardMaterial({ color: 0x9ba5b2, roughness: 0.45, metalness: 0.35 });
    applyPaintPBR(srbMat, 'srb', paintNormalTex('srb'));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.PI / count;
      const rad = cfg.coreD / 2 + srbDia / 2 + 0.14;
      const bGroup = new THREE.Group();
      bGroup.name = 'srb_' + i;

      const sBody = new THREE.Mesh(new THREE.CylinderGeometry(srbDia / 2, srbDia / 2, srbLen, 24), srbMat);
      sBody.position.y = srbLen / 2;
      bGroup.add(sBody);

      const sNose = new THREE.Mesh(new THREE.ConeGeometry(srbDia / 2, srbDia * 1.6, 24), srbMat);
      sNose.position.y = srbLen + srbDia * 0.8;
      bGroup.add(sNose);

      // Canted SRB nozzle bell, apex-up into the motor (unflipped — see above).
      const sNozzle = new THREE.Mesh(new THREE.ConeGeometry(srbDia * 0.42, srbDia * 0.75, 16, 1, true), nozzleMat);
      sNozzle.position.set(0, -srbDia * 0.35, 0);
      bGroup.add(sNozzle);

      bGroup.position.set(Math.cos(a) * rad, 0.4, Math.sin(a) * rad);
      bGroup.userData = { initPos: bGroup.position.clone(), dirX: Math.cos(a), dirZ: Math.sin(a),
        exitY: -0.725 * srbDia }; // SRB bell mouth (local metres, pre-scale)
      stages.coreGroup.add(bGroup);
      stages.boosters.push(bGroup);
    }
  }

  // ── 3. STAGE 2 (Upper Stage) ──
  const s2Group = stages.stage2;
  s2Group.name = 'stage_2';
  s2Group.position.y = curY;

  // Upper stage propellant tank
  const s2Body = new THREE.Mesh(new THREE.CylinderGeometry(upD / 2, upD / 2, cfg.s2, 32), coreMat);
  s2Body.position.y = cfg.s2 / 2;
  s2Group.add(s2Body);

  // Large vacuum-expansion engine nozzle bell, apex-up (unflipped — see core engines).
  const vacBell = new THREE.Mesh(new THREE.ConeGeometry(upD * 0.35, upD * 0.65, 24, 1, true), nozzleMat);
  vacBell.position.set(0, -upD * 0.32, 0);
  s2Group.add(vacBell);

  const vacThroat = new THREE.Mesh(new THREE.CircleGeometry(upD * 0.15, 16), nozzleInnerMat);
  vacThroat.rotation.x = Math.PI / 2;
  vacThroat.position.y = -upD * 0.05;
  s2Group.add(vacThroat);
  stages.vacEngine = vacBell;

  // Payload attach fitting (PAF) cone
  const pafH = Math.min(2.2, cfg.s2 * 0.2);
  const paf = new THREE.Mesh(new THREE.CylinderGeometry(upD * 0.32, upD / 2, pafH, 24), darkMetal);
  paf.position.y = cfg.s2 + pafH / 2;
  s2Group.add(paf);

  curY += cfg.s2 + pafH;

  // ── 4. PAYLOAD SPACECRAFT (Enclosed inside fairing) ──
  const payloadGroup = new THREE.Group();
  payloadGroup.name = 'payload_spacecraft';
  payloadGroup.position.y = cfg.s2 + pafH;
  payloadGroup.userData.baseY = payloadGroup.position.y; // pure-fn sep needs it

  if (payloadCraft && payloadCraft.isObject3D) {
    const clone = payloadCraft.clone(true);
    // Scale payload down to fit comfortably inside fairing
    const b = new THREE.Box3().setFromObject(clone);
    const sz = b.getSize(new THREE.Vector3());
    const fitScale = (upD * 0.65) / Math.max(sz.x, sz.y, sz.z, 1);
    clone.scale.setScalar(fitScale);
    clone.position.y = (sz.y * fitScale) / 2;
    payloadGroup.add(clone);
  } else {
    // Sleek representative satellite bus with golden foil & folded arrays
    const busMat = new THREE.MeshStandardMaterial({ color: 0xc89632, metalness: 0.85, roughness: 0.25 });
    applyPaintPBR(busMat, 'gold', paintNormalTex('gold'));
    const bus = new THREE.Mesh(new THREE.BoxGeometry(upD * 0.45, upD * 0.6, upD * 0.45), busMat);
    bus.position.y = upD * 0.35;
    payloadGroup.add(bus);

    // Stowed solar panels on sides
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x14203d, roughness: 0.3, metalness: 0.6 });
    applyPaintPBR(panelMat, 'steel', null);
    for (const sx of [-upD * 0.26, upD * 0.26]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, upD * 0.55, upD * 0.38), panelMat);
      sp.position.set(sx, upD * 0.35, 0);
      payloadGroup.add(sp);
    }
    // High gain antenna dish
    const dish = new THREE.Mesh(new THREE.ConeGeometry(upD * 0.22, upD * 0.12, 20, 1, true), darkMetal);
    dish.position.set(0, upD * 0.72, 0);
    payloadGroup.add(dish);
  }
  stages.payload = payloadGroup;
  s2Group.add(payloadGroup);

  // ── 5. PAYLOAD FAIRING (Split Clamshell Halves) ──
  if (cfg.fair) {
    const fl = cfg.fair[0], fd = cfg.fair[1];
    const nose = Math.min(fl * 0.38, fd * 1.3);
    const barrel = fl - nose;

    // Build Port & Starboard clamshell halves using half-cylinders and half-cones
    function makeFairingHalf(isPort) {
      const g = new THREE.Group();
      const startAngle = isPort ? 0 : Math.PI;

      // Half-cylinder barrel
      const cGeo = new THREE.CylinderGeometry(fd / 2, fd / 2, barrel, 24, 1, true, startAngle, Math.PI);
      const cExt = new THREE.Mesh(cGeo, fairingExtMat);
      const cInt = new THREE.Mesh(cGeo, fairingIntMat);
      cExt.position.y = barrel / 2; cInt.position.y = barrel / 2;
      g.add(cExt); g.add(cInt);

      // Half-cone nose cap (ogive approximation)
      const nGeo = new THREE.ConeGeometry(fd / 2, nose, 24, 1, true, startAngle, Math.PI);
      const nExt = new THREE.Mesh(nGeo, fairingExtMat);
      const nInt = new THREE.Mesh(nGeo, fairingIntMat);
      nExt.position.y = barrel + nose / 2; nInt.position.y = barrel + nose / 2;
      g.add(nExt); g.add(nInt);

      return g;
    }

    const fairingAnchor = new THREE.Group();
    fairingAnchor.name = 'fairing_assembly';
    fairingAnchor.position.y = cfg.s2 + pafH;

    const fPort = makeFairingHalf(true);
    fPort.name = 'fairing_port';
    fPort.userData = { dirX: 1 };
    fairingAnchor.add(fPort);
    stages.fairingPort = fPort;

    const fStbd = makeFairingHalf(false);
    fStbd.name = 'fairing_stbd';
    fStbd.userData = { dirX: -1 };
    fairingAnchor.add(fStbd);
    stages.fairingStbd = fStbd;

    s2Group.add(fairingAnchor);
    curY += fl;
  } else if (cfg.capsule) {
    // Orion crew module + Launch Escape System (SLS)
    const cm = new THREE.Mesh(new THREE.CylinderGeometry(upD * 0.32, upD / 2, cfg.capsule * 0.35, 24), coreMat);
    cm.position.y = cfg.s2 + pafH + cfg.capsule * 0.18;
    s2Group.add(cm);

    const las = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, cfg.capsule * 0.65, 16), darkMetal);
    las.position.y = cfg.s2 + pafH + cfg.capsule * 0.35 + cfg.capsule * 0.32;
    las.userData.initY = las.position.y;
    s2Group.add(las);
    stages.las = las;
  }

  stages.coreGroup.add(s2Group);
  root.add(stages.coreGroup);

  // P1 true-scale (fixed site): the stack builds in METRES and is scaled ONCE
  // by the fixed site conversion SITE_VK (SLS-canonical 1/9.95 u/m) — never
  // normalized per vehicle. Heights vary truthfully (SLS ~12u, F9 ~7.5u,
  // Atlas 401 ~6.4u); the ML/site NEVER rescales. Seated on the FIXED site
  // deck plate (SITE_DECK_Y). Cameras stay vehicle-invariant by design —
  // smaller vehicles correctly appear smaller (physical vs display vs camera
  // scales are now distinct; see LAUNCH_EXPERT_HANDOFF).
  try {
    root.scale.setScalar(SITE_VK);
    const box2 = new THREE.Box3().setFromObject(root);
    root.position.y = SITE_DECK_Y - box2.min.y; // bells rest on the fixed deck
  } catch (e) {}

  root.userData.stages = stages;
  root.userData.baseY = root.position.y;
  V.stages = stages;

  // Build high-realism exhaust plumes
  buildExhaustPlumes(root, stages, cfg);

  return root;
}

/* ══════════════════════════════════════════════════════════════
   HIGH-REALISM EXHAUST PLUMES (Core, Vacuum & Booster Plumes)
   ══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   CUSTOM EXHAUST PLUMES — steep cone + lateral-space ragged edge
   (rendering-expert design, see plans_notes/FLAME_RENDER_BRIEF.md).
   One hollow cone mesh + one axis-glued glow billboard per burn source.
   Edge threshold lives in LATERAL space r=sqrt(1-ndv²) with domain-warped
   near-isotropic FBM + travelling cauliflower vertex lobes; color comes
   from one intensity through 1-exp(-I·mid), white driven by I itself.
   WebGL1-style GLSL, no textures, no post chain, no deps.
   ══════════════════════════════════════════════════════════════ */
const PLUME_VERT = [
  'uniform float uTime, uWobble, uExpand;',
  'varying vec3 vLocal; varying float vAx; varying vec3 vN; varying vec3 vV;',
  'void main(){',
  '  float v = 1.0 - uv.y;',
  '  vec3 p = position;',
  // steady geometry: flare + taper only, all life lives in the fragment
  '  float flare = 1.0 + (uExpand - 1.0) * (1.0 - exp(-3.0 * v));',
  '  float taper = 1.0 - 0.55 * smoothstep(0.6, 1.0, v);',
  '  p.xz *= flare * taper;',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  vLocal = p; vAx = v;',
  '  vN = normalize(normalMatrix * normal);',
  '  vV = normalize(-mv.xyz);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');
const PLUME_FRAG = [
  'float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
  'float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);',
  '  float a = hash21(i); float b = hash21(i+vec2(1.0,0.0));',
  '  float c = hash21(i+vec2(0.0,1.0)); float d = hash21(i+vec2(1.0,1.0));',
  '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }',
  'float fbm4(vec2 p){ float v = 0.0; float a = 0.5;',
  '  for(int i=0;i<4;i++){ v += a*vnoise(p); p *= 2.03; a *= 0.5; } return v; }',
  'uniform float uTime, uThrottle, uExposure;',
  'uniform float uTurb, uSoft;',
  'uniform vec3 uMidCol;',
  'uniform vec3 uCoreCol;',
  'varying vec3 vLocal; varying float vAx; varying vec3 vN; varying vec3 vV;',
  'void main(){',
  '  float v   = vAx;',
  '  float ndv = abs(dot(normalize(vN), normalize(vV)));',
  '  float r   = sqrt(max(0.0, 1.0 - ndv * ndv));',
  '  float q   = r * 1.4;',
  '  vec2  c   = normalize(vLocal.xz + 1e-5);',
  '  float T   = uTime;',
  // near-isotropic puffs: ~14 cycles down the length ≈ 1.7 per plume width
  '  vec2 p1 = vec2(c.x*2.0 + c.y*1.1 + T*0.8, v*5.0  - T*18.0);',
  '  vec2 p2 = vec2(c.y*3.7 - c.x*2.3 - T*1.1, v*12.0 - T*28.0);',
  '  float n1 = fbm4(p1);',
  '  float n2 = fbm4(p2 + n1*1.5);',
  '  float nm = 0.6*n1 + 0.4*n2;',
  '  float pulse = 0.90 + 0.20 * vnoise(vec2(T*30.0 - v*9.0, 3.7));',
  // big cauliflower bulges on the limb (low-freq, large amplitude, grows downstream)
  '  float f = exp(-(q*q*q));',
  '  float s = mix(0.12, 0.40, smoothstep(0.0, 0.5, v)) * uTurb;',
  '  float J = f * (1.0 + s*(nm - 0.5)*2.0) * pulse;',
  '  J *= exp(-1.8 * v);',
  '  J *= 0.45 + 0.65*uThrottle;',
  '  J *= 1.0 + 0.10 * pow(0.5 + 0.5*cos(v*38.0), 4.0) * exp(-4.0*v) * (1.0 - r);',
  '  J *= 1.0 - smoothstep(0.75, 1.0, v + 0.30*r + (n2 - 0.5)*0.15);',
  '  float w = 0.04 * uSoft;',
  '  float a = smoothstep(0.34 - w, 0.34 + w, J) * (1.0 - smoothstep(0.88, 0.99, r));',
  '  if (a < 0.004) discard;',
  // intensity: very hot core, fades with distance from nozzle and from the axis
  '  float I = uExposure * J;',
  // per-channel tonemap for the orange limb, then drive WHITE from intensity itself
  '  vec3 col = 1.0 - exp(-I * uMidCol);',
  '  float white = smoothstep(1.2, 3.2, I);',
  '  col = mix(col, uCoreCol, white);',
  '  col += white * 0.12;',
  '  gl_FragColor = vec4(col, a);',
  '}'
].join('\n');
/* ---- v2 plume vertex (expert patch v7): exact lateral coordinate via
   camera-in-mesh-local (no normal-based ndv, no front/back face mismatch).
   `inverse()` needs GLSL ES 3.00 — three r160 compiles ShaderMaterial for
   WebGL2; if the program fails to link, fall back to camera-uniform (see brief). */
const PLUME_VERT2 = [
  'uniform float uExpand;',
  'varying vec3 vLocal; varying float vAx; varying vec3 vDir;',
  'void main(){',
  '  float v = 1.0 - uv.y;',
  '  vec3 p = position;',
  '  float flare = 1.0 + (uExpand - 1.0) * (1.0 - exp(-3.0 * v));',
  '  float taper = 1.0 - 0.55 * smoothstep(0.6, 1.0, v);',
  '  p.xz *= flare * taper;',
  '  vec3 camL = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;',
  '  vLocal = p; vAx = v; vDir = p - camL;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
  '}'
].join('\n');

/* ---- v2 plume fragment (expert patch v7): shape/brightness separated —
   silhouette follows cone geometry, brightness only colors. MAX-blend-ready
   premultiplied output. See plans_notes/BOOSTER_PLUME_EXPERT_BRIEF.md. */
const PLUME_FRAG2 = [
  'float hash21(vec2 p){',
  '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
  '  p3 += dot(p3, p3.yzx + 33.33);',
  '  return fract((p3.x + p3.y) * p3.z); }',
  'float vnoise(vec2 p){',
  '  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);',
  '  vec2 i0 = mod(i, 256.0); vec2 i1 = mod(i + 1.0, 256.0);',
  '  float a = hash21(i0); float b = hash21(vec2(i1.x, i0.y));',
  '  float c = hash21(vec2(i0.x, i1.y)); float d = hash21(i1);',
  '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }',
  'float fbm4(vec2 p){ float v = 0.0; float a = 0.5;',
  '  for(int i=0;i<4;i++){ v += a*vnoise(p); p *= 2.03; a *= 0.5; } return v; }',
  'uniform float uTime, uThrottle, uExposure, uTurb, uSoft, uEdge, uAspect, uDecay, uSat, uNarrow;',
  'uniform vec3 uMidCol;',
  'uniform vec3 uCoreCol;',
  'varying vec3 vLocal; varying float vAx; varying vec3 vDir;',
  'void main(){',
  '  float v = vAx;',
  '  vec3 d = normalize(vDir);',
  '  float rs = max(length(vLocal.xz), 1e-4);',
  // exact lateral position across the silhouette, [-1,1]; floor keeps end-on views sane
  '  float lat = (vLocal.x*d.z - vLocal.z*d.x) / max(length(d.xz), 0.25);',
  '  float x = clamp(lat / rs, -1.0, 1.0);',
  '  float r = abs(x);',
  '  float T = uTime;',
  // isotropic cells: axial frequency = lateral frequency * (length / width)
  '  vec2 p1 = vec2(x*1.4 + T*0.8, v*uAspect*1.4 - T*14.0);',
  '  vec2 p2 = vec2(x*3.0 - T*1.1, v*uAspect*3.0 - T*24.0);',
  '  float n1 = fbm4(p1);',
  '  float n2 = fbm4(p2 + n1*1.5);',
  '  float nm = 0.6*n1 + 0.4*n2;',
  '  float pulse = 0.90 + 0.20 * vnoise(vec2(T*30.0 - v*9.0, 3.7));',
  '  float q = r * 1.4;',
  '  float f = exp(-(q*q*q));',
  '  float s = mix(0.12, 0.50, smoothstep(0.0, 0.5, v)) * uTurb;',
  '  float body = f * (1.0 + s*(nm - 0.5)*3.5) * pulse;',
  // soft tip: dissolves outer edge first, but never a needle
  '  float tipF = 1.0 - smoothstep(0.70, 1.0, v + 0.15*r + (n2 - 0.5)*0.20);',
  // SHAPE: geometry-driven, gentle narrowing only (v9: uNarrow, was fixed 0.9)
  '  float shape = body * exp(-uNarrow*v) * (0.9 + 0.1*uThrottle) * (0.6 + 0.4*tipF);',
  '  float w = 0.04 * uSoft;',
  '  float a = smoothstep(uEdge - w, uEdge + w, shape)',
  '          * (1.0 - smoothstep(0.88, 0.99, r)) * pow(tipF, 0.6);',
  '  if (a < 0.004) discard;',
  // INTENSITY: axial fade, throttle, stationary shock cells, hot axial jet
  '  float shock   = 1.0 + 0.10 * pow(0.5 + 0.5*cos(v*38.0), 4.0) * exp(-4.0*v) * (1.0 - r);',
  '  float hotCore = 1.0 + 0.25 * exp(-(r*2.2)*(r*2.2)) * exp(-3.0*v);',
  '  float I = uExposure * body * exp(-uDecay*v) * (0.45 + 0.65*uThrottle) * tipF * shock * hotCore;',
  // saturate the limb toward orange (plain 1-exp(-I*mid) reads tan at mid intensity)
  '  vec3 m = uMidCol * (1.0 - uSat + uSat * uMidCol);',
  '  vec3 col = 1.0 - exp(-I * m);',
  '  float white = smoothstep(1.2, 3.2, I);',
  '  col = mix(col, uCoreCol, white);',
  '  col = clamp(col, 0.0, 1.0) * a;',
  '  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0 * a;',
  '  gl_FragColor = vec4(col, a);',
  '}'
].join('\n');
function makePlumeMesh(o) {
  const over = 1.4; // edge sits at R≈0.72 of mesh radius, so true radii are preserved
  const v2 = !!o.v2;
  const geo = new THREE.CylinderGeometry(o.topR * over, o.botR * over, o.len, 32, v2 ? 32 : 16, true);
  const soft0 = o.soft != null ? o.soft : (o.vac ? 3.5 : 1.0);
  const aspect = o.len / (((o.topR + o.botR) * 0.5) * over); // v8: length in mean radii
  const params = {
    vertexShader: v2 ? PLUME_VERT2 : PLUME_VERT,
    fragmentShader: v2 ? PLUME_FRAG2 : PLUME_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uThrottle: { value: 1 },
      uWobble: { value: o.wobble != null ? o.wobble : 0.12 },
      uExpand: { value: 1 },
      uCoreCol: { value: new THREE.Color(o.core) },
      uMidCol: { value: new THREE.Color(o.mid) },
      uExposure: { value: o.exposure != null ? o.exposure : 5.5 },
      uTurb: { value: o.vac ? 0.35 : 1.0 },
      uSoft: { value: soft0 },
      uEdge: { value: o.edge != null ? o.edge : 0.34 },
      uAspect: { value: aspect },
      uDecay: { value: o.decay != null ? o.decay : 0.7 },
      uSat: { value: o.sat != null ? o.sat : 0.35 },
      uNarrow: { value: o.narrow != null ? o.narrow : 0.35 }
    },
    transparent: true, depthWrite: false, depthTest: true
  };
  if (v2) {
    params.side = THREE.FrontSide;
    params.blending = THREE.CustomBlending;
    params.blendEquation = THREE.MaxEquation; // factors are ignored by GL MAX
    params.blendSrc = THREE.OneFactor;
    params.blendDst = THREE.OneFactor;
  } else {
    params.side = THREE.DoubleSide;
    params.blending = THREE.AdditiveBlending;
  }
  const mat = new THREE.ShaderMaterial(params);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -o.len / 2; // top of cone sits at group origin (nozzle)
  m.frustumCulled = false;
  m.userData.plume = true;
  m.userData.v2 = v2;
  m.userData.soft0 = soft0;
  m.userData.flow = o.flow != null ? o.flow : 1;
  return m;
}
function drivePlume(m, tSec, throttle, expand) {
  if (!m || m.userData.glow || !m.material || !m.material.uniforms) return;
  const u = m.material.uniforms;
  if (!u.uTime) return; // glow quads share the group child list
  u.uTime.value = tSec * (m.userData.flow || 1); // per-type advection speed
  u.uThrottle.value = throttle;
  if (expand != null) {
    u.uExpand.value = expand;
    // v2 only: edge softens with altitude blossom (high-altitude plumes diffuse
    // instead of keeping a sea-level sharp rim). Legacy plumes unchanged.
    if (m.userData.v2) u.uSoft.value = m.userData.soft0 * (1 + 0.5 * Math.max(0, expand - 1));
  }
  if (expand != null) u.uExpand.value = expand;
}
function disposePlume(m) {
  try { if (m.geometry) m.geometry.dispose(); } catch (e) {}
  try { if (m.material) m.material.dispose(); } catch (e) {}
}
/* Console check (expert patch v8 — call manually, allocates, never per-frame).
   Axis error above ~0.5° confirms hardware/rocket orientation mismatch. */
function debugPlumeAxis() {
  const S = V.stages;
  if (!S || !S.stage1 || !V.corePlume) return;
  const q = new THREE.Quaternion();
  const a = new THREE.Vector3(0, -1, 0).applyQuaternion(S.stage1.getWorldQuaternion(q));
  const b = new THREE.Vector3(0, -1, 0).applyQuaternion(V.corePlume.quaternion);
  console.log('core plume axis error (deg):', THREE.MathUtils.radToDeg(a.angleTo(b)).toFixed(2));
}
/* Emissive nozzle disc (expert patch v8): the bell mouth seen from
   below/oblique shows a dark cap between body and open-topped flame shell.
   A hot face-down disc just under the exit plane fills it and hands over to
   the flame. Front-side only → invisible edge-on, side views unchanged.
   (drivePlume skips it: MeshBasicMaterial has no .uniforms.) */
/* Axial core shaft (plume de-clip-Jan26): a capped inner body inside the hollow
   shell, shaded in LOCAL space (radial × axial fade, no view dependence), so
   it reads from every angle — side views gain a hot spine joining bells to
   halo (no more detached ball), near-axis/top-down views see a bright throat
   disc instead of nothing. drivePlume feeds it uTime/uThrottle/uExpand like
   any plume mesh (uniforms present); stop() frees it via disposePlume. */
const AXIAL_VERT = [
  'varying float vR; varying float vY;',
  'void main(){',
  '  vR = length(position.xz);',
  '  vY = position.y;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');
const AXIAL_FRAG = [
  'uniform float uTime, uThrottle, uExpand, uLen, uRad;',
  'varying float vR; varying float vY;',
  'void main(){',
  '  float v = clamp(-vY / max(uLen, 1e-4), 0.0, 1.0);', // 0 nozzle → 1 tail
  '  float rr = clamp(vR / max(uRad, 1e-4), 0.0, 1.0);',
  '  float n = 0.85 + 0.15 * sin(uTime * 7.0 + v * 20.0) * sin(uTime * 5.3 + v * 13.0);',
  '  float a = (1.0 - rr) * (1.0 - rr) * pow(1.0 - v, 1.8);',
  '  a *= (0.35 + 0.65 * uThrottle) * n * 0.75;',
  '  if (a < 0.004) discard;',
  '  vec3 col = mix(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.55, 0.20), smoothstep(0.0, 0.75, v));',
  '  gl_FragColor = vec4(col * a, a);',
  '}'
].join('\n');
function makeAxialCore(topR, len) {
  const geo = new THREE.CylinderGeometry(topR * 0.5, topR * 1.1, len * 0.45, 20, 8, false);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uThrottle: { value: 1 }, uExpand: { value: 1 },
      uLen: { value: len * 0.45 }, uRad: { value: topR * 1.1 }
    },
    vertexShader: AXIAL_VERT, fragmentShader: AXIAL_FRAG,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -len * 0.225; // top cap at the nozzle, tail down the shell
  m.frustumCulled = false;
  m.renderOrder = 1;
  m.userData.axial = true;
  m.userData.flow = 1;
  return m;
}
function makeNozzleDisc(radius) {
  const geo = new THREE.CircleGeometry(radius, 28);
  geo.rotateX(Math.PI / 2); // normal +Z -> -Y (faces down the plume)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff1dc, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    depthWrite: false, depthTest: true, toneMapped: false
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -radius * 0.04; // just below the cap, no z-fight
  m.frustumCulled = false;
  m.renderOrder = 1;
  m.userData.disc = true;
  return m;
}
/* Procedural capsule glow: one axis-glued billboard quad per burn source.
   Placement is a plain camera-facing billboard (rasterizes everywhere);
   the FALLOFF is keyed to the plume axis (world-space lateral + axial),
   so the bright core stays glued to a tilted flame through the gravity
   turn. Child of the plume group/mesh, so visibility inherits automatically. */
/* v2 GLOW_VS (expert patch v7): camera-facing SQUARE centred on the visible
   flame segment (half-extent E = Lv/2 + reach) — fixes the old centre applying
   group y-scale twice (drift by sy²), lower-halo clipping, and sideways
   clipping on tilted flames. Any boundary point sits ≥ reach from the segment,
   so the k-fade is exactly 0 there (no invisible wall). Plain world-space
   projection (no clip-space hand-building). */
const GLOW_VS = `
uniform float uLen, uReach, uVis;
varying vec3 vRel; varying float vAx;
void main(){
  vec3 rightW = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 upW    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 nc  = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 axW = (modelMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz;
  axW = axW / max(length(axW), 1e-4);
  float Lv = uLen * uVis;
  float E  = Lv * 0.5 + uReach;
  vec3 mid = nc + axW * (Lv * 0.5);
  vec3 wp  = mid + rightW * (position.x * 2.0 * E) + upW * (position.y * 2.0 * E);
  vec3 rel = wp - nc;
  float ax = dot(rel, axW);
  vRel = rel - axW * ax;
  vAx  = ax;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
/* v2 GLOW_FS (expert patch v7): heat segment is Lv = uLen·uVis (v2 plumes pass
   0.85, so the halo ends where the visible flame dissolves, not the geometric
   tip). uVis = 1.0 reproduces the old falloff exactly (F9 path). */
const GLOW_FS = `
uniform float uLen, uReach, uR0, uGlow, uVis;
uniform vec3 uTint;
uniform vec3 uNear; // v9: near-field tint (peach-pink on multi, warm white legacy)
varying vec3 vRel; varying float vAx;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  float Lv = max(uLen * uVis, 1e-4);
  float s = vAx;
  float sc = clamp(s, 0.0, Lv);
  float an = clamp(s / Lv, -0.5, 1.5);
  // glow wears the flame's shape: cross-section follows the cone flare
  // (narrow at the nozzle, wider downstream)…
  float r0 = uR0 * (1.0 + clamp(an, 0.0, 1.5) * 1.8);
  // Above the exit plane (s<0): pinch laterally into a short tongue hugging
  // the body and fade it gradually over 0.45 flame lengths. The old 0.15
  // cutoff ended while still bright AND full-width, so its boundary read as
  // a straight horizontal shelf spreading from the nozzle (owner shot) —
  // worse x3 when core + 2 SRB halos stack. Zero-derivative fades both ends.
  float above = clamp(-s / max(uLen * 0.45, 1e-4), 0.0, 1.0);
  float latW = length(vRel) * (1.0 + above * 3.0);
  float d = length(vec2((s < 0.0) ? latW : length(vRel), s - sc));
  float g  = 1.0 / (1.0 + (d/r0)*(d/r0));
  float ge = 1.0 / (1.0 + (uReach/uR0)*(uReach/uR0));
  g = max(0.0, g - ge) / (1.0 - ge);
  float k = 1.0 - smoothstep(0.55*uReach, uReach, d);
  g *= k * k * (1.0 - smoothstep(0.0, 1.0, above));
  // …and the heat profile: hottest at the flame top, decaying downstream,
  // fast fade above the nozzle.
  float ae = exp(-2.0 * clamp(an, 0.0, 1.5)) * exp(-4.0 * clamp(-an*2.0, 0.0, 1.0));
  vec3 col = mix(uNear, uTint, smoothstep(0.0, 0.5, d/uReach)) * g * uGlow * (0.15 + 0.85*ae);
  col += (h(gl_FragCoord.xy) - 0.5) / 255.0;
  // Edge fade rides in ALPHA, not just color: alpha 1.0 rasterized the whole
  // quad (plus dither noise) over black sky — the reported "invisible wall"
  // rectangle. Additive blending multiplies by alpha, so corners now vanish.
  gl_FragColor = vec4(col, k);
}`;
const _C_GLOW_WARM = new THREE.Color(1.0, 0.55, 0.50);
const _C_FIRE_IGN = new THREE.Color(0xff6a10); // ignition orange (preallocated: no per-frame alloc)
const _C_FIRE_MAIN = new THREE.Color(0xffa834); // main-burn amber
const _C_SMOKE_BASE = new THREE.Color(0xffffff); // far smoke: texture gray as-is
const _C_SMOKE_HOT = new THREE.Color(0xff9a50); // flame-side: lit from below
const _C_GLOW_HIGH = new THREE.Color(0.62, 0.66, 1.0);
function makeGlowMesh(len, nozR, tint, vis) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLen: { value: len }, uReach: { value: len * 0.9 }, uR0: { value: nozR * 4.5 },
      uGlow: { value: 1.4 }, uTint: { value: new THREE.Color(tint) },
      uNear: { value: new THREE.Color(1.0, 0.92, 0.86) }, // default = old look (F9 safe)
      uVis: { value: vis != null ? vis : 1.0 }
    },
    vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, toneMapped: false
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.frustumCulled = false;
  m.renderOrder = 5;
  m.userData.glow = true;
  return m;
}
/* Volumetric floodlight shaft (Chapman "good-enough" cone, Etienne port notes
   above): apex at the lamp head (uv.y=1), opening onto the SpotLight pool.
   Axial fade (bright head → melt into pool) × fresnel edge fade (soft
   silhouette, no hard cone walls) × slow drift noise (smoke feel). Additive,
   depth-tested so the vehicle occludes correctly; depthWrite off. */
const SHAFT_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const SHAFT_FS = `
uniform vec3 uColor; uniform float uBoost, uTime, uSeed;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float axial = pow(clamp(vUv.y, 0.0, 1.0), 1.3);
  axial *= smoothstep(0.0, 0.18, vUv.y);
  float rim = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(rim, 2.2) + 0.25 * pow(rim, 0.9);
  float n = 0.9 + 0.1 * sin(uTime * 0.6 + vUv.y * 9.0 + uSeed)
    * sin(uTime * 0.37 + vUv.x * 12.0 + uSeed * 1.7);
  float a = axial * edge * n * uBoost;
  a += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(uColor * a, a);
}`;
function makeShaftMesh(len, farR, color, boost, seed) {
  const g = new THREE.CylinderGeometry(0.18, farR, len, 24, 12, true);
  g.translate(0, -len / 2, 0); // apex (head) at local origin, opens down -Y
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uBoost: { value: boost }, uTime: { value: 0 }, uSeed: { value: seed }
    },
    vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: false
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 4;
  m.userData.base = boost;
  return m;
}
/* Eye adaptation (flow-plan Phase 1 + expert T+12 handoff): the night pad
   exposes for dark (1.35) but the flame is orders brighter — without
   adaptation the fireball clips to flat white. Close fast at ignition (~8/s),
   reopen slowly (~0.35/s), driven by the fire light the plume pass already
   owns. The adaptive core keeps calculating every frame; the handoff release
   only blends its influence (MET 12–16), never restarts state. dt-guarded,
   zero allocation. */
function updateExposure(sdt, f) {
  if (!V.renderer) return;
  const dt = (isFinite(sdt) && sdt > 0) ? Math.min(sdt, 0.05) : 0.016;
  if (!isFinite(V._expA)) V._expA = 1.35;
  const fl = V.fireLight ? V.fireLight.intensity : 0;
  const flame01 = Math.max(0, Math.min(1, fl / 650));
  const target = 1.35 - 0.80 * flame01; // full flame → 0.55 (fireball must grade, not clip)
  const rate = target < V._expA ? 8 : 0.35; // slow reopen carries the glory uphill
  V._expA = V._expA + (target - V._expA) * (1 - Math.exp(-dt * rate));
  let out = V._expA;
  try {
    // Intro look locked (owner): hold 0.55 flat through the bell-close
    // window — no adaptation breathing while this angle plays. Look-back
    // holds 0.5 (close-range detail over white-out). Past MET 12/16 the live
    // value blends back in (expert handoff).
    if (isFinite(f)) {
      const endMet = Math.max(1, profileFor(V.lvId).endMet);
      if (f < 12 / endMet) out = 0.55;
      else if (f < 60 / endMet) out = 0.45;
      else {
        const met = f * endMet;
        if (met < 16) out = 0.55 + (V._expA - 0.55) * smooth01(met, 12, 16);
      }
    }
  } catch (e) {}
  V.renderer.toneMappingExposure = out;
}
/* Shaft lifecycle: full during the count + ignition beat, out by f 0.2 (same
   tail as skyGlow — the look-back keeps its lit pad). Off by day.
   Uniform writes only — zero allocation. Called from updatePadFx. */
function updateShafts(f) {
  if (!V.shafts || !V.shafts.length) return;
  const dayF = (V.sun && isFinite(V.sun.dayF)) ? V.sun.dayF : 0;
  const fade = (1 - smooth01(f, 0.02, 0.2)) * (dayF > 0.001 ? 0 : 1);
  const t = performance.now() * 0.001;
  for (let i = 0; i < V.shafts.length; i++) {
    const m = V.shafts[i];
    if (!m || !m.material || !m.material.uniforms) continue;
    const on = fade > 0.003;
    m.visible = on;
    if (!on) continue;
    m.material.uniforms.uBoost.value = m.userData.base * fade;
    m.material.uniforms.uTime.value = t;
  }
  // Head flares share one material: opacity follows the shaft fade with a
  // faint breathing pulse (bloom feel, no lens dirt). Frozen in reduced motion.
  const still = (V.countS || COUNT_S) < COUNT_S;
  try {
    if (V._flareMat) V._flareMat.opacity = 0.35 * fade * (still ? 1 : (0.92 + 0.08 * Math.sin(t * 2.1)));
  } catch (e) {}
  if (V.shafts) {
    const fs = 1.0 * (still ? 1 : (0.96 + 0.04 * Math.sin(t * 2.1 + 0.7)));
    for (let i = 0; i < V.shafts.length; i++) {
      const m = V.shafts[i];
      if (m && m.children && m.children[0] && m.children[0].isSprite) m.children[0].scale.set(fs, fs, 1);
    }
  }
}
/* Core-engine tint by propellant. Subtle — readability first, chemistry second. */
function plumeTintFor(lvId) {
  switch (lvId) {
    case 'sls': return { core: 0xf4f7ff, mid: 0xffa050 }; // hydrolox core, SRB orange
    case 'vc4': case 'vc6': case 'ng': return { core: 0xe8efff, mid: 0x8fa8ff }; // methalox pale blue
    default: return { core: 0xffffff, mid: 0xff9961 }; // kerolox / solids edge color
  }
}

/* Shared halo budget (expert patch v7): N motors = N halos summing linearly
   on the same pixels. Share ~1/(1+0.45(N−1)): SLS (3 sources) → 0.53 each
   (total 1.6× a single halo — still reads bigger than a lone core), Atlas 551
   (6) → 0.31 each. No-op on single-core stacks (F9 untouched). Zero allocation.
   Call AFTER all uGlow values are written (they are rewritten every frame). */
function applyGlowBudget() {
  const bp = V.boosterPlumes;
  if (!bp || !bp.length) return;
  const c = V.corePlume;
  let n = (c && c.visible) ? 1 : 0;
  for (let i = 0; i < bp.length; i++) if (bp[i] && bp[i].visible) n++;
  if (n < 2) return;
  const share = 1 / (1 + 0.45 * (n - 1));
  if (c && c.visible && c.userData.glow) c.userData.glow.material.uniforms.uGlow.value *= share;
  for (let i = 0; i < bp.length; i++) {
    const b = bp[i];
    if (b && b.visible && b.userData.glow) b.userData.glow.material.uniforms.uGlow.value *= share;
  }
}
function buildExhaustPlumes(rocket, stages, cfg) {
  const tint = plumeTintFor(V.lvId);
  // P1 true-scale: fixed site scale SITE_VK for every vehicle (SLS-canonical).
  // Size every plume off the real nozzle diameters so cones track each
  // vehicle's true scale — SLS/Saturn vs Falcon stay proportional.
  const k = (rocket && rocket.scale && isFinite(rocket.scale.x) && rocket.scale.x > 0)
    ? rocket.scale.x : SITE_VK;
  const dispR = (d) => Math.max(0.08, (d * 0.5) * k); // metres diameter -> display radius
  const coreR = dispR(cfg.coreD);
  // v2 shaders (expert patch v7) on multi-motor stacks only: Falcon 9 / Atlas
  // 401 / New Glenn / Saturn V keep the validated legacy path (multi=false).
  // To A/B the new look on F9, set multi = true locally.
  const multi = !!(stages.boosters && stages.boosters.length > 0);
  const vis = multi ? 0.85 : 1.0; // v2 halo length: ends where flame dissolves

  // 1. Core Stage 1 plume: steep cone pinned at the nozzle exit plane.
  const corePlumeGroup = new THREE.Group();
  corePlumeGroup.name = 'core_plume';
  // v8 reference match (multi only — F9 keeps 65·k/legacy look): the real plume
  // runs well past 2× the stack. Glow/smoke/uLen follow userData.len.
  const coreLen = (multi ? 100 : 65) * k;
  corePlumeGroup.userData.len = coreLen; // flame length for smoke-at-tip spawn
  // Bell mouth in stage1-local metres (engine groups at −0.12·coreD, bell half
  // height 0.12·coreD): the flame must start AT the exit, never at a magic
  // offset (the old −0.2 left a dark nozzle gap — the reported detachment).
  corePlumeGroup.userData.exitY = -0.24 * cfg.coreD;
  const coreMesh = makePlumeMesh({
    // Root meets the body: topR 1.4× (expert handoff: +12% shroud so dark
    // mouths stop silhouetting — anchor untouched, coverage only).
    topR: coreR * 1.4, botR: coreR * (multi ? 3.0 : 2.0), len: coreLen,
    // v8 (multi): near-white column, crisp lumpy edge. F9 keeps its tuned look.
    core: multi ? 0xe4f1ff : tint.core, mid: tint.mid,
    exposure: multi ? 7.0 : 2.8, wobble: 0.22, flow: 1.0,
    soft: multi ? 0.6 : 1.6, // widened edge ramp: the 0.04 edge drew a hard ball rim that read as detached
    decay: 0.7, sat: 0.35,
    v2: multi
  });
  corePlumeGroup.add(coreMesh);
  corePlumeGroup.add(makeNozzleDisc(coreR * 1.05)); // exit-plane handover, widened with the shroud (v8)
  // Throat sprite: axis-independent hot root. The hollow shell (ndv→0), the
  // down-facing disc (culled) and the axis-falloff glow all vanish looking
  // straight down the plume — a camera-facing sprite always rasterizes, so
  // near-axis views keep a bright throat instead of nothing. Own material
  // (shared flare texture); drivePlume skips it (no uniforms); stop() frees
  // the material, never the shared texture. Inherits group visibility (MECO).
  try {
    const throatTex = V._flareTex || getDotTex();
    const throatMat = new THREE.SpriteMaterial({ map: throatTex, color: 0xffd9a0,
      blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85,
      depthWrite: false, depthTest: true, toneMapped: false });
    const throat = new THREE.Sprite(throatMat);
    const ts = Math.max(0.3, coreR * 6);
    throat.scale.set(ts, ts, 1);
    throat.position.y = -coreR * 0.3; // hug the exit plane
    throat.renderOrder = 2;
    throat.userData.throat = true;
    corePlumeGroup.add(throat);
  } catch (e) {}
  corePlumeGroup.add(makeAxialCore(coreR * 1.4, coreLen)); // spine bells→halo, all angles
  V.fireMeshes.push(coreMesh);
  // Procedural capsule glow in the same group (nozzle origin).
  const coreGlow = makeGlowMesh(coreLen, coreR * 0.95, 0xff7a45, vis);
  coreGlow.material.uniforms.uTint.value.copy(_C_GLOW_WARM);
  // v9 pink near-field band (multi only — reference halo hugs peach-pink).
  if (multi) coreGlow.material.uniforms.uNear.value.setRGB(1.0, 0.76, 0.70);
  corePlumeGroup.add(coreGlow);
  corePlumeGroup.userData.glow = coreGlow;
  // v8 wide lit-air halo (+ v9 retune): neutral gray-green, stronger, wider.
  // Tune ONLY uGlow (0.25–0.8). Excluded from applyGlowBudget (single quad).
  const airGlow = makeGlowMesh(coreLen, coreR * 0.95, 0xffffff, vis);
  airGlow.material.uniforms.uTint.value.setRGB(0.42, 0.45, 0.44);
  airGlow.material.uniforms.uReach.value = coreLen * 4.0;
  airGlow.material.uniforms.uR0.value = coreR * 18.0;
  corePlumeGroup.add(airGlow);
  corePlumeGroup.userData.air = airGlow;
  V.corePlume = corePlumeGroup;
  V.scene.add(corePlumeGroup);

  // 2. Stage 2 Vacuum Plume: shorter, wider, slow pale-blue burn.
  const vacPlumeGroup = new THREE.Group();
  vacPlumeGroup.name = 'vacuum_plume';
  const vacR = dispR(cfg.upD || cfg.coreD);
  const vacLen = 48 * k;
  vacPlumeGroup.userData.len = vacLen; // flame length for glow uLen correction
  // Bell mouth in stage2-local metres (vacBell center −0.32·upD, half-height
  // 0.325·upD): the plume origin belongs HERE, not at −0.4 (which buried the
  // cone top around the bell so flame overlapped nozzle metal — owner shot).
  vacPlumeGroup.userData.mouthY = -(0.645 * (cfg.upD || cfg.coreD));
  const vacMesh = makePlumeMesh({
    // topR matches the bell mouth (visible edge ≈ mouth): flame starts AT the
    // exit plane instead of swallowing the nozzle (was 0.85 → 20% too wide).
    topR: vacR * 0.7, botR: vacR * 2.0, len: vacLen,
    core: 0xdce8ff, mid: 0x7fa0ff, exposure: 3.0, wobble: 0.15, flow: 0.5, vac: true, v2: multi
  });
  vacPlumeGroup.add(vacMesh);
  V.fireMeshes.push(vacMesh);
  const vacGlow = makeGlowMesh(48 * k, vacR * 0.85, 0x8fa8ff, vis);
  vacPlumeGroup.add(vacGlow);
  // Tight short halo: the long vac flame's 0.45·len above-fade otherwise washes
  // forward over the whole upper stage (owner F9 SECO shot). Dress the column.
  // R0 1.5× (was 3.0×): halo core must not exceed the bell it exits.
  vacGlow.material.uniforms.uReach.value = vacLen * 0.5;
  vacGlow.material.uniforms.uR0.value = vacR * 0.85 * 1.5;
  vacPlumeGroup.userData.glow = vacGlow;
  V.vacPlume = vacPlumeGroup;
  V.scene.add(vacPlumeGroup);

  // 3. Booster plumes: one steep cone each, sized off the SRB nozzle
  // (or the side-core cluster for triple-core heavies).
  V.boosterPlumes = [];
  if (multi) {
    const srbR = (cfg.srb && cfg.srb[0] > 0)
      ? dispR(cfg.srb[2])
      : dispR(cfg.coreD) * 0.8;
    for (let i = 0; i < stages.boosters.length; i++) {
      // Booster cones OVERLAP the core cone: adjacent plumes must merge into
      // one level luminous base — edge-faded cones that merely touch leave
      // dark seams reading as staggered stubs (owner shot).
      // NOTE: the cone mesh itself carries a -len/2 child offset (see
      // makePlumeMesh), so it must live inside a Group positioned at the
      // nozzle — positioning the cone mesh directly overwrites that offset
      // and lifts half the flame (len/2, ~15 m on SLS) above the bell mouth.
      // PROPORTION (owner: booster burn reads chubby vs the slender majestic
      // core-only flame): 3 additive cones + 3 full-size glow billboards
      // stack to ~4x halo brightness, swallowing the column into a ball.
      // So boosters are SLIM (top 1.0x/bot 1.8x srbR — inner edges still
      // overlap the core top radius, so no seams), dimmer per-source
      // (exposure 3.2, glow base 0.55/narrow reach) so the SUM reads as one
      // slender column slightly wider/brighter than single-engine, and LONG
      // (60 m vs 65 m core) so tips near-align instead of stubbing.
      const bLen = 100 * k;
      const bGroup = new THREE.Group();
      bGroup.name = 'booster_plume_' + i;
      bGroup.userData.len = bLen;
      const bMesh = makePlumeMesh({
        topR: srbR * 1.0, botR: srbR * 2.6, len: bLen,
        // v8: exposure restored (MAX removes pile-up) + reference-matched decay.
        core: 0xfff2dc, mid: 0xff9961, exposure: 7.0, wobble: 0.22, flow: 1.15,
        soft: 0.8, decay: 0.7, sat: 0.35, v2: true
      });
      bGroup.add(bMesh); // child offset (-len/2) puts the cone top at the nozzle
      bGroup.add(makeNozzleDisc(srbR * 0.95)); // exit-plane handover (v8)
      const bGlow = makeGlowMesh(bLen, srbR * 1.0, 0xff7a45, vis);
      bGlow.material.uniforms.uTint.value.copy(_C_GLOW_WARM);
      // v9 pink near-field (multi-only path — boosters exist only there).
      bGlow.material.uniforms.uNear.value.setRGB(1.0, 0.76, 0.70);
      // Narrow/dim per-source halo: the core glow stays master; stacked
      // booster halos must dress their own column, not outshine the merge.
      bGlow.material.uniforms.uReach.value = bLen * 0.55;
      bGlow.material.uniforms.uR0.value = srbR * 1.0 * 3.0;
      bGroup.add(bGlow); // sibling glow, same Group pattern as core/vacuum
      bGroup.userData.glow = bGlow;
      V.scene.add(bGroup);
      V.boosterPlumes.push(bGroup);
      V.fireMeshes.push(bMesh);
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   UPDATE SYSTEMS: STAGING, PARTICLES, LIGHTING & CAMERA
   ══════════════════════════════════════════════════════════════ */
function updateStaging(f, now) {
  if (!V.stages) return;
  const S = V.stages;
  // P6 classification: event WINDOWS are REFERENCE/VERIFIED (byLv METs);
  // the eased sep offsets + ballistic coast (display units, art gravity,
  // ESTIMATE dv) are a PRESENTATION kinematic approximation — bounded and
  // deterministic, never orbital dynamics. Attached until f0 (no teleport);
  // ballistic branches restart from the eased endpoint + vehicleVel (P2).
  // Expert windows: per-vehicle MET truth (byLv) preferred, nominal f window
  // fallback. stageWindow returns [f0, f1, met0, met1] or null (event absent).
  const ST = ANIM.staging;
  const P = profileFor(V.lvId);
  const met = f * P.endMet;

  // A. Booster Burnout & Separation (+ Atlas 551 pair stagger).
  if (S.boosters && S.boosters.length > 0) {
    const W = stageWindow('booster');
    if (!W) {
      S.boosters.forEach(b => { b.position.copy(b.userData.initPos); b.rotation.set(0, 0, 0); });
    } else {
      const B = ST.booster, dur = Math.max(1e-4, W[1] - W[0]);
      if (!S.boosterSoundPlayed && met >= W[2] && met < W[2] + 4) {
        playStagingSound(160);
        S.boosterSoundPlayed = true;
      }
      S.boosters.forEach((b, bi) => {
        const delay = (V.lvId === 'av551' && bi >= 2) ? ST.stagger551 : 0;
        const f0 = W[0] + delay, f1 = W[1] + delay;
        const dx = b.userData.dirX || 0, dz = b.userData.dirZ || 0;
        if (f < f0) {
          b.position.copy(b.userData.initPos);
          b.rotation.set(0, 0, 0);
          return;
        }
        const frac = Math.min(1, (f - f0) / dur);
        const tilt = Math.min(0.85, frac * 1.2);
        const sep = Math.pow(frac, 1.6) * B.out;
        const px = b.userData.initPos.x + dx * sep;
        const pz = b.userData.initPos.z + dz * sep;
        const py = b.userData.initPos.y - Math.pow(frac, 2) * 22.0;
        if (!B.ballistic || f <= f1) {
          b.position.set(px, py, pz);
          b.rotation.z = -dx * tilt; b.rotation.x = dz * tilt;
        } else {
          // Ballistic coast in the parent-local frame (pure in f).
          vehicleVel(f1, _vv);
          const on = Math.hypot(dx, dz) || 1, dv = B.ballistic.dv;
          const dtau = debrisBallistic({ x: px, y: py, z: pz }, _vv,
            [dx / on * dv[0], dv[1], dz / on * dv[0] + dv[2]], B.ballistic.g, f1, f);
          b.position.set(_db.x, _db.y, _db.z);
          b.rotation.z = -dx * tilt; b.rotation.x = dz * tilt;
          b.rotation.y += B.ballistic.spin * dtau;
        }
      });
    }
  }

  // B. MECO & Stage 1 Separation.
  if (S.stage1) {
    const W = stageWindow('stage1');
    if (!W) { S.stage1.position.set(0, 0, 0); S.stage1.rotation.set(0, 0, 0); }
    else {
      const B = ST.stage1, dur = Math.max(1e-4, W[1] - W[0]);
      if (!S.s1SoundPlayed && met >= W[2] && met < W[2] + 4) {
        playStagingSound(130);
        S.s1SoundPlayed = true;
      }
      if (f < W[0]) { S.stage1.position.set(0, 0, 0); S.stage1.rotation.set(0, 0, 0); }
      else {
        const frac = Math.min(1, (f - W[0]) / dur);
        const px = Math.pow(frac, 1.5) * B.side, py = -Math.pow(frac, 1.8) * B.drop;
        if (!B.ballistic || f <= W[1]) {
          S.stage1.position.set(px, py, 0);
          S.stage1.rotation.set(0, frac * 0.3, frac * 0.45);
        } else {
          vehicleVel(W[1], _vv);
          const dv = B.ballistic.dv;
          const dtau = debrisBallistic({ x: px, y: py, z: 0 }, _vv, [dv[0], dv[1], dv[2]], B.ballistic.g, W[1], f);
          S.stage1.position.set(_db.x, _db.y, _db.z);
          S.stage1.rotation.set(0, frac * 0.3 + B.ballistic.spin * dtau, frac * 0.45);
        }
      }
    }
  }

  // C. Fairing Separation — fires ONLY when this vehicle has a byLv fairing
  // window (Saturn V SLA panels are not modeled — honesty over motion).
  {
    const byF = (ANIM.staging.byLv[V.lvId] || {}).fairing;
    if (S.fairingPort && S.fairingStbd && byF) {
      const P2 = profileFor(V.lvId);
      const f0 = byF[0] / P2.endMet, f1 = byF[1] / P2.endMet;
      const B = ST.fairing, dur = Math.max(1e-4, f1 - f0);
      if (!S.fairingSoundPlayed && met >= byF[0] && met < byF[0] + 4) {
        playStagingSound(240);
        S.fairingSoundPlayed = true;
      }
      if (f < f0) {
        S.fairingPort.position.set(0, 0, 0);
        S.fairingPort.rotation.set(0, 0, 0);
        S.fairingStbd.position.set(0, 0, 0);
        S.fairingStbd.rotation.set(0, 0, 0);
      } else {
        const frac = Math.min(1, (f - f0) / dur);
        const fSep = Math.pow(frac, 1.4) * B.out;
        const fAngle = Math.min(1.2, frac * 1.5);
        const dy = -Math.pow(frac, 2) * B.drop;
        const placeHalf = (half, sx) => {
          if (!B.ballistic || f <= f1) {
            half.position.set(sx * fSep, dy, 0);
            half.rotation.z = sx > 0 ? -fAngle : fAngle;
          } else {
            vehicleVel(f1, _vv);
            const dv = B.ballistic.dv;
            const dtau = debrisBallistic({ x: sx * fSep, y: dy, z: 0 }, _vv,
              [sx * dv[0], dv[1], dv[2]], B.ballistic.g, f1, f);
            half.position.set(_db.x, _db.y, _db.z);
            half.rotation.z = (sx > 0 ? -fAngle : fAngle) + B.ballistic.spin * dtau * sx;
          }
        };
        placeHalf(S.fairingPort, -1);
        placeHalf(S.fairingStbd, 1);
      }
    } else if (S.fairingPort && S.fairingStbd) {
      S.fairingPort.position.set(0, 0, 0);
      S.fairingPort.rotation.set(0, 0, 0);
      S.fairingStbd.position.set(0, 0, 0);
      S.fairingStbd.rotation.set(0, 0, 0);
    }
  }

  // C2. Launch Abort Tower Jettison (fires only with a byLv las window).
  if (S.las) {
    const initY = (S.las.userData && isFinite(S.las.userData.initY)) ? S.las.userData.initY : S.las.position.y;
    const byL = (ANIM.staging.byLv[V.lvId] || {}).las;
    if (!byL) { S.las.position.y = initY; S.las.rotation.set(0, 0, 0); }
    else {
      const P2 = profileFor(V.lvId);
      const f0 = byL[0] / P2.endMet, f1 = byL[1] / P2.endMet;
      const B = ST.las, dur = Math.max(1e-4, f1 - f0);
      if (!S.lasSoundPlayed && met >= byL[0] && met < byL[0] + 4) {
        playStagingSound(300);
        S.lasSoundPlayed = true;
      }
      if (f < f0) { S.las.position.y = initY; S.las.rotation.set(0, 0, 0); }
      else {
        const frac = Math.min(1, (f - f0) / dur);
        const py = initY + Math.pow(frac, 1.5) * B.up;
        if (!B.ballistic || f <= f1) {
          S.las.position.y = py;
          S.las.rotation.z = frac * 0.35;
        } else {
          vehicleVel(f1, _vv);
          const dv = B.ballistic.dv;
          const dtau = debrisBallistic({ x: 0, y: py, z: 0 }, _vv, [0, dv[1], dv[0]], B.ballistic.g, f1, f);
          S.las.position.set(_db.x, _db.y, _db.z);
          S.las.rotation.z = frac * 0.35 + B.ballistic.spin * dtau;
        }
      }
    }
  }

  // D. Spacecraft Separation — pure function of f (expert window + distance).
  if (S.payload) {
    const pw = ST.payload;
    const baseY = (S.payload.userData && isFinite(S.payload.userData.baseY))
      ? S.payload.userData.baseY : S.payload.position.y;
    if (f < pw.window[0]) {
      S.payload.position.y = baseY;
      S.payload.rotation.y = 0;
    } else {
      const k = Math.min(1, (f - pw.window[0]) / Math.max(1e-4, pw.window[1] - pw.window[0]));
      if (!S.payloadSoundPlayed && k < 0.25) {
        playStagingSound(480);
        S.payloadSoundPlayed = true;
      }
      S.payload.position.y = baseY + k * pw.away;
      S.payload.rotation.y = k * 0.5;
    }
  }
}

function updatePlumes(f, now, prof, dt) {
  const S = V.stages;
  if (!V.rocket || !S) return;
  const DT = (dt != null && isFinite(dt) && dt > 0) ? dt : 0.016;

  const flick = 0.82 + 0.18 * Math.sin(now * 0.06) * Math.sin(now * 0.021);
  // Per-vehicle MET (Workstream C) + throttle-bucket dip at Max-Q.
  const P = profileFor(V.lvId);
  const met = f * P.endMet;
  const F = (m) => m / P.endMet;
  const bucketDip = 1 - 0.25 * Math.exp(-Math.pow((met - P.maxQMet) / 12, 2));
  const tSec = now * 0.001;
  // Fast halo flicker (breaks dead-steady glow) + daylight hook.
  const flickF = 1.0 + 0.035 * Math.sin(tSec * 61.0) + 0.025 * Math.sin(tSec * 37.0 + 1.3);
  const daylight = 0; // launch cinematic is night; night keeps the full halo
  const dayF = 1.0 - 0.6 * daylight;
  // Altitude fade for the glow (floor 0.55, never 0 — the 2:18 ref still has
  // a big halo high up because the camera exposes for the plume).
  const altKmU = (prof && isFinite(prof.alt)) ? prof.alt : 0;
  const altFade = 1.0 - 0.45 * smooth01(altKmU, 20, 80);

  // 1. Stage 1 Core Plume
  if (V.corePlume && S.stage1) {
    // Active from ignition (pre-release beat seeds clocks/throttle) up to MECO.
    // No lower f gate: the countdown ignition hands off continuously (throttle
    // floor 0.55 for MET<3 so the low-passed thrS never dips at handoff).
    const mecoF = F(P.meco[0]);
    if (f < mecoF) {
      V.corePlume.visible = true;
      const throttle = (met < 5 ? Math.max(met / 5, 0.55) : (f > mecoF - 0.02 ? (mecoF - f) / 0.02 : 1.0)) * bucketDip;
      // Low-passed throttle (geometry must not twitch per-frame) + per-plume
      // ignition clock (uTime starts at ignition, not page load).
      const gd = V.corePlume.userData;
      const kT = 1 - Math.exp(-DT * 8);
      gd.thrS = (gd.thrS == null) ? throttle : gd.thrS + (throttle - gd.thrS) * kT;
      const thrS = gd.thrS;
      if (!gd.wasOn) { gd.t0 = tSec; gd.wasOn = true; }
      const tPlume = tSec - (gd.t0 != null ? gd.t0 : tSec);

      // Altitude blossom lives in the SHADER (uExpand widens downstream
      // only) — the group stays xz=1 so the nozzle-attach never fattens.
      // v9: keyed to ALTITUDE on multi stacks (MET/MECO keying left SLS near
      // zero at T+1:35 since MECO is 483 s — the real plume widens with air,
      // not with mission fraction). F9 path unchanged.
      const multiV = V.boosterPlumes && V.boosterPlumes.length > 0;
      const expand = multiV
        ? 1 + 1.6 * smooth01(altKmU, 8, 80)
        : 1 + Math.pow(Math.min(1, met / Math.max(1, P.meco[0])), 2.2) * 1.6;

      // Position plume AT the bell mouth (stored at build): flame starts at
      // the exit plane on every vehicle, no magic offset.
      _pp0.set(0, (V.corePlume.userData.exitY != null) ? V.corePlume.userData.exitY : -0.2, 0);
      S.stage1.localToWorld(_pp0);
      V.corePlume.position.copy(_pp0);
      // Orient from the HARDWARE (v8): rocket-Euler vs stage-world mismatch
      // kinks the flame off-axis from off-plane cameras (booster path proved it).
      S.stage1.getWorldQuaternion(_bq);
      V.corePlume.quaternion.copy(_bq);

      // Throttle SHORTENS/densifies (not tint-only): y shrinks, xz blossoms.
      V.corePlume.scale.set(1, (0.55 + 0.45 * thrS) * (1.0 + f * 1.2), 1);

      // Custom drive: time scroll + throttle uniform (edge tightness + exposure)
      // + early-phase exposure lift so the bell cluster blows out into the
      // core in low cameras (owner direction — no sprite, the flame itself).
      // Capped at 1.25×: 1.8× clipped the whole cone to uniform white (solid bar).
      const ch = V.corePlume.children;
      const liftK = 1 + 0.25 * (1 - smooth01(met, 8, 45)); // glory carry to MET 45
      for (let ci = 0; ci < ch.length; ci++) {
        drivePlume(ch[ci], tPlume, Math.max(0.001, thrS * flick), expand);
        const cm = ch[ci];
        if (cm && cm.material && cm.material.uniforms && cm.material.uniforms.uExposure) {
          if (cm.userData.expo0 == null) cm.userData.expo0 = cm.material.uniforms.uExposure.value;
          cm.material.uniforms.uExposure.value = cm.userData.expo0 * liftK;
        }
      }
      // Hot bells: emissive follows the low-passed throttle so bell mouths
      // glow instead of silhouetting against the white root (shared mat:
      // core + SRB + vac bells burn together early; MECO cools it above).
      if (V.nozzleMat) V.nozzleMat.emissive.setRGB(1.6 * thrS, 0.62 * thrS, 0.16 * thrS);

      // Capsule glow drive: throttle-scaled, eased with altitude (floor 0.55,
      // tint warms low and cools high). Group hide covers visibility.
      const cGlow = V.corePlume.userData.glow;
      if (cGlow && cGlow.material && cGlow.material.uniforms) {
        const gu = cGlow.material.uniforms;
        const thrF = Math.max(0.001, thrS * flick);
        // 1.1: halo dresses the flame at full glory; the root connection is
        // structural now (axial core below), not dimmed away.
        gu.uGlow.value = 1.1 * (0.35 + 0.9 * thrF) * altFade * flickF * dayF;
        const air = V.corePlume.userData.air; // v8 wide lit-air halo (v9: uGlow 0.5, range 0.25–0.8)
        if (air && air.material && air.material.uniforms) {
          const au = air.material.uniforms;
          au.uGlow.value = 0.5 * (0.35 + 0.9 * thrF) * altFade * flickF;
          if (au.uLen && gu.uLen) au.uLen.value = gu.uLen.value;
        }
        if (gu.uLen && V.corePlume.userData.len) gu.uLen.value = V.corePlume.userData.len * V.corePlume.scale.y;
        if (gu.uTint) gu.uTint.value.copy(_C_GLOW_WARM).lerp(_C_GLOW_HIGH, 1 - altFade);
        // Sky lift: lit gray-brown air around the plume (kept small).
        V._skyLiftS = Math.min(0.09, 0.06 * (0.35 + 0.9 * thrF) * altFade);
      }

      // Dynamic fire lighting — trench→plume handoff over the expert window.
      // Expert refinement (position only — intensity/colour frozen): nudge the
      // source up and toward the camera so it rakes the vehicle's
      // camera-facing sides. An on-axis light below the stack only grazes the
      // cylinder (the dark-rocket artifact). Revert if tower/plume-base look
      // worse in browser A/B. Scalar math only, no allocation.
      if (V.fireLight) {
        const hb = LAUNCH_ANIM.fx.fireLight.trenchToPlume;
        const hk = Math.max(0, Math.min(1, (f - hb[0]) / Math.max(1e-4, hb[1] - hb[0])));
        const anchor = V.trenchPos || _trenchFallback;
        let lx = anchor.x + (_pp0.x - anchor.x) * hk;
        let ly = anchor.y + (_pp0.y - anchor.y) * hk;
        let lz = anchor.z + (_pp0.z - anchor.z) * hk;
        if (V.camera) {
          let ox = V.camera.position.x - lx, oz = V.camera.position.z - lz;
          const om = Math.sqrt(ox * ox + oz * oz) || 1;
          lx += (ox / om) * 3.0; lz += (oz / om) * 3.0; ly += 2.0;
        }
        V.fireLight.position.set(lx, ly, lz);
        V.fireLight.intensity = (met < 20 ? 650 : 380) * throttle * flick * fireProxK();
        // Expert handoff: continuous ignition-orange → main-amber over
        // MET 11.2–14.4 (preallocated colors, no one-frame jump). The intro
        // hold to MET 12 is inside this window, not a branch.
        V.fireLight.color.copy(_C_FIRE_IGN).lerp(_C_FIRE_MAIN, smooth01(met, 11.2, 14.4));
      }
    } else {
      V.corePlume.visible = false;
      V.corePlume.userData.wasOn = false;
      V._skyLiftS = 0;
      if (V.nozzleMat) V.nozzleMat.emissive.setRGB(0.3, 0.1, 0.03); // cooling metal
      if (V.fireLight && f >= mecoF && met < P.meco[1] + 15) V.fireLight.intensity = 0;
    }
  }

  // 2. Booster Plumes
  if (V.boosterPlumes && S.boosters && S.boosters.length > 0) {
    // P6 engine-state rule: the flame dies at BURNOUT (booster window START),
    // not at jettison completion — real SRBs quit thrusting before the BSMs
    // push the dead casings away. The 8 s tail-off below fades the flame
    // across early drift (tail fire on a dead casing is real). Motion windows
    // (updateStaging) are unchanged: casings stay attached until burnout.
    const bBurn = P.booster ? P.booster[0] : P.endMet;
    for (let i = 0; i < S.boosters.length; i++) {
      const bp = V.boosterPlumes[i];
      const bMesh = S.boosters[i];
      if (!bp || !bMesh) continue;

      // Late-stagger group (Atlas 551 SRBs 3–5) burns 1.5 s longer.
      const cutoff = bBurn + ((P.srbStagger && i >= 2) ? P.srbStagger : 0);
      // Ground-lit from the pre-release beat (headK ramps 0→1 over MET 4–7,
      // continuing the seeded ignition); dies at BURNOUT per P6.
      if (met >= 0 && met < cutoff) {
        bp.visible = true;
        // Anchor AT the bell mouth: the old −2.5 display-unit drop put the flame
        // origin ~25 m under an SLS SRB — the reported detachment. Exit plane
        // comes from the booster build (exitY, local metres, scaled by localToWorld).
        _pp1.set(0, (bMesh.userData && isFinite(bMesh.userData.exitY)) ? bMesh.userData.exitY : -0.1, 0);
        bMesh.localToWorld(_pp1);
        bp.position.copy(_pp1);
        // Follow the BOOSTER's orientation, not the rocket's: separating SRBs
        // tilt (up to 0.85 rad) and ballistically coast — a rocket-aligned flame
        // shears visibly off a tilted nozzle (the reported floating flames).
        bMesh.getWorldQuaternion(_bq);
        bp.quaternion.copy(_bq);
        // Burnout tail-off (ESTIMATED 8 s ramp) + ignition head ramp: SRBs must
        // die at the nozzle, never pop out mid-frame.
        const headK = Math.min(1, Math.max(0, (met - 4) / 3));
        const tailK = Math.min(1, Math.max(0, (cutoff - met) / 8));
        // Flick-free envelope (geometry must not twitch): throttle SHORTENS
        // like the core (0.55+0.45) plus the same ascent stretch (1+f*1.2) so
        // boosters grow with altitude instead of staying 30 m stubs.
        const bEnv = headK * (0.25 + 0.75 * tailK);
        const bThr = flick * bEnv;
        bp.scale.set(1, (0.55 + 0.45 * bEnv) * (1.0 + f * 1.2), 1);
        if (!bp.userData.wasOn) { bp.userData.t0 = tSec; bp.userData.wasOn = true; }
        // bp is a Group at the nozzle (cone child keeps its -len/2 offset);
        // drive the cone children, skipping the sibling glow (no uTime).
        const tBooster = (tSec - (bp.userData.t0 != null ? bp.userData.t0 : tSec)) + i * 1.7;
        const bch = bp.children;
        // v9: booster blossom rides altitude too (same SRB-phase argument).
        for (let ci = 0; ci < bch.length; ci++) drivePlume(bch[ci], tBooster, Math.max(0.001, bThr), 1.25 + 0.9 * smooth01(altKmU, 8, 80));
        const bGlow = bp.userData.glow;
        if (bGlow && bGlow.material && bGlow.material.uniforms) {
          // 0.55 base (was 1.4): three stacked full halos clipped into a
          // ball; the dimmed sum reads as one column, core stays master.
          bGlow.material.uniforms.uGlow.value = 0.55 * (0.35 + 0.9 * bThr) * altFade * flickF * dayF;
          if (bp.userData.len) bGlow.material.uniforms.uLen.value = bp.userData.len * (bp.scale.y || 1);
        }
      } else {
        bp.visible = false;
        bp.userData.wasOn = false;
      }
    }
  }

  // Shared halo budget (expert patch v7): applied after core+booster uGlow
  // writes, before vacuum (vac never co-burns with boosters — no-op there).
  applyGlowBudget();

  // 3. Stage 2 Vacuum Plume
  if (V.vacPlume && S.stage2) {
    // Ignites after MECO/Sep (profile window) through SECO
    const vac0 = F(P.meco[1] + 4), vac1 = F(P.endMet - 8);
    if (f >= vac0 && f < vac1) {
      V.vacPlume.visible = true;
      const vThrottle = f < vac0 + 0.03 ? (f - vac0) / 0.03 : (f > vac1 - 0.03 ? (vac1 - f) / 0.03 : 1.0);

      // Origin at the bell mouth (stored at build): flame starts AT the exit.
      _pp0.set(0, (V.vacPlume.userData.mouthY != null) ? V.vacPlume.userData.mouthY : -0.4, 0);
      S.stage2.localToWorld(_pp0);
      V.vacPlume.position.copy(_pp0);
      S.stage2.getWorldQuaternion(_bq); // hardware orientation (v8, see core)
      V.vacPlume.quaternion.copy(_bq);

      // Vacuum plume starts blossomed and widens gently (capped: it must
      // read as an engine plume, not swallow the vehicle or the frame corner)
      const burnK = Math.min(1, (f - vac0) / Math.max(0.01, vac1 - vac0));
      const vacExpand = 1.3 + burnK * 0.6;
      V.vacPlume.scale.set(1, 1.4, 1);
      const vgd = V.vacPlume.userData;
      if (!vgd.wasOn) { vgd.t0 = tSec; vgd.wasOn = true; }
      const tVac = tSec - (vgd.t0 != null ? vgd.t0 : tSec);
      const ch2 = V.vacPlume.children;
      for (let ci = 0; ci < ch2.length; ci++) drivePlume(ch2[ci], tVac, Math.max(0.001, vThrottle * flick), vacExpand);
      const vGlow = V.vacPlume.userData.glow;
      if (vGlow && vGlow.material && vGlow.material.uniforms) {
        const vThr = Math.max(0.001, vThrottle * flick);
        // 0.45 (was 0.7): vacuum halo must dress a diffuse column, not flood the stage.
        vGlow.material.uniforms.uGlow.value = 0.45 * (0.35 + 0.9 * vThr) * altFade * flickF * dayF;
        if (V.vacPlume.userData.len) vGlow.material.uniforms.uLen.value = V.vacPlume.userData.len * V.vacPlume.scale.y;
        if (vGlow.material.uniforms.uTint) vGlow.material.uniforms.uTint.value.copy(_C_GLOW_HIGH);
      }

      if (V.fireLight) {
        V.fireLight.position.copy(_pp0);
        V.fireLight.intensity = 180 * vThrottle * fireProxK();
        V.fireLight.color.setHex(0x70aaff); // Cool blue-violet vacuum lighting
      }
    } else {
      V.vacPlume.visible = false;
      V.vacPlume.userData.wasOn = false;
      if (f >= vac1 && V.fireLight) V.fireLight.intensity = 0;
    }
  }
}

/* PRESENTATION. Nominal wall-seconds per real frame (expert smoke method).
   Fixes 120 Hz (was 2× fast on fixed dt) and reduced motion (wall-life systems
   kept show-relative via V.nomScale; exactly 1 in normal mode). */
function smokeDt(rawDt) {
  const r = (isFinite(rawDt) && rawDt > 0) ? Math.min(rawDt, 0.05) : 0.016;
  return r * (V.nomScale || 1);
}
/* Expert bankAge: trench-bank age in the NOMINAL-WALL domain (was MET).
   Peak at tower-clear, tail to 0.8×wall. Pure in (tw, i) — scrubs
   deterministically. Stagger 0.2 (expert 0.4 spread births past tower-clear;
   0.2 keeps all 64 born inside the 2 s ignition lead + release). */
const BANK_PEAK = 0.35, BANK_LIFE = 2, BANK_END_FRAC = 0.8, BANK_STAGGER_FRAC = 0.2;
/* PRESENTATION: total billboard drift in radians over a sprite's whole life
   (expert spin fix). Owner direction: NO rotation — appear, hold, fade.
   Birth orientation stays random per sprite (seed×2π), so the shared texture
   doesn't stamp; drift is parked at 0 and can be raised if too static. */
const SPIN_DRIFT = 0;
function bankAge(tw, i, tT) {
  const tws = tw - (i / 64) * BANK_STAGGER_FRAC * tT;
  if (tws <= 0) return -1;
  if (tws <= tT) return BANK_PEAK * tws / tT;
  const WE = BANK_END_FRAC * ASCENT_S;
  return BANK_PEAK + (BANK_LIFE - BANK_PEAK) * (tws - tT) / (WE - tT);
}

function updateSmokeParticles(f, now, dt, prof) {
  // 1. Pad Flame Trench Smoke (Artemis refs: ground-filling banks that swallow
  // the pad and linger glowing into early ascent — big, warm-lit, long-lived.
  // Bloom is MET-keyed (~25 s to full size, like the real trench cloud), not
  // cinematic-fraction-keyed. Births at the authored trench mouth (V.trenchPos).
  const P0 = profileFor(V.lvId);
  const met = f * P0.endMet;
  const trenchActive = met < 50;
  const TY = (V.trenchPos && isFinite(V.trenchPos.y)) ? V.trenchPos.y : -0.6;
  // Expert night-smoke pass: horizontal distance from the trench fakes the
  // plume's illumination on unlit sprites (cream near flame → dark brown out).
  // nightK restores legacy colour by day (opacities/sizes still apply).
  const TX = (V.trenchPos && isFinite(V.trenchPos.x)) ? V.trenchPos.x : 0;
  const TZ = (V.trenchPos && isFinite(V.trenchPos.z)) ? V.trenchPos.z : 0;
  const nightK = 1 - ((V.sun && isFinite(V.sun.dayF)) ? V.sun.dayF : 0);
  // Shared vehicle scale for pad/flame smoke sprites (P1 true-scale: SITE_VK
  // for every vehicle; hsS ~0.60 vs the old F9-normalized 1.0 — flame smoke
  // correctly shrinks with the true-scale nozzles; trench banks stay absolute).
  const vkS = (V.rocket && V.rocket.scale && isFinite(V.rocket.scale.x) && V.rocket.scale.x > 0)
    ? V.rocket.scale.x : SITE_VK;
  const hsS = vkS / (12 / 71.6);
  const nPad = V.padSmoke.length;
  for (let i = 0; i < nPad; i++) {
    const s = V.padSmoke[i];
    if (!trenchActive) { s.material.opacity = 0; continue; }

    const sd = s.userData.seed;
    const side = s.userData.side;
    // Expert bankAge (nominal-wall domain; MET fallback if pad params missing).
    // Ignition floor fades over the stagger span after release — it bridges
    // T+0 but never masks the rise (expert open item, implemented).
    let age = -1, tTloc = 8;
    try {
      if (typeof globalThis !== 'undefined' && typeof globalThis.padParams === 'function') {
        const _PP = globalThis.padParams(V.lvId);
        tTloc = _PP.hold + _PP.tauTower;
        const _tw = (typeof V._tw === 'number' && isFinite(V._tw)) ? V._tw : -1;
        age = bankAge(_tw, i, tTloc);
      } else {
        age = (f - s.userData.delay) / (25 / P0.endMet);
      }
    } catch (e) { age = (f - s.userData.delay) / (25 / P0.endMet); }
    if ((V._ignK || 0) > 0) {
      const _tw2 = (typeof V._tw === 'number' && isFinite(V._tw)) ? V._tw : 0;
      const _fade = _tw2 <= 0 ? 1 : Math.max(0, 1 - _tw2 / Math.max(2, 0.4 * tTloc));
      age = Math.max(age, _fade * (V._ignK * 0.22 - s.userData.delay * 4));
    }
    // Ignition density control: only a ramp fraction of banks participates
    // pre-release (thin first wisps → ~35% banks at full ramp; ascent takes
    // all 64 via bankAge). Cut twice against the whiteout shot.
    if (f <= 0.001 && (V._ignK || 0) > 0 && (i / nPad) > (V._ignK * 0.35)) {
      s.material.opacity = 0;
      continue;
    }

    if (age < 0 || age > 2) {
      s.material.opacity = 0;
      continue;
    }

    // Billow horizontally along East/West flame trench, then rise in rolling cumulus.
    // Stays LOW (Artemis refs: bright bed at the pad, dark sky above) — height
    // fade keeps high puffs from washing out the frame.
    // REAL SMOKE: ground-filling banks 2-3x bigger than before, slow roll via
    // material.rotation, warm fire-lit bellies -> dark gray tops.
    // Ignition beat stays floor-hugging: the rise factor opens 0.55 → 1 over
    // the first ages (smooth everywhere, no f-gate pop at handoff).
    const speed = 14.0 * (1 - age * 0.3);               // was 20 — banks no longer wall off the whole frame
    // Slow billow drift (was 5 rad/s ±2.4 u — banks visibly sloshed against
    // the pad). ~8 s period, ±1.2/±1.0 u.
    const x = side * (2.2 + age * speed) + Math.sin(sd * 10 + now * 0.0008) * 1.2;
    const lowF = Math.min(1, 0.55 + age * 1.3);
    const y = TY + 0.4 + (Math.pow(age, 1.35) * 5.2 + sd * 2.4) * lowF;
    const z = (sd - 0.5) * 13.0 + Math.cos(sd * 8 + now * 0.0007) * 1.0;

    s.position.set(x, y, z);
    const sc = Math.min(6.0 + age * 16.0, 26);          // was 22, uncapped — cap giant late sprites (iGPU overdraw)
    // Slight per-sprite breathing (de-repetition: shared texture + synced
    // formulas read as looping; ±4% size, seed-scattered phase).
    const br = 1 + 0.04 * Math.sin(now * 0.0007 + sd * 23);
    s.scale.set(sc * br, sc * 0.82 * br, 1);
    // Expert spin fix: birth-fixed angle + ≤4.3° drift (was ±age×1.2 ≈ ±137° —
    // a turning billboard reads as rotating cloud, not billow).
    if (s.material.rotation !== undefined) s.material.rotation = sd * 6.2832 + SPIN_DRIFT * (sd - 0.5) * Math.min(age / 2, 1);

    // Legacy colour (kept for day identity)
    const glowK = Math.max(0, 1 - age * 2.2) * (met < 30 ? 1 : 0.25);
    const darkK = Math.min(1, age * 1.6 + sd * 0.4);
    let rC = 1.0 - darkK * 0.52;
    let gC = Math.max(0.2, (0.88 - darkK * 0.42) + glowK * 0.10);
    let bC = Math.max(0.18, (0.80 - darkK * 0.38) + glowK * 0.02);

    // Night: sprites are unlit, so fake the plume's illumination by horizontal
    // distance from the trench. Near the flame is warm cream, the outer banks
    // fall to dark brown, and nothing goes neutral gray.
    const dx = x - TX, dz = z - TZ;
    const fireK = Math.exp(-Math.sqrt(dx * dx + dz * dz) / 9.0) * (met < 30 ? 1 : 0.35) * (1 - age * 0.6);
    const nR = 0.30 + 0.70 * fireK, nG = 0.22 + 0.58 * fireK, nB = 0.19 + 0.39 * fireK;
    s.material.color.setRGB(
      rC + (nR - rC) * nightK,
      gC + (nG - gC) * nightK,
      bC + (nB - bC) * nightK);

    const heightFade = Math.max(0.15, 1 - (s.position.y - 2) / 12);
    // Asymmetric envelope: fast bloom (peak age 0.35 ≈ tower-clear), slow
    // two-age tail — banks linger instead of dying together at MET 25.
    // Pre-release cap 0.5: ignition smoke stays translucent (whiteout fix).
    const envA0 = age < 0.35 ? Math.sin(age / 0.35 * Math.PI / 2)
                             : Math.cos((age - 0.35) / 1.65 * Math.PI / 2);
    const envA = (f <= 0.001) ? Math.min(envA0, 0.5) : envA0;
    // Slight per-sprite shimmer (±8%, ~6 s period, seed-scattered) — same
    // de-repetition as the breathing above.
    s.material.opacity = (met < 25 ? 0.62 : 0.45) * envA * heightFade * (0.92 + 0.08 * Math.sin(now * 0.0011 + sd * 39));  // was 0.72 / 0.55
  }

  // Atmospheric flight only: alt < ~80 km (no contrail in vacuum, whatever f says)
  const inAtmo = prof && isFinite(prof.alt) ? prof.alt < 80 : met < P0.endMet * 0.55;
  // 2. Trailing Ascent Smoke Contrail — rise-keyed (expert smoke method):
  // births every 0.5 display-u of climb, life spans 18 u, shear by distance.
  // Identical trail at any MET rate (was f-spawned: 0.6 beads/wall-s on the
  // pad, 10.7 late). Drops backlog instead of bursting.
  const CT_SPACING = 0.5, CT_LEN = 18, CT_MAX = 3, CT_SHEAR = 0.05;
  const riseNow = riseFromFlight(f);
  let ctHold = 9;
  try { if (typeof globalThis !== 'undefined' && typeof globalThis.padParams === 'function') ctHold = globalThis.padParams(V.lvId).hold; } catch (e) {}
  const ctOn = V.rocket && met >= ctHold && inAtmo;
  if (V.ctLast == null || !isFinite(V.ctLast)) V.ctLast = riseNow;
  if (!ctOn) {
    V.ctLast = riseNow;
  } else {
    // Trail starts at the flame TIP (never at the nozzle/top) when the
    // core plume is live; falls back to the nozzle otherwise.
    if (V.corePlume && V.corePlume.visible && V.corePlume.userData && isFinite(V.corePlume.userData.len)) {
      _pp1.set(0, -1, 0);
      if (V.rocket) _pp1.applyQuaternion(V.rocket.quaternion);
      const tl = V.corePlume.userData.len * (V.corePlume.scale.y || 1);
      _pp1.set(
        V.corePlume.position.x + _pp1.x * tl,
        V.corePlume.position.y + _pp1.y * tl,
        V.corePlume.position.z + _pp1.z * tl);
    } else {
      _pp1.set(0, -1.0, 0);
      V.rocket.localToWorld(_pp1);
    }
    let ctn = 0;
    while (riseNow - V.ctLast >= CT_SPACING && ctn < CT_MAX) {
      V.ctLast += CT_SPACING; ctn++;
      V._ctCur = ((V._ctCur || 0) + 1) % V.contrailSmoke.length;
      const qc = V.contrailSmoke[V._ctCur];
      if (!qc || qc.userData.active) continue;
      // Spread multi-births along last→current tip so they never stack.
      const fr = ctn / CT_MAX;
      const px = (V._ctTipX != null) ? V._ctTipX : _pp1.x;
      const py = (V._ctTipY != null) ? V._ctTipY : _pp1.y;
      const pz = (V._ctTipZ != null) ? V._ctTipZ : _pp1.z;
      qc.userData.active = true;
      qc.userData.r0 = V.ctLast;
      qc.userData.x0 = px + (_pp1.x - px) * fr;
      qc.userData.y0 = py + (_pp1.y - py) * fr - (1.5 + f * 2.0) * 0.5;
      qc.userData.z0 = pz + (_pp1.z - pz) * fr;
      qc.userData.size0 = 1.5 + f * 2.0;
      qc.position.set(qc.userData.x0, qc.userData.y0, qc.userData.z0);
      qc.scale.set(qc.userData.size0, qc.userData.size0, 1);
      qc.material.opacity = 0;
    }
    if (ctn === CT_MAX) V.ctLast = riseNow; // drop backlog, never burst
    V._ctTipX = _pp1.x; V._ctTipY = _pp1.y; V._ctTipZ = _pp1.z;
  }

  // Pad fireball: overexposed ignition ball at the trench mouth (ref image 2).
  // Expert fireballK: holds the countdown level to tower-clear, then decays
  // (was fk = met/5, peaking mid-climb with a handoff pop).
  if (V.padFireball) {
    if (met <= 0 && (V._ignK || 0) <= 0) {
      V.padFireball.material.opacity = 0;
    } else {
      let fbK = -1;
      try {
        const _P3 = globalThis.padParams(V.lvId);
        const _tT3 = _P3.hold + _P3.tauTower;
        const _tw3 = (typeof V._tw === 'number' && isFinite(V._tw)) ? V._tw : met;
        fbK = _tw3 < _tT3 ? 1 : Math.max(0, 1 - (_tw3 - _tT3) / (0.9 * _tT3));
      } catch (e) { fbK = -1; }
      if (fbK < 0) { // degraded fallback: legacy MET fk
        const fk0 = met < 5 ? met / 5 : 1 - (met - 5) / 8;
        fbK = (met >= 0 && met < 13) ? Math.max(0, fk0) : 0;
      }
      // Expert handoff envelope: full through MET 10.2, smooth final fade
      // 10.2→13.0 — never zero exactly at MET 12, gone after the camera
      // blend has begun. Opacity only; no endpoint snap.
      fbK *= 1 - smooth01(met, 10.2, 13.0);
      const anchor = V.trenchPos || _trenchFallback;
      V.padFireball.position.set(anchor.x, anchor.y + 1.2, anchor.z);
      const fsc = (9 + fbK * 7) * hsS;
      V.padFireball.scale.set(fsc * 1.25, fsc * 0.85, 1);
      V.padFireball.material.opacity = 0.40 * fbK;
      V.padFireball.material.color.setHex(met < 6 ? 0xfff3d8 : 0xff9a40);
    }
  }

  // 1b. Under-flame smoke bed: fire-lit vapor churning BELOW the flame tip
  // (ref: glowing smoke under the column, never around the nozzle/top).
  // Spawns at the live flame TIP through the low-altitude burn; additive so
  // it reads as lit vapor, color set once at spawn (no per-frame cost).
  // Expert smoke method: continuous from T+0 (was MET 4–60 — a gap while the
  // vehicle already lifted after the shorter hold); ignition beat included.
  const ignBeat = (V._ignK || 0) > 0 && f <= 0.001;
  const flameOn = V.corePlume && V.corePlume.visible && (ignBeat || met < 60);
  V._fsmokeTick++;
  // Ignition density: sparse early spawns, ~50% bed by release.
  const bedRate = (f <= 0.001 && (V._ignK || 0) < 1) ? Math.max(0.08, (V._ignK || 0) * 0.5) : 1;
  if (flameOn && V._fsmokeTick % 2 === 0 && V.flameSmoke && Math.random() < bedRate) {
    for (let i = 0; i < V.flameSmoke.length; i++) {
      const s = V.flameSmoke[i];
      if (!s.userData.active) {
        s.userData.active = true;
        s.userData.life = 1.0;
        const sd = s.userData.seed;
        const sd2 = (sd * 7) % 1, sd3 = (((sd * 13) % 1) + 1) % 1;
        // Flame tip in world: group origin (nozzle) + down-axis × length.
        _pp1.set(0, -1, 0);
        if (V.rocket) _pp1.applyQuaternion(V.rocket.quaternion);
        const tipLen = ((V.corePlume.userData && isFinite(V.corePlume.userData.len))
          ? V.corePlume.userData.len : 10) * (V.corePlume.scale.y || 1);
        s.position.set(
          V.corePlume.position.x + _pp1.x * (tipLen * 0.92 + sd * 1.5) + (sd - 0.5) * 3.0 * hsS,
          V.corePlume.position.y + _pp1.y * (tipLen * 0.92 + sd * 1.5),
          V.corePlume.position.z + _pp1.z * (tipLen * 0.92 + sd * 1.5) + (sd2 - 0.5) * 3.0 * hsS);
        const spd = 4 + sd * 4;
        s.userData.vx = _pp1.x * spd + (sd - 0.5) * 2.0;
        s.userData.vy = _pp1.y * spd - 1.0;
        s.userData.vz = _pp1.z * spd + (sd3 - 0.5) * 2.0;
        s.userData.size = 1.5 + sd * 1.5;
        s.material.color.setRGB(1.0, 0.72 + sd * 0.15, 0.5 + sd * 0.15);
        if (s.material.rotation !== undefined) s.material.rotation = sd * 6.28;
        break;
      }
    }
  }
  if (V.flameSmoke) {
    for (let i = 0; i < V.flameSmoke.length; i++) {
      const s = V.flameSmoke[i];
      if (!s.userData.active) continue;
      s.userData.life -= dt * 0.7;
      if (s.userData.life <= 0) { s.userData.active = false; s.material.opacity = 0; continue; }
      s.position.x += s.userData.vx * dt;
      s.position.y += s.userData.vy * dt;
      s.position.z += s.userData.vz * dt;
      const sc2 = s.userData.size * hsS * (1 + (1 - s.userData.life) * 4.5);
      s.scale.set(sc2, sc2, 1);
      s.material.opacity = 0.5 * Math.sin(s.userData.life * Math.PI);
    }
  }

  // Update contrail particles — rise-stepped (expert smoke method): life and
  // shear keyed to climb distance, not wall time.
  for (let i = 0; i < V.contrailSmoke.length; i++) {
    const p = V.contrailSmoke[i];
    if (!p.userData.active) continue;
    const cs = (riseNow - p.userData.r0) / CT_LEN;
    if (!(cs >= 0) || cs >= 1) { p.userData.active = false; p.material.opacity = 0; continue; }
    p.position.set(p.userData.x0 + CT_SHEAR * (riseNow - p.userData.r0), p.userData.y0, p.userData.z0);
    const csz = p.userData.size0 * (1 + 3 * cs);
    p.scale.set(csz, csz, 1);
    // Near-flame fade: young sprites sit inside the live flame column (root→tip)
    // and veil it gray — they mature into the visible trail only once the
    // rocket has left them behind. (Owner Max-Q shot: murk over the root.)
    p.material.opacity = 0.35 * Math.sin((1 - cs) * Math.PI) * smooth01(cs, 0.02, 0.22);
    // Same flame-side tint as the banks: the trail glows near the engine.
    if (V.fireLight) {
      const fdx = p.position.x - V.fireLight.position.x;
      const fdy = p.position.y - V.fireLight.position.y;
      const fdz = p.position.z - V.fireLight.position.z;
      const fk = Math.exp(-Math.sqrt(fdx * fdx + fdy * fdy + fdz * fdz) / 10);
      p.material.color.copy(_C_SMOKE_BASE).lerp(_C_SMOKE_HOT, fk);
    }
  }

  // 3. Max-Q Condensation Collar — vapor shock ring at the nose shoulders.
  // Window = per-vehicle Max-Q MET ±12 s (transonic/supersonic proxy, never a
  // Mach claim). One cap sprite hugs station +10.2 on the body axis; four ring
  // sprites circle the head at nose diameter and sweep downstream as the cloud
  // develops. Fast churn + shimmer carry the transonic speed feel; the
  // ignition-clock + low-pass fastening (plume pattern) removes pops.
  // COLLAR_ON master switch (see above): block skipped when off, cone stays
  // hidden (it is built visible=false-safe: update is the only shower).
  if (COLLAR_ON && V.condensationCone && V.rocket) {
    const P = profileFor(V.lvId);
    const met = f * P.endMet;
    const c0 = P.maxQMet - 12, c1 = P.maxQMet + 12;
    const cg = V.condensationCone.userData;
    if (met >= c0 && met < c1) {
      V.condensationCone.visible = true;
      const DTc = (dt != null && isFinite(dt) && dt > 0) ? dt : 0.016;
      if (!cg.wasOn) cg.wasOn = true;
      const target = Math.sin(((met - c0) / (c1 - c0)) * Math.PI);
      const kTc = 1 - Math.exp(-DTc * 6);
      cg.intS = (cg.intS == null) ? target : cg.intS + (target - cg.intS) * kTc;
      const cFrac = (met - c0) / (c1 - c0);
      const rz = (V.rocket.rotation && isFinite(V.rocket.rotation.z)) ? V.rocket.rotation.z : 0;
      const ax = -Math.sin(rz), ay = Math.cos(rz);
      const sx = ay, sy = -ax; // in-plane perpendicular of the body axis
      const noseD = (cg && isFinite(cg.noseD)) ? cg.noseD : 0.6;
      const tC = now * 0.001;
      const sweep = cFrac * 1.6; // cloud trails downstream as it develops (display units)
      const flickC = 0.7 + 0.3 * Math.sin(tC * 31.0) * Math.sin(tC * 17.0 + 1.0);
      const bx = V.rocket.position.x, by = V.rocket.position.y, bz = V.rocket.position.z;
      const ch = V.condensationCone.children;
      for (let ci = 0; ci < ch.length; ci++) {
        const s = ch[ci];
        const sd = (s.userData && isFinite(s.userData.seed)) ? s.userData.seed : 0;
        if (s.userData && !s.userData.ring) {
          s.position.set(bx + ax * 10.2, by + ay * 10.2, bz);
          s.scale.set(noseD * 2.6, noseD * 0.9, 1);
          // Expert spin fix: birth-fixed + drift over the collar window
          // (was + met×0.8 — unbounded spin across the ±12 s window).
          if (s.material.rotation !== undefined) s.material.rotation = sd * 6.2832 + SPIN_DRIFT * (sd - 0.5) * Math.min((met - c0) / (c1 - c0), 1);
          s.material.opacity = 0.15 * cg.intS * flickC;
        } else {
          const a = (s.userData ? s.userData.ang : 0) + tC * 0.6 * (sd > 0.5 ? 1 : -1);
          const r = noseD * (1.05 + 0.25 * Math.sin(cFrac * Math.PI));
          const along = 10.0 - 0.5 - sweep * (0.5 + sd);
          s.position.set(
            bx + ax * along + sx * Math.cos(a) * r,
            by + ay * along + sy * Math.cos(a) * r,
            bz + Math.sin(a) * r);
          s.scale.set(noseD * (1.6 + sd * 0.7), noseD * (0.8 + sd * 0.4), 1);
          // Expert spin fix: birth-fixed + drift (was + met×±1.2 — full turns).
          if (s.material.rotation !== undefined) s.material.rotation = sd * 6.2832 + SPIN_DRIFT * (sd - 0.5) * Math.min((met - c0) / (c1 - c0), 1);
          s.material.opacity = 0.22 * cg.intS * flickC * (0.75 + 0.25 * Math.sin(sd * 40 + tC * 23));
        }
      }
    } else {
      V.condensationCone.visible = false;
      V.condensationCone.userData.wasOn = false;
    }
  }
}

/* P5 altitude-responsive atmosphere (presentation thresholds, NOT NASA
   boundaries — rendering regimes only; the physics lives in the visuals):
   PAD 0–3 km dense (fog full, stars off) → LOW 3–15 km haze thinning →
   UPPER 15–50 km horizon clarifies → NEAR-SPACE 50–100 km sky darkens →
   THIN 100 km+ dome ~space, stars gated by daylight only. All transitions are
   continuous in REFERENCE altitude (flightStateAt via prof.alt) — never in
   wall time, shot number, or camera cuts. */
const FOG_BASE_DENSITY = 0.0035; // pad-level FogExp2 density (legacy value, now the F=0 anchor)
const FOG_NIGHT = new THREE.Color(0x02040a);
const FOG_DAY = new THREE.Color(0x060b18);
const FOG_CLOUD_NIGHT = new THREE.Color(0x14171d);
const FOG_CLOUD_DAY = new THREE.Color(0xa8b2bd);
const _fogCol = new THREE.Color(); // cloud-band fog tint scratch (no per-frame alloc)
function updateEnvironment(f, clk, prof) {
  // Tower umbilical swing arms: retract across the final minute of the
  // terminal count (T-60 s -> T-0); ascent starts with arms stowed.
  // (Workstream B will add per-mission arm timing.)
  if (V.towerArms && V.towerArms.length > 0) {
    let swingAngle;
    if (clk && clk.phase === 'countdown') {
      const armFrac = Math.max(0, Math.min(1, (60 - clk.tMinus) / 60));
      swingAngle = armFrac * (Math.PI / 2.6);
    } else {
      const swingFrac = Math.max(0, Math.min(1, (f - 0.07) / 0.06));
      swingAngle = swingFrac * (Math.PI / 2.6);
      if (clk && clk.phase === 'ascent') swingAngle = Math.PI / 2.6;
    }
    V.towerArms.forEach(arm => {
      arm.rotation.y = swingAngle;
    });
  }

  // Step-1 sky state: continuous in camera altitude (no bands, no pop-in).
  // Density thins exponentially; horizon dip follows spherical-Earth geometry.
  const altKm = (prof && isFinite(prof.alt)) ? prof.alt : f * 215;
  const dens = Math.exp(-Math.max(0, altKm) / ATMO_H_KM);
  const cosDip = EARTH_R_KM / (EARTH_R_KM + Math.max(0, altKm));
  const dipY = -Math.sqrt(Math.max(0, 1 - cosDip * cosDip));
  // P5: fog breathes with the same transmission factor as the dome/star path
  // (coherent by construction): full at the pad, negligible in near-space.
  // Cloud-deck transit (~1.5–6 km reference alt): brief white-out as the
  // vehicle punches through — density ×4, tint toward cloud gray/white.
  // Smooth band edges, scalar sets only — no allocation, no pops.
  const transF = Math.max(0, Math.min(1, dens * 1.4));
  const cloudK = smooth01(altKm, 1.2, 2.0) * (1 - smooth01(altKm, 5.0, 8.0));
  try {
    if (V.scene && V.scene.fog) {
      V.scene.fog.density = FOG_BASE_DENSITY * transF * (1 + 3.0 * cloudK);
      const nightFog = !(V.sun && V.sun.dayF > 0.05);
      _fogCol.copy(nightFog ? FOG_NIGHT : FOG_DAY)
        .lerp(nightFog ? FOG_CLOUD_NIGHT : FOG_CLOUD_DAY, cloudK);
      V.scene.fog.color.copy(_fogCol);
    }
  } catch (e) {}
  if (V.skyDome && V.camera) {
    V.skyDome.position.copy(V.camera.position);
    const u = V.skyDome.material.uniforms;
    u.uDens.value = dens;
    u.uDipY.value = dipY;
    u.uLift.value = V._skyLiftS || 0; // plume-lit air (owned by updatePlumes; absolute set, never accumulates)
    // Photo layer rides the exact star gate: invisible at the pad / by day,
    // full in dark near-space. Below-dip earth haze mixes over it downstream.
    try {
      const dg = V.sun ? (1 - V.sun.dayF) : 1;
      u.uMapF.value = (1 - smooth01(dens, 0.12, 0.45)) * dg;
    } catch (e) {}
  }
  if (V.stars && V.camera) {
    V.stars.position.copy(V.camera.position); // zero parallax: correct for infinity
    const su = V.stars.material.uniforms;
    const dayGate = V.sun ? (1 - V.sun.dayF) : 1; // stars hidden by daylight
    su.uVis.value = (1 - smooth01(dens, 0.12, 0.45)) * dayGate;
    su.uDipY.value = dipY; // below-horizon stars fade in-shader (no pop at the limb)
  }
}

function updateHud(f, prof, clk) {
  if (!V.hud) return;
  try {
    let tLabel;
    let pInfo;
    if (clk && clk.phase === 'countdown') {
      tLabel = fmtClock(clk.tMinus, 'T-');
      pInfo = countdownPhaseDetails(clk.tMinus, clk.holding);
    } else {
      // MET is per-vehicle truth (f * endMet); HUD clock replaces the old f*540.
      const metS = f * profileFor(V.lvId).endMet;
      tLabel = fmtClock(metS, 'T+');
      pInfo = phaseDetails(f);
    }

    const eT = V.hud.querySelector('#lhT');
    const eL = V.hud.querySelector('#lhL');
    const eP = V.hud.querySelector('#lhPhase');
    const eSub = V.hud.querySelector('#lhSub');
    const eA = V.hud.querySelector('#lhAlt');
    const eV = V.hud.querySelector('#lhVel');
    const eDown = V.hud.querySelector('#lhDown');
    const eG = V.hud.querySelector('#lhG');

    if (eT) eT.textContent = tLabel;
    if (eL) {
      if (clk && clk.phase === 'countdown') {
        eL.textContent = (clk.holding ? 'HOLD · ' : '') + fmtClock(clk.lMinus, 'L-');
        eL.style.display = '';
      } else eL.style.display = 'none';
    }
    if (eP) eP.textContent = pInfo.phase;
    if (eSub) eSub.textContent = pInfo.sub;
    if (eA) eA.textContent = fmtAlt(prof.alt);
    if (eV) eV.textContent = Math.round(prof.vel) + ' m/s';
    if (eDown) eDown.textContent = Math.round(prof.downrange) + ' km';
    if (eG) eG.textContent = prof.gForce.toFixed(1) + ' G';

    // Update active stage badge
    const badgeMap = {
      'S1+BOOSTERS': ['badge-b', 'badge-s1'],
      'STAGE 1': ['badge-s1'],
      'INTERSTAGE': ['badge-s1', 'badge-s2'],
      'STAGE 2': ['badge-s2'],
      'STAGE 2 + PAYLOAD': ['badge-s2', 'badge-sc'],
      'SPACECRAFT NOMINAL': ['badge-sc']
    };
    const activeBadges = badgeMap[pInfo.stage] || [];
    ['badge-b', 'badge-s1', 'badge-s2', 'badge-sc'].forEach(bId => {
      const el = V.hud.querySelector('#' + bId);
      if (el) {
        if (activeBadges.includes(bId)) el.classList.add('badge-on');
        else el.classList.remove('badge-on');
      }
    });
  } catch (e) {}
}

function ensureHud() {
  if (V.hud && V.hud.isConnected) return V.hud;
  const d = document.createElement('div');
  d.className = 'launch-hud launch-hud-v2';
  d.innerHTML =
    '<div class="lh-header">' +
      '<div class="lh-time-block"><span class="lh-t" id="lhT">T-10:00</span><br><span class="lh-l" id="lhL" style="font-size:11px;letter-spacing:.08em;color:var(--ds-text-2,#8ca0b8)">L-11:30</span></div>' +
      '<div class="lh-phase-block">' +
        '<div class="lh-phase" id="lhPhase">IGNITION SEQUENCE</div>' +
        '<div class="lh-sub" id="lhSub">FLAME TRENCH DELUGE & MAIN ENGINE IGNITION</div>' +
      '</div>' +
    '</div>' +
    '<div class="lh-stages-bar">' +
      '<span class="lh-stage-badge" id="badge-b">BOOSTERS</span>' +
      '<span class="lh-stage-badge" id="badge-s1">STAGE 1</span>' +
      '<span class="lh-stage-badge" id="badge-s2">STAGE 2</span>' +
      '<span class="lh-stage-badge" id="badge-sc">PAYLOAD</span>' +
    '</div>' +
    '<div class="lh-tele-grid">' +
      '<div class="lh-tele-cell"><span class="lh-label">ALTITUDE</span><b id="lhAlt">0.0 km</b></div>' +
      '<div class="lh-tele-cell"><span class="lh-label">VELOCITY</span><b id="lhVel">0 m/s</b></div>' +
      '<div class="lh-tele-cell"><span class="lh-label">DOWNRANGE</span><b id="lhDown">0 km</b></div>' +
      '<div class="lh-tele-cell"><span class="lh-label">ACCEL</span><b id="lhG">1.0 G</b></div>' +
    '</div>' +
    '<div class="lh-note">Vehicle: ' + String(V.vehicleName || 'Launch vehicle') + ' &middot; ' +
      'Terminal count T-10:00 compressed illustration (built-in hold + GLS/ALS handoff) then ascent. ' +
      'Performance anchored to NASA LSP data.</div>' +
    '<button class="btn ghost lh-skip" id="lhSkip">SKIP TO ORBIT &#9656;</button>';

  V.mount.appendChild(d);
  V.hud = d;
  const skip = d.querySelector('#lhSkip');
  if (skip) skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
  return d;
}

/* Ignition beat (countdown): engines light BEFORE release — the real
   staggered start. Wall-based final 2 wall-s (compressed tMinus would flash it
   for ~0.1 s). Core + booster plumes (all ground-lit; upper stage stays dark),
   rocket stays bolted. Seeds ascent ignition clocks (t0/wasOn/thrS) and
   V._ignK (read by pad FX + countdown audio) so T+0 continues seamlessly. */
function updateIgnition(tEl, now) {
  const S = V.stages;
  const countS = V.countS || COUNT_S;
  const ignK = Math.max(0, Math.min(1, (tEl - (countS - 2)) / 2));
  V._ignK = ignK;
  if (!(ignK > 0) || !V.corePlume || !S || !S.stage1) {
    if (V.corePlume) V.corePlume.visible = false;
    if (V.vacPlume) V.vacPlume.visible = false;
    if (V.padFireball) V.padFireball.material.opacity = 0;
    V._skyLiftS = 0;
    if (V.boosterPlumes) V.boosterPlumes.forEach(bp => { if (bp) bp.visible = false; });
    if (V.fireLight) V.fireLight.intensity = 0;
    if (V.fireLight && V.trenchPos) V.fireLight.position.copy(V.trenchPos);
    if (V.nozzleMat) V.nozzleMat.emissive.setRGB(0, 0, 0);
    return;
  }
  const tSec = now * 0.001;
  V.rocket.updateMatrixWorld(true);
  // Core plume at the bell mouth (same anchor as ascent).
  _pp0.set(0, (V.corePlume.userData.exitY != null) ? V.corePlume.userData.exitY : -0.2, 0);
  S.stage1.localToWorld(_pp0);
  V.corePlume.position.copy(_pp0);
  S.stage1.getWorldQuaternion(_bq);
  V.corePlume.quaternion.copy(_bq);
  V.corePlume.visible = true;
  V.corePlume.scale.set(1, 0.55 + 0.45 * ignK, 1);
  const gd = V.corePlume.userData;
  gd.thrS = ignK;
  if (!gd.wasOn) { gd.t0 = tSec; gd.wasOn = true; }
  const tPlume = tSec - (gd.t0 != null ? gd.t0 : tSec);
  const ch = V.corePlume.children;
  for (let ci = 0; ci < ch.length; ci++) {
    drivePlume(ch[ci], tPlume, Math.max(0.001, ignK), 1);
    const cm = ch[ci];
    if (cm && cm.material && cm.material.uniforms && cm.material.uniforms.uExposure) {
      if (cm.userData.expo0 == null) cm.userData.expo0 = cm.material.uniforms.uExposure.value;
      cm.material.uniforms.uExposure.value = cm.userData.expo0 * (1 + 0.8 * ignK);
    }
  }
  if (V.nozzleMat) V.nozzleMat.emissive.setRGB(1.6 * ignK, 0.62 * ignK, 0.16 * ignK);
  const cGlow = V.corePlume.userData.glow;
  if (cGlow && cGlow.material && cGlow.material.uniforms) {
    const gu = cGlow.material.uniforms;
    gu.uGlow.value = 1.1 * (0.35 + 0.9 * ignK);
    const air = V.corePlume.userData.air;
    if (air && air.material && air.material.uniforms) {
      air.material.uniforms.uGlow.value = 0.5 * (0.35 + 0.9 * ignK);
      if (air.material.uniforms.uLen && gu.uLen) air.material.uniforms.uLen.value = gu.uLen.value;
    }
    if (gu.uLen && V.corePlume.userData.len) gu.uLen.value = V.corePlume.userData.len * V.corePlume.scale.y;
    if (gu.uTint) gu.uTint.value.copy(_C_GLOW_WARM);
    V._skyLiftS = 0.05 * ignK;
  }
  // Booster plumes at their bell mouths (same anchors as ascent; i*1.7 keeps
  // the staggered-light feel). Ascent headK takes over seamlessly at MET 4+.
  if (V.boosterPlumes && S.boosters) {
    for (let i = 0; i < S.boosters.length; i++) {
      const bp = V.boosterPlumes[i], bMesh = S.boosters[i];
      if (!bp || !bMesh) continue;
      _pp1.set(0, (bMesh.userData && isFinite(bMesh.userData.exitY)) ? bMesh.userData.exitY : -0.1, 0);
      bMesh.localToWorld(_pp1);
      bp.position.copy(_pp1);
      bMesh.getWorldQuaternion(_bq);
      bp.quaternion.copy(_bq);
      bp.visible = true;
      bp.scale.set(1, 0.55 + 0.45 * ignK, 1);
      if (!bp.userData.wasOn) { bp.userData.t0 = tSec; bp.userData.wasOn = true; }
      const tB = (tSec - (bp.userData.t0 != null ? bp.userData.t0 : tSec)) + i * 1.7;
      const bch = bp.children;
      for (let ci = 0; ci < bch.length; ci++) drivePlume(bch[ci], tB, Math.max(0.001, ignK), 1);
      const bGlow = bp.userData.glow;
      if (bGlow && bGlow.material && bGlow.material.uniforms) {
        bGlow.material.uniforms.uGlow.value = 0.55 * (0.35 + 0.9 * ignK);
        if (bp.userData.len) bGlow.material.uniforms.uLen.value = bp.userData.len * (bp.scale.y || 1);
      }
    }
  }
  if (V.vacPlume) V.vacPlume.visible = false;
  // Trench-anchored fire light + fireball ramp (ascent curve hands off at T+0).
  if (V.fireLight) {
    const anchor = V.trenchPos || _trenchFallback;
    let lx = anchor.x, ly = anchor.y, lz = anchor.z;
    if (V.camera) {
      const ox = V.camera.position.x - lx, oz = V.camera.position.z - lz;
      const om = Math.sqrt(ox * ox + oz * oz) || 1;
      lx += (ox / om) * 3.0; lz += (oz / om) * 3.0; ly += 2.0;
    }
    V.fireLight.position.set(lx, ly, lz);
    V.fireLight.intensity = 650 * ignK * fireProxK();
    V.fireLight.color.setHex(0xff6a10);
  }
  if (V.padFireball) {
    const anchor = V.trenchPos || _trenchFallback;
    V.padFireball.position.set(anchor.x, anchor.y + 1.2, anchor.z);
    const vkS = (V.rocket && V.rocket.scale && isFinite(V.rocket.scale.x) && V.rocket.scale.x > 0)
      ? V.rocket.scale.x : SITE_VK;
    const fsc = (9 + ignK * 7) * (vkS / (12 / 71.6));
    V.padFireball.scale.set(fsc * 1.25, fsc * 0.85, 1);
    V.padFireball.material.opacity = 0.40 * ignK;
    V.padFireball.material.color.setHex(0xfff3d8);
  }
}

/* Countdown shot director (camera-directions doc §6): 6 hard cuts across the
   14 s count, landed near GLS callouts. Times are full-count wall seconds;
   reduced-motion maps onto the same table (same order, compressed). Look
   heights key off the live stack top so SLS and F9 both frame. Per-shot FOV
   gives the telephoto compression (STACK shots) vs wide establishing.
   Restores FOV 48 on the first ascent frame (sentinel -2). */
const COUNT_SHOTS = [
  { t0: 0,  t1: 2.33, name: 'PAD-WIDE-STATIC',  frameWide: true, fov: 48, shake: 0 },
  { t0: 2.33,  t1: 4.67, name: 'CAPSULE-LOW-UP',   lookT: 'topWide', fov: 50, shake: 0 },
  { t0: 4.67, t1: 7.0, name: 'ORION-DETAIL-MED', lookT: 'level',  fov: 10, shake: 0 },
  { t0: 7.0,  t1: 9.33, name: 'TOWER-TOP-DOWN',   towerTop: true, fov: 50, shake: 0 },
  { t0: 9.33, t1: 11.67, name: 'PAD-WIDE-RETURN',  frameWide: true, zoom: 0.8, lookH: 0.56, fov: 44, shake: 0 },
  { t0: 11.67, t1: 14.01, name: 'BASE-UP-VERTICAL', lookT: 'bellBase', fov: 32, shake: 0.8 }
];
/* Rumble basis (expert method v2): the old 0.06 u at ~4.7 u standoff is now an
   angle, so shake reads constant on screen at 10–14 u. The dropped 50/fov
   factor double-counted (longer lenses already magnify the same angle). */
const RUMBLE_RAD = 0.03 / 4.7; // halved 2026-10-06: full rate read violent on screen
function directCountdownCam(tEl, now) {
  if (!V.camera) return;
  const span = V.countS || COUNT_S;
  const ts = Math.min(COUNT_S, Math.max(0, tEl / span * COUNT_S));
  let si = 0;
  for (let i = 0; i < COUNT_SHOTS.length; i++) { if (ts >= COUNT_SHOTS[i].t0) si = i; }
  const sh = COUNT_SHOTS[si];
  const baseY = (V.rocket && V.rocket.userData && V.rocket.userData.baseY) || SITE_DECK_Y;
  const cfg = (typeof LV_STACKS !== 'undefined' && (LV_STACKS[V.lvId] || LV_STACKS.f9)) || { h: 70 };
  const vk = (V.rocket && V.rocket.scale && isFinite(V.rocket.scale.x) && V.rocket.scale.x > 0)
    ? V.rocket.scale.x : SITE_VK;
  const topY = baseY + cfg.h * vk;
  let px = 0, py = 6, pz = 0;
  let lx, ly, lz;
  const stackH = Math.max(1, topY - baseY); // live stack height (SLS ≈ F9 × 1.6)
  if (sh.frameWide) {
    // Expert correction (measurable target): stack fills 85% frame height,
    // vehicle ~51% width, tower a 58–69% strip, crown cropped. Distance solved
    // per vehicle from live stack height — not a hardcoded dolly.
    const dist = (stackH / 0.85 / 2) / Math.tan((sh.fov * Math.PI / 180) / 2) * (sh.zoom || 1);
    const ax = 0.59, ay = 0.10, az = 0.80;
    const al = Math.sqrt(ax * ax + ay * ay + az * az);
    lx = -0.4; ly = baseY + stackH * (sh.lookH || 0.52); lz = 0;
    px = lx + ax / al * dist; py = ly + ay / al * dist; pz = lz + az / al * dist;
  } else if (sh.lookT === 'topWide') {
    // Low-up that survives tall stacks: horizontal offset scales with height
    // (SLS ≈ ×1.6) so the tilt stays ~40° instead of keystoning to 54°.
    const k = Math.max(1, Math.min(stackH / 7.5, 1.6));
    px = 4.5 * k; py = baseY + 0.8; pz = 5.5 * k;
    lx = 0; ly = topY - 0.5; lz = 0;
  } else if (sh.lookT === 'level') {
    // True telephoto: same 4.55 u framing from 26 u at FOV 10, camera level
    // with the look point (no downward tilt, tower drops out).
    px = 16.5; py = topY - 2.5; pz = 19.8;
    lx = 0; ly = topY - 2.5; lz = 0;
  } else if (sh.lookT === 'bellBase') {
    // Direction-A standoff (expert): 10 u out at az −10°, baseY-relative
    // heights so every vehicle frames. The lone ignition closeup — held
    // uncut through the full ramp (no cut mid-ignition).
    const ba = -10 * Math.PI / 180;
    px = Math.sin(ba) * 10; pz = Math.cos(ba) * 10;
    py = baseY + 0.8;
    lx = 0; ly = baseY + 2.8; lz = 0;
  } else if (sh.towerTop) {
    // Tower-top down-view: rides just off the ML tower crown (measured at
    // verify-time; procedural-tower fallback). Look height centers the
    // stack's angular span as seen from the camera (≈68% SLS, ≈62% F9).
    const tt = V._towerTop || { x: 4.9, y: 13.4, z: 1.5 };
    px = tt.x + 1.6; py = tt.y + 0.6; pz = tt.z + 1.6;
    const tD = Math.max(0.5, Math.hypot(px, pz));
    const aTop = Math.atan2(py - topY, tD), aBase = Math.atan2(py - baseY, tD);
    lx = 0; ly = py - tD * Math.tan((aTop + aBase) * 0.5); lz = 0;
  } else { lx = 0; ly = baseY + stackH * 0.52; lz = 0; }
  // Still heads: no pan/drift by owner direction — position is the table
  // value, motion is ignition rumble only (below).
  if (V._cshot !== si) { // hard cut: snap FOV with the shot
    V._cshot = si;
    if (V.camera.fov !== sh.fov) { V.camera.fov = sh.fov; V.camera.updateProjectionMatrix(); }
  }
  // Rumble on the LOOK target (angular, expert method v2): offset by an angle
  // (RUMBLE_RAD) scaled by the look distance, so shake reads constant on
  // screen at any standoff. Ramp is the final-2-s ignition ramp. Dead before
  // wall 12 by construction (shots 1–5 carry shake 0); zero in reduced.
  // Applied along the camera-right vector + world up — never the camera.
  const reduced = span < COUNT_S;
  if (!reduced && (sh.shake || 0) > 0) {
    const ramp = Math.min(Math.max((ts - 12) / 2, 0), 1);
    if (ramp > 0) {
      _pp0.set(lx - px, ly - py, lz - pz); // sequential reuse: ignition is done with it
      const lD = Math.max(0.5, _pp0.length());
      _pp0.divideScalar(lD);
      let rxx = -_pp0.z, rzz = _pp0.x;
      const rl = Math.max(1e-4, Math.hypot(rxx, rzz));
      const k = RUMBLE_RAD * ramp * sh.shake * lD;
      const ox = k * 0.6 * (Math.sin(ts * 69.1) * 0.6 + Math.sin(ts * 106.8 + 1.3) * 0.4);
      const oy = k * (Math.sin(ts * 71.6 + 0.7) * 0.6 + Math.sin(ts * 103.7 + 2.1) * 0.4);
      lx += rxx / rl * ox; lz += rzz / rl * ox; ly += oy;
    }
  }
  V.camera.position.set(px, py, pz);
  V.camera.lookAt(lx, ly, lz);
}
/* Handoff pose evaluators (expert T+12 repair): the intro and look-back
   computations, factored to write _hPA/_hLA and _hPB/_hLB so frame() can
   play either solo or slerp between them. Behavior identical to the inline
   versions they replace (same rumble, lag, reduced-motion gates). */
function introCamPose(f, now, sdt, fIntro) {
  const baby = (V.rocket.userData && V.rocket.userData.baseY) || SITE_DECK_Y;
  const ik = Math.max(0, Math.min(1, f / Math.max(1e-4, fIntro)));
  const redI = (V.ascS || ASCENT_S) < ASCENT_S;
  const ie = ik * ik * (3 - 2 * ik);
  const id = 10 + 4 * ie, ia = 37.3 * Math.PI / 180;
  _hPA.set(Math.sin(ia) * id, baby + 0.3 + 2.0 * ie, Math.cos(ia) * id);
  if (redI) { _hLA.set(0, baby + 2.5, 0); return; }
  if (ik < 0.25) V._il = undefined; // re-seed the lag at intro start
  const vehY = V.rocket.position.y || baby;
  const goal = baby + 2.5 + Math.max(0, vehY - baby) * 0.75;
  V._il = (V._il === undefined) ? goal : V._il + (goal - V._il) * (1 - Math.exp(-sdt / 0.7));
  const maxY = _hPA.y + Math.hypot(_hPA.x, _hPA.z) * Math.tan(1.22);
  const lookY = Math.min(V._il, maxY);
  _pp0.set(0 - _hPA.x, lookY - _hPA.y, 0 - _hPA.z);
  const iD = Math.max(0.5, _pp0.length());
  const env = (0.8 + 0.4 * Math.min(ik / 0.12, 1)) * (1 - 0.75 * Math.pow(ik, 1.2));
  const ik2 = RUMBLE_RAD * env * iD;
  const tS = now * 0.001;
  const iox = ik2 * 0.6 * (Math.sin(tS * 69.1) * 0.6 + Math.sin(tS * 106.8 + 1.3) * 0.4);
  const ioy = ik2 * (Math.sin(tS * 71.6 + 0.7) * 0.6 + Math.sin(tS * 103.7 + 2.1) * 0.4);
  _hLA.set(-(_pp0.z / iD) * iox, lookY + ioy, (_pp0.x / iD) * iox);
}
function lookbackCamPose(now) {
  // Wall-graze (owner + reference): lens just off the skin (body radius +
  // 0.35) staring nearly straight down past it — mirrored to put the wall on
  // the LEFT (body east of lens would read right; lens west reads left).
  // Pad/smoke open right-below, bell bottom-center. Look rides WITH the
  // vehicle so framing holds through the climb.
  const rp = V.rocket.position;
  const lcfg = (typeof LV_STACKS !== 'undefined' && (LV_STACKS[V.lvId] || LV_STACKS.f9)) || { coreD: 3.7, h: 70 };
  const lvk = (V.rocket && V.rocket.scale && isFinite(V.rocket.scale.x) && V.rocket.scale.x > 0)
    ? V.rocket.scale.x : SITE_VK;
  const bodyR = Math.max(0.1, (lcfg.coreD || 3.7) * 0.5 * lvk);
  _hPB.set(rp.x - bodyR - 0.35, rp.y + 1.2, rp.z);
  const tx = rp.x - bodyR - 0.2, ty = rp.y - 1.8, tz = rp.z + 0.6;
  const redL = (V.ascS || ASCENT_S) < ASCENT_S;
  if (redL) { _hLB.set(tx, ty, tz); return; }
  _pp0.set(tx - _hPB.x, ty - _hPB.y, tz - _hPB.z);
  const lD2 = Math.max(0.5, _pp0.length());
  const lk = RUMBLE_RAD * 0.4 * lD2;
  const tW = now * 0.001;
  const lox = lk * 0.6 * (Math.sin(tW * 69.1) * 0.6 + Math.sin(tW * 106.8 + 1.3) * 0.4);
  const loy = lk * (Math.sin(tW * 71.6 + 0.7) * 0.6 + Math.sin(tW * 103.7 + 2.1) * 0.4);
  _hLB.set(tx + -(_pp0.z / lD2) * lox, ty + loy, tz + (_pp0.x / lD2) * lox);
}
/* ══════════════════════════════════════════════════════════════
   MAIN ANIMATION LOOP (Raf)
   ══════════════════════════════════════════════════════════════ */
/* ?perf=1 debug overlay (zero cost when off): rolling avg + p95 render ms,
   renderer.info.memory + render.calls, THREE.REVISION + useLegacyLights.
   window.__launchDbg = { renderer } is exposed ONLY under this flag for the
   console context-loss drill:
   const e = __launchDbg.renderer.getContext().getExtension('WEBGL_lose_context');
   e.loseContext(); setTimeout(() => e.restoreContext(), 1000); */
const PERF = (() => {
  try { return new URLSearchParams(window.location.search || '').has('perf'); }
  catch (e) { return false; }
})();
/* ?perf=1&noshadow=1: skip enabling the shadow map (init-time only — shadows
   are the largest GPU estimate, so this isolates them with no mid-run
   recompile). A post-Phase-A-only baseline is acceptable. */
const PERF_NOSHADOW = (() => {
  try { return new URLSearchParams(window.location.search || '').has('noshadow'); }
  catch (e) { return false; }
})();
/* GPU timer (?perf=1 only, zero cost off): EXT_disjoint_timer_query_webgl2
   ring. performance.now() around render() is CPU submission only — this is
   the actual iGPU number. Falls back to rAF-delta p95 note when unsupported. */
function makeGpuTimer(renderer) {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const ring = [null, null, null, null];
    let w = 0, sum = 0, n = 0, max = 0;
    return {
      begin() {
        try {
          if (ring[w]) gl.deleteQuery(ring[w]);
          const q = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          ring[w] = q;
        } catch (e) {}
      },
      end() {
        try { gl.endQuery(ext.TIME_ELAPSED_EXT); } catch (e) {}
        w = (w + 1) & 3;
        this.poll();
      },
      poll() {
        try {
          for (let i = 0; i < 4; i++) {
            const q = ring[i];
            if (!q || !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
              sum += ms; n++;
              if (ms > max) max = ms;
            }
            try { gl.deleteQuery(q); } catch (e) {}
            ring[i] = null;
          }
        } catch (e) {}
      },
      avg() { return n ? sum / n : NaN; }, max() { return max; },
      dispose() {
        try { for (let i = 0; i < 4; i++) { if (ring[i]) gl.deleteQuery(ring[i]); ring[i] = null; } } catch (e) {}
      }
    };
  } catch (e) { return null; }
}
function perfSample(ms) {
  if (!PERF) return;
  try {
    if (!V._perfArr) { V._perfArr = new Float32Array(120); V._perfIdx = 0; V._perfN = 0; }
    V._perfArr[V._perfIdx] = ms;
    V._perfIdx = (V._perfIdx + 1) % 120;
    if (V._perfN < 120) V._perfN++;
    const now = performance.now();
    if (V._perfLast && now - V._perfLast < 500) return;
    V._perfLast = now;
    let sum = 0;
    for (let i = 0; i < V._perfN; i++) sum += V._perfArr[i];
    const avg = V._perfN ? sum / V._perfN : 0;
    // p95 via insertion-free selection on a static scratch (120 max, 2 Hz — fine).
    let p95 = avg;
    try {
      const tmp = Array.prototype.slice.call(V._perfArr.subarray(0, V._perfN));
      tmp.sort((a, b) => a - b);
      p95 = tmp[Math.min(tmp.length - 1, Math.floor(tmp.length * 0.95))] || avg;
    } catch (e) {}
    let mem = null, calls = 0;
    try { mem = V.renderer.info.memory; calls = V.renderer.info.render.calls; } catch (e) {}
    let rev = '?', leg = '?';
    try { rev = THREE.REVISION; } catch (e) {}
    try { leg = String(V.renderer.useLegacyLights); } catch (e) {}
    let el = V._perfEl;
    if (!el || !el.isConnected) {
      const host = (V.canvas && V.canvas.parentElement) || document.body;
      el = document.createElement('div');
      el.style.cssText = 'position:absolute;right:12px;bottom:12px;z-index:9;pointer-events:none;'
        + 'font:11px/1.6 monospace;color:#cfe3ff;background:rgba(2,6,12,.6);'
        + 'border:1px solid rgba(140,180,255,.3);border-radius:4px;padding:6px 10px;white-space:pre;';
      host.appendChild(el);
      V._perfEl = el;
    }
    el.textContent = 'render ' + avg.toFixed(2) + ' ms avg / ' + p95.toFixed(2) + ' p95'
      + ((V._gpuT && isFinite(V._gpuT.avg())) ? ' · GPU ' + V._gpuT.avg().toFixed(2) + '/' + V._gpuT.max().toFixed(2) : ' · GPU n/a (rAF p95 above)')
      + '\n'
      + 'mem geo ' + (mem ? mem.geometries : '?') + ' tex ' + (mem ? mem.textures : '?')
      + ' calls ' + calls + '\n'
      + 'three r' + rev + ' legacyLights ' + leg;
  } catch (e) {}
}
function frame(now) {
  if (!V.active) return;
  V.raf = requestAnimationFrame(frame);
  const dt = 0.016;
  let tEl = (now - V.t0) / 1000;
  // ?shot=1..6 capture aid (URL-gated, zero normal-load effect): freeze the
  // count at the cut midpoint so each of the six cuts can be screenshotted.
  if (V._shotHold != null && V._shotHold >= 0 && V._shotHold < COUNT_SHOTS.length) {
    const hc = COUNT_SHOTS[V._shotHold];
    tEl = ((hc.t0 + Math.min(hc.t1, COUNT_S)) / 2 / COUNT_S) * (V.countS || COUNT_S);
  }
  const clk = countdownClock(tEl);
  const totalDur = (V.countS || COUNT_S) + (V.ascS || ASCENT_S);
  const done = tEl >= totalDur;
  // Ascent fraction runs only after the terminal-count beat.
  // Ascent fraction: wall omega → MET wall-map → f (expert pad method).
  // f = MET/endMet is unchanged downstream, so all MET-keyed windows hold.
  const omega = clk.phase === 'countdown' ? 0 : Math.min(1, (tEl - (V.countS || COUNT_S)) / (V.ascS || ASCENT_S));
  let f = omega;
  try {
    if (clk.phase !== 'countdown' && typeof globalThis !== 'undefined' &&
        typeof globalThis.padParams === 'function') {
      const _P = globalThis.padParams(V.lvId);
      f = metAtOmega(_P, profileFor(V.lvId).endMet, omega) / profileFor(V.lvId).endMet;
    }
  } catch (e) { f = omega; }
  const prof = clk.phase === 'countdown'
    ? { alt: 0, vel: 0, downrange: 0, gForce: 1.0, met: 0 }
    : ascentProfile(f, V.lvId);
  // Smoke wall clock (expert smoke method): measured frame delta, clamped for
  // hitches, scaled so reduced-motion preserves shape (nomScale = 1 normal).
  const rawDt = (V._lastNow != null && isFinite(V._lastNow)) ? Math.max(0, (now - V._lastNow) / 1000) : 0.016;
  V._lastNow = now;
  V.nomScale = clk.phase === 'countdown' ? COUNT_S / (V.countS || COUNT_S) : ASCENT_S / (V.ascS || ASCENT_S);
  const sdt = smokeDt(rawDt);
  // Nominal ascent-wall seconds (expert bankAge domain): negative pre-release,
  // omega×42 in ascent — reduced-motion shape-preserving by construction.
  V._tw = clk.phase === 'countdown' ? tEl - (V.countS || COUNT_S) : omega * ASCENT_S;

  if (clk.phase === 'countdown') {
    // Pad hold-down: vehicle stays bolted; staging reset to attached state.
    if (V.rocket) {
      const baseY = V.rocket.userData.baseY || SITE_DECK_Y;
      V.rocket.position.set(0, baseY, 0);
      V.rocket.rotation.set(0, 0, 0);
    }
    updateStaging(0, now);
    // Trench + flame-bed smoke first (f = 0 births ignition smoke via V._ignK;
    // fireball reset below is overridden by updateIgnition right after).
    updateSmokeParticles(0, now, sdt, prof);
    // Ignition beat: flame BEFORE release (updateIgnition hides all when idle).
    updateIgnition(tEl, now);
    updateEnvironment(0, clk);
    updateCountdownAudio(clk.tMinus, V._ignK || 0);
    updatePadFx(clk, 0, sdt);
    blinkBeacons(now);
    // Countdown shot director (6 cuts on the count — see COUNT_SHOTS).
    directCountdownCam(tEl, now);
    updateHud(0, prof, clk);
    updateExposure(sdt);
    if (V.chaseFill) V.chaseFill.intensity = 0; // spots-only through the count
    if (V.renderer && V.scene && V.camera) {
      const w = V.canvas.clientWidth || 800, h = V.canvas.clientHeight || 450;
      if (V.camera.aspect !== w / h) {
        V.camera.aspect = w / h;
        V.camera.updateProjectionMatrix();
        V.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
        V.renderer.setSize(w, h, false);
      }
      V.renderer.render(V.scene, V.camera);
    }
    return;
  }

  // 1. Rocket Kinematics — expert track (launch-anim-data.js): pchip rise/x/
  // rotZ, pure in f. Tower clear lands at f 0.075; TWR shaping retired here
  // (kept in the HUD g-profile + plume intensity).
  const ABP = animBasePos(f);
  if (V.rocket) {
    V.rocket.position.y = ABP.y;
    V.rocket.position.x = ABP.x;
    V.rocket.rotation.z = pchipEval(TRACKS.rz, f);
  }

  // 2. Staging & Separations
  updateStaging(f, now);

  // 3. Rocket Fire & Plumes
  updatePlumes(f, now, prof, dt);

  // 4. Smoke & Contrails
  updateSmokeParticles(f, now, sdt, prof);

  // 4b. Ground-system FX (deluge lingers into early ascent; TSMU stowed)
  updatePadFx(clk, f, sdt);
  blinkBeacons(now);

  // 5. Environment & Atmosphere (altitude-keyed)
  updateEnvironment(f, clk, prof);

  // 6. Sound Synthesis
  updateAudio(f);

  // 7. Cinematic Camera Choreography — expert 6-shot track with hard cuts.
  // Count-director FOV is restored here on the first ascent frame.
  if (V.camera && V._cshot !== -2) {
    V._cshot = -2;
    if (V.camera.fov !== 48) { V.camera.fov = 48; V.camera.updateProjectionMatrix(); }
  }
  // shake keys are normalised 0..1 (existing amplitudes kept).
  // DEVIATION #1 (for expert sign-off): past f 0.92 the authored look point
  // runs ~9 units ahead of the vehicle (payload only travels 3.4), leaving
  // the stack out of frame at the climax. Blend to vehicle-centre following
  // over f 0.92→1.0 so SECO/sep stay on screen.
  // 6b/6c. Intro → look-back dispatch (expert T+12 handoff): solo intro
  // below MET 10.8, pose/quaternion/FOV blend 10.8–13.8, look-back solo to
  // MET 60, authored after. The authored path re-asserts FOV 48 below.
  const fIntro = 12 / Math.max(1, profileFor(V.lvId).endMet);
  const fLook = 60 / Math.max(1, profileFor(V.lvId).endMet); // look-back out
  if (V.camera && V.rocket && f < fIntro) {
    // Solo intro (FOV 30). Hard cut out (owner direction — the blend is
    // reverted; the FX staggers below carry the continuity instead).
    introCamPose(f, now, sdt, fIntro);
    V.camera.position.copy(_hPA);
    V.camera.lookAt(_hLA);
    if (V.camera.fov !== 30) { V.camera.fov = 30; V.camera.updateProjectionMatrix(); }
  } else if (V.camera && V.rocket && f < fLook) {
    lookbackCamPose(now);
    V.camera.position.copy(_hPB);
    V.camera.lookAt(_hLB);
    if (V.camera.fov !== 55) { V.camera.fov = 55; V.camera.updateProjectionMatrix(); }
    // (pose evaluated in lookbackCamPose above — no inline duplicate)
  } else if (V.camera && V.rocket) {
    if (V.camera.fov !== 48) { V.camera.fov = 48; V.camera.updateProjectionMatrix(); }
    const cpx = evalCutTrack(TRACKS.camPos[0], f);
    const cpy = evalCutTrack(TRACKS.camPos[1], f);
    const cpz = evalCutTrack(TRACKS.camPos[2], f);
    let lkx = evalCutTrack(TRACKS.camLook[0], f);
    let lky = evalCutTrack(TRACKS.camLook[1], f);
    let lkz = evalCutTrack(TRACKS.camLook[2], f);
    // P2.1 follow-offset (NOT a redesign): the authored track was composed
    // against the old rise shape; shift pos+look rigidly by
    // (reference-driven rise − authored rise) so relative framing is preserved
    // exactly while the vehicle follows reference altitude.
    // Bounded ≈ ±13u (verified F9/SLS); 0 at f=0/1 (endpoints exact).
    const dRise = riseFromFlight(f) - pchipEval(TRACKS.rise, f);
    if (f > 0.92) {
      const bk = Math.min(1, (f - 0.92) / 0.08);
      const bs = bk * bk * (3 - 2 * bk);
      const rz = pchipEval(TRACKS.rz, f);
      const ax = -Math.sin(rz), ay = Math.cos(rz);
      const bp = animBasePos(f);
      const cx = bp.x + ax * 6, cy = bp.y + ay * 6 + 2.5;
      lkx = lkx * (1 - bs) + cx * bs;
      lky = lky * (1 - bs) + cy * bs;
      lkz = 0;
    }
    const shn = evalCutTrack(TRACKS.camShake, f);
    // Micro-fast vibration (owner direction): ~11/17 Hz at ±0.045 u — ground
    // trembles, never waves. (Low rumble read as rolling; 12 Hz judder at
    // ±0.45 was the original fault — amplitude is the fix, not frequency.)
    const shx = shn * 0.045 * Math.sin(now * 0.07);
    const shy = shn * 0.035 * Math.sin(now * 0.11 + 1);

    V.camera.position.set(cpx + shx, cpy + dRise + shy, cpz);
    V.camera.lookAt(lkx, lky + dRise, lkz);
  }

  // 8. HUD & Telemetry (MET from T-0; countdown beat handled above)
  updateHud(f, prof, clk);

  // 8b. Eye adaptation before the frame goes out (Phase 1; intro pins 0.55)
  updateExposure(sdt, f);

  // 8c. Chase fill follows the camera (never pitch black off-plume).
  // Distance-compensated: physical decay (~d^1.8) would kill a fixed light
  // in the far chase shots, so hold illuminance constant at ~0.4.
  if (V.chaseFill && V.camera && V.rocket) {
    V.chaseFill.position.copy(V.camera.position);
    const rdx = V.camera.position.x - V.rocket.position.x;
    const rdy = V.camera.position.y - V.rocket.position.y;
    const rdz = V.camera.position.z - V.rocket.position.z;
    const rd = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
    V.chaseFill.intensity = Math.min(800, 0.10 * Math.pow(Math.max(rd, 0.5), 1.8))
      * smooth01(f, 0.02, 0.06);
  }

  // 9. Render WebGL scene
  if (V.renderer && V.scene && V.camera) {
    const w = V.canvas.clientWidth || 800, h = V.canvas.clientHeight || 450;
    if (V.camera.aspect !== w / h) {
      V.camera.aspect = w / h;
      V.camera.updateProjectionMatrix();
      V.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
      V.renderer.setSize(w, h, false);
    }
    const _pf0 = PERF ? performance.now() : 0;
    if (PERF && V._gpuT) { try { V._gpuT.begin(); } catch (e) {} }
    V.renderer.render(V.scene, V.camera);
    if (PERF && V._gpuT) { try { V._gpuT.end(); } catch (e) {} }
    if (PERF) perfSample(performance.now() - _pf0);
  }

  if (done && !V.done) finish();
}

function finish() {
  if (!V.active || V.done) return;
  V.done = true;
  const cb = V.onDone;
  stop();
  try { if (cb) cb(); } catch (e) {}
}

function stop() {
  V.active = false;
  if (V.raf) cancelAnimationFrame(V.raf);
  V.raf = 0;
  stopAudio();
  try {
    if (V.renderer) { V.renderer.dispose(); V.renderer.forceContextLoss(); }
  } catch (e) {}
  V.renderer = V.scene = V.camera = V.canvas = null;
  try { if (V._gpuT) { try { V._gpuT.dispose(); } catch (e) {} } } catch (e2) {}
  V._gpuT = null;
  try { if (PERF) { try { delete window.__launchDbg; } catch (e) {} } } catch (e2) {}
  V._perfArr = null; V._perfEl = null; V._perfLast = 0;
  // Dispose plume cones + glow quads BEFORE clearing refs (glow quads ride
  // as children, so dispose whole trees; clearing first would leak).
  try {
    const trees = [];
    if (V.corePlume) trees.push(V.corePlume);
    if (V.vacPlume) trees.push(V.vacPlume);
    (V.boosterPlumes || []).forEach(bp => { if (bp) trees.push(bp); });
    trees.forEach(t => { try { t.traverse(o => {
      if (o.isMesh) disposePlume(o);
      else if (o.isSprite && o.material && o.material !== V._flareMat) o.material.dispose();
    }); } catch (e) {} });
  } catch (e) {}
  V.rocket = V.stages = V.corePlume = V.vacPlume = null;
  V.boosterPlumes = [];
  V.padSmoke = []; V.contrailSmoke = []; V.groundFog = [];
  V.condensationCone = null; V.padFireball = null;
  V.flameSmoke = []; V._fsmokeTick = 0; V._skyLiftS = 0;
  V.fireMeshes = [];
  V.nozzleMat = null;
  V.towerArms = [];
  V.beacons = [];
  // Workstream B teardown: dispose vendored pad dressing + FX pools.
  try {
    V.env.forEach(g => {
      try {
        g.traverse(o => {
          if (o.isMesh || o.isPoints) { // Points: Step-1 star field (old code leaked it; dispose here)
            if (o.geometry) o.geometry.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
          }
        });
      } catch (e) {}
    });
  } catch (e) {}
  V.env = []; V.envLoaded = false; V.tsmu = []; V.trenchPos = null; V.padGroup = null;
  try {
    const um = V.skyDome && V.skyDome.material && V.skyDome.material.uniforms;
    if (um && um.uMap && um.uMap.value) um.uMap.value.dispose();
  } catch (e) {}
  V.sun = null; V.skyDome = null; V.stars = null; V.visibleBodies = [];
  V.nasaML = null; V.nasaMLOn = false; V.nasaCrawler = null;
  V.deluge = []; V.rofi = []; V.vent = []; V.skyGlow = null;
  V.padLights = []; V._ignK = 0;
  V.chaseFill = null;
  try { if (V._flareMat) V._flareMat.dispose(); } catch (e) {}
  try { if (V._flareTex) V._flareTex.dispose(); } catch (e) {}
  try { if (V._dotTex) V._dotTex.dispose(); } catch (e) {}
  V._flareMat = null; V._flareTex = null; V._dotTex = null;
  try { if (V._paintRough) V._paintRough.dispose(); } catch (e) {}
  try { if (V._groundGrain) V._groundGrain.dispose(); } catch (e) {}
  try { if (V._envTex) V._envTex.dispose(); } catch (e) {}
  try { if (V._pmrem) V._pmrem.dispose(); } catch (e) {}
  V._paintRough = null; V._groundGrain = null; V._envTex = null; V._pmrem = null;
  V._maxAniso = 1;
  try {
    if (V._siteGround) {
      if (V._siteGround.parent) V._siteGround.parent.remove(V._siteGround);
      if (V._siteGround.geometry) V._siteGround.geometry.dispose();
      if (V._siteGround.material) V._siteGround.material.dispose();
    }
  } catch (e) {}
  V._siteGround = null;
  try {
    if (V._lampHousings) {
      V._lampHousings.traverse(o => {
        if (o.isMesh) {
          if (o.geometry && o.geometry !== V._lampGeoCache) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            if (m.map && m.map !== V._flareTex) { try { m.map.dispose(); } catch (e) {} }
            m.dispose();
          });
        }
      });
      if (V._lampHousings.parent) V._lampHousings.parent.remove(V._lampHousings);
    }
  } catch (e) {}
  V._lampHousings = null;
  try {
    if (V.towerLamps) {
      if (V.towerLamps.parent) V.towerLamps.parent.remove(V.towerLamps);
      if (V.towerLamps.geometry) V.towerLamps.geometry.dispose();
      if (V.towerLamps.material) V.towerLamps.material.dispose();
    }
  } catch (e) {}
  V.towerLamps = null;
  V._towerTop = null;
  try {
    if (V.fieldLights) {
      if (V.fieldLights.parent) V.fieldLights.parent.remove(V.fieldLights);
      if (V.fieldLights.geometry) V.fieldLights.geometry.dispose();
      if (V.fieldLights.material) V.fieldLights.material.dispose();
    }
  } catch (e) {}
  V.fieldLights = null;
  try {
    (V.shafts || []).forEach(m => {
      try {
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
        if (m.parent) m.parent.remove(m);
      } catch (e) {}
    });
  } catch (e) {}
  V.shafts = [];
  V._lastNow = null; V.nomScale = 1; V._tw = 0;
  V.ctLast = null; V._ctTipX = null; V._ctTipY = null; V._ctTipZ = null; V._ctCur = 0;
  if (V.hud && V.hud.parentElement) {
    try { V.hud.parentElement.removeChild(V.hud); } catch (e) {}
  }
  V.hud = null;
  if (V.mount && V.mount.parentElement && V.mount.classList.contains('launch3d-mount')) {
    try { V.mount.parentElement.removeChild(V.mount); } catch (e) {}
  }
  V.mount = null;
}

function start(mountParent, opts) {
  stop();
  opts = opts || {};
  const mount = document.createElement('div');
  mount.className = 'launch3d-mount';
  mountParent.appendChild(mount);

  const canvas = document.createElement('canvas');
  canvas.className = 'launch3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Aerospace rocket launch simulation — dimensionally true multi-stage ascent with realistic staging and separation');
  mount.appendChild(canvas);

  V.mount = mount;
  V.canvas = canvas;
  V.onDone = opts.onDone || null;
  V.vehicleName = opts.vehicleName || '';
  V.lvId = opts.lvId || 'f9';
  V.done = false;
  const reduced = reducedMotion();
  V.countS = reduced ? COUNT_REDUCED_S : COUNT_S;
  V.holdS = reduced ? HOLD_REDUCED_S : HOLD_S;
  V.ascS = reduced ? ASCENT_REDUCED_S : ASCENT_S;
  V.dur = V.countS + V.ascS;

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    // Phase A step 3: shadow map on (was never enabled, so sun.castShadow did nothing).
    // ?perf=1&noshadow=1 skips it (init-time isolation, no mid-run recompile).
    try {
      if (!(PERF && PERF_NOSHADOW)) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
    } catch (e) {}
    V.renderer = renderer;
    // ?perf=1 console drill handle (flag-gated only).
    try { if (PERF) window.__launchDbg = { renderer }; } catch (e) {}
    // Phase A step 1: anisotropy cap + shared probe/tiles before first render.
    try {
      V._maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      makePaintRoughTile();
      makeGroundGrain();
      bakeEnvProbe();
      if (PERF) { try { V._gpuT = makeGpuTimer(renderer); } catch (e) { V._gpuT = null; } }
    } catch (e) {}
    try {
      if (V._ctxLossH) { try { canvas.removeEventListener('webglcontextrestored', V._ctxLossH); } catch (e) {} }
      V._ctxLossH = () => { try { V._envTex = null; bakeEnvProbe(); } catch (e) {} };
      canvas.addEventListener('webglcontextrestored', V._ctxLossH, false);
    } catch (e) {}

    V.camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 800);
    V.camera.position.set(16, 3.5, 20);

    // Step-1 solar basis (once per launch, before the scene builds its sky).
    // Date = mission departure (threaded from game.js) or ?date= QA override;
    // time-of-day defaults to a KSC night window (?tod=HH:MM override for day QA).
    // Null → guarded legacy-night path (deterministic).
    try {
      const qp = new URLSearchParams(window.location.search || '');
      const tod = parseTOD(qp.get('tod')) ?? parseTOD(TOD_DEFAULT);
      V.sun = solarBasisFor(opts.tDep, (tod == null ? 2 : tod), qp.get('date'));
    } catch (e) { V.sun = null; }
    // ?shot=1..6 capture aid: freeze the count at a cut midpoint for screenshots.
    try {
      const qp2 = new URLSearchParams(window.location.search || '');
      const sh = parseInt(qp2.get('shot') || '', 10);
      V._shotHold = (sh >= 1 && sh <= COUNT_SHOTS.length) ? sh - 1 : null;
    } catch (e) { V._shotHold = null; }
    // P3: T-0 visible-body selection via the common authority (cached once, zero per-frame cost).
    try { V.visibleBodies = visibleBodiesAtT0(); } catch (e) { V.visibleBodies = []; }

    buildScene();
    ensureHud();
    initLaunchAudio();
    // Vendored LC-39 environment loads async; procedural tower stands until then.
    try { loadEnvironment(); } catch (e) {}

    V.active = true;
    V.t0 = performance.now();
    V._cshot = -1; // countdown director cut tracker (restored to ascent in frame)
    V._il = undefined; // intro look-lag state (seeded on intro entry)

    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    V.camera.aspect = w / h;
    V.camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);

    // Build the modular multi-stage rocket stack
    let payloadModel = null;
    if (opts.craft && opts.craft.isObject3D) {
      payloadModel = opts.craft;
    } else if (typeof window !== 'undefined' && window.M3D && window.M3D.craft && window.M3D.craft.isObject3D) {
      payloadModel = window.M3D.craft;
    }
    V.rocket = buildModularStack(V.lvId, payloadModel);
    V.scene.add(V.rocket);
    // Phase A step 3: rocket casts (GLB/ground receive). Set once before first render.
    try { V.rocket.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); } catch (e) {}
    // True-scale NASA ground hardware (needs V.rocket scale + old-env slab).
    try { loadML(); } catch (e) {}

    // Size the Max-Q collar to the LIVE vehicle body (display units): the old
    // fixed cone read as a fairing event on slender stacks. Stores the core
    // diameter (puff bulk) and the head diameter — fairing where flown, else
    // upper stage (ring shape follows the nose shoulders, not the core).
    try {
      const cfgC = (typeof LV_STACKS !== 'undefined' && (LV_STACKS[V.lvId] || LV_STACKS.f9)) || { coreD: 3.7, h: 70 };
      const vkC = (V.rocket && V.rocket.scale && isFinite(V.rocket.scale.x) && V.rocket.scale.x > 0)
        ? V.rocket.scale.x : SITE_VK;
      if (V.condensationCone && V.condensationCone.userData) {
        V.condensationCone.userData.bodyD = cfgC.coreD * vkC;
        V.condensationCone.userData.noseD = (cfgC.fair ? cfgC.fair[1] : (cfgC.upD || cfgC.coreD)) * vkC;
      }
    } catch (e) {}

    if (!V.raf) V.raf = requestAnimationFrame(frame);
    return true;
  } catch (e) {
    stop();
    try { if (V.onDone) V.onDone(); } catch (e2) {}
    return false;
  }
}

function isActive() { return V.active; }

const LaunchView = { start, stop, isActive };
try { window.LaunchView = LaunchView; } catch (e) {}
try { window.__LAUNCH_VIEW__ = V; } catch (e) {} // dev harness introspection
export { LaunchView };
