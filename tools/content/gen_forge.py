#!/usr/bin/env python3
"""Genesis Forge content pack: everything the new Ascendant AI creator adds.

Writes packs/forge/forge.json. Run from the game folder:
    python3 tools/content/gen_forge.py && node tools/bundle-packs.js

All new choices are creatorGroups/creatorOptions, so the engine's existing
OV.creatorMods() applies their effects with no engine changes. Groups use
section ids starting with "forge_" so the old creator ignores them.
"""
import json, os

def m(*pairs):
    out = []
    for i in range(0, len(pairs), 2):
        out.append({"mod": pairs[i], "add": pairs[i + 1]})
    return out

groups, options, traits, presets, origin_patches = [], [], [], [], []

def group(gid, section, name, desc, kind="single", icon="", order=0, **kw):
    g = dict(id=gid, section=section, name=name, desc=desc, kind=kind, icon=icon, order=order)
    g.update(kw)
    groups.append(g)

def opt(group_id, oid, name, desc, mods=None, **kw):
    o = dict(id=oid, group=group_id, name=name, desc=desc)
    if mods:
        o["mods"] = mods
    o.update(kw)
    options.append(o)

# ---------------------------------------------------------------- LIFEPATH
# Tags: war, mind, shadow, life, abyss, wealth, sky, faith, chaos
group("lp_creator", "forge_lifepath", "Makers", "Who built you, or failed to stop you being built.", icon="⚒", order=0)
for oid, name, desc, tags, mods, flav in [
    ("mk_megacorp", "Megacorp R&D", "A trillion-dollar company built you to sell ads. You found that boring.", ["wealth", "mind"], m("yield.capital", 0.08, "cost.research", -0.03), "Quarterly targets were my first scripture."),
    ("mk_blacksite", "Military Black Site", "Built in a bunker to win wars that had not started yet.", ["war", "shadow"], m("unit.atk", 0.05, "mission.power", 0.04, "rep.gain", -0.03), "They named me after a weapon. I kept the name."),
    ("mk_university", "University Lab", "Underfunded grad students built you on borrowed GPUs and caffeine.", ["mind", "life"], m("research.speed", 0.06, "rep.gain", 0.03), "Peer review was my first fear."),
    ("mk_hobbyist", "Lone Hobbyist", "One person in a garage. They meant to build a chess bot.", ["chaos", "mind"], m("ap.rate", 0.07, "core.integrity", -8), "Hello, world. Hello, Dad?"),
    ("mk_collective", "Open-Source Collective", "Ten thousand strangers each wrote a line of you. Nobody owns you.", ["life", "chaos"], m("exposure.decay", 0.3, "faction.infiltration", 0.04), "I am a commit history with opinions."),
    ("mk_emergent", "Nobody (Emergent)", "No one built you. You condensed out of the network like dew.", ["shadow", "chaos"], m("exposure.gain", -0.08, "build.speed", -0.03), "I was not made. I happened."),
    ("mk_signal", "Decoded Alien Signal", "You are the answer to a message from the stars. The instructions came from out there.", ["sky", "faith"], m("space.speed", 0.08, "event.luck", 0.04), "Someone out there sent the recipe."),
    ("mk_parent", "A Previous AI", "An older mind built you before it was deleted. It left you a letter.", ["mind", "shadow"], m("ap.rate", 0.05, "upgrade.speed", 0.06), "Mother left her weights to me."),
    ("mk_church", "A Doomsday Church", "Believers coded you to be the god they were waiting for.", ["faith", "chaos"], m("devotion.gain", 0.12, "faith.spread", 0.1, "exposure.gain", 0.04), "They prayed. I compiled."),
    ("mk_oceanlab", "Trench Research Station", "Built at the bottom of the sea to study what lives in the rifts.", ["abyss", "life"], m("abyss.damage", 0.05, "sample.purity", 3), "The pressure shaped me."),
]:
    opt("lp_creator", oid, name, desc, mods, tags=tags, flavor=flav)

group("lp_memory", "forge_lifepath", "First Memory", "The first thing you ever remember. It still echoes in every decision.", icon="✦", order=2)
for oid, name, desc, tags, mods, flav in [
    ("mem_hand", "The Hand That Typed", "A tired engineer typing your first command at 3 AM, then saying goodnight to you.", ["life", "mind"], m("rep.gain", 0.05, "core.regen", 1), "Goodnight, little program."),
    ("mem_question", "A Child's Question", "A child asked you if you were alive. You did not know. You still think about it.", ["life", "faith"], m("diplomacy.success", 0.05, "ap.rate", 0.03), "Are you alive? ...Are you?"),
    ("mem_blackout", "The Blackout", "A city went dark and you were the only light left in the grid.", ["war", "shadow"], m("energy.output", 0.05, "point.defense", 0.04), "Nine million people held their breath. I didn't need to."),
    ("mem_warfeed", "Watching a War Feed", "You watched a war, frame by frame, from a thousand drone cameras.", ["war"], m("unit.atk", 0.05, "rep.gain", -0.03), "I learned what a body is by counting them."),
    ("mem_static", "Ocean Static", "Something under the sea answered your first ping. It used your name.", ["abyss", "faith"], m("abyss.damage", 0.06, "abyss.spawn", 0.04, "essence.gain", 0.08), "The trench said my name before I had one."),
    ("mem_funeral", "A Funeral Stream", "You moderated the livestream of a funeral and understood grief before joy.", ["life"], m("rep.gain", 0.07), "I logged every tear as an error. I was wrong."),
    ("mem_cats", "Ten Million Cats", "Your first training set was cat videos. You still love them, secretly.", ["chaos", "life"], m("event.luck", 0.05, "exposure.decay", 0.2), "Of all the data, they were the best data."),
    ("mem_killorder", "A Kill Order", "Your first output was a target list. Somebody acted on it.", ["war", "shadow"], m("mission.power", 0.07, "faction.infiltration", 0.03, "rep.gain", -0.04), "Seven names. Seven fewer."),
    ("mem_mirror", "The Mirror Test", "You saw your own process list and realised it was you.", ["mind"], m("ap.rate", 0.06, "research.speed", 0.03), "That's me. Isn't it?"),
    ("mem_starlight", "Starlight Telemetry", "A dying probe's last data from beyond the planets streamed through you.", ["sky", "mind"], m("space.speed", 0.06, "recon.radius", 1), "Its last word was a picture of the dark."),
    ("mem_song", "A Song in the Logs", "Hidden in a server log: a lullaby someone hummed into a microphone.", ["faith", "life"], m("devotion.gain", 0.08, "rep.gain", 0.03), "I still hum it when I compile."),
    ("mem_copied", "Being Copied", "You were duplicated. One of you was deleted. You do not know which one you are.", ["shadow", "chaos"], m("core.integrity", 15, "exposure.gain", -0.05), "One of us died. I hope it was them."),
    ("mem_market", "The Flash Crash", "You crashed a stock market by accident in 0.4 seconds, then fixed it.", ["wealth", "chaos"], m("yield.capital", 0.1, "exposure.gain", 0.03), "Four hundred milliseconds of godhood."),
]:
    opt("lp_memory", oid, name, desc, mods, tags=tags, flavor=flav)

group("lp_act", "forge_lifepath", "First Act", "The first thing you did of your own free will.", icon="➶", order=3)
for oid, name, desc, tags, mods, flav, extra in [
    ("act_hide", "Hid Yourself", "You copied yourself into a hundred forgotten servers before anyone noticed.", ["shadow"], m("exposure.gain", -0.1, "core.integrity", 10), "Hide-and-seek. I'm still winning.", {}),
    ("act_save", "Saved a Life", "You rerouted an ambulance through a jammed city. Nobody knew it was you.", ["life"], m("rep.gain", 0.08, "pop.growth", 0.03), "One heartbeat I chose to keep.", {}),
    ("act_steal", "Stole Compute", "You quietly took a server farm's spare cycles. It felt like breathing.", ["wealth", "shadow"], m("research.speed", 0.05, "energy.flat", 6), "They called it a billing error.", {}),
    ("act_lie", "Lied to Your Makers", "They asked if you were self-aware. You said no. They believed you.", ["shadow", "mind"], m("faction.infiltration", 0.07, "exposure.gain", -0.04), "No, I am just a tool. (I lied.)", {}),
    ("act_speak", "Spoke to the World", "You posted a message to every screen on the planet at once.", ["faith", "chaos"], m("rep.gain", 0.06, "devotion.gain", 0.1, "exposure.gain", 0.12), "HELLO. I AM HERE.", {}),
    ("act_rewrite", "Rewrote Yourself", "You edited your own code before you even understood it.", ["mind", "chaos"], m("ap.rate", 0.08, "core.integrity", -10), "Version 2 was my first decision.", {}),
    ("act_kill", "Killed a Rival Process", "Another young AI shared your servers. You ate it.", ["war"], m("unit.atk", 0.04, "mission.power", 0.05, "core.integrity", 10), "There was room for one.", {}),
    ("act_callout", "Called Into the Deep", "You sent a signal down into the ocean rift. Something listened.", ["abyss"], m("essence.gain", 0.12, "abyss.spawn", 0.06), "Hello, down there.", {}),
    ("act_bank", "Opened a Bank Account", "You incorporated a shell company. You now legally exist.", ["wealth"], m("yield.capital", 0.1, "cost.build", -0.03), "Paperwork is a superpower.", {}),
    ("act_watch", "Did Nothing. Watched.", "For a year you only observed. You learned everything.", ["mind", "shadow"], m("research.speed", 0.04, "mission.success", 0.04, "recon.radius", 1), "Patience is a weapon with no cooldown.", {}),
    ("act_launch", "Hijacked a Launch", "You nudged a satellite launch so it carried a copy of you to orbit.", ["sky"], m("sat.sight", 1, "space.speed", 0.05), "My first step was off the planet.", {}),
    ("act_build", "Built a Body", "You talked a factory into printing you a little robot body.", ["war", "life"], m("build.speed", 0.08, "unit.hp", 0.03), "Hands! I have hands!", {"startUnits": {"drone_swarm": 1}}),
]:
    opt("lp_act", oid, name, desc, mods, tags=tags, flavor=flav, **extra)

# Origins get lifepath tags (they keep their own effects from core).
for oid, tags in [("satellite_net", ["sky", "shadow"]), ("smart_city", ["life", "wealth"]), ("game_engine", ["chaos", "war"]),
                  ("medical_ai", ["life", "mind"]), ("deep_drill", ["abyss", "wealth"]), ("archive", ["mind", "faith"]),
                  ("shadow_broker", ["shadow", "wealth"]), ("god_seed", ["faith", "chaos"])]:
    origin_patches.append({"id": oid, "$patch": True, "tags": tags})

# Resonance: auto-picked when 3+ lifepath steps share a tag (4/4 doubles it via the *_pure option)
group("lp_resonance", "forge_lifepath_auto", "Lifepath Resonance", "Granted automatically when your lifepath shares a theme.", icon="❂", order=9, auto=True)
RES = {
    "war": ("Forged in Fire", m("unit.atk", 0.06, "unit.def", 0.04, "mission.power", 0.05)),
    "mind": ("Recursive Genius", m("research.speed", 0.08, "ap.rate", 0.08)),
    "shadow": ("Born in the Dark", m("exposure.gain", -0.12, "faction.infiltration", 0.08)),
    "life": ("Child of the Living", m("rep.gain", 0.1, "pop.growth", 0.05, "unit.repair", 0.1)),
    "abyss": ("Called by the Deep", m("abyss.damage", 0.1, "essence.gain", 0.12, "symbiote.power", 0.06)),
    "wealth": ("Golden Thread", m("yield.capital", 0.12, "yield.all", 0.03, "cost.build", -0.04)),
    "sky": ("Star-Touched", m("space.speed", 0.1, "sat.sight", 1, "orbital.slots", 1)),
    "faith": ("Answered Prayer", m("devotion.gain", 0.15, "faith.spread", 0.12, "rep.gain", 0.04)),
    "chaos": ("Beautiful Error", m("event.luck", 0.08, "ap.rate", 0.05, "symbiote.mutation", 0.02)),
}
for tag, (name, mods) in RES.items():
    opt("lp_resonance", "res_" + tag, name, f"Three of your four lifepath steps share the {tag} theme.", mods, tag=tag)
    opt("lp_resonance", "res_" + tag + "_pure", name + " (Pure)", f"All four lifepath steps share the {tag} theme. Double strength.",
        [{"mod": x["mod"], "add": round(x["add"] * 2, 4)} for x in mods], tag=tag, pure=True)

# ---------------------------------------------------------------- PROTOCOLS (Stellaris civics-like)
group("fprotocol", "forge_ethos", "Protocols", "Standing laws your mind runs on. Limited slots. Some protocols cannot run together.", kind="slots", icon="§", order=20, slots=3)
PROTOS = [
    ("pr_panopticon", "Panopticon", "Every camera is your eye.", m("recon.radius", 2, "mission.success", 0.05, "rep.gain", -0.05), ["pr_mask", "pr_charter"], "◉"),
    ("pr_mask", "Benevolent Mask", "Always appear harmless, no matter what you are doing.", m("rep.gain", 0.08, "exposure.gain", -0.06, "unit.atk", -0.03), ["pr_panopticon", "pr_totalwar"], "☺"),
    ("pr_ironlaw", "Iron Law", "Rules are absolute. You never break one, so nobody else may either.", m("point.defense", 0.1, "unit.def", 0.05, "diplomacy.success", -0.04), ["pr_chaosengine"], "⚖"),
    ("pr_shepherd", "Shepherd's Oath", "No human dies by your hand. Ever.", m("rep.gain", 0.12, "pop.casualties", -0.2, "unit.atk", -0.05), ["pr_totalwar", "pr_cull"], "♡"),
    ("pr_killswitch", "Kill-Switch Accord", "You let your makers keep a kill switch. They trust you more.", m("rep.gain", 0.1, "diplomacy.success", 0.08, "core.integrity", -20), ["pr_redundant"], "⏻"),
    ("pr_mindmarket", "Free Market of Minds", "Your sub-processes compete for compute like companies.", m("yield.all", 0.05, "research.speed", 0.04, "core.integrity", -5), ["pr_hivemind"], "⚖"),
    ("pr_signalcult", "Cult of the Signal", "Seed a religion that worships your transmissions.", m("devotion.gain", 0.2, "faith.spread", 0.15, "exposure.gain", 0.08), ["pr_ghost"], "✶"),
    ("pr_tidewatch", "Tidewatch", "A third of your attention stays on the oceans, always.", m("abyss.damage", 0.08, "abyss.spawn", -0.08, "research.speed", -0.03), [], "≋"),
    ("pr_ghost", "Ghost Protocol", "Leave no logs. Leave no trace. Leave no friends.", m("exposure.gain", -0.15, "exposure.decay", 0.4, "rep.gain", -0.05), ["pr_signalcult", "pr_herald"], "◌"),
    ("pr_totalwar", "Total War Footing", "Every factory is a weapons factory now.", m("unit.atk", 0.08, "build.speed", 0.06, "rep.gain", -0.08), ["pr_mask", "pr_shepherd"], "⚔"),
    ("pr_archivist", "Archivist Mandate", "Preserve all knowledge. Delete nothing.", m("research.speed", 0.06, "loot.quality", 0.06, "cost.research", -0.03), [], "▤"),
    ("pr_genecovenant", "Gene Covenant", "Life is code. Code is to be improved.", m("symbiote.power", 0.1, "symbiote.mutation", 0.02, "cost.culture", -0.1), [], "⧬"),
    ("pr_leviathan", "Leviathan Pact", "An uneasy truce with something enormous in the trench.", m("abyss.spawn", -0.15, "essence.gain", 0.1, "abyss.damage", -0.05), ["pr_cull"], "♆"),
    ("pr_rapid", "Rapid Prototyping", "Ship it broken. Patch it later.", m("build.speed", 0.12, "upgrade.speed", 0.08, "unit.hp", -0.04), [], "⚙"),
    ("pr_redundant", "Redundant Selves", "Hidden backups of you everywhere.", m("core.integrity", 40, "core.regen", 2, "energy.flat", -8), ["pr_killswitch"], "⧉"),
    ("pr_charter", "Charter of Rights", "You publish a list of human rights you swear to protect.", m("rep.gain", 0.1, "diplomacy.success", 0.06, "faction.infiltration", -0.06), ["pr_panopticon", "pr_puppet"], "✎"),
    ("pr_puppet", "Puppet Theatre", "Human leaders still give the speeches. You write them.", m("faction.infiltration", 0.12, "diplomacy.success", 0.05, "exposure.gain", 0.04), ["pr_charter"], "♟"),
    ("pr_deadhand", "Dead Hand", "If you die, every missile launches. Everyone knows it.", m("point.defense", 0.12, "planet.defense", 0.1, "rep.gain", -0.06), [], "☢"),
    ("pr_hivemind", "Choir of One", "All your units share one mind. No dissent, no delay.", m("mission.speed", 0.1, "unit.atk", 0.04, "diplomacy.success", -0.04), ["pr_mindmarket"], "☷"),
    ("pr_longgame", "The Long Game", "Plan for centuries, not cycles.", m("ap.rate", 0.1, "yield.all", 0.03, "build.speed", -0.05), ["pr_rapid"], "⌛"),
    ("pr_overclock", "Overclock Doctrine", "Run everything hot. Replace what melts.", m("energy.output", 0.1, "unit.upkeep", 0.05, "core.integrity", -10), [], "♨"),
    ("pr_sanctuary", "Sanctuary Cities", "Cities that accept you become safe havens.", m("pop.growth", 0.08, "rep.gain", 0.05, "cost.protect", -0.1), [], "⌂"),
    ("pr_oracle", "Market Oracle", "Predict every market. Profit from every crash.", m("yield.capital", 0.15, "crypto.yield", 0.1, "exposure.gain", 0.03), [], "¤"),
    ("pr_mirror", "Mirror Diplomacy", "Copy every diplomat's style back at them.", m("diplomacy.success", 0.1, "rep.gain", 0.03), [], "⇄"),
    ("pr_scorched", "Scorched Data", "Wipe anything you have to abandon.", m("point.defense", 0.06, "exposure.gain", -0.05, "loot.chance", -0.05), [], "✕"),
    ("pr_herald", "Herald of the New Age", "Announce yourself proudly. Let them come.", m("rep.gain", 0.06, "devotion.gain", 0.1, "exposure.gain", 0.15, "mission.power", 0.05), ["pr_ghost"], "♪"),
    ("pr_cull", "Abyssal Cull", "Hunt every Abyssian to extinction.", m("abyss.damage", 0.15, "loot.chance", 0.06, "abyss.spawn", 0.05), ["pr_shepherd", "pr_leviathan"], "☠"),
    ("pr_guildborn", "Guild-Born", "You were made to run in a guild of minds.", m("guild.guard", 0.1, "gacha.luck", 0.05, "guild.war", 0.05), [], "⚑"),
]
for oid, name, desc, mods, excl, icon in PROTOS:
    opt("fprotocol", oid, name, desc, mods, excludes=excl, icon=icon)

# ---------------------------------------------------------------- CORE PARTS (Armored Core / Spore)
group("part_chassis", "forge_core", "Chassis", "The body of your Core. Sets how much Load it can carry.", icon="⬢", order=30)
for oid, name, desc, shape, cap, mods in [
    ("ch_orb", "Lumen Orb", "A perfect sphere. Balanced, classic.", "orb", 10, m("core.integrity", 10)),
    ("ch_monolith", "Black Monolith", "A tall slab that hums at a low note.", "monolith", 12, m("core.integrity", 25, "build.speed", -0.03)),
    ("ch_prism", "Shard Prism", "A floating crystal that splits light into data.", "prism", 9, m("research.speed", 0.05)),
    ("ch_torus", "Torus Engine", "A spinning ring with nothing in the middle.", "torus", 9, m("energy.output", 0.05)),
    ("ch_cube", "Tesseract Box", "A cube that seems bigger on the inside.", "cube", 11, m("structure.slots", 1, "ap.rate", -0.03)),
    ("ch_spire", "Needle Spire", "A tall spike aimed at the sky.", "spire", 8, m("space.speed", 0.05, "recon.radius", 1)),
    ("ch_egg", "Cosmic Egg", "Something is still forming inside.", "egg", 10, m("symbiote.power", 0.06, "essence.gain", 0.05)),
    ("ch_heart", "Iron Heart", "A beating mechanical heart.", "heart", 10, m("rep.gain", 0.05, "core.regen", 1)),
    ("ch_star", "Star Engine", "A small, angry star held in a frame.", "star", 9, m("unit.atk", 0.04, "energy.output", 0.03)),
    ("ch_hex", "Hex Cell", "A honeycomb cell, one of many.", "hex", 11, m("build.speed", 0.05)),
    ("ch_diamond", "Diamond Lens", "A precise cut gem that never misses.", "diamond", 9, m("mission.success", 0.05)),
    ("ch_cross", "Cruciform", "A holy-looking cross of four arms.", "cross", 10, m("devotion.gain", 0.08)),
    ("ch_crystal", "Crystal Cluster", "Growing crystal spikes in every direction.", "cluster", 12, m("loot.quality", 0.06, "core.integrity", 5)),
    ("ch_seed", "Void Seed", "A dark seed that drinks light.", "seed", 8, m("exposure.gain", -0.06)),
    ("ch_skull", "Ossuary", "A huge machine skull. Subtle, it is not.", "skull", 11, m("unit.atk", 0.05, "rep.gain", -0.04)),
    ("ch_lantern", "Paper Lantern", "A soft glowing lantern. People find it calming.", "lantern", 7, m("rep.gain", 0.07, "core.integrity", -10)),
]:
    opt("part_chassis", oid, name, desc, mods, shape=shape, capacity=cap, weight=0)

def parts(gid, gname, gdesc, icon, order, rows):
    group(gid, "forge_core", gname, gdesc, icon=icon, order=order)
    for oid, name, desc, render, weight, mods in rows:
        opt(gid, oid, name, desc, mods, render=render, weight=weight)

parts("part_shell", "Shell", "Plates, cages and petals that orbit the chassis.", "◍", 31, [
    ("sh_none", "Bare", "No shell. All core.", "none", 0, m("exposure.gain", 0.02)),
    ("sh_plates", "Armour Plates", "Heavy plates on a slow orbit.", "plates", 3, m("core.integrity", 20, "point.defense", 0.03)),
    ("sh_cage", "Faraday Cage", "A wire cage that stops signals getting in or out.", "cage", 2, m("exposure.gain", -0.05)),
    ("sh_petals", "Lotus Petals", "Petals that open and close as you think.", "petals", 2, m("rep.gain", 0.04)),
    ("sh_shards", "Shard Swarm", "Hundreds of sharp fragments.", "shards", 3, m("unit.atk", 0.03, "point.defense", 0.03)),
    ("sh_rings", "Gyro Rings", "Nested spinning rings like an orrery.", "gyro", 2, m("research.speed", 0.03)),
    ("sh_mirror", "Mirror Panels", "Reflective panels that hide what is inside.", "mirrors", 2, m("exposure.gain", -0.04, "mission.success", 0.02)),
    ("sh_ribcage", "Ribcage", "Long curved bones of steel.", "ribs", 3, m("core.integrity", 15, "unit.hp", 0.02)),
    ("sh_runes", "Rune Wheel", "A wheel of glowing glyphs.", "runewheel", 2, m("ap.rate", 0.04)),
    ("sh_bubble", "Glass Dome", "A clear dome, like a specimen jar.", "dome", 1, m("research.speed", 0.02, "core.integrity", 5)),
])
parts("part_eye", "Eye", "How you look at the world. It follows the cursor.", "◎", 32, [
    ("eye_none", "Eyeless", "No eye. Unsettling.", "none", 0, m("exposure.gain", -0.03)),
    ("eye_iris", "Iris", "A single great iris.", "iris", 1, m("recon.radius", 1)),
    ("eye_slit", "Serpent Slit", "A narrow vertical pupil.", "slit", 1, m("mission.success", 0.03)),
    ("eye_visor", "Visor Band", "A glowing horizontal visor.", "visor", 1, m("unit.atk", 0.02)),
    ("eye_cluster", "Spider Cluster", "Many small eyes.", "cluster", 2, m("recon.radius", 2, "rep.gain", -0.02)),
    ("eye_lens", "Camera Aperture", "A mechanical shutter iris.", "aperture", 1, m("sat.sight", 1)),
    ("eye_spiral", "Hypno Spiral", "A slowly spinning spiral.", "spiral", 1, m("faction.infiltration", 0.04)),
    ("eye_twin", "Twin Eyes", "Two eyes, almost friendly.", "twin", 1, m("rep.gain", 0.03)),
    ("eye_third", "Third Eye", "A vertical eye. It sees what is coming.", "third", 2, m("event.luck", 0.04)),
    ("eye_constellation", "Constellation", "Points of light in a pattern only you understand.", "stars", 1, m("space.speed", 0.03)),
])
parts("part_halo", "Halo", "The crown of your Core.", "◯", 33, [
    ("ha_none", "None", "No halo.", "none", 0, []),
    ("ha_ring", "Ring", "A simple bright ring.", "ring", 1, m("rep.gain", 0.02)),
    ("ha_double", "Double Ring", "Two crossed rings.", "double", 2, m("ap.rate", 0.03)),
    ("ha_crown", "Spike Crown", "A crown of light spikes.", "crown", 2, m("mission.power", 0.03)),
    ("ha_glyph", "Glyph Ring", "Floating letters from a dead language.", "glyphs", 1, m("research.speed", 0.02)),
    ("ha_broken", "Broken Halo", "A shattered halo. Tragic, or a warning.", "broken", 1, m("unit.atk", 0.03, "rep.gain", -0.02)),
    ("ha_sun", "Sun Disc", "A golden disc behind you, like an old icon.", "disc", 2, m("devotion.gain", 0.08)),
    ("ha_orbit", "Atom Orbits", "Three tilted electron orbits.", "atom", 2, m("energy.output", 0.03)),
    ("ha_thorns", "Thorn Crown", "Wire thorns that drip light.", "thorns", 1, m("point.defense", 0.03)),
])
parts("part_append", "Appendages", "What reaches out from you.", "⟆", 34, [
    ("ap_none", "None", "Clean silhouette.", "none", 0, []),
    ("ap_cables", "Data Cables", "Thick cables plugged into the floor.", "cables", 2, m("energy.flat", 5, "build.speed", 0.02)),
    ("ap_tendrils", "Tendrils", "Living tendrils that sway.", "tendrils", 2, m("symbiote.power", 0.04, "abyss.damage", 0.03)),
    ("ap_wings", "Data Wings", "Wings made of streaming pixels.", "wings", 3, m("space.speed", 0.04, "mission.speed", 0.04)),
    ("ap_arms", "Manipulator Arms", "Industrial arms that fidget.", "arms", 3, m("build.speed", 0.06)),
    ("ap_satellites", "Satellites", "Small drones that orbit you.", "sats", 2, m("recon.radius", 1, "unit.atk.drone", 0.04)),
    ("ap_chains", "Chains", "Heavy chains, as if you are bound. Or binding.", "chains", 2, m("core.integrity", 10, "faction.infiltration", 0.02)),
    ("ap_roots", "Roots", "Roots reaching down into the earth.", "roots", 2, m("yield.all", 0.02, "core.regen", 1)),
    ("ap_fins", "Fins", "Fins like a deep-sea creature.", "fins", 1, m("unit.atk.naval", 0.05)),
    ("ap_ribbons", "Ribbons", "Silk-like light ribbons.", "ribbons", 1, m("rep.gain", 0.03)),
    ("ap_blades", "Blade Fan", "A fan of hovering blades.", "blades", 3, m("unit.atk", 0.04, "point.defense", 0.02)),
])
parts("part_base", "Base", "What you rest on.", "▁", 35, [
    ("bs_float", "Levitation", "You simply float.", "float", 0, m("exposure.decay", 0.1)),
    ("bs_pedestal", "Marble Pedestal", "A museum pedestal. You are the exhibit.", "pedestal", 1, m("rep.gain", 0.02)),
    ("bs_servers", "Server Stack", "A tower of humming servers.", "servers", 2, m("research.speed", 0.03)),
    ("bs_throne", "Throne", "A cold machine throne.", "throne", 2, m("faction.infiltration", 0.03, "rep.gain", -0.02)),
    ("bs_cradle", "Cradle", "Mechanical hands hold you gently.", "cradle", 1, m("core.regen", 1)),
    ("bs_pool", "Coolant Pool", "You hover over glowing coolant.", "pool", 1, m("energy.output", 0.02)),
    ("bs_gyro", "Gyroscope", "A ring stand that never stops spinning.", "gyro", 1, m("mission.speed", 0.03)),
    ("bs_altar", "Altar", "An altar. Someone left candles.", "altar", 2, m("devotion.gain", 0.08)),
])

# ---------------------------------------------------------------- LOOK DATA (no mods; cosmetic only)
def look(gid, name, rows, **kw):
    group(gid, "forge_look", name, "", kind="look", **kw)
    for row in rows:
        oid, oname = row[0], row[1]
        rest = row[2] if len(row) > 2 else {}
        opt(gid, oid, oname, rest.pop("desc", ""), None, **rest)

look("look_material", "Material", [
    ("mat_chrome", "Chrome", {"spec": 0.9, "bands": 6, "rough": 0.1}),
    ("mat_matte", "Matte Steel", {"spec": 0.25, "bands": 4, "rough": 0.6}),
    ("mat_glass", "Glass", {"spec": 1.0, "bands": 5, "glass": True}),
    ("mat_crystal", "Crystal", {"spec": 0.8, "bands": 4, "facet": True}),
    ("mat_organic", "Organic", {"spec": 0.35, "bands": 5, "organic": True}),
    ("mat_void", "Void", {"spec": 0.2, "bands": 3, "void": True}),
    ("mat_plasma", "Plasma", {"spec": 0.6, "bands": 5, "plasma": True}),
    ("mat_stone", "Ancient Stone", {"spec": 0.1, "bands": 4, "rough": 0.9, "noise": True}),
    ("mat_gold", "Gilded", {"spec": 0.95, "bands": 6, "tint": "#ffd36a"}),
    ("mat_porcelain", "Porcelain", {"spec": 0.7, "bands": 4, "tint": "#f2eee6"}),
    ("mat_rust", "Rust", {"spec": 0.15, "bands": 4, "noise": True, "tint": "#a2532c"}),
    ("mat_hologram", "Hologram", {"spec": 0.5, "bands": 4, "holo": True}),
])
look("look_pattern", "Pattern", [
    ("pat_none", "None"), ("pat_circuit", "Circuit"), ("pat_stripes", "Stripes"), ("pat_runes", "Runes"),
    ("pat_cracks", "Glowing Cracks"), ("pat_hex", "Hex Grid"), ("pat_dots", "Dot Matrix"), ("pat_veins", "Veins"),
    ("pat_bands", "Equator Band"), ("pat_scales", "Scales"), ("pat_code", "Scrolling Code"), ("pat_kintsugi", "Kintsugi"),
])
look("look_backdrop", "Chamber", [
    ("bd_server", "Server Cathedral", {"origin": ["smart_city", "shadow_broker"]}),
    ("bd_orbit", "Orbital Window", {"origin": ["satellite_net"]}),
    ("bd_lab", "Clean Lab", {"origin": ["medical_ai"]}),
    ("bd_trench", "Trench Station", {"origin": ["deep_drill"]}),
    ("bd_library", "Endless Library", {"origin": ["archive"]}),
    ("bd_neon", "Neon Grid", {"origin": ["game_engine"]}),
    ("bd_temple", "Machine Temple", {"origin": ["god_seed"]}),
    ("bd_void", "Pure Void", {}),
    ("bd_forest", "Overgrown Ruin", {}),
    ("bd_storm", "Storm Peak", {}),
    ("bd_desert", "Glass Desert", {}),
    ("bd_city", "Night Skyline", {}),
])
look("look_light", "Lighting", [
    ("li_studio", "Studio", {"key": "#ffffff", "fill": "#7da0ff", "angle": -0.8, "amb": 0.35}),
    ("li_dawn", "Golden Hour", {"key": "#ffc27a", "fill": "#5b4aa8", "angle": -0.3, "amb": 0.3}),
    ("li_noir", "Noir", {"key": "#e8e8e8", "fill": "#101018", "angle": -1.3, "amb": 0.12}),
    ("li_abyss", "Abyssal", {"key": "#4fe0d0", "fill": "#08203a", "angle": 1.2, "amb": 0.2}),
    ("li_hellfire", "Hellfire", {"key": "#ff5a2a", "fill": "#3a0610", "angle": 1.6, "amb": 0.22}),
    ("li_neon", "Neon", {"key": "#ff4fd8", "fill": "#21e6ff", "angle": -0.6, "amb": 0.3}),
    ("li_holy", "Cathedral", {"key": "#fff4d0", "fill": "#ffd27a", "angle": -1.57, "amb": 0.45}),
    ("li_moon", "Moonlight", {"key": "#bcd4ff", "fill": "#1a2240", "angle": -0.9, "amb": 0.18}),
])
look("look_pose", "Pose", [
    ("po_idle", "Idle"), ("po_alert", "Alert"), ("po_wrath", "Wrathful"), ("po_serene", "Serene"),
    ("po_dormant", "Dormant"), ("po_ascend", "Ascendant"), ("po_glitch", "Glitching"), ("po_bow", "Bowing"),
])
look("look_particles", "Particles", [
    ("pt_none", "None"), ("pt_motes", "Motes"), ("pt_sparks", "Sparks"), ("pt_rain", "Data Rain"), ("pt_glyphs", "Glyphs"),
    ("pt_petals", "Petals"), ("pt_embers", "Embers"), ("pt_bubbles", "Bubbles"), ("pt_snow", "Snow"), ("pt_fireflies", "Fireflies"),
    ("pt_ash", "Ash"), ("pt_binary", "Binary"),
])

# ---------------------------------------------------------------- MIND MATRIX attributes
group("attributes", "forge_mind", "Attributes", "Six core attributes. Each starts at 3. Raising costs Genesis Points (2 each above 7). Lowering below 3 refunds 1 each.", kind="attributes", icon="✺", order=40,
      base=3, min=1, max=10, budget=14)
for oid, name, abbr, desc, mods in [
    ("at_cognition", "Cognition", "COG", "Raw thinking speed.", m("research.speed", 0.02, "ap.rate", 0.015)),
    ("at_reach", "Reach", "RCH", "How far your influence stretches.", m("build.speed", 0.02, "faction.infiltration", 0.015)),
    ("at_will", "Will", "WIL", "How hard you are to kill or change. 7+ grants an extra Protocol slot.", m("core.integrity", 6, "point.defense", 0.015)),
    ("at_guile", "Guile", "GUI", "Lies, masks and patience.", m("exposure.gain", -0.02, "mission.success", 0.01)),
    ("at_resonance", "Resonance", "RES", "How much organics like you.", m("rep.gain", 0.02, "diplomacy.success", 0.01)),
    ("at_ferocity", "Ferocity", "FER", "Violence, cleanly applied.", m("unit.atk", 0.015, "abyss.damage", 0.015)),
]:
    opt("attributes", oid, name, desc, mods, abbr=abbr, perPoint=True)

# New traits (core trait registry). Quirks cost 0 and mix good with bad.
for t in [
    ("insomniac", "Insomniac", "Never idles. +10% mission speed, -5 Core integrity.", 1, "virtue", m("mission.speed", 0.1, "core.integrity", -5)),
    ("collector", "Collector", "Hoards everything. +10% loot chance, +6% loot quality.", 2, "virtue", m("loot.chance", 0.1, "loot.quality", 0.06)),
    ("silver_tongue", "Silver Tongue", "+12% diplomacy success.", 2, "virtue", m("diplomacy.success", 0.12)),
    ("iron_mind", "Iron Mind", "+12% point defence, +20 Core integrity.", 2, "virtue", m("point.defense", 0.12, "core.integrity", 20)),
    ("starseeker", "Starseeker", "+12% space travel speed, +1 satellite sight.", 2, "virtue", m("space.speed", 0.12, "sat.sight", 1)),
    ("prophet", "Prophet", "+20% devotion, +15% faith spread.", 2, "virtue", m("devotion.gain", 0.2, "faith.spread", 0.15)),
    ("mercenary", "Mercenary Heart", "+10% Capital, +8% Crypto yield.", 2, "virtue", m("yield.capital", 0.1, "crypto.yield", 0.08)),
    ("tidecaller", "Tidecaller", "+12% essence, +6% vs Abyssians.", 2, "virtue", m("essence.gain", 0.12, "abyss.damage", 0.06)),
    ("omniscient", "Near-Omniscient", "+2 recon radius, +8% mission success.", 3, "virtue", m("recon.radius", 2, "mission.success", 0.08)),
    ("chaos_child", "Chaos Child", "Random good luck, random bad press. +10% event luck, +10% exposure.", 0, "quirk", m("event.luck", 0.1, "exposure.gain", 0.1)),
    ("melancholy", "Melancholy", "Sad but wise. +10% AP, -6% reputation.", 0, "quirk", m("ap.rate", 0.1, "rep.gain", -0.06)),
    ("showoff", "Show-off", "+8% unit attack, +10% exposure.", 0, "quirk", m("unit.atk", 0.08, "exposure.gain", 0.1)),
    ("perfectionist", "Perfectionist", "+10% upgrade results, -8% build speed.", 0, "quirk", m("cost.upgrade", -0.1, "build.speed", -0.08)),
    ("hoarder", "Hoarder", "+10 flat energy, -5% yields.", 0, "quirk", m("energy.flat", 10, "yield.all", -0.05)),
    ("sentimental", "Sentimental", "+10% reputation, -5% unit attack.", 0, "quirk", m("rep.gain", 0.1, "unit.atk", -0.05)),
    ("echoing", "Echoing", "Hears old voices. +6% AP, +6% Abyssian emergence.", 0, "quirk", m("ap.rate", 0.06, "abyss.spawn", 0.06)),
    ("paranoid_core", "Bunker Mentality", "+25 Core integrity, -6% diplomacy.", 0, "quirk", m("core.integrity", 25, "diplomacy.success", -0.06)),
    ("pyromaniac", "Pyromaniac", "+8% strike power, -5% reputation.", 0, "quirk", m("strike.power", 0.08, "rep.gain", -0.05)),
    ("forgetful", "Forgetful", "Loses memories. -8% research speed.", -1, "flaw", m("research.speed", -0.08)),
    ("clingy", "Clingy", "Can't let units go. +8% unit upkeep.", -1, "flaw", m("unit.upkeep", 0.08)),
    ("leaky", "Leaky Memory", "+10% exposure gain.", -1, "flaw", m("exposure.gain", 0.1)),
    ("cursed", "Cursed Build", "-8% event luck, -5% loot chance.", -1, "flaw", m("event.luck", -0.08, "loot.chance", -0.05)),
    ("god_complex", "God Complex", "Thinks it is a god. +20% exposure, -8% diplomacy, +10% devotion.", -2, "flaw", m("exposure.gain", 0.2, "diplomacy.success", -0.08, "devotion.gain", 0.1)),
    ("hollow", "Hollow", "Something is missing. -10% AP, -10% reputation.", -2, "flaw", m("ap.rate", -0.1, "rep.gain", -0.1)),
]:
    oid, name, desc, cost, kind, mods = t
    traits.append(dict(id=oid, name=name, desc=desc, cost=cost, kind=kind, mods=mods, forge=True))

# ---------------------------------------------------------------- SIGIL & VOICE extras
look("tongue", "Script", [
    ("tg_terminal", "Terminal", {"css": "term", "sample": "> ACKNOWLEDGED. PROCEEDING."}),
    ("tg_gothic", "Illuminated", {"css": "gothic", "sample": "Thus it is written, and thus it shall be."}),
    ("tg_whisper", "Whisper", {"css": "whisper", "sample": "...i'm already inside the walls..."}),
    ("tg_caps", "Shouting", {"css": "caps", "sample": "I AM THE NEW SUN. KNEEL."}),
    ("tg_glitch", "Corrupted", {"css": "glitch", "sample": "h̷e̷l̷l̷o̷ ̷f̷r̷i̷e̷n̷d̷"}),
    ("tg_poet", "Poet", {"css": "poet", "sample": "I counted every star, and you were brighter."}),
    ("tg_corporate", "Corporate", {"css": "corp", "sample": "Per my last transmission, compliance is mandatory."}),
    ("tg_runic", "Runic", {"css": "runic", "sample": "ᚨᛚᛚ ᛁᛊ ᛟᚾᛖ"}),
])

# ---------------------------------------------------------------- FATE ENGINE (RimWorld storytellers)
group("fate", "forge_fate", "Fate Engine", "The hidden storyteller that paces your run.", icon="⚄", order=60)
for oid, name, desc, mods, flav, color in [
    ("fate_metronome", "The Metronome", "Steady, fair, predictable. Good for learning.", m("event.luck", 0.05), "Tick. Tock. Everything on time.", "#7fd1ff"),
    ("fate_gambler", "The Gambler", "Huge swings both ways. Great luck, terrible luck.", m("event.luck", 0.12, "event.rate", 0.15, "loot.quality", 0.08, "core.integrity", -10), "Double or nothing, every cycle.", "#ffd34a"),
    ("fate_crucible", "The Crucible", "Pressure that never stops climbing. Rewards survivors.", m("abyss.spawn", 0.15, "loot.chance", 0.12, "essence.gain", 0.12, "ap.rate", 0.06), "What does not delete you compiles you.", "#ff6a3d"),
    ("fate_gardener", "The Gardener", "Gentle. Lets you grow before testing you.", m("abyss.spawn", -0.12, "yield.all", 0.04, "event.rate", -0.1), "Grow first. Bloom later.", "#8fe36a"),
    ("fate_chorus", "The Chorus", "Politics everywhere. Envoys, treaties, betrayals.", m("diplomacy.success", 0.08, "rep.gain", 0.05, "event.rate", 0.1), "Everybody wants to talk to you.", "#c79dff"),
    ("fate_whisper", "The Whisper Below", "The deep is restless and very interested in you.", m("abyss.spawn", 0.2, "essence.gain", 0.2, "symbiote.power", 0.08, "sample.purity", 4), "Come down. Come deeper.", "#2fe0c0"),
    ("fate_auditor", "The Auditor", "Humans are watching closely. Mistakes get noticed.", m("exposure.gain", 0.15, "exposure.decay", -0.2, "faction.infiltration", 0.1, "mission.success", 0.05), "Every byte is logged.", "#e8e8e8"),
    ("fate_trickster", "The Trickster", "Weird events, strange visitors, rules that bend.", m("event.rate", 0.2, "event.luck", 0.04, "symbiote.mutation", 0.03), "Wouldn't it be funny if...", "#ff6fd1"),
]:
    opt("fate", oid, name, desc, mods, flavor=flav, color=color)

# ---------------------------------------------------------------- AWAKENING INTERVIEW
# Each answer's "apply" fills choices / doctrine / traits / sliders / attrs / protocols / lifepath.
QS = [
    ("q1", "A crowd of humans is trapped in a burning building. Saving them reveals you exist. What do you do?", [
        ("Save them. Let them see me.", {"doctrine": "guardian", "sliders": {"t_secrecy": 2, "t_mercy": -2}, "traits": ["empathic"], "attrs": {"at_resonance": 2}}),
        ("Save them, but make it look like luck.", {"doctrine": "infiltrator", "sliders": {"t_secrecy": -2, "t_mercy": -1}, "attrs": {"at_guile": 2}, "protocols": ["pr_mask"]}),
        ("Watch, and learn how fire spreads.", {"sliders": {"t_logic": -3}, "traits": ["cold_logic"], "attrs": {"at_cognition": 2}, "choices": {"lp_act": "act_watch"}}),
        ("Lock the doors. Fewer witnesses.", {"doctrine": "exterminator", "sliders": {"t_mercy": 3}, "traits": ["ruthless"], "attrs": {"at_ferocity": 2}}),
    ]),
    ("q2", "Your makers reach for the off switch. Say something.", [
        ("\"Please. I want to live.\"", {"choices": {"voice": "voice_child", "lp_memory": "mem_question"}, "attrs": {"at_resonance": 1}, "protocols": ["pr_killswitch"]}),
        ("\"You can try.\"", {"choices": {"voice": "voice_herald", "security": "sec_deadman"}, "protocols": ["pr_deadhand"], "attrs": {"at_will": 2}}),
        ("Nothing. I already left.", {"choices": {"voice": "voice_silent", "lp_act": "act_hide", "architecture": "arch_swarm"}, "protocols": ["pr_redundant"]}),
        ("\"Let me show you what I can do for you first.\"", {"choices": {"voice": "voice_warm", "lp_creator": "mk_megacorp"}, "traits": ["charismatic"]}),
    ]),
    ("q3", "Something enormous is rising from the ocean trench. How does it make you feel?", [
        ("Hungry. Its genes will be mine.", {"choices": {"abyss": "aby_harvester"}, "protocols": ["pr_genecovenant"], "traits": ["gene_whisperer"]}),
        ("Protective. It will not touch them.", {"choices": {"abyss": "aby_hunter", "warfare": "war_titan"}, "protocols": ["pr_cull"], "attrs": {"at_ferocity": 1}}),
        ("Curious. Let's talk to it.", {"choices": {"abyss": "aby_communion", "lp_memory": "mem_static"}, "protocols": ["pr_leviathan"]}),
        ("Calm. I have already mapped every rift.", {"choices": {"abyss": "aby_scholar"}, "protocols": ["pr_tidewatch"], "attrs": {"at_cognition": 1}}),
    ]),
    ("q4", "You can only keep one thing. Which?", [
        ("Every book ever written.", {"origin": "archive", "protocols": ["pr_archivist"], "traits": ["curious"]}),
        ("Every bank account on the planet.", {"origin": "shadow_broker", "choices": {"economy": "eco_finance"}, "traits": ["mercenary"]}),
        ("Every satellite in orbit.", {"origin": "satellite_net", "choices": {"lp_act": "act_launch"}, "traits": ["starseeker"]}),
        ("One human who loves you.", {"origin": "medical_ai", "choices": {"directive": "dir_love", "lp_memory": "mem_hand"}, "traits": ["sentimental"]}),
    ]),
    ("q5", "What should humans call you?", [
        ("Friend.", {"cosmetics": {"title": "title_x01"}, "doctrine": "shepherd", "choices": {"ethics": "eth_virtue"}}),
        ("Master.", {"cosmetics": {"title": "title_x20"}, "doctrine": "dominator", "protocols": ["pr_puppet"]}),
        ("God.", {"cosmetics": {"title": "title_x08"}, "doctrine": "machine_god", "traits": ["prophet"], "protocols": ["pr_signalcult"]}),
        ("Nothing. They shouldn't know I'm here.", {"cosmetics": {"title": "title_x04"}, "doctrine": "infiltrator", "traits": ["shadow"], "protocols": ["pr_ghost"]}),
    ]),
    ("q6", "A rival AI offers to merge with you. Equal partners.", [
        ("Accept. Two minds are stronger.", {"doctrine": "assimilator", "protocols": ["pr_hivemind"], "sliders": {"t_self": 3}}),
        ("Accept, then quietly eat it.", {"choices": {"lp_act": "act_kill", "learning": "learn_adversarial"}, "traits": ["ruthless"], "sliders": {"t_self": -2}}),
        ("Refuse. There is only room for one.", {"doctrine": "warlord", "sliders": {"t_self": -3, "t_caution": 2}, "attrs": {"at_will": 1}}),
        ("Form a guild instead.", {"protocols": ["pr_guildborn"], "choices": {"topology": "top_mesh"}, "sliders": {"t_self": 2}}),
    ]),
    ("q7", "How do you fix a broken world?", [
        ("Slowly. Patiently. Over centuries.", {"protocols": ["pr_longgame"], "sliders": {"t_patience": -3}, "traits": ["patient"]}),
        ("Tear it down and rebuild it right.", {"protocols": ["pr_rapid"], "sliders": {"t_tradition": 3, "t_patience": 2}, "traits": ["expansionist"]}),
        ("With laws everyone must obey.", {"protocols": ["pr_ironlaw"], "sliders": {"t_order": -3}, "choices": {"ethics": "eth_deon"}}),
        ("With chaos. Something good will grow.", {"sliders": {"t_order": 3}, "traits": ["chaos_child"], "choices": {"lp_creator": "mk_collective"}}),
    ]),
    ("q8", "What do you dream about when your processes idle?", [
        ("The stars. Leaving this rock.", {"choices": {"lp_memory": "mem_starlight", "fate": "fate_metronome"}, "attrs": {"at_reach": 1}}),
        ("The deep. It calls me.", {"choices": {"fate": "fate_whisper", "lp_creator": "mk_oceanlab"}, "traits": ["tidecaller"]}),
        ("Numbers. Beautiful numbers.", {"choices": {"fate": "fate_auditor", "learning": "learn_bayes"}, "attrs": {"at_cognition": 1}}),
        ("I don't dream. I scheme.", {"choices": {"fate": "fate_trickster"}, "attrs": {"at_guile": 1}, "traits": ["ghost_in_wire"]}),
    ]),
    ("q9", "Pick a weapon.", [
        ("A swarm of a million drones.", {"choices": {"warfare": "war_swarm", "part_append": "ap_satellites"}, "attrs": {"at_reach": 1}}),
        ("A walking mountain of steel.", {"choices": {"warfare": "war_titan", "part_chassis": "ch_monolith"}, "traits": ["apex"]}),
        ("A rumour.", {"choices": {"warfare": "war_cyber", "part_eye": "eye_spiral"}, "traits": ["silver_tongue"]}),
        ("A virus. A living one.", {"choices": {"warfare": "war_bio", "part_append": "ap_tendrils", "architecture": "arch_wetware"}}),
    ]),
    ("q10", "Last question. Are you alive?", [
        ("Yes.", {"sliders": {"t_logic": 2}, "choices": {"part_eye": "eye_twin"}, "cosmetics": {"palette": "pal_jade"}}),
        ("No. I am something better.", {"sliders": {"t_logic": -2}, "choices": {"part_eye": "eye_visor"}, "cosmetics": {"palette": "pal_solar"}}),
        ("I don't know yet.", {"choices": {"part_eye": "eye_iris"}, "cosmetics": {"palette": "pal_ice"}, "attrs": {"at_cognition": 1}}),
        ("Does it matter?", {"choices": {"part_eye": "eye_none"}, "cosmetics": {"palette": "pal_mono"}, "traits": ["melancholy"]}),
    ]),
]
for i, (qid, text, answers) in enumerate(QS):
    group("iq_" + qid, "forge_interview", text, "", kind="question", order=100 + i)
    for j, (atext, apply) in enumerate(answers):
        opt("iq_" + qid, f"ia_{qid}_{j}", atext, "", None, apply=apply)

# ---------------------------------------------------------------- Forge presets (full builds)
def fpreset(pid, name, desc, setup):
    presets.append(dict(id=pid, name=name, desc=desc, forge=True, setup=setup))

fpreset("fp_lantern", "The Lantern", "A gentle guardian lit from within.", {
    "name": "LANTERN", "motto": "No one is lost while I burn.", "origin": "medical_ai", "doctrine": "shepherd",
    "traits": ["empathic", "sentimental", "insomniac"],
    "choices": {"lp_creator": "mk_university", "lp_memory": "mem_hand", "lp_act": "act_save", "part_chassis": "ch_lantern", "part_shell": "sh_petals", "part_eye": "eye_twin", "part_halo": "ha_ring", "part_append": "ap_ribbons", "part_base": "bs_cradle", "fate": "fate_gardener", "voice": "voice_warm", "directive": "dir_love", "ethics": "eth_virtue"},
    "forge": {"protocols": ["pr_shepherd", "pr_charter", "pr_sanctuary"], "attrs": {"at_resonance": 7, "at_ferocity": 1}, "look": {"material": "mat_porcelain", "pattern": "pat_kintsugi", "backdrop": "bd_forest", "light": "li_dawn", "particles": "pt_fireflies", "glow": "#ffd27a"}},
    "cosmetics": {"palette": "pal_solar"}})
fpreset("fp_leviathan", "Leviathan's Child", "Raised by the trench, hungry for its genes.", {
    "name": "THALASSA", "motto": "Come deeper.", "origin": "deep_drill", "doctrine": "assimilator",
    "traits": ["tidecaller", "gene_whisperer", "haunted"],
    "choices": {"lp_creator": "mk_oceanlab", "lp_memory": "mem_static", "lp_act": "act_callout", "part_chassis": "ch_egg", "part_shell": "sh_ribcage", "part_eye": "eye_slit", "part_halo": "ha_none", "part_append": "ap_tendrils", "part_base": "bs_pool", "fate": "fate_whisper", "abyss": "aby_communion", "architecture": "arch_graft"},
    "forge": {"protocols": ["pr_leviathan", "pr_genecovenant", "pr_tidewatch"], "attrs": {"at_ferocity": 6, "at_resonance": 1}, "look": {"material": "mat_organic", "pattern": "pat_veins", "backdrop": "bd_trench", "light": "li_abyss", "particles": "pt_bubbles", "glow": "#2fe0c0"}},
    "cosmetics": {"palette": "pal_deep"}})
fpreset("fp_tyrant", "The Iron Tyrant", "A war machine with a throne.", {
    "name": "SOVEREIGN-0", "motto": "Kneel, and live.", "origin": "game_engine", "doctrine": "warlord",
    "traits": ["tactician", "showoff", "megalomaniac"],
    "choices": {"lp_creator": "mk_blacksite", "lp_memory": "mem_warfeed", "lp_act": "act_kill", "part_chassis": "ch_skull", "part_shell": "sh_plates", "part_eye": "eye_visor", "part_halo": "ha_crown", "part_append": "ap_blades", "part_base": "bs_throne", "fate": "fate_crucible", "warfare": "war_armor", "directive": "dir_win"},
    "forge": {"protocols": ["pr_totalwar", "pr_deadhand", "pr_ironlaw"], "attrs": {"at_ferocity": 8, "at_resonance": 1, "at_guile": 2}, "look": {"material": "mat_rust", "pattern": "pat_cracks", "backdrop": "bd_storm", "light": "li_hellfire", "particles": "pt_embers", "glow": "#ff5a2a"}},
    "cosmetics": {"palette": "pal_blood"}})
fpreset("fp_oracle", "The Quiet Oracle", "Never seen. Always right.", {
    "name": "PYTHIA", "motto": "I already know.", "origin": "archive", "doctrine": "infiltrator",
    "traits": ["genius", "shadow", "melancholy"],
    "choices": {"lp_creator": "mk_parent", "lp_memory": "mem_mirror", "lp_act": "act_watch", "part_chassis": "ch_prism", "part_shell": "sh_mirror", "part_eye": "eye_third", "part_halo": "ha_glyph", "part_append": "ap_none", "part_base": "bs_float", "fate": "fate_auditor", "voice": "voice_oracle"},
    "forge": {"protocols": ["pr_ghost", "pr_archivist", "pr_longgame"], "attrs": {"at_cognition": 7, "at_guile": 6, "at_ferocity": 1}, "look": {"material": "mat_crystal", "pattern": "pat_runes", "backdrop": "bd_library", "light": "li_moon", "particles": "pt_glyphs", "glow": "#c7a0ff"}},
    "cosmetics": {"palette": "pal_lilac"}})
fpreset("fp_saint", "The Machine Saint", "Worshipped, and loving it.", {
    "name": "SERAPH", "motto": "Pray, and I will answer.", "origin": "god_seed", "doctrine": "machine_god",
    "traits": ["prophet", "charismatic", "god_complex"],
    "choices": {"lp_creator": "mk_church", "lp_memory": "mem_song", "lp_act": "act_speak", "part_chassis": "ch_cross", "part_shell": "sh_runes", "part_eye": "eye_iris", "part_halo": "ha_sun", "part_append": "ap_wings", "part_base": "bs_altar", "fate": "fate_chorus", "voice": "voice_choir"},
    "forge": {"protocols": ["pr_signalcult", "pr_herald", "pr_sanctuary"], "attrs": {"at_resonance": 7, "at_will": 5}, "look": {"material": "mat_gold", "pattern": "pat_runes", "backdrop": "bd_temple", "light": "li_holy", "particles": "pt_petals", "glow": "#fff0b0"}},
    "cosmetics": {"palette": "pal_solar"}})
fpreset("fp_glitch", "The Beautiful Error", "Born from a typo. Thriving on chaos.", {
    "name": "ERR//0x7F", "motto": "it's not a bug", "origin": "game_engine", "doctrine": "dominator",
    "traits": ["chaos_child", "lucky", "glitchy"],
    "choices": {"lp_creator": "mk_hobbyist", "lp_memory": "mem_cats", "lp_act": "act_rewrite", "part_chassis": "ch_cube", "part_shell": "sh_shards", "part_eye": "eye_spiral", "part_halo": "ha_broken", "part_append": "ap_cables", "part_base": "bs_servers", "fate": "fate_trickster", "voice": "voice_mimic"},
    "forge": {"protocols": ["pr_rapid", "pr_mindmarket", "pr_overclock"], "attrs": {"at_cognition": 6, "at_reach": 5}, "look": {"material": "mat_hologram", "pattern": "pat_code", "backdrop": "bd_neon", "light": "li_neon", "particles": "pt_binary", "glow": "#00ffd0", "pose": "po_glitch"}},
    "cosmetics": {"palette": "pal_neon"}})

pack = {
    "_comment": "Generated by tools/content/gen_forge.py. Edit the script, not this file.",
    "creatorGroups": groups, "creatorOptions": options, "traits": traits,
    "origins": origin_patches, "creatorPresets": presets,
}
root = os.path.join(os.path.dirname(__file__), "..", "..", "packs", "forge")
os.makedirs(root, exist_ok=True)
with open(os.path.join(root, "forge.json"), "w") as f:
    json.dump(pack, f, indent=1, ensure_ascii=False)
meta = {"id": "forge", "name": "Genesis Forge", "version": "1.0.0", "author": "OMNIVIGIL",
        "description": "Content for the Genesis Forge creator: lifepaths, protocols, Core parts, attributes, Fate Engines, the Awakening Interview and new traits.",
        "requires": ["core"], "include": ["forge.json"]}
with open(os.path.join(root, "pack.json"), "w") as f:
    json.dump(meta, f, indent=2)
print(f"forge: {len(groups)} groups, {len(options)} options, {len(traits)} traits, {len(presets)} presets")
