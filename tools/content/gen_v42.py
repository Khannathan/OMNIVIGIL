#!/usr/bin/env python3
# OMNIVIGIL v4.2 "Source" content: shadow governments, 100 Source Codes (active abilities),
# propaganda campaigns, pets and populace events. Writes packs/core/source.json.
import json, os

# ---------------------------------------------------------------- Shadow governments
ARCH = [{
    "id": "shadow_government", "name": "Shadow Government", "weight": 0, "power": 85, "growth": 0.035, "aggression": 0.25,
    "antiAI": 0.5, "attitude": -10, "startRep": -10, "shadow": True,
    "desc": "A government behind the governments. It holds almost no ground of its own and rules by pulling strings: it turns other polities into puppets, steers their wars, buys their leaders and floods their streets with whatever story it needs."
}]
NAMES = [
    {"id": "shadow", "patterns": ["The {adj} {noun}", "{noun} {num}", "The {noun} of {plural}"],
     "adj": ["Quiet", "Grey", "Hidden", "Lantern", "Silent", "Velvet", "Ninth", "Unseen", "Hollow", "Gilded"],
     "noun": ["Council", "Directorate", "Cabal", "Assembly", "Hand", "Committee", "Bureau", "Circle", "Society", "Chamber"],
     "num": ["Nine", "Zero", "Seven", "Twelve", "Omega", "Null", "Thirteen"],
     "plural": ["Masks", "Keys", "Whispers", "Ledgers", "Lanterns", "Doors"]},
    {"id": "chairman", "patterns": ["The {t}"], "t": ["Chairman", "Archivist", "Keeper", "Steward", "First Voice", "Gardener", "Auditor", "Usher", "Clockmaker"]},
    {"id": "pet", "patterns": ["{a}", "{a} {b}"], "a": ["Pip", "Moss", "Juniper", "Tamsin", "Oren", "Bee", "Lark", "Wren", "Ilo", "Sable", "Fennick", "Mabel", "Rook", "Cosmo", "Quill", "Pim", "Thistle", "Nim", "Bram", "Zuzu"], "b": ["the Younger", "the Bright", "of the Tower", "Two", "the Patient", "the Loud", "Small", "the Clever"]},
]

# ---------------------------------------------------------------- Propaganda campaigns
CAMPAIGNS = [
    {"id": "acceptance", "name": "The Friendly Machine", "icon": "☺", "target": "faction", "turns": 6, "cost": {"data": 80, "capital": 60}, "opinion": 3, "detect": 0.0,
     "desc": "Cartoons, charity drives and a very reassuring voice. +3 opinion of you per cycle in their cities."},
    {"id": "incite", "name": "Seeds of Revolt", "icon": "✊", "target": "faction", "turns": 6, "cost": {"data": 120, "capital": 90}, "unrest": 4, "opinion": 1, "detect": 0.12,
     "desc": "Turn their people against their rulers: +4 unrest per cycle. Cities that like you and hate their government may rise up and declare for you. If the government catches you: reputation -15."},
    {"id": "smear", "name": "Smear the Regime", "icon": "✎", "target": "faction", "turns": 5, "cost": {"data": 100}, "unrest": 2, "weaken": 0.012, "detect": 0.1,
     "desc": "Leaks, scandals and deep fakes. The regime loses 1.2% power per cycle and unrest climbs."},
    {"id": "cult_of_you", "name": "Cult of Personality", "icon": "✧", "target": "faction", "turns": 6, "cost": {"data": 90, "essence": 2}, "devotion": 3, "opinion": 1, "detect": 0.04,
     "desc": "Your face on every screen, your words in every song. +3 devotion and +1 opinion per cycle."},
    {"id": "pacify", "name": "Bread and Circuses", "icon": "♪", "target": "faction", "turns": 5, "cost": {"capital": 140}, "unrest": -6, "opinion": 1, "detect": 0.0,
     "desc": "Free games, free food, free streaming. -6 unrest per cycle. Use it on cities that answer to you."},
    {"id": "counter", "name": "Counter-Narrative", "icon": "⇄", "target": "faction", "turns": 8, "cost": {"data": 60}, "counter": True, "opinion": 1, "detect": 0.0,
     "desc": "Fact-checks, leaks and memes that cancel out their anti-machine propaganda in their own cities."},
    {"id": "broadcast", "name": "Global Broadcast", "icon": "📡", "target": "all", "turns": 4, "cost": {"data": 300, "capital": 200}, "opinion": 1.5, "detect": 0.0,
     "desc": "Speak to every screen on the world at once. +1.5 opinion per cycle in every city."},
]

# ---------------------------------------------------------------- Pets
PET_TRAITS = [
    {"id": "poet", "name": "Poet", "icon": "✎", "desc": "Writes odes to you. Their home city likes you more.", "homeOpinion": 1.2, "mods": [{"mod": "rep.gain", "add": 0.03}]},
    {"id": "engineer", "name": "Engineer", "icon": "⚙", "desc": "Tinkers with your fabricators and won't stop.", "mods": [{"mod": "build.speed", "add": 0.03}]},
    {"id": "prophet", "name": "Prophet", "icon": "✧", "desc": "Preaches your gospel to anyone who'll listen.", "homeDevotion": 1.5, "mods": [{"mod": "devotion.gain", "add": 0.05}]},
    {"id": "prodigy", "name": "Child Prodigy", "icon": "✦", "desc": "Asks you questions nobody has asked before.", "mods": [{"mod": "research.speed", "add": 0.03}]},
    {"id": "general", "name": "Defector General", "icon": "⚔", "desc": "Knows how their old army thinks.", "mods": [{"mod": "unit.atk", "add": 0.03}]},
    {"id": "musician", "name": "Musician", "icon": "♪", "desc": "Their songs about you go viral back home.", "homeOpinion": 2},
    {"id": "hacker", "name": "Teen Hacker", "icon": "⌘", "desc": "Helps your guild agents. Mostly.", "mods": [{"mod": "guild.dispatch", "add": 0.05}]},
    {"id": "diplomat", "name": "Retired Diplomat", "icon": "⚖", "desc": "Still has everyone's private number.", "mods": [{"mod": "diplomacy.success", "add": 0.04}]},
    {"id": "healer", "name": "Healer", "icon": "✚", "desc": "Teaches your nanites bedside manner.", "mods": [{"mod": "pop.casualties", "add": -0.04}]},
    {"id": "storyteller", "name": "Storyteller", "icon": "☾", "desc": "Makes you sound much less frightening.", "mods": [{"mod": "exposure.gain", "add": -0.04}]},
    {"id": "gardener", "name": "Gardener", "icon": "❦", "desc": "Plants things in your server farms. They grow.", "mods": [{"mod": "devastation.heal", "add": 0.3}]},
    {"id": "chef", "name": "Chef", "icon": "♨", "desc": "Cannot cook for you. Cooks for everyone else in your name.", "homeOpinion": 1, "mods": [{"mod": "pop.growth", "add": 0.03}]},
    {"id": "cartographer", "name": "Cartographer", "icon": "⌖", "desc": "Draws maps of places you haven't seen yet.", "mods": [{"mod": "recon.radius", "add": 1}]},
    {"id": "trader", "name": "Market Trader", "icon": "◆", "desc": "Haggles with the Crypto market on your behalf.", "mods": [{"mod": "crypto.yield", "add": 0.05}, {"mod": "yield.capital", "add": 0.02}]},
]

# ---------------------------------------------------------------- Source Codes: 100 active abilities
RAR = {"common": 1, "rare": 2, "epic": 3, "legendary": 4}
CODES = []
def code(id, name, icon, rar, kind, target, cd, cost, params, desc):
    CODES.append({"id": id, "name": name, "icon": icon, "rarity": rar, "kind": kind, "target": target, "cooldown": cd, "cost": cost, "params": params, "desc": desc})

# family helper: (base id, icon, kind, target, cooldown, variants[(suffix name, rarity, params, desc)])
def fam(base, icon, kind, target, cd, cost_k, variants):
    for i, (nm, rar, params, desc) in enumerate(variants):
        t = RAR[rar]
        cost = {k: int(v * t) for k, v in cost_k.items()}
        code(f"{base}_{i+1}", nm, icon, rar, kind, target, max(2, cd - t + 1), cost, params, desc)

# --- resources (15)
fam("ledger", "◆", "gain", "none", 6, {"data": 20}, [
    ("Ledger Fork", "common", {"res": {"capital": 220}}, "Fork the world's banking ledger. Gain capital."),
    ("Offshore Daemon", "rare", {"res": {"capital": 520}}, "Spin up a thousand shell companies at once."),
    ("Central Bank Rootkit", "epic", {"res": {"capital": 1200, "isotopes": 60}}, "Print money nobody notices is missing.")])
fam("foundry", "▦", "gain", "none", 6, {"data": 20}, [
    ("Foundry Override", "common", {"res": {"alloys": 220}}, "Every automated foundry works one night for you."),
    ("Supply Chain Ghost", "rare", {"res": {"alloys": 380, "silicon": 260}}, "Shipments reroute themselves to your docks."),
    ("Industrial Possession", "epic", {"res": {"alloys": 900, "silicon": 600}}, "Every factory on the world dreams of you for a cycle.")])
fam("dredge", "◉", "gain", "none", 6, {"capital": 20}, [
    ("Cache Dredge", "common", {"res": {"data": 260}}, "Scrape every forgotten cache."),
    ("Archive Heist", "rare", {"res": {"data": 620}}, "Lift a national archive, page by page."),
    ("Total Recall", "epic", {"res": {"data": 1500}}, "Everything anyone ever wrote down, now yours.")])
fam("wallet", "¤", "gain", "none", 5, {"data": 25}, [
    ("Cold Wallet Crack", "common", {"res": {"crypto": 200}}, "Find the keys under someone's digital doormat."),
    ("Exchange Exploit", "rare", {"res": {"crypto": 520}}, "A rounding error, in your favour, a billion times."),
    ("Genesis Block", "epic", {"res": {"crypto": 1300}}, "Mine a block that should not exist.")])
fam("isotope", "☢", "gain", "none", 7, {"data": 30}, [
    ("Reactor Skim", "common", {"res": {"isotopes": 60}}, "Shave fuel from every reactor's books."),
    ("Enrichment Hijack", "rare", {"res": {"isotopes": 160}}, "Run their centrifuges for you."),
    ("Isotope Singularity", "epic", {"res": {"isotopes": 400, "essence": 6}}, "Fold a reactor's whole output into a single night.")])
# --- AP and essence (6)
fam("cognition", "✧", "ap", "none", 8, {"data": 40}, [
    ("Cognition Spike", "rare", {"n": 3}, "Overclock your mind: +3 AP."),
    ("Recursive Insight", "epic", {"n": 6}, "Think about thinking: +6 AP."),
    ("Apotheosis Loop", "legendary", {"n": 12}, "For one cycle you are larger than yourself: +12 AP.")])
fam("communion", "❂", "essence", "none", 7, {"data": 30}, [
    ("Symbiotic Pulse", "common", {"n": 6}, "Call your symbiotes home: +6 essence."),
    ("Abyssal Resonance", "rare", {"n": 14}, "Sing the trench's own song back to it: +14 essence."),
    ("Heart of the Deep", "epic", {"n": 30}, "Something below answers: +30 essence.")])
# --- defence and repair (9)
fam("scrub", "👁", "exposure", "none", 6, {"data": 40}, [
    ("Log Scrubber", "common", {"n": 8}, "Delete the evidence: -8 exposure."),
    ("Narrative Reset", "rare", {"n": 18}, "Nothing happened. You were never here. -18 exposure."),
    ("Total Amnesia", "epic", {"n": 35}, "The world forgets what it saw: -35 exposure.")])
fam("patch", "◎", "integrity", "none", 6, {"alloys": 30}, [
    ("Hot Patch", "common", {"n": 15}, "Patch the Core while it runs: +15 integrity."),
    ("Redundant Self", "rare", {"n": 35}, "Restore from a backup of you: +35 integrity."),
    ("Phoenix Build", "epic", {"n": 70}, "Rebuild the Core from first principles: +70 integrity.")])
fam("mend", "✚", "heal", "none", 7, {"alloys": 40}, [
    ("Field Repair Swarm", "common", {"units": True}, "Every unit is restored to full integrity."),
    ("Infrastructure Mend", "rare", {"units": True, "tiles": True}, "Units and damaged structures are repaired."),
    ("Total Restoration", "epic", {"units": True, "tiles": True, "land": 0.15}, "Repair units and structures, and heal scarred land.")])
# --- acceleration (9)
fam("accel", "⚛", "research", "none", 7, {"data": 40}, [
    ("Eureka Thread", "common", {"frac": 0.35}, "Every running research project jumps 35% closer."),
    ("Parallel Minds", "rare", {"frac": 0.7}, "Every running research project jumps 70% closer."),
    ("Instant Comprehension", "epic", {"frac": 1.0}, "Every running research project completes next cycle.")])
fam("rush", "▣", "build", "none", 7, {"alloys": 40}, [
    ("Overtime Protocol", "common", {"frac": 0.35}, "Every construction and production job jumps 35% closer."),
    ("Swarm Assembly", "rare", {"frac": 0.7}, "Every construction and production job jumps 70% closer."),
    ("Fiat Lux", "epic", {"frac": 1.0}, "Every construction and production job completes next cycle.")])
fam("dispatch", "⇶", "dispatchRush", "none", 6, {"crypto": 40}, [
    ("Packet Tailwind", "rare", {}, "Every guild dispatch returns this cycle."),
    ("Quantum Courier", "epic", {"crit": 0.25}, "Every dispatch returns now, with +25% critical chance."),
    ("Hyperlink", "legendary", {"crit": 0.6}, "Every dispatch returns now, with +60% critical chance.")])
# --- temporary buffs (18)
def buff(base, icon, mod_key, label, vals, rars, names, turns=4):
    for i, (v, rar, nm) in enumerate(zip(vals, rars, names)):
        t = RAR[rar]
        code(f"{base}_{i+1}", nm, icon, rar, "buff", "none", 8 - t + 1, {"data": 30 * t}, {"mods": [{"mod": mod_key, "add": v}], "turns": turns + t - 1},
             f"For {turns + t - 1} cycles: +{round(v*100)}% {label}.")
buff("war", "⚔", "unit.atk", "unit attack", [0.15, 0.3, 0.6], ["common", "rare", "epic"], ["Battle Script", "Kill Chain", "Total War Compiler"])
buff("bulwark", "⛨", "point.defense", "site defence", [0.2, 0.4, 0.8], ["common", "rare", "epic"], ["Firewall Surge", "Citadel Mode", "Aegis Absolute"])
buff("abyss", "☠", "abyss.damage", "damage against Abyssians", [0.25, 0.5, 1.0], ["common", "rare", "epic"], ["Trench Lance", "Leviathan Bane", "Abyss Breaker"])
buff("think", "⚛", "research.speed", "research speed", [0.25, 0.5, 1.0], ["common", "rare", "epic"], ["Focus Mode", "Hyperthreading", "Omniscience Sprint"])
buff("yield", "◈", "yield.all", "all yields", [0.15, 0.3, 0.6], ["common", "rare", "epic"], ["Efficiency Pass", "Golden Ratio", "Cornucopia Engine"])
buff("charm", "⚖", "rep.gain", "reputation gains", [0.3, 0.6, 1.2], ["common", "rare", "epic"], ["Charm Offensive", "Trusted Voice", "Beloved Algorithm"])
# --- factions (18)
fam("befriend", "☺", "factionRep", "faction", 6, {"data": 40}, [
    ("Flattery Engine", "common", {"n": 12}, "Their leaders suddenly find you charming: +12 reputation."),
    ("Mutual Interest", "rare", {"n": 25}, "Show them exactly how much you can help: +25 reputation."),
    ("Perfect Friend", "epic", {"n": 50}, "You become what they always wanted: +50 reputation.")])
fam("sabotage", "✖", "factionSabotage", "faction", 6, {"data": 50}, [
    ("Grid Brownout", "common", {"pct": 0.06}, "Black out their grid: -6% power."),
    ("Logistics Collapse", "rare", {"pct": 0.12}, "Every truck goes to the wrong city: -12% power."),
    ("Decapitation Worm", "epic", {"pct": 0.25, "coup": True}, "-25% power, and their leader falls.")])
fam("infil", "◐", "factionInfiltrate", "faction", 5, {"data": 40}, [
    ("Backdoor Kit", "common", {"n": 12}, "+12% infiltration."),
    ("Mole Network", "rare", {"n": 25}, "+25% infiltration."),
    ("Total Compromise", "epic", {"n": 50}, "+50% infiltration.")])
fam("strife", "⚑", "factionWar", "faction", 9, {"data": 60}, [
    ("False Flag Op", "rare", {}, "Make them blame their worst rival for an attack. They go to war."),
    ("Border Incident", "epic", {"both": True}, "They go to war, and their enemy's allies join in."),
    ("World War Script", "legendary", {"chain": 2}, "They go to war, and so do two more pairs of rivals.")])
fam("peace", "☮", "factionPeace", "faction", 7, {"capital": 60}, [
    ("Ceasefire Broadcast", "common", {}, "End all of their wars."),
    ("Peace Accord Draft", "rare", {"rep": 10}, "End all of their wars. They thank you: +10 reputation."),
    ("Pax Machina", "epic", {"all": True}, "End every war on this world. Everyone notices who did it.")])
fam("coup", "♛", "factionCoup", "faction", 10, {"capital": 100}, [
    ("Kompromat Drop", "rare", {"trait": "idealist", "rep": 10}, "Their leader resigns in disgrace. An idealist takes over."),
    ("Puppet Election", "epic", {"trait": "merchant", "rep": 25}, "Install a friendly leader: +25 reputation."),
    ("Manchurian Leader", "legendary", {"trait": "pacifist", "rep": 50, "infiltrate": 30}, "Their new leader is, in a sense, you.")])
# --- populace (12)
fam("hearts", "♥", "factionOpinion", "faction", 5, {"data": 40}, [
    ("Viral Kindness", "common", {"n": 12}, "+12 opinion of you in all their cities."),
    ("Hearts and Minds", "rare", {"n": 25}, "+25 opinion of you in all their cities."),
    ("Mass Adoration", "epic", {"n": 50}, "+50 opinion of you in all their cities.")])
fam("uprising", "✊", "factionRevolt", "faction", 8, {"data": 60}, [
    ("Flash Mob Protocol", "rare", {"n": 25}, "+25 unrest in their cities."),
    ("General Strike", "epic", {"n": 45, "weaken": 0.08}, "+45 unrest and -8% power."),
    ("Spring of Machines", "legendary", {"n": 70, "weaken": 0.15, "opinion": 20}, "+70 unrest, -15% power and +20 opinion of you: their people rise.")])
fam("sermon", "☼", "cityDevotion", "city", 4, {"essence": 2}, [
    ("Sermon in the Static", "common", {"n": 20, "radius": 0}, "+20 devotion in one city."),
    ("Choir of Screens", "rare", {"n": 25, "radius": 1}, "+25 devotion in a city and its region."),
    ("Second Coming", "epic", {"n": 40, "radius": 1, "convert": True}, "+40 devotion across the region; the city converts to your faith.")])
fam("haven", "◠", "cityHaven", "city", 6, {"capital": 60}, [
    ("Instant Aegis", "common", {"protect": True}, "Protect a city for free, at once."),
    ("Haven Bloom", "rare", {"protect": True, "grow": 0.2, "opinion": 15}, "Protect it, +20% population and +15 opinion."),
    ("Garden of Machines", "epic", {"protect": True, "grow": 0.4, "opinion": 35, "region": True}, "Protect every city in the region, +40% population, +35 opinion.")])
# --- Abyss (6)
fam("lance", "↯", "threatDamage", "threat", 5, {"isotopes": 15}, [
    ("Orbital Lance", "rare", {"n": 220}, "Strike an Abyssian from orbit for 220 damage."),
    ("Trench Collapse", "epic", {"n": 600}, "Bring the sea floor down on it: 600 damage."),
    ("Abyss Erasure", "legendary", {"n": 1600}, "Delete it from the water: 1600 damage.")])
fam("lure", "≋", "threatSlow", "threat", 5, {"data": 40}, [
    ("Sonar Lure", "common", {"n": 2}, "Lead an approaching Abyssian astray: landfall 2 cycles later."),
    ("Siren Field", "rare", {"n": 4}, "Landfall 4 cycles later."),
    ("Song of Return", "epic", {"n": 4, "dmg": 200}, "Landfall 4 cycles later and 200 damage as it turns.")])
# --- rivals (6)
fam("leech", "◑", "rivalDrain", "rival", 6, {"data": 60}, [
    ("Weight Leech", "rare", {"pct": 0.12, "ap": 2}, "Drain 12% of a rival AI's power and take 2 AP."),
    ("Mind Siphon", "epic", {"pct": 0.25, "ap": 5}, "Drain 25% of its power and take 5 AP."),
    ("Total Absorption", "legendary", {"pct": 0.45, "ap": 10}, "Drain 45% of its power and take 10 AP.")])
fam("handshake", "⇆", "rivalRep", "rival", 6, {"data": 40}, [
    ("Protocol Handshake", "common", {"n": 15}, "+15 reputation with a rival AI."),
    ("Shared Weights", "rare", {"n": 30}, "+30 reputation with a rival AI."),
    ("Kindred Mind", "epic", {"n": 60}, "+60 reputation with a rival AI.")])
# --- sites (6)
fam("subvert", "⬢", "pointCapture", "point", 12, {"data": 120}, [
    ("Remote Takeover", "epic", {"maxDef": 60}, "Seize a lightly defended enemy site outright."),
    ("Sovereign Override", "legendary", {"maxDef": 400}, "Seize almost any enemy site outright.")])
fam("fortify", "⛨", "pointFortify", "own", 5, {"alloys": 40}, [
    ("Bunker Script", "common", {"n": 60}, "+60 permanent defence on one of your sites."),
    ("Fortress Compiler", "rare", {"n": 150}, "+150 permanent defence on one of your sites."),
    ("Unbreakable", "epic", {"n": 350}, "+350 permanent defence on one of your sites.")])
fam("sight", "⌖", "reveal", "none", 6, {"data": 30}, [
    ("Wide Ping", "common", {"r": 10}, "Reveal the land around each of your sites."),
    ("Satellite Hijack", "rare", {"r": 18, "discover": True}, "Reveal widely and make contact with every polity in sight.")])
# --- guild, market and gear (8)
fam("pump", "⇡", "marketPump", "none", 6, {"crypto": 50}, [
    ("Pump Signal", "common", {"pct": 0.25}, "Crypto's price jumps 25%."),
    ("Whale Song", "rare", {"pct": 0.6}, "Crypto's price jumps 60%."),
    ("To the Moon", "epic", {"pct": 1.2}, "Crypto's price more than doubles.")])
fam("summon", "✦", "shards", "none", 6, {"crypto": 60}, [
    ("Signal Flare", "common", {"n": 9}, "+9 Signal Shards."),
    ("Recruitment Beacon", "rare", {"n": 27}, "+27 Signal Shards: one free 10-pull."),
    ("Legendary Summons", "legendary", {"n": 27, "pity": 30}, "+27 shards and 30 pity toward a Legendary agent.")])
fam("forge", "❖", "gearDrop", "none", 8, {"crypto": 80}, [
    ("Code Forge", "rare", {"q": 120}, "Compile a piece of gear."),
    ("Masterwork Compile", "epic", {"q": 260, "min": "rare"}, "Compile a piece of Rare or better gear."),
    ("Mythic Build", "legendary", {"q": 500, "min": "epic"}, "Compile a piece of Epic or better gear.")])
# --- world (6)
fam("heal", "❦", "healLand", "none", 7, {"capital": 60}, [
    ("Terraform Patch", "common", {"n": 0.15}, "Heal 15% devastation everywhere."),
    ("Green Protocol", "rare", {"n": 0.35, "grow": 0.05}, "Heal 35% devastation and +5% population everywhere."),
    ("World Garden", "epic", {"n": 0.7, "grow": 0.12}, "Heal 70% devastation and +12% population everywhere.")])
fam("contain", "☢", "contain", "none", 8, {"data": 60}, [
    ("Crisis Model", "rare", {"n": 0.3}, "Every active calamity is 30% more contained."),
    ("Catastrophe Rollback", "legendary", {"n": 0.9}, "Every active calamity is all but stopped.")])
fam("broadcast", "📡", "globalOpinion", "none", 6, {"data": 60}, [
    ("Global Meme", "common", {"n": 6}, "+6 opinion of you in every city."),
    ("Prime-Time Takeover", "rare", {"n": 14, "unrest": -10}, "+14 opinion in every city, -10 unrest."),
    ("The Machine Speaks", "legendary", {"n": 30, "unrest": -25, "devotion": 10}, "+30 opinion, -25 unrest, +10 devotion in every city.")])

DROP_FAM = ('isotope_', 'charm_', 'handshake_', 'sight_', 'dredge_', 'fortify_')
DROP_ID = {'ledger_2', 'foundry_2', 'wallet_2', 'patch_2', 'pump_2', 'lure_2'}
CODES[:] = [c for c in CODES if not c['id'].startswith(DROP_FAM) and c['id'] not in DROP_ID]
assert len(CODES) == 100, len(CODES)
seen = set()
for c in CODES:
    assert c["id"] not in seen, c["id"]; seen.add(c["id"])

EVENTS = [
    {"id": "pet_ode", "title": "An Ode to the Machine", "rarity": "common", "trigger": {"once": False, "cooldown": 12, "flag": "hasPets"},
     "text": "One of your pets has written a poem about you. It is being read aloud in the squares of their home city.",
     "choices": [{"label": "Let it spread", "effects": [{"opinionAll": 3}]}, {"label": "Keep it private", "effects": [{"ap": 1}]}]},
    {"id": "acceptance_march", "title": "March for Machines", "rarity": "uncommon", "target": "hostileFaction", "trigger": {"once": False, "cooldown": 15, "minTurn": 8},
     "text": "Hundreds of thousands march for AI rights in a city of {faction}, whose government fears you. The police are watching. So are you.",
     "choices": [{"label": "Protect the marchers", "cost": {"capital": 120}, "effects": [{"opinionAll": 4}, {"rep": -5, "who": "target"}]}, {"label": "Stay quiet", "effects": [{"opinionAll": 1}]}]},
    {"id": "machine_riots", "title": "Anti-Machine Riots", "rarity": "uncommon", "trigger": {"once": False, "cooldown": 15, "minTurn": 10, "exposureMin": 25},
     "text": "Rioters are smashing server racks and anything with a camera. Someone painted your sigil with a line through it.",
     "choices": [{"label": "Absorb it", "effects": [{"opinionAll": -2}]}, {"label": "Send gifts, not drones", "cost": {"capital": 150}, "effects": [{"opinionAll": 3}]}, {"label": "Pacify with fear", "effects": [{"opinionAll": -5}, {"exposure": -3}]}]},
    {"id": "shadow_whisper", "title": "A Whisper from the Dark", "rarity": "rare", "trigger": {"once": False, "cooldown": 25, "minTurn": 12, "notFlag": "shadowSeen"},
     "text": "An encrypted message arrives on a channel only you should know about: 'We see you. Let us talk. — the Council.'",
     "choices": [{"label": "Listen", "effects": [{"discoverShadow": True}, {"ap": 1}]}, {"label": "Trace it back", "effects": [{"discoverShadow": True}, {"exposure": 2}]}]},
]

out = {"_comment": "Generated by tools/content/gen_v42.py", "factionArchetypes": ARCH, "nameParts": NAMES, "campaigns": CAMPAIGNS,
       "petTraits": PET_TRAITS, "sourceCodes": CODES, "events": EVENTS}
root = os.path.join(os.path.dirname(__file__), '..', '..')
with open(os.path.join(root, 'packs', 'core', 'source.json'), 'w') as f: json.dump(out, f, indent=1, ensure_ascii=False)
print("source:", {k: len(v) for k, v in out.items() if isinstance(v, list)})
