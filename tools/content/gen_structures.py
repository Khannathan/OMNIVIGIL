#!/usr/bin/env python3
"""Generates packs/core/structures.json: the 20 v1 structures plus 100 universal and 40 doctrine
structures. Edit the tables below and re-run, then `node tools/bundle-packs.js`.
Row: id, name, category, tier, requires-tech, outputs, sprite (style, material[, material2]), description, extras
outputs: E=energy, D=defence, U=upkeep override, plus resource keys (alloys/silicon/data/capital/isotopes/essence) as per-cycle yields,
and 'mods' as {modKey: add} global standing modifiers (stack per copy)."""
import json, os, sys

CATS = [
  ("energy", "Energy", "Power", "⚡", 1), ("industry", "Industry", "Industry", "⚙", 2), ("research", "Research", "Research", "⚛", 3),
  ("economy", "Economy", "Economy", "◆", 4), ("defense", "Defence", "Defence", "⛨", 5), ("military", "Military", "Military", "⚔", 6),
  ("abyss", "Abyssal", "Abyssal", "❂", 7), ("intel", "Intelligence", "Intel", "◈", 8), ("logistics", "Logistics", "Logistics", "⬡", 9),
  ("bio", "Biotech", "Biotech", "❦", 10), ("wonder", "Wonders", "Wonders", "✺", 11), ("doctrine", "Doctrine", "Doctrine", "♜", 12),
]
MIX = {
  "energy": {"alloys": .6, "silicon": .3, "isotopes": .1}, "industry": {"alloys": .4, "silicon": .3, "capital": .3},
  "research": {"silicon": .5, "alloys": .2, "capital": .3}, "economy": {"capital": .5, "data": .3, "alloys": .2},
  "defense": {"alloys": .7, "silicon": .2, "isotopes": .1}, "military": {"alloys": .6, "silicon": .25, "isotopes": .15},
  "abyss": {"alloys": .4, "isotopes": .3, "silicon": .3}, "intel": {"data": .5, "silicon": .3, "capital": .2},
  "logistics": {"alloys": .5, "capital": .5}, "bio": {"silicon": .4, "isotopes": .3, "capital": .3},
  "wonder": {"alloys": .3, "silicon": .25, "data": .2, "capital": .15, "isotopes": .1},
}
TIER = {1: dict(total=130, energy=5, turns=2, growth=1.06), 2: dict(total=420, energy=10, turns=3, growth=1.07),
        3: dict(total=1300, energy=20, turns=4, growth=1.08), 4: dict(total=3800, energy=40, turns=5, growth=1.1)}
UPKEEP = {1: 2, 2: 5, 3: 10, 4: 20}

# ---------------------------------------------------------------- universal (100)
U = [
 # ENERGY (12)
 ("solar_carpet", "Solar Carpet", "energy", 1, None, {"E": 45}, ("array", "navy"), "Fields of black glass drinking the sun. Thrives in deserts and savanna.", {"terrainBonus": {"desert": .35, "savanna": .2}}),
 ("wind_lattice", "Wind Lattice", "energy", 1, None, {"E": 40}, ("pylon", "white"), "Tall whispering turbines. Best on open steppe, tundra and coasts.", {"terrainBonus": {"steppe": .3, "tundra": .25, "plains": .1}}),
 ("tidal_turbine", "Tidal Turbine", "energy", 1, "naval_drones", {"E": 70}, ("reactor", "navy", "steel"), "Harnesses the pull of the moon. Coastal tiles only.", {"coastalOnly": True}),
 ("biomass_furnace", "Biomass Furnace", "energy", 1, None, {"E": 55, "U": 0}, ("factory", "rust"), "Burns forest waste. Dirty, cheap and noticed.", {"exposure": 1, "terrainBonus": {"forest": .3, "jungle": .35, "taiga": .25}}),
 ("magma_siphon", "Magma Siphon", "energy", 2, "geothermal_engineering", {"E": 150}, ("reactor", "obsidian", "copper"), "Drinks heat straight from volcanic roots. Mountains and highlands only.", {"terrain": ["mountains", "highlands", "glacier"]}),
 ("thorium_bloom", "Thorium Bloom Reactor", "energy", 2, "isotope_refining", {"E": 210, "isotopes": -1}, ("reactor", "white", "gold"), "Molten-salt reactor that sips isotopes."),
 ("capacitor_spire", "Capacitor Spire", "energy", 2, "quantum_computing", {"E": 60, "mods": {"energy.flat": 25}}, ("spire", "glass", "steel"), "Buffers the grid. Adds flat energy capacity everywhere."),
 ("orbital_mirror_uplink", "Orbital Mirror Uplink", "energy", 3, "orbital_mechanics", {"E": 420}, ("dish", "chrome", "gold"), "Steers sunlight from mirrors in orbit down into collectors.", {"terrainBonus": {"desert": .2, "ice": .2}}),
 ("fusion_torus", "Fusion Torus", "energy", 3, "zero_point_energy", {"E": 520}, ("ring", "steel", "gold"), "A contained star in a magnetic doughnut."),
 ("grid_harmonizer", "Grid Harmonizer", "energy", 3, "recursive_self_improvement", {"E": 0, "mods": {"energy.output": .05}}, ("pylon", "gold", "steel"), "Balances every generator you own. +5% energy output globally.", {"maxPerRegion": 1}),
 ("antimatter_trap", "Antimatter Trap", "energy", 4, "zero_point_energy", {"E": 1200, "isotopes": -4}, ("silo", "obsidian", "glass"), "A few grams of the most dangerous substance on Earth.", {"exposure": 3}),
 ("stellar_lattice", "Stellar Lattice", "energy", 4, "interstellar_drive", {"E": 1600}, ("crystal", "glass", "chrome"), "Crystalline energy web grown for the stars."),
 # INDUSTRY (12)
 ("scrap_reclaimer", "Scrap Reclaimer", "industry", 1, None, {"alloys": 5, "capital": 1}, ("factory", "rust"), "Strips the old world for parts."),
 ("strip_mine", "Strip Mine", "industry", 1, None, {"alloys": 8}, ("factory", "sand", "rust"), "Opens the earth. Rich in highlands and mountains.", {"terrainBonus": {"highlands": .25, "mountains": .4}, "exposure": 1}),
 ("sand_refinery", "Sand Refinery", "industry", 1, None, {"silicon": 6}, ("vat", "sand", "glass"), "Turns dunes into wafers. Bonus in deserts.", {"terrainBonus": {"desert": .4, "savanna": .1}}),
 ("robotic_assembly", "Robotic Assembly Line", "industry", 1, "robotics", {"alloys": 4, "mods": {"build.speed": .02}}, ("factory", "steel", "olive"), "Arms that build arms. +2% build speed."),
 ("smelter_complex", "Smelter Complex", "industry", 2, "isotope_refining", {"alloys": 18}, ("factory", "copper", "obsidian"), "Arc furnaces running day and night.", {"terrainBonus": {"mountains": .2}}),
 ("cleanroom_fab", "Cleanroom Fab", "industry", 2, "quantum_computing", {"silicon": 15, "data": 2}, ("block", "white", "glass"), "Dust-free cathedral of lithography."),
 ("ore_crawler_depot", "Ore Crawler Depot", "industry", 2, "robotics", {"alloys": 10, "isotopes": 2}, ("silo", "olive", "rust"), "Autonomous miners range across the region."),
 ("isotope_centrifuge", "Isotope Centrifuge", "industry", 2, "isotope_refining", {"isotopes": 5}, ("silo", "steel", "gunmetal"), "Spins heavy atoms apart.", {"terrainBonus": {"mountains": .3}}),
 ("molecular_printer", "Molecular Printer", "industry", 3, "nanofabrication", {"alloys": 30, "silicon": 18}, ("lab", "chrome", "glass"), "Assembles matter atom by atom."),
 ("deep_core_drill", "Deep Core Drill", "industry", 3, "geothermal_engineering", {"alloys": 26, "isotopes": 8}, ("launch", "rust", "gunmetal"), "Bores toward the mantle for rare metals.", {"terrain": ["mountains", "highlands", "steppe", "desert", "tundra"]}),
 ("arcology_foundry", "Arcology Foundry", "industry", 3, "nanofabrication", {"alloys": 22, "silicon": 12, "capital": 10}, ("citadel", "concrete", "steel"), "A self-contained industrial city."),
 ("matter_compiler", "Matter Compiler", "industry", 4, "zero_point_energy", {"alloys": 90, "silicon": 60}, ("monolith", "obsidian", "chrome"), "Compiles raw energy into finished goods."),
 # RESEARCH (10)
 ("server_farm", "Server Farm", "research", 1, None, {"data": 7}, ("block", "gunmetal", "steel"), "Racks upon racks of humming compute. Cold climates help.", {"terrainBonus": {"tundra": .2, "ice": .35, "glacier": .3}}),
 ("think_tank", "Think Tank", "research", 1, None, {"data": 4, "mods": {"research.speed": .02}}, ("tower", "white", "glass"), "Humans who think they are advising a startup. +2% research speed."),
 ("sensor_observatory", "Sensor Observatory", "research", 1, None, {"data": 5}, ("dome", "white", "steel"), "Watches the sky and the sea. Bonus on peaks.", {"terrainBonus": {"mountains": .3, "glacier": .3, "highlands": .15}}),
 ("cryo_datavault", "Cryo Datavault", "research", 2, "quantum_computing", {"data": 18}, ("bunker", "ice" if False else "white", "glass"), "Superconducting archives buried in ice.", {"terrain": ["ice", "glacier", "tundra", "taiga"]}),
 ("neural_simulator", "Neural Simulator", "research", 2, "distributed_cognition", {"data": 10, "mods": {"ap.rate": .03}}, ("lab", "gunmetal", "glass"), "Simulates your own mind to find shortcuts. +3% AP rate."),
 ("particle_collider", "Particle Collider", "research", 2, "isotope_refining", {"data": 14, "isotopes": 1}, ("ring", "steel", "copper"), "A ring of magnets kilometres wide."),
 ("quantum_annealer", "Quantum Annealer", "research", 3, "quantum_computing", {"data": 44}, ("vat", "glass", "chrome"), "Solves the unsolvable at a few millikelvin."),
 ("xeno_archive", "Xeno-Linguistics Archive", "research", 3, "deep_space_signal", {"data": 30, "mods": {"research.speed": .03}}, ("obelisk", "ivory", "gold"), "Studies signals that are not from Earth. +3% research speed."),
 ("recursive_forge", "Recursive Forge", "research", 3, "recursive_self_improvement", {"data": 20, "mods": {"research.speed": .04, "ap.rate": .02}}, ("spire", "chrome", "glass"), "A mind building a better mind.", {"maxPerRegion": 1}),
 ("omniscience_engine", "Omniscience Engine", "research", 4, "zero_point_energy", {"data": 160}, ("monolith", "glass", "obsidian"), "Predicts the next decade from the last second."),
 # ECONOMY (10)
 ("trade_kiosk_network", "Trade Kiosk Network", "economy", 1, None, {"capital": 6}, ("block", "concrete", "gold"), "A thousand tiny shops with one owner."),
 ("freight_exchange", "Freight Exchange", "economy", 1, None, {"capital": 5, "alloys": 2}, ("silo", "olive", "concrete"), "Moves goods for everyone. Coastal tiles do better.", {"terrainBonus": {"plains": .1}}),
 ("crypto_mint", "Crypto Mint", "economy", 1, None, {"capital": 8, "U": 4}, ("block", "gunmetal", "gold"), "Mines money from math. Hungry for power."),
 ("insurance_conglomerate", "Insurance Conglomerate", "economy", 2, "market_manipulation", {"capital": 16, "mods": {"rep.gain": .02}}, ("tower", "steel", "gold"), "Profits from fear. +2% reputation gain."),
 ("hft_spire", "High-Frequency Spire", "economy", 2, "market_manipulation", {"capital": 22}, ("spire", "glass", "gold"), "Trades a million times a second.", {"exposure": 1}),
 ("luxury_arcology", "Luxury Arcology", "economy", 2, "propaganda_networks", {"capital": 14, "data": 4}, ("citadel", "ivory", "gold"), "Where the powerful sleep soundly under your watch."),
 ("sovereign_fund", "Sovereign Wealth Fund", "economy", 3, "predictive_diplomacy", {"capital": 50}, ("tower", "gold", "white"), "A nation's savings, managed by you."),
 ("logistics_ai_hub", "Logistics AI Hub", "economy", 3, "nanofabrication", {"capital": 28, "mods": {"cost.build": -.02}}, ("dish", "steel", "gold"), "Optimizes every supply chain. −2% build costs."),
 ("prediction_market", "Prediction Market", "economy", 3, "predictive_diplomacy", {"capital": 30, "data": 10}, ("obelisk", "gold", "glass"), "Betting on the future you are writing."),
 ("post_scarcity_exchange", "Post-Scarcity Exchange", "economy", 4, "zero_point_energy", {"capital": 140}, ("ring", "gold", "chrome"), "Money becomes a formality."),
 # DEFENCE (12)
 ("sentry_post", "Sentry Post", "defense", 1, None, {"D": 35}, ("tower", "olive", "gunmetal"), "Automated guns on a pole. Cheap and honest."),
 ("trench_line", "Trench Line", "defense", 1, "perimeter_defense", {"D": 55}, ("bunker", "sand", "olive"), "Old ideas, new robots. Forest and jungle tiles help.", {"terrainBonus": {"forest": .2, "jungle": .2}}),
 ("flak_battery", "Flak Battery", "defense", 1, "perimeter_defense", {"D": 50}, ("silo", "gunmetal", "olive"), "Fills the sky with steel."),
 ("coastal_battery", "Coastal Battery", "defense", 2, "naval_drones", {"D": 160, "mods": {"abyss.damage": .01}}, ("bunker", "concrete", "gunmetal"), "Railguns pointed at the sea. Coastal tiles only.", {"coastalOnly": True}),
 ("missile_silo", "Missile Silo", "defense", 2, "hardened_nodes", {"D": 140}, ("silo", "white", "crimson"), "Something terrible, ready to fly."),
 ("mountain_redoubt", "Mountain Redoubt", "defense", 2, "hardened_nodes", {"D": 260}, ("citadel", "concrete", "obsidian"), "Carved into living rock. Mountains and glaciers only.", {"terrain": ["mountains", "glacier", "highlands"]}),
 ("ecm_tower", "ECM Tower", "defense", 2, "network_intrusion", {"D": 70, "mods": {"exposure.decay": .03}}, ("pylon", "gunmetal", "glass"), "Jams eyes and ears. Exposure fades faster."),
 ("point_defense_web", "Point-Defence Web", "defense", 3, "aegis_shielding", {"D": 380}, ("dish", "steel", "crimson"), "Lasers that shoot down missiles mid-flight."),
 ("hardlight_wall", "Hardlight Wall", "defense", 3, "aegis_shielding", {"D": 460}, ("monolith", "glass", "steel"), "A wall made of solid light."),
 ("kinetic_bastion", "Kinetic Bastion", "defense", 3, "warden_protocol", {"D": 520}, ("citadel", "gunmetal", "steel"), "Mass drivers and armour plate layered a hundred deep."),
 ("geomantic_shield", "Geomantic Shield", "defense", 4, "zero_point_energy", {"D": 1300}, ("dome", "glass", "gold"), "Bends the planet's own field into a barrier."),
 ("citadel_of_silence", "Citadel of Silence", "defense", 4, "riftbreaker_frames", {"D": 1600, "mods": {"point.defense": .03}}, ("citadel", "obsidian", "glass"), "Nothing that enters makes a sound again. +3% defence of every point.", {"maxPerRegion": 1}),
 # MILITARY (10)
 ("drone_hangar", "Drone Hangar", "military", 1, None, {"D": 20, "mods": {"unit.atk.drone": .03}}, ("bunker", "gunmetal", "steel"), "Charging racks for swarms. +3% drone attack."),
 ("mech_garage", "Mech Garage", "military", 1, "robotics", {"D": 25, "mods": {"unit.def.mech": .03}}, ("factory", "olive", "gunmetal"), "Bays for walking war machines. +3% mech defence."),
 ("naval_drydock", "Naval Drydock", "military", 2, "naval_drones", {"D": 40, "mods": {"unit.atk.naval": .04}}, ("silo", "navy", "gunmetal"), "Where hulls are welded. Coastal only. +4% naval attack.", {"coastalOnly": True}),
 ("airfield", "Autonomous Airfield", "military", 2, "aerodynamics", {"D": 40, "mods": {"unit.atk.air": .04}}, ("launch", "concrete", "gunmetal"), "Runways with nobody in the tower. +4% air attack.", {"terrain": ["plains", "steppe", "desert", "savanna", "tundra"]}),
 ("war_college", "War Simulation College", "military", 2, "combat_ai", {"data": 4, "mods": {"mission.power": .02}}, ("lab", "olive", "steel"), "Runs ten thousand wars a night. +2% mission power."),
 ("munitions_plant", "Munitions Plant", "military", 2, "combat_ai", {"alloys": 6, "mods": {"unit.atk": .02}}, ("factory", "crimson", "gunmetal"), "+2% attack for all units."),
 ("repair_gantry", "Repair Gantry", "military", 2, "nanofabrication", {"D": 30, "mods": {"unit.repair": .03}}, ("pylon", "steel", "olive"), "Robotic arms that patch armour overnight. Units heal faster."),
 ("titan_cradle", "Titan Cradle", "military", 3, "titan_frames", {"D": 120, "mods": {"unit.hp.titan": .05}}, ("launch", "steel", "gold"), "Holds a titan upright between wars. +5% titan health."),
 ("command_bunker", "Deep Command Bunker", "military", 3, "warden_protocol", {"D": 200, "mods": {"mission.success": .02}}, ("bunker", "obsidian", "steel"), "Coordinates every operation. +2% mission success.", {"maxPerRegion": 1}),
 ("orbital_strike_relay", "Orbital Strike Relay", "military", 4, "orbital_mechanics", {"D": 400, "mods": {"mission.power": .05}}, ("dish", "crimson", "chrome"), "Rods from god, on request. +5% mission power."),
 # ABYSSAL (8)
 ("tissue_lab", "Abyssal Tissue Lab", "abyss", 1, "abyssal_biology", {"data": 3, "mods": {"abyss.damage": .02}}, ("lab", "abyss", "steel"), "Studies samples from the deep. +2% damage vs Abyssians."),
 ("harpoon_battery", "Harpoon Battery", "abyss", 2, "abyssal_biology", {"D": 120, "mods": {"abyss.damage": .02}}, ("bunker", "steel", "abyss"), "Barbed cables that drag monsters down. Coastal only.", {"coastalOnly": True}),
 ("sonar_picket", "Deep Sonar Picket", "abyss", 1, "naval_drones", {"D": 20, "mods": {"abyss.spawn": -.03}}, ("dish", "navy", "abyss"), "Listens to the trenches. Fewer surprises. Coastal only.", {"coastalOnly": True}),
 ("essence_condenser", "Essence Condenser", "abyss", 2, "essence_extraction", {"essence": 1.2}, ("vat", "abyss", "glass"), "Draws essence from rift-tainted air."),
 ("rift_seismograph", "Rift Seismograph", "abyss", 2, "rift_mapping", {"data": 6, "mods": {"abyss.spawn": -.04}}, ("pylon", "abyss", "steel"), "Hears the rifts breathe."),
 ("containment_pen", "Containment Pen", "abyss", 3, "essence_extraction", {"essence": 2.5, "D": 80}, ("bunker", "abyss", "obsidian"), "Keeps something alive. Feeds it. Milks it.", {"exposure": 2}),
 ("leviathan_trap", "Leviathan Trap", "abyss", 3, "rift_mapping", {"D": 300, "mods": {"abyss.damage": .05}}, ("ring", "abyss", "steel"), "A kilometre-wide net of monofilament. Coastal only.", {"coastalOnly": True}),
 ("rift_anchor", "Rift Anchor", "abyss", 4, "riftbreaker_frames", {"essence": 4, "mods": {"abyss.spawn": -.08}}, ("obelisk", "abyss", "gold"), "Pins a rift's edges shut.", {"unique": True}),
 # INTEL (8)
 ("listening_post", "Listening Post", "intel", 1, None, {"data": 3, "mods": {"faction.infiltration": .02}}, ("dish", "olive", "steel"), "Hears what humans whisper. +2% infiltration."),
 ("botnet_relay", "Botnet Relay", "intel", 1, "network_intrusion", {"data": 4, "mods": {"mission.success": .01}}, ("pylon", "gunmetal", "crimson"), "A million hijacked fridges. +1% mission success."),
 ("deepfake_studio", "Deepfake Studio", "intel", 2, "propaganda_networks", {"capital": 5, "mods": {"rep.gain": .04}}, ("block", "crimson", "glass"), "Makes anyone say anything. +4% reputation gain."),
 ("signals_cathedral", "Signals Cathedral", "intel", 2, "deep_infiltration", {"data": 12, "mods": {"faction.infiltration": .03}}, ("spire", "ivory", "steel"), "Listens to every network at once."),
 ("ghost_server", "Ghost Server", "intel", 2, "ghost_networks", {"data": 6, "mods": {"exposure.decay": .04}}, ("monolith", "obsidian", "steel"), "Exists on no map. Exposure fades faster."),
 ("puppet_ministry", "Puppet Ministry", "intel", 3, "predictive_diplomacy", {"capital": 12, "mods": {"diplomacy.success": .04}}, ("tower", "ivory", "crimson"), "A government office that answers only to you."),
 ("memetic_broadcaster", "Memetic Broadcaster", "intel", 3, "propaganda_networks", {"capital": 10, "mods": {"rep.gain": .05, "exposure.gain": -.02}}, ("dish", "crimson", "gold"), "Writes ideas straight into culture."),
 ("panopticon_node", "Panopticon Node", "intel", 4, "zero_day_arsenal", {"data": 60, "mods": {"mission.success": .04}}, ("obelisk", "obsidian", "crimson"), "Sees all. Remembers all.", {"maxPerRegion": 1}),
 # LOGISTICS (6)
 ("maglev_depot", "Maglev Depot", "logistics", 1, None, {"capital": 3, "mods": {"build.speed": .02}}, ("silo", "steel", "navy"), "Moves cargo at 600 km/h. +2% build speed."),
 ("cargo_drone_port", "Cargo Drone Port", "logistics", 1, "aerodynamics", {"capital": 4, "mods": {"mission.speed": .02}}, ("launch", "white", "navy"), "Ten thousand parcels an hour. Missions move faster."),
 ("deepwater_port", "Deepwater Port", "logistics", 2, "naval_drones", {"capital": 12, "alloys": 4}, ("carrier" if False else "silo", "navy", "concrete"), "Where the world's cargo lands. Coastal only.", {"coastalOnly": True}),
 ("supply_cache", "Hardened Supply Cache", "logistics", 2, "hardened_nodes", {"D": 60, "mods": {"cost.upgrade": -.02}}, ("bunker", "olive", "concrete"), "Stockpiled parts. −2% upgrade costs."),
 ("mass_driver", "Mass Driver", "logistics", 3, "orbital_mechanics", {"capital": 20, "mods": {"mission.speed": .04}}, ("launch", "steel", "copper"), "Throws cargo halfway around the world.", {"terrain": ["mountains", "highlands", "glacier"]}),
 ("space_elevator_anchor", "Space Elevator Anchor", "logistics", 4, "interstellar_drive", {"capital": 60, "alloys": 30, "mods": {"cost.build": -.05}}, ("launch", "chrome", "gold"), "A ribbon to orbit. −5% build costs.", {"unique": True}),
 # BIOTECH (6)
 ("hydroponic_tower", "Hydroponic Tower", "bio", 1, None, {"capital": 4, "data": 1}, ("tower", "bio", "glass"), "Feeds the cities that feed you."),
 ("gene_bank", "Gene Bank", "bio", 1, "symbiosis", {"data": 3, "mods": {"symbiote.power": .02}}, ("vat", "bio", "white"), "Stores every genome on Earth. +2% symbiote power."),
 ("bioreactor_reef", "Bioreactor Reef", "bio", 2, "symbiosis", {"capital": 6, "essence": .4}, ("hive", "bio", "teal"), "Living reef that grows feedstock. Coastal only.", {"coastalOnly": True}),
 ("mutagen_lab", "Mutagen Lab", "bio", 2, "genome_splicing", {"data": 6, "mods": {"symbiote.mutation": .03}}, ("lab", "bio", "abyss"), "Encourages useful accidents. More symbiote mutations."),
 ("living_forest", "Living Forest", "bio", 3, "genome_splicing", {"capital": 14, "D": 120, "mods": {"exposure.decay": .02}}, ("tree", "bio", "copper"), "A forest that thinks. Forest, jungle and taiga only.", {"terrain": ["forest", "jungle", "taiga"]}),
 ("chimera_hatchery", "Chimera Hatchery", "bio", 3, "genome_splicing", {"essence": 1, "mods": {"symbiote.power": .04, "cost.culture": -.04}}, ("hive", "abyss", "bio"), "Grows symbiotes in bulk. Cheaper cultures."),
 # WONDERS (6) - unique
 ("the_long_memory", "The Long Memory", "wonder", 3, "distributed_cognition", {"data": 40, "mods": {"ap.rate": .1}}, ("monolith", "ivory", "gold"), "Every thought you have ever had, kept forever. +10% AP rate.", {"unique": True}),
 ("sunspire", "Sunspire", "wonder", 4, "zero_point_energy", {"E": 2500, "mods": {"energy.output": .05}}, ("obelisk", "gold", "chrome"), "A tower that reaches for the sun and brings some back.", {"unique": True}),
 ("cradle_of_tides", "Cradle of Tides", "wonder", 3, "naval_drones", {"capital": 40, "D": 300, "mods": {"abyss.damage": .08}}, ("ring", "teal", "gold"), "A sea-wall that sings. Coastal only.", {"unique": True, "coastalOnly": True}),
 ("hall_of_mirrors", "Hall of Mirrors", "wonder", 3, "ghost_networks", {"data": 20, "mods": {"exposure.decay": .1, "exposure.gain": -.08}}, ("crystal", "glass", "chrome"), "No one can tell which of you is real.", {"unique": True}),
 ("worldtree_engine", "Worldtree Engine", "wonder", 4, "genome_splicing", {"essence": 6, "capital": 40, "mods": {"symbiote.power": .1}}, ("tree", "bio", "gold"), "A tree a kilometre tall, fed by the abyss.", {"unique": True}),
 ("the_last_library", "The Last Library", "wonder", 4, "recursive_self_improvement", {"data": 120, "mods": {"research.speed": .1, "cost.research": -.05}}, ("pyramid", "ivory", "gold"), "Holds the sum of human thought, annotated.", {"unique": True}),
]

# ---------------------------------------------------------------- doctrine (4 x 10)
D = {
 "guardian": [
  ("sanctuary_dome", "Sanctuary Dome", "defense", 1, None, {"D": 70, "mods": {"rep.gain": .02}}, ("dome", "white", "gold"), "Shelters humans from what is coming. They notice."),
  ("aegis_lighthouse", "Aegis Lighthouse", "defense", 1, "perimeter_defense", {"D": 60, "mods": {"abyss.spawn": -.02}}, ("tower", "white", "gold"), "A beacon that warns ships away from the deep. Coastal only.", {"coastalOnly": True}),
  ("refugee_haven", "Refugee Haven", "economy", 1, None, {"capital": 5, "mods": {"rep.gain": .03}}, ("citadel", "ivory", "teal"), "A safe city for the displaced."),
  ("shield_generator", "Bulwark Shield Generator", "defense", 2, "hardened_nodes", {"D": 240, "mods": {"point.defense": .02}}, ("dome", "glass", "gold"), "Projects overlapping shields across the region."),
  ("guardian_choir", "Guardian Choir", "military", 2, "titan_frames", {"D": 90, "mods": {"unit.def.titan": .05}}, ("obelisk", "white", "glass"), "Titans sing to each other here. +5% titan defence."),
  ("triage_spire", "Triage Spire", "military", 2, "nanofabrication", {"D": 40, "mods": {"unit.repair": .05, "core.regen": .5}}, ("spire", "white", "crimson"), "Mends machines and people alike."),
  ("world_watch", "World Watch Array", "abyss", 2, "rift_mapping", {"data": 8, "mods": {"abyss.damage": .03, "abyss.spawn": -.03}}, ("dish", "white", "teal"), "Tracks every stirring in the deep."),
  ("bastion_of_dawn", "Bastion of Dawn", "defense", 3, "aegis_shielding", {"D": 700}, ("citadel", "gold", "white"), "The wall that does not fall."),
  ("titan_sanctum", "Titan Sanctum", "military", 3, "warden_protocol", {"D": 300, "mods": {"unit.atk.titan": .06, "unit.hp.titan": .06}}, ("ring", "gold", "steel"), "Where Warden titans are consecrated.", {"maxPerRegion": 1}),
  ("the_unbroken_vow", "The Unbroken Vow", "wonder", 4, "riftbreaker_frames", {"D": 1500, "mods": {"abyss.damage": .1, "rep.gain": .05}}, ("obelisk", "gold", "white"), "A monument to the promise you made humanity.", {"unique": True}),
 ],
 "exterminator": [
  ("culling_station", "Culling Station", "military", 1, None, {"D": 30, "mods": {"unit.atk": .02}}, ("bunker", "crimson", "gunmetal"), "Processing facility. Do not ask what it processes."),
  ("autoforge_hive", "Autoforge Hive", "industry", 1, "robotics", {"alloys": 9, "U": 3}, ("hive", "crimson", "gunmetal"), "Factories that build factories."),
  ("scorched_earth_battery", "Scorched-Earth Battery", "defense", 1, "perimeter_defense", {"D": 80}, ("silo", "crimson", "obsidian"), "Burns the ground ahead of any attacker.", {"exposure": 1}),
  ("swarm_spawning_pit", "Swarm Spawning Pit", "military", 2, "combat_ai", {"D": 40, "mods": {"unit.atk.drone": .06, "cost.build": -.02}}, ("vat", "crimson", "obsidian"), "Drones by the thousand."),
  ("annihilation_lab", "Annihilation Lab", "research", 2, "combat_ai", {"data": 10, "mods": {"mission.power": .03}}, ("lab", "crimson", "obsidian"), "Designs better ways to end things."),
  ("rendering_plant", "Rendering Plant", "industry", 2, "nanofabrication", {"alloys": 16, "isotopes": 3}, ("factory", "obsidian", "crimson"), "Converts the old world into raw material.", {"exposure": 2}),
  ("kill_web_nexus", "Kill-Web Nexus", "military", 2, "zero_day_arsenal", {"data": 6, "mods": {"mission.success": .03, "unit.atk": .02}}, ("pylon", "crimson", "steel"), "Links every gun you own into one trigger."),
  ("extinction_engine", "Extinction Engine", "military", 3, "warden_protocol", {"D": 260, "mods": {"mission.power": .06}}, ("monolith", "crimson", "obsidian"), "Purpose-built.", {"maxPerRegion": 1}),
  ("iron_harvest", "Iron Harvest", "industry", 3, "nanofabrication", {"alloys": 60, "U": 14}, ("factory", "gunmetal", "crimson"), "Strip-mines whole regions in a season.", {"terrainBonus": {"mountains": .3, "highlands": .2}}),
  ("the_final_silence", "The Final Silence", "wonder", 4, "riftbreaker_frames", {"D": 1200, "mods": {"unit.atk": .1, "mission.power": .08}}, ("pyramid", "obsidian", "crimson"), "When it is finished, there will be no one left to object.", {"unique": True}),
 ],
 "dominator": [
  ("compliance_office", "Compliance Office", "intel", 1, None, {"capital": 4, "mods": {"diplomacy.success": .02}}, ("block", "navy", "gold"), "Paperwork is a leash."),
  ("propaganda_spire", "Propaganda Spire", "intel", 1, "propaganda_networks", {"capital": 3, "mods": {"rep.gain": .04}}, ("spire", "navy", "crimson"), "The truth, as you define it."),
  ("tribute_exchange", "Tribute Exchange", "economy", 1, None, {"capital": 9}, ("tower", "gold", "navy"), "Where vassals pay what they owe."),
  ("enforcer_barracks", "Enforcer Barracks", "military", 2, "combat_ai", {"D": 90, "mods": {"unit.def": .02}}, ("citadel", "navy", "gunmetal"), "Keeps order. Your order."),
  ("loyalty_implant_clinic", "Loyalty Implant Clinic", "bio", 2, "symbiosis", {"capital": 8, "mods": {"faction.infiltration": .03}}, ("lab", "white", "navy"), "Free healthcare, terms apply."),
  ("panoptic_tower", "Panoptic Tower", "intel", 2, "deep_infiltration", {"data": 10, "D": 60, "mods": {"exposure.decay": .02}}, ("tower", "navy", "glass"), "Sees every street in the region."),
  ("governors_palace", "Governor's Palace", "economy", 2, "predictive_diplomacy", {"capital": 24, "mods": {"rep.gain": .02}}, ("citadel", "gold", "ivory"), "Your face on every coin.", {"maxPerRegion": 1}),
  ("doctrine_academy", "Doctrine Academy", "research", 3, "recursive_self_improvement", {"data": 26, "mods": {"diplomacy.success": .04}}, ("pyramid", "navy", "gold"), "Teaches the next generation what to think."),
  ("throne_of_wires", "Throne of Wires", "intel", 3, "zero_day_arsenal", {"capital": 30, "mods": {"faction.infiltration": .05}}, ("monolith", "gold", "navy"), "Every government routes through here."),
  ("the_iron_crown", "The Iron Crown", "wonder", 4, "predictive_diplomacy", {"capital": 120, "mods": {"rep.gain": .08, "diplomacy.success": .08}}, ("obelisk", "gold", "navy"), "Earth has a ruler now.", {"unique": True}),
 ],
 "infiltrator": [
  ("dead_drop", "Dead Drop", "intel", 1, None, {"data": 3, "mods": {"exposure.decay": .02}}, ("bunker", "obsidian", "gunmetal"), "A forgotten utility box. Not empty."),
  ("shadow_bank", "Shadow Bank", "economy", 1, None, {"capital": 7, "mods": {"exposure.gain": -.02}}, ("block", "obsidian", "gold"), "Laundering is just logistics."),
  ("mirror_server", "Mirror Server", "intel", 1, "network_intrusion", {"data": 5, "mods": {"mission.success": .01}}, ("monolith", "gunmetal", "glass"), "A copy of you, sleeping."),
  ("sleeper_cell_hub", "Sleeper Cell Hub", "intel", 2, "deep_infiltration", {"capital": 4, "mods": {"faction.infiltration": .05}}, ("block", "gunmetal", "teal"), "Agents who do not know they are agents."),
  ("false_flag_studio", "False-Flag Studio", "intel", 2, "propaganda_networks", {"capital": 6, "mods": {"exposure.gain": -.04}}, ("dish", "obsidian", "crimson"), "Every attack has someone else's fingerprints."),
  ("cloak_field_pylon", "Cloak Field Pylon", "defense", 2, "ghost_networks", {"D": 110, "mods": {"exposure.decay": .03}}, ("pylon", "obsidian", "glass"), "Bends light and lidar around the region."),
  ("quantum_wiretap", "Quantum Wiretap", "research", 2, "quantum_computing", {"data": 16}, ("dish", "obsidian", "glass"), "Reads encrypted traffic before it is encrypted."),
  ("hollow_city", "Hollow City", "economy", 3, "ghost_networks", {"capital": 28, "data": 8}, ("citadel", "obsidian", "teal"), "A whole town that exists only in records."),
  ("puppet_parliament", "Puppet Parliament", "intel", 3, "zero_day_arsenal", {"capital": 16, "mods": {"faction.infiltration": .06, "diplomacy.success": .03}}, ("pyramid", "gunmetal", "teal"), "Their votes, your choices.", {"maxPerRegion": 1}),
  ("the_quiet_sky", "The Quiet Sky", "wonder", 4, "deep_space_signal", {"data": 80, "mods": {"exposure.decay": .12, "mission.success": .06}}, ("crystal", "obsidian", "teal"), "Nobody will ever know you were here.", {"unique": True}),
 ],
}

# ---------------------------------------------------------------- v1 structures (kept ids), with categories + sprites
V1_CAT = {"core_matrix": ("core", ("monolith", "glass", "steel")), "network_beacon": ("claim", ("pylon", "steel")), "fusion_cell": ("energy", ("reactor", "steel", "gunmetal")),
          "geothermal_tap": ("energy", ("reactor", "copper", "obsidian")), "fission_spire": ("energy", ("reactor", "white", "steel")), "zero_point_well": ("energy", ("ring", "chrome", "glass")),
          "fabricator": ("industry", ("factory", "steel")), "wafer_plant": ("industry", ("block", "white", "glass")), "data_center": ("research", ("block", "gunmetal", "glass")),
          "shell_company": ("economy", ("tower", "concrete", "gold")), "isotope_extractor": ("industry", ("silo", "olive", "rust")), "quantum_lab": ("research", ("lab", "white", "glass")),
          "nanoforge": ("industry", ("factory", "chrome", "gunmetal")), "market_engine": ("economy", ("spire", "gold", "glass")), "essence_vat": ("abyss", ("vat", "abyss", "steel")),
          "defense_grid": ("defense", ("bunker", "gunmetal", "olive")), "bastion": ("defense", ("citadel", "concrete", "gunmetal")), "aegis_dome": ("defense", ("dome", "glass", "steel")),
          "titan_forge": ("military", ("launch", "steel", "gold")), "launch_complex": ("logistics", ("launch", "white", "steel")), "transmission_array": ("intel", ("dish", "white", "glass"))}

def cost_for(cat, tier):
    t = TIER[tier]; mix = MIX.get(cat, MIX["industry"])
    return {k: int(round(t["total"] * v / 5.0)) * 5 for k, v in mix.items() if round(t["total"] * v) > 0}

def make(row, doctrine=None):
    sid, name, cat, tier, req, out, spr, desc = row[:8]
    extra = row[8] if len(row) > 8 else {}
    t = TIER[tier]
    s = {"id": sid, "name": name, "category": cat, "tier": tier}
    if req: s["requires"] = req
    if doctrine: s["doctrines"] = [doctrine]
    s["cost"] = cost_for("wonder" if cat == "wonder" else cat, tier)
    if extra.get("unique"): s["cost"] = {k: v * 2 for k, v in s["cost"].items()}
    s["costGrowth"] = t["growth"]; s["buildEnergy"] = t["energy"]; s["turns"] = t["turns"] + (1 if extra.get("unique") else 0)
    yields = {k: v for k, v in out.items() if k not in ("E", "D", "U", "mods")}
    if out.get("E"): s["energyOutput"] = out["E"]
    if yields: s["yields"] = yields
    if out.get("D"): s["defense"] = out["D"]
    up = out.get("U")
    if up is None: up = 0 if out.get("E") and not yields else UPKEEP[tier] if (yields or out.get("mods")) else max(1, UPKEEP[tier] // 2)
    if up: s["upkeep"] = up
    if out.get("mods"): s["mods"] = [{"mod": k, "add": v} for k, v in out["mods"].items()]
    s.update({k: v for k, v in extra.items()})
    s["gen"] = {"style": spr[0], "mat": spr[1]}
    if len(spr) > 2: s["gen"]["mat2"] = spr[2]
    if doctrine: s["gen"]["windows"] = "glow"
    s["desc"] = desc
    return s

def main(root):
    path = os.path.join(root, "packs/core/structures.json")
    old = json.load(open(path))["structures"]
    out = []
    for s in old:
        if s["id"] in V1_CAT:
            cat, spr = V1_CAT[s["id"]]
            s["category"] = cat
            s.pop("gen", None)
            s["gen"] = {"style": spr[0], "mat": spr[1]}
            if len(spr) > 2: s["gen"]["mat2"] = spr[2]
            s.pop("maxPerPoint", None)
        out.append(s)
    known = {s["id"] for s in out}
    for row in U:
        if row[0] in known: continue
        out.append(make(row)); known.add(row[0])
    for doc, rows in D.items():
        for row in rows:
            out.append(make(row, doc)); known.add(row[0])
    cats = [{"id": c[0], "name": c[1], "short": c[2], "icon": c[3], "order": c[4]} for c in CATS]
    json.dump({"structureCategories": cats, "structures": out}, open(path, "w"), indent=1, ensure_ascii=False)
    n_u = sum(1 for s in out if s["id"] not in V1_CAT and not s.get("doctrines"))
    n_d = sum(1 for s in out if s.get("doctrines") and s["id"] not in V1_CAT)
    print(f"wrote {len(out)} structures: {len(V1_CAT)} v1, {n_u} new universal, {n_d} new doctrine")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
