"""Build the DE440 mission-era ephemeris pack (spec §5.1).

Source: NAIF SPK kernels in tools/kernels/ (de440.bsp required; read with
spiceypy — tools-only dependency, never shipped to the browser).

Scope is deliberately narrow (see Gap Report / audit): the 7 records servable
as body-centers from de440.bsp alone (Sun, Mercury, Venus, EMB, Mars system,
Pluto barycenter, geocentric Moon) are rebuilt from DE440. de440.bsp carries
outer planets as BARYCENTERS only (IDs 5-8); their body-centers need satellite
kernels, so Jupiter/Saturn/Uranus/Neptune records keep shipping from the
DE441-family pack (satellite-system theories are versioned independently of
DE440/DE441) — per-body provider labels make the mix explicit, never silent.
Mars uses the Mars-system barycenter: measured 0.0002 km from the body center
(Horizons 499 vs 4 @ 2026-09-21), negligible and documented here, not hidden.

Pipeline mirrors tools/build_jpl_ephemeris.py:
  de440.bsp --spkezr--> sample grids (ECLIPJ2000 / SSB / TDB, KM-S)
      -> Chebyshev fits per body/granule (numpy, same math + r10)
      -> js/astronomy-jpl-data-de440.js (defines JPL_EPHEM_DE440)
      -> QA/jpl_reference_vectors_de440.json (HELD-OUT direct spkezr,
         never used in fitting)

Giant-planet fit quality is NOT fixed by this script: de440.bsp serves
Jupiter..Neptune as barycenters only, so their body-center records (and the
144-306 km held-out errors measured on the DE441 pack) stay as-is until
satellite kernels are vendored. This script changes the solution underneath
the bodies it can serve exactly.

Usage:
  python tools/build_de440.py build   # sample + fit + emit data file
  python tools/build_de440.py golden  # held-out spkezr reference vectors
  python tools/build_de440.py report  # emitted-file residual spot-checks
"""
import sys
import os
import hashlib
import json
import numpy as np
from numpy.polynomial.chebyshev import chebfit, chebval, chebder

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KDIR = os.path.join(HERE, "kernels")
DE440 = os.path.join(KDIR, "de440.bsp")
LSK = os.path.join(KDIR, "latest_leapseconds.tls")

# key, SPICE target, SPICE observer, fit-start, fit-stop, step, granule d, degree
# Same ranges/steps as the DE441 pack. Outer planets are NOT rebuilt here:
# de440.bsp serves them as barycenters only; body-centers stay on the
# DE441-family pack (per-body provider labels keep the mix explicit).
BODIES = [
    ("sun",       "SUN",               "SSB",   "1990-01-01", "2110-12-31", "4d",  128, 10),
    ("mercury",   "MERCURY",           "SSB",   "1990-01-01", "2110-12-31", "12h", 8,   10),
    ("venus",     "VENUS",             "SSB",   "1990-01-01", "2110-12-31", "1d",  32,  10),
    ("emb",       "EARTH BARYCENTER",  "SSB",   "1990-01-01", "2110-12-31", "1d",  64,  10),
    ("mars",      "MARS BARYCENTER",   "SSB",   "1990-01-01", "2110-12-31", "1d",  64,  10),
    ("plutobary", "PLUTO BARYCENTER",  "SSB",   "1990-01-01", "2110-12-31", "4d",  128, 10),
    ("moon",      "MOON",              "EARTH", "1995-01-01", "2055-12-31", "12h", 8,   10),
]

GOLDEN_EPOCHS = [
    "2000-01-01 00:00", "2015-06-01 00:00", "2016-09-21 00:00",
    "2025-09-21 00:00", "2026-09-21 00:00", "2027-09-21 00:00",
    "2030-06-15 00:00", "2036-09-21 00:00", "2050-01-01 00:00",
    "2100-01-01 00:00",
]

STEP_S = {"3h": 10800.0, "6h": 21600.0, "12h": 43200.0,
          "1d": 86400.0, "2d": 172800.0, "4d": 345600.0}
J2000_JD = 2451545.0


def furnsh():
    import spiceypy as sp
    if not os.path.exists(DE440):
        raise SystemExit("missing %s (see tools/kernels/ provenance)" % DE440)
    sp.furnsh(DE440)
    if os.path.exists(LSK):
        sp.furnsh(LSK)
    return sp


def et_of(datestr):
    """Calendar date ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM') -> ET seconds past J2000."""
    s = datestr.strip().replace(" ", "T")
    if "T" not in s:
        s += "T00:00:00"
    elif s.count(":") == 1:
        s += ":00"
    import spiceypy as sp
    return sp.str2et(s)


def r10(x):
    """Round to 10 significant figures (same quantization as DE441 pack)."""
    return float("%.10g" % x)


def sample(sp, target, observer, start, stop, step):
    t0, t1, dt = et_of(start), et_of(stop), STEP_S[step]
    n = int((t1 - t0) // dt) + 1
    jd = np.empty(n)
    pos = np.empty((n, 3))
    vel = np.empty((n, 3))
    for i in range(n):
        et = t0 + i * dt
        st, _ = sp.spkezr(target, et, "ECLIPJ2000", "NONE", observer)
        jd[i] = et / 86400.0 + J2000_JD
        pos[i] = st[:3]
        vel[i] = st[3:]
    return jd, pos, vel


def fit_grid(jd, pos, vel, granule, deg):
    t0, t1 = float(jd[0]), float(jd[-1])
    n = int((t1 - t0) // granule)
    cx, cy, cz = [], [], []
    worst = 0.0
    worst_v = 0.0
    for g in range(n):
        a = t0 + g * granule
        b = a + granule
        sel = (jd >= a - 1e-9) & (jd <= b + 1e-9)
        assert sel.sum() >= deg + 2, (g, sel.sum())
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
    return (t0, t0 + n * granule, granule, deg, worst, worst_v,
            {"x": cx, "y": cy, "z": cz})


def cmd_build():
    sp = furnsh()
    out = {}
    total_nums = 0
    for key, tgt, obs, start, stop, step, granule, deg in BODIES:
        print("sampling %s ..." % key, flush=True)
        jd, pos, vel = sample(sp, tgt, obs, start, stop, step)
        t0, t1, gran, dg, worst, worst_v, coeff = fit_grid(jd, pos, vel, granule, deg)
        rec = {"kind": "ssb" if obs == "SSB" else "rel",
               "target": tgt, "observer": obs, "src": "DE440/DE440",
               "t0": t0, "t1": t1, "granule": gran, "deg": dg,
               "fitResidualKm": round(worst, 6),
               "fitResidualKmPerSec": round(worst_v, 9),
               "coeff": coeff}
        if obs != "SSB":
            rec["parent"] = "earth"  # Moon is Earth-relative (same convention as DE441 pack)
        out[key] = rec
        nums = sum(len(g) for ax in "xyz" for g in coeff[ax])
        total_nums += nums
        print("  %s: %d samples -> %d granules x deg %d, in-sample maxpos %.4f km, maxvel %.3e km/s"
              % (key, len(jd), len(coeff["x"]), dg, worst, worst_v))
    with open(os.path.join(ROOT, "QA", "mass_partition.json")) as f:
        mass_partition = json.load(f)
    data = {
        "provider": "JPL_DE440",
        "kernel": "DE440",
        "kernelSet": ["DE440"],
        "bodySources": {k: "DE440" for k in sorted(out)},
        "source": "NAIF SPK de440.bsp via spkezr (ECLIPJ2000 / SSB / TDB, KM-S)",
        "retrieved": "2026-09-22",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp",
        "frame": "ECLIPTIC_J2000",
        "origin": "SSB",
        "timeScale": "TDB",
        "note": "Chebyshev fits of direct SPK states (geometric, no aberration "
                "correction — verified 4 cm agreement with Horizons-served DE441 "
                "EMB at 2026-09-21, confirming the frame/center convention). "
                "Only Sun/Mercury/Venus/EMB/Mars/Pluto-bary/Moon are rebuilt: "
                "de440.bsp serves outer planets as barycenters only, so "
                "Jupiter/Saturn/Uranus/Neptune body-centers (and all satellite "
                "records) keep shipping from the DE441-family pack — per-body "
                "provider labels keep the mix explicit. Mars uses the "
                "Mars-system barycenter (measured 0.0002 km off the body center). "
                "Coefficients rounded to 10 significant "
                "figures. NEVER extrapolate: evaluator rejects JD outside [t0,t1].",
        "massPartition": mass_partition,
        "bodies": out,
    }
    payload = json.dumps(out, sort_keys=True)
    data["checksum"] = "sha256:" + hashlib.sha256(payload.encode()).hexdigest()
    js = ("/* GENERATED by tools/build_de440.py — do not hand-edit.\n"
          "   NAIF de440.bsp states (JPL DE440 solution), Chebyshev-fitted per\n"
          "   granule. See data.note + data.checksum. */\n"
          "var JPL_EPHEM_DE440 = " + json.dumps(data, separators=(",", ":")) + ";\n")
    path = os.path.join(ROOT, "js", "astronomy-jpl-data-de440.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write(js)
    print("wrote %s (%.2f MB, %d coeffs, checksum %s)"
          % (path, len(js) / 1e6, total_nums, data["checksum"]))


def cmd_golden():
    """Held-out direct-spkezr reference (never fitted): same epochs as DE441 QA."""
    sp = furnsh()
    gold = {"meta": {"source": "NAIF de440.bsp direct spkezr, ECLIPTIC_J2000/SSB/TDB",
                     "retrieved": "2026-09-22",
                     "note": "Held-out epochs: fit grids use regular samples; these "
                             "are independent single-epoch evaluations (midnight TDB "
                             "parse via the same LSK path). QA compares the app "
                             "evaluator at the exact JD below."},
            "epochs": GOLDEN_EPOCHS, "vectors": {}}
    for key, tgt, obs, start, stop, step, granule, deg in BODIES:
        gold["vectors"][key] = []
        for ep in GOLDEN_EPOCHS:
            et = et_of(ep)
            jd = et / 86400.0 + J2000_JD
            st, _ = sp.spkezr(tgt, et, "ECLIPJ2000", "NONE", obs)
            gold["vectors"][key].append({"jd": jd, "pos": list(st[:3]), "vel": list(st[3:])})
            print("golden %8s @ %s  JD %.6f" % (key, ep, jd))
    path = os.path.join(ROOT, "QA", "jpl_reference_vectors_de440.json")
    with open(path, "w") as f:
        json.dump(gold, f)
    print("wrote %s (%d bodies x %d epochs)" % (path, len(gold["vectors"]), len(GOLDEN_EPOCHS)))


def cmd_report():
    """Residual spot-checks on the EMITTED DE440 file (catches encoding damage)."""
    sp = furnsh()
    path = os.path.join(ROOT, "js", "astronomy-jpl-data-de440.js")
    with open(path, encoding="utf-8") as f:
        txt = f.read()
    payload = txt.split("var JPL_EPHEM_DE440 = ", 1)[1].rstrip().rstrip(";")
    data = json.loads(payload)
    worst_all = 0.0
    print("EMITTED-FILE RESIDUAL CHECK (%s, %.2f MB)" % (os.path.basename(path), os.path.getsize(path) / 1e6))
    for key, tgt, obs, start, stop, step, granule, deg in BODIES:
        jd, pos, _ = sample(sp, tgt, obs, start, stop, step)
        rec = data["bodies"][key]
        cx = rec["coeff"]["x"]; ng = len(cx)
        worst = 0.0
        g = np.floor((jd - rec["t0"]) / rec["granule"]).astype(int)
        g[g < 0] = 0
        g[g > ng - 1] = ng - 1
        for gi in range(ng):
            a = rec["t0"] + gi * rec["granule"]
            b = a + rec["granule"]
            sel = (g == gi) & (jd >= a - 1e-9) & (jd <= b + 1e-9)
            if not sel.any():
                continue
            tau = 2 * (jd[sel] - a) / (b - a) - 1.0
            for ax in range(3):
                c = np.array(rec["coeff"]["xyz"[ax]][gi])
                worst = max(worst, float(np.max(np.abs(chebval(tau, c) - pos[sel, ax]))))
        worst_all = max(worst_all, worst)
        print("%-11s %9d %9.4f %s" % (key, ng, worst, rec["src"]))
    print("kernel: %s" % data["kernel"])
    print("checksum: %s" % data["checksum"])
    print("WORST EMITTED-FILE POSITION RESIDUAL: %.4f km" % worst_all)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "build"
    {"build": cmd_build, "golden": cmd_golden, "report": cmd_report}[which]()
