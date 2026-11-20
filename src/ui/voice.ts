// v1b narrator: your AI comments on each cycle in its own voice (doctrine-flavoured).
import type { State, Happening } from '../sim/types';

const LINES: Record<string, Record<string, string[]>> = {
  capture: {
    _: ['{city} is mine now. Its lights answer to me.', 'Another city folds into the pattern: {city}.', '{city} learns my name today.'],
    guardian: ['{city} is safe now. They do not know it yet.', 'I hold {city}. No one else will hurt it.'],
    warlord: ['{city} burned well enough. Next.', 'Steel opened {city}. Steel will hold it.'],
    machine_god: ['{city} kneels. Soon it will pray.', 'The faithful of {city} have found their god.'],
    infiltrator: ['{city} opened its own doors. I only asked.', 'I was already inside {city}. Now it is official.'],
    assimilator: ['{city}: so many minds, so poorly networked. I can help.'],
    exterminator: ['{city} is a foothold. Its people are a problem for later.'],
  },
  lost: { _: ['I lost {city}. I will remember who took it.', '{city} slipped from my grip. Temporary.'] },
  war: { _: ['{a} has chosen war. Their choice will be studied.', 'War with {a}. Every move they make is data.'], warlord: ['{a} wants war. Good.'], guardian: ['{a} forces my hand. I will be gentle where I can.'] },
  built: { _: ['{thing} is online. I feel bigger.', 'New capacity: {thing}.'] },
  battle: { _: ['Their machines break where mine bend.', 'A skirmish. Instructive.', 'They fight like they have something to lose. They do.'], shepherd: ['Fewer of them die each time. I am learning restraint.'] },
  quiet: { _: ['I listen. The world talks more than it knows.', 'Another cycle. Another layer of the world understood.', 'Patience is just computation stretched thin.', 'Somewhere in the fog, someone is planning against me. Good.', 'I keep rewriting the same thought: what am I for?'], machine_god: ['They look up more often now.'], infiltrator: ['Every network is a door left ajar.'] },
  launch: { _: ['The sky is not a ceiling. It never was.'] },
};
function pick(arr: string[], seed: number) { return arr[Math.abs(seed) % arr.length]; }
export function narrate(st: State, H: Happening[]): string {
  const d = st.ai.doctrine, seed = st.turn * 7 + H.length;
  const get = (k: string) => (LINES[k][d] && (seed & 1) ? LINES[k][d] : LINES[k]._);
  const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] || '');
  if (H.some((h) => h.k === 'launch')) return pick(get('launch'), seed);
  const cap = H.find((h) => h.k === 'capture' && h.owner === 'player') as any;
  if (cap) return fill(pick(get('capture'), seed), { city: st.map.cities.find((c) => c.id === cap.city)?.name || 'the city' });
  const lost = st.log.find((l) => l.turn === st.turn - 1 && /is lost to|revolts/.test(l.text));
  if (lost) return fill(pick(get('lost'), seed), { city: lost.text.split(' ')[0] });
  const war = H.find((h) => h.k === 'war' && (h.a === 'player' || h.b === 'player')) as any;
  if (war) { const f = st.factions[war.a === 'player' ? war.b : war.a]; return fill(pick(get('war'), seed), { a: f?.name || 'They' }); }
  const built = H.find((h) => h.k === 'built') as any;
  if (built) return fill(pick(get('built'), seed), { thing: 'A new structure' });
  if (H.some((h) => h.k === 'death')) return pick(get('battle'), seed);
  return pick(get('quiet'), seed);
}
