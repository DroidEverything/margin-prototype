"""Experiment: choose Chebyshev granule length + degree per body.

Fetches one year of Horizons vectors for a fast planet (Mercury), a slow
planet (Earth), the Moon (geocentric) and Io (jovicentric), then reports max
position residual (km) and implied velocity residual for candidate
(granule_days, degree) pairs. Run: python tools/exp_granules.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from numpy.polynomial.chebyshev import chebfit, chebval, chebder
import horizons


def max_residual(records, granule_days, deg):
    t0 = records[0]["jd"]
    t1 = records[-1]["jd"]
    pos = np.array([r["pos"] for r in records])
    vel = np.array([r["vel"] for r in records])
    jd = np.array([r["jd"] for r in records])
    worst_p = 0.0
    worst_v = 0.0
    n = int((t1 - t0) // granule_days)
    for g in range(n):
        a = t0 + g * granule_days
        b = a + granule_days
        sel = (jd >= a - 1e-9) & (jd <= b + 1e-9)
        if sel.sum() < deg + 2:
            continue
        tj = jd[sel]
        tau = 2 * (tj - a) / (b - a) - 1.0
        for axis in range(3):
            c = chebfit(tau, pos[sel, axis], deg)
            pred = chebval(tau, c)
            worst_p = max(worst_p, float(np.max(np.abs(pred - pos[sel, axis]))))
            dc = chebder(c) * (2.0 / (b - a))  # d/dt in per-day; /86400 for per-sec below
            vpred = chebval(tau, dc) / 86400.0
            worst_v = max(worst_v, float(np.max(np.abs(vpred - vel[sel, axis]))))
    return worst_p, worst_v


def main():
    cases = [
        ("mercury-ssb", "199", "500@0", "1d"),
        ("earth-ssb", "399", "500@0", "2d"),
        ("moon-geo", "301", "500@399", "12h"),
        ("io-jup", "501", "500@599", "6h"),
    ]
    data = {}
    for key, cmd, cen, step in cases:
        info, recs = horizons.query(cmd, cen, "2026-01-01", "2027-01-01", step)
        print("%s: %d records src=%s/%s" % (key, len(recs), info["source_target"], info["source_center"]))
        data[key] = recs
    grids = {
        "mercury-ssb": [(8, 8), (16, 8), (16, 10), (32, 10), (32, 12)],
        "earth-ssb": [(16, 8), (32, 8), (32, 10), (64, 10), (64, 12), (128, 12)],
        "moon-geo": [(4, 8), (8, 8), (8, 10), (8, 12), (12, 12)],
        "io-jup": [(1, 8), (2, 8), (2, 10), (4, 10)],
    }
    for key, recs in data.items():
        print("---", key)
        for g, d in grids[key]:
            try:
                rp, rv = max_residual(recs, g, d)
                print("  granule %3dd deg %2d  maxpos %.4f km  maxvel %.2e km/s" % (g, d, rp, rv))
            except Exception as e:
                print("  granule %3dd deg %2d  ERROR %s" % (g, d, e))


if __name__ == "__main__":
    main()
