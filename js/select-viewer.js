import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  DPR_CAP, LEVEL_BODY, DAYS_PER_SEC, BODY_STYLE, radiusOf,
  buildStars, loadSpaceSkybox, buildSolarSystem, todayDays, bodyWorld, bodyWorldPhysical,
  WORLD_PER_AU, UNITS_PER_KM, isPhysicalMode,
  ensurePhysicalModeFromURL, radiusWorld, radiusKmTrue, getOriginKm,
  frameOf, easeSmoother, flyDur, verifyBennuEphem,
  PLANET_DATA, ORRERY_SETTINGS, exposureForBody, wideExposure,
  providerOf, statusOf, moonPathOf, helioDistKm, applySunPosition,
  approachMinDist, nearForProximity
} from './orrery.js';

/* Live ephemeris-status badge (Phase 2.1 verification harness): maps focus
   bodies to parents for moon-path reporting. */
const MOON_PARENT = { moon: 'earth', io: 'jupiter', europa: 'jupiter', ganymede: 'jupiter', callisto: 'jupiter', phobos: 'mars', deimos: 'mars' };
function focusStatusLine() {
  const key = V.selectedPlanet || V.toKey || (V.cur && LEVEL_BODY[V.cur]) || 'earth';
  let prov = 'NONE', stat = 'UNAVAILABLE', extra = '';
  try { prov = providerOf(key, V.simDays); } catch (e) {}
  try { stat = statusOf(key, V.simDays) || stat; } catch (e) {}
  if (MOON_PARENT[key]) {
    try { extra = ' · ' + moonPathOf(key, MOON_PARENT[key], V.simDays); } catch (e) {}
  }
  const degraded = (stat !== 'OK') || (extra.indexOf('analytic') >= 0);
  return { key, html: `<span class="ephem${degraded ? ' off' : ''}">${esc_(key)} · ${esc_(prov)} · ${esc_(stat)}${esc_(extra)}</span>` };
}
let statusTick = 0;
function refreshStatusBadge() {
  if ((statusTick++ % 30) !== 0) return; // ~2Hz — no per-frame DOM churn
  const el = document.getElementById('selstatus'); if (!el) return;
  try { el.innerHTML = focusStatusLine().html; } catch (e) {}
}

const V = {
  renderer: null, scene: null, camera: null, canvas: null,
  composer: null, bloomPass: null, outlinePass: null,
  bodies: null, flareMats: null, atmospheres: null, orbitLines: null, orbitTags: null, asteroidBelts: null,
  sunMat: null, sunLight: null,
  simDays: 0, cur: null, toKey: null, exposure: 1.15,
  fly: null, dive: null, diving: false, sysView: false, isFullscreen: false,
  nameGroup: null, nameList: null, controls: null, ephem: null,
  raf: 0, W: 0, H: 0, last: 0, failed: false, onHover: null, onFocus: null,
  isPhys: false, originKm: [0, 0, 0], starMat: null,
  raycastTargets: [], raycaster: new THREE.Raycaster(), mouse: new THREE.Vector2(),
  dragStart: { x: 0, y: 0, time: 0 },
  selectedPlanet: null, isMovingTowardsPlanet: false, targetCamPos: new THREE.Vector3(), targetLookAt: new THREE.Vector3(),
  approachP0: new THREE.Vector3(), approachT: 0, approachDur: 1,
  hudEl: null, infoEl: null,
  onClick: null, onKey: null, _lastToggle: 0
};

function detectPhysicalMode() {
  try {
    const sp = new URLSearchParams(globalThis.location.search);
    if (sp.get('mode') === 'presentation' || sp.has('presentation') || sp.has('pres')) return false;
    if (sp.has('phys') || sp.get('mode') === 'physical') return true;
  } catch (e) {}
  try {
    if (globalThis.Astronomy && globalThis.Astronomy.mode === 'presentation') return false;
    if (globalThis.Astronomy && globalThis.Astronomy.mode === 'physical') return true;
  } catch (e) {}
  return true;
}

function stop() {
  if (V.raf) cancelAnimationFrame(V.raf);
  V.raf = 0;
  if (V.onHover) document.removeEventListener('mouseover', V.onHover);
  if (V.onFocus) document.removeEventListener('focusin', V.onFocus);
  if (V.onClick) document.removeEventListener('click', V.onClick);
  if (V.onKey) window.removeEventListener('keydown', V.onKey);
  V.onHover = V.onFocus = V.onClick = V.onKey = null;
  if (V.hudEl && V.hudEl.parentNode) V.hudEl.parentNode.removeChild(V.hudEl);
  if (V.infoEl && V.infoEl.parentNode) V.infoEl.parentNode.removeChild(V.infoEl);
  V.hudEl = V.infoEl = null;

  if (V.composer) { try { V.composer.dispose(); } catch (e) {} }
  if (V.renderer) {
    try { V.renderer.dispose(); } catch (e) {}
    const r = V.renderer;
    setTimeout(() => { try { r.forceContextLoss(); } catch (e) {} }, 600);
  }
  if (V.controls) { try { V.controls.dispose(); } catch (e) {} }

  V.renderer = V.composer = V.bloomPass = V.outlinePass = V.scene = V.camera = V.canvas = null;
  V.bodies = V.flareMats = V.atmospheres = V.orbitLines = V.orbitTags = V.asteroidBelts = V.nameGroup = V.nameList = null;
  V.sunMat = V.sunLight = V.fly = V.dive = V.controls = null;
  V.built = null;
  V.diving = false; V.W = 0; V.H = 0; V.cur = null; V.toKey = null; V.failed = false;
  V.isPhys = false; V.originKm = [0, 0, 0]; V.raycastTargets = [];
}

/* Cinematic overview camera position (isometric angle displaying all planetary orbits) */
const WIDE_POS = new THREE.Vector3(-24, 18, 28);
const WIDE_TGT = new THREE.Vector3(0, 0, 0);

/* Pill labels: name + real distance subline, always on so every body and
   moon is identified in both mission-focus and full-system views. */
function makeName(key, title, sub) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = 'rgba(8,15,25,0.68)';
  x.strokeStyle = 'rgba(130,175,225,0.55)';
  x.lineWidth = 3;
  x.beginPath();
  if (x.roundRect) x.roundRect(6, 6, 500, 116, 22); else x.rect(6, 6, 500, 116);
  x.fill(); x.stroke();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = 'rgba(205,225,245,0.96)';
  x.font = '600 46px "JetBrains Mono", monospace';
  x.fillText(title.toUpperCase(), 256, 46);
  if (sub) {
    x.fillStyle = 'rgba(145,195,235,0.92)';
    x.font = '32px "JetBrains Mono", monospace';
    x.fillText(sub, 256, 92);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.92, depthWrite: false }));
  s.userData.bodyKey = key; // clickable: raycast hit -> flyToPlanetDirect via identifyPlanet
  /* Small base size — rescaled every frame by camera distance (LABEL_K) so
     badges hold roughly constant screen size instead of looming. */
  const bx = V.isPhys ? 0.4 : 1.15, by = V.isPhys ? 0.1 : 0.29;
  s.scale.set(bx, by, 1);
  s.userData.baseScale = new THREE.Vector2(bx, by);
  return s;
}

const _sv = new THREE.Vector3();
function scaleSprite(s) {
  if (!V.camera || !s.userData.baseScale) return;
  s.getWorldPosition(_sv);
  const d = V.camera.position.distanceTo(_sv);
  const maxK = V.isPhys ? 5.0 : 4.5;
  /* Floor near zero (was 0.3): pills hold constant screen size by scaling
     with distance — a 0.3 floor froze them enormous on close focus. They now
     shrink onto the limb as you dive instead of filling the frame. */
  const k = THREE.MathUtils.clamp(d * 0.12, 1e-4, maxK);
  s.scale.set(s.userData.baseScale.x * k, s.userData.baseScale.y * k, 1);
}

function applyLabelVis() {
  if (V.nameGroup) V.nameGroup.visible = ORRERY_SETTINGS.showLabels;
  if (V.orbitTags) for (const s of V.orbitTags) s.visible = ORRERY_SETTINGS.showLabels;
}

function capHTML(L, B) {
  const tag = V.ephem === 'live' ? '<span class="ephem">SBDB ✓</span>' : (V.ephem === 'cached' ? '<span class="ephem off">CACHED</span>' : '');
  const modeTag = V.isPhys ? `<span class="ephem">PHYSICAL Earth=${(radiusKmTrue('earth') * UNITS_PER_KM).toExponential(2)}u</span>` : `<span class="ephem">PRESENTATION Earth=${radiusOf('earth').toFixed(4)}u safe</span>`;
  return `
    <div class="sc-row"><span class="sc-dest">DESTINATION · ${esc_(B.n.toUpperCase())}</span></div>
    <div class="sc-name">${esc_(L.name)}</div>
    <div class="sc-sub">${esc_(L.sub)}</div>
    <div class="sc-stats">
      <span>${B.au ? B.au.toFixed(2) + ' AU' : '—'}</span>
      <span>${L.years} YR</span>
      <span>$${L.capM}M CAP</span>
      <span>${L.dose} KRAD/YR</span>
      ${tag}
    </div>
    <div style="margin:4px 0;font-size:10px;opacity:0.7;">${modeTag} · ${V.isPhys ? 'physical' : 'presentation'}</div>
    <div id="selstatus" style="margin:2px 0 4px;font-size:10px;"></div>
    <div class="sc-actions">
      <button class="sysbtn" data-act="sysview">${V.sysView ? 'RETURN TO MISSION' : 'FULL SYSTEM'}</button>
    </div>
  `;
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function levelById(id) {
  try { return LEVELS.find((l) => l.id === id) || LEVELS[0]; } catch (e) { return null; }
}

function setCaption(id) {
  const cap = document.getElementById('selcap'); if (!cap) return;
  if (V.sysView) {
    cap.innerHTML = `
      <div class="sc-row"><span class="sc-dest">SOLAR SYSTEM · HELIOCENTRIC OVERVIEW</span></div>
      <div class="sc-name">Full Solar System View</div>
      <div class="sc-sub">Heliocentric perspective showing all 8 planetary orbits & celestial bodies</div>
      <div class="sc-actions">
        <button class="sysbtn" data-act="sysview">RETURN TO MISSION</button>
      </div>
    `;
    return;
  }
  const L = levelById(id); if (!L) return;
  let B = { n: '—' }; try { B = BODY[L.body] || B; } catch (e) {}
  cap.innerHTML = capHTML(L, B);
}

function markCard(id) {
  document.querySelectorAll('.lvcard.selviewing').forEach((el) => el.classList.remove('selviewing'));
  const c = document.querySelector('.lvcard[data-id="' + id + '"]');
  if (c) c.classList.add('selviewing');
}

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _b = new THREE.Vector3(), _a = new THREE.Vector3();
const _visualBox = new THREE.Box3();
const VISUAL_CENTER_BODIES = { bennu: true, phobos: true, deimos: true };
/* Camera target must be the visible geometry centre, not merely an object's
   transform origin. Offset-bearing GLB hierarchies can otherwise focus beside
   the disc. Resolve the centre once in local space and transform it per frame. */
function bodyVisualCenter(body, out){
  out.set(0,0,0);
  if (!body) return out;
  if (body.userData.visualCenterLocal) {
    out.copy(body.userData.visualCenterLocal).applyMatrix4(body.matrixWorld);
    return out;
  }
  body.updateMatrixWorld(true);
  _visualBox.setFromObject(body);
  if (!_visualBox.isEmpty()) {
    _visualBox.getCenter(out);
    body.userData.visualCenterLocal=body.worldToLocal(out.clone());
  } else body.getWorldPosition(out);
  return out;
}
const _gd = new THREE.Vector3(); // penetration-guard scratch (no per-frame allocation)
const _sd = new THREE.Vector3(); // sun-direction scratch for dayside-biased arrival

function getOriginForFocus(focusKey, simDays) {
  if (!V.isPhys) return [0, 0, 0];
  if (V.sysView) return [0, 0, 0];
  if (!focusKey) return [0, 0, 0];
  try { return getOriginKm(focusKey, simDays); } catch (e) { return [0, 0, 0]; }
}

/* Camera transition contract (single authority): every camera command below
   fully settles the previous one before starting its own — commitFly (card
   hover), flyWide (overview), flyToPlanetDirect (click/dropdown),
   flyToBrief (dive commit). Each clears the others' state (V.fly, approach,
   selection anchor) so flights can never stack, fight, or go stale. */
function updateFocusClamp(key){
  if (!V.controls) return;
  if (V.isPhys) {
    try { V.controls.minDistance = approachMinDist(key || V.toKey || 'earth', UNITS_PER_KM); } catch(e){}
  } else V.controls.minDistance = 0.04;
}

function commitFly(toKey) {
  V.sysView = false;
  V.selectedPlanet = null;
  V.trackAnchor = null;
  V.isMovingTowardsPlanet = false;
  V.isZoomingOut = false;

  const p1 = new THREE.Vector3(), t1 = new THREE.Vector3();
  const originKm = getOriginForFocus(toKey, V.simDays);
  const opts = { physical: V.isPhys, unitsPerKm: UNITS_PER_KM, originKm: originKm, focusKey: toKey, floatingOrigin: V.isPhys && !V.sysView };
  if(!frameOf(toKey, V.simDays, p1, t1, opts)) { V.fly = null; return; } // unavailable — settle, never run a stale flight
  updateFocusClamp(toKey);
  /* Snap the iris to the new focus on the cut (a real camera cuts exposure
     on a scene change): smoothing from a 35×-off value leaves targets
     nuclear or black for seconds — the Bennu whiteout. Smoothing continues
     after the snap for motion. */
  try {
    let km = helioDistKm(toKey, V.simDays);
    /* Analytic moons (Phobos/Deimos) have no ephemeris state — meter at the
       parent's distance instead of falling back to wide exposure. */
    if ((!isFinite(km) || !(km > 0)) && MOON_PARENT[toKey]) km = helioDistKm(MOON_PARENT[toKey], V.simDays);
    V.exposure = (isFinite(km) && km > 0) ? exposureForBody(toKey, km * UNITS_PER_KM) : wideExposure();
  } catch (e) {}

  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (still) {
    V.camera.position.copy(p1);
    V.camera.lookAt(t1);
    if (V.controls) V.controls.target.copy(t1);
    V.fly = null;
    V.originKm = originKm;
    updateClipping();
    return;
  }

  const p0 = V.camera.position.clone();
  const travel = Math.max(0.001, p0.distanceTo(p1));
  V.fly = {
    t: 0,
    dur: flyDur(travel),
    p0,
    toKey,
    /* Gaze continuity: resume looking where the user already looks instead
       of a 4u-ahead swing point — the old fixed look-ahead caused the swoop
       on short hops. */
    t0: V.controls ? V.controls.target.clone() : V.camera.position.clone(),
    originKm: originKm
  };

  if (V.controls) {
    V.controls.target.copy(t1);
  }
}

function setBody(id) {
  if (V.diving || !V.scene) return;
  const key = LEVEL_BODY[id] || 'mars';
  if (V.sysView) {
    V.sysView = false;
    if (V.nameGroup) V.nameGroup.visible = false;
  }
  markCard(id);
  setCaption(id);
  V.cur = id;
  if (V.toKey === key && !V.selectedPlanet) return;
  V.toKey = key;
  commitFly(key);
}

function flyToBrief(cb) {
  if (!V.scene || V.diving) { if (!V.scene && cb) cb(); return; }
  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (still) { if (cb) cb(); return; }
  V.dive = { t: 0, dur: 0.95, key: LEVEL_BODY[V.cur] || 'mars', cb };
  V.diving = true; V.fly = null;
  V.isMovingTowardsPlanet = false; V.trackAnchor = null;
}

function flyWide() {
  V.selectedPlanet = null; V.isMovingTowardsPlanet = false; V.trackAnchor = null;
  const p0 = V.camera.position.clone();
  const travel = p0.distanceTo(WIDE_POS);
  V.fly = {
    t: 0,
    dur: Math.min(2.4, Math.max(1.0, 0.8 + travel * 0.04)),
    p0,
    toKey: null,
    wide: true,
    t0: V.controls ? V.controls.target.clone() : V.camera.position.clone(), // gaze continuity (see commitFly)
    originKm: [0, 0, 0]
  };
  if (V.controls) {
    V.controls.target.set(0, 0, 0);
  }
}

function toggleSystem() {
  if (V.diving || !V.scene) return;
  const now = performance.now();
  if (V._lastToggle && (now - V._lastToggle < 300)) return;
  V._lastToggle = now;

  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  V.sysView = !V.sysView;
  /* Labels stay on in both modes. */

  const btnFullSys = document.getElementById('btnFullSys');
  if (btnFullSys) {
    btnFullSys.innerHTML = V.sysView ? '↩ RETURN' : '🌐 FULL SYSTEM';
    btnFullSys.title = V.sysView ? 'Return to Mission Focus' : 'Explore Full Solar System';
  }

  if (V.sysView) {
    /* Clean full system view: clear card selection, close planet card, show heliocentric overview */
    document.querySelectorAll('.lvcard.selviewing').forEach((el) => el.classList.remove('selviewing'));
    closeInfo();
    setCaption(null);
    V.originKm = [0, 0, 0];
    toggleFullscreen(true);
    if (still) {
      V.camera.position.copy(WIDE_POS);
      V.camera.lookAt(WIDE_TGT);
      if (V.controls) V.controls.target.set(0, 0, 0);
      V.fly = null;
      updateClipping();
    } else {
      flyWide();
    }
  } else {
    toggleFullscreen(false);
    if (V.toKey) {
      commitFly(V.toKey);
      setCaption(V.cur);
      markCard(V.cur);
    }
  }
}

function resetView() {
  if (V.diving || !V.scene || !V.sysView) return;
  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (still) {
    V.camera.position.copy(WIDE_POS);
    V.camera.lookAt(WIDE_TGT);
    if (V.controls) V.controls.target.set(0, 0, 0);
    V.fly = null;
    updateClipping();
    return;
  }
  flyWide();
}

function toggleFullscreen(forceState) {
  const selStage = document.querySelector('.selstage');
  const selView = document.querySelector('.selview');
  const next = typeof forceState === 'boolean' ? forceState : !V.isFullscreen;
  if (V.isFullscreen === next) return;
  V.isFullscreen = next;
  if (selStage) selStage.classList.toggle('expanded-stage', V.isFullscreen);
  if (selView) selView.classList.toggle('expanded-solar-system', V.isFullscreen);

  const btnFs = document.getElementById('btnToggleFullscreen');
  if (btnFs) {
    btnFs.classList.toggle('active', V.isFullscreen);
    btnFs.setAttribute('aria-pressed', V.isFullscreen);
    btnFs.innerHTML = V.isFullscreen ? '🗗 EXIT' : '⛶ FULLSCREEN';
    btnFs.title = V.isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen View';
  }

  setCaption(V.cur);
  V.W = 0; V.H = 0;
  requestAnimationFrame(size);
  setTimeout(size, 50);
  setTimeout(size, 200);
}

function updateClipping() {
  if (!V.camera) return;
  if (V.isPhys) {
    const dist = V.camera.position.length();
    /* Nearest-surface distance: free flight can park the eye a millimeter
       from a body 7u from the origin — fitting near to the ORIGIN distance
       then puts the near plane beyond the planet's surface and the planet
       clips to invisible (the "vanishing planet / stuck inside blackness"
       bug). Brief/ops/title already fit to subject distance; select was the
       only origin-based one. Positions are last frame's — fine for planes. */
    let prox = Infinity;
    if (V.bodies) {
      const keys = Object.keys(V.bodies);
      for (let bi = 0; bi < keys.length; bi++) {
        const m = V.bodies[keys[bi]];
        if (!m || m.visible === false) continue;
        const r = (m.userData && m.userData.renderRadius) || 0;
        const d = V.camera.position.distanceTo(m.position) - r * 1.2;
        if (d < prox) prox = d;
      }
    }
    if (!isFinite(prox) || prox < 0) prox = 0;
    V.proxM = prox;
    const near = nearForProximity(prox);
    const far = Math.max(100, dist * 100 + 50);
    if (Math.abs(V.camera.near - near) > 1e-9 || Math.abs(V.camera.far - far) > 1e-6) {
      V.camera.near = near;
      V.camera.far = far;
      V.camera.updateProjectionMatrix();
    }
  } else {
    if (V.camera.near !== 0.02 || V.camera.far !== 800) {
      V.camera.near = 0.02;
      V.camera.far = 800;
      V.camera.updateProjectionMatrix();
    }
  }
}

function size() {
  const cv = V.canvas;
  if (!cv || !cv.isConnected || !V.renderer) return;
  const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
  if (w === V.W && h === V.H) return;
  V.W = w; V.H = h;
  V.camera.aspect = w / h;
  V.camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  V.renderer.setPixelRatio(dpr);
  V.renderer.setSize(w, h, false);
  if (V.composer) {
    V.composer.setPixelRatio(dpr);
    V.composer.setSize(w, h);
  }
  if (V.outlinePass) V.outlinePass.setSize(w, h);
  if (V.bloomPass) V.bloomPass.setSize(w, h);
  if (V.starMat) V.starMat.uniforms.pr.value = dpr;
}

/* Planet Info Card UI overlay */
function showPlanetInfo(planetKey) {
  if (!V.infoEl) return;
  const data = PLANET_DATA[planetKey];
  if (!data) return;

  const content = V.infoEl.querySelector('.planet-info-content');
  if (!content) return;

  content.innerHTML = `
    <button class="close-btn" data-act="close-info" title="Close & Return to Solar System">&times;</button>
    <div class="pi-header">
      <span class="pi-kicker">SOLAR SYSTEM BODY</span>
      <h2 id="planetName">${esc_(data.name)}</h2>
    </div>
    <div class="pi-grid">
      <div class="pi-item"><span class="pi-lbl">RADIUS</span><span class="pi-val">${esc_(data.radius)}</span></div>
      <div class="pi-item"><span class="pi-lbl">AXIAL TILT</span><span class="pi-val">${esc_(data.tilt)}</span></div>
      <div class="pi-item"><span class="pi-lbl">ROTATION</span><span class="pi-val">${esc_(data.rotation)}</span></div>
      <div class="pi-item"><span class="pi-lbl">ORBIT PERIOD</span><span class="pi-val">${esc_(data.orbit)}</span></div>
      <div class="pi-item"><span class="pi-lbl">DISTANCE (SUN)</span><span class="pi-val">${esc_(data.distance)}</span></div>
      <div class="pi-item"><span class="pi-lbl">MOONS</span><span class="pi-val">${esc_(data.moons)}</span></div>
    </div>
    <div class="pi-desc">${esc_(data.info)}</div>
  `;
  V.infoEl.style.display = 'block';
}

function closeInfo() {
  if (V.infoEl) V.infoEl.style.display = 'none';
  V.selectedPlanet = null;
  V.isMovingTowardsPlanet = false;
  V.trackAnchor = null;
  if (V.controls) V.controls.target.set(0, 0, 0);
}

function identifyPlanet(object) {
  let cur = object;
  while (cur) {
    if (cur.userData && cur.userData.bodyKey) {
      return cur.userData.bodyKey;
    }
    cur = cur.parent;
  }
  return null;
}

function flyToPlanetDirect(bodyKey) {
  if (!V.bodies || !V.bodies[bodyKey]) return;
  const targetMesh = V.bodies[bodyKey];
  const targetPos = new THREE.Vector3();
  targetMesh.updateMatrixWorld(true);
  if (VISUAL_CENTER_BODIES[bodyKey]) bodyVisualCenter(targetMesh, targetPos);
  else targetMesh.getWorldPosition(targetPos);

  const r = radiusWorld(bodyKey, { physical: V.isPhys, unitsPerKm: UNITS_PER_KM });
  /* Floor is the per-body clamp (r*1.6), not a global: the old 2e-4 floor
     parked the camera 100000× too far from Bennu and the Martian moons —
     sub-pixel dots, reported "invisible". Framing lands at r*4.5 regardless. */
  const floorD = V.isPhys ? approachMinDist(bodyKey, UNITS_PER_KM) * 1.5 : 0.35;
  let offsetDist = Math.max(r * 4.5, floorD);
  /* Same-planet selection: already there and framed — show the card, refresh
     the clamp, skip the absurd re-flight swoop. */
  if (bodyKey === (V.selectedPlanet || V.toKey) &&
      V.camera.position.distanceTo(targetPos) < offsetDist * 3) {
    updateFocusClamp(bodyKey);
    showPlanetInfo(bodyKey);
    /* Still re-centre on the visual geometry origin. Dropdown re-selection can
       otherwise leave a previously orbited camera aimed beside the body. */
  }
  /* Iris snap on the cut (see commitFly): no nuclear transient. */
  try {
    let km = helioDistKm(bodyKey, V.simDays);
    if ((!isFinite(km) || !(km > 0)) && MOON_PARENT[bodyKey]) km = helioDistKm(MOON_PARENT[bodyKey], V.simDays);
    V.exposure = (isFinite(km) && km > 0) ? exposureForBody(bodyKey, km * UNITS_PER_KM) : wideExposure();
  } catch (e) {}
  if (bodyKey === 'sun') offsetDist = V.isPhys ? Math.max(r * 8, 0.02) : 2.4;
  if (bodyKey === 'saturn') offsetDist = Math.max(offsetDist, r * 5.0);
  if (bodyKey === 'uranus') offsetDist = Math.max(offsetDist, r * 4.5);
  if (bodyKey === 'jupiter') offsetDist = Math.max(offsetDist, r * 4.5);

  const dir = V.camera.position.clone().sub(targetPos);
  if (dir.lengthSq() < 1e-4) dir.set(0.3, 0.5, 1.0);
  dir.normalize();
  /* Dayside-biased arrival: landing on the night side reads as "pitch black"
     (dark rock, no fill) and users report it as broken lighting. If the
     current side faces away from the sun, bend the offset toward the dayside
     (terminator or better); dayside arrivals pass through untouched. */
  if (V.bodies && V.bodies.sun) {
    _sd.copy(V.bodies.sun.position).sub(targetPos);
    if (_sd.lengthSq() > 1e-24) {
      _sd.normalize();
      if (dir.dot(_sd) < 0.15) {
        dir.multiplyScalar(0.55).addScaledVector(_sd, 0.45);
        if (dir.lengthSq() < 1e-6) dir.copy(_sd); else dir.normalize();
      }
    }
  }

  let still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  V.targetCamPos.copy(targetPos).addScaledVector(dir, offsetDist);
  V.targetLookAt.copy(targetPos);
  if (still) {
    V.camera.position.copy(V.targetCamPos);
    V.camera.lookAt(V.targetLookAt);
    if (V.controls) V.controls.target.copy(V.targetLookAt);
    V.trackAnchor = V.targetLookAt.clone();
    V.isMovingTowardsPlanet = false;
    V.approachT = 0;
  }
  V.selectedPlanet = bodyKey;
  V.trackAnchor = still ? V.targetLookAt.clone() : null; // live re-anchor follows during motion
  V.approachP0.copy(V.camera.position);
  V.approachT = 0;
  /* A fixed-duration smootherstep is frame-rate independent and settles at a
     precise destination; rapid re-selection naturally continues from the pose
     on screen because approachP0 is the current camera position. */
  V.approachDur = Math.min(2.4, Math.max(0.85, 0.85 + V.approachP0.distanceTo(V.targetCamPos) * 0.18));
  V.isMovingTowardsPlanet = !still;
  V.fly = null;
  updateFocusClamp(bodyKey);

  if (V.controls) {
    V.controls.target.copy(targetPos);
  }
  showPlanetInfo(bodyKey);

  /* Sync with corresponding mission card if applicable */
  const missionMap = { earth: 'l1', moon: 'l2', mars: 'l3', bennu: 'l4', europa: 'l5' };
  if (missionMap[bodyKey]) {
    setCaption(missionMap[bodyKey]);
    markCard(missionMap[bodyKey]);
    V.cur = missionMap[bodyKey];
    V.toKey = bodyKey;
  }
}

/* Build Navigation Bar with Planet Selector Dropdown, Tiny Orbit Toggle, Full System & Fullscreen */
function createHUD(host) {
  const navBar = document.createElement('div');
  navBar.className = 'orrery-nav-bar';
  navBar.innerHTML = `
    <select id="selPlanetJump" class="planet-select-dropdown" aria-label="Select Celestial Body">
      <option value="">🪐 Focus Celestial Body...</option>
      <option value="sun">☀️ Sun</option>
      <option value="mercury">☿ Mercury</option>
      <option value="venus">♀ Venus</option>
      <option value="earth">🜨 Earth</option>
      <option value="moon">&nbsp;&nbsp;└ Moon</option>
      <option value="mars">♂ Mars</option>
      <option value="phobos">&nbsp;&nbsp;├ Phobos</option>
      <option value="deimos">&nbsp;&nbsp;└ Deimos</option>
      <option value="jupiter">♃ Jupiter</option>
      <option value="io">&nbsp;&nbsp;├ Io</option>
      <option value="europa">&nbsp;&nbsp;├ Europa</option>
      <option value="ganymede">&nbsp;&nbsp;├ Ganymede</option>
      <option value="callisto">&nbsp;&nbsp;└ Callisto</option>
      <option value="saturn">♄ Saturn</option>
      <option value="uranus">⛢ Uranus</option>
      <option value="neptune">♆ Neptune</option>
      <option value="pluto">♇ Pluto</option>
      <option value="bennu">◈ Bennu (Asteroid)</option>
    </select>
    <button class="orrery-toggle-btn ${ORRERY_SETTINGS.showOrbitLines ? 'active' : ''}" id="btnToggleOrbits" title="Show / Hide Orbit Lines" aria-pressed="${ORRERY_SETTINGS.showOrbitLines}">
      <span class="toggle-dot"></span>ORBITS
    </button>
    <button class="orrery-toggle-btn ${ORRERY_SETTINGS.showLabels ? 'active' : ''}" id="btnToggleLabels" title="Show / Hide Labels" aria-pressed="${ORRERY_SETTINGS.showLabels}">
      <span class="toggle-dot"></span>LABELS
    </button>
    <button class="orrery-fullsys-btn" id="btnFullSys" title="Toggle Full Solar System View">🌐 FULL SYSTEM</button>
    <button class="orrery-fs-btn ${V.isFullscreen ? 'active' : ''}" id="btnToggleFullscreen" title="Toggle Fullscreen View" aria-pressed="${V.isFullscreen}">
      ${V.isFullscreen ? '🗗 EXIT' : '⛶ FULLSCREEN'}
    </button>
  `;
  host.appendChild(navBar);
  V.hudEl = navBar;

  navBar.querySelector('#selPlanetJump').addEventListener('change', (e) => {
    if (e.target.value) {
      if (V.sysView) {
        V.sysView = false;
        const btnFullSys = document.getElementById('btnFullSys');
        if (btnFullSys) {
          btnFullSys.innerHTML = '🌐 FULL SYSTEM';
          btnFullSys.title = 'Explore Full Solar System';
        }
      }
      flyToPlanetDirect(e.target.value);
      e.target.value = '';
    }
  });

  navBar.querySelector('#btnToggleOrbits').addEventListener('click', () => {
    ORRERY_SETTINGS.showOrbitLines = !ORRERY_SETTINGS.showOrbitLines;
    if (V.orbitLines) V.orbitLines.visible = ORRERY_SETTINGS.showOrbitLines;
    const btn = navBar.querySelector('#btnToggleOrbits');
    if (btn) {
      btn.classList.toggle('active', ORRERY_SETTINGS.showOrbitLines);
      btn.setAttribute('aria-pressed', ORRERY_SETTINGS.showOrbitLines);
    }
  });

  navBar.querySelector('#btnToggleLabels').addEventListener('click', () => {
    ORRERY_SETTINGS.showLabels = !ORRERY_SETTINGS.showLabels;
    applyLabelVis();
    const btn = navBar.querySelector('#btnToggleLabels');
    if (btn) {
      btn.classList.toggle('active', ORRERY_SETTINGS.showLabels);
      btn.setAttribute('aria-pressed', ORRERY_SETTINGS.showLabels);
    }
  });

  navBar.querySelector('#btnFullSys').addEventListener('click', () => {
    toggleSystem();
  });

  navBar.querySelector('#btnToggleFullscreen').addEventListener('click', () => {
    toggleFullscreen();
  });

  /* Planet Info card element */
  const info = document.createElement('div');
  info.id = 'planetInfo';
  info.className = 'planet-info';
  info.innerHTML = '<div class="planet-info-content"></div>';
  host.appendChild(info);
  V.infoEl = info;
  info.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-act="close-info"]')) {
      closeInfo();
      flyWide();
      V.sysView = true;
      if (V.nameGroup) V.nameGroup.visible = true;
      setCaption(null);
      const btnFullSys = document.getElementById('btnFullSys');
      if (btnFullSys) {
        btnFullSys.innerHTML = '↩ RETURN';
        btnFullSys.title = 'Return to Mission Focus';
      }
    }
  });
}

function frame(now) {
  if (!V.canvas || !V.canvas.isConnected) { stop(); return; }
  V.raf = requestAnimationFrame(frame);
  size();
  const dt = Math.min(0.1, (now - V.last) / 1000 || 0);
  V.last = now;

  const simStep = dt * DAYS_PER_SEC * ORRERY_SETTINGS.accelerationOrbit;
  V.simDays += simStep;
  /* publish the live clock: title/brief adopt it when fresh so bodies
     never jump between views of the same system. */
  try { window.__MARGIN_SIMDAYS = V.simDays; } catch (e) {}

  if (V.isPhys) {
    if (V.sysView) V.originKm = [0, 0, 0];
    else if (V.toKey) {
      try { V.originKm = getOriginKm(V.toKey, V.simDays); } catch (e) { V.originKm = [0, 0, 0]; }
    }
  } else {
    V.originKm = [0, 0, 0];
  }

  if (V.camera && V.isPhys) {
    updateClipping();
  }

  /* Animate Sun granulation */
  if (V.sunMat && V.sunMat.uniforms && V.sunMat.uniforms.uTime) {
    V.sunMat.uniforms.uTime.value = (V.sunMat.uniforms.uTime.value + dt) % 3600;
  }

  /* Rotate Sun & Planets */
  if (V.bodies) {
    const spinMult = ORRERY_SETTINGS.acceleration;
    for (const key of Object.keys(V.bodies)) {
      const m = V.bodies[key]; if (!m) continue;
      if (V.isPhys){ const pw=bodyWorldPhysical(key, _p, V.simDays, V.originKm, UNITS_PER_KM); if(pw){ m.visible=true; m.position.copy(pw); } else m.visible=false; }
      else m.position.copy(bodyWorld(key, _p, V.simDays));

      const style = BODY_STYLE[key];
      const spin = style?.spin ?? 0.02;
      m.rotation.y += dt * spin * spinMult;
    }
  }

  /* Limb-glow shells are children of their planets and rotate with them.
     The MODIS cloud deck drifts on its own. */
  if (V.atmospheres && V.atmospheres.earth) {
    V.atmospheres.earth.rotation.y += dt * 0.055 * ORRERY_SETTINGS.acceleration;
  }

  /* Sun-follow (physical floating origin only): the loop above already moved
     the sun mesh into the floating frame, but the PointLight, corona sprite,
     and day/night shader uniforms still point at the old origin — which is
     now the focus planet's center. Without this, every planet lights from
     inside itself and renders black. Presentation is heliocentric: no-op. */
  if (V.isPhys && V.built && V.bodies && V.bodies.sun) {
    applySunPosition(V.built, V.bodies.sun.position);
    /* Unresolved-source glow: at true scale the disc is sub-pixel past a few
       AU (zero fragments → nothing for bloom to catch). Like the name labels
       holding constant screen size, the corona keeps a minimum angular size
       so the star stays present at any range. Declared pure rendering; the
       disc itself is never resized. Depth test still occults it correctly. */
    if (V.built.corona) {
      const ds = V.camera.position.distanceTo(V.bodies.sun.position);
      const base = (V.bodies.sun.userData.renderRadius || 0) * 12;
      V.built.corona.scale.setScalar(Math.max(base, ds * 0.025));
    }
  }

  /* Animate Asteroid Belts */
  if (V.asteroidBelts && V.asteroidBelts.visible) {
    V.asteroidBelts.rotation.y += dt * 0.005 * ORRERY_SETTINGS.accelerationOrbit;
  }

  /* Smart labels: hold roughly constant screen size by scaling with camera
     distance (clamped so dive-ins stay clean and wide views stay legible).
     Skipped entirely while labels are toggled off. */
  if (V.nameGroup && V.nameGroup.visible && V.bodies) {
    for (const n of V.nameList) {
      const m = V.bodies[n.key]; if (!m) continue;
      n.sprite.position.copy(m.position);
      if (V.isPhys) {
        const r = radiusWorld(n.key, { physical: true, unitsPerKm: UNITS_PER_KM });
        /* Label floats just off the limb: radius-based up close, a small
           view-fraction farther out so wide views stay readable. */
        const camD = V.camera.position.distanceTo(m.position);
        n.sprite.position.y += Math.max(r * 20 + 0.02, camD * 0.03);
      } else {
        n.sprite.position.y += radiusOf(n.key) + 0.25;
      }
      scaleSprite(n.sprite);
    }
    if (V.orbitTags) for (const s of V.orbitTags) scaleSprite(s);
  }

  /* Camera Movement Handling */
  if (V.dive) {
    const D = V.dive; D.t += dt; const e = Math.min(1, D.t/D.dur); const k = e * e * e;
    if (V.isPhys) bodyWorldPhysical(LEVEL_BODY[V.cur] || 'mars', _t, V.simDays, V.originKm, UNITS_PER_KM);
    else bodyWorld(LEVEL_BODY[V.cur] || 'mars', _t, V.simDays);
    if (!D.p0) D.p0 = V.camera.position.clone();
    _a.copy(V.camera.position).sub(_t); if (_a.lengthSq() > 1e-12) _a.normalize();
    const diveR = V.isPhys ? radiusWorld(D.key, { physical: true, unitsPerKm: UNITS_PER_KM }) * 1.5 : radiusOf(D.key) * 2.2;
    const safeR = V.isPhys ? Math.max(diveR, 0.00015) : Math.max(diveR, 0.04);
    _b.copy(_t).addScaledVector(_a, safeR);
    V.camera.position.lerpVectors(D.p0, _b, k);
    V.camera.lookAt(_t);
    if (V.controls) V.controls.target.copy(_t);
    if (e >= 1) { const cb = D.cb; V.dive = null; V.diving = false; if (cb) cb(); return; }
  } else if (V.isMovingTowardsPlanet) {
    const sel = (V.selectedPlanet && V.bodies) ? V.bodies[V.selectedPlanet] : null;
    if (sel) {
      // Re-anchor the stored approach goal to the LIVE body position every
      // frame — the snapshot taken at click time goes stale as simDays advance.
      sel.updateMatrixWorld(true);
      if (VISUAL_CENTER_BODIES[V.selectedPlanet]) bodyVisualCenter(sel, _b);
      else sel.getWorldPosition(_b);
      _a.copy(V.targetCamPos).sub(V.targetLookAt);
      V.targetLookAt.copy(_b);
      V.targetCamPos.copy(_b).add(_a);
      if (V.controls) V.controls.target.copy(_b);
    }
    V.approachT += dt;
    const approachE = easeSmoother(V.approachT / V.approachDur);
    V.camera.position.lerpVectors(V.approachP0, V.targetCamPos, approachE);
    if (V.controls) V.controls.target.copy(V.targetLookAt);
    V.camera.lookAt(V.targetLookAt);
    if (approachE >= 1) {
      V.isMovingTowardsPlanet = false;
      V.approachT = 0;
      V.trackAnchor = V.targetLookAt.clone(); // hand off to steady tracking below
    }
  } else if (V.selectedPlanet && V.bodies && V.bodies[V.selectedPlanet] && !V.fly && !V.dive && !V.sysView) {
    // Steady follow: carry the camera along with the body's per-frame motion
    // so the selection stays centered, while preserving the user's orbit offset.
    const m = V.bodies[V.selectedPlanet];
    m.updateMatrixWorld(true);
    if (VISUAL_CENTER_BODIES[V.selectedPlanet]) bodyVisualCenter(m, _b);
    else m.getWorldPosition(_b);
    if (!V.trackAnchor) V.trackAnchor = _b.clone();
    _a.copy(_b).sub(V.trackAnchor);
    V.camera.position.add(_a);
    V.camera.lookAt(_b);
    if (V.controls) V.controls.target.copy(_b);
    V.trackAnchor.copy(_b);
  } else if (V.fly) {
    const F = V.fly; F.t += dt; const e = F.dur <= 0 ? 1 : easeSmoother(F.t / F.dur);
    if (F.wide) {
      _p.copy(WIDE_POS); _t.copy(WIDE_TGT); V.originKm = [0, 0, 0];
    } else {
      const originForFrame = F.originKm || getOriginForFocus(F.toKey, V.simDays);
      const opts = { physical: V.isPhys, unitsPerKm: UNITS_PER_KM, originKm: originForFrame, focusKey: F.toKey, floatingOrigin: V.isPhys };
      if(!frameOf(F.toKey, V.simDays, _p, _t, opts)) return; // unavailable — hold last camera frame
      V.originKm = originForFrame;
    }
    V.camera.position.lerpVectors(F.p0, _p, e);
    _b.copy(F.t0).lerp(_t, e);
    V.camera.lookAt(_b);
    if (V.controls) V.controls.target.copy(_t);
    if (e >= 1) {
      V.fly = null;
      if (F.toKey && V.isPhys && !F.wide) {
        try { V.originKm = getOriginKm(F.toKey, V.simDays); } catch (er) {}
      }
      updateClipping();
    }
  } else if (V.toKey && !V.sysView && !V.selectedPlanet) {
    const opts = { physical: V.isPhys, unitsPerKm: UNITS_PER_KM, originKm: V.originKm, focusKey: V.toKey, floatingOrigin: V.isPhys };
    if(!frameOf(V.toKey, V.simDays, _p, _t, opts)) return; // unavailable — hold last camera frame
    /* Dwell tracks by body-motion delta (same pattern as selection tracking
       below): the old hard snap erased the user's orbital offset every frame,
       so mouse drags visibly did nothing. Offsets now survive; the body
       stays centered because only its motion is applied. */
    if (!V.trackAnchor) V.trackAnchor = _t.clone();
    _a.copy(_t).sub(V.trackAnchor);
    V.camera.position.add(_a);
    V.camera.lookAt(_t);
    if (V.controls) V.controls.target.copy(_t);
    V.trackAnchor.copy(_t);
  }

  if (V.controls) {
    V.controls.enabled = !V.fly && !V.diving && !V.isMovingTowardsPlanet;
    if (V.controls.enabled) V.controls.update();
    /* Penetration backstop (user-controlled frames only — never fights a
       flight path): the eye may never sit inside ANY disc, focused or not.
       The old focus-only guard missed free system view entirely (Jupiter/Sun
       could be entered at will) and any pan-separated state. Radii come from
       the meshes themselves (mode-correct renderRadius, radiusWorld
       fallback for groups), so both scales are covered. */
    if (!V.fly && !V.diving && !V.isMovingTowardsPlanet && V.bodies) {
      const keys = Object.keys(V.bodies);
      for (let bi = 0; bi < keys.length; bi++) {
        const m = V.bodies[keys[bi]];
        if (!m || m.visible === false) continue;
        let r = (m.userData && m.userData.renderRadius) || 0;
        if (!(r > 0)) {
          try { r = radiusWorld(keys[bi], { physical: V.isPhys, unitsPerKm: UNITS_PER_KM }); } catch (e) { r = 0; }
        }
        if (!(r > 0) || !isFinite(r)) continue;
        m.getWorldPosition(_gd);
        _a.copy(V.camera.position).sub(_gd);
        const cd = _a.length(), minD = r * 1.6;
        if (cd < minD) {
          if (cd > 1e-12) _a.multiplyScalar(minD / cd);
          else _a.set(minD, minD * 0.4, minD);
          V.camera.position.copy(_gd).add(_a);
          break; // re-check remaining bodies next frame
        }
      }
    }
  }

  refreshStatusBadge(); // live ephemeris-status badge (~2Hz)

  /* Metered iris: the wide view holds a fixed exposure so the true
     Mercury-to-Pluto gradient shows; a focused view meters off the target
     body (controls.target sits on it) using measured irradiance × albedo.
     Sun disc coupling + bloom threshold track the iris so the Sun stays
     dominant while bright dayside limbs bloom subtly. */
  if (V.renderer) {
    let goal = wideExposure();
    if (!V.sysView && V.controls) {
      /* Sun distance for the meter: controls.target is heliocentric in
         presentation, but in physical mode the floating origin re-centers the
         world on the focus body (target ≈ origin). Metering off it would
         collapse every au to the 0.05 rail and underexpose everything ~4-60×.
         Physical mode therefore meters off the true heliocentric radius. */
      const fkey = V.selectedPlanet || V.toKey || 'earth';
      let sunDist = V.controls.target.length();
      if (V.isPhys) {
        try {
          const km = helioDistKm(fkey, V.simDays);
          if (isFinite(km) && km > 0) sunDist = km * UNITS_PER_KM;
        } catch (e) {}
      }
      goal = exposureForBody(fkey, sunDist);
    }
    V.exposure += (goal - V.exposure) * Math.min(1, dt * 2.5);
    V.renderer.toneMappingExposure = V.exposure;
    if (V.sunMat && V.sunMat.uniforms && V.sunMat.uniforms.uExposure) {
      V.sunMat.uniforms.uExposure.value = V.exposure;
    }
    if (V.bloomPass) {
      V.bloomPass.strength = THREE.MathUtils.clamp(2.4 * V.exposure / 1.15, 0.25, 2.8);
      V.bloomPass.threshold = 0.85 / Math.max(1e-3, V.exposure);
    }
    /* Exposure compensation: the metered iris keeps sunlit rock constant but
       crushes everything unlit in post (background, stars, lines, labels,
       night sides). Each unlit channel gets a 1/exposure counter-boost so it
       holds constant while the sunlit side meters — same idea as
       Solar-Wanderer's sun-channel-only dark adaptation, inverted to fit our
       fixed-sun rig. Gains tuned empirically (see screenshots in QA). */
    try {
      const inv = 1 / Math.max(1e-4, V.exposure);
      if (V.scene && ('backgroundIntensity' in V.scene)) {
        V.scene.backgroundIntensity = Math.min(400, 0.06 * inv);
      }
      if (V.starMat && V.starMat.uniforms && V.starMat.uniforms.uBoost) {
        V.starMat.uniforms.uBoost.value = Math.min(600, 1.1 * inv);
      }
      if (V.ambient) V.ambient.intensity = Math.min(75, 0.22 * inv);
      if (V.bodies && V.bodies.earth) {
        // Earth night lights live on the mesh material itself (children carry shells)
        const em = V.bodies.earth.isMesh ? [V.bodies.earth] : (V.bodies.earth.children || []);
        const stack = [...em];
        while (stack.length) {
          const ch = stack.pop();
          if (ch.isMesh && ch.material && ch.material.userData && ch.material.userData.nightBoost) {
            ch.material.userData.nightBoost.value = Math.min(800, inv);
          }
          if (ch.children) for (const c of ch.children) stack.push(c);
        }
      }
      if (V.orbitLines) {
        for (const l of V.orbitLines.children) {
          if (l.isLine && l.material && l.userData.baseColor) {
            l.material.color.copy(l.userData.baseColor).multiplyScalar(Math.min(900, 0.55 * inv));
          }
        }
      }
      if (V.nameList) {
        const lc = Math.min(500, 0.85 * inv);
        for (const n of V.nameList) {
          if (n.sprite && n.sprite.material && n.sprite.material.color) {
            n.sprite.material.color.setScalar(lc);
          }
        }
        if (V.orbitTags) for (const s of V.orbitTags) {
          if (s.material && s.material.color) s.material.color.setScalar(lc);
        }
      }
    } catch (e) { /* compensation must never break the frame */ }
  }

  /* Render with EffectComposer (UnrealBloomPass + OutlinePass) or fallback.
     The outline pass renders its own depth mask; for true-scale 6–11 km moons
     that mask quantizes into horizontal slices at the giant physical depth
     range. Use the direct renderer for an active physical Martian moon. */
  const tinyPhysicalMoonSelected = V.isPhys && (V.selectedPlanet === 'phobos' || V.selectedPlanet === 'deimos');
  if (V.composer && ORRERY_SETTINGS.showBloom && !tinyPhysicalMoonSelected) {
    V.composer.render();
  } else if (V.renderer && V.scene && V.camera) {
    V.renderer.render(V.scene, V.camera);
  }
}

const _labelScr = new THREE.Vector3();
function findScreenLabelHit(clientX, clientY, cv) {
  if (!V.camera || !ORRERY_SETTINGS.showLabels) return null;
  const rect = cv.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  // 1. Check planet name badges
  if (V.nameGroup && V.nameGroup.visible && V.nameList) {
    for (const n of V.nameList) {
      if (!n.sprite || !n.sprite.visible) continue;
      n.sprite.getWorldPosition(_labelScr);
      _labelScr.project(V.camera);
      if (_labelScr.z > 1.0) continue; // Behind camera
      const sx = (_labelScr.x * 0.5 + 0.5) * rect.width;
      const sy = (-(_labelScr.y * 0.5) + 0.5) * rect.height;
      if (Math.abs(px - sx) < 65 && Math.abs(py - sy) < 30) {
        return n.key;
      }
    }
  }
  // 2. Check orbit distance tags
  if (V.orbitTags && ORRERY_SETTINGS.showLabels) {
    for (const s of V.orbitTags) {
      if (!s || !s.visible || !s.userData.bodyKey) continue;
      s.getWorldPosition(_labelScr);
      _labelScr.project(V.camera);
      if (_labelScr.z > 1.0) continue;
      const sx = (_labelScr.x * 0.5 + 0.5) * rect.width;
      const sy = (-(_labelScr.y * 0.5) + 0.5) * rect.height;
      if (Math.abs(px - sx) < 65 && Math.abs(py - sy) < 30) {
        return s.userData.bodyKey;
      }
    }
  }
  return null;
}

function setupRaycasting(cv) {
  cv.addEventListener('pointermove', (e) => {
    const rect = cv.getBoundingClientRect();
    V.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    V.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Check screen label hit first for cursor & outline
    const screenKey = findScreenLabelHit(e.clientX, e.clientY, cv);
    if (screenKey && V.bodies && V.bodies[screenKey]) {
      if (V.outlinePass && ORRERY_SETTINGS.showOutlines && !(V.isPhys && (screenKey === 'phobos' || screenKey === 'deimos'))) {
        V.outlinePass.selectedObjects = [V.bodies[screenKey]];
      } else if (V.outlinePass) {
        V.outlinePass.selectedObjects = [];
      }
      cv.style.cursor = 'pointer';
      return;
    }

    if (!V.camera) return;
    V.raycaster.setFromCamera(V.mouse, V.camera);
    const intersects = V.raycaster.intersectObjects(V.raycastTargets, true);

    let foundKey = null;
    let foundHit = null;
    for (const hit of intersects) {
      const bKey = identifyPlanet(hit.object);
      if (bKey) {
        foundKey = bKey;
        foundHit = hit.object;
        break;
      }
    }

    if (foundKey && V.bodies[foundKey]) {
      if (V.outlinePass && ORRERY_SETTINGS.showOutlines && !(V.isPhys && (foundKey === 'phobos' || foundKey === 'deimos'))) {
        V.outlinePass.selectedObjects = [V.bodies[foundKey]];
      } else if (V.outlinePass) {
        V.outlinePass.selectedObjects = [];
      }
      cv.style.cursor = 'pointer';
    } else if (foundHit) {
      if (V.outlinePass && ORRERY_SETTINGS.showOutlines) {
        V.outlinePass.selectedObjects = [foundHit];
      }
      cv.style.cursor = 'pointer';
    } else {
      if (V.outlinePass) V.outlinePass.selectedObjects = [];
      cv.style.cursor = 'default';
    }
  });

  cv.addEventListener('pointerdown', (e) => {
    V.dragStart.x = e.clientX;
    V.dragStart.y = e.clientY;
    V.dragStart.time = performance.now();
    /* User input wins: a press during an approach completes it instantly
       into steady tracking instead of fighting the lerp — the approach can
       never hold the camera hostage. */
    if (V.isMovingTowardsPlanet) {
      V.isMovingTowardsPlanet = false;
      V.approachT = 0;
      V.trackAnchor = V.targetLookAt.clone();
    }
  });

  cv.addEventListener('pointerup', (e) => {
    const dx = Math.abs(e.clientX - V.dragStart.x);
    const dy = Math.abs(e.clientY - V.dragStart.y);
    const dt = performance.now() - V.dragStart.time;
    /* Generous click tolerance (moved < 14px and took < 600ms) */
    if (dx < 14 && dy < 14 && dt < 600) {
      // 1. Check screen label hit
      const screenKey = findScreenLabelHit(e.clientX, e.clientY, cv);
      if (screenKey) {
        flyToPlanetDirect(screenKey);
        return;
      }

      // 2. Raycast against 3D bodies and sprites
      const rect = cv.getBoundingClientRect();
      V.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      V.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      V.raycaster.setFromCamera(V.mouse, V.camera);
      const intersects = V.raycaster.intersectObjects(V.raycastTargets, true);
      for (const hit of intersects) {
        const bKey = identifyPlanet(hit.object);
        if (bKey) {
          flyToPlanetDirect(bKey);
          break;
        }
      }
    }
  });
}

function start(host) {
  let renderer;
  try {
    const cv = document.createElement('canvas');
    cv.className = 'selcanvas';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Solar system destination view');
    host.appendChild(cv);
    const useLogDepth = detectPhysicalMode();
    renderer = new THREE.WebGLRenderer({
      canvas: cv,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: useLogDepth
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    try { renderer.setClearColor(0x04070d, 1); } catch (e) {}
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch (e) {
    V.failed = true;
    return;
  }

  if (typeof bodyState !== 'function' || typeof LEVELS === 'undefined') {
    V.failed = true;
    console.warn('[selview] missing LEVELS/bodyState');
    return;
  }

  V.isPhys = detectPhysicalMode();
  try {
    if (V.isPhys) {
      ensurePhysicalModeFromURL();
      try {
        if (globalThis.Astronomy && typeof globalThis.Astronomy.setMode === 'function') {
          globalThis.Astronomy.setMode('physical');
        }
      } catch (e) {}
      console.info('[selview] physical mode — Earth ' + (radiusKmTrue('earth') * UNITS_PER_KM).toExponential(3) + 'u');
    } else {
      console.info('[selview] presentation mode — Earth ' + radiusOf('earth').toFixed(4) + 'u safe');
    }
  } catch (e) {}

  V.renderer = renderer;
  V.canvas = renderer.domElement;
  V.scene = new THREE.Scene();
  V.camera = new THREE.PerspectiveCamera(42, 16 / 10, V.isPhys ? 1e-7 : 0.02, V.isPhys ? 5000 : 800);

  /* Deep Space Cosmic Skybox (dimmed so planets pop against true black) */
  try {
    const skybox = loadSpaceSkybox();
    if (skybox) V.scene.background = skybox;
    if ('backgroundIntensity' in V.scene) V.scene.backgroundIntensity = 0.7;
  } catch (e) {}

  try {
    V.controls = new OrbitControls(V.camera, V.canvas);
    V.controls.enableDamping = true;
    V.controls.dampingFactor = 0.15;
    V.controls.minDistance = V.isPhys ? 0.00005 : 0.04;
    V.controls.maxDistance = V.isPhys ? 500 : 450;
    V.controls.zoomSpeed = 1.8;
    V.controls.enabled = true;
  } catch (e) {
    V.controls = null;
  }

  V.camera.position.set(0, 8.5, 12.5);
  V.camera.lookAt(0, 0, 0);

  /* Build Solar System with all features */
  const built = buildSolarSystem(V.scene, () => !!V.scene, {
    simDays: 0,
    physical: V.isPhys,
    unitsPerKm: UNITS_PER_KM,
    focusKey: null,
    originKm: [0, 0, 0]
  });
  V.bodies = built.bodies;
  V.flareMats = built.flareMats;
  V.atmospheres = built.atmospheres;
  V.orbitLines = built.orbitLines;
  V.orbitTags = built.orbitTags || [];
  V.asteroidBelts = built.asteroidBelts;
  V.sunMat = built.sunMat;
  V.sunLight = built.sunLight;
  V.ambient = built.ambient || null;
  V.built = built; // owner of light/corona/uniforms for applySunPosition()

  /* Stars Point Cloud */
  const stars = buildStars();
  V.scene.add(stars.points);
  V.starMat = stars.mat;

  /* Planet + moon Labels, always visible (mission focus and full system) */
  V.nameGroup = new THREE.Group();
  V.nameGroup.visible = ORRERY_SETTINGS.showLabels;
  V.nameList = [];
  /* Subs are real mean distances: planets AU (JPL elements), moons km from
     parent (MOONS smaKm), Bennu AU (SBDB). */
  const labelList = [
    ['sun', 'SUN', 'SOL · G2V'], ['mercury', 'MERCURY', '0.39 AU'], ['venus', 'VENUS', '0.72 AU'],
    ['earth', 'EARTH', '1.00 AU'], ['moon', 'MOON', '384K KM'], ['mars', 'MARS', '1.52 AU'],
    ['phobos', 'PHOBOS', '9.4K KM'], ['deimos', 'DEIMOS', '23.5K KM'],
    ['jupiter', 'JUPITER', '5.20 AU'], ['io', 'IO', '422K KM'], ['europa', 'EUROPA', '671K KM'],
    ['ganymede', 'GANYMEDE', '1.07M KM'], ['callisto', 'CALLISTO', '1.88M KM'],
    ['saturn', 'SATURN', '9.54 AU'], ['uranus', 'URANUS', '19.19 AU'],
    ['neptune', 'NEPTUNE', '30.07 AU'], ['pluto', 'PLUTO', '39.48 AU'],
    ['bennu', 'BENNU', '1.13 AU']
  ];
  for (const [key, label, sub] of labelList) {
    const s = makeName(key, label, sub);
    V.nameGroup.add(s);
    V.nameList.push({ key, sprite: s });
  }
  V.scene.add(V.nameGroup);

  /* Populate Raycasting Targets */
  V.raycastTargets = [];
  for (const key of Object.keys(V.bodies)) {
    if (V.bodies[key]) V.raycastTargets.push(V.bodies[key]);
  }
  /* Labels are clickable too (bodyKey set in makeName -> identifyPlanet). */
  if (V.nameList) for (const n of V.nameList) { if (n.sprite) V.raycastTargets.push(n.sprite); }
  if (V.orbitTags) for (const s of V.orbitTags) { if (s) V.raycastTargets.push(s); }

  /* Set up Post-Processing Pipeline (Bloom + Outline) */
  try {
    const composer = new EffectComposer(V.renderer);
    composer.addPass(new RenderPass(V.scene, V.camera));

    const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), V.scene, V.camera);
    outlinePass.edgeStrength = 3.2;
    outlinePass.edgeGlow = 1.0;
    outlinePass.edgeThickness = 1.2;
    outlinePass.visibleEdgeColor.set(0xffffff);
    outlinePass.hiddenEdgeColor.set(0x1a2433);
    composer.addPass(outlinePass);
    V.outlinePass = outlinePass;

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.4, 0.9, 0.85);
    bloomPass.threshold = 0.85; // linear-HDR space: sun dominates, bright dayside limbs bloom subtly
    bloomPass.radius = 0.9; // wide + soft: the true-scale sun is sub-pixel at range and tight radii resolve the mip chain into a box
    bloomPass.strength = Math.min(2.8, 0.53 * ORRERY_SETTINGS.sunIntensity); // locked to sun glow
    composer.addPass(bloomPass);
    V.bloomPass = bloomPass;

    /* REQUIRED r152+ pattern: intermediate passes render linear HDR, and the
       OutputPass applies tone mapping (with the live auto-exposure) + sRGB
       at the end. Without it the composer output is raw linear = nuclear. */
    composer.addPass(new OutputPass());

    V.composer = composer;
  } catch (e) {
    console.warn('[selview] postprocessing setup failed:', e);
    V.composer = null;
  }

  /* Raycasting on canvas */
  setupRaycasting(V.canvas);

  /* Build HUD and Info Card Overlay */
  createHUD(host);

  V.simDays = todayDays();
  /* adopt the live title/brief clock when fresh: same system, no time jump. */
  try {
    const s = window.__MARGIN_SIMDAYS;
    if (isFinite(s) && Math.abs(s - V.simDays) < 45) V.simDays = s;
  } catch (e) {}
  let def = 'l1';
  try {
    if (typeof S !== 'undefined' && S.levelId && LEVEL_BODY[S.levelId]) def = S.levelId;
  } catch (e) {}
  V.cur = def;
  V.toKey = LEVEL_BODY[def];
  V.sysView = false;
  V.originKm = V.isPhys ? getOriginKm(V.toKey, V.simDays) : [0, 0, 0];

  markCard(def);
  setCaption(def);
  commitFly(V.toKey);
  if (V.fly) {
    /* seamless title -> select: when the title just handed off a live
       viewpoint (< 15 s old), start the flight there instead of the wide
       establishing shot — one continuous pull-back, no second intro. */
    let adopted = false;
    try {
      const h = window.__MARGIN_HANDOFF;
      /* validate before trusting: a stale or non-finite viewpoint would fling
         the flight start exactly like the old title solver bug did. */
      if (h && isFinite(h.t) && performance.now() - h.t < 15000 &&
          Array.isArray(h.pos) && h.pos.length === 3 &&
          isFinite(h.pos[0] + h.pos[1] + h.pos[2]) &&
          Math.hypot(h.pos[0], h.pos[1], h.pos[2]) < 100) {
        V.camera.position.set(h.pos[0], h.pos[1], h.pos[2]);
        if (V.controls && Array.isArray(h.tgt)) V.controls.target.set(h.tgt[0], h.tgt[1], h.tgt[2]);
        adopted = true;
      }
    } catch (e) {}
    if (!adopted) V.camera.position.set(0, 8.5, 12.5);
    const d = new THREE.Vector3();
    V.camera.getWorldDirection(d);
    V.fly.p0.copy(V.camera.position);
    V.fly.dur = 2.2;
    V.fly.t0.copy(V.camera.position).addScaledVector(d, 4);
  }

  verifyBennuEphem().then((r) => {
    V.ephem = r.live ? 'live' : 'cached';
    try {
      console.info('[selview] SBDB check:', V.ephem, r.delta == null ? '' : ('ΔM ' + r.delta.toFixed(2) + '°'));
    } catch (e) {}
    if (V.cur) setCaption(V.cur);
  }).catch(() => {});

  /* Hover and Focus syncing with mission cards */
  V.onHover = (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-act="level"]') : null;
    if (t && t.dataset.id) {
      setBody(t.dataset.id);
    }
  };
  V.onFocus = V.onHover;
  document.addEventListener('mouseover', V.onHover);
  document.addEventListener('focusin', V.onFocus);

  /* Handle Action Buttons in Caption */
  V.onClick = (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'expandview') toggleFullscreen();
  };
  document.addEventListener('click', V.onClick);

  V.onKey = (e) => {
    if (e.key === 'Escape' && V.isFullscreen) {
      if (V.sysView) toggleSystem();
      else toggleFullscreen(false);
    }
  };
  window.addEventListener('keydown', V.onKey);

  try { document.body.classList.add('sel3d'); } catch (e) {}
  V.W = 0; V.H = 0;
  size();
  V.last = performance.now();
  if (!V.raf) V.raf = requestAnimationFrame(frame);
}

function sync() {
  let host = null;
  try { host = document.getElementById('selview'); } catch (e) { host = null; }
  if (!host) {
    if (V.raf || V.canvas) stop();
    try { document.body.classList.remove('sel3d'); } catch (e) {}
    return;
  }
  if (V.canvas && V.canvas.isConnected && V.raf) return;
  stop();
  if (V.failed) return;
  start(host);
}

window.SelView = {
  sync,
  flyToBrief,
  toggleSystem,
  resetView,
  toggleFullscreen,
  flyToPlanetDirect,
  closeInfo,
  debug: () => ({
    rev: '2026-09-25-r9', // build tag: report this with any visual bug (SPA tabs never refetch)
    mode: V.isPhys ? 'physical' : 'presentation',
    earthPhysical: radiusKmTrue('earth') * UNITS_PER_KM,
    earthPresentation: radiusOf('earth'),
    selected: V.selectedPlanet,
    focus: (V.selectedPlanet || V.toKey),
    approach: !!V.isMovingTowardsPlanet,
    flying: !!V.fly,
    diving: !!V.diving,
    provider: (() => { try { return providerOf(V.selectedPlanet || V.toKey || 'earth', V.simDays); } catch (e) { return 'NONE'; } })(),
    status: (() => { try { return statusOf(V.selectedPlanet || V.toKey || 'earth', V.simDays); } catch (e) { return null; } })()
  }),
  /* Live scene probe for verification (no gameplay effect). */
  probe: () => {
    const o = { exposure: V.exposure, simDays: V.simDays };
    try { o.cam = V.camera.position.toArray().map((v) => +v.toFixed(3)); } catch (e) { o.cam = null; }
    try { o.target = V.controls ? V.controls.target.toArray().map((v) => +v.toFixed(3)) : null; } catch (e) { o.target = null; }
    try { o.near = V.camera.near; o.far = V.camera.far; } catch (e) {}
    try { o.prox = (V.proxM !== undefined) ? +V.proxM.toExponential(2) : null; } catch (e) { o.prox = null; }
    o.bg = !!V.scene.background;
    o.orbitLines = V.orbitLines ? { visible: V.orbitLines.visible, children: V.orbitLines.children.length } : null;
    o.labels = V.nameGroup ? { visible: V.nameGroup.visible, count: V.nameList.length } : null;
    o.bodies = V.bodies ? Object.keys(V.bodies) : null;
    try {
      o.invis = [];
      if (V.bodies) for (const bk of Object.keys(V.bodies)) {
        const mm = V.bodies[bk];
        if (mm && mm.visible === false) o.invis.push(bk);
      }
    } catch (e) { o.invis = null; }
    o.sunLight = V.sunLight ? V.sunLight.intensity : null;
    try {
      const VC = V.camera.position.constructor;
      if (V.bodies && V.bodies.sun) {
        const wp = new VC();
        V.bodies.sun.getWorldPosition(wp);
        o.sun = wp.toArray().map((v) => +v.toFixed(4));
      } else o.sun = null;
    } catch (e) { o.sun = null; }
    try { o.sunLightPos = V.sunLight ? V.sunLight.position.toArray().map((v) => +v.toFixed(4)) : null; } catch (e) { o.sunLightPos = null; }
    try { o.corona = (V.built && V.built.corona) ? +V.built.corona.scale.x.toExponential(2) : null; } catch (e) { o.corona = null; }
    try {
      const n0 = V.nameList && V.nameList[0];
      if (n0) {
        const wp = new (V.camera.position.constructor)();
        n0.sprite.getWorldPosition(wp);
        o.label0 = { key: n0.key, pos: wp.toArray().map((v) => +v.toFixed(3)),
          scale: [+(n0.sprite.scale.x).toFixed(3), +(n0.sprite.scale.y).toFixed(3)],
          visible: n0.sprite.visible, matVisible: n0.sprite.material.visible,
          opacity: n0.sprite.material.opacity,
          color: n0.sprite.material.color.toArray().map((v) => +v.toFixed(1)),
          inScene: (function f(g) { return g === n0.sprite ? true : ((g.children || []).some(f)); })(V.scene) };
      }
      o.nameGroupVisible = V.nameGroup.visible;
      o.ambient = V.ambient ? V.ambient.intensity : null;
      o.bgI = V.scene.backgroundIntensity;
      // Projected screen coords of every label with the REAL camera
      try {
        const w = V.canvas.clientWidth || 1, h = V.canvas.clientHeight || 1;
        const pv = new (V.camera.position.constructor)();
        o.screen = V.nameList.map((n) => {
          n.sprite.getWorldPosition(pv);
          const d = V.camera.position.distanceTo(pv);
          pv.project(V.camera);
          return { key: n.key, x: Math.round(((pv.x + 1) / 2) * w), y: Math.round(((1 - pv.y) / 2) * h),
            behind: pv.z > 1, dist: +d.toFixed(2) };
        });
      } catch (e) { o.screenErr = String(e).slice(0, 100); }
    } catch (e) { o.labelErr = String(e).slice(0, 120); }
    return o;
  }
};

try { sync(); } catch (e) { console.error('[selview] sync failed', e); }
