// v1b -> HD Diorama art layer (src/art/landart.ts). The art layer reads a small legacy-shaped
// snapshot (map, cities, factions, species, planet type); this builds it from the v1b state.
import type { State } from '../sim/types';

export function artState(st: State, prev: any): any {
  const cities = st.map.cities.map((c, i) => ({ x: c.x + 0.5, y: c.y + 0.5, pop: c.status === 'ruins' ? 0 : c.pop, status: c.status === 'protected' ? '' : c.status, regionId: i }));
  const regions = st.map.cities.map((c) => ({ owner: c.owner === 'player' ? null : c.owner }));
  const sig = cities.map((c) => c.status + (c.pop >= 12 ? 2 : c.pop >= 2.5 ? 1 : 0) + (regions[c.regionId].owner || '')).join('|');
  const a = prev && prev.seed === st.seed ? prev : { seed: st.seed, planet: 'home', artGen: 0 };
  if (a._sig !== sig) { a._sig = sig; if (prev) a.artGen = (a.artGen || 0) + 1; }
  a.turn = st.turn;
  a.map = { w: st.map.w, h: st.map.h, terrain: st.map.terrain, elev: st.map.elev, cities, regions };
  a.factions = st.factions;
  a.worlds = { home: { species: st.world.species } };
  a.system = { planets: [{ id: 'home', type: st.world.ptype, home: true }] };
  return a;
}
