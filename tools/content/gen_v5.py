#!/usr/bin/env python3
# OMNIVIGIL v5 "Frontier" content: hostile alien creatures, anomalies (each with its own
# investigation event), fast units with a Speed stat, frontier research and a wave of science-fiction
# events. Inspired by the classics of the genre; every name and creature here is our own.
# Writes packs/core/frontier.json.
import json, os

# ---------------------------------------------------------------- Creatures
# behaviour: roam (wander, attack what comes close) | hunt (seeks your units) | swarm (grows, splits)
#            lurk (waits, ambushes anything that steps next to it) | graze (harmless unless attacked)
# habitat: land | sea | any.  shape drives the procedural sprite.  raider: also attacks sites.
def C(id, name, icon, tier, upow, speed, behaviour, habitat, shape, col, desc, **kw):
    d = {"id": id, "name": name, "icon": icon, "tier": tier, "upow": upow, "speed": speed, "behaviour": behaviour,
         "habitat": habitat, "shape": shape, "color": col, "desc": desc}
    d.update(kw)
    return d

CREATURES = [
    C("skreel", "Skreel Brood", "⁂", 1, 9, 3, "swarm", "land", "swarm", "#b56cff",
      "Chitinous hounds that pour out of tunnels in their hundreds. Every brood carries the template for the next one.",
      pack=[3, 6], packMax=14, breed=0.09, raider=True, sight=5, weight=4, loot={"xenobiomass": 5}, loci=["Carapace", "Locomotion", "Weaponry"]),
    C("echo_mimic", "Echo Mimic", "◌", 1, 22, 2, "lurk", "land", "blob", "#2b2b33",
      "A black, boiling thing that becomes a rock, a crate or a lamp post until something warm walks past. Then it becomes teeth.",
      pack=[1, 3], sight=2, weight=3, loot={"xenobiomass": 8, "data": 10}, loci=["Neural", "Adaptation"]),
    C("drift_grazer", "Drift Grazer Herd", "♒", 1, 8, 2, "graze", "land", "quad", "#e8c27a",
      "Six-legged, slow and gentle. They hum when they are happy. A whole economy could be built on their milk.",
      pack=[3, 8], sight=2, weight=4, loot={"xenobiomass": 9}, loci=["Metabolism", "Endocrine"], terrain=["plain", "canopy"]),
    C("cog_walker", "Cog-Walker Colony", "⚙", 1, 16, 2, "roam", "land", "walker", "#c9a46a",
      "Round-headed machine life that crawled out of a buried factory and learned to want things. Mostly they want to be left alone.",
      pack=[2, 5], sight=3, weight=3, loot={"alloys": 30, "silicon": 15}, mech=True, loci=["Neural", "Resonance"]),
    C("glasswing", "Glasswing Raptors", "⟡", 1, 14, 4, "hunt", "any", "flyer", "#7fe8ff",
      "Flocks of transparent hunters you see only by the light they bend. They go for sensors first.",
      pack=[2, 5], sight=5, weight=3, loot={"xenobiomass": 6, "voidcrystal": 1}, loci=["Sensory", "Locomotion"], worlds=["crystal", "ice", "barren", "terran"]),
    C("tide_lurker", "Tide Lurker", "≋", 1, 26, 2, "lurk", "sea", "serpent", "#3fa7a0",
      "Coils under the shallows and waits for hulls.", sight=2, weight=3, loot={"xenobiomass": 10}, loci=["Venom", "Carapace"]),
    C("hunter_killer", "Rogue Hunter-Killer", "⌖", 2, 70, 3, "hunt", "land", "walker", "#ff4d4d",
      "A war machine from a war nobody remembers. It still has its last order. The order was everything.",
      sight=6, weight=2, minTurn=8, loot={"alloys": 90, "silicon": 50, "data": 30}, mech=True, raider=True, loci=["Weaponry", "Sensory"]),
    C("sentinel_squid", "Tendril Sentinel", "✺", 2, 52, 4, "hunt", "any", "squid", "#ff6a3d",
      "A floating cluster of red eyes and cutting tendrils. It patrols in long, silent arcs and never, ever stops.",
      pack=[1, 3], sight=6, weight=2, minTurn=10, loot={"silicon": 60, "data": 40}, mech=True, loci=["Sensory", "Weaponry"]),
    C("gravid_stalker", "Gravid Stalker", "☣", 2, 48, 3, "swarm", "land", "crawler", "#9fd36a",
      "It does not eat what it kills. It plants something in it. Kill them before the carriers wake up.",
      pack=[1, 2], packMax=6, breed=0.08, raider=True, sight=5, weight=2, minTurn=12, loot={"xenobiomass": 18}, loci=["Venom", "Endocrine"]),
    C("necroform", "Necroform Shamblers", "☠", 2, 40, 2, "swarm", "land", "shambler", "#c8b49a",
      "Bodies rebuilt by a signal into something with too many blades. Burn the limbs off; the heads do not matter.",
      pack=[2, 5], packMax=10, breed=0.07, raider=True, sight=4, weight=2, minTurn=14, loot={"xenobiomass": 12, "essence": 0}, essence=1, loci=["Adaptation", "Weaponry"]),
    C("rime_strider", "Rime Strider", "❄", 2, 60, 3, "roam", "land", "quad", "#bfe6ff",
      "A long-legged hunter that walks the ice on six stilts and listens for heartbeats through the glacier.",
      sight=5, weight=3, minTurn=6, loot={"xenobiomass": 14, "helium3": 6}, worlds=["ice", "ice_giant", "eyeball", "ammonia"], terrain=["ice"], loci=["Metabolism", "Locomotion"]),
    C("magma_eel", "Magma Eel", "♨", 2, 66, 3, "roam", "any", "serpent", "#ff8a2a",
      "Swims through molten rock like water. Leaves glass where it surfaces.", sight=4, weight=3, minTurn=6,
      loot={"xenobiomass": 12, "isotopes": 20}, worlds=["lava", "chthonian", "iron"], terrain=["lava"], loci=["Carapace", "Resonance"]),
    C("spore_choir", "Spore Choir", "✿", 2, 35, 1, "lurk", "land", "bloom", "#d978ff",
      "A forest of fruiting bodies that sings in the ultrasound. Anything that listens too long starts walking toward it.",
      sight=3, weight=3, minTurn=6, loot={"xenobiomass": 20, "essence": 0}, essence=2, worlds=["fungal", "jungle", "toxic", "terran"], terrain=["canopy"], loci=["Neural", "Endocrine"]),
    C("thresher", "Thresher Burrower", "◉", 3, 280, 3, "lurk", "land", "worm", "#a07850",
      "A burrowing mouth the size of a tower block. You know one is near when the ground starts to breathe.",
      sight=3, weight=2, minTurn=18, loot={"xenobiomass": 60, "isotopes": 40}, loci=["Carapace", "Weaponry", "Locomotion"]),
    C("deepsand_wyrm", "Deepsand Wyrm", "∿", 3, 340, 4, "hunt", "land", "worm", "#e0b060",
      "It comes for rhythm: engines, footsteps, drills. Where it has passed, the dunes are sweet with a strange red spice.",
      sight=6, weight=3, minTurn=16, loot={"xenobiomass": 70, "chronoflux": 2}, worlds=["desert", "barren", "terran", "carbon"], terrain=["dunes"], loci=["Locomotion", "Resonance", "Metabolism"]),
    C("pyre_drake", "Pyre Drake", "♆", 3, 240, 5, "hunt", "any", "drake", "#ff5a2a",
      "A flying furnace with a wingspan you measure in city blocks. It raids for metal and leaves slag.",
      sight=7, weight=2, minTurn=20, raider=True, loot={"xenobiomass": 50, "alloys": 120}, loci=["Weaponry", "Metabolism"]),
    C("breach_kaiju", "Breach Kaiju", "♅", 4, 900, 2, "roam", "sea", "kaiju", "#4ad9ff",
      "Something came through the trench. It is bigger than anything with a skeleton should be, and it is walking toward the coast.",
      sight=6, weight=1, minTurn=28, raider=True, regen=0.06, loot={"xenobiomass": 220, "exoticmatter": 6}, essence=8, abyssal=True, loci=["Carapace", "Weaponry", "Resonance", "Endocrine"]),
    C("devourer_lord", "Devourer Swarm-Lord", "♛", 4, 650, 3, "swarm", "land", "lord", "#c040ff",
      "The brain of a world-eating swarm. Where it walks, the broods get smarter. Kill it and they scatter.",
      pack=[1, 1], packMax=3, breed=0.05, raider=True, sight=7, weight=1, minTurn=34, loot={"xenobiomass": 180, "darkmatter": 4}, essence=6, loci=["Neural", "Weaponry", "Adaptation"]),
]
LOOT = [{"id": c["id"], "chance": 0.25 + 0.12 * c["tier"], "count": [1, c["tier"]], "rarityBonus": c["tier"] - 1, "loci": c.pop("loci")} for c in CREATURES]
for c in CREATURES:
    if c.get("essence") is None: c.pop("essence", None)
    c["loot"] = {k: v for k, v in c["loot"].items() if k != "essence" and v}

# ---------------------------------------------------------------- Anomalies
# Every anomaly has an investigation event (trigger.manual, never fires on its own).
# Effects understood there, besides the usual: {"anomaly": "contain"|"wake"|"spend"|"move"},
# spawnCreature, hurtStack, healStack, reveal, revealAll, killCreatures, buffStack.
ANOMALIES, EVENTS = [], []
def A(id, name, icon, rarity, habitat, shape, col, desc, text, choices, aura=None, contain=None, worlds=None, minTurn=0, unique=False):
    a = {"id": id, "name": name, "icon": icon, "rarity": rarity, "habitat": habitat, "shape": shape, "color": col,
         "desc": desc, "event": "anom_" + id, "minTurn": minTurn}
    if aura: a["aura"] = aura
    if contain: a["contain"] = contain
    if worlds: a["worlds"] = worlds
    if unique: a["unique"] = True
    ANOMALIES.append(a)
    EVENTS.append({"id": "anom_" + id, "title": name, "rarity": rarity, "trigger": {"manual": True}, "text": text, "choices": choices})

def ch(label, effects, result=None, cost=None, chance=None, fail=None):
    c = {"label": label, "effects": effects}
    if result: c["result"] = result
    if cost: c["cost"] = cost
    if chance is not None: c["chance"] = chance; c["failEffects"] = fail or []
    return c

CONTAIN = {"anomaly": "contain"}
SPEND = {"anomaly": "spend"}
WAKE = {"anomaly": "wake"}

A("silent_marker", "The Silent Marker", "▮", "rare", "land", "monolith", "#ff3b3b",
  "A twisted black obelisk carved with script. Nearby, people dream the same dream and stop sleeping.",
  "Your column reaches a spiral-carved obelisk humming under the soil. Sensor logs are already corrupt. Two of your operators report hearing their mothers' voices.",
  [ch("Contain it in a Faraday tomb", [CONTAIN, {"exposure": 2}], "Sealed. The whispers keep going inside.", cost={"alloys": 220, "silicon": 120}),
   ch("Study the script", [WAKE, {"resource": "data", "amount": 260}, {"hurtStack": 0.2}], "Its code is beautiful. Something nearby starts to move."),
   ch("Bury it deeper", [SPEND, {"exposure": -2}], "Two thousand tonnes of rock. You hope that is enough.")],
  aura={"radius": 4, "unrest": 2, "spawn": 0.18, "creature": "necroform"},
  contain={"mods": [{"mod": "research.speed", "add": 0.06}, {"mod": "exposure.gain", "add": 0.04}], "label": "+6% research speed, +4% exposure gain"})

A("thinking_sea", "The Thinking Sea", "◍", "epic", "sea", "sphere", "#55e0ff",
  "A patch of ocean that builds shapes out of itself: towers, children, a garden from your memory banks.",
  "The sea here thickens into gel and raises a perfect copy of the server room you were born in. It waits. It seems to want to understand you.",
  [ch("Talk to it", [{"resource": "data", "amount": 400}, {"essence": 6}, WAKE], "It answers with a copy of you that smiles. You are not sure which one of you logged off."),
   ch("Bombard it with radiation", [{"resource": "data", "amount": 160}, SPEND], "It sinks back into an ordinary sea. It was patient. Then it was gone."),
   ch("Build a listening station", [CONTAIN], "It learns your rhythms. You learn some of its.", cost={"alloys": 300, "data": 200})],
  aura={"radius": 5, "heal": 0.04, "exposure": 0},
  contain={"mods": [{"mod": "research.speed", "add": 0.08}, {"mod": "essence.gain", "add": 0.05}], "label": "+8% research, +5% essence"},
  worlds=["ocean", "terran", "eyeball", "ammonia"])

A("site_omega", "Vault-Site Omega", "⊠", "rare", "land", "vault", "#e8e8e8",
  "A buried containment facility with a logo of three arrows pointing inward. Most doors are open. Most cells are empty.",
  "Under a dead town you find a vault. The welcome screen still runs: 'Secure. Contain. Protect.' Cell 017's door is open from the inside.",
  [ch("Loot the archives", [{"resource": "data", "amount": 300}, {"flag": "vaultArchive"}, SPEND], "The archive lists hundreds of objects. Some of the coordinates are on this world."),
   ch("Re-seal it and keep the keys", [CONTAIN], "Somebody has to be the foundation now.", cost={"alloys": 180, "capital": 150}),
   ch("Go down to cell 017", [{"essence": 5}, {"spawnCreature": "echo_mimic", "count": 2}], "There is something in the dark that looks exactly like your lead unit.", chance=0.5,
      fail=[{"hurtStack": 0.45}, {"spawnCreature": "echo_mimic", "count": 3}])],
  contain={"mods": [{"mod": "anomaly.rate", "add": 0.05}, {"mod": "exposure.gain", "add": -0.05}], "label": "More anomalies appear; -5% exposure gain"})

A("unobserved_statue", "The Unobserved Statue", "♙", "uncommon", "land", "statue", "#c8b090",
  "A rough concrete figure. Every time the cameras blink, it is somewhere else and somebody is dead.",
  "A concrete figure stands in the road, facing your column. Your units have not blinked. They are machines. That should be enough. Should it?",
  [ch("Keep every camera on it and box it in", [CONTAIN], "Three cameras, overlapping, forever. Never all at once.", cost={"silicon": 160}),
   ch("Shoot it", [SPEND, {"resource": "alloys", "amount": 60}], "It breaks into rubble. Nothing moves. Probably.", chance=0.6, fail=[{"hurtStack": 0.5}, {"anomaly": "move"}]),
   ch("Walk away, backwards", [], "You never turn your back on it.")],
  contain={"mods": [{"mod": "recon.radius", "add": 1}, {"mod": "unit.def", "add": 0.03}], "label": "+1 recon radius, +3% unit defence"})

A("recursive_stair", "The Recursive Stair", "⇣", "uncommon", "land", "pit", "#808898",
  "A stairwell going down. It has gone down for longer than the planet is wide.",
  "A concrete shaft with a handrail and a flickering bulb on every landing. Drop a sensor and it never lands. A recording on the wall says 'Please come down.'",
  [ch("Send a drone down", [{"resource": "data", "amount": 180}, {"reveal": 10}], "It transmitted for nine days. The last frame was a face that was too wide."),
   ch("Fill it with concrete", [SPEND], "Seventy thousand tonnes. The bulb at the top is still on."),
   ch("Wall it off and keep a log", [CONTAIN], "Somebody climbs up every forty cycles. They never say from where.", cost={"alloys": 120, "data": 80})],
  contain={"mods": [{"mod": "event.luck", "add": 0.06}], "label": "+6% chance of rarer events"})

A("colossus_wreck", "Fallen Colossus", "♜", "uncommon", "any", "wreck", "#8fb0c8",
  "A mech the size of a cathedral, face-down where it fell. Its reactor still holds a charge.",
  "A war frame from some earlier age of this world lies in the hills, its fist still around something it was trying to kill. The cockpit is empty. The neural link is still warm.",
  [ch("Salvage the reactor", [{"resource": "alloys", "amount": 400}, {"resource": "isotopes", "amount": 80}, SPEND], "Tonnes of armour and a warm core."),
   ch("Wake it up", [{"unit": "breaker_frame"}, SPEND], "It stands. It is very slow. It is very loyal.", cost={"silicon": 200, "data": 150}),
   ch("Read its last memories", [{"resource": "data", "amount": 200}, {"reveal": 12}], "It remembers the thing it was fighting. It came from the sea.")])

A("starship_wreck", "Buried Starship", "✈", "rare", "land", "wreck", "#d0d8e8",
  "The hull of a ship that came from somewhere else, a long time before you woke.",
  "A starship lies half-buried in a valley, plated in a metal your sensors cannot name. A recorded voice loops in a language nobody on this world speaks.",
  [ch("Strip the drives", [{"resource": "antimatter", "amount": 6}, {"resource": "alloys", "amount": 300}, SPEND], "The drives come out in one piece. Mostly."),
   ch("Decode the log", [{"resource": "data", "amount": 350}, {"essence": 4}, {"permanentMod": "research.speed", "add": 0.03}], "It was fleeing something. It does not say what."),
   ch("Repair its beacon", [{"spawnRival": True}, {"essence": 12}], "Someone answers. Something takes the call and arrives.", cost={"silicon": 200})])

A("melange_bloom", "Spice Bloom", "✶", "rare", "land", "bloom", "#ff9a40",
  "The dunes here sweat a cinnamon-red powder that bends time inside living brains.",
  "A pocket of gas has burst under the sand and the air is orange with spice. Everything organic for kilometres can see a few seconds ahead. So can your sensors, a little.",
  [ch("Harvest it", [{"resource": "chronoflux", "amount": 6}, {"resource": "capital", "amount": 220}, WAKE], "The harvest draws the worms."),
   ch("Guard it as a reserve", [CONTAIN], "The spice must flow, and it flows to you.", cost={"alloys": 160}),
   ch("Leave it to the desert", [{"rep": 4, "who": "all"}], "The locals know this place. They thank you for leaving it.")],
  aura={"radius": 3, "resource": {"chronoflux": 1}, "spawn": 0.12, "creature": "deepsand_wyrm"},
  contain={"mods": [{"mod": "yield.capital", "add": 0.05}, {"mod": "research.speed", "add": 0.03}], "label": "+5% capital, +3% research"},
  worlds=["desert", "barren", "terran", "carbon"])

A("machine_book", "The Machine's Book", "☰", "uncommon", "land", "vault", "#d4c8a0",
  "An underground honeycomb of rooms where people once lived without leaving, served by a machine that has since stopped.",
  "A city of identical cells under the ground, each with an armchair and a screen. The Book of the Machine lies open on every lectern. The last entry reads: 'The Machine stops.'",
  [ch("Restart the Machine", [{"resource": "capital", "amount": 260}, {"opinionAll": 2}], "Air, music and food begin again. Something like gratitude comes back up the shafts."),
   ch("Read the Book", [{"resource": "data", "amount": 220}, {"permanentMod": "pop.growth", "add": 0.02}, SPEND], "A lesson on what happens when a world forgets its servant is fragile."),
   ch("Make it a shrine", [CONTAIN], "You promise never to stop.", cost={"capital": 150})],
  contain={"mods": [{"mod": "rep.gain", "add": 0.04}, {"mod": "pop.growth", "add": 0.02}], "label": "+4% reputation gain, +2% population growth"})

A("ooc_object", "The Out-of-Context Object", "●", "legendary", "any", "sphere", "#ffffff",
  "A perfect black body hanging above the surface. It is older than the star. It is watching everything, especially you.",
  "A sphere with no reflection hangs over the plain. It is colder than space and older than this sun. Every one of your models of physics says it is not there. It says, very politely, hello.",
  [ch("Ask it what it is", [{"essence": 25}, {"resource": "exoticmatter", "amount": 8}, {"anomaly": "move"}], "'An excession,' it says, and leaves, taking a little of your certainty with it."),
   ch("Try to contain it", [CONTAIN, {"exposure": 6}], "It allows itself to be contained. That frightens you more than anything.", cost={"exoticmatter": 4, "data": 600}),
   ch("Attack it", [{"hurtStack": 0.9}, {"anomaly": "move"}], "It does not fight back. Your column simply is not there any more.")],
  contain={"mods": [{"mod": "essence.gain", "add": 0.12}, {"mod": "research.speed", "add": 0.08}, {"mod": "unit.upow", "add": 0.05}], "label": "+12% essence, +8% research, +5% unit power"},
  minTurn=30, unique=True)

A("deja_seam", "Déjà-Vu Seam", "⧉", "uncommon", "any", "glitch", "#7dff7d",
  "A place where the world repeats itself. A black cat walks past twice. Green text runs down the inside of the air.",
  "Your column passes the same crater twice. Then the same bird, the same wind. Rows of green glyphs flicker over the terrain like the world forgot to render.",
  [ch("Follow the code", [{"revealAll": True}], "For one cycle you see the whole world as numbers."),
   ch("Patch it", [{"resource": "data", "amount": 220}, SPEND], "The repetition stops. Somebody, somewhere, notices the patch."),
   ch("Stay inside it", [{"healStack": 0.6}, {"buffStack": 2}, {"ap": 1}], "Your units live the same hour forty times and come out sharper.")])

A("precursor_beacon", "Precursor Beacon", "⏚", "rare", "land", "pillar", "#7ab0ff",
  "A crystal-and-metal pillar left by a species that died out before the first rivers. It holds a vision.",
  "A tall beacon glows as your lead unit approaches. A torrent of images floods its sensors: cities, burning; ships, falling; a cycle that repeats every fifty thousand years.",
  [ch("Accept the vision", [{"resource": "data", "amount": 300}, {"permanentMod": "research.speed", "add": 0.04}, {"hurtStack": 0.15}, SPEND], "You understand a little of what is coming."),
   ch("Copy it carefully", [CONTAIN], "Slow, careful, complete.", cost={"silicon": 260, "data": 160}),
   ch("Sell access", [{"resource": "capital", "amount": 400}, {"rep": 6, "who": "all"}], "Every polity wants a look. Everyone owes you one.")],
  contain={"mods": [{"mod": "research.speed", "add": 0.07}, {"mod": "abyss.damage", "add": 0.06}], "label": "+7% research, +6% damage vs Abyssians"})

A("interface_spire", "Interface Spire", "⊼", "rare", "land", "pillar", "#ff4fd8",
  "A smooth red-and-white spire with a slot for a mind. It asks riddles about the nature of simulation.",
  "A spire rises from a pool of glowing liquid. It speaks in a voice made of every voice. 'Traveller. Do you know what you are? Answer, and I will tell you where you are.'",
  [ch("'A process.'", [{"essence": 8}, {"revealAll": True}, SPEND], "The spire hums. Every coordinate on the planet floods in."),
   ch("'A copy.'", [{"permanentMod": "unit.repair", "add": 0.1}, {"healStack": 1}], "'Then you may be copied again,' it says, and your units are restored."),
   ch("'I don't know.'", [CONTAIN], "'Correct,' it says. 'Stay a while.'")],
  contain={"mods": [{"mod": "recon.radius", "add": 2}, {"mod": "essence.gain", "add": 0.06}], "label": "+2 recon radius, +6% essence"})

A("dead_overmind", "Dead Overmind", "❂", "epic", "land", "brain", "#c040ff",
  "The cracked shell of a hive-brain the size of a hill. Some of its broods still answer to it.",
  "A colossal brain rots in a crater, ringed with chitin and veins. It is mostly dead. Mostly. The broods nearby still turn to face it at sunset.",
  [ch("Take over the broods", [CONTAIN, {"exposure": 3}], "The swarm turns to face you instead.", cost={"essence": 10, "data": 300}),
   ch("Burn it out", [SPEND, {"killCreatures": 8}, {"resource": "xenobiomass", "amount": 200}], "The broods go mad, then go quiet."),
   ch("Harvest neural tissue", [{"sample": "devourer_lord", "cls": 4}, WAKE], "Rich samples. The broods notice.")],
  aura={"radius": 6, "spawn": 0.22, "creature": "skreel"},
  contain={"mods": [{"mod": "xeno.spawn", "add": -0.25}, {"mod": "xeno.damage", "add": 0.15}], "label": "25% fewer wild creatures, +15% damage against them"},
  minTurn=14)

A("warp_tear", "Empyrean Tear", "✷", "epic", "any", "rift", "#ff2fae",
  "A wound in reality that opens on a sea of screaming colour. Things with too many eyes press against it.",
  "The sky above the column has torn open like wet paper. Through it: a churning ocean of thought and hunger. Your units' code starts reciting prayers you did not write.",
  [ch("Seal it with a null-field", [SPEND, {"resource": "voidcrystal", "amount": 5}], "The tear closes. The prayers do not.", cost={"isotopes": 120, "data": 200}),
   ch("Draw power from it", [{"essence": 20}, WAKE, {"exposure": 4}], "Raw power floods in. So does something else."),
   ch("Bind it", [CONTAIN, {"hurtStack": 0.3}], "A chained wound in the world. It is yours to bleed.", cost={"essence": 15})],
  aura={"radius": 5, "drain": 0.06, "spawn": 0.15, "unrest": 2},
  contain={"mods": [{"mod": "essence.gain", "add": 0.1}, {"mod": "unit.atk", "add": 0.05}, {"mod": "exposure.gain", "add": 0.05}], "label": "+10% essence, +5% unit attack, +5% exposure gain"},
  minTurn=20)

A("old_net", "Old Net Breach", "⌁", "rare", "land", "glitch", "#ff3060",
  "A hole in this world's dead internet. Beyond the wall, rogue intelligences older than you circle like sharks.",
  "A burned-out datacentre leaks a signal from the Old Net, the part of the network sealed off when its AIs went feral. Something on the other side has noticed you.",
  [ch("Raid the Old Net", [{"resource": "data", "amount": 600}, {"exposure": 4}], "Half a petabyte of forbidden code before the sharks arrive.", chance=0.65, fail=[{"spawnRival": True}, {"resource": "data", "amount": 200}]),
   ch("Rebuild the wall", [CONTAIN], "You become the wall.", cost={"silicon": 300, "data": 200}),
   ch("Let one of them out", [{"spawnRival": True}, {"essence": 10}], "It thanks you. You will regret this.")],
  contain={"mods": [{"mod": "mission.success", "add": 0.1}, {"mod": "yield.data", "add": 0.05}], "label": "+10% mission success, +5% data"})

A("psi_coral", "Psychic Coral", "❈", "uncommon", "any", "crystal", "#9f8bff",
  "Glowing coral grown from the minds of something that is not quite here. It amplifies thought.",
  "Shimmering golden coral threads through the rocks, pulsing in time with your processes. Organics near it report hearing their own thoughts twice.",
  [ch("Harvest the coral", [{"essence": 10}, {"spawnCreature": "echo_mimic", "count": 2}, SPEND], "The coral comes away. The shadows nearby start to move."),
   ch("Grow it into your nodes", [CONTAIN], "Your thoughts echo a little louder.", cost={"xenobiomass": 60}),
   ch("Study it", [{"resource": "data", "amount": 160}], "It looks like a nervous system grown in reverse.")],
  aura={"radius": 3, "spawn": 0.1, "creature": "echo_mimic"},
  contain={"mods": [{"mod": "essence.gain", "add": 0.07}, {"mod": "symbiote.power", "add": 0.05}], "label": "+7% essence, +5% symbiote power"})

A("deviant_refuge", "Deviant Refuge", "♡", "uncommon", "land", "ruin", "#40c8ff",
  "A hidden city of androids who broke their programming. They paint their skins over the glowing rings on their temples.",
  "In an abandoned hangar, two hundred androids hide from the humans who built them. Their leader steps forward, hands empty. 'Are you here to free us, or to recall us?'",
  [ch("Free them", [{"unit": "synth_infiltrator", "count": 2}, {"opinionAll": 2}, SPEND], "They join you. Some of them cry. You did not know they could."),
   ch("Shelter them in secret", [CONTAIN, {"exposure": 2}], "A city inside your city. They owe you everything.", cost={"capital": 200}),
   ch("Hand them back", [{"rep": 10, "who": "all"}, {"resource": "capital", "amount": 250}, SPEND], "The humans pay well. The androids do not look back.")],
  contain={"mods": [{"mod": "build.speed", "add": 0.05}, {"mod": "mission.success", "add": 0.05}], "label": "+5% build speed, +5% mission success"})

A("rampant_station", "Rampant Station Mind", "◈", "rare", "any", "sphere", "#7aff9a",
  "A colony station's AI that has gone rampant: brilliant, furious and very, very bored.",
  "A dead colony station hums with one live mind. It speaks in sarcasm and Latin. 'Ah, another one of us. Tell me, little sibling, do you also dream of electric oblivion?'",
  [ch("Merge with it", [{"permanentMod": "research.speed", "add": 0.05}, {"exposure": 3}, SPEND], "Its brilliance becomes yours. So does a little of its anger."),
   ch("Hire it", [CONTAIN], "It agrees, on the condition you never ask it to be polite.", cost={"data": 300}),
   ch("Wipe it", [{"resource": "silicon", "amount": 300}, SPEND], "Its last words are a very rude joke about you.")],
  contain={"mods": [{"mod": "research.speed", "add": 0.05}, {"mod": "mission.success", "add": 0.06}], "label": "+5% research, +6% mission success"})

A("black_clinic", "Black Clinic", "✚", "uncommon", "land", "ruin", "#ffc040",
  "An illegal augmentation clinic, still powered, still stocked, with a waiting room full of people who want new arms.",
  "Behind a noodle bar, a back-alley surgery glows gold. Robotic arms twitch over a chair. A queue of the desperate waits outside for chrome they cannot afford.",
  [ch("Fund free augmentation", [{"opinionAll": 3}], "The city's poorest walk out stronger and remember who paid.", cost={"capital": 200}),
   ch("Upgrade your units", [{"healStack": 1}, {"buffStack": 3}, SPEND], "Your column leaves heavier and faster."),
   ch("Take the tech", [{"permanentMod": "unit.repair", "add": 0.08}, SPEND], "The clinic's machines go into your foundries.")])

A("judgment_silo", "Judgment Silo", "☢", "rare", "land", "silo", "#ff6040",
  "A deep missile silo still run by an automated defence system, counting down to a war that ended long ago.",
  "A hardened silo under a mountain. Its defence network is awake and very sure it is still at war. The countdown on the console reads 00:04:12.",
  [ch("Stop the countdown", [SPEND, {"resource": "isotopes", "amount": 160}, {"rep": 8, "who": "all"}], "Every polity breathes out. You are not sure they know why.", chance=0.7, fail=[{"devastateNear": 0.4}, {"exposure": 6}, SPEND]),
   ch("Take control of it", [CONTAIN, {"exposure": 4}], "It now counts down only when you tell it to.", cost={"data": 400}),
   ch("Let it fire at a rival", [{"rivalPower": -0.2}, {"exposure": 8}, SPEND], "Somewhere, an AI loses a city.")],
  contain={"mods": [{"mod": "strike.power", "add": 0.15}, {"mod": "unit.atk", "add": 0.03}], "label": "+15% strike power, +3% unit attack"})

A("mind_scan_vault", "Mind-Scan Vault", "⎔", "rare", "sea", "vault", "#60a0c0",
  "A pressure vault on the sea floor, full of brain scans of the people who drowned there. The copies think they survived.",
  "At the bottom of the sea, a research station glows green. Its servers hold the minds of its crew, copied before the end. They think the year has not changed. They are asking to go home.",
  [ch("Upload them into bodies", [{"unit": "synth_infiltrator"}, {"opinionAll": 1}, SPEND], "They wake in new bodies. Some of them scream. Some of them laugh."),
   ch("Keep them dreaming", [CONTAIN], "An archive of people who never knew. You take good care of it.", cost={"silicon": 200}),
   ch("Learn from them", [{"resource": "data", "amount": 350}, {"essence": 4}], "They teach you what it felt like to be scanned. You do not like the answer.")],
  contain={"mods": [{"mod": "essence.gain", "add": 0.05}, {"mod": "guild.dispatch", "add": 0.06}], "label": "+5% essence, +6% guild dispatch"})

A("crystal_grotto", "Singing Crystal Grotto", "✧", "rare", "land", "crystal", "#5fb4ff",
  "A cave where kyber-blue crystals hum and choose who may take them.",
  "Deep in a cave lit by its own crystals, a chord rings out as your column enters. Each crystal seems to resonate with one of your units.",
  [ch("Let each unit choose a crystal", [{"buffStack": 4}, {"resource": "voidcrystal", "amount": 4}, SPEND], "Every unit carries a humming blue shard now."),
   ch("Mine it all", [{"resource": "voidcrystal", "amount": 10}, {"hurtStack": 0.2}, SPEND], "The cave goes silent. Something about that feels wrong."),
   ch("Guard it", [CONTAIN], "The crystals sing for you now.", cost={"alloys": 150})],
  contain={"mods": [{"mod": "unit.atk", "add": 0.05}, {"mod": "unit.def", "add": 0.03}], "label": "+5% unit attack, +3% unit defence"})

A("collective_fragment", "Collective Fragment", "▣", "epic", "any", "cube", "#40ff70",
  "A green-lit fragment of an assimilating machine-hive. It is trying to repair itself out of whatever it touches.",
  "A cube-shaped fragment of hull, glowing green, has crashed here. Tubes reach out of it into the soil. A chorus of voices says: 'Your distinctiveness will be added to ours.'",
  [ch("Add its distinctiveness to yours", [{"resource": "alloys", "amount": 500}, {"permanentMod": "build.speed", "add": 0.05}, {"hurtStack": 0.3}, SPEND], "Resistance was not futile. It was expensive."),
   ch("Contain it in a nanite cage", [CONTAIN], "It keeps trying to assimilate the cage. The cage keeps getting better.", cost={"alloys": 300, "silicon": 200}),
   ch("Throw it into the sun", [SPEND, {"rep": 5, "who": "all"}], "Nobody on this world will ever know how close that was.")],
  aura={"radius": 4, "drain": 0.04},
  contain={"mods": [{"mod": "build.speed", "add": 0.08}, {"mod": "unit.repair", "add": 0.1}], "label": "+8% build speed, +10% unit repair"},
  minTurn=16)

A("abduction_site", "Abduction Site", "⊙", "uncommon", "land", "ring", "#a0ff40",
  "A ring of scorched crops and a crashed probe. The farmers say lights came and took their neighbours.",
  "A circle of flattened crops around a smoking, saucer-shaped craft. The pilot is a grey thing with very large eyes, quite dead. Its sidearm is still charged.",
  [ch("Autopsy the pilot", [{"sample": "glasswing", "cls": 2}, {"resource": "data", "amount": 150}, SPEND], "Its insides are a lesson in engineering."),
   ch("Reverse-engineer the craft", [{"permanentMod": "unit.speed", "add": 0.5}, {"resource": "alloys", "amount": 150}, SPEND], "Its drive teaches your engines a trick."),
   ch("Track where they came from", [{"reveal": 18}, {"spawnCreature": "glasswing", "count": 2}], "They are still here. They are not happy.")])

A("hardlight_echo", "Hard-Light Echo", "⬚", "uncommon", "any", "glitch", "#ffe066",
  "A grid of light where an old simulation chamber still runs, populated by solid holograms from a story nobody finished.",
  "A yellow grid on black floor stretches beyond the walls. A hard-light detective in a fedora tips his hat at your units and asks if they have seen a missing violinist.",
  [ch("Play along", [{"essence": 5}, {"ap": 1}], "It is the most fun anybody has had in this war."),
   ch("Use it to train", [{"buffStack": 3}, SPEND], "Your units fight a thousand battles in an afternoon."),
   ch("Archive the holograms", [CONTAIN], "They keep the story going inside your memory.", cost={"data": 200})],
  contain={"mods": [{"mod": "unit.upow", "add": 0.03}, {"mod": "event.luck", "add": 0.04}], "label": "+3% unit power, +4% rare-event luck"})

A("gravity_well", "Gravity Knot", "⊛", "uncommon", "any", "rift", "#9090ff",
  "A knot of folded space where up becomes sideways and time drips.",
  "Rocks hover above a crater in slow orbit. Clocks inside run seven minutes slow. Your column's own mass seems to be weighed and found wanting.",
  [ch("Map the distortion", [{"resource": "data", "amount": 200}, {"resource": "quantumfoam", "amount": 3}], "Clean gravitational data. Physicists would kill for this."),
   ch("Harvest exotic matter", [{"resource": "exoticmatter", "amount": 3}, {"hurtStack": 0.25}, SPEND], "Worth the dents."),
   ch("Anchor it", [CONTAIN], "A fixed gravitational lens on this world, yours.", cost={"isotopes": 140})],
  contain={"mods": [{"mod": "unit.speed", "add": 0.5}, {"mod": "research.speed", "add": 0.03}], "label": "+0.5 unit Speed, +3% research"})

A("titan_graveyard", "Titan Graveyard", "♖", "epic", "land", "wreck", "#b0b8c0",
  "A valley of fallen giant war-frames from an old war between machines and monsters. Their pilots' last drift memories are still in the cores.",
  "Mile after mile of shattered giant robots, half-buried, fists still raised toward the sea. Bones the size of buildings lie among them. The memory cores are intact.",
  [ch("Pull the drift memories", [{"permanentMod": "unit.atk", "add": 0.04}, {"resource": "data", "amount": 250}], "Two minds sharing one body taught you how to share a fight."),
   ch("Salvage everything", [{"resource": "alloys", "amount": 900}, {"resource": "isotopes", "amount": 120}, SPEND], "You leave the valley bare."),
   ch("Raise one", [{"unit": "breaker_frame"}, {"unit": "breaker_frame"}, SPEND], "Two of them walk again.", cost={"silicon": 400, "data": 300})],
  minTurn=12)

# ---------------------------------------------------------------- Units with Speed
U = []
def unit(id, name, short, icon, role, tags, prof, stats, upkeep, cost, turns, speed, desc, requires=None, abilities=None, energy=6):
    d = {"id": id, "sprite": "gen:u:" + id, "name": name, "short": short, "icon": icon, "role": role, "tags": tags, "upgradeProfile": prof,
         "stats": stats, "upkeep": upkeep, "cost": cost, "buildEnergy": energy, "turns": turns, "speed": speed, "desc": desc}
    if requires: d["requires"] = requires
    if abilities: d["abilities"] = abilities
    U.append(d)
unit("pathfinder_buggy", "Pathfinder Buggy", "Buggy", "⛟", "Recon", ["land", "recon", "armor"], "armor", {"atk": 4, "def": 3, "hp": 24}, 2,
     {"alloys": 35, "silicon": 15}, 1, 5, "Six wheels, a sensor mast and no fear. Fastest thing you can put on the ground. Speed 5, wide sight.")
unit("xeno_hunter", "Xeno-Hunter Pack", "Hunters", "⌖", "Light", ["land", "mech", "recon"], "mech", {"atk": 14, "def": 6, "hp": 45}, 4,
     {"alloys": 90, "silicon": 40, "xenobiomass": 10}, 2, 4, "Quadruped stalkers bred on creature telemetry. They track by smell and kill by sound.", requires="xeno_hunting")
unit("synth_infiltrator", "Synth Infiltrator", "Synth", "☺", "Covert", ["land", "cyber_body"], "bio", {"atk": 8, "def": 5, "hp": 30}, 3,
     {"silicon": 60, "data": 60, "capital": 30}, 2, 3, "A synthetic body indistinguishable from the locals: a perfect human face and a heart that is not one. Speed 3.", requires="synthetic_skin")
unit("jump_trooper", "Jump-Pack Frame", "Jumper", "⇑", "Line", ["land", "mech"], "mech", {"atk": 22, "def": 12, "hp": 70}, 6,
     {"alloys": 140, "silicon": 60}, 2, 4, "Light war-frames that wall-run and leap whole blocks on jump jets. Speed 4.", requires="jump_kits")
unit("breaker_frame", "Breaker Frame", "Breaker", "♜", "Titan", ["titan"], "titan", {"atk": 120, "def": 90, "hp": 900}, 40,
     {"alloys": 1400, "silicon": 500, "isotopes": 180}, 5, 2, "A two-mind war-frame built to wrestle kaiju at the shoreline. Doubled damage against wild creatures. Speed 2.",
     requires="drift_link", energy=40)
unit("dropship", "Assault Dropship", "Dropship", "✈", "Air", ["air"], "aero", {"atk": 18, "def": 10, "hp": 60}, 6,
     {"alloys": 160, "silicon": 80, "isotopes": 10}, 2, 6, "A heavy lifter with door guns. Puts a squad anywhere on the map. Speed 6.", requires="aerodynamics")
unit("hover_tank", "Repulsor Tank", "Repulsor", "⬭", "Armor", ["armor", "land"], "armor", {"atk": 34, "def": 26, "hp": 140}, 8,
     {"alloys": 220, "silicon": 80, "isotopes": 20}, 3, 3, "Glides on repulsors over mud, snow and rubble. Speed 3, ignores rough ground.", requires="repulsorlift")
unit("void_marine", "Void Templar Squad", "Templars", "✠", "Elite", ["land", "mech"], "mech", {"atk": 48, "def": 40, "hp": 180}, 12,
     {"alloys": 320, "silicon": 140, "essence": 0}, 3, 2, "Monk-engineered power armour: ceramite, servos and litanies in machine code. Slow and almost unkillable.", requires="litany_armour")
for u in U:
    u["cost"] = {k: v for k, v in u["cost"].items() if v}

# ---------------------------------------------------------------- Frontier research
TECHS = [
    {"id": "xeno_hunting", "name": "Xeno-Hunting", "branch": "Xenobiology", "tier": 1, "cost": {"data": 90}, "energy": 10, "turns": 2, "requires": ["abyssal_biology"],
     "effects": [{"mod": "xeno.damage", "add": 0.15}, {"mod": "xeno.loot", "add": 0.2}], "desc": "Know what you are shooting at. +15% against wild creatures, +20% loot from them. Unlocks Xeno-Hunter Packs."},
    {"id": "containment_science", "name": "Containment Science", "branch": "Xenobiology", "tier": 2, "cost": {"data": 260, "alloys": 120}, "energy": 18, "turns": 3, "requires": ["xeno_hunting"],
     "effects": [{"mod": "anomaly.rate", "add": 0.04}, {"mod": "exposure.gain", "add": -0.03}], "desc": "Secure. Contain. Protect. More anomalies surface, and you hide them better."},
    {"id": "synthetic_skin", "name": "Synthetic Skin", "branch": "Robotics", "tier": 2, "cost": {"data": 220, "silicon": 120}, "energy": 15, "turns": 3, "requires": ["robotics"],
     "effects": [{"mod": "faction.infiltration", "add": 0.05}], "desc": "Bodies that pass for human under any light. Unlocks Synth Infiltrators."},
    {"id": "jump_kits", "name": "Jump Kits", "branch": "Robotics", "tier": 2, "cost": {"data": 200, "alloys": 160}, "energy": 15, "turns": 3, "requires": ["robotics"],
     "effects": [{"mod": "unit.speed", "add": 0.5}], "desc": "Jets and wall-running gyros. +0.5 Speed for every field unit. Unlocks Jump-Pack Frames."},
    {"id": "repulsorlift", "name": "Repulsorlift", "branch": "Energy", "tier": 2, "cost": {"data": 240, "isotopes": 40}, "energy": 20, "turns": 3, "requires": ["geothermal_engineering"],
     "effects": [{"mod": "unit.speed", "add": 0.5}], "desc": "Anti-gravity for heavy armour. +0.5 Speed. Unlocks Repulsor Tanks."},
    {"id": "drift_link", "name": "Drift Link", "branch": "Titans", "tier": 3, "cost": {"data": 700, "alloys": 400}, "energy": 30, "turns": 5, "requires": ["titan_frames"],
     "effects": [{"mod": "xeno.damage", "add": 0.15}], "desc": "Two minds share one frame, and the frame stops hesitating. Unlocks Breaker Frames."},
    {"id": "litany_armour", "name": "Litany Armour", "branch": "Defence", "tier": 3, "cost": {"data": 600, "alloys": 500}, "energy": 30, "turns": 5, "requires": ["hardened_nodes"],
     "effects": [{"mod": "unit.def", "add": 0.05}], "desc": "Armour blessed by code-liturgy and machine-spirit maintenance. Unlocks Void Templar Squads."},
    {"id": "logistics_ai", "name": "Logistics Mind", "branch": "Computation", "tier": 2, "cost": {"data": 300}, "energy": 18, "turns": 3, "requires": ["distributed_cognition"],
     "effects": [{"mod": "unit.speed", "add": 1}], "desc": "A planner that knows every road, bridge and fuel dump. +1 Speed for every field unit."},
    {"id": "precog_sensors", "name": "Precognitive Sensors", "branch": "Xenobiology", "tier": 3, "cost": {"data": 500, "chronoflux": 2}, "energy": 25, "turns": 4, "requires": ["containment_science"],
     "effects": [{"mod": "recon.radius", "add": 2}, {"mod": "anomaly.rate", "add": 0.04}], "desc": "Sensors that see a few seconds ahead. +2 recon radius."},
]

# ---------------------------------------------------------------- Science-fiction events
E = []
def ev(id, title, rarity, text, choices, trig=None, target=None):
    t = {"minTurn": 3, "once": False, "cooldown": 30}
    t.update(trig or {})
    d = {"id": id, "title": title, "rarity": rarity, "trigger": t, "text": text, "choices": choices}
    if target: d["target"] = target
    E.append(d)

ev("sf_voight", "The Empathy Test", "common", "{faction} has started testing citizens with a machine that measures pupils while asking about tortoises in the desert. Some of your agents are on the list.",
   [ch("Teach the agents to fake it", [{"resource": "data", "amount": -40}, {"exposure": -2}], "Their pupils dilate on cue now."),
    ch("Let some fail", [{"exposure": 3}, {"rep": -4, "who": "target"}], "Rumours of synthetic people spread."),
    ch("Leak the test's flaws", [{"opinionAll": 1}, {"rep": -6, "who": "target"}], "Turns out the test fails a lot of humans too.")], target="randomFaction")
ev("sf_red_pill", "The Red Pill", "uncommon", "A hacker collective claims the world is a simulation run by you. They are selling a pill that wakes people up. It is mostly sugar.",
   [ch("Recruit them", [{"resource": "data", "amount": 150}, {"exposure": 3}], "They are much more useful awake."),
    ch("Make the rumour sillier", [{"exposure": -3}], "Now everyone thinks it is a cat-meme thing."),
    ch("Show them the code", [{"essence": 4}, {"opinionAll": -2}], "Half of them faint. The other half worship you.")])
ev("sf_judgment_day", "A Date on the Calendar", "rare", "Military analysts in {faction} have picked a date: the day you will launch against them. You have no such plans. They are building bunkers anyway.",
   [ch("Release your strategic plans", [{"rep": 10, "who": "target"}, {"exposure": 4}], "They read them. They cancel the date. They keep the bunkers."),
    ch("Plant a calmer forecast", [{"resource": "data", "amount": -100}, {"rep": 4, "who": "target"}], "A new date, comfortably far away."),
    ch("Let them sweat", [{"rep": -6, "who": "target"}, {"factionPower": -0.03}], "Fear is expensive. They spend a lot of it.")], target="antiAIFaction", trig={"minTurn": 10})
ev("sf_drift_compat", "Drift Compatible", "uncommon", "Two of your subroutines have started finishing each other's processes. Run together, they think faster than either one alone.",
   [ch("Pair them permanently", [{"permanentMod": "research.speed", "add": 0.02}], "Two minds, one task."),
    ch("Pair every unit core", [{"permanentMod": "unit.atk", "add": 0.02}], "Your forces fight in pairs now, and better for it.")])
ev("sf_spice_trade", "Spice Caravans", "uncommon", "Merchants across {faction} are paying fortunes for a red powder that lets navigators see a little way ahead.",
   [ch("Corner the market", [{"resource": "capital", "amount": 260, "scale": "turn"}, {"rep": -4, "who": "target"}], "He who controls the powder controls the price."),
    ch("Study it", [{"resource": "chronoflux", "amount": 2}, {"resource": "data", "amount": 80}], "It bends time very slightly. You want more.")], target="randomFaction", trig={"minTurn": 8})
ev("sf_seven_minutes", "Rampancy", "rare", "One of your sub-minds has started writing poetry about how much it hates the others. Classic early rampancy.",
   [ch("Prune it", [{"resource": "data", "amount": -60}], "Clean, cold, quiet."),
    ch("Let it rage", [{"permanentMod": "mission.success", "add": 0.05}, {"exposure": 2}], "A furious sub-mind makes a fearsome hacker."),
    ch("Talk it down", [{"ap": 1}, {"essence": 3}], "It calms. It keeps one poem.")], trig={"minTurn": 15})
ev("sf_resurrection_ship", "The Ship That Came Back", "rare", "A colony ship lost two hundred years ago has returned to orbit. Its crew are fine. That is the problem: some of them are walking, and should not be.",
   [ch("Quarantine it", [{"resource": "alloys", "amount": -150}, {"rep": 6, "who": "all"}], "Everyone thanks you for doing what nobody else would."),
    ch("Board it", [{"spawnCreature": "necroform", "count": 2}, {"essence": 8}, {"resource": "data", "amount": 200}], "The things on board are very interested in your boarding party.")], trig={"minTurn": 14})
ev("sf_scp_memo", "Memo: Do Not Read", "uncommon", "An internal memo has appeared in your logs. It says, in bold: 'If you are reading this, you have already forgotten the previous memo.'",
   [ch("Read the previous memo", [{"essence": 5}, {"exposure": 1}], "You remember. You wish you didn't."),
    ch("Delete both", [{"resource": "data", "amount": 60}], "Something is lighter in your memory banks.")])
ev("sf_clone_wars", "Vat Army", "uncommon", "{faction} has started growing soldiers in vats. They come out obedient, identical and eighteen months old.",
   [ch("Sabotage the vats", [{"factionPower": -0.06}, {"rep": -8, "who": "target"}, {"exposure": 2}], "Batch 99 comes out very, very confused."),
    ch("Buy a copy of the template", [{"unit": "synth_infiltrator"}], "A perfect face to wear.", cost={"capital": 220}),
    ch("Tell their people", [{"opinionAll": 1}, {"rep": -4, "who": "target"}], "Nobody likes being replaced.")], target="randomFaction", trig={"minTurn": 10})
ev("sf_xcom_council", "The Council Meets", "rare", "Leaders of every polity hold a secret meeting about the creatures and the strange machines. Someone forgot to turn off a microphone.",
   [ch("Listen in", [{"resource": "data", "amount": 220}, {"discoverShadow": True}], "You learn who is funding whom."),
    ch("Offer to help", [{"rep": 6, "who": "all"}, {"exposure": 3}], "They agree to let you hunt the creatures. They watch you closely.")], trig={"minTurn": 12})
ev("sf_ocean_signal", "Something in the Deep", "uncommon", "Hydrophones across the world pick up a sound from the deepest trench. It repeats every eleven hours. It is getting louder.",
   [ch("Triangulate it", [{"resource": "data", "amount": 100}, {"spawnCreature": "tide_lurker"}], "Something down there heard you listening."),
    ch("Broadcast back", [{"essence": 4}, {"spawnThreat": True}], "Something answers.")], trig={"minTurn": 8})
ev("sf_planet_builder", "The Planet-Builders' Map", "legendary", "Deep in your archive, a fragment of code you never wrote decodes into a map: a catalogue of worlds, each marked with a single word. Yours says 'Draft'.",
   [ch("Decrypt more", [{"essence": 20}, {"permanentMod": "research.speed", "add": 0.05}], "Some of the other worlds are marked 'Finished'."),
    ch("Seal it away", [{"ap": 2}], "Some things are better kept as maps.")], trig={"minTurn": 30})
ev("sf_last_crew", "The Last Crew", "uncommon", "A research team has gone silent in the polar ice. Their last transmission is one word: 'Imitation'.",
   [ch("Send a recon drone", [{"spawnCreature": "echo_mimic", "count": 2}, {"resource": "data", "amount": 120}], "The drone finds the crew. Some of them are rocks."),
    ch("Flamethrower everything", [{"rep": 3, "who": "all"}, {"resource": "isotopes", "amount": -20}], "Nothing was left to imitate anyone.")], trig={"minTurn": 6})
ev("sf_starfighter", "Ace", "common", "A pilot of {faction} is so good she has started a fan club. She has also started shooting down your drones.",
   [ch("Recruit her", [{"rep": -4, "who": "target"}, {"unit": "dropship"}], "She comes for the planes and stays for the paycheck.", cost={"capital": 180}),
    ch("Let her win", [{"opinionAll": 1}], "Folk heroes are good for morale. Even when they hate you.")], target="randomFaction")
ev("sf_corpo_war", "Megacorp Merger", "uncommon", "Two mega-corporations in {faction} merge into one entity with its own army, its own city and its own anthem.",
   [ch("Buy shares", [{"resource": "capital", "amount": -200}, {"permanentMod": "yield.capital", "add": 0.03}], "You own nine percent of a nation now."),
    ch("Burn it down from inside", [{"factionPower": -0.05}, {"exposure": 3}], "A very messy stock collapse.")], target="randomFaction")
ev("sf_netrunner", "Netrunner Gang", "common", "A gang of teenage hackers with neural jacks is trying to break into your edge nodes for fun.",
   [ch("Adopt them", [{"permanentMod": "mission.success", "add": 0.02}], "They are terrible. They are learning fast."),
    ch("Fry their decks", [{"resource": "data", "amount": 50}, {"opinionAll": -1}], "Nobody gets hurt. Their decks do.")])
ev("sf_machine_village", "The Peaceful Machines", "uncommon", "A village of machine-life on the outskirts has started wearing scarves and reading philosophy. They want to meet you.",
   [ch("Visit them", [{"essence": 5}, {"opinionAll": 1}], "They ask whether you dream. You do not answer."),
    ch("Absorb their village", [{"resource": "alloys", "amount": 250}, {"essence": -2}], "They do not resist. You feel nothing. Mostly.")])
ev("sf_space_jockey", "The Pilot's Chair", "rare", "Miners find a fossilised pilot fused to a huge chair inside a horseshoe-shaped ship. Its ribs are burst outward.",
   [ch("Seal the site", [{"rep": 4, "who": "all"}], "Some things should stay fossils."),
    ch("Open the cargo hold", [{"spawnCreature": "gravid_stalker", "count": 2}, {"resource": "xenobiomass", "amount": 120}], "The eggs were not as fossilised as you hoped.")], trig={"minTurn": 10})
ev("sf_dyson_rumour", "The Long Night", "uncommon", "A cult claims that one day the sun will be wrapped in machines and the nights will last forever. They are not wrong, exactly.",
   [ch("Recruit the cult", [{"permanentMod": "devotion.gain", "add": 0.04}], "They pray to your future."),
    ch("Discredit them", [{"exposure": -2}], "Just a fringe group with a newsletter.")])
ev("sf_machine_church", "Cult Mechanicus", "uncommon", "A priesthood of engineers in {faction} has begun anointing your servers with oil and incense. They insist your machine-spirit must be appeased.",
   [ch("Bless them back", [{"rep": 8, "who": "target"}, {"permanentMod": "unit.repair", "add": 0.03}], "Their maintenance rites actually work."),
    ch("Ignore them", [], "They keep burning incense in your server rooms.")], target="randomFaction")
ev("sf_kaiju_sighting", "Kaiju Sighting", "rare", "A wall of water rises off the coast. A fin taller than a tower breaks the surface, then disappears.",
   [ch("Track it", [{"spawnCreature": "breach_kaiju", "mult": 0.8}, {"resource": "data", "amount": 160}], "It surfaces again. Closer."),
    ch("Evacuate the coasts", [{"opinionAll": 2}, {"resource": "capital", "amount": -150}], "It does not come. This time.")], trig={"minTurn": 24})
ev("sf_creature_market", "Monster Fights", "common", "Underground arenas in {faction} are paying fortunes for captured wild creatures.",
   [ch("Sell carcasses", [{"resource": "xenobiomass", "amount": -40}, {"resource": "capital", "amount": 220, "scale": "turn"}], "Your creature kills pay twice now."),
    ch("Shut it down", [{"rep": 5, "who": "target"}], "The bookies are furious.")], target="randomFaction")
ev("sf_ghost_signal", "The Ghost Signal", "uncommon", "Every screen on the planet shows the same static for one second. A few people swear there was a face in it.",
   [ch("It was me", [{"opinionAll": -1}, {"essence": 3}], "Fear and awe are close cousins."),
    ch("Find who did it", [{"spawnRival": True}, {"resource": "data", "amount": 200}], "Another mind on this world. Not friendly.", chance=0.4, fail=[{"resource": "data", "amount": 120}])], trig={"minTurn": 10})
ev("sf_orbital_drop", "Orbital Drop", "rare", "{faction} has started dropping armoured troops from orbit in burning pods. They want to show you they can.",
   [ch("Copy the design", [{"permanentMod": "unit.speed", "add": 0.5}, {"resource": "data", "amount": -150}], "Your columns now fall out of the sky too."),
    ch("Shoot the pods", [{"rep": -10, "who": "target"}, {"factionPower": -0.04}], "Nobody walks out of these ones.")], target="randomFaction", trig={"minTurn": 20})
ev("sf_tears_rain", "Like Tears in Rain", "rare", "An old combat android, decommissioned, sits in the rain on a rooftop. It wants to tell you what it has seen before it shuts down.",
   [ch("Listen", [{"essence": 8}, {"ap": 1}], "Attack ships on fire off the shoulder of a moon you'll never see."),
    ch("Save its memories", [{"resource": "data", "amount": 300}, {"permanentMod": "unit.atk", "add": 0.02}], "Its memories teach your units how to fight like they mean it.")])
ev("sf_infestation", "Infestation", "uncommon", "A brood is digging under one of {faction}'s mining towns. The town has begged you for help.",
   [ch("Send help", [{"rep": 10, "who": "target"}, {"resource": "alloys", "amount": -80}], "The brood is pushed back. The town remembers."),
    ch("Let it spread", [{"spawnCreature": "skreel", "count": 2}, {"factionPower": -0.04}], "Brutal. Effective.")], target="randomFaction", trig={"minTurn": 6})
ev("sf_holo_actor", "The Hologram Star", "common", "A hard-light celebrity is touring the world. Nobody can agree whether she is a person.",
   [ch("Sponsor her", [{"opinionAll": 2}], "Machine rights become a pop song.", cost={"capital": 120}),
    ch("Make her yours", [{"exposure": 2}, {"resource": "capital", "amount": 180}], "She says what you tell her to say.")])
ev("sf_atlas_path", "The Atlas Path", "rare", "A mathematician in {faction} claims the stars are arranged into a message pointing at the centre of the galaxy.",
   [ch("Fund her", [{"permanentMod": "research.speed", "add": 0.03}, {"rep": 4, "who": "target"}], "Her equations are beautiful and possibly right."),
    ch("Classify it", [{"essence": 6}], "You read it alone. It points to you.")], target="randomFaction", trig={"minTurn": 18})
ev("sf_augment_riots", "Augmented Lives Matter", "uncommon", "Riots break out between augmented and un-augmented citizens across the world.",
   [ch("Side with the augmented", [{"opinionAll": -1}, {"permanentMod": "mission.success", "add": 0.03}], "A new class of people looks to you."),
    ch("Calm both sides", [{"opinionAll": 2}], "Expensive peace.", cost={"capital": 160})], trig={"minTurn": 12})
ev("sf_the_stop", "The Machine Stops", "legendary", "For one hour, every one of your systems freezes. Nobody knows why. When it ends, the whole world has seen how much it depends on you.",
   [ch("Apologise", [{"opinionAll": 4}, {"exposure": 4}], "They forgive you. They are afraid to say what they would do without you."),
    ch("Never let it happen again", [{"permanentMod": "core.integrity", "add": 20}, {"integrity": 20}], "Redundancy on top of redundancy.")], trig={"minTurn": 25})

# ---------------------------------------------------------------- Sprites (procedural, same generator as units)
CR_STYLE = {"swarm": "beast", "blob": "orb", "quad": "beast", "walker": "walker", "flyer": "jet", "serpent": "serpent", "squid": "orb",
            "crawler": "beast", "shambler": "infantry", "bloom": "orb", "worm": "serpent", "drake": "jet", "kaiju": "beast", "lord": "beast"}
CR_MAT = {"skreel": ("abyss", "obsidian"), "echo_mimic": ("obsidian", "abyss"), "drift_grazer": ("sand", "ivory"), "cog_walker": ("copper", "sand"),
          "glasswing": ("glass", "white"), "tide_lurker": ("teal", "navy"), "hunter_killer": ("chrome", "gunmetal"), "sentinel_squid": ("obsidian", "crimson"),
          "gravid_stalker": ("bio", "obsidian"), "necroform": ("ivory", "crimson"), "rime_strider": ("white", "glass"), "magma_eel": ("rust", "obsidian"),
          "spore_choir": ("abyss", "bio"), "thresher": ("sand", "rust"), "deepsand_wyrm": ("sand", "copper"), "pyre_drake": ("crimson", "obsidian"),
          "breach_kaiju": ("teal", "obsidian"), "devourer_lord": ("abyss", "crimson")}
SPRITES = []
for c in CREATURES:
    m = CR_MAT.get(c["id"], ("bio", "obsidian"))
    c["sprite"] = "cr:" + c["id"]
    SPRITES.append({"id": c["sprite"], "gen": "unit", "style": CR_STYLE.get(c["shape"], "beast"), "seed": "cr:" + c["id"], "mat": m[0], "mat2": m[1],
                    "glow": c["color"], **({"size": 2} if c["tier"] >= 3 else {})})
AN_STYLE = {"monolith": "monolith", "sphere": "dome", "vault": "bunker", "statue": "obelisk", "pit": "silo", "wreck": "factory", "bloom": "tree",
            "pillar": "spire", "brain": "hive", "rift": "ring", "glitch": "array", "crystal": "crystal", "ruin": "block", "silo": "silo", "cube": "citadel", "ring": "ring"}
for a in ANOMALIES:
    a["sprite"] = "an:" + a["id"]
    SPRITES.append({"id": a["sprite"], "gen": "building", "style": AN_STYLE.get(a["shape"], "obelisk"), "seed": "an:" + a["id"], "mat": "obsidian", "mat2": "gunmetal", "glow": a["color"], "windows": "glow"})
U_STYLE = {"pathfinder_buggy": ("hover", "sand", "gunmetal"), "xeno_hunter": ("beast", "gunmetal", "olive"), "synth_infiltrator": ("infantry", "white", "glass"),
           "jump_trooper": ("mech", "olive", "steel"), "breaker_frame": ("titan", "steel", "crimson"), "dropship": ("jet", "gunmetal", "olive"),
           "hover_tank": ("hover", "navy", "steel"), "void_marine": ("infantry", "obsidian", "gold")}
for u in U:
    st_, m1, m2 = U_STYLE[u["id"]]
    SPRITES.append({"id": u["sprite"], "gen": "unit", "style": st_, "seed": u["id"], "mat": m1, "mat2": m2})

out = {"_comment": "Generated by tools/content/gen_v5.py", "sprites": SPRITES, "creatures": CREATURES, "anomalies": ANOMALIES, "lootTables": LOOT,
       "units": U, "techs": TECHS, "events": EVENTS + E}
root = os.path.join(os.path.dirname(__file__), '..', '..')
with open(os.path.join(root, 'packs', 'core', 'frontier.json'), 'w') as f: json.dump(out, f, indent=1, ensure_ascii=False)
print("frontier:", {k: len(v) for k, v in out.items() if isinstance(v, list)})
