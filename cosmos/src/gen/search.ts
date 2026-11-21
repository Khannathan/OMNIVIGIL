// "Find the nearest ..." for any Atlas entry. Because everything is a pure function of the seed,
// search just walks cells outward from where you are, generating as it goes.
import { Camera, Loc } from '../view/camera';
import { BY_ID } from '../atlas/catalog';
import { Galaxy } from './universe';
import { G_SECTOR, G_LUM, G_REGION, U_SUPER, KLY_PER_MPC } from '../core/consts';
import { buildSystem, StarSystem } from './system';
import { StarRef } from './galaxy';

export interface Found { loc: Loc; sel: any; title: string; where: string }
const tick = () => new Promise(r => setTimeout(r, 0));

function* ring(k: number): Generator<[number, number]> {
  if (k === 0) { yield [0, 0]; return; }
  for (let i = -k; i <= k; i++) { yield [i, -k]; yield [i, k]; }
  for (let j = -k + 1; j <= k - 1; j++) { yield [-k, j]; yield [k, j]; }
}
export function locForBody(sys: StarSystem, i: number): Loc {
  const b = sys.bodies[i]; const ref = sys.ref;
  const base = { gal: ref.gal.key, sys: ref.key };
  if (b.kind === 'star' && i === 0) return { ...base, x: 0, y: 0, H: ref.core ? 1.6 : sys.pext * 1.15 };
  if (b.kind === 'belt') return { ...base, x: 0, y: 0, H: (b.a + (b.width || 0)) * 1.15 };
  if (b.kind === 'object' && !b.look) return { ...base, follow: i, x: 0, y: 0, H: Math.max(b.a * 0.05, 0.004) };
  return { ...base, follow: i, x: 0, y: 0, H: b.R * 2.6 };
}
export async function nearestGalaxies(cam: Camera, ux: number, uy: number, n: number, pred: (g: Galaxy) => boolean, maxK = 40): Promise<Galaxy[]> {
  const out: Galaxy[] = []; const cx = Math.floor(ux), cy = Math.floor(uy); let t0 = performance.now();
  for (let k = 0; k <= maxK && out.length < n; k++) {
    for (const [i, j] of ring(k)) for (const g of cam.uni.galaxiesIn(cx + i, cy + j)) if (pred(g)) out.push(g);
    if (performance.now() - t0 > 12) { await tick(); t0 = performance.now(); }
  }
  return out.sort((a, b) => Math.hypot(a.x - ux, a.y - uy) - Math.hypot(b.x - ux, b.y - uy)).slice(0, n);
}

export async function findNearest(cam: Camera, id: string, progress: (s: string) => void, cancel: () => boolean): Promise<Found | null> {
  const e = BY_ID[id]; if (!e) return null;
  const v = cam.views(); const U = v.U;
  if (e.slot === 'ufeat') {
    const sx = Math.floor(U.x / U_SUPER), sy = Math.floor(U.y / U_SUPER);
    for (let k = 0; k < 60; k++) { if (cancel()) return null; progress(`Scanning supercluster cells, ring ${k + 1}`);
      let best: any = null, bd = 1e30;
      for (const [i, j] of ring(k)) for (const f of cam.uni.supercell(sx + i, sy + j)) if (f.e.id === id) { const d = Math.hypot(f.x - U.x, f.y - U.y); if (d < bd) { bd = d; best = f; } }
      if (best) return { loc: { x: best.x, y: best.y, H: Math.max(best.size * 1.4, 4) }, sel: best, title: best.name, where: `${Math.round(bd)} Mpc away` };
      await tick(); }
    return null;
  }
  if (id === 'B142') {
    const g = cam.gal || (await nearestGalaxies(cam, U.x, U.y, 1, g => g.R > 9, 30))[0];
    if (g) { const gg = cam.genFor(g); return { loc: { gal: g.key, sys: gg.coreRef.key, x: 0, y: 0, H: 1.6 }, sel: gg.coreRef, title: gg.coreRef.name, where: g.name }; }
  }
  if (e.slot === 'gattr') {
    const cx = Math.floor(U.x), cy = Math.floor(U.y); let t0 = performance.now();
    for (let k = 0; k < 220; k++) {
      if (cancel()) return null;
      let best: Galaxy | null = null, bd = 1e30;
      for (const [i, j] of ring(k)) for (const g of cam.uni.galaxiesIn(cx + i, cy + j)) if (g.attrs.includes(id) && g.key !== cam.gal?.key) { const d = Math.hypot(g.x - U.x, g.y - U.y); if (d < bd) { bd = d; best = g; } }
      if (best) return { loc: { x: best.x, y: best.y, H: best.Rm * 1.9 }, sel: best, title: best.name, where: `${bd.toFixed(1)} Mpc away` };
      if (performance.now() - t0 > 14) { progress(`Scanning galaxies ${k} Mpc out`); await tick(); t0 = performance.now(); }
    }
    return null;
  }
  // galaxy-scale and system-scale entries: search the current galaxy first, then neighbours
  const gals: Galaxy[] = [];
  if (cam.gal) gals.push(cam.gal);
  const more = await nearestGalaxies(cam, U.x, U.y, 8, g => g.R > 9 && g.key !== cam.gal?.key, 30);
  gals.push(...more);
  let budget = e.slot === 'gfeat' ? 1e9 : 260000; let scanned = 0;
  for (const g of gals) {
    if (cancel()) return null;
    const gg = cam.genFor(g);
    const here = cam.gal && g.key === cam.gal.key; const pv = here ? v.G! : { x: g.R * 0.5, y: 0 };
    if (id === 'B142') return { loc: { gal: g.key, sys: gg.coreRef.key, x: 0, y: 0, H: 1.6 }, sel: gg.coreRef, title: gg.coreRef.name, where: g.name };
    if (e.slot === 'gfeat') {
      const rx = Math.floor(pv.x / G_REGION), ry = Math.floor(pv.y / G_REGION); const K = Math.ceil(g.R * 1.6 / G_REGION) + 2;
      for (let k = 0; k <= K * 2; k++) {
        let best: any = null, bd = 1e30;
        for (const [i, j] of ring(k)) for (const f of gg.region(rx + i, ry + j)) if (f.e.id === id) { const d = Math.hypot(f.x - pv.x, f.y - pv.y); if (d < bd) { bd = d; best = f; } }
        if (best) return { loc: { gal: g.key, x: best.x, y: best.y, H: Math.max(best.size * 1.6, 0.2) }, sel: best, title: best.name, where: g.name };
      }
      progress(`Nothing in ${g.name}, trying the next galaxy`); await tick(); continue;
    }
    // systems: walk luminous and ordinary sectors outward
    const lumOnly = e.slot === 'star' && /giant|Wolf|Carbon|Cepheid|straggler|Quasi|Thorne|binary|Trinary|Protostar|remnant|nebula|Tabby|Przyb|Dark star|Strange|Intermediate/i.test(e.name);
    const lats: [number, number][] = lumOnly ? [[1, G_LUM], [0, G_SECTOR]] : [[0, G_SECTOR], [1, G_LUM]];
    for (const [lat, Sz] of lats) {
      const sx = Math.floor(pv.x / Sz), sy = Math.floor(pv.y / Sz); const K = Math.ceil(g.R * 1.5 / Sz);
      let t0 = performance.now(); let localBudget = lat === 0 ? budget : Math.min(budget, 40000);
      for (let k = 0; k <= K; k++) {
        if (cancel()) return null;
        for (const [i, j] of ring(k)) {
          for (const s of gg.sector(lat, sx + i, sy + j)) {
            scanned++; localBudget--;
            let hit = -1; let sys: StarSystem | null = null;
            if (e.slot === 'star') { if (s.e.id === id) hit = 0; }
            else { sys = buildSystem(s); if (sys.entries.has(id)) { hit = sys.bodies.findIndex(b => b.e.id === id); if (hit < 0) hit = -2; } }
            if (hit !== -1) {
              const fs = buildSystem(s);
              const loc = hit >= 0 ? locForBody(fs, hit) : { gal: g.key, sys: s.key, x: 0, y: 0, H: fs.pext * 1.15 };
              return { loc, sel: hit >= 0 ? { sysKey: s.key, idx: hit } : s, title: hit > 0 ? fs.bodies[hit].name : s.name, where: `${s.name} system, ${g.name}` };
            }
          }
        }
        if (localBudget <= 0) break;
        if (performance.now() - t0 > 14) { progress(`Scanned ${scanned.toLocaleString('en-US')} systems in ${g.name}`); await tick(); t0 = performance.now(); }
      }
      budget = Math.max(15000, budget - scanned);
    }
    progress(`Not in ${g.name}, trying the next galaxy`); await tick();
  }
  return null;
}
export type { StarRef };
void KLY_PER_MPC;
