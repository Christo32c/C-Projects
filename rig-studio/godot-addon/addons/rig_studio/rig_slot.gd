@tool
class_name RigSlot
extends Node2D
## One swappable part of a character (a hand, a head, a hat…). Shows one attachment at a time.
## [member attachment] can be keyed in an AnimationPlayer to swap images mid-animation.

signal attachment_changed(attachment: String)

## name -> { "texture": Texture2D, "position": Vector2, "rotation": float, "scale": Vector2 }
@export var attachments: Dictionary = {}:
	set(value):
		attachments = value
		_apply()

## Name of the attachment to show. Empty hides the slot.
@export var attachment: String = "":
	set(value):
		if attachment == value:
			return
		attachment = value
		_apply()
		attachment_changed.emit(value)


func _ready() -> void:
	_apply()


func get_attachment_names() -> PackedStringArray:
	return PackedStringArray(attachments.keys())


func has_attachment(attachment_name: String) -> bool:
	return attachments.has(attachment_name)


## Registers an attachment at runtime (for items defined by your game rather than in Rig Studio).
## It is placed like [param placed_like] (default: whatever the slot shows now), so a new sword
## drawn on the same canvas size as the old one lines up without any numbers.
func add_attachment(attachment_name: String, texture: Texture2D, placed_like: String = "") -> void:
	var like: Dictionary = attachments.get(placed_like if placed_like != "" else attachment, {})
	if like.is_empty() and not attachments.is_empty():
		like = attachments.values()[0]
	var table := attachments.duplicate() # never edit a table another instance may share
	table[attachment_name] = {
		"texture": texture,
		"position": like.get("position", Vector2.ZERO),
		"rotation": like.get("rotation", 0.0),
		"scale": like.get("scale", Vector2.ONE),
	}
	attachments = table


func _apply() -> void:
	var sprite := get_node_or_null("Sprite") as Sprite2D
	if sprite == null:
		return
	var a: Dictionary = attachments.get(attachment, {})
	sprite.visible = not a.is_empty() and a.get("texture") != null
	if sprite.visible:
		sprite.texture = a["texture"]
		sprite.position = a.get("position", Vector2.ZERO)
		sprite.rotation = a.get("rotation", 0.0)
		sprite.scale = a.get("scale", Vector2.ONE)
