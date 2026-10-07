// Contact sheets for Tripo curator pass. Reads models/tripo_inputs/<pack>/
// manifest.json + image files, writes models/tripo_inputs/contact_sheets/<pack>.html
// with thumbnails (file:// safe, relative paths). Usage: node tools/contact_sheets.mjs [--pack <id>]
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN = join(ROOT, 'models', 'tripo_inputs');
const OUT = join(IN, 'contact_sheets');
mkdirSync(OUT, { recursive: true });
const only = (() => { const i = process.argv.indexOf('--pack'); return i === -1 ? null : process.argv[i + 1]; })();
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const pack of readdirSync(IN)) {
  if (only && pack !== only) continue;
  const man = join(IN, pack, 'manifest.json');
  if (!existsSync(man)) continue;
  const m = JSON.parse(readFileSync(man, 'utf8'));
  const cards = m.items.filter(i => i.file).map(i => {
    let kb = 0;
    try { kb = Math.round(statSync(join(IN, pack, i.file)).size / 1024); } catch (e) {}
    return '<figure><img loading="lazy" src="../../' + pack + '/' + esc(i.file) + '">'
      + '<figcaption><b>' + esc(i.nasa_id) + '</b> · ' + esc(i.center || '') + ' · ' + kb + ' KB<br>'
      + esc(i.title || '') + '<br><span class="q">via: ' + esc(i.query || '') + '</span><br>'
      + '<a href="' + esc(i.asset_page || '#') + '">asset page</a></figcaption></figure>';
  }).join('\n');
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(pack) + ' contact sheet</title>'
    + '<style>body{background:#0b0e13;color:#cfd6df;font-family:system-ui;margin:16px}h1{font-size:18px}'
    + '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}'
    + 'figure{margin:0;background:#11161d;border:1px solid #232c38;border-radius:8px;overflow:hidden}'
    + 'img{width:100%;height:240px;object-fit:contain;background:#000;display:block}'
    + 'figcaption{padding:8px 10px;font-size:12px;line-height:1.5}.q{color:#7d8aa0}a{color:#5eb4ff}</style></head><body>'
    + '<h1>' + esc(pack) + ' — ' + esc(m.game || '') + ' (' + m.items.filter(i => i.file).length + ' images, retrieved ' + esc(m.retrieved || '') + ')</h1>'
    + '<p>Curator: keep 2–4 (hardware fills frame, plain background, no people/scaffolding). Note keepers for Tripo.</p>'
    + '<div class="grid">' + cards + '</div></body></html>';
  writeFileSync(join(OUT, pack + '.html'), html);
  console.log(pack + '.html');
}
let idx = '<!doctype html><html><head><meta charset="utf-8"><title>Tripo contact sheets</title>'
  + '<style>body{background:#0b0e13;color:#cfd6df;font-family:system-ui;margin:16px}a{color:#5eb4ff;line-height:2}</style></head><body><h1>Tripo contact sheets</h1>';
for (const pack of readdirSync(IN)) {
  if (only && pack !== only) continue;
  if (!existsSync(join(IN, pack, 'manifest.json'))) continue;
  idx += '<a href="' + pack + '.html">' + pack + '</a><br>';
}
writeFileSync(join(OUT, 'index.html'), idx + '</body></html>');
console.log('index.html');
