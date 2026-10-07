"""Vendor NASA Saturn V printable STLs, merge per stage, normalize to metres, export GLB.

Sources (NASA Science 3D Resources, retrieved 2026-09-24, public domain):
  saturn-v-stage-1/ : S-IC, 5x F-1, 42.06 m x 10.06 m dia (verify target)
  saturn-v-stage-2/ : S-II, 5x J-2, 24.87 m x 10.06 m dia (verify target)
Units of printable STLs are arbitrary -> uniform scale from measured bbox vs
known vehicle dimensions is baked in, so 1 GLB unit = 1 m (repo canonical).
"""
import urllib.request, os, sys
import numpy as np
import trimesh

BASE = 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/printable'
SRC = 'models/nasa/printable_src'
STAGES = {
    'saturn_v_stage1': {
        'files': ['saturn-v---stage-1/top%20part%20a.stl', 'saturn-v---stage-1/top%20part%20b.stl',
                  'saturn-v---stage-1/bottom%20part%20a.stl', 'saturn-v---stage-1/bottom%20part%20b.stl'],
        'height_m': 42.06, 'dia_m': 10.06,
    },
    'saturn_v_stage2': {
        'files': ['saturn-v---stage-2/top.stl', 'saturn-v---stage-2/joining%20cube.stl',
                  'saturn-v---stage-2/bottom.stl'],
        'height_m': 24.87, 'dia_m': 10.06,
    },
}
os.makedirs(SRC, exist_ok=True)
os.makedirs('models/nasa', exist_ok=True)
for stage, cfg in STAGES.items():
    meshes = []
    for f in cfg['files']:
        url = f'{BASE}/{f}'
        dst = os.path.join(SRC, stage + '__' + f.split('/')[-1].replace('%20', '_'))
        if not os.path.exists(dst):
            print('GET', url, flush=True)
            urllib.request.urlretrieve(url, dst)
        print('LOAD', dst, os.path.getsize(dst), 'B', flush=True)
        m = trimesh.load(dst, force='mesh')
        meshes.append(m)
    combo = trimesh.util.concatenate(meshes)
    bb = combo.bounds  # [[min],[max]] in STL units
    size = bb[1] - bb[0]
    # longest horizontal extent ~ diameter, vertical ~ height (assume Z-up STL)
    h, dx, dy = size[2], size[0], size[1]
    s_h, s_d = cfg['height_m'] / h, cfg['dia_m'] / max(dx, dy)
    print(f'{stage}: stl size x={dx:.3f} y={dy:.3f} z={h:.3f} -> s_h={s_h:.6f} s_d={s_d:.6f}', flush=True)
    s = s_h  # uniform: trust height (printables are to-scale; warn on disagree)
    if abs(s_h - s_d) / s_h > 0.05:
        print(f'WARNING {stage}: height/diameter scales disagree >5% — model may not be to scale', flush=True)
    combo.apply_scale(s)
    # center on origin, base at y=0 -> z-up to y-up: rotate -90 about X
    combo.apply_translation(-(combo.bounds[0] + combo.bounds[1]) / 2 * np.array([1, 1, 0]))
    combo.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    combo.apply_translation([0, -combo.bounds[0][1], 0])
    out = f'models/nasa/{stage}.glb'
    combo.export(out)
    fin = combo.bounds[1] - combo.bounds[0]
    print(f'WROTE {out} {os.path.getsize(out)} B  metres: x={fin[0]:.2f} y={fin[1]:.2f} z={fin[2]:.2f}', flush=True)
print('DONE')
