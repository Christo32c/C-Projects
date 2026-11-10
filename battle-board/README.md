# Battle Board

A 3D tabletop battle board for TTRPG-style play, running in the browser with Three.js. It needs no build step.

## Run it

Open `index.html` in a browser, or serve the folder:

```
cd battle-board && python3 -m http.server 8000
```

Three.js loads from jsDelivr, so the first load needs an internet connection.

## What's in the first loop

- **3D board**: a 14×10 grid of 5 ft squares with walls and brush (difficult terrain, double cost). Drag to orbit, scroll to zoom.
- **Turns**: 30 ft of movement plus one action per round. Dash, End turn.
- **Movement**: lit squares show where you can reach. Hover to preview the path. Diagonals cost 5 ft, and you can't cut wall corners.
- **Character sheet**: six ability scores (click one to roll a check, or edit them), HP, AC, speed, initiative, proficiency, XP and levelling.
- **Inventory**: equip a weapon, armor and shield. AC, attack and the miniature's look update to match. Two-handed weapons and shields exclude each other. Drink potions, drop items, add items.
- **Training dummy**: attack rolls against AC with crits, damage dice and XP when it falls.
- **Spells** (keys 1–4, or the Spells tab): Fireball, Wall of Fire, Wall of Ice and Vine Growth. They use spell slots, a save DC from Intelligence, and saving throws for half damage.
  - Walls of ice block movement. Fire walls burn anyone who walks through and scorch nearby creatures each round. Vines make difficult terrain and can restrain the target, which gives your attacks advantage. All of them last 3 rounds.
  - "Free casting" (on by default) skips the action and slot cost so you can try the effects back to back.
- **Effects pipeline**: HDR rendering with bloom and filmic tone mapping. The fire uses noise shaders, the ice is refractive glass-like material that shatters into physics shards, and the vines grow procedurally with leaves and flowers. There are also pooled dynamic lights, about 11,000 particles, scorch/frost/moss marks on the ground, and camera shake. An effects quality setting (High/Medium/Low) is there for slower devices.
- **Dice tray** and an action log. Progress saves in the browser (localStorage).

## Extending

Maps, items and the character are plain data objects at the top of the script (`MAPS`, `ITEMS`, `newCharacter`, `DUMMY`). Custom maps and enemies will build on those.
