#!/usr/bin/env python3
"""Turns the 434-entry Cosmic Catalog (tools/content/cosmic-catalog.data.json, made from
cosmic-catalog.md by the Cosmic Atlas preview) into game content: packs/core/catalog.json.

Every entry becomes a `cosmicCatalog` record with:
  kind    world | moon | small | star | sky | mega | phen | weird   (where it can appear)
  base    the planet type whose terrain a world uses (worlds only)
  look    {b: biome id of the star-system renderer, t: [r,g,b] tint}   (worlds and moons)
  mods    effects, read from the entry's hook and description, scaled by rarity
  yields  extra per-site yield for worlds you hold, per-level yield for moon outposts
  weight  roll weight (rarity, then phase: later-phase entries are rarer in one system)
  event   true for phenomena that also strike as short events during play

Run:  python3 tools/content/gen_catalog.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = json.load(open(os.path.join(HERE, 'cosmic-catalog.data.json')))

RAR = {'Common': 10, 'Uncommon': 5, 'Rare': 2.2, 'Epic': 0.9, 'Legendary': 0.35, 'Mythic': 0.08}
MAG = {'Common': 1, 'Uncommon': 1.4, 'Rare': 2, 'Epic': 2.8, 'Legendary': 3.8, 'Mythic': 5.5}
PHASE_W = {'EF': 1, 'SR': 1, 'SW': 0.5, 'IC': 0.25}

SEC_KIND = {
    'Rocky and terrestrial planets': 'world', 'Exotic and theoretical planets': 'world', 'Gas, ice and giant worlds': 'world',
    'Moons': 'moon', 'Small bodies and debris': 'small', 'Stars and stellar remnants': 'star',
    'Nebulae, clusters and galactic structures': 'sky', 'Artificial and megastructure bodies': 'mega',
}
EVENT_SECS = {'Stellar and solar events', 'Planetary and space-weather events'}

# ---------- worlds: which planet type carries the terrain ----------
BASE_OVERRIDE = {
    'B4': 'terran', 'B5': 'ice_giant', 'B10': 'toxic', 'B11': 'lava', 'B13': 'ocean', 'B16': 'ocean', 'B17': 'desert',
    'B18': 'barren', 'B19': 'eyeball', 'B21': 'desert', 'B22': 'iron', 'B23': 'terran', 'B24': 'terran', 'B27': 'jungle',
    'B28': 'terran', 'B29': 'barren', 'B30': 'barren', 'B31': 'lava', 'B32': 'barren',
    'B33': 'terran', 'B34': 'iron', 'B35': 'ocean', 'B36': 'barren', 'B37': 'ice_giant', 'B38': 'barren', 'B39': 'crystal',
    'B40': 'crystal', 'B41': 'terran', 'B42': 'gas', 'B43': 'gas', 'B44': 'gas', 'B45': 'chthonian', 'B46': 'chthonian',
    'B47': 'ice', 'B48': 'iron', 'B49': 'crystal', 'B50': 'chthonian', 'B51': 'barren', 'B52': 'crystal', 'B53': 'ocean',
    'B54': 'crystal', 'B55': 'crystal', 'B56': 'crystal', 'B57': 'barren', 'B58': 'iron', 'B59': 'ocean', 'B60': 'desert',
    'B61': 'gas', 'B62': 'lava', 'B63': 'ocean', 'B64': 'gas', 'B65': 'ice', 'B66': 'iron', 'B67': 'iron', 'B68': 'crystal',
    'B69': 'iron', 'B70': 'ice', 'B71': 'crystal', 'B72': 'fungal', 'B73': 'fungal', 'B74': 'desert', 'B75': 'barren',
    'B76': 'barren', 'B77': 'terran', 'B78': 'jungle', 'B79': 'crystal', 'B80': 'lava',
    'B81': 'gas', 'B82': 'ice_giant', 'B83': 'gas', 'B84': 'gas', 'B85': 'gas', 'B86': 'gas', 'B87': 'gas', 'B88': 'ice_giant',
    'B89': 'gas', 'B90': 'gas',
}
BASE_RULES = [
    (r'lava|magma|molten', 'lava'), (r'ice|snow|frozen|tundra', 'ice'), (r'ocean|water|steam|hycean', 'ocean'),
    (r'desert|salt|sand|canyon|dust|sinkhole', 'desert'), (r'iron|metal|magnet', 'iron'), (r'carbon|diamond|glass|tar', 'carbon'),
    (r'crystal', 'crystal'), (r'garden|forest|jungle', 'jungle'), (r'living|fung', 'fungal'), (r'toxic|acid|sulfur|venus', 'toxic'),
]
# renderer biome ids: 0 terran 1 fungal 2 crystal 3 lava 4 ice 5 toxic 6 lunar 7 hycean 8 eyeball 9 diamond
#                     10 chthonian 11 computronium 12 rogue 13 gas giant 14 strange matter 15 living
TYPE_LOOK = {
    'terran': (0, [1, 1, 1]), 'ocean': (7, [1, 1, 1]), 'desert': (6, [1.3, 1.08, 0.78]), 'jungle': (0, [0.92, 1.06, 0.9]),
    'ice': (4, [1, 1, 1]), 'lava': (3, [1, 1, 1]), 'toxic': (5, [1, 1, 1]), 'barren': (6, [1, 1, 1]), 'carbon': (9, [0.7, 0.72, 0.8]),
    'iron': (10, [0.92, 0.9, 0.95]), 'gas': (13, [1, 1, 1]), 'ice_giant': (13, [0.62, 0.86, 1.25]), 'eyeball': (8, [1, 1, 1]),
    'crystal': (2, [1, 1, 1]), 'fungal': (1, [1, 1, 1]), 'ammonia': (4, [1.1, 1.08, 0.78]), 'chthonian': (10, [1, 1, 1]),
}
LOOK_RULES = [
    (r'computronium|clockwork|library|graveyard of ais|chessboard|sim-shell|cube world|seed vault|crystalline mind|matrioshka|jupiter brain', 11),
    (r'rogue|dark-matter|ghost|hawking|black-hole|time-dilated|halo world|tomb', 12),
    (r'strange|quark|probability|mirror|fractal|tesseract|antimatter|mobius|klein|paper-thin|backwards|boson|toroidal|origin', 14),
    (r'living|hungry|dreaming|prison|flesh', 15),
    (r'hycean|ice-shell|water giant|steam|supercritical|ocean', 7),
    (r'diamond|glass|carbon', 9),
    (r'twilight|eyeball|polar-sun', 8),
    (r'gas giant|giant|jupiter|neptune|puffy|cloud-only|helium world|metallic-hydrogen|brown dwarf', 13),
    (r'crystal|singing', 2),
    (r'lava|\bhell\b|plasma|magnetar|pulsar|primordial|tidally heated', 3),
    (r'snowball|ice|tundra|aerogel', 4),
    (r'salt|sulfur|ferrofluid', 5),
]
TINTS = {  # a few hand tints so neighbours of the same biome read differently
    'B8': [1.25, 1.2, 1.2], 'B9': [1.2, 0.85, 0.75], 'B12': [0.9, 1.05, 1.25], 'B15': [1.25, 0.95, 0.75], 'B20': [0.9, 0.85, 0.85],
    'B22': [0.8, 1.15, 1.2], 'B26': [0.95, 0.95, 1.0], 'B29': [0.85, 0.8, 1.05], 'B42': [1.15, 1.1, 1.0], 'B43': [1.3, 0.95, 0.75],
    'B44': [1.15, 1.05, 1.2], 'B45': [0.8, 0.75, 0.7], 'B62': [1.1, 0.8, 1.2], 'B66': [0.6, 0.6, 0.75], 'B67': [1.2, 1.0, 0.7],
    'B83': [1.1, 0.6, 0.55], 'B84': [1.0, 0.9, 1.15], 'B85': [1.05, 1.0, 0.85], 'B86': [1.35, 0.8, 1.05], 'B88': [0.55, 0.8, 1.3],
    'B89': [0.85, 0.85, 1.25], 'B90': [1.2, 0.9, 0.95], 'B37': [0.7, 0.9, 1.35], 'B5': [0.65, 0.95, 1.15],
}
MOON_KIND = {'B93': 'volcanic', 'B94': 'ice', 'B95': 'ocean', 'B104': 'ocean', 'B101': 'ice', 'B105': 'barren', 'B99': 'barren'}
MOON_LOOK = {'volcanic': (6, [1.3, 0.85, 0.6]), 'ice': (6, [0.88, 1.0, 1.2]), 'ocean': (6, [0.75, 0.95, 1.2]), 'barren': (6, [1, 1, 1])}

# ---------- effects ----------
BOONS = [
    (r'research|science|stud(y|ies)|knowledge|learn|library|archive|think|mind|comput|lens|signal|message|decod', 'research.speed', 0.02),
    (r'energy|power|heat|solar|sunlight|starlight|flare|fusion|plasma|burn', 'energy.output', 0.03),
    (r'antimatter', 'yield.antimatter', 0.06), (r'neutron|degenerate|ultra-dense', 'yield.neutronium', 0.06),
    (r'dark matter|dark-matter|dark energy', 'yield.darkmatter', 0.06), (r'exotic|strange matter|quark|negative mass', 'yield.exoticmatter', 0.06),
    (r'\btime\b|chrono|causal|future|past|clock|temporal|turns?\b', 'yield.chronoflux', 0.06), (r'quantum|probabil|superposition|foam', 'yield.quantumfoam', 0.06),
    (r'metal|iron|\bore\b|mine|mining|alloy|wreck|salvage|hull', 'yield.alloys', 0.04), (r'crystal|diamond|glass|gem|silic', 'yield.voidcrystal', 0.05),
    (r'helium|hydrogen|\bgas\b|fuel|skim', 'yield.helium3', 0.05),
    (r'\blife\b|bio|spore|organism|grow|forest|garden|living|creature|ecolog|sea life|alive|beast|whale|swarm', 'yield.xenobiomass', 0.05),
    (r'shield|defen|armou?r|hide|hidden|fortress|wall|shelter|cover', 'planet.defense', 0.04),
    (r'travel|wormhole|speed|drive|gate|fast|shortcut|jump|route|slingshot|orbit', 'space.speed', 0.03),
    (r'probe|sensor|\bsee\b|watch|scan|view|telescope|map', 'sat.sight', 0.04),
    (r'trade|rich|wealth|value|treasure|market|price', 'yield.capital', 0.04),
    (r'weapon|attack|beam|war|strike|lance|kill', 'mission.power', 0.03),
    (r'\bdata\b|record|memory|recording', 'yield.data', 0.04),
]
COSTS = [
    (r'melt|corrod|eat|decay|crumble|erode', 'cost.build', 0.015),
    (r'storm|radiation|flare|scorch|lethal|deadly|burst|hazard|danger', 'unit.hp', -0.012),
    (r'block|jam|blind|interfer|scramble|noise', 'mission.success', -0.01),
    (r'slow|drag|delay|stall', 'space.speed', -0.015),
]
YIELD_OF = {'yield.alloys': 'alloys', 'yield.voidcrystal': 'voidcrystal', 'yield.helium3': 'helium3', 'yield.xenobiomass': 'xenobiomass',
            'yield.antimatter': 'antimatter', 'yield.neutronium': 'neutronium', 'yield.darkmatter': 'darkmatter', 'yield.exoticmatter': 'exoticmatter',
            'yield.chronoflux': 'chronoflux', 'yield.quantumfoam': 'quantumfoam', 'yield.data': 'data', 'yield.capital': 'capital',
            'energy.output': 'stellarplasma', 'research.speed': 'data'}
RARE_RES = {'stellarplasma', 'antimatter', 'neutronium', 'darkmatter', 'exoticmatter', 'chronoflux', 'quantumfoam'}


def effects(e, kind):
    text = (e['name'] + ' ' + e['hook'] + ' ' + e['desc']).lower()
    m = MAG[e['rarity']]
    mods, seen = [], set()
    for rx, key, v in BOONS:
        if len(mods) >= 2: break
        if key in seen or not re.search(rx, text): continue
        seen.add(key); mods.append({'mod': key, 'add': round(v * m, 3)})
    if not mods: mods.append({'mod': 'yield.data', 'add': round(0.04 * m, 3)})
    for rx, key, v in COSTS:
        if re.search(rx, e['hook'].lower()):
            mods.append({'mod': key, 'add': round(v * min(m, 3), 3)}); break
    yields = {}
    if kind in ('world', 'moon'):
        for md in mods:
            r = YIELD_OF.get(md['mod'])
            if r and md['add'] > 0:
                yields[r] = round((0.5 if r in RARE_RES else 1.5) * m, 1)
                break
        if not yields: yields['data'] = round(1 * m, 1)
    return mods, yields


def base_of(e):
    if e['id'] in BASE_OVERRIDE: return BASE_OVERRIDE[e['id']]
    t = (e['name'] + ' ' + e['desc']).lower()
    for rx, b in BASE_RULES:
        if re.search(rx, t): return b
    return 'barren'


def look_of(e, base):
    t = e['name'].lower() + ' ' + e['desc'].lower()
    b, tint = TYPE_LOOK.get(base, (0, [1, 1, 1]))
    if base in ('gas', 'ice_giant'): b = 13
    else:
        for rx, bid in LOOK_RULES:
            if re.search(rx, e['name'].lower()) or (bid in (11, 12, 14, 15) and re.search(rx, t)):
                b = bid; break
    return {'b': b, 't': TINTS.get(e['id'], tint)}


out = []
for r in RAW:
    e = dict(id=r[0], name=r[1], desc=r[2], hook=r[3], phase=r[4], rarity=r[5], sec=r[6])
    kind = SEC_KIND.get(e['sec']) or ('phen' if e['id'][0] == 'P' else 'weird')
    rec = {'id': e['id'], 'name': e['name'], 'desc': e['desc'], 'hook': e['hook'], 'phase': e['phase'], 'rarity': e['rarity'],
           'sec': e['sec'], 'kind': kind, 'weight': round(RAR[e['rarity']] * PHASE_W[e['phase']], 3)}
    mods, yields = effects(e, kind)
    rec['mods'] = mods
    if yields: rec['yields'] = yields
    if kind == 'world':
        rec['base'] = base_of(e); rec['look'] = look_of(e, rec['base'])
    if kind == 'moon':
        mk = MOON_KIND.get(e['id'])
        if mk: rec['moonKind'] = mk
        b, t = MOON_LOOK[mk or 'barren']; rec['look'] = {'b': b, 't': t}
    if kind == 'phen' and e['sec'] in EVENT_SECS: rec['event'] = True
    out.append(rec)

dst = os.path.join(ROOT, 'packs', 'core', 'catalog.json')
json.dump({'_comment': 'AUTO-GENERATED by tools/content/gen_catalog.py from the 434-entry Cosmic Catalog. Edit the generator, not this file.',
           'cosmicCatalog': out}, open(dst, 'w'), indent=1)
from collections import Counter
print('wrote', dst, len(out), Counter(x['kind'] for x in out))
print('bases', Counter(x.get('base') for x in out if x['kind'] == 'world'))
print('looks', Counter(x['look']['b'] for x in out if x['kind'] == 'world'))
