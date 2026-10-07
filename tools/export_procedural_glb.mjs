// Export MARGIN procedural craft parts (instrument glyphs + engine blocks) as a
// Blender-editable GLB parts palette. Pure Node, zero dependencies.
// Source of truth for dimensions: js/kit-assembly.js buildGlyph()/mountEngineRow().
// Kit shells themselves already ship as GLBs under models/nasa/.
// Usage: node tools/export_procedural_glb.mjs [outPath]
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'models', 'margin_procedural_kit.glb');

/* ---------- geometry generators (indexed, with normals, no UVs) ---------- */
function box() {
  const P = [], N = [], I = [];
  const faces = [
    { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  ];
  for (const f of faces) {
    const b = P.length / 3;
    for (const v of f.v) { P.push(...v); N.push(...f.n); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { P, N, I };
}
function cylinder(radial = 12) {
  const P = [], N = [], I = [];
  const ring = (y) => { const b = P.length / 3; for (let i = 0; i <= radial; i++) { const a = (i / radial) * Math.PI * 2; P.push(0.5 * Math.cos(a), y, 0.5 * Math.sin(a)); N.push(Math.cos(a), 0, Math.sin(a)); } return b; };
  const t = ring(0.5), b = ring(-0.5);
  for (let i = 0; i < radial; i++) I.push(t + i, b + i, b + i + 1, t + i, b + i + 1, t + i + 1);
  const cap = (y, ny) => { const c = P.length / 3; P.push(0, y, 0); N.push(0, ny, 0); const rb = P.length / 3; for (let i = 0; i <= radial; i++) { const a = (i / radial) * Math.PI * 2; P.push(0.5 * Math.cos(a), y, 0.5 * Math.sin(a)); N.push(0, ny, 0); } for (let i = 0; i < radial; i++) { if (ny > 0) I.push(c, rb + i, rb + i + 1); else I.push(c, rb + i + 1, rb + i); } };
  cap(0.5, 1); cap(-0.5, -1);
  return { P, N, I };
}
function cone(radial = 16) { // closed base cap (Blender-editable; visual delta negligible)
  const P = [], N = [], I = [];
  const slope = Math.atan2(0.5, 1), sn = Math.cos(slope), yn = Math.sin(slope);
  const apex = 0; P.push(0, 0.5, 0); N.push(0, 1, 0);
  const rb = P.length / 3;
  for (let i = 0; i <= radial; i++) { const a = (i / radial) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); P.push(0.5 * ca, -0.5, 0.5 * sa); N.push(ca * sn, yn, sa * sn); }
  for (let i = 0; i < radial; i++) I.push(apex, rb + i + 1, rb + i);
  const c = P.length / 3; P.push(0, -0.5, 0); N.push(0, -1, 0);
  const r2 = P.length / 3;
  for (let i = 0; i <= radial; i++) { const a = (i / radial) * Math.PI * 2; P.push(0.5 * Math.cos(a), -0.5, 0.5 * Math.sin(a)); N.push(0, -1, 0); }
  for (let i = 0; i < radial; i++) I.push(c, r2 + i + 1, r2 + i);
  return { P, N, I };
}
function sphere(w = 10, h = 8) {
  const P = [], N = [], I = [];
  for (let y = 0; y <= h; y++) {
    const v = y / h, phi = v * Math.PI;
    for (let x = 0; x <= w; x++) {
      const u = x / w, theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(theta);
      P.push(0.5 * nx, 0.5 * ny, 0.5 * nz); N.push(nx, ny, nz);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = y * (w + 1) + x, b2 = a + w + 1;
    I.push(a, b2, a + 1, b2, b2 + 1, a + 1);
  }
  return { P, N, I };
}
function eulerXYZ(rx, ry, rz) { // -> quaternion, three.js XYZ order
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2), cy = Math.cos(ry / 2), sy = Math.sin(ry / 2), cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}

/* ---------- scene description (mirrors kit-assembly.js exactly) ---------- */
const GEO = { box: box(), cyl: cylinder(), cone: cone(), tip: sphere() };
const MAT = {
  body: { c: [0x9a / 255, 0xa3 / 255, 0xad / 255, 1], m: 0.6, r: 0.45 },
  gold: { c: [0xc8 / 255, 0xa2 / 255, 0x4a / 255, 1], m: 0.5, r: 0.5 },
  lens: { c: [0x0a / 255, 0x0f / 255, 0x18 / 255, 1], m: 0.8, r: 0.2 },
  panel: { c: [0x1d / 255, 0x3a / 255, 0x6e / 255, 1], m: 0.4, r: 0.5 },
  gray: { c: [0x8b / 255, 0x93 / 255, 0x9e / 255, 1], m: 0.7, r: 0.4 },
  dark: { c: [0x22 / 255, 0x28 / 255, 0x2f / 255, 1], m: 0.6, r: 0.6 },
  ion: { c: [0x5e / 255, 0xb4 / 255, 0xff / 255, 1], m: 0.0, r: 0.4, e: [0x5e / 255, 0xb4 / 255, 1.0] },
};
const part = (geo, mat, s, p, rot) => ({ geo, mat, s, p, rot });
const GLYPHS = {
  'glyph_Imaging': [part('box', 'body', [0.6, 0.5, 0.6], [0, -0.25, 0]), part('cyl', 'body', [0.4, 0.5, 0.4], [0, -0.7, 0]), part('cyl', 'lens', [0.32, 0.06, 0.32], [0, -0.95, 0])],
  'glyph_Spectroscopy': [part('box', 'gold', [0.7, 0.5, 0.5], [0, -0.25, 0]), part('box', 'lens', [0.5, 0.08, 0.06], [0, -0.5, 0.24])],
  'glyph_Fields': [part('cyl', 'body', [0.08, 1.6, 0.08], [0, -0.8, 0]), part('tip', 'gold', [0.22, 0.22, 0.22], [0, -1.65, 0])],
  'glyph_Radar': [part('box', 'panel', [1.4, 0.06, 1.0], [0, -0.5, 0]), part('cyl', 'body', [0.07, 0.5, 0.07], [0, -0.25, 0])],
  'glyph_InSitu': [part('box', 'body', [0.5, 0.3, 0.5], [0, -0.15, 0]), part('box', 'gold', [0.16, 0.9, 0.16], [0.1, -0.7, 0], [0, 0, -0.25]), part('box', 'body', [0.35, 0.12, 0.3], [0.32, -1.1, 0])],
  'glyph_RadioSci': [part('cyl', 'body', [0.09, 0.7, 0.09], [0, -0.35, 0]), part('cyl', 'gold', [0.06, 0.6, 0.06], [0, -0.6, 0], [0, 0, Math.PI / 2]), part('tip', 'body', [0.16, 0.16, 0.16], [0, -0.72, 0])],
  'glyph_Default': [part('box', 'body', [0.55, 0.45, 0.55], [0, -0.22, 0])],
  'engine_Chem_u1': [part('cyl', 'dark', [0.35, 0.3, 0.35], [0, -0.15, 0]), part('cone', 'gray', [0.7, 0.6, 0.7], [0, -0.6, 0])],
  'engine_Ion_u1': [0, 1, 2].map(i => { const a = (i / 3) * Math.PI * 2; return part('cyl', 'ion', [0.22, 0.35, 0.22], [Math.cos(a) * 0.35, -0.17, Math.sin(a) * 0.35]); }),
};

/* ---------- glTF assembly ---------- */
const bin = [];
const bufferViews = [], accessors = [], meshes = [], nodes = [], materials = [];
const matIndex = {};
for (const [name, m] of Object.entries(MAT)) {
  matIndex[name] = materials.length;
  const mat = { name: 'MARGIN_' + name, pbrMetallicRoughness: { baseColorFactor: m.c, metallicFactor: m.m, roughnessFactor: m.r } };
  if (m.e) mat.emissiveFactor = m.e;
  materials.push(mat);
}
function pushData(arr, componentType) {
  const bytes = arr instanceof Uint16Array ? new Uint8Array(arr.buffer) : new Uint8Array(new Float32Array(arr).buffer);
  const off = bin.length;
  for (const b of bytes) bin.push(b);
  while (bin.length % 4) bin.push(0);
  const bv = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.length });
  return bv;
}
function minmax(P) {
  const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
  return [mn, mx];
}
const primCache = {};
function primitive(geoName, matName) {
  const key = geoName + '|' + matName;
  if (primCache[key] !== undefined) return primCache[key];
  const g = GEO[geoName];
  const posBV = pushData(g.P, 5126), nrmBV = pushData(g.N, 5126), idxBV = pushData(new Uint16Array(g.I), 5123);
  const [mn, mx] = minmax(g.P);
  const mk = (bv, type, count, comp, mn2, mx2) => { accessors.push({ bufferView: bv, componentType: comp, count, type, ...(mn2 ? { min: mn2, max: mx2 } : {}) }); return accessors.length - 1; };
  const prim = { attributes: { POSITION: mk(posBV, 'VEC3', g.P.length / 3, 5126, mn, mx), NORMAL: mk(nrmBV, 'VEC3', g.N.length / 3, 5126) }, indices: mk(idxBV, 'SCALAR', g.I.length, 5123), material: matIndex[matName] };
  const mi = meshes.length;
  meshes.push({ name: geoName + '_' + matName, primitives: [prim] });
  primCache[key] = { mesh: mi };
  return primCache[key];
}
const palette = { name: 'MARGIN_procedural_palette', children: [] };
nodes.push(palette);
let gx = 0;
for (const [gname, parts] of Object.entries(GLYPHS)) {
  const gi = nodes.length;
  nodes.push({ name: gname, translation: [gx, 2, 0], children: [] });
  palette.children.push(gi);
  gx += 3;
  for (const p of parts) {
    const { mesh } = primitive(p.geo, p.mat);
    const ni = nodes.length;
    const node = { name: gname + '_' + p.geo, mesh, scale: p.s, translation: p.p };
    if (p.rot) node.rotation = eulerXYZ(...p.rot);
    nodes.push(node);
    nodes[gi].children.push(ni);
  }
}
const json = { asset: { version: '2.0', generator: 'MARGIN export_procedural_glb (dims from js/kit-assembly.js)' }, scene: 0, scenes: [{ name: 'palette', nodes: [0] }], nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength: bin.length }] };
const jsonBytes = Buffer.from(JSON.stringify(json));
const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length;
const out = Buffer.alloc(total);
let o = 0;
out.writeUInt32LE(0x46546C67, o); o += 4; out.writeUInt32LE(2, o); o += 4; out.writeUInt32LE(total, o); o += 4;
out.writeUInt32LE(jsonBytes.length + jsonPad, o); o += 4; out.writeUInt32LE(0x4E4F534A, o); o += 4;
jsonBytes.copy(out, o); o += jsonBytes.length; for (let i = 0; i < jsonPad; i++) out[o++] = 0x20;
out.writeUInt32LE(bin.length, o); o += 4; out.writeUInt32LE(0x004E4942, o); o += 4;
Buffer.from(bin).copy(out, o);
writeFileSync(OUT, out);
console.log('wrote ' + OUT + ' (' + out.length + ' bytes, ' + meshes.length + ' meshes, ' + (nodes.length - 1) + ' part nodes)');
