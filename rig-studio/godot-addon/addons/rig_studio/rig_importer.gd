@tool
extends EditorImportPlugin
## Turns a Rig Studio .rig file into a PackedScene (see rig_builder.gd for the layout).

const RigBuilder := preload("rig_builder.gd")


func _get_importer_name() -> String:
	return "rigstudio.rig"


func _get_visible_name() -> String:
	return "Rig Studio Character"


func _get_recognized_extensions() -> PackedStringArray:
	return PackedStringArray(["rig"])


func _get_save_extension() -> String:
	return "scn"


func _get_resource_type() -> String:
	return "PackedScene"


func _get_preset_count() -> int:
	return 1


func _get_preset_name(_preset_index: int) -> String:
	return "Default"


func _get_import_options(_path: String, _preset_index: int) -> Array[Dictionary]:
	return [{"name": "pixel_art", "default_value": false}]


func _get_option_visibility(_path: String, _option_name: StringName, _options: Dictionary) -> bool:
	return true


func _get_priority() -> float:
	return 1.0


func _get_import_order() -> int:
	return 100 # after textures, like other scenes


func _import(source_file: String, save_path: String, options: Dictionary,
		_platform_variants: Array[String], _gen_files: Array[String]) -> Error:
	var text := FileAccess.get_file_as_string(source_file)
	if text.is_empty():
		push_error("Rig Studio: cannot read %s" % source_file)
		return ERR_FILE_CANT_READ
	var data: Variant = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY or data.get("format") != "rigstudio":
		push_error("Rig Studio: %s is not a Rig Studio file" % source_file)
		return ERR_FILE_CORRUPT

	var base_dir := source_file.get_base_dir()
	var load_texture := func(rel: String) -> Texture2D:
		var path := base_dir.path_join(rel)
		if has_method("append_import_external_resource"):
			append_import_external_resource(path) # make sure the PNG is imported first
		return load(path) as Texture2D

	var root := RigBuilder.build(data, load_texture)
	if options.get("pixel_art", false):
		root.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var scene := PackedScene.new()
	var err := scene.pack(root)
	root.free()
	if err != OK:
		return err
	return ResourceSaver.save(scene, "%s.%s" % [save_path, _get_save_extension()])
