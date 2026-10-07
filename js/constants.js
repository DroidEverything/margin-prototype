"use strict";
/* MARGIN canonical constants — Phase 1 single owner (Solar System Gap Report §H.1).
   Classic script, zero dependencies. Loads FIRST (before astronomy-jpl-data.js).
   ESM modules (solar-system-accuracy.js) read these at import time via globalThis
   with identical literal fallbacks, so file:// and node --check keep working
   even if load order changes. Values below are intentionally UNCHANGED. */
(function (root) {
  var C = {
    AU_KM: 149597870.700,            // IAU exact — AUTHORITATIVE
    DAY_S: 86400,                    // defined — AUTHORITATIVE
    JULIAN_YEAR_D: 365.25,           // defined — AUTHORITATIVE
    J2000_JD: 2451545.0,             // JD(TDB) 2000-01-01 12:00 TDB — DERIVED (conventional epoch)
    // GM_SUN (corrected 2026-09-22, Phase-1.1 trace): JPL SSD astrodynamic
    // parameters, DE440-compatible: 1.32712440041279419e20 m^3/s^2 =
    // 1.32712440041279419e11 km^3/s^2. The previous value (132712440.04127942,
    // exactly JPL/1000) was a dropped-thousands-group typo that made fallback
    // velocities ~31.6x too small. AUTHORITATIVE per solution (§10: do not mix
    // across solutions); game.js MU_SUN already carried this correct value.
    GM_SUN_KM3_S2: 132712440041.27942,
    LIGHT_KM_S: 299792.458,         // defined — AUTHORITATIVE
    // Transitional compatibility only — APPROXIMATION. The satellite-ephemeris
    // phase must eliminate their role in physical positioning (do not promote).
    MOON_PERIODS_D: {
      moon: 27.321661, io: 1.769138, europa: 3.551181, ganymede: 7.154553,
      callisto: 16.689018, titan: 15.945, triton: -5.876854, charon: 6.3872,
      phobos: 0.31891, deimos: 1.26244
    },
    NEW_MOON_J2000_D: 5.26,          // illustrative phase anchor — APPROXIMATION
    CLASSIFICATION: {
      AU_KM: "AUTHORITATIVE", DAY_S: "AUTHORITATIVE", JULIAN_YEAR_D: "AUTHORITATIVE",
      J2000_JD: "DERIVED", GM_SUN_KM3_S2: "AUTHORITATIVE",
      LIGHT_KM_S: "AUTHORITATIVE", MOON_PERIODS_D: "APPROXIMATION",
      NEW_MOON_J2000_D: "APPROXIMATION"
    }
  };
  // Bennu trajectory is NOT owned here: transitional SBDB snapshot lives in
  // astronomy.js KEPLER_ELEMENTS (a=1.12639, e=0.20375, M0=28.84 — APPROXIMATION,
  // epoch/covariance UNKNOWN). Do not move it into the constants dataset.
  // Radii discrepancies RESOLVED 2026-09-22: MOONS values ARE JPL Planetary
  // Satellite Physical Parameters mean radii
  // (https://ssd.jpl.nasa.gov/sats/phys_par:
  // Phobos 11.08 MAR097, Io 1821.49 / Ganymede 2631.20 JUP365 — "radius of a
  // sphere with the equivalent volume"); radiusKmTrue now reads MOONS directly.
  // Legacy educational values (11.267 / 1821.6 / 2634.1, UNKNOWN provenance) retired.
  root.MARGIN_CONST = C;
})(typeof window !== "undefined" ? window : globalThis);
