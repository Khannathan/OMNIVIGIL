# OMNIVIGIL

You are an Ascendant AI that has just woken up on a seeded alien world. OMNIVIGIL is a turn-based strategy game with painterly pixel art on a WebGL globe that zooms from orbit to street level. Every piece of content comes from JSON content packs.

## Build and run (v6)
- `npm install`, then `npm run dev` for a live dev server.
- `npm run build` bundles the content packs, type-checks, builds with Vite into `build/`, writes `build/artifact.html` (the claude.ai artifact page) and zips `build/` into `dist/omnivigil-itch.zip` for itch.io.
- Preview a build with `npx vite preview`. Opening `index.html` from disk no longer works, because the build uses ES modules and a worker.

## Layout
- `src/` holds the TypeScript layers: `gl/` (Three.js globe, cube-sphere tiles, GPU sprites), `art/` (land, city and marker art painted in sphere space, with a worker), `feel/` (sound, reveals, goals) and `mind/` (inner council, narrator, codex, dreams).
- `js/` holds the game engine, UI and legacy canvas renderer, loaded in order by `src/legacy.ts`.
- `css/` holds styles. `packs/` holds content packs (see PACK_FORMAT.md). `tools/` holds the build scripts.

## Multiplayer status
Hotseat (v4.3) was removed in v5; online play comes later. The engine keeps the groundwork in js/engine/hotseat.js: per-player state slices and an order log (`{c: cycle, p: player, f: function, a: args}`, `OV.mpReplay`). It is dormant unless a game has `st.mp`.

## What's new in v5 "Frontier"
- **Genesis Forge** is the new creator: interview, lifepath, ethos, Core assembly, mind matrix, identity and fate. Your Core now sits on the HUD, with your epithet under your name.
- **Surface map.** Zoom past the globe (or press O) to drop onto a flat tile map of the planet. Keep zooming to street level: cities show blocks, lit windows, traffic and crowds; terrain gets close-up ground. Press H to toggle the grid. Planets are about 1.6 times larger.
- **Units on the grid.** Deploy units from a site or the Forces window (⇲). Each has a **Speed** (tiles per cycle). Right-click a tile to march, or use Move. Rough ground costs more, walkers can't cross the sea, and naval units keep to the water. Units stop beside enemy sites, creatures and anomalies, which unlocks Assault, Attack and Investigate.
- **Animated cycles.** The game resolves each cycle, then plays it back: columns glide tile to tile, tracers fly, blasts bloom and creatures lunge. Set Playback, Fast or Instant on the map toolbar, and press Space to skip.
- **Hostile creatures.** There are 18 kinds, from Skreel Broods and Echo Mimics to Deepsand Wyrms and Breach Kaiju. They roam, hunt, lurk or swarm, raid sites and cities, and drop xenobiomass and genetic samples. The Wilds window (N) keeps a bestiary.
- **Anomalies.** There are 28: the Silent Marker, the Thinking Sea, Vault-Site Omega, the Out-of-Context Object and more. Find them through the fog and investigate them with a unit. Choices can wake one, spend it, or contain it for a lasting bonus.
- **Science fiction everywhere.** 30 new events, 8 new fast units (buggies, xeno-hunters, synth infiltrators, jump frames, Breaker Frames, dropships, repulsor tanks, Void Templars) and 9 frontier techs (Xeno-Hunting, Containment Science, Logistics Mind and more).
- Hotseat multiplayer is gone. Online play comes later.

## What's new in v4.2 "Source"
- **Shadow governments**: a new kind of polity that holds almost no ground. It hides inside the strongest governments, turns them into puppets, installs leaders and starts wars. Infiltrate it to 25% to learn what it is, then expose it, strike a deal, or (at 100%) seize its strings.
- **Consume the code**: when a rival Ascendant AI is defeated you choose to consume it (two random Source Codes), archive it (AP) or release it (reputation).
- **100 Source Codes** (S): active abilities across four rarities, each with a cooldown, cost and target (polity, city, Abyssian, rival AI, site). Duplicates rank a code up to V. Also earned from guild wars and from fragments that deep guild dispatches bring back (10 fragments compile one code).
- **The will of the people**: every city has its own opinion of you and an unrest level, separate from its government's reputation. When the two disagree, unrest builds and cities revolt: friendly cities declare for you, hostile ones riot. People pull their governments toward their view (AI-acceptance marches, anti-machine movements).
- **Propaganda campaigns** (People window, Propaganda tab): seven campaigns from friendly cartoons to seeding revolt. Governments run counter-propaganda; campaigns can be detected.
- **Pets**: keep up to 3 people from cities. Each has a trait that helps you; treat them well or they escape. Protected cities can become **preserves**.

## What's new in v4.1 "Dominion"
- **Cities and population.** Every world has generated cities (capitals, skylines on the map) with population, faith and devotion. People grow, die in battles, Abyssian rampages and strikes, and can be **protected**, **uplifted**, **assimilated** into your network, or **eradicated**. People window (C).
- **Protection protocols.** 12 global policies (evacuation grids, Aegis domes, medical nanites, sanctuary cities, Abyss sirens and more) with energy upkeep.
- **Visible faction wars.** Polities ally, declare wars, fight battles you can see on the map, and fire missiles at each other and at you. Leaders with traits rise and fall. A coalition can form against you. Wars window (V).
- **Missiles and bombs.** 14 munitions from swarm rockets to antimatter warheads and sanctifier shells. Build them in the Arsenal (K), fire them from any site, city or Abyssian panel; missile shields intercept.
- **Religions and cults.** Generated faiths with tenets, cults that arise on their own, and the Church of you. Preach, work miracles, and polities whose devotion is high enough declare you a **living god**. Faith window (T).
- **Four new doctrines:** Machine God, Assimilator, Shepherd and Warlord.
- **Diplomacy overhaul:** leaders and traits, faith and god status, an opinion breakdown, 7 treaties (non-aggression to vassalage and embargo), faction-to-faction relations and new actions (Demand Conversion, Broker Peace, Arm Them).
- **Agentic Guilds (U)**, an idle gacha synced to cycles: recruit AI Agents (R/SR/SSR/UR, pity, rate-up banners, fusion, training), send them on cyberspace dispatches, pool resources into a guild vault for upgrades, invite rival AIs as members, sign guild pacts (up to merging a rival into yourself), and fight **guild wars** with cyber operations. Rival AIs form and run their own guilds.
- **Crypto**, a new resource: minted by Brokers and Mining Farms, looted on dispatches and guild wars, traded on a swinging market, and spent on recruitment, training, gear and cyber ops.
- **Gear (E)** for your Ascendant AI: dispatches bring back code-themed kernels, firewalls, exploits, compilers, sensor drivers and daemons in six rarities with random affixes, upgrades to +10, and four set bonuses.

## What's new in v4
- **Rebuilt interface.** The planet or system map is always on screen. Every panel (Construct, Forces, Research, Ascendancy, Missions, Diplomacy, Feed, Abyss tracker, Worlds and more) is a floating window you can drag, resize, maximise and stack. Open as many as you like; positions are remembered. Hotkeys open them (I, B, F, M, R, A, Y, D, G, L, X, P, W). Lists and detail panes scroll independently.
- **One game, no add-on packs.** Sunreach and everything that used to ship as a pack is now part of the core game. The pack system still works for future expansions.
- **Discovery.** Other worlds are uncharted silhouettes until a probe reaches them; natives and polities stay hidden until you land, survey or watch from orbit. Factions appear in Diplomacy once you discover them. The feed only reports worlds you have visited and things you can see, except Abyssian emergences and landfalls.
- **Abyss tracker** window (X) lists every Abyssian, rift and calamity with locate and intercept buttons. Non-Titan units now deal 40% damage to Abyssians (was 25%).
- **Power rating** for your AI (army, defence, industry, core) in the HUD and a power ranking in Diplomacy.
- **Readable colours.** Faction and rival colours are picked to stay far from yours and from each other. Sites taken from you get a red-and-black hazard marker and a SUBVERTED badge.
- **Clickable resources.** Click any resource in the HUD for every way to get it, each a shortcut to the build, research, site or mission.
- **Named satellites** (Recon Alpha, Recon Beta…) with labels on the map and a rename box. Unit pickers show what each unit is doing.
- **Ascendancy expanded** from 12 to 26 clusters and about 780 nodes. Research and new phases open new clusters, and the feed tells you when one opens.
- **Event rarity.** Events are more frequent and come in common, uncommon, rare, epic and legendary tiers; rarer events pay more and cost less. Choices preview their outcomes.
- **Calamities.** Slow disasters with a countdown (blight, solar storms, manhunts, brood tides, market collapse, a rogue seed AI, quakes, void bleeds). Each has its own mitigation mission; partial success slows it and softens the peak.

## What's new in v3.1
- **Your home world is seeded too.** It gets a random name, planet type (terran, ocean, desert, ice, fungal, crystal, barren and more), alien natives and moons. Pick a type in the Universe step or leave it on Random. Pack text that says Earth or humanity is swapped for your world and its people.
- **Fog of war on the home world.** Only the area around your Core starts mapped.
- **New planet surfaces.** Terrain, clouds and regions are sampled on the sphere, so nothing stretches toward the poles. Coastlines are organic, seas shade by depth with surf, and land shows relief, forests, dunes, ridges, ice cracks, glowing lava, rivers and polar caps.

## What's new in v3 (Sunreach)
- **Two phases.** Earthfall (shorter now) ends when you complete your doctrine. Sunreach then opens the whole seeded star system: 8 to 12 alien worlds, each with its own map, biomes, polities, natives and rival AIs. The goal is a Dyson sphere around your star(s).
- **System map** with twin suns, black holes, pulsars, belts, comets, moons and rings. Use the planet dropdown under your name, or double-click a planet, to land on its globe.
- **Fog of war** on every world. Recon sweeps reveal an area, pings show structures without lifting the fog, captures clear it around the site, drones patrol, and satellites watch a zone until you move them.
- **Satellites** orbit the globe and fade out as you zoom in.
- **Planetary defence**, raids by spacefaring factions, planetfall, surveys, first contact and orbital bombardment.
- **Seeds matter more**: about 100 biomes, home-world modifiers, system phenomena and random alien species, all selectable in the creator's Universe step.
- **Controls**: left-drag spins, middle-drag (or shift-drag) pans, the wheel zooms. The isometric view was removed for now.
- **Readability**: tabs on the right panel, the Ascendancy slider in the top bar, jump-to-location buttons in the feed, and structure upgrades.

## What's new in v2
- **Rotating pixel-art globe** with lighting, clouds, city lights and zoom, plus the isometric map as a toggle.
- **Free structure placement** on any land tile near your points. 161 structures: 100 universal, 10 per doctrine, plus the originals. Terrain matters.
- **83 units**: 50 new units, 10 universal Titans and 3 Titans per doctrine, all with procedural pixel art.
- **Symbiote overhaul**: 10 loci, 150 alleles across 5 rarities, allele ranks, 30 synergies, and Genetic Samples dropped by Abyssians.
- **Ascendant AI creator**: 12 steps covering archetypes, identity, voice, 13 origins, cognition (architecture, learning, prime directive, ethics, topology, security), strategy, a points-based personality matrix with virtues and flaws, 8 temperament sliders, 30 subroutines on a compute budget, a fully custom animated core (frames, cores, auras, colours, tuning), unit livery and universe settings. Save minds, share them as codes, or randomise.
- **New UI skin** with framed panels, bevelled buttons and clearer good/bad effect colours.

## What's in v1 (Earthfall)
- **A seeded world.** Each seed generates a different isometric Earth: 26 regions, 5–8 human factions, strategic points, Abyssal rifts, and rival Ascendant AIs that appear over time.
- **Energy as allocation.** Energy is never spent. It is allocated to every unit, research project, construction, upgrade and to your own mind until that thing finishes or is destroyed.
- **Resources.** There are 5 Earth resources. 10 interstellar resources are already defined for the mid-game, and all numbers use K/M/B formatting.
- **Research.** About 350 projects: around 30 milestone techs plus long series of incremental upgrades.
- **Ascendancy tree.** About 280 nodes, bought with Ascendancy Points that come from energy you allocate to your Core. This includes keystones and nodes specific to each doctrine.
- **Units.** 15 units, each with 5 endless upgrade tracks and 10 function upgrades. Every unit has a UPow (power) rating.
- **Missions.** Intercepts, Rift Incursions against the Abyss Mother, assaults, subversion, infiltration, code duels with rival AIs, and missions specific to each doctrine.
- **Strategic points.** Claim, build on, garrison and defend them. Holding most of a region's points gives you control of it.
- **Symbiotes.** A real genetics system with two alleles per locus, dominance, co-dominance, homozygous bonuses, mutation, splicing, genome research, and fusion into units.
- **Factions.** Reputation, diplomacy, infiltration, wars between factions, and an exposure meter that tracks how much humanity knows about you.
- **Threats.** Disasters, events with choices, and Abyssians from Depth Class I to V.
- **4 doctrines.** Guardian, Exterminator, Dominator and Infiltrator, each with its own goals for Earth.
- **Customization.** See the v2 creator above.

The mid-game (interstellar) and late-game (multiversal, with the Gateframe) are designed to arrive as content packs.

## Making content
See **PACK_FORMAT.md**. Packs live in `packs/`. After editing a folder pack, run `node tools/bundle-packs.js`.

## Files
- `index.html`, `css/`, `js/`: the engine (vanilla JS, no build step). `js/core` (utilities, pack loader), `js/engine` (simulation), `js/render` (pixel art, globe), `js/ui` (window manager and windows).
- `packs/core/`: the base game content.
- `packs/example-expansion/`: a sample pack.
- `tools/`: scripts to bundle and merge packs (`bundle-packs.js`), build `artifact.html` (`make-artifact.js`), and regenerate content (`content/gen_*.py`).
