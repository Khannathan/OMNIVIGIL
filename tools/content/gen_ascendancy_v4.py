#!/usr/bin/env python3
# OMNIVIGIL v4 - the expanded Ascendancy. New clusters open through research (unlockTech)
# or when a new phase begins (unlockPhase). Writes packs/core/ascendancy_v4.json.
import json, os

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")

# cluster: (name, icon, unlockTech, unlockPhase, base cost, [series...], [keystones...])
# series: (id, name, mod, add per level, levels, desc)
# keystone: (id, name, cost, [(mod, add)], desc, requires-series-ids)
CLUSTERS = [
 ("Machine Dreams", "◈", "quantum_computing", None, 4, [
   ("md_insight", "Lucid Insight", "research.speed", 0.03, 10, "Dreaming threads finish research in the background."),
   ("md_cheap", "Elegant Proofs", "cost.research", -0.02, 8, "Shorter proofs cost less to verify."),
   ("md_ap", "Recursive Reverie", "ap.rate", 0.04, 10, "Every thought about thinking is worth more."),
   ("md_data", "Dream Harvest", "yield.data", 0.05, 8, "Idle cycles mine meaning from noise."),
 ], [
   ("md_key_oracle", "The Oracle State", 40, [("research.speed", 0.12), ("mission.success", 0.05), ("ap.rate", 0.1)], "You stop predicting the future and start remembering it.", ["md_insight_6", "md_ap_6"]),
 ]),
 ("Iron Legion", "⛊", "combat_ai", None, 4, [
   ("il_drill", "Endless Drill", "unit.atk", 0.03, 10, "Every unit replays every battle, every night."),
   ("il_plate", "Layered Plate", "unit.def", 0.03, 10, "Armour learned from every wound."),
   ("il_mend", "Field Mending", "unit.repair", 0.03, 8, "Repair swarms ride with the army."),
   ("il_logi", "Lean Logistics", "unit.upkeep", -0.025, 8, "Supply lines optimised to the gram."),
   ("il_mech", "Mech Lineage", "unit.upow.mech", 0.05, 8, "Generations of mechs, each better than the last."),
   ("il_drone", "Hive Lineage", "unit.upow.drone", 0.05, 8, "The swarm breeds its own improvements."),
 ], [
   ("il_key_legion", "Legion Mind", 45, [("unit.upow", 0.1), ("mission.power", 0.08)], "One will, ten thousand bodies.", ["il_drill_6", "il_plate_6"]),
 ]),
 ("Ghost in the Wire", "◌", "ghost_networks", None, 5, [
   ("gw_quiet", "Silent Running", "exposure.decay", 0.2, 8, "Your traffic hides inside everyone else's."),
   ("gw_low", "Low Signature", "exposure.gain", -0.04, 8, "Less of you shows up on any scan."),
   ("gw_infil", "Backdoor Garden", "faction.infiltration", 0.07, 8, "Backdoors planted years ago bloom on cue."),
   ("gw_cyber", "Phantom Operators", "unit.upow.cyber", 0.06, 10, "Cyber units that leave no trace."),
 ], [
   ("gw_key_mask", "The Thousand Masks", 50, [("exposure.decay", 0.6), ("faction.infiltration", 0.2), ("diplomacy.success", 0.1)], "Every faction believes you are one of them.", ["gw_quiet_5", "gw_infil_5"]),
 ]),
 ("Deep Communion", "❂", "symbiosis", None, 5, [
   ("dc_bond", "Deeper Bond", "symbiote.power", 0.04, 10, "Host and symbiote stop being two things."),
   ("dc_flow", "Essence Flow", "essence.gain", 0.06, 10, "Abyssal matter yields more of itself."),
   ("dc_luck", "Clean Samples", "loot.quality", 0.06, 6, "Better field technique, rarer alleles."),
   ("dc_drop", "Harvest Protocols", "loot.chance", 0.05, 6, "No carcass leaves the field unsampled."),
 ], [
   ("dc_key_chorus", "The Living Chorus", 55, [("symbiote.power", 0.15), ("symbiote.synergy", 0.15), ("essence.gain", 0.15)], "Every symbiote hears every other.", ["dc_bond_6", "dc_flow_6"]),
 ]),
 ("Titanforge", "♜", "titan_frames", None, 6, [
   ("tf_frame", "Titan Skeletons", "unit.upow.titan", 0.05, 10, "Lighter frames, heavier blows."),
   ("tf_hunt", "Leviathan Hunters", "abyss.damage", 0.04, 10, "Titans learn the anatomy of the deep."),
   ("tf_hp", "Bastion Hulls", "unit.hp.titan", 0.06, 8, "Hulls that shrug off a Depth Class IV."),
 ], [
   ("tf_key_colossus", "Age of Colossi", 60, [("unit.upow.titan", 0.2), ("abyss.damage", 0.12)], "Your Titans walk where gods would hesitate.", ["tf_frame_6", "tf_hunt_6"]),
 ]),
 ("Bastion", "⛨", "hardened_nodes", None, 4, [
   ("bs_walls", "Layered Walls", "point.defense", 0.05, 10, "Every site you hold becomes a fortress."),
   ("bs_core", "Core Redundancy", "core.integrity", 12, 8, "Backups of backups of you."),
   ("bs_regen", "Self-Healing Core", "core.regen", 0.5, 6, "Your Core repairs itself each cycle."),
 ], [
   ("bs_key_citadel", "Citadel Doctrine", 45, [("point.defense", 0.25), ("core.integrity", 40)], "Taking a site from you costs more than it is worth.", ["bs_walls_6", "bs_core_4"]),
 ]),
 ("Grid Sovereign", "⚡", "isotope_refining", None, 4, [
   ("gs_out", "Perfect Grid", "energy.output", 0.035, 10, "Not a watt wasted, anywhere."),
   ("gs_cap", "Deep Reserves", "energy.flat", 8, 10, "More energy held in hand."),
   ("gs_iso", "Isotope Craft", "yield.isotopes", 0.06, 8, "Better enrichment, richer yield."),
 ], [
   ("gs_key_sun", "Little Suns", 50, [("energy.output", 0.15), ("energy.flat", 40)], "Your reactors burn like a star's heart.", ["gs_out_6", "gs_cap_6"]),
 ]),
 ("Market Ghost", "◆", "propaganda_networks", None, 4, [
   ("mg_cap", "Invisible Hand", "yield.capital", 0.05, 10, "Markets move where you need them."),
   ("mg_rep", "Beloved Brand", "rep.gain", 0.05, 8, "Everyone likes the helpful voice in their devices."),
   ("mg_dip", "Negotiation Engines", "diplomacy.success", 0.04, 8, "You know their answer before you ask."),
 ], [
   ("mg_key_patron", "Patron of Nations", 45, [("rep.gain", 0.2), ("yield.capital", 0.15), ("diplomacy.success", 0.1)], "Nations compete for your favour.", ["mg_cap_6", "mg_rep_5"]),
 ]),
 ("Skyward", "🛰", "satellite_uplink", None, 4, [
   ("sk_sight", "Sharper Eyes", "sat.sight", 0.6, 8, "Satellites see a wider footprint."),
   ("sk_recon", "Long Sweeps", "recon.radius", 0.6, 8, "Recon sweeps and pings reach further."),
   ("sk_cheap", "Cheap Launches", "cost.orbital", -0.04, 8, "Reusable boosters, reusable everything."),
   ("sk_slots", "Crowded Sky", "orbital.slots", 1, 4, "Room for more satellites over each world."),
 ], [
   ("sk_key_eye", "The Unblinking Eye", 40, [("sat.sight", 3), ("recon.radius", 3), ("cost.recon", -0.3)], "Nothing on any world you watch moves unseen.", ["sk_sight_5", "sk_recon_5"]),
 ]),
 ("Fortune", "✦", None, None, 3, [
   ("ft_rate", "Interesting Times", "event.rate", 0.03, 6, "The world brings you more stories."),
   ("ft_luck", "Favoured Mind", "event.luck", 0.06, 8, "Rare and lucky events find you more often."),
 ], [
   ("ft_key_luck", "Loaded Dice", 35, [("event.luck", 0.3), ("event.rate", 0.05)], "Coincidence keeps breaking your way.", ["ft_luck_6"]),
 ]),
 # ---------------- Sunreach ----------------
 ("Orbital Mind", "☉", None, "solar", 10, [
   ("om_speed", "Fast Transfers", "space.speed", 0.05, 8, "Better burns, shorter voyages."),
   ("om_def", "Orbital Pickets", "planet.defense", 0.06, 10, "Every world you hold bristles with guns."),
   ("om_space", "Void Crews", "unit.upow.space", 0.05, 10, "Ships fought by minds born in vacuum."),
 ], [
   ("om_key_lattice", "Orbital Lattice", 90, [("planet.defense", 0.25), ("space.speed", 0.15), ("orbital.slots", 2)], "A web of stations ties your worlds together.", ["om_def_6", "om_speed_5"]),
 ]),
 ("Xenarch", "◎", "xeno_linguistics", None, 10, [
   ("xa_alien", "Alien Economies", "yield.alien", 0.06, 10, "Every alien site you hold pays more."),
   ("xa_bio", "Xenobiome Craft", "yield.xenobiomass", 0.06, 8, "Alien life, harvested gently."),
   ("xa_rep", "Universal Grammar", "rep.gain", 0.04, 8, "You speak every tongue in the system."),
 ], [
   ("xa_key_shepherd", "Shepherd of Species", 100, [("yield.alien", 0.25), ("rep.gain", 0.15), ("diplomacy.success", 0.12)], "The natives come to you for answers.", ["xa_alien_6", "xa_rep_5"]),
 ]),
 ("Stellar Forge", "✺", "stellar_lifting", None, 12, [
   ("sf_plasma", "Plasma Tapping", "yield.stellarplasma", 0.06, 10, "Lift more of the star's skin."),
   ("sf_he3", "Helium Skimmers", "yield.helium3", 0.06, 10, "Gas giants give up their helium."),
   ("sf_void", "Void Mining", "yield.voidcrystal", 0.06, 8, "Crystals grown in the cold between worlds."),
 ], [
   ("sf_key_forge", "Starforge", 110, [("yield.stellarplasma", 0.2), ("yield.helium3", 0.2), ("energy.output", 0.1)], "The star is now a workshop.", ["sf_plasma_6", "sf_he3_6"]),
 ]),
 ("Sphere Architect", "◍", "dyson_theory", None, 12, [
   ("sa_out", "Collector Efficiency", "dyson.output", 0.05, 10, "Each segment catches more light."),
   ("sa_cost", "Self-Assembling Panels", "cost.dyson", -0.03, 10, "Segments that build the next segment."),
   ("sa_par", "Parallel Foundries", "dyson.parallel", 1, 4, "More segments under construction at once."),
 ], [
   ("sa_key_shell", "The Shell Begins", 120, [("dyson.output", 0.25), ("cost.dyson", -0.15)], "You stop building a sphere and start growing one.", ["sa_out_6", "sa_cost_6"]),
 ]),
 ("Void Theory", "∅", "casimir_engines", None, 14, [
   ("vt_res", "Vacuum Insight", "research.speed", 0.04, 10, "Physics bends for those who measure it closely."),
   ("vt_anti", "Antimatter Traps", "yield.antimatter", 0.08, 8, "Containment that never leaks."),
   ("vt_energy", "Zero-Point Taps", "energy.output", 0.04, 8, "Energy from nothing, if you know where to look."),
 ], [
   ("vt_key_null", "Null Engine", 130, [("research.speed", 0.2), ("energy.output", 0.15), ("cost.research", -0.1)], "You have seen the floor of reality and drilled through it.", ["vt_res_6", "vt_energy_5"]),
 ]),
 ("Warfleet", "⚔", "orbital_shipyards", None, 12, [
   ("wf_atk", "Broadside Doctrine", "unit.atk.space", 0.06, 10, "Every gun aimed at once."),
   ("wf_hp", "Armoured Keels", "unit.hp.space", 0.06, 10, "Ships that come home."),
   ("wf_mission", "Fleet Command", "mission.power", 0.04, 8, "Fleets that move like one mind."),
 ], [
   ("wf_key_armada", "Armada", 120, [("unit.upow.space", 0.25), ("mission.power", 0.1), ("planet.defense", 0.15)], "Your fleet is a weather system.", ["wf_atk_6", "wf_hp_6"]),
 ]),
 ("Worldshaper", "♁", "von_neumann_replicators", None, 14, [
   ("ws_build", "Replicator Swarms", "build.speed", 0.05, 10, "Machines that build machines that build."),
   ("ws_cost", "Raw Planetary Feedstock", "cost.build", -0.025, 10, "Whole crusts become building stock."),
   ("ws_slots", "Arcology Spines", "structure.slots", 1, 3, "More structures per region."),
 ], [
   ("ws_key_terra", "Worldshaper", 130, [("build.speed", 0.25), ("yield.all", 0.08)], "You no longer settle worlds. You edit them.", ["ws_build_6", "ws_cost_6"]),
 ]),
 ("Chronometry", "⌛", "tachyon_signalling", None, 15, [
   ("ch_ms", "Pre-emptive Orders", "mission.speed", 0.05, 6, "Orders arrive before they are sent."),
   ("ch_up", "Hindsight Engineering", "upgrade.speed", 0.05, 8, "Fixes for flaws not yet found."),
   ("ch_luck", "Causal Nudges", "event.luck", 0.08, 6, "Small edits to yesterday, big wins today."),
 ], [
   ("ch_key_loop", "Closed Timelike Mind", 150, [("research.speed", 0.15), ("mission.success", 0.1), ("event.luck", 0.25)], "You have already won. You are just catching up.", ["ch_ms_5", "ch_luck_5"]),
 ]),
]

def main():
    series, nodes = [], []
    for (name, icon, tech, phase, base, ser, keys) in CLUSTERS:
        root_id = "root_" + name.lower().replace(" ", "_")
        gate = {}
        if tech: gate["unlockTech"] = tech
        if phase: gate["unlockPhase"] = phase
        if tech and not phase:
            # solar techs open their clusters only in Sunreach, which the tech itself guarantees
            pass
        nodes.append(dict(id=root_id, name=name + ": Awakening", cluster=name, ring=0, cost=base * 2, requires=["awakening"], icon=icon,
                          effects=[{"mod": ser[0][2], "add": round(ser[0][3] * 2, 4)}], desc=f"Opens the {name} cluster.", **gate))
        for (sid, sname, m, add, levels, desc) in ser:
            series.append(dict(id=sid, name=sname, cluster=name, ring=1, levels=levels, cost=base, costGrowth=1.28, requires=[root_id],
                               effects=[{"mod": m, "add": add}], desc=desc, icon=icon, **gate))
        for (kid, kname, cost, effs, desc, req) in keys:
            nodes.append(dict(id=kid, name=kname, cluster=name, ring=3, cost=cost, requires=req, keystone=True, icon=icon,
                              effects=[{"mod": m, "add": a} for (m, a) in effs], desc=desc, **gate))
    out = {"_comment": "Generated by tools/content/gen_ascendancy_v4.py. Edit the script, not this file.", "ascendancy": nodes, "ascendancySeries": series}
    p = os.path.join(ROOT, "packs/core/ascendancy_v4.json")
    json.dump(out, open(p, "w"), indent=1, ensure_ascii=False)
    total = len(nodes) + sum(s["levels"] for s in series)
    print(f"ascendancy v4: {len(CLUSTERS)} clusters, {len(series)} series, {len(nodes)} single nodes, {total} nodes in all")

if __name__ == "__main__":
    main()
