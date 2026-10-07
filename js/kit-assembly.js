/* MARGIN shared spacecraft composer (js/kit-assembly.js).
   The ONE authoritative builder of the player's craft, used by both the build
   bay (js/view3d.js: renderer + highlight + framing) and ops (js/ops-view.js:
   fixed symbolic size + label + scan beam). No second implementation.
   Side-effect-free module: no renderer, no DOM at import, no globals.
   Selection is an explicit object — never reads game state:
     sel = { n, power, comms, prop, instr[] }.
   Sources (vendored static, NASA-only):
     models/nasa/satellite_kit_body_{1,2,3}.glb
     models/nasa/satellite_kit_wings_{1,2,3}.glb  (power / solar arrays)
     models/nasa/satellite_kit_radio_{1,2,3}.glb  (comms / dishes)
   Origin: NASA 3D Resources "Satellite Kit" (public domain, NASA media
   guidelines). Modular BY DESIGN: body + wings + radio at a shared origin.
   All 9 kit GLBs use KHR_draco_mesh_compression — decoded by the vendored
   static three r160 decoder (vendor/draco/, no network). Parsed GLBs are
   cached per URL; every assembly clones (shares geometry, own transforms).
   Tiers: body 1/2/3 by instrument count (<=2 / 3-5 / 6+); wings 1/2/3 by
   power class; radio 1/2/3 by comms class. Within-tier size factors keep
   every option visually distinct (representative illustration).
   Instruments have no per-unit NASA CAD: generic procedural glyphs shaped by
   instrument group (representative, never flight hardware). Propulsion maps
   to a procedural engine block (kit ships no engine parts). */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';

export const KIT = {
  bodies: [
    'models/nasa/satellite_kit_body_1.glb',
    'models/nasa/satellite_kit_body_2.glb',
    'models/nasa/satellite_kit_body_3.glb'
  ],
  wings: [
    'models/nasa/satellite_kit_wings_1.glb',
    'models/nasa/satellite_kit_wings_2.glb',
    'models/nasa/satellite_kit_wings_3.glb'
  ],
  radios: [
    'models/nasa/satellite_kit_radio_1.glb',
    'models/nasa/satellite_kit_radio_2.glb',
    'models/nasa/satellite_kit_radio_3.glb'
  ],
  fallback: 'models/margin_mission_bus.glb' // original MARGIN bus (not NASA)
};

let _draco = null;
function draco() {
  if (!_draco) {
    _draco = new DRACOLoader();
    try { _draco.setDecoderPath('vendor/draco/'); } catch (e) {}
  }
  return _draco;
}

/* Parsed-GLB cache: one network fetch + Draco decode per URL per session. */
const _cache = new Map();
export function loadKitGltf(url) {
  if (!_cache.has(url)) {
    _cache.set(url, new Promise((resolve, reject) => {
      const l = new GLTFLoader();
      try { l.setDRACOLoader(draco()); } catch (e) {}
      l.load(url, resolve, undefined, reject);
    }));
  }
  return _cache.get(url);
}

/* --- hero craft: single-piece NASA flown-mission models per fixed mission ---
   Fixed missions fly their real NASA hero; free-design levels (l1/sbx) fly the
   player's modular kit build. Sim is untouched — this only selects the mesh.
   Fallback chain everywhere: hero -> kit assembly -> margin bus -> marker. */
export const HERO_BY_LEVEL = {
  l2: { url: 'models/nasa/lro.glb', assetId: 'LRO-A', why: 'Lunar orbiter for lunar polar mission' },
  l3: { url: 'models/nasa/mro.glb', assetId: 'MRO-A', why: 'Mars orbiter for Mars relay mission' },
  l4: { url: 'models/nasa/osiris_rex.glb', assetId: 'OSIRIS-REX', why: 'Sample-return probe for asteroid TAG mission' },
  l5: { url: 'models/nasa/voyager.glb', assetId: 'VOYAGER-A', why: 'Outer-system flyby heritage for Europa tour' },
  l1: null, sbx: null // kit build: your design
  // spares (viewer-available, unassigned): juno, maven, messenger
};
export function heroForLevel(levelId) {
  try { return HERO_BY_LEVEL[levelId] || null; } catch (e) { return null; }
}
/* Normalize a loaded hero GLB clone into a reliably renderable craft.
   Repairs common vendor-GLB visibility killers WITHOUT changing geometry:
   - owns materials (clones) so the parsed-GLB cache stays pristine,
   - lifts pure-black untextured PBR base colors to dark gray (large black
     parts render black-on-black under the dim space rig — the "invisible
     Quiet Side" look) while keeping the author's gold/silver/bronze hues
     untouched (no global tint wash — the brown/rust cast came from a warm
     multiply over every hero texture),
   - forces fully-transparent shells (opacity ~0) back to opaque,
   - double-sides thin panels so dishes/arrays never vanish from behind,
   - disables frustum culling per mesh (authoring-time bounds + recentered
     parents otherwise cull the craft at close zoom),
   - guarantees a non-empty group: a wireframe marker box fallback instead
     of an invisible craft when the GLB carries no meshes at all. */
export function normalizeHero(group) {
  const out = (group && group.isObject3D) ? group : new THREE.Group();
  try {
    let meshes = 0;
    out.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      try { o.frustumCulled = false; } catch (e) {}
      try { o.castShadow = false; o.receiveShadow = false; } catch (e) {}
      try {
        const owns = (m) => {
          const c = m.clone();
          if (!c.emissive) c.emissive = new THREE.Color(0x000000);
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(owns) : (o.material ? owns(o.material) : o.material);
      } catch (e) {}
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        if (!m) continue;
        try {
          if (m.transparent && (m.opacity === 0 || m.opacity < 0.03)) { m.transparent = false; m.opacity = 1; }
          if (m.alphaTest > 0.9) m.alphaTest = 0;
          if (m.side === THREE.FrontSide) m.side = THREE.DoubleSide;
          if (m.color && !m.map && m.color.r < 0.02 && m.color.g < 0.02 && m.color.b < 0.02) m.color.setHex(0x232830);
          if (m.needsUpdate !== undefined) m.needsUpdate = true;
          /* MRO-class heroes carry WebP base-color textures: three r160's
             bundled WebP path can leave the map blank on some drivers, which
             drops the whole craft to its warm material tint (the "rusty
             Mars" look) or to black. Fall back to a neutral light-gray base
             whenever the map failed to decode to readable pixels. */
          try {
            if (m.map && m.map.image !== undefined &&
              (!m.map.image || m.map.image.width === 0 || m.map.image.width === undefined)) {
              if (m.color) m.color.setHex(0xb9c1cb);
            }
          } catch (e4) {}
        } catch (e) {}
      }
    });
    if (!meshes) {
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.6, 1),
        new THREE.MeshBasicMaterial({ color: 0x9fb4cc, wireframe: true }));
      marker.name = 'hero_empty_fallback';
      try { marker.frustumCulled = false; } catch (e) {}
      out.add(marker);
      try { out.userData.heroEmpty = true; } catch (e2) {}
    }
  } catch (e) { /* never throw out of the presentation path */ }
  return out;
}
/* --- rover: vendored NASA Perseverance hero for L2 surface phases ---
   Raw NASA-export units are arbitrary per model (audit table:
   QA/ROVER_GLB_PHASE3_QA.md — Perseverance spans 175.63 raw units for a 3 m
   rover; MRO 89.74 for 13.6 m; MAVEN 13.46 for 11.43 m). calibrateRover
   measures the bounding box and normalizes max extent to ROVER_TRUE_SPAN_M
   (Bennu pattern: measure Box3, center, scale from the measured maximum
   extent), so Phase-5 terrain placement is true-scale. Material repairs reuse
   normalizeHero (shared path, geometry untouched). Lazy: fetched on first L2
   preview compose only — never at boot, never headless (?no3d safe: view3d
   only calls this inside the live-renderer compose path). */
export const ROVER_GLB_URL = 'models/nasa/perseverance.glb';
export const ROVER_TRUE_SPAN_M = 3.0; // NASA Mars 2020 fact sheet: ~3 m long, 2.7 m wide, 2.2 m tall
export const ROVER_RAW_MAX_UNITS = 175.63; // measured bbox max (audit table)
export const ROVER_CAL_FACTOR = ROVER_TRUE_SPAN_M / ROVER_RAW_MAX_UNITS; // ≈0.01708 m/unit
let _roverP = null;
export function loadRoverGltf() {
  if (!_roverP) _roverP = loadKitGltf(ROVER_GLB_URL);
  return _roverP;
}
export function calibrateRover(rawGroup) {
  /* Wheels define the ground plane: Perseverance wheels are exactly 0.5 m in
     diameter (published), and the export keeps them assembled at y≈0. A full
     bbox grounds on whichever stray part hangs lowest (a waveguide block sits
     ~1.5 m below the wheels in this export) — floating the rover. So: span
     assert on the whole root, lift from the wheel meshes, full bbox fallback. */
  const fixed = normalizeHero(rawGroup);
  const root = new THREE.Group();
  root.name = 'rover_calibrated';
  try {
    fixed.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(fixed);
    if (b.isEmpty()) throw new Error('rover glb empty');
    const c = b.getCenter(new THREE.Vector3());
    const sz = b.getSize(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
    const k = ROVER_TRUE_SPAN_M / maxDim;
    const inner = new THREE.Group();
    // Offset lives INSIDE the scaled frame (cf. ops-view craft_true): a single
    // node with position+scale would apply the offset unscaled.
    inner.position.set(-c.x * k, -c.y * k, -c.z * k);
    fixed.scale.multiplyScalar(k);
    inner.add(fixed);
    root.add(inner);
    root.userData.calFactor = k;
    root.userData.trueSpanM = ROVER_TRUE_SPAN_M;
    root.updateMatrixWorld(true);
    // Span assert: a unit-rogue export rescales here, never silently.
    const chk = new THREE.Box3().setFromObject(root);
    if (!chk.isEmpty()) {
      const cs = chk.getSize(new THREE.Vector3());
      const span = Math.max(cs.x, cs.y, cs.z) || 1;
      if (Math.abs(span - ROVER_TRUE_SPAN_M) / ROVER_TRUE_SPAN_M > 0.10) {
        root.scale.multiplyScalar(ROVER_TRUE_SPAN_M / span);
        root.updateMatrixWorld(true);
      }
    }
    // Ground lift from the wheels (0.5 m flight hardware), not the bbox.
    // Match the named assembly subtree (mesh names are part codes; the
    // "Wheels_objs" node carries the name), then bound that subtree.
    let lift = null;
    try {
      root.updateMatrixWorld(true);
      const wheelRoots = [];
      root.traverse((o) => {
        if (/wheel/i.test(o.name || '')) wheelRoots.push(o);
      });
      if (wheelRoots.length) {
        const wb = new THREE.Box3();
        for (const w of wheelRoots) wb.expandByObject(w);
        if (!wb.isEmpty()) lift = -wb.min.y;
      }
    } catch (e2) { lift = null; }
    if (lift === null || !isFinite(lift)) {
      const fb = new THREE.Box3().setFromObject(root);
      lift = fb.isEmpty() ? 1.1 : -fb.min.y;
    }
    root.userData.groundLift = lift;
  } catch (e) {
    try { root.add(fixed); } catch (e2) {}
    root.userData.calFactor = 1;
    root.userData.trueSpanM = ROVER_TRUE_SPAN_M;
    root.userData.groundLift = 1.1;
  }
  return root;
}
export function levelOfSel(sel) { try { return (sel && sel.level) || ''; } catch (e) { return ''; } }
export function bodyTierOf(sel) {
  const n = (sel && sel.n | 0) || 0;
  return n <= 2 ? 0 : n <= 5 ? 1 : 2;
}
export function wingTierOf(sel) {
  const p = sel && sel.power;
  return (p === 'sa1' || p === 'rtg1') ? 0 : (p === 'sa2' || p === 'rtg2') ? 1 : 2;
}
export function radioTierOf(sel) {
  const c = sel && sel.comms;
  return c === 'lga' ? 0 : (c === 'mga' || c === 'hga2') ? 1 : 2;
}
/* Within-tier identity (Phase 5): tiers select PART IDENTITY ONLY at scale 1.0.
    Former WING_SCALE/RADIO_SCALE runtime multipliers removed — arbitrary
    physical scaling is forbidden. Kept as deprecated no-op maps for save compat. */
export const WING_SCALE = { sa1: 1, sa2: 1, sa3: 1, sa4: 1, rtg1: 1, rtg2: 1 };
/* Dishes grow in place (about the part centre): origin-scaling would shove
   the dish further out along its arm and detach it visually. Kept modest —
   radio_3's dish is already large at 1.0. */
export const RADIO_SCALE = { lga: 1, mga: 1, hga2: 1, hga3: 1, ka: 1 };
export function wingScaleOf(power) { return WING_SCALE[power] || 1; }
export function radioScaleOf(comms) { return RADIO_SCALE[comms] || 1; }
/* Propulsion → procedural engine block (the kit ships no engine parts):
   mono/bi/dual = nozzle sized by class; sep = triple ion thrusters, blue. */
export function engineSpecOf(prop) {
  if (prop === 'mono') return { kind: 'chem', s: 1.0 };
  if (prop === 'bi') return { kind: 'chem', s: 1.0 };
  if (prop === 'dual') return { kind: 'chem', s: 1.0 };
  if (prop === 'sep') return { kind: 'ion', s: 1.0 };
  return null;
}
export function keyOf(sel) {
  try {
    return bodyTierOf(sel) + ':' + sel.power + ':' + sel.comms + ':' + sel.prop + ':' +
      ((sel.instr || []).join(','));
  } catch (e) { return '1:sa2:mga:none:'; }
}
export function groupOfInstr(id, catalog) {
  try {
    if (catalog) for (const x of catalog) if (x.id === id) return x.g;
  } catch (e) {}
  return '';
}

/* Scale a kit part about the shared assembly origin: uniform scale preserves
   every internal mount, the part just reads bigger/smaller in place.
   (Wings: span grows outward from the root — the desired read.) */
export function scalePartAboutOrigin(part, f) {
  if (!part || !f || f === 1) return;
  try { part.scale.setScalar(f); } catch (e) {}
}
/* Scale a compact part about its own centre via a holder group (mounts near
   the origin barely move; the asset re-seats itself). Used for dishes.
   NOTE: plain add(), not attach() — attach preserves world transforms and
   would no-op the scale. */
export function scalePartAboutCenter(part, f) {
  if (!part || !f || f === 1) return;
  try {
    part.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(part);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const kids = part.children.slice();
    if (!kids.length) return;
    const cl = part.worldToLocal(c.clone());
    const holder = new THREE.Group();
    holder.name = 'scale_holder';
    holder.position.copy(cl);
    holder.scale.setScalar(f);
    part.add(holder);
    for (const k of kids) { k.position.sub(cl); holder.add(k); }
  } catch (e) {}
}

/* ── Generic procedural instrument glyphs (presentation only) ── */
let _IGEO = null, _IMAT = null;
function _imat() {
  if (_IMAT) return _IMAT;
  const std = (c, m, r) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, emissive: new THREE.Color(0x000000), emissiveIntensity: 0 });
  _IMAT = {
    body: std(0x9aa3ad, 0.6, 0.45),
    gold: std(0xc8a24a, 0.5, 0.5),
    lens: std(0x0a0f18, 0.8, 0.2),
    panel: std(0x1d3a6e, 0.4, 0.5)
  };
  return _IMAT;
}
function _igeo() {
  if (_IGEO) return _IGEO;
  _IGEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    tip: new THREE.SphereGeometry(0.5, 10, 8)
  };
  return _IGEO;
}
function _part(geo, mat, sx, sy, sz, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
  return m;
}
/* Build one glyph of unit height ~1 (caller scales). Origin at mount top. */
export function buildGlyph(group) {
  const G = _igeo(), M = _imat();
  const g = new THREE.Group();
  switch (group) {
    case 'Imaging': // camera barrel + lens
      g.add(_part(G.box, M.body, 0.6, 0.5, 0.6, 0, -0.25, 0));
      g.add(_part(G.cyl, M.body, 0.4, 0.5, 0.4, 0, -0.7, 0));
      g.add(_part(G.cyl, M.lens, 0.32, 0.06, 0.32, 0, -0.95, 0));
      break;
    case 'Spectroscopy': // gold-blanketed box + slit aperture
      g.add(_part(G.box, M.gold, 0.7, 0.5, 0.5, 0, -0.25, 0));
      g.add(_part(G.box, M.lens, 0.5, 0.08, 0.06, 0, -0.5, 0.24));
      break;
    case 'Fields': // long boom + tip sensor
      g.add(_part(G.cyl, M.body, 0.08, 1.6, 0.08, 0, -0.8, 0));
      g.add(_part(G.tip, M.gold, 0.22, 0.22, 0.22, 0, -1.65, 0));
      break;
    case 'Radar': // flat antenna panel + feed mast
      g.add(_part(G.box, M.panel, 1.4, 0.06, 1.0, 0, -0.5, 0));
      g.add(_part(G.cyl, M.body, 0.07, 0.5, 0.07, 0, -0.25, 0));
      break;
    case 'In-situ': // base + angled arm + scoop
      g.add(_part(G.box, M.body, 0.5, 0.3, 0.5, 0, -0.15, 0));
      g.add(_part(G.box, M.gold, 0.16, 0.9, 0.16, 0.1, -0.7, 0, 0, 0, -0.25));
      g.add(_part(G.box, M.body, 0.35, 0.12, 0.3, 0.32, -1.1, 0));
      break;
    case 'Radio Sci.': // short mast + crossbar (smaller than Fields boom)
      g.add(_part(G.cyl, M.body, 0.09, 0.7, 0.09, 0, -0.35, 0));
      g.add(_part(G.cyl, M.gold, 0.06, 0.6, 0.06, 0, -0.6, 0, 0, 0, Math.PI / 2));
      g.add(_part(G.tip, M.body, 0.16, 0.16, 0.16, 0, -0.72, 0));
      break;
    default: // unknown group — plain avionics box
      g.add(_part(G.box, M.body, 0.55, 0.45, 0.55, 0, -0.22, 0));
      break;
  }
  return g;
}

let _EGEO = null, _EMAT = null;
function _egeo() {
  if (_EGEO) return _EGEO;
  _EGEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    cone: new THREE.ConeGeometry(0.5, 1, 16, 1, true)
  };
  return _EGEO;
}
function _emat() {
  if (_EMAT) return _EMAT;
  const std = (c, m, r) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, emissive: new THREE.Color(0x000000), emissiveIntensity: 0 });
  _EMAT = {
    gray: std(0x8b939e, 0.7, 0.4),
    dark: std(0x22282f, 0.6, 0.6),
    ion: new THREE.MeshBasicMaterial({ color: 0x5eb4ff })
  };
  return _EMAT;
}

/* Hang a procedural engine block under the bus already in parent.
   Returns the row group (added to parent) or null. Meshes carry
   userData.engine for consumer highlight bookkeeping. */
export function mountEngineRow(parent, spec) {
  try {
    if (!parent || !parent.getObjectByName) return null;
    if (!spec) return null;
    const box = new THREE.Box3().setFromObject(parent);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const toLocal = (v) => (parent.worldToLocal ? parent.worldToLocal(v) : v);
    const cl = toLocal(c.clone());
    const minLy = toLocal(new THREE.Vector3(c.x, box.min.y, c.z)).y;
    const G = _egeo(), M = _emat();
    const row = new THREE.Group();
    row.name = 'engine_block';
    const u = Math.max(size.x, size.y, size.z) * 0.16 * (spec.s || 1);
    const P = (geo, mat, sx, sy, sz, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(Math.max(sx, 1e-5), Math.max(sy, 1e-5), Math.max(sz, 1e-5));
      m.position.set(x, y, z);
      row.add(m); return m;
    };
    if (spec.kind === 'chem') {
      P(G.cyl, M.dark, u * 0.35, u * 0.3, u * 0.35, cl.x, minLy - u * 0.15, cl.z);
      P(G.cone, M.gray, u * 0.7, u * 0.6, u * 0.7, cl.x, minLy - u * 0.6, cl.z);
    } else {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        P(G.cyl, M.ion, u * 0.22, u * 0.35, u * 0.22,
          cl.x + Math.cos(a) * u * 0.35, minLy - u * 0.17, cl.z + Math.sin(a) * u * 0.35);
      }
    }
    row.traverse(o => { if (o.isMesh) o.userData.engine = true; });
    parent.add(row);
    return row;
  } catch (e) { return null; }
}

/* Hang the generic instrument rack (rail + one glyph per id) under everything
   already in parent. groupOf maps id -> INSTR group string. Returns the row
   group (added to parent) or null. Meshes carry userData.generic. */
export function mountGlyphRow(parent, ids, groupOf) {
  try {
    if (!parent || !parent.getObjectByName) return null;
    ids = (ids || []).slice(0, 12);
    if (!ids.length) return null;
    const box = new THREE.Box3().setFromObject(parent);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const toLocal = (v) => (parent.worldToLocal ? parent.worldToLocal(v) : v);
    const craftLocal = toLocal(c.clone());
    const row = new THREE.Group();
    row.name = 'generic_instruments';
    const n = ids.length;
    const span = Math.max(size.x, 0.02);
    const cell = span / n;
    const s = Math.min(cell * 0.45, Math.max(size.y, size.x, size.z) * 0.3);
    const minLy = toLocal(new THREE.Vector3(c.x, box.min.y, c.z)).y;
    const rowY = minLy - Math.max(size.y * 0.02, 0.001);
    // equipment rail: slim bar across the row top (generic illustration)
    const G0 = _igeo(), M0 = _imat();
    const rail = new THREE.Mesh(G0.box, M0.body);
    rail.scale.set(Math.max(span * 0.96, 1e-4), Math.max(s * 0.12, 1e-5), Math.max(s * 0.3, 1e-5));
    rail.position.set(craftLocal.x, rowY + s * 0.06, craftLocal.z);
    rail.traverse(o => { if (o.isMesh) o.userData.generic = true; });
    row.add(rail);
    for (let i = 0; i < n; i++) {
      const glyph = buildGlyph(groupOf ? groupOf(ids[i]) : '');
      glyph.scale.setScalar(Math.max(s, 1e-4));
      glyph.position.set(
        craftLocal.x - span / 2 + cell * (i + 0.5),
        rowY,
        craftLocal.z
      );
      glyph.traverse(o => { if (o.isMesh) o.userData.generic = true; });
      row.add(glyph);
    }
    parent.add(row);
    return row;
  } catch (e) { return null; }
}

/* Assemble body + wings + radio scenes (parsed GLTF scenes, cloned here so
   the cache stays pristine) with per-option scales. Returns { group, parts }.
   Clone shares geometry; callers own materials (clone again per mesh if they
   mutate, e.g. highlight emissive). */
export function assembleKit(bodyScene, wingScene, radioScene, wScale, rScale) {
  const parts = [bodyScene.clone(true), wingScene.clone(true), radioScene.clone(true)];
  scalePartAboutOrigin(parts[1], wScale);
  scalePartAboutCenter(parts[2], rScale);
  const group = new THREE.Group();
  group.name = 'nasa_satellite_kit';
  group.add(parts[0]); group.add(parts[1]); group.add(parts[2]);
  return { group, parts };
}
