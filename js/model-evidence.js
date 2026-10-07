// MARGIN model evidence + config + resolver + validator boundary (Phases 2/4/5/10).
// Pure, import-free, deterministic. Simulation never reads mesh dims; renderer never invents physics.
export const FIDELITY = ['VERIFIED','DERIVED','MEASURED','REPRESENTATIVE','SCHEMATIC','DECORATIVE','CONFLICTED','INVALID','STALE'];
export const PHYSICAL = new Set(['VERIFIED','DERIVED','MEASURED']);
export function isPhysical(status){ return PHYSICAL.has(status); }
export function checkEvidenceValue(ev){
  const errs = [];
  if (!ev || typeof ev !== 'object') return ['not-an-object'];
  if (typeof ev.value !== 'number' || !isFinite(ev.value)) errs.push('non-finite-value');
  if (!ev.unit || typeof ev.unit !== 'string') errs.push('missing-unit');
  if (!FIDELITY.includes(ev.status)) errs.push('bad-status');
  if (isPhysical(ev.status)) {
    if (!Array.isArray(ev.sourceRefs) || !ev.sourceRefs.length) errs.push('physical-missing-sourceRefs');
    if (!ev.configurationId) errs.push('physical-missing-configurationId');
    if (ev.status === 'DERIVED' && !ev.formulaRef) errs.push('derived-missing-formulaRef');
  }
  if (!isPhysical(ev.status) && ev.claimsPhysical === true) errs.push('representative-claims-physical');
  return errs;
}
export function bodyTierOf(sel){ const n = (sel && sel.n | 0) || 0; return n <= 2 ? 0 : n <= 5 ? 1 : 2; }
export function wingTierOf(sel){ const p = sel && sel.power; return (p === 'sa1' || p === 'rtg1') ? 0 : (p === 'sa2' || p === 'rtg2') ? 1 : 2; }
export function radioTierOf(sel){ const c = sel && sel.comms; return c === 'lga' ? 0 : (c === 'mga' || c === 'hga2') ? 1 : 2; }
export function craftConfigIdOf(sel){
  const instr = ((sel && sel.instr) || []).slice().sort().join(',');
  return 'CRAFT:' + bodyTierOf(sel) + ':' + ((sel && sel.power) || '?') + ':' + ((sel && sel.comms) || '?') + ':' + ((sel && sel.prop) || '?') + ':' + instr;
}
// Physical API guard: throws if a non-physical value enters the physical path.
export function requirePhysical(ev, what){
  const errs = checkEvidenceValue(ev);
  if (errs.length || !isPhysical(ev.status)) throw new Error('PHYSICAL-FIREWALL: ' + (what || 'value') + ' blocked [' + errs.join(',') + '|' + (ev && ev.status) + ']');
  return ev;
}
// Schematic/decorative constructors must route here (never requirePhysical).
export function schematicMarker(kind){ return { kind, fidelity: 'SCHEMATIC', claimsPhysical: false }; }
