// OMNIVIGIL land art worker: paints tiles off the main thread and hands the pixels back.
import { makePlanet, paintTile, paintCube, setCities, Planet, Snapshot, CitySnap } from './core';
import './diorama'; // registers the HD Diorama pass on cube tiles

type Msg =
  | { type: 'planet'; snap: Snapshot }
  | { type: 'cities'; key: string; cities: CitySnap[] }
  | { type: 'tile'; id: number; key: string; x0?: number; y0?: number; cells?: number; ppc?: number; face?: number; level?: number; i?: number; j?: number; size?: number };

const planets = new Map<string, Planet>();
self.onmessage = (ev: MessageEvent<Msg>) => {
  const m = ev.data;
  if (m.type === 'planet') { if (!planets.has(m.snap.key)) { planets.clear(); planets.set(m.snap.key, makePlanet(m.snap)); } return; }
  if (m.type === 'cities') { const P = planets.get(m.key); if (P) setCities(P, m.cities); return; }
  if (m.type === 'tile') {
    const P = planets.get(m.key);
    if (!P) { (self as any).postMessage({ type: 'tile', id: m.id, error: 'no planet' }); return; }
    const t = m.face !== undefined ? paintCube(P, m.face, m.level!, m.i!, m.j!, m.size!) : paintTile(P, m.x0!, m.y0!, m.cells!, m.ppc!);
    (self as any).postMessage({ type: 'tile', id: m.id, w: t.w, h: t.h, color: t.color.buffer, emissive: t.emissive.buffer }, [t.color.buffer, t.emissive.buffer]);
  }
};
