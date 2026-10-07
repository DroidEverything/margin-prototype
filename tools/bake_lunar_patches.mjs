/* tools/bake_lunar_patches.mjs — surface + horizon bake v3 (offline, once).
   Range-fetches row-windows from PDS LOLA grids (raw files 115–1840 MB; pulls
   ~120 MB transient, never vendored), and emits ONE file://-safe classic
   script js/surface-data.js carrying per site:
     (a1) inner 3x3 km heights, per-site density (shackleton 400, malapert 300,
          tranq 200), true metres x1 (visual + rover sampler)
     (a2) outer 48x48 km context, 200x200, true metres x1 WITH lunar curvature
          drop (horizon skirt, same datum — zero fake geology at the seam)
     (a3) roughness drape 128x128 uint8 (measured LOLA roughness, polar sites;
          Tranquillitatis null: uniform + grain only — documented)
     (b)  hazard 80x80 slope/rock, SAME keys/shape as v1 so game.js is untouched
   Encoding: heights f32le base64; roughness/slope uint8;
   rock uint8; base64. v3 total ~3 MB (detail graded by source quality).
   Sources: LRO LOLA RDR (Goddard PDS Geosciences Node). */
import fs from "node:fs";

const TMP = "C:/Users/Asus/AppData/Local/Temp/opencode/";
const OUT = "C:/Users/Asus/Desktop/Nasa_Space_Apps_Challenge_Resources/MARGIN_NASA_Redesign/margin-nasa-redesign/js/surface-data.js";
const R_MOON = 1737400;
const D2R = Math.PI / 180;
const POLAR_BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/";
const CYL_BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/";

async function range(url, start, len, out) {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${start + len - 1}` } });
  if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status} ${url}`);
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(out, b);
  return b;
}
function parseI16(buf) {
  const n = Math.floor(buf.length / 2), a = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = buf.readInt16LE(i * 2) * 0.5;
  return a;
}
function polarPix(lat, lonE, scale, off) {
  const phi = lat * D2R, lam = lonE * D2R;
  const rho = 2 * R_MOON * Math.cos(phi) / (1 - Math.sin(phi));
  return [-rho * Math.cos(lam) / scale + off, rho * Math.sin(lam) / scale + off];
}
async function polarRows(file, W, scale, off, lat, lonE, halfKm, tag, stride) {
  stride = stride || 1;
  const [lc] = polarPix(lat, lonE, scale, off);
  const halfPx = Math.ceil((halfKm * 1000) / scale) + 4;
  const l0 = Math.max(0, Math.floor(lc) - halfPx), l1 = Math.ceil(lc) + halfPx;
  const rows = [];
  for (let l = l0; l <= l1; l += stride) rows.push(l);
  const rb = W * 2;
  const bufs = [];
  for (let b = 0; b < rows.length; b += 10) {
    const chunk = rows.slice(b, b + 10);
    const got = await Promise.all(chunk.map(l =>
      fetch(POLAR_BASE + file, { headers: { Range: `bytes=${l * rb}-${l * rb + rb - 1}` } })
        .then(r => { if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then(ab => ({ l, a: parseI16(Buffer.from(ab)) }))));
    bufs.push(...got);
    process.stdout.write(`\r${tag} rows ${Math.min(b + 10, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
  bufs.sort((x, y) => x.l - y.l);
  return { rows: bufs, W, l0, scale, off };
}
async function cylRows(file, W, H, lat, lonE, halfKm, tag, stride) {
  stride = stride || 1;
  const ppd = 1024;
  const lc = (15 - lat) * ppd - 0.5;
  const halfPx = Math.ceil((halfKm * 1000) / 29.6126469) + 4;
  const l0 = Math.max(0, Math.floor(lc) - halfPx), l1 = Math.min(H - 1, Math.ceil(lc) + halfPx);
  const rows = [];
  for (let l = l0; l <= l1; l += stride) rows.push(l);
  const rb = W * 2;
  const bufs = [];
  for (let b = 0; b < rows.length; b += 10) {
    const chunk = rows.slice(b, b + 10);
    const got = await Promise.all(chunk.map(l =>
      fetch(CYL_BASE + file, { headers: { Range: `bytes=${l * rb}-${l * rb + rb - 1}` } })
        .then(r => { if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then(ab => ({ l, a: parseI16(Buffer.from(ab)) }))));
    bufs.push(...got);
    process.stdout.write(`\r${tag} rows ${Math.min(b + 10, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
  bufs.sort((x, y) => x.l - y.l);
  return { rows: bufs, W, l0, scale: 29.6126469, cyl: { ppd } };
}
// sample a strided row-set at fractional (line, samp); rows carry absolute line numbers
function sampleRows(set, line, samp) {
  const rs = set.rows;
  if (!rs.length) return NaN;
  let lo = 0, hi = rs.length - 1;
  if (line <= rs[0].l) { const r = rs[0]; return rowSamp(r, set.W, line, samp); }
  if (line >= rs[hi].l) { const r = rs[hi]; return rowSamp(r, set.W, line, samp); }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rs[m].l <= line) lo = m; else hi = m; }
  const t = (line - rs[lo].l) / Math.max(1e-9, rs[hi].l - rs[lo].l);
  return rowSamp(rs[lo], set.W, line, samp) * (1 - t) + rowSamp(rs[hi], set.W, line, samp) * t;
}
function rowSamp(r, W, line, samp) {
  const c = Math.max(0, Math.min(W - 2, Math.floor(samp)));
  const f = Math.max(0, Math.min(1, samp - c));
  return r.a[c] * (1 - f) + r.a[c + 1] * f;
}
// ENU offsets (m) around site -> lat/lon
function enu2ll(lat0, lon0, east, north) {
  return [lat0 + north / 111320, lon0 + east / (111320 * Math.cos(lat0 * D2R))];
}
// resample an n×n grid over sizeM centred at site via projection fn
function resample(set, proj, lat0, lon0, sizeM, n) {
  const h = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const east = (i / (n - 1) - 0.5) * sizeM, north = (0.5 - j / (n - 1)) * sizeM;
    const [la, lo] = enu2ll(lat0, lon0, east, north);
    const [ln, sm] = proj(la, lo);
    h[j * n + i] = sampleRows(set, ln, sm);
  }
  return h;
}
const drop = (x, z) => -(x * x + z * z) / (2 * R_MOON); // lunar curvature, m
function slopeGrid(h, n, sizeM) {
  const post = sizeM / (n - 1), s = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const xm = h[j * n + Math.max(0, i - 1)], xp = h[j * n + Math.min(n - 1, i + 1)];
    const ym = h[Math.max(0, j - 1) * n + i], yp = h[Math.min(n - 1, j + 1) * n + i];
    s[j * n + i] = Math.atan(Math.hypot(xp - xm, yp - ym) / (2 * post)) / D2R;
  }
  return s;
}
const b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("base64");
function encF32(h) {
  const u = new Uint8Array(h.length * 4);
  const dv = new DataView(u.buffer);
  for (let i = 0; i < h.length; i++) dv.setFloat32(i * 4, h[i], true);
  return b64(u);
}
function encU8norm(a) {
  let mn = 1e18, mx = -1e18;
  for (const v of a) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const u = new Uint8Array(a.length), sp = Math.max(1e-9, mx - mn);
  for (let i = 0; i < a.length; i++) u[i] = Math.round((a[i] - mn) / sp * 255);
  return { min: mn, max: mx, b: b64(u) };
}
function encSlopeU8(s) {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = Math.max(0, Math.min(255, Math.round(s[i] * 2)));
  return b64(u);
}

const SITES = {
  shackleton: { lat: -89.55, lon: 205, file: "ldem_875s_5m.img", W: 30336, scale: 5, off: 15167.5, polar: true, nIn: 400, rough: { file: "ldrm_85s_40m.img", W: 7584, scale: 40, off: 3791.5, rscale: 0.001 } },
  malapert: { lat: -86.0, lon: 0, file: "ldem_85s_10m.img", W: 30336, scale: 10, off: 15167.5, polar: true, nIn: 300, rough: { file: "ldrm_85s_40m.img", W: 7584, scale: 40, off: 3791.5, rscale: 0.001 } },
  tranq: { lat: 0.65, lon: 23.47, file: "ldem_1024_00n_15n_000_030.img", W: 30720, H: 15360, cyl: true, nIn: 200, rough: null }
};
const SIZE_IN = 3000, N_OUT = 200, SIZE_OUT = 48000, N_RF = 128, N_HZ = 80;

async function bake() {
  const sites = {};
  for (const [id, st] of Object.entries(SITES)) {
    console.log("== " + id + " ==");
    const N_IN = st.nIn || 200; // per-site inner density (v3: 400/300/200)
    const proj = st.polar
      ? ((la, lo) => { const p = polarPix(la, ((lo % 360) + 360) % 360, st.scale, st.off); return p; })
      : ((la, lo) => [(15 - la) * 1024 - 0.5, lo * 1024 + 0.5]);
    // inner 200 (contiguous windows)
    let win;
    if (st.polar) win = await polarRows(st.file, st.W, st.scale, st.off, st.lat, st.lon, 1.8, id + "-in");
    else {
      const ppd = 1024, sc = st.lon * ppd + 0.5, lc = (15 - st.lat) * ppd - 0.5;
      const halfPx = Math.ceil(1800 / 29.6126469) + 4;
      const l0 = Math.max(0, Math.floor(lc) - halfPx), l1 = Math.min(15359, Math.ceil(lc) + halfPx);
      const rb = st.W * 2, bufs = [];
      for (let b = 0; b <= l1 - l0; b += 40) {
        const a = l0 + b, e = Math.min(l1, a + 39);
        const r = await fetch(CYL_BASE + st.file, { headers: { Range: `bytes=${a * rb}-${e * rb + rb - 1}` } });
        if (r.status !== 206 && r.status !== 200) throw new Error("HTTP " + r.status);
        const ab = Buffer.from(await r.arrayBuffer());
        for (let l = a; l <= e; l++) bufs.push({ l, a: parseI16(ab.slice((l - a) * rb, (l - a + 1) * rb)) });
        process.stdout.write(`\r${id}-in rows ${e - l0}/${l1 - l0}`);
      }
      process.stdout.write("\n");
      bufs.sort((x, y) => x.l - y.l);
      win = { rows: bufs, W: st.W, l0, scale: 29.6126469 };
    }
    const hin = resample(win, proj, st.lat, st.lon, SIZE_IN, N_IN);
    // outer 120 context (strided windows, 48 km)
    let wout;
    if (st.polar) {
      const stride = Math.max(1, Math.round((24000 / st.scale) * 2 / (N_OUT - 1) / 2));
      wout = await polarRows(st.file, st.W, st.scale, st.off, st.lat, st.lon, 25, id + "-out", stride);
    } else {
      const stride = 13;
      const ppd = 1024, lc = (15 - st.lat) * ppd - 0.5;
      const halfPx = Math.ceil(25000 / 29.6126469) + 4;
      const l0 = Math.max(0, Math.floor(lc) - halfPx), l1 = Math.min(15359, Math.ceil(lc) + halfPx);
      const rows = [];
      for (let l = l0; l <= l1; l += stride) rows.push(l);
      const rb = st.W * 2, bufs = [];
      for (let b = 0; b < rows.length; b += 10) {
        const got = await Promise.all(rows.slice(b, b + 10).map(l =>
          fetch(CYL_BASE + st.file, { headers: { Range: `bytes=${l * rb}-${l * rb + rb - 1}` } })
            .then(r => { if (r.status !== 206 && r.status !== 200) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
            .then(ab => ({ l, a: parseI16(Buffer.from(ab)) }))));
        bufs.push(...got);
        process.stdout.write(`\r${id}-out rows ${Math.min(b + 10, rows.length)}/${rows.length}`);
      }
      process.stdout.write("\n");
      bufs.sort((x, y) => x.l - y.l);
      wout = { rows: bufs, W: st.W, l0, scale: 29.6126469 };
    }
    const hout = resample(wout, proj, st.lat, st.lon, SIZE_OUT, N_OUT);
    // curvature drop on both (single source; stitch is exact at the seam)
    for (let j = 0; j < N_IN; j++) for (let i = 0; i < N_IN; i++) {
      const x = (i / (N_IN - 1) - 0.5) * SIZE_IN, z = (0.5 - j / (N_IN - 1)) * SIZE_IN;
      hin[j * N_IN + i] += drop(x, z);
    }
    for (let j = 0; j < N_OUT; j++) for (let i = 0; i < N_OUT; i++) {
      const x = (i / (N_OUT - 1) - 0.5) * SIZE_OUT, z = (0.5 - j / (N_OUT - 1)) * SIZE_OUT;
      hout[j * N_OUT + i] += drop(x, z);
    }
    // hazard 80 (v1 algorithm, unchanged keys for game.js)
    const hhz = resample(win, proj, st.lat, st.lon, SIZE_IN, N_HZ);
    const shz = slopeGrid(hhz, N_HZ, SIZE_IN);
    const rock = new Uint8Array(N_HZ * N_HZ), slope = new Float64Array(N_HZ * N_HZ);
    for (let k = 0; k < N_HZ * N_HZ; k++) {
      slope[k] = Math.round(shz[k] * 10) / 10;
      rock[k] = shz[k] > 15 ? 2 : (shz[k] > 8 ? 1 : 0);
    }
    // roughness drape (polar sites, measured LOLA roughness)
    let rough = null;
    if (st.rough) {
      const rw = await polarRows(st.rough.file, st.rough.W, st.rough.scale, st.rough.off,
        st.lat, st.lon, 1.8, id + "-rf");
      const rr = resample(rw, proj, st.lat, st.lon, SIZE_IN, N_RF);
      for (let k = 0; k < rr.length; k++) rr[k] *= st.rough.rscale;
      rough = encU8norm(rr);
    }
    let mn = 1e18, mx = -1e18, smx = 0;
    for (const v of hin) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const si = slopeGrid(hin, N_IN, SIZE_IN);
    for (const v of si) if (v > smx) smx = v;
    console.log(`${id}: inner relief ${(mx - mn).toFixed(0)} m, maxSlope ${smx.toFixed(1)}°`);
    sites[id] = {
      lat0: st.lat, lon0: st.lon, src: st.file,
      in: { n: N_IN, sizeM: SIZE_IN, datum: "height rel. 1737400 m sphere + curvature drop", exaggeration: 1.0, enc: "f32le", h: encF32(hin) },
      out: { n: N_OUT, sizeM: SIZE_OUT, enc: "f32le", h: encF32(hout) },
      rough: rough ? Object.assign({ n: N_RF }, rough) : null,
      n: N_HZ, sizeM: SIZE_IN,
      slope: Array.from(slope, v => v),
      rock: Array.from(rock, v => v)
    };
  }
  const out = { meta: { bake: "tools/bake_lunar_patches.mjs", date: "2026-09-26",
    grids: "LRO LOLA RDR (Goddard PDS Geosciences Node); heights int16x0.5 m; roughness int16x0.001 (polar). v3: per-site inner density (shackleton 400@5m src, malapert 300@10m src, tranq 200@~30m src), outer 200x200 context",
    note: "Bilinear resample only — no invented relief. Rock class from measured slope. Curvature drop on inner+outer (single source)." }, sites };
  const js = "/* js/surface-data.js — OFFLINE BAKE OUTPUT (tools/bake_lunar_patches.mjs).\n"
    + "   Real LRO LOLA relief: (a1) inner heights f32le (per-site density: 400/300/200),\n"
    + "   (a2) outer 200x200 horizon context with curvature drop, (a3) measured roughness\n"
    + "   drape (polar sites), (b) 80x80 hazard for game.js. File://-safe. */\n"
    + "window.SURFACE_PATCHES = " + JSON.stringify(out) + ";\n";
  fs.writeFileSync(OUT, js);
  console.log("wrote", OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + " KB");
}
bake().catch(e => { console.error("BAKE FAILED:", e.message); process.exit(1); });
