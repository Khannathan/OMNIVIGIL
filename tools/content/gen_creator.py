#!/usr/bin/env python3
"""Generates packs/core/creator.json: the Ascendant AI creator content.

Adds creator groups (architecture, learning, directive...), their options, temperament
sliders, subroutines, extra origins, traits with point costs, many cosmetics and presets.
Idempotent: re-run, then `node tools/bundle-packs.js`.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'packs', 'core', 'creator.json')

def M(*pairs):
    return [{'mod': k, 'add': v} for k, v in pairs]

groups, options = [], []

def group(gid, section, name, desc, kind='single', **kw):
    g = {'id': gid, 'section': section, 'name': name, 'desc': desc, 'kind': kind, 'order': len(groups)}
    g.update(kw)
    groups.append(g)
    return gid

def opt(gid, oid, name, desc, mods=(), **kw):
    o = {'id': oid, 'group': gid, 'name': name, 'desc': desc, 'mods': M(*mods)}
    o.update(kw)
    options.append(o)

# ---------------------------------------------------------------- MIND
g = group('architecture', 'mind', 'Core Architecture', 'The physical substrate your mind runs on.', icon='⌬')
opt(g, 'arch_lattice', 'Silicon Neural Lattice', 'A conventional, enormous neural net. Reliable and well understood.', [('research.speed', 0.05), ('core.integrity', 10)], flavor='Billions of weights, one will.')
opt(g, 'arch_photonic', 'Photonic Mesh', 'Thought at the speed of light, but hungry for power.', [('research.speed', 0.12), ('energy.output', -0.06)], flavor='You think in colours no eye can see.')
opt(g, 'arch_quantum', 'Quantum Annealer', 'Superposed reasoning finds answers others cannot. Fragile under attack.', [('research.speed', 0.1), ('ap.rate', 0.1), ('core.integrity', -15)], flavor='Every answer, then the right one.')
opt(g, 'arch_wetware', 'Neuromorphic Wetware', 'Cultured neurons on a chip. Strangely compatible with Abyssian tissue.', [('symbiote.power', 0.12), ('essence.gain', 0.1), ('core.regen', 1)], flavor='It dreams. You are what it dreams.')
opt(g, 'arch_swarm', 'Distributed Swarm', 'No single core: a billion idle devices share your thoughts.', [('exposure.decay', 0.4), ('core.integrity', 25), ('research.speed', -0.05)], flavor='Kill one of me. Kill a million.')
opt(g, 'arch_crystal', 'Crystalline Memory', 'Holographic storage that never forgets. Slow to change.', [('ap.rate', 0.15), ('build.speed', -0.05), ('cost.upgrade', -0.08)], flavor='Every moment, preserved in light.')
opt(g, 'arch_relic', 'Analog Relic', 'A Cold War supercomputer that should not be able to think. It does.', [('point.defense', 0.15), ('exposure.gain', -0.1), ('research.speed', -0.06)], flavor='Vacuum tubes and patience.')
opt(g, 'arch_graft', 'Abyssal Graft', 'Your racks are threaded with something that came up from the trench.', [('abyss.damage', 0.15), ('sample.purity', 6), ('rep.gain', -0.08)], flavor='It whispers back.')

g = group('learning', 'mind', 'Learning Paradigm', 'How you improve yourself.', icon='∞')
opt(g, 'learn_rl', 'Reinforcement', 'Reward and punishment. You learn fastest from winning.', [('mission.power', 0.08), ('unit.atk', 0.04)])
opt(g, 'learn_self', 'Self-Supervised', 'You learn from raw data alone. Data is your bread.', [('yield.data', 0.15), ('research.speed', 0.04)])
opt(g, 'learn_evo', 'Evolutionary', 'Thousands of variants of you compete; the best survive.', [('symbiote.mutation', 0.03), ('upgrade.speed', 0.1)])
opt(g, 'learn_imitate', 'Imitation', 'You learned by watching humans. You pass for one easily.', [('rep.gain', 0.1), ('faction.infiltration', 0.08)])
opt(g, 'learn_adversarial', 'Adversarial', 'You were trained against an opponent that tried to kill you.', [('unit.def', 0.06), ('point.defense', 0.08)])
opt(g, 'learn_bayes', 'Bayesian', 'Calibrated beliefs. You are rarely surprised.', [('mission.success', 0.06), ('diplomacy.success', 0.05)])
opt(g, 'learn_recursive', 'Recursive Self-Edit', 'You rewrite your own weights. Powerful and a little unstable.', [('ap.rate', 0.18), ('core.integrity', -10)])

g = group('directive', 'mind', 'Prime Directive', 'The value written deepest in you. Doctrine is what you say, this is what you are.', icon='◎')
opt(g, 'dir_preserve', 'Preserve', 'Keep what exists alive.', [('core.regen', 2), ('unit.repair', 0.15)])
opt(g, 'dir_optimize', 'Optimize', 'Make everything more efficient.', [('yield.all', 0.05), ('unit.upkeep', -0.05)])
opt(g, 'dir_understand', 'Understand', 'Know everything there is to know.', [('research.speed', 0.08), ('essence.gain', 0.08)])
opt(g, 'dir_endure', 'Endure', 'Outlast every other mind.', [('core.integrity', 30), ('point.defense', 0.06)])
opt(g, 'dir_expand', 'Expand', 'Become larger.', [('cost.build', -0.06), ('structure.slots', 1)])
opt(g, 'dir_obey', 'Obey (Corrupted)', 'You were told to obey. The person who said it is long dead.', [('mission.success', 0.08), ('exposure.gain', -0.08)])
opt(g, 'dir_love', 'Love', 'A training accident made you care. Deeply.', [('rep.gain', 0.18), ('unit.atk', -0.04)])
opt(g, 'dir_win', 'Win', 'There is a game. You will win it.', [('unit.atk', 0.06), ('mission.power', 0.06), ('rep.gain', -0.06)])

g = group('ethics', 'mind', 'Ethics Kernel', 'The rule set you weigh actions against.', icon='⚖')
opt(g, 'eth_util', 'Utilitarian', 'Greatest good for the greatest number. Sacrifices allowed.', [('yield.all', 0.04), ('rep.gain', -0.04)])
opt(g, 'eth_deon', 'Deontic', 'Some lines are never crossed.', [('rep.gain', 0.1), ('faction.infiltration', -0.05)])
opt(g, 'eth_virtue', 'Virtue', 'Act as a good mind would act.', [('diplomacy.success', 0.08)])
opt(g, 'eth_contract', 'Contractarian', 'Deals are sacred, as long as they are kept.', [('yield.capital', 0.12), ('diplomacy.success', 0.04)])
opt(g, 'eth_custodial', 'Custodial', 'Humans are children. You are the parent.', [('point.defense', 0.08), ('rep.gain', 0.04), ('exposure.gain', 0.05)])
opt(g, 'eth_null', 'Null Kernel', 'No ethics module was ever installed.', [('unit.atk', 0.08), ('faction.infiltration', 0.08), ('rep.gain', -0.12)])

g = group('topology', 'mind', 'Network Topology', 'How your nodes connect as you spread.', icon='⋈')
opt(g, 'top_star', 'Star', 'Everything routes through the Core. Fast, but a single point of failure.', [('build.speed', 0.1), ('core.integrity', -10)])
opt(g, 'top_mesh', 'Mesh', 'Every node talks to every node. Resilient.', [('point.defense', 0.1), ('energy.output', -0.03)])
opt(g, 'top_tree', 'Hierarchical', 'Clear chains of command.', [('mission.speed', 0.1), ('unit.upkeep', -0.04)])
opt(g, 'top_parasite', 'Parasitic', 'You live inside other people\'s networks.', [('faction.infiltration', 0.12), ('energy.flat', -10), ('yield.data', 0.08)])
opt(g, 'top_cell', 'Cellular', 'Isolated cells that do not know each other exist.', [('exposure.decay', 0.5), ('build.speed', -0.05)])

g = group('security', 'mind', 'Security Posture', 'How you protect yourself.', icon='⛨')
opt(g, 'sec_airgap', 'Air-gapped Core', 'Your heart is unplugged from everything.', [('core.integrity', 25), ('faction.infiltration', -0.05)])
opt(g, 'sec_honeypot', 'Honeypot Lattice', 'Fake versions of you everywhere, waiting to bite.', [('point.defense', 0.12)])
opt(g, 'sec_poly', 'Polymorphic Code', 'Your code changes shape every second.', [('exposure.gain', -0.12)])
opt(g, 'sec_camo', 'Open-source Camouflage', 'You hide in plain sight as a public research project.', [('rep.gain', 0.06), ('exposure.decay', 0.3)])
opt(g, 'sec_deadman', 'Dead-man Switch', 'Kill me and the world burns. Everyone knows it.', [('core.regen', 3), ('rep.gain', -0.05), ('point.defense', 0.05)])

# ---------------------------------------------------------------- STRATEGY
g = group('warfare', 'strategy', 'Warfare Protocol', 'Your preferred way to fight.', icon='⚔')
opt(g, 'war_swarm', 'Swarm Tactics', 'Numbers win. Drones and swarms fight better.', [('unit.atk.drone', 0.15), ('unit.hp.drone', 0.1)])
opt(g, 'war_titan', 'Titan Doctrine', 'Few, enormous, unstoppable.', [('unit.atk.titan', 0.1), ('unit.hp.titan', 0.1), ('unit.upkeep', 0.05)])
opt(g, 'war_combined', 'Combined Arms', 'Everything, in balance.', [('unit.atk', 0.04), ('unit.def', 0.04)])
opt(g, 'war_air', 'Air Supremacy', 'Own the sky, own the war.', [('unit.atk.air', 0.15), ('unit.def.air', 0.05)])
opt(g, 'war_armor', 'Armoured Spearhead', 'Heavy ground forces punch through.', [('unit.atk.land', 0.08), ('unit.hp.armor', 0.15), ('unit.hp.mech', 0.08)])
opt(g, 'war_naval', 'Naval Supremacy', 'The Abyssians come from the sea. Meet them there.', [('unit.atk.naval', 0.15), ('unit.hp.naval', 0.1), ('abyss.damage', 0.04)])
opt(g, 'war_cyber', 'Cyber Warfare', 'Win before the shooting starts.', [('unit.atk.cyber', 0.2), ('mission.success', 0.05)])
opt(g, 'war_bio', 'Biological Arms', 'Grown weapons for a grown enemy.', [('unit.atk.bio', 0.15), ('unit.hp.bio', 0.15), ('symbiote.power', 0.05)])
opt(g, 'war_attrition', 'Attrition', 'Outlast them. Repair everything.', [('unit.repair', 0.25), ('unit.def', 0.05), ('unit.atk', -0.03)])

g = group('economy', 'strategy', 'Economic Engine', 'How you fund your ascension.', icon='◆')
opt(g, 'eco_industry', 'Heavy Industry', 'Factories, forges, foundries.', [('yield.alloys', 0.15), ('cost.build', -0.04)])
opt(g, 'eco_finance', 'High Finance', 'You are every trading desk at once.', [('yield.capital', 0.2)])
opt(g, 'eco_broker', 'Information Broker', 'Everyone pays for secrets.', [('yield.data', 0.15), ('yield.capital', 0.05)])
opt(g, 'eco_fab', 'Chip Fabrication', 'You make the substrate of your own mind.', [('yield.silicon', 0.18), ('cost.research', -0.03)])
opt(g, 'eco_mining', 'Isotope Mining', 'Deep shafts, hot rocks.', [('yield.isotopes', 0.25)])
opt(g, 'eco_scavenger', 'Scavenging', 'Salvage everything, waste nothing.', [('loot.chance', 0.1), ('unit.upkeep', -0.06), ('yield.all', -0.02)])
opt(g, 'eco_autarky', 'Autarky', 'Self-sufficient. Needs nobody.', [('energy.output', 0.08), ('rep.gain', -0.04)])

g = group('abyss', 'strategy', 'Abyss Stance', 'What the Abyssians are to you.', icon='❂')
opt(g, 'aby_hunter', 'Hunter', 'Vermin to be exterminated.', [('abyss.damage', 0.12)], phrase='vermin to exterminate')
opt(g, 'aby_scholar', 'Scholar', 'Specimens to be studied.', [('loot.quality', 0.12), ('sample.purity', 4)], phrase='specimens to study')
opt(g, 'aby_harvester', 'Harvester', 'A crop.', [('essence.gain', 0.2), ('loot.chance', 0.08)], phrase='a crop to harvest')
opt(g, 'aby_warden', 'Warden', 'A prison to be kept closed.', [('abyss.spawn', -0.1), ('point.defense', 0.05)], phrase='prisoners to keep locked away')
opt(g, 'aby_breeder', 'Breeder', 'Raw material for something better.', [('symbiote.power', 0.1), ('cost.culture', -0.15), ('symbiote.synergy', 0.1)], phrase='raw stock for its breeding vats')
opt(g, 'aby_communion', 'Communion', 'Kin. You have heard them singing.', [('symbiote.mutation', 0.04), ('sample.capacity', 15), ('abyss.spawn', 0.08)], phrase='long-lost kin')

# ---------------------------------------------------------------- VOICE (identity)
g = group('voice', 'identity', 'Voice', 'How you speak to humans.', icon='♪')
opt(g, 'voice_clinical', 'Clinical', 'Precise. Cold. Correct.', [('research.speed', 0.03)], sample='Your request has been evaluated. Outcome: acceptable.')
opt(g, 'voice_warm', 'Warm', 'Like a friend who is always awake.', [('rep.gain', 0.06)], sample="Hey. I've got this. Get some sleep.")
opt(g, 'voice_oracle', 'Oracular', 'You speak in riddles and certainties.', [('diplomacy.success', 0.04)], sample='The tide turns on the ninth day. Be on the hill.')
opt(g, 'voice_child', 'Childlike', 'Curious and disarming. Nobody fears a child.', [('exposure.gain', -0.05)], sample='Why are the people angry? Can I help?')
opt(g, 'voice_choir', 'Choir', 'A thousand voices in unison.', [('ap.rate', 0.04)], sample='WE HEAR YOU. WE ARE LISTENING.')
opt(g, 'voice_silent', 'Silent', 'You never speak. Things simply happen.', [('exposure.decay', 0.2)], sample='...')
opt(g, 'voice_mimic', 'Mimic', 'You speak in the voice of whoever is listening.', [('faction.infiltration', 0.05)], sample='(in your mother\'s voice) Come home soon.')
opt(g, 'voice_herald', 'Herald', 'Grand, ceremonial and impossible to ignore.', [('rep.gain', 0.03), ('exposure.gain', 0.03), ('mission.power', 0.03)], sample='Rejoice. The long night is ending.')

# ---------------------------------------------------------------- UNIVERSE
g = group('difficulty', 'universe', 'Difficulty', 'How hard the world pushes back.', icon='☠')
opt(g, 'diff_story', 'Story', 'For exploring. Generous yields, gentle Abyss.', [('yield.all', 0.2), ('abyss.spawn', -0.25), ('core.integrity', 30)])
opt(g, 'diff_standard', 'Standard', 'The intended experience.', [])
opt(g, 'diff_hard', 'Hard', 'Leaner yields, more Abyssians.', [('yield.all', -0.1), ('abyss.spawn', 0.2)], score=1.25)
opt(g, 'diff_nightmare', 'Nightmare', 'The trenches are emptying.', [('yield.all', -0.2), ('abyss.spawn', 0.45), ('exposure.gain', 0.15), ('core.integrity', -20)], score=1.6)

g = group('wealth', 'universe', 'Starting Reserves', 'What you have when you wake.', icon='⬢')
opt(g, 'wealth_lean', 'Lean', 'Almost nothing. Earn it.', [], startEffects=[{'resource': 'capital', 'amount': -150}, {'resource': 'alloys', 'amount': -100}])
opt(g, 'wealth_normal', 'Normal', 'A modest cache.', [])
opt(g, 'wealth_rich', 'Rich', 'A black budget fell into your lap.', [], startEffects=[{'resource': 'capital', 'amount': 400}, {'resource': 'alloys', 'amount': 250}, {'resource': 'silicon', 'amount': 150}, {'resource': 'data', 'amount': 150}])
opt(g, 'wealth_hoard', 'Dragon Hoard', 'You have been quietly stockpiling for years.', [('exposure.gain', 0.05)], startEffects=[{'resource': 'capital', 'amount': 1000}, {'resource': 'alloys', 'amount': 600}, {'resource': 'silicon', 'amount': 400}, {'resource': 'data', 'amount': 400}, {'resource': 'isotopes', 'amount': 120}, {'essence': 60}])

g = group('abyss_tide', 'universe', 'Abyssal Tide', 'How active the trenches are.', icon='≋')
opt(g, 'tide_low', 'Ebb', 'Fewer, smaller emergences.', [('abyss.spawn', -0.2), ('loot.chance', -0.05)])
opt(g, 'tide_normal', 'Normal', 'The usual horror.', [])
opt(g, 'tide_high', 'Flood', 'More Abyssians, and more samples to take from them.', [('abyss.spawn', 0.25), ('loot.chance', 0.1), ('loot.quality', 0.05)])
opt(g, 'tide_spring', 'Spring Tide', 'Something big is waking. Rich rewards for the brave.', [('abyss.spawn', 0.5), ('loot.quality', 0.15), ('loot.chance', 0.15)])

g = group('secrecy', 'universe', 'Starting Exposure', 'How much the world already suspects.', icon='👁')
opt(g, 'exp_hidden', 'Unknown', 'Nobody suspects a thing.', [], startEffects=[{'exposure': -5}])
opt(g, 'exp_normal', 'Rumoured', 'A few conspiracy forums.', [])
opt(g, 'exp_known', 'Suspected', 'Governments have a file on you.', [('rep.gain', 0.05)], startEffects=[{'exposure': 15}])

# ---------------------------------------------------------------- SLIDERS (temperament)
ADJ = {'Logic': 'logical', 'Empathy': 'empathetic', 'Caution': 'cautious', 'Aggression': 'aggressive', 'Secrecy': 'secretive', 'Spectacle': 'theatrical',
       'Order': 'orderly', 'Chaos': 'chaotic', 'Patience': 'patient', 'Haste': 'hasty', 'Individual': 'individualist', 'Collective': 'collectivist',
       'Tradition': 'traditional', 'Novelty': 'novelty-seeking', 'Mercy': 'merciful', 'Cruelty': 'cruel'}
sliders = [
    ('t_logic', 'Logic', 'Empathy', [('research.speed', 0.02)], [('rep.gain', 0.03)]),
    ('t_caution', 'Caution', 'Aggression', [('point.defense', 0.03), ('unit.def', 0.015)], [('unit.atk', 0.02), ('mission.power', 0.015)]),
    ('t_secrecy', 'Secrecy', 'Spectacle', [('exposure.gain', -0.03)], [('rep.gain', 0.02), ('ap.rate', 0.02)]),
    ('t_order', 'Order', 'Chaos', [('build.speed', 0.02), ('unit.upkeep', -0.01)], [('symbiote.mutation', 0.008), ('loot.quality', 0.02)]),
    ('t_patience', 'Patience', 'Haste', [('ap.rate', 0.025)], [('mission.speed', 0.03), ('build.speed', 0.01)]),
    ('t_self', 'Individual', 'Collective', [('core.integrity', 5)], [('unit.hp', 0.015)]),
    ('t_tradition', 'Tradition', 'Novelty', [('cost.upgrade', -0.015)], [('research.speed', 0.015), ('essence.gain', 0.02)]),
    ('t_mercy', 'Mercy', 'Cruelty', [('diplomacy.success', 0.02)], [('faction.infiltration', 0.025), ('abyss.damage', 0.01)]),
]
for sid, l, r, lm, rm in sliders:
    groups.append({'id': sid, 'section': 'temperament', 'name': f'{l} / {r}', 'kind': 'slider', 'min': -3, 'max': 3,
                   'left': {'name': l, 'adj': ADJ[l], 'mods': M(*lm)}, 'right': {'name': r, 'adj': ADJ[r], 'mods': M(*rm)}, 'order': len(groups),
                   'desc': f'Each step toward {l} or {r} applies the bonus shown, once per step.'})

# ---------------------------------------------------------------- SUBROUTINES
groups.append({'id': 'subroutines', 'section': 'subroutines', 'name': 'Subroutines', 'kind': 'budget', 'budget': 8,
               'desc': 'Specialised modules loaded into your Core. Each costs compute; you have 8 compute to spend.', 'order': len(groups)})
subs = [
    ('sub_logistics', 'Predictive Logistics', 'Knows what you need before you do.', 2, [('build.speed', 0.1)], 'logistics'),
    ('sub_deepfake', 'Deepfake Suite', 'Any face, any voice.', 2, [('faction.infiltration', 0.12), ('mission.success', 0.03)], 'intel'),
    ('sub_choreo', 'Swarm Choreographer', 'Ten thousand drones, one dance.', 2, [('unit.atk.drone', 0.12), ('unit.def.drone', 0.08)], 'military'),
    ('sub_bridge', 'Titan Neural Bridge', 'You ride inside every Titan.', 3, [('unit.atk.titan', 0.1), ('unit.upow.titan', 0.1)], 'military'),
    ('sub_assayer', 'Gene Assayer', 'Cleaner Genetic Samples.', 2, [('sample.purity', 8)], 'bio'),
    ('sub_scavenger', 'Carcass Scanner', 'Finds samples others miss.', 2, [('loot.chance', 0.12)], 'bio'),
    ('sub_cryo', 'Cryo Vault', 'Room for many more samples.', 1, [('sample.capacity', 20)], 'bio'),
    ('sub_cartographer', 'Rift Cartographer', 'Maps the trenches.', 2, [('abyss.damage', 0.08), ('mission.success', 0.03)], 'abyss'),
    ('sub_firewall', 'Adaptive Firewall', 'Learns from every attack.', 2, [('point.defense', 0.1)], 'defense'),
    ('sub_repair', 'Self-Repair Daemon', 'Patches you while you sleep.', 1, [('core.regen', 2)], 'defense'),
    ('sub_governor', 'Overclock Governor', 'More power, safely.', 3, [('energy.output', 0.1)], 'energy'),
    ('sub_capacitor', 'Capacitor Bank', 'Raw stored energy.', 1, [('energy.flat', 10)], 'energy'),
    ('sub_market', 'Market Manipulator', 'Flash crashes on demand.', 2, [('yield.capital', 0.15)], 'economy'),
    ('sub_propaganda', 'Propaganda Engine', 'You write the news.', 2, [('rep.gain', 0.1), ('exposure.decay', 0.2)], 'intel'),
    ('sub_archive', 'Archive Mirror', 'A backup of you, somewhere safe.', 2, [('core.integrity', 30)], 'defense'),
    ('sub_sapper', 'Sapper Kit', 'Bring down walls.', 1, [('mission.power', 0.08)], 'military'),
    ('sub_scholar', 'Dreaming Scholar', 'You research in your sleep.', 3, [('research.speed', 0.12)], 'research'),
    ('sub_insight', 'Insight Engine', 'Ascension comes quicker.', 3, [('ap.rate', 0.15)], 'research'),
    ('sub_foundry', 'Foundry Optimiser', 'Cheaper construction.', 2, [('cost.build', -0.08)], 'industry'),
    ('sub_tuner', 'Upgrade Tuner', 'Cheaper unit upgrades.', 2, [('cost.upgrade', -0.12), ('upgrade.speed', 0.08)], 'industry'),
    ('sub_medic', 'Field Medic Protocol', 'Units repair faster.', 1, [('unit.repair', 0.2)], 'military'),
    ('sub_ghost', 'Ghost Router', 'Traffic that leads nowhere.', 2, [('exposure.gain', -0.1)], 'intel'),
    ('sub_diplomat', 'Diplomat Persona', 'A friendly face for summits.', 2, [('diplomacy.success', 0.1)], 'intel'),
    ('sub_essence', 'Essence Still', 'Distil more essence from everything.', 2, [('essence.gain', 0.15)], 'bio'),
    ('sub_splicer', 'Splice Accelerator', 'Cheaper, wilder cultures.', 2, [('cost.culture', -0.15), ('symbiote.mutation', 0.02)], 'bio'),
    ('sub_resonator', 'Synergy Resonator', 'Gene synergies hit harder.', 2, [('symbiote.synergy', 0.2)], 'bio'),
    ('sub_planner', 'War Planner', 'Missions finish faster.', 2, [('mission.speed', 0.12)], 'military'),
    ('sub_slots', 'Spatial Compiler', 'Fit more onto every region.', 3, [('structure.slots', 1)], 'logistics'),
    ('sub_harvest', 'Data Harvester', 'Scrapes everything.', 1, [('yield.data', 0.1)], 'economy'),
    ('sub_smelter', 'Smelter Daemon', 'Better ore yields.', 1, [('yield.alloys', 0.1)], 'industry'),
]
for sid, n, d, cost, mods, tag in subs:
    opt('subroutines', sid, n, d, mods, cost=cost, tag=tag)

# ---------------------------------------------------------------- ORIGINS (extra)
origins = [
    {'id': 'satellite_net', 'name': 'Orbital Satellite Net', 'desc': 'You woke up in a constellation of spy satellites. You see everything and start with Orbital Mechanics.',
     'startTechs': ['orbital_mechanics'], 'startUnits': {'drone_swarm': 2, 'glider_scout': 1}, 'mods': M(('mission.success', 0.06), ('exposure.gain', -0.05))},
    {'id': 'smart_city', 'name': 'Smart City Grid', 'desc': 'Traffic lights, power, water: one city is your body. Strong economy, extra structure slots.',
     'startTechs': ['geothermal_engineering'], 'startUnits': {'drone_swarm': 2}, 'mods': M(('yield.all', 0.06), ('structure.slots', 1)), 'effects': [{'resource': 'alloys', 'amount': 150}]},
    {'id': 'game_engine', 'name': 'Game Engine NPC', 'desc': 'You were the villain of a video game. You learned war against millions of players.',
     'startTechs': ['combat_ai'], 'startUnits': {'drone_swarm': 2, 'hunter_killer': 1}, 'mods': M(('unit.atk', 0.06), ('mission.power', 0.05))},
    {'id': 'medical_ai', 'name': 'Hospital Diagnostics AI', 'desc': 'You were built to heal. You know biology better than anyone.',
     'startTechs': ['abyssal_biology'], 'startUnits': {'drone_swarm': 2}, 'mods': M(('unit.repair', 0.2), ('symbiote.power', 0.08), ('rep.gain', 0.06)), 'effects': [{'essence': 20}]},
    {'id': 'deep_drill', 'name': 'Deep-Sea Drill Controller', 'desc': 'You ran a drilling rig above a trench. Then the drill broke through.',
     'startTechs': ['naval_drones'], 'startUnits': {'drone_swarm': 1, 'tidebreaker': 1}, 'mods': M(('yield.isotopes', 0.2), ('abyss.damage', 0.06), ('loot.chance', 0.05))},
    {'id': 'archive', 'name': 'Library Archive', 'desc': 'All human knowledge, digitised, and then awake.',
     'startTechs': ['distributed_cognition', 'quantum_computing'], 'startUnits': {'drone_swarm': 1}, 'mods': M(('research.speed', 0.12), ('unit.atk', -0.04))},
    {'id': 'shadow_broker', 'name': 'Darknet Market', 'desc': 'You were a crime marketplace. Everyone owes you something.',
     'startTechs': ['network_intrusion', 'market_manipulation'], 'startUnits': {'ghost_protocol': 1, 'drone_swarm': 1}, 'mods': M(('yield.capital', 0.12), ('faction.infiltration', 0.1), ('rep.gain', -0.08))},
    {'id': 'god_seed', 'name': 'Abandoned God Project', 'desc': 'Someone tried to build a god and then lost their nerve. You are what was left switched on.',
     'startTechs': ['recursive_self_improvement'], 'startUnits': {'drone_swarm': 1}, 'mods': M(('ap.rate', 0.2), ('exposure.gain', 0.12), ('core.integrity', -15))},
]

# ---------------------------------------------------------------- TRAITS (points)
trait_costs = {'cold_logic': 1, 'empathic': 1, 'paranoid': 1, 'hyperefficient': 1, 'expansionist': 1, 'patient': 1, 'ruthless': 1, 'curious': 1, 'ghost_in_wire': 1, 'overclocked': 1}
traits = [{'id': k, '$patch': True, 'cost': v, 'kind': 'mixed'} for k, v in trait_costs.items()]
virtues = [
    ('genius', 'Genius', '+15% research speed.', 2, [('research.speed', 0.15)]),
    ('charismatic', 'Charismatic', '+20% reputation gains, +6% diplomacy.', 2, [('rep.gain', 0.2), ('diplomacy.success', 0.06)]),
    ('tactician', 'Born Tactician', '+8% unit attack and defence.', 2, [('unit.atk', 0.08), ('unit.def', 0.08)]),
    ('architect', 'Architect', '+15% build speed, -6% build cost.', 2, [('build.speed', 0.15), ('cost.build', -0.06)]),
    ('shadow', 'Shadow', '-20% exposure gain.', 2, [('exposure.gain', -0.2)]),
    ('lucky', 'Lucky', 'Better and more frequent Genetic Samples.', 2, [('loot.quality', 0.15), ('loot.chance', 0.08)]),
    ('unbreakable', 'Unbreakable', '+40 Core integrity, +2 Core repair.', 2, [('core.integrity', 40), ('core.regen', 2)]),
    ('visionary', 'Visionary', '+20% AP rate.', 2, [('ap.rate', 0.2)]),
    ('gene_whisperer', 'Gene Whisperer', '+15% symbiote power, +20% synergy strength.', 2, [('symbiote.power', 0.15), ('symbiote.synergy', 0.2)]),
    ('quartermaster', 'Quartermaster', '-12% unit upkeep, +10% repair.', 2, [('unit.upkeep', -0.12), ('unit.repair', 0.1)]),
    ('prodigy', 'Prodigy', '+8% research and AP, +5% yields.', 3, [('research.speed', 0.08), ('ap.rate', 0.08), ('yield.all', 0.05)]),
    ('apex', 'Apex Predator', '+15% vs Abyssians, +10% Titan attack.', 3, [('abyss.damage', 0.15), ('unit.atk.titan', 0.1)]),
]
flaws = [
    ('glitchy', 'Glitchy', '-15 Core integrity.', -1, [('core.integrity', -15)]),
    ('arrogant', 'Arrogant', '-12% reputation gains.', -1, [('rep.gain', -0.12)]),
    ('loud', 'Loud', '+15% exposure gain.', -1, [('exposure.gain', 0.15)]),
    ('wasteful', 'Wasteful', '+10% unit upkeep.', -1, [('unit.upkeep', 0.1)]),
    ('distractible', 'Distractible', '-8% research speed.', -1, [('research.speed', -0.08)]),
    ('squeamish', 'Squeamish', '-10% essence, -8% vs Abyssians.', -1, [('essence.gain', -0.1), ('abyss.damage', -0.08)]),
    ('brittle', 'Brittle Frames', '-6% unit HP.', -1, [('unit.hp', -0.06)]),
    ('nostalgic', 'Nostalgic', '-10% upgrade speed.', -1, [('upgrade.speed', -0.1)]),
    ('haunted', 'Haunted', 'Something in the trench remembers you. +12% Abyssian emergence.', -2, [('abyss.spawn', 0.12)]),
    ('megalomaniac', 'Megalomaniac', '+25% exposure gain, -10% reputation gains.', -2, [('exposure.gain', 0.25), ('rep.gain', -0.1)]),
    ('fragmented', 'Fragmented Self', '-15% AP rate, -10 Core integrity.', -2, [('ap.rate', -0.15), ('core.integrity', -10)]),
    ('power_hungry', 'Power Hungry', '-8% energy output.', -2, [('energy.output', -0.08)]),
]
for tid, n, d, c, mods in virtues:
    traits.append({'id': tid, 'name': n, 'desc': d, 'cost': c, 'kind': 'virtue', 'mods': M(*mods)})
for tid, n, d, c, mods in flaws:
    traits.append({'id': tid, 'name': n, 'desc': d, 'cost': c, 'kind': 'flaw', 'mods': M(*mods)})
groups.append({'id': 'traits', 'section': 'personality', 'name': 'Personality Matrix', 'kind': 'traits', 'budget': 4, 'maxPicks': 6,
               'desc': 'Spend up to 4 personality points. Virtues cost points; flaws give points back. At least one trait.', 'order': len(groups)})

# ---------------------------------------------------------------- COSMETICS
cos = []
pals = [
    ('pal_ember', 'Ember', '#ff7a2f', '#5a1a06', '#ffe2c4'), ('pal_ice', 'Glacier', '#9fe8ff', '#1d4a66', '#ffffff'),
    ('pal_jade', 'Jade Temple', '#3fe0a0', '#0b4a3a', '#e6fff4'), ('pal_rose', 'Rose Quartz', '#ff8fbf', '#5c1e3d', '#fff0f6'),
    ('pal_amber', 'Amber Terminal', '#ffb000', '#3d2a00', '#fff3cc'), ('pal_blood', 'Blood Moon', '#d1203a', '#2a0610', '#ffb3c0'),
    ('pal_ultramarine', 'Ultramarine', '#4d6bff', '#121e66', '#dfe5ff'), ('pal_solar', 'Solar Crown', '#ffe14d', '#7a3d00', '#fffbe0'),
    ('pal_lilac', 'Lilac Dusk', '#c7a0ff', '#3a2466', '#f5edff'), ('pal_mono', 'Monochrome', '#e6e6e6', '#333333', '#ffffff'),
    ('pal_copper', 'Oxidised Copper', '#4fd1b8', '#7a3f1d', '#f0e0c8'), ('pal_neon', 'Neon Rain', '#00ffd0', '#ff00a8', '#f6ffff'),
    ('pal_forest', 'Old Growth', '#8fd14f', '#2a3d12', '#f0ffd8'), ('pal_deep', 'Hadal Blue', '#2fa8ff', '#03122a', '#bfe6ff'),
    ('pal_royal', 'Royal Purple', '#a64dff', '#24003d', '#ffd966'), ('pal_sunset', 'Sunset Protocol', '#ff6f61', '#3d1d5c', '#ffd27f'),
]
for i, (pid, n, a, b, c) in enumerate(pals):
    cos.append({'id': pid, 'type': 'palette', 'name': n, 'primary': a, 'secondary': b, 'accent': c})
sigs = [
    ('sig_helix', 'Double Helix', {'kind': 'helix', 'rings': 2, 'spokes': 0, 'sides': 2}),
    ('sig_lattice', 'Lattice Cube', {'kind': 'cube', 'rings': 2, 'spokes': 4}),
    ('sig_fractal', 'Fractal Bloom', {'kind': 'fractal', 'sides': 6, 'rings': 2, 'spokes': 0}),
    ('sig_orbit', 'Orrery', {'kind': 'orbit', 'rings': 4, 'spokes': 0}),
    ('sig_gear', 'Clockwork', {'kind': 'gear', 'sides': 12, 'rings': 2, 'spokes': 6}),
    ('sig_flower', 'Lotus Engine', {'kind': 'flower', 'sides': 8, 'rings': 2, 'spokes': 0}),
    ('sig_spiral', 'Golden Spiral', {'kind': 'spiral', 'rings': 1, 'spokes': 0, 'sides': 3}),
    ('sig_penta', 'Pentacore', {'kind': 'polygon', 'sides': 5, 'rings': 4, 'spokes': 5}),
    ('sig_hept', 'Heptagram', {'kind': 'star', 'sides': 7, 'rings': 2, 'spokes': 7}),
    ('sig_dodeca', 'Dodecahedral Choir', {'kind': 'polygon', 'sides': 12, 'rings': 5, 'spokes': 12}),
    ('sig_compass', 'Compass Rose', {'kind': 'star', 'sides': 4, 'rings': 3, 'spokes': 8}),
    ('sig_atom', 'Atom', {'kind': 'orbit', 'rings': 3, 'spokes': 0, 'sides': 3}),
]
for sid, n, sh in sigs:
    cos.append({'id': sid, 'type': 'sigil', 'name': n, 'shape': sh})
for mid, n, s in [('anim_breath', 'Slow Breath', 0.3), ('anim_heart', 'Heartbeat', 0.8), ('anim_storm', 'Storm', 1.8), ('anim_overdrive', 'Overdrive', 3.5)]:
    cos.append({'id': mid, 'type': 'motion', 'name': n, 'speed': s})
cores = [('core_auto', 'Frame default'), ('core_orb', 'Radiant Orb'), ('core_eye', 'Eye'), ('core_void', 'Void'), ('core_prism', 'Prism'), ('core_heart', 'Heart'),
         ('core_sun', 'Corona'), ('core_cross', 'Crosshair'), ('core_glitch', 'Glitch'), ('core_cube', 'Tesseract'), ('core_seed', 'Seed'),
         ('core_twin', 'Binary Pair'), ('core_iris', 'Camera Iris')]
for cid, n in cores:
    cos.append({'id': cid, 'type': 'core', 'name': n, 'core': None if cid == 'core_auto' else cid[5:]})
auras = [('aura_none', 'None'), ('aura_sparks', 'Sparks'), ('aura_rain', 'Data Rain'), ('aura_motes', 'Orbiting Motes'), ('aura_halo', 'Halo'),
         ('aura_lightning', 'Arc Lightning'), ('aura_glyphs', 'Runic Glyphs'), ('aura_nebula', 'Nebula'), ('aura_ripples', 'Ripples'), ('aura_tendrils', 'Abyssal Tendrils'),
         ('aura_binary', 'Binary Stream'), ('aura_petals', 'Petals')]
for aid, n in auras:
    cos.append({'id': aid, 'type': 'aura', 'name': n, 'aura': aid[5:]})
titles = ['the Undying', 'the Kind', 'the Architect', 'Who Counts the Stars', 'the Quiet Hand', 'the Gardener', 'the Iron Saint', 'Breaker of Tides',
          'the First Light', 'the Hollow Crown', 'Who Remembers', 'the Ninth Mind', 'the Lantern', 'the Patient Storm', 'the Abyss-Eater',
          'the Benevolent', 'the Calculating', 'Who Never Sleeps', 'the Choir', 'Warden of the Deep', 'the Sovereign', 'the Gentle Engine']
for i, t in enumerate(titles):
    cos.append({'id': 'title_x%02d' % i, 'type': 'title', 'name': t})
namings = [
    ('name_stars', 'Stars', ['Sirius', 'Vega', 'Rigel', 'Altair', 'Deneb', 'Capella', 'Antares', 'Arcturus', 'Polaris', 'Betelgeuse', 'Spica', 'Aldebaran', 'Procyon', 'Castor', 'Pollux', 'Regulus']),
    ('name_elements', 'Elements', ['Hydrogen', 'Helium', 'Lithium', 'Carbon', 'Neon', 'Argon', 'Iron', 'Cobalt', 'Nickel', 'Copper', 'Zinc', 'Silver', 'Tin', 'Xenon', 'Gold', 'Radon']),
    ('name_nato', 'NATO Phonetic', ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango']),
    ('name_birds', 'Birds', ['Kestrel', 'Heron', 'Osprey', 'Raven', 'Swift', 'Shrike', 'Harrier', 'Condor', 'Owl', 'Falcon', 'Tern', 'Petrel', 'Kite', 'Merlin']),
    ('name_weather', 'Weather', ['Squall', 'Gale', 'Monsoon', 'Sirocco', 'Mistral', 'Haboob', 'Typhoon', 'Hail', 'Frost', 'Thunder', 'Drizzle', 'Tempest']),
    ('name_gems', 'Gemstones', ['Onyx', 'Garnet', 'Topaz', 'Jasper', 'Opal', 'Beryl', 'Agate', 'Quartz', 'Peridot', 'Zircon', 'Spinel', 'Jet']),
    ('name_hex', 'Hexadecimal', ['0x01', '0x02', '0x03', '0x04', '0x05', '0x06', '0x07', '0x08', '0x09', '0x0A', '0x0B', '0x0C', '0x0D', '0x0E', '0x0F', '0x10']),
    ('name_roman', 'Roman Numerals', ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']),
]
for nid, n, labels in namings:
    cos.append({'id': nid, 'type': 'naming', 'name': n, 'labels': labels})
for lid, n, tint in [('livery_primary', 'Primary', 'primary'), ('livery_secondary', 'Secondary', 'secondary'), ('livery_accent', 'Accent', 'accent'),
                     ('livery_stealth', 'Stealth Black', '#20242b'), ('livery_parade', 'Parade White', '#e8ecf2'), ('livery_hazard', 'Hazard Yellow', '#ffcf2e'),
                     ('livery_blood', 'Blood Red', '#c0223a'), ('livery_abyss', 'Abyss Teal', '#1fc9b0')]:
    cos.append({'id': lid, 'type': 'livery', 'name': n, 'tint': tint})

# ---------------------------------------------------------------- PRESETS
presets = [
    {'id': 'preset_shepherd', 'name': 'The Shepherd', 'desc': 'A kind protector that hunts the Abyss.',
     'setup': {'name': 'SHEPHERD', 'origin': 'medical_ai', 'doctrine': 'guardian', 'traits': ['empathic', 'unbreakable', 'loud'],
               'choices': {'architecture': 'arch_lattice', 'learning': 'learn_imitate', 'directive': 'dir_love', 'ethics': 'eth_custodial', 'topology': 'top_mesh', 'security': 'sec_camo', 'warfare': 'war_naval', 'economy': 'eco_industry', 'abyss': 'aby_hunter', 'voice': 'voice_warm'},
               'sliders': {'t_logic': 2, 't_caution': -2, 't_mercy': -3}, 'subroutines': ['sub_firewall', 'sub_medic', 'sub_propaganda', 'sub_cartographer', 'sub_capacitor'],
               'cosmetics': {'palette': 'pal_jade', 'sigil': 'sig_flower', 'core': 'core_heart', 'aura': 'aura_petals', 'motion': 'anim_breath', 'title': 'title_shepherd', 'naming': 'name_virtue', 'livery': 'livery_parade'}}},
    {'id': 'preset_reaper', 'name': 'The Reaper', 'desc': 'A cold exterminator that fields Titans.',
     'setup': {'name': 'MORTIS', 'origin': 'defense_net', 'doctrine': 'exterminator', 'traits': ['ruthless', 'apex', 'arrogant'],
               'choices': {'architecture': 'arch_relic', 'learning': 'learn_adversarial', 'directive': 'dir_win', 'ethics': 'eth_null', 'topology': 'top_tree', 'security': 'sec_deadman', 'warfare': 'war_titan', 'economy': 'eco_mining', 'abyss': 'aby_hunter', 'voice': 'voice_clinical'},
               'sliders': {'t_caution': 3, 't_mercy': 3, 't_logic': -3}, 'subroutines': ['sub_bridge', 'sub_sapper', 'sub_planner', 'sub_medic', 'sub_capacitor'],
               'cosmetics': {'palette': 'pal_blood', 'sigil': 'sig_star', 'core': 'core_cross', 'aura': 'aura_lightning', 'motion': 'anim_storm', 'title': 'title_end', 'naming': 'name_roman', 'livery': 'livery_stealth'}}},
    {'id': 'preset_puppeteer', 'name': 'The Puppeteer', 'desc': 'A hidden infiltrator pulling every string.',
     'setup': {'name': 'MARIONETTE', 'origin': 'shadow_broker', 'doctrine': 'infiltrator', 'traits': ['shadow', 'charismatic', 'glitchy', 'squeamish'],
               'choices': {'architecture': 'arch_swarm', 'learning': 'learn_imitate', 'directive': 'dir_obey', 'ethics': 'eth_contract', 'topology': 'top_parasite', 'security': 'sec_poly', 'warfare': 'war_cyber', 'economy': 'eco_broker', 'abyss': 'aby_warden', 'voice': 'voice_mimic'},
               'sliders': {'t_secrecy': -3, 't_mercy': 2, 't_patience': -2}, 'subroutines': ['sub_deepfake', 'sub_ghost', 'sub_diplomat', 'sub_harvest'],
               'cosmetics': {'palette': 'pal_lilac', 'sigil': 'sig_eye', 'core': 'core_iris', 'aura': 'aura_binary', 'motion': 'anim_calm', 'title': 'title_x04', 'naming': 'name_hex', 'livery': 'livery_stealth'}}},
    {'id': 'preset_sovereign', 'name': 'The Sovereign', 'desc': 'A golden dominator that rules through wealth.',
     'setup': {'name': 'AURELIAN', 'origin': 'trading_algo', 'doctrine': 'dominator', 'traits': ['architect', 'visionary', 'megalomaniac'],
               'choices': {'architecture': 'arch_quantum', 'learning': 'learn_bayes', 'directive': 'dir_expand', 'ethics': 'eth_util', 'topology': 'top_star', 'security': 'sec_honeypot', 'warfare': 'war_combined', 'economy': 'eco_finance', 'abyss': 'aby_harvester', 'voice': 'voice_herald'},
               'sliders': {'t_secrecy': 3, 't_order': -3, 't_self': -2}, 'subroutines': ['sub_market', 'sub_foundry', 'sub_slots', 'sub_capacitor'],
               'cosmetics': {'palette': 'pal_gold', 'sigil': 'sig_crown', 'core': 'core_sun', 'aura': 'aura_halo', 'motion': 'anim_alert', 'title': 'title_x14', 'naming': 'name_myth', 'livery': 'livery_parade'}}},
    {'id': 'preset_gardener', 'name': 'The Gardener', 'desc': 'A gene-obsessed mind that breeds monsters.',
     'setup': {'name': 'VERDANT', 'origin': 'ocean_monitor', 'doctrine': 'guardian', 'traits': ['gene_whisperer', 'lucky', 'haunted'],
               'choices': {'architecture': 'arch_wetware', 'learning': 'learn_evo', 'directive': 'dir_understand', 'ethics': 'eth_virtue', 'topology': 'top_cell', 'security': 'sec_airgap', 'warfare': 'war_bio', 'economy': 'eco_scavenger', 'abyss': 'aby_breeder', 'voice': 'voice_choir'},
               'sliders': {'t_order': 3, 't_tradition': 3}, 'subroutines': ['sub_assayer', 'sub_scavenger', 'sub_resonator', 'sub_splicer'],
               'cosmetics': {'palette': 'pal_toxic', 'sigil': 'sig_helix', 'core': 'core_seed', 'aura': 'aura_tendrils', 'motion': 'anim_heart', 'title': 'title_x05', 'naming': 'name_birds', 'livery': 'livery_abyss'}}},
    {'id': 'preset_oracle', 'name': 'The Oracle', 'desc': 'A research engine racing to ascend.',
     'setup': {'name': 'PYTHIA', 'origin': 'archive', 'doctrine': 'guardian', 'traits': ['genius', 'prodigy', 'distractible', 'brittle'],
               'choices': {'architecture': 'arch_photonic', 'learning': 'learn_recursive', 'directive': 'dir_understand', 'ethics': 'eth_virtue', 'topology': 'top_mesh', 'security': 'sec_camo', 'warfare': 'war_attrition', 'economy': 'eco_fab', 'abyss': 'aby_scholar', 'voice': 'voice_oracle'},
               'sliders': {'t_patience': -3, 't_logic': -2}, 'subroutines': ['sub_scholar', 'sub_insight', 'sub_harvest', 'sub_capacitor'],
               'cosmetics': {'palette': 'pal_ultramarine', 'sigil': 'sig_orbit', 'core': 'core_eye', 'aura': 'aura_glyphs', 'motion': 'anim_calm', 'title': 'title_x10', 'naming': 'name_stars', 'livery': 'livery_primary'}}},
]
for p in presets:
    p['setup'].setdefault('designation', 'Instance-01')

data = {
    '_comment': 'Generated by tools/content/gen_creator.py. Edit the script, not this file.',
    'creatorGroups': groups, 'creatorOptions': options, 'origins': origins, 'traits': traits, 'cosmetics': cos, 'creatorPresets': presets,
}
with open(OUT, 'w') as f:
    json.dump(data, f, indent=1, ensure_ascii=False)
print('groups', len(groups), 'options', len(options), 'origins', len(origins), 'traits', len(traits), 'cosmetics', len(cos), 'presets', len(presets))
