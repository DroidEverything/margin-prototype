// Bulk-pull verified NASA reference imagery for Tripo input packs.
// Source: NASA Image and Video Library API (images-api.nasa.gov) — no key.
// Layout: models/tripo_inputs/<packId>/manifest.json + collection.json sidecars
//         + image files. Tracking md generated at models/tripo_inputs/TRACKING.md
// Usage: node tools/fetch_tripo_refs.mjs [--pack <id>] [--limit N]
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'models', 'tripo_inputs');
const RETRIEVED = new Date().toISOString().slice(0, 10);

const PACKS = [
  // instruments (game ids)
  { id: 'ctx', game: 'ctx Context Camera', queries: ['CTX camera Mars Reconnaissance Orbiter', 'Malin Space Science Systems camera'] },
  { id: 'hires', game: 'hires Telescopic Imager', queries: ['HiRISE camera instrument', 'PIA07087'] },
  { id: 'therm', game: 'therm Thermal Imager', queries: ['THEMIS camera Mars Odyssey', 'thermal emission imaging system'] },
  { id: 'ocean', game: 'ocean Wide-Field Ocean Imager', queries: ['PACE OCI instrument', 'PACE spacecraft observatory'] },
  { id: 'vnir', game: 'vnir VNIR Imaging Spectrometer', queries: ['infrared spectrometer spacecraft instrument', 'CRISM Mars Reconnaissance Orbiter'], manual: 'No OVIRS hardware in images-api; use UArizona OSIRIS-REx gallery + GSFC MapCam/OTES pages as manual backup' },
  { id: 'msp', game: 'msp Mass Spectrometer', queries: ['SAM instrument Curiosity Mars', 'sample analysis Mars clean room'] },
  { id: 'grns', game: 'grns Gamma-Ray Neutron Spectrometer', queries: ['GRNS spectrometer MESSENGER', 'gamma ray spectrometer spacecraft'] },
  { id: 'mag', game: 'mag Magnetometer + boom', queries: ['Juno magnetometer boom', 'magnetometer boom spacecraft'] },
  { id: 'plas', game: 'plas Plasma Particle Analyser', queries: ['MAVEN particles instrument', 'solar wind analyzer spacecraft'] },
  { id: 'dust', game: 'dust Dust Detector', queries: ['New Horizons student dust counter', 'Stardust aerogel collector'] },
  { id: 'radar', game: 'radar Ice-Penetrating Radar', queries: ['Europa Clipper REASON antenna', 'ice penetrating radar antenna spacecraft'] },
  { id: 'alt', game: 'alt Laser Altimeter', queries: ['LOLA Lunar Reconnaissance Orbiter', 'laser altimeter LOLA'] },
  { id: 'arm', game: 'arm Sample Acquisition Arm', queries: ['TAGSAM arm OSIRIS-REx', 'TAGSAM sampling'] },
  { id: 'drill', game: 'drill Drill + Sample Handling', queries: ['Mars sample handling drill', 'sample caching system Mars'] },
  { id: 'seis', game: 'seis Seismometer', queries: ['SEIS seismometer InSight', 'SEIS Mars'] },
  { id: 'wx', game: 'wx Weather Station', queries: ['MEDA Perseverance rover', 'MEDA Mars environmental'] },
  { id: 'uso', game: 'uso Ultra-Stable Oscillator', queries: ['spacecraft avionics box clean room', 'deep space transponder'] },
  { id: 'rad', game: 'rad Radiation Monitor', queries: ['MSL RAD radiation assessment', 'radiation monitor Curiosity'] },
  // power / comms / propulsion / bus
  { id: 'pwr-solar', game: 'power solar wings', queries: ['solar array wing spacecraft clean room', 'satellite solar panels deployment'] },
  { id: 'pwr-msl-Clipper', game: 'power Clipper-class array', queries: ['Europa Clipper solar arrays', 'Clipper spacecraft solar'] },
  { id: 'pwr-rtg', game: 'power MMRTG', queries: ['MMRTG generator', 'Curiosity MMRTG nuclear'] },
  { id: 'comms-hga', game: 'comms high-gain dish', queries: ['high gain antenna dish spacecraft', 'parabolic antenna deep space'] },
  { id: 'prop-chem', game: 'prop chemical engine', queries: ['rocket engine nozzle spacecraft', 'bipropellant thruster test'] },
  { id: 'prop-ion', game: 'prop NEXT ion thruster', queries: ['NEXT ion thruster test', 'ion propulsion thruster NASA'] },
  { id: 'bus', game: 'spacecraft bus', queries: ['satellite bus clean room assembly', 'spacecraft integration clean room'] },
];

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? null : process.argv[i + 1]; };
const onlyPack = arg('--pack');
const perQuery = parseInt(arg('--limit') || '6', 10);

async function search(q) {
  const u = 'https://images-api.nasa.gov/search?q=' + encodeURIComponent(q) + '&media_type=image&page_size=' + perQuery;
  const r = await fetch(u);
  if (!r.ok) throw new Error('search ' + r.status + ' ' + q);
  return r.json();
}
function pickFiles(item) {
  const links = (item.links || []).filter(l => l.render === 'image' && l.href);
  const by = (re) => links.find(l => re.test(l.href));
  return by(/~large\.jpg$/) || by(/~orig\.jpg$/) || by(/~medium\.jpg$/) || links[0] || null;
}
async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('dl ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

const index = [];
for (const pack of PACKS) {
  if (onlyPack && pack.id !== onlyPack) continue;
  const dir = join(OUT, pack.id);
  mkdirSync(dir, { recursive: true });
  const seen = new Map();
  const manifest = { packId: pack.id, game: pack.game, source: 'NASA Image and Video Library (images-api.nasa.gov)', retrieved: RETRIEVED, queries: pack.queries, manual_backup: pack.manual || null, items: [] };
  for (const q of pack.queries) {
    let data;
    try { data = await search(q); } catch (e) { manifest.items.push({ query: q, error: String(e) }); continue; }
    for (const item of (data.collection.items || [])) {
      const d = (item.data || [])[0] || {};
      if (!d.nasa_id || seen.has(d.nasa_id)) continue;
      const file = pickFiles(item);
      if (!file) continue;
      seen.set(d.nasa_id, true);
      const ext = '.jpg';
      const fname = d.nasa_id + '-' + basename(file.href).replace(/[^a-zA-Z0-9.~_-]/g, '_');
      const dest = join(dir, fname);
      let bytes = 0;
      try { if (!existsSync(dest)) bytes = await download(file.href, dest); }
      catch (e) { manifest.items.push({ query: q, nasa_id: d.nasa_id, error: String(e) }); continue; }
      try { writeFileSync(join(dir, d.nasa_id + '.collection.json'), JSON.stringify(item, null, 1)); } catch (e) {}
      manifest.items.push({
        query: q, nasa_id: d.nasa_id, title: d.title, center: d.center,
        date_created: d.date_created, secondary_creator: d.secondary_creator,
        asset_page: item.href, file: fname, bytes, rendered: file.href,
        description: (d.description || '').slice(0, 300),
      });
      if (seen.size >= 8) break;
    }
    if (seen.size >= 8) break;
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  index.push({ packId: pack.id, game: pack.game, images: manifest.items.filter(i => i.file).length, queries: pack.queries });
  console.log(pack.id + ': ' + manifest.items.filter(i => i.file).length + ' images');
}
// tracking md
let md = '# Tripo Reference Pack Tracking\n\n> Source: NASA Image and Video Library API (`images-api.nasa.gov`, no key, public domain NASA imagery).\n> Retrieved: ' + RETRIEVED + '. Layout: `models/tripo_inputs/<packId>/` = image files + `<nasa_id>.collection.json` provenance sidecars + `manifest.json`.\n> Rule: these photos are **appearance reference for Tripo generation, not dimensional evidence**. Generated meshes enter the manifest as REPRESENTATIVE with lineage (input NASA IDs + Tripo model/seed).\n\n| Pack | Game component | Images | Queries |\n|---|---|---:|---|\n';
for (const r of index) md += '| `' + r.packId + '` | ' + r.game + ' | ' + r.images + ' | ' + r.queries.join(' / ') + ' |\n';
md += '\n## Status\n\n- [x] bulk pull ' + RETRIEVED + ' (' + index.reduce((a, r) => a + r.images, 0) + ' images, ' + index.length + ' packs)\n- [ ] curator pass: pick 2–4 best views per pack (front/side/top, plain background, no people/scaffolding)\n- [ ] Tripo generation per pack (record model version + seed in `models/tripo/lineage.json`)\n- [ ] GLB normalize-to-metres + register REPRESENTATIVE in `models/manifest/assets.json`\n- [ ] validator lineage-completeness check\n';
writeFileSync(join(OUT, 'TRACKING.md'), md);
console.log('TRACKING.md written');
