"use strict";
/* ══════════════════════════════════════════════════════════════════════
   MARGIN astronomy core — the SINGLE source of astronomical truth.

   Classic script, zero dependencies, file:// safe. Loads after
   js/astronomy-jpl-data.js (generated, defines JPL_EPHEM) and before
   game.js. ESM viewers (js/orrery.js, select/brief-view.js) consume it
   through the window.Astronomy global — the same pattern they already use
   for BODY/bodyState.

   STATE CONTRACT (every authoritative vector carries this implicitly):
     frame  = ECLIPTIC_J2000  (JPL Horizons native output frame; X-Y = J2000
              mean ecliptic, X axis = ICRF X. NOT mixed with ICRF equatorial.)
     origin = SSB              (Solar-System Barycenter. The Sun moves; it is
              never forced to (0,0,0) in this layer.)
     time   = TDB              (ephemeris evaluator receives JD TDB)
     dist   = km   (double)    vel = km/s (double)

   PROVIDER HIERARCHY:
     PRIMARY  JPLProvider  — Chebyshev evaluation of JPL Horizons vectors
              (DE441 planetary solution + JPL satellite theories, vendored in
              JPL_EPHEM by tools/build_jpl_ephemeris.py). Label: "JPL_DE441".
     FALLBACK KeplerFallbackProvider — JPL Table-1 approximate elements /
              SBDB elements / mean moon circles. Label: "FALLBACK_KEPLER".
              Never described as JPL. Never used silently: every state carries
              its provider label, and out-of-coverage JPL requests fall back
              explicitly (provider field tells you).

   RENDERERS MUST: read states via AstronomyStateCache once per tick, apply
   floating-origin + presentation transforms AFTER, never write back.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {

var AU_KM = (root.MARGIN_CONST && root.MARGIN_CONST.AU_KM) || 149597870.700;
var DAY_S = (root.MARGIN_CONST && root.MARGIN_CONST.DAY_S) || 86400;
var J2000_JD = (root.MARGIN_CONST && root.MARGIN_CONST.J2000_JD) || 2451545.0; // JD(TDB) 2000-01-01 12:00 TDB

/* ── Time: owned by TimeService (js/time-service.js, spec §11) ─────────
   This core delegates; the math moved verbatim. Load order (index.html +
   QA harnesses) guarantees TimeService first; fail loudly otherwise. */
var TS = root.TimeService || null;
if (!TS) throw new Error("MARGIN astronomy.js requires js/time-service.js (TimeService) to load first");
function taiMinusUtc(jdUtc) { return TS.taiMinusUtc(jdUtc); }
function utcMsToJdTdb(ms) { return TS.utcMsToJdTdb(ms); }
function tdbDays(ms) { return TS.tdbDays(ms); } // days after J2000.0 TDB — the simulation-clock unit
function jdTdbToDate(jd) { return TS.jdTdbToDate(jd); } // diagnostics only

/* ── Chebyshev evaluation (Clenshaw, double) ───────────────────────── */
function chebPos(c, tau) {
  var b2 = 0, b1 = 0, b0;
  for (var i = c.length - 1; i >= 1; i--) {
    b0 = 2 * tau * b1 - b2 + c[i];
    b2 = b1; b1 = b0;
  }
  return tau * b1 - b2 + c[0];
}
/* Derivative of a Chebyshev series via dT_k/dx = k·U_{k-1} with
   U_{m} = 2·T_m + 2·T_{m-2} + … (+T_0 or 2·T_1 tail). O(n²), n ≤ 12. */
function chebDeriv(c) {
  var n = c.length - 1;
  var d = new Array(Math.max(1, n)).fill(0);
  for (var k = 1; k <= n; k++) {
    if (c[k] === 0) continue;
    for (var j = k - 1; j >= 0; j -= 2) {
      d[j] += k * c[k] * (j === 0 ? 1 : 2);
    }
  }
  return d;
}
function evalVel(c, tau, dTauPerSec) {
  if (c.length < 2) return 0;
  return chebPos(chebDeriv(c), tau) * dTauPerSec;
}

/* ── Ephemeris pack selection (spec §5.1) ─────────────────────────────
   DE440 = mission-era default; DE441 = extended-range fallback.
   ?eph=de441 forces the DE441 pack. Missing DE440 pack fails over to DE441
   (provider label always tells which is live — never silent). */
(function selectPack() {
  var want441 = false;
  try {
    if (typeof location !== "undefined" && location.search) {
      want441 = /(?:\?|&)eph=de441(?:&|$)/.test(location.search);
    }
  } catch (e) {}
  if (!want441 && root.JPL_EPHEM_DE440) {
    if (!root.JPL_EPHEM_DE441) root.JPL_EPHEM_DE441 = root.JPL_EPHEM; // retain DE441 pack for non-rebuilt bodies
    // The legacy DE441 pack predates per-pack labels — backfill, never guess.
    if (root.JPL_EPHEM_DE441 && !root.JPL_EPHEM_DE441.provider) root.JPL_EPHEM_DE441.provider = "JPL_DE441";
    root.JPL_EPHEM = root.JPL_EPHEM_DE440;
  }
})();
/* ── JPL provider (primary) ───────────────────────────────────────────
   Provider label comes from the loaded data pack (DE440 default, DE441
   fallback) — never hardcoded, so states are never mislabeled. */
var JPL_LABEL = (root.JPL_EPHEM && root.JPL_EPHEM.provider) || "JPL_DE441";
function jplBodyRec(key) {
  var D = root.JPL_EPHEM;
  if (!D || !D.bodies || !D.bodies[key]) return null;
  return D.bodies[key];
}
function jplEval(rec, jd) { // -> {pos, vel} or null (never extrapolates)
  if (!rec || !isFinite(jd)) return null; // non-finite epoch: never evaluate
  if (jd < rec.t0 - 1e-9 || jd > rec.t1 + 1e-9) return null;
  var g = Math.floor((jd - rec.t0) / rec.granule);
  var ng = rec.coeff.x.length;
  if (g < 0) g = 0;
  if (g >= ng) g = ng - 1;
  var a = rec.t0 + g * rec.granule, b = a + rec.granule;
  var tau = 2 * (jd - a) / (b - a) - 1;
  if (tau < -1) tau = -1;
  if (tau > 1) tau = 1;
  var dTauPerSec = 2 / ((b - a) * DAY_S);
  var pos = [chebPos(rec.coeff.x[g], tau), chebPos(rec.coeff.y[g], tau), chebPos(rec.coeff.z[g], tau)];
  var vel = [evalVel(rec.coeff.x[g], tau, dTauPerSec), evalVel(rec.coeff.y[g], tau, dTauPerSec), evalVel(rec.coeff.z[g], tau, dTauPerSec)];
  return { pos: pos, vel: vel };
}

/* ── Kepler fallback provider (explicit, never "JPL") ─────────────────
   JPL Table-1 approximate elements (valid ~1800–2050 AD per JPL) + SBDB
   Bennu + circular mean-orbit moons. Full 3D (I, node) solution. */
var FALLBACK_LABEL = "FALLBACK_KEPLER";
var DEG = Math.PI / 180;
var KEPLER_ELEMENTS = { // a AU, e, I deg, L deg, peri deg, node deg (JPL approx_pos)
  mercury: { a: 0.38709927, e: 0.20563593, I: 7.00497902, L: 252.25032350, peri: 77.45779628, node: 48.33076593 },
  venus:   { a: 0.72333566, e: 0.00677672, I: 3.39467605, L: 181.97909950, peri: 131.60246718, node: 76.67984255 },
  emb:     { a: 1.00000261, e: 0.01671123, I: -0.00001531, L: 100.46457166, peri: 102.93768193, node: 0.0 },
  mars:    { a: 1.52371034, e: 0.09339410, I: 1.84969142, L: -4.55343205, peri: -23.94362959, node: 49.55953891 },
  jupiter: { a: 5.20288700, e: 0.04838624, I: 1.30439695, L: 34.39644051, peri: 14.72847983, node: 100.47390909 },
  saturn:  { a: 9.53667594, e: 0.05386179, I: 2.48599187, L: 49.95424423, peri: 92.59887831, node: 113.66242448 },
  uranus:  { a: 19.18916464, e: 0.04725744, I: 0.77263783, L: 313.23810451, peri: 170.95427630, node: 74.01692503 },
  neptune: { a: 30.06992276, e: 0.00859048, I: 1.77004347, L: -55.12002969, peri: 44.96476227, node: 131.78422574 },
  pluto:   { a: 39.48211675, e: 0.24882730, I: 17.14001206, L: 238.92903833, peri: 224.06891629, node: 110.30393684 },
  bennu:   { a: 1.12639, e: 0.20375, M0: 28.84, peri: 66.22, I: 6.03, node: 2.06, sbdb: true }
  // ^ Bennu fallback only (out-of-coverage cover): primary is the JPL_SBDB
  // Chebyshev pack (tools/build_bennu.py, ORX_merged_DE424). M0@J2000 = 28.84
  // derived from SBDB tp=2455439.142 (see QA/bennu_sbdb_solution.json,
  // orbit_id 118, condition_code 0 — do NOT re-derive from the rounded
  // display elements there). Values unchanged; provenance attached.
};
var GM_SUN = (root.MARGIN_CONST && root.MARGIN_CONST.GM_SUN_KM3_S2) || 132712440041.27942;
function keplerState(el, simDays) {
  var M0 = (el.M0 !== undefined) ? el.M0 : ((el.L - el.peri) % 360 + 360) % 360;
  var n = 360 / (Math.pow(el.a, 1.5) * 365.25);
  var M = (((M0 + n * simDays) % 360 + 360) % 360) * DEG;
  var E = M;
  for (var i = 0; i < 40; i++) E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  var nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
  var r = el.a * AU_KM * (1 - el.e * Math.cos(E));
  var argp = ((el.peri || 0) - (el.node || 0)) * DEG, Om = (el.node || 0) * DEG, Inc = (el.I || 0) * DEG;
  var u = nu + argp;
  var x = r * (Math.cos(Om) * Math.cos(u) - Math.sin(Om) * Math.sin(u) * Math.cos(Inc));
  var y = r * (Math.sin(Om) * Math.cos(u) + Math.cos(Om) * Math.sin(u) * Math.cos(Inc));
  var z = r * Math.sin(u) * Math.sin(Inc);
  var p = el.a * AU_KM * (1 - el.e * el.e), h = Math.sqrt(GM_SUN * p);
  var vr = GM_SUN / h * el.e * Math.sin(nu), vt = h / r;
  // perifocal velocity rotated by argp/node/inclination (ecliptic J2000 approx)
  var cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(Inc), sI = Math.sin(Inc);
  var cu = Math.cos(u), su = Math.sin(u);
  var vx = vr * (cO * cu - sO * su * cI) - vt * (cO * su + sO * cu * cI);
  var vy = vr * (sO * cu + cO * su * cI) - vt * (sO * su - cO * cu * cI);
  var vz = vr * su * sI + vt * cu * sI;
  return { pos: [x, y, z], vel: [vx, vy, vz] };
}
var MOON_FALLBACK = { // circular mean orbits (period d, radius km, phase at J2000)
  moon:    { parent: "earth", period: 27.321661, sma: 384400, phase: 5.26 / 27.321661 },
  io:      { parent: "jupiter", period: 1.769138, sma: 421800, phase: 0.3 },
  europa:  { parent: "jupiter", period: 3.551181, sma: 671100, phase: 0.3 },
  ganymede:{ parent: "jupiter", period: 7.154553, sma: 1070400, phase: 0.3 },
  callisto:{ parent: "jupiter", period: 16.689018, sma: 1882700, phase: 0.3 },
  titan:   { parent: "saturn", period: 15.945, sma: 1221900, phase: 0.3 },
  triton:  { parent: "neptune", period: -5.876854, sma: 354800, phase: 0.3 },
  charon:  { parent: "pluto", period: 6.3872, sma: 19600, phase: 0.3 }
};

/* ── Query status (Phase 2.1, spec §32) ─────────────────────────────────
   OK              authoritative JPL state
   DEGRADED        explicit fallback state (never silent: provider says so)
   OUT_OF_COVERAGE finite epoch outside the JPL coverage for this body
   UNAVAILABLE     no state obtainable (unknown body, missing data)
   INVALID         non-finite epoch — fail closed, never evaluate */
var STATUS = { OK: "OK", DEGRADED: "DEGRADED", OUT_OF_COVERAGE: "OUT_OF_COVERAGE", UNAVAILABLE: "UNAVAILABLE", INVALID: "INVALID" };
var SEVERITY = { OK: 0, DEGRADED: 1, OUT_OF_COVERAGE: 2, UNAVAILABLE: 3, INVALID: 4 };
function worstStatus(a, b) { return SEVERITY[a] >= SEVERITY[b] ? a : b; }
function hasJplRec(key) {
  return !!(packFor(key));
}
function coversIn(P, need, jd) {
  for (var i = 0; i < need.length; i++) {
    var r2 = P.bodies[need[i]];
    if (!r2 || jd < r2.t0 - 1e-9 || jd > r2.t1 + 1e-9) return false;
  }
  return true;
}
function jplCovers(key, jd) { // every rec jplAbsolute would need is covered in SOME pack
  if (!isFinite(jd)) return false;
  var need = [];
  if (key === "earth" || key === "moon") need = ["emb", "moon"];
  else if (key === "pluto" || key === "charon") need = ["plutobary", "charon"];
  else {
    var first = packFor(key);
    if (!first || !first.bodies[key]) return false;
    var k = key, guard = 0;
    while (k && guard++ < 8) {
      var Pk = packFor(k);
      if (!Pk || !Pk.bodies[k]) return false;
      need.push(k);
      var rk = Pk.bodies[k];
      k = (rk.kind === "ssb") ? null : rk.parent;
    }
  }
  var packs = [root.JPL_EPHEM, root.JPL_EPHEM_DE441, root.JPL_EPHEM_BENNU];
  for (var i = 0; i < need.length; i++) {
    var hit = false;
    for (var pi = 0; pi < packs.length; pi++) {
      var Pp = packs[pi];
      var r2 = Pp && Pp.bodies && Pp.bodies[need[i]];
      if (r2 && jd >= r2.t0 - 1e-9 && jd <= r2.t1 + 1e-9) { hit = true; break; }
    }
    if (!hit) return false;
  }
  return true;
}
var PARENT = { moon: "earth", io: "jupiter", europa: "jupiter", ganymede: "jupiter", callisto: "jupiter", titan: "saturn", triton: "neptune", charon: "pluto" };
/* Vendored moon records are PARENT-BODY-RELATIVE (Moon 500@399, Charon 500@999,
   Io…Callisto 500@599, Titan 500@699, Triton 500@899), so each satellite state is
   parentAbsolute + relative. Earth is EMB − Q_E·moon(geo) and Pluto is
   Pluto-bary − Q_P·charon(geo); QA/jpl_reference_checks.mjs validates both
   compositions against direct JPL body-centre vectors. */
var SSB_KEYS = ["sun", "mercury", "venus", "emb", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "plutobary", "pluto", "moon", "io", "europa", "ganymede", "callisto", "titan", "triton", "charon", "bennu"];

function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }

/* Per-body pack resolution: the selected default pack first, retained packs
   after (DE441 outer planets + satellites; SBDB Bennu). Every JPL state
   therefore carries the label of the pack that actually served it. */
function packFor(key) {
  var D = root.JPL_EPHEM;
  if (D && D.bodies && D.bodies[key]) return D;
  var R = root.JPL_EPHEM_DE441;
  if (R && R !== D && R.bodies && R.bodies[key]) return R;
  var B = root.JPL_EPHEM_BENNU;
  if (B && B !== D && B !== R && B.bodies && B.bodies[key]) return B;
  return null;
}
function jplBodyRec(key) {
  var P = packFor(key);
  return P ? P.bodies[key] : null;
}
function provJoin(list) { // unique provider labels, stable order
  var seen = {}, out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && !seen[list[i]]) { seen[list[i]] = 1; out.push(list[i]); }
  }
  return out.join("+");
}

function jplAbsolute(key, jd) {
  var st, m, c, P, Q;
  function Qof(Pk) {
    var mp = Pk && Pk.massPartition;
    return { qE: mp ? mp.earthMoonQ : 0.0121505844, qP: mp ? mp.plutoCharonQ : 0.108766 };
  }
  switch (key) {
    case "earth": {
      var Pe = packFor("emb"), Pm = packFor("moon");
      if (!Pe || !Pm) return null;
      var q = Qof(Pe);
      st = jplEval(Pe.bodies.emb, jd); m = jplEval(Pm.bodies.moon, jd);
      if (!st || !m) return null;
      return { pos: sub3(st.pos, scale3(m.pos, q.qE)), vel: sub3(st.vel, scale3(m.vel, q.qE)), provider: provJoin([Pe.provider, Pm.provider]) };
    }
    case "moon": {
      var E = jplAbsolute("earth", jd); P = packFor("moon");
      if (!E || !P) return null;
      m = jplEval(P.bodies.moon, jd);
      if (!m) return null;
      return { pos: add3(E.pos, m.pos), vel: add3(E.vel, m.vel), provider: provJoin([E.provider, P.provider]) };
    }
    case "pluto": {
      var Pb = packFor("plutobary"), Pc = packFor("charon");
      if (!Pb || !Pc) return null;
      var qp = Qof(Pb);
      st = jplEval(Pb.bodies.plutobary, jd); c = jplEval(Pc.bodies.charon, jd);
      if (!st || !c) return null;
      return { pos: sub3(st.pos, scale3(c.pos, qp.qP)), vel: sub3(st.vel, scale3(c.vel, qp.qP)), provider: provJoin([Pb.provider, Pc.provider]) };
    }
    case "charon": {
      var PB = jplAbsolute("pluto", jd); Q = packFor("charon");
      if (!PB || !Q) return null;
      c = jplEval(Q.bodies.charon, jd);
      if (!c) return null;
      return { pos: add3(PB.pos, c.pos), vel: add3(PB.vel, c.vel), provider: provJoin([PB.provider, Q.provider]) };
    }
    default: {
      P = packFor(key);
      if (!P) return null;
      var rec = P.bodies[key];
      if (!rec) return null;
      if (rec.kind === "ssb") {
        var s = jplEval(rec, jd);
        if (!s) return null;
        return { pos: s.pos, vel: s.vel, provider: P.provider || JPL_LABEL };
      }
      // parent-relative minor moon: absolute = parent SSB + relative
      var rel = jplEval(rec, jd);
      if (!rel) return null;
      var par = jplAbsolute(rec.parent, jd);
      if (!par) return null;
      return { pos: add3(par.pos, rel.pos), vel: add3(par.vel, rel.vel), provider: provJoin([par.provider, P.provider]) };
    }
  }
}
function fallbackAbsolute(key, jd) {
  var simDays = jd - J2000_JD;
  var map = { earth: "emb", plutobary: "pluto" };
  if (KEPLER_ELEMENTS[map[key] || key]) {
    var s = keplerState(KEPLER_ELEMENTS[map[key] || key], simDays);
    if (key === "earth" || key === "pluto") return s; // EMB≈Earth, bary≈Pluto at fallback fidelity
    return s;
  }
  if (key === "sun") return { pos: [0, 0, 0], vel: [0, 0, 0] }; // fallback: SSB≈Sun (documented)
  if (MOON_FALLBACK[key]) {
    var f = MOON_FALLBACK[key];
    var par = fallbackAbsolute(f.parent, jd);
    var a = 2 * Math.PI * (((simDays / f.period + f.phase) % 1 + 1) % 1);
    return { pos: add3(par.pos, [Math.cos(a) * f.sma, 0, Math.sin(a) * f.sma]), vel: par.vel.slice() };
  }
  return null;
}

function getState(key, jd) {
  // A non-finite epoch (e.g. pre-1972 UTC, where utcMsToJdTdb returns ok:false
  // and callers pass undefined) must fail closed, never reach the evaluator:
  // without this guard the Chebyshev index becomes NaN and the module throws.
  if (!isFinite(jd)) return { key: key, jd: jd, frame: "ECLIPTIC_J2000", origin: "SSB", pos: [NaN, NaN, NaN], vel: [NaN, NaN, NaN], provider: "NONE", ok: false, status: STATUS.INVALID };
  var s = jplAbsolute(key, jd);
  if (s) return { key: key, jd: jd, frame: "ECLIPTIC_J2000", origin: "SSB", pos: s.pos, vel: s.vel, provider: s.provider || JPL_LABEL, ok: true, status: STATUS.OK };
  s = fallbackAbsolute(key, jd);
  if (s) return { key: key, jd: jd, frame: "ECLIPTIC_J2000", origin: "SSB", pos: s.pos, vel: s.vel, provider: FALLBACK_LABEL, ok: true, status: STATUS.DEGRADED };
  return { key: key, jd: jd, frame: "ECLIPTIC_J2000", origin: "SSB", pos: [NaN, NaN, NaN], vel: [NaN, NaN, NaN], provider: "NONE", ok: false, status: !hasJplRec(key) ? STATUS.UNAVAILABLE : (jplCovers(key, jd) ? STATUS.UNAVAILABLE : STATUS.OUT_OF_COVERAGE) };
}
function getHeliocentricState(key, jd) {
  var b = getState(key, jd), s = getState("sun", jd);
  if (!b.ok || !s.ok) return { key: key, jd: jd, frame: "ECLIPTIC_J2000", origin: "SUN", pos: [NaN, NaN, NaN], vel: [NaN, NaN, NaN], provider: b.provider, ok: false, status: worstStatus(b.status, s.status) };
  var mixed = (b.provider !== s.provider);
  return { key: key, jd: jd, frame: "ECLIPTIC_J2000", origin: "SUN", pos: sub3(b.pos, s.pos), vel: sub3(b.vel, s.vel), provider: mixed ? (b.provider + "+" + s.provider) : b.provider, ok: true, status: worstStatus(b.status, s.status) };
}
function getRelativeState(child, parent, jd) {
  var c = getState(child, jd), p = getState(parent, jd);
  if (!c.ok || !p.ok) return { key: child, jd: jd, frame: "ECLIPTIC_J2000", origin: parent.toUpperCase(), pos: [NaN, NaN, NaN], vel: [NaN, NaN, NaN], provider: c.provider, ok: false, status: worstStatus(c.status, p.status) };
  var mixed = (c.provider !== p.provider);
  return { key: child, jd: jd, frame: "ECLIPTIC_J2000", origin: parent.toUpperCase(), pos: sub3(c.pos, p.pos), vel: sub3(c.vel, p.vel), provider: mixed ? (c.provider + "+" + p.provider) : c.provider, ok: true, status: worstStatus(c.status, p.status) };
}
function sampleTrajectory(key, jd0, jd1, n, origin) {
  var out = new Float64Array(n * 6);
  for (var i = 0; i < n; i++) {
    var jd = jd0 + (jd1 - jd0) * i / (n - 1);
    var s = (origin === "SUN") ? getHeliocentricState(key, jd) : getState(key, jd);
    out[i * 6] = s.pos[0]; out[i * 6 + 1] = s.pos[1]; out[i * 6 + 2] = s.pos[2];
    out[i * 6 + 3] = s.vel[0]; out[i * 6 + 4] = s.vel[1]; out[i * 6 + 5] = s.vel[2];
  }
  return out;
}

/* ── Centralized per-tick cache (all renderers consume this) ────────── */
var cache = { jd: NaN, states: {}, helio: {} };
function update(jd) {
  if (jd === cache.jd) return cache;
  cache.jd = jd;
  for (var i = 0; i < SSB_KEYS.length; i++) {
    var k = SSB_KEYS[i];
    cache.states[k] = getState(k, jd);
  }
  for (var j = 0; j < SSB_KEYS.length; j++) {
    var k2 = SSB_KEYS[j];
    var b = cache.states[k2], s = cache.states.sun;
    cache.helio[k2] = (b.ok && s.ok && b.provider === s.provider)
      ? { pos: sub3(b.pos, s.pos), vel: sub3(b.vel, s.vel), provider: b.provider, ok: true, status: worstStatus(b.status, s.status) }
      : getHeliocentricState(k2, jd);
  }
  return cache;
}

/* ── Display-frame helper (explicit, documented convention) ───────────
   ECLIPTIC_J2000 (x,y,z) → legacy Y-up world (x, z, y). For z≈0 bodies this
   is bit-identical to the old (x, 0, y) mapping, so existing camera framing
   is preserved; inclined bodies (Pluto, Bennu) gain true height. This is a
   VIEW convention (mirror vs proper rotation is framing, not astronomy). */
function toWorld(x, y, z, out) {
  out[0] = x; out[1] = z; out[2] = y;
  return out;
}
function diagnostics() {
  var D = root.JPL_EPHEM;
  var lines = ["AstronomyState", "---------------"];
  lines.push("Frame: ECLIPTIC_J2000 (JPL Horizons native; X-Y = J2000 mean ecliptic, X = ICRF X)");
  lines.push("Origin: SSB (authoritative); SUN (derived heliocentric views)");
  lines.push("Time scale: TDB (UTC→TAI leap table→TT→3-term TDB series)");
  lines.push("Units: km, km/s, double precision");
  if (D) {
    lines.push("Primary ephemeris: " + JPL_LABEL + " (source: " + D.source + ")");
    lines.push("Kernel solution: " + D.kernel + " retrieved " + D.retrieved);
    if (D.kernelSet && D.kernelSet.length) lines.push("Kernel labels used: " + D.kernelSet.join(", "));
    lines.push("Data checksum: " + (D.checksum || "n/a"));
    var cov = [];
    for (var k in D.bodies) cov.push(k + " " + jdTdbToDate(D.bodies[k].t0) + "…" + jdTdbToDate(D.bodies[k].t1));
    lines.push("Coverage: " + cov.join(" | "));
    if (D.bodySources) {
      var srcs = [];
      for (var bk in D.bodySources) srcs.push(bk + "=" + D.bodySources[bk]);
      lines.push("Per-body Horizons source: " + srcs.join(" | "));
    }
  } else {
    lines.push("Primary ephemeris: MISSING (JPL_EPHEM not loaded) — all states FALLBACK_KEPLER");
  }
  lines.push("Fallback: " + FALLBACK_LABEL + " (JPL Table-1 approx elements ~1800–2050; SBDB Bennu; mean moon circles)");
  lines.push("Cache epoch JD(TDB): " + (isFinite(cache.jd) ? cache.jd.toFixed(5) : "none"));
  return lines.join("\n");
}

root.Astronomy = {
  AU_KM: AU_KM,
  contract: { frame: "ECLIPTIC_J2000", origin: "SSB", time: "TDB", dist: "km", vel: "km/s" },
  JPL_LABEL: JPL_LABEL, FALLBACK_LABEL: FALLBACK_LABEL, STATUS: STATUS,
  utcMsToJdTdb: utcMsToJdTdb, tdbDays: tdbDays,
  getState: getState, getHeliocentricState: getHeliocentricState, getRelativeState: getRelativeState,
  sampleTrajectory: sampleTrajectory,
  cache: cache, update: update,
  toWorld: toWorld, diagnostics: diagnostics,
  keplerElements: KEPLER_ELEMENTS, // single fallback dataset (game.js must not duplicate)
  mode: "physical", // "physical" (true scale, default) | "presentation" (legibility scaling, opt-in via ?mode=presentation / ?presentation)
  setMode: function (m) { if (m === "physical" || m === "presentation") this.mode = m; }
};
// expose internals for QA (node vm harness)
root.Astronomy._internals = { chebPos: chebPos, chebDeriv: chebDeriv, evalVel: evalVel, keplerState: keplerState, jplEval: jplEval, taiMinusUtc: taiMinusUtc };

})(typeof window !== "undefined" ? window : globalThis);
