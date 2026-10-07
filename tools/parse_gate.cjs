// MARGIN JS parse gate — run after every JS edit:
//   node --experimental-vm-modules tools/parse_gate.cjs
// Parses (never executes) every shipped script with V8's real module/script
// grammar. This catches what `node --check` loops miss: export-inside-function
// and brace imbalances that blank whole 3D views at import time in browsers.
// (2026-09-27: `node --check` returned 0 on a template-literal desync that
// vm.SourceTextModule and Chrome both reject — this gate, not --check, is
// the authority. Never gate with --check alone.)
// Exits non-zero on the first failure. Keep the FILES list in sync with
// index.html PLUS the transitive import closure (surface-view broke ops-view
// while listed nowhere — every link in an import chain must appear here).
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'js/orrery.js', 'js/select-viewer.js', 'js/brief-view.js', 'js/ops-view.js', 'js/view3d.js',
  'js/title-earth.js', 'js/solar-system-accuracy.js', 'js/stars-data.js',
  'js/astronomy.js', 'js/astronomy-jpl-data.js', 'game.js',
  'js/surface-view.js', 'js/kit-assembly.js', 'js/launch-view.js',
];
let fail = 0;
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const isModule = /(^|\n)\s*(import|export)\s/m.test(src);
  try {
    if (isModule) new vm.SourceTextModule(src);
    else new vm.Script(src);
    console.log('PARSE_OK ' + f);
  } catch (e) { console.log('PARSE_FAIL ' + f + ': ' + e.message); fail = 1; }
}
process.exit(fail);
