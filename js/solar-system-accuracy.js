/* MARGIN physical body data — the SINGLE physical-body dataset (§53).
   Implements plans_notes/solar_system_accuracy_spec.md physical constants
   (JPL/NASA/IAU reference values, §4/§8/§9/§10/§16-17).

   This module owns: radii, GM/mass, obliquity, rotation periods, moon
   metadata, ring geometry, region envelopes. It owns NO trajectory solver:
   positions/velocities come exclusively from window.Astronomy
   (js/astronomy.js: JPL_DE441 Chebyshev provider, FALLBACK_KEPLER fallback).
   Rendering presentation scales live in js/orrery.js and never write back.

   No THREE dependency — safe for `node --check` and node validation. */

export const AU_KM = (globalThis.MARGIN_CONST && globalThis.MARGIN_CONST.AU_KM) || 149597870.700;          // IAU exact (§1) — AUTHORITATIVE, owned by js/constants.js
export const DAY_S = (globalThis.MARGIN_CONST && globalThis.MARGIN_CONST.DAY_S) || 86400; // AUTHORITATIVE, owned by js/constants.js
export const JULIAN_YEAR_D = (globalThis.MARGIN_CONST && globalThis.MARGIN_CONST.JULIAN_YEAR_D) || 365.25;
export const J2000_JD = (globalThis.MARGIN_CONST && globalThis.MARGIN_CONST.J2000_JD) || 2451545.0; // DERIVED epoch anchor, owned by js/constants.js
export const LIGHT_KM_S = 299792.458;        // §1 — AUTHORITATIVE
export const LIGHT_S_PER_AU = 499.004783836; // §1

/* Solar + reflectance inputs for the lighting rig.
   SOLAR_CONSTANT_W_M2: SORCE/TIM total solar irradiance at 1 AU ≈ 1361 W/m²
   (Kopp & Lean 2011, GRL 38, L01706 — the TIM-corrected scale; NASA SORCE
   mission data page https://lasp.colorado.edu/home/sorce/data/tsi-data/,
   retrieved 2026-09-22).
   GEOMETRIC_ALBEDO: JPL Planetary Physical Parameters, GeometricAlbedo column
   (https://ssd.jpl.nasa.gov/planets/phys_par.html, retrieved 2026-09-22);
   Bennu 0.044 ± 0.002 via JPL SBDB phys-par (Hergenrother et al. 2019,
   retrieved live 2026-09-22). Geometric (not Bond) is the right quantity:
   the wide view shows bodies near full phase, and the exposure law
   normalizes each focus to middle gray anyway, so residual phase-curve
   differences only tilt the wide gradient slightly.
   Moons carry no verified albedo in the JPL tables, so the exposure law
   inherits the parent's (documented ≤3× approximation; Moon-vs-Earth is the
   largest known deviation). */
export const SOLAR_CONSTANT_W_M2 = 1361;
export const GEOMETRIC_ALBEDO = {
  mercury: 0.106, venus: 0.65, earth: 0.367, mars: 0.150,
  jupiter: 0.52, saturn: 0.47, uranus: 0.51, neptune: 0.41,
  pluto: 0.3, bennu: 0.044
};
export const ALBEDO_PARENT = {
  moon: 'earth', phobos: 'mars', deimos: 'mars',
  io: 'jupiter', europa: 'jupiter', ganymede: 'jupiter', callisto: 'jupiter'
};
export function albedoOf(key){
  if(GEOMETRIC_ALBEDO[key]!==undefined) return GEOMETRIC_ALBEDO[key];
  const p=ALBEDO_PARENT[key];
  if(p&&GEOMETRIC_ALBEDO[p]!==undefined) return GEOMETRIC_ALBEDO[p];
  return 0.3;
}

export const R_SUN_KM = 695700;              // IAU nominal (§3)
export const D_SUN_KM = 1391400;
export const GM_SUN_KM3_S2 = (globalThis.MARGIN_CONST && globalThis.MARGIN_CONST.GM_SUN_KM3_S2) || 132712440041.27942; // JPL SSD astrodynamic parameters, DE440-compatible — AUTHORITATIVE per solution, owned by js/constants.js
export const M_SUN_KG = 1.9884e30;           // NASA approximate (§3)

export const FRAME = 'ECLIPTIC_J2000 (JPL Horizons native; X-Y = J2000 mean ecliptic)';
export const TIME_SCALE = 'TDB (see js/astronomy.js AstronomyTime: UTC→TAI→TT→TDB)';
export const EPHEM_SOURCE = 'JPL_DE441 (vendored Chebyshev fits of Horizons vectors; see window.Astronomy)';
export const REF_EPOCH = 'J2000.0 = 2000-01-01 12:00 TDB';

// §4 — mean radius is the spherical-mesh authority; equatorial kept for oblate meshes.
export const BODIES = {
  sun:     { name: 'Sun',     meanRadiusKm: 695700,    equatorialRadiusKm: 695700,   gmKm3PerS2: GM_SUN_KM3_S2, massKg: M_SUN_KG },
  mercury: { name: 'Mercury', meanRadiusKm: 2439.4,    equatorialRadiusKm: 2440.53,  gmKm3PerS2: 22031.868551, massKg: 3.30103e23 },
  venus:   { name: 'Venus',   meanRadiusKm: 6051.8,    equatorialRadiusKm: 6051.8,   gmKm3PerS2: 324858.592000, massKg: 4.86731e24 },
  earth:   { name: 'Earth',   meanRadiusKm: 6371.0084, equatorialRadiusKm: 6378.1366, gmKm3PerS2: 398600.435507, massKg: 5.97217e24 },
  mars:    { name: 'Mars',    meanRadiusKm: 3389.50,   equatorialRadiusKm: 3396.19,  gmKm3PerS2: 42828.37362,  massKg: 6.41691e23 },
  jupiter: { name: 'Jupiter', meanRadiusKm: 69911,     equatorialRadiusKm: 71492,    gmKm3PerS2: 126686531.9, massKg: 1.898125e27 },
  saturn:  { name: 'Saturn',  meanRadiusKm: 58232,     equatorialRadiusKm: 60268,    gmKm3PerS2: 37931206.23, massKg: 5.68317e26 },
  uranus:  { name: 'Uranus',  meanRadiusKm: 25362,     equatorialRadiusKm: 25559,    gmKm3PerS2: 5793951.3,   massKg: 8.68099e25 },
  neptune: { name: 'Neptune', meanRadiusKm: 24622,     equatorialRadiusKm: 24764,    gmKm3PerS2: 6835099.97,  massKg: 1.024092e26 },
  pluto:   { name: 'Pluto',   meanRadiusKm: 1188.3,    equatorialRadiusKm: 1188.3,   gmKm3PerS2: 869.3,        massKg: 1.30246e22 },
  moon:    { name: 'Moon',    meanRadiusKm: 1737.4,    equatorialRadiusKm: 1737.4,   gmKm3PerS2: 4902.800,    massKg: 7.3458e22 },
};

// Fallback orbital elements live in ONE place only: window.Astronomy.keplerElements
// (js/astronomy.js KeplerFallbackProvider). This module must not duplicate them
// (§53: exactly one fallback dataset). Bennu's SBDB set lives there too.

// §8 obliquity to orbit (deg) — visual orientation fallback; exact attitude
// needs JPL pole vectors (§8 note).
export const OBLIQUITY_DEG = {
  mercury: 0.034, venus: 177.4, earth: 23.4, mars: 25.2, jupiter: 3.1,
  saturn: 26.7, uranus: 97.8, neptune: 28.3, pluto: 119.5,
};

// §9 sidereal rotation periods (days; negative = retrograde, JPL convention).
export const ROTATION_D = {
  mercury: 58.6462, venus: -243.018, earth: 0.99726968, mars: 1.02595676,
  jupiter: 0.41354, saturn: 0.44401, uranus: -0.71833, neptune: 0.67125,
  pluto: -6.3872,
};

// §10 major-moon mean elements (semi-major axis km + radius + GM).
export const MOONS = {
  moon:     { parent: 'earth',   meanRadiusKm: 1737.4,  gmKm3PerS2: 4902.800,   smaKm: 384400 },
  phobos:   { parent: 'mars',    meanRadiusKm: 11.08,   gmKm3PerS2: 0.0007087,  smaKm: 9375,  orbitalPeriodD: 0.31891 },
  deimos:   { parent: 'mars',    meanRadiusKm: 6.20,    gmKm3PerS2: 0.0000962,  smaKm: 23457, orbitalPeriodD: 1.26244 },
  io:       { parent: 'jupiter', meanRadiusKm: 1821.49, gmKm3PerS2: 5959.91547, smaKm: 421800 },
  europa:   { parent: 'jupiter', meanRadiusKm: 1560.80, gmKm3PerS2: 3202.71210, smaKm: 671100 },
  ganymede: { parent: 'jupiter', meanRadiusKm: 2631.20, gmKm3PerS2: 9887.83275, smaKm: 1070400 },
  callisto: { parent: 'jupiter', meanRadiusKm: 2410.30, gmKm3PerS2: 7179.28340, smaKm: 1882700 },
  mimas:    { parent: 'saturn',  meanRadiusKm: 198.20,  gmKm3PerS2: 2.50349,    smaKm: 186000 },
  enceladus:{ parent: 'saturn',  meanRadiusKm: 252.10,  gmKm3PerS2: 7.21037,    smaKm: 238400 },
  tethys:   { parent: 'saturn',  meanRadiusKm: 531.10,  gmKm3PerS2: 41.21353,   smaKm: 295000 },
  dione:    { parent: 'saturn',  meanRadiusKm: 561.40,  gmKm3PerS2: 73.11607,   smaKm: 377700 },
  rhea:     { parent: 'saturn',  meanRadiusKm: 763.50,  gmKm3PerS2: 153.94175,  smaKm: 527200 },
  titan:    { parent: 'saturn',  meanRadiusKm: 2574.76, gmKm3PerS2: 8978.13710, smaKm: 1221900 },
  iapetus:  { parent: 'saturn',  meanRadiusKm: 734.30,  gmKm3PerS2: 120.51511,  smaKm: 3561700 },
  miranda:  { parent: 'uranus',  meanRadiusKm: 235.8,   gmKm3PerS2: 4.3,        smaKm: 129846 },
  ariel:    { parent: 'uranus',  meanRadiusKm: 578.9,   gmKm3PerS2: 83.5,       smaKm: 190929 },
  umbriel:  { parent: 'uranus',  meanRadiusKm: 584.7,   gmKm3PerS2: 85.1,       smaKm: 265986 },
  titania:  { parent: 'uranus',  meanRadiusKm: 788.9,   gmKm3PerS2: 226.9,      smaKm: 436298 },
  oberon:   { parent: 'uranus',  meanRadiusKm: 761.4,   gmKm3PerS2: 205.3,      smaKm: 583511 },
  triton:   { parent: 'neptune', meanRadiusKm: 1352.6,  gmKm3PerS2: 1428.49546, smaKm: 354800 },
  charon:   { parent: 'pluto',   meanRadiusKm: 606.0,   gmKm3PerS2: 106.1,      smaKm: 19600 },
};

// §16–17 rings: authoritative km geometry, kept separate from body radius (§26).
export const RINGS_KM = {
  // Saturn main rings C–A: inner 74,658 km (1.24 R_eq) → outer 136,775 km
  // (2.27 R_eq); faint F/G/E envelope reaches ~282,000 km (§16). Renderer
  // draws main-ring annulus + optional faint-envelope flag; physics uses km.
  saturn: { innerKm: 74658, outerKm: 136775, faintOuterKm: 282000, cassiniWidthKm: 4700, thicknessM: 10 },
  // Jupiter main ring (§17): diffuse, Metis/Adrastea region.
  jupiter: { innerKm: 123000, outerKm: 128940, thicknessM: 30000 },
};

// §12–15 population regions (AU) — statistical envelopes, never hard walls.
export const REGIONS_AU = {
  beltMain: [2.2, 3.3],
  kuiperMain: [30, 50],
  oortInner: [2000, 5000],
  oortOuter: 100000,
  heliopause: [90, 120],
};

// --- §32 validation (physical constants only; trajectory truth is QA'd
// against JPL reference vectors by QA/jpl_reference_checks.mjs) -----------
export function validateScales(tol = 1e-9) {
  const fails = [];
  const check = (label, actual, expected, absTol) => {
    if (!(Math.abs(actual - expected) <= absTol)) fails.push({ label, actual, expected });
  };
  check('AU_KM', AU_KM, 149597870.700, tol);
  check('R_SUN_KM', R_SUN_KM, 695700, tol);
  for (const [k, b] of Object.entries(BODIES)) {
    if (k === 'sun') continue;
    check(k + '.meanRadiusKm>0', b.meanRadiusKm > 0 ? 1 : 0, 1, 0);
  }
  // §32 distance anchors (JPL mean semi-major axes; trajectory truth is
  // validated against reference vectors, not these constants)
  check('EMB sma anchor', 1.00000261 * AU_KM, 149598261.15, 1.0);
  check('Moon smaKm', MOONS.moon.smaKm, 384400, 1.0);
  check('Io smaKm', MOONS.io.smaKm, 421800, 1.0);
  check('Europa smaKm', MOONS.europa.smaKm, 671100, 1.0);
  check('Ganymede smaKm', MOONS.ganymede.smaKm, 1070400, 1.0);
  check('Callisto smaKm', MOONS.callisto.smaKm, 1882700, 1.0);
  check('Titan smaKm', MOONS.titan.smaKm, 1221900, 1.0);
  check('Charon smaKm', MOONS.charon.smaKm, 19600, 1.0);
  check('Saturn ring outerKm', RINGS_KM.saturn.outerKm, 136775, 1.0);
  check('Saturn faintOuterKm', RINGS_KM.saturn.faintOuterKm, 282000, 1.0);
  return fails;
}

// §33 startup report lines (ephemeris identity comes from window.Astronomy
// diagnostics at runtime; these lines cover the physical-data layer only)
export function sanityLines() {
  return [
    'SolarSystem Physical Data',
    '-------------------------',
    'Ephemeris: ' + EPHEM_SOURCE,
    'Frame: ' + FRAME,
    'Time scale: ' + TIME_SCALE,
    'Length: km',
    'Precision: double (authoritative km)',
    'AU constant: ' + AU_KM.toFixed(3) + ' km',
    'Solar radius: ' + R_SUN_KM.toFixed(1) + ' km',
    'Reference epoch: ' + REF_EPOCH,
  ];
}
