import urllib.request, urllib.parse, os
base = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/'
files = [
 ('3D Models/Satellite Kit/Satellite Kit body 1.glb','models/nasa/satellite_kit_body_1.glb',2916),
 ('3D Models/Satellite Kit/Satellite Kit body 2.glb','models/nasa/satellite_kit_body_2.glb',5256),
 ('3D Models/Satellite Kit/Satellite Kit body 3.glb','models/nasa/satellite_kit_body_3.glb',4944),
 ('3D Models/Satellite Kit/Satellite Kit wings 1.glb','models/nasa/satellite_kit_wings_1.glb',4860),
 ('3D Models/Satellite Kit/Satellite Kit wings 2.glb','models/nasa/satellite_kit_wings_2.glb',8172),
 ('3D Models/Satellite Kit/Satellite Kit wings 3.glb','models/nasa/satellite_kit_wings_3.glb',14820),
 ('3D Models/Satellite Kit/Satellite Kit radio 1.glb','models/nasa/satellite_kit_radio_1.glb',8436),
 ('3D Models/Satellite Kit/Satellite Kit radio 2.glb','models/nasa/satellite_kit_radio_2.glb',8752),
 ('3D Models/Satellite Kit/Satellite Kit radio 3.glb','models/nasa/satellite_kit_radio_3.glb',9012),
 ('3D Models/Saturn V/Saturn V.glb','models/nasa/saturn_v.glb',927212),
]
os.makedirs('models/nasa', exist_ok=True)
for src, dst, exp in files:
    url = base + urllib.parse.quote(src)
    print('GET', url)
    urllib.request.urlretrieve(url, dst)
    sz = os.path.getsize(dst)
    flag = 'OK' if sz == exp else f'MISMATCH exp {exp}'
    print(f'  -> {dst} {sz} B {flag}')
    assert sz == exp, f'size mismatch {dst}: got {sz}, expected {exp}'
print('ALL VERIFIED')
