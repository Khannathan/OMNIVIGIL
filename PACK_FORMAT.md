# OMNIVIGIL Content Pack Format

All game content lives in JSON **content packs**: units, research, the Ascendancy tree, factions, Abyssians, events, missions, doctrines, genes, cosmetics and pixel-art sprites. The engine only supplies the rules. If you add a pack, you add content without changing any code.

- `packs/core/` is the base game. Read it as the reference for every field below.
- `packs/example-expansion/pack.json` is a small single-file pack that shows every kind of extension, including patching core content.

---

## 1. Installing a pack

**Folder pack (recommended):**
1. Create `packs/<your-id>/pack.json`.
2. Add `"<your-id>"` to `packs/manifest.json`. Order matters: later packs override earlier ones.
3. Run `node tools/bundle-packs.js`. This rebuilds `packs/bundle.js` so the game also works when `index.html` is opened straight from disk.

**Single-file import:** in game, go to **Packs → Import pack (.json)**. The pack is stored in your browser. To turn a folder pack into one file, run `node tools/merge-pack.js packs/<id> <id>.json`.

You can enable or disable non-core packs on the Packs screen. Changes take effect after **Reload packs**. The Packs screen also lists any warnings, such as a missing tech or a broken reference.

## 2. pack.json

```json
{
  "id": "my-pack",
  "name": "Display Name",
  "version": "1.0.0",
  "author": "you",
  "description": "What it adds.",
  "requires": ["core"],
  "include": ["units.json", "events.json"],

  "units": [ ... ],
  "events": [ ... ]
}
```

- `include` is optional. Each included file is an object with the same registry keys, for example `{ "units": [...], "techs": [...] }`.
- Every entry in every registry is an object with a unique `id`.

## 3. Adding, overriding, patching, removing

| Entry form | Effect |
|---|---|
| `{ "id": "x", ... }` | Adds a new entry, or **replaces** an existing entry with that id. |
| `{ "id": "x", "$patch": true, "desc": "new" }` | Merges these fields into the existing entry (deep merge for objects). |
| `{ "id": "x", "$patch": true, "requires+": ["foo"] }` | A key ending in `+` **appends** to a list. |
| `{ "id": "x", "$remove": true }` | Deletes the entry. |

## 4. Registries

### resources
`{ id, name, icon, color, tier: "earth"|"interstellar", order, start, desc }`. Earth-tier resources are shown in the Earth phase.

### structures
```json
{ "id": "data_center", "name": "Data Center", "icon": "▤",
  "cost": { "alloys": 50, "silicon": 60 }, "costGrowth": 1.05,
  "buildEnergy": 5, "turns": 2,
  "upkeep": 3, "energyOutput": 0, "yields": { "data": 6, "essence": 0 },
  "defense": 0, "exposure": 0,
  "requires": "tech_id", "doctrines": ["guardian"],
  "coreOnly": false, "coastalOnly": false, "unique": false, "maxPerPoint": 1,
  "claims": false, "buildable": true, "onBuild": [effects], "desc": "" }
```
- `buildEnergy` and `turns`: the energy allocated while building, and for how long.
- `upkeep`: energy allocated permanently while the structure stands.
- `claims: true`: the structure can be built on an unclaimed point and takes it over (like the Network Beacon).

### pointKinds
Strategic point types: `{ id, name, sprite, weight, coastalOnly, slots, defense, yields:{res:n}, mods:{energy:0.5, data:0.5}, special, desc }`. A `mods` value boosts structures on that point by that amount: `energy` scales energy output, and a resource id scales that resource's yield.

### units
```json
{ "id": "bulwark_tbu", "name": "...", "short": "Bulwark", "sprite": "u_titan", "spritePalette": { "g": "#c9a86a" },
  "role": "Titan", "tags": ["titan"], "upgradeProfile": "titan",
  "stats": { "atk": 60, "def": 40, "hp": 420 }, "upkeep": 22,
  "cost": {...}, "buildEnergy": 25, "turns": 4, "batch": 1,
  "requires": "tech_id", "requiresStructure": "titan_forge", "doctrines": [...],
  "abilities": ["harpoon_array"], "functions": [ extra function upgrades ], "desc": "" }
```
- **UPow** = (atk×2 + def×1.5 + hp×0.25) × (1 + UPow bonuses) × (1 + symbiote bonus).
- Tag `titan` deals full damage to Abyssians. Every other unit deals 25%, plus any `abyss` bonuses.
- Tag `cyber` is needed for covert missions.

### upgradeProfiles
These are shared upgrade lines. Each unit has endless **tracks** plus a list of **functions**.
```json
{ "id": "titan", "name": "...",
  "tracks": [ { "id": "atk", "name": "Plasma Gauntlets", "stat": "atk", "perLevel": 0.08,
                "cost": { "alloys": 220 }, "growth": 1.3, "energy": 12 } ],
  "functions": [ { "id": "t_harpoon", "name": "...", "desc": "...", "abilities": ["harpoon_array"],
                   "mods": { "upow": 0.25 }, "cost": {...}, "minLevels": 3, "requires": "tech_id" } ] }
```
- `stat` is one of `atk`, `def`, `hp`, `upkeep` (use a negative `perLevel`) or `upow`.
- Tracks never end. Each level costs `cost × growth^level`.
- 5 tracks × 10 named levels plus 10 functions gives the intended 50–60 upgrades per unit.

### abilities
`{ id, name, desc, mods: { atk, def, hp, upow, upkeep, abyss, covert, garrison, assault, regen, essence } }`. These are unit modifiers: values are fractions, so `0.2` means +20%.

### techs and techSeries
```json
{ "id": "naval_drones", "name": "...", "branch": "Robotics", "tier": 1,
  "cost": { "data": 90 }, "energy": 12, "turns": 3, "requires": ["robotics"],
  "doctrines": ["infiltrator"], "phase": "earth", "effects": [effects], "desc": "" }
```
Content unlocked by a tech is linked automatically: any unit, structure or mission with `"requires": "naval_drones"`.

A **series** generates numbered techs: `<id>_1`, `<id>_2` and so on, each one requiring the previous level.
```json
{ "id": "power_distribution", "name": "Power Distribution", "branch": "Energy", "tier": 1, "levels": 12,
  "cost": { "data": 50 }, "costGrowth": 1.38, "energy": 8, "energyGrowth": 1.25, "turns": 2, "turnsGrowth": 0.5,
  "requires": ["geothermal_engineering"], "effects": [{ "mod": "energy.output", "add": 0.05 }] }
```

### ascendancy and ascendancySeries
v4: a node or series can carry `unlockTech` (a tech id) or `unlockPhase` (a phase id). Gated nodes cannot be bought until the tech is researched or the phase is reached; the Ascendancy window shows the cluster as sealed and the feed announces when it opens. `icon` and `keystone: true` are shown on the card.
These are skill-tree nodes bought with Ascendancy Points (AP): `{ id, name, cluster, ring, cost, requires:[...], doctrine, effects }`. A series works like a tech series, using `cost` (AP) and `costGrowth`. Clusters become columns in the UI.

### doctrines
`{ id, name, title, color, desc, mods:[effects], goals:[goal], midgame }`.

Goal types:

| type | fields |
|---|---|
| `regions` | `count` |
| `regionShare` | `percent` |
| `points` | `count` |
| `factionsRep` | `minRep`, `count` |
| `factionsEliminated` | `count` (or `"all"`) |
| `factionsInfiltrated` | `count` (or `"all"`) |
| `abyssKills` | `count` |
| `bossKills` | `count` |
| `rivalsDefeated` | `count` |
| `tech` | `id` |
| `structure` | `id`, `count` |
| `exposureBelow` | `value` |
| `stat` | `key`, `count` |
| `flag` | `key` |
| `totalUpow` | `count` |

### origins and traits
- Origins: `{ id, name, desc, startTechs:[...], startUnits:{unit:n}, startStructures:[...], effects:[...], mods:[...] }`.
- Traits: `{ id, name, desc, mods:[...] }`. The player picks 2.

### factionArchetypes and rivalArchetypes
- Factions: `{ id, name, weight, nameParts, power, growth, aggression, antiAI, attitude, startRep, attackMult, desc }`. Each world rolls 5–8 factions from these.
- Rivals are rival Ascendant AIs: `{ id, name, doctrine, weight, nameParts, power, growth, aggression, startRep, color, desc }`.

### nameParts
These are procedural name generators: `{ id, patterns: ["{a} {b}"], a: [...], b: [...] }`. The ids `region`, `ocean`, `point`, `rift`, `faction`, `rival`, `abyssian` and `symbiote` are used by the engine. Archetypes can reference their own ids.

### abyssians
`{ id, name, sprite, class: 1-5, upow, essence, weight, rampage, minTurn, dropsGene, boss, desc }`. The entry with id `abyss_mother` is the rift boss.

### disasters
`{ id, name, chance, minTurn, coastal, text, effects, factionPower }`.

### missions
```json
{ "id": "subvert_point", "name": "...", "icon": "⌬", "kind": "combat|covert|operation",
  "target": "enemyPoint|factionPoint|rivalPoint|abyssian|rift|faction|rival|region|ownRegion",
  "abyss": false, "duration": 2, "minUnits": 1, "requiresTags": ["cyber"], "requires": "tech",
  "doctrines": [...], "cost": {...}, "exposure": 0, "failDamage": 0.4,
  "difficulty": { "base": 10, "from": "point|threat|mother|faction|rival", "factor": 0.4, "mult": 1, "growth": 0.01 },
  "success": [effects], "failure": [effects], "successText": "{point} taken", "failureText": "..." }
```
Success chance = P² / (P² + D²), where P is your units' mission power and D is the difficulty.

### events
```json
{ "id": "billionaire", "title": "...", "text": "Text with {faction} {region} {rival} {ai}",
  "target": "randomFaction|hostileFaction|friendlyFaction|antiAIFaction|rival|randomRegion|coastalRegion|playerRegion",
  "trigger": { "minTurn": 8, "maxTurn": 0, "chance": 0.05, "once": true, "cooldown": 0,
               "requiresTech": "", "flag": "", "notFlag": "", "doctrines": [], "exposureMin": 0, "exposureMax": 100 },
  "choices": [ { "label": "...", "cost": {...}, "effects": [...], "chance": 0.6, "failEffects": [...], "result": "..." } ],
  "effects": [ used when there are no choices ] }
```
**v4 rarity:** add `"rarity": "common|uncommon|rare|epic|legendary"` to put an event in the rarity roll. Each cycle the game rolls once for a rated event (more likely the longer it has been since the last one), picks a tier by weight (52/27/13/6/2, tilted by `event.luck`), then picks an eligible event of that tier. Rated events usually use `"once": false` with a `cooldown`. Rarer events should pay more and cost less. Events without `rarity` keep their own `chance` roll. The effect `{ "calamity": "<id>" }` starts a calamity.

### calamities (v4)
```json
{ "id": "brood_tide", "name": "Brood Tide", "icon": "≋", "duration": 6, "difficulty": 80, "minTurn": 20,
  "phase": "solar", "targetsPlayer": false, "weight": 1, "text": "...",
  "drain": [effects applied every cycle], "climax": [effects when the countdown ends], "climaxText": "...",
  "mission": "mit_brood", "reward": [effects when mitigated], "rewardText": "..." }
```
A calamity's mission uses `"special": "mitigate", "target": "calamity"`. A failed attempt adds 30% containment, which shrinks every negative drain and climax effect. Add `"anyCalamity": true` to a mission to let it target every calamity.

### diplomacyActions
`{ id, name, target: "faction"|"rival", cost, scale: "turn", cooldown, minRep, maxRep, requires, doctrines, chance, effects, failEffects, text, failText, desc }`.

### genes and genomeResearch
These are for symbiotes.
- Genes: `{ id, name, locus, dominance, upow, mods:{...}, ability, starter, rare, desc }`. Loci are created automatically from the `locus` values.
- Genome research: `{ id, name, cost (essence), requires:[...], unlocksGenes:[...], effects:[...], desc }`.

### cosmetics
| type | fields |
|---|---|
| `palette` | `primary`, `secondary`, `accent` |
| `sigil` | `shape: { kind: polygon\|star\|circle\|eye\|void, sides, rings, spokes }` |
| `motion` | `speed` |
| `title` | `name` (the epithet) |
| `naming` | `labels: [...]` (unit naming scheme) |

### sprites (pixel art)
```json
{ "id": "u_titan", "palette": { "k": "#0b0f14", "g": "#8a9bb0" },
  "rows": [ "..kk..", ".kggk.", "kgoogk" ] }
```
- Each character is one pixel and `.` is transparent.
- Reserved characters: `o` and `O` are recoloured to the **owner's colour** (light and dark), and `p` and `P` use the player's chosen palette.
- Any unit, point kind or Abyssian can reference a sprite with `"sprite"`. Units can recolour it with `"spritePalette"`.
- Sprites are drawn at 1 pixel per character on the isometric map, which is 16×8 tiles. Units and buildings look right at 9–16 px, and big monsters up to about 24 px.

### phases
`{ id, name, order, desc }`. Future packs can add the interstellar and multiversal phases.

## 4b. Registries added in v2

### terrains
`{ id, name, colors: [deep, mid, light], mods: [...], desc }`. The world generator classifies every map cell into a terrain (deep, ocean, shallows, pack_ice, plains, forest, jungle, savanna, desert, steppe, taiga, tundra, ice, highlands, mountains, glacier). Structures built on a terrain get its `mods` as a yield bonus.

### structureCategories
`{ id, name, icon, color, order }`. Used for the Construct catalog filters and the default sprite style.

### Structures in v2
Structures are placed freely on land tiles (`st.tiles[cell] = { id, hp }`) inside any region where you hold a strategic point. New fields:
- `category`, `tier`, `gen` (procedural sprite, see below)
- `terrain: ["plains", ...]` limits where it can go; `coastalOnly: true` needs a coast cell
- `terrainBonus: { "desert": [{ "mod": "yield.isotopes", "add": 0.2 }] }`
- `maxPerRegion`, `max` (global), `unique: true`
- `mods`: standing global modifiers while the structure exists
- `doctrines: ["guardian"]` limits it to those doctrines

### Procedural sprites
A sprite can be `{ "gen": "building" | "unit", "style": "tower", "seed": 7, "mat": "steel", "mat2": "glass", "mat3": "gold", "glow": "#3ae0ff", "windows": "glow", "size": 2 }`.
- Building styles: block, tower, spire, dome, reactor, dish, array, factory, bunker, pylon, vat, monolith, pyramid, ring, lab, silo, hive, obelisk, citadel, crystal, tree, launch.
- Unit styles: mech, titan, walker, tank, artillery, hover, drone, jet, ship, carrier, infantry, orb, serpent, beast.
- Materials: steel, gunmetal, concrete, white, gold, copper, olive, sand, crimson, bio, abyss, obsidian, glass, ivory, teal, navy, rust, chrome.

### loci, genes, synergies, lootTables
- `loci`: `{ id, name, icon, desc }`. Each gene has a `locus` and a `rarity` (common, uncommon, rare, epic, mythic).
- `synergies`: `{ id, name, requires: [geneIds], upow, mods }`. A symbiote that expresses every listed allele gets the bonus.
- `lootTables`: `{ id, species: [abyssianIds], count: [min, max], alleles: [geneIds], rarityBonus }`. Slain Abyssians roll Genetic Samples from the matching table. Effect `{ "sample": "speciesId" }` also rolls one.

### creatorGroups, creatorOptions, creatorPresets (the Ascendant AI creator)
- `creatorGroups`: `{ id, section, name, desc, icon, kind }`. `section` is the creator step (identity, mind, strategy, universe, temperament, subroutines, personality). `kind` is:
  - `single`: pick one option.
  - `slider`: `{ min, max, left: { name, adj, mods }, right: { name, adj, mods } }`. Each step applies that side's mods once.
  - `budget` (subroutines): `budget` compute points. Options carry `cost`.
  - `traits`: `budget` personality points and `maxPicks`. Traits carry `cost` (negative for flaws) and `kind` (virtue, mixed, flaw).
- `creatorOptions`: `{ id, group, name, desc, mods, startEffects, startTechs, startUnits, cost, tag, flavor, sample, phrase }`.
- `creatorPresets`: `{ id, name, desc, setup }`, where `setup` has the same shape the creator saves (name, origin, doctrine, traits, choices, sliders, subroutines, cosmetics).
- New cosmetic types: `core` (`core`: orb, eye, void, prism, heart, sun, cross, glitch, cube, seed, twin, iris), `aura` (`aura`: sparks, rain, motes, halo, lightning, glyphs, nebula, ripples, tendrils, binary, petals), `livery` (`tint`: primary, secondary, accent or a hex colour). Sigil frames add the kinds helix, cube, fractal, orbit, gear, flower and spiral.

## 4c. Added in v3 (Sunreach)

### Worlds
The game state holds one world per planet: `st.worlds[planetId] = { map, tiles, factions, threats, fog, species }`. Missions, processes, events and rivals carry a `planet` field. Earth is `earth`.

### Cosmos registries (core/cosmos.json, generated by tools/content/gen_cosmos.py)
- `planetTypes`: `{ id, name, terrains, colors, atm, cloud, liquid, noAtmo, giant, yields, desc }`. `yields` are per held point on that world (scaled by `yield.alien`).
- `starTypes`, `systemPhenomena` (`{ id, name, mods, desc }`, up to 3 can be forced in the creator), `planetFeatures` (`{ id, name, mods, desc, home }`, home-world modifiers), `bodyPlans` and `speciesTraits` (alien species get one body plan and small bonus/penalty traits).
- `satellites`: `{ id, name, cost, sight, mods, yields, giantOnly, defense, energy }`. Launched into orbit over a spot on any planet.

### Phases
`phases` entries can carry `startRes`, `startTechs`, `startUnits`, `mods`, `goals` (new goal types `dyson` and `worldsHeld`), `dyson` (`segmentsPerStar`, `cost`, `energy`, `turns`, `requires`, `energyPerSegment`, `yieldsPerSegment`) and `raids`. Techs, structures and units can carry `phase: "solar"` to stay hidden in Earthfall.

### New structure and unit fields
- Structures: `planetDefense`, `sight` (fog-of-war radius).
- Units: tags `recon`, `drone`, `air` and `space` can patrol; `space` units add to planetary defence; `lander` units can make planetfall.
- Missions: `special` (`planetfall`, `survey`, `contact`) and target kind `planet`.

### New modifiers
`space.speed`, `recon.radius`, `sat.sight`, `orbital.slots`, `planet.defense`, `dyson.output`, `dyson.parallel`, `cost.dyson`, `cost.orbital`, `cost.recon`, `yield.alien`.

### The Sunreach pack
`packs/sunreach/pack.json` (generated by tools/content/gen_sunreach.py) adds 31 techs, 22 structures, 12 units, satellites, 4 missions, 7 events and the solar phase. Interstellar and multiversal phases will come as further packs.

## 4d. Added in v4.1 (Dominion)
All of these live in `core/dominion.json` (generated by `tools/content/gen_dominion.py`). Every list entry needs an `id`.
- `munitions`: `{icon, kind, color, cost, energy, turns, requires, phase, targets: [point|city|threat], effect: {pointDamage, abyssDamage, popKill, devastate, exposure, rep, repAll, intercept, radius, assimilate, devotion, convert}}`.
- `protocols`: `{icon, energy, requires, mods, desc}`: toggled global population policies.
- `tenets` (faith building blocks: `stance`, `growth`, `spread`, `assimResist`, `war`), `leaderTraits` (`antiAI`, `war`, `treaty`, `faith`, `protect`), `treaties` (`minRep`, `maxRep`, `hostile`, `vassal`, `mods`, `yields`, `cost`, `scale`).
- Guilds: `agentClasses` (`stat`), `agentRarities` (`weight`, `power: [min,max]`), `agentSkills` (`dispatch`, `loot`, `war`, `guard`, `idle`, `swift`, `luck`, `mentor`, `safe`, `mods`), `dispatches` (`kind`, `turns`, `difficulty`, `slots`, `rewards` with any resource, `shards`, `ap`, `essence`, `infiltrate`), `guildUpgrades` (`cost`, `growth`, `max`, `mods`, plus `guard`, `attack`, `slots`, `shards`, `crypto`, `energy`, `fee`, `ap`), `guildPacts` (`level`, `cost`, `requires`, `mods` with `perMember`), `cyberOps` (`power`, `cost`, `score`, `drain`, `dot`, `pierce`, `steal`, `frame`).
- Gear: `gearSlots`, `gearRarities` (`weight`, `affixes`, `mult`, `salvage`), `gearBases` (`slot`, `main: {mod, add}`, `set`), `gearAffixes` (`pos: pre|suf`, `mod`, `add`), `gearSets` (`bonus2`, `bonus3`).
- New event effects: `devotionFaction`, `devotionAll`, `popGift`. New doctrine goal types: `godDeclared`, `faithShare`, `assimShare`, `popGrowth`, `noEradication`.
- New mods: `strike.power`, `strike.shield`, `cost.munition`, `pop.growth`, `pop.casualties`, `pop.cap`, `pop.refuge`, `devotion.gain`, `assim.speed`, `hive.yield`, `faith.spread`, `god.threshold`, `cost.protect`, `guild.xp`, `guild.dispatch`, `guild.war`, `guild.guard`, `crypto.yield`, `gacha.luck` and more.

## 4e. Added in v4.2 (Source)
Generated by tools/content/gen_v42.py into packs/core/source.json.
- `campaigns`: `{id, name, icon, target: "faction"|"all", turns, cost, opinion, unrest, devotion, weaken, detect, counter, desc}`. Per-cycle effects on every city of the target.
- `petTraits`: `{id, name, icon, mods, homeOpinion, homeDevotion, desc}`. Mods scale with the pet's bond and happiness.
- `sourceCodes`: `{id, name, icon, rarity: common|rare|epic|legendary, kind, target: none|faction|city|threat|rival|point|own, cooldown, cost, params, desc}`. `kind` picks the engine handler (see js/engine/source.js `run`), `params` tunes it (`n`, `res`, `mods`, `turns`, ...).
- Faction archetypes may set `"shadow": true` with `weight: 0`; shadow governments are spawned by the engine, not by world generation.
- Name parts `shadow`, `chairman`, `pet`.
- New modifiers: `propaganda.slots`, `propaganda.power`, `propaganda.length`, `propaganda.stealth`, `pets.cap`, `code.cooldown`, `code.power`, `code.luck`.
- New event effects: `opinionAll` (shift every city's opinion), `discoverShadow`.

## 4f. Added in v5 (Frontier)
- `units[].speed`: tiles per cycle on the surface map (default by tag: cyber 0, titan 1, space/air 4, drone/naval/armor 3, else 2). `units[].xenoMult` multiplies damage against wild creatures.
- `creatures`: `{id, name, icon, tier, upow, speed, behaviour: roam|hunt|swarm|lurk|graze, habitat: land|sea|any, shape, color, sprite, desc, pack:[min,max], packMax, breed, raider, sight, range, regen, weight, minTurn, worlds:[planetType], terrain:[style], loot:{resource: n}, essence, abyssal}`. Add a `lootTables` entry with the same id for genetic samples.
- `anomalies`: `{id, name, icon, rarity, habitat, shape, color, sprite, desc, event, minTurn, worlds, unique, aura:{radius, drain, heal, spawn, creature, unrest, resource, exposure, decay}, contain:{mods, label}}`. `event` names an event with `trigger: {manual: true}` (it never fires on its own) whose choices run when a unit investigates.
- Effects usable in anomaly events: `{anomaly: contain|wake|spend|move}`, `{spawnCreature: id|true, count, mult}`, `{hurtStack: 0.3}`, `{healStack: 0.5}`, `{buffStack: n}`, `{reveal: radius}`, `{revealAll: true}`, `{killCreatures: radius}`, `{devastateNear: 0.4}`.
- New mods: `unit.speed`, `xeno.damage`, `xeno.loot`, `xeno.spawn`, `anomaly.rate`.

## 5. Effects

Effects are lists used by techs, the Ascendancy tree, events, missions and diplomacy.

| Effect | Meaning |
|---|---|
| `{ "mod": "key", "add": 0.1 }` | Permanent modifier while the source is owned (techs, Ascendancy, doctrine, traits, genome). |
| `{ "permanentMod": "key", "add": 0.1 }` | Permanent modifier granted once (events). |
| `{ "resource": "alloys", "amount": 100, "scale": "turn" }` | Gain resources (`scale: turn` grows with game length). |
| `{ "essence": 20 }`, `{ "ap": 5 }`, `{ "exposure": -5 }`, `{ "integrity": -20 }` | Change these values. |
| `{ "rep": 10, "who": "target\|all\|others\|random\|antiAI\|hostile\|friendly" }` | Faction reputation. Add `"rival": true` for rival AIs. |
| `{ "flag": "name" }` | Set a flag. `symbiotes` and `splicing` unlock the symbiote features. |
| `{ "unit": "drone_swarm", "count": 2 }`, `{ "gene": "id" }` | Free unit, learn a gene. |
| `{ "capturePoint": true }`, `{ "infiltrate": 20 }`, `{ "factionPower": -0.3 }`, `{ "rivalPower": -0.3 }` | Act on the mission or event target. |
| `{ "devastate": 0.2 }`, `{ "structureDamage": 0.5 }`, `{ "damageUnits": 0.2 }` | Damage. |
| `{ "spawnThreat": true }` or `"id"`, `{ "spawnRival": true }`, `{ "war": true }`, `{ "endWars": true }` | World changes. |
| `{ "log": "text with {faction}" }` | Write to the chronicle. |

**Modifier keys:**
- **Yields:** `yield.<resource>`, `yield.all`
- **Energy:** `energy.output`, `energy.flat`
- **Speed:** `research.speed`, `build.speed`, `upgrade.speed`
- **Costs:** `cost.research`, `cost.build`, `cost.upgrade`, `cost.culture`
- **Units:** `unit.atk`, `unit.def`, `unit.hp`, `unit.upow`, `unit.upkeep`, `unit.repair`. Tag-specific versions such as `unit.upow.titan` also work.
- **Ascendancy and essence:** `ap.rate`, `essence.gain`
- **Exposure:** `exposure.decay`, `exposure.gain`
- **Missions:** `mission.success`, `mission.power`, `mission.speed`
- **Events (v4):** `event.rate` (flat chance added to the rarity roll), `event.luck` (tilts the roll toward rarer tiers)
- **Abyssians:** `abyss.damage`, `abyss.spawn`
- **Diplomacy:** `rep.gain`, `diplomacy.success`, `faction.infiltration`
- **Defence:** `point.defense`, `structure.slots`, `core.integrity`, `core.regen`
- **Symbiotes:** `symbiote.power`, `symbiote.mutation`, `symbiote.synergy`
- **Genetic Samples:** `loot.quality`, `loot.chance`, `sample.purity` (flat purity points), `sample.capacity` (flat storage)
- **Per-tag unit stats:** `unit.<stat>.<tag>` such as `unit.atk.drone`, `unit.hp.titan`, `unit.upow.naval`

## 6. Number display

Values under 10,000 are shown in full. From there they switch to 10K, 1.5M, 2.25B, T, Qa, Qi… with no cap.
