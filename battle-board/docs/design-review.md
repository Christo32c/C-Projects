# Battle Board design review

What feels bad, what's broken by design, and how to fix each.

**How this was put together:** an automated run of every map, combat, every spell, levelling, the creator and saves (results at the end); playtest sessions in a headless browser; and a read through the rules code. The game was only ever run on a software renderer, so performance on real phones and laptops is a guess.

## Status: fixes applied

Every ★ recommendation below is now in the game, with two changes of direction from the playtester:

- **Mana only comes back from camping, potions or items.** It no longer returns at the start of a turn, while walking, on the stairs or by passing a round. A new item, the **Siphoning Charm**, restores 2 mana for each foe you slay.
- **Less of the D&D rulebook.** Lasting **wounds** replace death saves, and a short **stun immunity** replaces "legendary resistance". An **ambush** rule (strike first and the monsters lose their first turn) replaces the surprise round.

| # | Issue | What changed |
|---|---|---|
| 1 | Wait refilled mana | Mana returns only by camping, Potions of Mana, or the Siphoning Charm. Mana Spring now doubles potion mana and survives an interrupted camp. |
| 2 | Gold had no use | The **Stair Merchant** on every landing sells potions, mana potions, arrows, rations, torches and one special item per floor. He buys anything not equipped (trophies at full price) and runs a respec shrine. |
| 3 | Hold Monster locked bosses | After a stun, a boss shrugs off stuns for 2 rounds. |
| 4 | Fire Bolt beat weapons | Fire Bolt now costs 2 mana, reaches 60 ft and deals 1d10. With finite mana, weapons do the everyday work. |
| 5 | Falling had no stakes | Each knockout in a real dungeon leaves a wound: −10% max HP, up to 3 wounds, until camp. |
| 6 | Long monster rounds | **Combat speed** setting (normal, fast, instant), hold any key to fast-forward, and unseen monsters move instantly. |
| 7 | One class | Three **kits**: Spellblade, Warden and Ranger, each with its own gear, casting ability and spell list. Hirelings get a random kit. |
| 8 | Floor loot all looked alike | Floor loot shows the item's real model, glowing in its rarity colour. The mana potion is blue. |
| 9 | Far squares were fiddly | **Tactical view**: hold Shift, or use the button. The follow cam waits 5 s after you orbit by hand. |
| 10 | Overlays talked over each other | One message stack at the bottom left. Level-ups and achievements wait until the fight ends. The aim prompt moved down above the hotbar. |
| — | Passive Perception and capacity unused | Passive Perception spots traps, secret doors and caches within 10 ft. Overloaded packs cost 10 ft of movement. |
| — | Junk | Rations feed the camp (2d4 if it's interrupted), torches add 10 ft of sight, rope gives +2 to disarm, and trophies sell. |
| — | No Give | **Give** button for a friend within 5 ft (it takes your action in a fight). |
| — | Monsters going first | **Sneak** (G) halves how far monsters see you. Strike first and the monsters lose their first turn. |
| — | "Wait" naming | Renamed **Pass a round**, with a tooltip. |
| — | Odds hidden | Hovering a target shows % to hit and damage, or % to resist a spell. |
| — | Hotbar overload | Up to 8 **prepared spells** on the hotbar, chosen on the Spells tab. |
| — | Invisible talents | Bulwark and Dread Presence float a "miss!" label when they turn a hit; Keen Senses shows on searches. |
| — | Statuses vanished after fights | The party's effects tick down one round per 2 squares walked. |
| — | No respec | Undo last choice until the sheet closes, plus the shrine respec (25 gp × level). |
| — | XP curve | Bigger parties meet about 25% more monsters per extra adventurer. Each floor's boss tops the party up to about one level per floor. |
| — | Static companions | Waiting companions breathe and sway, and flinch when hit. |
| — | Ally targeting | Click a party portrait (or your own card) with a buff selected. |
| — | Bosses were just bigger monsters | Every boss has a **half-HP phase** with its own banner: wolves, rage, brood, flood, prayer, honour guard, or the lich's shadow-step. |
| — | Invisible rarity | Common white, magic blue, weird violet and boss gold, on names, tags, loot windows, floor glows and the workbook. |
| — | Performance | Per-frame particle budget on Medium and Low, a frame-rate readout in Settings, and a one-time hint to lower quality if the board runs below 28 fps. |
| — | Creator checks | Reachability check for the exit, monsters and chests, plus boss arenas with no boss. **Fill a rectangle** brush and a **Boss arena** tool. Touch camera was already two-finger. |
| — | Saves in one browser | **Export / Import a backup** of every hero, expedition and dungeon, and a warning when storage is nearly full. |
| — | Accessibility | Text size, effects and ambience volume, key rebinding, and words beside effect icons and on hurt health bars. |

**Not done yet:**
- Fully animated rigs for every companion. Waiting companions breathe and flinch, but only the acting hero has the full rig.
- Merged or instanced floor meshes.
- Rope crossings over deep water.
- Batching monsters of the same type into one turn.

These need deeper engine work; they are left for a later pass.

**Severity**
- 🔴 **Breaks the game.** An exploit, a dead system, or something that makes the game trivial or unfair.
- 🟠 **Hurts the feel.** It works, but it's frustrating, slow, confusing or flat.
- 🟡 **Polish.** It's noticeable and worth fixing when convenient.

Each issue has options, with the recommended one marked ★.

---

## Top 10 to fix first

| # | Issue | Severity | Recommended fix |
|---|---|---|---|
| 1 | **Wait** outside a fight refills mana for free, so spells are unlimited | 🔴 | Only regain mana by walking or resting, never by waiting |
| 2 | Gold has nothing to spend it on, so gold rewards and Fortune's Favour are worthless | 🔴 | A merchant between floors |
| 3 | Hold Monster can stun a boss every turn | 🔴 | Bosses shrug off stuns (three times per fight) or get stun immunity after one |
| 4 | Fire Bolt (1 mana, 2d8, 120 ft) beats every weapon | 🔴 | Raise its cost, shorten its range, or make weapons hit harder |
| 5 | Falling in a fight has no stakes: everyone gets back up when it ends | 🟠 | Death saves, or a lasting wound |
| 6 | Long monster rounds (a camp of 10 takes 15+ seconds) | 🟠 | Speed toggle; skip the camera on unseen monsters; batch same-type monsters |
| 7 | Every hero and hireling is the same Spellblade with the same kit | 🟠 | Two or three starting kits or classes |
| 8 | Loot on the floor all looks alike (a sack or a plain blade; Potions of Mana look like healing potions) | 🟠 | Use the item's real model in the world |
| 9 | Clicking far squares with the close camera is fiddly | 🟠 | Hold a key to pull back to a tactical view |
| 10 | Too many overlays share the top of the screen | 🟡 | One message stack, and announcements wait until the fight ends |

---

## 1. Economy and exploits

### 🔴 Waiting refills mana
Outside a fight, **Wait** passes a round and gives every adventurer 1 mana. The automated run confirmed it: six waits gave six mana. Mana stops being a resource, and with it every spell, Hold Monster included, becomes unlimited between fights.
- A ★ No mana from Wait. Keep regaining it by walking and resting, and in a fight at the start of each turn.
- B Keep it, but in a dark dungeon each Wait rolls for wandering monsters, like camping.
- C Only regain mana by walking new ground (squares you haven't explored).

### 🔴 Gold is a number with no use
Gold comes from chests, monsters, urns and achievements. Fortune's Favour adds 25% more. Nothing costs gold.
- A ★ A **merchant** on the stairs between floors: potions, mana potions, arrows, and one random magic item per floor.
- B A **shrine** that trades gold for a permanent blessing, or for respec of stat points.
- C Drop gold altogether and turn it into XP. That's simple, but players lose the joy of a hoard.

### 🔴 Shown but never used: passive Perception, carrying capacity
The sheet shows **Passive Perception** and a **weight / capacity** figure, but no rule reads either. Players will plan around them.
- A ★ Passive Perception automatically finds traps and secret doors whose DC is at or below it, as you walk past. Heavy packs cost 10 ft of movement.
- B Remove both from the sheet until they matter.

### 🟠 Junk with no purpose
Rope, torches, rations, the Bag of Mostly Teeth and Giant Rat Tails take up inventory and do nothing.
- A ★ Give each one a small use: rations heal 1d4 when camping, torches light dark rooms brighter, and rope crosses deep water at a marked point. The merchant buys junk for gold.
- B Treat them openly as flavour (sellable "trinkets"), shown in their own small list.

### 🟠 You can't hand items to a friend
Each adventurer has their own pack, and the only way to share a potion is to pour it into a fallen ally. Arrows, magic weapons and potions get stuck on the wrong person.
- A ★ A **Give** button in the inventory for anyone within 5 ft (it uses an action in a fight).
- B A shared party stash for gold and consumables, with personal packs for gear.

---

## 2. Combat flow and pacing

### 🟠 Long enemy rounds
Every visible monster gets a camera swing, a 0.5 s pause, its walk, then its attack. The goblin camp on floor 1 can take 15–20 s per round, and 30+ creatures on floor 2 add up.
- A ★ A **combat speed** setting (normal / fast / instant), plus skip the camera swing for monsters you can't see.
- B Monsters of the same type with the same target act together, with one swing for the group.
- C Hold any key to fast-forward the enemy's turn.

### 🟠 The fight starts with the monsters going first
Walking into view of a camp rolls initiative, and half the camp often acts before you. There's no surprise and no ambush for the party, only against it.
- A ★ Surprise: whoever wasn't spotted first gets a free round. Creeping (half speed) lets you approach unseen.
- B Adventurers win initiative ties, and the hero who triggered the fight gets +5 to initiative.

### 🟠 Falling has no stakes
Downed adventurers stand back up at 1 HP when the fight ends. Healing Word revives at 60 ft. A lost fight only matters if everyone drops at once.
- A ★ **Death saves**: three failures before the fight ends and they're gone for good (or "gravely wounded": they leave the party until the next floor).
- B A lasting wound, like −2 max HP per knockout until you camp.
- C Keep it forgiving, but offer it as a difficulty setting.

### 🟡 "Wait" means two different things
Out of a fight it passes a round. In a fight the same button is **End turn**. New players don't know why they'd ever press Wait.
- A ★ Rename it **Pass a round** with a tooltip ("lets walls of fire and ice run out"), or remove it outside fights.

### 🟡 You can't see your odds
Attacking or casting gives no hint of your chance to hit, the damage, or the target's save.
- A ★ Hovering a target with a weapon or spell selected shows "65% to hit · 1d8+2", or for saves "Wis save: 45% to resist".

---

## 3. Camera and controls

### 🟠 Clicking distant squares with the close camera
The low third-person camera feels great for watching, but squares more than 4–5 away are thin slivers, and walls and minis hide them.
- A ★ Hold **Shift**, or a toggle, for a **tactical view**: the camera lifts overhead while held, and you click there.
- B Click-and-drag a path on the floor, or pick the destination from a top-down minimap.
- C Pull the camera back automatically while you aim a spell.

### 🟠 The follow cam fights you
When the camera auto-swings behind the walking hero or to the next monster, it can override an angle you just chose. Free cam fixes that but loses the swing to whoever is acting.
- A ★ After you orbit by hand, pause the auto-swing for 5 seconds (or until the next turn).
- B Only swing to monsters on their **first** turn in a fight.

### 🟡 Hotbar overload
16 spells, 2 potions, search and dash wrap into two rows of small buttons with 9 px labels. Number keys reach only the first ten spells.
- A ★ **Prepared spells**: pick up to 8 on the Spells tab, and only those show on the hotbar.
- B Spell schools as fold-out groups (fire / frost / support).

### 🟡 Talking over each other
The boss bar, initiative tracker, read-aloud text, toasts, the aim prompt and achievement pop-ups all use the top-middle of the screen. In a busy moment they cover each other and the board.
- A ★ One message stack on the left for toasts and achievements. Level-ups and achievements wait until the fight ends. Read-aloud text goes in a lower-third banner.

---

## 4. Magic and balance

### 🔴 Hold Monster locks bosses
Hold Monster stuns on a failed Wisdom save, and bosses have no protection. With enough mana (see Wait), a boss never acts.
- A ★ **Boss resolve**: bosses can choose to succeed on a failed save three times per fight, and after being stunned they're immune to it for 2 rounds.
- B Stun only removes a boss's movement, not its action.

### 🔴 Fire Bolt makes weapons pointless
At level 1, Fire Bolt costs 1 mana (regained each turn) and deals 2d8 at 120 ft, using Intelligence. The longsword does 1d8 + 2 at arm's reach. Every turn of every fight, the spell is better.
- A ★ Fire Bolt costs 2 mana, reaches 60 ft, and deals 1d10. Weapons get a reason to exist: a free attack when a monster walks away, or a second attack at level 5.
- B Mana stops regenerating per turn in fights, so spells feel precious and weapons fill the gaps.

### 🟠 Effects the player barely feels
Bulwark and Dread Presence (−1 to enemy hits) and Keen Senses (+3 Perception) are real but invisible in play. Players won't know they're working.
- A ★ When a talent changes a roll, show it in the log and as a small floating label ("Bulwark: miss!").
- B Make them bigger: Bulwark +2 AC with a shield, Dread Presence makes enemies hesitate (they lose their bonus action).

### 🟡 Statuses vanish when the fight ends
All buffs and debuffs clear at the end of a fight. Pre-buffing still works, but Regeneration and Hasted can't help on the walk to the next room, and a fight that "ends" because the last enemy fled wipes everything.
- A ★ Effects keep counting down outside fights, a round per 2 squares walked.

---

## 5. Progression

### 🟠 One class, one kit
Every hero is a Human Spellblade, and every hired companion has the same longsword, shortbow, chain shirt, shield and 16 spells. A party of four is four copies.
- A ★ **Three kits** at creation: Spellblade (as now), **Warden** (heavy armour, a shield, a greatsword, and only support spells), and **Ranger** (a bow, leather armour, venom arrows, and only frost and nature spells). Hirelings roll a random kit.
- B Species with small bonuses (dwarf: poison resistance, elf: +1 perception).

### 🟠 Respec and spending regrets
Stat points and talents can't be undone. One mis-click on +1 is permanent.
- A ★ Points spent this level can be undone until you leave the character sheet, and a shrine on each floor respecs for gold (which also gives gold a use).

### 🟡 The campaign's XP curve
Solo, floor 1 has 9 foes plus Grak (36 HP, bleeding bites) against a 12-HP level-1 hero. By floor 7 a careful player reaches about level 5. Fireball (level 4) arrives late, and Hold Monster is barely usable.
- A ★ Scale encounters by party size (one extra monster per extra adventurer), and give each floor's boss a fixed XP bonus so every floor clear is about one level.

---

## 6. Party

### 🟠 Companions are statues
Companions that aren't in control are painted snapshots: they slide when following, and they don't breathe, swing or flinch. Next to the animated active hero they look dead.
- A ★ Give every member a real animated rig (the rig code would need to become per-character), or at least a walk bob and a hit flinch.

### 🟡 Spells on allies need precise clicks
Buffs need a click on a friend's square, and their mini can be hidden behind the active hero in the close camera.
- A ★ Clicking a party portrait while a buff spell is selected targets that adventurer.

---

## 7. Bosses

### 🟠 Bosses are bigger monsters
The versus card is a great moment, but after it a boss plays like a normal monster with more HP. Only the summoners and the High Priest do anything different, and nothing is telegraphed.
- A ★ **Phases**: at half HP each boss does something new (Grak dismounts and calls wolves; the Abbot floods the room with shallow water; the Lich turns invisible for a round), announced with a short card.
- B **Telegraphs**: the boss marks squares red for its big hit next turn, so players can move out of the way.
- C Arena hazards: braziers that can be knocked over, collapsing pillars.

---

## 8. World and art

### 🟠 Floor loot all looks alike
On the floor, every armour, helm, charm, arrow bundle and junk item is the same brown sack. Every weapon is the same plain blade (only the three weird swords get a colour). The **Potion of Mana is red, like a healing potion**. The catalogue workbook shows what their real models look like.
- A ★ Floor loot uses the real model (the same one the catalogue renders), floats it, and adds a coloured glow by rarity.

### 🟡 Rarity is invisible
Magic and weird items only differ by a word in their description.
- A ★ Rarity colours: common white, magic blue, weird violet, boss loot gold. Use them in names, loot windows, floor glows and the catalogue.

### 🟡 Performance risk on real devices
Every floor square is its own mesh and material, every grass square has its own material, and fire, lava and every status effect stream particles. It was never measured on a real phone.
- A ★ Merge walls and floors per room, and use instanced meshes for grass blades and pebbles. Cap particle streams on the low quality setting. Measure on a mid-range phone.

---

## 9. Creator

### 🟠 Checks don't prove the dungeon can be finished
The editor checks for a start and warns about plates without a portcullis, but it doesn't check that the exit (or every monster) can actually be reached. The campaign's own generator does.
- A ★ Run the same reachability check as `tools/floors.py` and list unreachable exits and monsters in **Checks**.

### 🟡 Missing tools
There's no fill, copy/paste, rectangle walls or eraser. Placing a boss arena requires drawing a read-aloud area. On a phone, painting fights the camera.
- A ★ Rectangle fill for any tile, a **Boss arena** tool, and a two-finger-only camera on touch.

---

## 10. Saves and safety

### 🟠 Everything lives in one browser
Heroes, expeditions and dungeons are only in this browser's storage. Clearing site data, private browsing or a new device loses them, and only dungeons can be exported.
- A ★ Export and import for heroes too (a single file with roster and dungeons). Warn once when storage is close to full.

---

## 11. Accessibility

### 🟡 Small text and colour-only cues
Hotbar labels (9–10 px), effect counters and party bars are small. Some states are colour-only (red low HP, effect icons tinted by colour). Keys can't be remapped, and there's no volume control.
- A ★ A text-size setting, icons plus words for every effect (already true in the tracker; extend it to health bars), key remapping, and volume sliders for music and effects.

---

## Test results

Re-run after the fixes were applied. Both suites pass.

**Regression suite** (`node tests/run-tests.mjs`, Playwright, headless Chromium with software WebGL): **25 of 25 checks passed** (about 79 minutes on a software renderer; last run after the balance and techniques change).

| Area | Result |
|---|---|
| Boot to the title screen | ✅ |
| Catalogue render: 37 items, 21 monsters and props | ✅ |
| Data: loot tables, monsters, 16 spells, 12 effects, 27 talents | ✅ |
| Maps: one start, closed border, legal tiles (9 maps) | ✅ (Training Yard's open edge is deliberate) |
| Create a hero with a companion and enter the Sunken Crypt | ✅ |
| Load all 9 maps (1–32 creatures each) | ✅ |
| Combat initiative: rat 22, rat 21, rat 17, Tester 12, skeleton 12 | ✅ |
| Every spell casts without errors | ✅ |
| Hex lands; statuses count down at the end of a turn | ✅ |
| Casting costs mana (16 → 14 MP) | ✅ |
| **Mana is not restored by passing rounds** (14 → 14 MP after 6 rounds) | ✅ (was the free-refill probe; now an assertion) |
| Levelling: XP, stat points, STR 12 unlocks *Heavy Hitter* | ✅ |
| Save and continue | ✅ |
| Creator: paint, playtest, return | ✅ |
| No uncaught errors during the whole run | ✅ |

**Fix checks** (`node tests/review-fixes.mjs`): **17 of 17 passed**. They cover:
- mana only from camping, potions and the Siphoning Charm;
- Fire Bolt's new cost and range;
- kits and prepared spells (8 slots);
- the hit-odds chip;
- statuses ticking out of combat;
- wounds;
- boss stun immunity and boss phases;
- party scaling;
- ambush;
- the merchant, undo and respec;
- settings and key remapping;
- the toast stack;
- creator reachability warnings;
- item models;
- no errors.

**Notes:**
- An earlier run of the first suite was cut off by a 30-minute time limit, and its last 8 checks never ran. The full re-run above passed with no changes to the game.
- The first run before the fixes failed 3 checks. All three were problems in the test script, not the game.
