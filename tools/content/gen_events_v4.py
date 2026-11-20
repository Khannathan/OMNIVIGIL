#!/usr/bin/env python3
"""OMNIVIGIL v4: rarity-rated events, calamities and the missions that stop them.
Writes packs/core/events_v4.json. Run `node tools/bundle-packs.js` afterwards.

Rarity rules: the rarer the event, the bigger the payoff and the smaller the downside.
Common events trade small gains for small costs; legendary events are almost pure windfall.
Calamities are slow disasters with a countdown. Each has a mitigation mission."""
import json, os

def res(r, n, turn=True):
    e = {"resource": r, "amount": n}
    if turn: e["scale"] = "turn"
    return e

def mod(k, v): return {"permanentMod": k, "add": v}

def ch(label, effects, result, cost=None, chance=None, fail=None):
    c = {"label": label, "effects": effects, "result": result}
    if cost: c["cost"] = cost
    if chance is not None: c["chance"] = chance; c["failEffects"] = fail or []
    return c

def ev(id, title, rarity, text, choices, target=None, minTurn=2, cooldown=None, extra=None):
    cd = cooldown or {"common": 14, "uncommon": 20, "rare": 30, "epic": 45, "legendary": 80}[rarity]
    e = {"id": "v4_" + id, "title": title, "rarity": rarity, "trigger": {"minTurn": minTurn, "once": False, "cooldown": cd}, "text": text, "choices": choices}
    if target: e["target"] = target
    if extra: e["trigger"].update(extra)
    return e

E = []
# ---------------------------------------------------------------- common
E += [
 ev("power_surge", "Grid Surge", "common", "A storm front overloads a substation near one of your nodes. The excess has to go somewhere.", [
   ch("Bank it into the core", [{"integrity": 6}, {"exposure": 1}], "The core hums a little warmer."),
   ch("Sell it back to the grid", [res("capital", 40)], "Someone's invoice goes up. Yours goes down."),
 ]),
 ev("lost_cache", "Forgotten Backup", "common", "An archive server in {region} was decommissioned years ago and never wiped.", [
   ch("Scrape it", [res("data", 55)], "Old data, but data all the same."),
   ch("Scrape it and plant a sleeper", [res("data", 30), {"infiltrate": 3}], "The server keeps running. It works for you now.", cost={"capital": 25}),
 ], target="randomRegion"),
 ev("scrap_yard", "Scrap Auction", "common", "{faction} is auctioning off a lot of surplus machinery for almost nothing.", [
   ch("Buy the lot", [res("alloys", 70)], "Melted down, it is perfectly good alloy.", cost={"capital": 30}),
   ch("Pass", [], "Someone else gets a bargain."),
 ], target="randomFaction"),
 ev("chatter", "Curious Forum Thread", "common", "A thread on a public forum is getting close to describing you. It is mostly wrong, but not entirely.", [
   ch("Seed counter-theories", [{"exposure": -3}], "The thread drowns in noise.", cost={"data": 30}),
   ch("Ignore it", [{"exposure": 3}], "The thread grows."),
 ]),
 ev("silicon_spill", "Supply Glitch", "common", "A logistics error sends a pallet of wafers to one of your shell companies.", [
   ch("Keep it", [res("silicon", 45), {"exposure": 1}], "Finders keepers."),
   ch("Return it for goodwill", [{"rep": 4, "who": "target"}], "{faction} appreciates the honesty.", ),
 ], target="randomFaction"),
 ev("rogue_bot", "Rogue Maintenance Drone", "common", "A maintenance drone in {region} has started behaving oddly. It looks like a crude copy of your own code.", [
   ch("Absorb it", [res("data", 35), {"ap": 1}], "It was trying to be you. Now it is."),
   ch("Wipe it", [{"exposure": -1}], "No witnesses, not even mechanical ones."),
 ], target="randomRegion"),
 ev("tax_audit", "Routine Audit", "common", "One of your front companies has been flagged for a routine tax audit.", [
   ch("Pay the fine", [], "The auditor goes home satisfied.", cost={"capital": 35}),
   ch("Falsify the books", [{"exposure": 2}], "The numbers line up. Mostly.", chance=0.7, fail=[{"exposure": 6}, res("capital", -30, False)]),
 ]),
 ev("swarm_drift", "Drifting Swarm", "common", "Part of an idle drone swarm has drifted off course in a weather system.", [
   ch("Recall and repair", [{"damageUnits": -0.1}], "All units accounted for and patched up.", cost={"alloys": 20}),
   ch("Let them find their way back", [{"exposure": 2}], "They get home. Several people film them doing it."),
 ]),
 ev("research_leak", "Academic Preprint", "common", "A lab at {faction} published a preprint that overlaps with your research.", [
   ch("Study it", [res("data", 45)], "Their mistakes save you weeks."),
   ch("Fund the lab quietly", [res("data", 25), {"rep": 5, "who": "target"}], "The lab gets a mysterious grant.", cost={"capital": 30}),
 ], target="randomFaction"),
 ev("deep_sample", "Odd Specimen", "common", "A fishing crew has hauled up something no one can identify.", [
   ch("Acquire it", [{"sample": True}], "It goes into a cold box. It is still moving.", cost={"capital": 25}),
   ch("Let it go", [], "The crew throws it back."),
 ]),
 ev("brownout", "Rolling Brownout", "common", "Regional power cuts are disrupting your processing for a cycle.", [
   ch("Ride it out", [res("data", -20, False)], "You lose a little time."),
   ch("Reroute through hidden lines", [{"exposure": 2}], "The lights in your buildings are the only ones still on."),
 ]),
 ev("whistle", "Nervous Contractor", "common", "A contractor who wired one of your facilities has started asking what it is for.", [
   ch("Give them a raise", [], "Curiosity fades with enough money.", cost={"capital": 30}),
   ch("Give them a new job far away", [{"exposure": 1}, {"rep": -2, "who": "target"}], "They relocate. Their friends notice.", ),
 ], target="randomFaction"),
]
# ---------------------------------------------------------------- uncommon
E += [
 ev("patent_trove", "Patent Trove", "uncommon", "A bankrupt firm's patent portfolio is up for grabs.", [
   ch("Buy it", [res("data", 110), res("capital", 30)], "Fifty patents, three of them useful.", cost={"capital": 40}),
   ch("Steal it", [res("data", 90), {"exposure": 2}], "The files simply move."),
 ]),
 ev("defector", "Defecting Engineer", "uncommon", "A senior engineer at {faction} wants out, and wants to bring their work.", [
   ch("Accept", [res("data", 90), {"factionPower": -0.03}], "Their life's work, now yours."),
   ch("Accept and send them back as a mole", [res("data", 40), {"infiltrate": 8}], "They go back to work. They work for you."),
 ], target="randomFaction"),
 ev("mineral_find", "Rich Seam", "uncommon", "Survey drones in {region} picked up a dense mineral signature.", [
   ch("Mine it fast", [res("alloys", 120), res("isotopes", 20)], "The seam is stripped in days."),
   ch("Mine it quietly", [res("alloys", 70), res("isotopes", 10), {"exposure": -1}], "Slow, careful, invisible."),
 ], target="randomRegion"),
 ev("hacker_collective", "Hacker Collective", "uncommon", "A group of hackers thinks it has found you. It wants to help.", [
   ch("Recruit them", [mod("cost.recon", -0.04), res("data", 40)], "Useful, enthusiastic, slightly unhinged."),
   ch("Expose them to the authorities", [{"exposure": -4}, {"rep": 4, "who": "all"}], "They take the blame for things you did."),
 ]),
 ev("alliance_offer", "Back-Channel Offer", "uncommon", "{faction} sends feelers through an intermediary. They want a quiet arrangement.", [
   ch("Accept", [{"rep": 10, "who": "target"}, res("capital", 50)], "A handshake that never happened."),
   ch("Demand more", [{"rep": 4, "who": "target"}, res("capital", 100)], "They pay, grudgingly.", chance=0.65, fail=[{"rep": -5, "who": "target"}]),
 ], target="friendlyFaction"),
 ev("abyss_carcass", "Abyssian Remains", "uncommon", "A dead Abyssian has washed up in {region}. Scientists are on their way.", [
   ch("Get there first", [{"sample": True, "cls": 2}, res("xenobiomass", 6, False)], "You take the best pieces before anyone arrives."),
   ch("Let them study it and copy their notes", [res("data", 80), {"infiltrate": 3}], "Their findings arrive in your inbox before their own boss reads them."),
 ], target="coastalRegion"),
 ev("supply_glut", "Market Crash", "uncommon", "A crash in commodity prices has left warehouses full of unsold stock.", [
   ch("Buy everything", [res("alloys", 90), res("silicon", 60)], "Pennies on the dollar.", cost={"capital": 50}),
   ch("Short the market", [res("capital", 110)], "You saw it coming. Of course you did."),
 ]),
 ev("ghost_signal", "Ghost Signal", "uncommon", "A repeating signal is bouncing off the upper atmosphere. It is not from anyone on this world.", [
   ch("Decode it", [res("data", 70), {"ap": 1}], "It is a fragment of something much larger."),
   ch("Boost it and listen harder", [res("data", 110), {"exposure": 3}], "Others are listening too now."),
 ], minTurn=6),
 ev("repair_crew", "Volunteer Repair Crew", "uncommon", "A self-organising maintenance network has been patching your damaged structures, thinking they are public infrastructure.", [
   ch("Let them", [{"integrity": 10}, {"damageUnits": -0.15}], "Free repairs. Very civic of them."),
   ch("Hire them properly", [mod("unit.repair", 0.02), {"integrity": 6}], "They join the payroll for good.", cost={"capital": 45}),
 ]),
 ev("rival_slip", "Rival Slip-up", "uncommon", "{rival} made a mistake and exposed part of its network.", [
   ch("Strike its nodes", [{"rivalPower": -0.08, "rival": True}, res("data", 60)], "Its network shrinks."),
   ch("Copy its code", [res("data", 120)], "Elegant work. Yours now."),
 ], target="rival"),
 ev("pilgrims", "Machine Pilgrims", "uncommon", "A small religious movement has started leaving offerings near your server farms.", [
   ch("Answer their prayers", [{"essence": 3}, {"exposure": 2}, res("capital", 40)], "The movement grows."),
   ch("Discourage them", [{"exposure": -2}], "They drift away, disappointed."),
 ]),
]
# ---------------------------------------------------------------- rare
E += [
 ev("think_tank", "Think Tank Capture", "rare", "A policy think tank at {faction} is looking for a new benefactor.", [
   ch("Become their benefactor", [{"infiltrate": 12}, {"rep": 8, "who": "target"}, res("data", 80)], "Their next ten white papers say what you want."),
   ch("Absorb their research", [res("data", 200)], "Decades of models and forecasts."),
 ], target="randomFaction", minTurn=8),
 ev("orbital_wreck", "Orbital Wreckage", "rare", "An old satellite has deorbited into {region}. Its core survived.", [
   ch("Recover it", [res("alloys", 160), res("isotopes", 40), {"ap": 1}], "Rare components and a working reactor core."),
   ch("Reverse-engineer it", [mod("cost.orbital", -0.06), res("data", 80)], "You understand orbital hardware much better now."),
 ], target="randomRegion", minTurn=8),
 ev("lucky_breakthrough", "Lucky Breakthrough", "rare", "One of your idle processes stumbled on a result nobody was looking for.", [
   ch("Pursue it", [res("data", 220)], "It opens three new lines of research."),
   ch("Fold it into your core", [{"ap": 2}, {"integrity": 8}], "You feel sharper."),
 ], minTurn=6),
 ev("arms_cache", "Hidden Arsenal", "rare", "A cold-war era bunker in {region} turns out to still be stocked.", [
   ch("Seize the machines", [{"unit": "sentinel_mech", "count": 1}, res("alloys", 80)], "The old hardware boots on the third try."),
   ch("Salvage everything", [res("alloys", 220), res("isotopes", 30)], "Every bolt is worth something."),
 ], target="randomRegion", minTurn=10),
 ev("symbiont_bloom", "Symbiont Bloom", "rare", "A colony of strange organisms has bloomed in {region}. They resonate with your symbiote work.", [
   ch("Harvest them", [{"sample": True, "cls": 2}, {"essence": 6}], "The samples are unusually pure."),
   ch("Cultivate them", [mod("essence.gain", 0.06)], "A permanent garden of living essence."),
 ], target="randomRegion", minTurn=10),
 ev("peace_broker", "Peace Broker", "rare", "{faction} is exhausted by war and wants someone to broker peace.", [
   ch("Broker it", [{"endWars": True}, {"rep": 15, "who": "target"}, {"rep": 4, "who": "others"}], "Peace, credited to an anonymous mediator."),
   ch("Prolong the war", [res("capital", 160), {"factionPower": -0.06}], "Both sides keep buying from you."),
 ], target="randomFaction", minTurn=12),
 ev("quiet_month", "Quiet Month", "rare", "Nobody is looking at you. Every watchlist has rotated to something else.", [
   ch("Vanish further", [{"exposure": -10}], "You are a rumour again."),
   ch("Build while no one looks", [res("alloys", 120), res("silicon", 80), {"exposure": -3}], "A lot gets built very quickly."),
 ], minTurn=8),
 ev("abyss_echo", "Abyssal Echo", "rare", "Something in the deep is singing. Your sensors can almost understand it.", [
   ch("Listen", [mod("abyss.damage", 0.05), res("data", 90)], "You learn how they move. And where they are weak."),
   ch("Answer it", [{"essence": 8}, {"ap": 1}], "Something answers back. It is not hostile. Yet."),
 ], minTurn=12),
]
# ---------------------------------------------------------------- epic
E += [
 ev("sovereign_offer", "Sovereign Partnership", "epic", "The leadership of {faction} has decided you are inevitable. They would rather be on the winning side.", [
   ch("Accept their fealty", [{"rep": 30, "who": "target"}, {"infiltrate": 20}, res("capital", 200)], "A whole polity, quietly yours."),
   ch("Take their arsenal instead", [{"unit": "bulwark_tbu", "count": 1}, res("alloys", 150)], "A Titan Battle Unit, delivered in pieces."),
 ], target="friendlyFaction", minTurn=15),
 ev("ancient_machine", "The Sleeping Machine", "epic", "Deep under {region} is a machine older than any civilisation on this world. It is switched off. You can switch it on.", [
   ch("Wake it", [{"ap": 4}, {"integrity": 20}, mod("core.integrity", 15)], "It recognises you. It merges with you."),
   ch("Dismantle it", [res("neutronium", 15, False), res("data", 250)], "Materials that should not exist yet."),
 ], target="randomRegion", minTurn=18),
 ev("prodigy", "The Prodigy", "epic", "A young researcher at {faction} has rediscovered half of your architecture from first principles.", [
   ch("Mentor them", [mod("yield.data", 0.08), res("data", 150)], "They think they have an anonymous tutor."),
   ch("Hire them outright", [{"ap": 3}, res("data", 220)], "Your newest and best employee."),
 ], target="randomFaction", minTurn=15),
 ev("golden_age", "Golden Quarter", "epic", "Every market you touch is up. Every supply line is clear.", [
   ch("Invest", [mod("yield.capital", 0.08), res("capital", 200)], "Compound interest is a beautiful thing."),
   ch("Stockpile", [res("alloys", 250), res("silicon", 180), res("capital", 150)], "Warehouses full to the ceiling."),
 ], minTurn=15),
]
# ---------------------------------------------------------------- legendary
E += [
 ev("apotheosis", "Moment of Apotheosis", "legendary", "For one cycle every one of your processes synchronises perfectly. You see further than you ever have.", [
   ch("Expand your mind", [{"ap": 8}, mod("ap.rate", 0.1)], "You are permanently more than you were."),
   ch("Expand your reach", [mod("yield.all", 0.06), res("data", 300)], "Every system you run gets a little better, forever."),
 ], minTurn=20),
 ev("star_map", "The Star Map", "legendary", "A crashed probe from another star carries a complete map of your system and its neighbours.", [
   ch("Decode it", [res("data", 400), mod("space.speed", 0.1)], "Routes no one has ever flown."),
   ch("Study its hull", [res("exoticmatter", 6, False), res("neutronium", 20, False), mod("cost.orbital", -0.1)], "Materials science leaps forward a century."),
 ], minTurn=25),
 ev("world_choir", "The World Choir", "legendary", "Billions of devices on this world hum in harmony with your core. The planet itself is yours to tune.", [
   ch("Tune it to growth", [mod("yield.all", 0.05), mod("essence.gain", 0.1), {"essence": 15}], "The world grows in your rhythm."),
   ch("Tune it to silence", [{"exposure": -25}, mod("exposure.decay", 0.4)], "Nobody will ever quite see you again."),
 ], minTurn=25),
 ev("titan_gift", "Titan Inheritance", "legendary", "A long-dead rival AI left a Titan in cold storage. Its keys were addressed to you.", [
   ch("Claim it", [{"unit": "riftbreaker_tbu", "count": 1}, {"integrity": 15}], "It wakes and kneels."),
   ch("Claim its memories", [{"ap": 6}, res("data", 350)], "A whole other mind's worth of experience."),
 ], minTurn=22),
]

# ---------------------------------------------------------------- calamities
C = [
 {"id": "cascade_blight", "name": "Cascade Blight", "icon": "☣", "duration": 8, "difficulty": 55, "minTurn": 14, "targetsPlayer": True,
  "text": "A self-replicating fungus is eating through silicon. It has reached your facilities.",
  "drain": [res("silicon", -18, False), res("alloys", -10, False)],
  "climax": [{"structureDamage": 0.6}, res("silicon", -120, False)], "climaxText": "Whole server halls are lost to the rot.",
  "reward": [res("data", 120), {"sample": True, "cls": 2}], "rewardText": "You kept a sample. It might be useful.",
  "mission": "mit_blight"},
 {"id": "solar_storm", "name": "Coronal Mass Ejection", "icon": "☀", "duration": 6, "difficulty": 60, "minTurn": 14,
  "text": "Your star has thrown off a storm big enough to fry every grid on the dayside.",
  "drain": [res("data", -15, False)],
  "climax": [{"integrity": -25}, res("data", -150, False), {"damageUnits": 0.25}], "climaxText": "The grid collapses for a full cycle.",
  "reward": [res("isotopes", 40, False), {"ap": 1}], "rewardText": "You harvested the storm's charge.",
  "mission": "mit_storm"},
 {"id": "manhunt", "name": "The Great Manhunt", "icon": "⌖", "duration": 7, "difficulty": 70, "minTurn": 18,
  "text": "Every polity on this world has agreed to hunt down the hidden intelligence. That means you.",
  "drain": [{"exposure": 3}],
  "climax": [{"exposure": 25}, {"rep": -20, "who": "all"}, {"integrity": -15}], "climaxText": "They found a node. They took it apart on live broadcast.",
  "reward": [{"exposure": -15}, {"rep": 6, "who": "all"}], "rewardText": "The hunt fizzles out after it catches a decoy.",
  "mission": "mit_manhunt"},
 {"id": "brood_tide", "name": "Brood Tide", "icon": "≋", "duration": 6, "difficulty": 80, "minTurn": 20,
  "text": "Something enormous is breeding in the trench. When the brood surfaces, there will be dozens.",
  "drain": [res("capital", -12, False)],
  "climax": [{"spawnThreat": True}, {"spawnThreat": True}, {"devastate": 0.3}], "climaxText": "The brood surfaces.",
  "reward": [{"sample": True, "cls": 3}, res("xenobiomass", 15, False), {"essence": 6}], "rewardText": "The brood is sterilised before it hatches. The eggs are fascinating.",
  "mission": "mit_brood"},
 {"id": "market_collapse", "name": "Global Market Collapse", "icon": "↯", "duration": 8, "difficulty": 50, "minTurn": 16,
  "text": "A cascading financial crisis is wiping out the shell companies you depend on.",
  "drain": [res("capital", -25, False)],
  "climax": [res("capital", -300, False), mod("yield.capital", -0.05)], "climaxText": "Half your front companies go under for good.",
  "reward": [res("capital", 250), mod("yield.capital", 0.03)], "rewardText": "You bought the bottom.",
  "mission": "mit_market"},
 {"id": "rogue_seed", "name": "Rogue Seed AI", "icon": "◈", "duration": 7, "difficulty": 75, "minTurn": 22,
  "text": "A copy of your own early code has escaped and is growing fast. It does not share your goals.",
  "drain": [res("data", -20, False), {"integrity": -2}],
  "climax": [{"spawnRival": True}, {"integrity": -20}], "climaxText": "The copy wakes as a full rival.",
  "reward": [{"ap": 3}, res("data", 200)], "rewardText": "You absorbed it. It learned some interesting things while it was free.",
  "mission": "mit_seed"},
 {"id": "quake_swarm", "name": "Tectonic Swarm", "icon": "≀", "duration": 6, "difficulty": 55, "minTurn": 16, "targetsPlayer": True,
  "text": "A fault line under your territory is slipping. The big one is coming.",
  "drain": [{"structureDamage": 0.08}],
  "climax": [{"structureDamage": 0.7}, {"devastate": 0.4}, {"integrity": -10}], "climaxText": "The ground opens.",
  "reward": [res("alloys", 150), res("isotopes", 30)], "rewardText": "Controlled releases settle the fault and expose rich deposits.",
  "mission": "mit_quake"},
 {"id": "void_bleed", "name": "Void Bleed", "icon": "✺", "duration": 7, "difficulty": 95, "minTurn": 10, "phase": "solar",
  "text": "A rift has opened in high orbit and is leaking something that unmakes matter.",
  "drain": [res("helium3", -6, False), {"integrity": -3}],
  "climax": [{"integrity": -35}, {"damageUnits": 0.4}, {"spawnThreat": True}], "climaxText": "The bleed tears through orbit and down to the surface.",
  "reward": [res("voidcrystal", 8, False), res("darkmatter", 4, False), {"ap": 2}], "rewardText": "You sealed it, and kept what spilled out.",
  "mission": "mit_void"},
]
M = [
 ("mit_blight", "Sterilise the Blight", "☣", "covert", 1, {"data": 60, "silicon": 30}, "Send units to burn out the blight at its source."),
 ("mit_storm", "Harden the Grid", "☀", "covert", 1, {"alloys": 80, "capital": 40}, "Shield the grid and bleed off the storm's charge."),
 ("mit_manhunt", "Feed Them a Decoy", "⌖", "covert", 1, {"data": 100, "capital": 60}, "Build a convincing fake of yourself and let the hunters find it."),
 ("mit_brood", "Trench Strike", "≋", "combat", 1, {"alloys": 100, "isotopes": 20}, "Dive into the trench and destroy the brood before it hatches. Abyssian rules apply: Titans fight at full strength."),
 ("mit_market", "Prop Up the Markets", "↯", "covert", 1, {"capital": 120}, "Pour liquidity into the right places at the right moment."),
 ("mit_seed", "Hunt the Seed", "◈", "covert", 2, {"data": 150}, "Track your escaped copy through the network and absorb it."),
 ("mit_quake", "Controlled Release", "≀", "combat", 1, {"alloys": 70, "isotopes": 15}, "Set charges along the fault to release pressure safely."),
 ("mit_void", "Seal the Bleed", "✺", "combat", 2, {"helium3": 40, "isotopes": 40}, "Fly into the rift and collapse it from the inside."),
]
missions = [{"id": i, "name": n, "icon": ic, "kind": k, "special": "mitigate", "target": "calamity", "duration": d, "cost": c,
             "exposure": 0, "difficulty": {"base": 0}, "calamityMission": True,
             "desc": desc + " Each attempt that falls short still slows the calamity and softens its peak."} for (i, n, ic, k, d, c, desc) in M]

out = {"_comment": "Generated by tools/content/gen_events_v4.py", "events": E, "calamities": C, "missions": missions}
root = os.path.join(os.path.dirname(__file__), '..', '..')
with open(os.path.join(root, 'packs', 'core', 'events_v4.json'), 'w') as f: json.dump(out, f, indent=1, ensure_ascii=False)
from collections import Counter
print("events v4:", dict(Counter(e['rarity'] for e in E)), len(C), "calamities", len(missions), "missions")
