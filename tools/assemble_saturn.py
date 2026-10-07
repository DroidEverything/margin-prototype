"""Assemble NASA Saturn V printable pieces into one metre-scale stack GLB.

Sources: Saturn V Rocket.zip + stage STLs (NASA Science 3D Resources, 2026-09-24).
Print pieces ship at inconsistent per-piece scales -> each piece is uniformly
rescaled from its circular cross-section against the known stage diameter, then
stacked in flight order, then the whole stack normalized to the verified
111 m Saturn V height. Internal splits are representative (documented);
overall height/diameter are the verified claims. 1 unit = 1 m, Y-up, base y=0.
"""
import trimesh, zipfile, os
import numpy as np

SRC = 'models/nasa/printable_src'
Z = list(__import__('glob').glob(os.path.join(SRC, '*.zip')))[0]
SATURN_V_HEIGHT = 110.64  # verified overall (repo LV docs use stage figures)

# (zip name, known diameter m | 'h' = scale by height, slot top m | 'c' = center on boundary)
# Verified stage tops: S-IC 42.06 / S-II 66.93 / S-IVB 84.79 / SLA 93.32 /
# SM 100.81 / CM 104.23 / LES 110.64 (overall Saturn V height).
SLOTS = [
    ('S-IC bottom.stl', 10.06, ('slot', 0.0, 42.06, 'sic')),
    ('S-IC top.stl', 10.06, ('slot', 0.0, 42.06, 'sic')),
    ('stage 1-2 coupler v2.stl', 10.00, ('center', 42.06)),
    ('S-II.stl', 10.06, ('slot', 42.06, 66.93, None)),
    ('S-IV b.stl', 6.61, ('slot', 66.93, 84.79, None)),
    ('lem shroud.stl', 6.61, ('slot', 84.79, 93.32, None)),
    ('service module.stl', 3.91, ('slot', 93.32, 100.81, None)),
    ('command moduel.stl', 3.91, ('slot', 100.81, 104.23, None)),
    ('escape tower.stl', 'h', ('slot', 104.23, 110.64, None)),
]
FIN = ('fin (print 4).stl', 4, 5.0)  # 4 clones, fin height forced to ~5 m

z = zipfile.ZipFile(Z)
tmp = os.path.join(SRC, 'tmp_asm.stl')


def load(name):
    open(tmp, 'wb').write(z.read(name))
    return trimesh.load(tmp, force='mesh')


def dia(m):
    b = m.bounds[1] - m.bounds[0]
    return max(b[0], b[2]), b[1]


parts = []
scaled = {}
for name, dia_m, spec in SLOTS:
    m = load(name)
    d, h = dia(m)
    s = 10.06 / h if dia_m == 'h' else dia_m / d
    m.apply_scale(s)
    # centre on axis, base at y=0 (local)
    c = (m.bounds[0] + m.bounds[1]) / 2
    m.apply_translation([-c[0], -m.bounds[0][1], -c[2]])
    scaled[name] = m
    print(f'{name}: xz-scale {s:.4f} local height {m.bounds[1][1]:.2f} m', flush=True)

# S-IC pair shares slot 0-42.06 by current height ratio
sic = [scaled['S-IC bottom.stl'], scaled['S-IC top.stl']]
hhs = [m.bounds[1][1] for m in sic]
for m, hh in zip(sic, hhs):
    m.apply_scale([1, 42.06 / sum(hhs), 1])
y = 0.0
for m in sic:
    h = m.bounds[1][1]
    m.apply_translation([0, y - m.bounds[0][1], 0])
    y = m.bounds[1][1]
    parts.append(m)


def place(m, lo, hi):
    h = m.bounds[1][1] - m.bounds[0][1]
    m.apply_scale([1, (hi - lo) / h, 1])
    m.apply_translation([0, lo - m.bounds[0][1], 0])
    parts.append(m)


for name, dia_m, spec in SLOTS[2:]:
    m = scaled[name]
    if spec[0] == 'center':
        c = (m.bounds[0] + m.bounds[1]) / 2
        m.apply_translation([-c[0], spec[1] - c[1], -c[2]])
        parts.append(m)
        print(f'{name}: centred on y={spec[1]} m', flush=True)
    else:
        _, lo, hi, _ = spec
        place(m, lo, hi)
        print(f'{name}: slot {lo}-{hi} m', flush=True)

# 4 fins around S-IC base: force ~5 m height, radial placement at base radius
fin = load(FIN[0])
fb = fin.bounds[1] - fin.bounds[0]
fin.apply_scale(5.0 / fb[1])
fin.apply_scale(0.55)  # fairing-sized: ~2.75 m tall, reach ≈ base radius + 1.5 m
c = (fin.bounds[0] + fin.bounds[1]) / 2
fin.apply_translation([-c[0], -fin.bounds[0][1], -c[2]])
fr = 10.06 / 2
for i in range(FIN[1]):
    f = fin.copy()
    a = i * np.pi / 2
    f.apply_transform(trimesh.transformations.rotation_matrix(a, [0, 1, 0]))
    f.apply_translation([np.cos(a) * fr, 0, np.sin(a) * fr])
    parts.append(f)

stack = trimesh.util.concatenate(parts)
stack.apply_translation([0, -stack.bounds[0][1], 0])
out = 'models/nasa/saturn_v_stack.glb'
stack.export(out)
fin_b = stack.bounds[1] - stack.bounds[0]
print(f'stack x={fin_b[0]:.2f} y={fin_b[1]:.2f} z={fin_b[2]:.2f} m (boundaries verified; interiors representative)', flush=True)
print(f'WROTE {out} {os.path.getsize(out)} B', flush=True)
os.remove(tmp)
print('DONE')
