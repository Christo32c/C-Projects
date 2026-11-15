@tool
class_name RigCharacter
extends Node2D
## Root of a character imported from Rig Studio.
##
##   $Hero.set_attachment("weapon", "axe")     # swap one part
##   $Hero.set_attachment("hat", "")           # hide a part
##   $Hero.set_skin("woodcutter")              # swap a whole outfit
##   $Hero.add_attachment("weapon", "fire_sword", preload("res://items/fire_sword.png"))

signal attachment_changed(slot: String, attachment: String)

## skin name -> { slot name -> attachment name }
@export var skins: Dictionary = {}

## Applies a skin by name when set. Slots the skin does not mention are left alone.
@export var skin: String = "":
	set(value):
		skin = value
		if is_node_ready():
			_apply_skin()


func _ready() -> void:
	for slot in _slots():
		slot.attachment_changed.connect(_on_slot_changed.bind(String(slot.name)))
	if skin != "":
		_apply_skin()


func set_skin(skin_name: String) -> void:
	skin = skin_name


func get_skin_names() -> PackedStringArray:
	return PackedStringArray(skins.keys())


func get_slot(slot_name: String) -> RigSlot:
	return get_node_or_null("Slots/" + slot_name) as RigSlot


func get_slot_names() -> PackedStringArray:
	var names := PackedStringArray()
	for slot in _slots():
		names.append(String(slot.name))
	return names


## Shows [param attachment_name] in [param slot_name]. Pass "" to hide the slot.
func set_attachment(slot_name: String, attachment_name: String) -> void:
	var slot := get_slot(slot_name)
	if slot == null:
		push_warning("RigCharacter: no slot named '%s'" % slot_name)
	elif attachment_name != "" and not slot.has_attachment(attachment_name):
		push_warning("RigCharacter: slot '%s' has no attachment '%s'" % [slot_name, attachment_name])
	else:
		slot.attachment = attachment_name


func get_attachment(slot_name: String) -> String:
	var slot := get_slot(slot_name)
	return slot.attachment if slot else ""


func get_attachment_names(slot_name: String) -> PackedStringArray:
	var slot := get_slot(slot_name)
	return slot.get_attachment_names() if slot else PackedStringArray()


## Adds a new image to a slot at runtime and shows it. See [method RigSlot.add_attachment].
func add_attachment(slot_name: String, attachment_name: String, texture: Texture2D,
		placed_like: String = "", show_now: bool = true) -> void:
	var slot := get_slot(slot_name)
	if slot == null:
		push_warning("RigCharacter: no slot named '%s'" % slot_name)
		return
	slot.add_attachment(attachment_name, texture, placed_like)
	if show_now:
		slot.attachment = attachment_name


func get_bone(bone_name: String) -> Bone2D:
	return get_node("Skeleton2D").find_child(bone_name, true, false) as Bone2D


func _apply_skin() -> void:
	if not skins.has(skin):
		if skin != "":
			push_warning("RigCharacter: no skin named '%s'" % skin)
		return
	var map: Dictionary = skins[skin]
	for slot_name: String in map:
		set_attachment(slot_name, map[slot_name])


func _slots() -> Array[RigSlot]:
	var out: Array[RigSlot] = []
	var holder := get_node_or_null("Slots")
	if holder:
		for child in holder.get_children():
			if child is RigSlot:
				out.append(child)
	return out


func _on_slot_changed(attachment_name: String, slot_name: String) -> void:
	attachment_changed.emit(slot_name, attachment_name)
