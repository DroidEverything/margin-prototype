"""Build the vendored JPL ephemeris data file + golden QA reference.

Pipeline (per plans_notes/solar_system_architecture_rewrite_guide.md §6):
  official JPL Horizons vectors (DE441 solution + JPL satellite theories)
      -> tools/horizons_cache/ (raw, reproducible, exact query params logged)
      -> Chebyshev fits per body/granule (numpy)
      -> js/astronomy-jpl-data.js (classic script, defines JPL_EPHEM)
      -> QA/jpl_reference_vectors.json (HELD-OUT single-epoch queries,
         never used in fitting; parsed by an independent Node code path)

Usage:
  python tools/build_jpl_ephemeris.py build   # fit + emit data file
  python tools/build_jpl_ephemeris.py golden  # fetch held-out QA reference
  python tools/build_jpl_ephemeris.py ratios  # measure EMB/Pluto partitions
  python tools/build_jpl_ephemeris.py report  # residual spot-checks

Granule/degree choices come from tools/exp_granules2.py held-out tests.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hashlib
import json
import numpy as np
from numpy.polynomial.chebyshev import chebfit, chebval, chebder
import horizons

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# key, kind, horizons cmd, center, fit-start, fit-stop, sample step, granule d, degree
# SSB bodies need 1990..2110 (validation epochs 2000/2026/2050/2100).
# Relative moons: Moon 1995..2055 (validates 2000/2026/2050); fast moons
# 2026..2036 (validates 2026 + game era). Outside coverage -> explicit fallback.
# Degree 14 for the five fast satellites: their granule spans ~one orbital
# period, so a degree-10 fit leaves 20-150 km of error. tools/exp_granules5.py
# measured, at ~the same sample density, Io 20.97 -> 0.056 km, Europa 67.5 ->
# 0.50, Titan 149.8 -> 1.51 km for deg 10 -> 14, costing ~7% more coefficients.
BODIES = [
    ("sun",      "ssb", "10",  "500@0",   "1990-01-01", "2110-12-31", "4d",  128, 10),
    ("mercury",  "ssb", "199", "500@0",   "1990-01-01", "2110-12-31", "12h", 8,  10),
    ("venus",    "ssb", "299", "500@0",   "1990-01-01", "2110-12-31", "1d",  32,  10),
    ("emb",      "ssb", "3",   "500@0",   "1990-01-01", "2110-12-31", "1d",  64,  10),
    ("mars",     "ssb", "499", "500@0",   "1990-01-01", "2110-12-31", "1d",  64,  10),
    ("jupiter",  "ssb", "599", "500@0",   "1990-01-01", "2110-12-31", "2d",  64,  10),
    ("saturn",   "ssb", "699", "500@0",   "1990-01-01", "2110-12-31", "2d",  128, 10),
    ("uranus",   "ssb", "799", "500@0",   "1990-01-01", "2110-12-31", "4d",  128, 10),
    ("neptune",  "ssb", "899", "500@0",   "1990-01-01", "2110-12-31", "4d",  128, 10),
    ("plutobary","ssb", "9",   "500@0",   "1990-01-01", "2110-12-31", "4d",  128, 10),
    ("moon",     "rel", "301", "500@399", "1995-01-01", "2055-12-31", "12h", 8,  10),
    ("io",       "rel", "501", "500@599", "2026-01-01", "2036-12-31", "3h",  2,  14),
    ("europa",   "rel", "502", "500@599", "2026-01-01", "2036-12-31", "6h",  4,  14),
    ("ganymede", "rel", "503", "500@599", "2026-01-01", "2036-12-31", "12h", 8,  14),
    ("callisto", "rel", "504", "500@599", "2026-01-01", "2036-12-31", "1d",  16, 14),
    ("titan",    "rel", "606", "500@699", "2026-01-01", "2036-12-31", "1d",  16, 14),
    ("triton",   "rel", "801", "500@899", "2026-01-01", "2036-12-31", "6h",  6,  10),
    # Charon is vendored relative to PLUTO'S BODY CENTRE (500@999), the same
    # convention as the Moon (500@399). Vendoring it relative to the Pluto
    # SYSTEM BARYCENTRE (500@9) silently misplaces Pluto by ~232 km and Charon
    # by ~1.9 km*1000 (the Pluto–Charon separation came out 17,466 km instead of
    # ~19,596 km) because the app composes pluto = bary − Q_P·charonRel.
    ("charon",   "rel", "901", "500@999", "2026-01-01", "2036-12-31", "6h",  6,  10),
]
PARENT = {"moon": "earth", "io": "jupiter", "europa": "jupiter",
          "ganymede": "jupiter", "callisto": "jupiter", "titan": "saturn",
          "triton": "neptune", "charon": "pluto"}

GOLDEN_EPOCHS = [  # TDB calendar dates; QA uses the returned JDTDB exactly
    # Guide §38: J2000 reference epoch, current project date, ±1 y and ±10 y
    # around it, plus far-century checks (2050, 2100).
    "2000-01-01 00:00", "2015-06-01 00:00", "2016-09-21 00:00",
    "2025-09-21 00:00", "2026-09-21 00:00", "2027-09-21 00:00",
    "2030-06-15 00:00", "2036-09-21 00:00", "2050-01-01 00:00",
    "2100-01-01 00:00",
]
GOLDEN_BODIES_SSB = [  # absolute SSB queries (moons absolute too: validates composition)
    ("sun", "10"), ("mercury", "199"), ("venus", "299"), ("earth", "399"),
    ("mars", "499"), ("jupiter", "599"), ("saturn", "699"), ("uranus", "799"),
    ("neptune", "899"), ("pluto", "999"),
    ("moon", "301"), ("io", "501"), ("europa", "502"), ("ganymede", "503"),
    ("callisto", "504"), ("titan", "606"), ("triton", "801"), ("charon", "901"),
]


def r10(x):
    """Round to 10 significant figures (documented quantization, ~mm-level)."""
    return float("%.10g" % x)


def fit_body(cfg):
    key, kind, cmd, cen, start, stop, step, granule, deg = cfg
    info, recs = horizons.query(cmd, cen, start, stop, step)
    jd = np.array([r["jd"] for r in recs])
    pos = np.array([r["pos"] for r in recs])
    vel = np.array([r["vel"] for r in recs])
    t0, t1 = float(jd[0]), float(jd[-1])
    n = int((t1 - t0) // granule)
    cx, cy, cz = [], [], []
    worst = 0.0
    worst_v = 0.0
    for g in range(n):
        a = t0 + g * granule
        b = a + granule
        sel = (jd >= a - 1e-9) & (jd <= b + 1e-9)
        assert sel.sum() >= deg + 2, (key, g, sel.sum())
        tau = 2 * (jd[sel] - a) / (b - a) - 1.0
        dtau_dsec = 2.0 / ((b - a) * 86400.0)
        row = []
        for axis in range(3):
            c = chebfit(tau, pos[sel, axis], deg)
            pred = chebval(tau, c)
            worst = max(worst, float(np.max(np.abs(pred - pos[sel, axis]))))
            vpred = chebval(tau, chebder(c, 1)) * dtau_dsec
            worst_v = max(worst_v, float(np.max(np.abs(vpred - vel[sel, axis]))))
            row.append([r10(v) for v in c])
        cx.append(row[0]); cy.append(row[1]); cz.append(row[2])
    rec = {"kind": kind, "cmd": cmd, "center": cen,
           "src": "%s/%s" % (info["source_target"], info["source_center"]),
           "t0": t0, "t1": t0 + n * granule, "granule": granule, "deg": deg,
           # measured in-sample residuals of THIS fit (fit grid vs JPL vectors);
           # QA gates evaluate them at held-out epochs with a documented margin
           "fitResidualKm": round(worst, 6),
           "fitResidualKmPerSec": round(worst_v, 9),
           "coeff": {"x": cx, "y": cy, "z": cz}}
    if kind == "rel":
        rec["parent"] = PARENT[key]
    return rec, worst, worst_v, len(recs)


def cmd_build():
    out = {}
    total_nums = 0
    for cfg in BODIES:
        print("fitting %s ..." % cfg[0], flush=True)
        rec, worst, worst_v, nrec = fit_body(cfg)
        out[cfg[0]] = rec
        nums = sum(len(g) for ax in "xyz" for g in rec["coeff"][ax])
        total_nums += nums
        print("  %s: %d samples -> %d granules x deg %d, in-sample maxpos %.4f km, maxvel %.3e km/s, src %s"
              % (cfg[0], nrec, len(rec["coeff"]["x"]), cfg[8], worst, worst_v, rec["src"]))
    with open(os.path.join(ROOT, "QA", "mass_partition.json")) as f:
        mass_partition = json.load(f)
    # Kernel identity (guide §36/§56): record what Horizons actually reported per
    # body instead of asserting one label. Planetary states are DE441; the giant
    # planets and satellites come from JPL's merged satellite-system kernels.
    sources = sorted({rec["src"] for rec in out.values()})
    kernels = sorted({s.split("/")[0] for s in sources if s})
    data = {
        "kernel": "DE441" if kernels == ["DE441"] else "DE441 + " + ", ".join(k for k in kernels if k != "DE441"),
        "kernelSet": kernels,
        "bodySources": {k: out[k]["src"] for k in sorted(out)},
        "source": "JPL Horizons API VECTORS (ECLIPTIC_J2000 / SSB / TDB, KM-S)",
        "retrieved": "2026-09-21",
        "url": "https://ssd.jpl.nasa.gov/api/horizons.api",
        "frame": "ECLIPTIC_J2000",
        "origin": "SSB",
        "timeScale": "TDB",
        "note": "Chebyshev fits of JPL Horizons Cartesian vectors. SSB keys store "
                "barycentric states; rel keys store parent-relative states. Earth SSB "
                "is derived as EMB minus scaled geocentric Moon; Pluto body SSB as "
                "Pluto-barycenter minus scaled Charon (mass partitions measured from "
                "JPL data, see massPartition). Coefficients rounded to 10 significant "
                "figures. NEVER extrapolate: evaluator rejects JD outside [t0,t1]. "
                "Provenance: each body's Horizons 'source' label is recorded in "
                "bodySources/kernelSet (planets: DE441; giant planets + satellites: "
                "JPL merged satellite-system kernels such as jup365_merged/sat441l). "
                "Spec §20 prefers DE440 for the current century; the Horizons API "
                "does not expose a DE440 selection, so DE441-family data is vendored "
                "here and the deviation is recorded rather than hidden.",
        "massPartition": mass_partition,
        "bodies": out,
    }
    payload = json.dumps(out, sort_keys=True)
    data["checksum"] = "sha256:" + hashlib.sha256(payload.encode()).hexdigest()
    js = ("/* GENERATED by tools/build_jpl_ephemeris.py — do not hand-edit.\n"
          "   JPL Horizons vectors (DE441 solution + JPL satellite theories),\n"
          "   Chebyshev-fitted per granule. See data.note + data.checksum. */\n"
          "var JPL_EPHEM = " + json.dumps(data, separators=(",", ":")) + ";\n")
    path = os.path.join(ROOT, "js", "astronomy-jpl-data.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write(js)
    print("wrote %s (%.2f MB, %d coeffs, checksum %s)"
          % (path, len(js) / 1e6, total_nums, data["checksum"]))


def cmd_ratios():
    """Measure mass partitions empirically from JPL data.

    Earth: Q_E = proj(EMB - EarthCenter, MoonGeocentric). The denominator is
    body-relative, so the projection IS the partition fraction directly:
    EarthSSB = EMB - MoonGeo * Q_E.
    Pluto: R = proj(Bary - PlutoBody, CharonRelBary); denominator is
    barycenter-relative so this yields the mass RATIO Mc/Mp; the partition
    fraction is Q_P = R/(1+R): PlutoSSB = Bary - CharonRel * Q_P.
    Both are cross-checked against JPL GM tables (gate: |Q-Q_GM| < 1e-4).
    """
    _, emb = horizons.query("3", "500@0", "2026-01-01", "2026-02-10", "1d")
    _, earth = horizons.query("399", "500@0", "2026-01-01", "2026-02-10", "1d")
    _, moon = horizons.query("301", "500@399", "2026-01-01", "2026-02-10", "1d")
    qs = []
    for a, b, c in zip(emb, earth, moon):
        num = np.array(a["pos"]) - np.array(b["pos"])
        den = np.array(c["pos"])
        qs.append(float(np.dot(num, den) / np.dot(den, den)))
    qe = float(np.mean(qs))
    _, pb = horizons.query("9", "500@0", "2026-01-01", "2026-03-01", "1d")
    _, pl = horizons.query("999", "500@0", "2026-01-01", "2026-03-01", "1d")
    _, ch = horizons.query("901", "500@9", "2026-01-01", "2026-03-01", "1d")
    rs = []
    for a, b, c in zip(pb, pl, ch):
        num = np.array(a["pos"]) - np.array(b["pos"])
        den = np.array(c["pos"])
        rs.append(float(np.dot(num, den) / np.dot(den, den)))
    rmean = float(np.mean(rs))
    qp = rmean / (1.0 + rmean)
    # GM-table gates (JPL sats phys_par + planet GM: PLU060, DE440)
    qe_gm = 4902.800 / (398600.436 + 4902.800)
    qp_gm = 106.1 / (869.3 + 106.1)
    print("earthMoonQ  = %.10f  (GM %.10f, diff %.1e)" % (qe, qe_gm, qe - qe_gm))
    print("plutoCharonQ = %.10f  (GM %.10f, diff %.1e)" % (qp, qp_gm, qp - qp_gm))
    print("spread qe %.2e / R %.2e" % (max(qs) - min(qs), max(rs) - min(rs)))
    assert abs(qe - qe_gm) < 1e-4 and abs(qp - qp_gm) < 1e-4, "partition gate failed"
    mp = {"earthMoonQ": qe,            # Moon record is Earth-relative  -> fraction
          "plutoCharonQ": qp,          # Charon record is Pluto-relative -> fraction
          "earthMoonLever": qe / (1 - qe),   # M_moon/M_earth   (documentation)
          "plutoCharonLever": rmean,         # M_charon/M_pluto (measured directly on
                                             # the 500@9 projection; documentation)
          "recordCenters": {"moon": "500@399 (Earth body centre)",
                            "charon": "500@999 (Pluto body centre)"},
          "method": "Horizons projection + JPL GM gate"}
    assert abs(rmean - qp / (1 - qp)) < 1e-4, "lever/fraction inconsistency"
    with open(os.path.join(ROOT, "QA", "mass_partition.json"), "w") as f:
        json.dump(mp, f)
    print("wrote QA/mass_partition.json")


def cmd_golden():
    """Fetch held-out single-epoch reference vectors (never used in fitting).

    Horizons rejects START_TIME == STOP_TIME, so each epoch is queried as a
    1-minute window and only the FIRST record (exactly the requested instant)
    is kept. These are independent single-epoch queries, not fit-grid samples.
    """
    import datetime as _dt
    gold = {"meta": {"source": "JPL Horizons API VECTORS ECLIPTIC_J2000/SSB/TDB",
                     "retrieved": "2026-09-21",
                     "note": "Held-out epochs: fit grids use DAY-boundary samples from "
                             "range queries; these are independent single-epoch queries "
                             "(start, start+1min; first record kept). "
                             "QA compares app evaluator output at the exact JDTDB below."},
            "epochs": GOLDEN_EPOCHS, "vectors": {}}
    for key, cmd in GOLDEN_BODIES_SSB:
        gold["vectors"][key] = []
        for ep in GOLDEN_EPOCHS:
            t0 = _dt.datetime.strptime(ep, "%Y-%m-%d %H:%M")
            stop = (t0 + _dt.timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M")
            info, recs = horizons.query(cmd, "500@0", ep, stop, "1m")
            if not recs:
                raise RuntimeError("no record for %s @ %s" % (key, ep))
            r = recs[0]
            gold["vectors"][key].append({"jd": r["jd"], "pos": r["pos"], "vel": r["vel"]})
            print("golden %8s @ %s  JD %.6f  src %s  (%d recs)"
                  % (key, ep, r["jd"], info["source_target"], len(recs)))
    path = os.path.join(ROOT, "QA", "jpl_reference_vectors.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(gold, f)
    print("wrote %s (%d bodies x %d epochs)"
          % (path, len(gold["vectors"]), len(GOLDEN_EPOCHS)))


def cmd_report():
    """Residual spot-checks: re-evaluate the EMITTED data file against the raw
    JPL samples it was fitted to (catches quantization/encoding damage that the
    in-memory fit numbers cannot see). Independent JPL comparison lives in
    QA/jpl_reference_checks.mjs (held-out epochs + Node evaluator)."""
    path = os.path.join(ROOT, "js", "astronomy-jpl-data.js")
    with open(path, encoding="utf-8") as f:
        txt = f.read()
    payload = txt.split("var JPL_EPHEM = ", 1)[1].rstrip().rstrip(";")
    data = json.loads(payload)
    worst_all = 0.0
    print("EMITTED-FILE RESIDUAL CHECK (%s, %.2f MB)" % (os.path.basename(path), os.path.getsize(path) / 1e6))
    print("%-11s %9s %9s %9s %s" % ("body", "granules", "coeffs", "max km", "src"))
    for cfg in BODIES:
        key, kind, cmd, cen, start, stop, step, granule, deg = cfg
        info, recs = horizons.query(cmd, cen, start, stop, step)
        jd = np.array([r["jd"] for r in recs])
        pos = np.array([r["pos"] for r in recs])
        rec = data["bodies"][key]
        cx = rec["coeff"]["x"]; ng = len(cx)
        worst = 0.0
        g = np.floor((jd - rec["t0"]) / rec["granule"]).astype(int)
        g[g < 0] = 0
        g[g > ng - 1] = ng - 1
        for gi in range(ng):
            a = rec["t0"] + gi * rec["granule"]
            b = a + rec["granule"]
            # mirror fit_body(): a sample belongs to a granule only inside its
            # [a, b] window. Without this the trailing samples of the range
            # query (t1 is granule-quantised, the query is not) would be
            # extrapolated past tau = 1 and the check would report nonsense.
            sel = (g == gi) & (jd >= a - 1e-9) & (jd <= b + 1e-9)
            if not sel.any():
                continue
            tau = 2 * (jd[sel] - a) / (b - a) - 1.0
            for ax in range(3):
                c = np.array(rec["coeff"]["xyz"[ax]][gi])
                worst = max(worst, float(np.max(np.abs(chebval(tau, c) - pos[sel, ax]))))
        worst_all = max(worst_all, worst)
        ncoef = sum(len(gg) for ax in "xyz" for gg in rec["coeff"][ax])
        print("%-11s %9d %9d %9.4f %s" % (key, ng, ncoef, worst, rec["src"]))
    print("kernel: %s" % data["kernel"])
    print("checksum: %s" % data["checksum"])
    print("WORST EMITTED-FILE POSITION RESIDUAL: %.4f km" % worst_all)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "build"
    {"build": cmd_build, "golden": cmd_golden, "ratios": cmd_ratios, "report": cmd_report}[which]()
