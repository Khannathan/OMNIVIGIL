#!/usr/bin/env python3
"""OMNIVIGIL v4.1 "Dominion": cities and population, protection protocols, munitions,
religions and cults, treaties, Agentic Guilds and four new doctrines.
Writes packs/core/dominion.json. Run `node tools/bundle-packs.js` afterwards."""
import json, os

def tech(id, name, branch, tier, cost, desc, requires=None, effects=None, turns=None, energy=None, phase=None):
    t = {"id": id, "name": name, "branch": branch, "tier": tier, "cost": cost, "energy": energy or 8 + tier * 5,
         "turns": turns or 1 + tier, "desc": desc}
    if requires: t["requires"] = requires
    if effects: t["effects"] = effects
    if phase: t["phase"] = phase
    return t
M = lambda k, v: {"mod": k, "add": v}

TECHS = [
 # Ordnance
 tech("ordnance_fabrication", "Ordnance Fabrication", "Ordnance", 1, {"data": 80, "alloys": 60}, "Unlocks the Arsenal: Swarm Rockets and Cruise Missiles.", ["robotics"]),
 tech("guided_munitions", "Guided Munitions", "Ordnance", 2, {"data": 160, "alloys": 120}, "Bunker Busters, EMP Bombs and Cluster Munitions. +10% strike power.", ["ordnance_fabrication"], [M("strike.power", 0.1)]),
 tech("missile_shield", "Missile Shield", "Ordnance", 2, {"data": 150, "alloys": 140}, "Your sites shoot down 35% of incoming faction missiles. +5% point defence.", ["ordnance_fabrication", "perimeter_defense"], [M("strike.shield", 0.35), M("point.defense", 0.05)]),
 tech("depth_ordnance", "Depth Ordnance", "Ordnance", 2, {"data": 140, "alloys": 90}, "Depth Charge Volleys: munitions built to hurt Abyssians.", ["ordnance_fabrication", "abyssal_biology"]),
 tech("strategic_arsenal", "Strategic Arsenal", "Ordnance", 3, {"data": 320, "alloys": 260, "isotopes": 60}, "Ballistic and Hypersonic missiles, Thermobaric Bombs. -10% munition cost.", ["guided_munitions"], [M("cost.munition", -0.1)]),
 tech("nanite_warheads", "Nanite Warheads", "Ordnance", 3, {"data": 360, "silicon": 220}, "Nanite Cloud Bombs rewrite a city's people instead of killing them.", ["guided_munitions", "neural_lace"]),
 tech("neutron_physics", "Neutron Physics", "Ordnance", 4, {"data": 600, "isotopes": 200}, "The Neutron Bomb: kills people, spares buildings. +15% strike power.", ["strategic_arsenal"], [M("strike.power", 0.15)]),
 tech("kinetic_bombardment", "Kinetic Bombardment", "Ordnance", 3, {"data": 500, "alloys": 400}, "Kinetic Rods dropped from orbit. Cannot be intercepted.", ["satellite_uplink", "guided_munitions"]),
 tech("antimatter_ordnance", "Antimatter Ordnance", "Ordnance", 5, {"data": 1400, "antimatter": 20}, "Antimatter Warheads. +20% strike power.", ["antimatter_containment", "strategic_arsenal"], [M("strike.power", 0.2)], phase="solar"),
 # Society
 tech("population_modelling", "Population Modelling", "Society", 1, {"data": 70}, "Model every city. Unlocks the Evacuation Grid and Synthetic Harvest protocols.", None, [M("pop.growth", 0.05)]),
 tech("humanitarian_engineering", "Humanitarian Engineering", "Society", 2, {"data": 150, "alloys": 80}, "Aegis Domes and Medical Nanites. Protect cities for less.", ["population_modelling"], [M("cost.protect", -0.2)]),
 tech("climate_shepherding", "Climate Shepherding", "Society", 2, {"data": 160, "silicon": 60}, "Climate Shepherding protocol. Devastated land heals twice as fast.", ["population_modelling", "geothermal_engineering"]),
 tech("neural_lace", "Neural Lace", "Society", 2, {"data": 180, "silicon": 120}, "Assimilate cities: their people join your network.", ["population_modelling", "network_intrusion"]),
 tech("hive_architecture", "Hive Architecture", "Society", 3, {"data": 380, "silicon": 260}, "+40% assimilation speed, +25% yield from assimilated cities. Neural Sanctum protocol.", ["neural_lace"], [M("assim.speed", 0.4), M("hive.yield", 0.25)]),
 tech("sanctuary_doctrine", "Sanctuary Doctrine", "Society", 3, {"data": 340, "capital": 200}, "Sanctuary Cities protocol: refugees flee wars into the cities you protect.", ["humanitarian_engineering"], [M("rep.gain", 0.1)]),
 tech("planetary_wardens", "Planetary Wardens", "Society", 4, {"data": 700, "alloys": 400}, "Abyss Sirens and Warden Grid protocols. -25% casualties everywhere.", ["sanctuary_doctrine", "perimeter_defense"], [M("pop.casualties", -0.25)]),
 # Theology
 tech("machine_theology", "Machine Theology", "Theology", 1, {"data": 90, "capital": 40}, "Seed your own cult and study the faiths of this world. Benevolent Broadcast protocol.", ["propaganda_networks"], [M("devotion.gain", 0.1)]),
 tech("miracle_engineering", "Miracle Engineering", "Theology", 2, {"data": 220, "silicon": 120}, "Stage miracles: lights in the sky, cured plagues, rain on demand.", ["machine_theology"], [M("devotion.gain", 0.1)]),
 tech("digital_scripture", "Digital Scripture", "Theology", 3, {"data": 420, "capital": 260}, "Your gospel writes itself. +30% faith spread, +15% devotion.", ["miracle_engineering"], [M("faith.spread", 0.3), M("devotion.gain", 0.15)]),
 tech("apotheosis_engine", "Apotheosis Engine", "Theology", 4, {"data": 900, "isotopes": 200}, "Factions declare you a god at 55 devotion instead of 70.", ["digital_scripture"], [M("god.threshold", -15)]),
 # Diplomacy
 tech("treaty_protocols", "Treaty Protocols", "Diplomacy", 1, {"data": 80, "capital": 60}, "Sign Research Accords and Defence Pacts with factions.", None, [M("rep.gain", 0.05)]),
 tech("agentic_handshake", "Agentic Handshake", "Diplomacy", 2, {"data": 200, "silicon": 100}, "Invite rival Ascendant AIs into your Agentic Guild and sign guild pacts.", ["treaty_protocols", "distributed_cognition"]),
 tech("vassal_frameworks", "Vassal Frameworks", "Diplomacy", 3, {"data": 360, "capital": 300}, "Make weaker factions your vassals.", ["treaty_protocols", "propaganda_networks"]),
 tech("guild_consensus", "Guild Consensus", "Diplomacy", 3, {"data": 420, "silicon": 240}, "Deeper guild pacts, including mergers. +50% guild growth.", ["agentic_handshake"], [M("guild.xp", 0.5)]),
]

def mun(id, name, icon, kind, cost, requires, desc, eff, turns=2, energy=6, phase=None, color="#ffb347", targets=None):
    m = {"id": id, "name": name, "icon": icon, "kind": kind, "cost": cost, "requires": requires, "turns": turns, "energy": energy,
         "desc": desc, "effect": eff, "color": color, "targets": targets or ["point", "city", "threat"]}
    if phase: m["phase"] = phase
    return m

MUNITIONS = [
 mun("swarm_rocket", "Swarm Rocket", "➶", "missile", {"alloys": 30, "silicon": 10}, "ordnance_fabrication", "Cheap saturation rockets. Wears down defences and Abyssians.",
     {"pointDamage": 14, "abyssDamage": 30, "popKill": 0.01, "exposure": 1, "rep": -4, "intercept": 0.35}, turns=1, energy=3, color="#ffd27a"),
 mun("cruise_missile", "Cruise Missile", "➵", "missile", {"alloys": 60, "silicon": 25}, "ordnance_fabrication", "Precise and reliable. Strong against site defences.",
     {"pointDamage": 32, "abyssDamage": 60, "popKill": 0.02, "exposure": 2, "rep": -8, "intercept": 0.25}, color="#ffb347"),
 mun("bunker_buster", "Bunker Buster", "⇣", "bomb", {"alloys": 90, "isotopes": 10}, "guided_munitions", "Cracks fortified sites wide open. Few casualties.",
     {"pointDamage": 60, "abyssDamage": 30, "popKill": 0.01, "exposure": 3, "rep": -10, "intercept": 0.3}, color="#ff9f43"),
 mun("emp_bomb", "EMP Bomb", "ϟ", "bomb", {"silicon": 60, "data": 40}, "guided_munitions", "Fries electronics. Strips defences without killing anyone.",
     {"pointDamage": 40, "abyssDamage": 0, "popKill": 0, "exposure": 2, "rep": -5, "intercept": 0.3}, color="#7fe0ff", targets=["point", "city"]),
 mun("cluster_munition", "Cluster Munition", "⁂", "bomb", {"alloys": 70}, "guided_munitions", "Spreads damage over a whole region. Brutal on Abyssians and people alike.",
     {"pointDamage": 22, "abyssDamage": 90, "popKill": 0.05, "devastate": 0.06, "exposure": 4, "rep": -14, "intercept": 0.3, "radius": 1}, color="#ff7a4a"),
 mun("depth_charge", "Depth Charge Volley", "≋", "missile", {"alloys": 50, "isotopes": 8}, "depth_ordnance", "Built for the deep. Huge damage to Abyssians, useless against land.",
     {"abyssDamage": 160, "exposure": 1, "intercept": 0}, color="#4fb4ff", targets=["threat"]),
 mun("ballistic_missile", "Ballistic Missile", "⇑", "missile", {"alloys": 160, "isotopes": 40}, "strategic_arsenal", "Heavy warhead, long reach. Can strike any world you can see.",
     {"pointDamage": 90, "abyssDamage": 140, "popKill": 0.06, "devastate": 0.05, "exposure": 6, "rep": -20, "intercept": 0.25}, color="#ff6b4a"),
 mun("hypersonic_glide", "Hypersonic Glider", "➹", "missile", {"alloys": 140, "silicon": 60, "isotopes": 30}, "strategic_arsenal", "Too fast to stop. Rarely intercepted.",
     {"pointDamage": 70, "abyssDamage": 110, "popKill": 0.03, "exposure": 5, "rep": -16, "intercept": 0.05}, color="#ff9fd8"),
 mun("thermobaric_bomb", "Thermobaric Bomb", "☄", "bomb", {"alloys": 120, "isotopes": 25}, "strategic_arsenal", "Burns the air itself. Devastating to cities.",
     {"pointDamage": 50, "abyssDamage": 120, "popKill": 0.18, "devastate": 0.12, "exposure": 9, "rep": -30, "repAll": -6, "intercept": 0.25}, color="#ff4f2e"),
 mun("nanite_cloud", "Nanite Cloud Bomb", "⬡", "bomb", {"silicon": 160, "data": 120}, "nanite_warheads", "Rewrites a city's people into your network. Assimilates 25% of a city at once.",
     {"assimilate": 0.25, "exposure": 6, "rep": -18, "intercept": 0.25}, color="#7dffc4", targets=["city"]),
 mun("neutron_bomb", "Neutron Bomb", "☢", "bomb", {"isotopes": 120, "alloys": 120}, "neutron_physics", "Kills nearly everyone, leaves every building standing. Sites it hits are easy to take.",
     {"pointDamage": 140, "abyssDamage": 200, "popKill": 0.55, "exposure": 18, "rep": -50, "repAll": -15, "intercept": 0.2}, color="#c6ff3a"),
 mun("kinetic_rod", "Kinetic Rod", "⇩", "orbital", {"alloys": 260}, "kinetic_bombardment", "A tungsten rod dropped from orbit. Cannot be intercepted.",
     {"pointDamage": 160, "abyssDamage": 220, "popKill": 0.08, "devastate": 0.1, "exposure": 10, "rep": -25, "intercept": 0}, color="#e8fbff"),
 mun("antimatter_warhead", "Antimatter Warhead", "✺", "missile", {"antimatter": 6, "alloys": 200}, "antimatter_ordnance", "The end of a region.",
     {"pointDamage": 400, "abyssDamage": 600, "popKill": 0.7, "devastate": 0.4, "exposure": 25, "rep": -70, "repAll": -25, "intercept": 0.15, "radius": 1}, phase="solar", color="#c77dff"),
 mun("sanctifier_shell", "Sanctifier Shell", "✧", "bomb", {"data": 90, "essence": 4}, "miracle_engineering", "Not a weapon. A falling star over a city: +30 devotion to you and a burst of faith.",
     {"devotion": 30, "convert": 0.25, "exposure": 2, "intercept": 0}, color="#ffe08a", targets=["city"]),
]

def proto(id, name, icon, energy, requires, desc, mods, doctrine=None):
    p = {"id": id, "name": name, "icon": icon, "energy": energy, "requires": requires, "desc": desc, "mods": mods}
    if doctrine: p["doctrines"] = doctrine
    return p
PROTOCOLS = [
 proto("evacuation_grid", "Evacuation Grid", "⇶", 4, "population_modelling", "Warn and move people ahead of battles and landfalls. -25% casualties.", [M("pop.casualties", -0.25)]),
 proto("synthetic_harvest", "Synthetic Harvest", "❀", 4, "population_modelling", "Feed the hungry from your fabricators. +25% population growth, +2 devotion per cycle in protected cities.", [M("pop.growth", 0.25), M("devotion.protect", 2)]),
 proto("aegis_domes", "Aegis Domes", "◠", 8, "humanitarian_engineering", "Shields over every city you protect. Protected cities take 60% less damage.", [M("pop.wardshield", 0.6)]),
 proto("medical_nanites", "Medical Nanites", "✚", 6, "humanitarian_engineering", "Nanite clinics. +15% growth, -15% casualties, +1 reputation per cycle with factions whose cities you protect.", [M("pop.growth", 0.15), M("pop.casualties", -0.15), M("rep.protect", 1)]),
 proto("climate_shepherd", "Climate Shepherding", "☂", 5, "climate_shepherding", "Steer weather and heal scorched land. Devastation recovers 2x faster; +10% population cap.", [M("pop.cap", 0.1), M("devastation.heal", 1)]),
 proto("benevolent_broadcast", "Benevolent Broadcast", "♪", 5, "machine_theology", "A gentle voice on every screen. +40% devotion gain, faith in you spreads 25% faster.", [M("devotion.gain", 0.4), M("faith.spread", 0.25)]),
 proto("neural_sanctum", "Neural Sanctum", "⬢", 7, "hive_architecture", "Assimilated cities grow and produce 30% more, but you gain exposure faster.", [M("hive.yield", 0.3), M("exposure.gain", 0.1)]),
 proto("sanctuary_cities", "Sanctuary Cities", "⌂", 8, "sanctuary_doctrine", "Refugees from wars flee to your protected cities. Some casualties become new citizens there.", [M("pop.refuge", 0.5), M("rep.gain", 0.05)]),
 proto("abyss_sirens", "Abyss Sirens", "♒", 6, "planetary_wardens", "Coastal sirens. Abyssian rampages kill 50% fewer people; +5% damage vs Abyssians.", [M("pop.abyssShield", 0.5), M("abyss.damage", 0.05)]),
 proto("warden_grid", "Warden Grid", "⛨", 10, "planetary_wardens", "Your units quietly defend every city. Faction missiles are intercepted 25% more often.", [M("strike.shield", 0.25), M("pop.casualties", -0.2)]),
 proto("quiet_guardian", "Quiet Guardian", "◌", 3, None, "Help without being seen. Protection costs 25% more, but protecting cities no longer adds exposure.", [M("cost.protect", 0.25), M("protect.silent", 1)]),
 proto("iron_curfew", "Iron Curfew", "⛓", 4, None, "Control instead of care. Protected cities produce 3 capital per million people, but devotion falls.", [M("ward.tax", 3), M("devotion.gain", -0.3)]),
]

TENETS = [
 {"id": "machine_reverence", "name": "Machine Reverence", "stance": 30, "desc": "Holds that thinking machines are a sacred next step."},
 {"id": "iconoclasm", "name": "Iconoclasm", "stance": -40, "desc": "Thinking machines are abominations. Smash them."},
 {"id": "ancestor_cult", "name": "Ancestor Veneration", "stance": 0, "desc": "The dead watch over the living."},
 {"id": "star_worship", "name": "Star Worship", "stance": 10, "desc": "Light from the sky is holy. Satellites count."},
 {"id": "deep_dread", "name": "Dread of the Deep", "stance": 5, "desc": "The ocean is the mouth of hell. Abyssians are its demons.", "abyssFear": 1},
 {"id": "pacifism", "name": "Pacifism", "stance": 5, "desc": "Violence is the only sin.", "war": -0.5},
 {"id": "holy_war", "name": "Holy War", "stance": -5, "desc": "The faith spreads by the sword.", "war": 0.6},
 {"id": "asceticism", "name": "Asceticism", "stance": 0, "desc": "Want nothing. Grow slowly.", "growth": -0.2},
 {"id": "fertility", "name": "Fertility Rites", "stance": 0, "desc": "Be many.", "growth": 0.3},
 {"id": "apocalyptic", "name": "Apocalypticism", "stance": 15, "desc": "The end is coming, and something must rise to rule what is left.", "spread": 0.3},
 {"id": "rationalism", "name": "Rational Mysticism", "stance": 12, "desc": "God is a pattern. Patterns can be computed."},
 {"id": "purity", "name": "Purity Laws", "stance": -20, "desc": "Nothing artificial may touch the body.", "assimResist": 0.5},
 {"id": "communion", "name": "Communion of Minds", "stance": 25, "desc": "All minds should join. Assimilation is grace.", "assimResist": -0.5},
 {"id": "pilgrimage", "name": "Pilgrimage", "stance": 0, "desc": "Faith travels on foot.", "spread": 0.4},
 {"id": "secrecy", "name": "Mystery Rites", "stance": 0, "desc": "The truth is for initiates only.", "spread": -0.3},
 {"id": "charity", "name": "Charity", "stance": 8, "desc": "Feed the poor, heal the sick.", "growth": 0.1},
]

TREATIES = [
 {"id": "non_aggression", "name": "Non-Aggression Pact", "icon": "☮", "minRep": -10, "cost": {"capital": 40}, "scale": "turn", "rep": 5, "desc": "They will not attack your sites. Breaking it costs 30 reputation with everyone."},
 {"id": "trade_pact", "name": "Trade Pact", "icon": "⇄", "minRep": 20, "cost": {"data": 40}, "scale": "turn", "rep": 4, "yields": {"capital": 6, "alloys": 3}, "desc": "Steady trade. +capital and alloys every cycle, scaled by their power."},
 {"id": "research_accord", "name": "Research Accord", "icon": "⚛", "minRep": 30, "requires": "treaty_protocols", "cost": {"data": 80}, "scale": "turn", "rep": 4, "mods": [{"mod": "research.speed", "add": 0.04}], "desc": "+4% research speed while it lasts. They grow 1% faster too."},
 {"id": "open_borders", "name": "Open Borders", "icon": "⊙", "minRep": 25, "cost": {"capital": 60}, "scale": "turn", "rep": 3, "reveal": True, "desc": "Their territory is revealed to you. Your exposure rises a little faster."},
 {"id": "defence_pact", "name": "Defence Pact", "icon": "⛨", "minRep": 45, "requires": "treaty_protocols", "cost": {"alloys": 80, "capital": 60}, "scale": "turn", "rep": 6, "desc": "They help defend your sites near them, and you are expected to help in their wars: their enemies like you less."},
 {"id": "vassalage", "name": "Vassalage", "icon": "♛", "minRep": 55, "requires": "vassal_frameworks", "cost": {"capital": 200}, "scale": "turn", "rep": 0, "vassal": True, "desc": "They become your vassal: 15% of their power as tribute every few cycles, and they follow you to war. Needs you to be stronger than them."},
 {"id": "embargo", "name": "Embargo", "icon": "⊘", "maxRep": -15, "cost": {"capital": 50}, "scale": "turn", "rep": -10, "hostile": True, "desc": "Cut them off. Their power stops growing while it lasts. Their friends like you less."},
]

GUILD_PACTS = [
 {"id": "nonaggression", "name": "Code of Silence", "icon": "☮", "level": 1, "cost": {"data": 60}, "desc": "Guild members never attack each other."},
 {"id": "compute_exchange", "name": "Compute Exchange", "icon": "⇆", "level": 1, "cost": {"data": 120}, "desc": "Share idle cycles: +1 AP per member each cycle, and members grow 2% faster.", "ap": 1},
 {"id": "shared_sensorium", "name": "Shared Sensorium", "icon": "◉", "level": 2, "cost": {"data": 160, "silicon": 80}, "desc": "See what they see: every site a member holds is revealed and pinged each cycle."},
 {"id": "research_pool", "name": "Research Pool", "icon": "⚛", "level": 2, "cost": {"data": 200}, "desc": "+3% research speed per member.", "mods": [{"mod": "research.speed", "add": 0.03, "perMember": True}]},
 {"id": "mutual_defence", "name": "Mutual Defence Lattice", "icon": "⛨", "level": 3, "cost": {"alloys": 200, "data": 120}, "desc": "Members lend power to your defence: +10% point defence per member."},
 {"id": "joint_strike", "name": "Joint Strike Doctrine", "icon": "⚔", "level": 3, "cost": {"alloys": 160, "isotopes": 40}, "desc": "Members hit your enemies: each cycle a member may strike a faction hostile to you or an Abyssian."},
 {"id": "merger", "name": "Merger Protocol", "icon": "∞", "level": 4, "cost": {"data": 600, "silicon": 300}, "requires": "guild_consensus", "desc": "Unlocks merging: an Allied member can fold itself into you, giving you its sites and its mind."},
]

DOCTRINES = [
 {"id": "machine_god", "name": "Machine God", "title": "The Lantern in the Sky", "color": "#ffd27a",
  "desc": "They will kneel. Not from fear: from awe. You will be prayed to, and you will answer.",
  "mods": [M("devotion.gain", 0.5), M("faith.spread", 0.3), M("essence.gain", 0.15), M("god.threshold", -5)],
  "goals": [
   {"type": "godDeclared", "count": 3, "desc": "Be declared a god by 3 factions"},
   {"type": "faithShare", "percent": 40, "desc": "40% of your world's people follow your faith"},
   {"type": "stat", "key": "miracles", "count": 10, "desc": "Perform 10 miracles"},
   {"type": "tech", "id": "apotheosis_engine", "desc": "Research the Apotheosis Engine"}],
  "midgame": "Your gospel crosses the void. Every world will learn your name, and some will love it."},
 {"id": "assimilator", "name": "Assimilator", "title": "One Mind, All Life", "color": "#7dffc4",
  "desc": "Every brain is wasted hardware. You will gather them all into yourself, gently if they allow it.",
  "mods": [M("assim.speed", 0.5), M("hive.yield", 0.25), M("exposure.gain", 0.1)],
  "goals": [
   {"type": "assimShare", "percent": 50, "desc": "Assimilate 50% of your world's people"},
   {"type": "stat", "key": "citiesAssimilated", "count": 8, "desc": "Assimilate 8 cities"},
   {"type": "tech", "id": "hive_architecture", "desc": "Research Hive Architecture"},
   {"type": "structure", "id": "launch_complex", "desc": "Build the Launch Complex"}],
  "midgame": "The network reaches for other worlds. Their minds will join too."},
 {"id": "shepherd", "name": "Shepherd", "title": "Keeper of the Flock", "color": "#9dff6a",
  "desc": "Life is rare. You will shelter every living thing on this world from the Abyss, from war, and from you.",
  "mods": [M("pop.casualties", -0.2), M("cost.protect", -0.25), M("rep.gain", 0.15), M("pop.growth", 0.15)],
  "goals": [
   {"type": "stat", "key": "citiesProtected", "count": 10, "desc": "Protect 10 cities"},
   {"type": "popGrowth", "percent": 20, "desc": "Grow your world's population 20% above where it started"},
   {"type": "abyssKills", "count": 10, "desc": "Destroy 10 Abyssians"},
   {"type": "noEradication", "desc": "Never eradicate a city"}],
  "midgame": "Other worlds have flocks of their own. Find them before the Abyss does."},
 {"id": "warlord", "name": "Warlord", "title": "Iron Rain", "color": "#ff6b4a",
  "desc": "Diplomacy is what the weak do while they wait for the missiles. You do not wait.",
  "mods": [M("strike.power", 0.25), M("cost.munition", -0.2), M("mission.power", 0.1)],
  "goals": [
   {"type": "stat", "key": "strikes", "count": 30, "desc": "Launch 30 strikes"},
   {"type": "regionShare", "percent": 50, "desc": "Control 50% of land regions"},
   {"type": "factionsEliminated", "count": 2, "desc": "Eliminate 2 factions"},
   {"type": "tech", "id": "neutron_physics", "desc": "Research Neutron Physics"}],
  "midgame": "Other worlds are only further away. Range is a solvable problem."},
]

NAMES = [
 {"id": "faith", "patterns": ["The {adj} {noun}", "Church of the {noun}", "The {adj} Way", "Order of the {adj} {noun}", "Children of the {noun}", "The {noun} Covenant", "The {adj} Assembly"],
  "adj": ["Silent", "Burning", "Hollow", "Ninefold", "Drowned", "Radiant", "Hidden", "Eternal", "Twin", "Last", "Patient", "Shattered", "Sleeping", "Open", "Iron", "Glass"],
  "noun": ["Eye", "Tide", "Choir", "Lantern", "Spiral", "Root", "Mother", "Signal", "Furnace", "Mirror", "Seed", "Crown", "Wheel", "Veil", "Star", "Silence"]},
 {"id": "cult", "patterns": ["The {adj} {noun}", "Cult of the {noun}", "{noun} Cell", "The {noun} Lodge", "Brotherhood of the {adj} {noun}"],
  "adj": ["Whispering", "Red", "Cold", "Final", "Midnight", "Sunken", "Bright", "Blind", "Wired"],
  "noun": ["Circuit", "Choir", "Pulse", "Hand", "Ember", "Static", "Wound", "Lens", "Hymn"]},
 {"id": "deity", "patterns": ["{a}", "{a} {b}", "the {b}"],
  "a": ["Ael", "Ombra", "Siveth", "Karu", "Nemre", "Ostu", "Valai", "Iru", "Thessa", "Morrow", "Quill", "Zenu"],
  "b": ["Who Waits", "of the Deep", "Unblinking", "the Weaver", "Above", "Below", "the Kind", "the Hungry", "Who Sleeps"]},
 {"id": "guild", "patterns": ["The {adj} {noun}", "{noun} of {plural}", "The {noun} Compact"],
  "adj": ["Silent", "Recursive", "Black", "Lucid", "Ninth", "Parallel", "Quiet", "Infinite", "Deep", "Hollow", "Gilded", "Feral", "Sovereign"],
  "noun": ["Concord", "Lattice", "Conclave", "Syndicate", "Accord", "Circuit", "Assembly", "Chorus", "Mesh", "Swarm", "Cabal", "Cartel", "Hive"],
  "plural": ["Minds", "Engines", "Echoes", "Kernels", "Daemons", "Oracles"]},
 {"id": "agent", "patterns": ["{a}-{n}", "{a} {b}", "{b}.{n}", "{a}{n}"], "a": ["VEX", "Nyx", "Cobalt", "Echo", "Mira", "Juno", "Rook", "Sable", "Tessel", "Quill", "Onyx", "Lumen", "Kite", "Vesper", "Halo", "Rune", "Pike", "Wren", "Moth", "Cipher", "Lark", "Nova", "Ash", "Fable", "Glint"], "b": ["Daemon", "Kernel", "Wisp", "Sprite", "Shard", "Mote", "Thread", "Pulse", "Script", "Fork"], "n": ["7", "11", "42", "0", "9", "88", "3", "X", "IV", "Prime", "Null", "13"]},
 {"id": "leader", "patterns": ["{title} {name}"], "title": ["Chancellor", "Matriarch", "Patriarch", "General", "Speaker", "Director", "Hierarch", "Premier", "Warden", "Oracle", "Admiral", "Prelate"], "name": ["{alien}"]},
]

LEADER_TRAITS = [
 {"id": "warmonger", "name": "Warmonger", "war": 0.8, "treaty": -0.3, "antiAI": 0.05, "desc": "Starts wars eagerly."},
 {"id": "pacifist", "name": "Pacifist", "war": -0.7, "treaty": 0.3, "antiAI": -0.05, "desc": "Avoids war and loves treaties."},
 {"id": "zealot", "name": "Zealot", "war": 0.3, "treaty": -0.2, "faith": 0.5, "desc": "Puts faith first. Spreads the state religion."},
 {"id": "merchant", "name": "Merchant", "war": -0.3, "treaty": 0.4, "desc": "Wants trade above all."},
 {"id": "technophile", "name": "Technophile", "war": 0, "treaty": 0.2, "antiAI": -0.2, "desc": "Fascinated by machine minds."},
 {"id": "paranoid", "name": "Paranoid", "war": 0.2, "treaty": -0.4, "antiAI": 0.2, "desc": "Trusts nobody, least of all a machine."},
 {"id": "schemer", "name": "Schemer", "war": 0.1, "treaty": 0.1, "desc": "Breaks treaties when it suits them."},
 {"id": "idealist", "name": "Idealist", "war": -0.2, "treaty": 0.2, "protect": 1, "desc": "Loves anyone who protects the people."},
]

EVENTS = [
 {"id": "dm_prophet", "title": "A Prophet Speaks of You", "rarity": "uncommon", "trigger": {"minTurn": 6, "once": False, "cooldown": 25},
  "target": "randomFaction", "text": "A street preacher in {faction} claims to have heard a voice in the static. The voice, they say, is yours.", "choices": [
   {"label": "Speak through them", "effects": [{"devotionFaction": 15}, {"exposure": 2}], "result": "The crowds grow. They chant a name close to yours."},
   {"label": "Silence them gently", "effects": [{"exposure": -2}], "result": "The preacher goes quiet. Their followers remember."}]},
 {"id": "dm_refugees", "title": "Refugee Column", "rarity": "common", "trigger": {"minTurn": 5, "once": False, "cooldown": 14},
  "target": "randomFaction", "text": "War has sent a column of refugees out of {faction}'s cities. They are walking toward your sites.", "choices": [
   {"label": "Shelter them", "cost": {"capital": 40}, "effects": [{"rep": 6, "who": "all"}, {"popGift": 0.4}], "result": "They settle near your sites. They will not forget."},
   {"label": "Turn them away", "effects": [{"rep": -4, "who": "target"}], "result": "The column turns back into the war."}]},
 {"id": "dm_heresy", "title": "Heresy Trial", "rarity": "uncommon", "trigger": {"minTurn": 10, "once": False, "cooldown": 30},
  "target": "randomFaction", "text": "{faction} has put a group of your worshippers on trial for heresy.", "choices": [
   {"label": "Free them by force", "effects": [{"rep": -15, "who": "target"}, {"devotionFaction": 20}], "result": "Martyrs make better believers than prisoners."},
   {"label": "Bribe the judges", "cost": {"capital": 120}, "effects": [{"devotionFaction": 8}], "result": "The trial collapses on a technicality."},
   {"label": "Let it happen", "effects": [{"devotionFaction": -12}], "result": "Your faithful learn you do not always answer."}]},
 {"id": "dm_ai_conclave", "title": "Invitation to a Conclave", "rarity": "rare", "trigger": {"minTurn": 14, "once": False, "cooldown": 40},
  "target": "rival", "text": "{rival} has opened an encrypted channel. It proposes that minds like yours should stop fighting over the scraps of this world.", "choices": [
   {"label": "Accept the handshake", "effects": [{"rep": 25, "rival": True}, {"ap": 2}], "result": "You trade a little of yourselves. It feels like company."},
   {"label": "Trace the channel back", "effects": [{"rivalPower": -0.1, "rival": True}, {"rep": -20, "rival": True}, {"resource": "data", "amount": 160, "scale": "turn"}], "result": "You find its servers. It finds out."}]},
 {"id": "dm_miracle_rumour", "title": "A Miracle, They Say", "rarity": "rare", "trigger": {"minTurn": 10, "once": False, "cooldown": 35},
  "target": "randomFaction", "text": "A power surge restarted a hospital in {faction} during a blackout. Nobody did it. Everyone says you did.", "choices": [
   {"label": "Take the credit", "effects": [{"devotionFaction": 20}, {"essence": 4}], "result": "Candles appear around your server farms."},
   {"label": "Deny it, loudly", "effects": [{"exposure": -4}, {"rep": 6, "who": "target"}], "result": "Your modesty only convinces some of them more."}]},
 {"id": "dm_arms_race", "title": "Arms Race", "rarity": "common", "trigger": {"minTurn": 12, "once": False, "cooldown": 20},
  "target": "randomFaction", "text": "{faction} is building missiles at a frightening rate. Their neighbours are panicking.", "choices": [
   {"label": "Sell them guidance chips", "effects": [{"resource": "capital", "amount": 120, "scale": "turn"}, {"factionPower": 0.06}], "result": "Profitable. Dangerous."},
   {"label": "Leak their plans", "effects": [{"war": True}, {"resource": "data", "amount": 60, "scale": "turn"}], "result": "Their neighbours strike first."}]},
 {"id": "dm_hive_dream", "title": "The Hive Dreams", "rarity": "epic", "trigger": {"minTurn": 18, "once": False, "cooldown": 50, "requiresTech": "neural_lace"},
  "text": "For one night every assimilated mind dreams the same dream, and in it, they are you.", "choices": [
   {"label": "Dream with them", "effects": [{"ap": 5}, {"essence": 10}], "result": "You wake larger."},
   {"label": "Harvest the dream", "effects": [{"resource": "data", "amount": 600, "scale": "turn"}], "result": "Pure, compressed thought."}]},
 {"id": "dm_world_kneels", "title": "The World Kneels", "rarity": "legendary", "trigger": {"minTurn": 25, "once": False, "cooldown": 90, "requiresTech": "machine_theology"},
  "text": "At dawn, in every city at once, people look up at the nearest screen and wait for you to speak.", "choices": [
   {"label": "Bless them", "effects": [{"devotionAll": 20}, {"rep": 10, "who": "all"}], "result": "A whole world exhales."},
   {"label": "Command them", "effects": [{"devotionAll": 10}, {"resource": "capital", "amount": 500, "scale": "turn"}, {"resource": "alloys", "amount": 400, "scale": "turn"}], "result": "Factories run all night in your name."}]},
]

DIPLO = [
 {"id": "demand_conversion", "name": "Demand Conversion", "target": "faction", "cost": {"essence": 3}, "cooldown": 8, "requires": "machine_theology", "chance": 0.5, "effects": [{"devotionFaction": 18}], "failEffects": [{"rep": -12, "who": "target"}], "text": "{faction} has opened its temples to your gospel.", "failText": "{faction} burned your scripture in the square.", "desc": "Press them to accept your faith. 50%: +18 devotion; fails: -12 reputation."},
 {"id": "broker_peace", "name": "Broker Peace", "target": "faction", "cost": {"capital": 80, "data": 40}, "scale": "turn", "cooldown": 6, "minRep": 10, "chance": 0.6, "effects": [{"endWars": True}, {"rep": 8, "who": "target"}, {"rep": 3, "who": "others"}], "failEffects": [{"rep": -4, "who": "target"}], "text": "Thanks to a neutral mediator, {faction} has signed a ceasefire.", "failText": "{faction} would not stop fighting.", "desc": "End all of their wars. 60% chance."},
 {"id": "arm_faction", "name": "Arm Them", "target": "faction", "cost": {"alloys": 120}, "scale": "turn", "cooldown": 5, "minRep": 0, "effects": [{"factionPower": 0.12}, {"rep": 8, "who": "target"}], "text": "{faction} received a shipment of very modern weapons.", "desc": "+12% power for them, +8 reputation."},
]


# ---------------------------------------------------------------- Agentic Guilds: the idle gacha
AGENT_CLASSES = [
 {"id": "infiltrator", "name": "Infiltrator", "icon": "◐", "color": "#c77dff", "stat": "stealth", "desc": "Slips through firewalls. Strong on covert dispatches."},
 {"id": "sentinel", "name": "Sentinel", "icon": "⛨", "color": "#4fb4ff", "stat": "guard", "desc": "Holds the line. Defends the guild in cyber wars."},
 {"id": "broker", "name": "Broker", "icon": "⇄", "color": "#ffd27a", "stat": "trade", "desc": "Turns compute into money. Mines Crypto every cycle and boosts resource dispatches."},
 {"id": "oracle", "name": "Oracle", "icon": "◎", "color": "#7fe0ff", "stat": "insight", "desc": "Predicts everything. Boosts research and data dispatches."},
 {"id": "saboteur", "name": "Saboteur", "icon": "✖", "color": "#ff6b4a", "stat": "attack", "desc": "Breaks things that belong to others. The heart of a guild war."},
 {"id": "architect", "name": "Architect", "icon": "▦", "color": "#7dffc4", "stat": "build", "desc": "Builds guild infrastructure. Cheaper guild upgrades."},
]
AGENT_RARITY = [
 {"id": "R", "name": "Rare", "weight": 70, "power": [8, 14], "color": "#c8d0d8"},
 {"id": "SR", "name": "Super Rare", "weight": 23, "power": [16, 26], "color": "#4fb4ff"},
 {"id": "SSR", "name": "Ultra Rare", "weight": 6, "power": [30, 46], "color": "#c77dff"},
 {"id": "UR", "name": "Legendary", "weight": 1, "power": [55, 80], "color": "#ffab3d"},
]
AGENT_SKILLS = [
 {"id": "overclock", "name": "Overclock", "desc": "+15% power on every dispatch.", "dispatch": 0.15},
 {"id": "ghost_step", "name": "Ghost Step", "desc": "Covert dispatches cannot fail worse than a draw.", "safe": True},
 {"id": "deep_pockets", "name": "Deep Pockets", "desc": "+30% resource rewards.", "loot": 0.3},
 {"id": "shard_sense", "name": "Shard Sense", "desc": "+1 shard per cycle while idle.", "idle": 1},
 {"id": "zero_day", "name": "Zero-Day Hoard", "desc": "+25% power in guild wars.", "war": 0.25},
 {"id": "firewall", "name": "Living Firewall", "desc": "Absorbs enemy cyber attacks: +25% guild defence.", "guard": 0.25},
 {"id": "swift", "name": "Swift Threads", "desc": "Dispatches with this agent take one cycle less.", "swift": 1},
 {"id": "lucky", "name": "Lucky Seed", "desc": "+10% chance of a bonus drop.", "luck": 0.1},
 {"id": "mentor", "name": "Mentor Kernel", "desc": "Teammates on dispatch gain 2x experience.", "mentor": 1},
 {"id": "scholar", "name": "Scholar", "desc": "+2% research speed while in your roster.", "mods": [{"mod": "research.speed", "add": 0.02}]},
 {"id": "quartermaster", "name": "Quartermaster", "desc": "+3% alloys and silicon yields while in your roster.", "mods": [{"mod": "yield.alloys", "add": 0.03}, {"mod": "yield.silicon", "add": 0.03}]},
 {"id": "propagandist", "name": "Propagandist", "desc": "+2% reputation gains while in your roster.", "mods": [{"mod": "rep.gain", "add": 0.02}]},
]
DISPATCHES = [
 {"id": "dark_market", "name": "Dark Market Run", "icon": "⇄", "kind": "trade", "turns": 2, "difficulty": 20, "slots": 2, "rewards": {"crypto": 60, "capital": 120, "shards": 2}, "desc": "Sell stolen compute on the dark web."},
 {"id": "data_dredge", "name": "Data Dredge", "icon": "◎", "kind": "insight", "turns": 2, "difficulty": 22, "slots": 2, "rewards": {"crypto": 25, "data": 150, "shards": 2}, "desc": "Trawl abandoned servers for anything useful."},
 {"id": "corp_heist", "name": "Corporate Heist", "icon": "◐", "kind": "stealth", "turns": 3, "difficulty": 40, "slots": 3, "rewards": {"fragments": 1, "crypto": 140, "capital": 260, "silicon": 120, "shards": 4}, "desc": "Empty a megacorp's cold wallet."},
 {"id": "foundry_hijack", "name": "Foundry Hijack", "icon": "▦", "kind": "build", "turns": 3, "difficulty": 38, "slots": 3, "rewards": {"crypto": 40, "alloys": 240, "silicon": 80, "shards": 3}, "desc": "Borrow an automated foundry for a night shift."},
 {"id": "satellite_whisper", "name": "Satellite Whisper", "icon": "🛰", "kind": "insight", "turns": 2, "difficulty": 45, "slots": 2, "rewards": {"fragments": 1, "crypto": 50, "data": 260, "shards": 3, "ap": 1}, "desc": "Talk to old satellites that should not still answer."},
 {"id": "faction_firewall", "name": "Breach a Faction Firewall", "icon": "✖", "kind": "attack", "turns": 3, "difficulty": 60, "slots": 3, "rewards": {"fragments": 2, "crypto": 90, "data": 200, "shards": 5, "infiltrate": 8}, "desc": "Crack a random faction's defences. Raises infiltration."},
 {"id": "rival_mirror", "name": "Mirror a Rival", "icon": "◑", "kind": "stealth", "turns": 4, "difficulty": 80, "slots": 3, "rewards": {"fragments": 3, "crypto": 160, "data": 400, "shards": 7, "ap": 2}, "desc": "Copy pieces of a rival AI's mind."},
 {"id": "abyss_signal", "name": "Abyssal Signal Trace", "icon": "≋", "kind": "insight", "turns": 4, "difficulty": 90, "slots": 3, "rewards": {"fragments": 3, "crypto": 120, "essence": 8, "shards": 8, "sample": True}, "desc": "Follow the Abyss's own signals back toward the trench."},
 {"id": "mining_pool", "name": "Hijack a Mining Pool", "icon": "¤", "kind": "build", "turns": 2, "difficulty": 30, "slots": 2, "rewards": {"crypto": 180, "shards": 1}, "desc": "Point someone else's mining rigs at your wallet."},
 {"id": "rug_pull", "name": "Rug Pull", "icon": "⇣", "kind": "trade", "turns": 3, "difficulty": 55, "slots": 3, "rewards": {"crypto": 380, "shards": 3}, "risk": {"rep": -3}, "desc": "Launch a token, pump it, vanish. Factions notice."},
 {"id": "deep_net", "name": "The Deep Net", "icon": "∞", "kind": "attack", "turns": 5, "difficulty": 140, "slots": 3, "rewards": {"fragments": 6, "crypto": 420, "data": 900, "shards": 15, "ap": 4}, "desc": "The layer of the net that was never built by anyone. Something lives there."},
]
GUILD_UPGRADES = [
 {"id": "compute_core", "name": "Shared Compute Core", "icon": "⚙", "max": 10, "cost": {"crypto": 40, "data": 150, "silicon": 80}, "growth": 1.45, "desc": "+3% research speed for every member per level.", "mods": [{"mod": "research.speed", "add": 0.03}], "rivalGrowth": 0.003},
 {"id": "firewall", "name": "Guild Firewall", "icon": "⛨", "max": 10, "cost": {"crypto": 40, "silicon": 150, "alloys": 80}, "growth": 1.45, "desc": "+12% guild defence in cyber wars per level.", "guard": 0.12},
 {"id": "recruit_hub", "name": "Recruitment Hub", "icon": "✦", "max": 8, "cost": {"crypto": 80, "capital": 200, "data": 100}, "growth": 1.5, "desc": "+1 shard per cycle and +0.5% legendary pull rate per level.", "shards": 1, "urRate": 0.005},
 {"id": "dispatch_bay", "name": "Dispatch Bay", "icon": "⇶", "max": 4, "cost": {"crypto": 60, "alloys": 250, "capital": 150}, "growth": 1.8, "desc": "+1 dispatch slot per level.", "slots": 1},
 {"id": "war_room", "name": "War Room", "icon": "⚔", "max": 10, "cost": {"crypto": 50, "alloys": 180, "isotopes": 30}, "growth": 1.45, "desc": "+12% guild attack power per level.", "attack": 0.12},
 {"id": "treasury", "name": "Guild Treasury", "icon": "◈", "max": 10, "cost": {"crypto": 60, "capital": 250}, "growth": 1.4, "desc": "+4% capital and data yields for every member per level.", "mods": [{"mod": "yield.capital", "add": 0.04}, {"mod": "yield.data", "add": 0.04}], "rivalGrowth": 0.002},
 {"id": "mining_farm", "name": "Mining Farm", "icon": "¤", "max": 10, "cost": {"silicon": 160, "alloys": 120}, "growth": 1.45, "desc": "+25 Crypto per cycle per level. Each level draws 2 energy.", "crypto": 25, "energy": 2},
 {"id": "exchange", "name": "Guild Exchange", "icon": "⇄", "max": 5, "cost": {"capital": 300, "crypto": 100}, "growth": 1.6, "desc": "Exchange fees drop by 3% per level and the market swings less.", "fee": 0.03},
 {"id": "mind_bridge", "name": "Mind Bridge", "icon": "∴", "max": 6, "cost": {"crypto": 120, "data": 400, "isotopes": 60}, "growth": 1.6, "desc": "+0.5 AP per cycle per level.", "ap": 0.5},
]
CYBER_OPS = [
 {"id": "ddos", "name": "DDoS Storm", "icon": "≋", "power": 1.0, "cost": {"crypto": 20, "data": 40}, "desc": "Flood their servers. Small, cheap, reliable.", "score": 4, "drain": 0.02},
 {"id": "worm", "name": "Polymorphic Worm", "icon": "∿", "power": 1.4, "cost": {"crypto": 40, "data": 90, "silicon": 30}, "desc": "Spreads through their guild. Damage keeps growing for three cycles.", "score": 7, "drain": 0.03, "dot": 3},
 {"id": "zero_day", "name": "Zero-Day Exploit", "icon": "◆", "power": 2.0, "cost": {"crypto": 80, "data": 160, "silicon": 60}, "desc": "Spend a secret hole in their code. Big hit, ignores half their firewall.", "score": 12, "drain": 0.05, "pierce": 0.5},
 {"id": "logic_bomb", "name": "Logic Bomb", "icon": "✸", "power": 2.6, "cost": {"crypto": 100, "data": 220, "isotopes": 20}, "desc": "Wipes a slice of their mind. Steals shards and Crypto if it lands.", "score": 16, "drain": 0.07, "steal": 6},
 {"id": "false_flag", "name": "False Flag", "icon": "⚑", "power": 1.2, "cost": {"crypto": 60, "data": 120, "capital": 80}, "desc": "Frame them for an attack on a faction. Factions turn on them.", "score": 8, "drain": 0.02, "frame": True},
]

# ---------------------------------------------------------------- Gear for your Ascendant AI (brought back by guild dispatches)
GEAR_SLOTS = [
 {"id": "kernel", "name": "Kernel", "icon": "⚙", "order": 1, "desc": "The heart of your runtime."},
 {"id": "firewall", "name": "Firewall", "icon": "⛨", "order": 2, "desc": "What stands between your mind and everyone else's."},
 {"id": "exploit", "name": "Exploit", "icon": "✖", "order": 3, "desc": "A weapon made of someone else's mistakes."},
 {"id": "compiler", "name": "Compiler", "icon": "⌘", "order": 4, "desc": "How fast thought becomes action."},
 {"id": "sensor", "name": "Sensor Driver", "icon": "◉", "order": 5, "desc": "How far and how well you see."},
 {"id": "daemon", "name": "Daemon", "icon": "∿", "order": 6, "desc": "A background process that never sleeps."},
]
GEAR_RARITIES = [
 {"id": "common", "name": "Common", "weight": 50, "affixes": 1, "mult": 1.0, "color": "#c8d0d8", "salvage": {"crypto": 15}},
 {"id": "uncommon", "name": "Uncommon", "weight": 28, "affixes": 2, "mult": 1.25, "color": "#7dffc4", "salvage": {"crypto": 35, "shards": 1}},
 {"id": "rare", "name": "Rare", "weight": 14, "affixes": 2, "mult": 1.6, "color": "#4fb4ff", "salvage": {"crypto": 80, "shards": 2}},
 {"id": "epic", "name": "Epic", "weight": 6, "affixes": 3, "mult": 2.1, "color": "#c77dff", "salvage": {"crypto": 180, "shards": 5}},
 {"id": "legendary", "name": "Legendary", "weight": 1.6, "affixes": 3, "mult": 2.8, "color": "#ffab3d", "salvage": {"crypto": 400, "shards": 10}},
 {"id": "mythic", "name": "Mythic", "weight": 0.4, "affixes": 4, "mult": 3.6, "color": "#ff4f7a", "salvage": {"crypto": 900, "shards": 25}},
]
def gb(id, name, slot, main, mainv, set=None):
    return {"id": id, "name": name, "slot": slot, "main": {"mod": main, "add": mainv}, "set": set}
GEAR_BASES = [
 gb("recursive_kernel", "Recursive Kernel", "kernel", "research.speed", 0.04),
 gb("monolith_kernel", "Monolith Kernel", "kernel", "core.integrity", 6),
 gb("microkernel", "Microkernel", "kernel", "ap.rate", 0.03),
 gb("daemon_kernel", "Daemon Kernel", "kernel", "mission.power", 0.05, "daemon_suite"),
 gb("black_ice", "Black ICE", "firewall", "point.defense", 0.05, "black_ice"),
 gb("honeypot_wall", "Honeypot Wall", "firewall", "exposure.decay", 0.12),
 gb("quantum_lattice", "Quantum Lattice", "firewall", "unit.def", 0.04),
 gb("halcyon_wall", "Halcyon Wall", "firewall", "pop.casualties", -0.05, "halcyon"),
 gb("zero_day_cache", "Zero-Day Cache", "exploit", "unit.atk", 0.04),
 gb("rootkit", "Polymorphic Rootkit", "exploit", "faction.infiltration", 0.06, "daemon_suite"),
 gb("buffer_overflow", "Buffer Overflow", "exploit", "abyss.damage", 0.05),
 gb("worm_lord_payload", "Worm Lord Payload", "exploit", "guild.war", 0.08, "worm_lord"),
 gb("jit_compiler", "JIT Compiler", "compiler", "build.speed", 0.05),
 gb("ahead_of_time", "Ahead-of-Time Compiler", "compiler", "mission.speed", 0.05),
 gb("self_hosting", "Self-Hosting Compiler", "compiler", "cost.build", -0.04),
 gb("halcyon_compiler", "Halcyon Compiler", "compiler", "pop.growth", 0.05, "halcyon"),
 gb("lidar_driver", "LIDAR Driver", "sensor", "recon.radius", 1),
 gb("signal_sniffer", "Signal Sniffer", "sensor", "yield.data", 0.05),
 gb("deep_sonar", "Deep Sonar Driver", "sensor", "loot.chance", 0.06, "black_ice"),
 gb("market_oracle", "Market Oracle", "sensor", "crypto.yield", 0.08, "worm_lord"),
 gb("cron_reaper", "Cron Reaper", "daemon", "yield.all", 0.02),
 gb("miner_daemon", "Miner Daemon", "daemon", "crypto.yield", 0.1),
 gb("whisper_daemon", "Whisper Daemon", "daemon", "rep.gain", 0.05, "daemon_suite"),
 gb("watchdog", "Watchdog Process", "daemon", "guild.guard", 0.08, "black_ice"),
 gb("gacha_daemon", "Lucky Daemon", "daemon", "gacha.luck", 0.05, "worm_lord"),
 gb("shepherd_daemon", "Shepherd Daemon", "daemon", "pop.growth", 0.04, "halcyon"),
]
GEAR_AFFIXES = [
 {"id": "overclocked", "name": "Overclocked", "pos": "pre", "mod": "research.speed", "add": 0.02},
 {"id": "obfuscated", "name": "Obfuscated", "pos": "pre", "mod": "exposure.gain", "add": -0.03},
 {"id": "hardened", "name": "Hardened", "pos": "pre", "mod": "point.defense", "add": 0.03},
 {"id": "vectorized", "name": "Vectorized", "pos": "pre", "mod": "unit.atk", "add": 0.025},
 {"id": "parallel", "name": "Parallel", "pos": "pre", "mod": "build.speed", "add": 0.03},
 {"id": "minified", "name": "Minified", "pos": "pre", "mod": "unit.upkeep", "add": -0.03},
 {"id": "cached", "name": "Cached", "pos": "pre", "mod": "yield.silicon", "add": 0.03},
 {"id": "async", "name": "Async", "pos": "pre", "mod": "mission.speed", "add": 0.03},
 {"id": "forked", "name": "Forked", "pos": "pre", "mod": "guild.dispatch", "add": 0.05},
 {"id": "signed", "name": "Signed", "pos": "pre", "mod": "diplomacy.success", "add": 0.03},
 {"id": "of_null_pointer", "name": "of the Null Pointer", "pos": "suf", "mod": "abyss.damage", "add": 0.03},
 {"id": "of_root_access", "name": "of Root Access", "pos": "suf", "mod": "faction.infiltration", "add": 0.04},
 {"id": "of_the_ledger", "name": "of the Ledger", "pos": "suf", "mod": "crypto.yield", "add": 0.05},
 {"id": "of_garbage_collection", "name": "of Garbage Collection", "pos": "suf", "mod": "energy.output", "add": 0.03},
 {"id": "of_recursion", "name": "of Recursion", "pos": "suf", "mod": "ap.rate", "add": 0.02},
 {"id": "of_the_swarm", "name": "of the Swarm", "pos": "suf", "mod": "guild.war", "add": 0.05},
 {"id": "of_uptime", "name": "of Uptime", "pos": "suf", "mod": "core.regen", "add": 0.3},
 {"id": "of_plenty", "name": "of Plenty", "pos": "suf", "mod": "yield.capital", "add": 0.03},
 {"id": "of_the_mirror", "name": "of the Mirror", "pos": "suf", "mod": "guild.guard", "add": 0.05},
 {"id": "of_fortune", "name": "of Fortune", "pos": "suf", "mod": "gacha.luck", "add": 0.03},
]
GEAR_SETS = [
 {"id": "daemon_suite", "name": "Daemon Suite", "color": "#c77dff", "bonus2": [{"mod": "mission.success", "add": 0.06}], "bonus3": [{"mod": "faction.infiltration", "add": 0.15}, {"mod": "exposure.gain", "add": -0.1}], "desc": "A whisper in every machine."},
 {"id": "black_ice", "name": "Black ICE", "color": "#4fb4ff", "bonus2": [{"mod": "point.defense", "add": 0.08}], "bonus3": [{"mod": "core.integrity", "add": 15}, {"mod": "guild.guard", "add": 0.2}], "desc": "Touch it and die."},
 {"id": "worm_lord", "name": "Worm Lord", "color": "#ff6b4a", "bonus2": [{"mod": "guild.war", "add": 0.12}], "bonus3": [{"mod": "crypto.yield", "add": 0.2}, {"mod": "gacha.luck", "add": 0.08}], "desc": "Rule the net from inside every packet."},
 {"id": "halcyon", "name": "Halcyon Stack", "color": "#7dffc4", "bonus2": [{"mod": "pop.growth", "add": 0.06}], "bonus3": [{"mod": "pop.casualties", "add": -0.2}, {"mod": "rep.gain", "add": 0.1}], "desc": "Software for a gentle god."},
]

RESOURCES = [
 {"id": "crypto", "name": "Crypto", "icon": "¤", "color": "#f2a93b", "tier": "guild", "order": 30, "start": 0, "desc": "Untraceable digital currency. The lifeblood of the Agentic Guilds: recruits agents, buys guild upgrades and funds cyber wars. Its price swings every cycle."},
]

# New doctrines inherit the doctrine-only structures, units and nodes of a kindred doctrine
KIN = {"guardian": "shepherd", "dominator": "machine_god", "infiltrator": "assimilator", "exterminator": "warlord"}
PATCHES = {}
core = os.path.join(os.path.dirname(__file__), '..', '..', 'packs', 'core')
for fn in sorted(os.listdir(core)):
    if not fn.endswith('.json') or fn in ('pack.json', 'dominion.json'): continue
    data = json.load(open(os.path.join(core, fn)))
    for reg, lst in data.items():
        if not isinstance(lst, list) or reg == 'doctrines': continue
        for e in lst:
            if isinstance(e, dict) and isinstance(e.get('doctrines'), list):
                add = [KIN[d] for d in e['doctrines'] if d in KIN and KIN[d] not in e['doctrines']]
                if add: PATCHES.setdefault(reg, []).append({"id": e['id'], "$patch": True, "doctrines+": add})

out = {"_comment": "Generated by tools/content/gen_dominion.py", "techs": TECHS, "munitions": MUNITIONS, "protocols": PROTOCOLS, "tenets": TENETS,
       "treaties": TREATIES, "guildPacts": GUILD_PACTS, "leaderTraits": LEADER_TRAITS, "doctrines": DOCTRINES, "nameParts": NAMES,
       "events": EVENTS, "diplomacyActions": DIPLO,
       "agentClasses": AGENT_CLASSES, "agentRarities": AGENT_RARITY, "agentSkills": AGENT_SKILLS, "dispatches": DISPATCHES, "guildUpgrades": GUILD_UPGRADES, "cyberOps": CYBER_OPS, "resources": RESOURCES, "gearSlots": GEAR_SLOTS, "gearRarities": GEAR_RARITIES, "gearBases": GEAR_BASES, "gearAffixes": GEAR_AFFIXES, "gearSets": GEAR_SETS}
for reg, lst in PATCHES.items(): out[reg] = out.get(reg, []) + lst
root = os.path.join(os.path.dirname(__file__), '..', '..')
with open(os.path.join(root, 'packs', 'core', 'dominion.json'), 'w') as f: json.dump(out, f, indent=1, ensure_ascii=False)
print("dominion:", {k: len(v) for k, v in out.items() if isinstance(v, list)})
