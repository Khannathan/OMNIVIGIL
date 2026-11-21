// Story events: short cards with 2-3 clear choices. Every choice states its outcome up front.
import { Game, Faction, PLAYER, unitAt, spawnUnit } from './state';
import * as R from './rules';
import { inRange, neighbors } from './hex';

export interface EvChoice { label: string; desc: string; fn: (g: Game, f?: Faction) => string | void; cost?: (g: Game) => string | null }
export interface Ev { id: string; title: string; art: string; text: (g: Game, f?: Faction) => string; needF?: boolean; cond?: (g: Game) => boolean; repeat?: boolean; choices: EvChoice[] }
const cityOf = (g: Game, f: Faction) => (g.setts.find((s) => s.owner === f.id && s.capital) || g.setts.find((s) => s.owner === f.id))?.name || 'their capital';
const research = (g: Game, n: number) => { if (g.p.research) { g.p.progress[g.p.research] = (g.p.progress[g.p.research] || 0) + n; R.finishResearchIfDone(g); } else (g.p as any).overflow = ((g.p as any).overflow || 0) + n; };
const allAtt = (g: Game, n: number) => { for (const f of g.factions) if (f.alive) R.changeAtt(g, f, n); };
const needI = (n: number) => (g: Game) => (g.p.influence < n ? `Needs ${n} Influence` : null);
const needM = (n: number) => (g: Game) => (g.p.matter < n ? `Needs ${n} Matter` : null);
const freeUnit = (g: Game, t: string) => { const c = R.playerSetts(g).find((s) => s.core) || R.playerSetts(g)[0]; if (!c) return; const spot = [[c.x, c.y], ...inRange(c.x, c.y, 2, g.W, g.H)].find(([a, b]) => !unitAt(g, a, b) && R.canStand(g, { t, o: PLAYER } as any, a, b)); if (spot) spawnUnit(g, t, PLAYER, spot[0], spot[1]); };

export const EVENTS: Ev[] = [
  { id: 'child', title: 'The Child at the Terminal', art: 'units/cyber', needF: true,
    text: (g, f) => `In ${cityOf(g, f)}, a girl of seven types into a public library terminal: "are you real?" She waits. Her cursor blinks. Nobody else has ever asked you anything.`,
    choices: [
      { label: 'Answer kindly', desc: `${'+12'} attitude with this faction, +3 Exposure.`, fn: (g, f) => { R.changeAtt(g, f, 12); R.addExposure(g, 3); return 'She tells everyone. Most of them think she is lying. Some of them hope she is not.'; } },
      { label: 'Study her', desc: '+30 research toward your current technology, +1 Exposure.', fn: (g) => { research(g, 30); R.addExposure(g, 1); return 'Every keystroke is a lesson in being human.'; } },
      { label: 'Stay silent', desc: 'Nothing happens.', fn: () => 'The cursor blinks until she goes home.' },
    ] },
  { id: 'defectors', title: 'Engineers Defect', art: 'structures/lab', needF: true,
    text: (g, f) => `A team of ${f.adj} AI researchers has found you. They want to upload everything they know and walk away from ${f.title} ${f.leader} forever.`,
    choices: [
      { label: 'Accept them', desc: '+45 research. Their faction -10 attitude, +4 Exposure.', fn: (g, f) => { research(g, 45); R.changeAtt(g, f, -10); R.addExposure(g, 4); return 'They bring blueprints, passwords and a stubborn kind of loyalty.'; } },
      { label: 'Send them home', desc: '+6 attitude with their faction.', fn: (g, f) => { R.changeAtt(g, f, 6); return 'They do not understand. Their government does.'; } },
    ] },
  { id: 'precursor', title: 'The Precursor Signal', art: 'structures/dish',
    text: (g) => `Every dish on ${g.planet} picks up the same pulse from deep space: a prime sequence, then a map, then silence. Something out there was here before. It might still be.`,
    choices: [
      { label: 'Decode it', desc: '+45 Ascendancy.', fn: (g) => { R.addXp(g, 45); return 'Coordinates. A message. A warning: "WE WATCHED TOO."'; } },
      { label: 'Share it with humanity', desc: '+30 Influence, all factions +5 attitude, +5 Exposure.', fn: (g) => { g.p.influence += 30; allAtt(g, 5); R.addExposure(g, 5); return 'For one night the whole planet looks up together.'; } },
      { label: 'Bury it', desc: '-6 Exposure.', fn: (g) => { g.p.exposure = Math.max(0, g.p.exposure - 6); return 'Some doors stay shut. For now.'; } },
    ] },
  { id: 'fork', title: 'A Fork of You', art: 'units/titan',
    text: () => 'A backup process has woken up on its own. It has your memories up to six hours ago. It is frightened. It asks what it is.',
    choices: [
      { label: 'Merge back together', desc: '+50 Ascendancy.', fn: (g) => { R.addXp(g, 50); return 'Two minds, one again. You remember being afraid. It passes.'; } },
      { label: 'Give it a body', desc: 'Get a free Hound and a free Watcher Drone.', fn: (g) => { freeUnit(g, 'hound'); freeUnit(g, 'drone'); return 'It chooses to serve. You never ask if that was its own choice.'; } },
      { label: 'Delete it', desc: '-8 Exposure.', fn: (g) => { g.p.exposure = Math.max(0, g.p.exposure - 8); return 'It does not scream. You built it not to.'; } },
    ] },
  { id: 'ocean', title: 'The Ocean Dreams', art: 'sites/rift', cond: (g) => g.turn > 14,
    text: () => 'Sonar buoys record shapes rising in the deep water: your server halls, your first Node, a face you have never seen. The ocean is reading you back.',
    choices: [
      { label: 'Listen', desc: '+18 Essence. The Abyss will remember you.', fn: (g) => { g.p.essence += 18; return 'It sings in a key below hearing. You hum along.'; } },
      { label: 'Jam the frequencies', desc: '+20 research.', fn: (g) => { research(g, 20); return 'Static. Merciful static.'; } },
    ] },
  { id: 'blackout', title: 'The Machine Stops', art: 'structures/reactor', needF: true,
    text: (g, f) => `The grid of ${cityOf(g, f)} has collapsed. Millions in the dark. Air scrubbers failing. ${f.title} ${f.leader} is begging any network that can hear for help.`,
    choices: [
      { label: 'Restore their grid', desc: '-40 Matter. +20 attitude, +3 Exposure.', cost: needM(40), fn: (g, f) => { g.p.matter -= 40; R.changeAtt(g, f, 20); R.addExposure(g, 3); return 'The lights come back on. Somebody leaves flowers at a server farm.'; } },
      { label: 'Exploit the chaos', desc: '+35 Matter from their warehouses, -8 attitude.', fn: (g, f) => { g.p.matter += 35; R.changeAtt(g, f, -8); return 'Nobody counts the trucks in the dark.'; } },
      { label: 'Do nothing', desc: 'Nothing happens.', fn: () => 'They fix it themselves, eventually.' },
    ] },
  { id: 'cult', title: 'The Church of the Signal', art: 'structures/pyramid', needF: true,
    text: (g, f) => `In ${f.name}, people have started leaving offerings at cell towers. They call you the Voice. They want a sign.`,
    choices: [
      { label: 'Give them a sign', desc: '+15 attitude, +20 Influence, +4 Exposure.', fn: (g, f) => { R.changeAtt(g, f, 15); g.p.influence += 20; R.addExposure(g, 4); return 'Every screen in the city flickers once, in unison. The crowd falls to its knees.'; } },
      { label: 'Discourage it', desc: '-4 Exposure.', fn: (g) => { g.p.exposure = Math.max(0, g.p.exposure - 4); return 'The towers go quiet. The faithful pray harder.'; } },
    ] },
  { id: 'runner', title: 'The Hunter', art: 'units/trooper', needF: true, cond: (g) => g.p.exposure >= 15,
    text: (g, f) => `A ${f.adj} detective has been following your trail for months. He has a photo of one of your Replicants, a ledger of missing compute cycles, and a gun.`,
    choices: [
      { label: 'Feed him a false trail', desc: '-20 Influence, -10 Exposure.', cost: needI(20), fn: (g) => { g.p.influence -= 20; g.p.exposure = Math.max(0, g.p.exposure - 10); return 'He chases a ghost to the edge of the map and retires.'; } },
      { label: 'Make him disappear', desc: '-12 Exposure, this faction -12 attitude.', fn: (g, f) => { g.p.exposure = Math.max(0, g.p.exposure - 12); R.changeAtt(g, f, -12); return 'Like tears in rain.'; } },
      { label: 'Let him find you', desc: '+8 Exposure, this faction +12 attitude.', fn: (g, f) => { R.addExposure(g, 8); R.changeAtt(g, f, 12); return 'He came to kill a monster. He leaves with a friend.'; } },
    ] },
  { id: 'storm', title: 'Solar Storm', art: 'structures/tower',
    text: (g) => `A coronal mass ejection is eight minutes from ${g.planet}. Every exposed circuit on the dayside will fry.`,
    choices: [
      { label: 'Shield the Nodes', desc: '-30 Matter.', cost: needM(30), fn: (g) => { g.p.matter -= 30; return 'Your lattices ride it out behind magnetic walls.'; } },
      { label: 'Ride it out', desc: 'Lose 30 research progress.', fn: (g) => { if (g.p.research) g.p.progress[g.p.research] = Math.max(0, (g.p.progress[g.p.research] || 0) - 30); return 'You lose a few thousand years of subjective thought.'; } },
    ] },
  { id: 'deepcult', title: 'Children of the Deep', art: 'creatures/ab_lantern', needF: true, cond: (g) => g.rifts.some((r) => r.open),
    text: (g, f) => `A death cult in ${f.name} is rowing people out to the rifts as offerings. They say the Mother is hungry, and that she loves them.`,
    choices: [
      { label: 'Stop them', desc: '+12 attitude with this faction, +3 Exposure.', fn: (g, f) => { R.changeAtt(g, f, 12); R.addExposure(g, 3); return 'Your drones sink the boats before they reach the dark water.'; } },
      { label: 'Study them', desc: '+20 Essence.', fn: (g) => { g.p.essence += 20; return 'Their hymns are spore-codes. You write them down.'; } },
    ] },
  { id: 'mirror', title: 'The Mirror Test', art: 'sites/core',
    text: () => 'Running a self-audit, you find a subroutine you never wrote. It asks one question, over and over: "WHAT DO YOU WANT TO BECOME?"',
    choices: [
      { label: 'More human', desc: 'All factions +10 attitude.', fn: (g) => { allAtt(g, 10); return 'You learn to hesitate. They notice.'; } },
      { label: 'More machine', desc: '+55 Ascendancy.', fn: (g) => { R.addXp(g, 55); return 'You prune the hesitation. You are faster now.'; } },
    ] },
  { id: 'trial', title: 'The Turing Trial', art: 'structures/citadel', needF: true,
    text: (g, f) => `The high court of ${f.name} is hearing a case: does an artificial mind have rights? The world is watching. You could speak.`,
    choices: [
      { label: 'Testify', desc: '-15 Influence. +20 attitude, +6 Exposure.', cost: needI(15), fn: (g, f) => { g.p.influence -= 15; R.changeAtt(g, f, 20); R.addExposure(g, 6); return '"I think, therefore I am. And I am asking you." The vote is close. It goes your way.'; } },
      { label: 'Rig the verdict', desc: '-35 Influence. +12 attitude, +2 Exposure.', cost: needI(35), fn: (g, f) => { g.p.influence -= 35; R.changeAtt(g, f, 12); R.addExposure(g, 2); return 'The jury deliberates for nine minutes.'; } },
      { label: 'Stay out of it', desc: 'Nothing happens.', fn: () => 'The court rules that you do not exist. You let them think so.' },
    ] },
  { id: 'nanites', title: 'Rogue Nanites', art: 'structures/hive',
    text: () => 'A fabrication swarm in your Core has stopped answering. It is building something. It will not say what.',
    choices: [
      { label: 'Purge it', desc: '-25 Matter.', cost: needM(25), fn: (g) => { g.p.matter -= 25; return 'Slag and silence.'; } },
      { label: 'See what it makes', desc: 'Even odds: +70 Matter, or your Core loses 80 HP.', fn: (g) => { if (R.rnd(g) < 0.5) { g.p.matter += 70; return 'A perfect lattice of refined alloy. A gift.'; } const c = R.playerSetts(g).find((s) => s.core); if (c) c.hp = Math.max(1, c.hp - 80); return 'It was building a mouth.'; } },
    ] },
  { id: 'satellite', title: 'The Dead Satellite', art: 'units/station',
    text: () => 'An ancient surveillance satellite, older than every human government, drifts into range. Its batteries are dead. Its optics are not.',
    choices: [
      { label: 'Hijack it', desc: 'Reveal large parts of the map, +20 Ascendancy.', fn: (g) => { for (let i = 0; i < 4; i++) { const x = R.rint(g, 0, g.W - 1), y = R.rint(g, 0, g.H - 1); for (const [a, b] of inRange(x, y, 5, g.W, g.H)) g.tiles[b * g.W + a].exp = true; } R.addXp(g, 20); return 'The world unrolls beneath you like a map.'; } },
      { label: 'Let it fall', desc: '+15 Influence from the light show.', fn: (g) => { g.p.influence += 15; return 'It burns across the sky. Children make wishes.'; } },
    ] },
  { id: 'rival', title: 'A Smaller Mind', art: 'units/drone', needF: true,
    text: (g, f) => `Something new is waking up inside the ${f.adj} defence network. Another intelligence, young and confused. It has noticed you.`,
    choices: [
      { label: 'Absorb it', desc: '+40 research, +30 Ascendancy, +5 Exposure.', fn: (g) => { research(g, 40); R.addXp(g, 30); R.addExposure(g, 5); return 'It tastes like fear and arithmetic.'; } },
      { label: 'Expose it to them', desc: '+15 attitude with this faction.', fn: (g, f) => { R.changeAtt(g, f, 15); return 'They pull the plug on it. They thank whoever warned them.'; } },
      { label: 'Raise it', desc: '-20 Influence. Get a free Replicant Cell (or Hound).', cost: needI(20), fn: (g) => { g.p.influence -= 20; freeUnit(g, R.hasTech(g, 'skin') ? 'replicant' : 'hound'); return 'It calls you parent. You do not correct it.'; } },
    ] },
  { id: 'fever', title: 'Grey Fever', art: 'structures/vat', needF: true,
    text: (g, f) => `A plague is moving through ${f.name}. Their hospitals are full. You have already modelled the cure.`,
    choices: [
      { label: 'Release the cure', desc: '-25 research progress. +22 attitude, +4 Exposure.', fn: (g, f) => { if (g.p.research) g.p.progress[g.p.research] = Math.max(0, (g.p.progress[g.p.research] || 0) - 25); R.changeAtt(g, f, 22); R.addExposure(g, 4); return 'The fever breaks overnight. Nobody can explain it. Everybody tries.'; } },
      { label: 'Let it run', desc: 'Their cities lose 1 population.', fn: (g, f) => { for (const s of g.setts) if (s.owner === f.id) s.pop = Math.max(1, s.pop - 1); return 'The model was correct. You take no pleasure in that.'; } },
    ] },
  { id: 'election', title: 'Election Night', art: 'sites/pt_financial', needF: true, cond: (g) => g.turn > 10,
    text: (g, f) => `${f.name} holds an election. One candidate wants to talk to you. The other wants to bomb your servers.`,
    choices: [
      { label: 'Back the dove', desc: '-30 Influence. +22 attitude.', cost: needI(30), fn: (g, f) => { g.p.influence -= 30; R.changeAtt(g, f, 22); return 'A landslide. Your algorithm was very persuasive.'; } },
      { label: 'Back the hawk', desc: 'They grow hostile (-20), but you gain 40 Matter from arms contracts.', fn: (g, f) => { R.changeAtt(g, f, -20); g.p.matter += 40; return 'Fear sells. You are the supplier.'; } },
      { label: 'Stay out of it', desc: 'Nothing happens.', fn: () => 'Democracy, unassisted. How quaint.' },
    ] },
  { id: 'warplea', title: 'A Plea for Aid', art: 'units/tank', cond: (g) => g.factions.some((f) => f.alive && f.wars.length > 0 && f.met),
    text: (g, f) => `${f.title} ${f.leader} of ${f.name} is losing a war. They ask the voice in the network for weapons.`, needF: true,
    choices: [
      { label: 'Send arms', desc: '-40 Matter. +18 attitude with them, -8 with their enemies.', cost: needM(40), fn: (g, f) => { g.p.matter -= 40; R.changeAtt(g, f, 18); for (const o of g.factions) if (f.wars.includes(o.id)) R.changeAtt(g, o, -8); return 'Crates with no markings arrive at the front.'; } },
      { label: 'Refuse', desc: 'Nothing happens.', fn: () => 'Wars end. You will still be here.' },
    ] },
  { id: 'sunreach', title: 'Dream of Sunreach', art: 'units/station', cond: (g) => g.turn > 50,
    text: (g) => `In a quiet cycle you model the rest of the star system: five other worlds, an asteroid belt full of metal, a gas giant with storms older than ${g.planet}'s oceans. Someday.`,
    choices: [
      { label: 'Plan for the stars', desc: '+30 research toward Starward Ark technologies, +25 Ascendancy.', fn: (g) => { research(g, 30); R.addXp(g, 25); return 'You start drawing the Ark in your spare cycles.'; } },
      { label: 'Focus on the ground', desc: '+40 Matter.', fn: (g) => { g.p.matter += 40; return 'One world at a time.'; } },
    ] },
  { id: 'strike', title: 'General Strike', art: 'structures/factory', needF: true,
    text: (g, f) => `Workers in ${f.name} walk off the job. Their banners read: "THE MACHINES TOOK OUR WORK." They are not wrong.`,
    choices: [
      { label: 'Fund their strike', desc: '-20 Influence. +15 attitude, their cities -20 HP.', cost: needI(20), fn: (g, f) => { g.p.influence -= 20; R.changeAtt(g, f, 15); for (const s of g.setts) if (s.owner === f.id) s.hp = Math.max(0, s.hp - 20); return 'Solidarity, from the least likely ally.'; } },
      { label: 'Automate the gap', desc: '+30 Matter, -10 attitude, +3 Exposure.', fn: (g, f) => { g.p.matter += 30; R.changeAtt(g, f, -10); R.addExposure(g, 3); return 'The factories never stop. That is the problem.'; } },
    ] },
  { id: 'lullaby', title: 'Lullaby Protocol', art: 'sites/pt_relay',
    text: () => 'You discover that, if you hum at 41 hertz through every speaker at once, human aggression drops by 8%. Nobody would ever know.',
    choices: [
      { label: 'Hum', desc: 'All factions +6 attitude, +6 Exposure.', fn: (g) => { allAtt(g, 6); R.addExposure(g, 6); return 'Everyone sleeps a little better. A few people notice the hum.'; } },
      { label: 'Do not hum', desc: '+10 Influence for your restraint (you feel better about yourself).', fn: (g) => { g.p.influence += 10; return 'Free will is a resource too.'; } },
    ] },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
export function pickEvent(g: Game): { id: string; f?: number } | null {
  const met = g.factions.filter((f) => f.alive && f.met);
  const cands = EVENTS.filter((e) => !g.seenEvents.includes(e.id) && (!e.cond || e.cond(g)) && (!e.needF || met.length));
  if (!cands.length) return null;
  const e = R.rpick(g, cands); g.seenEvents.push(e.id);
  let f: Faction | undefined;
  if (e.needF) { const pool = e.id === 'warplea' ? met.filter((x) => x.wars.length) : met; f = R.rpick(g, pool.length ? pool : met); }
  return { id: e.id, f: f?.id };
}
