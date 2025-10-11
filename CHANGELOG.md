# Changelog

All notable changes to the Godot MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Core Infrastructure
- **Version Validation Infrastructure**: Comprehensive version validation for Godot 4.5+
  - New `VersionValidator` class for parsing and validating Godot versions
  - Automatic version checking on server startup and operation execution
  - Minimum version requirement: Godot 4.5.0
  - Feature detection based on Godot version (UID System, Compositor Effects, Enhanced Physics, etc.)
  - Enhanced `get_godot_version` tool with detailed version information and supported features

#### Scene Management Module (Tasks 2.1-2.4)
- `remove_node`: Remove nodes from scenes with UID preservation
- `modify_node`: Modify node properties and transforms
- `duplicate_node`: Duplicate nodes with all children
- `query_node`: Query detailed node information

#### Script Management Module (Tasks 3.1-3.4)
- `create_script`: Create GDScript files with templates (node, resource, custom)
- `attach_script`: Attach scripts to nodes in scenes
- `validate_script`: Validate GDScript syntax with detailed error reporting
- `get_node_methods`: Get available methods and properties for nodes

#### Resource Management Module (Tasks 4.1-4.4)
- `import_asset`: Import assets with custom settings and UID support
- `create_resource`: Create resources (materials, shaders, etc.)
- `list_assets`: List project assets with metadata and dependencies
- `configure_import`: Configure import settings for assets

#### Signal System Module (Tasks 5.1-5.4)
- `create_signal`: Create custom signals in scripts
- `connect_signal`: Connect signals between nodes with Callable API and validation
- `list_signals`: List available signals on nodes with connection info
- `disconnect_signal`: Disconnect signal connections

#### Physics Module (Tasks 6.1-6.4)
- `add_physics_body`: Add physics bodies (CharacterBody2D/3D, RigidBody2D/3D, etc.) with Godot 4.5+ features
- `configure_physics`: Configure physics properties and materials
- `setup_collision_layers`: Setup collision layers and masks
- `create_area`: Create Area2D/Area3D with signal connections

#### UI Module (Tasks 7.1-7.4)
- `create_ui_element`: Create UI elements (Button, Label, TextEdit, Panel, etc.)
- `apply_theme`: Apply themes to UI elements
- `setup_layout`: Setup container layouts
- `create_menu`: Create menus with buttons and navigation

#### Animation Module (Tasks 8.1-8.4)
- `create_animation_player`: Create AnimationPlayer nodes with animations
- `add_keyframes`: Add keyframes to animation tracks
- `setup_animation_tree`: Setup AnimationTree with state machines
- `add_particles`: Add particle systems (GPUParticles2D/3D)

#### Documentation Module (Tasks 10.1-10.5)
- `get_class_info`: Get detailed class information from Godot documentation
- `get_method_info`: Get method information with parameters and examples
- `search_docs`: Search documentation for classes, methods, properties, and signals
- `get_best_practices`: Access best practices for common Godot topics
- XML parsing of Godot's --doctool output
- Two-tier caching system (memory + disk)
- Support for Godot 4.5+ features and deprecated feature warnings

#### Debug Module (Tasks 11.1-11.2)
- `run_with_debug`: Run projects with full debug output capture
- `get_error_context`: Get error context with stack traces and intelligent analysis
- Real-time output and error capture
- Integration with documentation for contextual help
- Common error pattern recognition

#### Project Management Module (Tasks 12.1-12.4)
- `update_project_settings`: Update project settings in project.godot
- `configure_input_map`: Configure input action mappings
- `setup_autoload`: Setup autoload singletons
- `manage_plugins`: Manage editor plugins (list, enable, disable)

### Changed
- Updated README with comprehensive feature list and categorized example prompts
- Enhanced error messages to guide users to upgrade Godot if needed
- Improved documentation with usage examples for all new features

### Dependencies
- Added `xml2js` for parsing Godot documentation
- Added `@types/xml2js` for TypeScript support
- Added `axios` for HTTP requests
- Added `fs-extra` for enhanced file operations

## [0.1.0] - Previous Release

### Features
- Launch Godot Editor
- Run Godot Projects
- Capture Debug Output
- Control Execution
- Get Godot Version
- List Godot Projects
- Project Analysis
- Scene Management (create, add nodes, load sprites, export mesh libraries)
- UID Management for Godot 4.4+
