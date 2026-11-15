# Rig Studio

A 2D cut-out character rigger for Godot 4. Build a skeleton over your art in the browser, mark which
parts are swappable, and export a character that drops into Godot as a ready-made scene.

Two pieces:

- **The editor** — `index.html`. Open it in a browser; nothing to install.
- **The Godot addon** — `godot-addon/addons/rig_studio/`. Imports the exported `.rig` file as a scene
  and gives you a small API for swapping parts and outfits at runtime.

## The idea

| Term | Meaning |
| --- | --- |
| **Bone** | A joint in the skeleton. Animations move bones, never images. |
| **Slot** | A place on a bone where an image is shown: `head`, `hat`, `weapon`… |
| **Variant** (attachment) | One of the images a slot can show. A `weapon` slot might hold `sword` and `axe`. |
| **Skin** | A saved outfit: which variant every slot shows. |

Because animations only move bones, swapping the image in a slot never breaks an animation. That is
what makes changing a weapon or a hat in-game a one-line call.

## Making a character

1. **Get the art in.** *Import parts…* for separate PNGs, or *Slice image…* to cut one image into
   pieces (auto-detects pieces separated by transparency; you can also drag rectangles by hand).
   *Sample* loads a finished example to poke at.
2. **Arrange the parts** on the canvas so the character looks right. The list under *Draw order*
   controls what is in front (`[` and `]` move the selected part).
3. **Draw bones** with the Bone tool (`B`): drag from a joint toward the end of the limb. Each new
   bone is a child of the selected one, so dragging shoulder → elbow → wrist makes an arm chain.
   Click an existing bone to branch from it.
4. **Bind parts to bones.** *Auto-bind parts to bones* attaches each part to its nearest bone; fix
   any wrong guess with the *Bone* dropdown in Properties.
5. **Check it** in *Pose test* (`P`): drag limbs around. Nothing you do there is saved. If a pivot is
   off, go back to Setup, tick *Adjust bone only*, and move the bone without moving the art.
6. **Add swappable parts.** Select a slot, then press *Variant* on a library image. Position it, and
   click between variants in Properties. Choose *nothing* to make a slot empty (no hat).
7. **Save skins.** Set up a look, then *+ Save current look*.
8. **Export for Godot.** You get `<name>_godot.zip` containing `<name>.rig` and a `<name>_parts/`
   folder of PNGs.

*Save project* writes a `.rigproj` file (rig and images together) that you can reopen later.

Keys: `V` move · `R` rotate (Shift snaps) · `B` bone · `P` pose test · `F` frame · `[` `]` draw order ·
`Del` delete · `Ctrl+Z` / `Ctrl+Y` · wheel zooms · middle-drag or Space-drag pans.

## Using it in Godot

1. Copy `godot-addon/addons/rig_studio` into your project's `addons/` folder and enable **Rig Studio**
   under *Project → Project Settings → Plugins*.
2. Unzip an export anywhere in the project. `<name>.rig` imports as a scene; re-exporting over it
   updates the character.
3. Drag the `.rig` file into a scene, or make an inherited scene from it to add an
   `AnimationPlayer` and animate the bones under `Skeleton2D`.

```gdscript
@onready var hero: RigCharacter = $Puppet

func _ready() -> void:
    hero.set_skin("woodcutter")           # a whole outfit
    hero.set_attachment("weapon", "axe")  # one part
    hero.set_attachment("hat", "")        # hide a part

    # An item your game defines, not Rig Studio. It is placed like the image it replaces,
    # so draw new items on the same canvas size as an existing one and they line up.
    hero.add_attachment("weapon", "fire_sword", preload("res://items/fire_sword.png"))
```

Also available: `get_slot_names()`, `get_attachment_names(slot)`, `get_attachment(slot)`,
`get_skin_names()`, `get_bone(name)`, and the `attachment_changed(slot, attachment)` signal. Each slot
node has an `attachment` property you can key in an `AnimationPlayer` to swap images mid-animation.

The imported scene looks like this:

```
Puppet (RigCharacter)
├─ Skeleton2D
│   └─ root (Bone2D) → child bones
└─ Slots                 children are in draw order, back to front
    └─ weapon (RigSlot) → Sprite (Sprite2D)
```

Slots sit outside the skeleton (bones drive them through `RemoteTransform2D`), so a character draws
as one unit and sorts correctly against others in a y-sorted scene.

`example/` holds an export of the sample character to try the addon with.

## Status

- The editor is tested in Chromium (rigging, slicing, skins, save/open, export).
- The Godot addon targets Godot 4.2+ and **has not yet been run inside Godot** — treat the first
  import as its test and report anything it prints.
- Not built yet: an animation timeline in the editor (animate in Godot for now) and mesh
  deformation. The `.rig` format tags each attachment with `"type": "region"` so meshes can be added
  without breaking existing files.
