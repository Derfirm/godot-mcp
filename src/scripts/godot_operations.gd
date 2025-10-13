#!/usr/bin/env -S godot --headless --script
extends SceneTree

# Debug mode flag
var debug_mode = false

func _init():
    var args = OS.get_cmdline_args()
    
    # Check for debug flag
    debug_mode = "--debug-godot" in args
    
    # Find the script argument and determine the positions of operation and params
    var script_index = args.find("--script")
    if script_index == -1:
        log_error("Could not find --script argument")
        quit(1)
    
    # The operation should be 2 positions after the script path (script_index + 1 is the script path itself)
    var operation_index = script_index + 2
    # The params should be 3 positions after the script path
    var params_index = script_index + 3
    
    if args.size() <= params_index:
        log_error("Usage: godot --headless --script godot_operations.gd <operation> <json_params>")
        log_error("Not enough command-line arguments provided.")
        quit(1)
    
    # Log all arguments for debugging
    log_debug("All arguments: " + str(args))
    log_debug("Script index: " + str(script_index))
    log_debug("Operation index: " + str(operation_index))
    log_debug("Params index: " + str(params_index))
    
    var operation = args[operation_index]
    var params_json = args[params_index]
    
    log_info("Operation: " + operation)
    log_debug("Params JSON: " + params_json)
    
    # Parse JSON using Godot 4.x API
    var json = JSON.new()
    var error = json.parse(params_json)
    var params = null
    
    if error == OK:
        params = json.get_data()
    else:
        log_error("Failed to parse JSON parameters: " + params_json)
        log_error("JSON Error: " + json.get_error_message() + " at line " + str(json.get_error_line()))
        quit(1)
    
    if not params:
        log_error("Failed to parse JSON parameters: " + params_json)
        quit(1)
    
    log_info("Executing operation: " + operation)
    
    match operation:
        "create_scene":
            create_scene(params)
        "add_node":
            add_node(params)
        "remove_node":
            remove_node(params)
        "modify_node":
            modify_node(params)
        "duplicate_node":
            duplicate_node(params)
        "query_node":
            query_node(params)
        "create_script":
            create_script(params)
        "attach_script":
            attach_script(params)
        "validate_script":
            validate_script(params)
        "get_node_methods":
            get_node_methods(params)
        "create_signal":
            create_signal(params)
        "connect_signal":
            connect_signal(params)
        "list_signals":
            list_signals(params)
        "disconnect_signal":
            disconnect_signal(params)
        "import_asset":
            import_asset(params)
        "create_resource":
            create_resource(params)
        "list_assets":
            list_assets(params)
        "configure_import":
            configure_import(params)
        "add_physics_body":
            add_physics_body(params)
        "configure_physics":
            configure_physics(params)
        "setup_collision_layers":
            setup_collision_layers(params)
        "create_area":
            create_area(params)
        "create_ui_element":
            create_ui_element(params)
        "apply_theme":
            apply_theme(params)
        "setup_layout":
            setup_layout(params)
        "create_menu":
            create_menu(params)
        "create_animation_player":
            create_animation_player(params)
        "add_keyframes":
            add_keyframes(params)
        "setup_animation_tree":
            setup_animation_tree(params)
        "add_particles":
            add_particles(params)
        "load_sprite":
            load_sprite(params)
        "export_mesh_library":
            export_mesh_library(params)
        "save_scene":
            save_scene(params)
        "get_uid":
            get_uid(params)
        "resave_resources":
            resave_resources(params)
        "update_project_settings":
            update_project_settings(params)
        "configure_input_map":
            configure_input_map(params)
        "setup_autoload":
            setup_autoload(params)
        "manage_plugins":
            manage_plugins(params)
        "capture_screenshot":
            # Async operation - needs to wait for frames
            await capture_screenshot(params)
            quit()
            return
        "list_missing_assets":
            list_missing_assets(params)
        "remote_tree_dump":
            remote_tree_dump(params)
        "toggle_debug_draw":
            toggle_debug_draw(params)
        _:
            log_error("Unknown operation: " + operation)
            quit(1)
    
    quit()

# Logging functions
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    print("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)

# Get a script by name or path
func get_script_by_name(name_of_class):
    if debug_mode:
        print("Attempting to get script for class: " + name_of_class)
    
    # Try to load it directly if it's a resource path
    if ResourceLoader.exists(name_of_class, "Script"):
        if debug_mode:
            print("Resource exists, loading directly: " + name_of_class)
        var script = load(name_of_class) as Script
        if script:
            if debug_mode:
                print("Successfully loaded script from path")
            return script
        else:
            printerr("Failed to load script from path: " + name_of_class)
    elif debug_mode:
        print("Resource not found, checking global class registry")
    
    # Search for it in the global class registry if it's a class name
    var global_classes = ProjectSettings.get_global_class_list()
    if debug_mode:
        print("Searching through " + str(global_classes.size()) + " global classes")
    
    for global_class in global_classes:
        var found_name_of_class = global_class["class"]
        var found_path = global_class["path"]
        
        if found_name_of_class == name_of_class:
            if debug_mode:
                print("Found matching class in registry: " + found_name_of_class + " at path: " + found_path)
            var script = load(found_path) as Script
            if script:
                if debug_mode:
                    print("Successfully loaded script from registry")
                return script
            else:
                printerr("Failed to load script from registry path: " + found_path)
                break
    
    printerr("Could not find script for class: " + name_of_class)
    return null

# Instantiate a class by name
func instantiate_class(name_of_class):
    if name_of_class.is_empty():
        printerr("Cannot instantiate class: name is empty")
        return null
    
    var result = null
    if debug_mode:
        print("Attempting to instantiate class: " + name_of_class)
    
    # Check if it's a built-in class
    if ClassDB.class_exists(name_of_class):
        if debug_mode:
            print("Class exists in ClassDB, using ClassDB.instantiate()")
        if ClassDB.can_instantiate(name_of_class):
            result = ClassDB.instantiate(name_of_class)
            if result == null:
                printerr("ClassDB.instantiate() returned null for class: " + name_of_class)
        else:
            printerr("Class exists but cannot be instantiated: " + name_of_class)
            printerr("This may be an abstract class or interface that cannot be directly instantiated")
    else:
        # Try to get the script
        if debug_mode:
            print("Class not found in ClassDB, trying to get script")
        var script = get_script_by_name(name_of_class)
        if script is GDScript:
            if debug_mode:
                print("Found GDScript, creating instance")
            result = script.new()
        else:
            printerr("Failed to get script for class: " + name_of_class)
            return null
    
    if result == null:
        printerr("Failed to instantiate class: " + name_of_class)
    elif debug_mode:
        print("Successfully instantiated class: " + name_of_class + " of type: " + result.get_class())
    
    return result

# Create a new scene with a specified root node type
func create_scene(params):
    print("Creating scene: " + params.scene_path)
    
    # Get project paths and log them for debugging
    var project_res_path = "res://"
    var project_user_path = "user://"
    var global_res_path = ProjectSettings.globalize_path(project_res_path)
    var global_user_path = ProjectSettings.globalize_path(project_user_path)
    
    if debug_mode:
        print("Project paths:")
        print("- res:// path: " + project_res_path)
        print("- user:// path: " + project_user_path)
        print("- Globalized res:// path: " + global_res_path)
        print("- Globalized user:// path: " + global_user_path)
        
        # Print some common environment variables for debugging
        print("Environment variables:")
        var env_vars = ["PATH", "HOME", "USER", "TEMP", "GODOT_PATH"]
        for env_var in env_vars:
            if OS.has_environment(env_var):
                print("  " + env_var + " = " + OS.get_environment(env_var))
    
    # Normalize the scene path
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    # Convert resource path to an absolute path
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    # Get the scene directory paths
    var scene_dir_res = full_scene_path.get_base_dir()
    var scene_dir_abs = absolute_scene_path.get_base_dir()
    if debug_mode:
        print("Scene directory (resource path): " + scene_dir_res)
        print("Scene directory (absolute path): " + scene_dir_abs)
    
    # Only do extensive testing in debug mode
    if debug_mode:
        # Try to create a simple test file in the project root to verify write access
        var initial_test_file_path = "res://godot_mcp_test_write.tmp"
        var initial_test_file = FileAccess.open(initial_test_file_path, FileAccess.WRITE)
        if initial_test_file:
            initial_test_file.store_string("Test write access")
            initial_test_file.close()
            print("Successfully wrote test file to project root: " + initial_test_file_path)
            
            # Verify the test file exists
            var initial_test_file_exists = FileAccess.file_exists(initial_test_file_path)
            print("Test file exists check: " + str(initial_test_file_exists))
            
            # Clean up the test file
            if initial_test_file_exists:
                var remove_error = DirAccess.remove_absolute(ProjectSettings.globalize_path(initial_test_file_path))
                print("Test file removal result: " + str(remove_error))
        else:
            var write_error = FileAccess.get_open_error()
            printerr("Failed to write test file to project root: " + str(write_error))
            printerr("This indicates a serious permission issue with the project directory")
    
    # Use traditional if-else statement for better compatibility
    var root_node_type = "Node2D"  # Default value
    if params.has("root_node_type"):
        root_node_type = params.root_node_type
    if debug_mode:
        print("Root node type: " + root_node_type)
    
    # Create the root node
    var scene_root = instantiate_class(root_node_type)
    if not scene_root:
        printerr("Failed to instantiate node of type: " + root_node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    
    scene_root.name = "root"
    if debug_mode:
        print("Root node created with name: " + scene_root.name)
    
    # Set the owner of the root node to itself (important for scene saving)
    scene_root.owner = scene_root
    
    # Pack the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        # Only do extensive testing in debug mode
        if debug_mode:
            # First, let's verify we can write to the project directory
            print("Testing write access to project directory...")
            var test_write_path = "res://test_write_access.tmp"
            var test_write_abs = ProjectSettings.globalize_path(test_write_path)
            var test_file = FileAccess.open(test_write_path, FileAccess.WRITE)
            
            if test_file:
                test_file.store_string("Write test")
                test_file.close()
                print("Successfully wrote test file to project directory")
                
                # Clean up test file
                if FileAccess.file_exists(test_write_path):
                    var remove_error = DirAccess.remove_absolute(test_write_abs)
                    print("Test file removal result: " + str(remove_error))
            else:
                var write_error = FileAccess.get_open_error()
                printerr("Failed to write test file to project directory: " + str(write_error))
                printerr("This may indicate permission issues with the project directory")
                # Continue anyway, as the scene directory might still be writable
        
        # Ensure the scene directory exists using DirAccess
        if debug_mode:
            print("Ensuring scene directory exists...")
        
        # Get the scene directory relative to res://
        var scene_dir_relative = scene_dir_res.substr(6)  # Remove "res://" prefix
        if debug_mode:
            print("Scene directory (relative to res://): " + scene_dir_relative)
        
        # Create the directory if needed
        if not scene_dir_relative.is_empty():
            # First check if it exists
            var dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
            if debug_mode:
                print("Directory exists check (absolute): " + str(dir_exists))
            
            if not dir_exists:
                if debug_mode:
                    print("Directory doesn't exist, creating: " + scene_dir_relative)
                
                # Try to create the directory using DirAccess
                var dir = DirAccess.open("res://")
                if dir == null:
                    var open_error = DirAccess.get_open_error()
                    printerr("Failed to open res:// directory: " + str(open_error))
                    
                    # Try alternative approach with absolute path
                    if debug_mode:
                        print("Trying alternative directory creation approach...")
                    var make_dir_error = DirAccess.make_dir_recursive_absolute(scene_dir_abs)
                    if debug_mode:
                        print("Make directory result (absolute): " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory using absolute path")
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                else:
                    # Create the directory using the DirAccess instance
                    if debug_mode:
                        print("Creating directory using DirAccess: " + scene_dir_relative)
                    var make_dir_error = dir.make_dir_recursive(scene_dir_relative)
                    if debug_mode:
                        print("Make directory result: " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory: " + scene_dir_relative)
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                
                # Verify the directory was created
                dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
                if debug_mode:
                    print("Directory exists check after creation: " + str(dir_exists))
                
                if not dir_exists:
                    printerr("Directory reported as created but does not exist: " + scene_dir_abs)
                    printerr("This may indicate a problem with path resolution or permissions")
                    quit(1)
            elif debug_mode:
                print("Directory already exists: " + scene_dir_abs)
        
        # Save the scene
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        
        if save_error == OK:
            # Only do extensive testing in debug mode
            if debug_mode:
                # Wait a moment to ensure file system has time to complete the write
                print("Waiting for file system to complete write operation...")
                OS.delay_msec(500)  # 500ms delay
                
                # Verify the file was actually created using multiple methods
                var file_check_abs = FileAccess.file_exists(absolute_scene_path)
                print("File exists check (absolute path): " + str(file_check_abs))
                
                var file_check_res = FileAccess.file_exists(full_scene_path)
                print("File exists check (resource path): " + str(file_check_res))
                
                var res_exists = ResourceLoader.exists(full_scene_path)
                print("Resource exists check: " + str(res_exists))
                
                # If file doesn't exist by absolute path, try to create a test file in the same directory
                if not file_check_abs and not file_check_res:
                    printerr("Scene file not found after save. Trying to diagnose the issue...")
                    
                    # Try to write a test file to the same directory
                    var test_scene_file_path = scene_dir_res + "/test_scene_file.tmp"
                    var test_scene_file = FileAccess.open(test_scene_file_path, FileAccess.WRITE)
                    
                    if test_scene_file:
                        test_scene_file.store_string("Test scene directory write")
                        test_scene_file.close()
                        print("Successfully wrote test file to scene directory: " + test_scene_file_path)
                        
                        # Check if the test file exists
                        var test_file_exists = FileAccess.file_exists(test_scene_file_path)
                        print("Test file exists: " + str(test_file_exists))
                        
                        if test_file_exists:
                            # Directory is writable, so the issue is with scene saving
                            printerr("Directory is writable but scene file wasn't created.")
                            printerr("This suggests an issue with ResourceSaver.save() or the packed scene.")
                            
                            # Try saving with a different approach
                            print("Trying alternative save approach...")
                            var alt_save_error = ResourceSaver.save(packed_scene, test_scene_file_path + ".tscn")
                            print("Alternative save result: " + str(alt_save_error))
                            
                            # Clean up test files
                            DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path))
                            if alt_save_error == OK:
                                DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path + ".tscn"))
                        else:
                            printerr("Test file couldn't be verified. This suggests filesystem access issues.")
                    else:
                        var write_error = FileAccess.get_open_error()
                        printerr("Failed to write test file to scene directory: " + str(write_error))
                        printerr("This confirms there are permission or path issues with the scene directory.")
                    
                    # Return error since we couldn't create the scene file
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
                
                # If we get here, at least one of our file checks passed
                if file_check_abs or file_check_res or res_exists:
                    print("Scene file verified to exist!")
                    
                    # Try to load the scene to verify it's valid
                    var test_load = ResourceLoader.load(full_scene_path)
                    if test_load:
                        print("Scene created and verified successfully at: " + params.scene_path)
                        print("Scene file can be loaded correctly.")
                    else:
                        print("Scene file exists but cannot be loaded. It may be corrupted or incomplete.")
                        # Continue anyway since the file exists
                    
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("All file existence checks failed despite successful save operation.")
                    printerr("This indicates a serious issue with file system access or path resolution.")
                    quit(1)
            else:
                # In non-debug mode, just check if the file exists
                var file_exists = FileAccess.file_exists(full_scene_path)
                if file_exists:
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
        else:
            # Handle specific error codes
            var error_message = "Failed to save scene. Error code: " + str(save_error)
            
            if save_error == ERR_CANT_CREATE:
                error_message += " (ERR_CANT_CREATE - Cannot create the scene file)"
            elif save_error == ERR_CANT_OPEN:
                error_message += " (ERR_CANT_OPEN - Cannot open the scene file for writing)"
            elif save_error == ERR_FILE_CANT_WRITE:
                error_message += " (ERR_FILE_CANT_WRITE - Cannot write to the scene file)"
            elif save_error == ERR_FILE_NO_PERMISSION:
                error_message += " (ERR_FILE_NO_PERMISSION - No permission to write the scene file)"
            
            printerr(error_message)
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        printerr("Error code: " + str(result))
        quit(1)

# Add a node to an existing scene
func add_node(params):
    print("Adding node to scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Use traditional if-else statement for better compatibility
    var parent_path = "root"  # Default value
    if params.has("parent_node_path"):
        parent_path = params.parent_node_path
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = scene_root
    if parent_path != "root":
        parent = scene_root.get_node(parent_path.replace("root/", ""))
        if not parent:
            printerr("Parent node not found: " + parent_path)
            quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    if debug_mode:
        print("Instantiating node of type: " + params.node_type)
    var new_node = instantiate_class(params.node_type)
    if not new_node:
        printerr("Failed to instantiate node of type: " + params.node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    new_node.name = params.node_name
    if debug_mode:
        print("New node created with name: " + new_node.name)
    
    if params.has("properties"):
        if debug_mode:
            print("Setting properties on node")
        var properties = params.properties
        for property in properties:
            if debug_mode:
                print("Setting property: " + property + " = " + str(properties[property]))
            new_node.set(property, properties[property])
    
    parent.add_child(new_node)
    new_node.owner = scene_root
    if debug_mode:
        print("Node added to parent and ownership set")
    
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            if debug_mode:
                var file_check_after = FileAccess.file_exists(absolute_scene_path)
                print("File exists check after save: " + str(file_check_after))
                if file_check_after:
                    print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
                else:
                    printerr("File reported as saved but does not exist at: " + absolute_scene_path)
            else:
                print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Remove a node from an existing scene
func remove_node(params):
    print("Removing node from scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the node path
    var node_path = params.node_path
    if debug_mode:
        print("Node path to remove: " + node_path)
    
    # Handle root-relative paths
    var target_node = null
    if node_path == "root":
        printerr("Cannot remove root node")
        quit(1)
    elif node_path.begins_with("root/"):
        var relative_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Relative path: " + relative_path)
        target_node = scene_root.get_node(relative_path)
    else:
        target_node = scene_root.get_node(node_path)
    
    if not target_node:
        printerr("Node not found: " + node_path)
        quit(1)
    
    if debug_mode:
        print("Found node to remove: " + target_node.name)
    
    # Get the UID of the node if it has one (Godot 4.5+ UID support)
    var node_uid = ""
    if target_node.has_meta("_uid"):
        node_uid = target_node.get_meta("_uid")
        if debug_mode:
            print("Node UID: " + str(node_uid))
    
    # Remove the node
    var parent = target_node.get_parent()
    if parent:
        parent.remove_child(target_node)
        target_node.queue_free()
        if debug_mode:
            print("Node removed from parent")
    else:
        printerr("Node has no parent, cannot remove")
        quit(1)
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            if debug_mode:
                var file_check_after = FileAccess.file_exists(absolute_scene_path)
                print("File exists check after save: " + str(file_check_after))
                if file_check_after:
                    print("Node '" + node_path + "' removed successfully")
                    if node_uid != "":
                        print("Note: Node had UID: " + str(node_uid))
                else:
                    printerr("File reported as saved but does not exist at: " + absolute_scene_path)
            else:
                print("Node '" + node_path + "' removed successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Modify properties of an existing node in a scene
func modify_node(params):
    print("Modifying node in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the node path
    var node_path = params.node_path
    if debug_mode:
        print("Node path to modify: " + node_path)
    
    # Handle root-relative paths
    var target_node = null
    if node_path == "root":
        target_node = scene_root
        if debug_mode:
            print("Modifying root node")
    elif node_path.begins_with("root/"):
        var relative_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Relative path: " + relative_path)
        target_node = scene_root.get_node(relative_path)
    else:
        target_node = scene_root.get_node(node_path)
    
    if not target_node:
        printerr("Node not found: " + node_path)
        quit(1)
    
    if debug_mode:
        print("Found node to modify: " + target_node.name)
        print("Node type: " + target_node.get_class())
    
    # Apply properties with type checking (GDScript 2.0)
    var properties = params.properties
    var modified_properties: Array[String] = []
    var failed_properties: Array[String] = []
    
    for property in properties:
        var property_name := property as String
        var property_value = properties[property]
        
        if debug_mode:
            print("Setting property: " + property_name + " = " + str(property_value))
        
        # Check if property exists on the node
        if property_name in target_node:
            # Handle special cases for Transform2D and Transform3D (Godot 4.5+)
            if property_name == "transform" or property_name == "global_transform":
                if target_node is Node2D:
                    # Handle Transform2D
                    if property_value is Dictionary:
                        var transform := Transform2D()
                        if property_value.has("origin"):
                            var origin = property_value.origin
                            if origin is Dictionary:
                                transform.origin = Vector2(origin.get("x", 0.0), origin.get("y", 0.0))
                            elif origin is Vector2:
                                transform.origin = origin
                        if property_value.has("rotation"):
                            transform = transform.rotated(property_value.rotation)
                        if property_value.has("scale"):
                            var scale_val = property_value.scale
                            if scale_val is Dictionary:
                                transform = transform.scaled(Vector2(scale_val.get("x", 1.0), scale_val.get("y", 1.0)))
                            elif scale_val is Vector2:
                                transform = transform.scaled(scale_val)
                        target_node.set(property_name, transform)
                        modified_properties.append(property_name)
                elif target_node is Node3D:
                    # Handle Transform3D
                    if property_value is Dictionary:
                        var transform := Transform3D()
                        if property_value.has("origin"):
                            var origin = property_value.origin
                            if origin is Dictionary:
                                transform.origin = Vector3(origin.get("x", 0.0), origin.get("y", 0.0), origin.get("z", 0.0))
                            elif origin is Vector3:
                                transform.origin = origin
                        if property_value.has("basis"):
                            # Handle basis if provided
                            var basis_val = property_value.basis
                            if basis_val is Basis:
                                transform.basis = basis_val
                        target_node.set(property_name, transform)
                        modified_properties.append(property_name)
            # Handle Vector2 properties
            elif property_value is Dictionary and (property_name == "position" or property_name == "scale" or property_name == "global_position"):
                if target_node is Node2D or target_node is Control:
                    var vec := Vector2(property_value.get("x", 0.0), property_value.get("y", 0.0))
                    target_node.set(property_name, vec)
                    modified_properties.append(property_name)
                elif target_node is Node3D:
                    # For 3D nodes, convert to Vector3
                    var vec := Vector3(property_value.get("x", 0.0), property_value.get("y", 0.0), property_value.get("z", 0.0))
                    target_node.set(property_name, vec)
                    modified_properties.append(property_name)
            # Handle Vector3 properties
            elif property_value is Dictionary and target_node is Node3D:
                if property_name == "position" or property_name == "scale" or property_name == "global_position" or property_name == "rotation":
                    var vec := Vector3(property_value.get("x", 0.0), property_value.get("y", 0.0), property_value.get("z", 0.0))
                    target_node.set(property_name, vec)
                    modified_properties.append(property_name)
            # Handle Color properties
            elif property_value is Dictionary and (property_name == "modulate" or property_name == "self_modulate" or property_name.ends_with("_color")):
                var color := Color(
                    property_value.get("r", 1.0),
                    property_value.get("g", 1.0),
                    property_value.get("b", 1.0),
                    property_value.get("a", 1.0)
                )
                target_node.set(property_name, color)
                modified_properties.append(property_name)
            else:
                # Set property directly
                target_node.set(property_name, property_value)
                modified_properties.append(property_name)
        else:
            if debug_mode:
                push_warning("Property not found on node: " + property_name)
            failed_properties.append(property_name)
    
    if debug_mode:
        print("Modified properties: " + str(modified_properties))
        if not failed_properties.is_empty():
            print("Failed properties: " + str(failed_properties))
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            if debug_mode:
                var file_check_after = FileAccess.file_exists(absolute_scene_path)
                print("File exists check after save: " + str(file_check_after))
                if file_check_after:
                    print("Node '" + node_path + "' modified successfully")
                    print("Modified " + str(modified_properties.size()) + " properties")
                    if not failed_properties.is_empty():
                        print("Warning: " + str(failed_properties.size()) + " properties not found: " + str(failed_properties))
                else:
                    printerr("File reported as saved but does not exist at: " + absolute_scene_path)
            else:
                print("Node '" + node_path + "' modified successfully")
                if not failed_properties.is_empty():
                    print("Warning: Some properties not found: " + str(failed_properties))
        else:
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Duplicate an existing node in a scene with all its children
func duplicate_node(params):
    print("Duplicating node in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the node path
    var node_path = params.node_path
    if debug_mode:
        print("Node path to duplicate: " + node_path)
    
    # Handle root-relative paths
    var source_node = null
    if node_path == "root":
        printerr("Cannot duplicate root node")
        quit(1)
    elif node_path.begins_with("root/"):
        var relative_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Relative path: " + relative_path)
        source_node = scene_root.get_node(relative_path)
    else:
        source_node = scene_root.get_node(node_path)
    
    if not source_node:
        printerr("Node not found: " + node_path)
        quit(1)
    
    if debug_mode:
        print("Found node to duplicate: " + source_node.name)
        print("Node type: " + source_node.get_class())
    
    # Duplicate the node with all children (DUPLICATE_SIGNALS | DUPLICATE_GROUPS | DUPLICATE_SCRIPTS)
    # Using flags: 1 (signals) | 2 (groups) | 4 (scripts) = 7
    var duplicated_node = source_node.duplicate(7)
    if not duplicated_node:
        printerr("Failed to duplicate node")
        quit(1)
    
    # Set the new name
    duplicated_node.name = params.new_name
    if debug_mode:
        print("Duplicated node created with name: " + duplicated_node.name)
    
    # Determine the parent node
    var parent_node = null
    if params.has("parent_node_path"):
        var parent_path = params.parent_node_path
        if debug_mode:
            print("Custom parent path: " + parent_path)
        
        if parent_path == "root":
            parent_node = scene_root
        elif parent_path.begins_with("root/"):
            var relative_parent_path = parent_path.substr(5)
            parent_node = scene_root.get_node(relative_parent_path)
        else:
            parent_node = scene_root.get_node(parent_path)
        
        if not parent_node:
            printerr("Parent node not found: " + parent_path)
            quit(1)
    else:
        # Use the same parent as the source node
        parent_node = source_node.get_parent()
        if debug_mode:
            print("Using same parent as source node: " + parent_node.name)
    
    # Add the duplicated node to the parent
    parent_node.add_child(duplicated_node)
    duplicated_node.owner = scene_root
    if debug_mode:
        print("Duplicated node added to parent")
    
    # Recursively set owner for all children (important for scene saving)
    var children_to_process: Array[Node] = [duplicated_node]
    while not children_to_process.is_empty():
        var current_node = children_to_process.pop_back()
        for child in current_node.get_children():
            child.owner = scene_root
            children_to_process.append(child)
    
    if debug_mode:
        print("Set owner for all children")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            if debug_mode:
                var file_check_after = FileAccess.file_exists(absolute_scene_path)
                print("File exists check after save: " + str(file_check_after))
                if file_check_after:
                    print("Node '" + node_path + "' duplicated successfully as '" + params.new_name + "'")
                else:
                    printerr("File reported as saved but does not exist at: " + absolute_scene_path)
            else:
                print("Node '" + node_path + "' duplicated successfully as '" + params.new_name + "'")
        else:
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Query detailed information about a node in a scene
func query_node(params):
    log_info("Querying node in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the node path
    var node_path = params.node_path
    if debug_mode:
        print("Node path to query: " + node_path)
    
    # Handle root-relative paths
    var target_node = null
    if node_path == "root":
        target_node = scene_root
        if debug_mode:
            print("Querying root node")
    elif node_path.begins_with("root/"):
        var relative_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Relative path: " + relative_path)
        target_node = scene_root.get_node(relative_path)
    else:
        target_node = scene_root.get_node(node_path)
    
    if not target_node:
        printerr("Node not found: " + node_path)
        quit(1)
    
    if debug_mode:
        print("Found node to query: " + target_node.name)
    
    # Gather node information
    var node_info = {
        "name": target_node.name,
        "type": target_node.get_class(),
        "path": target_node.get_path(),
        "children": [],
        "properties": {},
        "signals": [],
        "methods": []
    }
    
    # Get children
    for child in target_node.get_children():
        node_info.children.append({
            "name": child.name,
            "type": child.get_class()
        })
    
    # Get common properties based on node type
    var properties_to_query: Array[String] = []
    
    # Common properties for all nodes
    properties_to_query.append_array(["visible", "process_mode"])
    
    # Node2D specific properties
    if target_node is Node2D:
        properties_to_query.append_array(["position", "rotation", "scale", "global_position", "z_index", "z_as_relative"])
    
    # Node3D specific properties
    if target_node is Node3D:
        properties_to_query.append_array(["position", "rotation", "scale", "global_position", "transform"])
    
    # Control specific properties
    if target_node is Control:
        properties_to_query.append_array(["position", "size", "anchor_left", "anchor_top", "anchor_right", "anchor_bottom"])
    
    # Sprite2D/Sprite3D specific properties
    if target_node is Sprite2D or target_node is Sprite3D:
        properties_to_query.append_array(["texture", "centered", "offset", "flip_h", "flip_v"])
    
    # CollisionShape2D/CollisionShape3D specific properties
    if target_node.get_class() == "CollisionShape2D" or target_node.get_class() == "CollisionShape3D":
        properties_to_query.append_array(["shape", "disabled"])
    
    # PhysicsBody specific properties
    if target_node is RigidBody2D or target_node is RigidBody3D:
        properties_to_query.append_array(["mass", "gravity_scale", "linear_velocity", "angular_velocity"])
    
    if target_node is CharacterBody2D or target_node is CharacterBody3D:
        properties_to_query.append_array(["velocity", "motion_mode"])
    
    # Query properties
    for property_name in properties_to_query:
        if property_name in target_node:
            var value = target_node.get(property_name)
            # Convert complex types to dictionaries for JSON serialization
            if value is Vector2:
                node_info.properties[property_name] = {"x": value.x, "y": value.y}
            elif value is Vector3:
                node_info.properties[property_name] = {"x": value.x, "y": value.y, "z": value.z}
            elif value is Color:
                node_info.properties[property_name] = {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
            elif value is Transform2D:
                node_info.properties[property_name] = {
                    "origin": {"x": value.origin.x, "y": value.origin.y},
                    "rotation": value.get_rotation(),
                    "scale": {"x": value.get_scale().x, "y": value.get_scale().y}
                }
            elif value is Transform3D:
                node_info.properties[property_name] = {
                    "origin": {"x": value.origin.x, "y": value.origin.y, "z": value.origin.z}
                }
            elif value is Resource:
                # For resources, just store the resource path
                node_info.properties[property_name] = value.resource_path if value.resource_path != "" else "<embedded>"
            elif value == null:
                node_info.properties[property_name] = null
            else:
                # For simple types (int, float, bool, string)
                node_info.properties[property_name] = value
    
    # Get signals
    var signal_list = target_node.get_signal_list()
    for signal_info in signal_list:
        var signal_data = {
            "name": signal_info.name,
            "parameters": []
        }
        
        # Get signal parameters
        if signal_info.has("args"):
            for arg in signal_info.args:
                signal_data.parameters.append({
                    "name": arg.name,
                    "type": arg.type
                })
        
        node_info.signals.append(signal_data)
    
    # Get methods (limit to custom methods, not all built-in methods)
    var method_list = target_node.get_method_list()
    for method_info in method_list:
        # Only include methods that are likely custom (not from Object or Node base classes)
        var method_name = method_info.name
        # Skip internal methods and common base class methods
        if not method_name.begins_with("_") and not method_name in ["get", "set", "get_class", "is_class"]:
            var method_data = {
                "name": method_name,
                "parameters": []
            }
            
            # Get method parameters
            if method_info.has("args"):
                for arg in method_info.args:
                    method_data.parameters.append({
                        "name": arg.name,
                        "type": arg.type
                    })
            
            node_info.methods.append(method_data)
    
    # Check for attached script
    if target_node.get_script():
        var script = target_node.get_script()
        node_info["script"] = script.resource_path if script.resource_path != "" else "<embedded>"
    
    # Check for UID (Godot 4.5+)
    if target_node.has_meta("_uid"):
        node_info["uid"] = target_node.get_meta("_uid")
    
    # Output as JSON
    var json = JSON.new()
    var json_string = json.stringify(node_info, "\t")
    print(json_string)

# Load a sprite into a Sprite2D node
func load_sprite(params):
    print("Loading sprite into scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Ensure the texture path starts with res:// for Godot's resource system
    var full_texture_path = params.texture_path
    if not full_texture_path.begins_with("res://"):
        full_texture_path = "res://" + full_texture_path
    
    if debug_mode:
        print("Full texture path (with res://): " + full_texture_path)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Find the sprite node
    var node_path = params.node_path
    if debug_mode:
        print("Original node path: " + node_path)
    
    if node_path.begins_with("root/"):
        node_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Node path after removing 'root/' prefix: " + node_path)
    
    var sprite_node = null
    if node_path == "":
        # If no node path, assume root is the sprite
        sprite_node = scene_root
        if debug_mode:
            print("Using root node as sprite node")
    else:
        sprite_node = scene_root.get_node(node_path)
        if sprite_node and debug_mode:
            print("Found sprite node: " + sprite_node.name)
    
    if not sprite_node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Check if the node is a Sprite2D or compatible type
    if debug_mode:
        print("Node class: " + sprite_node.get_class())
    if not (sprite_node is Sprite2D or sprite_node is Sprite3D or sprite_node is TextureRect):
        printerr("Node is not a sprite-compatible type: " + sprite_node.get_class())
        quit(1)
    
    # Load the texture
    if debug_mode:
        print("Loading texture from: " + full_texture_path)
    var texture = load(full_texture_path)
    if not texture:
        printerr("Failed to load texture: " + full_texture_path)
        quit(1)
    
    if debug_mode:
        print("Texture loaded successfully")
    
    # Set the texture on the sprite
    if sprite_node is Sprite2D or sprite_node is Sprite3D:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on Sprite2D/Sprite3D node")
    elif sprite_node is TextureRect:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on TextureRect node")
    
    # Save the modified scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_scene_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Sprite loaded successfully with texture: " + full_texture_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_scene_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_scene_path)
            else:
                print("Sprite loaded successfully with texture: " + full_texture_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Export a scene as a MeshLibrary resource
func export_mesh_library(params):
    print("Exporting MeshLibrary from scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Ensure the output path starts with res:// for Godot's resource system
    var full_output_path = params.output_path
    if not full_output_path.begins_with("res://"):
        full_output_path = "res://" + full_output_path
    
    if debug_mode:
        print("Full output path (with res://): " + full_output_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    if debug_mode:
        print("Loading scene from: " + full_scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Create a new MeshLibrary
    var mesh_library = MeshLibrary.new()
    if debug_mode:
        print("Created new MeshLibrary")
    
    # Get mesh item names if provided
    var mesh_item_names = params.mesh_item_names if params.has("mesh_item_names") else []
    var use_specific_items = mesh_item_names.size() > 0
    
    if debug_mode:
        if use_specific_items:
            print("Using specific mesh items: " + str(mesh_item_names))
        else:
            print("Using all mesh items in the scene")
    
    # Process all child nodes
    var item_id = 0
    if debug_mode:
        print("Processing child nodes...")
    
    for child in scene_root.get_children():
        if debug_mode:
            print("Checking child node: " + child.name)
        
        # Skip if not using all items and this item is not in the list
        if use_specific_items and not (child.name in mesh_item_names):
            if debug_mode:
                print("Skipping node " + child.name + " (not in specified items list)")
            continue
            
        # Check if the child has a mesh
        var mesh_instance = null
        if child is MeshInstance3D:
            mesh_instance = child
            if debug_mode:
                print("Node " + child.name + " is a MeshInstance3D")
        else:
            # Try to find a MeshInstance3D in the child's descendants
            if debug_mode:
                print("Searching for MeshInstance3D in descendants of " + child.name)
            for descendant in child.get_children():
                if descendant is MeshInstance3D:
                    mesh_instance = descendant
                    if debug_mode:
                        print("Found MeshInstance3D in descendant: " + descendant.name)
                    break
        
        if mesh_instance and mesh_instance.mesh:
            if debug_mode:
                print("Adding mesh: " + child.name)
            
            # Add the mesh to the library
            mesh_library.create_item(item_id)
            mesh_library.set_item_name(item_id, child.name)
            mesh_library.set_item_mesh(item_id, mesh_instance.mesh)
            if debug_mode:
                print("Added mesh to library with ID: " + str(item_id))
            
            # Add collision shape if available
            var collision_added = false
            for collision_child in child.get_children():
                if collision_child is CollisionShape3D and collision_child.shape:
                    mesh_library.set_item_shapes(item_id, [collision_child.shape])
                    if debug_mode:
                        print("Added collision shape from: " + collision_child.name)
                    collision_added = true
                    break
            
            if debug_mode and not collision_added:
                print("No collision shape found for mesh: " + child.name)
            
            # Add preview if available
            if mesh_instance.mesh:
                mesh_library.set_item_preview(item_id, mesh_instance.mesh)
                if debug_mode:
                    print("Added preview for mesh: " + child.name)
            
            item_id += 1
        elif debug_mode:
            print("Node " + child.name + " has no valid mesh")
    
    if debug_mode:
        print("Processed " + str(item_id) + " meshes")
    
    # Create directory if it doesn't exist
    var dir = DirAccess.open("res://")
    if dir == null:
        printerr("Failed to open res:// directory")
        printerr("DirAccess error: " + str(DirAccess.get_open_error()))
        quit(1)
        
    var output_dir = full_output_path.get_base_dir()
    if debug_mode:
        print("Output directory: " + output_dir)
    
    if output_dir != "res://" and not dir.dir_exists(output_dir.substr(6)):  # Remove "res://" prefix
        if debug_mode:
            print("Creating directory: " + output_dir)
        var error = dir.make_dir_recursive(output_dir.substr(6))  # Remove "res://" prefix
        if error != OK:
            printerr("Failed to create directory: " + output_dir + ", error: " + str(error))
            quit(1)
    
    # Save the mesh library
    if item_id > 0:
        if debug_mode:
            print("Saving MeshLibrary to: " + full_output_path)
        var error = ResourceSaver.save(mesh_library, full_output_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_output_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_output_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_output_path)
            else:
                print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
        else:
            printerr("Failed to save MeshLibrary: " + str(error))
    else:
        printerr("No valid meshes found in the scene")

# Find files with a specific extension recursively
func find_files(path, extension):
    var files = []
    var dir = DirAccess.open(path)
    
    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()
        
        while file_name != "":
            if dir.current_is_dir() and not file_name.begins_with("."):
                files.append_array(find_files(path + file_name + "/", extension))
            elif file_name.ends_with(extension):
                files.append(path + file_name)
            
            file_name = dir.get_next()
    
    return files

# Get UID for a specific file
func get_uid(params):
    if not params.has("file_path"):
        printerr("File path is required")
        quit(1)
    
    # Ensure the file path starts with res:// for Godot's resource system
    var file_path = params.file_path
    if not file_path.begins_with("res://"):
        file_path = "res://" + file_path
    
    print("Getting UID for file: " + file_path)
    if debug_mode:
        print("Full file path (with res://): " + file_path)
    
    # Get the absolute path for reference
    var absolute_path = ProjectSettings.globalize_path(file_path)
    if debug_mode:
        print("Absolute file path: " + absolute_path)
    
    # Ensure the file exists
    var file_check = FileAccess.file_exists(file_path)
    if debug_mode:
        print("File exists check: " + str(file_check))
    
    if not file_check:
        printerr("File does not exist at: " + file_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Check if the UID file exists
    var uid_path = file_path + ".uid"
    if debug_mode:
        print("UID file path: " + uid_path)
    
    var uid_check = FileAccess.file_exists(uid_path)
    if debug_mode:
        print("UID file exists check: " + str(uid_check))
    
    var f = FileAccess.open(uid_path, FileAccess.READ)
    
    if f:
        # Read the UID content
        var uid_content = f.get_as_text()
        f.close()
        if debug_mode:
            print("UID content read successfully")
        
        # Return the UID content
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "uid": uid_content.strip_edges(),
            "exists": true
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))
    else:
        if debug_mode:
            print("UID file does not exist or could not be opened")
        
        # UID file doesn't exist
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "exists": false,
            "message": "UID file does not exist for this file. Use resave_resources to generate UIDs."
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))

# Resave all resources to update UID references
func resave_resources(params):
    print("Resaving all resources to update UID references...")
    
    # Get project path if provided
    var project_path = "res://"
    if params.has("project_path"):
        project_path = params.project_path
        if not project_path.begins_with("res://"):
            project_path = "res://" + project_path
        if not project_path.ends_with("/"):
            project_path += "/"
    
    if debug_mode:
        print("Using project path: " + project_path)
    
    # Get all .tscn files
    if debug_mode:
        print("Searching for scene files in: " + project_path)
    var scenes = find_files(project_path, ".tscn")
    if debug_mode:
        print("Found " + str(scenes.size()) + " scenes")
    
    # Resave each scene
    var success_count = 0
    var error_count = 0
    
    for scene_path in scenes:
        if debug_mode:
            print("Processing scene: " + scene_path)
        
        # Check if the scene file exists
        var file_check = FileAccess.file_exists(scene_path)
        if debug_mode:
            print("Scene file exists check: " + str(file_check))
        
        if not file_check:
            printerr("Scene file does not exist at: " + scene_path)
            error_count += 1
            continue
        
        # Load the scene
        var scene = load(scene_path)
        if scene:
            if debug_mode:
                print("Scene loaded successfully, saving...")
            var error = ResourceSaver.save(scene, scene_path)
            if debug_mode:
                print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
            
            if error == OK:
                success_count += 1
                if debug_mode:
                    print("Scene saved successfully: " + scene_path)
                
                    # Verify the file was actually updated
                    var file_check_after = FileAccess.file_exists(scene_path)
                    print("File exists check after save: " + str(file_check_after))
                
                    if not file_check_after:
                        printerr("File reported as saved but does not exist at: " + scene_path)
            else:
                error_count += 1
                printerr("Failed to save: " + scene_path + ", error: " + str(error))
        else:
            error_count += 1
            printerr("Failed to load: " + scene_path)
    
    # Get all .gd and .shader files
    if debug_mode:
        print("Searching for script and shader files in: " + project_path)
    var scripts = find_files(project_path, ".gd") + find_files(project_path, ".shader") + find_files(project_path, ".gdshader")
    if debug_mode:
        print("Found " + str(scripts.size()) + " scripts/shaders")
    
    # Check for missing .uid files
    var missing_uids = 0
    var generated_uids = 0
    
    for script_path in scripts:
        if debug_mode:
            print("Checking UID for: " + script_path)
        var uid_path = script_path + ".uid"
        
        var uid_check = FileAccess.file_exists(uid_path)
        if debug_mode:
            print("UID file exists check: " + str(uid_check))
        
        var f = FileAccess.open(uid_path, FileAccess.READ)
        if not f:
            missing_uids += 1
            if debug_mode:
                print("Missing UID file for: " + script_path + ", generating...")
            
            # Force a save to generate UID
            var res = load(script_path)
            if res:
                var error = ResourceSaver.save(res, script_path)
                if debug_mode:
                    print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
                
                if error == OK:
                    generated_uids += 1
                    if debug_mode:
                        print("Generated UID for: " + script_path)
                    
                        # Verify the UID file was actually created
                        var uid_check_after = FileAccess.file_exists(uid_path)
                        print("UID file exists check after save: " + str(uid_check_after))
                    
                        if not uid_check_after:
                            printerr("UID file reported as generated but does not exist at: " + uid_path)
                else:
                    printerr("Failed to generate UID for: " + script_path + ", error: " + str(error))
            else:
                printerr("Failed to load resource: " + script_path)
        elif debug_mode:
            print("UID file already exists for: " + script_path)
    
    if debug_mode:
        print("Summary:")
        print("- Scenes processed: " + str(scenes.size()))
        print("- Scenes successfully saved: " + str(success_count))
        print("- Scenes with errors: " + str(error_count))
        print("- Scripts/shaders missing UIDs: " + str(missing_uids))
        print("- UIDs successfully generated: " + str(generated_uids))
    print("Resave operation complete")

# Save changes to a scene file
func save_scene(params):
    print("Saving scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Determine save path
    var save_path = params.new_path if params.has("new_path") else full_scene_path
    if params.has("new_path") and not save_path.begins_with("res://"):
        save_path = "res://" + save_path
    
    if debug_mode:
        print("Save path: " + save_path)
    
    # Create directory if it doesn't exist
    if params.has("new_path"):
        var dir = DirAccess.open("res://")
        if dir == null:
            printerr("Failed to open res:// directory")
            printerr("DirAccess error: " + str(DirAccess.get_open_error()))
            quit(1)
            
        var scene_dir = save_path.get_base_dir()
        if debug_mode:
            print("Scene directory: " + scene_dir)
        
        if scene_dir != "res://" and not dir.dir_exists(scene_dir.substr(6)):  # Remove "res://" prefix
            if debug_mode:
                print("Creating directory: " + scene_dir)
            var error = dir.make_dir_recursive(scene_dir.substr(6))  # Remove "res://" prefix
            if error != OK:
                printerr("Failed to create directory: " + scene_dir + ", error: " + str(error))
                quit(1)
    
    # Create a packed scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + save_path)
        var error = ResourceSaver.save(packed_scene, save_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created/updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(save_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Scene saved successfully to: " + save_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(save_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + save_path)
            else:
                print("Scene saved successfully to: " + save_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))


# Create a new GDScript file with template (Godot 4.5+ GDScript 2.0 syntax)
func create_script(params):
    print("Creating script: " + params.script_path)
    
    var full_script_path = params.script_path
    if not full_script_path.begins_with("res://"):
        full_script_path = "res://" + full_script_path
    if debug_mode:
        print("Script path (with res://): " + full_script_path)
    
    var absolute_script_path = ProjectSettings.globalize_path(full_script_path)
    if debug_mode:
        print("Absolute script path: " + absolute_script_path)
    
    # Get template type (default to 'node')
    var template = params.get("template", "node")
    var base_class = params.get("base_class", "")
    
    # Determine base class based on template if not provided
    if base_class.is_empty():
        match template:
            "node":
                base_class = "Node"
            "resource":
                base_class = "Resource"
            "custom":
                base_class = "Node"
    
    if debug_mode:
        print("Template: " + template)
        print("Base class: " + base_class)
    
    # Generate script content using GDScript 2.0 syntax
    var script_content = generate_script_template(template, base_class, params)
    
    # Ensure the script directory exists
    var script_dir_res = full_script_path.get_base_dir()
    var script_dir_relative = script_dir_res.substr(6)  # Remove "res://" prefix
    
    if not script_dir_relative.is_empty():
        var dir = DirAccess.open("res://")
        if dir == null:
            printerr("Failed to open res:// directory")
            quit(1)
        
        if not dir.dir_exists(script_dir_relative):
            if debug_mode:
                print("Creating directory: " + script_dir_relative)
            var error = dir.make_dir_recursive(script_dir_relative)
            if error != OK:
                printerr("Failed to create directory: " + script_dir_relative)
                quit(1)
    
    # Write the script file
    var file = FileAccess.open(full_script_path, FileAccess.WRITE)
    if not file:
        var error = FileAccess.get_open_error()
        printerr("Failed to create script file: " + str(error))
        quit(1)
    
    file.store_string(script_content)
    file.close()
    
    if debug_mode:
        var file_check = FileAccess.file_exists(full_script_path)
        print("File exists check after creation: " + str(file_check))
    
    # Validate the script
    var validation = validate_script_internal(full_script_path)
    
    if validation.valid:
        print("Script created successfully at: " + params.script_path)
    else:
        print("Script created at: " + params.script_path + " but has validation errors:")
        print(JSON.stringify(validation))

# Generate script template with GDScript 2.0 syntax
func generate_script_template(template: String, base_class: String, params: Dictionary) -> String:
    var content = ""
    
    # Class declaration with typed extends (GDScript 2.0)
    content += "extends " + base_class + "\n"
    content += "# " + base_class + " script\n\n"
    
    # Add signals if provided
    if params.has("signals") and params.signals is Array:
        for signal_name in params.signals:
            content += "signal " + signal_name + "\n"
        content += "\n"
    
    # Add exported variables if provided (GDScript 2.0 @export syntax)
    if params.has("exports") and params.exports is Array:
        for export_var in params.exports:
            var var_name = export_var.get("name", "variable")
            var var_type = export_var.get("type", "")
            var default_value = export_var.get("default_value", "")
            
            if not var_type.is_empty():
                content += "@export var " + var_name + ": " + var_type
                if not default_value.is_empty():
                    content += " = " + default_value
                content += "\n"
            else:
                content += "@export var " + var_name
                if not default_value.is_empty():
                    content += " = " + default_value
                content += "\n"
        content += "\n"
    
    # Add template-specific content
    match template:
        "node":
            content += "# Called when the node enters the scene tree for the first time.\n"
            content += "func _ready() -> void:\n"
            content += "\tpass # Replace with function body.\n\n"
            content += "# Called every frame. 'delta' is the elapsed time since the previous frame.\n"
            content += "func _process(delta: float) -> void:\n"
            content += "\tpass\n"
        
        "resource":
            content += "# Resource initialization\n"
            content += "func _init() -> void:\n"
            content += "\tpass # Replace with function body.\n"
        
        "custom":
            content += "# Custom script\n"
            content += "func _init() -> void:\n"
            content += "\tpass # Replace with function body.\n"
    
    return content

# Attach a script to a node in a scene
func attach_script(params):
    print("Attaching script to node in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    var full_script_path = params.script_path
    if not full_script_path.begins_with("res://"):
        full_script_path = "res://" + full_script_path
    
    if debug_mode:
        print("Scene path: " + full_scene_path)
        print("Script path: " + full_script_path)
        print("Node path: " + params.node_path)
    
    # Check if files exist
    if not FileAccess.file_exists(full_scene_path):
        printerr("Scene file does not exist: " + full_scene_path)
        quit(1)
    
    if not FileAccess.file_exists(full_script_path):
        printerr("Script file does not exist: " + full_script_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    var scene_root = scene.instantiate()
    
    # Get the target node
    var node_path = params.node_path
    var target_node = null
    
    if node_path == "root":
        target_node = scene_root
    elif node_path.begins_with("root/"):
        var relative_path = node_path.substr(5)
        target_node = scene_root.get_node(relative_path)
    else:
        target_node = scene_root.get_node(node_path)
    
    if not target_node:
        printerr("Node not found: " + node_path)
        quit(1)
    
    if debug_mode:
        print("Found target node: " + target_node.name)
    
    # Load the script
    var script = load(full_script_path)
    if not script:
        printerr("Failed to load script: " + full_script_path)
        quit(1)
    
    # Attach the script to the node
    target_node.set_script(script)
    
    if debug_mode:
        print("Script attached to node")
    
    # Save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    
    if result == OK:
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)
        if save_error == OK:
            print("Script '" + params.script_path + "' attached successfully to node '" + params.node_path + "'")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Validate a GDScript file (Godot 4.5+ with GDScriptParser)
func validate_script(params):
    print("Validating script: " + params.script_path)
    
    var full_script_path = params.script_path
    if not full_script_path.begins_with("res://"):
        full_script_path = "res://" + full_script_path
    
    var validation = validate_script_internal(full_script_path)
    
    # Output validation result as JSON
    print(JSON.stringify(validation))

# Internal validation function
func validate_script_internal(script_path: String) -> Dictionary:
    if not FileAccess.file_exists(script_path):
        return {
            "valid": false,
            "errors": [{"message": "Script file does not exist", "line": 0, "column": 0, "type": "file"}]
        }
    
    # Load the script
    var script = load(script_path) as GDScript
    if not script:
        return {
            "valid": false,
            "errors": [{"message": "Failed to load script", "line": 0, "column": 0, "type": "load"}]
        }
    
    # In Godot 4.5+, we can use reload() to check for errors
    var reload_error = script.reload()
    
    if reload_error != OK:
        # Script has errors
        # Try to get more detailed error information
        var errors = []
        
        # Read the script source to provide context
        var file = FileAccess.open(script_path, FileAccess.READ)
        if file:
            var source = file.get_as_text()
            file.close()
            
            # Basic error detection (Godot 4.5+ provides better error reporting)
            errors.append({
                "message": "Script reload failed with error code: " + str(reload_error),
                "line": 0,
                "column": 0,
                "type": "syntax"
            })
        
        return {
            "valid": false,
            "errors": errors,
            "warnings": []
        }
    
    # Script is valid
    return {
        "valid": true,
        "errors": [],
        "warnings": []
    }

# Get available methods for a node type
func get_node_methods(params):
    print("Getting methods for node type: " + params.node_type)
    
    var node_type = params.node_type
    
    # Check if the class exists
    if not ClassDB.class_exists(node_type):
        printerr("Node type does not exist: " + node_type)
        var result = {
            "node_type": node_type,
            "methods": [],
            "error": "Node type does not exist in ClassDB"
        }
        print(JSON.stringify(result))
        quit(1)
    
    # Get the method list for the class
    var methods = []
    var method_list = ClassDB.class_get_method_list(node_type, true)
    
    for method_info in method_list:
        var method_data = {
            "name": method_info.name,
            "return_type": method_info.return.type if method_info.has("return") else TYPE_NIL,
            "args": []
        }
        
        # Get argument information
        if method_info.has("args"):
            for arg in method_info.args:
                method_data.args.append({
                    "name": arg.name,
                    "type": arg.type
                })
        
        methods.append(method_data)
    
    # Also get signals
    var signals = []
    var signal_list = ClassDB.class_get_signal_list(node_type, true)
    
    for signal_info in signal_list:
        var signal_data = {
            "name": signal_info.name,
            "args": []
        }
        
        if signal_info.has("args"):
            for arg in signal_info.args:
                signal_data.args.append({
                    "name": arg.name,
                    "type": arg.type
                })
        
        signals.append(signal_data)
    
    # Get properties
    var properties = []
    var property_list = ClassDB.class_get_property_list(node_type, true)
    
    for prop_info in property_list:
        # Filter out internal properties
        if not prop_info.name.begins_with("_"):
            properties.append({
                "name": prop_info.name,
                "type": prop_info.type
            })
    
    var result = {
        "node_type": node_type,
        "methods": methods,
        "signals": signals,
        "properties": properties
    }
    
    print(JSON.stringify(result))

# Import an asset into the Godot project with custom import settings (Godot 4.5+)
func import_asset(params):
    print("Importing asset: " + params.asset_path)
    
    var asset_path = params.asset_path
    if not asset_path.begins_with("res://"):
        asset_path = "res://" + asset_path
    if debug_mode:
        print("Asset path (with res://): " + asset_path)
    
    var absolute_asset_path = ProjectSettings.globalize_path(asset_path)
    if debug_mode:
        print("Absolute asset path: " + absolute_asset_path)
    
    # Check if the asset file exists
    if not FileAccess.file_exists(absolute_asset_path):
        printerr("Asset file does not exist at: " + absolute_asset_path)
        quit(1)
    
    # Get the import path (.import file)
    var import_path = asset_path + ".import"
    var absolute_import_path = ProjectSettings.globalize_path(import_path)
    if debug_mode:
        print("Import file path: " + import_path)
        print("Absolute import path: " + absolute_import_path)
    
    # Check if import settings are provided
    var import_settings = {}
    if params.has("import_settings"):
        import_settings = params.import_settings
        if debug_mode:
            print("Import settings provided: " + JSON.stringify(import_settings))
    
    # Determine asset type
    var asset_type = ""
    if import_settings.has("type"):
        asset_type = import_settings.type
    else:
        # Auto-detect based on file extension
        var extension = asset_path.get_extension().to_lower()
        match extension:
            "png", "jpg", "jpeg", "bmp", "tga", "webp", "svg":
                asset_type = "texture"
            "wav", "ogg", "mp3":
                asset_type = "audio"
            "gltf", "glb", "obj", "fbx", "dae":
                asset_type = "model"
            "ttf", "otf", "woff", "woff2":
                asset_type = "font"
            _:
                asset_type = "unknown"
        if debug_mode:
            print("Auto-detected asset type: " + asset_type)
    
    # Create or update the .import file
    var config = ConfigFile.new()
    
    # Check if .import file already exists
    var import_exists = FileAccess.file_exists(absolute_import_path)
    if import_exists:
        var load_error = config.load(import_path)
        if load_error != OK:
            printerr("Failed to load existing .import file: " + str(load_error))
            # Continue anyway, we'll create a new one
        elif debug_mode:
            print("Loaded existing .import file")
    
    # Set basic import configuration
    config.set_value("remap", "importer", get_importer_for_type(asset_type))
    config.set_value("remap", "type", get_resource_type_for_asset(asset_type))
    
    # Get UID for the asset (Godot 4.5+ UID system)
    var uid = get_or_create_uid(asset_path)
    if uid != "":
        config.set_value("remap", "uid", uid)
        if debug_mode:
            print("Asset UID: " + uid)
    
    # Set path for imported resource
    var imported_path = "res://.godot/imported/" + asset_path.get_file() + "-" + uid.substr(7) + "." + get_import_extension(asset_type)
    config.set_value("remap", "path", imported_path)
    
    # Apply type-specific import settings
    match asset_type:
        "texture":
            apply_texture_import_settings(config, import_settings)
        "audio":
            apply_audio_import_settings(config, import_settings)
        "model":
            apply_model_import_settings(config, import_settings)
        "font":
            apply_font_import_settings(config, import_settings)
    
    # Set source file information
    config.set_value("deps", "source_file", asset_path)
    
    # Save the .import file
    var save_error = config.save(import_path)
    if save_error != OK:
        printerr("Failed to save .import file: " + str(save_error))
        quit(1)
    
    if debug_mode:
        print("Import file saved successfully")
    
    # Trigger reimport by touching the asset file
    # This forces Godot to process the new import settings
    var file = FileAccess.open(asset_path, FileAccess.READ)
    if file:
        file.close()
        if debug_mode:
            print("Asset file accessed to trigger reimport")
    
    # Return success with UID information
    var result = {
        "success": true,
        "asset_path": params.asset_path,
        "asset_type": asset_type,
        "uid": uid,
        "import_path": import_path,
        "imported_resource_path": imported_path
    }
    
    print(JSON.stringify(result))
    print("Asset imported successfully: " + params.asset_path)

# Helper function to get importer name for asset type
func get_importer_for_type(asset_type: String) -> String:
    match asset_type:
        "texture":
            return "texture"
        "audio":
            return "oggvorbisstr"  # Default for audio
        "model":
            return "scene"
        "font":
            return "font_data_dynamic"
        _:
            return "keep"

# Helper function to get resource type for asset
func get_resource_type_for_asset(asset_type: String) -> String:
    match asset_type:
        "texture":
            return "CompressedTexture2D"
        "audio":
            return "AudioStreamOggVorbis"
        "model":
            return "PackedScene"
        "font":
            return "FontFile"
        _:
            return "Resource"

# Helper function to get import extension
func get_import_extension(asset_type: String) -> String:
    match asset_type:
        "texture":
            return "ctex"
        "audio":
            return "oggstr"
        "model":
            return "scn"
        "font":
            return "fontdata"
        _:
            return "res"

# Helper function to get or create UID for a resource (Godot 4.5+)
func get_or_create_uid(resource_path: String) -> String:
    # Check if resource already has a UID
    var uid = ResourceUID.text_to_id(resource_path)
    if uid != ResourceUID.INVALID_ID:
        return ResourceUID.id_to_text(uid)
    
    # Create a new UID
    uid = ResourceUID.create_id()
    ResourceUID.add_id(uid, resource_path)
    
    return ResourceUID.id_to_text(uid)

# Apply texture-specific import settings
func apply_texture_import_settings(config: ConfigFile, settings: Dictionary):
    # Set default texture import parameters
    config.set_value("params", "compress/mode", settings.get("compression", 0))
    config.set_value("params", "compress/high_quality", false)
    config.set_value("params", "compress/lossy_quality", 0.7)
    config.set_value("params", "compress/hdr_compression", 1)
    config.set_value("params", "compress/normal_map", 0)
    config.set_value("params", "compress/channel_pack", 0)
    config.set_value("params", "mipmaps/generate", settings.get("mipmaps", false))
    config.set_value("params", "roughness/mode", 0)
    config.set_value("params", "roughness/src_normal", "")
    config.set_value("params", "process/fix_alpha_border", true)
    config.set_value("params", "process/premult_alpha", false)
    config.set_value("params", "process/normal_map_invert_y", false)
    config.set_value("params", "process/hdr_as_srgb", false)
    config.set_value("params", "process/hdr_clamp_exposure", false)
    config.set_value("params", "process/size_limit", 0)
    config.set_value("params", "detect_3d/compress_to", 1)
    
    # Filtering
    var filter = settings.get("filter", true)
    config.set_value("params", "texture/filter", filter)

# Apply audio-specific import settings
func apply_audio_import_settings(config: ConfigFile, settings: Dictionary):
    config.set_value("params", "loop", false)
    config.set_value("params", "loop_offset", 0.0)
    config.set_value("params", "bpm", 0.0)
    config.set_value("params", "beat_count", 0)
    config.set_value("params", "bar_beats", 4)

# Apply model-specific import settings
func apply_model_import_settings(config: ConfigFile, settings: Dictionary):
    config.set_value("params", "nodes/root_type", "Node3D")
    config.set_value("params", "nodes/root_name", "Scene Root")
    config.set_value("params", "nodes/apply_root_scale", true)
    config.set_value("params", "nodes/root_scale", 1.0)
    config.set_value("params", "meshes/ensure_tangents", true)
    config.set_value("params", "meshes/generate_lods", true)
    config.set_value("params", "meshes/create_shadow_meshes", true)
    config.set_value("params", "meshes/light_baking", 1)
    config.set_value("params", "meshes/lightmap_texel_size", 0.2)
    config.set_value("params", "skins/use_named_skins", true)
    config.set_value("params", "animation/import", true)
    config.set_value("params", "animation/fps", 30)

# Apply font-specific import settings
func apply_font_import_settings(config: ConfigFile, settings: Dictionary):
    config.set_value("params", "antialiasing", 1)
    config.set_value("params", "generate_mipmaps", false)
    config.set_value("params", "multichannel_signed_distance_field", false)
    config.set_value("params", "msdf_pixel_range", 8)
    config.set_value("params", "msdf_size", 48)
    config.set_value("params", "allow_system_fallback", true)
    config.set_value("params", "force_autohinter", false)
    config.set_value("params", "hinting", 1)
    config.set_value("params", "subpixel_positioning", 1)
    config.set_value("params", "oversampling", 0.0)
    config.set_value("params", "fallbacks", [])
    config.set_value("params", "compress", true)

# Create a new resource (Material, Shader, etc.) in the Godot project
func create_resource(params):
    print("Creating resource: " + params.resource_path)
    
    var resource_path = params.resource_path
    if not resource_path.begins_with("res://"):
        resource_path = "res://" + resource_path
    if debug_mode:
        print("Resource path (with res://): " + resource_path)
    
    var absolute_resource_path = ProjectSettings.globalize_path(resource_path)
    if debug_mode:
        print("Absolute resource path: " + absolute_resource_path)
    
    # Get the resource directory
    var resource_dir_res = resource_path.get_base_dir()
    var resource_dir_abs = absolute_resource_path.get_base_dir()
    if debug_mode:
        print("Resource directory (resource path): " + resource_dir_res)
        print("Resource directory (absolute path): " + resource_dir_abs)
    
    # Ensure the resource directory exists
    if not resource_dir_res.is_empty():
        var dir_exists = DirAccess.dir_exists_absolute(resource_dir_abs)
        if not dir_exists:
            if debug_mode:
                print("Directory doesn't exist, creating: " + resource_dir_abs)
            var make_dir_error = DirAccess.make_dir_recursive_absolute(resource_dir_abs)
            if make_dir_error != OK:
                printerr("Failed to create directory: " + resource_dir_abs)
                printerr("Error code: " + str(make_dir_error))
                quit(1)
    
    # Get the resource type
    var resource_type = params.resource_type
    if debug_mode:
        print("Resource type: " + resource_type)
    
    # Create the resource based on type
    var resource: Resource = null
    
    match resource_type:
        "StandardMaterial3D":
            resource = create_standard_material_3d(params)
        "ShaderMaterial":
            resource = create_shader_material(params)
        "Shader":
            resource = create_shader(params)
        "Theme":
            resource = create_theme(params)
        "Environment":
            resource = create_environment(params)
        "PhysicsMaterial":
            resource = create_physics_material(params)
        _:
            printerr("Unsupported resource type: " + resource_type)
            quit(1)
    
    if not resource:
        printerr("Failed to create resource of type: " + resource_type)
        quit(1)
    
    # Apply custom properties if provided
    if params.has("properties"):
        var properties = params.properties
        if debug_mode:
            print("Applying custom properties: " + JSON.stringify(properties))
        
        for property in properties:
            if property in resource:
                resource.set(property, properties[property])
                if debug_mode:
                    print("Set property: " + property + " = " + str(properties[property]))
            else:
                push_warning("Property not found on resource: " + property)
    
    # Save the resource
    var save_error = ResourceSaver.save(resource, resource_path)
    if save_error != OK:
        printerr("Failed to save resource: " + str(save_error))
        quit(1)
    
    if debug_mode:
        print("Resource saved successfully")
    
    # Get UID for the resource (Godot 4.5+)
    var uid = get_or_create_uid(resource_path)
    
    # Return success
    var result = {
        "success": true,
        "resource_path": params.resource_path,
        "resource_type": resource_type,
        "uid": uid
    }
    
    print(JSON.stringify(result))
    print("Resource created successfully: " + params.resource_path)

# Create a StandardMaterial3D resource
func create_standard_material_3d(params) -> StandardMaterial3D:
    var material = StandardMaterial3D.new()
    
    # Set default properties for Godot 4.5+
    material.albedo_color = Color(1, 1, 1, 1)
    material.metallic = 0.0
    material.roughness = 1.0
    material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
    
    if debug_mode:
        print("Created StandardMaterial3D with default properties")
    
    return material

# Create a ShaderMaterial resource
func create_shader_material(params) -> ShaderMaterial:
    var material = ShaderMaterial.new()
    
    # If a shader path is provided in properties, load it
    if params.has("properties") and params.properties.has("shader_path"):
        var shader_path = params.properties.shader_path
        if not shader_path.begins_with("res://"):
            shader_path = "res://" + shader_path
        
        if ResourceLoader.exists(shader_path):
            var shader = load(shader_path) as Shader
            if shader:
                material.shader = shader
                if debug_mode:
                    print("Loaded shader from: " + shader_path)
            else:
                push_warning("Failed to load shader from: " + shader_path)
        else:
            push_warning("Shader file does not exist: " + shader_path)
    
    if debug_mode:
        print("Created ShaderMaterial")
    
    return material

# Create a Shader resource
func create_shader(params) -> Shader:
    var shader = Shader.new()
    
    # Set default shader code (simple pass-through shader for Godot 4.5+)
    var default_shader_code = """shader_type spatial;

void vertex() {
    // Vertex shader code
}

void fragment() {
    // Fragment shader code
    ALBEDO = vec3(1.0, 1.0, 1.0);
}
"""
    
    shader.code = default_shader_code
    
    if debug_mode:
        print("Created Shader with default code")
    
    return shader

# Create a Theme resource
func create_theme(params) -> Theme:
    var theme = Theme.new()
    
    # Set default theme properties
    theme.default_font_size = 16
    
    if debug_mode:
        print("Created Theme with default properties")
    
    return theme

# Create an Environment resource (Godot 4.5+)
func create_environment(params) -> Environment:
    var environment = Environment.new()
    
    # Set default environment properties for Godot 4.5+
    environment.background_mode = Environment.BG_SKY
    environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
    environment.ambient_light_energy = 1.0
    
    # Enable some modern features
    environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    environment.tonemap_exposure = 1.0
    environment.tonemap_white = 1.0
    
    # SDFGI (Global Illumination)
    environment.sdfgi_enabled = false  # Disabled by default for performance
    
    # Glow/Bloom
    environment.glow_enabled = false
    
    # SSAO
    environment.ssao_enabled = false
    
    # SSR
    environment.ssr_enabled = false
    
    if debug_mode:
        print("Created Environment with default Godot 4.5+ properties")
    
    return environment

# Create a PhysicsMaterial resource (Godot 4.5+)
func create_physics_material(params) -> PhysicsMaterial:
    var physics_material = PhysicsMaterial.new()
    
    # Set default physics material properties for Godot 4.5+
    physics_material.friction = 1.0
    physics_material.bounce = 0.0
    physics_material.absorbent = false  # New in Godot 4.5+
    
    if debug_mode:
        print("Created PhysicsMaterial with default Godot 4.5+ properties")
    
    return physics_material

# List all assets in the Godot project with metadata and UIDs (Godot 4.5+)
func list_assets(params):
    print("Listing assets in project")
    
    # Get the directory to search (default to project root)
    var search_dir = "res://"
    if params.has("directory"):
        search_dir = params.directory
        if not search_dir.begins_with("res://"):
            search_dir = "res://" + search_dir
    
    if debug_mode:
        print("Search directory: " + search_dir)
    
    # Get file type filters
    var file_types = []
    if params.has("file_types"):
        file_types = params.file_types
        if debug_mode:
            print("File type filters: " + JSON.stringify(file_types))
    
    # Get recursive flag
    var recursive = true
    if params.has("recursive"):
        recursive = params.recursive
    if debug_mode:
        print("Recursive search: " + str(recursive))
    
    # Collect all assets
    var assets = []
    scan_directory_for_assets(search_dir, file_types, recursive, assets)
    
    if debug_mode:
        print("Found " + str(assets.size()) + " assets")
    
    # Return the result
    var result = {
        "assets": assets,
        "count": assets.size(),
        "search_directory": search_dir,
        "recursive": recursive
    }
    
    print(JSON.stringify(result))
    print("Asset listing complete. Found " + str(assets.size()) + " assets")

# Helper function to recursively scan directories for assets
func scan_directory_for_assets(dir_path: String, file_types: Array, recursive: bool, assets: Array):
    var dir = DirAccess.open(dir_path)
    if not dir:
        push_warning("Failed to open directory: " + dir_path)
        return
    
    dir.list_dir_begin()
    var file_name = dir.get_next()
    
    while file_name != "":
        # Skip hidden files and directories
        if file_name.begins_with("."):
            file_name = dir.get_next()
            continue
        
        var full_path = dir_path.path_join(file_name)
        
        if dir.current_is_dir():
            # Recursively scan subdirectories if enabled
            if recursive:
                scan_directory_for_assets(full_path, file_types, recursive, assets)
        else:
            # Check if file matches the filter
            var should_include = false
            
            if file_types.is_empty():
                # No filter, include all files
                should_include = true
            else:
                # Check if file extension matches any of the filters
                var extension = file_name.get_extension().to_lower()
                for file_type in file_types:
                    if extension == file_type.to_lower():
                        should_include = true
                        break
            
            if should_include:
                # Get asset information
                var asset_info = get_asset_info(full_path)
                if asset_info:
                    assets.append(asset_info)
        
        file_name = dir.get_next()
    
    dir.list_dir_end()

# Helper function to get detailed information about an asset
func get_asset_info(asset_path: String) -> Dictionary:
    var info = {
        "path": asset_path,
        "name": asset_path.get_file(),
        "extension": asset_path.get_extension(),
        "type": "",
        "size": 0,
        "uid": "",
        "dependencies": []
    }
    
    # Get file size
    var absolute_path = ProjectSettings.globalize_path(asset_path)
    if FileAccess.file_exists(absolute_path):
        var file = FileAccess.open(asset_path, FileAccess.READ)
        if file:
            info.size = file.get_length()
            file.close()
    
    # Get UID if available (Godot 4.5+)
    var uid_id = ResourceUID.text_to_id(asset_path)
    if uid_id != ResourceUID.INVALID_ID:
        info.uid = ResourceUID.id_to_text(uid_id)
    
    # Determine resource type
    info.type = get_resource_type_from_path(asset_path)
    
    # Get dependencies if it's a resource
    if ResourceLoader.exists(asset_path):
        var deps = ResourceLoader.get_dependencies(asset_path)
        info.dependencies = deps
    
    return info

# Helper function to determine resource type from file path
func get_resource_type_from_path(path: String) -> String:
    var extension = path.get_extension().to_lower()
    
    match extension:
        "tscn":
            return "PackedScene"
        "scn":
            return "PackedScene"
        "tres":
            # Try to determine the specific resource type
            if ResourceLoader.exists(path):
                var resource = load(path)
                if resource:
                    return resource.get_class()
            return "Resource"
        "res":
            if ResourceLoader.exists(path):
                var resource = load(path)
                if resource:
                    return resource.get_class()
            return "Resource"
        "gd":
            return "GDScript"
        "gdshader", "shader":
            return "Shader"
        "png", "jpg", "jpeg", "bmp", "tga", "webp", "svg":
            return "Texture2D"
        "wav", "ogg", "mp3":
            return "AudioStream"
        "gltf", "glb", "obj", "fbx", "dae":
            return "PackedScene"
        "ttf", "otf", "woff", "woff2":
            return "Font"
        "material":
            return "Material"
        _:
            return "Unknown"

# Configure or modify import settings for an asset
func configure_import(params):
    print("Configuring import settings for asset: " + params.asset_path)
    
    var asset_path = params.asset_path
    if not asset_path.begins_with("res://"):
        asset_path = "res://" + asset_path
    if debug_mode:
        print("Asset path (with res://): " + asset_path)
    
    var absolute_asset_path = ProjectSettings.globalize_path(asset_path)
    if debug_mode:
        print("Absolute asset path: " + absolute_asset_path)
    
    # Check if the asset file exists
    if not FileAccess.file_exists(absolute_asset_path):
        printerr("Asset file does not exist at: " + absolute_asset_path)
        quit(1)
    
    # Get the import path (.import file)
    var import_path = asset_path + ".import"
    var absolute_import_path = ProjectSettings.globalize_path(import_path)
    if debug_mode:
        print("Import file path: " + import_path)
        print("Absolute import path: " + absolute_import_path)
    
    # Load existing .import file or create new one
    var config = ConfigFile.new()
    var import_exists = FileAccess.file_exists(absolute_import_path)
    
    if import_exists:
        var load_error = config.load(import_path)
        if load_error != OK:
            printerr("Failed to load existing .import file: " + str(load_error))
            quit(1)
        if debug_mode:
            print("Loaded existing .import file")
    else:
        if debug_mode:
            print("Creating new .import file")
        
        # Set basic import configuration
        var asset_type = ""
        if params.import_settings.has("type"):
            asset_type = params.import_settings.type
        else:
            # Auto-detect based on file extension
            var extension = asset_path.get_extension().to_lower()
            match extension:
                "png", "jpg", "jpeg", "bmp", "tga", "webp", "svg":
                    asset_type = "texture"
                "wav", "ogg", "mp3":
                    asset_type = "audio"
                "gltf", "glb", "obj", "fbx", "dae":
                    asset_type = "model"
                "ttf", "otf", "woff", "woff2":
                    asset_type = "font"
                _:
                    asset_type = "unknown"
        
        config.set_value("remap", "importer", get_importer_for_type(asset_type))
        config.set_value("remap", "type", get_resource_type_for_asset(asset_type))
        
        # Get or create UID
        var uid = get_or_create_uid(asset_path)
        if uid != "":
            config.set_value("remap", "uid", uid)
        
        # Set path for imported resource
        var imported_path = "res://.godot/imported/" + asset_path.get_file() + "-" + uid.substr(7) + "." + get_import_extension(asset_type)
        config.set_value("remap", "path", imported_path)
        
        # Set source file information
        config.set_value("deps", "source_file", asset_path)
    
    # Get import settings from params
    var import_settings = params.import_settings
    if debug_mode:
        print("Applying import settings: " + JSON.stringify(import_settings))
    
    # Determine asset type
    var asset_type = ""
    if import_settings.has("type"):
        asset_type = import_settings.type
    else:
        # Try to get from existing config
        var importer = config.get_value("remap", "importer", "")
        match importer:
            "texture":
                asset_type = "texture"
            "oggvorbisstr", "wav":
                asset_type = "audio"
            "scene":
                asset_type = "model"
            "font_data_dynamic":
                asset_type = "font"
            _:
                # Auto-detect based on file extension
                var extension = asset_path.get_extension().to_lower()
                match extension:
                    "png", "jpg", "jpeg", "bmp", "tga", "webp", "svg":
                        asset_type = "texture"
                    "wav", "ogg", "mp3":
                        asset_type = "audio"
                    "gltf", "glb", "obj", "fbx", "dae":
                        asset_type = "model"
                    "ttf", "otf", "woff", "woff2":
                        asset_type = "font"
                    _:
                        asset_type = "unknown"
    
    if debug_mode:
        print("Asset type: " + asset_type)
    
    # Apply type-specific import settings
    match asset_type:
        "texture":
            update_texture_import_settings(config, import_settings)
        "audio":
            update_audio_import_settings(config, import_settings)
        "model":
            update_model_import_settings(config, import_settings)
        "font":
            update_font_import_settings(config, import_settings)
    
    # Save the .import file
    var save_error = config.save(import_path)
    if save_error != OK:
        printerr("Failed to save .import file: " + str(save_error))
        quit(1)
    
    if debug_mode:
        print("Import file saved successfully")
    
    # Trigger reimport by touching the asset file
    var file = FileAccess.open(asset_path, FileAccess.READ)
    if file:
        file.close()
        if debug_mode:
            print("Asset file accessed to trigger reimport")
    
    # Return success
    var result = {
        "success": true,
        "asset_path": params.asset_path,
        "asset_type": asset_type,
        "import_path": import_path,
        "settings_applied": import_settings
    }
    
    print(JSON.stringify(result))
    print("Import settings configured successfully for: " + params.asset_path)

# Update texture-specific import settings
func update_texture_import_settings(config: ConfigFile, settings: Dictionary):
    if settings.has("compression"):
        config.set_value("params", "compress/mode", settings.compression)
    
    if settings.has("mipmaps"):
        config.set_value("params", "mipmaps/generate", settings.mipmaps)
    
    if settings.has("filter"):
        config.set_value("params", "texture/filter", settings.filter)
    
    if debug_mode:
        print("Updated texture import settings")

# Update audio-specific import settings
func update_audio_import_settings(config: ConfigFile, settings: Dictionary):
    if settings.has("loop"):
        config.set_value("params", "loop", settings.loop)
    
    if settings.has("loop_offset"):
        config.set_value("params", "loop_offset", settings.loop_offset)
    
    if debug_mode:
        print("Updated audio import settings")

# Update model-specific import settings
func update_model_import_settings(config: ConfigFile, settings: Dictionary):
    if settings.has("root_type"):
        config.set_value("params", "nodes/root_type", settings.root_type)
    
    if settings.has("root_scale"):
        config.set_value("params", "nodes/root_scale", settings.root_scale)
    
    if settings.has("generate_lods"):
        config.set_value("params", "meshes/generate_lods", settings.generate_lods)
    
    if debug_mode:
        print("Updated model import settings")

# Update font-specific import settings
func update_font_import_settings(config: ConfigFile, settings: Dictionary):
    if settings.has("antialiasing"):
        config.set_value("params", "antialiasing", settings.antialiasing)
    
    if settings.has("generate_mipmaps"):
        config.set_value("params", "generate_mipmaps", settings.generate_mipmaps)
    
    if debug_mode:
        print("Updated font import settings")

# Create a custom signal in a GDScript file
func create_signal(params):
    print("Creating signal in script: " + params.script_path)
    
    var full_script_path = params.script_path
    if not full_script_path.begins_with("res://"):
        full_script_path = "res://" + full_script_path
    if debug_mode:
        print("Script path (with res://): " + full_script_path)
    
    var absolute_script_path = ProjectSettings.globalize_path(full_script_path)
    if debug_mode:
        print("Absolute script path: " + absolute_script_path)
    
    if not FileAccess.file_exists(absolute_script_path):
        printerr("Script file does not exist at: " + absolute_script_path)
        quit(1)
    
    # Read the script file
    var file = FileAccess.open(full_script_path, FileAccess.READ)
    if not file:
        printerr("Failed to open script file: " + full_script_path)
        quit(1)
    
    var script_content = file.get_as_text()
    file.close()
    
    if debug_mode:
        print("Script content loaded, length: " + str(script_content.length()))
    
    # Build the signal declaration
    var signal_declaration = "signal " + params.signal_name
    
    # Add parameters if provided
    if params.has("parameters") and params.parameters.size() > 0:
        var param_strings = []
        for param in params.parameters:
            if param.has("type"):
                param_strings.append(param.name + ": " + param.type)
            else:
                param_strings.append(param.name)
        signal_declaration += "(" + ", ".join(param_strings) + ")"
    
    if debug_mode:
        print("Signal declaration: " + signal_declaration)
    
    # Check if signal already exists
    if signal_declaration in script_content or ("signal " + params.signal_name) in script_content:
        printerr("Signal '" + params.signal_name + "' already exists in script")
        quit(1)
    
    # Find the best place to insert the signal
    # Signals should be declared at the top of the script, after extends and before variables
    var lines = script_content.split("\n")
    var insert_index = 0
    var found_extends = false
    var found_class_name = false
    
    for i in range(lines.size()):
        var line = lines[i].strip_edges()
        
        # Skip empty lines and comments at the start
        if line.is_empty() or line.begins_with("#"):
            continue
        
        # Track extends and class_name declarations
        if line.begins_with("extends "):
            found_extends = true
            insert_index = i + 1
        elif line.begins_with("class_name "):
            found_class_name = true
            insert_index = i + 1
        elif found_extends or found_class_name:
            # Insert after extends/class_name but before other declarations
            if not line.begins_with("signal "):
                insert_index = i
                break
        else:
            # If no extends/class_name, insert at the beginning
            insert_index = i
            break
    
    # Insert the signal declaration
    lines.insert(insert_index, signal_declaration)
    var new_content = "\n".join(lines)
    
    # Write the modified script back
    var write_file = FileAccess.open(full_script_path, FileAccess.WRITE)
    if not write_file:
        printerr("Failed to open script file for writing: " + full_script_path)
        quit(1)
    
    write_file.store_string(new_content)
    write_file.close()
    
    if debug_mode:
        print("Script file updated successfully")
    
    print("Signal '" + params.signal_name + "' created successfully in " + params.script_path)

# Connect a signal from one node to a method on another node (Godot 4.5+ Callable API)
func connect_signal(params):
    print("Connecting signal in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get source and target nodes
    var source_node = get_node_by_path(scene_root, params.source_node_path)
    var target_node = get_node_by_path(scene_root, params.target_node_path)
    
    if not source_node:
        printerr("Source node not found: " + params.source_node_path)
        quit(1)
    
    if not target_node:
        printerr("Target node not found: " + params.target_node_path)
        quit(1)
    
    if debug_mode:
        print("Source node: " + source_node.name)
        print("Target node: " + target_node.name)
    
    # Validate signal exists (Godot 4.5+ API)
    var signal_name = params.signal_name as StringName
    if not source_node.has_signal(signal_name):
        printerr("Signal not found on source node: " + signal_name)
        quit(1)
    
    # Validate method exists
    var method_name = params.method_name as StringName
    if not target_node.has_method(method_name):
        printerr("Method not found on target node: " + method_name)
        quit(1)
    
    if debug_mode:
        print("Signal and method validated")
    
    # Get signal info for validation (Godot 4.5+)
    var signal_list = source_node.get_signal_list()
    var signal_info = null
    for sig in signal_list:
        if sig.name == signal_name:
            signal_info = sig
            break
    
    if debug_mode and signal_info:
        print("Signal info: " + str(signal_info))
    
    # Get method info for validation
    var method_list = target_node.get_method_list()
    var method_info = null
    for method in method_list:
        if method.name == method_name:
            method_info = method
            break
    
    if debug_mode and method_info:
        print("Method info: " + str(method_info))
    
    # Connect using modern Callable API (Godot 4.x)
    var callable = Callable(target_node, method_name)
    var flags = params.get("flags", 0) as int
    
    # Bind additional parameters if provided
    if params.has("binds") and params.binds.size() > 0:
        callable = callable.bindv(params.binds)
        if debug_mode:
            print("Bound parameters: " + str(params.binds))
    
    # Check if already connected
    if source_node.is_connected(signal_name, callable):
        printerr("Signal is already connected")
        quit(1)
    
    # Connect the signal
    var error = source_node.connect(signal_name, callable, flags)
    if error != OK:
        printerr("Failed to connect signal: " + str(error))
        quit(1)
    
    if debug_mode:
        print("Signal connected successfully")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Signal '" + params.signal_name + "' connected from " + params.source_node_path + " to " + params.target_node_path + "." + params.method_name + "()")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# List all signals available on a node
func list_signals(params):
    print("Listing signals for node in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the target node
    var target_node = get_node_by_path(scene_root, params.node_path)
    
    if not target_node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    if debug_mode:
        print("Target node: " + target_node.name)
    
    # Get all signals (Godot 4.5+ API)
    var signal_list = target_node.get_signal_list()
    
    # Build result with signal information
    var signals_info = []
    for sig in signal_list:
        var signal_data = {
            "name": sig.name,
            "parameters": []
        }
        
        # Add parameter information
        if sig.has("args"):
            for arg in sig.args:
                var param_data = {
                    "name": arg.name,
                    "type": type_string(arg.type)
                }
                signal_data.parameters.append(param_data)
        
        # Get connections for this signal
        var connections = target_node.get_signal_connection_list(sig.name)
        var connections_info = []
        for conn in connections:
            var conn_data = {
                "target": str(conn.callable.get_object()),
                "method": conn.callable.get_method(),
                "flags": conn.flags
            }
            connections_info.append(conn_data)
        
        signal_data["connections"] = connections_info
        signals_info.append(signal_data)
    
    # Build result
    var result = {
        "node_path": params.node_path,
        "node_type": target_node.get_class(),
        "signals": signals_info,
        "signal_count": signals_info.size()
    }
    
    print(JSON.stringify(result))

# Disconnect a signal connection between two nodes
func disconnect_signal(params):
    print("Disconnecting signal in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get source and target nodes
    var source_node = get_node_by_path(scene_root, params.source_node_path)
    var target_node = get_node_by_path(scene_root, params.target_node_path)
    
    if not source_node:
        printerr("Source node not found: " + params.source_node_path)
        quit(1)
    
    if not target_node:
        printerr("Target node not found: " + params.target_node_path)
        quit(1)
    
    if debug_mode:
        print("Source node: " + source_node.name)
        print("Target node: " + target_node.name)
    
    # Validate signal exists
    var signal_name = params.signal_name as StringName
    if not source_node.has_signal(signal_name):
        printerr("Signal not found on source node: " + signal_name)
        quit(1)
    
    # Create callable for the connection
    var callable = Callable(target_node, params.method_name)
    
    # Check if connected
    if not source_node.is_connected(signal_name, callable):
        printerr("Signal is not connected")
        quit(1)
    
    # Disconnect the signal
    source_node.disconnect(signal_name, callable)
    
    if debug_mode:
        print("Signal disconnected successfully")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Signal '" + params.signal_name + "' disconnected from " + params.source_node_path + " to " + params.target_node_path + "." + params.method_name + "()")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Helper function to get a node by path (handles root-relative paths)
func get_node_by_path(scene_root: Node, node_path: String) -> Node:
    if node_path == "root":
        return scene_root
    elif node_path.begins_with("root/"):
        var relative_path = node_path.substr(5)  # Remove "root/" prefix
        return scene_root.get_node(relative_path)
    else:
        return scene_root.get_node(node_path)

# Helper function to convert Variant.Type to string
func type_string(type_id: int) -> String:
    match type_id:
        TYPE_NIL: return "Variant"
        TYPE_BOOL: return "bool"
        TYPE_INT: return "int"
        TYPE_FLOAT: return "float"
        TYPE_STRING: return "String"
        TYPE_VECTOR2: return "Vector2"
        TYPE_VECTOR2I: return "Vector2i"
        TYPE_RECT2: return "Rect2"
        TYPE_RECT2I: return "Rect2i"
        TYPE_VECTOR3: return "Vector3"
        TYPE_VECTOR3I: return "Vector3i"
        TYPE_TRANSFORM2D: return "Transform2D"
        TYPE_VECTOR4: return "Vector4"
        TYPE_VECTOR4I: return "Vector4i"
        TYPE_PLANE: return "Plane"
        TYPE_QUATERNION: return "Quaternion"
        TYPE_AABB: return "AABB"
        TYPE_BASIS: return "Basis"
        TYPE_TRANSFORM3D: return "Transform3D"
        TYPE_PROJECTION: return "Projection"
        TYPE_COLOR: return "Color"
        TYPE_STRING_NAME: return "StringName"
        TYPE_NODE_PATH: return "NodePath"
        TYPE_RID: return "RID"
        TYPE_OBJECT: return "Object"
        TYPE_CALLABLE: return "Callable"
        TYPE_SIGNAL: return "Signal"
        TYPE_DICTIONARY: return "Dictionary"
        TYPE_ARRAY: return "Array"
        TYPE_PACKED_BYTE_ARRAY: return "PackedByteArray"
        TYPE_PACKED_INT32_ARRAY: return "PackedInt32Array"
        TYPE_PACKED_INT64_ARRAY: return "PackedInt64Array"
        TYPE_PACKED_FLOAT32_ARRAY: return "PackedFloat32Array"
        TYPE_PACKED_FLOAT64_ARRAY: return "PackedFloat64Array"
        TYPE_PACKED_STRING_ARRAY: return "PackedStringArray"
        TYPE_PACKED_VECTOR2_ARRAY: return "PackedVector2Array"
        TYPE_PACKED_VECTOR3_ARRAY: return "PackedVector3Array"
        TYPE_PACKED_COLOR_ARRAY: return "PackedColorArray"
        _: return "Unknown"

# Add a physics body to a scene with collision shape (Godot 4.5+)
func add_physics_body(params):
    print("Adding physics body to scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get parent node
    var parent_path = params.get("parent_node_path", "root")
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = get_node_by_path(scene_root, parent_path)
    if not parent:
        printerr("Parent node not found: " + parent_path)
        quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    # Create physics body
    var body_type = params.body_type
    if debug_mode:
        print("Creating physics body of type: " + body_type)
    
    var body = instantiate_class(body_type)
    if not body:
        printerr("Failed to instantiate physics body of type: " + body_type)
        quit(1)
    
    body.name = params.node_name
    if debug_mode:
        print("Physics body created with name: " + body.name)
    
    # Create collision shape node
    var collision_shape = null
    var is_3d = body_type.ends_with("3D")
    
    if is_3d:
        collision_shape = CollisionShape3D.new()
    else:
        collision_shape = CollisionShape2D.new()
    
    collision_shape.name = "CollisionShape"
    if debug_mode:
        print("Collision shape node created")
    
    # Create shape resource
    var shape_type = params.collision_shape.type
    if debug_mode:
        print("Creating shape of type: " + shape_type)
    
    var shape = instantiate_class(shape_type)
    if not shape:
        printerr("Failed to instantiate shape of type: " + shape_type)
        quit(1)
    
    # Configure shape based on type
    if shape_type == "RectangleShape2D":
        if params.collision_shape.has("size"):
            var size_dict = params.collision_shape.size
            shape.size = Vector2(size_dict.get("x", 32.0), size_dict.get("y", 32.0))
        else:
            shape.size = Vector2(32, 32)
    elif shape_type == "CircleShape2D":
        shape.radius = params.collision_shape.get("radius", 16.0)
    elif shape_type == "CapsuleShape2D":
        shape.radius = params.collision_shape.get("radius", 16.0)
        shape.height = params.collision_shape.get("height", 32.0)
    elif shape_type == "BoxShape3D":
        if params.collision_shape.has("size"):
            var size_dict = params.collision_shape.size
            shape.size = Vector3(size_dict.get("x", 1.0), size_dict.get("y", 1.0), size_dict.get("z", 1.0))
        else:
            shape.size = Vector3(1, 1, 1)
    elif shape_type == "SphereShape3D":
        shape.radius = params.collision_shape.get("radius", 0.5)
    elif shape_type == "CapsuleShape3D":
        shape.radius = params.collision_shape.get("radius", 0.5)
        shape.height = params.collision_shape.get("height", 2.0)
    elif shape_type == "CylinderShape3D":
        shape.radius = params.collision_shape.get("radius", 0.5)
        shape.height = params.collision_shape.get("height", 2.0)
    
    collision_shape.shape = shape
    if debug_mode:
        print("Shape configured")
    
    # Add collision shape to body
    body.add_child(collision_shape)
    collision_shape.owner = scene_root
    if debug_mode:
        print("Collision shape added to body")
    
    # Configure physics properties if provided
    if params.has("physics_properties"):
        var props = params.physics_properties
        if debug_mode:
            print("Configuring physics properties")
        
        # RigidBody properties
        if body is RigidBody2D or body is RigidBody3D:
            if props.has("mass"):
                body.mass = props.mass
                if debug_mode:
                    print("Set mass: " + str(props.mass))
            
            if props.has("gravity_scale"):
                body.gravity_scale = props.gravity_scale
                if debug_mode:
                    print("Set gravity_scale: " + str(props.gravity_scale))
            
            if props.has("linear_damp"):
                body.linear_damp = props.linear_damp
                if debug_mode:
                    print("Set linear_damp: " + str(props.linear_damp))
            
            if props.has("angular_damp"):
                body.angular_damp = props.angular_damp
                if debug_mode:
                    print("Set angular_damp: " + str(props.angular_damp))
            
            # Physics material (Godot 4.5+)
            if props.has("physics_material"):
                var mat = PhysicsMaterial.new()
                var mat_props = props.physics_material
                
                mat.friction = mat_props.get("friction", 1.0)
                mat.bounce = mat_props.get("bounce", 0.0)
                
                # Absorbent property (Godot 4.5+)
                if mat_props.has("absorbent"):
                    mat.absorbent = mat_props.absorbent
                    if debug_mode:
                        print("Set absorbent: " + str(mat_props.absorbent))
                
                body.physics_material_override = mat
                if debug_mode:
                    print("Physics material configured")
        
        # CharacterBody properties
        elif body is CharacterBody2D or body is CharacterBody3D:
            if props.has("motion_mode"):
                var motion_mode_str = props.motion_mode
                if body is CharacterBody2D:
                    if motion_mode_str == "MOTION_MODE_GROUNDED":
                        body.motion_mode = CharacterBody2D.MOTION_MODE_GROUNDED
                    elif motion_mode_str == "MOTION_MODE_FLOATING":
                        body.motion_mode = CharacterBody2D.MOTION_MODE_FLOATING
                else:
                    if motion_mode_str == "MOTION_MODE_GROUNDED":
                        body.motion_mode = CharacterBody3D.MOTION_MODE_GROUNDED
                    elif motion_mode_str == "MOTION_MODE_FLOATING":
                        body.motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
                if debug_mode:
                    print("Set motion_mode: " + motion_mode_str)
            
            if props.has("platform_on_leave"):
                var platform_str = props.platform_on_leave
                if body is CharacterBody2D:
                    if platform_str == "PLATFORM_ON_LEAVE_ADD_VELOCITY":
                        body.platform_on_leave = CharacterBody2D.PLATFORM_ON_LEAVE_ADD_VELOCITY
                    elif platform_str == "PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY":
                        body.platform_on_leave = CharacterBody2D.PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY
                    elif platform_str == "PLATFORM_ON_LEAVE_DO_NOTHING":
                        body.platform_on_leave = CharacterBody2D.PLATFORM_ON_LEAVE_DO_NOTHING
                else:
                    if platform_str == "PLATFORM_ON_LEAVE_ADD_VELOCITY":
                        body.platform_on_leave = CharacterBody3D.PLATFORM_ON_LEAVE_ADD_VELOCITY
                    elif platform_str == "PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY":
                        body.platform_on_leave = CharacterBody3D.PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY
                    elif platform_str == "PLATFORM_ON_LEAVE_DO_NOTHING":
                        body.platform_on_leave = CharacterBody3D.PLATFORM_ON_LEAVE_DO_NOTHING
                if debug_mode:
                    print("Set platform_on_leave: " + platform_str)
    
    # Add body to parent
    parent.add_child(body)
    body.owner = scene_root
    if debug_mode:
        print("Physics body added to parent")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Physics body '" + params.node_name + "' of type '" + body_type + "' added successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Configure physics properties of an existing physics body
func configure_physics(params):
    print("Configuring physics for node: " + params.node_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the node
    var node = get_node_by_path(scene_root, params.node_path)
    if not node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Verify it's a physics body
    if not (node is RigidBody2D or node is RigidBody3D or node is CharacterBody2D or node is CharacterBody3D or node is StaticBody2D or node is StaticBody3D or node is AnimatableBody2D or node is AnimatableBody3D):
        printerr("Node is not a physics body: " + params.node_path)
        quit(1)
    
    if debug_mode:
        print("Found physics body node: " + node.name)
    
    # Configure properties
    var props = params.properties
    if debug_mode:
        print("Configuring physics properties")
    
    # RigidBody properties
    if node is RigidBody2D or node is RigidBody3D:
        if props.has("mass"):
            node.mass = props.mass
            if debug_mode:
                print("Set mass: " + str(props.mass))
        
        if props.has("gravity_scale"):
            node.gravity_scale = props.gravity_scale
            if debug_mode:
                print("Set gravity_scale: " + str(props.gravity_scale))
        
        if props.has("linear_damp"):
            node.linear_damp = props.linear_damp
            if debug_mode:
                print("Set linear_damp: " + str(props.linear_damp))
        
        if props.has("angular_damp"):
            node.angular_damp = props.angular_damp
            if debug_mode:
                print("Set angular_damp: " + str(props.angular_damp))
        
        # Physics material (Godot 4.5+)
        if props.has("physics_material"):
            var mat = PhysicsMaterial.new()
            var mat_props = props.physics_material
            
            mat.friction = mat_props.get("friction", 1.0)
            mat.bounce = mat_props.get("bounce", 0.0)
            
            # Absorbent property (Godot 4.5+)
            if mat_props.has("absorbent"):
                mat.absorbent = mat_props.absorbent
                if debug_mode:
                    print("Set absorbent: " + str(mat_props.absorbent))
            
            node.physics_material_override = mat
            if debug_mode:
                print("Physics material configured")
    
    # CharacterBody properties
    elif node is CharacterBody2D or node is CharacterBody3D:
        if props.has("motion_mode"):
            var motion_mode_str = props.motion_mode
            if node is CharacterBody2D:
                if motion_mode_str == "MOTION_MODE_GROUNDED":
                    node.motion_mode = CharacterBody2D.MOTION_MODE_GROUNDED
                elif motion_mode_str == "MOTION_MODE_FLOATING":
                    node.motion_mode = CharacterBody2D.MOTION_MODE_FLOATING
            else:
                if motion_mode_str == "MOTION_MODE_GROUNDED":
                    node.motion_mode = CharacterBody3D.MOTION_MODE_GROUNDED
                elif motion_mode_str == "MOTION_MODE_FLOATING":
                    node.motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
            if debug_mode:
                print("Set motion_mode: " + motion_mode_str)
        
        if props.has("platform_on_leave"):
            var platform_str = props.platform_on_leave
            if node is CharacterBody2D:
                if platform_str == "PLATFORM_ON_LEAVE_ADD_VELOCITY":
                    node.platform_on_leave = CharacterBody2D.PLATFORM_ON_LEAVE_ADD_VELOCITY
                elif platform_str == "PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY":
                    node.platform_on_leave = CharacterBody2D.PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY
                elif platform_str == "PLATFORM_ON_LEAVE_DO_NOTHING":
                    node.platform_on_leave = CharacterBody2D.PLATFORM_ON_LEAVE_DO_NOTHING
            else:
                if platform_str == "PLATFORM_ON_LEAVE_ADD_VELOCITY":
                    node.platform_on_leave = CharacterBody3D.PLATFORM_ON_LEAVE_ADD_VELOCITY
                elif platform_str == "PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY":
                    node.platform_on_leave = CharacterBody3D.PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY
                elif platform_str == "PLATFORM_ON_LEAVE_DO_NOTHING":
                    node.platform_on_leave = CharacterBody3D.PLATFORM_ON_LEAVE_DO_NOTHING
            if debug_mode:
                print("Set platform_on_leave: " + platform_str)
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Physics properties configured successfully for node: " + params.node_path)
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Setup collision layers and masks for a physics body
func setup_collision_layers(params):
    print("Setting up collision layers for node: " + params.node_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the node
    var node = get_node_by_path(scene_root, params.node_path)
    if not node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Verify it's a physics body or area
    if not (node is PhysicsBody2D or node is PhysicsBody3D or node is Area2D or node is Area3D):
        printerr("Node is not a physics body or area: " + params.node_path)
        quit(1)
    
    if debug_mode:
        print("Found physics node: " + node.name)
    
    # Set collision layer and mask
    if params.has("collision_layer"):
        node.collision_layer = params.collision_layer
        if debug_mode:
            print("Set collision_layer: " + str(params.collision_layer))
    
    if params.has("collision_mask"):
        node.collision_mask = params.collision_mask
        if debug_mode:
            print("Set collision_mask: " + str(params.collision_mask))
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Collision layers configured successfully for node: " + params.node_path)
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Create an Area2D or Area3D node with collision shape
func create_area(params):
    print("Creating area in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get parent node
    var parent_path = params.get("parent_node_path", "root")
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = get_node_by_path(scene_root, parent_path)
    if not parent:
        printerr("Parent node not found: " + parent_path)
        quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    # Create area
    var area_type = params.area_type
    if debug_mode:
        print("Creating area of type: " + area_type)
    
    var area = instantiate_class(area_type)
    if not area:
        printerr("Failed to instantiate area of type: " + area_type)
        quit(1)
    
    area.name = params.node_name
    if debug_mode:
        print("Area created with name: " + area.name)
    
    # Set monitoring properties
    if params.has("monitorable"):
        area.monitorable = params.monitorable
        if debug_mode:
            print("Set monitorable: " + str(params.monitorable))
    
    if params.has("monitoring"):
        area.monitoring = params.monitoring
        if debug_mode:
            print("Set monitoring: " + str(params.monitoring))
    
    # Create collision shape node
    var collision_shape = null
    var is_3d = area_type == "Area3D"
    
    if is_3d:
        collision_shape = CollisionShape3D.new()
    else:
        collision_shape = CollisionShape2D.new()
    
    collision_shape.name = "CollisionShape"
    if debug_mode:
        print("Collision shape node created")
    
    # Create shape resource
    var shape_type = params.collision_shape.type
    if debug_mode:
        print("Creating shape of type: " + shape_type)
    
    var shape = instantiate_class(shape_type)
    if not shape:
        printerr("Failed to instantiate shape of type: " + shape_type)
        quit(1)
    
    # Configure shape based on type
    if shape_type == "RectangleShape2D":
        if params.collision_shape.has("size"):
            var size_dict = params.collision_shape.size
            shape.size = Vector2(size_dict.get("x", 32.0), size_dict.get("y", 32.0))
        else:
            shape.size = Vector2(32, 32)
    elif shape_type == "CircleShape2D":
        shape.radius = params.collision_shape.get("radius", 16.0)
    elif shape_type == "CapsuleShape2D":
        shape.radius = params.collision_shape.get("radius", 16.0)
        shape.height = params.collision_shape.get("height", 32.0)
    elif shape_type == "BoxShape3D":
        if params.collision_shape.has("size"):
            var size_dict = params.collision_shape.size
            shape.size = Vector3(size_dict.get("x", 1.0), size_dict.get("y", 1.0), size_dict.get("z", 1.0))
        else:
            shape.size = Vector3(1, 1, 1)
    elif shape_type == "SphereShape3D":
        shape.radius = params.collision_shape.get("radius", 0.5)
    elif shape_type == "CapsuleShape3D":
        shape.radius = params.collision_shape.get("radius", 0.5)
        shape.height = params.collision_shape.get("height", 2.0)
    
    collision_shape.shape = shape
    if debug_mode:
        print("Shape configured")
    
    # Add collision shape to area
    area.add_child(collision_shape)
    collision_shape.owner = scene_root
    if debug_mode:
        print("Collision shape added to area")
    
    # Add area to parent
    parent.add_child(area)
    area.owner = scene_root
    if debug_mode:
        print("Area added to parent")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Area '" + params.node_name + "' of type '" + area_type + "' created successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Create a UI element (Control node) with proper anchors
func create_ui_element(params):
    print("Creating UI element in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get parent node
    var parent_path = params.get("parent_node_path", "root")
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = get_node_by_path(scene_root, parent_path)
    if not parent:
        printerr("Parent node not found: " + parent_path)
        quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    # Create UI element
    var element_type = params.element_type
    if debug_mode:
        print("Creating UI element of type: " + element_type)
    
    var element = instantiate_class(element_type)
    if not element:
        printerr("Failed to instantiate UI element of type: " + element_type)
        quit(1)
    
    # Verify it's a Control node
    if not element is Control:
        printerr("Element type is not a Control node: " + element_type)
        quit(1)
    
    element.name = params.element_name
    if debug_mode:
        print("UI element created with name: " + element.name)
    
    # Set anchors if provided (Godot 4.x anchor system)
    if params.has("anchors"):
        var anchors = params.anchors
        if debug_mode:
            print("Setting anchors")
        
        if anchors.has("anchor_left"):
            element.anchor_left = anchors.anchor_left
            if debug_mode:
                print("Set anchor_left: " + str(anchors.anchor_left))
        
        if anchors.has("anchor_top"):
            element.anchor_top = anchors.anchor_top
            if debug_mode:
                print("Set anchor_top: " + str(anchors.anchor_top))
        
        if anchors.has("anchor_right"):
            element.anchor_right = anchors.anchor_right
            if debug_mode:
                print("Set anchor_right: " + str(anchors.anchor_right))
        
        if anchors.has("anchor_bottom"):
            element.anchor_bottom = anchors.anchor_bottom
            if debug_mode:
                print("Set anchor_bottom: " + str(anchors.anchor_bottom))
    
    # Set properties if provided
    if params.has("properties"):
        var properties = params.properties
        if debug_mode:
            print("Setting properties")
        
        for property in properties:
            if property in element:
                var value = properties[property]
                
                # Handle special cases for common properties
                if property == "size" and value is Dictionary:
                    element.size = Vector2(value.get("x", 0.0), value.get("y", 0.0))
                    if debug_mode:
                        print("Set size: " + str(element.size))
                elif property == "position" and value is Dictionary:
                    element.position = Vector2(value.get("x", 0.0), value.get("y", 0.0))
                    if debug_mode:
                        print("Set position: " + str(element.position))
                elif property == "custom_minimum_size" and value is Dictionary:
                    element.custom_minimum_size = Vector2(value.get("x", 0.0), value.get("y", 0.0))
                    if debug_mode:
                        print("Set custom_minimum_size: " + str(element.custom_minimum_size))
                else:
                    element.set(property, value)
                    if debug_mode:
                        print("Set " + property + ": " + str(value))
            else:
                push_warning("Property not found on " + element_type + ": " + property)
    
    # Add element to parent
    parent.add_child(element)
    element.owner = scene_root
    if debug_mode:
        print("UI element added to parent")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("UI element '" + params.element_name + "' of type '" + element_type + "' created successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Apply a Theme resource to a Control node
func apply_theme(params):
    print("Applying theme to node: " + params.node_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the node
    var node = get_node_by_path(scene_root, params.node_path)
    if not node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Verify it's a Control node
    if not node is Control:
        printerr("Node is not a Control node: " + params.node_path)
        quit(1)
    
    if debug_mode:
        print("Found Control node: " + node.name)
    
    # Load the theme
    var theme_path = params.theme_path
    if not theme_path.begins_with("res://"):
        theme_path = "res://" + theme_path
    if debug_mode:
        print("Theme path (with res://): " + theme_path)
    
    var theme = load(theme_path)
    if not theme:
        printerr("Failed to load theme: " + theme_path)
        quit(1)
    
    if not theme is Theme:
        printerr("Resource is not a Theme: " + theme_path)
        quit(1)
    
    if debug_mode:
        print("Theme loaded successfully")
    
    # Apply the theme
    node.theme = theme
    if debug_mode:
        print("Theme applied to node")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Theme applied successfully to node: " + params.node_path)
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Setup layout properties for Container nodes
func setup_layout(params):
    print("Setting up layout for node: " + params.node_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get the node
    var node = get_node_by_path(scene_root, params.node_path)
    if not node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Verify it's a Container node
    if not node is Container:
        printerr("Node is not a Container node: " + params.node_path)
        quit(1)
    
    if debug_mode:
        print("Found Container node: " + node.name)
    
    # Apply layout properties
    var properties = params.properties
    if debug_mode:
        print("Applying layout properties")
    
    # BoxContainer specific properties (VBoxContainer, HBoxContainer)
    if node is BoxContainer:
        if properties.has("alignment"):
            var alignment_str = properties.alignment
            if alignment_str == "BEGIN":
                node.alignment = BoxContainer.ALIGNMENT_BEGIN
            elif alignment_str == "CENTER":
                node.alignment = BoxContainer.ALIGNMENT_CENTER
            elif alignment_str == "END":
                node.alignment = BoxContainer.ALIGNMENT_END
            if debug_mode:
                print("Set alignment: " + alignment_str)
    
    # GridContainer specific properties
    if node is GridContainer:
        if properties.has("columns"):
            node.columns = properties.columns
            if debug_mode:
                print("Set columns: " + str(properties.columns))
    
    # Common Container properties
    if properties.has("separation"):
        # For BoxContainer, use add_theme_constant_override
        if node is BoxContainer:
            node.add_theme_constant_override("separation", properties.separation)
            if debug_mode:
                print("Set separation: " + str(properties.separation))
        # For GridContainer, use add_theme_constant_override for h_separation and v_separation
        elif node is GridContainer:
            node.add_theme_constant_override("h_separation", properties.separation)
            node.add_theme_constant_override("v_separation", properties.separation)
            if debug_mode:
                print("Set h_separation and v_separation: " + str(properties.separation))
    
    # Apply any other generic properties
    for property in properties:
        if property not in ["alignment", "columns", "separation"]:
            if property in node:
                node.set(property, properties[property])
                if debug_mode:
                    print("Set " + property + ": " + str(properties[property]))
            else:
                push_warning("Property not found on Container: " + property)
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Layout configured successfully for node: " + params.node_path)
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Create a menu structure with buttons
func create_menu(params):
    print("Creating menu in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get parent node
    var parent_path = params.get("parent_node_path", "root")
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = get_node_by_path(scene_root, parent_path)
    if not parent:
        printerr("Parent node not found: " + parent_path)
        quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    # Create container based on layout
    var layout = params.get("layout", "vertical")
    var container = null
    
    if layout == "vertical":
        container = VBoxContainer.new()
        if debug_mode:
            print("Creating VBoxContainer for vertical layout")
    else:
        container = HBoxContainer.new()
        if debug_mode:
            print("Creating HBoxContainer for horizontal layout")
    
    container.name = params.menu_name
    if debug_mode:
        print("Menu container created with name: " + container.name)
    
    # Set default alignment to center
    container.alignment = BoxContainer.ALIGNMENT_CENTER
    
    # Create buttons
    var buttons = params.buttons
    if debug_mode:
        print("Creating " + str(buttons.size()) + " buttons")
    
    for button_def in buttons:
        var button = Button.new()
        button.name = button_def.name
        button.text = button_def.text
        
        # Set a reasonable minimum size for buttons
        button.custom_minimum_size = Vector2(100, 40)
        
        if debug_mode:
            print("Created button: " + button.name + " with text: " + button.text)
        
        # Add button to container
        container.add_child(button)
        button.owner = scene_root
    
    # Add container to parent
    parent.add_child(container)
    container.owner = scene_root
    if debug_mode:
        print("Menu container added to parent")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Menu '" + params.menu_name + "' with " + str(buttons.size()) + " buttons created successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Create an AnimationPlayer node with basic animations
func create_animation_player(params):
    print("Creating AnimationPlayer in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get parent node
    var parent_path = params.get("parent_node_path", "root")
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = get_node_by_path(scene_root, parent_path)
    if not parent:
        printerr("Parent node not found: " + parent_path)
        quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    # Create AnimationPlayer node
    var anim_player = AnimationPlayer.new()
    anim_player.name = params.get("node_name", "AnimationPlayer")
    if debug_mode:
        print("AnimationPlayer created with name: " + anim_player.name)
    
    # Create basic animations if specified
    if params.has("animations"):
        var animations = params.animations
        if debug_mode:
            print("Creating " + str(animations.size()) + " animations")
        
        for anim_name in animations:
            var animation = Animation.new()
            # Set default length to 1 second
            animation.length = 1.0
            
            # Add the animation to the AnimationPlayer
            anim_player.add_animation_library("", AnimationLibrary.new())
            var lib = anim_player.get_animation_library("")
            lib.add_animation(anim_name, animation)
            
            if debug_mode:
                print("Created animation: " + anim_name)
    
    # Add AnimationPlayer to parent
    parent.add_child(anim_player)
    anim_player.owner = scene_root
    if debug_mode:
        print("AnimationPlayer added to parent")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            var anim_count = params.animations.size() if params.has("animations") else 0
            print("AnimationPlayer '" + anim_player.name + "' created successfully with " + str(anim_count) + " animations")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Add keyframes to an animation in an AnimationPlayer
func add_keyframes(params):
    print("Adding keyframes to animation: " + params.animation_name)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get AnimationPlayer node
    var anim_player_path = params.animation_player_path
    if debug_mode:
        print("AnimationPlayer path: " + anim_player_path)
    
    var anim_player = get_node_by_path(scene_root, anim_player_path)
    if not anim_player:
        printerr("AnimationPlayer node not found: " + anim_player_path)
        quit(1)
    
    if not anim_player is AnimationPlayer:
        printerr("Node is not an AnimationPlayer: " + anim_player_path)
        quit(1)
    
    if debug_mode:
        print("AnimationPlayer found: " + anim_player.name)
    
    # Get or create the animation
    var anim_name = params.animation_name
    var animation: Animation = null
    
    # Check if animation exists in any library
    var libraries = anim_player.get_animation_library_list()
    var found_library = ""
    
    for lib_name in libraries:
        var lib = anim_player.get_animation_library(lib_name)
        if lib.has_animation(anim_name):
            animation = lib.get_animation(anim_name)
            found_library = lib_name
            if debug_mode:
                print("Found animation '" + anim_name + "' in library '" + lib_name + "'")
            break
    
    # If animation doesn't exist, create it in the default library
    if not animation:
        if debug_mode:
            print("Animation not found, creating new animation: " + anim_name)
        
        animation = Animation.new()
        animation.length = 1.0
        
        # Ensure default library exists
        if not anim_player.has_animation_library(""):
            anim_player.add_animation_library("", AnimationLibrary.new())
        
        var lib = anim_player.get_animation_library("")
        lib.add_animation(anim_name, animation)
        found_library = ""
    
    # Get track configuration
    var track_config = params.track
    var node_path = track_config.node_path
    var property = track_config.property
    var keyframes = track_config.keyframes
    
    if debug_mode:
        print("Track config - Node: " + node_path + ", Property: " + property)
        print("Keyframes count: " + str(keyframes.size()))
    
    # Get the parent of the AnimationPlayer to resolve relative paths
    var anim_parent = anim_player.get_parent()
    var target_node = null
    
    # Resolve the target node path
    if node_path == ".":
        target_node = anim_parent
    elif node_path.begins_with("../"):
        # Handle parent-relative paths
        var relative_path = node_path.substr(3)
        if relative_path.is_empty():
            target_node = anim_parent.get_parent()
        else:
            target_node = anim_parent.get_parent().get_node(relative_path)
    else:
        # Relative to AnimationPlayer's parent
        target_node = anim_parent.get_node(node_path)
    
    if not target_node:
        printerr("Target node not found: " + node_path)
        quit(1)
    
    if debug_mode:
        print("Target node found: " + target_node.name)
    
    # Get the path from AnimationPlayer's parent to the target node
    var track_path = anim_parent.get_path_to(target_node)
    var full_track_path = String(track_path) + ":" + property
    
    if debug_mode:
        print("Full track path: " + full_track_path)
    
    # Find or create the track
    var track_idx = -1
    for i in range(animation.get_track_count()):
        if animation.track_get_path(i) == NodePath(full_track_path):
            track_idx = i
            if debug_mode:
                print("Found existing track at index: " + str(track_idx))
            break
    
    # If track doesn't exist, create it
    if track_idx == -1:
        track_idx = animation.add_track(Animation.TYPE_VALUE)
        animation.track_set_path(track_idx, NodePath(full_track_path))
        if debug_mode:
            print("Created new track at index: " + str(track_idx))
    
    # Add keyframes to the track
    for keyframe in keyframes:
        var time = keyframe.time
        var value = keyframe.value
        var transition = keyframe.get("transition", 1.0)
        
        # Convert value if it's a dictionary (for Vector2, Vector3, Color, etc.)
        var converted_value = convert_value_from_dict(value)
        
        # Insert the key
        var key_idx = animation.track_insert_key(track_idx, time, converted_value, transition)
        
        if debug_mode:
            print("Added keyframe at time " + str(time) + " with value: " + str(converted_value))
    
    # Update animation length if needed
    var max_time = 0.0
    for keyframe in keyframes:
        if keyframe.time > max_time:
            max_time = keyframe.time
    
    if max_time > animation.length:
        animation.length = max_time + 0.1  # Add a small buffer
        if debug_mode:
            print("Updated animation length to: " + str(animation.length))
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Added " + str(keyframes.size()) + " keyframes to animation '" + anim_name + "'")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Helper function to convert dictionary values to Godot types
func convert_value_from_dict(value):
    if value is Dictionary:
        # Check for Vector2
        if value.has("x") and value.has("y") and not value.has("z"):
            return Vector2(value.x, value.y)
        # Check for Vector3
        elif value.has("x") and value.has("y") and value.has("z"):
            return Vector3(value.x, value.y, value.z)
        # Check for Color
        elif value.has("r") and value.has("g") and value.has("b"):
            if value.has("a"):
                return Color(value.r, value.g, value.b, value.a)
            else:
                return Color(value.r, value.g, value.b)
        # Check for Quaternion
        elif value.has("x") and value.has("y") and value.has("z") and value.has("w"):
            return Quaternion(value.x, value.y, value.z, value.w)
    
    # Return as-is if not a special type
    return value

# Setup an AnimationTree with a state machine
func setup_animation_tree(params):
    print("Setting up AnimationTree in scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get parent node
    var parent_path = params.get("parent_node_path", "root")
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = get_node_by_path(scene_root, parent_path)
    if not parent:
        printerr("Parent node not found: " + parent_path)
        quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    # Get AnimationPlayer node
    var anim_player_path = params.animation_player_path
    if debug_mode:
        print("AnimationPlayer path: " + anim_player_path)
    
    var anim_player = get_node_by_path(scene_root, anim_player_path)
    if not anim_player:
        printerr("AnimationPlayer node not found: " + anim_player_path)
        quit(1)
    
    if not anim_player is AnimationPlayer:
        printerr("Node is not an AnimationPlayer: " + anim_player_path)
        quit(1)
    
    if debug_mode:
        print("AnimationPlayer found: " + anim_player.name)
    
    # Create AnimationTree node
    var anim_tree = AnimationTree.new()
    anim_tree.name = params.get("node_name", "AnimationTree")
    if debug_mode:
        print("AnimationTree created with name: " + anim_tree.name)
    
    # Create AnimationNodeStateMachine as the root
    var state_machine = AnimationNodeStateMachine.new()
    
    # Get the path from AnimationTree to AnimationPlayer
    var anim_player_node_path = parent.get_path_to(anim_player)
    anim_tree.anim_player = anim_player_node_path
    
    if debug_mode:
        print("AnimationTree connected to AnimationPlayer: " + str(anim_player_node_path))
    
    # Add states if provided
    if params.has("states"):
        var states = params.states
        if debug_mode:
            print("Adding " + str(states.size()) + " states to state machine")
        
        for state_name in states:
            # Create an AnimationNodeAnimation for each state
            var anim_node = AnimationNodeAnimation.new()
            anim_node.animation = state_name
            
            # Add the node to the state machine
            state_machine.add_node(state_name, anim_node)
            
            if debug_mode:
                print("Added state: " + state_name)
    
    # Add transitions if provided
    if params.has("transitions"):
        var transitions = params.transitions
        if debug_mode:
            print("Adding " + str(transitions.size()) + " transitions")
        
        for transition in transitions:
            var from_state = transition["from"]
            var to_state = transition["to"]
            
            # Add transition
            state_machine.add_transition(from_state, to_state, AnimationNodeStateMachineTransition.new())
            
            if debug_mode:
                print("Added transition: " + from_state + " -> " + to_state)
    
    # Set the state machine as the tree root
    anim_tree.tree_root = state_machine
    
    # Enable the AnimationTree
    anim_tree.active = true
    
    # Add AnimationTree to parent
    parent.add_child(anim_tree)
    anim_tree.owner = scene_root
    if debug_mode:
        print("AnimationTree added to parent")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            var state_count = params.states.size() if params.has("states") else 0
            var transition_count = params.transitions.size() if params.has("transitions") else 0
            print("AnimationTree '" + anim_tree.name + "' setup successfully with " + str(state_count) + " states and " + str(transition_count) + " transitions")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Add GPUParticles2D or GPUParticles3D node (Godot 4.5+)
func add_particles(params):
    print("Adding particle system to scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Get parent node
    var parent_path = params.get("parent_node_path", "root")
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = get_node_by_path(scene_root, parent_path)
    if not parent:
        printerr("Parent node not found: " + parent_path)
        quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    # Create particle node based on type
    var particle_type = params.particle_type
    var particles = null
    
    if particle_type == "GPUParticles2D":
        particles = GPUParticles2D.new()
        if debug_mode:
            print("Creating GPUParticles2D")
    elif particle_type == "GPUParticles3D":
        particles = GPUParticles3D.new()
        if debug_mode:
            print("Creating GPUParticles3D")
    else:
        printerr("Invalid particle type: " + particle_type)
        quit(1)
    
    particles.name = params.node_name
    if debug_mode:
        print("Particle node created with name: " + particles.name)
    
    # Set basic properties
    if params.has("properties"):
        var props = params.properties
        
        if props.has("amount"):
            particles.amount = props.amount
            if debug_mode:
                print("Set amount: " + str(props.amount))
        
        if props.has("lifetime"):
            particles.lifetime = props.lifetime
            if debug_mode:
                print("Set lifetime: " + str(props.lifetime))
        
        if props.has("one_shot"):
            particles.one_shot = props.one_shot
            if debug_mode:
                print("Set one_shot: " + str(props.one_shot))
        
        if props.has("preprocess"):
            particles.preprocess = props.preprocess
            if debug_mode:
                print("Set preprocess: " + str(props.preprocess))
        
        if props.has("speed_scale"):
            particles.speed_scale = props.speed_scale
            if debug_mode:
                print("Set speed_scale: " + str(props.speed_scale))
        
        if props.has("explosiveness"):
            particles.explosiveness = props.explosiveness
            if debug_mode:
                print("Set explosiveness: " + str(props.explosiveness))
        
        if props.has("randomness"):
            particles.randomness = props.randomness
            if debug_mode:
                print("Set randomness: " + str(props.randomness))
        
        if props.has("fixed_fps"):
            particles.fixed_fps = props.fixed_fps
            if debug_mode:
                print("Set fixed_fps: " + str(props.fixed_fps))
        
        if props.has("emitting"):
            particles.emitting = props.emitting
            if debug_mode:
                print("Set emitting: " + str(props.emitting))
    
    # Create and configure ParticleProcessMaterial if properties provided
    if params.has("process_material"):
        var material = ParticleProcessMaterial.new()
        var mat_props = params.process_material
        
        if mat_props.has("direction"):
            var dir = mat_props.direction
            material.direction = Vector3(dir.x, dir.y, dir.z)
            if debug_mode:
                print("Set direction: " + str(material.direction))
        
        if mat_props.has("spread"):
            material.spread = mat_props.spread
            if debug_mode:
                print("Set spread: " + str(mat_props.spread))
        
        if mat_props.has("gravity"):
            var grav = mat_props.gravity
            material.gravity = Vector3(grav.x, grav.y, grav.z)
            if debug_mode:
                print("Set gravity: " + str(material.gravity))
        
        if mat_props.has("initial_velocity_min"):
            material.initial_velocity_min = mat_props.initial_velocity_min
            if debug_mode:
                print("Set initial_velocity_min: " + str(mat_props.initial_velocity_min))
        
        if mat_props.has("initial_velocity_max"):
            material.initial_velocity_max = mat_props.initial_velocity_max
            if debug_mode:
                print("Set initial_velocity_max: " + str(mat_props.initial_velocity_max))
        
        if mat_props.has("angular_velocity_min"):
            material.angular_velocity_min = mat_props.angular_velocity_min
            if debug_mode:
                print("Set angular_velocity_min: " + str(mat_props.angular_velocity_min))
        
        if mat_props.has("angular_velocity_max"):
            material.angular_velocity_max = mat_props.angular_velocity_max
            if debug_mode:
                print("Set angular_velocity_max: " + str(mat_props.angular_velocity_max))
        
        if mat_props.has("scale_min"):
            material.scale_min = mat_props.scale_min
            if debug_mode:
                print("Set scale_min: " + str(mat_props.scale_min))
        
        if mat_props.has("scale_max"):
            material.scale_max = mat_props.scale_max
            if debug_mode:
                print("Set scale_max: " + str(mat_props.scale_max))
        
        if mat_props.has("color"):
            var col = mat_props.color
            material.color = Color(col.r, col.g, col.b, col.a if col.has("a") else 1.0)
            if debug_mode:
                print("Set color: " + str(material.color))
        
        # Assign the material to the particle system
        particles.process_material = material
        if debug_mode:
            print("ParticleProcessMaterial configured and assigned")
    
    # Add particles to parent
    parent.add_child(particles)
    particles.owner = scene_root
    if debug_mode:
        print("Particle system added to parent")
    
    # Pack and save the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            print("Particle system '" + particles.name + "' of type '" + particle_type + "' added successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        quit(1)

# Update project settings in project.godot file
func update_project_settings(params):
    print("Updating project settings...")
    
    if not params.has("settings"):
        printerr("Missing required parameter: settings")
        quit(1)
    
    var settings = params.settings
    if debug_mode:
        print("Settings to update: " + str(settings))
    
    # Update each setting using ProjectSettings
    var updated_count = 0
    var error_count = 0
    
    for setting_key in settings:
        var setting_value = settings[setting_key]
        if debug_mode:
            print("Setting " + setting_key + " = " + str(setting_value))
        
        # Set the project setting
        ProjectSettings.set_setting(setting_key, setting_value)
        updated_count += 1
    
    # Save the project settings
    var save_error = ProjectSettings.save()
    if debug_mode:
        print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
    
    if save_error == OK:
        print("Project settings updated successfully. Updated " + str(updated_count) + " setting(s).")
    else:
        printerr("Failed to save project settings: " + str(save_error))
        quit(1)

# Configure input action mappings
func configure_input_map(params):
    print("Configuring input map...")
    
    if not params.has("actions"):
        printerr("Missing required parameter: actions")
        quit(1)
    
    var actions = params.actions
    if debug_mode:
        print("Actions to configure: " + str(actions.size()))
    
    var configured_count = 0
    
    for action_data in actions:
        if not action_data.has("name") or not action_data.has("events"):
            printerr("Invalid action data: missing name or events")
            continue
        
        var action_name = action_data.name
        var deadzone = action_data.get("deadzone", 0.5)
        var events = action_data.events
        
        if debug_mode:
            print("Configuring action: " + action_name)
        
        # Add the action if it doesn't exist
        if not InputMap.has_action(action_name):
            InputMap.add_action(action_name, deadzone)
            if debug_mode:
                print("Added new action: " + action_name)
        else:
            # Clear existing events for this action
            InputMap.action_erase_events(action_name)
            if debug_mode:
                print("Cleared existing events for action: " + action_name)
        
        # Add events to the action
        for event_data in events:
            if not event_data.has("type"):
                printerr("Invalid event data: missing type")
                continue
            
            var event_type = event_data.type
            var event = null
            
            match event_type:
                "key":
                    if event_data.has("keycode"):
                        event = InputEventKey.new()
                        # Parse keycode string (e.g., "KEY_A" -> KEY_A constant)
                        var keycode_str = event_data.keycode
                        if keycode_str.begins_with("KEY_"):
                            # Get the key constant value
                            var key_value = KEY_NONE
                            match keycode_str:
                                "KEY_A": key_value = KEY_A
                                "KEY_B": key_value = KEY_B
                                "KEY_C": key_value = KEY_C
                                "KEY_D": key_value = KEY_D
                                "KEY_E": key_value = KEY_E
                                "KEY_F": key_value = KEY_F
                                "KEY_G": key_value = KEY_G
                                "KEY_H": key_value = KEY_H
                                "KEY_I": key_value = KEY_I
                                "KEY_J": key_value = KEY_J
                                "KEY_K": key_value = KEY_K
                                "KEY_L": key_value = KEY_L
                                "KEY_M": key_value = KEY_M
                                "KEY_N": key_value = KEY_N
                                "KEY_O": key_value = KEY_O
                                "KEY_P": key_value = KEY_P
                                "KEY_Q": key_value = KEY_Q
                                "KEY_R": key_value = KEY_R
                                "KEY_S": key_value = KEY_S
                                "KEY_T": key_value = KEY_T
                                "KEY_U": key_value = KEY_U
                                "KEY_V": key_value = KEY_V
                                "KEY_W": key_value = KEY_W
                                "KEY_X": key_value = KEY_X
                                "KEY_Y": key_value = KEY_Y
                                "KEY_Z": key_value = KEY_Z
                                "KEY_SPACE": key_value = KEY_SPACE
                                "KEY_ENTER": key_value = KEY_ENTER
                                "KEY_ESCAPE": key_value = KEY_ESCAPE
                                "KEY_SHIFT": key_value = KEY_SHIFT
                                "KEY_CTRL": key_value = KEY_CTRL
                                "KEY_ALT": key_value = KEY_ALT
                                "KEY_LEFT": key_value = KEY_LEFT
                                "KEY_RIGHT": key_value = KEY_RIGHT
                                "KEY_UP": key_value = KEY_UP
                                "KEY_DOWN": key_value = KEY_DOWN
                                _:
                                    printerr("Unknown key code: " + keycode_str)
                                    continue
                            event.keycode = key_value
                        else:
                            printerr("Invalid keycode format: " + keycode_str)
                            continue
                
                "mouse_button":
                    if event_data.has("button"):
                        event = InputEventMouseButton.new()
                        event.button_index = event_data.button
                
                "joypad_button":
                    if event_data.has("button"):
                        event = InputEventJoypadButton.new()
                        event.button_index = event_data.button
                
                "joypad_motion":
                    if event_data.has("axis"):
                        event = InputEventJoypadMotion.new()
                        event.axis = event_data.axis
                        if event_data.has("axis_value"):
                            event.axis_value = event_data.axis_value
                
                _:
                    printerr("Unknown event type: " + event_type)
                    continue
            
            if event:
                InputMap.action_add_event(action_name, event)
                if debug_mode:
                    print("Added event to action " + action_name + ": " + event_type)
        
        configured_count += 1
    
    # Save the project settings to persist input map changes
    var save_error = ProjectSettings.save()
    if debug_mode:
        print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
    
    if save_error == OK:
        print("Input map configured successfully. Configured " + str(configured_count) + " action(s).")
    else:
        printerr("Failed to save input map: " + str(save_error))
        quit(1)

# Setup autoload (singleton) scripts
func setup_autoload(params):
    print("Setting up autoload...")
    
    if not params.has("autoloads"):
        printerr("Missing required parameter: autoloads")
        quit(1)
    
    var autoloads = params.autoloads
    if debug_mode:
        print("Autoloads to configure: " + str(autoloads.size()))
    
    var configured_count = 0
    
    for autoload_data in autoloads:
        if not autoload_data.has("name") or not autoload_data.has("path"):
            printerr("Invalid autoload data: missing name or path")
            continue
        
        var autoload_name = autoload_data.name
        var autoload_path = autoload_data.path
        var enabled = autoload_data.get("enabled", true)
        
        # Ensure path starts with res://
        if not autoload_path.begins_with("res://"):
            autoload_path = "res://" + autoload_path
        
        if debug_mode:
            print("Configuring autoload: " + autoload_name + " -> " + autoload_path)
        
        # Check if the file exists
        if not FileAccess.file_exists(autoload_path) and not ResourceLoader.exists(autoload_path):
            printerr("Autoload file does not exist: " + autoload_path)
            continue
        
        # Set the autoload in project settings
        # Format: autoload/<name> = "*res://path/to/script.gd" (asterisk means enabled)
        var setting_key = "autoload/" + autoload_name
        var setting_value = ("*" if enabled else "") + autoload_path
        
        ProjectSettings.set_setting(setting_key, setting_value)
        if debug_mode:
            print("Set " + setting_key + " = " + setting_value)
        
        configured_count += 1
    
    # Save the project settings
    var save_error = ProjectSettings.save()
    if debug_mode:
        print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
    
    if save_error == OK:
        print("Autoload configured successfully. Configured " + str(configured_count) + " autoload(s).")
    else:
        printerr("Failed to save autoload settings: " + str(save_error))
        quit(1)

# Manage editor plugins
func manage_plugins(params):
    print("Managing plugins...")
    
    if not params.has("action"):
        printerr("Missing required parameter: action")
        quit(1)
    
    var action = params.action
    if debug_mode:
        print("Action: " + action)
    
    match action:
        "list":
            list_plugins()
        "enable":
            if not params.has("plugin_name"):
                printerr("Missing required parameter: plugin_name")
                quit(1)
            enable_plugin(params.plugin_name)
        "disable":
            if not params.has("plugin_name"):
                printerr("Missing required parameter: plugin_name")
                quit(1)
            disable_plugin(params.plugin_name)
        _:
            printerr("Unknown action: " + action)
            quit(1)

# List all available plugins
func list_plugins():
    if debug_mode:
        print("Listing plugins...")
    
    var plugins = []
    var addons_dir = "res://addons"
    
    # Check if addons directory exists
    if not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(addons_dir)):
        print(JSON.stringify({"plugins": [], "message": "No addons directory found"}))
        return
    
    var dir = DirAccess.open(addons_dir)
    if dir == null:
        printerr("Failed to open addons directory")
        print(JSON.stringify({"plugins": [], "error": "Failed to open addons directory"}))
        return
    
    dir.list_dir_begin()
    var plugin_name = dir.get_next()
    
    while plugin_name != "":
        if dir.current_is_dir() and not plugin_name.begins_with("."):
            var plugin_cfg_path = addons_dir + "/" + plugin_name + "/plugin.cfg"
            
            if FileAccess.file_exists(plugin_cfg_path):
                # Read plugin.cfg to get plugin info
                var config = ConfigFile.new()
                var err = config.load(plugin_cfg_path)
                
                if err == OK:
                    var plugin_info = {
                        "name": plugin_name,
                        "display_name": config.get_value("plugin", "name", plugin_name),
                        "description": config.get_value("plugin", "description", ""),
                        "author": config.get_value("plugin", "author", ""),
                        "version": config.get_value("plugin", "version", ""),
                        "script": config.get_value("plugin", "script", ""),
                        "enabled": ProjectSettings.get_setting("editor_plugins/enabled", []).has(plugin_name)
                    }
                    plugins.append(plugin_info)
                    if debug_mode:
                        print("Found plugin: " + plugin_name)
        
        plugin_name = dir.get_next()
    
    dir.list_dir_end()
    
    print(JSON.stringify({"plugins": plugins, "count": plugins.size()}))

# Enable a plugin
func enable_plugin(plugin_name):
    if debug_mode:
        print("Enabling plugin: " + plugin_name)
    
    var plugin_cfg_path = "res://addons/" + plugin_name + "/plugin.cfg"
    
    if not FileAccess.file_exists(plugin_cfg_path):
        printerr("Plugin not found: " + plugin_name)
        quit(1)
    
    # Get current enabled plugins list
    var enabled_plugins = ProjectSettings.get_setting("editor_plugins/enabled", [])
    
    if not enabled_plugins.has(plugin_name):
        enabled_plugins.append(plugin_name)
        ProjectSettings.set_setting("editor_plugins/enabled", enabled_plugins)
        
        var save_error = ProjectSettings.save()
        if save_error == OK:
            print("Plugin '" + plugin_name + "' enabled successfully")
        else:
            printerr("Failed to save plugin settings: " + str(save_error))
            quit(1)
    else:
        print("Plugin '" + plugin_name + "' is already enabled")

# Disable a plugin
func disable_plugin(plugin_name):
    if debug_mode:
        print("Disabling plugin: " + plugin_name)
    
    # Get current enabled plugins list
    var enabled_plugins = ProjectSettings.get_setting("editor_plugins/enabled", [])
    
    if enabled_plugins.has(plugin_name):
        enabled_plugins.erase(plugin_name)
        ProjectSettings.set_setting("editor_plugins/enabled", enabled_plugins)
        
        var save_error = ProjectSettings.save()
        if save_error == OK:
            print("Plugin '" + plugin_name + "' disabled successfully")
        else:
            printerr("Failed to save plugin settings: " + str(save_error))
            quit(1)
    else:
        print("Plugin '" + plugin_name + "' is not enabled")

# Capture screenshot from viewport
func capture_screenshot(params):
    print("Capturing screenshot...")
    
    if not params.has("output_path"):
        printerr("Missing required parameter: output_path")
        quit(1)
    
    var output_path = params.output_path as String
    var delay = params.get("delay", 0.0) as float
    
    print("Output path (from params): " + output_path)
    print("Delay: " + str(delay))
    
    # Check if scene_path is provided
    if not params.has("scene_path"):
        print("WARNING: No scene_path provided - screenshot will be of empty viewport (gray screen)")
        print("Tip: Add 'scene_path' parameter to capture a specific scene")
    
    # Show project path info
    var project_res_path = ProjectSettings.globalize_path("res://")
    print("Project res:// path: " + project_res_path)
    
    # Normalize the output path
    var full_output_path = output_path
    if not full_output_path.begins_with("res://") and not full_output_path.is_absolute_path():
        full_output_path = "res://" + full_output_path
        print("Added res:// prefix to relative path")
    
    print("Full output path: " + full_output_path)
    
    # Convert to absolute path for saving
    var absolute_output_path = ProjectSettings.globalize_path(full_output_path)
    print("Absolute output path: " + absolute_output_path)
    
    # Ensure output directory exists
    var output_dir = absolute_output_path.get_base_dir()
    if debug_mode:
        print("Output directory: " + output_dir)
        print("Directory exists: " + str(DirAccess.dir_exists_absolute(output_dir)))
    
    if not DirAccess.dir_exists_absolute(output_dir):
        print("Creating output directory: " + output_dir)
        var make_dir_error = DirAccess.make_dir_recursive_absolute(output_dir)
        if make_dir_error != OK:
            printerr("Failed to create output directory: " + output_dir)
            printerr("Error code: " + str(make_dir_error))
            print(JSON.stringify({"success": false, "error": "Failed to create output directory: " + str(make_dir_error)}))
            quit(1)
        
        # Verify directory was created
        if not DirAccess.dir_exists_absolute(output_dir):
            printerr("Directory creation reported success but directory does not exist: " + output_dir)
            print(JSON.stringify({"success": false, "error": "Directory creation failed verification"}))
            quit(1)
        
        print("Output directory created successfully: " + output_dir)
    else:
        if debug_mode:
            print("Output directory already exists")
    
    # If scenePath is provided, we need to load and run the scene
    if params.has("scene_path"):
        var scene_path = params.scene_path as String
        if not scene_path.begins_with("res://"):
            scene_path = "res://" + scene_path
        
        if debug_mode:
            print("Loading scene: " + scene_path)
        
        if not FileAccess.file_exists(scene_path):
            printerr("Scene file does not exist: " + scene_path)
            print(JSON.stringify({"success": false, "error": "Scene file not found"}))
            quit(1)
        
        # Load and instantiate the scene
        var scene = load(scene_path)
        if not scene:
            printerr("Failed to load scene: " + scene_path)
            print(JSON.stringify({"success": false, "error": "Failed to load scene"}))
            quit(1)
        
        var scene_root = scene.instantiate()
        if not scene_root:
            printerr("Failed to instantiate scene")
            print(JSON.stringify({"success": false, "error": "Failed to instantiate scene"}))
            quit(1)
        
        # Add scene to the tree
        root.add_child(scene_root)
        
        print("Scene loaded and added to tree")
        
        # Wait for scene to initialize (call _ready, etc.)
        await process_frame
        await process_frame
        
        # Find and enable camera if present
        var camera = scene_root.find_child("Camera2D", true, false)
        if not camera:
            camera = scene_root.find_child("Camera3D", true, false)
        
        if camera:
            camera.enabled = true
            camera.make_current()
            print("Camera found and enabled: " + camera.name)
        else:
            print("No camera found in scene")
        
        print("Scene initialized")
    
    # Wait for delay if specified
    if delay > 0:
        print("Waiting for " + str(delay) + " seconds...")
        await create_timer(delay).timeout
    else:
        # Even without delay, wait a bit for rendering
        await process_frame
        await process_frame
    
    # Get the viewport (root is Window which is a Viewport)
    var viewport = root as Viewport
    if not viewport:
        printerr("Failed to get viewport")
        print(JSON.stringify({"success": false, "error": "Failed to get viewport"}))
        quit(1)
    
    print("Viewport obtained: " + str(viewport.get_class()))
    
    # Wait for at least one frame to render
    await process_frame
    await process_frame  # Wait two frames to ensure rendering is complete
    
    # Change viewport size if specified
    if params.has("size"):
        var size = params.size as Dictionary
        if size.has("width") and size.has("height"):
            var new_size = Vector2i(size.width, size.height)
            viewport.size = new_size
            if debug_mode:
                print("Viewport size set to: " + str(new_size))
            
            # Wait a frame for the viewport to update
            await process_frame
    
    # Capture the image from viewport
    var image = viewport.get_texture().get_image()
    if not image:
        printerr("Failed to get image from viewport")
        print(JSON.stringify({"success": false, "error": "Failed to get image from viewport"}))
        quit(1)
    
    if debug_mode:
        print("Image captured: " + str(image.get_width()) + "x" + str(image.get_height()))
    
    # Save the image as PNG
    var save_error = image.save_png(absolute_output_path)
    if save_error != OK:
        printerr("Failed to save screenshot: " + str(save_error))
        print(JSON.stringify({"success": false, "error": "Failed to save screenshot: " + str(save_error)}))
        quit(1)
    
    # Verify the file was created
    if not FileAccess.file_exists(absolute_output_path):
        printerr("Screenshot file not found after save")
        print(JSON.stringify({"success": false, "error": "Screenshot file not found after save"}))
        quit(1)
    
    if debug_mode:
        print("Screenshot saved successfully")
    
    # Return success result
    var result = {
        "success": true,
        "output_path": output_path,
        "size": {
            "width": image.get_width(),
            "height": image.get_height()
        }
    }
    
    print(JSON.stringify(result))

# List missing assets in the project
func list_missing_assets(params):
    print("Scanning project for missing assets...")
    
    var check_types = params.get("check_types", ["texture", "audio", "script", "scene", "material", "mesh"]) as Array
    if debug_mode:
        print("Check types: " + str(check_types))
    
    var missing: Array[Dictionary] = []
    var checked_paths: Array[String] = []
    var resource_references: Dictionary = {}  # Maps resource path -> array of files that reference it
    
    # Scan all .tscn, .tres, and .gd files in the project
    _scan_directory_for_references("res://", resource_references, checked_paths)
    
    if debug_mode:
        print("Scanned " + str(checked_paths.size()) + " files")
        print("Found " + str(resource_references.size()) + " resource references")
    
    # Check each referenced resource to see if it exists
    for resource_path in resource_references.keys():
        var referenced_by = resource_references[resource_path] as Array
        
        # Skip if not checking this type
        var resource_type = _get_resource_type(resource_path)
        if not check_types.has(resource_type):
            continue
        
        # Check if the resource exists
        if not FileAccess.file_exists(resource_path) and not ResourceLoader.exists(resource_path):
            var suggested_fixes: Array[String] = []
            
            # Generate suggested fixes
            var filename = resource_path.get_file()
            suggested_fixes.append("Check if the file was moved or renamed")
            suggested_fixes.append("Search for '" + filename + "' in the project directory")
            suggested_fixes.append("Update references in: " + str(referenced_by))
            
            # Check for similar files
            var similar_files = _find_similar_files(resource_path)
            if similar_files.size() > 0:
                suggested_fixes.append("Similar files found: " + str(similar_files))
            
            missing.append({
                "path": resource_path,
                "type": resource_type,
                "referenced_by": referenced_by,
                "suggested_fixes": suggested_fixes
            })
    
    # Create the report
    var report = {
        "missing": missing,
        "total_missing": missing.size(),
        "checked_paths": checked_paths,
        "timestamp": Time.get_datetime_string_from_system()
    }
    
    var result = {
        "success": true,
        "report": report
    }
    
    print(JSON.stringify(result))

# Recursively scan directory for resource references
func _scan_directory_for_references(dir_path: String, references: Dictionary, checked_paths: Array):
    var dir = DirAccess.open(dir_path)
    if not dir:
        if debug_mode:
            print("Failed to open directory: " + dir_path)
        return
    
    dir.list_dir_begin()
    var file_name = dir.get_next()
    
    while file_name != "":
        # Skip hidden files and directories
        if file_name.begins_with("."):
            file_name = dir.get_next()
            continue
        
        var full_path = dir_path.path_join(file_name)
        
        if dir.current_is_dir():
            # Recursively scan subdirectories
            _scan_directory_for_references(full_path, references, checked_paths)
        else:
            # Check if this is a file we should scan
            var ext = file_name.get_extension().to_lower()
            if ext in ["tscn", "tres", "gd", "gdscript"]:
                checked_paths.append(full_path)
                _extract_resource_references(full_path, references)
        
        file_name = dir.get_next()
    
    dir.list_dir_end()

# Extract resource references from a file
func _extract_resource_references(file_path: String, references: Dictionary):
    var file = FileAccess.open(file_path, FileAccess.READ)
    if not file:
        if debug_mode:
            print("Failed to open file: " + file_path)
        return
    
    var content = file.get_as_text()
    file.close()
    
    # Patterns to match resource paths
    # Pattern 1: ExtResource("res://path/to/resource.ext")
    # Pattern 2: path = "res://path/to/resource.ext"
    # Pattern 3: load("res://path/to/resource.ext")
    # Pattern 4: preload("res://path/to/resource.ext")
    
    var patterns = [
        'ExtResource\\("([^"]+)"\\)',
        'path\\s*=\\s*"(res://[^"]+)"',
        'load\\("(res://[^"]+)"\\)',
        'preload\\("(res://[^"]+)"\\)',
        '"(res://[^"]+\\.(?:png|jpg|jpeg|webp|svg|wav|mp3|ogg|gd|tscn|tres|material|mesh))"'
    ]
    
    for pattern in patterns:
        var regex = RegEx.new()
        regex.compile(pattern)
        var matches = regex.search_all(content)
        
        for match_result in matches:
            if match_result.get_group_count() > 0:
                var resource_path = match_result.get_string(1)
                
                # Normalize the path
                if not resource_path.begins_with("res://"):
                    resource_path = "res://" + resource_path
                
                # Add to references
                if not references.has(resource_path):
                    references[resource_path] = []
                
                var refs = references[resource_path] as Array
                if not refs.has(file_path):
                    refs.append(file_path)

# Get the type of a resource based on its extension
func _get_resource_type(resource_path: String) -> String:
    var ext = resource_path.get_extension().to_lower()
    
    match ext:
        "png", "jpg", "jpeg", "webp", "svg", "bmp", "tga":
            return "texture"
        "wav", "mp3", "ogg":
            return "audio"
        "gd", "gdscript", "cs":
            return "script"
        "tscn":
            return "scene"
        "tres":
            # Could be material, mesh, or other resource
            # Try to determine from content if possible
            if resource_path.contains("material"):
                return "material"
            elif resource_path.contains("mesh"):
                return "mesh"
            else:
                return "resource"
        "material":
            return "material"
        "mesh", "obj", "fbx", "gltf", "glb":
            return "mesh"
        _:
            return "unknown"

# Find similar files in the project
func _find_similar_files(missing_path: String) -> Array[String]:
    var similar: Array[String] = []
    var filename = missing_path.get_file()
    var base_name = filename.get_basename()
    
    # Search for files with similar names
    _search_similar_in_directory("res://", base_name, similar)
    
    return similar

# Recursively search for similar files
func _search_similar_in_directory(dir_path: String, search_name: String, results: Array):
    var dir = DirAccess.open(dir_path)
    if not dir:
        return
    
    dir.list_dir_begin()
    var file_name = dir.get_next()
    
    while file_name != "":
        if file_name.begins_with("."):
            file_name = dir.get_next()
            continue
        
        var full_path = dir_path.path_join(file_name)
        
        if dir.current_is_dir():
            _search_similar_in_directory(full_path, search_name, results)
        else:
            # Check if filename is similar (case-insensitive)
            var file_base = file_name.get_basename().to_lower()
            var search_lower = search_name.to_lower()
            
            if file_base.contains(search_lower) or search_lower.contains(file_base):
                results.append(full_path)
                
                # Limit results to avoid too many matches
                if results.size() >= 5:
                    dir.list_dir_end()
                    return
        
        file_name = dir.get_next()
    
    dir.list_dir_end()

# Dump the remote scene tree during runtime
func remote_tree_dump(params):
    print("Dumping remote scene tree")
    
    # Get the root of the scene tree
    var root = get_root()
    if not root:
        printerr("Failed to get scene tree root")
        quit(1)
    
    # Parse filter parameters
    var filter = params.get("filter", {}) as Dictionary
    var include_properties = params.get("include_properties", false) as bool
    var include_signals = params.get("include_signals", false) as bool
    
    if debug_mode:
        print("Filter: " + str(filter))
        print("Include properties: " + str(include_properties))
        print("Include signals: " + str(include_signals))
    
    # If scenePath is provided, load and instantiate it
    if params.has("scene_path"):
        var scene_path = params.scene_path as String
        if not scene_path.begins_with("res://"):
            scene_path = "res://" + scene_path
        
        if debug_mode:
            print("Loading scene: " + scene_path)
        
        if not FileAccess.file_exists(scene_path):
            printerr("Scene file does not exist: " + scene_path)
            quit(1)
        
        var scene = load(scene_path) as PackedScene
        if not scene:
            printerr("Failed to load scene: " + scene_path)
            quit(1)
        
        var scene_instance = scene.instantiate()
        if not scene_instance:
            printerr("Failed to instantiate scene")
            quit(1)
        
        # Add to tree temporarily
        root.add_child(scene_instance)
        
        if debug_mode:
            print("Scene instantiated and added to tree")
    
    # Collect nodes
    var nodes: Array[Dictionary] = []
    var total_count = 0
    
    # Start recursive dump from root
    _dump_node_recursive(root, nodes, filter, include_properties, include_signals, 0, total_count)
    
    # Create result
    var result = {
        "success": true,
        "nodes": nodes,
        "total_nodes": nodes.size(),
        "timestamp": Time.get_datetime_string_from_system()
    }
    
    # Output as JSON
    print(JSON.stringify(result))

# Recursively dump node information
func _dump_node_recursive(
    node: Node,
    result: Array,
    filter: Dictionary,
    include_properties: bool,
    include_signals: bool,
    current_depth: int,
    total_count: int
) -> void:
    # Check depth filter
    var max_depth = filter.get("depth", -1) as int
    if max_depth >= 0 and current_depth > max_depth:
        return
    
    # Filter by node type
    if filter.has("node_type"):
        var type_filter = filter.node_type as String
        if not node.is_class(type_filter):
            # Skip this node and its children
            return
    
    # Filter by node name (regex)
    if filter.has("node_name"):
        var name_filter = filter.node_name as String
        var regex = RegEx.new()
        var compile_error = regex.compile(name_filter)
        if compile_error != OK:
            if debug_mode:
                print("Invalid regex pattern: " + name_filter)
        else:
            var match_result = regex.search(node.name)
            if not match_result:
                # Skip this node and its children
                return
    
    # Filter by script presence
    if filter.get("has_script", false):
        if not node.get_script():
            # Skip this node and its children
            return
    
    # Create node info
    var node_info = {
        "path": str(node.get_path()),
        "type": node.get_class(),
        "name": node.name,
        "children": []
    }
    
    # Add properties if requested
    if include_properties:
        var properties = {}
        for prop in node.get_property_list():
            # Only include editor-visible properties
            if prop.usage & PROPERTY_USAGE_EDITOR:
                var prop_name = prop.name as String
                # Skip some internal properties
                if not prop_name.begins_with("_"):
                    var value = node.get(prop_name)
                    # Convert to serializable format
                    properties[prop_name] = _serialize_value(value)
        node_info["properties"] = properties
    
    # Add signals if requested
    if include_signals:
        var signals_info: Array[Dictionary] = []
        for sig in node.get_signal_list():
            var sig_name = sig.name as String
            var connections = node.get_signal_connection_list(sig_name)
            if connections.size() > 0:
                var signal_data = {
                    "name": sig_name,
                    "connections": []
                }
                for conn in connections:
                    var conn_dict = conn as Dictionary
                    signal_data.connections.append({
                        "target": str(conn_dict.get("callable", "").get_object().get_path() if conn_dict.has("callable") else "unknown"),
                        "method": str(conn_dict.get("callable", "").get_method() if conn_dict.has("callable") else "unknown")
                    })
                signals_info.append(signal_data)
        if signals_info.size() > 0:
            node_info["signals"] = signals_info
    
    # Add script if present
    var script = node.get_script()
    if script:
        node_info["script"] = script.resource_path
    
    # Add children paths
    for child in node.get_children():
        node_info.children.append(str(child.get_path()))
    
    # Add to result
    result.append(node_info)
    total_count += 1
    
    # Recursively process children
    for child in node.get_children():
        _dump_node_recursive(child, result, filter, include_properties, include_signals, current_depth + 1, total_count)

# Serialize a value to a JSON-compatible format
func _serialize_value(value):
    if value == null:
        return null
    elif value is bool or value is int or value is float or value is String:
        return value
    elif value is Vector2:
        return {"x": value.x, "y": value.y}
    elif value is Vector3:
        return {"x": value.x, "y": value.y, "z": value.z}
    elif value is Color:
        return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
    elif value is Array:
        var arr = []
        for item in value:
            arr.append(_serialize_value(item))
        return arr
    elif value is Dictionary:
        var dict = {}
        for key in value:
            dict[str(key)] = _serialize_value(value[key])
        return dict
    elif value is Object:
        # For objects, return their class name or path if it's a resource
        if value is Resource:
            return value.resource_path if value.resource_path else value.get_class()
        else:
            return value.get_class()
    else:
        return str(value)

# Toggle debug draw mode for viewport diagnostics (Godot 4.5+)
func toggle_debug_draw(params):
    print("Toggling debug draw mode")
    
    var mode_str = params.mode as String
    var viewport_path = params.get("viewport", "/root") as String
    
    if debug_mode:
        print("Mode: " + mode_str)
        print("Viewport path: " + viewport_path)
    
    # Get the viewport
    var viewport: Viewport = null
    if viewport_path == "/root":
        viewport = root.get_viewport()
    else:
        viewport = root.get_node(viewport_path)
    
    if not viewport:
        printerr("Viewport not found: " + viewport_path)
        quit(1)
    
    if debug_mode:
        print("Viewport found: " + viewport.name)
    
    # Map string values to Viewport.DebugDraw enum (Godot 4.5+)
    var debug_draw_modes = {
        "disabled": Viewport.DEBUG_DRAW_DISABLED,
        "unshaded": Viewport.DEBUG_DRAW_UNSHADED,
        "lighting": Viewport.DEBUG_DRAW_LIGHTING,
        "overdraw": Viewport.DEBUG_DRAW_OVERDRAW,
        "wireframe": Viewport.DEBUG_DRAW_WIREFRAME,
        "normal_buffer": Viewport.DEBUG_DRAW_NORMAL_BUFFER,
        "voxel_gi_albedo": Viewport.DEBUG_DRAW_VOXEL_GI_ALBEDO,
        "voxel_gi_lighting": Viewport.DEBUG_DRAW_VOXEL_GI_LIGHTING,
        "voxel_gi_emission": Viewport.DEBUG_DRAW_VOXEL_GI_EMISSION,
        "shadow_atlas": Viewport.DEBUG_DRAW_SHADOW_ATLAS,
        "directional_shadow_atlas": Viewport.DEBUG_DRAW_DIRECTIONAL_SHADOW_ATLAS,
        "scene_luminance": Viewport.DEBUG_DRAW_SCENE_LUMINANCE,
        "ssao": Viewport.DEBUG_DRAW_SSAO,
        "ssil": Viewport.DEBUG_DRAW_SSIL,
        "pssm_splits": Viewport.DEBUG_DRAW_PSSM_SPLITS,
        "decal_atlas": Viewport.DEBUG_DRAW_DECAL_ATLAS,
        "sdfgi": Viewport.DEBUG_DRAW_SDFGI,
        "sdfgi_probes": Viewport.DEBUG_DRAW_SDFGI_PROBES,
        "gi_buffer": Viewport.DEBUG_DRAW_GI_BUFFER,
        "disable_lod": Viewport.DEBUG_DRAW_DISABLE_LOD,
        "cluster_omni_lights": Viewport.DEBUG_DRAW_CLUSTER_OMNI_LIGHTS,
        "cluster_spot_lights": Viewport.DEBUG_DRAW_CLUSTER_SPOT_LIGHTS,
        "cluster_decals": Viewport.DEBUG_DRAW_CLUSTER_DECALS,
        "cluster_reflection_probes": Viewport.DEBUG_DRAW_CLUSTER_REFLECTION_PROBES,
        "occluders": Viewport.DEBUG_DRAW_OCCLUDERS,
        "motion_vectors": Viewport.DEBUG_DRAW_MOTION_VECTORS,
        "internal_buffer": Viewport.DEBUG_DRAW_INTERNAL_BUFFER
    }
    
    if not debug_draw_modes.has(mode_str):
        printerr("Unknown debug draw mode: " + mode_str)
        printerr("Valid modes: " + str(debug_draw_modes.keys()))
        quit(1)
    
    # Set the debug draw mode
    var debug_draw_value = debug_draw_modes[mode_str]
    viewport.debug_draw = debug_draw_value
    
    if debug_mode:
        print("Debug draw mode set to: " + mode_str + " (value: " + str(debug_draw_value) + ")")
    
    # Create result
    var result = {
        "success": true,
        "mode": mode_str,
        "viewport": viewport_path
    }
    
    # Output as JSON
    print(JSON.stringify(result))
