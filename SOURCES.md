# MARGIN — Source Usage Tracking

> Single register of every external API, dataset, model, texture, and reference
> used in this project. Required for NASA attribution.
> Rule: **real data only.** Anything unverified stays in §6 and is never
> presented as NASA data. Rule: **vendor static, never hot-link** — the game
> runs offline for judging.

Last audited: 2026-09-22. Auditor: source grep over `game.js`, `js/`, `assets/`,
`models/`, `tools/`, `plans_notes/`, `QA/`.

## 1. Mission-design APIs (all static-cached, no runtime calls)

All provenance objects live in `game.js:9-37` (`SRC`). Each record carries
`source / url / retrieved / simp`.

| Key | Source | URL | Retrieved | Use |
|---|---|---|---|---|
| `lsp` | NASA Launch Services Program — Launch Vehicle Performance Website | https://elvperf.ksc.nasa.gov/ | 2026-09-19 | LV anchor curves, digitised to 5–7 pts, log-mass interp |
| `techport` | NASA TechPort portfolio | https://techport.nasa.gov/api/projects | 2026-09-19 | Instrument mass/power/cost classes (representative, not serial units) |
| `horizons` | JPL Horizons ephemerides | https://ssd.jpl.nasa.gov/api/horizons.api | 2026-09-19 | Porkchop / Lambert solver inputs; coplanar Kepler simplification noted in `simp` |
| `sbdb` | JPL Small-Body Database Query API | https://ssd-api.jpl.nasa.gov/sbdb_query.api | 2026-09-19 | Bennu + small-body elements (rounded) |
| `dsn` | NASA/JPL DSN Now public feed | https://eyes.nasa.gov/dsn/data/dsn.xml | 2026-09-19 | Snapshot only; per-aperture gain is a single figure |
| `rps` | NASA Radioisotope Power Systems (MMRTG) | https://rps.nasa.gov/ | 2026-09-19 | 1.6%/yr flat decay model |
| `nssdc` | NASA NSSDCA Planetary Fact Sheets | https://nssdc.gsfc.nasa.gov/planetary/factsheet/ | 2026-09-19 | GM, radii exact; delta-v items are rules of thumb |
| `cost` | NASA cost-class envelopes (Discovery / New Frontiers / Flagship AOs) | https://science.nasa.gov/researchers/solicitations/ | 2026-09-19 | Parametric bus/integration cost model |
| `models` | NASA 3D Resources (reference set) | https://github.com/nasa/NASA-3D-Resources | 2026-09-19 | Reference only; shipped bus is original (see §5) |

Retired 2026-09-26: the live Bennu SBDB lookup (`sbdb.api?sstr=101955`) was
removed — JPL sends no CORS headers so every browser read failed, and the
vendored elements always won regardless. The badge now permanently reflects
the vendored solution (`QA/bennu_sbdb_solution.json`, orbit_id 118); rendering
never used the network and still doesn't.

## 2. Ephemeris / dynamics (vendored JPL truth)

* Primary provider: `js/astronomy-jpl-data.js` (generated, ~8.9 MB) +
  `js/astronomy.js` evaluator. Frame `ECLIPTIC_J2000`, origin SSB, time TDB
  (UTC→TAI→TT→TDB in-module). Label `JPL_DE441`; fallback is explicitly
  labelled `FALLBACK_KEPLER`, never silent.
* Build: `tools/build_jpl_ephemeris.py` + `tools/horizons.py` from raw
  `tools/horizons_cache/` responses. Reproducible offline; only `golden`
  needs network. Validation: `QA/jpl_reference_checks.mjs` +
  `QA/jpl_reference_vectors.json` (18 bodies × 10 epochs, all gates pass).
* Kernel family (documented deviation in `TRACKING.md`): DE441 planets +
  merged satellite kernels `jup365_merged`, `sat441l`, `mar099`,
  `ura184_merged`, `nep098_merged`, `plu060_merged`.
* Reference docs:
  https://ssd.jpl.nasa.gov/ephem.html ·
  https://ssd.jpl.nasa.gov/planets/eph_export.html ·
  https://ssd.jpl.nasa.gov/horizons/manual.html ·
  https://ssd.jpl.nasa.gov/doc/de440_de441.html ·
  https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/ ·
  https://ssd.jpl.nasa.gov/sats/elem/
* Lighting inputs (`js/solar-system-accuracy.js`): solar constant 1361 W/m²
  (SORCE/TIM, Kopp & Lean 2011 —
  https://lasp.colorado.edu/home/sorce/data/tsi-data/) and the JPL
  `GeometricAlbedo` column (same phys_par page; Bennu 0.044 via live SBDB
  phys-par). Moons inherit the parent albedo (documented approximation).
* Physical layer: `js/solar-system-accuracy.js` — AU `149597870.700` km (IAU
  exact), `R_SUN 695700` km (IAU nominal), GM values per DE440, body radii /
  obliquity / rotation / moon SMA / ring km. Sources: JPL
  https://ssd.jpl.nasa.gov/planets/phys_par.html ·
  https://ssd.jpl.nasa.gov/astro_par.html ·
  https://ssd.jpl.nasa.gov/sats/phys_par/ ·
  NSSDC https://nssdc.gsfc.nasa.gov/planetary/factsheet/ (+
  `/sunfact.html`) · https://science.nasa.gov/solar-system/solar-system-facts/ ·
  IAU 2015 resolutions https://www.iau.org/static/resolutions/IAU2015_English.pdf

## 3. Textures — VERIFIED NASA (`assets/textures/`)

Hub https://nasa3d.arc.nasa.gov/ · mirror
https://github.com/nasa/NASA-3D-Resources · retrieved 2026-09-21/22
(byte sizes verified against the GitHub API `size` fields).
License: public domain per https://www.nasa.gov/multimedia/guidelines/.
No insignia in any file. Full table in `assets/ASSET_SOURCES.md`.

`earth_day.jpg` (GIBS Blue Marble true-color), `earth_night.jpg` (Black Marble
2012 city lights), `earth_clouds.png` (MODIS Terra cloud fraction 2024-09-21/22/23,
gap-filled, 35% floor), `mars.jpg`, `jupiter.jpg`, `europa.jpg`, `venus.jpg`,
`saturn.jpg`, `neptune.jpg`, `mercury.jpg` (MESSENGER mosaic via Wikimedia,
NASA/JHUAPL source), `moon_wac.png` (LROC WAC mosaic,
https://www.lroc.im-ldi.com/images/downloads, ASU/LRO Camera),
`pluto.jpg` (New Horizons), `phobos.jpg`, `io.jpg` (Io A),
`ganymede.jpg`, `callisto.jpg`. Sky: `hipparcos.jpg` (Hipparcos catalog
equirect render, 2880×1440, scene backdrop).

Quarantined (never use as sphere maps):
`assets/quarantine/moon_disc_photo.jpg` — full-disc photo on black, not an
equirect map. Same rule rejected `Earth (B)` (full-disc Apollo photo) and
SDO solar frames on 2026-09-22.

## 4. Shape model — VERIFIED NASA

`models/nasa/Bennu_1_1.glb` — radar shape of (101955) Bennu, Nolan et al.
(Icarus 226, 2013), NASA PDS Small Bodies Node bundle
`urn:nasa:pds:ast-bennu.radar.shape-model::1.1`, DOI `10.26033/33ba-s419`.
Source archive https://sbnarchive.psi.edu/pds4/non_mission/ast-bennu.radar.shape-model_V1_1.zip
retrieved 2026-09-21; self-contained GLB conversion loaded offline with the
vendored GLTFLoader. SHA-256 `b7740b53a77ff538082d26e7079510ef7810fc3de9a5ff0fa316b393d2cf700e`.

Visual-technique reference (MIT-licensed, flavor only — never data, never
textures): N3rson/Solar-System-3D (https://github.com/N3rson/Solar-System-3D,
MIT ©2025 N3rson, read 2026-09-25). Adopted with attribution: emissive-style
sun disc + wide-radius UnrealBloom glow architecture; Earth sunPosition
uniform pattern (validates ours). NOT adopted: any image/texture (quarantine
rule — sun.jpg, planet maps, ring PNGs stay out), light intensities (ours
stay physical), distances/scales. Same standing as the N3rson-sourced
`PLANET_DATA` flavor text: presentation inspiration, zero authority.

Visual-technique code (MIT-licensed, vendored, presentation only - never data):
typeWolffo/THREE.Fire (https://github.com/typeWolffo/THREE.Fire, MIT, based on
the original THREE.Fire by mattatz; volumetric ray-march after Alfred et al.).
Vendored 2026-10-01 as vendor/three-fire/fire.js (plain-JS port of the
vanilla WebGL entry: FireShader GLSL verbatim + FireMesh class; TS types
stripped, import source retargeted to the vendored three) plus the reference
density texture assets/textures/fire-grayscale.png (6,702 B, upstream
src/Fire-grayscale.png). Used ONLY for the launch exhaust volumes in
js/launch-view.js (core / upper-stage / booster plumes, one box volume per
burn source, downward-flipped). Deviations from upstream, all documented in
the vendor header: depthTest true (fire must composite against the vehicle),
per-burn iteration/octave budgets, color throttle via tint scaling.
Upstream paper: Real-Time procedural volumetric fire (Alfred et al.);
noise: ashima/webgl-noise (as upstream).

## 5. Shipped spacecraft + launch vehicle (VERIFIED NASA, vendored static)

`models/nasa/` — all files from NASA 3D Resources
(`https://github.com/nasa/NASA-3D-Resources`, retrieved 2026-09-23 via
`tools/fetch_nasa_models.py`, byte sizes verified against the GitHub API
`size` fields). Source policy: NASA-3D-Resources-only; usage verified
against the NASA-provided resource and NASA media/usage guidance; NASA
identifiers/logos remain subject to their applicable protections; no
third-party asset sources. No insignia in any file. No hot-links — the game
runs offline for judging.

Modular spacecraft — "Satellite Kit" (NASA/Ames asset provenance; REPRESENTATIVE assembly, NOT flight-hardware dimensions; canonical scale 1.0, no WING/RADIO_SCALE):

| File | Source file | Size |
|---|---|---|
| `satellite_kit_body_1.glb` | `3D Models/Satellite Kit/Satellite Kit body 1.glb` | 2,916 B |
| `satellite_kit_body_2.glb` | `3D Models/Satellite Kit/Satellite Kit body 2.glb` | 5,256 B |
| `satellite_kit_body_3.glb` | `3D Models/Satellite Kit/Satellite Kit body 3.glb` | 4,944 B |
| `satellite_kit_wings_1.glb` | `3D Models/Satellite Kit/Satellite Kit wings 1.glb` | 4,860 B |
| `satellite_kit_wings_2.glb` | `3D Models/Satellite Kit/Satellite Kit wings 2.glb` | 8,172 B |
| `satellite_kit_wings_3.glb` | `3D Models/Satellite Kit/Satellite Kit wings 3.glb` | 14,820 B |
| `satellite_kit_radio_1.glb` | `3D Models/Satellite Kit/Satellite Kit radio 1.glb` | 8,436 B |
| `satellite_kit_radio_2.glb` | `3D Models/Satellite Kit/Satellite Kit radio 2.glb` | 8,752 B |
| `satellite_kit_radio_3.glb` | `3D Models/Satellite Kit/Satellite Kit radio 3.glb` | 9,012 B |

Tiers: body 1/2/3 by instrument count (≤2 / 3–5 / 6+); wings 1/2/3 by power
class (small / medium / large, RTGs map to small/medium); radio 1/2/3 by
comms class (LGA / MGA+HGA-2m / HGA-3m+Ka).

Lunar lander — "Apollo Lunar Module" (NASA 3D Resources `lunarlandernofoil-c`;
owner-converted PRESENTATION build, no Draco: 370 KB, 17,557 tris, 12 draw
calls, glTF-validator clean; whole LM both stages, scale 1.0 presentation-grade):

| File | Source file | Size |
|---|---|---|
| `apollo_lm_lander.glb` | `3D Models/Apollo Lunar Module` (upstream GLB 716 KB, Draco+WebP) | 369,984 B |

Credit: NASA 3D Resources, Apollo Lunar Module (lunarlandernofoil-c). Assets
per NASA repo README free-without-copyright with media-guidelines pointer;
model carries one small US-flag texture (kept, unmodified).

Ground-phase rocket — per-vehicle procedural illustration (`js/launch-view.js`):
no CAD claim. Each of the 9 LVs renders as a dimensionally-true stack anchored
only to verified published figures (overall height, stage diameters/lengths,
fairing diameter/height, SRB count/size): SpaceX vehicle pages + Falcon
Payload User's Guide (F9/FH 70 m × 3.7 m, 5.2 m fairing; FH 3-core per NASA
history); ULA cutaway posters + Atlas V User's Guide Rev 11 + Vulcan User's
Guide DOPSR 24-T-0081 + Northrop GEM-63XL datasheet (Atlas 401 57.3 m /
551 62.5 m; Vulcan 61.6 m; AJ-60A 20.0 m; GEM-63XL 21.9 m); blueorigin.com
(New Glenn 98 m × 7 m); NASA Block 1B / core-stage / SRB reference pages +
Orion Reference Guide (SLS 1B 111.6 m, core 64.6 m, SRB 53.9 m — the
NASA-defined planned/future Block 1B crew configuration, represented using
verified published configuration data; no flown-configuration claim).
Internal
splits flagged SECONDARY/DERIVED in the file header are illustrative.
`models/nasa/saturn_v.glb` is retained vendored but no longer flown.

| File | Source file | Size | Status |
|---|---|---|---|
| `saturn_v.glb` | `3D Models/Saturn V/Saturn V.glb` | 927,212 B | retained vendored, no longer flown (superseded by per-LV stacks above) |
| `Mobile Launcher (assembled).glb` | `3D Models/Mobile Launcher/Mobile Launcher (assembled).glb` | 198,480 B | flown (LC-39B ML, `NASA_SOURCE_MODEL`): measured 1.02×2.46×0.87 native units → 47.5 m/unit reconciled (base 48×41 m, 117 m ≈ 380 ft ML); FIXED site scale `47.5/9.95` per display unit for every vehicle (SLS-canonical 9.95 m/unit, `SITE_DECK_Y` ≈ 0.79); seated base-bottom on pad slab, deck 14.3 m under rocket (`js/launch-view.js` `loadML`) |
| `crawler.glb` | `3D Models/Crawler/Crawler.glb` | 1,629,892 B | NOT flown in the launch scene (absent at T-0 per crawler operational rule — carries ML to pad then departs; no launch parking coordinate exists); retained vendored for a future rollout/transport scene: measured 8.77×1.7×7.19 native → 4.7 m/unit reconciled (40×35×8 m vs 131×114 ft, 20–26 ft) |
| `Mobile Launcher (pad only).glb` | `3D Models/Mobile Launcher/Mobile Launcher (pad only).glb` | 149,408 B | fetched spare, not flown (base-only subset of assembled; kept for reference) |

LC-39B missing-geometry report (Phase 8, 2026-10-02): SEARCHED — NASA 3D
Resources collection, NTRS lightning-protection papers (20100036324,
20120015652 — dimensions/diagrams only, no downloadable geometry), NASA/KSC
fact sheets. NO ACCEPTABLE NASA GEOMETRY FOUND for flame trench, flame
deflector, lightning towers, water tower, LOX/LH2 spheres. External
commercial models (SQUIR/Sketchfab, TurboSquid, 3D Warehouse) are
non-authoritative and NOT adopted (plan §27/§29). All five objects stay
ABSENT rather than fabricated; trench remains an FX anchor (`trench_center`),
tower coordinates are RECONSTRUCTED/NON-SURVEY config only. Max-Q collar is
FX (3-sprite vapor haze, `QA/LAUNCH_COLLAR_QA.md`), not environment geometry.

Deep-research follow-up (2026-10-02, NASA/manufacturer provenance only):
A1–A6 re-searched (NASA 3D Resources catalog, NTRS 20100036324/20120015652,
KSC docs) — still NONE qualifying; internal LOD 300 laser-scan BIM exists but
is contractor-held, not public/redistributable (possible owner request via the
NASA 3D Resources submission form — human action, not agent action). Rockets
B7–B11: NO qualifying GLB — SpaceX/Blue Origin publish no CAD; NASA SLS model
is Block 1 only (98 m, config-rejected for 1B); FetchCFD "1B" is AI-generated
third-party (provenance-rejected). ULA publishes official Atlas V / Vulcan
STLs (manufacturer provenance) — single-mesh print files, adoption GATED on:
(a) license permitting offline redistribution, (b) mesh audit for real stage
interfaces + fidelity, (c) MARGIN segmentation work. NOT adopted until gates
pass. REJECTED paths (owner rules): procedural trench/deflector/towers/spheres
from dimensions (plan §2.1 — dimensions validate, never authorize building);
Block-1B-from-Block-1 kitbash (configuration mismatch, SOURCES + modelling
§3.4). Procedural rocket stacks remain the flown architecture.

Step-1 environment (2026-10-02, `js/launch-view.js` + 1-line `game.js` date
threading): sky dome + HYG v4.0 star field (`js/stars-data.js`, already cited
above — same bake the orrery uses, B-V tints per `orrery.js buildStars` bins);
Sun vector from the single `window.Astronomy` authority (JPL_DE441 or explicit
FALLBACK_KEPLER per provider label, ECLIPTIC_J2000 frame); KSC/LC-39B
28.627°N 80.621°W; standard-atmosphere scale height 8.5 km (ESTIMATED);
time-of-day PRESENTATION default 02:00 UTC (night; `?tod=`/`?date=` QA overrides).
No new astronomy, no new telemetry, no sim contact.

Flight performance uses the selected LV's LSP curve (`SRC.lsp`). Pad, tower, plume, smoke, sky and
the altitude/velocity profile are procedural illustration (no data claim),
labeled as such in the overlay.

Visual provenance classes (see `CRAFT_ROCKET_MODELLING.md` §§3.1–3.2):

* `NASA_SOURCE_MODEL` — NASA source geometry with only technical/runtime adaptation.
* `NASA_SOURCE_DERIVED` — NASA source geometry segmented, reorganized, optimized, renamed, re-exported, or otherwise adapted for MARGIN runtime while retaining source-derived geometry.
* `PROCEDURAL_VERIFIED_RECONSTRUCTION` — MARGIN-authored geometry reconstructed from verified published dimensions/specifications. All 9 current LV visuals are this class.

Source-model acceptance rule — all four required:

```
NASA provenance verified
+ correct vehicle/configuration verified
+ semantic staging/pivot contract satisfied
+ meaningful MARGIN mission role exists
```

Saturn V is the only current candidate for a future `NASA_SOURCE_DERIVED`
heritage treatment (canonical `saturn_v_runtime` with `stage_1 / stage_2 /
stage_3 / payload`, separation-interface pivots, `plume_*` anchors,
explicit semantic names). Future path only; the static-until-MECO-then-swap
approach is rejected. Full contract in `CRAFT_ROCKET_MODELLING.md` §3.3.

SLS stays NO-GO: no verified qualifying direct GLB within the current
bundle/format contract, and available Block 1 source does not match the
111.6 m Block 1B crew visual (see `CRAFT_ROCKET_MODELLING.md` §3.4). Any
unverified third-party size/format figure requires byte verification before
it is treated as fact.

Shuttle / Delta II / Pegasus XL / Ares I remain OUT OF SCOPE: real launch
vehicles / real NASA-source asset subjects where applicable, but adoption
would create a new LV simulation/performance/staging/balance/QA program
without a current MARGIN mission-design requirement (see
`CRAFT_ROCKET_MODELLING.md` §3.5).

Documented-but-not-implemented player copy (see `CRAFT_ROCKET_MODELLING.md`
§3.6): procedural vehicles use the "procedural reconstruction … Not CAD /
not an official NASA 3D model" class; any future source-derived vehicle
uses the "NASA-source-derived 3D model … Simulation/performance data
remain independent of the visual model" class; the global statement is
"Vehicle visuals use NASA-source 3D geometry where explicitly credited;
otherwise they are procedural reconstructions … Runtime staging, pivots,
animation, and integration are MARGIN-authored."

Kept as honest fallback (not NASA): `models/margin_mission_bus.glb` +
`assets/margin-mission-bus-preview.png` — original MARGIN bus + Canvas2D
schematic, used only if a kit part fails to load. Do not present as NASA.

## 6. Honest fallbacks (no data claim) — resolved 2026-09-22

All 25 previously-flagged unverified files were deleted from the tree
(`git rm`; history retains them) and replaced as follows. Nothing below is
presented as measured data:

* `sun.jpg` → procedural granulation + limb-darkening shader (pure rendering,
  animated). No equirect solar map is published in NASA 3D Resources.
* `moonmap/moonbump.jpg` → already-vendored LROC `moon_wac.png` (§3).
* `marsbump/mercurybump/venusbump/plutobump2k.jpg` → dropped; smooth spheres.
  No bump maps are published in these NASA source dirs.
* `venus_atmosphere/earth_atmosphere.jpg` → dropped; fresnel limb-glow shader
  only (pure rendering, `fresnelShell()` in `js/orrery.js`).
* `earth_daymap/nightmap.jpg` → verified `earth_day.jpg` (GIBS Blue Marble)
  + verified `earth_night.jpg` (Black Marble 2012, emissive gain 2.0 for
  display) blended by the true sun angle, plus verified `earth_clouds.png`
  (MODIS, documented pipeline) as a drifting alpha shell. Day side gets a
  +12% display saturation grade — map values untouched.
* `jupiterIo/Ganymede/Callisto.jpg` → byte-identical NASA originals
  re-vendored under real names `io/ganymede/callisto.jpg` (§3).
* `saturn_ring/uranus_ring.png` → procedural canvas bands from real radii:
  Saturn C/B/A + Cassini Division gap at the measured 0.691–0.768 fraction;
  Uranus TEN discrete narrow rings at true PDS radii (6/5/4/α/β/η/γ/δ/λ/ε,
  https://pds-rings.seti.org/uranus/uranus_rings_table.html, Nicholson et
  al. 2018; widths floored, positions exact, dim like the real ≤2%-albedo
  particles).
* `uranus.jpg` → flat `tint 0x9fd4d8` (Voyager 2 showed a near-featureless
  pale-cyan disc; no official equirect map exists).
* Skybox `1–4.jpg` → NASA `hipparcos.jpg` equirect backdrop (§3).
* `models/phobos/deimos.glb` → real NASA maps on real-radius spheres with
  real orbits. `models/asteroidPack.glb` → deleted; generic belts stay out
  (illustration, not data).

Geometry (resolved): the three GLBs are deleted. Phobos/Deimos now render as
real-radius spheres with the NASA maps (§3) on real orbits; note the sphere
approximation in any caption (irregular-body shape would need a PDS shape
model like Bennu §4). Generic asteroid belts stay out entirely —
illustration, not data.

## 7. Non-NASA licensed assets (real sky + Earth art)

Two shipped asset families are **not** NASA. Both are listed here so the
NASA sections above stay truthful, and both are surfaced in-game under their
own provenance class — never folded into “REAL NASA/JPL DATA”.

### 7a. Star catalog (real sky, non-NASA)

`js/stars-data.js` — bake of HYG Database v4.0 (CC BY-SA 4.0, attribution
satisfies license; compiled from Hipparcos/ESA + Yale Bright Star + Gliese),
source https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v40.csv.gz
retrieved 2026-09-21. 5,070 stars Vmag ≤ 6.0 as J2000 unit vectors + Vmag +
B-V. Render sizes from Vmag, colors from B-V. Credit
“Stars: HYG v4.0 (Hipparcos / Yale BSC / Gliese)” alongside NASA credits.

### 7b. Earth surface maps (art, non-NASA) — CC BY 4.0

`assets/textures/earth_day_sss.jpg`, `earth_night_sss.jpg`, `earth_clouds_sss.png`,
`earth_roughness_sss.jpg` — from **Solar System Scope**,
https://www.solarsystemscope.com/textures/, © 2010–2017 Solar System Scope,
licensed **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/), retrieved
2026-09-25. Per-file conversions and rejected files: `assets/ASSET_SOURCES.md`.

Credit line required: **“Planet textures: Solar System Scope, CC BY 4.0”**.

**Why these are here and everything else is NASA.** Solar System Scope states its
maps are “based on NASA elevation and imagery data with colours slightly more
saturated and gaps filled with similar fictional terrain”. They are therefore
**illustration, not measurement**, and are used only where the project gains
something NASA has no equivalent for — chiefly the land/sea roughness mask, which
no NASA map in this repo previously provided. It is deliberately remapped matte
(sea 0.55) rather than mirror-sharp: a near-mirror ocean reflected the Sun as a
hard bright disc and read as plastic rather than photographic. The map is
therefore used for material contrast only, **not** for a specular reflection.
The
science-grade NASA Earth maps (GIBS Blue Marble, Black Marble 2012, MODIS cloud
fraction) are **retained in the repo but no longer loaded**; they remain the
accuracy reference and reverting is a one-line `BODY_TEX` change in `js/orrery.js`.
Every other body keeps its NASA map.

Nothing in the ephemeris, lighting, exposure, or any gameplay number depends on
these files — they are surface appearance only.

## 8. Lighting / post (rendering only, no data claim)

Sun: procedural granulation + limb-darkening shader (`createSunMaterial()`,
fbm noise animated via `uTime`) + `UnrealBloomPass` (threshold 0.85 in linear
HDR — sun dominates, bright limbs subtle — tracked per-frame
as 0.85/exposure, radius 0.9 for a round falloff on the sub-pixel true-scale
disc) + additive corona sprite (hot white core, warm wash, long tail; 5x disc
presentation / 12x true-scale — declared pure rendering, disc stays exact) + `OutputPass` (required r152+ closer: tone mapping with the live
auto-exposure + sRGB at chain end; without it the composer emits raw linear
and every sunlit body renders nuclear); hover `OutlinePass`;
`ACESFilmicToneMapping` exposure 1.15. Earth is a physical standard material
under the real sun, extended by shader injection (Blue Marble day / Black
Marble emissive night blend by true sun angle + MODIS cloud-deck ground
shadows). Limb shells use a scattering-look shader (day blue / dim night /
warm terminator band, sun derived from world position).
`ACESFilmicToneMapping` exposure 1.15. Rig in `js/orrery.js`
(`buildSolarSystem`): `AmbientLight(0x334455, 0.25)` cool fill +
`PointLight(0xfff2d8, 2480, distance 0, decay 2)` at the Sun's centre — the
intensity is DERIVED, not tuned: 1361 W/m² (SORCE/TIM solar constant, Kopp &
Lean 2011) × (1 AU in world units)², so Earth orbit receives exactly 1361 and
every body gets its true 1/r² share at its real JPL-ephemeris distance
(positions were always true-scale; only sizes are exaggerated).
`PCFSoftShadowMap` 2048, `near 0.4 / far 120 / bias -0.0004`; opaque bodies
cast + receive, transparent shells never cast. `AmbientLight(0x334455, 0.4)`
is a readability fill (0.03% of sunlight at Earth — negligible by day, a dim
floor by night and for Pluto). Exposure is metered from measured irradiance
× verified JPL geometric albedo, normalized to middle gray per focus
(`exposureForBody()`); the wide view holds Earth×2.5 to show the true
gradient. The Sun disc couples to the iris (`uExposure`) so it always
saturates; bloom threshold tracks as 0.85/exposure so the Sun dominates and
bright dayside limbs bloom subtly. Ops shares the same 2480 rig and meters
exposure off the mission target; its craft key light + ambient ride
1/exposure counter-boosts so the dark craft holds constant. Shadows are
resolvability-gated, not wishful: the sun's 1024 cube spans 150u, so one
texel dwarfs every moon and transit dot — sampling them flickers
(lit/black sawtooth across texel edges). Planets CAST (their bulk shades
Saturn's spanning rings, the one shadow that resolves); moons/Bennu neither
cast nor receive; rings receive only; shells never join. Terminators come
from exact NdotL lighting at any scale. True eclipses need analytic cone
tests (future work), not bigger maps.
irradiance (derived 1361/au² W/m²): Mercury 9083, Venus 2601, Earth 1361,
Mars 586, Jupiter 50.3, Saturn 15.0, Uranus 3.70, Neptune 1.51, Pluto 0.87,
Bennu 1073.
Renderers (`js/select-viewer.js`, `js/brief-view.js`) enable shadow maps;
brief carries no extra ambient so both views share the one rig. Positions
are true-scale JPL; diameters render enlarged for legibility (250x inner,
80x giants, sun capped) — true radii one flag away (`?phys=1`). Tiny bodies
(moons, Bennu) are found via their labels and the focus dropdown.
`PCFSoftShadowMap` 2048, `near 0.4 / far 120 / bias -0.0004`; opaque bodies
cast + receive, transparent atmosphere shells never cast. Sun mesh never
casts (it surrounds the light). Renderers (`js/select-viewer.js`,
`js/brief-view.js`) enable shadow maps; brief carries no extra ambient so
both views share the one rig. Exposure is per-focus auto
(`exposureForBody()` in `js/orrery.js`): the wide view holds Earth×2.5 to
show the true gradient, while a focused view meters off real irradiance ×
verified JPL geometric albedo, normalized to middle gray like a camera off
an 18% card (Earth ~0.003, Venus clamped at 0.0009, Pluto ~6.0). The Sun
disc couples to the iris (`uExposure`) so it always saturates; bloom
threshold tracks as 0.85/exposure so the Sun dominates and bright limbs bloom
subtly. Lights are never
tuned. No API/data source to cite here.

## 9. NASA credit checklist (Space Apps)

* [x] About/report screen lists §§1–5 + 7 with URLs + retrieval dates (report MISSION DATA panel + How-it-works link, Phase 12).
* [x] Bennu shape cited with DOI `10.26033/33ba-s419` (same panel).
* [ ] No NASA meatball/worm/insignia in `assets/`, `models/`, CSS, or copy.
* [ ] §6 fallbacks correctly labeled (procedural Sun, procedural rings/Cassini
      gap, Uranus disc, no belts, procedural pad/tower/plume + illustrative
      ascent profile). Earth night/clouds are measured data (§3).
* [ ] Spacecraft + rocket statement: "Spacecraft: NASA Satellite Kit (NASA-3D-Resources source; usage per NASA media/usage guidance), rockets:
      per-vehicle procedural reconstructions from verified manufacturer/NASA
      figures (no CAD claim, `PROCEDURAL_VERIFIED_RECONSTRUCTION`), both offline; Saturn V GLB retained vendored but unflown (only future source-derived candidate);
      SLS is the NASA-defined planned/future Block 1B configuration (no flown-configuration claim);
      Bennu shape: NASA PDS; ephemeris: JPL Horizons; stars: HYG/Hipparcos."

## 10. How to add a source

1. Vendor the file static (never hot-link). 2. Append it to §1/§3/§4 with
   URL + retrieval date + license. 3. Reference this file from the code
   comment at the load site. 4. If it replaces a §6 entry, delete the §6
   line in the same commit.

## 11. Lunar landing-site planning data (Phase 1 rover-forward)

Candidate sites authored in `game.js` (`MOON_SITES`, L2 only). Coordinates and site character are real LRO-record facts; gameplay figures (slope/hazard/sun/earth/sci/travKm/hazardDv) are **balanced abstractions** in the house style — they order the sites correctly without claiming survey precision.

* Positions: Apollo 11 `0.67°N, 23.47°E` (universally published landing coordinates); Shackleton crater `89.9°S, 0.0°E`, 21 km diameter (LRO record); Connecting Ridge ~89.5°S (Artemis candidate-region literature); Mons Malapert ~86°S massif, ~5 km relief (published south-polar massif figures).
* Topography/character: LRO LOLA experiment (Goddard PDS Geosciences Node, https://pds-geosciences.wustl.edu/missions/lro/lola.htm) — Shackleton PSR floor, rim relief, mare basalt plains; LROC NAC imagery (ASU, https://wms.lroc.asu.edu/lroc) — highland ruggedness vs mare smoothness.
* Illumination/thermal character: peaks-of-eternal-light analyses (Bussey et al., illuminated-fraction mapping) and LOLA-derived polar illumination maps (Mazarico et al.) — Malapert/Connecting-Ridge near-constant light, mare full day/night cycle (~354 h night); Malapert direct-Earth visibility (documented Earth-always-above-horizon geometry); Shackleton interior no direct Earth view.
* Ice/science character: LRO Diviner/LAMP/LOLA hydrogen and PSR observations (Cabeus/Shackleton water-ice signatures) — Shackleton sci x1.30 (ice at feet), Malapert x1.10 (light + comms, ice distant), Tranquillitatis x1.00 baseline.
* No files vendored in Phase 1 (coordinates + character only; terrain meshes and the offline DTM bake arrive in Phase 5 per `plans_notes/ROVER_SYSTEM_CONTEXT.md` §5). Compiled 2026-09-26.

## 12. Rover kit baselines (Phase 2 BUILD)

Rover subsystem tiers authored in `game.js` (`ROVER_MOB/_PWR/_COM/_PAY`, L2
only). Hardware classes are real flown/designed systems; tier figures
(mass/draw/cost/slope/night/gain/sci) are **balanced abstractions** in the
house style — class ordering without serial-unit claims.

* Mobility: Apollo Lunar Roving Vehicle, Boeing/GM for NASA MSFC (rigid
  4-wheel, ~210 kg Earth-weight class — the light-rigid archetype);
  Mars Exploration Rovers, NASA JPL (rocker-bogie 6-wheel, ~20° obstacle
  capability class); VIPER, NASA (active suspension, steep/regolith-rover
  class) and MSL Curiosity, NASA JPL (rocker-bogie at ~900 kg with
  ~30°+ slope performance envelope).
* Power: MER-class body solar + Li-ion (day ops); Chang'E/Yutu-class lunar
  hibernation through the 354 h night (survive-asleep archetype); MMRTG,
  NASA RPS (https://rps.nasa.gov/ — night-capable heat + power, cf. §1 `rps`).
* Comms: omni/UHF low-gain (suitcase direct), steerable HGA direct-to-Earth,
  Electra UHF relay package, NASA JPL (MRO/MAVEN relay class, cf. in-game
  `RELAY_PART` heritage line).
* Payloads: MER Athena (context imagers + APXS contact science); MSL
  Mastcam-Z/SHERLOC/PIXL-class stand-off mineralogy; MSL/ExoMars-class drill
  + sample caching (subsurface access).
* Vendored in Phase 3: `models/nasa/perseverance.glb` (Mars 2020 Perseverance
  Rover, 4,987,176 B — byte-asserted against the GitHub API `size` field at
  fetch, cf. `tools/fetch_hero_models.py`). Raw bbox 81.94 x 175.63 x 152.07
  units; calibrated at load to 3.0 m true span (factor 0.017081) by
  `calibrateRover` in `js/kit-assembly.js`. Registry: `models/sources/sources.json`
  `SRC-NASA-M2020`; manifest: `plans_notes/MODEL_SOURCES.md`; full audit:
  `QA/ROVER_GLB_PHASE3_QA.md`. Curiosity upstream ships `.blend` only (no
  GLB) — excluded by the vendor-GLB rule, not re-exported locally.
  Compiled 2026-09-26.
## 13. Surface terrain patches (Phase 5 rover diorama)

Real LRO LOLA elevation, offline-baked by tools/bake_lunar_patches.mjs into
js/surface-data.js (classic script, 244 KB, file://-safe). One bake, two
outputs: visual heights (true metres, x1 exaggeration) + slope/rock hazard
cells for game.js Phase 6 — visual and sim slope can never drift.

* Grids (Goddard PDS Geosciences Node, https://pds-geosciences.wustl.edu/lro/):
  ldem_875s_10m (polar stereo south, 10 m/post, int16 x0.5 m) for Shackleton;
  ldem_85s_40m (polar stereo south, 40 m/post) for Malapert;
  ldem_1024_00n_15n_000_030 (cylindrical 1024 pix/deg, ~29.6 m/post, int16)
  for Tranquillitatis. Fetched 2026-09-26 via HTTP Range (row windows only,
  ~17 MB transient, never vendored).
* Patches: 3x3 km, 80x80 (37.5 m visual post), bilinear resample only — no
  invented relief. Shackleton 304 m relief / 9.7 deg max slope; Malapert
  153 m / 5.0 deg (40 m source smooths the massif); Tranquillitatis 20 m /
  3.6 deg. Rock class derived from measured slope (>15 deg:2, >8 deg:1).
* Sub-resolution grain: procedural canvas bump (generic regolith noise, no
  craters/boulders) — the single disclosed illustration layer.
* Bounds: fog curtain + in-world "3x3 KM TRUE M" label, never extended terrain.
Compiled 2026-09-26.

### Sky/horizon upgrade (v2 bake, same contract)

Inner grids refined to 200x200 (Shackleton from `ldem_875s_5m` 5 m/post;
Malapert `ldem_85s_40m`; Tranquillitatis `ldem_1024_00n_15n_000_030`);
outer 48x48 km B1 context ring 120x120 from the same grids with lunar
curvature drop baked on both (exact seam, zero fake geology). Reflectance
drape: NO gridded LOLA 1064 nm I/F product exists in range-fetchable form
(`ldrm_*` is measured ROUGHNESS, verified by label read) — roughness is
used in the physically-correct `roughnessMap` slot instead; albedo stays
uniform + disclosed grain. Presenting roughness AS albedo was refused on
honesty grounds. Encoding f32le/uint8 base64, `js/surface-data.js` ~1.0 MB.
Sky (Earth sphere, sun disc, 5 planets, Hipparcos) is positional JPL truth
in a documented J2000-ecliptic-aligned Moon frame; Earth spin rate true,
phase arbitrary. Compiled 2026-09-26.

### Terrain bake v3 (same contract, denser grids)

`js/surface-data.js` ~2.3 MB. Inner density graded by source quality:
Shackleton 400×400 (7.52 m post from `ldem_875s_5m`), Malapert 300×300
(10.03 m post — moved off `ldem_85s_40m` onto `ldem_85s_10m`, label-verified
30336² int16×0.5 m, same datum; 85s coverage includes ~86°S), Tranquillitatis
200×200 (~30 m source, unchanged). Outer context 120×120 → 200×200 all sites
(240 m post horizon silhouette). Hazard 80×80 keys/shapes unchanged so
`game.js` sim readers are untouched; Malapert hazard values refined by the
better source (same algorithm). Measured spans identical to v2
(Shackleton 303.5 m, Malapert 152.9 m, Tranquillitatis 19.9 m — same datum,
no invented relief). Denser sampling resolves steeper true slopes
(Shackleton max 24.9° at 7.5 m vs 9.7° at 15 m; Malapert 13.5° vs 5.0°) —
expected and honest; `MOON_SITES` gameplay slope figures (12/8/3) unchanged.
Roughness drape reads constant (fill) over both polar windows — pre-existing
product sparsity, uniform material response, no visual effect.
### Detail-texture v4 (normal + cavity albedo, same contract)

`tools/make_detail_texture.mjs` now bakes TWO maps from the vendored NAC
strip: `assets/textures/lroc_nac_tile.png` (512² RGB tangent-space normal
map — wrapping R64 high-pass, ±3σ normalize, 5× Sobel strength, bake
mean tilt 26.0°) and `assets/textures/lroc_nac_albedo.png` (512² gray
cavity albedo — base 225, bowls −60, rims +26). 72 analytical paraboloid
crater bowls (0.5–6 m, power-law counts) are stamped into BOTH buffers
pre-Sobel with wrapping positions; `patch.h[]` and the sim are untouched —
texture-only illustration, same disclosure class as the rock dressing.
CORRECTIONS to §§v2–v3 above: the LOLA roughness drape NO LONGER feeds
`roughnessMap` (planetary smoothness ≠ PBR gloss; uniform roughness 1.0 +
zero-specular physical material); the bump slot is retired
(`USE_NORMALMAP`/`USE_BUMPMAP` are mutually exclusive in three);
sunlight is neutral `0xfffcf8` with a `0x78787a` regolith base (airless
white sun, not warm haze). Compiled 2026-09-27.

### Detail-texture v5 + lunar light model (same contract, sim untouched)

- `tools/make_detail_texture.mjs` rebaked as PURE procedural velvet:
  tileable gradient-Perlin fBM + softened 0.1–3 m dimples (bake mean-B
  242.6), `repeat 150` (20 m tiles), `normalScale 0.3`. The NAC photograph
  is no longer differentiated; `assets/textures/lroc_nac_albedo.png`
  deleted (craters have no dark floors — slopes and shadows do).
- `js/surface-view.js` `buildMesoMaps`: per site entry, bicubic-upsampled
  LOLA → 2048² meso normals (repeat 1, unique world locations; 6–18 m
  texture bowls + crater-Δh alpha channel) + 1024² 4-direction
  horizon-angle map (exponential march to ~400 m, includes the geometric
  large set). `patch.h[]` untouched.
- 150 seeded 18–45 m bowls live GEOMETRICALLY (750² mesh vertices +
  `surfHeightAt` 3D grounding; sim/2D/hazard never see them).
- Light: Lommel-Seeliger + opposition transfer and horizon shadow gate
  injected into the existing physical material (`onBeforeCompile`, chunk
  anchors verified against vendored r160); same sun, same shadow rig.
  Texture-only crater/rock illustration stays disclosed (code + QA).
  Compiled 2026-09-27.
