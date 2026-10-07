
"use strict";
/* ══════════════════════════════════════════════════════════════
   DATA LAYER — NASA-derived. Every record carries provenance.
   Values are representative fits from public NASA sources; the
   `p.simp` field states exactly what we simplified.
   ══════════════════════════════════════════════════════════════ */

const SRC = {
  lsp:{source:"NASA Launch Services Program — Launch Vehicle Performance Website",
       url:"https://elvperf.ksc.nasa.gov/",retrieved:"2026-09-19",
       simp:"Curves digitised to 5-7 anchor points and interpolated in log-mass space. Real curves depend on declination of launch asymptote (DLA), fairing choice and mission-unique analysis."},
  techport:{source:"NASA TechPort — NASA's portfolio of funded technology projects",
       url:"https://techport.nasa.gov/api/projects",retrieved:"2026-09-19",
       simp:"Instrument masses/powers are representative of the flown heritage instrument class, not a specific serial unit."},
  horizons:{source:"JPL Horizons — solar system ephemerides",
       url:"https://ssd.jpl.nasa.gov/api/horizons.api",retrieved:"2026-09-19",
       simp:"Planets propagated as coplanar Keplerian orbits from J2000 elements. Inclination (Mars 1.85 deg, Bennu 6.0 deg) is ignored, which understates real C3 by roughly 1-3 km^2/s^2."},
  sbdb:{source:"JPL Small-Body Database Query API",
       url:"https://ssd-api.jpl.nasa.gov/sbdb_query.api",retrieved:"2026-09-19",
       simp:"Orbital elements are real; physical properties rounded."},
  dsn:{source:"NASA/JPL Deep Space Network Now public feed",
       url:"https://eyes.nasa.gov/dsn/data/dsn.xml",retrieved:"2026-09-19",
       simp:"Snapshot cached at build time. Antenna gains modelled as a single figure per aperture class; real G/T varies with band, elevation and weather."},
  rps:{source:"NASA Radioisotope Power Systems — MMRTG",
       url:"https://rps.nasa.gov/",retrieved:"2026-09-19",
       simp:"Decay modelled as a flat 1.6%/yr exponential. The real curve combines Pu-238 half-life with thermocouple degradation."},
  nssdc:{source:"NASA NSSDCA Planetary Fact Sheets",
       url:"https://nssdc.gsfc.nasa.gov/planetary/factsheet/",retrieved:"2026-09-19",
       simp:"Gravitational parameters and radii are exact; delta-v line items are mission-design rules of thumb."},
  cost:{source:"NASA cost class envelopes (Discovery / New Frontiers / Flagship AOs)",
       url:"https://science.nasa.gov/researchers/solicitations/",retrieved:"2026-09-19",
       simp:"Parametric model: bus cost scales with dry mass, integration with part count and TRL. Real NASA cost estimates use PCEC/NICM and are far more detailed."},
  models:{source:"NASA 3D Resources — Satellite Kit (modular bus) + Saturn V (representative heavy lift)",
       url:"https://github.com/nasa/NASA-3D-Resources",retrieved:"2026-09-23",
       simp:"Vendored static GLBs, byte-verified vs the GitHub API. Satellite Kit body/wings/radio tiers assemble from your build choices; Saturn V stands in visually for any selected LV while performance still uses that LV's LSP curve. Public domain per NASA media guidelines; no insignia used."}
};

/* ── Phase 12 provenance surface: built ONLY from SRC records above + SOURCES.md §§2–5,7.
   No new citations. Classes: REAL NASA/JPL DATA / NASA-DERIVED PARAMETER / GAMEPLAY ABSTRACTION. */
function provClassOf(k){
  if(["lsp","horizons","sbdb","models"].includes(k)) return "REAL NASA/JPL DATA";
  return "NASA-DERIVED PARAMETER";
}
const PROV_EXTRA=[
 {cls:"REAL NASA/JPL DATA",t:"JPL DE441 ephemeris (vendored)",d:"Planetary + satellite Chebyshev vectors evaluated aboard, frame ECLIPTIC_J2000 / SSB / TDB. Validated offline vs reference vectors (QA/jpl_reference_checks.mjs). Explicit FALLBACK_KEPLER, never silent."},
 {cls:"REAL NASA/JPL DATA",t:"Bennu radar shape model",d:"Nolan et al. (Icarus 226, 2013), NASA PDS Small Bodies Node. DOI 10.26033/33ba-s419. Rendered flat-shaded; no published texture."},
 {cls:"REAL NASA/JPL DATA",t:"NASA texture set",d:"LROC WAC Moon, MESSENGER Mercury, New Horizons Pluto + outer-planet maps, plus the science-grade Earth maps (GIBS Blue Marble, Black Marble 2012, MODIS cloud fraction) retained in the repo as the accuracy reference for Earth appearance. Full table: assets/ASSET_SOURCES.md."},
 {cls:"REAL SKY DATA (NON-NASA)",t:"HYG star catalog v4.0",d:"Hipparcos / Yale Bright Star / Gliese bake (CC BY-SA 4.0), 5,070 stars to Vmag 6.0 as J2000 vectors."},
  {cls:"REAL SKY DATA (NON-NASA)",t:"Planet textures: Solar System Scope, CC BY 4.0",d:"Earth day / night / cloud / land-sea roughness maps (matte, no specular reflection). (c) 2010-2017 Solar System Scope, https://www.solarsystemscope.com/textures/, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Illustration, not measurement - the source states its maps use colors slightly more saturated and gaps filled with similar fictional terrain. Used only where NASA has no equivalent, chiefly the land/sea roughness mask (remapped matte so the sea does not mirror the Sun). Surface appearance only; affects no ephemeris, lighting, exposure or gameplay value."}
];
const PROV_ABSTRACTIONS=[
 "Instruments observe ~12% of the time (build-screen assumption).",
 "LV reliability figures and launch-outcome splits are gameplay numbers, not LSP data.",
 "The anomaly deck, DSN tiers (60/150%), extension ×1.2, aerobrake and proximity figures are balanced abstractions, not flight-certified models.",
 "Porkchop solutions ignore inclination (understates C3 ~1–3 km²/s²) and render on a 90×70 grid."
];
function sourcesModal(){
  const keys=Object.keys(SRC);
  const grp=c=>keys.filter(k=>provClassOf(k)===c).map(k=>{
    const p=SRC[k];
    return `<div style="padding:7px 0;border-bottom:1px solid var(--hairline)">`
      +`<div class="spread"><span style="font-size:12.5px">${esc(p.source)}</span>`
      +`<span class="tag">${c}</span></div>`
      +`<div class="hint" style="margin-top:3px;line-height:1.6">${esc(p.url)} · retrieved ${esc(p.retrieved)}<br>Simplification: ${esc(p.simp)}</div></div>`;
  }).join("");
  const extra=c=>PROV_EXTRA.filter(e=>e.cls===c).map(e=>
    `<div style="padding:7px 0;border-bottom:1px solid var(--hairline)">`
    +`<div class="spread"><span style="font-size:12.5px">${esc(e.t)}</span><span class="tag">${e.cls}</span></div>`
    +`<div class="hint" style="margin-top:3px;line-height:1.6">${esc(e.d)}</div></div>`).join("");
  el("mbox").innerHTML=`<h3>MISSION DATA — WHERE NUMBERS COME FROM</h3><div class="mb" style="font-size:13px;line-height:1.7;max-height:60vh;overflow:auto">`
    +`<p class="hint">Nothing here is fetched live. Full register: SOURCES.md. Gameplay abstractions are not flight physics.</p>`
    +grp("REAL NASA/JPL DATA")+extra("REAL NASA/JPL DATA")+extra("REAL SKY DATA (NON-NASA)")
    +grp("NASA-DERIVED PARAMETER")
    +`<div class="hint" style="margin:10px 0 4px;font-size:10.5px;letter-spacing:.14em">GAMEPLAY ABSTRACTION</div>`
    +PROV_ABSTRACTIONS.map(a=>`<p class="hint" style="line-height:1.6">• ${esc(a)}</p>`).join("")
    +`<button class="btn ghost mt" data-act="closeModal" style="width:100%">CLOSE</button></div>`;
  el("modal").classList.add("on");
}

/* ── Instruments ─────────────────────────── */
const INSTR = [
 {id:"ctx",  n:"Context Camera",            g:"Imaging",     m:18, w:12, d:0.60, c:22, trl:9, tags:["surface","mapping"],     her:"MRO CTX class", p:SRC.techport},
 {id:"hires",n:"Telescopic Imager",         g:"Imaging",     m:65, w:60, d:6.00, c:85, trl:9, tags:["surface","geology"],     her:"MRO HiRISE class", p:SRC.techport},
 {id:"therm",n:"Thermal Imager",            g:"Imaging",     m:11, w:14, d:0.30, c:18, trl:9, tags:["surface","thermal"],     her:"Odyssey THEMIS class", p:SRC.techport},
 {id:"ocean",n:"Wide-Field Ocean Imager",   g:"Imaging",     m:45, w:40, d:3.20, c:60, trl:8, tags:["ocean","atmos"],         her:"PACE OCI class", p:SRC.techport},
 {id:"vnir", n:"VNIR Imaging Spectrometer", g:"Spectroscopy",m:32, w:44, d:2.10, c:55, trl:9, tags:["composition","geology","ice"], her:"OSIRIS-REx OVIRS class", p:SRC.techport},
 {id:"msp",  n:"Mass Spectrometer",         g:"Spectroscopy",m:40, w:55, d:0.05, c:70, trl:8, tags:["composition","organics","atmos"], her:"Curiosity SAM class", p:SRC.techport},
 {id:"grns", n:"Gamma-Ray / Neutron Spec.", g:"Spectroscopy",m:30, w:32, d:0.02, c:38, trl:9, tags:["composition","ice"],     her:"Messenger GRNS class", p:SRC.techport},
 {id:"mag",  n:"Magnetometer + 3 m Boom",   g:"Fields",      m:9,  w:4,  d:0.01, c:12, trl:9, tags:["fields","interior"],     her:"Juno MAG class", p:SRC.techport},
 {id:"plas", n:"Plasma / Particle Analyser",g:"Fields",      m:14, w:12, d:0.03, c:20, trl:9, tags:["fields","radiation"],    her:"MAVEN SWIA class", p:SRC.techport},
 {id:"dust", n:"Dust Detector",             g:"Fields",      m:4,  w:3,  d:0.005,c:7,  trl:9, tags:["dust","fields"],         her:"New Horizons SDC class", p:SRC.techport},
 {id:"radar",n:"Ice-Penetrating Radar",     g:"Radar",       m:55, w:120,d:1.40, c:80, trl:7, tags:["ice","interior"],        her:"Europa Clipper REASON class", p:SRC.techport},
 {id:"alt",  n:"Laser Altimeter",           g:"Radar",       m:25, w:34, d:0.10, c:30, trl:9, tags:["mapping","interior"],    her:"LRO LOLA class", p:SRC.techport},
 {id:"arm",  n:"Sample Acquisition Arm",    g:"In-situ",     m:78, w:90, d:0.02, c:110,trl:8, tags:["sample"],                her:"OSIRIS-REx TAGSAM class", p:SRC.techport},
 {id:"drill",n:"Drill + Sample Handling",   g:"In-situ",     m:65, w:110,d:0.02, c:95, trl:7, tags:["sample","organics"],     her:"Mars Sample Return class", p:SRC.techport},
 {id:"seis", n:"Seismometer",               g:"In-situ",     m:30, w:8,  d:0.01, c:42, trl:9, tags:["interior"],              her:"InSight SEIS class", p:SRC.techport},
 {id:"wx",   n:"Weather / Environment Stn", g:"In-situ",     m:12, w:10, d:0.005,c:15, trl:9, tags:["atmos","surface"],       her:"Perseverance MEDA class", p:SRC.techport},
 {id:"uso",  n:"Ultra-Stable Oscillator",   g:"Radio Sci.",  m:3,  w:6,  d:0.00, c:6,  trl:9, tags:["interior","atmos"],      her:"Radio science, many missions", p:SRC.techport},
 {id:"rad",  n:"Radiation Monitor",         g:"Radio Sci.",  m:5,  w:4,  d:0.002,c:9,  trl:9, tags:["radiation"],             her:"MSL RAD class", p:SRC.techport}
];

/* ── Power sources (BOL watts quoted at 1 AU for solar) ── */
const POWER = [
 {id:"sa1",n:"Fixed Solar Array — small",   m:18, bol:300, deg:0.020, c:8,  sch:0, solar:true,  p:SRC.techport},
 {id:"sa2",n:"Fixed Solar Array — medium",  m:34, bol:700, deg:0.020, c:14, sch:0, solar:true,  p:SRC.techport},
 {id:"sa3",n:"Deployable Array — large",    m:62, bol:1600,deg:0.021, c:26, sch:1, solar:true,  p:SRC.techport},
 {id:"sa4",n:"Very Large Array (Clipper class)",m:350,bol:20000,deg:0.022,c:70,sch:4, solar:true,  p:SRC.techport},
 {id:"rtg1",n:"MMRTG",                      m:45, bol:110, deg:0.016, c:145,sch:9, solar:false, p:SRC.rps},
 {id:"rtg2",n:"2 × MMRTG",                  m:90, bol:220, deg:0.016, c:265,sch:12,solar:false, p:SRC.rps}
];

/* ── Comms ── gain in dBi ── */
const COMMS = [
 {id:"lga",n:"Low-Gain Omni",        m:1.5,w:5,  gain:6,  c:2,  p:SRC.dsn},
 {id:"mga",n:"Medium-Gain Antenna",  m:6,  w:15, gain:22, c:6,  p:SRC.dsn},
 {id:"hga2",n:"2 m HGA — X-band",    m:22, w:50, gain:45, c:18, p:SRC.dsn},
 {id:"hga3",n:"3 m HGA — X/Ka",      m:38, w:100,gain:51, c:32, p:SRC.dsn},
 {id:"ka",  n:"3 m HGA + Ka package", m:46, w:130,gain:56, c:44, p:SRC.dsn}
];

/* ── DSN allocation tiers — factor multiplies the mission's L.dsnHrs passes (derive passH),
   cost adjusts operations budget. Single authoritative path: S.dsn → dsnFactorOf() → derive + OPS. */
const DSN = [
  {id:"reduced", n:"Reduced tracking",  f:0.6, c:-12, d:"60% of allocated passes. Saves $12M of operations — backlog risk on rich targets."},
  {id:"standard",n:"Standard allocation",f:1.0, c:0,   d:"The mission's planned passes. No adjustment."},
  {id:"priority",n:"Priority tracking",  f:1.5, c:24,  d:"150% of allocated passes. +$24M of operations — clears backlog on faint targets."}
];
function dsnTier(){ return DSN.find(t=>t.id===S.dsn)||DSN[1]; }
function dsnFactorOf(){ return dsnTier().f; }

/* ── Propulsion ── */
const PROP = [
 {id:"none",n:"No propulsion (flyby only)", isp:0,    m:0,  w:0,    c:0,  p:SRC.nssdc},
 {id:"mono",n:"Monopropellant Hydrazine",   isp:230,  m:45, w:30,   c:12, p:SRC.nssdc},
 {id:"bi",  n:"Bipropellant (MMH/NTO)",     isp:320,  m:85, w:45,   c:28, p:SRC.nssdc},
 {id:"dual",n:"Dual-Mode Bipropellant",     isp:335,  m:95, w:50,   c:34, p:SRC.nssdc},
 {id:"sep", n:"Solar Electric (NEXT-C)",    isp:4190, m:170,w:4500, c:95, p:SRC.techport}
];

/* ── Launch vehicles ── anchors: [C3 km^2/s^2, injected kg] ── */
const LV = [
 {id:"f9",  n:"Falcon 9 (expendable)", cost:70,  rel:0.98, leo:16000,
  cur:[[-2,4020],[0,3500],[10,2600],[20,1900],[40,900],[60,400],[80,150]]},
 {id:"av401",n:"Atlas V 401",          cost:110, rel:0.99, leo:9800,
  cur:[[-2,2700],[0,2350],[10,1700],[20,1250],[40,620],[60,280]]},
 {id:"av551",n:"Atlas V 551",          cost:160, rel:0.99, leo:18800,
  cur:[[-2,7200],[0,6500],[10,5200],[20,4100],[40,2400],[60,1400],[80,800],[100,450]]},
 {id:"vc4", n:"Vulcan Centaur VC4",    cost:140, rel:0.95, leo:21000,
  cur:[[-2,8000],[0,7200],[20,4400],[40,2600],[60,1500],[80,900],[100,520]]},
 {id:"vc6", n:"Vulcan Centaur VC6",    cost:180, rel:0.95, leo:27000,
  cur:[[-2,11900],[0,10800],[20,6900],[40,4300],[60,2700],[80,1700],[100,1050],[120,640]]},
 {id:"fhr", n:"Falcon Heavy (recovery)",cost:110,rel:0.97, leo:32000,
  cur:[[-2,7800],[0,7000],[20,3900],[40,2000],[60,1000],[80,480]]},
 {id:"fhe", n:"Falcon Heavy (expendable)",cost:160,rel:0.97,leo:63000,
  cur:[[-2,17600],[0,16000],[20,9800],[40,6000],[60,3600],[80,2200],[100,1300],[120,800]]},
 {id:"ng",  n:"New Glenn",             cost:120, rel:0.90, leo:45000,
  cur:[[-2,12700],[0,11500],[20,6800],[40,4000],[60,2300],[80,1300]]},
 {id:"sls", n:"SLS Block 1B",          cost:1000,rel:0.95, leo:105000,
  cur:[[-2,41000],[0,38000],[20,26000],[40,18000],[60,12000],[80,8000],[100,5500],[120,3800]]}
];

/* ── Radiation shielding ── */
const SHIELD = [
 {id:"sh0",n:"No dedicated shielding", m:0,  c:0,  f:1.00, p:SRC.nssdc},
 {id:"sh1",n:"Aluminium electronics box (10 mm)", m:60, c:18, f:0.08, p:SRC.nssdc},
 {id:"sh2",n:"Titanium-aluminium vault (Clipper class)", m:150,c:42, f:0.012,p:SRC.nssdc}
];

/* ── Targets ──
   a,e,M0,peri : heliocentric Keplerian elements (J2000 epoch, coplanar approx)
   mu, rp      : capture body gravitational parameter & periapsis radius
   au          : mean heliocentric distance used for solar power
   dose        : krad/year unshielded at the target
   dv          : fixed delta-v line items applied on top of capture
   NOTE (2026-09-21, verified live against SBDB): Bennu M0 was 101.70 — that is
   the mean anomaly at the SBDB solution epoch (Feb 2011, ma=102), NOT J2000.
   M0@J2000 = -n*(tp - J2000) = 28.84 (n from a, tp=2455439.142 per SBDB).
   Check: M(epoch 2455562.5) = 101.4 ≈ ma. This shifts l4 porkchop geometry;
   re-run balance QA before locking. Solution vendored: QA/bennu_sbdb_solution.json (orbit_id 118, cond. code 0). 3D views use the JPL_SBDB Chebyshev pack (tools/build_bennu.py); gameplay elements unchanged. Other bodies' M0 verified J2000 via L-ϖ. */
const BODY = {
  earth:{n:"Earth", a:1.00000011, e:0.01671022, M0:357.51716, peri:102.94719, mu:398600, rp:6578, au:1.0},
  moon: {n:"Moon",  mu:4902.8, rp:1838, au:1.0, dose:0.5,
         dv:[["Lunar orbit insertion",0.90],["Station-keeping (2 yr)",0.10]]},
  mars: {n:"Mars",  a:1.52366231, e:0.09341233, M0:19.41248, peri:336.04084, mu:42828, rp:3596, au:1.52, dose:2.0,
         dv:[["Trajectory correction manoeuvres",0.08],["Station-keeping (3 yr)",0.12]]},
  venus:{n:"Venus", a:0.72333199, e:0.00677323, M0:50.41576, peri:131.53298, mu:324859, rp:6352, au:0.72, dose:3.0,
         dv:[["Trajectory correction manoeuvres",0.08]]},
  bennu:{n:"Bennu-class NEA (101955)", a:1.12639, e:0.20375, M0:28.84, peri:66.22, mu:0.0000045, rp:0.5, au:1.13, dose:1.5,
         dv:[["Proximity operations & survey",0.35],["Touch-and-go sample",0.10],["Earth return cruise",0.90]]},
  jupiter:{n:"Jupiter / Europa", a:5.20336301, e:0.04839266, M0:19.65053, peri:14.75385, mu:126686534, rp:1000000, au:5.20, dose:180,
         dv:[["Perijove raise",0.20],["Europa tour (50 flybys)",1.05],["Trajectory corrections",0.15]]}
};

/* ── L2 lunar landing-site candidates (Phase 1 rover-forward planning) ──
   Coordinates/character: real LRO record (see SOURCES.md §11). Gameplay
   figures (slope/hazard/sun/earth/sci/travKm/hazardDv) are BALANCED
   ABSTRACTIONS in the house style (cf. line 55): they order the sites
   correctly (benign↔rugged, dark↔lit, near↔far ice) without claiming survey
   precision. Only L2 reads them; S.site null or elsewhere = zero effect, so
   old saves and share links derive byte-identical margins. */
const MOON_SITES=[
 {id:"tranq",n:"Mare Tranquillitatis",lat:"0.67°N",lon:"23.47°E",
  d:"Apollo 11 mare basalts. Flat and benign with a full day/night cycle — easy landing, harsh 354 h night, modest polar science.",
  slope:3,hazard:0.10,sun:0.50,earth:1.0,sci:1.00,travKm:8,hazardDv:0.00,
  fx:"No divert reserve · solar ×0.80 (night cycle) · +$3.2M traverse reserve · science ×1.00"},
 {id:"malapert",n:"Mons Malapert",lat:"≈86°S",lon:"≈0°E",
  d:"5 km massif with near-constant light and direct Earth view — but the ice lies far away in shadowed craters.",
  slope:8,hazard:0.35,sun:0.85,earth:1.0,sci:1.10,travKm:25,hazardDv:0.05,
  fx:"+0.05 km/s divert reserve · solar ×0.94 · +$10.0M traverse reserve · science ×1.10"},
 {id:"shackleton",n:"Shackleton Rim · Connecting Ridge",lat:"≈89.5°S",lon:"≈150°W",
  d:"21 km polar crater rim: PSR ice at your feet on rugged ground with partial Earth view.",
  slope:12,hazard:0.60,sun:0.75,earth:0.4,sci:1.30,travKm:14,hazardDv:0.12,
  fx:"+0.12 km/s divert reserve · solar ×0.90 · +$5.6M traverse reserve · science ×1.30"}
];
function moonSite(S){ if(!S||S.levelId!=="l2"||!S.site) return null; return byId(MOON_SITES,S.site)||null; }

/* ── L2 rover kit catalogs (Phase 2) ──
   Baselines: Apollo LRV (rigid 4-wheel), MER/MSL rocker-bogie, VIPER/MSL-class
   active suspension + drill/caching payloads (see SOURCES.md §12). Figures are
   BALANCED ABSTRACTIONS (house style): mass/draw/cost classes that order
   correctly, capability thresholds the site table is tuned against. L2 only. */
const ROVER_MOB=[
 {id:"rm1",n:"Rigid 4-wheel chassis (LRV class)",m:80,c:40,slope:12,grip:0.3,
  d:"Apollo-LRV-class rigid suspension. Fine on mare, marginal on rims.",her:"LRV class",p:SRC.techport},
 {id:"rm2",n:"Rocker-bogie 6-wheel (MER class)",m:150,c:90,slope:20,grip:0.6,
  d:"MER-class rocker-bogie. Climbs what the rigid chassis cannot.",her:"MER class",p:SRC.techport},
 {id:"rm3",n:"Active suspension (VIPER/MSL class)",m:260,c:180,slope:30,grip:0.85,
  d:"VIPER/MSL-class active suspension. Steep, broken ground.",her:"VIPER/MSL class",p:SRC.techport}
];
const ROVER_PWR=[
 {id:"rp1",n:"Body solar + battery (day ops)",m:40,draw:60,night:0,c:25,
  d:"Daylight driving only. A lunar night without heat is a coffin.",her:"MER-class power",p:SRC.techport},
 {id:"rp2",n:"Solar + hibernation heaters",m:70,draw:90,night:1,c:70,
  d:"Survives the night asleep. Wakes up when the sun returns.",her:"Yutu-class hibernation",p:SRC.techport},
 {id:"rp3",n:"RTG + isotope heaters (night-capable)",m:120,draw:110,night:2,c:220,
  d:"Full night operations. Heavy, expensive, unstoppable.",her:"MMRTG class",p:SRC.rps}
];
const ROVER_COM=[
 {id:"rc1",n:"Low-gain omni (DTE suitcase)",m:4,draw:10,gain:0,c:6,
  d:"Talks straight to Earth — only where Earth rides high.",her:"LGA class",p:SRC.dsn},
 {id:"rc2",n:"Steerable 0.5 m HGA (DTE)",m:18,draw:40,gain:1,c:30,
  d:"Aimed high-gain. Holds a link low on the horizon.",her:"HGA class",p:SRC.dsn},
 {id:"rc3",n:"HGA + UHF relay package",m:30,draw:55,gain:2,c:55,
  d:"Direct plus orbiter relay. Works anywhere the orbiter flies.",her:"Electra relay class",p:SRC.dsn}
];
const ROVER_PAY=[
 {id:"ry1",n:"Context imagers + APXS (MER class)",m:25,draw:30,sci:1.00,c:45,
  d:"Baseline field geology. Light, proven, limited.",her:"MER payload class",p:SRC.techport},
 {id:"ry2",n:"Mastcam-Z + SHERLOC/PIXL class",m:60,draw:70,sci:1.35,c:120,
  d:"Stand-off mineralogy. More mass, much more science per sol.",her:"MSL payload class",p:SRC.techport},
 {id:"ry3",n:"Drill + sample cache (MSL class)",m:110,draw:120,sci:1.70,c:210,
  d:"Subsurface access and caching. The heavy science option.",her:"MSL/ExoMars class",p:SRC.techport}
];
function roverKit(S){ if(!S||S.levelId!=="l2"||!S.rover) return null;
  const r=S.rover, rm=byId(ROVER_MOB,r.mob), rp=byId(ROVER_PWR,r.pwr),
        rc=byId(ROVER_COM,r.com), ry=byId(ROVER_PAY,r.pay);
  return (rm&&rp&&rc&&ry)?{rm,rp,rc,ry}:null; }

/* ── Objectives ── */
const OBJ = {
  o_ocean:{t:"Map global ocean colour",      d:"Chlorophyll and phytoplankton across every ocean basin, weekly.", need:["ocean"],      data:900, w:30},
  o_land: {t:"Image land cover change",      d:"Repeat high-resolution imaging of agriculture and forest.",        need:["surface"],    data:1400,w:28},
  o_aer:  {t:"Characterise aerosols",        d:"Aerosol optical depth to constrain the climate forcing budget.",   need:["atmos"],      data:400, w:22},
  o_mmap: {t:"Map the surface",              d:"Global basemap at better than 10 m per pixel.",                    need:["mapping","surface"],data:2200,w:26},
  o_ice:  {t:"Find subsurface ice",          d:"Sound the regolith for water ice within the top 100 m.",           need:["ice"],        data:1100,w:32},
  o_geo:  {t:"Determine surface composition",d:"Mineralogy at outcrop scale to reconstruct aqueous history.",      need:["composition"],data:1600,w:30},
  o_relay:{t:"Relay data for surface assets",d:"Carry a UHF relay payload for landers and rovers.",                need:["relay"],      data:2600,w:24},
  o_int:  {t:"Probe the interior",           d:"Constrain core size and crustal thickness.",                       need:["interior"],   data:300, w:26},
  o_org:  {t:"Search for organics",          d:"Detect and characterise carbon-bearing compounds.",                need:["organics"],   data:260, w:36},
  o_samp: {t:"Return a pristine sample",     d:"Collect at least 60 g of unaltered regolith and return it.",       need:["sample"],     data:500, w:44},
  o_rad:  {t:"Map the radiation environment",d:"Characterise charged-particle flux for future crewed missions.",   need:["radiation"],  data:180, w:20},
  o_fld:  {t:"Measure the magnetic field",   d:"Induced-field response reveals a subsurface conducting layer.",    need:["fields"],     data:220, w:34},
  o_ocw:  {t:"Confirm the subsurface ocean", d:"Combine radar, gravity and induced field to prove liquid water.",  need:["ice","fields"],data:1500,w:48},
  o_atm:  {t:"Profile the atmosphere",       d:"Temperature and composition from surface to exobase.",             need:["atmos"],      data:700, w:26},
  o_dust: {t:"Measure dust and debris",      d:"Particle flux along the cruise and at the target.",                need:["dust"],       data:90,  w:14}
};

/* ── Levels ── */
const LEVELS = [
 {id:"l1", num:1, name:"First Light", sub:"Earth observer, Sun-synchronous orbit",
  real:"Modelled on PACE and the Landsat series.",
  brief:"An Earth-science observatory in a 690 km Sun-synchronous orbit. Power is easy this close to the Sun and the Deep Space Network is not involved — a ground station sees you fourteen times a day. This mission teaches one thing: mass and instruments are the same currency.",
  newMech:"Budget rails. Mass, power and cost.",
  body:"earth", mode:"leo", capM:750, years:3, dataScale:1, storeMb:160000, altKm:690, linkAu:0.02,
  objs:["o_ocean","o_land","o_aer","o_atm"], req:1,
  parts:["ctx","ocean","therm","vnir","rad","wx","dust"],
  power:["sa1","sa2","sa3"], comms:["lga","mga","hga2"], prop:["none","mono"],
  lvs:["f9","av401","av551"], dsnHrs:14, dose:0.3,
  par:{mass:1900,power:520,cost:400}},

 {id:"l2", num:2, name:"Quiet Side", sub:"Lunar polar orbiter",
  real:"Modelled on Lunar Reconnaissance Orbiter and the CLPS deliveries.",
  brief:"A polar orbiter at the Moon. Translunar injection is nearly free in C3 terms, but you have to stop when you arrive — and half of every orbit you are behind the Moon with no line of sight to Earth. Data you cannot downlink is data you did not collect.",
  newMech:"Delta-v budget. Propellant is mass you must launch.",
  body:"moon", mode:"fixedC3", c3:-1.9, tof:5, capM:800, years:2, linkAu:0.02, dataScale:1, storeMb:160000,
  objs:["o_mmap","o_ice","o_int","o_rad","o_geo"], req:2,
  parts:["ctx","hires","therm","vnir","grns","alt","seis","rad","uso","mag"],
  power:["sa1","sa2","sa3"], comms:["lga","mga","hga2","hga3"], prop:["mono","bi","dual"],
  lvs:["f9","av401","av551","fhr"], dsnHrs:8, dose:0.5,
  par:{mass:2200,power:640,cost:620}},

 {id:"l3", num:3, name:"Window", sub:"Mars orbiter and relay",
  real:"Modelled on Mars Reconnaissance Orbiter.",
  brief:"Mars opens a launch window roughly every 26 months and slams it shut again. The porkchop plot below is a real Lambert solution across departure date and flight time — pick a cheap C3 and you arrive fast but hot, needing propellant to capture. Pick a slow transfer and you save fuel but spend years of operations budget.",
  newMech:"Launch windows, porkchop plots, and arrival energy.",
  body:"mars", mode:"pork", capM:1100, years:4, dataScale:9, storeMb:160000,
  objs:["o_mmap","o_ice","o_geo","o_relay","o_atm","o_int"], req:2,
  parts:["ctx","hires","therm","vnir","msp","grns","radar","alt","mag","rad","uso","wx"],
  power:["sa2","sa3","sa4","rtg1"], comms:["mga","hga2","hga3","ka"], prop:["bi","dual","sep"],
  lvs:["f9","av401","av551","vc4","vc6","fhr","fhe","ng"], dsnHrs:6, dose:2.0,
  depart:[2028.7,2029.4], tofRange:[150,420],
  par:{mass:2600,power:1100,cost:980}},

 {id:"l4", num:4, name:"Touch and Go", sub:"Near-Earth asteroid sample return",
  real:"Modelled on OSIRIS-REx at Bennu.",
  brief:"A rendezvous, not a flyby — you must match the asteroid's orbit exactly, which costs you the whole arrival velocity. Then survey, touch the surface for five seconds, and fly home. Every extra month in proximity operations is operations budget you will not get back.",
  newMech:"Schedule as a resource. Rendezvous costs the full arrival V-infinity.",
  body:"bennu", mode:"pork", capM:1500, years:7, dataScale:8, storeMb:220000,
  objs:["o_samp","o_geo","o_org","o_mmap","o_dust","o_rad"], req:1, force:["o_samp"],
  parts:["ctx","hires","therm","vnir","msp","alt","arm","dust","rad","uso","mag"],
  power:["sa2","sa3","sa4"], comms:["mga","hga2","hga3","ka"], prop:["bi","dual","sep"],
  lvs:["av551","vc4","vc6","fhr","fhe","ng"], dsnHrs:5, dose:1.5,
  depart:[2029.0,2030.2], tofRange:[300,900],
  par:{mass:2100,power:1400,cost:1050}},

 {id:"l5", num:5, name:"Deep Cold", sub:"Europa multiple-flyby mission",
  real:"Modelled on Europa Clipper.",
  brief:"Five astronomical units from the Sun, sunlight is one twenty-seventh as strong. Jupiter's radiation belts will deliver megarads to anything unshielded. You are eight light-minutes past the point where real-time control means anything, sharing a saturated Deep Space Network, and you need to return terabits. Everything in this game applies at once.",
  newMech:"Radiation dose, power scarcity, and data starvation.",
  body:"jupiter", mode:"pork", capM:4500, years:12, dataScale:16, storeMb:500000,
  assist:{c3:15.5,addDays:1150,costM:110,label:"Mars\u2013Earth\u2013Earth gravity assist"},
  objs:["o_ocw","o_ice","o_fld","o_geo","o_org","o_rad","o_int","o_dust"], req:3,
  parts:["ctx","hires","therm","vnir","msp","radar","alt","mag","plas","dust","rad","uso"],
  power:["sa4","rtg1","rtg2"], comms:["hga2","hga3","ka"], prop:["bi","dual","sep"],
  lvs:["vc6","fhe","ng","sls"], dsnHrs:4, dose:180,
  depart:[2030.0,2031.5], tofRange:[700,2400],
  par:{mass:6000,power:2700,cost:4200}},

 {id:"sbx", num:6, name:"Free Design", sub:"Sandbox — every part, every target",
  real:"No template. Grade rewards science returned under the cost cap with healthy margins.",
  brief:"The whole catalogue, the full launch fleet, and a Mars transfer window. Build whatever you can defend. Grade rewards science returned under the cost cap with healthy margins, so an elegant small mission can beat an expensive one.",
  newMech:"No constraints but physics and money.",
  body:"mars", mode:"pork", capM:3000, years:5, dataScale:9, storeMb:160000,
  objs:["o_mmap","o_ice","o_geo","o_relay","o_atm","o_int","o_org","o_rad","o_dust","o_fld"], req:1,
  parts:INSTR.map(i=>i.id),
  power:POWER.map(p=>p.id), comms:COMMS.map(c=>c.id), prop:["mono","bi","dual","sep"],
  lvs:LV.map(v=>v.id), dsnHrs:6, dose:2.0,
  depart:[2028.7,2029.4], tofRange:[150,420],
  par:{mass:3000,power:1400,cost:2600}}
];

/* which instrument tag satisfies which capability */
const RELAY_PART = {id:"relay",n:"UHF Relay Payload",g:"Comms payload",m:15,w:35,d:0.0,c:24,trl:9,
  tags:["relay"],her:"Electra relay, MRO / MAVEN class",p:SRC.techport};
INSTR.push(RELAY_PART);
LEVELS.find(l=>l.id==="l3").parts.push("relay");
LEVELS.find(l=>l.id==="sbx").parts.push("relay");

/* cached DSN snapshot — the live feed refreshes every ~5 s */
const DSN_SNAP = [
 ["Canberra DSS-43 70 m","Voyager 1","159 bit/s down","44 h 11 m round trip"],
 ["Madrid DSS-63 70 m","Mars Reconnaissance Orbiter","2.0 Mbit/s down","18 m 04 s round trip"],
 ["Goldstone DSS-14 70 m","Voyager 2","160 bit/s down","36 h 52 m round trip"],
 ["Canberra DSS-35 34 m","New Horizons","1.0 kbit/s down","16 h 22 m round trip"],
 ["Madrid DSS-54 34 m","James Webb Space Telescope","28 Mbit/s down","10 s round trip"],
 ["Goldstone DSS-25 34 m","Psyche","264 kbit/s down","51 m 18 s round trip"]
];

/* ══════════════════════════════════════════════════════════════
   SIM LAYER — pure functions. No DOM. Deterministic.
   ══════════════════════════════════════════════════════════════ */
const MU_SUN = 1.32712440041279419e11; // km^3/s^2 — JPL SSD astrodynamic parameters, DE440-compatible (Phase-1.1 trace confirmed this value correct; astronomy.js GM typo corrected to match)
const AU = 1.49597870700e8;          // km — SPEC §1 IAU exact 149,597,870.700 (was 1.495978707e8 rounded); canonical owner js/constants.js, literal kept in Phase 1 (identical value)
const G0 = 9.80665;                // m/s^2
const DAY = 86400; // canonical owner js/constants.js DAY_S (identical value)
const DATA_DUTY = 0.12;
/* objective data requirements, in Mbit. OBJ.data is a relative size; L.dataScale sets the
   absolute volume a mission of that class has to return. */
function needMb(L,oid){ return OBJ[oid].data * (L.dataScale||1) * 1000; }
function fmtData(mb){
  if(mb>=1e6) return fmtN(mb/1e6,1)+" Tb";
  if(mb>=1000) return fmtN(mb/1000,mb<1e4?1:0)+" Gb";
  return fmtN(mb,mb<10?1:0)+" Mb";
}
const fmtN=(v,d=0)=>(isFinite(v)?v:0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});   // instruments observe ~12% of the time; power duty is higher

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const byId=(arr,id)=>arr.find(x=>x.id===id);

/* ── Launch vehicle capability: interpolate the LSP curve ── */
function lvCapability(lv,c3){
  const c=lv.cur;
  if(c3<=c[0][0]) return c[0][1];
  if(c3>=c[c.length-1][0]) return c[c.length-1][1]*Math.exp(-(c3-c[c.length-1][0])/22);
  for(let i=0;i<c.length-1;i++){
    if(c3>=c[i][0]&&c3<=c[i+1][0]){
      const f=(c3-c[i][0])/(c[i+1][0]-c[i][0]);
      return Math.exp(Math.log(c[i][1])*(1-f)+Math.log(c[i+1][1])*f); // log-mass interpolation
    }
  }
  return 0;
}

/* ── Stumpff functions ── */
function stumpC(z){
  if(z>1e-6) return (1-Math.cos(Math.sqrt(z)))/z;
  if(z<-1e-6){const s=Math.sqrt(-z);return (Math.cosh(s)-1)/(-z);}
  return 0.5 - z/24 + z*z/720;
}
function stumpS(z){
  if(z>1e-6){const s=Math.sqrt(z);return (s-Math.sin(s))/(s*s*s);}
  if(z<-1e-6){const s=Math.sqrt(-z);return (Math.sinh(s)-s)/(s*s*s);}
  return 1/6 - z/120 + z*z/5040;
}

/* ── Lambert (universal variables, Vallado) — planar, prograde ── */
function lambert(r1v,r2v,dt,mu){
  const r1=Math.hypot(r1v[0],r1v[1]), r2=Math.hypot(r2v[0],r2v[1]);
  const cross = r1v[0]*r2v[1]-r1v[1]*r2v[0];
  let dnu = Math.atan2(cross, r1v[0]*r2v[0]+r1v[1]*r2v[1]);
  if(dnu<0) dnu += 2*Math.PI;                      // prograde, short or long way
  const A = Math.sin(dnu)*Math.sqrt(r1*r2/(1-Math.cos(dnu)));
  if(!isFinite(A)||Math.abs(A)<1e-9) return null;
  let lo=-4*Math.PI*Math.PI, hi=4*Math.PI*Math.PI, z=0, y=0, x=0, t=0;
  for(let i=0;i<120;i++){
    z=(lo+hi)/2;
    const C=stumpC(z), S=stumpS(z);
    y = r1+r2 - A*(1-z*S)/Math.sqrt(C);
    if(A>0 && y<0){ lo=z; continue; }
    if(y<0||C<=0){ lo=z; continue; }
    x = Math.sqrt(y/C);
    t = (x*x*x*S + A*Math.sqrt(y))/Math.sqrt(mu);
    if(!isFinite(t)){ hi=z; continue; }
    if(t<dt) lo=z; else hi=z;
  }
  if(!isFinite(y)||y<0) return null;
  const g = A*Math.sqrt(y/mu);
  const f = 1 - y/r1, gd = 1 - y/r2;
  if(Math.abs(g)<1e-9) return null;
  const v1=[(r2v[0]-f*r1v[0])/g,(r2v[1]-f*r1v[1])/g];
  const v2=[(gd*r2v[0]-r1v[0])/g,(gd*r2v[1]-r1v[1])/g];
  return {v1,v2};
}

/* ── Keplerian state of a body at Julian-year t (coplanar) ──
   Epoch math owned by TimeService (uniform 365.25-day years — APPROXIMATION,
   not TDB; see js/time-service.js). Identical numbers, single owner. */
function bodyState(b,tYr){
  const n = 360/(Math.sqrt(b.a*b.a*b.a)*365.25); // deg/day
  const days = (typeof TimeService!=="undefined"?TimeService.gameEpochToDays(tYr):(tYr-2000)*365.25);
  let M = ((b.M0 + n*days)%360+360)%360, Mr = M*Math.PI/180;
  let E = Mr;
  for(let i=0;i<40;i++){ E = E - (E - b.e*Math.sin(E) - Mr)/(1 - b.e*Math.cos(E)); }
  const nu = 2*Math.atan2(Math.sqrt(1+b.e)*Math.sin(E/2), Math.sqrt(1-b.e)*Math.cos(E/2));
  const r = b.a*(1-b.e*Math.cos(E))*AU;
  const th = nu + b.peri*Math.PI/180;
  const pos=[r*Math.cos(th), r*Math.sin(th)];
  const p = b.a*AU*(1-b.e*b.e), h=Math.sqrt(MU_SUN*p);
  const vr = MU_SUN/h*b.e*Math.sin(nu), vt = h/r;
  const vel=[vr*Math.cos(th)-vt*Math.sin(th), vr*Math.sin(th)+vt*Math.cos(th)];
  return {pos,vel,r};
}

/* ── Porkchop grid: real Lambert over departure × flight time ── */
const porkCache={};
function porkchop(levelId,targetKey,depRange,tofRange,NX,NY){
  const key=levelId; if(porkCache[key]) return porkCache[key];
  const E=BODY.earth, T=BODY[targetKey];
  const g={NX,NY,depRange,tofRange,c3:new Float32Array(NX*NY),vinf:new Float32Array(NX*NY),
           c3min:1e9,c3max:0,vmin:1e9,vmax:0,best:null,bestV:null};
  for(let i=0;i<NX;i++){
    const tDep = depRange[0] + (depRange[1]-depRange[0])*i/(NX-1);
    const e = bodyState(E,tDep);
    for(let j=0;j<NY;j++){
      const tof = tofRange[0] + (tofRange[1]-tofRange[0])*j/(NY-1);
      const tArr = tDep + tof/365.25;
      const m = bodyState(T,tArr);
      const L = lambert(e.pos,m.pos,tof*DAY,MU_SUN);
      let c3=NaN,vi=NaN;
      if(L){
        c3 = Math.pow(L.v1[0]-e.vel[0],2)+Math.pow(L.v1[1]-e.vel[1],2);
        vi = Math.hypot(L.v2[0]-m.vel[0], L.v2[1]-m.vel[1]);
        if(!isFinite(c3)||c3<0||c3>400) c3=NaN;
        if(!isFinite(vi)||vi>40) vi=NaN;
      }
      const k=j*NX+i;
      g.c3[k]=c3; g.vinf[k]=vi;
      if(isFinite(c3)){ if(c3<g.c3min){g.c3min=c3;g.best={i,j};} if(c3>g.c3max)g.c3max=c3; }
      if(isFinite(vi)){ if(vi<g.vmin){g.vmin=vi;g.bestV={i,j};} if(vi>g.vmax)g.vmax=vi; }
    }
  }
  const c3Cap = Math.max(35, g.c3min*6);
  if(g.c3max>c3Cap) g.c3max=c3Cap;
  const vCap = Math.max(10, g.vmin*4);
  if(g.vmax>vCap) g.vmax=vCap;
  porkCache[key]=g; return g;
}
function porkAt(g,i,j){
  i=clamp(Math.round(i),0,g.NX-1); j=clamp(Math.round(j),0,g.NY-1);
  const tDep=g.depRange[0]+(g.depRange[1]-g.depRange[0])*i/(g.NX-1);
  const tof=g.tofRange[0]+(g.tofRange[1]-g.tofRange[0])*j/(g.NY-1);
  return {i,j,tDep,tof,c3:g.c3[j*g.NX+i],vinf:g.vinf[j*g.NX+i]};
}
function yrToDate(t){
  if(typeof TimeService!=="undefined") return TimeService.yrToDate(t); // PRESENTATION owner
  const y=Math.floor(t); const d=Math.round((t-y)*365.25);
  const dt=new Date(Date.UTC(y,0,1)); dt.setUTCDate(dt.getUTCDate()+d);
  return dt.toISOString().slice(0,10);
}

/* ── Capture delta-v from arrival V-infinity ── */
function captureDv(bodyKey,vinf,eTarget){
  const b=BODY[bodyKey];
  if(bodyKey==="bennu") return vinf;                 // full rendezvous
  const mu=b.mu, rp=b.rp;
  const vHyp=Math.sqrt(vinf*vinf + 2*mu/rp);
  const e = eTarget===undefined?0.85:eTarget;
  const vCap=Math.sqrt(mu*(1+e)/rp);
  return Math.max(0, vHyp - vCap);
}

/* ── Power ── */
function solarPower(bol,auDist,years,deg){ return bol*Math.pow(1/auDist,2)*Math.pow(1-deg,years); }
function rtgPower(bol,years,deg){ return bol*Math.pow(1-deg,years); }

/* ── Link budget (Friis, calibrated to MRO 3 m HGA ≈ 3 Mbit/s at 1.5 AU) ── */
function dataRateBps(txW,gainDbi,distAu,dsnClass){
  const g=Math.pow(10,gainDbi/10);
  const ap=dsnClass===70?2.6:1.0;
  return 0.536*txW*g*ap/Math.max(0.02,distAu*distAu);
}

/* ══════════════════════════════════════════════════════════════
   DERIVE — the whole coupled model in one pure function
   ══════════════════════════════════════════════════════════════ */
function derive(S){
  const L = byId(LEVELS,S.levelId);
  const b = BODY[L.body];
  const instr = S.instruments.map(id=>byId(INSTR,id));
  const pw = byId(POWER,S.power), cm = byId(COMMS,S.comms), pr = byId(PROP,S.prop);
  const sh = byId(SHIELD,S.shield) || SHIELD[0];

  const iMass=instr.reduce((s,x)=>s+x.m,0);
  const iPower=instr.reduce((s,x)=>s+x.w,0);
  const iData=instr.reduce((s,x)=>s+x.d,0);          // Mbit/s if all on
  const iCost=instr.reduce((s,x)=>s+x.c,0);

  const payloadMass0 = iMass + (pw?pw.m:0) + (cm?cm.m:0) + (pr?pr.m:0) + sh.m;
  /* Phase-2 rover kit: mass/draw/cost flow through the standard books below.
     Null/invalid rover (old saves, other missions) = zero effect. */
  const rv = roverKit(S);
  const rvMass = rv?rv.rm.m+rv.rp.m+rv.rc.m+rv.ry.m:0;
  const rvDraw = rv?rv.rp.draw+rv.rc.draw+rv.ry.draw:0;
  const rvCost = rv?rv.rm.c+rv.rp.c+rv.rc.c+rv.ry.c:0;
  const payloadMass = payloadMass0 + rvMass;
  const busDry = 240 + 0.90*payloadMass;              // structure, avionics, thermal, harness
  const dryMass = payloadMass + busDry;

  // delta-v budget
  const dv=[];
  let vinf = S.launch && isFinite(S.launch.vinf) ? S.launch.vinf : 0;
  if(L.mode==="pork" && S.launch){
    dv.push(["Arrival capture / rendezvous", captureDv(L.body, vinf)]);
  }else if(L.mode==="fixedC3"){
    (b.dv||[]).forEach(()=>{});
  }
  (b.dv||[]).forEach(x=>dv.push([x[0],x[1]]));
  /* Phase-1 rover-forward: the chosen lunar site holds a terminal divert
     reserve for rugged ground. Flows through Tsiolkovsky like every other
     line item — mass consequence, no special cases. */
  const site = moonSite(S);
  if(site&&site.hazardDv>0) dv.push(["Terminal divert reserve ("+site.n+")",site.hazardDv]);
  if(L.mode==="leo"){ dv.length=0; dv.push(["Orbit maintenance & de-orbit",0.22]); }
  const dvTotal = dv.reduce((s,x)=>s+x[1],0);

  // Tsiolkovsky (dry mass includes the empty propulsion module)
  let propMass=0;
  if(pr && pr.isp>0 && dvTotal>0){
    propMass = dryMass*(Math.exp(dvTotal*1000/(pr.isp*G0))-1);
  }
  if(pr && pr.isp===0) propMass=0;
  const wetMass = dryMass + propMass;

  // power
  const years = L.years;
  const auDist = b.au!==undefined?b.au:1;
  let genBOL=0, genEOL=0;
  if(pw){
    if(pw.solar){ genBOL=solarPower(pw.bol,auDist,0,pw.deg); genEOL=solarPower(pw.bol,auDist,years,pw.deg); }
    else { genBOL=rtgPower(pw.bol,0,pw.deg); genEOL=rtgPower(pw.bol,years,pw.deg); }
  }
  const busLoad = 95 + 0.06*dryMass;
  const sepLoad = (pr&&pr.id==="sep")?pr.w*0.30:0;    // electric propulsion must be fed by the array
  const loadPeak = busLoad + iPower + (cm?cm.w:0) + sepLoad + rvDraw;
  const loadAvg  = busLoad + iPower*0.55 + (cm?cm.w:0)*0.30 + rvDraw*0.6;
  /* Phase-1 rover-forward site effects (balanced abstractions, cf. MOON_SITES):
     solar illumination duty derates array output (RTGs unaffected); the prime
     target's distance accrues a surface-traverse ops reserve for later phases.
     Null site (old saves, other missions) = exactly zero effect. */
  let siteSun=1, siteSci=1, siteOpsM=0, siteTravKm=0;
  if(site){
    siteSci=site.sci; siteTravKm=site.travKm;
    if(pw&&pw.solar) siteSun=0.60+0.40*site.sun;
    siteOpsM=site.travKm*0.4;
  }
  genBOL*=siteSun; genEOL*=siteSun;
  /* Phase-2 rover↔site compatibility (readouts + review gates; the mass/power/
     cost consequences above already flow through the standard margins):
     slope cap vs site slope, night tier vs site darkness, link gain vs
     Earth-view fraction, payload science × site science (for Phase-7 grading). */
  let rvSlopeOk=true, rvSlopeMargin=99, rvNightOk=true, rvNightNeed=0,
      rvComOk=true, rvComNeed=0, rvSci=siteSci;
  if(rv&&site){
    rvSlopeMargin=rv.rm.slope-site.slope; rvSlopeOk=rvSlopeMargin>=0;
    rvNightNeed=site.sun<0.6?1:0; rvNightOk=rv.rp.night>=rvNightNeed;
    rvComNeed=site.earth<0.5?2:(site.earth<0.8?1:0); rvComOk=rv.rc.gain>=rvComNeed;
    rvSci=rv.ry.sci*siteSci;
  }

  // data
  const dsnClass = (L.body==="jupiter"||L.body==="bennu")?70:34;
  const linkAu = L.linkAu!==undefined ? L.linkAu : auDist;
  const rate = cm ? dataRateBps(cm.w, cm.gain, linkAu, dsnClass) : 0;
  const passH = L.dsnHrs * (S.ops?S.ops.dsnFactor:dsnFactorOf());
  const downMbPerDay = rate*passH*3600/1e6;           // Mbit per day
  const genMbPerDay  = iData*DATA_DUTY*DAY;           // Mbit per day at observing duty cycle

  // cost
  const partsCost = iCost + (pw?pw.c:0) + (cm?cm.c:0) + (pr?pr.c:0) + sh.c + rvCost;
  const busCost = 60 + 0.30*dryMass;
  const lowTrl = instr.filter(x=>x.trl<8).length;
  const months = 34 + 1.6*instr.length + (pw?pw.sch:0) + lowTrl*4 + (rv?3:0);
  const integCost = months*3.0;
  const lvCost = S.launch&&S.launch.lv ? byId(LV,S.launch.lv).cost : 0;
  const opsCost = years*24 + ((S.assist&&L.assist)?L.assist.costM:0) + dsnTier().c + siteOpsM;
  const cost = partsCost + busCost + integCost + lvCost + opsCost;

  // launch capability
  let capability=0, c3=0;
  if(S.launch&&S.launch.lv){
    const lv=byId(LV,S.launch.lv);
    if(L.mode==="leo") capability=lv.leo*0.34;        // SSO at 690 km, dog-leg penalty
    else {
      c3 = L.mode==="fixedC3" ? L.c3 : (S.launch.c3||0);
      if(S.assist && L.assist) c3 = L.assist.c3;
      capability=lvCapability(lv,c3);
    }
  }

  // margins
  const massCap = capability||L.par.mass;
  const powerCap = genEOL||1;
  const m = {
    mass:  massCap>0 ? (massCap-wetMass)/massCap : -1,
    power: powerCap>0 ? (powerCap-loadPeak)/powerCap : -1,
    data:  genMbPerDay>0 ? (downMbPerDay-genMbPerDay)/Math.max(genMbPerDay,downMbPerDay) : 1,
    cost:  (L.capM-cost)/L.capM,
    sched: 72-months
  };

  return {L,b,instr,pw,cm,pr,sh,iMass,iPower,iData,iCost,payloadMass,busDry,dryMass,
          dv,dvTotal,propMass,wetMass,genBOL,genEOL,busLoad,loadPeak,loadAvg,
          rate,passH,downMbPerDay,genMbPerDay,partsCost,busCost,months,integCost,
          lvCost,opsCost,cost,capability,c3,margins:m,years,auDist,linkAu,dsnClass,
          site,siteSun,siteSci,siteOpsM,siteTravKm,
          rv,rvMass,rvDraw,rvCost,rvSlopeOk,rvSlopeMargin,rvNightOk,rvNightNeed,rvComOk,rvComNeed,rvSci};
}

/* ── objective coverage ── */
function objTags(S){
  const set=new Set();
  S.instruments.forEach(id=>{const x=byId(INSTR,id); x.tags.forEach(t=>set.add(t));});
  return set;
}
function objMet(S,oid){
  const o=OBJ[oid], tags=objTags(S);
  return o.need.every(t=>tags.has(t));
}

/* ══════════════════════════════════════════════════════════════
   APP STATE + SHELL
   ══════════════════════════════════════════════════════════════ */
const S = {
  screen:"title", mode:"cadet", levelId:null, seed:12345,
  instruments:[], power:null, comms:null, prop:null, shield:"sh0", objectives:[],
  launch:null, ops:null, result:null, sound:false, sel:null, bstep:"payload", site:null, rover:null, landing:null,
  progress:{}, aerobrake:false, dsn:"standard",
  /* Phase 1 lifecycle integration: authoritative once-only phase ledger. */
  phases:null, commit:null
};
/* Ordered lifecycle: BUILD→COMMIT→LAUNCH→ASCENT→[ARRIVAL]→[PROXIMITY]→OPS→[EXTENSION]→REPORT */
const LIFECYCLE=["build","commit","launch","ascent","arrival","proximity","ops","extension","report"];
function phasePlanFor(lid){
  const L=byId(LEVELS,lid); if(!L) return {arrival:false,proximity:false,extension:true};
  const b=L.body;
  return {
    /* l1 LEO: no arrival/proximity. l2 Moon: arrival capture only. Mars/Bennu/Jupiter: arrival.
       Bennu rendezvous + Jupiter tour: proximity. Extension offered to all via OPS review. */
    arrival: b!=="earth",
    proximity: (b==="bennu"||b==="jupiter"),
    extension: true
  };
}
function ensurePhases(){
  if(!S.phases||S.phases.levelId!==S.levelId){ S.phases={levelId:S.levelId,plan:phasePlanFor(S.levelId),done:{}}; }
  return S.phases;
}
/* Returns true on first entry, false if already entered (redraw/reload safe). */
function enterPhaseOnce(key){
  const P=ensurePhases();
  if(!P.plan[key]&&key!=="build"&&key!=="commit"&&key!=="launch"&&key!=="ascent"&&key!=="ops"&&key!=="report"&&key!=="extension") return false;
  if(P.done[key]) return false;
  P.done[key]=true; return true;
}
function phaseRequired(key){
  const P=ensurePhases();
  if(["build","commit","launch","ascent","ops","report"].includes(key)) return true;
  return !!P.plan[key];
}
const $=s=>document.querySelector(s);
const el=(id)=>document.getElementById(id);
const fmt=(v,d=0)=>(isFinite(v)?v:0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=v=>(v*100).toFixed(1)+"%";
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ── responsive canvas: CSS pixels for layout, DPR backing store for sharpness ──
   Call at the top of every canvas draw fn. Reallocates only when size changes,
   so per-frame callers (orbit/timeline rAF loop) stay allocation-free. */
function fitCanvas(cv,defW,defH){
  const dpr=Math.min(2,(typeof window!=="undefined"&&window.devicePixelRatio)||1);
  const cssW=Math.max(240,Math.round(cv.clientWidth||defW));
  const cssH=Math.round(cssW*defH/defW);
  const bw=Math.max(1,Math.round(cssW*dpr)), bh=Math.max(1,Math.round(cssH*dpr));
  if(cv.width!==bw||cv.height!==bh){cv.width=bw;cv.height=bh;}
  const x=cv.getContext("2d");
  if(x.setTransform) x.setTransform(dpr,0,0,dpr,0,0);
  return {x:x,W:cssW,H:cssH};
}

/* ── provenance tooltip ── */
function infoTag(p,label,extra){
  const d=JSON.stringify({t:label||p.source,s:p.source,u:p.url,r:p.retrieved,m:extra||p.simp});
  return `<span class="info" tabindex="0" data-tip='${esc(d)}' role="button" aria-label="Where this number comes from">i</span>`;
}
(function tooltipInit(){
  const tip=el("tip");
  function show(t,x,y){
    let d; try{d=JSON.parse(t)}catch(e){return}
    tip.innerHTML=`<b>${esc(d.t)}</b>${esc(d.s)}<span class="src">${esc(d.u)}<br>Retrieved ${esc(d.r)}</span>`+
      (d.m?`<span class="simp">Simplification: ${esc(d.m)}</span>`:"");
    tip.classList.add("on");
    const r=tip.getBoundingClientRect();
    tip.style.left=Math.min(x+12,innerWidth-r.width-10)+"px";
    tip.style.top=Math.max(8,Math.min(y+14,innerHeight-r.height-10))+"px";
  }
  function hide(){tip.classList.remove("on")}
  document.addEventListener("mouseover",e=>{const t=e.target.closest("[data-tip]");if(t)show(t.dataset.tip,e.clientX,e.clientY);});
  document.addEventListener("mouseout",e=>{if(e.target.closest("[data-tip]"))hide()});
  document.addEventListener("focusin",e=>{const t=e.target.closest("[data-tip]");if(t){const r=t.getBoundingClientRect();show(t.dataset.tip,r.left,r.bottom)}});
  document.addEventListener("focusout",hide);
  document.addEventListener("scroll",hide,true);
})();

/* ── sound ── */
const Audio_={ctx:null,on:false,
  init(){if(!this.ctx){try{this.ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}},
  blip(f=520,d=0.05,type="square",g=0.05){
    if(!this.on||!this.ctx)return; const c=this.ctx,o=c.createOscillator(),gn=c.createGain();
    o.type=type;o.frequency.value=f;gn.gain.value=g;o.connect(gn);gn.connect(c.destination);
    gn.gain.setValueAtTime(g,c.currentTime);gn.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+d);
    o.start();o.stop(c.currentTime+d);
  },
  click(){this.blip(420+Math.random()*60,0.035,"square",0.035)},
  caution(){this.blip(760,0.12,"sine",0.06);setTimeout(()=>this.blip(560,0.16,"sine",0.06),130)},
  go(){this.blip(300,0.1,"sawtooth",0.05);setTimeout(()=>this.blip(600,0.22,"sine",0.05),90)},
  bad(){this.blip(160,0.3,"sawtooth",0.06)}
};

/* ── telemetry ticker ── */
function telemText(){
  const parts=DSN_SNAP.map(d=>`${d[0]} <b>&#9656;</b> ${d[1]} &nbsp;${d[2]} &nbsp;${d[3]}`);
  const s=parts.join(" &nbsp;&nbsp;&#183;&nbsp;&nbsp; ")+" &nbsp;&nbsp;&#183;&nbsp;&nbsp; ";
  return s+s;
}

/* ── phase steps ── */
const PHASES=[["brief","FORMULATE"],["build","BUILD"],["launch","LAUNCH"],["ops","OPERATE"],["report","REPORT"]];
function renderSteps(){
  const i=PHASES.findIndex(p=>p[0]===S.screen);
  el("steps").innerHTML = i<0 ? "" :
    PHASES.map((p,k)=>`<span class="step ${k===i?'on':k<i?'done':''}">${p[1]}</span>`+
      (k<PHASES.length-1?`<span class="step sep">/</span>`:"")).join("");
}

/* ══════════════════════════════════════════════════════════════
   HUD RAILS + CASCADE
   ══════════════════════════════════════════════════════════════ */
const RAILDEF=[
  {k:"mass", nm:"MASS",     unit:"kg"},
  {k:"power",nm:"POWER",    unit:"W"},
  {k:"data", nm:"DATA",     unit:"Mb/d"},
  {k:"cost", nm:"COST",     unit:"M"},
  {k:"sched",nm:"SCHEDULE", unit:"mo"}
];
function railValues(D){
  return {
    mass: {v:D.wetMass, cap:D.capability||D.L.par.mass, m:D.margins.mass, d:0, u:"kg",
           capLabel:D.capability?"launch capability":"design target"},
    power:{v:D.loadPeak, cap:D.genEOL, m:D.margins.power, d:0, u:"W", capLabel:"end-of-life generation"},
    data: {v:D.genMbPerDay/1000, cap:D.downMbPerDay/1000, m:D.margins.data, d:0, u:"Gb/d", capLabel:"daily downlink"},
    cost: {v:D.cost, cap:D.L.capM, m:D.margins.cost, d:0, u:"$M", capLabel:"cost cap"},
    sched:{v:D.months, cap:72, m:D.margins.sched/72, d:0, u:"mo", capLabel:"launch readiness date"}
  };
}
let hudCache={k:"",t:0};
function renderHUD(){
  const hud=el("hud");
  if(!["build","launch","ops"].includes(S.screen)||!S.levelId){hud.classList.add("hidden");return}
  hud.classList.remove("hidden");
  /* T4: on the ops screen this runs per game tick — rails move per sol, so
     rebuild on day change or 500 ms, not per frame. Other screens rebuild
     every render() (part clicks change rails with no day change). */
  if(S.screen==="ops"){
    const nowMs=(typeof performance!=="undefined")?performance.now():0;
    const k="ops:"+(S.ops?S.ops.day:0)+":"+(S.ops?S.ops.log.length:0);
    if(k===hudCache.k&&(nowMs-hudCache.t)<500) return;
    hudCache.k=k; hudCache.t=nowMs;
  }
  const D=derive(S), R=railValues(D);
  hud.innerHTML=`<div class="rails">`+RAILDEF.map(r=>{
    const x=R[r.k]; const frac=clamp(x.cap>0?x.v/x.cap:1,0,1);
    const cls = x.m<0 ? "over" : x.m<0.15 ? "caution" : "";
    const sig = x.m<0 ? "CRIT" : x.m<0.15 ? "WARN" : "NOMINAL";
    return `<button class="rail ${cls}" data-rail="${r.k}" aria-label="${r.nm} margin ${pct(x.m)}">
      <span class="sig">${sig}</span>
      <span class="rl"><span class="nm">${r.nm}</span><span class="mg">${x.m<0?"OVER":"margin "+(x.m*100).toFixed(0)+"%"}</span></span>
      <span class="vl">${fmt(x.v)} <small>/ ${fmt(x.cap)} ${x.u}</small></span>
      <span class="bar"><i style="width:${frac*100}%"></i></span>
    </button>`;
  }).join("")+`</div>`;
}

let lastRails=null;
function cascade(prev){
  const D=derive(S), R=railValues(D);
  if(!prev){lastRails=R;return}
  const box=el("cascade"); box.innerHTML="";
  const rows=[];
  RAILDEF.forEach(r=>{
    const a=prev[r.k], b=R[r.k];
    const dv=b.v-a.v;
    if(Math.abs(dv)<0.01 && Math.abs(b.m-a.m)<0.002) return;
    const worse = b.m<a.m;
    let cls = worse?"up":"dn";
    if(b.m<0) cls="up"; else if(b.m<0.15&&worse) cls="warn";
    const sign=dv>=0?"+":"\u2212";
    rows.push({k:r.nm,txt:`${sign}${fmt(Math.abs(dv),Math.abs(dv)<10?1:0)} ${b.u}`,
               mg:`margin ${(a.m*100).toFixed(0)}% \u2192 ${(b.m*100).toFixed(0)}%`,cls});
  });
  rows.forEach((r,i)=>{
    const d=document.createElement("div");
    d.className="casc "+r.cls;
    d.style.animationDelay=(i*80)+"ms";
    d.innerHTML=`<span class="k">${r.k}</span><span class="v">${r.txt}</span><span class="k" style="min-width:0">${r.mg}</span>`;
    box.appendChild(d);
  });
  if(rows.length){
    const t=400+rows.length*80;
    setTimeout(()=>{[...box.children].forEach(c=>c.classList.add("out"))},t+900);
    setTimeout(()=>{box.innerHTML=""},t+1300);
  }
  lastRails=R;
  // flash the rails
  requestAnimationFrame(()=>{
    document.querySelectorAll(".rail").forEach(el2=>{
      const k=el2.dataset.rail, a=prev[k], b=R[k];
      if(Math.abs(b.v-a.v)>0.01){ el2.classList.add("flash"); setTimeout(()=>el2.classList.remove("flash"),520); }
      if(b.m<0&&a.m>=0){ el2.classList.add("shake"); Audio_.caution(); setTimeout(()=>el2.classList.remove("shake"),340); }
    });
  });
  const over=RAILDEF.filter(r=>R[r.k].m<0).map(r=>r.nm);
  if(over.length) el("live").textContent="Over budget on "+over.join(", ");
}

/* ══════════════════════════════════════════════════════════════
   SCREENS
   ══════════════════════════════════════════════════════════════ */
let lastScreen=null;
function render(){
  renderSteps();
  const s=el("screen");
  s.innerHTML = ({title:scrTitle,select:scrSelect,brief:scrBrief,build:scrBuild,
                  launch:scrLaunch,ops:scrOps,report:scrReport})[S.screen]();
  /* same-screen repaints (toggles) must not replay entrance animations —
     only fresh navigation earns the cinematic */
  if(lastScreen===S.screen) s.classList.add("noanim");
  else s.classList.remove("noanim");
  lastScreen=S.screen;
  renderHUD();
  if(S.screen==="build"){ drawBay(); lastRails=railValues(derive(S)); if(window.M3D)M3D.sync(); }
  if(S.screen==="launch"){ initLaunch(); }
  if(S.screen==="ops"){ initOps(); }
  try{ if(window.TitleEarth)TitleEarth.sync(); }catch(e){}
  try{ if(window.SelView)SelView.sync(); }catch(e){}
  try{ if(window.BriefView)BriefView.sync(); }catch(e){}
  try{
    document.body.classList.toggle("ops-active", S.screen==="ops");
    if(window.OpsView&&OpsView.sync) OpsView.sync();
    else if(S.screen!=="ops"&&window.OpsView&&OpsView.stop) OpsView.stop();
    if(window.OpsView&&OpsView.showFinal) OpsView.showFinal();
  }catch(e){}
  s.scrollTop=0;
}
function go(screen){
  const veil = document.getElementById("veil");
  let still = false;
  try { still = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  // Crossfade: veil covers the teardown of the old WebGL canvas and the
  // first-frame warmup of the new one, so no white flash breaks immersion.
  // Exception: title -> select hands a live camera viewpoint to the select
  // view (window.__MARGIN_HANDOFF), which opens on that exact frame and
  // pulls back — veiling it would reintroduce the fade this handoff removes.
  const seamless = (S.screen === "title" && screen === "select");
  if (!veil || still || seamless) { S.screen=screen; render(); return; }
  veil.classList.add("on");
  setTimeout(() => {
    S.screen=screen;
    render();
    const s = document.getElementById("screen");
    if (s) { s.classList.remove("swap"); void s.offsetWidth; s.classList.add("swap"); }
    // Hold the veil one frame so the new canvas has painted, then lift.
    requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.remove("on")));
  }, 190);
}

/* ── TITLE ── */
function scrTitle(){
  const d=DSN_SNAP[Math.floor(Math.random()*DSN_SNAP.length)];
  return `<div class="title-screen">
  <div class="earth-wrap" aria-hidden="true"><canvas id="earthCanvas"></canvas><div class="earth-fallback"></div></div>
  <div class="title-copy">
    <div class="mark-lg">MARGIN</div>
    <div class="underscore"><i></i></div>
    <div class="tagline">EVERY GRAM, EVERY WATT, EVERY BIT</div>
    <p class="lede">Designing a space mission is a fight over margin. Add a better camera and you gain
    science &mdash; and lose eighteen kilograms, which costs you array area, which costs you propellant,
    which costs you two years of cruise, which costs you the transmitter you needed to send any of it home.
    <br><br>Pick a real NASA science objective. Build the spacecraft. Choose a launch window off a real
    Lambert solution. Then fly it, and live with what you built.</p>
    <div class="dsn"><span class="dot"></span>
      <span>${esc(d[0])} is tracking ${esc(d[1])} &mdash; ${esc(d[2])}</span>
      ${infoTag(SRC.dsn,"Deep Space Network")}
    </div>
    <div class="modes">
      <button class="btn primary" data-act="start">START A MISSION</button>
      <button class="btn ghost" data-act="how">HOW IT WORKS</button>
      <button class="btn ghost" data-act="devjump" title="Dev scene jump menu (?s= shortcuts)">DEV JUMP &#8681;</button>
    </div>
    <p class="hint" style="margin-top:22px;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em">
      NASA-DERIVED DATA &#183; INDEPENDENT SPACE APPS CHALLENGE PROTOTYPE</p>
  </div></div>`;
}

/* ── MISSION SELECT ── */
function scrSelect(){
  return `<div class="wrap">
    <div class="spread mb">
      <div><h2>Choose a mission</h2>
        <p class="hint">Each mission adds exactly one new constraint. Play them in order the first time.</p></div>
      <div class="tape">${S.mode==="cadet"?"CADET MODE":"FLIGHT DIRECTOR MODE"}</div>
      <div><button class="sysbtn" data-act="gohome" title="Back to homescreen">&#8962; HOME</button></div>
    </div>
    <div class="selstage">
    <div class="panel selview"><span class="bracket tl"></span><span class="bracket br"></span>
      <h3>DESTINATION <span class="code">NAV-01</span></h3>
      <div id="selview"><div class="selview-fallback" aria-hidden="true"></div></div>
      <div class="selcap" id="selcap" aria-live="polite">
        <div class="sc-row"><span class="sc-dest">DESTINATION · EARTH</span></div>
        <div class="sc-name">First Light</div>
        <div class="sc-sub">Earth observer, Sun-synchronous orbit</div>
        <div class="sc-stats"><span>1.00 AU</span><span>3 YR</span><span>$400M CAP</span><span>0.3 KRAD/YR</span></div>
      </div>
    </div>
    <div class="lvgrid">${LEVELS.map((L,idx)=>{
      const done=S.progress[L.id];
      return `<button class="lvcard" data-act="level" data-id="${L.id}" style="--i:${idx}">
        <span class="bracket tl"></span><span class="bracket br"></span>
        ${done?`<span class="grade">${done.grade}</span>`:""}
        <span class="lvart lvart-${L.body}" aria-hidden="true"></span>
        <span class="top">
          <span class="kicker">MISSION ${L.num} &#183; ${esc(BODY[L.body].n.toUpperCase())}</span>
          <h3>${L.name}</h3>
          <span class="sub">${esc(L.sub)}</span>
          <span class="new">New: ${esc(L.newMech)}</span>
        </span>
        <span class="bot"><span>${L.years} yr &#183; cap $${fmt(L.capM)}M</span><span class="go">FLY &#9656;</span></span>
      </button>`}).join("")}</div>
    </div>
  </div>`;
}

/* ── BRIEFING ── */
function scrBrief(){
  const L=byId(LEVELS,S.levelId);
  const sel=S.objectives;
  const wmax=Math.max(...L.objs.map(o=>OBJ[o].w));
  const auStr=L.mode==="leo"?L.altKm+" KM SSO":L.body==="moon"?"0.4M KM":BODY[L.body].au.toFixed(2)+" AU";
  const ltStr=L.mode==="leo"?(L.altKm/299792.458*1000).toFixed(1)+" MS":L.body==="moon"?"1.3 S":(BODY[L.body].au*499/60).toFixed(1)+" MIN";
  return `<div class="wrap briefwrap">
  <div id="briefview" aria-hidden="true"><div class="briefview-fallback"></div></div>
  <div class="briefdossier">
    <span class="kicker">MISSION ${L.num} &#183; DESTINATION ${esc(BODY[L.body].n.toUpperCase())}</span>
    <h1>${L.name}</h1>
    <span class="bsub">${esc(L.sub)}</span>
    <div class="bstats"><span>${auStr}</span><span>${ltStr} ONE-WAY LIGHT</span><span>${L.years} YR</span><span>$${fmt(L.capM)}M CAP</span></div>
  </div>
  <div class="brief">
    <div class="panel glass"><span class="bracket tl"></span><span class="bracket br"></span>
      <h3>MISSION BRIEF <span class="code">FRM-01</span></h3>
      <div class="pad">
        <p class="hint" style="margin-bottom:10px">${esc(L.real)}</p>
        <p style="line-height:1.65;max-width:62ch;font-size:13.5px">${esc(L.brief)}</p>
        <div class="heritage">${esc(L.newMech)} This is the only new thing in this mission &mdash; everything else you already know.</div>
        <dl class="briefstats">
          <dt class="hint">Deep Space Network time ${infoTag(SRC.dsn,"DSN pass allocation")}</dt><dd class="num">${L.dsnHrs} h/day</dd>
          <dt class="hint">Radiation environment ${infoTag(SRC.nssdc,"Radiation dose")}</dt><dd class="num">${L.dose} krad/yr</dd>
        </dl>
      </div>
    </div>
    <div class="panel glass"><span class="bracket tl"></span><span class="bracket br"></span>
      <h3>SCIENCE OBJECTIVES <span class="code">${sel.length} SELECTED</span></h3>
      <div class="pad">
        ${L.body==="moon"?`<p class="hint" style="margin-bottom:8px">LANDING SITE &mdash; pick one. Rugged ice-rich ground costs divert propellant and power duty; benign mare costs traverse distance to the good science.</p>
        <div class="objlist" id="siteList">
        ${MOON_SITES.map((s,idx)=>{
          const on=S.site===s.id;
          return `<button class="obj site ${on?'sel':''}" data-act="site" data-id="${s.id}" style="--i:${idx}">
            <span class="box">${on?"\u2715":""}</span>
            <span><span class="t">${esc(s.n)}</span>
            <span class="d">${esc(s.lat)} · ${esc(s.lon)} — ${esc(s.d)}</span>
            <span class="need"><span class="nchip">slope ${s.slope}°</span><span class="nchip">sun ${(s.sun*100).toFixed(0)}%</span><span class="nchip">earth-view ${(s.earth*100).toFixed(0)}%</span><span class="nchip">sci ×${s.sci.toFixed(2)}</span><span class="wnum">${s.travKm} km to prime target</span></span>
            <span class="mini" title="Site hazard — share of the roughest option"><i style="width:${(s.hazard/0.6*100).toFixed(0)}%"></i></span></span>
          </button>`}).join("")}
        </div>
        <p class="hint mt-s" id="siteFx">${S.site?esc(byId(MOON_SITES,S.site).fx):"No site selected — the BUILD button unlocks once you commit to a site."}</p>`:""}
        <p class="hint" style="margin-bottom:8px">Pick at least ${L.req}. Every objective you take must be
        matched by an instrument that can measure it &mdash; and every instrument costs you mass.</p>
        <div class="objlist${L.objs.length>4?' many':''}">
        ${L.objs.map((oid,idx)=>{
          const o=OBJ[oid], on=sel.includes(oid), forced=(L.force||[]).includes(oid);
          return `<button class="obj ${on?'sel':''} ${forced?'req':''}" data-act="obj" data-id="${oid}" style="--i:${idx}">
            <span class="box">${on?"\u2715":""}</span>
            <span><span class="t">${esc(o.t)}${forced?' <span class="tag">REQUIRED</span>':''}</span>
            <span class="d">${esc(o.d)}</span>
            <span class="need">${o.need.map(t=>`<span class="nchip">${t}</span>`).join("")}<span class="wnum">${fmtData(needMb(L,oid))} &#183; weight ${o.w}</span></span>
            <span class="mini" title="Scoring weight — share of the science score this objective is worth"><i style="width:${(o.w/wmax*100).toFixed(0)}%"></i></span></span>
          </button>`}).join("")}
        </div>
        <div class="row mt">
          <button class="btn primary" data-act="tobuild" ${sel.length<L.req||(L.body==="moon"&&!S.site)?"disabled":""}>BUILD THE SPACECRAFT</button>
          <button class="btn ghost" data-act="home">BACK</button>
        </div>
        ${sel.length<L.req?`<p class="hint mt-s">Select ${L.req-sel.length} more objective${L.req-sel.length>1?"s":""} to continue.</p>`:(L.body==="moon"&&!S.site?`<p class="hint mt-s">Commit to a landing site above to continue.</p>`:"")}
      </div>
    </div>
  </div></div>`;
}

/* ── Phase-2 rover kit panels (L2 systems step; same .part grammar as pick()) ── */
function roverPanels(){
  const L=byId(LEVELS,S.levelId), D=derive(S), st=moonSite(S);
  const grp=(label,list,key,code,detail)=>`
    <div class="panel mt"><h3>${label} <span class="code">${code}</span></h3>
    ${list.map(x=>{
      const on=S.rover&&S.rover[key]===x.id;
      return `<button class="part ${on?'on':''}" data-act="rover" data-k="${key}" data-id="${x.id}">
        <span class="pn"><span>${esc(x.n)}</span>${infoTag(x.p,x.n)}</span>
        <span class="ps"><span>${detail(x)}</span></span>
        <span class="ps"><span style="color:var(--dimmer)">${esc(x.d)}</span></span></button>`}).join("")}
    </div>`;
  const compat=st?(()=>{ 
    const rows=[
      ["Clears site slopes",D.rvSlopeOk,`${D.rv?D.rv.rm.slope:0}° chassis vs ${st.slope}° ground (margin ${D.rvSlopeMargin>=0?"+":""}${D.rvSlopeMargin}°)`],
      ["Survives the night",D.rvNightOk,D.rvNightNeed>0?"Site needs hibernation-grade heat":"Polar light — day ops suffice"],
      ["Link closes",D.rvComOk,D.rvComNeed>=2?"Rim site needs orbiter relay":(D.rvComNeed>=1?"Low-horizon site needs aimed HGA":"Earth rides high — omni suffices")]
    ];
    return `<div class="panel mt"><h3>SURFACE COMPATIBILITY <span class="code">SRF-09</span></h3><div class="pad">
      ${rows.map(r=>`<div class="spread" style="padding:4px 0;font-size:12.5px">
        <span style="color:${r[1]?'var(--phosphor)':'var(--red)'}">${r[1]?"\u2713":"\u2715"} ${r[0]}</span>
        <span class="num hint" style="font-size:11px">${esc(r[2])}</span></div>`).join("")}
      <div class="spread" style="padding:4px 0;font-size:12.5px"><span class="hint">Surface science yield</span>
        <span class="num">×${D.rvSci.toFixed(2)} (payload × site)</span></div>
      <div class="hint" style="font-size:11px;line-height:1.6">Rover mass, draw and cost ride the standard books above. A red row will not stop launch — it prices the landing this kit cannot survive.</div>
    </div></div>`})():"";
  return grp("ROVER MOBILITY",ROVER_MOB,"mob","SRV-05",x=>`slopes to ${x.slope}° · ${x.m} kg · $${x.c}M`)
    + grp("ROVER POWER",ROVER_PWR,"pwr","SRV-06",x=>`${x.draw} W draw · ${["day ops","hibernates","night-capable"][x.night]} · ${x.m} kg · $${x.c}M`)
    + grp("ROVER COMMS",ROVER_COM,"com","SRV-07",x=>`${["omni DTE","aimed DTE","DTE + relay"][x.gain]} · ${x.draw} W · ${x.m} kg · $${x.c}M`)
    + grp("ROVER PAYLOAD",ROVER_PAY,"pay","SRV-08",x=>`sci ×${x.sci.toFixed(2)} · ${x.draw} W · ${x.m} kg · $${x.c}M`)
    + compat;
}

/* ── BUILD BAY ── */
function scrBuild(){
  const L=byId(LEVELS,S.levelId), D=derive(S);
  const groups={};
  L.parts.forEach(id=>{const x=byId(INSTR,id); (groups[x.g]=groups[x.g]||[]).push(x)});
  const need=new Set(); S.objectives.forEach(o=>OBJ[o].need.forEach(t=>need.add(t)));
  const have=objTags(S);
  const missing=[...need].filter(t=>!have.has(t));

  const catHtml = Object.keys(groups).map(g=>
    `<div class="catgrp">${g.toUpperCase()}</div>`+
    groups[g].map(x=>{
      const on=S.instruments.includes(x.id);
      const useful=x.tags.some(t=>need.has(t));
      return `<button class="part ${on?'on':''}" data-act="instr" data-id="${x.id}">
        <span class="pn"><span>${esc(x.n)}</span>${useful?'<span class="tag" style="border-color:var(--nasa-blue);color:var(--blue-lift)">USEFUL</span>':''}</span>
        <span class="ps"><span><b>m</b> ${x.m} kg</span><span><b>P</b> ${x.w} W</span>
        <span><b>D</b> ${x.d} Mb/s</span><span><b>$</b> ${x.c}M</span><span title="Technology Readiness Level — instruments below TRL 8 add development schedule"><b>TRL</b> ${x.trl}</span></span>
        <span class="ps"><span style="color:var(--dimmer)">measures: ${x.tags.join(" · ")}</span></span>
      </button>`}).join("")
  ).join("");

  const pick=(label,list,key,code)=>`
    <div class="panel mt"><h3>${label} <span class="code">${code}</span></h3>
    ${list.map(x=>{
      const on=S[key]===x.id;
      const detail = key==="shield"
        ? `${x.f<1?"dose \u00D7 "+x.f.toFixed(3):"full environment"} &#183; ${x.m} kg &#183; $${x.c}M`
        : key==="power"
        ? `${x.solar?fmt(solarPower(x.bol,D.auDist,0,x.deg))+" W at target":x.bol+" W BOL"} &#183; ${x.m} kg &#183; $${x.c}M${x.sch?" &#183; +"+x.sch+" mo":""}`
        : key==="comms" ? `${x.gain} dBi &#183; ${x.w} W &#183; ${x.m} kg &#183; $${x.c}M`
        : `${x.isp?"Isp "+x.isp+" s":"no propulsion"} &#183; ${x.m} kg &#183; $${x.c}M`;
      return `<button class="part ${on?'on':''}" data-act="${key}" data-id="${x.id}">
        <span class="pn"><span>${esc(x.n)}</span>${infoTag(x.p,x.n)}</span>
        <span class="ps"><span>${detail}</span></span></button>`}).join("")}
    </div>`;

  /* 3A.1: one step = one job. PAYLOAD (what science) → SYSTEMS (can it fly)
     → REVIEW (are we ready). State lives in S;derivations unchanged. */
  if(!S.bstep)S.bstep="payload";
  const steps=[["payload","1 · PAYLOAD","What science will we perform?"],
              ["systems","2 · SYSTEMS","Can the spacecraft support it?"],
              ["review","3 · REVIEW","Are we actually ready?"]];
  const si=steps.findIndex(s=>s[0]===S.bstep);
  const stepTabs=`<div class="panel"><div class="pad spread" style="gap:8px">
    <span class="hint" style="font-size:11px">${esc(steps[si][2])}</span>
    <span class="spd">${steps.map((s,k)=>`<button data-act="bstep" data-v="${s[0]}" class="${k===si?'on':''}" ${k===2&&S.instruments.length===0?"disabled":""}>${s[1]}</button>`).join("")}</span>
  </div></div>`;

  const coverRows=S.objectives.map(oid=>{
    const ok=objMet(S,oid);
    const tags=objTags(S);
    const lack=OBJ[oid].need.filter(t=>!tags.has(t));
    return `<div class="spread" style="padding:4px 0;font-size:12px">
      <span style="color:${ok?'var(--phosphor)':'var(--red)'}" title="${ok?"Covered by selected instruments":"Missing measurement: "+lack.join(", ")}">${ok?"\u25CF READY":"\u25CB NOT READY"} ${esc(OBJ[oid].t)}${ok?"":" — needs "+lack.join(", ")}</span>
      <span class="num hint">${fmtData(needMb(byId(LEVELS,S.levelId),oid))}</span></div>`}).join("");
  const coverNote=missing.length?`<div class="ghost-note">No instrument covers: ${missing.join(", ")}. Those objectives will return nothing.</div>`:
    `<div class="ghost-note" style="color:var(--phosphor)">Every selected objective has an instrument that can measure it.</div>`;

  if(S.bstep==="payload"){
    return `<div class="wrap"><div class="bay" style="grid-template-columns:1fr 330px">
    <div>
      ${stepTabs}
      <div class="panel mt"><h3>INSTRUMENT CATALOGUE <span class="code">PLD-01</span></h3>
        <div class="pad hint" style="font-size:11px;border-bottom:1px solid var(--hairline)">Data rates assume instruments observe ~12% of the time. Match <b>USEFUL</b> tags to your objectives.</div>
        <div class="cat" style="max-height:520px;overflow:auto">${catHtml}</div></div>
    </div>
    <div>
      <div class="panel"><h3>OBJECTIVES <span class="code">SCI-01</span></h3><div class="pad">${coverRows}${coverNote}</div></div>
      <div class="panel mt"><h3>SPACECRAFT <span class="code">3D-01</span></h3><div class="v3host v3compact" id="v3payload"></div></div>
      <div class="row mt">
        <button class="btn primary" data-act="bstep" data-v="systems" ${S.instruments.length===0?"disabled":""}>CONFIGURE SYSTEMS</button>
        <button class="btn ghost" data-act="tobrief">BACK</button>
      </div>
      ${S.instruments.length===0?`<p class="hint mt-s">Select at least one instrument to continue.</p>`:""}
    </div>
    </div></div>`;
  }

  if(S.bstep==="systems"){
    return `<div class="wrap"><div class="bay">
    <div>
      ${stepTabs}
      ${pick("POWER SOURCE",L.power.map(id=>byId(POWER,id)),"power","PWR-02")}
    </div>

    <div>
      <div class="panel"><span class="bracket tl"></span><span class="bracket br"></span>
        <h3>SPACECRAFT &mdash; ${esc(byId(LEVELS,S.levelId).name.toUpperCase())} <span class="code">STR-04</span></h3>
        <div class="v3host v3bay" id="v3systems"></div>
        <canvas id="bayCanvas" width="880" height="470" role="img" aria-label="PBR spacecraft engineering preview with dynamic mounting points"></canvas>
        <div class="model-asset-note"><span class="model-chip">NASA / GLB</span><span>3D: SATELLITE KIT (BODY + ARRAYS + ANTENNA FROM YOUR BUILD)</span><span>2D: SCHEMATIC</span><a href="MODEL_SOURCES.md" target="_blank" rel="noopener">MODEL SOURCES</a></div>
        <div class="readout">
          <div><div class="k">DRY MASS</div><div class="v">${fmt(D.dryMass)}<span style="font-size:10px;color:var(--dim)"> kg</span></div></div>
          <div><div class="k">PROPELLANT</div><div class="v">${fmt(D.propMass)}<span style="font-size:10px;color:var(--dim)"> kg</span></div></div>
          <div><div class="k">&#916;V BUDGET</div><div class="v">${fmt(D.dvTotal,2)}<span style="font-size:10px;color:var(--dim)"> km/s</span></div></div>
          <div><div class="k">POWER AT TARGET</div><div class="v">${fmt(D.genEOL)}<span style="font-size:10px;color:var(--dim)"> W</span></div></div>
          <div><div class="k">DOSE OVER MISSION</div><div class="v" style="color:${L.dose*D.sh.f*L.years>80?'var(--red)':L.dose*D.sh.f*L.years>30?'var(--amber)':'var(--bone)'}">${fmt(L.dose*D.sh.f*L.years)}<span style="font-size:10px;color:var(--dim)"> krad</span></div></div>
          <div><div class="k">DOWNLINK</div><div class="v">${D.rate>1e6?fmt(D.rate/1e6,1)+" Mb/s":D.rate>1e3?fmt(D.rate/1e3,1)+" kb/s":fmt(D.rate)+" b/s"}</div></div>
        </div>
      </div>
      ${D.dv.length?`<div class="panel mt"><h3>DELTA-V BUDGET ${infoTag(SRC.nssdc,"Delta-v line items")} <span class="code">GNC-07</span></h3>
        <div class="pad" style="font-family:var(--mono);font-size:12px">
        ${D.dv.map(x=>`<div class="spread" style="padding:3px 0"><span style="color:var(--dim)">${esc(x[0])}</span><span>${x[1].toFixed(2)} km/s</span></div>`).join("")}
        <div class="spread" style="padding:7px 0 0;border-top:1px solid var(--hairline);margin-top:6px">
          <span>TOTAL</span><span style="color:var(--phosphor)">${D.dvTotal.toFixed(2)} km/s</span></div>
        <div class="hint" style="margin-top:8px;font-family:var(--sans)">Tsiolkovsky gives ${fmt(D.propMass)} kg of propellant for a ${fmt(D.dryMass)} kg dry spacecraft at Isp ${D.pr?D.pr.isp:0} s. ${infoTag(SRC.nssdc,"Rocket equation","We ignore gravity losses, finite-burn losses and residuals.")}</div>
        </div></div>`:""}
      <div class="row mt">
        <button class="btn primary" data-act="bstep" data-v="review">REVIEW READINESS</button>
        <button class="btn ghost" data-act="bstep" data-v="payload">BACK</button>
      </div>
    </div>

    <div>
      ${pick("COMMUNICATIONS",L.comms.map(id=>byId(COMMS,id)),"comms","TLM-11")}
      <div class="panel mt"><h3>DSN ALLOCATION ${infoTag(SRC.dsn,"DSN pass allocation")} <span class="code">TLM-12</span></h3>
      ${DSN.map(t=>{const on=S.dsn===t.id;
        const eff=(L.dsnHrs*t.f).toFixed(1);
        return `<button class="part ${on?'on':''}" data-act="dsn" data-id="${t.id}">
          <span class="pn"><span>${esc(t.n)} — ${eff} h/day</span></span>
          <span class="ps"><span>${esc(t.d)}</span></span></button>`}).join("")}
      </div>
      ${L.dose>=2?pick("RADIATION SHIELDING",SHIELD,"shield","RAD-05"):""}
      ${pick("PROPULSION",L.prop.map(id=>byId(PROP,id)),"prop","PRP-03")}
      ${L.body==="moon"&&S.rover?roverPanels():""}
    </div>
  </div></div>`;
  }

  /* review step */
  const ready=[
    ["Objectives covered by instruments",S.objectives.every(o=>objMet(S,o)),
      S.objectives.filter(o=>!objMet(S,o)).length+" uncovered"],
    ["Power positive at end of life",D.genEOL>=D.loadPeak,`${fmt(D.loadPeak)} W load vs ${fmt(D.genEOL)} W`],
    ["Within cost cap",D.cost<=L.capM,`$${fmt(D.cost)}M vs $${fmt(L.capM)}M`],
    ["Launch readiness within 72 months",D.months<=72,`${fmt(D.months)} months`]
  ];
  /* Phase-2: L2 review gates rover↔site survival visibly — no hidden traps. */
  if(S.levelId==="l2"&&S.rover&&moonSite(S)){
    ready.push(["Rover clears site slopes",D.rvSlopeOk,`chassis ${D.rv.rm.slope}° vs ground ${moonSite(S).slope}°`]);
    ready.push(["Rover night + link compatible",D.rvNightOk&&D.rvComOk,
      `${D.rvNightOk?"heat OK":"no night heat"} · ${D.rvComOk?"link OK":"no link"}`]);
  }
  const allReady=ready.every(r=>r[1]);
  const retFrac=D.genMbPerDay>0?Math.min(1,D.downMbPerDay/D.genMbPerDay):1;
  return `<div class="wrap"><div style="max-width:760px;margin:0 auto">
    ${stepTabs}
    <div class="panel mt"><span class="bracket tl"></span><span class="bracket br"></span>
      <h3>SPACECRAFT <span class="code">3D-01</span></h3>
      <div class="v3host v3compact" id="v3review"></div>
    </div>
    <div class="panel mt"><span class="bracket tl"></span><span class="bracket br"></span>
      <h3>MISSION REVIEW <span class="code">REV-01</span></h3>
      <div class="pad">
        <div class="spread" style="font-size:12.5px;padding:2px 0"><span class="hint">Spacecraft</span><span class="num">${fmt(D.wetMass)} kg wet &#183; ${S.instruments.length} instruments</span></div>
        <div class="spread" style="font-size:12.5px;padding:2px 0"><span class="hint">Systems</span><span class="num" style="font-size:11.5px">${esc(D.pw?D.pw.n:"—")} &#183; ${esc(D.cm?D.cm.n:"—")} &#183; ${esc(D.pr?D.pr.isp?D.pr.n:"—":"—")}${D.rv?` &#183; rover ${D.rvMass} kg/${D.rvDraw} W`:``}</span></div>
        <div class="spread" style="font-size:12.5px;padding:2px 0"><span class="hint">DSN allocation</span><span class="num" style="font-size:11.5px">${esc(dsnTier().n)} (${(L.dsnHrs*dsnTier().f).toFixed(1)} h/day)</span></div>
        <div class="spread" style="font-size:12.5px;padding:2px 0"><span class="hint">Trajectory</span><span class="num" style="font-size:11.5px">selected on the launch screen</span></div>
        <div class="hint" style="font-size:11px;line-height:1.6">Spacecraft view: representative model (NASA Satellite Kit, generic parts) · instruments schematic · launcher illustration dimensionally anchored to manufacturer/NASA figures. Full register: MISSION DATA.</div>
      </div>
    </div>
    <div class="panel mt"><h3>READINESS <span class="code">REV-02</span></h3><div class="pad">
      ${ready.map(r=>`<div class="spread" style="padding:4px 0;font-size:12.5px">
        <span style="color:${r[1]?'var(--phosphor)':'var(--red)'}">${r[1]?"\u2713":"\u2715"} ${r[0]}</span>
        <span class="num hint" style="font-size:11px">${r[2]}</span></div>`).join("")}
      ${retFrac<0.9?`<div class="ghost-note">Caution — the link returns only ${(retFrac*100).toFixed(0)}% of what the instruments generate. This will not stop a launch, but much of the data will be discarded.</div>`:""}
      <div style="text-align:center;margin:14px 0 6px"><span class="stamp ${allReady?'go':'nogo'}">${allReady?"READY":"NOT READY"}</span></div>
    </div></div>
    <div class="panel mt"><h3>OBJECTIVE COVERAGE <span class="code">SCI-01</span></h3>
      <div class="pad">${coverRows}${coverNote}</div></div>
    <div class="row mt">
      <button class="btn primary" data-act="tolaunch" ${S.instruments.length===0||!S.power||!S.comms||!S.prop?"disabled":""}>GO TO LAUNCH</button>
      <button class="btn ghost" data-act="bstep" data-v="systems">BACK</button>
    </div>
    ${S.mode==="cadet"?`<p class="hint mt-s" style="font-size:11.5px">The launch screen adds trajectory energy and the vehicle — the final readiness check happens there.</p>`:""}
  </div></div>`;
}

/* ── spacecraft engineering preview ── */
const BUS_PREVIEW = new Image();
BUS_PREVIEW.src = "assets/margin-mission-bus-preview.png";
BUS_PREVIEW.onload = ()=>{ if(S.screen==="build") drawBay(); };
function drawBay(){
  const cv=el("bayCanvas"); if(!cv)return;
  const f=fitCanvas(cv,880,470), x=f.x, W=f.W, H=f.H, D=derive(S);
  x.clearRect(0,0,W,H);
  x.fillStyle="#040A13"; x.fillRect(0,0,W,H);
  if(BUS_PREVIEW.complete && BUS_PREVIEW.naturalWidth){
    const scale=Math.min(W/BUS_PREVIEW.naturalWidth,H/BUS_PREVIEW.naturalHeight);
    const iw=BUS_PREVIEW.naturalWidth*scale, ih=BUS_PREVIEW.naturalHeight*scale;
    x.globalAlpha=.98; x.drawImage(BUS_PREVIEW,(W-iw)/2,(H-ih)/2,iw,ih); x.globalAlpha=1;
  } else {
    x.fillStyle="#667384"; x.font="10px JetBrains Mono, IBM Plex Mono, Consolas, monospace";
    x.fillText("LOADING ENGINEERING ASSET...",28,28);
  }
  x.strokeStyle="rgba(58,120,209,.35)"; x.lineWidth=1; x.setLineDash([6,6]);
  x.strokeRect(34,34,W-68,H-68); x.setLineDash([]);
  x.strokeStyle="rgba(58,120,209,.26)"; x.beginPath(); x.moveTo(W/2,76); x.lineTo(W/2,H-76); x.moveTo(76,H/2); x.lineTo(W-76,H/2); x.stroke();

  const mounts=[[-72,-50],[0,-58],[72,-50],[-72,0],[0,0],[72,0],[-72,52],[0,52],[72,52]];
  const usefulTags=new Set(); S.objectives.forEach(o=>OBJ[o].need.forEach(t=>usefulTags.add(t)));
  mounts.forEach((m,i)=>{
    const px=W/2+m[0], py=H/2+15+m[1];
    const active=!!D.instr[i];
    const useful=active && D.instr[i].tags.some(t=>usefulTags.has(t));
    x.strokeStyle=active?(useful?"#65F2A5":"#4B82D7"):"rgba(140,150,163,.30)"; x.lineWidth=1.2;
    x.strokeRect(px-10,py-7,20,14);
    if(active){ x.fillStyle=useful?"rgba(101,242,165,.15)":"rgba(75,130,215,.12)"; x.fillRect(px-10,py-7,20,14); }
  });

  x.font="10px JetBrains Mono, IBM Plex Mono, Consolas, monospace";
  x.fillStyle="#E7ECF2"; x.fillText(`${D.instr.length} PAYLOAD MODULE${D.instr.length===1?"":"S"} ACTIVE`,28,22);
  x.fillStyle="#9AA6B5"; x.fillText(`WET ${fmt(D.wetMass)} KG`,28,38);
  x.textAlign="right";
  x.fillText(D.pw?`PWR ${fmt(D.genEOL)} W EOL`:"PWR SOURCE OFFLINE",W-28,22);
  x.fillText(`BUS STATUS ${D.margins.power<0?"CRITICAL":D.margins.power<.15?"WARNING":"NOMINAL"}`,W-28,38);
  x.fillStyle="#667384"; x.fillText("2D SCHEMATIC / 3D: NASA SATELLITE KIT",W-28,H-22);
  x.textAlign="left";
}

/* ══════════════════════════════════════════════════════════════
   LAUNCH
   ══════════════════════════════════════════════════════════════ */
function scrLaunch(){
  const L=byId(LEVELS,S.levelId);
  const D=derive(S);
  const body = L.mode==="pork" ? `
      <div class="panel"><span class="bracket tl"></span><span class="bracket br"></span>
        <h3>PORKCHOP PLOT &mdash; EARTH TO ${esc(BODY[L.body].n.toUpperCase())} ${infoTag(SRC.horizons,"Lambert solution")}
          <span class="spd" style="margin-left:auto">
            <button data-act="pmode" data-v="c3" class="${S.pmode==='vinf'?'':'on'}">DEPARTURE C3</button>
            <button data-act="pmode" data-v="vinf" class="${S.pmode==='vinf'?'on':''}">ARRIVAL V&#8734;</button>
          </span></h3>
        <canvas id="pork" width="900" height="480" role="img" aria-label="Porkchop plot of departure energy"></canvas>
        <div class="readout" id="porkOut"></div>
      </div>
      <p class="hint mt-s">Click anywhere in the plot. Each point is a Lambert solution between Earth's and
      ${esc(BODY[L.body].n)}'s real orbits, solved in your browser. Dark means cheap.
      <b style="color:var(--bone);font-weight:500">Departure energy and arrival energy do not have their minima in the same place</b>
      &mdash; a cheap launch usually means an expensive arrival, and you pay for that one in propellant.
      <br><span title="C3 (departure energy): how hard the launcher must throw the spacecraft. Lower C3 means more vehicles can lift your mass.">C3 = departure energy (lower is easier to launch).</span>
      <span title="V-infinity (arrival energy): how fast you arrive relative to the target. Higher means more propellant to slow down or rendezvous.">Arrival V&#8734; = arrival speed (higher costs propellant).</span></p>`
    : L.mode==="fixedC3" ? `
      <div class="panel"><h3>TRANSLUNAR INJECTION <span class="code">TRJ-01</span></h3>
        <div class="pad"><p class="hint">Translunar injection needs C3 = ${L.c3} km&sup2;/s&sup2; &mdash; barely more than
        Earth escape &mdash; and a window opens roughly every month. The hard part is not getting there. It is stopping.</p>
        <div class="readout mt"><div><div class="k">C3</div><div class="v">${L.c3}</div></div>
        <div><div class="k">CRUISE</div><div class="v">${L.tof} d</div></div>
        <div><div class="k">CAPTURE &#916;V</div><div class="v">${fmt(D.dvTotal,2)} km/s</div></div></div></div></div>`
    : `<div class="panel"><h3>ORBIT SELECTION <span class="code">TRJ-01</span></h3>
        <div class="pad"><p class="hint">A ${L.altKm} km Sun-synchronous orbit crosses the equator at the same
        local solar time on every pass, so every image has the same lighting. It costs a dog-leg at launch,
        which is why only about a third of a vehicle's low-Earth-orbit capability reaches it.</p>
        <div class="readout mt"><div><div class="k">ALTITUDE</div><div class="v">${L.altKm} km</div></div>
        <div><div class="k">INCLINATION</div><div class="v">98.1&deg;</div></div>
        <div><div class="k">PERIOD</div><div class="v">98.6 min</div></div>
        <div><div class="k">GROUND CONTACTS</div><div class="v">${L.dsnHrs} h/d</div></div></div></div></div>`;

  return `<div class="wrap"><div class="launchgrid">
    <div>${body}</div>
    <div>
      <div class="panel"><h3>LAUNCH VEHICLE ${infoTag(SRC.lsp,"Launch vehicle performance")} <span class="code">LSP-01</span></h3>
        <div id="lvList"></div>
      </div>
      ${L.assist?`<div class="panel mt"><h3>TRAJECTORY OPTION <span class="code">TRJ-02</span></h3>
        <div class="pad">
          <button class="obj ${S.assist?'sel':''}" data-act="assist" style="margin:0">
            <span class="box">${S.assist?"\u2715":""}</span>
            <span><span class="t">${esc(L.assist.label)}</span>
            <span class="d">Borrow momentum from two planets instead of buying it at launch.
            Departure energy drops to C3 ${L.assist.c3} km&sup2;/s&sup2;, which roughly triples what any
            vehicle can lift &mdash; but you add ${(L.assist.addDays/365.25).toFixed(1)} years of cruise
            and $${L.assist.costM}M of operations.</span></span>
          </button>
          ${!S.assist?`<p class="hint mt-s" style="font-size:11.5px">A direct transfer to Jupiter needs
          C3 near ${S.launch&&S.launch.set?S.launch.c3.toFixed(0):"75"} km&sup2;/s&sup2;. No vehicle on this
          list can throw a spacecraft this heavy that hard.</p>`:""}
        </div></div>`:""}
      <div class="panel mt" id="goBox"></div>
    </div>
  </div></div>`;
}

let PORK=null;
function initLaunch(){
  const L=byId(LEVELS,S.levelId);
  if(!S.launch) S.launch={lv:null,c3:0,vinf:0,tof:0,tDep:0,i:0,j:0};
  if(L.mode==="pork"){
    PORK=porkchop(L.id,L.body,L.depart,L.tofRange,90,70);
    if(!S.launch.set){
      const b=PORK.best||{i:45,j:35};
      applyPork(b.i,b.j,true);
    }
    drawPork(); renderPorkOut();
    const cv=el("pork");
    const pick=e=>{
      const r=cv.getBoundingClientRect();
      const lw=cv.clientWidth||cv.width, lh=cv.clientHeight||cv.height;
      const px=(e.clientX-r.left)/r.width*lw, py=(e.clientY-r.top)/r.height*lh;
      const M={l:62,r:18,t:14,b:38};
      const i=(px-M.l)/(lw-M.l-M.r)*(PORK.NX-1);
      const j=(1-(py-M.t)/(lh-M.t-M.b))*(PORK.NY-1);
      if(i<0||j<0||i>PORK.NX-1||j>PORK.NY-1)return;
      const prev=railValues(derive(S));
      applyPork(i,j); drawPork(); renderPorkOut(); renderHUD(); renderLV(); cascade(prev); Audio_.click();
    };
    cv.addEventListener("click",pick);
    cv.addEventListener("pointermove",e=>{if(e.buttons===1)pick(e)});
  }else if(L.mode==="fixedC3"){
    S.launch.c3=L.c3; S.launch.vinf=0; S.launch.tof=L.tof; S.launch.tDep=2029.2; S.launch.set=true;
  }else{
    S.launch.c3=0; S.launch.vinf=0; S.launch.tof=0; S.launch.tDep=2029.0; S.launch.set=true;
  }
  renderLV();
}
function applyPork(i,j,silent){
  const p=porkAt(PORK,i,j);
  if(!isFinite(p.c3))return;
  S.launch.i=p.i;S.launch.j=p.j;S.launch.c3=p.c3;S.launch.vinf=p.vinf;
  S.launch.tof=p.tof;S.launch.tDep=p.tDep;S.launch.set=true;S.launch.outcome=null;S.launch.acked=false;
}
function c3Color(v,min,max){
  const t=clamp((v-min)/Math.max(1e-6,max-min),0,1);
  // deep blue -> teal -> phosphor -> amber -> red
  const stops=[[5,20,54],[11,61,145],[32,120,150],[94,246,160],[255,176,0],[252,61,33]];
  const f=t*(stops.length-1), k=Math.min(stops.length-2,Math.floor(f)), g=f-k;
  const a=stops[k],b=stops[k+1];
  return `rgb(${a.map((v2,n)=>Math.round(v2+(b[n]-v2)*g)).join(",")})`;
}
function drawPork(){
  const cv=el("pork"); if(!cv||!PORK)return;
  const f=fitCanvas(cv,900,480), x=f.x, W=f.W, H=f.H;
  const M={l:62,r:18,t:14,b:38};
  const pw=W-M.l-M.r, ph=H-M.t-M.b;
  x.fillStyle="#04060B";x.fillRect(0,0,W,H);
  const cw=pw/(PORK.NX-1), ch=ph/(PORK.NY-1);
  const vinfMode = S.pmode==="vinf";
  const FLD = vinfMode?PORK.vinf:PORK.c3, LO=vinfMode?PORK.vmin:PORK.c3min, HI=vinfMode?PORK.vmax:PORK.c3max;
  for(let i=0;i<PORK.NX;i++)for(let j=0;j<PORK.NY;j++){
    const v=FLD[j*PORK.NX+i];
    if(!isFinite(v)){x.fillStyle="#04060B"}else{x.fillStyle=c3Color(v,LO,HI)}
    x.fillRect(M.l+i*cw-0.6, M.t+ph-j*ch-0.6, cw+1.2, ch+1.2);
  }
  // contour lines at round C3 values
  x.strokeStyle="rgba(5,7,13,.55)";x.lineWidth=1;
  const step=Math.max(vinfMode?0.25:2,(HI-LO)/8);
  for(let lev=Math.ceil(LO/step)*step; lev<HI; lev+=step){
    for(let i=0;i<PORK.NX-1;i++)for(let j=0;j<PORK.NY-1;j++){
      const a=FLD[j*PORK.NX+i], b=FLD[j*PORK.NX+i+1];
      if(isFinite(a)&&isFinite(b)&&((a<lev)!==(b<lev))){
        x.fillStyle="rgba(5,7,13,.5)";x.fillRect(M.l+i*cw,M.t+ph-j*ch,1.4,ch);
      }
    }
  }
  // axes
  x.strokeStyle="#1C2433";x.strokeRect(M.l,M.t,pw,ph);
  x.font="10px 'IBM Plex Mono',monospace";x.fillStyle="#8D93A1";
  for(let k=0;k<=4;k++){
    const t=PORK.depRange[0]+(PORK.depRange[1]-PORK.depRange[0])*k/4;
    const px=M.l+pw*k/4; x.textAlign="center";
    x.fillText(yrToDate(t).slice(0,7),px,H-22);
    x.strokeStyle="#1C2433";x.beginPath();x.moveTo(px,M.t+ph);x.lineTo(px,M.t+ph+4);x.stroke();
  }
  x.textAlign="right";
  for(let k=0;k<=4;k++){
    const v=PORK.tofRange[0]+(PORK.tofRange[1]-PORK.tofRange[0])*k/4;
    const py=M.t+ph-ph*k/4; x.fillText(Math.round(v)+" d",M.l-7,py+3);
  }
  x.textAlign="center";x.fillStyle="#5A6172";
  x.fillText("DEPARTURE DATE",M.l+pw/2,H-7);
  x.save();x.translate(13,M.t+ph/2);x.rotate(-Math.PI/2);x.fillText("TIME OF FLIGHT",0,0);x.restore();
  // crosshair
  if(S.launch&&S.launch.set){
    const px=M.l+pw*S.launch.i/(PORK.NX-1), py=M.t+ph-ph*S.launch.j/(PORK.NY-1);
    x.strokeStyle="#E8E6DF";x.lineWidth=1;
    x.beginPath();x.moveTo(px-16,py);x.lineTo(px-4,py);x.moveTo(px+4,py);x.lineTo(px+16,py);
    x.moveTo(px,py-16);x.lineTo(px,py-4);x.moveTo(px,py+4);x.lineTo(px,py+16);x.stroke();
    x.beginPath();x.arc(px,py,10,0,7);x.strokeStyle="rgba(232,230,223,.55)";x.stroke();
  }
  // legend
  const lw=130;
  for(let i=0;i<lw;i++){x.fillStyle=c3Color(LO+(HI-LO)*i/lw,LO,HI);
    x.fillRect(W-M.r-lw+i,M.t+6,1,7);}
  x.fillStyle="#8D93A1";x.textAlign="left";x.fillText(LO.toFixed(vinfMode?1:0),W-M.r-lw,M.t+26);
  x.textAlign="right";x.fillText(HI.toFixed(vinfMode?1:0)+(vinfMode?" km/s arrival":" km\u00B2/s\u00B2 departure"),W-M.r,M.t+26);
}
function renderPorkOut(){
  const box=el("porkOut"); if(!box)return;
  const D=derive(S), L=byId(LEVELS,S.levelId);
  const cap=captureDv(L.body,S.launch.vinf);
  box.innerHTML=`
    <div><div class="k">DEPART</div><div class="v">${yrToDate(S.launch.tDep)}</div></div>
    <div><div class="k">C3</div><div class="v">${S.launch.c3.toFixed(1)}<span style="font-size:10px;color:var(--dim)"> km&sup2;/s&sup2;</span></div></div>
    <div><div class="k">FLIGHT TIME</div><div class="v">${Math.round(S.launch.tof)}<span style="font-size:10px;color:var(--dim)"> d</span></div></div>
    <div><div class="k">ARRIVAL V&#8734;</div><div class="v">${S.launch.vinf.toFixed(2)}<span style="font-size:10px;color:var(--dim)"> km/s</span></div></div>
    <div><div class="k">CAPTURE &#916;V</div><div class="v" style="color:${cap>2.5?'var(--amber)':'var(--bone)'}">${cap.toFixed(2)}<span style="font-size:10px;color:var(--dim)"> km/s</span></div></div>
    <div><div class="k">ARRIVE</div><div class="v">${yrToDate(S.launch.tDep+S.launch.tof/365.25)}</div></div>`;
}
function renderLV(){
  const L=byId(LEVELS,S.levelId), D=derive(S);
  const box=el("lvList"); if(!box)return;
  const list=L.lvs.map(id=>byId(LV,id)).filter(Boolean);
  box.innerHTML=list.map(v=>{
    const cap = L.mode==="leo" ? v.leo*0.34 : lvCapability(v,S.launch?S.launch.c3:0);
    const ok = cap>=D.wetMass;
    return `<button class="lv ${S.launch&&S.launch.lv===v.id?'on':''} ${ok?'go':'nogo'}" data-act="lv" data-id="${v.id}">
      <span class="r1"><span>${esc(v.n)}</span><span class="cap">${fmt(cap)} kg</span></span>
      <span class="r2"><span>$${v.cost}M &#183; reliability ${(v.rel*100).toFixed(0)}%</span>
      <span class="cap">${ok?"+"+fmt(cap-D.wetMass)+" kg spare":fmt(D.wetMass-cap)+" kg over"}</span></span>
    </button>`}).join("");
  renderGo();
}
function renderGo(){
  const box=el("goBox"); if(!box)return;
  const D=derive(S), L=byId(LEVELS,S.levelId);
  if(!S.launch||!S.launch.lv){
    box.innerHTML=`<h3>FLIGHT READINESS <span class="code">FRR-01</span></h3>
      <div class="pad"><p class="hint">Select a launch vehicle. Its capability is read off the
      NASA Launch Services Program performance curve at your departure energy. ${infoTag(SRC.lsp,"C3 performance curve")}</p></div>`;
    return;
  }
  const checks=[
    ["Mass within launch capability", D.capability>=D.wetMass, `${fmt(D.wetMass)} kg vs ${fmt(D.capability)} kg`],
    ["Power positive at end of life", D.genEOL>=D.loadPeak, `${fmt(D.loadPeak)} W load vs ${fmt(D.genEOL)} W`],
    ["Within cost cap", D.cost<=L.capM, `$${fmt(D.cost)}M vs $${fmt(L.capM)}M`],
    ["Every objective has an instrument", S.objectives.every(o=>objMet(S,o)), S.objectives.filter(o=>!objMet(S,o)).length+" uncovered"],
    ["Launch readiness within 72 months", D.months<=72, `${fmt(D.months)} months`]
  ];
  const go=checks.every(c=>c[1]);
  const retFrac = D.genMbPerDay>0 ? Math.min(1,D.downMbPerDay/D.genMbPerDay) : 1;
  const fixes=[];
  if(D.capability<D.wetMass){
    const over=D.wetMass-D.capability;
    const cands=D.instr.slice().sort((a,b)=>b.m-a.m).slice(0,3);
    cands.forEach(i=>fixes.push(`Remove <b>${i.n}</b> &mdash; saves ${i.m} kg plus propellant`));
    const bigger=L.lvs.map(id=>byId(LV,id)).filter(v=>v&&(L.mode==="leo"?v.leo*0.34:lvCapability(v,S.launch.c3))>=D.wetMass);
    if(bigger.length) fixes.push(`Switch to <b>${bigger[0].n}</b> &mdash; ${fmt((L.mode==="leo"?bigger[0].leo*0.34:lvCapability(bigger[0],S.launch.c3))-D.wetMass)} kg spare`);
    if(L.mode==="pork") fixes.push(`Find a lower arrival V&#8734; on the plot &mdash; you are carrying ${fmt(D.propMass)} kg of propellant`);
    if(!fixes.length) fixes.push(`You are ${fmt(over)} kg over. Something has to go.`);
  }
  if(D.genEOL<D.loadPeak) fixes.push(`Power shortfall of ${fmt(D.loadPeak-D.genEOL)} W &mdash; larger array, or fewer instruments running at once`);
  if(D.cost>L.capM) fixes.push(`$${fmt(D.cost-L.capM)}M over cap &mdash; the cheapest cut is a lower-cost launch vehicle`);

  box.innerHTML=`<h3>FLIGHT READINESS REVIEW <span class="code">FRR-01</span></h3>
    <div class="pad">
      ${checks.map(c=>`<div class="spread" style="padding:4px 0;font-size:12px">
        <span style="color:${c[1]?'var(--phosphor)':'var(--red)'}">${c[1]?"\u2713":"\u2715"} ${c[0]}</span>
        <span class="num hint" style="font-size:11px">${c[2]}</span></div>`).join("")}
      ${retFrac<0.9?`<div class="ghost-note">Caution &mdash; the link can return only ${(retFrac*100).toFixed(0)}%
        of what your instruments generate. The rest will fill onboard storage and be discarded. This does not
        stop a launch; it just means you will not see most of the data you paid to collect.</div>`:""}
      <div style="text-align:center;margin:18px 0 10px"><span class="stamp ${go?'go':'nogo'}">${go?"GO":"NO-GO"}</span></div>
      ${go?`<button class="btn primary" style="width:100%" data-act="fly">COMMIT TO LAUNCH</button>
            <p class="hint mt-s" style="font-size:11.5px">Margins at launch: mass ${(D.margins.mass*100).toFixed(0)}%,
            power ${(D.margins.power*100).toFixed(0)}%, cost ${(D.margins.cost*100).toFixed(0)}%. Whatever you keep here is
            what you have left when something goes wrong.</p>`
           :`<ul class="fixlist">${fixes.slice(0,4).map(f=>`<li>${f}</li>`).join("")}</ul>`}
      <button class="btn ghost mt" style="width:100%" data-act="tobuild">BACK TO THE BUILD BAY</button>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   OPERATE
   ══════════════════════════════════════════════════════════════ */
const EVENTS=[
 {id:"safe",t:"Safe mode",w:3,txt:"An undervoltage trip has put the spacecraft into safe mode. All instruments are off and the high-gain antenna is stowed until the team can uplink a recovery sequence.",
  ch:[["Fast recovery — work the team around the clock","Costs $14M in operations. Back in 6 days.",st=>{st.opsCost+=14;st.lost+=6}],
      ["Careful recovery — full fault tree first","No extra cost. Back in 21 days.",st=>{st.lost+=21}]]},
 {id:"conj",t:"Solar conjunction",w:3,txt:"The Sun is between Earth and the spacecraft. No commanding, no downlink, for 18 days. Everything the instruments collect has to sit in onboard storage until the link comes back.",
  ch:[["Keep collecting and buffer it","You will lose whatever overflows storage.",st=>{st.blackout=18;st.collectDuringBlackout=true}],
      ["Stand the instruments down","Safe, but 18 days of science you do not get back.",st=>{st.blackout=18;st.lost+=18}]]},
 {id:"mmod",t:"Micrometeoroid strike",w:2,txt:"A particle has punched through one solar array wing. Output has dropped and the degradation rate has roughly doubled for the rest of the mission.",
  ch:[["Accept the loss and re-plan the power budget","Generation down 9% permanently.",st=>{st.powerMult*=0.91}],
      ["Shed the highest-draw instrument to protect the bus","Full generation preserved, but that instrument stays off.",st=>{st.killTopPower=true}]]},
 {id:"thrust",t:"Thruster underperformance",w:2,txt:"The capture burn came in 4% low on specific impulse. Your orbit is higher than planned and correcting it will eat propellant you were holding as margin.",
  ch:[["Correct it now","Burns 6% of remaining propellant. Nominal science orbit.",st=>{st.propUsed+=0.06}],
      ["Live with the higher orbit","No propellant cost. Resolution and data rate both drop 12%.",st=>{st.sciMult*=0.88}]]},
 {id:"dsn",t:"Deep Space Network contention",w:3,txt:"A higher-priority mission has a critical event and has taken your tracking passes for the next two months. You are down to a third of your allocated antenna time.",
  ch:[["Accept the reduced allocation","Downlink cut to 35% for 60 days.",st=>{st.dsnCut=60}],
      ["Buy commercial ground station time","$22M. Keeps 80% of your downlink.",st=>{st.opsCost+=22;st.dsnCutSoft=60}]]},
 {id:"inst",t:"Instrument fault",w:2,txt:"One instrument is returning corrupted frames. The team thinks a power cycle has a good chance of clearing it, but a cold restart in this thermal environment carries its own risk.",
  ch:[["Power cycle it","70% chance it recovers fully.",st=>{st.powerCycle=true}],
      ["Leave it off and reallocate the power","That objective stops accumulating. Everything else gets more duty cycle.",st=>{st.killOne=true;st.sciMult*=1.06}]]},
 {id:"rad",t:"Radiation upset",w:2,txt:"Total ionising dose is climbing faster than the model predicted. The flight computer has taken three single-event upsets this week.",
  ch:[["Reduce instrument duty cycle to cut exposure","Science rate down 15%, dose rate down 30%.",st=>{st.sciMult*=0.85;st.doseMult*=0.70}],
      ["Press on at full duty cycle","No change. Component failure risk rises sharply.",st=>{st.doseMult*=1.0;st.risky=true}]]},
 {id:"ext",t:"Extended mission opportunity",w:2,good:true,txt:"The spacecraft is healthy and the science team has proposed an extended mission. The senior review will fund it only if you still have propellant and power margin.",
  ch:[["Propose the extension","Adds 20% more science time if you have the margin.",st=>{st.extend=true}],
      ["Decline and close out the mission cleanly","No risk, no extra science.",st=>{}]]}
];

function initOpsState(){
  /* Once-only: never rebuild live OPS on redraw/reload. initOps() guards this. */
  if(S.ops&&S.ops.levelId===S.levelId&&S.ops.day>0) return;
  const D=derive(S), L=byId(LEVELS,S.levelId);
  const rnd=mulberry32(S.seed + S.levelId.charCodeAt(1)*977);
  const totalDays=Math.round(L.years*365.25);
  const cruise=Math.round((L.mode==="pork"?S.launch.tof:(L.mode==="fixedC3"?L.tof:0))
                          + ((S.assist&&L.assist)?L.assist.addDays:0));
  const deck=EVENTS.slice().sort(()=>rnd()-0.5);
  const n = S.mode==="cadet"?4:6;
  const evs=[];
  for(let k=0;k<n&&k<deck.length;k++){
    const e=deck[k];
    let day = Math.round(cruise + 40 + rnd()*(totalDays-cruise-80));
    if(e.id==="conj") day=Math.round(cruise+60+rnd()*200);
    if(e.id==="ext") day=Math.round(totalDays*0.82);
    if(e.id==="thrust") day=cruise+2;
    evs.push({...e,day});
  }
  evs.sort((a,b)=>a.day-b.day);
  S.ops={
    day:0,totalDays,cruise,speed:4,running:true,events:evs,evIdx:0,
    delivered:{},backlog:0,storageMb:L.storeMb||160000,
    dose:0,opsCost:0,lost:0,propUsed:0,powerMult:1,sciMult:1,doseMult:1,dsnFactor:dsnFactorOf(),
    blackout:0,dsnCut:0,dsnCutSoft:0,dead:new Set(),log:[],status:"nominal",
    overflow:0,collectDuringBlackout:false,extend:false,ended:false,
    /* Phase 8: nominal EOM vs extended loop. Planning choices extend nominalDays;
       only the extension itself extends totalDays beyond it. */
    nominalDays:totalDays,eomReviewed:false,extDeclined:false,extSnap:null
  };
  S.objectives.forEach(o=>S.ops.delivered[o]=0);
  const DT=dsnTier();
  logLine(0,`DSN allocation: ${DT.n} — ${(L.dsnHrs*DT.f).toFixed(1)} h/day effective contact.`,"");
  /* Phase 2: apply stored launch outcome exactly once at OPS creation. */
  const LO=S.launch&&S.launch.outcome;
  if(LO&&!S.ops.launchApplied){
    S.ops.launchApplied=true; S.ops.launch=LO.type;
    if(LO.type==="nominal") logLine(0,`Launch nominal on ${byId(LV,LO.lv).n} (rel ${(LO.rel*100).toFixed(0)}%).`,"good");
    else if(LO.type==="scrub"){ S.ops.scrubDelayMo=LO.delayMo; logLine(0,`Launch scrub — range hold. Slipped ${LO.delayMo} months, same vehicle, no hardware change.`,"warn"); }
    else if(LO.type==="partial"){ S.ops.propUsed+=0.06; S.ops.powerMult*=0.95; S.ops.sciMult*=0.95; S.ops.opsCost+=10; logLine(0,"Partial launch shortfall: upper stage compensated by spacecraft (+6% prop, −5% power/science, +$10M).","warn"); }
  }
  else if(!LO) logLine(0,"Launch. Vehicle performance nominal.","good");
  if(cruise>0) logLine(0,`Cruise phase begins. ${cruise} days to ${BODY[L.body].n}.`);
}
function logLine(day,txt,cls){
  S.ops.log.unshift({day,txt,cls:cls||""});
  if(S.ops.log.length>120)S.ops.log.pop();
}
function dayLabel(d){
  return "L+"+String(d).padStart(4,"0");
}

function scrOps(){
  const L=byId(LEVELS,S.levelId);
  const camMode = (window.OpsView && OpsView.getCameraMode) ? OpsView.getCameraMode() : 'craft';
  return `<div class="ops-viewport" id="opsViewport">
    <div id="ops3d-mount" class="ops3d-container">
      <canvas id="ops3d"></canvas>
    </div>
    <div class="ops-hud-top">
      <div class="clock-hud">
        <span class="big" id="clkDay">L+0000</span>
        <span class="badge" id="clkPhase">cruise</span>
        <span class="lt-delay" id="clkLt"></span>
      </div>
      <div class="clock-hud" id="opsStatusHud" style="margin-left:8px">
        <span class="badge" id="opsStatus">NOMINAL</span>
        <span class="lt-delay" id="primeObj"></span>
      </div>
      <div class="cam-modes" id="opsCamModes">
        <span class="cam-label">CAM:</span>
        <button data-act="cam-mode" data-v="craft" class="cam-btn ${camMode==='craft'?'on':''}" title="Chase view: follow spacecraft in formation">CRAFT</button>
        <button data-act="cam-mode" data-v="cockpit" class="cam-btn ${camMode==='cockpit'?'on':''}" title="First-person: ride the spacecraft facing the target">COCKPIT</button>
        <button data-act="cam-mode" data-v="target" class="cam-btn ${camMode==='target'?'on':''}" title="Target view: focus destination body">TARGET</button>
        <button data-act="cam-mode" data-v="system" class="cam-btn ${camMode==='system'?'on':''}" title="Tactical solar system overview">SYSTEM</button>
        <button data-act="cam-mode" data-v="free" class="cam-btn ${camMode==='free'?'on':''}" title="Free Orbit Controls">FREE</button>
      </div>
      <div class="spd">
        <button data-act="spd" data-v="0" aria-label="Pause">II</button>
        <button data-act="spd" data-v="1">2 d/s</button>
        <button data-act="spd" data-v="4" class="on">10 d/s</button>
        <button data-act="spd" data-v="20">50 d/s</button>
        <button data-act="spd" data-v="90">MAX</button>
      </div>
      <button data-act="toggle-hud" class="hud-toggle-btn" title="Toggle HUD visibility">HUD</button>
    </div>
    <div class="ops-hud-left" id="opsHudLeft">
      <div class="hud-card">
        <div class="hud-card-hdr">FLIGHT TELEMETRY <span class="code">TLM-01</span></div>
        <div class="gauges" id="gauges"></div>
      </div>
      <div class="hud-card mt-s">
        <div class="hud-card-hdr">EVENT LOG <span class="code">OPS-01</span></div>
        <div id="logbox"></div>
      </div>
    </div>
    <div class="ops-hud-right" id="opsHudRight">
      <div class="hud-card">
        <div class="hud-card-hdr">SCIENCE RETURN <span class="code">SCI-02</span></div>
        <div class="pad" id="sciBox"></div>
      </div>
      <div class="hud-card mt-s">
        <div class="hud-card-hdr">MISSION TIMELINE <span class="code">OPS-02</span></div>
        <canvas id="tl" width="320" height="74" role="img" aria-label="Mission timeline"></canvas>
      </div>
    </div>
    <div class="ops-minimap" id="opsMinimap">
      <div class="minimap-hdr">
        <span class="minimap-title">TACTICAL MAP [2.5D]</span>
        <span class="minimap-actions">
          <button data-act="cam-mode" data-v="system" class="minimap-action-btn" title="Align 3D camera to solar system view">ALIGN 3D</button>
          <button data-act="toggle-minimap" class="minimap-action-btn" title="Minimize/expand map" id="btnMinimapToggle">&minus;</button>
        </span>
      </div>
      <div class="minimap-body" id="minimapBody">
        <canvas id="orbit" width="320" height="175" role="img" aria-label="Orbital view"></canvas>
      </div>
    </div>
  </div>`;
}

let rafId=null,acc=0,lastT=0,lastSpd=4,lastAuxPaint=0;
function initOps(){
  if(!S.ops||S.ops.levelId!==S.levelId){ initOpsState(); S.ops.levelId=S.levelId; }
  /* Phase 3: mission-relevant arrival brief once per OPS run; l1 bypasses cleanly. */
  if(!phaseRequired("arrival")){ ensurePhases().done.arrival="bypass"; }
  else if(!S.ops.arrivalApplied){ maybeShowArrivalBrief(); }
  /* Phase 4: proximity follows arrival; non-proximity missions bypass cleanly. */
  if(!phaseRequired("proximity")){ ensurePhases().done.proximity="bypass"; }
  else if(S.ops.arrivalApplied&&!S.ops.proxApplied&&!el("modal").classList.contains("on")){ maybeShowProxBrief(); }
  /* Phase 6: Mars-only aerobrake; everything else bypasses. */
  if(!aeroSpec()){ ensurePhases().done.aerobrake="bypass"; }
  else if(S.ops.arrivalApplied&&!S.ops.aeroApplied&&!el("modal").classList.contains("on")){ maybeShowAeroBrief(); }
  lastT=performance.now(); acc=0;
  cancelAnimationFrame(rafId);
  rafId=requestAnimationFrame(loopOps);
  drawOrbit(); drawTL(); renderOpsSide();
  try{
    const m=el("ops3d-mount");
    /* Reuse the live scene when it already owns this canvas: start() tears
       down + rebuilds (entry-glide replay + white flash + craft reload).
       Only cold-start when the canvas is fresh or belongs elsewhere. */
    if(m&&window.OpsView&&OpsView.start){
      const live = (window.__opsV && window.__opsV.canvas && window.__opsV.active) ? window.__opsV.canvas : null;
      const mine = m.querySelector("canvas");
      if(!(live && live.isConnected && live===mine)) OpsView.start(m, { levelId: S.levelId, body: byId(LEVELS,S.levelId).body });
    }
  }catch(e){ console.warn("[ops] 3D init:", e); }
}
/* ── Phase 3 arrival: mission-relevant capture/rendezvous choice, existing OPS fields only. ── */
function arrivalSpec(){
  const L=byId(LEVELS,S.levelId); if(!L) return null;
  if(L.body==="earth") return null;                       // l1 LEO: no arrival burn
  if(L.body==="bennu") return {kind:"rendezvous",body:"Bennu-class NEA (101955)"};
  if(L.body==="moon") return {kind:"capture",body:"Moon"};
  return {kind:"capture",body:BODY[L.body]?BODY[L.body].n:L.body};
}
function arrivalChoices(kind){
  if(kind==="rendezvous") return [
    {id:"survey",t:"Cautious survey first",d:"Extra mapping passes before TAG. +20 days cruise ops, +8% science.",fx:O=>{O.lost+=0;O.totalDays+=20;O.nominalDays+=20;O.cruise+=20;O.sciMult*=1.08;}},
    {id:"direct",t:"Direct rehearsal → TAG",d:"Baseline OSIRIS-REx profile. No change.",fx:O=>{}},
    {id:"low",t:"Low-altitude survey",d:"Closer passes: +12% science, +3% propellant, +$8M ops.",fx:O=>{O.sciMult*=1.12;O.propUsed+=0.03;O.opsCost+=8;}}
  ];
  return [
    {id:"nominal",t:"Nominal capture",d:"Baseline burn from the arrival plan. No change.",fx:O=>{}},
    {id:"tight",t:"Tight capture orbit",d:"Lower orbit: +8% science, +5% propellant.",fx:O=>{O.sciMult*=1.08;O.propUsed+=0.05;}},
    {id:"high",t:"High safe orbit",d:"Higher orbit: saves 3% propellant, −8% science.",fx:O=>{O.propUsed=Math.max(0,O.propUsed-0.03);O.sciMult*=0.92;}}
  ];
}
function maybeShowArrivalBrief(){
  const O=S.ops; if(!O||O.arrivalApplied||O.ended) return;
  const spec=arrivalSpec(); if(!spec) return;
  O.running=false;
  const ch=arrivalChoices(spec.kind);
  const title=spec.kind==="rendezvous"?"ARRIVAL — RENDEZVOUS & TAG APPROACH":"ARRIVAL — ORBIT CAPTURE";
  const m=el("modal"), b=el("mbox");
  b.innerHTML=`<h3>&#9650; ${esc(title)} — ${esc(spec.body)}</h3><div class="mb"><p class="hint" style="line-height:1.65">${spec.kind==="rendezvous"?"You must match the asteroid's orbit (full arrival V∞) then survey before a 5-second touch-and-go. Proximity time is operations budget.":"Capture burn sets your science orbit for the whole mission. Lower is better science; higher is cheaper and safer."}</p><div class="choices">${ch.map((c,i)=>`<button class="choice" data-act="arrch" data-i="${i}"><span class="ct">${esc(c.t)}</span><span class="cd">${esc(c.d)}</span></button>`).join("")}</div></div>`;
  m.classList.add("on"); m.dataset.ev="arrival";
  const f=b.querySelector(".choice"); if(f) f.focus();
}
function resolveArrival(i){
  const O=S.ops; if(!O||O.arrivalApplied) return;
  const spec=arrivalSpec(); if(!spec) return;
  const ch=arrivalChoices(spec.kind); const c=ch[i]; if(!c) return;
  O.arrivalApplied=true; O.arrival=c.id;
  c.fx(O);
  enterPhaseOnce("arrival");
  const D=derive(S);
  logLine(O.day,`Arrival (${spec.body}): ${c.t}. Capture Δv ${fmt(D.dvTotal,2)} km/s, ${fmt(D.propMass*(1-O.propUsed))} kg propellant remaining.`,"good");
  el("modal").classList.remove("on"); delete el("modal").dataset.ev;
  O.running=true;
  /* Phase 4: chain proximity brief where the mission requires it. */
  if(phaseRequired("proximity")&&!O.proxApplied){ maybeShowProxBrief(); return; }
  /* Phase 6: chain aerobrake brief for Mars captures. */
  if(aeroSpec()&&!O.aeroApplied){ maybeShowAeroBrief(); return; }
}
function proxSpec(){
  const L=byId(LEVELS,S.levelId); if(!L) return null;
  if(L.body==="bennu") return {kind:"tag",body:"Bennu-class NEA (101955)"};
  if(L.body==="jupiter") return {kind:"tour",body:"Jupiter / Europa"};
  return null;
}
function proxChoices(kind){
  if(kind==="tour") return [
    {id:"precision",t:"PRECISION — close flybys",d:"+12% science, +5% propellant, +30% dose rate (radiation risk).",fx:O=>{O.sciMult*=1.12;O.propUsed+=0.05;O.doseMult*=1.30;}},
    {id:"balanced",t:"BALANCED — planned tour",d:"Baseline 50-flyby plan. No change.",fx:O=>{}},
    {id:"coverage",t:"COVERAGE — extended tour",d:"+20% science, +$20M, +40 days, +20% dose rate.",fx:O=>{O.sciMult*=1.20;O.opsCost+=20;O.totalDays+=40;O.nominalDays+=40;O.doseMult*=1.20;}}
  ];
  return [
    {id:"precision",t:"PRECISION — rehearsed TAG",d:"+10% science, +4% propellant, +$8M rehearsals.",fx:O=>{O.sciMult*=1.10;O.propUsed+=0.04;O.opsCost+=8;}},
    {id:"balanced",t:"BALANCED — baseline survey",d:"Planned survey + single TAG. No change.",fx:O=>{}},
    {id:"coverage",t:"COVERAGE — full survey",d:"+18% science, +7% propellant, +$16M, +30 days mapping.",fx:O=>{O.sciMult*=1.18;O.propUsed+=0.07;O.opsCost+=16;O.totalDays+=30;O.nominalDays+=30;}}
  ];
}
function maybeShowProxBrief(){
  const O=S.ops; if(!O||O.proxApplied||O.ended) return;
  const spec=proxSpec(); if(!spec) return;
  O.running=false;
  const ch=proxChoices(spec.kind);
  const title=spec.kind==="tour"?"PROXIMITY — EUROPA FLYBY TOUR":"PROXIMITY — TAG OPERATIONS";
  const why=spec.kind==="tour"?"Fifty flybys are planned. Closer passes sharpen every instrument but dive deeper into the radiation belts; a longer tour costs operations budget and dose."
    :"You matched the asteroid's orbit at full arrival V∞. Rehearsals buy TAG accuracy; full mapping buys science at propellant, cost, and schedule.";
  const m=el("modal"), b=el("mbox");
  b.innerHTML=`<h3>&#9650; ${esc(title)} — ${esc(spec.body)}</h3><div class="mb"><p class="hint" style="line-height:1.65">${esc(why)}</p><div class="choices">${ch.map((c,i)=>`<button class="choice" data-act="proxch" data-i="${i}"><span class="ct">${esc(c.t)}</span><span class="cd">${esc(c.d)}</span></button>`).join("")}</div></div>`;
  m.classList.add("on"); m.dataset.ev="proximity";
  const f=b.querySelector(".choice"); if(f) f.focus();
}
function resolveProx(i){
  const O=S.ops; if(!O||O.proxApplied) return;
  const spec=proxSpec(); if(!spec) return;
  const ch=proxChoices(spec.kind); const c=ch[i]; if(!c) return;
  O.proxApplied=true; O.prox=c.id;
  c.fx(O);
  enterPhaseOnce("proximity");
  logLine(O.day,`Proximity (${spec.body}): ${c.t}.`,"good");
  el("modal").classList.remove("on"); delete el("modal").dataset.ev;
  O.running=true;
}
/* ── Phase 4 LAND: L2 terminal descent (site + rover required) ──
   Triggered once at arrival day (see loopOps), NOT at ops start: the descent
   profile is committed when the orbiter is actually over the site. Outcome is
   computed deterministically here; the overlay only reveals it. */
function landSpec(){
  if(!S||S.levelId!=="l2") return null;
  const st=moonSite(S), rv=roverKit(S);
  if(!st||!rv) return null;
  return {site:st,rv};
}
const LAND_PROFILES=[
 {id:"precision",t:"Precision guided (HDA)",d:"+4% propellant, −4° effective slope, lands 2 km from the prime target.",dProp:0.04,dSlope:-4,off:2,sci:1.03},
 {id:"balanced",t:"Baseline profile",d:"No change. Lands 6 km from the prime target.",dProp:0,dSlope:0,off:6,sci:1.00},
 {id:"save",t:"Fuel-saving ballistic",d:"−3% propellant, +3° effective slope, lands 12 km out.",dProp:-0.03,dSlope:3,off:12,sci:0.98}
];
function computeLanding(prof){
  const spec=landSpec(); if(!spec) return null;
  const effSlope=Math.max(1,spec.site.slope+prof.dSlope);
  const margin=spec.rv.rm.slope-effSlope;
  const ok=margin>=0;
  return {profile:prof.id,offsetKm:prof.off,slope:effSlope,margin,degraded:!ok,
    day:S.ops?S.ops.day:0,site:spec.site.id,
    travKm:spec.site.travKm+prof.off,
    dProp:prof.dProp+(ok?0:0.03),opsM:ok?2:15,sciM:ok?prof.sci:0.90};
}
function maybeTriggerLanding(){
  const O=S.ops;
  if(!O||O.ended||O.landApplied||O.descentActive) return;
  if(!landSpec()) return;
  if(!(O.day>=O.cruise)) return;
  try{ if(el("modal").classList.contains("on")) return; }catch(e){ return; }
  maybeShowLandBrief();
}
function maybeShowLandBrief(){
  const O=S.ops; if(!O||O.landApplied||O.ended) return;
  const spec=landSpec(); if(!spec) return;
  O.running=false;
  const m=el("modal"), b=el("mbox");
  b.innerHTML=`<h3>&#9650; LAND — TERMINAL DESCENT — ${esc(spec.site.n)}</h3><div class="mb"><p class="hint" style="line-height:1.65">The orbiter is over the site. Commit the descent profile: guidance spends propellant to erase slope and land close; ballistic saves fuel but lands rough and far. Your ${esc(spec.rv.rm.n)} clears ${spec.rv.rm.slope}°.</p><div class="choices">${LAND_PROFILES.map((c,i)=>`<button class="choice" data-act="landch" data-i="${i}"><span class="ct">${esc(c.t)}</span><span class="cd">${esc(c.d)}</span></button>`).join("")}</div></div>`;
  m.classList.add("on"); m.dataset.ev="landing";
  const f=b.querySelector(".choice"); if(f) f.focus();
}
function resolveLand(i){
  const O=S.ops; if(!O||O.landApplied) return;
  const spec=landSpec(); if(!spec) return;
  const c=LAND_PROFILES[i]; if(!c) return;
  const out=computeLanding(c); if(!out) return;
  O.landApplied=true; O.landing=c.id; O.descentActive=true; O.running=false;
  S.landing=out;
  logLine(O.day,`Descent commit: ${c.t} over ${spec.site.n}. Touchdown ellipse ±${out.offsetKm} km.`,"");
  el("modal").classList.remove("on"); delete el("modal").dataset.ev;
  enterPhaseOnce("landing");
  /* Overlay reveals the precomputed truth (or applies it instantly headless).
     Blackout moment swaps to the surface diorama behind the dust (L2);
     completion always enters the surface first (covers SKIP-before-blackout),
     then applies touchdown truth. */
  try{
    if(window.OpsView&&OpsView.startDescent){
      OpsView.startDescent({
        onBlackout:()=>{ try{ if(window.OpsView&&OpsView.enterSurface) OpsView.enterSurface(); }catch(e){} },
        onDone:()=>{ try{ if(window.OpsView&&OpsView.enterSurface) OpsView.enterSurface(); }catch(e){} finishLanding(); }
      });
      return;
    }
  }catch(e){}
  finishLanding();
}
/* Touchdown application — exactly once per run (choice, skip, headless and
   exit paths all converge here; the descentActive flag is the single lock). */
function finishLanding(){
  const O=S.ops, L=S.landing;
  if(!O||!L||!O.descentActive) return;
  O.descentActive=false;
  O.propUsed=Math.max(0,O.propUsed+L.dProp);
  O.opsCost+=L.opsM; O.sciMult*=L.sciM;
  /* Phase-6: commission the surface loop (standing orders: drive standard). */
  try{ initSurface(); }catch(e){}
  const D=derive(S);
  if(L.degraded) logLine(O.day,`HARD LANDING: touchdown slope ${L.slope}° exceeds the ${D.rv?D.rv.rm.slope:0}° chassis cap (margin ${L.margin}°). Rover degraded — +$${L.opsM}M recovery, science ×${L.sciM}. Traverse now ${L.travKm} km.`,"bad");
  else logLine(O.day,`Touchdown confirmed: slope ${L.slope}°, ${L.offsetKm} km from the prime target (margin +${L.margin}°). Traverse ${L.travKm} km. ${fmt(D.propMass*(1-O.propUsed))} kg propellant remaining.`,"good");
  try{ if(window.OpsView&&OpsView.cancelDescent) OpsView.cancelDescent(true); }catch(e){}
  if(!O.ended) O.running=true;
}
function proxLabel(){
  const O=S.ops;
  if(!phaseRequired("proximity")) return "N/A";
  const p=O&&O.prox;
  const names={precision:"Precision",balanced:"Balanced",coverage:"Coverage"};
  return p?(names[p]||p):"Pending";
}
/* ── Phase 6 aerobrake: Mars-only capture trade. Reuses propUsed/totalDays/cruise/opsCost/sciMult.
   No new physics: the saved capture burn is expressed through the existing propellant fraction. ── */
function aeroSpec(){
  const L=byId(LEVELS,S.levelId); if(!L) return null;
  if(L.body!=="mars") return null;
  return {body:"Mars"};
}
function maybeShowAeroBrief(){
  const O=S.ops; if(!O||O.aeroApplied||O.ended) return;
  if(!aeroSpec()) return;
  O.running=false;
  const m=el("modal"), b=el("mbox");
  b.innerHTML=`<h3>&#9650; ARRIVAL — CAPTURE METHOD — MARS</h3><div class="mb"><p class="hint" style="line-height:1.65">Mars has an atmosphere thick enough to brake against. Aerobraking saves most of the capture propellant but adds months of drag passes and thermal risk; propulsive capture is fast and certain but spends fuel.</p><div class="choices">`
    +`<button class="choice" data-act="aeroch" data-i="0"><span class="ct">PROPULSIVE CAPTURE</span><span class="cd">Baseline burn. Fast, certain, spends propellant. No change.</span></button>`
    +`<button class="choice" data-act="aeroch" data-i="1"><span class="ct">AEROBRAKING</span><span class="cd">Saves ~8% propellant. +60 days of drag passes, +$6M ops, −2% science (thermal risk).</span></button>`
    +`</div></div>`;
  m.classList.add("on"); m.dataset.ev="aerobrake";
  const f=b.querySelector(".choice"); if(f) f.focus();
}
function resolveAero(i){
  const O=S.ops; if(!O||O.aeroApplied) return;
  if(!aeroSpec()) return;
  O.aeroApplied=true; O.aero=i===1?"aero":"prop"; S.aerobrake=(i===1);
  if(i===1){ O.propUsed=Math.max(0,O.propUsed-0.08); O.totalDays+=60; O.nominalDays+=60; O.cruise+=60; O.opsCost+=6; O.sciMult*=0.98; }
  ensurePhases().done.aerobrake=O.aero;
  logLine(O.day,i===1?"Aerobraking: capture on drag passes. ~8% propellant saved; +60 days, +$6M ops.":"Propulsive capture: baseline burn, no change.","good");
  el("modal").classList.remove("on"); delete el("modal").dataset.ev;
  O.running=true;
}
function aeroLabel(){
  const O=S.ops;
  if(!aeroSpec()&&!(O&&O.aero)) return "N/A — no atmosphere";
  const a=O&&O.aero;
  return a==null?"Pending":a==="aero"?"Aerobraking":"Propulsive capture";
}
function extensionLabel(){
  const O=S.ops;
  if(!O||!O.extend||!(O.totalDays>(O.nominalDays||O.totalDays))) return "Not extended";
  const snap=O.extSnap;
  const extraDays=O.totalDays-(O.nominalDays||O.totalDays);
  const extraCost=Math.max(0,(O.opsCost||0)-(snap?snap.opsCost:0));
  const extraDose=Math.max(0,(O.dose||0)-(snap?snap.dose:0));
  const gained=snap?Math.max(0,scienceRet()-snap.ret):0;
  return `Approved — +${extraDays} days, +$${fmt(extraCost)}M ops, +${fmt(extraDose)} krad, +${(gained*100).toFixed(0)}% science`;
}
function arrivalLabel(){
  const O=S.ops;
  if(!phaseRequired("arrival")) return "N/A — direct insertion (Earth orbit)";
  const a=O&&O.arrival;
  const names={nominal:"Nominal capture",tight:"Tight capture orbit",high:"High safe orbit",survey:"Cautious survey → TAG",direct:"Direct rehearsal → TAG",low:"Low-altitude survey"};
  return a?(names[a]||a):"Pending";
}
function loopOps(t){
  const dt=Math.min(100,t-lastT); lastT=t;
  const O=S.ops;
  if(O&&O.running&&!O.ended&&S.screen==="ops"){
    acc+=dt/1000*O.speed*2.5;
    let guard=0;
    while(acc>=1&&guard<400&&!O.ended&&O.running){ acc-=1; stepDay(); guard++; }
    /* Phase 4: landing decision fires once on arrival day (after any stepDay
       in this tick so O.day is current); the modal pauses the sim. */
    try{ maybeTriggerLanding(); }catch(e){}
    /* Frame-pacing: the 3D feed (ce/cn + OpsView.update) runs EVERY tick —
       throttling it would reintroduce hold-jump. The auxiliary 2D canvases +
       DOM panels repaint at ~7 Hz while the surface diorama owns the frame,
       freeing main-thread budget for 3D pacing (same numbers, only the
       secondary paint cadence changes). ?no3d/orbital always repaint. */
    const paint=auxPaint();
    drawOrbit(paint);
    if(paint){ drawTL(); renderOpsSide(); renderHUD(); }
  }else if(S.screen==="ops"){ drawOrbit(auxPaint()); }
  if(S.screen==="ops") rafId=requestAnimationFrame(loopOps);
}
/* Secondary-paint gate for loopOps (presentation pacing only — sim, 3D feed,
   direct renderOpsSide(true) calls, and all numbers untouched). */
function auxPaint(){
  try{
    const w=window.__opsV;
    if(!(w&&w.surfActive&&w.surf&&w.surf.scene)) return true;
    if(window.OpsView&&!OpsView.isActive()) return true;
    const nowMs=performance.now();
    if(nowMs-lastAuxPaint<150) return false;
    lastAuxPaint=nowMs;
    return true;
  }catch(e){ return true; }
}

function stepDay(){
  const O=S.ops, D=derive(S), L=byId(LEVELS,S.levelId);
  O.day++;
  /* Phase 8: nominal EOM gates a real extension review; only a GO decision earns the short loop. */
  if(!O.eomReviewed&&!O.ended&&O.day>(O.nominalDays||O.totalDays)){
    if(O.extDeclined){ endMission("complete"); return; }
    O.running=false; showExtensionReview(); return;
  }
  if(O.day>O.totalDays){ endMission("complete"); return }
  const yrs=O.day/365.25;
  const atTarget = O.day>=O.cruise;

  // power
  const gen = (D.pw.solar
      ? solarPower(D.pw.bol, O.day<O.cruise ? 1+(D.auDist-1)*(O.day/Math.max(1,O.cruise)) : D.auDist, yrs, D.pw.deg)
      : rtgPower(D.pw.bol,yrs,D.pw.deg)) * O.powerMult;
  const live=D.instr.filter(i=>!O.dead.has(i.id));
  const load = D.busLoad + live.reduce((s,i)=>s+i.w,0)*0.55 + D.cm.w*0.30;
  let duty = gen>=load ? 1 : Math.max(0.12, gen/load);
  if(gen<load && O.day%180===0) logLine(O.day,`Power shortfall ${fmt(load-gen)} W. Instrument duty cycle reduced to ${(duty*100).toFixed(0)}%.`,"warn");

  // dose
  O.dose += (L.dose/365.25)*O.doseMult*D.sh.f*(O.day<O.cruise?0.25:1);

  // downlink factor
  let dsnF=1;
  if(O.dsnCut>0){dsnF=0.35;O.dsnCut--}
  else if(O.dsnCutSoft>0){dsnF=0.8;O.dsnCutSoft--}
  if(O.blackout>0){dsnF=0;O.blackout--; if(O.blackout===0) logLine(O.day,"Conjunction over. Link re-acquired, playing back the buffer.","good")}

  const down = D.downMbPerDay*dsnF;
  let genMb=0;
  if(atTarget || O.day>O.cruise*0.8){
    genMb = live.reduce((s,i)=>s+i.d,0)*DATA_DUTY*DAY*duty*O.sciMult*(atTarget?1:0.15);
    if(O.blackout>0&&!O.collectDuringBlackout) genMb=0;
  }
  O.backlog += genMb;
  if(O.backlog>O.storageMb){ O.overflow += O.backlog-O.storageMb; O.backlog=O.storageMb;
    if(O.day%120===0) logLine(O.day,`Onboard storage full. ${fmtData(O.overflow)} of science discarded.`,"bad"); }
  const sent=Math.min(O.backlog,down); O.backlog-=sent;

  // allocate delivered data to objectives that are covered and incomplete
  if(sent>0&&atTarget){
    const open=S.objectives.filter(o=>{
      if(O.delivered[o]>=needMb(L,o)) return false;
      return OBJ[o].need.every(t=>live.some(i=>i.tags.includes(t)));
    });
    const wsum=open.reduce((s,o)=>s+OBJ[o].w,0);
    open.forEach(o=>{
      O.delivered[o]=Math.min(needMb(L,o),O.delivered[o]+sent*OBJ[o].w/wsum);
      if(O.delivered[o]>=needMb(L,o)&&!O["done_"+o]){O["done_"+o]=1;logLine(O.day,`Objective complete: ${OBJ[o].t}.`,"good")}
    });
  }
  if(O.lost>0){O.lost--;}

  /* Phase-6: landed surface sol resolves alongside the orbiter day. */
  try{ if(S.landing&&S.surface) stepSurface(); }catch(e){}

  // milestones
  if(O.day===O.cruise&&O.cruise>0){
    logLine(O.day,`Arrival at ${BODY[L.body].n}. Capture burn complete, ${fmt(D.propMass*(1-O.propUsed))} kg propellant remaining.`,"good");
    Audio_.go();
  }
  // radiation failures
  if(atTarget && O.dose>80 && live.length>1){
    const r=mulberry32(S.seed+O.day)();
    const risk=(O.dose-80)/90000*(O.risky?2:1);
    if(r<risk){
      const victim=live[Math.floor(mulberry32(S.seed+O.day*3)()*live.length)];
      O.dead.add(victim.id);
      logLine(O.day,`${victim.n} lost to total ionising dose at ${fmt(O.dose)} krad.`,"bad");
      Audio_.bad();
    }
  }
  // propellant exhaustion
  if(O.propUsed>=1){ endMission("prop"); return }

  // events
  const ev=O.events[O.evIdx];
  if(ev&&O.day>=ev.day){ O.running=false; showEvent(ev); O.evIdx++; }
}

function showEvent(ev){
  Audio_.caution();
  const m=el("modal"), b=el("mbox");
  b.innerHTML=`<h3>&#9650; EVENT &mdash; ${dayLabel(S.ops.day)} · WHAT HAPPENED</h3>
    <div class="mb"><h4>${esc(ev.t)}</h4><p class="hint" style="line-height:1.65">${esc(ev.txt)}</p>
    <p class="hint" style="margin:8px 0 4px">YOUR DECISION — what do you order?</p>
    <div class="choices">${ev.ch.map((c,i)=>`<button class="choice" data-act="evch" data-i="${i}">
      <span class="ct">${esc(c[0])}</span><span class="cd">${esc(c[1])}</span></button>`).join("")}</div></div>`;
  m.classList.add("on"); m.dataset.ev=ev.id;
  b.querySelector(".choice").focus();
}
function resolveEvent(i){
  const O=S.ops, id=el("modal").dataset.ev;
  const ev=EVENTS.find(e=>e.id===id); if(!ev)return;
  const st={opsCost:0,lost:0,propUsed:0,powerMult:1,sciMult:1,doseMult:1,
            blackout:0,dsnCut:0,dsnCutSoft:0,killTopPower:false,killOne:false,
            powerCycle:false,extend:false,risky:false,collectDuringBlackout:false};
  ev.ch[i][2](st);
  if(ev.id==="ext"&&!st.extend) O.extDeclined=true;
  O.opsCost+=st.opsCost; O.lost+=st.lost; O.propUsed+=st.propUsed;
  O.powerMult*=st.powerMult; O.sciMult*=st.sciMult; O.doseMult*=st.doseMult;
  if(st.blackout){O.blackout=st.blackout;O.collectDuringBlackout=st.collectDuringBlackout}
  if(st.dsnCut)O.dsnCut=st.dsnCut; if(st.dsnCutSoft)O.dsnCutSoft=st.dsnCutSoft;
  if(st.risky)O.risky=true;
  if(st.extend){ O.extend=true;
    const D=derive(S);
    if(D.margins.mass>0.05&&D.margins.power>0.05){ O.totalDays=Math.round(O.totalDays*1.2);
      logLine(O.day,"Extended mission approved. You kept enough margin to earn it.","good"); }
    else logLine(O.day,"Extension declined by the senior review — insufficient margin.","warn");
  }
  const D=derive(S), live=D.instr.filter(x=>!O.dead.has(x.id));
  if(st.killTopPower&&live.length){ const v=live.slice().sort((a,b)=>b.w-a.w)[0]; O.dead.add(v.id);
    logLine(O.day,`${v.n} powered off permanently to protect the bus.`,"warn"); }
  if(st.killOne&&live.length){ const v=live[0]; O.dead.add(v.id);
    logLine(O.day,`${v.n} left off.`,"warn"); }
  if(st.powerCycle&&live.length){
    const r=mulberry32(S.seed+O.day*11)();
    if(r<0.7) logLine(O.day,"Power cycle cleared the fault. Instrument nominal.","good");
    else { const v=live[live.length-1]; O.dead.add(v.id); logLine(O.day,`${v.n} did not come back.`,"bad"); }
  }
  logLine(O.day,`${ev.t}: ${ev.ch[i][0]}.`,ev.good?"good":"warn");
  /* EVENT→DECISION→RESULT→CONSEQUENCE: hold the sim on a result card until acknowledged. */
  showEvResult(ev,i,st);
}
function evResultLines(ev,i,st){
  const lines=[];
  if(st.opsCost) lines.push(`+$${fmt(st.opsCost)}M operations overrun.`);
  if(st.lost) lines.push(`+${st.lost} days of science lost.`);
  if(st.propUsed) lines.push(`+${(st.propUsed*100).toFixed(0)}% of remaining propellant spent.`);
  if(st.powerMult<1) lines.push(`Power generation −${((1-st.powerMult)*100).toFixed(0)}% permanently.`);
  if(st.sciMult<1) lines.push(`Science rate −${((1-st.sciMult)*100).toFixed(0)}% for the rest of the mission.`);
  if(st.sciMult>1) lines.push(`Science rate +${((st.sciMult-1)*100).toFixed(0)}% for the rest of the mission.`);
  if(st.doseMult<1) lines.push(`Dose rate −${((1-st.doseMult)*100).toFixed(0)}%.`);
  if(st.blackout) lines.push(st.collectDuringBlackout?`No downlink for ${st.blackout} days — instruments keep buffering (watch storage).`:`No downlink for ${st.blackout} days — instruments stood down safely.`);
  if(st.dsnCut) lines.push(`Downlink at 35% for ${st.dsnCut} days.`);
  if(st.dsnCutSoft) lines.push(`Downlink at 80% for ${st.dsnCutSoft} days (commercial relay).`);
  if(st.killTopPower||st.killOne) lines.push("An instrument was powered off permanently (see log).");
  if(st.powerCycle) lines.push("Restart attempted — see log for whether it recovered.");
  if(st.risky) lines.push("Component failure risk elevated from here on.");
  if(st.extend){
    const D2=derive(S);
    lines.push(D2.margins.mass>0.05&&D2.margins.power>0.05?"Senior review approved the extension: +20% science time.":"Senior review declined the extension: margin too thin.");
  }
  if(!lines.length) lines.push("No resource change. Clean close-out.");
  return lines;
}
function showEvResult(ev,i,st){
  const O=S.ops, m=el("modal"), b=el("mbox");
  const lines=evResultLines(ev,i,st);
  b.innerHTML=`<h3>&#9650; RESULT &mdash; ${dayLabel(O.day)} · WHAT CHANGED</h3>
    <div class="mb"><h4>${esc(ev.t)} → ${esc(ev.ch[i][0])}</h4>
    ${lines.map(l=>`<p class="hint" style="line-height:1.6">• ${esc(l)}</p>`).join("")}
    <p class="hint" style="margin-top:8px">Consequence is now live in telemetry. Watch the gauges and the log.</p>
    <button class="btn primary mt" data-act="evack" style="width:100%">CONTINUE OPERATIONS</button></div>`;
  m.classList.add("on"); m.dataset.lock="result";
  const btn=b.querySelector("[data-act=evack]"); if(btn) btn.focus();
}
/* ── Phase 8 extension review: nominal EOM → GO (short loop) or END. Reuses margin gate,
   day loop, events, and resources. Scoring untouched. ── */
function scienceRet(){
  const O=S.ops, L0=byId(LEVELS,S.levelId);
  let sci=0,wtot=0;
  S.objectives.forEach(o=>{ wtot+=OBJ[o].w; sci+=OBJ[o].w*Math.min(1,(O.delivered[o]||0)/needMb(L0,o)); });
  return wtot?sci/wtot:0;
}
function showExtensionReview(){
  const O=S.ops, L=byId(LEVELS,S.levelId), D=derive(S);
  const m=el("modal"), b=el("mbox");
  const preApproved=!!O.extend;
  const okMargin=D.margins.mass>0.05&&D.margins.power>0.05;
  const extra=Math.round((O.nominalDays||O.totalDays)*0.2);
  const head=`<h3>&#9650; EXTENSION REVIEW &mdash; ${dayLabel(O.day)} · NOMINAL END OF MISSION</h3>`;
  const body=preApproved
    ?`<p class="hint" style="line-height:1.65">The senior review pre-approved an extension and the spacecraft is healthy. Confirm ${extra} more days of operations, or close out cleanly now.</p>`
    :`<p class="hint" style="line-height:1.65">Nominal science is complete at ${(scienceRet()*100).toFixed(0)}% return. Mass margin ${(D.margins.mass*100).toFixed(0)}%, power margin ${(D.margins.power*100).toFixed(0)}% — the review funds ${extra} more days only above 5% on both.</p>`;
  const goLabel=preApproved?"CONFIRM EXTENDED OPERATIONS":(okMargin?"PROPOSE THE EXTENSION":"PROPOSE ANYWAY (LIKELY DECLINED)");
  b.innerHTML=head+`<div class="mb">${body}<div class="choices">`
    +`<button class="choice" data-act="extrev" data-i="0"><span class="ct">${esc(goLabel)}</span><span class="cd">Short loop: ~${extra} days, real resources, more science.</span></button>`
    +`<button class="choice" data-act="extrev" data-i="1"><span class="ct">END MISSION CLEANLY</span><span class="cd">No risk, no extra science. Final report now.</span></button>`
    +`</div></div>`;
  m.classList.add("on"); m.dataset.lock="extrev";
  const f=b.querySelector(".choice"); if(f) f.focus();
}
function resolveExtRev(i){
  const O=S.ops; if(!O||O.eomReviewed||O.ended) return;
  const D=derive(S);
  if(i===1){ O.eomReviewed=true; ensurePhases().done.extension="end"; O.extend=false; O.totalDays=Math.min(O.totalDays,O.day); logLine(O.day,"Mission closed out at nominal end of mission.","good"); endMission("complete"); return; }
  if(O.extend){ /* pre-approved at the mid-mission event */
    O.eomReviewed=true; ensurePhases().done.extension="go";
    O.extSnap={day:O.day,ret:scienceRet(),dose:O.dose,opsCost:O.opsCost,overflow:O.overflow};
    logLine(O.day,`Extended operations confirmed. ${O.totalDays-O.day} days remain in the short loop.`,"good");
  }else if(D.margins.mass>0.05&&D.margins.power>0.05){
    O.extend=true; O.eomReviewed=true; ensurePhases().done.extension="go";
    O.totalDays=Math.round((O.nominalDays||O.totalDays)*1.2);
    O.extSnap={day:O.day,ret:scienceRet(),dose:O.dose,opsCost:O.opsCost,overflow:O.overflow};
    logLine(O.day,`Extended mission approved at review. You kept enough margin to earn it (+${O.totalDays-O.day} days).`,"good");
  }else{
    O.eomReviewed=true; ensurePhases().done.extension="declined";
    logLine(O.day,"Extension declined by the senior review — insufficient margin.","warn");
    endMission("complete"); return;
  }
  const m=el("modal"); delete m.dataset.lock; m.classList.remove("on");
  O.running=true;
}
function endMission(reason){
  const O=S.ops; if(O.ended)return;
  O.ended=true;O.running=false;
  /* A locked modal (extension review) must never survive onto the report —
     go() doesn't clear it and the lock makes it undismissable. */
  try{ const m=el("modal"); delete m.dataset.lock; delete m.dataset.ev; m.classList.remove("on"); }catch(e){}
  const D=derive(S);
  const L0=byId(LEVELS,S.levelId); let sci=0,wtot=0;
  S.objectives.forEach(o=>{ wtot+=OBJ[o].w; sci+=OBJ[o].w*Math.min(1,O.delivered[o]/needMb(L0,o)); });
  const ret=wtot?sci/wtot:0;
  const cost=D.cost+O.opsCost;
  const L=byId(LEVELS,S.levelId);
  const over=cost>L.capM;
  let score = ret*100 - (over?(cost-L.capM)/L.capM*120:0) + Math.max(0,Math.min(D.margins.mass,D.margins.power,D.margins.cost))*22;
  if(reason==="prop") score*=0.5;
  /* Phase-7 surface grade (landed L2 only): three 0..1 components, meaned,
     worth up to +8 bonus points. Null-site/kit/landing/surface (other
     missions, legacy saves, never-touched-down) skips wholesale — grading
     for those runs is byte-identical to before. */
  let surf=null;
  if(S.landing&&S.surface){
    const Ld=S.landing, F=S.surface;
    const land=Math.max(0,Math.min(1,1-Ld.offsetKm/15))*(Ld.degraded?0.6:1);
    const trav=F.reached?1:Math.max(0,Math.min(1,1-surfDist(F)/Math.max(0.01,F.d0)))*0.8;
    const data=Math.max(0,Math.min(1,F.returnedMb/20000));
    const overall=(land+trav+data)/3;
    surf={land,trav,data,overall,bonus:overall*8,
      sols:F.sol,science:F.science,returnedMb:F.returnedMb,reached:F.reached,
      degraded:Ld.degraded,offsetKm:Ld.offsetKm,slope:Ld.slope,margin:Ld.margin,
      profile:Ld.profile,site:Ld.site,travKm:Ld.travKm};
    score+=surf.bonus;
  }
  score = isFinite(score) ? clamp(score,0,100) : 0;
  const grades=[[93,"A+"],[86,"A"],[80,"A\u2212"],[74,"B+"],[67,"B"],[60,"B\u2212"],[52,"C+"],[44,"C"],[34,"D"],[0,"F"]];
  const grade=(grades.find(g=>score>=g[0])||grades[grades.length-1])[1];
  const badges=[];
  if(!over&&ret>=0.999) badges.push("ALL OBJECTIVES, UNDER BUDGET");
  else if(!over) badges.push("UNDER BUDGET");
  if(Math.min(D.margins.mass,D.margins.power,D.margins.cost)>=0.20) badges.push("HEALTHY MARGINS");
  if(O.extend&&O.totalDays>Math.round(L.years*365.25)) badges.push("EXTENDED MISSION");
  if(O.dead.size===0) badges.push("NO HARDWARE LOST");
  if(surf&&surf.reached) badges.push("PRIME TARGET REACHED");
  S.result={ret,cost,grade,score,badges,reason,days:O.day,overflow:O.overflow,dose:O.dose,dead:[...O.dead],surf};
  S.progress[S.levelId]={grade,ret:Math.round(ret*100)};
  saveProgress();
  Audio_.go();
  go("report");
}

/* ── orbital view ── */
function elementsFrom(r,v,mu){
  const rr=Math.hypot(r[0],r[1]), vv=Math.hypot(v[0],v[1]);
  const a=1/(2/rr - vv*vv/mu);
  const rv=r[0]*v[0]+r[1]*v[1];
  const ex=((vv*vv-mu/rr)*r[0]-rv*v[0])/mu, ey=((vv*vv-mu/rr)*r[1]-rv*v[1])/mu;
  const e=Math.hypot(ex,ey), argp=Math.atan2(ey,ex);
  let nu=Math.atan2(r[1],r[0])-argp; nu=((nu%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
  let E=2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2),Math.sqrt(1+e)*Math.cos(nu/2));
  const M0=E-e*Math.sin(E), n=Math.sqrt(mu/Math.abs(a*a*a));
  return {a,e,argp,M0,n};
}
function posAt(el2,dtSec){
  let M=el2.M0+el2.n*dtSec, E=M;
  for(let i=0;i<40;i++) E=E-(E-el2.e*Math.sin(E)-M)/(1-el2.e*Math.cos(E));
  const nu=2*Math.atan2(Math.sqrt(1+el2.e)*Math.sin(E/2),Math.sqrt(1-el2.e)*Math.cos(E/2));
  const r=el2.a*(1-el2.e*Math.cos(E)), th=nu+el2.argp;
  return [r*Math.cos(th),r*Math.sin(th)];
}
function drawOrbit(paint2D){
  const cv=el("orbit"); if(!cv)return;
  const L=byId(LEVELS,S.levelId), D=derive(S), O=S.ops;
  const paint=(paint2D===false)?false:true;

  /* Phase-5 landed view (?no3d parity): once down, the 2D map shows the
     bounded site patch (elevation contours + hazard tint + rover marker)
     instead of the orbit diagram — same placement convention as the 3D
     diorama (rover east of centre by min(offsetKm,1.2) km).
     BLINK RULE: this branch returns before the background fill below, so a
     throttled (skipped) frame retains the last map instead of flashing the
     starfield. ce/cn and the 3D feed run EVERY tick regardless. */
  if(S.landing&&S.landing.site&&typeof SURFACE_PATCHES!=="undefined"
     &&SURFACE_PATCHES.sites&&SURFACE_PATCHES.sites[S.landing.site]){
    /* Honest-timelapse rover: continuous sol time = completed sols + the acc
       fraction into the next sol. ce/cn render surfEvalAt(sC) at the eased
       adaptive lag (1 sol ≤10 d/s, deeper at warp) — the exact simulated
       path, shared single implementation with the 3D per-frame lookahead.
       Old saves fall back to stepped e/n via the isFinite guards. Computed
       before both the inset and the 3D feed so the two can never disagree;
       the feed below runs EVERY tick even when the 2D paint is throttled. */
    try{
      const F=S.surface;
      if(F){
        const df=(S.ops&&isFinite(acc))?Math.min(0.999,Math.max(0,acc)):0;
        const rate=(S.ops&&S.ops.running&&!S.ops.ended&&isFinite(O.speed))?O.speed*2.5:0;
        /* Adaptive display lag (presentation only — sim truth stays F.sol/e/n
           + seg ring): the 3D dead-reckoning looks ahead by up to 0.1 s×rate
           sols past this tick, so the lag must headroom it or the rover holds
           at the newest sample then leaps (the warp hold-jump). 1 sol at
           ≤10 d/s (0.4 s / 0.1 s wall — unchanged), deeper at warp where a
           frame spans sols (50 d/s → 7 sols / 0.14 s wall; MAX → 24 / 0.11 s).
           The lag EASES toward its tier (≈3 ticks) instead of stepping, so
           warp-button switches sweep continuously through real past positions
           instead of leaping 23 sols. Frozen while paused (no drift).
           2D inset reads the same ce/cn (equivalent within the lag). */
        const lagT=rate>10?Math.min(24,Math.ceil(0.12*rate)+1):1;
        let lagE=isFinite(F._dLagEase)?F._dLagEase:lagT;
        if(rate>0){ lagE+=(lagT-lagE)/3; if(Math.abs(lagT-lagE)<1e-3) lagE=lagT; }
        F._dLagEase=lagE;
        /* T11: evaluate through EVERY burst segment via the sample ring.
           sC is the display sol-time (lagged, never extrapolated past truth
           here); surfEvalAt finds its bracketing pair, so multi-sol ticks at
           50/225 d/s render every intermediate sol instead of teleporting
           across them. F.de/dn carry the evaluated segment's direction for
           the 3D heading. surfEvalAt is the single implementation — the
           per-frame surface-view dead-reckoning calls it too. */
        const sC=F.sol+df-lagE;
        const r=(typeof surfEvalAt==="function")?surfEvalAt(sC):null;
        if(r){
          F.df=df; F.ce=r.e; F.cn=r.n; F.de=r.de; F.dn=r.dn;
          try{
            F._dSC=sC; F._dTick=performance.now(); F._dRate=rate; F._dLag=lagE;
          }catch(e){}
        } else if(isFinite(F.e)){
          F.df=df; F.ce=F.e; F.cn=F.n; F.de=0; F.dn=0;
        }
      }
    }catch(e){}
    /* T9: the tactical canvas is two-layer (static base blit + live
       marker), so drawing every tick costs one drawImage plus a triangle —
       no gate here. Redraw gating lives inside drawSurfaceFallback's base
       cache. Skipped wholesale when loopOps throttles secondary paint. */
    if(paint){ const f2=fitCanvas(cv,900,430); drawSurfaceFallback(f2.x,f2.W,f2.H); }
    if(window.OpsView&&OpsView.isActive()){
      const smoothDay=(O?(O.day+Math.min(0.999,Math.max(0,acc))):0);
      OpsView.update({
        day: smoothDay,
        cruise: O?O.cruise:0, totalDays: O?O.totalDays:1,
        arrived: true,
        frac: 1, targetKey: L.body,
        tNow: 2029.0+smoothDay/365.25, mode: L.mode,
        running: O?!!(O.running&&!O.ended):false,
        /* Exact warp rate for the 3D view clock (d/s; 0 while paused) —
           never wall-clock-estimated downstream. */
        rate: (O&&O.running&&!O.ended&&isFinite(O.speed))?O.speed*2.5:0,
        linkF: !O||O.blackout>0?0:O.dsnCut>0?0.35:O.dsnCutSoft>0?0.8:1,
        healthF: O?D.instr.filter(i=>!O.dead.has(i.id)).length/Math.max(1,D.instr.length):1
      });
    }
    return;
  }

  const f=fitCanvas(cv,900,430), x=f.x, W=f.W, H=f.H;
  x.fillStyle="#03050A";x.fillRect(0,0,W,H);
  const rnd=mulberry32(19);
  for(let i=0;i<220;i++){const px=rnd()*W,py=rnd()*H;
    x.fillStyle=`rgba(232,230,223,${0.05+rnd()*0.3})`;x.fillRect(px,py,rnd()*1.3,rnd()*1.3);}
  const cx=W/2, cy=H/2, tilt=0.42;

  if(L.mode==="pork"){
    const maxAU=BODY[L.body].a*1.25;
    const sc=Math.min(W,H*1/tilt)/2.35/maxAU;
    const P=xy=>[cx+xy[0]/AU*sc, cy+xy[1]/AU*sc*tilt];
    // sun
    const g=x.createRadialGradient(cx,cy,0,cx,cy,40);
    g.addColorStop(0,"rgba(255,220,140,1)");g.addColorStop(.35,"rgba(255,176,0,.5)");g.addColorStop(1,"rgba(255,176,0,0)");
    x.fillStyle=g;x.beginPath();x.arc(cx,cy,40,0,7);x.fill();
    // orbits
    [["earth","#2A6BD4"],[L.body,"#8D93A1"]].forEach(([k,col])=>{
      const b=BODY[k]; x.strokeStyle=col;x.globalAlpha=.55;x.lineWidth=1;x.beginPath();
      for(let i=0;i<=180;i++){const p=P(bodyState(b,2029+i/180*Math.sqrt(b.a*b.a*b.a)).pos);
        i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]);}
      x.closePath();x.stroke();x.globalAlpha=1;
    });
    // transfer arc
    const e0=bodyState(BODY.earth,S.launch.tDep), m1=bodyState(BODY[L.body],S.launch.tDep+S.launch.tof/365.25);
    const Lam=lambert(e0.pos,m1.pos,S.launch.tof*DAY,MU_SUN);
    if(Lam){
      const els=elementsFrom(e0.pos,Lam.v1,MU_SUN);
      // Pause-exact: the acc fraction is always shown (frozen while paused),
      // so hitting II holds the exact visible state instead of snapping back
      // up to a day. Integer game logic still runs on O.day — display only.
      const smoothDay = (O ? (O.day + Math.min(0.999, Math.max(0, acc))) : 0);
      const frac=clamp(O?smoothDay/Math.max(1,O.cruise):1,0,1);
      x.strokeStyle="rgba(94,246,160,.35)";x.lineWidth=1;x.beginPath();
      for(let i=0;i<=140;i++){const p=P(posAt(els,S.launch.tof*DAY*i/140));i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]);}
      x.stroke();
      x.strokeStyle="#5EF6A0";x.lineWidth=2;x.beginPath();
      for(let i=0;i<=140;i++){const t=frac*i/140;const p=P(posAt(els,S.launch.tof*DAY*t));i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]);}
      x.stroke();
      // planets now
      const tNow=S.launch.tDep+smoothDay/365.25;
      const ep=P(bodyState(BODY.earth,tNow).pos), tp=P(bodyState(BODY[L.body],tNow).pos);
      // QA-001: after arrival the orbiter rides with its target — the transfer
      // endpoint is history, not the spacecraft's position
      const arrived=O&&O.cruise>0&&smoothDay>=O.cruise;
      const craftH=arrived?bodyState(BODY[L.body],tNow).pos:posAt(els,S.launch.tof*DAY*frac);
      const sc2=P(craftH);
      x.fillStyle="#2A6BD4";x.beginPath();x.arc(ep[0],ep[1],5,0,7);x.fill();
      x.fillStyle=L.body==="mars"?"#C1440E":L.body==="jupiter"?"#C8A882":"#8D93A1";
      x.beginPath();x.arc(tp[0],tp[1],L.body==="jupiter"?9:L.body==="bennu"?3:6,0,7);x.fill();
      x.fillStyle="#5EF6A0";x.beginPath();x.arc(sc2[0],sc2[1],3.5,0,7);x.fill();
      x.strokeStyle="rgba(94,246,160,.5)";x.beginPath();x.arc(sc2[0],sc2[1],8,0,7);x.stroke();
      // light-time line
      x.setLineDash([3,4]);x.strokeStyle="rgba(232,230,223,.16)";x.beginPath();
      x.moveTo(ep[0],ep[1]);x.lineTo(sc2[0],sc2[1]);x.stroke();x.setLineDash([]);
      const dAU=Math.hypot(craftH[0]-bodyState(BODY.earth,tNow).pos[0],
                           craftH[1]-bodyState(BODY.earth,tNow).pos[1])/AU;
      cv._lt=dAU*499.0;
      x.font="10px 'IBM Plex Mono',monospace";x.fillStyle="#8D93A1";
      x.fillText("EARTH",ep[0]+8,ep[1]-6); x.fillText(BODY[L.body].n.toUpperCase().split(" ")[0],tp[0]+10,tp[1]-8);
      if(window.OpsView&&OpsView.isActive()){
        OpsView.update({
          day: smoothDay,
          cruise: O ? O.cruise : 0,
          totalDays: O ? O.totalDays : 1,
          arrived: arrived,
          frac: frac,
          craftKm: craftH,
          els: els,
          targetKey: L.body,
          tDep: S.launch.tDep,
          tofDays: S.launch.tof,
          tNow: tNow,
          mode: L.mode,
          running: O ? !!(O.running && !O.ended) : false,
          /* Exact warp rate for the 3D view clock (d/s; 0 while paused) —
             never wall-clock-estimated downstream. */
          rate: (O&&O.running&&!O.ended&&isFinite(O.speed))?O.speed*2.5:0,
          linkF: !O||O.blackout>0?0:O.dsnCut>0?0.35:O.dsnCutSoft>0?0.8:1,
          healthF: O?D.instr.filter(i=>!O.dead.has(i.id)).length/Math.max(1,D.instr.length):1
        });
      }
    }
  }else{
    // body-centric
    const R=110;
    const grd=x.createRadialGradient(cx-30,cy-30,8,cx,cy,R);
    grd.addColorStop(0, L.body==="moon"?"#C9C6BE":"#4A7FC1");
    grd.addColorStop(1, L.body==="moon"?"#3A3833":"#0D2A52");
    x.fillStyle=grd;x.beginPath();x.arc(cx,cy,R,0,7);x.fill();
    if(L.body==="moon"){ const r2=mulberry32(3);
      for(let i=0;i<40;i++){const a=r2()*7,d=r2()*R*0.92,rr=2+r2()*11;
        x.fillStyle=`rgba(0,0,0,${0.06+r2()*0.12})`;x.beginPath();
        x.arc(cx+Math.cos(a)*d,cy+Math.sin(a)*d*1,rr,0,7);x.fill();}}
    x.strokeStyle="rgba(94,246,160,.28)";x.lineWidth=1;
    x.beginPath();x.ellipse(cx,cy,R+58,(R+58)*tilt,0.35,0,7);x.stroke();
    const smoothDay = (O ? (O.day + Math.min(0.999, Math.max(0, acc))) : 0);
    const ph=smoothDay*0.62;
    const px=cx+Math.cos(ph)*(R+58)*Math.cos(0.35)-Math.sin(ph)*(R+58)*tilt*Math.sin(0.35);
    const py=cy+Math.cos(ph)*(R+58)*Math.sin(0.35)+Math.sin(ph)*(R+58)*tilt*Math.cos(0.35);
    x.fillStyle="#5EF6A0";x.beginPath();x.arc(px,py,3.5,0,7);x.fill();
    x.strokeStyle="rgba(94,246,160,.5)";x.beginPath();x.arc(px,py,8,0,7);x.stroke();
    cv._lt = L.body==="moon"?1.28:0.0;
    x.font="10px 'IBM Plex Mono',monospace";x.fillStyle="#8D93A1";
    x.fillText(BODY[L.body].n.toUpperCase(),cx-R,cy+R+22);
    if(window.OpsView&&OpsView.isActive()){
      OpsView.update({
        day: smoothDay,
        cruise: O ? O.cruise : 0,
        totalDays: O ? O.totalDays : 1,
        arrived: O && O.cruise > 0 && smoothDay >= O.cruise,
        frac: clamp(smoothDay / Math.max(1, (O ? O.cruise : 1)), 0, 1),
        targetKey: L.body,
        tNow: 2029.0 + smoothDay / 365.25,
        mode: L.mode,
        running: O ? !!(O.running && !O.ended) : false,
        /* Exact warp rate for the 3D view clock (d/s; 0 while paused) —
           never wall-clock-estimated downstream. */
        rate: (O&&O.running&&!O.ended&&isFinite(O.speed))?O.speed*2.5:0,
        linkF: !O||O.blackout>0?0:O.dsnCut>0?0.35:O.dsnCutSoft>0?0.8:1,
        healthF: O?D.instr.filter(i=>!O.dead.has(i.id)).length/Math.max(1,D.instr.length):1
      });
    }
  }
  x.font="10px 'IBM Plex Mono',monospace";x.fillStyle="#5A6172";
  x.fillText("ORBITAL VIEW \u2014 NOT TO SCALE",14,H-12);
}

/* ── Phase-5 landed 2D fallback: bounded patch contour view ──
   Same data as the 3D diorama (SURFACE_PATCHES single source): elevation cells
   shaded by height, hazard tint by slope class, rover triangle at the shared
   placement convention, true touchdown offset labeled even when clamped. */
function drawSurfaceFallback(x,W,H){
  try{
    const Ld=S.landing, P=SURFACE_PATCHES.sites[Ld.site];
    if(!P)return;

    /* ---------------------------------------------------------------
       STATIC HEIGHT DATA CACHE
       Never writes to SURFACE_PATCHES. Decoded/downsampled heights live
       only on the renderer function.
       --------------------------------------------------------------- */
    try{
      let hc=drawSurfaceFallback._heightCache;
      if(!hc){
        hc=Object.create(null);
        drawSurfaceFallback._heightCache=hc;
      }
      if(!hc[Ld.site]){
        if(P.in&&P.in.h){
          try{
            const bin=atob(P.in.h),u=new Uint8Array(bin.length);
            for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);

            const f=new Float32Array(u.buffer);
            const IN=(P.in&&P.in.n)||200;
            const n=(P.n||80);
            const h=new Float64Array(n*n);

            for(let j=0;j<n;j++)for(let i=0;i<n;i++){
              const fi=i/(n-1)*(IN-1),fj=j/(n-1)*(IN-1);
              const i0=Math.min(IN-2,Math.floor(fi));
              const j0=Math.min(IN-2,Math.floor(fj));
              const fx=fi-i0,fz=fj-j0;

              h[j*n+i]=
                f[j0*IN+i0]*(1-fx)*(1-fz)+
                f[j0*IN+i0+1]*fx*(1-fz)+
                f[(j0+1)*IN+i0]*(1-fx)*fz+
                f[(j0+1)*IN+i0+1]*fx*fz;
            }

            hc[Ld.site]=h;
          }catch(e){
            hc[Ld.site]=P.h;
          }
        }else{
          hc[Ld.site]=P.h;
        }
      }
    }catch(e){}

    const F=S.surface;
    const ds=F&&isFinite(F.dscale)?F.dscale:1;
    const n=P.n||80;

    /* ---------------------------------------------------------------
       RESPONSIVE LAYOUT
       Left = terrain/map
       Right = dedicated sun evidence rail
       Bottom = telemetry band
       --------------------------------------------------------------- */
    const compact=W<270||H<185;
    const railW=Math.max(68,Math.min(84,Math.floor(W*0.28)));
    const hudH=compact?54:42;
    const topH=22;
    const gap=8;

    const mapX=7;
    const mapAvailW=Math.max(1,W-mapX-railW-gap-5);
    const mapAvailH=Math.max(1,H-topH-hudH-4);
    const mapPx=Math.max(1,Math.min(mapAvailW,mapAvailH));
    const mapY=topH+Math.max(0,(mapAvailH-mapPx)*0.5);

    const cell=mapPx/n;
    const centerX=mapX+mapPx*0.5;
    const centerY=mapY+mapPx*0.5;

    /* Exact existing mapping:
       pxe(v)=(v*1000*ds/3000+0.5)*cell*n
       pyn(v)=(0.5-v*1000*ds/3000)*cell*n
    */
    const posScale=1000*ds/3000;

    const siteName=
      Ld.site==="shackleton"?"SHACKLETON RIM":
      Ld.site==="malapert"?"MONS MALAPERT":
      "TRANQUILLITATIS";

    /* ---------------------------------------------------------------
       STATIC TERRAIN CACHE
       Contrast is deliberately dark; amber is reserved for hazard tint.
       --------------------------------------------------------------- */
    try{
      const bw=x.canvas?x.canvas.width:0;
      const bh=x.canvas?x.canvas.height:0;
      const key=
        Ld.site+"|"+bw+"x"+bh+
        "|"+W+"x"+H+
        "|"+mapX+"|"+mapY+"|"+mapPx;

      let bg=drawSurfaceFallback._bg;

      if(!bg||!bg.cv||bg.cv.width!==bw||bg.cv.height!==bh){
        const c=document.createElement("canvas");
        c.width=Math.max(1,bw);
        c.height=Math.max(1,bh);
        bg={cv:c,key:""};
        drawSurfaceFallback._bg=bg;
      }

      if(bg.key!==key){
        const b=bg.cv.getContext("2d");

        b.setTransform(1,0,0,1,0,0);
        b.clearRect(0,0,bg.cv.width,bg.cv.height);
        b.setTransform(
          bg.cv.width/Math.max(1,W),0,0,
          bg.cv.height/Math.max(1,H),0,0
        );

        b.fillStyle="#070A0F";
        b.fillRect(0,0,W,H);

        const Hh=
          (drawSurfaceFallback._heightCache&&
           drawSurfaceFallback._heightCache[Ld.site])||P.h;

        let mn=1e9,mx=-1e9;

        if(Hh&&Hh.length){
          for(let q=0;q<Hh.length;q++){
            const v=Hh[q];
            if(v<mn)mn=v;
            if(v>mx)mx=v;
          }
        }else{
          mn=0;
          mx=1;
        }

        const span=Math.max(1,mx-mn);

        /* Map slab + frame */
        b.fillStyle="#0D1218";
        b.fillRect(mapX-2,mapY-2,mapPx+4,mapPx+4);

        b.fillStyle="#151B23";
        b.fillRect(mapX,mapY,mapPx,mapPx);

        b.strokeStyle="#5A6172";
        b.lineWidth=1;
        b.strokeRect(mapX+0.5,mapY+0.5,mapPx-1,mapPx-1);

        b.fillStyle="#0A0F14";
        b.fillRect(mapX+2,mapY+2,mapPx-4,mapPx-4);

        if(Hh&&Hh.length>=n*n){
          for(let j=0;j<n;j++)for(let i=0;i<n;i++){
            const idx=j*n+i;
            const t=(Hh[idx]-mn)/span;

            /* Cheap cached relief cue for stronger terrain readability. */
            const il=i>0?Hh[idx-1]:Hh[idx];
            const ir=i<n-1?Hh[idx+1]:Hh[idx];
            const iu=j>0?Hh[idx-n]:Hh[idx];
            const id=j<n-1?Hh[idx+n]:Hh[idx];

            const gx=(ir-il)/span;
            const gy=(id-iu)/span;
            const relief=Math.max(-1,Math.min(1,gx*0.75+gy*0.9));

            let base=Math.round(28+t*62-relief*13);
            if(base<18)base=18;
            else if(base>96)base=96;

            const r=P.rock&&P.rock[idx];

            if(r===2){
              const rr=Math.min(150,base+70);
              const gg=Math.min(125,Math.round(base*0.72+35));
              const bb=Math.min(88,Math.round(base*0.42+10));
              b.fillStyle=`rgb(${rr},${gg},${bb})`;
            }else if(r===1){
              const rr=Math.min(130,base+34);
              const gg=Math.min(112,Math.round(base*0.82+20));
              const bb=Math.min(78,Math.round(base*0.56+6));
              b.fillStyle=`rgb(${rr},${gg},${bb})`;
            }else{
              const gg=Math.min(104,base+5);
              const bb=Math.min(116,base+12);
              b.fillStyle=`rgb(${base},${gg},${bb})`;
            }

            b.fillRect(
              mapX+i*cell,
              mapY+j*cell,
              cell+0.35,
              cell+0.35
            );
          }
        }

        /* Sparse structural grid — not a new data layer. */
        b.strokeStyle="rgba(90,97,114,.22)";
        b.lineWidth=1;

        for(let g=1;g<4;g++){
          const p=mapX+mapPx*g/4;
          const q=mapY+mapPx*g/4;

          b.beginPath();
          b.moveTo(p,mapY);
          b.lineTo(p,mapY+mapPx);
          b.stroke();

          b.beginPath();
          b.moveTo(mapX,q);
          b.lineTo(mapX+mapPx,q);
          b.stroke();
        }

        bg.key=key;
      }

      x.drawImage(bg.cv,0,0,W,H);
    }catch(e){}

    /* ---------------------------------------------------------------
       MAP OVERLAYS
       --------------------------------------------------------------- */
    try{
      /* Prime target */
      x.strokeStyle="rgba(94,246,160,.82)";
      x.lineWidth=1;

      x.beginPath();
      x.arc(centerX,centerY,6,0,Math.PI*2);
      x.stroke();

      x.beginPath();
      x.moveTo(centerX-3,centerY);
      x.lineTo(centerX+3,centerY);
      x.stroke();

      x.beginPath();
      x.moveTo(centerX,centerY-3);
      x.lineTo(centerX,centerY+3);
      x.stroke();

      if(F&&F.trail&&F.trail.length>1){
        /* Traverse trail */
        x.strokeStyle="rgba(94,246,160,.55)";
        x.lineWidth=1.5;
        x.beginPath();

        for(let k=0;k<F.trail.length;k++){
          const p=F.trail[k];

          const px=mapX+(p[0]*posScale+0.5)*mapPx;
          const py=mapY+(0.5-p[1]*posScale)*mapPx;

          if(k===0)x.moveTo(px,py);
          else x.lineTo(px,py);
        }

        x.stroke();

        /* Live rover */
        const lp=F.trail[F.trail.length-1];
        const mx=isFinite(F.ce)?F.ce:lp[0];
        const my=isFinite(F.cn)?F.cn:lp[1];

        const rx=mapX+(mx*posScale+0.5)*mapPx;
        const ry=mapY+(0.5-my*posScale)*mapPx;

        /* Bearing line to prime target */
        x.strokeStyle="rgba(232,230,223,.34)";
        x.lineWidth=1;

        x.beginPath();
        x.moveTo(rx,ry);
        x.lineTo(centerX,centerY);
        x.stroke();

        /* Rover triangle */
        x.fillStyle="#5EF6A0";
        x.beginPath();
        x.moveTo(rx,ry-6);
        x.lineTo(rx+4.5,ry+5);
        x.lineTo(rx-4.5,ry+5);
        x.closePath();
        x.fill();

        /* Heading */
        let hx=isFinite(F.de)?F.de:0;
        let hz=isFinite(F.dn)?F.dn:0;

        if(Math.abs(hx)+Math.abs(hz)<=1e-9){
          const A=F.trail[F.trail.length-2];
          const B=F.trail[F.trail.length-1];
          hx=B[0]-A[0];
          hz=B[1]-A[1];
        }

        const L=Math.hypot(hx,hz);

        if(L>1e-9){
          const ux=hx/L;
          const uy=-hz/L;
          const U=13;

          x.strokeStyle="#5EF6A0";
          x.lineWidth=2;

          x.beginPath();
          x.moveTo(rx,ry);
          x.lineTo(rx+ux*U,ry+uy*U);
          x.stroke();

          x.beginPath();
          x.moveTo(
            rx+ux*U,
            ry+uy*U
          );
          x.lineTo(
            rx+ux*(U-4)-uy*2,
            ry+uy*(U-4)+ux*2
          );

          x.moveTo(
            rx+ux*U,
            ry+uy*U
          );
          x.lineTo(
            rx+ux*(U-4)+uy*2,
            ry+uy*(U-4)-ux*2
          );
          x.stroke();
        }
      }else{
        /* Landing fallback marker */
        const ex=Math.min(
          Math.max(0,Ld.offsetKm||0),
          1.2
        )*1000;

        const rx=mapX+
          (ex*ds/3000+0.5)*mapPx;

        const ry=centerY;

        x.fillStyle="#5EF6A0";
        x.beginPath();
        x.moveTo(rx,ry-6);
        x.lineTo(rx+4.5,ry+5);
        x.lineTo(rx-4.5,ry+5);
        x.closePath();
        x.fill();
      }

      /* North marker */
      x.font="10px 'IBM Plex Mono',monospace";
      x.fillStyle="#8D93A1";
      x.textAlign="center";
      x.fillText("N",centerX,mapY+11);
      x.textAlign="left";

      /* Camera view cone (presentation-fed, hidden without a live surface
         camera): reads the camera world matrix directly (this classic script
         has no THREE import) and projects its gaze onto map east/north.
         Follows walkaround orbits, mast gaze, and cockpit drag offsets
         automatically — top-down views hide it (no meaningful heading).
         Same-frame data, never a clock. */
      try{
        const VV=(window.__opsV&&window.__opsV.surfActive)?window.__opsV:null;
        const cam=VV&&VV.camera?VV.camera:null;
        const me=cam&&cam.matrixWorld?cam.matrixWorld.elements:null;
        if(me&&F&&F.trail&&F.trail.length){
          const ex=-me[8], en=me[10];
          const hl=Math.hypot(ex,en);
          if(hl>0.05){
            const lp=F.trail[F.trail.length-1];
            const cmx=isFinite(F.ce)?F.ce:lp[0], cmy=isFinite(F.cn)?F.cn:lp[1];
            const crx=mapX+(cmx*posScale+0.5)*mapPx, cry=mapY+(0.5-cmy*posScale)*mapPx;
            const ux=ex/hl, uy=-en/hl, U=15, cs=Math.cos(0.38), sn=Math.sin(0.38);
            x.strokeStyle="rgba(232,230,223,.30)";x.lineWidth=1;
            x.beginPath();
            x.moveTo(crx,cry);x.lineTo(crx+(ux*cs-uy*sn)*U,cry+(ux*sn+uy*cs)*U);
            x.moveTo(crx,cry);x.lineTo(crx+(ux*cs+uy*sn)*U,cry+(-ux*sn+uy*cs)*U);
            x.stroke();
            x.strokeStyle="rgba(232,230,223,.75)";x.lineWidth=1.5;
            x.beginPath();x.moveTo(crx,cry);x.lineTo(crx+ux*U,cry+uy*U);x.stroke();
          }
        }
      }catch(e){}
    }catch(e){}

    /* ---------------------------------------------------------------
       SUN EVIDENCE RAIL
       Live vector from __opsV.surf.sunDir.
       No second sun calculation.
       --------------------------------------------------------------- */
    try{
      const SV=
        (window.__opsV&&
         window.__opsV.surfActive&&
         window.__opsV.surf)?
        window.__opsV.surf:null;

      const sd=
        (SV&&SV.sunDir&&
         isFinite(SV.sunDir.x)&&
         isFinite(SV.sunDir.y)&&
         isFinite(SV.sunDir.z))?
        SV.sunDir:null;

      if(sd){
        const compass=
          drawSurfaceFallback._compass||
          (drawSurfaceFallback._compass=[
            "N","NE","E","SE",
            "S","SW","W","NW"
          ]);

        const se=sd.x;
        const sn=-sd.z;

        let az=Math.atan2(se,sn)*180/Math.PI;
        if(!isFinite(az))az=0;

        const el=
          Math.asin(
            Math.max(-1,Math.min(1,sd.y))
          )*180/Math.PI;

        const nf=
          (SV&&isFinite(SV.nightF))?
          Math.max(0,Math.min(1,SV.nightF)):0;

        /* Fixed-size history storage. */
        let sp=drawSurfaceFallback._sunPath;

        if(!sp){
          sp={
            site:"",
            lastSol:-Infinity,
            count:0,
            az:new Float32Array(120),
            el:new Float32Array(120)
          };

          drawSurfaceFallback._sunPath=sp;
        }

        if(sp.site!==Ld.site){
          sp.site=Ld.site;
          sp.lastSol=-Infinity;
          sp.count=0;
        }

        if(F&&isFinite(F.sol)&&F.sol<sp.lastSol){
          sp.lastSol=-Infinity;
          sp.count=0;
        }

        /* One history sample per sol, not per render tick. */
        if(F&&isFinite(F.sol)&&F.sol!==sp.lastSol){
          if(sp.count<120){
            sp.az[sp.count]=az;
            sp.el[sp.count]=el;
            sp.count++;
          }else{
            sp.az.copyWithin(0,1);
            sp.el.copyWithin(0,1);
            sp.az[119]=az;
            sp.el[119]=el;
          }

          sp.lastSol=F.sol;
        }

        const railX=mapX+mapPx+gap;
        const railCenter=
          railX+
          Math.max(1,(W-railX-4)*0.5);

        const cr=Math.max(
          16,
          Math.min(
            22,
            (W-railX-4)*0.31
          )
        );

        const cx=railCenter;
        const cy=mapY+cr+8;

        /* Dial ring */
        x.strokeStyle="rgba(141,147,161,.85)";
        x.lineWidth=1;

        x.beginPath();
        x.arc(cx,cy,cr,0,Math.PI*2);
        x.stroke();

        /* Crosshair */
        x.strokeStyle="rgba(90,97,114,.35)";

        x.beginPath();
        x.moveTo(cx,cy-cr-3);
        x.lineTo(cx,cy+cr+3);
        x.moveTo(cx-cr-3,cy);
        x.lineTo(cx+cr+3,cy);
        x.stroke();

        /* Cardinal labels */
        x.fillStyle="#8D93A1";
        x.font="10px 'IBM Plex Mono',monospace";
        x.textAlign="center";

        x.fillText("N",cx,cy-cr-6);
        x.fillText("E",cx+cr+8,cy+3);
        x.fillText("S",cx,cy+cr+14);
        x.fillText("W",cx-cr-8,cy+3);

        x.textAlign="left";

        /* History path + dots */
        if(sp.count){
          x.strokeStyle="rgba(255,214,140,.22)";
          x.lineWidth=1;
          x.beginPath();

          for(let k=0;k<sp.count;k++){
            const pa=sp.az[k]*Math.PI/180;

            const px=
              cx+Math.sin(pa)*(cr-1.5);

            const py=
              cy-Math.cos(pa)*(cr-1.5);

            if(k===0)x.moveTo(px,py);
            else x.lineTo(px,py);
          }

          x.stroke();

          for(let k=0;k<sp.count;k++){
            const pa=sp.az[k]*Math.PI/180;
            const a=
              0.14+
              0.52*(k/Math.max(1,sp.count-1));

            x.fillStyle=
              `rgba(255,214,140,${a.toFixed(2)})`;

            x.beginPath();
            x.arc(
              cx+Math.sin(pa)*(cr-1.5),
              cy-Math.cos(pa)*(cr-1.5),
              1.45,
              0,
              Math.PI*2
            );
            x.fill();
          }
        }

        /* Live sun vector */
        const ar=az*Math.PI/180;

        const sx=
          cx+Math.sin(ar)*(cr-1.5);

        const sy=
          cy-Math.cos(ar)*(cr-1.5);

        x.strokeStyle=
          nf>0.5?
          "rgba(90,97,114,.8)":
          "rgba(255,214,140,.7)";

        x.lineWidth=2;

        x.beginPath();
        x.moveTo(cx,cy);
        x.lineTo(sx,sy);
        x.stroke();

        x.fillStyle=
          nf>0.5?
          "#5A6172":
          "#FFD68C";

        x.beginPath();
        x.arc(sx,sy,3.3,0,Math.PI*2);
        x.fill();

        /* Dedicated readable readout */
        x.fillStyle="#8D93A1";
        x.font="10px 'IBM Plex Mono',monospace";
        x.textAlign="center";

        x.fillText(
          "LIVE SUN",
          cx,
          cy+cr+29
        );

        x.fillStyle="#5EF6A0";
        x.fillText(
          "SUN "+(el>=0?"+":"")+el.toFixed(1)+"°",
          cx,
          cy+cr+41
        );

        x.fillStyle="#8D93A1";
        x.fillText(
          "AZ "+
          compass[
            Math.round(
              (((az%360)+360)%360)/45
            )%8
          ],
          cx,
          cy+cr+53
        );

        if(nf>0.5){
          x.fillStyle="#5A6172";
          x.strokeStyle="#5A6172";
          x.lineWidth=1;

          x.strokeRect(
            cx-25,
            cy+cr+59,
            50,
            13
          );

          x.textAlign="center";
          x.fillText(
            "NIGHT",
            cx,
            cy+cr+69
          );

          x.textAlign="left";
        }

        x.textAlign="left";
      }
    }catch(e){}

    /* ---------------------------------------------------------------
       SCALE BAR
       Truthful 500 m length, kept inside map zone.
       --------------------------------------------------------------- */
    try{
      const px500=
        0.5*1000*ds/3000*mapPx;

      const by=mapY+mapPx-9;

      const bx=Math.max(
        mapX+5,
        mapX+mapPx-px500-6
      );

      x.strokeStyle="rgba(232,230,223,.78)";
      x.lineWidth=2;

      x.beginPath();
      x.moveTo(bx,by);
      x.lineTo(bx+px500,by);
      x.stroke();

      x.strokeStyle="rgba(232,230,223,.5)";
      x.lineWidth=1;

      x.beginPath();
      x.moveTo(bx,by-3);
      x.lineTo(bx,by+3);

      x.moveTo(
        bx+px500,
        by-3
      );
      x.lineTo(
        bx+px500,
        by+3
      );

      x.stroke();

      x.fillStyle="#8D93A1";
      x.font="10px 'IBM Plex Mono',monospace";
      x.textAlign="left";

      x.fillText(
        "500 M",
        bx,
        by-5
      );

      x.textAlign="left";
    }catch(e){}

    /* ---------------------------------------------------------------
       SITE + TELEMETRY
       --------------------------------------------------------------- */
    try{
      x.textAlign="left";
      x.font="10px 'IBM Plex Mono',monospace";

      x.fillStyle="#8D93A1";
      x.fillText(
        siteName,
        mapX,
        12
      );

      x.fillStyle="#5A6172";
      x.fillText(
        "3×3 KM TRUE M",
        mapX+120,
        12
      );

      const y0=H-(compact?43:31);

      x.fillStyle="#5EF6A0";

      if(F){
        const mode=
          F.orders&&F.orders.mode?
          F.orders.mode:"DRIVE";

        const pace=
          F.orders&&F.orders.pace?
          F.orders.pace:"STANDARD";

        const nrg=Math.round(F.energy||0);
        const dist=Math.round(surfDist(F)*100)/100;
        const z=Math.round(ds*100)/100;

        if(compact){
          x.fillText(
            "SOL "+F.sol+" · "+
            mode.toUpperCase()+"/"+
            pace.toUpperCase(),
            mapX,
            y0
          );

          x.fillText(
            "NRG "+nrg+
            "% · BUF "+
            fmtData(F.dataMb),
            mapX,
            y0+12
          );

          x.fillText(
            dist+
            " KM TO TARGET · ×"+
            z,
            mapX,
            y0+24
          );

          x.fillStyle="#5A6172";
          x.fillText(
            "BOUNDED PATCH — NOT TO SCALE",
            mapX,
            y0+36
          );
        }else{
          x.fillText(
            "SOL "+F.sol+" · "+
            mode.toUpperCase()+"/"+
            pace.toUpperCase()+
            " · NRG "+nrg+"%",
            mapX,
            y0
          );

          x.fillText(
            "BUF "+fmtData(F.dataMb)+" · "+
            dist+
            " KM TO TARGET · ×"+
            z,
            mapX,
            y0+12
          );

          x.fillStyle="#5A6172";
          x.fillText(
            "BOUNDED PATCH — NOT TO SCALE BEYOND",
            mapX,
            y0+24
          );
        }
      }else{
        const off=
          Math.round((Ld.offsetKm||0)*100)/100;

        const slope=
          Math.round((Ld.slope||0)*10)/10;

        if(compact){
          x.fillText(
            "TOUCHDOWN +"+off+" KM E",
            mapX,
            y0
          );

          x.fillText(
            "SLOPE "+slope+"°"+
            (Ld.degraded?" · DEGRADED":""),
            mapX,
            y0+12
          );

          x.fillStyle="#5A6172";
          x.fillText(
            "BOUNDED PATCH — NOT TO SCALE",
            mapX,
            y0+24
          );
        }else{
          x.fillText(
            "TOUCHDOWN +"+off+
            " KM E · SLOPE "+
            slope+"°"+
            (Ld.degraded?
             " · DEGRADED":""),
            mapX,
            y0
          );

          x.fillStyle="#5A6172";
          x.fillText(
            "BOUNDED PATCH — NOT TO SCALE BEYOND",
            mapX,
            y0+12
          );
        }
      }

      /* Explicitly neutralize textAlign leakage. */
      x.textAlign="left";
    }catch(e){}

  }catch(e){}
}

/* ── Phase-6 surface sol loop (landed L2 only) ──
   Standing-orders gameplay: the player sets orders (mode + pace); every
   stepDay resolves one sol. No real-time driving — Mars light-time truth.
   Slopes/rocks read from the Phase-5 bake (same grid the viewport renders);
   outside the 3 km patch the site abstraction applies (documented). */
const SURF_PACE={cautious:{rate:0.2,risk:0.5,cost:15},standard:{rate:0.5,risk:1.0,cost:25},push:{rate:1.0,risk:1.8,cost:40}};
const SURF_LINKMB={0:50,1:200,2:500};
function surfHazard(eKm,nKm){
  try{
    const P=(typeof SURFACE_PATCHES!=="undefined")?SURFACE_PATCHES:null;
    const Ld=S.landing, pg=P&&P.sites?P.sites[Ld.site]:null;
    if(pg){
      const half=pg.sizeM/2, x=eKm*1000, z=nKm*1000;
      if(Math.abs(x)<=half&&Math.abs(z)<=half){
        const n=pg.n, post=pg.sizeM/(n-1);
        const fi=(x+half)/post, fj=(z+half)/post;
        const i0=Math.max(0,Math.min(n-2,Math.floor(fi))), j0=Math.max(0,Math.min(n-2,Math.floor(fj)));
        const fx=fi-i0, fz=fj-j0;
        const g=(jj,ii)=>pg.slope[jj*n+ii];
        return {slope:g(j0,i0)*(1-fx)*(1-fz)+g(j0,i0+1)*fx*(1-fz)+g(j0+1,i0)*(1-fx)*fz+g(j0+1,i0+1)*fx*fz,
          rock:pg.rock[Math.round(j0+fz)*n+Math.round(i0+fx)],inside:true};
      }
    }
  }catch(e){}
  const st=moonSite(S);
  return {slope:st?st.slope:3,rock:1,inside:false};
}
function initSurface(){
  const Ld=S.landing; if(!Ld) return;
  S.surface={sol:0,e:Ld.travKm,n:0,d0:Ld.travKm,
    /* Honest-timelapse interpolation (T3): pe/pn hold the previous sol
       boundary so the 3D/inset views can render P(sol−1+frac) — exact,
       C0-continuous, 1-sol wall-time delay (sol-delayed commands fiction).
       ce/cn/df are refreshed per game tick in drawOrbit; readers must fall
       back to e/n when absent (old saves). */
    pe:Ld.travKm,pn:0,ce:Ld.travKm,cn:0,df:0,
    segMoved:0,segMovedPrev:0,de:0,dn:0,
    _dSC:0,_dTick:0,_dRate:0,_dLagEase:1,
    /* T11 sample ring: exact [sol,e,n] per completed step (cap 24). Lets
       the per-tick display evaluate through EVERY burst segment instead of
       only the last — no skipped sols at 50/225 d/s. Old saves lack it;
       readers fall back to pe/pn. */
    seg:[[0,Ld.travKm,0]],
    dscale:Math.min(1,1500/Math.max(1500,Ld.travKm*1000)),
    energy:100,dataMb:0,science:0,returnedMb:0,
    orders:{mode:"drive",pace:"standard"},trail:[[Ld.travKm,0]],reached:false,safed:false};
}
function surfDist(F){ return Math.hypot(F.e,F.n); }
function stepSurface(){
  const O=S.ops,F=S.surface; if(!O||!F||O.ended) return;
  const D=derive(S), spec=landSpec(); if(!spec||!D.rv) return;
  const st=spec.site, rv=D.rv;
  F.sol++;
  /* Segment start for honest-timelapse interpolation: every exit path below
     (safe-mode return included) leaves pe/pn at this sol's start boundary,
     so lerp(pe,pn → e,n, df) is always a real simulated segment. */
  F.pe=F.e; F.pn=F.n;
  F.segMovedPrev=F.segMoved|0;
  const rnd=mulberry32(S.seed+F.sol*7919);
  const hz=surfHazard(F.e,F.n);
  const need=st.sun<0.6?1:0;
  const gateOk=rv.rp.night>=need;
  const eff=gateOk?1:0.3; // under-heated kits work at 30% + cold drain
  if(!gateOk){
    F.energy=Math.max(0,F.energy-8);
    if(F.sol%20===1) logLine(O.day,`Cold-limited sol: ${rv.rp.n} cannot hold heat (site needs hibernation grade). Ops at 30%, overnight drain.`,"warn");
  }
  const o=F.orders, pc=SURF_PACE[o.pace]||SURF_PACE.standard;
  const dist=surfDist(F);
  const bx=dist>1e-9?-F.e/dist:0, bz=dist>1e-9?-F.n/dist:0; // bearing to prime target
  const spend=c=>{ F.energy=Math.max(0,F.energy-c);
    if(F.energy<=0&&!F.safed){ F.safed=true; logLine(O.day,"Battery empty — safe mode. Recharge to resume surface ops.","bad"); } };
  if(F.energy<=0&&o.mode!=="recharge"){
    F.energy=Math.min(100,F.energy+(rv.rp.night===2?20:8));
    F.trail.push([+F.e.toFixed(3),+F.n.toFixed(3)]);
    F.segMoved=0; // static by construction (shift just ran, no motion below)
    try{
      if(!F.seg) F.seg=[[F.sol-1,F.pe,F.pn]];
      F.seg.push([F.sol,+F.e,+F.n]);
      if(F.seg.length>24) F.seg.splice(0,F.seg.length-24);
    }catch(e){}
    return; // safe mode: trickle only
  }
  if(o.mode==="drive"){
    if(F.reached){ /* hold position at the prime target */ }
    else if(hz.slope>rv.rm.slope){
      logLine(O.day,`Drive refused: ${hz.slope.toFixed(0)}° ground exceeds the ${rv.rm.slope}° chassis cap. Change pace is no help — only better mobility crosses this.`,"warn");
    } else {
      let slipP=Math.max(0,(hz.slope-rv.rm.slope*0.5))/30*pc.risk*(1-rv.rm.grip*0.5)+hz.rock*0.03;
      const slip=rnd()<slipP;
      const step=pc.rate*(slip?0.4:1)*eff;
      const mv=Math.min(step,dist);
      F.e=+(F.e+bx*mv).toFixed(4); F.n=+(F.n+bz*mv).toFixed(4);
      if(slip){ // lateral crab
        F.e=+(F.e-bz*0.05).toFixed(4); F.n=+(F.n+bx*0.05).toFixed(4);
        logLine(O.day,`Wheel slip on ${hz.slope.toFixed(0)}° ground — leg yielded ${(mv).toFixed(2)} km of ${(step).toFixed(2)} planned.`,"warn");
      }
      spend(pc.cost*(hz.slope>10?1.5:1));
      if(surfDist(F)<0.2&&!F.reached){
        F.reached=true; F.science+=200;
        logLine(O.day,`Prime target reached after ${F.sol} sols. +200 survey science. The plain is yours to work.`,"good");
      }
    }
  } else if(o.mode==="dwell"){
    const y=10*rv.ry.sci*st.sci*eff;
    F.science+=y; F.dataMb+=400;
    spend(10);
    if(F.sol%10===0) logLine(O.day,`Survey dwell: +${y.toFixed(0)} science, 400 Mb cached (${fmtData(F.dataMb)} buffered).`,"");
  } else if(o.mode==="drill"){
    if(S.rover.pay!=="ry3"){ logLine(O.day,"No drill aboard — caching a surface sample instead (dwell).","warn"); o.mode="dwell"; }
    else { const y=150*rv.ry.sci*st.sci*eff; F.science+=y; F.dataMb+=1500; spend(25); logLine(O.day,`Drill + cache: +${y.toFixed(0)} science, 1.5 Gb cached.`,"good"); }
  } else if(o.mode==="recharge"){
    const g=rv.rp.night===2?20:45*st.sun;
    F.energy=Math.min(100,F.energy+g);
    if(F.energy>=20) F.safed=false;
  } else if(o.mode==="relay"){
    const link=SURF_LINKMB[rv.rc.gain]*((0.3+0.7*st.earth));
    const dump=Math.min(F.dataMb,link);
    F.dataMb-=dump; F.returnedMb+=dump;
    if(dump>0) logLine(O.day,`Relay pass: ${fmtData(dump)} downlinked (${fmtData(F.returnedMb)} total this mission).`,"good");
  }
  F.trail.push([+F.e.toFixed(3),+F.n.toFixed(3)]);
  if(F.trail.length>600) F.trail.splice(0,F.trail.length-600);
  F.segMoved=((F.e!==F.pe)||(F.n!==F.pn))?1:0;
  /* T11: record the exact endpoint (every exit path — safe-mode return too)
     so bursts can never skip sols. Cap 24; readers scan by sol number. */
  try{
    if(!F.seg) F.seg=[[F.sol-1,F.pe,F.pn]];
    F.seg.push([F.sol,+F.e,+F.n]);
    if(F.seg.length>24) F.seg.splice(0,F.seg.length-24);
  }catch(e){}
}
/* T7 sub-sol shaping: boundary-exact cubic Hermite on df (strictly
   monotonic, zero lag, zero overshoot). m0=0 launches ease out of a
   stopped sol, m0=1 continues a multi-sol drive; m1=0.6 lands softly
   without stalling. Verified: φ(0)=0, φ(1)=1, φ′≥0 on [0,1] for both
   m0 (φ′=t(4.8−4.2t) and −1.2t²+0.8t+1, root-free on [0,1]).
   Presentation continuity: callers pass m1=m0, so a carried drive (m0=1)
   also exits linear (m0=m1=1 is exactly linear) — constant velocity across
   sol lines instead of a breathe every sol. Endpoints identical, sim and
   2D/HUD/log untouched; static sols (charge/safe/dwell) still hold by truth. */
function shapeSubSol(df,m0,m1){
  if(df<=0) return 0; if(df>=1) return 1;
  const e1=(m1===undefined)?0.6:m1, t2=df*df, t3=t2*df;
  const v=(t3-2*t2+df)*m0+(-2*t3+3*t2)+(t3-t2)*e1;
  return Math.min(1,Math.max(0,v));
}
/* Single display-position evaluator P(sC) (sol-time → sim km + segment dir).
   THE authoritative traverse interpolation: the per-tick drawOrbit path AND
   the per-frame surface-view dead-reckoning both call this — no second
   implementation. sC is display sol-time (lagged behind truth, never ahead
   of the newest sample by more than the ring headroom; callers clamp).
   Returns {e,n,de,dn} or null. Always Hermite-shaped on moving segments:
   boundary-exact + monotone for any evaluation cadence, so warp-button
   crossings can never hop (a slow/linear gate here would teleport the rover
   by (shape−linear)×leg on the crossing tick). */
function surfEvalAt(sC){
  try{
    const F=S&&S.surface; if(!F) return null;
    const sg=F.seg;
    if(sg&&sg.length>=1){
      let j=sg.length-1;
      while(j>0&&sg[j][0]>sC) j--;
      const A=sg[j], B=(j+1<sg.length)?sg[j+1]:null;
      if(B&&sC<=B[0]&&B[0]>A[0]){
        const t=Math.min(1,Math.max(0,(sC-A[0])/(B[0]-A[0])));
        const segMoves=(B[1]!==A[1])||(B[2]!==A[2]);
        const m0=(j>0)?(((A[1]!==sg[j-1][1])||(A[2]!==sg[j-1][2]))?1:0):1;
        const frac=segMoves?shapeSubSol(t,m0,m0):t;
        return {e:A[1]+(B[1]-A[1])*frac, n:A[2]+(B[2]-A[2])*frac, de:B[1]-A[1], dn:B[2]-A[2]};
      }
      if(!B) return {e:A[1], n:A[2], de:0, dn:0};
      /* sC before the oldest retained sample (ring wrapped at sustained warp):
         hold the oldest endpoint — exact within the retained window. */
      const A0=sg[0];
      return {e:A0[1], n:A0[2], de:0, dn:0};
    }
    /* Legacy single segment (old saves without F.seg): spans [sol-1, sol]. */
    const pe=isFinite(F.pe)?F.pe:F.e, pn=isFinite(F.pn)?F.pn:F.n;
    const t=Math.min(1,Math.max(0,sC-(F.sol-1)));
    const segMoves=(F.e!==pe)||(F.n!==pn);
    const _m0=F.segMovedPrev?1:0;
    const frac=segMoves?shapeSubSol(t,_m0,_m0):t;
    return {e:pe+(F.e-pe)*frac, n:pn+(F.n-pn)*frac, de:F.e-pe, dn:F.n-pn};
  }catch(e){ return null; }
}
function drawTL(){
  const cv=el("tl"); if(!cv)return;
  const f=fitCanvas(cv,900,86), x=f.x, W=f.W, H=f.H, O=S.ops;
  x.fillStyle="#04060B";x.fillRect(0,0,W,H);
  const smoothDay = (O ? (O.day + Math.min(0.999, Math.max(0, acc))) : 0);
  const M=18, tw=W-M*2, y=44;
  x.strokeStyle="#1C2433";x.beginPath();x.moveTo(M,y);x.lineTo(W-M,y);x.stroke();
  // cruise band
  if(O.cruise>0){x.fillStyle="rgba(42,107,212,.22)";x.fillRect(M,y-9,tw*O.cruise/O.totalDays,18);}
  x.fillStyle="rgba(94,246,160,.13)";
  x.fillRect(M+tw*O.cruise/O.totalDays,y-9,tw*(1-O.cruise/O.totalDays),18);
  // progress
  x.fillStyle="#5EF6A0";x.fillRect(M,y-2,tw*clamp(smoothDay/O.totalDays,0,1),4);
  // events
  O.events.forEach((e,i)=>{
    const px=M+tw*clamp(e.day/O.totalDays,0,1);
    const done=i<O.evIdx;
    x.strokeStyle=done?"#8D93A1":"#FFB000";x.lineWidth=1;
    x.beginPath();x.moveTo(px,y-16);x.lineTo(px,y+16);x.stroke();
    x.fillStyle=done?"#8D93A1":"#FFB000";
    x.beginPath();x.moveTo(px,y-20);x.lineTo(px-4,y-14);x.lineTo(px+4,y-14);x.closePath();x.fill();
  });
  // now marker
  const nx=M+tw*clamp(smoothDay/O.totalDays,0,1);
  x.strokeStyle="#E8E6DF";x.lineWidth=1.5;x.beginPath();x.moveTo(nx,y-22);x.lineTo(nx,y+22);x.stroke();
  x.font="10px 'IBM Plex Mono',monospace";x.fillStyle="#8D93A1";x.textAlign="left";
  x.fillText("LAUNCH",M,y+34);
  if(O.cruise>0){x.textAlign="center";x.fillText("ARRIVAL",M+tw*O.cruise/O.totalDays,y+34);}
  x.textAlign="right";x.fillText("END OF MISSION",W-M,y+34);
  x.textAlign="left";x.fillStyle="#5A6172";x.fillText(`${(O.totalDays/365.25).toFixed(1)} YEAR NOMINAL MISSION`,M,16);
  x.textAlign="left";
}

/* T4 throttle state: cheap clock/status text refreshes every tick; the
   heavy innerHTML rebuilds (gauges/sciBox/120-line log) only on sim change
   or 500 ms — same numbers, a fraction of the main-thread cost. */
let opsSideCache={day:-1,t:0,ord:"",log:-1};
function renderOpsSide(force){
  const O=S.ops,D=derive(S),L=byId(LEVELS,S.levelId);
  const cd=el("clkDay"); if(!cd)return;
  cd.textContent=dayLabel(O.day);
  el("clkPhase").textContent = O.day<O.cruise?"cruise":"science operations";
  const lt=el("orbit")._lt||0;
  el("clkLt").textContent = lt>0.5?`command round trip ${lt>60?Math.round(lt/60)+" min":Math.round(lt)+" s"}`:"";
  /* Mission-control hierarchy: status + phase + primary objective, updated every render. */
  const offNominal = O.blackout>0||O.dsnCut>0||O.dsnCutSoft>0||O.dead.size>0;
  const stEl=el("opsStatus"); if(stEl){ stEl.textContent=offNominal?"OFF-NOMINAL":"NOMINAL"; }
  const open=S.objectives.filter(o=>(O.delivered[o]||0)<needMb(L,o));
  open.sort((a,b)=>OBJ[b].w-OBJ[a].w);
  const po=el("primeObj");
  if(po){ po.textContent=open.length?`prime objective: ${OBJ[open[0]].t} — ${(clamp(O.delivered[open[0]]/needMb(L,open[0]),0,1)*100).toFixed(0)}%`:"all objectives complete"; }
  const live=D.instr.filter(i=>!O.dead.has(i.id));
  const ord=S.surface?S.surface.orders.mode+"/"+S.surface.orders.pace+":"+S.surface.sol:"";
  const nowMs=(typeof performance!=="undefined")?performance.now():0;
  const c=opsSideCache;
  if(!force&&c.day===O.day&&c.ord===ord&&c.log===O.log.length&&(nowMs-c.t)<500) return;
  c.day=O.day; c.t=nowMs; c.ord=ord; c.log=O.log.length;
  el("gauges").innerHTML=`
    <div><div class="k">SPACECRAFT HEALTH</div><div class="v" style="color:${O.dead.size?'var(--amber)':'var(--phosphor)'}">${O.dead.size?"DEGRADED":"NOMINAL"} · ${live.length}/${D.instr.length} live</div></div>
    <div><div class="k">POWER MARGIN (EOL)</div><div class="v" style="color:${D.margins.power<0?'var(--red)':D.margins.power<0.15?'var(--amber)':'var(--bone)'}">${(D.margins.power*100).toFixed(0)}%${O.powerMult<1?" · gen ×"+O.powerMult.toFixed(2):""}</div></div>
    <div><div class="k">COMMS STATUS</div><div class="v">${O.blackout>0?"BLACKOUT":O.dsnCut>0?"35% (CONTENTION)":esc(dsnTier().n.toUpperCase())+" · "+(L.dsnHrs*O.dsnFactor).toFixed(1)+" h/d"}</div></div>
    <div><div class="k">DATA BACKLOG</div><div class="v" style="color:${O.backlog>O.storageMb*0.85?'var(--amber)':'var(--bone)'}">${fmtData(O.backlog)} / ${fmtData(O.storageMb)}</div></div>
    <div><div class="k">DOWNLINK TODAY</div><div class="v">${fmtData(D.downMbPerDay*(O.blackout>0?0:O.dsnCut>0?0.35:1))}</div></div>
    <div><div class="k">TOTAL DOSE</div><div class="v" style="color:${O.dose>60?'var(--red)':O.dose>25?'var(--amber)':'var(--bone)'}">${fmt(O.dose)} krad</div></div>
    <div><div class="k">INSTRUMENTS LIVE</div><div class="v">${live.length} / ${D.instr.length}</div></div>
    <div><div class="k">OPERATIONS OVERRUN</div><div class="v">$${fmt(O.opsCost)}M</div></div>
    <div><div class="k">SCIENCE DISCARDED</div><div class="v" style="color:${O.overflow>0?'var(--amber)':'var(--bone)'}">${fmtData(O.overflow)}</div></div>`;
  /* Phase-6 surface orders (landed L2): standing orders + live sol telemetry.
     Same gauges grammar; refreshes every tick and on every order click. */
  if(S.landing&&S.surface){
    const F=S.surface, om=F.orders.mode, op=F.orders.pace;
    const dist=surfDist(F), cxz=Math.min(1,1500/Math.max(1500,F.d0*1000));
    const btn=(act,v,on,lbl)=>`<button data-act="${act}" data-v="${v}" class="minimap-action-btn" style="${on?"border-color:var(--phosphor);color:var(--phosphor)":""}" title="">${lbl}</button>`;
    /* Energy-stall warning (display only — reads stepSurface's own economy,
       changes nothing): the stop-go duty cycle (drive spends pace cost per
       sol, safe-mode trickles +8/+20) reads as frog-hops with no explanation.
       Project sols-of-driving-left so the remedy (CHARGE / easier pace) is
       visible before the stall. Rebuild key already covers sol+orders. */
    let nrgWarn="";
    try{
      const pc2=SURF_PACE[op]||SURF_PACE.standard;
      const rpN=(D.rv&&D.rv.rp)?D.rv.rp.night:0;
      const trickle=rpN===2?20:8;
      if(om!=="recharge"&&(F.energy<=0||(F.safed&&F.energy<20))){
        nrgWarn=`<div class="hint" style="font-size:10px;color:var(--red)">STALLED — safe-mode trickle (+${trickle}/sol). Switch to CHARGE to keep driving.</div>`;
      } else if(om==="drive"){
        const hz2=surfHazard(F.e,F.n);
        const cps=pc2.cost*(hz2.slope>10?1.5:1);
        const left=cps>0?F.energy/cps:99;
        if(left<3) nrgWarn=`<div class="hint" style="font-size:10px;color:var(--amber)">LOW ENERGY — ~${Math.max(0,left).toFixed(1)} sols of driving left at ${op} pace. CHARGE before it stalls.</div>`;
      } else if(om==="recharge"){
        const st0=(typeof moonSite==="function")?moonSite(S):null;
        const g=rpN===2?20:Math.round(45*((st0&&st0.sun)||1));
        nrgWarn=`<div class="hint" style="font-size:10px">Charging +${g}/sol${F.energy>=100?" (full)":""} — driving resumes on your orders.</div>`;
      }
    }catch(e){}
    el("gauges").innerHTML+=`
    <div><div class="k">SURFACE SOL ${F.sol} · ${dist.toFixed(2)} KM TO TARGET</div>
      <div class="v" style="font-size:11px">E ${F.e.toFixed(2)} / N ${F.n.toFixed(2)} km · NRG ${F.energy.toFixed(0)}% · BUF ${fmtData(F.dataMb)} · SCI ${F.science.toFixed(0)}${F.reached?" · <span style='color:var(--phosphor)'>ON TARGET</span>":""}</div></div>
    <div><div class="k">ORDERS (NEXT SOL)</div><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px">
      ${btn("sord","drive",om==="drive","DRIVE")}${btn("sord","dwell",om==="dwell","DWELL")}${btn("sord","drill",om==="drill","DRILL")}${btn("sord","recharge",om==="recharge","CHARGE")}${btn("sord","relay",om==="relay","RELAY")}</div></div>
    <div><div class="k">PACE</div><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px">
      ${btn("spce","cautious",op==="cautious","CAUTIOUS")}${btn("spce","standard",op==="standard","STANDARD")}${btn("spce","push",op==="push","PUSH")}</div></div>
    <div class="hint" style="font-size:10px">Traverse display ×${cxz.toFixed(2)} compressed · sol-delayed commands, no joystick</div>${nrgWarn}`;
  }
  el("sciBox").innerHTML=S.objectives.map(o=>{
    const f=clamp(O.delivered[o]/needMb(L,o),0,1);
    const covered=OBJ[o].need.every(t=>live.some(i=>i.tags.includes(t)));
    return `<div style="margin-bottom:9px">
      <div class="spread" style="font-size:12px"><span style="color:${covered?'var(--bone)':'var(--red)'}">${esc(OBJ[o].t)}</span>
      <span class="num hint">${(f*100).toFixed(0)}% <span style="color:var(--dimmer)">of ${fmtData(needMb(L,o))}</span></span></div>
      <div class="mini"><i style="width:${f*100}%;background:${f>=1?'var(--phosphor)':covered?'var(--blue-lift)':'var(--red)'}"></i></div></div>`}).join("")+
    (O.dead.size?`<div class="ghost-note">Lost: ${[...O.dead].map(i=>byId(INSTR,i).n).join(", ")}</div>`:"");
  el("logbox").innerHTML=O.log.map(l=>`<div class="logline ${l.cls}"><span class="d">${dayLabel(l.day)}</span><span>${esc(l.txt)}</span></div>`).join("");
}

/* ══════════════════════════════════════════════════════════════
   REPORT
   ══════════════════════════════════════════════════════════════ */
const REAL={
 l1:{n:"PACE",mass:1700,cost:964,yrs:3},
 l2:{n:"Lunar Reconnaissance Orbiter",mass:1846,cost:583,yrs:2},
 l3:{n:"Mars Reconnaissance Orbiter",mass:2180,cost:716,yrs:5},
 l4:{n:"OSIRIS-REx",mass:2110,cost:1160,yrs:7},
 l5:{n:"Europa Clipper",mass:6065,cost:5200,yrs:12},
 sbx:{n:"Mars Reconnaissance Orbiter",mass:2180,cost:716,yrs:5}
};
function scrReport(){
  const R=S.result, D=derive(S), L=byId(LEVELS,S.levelId), O=S.ops, rm=REAL[L.id];
  replayIdx=-1;
  const gcol=R.score>=74?"var(--phosphor)":R.score>=44?"var(--amber)":"var(--red)";
  const reason={complete:"Nominal end of mission.",prop:"Loss of mission: propellant exhausted.",launch:"Loss of mission: launch vehicle failure.",
                power:"Loss of mission: power shortfall."}[R.reason]||"";
  return `<div class="wrap"><div class="report">
    <div class="rcard"><span class="bracket tl"></span><span class="bracket br"></span>
      <div style="padding:13px 16px;border-bottom:1px solid var(--hairline)" class="spread">
        <span style="font-family:var(--mono);font-size:10.5px;letter-spacing:.17em;color:var(--dim)">MISSION REPORT</span>
        <span style="font-family:var(--disp);font-weight:700;letter-spacing:.2em;font-size:12px">MARGIN</span>
      </div>
      <div style="padding:14px 16px;border-bottom:1px solid var(--hairline)">
        <h2>${esc(L.name)}</h2><p class="hint">${esc(L.sub)} &#183; ${esc(reason)}</p>
      </div>
      <div class="rrow"><span class="k">SCIENCE RETURN</span><span class="v" style="color:${gcol}">${(R.ret*100).toFixed(0)}%</span></div>
      <div class="rrow"><span class="k">TOTAL COST</span><span class="v">$${fmt(R.cost)}M <span style="color:var(--dim);font-size:11px">/ $${fmt(L.capM)}M cap</span></span></div>
      <div class="rrow"><span class="k">MISSION DURATION</span><span class="v">${dayLabel(R.days)} &nbsp;<span style="color:var(--dim);font-size:11px">${(R.days/365.25).toFixed(1)} yr</span></span></div>
      ${S.assist&&L.assist?`<div class="rrow"><span class="k">TRAJECTORY</span><span class="v" style="font-size:12px">${esc(L.assist.label)}</span></div>`:""}
      <div class="rrow"><span class="k">LAUNCH OUTCOME</span><span class="v" style="font-size:12px">${esc(launchOutcomeLabel())}</span></div>
      <div class="rrow"><span class="k">ARRIVAL</span><span class="v" style="font-size:12px">${esc(arrivalLabel())}</span></div>
      ${R.surf?`<div class="rrow"><span class="k">SURFACE — LANDING</span><span class="v" style="font-size:12px">${esc(R.surf.profile)} · +${R.surf.offsetKm} km · slope ${R.surf.slope}° (${R.surf.degraded?"HARD":"nominal"}) — ${(R.surf.land*100).toFixed(0)}%</span></div>
      <div class="rrow"><span class="k">SURFACE — TRAVERSE</span><span class="v" style="font-size:12px">${R.surf.reached?"prime target reached":R.surf.sols+" sols roving"} · ${fmtData(R.surf.returnedMb)} returned · science ${R.surf.science.toFixed(0)} — ${(R.surf.trav*100).toFixed(0)}% / ${(R.surf.data*100).toFixed(0)}%</span></div>
      <div class="rrow"><span class="k">SURFACE BONUS</span><span class="v" style="color:var(--phosphor)">+${R.surf.bonus.toFixed(1)} pts</span></div>`:""}      <div class="rrow"><span class="k">PROXIMITY</span><span class="v" style="font-size:12px">${esc(proxLabel())}</span></div>
      <div class="rrow"><span class="k">DSN ALLOCATION</span><span class="v" style="font-size:12px">${esc(dsnTier().n)} (${(L.dsnHrs*dsnTier().f).toFixed(1)} h/day)</span></div>
      <div class="rrow"><span class="k">CAPTURE METHOD</span><span class="v" style="font-size:12px">${esc(aeroLabel())}</span></div>
      <div class="rrow"><span class="k">EXTENDED PHASE</span><span class="v" style="font-size:12px">${esc(extensionLabel())}</span></div>
      <div class="rrow"><span class="k">LAUNCH MASS</span><span class="v">${fmt(D.wetMass)} kg</span></div>
      <div class="rrow"><span class="k">FINAL MARGINS</span><span class="v">mass ${(D.margins.mass*100).toFixed(0)}% &#183; power ${(D.margins.power*100).toFixed(0)}% &#183; cost ${(D.margins.cost*100).toFixed(0)}%</span></div>
      <div class="rrow"><span class="k">TOTAL DOSE</span><span class="v">${fmt(R.dose)} krad</span></div>
      ${R.overflow>0?`<div class="rrow"><span class="k">SCIENCE DISCARDED</span><span class="v" style="color:var(--amber)">${fmtData(R.overflow)}</span></div>`:""}
      ${R.dead.length?`<div class="rrow"><span class="k">HARDWARE LOST</span><span class="v" style="color:var(--red);font-size:12px">${R.dead.map(i=>byId(INSTR,i).n).join(", ")}</span></div>`:""}
      <div class="gradebox"><div class="g" style="color:${gcol}">${R.grade}</div>
        <div class="hint" style="font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;margin-top:5px">MISSION GRADE</div></div>
      ${R.badges.length?`<div class="badges">${R.badges.map(b=>`<span class="badge">${b}</span>`).join("")}</div>`:""}
      <div class="share"><span>SHARE</span><input id="shareUrl" readonly value="${shareUrl()}"
        style="flex:1;min-width:180px;background:#04060B;border:1px solid var(--hairline);color:var(--dim);font-family:var(--mono);font-size:10.5px;padding:5px 7px">
        <button class="btn ghost" data-act="copy" style="padding:5px 11px">COPY</button></div>
      <div class="row mt">
        <button class="btn ghost" data-act="sources" style="flex:1">MISSION DATA — WHERE NUMBERS COME FROM</button>
      </div>
    </div>

    <div class="panel mt"><h3>COMPARED WITH THE REAL MISSION ${infoTag(SRC.cost,"Real mission figures")} <span class="code">CMP-01</span></h3>
      <div class="pad"><div class="cmp">
        <span class="h">&nbsp;</span><span class="h">YOURS</span><span class="h">${esc(rm.n.toUpperCase())}</span>
        <span class="hint">Launch mass</span><span>${fmt(D.wetMass)} kg</span><span style="color:var(--dim)">${fmt(rm.mass)} kg</span>
        <span class="hint">Cost</span><span>$${fmt(R.cost)}M</span><span style="color:var(--dim)">$${fmt(rm.cost)}M</span>
        <span class="hint">Mission length</span><span>${(R.days/365.25).toFixed(1)} yr</span><span style="color:var(--dim)">${rm.yrs} yr</span>
      </div></div>
    </div>

    <div class="panel mt"><h3>WHAT DECIDED THIS <span class="code">RCA-01</span></h3>
      <div class="pad" style="font-size:12.5px;line-height:1.7">${verdict(D,R,O)}</div></div>

    <div class="panel mt"><h3>CAUSE → EFFECT <span class="code">RCA-02</span></h3>
      <div class="pad" style="font-size:12.5px;line-height:1.7">${chainLines(D,R)}</div></div>

    <div class="panel mt"><h3>MISSION DECISIONS <span class="code">LOG-01</span></h3>
      <div class="pad" style="font-size:12.5px;line-height:1.7">${decisionLines(D,R)}</div></div>

    <div class="panel mt"><h3>EVENTS &amp; FAILURES <span class="code">LOG-02</span></h3>
      <div class="pad" style="font-size:12.5px;line-height:1.7">${eventLines()}</div></div>

    <div class="panel mt"><h3>RESOURCE CONSEQUENCES <span class="code">LOG-03</span></h3>
      <div class="pad" style="font-size:12.5px;line-height:1.7">${resourceLines(D,R)}</div></div>

    <div class="panel mt"><h3>FINAL SPACECRAFT STATE <span class="code">LOG-04</span></h3>
      <div class="pad" style="font-size:12.5px;line-height:1.7">${finalStateLines(D,R)}</div></div>

    <div class="panel mt"><h3>MISSION TIMELINE <span class="code">TL-01</span></h3>
      <div class="pad">
        <div class="row" style="margin-bottom:8px">
          <button class="btn ghost" data-act="rep" data-v="-1">◀ PREV</button>
          <button class="btn ghost" data-act="rep" data-v="1">NEXT ▶</button>
        </div>
        <p class="hint" id="repOut" style="line-height:1.6">Step through the mission day by day — the same log that flew it.</p>
        <div id="tlList" style="max-height:320px;overflow:auto">${timelineHtml()}</div>
      </div></div>

    <div class="panel mt"><h3>FINAL DISPOSITION <span class="code">VIS-01</span></h3>
      <div class="pad">
        <div id="rep3d-mount"><canvas id="rep3d"></canvas></div>
        <p class="hint" style="margin-top:6px">Spacecraft shown with its target in final state — beacon tinted by surviving health. The 2D timeline carries the full history; this is the same end state, not a second simulation.</p>
      </div></div>

    <div class="row mt">
      <button class="btn primary" data-act="rebuild">REBUILD WITH LESSONS LEARNED</button>
      <button class="btn" data-act="next">NEXT MISSION</button>
      <button class="btn ghost" data-act="home">MISSION SELECT</button>
    </div>
  </div></div>`;
}
function launchOutcomeLabel(){
  const o=(S.launch&&S.launch.outcome)||(S.result&&S.result.launch);
  if(!o) return "Nominal (pre-Phase-2 save)";
  const lv=byId(LV,o.lv); const nm=lv?lv.n:o.lv;
  return {nominal:`Nominal — ${nm}`,scrub:`Scrub/delay (+${o.delayMo||2} mo) — ${nm}`,partial:`Partial shortfall — ${nm}`,catastrophic:`Catastrophic failure — ${nm}`}[o.type]||o.type;
}
/* ── Phase 9 learning loop: everything below reads the existing mission log + state.
   No second history, no second simulator. ── */
let replayIdx=-1;
function chronoLog(){ return ((S.ops&&S.ops.log)||[]).slice().reverse(); }
function tlPhase(day){
  const O=S.ops; if(!O) return "";
  if(day<=0) return "LAUNCH";
  if(O.cruise&&day<O.cruise) return "CRUISE";
  if(O.nominalDays&&day>O.nominalDays) return "EXTENDED";
  return "SCIENCE OPS";
}
function timelineHtml(){
  const es=chronoLog();
  if(!es.length) return `<p class="hint">No flight history recorded.</p>`;
  let lastPh="";
  return es.map((l,k)=>{
    const ph=tlPhase(l.day); const hdr=ph!==lastPh?`<div class="hint" style="margin:8px 0 3px;font-size:10.5px;letter-spacing:.14em">— ${ph} —</div>`:""; lastPh=ph;
    return hdr+`<div class="logline ${l.cls||""} tlentry" id="tle-${k}"><span class="d">${dayLabel(l.day)}</span><span>${esc(l.txt)}</span></div>`;
  }).join("");
}
function renderReplay(){
  const es=chronoLog();
  document.querySelectorAll(".tlentry").forEach(e2=>{e2.style.background="";e2.style.outline="";});
  const out=el("repOut"); if(!out) return;
  if(!es.length){ out.textContent="No flight history recorded."; return; }
  replayIdx=clamp(replayIdx,-1,es.length-1);
  if(replayIdx<0){ out.textContent="Step through the mission day by day — the same log that flew it."; return; }
  const cur=el("tle-"+replayIdx);
  if(cur){ cur.style.background="rgba(94,246,160,.08)"; cur.style.outline="1px solid var(--phosphor)"; cur.scrollIntoView({block:"nearest"}); }
  out.textContent=`${dayLabel(es[replayIdx].day)} — ${es[replayIdx].txt}`;
}
function liRow(t){ return `<p style="margin-bottom:8px">• ${t}</p>`; }
function decisionLines(D,R){
  const O=S.ops, out=[];
  out.push(`Designed for ${S.objectives.length} objective(s): ${S.objectives.map(o=>esc(OBJ[o].t)).join("; ")||"—"}.`);
  out.push(`Built ${D.instr.length} instruments on ${esc(D.pw?D.pw.n:"—")} / ${esc(D.cm?D.cm.n:"—")} / ${esc(D.pr&&D.pr.isp?D.pr.n:"no propulsion")}.`);
  if(S.launch&&S.launch.lv){ const lv=byId(LV,S.launch.lv); out.push(`Launched on ${esc(lv?lv.n:S.launch.lv)}${S.launch.set?` at C3 ${(S.launch.c3||0).toFixed(1)}, ${(S.launch.tof||0).toFixed(0)}-day cruise`:""}.`); }
  const LO=(S.launch&&S.launch.outcome);
  if(LO&&LO.type!=="nominal") out.push(`Launch outcome forced a response: ${esc(launchOutcomeLabel())}.`);
  if(O&&O.arrival) out.push(`Arrival choice: ${esc(arrivalLabel())}.`);
  if(O&&O.prox) out.push(`Proximity mode: ${esc(proxLabel())}.`);
  out.push(`DSN allocation: ${esc(dsnTier().n)}.`);
  if(O&&O.aero) out.push(`Capture method: ${esc(aeroLabel())}.`);
  if(O&&O.extend) out.push("Extended the mission at review.");
  const nEv=O?(O.evIdx||0):0;
  out.push(`${nEv} anomaly decision(s) taken during operations — see timeline.`);
  return out.map(liRow).join("");
}
function eventLines(){
  const es=chronoLog();
  const bad=es.filter(l=>l.cls==="bad"), warn=es.filter(l=>l.cls==="warn");
  if(!bad.length&&!warn.length) return liRow("No major failures or warnings — clean flight.");
  return bad.map(l=>`<p style="margin-bottom:8px;color:var(--red)">• ${dayLabel(l.day)} — ${esc(l.txt)}</p>`).join("")
    + warn.map(l=>`<p style="margin-bottom:8px;color:var(--amber)">• ${dayLabel(l.day)} — ${esc(l.txt)}</p>`).join("");
}
function resourceLines(D,R){
  const O=S.ops, out=[];
  if(!O) return liRow("No operations data.");
  if(O.opsCost>0) out.push(`+$${fmt(O.opsCost)}M operations overrun from anomaly response and options.`);
  if(O.propUsed>0) out.push(`${(O.propUsed*100).toFixed(0)}% of remaining propellant consumed after launch.`);
  if(O.powerMult<1) out.push(`Power generation ×${O.powerMult.toFixed(2)} after array damage.`);
  if(O.sciMult<1) out.push(`Science rate ×${O.sciMult.toFixed(2)} after orbit and anomaly effects.`);
  if(O.sciMult>1) out.push(`Science rate ×${O.sciMult.toFixed(2)} from low orbits and surveys.`);
  if(O.doseMult!==1) out.push(`Dose rate ×${O.doseMult.toFixed(2)}.`);
  if(O.overflow>0) out.push(`${fmtData(O.overflow)} of science discarded — downlink could not keep up.`);
  out.push(`Total dose ${fmt(O.dose)} krad.`);
  if(O.dead&&O.dead.size) out.push(`Hardware lost: ${[...O.dead].map(i=>byId(INSTR,i).n).join(", ")}.`);
  else out.push("No hardware lost.");
  if(O.backlog>0) out.push(`${fmtData(O.backlog)} of data still aboard at end of mission — never downlinked.`);
  if(!out.length) out.push("No resource excursions.");
  return out.map(liRow).join("");
}
function finalStateLines(D,R){
  const O=S.ops;
  if(!O) return liRow("No operations data.");
  const live=D.instr.filter(i=>!O.dead.has(i.id));
  return liRow(`Ended ${dayLabel(R.days)} (${(R.days/365.25).toFixed(1)} yr) with ${live.length}/${D.instr.length} instruments live, ${fmtData(O.backlog)} backlog of ${fmtData(O.storageMb)} storage.`)
    + liRow(`Final margins: mass ${(D.margins.mass*100).toFixed(0)}%, power ${(D.margins.power*100).toFixed(0)}%, cost ${(D.margins.cost*100).toFixed(0)}%.`);
}
function chainLines(D,R){
  const O=S.ops, out=[];
  const LO=(S.launch&&S.launch.outcome)||(R&&R.launch);
  if(R&&R.reason==="launch") return liRow("Vehicle loss on ascent → no cruise, no science → mission grade F. Reliability trades directly against launch cost.");
  if(LO&&LO.type==="partial") out.push("Partial launch → +6% propellant, ×0.95 power/science → thinner margins for every later anomaly.");
  if(LO&&LO.type==="scrub") out.push("Scrub → +2 months schedule → same spacecraft, same science plan.");
  const OA=O&&O.arrival;
  if(OA==="tight"||OA==="low") out.push("Aggressive arrival → more propellant spent → higher science rate the whole mission.");
  if(OA==="high") out.push("High safe orbit → propellant banked → weaker science rate the whole mission.");
  if(OA==="survey") out.push("Cautious survey → +20 days ops cost → +8% science the whole mission.");
  if(O&&O.prox&&O.prox!=="balanced") out.push(`Proximity ${O.prox} → ${O.prox==="coverage"?"time, propellant and budget spent for extra coverage":"propellant and budget spent for sharper science"}.`);
  if(dsnTier().id==="reduced") out.push(`Reduced tracking → less downlink → backlog pressure → ${O&&O.overflow>500?"data discarded":"margin held"}.`);
  if(dsnTier().id==="priority") out.push("Priority tracking → backlog cleared → $24M premium on total cost.");
  if(O&&O.aero==="aero") out.push("Aerobraking → propellant saved → +60 days and +$6M ops.");
  if(O&&O.extend) out.push("Extension → ~20% more days of real operations → extra dose and cost for extra science.");
  if(O&&(O.evIdx||0)>0) out.push(`${O.evIdx} anomal${O.evIdx>1?"ies":"y"} → each decision moved cost, time, or capability → final grade reflects the sum.`);
  if(!out.length) out.push("Nominal flight: design margins carried the mission with no major excursions.");
  return out.map(t=>`<p style="margin-bottom:8px">→ ${t}</p>`).join("");
}
function verdict(D,R,O){
  const out=[];
  const LO=(S.launch&&S.launch.outcome)||(R&&R.launch);
  if(R&&R.reason==="launch"){ out.push("The mission was lost on ascent. A higher-reliability vehicle trades cost against exactly this risk."); return out.map(p=>`<p style="margin-bottom:8px">${p}</p>`).join(""); }
  if(LO&&LO.type==="scrub") out.push(`A scrub slipped launch ~${LO.delayMo||2} months, but the spacecraft flew unchanged.`);
  if(LO&&LO.type==="partial") out.push("A partial launch shortfall cost 6% propellant, 5% power/science efficiency, and $10M — margin is what absorbed it.");
  const OA=S.ops&&S.ops.arrival;
  if(OA==="tight"||OA==="low") out.push("You bought a lower science orbit at arrival with propellant — the anomaly margin was thinner afterward.");
  if(OA==="high") out.push("You took the high safe orbit at arrival, banking propellant against later anomalies.");
  if(OA==="survey") out.push("The cautious Bennu survey cost 20 extra days of operations and returned more science.");
  /* Phase-4: touchdown record feeds the report narrative (full grading in Phase 7). */
  if(S.landing){
    const Ld=S.landing, st=byId(MOON_SITES,Ld.site);
    out.push(Ld.degraded
      ? `Touchdown at ${st?st.n:"the site"} was hard (${Ld.slope}° on a ${Ld.margin}° deficit) — the rover drove degraded after a $${Ld.opsM}M recovery, ${Ld.offsetKm} km from the prime target.`
      : `Touchdown at ${st?st.n:"the site"} was nominal (${Ld.slope}°, +${Ld.margin}° margin, ${Ld.offsetKm} km from the prime target).`);
    /* Phase-7: traverse + data verdicts (graded in endMission). */
    if(S.surface){
      const F=S.surface;
      out.push(F.reached
        ? `The rover reached the prime target in ${F.sol} sols and worked it — traverse complete.`
        : `The rover covered ground for ${F.sol} sols but never closed the final ${surfDist(F).toFixed(1)} km to the prime target.`);
      out.push(F.returnedMb>0
        ? `${fmtData(F.returnedMb)} of surface science came home through the relay — the traverse paid for itself.`
        : `No surface data was relayed home — the driving bought nothing but tracks.`);
    }
  }
  const OP=S.ops&&S.ops.prox;
  if(OP==="precision") out.push("Precision proximity work traded propellant and budget for sharper science.");
  if(OP==="coverage") out.push("The extended proximity survey cost time, propellant, and budget — and returned the extra coverage.");
  const DT2=dsnTier();
  if(DT2.id==="reduced"&&R.overflow>500) out.push("Reduced DSN tracking could not keep up — the overflow went to the bit bucket. Priority tracking would have recovered most of it.");
  if(DT2.id==="priority") out.push("Priority DSN tracking kept the backlog clear at a $24M operations premium.");
  const OA2=S.ops&&S.ops.aero;
  if(OA2==="aero") out.push("Aerobraking at Mars saved ~8% propellant at the cost of 60 extra days and $6M of operations.");
  const OX=S.ops;
  if(OX&&OX.extend&&OX.totalDays>(OX.nominalDays||OX.totalDays)){
    const snap=OX.extSnap, extra=OX.totalDays-(OX.nominalDays||OX.totalDays);
    const gained=snap?Math.max(0,(R.ret-snap.ret)*100):0;
    out.push(`Extension was possible because mass and power margins held above 5% at review. ${extra} extra days consumed real power, dose, and downlink for +${gained.toFixed(0)}% science.`);
  }
  if(R.ret>=0.95) out.push("You returned essentially all the science you set out to get.");
  else if(R.ret>=0.6) out.push(`You returned ${(R.ret*100).toFixed(0)}% of the science you promised.`);
  else out.push(`Only ${(R.ret*100).toFixed(0)}% of the promised science came home.`);
  if(R.overflow>500) out.push(`${fmtData(R.overflow)} went to the bit bucket because the downlink could not keep up with the instruments. A higher-gain antenna, or one fewer high-rate instrument, would have recovered most of it.`);
  if(D.margins.power<0.1) out.push("Power margin was thin from the start, so the first anomaly forced you to shed duty cycle.");
  if(D.margins.mass<0.08) out.push("You launched with almost no mass margin. Real programmes hold 20% at this stage precisely because the spacecraft always grows.");
  if(R.dead.length) out.push(`You lost ${R.dead.length} instrument${R.dead.length>1?"s":""} to radiation. Shielding mass is cheap compared with losing an objective outright.`);
  if(R.cost>byId(LEVELS,S.levelId).capM) out.push(`The mission came in $${fmt(R.cost-byId(LEVELS,S.levelId).capM)}M over cap, most of it operations overrun from anomaly response.`);
  if(Math.min(D.margins.mass,D.margins.power,D.margins.cost)>=0.2) out.push("You held healthy margins on every budget, which is why the anomalies cost you so little.");
  return out.map(p=>`<p style="margin-bottom:8px">${p}</p>`).join("");
}

/* ══════════════════════════════════════════════════════════════
   SHARE / SAVE
   ══════════════════════════════════════════════════════════════ */
function shareState(){
  return {l:S.levelId,o:S.objectives,i:S.instruments,p:S.power,c:S.comms,r:S.prop,s:S.shield,a:S.assist,q:S.dsn,t:S.site||null,v:S.rover||null,
          m:S.mode,w:S.launch?{v:S.launch.lv,i:S.launch.i,j:S.launch.j}:null};
}
function shareUrl(){
  try{
    const b=btoa(unescape(encodeURIComponent(JSON.stringify(shareState())))).replace(/=+$/,"");
    /* Phase 14: location.origin is the string "null" on file:// — build from href instead. */
    return location.href.split("#")[0]+"#m="+b;
  }catch(e){return location.href}
}
function loadShare(){
  const h=location.hash;
  if(!h.startsWith("#m="))return false;
  try{
    const d=JSON.parse(decodeURIComponent(escape(atob(h.slice(3)))));
    if(!byId(LEVELS,d.l))return false;
    S.levelId=d.l;S.objectives=d.o||[];S.instruments=d.i||[];
    S.power=d.p;S.comms=d.c;S.prop=d.r;S.shield=d.s||"sh0";S.assist=!!d.a;S.mode=d.m||"cadet";S.dsn=d.q||"standard";S.site=d.t||null;
    S.rover=null;
    if(d.v&&d.l==="l2"){
      const q={mob:d.v.mob,pwr:d.v.pwr,com:d.v.com,pay:d.v.pay};
      if(byId(ROVER_MOB,q.mob)&&byId(ROVER_PWR,q.pwr)&&byId(ROVER_COM,q.com)&&byId(ROVER_PAY,q.pay)) S.rover=q;
    }
    if(d.w){ S.launch={lv:d.w.v,i:d.w.i,j:d.w.j,set:false}; }
    S.screen="build"; S.bstep="payload";
    S.commit=null; S.result=null; S.ops=null; S.phases={levelId:S.levelId,plan:phasePlanFor(S.levelId),done:{build:true}};
    return true;
  }catch(e){return false}
}
function saveProgress(){try{localStorage.setItem("margin.progress",JSON.stringify(S.progress))}catch(e){}}
function loadProgress(){try{const v=localStorage.getItem("margin.progress");if(v)S.progress=JSON.parse(v)}catch(e){}}

/* ══════════════════════════════════════════════════════════════
   LEVEL SETUP + EVENT HANDLING
   ══════════════════════════════════════════════════════════════ */
function startLevel(id){
  const L=byId(LEVELS,id);
  S.levelId=id; S.objectives=(L.force||[]).slice();
  S.instruments=[]; S.launch=null; S.ops=null; S.result=null; S.assist=false; S.pmode="c3"; S.bstep="payload"; S.dsn="standard"; S.aerobrake=false; S.site=null;
  S.commit=null; S.phases={levelId:id,plan:phasePlanFor(id),done:{build:true}};
  S.power=L.power[Math.min(1,L.power.length-1)];
  S.comms=L.comms[Math.min(1,L.comms.length-1)];
  S.prop=L.prop[0]; S.shield="sh0";
  /* Phase-2: L2 preselects the baseline rover kit (player upgrades from here);
     every other mission carries no rover. Old saves (no key) behave as null. */
  S.rover=(id==="l2")?{mob:"rm1",pwr:"rp1",com:"rc1",pay:"ry1"}:null;
  /* Phase-4: touchdown record, written once at LAND resolution. */
  S.landing=null;
  go("brief");
}
function toggle(arr,v){const i=arr.indexOf(v); if(i<0)arr.push(v); else arr.splice(i,1); return arr}

document.addEventListener("click",e=>{
  const t=e.target.closest("[data-act]"); if(!t)return;
  const a=t.dataset.act, id=t.dataset.id;
  const prev = ["build","launch"].includes(S.screen)?railValues(derive(S)):null;

  switch(a){
    case "start": go("select"); Audio_.click(); break;
    case "how": howModal(); break;
    case "home": try{ finishLanding(); }catch(e){} S.ops=null; go("select"); break;
    case "gohome": try{ finishLanding(); }catch(e){} S.ops=null; go("title"); Audio_.click(); break;
    case "level":
      if(window.SelView&&SelView.flyToBrief){ Audio_.click(); SelView.flyToBrief(()=>startLevel(id)); }
      else { startLevel(id); Audio_.click(); }
      break;
    case "sysview": if(window.SelView&&SelView.toggleSystem)SelView.toggleSystem(); Audio_.click(); break;
    case "resetview": if(window.SelView&&SelView.resetView)SelView.resetView(); Audio_.click(); break;
    case "obj": {
      const L=byId(LEVELS,S.levelId);
      if((L.force||[]).includes(id)) break;
      toggle(S.objectives,id); Audio_.click();
      if(S.screen==="brief"){
        const on = S.objectives.includes(id);
        const btn = t.closest ? t.closest('[data-act="obj"]') : t;
        if(btn){
          btn.classList.toggle("sel", on);
          const box = btn.querySelector(".box");
          if(box) box.textContent = on ? "\u2715" : "";
        }
        const codeEl = document.querySelector(".brief h3 .code");
        if(codeEl) codeEl.textContent = `${S.objectives.length} SELECTED`;
        const toBuild = document.querySelector('[data-act="tobuild"]');
        if(toBuild) toBuild.disabled = S.objectives.length < L.req || (L.body==="moon" && !S.site);
        const pad = toBuild ? toBuild.closest(".pad") : null;
        if(pad){
          let hint = pad.querySelector(".hint.mt-s");
          if(S.objectives.length < L.req){
            const rem = L.req - S.objectives.length;
            const msg = `Select ${rem} more objective${rem > 1 ? "s" : ""} to continue.`;
            if(hint) { hint.textContent = msg; hint.style.display = ""; }
            else {
              hint = document.createElement("p");
              hint.className = "hint mt-s";
              hint.textContent = msg;
              pad.appendChild(hint);
            }
          } else if(hint){
            hint.style.display = "none";
          }
        }
        renderHUD();
        break;
      }
      render(); break;
    }
    case "tobuild": S.bstep="payload"; go("build"); break;
    case "landch": resolveLand(+t.dataset.i); Audio_.click(); break;
    case "sord": {
      if(!S.surface) break;
      if(!["drive","dwell","drill","recharge","relay"].includes(t.dataset.v)) break;
      S.surface.orders.mode=t.dataset.v; Audio_.click(); renderOpsSide(); break;
    }
    case "spce": {
      if(!S.surface) break;
      if(!["cautious","standard","push"].includes(t.dataset.v)) break;
      S.surface.orders.pace=t.dataset.v; Audio_.click(); renderOpsSide(); break;
    }
    case "site": {
      const L2=byId(LEVELS,S.levelId);
      if(!L2||L2.body!=="moon") break;
      if(!byId(MOON_SITES,id)) break;
      S.site=id; Audio_.click();
      if(S.screen==="brief"){
        document.querySelectorAll('#siteList [data-act="site"]').forEach(b=>{
          const on=b.dataset.id===id;
          b.classList.toggle("sel",on);
          const box=b.querySelector(".box");
          if(box) box.textContent=on?"\u2715":"";
        });
        const fx=document.getElementById("siteFx");
        if(fx) fx.textContent=byId(MOON_SITES,id).fx;
        const L3=byId(LEVELS,S.levelId);
        const toBuild=document.querySelector('[data-act="tobuild"]');
        if(toBuild) toBuild.disabled=S.objectives.length<L3.req;
      }
      break;
    }
    case "tobrief": go("brief"); break;
    case "bstep": S.bstep=t.dataset.v; Audio_.click(); render(); break;
    case "instr": toggle(S.instruments,id); Audio_.click(); refreshBuild(prev); break;
    case "power": S.power=id; Audio_.click(); refreshBuild(prev); break;
    case "comms": S.comms=id; Audio_.click(); refreshBuild(prev); break;
    case "dsn": S.dsn=id; Audio_.click(); refreshBuild(prev); break;
    case "prop":  S.prop=id;  Audio_.click(); refreshBuild(prev); break;
    case "shield":S.shield=id;Audio_.click(); refreshBuild(prev); break;
    case "rover": {
      if(S.levelId!=="l2") break;
      const k=t.dataset.k;
      if(!["mob","pwr","com","pay"].includes(k)) break;
      const cat=k==="mob"?ROVER_MOB:k==="pwr"?ROVER_PWR:k==="com"?ROVER_COM:ROVER_PAY;
      if(!byId(cat,id)) break;
      if(!S.rover) S.rover={mob:"rm1",pwr:"rp1",com:"rc1",pay:"ry1"};
      S.rover[k]=id; Audio_.click(); refreshBuild(prev); break;
    }
    case "tolaunch": ensurePhases().done.commit=true; if(S.launch&&S.launch.lv)ensurePhases().done.launch=true; go("launch"); break;
    case "lv": S.launch.lv=id; S.launch.outcome=null; S.launch.acked=false; Audio_.click(); renderLV(); renderHUD(); cascade(prev); break;
    case "pmode": S.pmode=t.dataset.v; drawPork();
      document.querySelectorAll('[data-act="pmode"]').forEach(b=>b.classList.toggle("on",b===t)); break;
    case "assist": {
      S.assist = !S.assist;
      if(S.launch){ S.launch.outcome = null; S.launch.acked = false; }
      Audio_.click();
      const btn = t.closest ? t.closest('[data-act="assist"]') : document.querySelector('[data-act="assist"]');
      if(btn){
        btn.classList.toggle("sel", S.assist);
        const box = btn.querySelector(".box");
        if(box) box.textContent = S.assist ? "\u2715" : "";
        const hint = btn.parentNode ? btn.parentNode.querySelector(".hint.mt-s") : null;
        if(hint) hint.style.display = S.assist ? "none" : "";
      }
      renderLV();
      renderHUD();
      cascade(prev);
      break;
    }
    case "fly": liftoff(); break;
    case "spd": {
      /* Phase 4: the descent beat owns the pause state until touchdown resolves. */
      if(S.ops&&S.ops.descentActive) break;
      S.ops.speed=+t.dataset.v; S.ops.running=+t.dataset.v>0;
      if(+t.dataset.v>0)lastSpd=+t.dataset.v;
      document.querySelectorAll(".spd button").forEach(b=>b.classList.toggle("on",b===t));
      break;
    }
    case "cam-mode": {
      if(window.OpsView&&OpsView.setCameraMode){
        OpsView.setCameraMode(t.dataset.v);
        document.querySelectorAll('[data-act="cam-mode"]').forEach(b=>b.classList.toggle("on",b===t));
        Audio_.click();
      }
      break;
    }
    case "toggle-minimap": {
      const mm=el("opsMinimap");
      if(mm){
        mm.classList.toggle("minimized");
        const btn=el("btnMinimapToggle");
        if(btn) btn.textContent = mm.classList.contains("minimized") ? "+" : "−";
        Audio_.click();
      }
      break;
    }
    case "toggle-hud": {
      const vp=el("opsViewport");
      if(vp){
        vp.classList.toggle("hud-hidden");
        t.classList.toggle("on");
        Audio_.click();
      }
      break;
    }
    case "evch": resolveEvent(+t.dataset.i); break;
    case "evack": { const m=el("modal"); delete m.dataset.lock; m.classList.remove("on"); if(S.ops) S.ops.running=true; break; }
    case "extrev": resolveExtRev(+t.dataset.i); break;
    case "rep": replayIdx+=+t.dataset.v; renderReplay(); break;
    case "sources": sourcesModal(); Audio_.click(); break;
    case "arrch": resolveArrival(+t.dataset.i); break;
    case "proxch": resolveProx(+t.dataset.i); break;
    case "aeroch": resolveAero(+t.dataset.i); break;
    case "rebuild": S.ops=null; S.result=null; S.bstep="payload"; go("build"); break;
    case "next": {
      const i=LEVELS.findIndex(l=>l.id===S.levelId);
      if(i<LEVELS.length-1) startLevel(LEVELS[i+1].id); else go("select");
      break;
    }
    case "copy": {
      const inp=el("shareUrl"); inp.select();
      try{navigator.clipboard.writeText(inp.value)}catch(err){document.execCommand("copy")}
      t.textContent="COPIED"; setTimeout(()=>t.textContent="COPY",1400); break;
    }
    case "closeModal": el("modal").classList.remove("on"); break;
    case "devjump": Audio_.click(); showDevJump(); break;
    case "devm": S._devM=id; Audio_.click(); showDevJump(); break;
    case "devgo": {
      const to=t.dataset.to, m=S._devM||"l1";
      el("modal").classList.remove("on"); Audio_.click();
      if(!jumpToScene(to,m,null)) showDevJump();
      break;
    }
  }
});
function refreshBuild(prev){
  const s=el("screen"), sc=s.scrollTop;
  const catEl = s ? s.querySelector(".cat") : null;
  const catScroll = catEl ? catEl.scrollTop : 0;
  if(s) s.classList.add("noanim");
  /* Build-screen option clicks must not flash the 3D models white: full
     innerHTML rebuild destroys the #v3 host, so M3D.stop() tears down and
     re-appends the canvas (context resize + animation restart = white pop).
     Detach the live host, repaint around it, then put it back with its
     canvas untouched. Falls back to a full repaint when no live 3D. */
  try {
    const liveHost = s.querySelector ? (s.querySelector("#v3"+S.bstep)||s.querySelector(".v3host")) : null;
    const liveCanvas = (window.M3D && window.M3D.ok && liveHost) ? liveHost.querySelector("canvas") : null;
    if(liveHost && liveCanvas){
      const parent=liveHost.parentNode, next=liveHost.nextSibling;
      try{ parent.removeChild(liveHost); }catch(e){}
      s.innerHTML=scrBuild(); drawBay(); renderHUD(); cascade(prev);
      const back=s.querySelector("#"+liveHost.id)||s.querySelector(".v3host");
      if(back&&back.parentNode){
        try{ back.parentNode.replaceChild(liveHost,back); }catch(e){ try{back.appendChild(liveCanvas);}catch(e2){} }
      }
      try{ if(window.M3D&&window.M3D.canvas===liveCanvas) window.M3D.host=liveHost; }catch(e){}
      s.scrollTop=sc;
      const newCat = s.querySelector(".cat");
      if(newCat) newCat.scrollTop = catScroll;
      if(window.M3D)M3D.sync();
      return;
    }
  }catch(e){}
  s.innerHTML=scrBuild(); drawBay(); renderHUD(); cascade(prev); s.scrollTop=sc;
  const newCat2 = s ? s.querySelector(".cat") : null;
  if(newCat2) newCat2.scrollTop = catScroll;
  if(window.M3D)M3D.sync();
}

/* rail breakdown drawer */
document.addEventListener("click",e=>{
  const r=e.target.closest(".rail"); if(!r)return;
  const k=r.dataset.rail, D=derive(S), L=byId(LEVELS,S.levelId);
  const rows=[];
  if(k==="mass"){
    D.instr.forEach(i=>rows.push([i.n,i.m+" kg"]));
    if(D.pw)rows.push([D.pw.n,D.pw.m+" kg"]); if(D.cm)rows.push([D.cm.n,D.cm.m+" kg"]);
    if(D.pr)rows.push([D.pr.n,D.pr.m+" kg"]);
    if(D.sh&&D.sh.m)rows.push([D.sh.n,D.sh.m+" kg"]);
    rows.push(["Bus, structure, thermal, harness",fmt(D.busDry)+" kg"]);
    rows.push(["Propellant (rocket equation)",fmt(D.propMass)+" kg"]);
  }else if(k==="power"){
    rows.push(["Bus housekeeping",fmt(D.busLoad)+" W"]);
    D.instr.forEach(i=>rows.push([i.n,i.w+" W"]));
    if(D.cm)rows.push([D.cm.n+" (transmit)",D.cm.w+" W"]);
    rows.push(["Generation at end of life",fmt(D.genEOL)+" W"]);
  }else if(k==="data"){
    D.instr.forEach(i=>i.d>0&&rows.push([i.n,fmtData(i.d*DATA_DUTY*DAY)+"/day"]));
    rows.push(["Downlink capacity",fmtData(D.downMbPerDay)+"/day"]);
    rows.push(["Link: "+(D.cm?D.cm.n:"\u2014")+" at "+D.linkAu.toFixed(2)+" AU",
               D.rate>1e6?(D.rate/1e6).toFixed(2)+" Mb/s":(D.rate/1e3).toFixed(2)+" kb/s"]);
  }else if(k==="cost"){
    rows.push(["Instruments","$"+fmt(D.iCost)+"M"]);
    rows.push(["Power / comms / propulsion","$"+fmt(D.partsCost-D.iCost)+"M"]);
    rows.push(["Spacecraft bus","$"+fmt(D.busCost)+"M"]);
    rows.push(["Integration and test ("+fmt(D.months)+" mo)","$"+fmt(D.integCost)+"M"]);
    rows.push(["Launch service","$"+fmt(D.lvCost)+"M"]);
    rows.push(["Operations ("+D.years+" yr)","$"+fmt(D.opsCost)+"M"]);
  }else{
    rows.push(["Base development","34 mo"]);
    rows.push(["Instrument integration","+"+(1.6*D.instr.length).toFixed(1)+" mo"]);
    if(D.pw&&D.pw.sch)rows.push([D.pw.n+" review and approval","+"+D.pw.sch+" mo"]);
    const low=D.instr.filter(i=>i.trl<8);
    if(low.length)rows.push([low.length+" instrument(s) below TRL 8","+"+low.length*4+" mo"]);
  }
  const sorted=k==="mass"||k==="power"?rows:rows;
  el("mbox").innerHTML=`<h3>${RAILDEF.find(x=>x.k===k).nm} BREAKDOWN</h3><div class="mb">
    <div style="font-family:var(--mono);font-size:12px">
    ${sorted.map(x=>`<div class="spread" style="padding:4px 0;border-bottom:1px solid rgba(28,36,51,.5)">
      <span style="color:var(--dim)">${esc(x[0])}</span><span>${esc(x[1])}</span></div>`).join("")}</div>
    <button class="btn ghost mt" data-act="closeModal" style="width:100%">CLOSE</button></div>`;
  el("modal").classList.add("on");
});
el("modal").addEventListener("click",e=>{
  if(e.target.id!=="modal") return;
  if(el("modal").dataset.lock) return;   // liftoff countdown is not dismissible
  if(el("mbox").querySelector(".choice")) return;   // anomaly dialogs require a decision
  el("modal").classList.remove("on");
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!el("modal").dataset.lock&&!el("mbox").querySelector(".choice")) el("modal").classList.remove("on");
  const tag=(e.target&&(e.target.tagName||"")).toLowerCase();
  if(tag==="input"||tag==="textarea"||e.target.isContentEditable) return;
  if((e.key==="m"||e.key==="M")&&!e.ctrlKey&&!e.metaKey){ el("btnSound").click(); }
  if(e.key===" "&&S.screen==="ops"&&S.ops&&!S.ops.ended&&!el("modal").classList.contains("on")){
    e.preventDefault();
    const v=S.ops.running?"0":String(lastSpd);
    const btn=document.querySelector('[data-act="spd"][data-v="'+v+'"]');
    if(btn) btn.click();
  }
});

/* ── Phase 2 launch reliability: single deterministic roll from LV rel + existing mulberry32.
   Failure mass = 1-rel; split deterministically: scrub 35% / partial 30% / catastrophic 35% of failures. */
/* ── P2.1 launch REFERENCE data (NOT derive(S) engineering truth) ──
   MOVED from js/launch-view.js LV_PROFILES (renderer must consume, never own).
   Classification (see QA/LAUNCH_P2P1_CORRECTION_QA.md):
   - derive(S) = engineering truth (mass/dv/power/data/cost/capability). It neither
     consumes nor returns anything below; routing time-history through derive(S)
     was judged architectural overreach (P2.1 decision: reference-data layer stays
     a sibling of derive, not inside it).
   - FLIGHT_KEYS = REFERENCE / VERIFIED-AT-KEYS (documented launch data, not a live
     6-DOF simulation). Event METs (booster/meco/fairing/las/s2co/maxQMet/twr/endMet):
     VERIFIED against NASA/manufacturer sources (LAUNCH_REALISM_TRACKING.md §8).
   - flightStateAt inter-key alt/vel = ESTIMATE (piecewise-linear, honestly marked).
   - flightDownrangeAt = ESTIMATE (no published per-vehicle downrange exists (§8c);
     horizontal remainder of the reference speed: vh=sqrt(max(0,v²-vv²)), vv=dAlt/dt,
     integrated at 1 s steps once at load — documented gravity-turn consistency,
     not a trajectory solver, never NASA truth). Bounded per-vehicle ends
     (F9 ~2100, SLS ~2000, 551 ~3260, VC ~2490, NG ~3380, 401 ~4040 km).
   Pure functions of (lvId, met); zero per-frame allocation (precomputed
   tables + lerp); offline; WebGL-independent (2D/3D/?no3d share them). */
const FLIGHT_KEYS = {
  f9:  { endMet: 540, twr: 1.41, maxQMet: 65,
    booster: null, meco: [150, 162], fairing: [175, 200], las: null, srbStagger: 0,
    keys: [[0,0,0],[65,12,450],[155,70,2150],[200,110,2700],[350,180,5500],[525,205,7800],[540,207,7800]] },
  fhr: { endMet: 540, twr: 1.60, maxQMet: 69,
    booster: [150, 162], meco: [211, 224], fairing: [247, 262], las: null, srbStagger: 0,
    keys: [[0,0,0],[69,12,450],[154,62,2000],[222,95,3000],[300,150,5000],[528,205,7800],[540,207,7800]] },
  fhe: { endMet: 540, twr: 1.60, maxQMet: 69,
    booster: [150, 162], meco: [211, 224], fairing: [247, 262], las: null, srbStagger: 0,
    keys: [[0,0,0],[69,12,450],[154,62,2000],[222,95,3000],[300,150,5000],[528,205,7800],[540,207,7800]] },
  av401:{ endMet: 800, twr: 1.17, maxQMet: 87, seco: 'EARTH-ESCAPE BURN COMPLETE (C3 8.2 CLASS)',
    booster: null, meco: [244, 260], fairing: [268, 284], las: null, srbStagger: 0,
    keys: [[0,0,0],[87,13,400],[244,90,3000],[268,115,3400],[500,200,6500],[796,300,10500],[800,302,10500]] },
  av551:{ endMet: 700, twr: 2.00, maxQMet: 46, seco: 'TRANSFER-ORBIT BURN COMPLETE',
    booster: [106, 122], meco: [266, 280], fairing: [203, 222], las: null, srbStagger: 1.5,
    keys: [[0,0,0],[46,10,500],[106,35,1200],[203,80,2500],[266,110,3500],[450,200,6500],[700,300,9000]] },
  vc4: { endMet: 660, twr: 1.50, maxQMet: 60,
    booster: [100, 115], meco: [300, 315], fairing: [330, 358], las: null, srbStagger: 0,
    keys: [[0,0,0],[60,12,450],[100,30,1000],[300,110,3200],[450,180,5500],[660,200,7800]] },
  vc6: { endMet: 660, twr: 1.70, maxQMet: 50,
    booster: [100, 115], meco: [280, 295], fairing: [320, 348], las: null, srbStagger: 0,
    keys: [[0,0,0],[50,11,480],[100,32,1100],[280,105,3200],[450,180,5500],[660,200,7800]] },
  ng:  { endMet: 780, twr: 1.40, maxQMet: 70,
    booster: null, meco: [190, 205], fairing: [220, 246], las: null, srbStagger: 0,
    keys: [[0,0,0],[70,13,450],[190,80,2400],[240,110,3000],[450,180,5500],[780,200,7800]] },
  sls: { endMet: 540, twr: 1.53, maxQMet: 70,
    booster: [132, 150], meco: [483, 497], fairing: [191, 207], las: [196, 212], srbStagger: 0,
    keys: [[0,0,0],[70,13,400],[132,45,1300],[196,90,2200],[300,120,4000],[483,160,7800],[540,165,7800]] },
  saturn5:{ endMet: 700, twr: 1.20, maxQMet: 75,
    booster: null, meco: [150, 165], s2co: [545, 560], fairing: null, las: [180, 196], srbStagger: 0,
    keys: [[0,0,0],[75,13,400],[150,68,2000],[330,120,5000],[545,190,7400],[700,185,7800]] }
};
function flightKeysFor(lvId){ return FLIGHT_KEYS[lvId] || FLIGHT_KEYS.f9; }
/* ── Pad-phase vertical ascent (ESTIMATE, expert method — plans_notes/LAUNCH_TIMING_BRIEF.md).
   Constant-mass-flow analytic under TWR, closed against the REFERENCE Max-Q key
   (closure sh/sv ≈ 1; warn band 0.85–1.15). Keys/events untouched; only the
   interp below maxQMet changes. Reuses G0 (§371). Feeds flightStateAt and, via
   it, the flightDownrangeAt integral (no separate rebuild needed). */
const PAD_ISP = 280; // s sea-level, ESTIMATE (<1% effect on tower-clear)
const PAD_HOLD_S = { f9:.5, fhr:.5, fhe:.5, av401:.4, av551:.4, vc4:.4, vc6:.4, ng:.4, sls:.3, saturn5:.3 }; // ESTIMATE
const PAD_REAL_MARGIN_S = 1.5; // wall-map real-time span past display tower-top
const PAD_LIFT_U = 16; // PRESENTATION: true-scale pad region height (display units)
const PAD_M_PER_UNIT = 9.95; // mirrors launch-view SITE_VK (fixed site truth, 1 u = 9.95 m)
const TOWER_U = 10.3; // display tower-top above nozzle (~103 m, NASA ML on slab)
const _pad = { h: 0, v: 0 }, PAD_CACHE = {};
function padRaw(P, tau){
  if(!(tau > 0)){ _pad.h = 0; _pad.v = 0; return; }
  const u = 1 - P.k * tau, lu = Math.log(u);
  _pad.v = G0 * (-PAD_ISP * lu - tau);
  _pad.h = G0 * (PAD_ISP * PAD_ISP / P.twr * (u * lu - u + 1) - 0.5 * tau * tau);
}
/* PRESENTATION: true 1 u = 9.95 m at the pad, original 0.55 curve far field.
   Monotonic for PAD_LIFT_U < 100; exact 0 at h=0, exact 100 at h=Hm. Housed
   here (not js/) so padParams' tower solve and the renderer share one formula. */
function riseOfAlt(hm, Hm){
  if(!(hm > 0)) return 0;
  const rho = Math.pow(Math.min(hm / Hm, 1), 0.55);
  const lam = PAD_LIFT_U * PAD_M_PER_UNIT;
  return 100 * rho + PAD_LIFT_U * (1 - Math.exp(-hm / lam)) * (1 - rho);
}
function padParams(lvId){
  let P = PAD_CACHE[lvId]; if(P) return P;
  const K = flightKeysFor(lvId);
  P = PAD_CACHE[lvId] = { hold: (PAD_HOLD_S[lvId] != null ? PAD_HOLD_S[lvId] : .5),
    twr: K.twr, k: K.twr / PAD_ISP, tQ: K.maxQMet, sh: 1, sv: 1, Hm: 0, tauTower: 0, w1: 0 };
  const q = rawKeyState(lvId, K.maxQMet);
  P.Hm = rawKeyState(lvId, K.endMet).alt * 1000;
  padRaw(P, P.tQ - P.hold);
  P.sh = q.alt * 1000 / _pad.h; P.sv = q.vel / _pad.v;
  if(!(P.sh >= .85 && P.sh <= 1.15 && P.sv >= .85 && P.sv <= 1.15)){
    try{ console.warn('pad closure out of band', lvId, +P.sh.toFixed(3), +P.sv.toFixed(3)); }catch(e){}
  }
  let lo = 0, hi = 40;
  for(let i = 0; i < 40; i++){
    const m = (lo + hi) / 2; padRaw(P, m);
    if(riseOfAlt(_pad.h * P.sh, P.Hm) < TOWER_U) lo = m; else hi = m;
  }
  P.tauTower = hi;
  P.w1 = P.hold + P.tauTower + PAD_REAL_MARGIN_S;
  return P;
}
/* Raw REFERENCE key lerp (verbatim prior flightStateAt body — the un-overridden path). */
function rawKeyState(lvId, met){
  const keys = flightKeysFor(lvId).keys;
  if(!isFinite(met)) met = 0;
  const m = Math.max(0, Math.min(met, flightKeysFor(lvId).endMet));
  if(m <= keys[0][0]) return { alt: keys[0][1], vel: keys[0][2] };
  for(let i = 1; i < keys.length; i++){
    if(m <= keys[i][0]){
      const a = keys[i-1], b = keys[i];
      const k = (m - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return { alt: a[1] + (b[1] - a[1]) * k, vel: a[2] + (b[2] - a[2]) * k };
    }
  }
  const l = keys[keys.length-1];
  return { alt: l[1], vel: l[2] };
}
function flightStateAt(lvId, met){
  const P = padParams(lvId);
  if(met < P.tQ){
    padRaw(P, met - P.hold);
    return { alt: _pad.h * P.sh / 1000, vel: _pad.v * P.sv };
  }
  return rawKeyState(lvId, met);
}
/* Downrange tables: cumulative horizontal-remainder integral at 1 s steps,
   built once per vehicle at load (deterministic, ~7k floats total). */
const FLIGHT_DR = {};
function flightDownrangeBuild(){
  try{
    for(const lvId in FLIGHT_KEYS){
      const P = FLIGHT_KEYS[lvId], n = Math.max(1, Math.round(P.endMet));
      const cum = new Float32Array(n + 1);
      let c = 0;
      for(let s = 0; s < n; s++){
        const a0 = flightStateAt(lvId, s), a1 = flightStateAt(lvId, s + 1);
        const vv = (a1.alt - a0.alt) * 1000; // m/s vertical
        const v = (a0.vel + a1.vel) / 2;
        c += Math.sqrt(Math.max(0, v * v - vv * vv)) / 1000; // km
        cum[s + 1] = c;
      }
      FLIGHT_DR[lvId] = cum;
    }
  }catch(e){}
}
function flightDownrangeAt(lvId, met){
  try{
    if(!isFinite(met)) return 0;
    const P = flightKeysFor(lvId);
    let cum = FLIGHT_DR[lvId];
    if(!cum){ flightDownrangeBuild(); cum = FLIGHT_DR[lvId]; }
    if(!cum) return 0;
    const m = Math.max(0, Math.min(met, P.endMet));
    const i0 = Math.min(cum.length - 2, Math.floor(m)), fr = m - i0;
    return cum[i0] * (1 - fr) + cum[i0 + 1] * fr;
  }catch(e){ return 0; }
}
function launchRoll(){
  const li=(S.launch&&S.launch.i||0), lj=(S.launch&&S.launch.j||0);
  let h=0; const s=String(S.levelId||"")+":"+String(S.launch&&S.launch.lv||"");
  for(let k=0;k<s.length;k++) h=(h*31+s.charCodeAt(k))|0;
  const rnd=mulberry32((S.seed^h^(li*131+lj*17))|0);
  return [rnd(),rnd()];
}
function resolveLaunchOutcome(){
  if(S.launch&&S.launch.outcome) return S.launch.outcome;
  const lv=byId(LV,S.launch.lv), rel=lv?lv.rel:0.95;
  const [r1,r2]=launchRoll();
  let type="nominal";
  if(r1>=rel){ type = r2<0.35?"scrub":r2<0.65?"partial":"catastrophic"; }
  const out={type,rel:rel,roll:+r1.toFixed(4),lv:S.launch.lv,delayMo:type==="scrub"?2:0};
  S.launch.outcome=out; ensurePhases().done.launch=true;
  return out;
}
function launchOutcomeText(out){
  const lv=byId(LV,out.lv);
  const base="Vehicle reliability "+(out.rel*100).toFixed(0)+"% ("+(lv?lv.n:"")+")";
  if(out.type==="nominal") return {h:"LAUNCH NOMINAL",w:"What happened? Clean ascent to the planned trajectory.",y:"Why it matters? Full propellant, power, and schedule preserved.",n:"What happens next? Cruise operations begin.",base};
  if(out.type==="scrub") return {h:"LAUNCH SCRUB — RANGE HOLD",w:"What happened? Countdown held; liftoff slipped ~2 months.",y:"Why it matters? Spacecraft is safe. Schedule margin absorbs a 2-month slip.",n:"What happens next? Same vehicle flies on the next window — no duplicate launch.",base};
  if(out.type==="partial") return {h:"PARTIAL LAUNCH SHORTFALL",w:"What happened? Upper stage underperformed; spacecraft compensates.",y:"Why it matters? 6% propellant spent, 5% power and science efficiency lost, +$10M recovery.",n:"What happens next? Degraded but flyable mission continues.",base};
  return {h:"CATASTROPHIC LAUNCH FAILURE",w:"What happened? Vehicle lost during ascent; spacecraft did not reach orbit.",y:"Why it matters? No cruise, no science — reliability is a real constraint.",n:"What happens next? Mishap report explains the loss.",base};
}
function showLaunchOutcome(out,fn){
  const t=launchOutcomeText(out);
  const m=el("modal"), b=el("mbox");
  b.innerHTML=`<h3>&#9650; ${esc(t.h)}</h3><div class="mb"><p><b>What happened?</b> ${esc(t.w.replace("What happened? ",""))}</p><p class="mt-s"><b>Why it matters?</b> ${esc(t.y.replace("Why it matters? ",""))}</p><p class="mt-s"><b>What happens next?</b> ${esc(t.n.replace("What happens next? ",""))}</p><p class="hint mt-s">${esc(t.base)}</p><button class="btn primary mt" id="launchAck" style="width:100%">CONTINUE</button></div>`;
  m.classList.add("on");
  el("launchAck").addEventListener("click",()=>{ m.classList.remove("on"); fn(); },{once:true});
}
function failLaunchCatastrophic(out){
  ensurePhases().done.commit=true; ensurePhases().done.launch=true; ensurePhases().done.ascent=true;
  const D=derive(S), L=byId(LEVELS,S.levelId);
  S.ops={day:0,totalDays:Math.round(L.years*365.25),cruise:0,levelId:S.levelId,log:[],delivered:{},backlog:0,storageMb:L.storeMb||160000,dose:0,opsCost:0,lost:0,propUsed:0,powerMult:1,sciMult:1,doseMult:1,dsnFactor:dsnFactorOf(),blackout:0,dsnCut:0,dsnCutSoft:0,dead:new Set(),overflow:0,collectDuringBlackout:false,extend:false,ended:true,
  /* Phase 15 hardening: full OPS shape so post-failure paints (timeline/HUD/resize) cannot throw. */
  events:[],evIdx:0,nominalDays:Math.round(L.years*365.25),eomReviewed:true,extDeclined:false,extSnap:null};
  S.ops.log.unshift({day:0,txt:`Launch failure on ${byId(LV,out.lv).n}. Vehicle lost during ascent.`,cls:"bad"});
  S.result={ret:0,cost:D.cost,grade:"F",score:0,badges:["LAUNCH FAILURE"],reason:"launch",days:0,overflow:0,dose:0,dead:[],launch:out};
  S.progress[S.levelId]=S.progress[S.levelId]||{grade:"F",ret:0};
  saveProgress(); Audio_.bad(); go("report");
}
/* ── liftoff beat: resolves launch reliability once, then ascent cinematic, then operations. ── */
function liftoff(){
  Audio_.go();
  const lv = (S.launch && S.launch.lv) ? byId(LV, S.launch.lv) : null;
  const lvName = lv ? lv.n : "Launch vehicle";
  const lvId = lv ? lv.id : "";
  // Full-screen launch overlay hosting the per-vehicle ascent illustration (js/launch-view.js).
  // Falls back to the 3-2-1 beat if WebGL/import is unavailable.
  const ov = document.createElement("div");
  ov.id = "launchOverlay";
  ov.innerHTML =
    '<div class="launch3d-head"><span class="kicker">GROUND PHASE — KENNEDY ASCENT (ILLUSTRATED)</span>' +
    '<span class="hint">' + esc(lvName) + ' &mdash; ' + esc(yrToDate(S.launch.tDep)) +
    ' &middot; vehicle shown: dimensionally-true illustration (verified heights/diameters/boosters)</span></div>' +
    '<div class="launch3d-body" id="launch3dBody"></div>';
  document.body.appendChild(ov);
  const cleanup = () => { try { ov.parentElement.removeChild(ov); } catch (e) {} };
  /* Asset warm pass: preload ops/surface/descent assets through the session
     caches during the countdown+ascent window so nothing pops mid-cinematic. */
  try { import("./js/preload.js").then(m => { try { m.warmForLaunch(); } catch (e) {} }).catch(()=>{}); } catch (e) {}
  /* Resolve once, before any cinematic. Reload/redraw reuses S.launch.outcome. */
  const out0 = resolveLaunchOutcome();
  if(out0.type==="catastrophic"){ cleanup(); failLaunchCatastrophic(out0); return; }
  const ackAndEnterOps = () => {
    S.launch.acked=true;
    ensurePhases().done.commit=true; ensurePhases().done.launch=true;
    if(enterPhaseOnce("ascent")||!S.ops){ S.ops = null; go("ops"); }
  };
  const maybeShowOutcome = () => {
    if((out0.type==="scrub"||out0.type==="partial")&&!S.launch.acked){ showLaunchOutcome(out0,ackAndEnterOps); return; }
    ackAndEnterOps();
  };
  const proceed = () => {
    cleanup();
    const m = el("modal");
    try { delete m.dataset.lock; m.classList.remove("on"); } catch (e) {}
    /* COMMIT→LAUNCH→ASCENT recorded once; stale double-callbacks cannot re-enter OPS. */
    maybeShowOutcome();
  };
  const fallbackCountdown = () => {
    cleanup();
    const m = el("modal"), b = el("mbox");
    // Workstream A parity: 2D fallback shows the same T-/L-/ALS beats as 3D.
    const seq = [
      { big: "T-10:00", sub: "TERMINAL COUNT — GLS (L-11:30, compressed)" },
      { big: "T-04:00", sub: "BUILT-IN HOLD — T- paused, L- running" },
      { big: "T-00:30", sub: "ALS HANDOFF — onboard control" },
      { big: "3", sub: "ENGINE START" },
      { big: "2", sub: "THRUST BUILDUP" },
      { big: "1", sub: "COMMIT" },
      { big: "LIFTOFF", sub: "T+00:00 — MET starts" }
    ];
    b.innerHTML = '<h3>LAUNCH COMMIT</h3><div class="mb" style="text-align:center;padding:26px 10px">' +
      '<div id="tcount" style="font-family:var(--disp);font-weight:700;font-size:44px;letter-spacing:.1em">T-10:00</div>' +
      '<div id="tsub" class="hint mt-s">TERMINAL COUNT — GLS</div>' +
      '<div class="hint mt-s">' + esc(lvName) + ' &mdash; ' + esc(yrToDate(S.launch.tDep)) + '</div></div>';
    m.classList.add("on"); m.dataset.lock = "1";
    seq.forEach((s, k) => {
      setTimeout(() => {
        const t = el("tcount"); if (!t || !m.classList.contains("on")) return;
        t.textContent = s.big;
        const sub = el("tsub"); if (sub) sub.textContent = s.sub;
        if (s.big === "LIFTOFF") { Audio_.go(); t.style.color = "var(--phosphor)"; }
        else Audio_.click();
        if (k === seq.length - 1) setTimeout(() => { delete m.dataset.lock; m.classList.remove("on"); maybeShowOutcome(); }, 650);
      }, k * 450);
    });
  };
  try {
    import("./js/launch-view.js").then((mod) => {
      const LV3 = (mod && mod.LaunchView) || window.LaunchView;
      if (!LV3 || !LV3.start) { fallbackCountdown(); return; }
      const body = ov.querySelector("#launch3dBody");
      const ok = LV3.start(body, { vehicleName: lvName, lvId: lvId, onDone: proceed,
        tDep: (S.launch && isFinite(S.launch.tDep)) ? S.launch.tDep : 2029.0 }); // solar hook date only, no sim change
      if (!ok) fallbackCountdown();
    }).catch(() => fallbackCountdown());
  } catch (e) { fallbackCountdown(); }
}

function howModal(){
  el("mbox").innerHTML=`<h3>HOW IT WORKS</h3><div class="mb" style="font-size:13px;line-height:1.7">
    <p><b>1. Formulate.</b> Pick science objectives. Each one names what it needs measured.</p>
    <p class="mt-s"><b>2. Build.</b> Add instruments, a power source, an antenna and a propulsion system.
    Nothing you add touches only one budget &mdash; watch the five rails at the bottom of the screen.</p>
    <p class="mt-s"><b>3. Launch.</b> Choose a departure date and flight time from a porkchop plot solved
    live in your browser from real orbital elements, then pick a vehicle whose performance curve can lift
    what you built to that energy.</p>
    <p class="mt-s"><b>4. Operate.</b> Fly it. Anomalies arrive. Margin is what lets you survive them.</p>
    <p class="mt-s" style="color:var(--dim)">Every number carries an
    <span class="info" style="cursor:default">i</span> &mdash; open it to see the NASA source and exactly
    what was simplified.</p>
    <p class="mt-s" style="color:var(--dim)">Shortcuts: <b>Space</b> pauses operations,
    <b>M</b> toggles sound.</p>
    <p class="mt-s"><button class="btn ghost" data-act="sources" style="width:100%">MISSION DATA — WHERE NUMBERS COME FROM</button></p>
    <button class="btn ghost mt" data-act="closeModal" style="width:100%">CLOSE</button></div>`;
  el("modal").classList.add("on");
}

/* ── top bar buttons ── */
el("btnSound").addEventListener("click",function(){
  Audio_.init(); Audio_.on=!Audio_.on; this.setAttribute("aria-pressed",Audio_.on);
  this.textContent=Audio_.on?"SOUND ON":"SOUND"; if(Audio_.on)Audio_.click();
  try{localStorage.setItem("margin.sound",Audio_.on?"1":"0")}catch(e){}
});
el("btnMode").addEventListener("click",function(){
  S.mode=S.mode==="cadet"?"fd":"cadet";
  this.textContent=S.mode==="cadet"?"CADET":"FLIGHT DIR";
  render();
});
el("btnHome").addEventListener("click",()=>{S.ops=null;go(S.levelId?"select":"title")});

/* ── dev scene shortcuts (?s=) for testing after hard refreshes.
   Usage: index.html?s=launch / ?s=ascent&lv=sls&m=l3 / ?s=ops&m=l2&no3d…
   Stateless screens jump directly; stateful ones seed a demo mission
   (startLevel defaults + porkchop-best trajectory + first-listed LV) without
   touching save/share behavior. Unknown values fall through to normal boot. */
function seedDemoLaunch(lv){
  const L=byId(LEVELS,S.levelId);
  if(!L) return false;
  if(!S.launch) S.launch={lv:null,c3:0,vinf:0,tof:0,tDep:0,i:0,j:0};
  if(L.mode==="pork"){
    const g=porkchop(L.id,L.body,L.depart,L.tofRange,40,30);
    const b=g.best||{i:20,j:15};
    const p=porkAt(g,b.i,b.j);
    if(!isFinite(p.c3)) return false;
    S.launch.i=p.i;S.launch.j=p.j;S.launch.c3=p.c3;S.launch.vinf=p.vinf;
    S.launch.tof=p.tof;S.launch.tDep=p.tDep;S.launch.set=true;
  }
  else if(L.mode==="fixedC3"){ S.launch.c3=L.c3;S.launch.vinf=0;S.launch.tof=L.tof;S.launch.tDep=2029.2;S.launch.set=true; }
  else { S.launch.c3=0;S.launch.vinf=0;S.launch.tof=0;S.launch.tDep=2029.0;S.launch.set=true; }
  S.launch.lv=(lv&&byId(LV,lv))?lv:(L.lvs&&L.lvs[0])||"f9";
  S.launch.outcome=null;S.launch.acked=false;
  return true;
}
function jumpToScene(s,m,lv){
  if(s==="title"||s==="select"){ S.ops=null; go(s); return true; }
  m=(m&&byId(LEVELS,m))?m:"l1";
  if(s==="brief"){ S.ops=null; startLevel(m); return true; }
  if(s==="build"){ S.ops=null; startLevel(m); S.bstep="payload"; go("build"); return true; }
  if(s==="launch"){ S.ops=null; startLevel(m); if(!seedDemoLaunch(lv))return false; go("launch"); return true; }
  if(s==="ascent"){ S.ops=null; startLevel(m); if(!seedDemoLaunch(lv))return false; go("launch"); liftoff(); return true; }
  if(s==="ops"){ S.ops=null; startLevel(m); if(!seedDemoLaunch(lv))return false; ensurePhases().done.launch=true; go("ops"); return true; }
  return false;
}
function showDevJump(){
  const m=S._devM||"l1";
  const missions=["l1","l2","l3","l4","l5","sbx"].map(id=>
    `<button class="btn ${id===m?"primary":"ghost"}" data-act="devm" data-id="${id}" style="flex:1">${id.toUpperCase()}</button>`).join("");
  const dests=[["select","SELECT"],["brief","BRIEF"],["build","BUILD"],["launch","LAUNCH"],["ascent","ASCENT"],["ops","OPS"]].map(d=>
    `<button class="btn ghost" data-act="devgo" data-to="${d[0]}" style="flex:1">${d[1]}</button>`).join("");
  el("mbox").innerHTML=`<h3>DEV JUMP <span class="code">TEST ONLY</span></h3><div class="mb" style="font-size:12px;line-height:1.6">
    <p class="hint">Mission</p><div style="display:flex;gap:6px;margin:4px 0 10px">${missions}</div>
    <p class="hint">Jump to <span class="code">${m.toUpperCase()}</span> (demo-seeded, first-listed LV)</p><div style="display:flex;gap:6px;flex-wrap:wrap">${dests}</div>
    <p class="hint mt-s">Same as URL shortcuts: <span class="code">?s=launch&m=${m}</span> — composes with <span class="code">&lv= &no3d</span>.</p>
    <button class="btn ghost mt" data-act="closeModal" style="width:100%">CLOSE</button></div>`;
  el("modal").classList.add("on");
}
function applySceneShortcut(){
  let q=null;
  try{ q=new URLSearchParams(location.search); }catch(e){ return false; }
  const s=q.get("s");
  if(!s) return false;
  const m=(q.get("m")&&byId(LEVELS,q.get("m")))?q.get("m"):"l1";
  return jumpToScene(s,m,q.get("lv")||null);
}

/* ── boot ── */
loadProgress();
el("telemRun").innerHTML=telemText();
if(!loadShare()) S.screen="title";
try{ if(localStorage.getItem("margin.sound")==="1"){Audio_.init();Audio_.on=true;
  el("btnSound").textContent="SOUND ON";el("btnSound").setAttribute("aria-pressed","true");} }catch(e){}
if(!applySceneShortcut()) render();
addEventListener("resize",()=>{ if(S.screen==="build")drawBay(); if(S.screen==="launch"&&PORK)drawPork();
  if(S.screen==="ops"){drawOrbit();drawTL();} });

/* ── 3D presentation (Phase 3B): progressive enhancement, silent 2D fallback.
   Module loads only over http(s) with WebGL; file:// and ?no3d stay Canvas2D. */
(function(){
  try{
    if(location.protocol.indexOf("http")!==0) return;
    if(/[?&]no3d/.test(location.search)) return;
    const t=document.createElement("canvas");
    if(!(t.getContext("webgl2")||t.getContext("webgl"))) return;
    import("./js/view3d.js").catch(function(){});
    import("./js/title-earth.js").catch(function(){});
    import("./js/select-viewer.js").catch(function(){});
    import("./js/brief-view.js").catch(function(){});
    import("./js/ops-view.js").catch(function(err){ console.error("[ops-view] import failed:", err); });
  }catch(e){}
})();
