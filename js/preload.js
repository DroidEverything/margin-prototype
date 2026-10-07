/* MARGIN asset warm pass (js/preload.js) — presentation only.
   Walks the SAME session-cached loaders the scenes use (kit tiers, hero,
   rover, lander promise, planet textures, Bennu) so assets arrive during the
   long countdown+ascent window instead of popping mid-cinematic. Fire-and-
   forget: every step guarded, never throws, never blocks liftoff. Reads game
   state read-only (bare globals via scope chain with typeof guards). */
import {
  KIT, loadKitGltf, heroForLevel, loadRoverGltf,
  bodyTierOf, wingTierOf, radioTierOf
} from './kit-assembly.js';
import { tex, dataTex, bennuModel } from './orrery.js';

function imgWarm(url) {
  try { const im = new Image(); im.src = url; } catch (e) {}
}

export function warmForLaunch() {
  try {
    const S = (typeof S !== 'undefined') ? S : null;
    if (!S) return;
    const sel = {
      n: ((S.instruments) || []).length,
      power: S.power || '', comms: S.comms || '', prop: S.prop || '',
      instr: ((S.instruments) || []).slice(0, 12), level: S.levelId || ''
    };
    // Craft chain (all session-cached: later mounts hit cache, never network).
    try {
      const urls = [KIT.bodies[bodyTierOf(sel)], KIT.wings[wingTierOf(sel)],
        KIT.radios[radioTierOf(sel)]];
      urls.forEach(u => { try { loadKitGltf(u).catch(() => {}); } catch (e) {} });
      const hero = heroForLevel(sel.level);
      if (hero && hero.url) { try { loadKitGltf(hero.url).catch(() => {}); } catch (e) {} }
      try { loadRoverGltf().catch(() => {}); } catch (e) {}
    } catch (e) {}
    // Bodies: earth set + target + translunar context + sky (texture caches).
    try {
      let body = 'mars';
      try {
        if (typeof LEVELS !== 'undefined' && typeof byId === 'function')
          body = (byId(LEVELS, S.levelId) || {}).body || 'mars';
      } catch (e) {}
      ['earth', 'earthNight', 'earthClouds', 'moon', body, 'hipparcos'].forEach(k => {
        try { tex(k); } catch (e) {}
      });
      try { dataTex('earthRough'); } catch (e) {}
      if (S.levelId === 'l4') { try { bennuModel('present').catch(() => {}); } catch (e) {} }
    } catch (e) {}
    // Sky spheres load raw per scene — browser-cache warm only (http(s)).
    try { imgWarm('assets/textures/stars_8k.jpg'); } catch (e) {}
    // Lander (L2) through ops-view so the SAME promise feeds the descent.
    if (sel.level === 'l2') {
      try {
        import('./ops-view.js').then(m => {
          try { if (m && m.OpsView && m.OpsView.dzPreload) m.OpsView.dzPreload(); } catch (e) {}
        }).catch(() => {});
      } catch (e) {}
    }
  } catch (e) {}
}
