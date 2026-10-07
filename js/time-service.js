"use strict";
/* MARGIN TimeService — the SINGLE owner of astronomical time (spec §11).
   Classic script, zero dependencies. Loads after js/constants.js, before
   js/astronomy.js. Consumers (astronomy.js, game.js, QA harnesses) delegate;
   the conversion math below is moved verbatim from js/astronomy.js, and
   yrToDate verbatim from game.js — values and behavior intentionally UNCHANGED.

   Scales: UTC -> TAI (leap table) -> TT (+32.184 s) -> TDB (3-term series).
   Gameplay epochs (Julian years, game.js bodyState/porkchop) are uniform
   365.25-day years counts — an APPROXIMATION of TDB (offset ~69 s in 2026:
   leap seconds + TT-TAI, measured by QA/jpl_reference_checks.mjs as 69.184 s).
   Centralizing documents the offset; converting gameplay to TDB is dynamics-
   boundary work and must change porkchop numbers explicitly, not silently. */
(function (root) {
  var C = root.MARGIN_CONST || {};
  var DAY_S = C.DAY_S || 86400;
  var J2000_JD = C.J2000_JD || 2451545.0; // JD(TDB) 2000-01-01 12:00 TDB
  var JULIAN_YEAR_D = C.JULIAN_YEAR_D || 365.25;

  /* Leap-second table: [JD(UTC) of 00:00 on effective date, TAI-UTC after].
     Valid through all leaps announced to date (none since 2017-01-01).
     If a new leap second is announced, extend this table; evaluation before
     1972-01-01 is rejected (UTC undefined). — AUTHORITATIVE (IERS Bulletin C). */
  var LEAP = [
    [2441317.5,10],[2441499.5,11],[2441683.5,12],[2442048.5,13],[2442413.5,14],
    [2442778.5,15],[2443144.5,16],[2443509.5,17],[2443874.5,18],[2444239.5,19],
    [2444786.5,20],[2445151.5,21],[2445516.5,22],[2446247.5,23],[2447161.5,24],
    [2447892.5,25],[2448257.5,26],[2448804.5,27],[2449169.5,28],[2449534.5,29],
    [2450083.5,30],[2450630.5,31],[2451179.5,32],[2453736.5,33],[2454832.5,34],
    [2456109.5,35],[2457204.5,36],[2457754.5,37]
  ];
  function taiMinusUtc(jdUtc) {
    if (jdUtc < LEAP[0][0]) return null;
    var v = LEAP[0][1];
    for (var i = 0; i < LEAP.length; i++) {
      if (jdUtc >= LEAP[i][0]) v = LEAP[i][1];
      else break;
    }
    return v;
  }
  // UTC unix-ms -> JD(TDB). {ok:false} before 1972 (fail closed). — DERIVED.
  function utcMsToJdTdb(ms) {
    var jdUtc = ms / 86400000 + 2440587.5;
    var leap = taiMinusUtc(jdUtc);
    if (leap === null) return { ok: false, reason: "pre-1972 UTC" };
    var jdTt = jdUtc + (leap + 32.184) / DAY_S;
    var T = (jdTt - J2000_JD) / 36525.0;
    var tdbMinusTt = 0.001657 * Math.sin(628.3076 * T + 6.2401)
                   + 0.000022 * Math.sin(575.3385 * T + 4.2970)
                   + 0.000014 * Math.sin(1256.6152 * T + 6.1969);
    return { ok: true, jd: jdTt + tdbMinusTt / DAY_S };
  }
  // Days after J2000.0 TDB — the simulation-clock unit. — DERIVED.
  function tdbDays(ms) {
    var r = utcMsToJdTdb(ms);
    return r.ok ? r.jd - J2000_JD : NaN;
  }
  function jdTdbToDate(jd) { // diagnostics only
    return new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10);
  }

  /* Gameplay-epoch conversions (game.js bodyState/porkchop clock).
     Uniform 365.25-day years since J2000 — APPROXIMATION, not TDB. */
  function gameEpochToDays(tYr) { return (tYr - 2000) * JULIAN_YEAR_D; }
  function gameEpochToJd(tYr) { return J2000_JD + gameEpochToDays(tYr); }
  function jdToGameEpoch(jd) { return 2000 + (jd - J2000_JD) / JULIAN_YEAR_D; }
  // Calendar label for a gameplay epoch — PRESENTATION (crude Jan-1 + d, display only).
  function yrToDate(t) {
    var y = Math.floor(t);
    var d = Math.round((t - y) * JULIAN_YEAR_D);
    var dt = new Date(Date.UTC(y, 0, 1));
    dt.setUTCDate(dt.getUTCDate() + d);
    return dt.toISOString().slice(0, 10);
  }

  root.TimeService = {
    DAY_S: DAY_S, J2000_JD: J2000_JD, JULIAN_YEAR_D: JULIAN_YEAR_D,
    taiMinusUtc: taiMinusUtc,
    utcMsToJdTdb: utcMsToJdTdb, tdbDays: tdbDays, jdTdbToDate: jdTdbToDate,
    gameEpochToDays: gameEpochToDays, gameEpochToJd: gameEpochToJd,
    jdToGameEpoch: jdToGameEpoch, yrToDate: yrToDate,
    CLASSIFICATION: {
      taiMinusUtc: "AUTHORITATIVE", utcMsToJdTdb: "DERIVED",
      tdbDays: "DERIVED", jdTdbToDate: "DERIVED",
      gameEpochToDays: "APPROXIMATION", gameEpochToJd: "APPROXIMATION",
      jdToGameEpoch: "APPROXIMATION", yrToDate: "PRESENTATION"
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
