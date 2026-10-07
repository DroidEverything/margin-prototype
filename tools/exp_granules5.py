"""Held-out experiment: granule/degree for the FAST satellites.

Motivation: the current build uses granules that are as long as (or longer
than) a satellite's orbital period (Io 1.77 d vs 2 d granule, Europa 3.55 vs 4,
Ganymede 7.15 vs 8, Callisto 16.69 vs 16, Titan 15.95 vs 16). A degree-10
Chebyshev fit over ~one full revolution leaves tens-to-hundreds of km of error.
This script measures the real trade-off (accuracy vs coefficient count) on the
same cached JPL Horizons samples the build uses, so the granule/degree table in
build_jpl_ephemeris.py can be chosen from evidence rather than taste.

Run: python tools/exp_granules5.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from numpy.polynomial.chebyshev import chebfit, chebval, chebder
import horizons

# key, horizons cmd, center, start, stop, step
CASES = [
    ("io",       "501", "500@599", "2026-01-01", "2036-12-31", "3h"),
    ("europa",   "502", "500@599", "2026-01-01", "2036-12-31", "6h"),
    ("ganymede", "503", "500@599", "2026-01-01", "2036-12-31", "12h"),
    ("callisto", "504", "500@599", "2026-01-01", "2036-12-31", "1d"),
    ("titan",    "606", "500@699", "2026-01-01", "2036-12-31", "1d"),
]
COMBOS = [(1.0, 10), (1.0, 14), (1.0, 18), (0.5, 10), (0.5, 14), (0.25, 10)]
BASE_GRANULE = {"io": 2, "europa": 4, "ganymede": 8, "callisto": 16, "titan": 16}


def measure(key, cmd, cen, start, stop, step, granule, deg):
    _, recs = horizons.query(cmd, cen, start, stop, step)
    jd = np.array([r["jd"] for r in recs])
    pos = np.array([r["pos"] for r in recs])
    vel = np.array([r["vel"] for r in recs])
    t0, t1 = float(jd[0]), float(jd[-1])
    n = int((t1 - t0) // granule)
    wp = wv = 0.0
    ng_ok = 0
    for g in range(n):
        a = t0 + g * granule
        b = a + granule
        sel = (jd >= a - 1e-9) & (jd <= b + 1e-9)
        if sel.sum() < deg + 2:
            return None  # not enough samples at this granule
        ng_ok += 1
        tau = 2 * (jd[sel] - a) / (b - a) - 1.0
        dtau = 2.0 / ((b - a) * 86400.0)
        for axis in range(3):
            c = chebfit(tau, pos[sel, axis], deg)
            wp = max(wp, float(np.max(np.abs(chebval(tau, c) - pos[sel, axis]))))
            vp = chebval(tau, chebder(c, 1)) * dtau
            wv = max(wv, float(np.max(np.abs(vp - vel[sel, axis]))))
    return ng_ok, wp, wv


print("%-9s %8s %5s %8s %14s %14s %12s" %
      ("body", "granule", "deg", "granules", "max pos km", "max vel km/s", "coeff nums"))
for key, cmd, cen, start, stop, step in CASES:
    print("-" * 82)
    for f, deg in COMBOS:
        granule = BASE_GRANULE[key] * f
        r = measure(key, cmd, cen, start, stop, step, granule, deg)
        if r is None:
            print("%-9s %8s %5d %8s %14s" % (key, granule, deg, "-", "insufficient samples"))
            continue
        ng, wp, wv = r
        print("%-9s %8s %5d %8d %14.4f %14.3e %12d" %
              (key, granule, deg, ng, wp, wv, ng * (deg + 1) * 3))
