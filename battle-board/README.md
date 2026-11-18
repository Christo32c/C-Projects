# Battle Board

A 3D tabletop battle board for TTRPG-style play, running in the browser with Three.js. It needs no build step.

## Run it

Open `index.html` in a browser, or serve the folder:

```
cd battle-board && python3 -m http.server 8000
```

Three.js loads from jsDelivr, so the first load needs an internet connection.

## Menus

The game opens on a title screen with the dungeon slowly turning behind it.

- **Adventure**: pick a hero from your roster, or create one. A new hero gets a name, a look (adventurer or paladin sculpt, colour, skin, hair), a **kit** (below) and ability scores, from 27-point buy or by rolling 4d6 and dropping the lowest die. Each hero keeps their own expedition: **Continue** picks up exactly where you left off, and **Start over** sends them into any dungeon again, either keeping their level and gear or back at level 1. The title screen also offers to continue your most recent expedition.
- **Create**: the dungeon creator (below).
- In a dungeon, the **Menu** button at the top left saves and returns to the title screen.

Heroes and dungeons are saved in the browser's local storage. A save from before the roster existed becomes your first hero. **Export a backup** on the hero screen saves every hero, expedition and dungeon to one file; **Import a backup** loads it on any device. The game warns you once if browser storage is nearly full.

### Classes

| Class | Gear | Magic (cast with) | Signature move |
|---|---|---|---|
| Sorcerer | two daggers, no armour, two mana potions | the widest spellbook: Fire Bolt, Ray of Frost, Hex, Arcane Ward, Enfeeble, Poison Cloud, Haste, Wall of Fire, Wall of Ice, **Hellpit**, Fireball, Hold Monster (Charisma) | **Hellpit** |
| Ranger | shortbow, 20 venom arrows, leather, two daggers | frost and nature: Ray of Frost, Vine Growth, Healing Word, Enfeeble, Poison Cloud, Regeneration, Wall of Ice (Wisdom) | **Tri-Shot** |
| Warrior | longsword, shield, chain mail, a greatsword for two hands | none | **Steel Cyclone** |

- **Hellpit** (Sorcerer spell, level 3, 5 mana, 60 ft): the floor splits into a pit of hellfire. Everything within 10 ft takes 4d6 fire (half on a Dex save) and anything that fails burns for 2 rounds. **Once in a hundred casts a hell hound claws its way out** and fights for you for 3 rounds: at the start of each round it leaps at the nearest enemy and bites (+6 to hit, 2d6+3 fire, often setting it alight), then it crumbles to ash. Monsters ignore it. It also leaves when the fight ends.
- **Tri-Shot** (Ranger technique, level 1, ready again after 3 turns): three arrows in a fan, one each at up to three enemies you can see in range (the nearest first, so a lone target takes all three). Each is a full attack, rolled separately, and each spends an arrow.
- **Steel Cyclone** (Warrior technique, level 1, ready again after 4 turns): spin on your heel with your blade out, making a full attack, rolled separately, against every enemy next to you.

**Starting spells and skills.** When you create a hero you choose what they know at level 1: a **Sorcerer picks 3 spells**, a **Ranger 1 spell and 2 skills**, a **Warrior 3 skills**. The rest of the level 1 list opens up at level 3, and bigger spells and skills arrive as you level, as before.

| Level 1 option | Class | Shape | What it does |
|---|---|---|---|
| **Earth Shot** | Sorcerer | 15 ft cone | A shotgun of rocks: 3d6 bludgeoning next to you, 2d6 at 10 ft, 1d6 at 15 ft (Dex save for half). 2 mana |
| **Frost Fan** | Sorcerer | 15 ft cone | 2d6 cold (Con half); those who fail are chilled for 2 rounds. 2 mana |
| **Thunderclap** | Sorcerer | all around you | 2d6 thunder to everything next to you (Con half). Goes off as soon as you pick it. 2 mana |
| Fire Bolt, Ray of Frost, Hex, Arcane Ward | Sorcerer | one target | as before |
| **Thorn Spray** | Ranger (spell) | 15 ft cone | 2d6 piercing (Dex half); half of those who fail bleed for 2 rounds. 2 mana |
| Ray of Frost, Vine Growth, Healing Word | Ranger (spell) | | as before |
| **Scatter Shot** | Ranger (skill) | 20 ft cone | A fistful of arrows: 2d6 + Dexterity piercing (Dex half). No mana, one arrow, ready again after 3 turns |
| Tri-Shot, Aimed Shot, Tumble | Ranger (skill) | | as above |
| **Earthshaker** | Warrior (skill) | 15 ft cone | A shockwave of broken stone: 2d6 + Strength bludgeoning (Dex half). No mana, ready again after 3 turns |
| Steel Cyclone, Cleave, Shield Bash, Second Wind | Warrior (skill) | | as above |

Cones point wherever you aim: pick the card, then any square in the direction you want. Earthshaker and Scatter Shot use your Strength or Dexterity for their save DC (8 + proficiency + the ability) and damage.

**An easier start to the Descent.** On the first floor of the Lich's Descent, monsters have -2 to hit and -2 damage (the wolf rider -2 to hit and -4 damage); on the second, -1 and -1 (the chief -1 and -2). A goblin now deals a level 1 Sorcerer about half the damage a turn it used to, so a lone hero can get through with care.

Heroes made as a Spellblade become Sorcerers, and Wardens become Warriors; they keep their gear and scores. Hired companions get a random class.

### Hitting and missing

Every monster defends in one of two ways: **armour** (skeletons, goblins with shields, spiders, the Grave Warden) or **dodging** (rats, wolves, archers, wraiths). A miss says which: *Blocked* or *Dodged*. Your own Defence works the same way, from whichever is better of your armour and shield or your Dexterity.

Weak monsters have low Defence, so missing one is bad luck, not the norm. Bosses are still hard to hit.

| Level-1 hero | Giant Rat | Skeleton | Goblin | Grave Warden (boss) |
|---|---|---|---|---|
| Warrior | 95% | 90% | 80% | 65% |
| Ranger (bow) | 95% | 90% | 80% | 65% |
| Sorcerer (Fire Bolt) | 95% | 85% | 75% | 60% |

### Techniques

Warriors and Rangers have **martial training** (Warrior: +2 to hit and +2 damage with melee weapons; Ranger: +2 to hit and +1 damage with bows) and **techniques**: weapon skills that cost no mana. Each is ready again after a few of your own turns, and all are ready at the start of every fight. Most are armed first and ride on your next attack; Esc cancels.

| Technique | Who | Level | Cooldown | What it does |
|---|---|---|---|---|
| Steel Cyclone | Warrior | 1 | 4 turns | Action: a full attack against every enemy next to you |
| Cleave | Warrior | 1 | 2 turns | Your next melee attack also hits every other enemy next to you for the weapon's dice |
| Shield Bash | Warrior | 1 | 3 turns | 1d4 + Strength, and the target loses its next turn. Needs a shield |
| Second Wind | Warrior | 1 | once a fight | No action: regain 1d10 + your level |
| Rending Strike | Warrior | 2 | 2 turns | An extra weapon die, and the target bleeds for 3 rounds |
| Stand Fast | Warrior | 3 | 4 turns | Action: +4 Defence for 2 rounds. Needs a shield |
| Tri-Shot | Ranger | 1 | 3 turns | Action: three arrows, one each at up to three enemies in range |
| Aimed Shot | Ranger | 1 | 2 turns | Roll twice and keep the better, with an extra weapon die |
| Tumble | Ranger | 1 | 3 turns | No action, in a fight: 20 ft of extra movement |
| Volley | Ranger | 2 | 3 turns | Extra arrows at up to two enemies within 10 ft of the target |
| Pinning Shot | Ranger | 3 | 4 turns | The target loses its next turn |

Techniques come first in your hand of cards and are listed at the top of the Spells tab.

### The play screen

The board fills the screen and the controls stay out of its way.

- **Health and mana** are two small pills at the top left (♥ and ◆), with icons beside them for effects, wounds, sneaking and a waiting level-up. Hover for the full numbers; click for the character sheet.
- **Your hand of cards** fans out along the bottom: an **Attack** card for your weapon first, then your techniques, prepared spells and actions. Each card shows its cost (blue gem: mana), cooldown (gold dial), uses left, range and what it does. Cards you can't play right now are greyed; tapping one says why.
- **Playing a card:** click or tap it. Attacks, spells and aimed techniques lift and wait for a target; tap the card again or press Esc to put it down. Potions, Search, Dash and other instant cards are used at once. Or **drag a card up onto the board** and let go over the target.
- **Reading a card:** hover with a mouse and it rises to full size; on a phone, slide your finger along the hand. Hold a card (or right-click it) to see it large.
- **The camera** keeps the board centred in the space above the hand. Aiming a card pulls the camera up and back until everything the card can reach is on screen, then returns when you play it or put it down.
- **On a phone held upright** the camera looks down on the room from higher up with a wider lens. The cards are smaller, and while you aim, the rest of the hand drops out of the way. On a phone held sideways the camera sits a little higher. The **▾** button lowers the hand on any screen.
- Keys **1** to **0** play the first ten cards after Attack. **Arrange your hand** with the ✎ button: add or remove any spell you know or technique you have, plus healing potion, mana potion, search, dash, sneak, light a torch, first person and tactical view, in any order (up to 12 besides Attack). Each hero keeps their own hand.
- On screens narrower than 900 px the side buttons fold into a **☰** menu at the top right.

### Settings and controls

The **Settings** button holds combat speed (normal, fast or instant monster turns; hold any key to fast-forward one), text size, the view (over the shoulder or first person), the film look, effects and music volume, effects quality with a frame-rate readout, and key rebinding.

- **Shift** (or the Tactical button) lifts the camera overhead while held, for picking far squares. After you turn the camera by hand, the follow cam leaves it alone for 5 seconds.
- **G** sneaks: monsters only notice you within 20 ft and fewer wanderers find you. Hit a monster before it knows you're there and every monster in that fight **loses its first turn**.
- Hovering a monster shows your **chance to hit and the damage**, or with a spell selected, its chance to resist.
- With a buff or healing spell selected, click a **party portrait** to target that adventurer.
- Messages stack at the bottom left. Level-ups and achievements wait until the fight is over.
- Effects show an icon and a word; badly hurt and wounded show as words on the health bars.

## Being in the dungeon

**First person (B, or the side button).** See the dungeon through your hero's eyes, with a lantern in one hand and your weapon in the other.

- **W** and **S** (or the up and down arrows) step one square forward and back. **A** and **D** turn a quarter. Drag to look around freely.
- Walking into a monster attacks it. Walking into a door, chest or font uses it.
- Clicking still works for everything: squares, monsters, spells and loot.
- On a monster's turn your head turns to whoever is acting. Being hit jolts the view.
- **Shift** still lifts you overhead for the tactical view.
- In the over-the-shoulder view, **W A S D** step relative to the camera.

**A mood for every floor.** Each floor of the Descent has its own light, fog colour, drifting motes, colour grade and musical key. A title card names the floor as you arrive.

**A score that follows the danger.** The music is generated as it plays, so it never loops.

| Situation | Music |
|---|---|
| Exploring | Slow pads and a few lonely plucked notes |
| Something is within 30 ft, or you are badly hurt | A low pulse joins in |
| A fight | War drums, a driving bass and a horn line |
| A boss | Faster, with a choir |

**Sound has a place.** Monster footsteps, cries and deaths come from their side of the room and fade with distance. You can hear monsters moving in the dark before you see them, and now and then something unseen stirs nearby.

**Small things.** Water drips from the ceiling and splashes. The light you carry gutters like a flame. A film look adds grain and a lens vignette, drains the colour as your health drops, and splits red from blue when you are hit.

Settings has the view, the film look, and one volume for music and ambience. The film look is off at Low quality.

## The Hero Builder

When you create a hero, press **Open the Hero Builder**; to change an existing hero later, press **Restyle** on the hero list. The figure stands in the Training Yard and you can drag the view to walk round it.

- **Base:** Human, Elf, Dwarf, Orc, Halfling or Horned. A base sets a starting body and face; everything can be changed after. Bases are looks only; your kit and scores decide how you fight.
- **Body:** height, build and head size, and skin colour (ten tones, or any colour).
- **Face:** eyes (round, narrow, wide or glowing, any colour), brows, nose, mouth, ears, beard (stubble to braided), tusks, horns, a scar and face paint. The camera moves in close for the face and hair.
- **Hair:** eight styles and any colour.
- **Outfit:** a hat (hood, pointed hat, bandana, circlet, horned helm), a cloak (short, long, tattered), a pack and a scarf. Armour, shields and weapons still come from what is equipped, and a helm or crown you wear replaces the hat.
- **Colours:** the main colour, cloak, trim, trousers and boots.
- **Surprise me** rolls a random look; **Undo** steps back. **Keep this look** saves it.

## The Monster Forge

Choose **Monster Forge** on the title screen to make monsters and other characters (villains, guards, villagers who stand still).

- **The look:** either **a figure** built like a hero (open it in the Hero Builder for the face, hair, outfit and colours, then choose what it holds, its armour and its helm), or one of the game's sixteen monsters, recoloured and resized.
- **How it fights:** walks up and hits, keeps away and shoots (arrows or magic bolts), or stands still and never attacks. HP, Defence and whether it blocks or dodges, speed, attack bonus, damage dice and type, reach or range, the word the log uses ("bites", "cleaves"), an effect its hits can cause, four saves, XP, and whether it is a boss with a title.
- **The threat panel** says how it would do against a fresh level 1 Warrior: who hits whom how often, how long the fight lasts, how much damage it deals before it falls, which of the game's monsters it is closest to, and a suggested XP.
- **Fight it** starts a fight with it in the Training Yard (your forge hero can't die there); **Reset the fight** puts everyone back.
- **Save** keeps it in this browser and gives it a map letter. It then appears under **Your monsters** in the dungeon creator's palette, so you can paint it into any dungeon. A dungeon file shared with someone who doesn't have the monster shows plain floor where it stood.

## The Spell Forge

Choose **Spell Forge** on the title screen to invent spells. It opens in the Training Yard, beside the dummy, with the forge panel on the right (under the board on a phone).

- **The rules:** name, icon and colour, level, mana, range, aimed at enemies or friends, one target or an area (5 to 20 ft radius). For enemies: a spell attack, a save (Strength, Dexterity, Constitution or Wisdom, half damage on a save if you like) or always hits, plus damage dice and type. For friends: healing dice. Any of the game's effects (burning, stunned, blessed…) with rounds and a chance. Which kits can learn it. Leave the description empty and the forge writes one.
- **Card art:** a glyph, an uploaded picture (shrunk to 96 px) or **pixel art** drawn on a 16 × 16 grid with a palette, pen, eraser, fill, mirror and a starting spark.
- **The look:** start from an existing effect (Fire Bolt, Ray of Frost, Fireball, Poison Cloud, Healing Word, Bless, Hex, Hold Monster, Lightning), then change how it travels (orb, arc, beam, rain, none), how it lands (sparks, explosion, cloud, pillar, ring, swirl, shards), both colours, size, speed and amount, a flash of light, screen shake and the sound. Pick **Your card picture** under Particles and the spell throws your picture or pixel art instead of glowing dots.
- **Code mode:** switch *How it looks* to **Code (JavaScript)** and write the animation yourself with the `fx` toolkit: particles, bursts, timed loops, moving points, light, shake, and `fx.hit()` for the moment the spell lands. **Load from library** gives eleven commented starting points (Fire Bolt, Fireball, Ray of Frost, Chain Lightning, Meteor Shower, Vortex, Healing Fountain, Shockwave, Black Hole, Picture Confetti, Spirit Wisps), and **? Build guide** opens the reference. The full guide is [docs/spell-animation-guide.md](docs/spell-animation-guide.md). The code runs in your own browser with full access to the page, so only paste code you trust.
- **Cast at the dummy** to try it (casting is free in the forge), or drag its card from the hand. The panel says what the spell is worth next to the game's own spells and how much mana they would charge for it.
- **Save** keeps it in this browser. Heroes of the right kit and level can then prepare it on the Spells tab like any other spell.

## The dungeon creator

Start from solid rock (small to huge) or from a copy of a built-in map. Then build in the 3D view:

- **Left-drag** paints with the selected tool. **Right-drag** turns the camera, **Shift+right-drag** or **WASD** pans, and the wheel zooms. **Ctrl+Z** and **Ctrl+Y** undo and redo.
- **Build tools**: *Carve room* (drag a rectangle out of the rock), *Inspect* (set chest, treasure and hidden-cache contents, gold, and search DCs), *Read-aloud* (drag over an area and write the text players get the first time they walk in), *Boss arena* (drag over a boss's lair: the versus card plays when the party walks in) and *Torch* (click a wall face).
- **Brush**: paint squares one at a time, or **Fill a rectangle** with any tile, wall, trap or object.
- **Palette**: floor, wall, rubble, pillars; doors, secret doors and portcullises; dart, fire and spike traps; sun, moon and star pressure plates; hero start, exit stairs, chests, treasure, hidden caches, healing fonts and inscriptions; and every monster, including bone-pile skeletons that lie in wait.
- **Dungeon settings**: name, description, dark (fog of war) or lit, size, the plate order that opens the portcullis, and the inscription text.
- **Checks** warn about problems, such as a missing hero start, plates with no portcullis to open, exit stairs or monsters that can't be reached from the start, and a boss arena with no boss. A dungeon with no exit stairs is won by defeating every monster.
- **Playtest** drops a level-1 test hero into the dungeon without saving anything. **Back to the editor** returns you where you were.
- Everything saves as you build. Your dungeons appear in the Adventure dungeon list. **Export** saves a dungeon as a `.json` file, and **Import** loads one.

## The Lich's Descent

A seven-floor campaign, picked as one entry in the Adventure menu. Goblins have been stealing the dead of Thornwick, and the trail leads down:

1. **The Overgrown Gate**: a sunlit forest ruin. Swaying grass, a stream with a ford and a stone bridge, a goblin camp, wolves, and a chapel with a stair going down.
2. **The Goblin Warren**: smoky tunnels stacked with crates, barrels and powder kegs, a kennel, a feasting hall with a hearth, a hidden hoard, and Chief Grizzlegut.
3. **The Weeping Caves**: caverns around a black lake, giant spiders, an old shrine with a healing font, and the first of the walking dead.
4. **The Drowned Ossuary**: flooded halls, zombies wading through the water, and bone galleries full of skeletons.
5. **The Sanctum of the Pale Crown**: a cult temple with a fire altar, bone cultists hurling grave-light, and a plate puzzle that opens the way down.
6. **The Burning Halls**: a river of lava with two bridges, wraiths, and the Grave Warden guarding the last stair.
7. **The Throne of Vael Morrow**: the lich on an island in a lake of fire. It raises skeletons every few turns. Defeat everything to win.

Exit stairs lead to the next floor. You keep your hit points, mana, wounds, gear and gold. On every landing the **Stair Merchant** sells potions, mana potions, arrows, rations and torches plus one special item per floor, buys what you don't need (rat tails and bags of teeth at full price), and keeps a shrine where you can **respec** your stat points and talents for 25 gp a level. A party of two to four meets about one extra monster per four, per extra adventurer, and each floor's boss gives a bonus that brings the party to about one level per floor. Each floor has its own read-aloud text and its own wandering monsters. `tools/floors.py` generates the floors and checks that each one can be finished: the exit and every monster are reachable, and the puzzle plates can be reached before the portcullis. Paste its output into `MAPS` after changing it.

## Parties and initiative

Take up to four adventurers into a dungeon. Choose them on the **Where will … go?** screen: bring other heroes from your roster, or **Hire a companion** (a new level-1 hero with rolled stats and a random kit). **Give** in the inventory hands an item to a friend standing next to you (it takes your action in a fight).

When a fight breaks out, **everyone in it rolls initiative**: d20 + Dexterity for adventurers, d20 + their Dex bonus for monsters. Turns go from highest to lowest, shown in the tracker at the top of the screen. On an adventurer's turn the camera moves to them and you control them. On a monster's turn the camera shows who it goes for. Monsters that wake up mid-fight, and skeletons a lich raises, roll and join the order. Fallen adventurers are skipped.

Out of a fight, whoever you control leads and the others follow (**Tab** switches leader). The fog of war clears around everyone. Monsters attack the closest adventurer still standing. Everyone still standing shares the XP from each kill. Your fireballs can hit your friends.

An adventurer at 0 HP falls unconscious. Click them from an adjacent square to help them up (with a potion if you carry one; that uses your action). When the fight ends they get back up with 1 HP, but in a real dungeon every knockout leaves a **wound**: −10% maximum HP each (up to three) until the party makes camp. The run is lost only if the whole party falls.

## Levels, stats and talents

Each level-up brings more HP and mana, any new spells, and **2 stat points**. A pop-up announces it in the voice of a sardonic dungeon that is enjoying your suffering. Spend the points on the character sheet with **+1**. **Undo last choice** takes back points and talents until you close the sheet; after that, only the merchant's shrine can respec you.

Raising an ability to an **even score (12, 14, 16, 18 or 20)** with stat points unlocks a **talent** for that ability. You pick one of its talents you don't have yet:

| Ability | Talents |
|---|---|
| Strength | Heavy Hitter (+2 melee damage), Brute (melee crits on 19–20), Iron Grip (+1d4 with two-handed weapons), Bulwark (-1 to enemy hits while you hold a shield) |
| Dexterity | Quickstep (+10 ft), Sharpshooter (+2 ranged to hit, +20 ft range), Evasion (no damage on a successful Dex save, half on a failed one), Lightning Reflexes (+5 initiative) |
| Constitution | Tough (+2 HP per level), Second Wind (once per fight, heal 1d10 + level when below half), Iron Stomach (can't be poisoned), Unbreakable (once per fight, stay at 1 HP) |
| Intelligence | Arcane Reservoir (+6 mana), Efficient Casting (spells cost 1 less), Elemental Mastery (+3 spell damage), Lingering Magic (+1 round on your effects), Spell Sniper (+2 spell attack, +20 ft range) |
| Wisdom | Keen Senses (+3 Perception), Danger Sense (spot traps within 10 ft), Healer (+4 to your healing), Mana Spring (mana potions restore double; an interrupted camp still refills your mana), Iron Will (can't be stunned) |
| Charisma | Inspiring Presence (party blessed when a fight starts), Commanding Voice (+3 initiative for the party), Lucky (once per fight, reroll a miss), Dread Presence (-1 to enemy hits), Fortune's Favour (+25% gold) |

**Achievements** pop up the same way, with a small reward each: First Blood, Overkill, Ka-BOOM, Interior Decorator, Some Men Just Want to Watch Things Burn, Not Dead Yet, Going Down, Specialist, Four-Way Split, and Boss Fight? More Like Boss Bite.

Freely editing ability scores is now only allowed outside the dungeon (in the Training Yard).

## Magic: mana, buffs and debuffs

Spells cost **mana** instead of spell slots. Max mana is 6 + 4 per level + 2 × casting modifier. **Mana never comes back on its own**: only making camp, Potions of Mana and the Siphoning Charm (+2 mana for every foe you slay) restore it. Weapons do the everyday work. Fire Bolt costs 2 mana, reaches 60 ft and deals 1d10. Up to **eight prepared spells** sit in your hand of cards; choose them on the Spells tab. You learn new spells as you level, from your kit's list:

| Level | Spells |
|---|---|
| 1 | Fire Bolt, Ray of Frost, Hex, Bless, Healing Word, Arcane Ward, Vine Growth |
| 2 | Enfeeble, Elemental Weapon, Poison Cloud, Haste |
| 3 | Wall of Fire, Wall of Ice, Regeneration |
| 4 | Fireball, Hold Monster |

Effects last a few rounds and show as icons on portraits, health bars and the initiative tracker. Each also has its own particles on the board:

- **Debuffs**: Burning (1d6 fire a turn), Poisoned (1d4 a turn, -2 to attack), Bleeding (1d4 a turn), Chilled (half movement, -1 AC), Stunned (lose a turn), Weakened (half damage), Hexed (+1d6 necrotic from every hit).
- **Buffs**: Blessed (+2 to attacks and saves), Hasted (+15 ft, +2 AC), Warded (+4 AC), Regenerating (heal 1d6 a turn), Empowered (+1d6 on weapon hits).

Monsters use them too: spiders poison, cultists hex, wraiths weaken, the lich chills, and the High Priest blesses his followers. Your party's effects keep counting down after a fight, one round for every 2 squares you walk; monsters' effects end with the fight.

**Magic weapons** stream flame, frost, venom, sparks or light from the blade: Flametongue, Frostbrand, Venom Fang, Stormcaller, Dawnbringer (extra damage against the undead) and Bloodthirst (heals you as it hits). **Magic arrows** come in tens and have their own glowing trails: Arrows of Burning, Frostbite Arrows, Venom Arrows and Thunderclap Arrows. Equip them in the Arrows slot and they're used when you shoot with a bow.

## Bosses

Every floor of The Lich's Descent has a boss in a boss arena. When the party walks in, or the boss spots you, a **versus card** slams in with your party on one side and the boss's name and title on the other. A boss health bar then stays at the top of the screen.

| Floor | Boss | Special |
|---|---|---|
| 1 | Grak the Wolf-Rider | his hits make you bleed |
| 2 | Chief Grizzlegut | bleeding cleaves |
| 3 | Mother of Webs | poisons, calls her brood |
| 4 | The Drowned Abbot | weakens you, raises zombies |
| 5 | High Priest Ossian | hexes you, blesses and wards his followers |
| 6 | Grave Warden | stunning blows |
| 7 | Vael Morrow | chilling bolts, raises skeletons |

**At half health every boss changes the fight**, announced in a banner: Grak calls his wolves, Grizzlegut flies into a rage, the Mother of Webs calls her brood, the Abbot floods the floor and heals, Ossian prays and blesses his faithful, the Grave Warden calls his honour guard, and Vael Morrow vanishes into shadow, reappears across the hall and raises the dead. After a stun wears off, a boss shrugs off stuns for 2 rounds, so Hold Monster can't lock it down.

Bosses carry the best loot: the magic weapons and arrows above. Loot on the floor shows its real model and glows in its **rarity** colour (white common, blue magic, violet weird, gold boss loot), which also colours item names everywhere.

In the creator, every new creature and boss is in the palette (Monsters and Bosses). Every new item can go into chests, treasure and hidden caches with Inspect. The Read-aloud tool has a **Boss arena** option.

## Terrain, props and creatures

- **Animated terrain**: long grass that sways in the wind, flowing water (shallow water is difficult terrain, deep water can't be crossed), and slowly churning lava that glows, spits embers and lights the room. Water and lava flow along their channel.
- **Fire**: fireplaces (they turn to face the room), braziers and campfires all crackle, smoke, and light the area around them.
- **Breakables**: crates, barrels, clay urns and powder kegs. Attack them or catch them in a spell. They block movement until smashed, then spill whatever was inside onto the floor. Powder kegs explode for 3d6 fire around them and set off other kegs.
- **New creatures**: goblins and their chief, wolves, giant spiders, zombies, bone cultists (ranged), wraiths (they float), and the lich Vael Morrow.

Everything above is in the creator's palette too. In a dungeon you make, the **Exit stairs lead to** setting can link to another of your dungeons, so you can build your own multi-floor dungeons.

## The Sunken Crypt

The default map is a dungeon (switch maps from the selector at the top left):

- **Fog of war**: you only see what your character can see. Rooms you've explored stay dimly visible.
- **Enemies**: giant rats, skeletons, goblin archers and a boss, the Grave Warden. They wake when they see you, then combat runs in turns: you move and act, end your turn, and the enemies chase, shoot and attack. Outside combat you move freely.
- **Loot**: chests, items on the floor, potions, gold, and weird swords (the Whispering Blade, the Eelblade and Sunderglass), each with its own quirk.
- **A cursed object**: the Drowned Crown. It's great armor, but it won't come off and it drains you. There's a way to break the curse somewhere in the crypt.
- **Secrets**: a secret door and a hidden cache. Use **Search** (a Perception check) near suspicious walls. There are also hidden dart and fire traps; once found, they can be disarmed.
- **A puzzle**: read the inscription, then step on the sun, moon and star plates in the right order to raise the portcullis. The wrong order sets off a dart trap.
- **Win or lose**: reach the stairs to escape and see your stats, or fall and try again.

### Danger

The crypt plays by the real rules, and it fights back:

- **No free casting** in the dungeon. Every spell costs mana and your action. The manual Damage and Heal buttons are only in the Training Yard.
- **Wandering monsters**: every ten squares you walk, the crypt rolls to see whether something finds you. Fireballs, traps and fights make noise, which makes it likelier. You hear them coming first, and the log tells you which direction.
- **Ambushes**: some of the bone piles are skeletons lying in wait. Step next to one and it rises and attacks.
- **Making camp** replaces the long rest. It can restore you fully (HP, mana and wounds), but something may find you while you sleep, and each camp is riskier than the last. The party eats a ration each; if the camp is interrupted, the meal still heals 2d4.
- **Sharp eyes and junk with a use**: the party's best passive Perception spots hidden traps, secret doors and caches within 10 ft as you walk past. A lit torch lets you see 10 ft further for 80 squares; rope gives +2 to disarm traps. Carrying more than Strength × 15 lb costs 10 ft of movement.
- **Atmosphere**: read-aloud text the first time you enter each area, a closer camera, synthesised sound (dripping, distant rumbles, footsteps, steel, monster cries, a heartbeat when you're hurt) and a red pulse at the screen edges when you're low on HP. Turn sound on or off with the **Sound** button.

### Art

- **The hero** is a sculpted paladin miniature. `assets/paladin.glb` (shipped to the page as `assets/paladin-glb.js`) was converted from the paladin STL with `tools/stl2glb.py`. The script splits the sculpt into painted regions (armour, leather, skin, gold, base), keeps the cape and plume as a separate mesh tinted with the character colour, and keeps the blade separate so it can change with the equipped weapon. After re-running the converter, regenerate the `.js` wrapper (it's the GLB as base64). If the model can't load (for example when the page is opened straight from disk without a web server), a simple figure stands in.
- **Every figure** has a square, bevelled base and an edge highlight shader for a painted-mini look.
- **The dungeon** uses procedural brick and flagstone textures with normal maps. It's dressed with runes, banners, chains, skull niches, pillars, bones, candles, puddles, cobwebs, torches and mist.

Maps are plain ASCII grids in `MAPS` with a legend at the top of the script, so new dungeons are easy to add.

## What's in the first loop

- **3D board**: a 14×10 grid of 5 ft squares with walls and brush (difficult terrain, double cost). Drag to orbit, scroll to zoom.
- **Turns**: 30 ft of movement plus one action per round. Dash, End turn.
- **Movement**: lit squares show where you can reach. Hover to preview the path. Diagonals cost 5 ft, and you can't cut wall corners.
- **Character sheet**: six ability scores (click one to roll a check, or edit them), HP, AC, speed, initiative, proficiency, XP and levelling.
- **Inventory**: equip a weapon, armor and shield. AC, attack and the miniature's look update to match. Two-handed weapons and shields exclude each other. Drink potions, drop items, add items.
- **Training dummy**: attack rolls against AC with crits, damage dice and XP when it falls.
- **Spells** (number keys, or the Spells tab): sixteen spells, described under Magic above. They use mana, a save DC and spell attack from Intelligence, and saving throws.
  - Walls of ice block movement. Fire walls burn anyone who walks through and scorch nearby creatures each round. Vines make difficult terrain and can restrain the target, which gives your attacks advantage. All of them last 3 rounds.
  - "Free casting" (Training Yard only) skips the action and mana cost and unlocks every spell, so you can try the effects back to back.
- **Effects pipeline**: HDR rendering with bloom and filmic tone mapping. The fire uses noise shaders, the ice is refractive glass-like material that shatters into physics shards, and the vines grow procedurally with leaves and flowers. There are also pooled dynamic lights, about 11,000 particles, scorch/frost/moss marks on the ground, and camera shake. An effects quality setting (High/Medium/Low) is there for slower devices.
- **Dice tray** and an action log. Progress saves in the browser (localStorage).

## Extending

Maps, items and the character are plain data objects at the top of the script (`MAPS`, `ITEMS`, `newCharacter`, `DUMMY`). Custom maps and enemies will build on those.
