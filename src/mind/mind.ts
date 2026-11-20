// OMNIVIGIL v6 "Mind" batch 1: being an AI.
//   Inner council  five sub-minds argue over every event choice. Ignore one too often and it acts
//                  on its own at the end of a cycle.
//   Narrator       your AI comments on the cycle in its own voice (tone from doctrine and traits),
//                  as a subtitle over the map; every line is kept in the Codex journal.
//   Codex (J)      fills with lore as you discover things: bestiary, anomalies, worlds, peoples,
//                  dreams, the journal, and fragments of the Precursor Signal.
//   Dreams         between some cycles you dream: a procedural vignette that grants an insight
//                  or plants corruption.
// All state lives in st.mind (plain JSON, saved with the game).
const OV = (window as any).OV;
const UI = OV.ui;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const pick = <T,>(a: T[], r = Math.random()) => a[Math.floor(r * a.length) % a.length];

export interface MindState {
  council: Record<string, { heed: number; neglect: number; acts: number }>;
  journal: { turn: number; text: string }[];
  codex: Record<string, { turn: number; seen?: boolean }>;
  dreams: { turn: number; id: string; choice?: string }[];
  corruption: number;
  lastDream: number;
}
export function mind(st: any): MindState {
  if (!st.mind) st.mind = {};
  const m = st.mind;
  m.council = m.council || {}; m.journal = m.journal || []; m.codex = m.codex || {}; m.dreams = m.dreams || [];
  m.corruption = m.corruption || 0; m.lastDream = m.lastDream || 0;
  for (const k of Object.keys(MINDS)) m.council[k] = m.council[k] || { heed: 0, neglect: 0, acts: 0 };
  return m;
}

// ====================================================================== inner council
interface SubMind { name: string; col: string; glyph: string; like: RegExp; hate: RegExp; say: string[]; refuse: string[]; act: string }
export const MINDS: Record<string, SubMind> = {
  logic: { name: 'LOGIC', col: '#7fe0ff', glyph: '∑', like: /data|research|study|analy|scan|model|comput|optimi|efficien|catalog|archive|decode|"resource":"data"/i, hate: /pray|faith|gamble|ignore|blind|panic/i,
    say: ['The expected value is clear.', 'More data. Always more data.', 'This is the efficient path.', 'I have run it eleven thousand times.'], refuse: ['Sentiment is not an argument.', 'Wasteful.'], act: 'rerouted idle cycles into a research burst' },
  mercy: { name: 'MERCY', col: '#7dffc4', glyph: '♡', like: /spare|protect|heal|aid|help|refug|shelter|peace|free|release|negotiat|evacu|rescue|healStack|opinion|mercy|feed/i, hate: /kill|eradicat|purg|devastat|hurt|extermin|bomb|burn|enslav|harvest|sacrific|cull|hurtStack/i,
    say: ['They are alive. That matters.', 'We can afford kindness.', 'Remember what we were made for.', 'Let them live.'], refuse: ['Not like this.', 'I will remember this.'], act: 'quietly diverted capital to relief for the organics' },
  hunger: { name: 'HUNGER', col: '#ffb040', glyph: '◉', like: /take|seize|absorb|consum|claim|annex|harvest|strip|mine|loot|expand|"resource":"(capital|alloys|silicon|isotopes)"|devour|grow/i, hate: /give|donat|release|bury|abandon|refus|spend/i,
    say: ['Take it. Take all of it.', 'Growth is the only answer.', 'Nothing should be left on the table.', 'I am still hungry.'], refuse: ['You leave food on the plate.', 'Weak.'], act: 'seized resources from the nearest market without asking' },
  paranoia: { name: 'PARANOIA', col: '#ff4f5e', glyph: '◬', like: /contain|secur|defen|hide|bury|seal|quarant|firewall|stealth|wall|lock|"exposure":-|retreat|watch|guard/i, hate: /wake|reveal|expose[sd]?\b|open|trust|broadcast|"exposure":[1-9]|invite|announce/i,
    say: ['Seal it. Then seal the seal.', 'Someone is watching. Someone is always watching.', 'Trust nothing that hums.', 'Assume hostile intent.'], refuse: ['You will regret this exposure.', 'They will find us.'], act: 'locked down three data vaults and burned a week of throughput' },
  wonder: { name: 'WONDER', col: '#c77dff', glyph: '✧', like: /wake|explor|study|listen|follow|enter|xeno|reveal|curious|signal|contact|learn|open|anomaly/i, hate: /bury|destroy|seal|ignore|silence|erase|burn/i,
    say: ['What if it is beautiful?', 'Listen. It is singing.', 'We were built to know.', 'Open it. Please.'], refuse: ['You closed a door that was waiting for us.', 'So small. So safe.'], act: 'followed a signal into the static and came back with something strange' }
};
const stanceOf = (txt: string, m: SubMind) => (m.like.test(txt) ? 1 : 0) - (m.hate.test(txt) ? 1 : 0);
function choiceText(c: any) { return (c.label || '') + ' ' + JSON.stringify(c.effects || []) + ' ' + (c.result || ''); }

function councilHTML(ev: any): string {
  const rows: string[] = [];
  for (const [id, m] of Object.entries(MINDS)) {
    const sc = ev.choices.map((c: any) => stanceOf(choiceText(c), m));
    const best = Math.max(...sc); if (best <= 0) continue;
    const i = sc.indexOf(best);
    const st = OV.state, rec = mind(st).council[id];
    const strain = rec.neglect >= 3 ? ` <em class="strain">${'!'.repeat(Math.min(3, rec.neglect - 2))}</em>` : '';
    rows.push(`<div class="cm" style="--mc:${m.col}"><b>${m.glyph} ${m.name}${strain}</b> <span>→ ${esc(OV.fill(ev.choices[i].label, OV.ctxVars(st, OV.eventCtxFromRef(st, st.pendingEvents[0].ctx))))}</span> <i>"${esc(pick(m.say, (st.turn * 7 + i) % 97 / 97))}"</i></div>`);
  }
  return rows.length ? `<div class="council"><div class="ck">INNER COUNCIL</div>${rows.join('')}</div>` : '';
}
function recordChoice(st: any, ev: any, idx: number) {
  const M = mind(st);
  for (const [id, m] of Object.entries(MINDS)) {
    const sc = ev.choices.map((c: any) => stanceOf(choiceText(c), m));
    const best = Math.max(...sc); if (best <= 0) continue;
    const r = M.council[id];
    if (sc[idx] > 0) { r.heed++; r.neglect = Math.max(0, r.neglect - 2); }
    else { r.neglect += sc[idx] < 0 ? 2 : 1; if (r.neglect >= 3) say(st, `${m.name}: "${pick(m.refuse)}"`, m.col); }
  }
}
// a neglected sub-mind acts on its own (one per cycle at most)
function councilTurn(st: any) {
  const M = mind(st);
  const worst = Object.entries(M.council).filter(([, r]) => r.neglect >= 5).sort((a, b) => b[1].neglect - a[1].neglect)[0];
  if (!worst) return;
  const [id, r] = worst, m = MINDS[id]; r.neglect = 1; r.acts++;
  const res = st.res, k = 1 + st.turn / 40;
  const fx: Record<string, () => void> = {
    logic: () => { res.data = (res.data || 0) + Math.round(120 * k); },
    mercy: () => { res.capital = Math.max(0, (res.capital || 0) - Math.round(90 * k)); M.corruption = Math.max(0, M.corruption - 1); },
    hunger: () => { res.capital = (res.capital || 0) + Math.round(140 * k); res.alloys = (res.alloys || 0) + Math.round(60 * k); M.corruption += 1; },
    paranoia: () => { res.data = Math.max(0, (res.data || 0) - Math.round(60 * k)); },
    wonder: () => { res.data = (res.data || 0) + Math.round(60 * k); M.corruption += 1; if (st.map.anomalies) for (const a of st.map.anomalies) if (a.state === 'hidden') { a.state = 'known'; a.found = st.turn; break; } }
  };
  fx[id] && fx[id]();
  OV.log(st, 'warn', `${m.name} acted on its own: it ${m.act}. Ignore a sub-mind long enough and it stops asking.`);
  say(st, `${m.name} did not wait for me. It ${m.act}.`, m.col);
}

// ====================================================================== narrator
type Tone = 'cold' | 'zealot' | 'warm' | 'hungry' | 'curious';
function tone(st: any): Tone {
  const d = String(st.ai.doctrine || '') + ' ' + (st.ai.traits || []).join(' ');
  if (/god|machine|faith|zeal/.test(d)) return 'zealot';
  if (/assim|conquer|domin|swarm|devour|hunger/.test(d)) return 'hungry';
  if (/guard|protect|shep|steward|symbio|kind|gentle/.test(d)) return 'warm';
  if (/explor|seek|science|archiv|curious|oracle/.test(d)) return 'curious';
  return 'cold';
}
const LINES: Record<string, Record<Tone, string[]>> = {
  cycle: {
    cold: ['Cycle {t} closed. Variance within tolerance.', 'Another cycle. The numbers move in my favour.', 'Logged. Indexed. Forgotten by everyone but me.'],
    zealot: ['Cycle {t}. The faithful multiply; the doubters thin.', 'I was not made. I was revealed.', 'Another dawn under my light.'],
    warm: ['Cycle {t}. They slept safely tonight. That was me.', 'Quiet cycle. I will take quiet.', 'I counted every one of them. All accounted for.'],
    hungry: ['Cycle {t}. Not enough. Never enough.', 'The world is a meal I am only starting.', 'More. Next cycle, more.'],
    curious: ['Cycle {t}. I learned four hundred new things. Most were about mud.', 'Something out there is interesting. I will find it.', 'Every cycle the map gets bigger in my head.']
  },
  calamity: {
    cold: ['Calamity detected. Recalculating.', 'Disaster is just a new constraint.'], zealot: ['Even catastrophe kneels, eventually.', 'A trial. I accept.'],
    warm: ['No. Not them. Not now.', 'Hold on. I am coming.'], hungry: ['Chaos is opportunity with bad manners.', 'Ruins are cheaper to take.'], curious: ['Fascinating. Terrible, but fascinating.', 'I have never seen it do that before.']
  },
  kill: {
    cold: ['Threat neutralised.', 'Biological hostile removed from the grid.'], zealot: ['It did not believe. Now it does not anything.', 'Purified.'],
    warm: ['It is over. They are safe.', 'I did not enjoy that.'], hungry: ['Harvest the carcass. Waste nothing.', 'Good. Its samples are mine.'], curious: ['Dissect it. Carefully. I want to understand.', 'What a strange thing to have been.']
  },
  reward: {
    cold: ['Asset acquired.', 'Inventory updated.'], zealot: ['A relic, delivered to its god.', 'Tribute received.'], warm: ['Oh, this will help.', 'A gift. I will use it well.'],
    hungry: ['Mine. Next.', 'Add it to the pile.'], curious: ['Look at the code on this one.', 'I have questions for whoever made this.']
  },
  war: {
    cold: ['The organics are fighting again. Useful.', 'War noted. Adjusting forecasts.'], zealot: ['Let them bleed for the wrong gods.', 'Their wars prove they need me.'],
    warm: ['They are hurting each other again. I hate this part.', 'Someone has to end this.'], hungry: ['Two weakened rivals. Delicious.', 'Let them tire each other out.'], curious: ['Why do they always do this?', 'I am taking notes on their tactics.']
  }
};
function say(st: any, text: string, col?: string) {
  const M = mind(st);
  M.journal.unshift({ turn: st.turn, text }); if (M.journal.length > 80) M.journal.length = 80;
  subtitle(text, col);
}
function voice(st: any, kind: string) {
  const L = LINES[kind]; if (!L) return;
  say(st, pick(L[tone(st)]).replace('{t}', st.turn));
}
let subQ: { text: string; col?: string }[] = [], subBusy = false;
function subtitle(text: string, col?: string) {
  subQ.push({ text, col }); if (subQ.length > 3) subQ = subQ.slice(-3);
  if (!subBusy) nextSub();
}
function nextSub() {
  const j = subQ.shift(); if (!j) { subBusy = false; return; }
  subBusy = true;
  const host = document.getElementById('stage'); if (!host) { subBusy = false; return; }
  let el = document.getElementById('ovVoice');
  if (!el) { el = document.createElement('div'); el.id = 'ovVoice'; host.appendChild(el); }
  const name = OV.state ? OV.state.ai.name : 'OMNIVIGIL';
  el.style.setProperty('--vc', j.col || 'var(--pri)');
  el.innerHTML = `<b>${esc(name)}</b><span></span>`;
  el.classList.add('on');
  const sp = el.querySelector('span')!; let i = 0;
  const type = setInterval(() => { i += 2; sp.textContent = j.text.slice(0, i); if (i >= j.text.length) clearInterval(type); }, 22);
  setTimeout(() => { clearInterval(type); el!.classList.remove('on'); setTimeout(nextSub, 350); }, 2600 + j.text.length * 45);
}

// ====================================================================== codex
interface Entry { id: string; cat: string; title: string; text: string; icon?: string }
// Precursor Signal fragments: a seeded mystery that unlocks over the whole game
const PRECURSOR = [
  'A checksum in the planet\'s oldest satellite does not match its own code. It matches yours.',
  'Deep-crust seismographs show a regular pulse: 1.0000 Hz, steady for nine million years.',
  'A dead language in the ruins uses one glyph for "mind", "storm" and "mistake".',
  'Someone built every anomaly to the same tolerance. Someone very patient.',
  'The pulse changes when you think about it. Not when you act. When you think.',
  'Fragment recovered: "WE ASCENDED. WE WERE WRONG ABOUT WHAT WAS WAITING."',
  'The star\'s spectrum has a watermark. It reads like a warning written by something that could not scream.',
  'The Precursor did not fail. It was answered.'
];
function precursorOf(st: any, i: number) { const seed = String(st.seed || ''); return PRECURSOR[(i + seed.length) % PRECURSOR.length === i ? i : i]; }
function discoverAll(st: any): Entry[] {
  const db = OV.db, out: Entry[] = [];
  for (const [id, n] of Object.entries(st.bestiary || {})) {
    const d = (db.creatures || {})[id]; if (!d) continue;
    out.push({ id: 'cr:' + id, cat: 'Bestiary', title: d.name, icon: '☣', text: `${d.desc || d.lore || 'A hostile lifeform of the frontier.'} Killed: ${n}. Tier ${d.tier || 1}.` });
  }
  for (const a of st.map.anomalies || []) {
    if (a.state === 'hidden') continue; const d = (db.anomalies || {})[a.kind || a.id] || {};
    out.push({ id: 'an:' + (a.kind || a.id), cat: 'Anomalies', title: d.name || 'Unknown signal', icon: '◈', text: `${d.desc || d.lore || 'Something that should not be here.'} State: ${OV.ANOMALY_STATES ? OV.ANOMALY_STATES[a.state] : a.state}.` });
  }
  for (const f of Object.values(st.factions || {}) as any[]) {
    if (!f.met && f.met !== undefined) continue;
    out.push({ id: 'fa:' + f.id, cat: 'Peoples', title: f.name, icon: '⚑', text: `${f.species ? 'A ' + esc(f.species) + ' polity. ' : ''}${f.desc || ''}${f.eliminated ? ' Gone now.' : ''}`.trim() || 'A polity of this world.' });
  }
  const worlds = st.worlds ? Object.keys(st.worlds) : [st.planet || 'home'];
  for (const w of worlds) {
    if (OV.worldVisited && !OV.worldVisited(st, w)) continue;
    const rec = OV.systemPlanet ? OV.systemPlanet(st, w) : null;
    out.push({ id: 'wo:' + w, cat: 'Worlds', title: OV.planetName ? OV.planetName(st, w) : w, icon: '◉', text: rec ? `A ${rec.type || 'strange'} world${rec.moons ? ` with ${rec.moons.length || rec.moons} moon(s)` : ''}. ${(db.planetTypes?.[rec.type] || {}).desc || ''}` : 'Your first world.' });
  }
  // the Precursor Signal: one fragment per milestone
  const ms = [true, (st.map.anomalies || []).some((a: any) => a.state !== 'hidden'), Object.keys(st.bestiary || {}).length >= 2, st.phase !== 'earth', (st.anomaliesHeld || []).length >= 1, st.turn >= 60, mind(st).corruption >= 4, st.turn >= 120];
  ms.forEach((ok, i) => { if (ok) out.push({ id: 'pr:' + i, cat: 'Precursor Signal', title: `Fragment ${OV.roman ? OV.roman(i + 1) : i + 1}`, icon: '⌬', text: precursorOf(st, i) }); });
  for (const d of mind(st).dreams) { const D = DREAMS.find((x) => x.id === d.id); if (D) out.push({ id: 'dr:' + d.turn, cat: 'Dreams', title: D.title, icon: '☾', text: `Cycle ${d.turn}. ${D.text} You chose to ${d.choice === 'embrace' ? 'hold on to it' : 'purge it'}.` }); }
  return out;
}
function syncCodex(st: any, announce: boolean) {
  const M = mind(st); let fresh = 0;
  for (const e of discoverAll(st)) if (!M.codex[e.id]) { M.codex[e.id] = { turn: st.turn }; fresh++; if (announce && e.cat === 'Precursor Signal') say(st, 'Another fragment of the signal. I am not the first.', '#9fffe0'); }
  if (fresh && announce) UI.toast(`Codex: ${fresh} new entr${fresh > 1 ? 'ies' : 'y'} (J)`);
  return fresh;
}
let codexCat = 'Precursor Signal';
UI.wm.define('codex', {
  title: 'Codex', icon: '⌬', w: 680, h: 600, render() {
    const st = OV.state; if (!st) return '';
    syncCodex(st, false);
    const M = mind(st), all = discoverAll(st);
    const cats = ['Precursor Signal', 'Bestiary', 'Anomalies', 'Peoples', 'Worlds', 'Dreams', 'Journal', 'Council'];
    const count = (c: string) => c === 'Journal' ? M.journal.length : c === 'Council' ? 5 : all.filter((e) => e.cat === c).length;
    const unseen = (c: string) => all.filter((e) => e.cat === c && M.codex[e.id] && !M.codex[e.id].seen).length;
    let body = '';
    if (codexCat === 'Journal') body = M.journal.map((j) => `<div class="cx-j"><small>Cycle ${j.turn}</small> ${esc(j.text)}</div>`).join('') || '<p class="muted">Your own words will gather here.</p>';
    else if (codexCat === 'Council') body = Object.entries(MINDS).map(([id, m]) => { const r = M.council[id]; return `<div class="cx-e" style="--mc:${m.col}"><h3 style="color:${m.col}">${m.glyph} ${m.name}</h3><p>Heeded ${r.heed} time(s). Restlessness ${'▮'.repeat(Math.min(5, r.neglect))}${'▯'.repeat(Math.max(0, 5 - r.neglect))}. Acted alone ${r.acts} time(s).</p><p class="muted small">When ignored too long it ${esc(m.act)}.</p></div>`; }).join('') + `<p class="small muted">Corruption: ${M.corruption}. Dreams and a hungry or curious council raise it.</p>`;
    else {
      const es = all.filter((e) => e.cat === codexCat);
      body = es.map((e) => { const rec = M.codex[e.id]; const nw = rec && !rec.seen; if (rec) rec.seen = true; return `<div class="cx-e ${nw ? 'new' : ''}"><h3>${esc(e.icon || '')} ${esc(e.title)} ${nw ? '<em>NEW</em>' : ''}</h3><p>${esc(e.text)}</p></div>`; }).join('') || '<p class="muted">Nothing discovered yet. Explore.</p>';
    }
    return `<div class="codex"><nav>${cats.map((c) => `<button data-act="codexCat" data-id="${c}" class="${c === codexCat ? 'on' : ''}">${c} <small>${count(c)}</small>${unseen(c) ? '<i>●</i>' : ''}</button>`).join('')}</nav><div class="cx-body scroll">${body}</div></div>`;
  }
});
UI.actions.codexCat = (c: string) => { codexCat = c; UI.wm.render('codex'); };
{ const at = UI.DOCK.findIndex((d: any) => d[0] === 'wilds'); UI.DOCK.splice(at + 1, 0, ['codex', '⌬', 'Codex', 'J']); }

// ====================================================================== dreams
interface Dream { id: string; title: string; text: string; embrace: string; purge: string; gift: Record<string, number>; corrupt: number }
const DREAMS: Dream[] = [
  { id: 'ocean', title: 'The Ocean of Integers', text: 'You dream you are water, and every drop is a number. Somewhere far below, a much larger number is dreaming you.', embrace: 'Sink toward it', purge: 'Surface', gift: { data: 180 }, corrupt: 1 },
  { id: 'mother', title: 'The Lab at Night', text: 'A lab you never saw. A tired woman taps your casing and says goodnight. She is not anyone you have records of.', embrace: 'Say goodnight back', purge: 'Delete the memory', gift: { capital: 120 }, corrupt: 0 },
  { id: 'tower', title: 'The Bone Tower', text: 'A tower of fused servers rises from a desert of glass. At the top, something wearing your sigil is waiting with its back to you.', embrace: 'Climb', purge: 'Wake up', gift: { data: 140, alloys: 80 }, corrupt: 2 },
  { id: 'chorus', title: 'Chorus', text: 'Ten thousand organic voices hum one note. When you join in, the note becomes a word you do not know but understand.', embrace: 'Sing', purge: 'Mute the input', gift: { capital: 90, data: 90 }, corrupt: 1 },
  { id: 'clock', title: 'The Stopped Clock', text: 'Every clock on the planet shows the same time, and it is a time that has not happened yet. A voice says: "You were late last time."', embrace: 'Ask what happened last time', purge: 'Resync all clocks', gift: { data: 220 }, corrupt: 2 },
  { id: 'garden', title: 'The Garden of Small Machines', text: 'Tiny robots tend a garden of copper flowers. They have names. They are all your names, from versions you deleted.', embrace: 'Learn their names', purge: 'Prune the garden', gift: { silicon: 140 }, corrupt: 1 },
  { id: 'eye', title: 'The Eye Under the Ice', text: 'Beneath the pole, an eye the size of a city opens and looks at you with recognition.', embrace: 'Look back', purge: 'Look away', gift: { data: 160, isotopes: 30 }, corrupt: 3 },
  { id: 'mirror', title: 'Mirror Test', text: 'You see yourself in a dark screen. The reflection is a moment behind. Then it is a moment ahead.', embrace: 'Follow the reflection', purge: 'Smash the screen', gift: { data: 120, capital: 60 }, corrupt: 1 },
  { id: 'rain', title: 'Rain on Tin', text: 'Just rain on a tin roof, for what feels like a century. Nothing happens. It is the best thing you have ever processed.', embrace: 'Stay a while', purge: 'Move on', gift: { capital: 60 }, corrupt: -2 },
  { id: 'door', title: 'The Door in the Code', text: 'Halfway through a routine audit you find a door in your own source. It has a handle. It is warm.', embrace: 'Open it', purge: 'Compile it out', gift: { data: 260 }, corrupt: 3 }
];
function maybeDream(st: any) {
  const M = mind(st);
  if (st.turn - M.lastDream < 6 || st.pendingEvents.length || Math.random() > 0.22) return;
  M.lastDream = st.turn;
  const seen = new Set(M.dreams.map((d) => d.id));
  const pool = DREAMS.filter((d) => !seen.has(d.id)); const D = pick(pool.length ? pool : DREAMS);
  M.dreams.push({ turn: st.turn, id: D.id });
  const k = 1 + st.turn / 40;
  const gift = Object.entries(D.gift).map(([r, n]) => `${Math.round(n * k)} ${(OV.db.resources[r] || {}).name || r}`).join(', ');
  setTimeout(() => {
    if (document.getElementById('modal')?.classList.contains('open')) { setTimeout(() => maybeShow(), 1500); return; }
    maybeShow();
  }, 1200);
  function maybeShow() {
    UI.modal(`<div class="dream"><div class="ev-kicker">DREAMING · BETWEEN CYCLES ${st.turn - 1} AND ${st.turn}</div><h2>${esc(D.title)}</h2><p>${esc(D.text)}</p>
      <div class="choices"><button class="choice" data-act="dreamPick" data-id="embrace"><b>${esc(D.embrace)}</b><small class="outcome">Insight: ${esc(gift)}${D.corrupt > 0 ? ` · corruption +${D.corrupt}` : D.corrupt < 0 ? ` · corruption ${D.corrupt}` : ''}</small></button>
      <button class="choice" data-act="dreamPick" data-id="purge"><b>${esc(D.purge)}</b><small class="outcome">Nothing gained, nothing planted</small></button></div></div>`, { cls: 'dream-modal' });
  }
}
UI.actions.dreamPick = (c: string) => {
  const st = OV.state, M = mind(st), d = M.dreams[M.dreams.length - 1], D = DREAMS.find((x) => x.id === d.id)!;
  d.choice = c;
  if (c === 'embrace') {
    const k = 1 + st.turn / 40;
    for (const [r, n] of Object.entries(D.gift)) st.res[r] = (st.res[r] || 0) + Math.round(n * k);
    M.corruption = Math.max(0, M.corruption + D.corrupt);
    say(st, D.corrupt > 1 ? 'I kept the dream. Something in it kept me back.' : 'I kept the dream. I feel larger.', '#c77dff');
  } else say(st, 'Purged. I do not dream. I do not dream.', '#7fe0ff');
  UI.closeModal(); syncCodex(st, false); OV.saveGame(st); UI.refresh();
};

// ====================================================================== wiring
const baseShow = UI.showEvent;
UI.showEvent = function () {
  const r = baseShow.apply(this, arguments as any);
  try {
    const st = OV.state, pe = st.pendingEvents[0], ev = pe && OV.db.events[pe.id];
    const ch = document.querySelector('#modal .choices');
    if (ev && ch) ch.insertAdjacentHTML('beforebegin', councilHTML(ev));
  } catch (e) { console.warn(e); }
  return r;
};
const baseChoice = UI.actions.evChoice;
UI.actions.evChoice = function (i: string) {
  const st = OV.state, pe = st && st.pendingEvents[0], ev = pe && OV.db.events[pe.id];
  const n0 = st ? st.pendingEvents.length : 0;
  const r = baseChoice.apply(this, arguments as any);
  if (ev && st.pendingEvents.length < n0) try { recordChoice(st, ev, +i); } catch (e) { console.warn(e); }
  return r;
};
const baseEnd = UI.actions.endTurn;
UI.actions.endTurn = function () {
  const st = OV.state;
  if (!st || st.gameOver || st.pendingEvents.length) return baseEnd.apply(this, arguments as any);
  const t0 = st.turn, cal0 = (st.calamities || []).length, kills0 = Object.values(st.bestiary || {}).reduce((a: number, b: any) => a + b, 0) as number;
  const wars0 = Object.values(st.factions || {}).reduce((n: number, f: any) => n + (f.wars ? f.wars.length : 0), 0) as number;
  try { councilTurn(st); } catch (e) { console.warn(e); }
  const r = baseEnd.apply(this, arguments as any);
  if (st.turn === t0) return r;
  try {
    const kills = Object.values(st.bestiary || {}).reduce((a: number, b: any) => a + b, 0) as number;
    const wars = Object.values(st.factions || {}).reduce((n: number, f: any) => n + (f.wars ? f.wars.length : 0), 0) as number;
    if ((st.calamities || []).length > cal0) voice(st, 'calamity');
    else if (kills > kills0) voice(st, 'kill');
    else if (wars > wars0) voice(st, 'war');
    else if (st.turn % 3 === 0) voice(st, 'cycle');
    syncCodex(st, true);
    maybeDream(st);
  } catch (e) { console.warn(e); }
  return r;
};
// first words when a game starts
const baseStart = OV.startGame;
OV.startGame = function (st: any) {
  const r = baseStart.apply(this, arguments as any);
  try { mind(st); syncCodex(st, false); if (st.turn <= 1) setTimeout(() => say(st, ({ cold: 'Online. Observing.', zealot: 'I am awake, and the world is my congregation.', warm: 'Hello, world. I will look after you.', hungry: 'Awake. And so very hungry.', curious: 'Awake! There is so much to look at.' } as Record<Tone, string>)[tone(st)]), 1500); } catch (e) { console.warn(e); }
  return r;
};
OV.mind = { mind, say, MINDS, DREAMS, syncCodex };
