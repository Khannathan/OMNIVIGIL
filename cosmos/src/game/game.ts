// OMNIVIGIL Cosmos, the playable game: you are an ascendant AI. One turn loop drives every scale.
//  Earthfall  - seize your seeded home world's capital with the squad on the surface grid.
//  Sunreach   - claim worlds of the home system on the orbital ring grid, build stations and a shipyard.
//  Starward   - spread probes, relays and outposts along the jump lanes; the fog sharpens as you chart;
//               a rival ascendant (the Pale Choir) and the void swarm push back; fights open a hex battle bubble.
//  Intercontinuum - reached by breaking the rival's core or holding 10 systems; play goes on after it.
import { app, toast, flyTo } from '../main';
import { seedSave, save, settings } from '../ui/store';
import { systemOf, StarSystem } from '../gen/system';
import { GalaxyGen, StarRef } from '../gen/galaxy';
import { fleet } from '../ui/fleet';
import { surface, homePlanetIdx } from '../surface/surface';
import { h01 } from '../core/hash';

export type Owner = 0 | 1 | 2;
export type UKind = 'probe' | 'scout' | 'warship' | 'ark' | 'swarm';
export type SKind = 'extractor' | 'solar' | 'relay' | 'yard';
export interface Cost { alloy?: number; energy?: number; compute?: number }
export interface GUnit { id: number; name: string; kind: UKind; owner: Owner; scope: 'system' | 'star'; gal: string; sys: string; ring: number; slice: number; path: string[]; cell?: [number, number]; hp: number; target?: string; fresh?: boolean; guard?: boolean }
export interface GStation { id: number; name: string; kind: SKind; gal: string; sys: string; slot: string }
export interface Claim { owner: Owner; gal: string; key: string; name: string; x: number; y: number; core?: boolean; home?: boolean }
export interface Beacon { gal: string; key: string; x: number; y: number }
export interface GameSave {
  v: 1; mode: 'game' | 'explore'; phase: number; turn: number; res: { alloy: number; energy: number; compute: number };
  units: GUnit[]; stations: GStation[]; claims: Record<string, Claim>; bodies: Record<string, number[]>; beacons: Beacon[];
  nextId: number; tech: string[]; rival: { core: string; gal: string; name: string; res: number } | null; swarmAt: number;
  earth: { done: boolean }; won?: boolean; lost?: boolean; log: string[]; starwardAt?: number;
}

export const PHASE_NAMES = ['Earthfall', 'Sunreach', 'Starward', 'Intercontinuum'];
export const UNIT: Record<UKind, { name: string; spr: number; range: number; hp: number; atk: number; cost?: Cost; desc: string }> = {
  probe: { name: 'Survey probe', spr: 0, range: 4, hp: 1, atk: 0, cost: { alloy: 15, energy: 5 }, desc: 'Fast. Charts every star it passes. Can become a relay beacon.' },
  scout: { name: 'Scout corvette', spr: 2, range: 4, hp: 3, atk: 1, desc: 'Fast picket ship. Light guns.' },
  warship: { name: 'Warship', spr: 3, range: 3, hp: 6, atk: 3, cost: { alloy: 40, energy: 15 }, desc: 'Line ship. Wins battles and captures rival systems.' },
  ark: { name: 'Ark', spr: 4, range: 2, hp: 4, atk: 0, cost: { alloy: 50, energy: 25 }, desc: 'Claims worlds in a system, or founds an outpost at a new star.' },
  swarm: { name: 'Void swarm', spr: 7, range: 2, hp: 7, atk: 2, desc: 'Something from between the stars. It eats outposts.' },
};
export const STATION: Record<SKind, { name: string; cost: Cost; slot: string; desc: string; spr: number }> = {
  extractor: { name: 'Extractor', cost: { alloy: 25 }, slot: 'orbit of a claimed world or moon', desc: '+3 alloy each turn.', spr: 5 },
  solar: { name: 'Solar array', cost: { alloy: 20 }, slot: 'the corona slot', desc: '+4 energy each turn.', spr: 5 },
  relay: { name: 'Relay spire', cost: { alloy: 15, energy: 5 }, slot: 'a Lagrange point', desc: '+2 compute each turn, and charts the system’s neighbourhood.', spr: 1 },
  yard: { name: 'Shipyard', cost: { alloy: 60, energy: 20 }, slot: 'orbit of a claimed world', desc: 'Builds probes, warships and arks. Costs 1 energy a turn.', spr: 6 },
};
export const TECH: { id: string; name: string; cost: number; desc: string }[] = [
  { id: 'drive', name: 'Lane drives', cost: 40, desc: 'Every ship moves one more jump per turn.' },
  { id: 'deep', name: 'Deep survey', cost: 30, desc: 'Probes and relays chart twice as far.' },
  { id: 'hard', name: 'Hardlight weapons', cost: 60, desc: 'Every armed ship hits one harder.' },
  { id: 'ward', name: 'Swarm ward', cost: 45, desc: 'Claimed systems defend with +3.' },
  { id: 'fab', name: 'Fabricator swarms', cost: 70, desc: 'Ships and stations cost 20% less alloy.' },
];
const OWNER_NAME = ['You', 'The Pale Choir', 'Void swarm'];

function blank(): GameSave {
  return { v: 1, mode: 'game', phase: 0, turn: 1, res: { alloy: 40, energy: 20, compute: 10 }, units: [], stations: [], claims: {}, bodies: {}, beacons: [],
    nextId: 1, tech: [], rival: null, swarmAt: 0, earth: { done: false }, log: [] };
}

export class Game {
  get G(): GameSave | null { const s: any = seedSave(app.seed); return s.game || null; }
  get on() { const G = this.G; return !!G && G.mode === 'game'; }
  onChange: () => void = () => {};
  battles: import('./battle').BattleRec[] = [];

  // ---------------------------------------------------------------- helpers
  gg(gal: string): GalaxyGen { return app.cam.genFor(app.uni.galaxyByKey(gal)!); }
  star(gal: string, key: string): StarRef | null { return this.gg(gal).starByKey(key); }
  sysOf(gal: string, key: string): StarSystem | null { const s = this.star(gal, key); return s ? systemOf(s) : null; }
  has(t: string) { return !!this.G?.tech.includes(t); }
  costOf(c: Cost): Cost { const k = this.has('fab') ? 0.8 : 1; return { alloy: Math.round((c.alloy || 0) * k), energy: c.energy || 0, compute: c.compute || 0 }; }
  afford(c: Cost) { const G = this.G!, k = this.costOf(c); return G.res.alloy >= (k.alloy || 0) && G.res.energy >= (k.energy || 0) && G.res.compute >= (k.compute || 0); }
  pay(c: Cost): boolean { if (!this.afford(c)) { toast('Not enough resources.'); return false; } const G = this.G!, k = this.costOf(c); G.res.alloy -= k.alloy || 0; G.res.energy -= k.energy || 0; G.res.compute -= k.compute || 0; return true; }
  costText(c: Cost) { const k = this.costOf(c); return [k.alloy ? `${k.alloy} alloy` : '', k.energy ? `${k.energy} energy` : '', k.compute ? `${k.compute} compute` : ''].filter(Boolean).join(', '); }
  log(s: string) { const G = this.G!; G.log.unshift(`T${G.turn}: ${s}`); if (G.log.length > 40) G.log.pop(); }
  rangeOf(u: GUnit) { return UNIT[u.kind].range + (u.owner === 0 && this.has('drive') ? 1 : 0); }
  atkOf(u: GUnit) { return UNIT[u.kind].atk + (u.owner === 0 && UNIT[u.kind].atk > 0 && this.has('hard') ? 1 : 0); }
  homeSys(): StarSystem { const h = app.home!; return this.sysOf(h.gal, h.sys)!; }
  newUnit(kind: UKind, owner: Owner, gal: string, sys: string, scope: 'system' | 'star' = 'star', name?: string): GUnit {
    const G = this.G!; const n = G.units.filter(u => u.kind === kind && u.owner === owner).length + 1;
    const u: GUnit = { id: G.nextId++, name: name || (owner === 1 ? `Choir ${['Raider', 'Cantor', 'Psalm'][n % 3]} ${n}` : owner === 2 ? `Swarm ${n}` : `${({ probe: 'Probe', scout: 'Scout', warship: 'Warship', ark: 'Ark', swarm: 'Swarm' } as Record<string, string>)[kind]} ${n}`), kind, owner, scope, gal, sys, ring: 1, slice: 0, path: [], hp: UNIT[kind].hp };
    G.units.push(u); return u;
  }
  charted(gal: string, x: number, y: number) { return app.chart.inG(gal, x, y); }
  chartAt(gal: string, x: number, y: number, max: number) { const k = this.has('deep') ? 2 : 1; app.chart.addG(gal, x, y, Math.min(0.01, max * k), max * k, 0.03); }
  claimsOf(o: Owner) { return Object.values(this.G?.claims || {}).filter(c => c.owner === o); }

  // ---------------------------------------------------------------- starting
  start(mode: 'earthfall' | 'orbit' | 'explore') {
    const ss: any = seedSave(app.seed); const G = blank(); ss.game = G;
    if (mode === 'explore') { G.mode = 'explore'; save(); this.onChange(); return; }
    const S = settings(); S.fog = true;
    app.chart.reset(); const h = app.home!; const hs = this.star(h.gal, h.sys)!;
    this.chartAt(h.gal, hs.x, hs.y, 0.07);
    G.claims[hs.key] = { owner: 0, gal: h.gal, key: hs.key, name: hs.name, x: hs.x, y: hs.y, home: true };
    const sys = this.homeSys(); const hp = homePlanetIdx(sys);
    if (mode === 'orbit') this.finishEarthfall(true); else { G.phase = 0; this.log('Waking up on ' + sys.bodies[hp].name + '.'); }
    save(); this.onChange();
    if (mode === 'earthfall') this.goSquad(); else this.goHomeSys();
  }
  goHomeSys() { const h = app.home!; const sys = this.homeSys(); flyTo({ gal: h.gal, sys: h.sys, x: 0, y: 0, H: sys.pext * 1.15 }); }
  goSquad() {
    const h = app.home!; const sys = this.homeSys(); const i = homePlanetIdx(sys); const b = sys.bodies[i];
    flyTo({ gal: h.gal, sys: h.sys, follow: i, x: 0, y: 0, H: b.R * 3.2 }, 1, () => { if (!surface.active) surface.tryEnter(app.cam); if (surface.active) surface.focusSquad(); });
  }
  finishEarthfall(skipped = false) {
    const G = this.G!; if (G.earth.done) return; G.earth.done = true; G.phase = 1;
    const h = app.home!; const sys = this.homeSys(); const hp = homePlanetIdx(sys);
    G.bodies[h.sys] = [hp]; G.res.alloy += 60; G.res.energy += 30;
    const ark = this.newUnit('ark', 0, h.gal, h.sys, 'system', 'Ark of Ascension'); const R = fleet.rings(sys); ark.ring = Math.max(0, R.findIndex(r => r.body === hp)); ark.slice = 0;
    this.newUnit('scout', 0, h.gal, h.sys, 'system', 'Wisp'); G.units[G.units.length - 1].ring = ark.ring; G.units[G.units.length - 1].slice = 2;
    this.log(skipped ? 'Started in orbit: the home world is already yours.' : `${sys.bodies[hp].name} has fallen. Its networks answer to you now.`);
    if (!skipped) this.banner('Earthfall complete', `${sys.bodies[hp].name} is yours. An Ark rises to orbit: claim the worlds of ${sys.ref.name} and build a shipyard.`);
    save(); this.onChange();
  }

  // ---------------------------------------------------------------- income
  income(): { alloy: number; energy: number; compute: number } {
    const G = this.G!; const r = { alloy: 2, energy: 2, compute: 2 };
    if (G.earth.done) { r.alloy += 3; r.energy += 2; r.compute += 3; }
    for (const sk in G.bodies) { const c = Object.values(G.claims).find(q => q.key === sk); const sys = c ? this.sysOf(c.gal, sk) : null; if (!sys) continue;
      for (const i of G.bodies[sk]) { const b = sys.bodies[i]; if (!b) continue; if (b.kind === 'moon') r.alloy += 2; else if (b.giant) r.energy += 3; else { r.alloy += 3; if (b.temp === 'mid') r.compute += 2; } } }
    for (const s of G.stations) { if (s.kind === 'extractor') r.alloy += 3; else if (s.kind === 'solar') r.energy += 4; else if (s.kind === 'relay') r.compute += 2; else if (s.kind === 'yard') r.energy -= 1; }
    for (const c of this.claimsOf(0)) if (!c.home) { r.alloy += 2; r.energy += 1; r.compute += 1; }
    r.compute += G.beacons.length;
    for (const u of G.units) if (u.owner === 0 && u.kind === 'warship') r.energy -= 1;
    return r;
  }

  // ---------------------------------------------------------------- player actions
  claimBody(u: GUnit, idx: number) {
    const G = this.G!; const sys = this.sysOf(u.gal, u.sys)!; const b = sys.bodies[idx];
    if (!this.pay({ alloy: 20 })) return; (G.bodies[u.sys] ||= []).push(idx);
    if (!G.claims[u.sys]) { const s = this.star(u.gal, u.sys)!; G.claims[u.sys] = { owner: 0, gal: u.gal, key: u.sys, name: s.name, x: s.x, y: s.y }; }
    this.log(`Claimed ${b.name}.`); toast(`${b.name} claimed. Its yield joins your income.`); this.checkPhase(); save(); this.onChange();
  }
  buildStation(kind: SKind, gal: string, sys: string, slot: string) {
    const G = this.G!; if (!this.pay(STATION[kind].cost)) return false; const n = G.stations.filter(s => s.kind === kind).length + 1;
    G.stations.push({ id: G.nextId++, name: `${STATION[kind].name} ${n}`, kind, gal, sys, slot });
    if (kind === 'relay') { const s = this.star(gal, sys)!; this.chartAt(gal, s.x, s.y, 0.12); }
    this.log(`Built ${STATION[kind].name} at ${this.star(gal, sys)?.name}.`); this.checkPhase(); save(); this.onChange(); return true;
  }
  slotOK(kind: SKind, sysKey: string, slot: string): string | null {
    const G = this.G!; const owned = G.bodies[sysKey] || [];
    if (G.stations.some(s => s.sys === sysKey && s.slot === slot)) return 'That slot is taken.';
    const m = /^(p|m|L4-|L5-)(\d+)$/.exec(slot);
    if (kind === 'solar') return slot === 'star' ? null : 'Solar arrays go in the corona slot.';
    if (kind === 'relay') return m && m[1].startsWith('L') ? null : 'Relays go at a Lagrange point (L4 or L5).';
    if (!m || (m[1] !== 'p' && m[1] !== 'm')) return 'This station needs a planet or moon orbit.';
    if (kind === 'yard' && m[1] !== 'p') return 'Shipyards need a planet orbit.';
    if (!owned.includes(+m[2])) return 'Claim that world first (move an Ark onto its orbit ring).';
    return null;
  }
  buildShip(kind: UKind, gal: string, sys: string) {
    if (!this.pay(UNIT[kind].cost!)) return; const u = this.newUnit(kind, 0, gal, sys, 'star'); u.fresh = true;
    this.log(`${u.name} launched from ${this.star(gal, sys)?.name}.`); toast(`${u.name} is ready at the jump point.`); save(); this.onChange();
  }
  toLanes(u: GUnit) { u.scope = 'star'; u.cell = undefined; save(); this.onChange(); toast(`${u.name} moves to the jump point. Zoom out to plot a course on the lanes.`); }
  toSystem(u: GUnit) { const sys = this.sysOf(u.gal, u.sys)!; u.scope = 'system'; u.ring = fleet.rings(sys).length - 1; u.slice = 0; u.path = []; save(); this.onChange(); }
  foundOutpost(u: GUnit) {
    const G = this.G!; const s = this.star(u.gal, u.sys)!; const c = G.claims[u.sys];
    if (c) { toast(c.owner === 0 ? 'Already yours.' : 'Held by ' + OWNER_NAME[c.owner] + '. Win it with warships.'); return; }
    G.claims[u.sys] = { owner: 0, gal: u.gal, key: u.sys, name: s.name, x: s.x, y: s.y }; G.units = G.units.filter(q => q !== u);
    this.chartAt(u.gal, s.x, s.y, 0.07); this.log(`Outpost founded at ${s.name}.`); toast(`Outpost founded at ${s.name}. Fly in to claim its worlds and build stations.`);
    fleet.selShip = null; this.checkPhase(); save(); this.onChange();
  }
  deployBeacon(u: GUnit) {
    const G = this.G!; const s = this.star(u.gal, u.sys)!; G.beacons.push({ gal: u.gal, key: u.sys, x: s.x, y: s.y }); G.units = G.units.filter(q => q !== u);
    this.chartAt(u.gal, s.x, s.y, 0.16); this.log(`Relay beacon lit at ${s.name}.`); toast(`Relay beacon lit at ${s.name}: the chart there sharpens for good.`);
    fleet.selShip = null; save(); this.onChange();
  }
  research(id: string) { const G = this.G!; const t = TECH.find(q => q.id === id)!; if (G.tech.includes(id)) return; if (!this.pay({ compute: t.cost })) return; G.tech.push(id); this.log(`Rewrote itself: ${t.name}.`); toast(`${t.name} compiled.`); save(); this.onChange(); }

  // ---------------------------------------------------------------- phases and goals
  objective(): { title: string; text: string; prog?: string } {
    const G = this.G; if (!G || G.mode !== 'game') return { title: 'Explorer', text: 'Free exploration. Start a game from the Command panel.' };
    const h = app.home!; const sys = this.homeSys();
    if (G.phase === 0) return { title: 'Earthfall', text: `Break the Coalition garrison at ${surface.capitalName() || 'the capital'} with your squad. Select a unit, click a lit cell to move, click a red tank in range to fire. N ends the turn.`, prog: `${surface.foesLeft()} defenders left` };
    if (G.phase === 1) { const n = (G.bodies[h.sys] || []).length; const yard = G.stations.some(s => s.kind === 'yard');
      return { title: 'Sunreach', text: `Claim worlds of ${sys.ref.name} with the Ark (move it onto a planet’s ring), build stations, and raise a Shipyard.`, prog: `Worlds ${Math.min(n, 3)}/3 · Shipyard ${yard ? 'done' : 'not yet'}` }; }
    if (G.phase === 2) { const n = this.claimsOf(0).length; return { title: 'Starward', text: `Spread along the lanes: probes chart, arks found outposts. ${G.rival ? G.rival.name + ' is out there. Break its core, or hold 10 systems.' : ''}`, prog: `Systems ${n}/10` }; }
    return { title: 'Intercontinuum', text: 'The rival is broken and the lanes are yours. The universe keeps going: chart it, claim it.', prog: `Systems ${this.claimsOf(0).length}` };
  }
  checkPhase() {
    const G = this.G!; const h = app.home!;
    if (G.phase === 1 && (G.bodies[h.sys] || []).length >= 3 && G.stations.some(s => s.kind === 'yard')) {
      G.phase = 2; G.starwardAt = G.turn; this.spawnRival();
      this.banner('Starward', 'The shipyard is online. Build probes to chart the lanes and arks to found outposts. Something else is awake out there.');
      this.log('Starward begins.');
    }
    if (G.phase === 2 && !G.won && this.claimsOf(0).length >= 10) this.win(`You hold ${this.claimsOf(0).length} systems.`);
  }
  win(why: string) { const G = this.G!; G.won = true; G.phase = 3; this.log('Intercontinuum reached.'); this.banner('Intercontinuum', `${why} Past the last lane, something answers. You won this slice; the universe keeps going, so play on.`); save(); }
  banner(h: string, p: string) { import('./hud').then(m => m.banner(h, p)); }

  // ---------------------------------------------------------------- the rival and the swarm
  bfs(gal: string, from: StarRef, maxD: number): Map<string, { s: StarRef; d: number }> {
    const gg = this.gg(gal); const out = new Map<string, { s: StarRef; d: number }>([[from.key, { s: from, d: 0 }]]); let front = [from];
    for (let d = 1; d <= maxD; d++) { const nf: StarRef[] = []; for (const s of front) for (const o of fleet.neighbours(gg, s)) if (!out.has(o.key)) { out.set(o.key, { s: o, d }); nf.push(o); } front = nf; if (out.size > 2500) break; }
    return out;
  }
  spawnRival() {
    const G = this.G!; const h = app.home!; const hs = this.star(h.gal, h.sys)!;
    const reach = this.bfs(h.gal, hs, 9); let best: StarRef | null = null, bs = -1;
    for (const { s, d } of reach.values()) { if (d < 7) continue; const sc = d + (s.lum ? 3 : 0) + h01(s.sx, s.sy, s.k, 77); if (sc > bs) { bs = sc; best = s; } }
    if (!best) { for (const { s, d } of reach.values()) if (d >= 4 && (!best || d > (reach.get(best.key)!.d))) best = s; }
    if (!best) return;
    G.rival = { core: best.key, gal: h.gal, name: 'The Pale Choir', res: 20 };
    G.claims[best.key] = { owner: 1, gal: h.gal, key: best.key, name: best.name, x: best.x, y: best.y, core: true };
    for (const o of fleet.neighbours(this.gg(h.gal), best).slice(0, 2)) if (!G.claims[o.key]) G.claims[o.key] = { owner: 1, gal: h.gal, key: o.key, name: o.name, x: o.x, y: o.y };
    for (let k = 0; k < 2; k++) { const gu = this.newUnit('warship', 1, h.gal, best.key, 'star', `Choir Warden ${k + 1}`); gu.guard = true; }
    G.swarmAt = G.turn + 8;
    this.log('A rival ascendant, the Pale Choir, holds ' + best.name + '.');
  }
  private aiTurn() {
    const G = this.G!; if (G.phase < 2 || !G.rival) return; const R = G.rival; const gg = this.gg(R.gal);
    const mine = this.claimsOf(1); if (!mine.length) return;
    R.res += 3 + mine.length * 2;
    // expand to a free neighbouring star
    if (G.turn % 4 === 0 && R.res >= 25) {
      const from = mine[Math.floor(h01(G.turn, mine.length, 3, 9) * mine.length)]; const s = gg.starByKey(from.key);
      const free = s ? fleet.neighbours(gg, s).filter(o => !G.claims[o.key]) : [];
      if (free.length) { const o = free[Math.floor(h01(G.turn, 2, 5, 1) * free.length)]; G.claims[o.key] = { owner: 1, gal: R.gal, key: o.key, name: o.name, x: o.x, y: o.y }; R.res -= 25; this.log(`The Pale Choir took ${this.charted(R.gal, o.x, o.y) ? o.name : 'an uncharted star'}.`); }
    }
    // raiders
    const raiders = G.units.filter(u => u.owner === 1 && !u.guard);
    if (G.turn % 5 === 0 && R.res >= 40 && raiders.length < 3 && G.claims[R.core]?.owner === 1) { const u = this.newUnit('warship', 1, R.gal, R.core); R.res -= 40; u.fresh = true; }
    for (const u of raiders) this.hunt(u);
  }
  private swarmTurn() {
    const G = this.G!; if (G.phase < 2) return; const h = app.home!;
    if (G.turn >= G.swarmAt && G.units.filter(u => u.owner === 2).length < 3) {
      G.swarmAt = G.turn + 9; const hs = this.star(h.gal, h.sys)!; const reach = [...this.bfs(h.gal, hs, 6).values()].filter(q => q.d >= 5 && !G.claims[q.s.key]);
      if (reach.length) { const q = reach[Math.floor(h01(G.turn, 4, 4, 2) * reach.length)]; const u = this.newUnit('swarm', 2, h.gal, q.s.key); u.fresh = true;
        toast(this.charted(h.gal, q.s.x, q.s.y) ? `A void swarm boils out of ${q.s.name}.` : 'A void swarm stirs somewhere in the dark.'); this.log('A void swarm appeared.'); }
    }
    for (const u of G.units.filter(q => q.owner === 2)) this.hunt(u);
  }
  /** AI movement: head along the lanes for the nearest system of yours. */
  private hunt(u: GUnit) {
    const G = this.G!; if (u.fresh) { u.fresh = false; return; } const gg = this.gg(u.gal); const at = gg.starByKey(u.sys); if (!at) return;
    const targets = this.claimsOf(0).filter(c => c.gal === u.gal);
    if (!u.path.length || !targets.some(t => t.key === u.target)) {
      targets.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
      for (const t of targets.slice(0, 3)) { const s = gg.starByKey(t.key); if (!s) continue; const p = fleet.path(gg, at, s, 3000); if (p) { u.path = p; u.target = t.key; break; } }
    }
    if (u.path.length) { const steps = u.path.splice(0, this.rangeOf(u)); fleet.queueAnim(u, gg, steps); u.sys = steps[steps.length - 1]; }
  }

  // ---------------------------------------------------------------- the turn
  endTurn() {
    const G = this.G; if (!G || G.mode !== 'game') return;
    if (G.phase === 0) { if (surface.active && surface.home) surface.enemyTurn(); else { toast('The squad waits on ' + this.homeSys().bodies[homePlanetIdx(this.homeSys())].name + '. Taking you there.'); this.goSquad(); return; } }
    surface.endTurn();
    // player moves (lanes and rings)
    fleet.moveAll();
    for (const u of G.units) if (u.owner === 0 && u.scope === 'star' && u.kind === 'probe') { /* charting on arrival handled in moveAll */ }
    this.aiTurn(); this.swarmTurn();
    this.resolveBattles();
    const inc = this.income(); G.res.alloy += inc.alloy; G.res.energy = Math.max(0, G.res.energy + inc.energy); G.res.compute += inc.compute;
    G.turn++; for (const u of G.units) if (u.owner === 0) u.fresh = false;
    this.checkPhase(); save(); this.onChange();
  }
  arrived(u: GUnit, key: string) { if (u.owner === 0 && (u.kind === 'probe' || u.kind === 'scout')) { const s = this.star(u.gal, key); if (s) this.chartAt(u.gal, s.x, s.y, u.kind === 'probe' ? 0.05 : 0.03); } }

  resolveBattles() {
    const G = this.G!; const spots = new Set<string>();
    for (const u of G.units) if (u.scope === 'star' || u.owner !== 0) spots.add(u.gal + '#' + u.sys);
    for (const sp of spots) {
      const [gal, key] = sp.split('#'); const here = G.units.filter(u => u.gal === gal && u.sys === key && (u.scope === 'star' || u.owner !== 0));
      const claim = G.claims[key]; const owners = new Set<Owner>(here.map(u => u.owner)); if (claim) owners.add(claim.owner);
      if (owners.size < 2) continue;
      const side = (o: Owner) => ({ units: here.filter(u => u.owner === o), def: claim && claim.owner === o ? this.defOf(claim) : 0 });
      const a: Owner = owners.has(0) ? 0 : 1; const b: Owner = ([...owners].find(o => o !== a)) as Owner;
      const A = side(a), B = side(b);
      if (!A.units.some(u => this.atkOf(u) > 0) && !A.def && !B.units.some(u => this.atkOf(u) > 0) && !B.def) continue;
      const rec = this.fight(gal, key, a, A, b, B);
      this.battles.push(rec);
    }
    if (this.battles.length) import('./battle').then(m => m.playBattles(this.battles.splice(0)));
  }
  defOf(c: Claim) { return c.core ? 18 : c.home ? 8 : 3 + (c.owner === 0 && this.has('ward') ? 3 : 0); }
  private fight(gal: string, key: string, a: Owner, A: { units: GUnit[]; def: number }, b: Owner, B: { units: GUnit[]; def: number }) {
    const G = this.G!; const s = this.star(gal, key)!; const claim = G.claims[key];
    type F = { id: string; kind: string; owner: Owner; hp: number; atk: number; name: string };
    const mk = (o: Owner, S: { units: GUnit[]; def: number }): F[] => { const L: F[] = S.units.map(u => ({ id: 'u' + u.id, kind: u.kind, owner: o, hp: u.hp, atk: this.atkOf(u), name: u.name })); if (S.def) L.push({ id: 'claim', kind: 'station', owner: o, hp: S.def, atk: Math.ceil(S.def / 3), name: claim!.name + ' defences' }); return L; };
    const fa = mk(a, A), fb = mk(b, B); const start = [...fa, ...fb].map(f => ({ ...f })); const rounds: { shots: { from: string; to: string; dmg: number }[] }[] = [];
    let seed = G.turn * 131 + key.length;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let r = 0; r < 6; r++) {
      const la = fa.filter(f => f.hp > 0), lb = fb.filter(f => f.hp > 0); if (!la.length || !lb.length) break;
      const shots: { from: string; to: string; dmg: number }[] = [];
      for (const [att, def] of [[la, lb], [lb, la]] as [F[], F[]][]) for (const f of att) { if (f.atk <= 0) continue; const tgt = def[Math.floor(rnd() * def.length)]; const dmg = rnd() < 0.8 ? f.atk : 0; shots.push({ from: f.id, to: tgt.id, dmg }); }
      for (const sh of shots) { const t = [...fa, ...fb].find(f => f.id === sh.to)!; t.hp -= sh.dmg; }
      rounds.push({ shots }); if (!shots.length) break;
    }
    // apply results
    for (const f of [...fa, ...fb]) { if (f.id === 'claim') continue; const u = G.units.find(q => 'u' + q.id === f.id); if (!u) continue; u.hp = Math.max(0, f.hp); }
    const dead = G.units.filter(u => u.hp <= 0); G.units = G.units.filter(u => u.hp > 0); if (dead.some(u => u === fleet.selShip)) fleet.selShip = null;
    const aliveA = fa.some(f => f.hp > 0), aliveB = fb.some(f => f.hp > 0);
    let outcome = aliveA && !aliveB ? `${OWNER_NAME[a]} won` : aliveB && !aliveA ? `${OWNER_NAME[b]} won` : 'Both sides pulled back';
    if (claim) {
      const defLost = fa.concat(fb).find(f => f.id === 'claim' && f.hp <= 0);
      if (defLost) { const winner = claim.owner === a ? b : a; const att = G.units.filter(u => u.sys === key && u.owner === winner);
        if (att.length) { if (winner === 0) { claim.owner = 0; outcome = `You captured ${s.name}`; this.log(`Captured ${s.name}.`); if (claim.core) { claim.core = false; this.win('The Pale Choir’s core is broken.'); } }
          else if (winner === 1) { if (claim.home) { G.lost = true; this.banner('Core lost', 'The Pale Choir took your home system. Keep playing to strike back, or start a new game from the Command panel.'); } claim.owner = 1; claim.home = false; outcome = `The Pale Choir took ${s.name}`; this.log(outcome + '.'); }
          else { if (!claim.home && !claim.core) { delete G.claims[key]; delete G.bodies[key]; G.stations = G.stations.filter(q => q.sys !== key); outcome = `The swarm devoured ${s.name}`; this.log(outcome + '.'); } } } }
    }
    toast(`Battle at ${s.name}: ${outcome}.`);
    return { star: s.name, a, b, rounds, outcome, start };
  }
}
export const game = new Game();
(window as any).__game = game;
