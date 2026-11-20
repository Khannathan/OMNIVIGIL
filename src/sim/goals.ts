// v1b goals shared by the simulation and the UI: the Earthfall objective and each doctrine's ambition.
import type { State } from './types';

export function cityShare(st: State) {
  const live = st.map.cities.filter((c) => c.status !== 'ruins');
  const mine = live.filter((c) => c.owner === 'player').length;
  return { mine, total: live.length };
}
/** cities you must hold before the Ascension Spire can be built */
export function spireNeed(st: State) {
  const { total } = cityShare(st);
  return st.mode === 'classic' ? Math.ceil(total * 0.75) : Math.min(6, Math.max(4, Math.ceil(total * 0.2)));
}
export function spireUnlocked(st: State) { return cityShare(st).mine >= spireNeed(st) && st.tier >= 3; }

export interface Goal { text: string; have: number; need: number; done: boolean }
export function objective(st: State): Goal {
  const { mine } = cityShare(st), need = spireNeed(st);
  const spire = st.structs.find((s) => s.def === 'v1b_spire' && s.owner === 'player');
  if (st.over && st.over.kind === 'launched') return { text: 'Earthfall complete. Sunreach awaits.', have: 1, need: 1, done: true };
  if (spire) return { text: spire.left > 0 ? `Finish the Ascension Spire (${spire.left} cycles left)` : 'Launch', have: 4 - spire.left, need: 4, done: spire.left <= 0 };
  if (st.tier < 3) return { text: `Hold ${need} cities and reach Tier III, then raise the Ascension Spire`, have: Math.min(mine, need) + st.tier - 1, need: need + 2, done: false };
  return { text: `Hold ${need} cities, then raise the Ascension Spire`, have: Math.min(mine, need), need, done: mine >= need };
}
export function ambition(st: State): Goal {
  const s = st.stats, { mine, total } = cityShare(st);
  const pops = st.map.cities.filter((c) => c.owner === 'player');
  switch (st.ai.doctrine) {
    case 'guardian': { const n = pops.filter((c) => c.status === 'protected').length; return { text: 'Protect 5 cities and never raze one', have: s.razed ? 0 : n, need: 5, done: !s.razed && n >= 5 }; }
    case 'exterminator': return { text: 'Wipe out 3 factions', have: s.destroyedFactions, need: 3, done: s.destroyedFactions >= 3 };
    case 'dominator': { const need = Math.ceil(total * 0.5); return { text: `Rule half the world's cities (${need})`, have: mine, need, done: mine >= need }; }
    case 'infiltrator': return { text: 'Turn 4 cities to your side without a shot', have: s.defected, need: 4, done: s.defected >= 4 };
    case 'machine_god': { const n = st.map.cities.filter((c) => c.devotion >= 70).length; return { text: 'Be worshipped (Devotion 70+) in 5 cities', have: n, need: 5, done: n >= 5 }; }
    case 'assimilator': return { text: 'Assimilate 5 cities into yourself', have: s.assimilated, need: 5, done: s.assimilated >= 5 };
    case 'shepherd': { const p = Math.round(pops.reduce((a, c) => a + c.pop, 0)); return { text: 'Shelter 40 million lives in your cities', have: p, need: 40, done: p >= 40 }; }
    case 'warlord': return { text: 'Win 25 battles', have: s.won, need: 25, done: s.won >= 25 };
    default: return { text: 'Rule a third of the world', have: mine, need: Math.ceil(total / 3), done: mine >= Math.ceil(total / 3) };
  }
}
