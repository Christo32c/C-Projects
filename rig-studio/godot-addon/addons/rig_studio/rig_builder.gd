@tool
extends RefCounted
## Builds the node tree for a Rig Studio character.
##
##   RigCharacter (Node2D)
##   ├─ Skeleton2D
##   │   └─ root (Bone2D) ─ … child bones, each with a RemoteTransform2D per slot it drives
##   └─ Slots (Node2D)          children are in draw order, back to front
##       └─ <slot> (RigSlot) ─ Sprite (Sprite2D)
##
## Slots live outside the skeleton so draw order is simply the order under "Slots", which keeps a
## whole character sorting as one unit in a y-sorted scene. Bones push their transform to slots.

const CharacterScript := preload("rig_character.gd")
const SlotScript := preload("rig_slot.gd")


## [param load_texture] is a Callable(relative_image_path: String) -> Texture2D.
static func build(data: Dictionary, load_texture: Callable) -> Node2D:
	var root := CharacterScript.new()
	root.name = _node_name(str(data.get("name", "Character")))

	var skeleton := Skeleton2D.new()
	skeleton.name = "Skeleton2D"
	root.add_child(skeleton)
	skeleton.owner = root

	var slots := Node2D.new()
	slots.name = "Slots"
	root.add_child(slots)
	slots.owner = root

	var bones := {} # name -> Bone2D
	for b: Dictionary in data.get("bones", []):
		var bone := Bone2D.new()
		bone.name = _node_name(b["name"])
		bone.position = Vector2(b.get("x", 0.0), b.get("y", 0.0))
		bone.rotation = b.get("rotation", 0.0)
		bone.rest = bone.transform
		bone.set_autocalculate_length_and_angle(false)
		bone.set_length(maxf(b.get("length", 0.0), 1.0))
		bone.set_bone_angle(0.0)
		var parent: Node = bones.get(b.get("parent"), skeleton)
		parent.add_child(bone)
		bone.owner = root
		bones[b["name"]] = bone

	var textures := {} # relative path -> Texture2D
	for s: Dictionary in data.get("slots", []):
		var slot := SlotScript.new()
		slot.name = _node_name(s["name"])
		slots.add_child(slot)
		slot.owner = root

		var sprite := Sprite2D.new()
		sprite.name = "Sprite"
		slot.add_child(sprite)
		sprite.owner = root

		var table := {}
		var defs: Dictionary = s.get("attachments", {})
		for att_name: String in defs:
			var a: Dictionary = defs[att_name]
			var image: String = a.get("image", "")
			if not textures.has(image):
				textures[image] = load_texture.call(image)
			if textures[image] == null:
				push_warning("Rig Studio: missing image '%s' for %s/%s" % [image, s["name"], att_name])
			table[att_name] = {
				"texture": textures[image],
				"position": Vector2(a.get("x", 0.0), a.get("y", 0.0)),
				"rotation": a.get("rotation", 0.0),
				"scale": Vector2(a.get("scaleX", 1.0), a.get("scaleY", 1.0)),
			}
		slot.attachments = table
		slot.attachment = s.get("attachment", "")

		var bone: Bone2D = bones.get(s.get("bone"))
		if bone == null:
			push_warning("Rig Studio: slot '%s' names an unknown bone" % s["name"])
			continue
		var remote := RemoteTransform2D.new()
		remote.name = "To_" + slot.name
		bone.add_child(remote)
		remote.owner = root
		remote.remote_path = remote.get_path_to(slot)
		slot.transform = _transform_to(bone, root) # correct even before the first frame

	root.skins = data.get("skins", {})
	return root


static func _transform_to(node: Node2D, ancestor: Node) -> Transform2D:
	var xf := Transform2D.IDENTITY
	var n: Node = node
	while n != ancestor and n != null:
		if n is Node2D:
			xf = (n as Node2D).transform * xf
		n = n.get_parent()
	return xf


static func _node_name(text: String) -> String:
	var out := text.validate_node_name().strip_edges()
	return out if not out.is_empty() else "unnamed"
