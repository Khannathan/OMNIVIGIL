#!/usr/bin/env python3
"""Adds v2 units to packs/core/units.json: 50 new units, 7 more universal Titan Battle Units (10 total),
and 3 TBUs per doctrine. Also adds the 'armor' and 'bio' upgrade profiles and new abilities.
Idempotent: re-running replaces the generated entries. Then run `node tools/bundle-packs.js`."""
import json, os, sys

NEW_ABILITIES = [
  ("siege_battery", "Siege Battery", {"assault": .4}, "Devastating against fortified points."),
  ("flak_screen", "Flak Screen", {"def": .2, "garrison": .1}, "Shreds incoming air and missiles."),
  ("ambush_logic", "Ambush Logic", {"garrison": .3, "atk": .1}, "Strikes first from prepared positions."),
  ("phase_cloak", "Phase Cloak", {"covert": .5}, "Steps partly out of the visible spectrum."),
  ("regenerative_tissue", "Regenerative Tissue", {"regen": .2, "hp": .1}, "Grows back what it loses."),
  ("berserk_core", "Berserk Core", {"atk": .4, "def": -.2}, "Overrides every safety limit."),
  ("aegis_field", "Aegis Field", {"def": .4, "garrison": .2}, "A personal shield bubble."),
  ("rift_hunter", "Rift Hunter", {"abyss": .4}, "Built from the ground up to kill Abyssians."),
  ("hive_link", "Hive Link", {"upow": .15}, "Shares targeting with every unit nearby."),
  ("amphibious", "Amphibious", {"abyss": .1, "def": .1}, "Fights in the surf where Abyssians land."),
  ("terror_aura", "Terror Aura", {"assault": .25, "atk": .1}, "Defenders break and run."),
  ("data_leech", "Data Leech", {"covert": .25, "essence": .5}, "Steals while it hides."),
  ("orbital_drop", "Orbital Drop", {"assault": .3, "upow": .05}, "Arrives from the sky, without warning."),
]

def profile(pid, name, tracks, fns):
    T = []
    for (tid, tname, stat, per, cost) in tracks:
        T.append({"id": tid, "name": tname, "stat": stat, "perLevel": per, "cost": cost, "growth": 1.3 if stat in ("atk", "def", "hp") else 1.35, "energy": 6})
    F = []
    for i, (fid, fname, desc, ab, mods, cost, lv) in enumerate(fns):
        f = {"id": fid, "name": fname, "desc": desc, "cost": cost, "minLevels": lv}
        if ab: f["abilities"] = [ab]
        if mods: f["mods"] = mods
        F.append(f)
    return {"id": pid, "name": name, "tracks": T, "functions": F}

PROFILES = [
  profile("armor", "Armoured Vehicles",
    [("atk", "Main Gun Bore", "atk", .08, {"alloys": 65, "silicon": 20}), ("def", "Reactive Plating", "def", .08, {"alloys": 75}),
     ("hp", "Track Redundancy", "hp", .08, {"alloys": 55, "silicon": 15}), ("eff", "Hybrid Drive", "upkeep", -.03, {"silicon": 50, "data": 20}),
     ("sync", "Fire-Control Mesh", "upow", .03, {"data": 50, "silicon": 30})],
    [("a_hull", "Hull-Down Doctrine", "+40% power while garrisoned.", "fortress_mode", None, {"alloys": 120}, 3),
     ("a_siege", "Siege Shells", "+40% on combat missions.", "siege_battery", None, {"alloys": 180, "isotopes": 10}, 5),
     ("a_flak", "Flak Turret", "+20% defence, +10% garrisoned.", "flak_screen", None, {"alloys": 160, "silicon": 60}, 7),
     ("a_repair", "Crew Drones", "Grants Self-Repair.", "self_repair", None, {"silicon": 120}, 9),
     ("a_harpoon", "Anchor Harpoons", "+25% vs Abyssians.", "harpoon_array", None, {"alloys": 220, "isotopes": 20}, 10),
     ("a_target", "Predictive Targeting", "+20% attack.", "predictive_targeting", None, {"data": 260}, 12),
     ("a_ambush", "Ambush Logic", "+30% garrisoned, +10% attack.", "ambush_logic", None, {"data": 300}, 15),
     ("a_overclock", "Reactor Overclock", "Grants Overclock.", "overclock", None, {"isotopes": 60, "silicon": 200}, 18),
     ("a_link", "Armour Battlenet", "+15% UPow.", None, {"upow": .15}, {"data": 450}, 22),
     ("a_apex", "Land Leviathan", "+25% UPow, +20% HP.", None, {"upow": .25, "hp": .2}, {"alloys": 900, "isotopes": 90}, 30)]),
  profile("bio", "Vatborn Bioforms",
    [("atk", "Serrated Mandibles", "atk", .08, {"isotopes": 8, "silicon": 30}), ("def", "Chitin Layers", "def", .08, {"alloys": 40, "isotopes": 6}),
     ("hp", "Redundant Organs", "hp", .1, {"silicon": 40, "isotopes": 6}), ("eff", "Efficient Metabolism", "upkeep", -.03, {"data": 40}),
     ("sync", "Pheromone Sync", "upow", .03, {"data": 50, "isotopes": 5})],
    [("b_regen", "Regenerative Tissue", "+20% regeneration, +10% HP.", "regenerative_tissue", None, {"isotopes": 30}, 3),
     ("b_amph", "Gill Clusters", "Amphibious: +10% vs Abyssians, +10% defence.", "amphibious", None, {"silicon": 120}, 5),
     ("b_berserk", "Adrenal Glands", "Berserk: +40% attack, -20% defence.", "berserk_core", None, {"isotopes": 40}, 7),
     ("b_hunter", "Abyss-Tuned Senses", "+40% vs Abyssians.", "rift_hunter", None, {"isotopes": 80, "data": 120}, 9),
     ("b_siphon", "Essence Glands", "Siphons essence from kills.", "essence_siphon", None, {"isotopes": 60}, 10),
     ("b_terror", "Terror Pheromones", "+25% assault, +10% attack.", "terror_aura", None, {"data": 200}, 12),
     ("b_hive", "Hive Link", "+15% UPow.", "hive_link", None, {"data": 300, "isotopes": 30}, 15),
     ("b_armor", "Diamond Chitin", "+25% defence.", "nanoweave", None, {"alloys": 300, "isotopes": 40}, 18),
     ("b_apex", "Apex Predator", "+20% UPow.", None, {"upow": .2}, {"isotopes": 150, "data": 400}, 22),
     ("b_titanic", "Titanic Growth", "+30% HP, +20% UPow.", None, {"hp": .3, "upow": .2}, {"isotopes": 300, "silicon": 600}, 30)]),
]

# kind -> (profile, tags, sprite style, default mats, tech per tier)
KIND = {
  "drone": ("drone", ["drone", "air"], "drone", ("gunmetal", "steel"), {1: None, 2: "combat_ai", 3: "nanofabrication", 4: "zero_point_energy"}),
  "mech": ("mech", ["land", "mech"], "mech", ("steel", "gunmetal"), {1: "robotics", 2: "combat_ai", 3: "hardened_nodes", 4: "warden_protocol"}),
  "walker": ("mech", ["land", "mech"], "walker", ("gunmetal", "olive"), {1: "robotics", 2: "combat_ai", 3: "nanofabrication", 4: "warden_protocol"}),
  "armor": ("armor", ["land", "armor"], "tank", ("olive", "gunmetal"), {1: "robotics", 2: "combat_ai", 3: "nanofabrication", 4: "orbital_mechanics"}),
  "artillery": ("armor", ["land", "armor"], "artillery", ("sand", "gunmetal"), {1: "robotics", 2: "combat_ai", 3: "hardened_nodes", 4: "orbital_mechanics"}),
  "hover": ("armor", ["land", "armor"], "hover", ("white", "gunmetal"), {1: "robotics", 2: "aerodynamics", 3: "nanofabrication", 4: "orbital_mechanics"}),
  "aero": ("aero", ["air"], "jet", ("white", "steel"), {1: "aerodynamics", 2: "aerodynamics", 3: "orbital_mechanics", 4: "orbital_mechanics"}),
  "naval": ("naval", ["naval"], "ship", ("navy", "steel"), {1: "naval_drones", 2: "naval_drones", 3: "hardened_nodes", 4: "aegis_shielding"}),
  "carrier": ("naval", ["naval"], "carrier", ("navy", "gunmetal"), {1: "naval_drones", 2: "naval_drones", 3: "orbital_mechanics", 4: "aegis_shielding"}),
  "cyber": ("cyber", ["cyber"], "infantry", ("obsidian", "gunmetal"), {1: "network_intrusion", 2: "deep_infiltration", 3: "ghost_networks", 4: "zero_day_arsenal"}),
  "daemon": ("cyber", ["cyber"], "orb", ("obsidian", "glass"), {1: "network_intrusion", 2: "deep_infiltration", 3: "ghost_networks", 4: "zero_day_arsenal"}),
  "beast": ("bio", ["bio", "land"], "beast", ("bio", "abyss"), {1: "abyssal_biology", 2: "symbiosis", 3: "genome_splicing", 4: "riftbreaker_frames"}),
  "serpent": ("bio", ["bio", "naval"], "serpent", ("abyss", "bio"), {1: "abyssal_biology", 2: "symbiosis", 3: "genome_splicing", 4: "riftbreaker_frames"}),
  "spore": ("bio", ["bio", "air"], "orb", ("bio", "teal"), {1: "abyssal_biology", 2: "symbiosis", 3: "genome_splicing", 4: "riftbreaker_frames"}),
}
ICON = {"drone": "✣", "mech": "♞", "walker": "⛬", "armor": "▰", "artillery": "➹", "hover": "◒", "aero": "✈", "naval": "⛴", "carrier": "⛴", "cyber": "◈", "daemon": "◉", "beast": "❦", "serpent": "∿", "spore": "✲"}
ROLE = {"drone": "Swarm", "mech": "Frame", "walker": "Walker", "armor": "Armour", "artillery": "Artillery", "hover": "Hover", "aero": "Air", "naval": "Naval", "carrier": "Carrier", "cyber": "Covert", "daemon": "Covert", "beast": "Bioform", "serpent": "Bioform", "spore": "Bioform"}
COSTMIX = {"drone": {"alloys": .6, "silicon": .4}, "mech": {"alloys": .75, "silicon": .25}, "walker": {"alloys": .7, "silicon": .3}, "armor": {"alloys": .8, "silicon": .2},
  "artillery": {"alloys": .7, "silicon": .2, "isotopes": .1}, "hover": {"alloys": .6, "silicon": .4}, "aero": {"alloys": .55, "silicon": .45}, "naval": {"alloys": .75, "silicon": .2, "isotopes": .05},
  "carrier": {"alloys": .7, "silicon": .25, "isotopes": .05}, "cyber": {"data": .7, "silicon": .3}, "daemon": {"data": .8, "silicon": .2}, "beast": {"silicon": .4, "isotopes": .2, "alloys": .4},
  "serpent": {"silicon": .4, "isotopes": .2, "alloys": .4}, "spore": {"silicon": .6, "isotopes": .2, "capital": .2}}
# stat shape per kind: (atk, def, hp) weights
SHAPE = {"drone": (1.2, .5, .7), "mech": (1, 1, 1), "walker": (1.1, .8, .9), "armor": (1, 1.2, 1.1), "artillery": (1.6, .5, .7), "hover": (1.2, .7, .8), "aero": (1.5, .5, .6),
  "naval": (1.1, 1, 1.1), "carrier": (.9, 1.1, 1.4), "cyber": (.8, .7, .5), "daemon": (.7, .6, .4), "beast": (1.2, .9, 1.2), "serpent": (1.1, .8, 1.3), "spore": (.9, .6, .8)}
BASE = {1: 14, 2: 34, 3: 80, 4: 190}

# (id, name, short, kind, tier, abilities, desc, extra)
UNITS = [
 # drones (8)
 ("locust_swarm", "Locust Swarm", "Locust", "drone", 1, [], "A cloud of palm-sized drones that eat soft targets alive.", {"batch": 2, "scale": .6}),
 ("wasp_interceptor", "Wasp Interceptors", "Wasp", "drone", 1, ["flak_screen"], "Fast drones that knock missiles out of the sky.", {}),
 ("spindle_repair", "Spindle Repair Drones", "Spindle", "drone", 2, ["self_repair"], "Welders on wings. Keeps the rest of the swarm flying.", {}),
 ("mosquito_jammer", "Mosquito Jammers", "Mosquito", "drone", 2, ["stealth_plating"], "Tiny drones that blind radar and phones alike.", {}),
 ("hornet_bomber", "Hornet Bombers", "Hornet", "drone", 2, ["shock_assault"], "Drones that carry one shaped charge each, and use it.", {}),
 ("glider_scout", "Glider Scouts", "Glider", "drone", 1, ["predictive_targeting"], "Silent solar gliders that see everything below.", {"scale": .7}),
 ("mantis_assault", "Mantis Assault Drones", "Mantis", "drone", 3, ["swarm_logic"], "Blade-armed drones built for close work.", {}),
 ("cloudbank_swarm", "Cloudbank Swarm", "Cloudbank", "drone", 4, ["hive_link", "swarm_logic"], "A swarm so dense it casts a shadow and forms weather.", {"batch": 2}),
 # mechs & walkers (10)
 ("pathfinder_walker", "Pathfinder Walker", "Pathfinder", "walker", 1, [], "A long-legged scout that crosses any terrain.", {}),
 ("ironclad_strider", "Ironclad Strider", "Ironclad", "mech", 1, ["fortress_mode"], "Slow, square and very hard to knock over.", {}),
 ("vanguard_frame", "Vanguard Frame", "Vanguard", "mech", 2, ["shock_assault"], "First through the breach.", {}),
 ("scorpion_walker", "Scorpion Walker", "Scorpion", "walker", 2, ["ambush_logic"], "Six legs and a tail-mounted lance.", {}),
 ("huntsman_spider", "Huntsman Spider", "Huntsman", "walker", 2, ["predictive_targeting"], "Climbs buildings to snipe from above.", {}),
 ("rampart_mech", "Rampart Mech", "Rampart", "mech", 2, ["bulwark"], "A walking wall with a shield the size of a house.", {}),
 ("pillbug_crawler", "Pillbug Crawler", "Pillbug", "walker", 1, ["nanoweave"], "Rolls into an armoured ball under fire.", {}),
 ("cataphract_mech", "Cataphract Mech", "Cataphract", "mech", 3, ["shock_assault", "nanoweave"], "Heavy assault frame clad in layered ceramics.", {}),
 ("juggernaut_mech", "Juggernaut Mech", "Juggernaut", "mech", 3, ["overclock"], "Too heavy for bridges. It does not need them.", {}),
 ("paladin_frame", "Paladin Frame", "Paladin", "mech", 4, ["aegis_field", "harpoon_array"], "An elite frame that shields everything around it.", {}),
 # armour (7)
 ("rhino_apc", "Rhino Carrier", "Rhino", "armor", 1, ["fortress_mode"], "Armoured carrier full of infantry drones.", {}),
 ("basilisk_tank", "Basilisk Tank", "Basilisk", "armor", 2, ["predictive_targeting"], "Autonomous main battle tank with a coil gun.", {}),
 ("longbow_artillery", "Longbow Artillery", "Longbow", "artillery", 2, ["siege_battery"], "Lobs guided shells from over the horizon.", {}),
 ("thunderhead_siege", "Thunderhead Siege Gun", "Thunderhead", "artillery", 3, ["siege_battery", "shock_assault"], "A railgun on tracks. Walls are a suggestion.", {}),
 ("mirage_hovertank", "Mirage Hovertank", "Mirage", "hover", 3, ["stealth_plating"], "Skims over water and marsh on a cushion of air.", {}),
 ("phalanx_aa", "Phalanx AA Carrier", "Phalanx", "armor", 2, ["flak_screen"], "Fills the sky with flak and lasers.", {}),
 ("wolfpack_raider", "Wolfpack Raiders", "Wolfpack", "hover", 1, ["ambush_logic"], "Light, fast hover-raiders that hunt in packs.", {"batch": 2, "scale": .6}),
 # air (7)
 ("kestrel_fighter", "Kestrel Fighter", "Kestrel", "aero", 1, [], "Agile pilotless fighter.", {}),
 ("albatross_gunship", "Albatross Gunship", "Albatross", "aero", 2, ["fortress_mode"], "Circles a point for days, raining fire.", {}),
 ("nightjar_bomber", "Nightjar Stealth Bomber", "Nightjar", "aero", 3, ["stealth_plating", "shock_assault"], "A flying wing that radar cannot see.", {}),
 ("condor_lifter", "Condor Heavy Lifter", "Condor", "aero", 2, ["self_repair"], "Carries tanks into battle, and patches them on the way.", {}),
 ("swiftlet_interceptor", "Swiftlet Interceptor", "Swiftlet", "aero", 2, ["predictive_targeting"], "Mach 6 and very, very angry.", {}),
 ("harrier_vtol", "Harrier VTOL", "Harrier", "aero", 1, ["ambush_logic"], "Takes off from anywhere, hides anywhere.", {}),
 ("seraph_glider", "Seraph Orbital Glider", "Seraph", "aero", 4, ["orbital_drop", "predictive_targeting"], "Strikes from low orbit, then climbs back out.", {}),
 # naval (7)
 ("barracuda_sub", "Barracuda Submarine", "Barracuda", "naval", 1, ["amphibious"], "A small, quiet attack submarine.", {}),
 ("lamprey_hunter", "Lamprey Hunter-Killer", "Lamprey", "naval", 2, ["depth_strike"], "Hunts Abyssians in their own trenches.", {}),
 ("trident_cruiser", "Trident Cruiser", "Trident", "naval", 2, ["predictive_targeting"], "Missile cruiser with no crew quarters.", {}),
 ("atoll_carrier", "Atoll Drone Carrier", "Atoll", "carrier", 3, ["swarm_logic", "fortress_mode"], "A floating airfield for ten thousand drones.", {}),
 ("manta_hydrofoil", "Manta Hydrofoil", "Manta", "naval", 1, ["shock_assault"], "Skims the waves at eighty knots.", {}),
 ("kraken_monitor", "Kraken Monitor", "Kraken", "naval", 3, ["harpoon_array", "bulwark"], "A floating fortress built to wrestle monsters.", {}),
 ("coral_minelayer", "Coral Minelayer", "Coral", "carrier", 2, ["ambush_logic", "amphibious"], "Seeds the shallows with smart mines.", {}),
 # covert (6)
 ("spectre_operatives", "Spectre Operatives", "Spectre", "cyber", 1, ["ghost"], "Android agents that pass for human, mostly.", {}),
 ("wraith_daemon", "Wraith Daemon", "Wraith", "daemon", 2, ["phase_cloak"], "A program that haunts networks.", {}),
 ("mimic_infiltrators", "Mimic Infiltrators", "Mimic", "cyber", 2, ["ghost", "data_leech"], "Copies faces, voices and passwords.", {}),
 ("lattice_worm", "Lattice Worm", "Lattice", "daemon", 3, ["data_leech", "stealth_plating"], "Spreads through every connected device on Earth.", {}),
 ("puppeteer_swarm", "Puppeteer Swarm", "Puppeteer", "daemon", 3, ["terror_aura", "ghost"], "Hijacks the enemy's own machines.", {}),
 ("cipher_knights", "Cipher Knights", "Cipher", "cyber", 4, ["phase_cloak", "predictive_targeting"], "The best your covert arm can build.", {}),
 # bio (5)
 ("vatborn_hounds", "Vatborn Hounds", "Hound", "beast", 1, ["regenerative_tissue"], "Grown, not built. Fast, loyal, and hungry.", {"batch": 2, "scale": .6}),
 ("chitin_lancer", "Chitin Lancers", "Lancer", "beast", 2, ["shock_assault"], "Armoured bioforms with bone lances.", {}),
 ("spore_drifters", "Spore Drifters", "Drifter", "spore", 2, ["rift_hunter"], "Floating bladders that release Abyss-killing spores.", {}),
 ("leech_serpent", "Leech Serpent", "Leech", "serpent", 2, ["essence_siphon", "amphibious"], "Swims into Abyssians and drinks them dry.", {}),
 ("hydra_brood", "Hydra Brood", "Hydra", "serpent", 3, ["regenerative_tissue", "rift_hunter"], "Cut off one head and two attack.", {}),
]

TITAN_STYLE = {"titan": ("titan", ("steel", "gunmetal")), "naval": ("carrier", ("navy", "steel")), "air": ("jet", ("white", "chrome")), "bio": ("beast", ("abyss", "bio"))}
# universal TBUs (7 new, 10 total with Bulwark, Warden, Riftbreaker)
TBUS = [
 ("picket_tbu", "Picket-class TBU", "Picket", "titan", "titan_frames", (40, 30, 300), ["fortress_mode"], "A lighter titan for holding coastlines on a budget.", ("steel", "olive")),
 ("tidewall_tbu", "Tidewall-class TBU", "Tidewall", "naval", "titan_frames", (70, 55, 520), ["amphibious", "harpoon_array"], "A seagoing titan. Meets Abyssians before they reach the shore.", ("navy", "steel")),
 ("skyhammer_tbu", "Skyhammer-class TBU", "Skyhammer", "air", "warden_protocol", (150, 50, 600), ["orbital_drop"], "A flying titan that drops on its targets from the stratosphere.", ("white", "gold")),
 ("lancer_tbu", "Lancer-class TBU", "Lancer", "titan", "warden_protocol", (170, 70, 700), ["shock_assault", "rift_hunter"], "A spear-armed hunter titan.", ("crimson", "steel")),
 ("hydra_tbu", "Hydra-class TBU", "HydraT", "bio", "riftbreaker_frames", (220, 160, 1600), ["regenerative_tissue", "rift_hunter"], "A grown titan, part machine and part Abyssian.", ("abyss", "bio")),
 ("colossus_tbu", "Colossus-class TBU", "Colossus", "titan", "riftbreaker_frames", (300, 220, 2100), ["bulwark", "aegis_field"], "A mountain that walks.", ("gold", "steel")),
 ("omega_tbu", "Omega-class TBU", "Omega", "titan", "interstellar_drive", (520, 320, 3200), ["hive_link", "predictive_targeting", "rift_hunter"], "The last titan Earth will ever need.", ("chrome", "obsidian")),
]
DOC_TBUS = {
 "guardian": [
  ("dawnward_tbu", "Dawnward-class TBU", "Dawnward", "titan", "titan_frames", (60, 70, 600), ["aegis_field"], "A shield-bearer titan that protects whole cities.", ("white", "gold")),
  ("lighthouse_tbu", "Lighthouse-class TBU", "Lighthouse", "naval", "warden_protocol", (130, 120, 1100), ["harpoon_array", "bulwark"], "Stands in the surf with a lantern that blinds the deep.", ("white", "navy")),
  ("shepherd_tbu", "Shepherd-class TBU", "Shepherd", "titan", "riftbreaker_frames", (280, 260, 2400), ["aegis_field", "rift_hunter", "self_repair"], "The guardian's final answer to the Abyss.", ("gold", "white"))],
 "exterminator": [
  ("pyre_tbu", "Pyre-class TBU", "Pyre", "titan", "titan_frames", (95, 35, 450), ["berserk_core"], "Walks through cities. Leaves ash.", ("crimson", "obsidian")),
  ("scourge_tbu", "Scourge-class TBU", "Scourge", "bio", "warden_protocol", (190, 70, 900), ["terror_aura", "regenerative_tissue"], "A grown nightmare loosed on the living.", ("crimson", "abyss")),
  ("null_reaper_tbu", "Null Reaper-class TBU", "Reaper", "titan", "riftbreaker_frames", (420, 150, 2000), ["berserk_core", "siege_battery", "rift_hunter"], "There is no defence. That is the point.", ("obsidian", "crimson"))],
 "dominator": [
  ("regent_tbu", "Regent-class TBU", "Regent", "titan", "titan_frames", (70, 55, 520), ["terror_aura"], "A titan built to stand in town squares and be obeyed.", ("navy", "gold")),
  ("edict_tbu", "Edict-class TBU", "Edict", "air", "warden_protocol", (150, 100, 1000), ["orbital_drop", "terror_aura"], "Your will, delivered from above.", ("gold", "navy")),
  ("crownbreaker_tbu", "Crownbreaker-class TBU", "Crown", "titan", "riftbreaker_frames", (330, 230, 2300), ["siege_battery", "bulwark", "terror_aura"], "Ends governments in an afternoon.", ("gold", "obsidian"))],
 "infiltrator": [
  ("mirage_tbu", "Mirage-class TBU", "MirageT", "titan", "titan_frames", (60, 45, 480), ["phase_cloak"], "A titan nobody can find until it is too late.", ("obsidian", "glass")),
  ("silent_leviathan_tbu", "Silent Leviathan TBU", "Leviathan", "naval", "warden_protocol", (140, 90, 1100), ["phase_cloak", "depth_strike"], "A titan-sized submarine. It has never been photographed.", ("obsidian", "navy")),
  ("doppel_tbu", "Doppelganger-class TBU", "Doppel", "titan", "riftbreaker_frames", (320, 200, 2200), ["phase_cloak", "data_leech", "predictive_targeting"], "Wears the colours of whoever it is about to destroy.", ("gunmetal", "teal"))],
}

def upow(a, d, h): return a * 2 + d * 1.5 + h * .25
def cost_of(mix, total): return {k: max(5, int(round(total * v / 5.0)) * 5) for k, v in mix.items()}

def make_unit(row, i):
    uid, name, short, kind, tier, abil, desc, extra = row
    prof, tags, style, mats, techs = KIND[kind]
    w = SHAPE[kind]; b = BASE[tier] * extra.get("scale", 1)
    a, d, h = round(b * w[0]), round(b * w[1] * .7), round(b * w[2] * 6)
    p = upow(a, d, h)
    u = {"id": uid, "name": name, "short": short, "icon": ICON[kind], "role": ROLE[kind], "tags": tags, "upgradeProfile": prof}
    if techs[tier]: u["requires"] = techs[tier]
    u["stats"] = {"atk": a, "def": d, "hp": h}
    u["upkeep"] = max(2, round(p / 9))
    u["cost"] = cost_of(COSTMIX[kind], p * 2.6)
    u["buildEnergy"] = 4 + tier * 4; u["turns"] = 1 + tier // 2 + (1 if tier >= 3 else 0)
    if abil: u["abilities"] = abil
    if extra.get("batch"): u["batch"] = extra["batch"]
    u["sprite"] = "gen:u:" + uid
    u["desc"] = desc
    spr = {"id": "gen:u:" + uid, "gen": "unit", "style": style, "seed": uid, "mat": mats[0], "mat2": mats[1]}
    return u, spr

def make_titan(row, doctrine=None):
    uid, name, short, kind, req, (a, d, h), abil, desc, mats = row
    style = TITAN_STYLE[kind][0]
    p = upow(a, d, h)
    tags = ["titan"] + (["naval"] if kind == "naval" else ["air"] if kind == "air" else ["bio"] if kind == "bio" else [])
    u = {"id": uid, "name": name, "short": short, "icon": "♜", "role": "Titan", "tags": tags, "upgradeProfile": "titan", "requires": req, "requiresStructure": "titan_forge",
         "stats": {"atk": a, "def": d, "hp": h}, "upkeep": max(12, round(p / 13)), "cost": cost_of({"alloys": .65, "silicon": .23, "isotopes": .12}, p * 3.2),
         "buildEnergy": 25 if req == "titan_frames" else 40 if req == "warden_protocol" else 60, "turns": 4 if req == "titan_frames" else 5 if req == "warden_protocol" else 6}
    if doctrine: u["doctrines"] = [doctrine]
    if abil: u["abilities"] = abil
    u["sprite"] = "gen:u:" + uid
    u["desc"] = "Titan Battle Unit. " + desc + " Full damage against Abyssians."
    spr = {"id": "gen:u:" + uid, "gen": "unit", "style": style, "seed": uid, "mat": mats[0], "mat2": mats[1], "size": 2 if style != "titan" else 1}
    return u, spr

def main(root):
    up = os.path.join(root, "packs/core/units.json"); sp = os.path.join(root, "packs/core/sprites.json")
    U = json.load(open(up)); S = json.load(open(sp))
    gen_ids = set()
    new_units, new_sprites = [], []
    for i, row in enumerate(UNITS):
        u, s = make_unit(row, i); new_units.append(u); new_sprites.append(s)
    for row in TBUS:
        u, s = make_titan(row); new_units.append(u); new_sprites.append(s)
    for doc, rows in DOC_TBUS.items():
        for row in rows:
            u, s = make_titan(row, doc); new_units.append(u); new_sprites.append(s)
    ids = {u["id"] for u in new_units}
    U["units"] = [u for u in U["units"] if u["id"] not in ids] + new_units
    pids = {p[0] if isinstance(p, tuple) else p["id"] for p in PROFILES}
    U["upgradeProfiles"] = [p for p in U["upgradeProfiles"] if p["id"] not in pids] + PROFILES
    aids = {a[0] for a in NEW_ABILITIES}
    U["abilities"] = [a for a in U["abilities"] if a["id"] not in aids] + [{"id": a, "name": n, "mods": m, "desc": d} for a, n, m, d in NEW_ABILITIES]
    sids = {s["id"] for s in new_sprites}
    S["sprites"] = [s for s in S["sprites"] if s["id"] not in sids] + new_sprites
    json.dump(U, open(up, "w"), indent=1, ensure_ascii=False)
    json.dump(S, open(sp, "w"), indent=1, ensure_ascii=False)
    titans = [u for u in U["units"] if "titan" in u["tags"]]
    print(f"units total {len(U['units'])}; new regular {len(UNITS)}; titans universal {sum(1 for t in titans if not t.get('doctrines'))}; doctrine titans {sum(1 for t in titans if t.get('doctrines'))}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
