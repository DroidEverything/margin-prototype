"""Round 4: final sizing — Uranus short granules, deg12 moon variants.

Usage: python tools/exp_granules4.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import horizons
from exp_granules2 import fit_predict


def get(cmd, cen, step):
    _, fit = horizons.query(cmd, cen, "2026-01-01", "2027-01-01", step)
    _, val = horizons.query(cmd, cen, "2026-01-01T12:00", "2027-01-01T12:00", step)
    return fit, val


def main():
    plan = [
        ("ura-body799", "799", "500@0", "12h", [(8, 10), (8, 12), (12, 12)]),
        ("io@bary5", "501", "500@5", "3h", [(2, 12)]),
        ("europa@bary5", "502", "500@5", "6h", [(2, 12), (4, 12)]),
        ("ganymede@bary5", "503", "500@5", "6h", [(4, 12)]),
        ("callisto@bary5", "504", "500@5", "12h", [(8, 12)]),
        ("titan@bary6", "606", "500@6", "12h", [(8, 12)]),
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
