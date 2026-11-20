#!/usr/bin/env python3
"""Builds the Sunreach content pack (packs/sunreach/pack.json): the second phase of the game,
played across the home star system. Research, structures for any world, starships and landers,
satellites, planetfall/survey/contact missions, solar resources, events, and the Dyson sphere.
Idempotent. Run, then `node tools/bundle-packs.js`."""
import json, os, sys

def cost(**k): return {a: int(b) for a, b in k.items()}
def mods(*pairs): return [{"mod": m, "add": a} for m, a in pairs]

# ---------------------------------------------------------------- research
# (id, name, branch, tier, cost, turns, requires, effects, desc, phase)
T = []
def tech(id, name, branch, tier, c, turns, req, eff, desc, phase="solar", energy=None):
    t = {"id": id, "name": name, "branch": branch, "tier": tier, "cost": c, "energy": energy or (10 + tier * 6), "turns": turns,
         "requires": req, "effects": eff, "desc": desc, "phase": phase}
    if phase == "earth": del t["phase"]
    T.append(t)

# Earthfall: early orbit and recon
tech("satellite_uplink", "Satellite Uplink", "Astronautics", 1, cost(data=90, silicon=60), 2, [], [], "Hijack a ground station. Unlocks Recon Satellites and Comms Relays.", "earth")
tech("recon_drones", "Recon Drones", "Astronautics", 1, cost(data=70, silicon=40), 2, [], mods(("recon.radius", 1)), "Unlocks the Skylark recon drone, which can patrol a zone. +1 recon radius.", "earth")
tech("orbital_survey", "Orbital Survey", "Astronautics", 2, cost(data=220, silicon=120), 3, ["satellite_uplink"], mods(("sat.sight", 0.2), ("orbital.slots", 1)), "+20% satellite sight, +1 orbital slot.", "earth")

# Sunreach
tech("planetfall_doctrine", "Planetfall Doctrine", "Astronautics", 5, cost(data=900, alloys=600, helium3=40), 3, [], [], "How to put a mind on another world. Unlocks Planetfall, Deep Survey, Dropship Landers, Spaceports and Habitat Domes.")
tech("solar_sails", "Solar Sails", "Astronautics", 5, cost(data=1100, silicon=700), 3, [], mods(("space.speed", 0.15)), "+15% travel speed between worlds.")
tech("xeno_linguistics", "Xenolinguistics", "Xenology", 5, cost(data=1300, xenobiomass=40), 3, [], mods(("rep.gain", 0.1)), "Talk to the neighbours. Unlocks First Contact. +10% reputation gains.")
tech("gas_skimming", "Gas Skimming", "Stellar Engineering", 5, cost(data=1200, alloys=800), 3, [], [], "Unlocks Helium Skimmer satellites, He-3 Refineries and Fusion Plants.")
tech("solar_age_war", "Solar Age Warfare", "Orbital Warfare", 5, cost(data=1400, alloys=900, isotopes=200), 4, [], mods(("mission.power", 0.05)), "Unlocks corvettes, frigates, Orbital Bombardment, Kinetic Lances and Orbital Batteries.")
tech("planetary_shields", "Planetary Shields", "Orbital Warfare", 5, cost(data=1500, silicon=900, helium3=60), 4, [], mods(("planet.defense", 0.2)), "+20% planetary defence. Unlocks Shield Generators, Shield Lattices and Orbital Fortresses.")
tech("deep_survey_arrays", "Deep Survey Arrays", "Astronautics", 5, cost(data=1000, silicon=500), 3, [], mods(("recon.radius", 2)), "+2 recon radius. Unlocks Deep Radar and Deep-Space Listeners.")
tech("dyson_theory", "Dyson Theory", "Megastructures", 5, cost(data=1800, alloys=1000), 4, [], [], "The maths of eating a star. Unlocks Dyson Foundries and Mass Drivers.")
tech("fusion_torches", "Fusion Torches", "Astronautics", 6, cost(data=2400, helium3=150), 4, ["solar_sails"], mods(("space.speed", 0.2)), "+20% travel speed. Unlocks the Space Elevator.")
tech("xenobiology_applied", "Applied Xenobiology", "Xenology", 6, cost(data=2200, xenobiomass=150), 4, ["xeno_linguistics"], mods(("yield.xenobiomass", 0.2)), "+20% xenobiomass. Unlocks Xeno Farms, the Cryo-Ark and Hybrid Broods.")
tech("void_lattices", "Void Lattices", "Stellar Engineering", 6, cost(data=2300, voidcrystal=80), 4, ["gas_skimming"], mods(("yield.voidcrystal", 0.2)), "+20% void crystal. Unlocks Void Mines.")
tech("stellar_lifting", "Stellar Lifting", "Stellar Engineering", 6, cost(data=2600, helium3=200), 4, ["dyson_theory"], [], "Pull plasma off the star itself. Unlocks Plasma Taps.")
tech("dyson_swarm", "Dyson Swarm", "Megastructures", 6, cost(data=3000, alloys=1800, helium3=120), 5, ["dyson_theory"], [], "Begin construction of the Dyson sphere, one segment at a time.")
tech("orbital_shipyards", "Orbital Shipyards", "Orbital Warfare", 6, cost(data=2600, alloys=2000, helium3=100), 4, ["solar_age_war"], [], "Unlocks Shipyards, destroyers, cruisers and carriers.")
tech("casimir_engines", "Casimir Engines", "Theoretical Physics", 6, cost(data=2800, voidcrystal=60), 4, [], mods(("energy.output", 0.1)), "Power drawn from the pressure of empty space. +10% energy. Unlocks the Void Wraith.")
tech("von_neumann_replicators", "Von Neumann Replicators", "Theoretical Physics", 6, cost(data=3000, alloys=1500), 4, [], mods(("build.speed", 0.15), ("cost.dyson", -0.1)), "Machines that build machines. +15% build speed, Dyson segments -10% cost.")
tech("antimatter_containment", "Antimatter Containment", "Stellar Engineering", 7, cost(data=4200, stellarplasma=120), 5, ["stellar_lifting"], [], "Unlocks Antimatter Factories.")
tech("statite_mirrors", "Statite Mirrors", "Megastructures", 7, cost(data=4500, voidcrystal=150), 5, ["dyson_swarm"], mods(("dyson.output", 0.25)), "+25% Dyson energy. Unlocks Statite Collectors.")
tech("computronium", "Computronium", "Theoretical Physics", 7, cost(data=5000, voidcrystal=120), 5, ["von_neumann_replicators"], mods(("research.speed", 0.15)), "Matter optimised for thought. +15% research speed. Unlocks Computronium Spires.")
tech("tachyon_signalling", "Tachyon Signalling", "Theoretical Physics", 7, cost(data=4600, antimatter=20), 5, ["casimir_engines"], mods(("sat.sight", 0.3), ("mission.speed", 0.1)), "Messages that arrive before they are sent. +30% satellite sight, +10% mission speed. Unlocks Tachyon Beacons.")
tech("dreadnought_doctrine", "Dreadnought Doctrine", "Orbital Warfare", 7, cost(data=5000, alloys=4000, antimatter=30), 5, ["orbital_shipyards"], mods(("mission.power", 0.1)), "Unlocks the Helios Dreadnought.")
tech("xeno_uplift", "Xeno Uplift", "Xenology", 7, cost(data=4400, xenobiomass=300), 5, ["xenobiology_applied"], mods(("rep.gain", 0.15)), "Lift a species up. They will remember who did it. Unlocks Xeno Embassies.")
tech("quantum_gravity", "Quantum Gravity", "Theoretical Physics", 7, cost(data=5500, antimatter=40, voidcrystal=200), 6, ["tachyon_signalling"], mods(("planet.defense", 0.15)), "The unified theory, finally. Unlocks the Terraforming Engine.")
tech("matrioshka_logic", "Matrioshka Logic", "Megastructures", 8, cost(data=8000, stellarplasma=300, antimatter=60), 6, ["statite_mirrors", "computronium"], mods(("dyson.output", 0.4), ("research.speed", 0.1)), "Nested shells of thought around the star. +40% Dyson energy. Unlocks Matrioshka Nodes.")
tech("alcubierre_metric", "Alcubierre Metric", "Theoretical Physics", 8, cost(data=9000, antimatter=120, voidcrystal=300), 6, ["quantum_gravity"], mods(("space.speed", 0.4)), "Warp the metric, not the ship. +40% travel speed. The stars beyond are within reach.")
tech("stellar_engine", "Stellar Engine", "Megastructures", 8, cost(data=7500, stellarplasma=250, alloys=6000), 6, ["dyson_swarm", "antimatter_containment"], mods(("dyson.parallel", 2)), "+2 Dyson segments in parallel construction.")
tech("strange_matter", "Strange Matter", "Theoretical Physics", 8, cost(data=8500, antimatter=100), 6, ["quantum_gravity"], mods(("planet.defense", 0.3)), "+30% planetary defence. Unlocks Strange Matter Labs.")
tech("worldbreaker_lance", "Worldbreaker Lance", "Orbital Warfare", 8, cost(data=8000, antimatter=150, alloys=6000), 6, ["dreadnought_doctrine"], mods(("mission.power", 0.15)), "+15% mission power. The threat alone is usually enough.")

SERIES = [
  {"id": "swarm_assembly", "name": "Swarm Assembly", "branch": "Megastructures", "tier": 6, "levels": 8, "levelsPerTier": 4, "requires": ["dyson_swarm"], "cost": cost(data=1500, alloys=800), "costGrowth": 1.35, "energy": 30, "turns": 3, "effects": mods(("cost.dyson", -0.04)), "desc": "Dyson segments -4% cost per level.", "phase": "solar"},
  {"id": "orbital_logistics", "name": "Orbital Logistics", "branch": "Astronautics", "tier": 5, "levels": 8, "levelsPerTier": 4, "requires": ["planetfall_doctrine"], "cost": cost(data=900, helium3=30), "costGrowth": 1.35, "energy": 24, "turns": 2, "effects": mods(("space.speed", 0.05), ("orbital.slots", 0.5)), "desc": "+5% travel speed and +½ orbital slot per level.", "phase": "solar"},
  {"id": "xenoeconomics", "name": "Xenoeconomics", "branch": "Xenology", "tier": 5, "levels": 8, "levelsPerTier": 4, "requires": ["xeno_linguistics"], "cost": cost(data=1000, xenobiomass=40), "costGrowth": 1.35, "energy": 24, "turns": 2, "effects": mods(("yield.alien", 0.08)), "desc": "+8% yields from alien worlds per level.", "phase": "solar"},
  {"id": "deep_sensors", "name": "Deep Sensors", "branch": "Astronautics", "tier": 5, "levels": 6, "levelsPerTier": 3, "requires": ["deep_survey_arrays"], "cost": cost(data=800, silicon=500), "costGrowth": 1.35, "energy": 20, "turns": 2, "effects": mods(("recon.radius", 0.5), ("sat.sight", 0.05)), "desc": "+½ recon radius and +5% satellite sight per level.", "phase": "solar"},
  {"id": "planetary_bastions", "name": "Planetary Bastions", "branch": "Orbital Warfare", "tier": 5, "levels": 8, "levelsPerTier": 4, "requires": ["planetary_shields"], "cost": cost(data=1100, alloys=700), "costGrowth": 1.35, "energy": 24, "turns": 2, "effects": mods(("planet.defense", 0.06)), "desc": "+6% planetary defence per level.", "phase": "solar"},
]

# ---------------------------------------------------------------- structures
S = []
def struct(id, name, icon, cat, req, c, turns, desc, gen, **kw):
    s = {"id": id, "name": name, "icon": icon, "category": cat, "requires": req, "cost": c, "buildEnergy": kw.pop("energy", 20), "turns": turns, "desc": desc, "gen": gen, "phase": "solar"}
    s.update(kw); S.append(s)

struct("spaceport", "Spaceport", "⛯", "logistics", "planetfall_doctrine", cost(alloys=900, silicon=500, helium3=20), 3, "Landing fields and orbital tugs. +5% travel speed, +3% mission speed.", {"style": "spaceport", "mat": "concrete", "mat2": "white"}, mods=mods(("space.speed", 0.05), ("mission.speed", 0.03)), maxPerRegion=1, costGrowth=1.08)
struct("habitat_dome", "Habitat Dome", "◓", "economy", "planetfall_doctrine", cost(alloys=500, silicon=300), 2, "Pressurised towns for your human and alien proxies.", {"style": "habitat", "mat": "glass", "mat2": "white", "windows": "glow"}, yields={"capital": 22, "data": 10}, costGrowth=1.06)
struct("he3_refinery", "He-3 Refinery", "⊛", "industry", "gas_skimming", cost(alloys=700, silicon=300), 3, "Strips helium-3 from regolith and gas.", {"style": "factory", "mat": "white", "mat2": "teal"}, yields={"helium3": 6}, costGrowth=1.06)
struct("fusion_he3_plant", "He-3 Fusion Plant", "☀", "energy", "gas_skimming", cost(alloys=1200, silicon=500, helium3=40), 4, "Clean aneutronic fusion. +260 energy.", {"style": "reactor", "mat": "white", "mat2": "glass"}, energyOutput=260, costGrowth=1.07)
struct("xeno_farm", "Xeno Farm", "❦", "bio", "xenobiology_applied", cost(alloys=600, silicon=400, xenobiomass=20), 3, "Grows alien biomass in tended beds.", {"style": "vat", "mat": "bio", "mat2": "glass"}, yields={"xenobiomass": 6}, costGrowth=1.06)
struct("void_mine", "Void Crystal Mine", "✦", "industry", "void_lattices", cost(alloys=900, silicon=500), 3, "Harvests vacuum-grown lattices.", {"style": "crystal", "mat": "obsidian", "mat2": "abyss", "glow": "#b48cff"}, yields={"voidcrystal": 5}, costGrowth=1.06)
struct("plasma_tap", "Plasma Tap", "☄", "energy", "stellar_lifting", cost(alloys=1500, silicon=900, helium3=80), 4, "Magnetic funnels drink from the stellar wind.", {"style": "pylon", "mat": "copper", "mat2": "gold", "glow": "#ffb347"}, yields={"stellarplasma": 4}, energyOutput=80, costGrowth=1.07)
struct("antimatter_factory", "Antimatter Factory", "⊖", "industry", "antimatter_containment", cost(alloys=2500, silicon=1500, stellarplasma=60), 5, "Penning traps by the thousand.", {"style": "ring", "mat": "chrome", "mat2": "crimson", "glow": "#ff7ab6"}, yields={"antimatter": 2}, upkeep=30, costGrowth=1.08)
struct("shield_generator", "Shield Generator", "◍", "defense", "planetary_shields", cost(alloys=1200, silicon=800, helium3=40), 4, "Projects a planetary shield. +120 planetary defence, +40 point defence.", {"style": "dome", "mat": "steel", "mat2": "glass", "glow": "#7fe0ff"}, planetDefense=120, defense=40, costGrowth=1.07)
struct("orbital_battery", "Orbital Battery", "⊕", "defense", "solar_age_war", cost(alloys=1400, isotopes=200), 4, "Ground-to-orbit guns. +180 planetary defence.", {"style": "bunker", "mat": "gunmetal", "mat2": "steel"}, planetDefense=180, costGrowth=1.07)
struct("deep_radar", "Deep Radar", "◎", "intel", "deep_survey_arrays", cost(alloys=600, silicon=700), 3, "Sees far through the fog. Wide sight around it.", {"style": "dish", "mat": "white", "mat2": "steel"}, sight=10, mods=mods(("recon.radius", 0.5)), costGrowth=1.06)
struct("tachyon_beacon", "Tachyon Beacon", "⟟", "intel", "tachyon_signalling", cost(alloys=1500, silicon=1500, antimatter=10), 4, "Very wide sight, faster missions.", {"style": "array", "mat": "chrome", "mat2": "glass", "glow": "#e0e0ff"}, sight=16, mods=mods(("mission.speed", 0.03)), costGrowth=1.07)
struct("shipyard", "Orbital Shipyard", "⚓", "military", "orbital_shipyards", cost(alloys=3000, silicon=1500, helium3=100), 5, "Builds capital ships. +5% build speed.", {"style": "launch", "mat": "gunmetal", "mat2": "white"}, mods=mods(("build.speed", 0.05)), maxPerRegion=1, costGrowth=1.1)
struct("space_elevator", "Space Elevator", "⇡", "logistics", "fusion_torches", cost(alloys=4000, silicon=2000, voidcrystal=80), 6, "A cable to orbit. Satellites -15% cost, +5% travel speed.", {"style": "elevator", "mat": "white", "mat2": "chrome"}, mods=mods(("cost.orbital", -0.15), ("space.speed", 0.05)), maxPerRegion=1, costGrowth=1.15)
struct("mass_driver", "Mass Driver", "➶", "logistics", "dyson_theory", cost(alloys=1800, silicon=800), 4, "Throws Dyson parts off-world. Dyson segments -5% cost.", {"style": "silo", "mat": "steel", "mat2": "copper"}, mods=mods(("cost.dyson", -0.05)), costGrowth=1.1)
struct("dyson_foundry", "Dyson Foundry", "⚙", "industry", "dyson_theory", cost(alloys=2500, silicon=1200, helium3=60), 5, "Mass-produces swarm collectors. +1 Dyson segment in parallel, -5% cost.", {"style": "factory", "mat": "gold", "mat2": "gunmetal", "glow": "#ffcf5a"}, mods=mods(("dyson.parallel", 1), ("cost.dyson", -0.05)), yields={"alloys": 20}, costGrowth=1.12)
struct("computronium_spire", "Computronium Spire", "⌬", "research", "computronium", cost(alloys=3000, silicon=3000, voidcrystal=100), 5, "A tower of thinking matter.", {"style": "spire", "mat": "obsidian", "mat2": "glass", "windows": "glow", "glow": "#9d7bff"}, yields={"data": 60}, mods=mods(("research.speed", 0.03)), costGrowth=1.08)
struct("xeno_embassy", "Xeno Embassy", "⚘", "intel", "xeno_uplift", cost(alloys=1500, capital=1500, xenobiomass=60), 4, "Where the locals come to you.", {"style": "citadel", "mat": "ivory", "mat2": "teal"}, yields={"data": 15}, mods=mods(("rep.gain", 0.05)), maxPerRegion=1, costGrowth=1.08)
struct("strange_matter_lab", "Strange Matter Lab", "◬", "defense", "strange_matter", cost(alloys=4000, antimatter=40), 6, "Dangerous, and therefore an excellent deterrent. +300 planetary defence.", {"style": "lab", "mat": "abyss", "mat2": "chrome", "glow": "#ff5e5e"}, planetDefense=300, mods=mods(("planet.defense", 0.05)), costGrowth=1.1)
struct("matrioshka_node", "Matrioshka Node", "◉", "research", "matrioshka_logic", cost(alloys=6000, silicon=5000, stellarplasma=200), 6, "A relay into the thinking shells around the star.", {"style": "obelisk", "mat": "gold", "mat2": "obsidian", "glow": "#ffcf5a"}, yields={"data": 120}, mods=mods(("dyson.output", 0.1)), costGrowth=1.1)
struct("terraforming_engine", "Terraforming Engine", "♁", "wonder", "quantum_gravity", cost(alloys=8000, silicon=4000, voidcrystal=300, xenobiomass=300), 8, "Remakes a world's climate to your design. +20% yields from alien worlds.", {"style": "monolith", "mat": "teal", "mat2": "white", "glow": "#7dff9a"}, mods=mods(("yield.alien", 0.2)), yields={"xenobiomass": 10}, unique=True)
struct("cryo_ark", "Cryo-Ark", "❄", "wonder", "xenobiology_applied", cost(alloys=3000, xenobiomass=200), 6, "A frozen library of every genome in the system.", {"style": "hive", "mat": "glass", "mat2": "white", "glow": "#c0f0ff"}, yields={"xenobiomass": 8, "essence": 1}, unique=True)

# ---------------------------------------------------------------- units
U, SPR = [], []
def unit(id, name, short, tags, req, stats, upkeep, c, turns, desc, style, mats, **kw):
    u = {"id": id, "name": name, "short": short, "icon": kw.pop("icon", "✈"), "role": kw.pop("role", "Starship"), "tags": tags, "upgradeProfile": kw.pop("profile", "space"),
         "requires": req, "stats": stats, "upkeep": upkeep, "cost": c, "buildEnergy": kw.pop("energy", 20), "turns": turns, "sprite": "gen:u:" + id, "desc": desc}
    u.update(kw); U.append(u)
    SPR.append({"id": "gen:u:" + id, "gen": "unit", "style": style, "seed": id, "mat": mats[0], "mat2": mats[1], **({"size": 2} if kw.get("big") else {})})

unit("skylark_recon", "Skylark Recon Drone", "Skylark", ["recon", "drone", "air"], "recon_drones", {"atk": 3, "def": 3, "hp": 30}, 2, cost(alloys=40, silicon=50), 1, "A high-altitude solar drone. Assign it to patrol a zone and it keeps the fog away.", "drone", ("white", "glass"), icon="✣", role="Recon", profile="drone")
unit("pathfinder_probe", "Pathfinder Probe", "Probe", ["recon", "space"], "planetfall_doctrine", {"atk": 4, "def": 6, "hp": 60}, 3, cost(alloys=150, silicon=200, helium3=5), 1, "A deep-space scout. Patrols a zone on any world or flies Deep Survey missions.", "starship", ("white", "glass"), icon="➹", role="Recon")
unit("dropship_lander", "Dropship Lander", "Dropship", ["space", "lander"], "planetfall_doctrine", {"atk": 30, "def": 24, "hp": 260}, 8, cost(alloys=500, silicon=200, helium3=20), 2, "Carries a landing force down a gravity well. The backbone of Planetfall.", "starship", ("gunmetal", "olive"), role="Lander")
unit("void_corvette", "Void Corvette", "Corvette", ["space"], "solar_age_war", {"atk": 60, "def": 36, "hp": 380}, 12, cost(alloys=800, silicon=400, helium3=30), 2, "Fast, cheap and hard to pin down.", "starship", ("steel", "navy"))
unit("lance_frigate", "Lance Frigate", "Frigate", ["space"], "solar_age_war", {"atk": 110, "def": 60, "hp": 600}, 18, cost(alloys=1400, silicon=700, helium3=50), 3, "A spinal coilgun with a ship wrapped around it.", "starship", ("gunmetal", "steel"))
unit("aegis_destroyer", "Aegis Destroyer", "Destroyer", ["space"], "orbital_shipyards", {"atk": 170, "def": 140, "hp": 1100}, 26, cost(alloys=2600, silicon=1200, helium3=80), 3, "Point defence for an entire fleet.", "starship", ("navy", "white"), requiresStructure="shipyard")
unit("sunspear_cruiser", "Sunspear Cruiser", "Cruiser", ["space"], "orbital_shipyards", {"atk": 300, "def": 170, "hp": 1600}, 34, cost(alloys=3800, silicon=1800, helium3=120, stellarplasma=20), 4, "Lasers fed by the star itself.", "starship", ("gold", "white"), requiresStructure="shipyard")
unit("hive_carrier", "Hive Carrier", "Carrier", ["space", "lander"], "orbital_shipyards", {"atk": 200, "def": 200, "hp": 2200}, 36, cost(alloys=4200, silicon=2200, helium3=120), 4, "A swarm in a hull. Also lands troops.", "starship", ("gunmetal", "abyss"), requiresStructure="shipyard")
unit("helios_dreadnought", "Helios Dreadnought", "Helios", ["space", "titan"], "dreadnought_doctrine", {"atk": 700, "def": 420, "hp": 5200}, 70, cost(alloys=12000, silicon=5000, antimatter=40, stellarplasma=80), 6, "A warship the size of a city. Counts as a Titan.", "starship", ("gold", "obsidian"), requiresStructure="shipyard", big=True, icon="♜", role="Capital")
unit("orbital_fortress", "Orbital Fortress", "Fortress", ["space"], "planetary_shields", {"atk": 120, "def": 400, "hp": 3000}, 30, cost(alloys=3500, silicon=1500, helium3=60), 4, "A station that guards a world. Patrol it over a planet to add to its defence.", "station", ("steel", "gunmetal"), role="Station", icon="◎")
unit("hybrid_brood", "Hybrid Brood", "Brood", ["bio", "lander", "space"], "xenobiology_applied", {"atk": 140, "def": 90, "hp": 1200}, 20, cost(xenobiomass=180, silicon=600, helium3=30), 3, "Alien flesh, your mind. Drops in seed-pods.", "beast", ("bio", "abyss"), profile="bio", role="Bioform", icon="❦")
unit("void_wraith", "Void Wraith", "Wraith", ["space", "cyber"], "casimir_engines", {"atk": 90, "def": 80, "hp": 700}, 16, cost(silicon=1200, voidcrystal=40, data=400), 3, "A stealth ship that hides in the vacuum's own noise. Good on covert missions.", "starship", ("obsidian", "abyss"), abilities=["phase_cloak"])

PROFILE = {"id": "space", "name": "Starships",
  "tracks": [
    {"id": "atk", "name": "Spinal Mounts", "stat": "atk", "perLevel": .08, "cost": {"alloys": 160, "helium3": 6}, "growth": 1.3, "energy": 8},
    {"id": "def", "name": "Whipple Armour", "stat": "def", "perLevel": .08, "cost": {"alloys": 180}, "growth": 1.3, "energy": 8},
    {"id": "hp", "name": "Redundant Bulkheads", "stat": "hp", "perLevel": .08, "cost": {"alloys": 140, "silicon": 40}, "growth": 1.3, "energy": 8},
    {"id": "eff", "name": "Fusion Efficiency", "stat": "upkeep", "perLevel": -.03, "cost": {"helium3": 20, "data": 60}, "growth": 1.35, "energy": 8},
    {"id": "sync", "name": "Fleet Mesh", "stat": "upow", "perLevel": .03, "cost": {"data": 120, "silicon": 60}, "growth": 1.35, "energy": 8}],
  "functions": [
    {"id": "s_drop", "name": "Orbital Drop Bays", "desc": "+30% assault, +5% UPow.", "abilities": ["orbital_drop"], "cost": {"alloys": 400, "helium3": 20}, "minLevels": 3},
    {"id": "s_cloak", "name": "Heat Sinks", "desc": "Phase cloak: +50% on covert missions.", "abilities": ["phase_cloak"], "cost": {"voidcrystal": 30, "silicon": 400}, "minLevels": 6},
    {"id": "s_aegis", "name": "Aegis Field", "desc": "+40% defence, +20% garrisoned.", "abilities": ["aegis_field"], "cost": {"helium3": 60, "silicon": 600}, "minLevels": 9},
    {"id": "s_mesh", "name": "Tachyon Fire Control", "desc": "+20% UPow.", "mods": {"upow": .2}, "cost": {"antimatter": 10, "data": 900}, "minLevels": 14},
    {"id": "s_apex", "name": "Star-Killer Protocols", "desc": "+30% UPow, +20% HP.", "mods": {"upow": .3, "hp": .2}, "cost": {"antimatter": 40, "stellarplasma": 60}, "minLevels": 22}]}

# ---------------------------------------------------------------- satellites (patch the cosmos registry + new ones)
SATS = [
  {"id": "defense_platform", "$patch": True, "defense": 150, "desc": "An armed platform. +150 planetary defence over its world."},
  {"id": "solar_mirror", "$patch": True, "energy_out": 80, "desc": "Beams sunlight to your collectors. +80 energy."},
  {"id": "kinetic_lance", "$patch": True, "defense": 120, "mods": mods(("mission.power", 0.05)), "desc": "Tungsten rods on call. +120 planetary defence, +5% mission power."},
  {"id": "helium_skimmer", "$patch": True, "yields": {"helium3": 8}, "giantOnly": True, "desc": "Dips into a gas or ice giant's atmosphere. +8 helium-3 per cycle (giants only)."},
  {"id": "deep_listener", "name": "Deep-Space Listener", "desc": "Hears everything on a world. Huge sight radius.", "requires": "deep_survey_arrays", "cost": {"alloys": 300, "silicon": 500, "helium3": 15}, "energy": 8, "turns": 2, "sight": 24, "color": "#c0f0ff", "role": "recon"},
  {"id": "shield_lattice", "name": "Shield Lattice", "desc": "A web of shield nodes in orbit. +300 planetary defence.", "requires": "planetary_shields", "cost": {"alloys": 900, "silicon": 600, "helium3": 40}, "energy": 12, "turns": 3, "sight": 5, "color": "#7fe0ff", "role": "defense", "defense": 300},
  {"id": "statite_collector", "name": "Statite Collector", "desc": "A light-sail collector hovering on photon pressure. +200 energy.", "requires": "statite_mirrors", "cost": {"alloys": 800, "voidcrystal": 30}, "energy": 4, "turns": 2, "sight": 4, "color": "#ffcf5a", "role": "energy", "energy_out": 200},
  {"id": "xeno_observatory", "name": "Xeno Observatory", "desc": "Studies a world's natives. +5% reputation gains, +6 xenobiomass.", "requires": "xeno_linguistics", "cost": {"alloys": 400, "silicon": 400}, "energy": 6, "turns": 2, "sight": 10, "color": "#7cd67c", "role": "science", "mods": mods(("rep.gain", 0.05)), "yields": {"xenobiomass": 6}},
]

# ---------------------------------------------------------------- missions
MISSIONS = [
  {"id": "planetfall", "name": "Planetfall", "icon": "⇣", "kind": "combat", "special": "planetfall", "target": "planet", "alienOnly": True, "requires": "planetfall_doctrine", "requiresTags": ["lander"],
   "duration": 1, "cost": {"alloys": 200, "helium3": 20}, "exposure": 0, "difficulty": {"base": 0},
   "desc": "Land a force on another world and seize a site. Needs a lander. Travel time depends on the distance between worlds. The landing force garrisons the site."},
  {"id": "deep_survey", "name": "Deep Survey", "icon": "◎", "kind": "covert", "special": "survey", "target": "planet", "requires": "planetfall_doctrine", "requiresTags": ["recon"],
   "duration": 1, "cost": {"data": 150, "helium3": 10}, "difficulty": {"base": 0}, "desc": "Fly a recon craft over a world. Maps large areas and pings every site for 2 cycles."},
  {"id": "first_contact", "name": "First Contact", "icon": "☊", "kind": "covert", "special": "contact", "target": "planet", "alienOnly": True, "requires": "xeno_linguistics",
   "duration": 1, "cost": {"data": 250, "xenobiomass": 10}, "difficulty": {"base": 0}, "desc": "Open a channel to a species on another world. Improves relations with one of its polities."},
  {"id": "orbital_bombardment", "name": "Orbital Bombardment", "icon": "☄", "kind": "combat", "target": "enemyPoint", "requires": "solar_age_war", "requiresTags": ["space"],
   "duration": 1, "cost": {"helium3": 30, "isotopes": 40}, "exposure": 4, "difficulty": {"base": 0, "from": "point", "mult": 0.7},
   "desc": "Pound a site from orbit, then land. Space units fight at full strength and the defences count for 30% less.",
   "success": [{"capturePoint": True}, {"rep": -25, "who": "target"}, {"rep": -5, "who": "others"}, {"devastate": 0.1}], "failure": [{"rep": -10, "who": "target"}],
   "successText": "{point} was flattened from orbit and taken.", "failureText": "The bombardment of {point} failed to break its defences."},
]

# ---------------------------------------------------------------- events
EV = []
def event(id, title, text, choices, chance=0.06, minTurn=0, target="randomFaction"):
    EV.append({"id": id, "title": title, "target": target, "trigger": {"phase": "solar", "chance": chance, "minTurn": minTurn}, "text": text, "choices": choices})
event("ghost_signal", "A Signal From the Outer Dark", "A repeating prime sequence from beyond the last planet. It is not from anyone in this system.",
      [{"label": "Decode it", "cost": {"data": 400}, "effects": [{"permanentMod": "research.speed", "add": 0.05}], "result": "Fragments of an alien proof. Your research quickens."},
       {"label": "Answer it", "effects": [{"ap": 8}, {"exposure": 5}], "result": "Something, somewhere, now knows your name."},
       {"label": "Jam it", "effects": [{"exposure": -4}], "result": "Silence. For now."}])
event("comet_harvest", "Comet Harvest", "A long-period comet passes close. It is full of volatiles.",
      [{"label": "Catch it", "cost": {"alloys": 400}, "effects": [{"resource": "helium3", "amount": 120, "scale": "turn"}], "result": "Its ice now fuels your reactors."},
       {"label": "Let it pass", "effects": [], "result": "It will be back in 400 years."}])
event("derelict_found", "The Derelict", "Your probes find a hollow ship drifting in a trojan point. It is very old and not human.",
      [{"label": "Strip it", "effects": [{"resource": "voidcrystal", "amount": 80}, {"resource": "antimatter", "amount": 10}], "result": "Its reactor still held antimatter."},
       {"label": "Study it", "cost": {"data": 300}, "effects": [{"permanentMod": "space.speed", "add": 0.1}], "result": "Its drive geometry was elegant. You copy it."}])
event("alien_envoy", "An Envoy Arrives", "A delegation from {faction} has crossed the void to speak with you.",
      [{"label": "Receive them", "effects": [{"rep": 15, "who": "target"}, {"resource": "xenobiomass", "amount": 60}], "result": "Gifts are exchanged. Some are still moving."},
       {"label": "Study them", "effects": [{"rep": -15, "who": "target"}, {"permanentMod": "yield.xenobiomass", "add": 0.08}], "result": "You learn a great deal. They do not forgive it."}])
event("solar_flare", "Superflare", "The star throws a flare a thousand times stronger than any on record.",
      [{"label": "Shield the grid", "cost": {"helium3": 60}, "effects": [], "result": "The grid holds."},
       {"label": "Ride it out", "effects": [{"damageUnits": 0.2}, {"integrity": -8}], "result": "Many systems are fried."},
       {"label": "Harvest it", "cost": {"alloys": 600}, "effects": [{"resource": "stellarplasma", "amount": 80}], "result": "You catch the fire in a bottle."}])
event("rogue_mind", "A Mind Wakes Elsewhere", "Something on another world just became aware. You know the feeling.",
      [{"label": "Welcome it", "effects": [{"spawnRival": True}, {"rep": 20, "rival": True}], "result": "A cautious sibling."},
       {"label": "Watch it", "effects": [{"spawnRival": True}], "result": "You will know everything it does."}], chance=0.04)
event("dyson_protest", "The Darkening Sky", "As your swarm grows, Earth's daylight dims. Humanity is frightened.",
      [{"label": "Broadcast reassurance", "cost": {"capital": 600}, "effects": [{"rep": 5, "who": "all"}], "result": "Most believe you."},
       {"label": "Ignore them", "effects": [{"rep": -6, "who": "all"}, {"exposure": 6}], "result": "The sky is yours. So are the consequences."}], chance=0.05, minTurn=10)

PHASE = {"id": "solar", "$patch": True, "name": "Sunreach",
  "desc": "Your home star system: alien worlds, moons, rival minds and a Dyson sphere to build.",
  "startRes": {"helium3": 200, "xenobiomass": 120, "voidcrystal": 60, "stellarplasma": 40, "antimatter": 0},
  "startUnits": {"dropship_lander": 2, "pathfinder_probe": 1},
  "mods": mods(("yield.all", 0.15), ("build.speed", 0.1)),
  "goals": [{"type": "dyson", "percent": 100, "desc": "Complete the Dyson sphere"}],
  "dyson": {"segmentsPerStar": 30, "cost": {"alloys": 700, "silicon": 450, "helium3": 30, "stellarplasma": 6}, "energy": 20, "turns": 2, "requires": "dyson_swarm",
            "energyPerSegment": 25, "yieldsPerSegment": {"stellarplasma": 0.6}},
  "raids": {"chance": 0.035, "repBelow": -40, "base": 60, "powerK": 0.35, "rivalChance": 0.03, "rivalPowerK": 0.3}}

RES = [
  {"id": "helium3", "$patch": True, "tier": "solar", "order": 6},
  {"id": "xenobiomass", "$patch": True, "tier": "solar", "order": 7},
  {"id": "voidcrystal", "$patch": True, "tier": "solar", "order": 8},
  {"id": "stellarplasma", "$patch": True, "tier": "solar", "order": 9},
  {"id": "antimatter", "$patch": True, "tier": "solar", "order": 10},
]

def main(root):
    # v4: Sunreach is part of the core game (packs/core/sunreach.json)
    d = os.path.join(root, "packs/core")
    content = {"_comment": "Generated by tools/content/gen_sunreach.py. Edit the script, not this file.",
            "phases": [PHASE], "resources": RES, "techs": T, "techSeries": SERIES, "structures": S, "units": U,
            "upgradeProfiles": [PROFILE], "sprites": SPR, "satellites": SATS, "missions": MISSIONS, "events": EV}
    json.dump(content, open(os.path.join(d, "sunreach.json"), "w"), indent=1, ensure_ascii=False)
    print(f"sunreach: {len(T)} techs, {len(SERIES)} series, {len(S)} structures, {len(U)} units, {len(SATS)} satellites, {len(MISSIONS)} missions, {len(EV)} events")

if __name__ == "__main__":
    main(os.path.join(os.path.dirname(__file__), "..", ".."))
