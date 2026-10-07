/* MARGIN shared orrery core — true scale by default, presentation opt-in.
   WORLD_PER_AU=1.35, UNITS_PER_KM=WORLD_PER_AU/AU_KM
   Positions come from the real JPL ephemeris at true scale; diameters render
   at true scale by default (physical mode). Presentation enlargement
   (inner system 250x, giants 80x, sun capped) remains available as an opt-in
   legibility fallback (?mode=presentation) — the same balance every
   planetarium uses, since true radii are sub-pixel at system range.
   True scale is the default (?phys=1 / ?mode=physical kept as explicit aliases).
   Every surface map is a vendored NASA original (see assets/ASSET_SOURCES.md);
   anything NASA publishes no equirect map for (Sun, Uranus, ring texture,
   night lights, bump) renders as flat material / procedural geometry with
   real radii — never a third-party texture.
   - Sun: procedural granulation + limb-darkening shader with UnrealBloomPass
     corona (no texture, no 2D sprite flares)
   - Physical rig: SORCE/TIM-derived sunlight (I = 1361 × 1.35² ≈ 2480, exact
     at 1 AU) with inverse-square falloff at real JPL-ephemeris distances,
     dim cool fill, PCFSoft shadows
   - Earth: physical material under the real sun + injected Blue Marble day /
     Black Marble emissive night blend + MODIS cloud-deck ground shadows
   - Scattering-look limb shells (day blue / night dim / warm terminator band)
   - Saturn procedural rings with real Cassini division; Uranus thin rings at
     real 1.49–2.0 R_eq proportions
   - Phobos & Deimos: real NASA maps on real-radius spheres with real orbits
   - Jupiter Galilean moons: NASA Io/Europa/Ganymede/Callisto maps, real orbits
   - Hipparcos star-map skybox (NASA 3D Resources) + HYG catalog star points
   - Orbit path lines for each body, each tagged with its real mean
     heliocentric distance (AU + km, JPL elements)
   - Full PLANET_DATA educational facts database
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { STAR_VEC, STAR_MAG, STAR_BV } from './stars-data.js';
import { AU_KM, J2000_JD, R_SUN_KM, BODIES, OBLIQUITY_DEG, MOONS, RINGS_KM, sanityLines, validateScales, SOLAR_CONSTANT_W_M2, albedoOf } from './solar-system-accuracy.js';

function AZ(){ try{ const A=globalThis.Astronomy; if(A&&typeof A.getHeliocentricState==='function') return A; }catch(e){} return null; }
// J2000 anchor owned by js/constants.js (re-exported via solar-system-accuracy.js) — DERIVED.
export const DPR_CAP=1.5;
export const WORLD_PER_AU=1.35;
export { AU_KM };
export const UNITS_PER_KM=WORLD_PER_AU/AU_KM;
export const LEGACY_SIZE_K=0.30/6371.0084;
export const PRESENTATION_ENLARGEMENT_INNER=250;
export const PRESENTATION_ENLARGEMENT_OUTER=80;
export const PRESENTATION_ENLARGEMENT=PRESENTATION_ENLARGEMENT_INNER;
export const PRESENTATION_SIZE_K=UNITS_PER_KM*PRESENTATION_ENLARGEMENT_INNER;
export const PRESENTATION_SIZE_K_OUTER=UNITS_PER_KM*PRESENTATION_ENLARGEMENT_OUTER;
export const SIZE_K=PRESENTATION_SIZE_K;
export const R_KM={ sun:BODIES.sun.meanRadiusKm, jupiter:BODIES.jupiter.meanRadiusKm, earth:BODIES.earth.meanRadiusKm, mars:BODIES.mars.meanRadiusKm, moon:BODIES.moon.meanRadiusKm, europa:MOONS.europa.meanRadiusKm, bennu:0.246, mercury:BODIES.mercury.meanRadiusKm, venus:BODIES.venus.meanRadiusKm, saturn:BODIES.saturn.meanRadiusKm, uranus:BODIES.uranus.meanRadiusKm, neptune:BODIES.neptune.meanRadiusKm, pluto:BODIES.pluto.meanRadiusKm };

export function radiusKmTrue(k){
  // Satellite radii are JPL Planetary Satellite Physical Parameters mean radii
  // (equivalent-volume sphere; https://ssd.jpl.nasa.gov/sats/phys_par):
  // Phobos 11.08±0.04 (MAR097), Io 1821.49±0.50 / Ganymede 2631.20±1.70 (JUP365).
  // Retired legacy educational values: phobos 11.267, io 1821.6, ganymede 2634.1
  // (UNKNOWN provenance, ex-PLANET_DATA strings; replaced 2026-09-22).
  if(k==='bennu') return 0.246; // PRESENTATION-scale shape proxy, not a geodetic radius
  if(k==='phobos') return MOONS.phobos.meanRadiusKm;
  if(k==='deimos') return MOONS.deimos.meanRadiusKm;
  if(k==='io') return MOONS.io.meanRadiusKm;
  if(k==='europa') return MOONS.europa.meanRadiusKm;
  if(k==='ganymede') return MOONS.ganymede.meanRadiusKm;
  if(k==='callisto') return MOONS.callisto.meanRadiusKm;
  if(BODIES[k]) return BODIES[k].meanRadiusKm;
  return 1000;
}

export function radiusOf(k){
  if(k==='sun') return 0.5;
  if(k==='bennu') return 0.05;
  if(k==='phobos') return 0.018;
  if(k==='deimos') return 0.018 * (MOONS.deimos.meanRadiusKm / MOONS.phobos.meanRadiusKm);
  if(k==='io') return 0.075;
  if(k==='europa') return 0.065;
  if(k==='ganymede') return 0.110;
  if(k==='callisto') return 0.100;
  const outer=['jupiter','saturn','uranus','neptune'];
  if(outer.includes(k)) return R_KM[k]*PRESENTATION_SIZE_K_OUTER;
  return R_KM[k]*PRESENTATION_SIZE_K;
}

export function radiusPhysicalWorld(k,u){ const uu=u!==undefined?u:UNITS_PER_KM; return radiusKmTrue(k)*uu; }
function urlHasPhys(){ try{ if(typeof globalThis.location!=='undefined'&&globalThis.location.search){ const sp=new URLSearchParams(globalThis.location.search); return sp.has('phys')||sp.get('mode')==='physical'; } }catch(e){} return false; }
function urlHasPres(){ try{ if(typeof globalThis.location!=='undefined'&&globalThis.location.search){ const sp=new URLSearchParams(globalThis.location.search); return sp.has('presentation')||sp.has('pres')||sp.get('mode')==='presentation'; } }catch(e){} return false; }
export function isPhysicalModeRequested(){ return !urlHasPres(); }
export function getAstronomyMode(){ try{ const A=AZ(); if(A&&A.mode) return A.mode; }catch(e){} if(urlHasPres()) return 'presentation'; return 'physical'; }
export function currentRenderMode(){ return getAstronomyMode(); }
export function isPhysicalMode(){ return getAstronomyMode()==='physical'; }
export function ensurePhysicalModeFromURL(){ return ensureModeFromURL(); }
export function ensureModeFromURL(){ try{ const A=AZ(); if(!A||typeof A.setMode!=='function') return; if(urlHasPres()){ if(A.mode!=='presentation'){ A.setMode('presentation'); console.info('[orrery] ?mode=presentation → Astronomy.setMode("presentation")'); } } else if(A.mode!=='physical'){ A.setMode('physical'); console.info('[orrery] default true scale → Astronomy.setMode("physical")'); } }catch(e){} }
export function getUnitsPerKm(){ return UNITS_PER_KM; }
export function radiusWorld(k,opts){ opts=opts||{}; const phys=!!opts.physical||isPhysicalMode(); const u=opts.unitsPerKm!==undefined?opts.unitsPerKm:UNITS_PER_KM; if(phys) return radiusKmTrue(k)*u; return radiusOf(k); }

export const LEVEL_BODY={ l1:'earth', l2:'moon', l3:'mars', l4:'bennu', l5:'europa', sbx:'mars' };
export const DAYS_PER_SEC=0.04; // PRESENTATION (time-lapse rate, not physics)
// Moon/satellite periods below are transitional APPROXIMATION compatibility values
// owned by js/constants.js MOON_PERIODS_D; the satellite-ephemeris phase must
// eliminate their role in physical positioning. Values unchanged.
export const NEW_MOON_J2000=5.26;
export const MOON_PERIOD=27.321661;
export const EUROPA_PERIOD=3.551181;
export const IO_PERIOD=1.769138;
export const GANYMEDE_PERIOD=7.154553;
export const CALLISTO_PERIOD=16.689018;
export const PHOBOS_PERIOD=MOONS.phobos.orbitalPeriodD;
export const DEIMOS_PERIOD=MOONS.deimos.orbitalPeriodD;

export const MOON_ORBIT_R=0.45;
export const MOON_ORBIT_R_TRUE_KM=384400;
export const EUROPA_ORBIT_R=4.2;
export const EUROPA_ORBIT_R_TRUE_KM=671100;
export const IO_ORBIT_R=2.8;
export const GANYMEDE_ORBIT_R=5.8;
export const CALLISTO_ORBIT_R=7.8;
export const PHOBOS_ORBIT_R=0.28;
export const DEIMOS_ORBIT_R=0.52;

/* Global simulation settings */
export const ORRERY_SETTINGS = {
  accelerationOrbit: 1.0,
  acceleration: 1.0,
  sunIntensity: 7, // sun-disc shader punch (N3rson-style emissive look, procedural — see createSunMaterial)
  showOrbitLines: true,
  showLabels: true,
  showAsteroids: false,
  showBloom: true,
  showOutlines: true,
  showSkybox: true
};

export const BODY_STYLE = {
  earth:   { tex:'earth',   tint:0xa8b8cc, spin:0.10,   tilt:0.4084, dist:1.35 },
  moon:    { tex:'moon',    tint:0xc9d2dc, spin:0.05,   dist:0.50 },
  mars:    { tex:'mars',    tint:0xb8a89c, spin:0.0972, tilt:0.4398, dist:0.80 },
  bennu:   { spin:0.25,     dist:0.40 },
  jupiter: { tex:'jupiter', tint:0xcbb894, spin:0.2411, tilt:0.0541, dist:0 },
  europa:  { tex:'europa',  tint:0xf2ede4, spin:0.05,   tilt:-0.05, dist:0.45 },
  io:      { tex:'io',      tint:0xf7df97, spin:0.06,   tilt:0.00,  dist:0.40 },
  ganymede:{ tex:'ganymede',tint:0xd2c6b4, spin:0.04,   tilt:0.01,  dist:0.55 },
  callisto:{ tex:'callisto',tint:0xa5998a, spin:0.03,   tilt:0.02,  dist:0.55 },
  mercury: { tex:'mercury', tint:0xb0a294, spin:0.0017, tilt:0.0006 },
  venus:   { tex:'venus',   tint:0xd8b48f, spin:-0.0004, tilt:3.0960 },
  saturn:  { tex:'saturn',  tint:0xd8c2a0, spin:0.2245, tilt:0.4660 },
  uranus:  { tex:'uranus', tint:0x9fd4d8, spin:-0.1388, tilt:1.7069 },
  neptune: { tex:'neptune', tint:0x7fa8d8, spin:0.1485, tilt:0.4940 },
  pluto:   { tex:'pluto',   tint:0xc8b8a8, spin:-0.0156, tilt:2.0857, dist:0.45 },
  phobos:  { tex:'phobos',  tint:0x888078, spin:0.08, dist:0.20 },
  deimos:  { tex:'deimos',  tint:0x8a857c, spin:0.05, dist:0.20 }
};

/* Planet surface maps: Earth stays on its vetted SSS-derived set (see note
   below); mercury/venus/mars/jupiter/saturn/uranus/neptune load the vendored
   Solar System Scope 8K/2K maps in models/8K_textures (CC BY 4.0,
   solarsystemscope.com/textures — same source as the Earth SSS set, surface
   appearance only, no ephemeris/lighting/gameplay effect). Moon runs the 8K
   map (8192×4096, ~170 MB with mips — needs a ≥1 GB GPU; WAC mosaic retained
   in assets/ as the low-end fallback). Sun stays procedural, rings stay stays procedural, rings stay
   procedural from real radii, sky stays Hipparcos. See ASSET_SOURCES.md. */
/* Earth surface extras. Solar System Scope 2D textures, CC BY 4.0
   (solarsystemscope.com/textures). Non-NASA, unlike the rest of this map set:
   see assets/ASSET_SOURCES.md + SOURCES.md §7 for the full attribution.
   - earthRough gives land/sea material contrast only. It is remapped matte on
     purpose (sea 0.55) so the ocean does not mirror the Sun — a near-mirror sea
     reflects a hard bright disc and reads as plastic. See createEarthMaterial.
   - earthSpecularSSS is kept for provenance/verification only (see ASSET_SOURCES).
   Data maps must stay linear: loaded through dataTex(), never tex(). */
export const BODY_TEX = {
  earth:           'assets/textures/earth_day_sss.jpg',
  earthNight:      'assets/textures/earth_night_sss.jpg',
  earthClouds:     'assets/textures/earth_clouds_sss.png',
  earthRough:      'assets/textures/earth_roughness_sss.jpg',
  moon:            'models/8K_textures/8k_moon.png',
  mars:            'models/8K_textures/8k_mars.jpg',
  mercury:         'models/8K_textures/8k_mercury.jpg',
  venus:           'models/8K_textures/venus/8k_venus_surface.jpg',
  jupiter:         'models/8K_textures/8k_jupiter.jpg',
  io:              'assets/textures/io.jpg',
  europa:          'assets/textures/europa.jpg',
  ganymede:        'assets/textures/ganymede.jpg',
  callisto:        'assets/textures/callisto.jpg',
  saturn:          'models/8K_textures/saturn/8k_saturn.jpg',
  saturnRing:      'models/8K_textures/saturn/8k_saturn_ring_alpha.png',
  uranus:          'models/8K_textures/2k_uranus.jpg',
  neptune:         'models/8K_textures/2k_neptune.jpg',
  pluto:           'assets/textures/pluto.jpg',
  phobos:          'assets/textures/phobos.jpg',
  deimos:          'assets/textures/deimos.jpg',
  hipparcos:       'assets/textures/stars_8k.jpg'
};

/* Educational and physical planet data from N3rson/Solar-System-3D */
export const PLANET_DATA = {
  sun: { name:'Sun', radius:'695,700 km', tilt:'7.25°', rotation:'27 Earth days', orbit:'230 million years', distance:'0 km', moons:'8 planets, 5 dwarf planets', info:'The star at the center of our Solar System, comprising 99.86% of the system\'s mass.' },
  mercury: { name:'Mercury', radius:'2,439.7 km', tilt:'0.034°', rotation:'58.6 Earth days', orbit:'88 Earth days', distance:'57.9 million km (0.39 AU)', moons:'0', info:'The smallest planet in our solar system and nearest to the Sun. Extreme temperature swings from -180°C to 430°C.' },
  venus: { name:'Venus', radius:'6,051.8 km', tilt:'177.4°', rotation:'243 Earth days', orbit:'225 Earth days', distance:'108.2 million km (0.72 AU)', moons:'0', info:'Second planet from the Sun, known for its runaway greenhouse effect, crushing atmospheric pressure, and sulfuric acid clouds.' },
  earth: { name:'Earth', radius:'6,371.0 km', tilt:'23.44°', rotation:'23h 56m', orbit:'365.25 days', distance:'149.6 million km (1.00 AU)', moons:'1 (The Moon)', info:'Third planet from the Sun and the only astronomical body confirmed to harbor life, with liquid oceans covering 71% of its surface.' },
  moon: { name:'Moon', radius:'1,737.4 km', tilt:'1.54°', rotation:'27.3 Earth days', orbit:'27.3 Earth days', distance:'384,400 km from Earth', moons:'0', info:'Earth\'s natural satellite, tidally locked with highlands, basaltic maria, and water ice in permanently shadowed polar craters.' },
  mars: { name:'Mars', radius:'3,389.5 km', tilt:'25.19°', rotation:'24h 37m', orbit:'687 Earth days', distance:'227.9 million km (1.52 AU)', moons:'2 (Phobos & Deimos)', info:'The Red Planet, host to Olympus Mons, the largest volcano in the Solar System, and ancient river delta deposits.' },
  phobos: { name:'Phobos', radius:'11.08 km', tilt:'1.09°', rotation:'7.65 hours', orbit:'7.65 hours', distance:'9,376 km from Mars', moons:'0', info:'The inner and larger moon of Mars, orbiting only 6,000 km above the Martian surface and spiraling inward toward tidal disruption.' },
  deimos: { name:'Deimos', radius:'6.2 km', tilt:'1.79°', rotation:'30.3 hours', orbit:'30.3 hours', distance:'23,463 km from Mars', moons:'0', info:'The outer Martian moon, covered in a thick blanket of regolith that gives it an unusually smooth appearance.' },
  jupiter: { name:'Jupiter', radius:'69,911 km', tilt:'3.13°', rotation:'9h 55m', orbit:'11.86 Earth years', distance:'778.5 million km (5.20 AU)', moons:'95 known (Io, Europa, Ganymede, Callisto)', info:'The largest planet in our solar system, with a mass greater than all other planets combined, famous for the Great Red Spot storm.' },
  io: { name:'Io', radius:'1,821.49 km', tilt:'0°', rotation:'42.5 hours', orbit:'42.5 hours', distance:'421,700 km from Jupiter', moons:'0', info:'The most geologically active object in the Solar System, with hundreds of sulfurous volcanic plumes driven by tidal friction.' },
  europa: { name:'Europa', radius:'1,560.8 km', tilt:'0.1°', rotation:'3.55 Earth days', orbit:'3.55 Earth days', distance:'670,900 km from Jupiter', moons:'0', info:'Encased in an ice shell hiding a warm, salty subsurface ocean with more liquid water than all of Earth\'s oceans.' },
  ganymede: { name:'Ganymede', radius:'2,631.20 km', tilt:'0.2°', rotation:'7.15 Earth days', orbit:'7.15 Earth days', distance:'1,070,400 km from Jupiter', moons:'0', info:'The largest moon in the Solar System (larger than Mercury), possessing an internal liquid metallic core generating its own magnetic field.' },
  callisto: { name:'Callisto', radius:'2,410.3 km', tilt:'0.2°', rotation:'16.7 Earth days', orbit:'16.7 Earth days', distance:'1,882,700 km from Jupiter', moons:'0', info:'The third largest moon in the Solar System, heavily battered and scarred by billions of years of impact craters.' },
  saturn: { name:'Saturn', radius:'58,232 km', tilt:'26.73°', rotation:'10h 33m', orbit:'29.45 Earth years', distance:'1.43 billion km (9.58 AU)', moons:'146 known (Titan, Enceladus)', info:'A gas giant famous for its spectacular, highly reflective planetary ring system extending up to 282,000 km across.' },
  uranus: { name:'Uranus', radius:'25,362 km', tilt:'97.77°', rotation:'17h 14m (retrograde)', orbit:'84.0 Earth years', distance:'2.87 billion km (19.2 AU)', moons:'28 known', info:'An ice giant composed of water, ammonia, and methane ices, rotating on its side with an axial tilt of nearly 98 degrees.' },
  neptune: { name:'Neptune', radius:'24,622 km', tilt:'28.32°', rotation:'16h 06m', orbit:'164.8 Earth years', distance:'4.50 billion km (30.1 AU)', moons:'16 known (Triton)', info:'The outermost known major planet, a deep blue ice giant swept by supersonic winds that can exceed 2,100 km/h.' },
  pluto: { name:'Pluto', radius:'1,188.3 km', tilt:'122.53°', rotation:'6.39 Earth days', orbit:'248.0 Earth years', distance:'5.91 billion km (39.5 AU)', moons:'5 (Charon, Styx, Nix, Kerberos, Hydra)', info:'A complex dwarf planet in the Kuiper Belt with nitrogen ice glaciers, water-ice peaks, and a thin, hazy blue atmosphere.' },
  bennu: { name:'101955 Bennu', radius:'0.246 km', tilt:'177.6°', rotation:'4.3 hours', orbit:'1.2 Earth years', distance:'168 million km (1.13 AU)', moons:'0', info:'A carbonaceous near-Earth rubble-pile asteroid sampled by NASA\'s OSIRIS-REx spacecraft in 2020.' }
};

const TEX_CACHE={}; const BENNU_MODEL={}; export const BENNU_PHYSICAL_TAG='physical';

/* Bennu V1.1 is vendored as a self-contained GLB. Center its scene and
   normalize its bounding radius to the same unit sphere used by the former OBJ
   path, so physical and presentation framing stay unchanged. */
export function bennuModel(tag){
  const key=tag||'present'; if(BENNU_MODEL[key]) return BENNU_MODEL[key];
  const targetR=key===BENNU_PHYSICAL_TAG?1:radiusOf('bennu');
  BENNU_MODEL[key]=new Promise((resolve,reject)=>{
    new GLTFLoader().load('models/nasa/Bennu_1_1.glb',(gltf)=>{
      try{
        const root=gltf.scene; root.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(root);
        if(box.isEmpty()) throw new Error('bennu glb empty');
        const center=box.getCenter(new THREE.Vector3());
        const size=box.getSize(new THREE.Vector3());
        const radius=Math.max(size.x,size.y,size.z)*0.5;
        if(!(radius>0)) throw new Error('bennu glb invalid bounds');
        root.position.sub(center);
        root.scale.setScalar(targetR/radius);
        root.traverse((o)=>{
          if(o.isMesh){
            o.castShadow=false; o.receiveShadow=false; o.frustumCulled=false;
            o.visible=true;
            const mats=Array.isArray(o.material)?o.material:[o.material];
            o.material=mats.filter(Boolean).map((src)=>{
              const mat=src.clone();
              /* Preserve the embedded Bennu map, but never inherit its 0.5
                 metallic factor: a metal asteroid with no environment map is
                 almost black under the scene rig and reads as missing geometry. */
              mat.color.setHex(0x8a7b6f);
              mat.metalness=0;
              mat.roughness=0.95;
              mat.side=THREE.FrontSide;
              mat.displacementMap=null;
              mat.depthTest=true;
              mat.depthWrite=true;
              mat.needsUpdate=true;
              return mat;
            });
            if(o.material.length===1) o.material=o.material[0];
            o.userData.bodyKey='bennu';
            o.userData.renderRadius=targetR;
          }
        });
        root.userData.bodyKey='bennu';
        root.userData.renderRadius=targetR;
        resolve(root);
      }catch(e){ reject(e); }
    },undefined,reject);
  }).catch((e)=>{ delete BENNU_MODEL[key]; throw e; });
  return BENNU_MODEL[key];
}

export function tex(key){
  if(!BODY_TEX[key]) return null;
  if(!TEX_CACHE[key]){
    TEX_CACHE[key]=new THREE.TextureLoader().load(BODY_TEX[key], undefined, undefined, ()=>{
      try{ console.warn('[orrery] texture failed:', BODY_TEX[key]); }catch(e){}
    });
    TEX_CACHE[key].colorSpace=THREE.SRGBColorSpace;
    TEX_CACHE[key].anisotropy=8; // grazing-angle sharpness (free with mipmaps; max useful ~16)
  }
  return TEX_CACHE[key];
}

/* Linear (non-sRGB) loader for DATA maps — roughness/metalness/normal masks.
   These carry values, not colour: running them through tex() would apply an
   sRGB transfer curve and skew every mask toward the bright end. */
const DATA_CACHE={};
export function dataTex(key){
  if(!BODY_TEX[key]) return null;
  if(!DATA_CACHE[key]){
    const t=new THREE.TextureLoader().load(BODY_TEX[key], undefined, undefined, ()=>{
      try{ console.warn('[orrery] data texture failed:', BODY_TEX[key]); }catch(e){}
    });
    t.colorSpace=THREE.NoColorSpace;
    t.anisotropy=8;
    DATA_CACHE[key]=t;
  }
  return DATA_CACHE[key];
}

/* B-V → RGB bins (shared with js/launch-view.js star field — single
   implementation, imported there). */
export function bvColor(bv,out){
  let r,g,b;
  if(bv<0.0){r=0.72;g=0.83;b=1.00;}
  else if(bv<0.4){r=0.87;g=0.91;b=1.00;}
  else if(bv<0.8){r=1.00;g=0.96;b=0.88;}
  else if(bv<1.2){r=1.00;g=0.86;b=0.70;}
  else if(bv<1.6){r=1.00;g=0.74;b=0.54;}
  else {r=1.00;g=0.62;b=0.45;}
  out[0]=r; out[1]=g; out[2]=b;
}

export function buildStars(){
  const n=STAR_VEC.length,R=60;
  const pos=new Float32Array(n*3), col=new Float32Array(n*3), siz=new Float32Array(n);
  const t=[0,0,0];
  for(let i=0;i<n;i++){
    const v=STAR_VEC[i], m=STAR_MAG[i];
    pos[i*3]=v[0]*R; pos[i*3+1]=v[1]*R; pos[i*3+2]=v[2]*R;
    bvColor(STAR_BV[i],t);
    const bright=Math.min(1.6,Math.max(0.35,1.6-0.22*m));
    col[i*3]=t[0]*bright; col[i*3+1]=t[1]*bright; col[i*3+2]=t[2]*bright;
    siz[i]=Math.max(1.2,4.0*Math.pow(10,-0.2*m));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('aColor',new THREE.BufferAttribute(col,3));
  g.setAttribute('aSize',new THREE.BufferAttribute(siz,1));
  const mat=new THREE.ShaderMaterial({
    uniforms:{pr:{value:1},uBoost:{value:1}},
    vertexShader:'attribute vec3 aColor; attribute float aSize; uniform float pr; varying vec3 vC; void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*pr; gl_Position=projectionMatrix*mv; }',
    fragmentShader:'uniform float uBoost; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.06,d); gl_FragColor=vec4(vC*uBoost,1.0)*a; }',
    transparent:true,
    depthWrite:false
  });
  return {points:new THREE.Points(g,mat), mat};
}

/* Real sky: NASA Hipparcos star map (equirectangular) as the backdrop.
   Point catalog stars (HYG/Hipparcos vectors) are drawn over it. */
export function loadSpaceSkybox(){
  try{
    const t=tex('hipparcos');
    if(t){ t.mapping=THREE.EquirectangularReflectionMapping; return t; }
    return null;
  }catch(e){ return null; }
}

export function todayDays(){
  try{ const A=AZ(); if(A){ const d=A.tdbDays(Date.now()); if(isFinite(d)) return d; } }catch(e){}
  const n=new Date(); const jan1=Date.UTC(n.getUTCFullYear(),0,1,12,0,0);
  return (n.getTime()-jan1)/864e5+(n.getUTCFullYear()-2000)*365.25;
}

export function simDaysToJd(simDays){ return J2000_JD+simDays; }
export function helioKm(key,simDays){ const A=AZ(); if(!A) return null; const s=A.getHeliocentricState(key,simDaysToJd(simDays)); if(!s.ok) return null; return {pos:s.pos.slice(),vel:s.vel.slice(),provider:s.provider,status:s.status}; }
export function renderRelative(bodyKm,originKm,scale){ const s=scale===undefined?UNITS_PER_KM:scale; const ox=originKm?originKm[0]:0, oy=originKm?originKm[1]:0, oz=originKm?originKm[2]:0; return [(bodyKm[0]-ox)*s,(bodyKm[1]-oy)*s,(bodyKm[2]-oz)*s]; }
export function getOriginKm(focusKey,simDays){
  if(!focusKey) return [0,0,0];
  const hk=helioKm(focusKey,simDays);
  if(hk&&hk.pos) return hk.pos.slice();
  if(focusKey==='moon'){ const p=helioKm('earth',simDays); return p?p.pos.slice():[0,0,0]; }
  if(focusKey==='europa'||focusKey==='io'||focusKey==='ganymede'||focusKey==='callisto'){ const p=helioKm('jupiter',simDays); return p?p.pos.slice():[0,0,0]; }
  if(focusKey==='phobos'||focusKey==='deimos'){ const p=helioKm('mars',simDays); return p?p.pos.slice():[0,0,0]; }
  return [0,0,0];
}

let _accLogged=false;
export function logAccuracyReport(){
  if(_accLogged) return; _accLogged=true;
  try{
    ensurePhysicalModeFromURL();
    const A=AZ();
    console.info(sanityLines().join('\n'));
    if(A) console.info(A.diagnostics()); else console.info('[orrery] Astronomy core MISSING');
    const mode=getAstronomyMode();
    console.info('[orrery] Astronomy mode: '+mode);
    console.info('[orrery] UNITS_PER_KM='+UNITS_PER_KM.toExponential(10)+' WORLD_PER_AU='+WORLD_PER_AU);
    console.info('[orrery] physical Earth='+(radiusKmTrue('earth')*UNITS_PER_KM).toExponential(6)+'u presentation Earth='+radiusOf('earth').toFixed(5)+'u Sun capped '+radiusOf('sun')+'u true '+(R_SUN_KM*UNITS_PER_KM).toFixed(6)+'u');
    const fails=validateScales();
    console.info('[orrery] validation: '+(fails.length?'FAIL '+JSON.stringify(fails):'PASS'));
    runScaleRegression(todayDays());
  }catch(e){ console.warn('[orrery] logAccuracyReport failed',e); }
}

export function runScaleRegression(simDays){
  try{
    const u=UNITS_PER_KM;
    const earthKm=radiusKmTrue('earth'), venusKm=radiusKmTrue('venus');
    const earthRender=earthKm*u, venusRender=venusKm*u;
    const ePos=helioKm('earth',simDays), vPos=helioKm('venus',simDays);
    let authDistKm=NaN, renderedDist=NaN, expectedRendered=NaN;
    if(ePos&&vPos){
      const dx=ePos.pos[0]-vPos.pos[0], dy=ePos.pos[1]-vPos.pos[1], dz=ePos.pos[2]-vPos.pos[2];
      authDistKm=Math.hypot(dx,dy,dz);
      const ew=bodyWorldPhysical('earth',new THREE.Vector3(),simDays,[0,0,0],u);
      const vw=bodyWorldPhysical('venus',new THREE.Vector3(),simDays,[0,0,0],u);
      if(!ew||!vw){ console.info('[orrery][REGRESSION] unavailable state — cannot verify'); return {pass:false,reason:'unavailable'}; }
      renderedDist=ew.distanceTo(vw);
      expectedRendered=authDistKm*u;
    }
    const scalePos=renderedDist/authDistKm, scaleRad=earthRender/earthKm;
    console.info('[orrery][REGRESSION] Earth phys '+earthKm+'km -> '+earthRender.toExponential(8)+'u (expect ~5.7e-05)');
    console.info('[orrery][REGRESSION] Venus phys '+venusKm+'km -> '+venusRender.toExponential(8)+'u');
    console.info('[orrery][REGRESSION] Earth-Venus auth '+authDistKm+'km rendered '+renderedDist+' expected '+expectedRendered);
    console.info('[orrery][REGRESSION] scalePos '+scalePos+' scaleRad '+scaleRad+' PASS='+(Math.abs(scalePos-scaleRad)<1e-9));
    return {pass:Math.abs(scalePos-scaleRad)<1e-9};
  }catch(e){ console.warn('[orrery] regression failed',e); return null; }
}

export function providerOf(key,simDays){
  const A=AZ(); if(!A) return 'NONE';
  try{ const s=A.getHeliocentricState(key,simDaysToJd(simDays)); return s.provider||'NONE'; }catch(e){ return 'NONE'; }
}

/* Explicit data-availability status (spec §32). null = Astronomy missing. */
export function statusOf(key,simDays){
  const A=AZ(); if(!A) return null;
  try{ const s=A.getHeliocentricState(key,simDaysToJd(simDays)); return s.status||(s.ok?'OK':'UNAVAILABLE'); }catch(e){ return 'UNAVAILABLE'; }
}

const _hv=[0,0,0];
export function helioAu(key,simDays){
  const A=AZ(); if(!A) return null;
  const jd=simDaysToJd(simDays); A.update(jd);
  const h=A.cache.helio[key]; if(!h||!h.ok) return null; // explicit unavailable — never a fake origin vector
  A.toWorld(h.pos[0],h.pos[1],h.pos[2],_hv);
  const k=UNITS_PER_KM;
  return new THREE.Vector3(_hv[0]*k,_hv[1]*k,_hv[2]*k);
}

const _pw=new THREE.Vector3(); // analytic-moon parent scratch (no per-frame allocation)
export function bodyWorldPhysical(key,out,simDays,originKm,unitsPerKm){
  const A=AZ(); if(!A) return null;
  const u=unitsPerKm!==undefined?unitsPerKm:UNITS_PER_KM;
  /* Phobos/Deimos have no vendored ephemeris (spec §7 gap — getHeliocentric
     State fails closed for them): analytic circle at the TRUE semi-major
     axis around the parent in the SAME (possibly floating) frame, real period
     and phase. The yOff tilt stays presentation-only. */
  if(key==='phobos'||key==='deimos'){
    const M=key==='phobos'?MOONS.phobos:MOONS.deimos;
    if(!bodyWorldPhysical(M.parent,_pw,simDays,originKm,u)) return null;
    const period=MOONS[key].orbitalPeriodD;
    const phase=key==='phobos'?0:0.4;
    const a=2*Math.PI*(((simDays/period)+phase)%1);
    const R=M.smaKm*u;
    return out.copy(_pw).add(new THREE.Vector3(Math.cos(a)*R,0,Math.sin(a)*R));
  }
  const jd=simDaysToJd(simDays); const s=A.getHeliocentricState(key,jd);
  if(!s.ok) return null; // explicit unavailable — never snap to origin
  const ox=originKm?originKm[0]:0, oy=originKm?originKm[1]:0, oz=originKm?originKm[2]:0;
  A.toWorld(s.pos[0]-ox,s.pos[1]-oy,s.pos[2]-oz,_hv);
  return out.set(_hv[0]*u,_hv[1]*u,_hv[2]*u);
}

export function helioDistKm(key,simDays){
  const A=AZ(); if(!A) return NaN;
  const s=A.getHeliocentricState(key,simDaysToJd(simDays));
  if(!s.ok) return NaN;
  return Math.hypot(s.pos[0],s.pos[1],s.pos[2]);
}

const _bw=new THREE.Vector3();
const _md=new THREE.Vector3(); // scratch for presentation moon-direction mapping
/* Presentation moon placement: TRUE ephemeris direction at a READABILITY
   distance. The true scaled offset (e.g. Moon 0.0035u) sits inside the
   enlarged parent mesh (Earth 0.0144u), so direction is physical while the
   orbital radius stays a presentation choice (MOON_ORBIT_R etc.). Physical
   mode (?phys=1) bypasses this entirely via bodyWorldPhysical. */
function moonWorldPresentation(key,parentKey,out,simDays,orbitR,yOff){
  if(!moonWorldPhysical(key,parentKey,out,simDays,0)) return null;
  bodyWorld(parentKey,_bw,simDays);
  _md.copy(out).sub(_bw);
  if(_md.lengthSq()<1e-24) return null; // degenerate — caller uses analytic fallback
  _md.normalize();
  out.copy(_bw).addScaledVector(_md,orbitR);
  if(yOff) out.y+=yOff;
  return out;
}
/* Moon placement via the authoritative provider (spec §7): parent-relative
   JPL state from the per-tick cache, mapped into the same Y-up display frame
   as helioAu. yOff is PRESENTATION readability (orbits would overlap edge-on
   without it) and never feeds physics. Returns null when no state is
   obtainable — the caller then uses the flagged analytic-circle fallback. */
export function moonWorldPhysical(key,parentKey,out,simDays,yOff){
  const A=AZ(); if(!A) return null;
  try{
    const jd=simDaysToJd(simDays); A.update(jd);
    const c=A.cache.states[key], p=A.cache.states[parentKey];
    if(!c||!p||!c.ok||!p.ok) return null;
    bodyWorld(parentKey,_bw,simDays);
    A.toWorld(c.pos[0]-p.pos[0],c.pos[1]-p.pos[1],c.pos[2]-p.pos[2],_hv);
    const k=UNITS_PER_KM;
    return out.copy(_bw).add(new THREE.Vector3(_hv[0]*k,yOff||0,_hv[2]*k));
  }catch(e){ return null; }
}
/* Which placement path bodyWorld will use for a moon: "physical" or
   "analytic-fallback" (synthetic phase — visual only, never mission truth). */
export function moonPathOf(key,parentKey,simDays){
  const A=AZ(); if(!A) return 'analytic-fallback';
  try{
    const jd=simDaysToJd(simDays); A.update(jd);
    const c=A.cache.states[key], p=A.cache.states[parentKey];
    return (c&&p&&c.ok&&p.ok) ? 'physical' : 'analytic-fallback';
  }catch(e){ return 'analytic-fallback'; }
}
export function bodyWorld(key,out,simDays){
  if(key==='moon'){
    if(moonWorldPresentation(key,'earth',out,simDays,MOON_ORBIT_R,0)) return out;
    // DEGRADED visual fallback: analytic circle, synthetic phase (PRESENTATION only)
    bodyWorld('earth',_bw,simDays);
    const a=2*Math.PI*(((simDays-NEW_MOON_J2000)/MOON_PERIOD)%1);
    return out.copy(_bw).add(new THREE.Vector3(Math.cos(a)*MOON_ORBIT_R,0,Math.sin(a)*MOON_ORBIT_R));
  }
  if(key==='io'){
    if(moonWorldPresentation(key,'jupiter',out,simDays,IO_ORBIT_R,0.05)) return out;
    // DEGRADED visual fallback: analytic circle, synthetic phase (PRESENTATION only)
    bodyWorld('jupiter',_bw,simDays);
    const a=2*Math.PI*((simDays/IO_PERIOD)%1);
    return out.copy(_bw).add(new THREE.Vector3(Math.cos(a)*IO_ORBIT_R,0.05,Math.sin(a)*IO_ORBIT_R));
  }
  if(key==='europa'){
    if(moonWorldPresentation(key,'jupiter',out,simDays,EUROPA_ORBIT_R,0.15)) return out;
    // DEGRADED visual fallback: analytic circle, synthetic phase (PRESENTATION only)
    bodyWorld('jupiter',_bw,simDays);
    const a=2*Math.PI*((simDays/EUROPA_PERIOD+0.3)%1);
    return out.copy(_bw).add(new THREE.Vector3(Math.cos(a)*EUROPA_ORBIT_R,0.15,Math.sin(a)*EUROPA_ORBIT_R));
  }
  if(key==='ganymede'){
    if(moonWorldPresentation(key,'jupiter',out,simDays,GANYMEDE_ORBIT_R,0.10)) return out;
    // DEGRADED visual fallback: analytic circle, synthetic phase (PRESENTATION only)
    bodyWorld('jupiter',_bw,simDays);
    const a=2*Math.PI*((simDays/GANYMEDE_PERIOD+0.6)%1);
    return out.copy(_bw).add(new THREE.Vector3(Math.cos(a)*GANYMEDE_ORBIT_R,0.10,Math.sin(a)*GANYMEDE_ORBIT_R));
  }
  if(key==='callisto'){
    if(moonWorldPresentation(key,'jupiter',out,simDays,CALLISTO_ORBIT_R,-0.08)) return out;
    // DEGRADED visual fallback: analytic circle, synthetic phase (PRESENTATION only)
    bodyWorld('jupiter',_bw,simDays);
    const a=2*Math.PI*((simDays/CALLISTO_PERIOD+0.1)%1);
    return out.copy(_bw).add(new THREE.Vector3(Math.cos(a)*CALLISTO_ORBIT_R,-0.08,Math.sin(a)*CALLISTO_ORBIT_R));
  }
  if(key==='phobos'){
    // No JPL ephemeris vendored (spec §7 gap): analytic circle until the
    // satellite-ephemeris phase vendors MAR099-family states. PRESENTATION only.
    bodyWorld('mars',_bw,simDays);
    const a=2*Math.PI*((simDays/PHOBOS_PERIOD)%1);
    return out.copy(_bw).add(new THREE.Vector3(Math.cos(a)*PHOBOS_ORBIT_R,0.02*Math.sin(a),Math.sin(a)*PHOBOS_ORBIT_R));
  }
  if(key==='deimos'){
    // No JPL ephemeris vendored (spec §7 gap): analytic circle until the
    // satellite-ephemeris phase vendors MAR099-family states. PRESENTATION only.
    bodyWorld('mars',_bw,simDays);
    const a=2*Math.PI*((simDays/DEIMOS_PERIOD+0.4)%1);
    return out.copy(_bw).add(new THREE.Vector3(Math.cos(a)*DEIMOS_ORBIT_R,-0.03*Math.sin(a),Math.sin(a)*DEIMOS_ORBIT_R));
  }
  return out.copy(helioAu(key,simDays) || out); // unavailable: keep caller's vector, never invent a position
}

export function bodyWorldUnified(key,out,simDays,opts){
  opts=opts||{};
  const phys=!!opts.physical||isPhysicalMode();
  const u=opts.unitsPerKm!==undefined?opts.unitsPerKm:UNITS_PER_KM;
  const originKm=opts.originKm||(opts.focusKey?getOriginKm(opts.focusKey,simDays):[0,0,0]);
  if(phys) return bodyWorldPhysical(key,out,simDays,originKm,u);
  return bodyWorld(key,out,simDays);
}

export function bodyPoleWorld(key,out){
  const obl=(OBLIQUITY_DEG[key]!==undefined?OBLIQUITY_DEG[key]:0)*Math.PI/180;
  out.set(Math.sin(obl),Math.cos(obl),0);
  return out;
}

export function sampleOrbitLine(key,jd0,jd1,n,out){
  const A=AZ(); out=out||[]; out.length=0; if(!A) return out;
  const k=UNITS_PER_KM;
  const buf=A.sampleTrajectory(key,jd0,jd1,n,'SUN');
  for(let i=0;i<n;i++){
    A.toWorld(buf[i*6],buf[i*6+1],buf[i*6+2],_hv);
    out.push(new THREE.Vector3(_hv[0]*k,_hv[1]*k,_hv[2]*k));
  }
  return out;
}

/* Depth precision for true-scale tiny bodies. Bennu radius is ~2.22e-9 world
   units; a 1e-8 near floor clipped its entire surface even at the old r×4.5
   standoff. The camera floor below must remain comfortably above this value. */
export const PHYSICAL_NEAR_FLOOR = 1e-10;
export const PHYSICAL_CAMERA_FLOOR = 3e-8;
export function nearForProximity(prox){
  const p = (!isFinite(prox) || prox < 0) ? 0 : prox;
  return Math.max(PHYSICAL_NEAR_FLOOR, Math.min(0.01, p * 0.5));
}

export function frameDist(key,unitsPerKm){
  const u=unitsPerKm||UNITS_PER_KM;
  if(isPhysicalMode()){
    const r=radiusKmTrue(key)*u;
    return Math.max(1e-9,r*8);
  }
  return Math.max(0.45,((BODY_STYLE[key]||{}).dist||1));
}

/* Per-focus camera floor from TRUE radii (verified data, not tuning): keeps
   the eye outside the disc plus its shells (≤1.2%) and label lift. Focus
   framing (frameDist r*8, click-fly r*4.5) always lands well outside it, so
   the clamp only bites on manual zoom — the eye can never enter a planet.
   Presentation keeps its legacy global clamp (BODY_STYLE-era feel). */
export function approachMinDist(key,unitsPerKm){
  const u=unitsPerKm||UNITS_PER_KM;
  const r=radiusKmTrue(key)*u;
  if(!(r>0)||!isFinite(r)) return PHYSICAL_CAMERA_FLOOR;
  return Math.max(r*1.6,PHYSICAL_CAMERA_FLOOR);
}

/* Earth: physical MeshStandardMaterial lit by the real scene sun (decay-2
   point light), extended by shader injection — no custom lighting math:
   - day/night mix from the true sun angle (sun sits at the origin), using
     the verified Blue Marble day + Black Marble night maps;
   - night lights added as EMISSIVE so they glow independent of the fill;
   - real MODIS cloud deck darkens the ground beneath it (same-UV sample;
     the shell rides 1.5% above the surface, so parallax is negligible).
   Responds to eclipses, terminator, and the Mercury-to-Pluto gradient
   exactly like every other body. */
export function createEarthMaterial(sunPosVec){
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex('earth'),
    /* Land/sea material contrast ONLY — deliberately NOT a mirror.
       The white-is-water specular mask is shipped pre-inverted as a roughnessMap,
       remapped to 0.62 (sea) .. 1.00 (land) so the GGX lobe is far too broad to
       resolve the Sun's disc: no reflection is visible, just a slightly less
       matte ocean. An earlier 0.12 floor turned the sea into a near-mirror and
       rendered a hard bright DISC of the Sun in the water, which read as
       plastic/toy rather than photographic.
       All directional lighting (terminator, NdotL gradient, night lights) is a
       separate diffuse term and is unaffected by this map.
       Loaded via dataTex(): a mask is data, not colour, so it must stay out of
       the sRGB transfer curve. Base roughness is 1.0 because three multiplies
       it by the map — anything lower would crush the sea/land contrast. */
    roughness: 1.0,
    roughnessMap: dataTex('earthRough'),
    metalness: 0.0,
    /* Bodies never cull to see-through: from inside (flight transit, guard
       ejection in progress) the interior wall reads dark instead of a
       star-filled hole. Renderer flips backface normals, so lighting stays
       defined. */
    side: THREE.DoubleSide
  });
  mat.userData.nightBoost = { value: 1 }; // driven per-frame: 1/exposure keeps city lights constant
  const nightBoost = mat.userData.nightBoost;
  /* Per-view sunlit-iris trim, NEUTRAL (1) by default so every existing view is
     byte-identical. The ops iris meters off the MISSION TARGET, so on any
     non-Earth mission Earth arrives 7-22x over-exposed and its day map clips to
     flat white. A view that wants Earth's own iris (select-viewer, which meters
     off the focused body) writes this uniform with
     exposureForBody('earth', earthSunDist) / viewExposure, and Earth then lands
     on exactly the same tone as in that view. Day side only (weighted by
     earthDayMix) so the night hemisphere keeps its ambient/emissive balance. */
  mat.userData.dayMeter = { value: 1 };
  const dayMeter = mat.userData.dayMeter;
  /* Live sun position (world). Default = origin = heliocentric views.
     The select view's physical floating origin re-centers the world on the
     focus body, so the sun is NOT at the origin there — the adapter drives
     this uniform per frame via applySunPosition(). */
  mat.userData.sunPos = { value: new THREE.Vector3(0, 0, 0) };
  const sunPosU = mat.userData.sunPos;
  mat.onBeforeCompile = (shader)=>{
    shader.uniforms.nightTex = { value: tex('earthNight') };
    shader.uniforms.cloudTex = { value: tex('earthClouds') };
    shader.uniforms.uNightBoost = nightBoost;
    shader.uniforms.uDayMeter = dayMeter;
    shader.uniforms.sunPos = sunPosU;
    shader.vertexShader = 'varying vec3 vWNormal;\nvarying vec3 vWPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvWNormal = normalize(mat3(modelMatrix) * normal);\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;'
    );
    shader.fragmentShader = ('uniform sampler2D nightTex;\nuniform sampler2D cloudTex;\nuniform float uNightBoost;\nuniform float uDayMeter;\nuniform vec3 sunPos;\nvarying vec3 vWNormal;\nvarying vec3 vWPos;\n' + shader.fragmentShader)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float earthNdl = dot(normalize(vWNormal), normalize(sunPos - vWPos));
  float earthDayMix = smoothstep(-0.06, 0.12, earthNdl);
  /* Display grading: rich ocean blue and land contrast */
  float earthLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(vec3(earthLum), diffuseColor.rgb, 1.12);
  // Soft ground shadow beneath dense clouds on the daylit side
  float earthCloud = texture2D(cloudTex, vMapUv).a;
  diffuseColor.rgb *= (1.0 - earthCloud * 0.28 * earthDayMix);
  // Sunlit-iris trim (uniform is 1.0 everywhere except the ops view — see
  // userData.dayMeter). Day side only; the night hemisphere is untouched.
  diffuseColor.rgb *= mix(1.0, uDayMeter, earthDayMix);
  // On the night side, retain the natural Earth surface map at ~70% albedo so ambient starlight
  // gently reveals continents and oceans without artificial flat emissive blowout
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.70, diffuseColor.rgb, earthDayMix);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // City lights emit warm golden light ONLY on the night side
  vec3 cityLights = texture2D(nightTex, vMapUv).rgb * vec3(1.15, 1.0, 0.82) * 2.2 * uNightBoost;
  totalEmissiveRadiance += cityLights * (1.0 - earthDayMix);`);
  };
  mat.customProgramCacheKey = ()=>'marginEarthPhysical';
  return mat;
}

export function sphereMesh(key,opts){
  opts=opts||{};
  const def=BODY_STYLE[key]||{tint:0xffffff,spin:0.1};
  const phys=!!opts.physical||isPhysicalMode();
  const u=opts.unitsPerKm!==undefined?opts.unitsPerKm:UNITS_PER_KM;
  const r=phys?radiusKmTrue(key)*u:radiusOf(key);

  let mat;
  const dedicatedMarsMoon = key === 'phobos' || key === 'deimos';
  if (dedicatedMarsMoon) {
    /* Keep the verified NASA map visibly stable at true scale. The shared
       physical point-light/shadow path is intentionally not used for these
       sub-pixel moon discs: at this scale it made them disappear/break. */
    mat = new THREE.MeshBasicMaterial({
      map: tex(def.tex),
      color: 0xffffff,
      side: THREE.FrontSide,
      toneMapped: false,
      transparent: false,
      opacity: 1,
      alphaTest: 0,
      depthTest: true,
      depthWrite: true
    });
  } else if (key==='earth'&&opts.sunPos){
    mat = createEarthMaterial(opts.sunPos);
  } else if(def.tex){
    mat = new THREE.MeshStandardMaterial({
      color: def.tint,
      roughness: 0.85,
      metalness: 0.05,
      map: tex(def.tex),
      side: THREE.DoubleSide // bodies never cull to see-through (see Earth note)
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: def.tint,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide // bodies never cull to see-through (see Earth note)
    });
  }

  const geom = key === 'deimos'
    ? new THREE.SphereGeometry(Math.max(1e-9,r), 72, 48)
    : new THREE.SphereGeometry(Math.max(1e-9,r), 56, 40);
  if (key === 'deimos') {
    /* Deimos is a smoother, distinctly non-spherical small body. This
       deterministic visual proxy preserves the mean-radius authority while
       giving the silhouette the mildly flattened/irregular form reported by
       spacecraft imagery. It is not a substitute for a NASA shape mesh. */
    const p = geom.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const theta = Math.atan2(z, x);
      const phi = Math.acos(Math.max(-1, Math.min(1, y / Math.max(r, 1e-12))));
      const warp = 1 + 0.055 * Math.sin(2 * theta) * Math.sin(phi) + 0.025 * Math.cos(3 * theta + 0.6) * Math.sin(phi);
      p.setXYZ(i, x * warp * 0.94, y * (0.88 + 0.03 * Math.sin(3 * theta)), z * warp);
    }
    p.needsUpdate = true;
    geom.computeVertexNormals();
  }
  const m = new THREE.Mesh(geom, mat);
  /* Phobos/Deimos retain the stable dedicated map material above, while the
     physical tiny-body depth safeguards remain enabled below. */
  if (phys && (key === 'phobos' || key === 'deimos')) {
    mat.depthTest = true;
    mat.depthWrite = true;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;
    m.renderOrder = 0;
  }
  if(phys){
    const pole=bodyPoleWorld(key,new THREE.Vector3());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),pole);
  } else if(def.tilt){
    m.rotation.z=def.tilt;
  }
  m.userData.bodyKey = key;
  m.userData.physicalRadiusKm=radiusKmTrue(key);
  m.userData.renderRadius=r;
  m.userData.isPhysical=phys;
  return m;
}

/* Procedural ring bands from REAL radii — no ring texture is published in
   NASA 3D Resources, so bands are drawn on a canvas from RINGS_KM geometry.
   Saturn fractions are measured: C faint 0–0.24, B bright 0.24–0.69,
   Cassini Division gap 0.691–0.768 (117,580–122,170 km of the
   74,658–136,775 km main annulus), A mid 0.77–1.0. */
function ringCanvas(stops){
  const W=512, cv=document.createElement('canvas'); cv.width=W; cv.height=4;
  const x=cv.getContext('2d');
  const g=x.createLinearGradient(0,0,W,0);
  for(const s of stops) g.addColorStop(s[0],s[1]);
  x.fillStyle=g; x.fillRect(0,0,W,4);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}

/* Vendored Saturn ring alpha (SSS 8K set, CC BY 4.0 — appearance only; the
   true inner/outer radii still come from RINGS_KM, and the measured-band
   canvas is kept below as reference/rollback). Cached like tex(). */
let _saturnRingTex = null;
function saturnRingTex(){
  if(!_saturnRingTex){
    _saturnRingTex = new THREE.TextureLoader().load(BODY_TEX.saturnRing, undefined, undefined, ()=>{
      try{ console.warn('[orrery] texture failed:', BODY_TEX.saturnRing); }catch(e){}
    });
    _saturnRingTex.colorSpace = THREE.SRGBColorSpace;
    _saturnRingTex.anisotropy = 8;
  }
  return _saturnRingTex;
}

function ringMesh(innerR, outerR, kind){
  const geom = new THREE.RingGeometry(Math.max(1e-9, innerR), Math.max(1e-9, outerR), 128, 1);
  const uv = geom.attributes.uv, pp = geom.attributes.position;
  for(let i = 0; i < uv.count; i++){
    const r = Math.hypot(pp.getX(i), pp.getY(i));
    uv.setX(i, (r - innerR) / (outerR - innerR));
  }
  /* Saturn now samples the vendored 8K ring-alpha strip (see saturnRingTex);
     the measured-band stops below are retained as reference/rollback.
     Uranus keeps its ten discrete PDS rings (procedural, true positions). */
  const saturnStops=[[0,'rgba(150,140,125,0.22)'],[0.24,'rgba(190,180,165,0.55)'],[0.5,'rgba(218,208,192,0.92)'],[0.685,'rgba(218,208,192,0.92)'],[0.691,'rgba(0,0,0,0)'],[0.768,'rgba(0,0,0,0)'],[0.775,'rgba(188,178,162,0.78)'],[1,'rgba(170,160,150,0.45)']];
  /* Uranus: TEN discrete narrow rings at TRUE radii, not a solid wedge.
     Mid radii km from the PDS Ring-Moon Systems Node vital statistics
     (Nicholson et al. 2018; https://pds-rings.seti.org/uranus/uranus_rings_table.html):
     6:41838 5:42234 4:42571 a:44718 b:45661 eta:47176 g:47627 d:48300
     l:50024 E:51149 mapped over the 1.60–2.02 R_eq drawing span
     (R_eq 25559 km). True widths (1.5–58 km) are sub-pixel everywhere, so
     each line is floored to ~0.006 of span (labeled presentation floor);
     POSITIONS are exact. Epsilon (densest, shepherded) renders brightest.
     Particles are dark (albedo ≤2%), so bands stay dim — honest, not fake. */
  const uranusStops=[[0,'rgba(0,0,0,0)'],
    [0.082,'rgba(0,0,0,0)'],[0.082,'rgba(140,150,150,0.45)'],[0.094,'rgba(140,150,150,0.45)'],[0.094,'rgba(0,0,0,0)'],
    [0.119,'rgba(0,0,0,0)'],[0.119,'rgba(140,150,150,0.45)'],[0.131,'rgba(140,150,150,0.45)'],[0.131,'rgba(0,0,0,0)'],
    [0.150,'rgba(0,0,0,0)'],[0.150,'rgba(140,150,150,0.45)'],[0.162,'rgba(140,150,150,0.45)'],[0.162,'rgba(0,0,0,0)'],
    [0.350,'rgba(0,0,0,0)'],[0.350,'rgba(145,155,155,0.5)'],[0.362,'rgba(145,155,155,0.5)'],[0.362,'rgba(0,0,0,0)'],
    [0.438,'rgba(0,0,0,0)'],[0.438,'rgba(145,155,155,0.5)'],[0.450,'rgba(145,155,155,0.5)'],[0.450,'rgba(0,0,0,0)'],
    [0.579,'rgba(0,0,0,0)'],[0.579,'rgba(145,155,155,0.5)'],[0.591,'rgba(145,155,155,0.5)'],[0.591,'rgba(0,0,0,0)'],
    [0.621,'rgba(0,0,0,0)'],[0.621,'rgba(150,160,160,0.55)'],[0.633,'rgba(150,160,160,0.55)'],[0.633,'rgba(0,0,0,0)'],
    [0.684,'rgba(0,0,0,0)'],[0.684,'rgba(150,160,160,0.55)'],[0.696,'rgba(150,160,160,0.55)'],[0.696,'rgba(0,0,0,0)'],
    [0.844,'rgba(0,0,0,0)'],[0.844,'rgba(150,160,160,0.5)'],[0.857,'rgba(150,160,160,0.5)'],[0.857,'rgba(0,0,0,0)'],
    [0.945,'rgba(0,0,0,0)'],[0.945,'rgba(200,210,210,0.9)'],[0.965,'rgba(200,210,210,0.9)'],[0.965,'rgba(0,0,0,0)'],
    [1,'rgba(0,0,0,0)']];
  const mat = new THREE.MeshStandardMaterial({
    map: kind==='saturn' ? saturnRingTex() : ringCanvas(uranusStops),
    transparent: true,
    side: THREE.DoubleSide,
    roughness: 0.8,
    metalness: 0.1
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.recvOnly = true; // rings take planet-shade, never throw solid alpha-ignorant shadows
  return mesh;
}

/* Real MODIS cloud deck (see assets/ASSET_SOURCES.md): white shell textured
   by the vendored RGBA map — diffuse alpha carries the cloud fraction, so
   the Sun shades it like the surface (bright by day, dark by night). */
export function createClouds(r){
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r*1.012, 56, 40),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex('earthClouds'),
      transparent: true,
      opacity: 0.65,
      roughness: 1.0,
      metalness: 0.0,
      depthWrite: false
    })
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noShadow = true; // clouds never join the shadow rig
  return mesh;
}

/* Scattering-look limb shell (pure rendering, no data claim): blue daylight
   limb fading to a dim night limb, plus a warm terminator band where the sun
   grazes the atmosphere. Sun direction defaults to origin (heliocentric
   views); the select view's physical floating origin drives the sunPos
   uniform per frame via applySunPosition(), so no view is ever hardwired. */
function fresnelShell(r){
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r*1.004,56,40),
    new THREE.ShaderMaterial({
      uniforms:{k:{value:0.7}, sunPos:{value:new THREE.Vector3(0,0,0)}},
      vertexShader:`
        varying vec3 vNv;
        varying vec3 vWp;
        varying vec3 vNw;
        void main(){
          vNv = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWp = wp.xyz;
          vNw = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader:`
        uniform float k;
        uniform vec3 sunPos;
        varying vec3 vNv;
        varying vec3 vWp;
        varying vec3 vNw;
        void main(){
          float rim = pow(1.0 - abs(normalize(vNv).z), 2.2);
          vec3 sunDir = normalize(sunPos - vWp);
          float ndl = dot(normalize(vNw), sunDir);
          float dayAmt = smoothstep(-0.3, 0.5, ndl);
          vec3 dayCol = vec3(0.32, 0.58, 1.0);
          vec3 nightCol = vec3(0.04, 0.08, 0.18);
          float termBand = exp(-pow(ndl / 0.28, 2.0));
          vec3 col = mix(nightCol, dayCol, dayAmt) + vec3(1.0, 0.42, 0.18) * termBand * 0.35;
          gl_FragColor = vec4(col, 1.0) * rim * k;
        }`,
      transparent:true, blending:THREE.AdditiveBlending, depthWrite:false
    })
  );
  mesh.material.userData.sunPos = mesh.material.uniforms.sunPos;
  mesh.userData.noShadow = true; // additive glow shell: never casts/receives
  return mesh;
}

/* Procedural & 3D Asteroid Belt Generator (Main Belt strictly between Mars & Jupiter; Kuiper belt outside Neptune) */
export function buildAsteroidBelt(count, minR, maxR, heightSpread, minScale, maxScale){
  const geom = new THREE.DodecahedronGeometry(1.0, 1);
  const posArr = geom.attributes.position.array;
  /* Slightly perturb vertices for irregular asteroid shape */
  for(let i = 0; i < posArr.length; i += 3){
    posArr[i]   += (Math.random() - 0.5) * 0.22;
    posArr[i+1] += (Math.random() - 0.5) * 0.22;
    posArr[i+2] += (Math.random() - 0.5) * 0.22;
  }
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x887e74,
    roughness: 0.92,
    metalness: 0.08,
    flatShading: true
  });
  const instanced = new THREE.InstancedMesh(geom, mat, count);
  const dummy = new THREE.Object3D();
  for(let i = 0; i < count; i++){
    const rad = minR + Math.random() * (maxR - minR);
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * heightSpread;
    dummy.position.set(Math.cos(angle) * rad, y, Math.sin(angle) * rad);
    const s = minScale + Math.random() * (maxScale - minScale);
    dummy.scale.set(s, s * (0.7 + Math.random() * 0.6), s * (0.8 + Math.random() * 0.5));
    dummy.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }
  instanced.instanceMatrix.needsUpdate = true;
  return instanced;
}

/* Mean heliocentric distances (JPL Keplerian element a, AU) — the honest
   numbers behind the orbit-distance labels. Source: JPL Keplerian Elements
   for Approximate Positions of the Major Planets
   (ssd.jpl.nasa.gov/planets/approx_pos.html) + NSSDC fact sheets. */
export const ORBIT_AU = {
  mercury: 0.38710, venus: 0.72334, earth: 1.00000, mars: 1.52368,
  jupiter: 5.20290, saturn: 9.53668, uranus: 19.1913, neptune: 30.0690,
  pluto: 39.4821
};

export function orbitLabelSprite(name, au, key){
  const km = au * AU_KM;
  const kmTxt = km >= 1e9 ? (km/1e9).toFixed(2)+'B KM' : (km/1e6).toFixed(1)+'M KM';
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
  const x = cv.getContext('2d');
  x.fillStyle = 'rgba(8,15,25,0.66)';
  x.strokeStyle = 'rgba(120,170,220,0.4)'; x.lineWidth = 2;
  x.beginPath();
  if(x.roundRect) x.roundRect(4, 4, 504, 104, 18); else x.rect(4, 4, 504, 104);
  x.fill(); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(200,220,240,0.95)';
  x.font = '600 40px "JetBrains Mono", monospace';
  x.fillText(name.toUpperCase(), 256, 38);
  x.fillStyle = 'rgba(140,190,230,0.9)';
  x.font = '30px "JetBrains Mono", monospace';
  x.fillText(au.toFixed(2) + ' AU · ' + kmTxt, 256, 80);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.9, depthWrite: false }));
  /* Small base size — select-viewer rescales per-frame by camera distance so
     tags hold ~constant screen size (see LABEL_K below). */
  s.scale.set(1.3, 0.28, 1);
  s.userData.baseScale = new THREE.Vector2(1.3, 0.28);
  if(key) s.userData.bodyKey = key;
  return s;
}

/* Orbit-line colors per planet (readability, Solar-Wanderer-style quarters).
   Opacity 0.32: the metered iris crushes fainter lines to black in post. */
export const ORBIT_COLORS = {
  mercury: 0x8a8a8a, venus: 0xc9a06a, earth: 0x4a90d9, mars: 0xd96a4a,
  jupiter: 0xc9a06a, saturn: 0xd9c97a, uranus: 0x7ad9d9, neptune: 0x4a6ad9,
  pluto: 0x9a8aa9
};
export function buildOrbitLine(radius, color, opacity){
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, 2 * Math.PI, false, 0);
  const points = curve.getPoints(120);
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: color || 0x48709e,
    transparent: true,
    opacity: opacity !== undefined ? opacity : 0.32
  });
  const line = new THREE.LineLoop(geom, mat);
  line.rotation.x = Math.PI / 2;
  line.userData.baseColor = new THREE.Color(color || 0x48709e);
  line.userData.baseOpacity = opacity !== undefined ? opacity : 0.32;
  return line;
}

export function buildSolarSystem(scene,isAlive,opts){
  opts=opts||{}; ensurePhysicalModeFromURL();
  const isPhys=!!opts.physical||isPhysicalMode();
  const u=opts.unitsPerKm!==undefined?opts.unitsPerKm:UNITS_PER_KM;
  const focusKey=opts.focusKey||null;
  const originKm=opts.originKm||(focusKey&&isPhys?getOriginKm(focusKey,opts.simDays||todayDays()):[0,0,0]);
  const out={
    bodies:{},
    flareMats:[],
    atmospheres:{},
    orbitLines:new THREE.Group(),
    orbitTags:[],
    asteroidBelts:new THREE.Group(),
    moons:{},
    mode:isPhys?'physical':'presentation',
    unitsPerKm:u,
    sunMat:null,
    sunLight:null,
    corona:null, // sun glow sprite — follows the sun mesh (floating-frame aware)
    sunFollowers:[] // sunPos uniform refs (earth day/night, fresnel limbs)
  };

  /* Sun: procedural granulation shader (see createSunMaterial below) +
     UnrealBloomPass corona. No equirect solar map is published in NASA
     3D Resources (SDO frames are full-disc photos, same quarantine reason
     as Moon.jpg), so no map is draped.
     Physical rig: inverse-square PointLight (decay 2) at the Sun's centre so
     inner planets blaze and outer planets fall off realistically, plus a dim
     cool ambient fill so night sides stay deep but readable. Sun mesh never
     casts (it surrounds the light). */
/* Procedural Sun: animated granulation (fbm noise) + limb darkening in a
   custom shader. No equirect solar map is published in NASA 3D Resources,
   and SDO frames are full-disc photos (quarantine rule), so the surface is
   synthesized as pure rendering — brightness ~uIntensity keeps it above the
   bloom threshold.
   Glow architecture follows N3rson/Solar-System-3D (MIT ©2025 N3rson):
   emissive-style disc + wide-radius UnrealBloom (theirs: strength 1,
   radius 0.9, threshold 1). Adapted, not copied — procedural disc instead
   of sun.jpg, our physical 2480 rig instead of their tuned light, tracked
   thresholds instead of fixed. Their Earth sunPosition-uniform pattern
   independently validates ours below. Textures never vendored. */
function createSunMaterial(){
  return new THREE.ShaderMaterial({
    /* DoubleSide like every other body: never a see-through hole. */
    side: THREE.DoubleSide,
    uniforms:{
      uTime:{ value: 0 },
      uIntensity:{ value: ORRERY_SETTINGS.sunIntensity },
      /* Iris coupling: the disc holds constant post-iris brilliance (~2.5)
         at ANY camera exposure, the way the real Sun always saturates.
         Updated per frame by the viewers; 1.15 = widest exposure. */
      uExposure:{ value: 1.15 }
    },
    vertexShader:`
      varying vec3 vPos;
      varying vec3 vN;
      void main(){
        vPos = position;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader:`
      uniform float uTime;
      uniform float uIntensity;
      uniform float uExposure;
      varying vec3 vPos;
      varying vec3 vN;
      float hash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float vnoise(vec3 p){
        vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1.,0.,0.)),f.x),mix(hash(i+vec3(0.,1.,0.)),hash(i+vec3(1.,1.,0.)),f.x),f.y),
                   mix(mix(hash(i+vec3(0.,0.,1.)),hash(i+vec3(1.,0.,1.)),f.x),mix(hash(i+vec3(0.,1.,1.)),hash(i+vec3(1.,1.,1.)),f.x),f.y),f.z);
      }
      float fbm(vec3 p){ float v = 0.0; float a = 0.5; for(int k=0;k<4;k++){ v += a*vnoise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 p = normalize(vPos)*3.5;
        float g = fbm(p + vec3(0.0, uTime*0.05, 0.0));
        float g2 = fbm(p*2.2 - vec3(uTime*0.03));
        float g3 = fbm(p*4.6 + vec3(uTime*0.02, 0.0, uTime*0.015));
        float granule = smoothstep(0.2, 0.9, g*0.55 + g2*0.3 + g3*0.15);
        vec3 hot = vec3(1.0, 0.94, 0.8);
        vec3 mid = vec3(1.0, 0.6, 0.26);
        vec3 dark = vec3(0.78, 0.27, 0.06);
        vec3 col = mix(dark, mix(mid, hot, granule), 0.3 + 0.7*granule);
        float mu = abs(normalize(vN).z);
        col *= 0.45 + 0.55*pow(mu, 0.55);
        /* Sun surface brightness sits orders of magnitude above sunlit rock
           (same as reality, compressed): the uExposure coupling holds it at
           constant post-iris brilliance so the disc stays brilliant and
           drives the bloom even when the camera iris stops down for a
           planet close-up. */
        gl_FragColor = vec4(col*uIntensity*(0.55/uExposure), 1.0);
      }
    `
  });
}

function sunMesh(isPhys, u){
  const sunR=isPhys?R_SUN_KM*u:radiusOf('sun');
  const sunMat = createSunMaterial();
  const sun = new THREE.Mesh(new THREE.SphereGeometry(Math.max(1e-9,sunR), 48, 36), sunMat);
  sun.userData.renderRadius=sunR;
  sun.userData.bodyKey = 'sun';
  return { sun, sunMat };
}

/* Procedural corona halo (pure rendering, no data claim): canvas radial
   gradient on an additive sprite — hot white core, warm wash, long tail.
   Multiplier is 5x the disc in presentation but 22x at true scale, where the
   real disc is sub-pixel and a 5x glow would be invisible at planetary range;
   the DISC stays exact, only the declared-artistic glow is widened. Gives the
   sun its halo at any exposure with or without the post chain (brief/ops/
   title render direct), complementing (never replacing) the bloom pass.
   Depth-tested so planets occult it like the real thing. Kept out of `bodies`
   so it never intercepts raycasts or shadows. */
function coronaSprite(r, mult){
  const S=256, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const x=cv.getContext('2d');
  const g=x.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
  g.addColorStop(0,'rgba(255,253,246,1.0)');
  g.addColorStop(0.16,'rgba(255,238,208,0.55)');
  g.addColorStop(0.38,'rgba(255,196,130,0.22)');
  g.addColorStop(0.65,'rgba(255,160,100,0.07)');
  g.addColorStop(1,'rgba(255,150,90,0)');
  x.fillStyle=g; x.fillRect(0,0,S,S);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({
    map:t, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false
  }));
  s.scale.setScalar(Math.max(1e-9, r*(mult||5)));
  s.userData.coronaMult = (mult||5);
  return s;
}

  const built0 = sunMesh(isPhys, u);
  const sun = built0.sun;
  out.sunMat = built0.sunMat;
  scene.add(sun); out.bodies.sun=sun;
  out.corona = coronaSprite(sun.userData.renderRadius, isPhys ? 22 : 5);
  scene.add(out.corona);

  /* Dim cool fill so night sides stay deep but readable; the Sun does the work.
     Intensity is driven per-frame against the metered iris (see select-viewer)
     so night sides hold constant instead of going pitch black. */
  const ambient = new THREE.AmbientLight(0x334455, 0.4);
  scene.add(ambient);
  out.ambient = ambient;
  /* Warm sunlight with physical inverse-square falloff (three r155+ physical
     units: intensity is candela, irradiance = I/d²). I = SUN_POINT_INTENSITY
     (DERIVED, not tuned — see its comment): a body at Earth's orbit receives
     exactly 1361 W/m² and every other body gets the true 1/r² share at its
     real (JPL-ephemeris) distance. */
  const sunLight=new THREE.PointLight(0xfff2d8, SUN_POINT_INTENSITY, 0, 2);
  sunLight.position.set(0,0,0);
  /* Real shadows (eclipses, planet-shade on rings, moon transits): the Sun
     is the single caster. Cube-camera span covers Mercury (0.4u) to Pluto
     (53u); bias values are first-order true-scale tuning — revisit on
     screenshots if acne or peter-panning shows. Sun mesh never casts (it
     surrounds the light). Transparent shells never cast (would throw solid
     disc shadows); rings receive but don't cast (their alpha isn't in the
     depth material, so they'd throw a solid band). */
  sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(1024,1024);
  sunLight.shadow.camera.near=0.01;
  sunLight.shadow.camera.far=150;
  sunLight.shadow.bias=-0.0002;
  /* normalBias 1e-9: the single value must fit Bennu (2e-9u) AND Jupiter —
     NDC bias carries the giants, so the world-space term stays tiny enough
     for sub-pixel moons instead of detaching their shadows. */
  sunLight.shadow.normalBias=1e-9;
  scene.add(sunLight);
  out.sunLight=sunLight;

  const tmp=new THREE.Vector3();
  const simDays=opts.simDays||0;
  logAccuracyReport();

  /* Primary planetary bodies */
  const planetList = ['mercury','venus','earth','moon','mars','phobos','deimos','jupiter','europa','io','ganymede','callisto','saturn','uranus','neptune','pluto'];

  for(const key of planetList){
    let mesh;
    if(key==='saturn'){
      const grp=new THREE.Group();
      grp.add(sphereMesh(key,{physical:isPhys,unitsPerKm:u,sunPos:sun.position}));
      const R=isPhys?radiusKmTrue('saturn')*u:radiusOf('saturn');
      const REQ_KM=BODIES.saturn.equatorialRadiusKm;
      let rIn,rOut;
      if(isPhys){
        rIn=RINGS_KM.saturn.innerKm*u;
        rOut=RINGS_KM.saturn.outerKm*u;
      } else {
        rIn=R*(RINGS_KM.saturn.innerKm/REQ_KM);
        rOut=R*(RINGS_KM.saturn.outerKm/REQ_KM);
      }
      const ring = ringMesh(rIn, rOut, 'saturn');
      ring.userData.bodyKey = 'saturn';
      grp.add(ring);
      grp.rotation.x = -Math.PI / 2 + 0.4660;
      grp.userData.bodyKey = 'saturn';
      mesh=grp;
    } else if(key==='uranus'){
      const grp=new THREE.Group();
      grp.add(sphereMesh(key,{physical:isPhys,unitsPerKm:u,sunPos:sun.position}));
      const R=isPhys?radiusKmTrue('uranus')*u:radiusOf('uranus');
      /* Ten discrete PDS rings (see ringCanvas note) across 1.60–2.02 R_eq —
         replaces the old solid 1.49–2.0 wedge that read as fake. */
      const ring = ringMesh(R * 1.60, R * 2.02, 'uranus');
      ring.userData.bodyKey = 'uranus';
      grp.add(ring);
      grp.rotation.z = 1.7069;
      grp.userData.bodyKey = 'uranus';
      mesh=grp;
    } else {
      mesh=sphereMesh(key,{physical:isPhys,unitsPerKm:u,sunPos:sun.position});
    }
    mesh.userData.bodyKey = key;

    /* Limb glow: pure fresnel shader. Earth additionally carries its real
       MODIS cloud deck as an alpha shell. */
    if(key==='earth'||key==='venus'||key==='mars'||key==='europa'){
      const r = isPhys ? radiusKmTrue(key)*u : radiusOf(key);
      const host = mesh.isGroup ? mesh.children[0] : mesh;
      host.add(fresnelShell(r));
      if(key==='earth'){
        const clouds = createClouds(r);
        host.add(clouds);
        out.atmospheres.earth = clouds;
      }
    }

    if(isPhys){ const pw=bodyWorldPhysical(key,tmp,simDays,originKm,u); if(pw){ mesh.visible=true; mesh.position.copy(pw); } else mesh.visible=false; }
    else mesh.position.copy(bodyWorld(key,tmp,simDays));
    /* Shadow participation, decided by RESOLVABILITY (not wishes): the sun's
       1024 cube spans 150u, so one texel is ~0.0015×sun-distance — every moon
       (and every moon-shadow transit dot) is deeply sub-texel. Sampling them
       is flicker roulette: a whole moon reads ONE texel whose neighbors hold
       Mars/deep-space, so it pops lit/black across texel edges (the sawtooth
       bite). Rule: planets CAST (their bulk shades Saturn's spanning rings —
       the one shadow that resolves) but NOTHING sub-texel casts or receives;
       day/night terminators come from NdotL lighting, which is exact at any
       scale. Eclipses/transits need analytic cone tests (future work), not
       bigger maps. Rings receive only (alpha isn't in the depth material);
       shells/clouds never participate. */
    const isMoonBody = !!MOONS[key] || key==='bennu';
    mesh.traverse((o)=>{
      if(o.isMesh){
        const ud = o.userData || {};
        if(ud.noShadow){ o.castShadow=false; o.receiveShadow=false; }
        else if(ud.recvOnly){ o.castShadow=false; o.receiveShadow=true; }
        else if(isMoonBody){ o.castShadow=false; o.receiveShadow=false; }
        else { o.castShadow=true; o.receiveShadow=false; }
      }
    });
    scene.add(mesh); out.bodies[key]=mesh;
  }

  /* Phobos & Deimos ride the same planet loop below as textured
     real-radius spheres (NASA maps + real orbits via bodyWorld). */

  /* Asteroid Bennu: NASA PDS radar shape model V1.1, vendored as GLB.
     Register a transform root immediately; the async geometry is attached
     beneath it. This keeps Bennu selectable and positionally valid during the
     brief load, and guarantees the viewer's one-time raycast target collection
     includes it. */
  const bennuTag=isPhys?BENNU_PHYSICAL_TAG:'present';
  const bennuRoot=new THREE.Group();
  bennuRoot.userData.bodyKey='bennu';
  bennuRoot.userData.renderRadius=isPhys?radiusKmTrue('bennu')*u:radiusOf('bennu');
  if(isPhys) bennuRoot.scale.setScalar(radiusKmTrue('bennu')*u);
  scene.add(bennuRoot); out.bodies.bennu=bennuRoot;
  bennuModel(bennuTag).then((model)=>{
    if(!isAlive()) return;
    bennuRoot.add(model);
    bennuRoot.userData.visualCenterLocal = null; // geometry arrived; recompute visible centre
    bennuRoot.userData.renderRadius=isPhys?radiusKmTrue('bennu')*u:radiusOf('bennu');
    if(isPhys){ const pw=bodyWorldPhysical('bennu',new THREE.Vector3(),simDays,originKm,u); if(pw) bennuRoot.position.copy(pw); else bennuRoot.visible=false; }
    else bennuRoot.position.copy(bodyWorld('bennu',new THREE.Vector3(),simDays));
  }).catch((e)=>{ try{ console.warn('[orrery] Bennu GLB load failed:',e); }catch(er){} });

  /* No fake procedural asteroids around the Sun or in the system.
     Only verified celestial bodies and real asteroid Bennu (mission target) are retained. */

  /* Orbit Path Lines for each planet */
  try {
    const orbitRadii = [
      { key:'mercury', r:0.55 },
      { key:'venus',   r:0.98 },
      { key:'earth',   r:1.35 },
      { key:'mars',    r:2.05 },
      { key:'jupiter', r:7.02 },
      { key:'saturn',  r:12.9 },
      { key:'uranus',  r:25.9 },
      { key:'neptune', r:40.6 },
      { key:'pluto',   r:53.3 }
    ];
    for(let li=0; li<orbitRadii.length; li++){
      const item = orbitRadii[li];
      const ol = buildOrbitLine(item.r, ORBIT_COLORS[item.key] || 0x48709e, 0.32);
      ol.userData.bodyKey = item.key;
      out.orbitLines.add(ol);
      /* Orbit lines: geometric paths only. Planet labels are authoritatively
         managed by the view layers (V.nameGroup in select-viewer, V.bodyLabels in ops-view)
         to avoid duplicate planet labels in the solar system. */
    }
    scene.add(out.orbitLines);
  } catch(e){}

  /* Collect sunPos uniform refs once (build-time, never per-frame): every
     material that derives its day/night terminator from the sun registers
     mat.userData.sunPos. Heliocentric views leave them at the origin default;
     the select view's floating origin drives them via applySunPosition(). */
  try {
    scene.traverse((o)=>{
      const m = o.material;
      if(m && m.userData && m.userData.sunPos) out.sunFollowers.push(m.userData.sunPos);
    });
  } catch(e){}

  return out;
}

/* Sun-follow update for floating-origin views (select physical focus mode).
   sunWorldPos = the sun's CURRENT rendered position (bodyWorldPhysical with
   the live originKm). Moves the light + disc + corona together and pushes the
   position into every registered day/night uniform. Pass null/undefined for
   heliocentric views (sun at origin — no-op). Allocation-free. */
const _SUN_HOME = new THREE.Vector3(0, 0, 0);
export function applySunPosition(built, sunWorldPos){
  if(!built) return;
  const sp = sunWorldPos || _SUN_HOME;
  if(built.sunLight) built.sunLight.position.copy(sp);
  if(built.bodies && built.bodies.sun) built.bodies.sun.position.copy(sp);
  if(built.corona) built.corona.position.copy(sp);
  /* Orbit rings are heliocentric circles around the group origin: in a
     floating frame the whole group rides with the sun, otherwise every ring
     renders centered on the focus planet (a 7u Jupiter ring around the
     camera reads as a giant broken circle). Heliocentric views: no-op. */
  if(built.orbitLines) built.orbitLines.position.copy(sp);
  const fl = built.sunFollowers;
  if(fl) for(let i=0;i<fl.length;i++){ const un = fl[i]; if(un && un.value) un.value.copy(sp); }
}

/* Exposure from MEASURED quantities — no tuned curve. Apparent brightness =
   real irradiance at the body's orbit (solar constant / au²) × its verified
   geometric albedo; exposure normalizes that to middle gray, exactly like a
   camera metering off an 18% card. Only MID_GRAY (display target) and the
   rails are choices; everything else is NASA data. */
export const MID_GRAY = 0.5;
/* NASA-derived sunlight, not tuned. PointLight intensity (candela) for the
   shared rig: I = solar constant × (1 AU in world units)²
   = 1361 × 1.35² ≈ 2480 (SORCE/TIM, Kopp & Lean 2011; IAU 2015 value 1361).
   A body at Earth's orbit receives exactly 1361 W/m²; every other body gets
   its true 1/r² share at its real JPL-ephemeris distance (decay 2). */
export const SUN_POINT_INTENSITY = SOLAR_CONSTANT_W_M2 * WORLD_PER_AU * WORLD_PER_AU;
/* Per-planet solar irradiance from vendored NASA data only:
   E = 1361 / au² (SORCE/TIM ÷ JPL mean AU in ORBIT_AU). Moons inherit the
   parent's AU (documented ≤2% approximation; Europa vs Jupiter differs 0.4%).
   Derived reference (W/m²): Mercury 9090, Venus 2601, Earth 1361, Mars 587,
   Jupiter 50.3, Saturn 15.0, Uranus 3.70, Neptune 1.51, Pluto 0.87. */
export function solarIrradianceAtAu(au){ const a = Math.max(1e-6, au); return SOLAR_CONSTANT_W_M2 / (a * a); }
const IRRADIANCE_PARENT = { moon: 'earth', phobos: 'mars', deimos: 'mars', io: 'jupiter', europa: 'jupiter', ganymede: 'jupiter', callisto: 'jupiter', bennu: null };
export function solarIrradianceOf(key){
  if (key === 'sun') return NaN; // the Sun IS the source — no orbit irradiance
  if (key === 'bennu') return solarIrradianceAtAu(1.12639); // SBDB a (game BODY, JPL SBDB)
  const p = IRRADIANCE_PARENT[key];
  const au = ORBIT_AU[p || key];
  if (au === undefined) return NaN;
  return solarIrradianceAtAu(au);
}
export function exposureForBody(key, sunDistWorld){
  const au = Math.max(0.05, sunDistWorld / WORLD_PER_AU);
  const bright = SOLAR_CONSTANT_W_M2 / (au * au) * albedoOf(key);
  return THREE.MathUtils.clamp(MID_GRAY * Math.PI / Math.max(1e-6, bright), 0.0009, 8);
}
export function wideExposure(){
  return exposureForBody('earth', WORLD_PER_AU) * 2.5;
}

export function frameOf(key,simDays,out,outTgt,opts){
  opts=opts||{};
  const isPhys=!!opts.physical||isPhysicalMode();
  const u=opts.unitsPerKm||UNITS_PER_KM;
  const originKm=opts.originKm||(opts.focusKey&&isPhys?getOriginKm(opts.focusKey,simDays):[0,0,0]);
  let bp, helioForDir=null;
  if(isPhys){
    helioForDir=bodyWorldPhysical(key,new THREE.Vector3(),simDays,[0,0,0],u);
    if(!helioForDir) return null; // explicit unavailable — caller keeps last camera frame
    if(originKm) bp=bodyWorldPhysical(key,new THREE.Vector3(),simDays,originKm,u);
    else bp=helioForDir.clone();
    if(!bp) return null;
    if(opts.floatingOrigin&&opts.focusKey===key) bp.set(0,0,0);
  } else {
    bp=bodyWorld(key,new THREE.Vector3(),simDays);
    helioForDir=bp.clone();
  }
  const outward=(helioForDir||bp).clone(); outward.y=0;
  if(outward.lengthSq()<1e-12) outward.set(1,0,0);
  outward.normalize();
  const off=outward.clone().multiplyScalar(-0.45).add(new THREE.Vector3(0.3,0.65,0.5)).normalize();
  if(key==='europa'||key==='io'||key==='ganymede'||key==='callisto'){
    const jPos=isPhys?bodyWorldPhysical('jupiter',_fw,simDays,originKm||[0,0,0],u):bodyWorld('jupiter',_fw,simDays);
    if(!jPos) return null;
    _fw2.copy(bp).sub(jPos).normalize();
    const sunDir=helioForDir.clone().multiplyScalar(-1).normalize();
    _fw3.copy(sunDir);
    off.copy(_fw3).multiplyScalar(0.55).addScaledVector(_fw2,0.45);
    off.y+=0.35;
    off.normalize();
  }
  /* Focus framing uses the legacy regional distances (BODY_STYLE.dist):
     these frame the destination neighborhood (planet + moons + labels), not
     the planetary disc — close-ups come from click-to-fly (flyToPlanetDirect).
     A radius-aware fit was tried and rejected: it parks the camera on the
     planet's face with every label out of frame. */
  const dist=isPhys?frameDist(key,u):Math.max(0.45,((BODY_STYLE[key]||{}).dist||1));
  const safeDist=isPhys?Math.max(dist,radiusKmTrue(key)*u*1.5):dist;
  out.copy(bp).addScaledVector(off,safeDist);
  outTgt.copy(bp);
  return out;
}

const _fw=new THREE.Vector3(), _fw2=new THREE.Vector3(), _fw3=new THREE.Vector3();
export function easeSmoother(t){ t=Math.min(1,Math.max(0,t)); return t*t*t*(t*(t*6-15)+10); }
export function flyDur(travel){
  if(travel<0.01) return Math.min(2.6,Math.max(0.8,0.8+travel*200));
  return Math.min(2.6,Math.max(0.45,0.45+travel*0.22));
}

export function wrap180(d){ d=d%360; if(d>180) d-=360; if(d<-180) d+=360; return d; }

export async function verifyBennuEphem(){
  /* Retired 2026-09-26: JPL SBDB sends no CORS headers, so every browser read
     fails and the console fills with a CORS error for zero benefit — the
     vendored elements always won. The badge now permanently reads from the
     vendored solution (see QA/bennu_sbdb_solution.json, orbit_id 118).
     Kept as an async stub so callers are untouched; delete entirely if the
     badge goes. */
  return {live:false,delta:null};
}
