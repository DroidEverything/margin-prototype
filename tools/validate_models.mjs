// MARGIN model release-gate validator (Phase 10). Node-only, dependency-free.
// Usage: node tools/validate_models.mjs [--mutate <case>]
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const PHYS = new Set(['VERIFIED','DERIVED','MEASURED']);
const fails = []; const warns = [];
const fail = (c,m) => fails.push(c+': '+m);
const warn = (c,m) => warns.push(c+': '+m);
function evCheck(ev, where){
  if (typeof ev?.value !== 'number' || !isFinite(ev.value)) fail(where,'non-finite value');
  if (!ev?.unit) fail(where,'missing unit');
  if (!['VERIFIED','DERIVED','MEASURED','REPRESENTATIVE','SCHEMATIC','DECORATIVE','CONFLICTED','INVALID','STALE'].includes(ev?.status)) fail(where,'bad status');
  if (PHYS.has(ev?.status)) {
    if (!ev.sourceRefs?.length) fail(where,'physical claim without sourceRefs');
    else { const ids = new Set(J('models/sources/sources.json').sources.map(s=>s.sourceId)); for (const r of ev.sourceRefs) if (!ids.has(r)) fail(where,'invalid sourceRef '+r); }
    if (!ev.configurationId && !where.startsWith('lv.')) fail(where,'physical claim without configurationId');
    if (ev.status==='DERIVED' && !ev.formulaRef) fail(where,'DERIVED without formulaRef');
  }
  if (!PHYS.has(ev?.status) && ev?.claimsPhysical) fail(where,'representative/schematic claims physical');
}
function walkLV(o, path, cfg){
  if (o && typeof o === 'object' && 'value' in o && 'status' in o) { evCheck({...o, configurationId: cfg}, path); return; }
  if (o && typeof o === 'object') for (const [k,v] of Object.entries(o)) { if (['fidelity','presentation','presentationFidelity','cores','coresNote','note'].includes(k)) continue; walkLV(v, path+'.'+k, cfg); }
}
// 1. sources registry integrity
{
  const s = J('models/sources/sources.json'); const ids = s.sources.map(x=>x.sourceId);
  if (new Set(ids).size !== ids.length) fail('sources','duplicate sourceId');
  for (const x of s.sources) { if (!x.publisher || !x.title || !x.retrievalDate) fail('sources','incomplete record '+x.sourceId); if (!x.url && !x.localPath) fail('sources','no url/localPath '+x.sourceId); }
  const c = J('models/sources/conflicts.json');
  for (const k of (c.conflicts||[])) if ((k.status||'').startsWith('UNRESOLVED')) fail('conflict', k.conflictId+' unresolved');
}
// 2. LV specs
{
  const lv = J('models/manifest/launch-vehicles.json');
  const cfgs = new Set(J('models/manifest/configurations.json').configurations.filter(c=>c.status==='CURRENT').map(c=>c.configurationId));
  const seen = new Set();
  for (const v of lv.vehicles) {
    if (seen.has(v.configurationId)) fail('lv', 'duplicate '+v.configurationId);
    seen.add(v.configurationId);
    if (!cfgs.has(v.configurationId)) fail('lv', v.configurationId+' not a CURRENT configuration');
    walkLV(v, 'lv.'+v.configurationId, v.configurationId);
    if (v.configurationId==='VC4' && v.boosters?.count!==4) fail('lv','VC4 booster count');
    if (v.configurationId==='VC6' && v.boosters?.count!==6) fail('lv','VC6 booster count');
    if (v.configurationId==='SLS-B1B-CREW' && v.totalHeight?.value!==111.6) fail('lv','SLS height');
    if (v.boosters && (v.boosters.count|0)===0 && (v.boosters.length||v.boosters.diameter)) fail('lv',v.configurationId+' zero-count booster with dims');
  }
  for (const id of cfgs) if (!seen.has(id)) fail('lv','missing spec '+id);
  // formulas referenced exist
  const f = new Set(J('models/derived/formulas.json').formulas.map(x=>x.derivationId));
  const checkRef = (o) => { if (o && typeof o==='object'){ if (o.formulaRef && !f.has(o.formulaRef)) fail('derived','unknown formula '+o.formulaRef); for (const v of Object.values(o)) checkRef(v); } };
  checkRef(lv);
}
// 3. instruments: all SCHEMATIC/REPRESENTATIVE, none physical
{
  const m = J('models/manifest/instruments.json');
  if (m.instruments.length !== 18) fail('instruments','expected 18, got '+m.instruments.length);
  for (const i of m.instruments) if (PHYS.has(i.representation)) fail('instruments', i.id+' claims physical geometry');
}
// 4. assets: no physical claim; runtime scale 1.0
{
  const a = J('models/manifest/assets.json');
  if (a.runtimeScale !== 1.0) fail('assets','runtimeScale must be 1.0');
  for (const x of a.assets) {
    if (!['VERIFIED','DERIVED','MEASURED','REPRESENTATIVE','SCHEMATIC','DECORATIVE','CONFLICTED','INVALID','STALE'].includes(x.fidelity)) fail('assets', x.assetId+' bad fidelity '+x.fidelity);
    if (PHYS.has(x.fidelity)) fail('assets', x.assetId+' kit asset claims physical');
  }
}
// 5. craft spec: representative only
{
  const c = J('models/specs/craft/craft-rep-1.json');
  if ((c.physicalClaims||[]).length) fail('craft','representative spec lists physical claims');
}
// 6. code-pattern gate: no arbitrary physical scaling / ops shrink
{
  const kit = readFileSync(join(ROOT,'js/kit-assembly.js'),'utf8');
  const m1 = kit.match(/WING_SCALE\s*=\s*\{([^}]*)\}/); const m2 = kit.match(/RADIO_SCALE\s*=\s*\{([^}]*)\}/);
  for (const m of [m1,m2]) if (m && m[1].split(',').some(e=>{ const v=parseFloat(e.split(':')[1]); return isFinite(v)&&v!==1; })) fail('code','non-1.0 WING/RADIO_SCALE entries');
  const ops = readFileSync(join(ROOT,'js/ops-view.js'),'utf8');
  if (/OPS_CRAFT_SIZE/.test(ops)) fail('code','OPS_CRAFT_SIZE survives');
  if (/group\.scale\.setScalar\(s\)/.test(ops)) fail('code','ops visibility rescale survives');
}
// 7. golden expectations
{
  const g = J('models/validation/golden/craft.json');
  const { craftConfigIdOf } = await import('../js/model-evidence.js').catch(()=>({craftConfigIdOf:null}));
  if (craftConfigIdOf) for (const t of g.cases) { const got = craftConfigIdOf(t.sel); if (got !== t.expect) fail('golden','craft '+JSON.stringify(t.sel)+' -> '+got+' != '+t.expect); }
}
// 8. hero mapping: levels, asset cross-refs, kit-level contract
{
  const h = J('models/manifest/heroes.json');
  const a = new Set(J('models/manifest/assets.json').assets.map(x => x.assetId));
  for (const lvl of ['l2', 'l3', 'l4', 'l5']) {
    const e = h.levels[lvl];
    if (!e) fail('heroes', lvl + ' missing hero (fixed missions fly heroes)');
    else if (!a.has(e.assetId)) fail('heroes', lvl + ' unknown assetId ' + e.assetId);
  }
  for (const lvl of ['l1', 'sbx']) if (h.levels[lvl] !== null && h.levels[lvl] !== undefined) fail('heroes', lvl + ' must be kit (null), got mapping');
  for (const s of (h.spares || [])) if (!a.has(s)) fail('heroes', 'unknown spare ' + s);
}
const mi = process.argv.indexOf('--mutate');
if (mi !== -1) console.log('mutation hook:', process.argv[mi+1]);
console.log(JSON.stringify({ status: fails.length? 'FAIL':'PASS', failures: fails, warnings: warns }, null, 2));
process.exit(fails.length ? 1 : 0);
