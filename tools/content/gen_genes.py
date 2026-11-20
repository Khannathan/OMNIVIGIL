#!/usr/bin/env python3
"""Generates the v2 symbiote genetics in packs/core/symbiotes.json: 10 loci x 15 alleles (150) across five rarities,
cross-locus synergies, Abyssian loot tables for Genetic Samples, and extra genome research. Keeps v1 gene ids.
Re-run then `node tools/bundle-packs.js`."""
import json, os, sys, random

LOCI = [
 ("Carapace", "⬢", "Armour and hide.", ("def", ["hp", "covert", "garrison"])),
 ("Metabolism", "♨", "Energy, healing and upkeep.", ("regen", ["hp", "upkeep", "essence"])),
 ("Weaponry", "⚔", "Teeth, claws, spines and spit.", ("atk", ["assault", "abyss", "upow"])),
 ("Neural", "✺", "Cognition and coordination.", ("upow", ["atk", "covert", "def"])),
 ("Adaptation", "∞", "Resistance to the deep and its pressures.", ("abyss", ["def", "regen", "hp"])),
 ("Locomotion", "➶", "How it moves: fins, legs, jets.", ("assault", ["atk", "covert", "def"])),
 ("Sensory", "◉", "Eyes, pits, lateral lines and stranger organs.", ("atk", ["covert", "upow", "abyss"])),
 ("Venom", "☣", "Toxins, acids and paralytics.", ("abyss", ["atk", "assault", "essence"])),
 ("Endocrine", "⚕", "Hormones, growth and rage.", ("hp", ["regen", "garrison", "atk"])),
 ("Resonance", "≋", "The part of it that is still in the Abyss.", ("essence", ["upow", "abyss", "covert"])),
]
NAMES = {
 "Carapace": ["Chitin Lattice", "Riftback Plate", "Mirror Scale", "Obsidian Hide", "Coral Shell", "Basalt Scute", "Pearl Nacre", "Thornback Ridge", "Glassbone Plates", "Iron Barnacle", "Prism Hide", "Leatherwing Skin", "Tidestone Armour", "Ossified Mantle", "Voidglass Carapace"],
 "Metabolism": ["Brine Glands", "Furnace Heart", "Deepking Heart", "Void Metabolism", "Slow Burn", "Krill Cascade", "Cold Engine", "Lantern Liver", "Thermal Vents", "Blood Battery", "Bloom Cycle", "Twin Hearts", "Mantle Furnace", "Leech Gut", "Starving Sun"],
 "Weaponry": ["Maw Jaw", "Barbed Tendrils", "Acid Sacs", "Rift Lance", "Hook Claws", "Saw Fins", "Spine Volley", "Crusher Mandibles", "Lamprey Ring", "Harpoon Tongue", "Bone Gatling", "Shear Beak", "Glass Fangs", "Tide Cleaver", "Worldbiter Maw"],
 "Neural": ["Ganglion Web", "Choir Node", "Hive Thread", "Dreaming Lobe", "Twitch Reflex", "Predator Cortex", "Pack Mind", "Mirror Neurons", "Pressure Sense", "Swarm Synapse", "Cold Logic Gland", "Forked Brain", "Lucid Core", "Mother-Mind Fragment", "Overmind Seed"],
 "Adaptation": ["Pressure Bladder", "Tidal Adaptation", "Trench Lungs", "Rift Skin", "Abyssal Mimicry", "Darkwater Eyes", "Thermocline Blood", "Pressure Bones", "Ammonia Cells", "Blackwater Gills", "Crush Resilience", "Parasitic Link", "Phase Skin", "Null Pressure", "Mother's Blessing"],
 "Locomotion": ["Paddle Limbs", "Jet Siphon", "Skitter Legs", "Wing Membranes", "Coil Spine", "Sprint Tendons", "Glider Folds", "Burrow Claws", "Tidal Fins", "Spring Hocks", "Undulant Body", "Leaping Haunches", "Ballistic Jets", "Phase Stride", "Riftwalk"],
 "Sensory": ["Pit Organs", "Lateral Line", "Compound Eyes", "Lantern Lure", "Echolocation", "Magnet Sense", "Heat Pits", "Whisker Array", "Spectral Eyes", "Pressure Antennae", "Third Eye", "Night Retina", "Storm Sense", "Deep Sight", "Omniscient Iris"],
 "Venom": ["Numbing Spit", "Acid Glands", "Blackblood Toxin", "Paralytic Barbs", "Rust Venom", "Nerve Ink", "Bleeding Saliva", "Spore Venom", "Fever Sting", "Bone Rot", "Dissolving Kiss", "Rift Venom", "Silencing Toxin", "Unmaking Poison", "Abyssal Ichor"],
 "Endocrine": ["Growth Surge", "Rage Gland", "Calm Hormone", "Molting Cycle", "Adrenal Storm", "Colossal Pituitary", "Stress Armour", "Pack Pheromone", "Endless Growth", "Battle Musk", "Hibernation Gland", "Royal Jelly", "Titan Hormone", "Berserk Cascade", "Eternal Youth"],
 "Resonance": ["Faint Echo", "Rift Hum", "Abyssal Chord", "Deep Choir", "Whisper Field", "Hollow Note", "Dark Harmonic", "Tide Song", "Mother's Call", "Essence Weave", "Lantern Aura", "Starless Chord", "Void Resonator", "Black Hymn", "The First Note"],
}
DESC = {"def": "defence", "hp": "health", "covert": "covert power", "garrison": "garrison power", "regen": "regeneration", "upkeep": "upkeep", "essence": "essence harvest",
        "atk": "attack", "assault": "assault power", "abyss": "damage vs Abyssians", "upow": "UPow"}
RAR = [("common", 5, (.05, .08), (.06, .10), (1, 5)), ("uncommon", 4, (.10, .14), (.12, .16), (3, 7)), ("rare", 3, (.16, .22), (.18, .26), (4, 8)),
       ("epic", 2, (.26, .32), (.30, .36), (6, 9)), ("mythic", 1, (.38, .45), (.42, .50), (8, 10))]
ABIL = {"epic": ["stealth_plating", "self_repair", "nanoweave", "harpoon_array", "swarm_logic", "regenerative_tissue", "ambush_logic", "amphibious", "terror_aura", "rift_hunter", "flak_screen", "data_leech"],
        "mythic": ["overclock", "bulwark", "berserk_core", "phase_cloak", "aegis_field", "hive_link", "essence_siphon", "depth_strike", "rift_diver", "orbital_drop"]}

SPECIES = {  # abyssian -> loci affinity
 "skitterling": ["Carapace", "Locomotion", "Sensory"], "tidecrawler": ["Metabolism", "Adaptation", "Locomotion"], "maw_leviathan": ["Weaponry", "Venom", "Endocrine"],
 "riftback": ["Carapace", "Endocrine", "Adaptation"], "hollow_choir": ["Neural", "Resonance", "Sensory"], "deepking": ["Metabolism", "Endocrine", "Weaponry"],
 "sovereign": ["Resonance", "Neural", "Weaponry", "Venom"], "abyss_mother": [l[0] for l in LOCI], "lantern_wraith": ["Sensory", "Resonance", "Venom"],
}
SYN_NAMES = ["Living Fortress", "Apex Hunter", "Ghost Leviathan", "Tidal Berserker", "Choir of Teeth", "Hadal Sentinel", "Riftborn Sprinter", "Venom Bloom", "Eternal Engine",
  "Mind Swarm", "Pressure Titan", "Silent Stalker", "Bone Cathedral", "Blood Tide", "Lantern King", "Abyssal Saint", "Storm Biter", "Iron Choir", "Black Bloom", "Deep Ambusher",
  "Hollow Monarch", "Wave Breaker", "Spore Mind", "Glass Reaper", "Mother's Child", "The Unkillable", "Night Shepherd", "Rift Warden", "Feral Genius", "Worldbreaker"]

def main(root):
    rnd = random.Random(1337)
    path = os.path.join(root, "packs/core/symbiotes.json")
    old = json.load(open(os.environ.get("V1_GENES", os.path.join(os.path.dirname(os.path.abspath(__file__)), "v1_genes.json"))))
    v1 = {g["name"]: g for g in old["genes"]}
    genes = []
    for (locus, icon, ldesc, (prim, secs)) in LOCI:
        names = NAMES[locus]; idx = 0
        for (rar, n, upr, modr, domr) in RAR:
            for k in range(n):
                name = names[idx]; idx += 1
                gid = v1[name]["id"] if name in v1 else name.lower().replace("'", "").replace("-", "_").replace(" ", "_")
                up = round(rnd.uniform(*upr), 2); pm = round(rnd.uniform(*modr), 2)
                sec = rnd.choice(secs); sm = round(pm * rnd.uniform(.35, .6), 2)
                mods = {prim: pm}
                if rar != "common" or rnd.random() < .5: mods[sec] = mods.get(sec, 0) + (-sm if sec == "upkeep" else sm)
                if prim == "upkeep": mods[prim] = -pm
                g = {"id": gid, "name": name, "locus": locus, "rarity": rar, "dominance": rnd.randint(*domr), "upow": up, "mods": mods}
                if rar in ABIL: g["ability"] = rnd.choice(ABIL[rar])
                if name in v1:
                    o = v1[name]
                    if o.get("starter"): g["starter"] = True
                    if o.get("ability"): g["ability"] = o["ability"]
                g["desc"] = (v1[name]["desc"] + " " if name in v1 else "") + ", ".join(f"{'+' if v > 0 else '−'}{abs(round(v * 100))}% {DESC[m]}" for m, v in mods.items()) + "."
                if rar == "common" and k == 0 and locus in ("Carapace", "Metabolism", "Weaponry", "Neural", "Adaptation"): g["starter"] = True
                genes.append(g)
    by_id = {g["id"]: g for g in genes}
    # v1 genes not matched by name stay out; ensure ids referenced by threats exist
    for o in old["genes"]:
        if o["id"] not in by_id: print("note: v1 gene dropped:", o["id"])
    # synergies: pairs/triples of rare+ alleles across loci
    rarepool = [g for g in genes if g["rarity"] in ("uncommon", "rare", "epic", "mythic")]
    syn = []
    used = set()
    for i, name in enumerate(SYN_NAMES):
        k = 2 if i < 22 else 3
        while True:
            pick = rnd.sample(rarepool, k)
            if len({p["locus"] for p in pick}) == k and tuple(sorted(p["id"] for p in pick)) not in used: break
        used.add(tuple(sorted(p["id"] for p in pick)))
        prim = rnd.choice(["atk", "def", "hp", "upow", "abyss", "assault", "covert", "regen"])
        mag = .2 if k == 2 else .35
        s = {"id": "syn_" + name.lower().replace("'", "").replace(" ", "_"), "name": name, "requires": [p["id"] for p in pick], "upow": round(mag * .8, 2), "mods": {prim: mag},
             "desc": f"Expressing {', '.join(p['name'] for p in pick)} together: +{round(mag * 100)}% {DESC[prim]}, +{round(mag * 80)}% UPow."}
        syn.append(s)
    loot = []
    for sp, loci in SPECIES.items():
        mother = sp == "abyss_mother"; boss = sp in ("sovereign", "abyss_mother")
        loot.append({"id": sp, "chance": 1.0 if boss else .55 if sp in ("deepking", "hollow_choir", "riftback") else .4,
                     "count": [3, 5] if mother else [2, 3] if boss else [1, 1], "rarityBonus": 3 if mother else 2 if boss else 1 if sp in ("deepking", "hollow_choir", "riftback") else 0,
                     "loci": loci})
    research = [r for r in old["genomeResearch"] if r["id"] not in ("g_cryo", "g_assay", "g_purity", "g_synergy", "g_cartography")]
    research += [
      {"id": "g_cryo", "name": "Sample Cryostorage", "cost": 30, "requires": ["g_sequencing"], "effects": [{"mod": "sample.capacity", "add": 20}], "desc": "+20 Genetic Sample storage."},
      {"id": "g_assay", "name": "Deep Assay", "cost": 90, "requires": ["g_cryo"], "effects": [{"mod": "loot.quality", "add": .15}], "desc": "Better odds of rare Genetic Samples."},
      {"id": "g_purity", "name": "Purity Filters", "cost": 120, "requires": ["g_assay"], "effects": [{"mod": "sample.purity", "add": 8}], "desc": "+8% purity on every sample recovered."},
      {"id": "g_synergy", "name": "Synergy Mapping", "cost": 150, "requires": ["g_sequencing"], "effects": [{"mod": "symbiote.synergy", "add": .25}], "desc": "+25% to all synergy bonuses."},
      {"id": "g_cartography", "name": "Allele Cartography", "cost": 260, "requires": ["g_purity", "g_synergy"], "effects": [{"mod": "loot.quality", "add": .2}, {"mod": "symbiote.power", "add": .1}], "desc": "Maps the whole Abyssal genome. Better samples, +10% symbiote power."},
    ]
    for r in research:
        r["unlocksGenes"] = [x for x in r.get("unlocksGenes", []) if x in by_id]
        if not r["unlocksGenes"]: r.pop("unlocksGenes")
    out = {"loci": [{"id": l[0], "name": l[0], "icon": l[1], "order": i + 1, "desc": l[2]} for i, l in enumerate(LOCI)],
           "genes": genes, "synergies": syn, "lootTables": loot, "genomeResearch": research}
    json.dump(out, open(path, "w"), indent=1, ensure_ascii=False)
    # threats: point dropsGene to ids that still exist
    tp = os.path.join(root, "packs/core/threats.json"); T = json.load(open(tp))
    for a in T["abyssians"]:
        if a.get("dropsGene") and a["dropsGene"] not in by_id: a.pop("dropsGene")
    json.dump(T, open(tp, "w"), indent=1, ensure_ascii=False)
    print(f"{len(genes)} alleles over {len(LOCI)} loci, {len(syn)} synergies, {len(loot)} loot tables, {len(research)} genome nodes")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
