import urllib.request, urllib.parse, os
base = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/'
# NASA hero spacecraft (flown missions), NASA 3D Resources, retrieved 2026-09-24.
# Sizes asserted against GitHub API `size` fields. Public domain per
# https://www.nasa.gov/multimedia/guidelines/. No insignia per repo rule.
files = [
  ('3D Models/Mars Reconnaissance Orbiter (MRO) (A)/Mars Reconnaissance Orbiter (MRO) (A).glb','models/nasa/mro.glb',2652460),
  ('3D Models/Voyager Probe (A)/Voyager Probe (A).glb','models/nasa/voyager.glb',285936),
  ('3D Models/Juno (A)/Juno (A).glb','models/nasa/juno.glb',8999028),
  ('3D Models/Mars Atmosphere and Volatile EvolutioN (MAVEN) (A)/Mars Atmosphere and Volatile EvolutioN (MAVEN) (A).glb','models/nasa/maven.glb',10465800),
  ('3D Models/MErcury Surface, Space ENvironment, GEochemistry, and Ranging (MESSENGER)/MErcury Surface, Space ENvironment, GEochemistry, and Ranging (MESSENGER).glb','models/nasa/messenger.glb',2673396),
  ('3D Models/Lunar Reconnaissance Orbiter (A)/Lunar Reconnaissance Orbiter (A).glb','models/nasa/lro.glb',654500),
  ('3D Models/Origins, Spectral Interpretation, Resource Identification, and Security - Regolith Explorer (OSIRIS-REx)/OSIRIS-REx.glb','models/nasa/osiris_rex.glb',1281308),
  ('3D Models/Mars 2020 Perseverance Rover/Mars 2020 Perseverance Rover.glb','models/nasa/perseverance.glb',4987176),
]
os.makedirs('models/nasa', exist_ok=True)
for src, dst, exp in files:
    url = base + urllib.parse.quote(src)
    print('GET', url, flush=True)
    urllib.request.urlretrieve(url, dst)
    sz = os.path.getsize(dst)
    flag = 'OK' if sz == exp else f'MISMATCH exp {exp}'
    print(f'  -> {dst} {sz} B {flag}', flush=True)
    assert sz == exp, f'size mismatch {dst}: got {sz}, expected {exp}'
print('ALL VERIFIED')
