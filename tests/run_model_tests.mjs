// Phase 11: golden + mutation tests (node, dependency-free).
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const { checkEvidenceValue, requirePhysical, craftConfigIdOf } = await import('../js/model-evidence.js');
let pass = 0; const ok = (n, f) => { f(); pass++; console.log('ok -', n); };
// schema gates
ok('invalid source-free physical fails', () => assert(checkEvidenceValue({value:1,unit:'m',status:'VERIFIED',sourceRefs:[],configurationId:'X'}).includes('physical-missing-sourceRefs')));
ok('missing unit fails', () => assert(checkEvidenceValue({value:1,status:'VERIFIED',sourceRefs:['S'],configurationId:'X'}).includes('missing-unit')));
ok('DERIVED without formula fails', () => assert(checkEvidenceValue({value:1,unit:'m',status:'DERIVED',sourceRefs:['S'],configurationId:'X'}).includes('derived-missing-formulaRef')));
ok('representative-as-physical blocked', () => assert.throws(() => requirePhysical({value:1,unit:'m',status:'REPRESENTATIVE',sourceRefs:[],claimsPhysical:true}, 't')));
ok('schematic never physical', () => assert.throws(() => requirePhysical({value:2,unit:'m',status:'SCHEMATIC'}, 'glyph')));
// golden resolver determinism
for (const t of J('models/validation/golden/craft.json').cases) ok('golden '+t.expect, () => assert.equal(craftConfigIdOf(t.sel), t.expect));
// LV golden numerics + structure
{
  const lv = J('models/manifest/launch-vehicles.json');
  const get = (id) => lv.vehicles.find(v=>v.configurationId===id);
  ok('SLS height 111.6', () => assert.equal(get('SLS-B1B-CREW').totalHeight.value, 111.6));
  ok('VC4/VC6 counts', () => { assert.equal(get('VC4').boosters.count, 4); assert.equal(get('VC6').boosters.count, 6); });
  ok('AV551 derived fairing', () => assert.equal(get('AV551').fairing.length.status, 'DERIVED'));
  ok('NG split representative', () => assert.equal(get('NG').fairing.length.status, 'REPRESENTATIVE'));
}
// mutation tests: each corruption must be caught by checkEvidenceValue
ok('mut: NaN caught', () => assert(checkEvidenceValue({value:NaN,unit:'m',status:'VERIFIED',sourceRefs:['S'],configurationId:'X'}).length>0));
ok('mut: unit stripped caught', () => assert(checkEvidenceValue({value:1,status:'VERIFIED',sourceRefs:['S'],configurationId:'X'}).includes('missing-unit')));
ok('mut: fidelity flipped to VERIFIED without source caught', () => assert(checkEvidenceValue({value:1,unit:'m',status:'VERIFIED',sourceRefs:[],configurationId:'X'}).length>0));
ok('mut: config removed caught', () => assert(checkEvidenceValue({value:1,unit:'m',status:'VERIFIED',sourceRefs:['S']}).includes('physical-missing-configurationId')));
console.log(`\nPASS ${pass} tests`);
