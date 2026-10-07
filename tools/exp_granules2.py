"""Held-out granule sizing: fit on nodes, validate on offset midpoints.

Usage: python tools/exp_granules2.py  (uses cache after first fetch)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from numpy.polynomial.chebyshev import chebfit, chebval, chebder
import horizons


def fit_predict(fit_recs, val_recs, granule_days, deg):
    t0 = fit_recs[0]["jd"]
    fjd = np.array([r["jd"] for r in fit_recs])
    fpos = np.array([r["pos"] for r in fit_recs])
    vjd = np.array([r["jd"] for r in val_recs])
    vpos = np.array([r["pos"] for r in val_recs])
    vvel = np.array([r["vel"] for r in val_recs])
    # build granule coeff table from fit nodes
    t1 = fit_recs[-1]["jd"]
    n = int((t1 - t0) // granule_days)
    worst_p = 0.0
    worst_v = 0.0
    for g in range(n):
        a = t0 + g * granule_days
        b = a + granule_days
        sel = (fjd >= a - 1e-9) & (fjd <= b + 1e-9)
        if sel.sum() < deg + 2:
            return None  # under-sampled
        tj = fjd[sel]
        tau = 2 * (tj - a) / (b - a) - 1.0
        coeffs = [chebfit(tau, fpos[sel, axis], deg) for axis in range(3)]
        vsel = (vjd >= a - 1e-9) & (vjd <= b + 1e-9)
        if vsel.sum() == 0:
            continue
        vt = 2 * (vjd[vsel] - a) / (b - a) - 1.0
        for axis in range(3):
            pred = chebval(vt, coeffs[axis])
            worst_p = max(worst_p, float(np.max(np.abs(pred - vpos[vsel, axis]))))
            dc = chebder(coeffs[axis]) * (2.0 / (b - a)) / 86400.0
            vp = chebval(vt, dc)
            worst_v = max(worst_v, float(np.max(np.abs(vp - vvel[vsel, axis]))))
    return worst_p, worst_v


def get(cmd, cen, step, off):
    _, fit = horizons.query(cmd, cen, "2026-01-01", "2027-01-01", step)
    _, val = horizons.query(cmd, cen, "2026-01-01T12:00", "2027-01-01T12:00", step)
    return fit, val


def main():
    plan = [
        # key, cmd, cen, fitstep, [(granule, deg)]
        ("mercury", "199", "500@0", "12h", [(8, 10), (16, 10), (16, 12)]),
        ("venus", "299", "500@0", "1d", [(32, 10), (64, 10), (64, 12)]),
        ("emb", "3", "500@0", "1d", [(64, 10), (128, 10), (128, 12)]),
        ("earth", "399", "500@0", "1d", [(32, 10), (64, 12)]),
        ("mars", "499", "500@0", "1d", [(32, 10), (64, 10), (64, 12)]),
        ("jupiter", "599", "500@0", "2d", [(64, 10), (128, 10), (128, 12)]),
        ("saturn", "699", "500@0", "2d", [(64, 10), (128, 10), (128, 12)]),
        ("uranus", "799", "500@0", "4d", [(128, 10), (128, 12), (256, 12)]),
        ("neptune", "899", "500@0", "4d", [(128, 10), (128, 12), (256, 12)]),
        ("plutobary", "9", "500@0", "4d", [(128, 10), (128, 12), (256, 12)]),
        ("sun", "10", "500@0", "4d", [(128, 10), (256, 12)]),
        ("moon-geo", "301", "500@399", "12h", [(8, 10), (8, 12), (12, 12)]),
        ("io", "501", "500@599", "3h", [(2, 10), (4, 12)]),
        ("europa", "502", "500@599", "6h", [(4, 10), (8, 12)]),
        ("ganymede", "503", "500@599", "12h", [(8, 10), (16, 12)]),
        ("callisto", "504", "500@599", "1d", [(16, 10), (32, 12)]),
        ("titan", "606", "500@699", "1d", [(16, 10), (32, 12)]),
        ("triton", "801", "500@899", "6h", [(6, 10), (12, 12)]),
        ("charon", "901", "500@9", "6h", [(6, 10), (12, 12)]),
    ]
    for key, cmd, cen, step, grid in plan:
        try:
            fit, val = get(cmd, cen, step, None)
        except Exception as e:
            print(key, "FETCH ERROR", e)
            continue
        print("--- %s (%d fit / %d val)" % (key, len(fit), len(val)))
        for g, d in grid:
            r = fit_predict(fit, val, g, d)
            if r is None:
                print("  g=%3dd deg=%2d  UNDER-SAMPLED" % (g, d))
            else:
                print("  g=%3dd deg=%2d  heldout maxpos=%.4f km maxvel=%.2e km/s" % (g, d, r[0], r[1]))


if __name__ == "__main__":
    main()
