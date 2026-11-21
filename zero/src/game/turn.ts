// Turn engine and AI for human factions and the Abyss.
import { Game, Unit, Sett, Faction, PLAYER, ABYSS, unitAt, settAt, tileAt, maxHp, spawnUnit } from './state';
import { UNITS, KAIJU, ABYSS_ROSTER } from './data';
import { neighbors, inRange, dist } from './hex';
import * as R from './rules';
import { pickEvent } from './events';

export function startPlayerTurn(g: Game) {
  for (const u of R.playerUnits(g)) {
    if (u.sleep && !u.moved && !u.attacked && UNITS[u.t].cls !== 'civil') u.fort = Math.min(3, u.fort + 1); else if (u.moved || u.attacked) u.fort = 0;
    u.mp = R.stats(g, u).move; u.moved = false; u.attacked = false;
    u.done = !!u.sleep;
  }
  R.updateVis(g);
}

function heal(g: Game, u: Unit) {
  if (u.moved || u.attacked) return;
  const t = tileAt(g, u.x, u.y); let h = t.owner === u.o ? 15 : 10;
  if (u.o === PLAYER) { if (R.hasProto(g, 'repair')) h += 10; if (R.hasPerk(g, 'heal')) h += 15; for (const m of R.mods(g, u)) h += m.heal || 0; }
  if (u.o === ABYSS) h = 8;
  if (u.fort > 0) h += 5;
  u.hp = Math.min(maxHp(u), u.hp + h);
}

export function endTurn(g: Game) {
  if (g.over && !g.continued) return;
  const P = g.p;
  // --- player end phase
  for (const s of R.playerSetts(g)) {
    if (s.hp <= 0) continue;
    const foes = g.units.filter((u) => R.atWar(g, PLAYER, u.o) && dist(u.x, u.y, s.x, s.y) <= R.settRange(g, s) && tileAt(g, u.x, u.y).vis).sort((a, b) => a.hp - b.hp);
    if (foes.length) R.resolveAttack(g, { s }, { u: foes[0] });
  }
  for (const u of R.playerUnits(g)) heal(g, u);
  const inc = R.income(g); P.lastIncome = inc;
  P.matter += inc.m; P.influence += inc.i; P.essence = Math.round((P.essence + inc.e) * 10) / 10;
  if (P.research) { P.progress[P.research] = (P.progress[P.research] || 0) + inc.c; R.finishResearchIfDone(g); }
  else (P as any).overflow = ((P as any).overflow || 0) + inc.c;
  let decay = 0.5 + (R.hasProto(g, 'ghostproto') ? 1 : 0) + (R.hasTech(g, 'ghost') ? 1 : 0);
  if (R.hasProto(g, 'eschaton')) decay -= 1;
  P.exposure = Math.max(0, Math.min(100, P.exposure - decay));
  for (const s of R.playerSetts(g)) {
    s.hp = Math.min(R.settMaxHp(g, s), s.hp + 15);
    if (s.kind === 'node' && s.radius < 2) { s.grow--; if (s.grow <= 0) { s.radius = 2; claimFree(g, s); R.log(g, `${s.name} grew: its territory now reaches 2 tiles.`, 'good', s.x, s.y); } }
  }
  R.checkEurekas(g);
  // --- factions
  for (const f of g.factions.filter((f) => f.alive)) factionTurn(g, f);
  // --- abyss
  abyssTurn(g);
  // --- world
  for (const s of g.setts) if (s.sabotage > 0) s.sabotage--;
  for (const f of g.factions.filter((f) => f.alive)) drift(g, f);
  g.turn++;
  if (g.turn >= g.nextEvent && !g.over) { const e = pickEvent(g); if (e) popup(g, { type: 'event', ...e }); g.nextEvent = g.turn + R.rint(g, 6, 10); }
  R.checkVictory(g);
  startPlayerTurn(g);
}
export function popup(g: Game, p: any) { const q = ((g as any).popups = (g as any).popups || []); q.push(p); }
function claimFree(g: Game, s: Sett) { for (const [a, b] of inRange(s.x, s.y, s.radius, g.W, g.H)) { const t = tileAt(g, a, b); if (t.owner === -1) { t.owner = s.owner; t.sett = s.id; } } }

// ---------- factions
function drift(g: Game, f: Faction) {
  const P = g.p; let d = 0;
  if (P.exposure >= 25) d -= f.paranoia * 0.4; if (P.exposure >= 50) d -= f.paranoia * 0.6;
  if (f.war) d -= 0.5;
  if (!f.war) { if (R.hasProto(g, 'choir')) d += 1; if (R.hasPerk(g, 'calm')) d += 1; }
  if (R.playerSetts(g).some((s) => s.b.includes('cathedral') && g.setts.some((c) => c.owner === f.id && dist(c.x, c.y, s.x, s.y) <= 7))) d += 0.6;
  if (f.att > 40) d -= 0.4; if (f.att < -20 && !f.war) d += 0.3;
  if (d > 0) R.changeAtt(g, f, d); else f.att = Math.max(-100, f.att + d);
}
function factionTurn(g: Game, f: Faction) {
  const D = R.diff(g), E = R.era(g), cities = g.setts.filter((s) => s.owner === f.id);
  // diplomacy with the player
  if (!f.war) {
    const t = g.turn;
    if (f.att <= -50 && R.rnd(g) < f.aggr * 0.12 && t > 12) R.declareWar(g, f, false);
    else if (g.p.exposure >= 75 && f.att < 0 && R.rnd(g) < 0.08 + f.paranoia * 0.05) R.declareWar(g, f, false);
  } else if (g.turn >= f.peaceAsk && f.att > -60) {
    const mine = R.militaryPower(g, PLAYER), theirs = R.militaryPower(g, f.id);
    if (mine > theirs * 0.9 || R.rnd(g) < 0.25) { popup(g, { type: 'peace', f: f.id }); }
    f.peaceAsk = g.turn + 10;
  }
  // wars with other factions
  for (const o of g.factions) {
    if (o === f || !o.alive) continue;
    const at = f.wars.includes(o.id);
    const near = cities.some((c) => g.setts.some((d) => d.owner === o.id && dist(c.x, c.y, d.x, d.y) <= 14));
    if (!at && near && g.turn > 15 && R.rnd(g) < 0.006 * f.aggr * (1 + E * 0.5)) {
      f.wars.push(o.id); o.wars.push(f.id); (f as any)['ws' + o.id] = g.turn;
      const seen = f.met || o.met; if (seen) R.log(g, `WAR: ${f.name} declared war on ${o.name}.`, 'war');
    } else if (at && g.turn - ((f as any)['ws' + o.id] || 0) > 16 && R.rnd(g) < 0.06) {
      f.wars = f.wars.filter((w) => w !== o.id); o.wars = o.wars.filter((w) => w !== f.id);
      if (f.met || o.met) R.log(g, `${f.name} and ${o.name} signed an armistice.`, 'dip');
    }
  }
  // cities: grow, produce, shoot
  const atWarAny = f.war || f.wars.length > 0;
  const nUnits = g.units.filter((u) => u.o === f.id).length;
  const cap = Math.round(1 + cities.length * 1.6 + E + (atWarAny ? 2 : 0) + (g.units.some((u) => u.o === ABYSS) ? 1 : 0));
  let made = nUnits;
  for (const c of cities) {
    c.grow--; if (c.grow <= 0 && c.pop < 12) { c.pop++; c.grow = 8 + c.pop * 2; }
    c.hp = Math.min(200, c.hp + 15);
    c.prod += (2 + c.pop * 0.8) * D.prod * (1 + E * 0.2);
    if (made < cap) {
      const t = pickFactionUnit(g, f, c);
      if (t && c.prod >= UNITS[t].cost) {
        const spot = [[c.x, c.y], ...neighbors(c.x, c.y, g.W, g.H)].find(([a, b]) => !unitAt(g, a, b) && R.canStand(g, { t, o: f.id } as any, a, b) && (!settAt(g, a, b) || settAt(g, a, b).owner === f.id));
        if (spot) { c.prod -= UNITS[t].cost; const u = spawnUnit(g, t, f.id, spot[0], spot[1]); u.mp = 0; made++; }
      }
    } else c.prod = Math.min(c.prod, 120);
    if (c.hp > 0) {
      const foes = g.units.filter((u) => R.atWar(g, f.id, u.o) && dist(u.x, u.y, c.x, c.y) <= 2 && R.visibleTo(g, f.id, u)).sort((a, b) => a.hp - b.hp);
      if (foes.length) R.resolveAttack(g, { s: c }, { u: foes[0] });
    }
  }
  // units
  for (const u of g.units.filter((u) => u.o === f.id)) { if (!g.units.includes(u)) continue; u.mp = R.stats(g, u).move; u.moved = false; u.attacked = false; aiUnit(g, u); heal(g, u); }
}
function pickFactionUnit(g: Game, f: Faction, c: Sett): string | null {
  const E = R.era(g), coast = tileAt(g, c.x, c.y).coast, abyssNear = g.units.some((u) => u.o === ABYSS && dist(u.x, u.y, c.x, c.y) <= 10);
  const opts: [string, number][] = [];
  if (E === 0) opts.push(['militia', 3]);
  if (coast) opts.push(['navy', abyssNear ? 2 : 0.7]);
  if (E >= 1) { opts.push(['infantry', 3], ['armor', 2]); if (g.p.exposure >= 75 && f.war) opts.push(['purger', 3]); }
  if (E >= 2) opts.push(['wing', 1.5], ['exo', 2]);
  if (E >= 3 && abyssNear) opts.push(['jaeger', 2]);
  let tot = opts.reduce((a, o) => a + o[1], 0), r = R.rnd(g) * tot;
  for (const [t, w] of opts) { r -= w; if (r <= 0) return t; } return opts[0]?.[0] || null;
}

// ---------- generic unit AI
function targetsFor(g: Game, u: Unit, radius: number) {
  const out: { x: number; y: number; d: number; s?: Sett; u?: Unit; w: number }[] = [];
  const ignorePlayer = u.o === ABYSS && g.cfg.origin === 'listener' && g.turn <= 30;
  for (const o of g.units) {
    if (o.o === u.o || !R.atWar(g, u.o, o.o) || !R.visibleTo(g, u.o, o)) continue; if (ignorePlayer && o.o === PLAYER) continue;
    const d = dist(u.x, u.y, o.x, o.y); if (d <= radius) out.push({ x: o.x, y: o.y, d, u: o, w: d - (UNITS[o.t].cls === 'civil' ? 2 : 0) });
  }
  for (const s of g.setts) {
    if (s.owner === u.o || !R.atWar(g, u.o, s.owner)) continue; if (ignorePlayer && s.owner === PLAYER) continue;
    const d = dist(u.x, u.y, s.x, s.y); if (d <= radius + 3) out.push({ x: s.x, y: s.y, d, s, w: d - 3 - (s.hp <= 0 ? 4 : 0) - (s.core ? 2 : 0) });
  }
  return out.sort((a, b) => a.w - b.w);
}
function tryAttack(g: Game, u: Unit): boolean {
  const opts = R.attackTargets(g, u).filter((t) => (t.side.u ? R.atWar(g, u.o, t.side.u.o) : R.atWar(g, u.o, t.side.s.owner)));
  if (u.o === ABYSS && g.cfg.origin === 'listener' && g.turn <= 30) { for (let i = opts.length - 1; i >= 0; i--) { const o = opts[i]; if ((o.side.u && o.side.u.o === PLAYER) || (o.side.s && o.side.s.owner === PLAYER)) opts.splice(i, 1); } }
  let best = null, bs = -1e9;
  for (const t of opts) {
    const f = R.forecast(g, { u }, t.side);
    let s = f.toDef - f.toAtt * 0.8 + (f.kill ? 40 : 0) + (f.capture ? 80 : 0) - (f.die ? 100 : 0);
    if (t.side.s && t.side.s.hp <= 0 && UNITS[u.t].cls === 'land') s += 60;
    if (u.o === ABYSS) s += 15; // the Abyss is reckless
    if (s > bs) { bs = s; best = t; }
  }
  if (best && (bs > -8 || u.o === ABYSS)) { R.resolveAttack(g, { u }, best.side); return true; }
  return false;
}
function stepToward(g: Game, u: Unit, tx: number, ty: number) {
  const reach = R.reachable(g, u); let best = null, bs = dist(u.x, u.y, tx, ty) * 10;
  for (const r of reach.values()) {
    if (r.turns > 0 || (r.x === u.x && r.y === u.y) || unitAt(g, r.x, r.y)) continue;
    const s = settAt(g, r.x, r.y); if (s && s.owner !== u.o) continue;
    const d = dist(r.x, r.y, tx, ty) * 10 - (tileAt(g, r.x, r.y).t === 'hills' || tileAt(g, r.x, r.y).t === 'forest' ? 2 : 0);
    if (d < bs) { bs = d; best = r; }
  }
  if (best) R.moveUnit(g, u, best.x, best.y, reach);
}
function aiUnit(g: Game, u: Unit) {
  const U = UNITS[u.t];
  const own = g.setts.filter((s) => s.owner === u.o);
  if (u.o !== ABYSS && u.hp < 40 && own.length) {
    const home = own.sort((a, b) => dist(a.x, a.y, u.x, u.y) - dist(b.x, b.y, u.x, u.y))[0];
    if (dist(home.x, home.y, u.x, u.y) > 1) { stepToward(g, u, home.x, home.y); return; }
    return;
  }
  if (tryAttack(g, u)) return;
  const tg = targetsFor(g, u, u.o === ABYSS ? 14 : 10);
  if (tg.length) {
    const t = tg[0]; const rng = R.stats(g, u).range;
    if (U.rstr && dist(u.x, u.y, t.x, t.y) <= rng) return;
    stepToward(g, u, t.x, t.y); if (g.units.includes(u) && u.mp > 0) tryAttack(g, u); return;
  }
  if (u.o === ABYSS) {
    // drift toward the nearest settlement anywhere
    const s = g.setts.filter((s) => !(g.cfg.origin === 'listener' && g.turn <= 30 && s.owner === PLAYER)).sort((a, b) => dist(a.x, a.y, u.x, u.y) - dist(b.x, b.y, u.x, u.y))[0];
    if (s && R.rnd(g) < 0.8) stepToward(g, u, s.x, s.y);
    return;
  }
  // peacetime: garrison near home
  if (own.length) {
    const home = own.sort((a, b) => dist(a.x, a.y, u.x, u.y) - dist(b.x, b.y, u.x, u.y))[0];
    const d = dist(home.x, home.y, u.x, u.y);
    if (d > 2) stepToward(g, u, home.x, home.y);
    else if (R.rnd(g) < 0.2) { const n = neighbors(u.x, u.y, g.W, g.H).filter(([a, b]) => dist(a, b, home.x, home.y) <= 2); if (n.length) { const [a, b] = R.rpick(g, n); const r = R.reachable(g, u); if (r.get(b * 1000 + a)) R.moveUnit(g, u, a, b, r); } }
  }
}

// ---------- the Abyss
function abyssTurn(g: Game) {
  const kj = KAIJU.find((k) => k.id === g.cfg.kaiju) || KAIJU[1];
  const nAb = g.units.filter((u) => u.o === ABYSS).length, open = g.rifts.filter((r) => r.open && !r.sealed).length;
  const cap = 3 + open * 3;
  for (const r of g.rifts) {
    if (r.sealed || g.mother.dead) continue;
    if (!r.open && g.turn >= r.opens) {
      r.open = true; r.next = g.turn + 1; tileAt(g, r.x, r.y).rift = r.id;
      const first = g.rifts.filter((x) => x.open).length === 1;
      R.log(g, first ? 'AN ABYSSAL RIFT has torn open beneath the sea. Something is climbing out.' : 'Another Abyssal Rift opens.', 'big', r.x, r.y);
      R.anim(g, { k: 'banner', text: first ? 'THE ABYSS OPENS' : 'NEW RIFT', sub: first ? 'Kaiju will rise from the rifts. Titans fight them best.' : 'The sea splits again.', x: r.x, y: r.y });
      tileAt(g, r.x, r.y).exp = true;
    }
    if (r.open && g.turn >= r.next && nAb < cap) {
      spawnAbyss(g, r.x, r.y); r.next = g.turn + Math.round(kj.every / kj.mult * 1.4) + R.rint(g, 0, 3);
    }
  }
  if (g.mother.spawned && !g.mother.dead && g.turn % 5 === 0 && nAb < cap + 3) spawnAbyss(g, g.mother.x, g.mother.y, true);
  for (const u of g.units.filter((u) => u.o === ABYSS)) {
    if (!g.units.includes(u)) continue; u.mp = R.stats(g, u).move; u.moved = false; u.attacked = false;
    if (u.t === 'mother') { tryAttack(g, u); heal(g, u); continue; }
    aiUnit(g, u); heal(g, u);
  }
}
function spawnAbyss(g: Game, x: number, y: number, elite = false) {
  const t = g.turn, max = t < 45 ? 1 : t < 75 ? 2 : t < 105 ? 3 : t < 140 ? 4 : 5;
  const lo = Math.max(0, max - 2); let id = ABYSS_ROSTER[R.rint(g, lo, max)];
  if (elite) id = R.rpick(g, ['maw', 'riftback', 'deepking']);
  const spot = [[x, y], ...neighbors(x, y, g.W, g.H), ...inRange(x, y, 2, g.W, g.H)].find(([a, b]) => !unitAt(g, a, b) && !settAt(g, a, b) && tileAt(g, a, b).t !== 'peaks');
  if (!spot) return;
  const u = spawnUnit(g, id, ABYSS, spot[0], spot[1]); u.mp = 0;
  if (tileAt(g, spot[0], spot[1]).vis) { R.log(g, `A ${UNITS[id].name} emerges from the rift.`, 'bad', spot[0], spot[1]); R.anim(g, { k: 'emerge', x: spot[0], y: spot[1] }); }
}
