"""Round 3: barycenter smoothness, short moon granules, barycenter-as-center.

Usage: python tools/exp_granules3.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from numpy.polynomial.chebyshev import chebfit, chebval
import horizons
from exp_granules2 import fit_predict


def get(cmd, cen, step):
    _, fit = horizons.query(cmd, cen, "2026-01-01", "2027-01-01", step)
    _, val = horizons.query(cmd, cen, "2026-01-01T12:00", "2027-01-01T12:00", step)
    return fit, val


def main():
    plan = [
        ("jup-bary5", "5", "500@0", "4d", [(128, 10), (128, 12)]),
        ("sat-bary6", "6", "500@0", "4d", [(128, 10), (128, 12)]),
        ("nep-bary8", "8", "500@0", "4d", [(128, 10), (128, 12)]),
        ("ura-body799", "799", "500@0", "12h", [(16, 12), (32, 12)]),
        ("io@bary5", "501", "500@5", "90min", [(1, 8), (1, 10)]),
        ("europa@bary5", "502", "500@5", "3h", [(2, 8), (2, 10)]),
        ("ganymede@bary5", "503", "500@5", "6h", [(4, 8), (4, 10)]),
        ("callisto@bary5", "504", "500@5", "12h", [(8, 8), (8, 10)]),
        ("titan@bary6", "606", "500@6", "12h", [(8, 8), (8, 10)]),
        ("triton@bary8", "801", "500@8", "4h", [(3, 8), (3, 10)]),
        ("charon@bary9", "901", "500@9", "4h", [(3, 8), (3, 10)]),
    ]
    for key, cmd, cen, step, grid in plan:
        try:
            fit, val = get(cmd, cen, step)
        except Exception as e:
            print(key, "FETCH ERROR", repr(e)[:200])
            continue
        print("--- %s (%d fit / %d val)" % (key, len(fit), len(val)), flush=True)
        for g, d in grid:
            r = fit_predict(fit, val, g, d)
            if r is None:
                print("  g=%3dd deg=%2d  UNDER-SAMPLED" % (g, d))
            else:
                print("  g=%3dd deg=%2d  heldout maxpos=%.4f km maxvel=%.2e km/s" % (g, d, r[0], r[1]), flush=True)


if __name__ == "__main__":
    main()
