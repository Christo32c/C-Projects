# Battle Board: vision check and roadmap

This checks the current design (the game, `design-review.md` and the two spreadsheets) against the three things Battle Board is meant to become.

1. **Table mode.** Friends around a table set it up to play out D&D combat.
2. **Any dungeon, any system.** Anyone can build a dungeon that challenges people to explore and strategise, and can bring any tabletop RPG fight to life.
3. **Online crawling.** People join, make friends and try to beat dungeons together, in the spirit of *Dungeon Crawler Carl* or *Delicious in Dungeon*.

## Verdict

| Goal | How close today | Why |
|---|---|---|
| 1. Table mode | **About a third** | The board, initiative, fog of war and 3D models are there. But the computer is the Game Master: it moves the monsters, rolls every die and enforces its own rules. A table needs to be able to take over. |
| 2. Any dungeon, any system | **About half for dungeons, almost none for "any system"** | The creator is strong for built-in content. The rules, monsters, items and spells are fixed in the code, so a creator can't add their own or change the numbers. |
| 3. Online crawling | **Solo version is solid; online is not started** | The crawler loop (floors, bosses, loot, camp, merchant, achievements) works for one person on one device. There are no accounts, no servers and no way for two devices to share a game. |

The game today is a good single-player dungeon crawler with a level editor. All three goals need the same thing underneath: **the rules and the content have to come out of the code and become data, and the game state has to be shareable between screens.** That is the main finding.

## One decision to make first

Your last round of feedback asked for the rules to feel *less* like D&D. Goal 1 asks it to *simulate* D&D. Both can be true if the game has **rules packs**:

- **Crawler rules** (what exists now: mana, wounds, talents, kits). This is the house system for goal 3.
- **5e-style rules** (spell slots, death saves, conditions, classes). This is for goal 1. The D&D 5.1 rules reference is published under a free licence (CC BY 4.0), so a pack built only from that is safe to ship. The brand names, logos and non-reference monsters are not.
- **Manual rules** (the app tracks positions, HP and turn order; people roll and decide everything). This is what makes "any TTRPG" possible without writing a pack per system.

I recommend this three-pack approach. The alternative is to pick one system and give up either goal 1 or the house style.

## Goal 1: table mode

**What already helps**
- Initiative tracker, turn order and movement ranges.
- Fog of war, line of sight, doors, traps and read-aloud text.
- Up to four heroes on one device, each with a sheet.
- Tactical overhead view.

**What is missing**

| Gap | What it means at the table |
|---|---|
| No Game Master seat | Nobody can move a monster by hand, pick its target, add or remove one mid-fight, or change HP directly. |
| Dice are always rolled by the app | Tables want to roll real dice and type the result, or at least see every roll and be able to override it. |
| One screen for everyone | The GM sees what the players see. A table needs a player view (TV or tablet in the middle) and a private GM view with hidden monsters and notes. |
| Heroes must be made in the app's own system | Players arrive with their own character sheets. They need a quick token: name, picture or model, HP, AC, speed, initiative bonus. |
| Rules can't be loosened | A GM must be able to say "that works" and skip a rule. Today the app refuses illegal moves. |
| No measuring or area templates on demand | Cones, lines and circles should be droppable by hand to settle "who's in the fireball". |
| Monster stats are fixed | A GM needs to enter a stat block for any creature and choose a model for it. |

**Smallest useful version:** a "Run a table" option on any dungeon that turns off the monster AI, lets one person drag any token, edit HP and conditions by hand, reveal fog by room, and choose "app rolls" or "we roll". This needs no server.

## Goal 2: any dungeon, any system

**What already helps**
- Carving, fill brush, traps, secret doors, plates and portcullis puzzles, boss arenas, read-aloud text, chest contents and search difficulty.
- Checks that the dungeon can be finished.
- Playtest from the editor; export and import as a file.

**What is missing**

| Gap | Detail |
|---|---|
| Custom monsters | Choose a model, then set HP, AC, attacks, speed, behaviour and loot. Today only the built-in 21 exist. |
| Custom items and spells | Same idea: creators can place items but can't invent them. |
| More puzzle logic | Only one puzzle type exists (plates in order open a portcullis). Creators need simple triggers: *when* (step here, kill this, pull this lever, round N) *then* (open, close, spawn, flood, show text, end the level). |
| Multi-floor campaigns | The 7-floor Descent is built in code. Creators can't link their own dungeons into a campaign with a shop between floors. |
| Win and lose conditions | Only "reach the stairs" or "kill everything". Add survive N rounds, escort, steal the item, beat the timer. |
| Difficulty rating | The editor should estimate how hard a dungeon is for a party of a given size and level, so "really be challenged" is designed and not guessed. |
| Themes | One stone look. Caves, sewers, forest, a starship deck and a modern street would cover most systems people play. |
| Bring your own art | Import a model or a flat picture as a token. The repository already has a converter tool for 3D print files, but the app doesn't use it. |
| Sharing | A file is the only way to pass a dungeon on. Goal 3 needs a library with ratings and "times beaten". |

The engine work behind most of these is the same: move monsters, items, spells and rules numbers out of the code into a content pack that the editor can read and write.

## Goal 3: online crawling

**What already helps**
- The crawl itself: floors, bosses with phases, rarity, a merchant, camping and rations, wounds, achievements written in a sarcastic announcer voice.
- Parties of four with initiative, shared XP, friendly fire and handing items over.

**What is missing, in build order**

| Step | What it adds | Needs |
|---|---|---|
| 1. Shared session | Two to four devices in one dungeon, each controlling their own hero. Join with a room code. | A small server that owns the game state. The game currently trusts the browser for everything, which lets anyone cheat; online play has to move dice and rules to the server. |
| 2. Accounts and cloud saves | Heroes follow you between devices. | Sign-in and a database. Replaces today's single-browser storage. |
| 3. Finding people | Friends list, invites, open lobbies ("need a healer for floor 4"), quick emotes and pings on the board, text chat. | Moderation tools from day one: report, block, mute. |
| 4. Reasons to come back | A weekly dungeon everyone attempts with the same seed, leaderboards (fastest, fewest wounds, deepest floor), a library of player-made dungeons with clear rates, titles and cosmetics from achievements. | Content pipeline from goal 2. |
| 5. The fantasy | *Dungeon Crawler Carl*: an announcer, loot boxes, sponsors, an audience that reacts, floor timers. *Delicious in Dungeon*: cook what you kill. | See below. |

**Two features that would make it feel like those stories**

- **Cooking.** Monsters already drop junk parts (rat tails, teeth) and camp already needs rations. Turn drops into ingredients and camp into a cooking step: the meal decides how much HP and mana the rest restores and gives a buff for the next floor. This fits your rule that mana only returns from camping, potions and items, and it gives every monster a second purpose.
- **The show.** The announcer voice exists in achievements. Extend it: a floor timer that collapses the level, loot boxes awarded for achievements and opened at safe rooms, and (online) spectators who can vote small gifts or hazards onto a party.

These borrow ideas, not names, characters or text, so there is no rights problem as long as it stays that way.

**Turn-based play online has one known problem:** waiting. Four players plus monsters is slow. Plan for a turn timer, letting all players move at once outside fights, and planning your move while others act.

## Suggested order

| Phase | Work | Serves |
|---|---|---|
| A | Pull rules, monsters, items and spells out of the code into content packs. Split the single 7,400-line file into modules with a build step. | All three |
| B | Table mode on one device: GM controls, manual dice, quick tokens, fog by hand. Second-screen player view on the same network. | Goal 1 |
| C | Creator: custom monsters and items, triggers, win conditions, linked floors, difficulty estimate, themes. | Goal 2 |
| D | Server-owned sessions with room codes, then accounts and cloud saves. | Goals 1 and 3 |
| E | Dungeon library, lobbies, friends, weekly dungeon, leaderboards, moderation. | Goal 3 |
| F | Cooking, loot boxes, the show. | Goal 3 |

Phase A has no visible result for players, but skipping it makes every later phase harder. Phase B is the quickest to show to friends. Phase F's cooking can be built at any time because it only touches the solo game.

## Risks

- **Scope.** Each goal is a product on its own. Table mode and the creator share most of their work; the online community is the expensive one (servers, accounts, moderation, running costs).
- **Single file.** One 7,400-line page was right for a prototype. It will not survive multiplayer. This also means the game can no longer be a single shareable page once it needs a server.
- **Performance.** Phones and tablets at a table are the target for goal 1, and the two unfinished performance items in the design review (merged floor meshes, instanced monsters) matter more there.
- **Licensing.** Keep D&D material to the free rules reference, and keep the two inspirations as inspirations.
