# Godot MCP

A Model Context Protocol (MCP) server for interacting with the Godot game engine.

## Introduction

Godot MCP enables AI assistants to launch the Godot editor, run projects, capture debug output, and control project execution through a standardized interface.

This direct feedback loop helps AI assistants understand what works and what doesn't in Godot projects, leading to better code generation and debugging assistance.

**Current Version:** 0.1.0  
**Godot Version Required:** 4.5.0 or later  
**Status:** Active Development

## Features

- **Launch Godot Editor**: Open the Godot editor for a specific project
- **Run Godot Projects**: Execute Godot projects in debug mode
- **Capture Debug Output**: Retrieve console output and error messages
- **Control Execution**: Start and stop Godot projects programmatically
- **Get Godot Version**: Retrieve the installed Godot version
- **List Godot Projects**: Find Godot projects in a specified directory
- **Project Analysis**: Get detailed information about project structure

### Scene Management
- Create new scenes with specified root node types
- Add, remove, modify, and duplicate nodes
- Query node information and properties
- Load sprites and textures into Sprite2D nodes
- Export 3D scenes as MeshLibrary resources for GridMap
- Save scenes with options for creating variants

### Script Management
- Create GDScript files with templates (node, resource, custom)
- Attach scripts to nodes
- Validate script syntax with detailed error reporting
- Get node methods and properties

### Resource Management
- Import assets with custom settings
- Create resources (materials, shaders, etc.)
- List project assets with metadata
- Configure import settings

### Signal System
- Create custom signals in scripts
- Connect signals between nodes with validation
- List available signals on nodes
- Disconnect signal connections

### Physics System (Godot 4.5+)
- Add physics bodies (CharacterBody2D/3D, RigidBody2D/3D, etc.)
- Configure physics properties and materials
- Setup collision layers and masks
- Create Area2D/Area3D with signal connections

### UI System
- Create UI elements (Button, Label, TextEdit, Panel, etc.)
- Apply themes to UI elements
- Setup container layouts
- Create menus with buttons and navigation

### Animation System
- Create AnimationPlayer nodes with animations
- Add keyframes to animation tracks
- Setup AnimationTree with state machines
- Add particle systems (GPUParticles2D/3D)

### Project Management
- Update project settings
- Configure input action mappings
- Setup autoload singletons
- Manage editor plugins (list, enable, disable)

### Debug Module
- Run projects with full debug output capture
- Get error context with stack traces
- Intelligent error analysis with solutions
- Integration with documentation for contextual help

### Documentation Module (Godot 4.5+)
- Get detailed class information from official Godot documentation
- Search documentation for classes, methods, properties, and signals
- Get method information with parameters and examples
- Access best practices for common Godot topics (physics, signals, GDScript, etc.)
- Automatic caching for improved performance
- Support for Godot 4.5+ features and deprecated feature warnings

### UID Management (Godot 4.4+)
- Get UID for specific files
- Update UID references by resaving resources

## Requirements

- **[Godot Engine 4.5.0 or later](https://godotengine.org/download)** installed on your system
  - The server validates your Godot version on startup
  - Minimum version: 4.5.0
  - Recommended: Latest stable version (4.5.x)
- **Node.js 18+** and npm
- An AI assistant that supports MCP (Cline, Cursor, etc.)

### Version Compatibility

This MCP server requires **Godot 4.5.0 or later** to ensure compatibility with modern Godot features:

- **UID System**: Unique identifiers for resources (4.4+, stable in 4.5+)
- **Compositor Effects**: Advanced rendering pipeline (4.5+)
- **Enhanced Physics**: Improved physics material system with absorbent property (4.5+)
- **Improved GDScript**: Better parser with detailed error reporting (4.5+)
- **Modern Node Types**: Latest node types and APIs (4.5+)
- **GPUParticles**: Enhanced particle system (4.5+)

The server automatically validates your Godot version on startup and provides clear error messages if your version is incompatible.

## Installation and Configuration

### Step 1: Install and Build

Clone the repository and build the MCP server:

```bash
git clone https://github.com/Derfirm/godot-mcp.git
cd godot-mcp
npm install
npm run build
```

The build process compiles TypeScript and bundles the GDScript operations file.

### Step 2: Configure with Your AI Assistant

#### Option A: Configure with Cline

Add to your Cline MCP settings file:
- **Mac/Linux**: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windows**: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "DEBUG": "true"                  // Optional: Enable detailed logging
      },
      "disabled": false,
      "autoApprove": [
        "launch_editor",
        "run_project",
        "get_debug_output",
        "stop_project",
        "get_godot_version",
        "list_projects",
        "get_project_info",
        "create_scene",
        "add_node",
        "remove_node",
        "modify_node",
        "duplicate_node",
        "query_node",
        "load_sprite",
        "export_mesh_library",
        "save_scene",
        "create_script",
        "attach_script",
        "validate_script",
        "get_node_methods",
        "import_asset",
        "create_resource",
        "list_assets",
        "configure_import",
        "create_signal",
        "connect_signal",
        "list_signals",
        "disconnect_signal",
        "add_physics_body",
        "configure_physics",
        "setup_collision_layers",
        "create_area",
        "create_ui_element",
        "apply_theme",
        "setup_layout",
        "create_menu",
        "create_animation_player",
        "add_keyframes",
        "setup_animation_tree",
        "add_particles",
        "get_uid",
        "update_project_uids",
        "get_class_info",
        "get_method_info",
        "search_docs",
        "get_best_practices",
        "run_with_debug",
        "get_error_context",
        "run_scene",
        "capture_screenshot",
        "list_missing_assets",
        "remote_tree_dump",
        "toggle_debug_draw",
        "update_project_settings",
        "configure_input_map",
        "setup_autoload",
        "manage_plugins"
      ]
    }
  }
}
```

#### Option B: Configure with Cursor

**Using the Cursor UI:**

1. Go to **Cursor Settings** > **Features** > **MCP**
2. Click on the **+ Add New MCP Server** button
3. Fill out the form:
   - Name: `godot` (or any name you prefer)
   - Type: `command`
   - Command: `node /absolute/path/to/godot-mcp/build/index.js`
4. Click "Add"
5. You may need to press the refresh button in the top right corner of the MCP server card to populate the tool list

**Using Project-Specific Configuration:**

Create a file at `.cursor/mcp.json` in your project directory with the following content:

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "DEBUG": "true"                  // Enable detailed logging
      }
    }
  }
}
```

### Step 3: Optional Environment Variables

You can customize the server behavior using environment variables:

- `GODOT_PATH`: Path to the Godot executable (overrides automatic detection)
- `DEBUG`: Set to "true" to enable detailed server-side logging

Example:
```bash
export GODOT_PATH="/path/to/godot"
export DEBUG="true"
```

## Checking Your Godot Version

You can verify your Godot installation and check supported features using the `get_godot_version` tool:

```text
"What version of Godot do I have installed?"
"Check if my Godot version supports all features"
```

The tool will display:
- Your installed Godot version
- Compatibility status with the MCP server
- List of supported features based on your version

You can also check manually:
```bash
godot --version
# or
/path/to/Godot.app/Contents/MacOS/Godot --version
```

## Example Prompts

Once configured, your AI assistant will automatically run the MCP server when needed. You can use prompts like:

### Basic Operations
```text
"Launch the Godot editor for my project at /path/to/project"
"Run my Godot project and show me any errors"
"Get information about my Godot project structure"
"What version of Godot do I have installed?"
```

### Scene & Node Management
```text
"Create a new 2D scene with a CharacterBody2D root node"
"Add a Sprite2D node to my player scene and load the character texture"
"Remove the old enemy node from my level scene"
"Modify the player node to set its position to (100, 200)"
"Duplicate the enemy node and place it at a different position"
```

### Script Management
```text
"Create a new GDScript for a player controller"
"Attach the player script to the CharacterBody2D node"
"Validate my player.gd script for syntax errors"
"Show me all methods available on the CharacterBody2D node"
```

### Physics & Collision
```text
"Add a CharacterBody2D with a capsule collision shape to my scene"
"Setup collision layers for player, enemies, and environment"
"Create an Area2D for detecting when the player enters a zone"
"Configure physics properties for my RigidBody2D"
```

### UI & Menus
```text
"Create a main menu UI with Start, Options, and Quit buttons"
"Add a Label to show the player's score"
"Setup a VBoxContainer layout for my settings menu"
"Apply a custom theme to my UI elements"
```

### Animation & Particles
```text
"Create an AnimationPlayer for my character with idle and walk animations"
"Add keyframes to animate the player's position"
"Setup an AnimationTree with a state machine for character states"
"Add particle effects for the player's jump"
```

### Project Configuration
```text
"Update my project settings to set the window size to 1920x1080"
"Configure input actions for move_left, move_right, and jump"
"Setup GameManager as an autoload singleton"
"List all installed editor plugins"
```

### Debugging & Documentation
```text
"Run my project in debug mode and capture all output"
"Help me understand this error: [paste error message]"
"Show me documentation for the CharacterBody2D class"
"Search the Godot docs for move_and_slide"
"What are the best practices for using signals in Godot?"
```

### Advanced Operations
```text
"Export my 3D models as a MeshLibrary for use with GridMap"
"Get the UID for a specific script file in my Godot 4.4 project"
"Connect the button's pressed signal to the start_game method"
"Import a texture with specific compression settings"
```

## Implementation Details

### Architecture

The Godot MCP server uses a bundled GDScript approach for efficient operation execution:

**1. TypeScript Server Layer**
- Handles MCP protocol communication
- Manages Godot process lifecycle
- Validates parameters and versions
- Caches documentation and results

**2. Bundled GDScript Operations**
- Single comprehensive script (`godot_operations.gd`) for all operations
- Accepts operation type and parameters as JSON
- Runs in headless mode for fast execution
- Returns structured JSON results

**3. Documentation Module**
- Fetches class info using Godot's `--doctool`
- Caches documentation locally for performance
- Provides search and best practices

### Key Benefits

- **No Temporary Files**: All operations use a single bundled script
- **Fast Execution**: Headless mode with minimal overhead
- **Type Safety**: Parameter validation and normalization
- **Version Aware**: Automatic feature detection based on Godot version
- **Comprehensive Caching**: Documentation and results cached for speed

### Supported Operations

The server supports 50+ operations across multiple categories:
- Scene Management (create, modify, query nodes)
- Script Management (create, attach, validate scripts)
- Resource Management (import, configure assets)
- Physics System (bodies, collision, materials)
- UI System (elements, themes, layouts)
- Animation System (players, keyframes, trees)
- Signal System (create, connect, disconnect)
- Debug Tools (run, capture, analyze)
- Documentation (search, class info, best practices)
- Project Management (settings, input, autoload)

## Troubleshooting

### Common Issues

**Godot Not Found**
- Set the `GODOT_PATH` environment variable to your Godot executable
- Verify Godot is in your system PATH
- Check that the path points to the correct Godot 4.5+ executable

**Version Incompatible**
- Upgrade to Godot 4.5.0 or later from [godotengine.org](https://godotengine.org/download)
- Run `godot --version` to verify your installation
- Use the `get_godot_version` tool to check compatibility

**Connection Issues**
- Restart your AI assistant after configuration changes
- Check that the MCP server path is correct in your configuration
- Enable DEBUG mode to see detailed logs

**Invalid Project Path**
- Ensure the path points to a directory containing a `project.godot` file
- Use absolute paths for better reliability
- Check file permissions

**Build Issues**
- Run `npm install` to ensure all dependencies are installed
- Delete `node_modules` and `build` folders, then rebuild
- Ensure you have Node.js 18+ installed

**For Cursor Users**
- Ensure the MCP server is enabled in Settings > Features > MCP
- MCP tools can only be run using the Agent chat profile (Cursor Pro or Business subscription)
- Use "Yolo Mode" for automatic tool execution
- Restart Cursor after configuration changes
- Check the MCP server logs in Cursor's developer tools

**For Cline Users**
- Verify the server path in Cline's MCP settings
- Check that the server is running (look for startup messages)
- Enable auto-approve for frequently used tools

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Roadmap

- [ ] Audio system operations (AudioStreamPlayer, buses, 3D audio)
- [ ] 3D scene operations (materials, environment, compositor)
- [ ] Performance profiling tools
- [ ] Movie capture functionality
- [ ] Additional debug visualization modes
- [ ] Extended documentation integration

See [.kiro/specs/godot-game-assistant/tasks.md](.kiro/specs/godot-game-assistant/tasks.md) for detailed implementation plan.

## Documentation Generation

The server automatically generates and caches Godot documentation using the `--doctool` flag. This happens transparently when you use documentation-related tools.

### Manual Documentation Generation

If you want to pre-generate documentation or clear the cache:

```bash
# Create cache directory
mkdir -p .godot-docs-cache/doctool

# Generate documentation for all Godot classes
godot --doctool .godot-docs-cache/doctool --no-docbase --headless --quit

# Or with custom Godot path (macOS example)
/Applications/Godot.app/Contents/MacOS/Godot --doctool .godot-docs-cache/doctool --no-docbase --headless --quit

# Windows example
"C:\Program Files\Godot\Godot.exe" --doctool .godot-docs-cache/doctool --no-docbase --headless --quit

# Linux example
/usr/bin/godot --doctool .godot-docs-cache/doctool --no-docbase --headless --quit
```

**Note**: 
- The `--headless` and `--quit` flags ensure Godot runs without a GUI and exits after generating documentation
- The `--no-docbase` flag generates class structure (methods, properties, signals) without detailed descriptions
- The MCP server provides links to online documentation for full details

### Documentation Cache

- **Default Location**: `~/.godot-docs-cache/` (user's home directory)
- **Custom Location**: Set `MCP_CACHE_DIR` environment variable to specify a different directory
- **Contents**: 
  - `doctool/` - Raw XML documentation from Godot
  - `*.json` - Parsed and cached class information
- **Size**: Typically 10-50 MB depending on usage
- **Clearing**: Delete the `.godot-docs-cache/` directory to regenerate

**Environment Variable Example:**
```bash
# Set custom cache directory
export MCP_CACHE_DIR=/path/to/your/cache

# Or in your MCP settings
{
  "env": {
    "MCP_CACHE_DIR": "/path/to/your/cache"
  }
}
```

### Using Documentation Tools

```text
"Show me documentation for CharacterBody2D"
"Search the docs for move_and_slide"
"What are the best practices for physics in Godot?"
"Get method info for Node2D.rotate"
```

The documentation module supports:
- Class information with inheritance hierarchy
- Method signatures with parameters and return types
- Property descriptions with default values
- Signal definitions with parameters
- Constants and enums
- Best practices for common topics

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
