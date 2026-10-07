/* tools/make_detail_texture.mjs — bake the micro regolith velvet normal map
   OFFLINE (once). Part-5: pure procedural tileable gradient-Perlin fBM +
   softened 0.1–3 m dimples. The LROC NAC photograph is DELIBERATELY no
   longer differentiated (sensor noise + baked sun shadows read as crunchy
   gravel at 5× Sobel). Output: assets/textures/lroc_nac_tile.png (512² RGB
   tangent-space normals, 20 m tiles at repeat 150). Meso relief (6–35 m
   craters) lives in the runtime patch-wide map instead — see surface-view
   buildMesoMaps. Dependency-free: zlib + PNG-encode only. */
import fs from "node:fs";
import zlib from "node:zlib";

const OUT = "assets/textures/lroc_nac_tile.png";
const SIZE = 512; // tile spans 20 m at repeat 150 over the 3 km patch

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.from(type, "ascii");
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([td, data])));
  return Buffer.concat([len, td, data, cr]);
}
function encodeRGBPNG(w, h, px) {
  const stride = w * 3 + 1, raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { raw[y * stride] = 0; px.copy(raw, y * stride + 1, y * w * 3, (y + 1) * w * 3); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* Tileable gradient Perlin (lattice wraps at the period; every octave period
   divides SIZE, so the tile is seamless by construction — no edge blend). */
function makeNoise2D() {
  const hash = (ix, iy) => {
    let h = (ix * 374761393 + iy * 668265263) | 0;
    h = (h ^ (h >> 13)) | 0; h = (h * 1274126177) | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return x - y; case 2: return -x + y;
      case 3: return -x - y; case 4: return x; case 5: return -x;
      case 6: return y; default: return -y;
    }
  };
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y, P) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const w = (a) => ((a % P) + P) % P;
    const x0 = w(xi), x1 = w(xi + 1), y0 = w(yi), y1 = w(yi + 1);
    const g00 = grad((hash(x0, y0) * 8) | 0, xf, yf);
    const g10 = grad((hash(x1, y0) * 8) | 0, xf - 1, yf);
    const g01 = grad((hash(x0, y1) * 8) | 0, xf, yf - 1);
    const g11 = grad((hash(x1, y1) * 8) | 0, xf - 1, yf - 1);
    const u = fade(xf), v = fade(yf);
    return (g00 * (1 - u) + g10 * u) * (1 - v) + (g01 * (1 - u) + g11 * u) * v;
  };
}

const NORMAL_STRENGTH = 18.0; // tune to mean-B ≈242 (see stats below)
const NORMAL_Y_SIGN = 1;
{
  const W = SIZE, nz = makeNoise2D();
  const H = new Float64Array(W * W);
  const OCT = [8, 16, 32, 64, 128];
  let ampSum = 0;
  for (let o = 0; o < OCT.length; o++) ampSum += Math.pow(0.5, o);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    let v = 0;
    for (let o = 0; o < OCT.length; o++) {
      const P = OCT[o];
      v += Math.pow(0.5, o) * nz((i / W) * P, (j / W) * P, P);
    }
    H[j * W + i] = (v / ampSum) * 30;
  }
  /* Softened dimples (0.1–3 m) + sharp rimmed pits (high kurtosis, so mip
     levels 2–4 keep rim edges instead of averaging to flat grey). Wrapping. */
  const PX_M = W / 20;
  let dseed = 0xD19BE5;
  const drnd = () => (dseed = (dseed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const dent = (Dm, rimmed) => {
    const R = (Dm / 2) * PX_M, depth = 6 * Dm;
    const cx = drnd() * W, cy = drnd() * W, ext = Math.ceil(R * 1.4);
    const ix = Math.round(cx), iy = Math.round(cy);
    for (let j = -ext; j <= ext; j++) for (let i = -ext; i <= ext; i++) {
      const ddx = i - (cx - ix), ddy = j - (cy - iy);
      const r = Math.hypot(ddx, ddy);
      if (r >= R * 1.4 || R < 1) continue;
      const k = ((((iy + j) % W) + W) % W) * W + ((((ix + i) % W) + W) % W);
      if (r < R) H[k] -= depth * (Math.cos(Math.PI * r / R) * 0.5 + 0.5);
      else if (rimmed) {
        const t = (r - R) / (0.4 * R); // narrow raised lip: kurtosis source
        H[k] += depth * 0.5 * Math.exp(-t * t * 3);
      }
    }
  };
  for (let c = 0; c < 45; c++) dent(0.1 + (3 - 0.1) * Math.pow(drnd(), 1.8), false);
  for (let c = 0; c < 60; c++) dent(0.15 + (1.2 - 0.15) * Math.pow(drnd(), 1.5), true);
  let gseed = 0xBEEF;
  for (let i = 0; i < W * W; i++) {
    gseed = (gseed * 1664525 + 1013904223) >>> 0;
    H[i] += ((gseed % 100) / 100 - 0.5) * 3;
  }
  // σ-normalize so the Sobel stage sees full-range slopes (target mean-B).
  {
    let mean = 0;
    for (let i = 0; i < W * W; i++) mean += H[i];
    mean /= W * W;
    let sd = 0;
    for (let i = 0; i < W * W; i++) sd += (H[i] - mean) * (H[i] - mean);
    sd = Math.sqrt(sd / (W * W)) || 1;
    const k = 50 / sd;
    for (let i = 0; i < W * W; i++) H[i] = (H[i] - mean) * k;
  }
  const at = (x, y) => H[(((y % W) + W) % W) * W + (((x % W) + W) % W)];
  const out = Buffer.alloc(W * W * 3);
  let sumB = 0, sumTilt = 0;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
      - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
      - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
    let nx = -gx / 255 * NORMAL_STRENGTH, ny = -gy / 255 * NORMAL_STRENGTH * NORMAL_Y_SIGN, nz2 = 1;
    const il = 1 / Math.hypot(nx, ny, nz2);
    nx *= il; ny *= il; nz2 *= il;
    sumTilt += Math.acos(Math.max(-1, Math.min(1, nz2)));
    const B = Math.max(0, Math.min(255, Math.round((nz2 * 0.5 + 0.5) * 255)));
    sumB += B;
    out[(y * W + x) * 3] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
    out[(y * W + x) * 3 + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
    out[(y * W + x) * 3 + 2] = B;
  }
  fs.writeFileSync(OUT, encodeRGBPNG(W, W, out));
  console.log("wrote", OUT, fs.statSync(OUT).size + " bytes",
    "meanB", (sumB / (W * W)).toFixed(1),
    "meanTilt", (sumTilt / (W * W) * 180 / Math.PI).toFixed(1) + "deg");
}
