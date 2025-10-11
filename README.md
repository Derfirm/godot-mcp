
# Godot MCP

[![Github-sponsors](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#EA4AAA)](https://github.com/sponsors/Coding-Solo)

[![](https://badge.mcpx.dev?type=server 'MCP Server')](https://modelcontextprotocol.io/introduction)
[![Made with Godot](https://img.shields.io/badge/Made%20with-Godot-478CBF?style=flat&logo=godot%20engine&logoColor=white)](https://godotengine.org)
[![](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white 'Node.js')](https://nodejs.org/en/download/)
[![](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white 'TypeScript')](https://www.typescriptlang.org/)

[![](https://img.shields.io/github/last-commit/Coding-Solo/godot-mcp 'Last Commit')](https://github.com/Coding-Solo/godot-mcp/commits/main)
[![](https://img.shields.io/github/stars/Coding-Solo/godot-mcp 'Stars')](https://github.com/Coding-Solo/godot-mcp/stargazers)
[![](https://img.shields.io/github/forks/Coding-Solo/godot-mcp 'Forks')](https://github.com/Coding-Solo/godot-mcp/network/members)
[![](https://img.shields.io/badge/License-MIT-red.svg 'MIT License')](https://opensource.org/licenses/MIT)

```text
                           (((((((             (((((((                          
                        (((((((((((           (((((((((((                      
                        (((((((((((((       (((((((((((((                       
                        (((((((((((((((((((((((((((((((((                       
                        (((((((((((((((((((((((((((((((((                       
         (((((      (((((((((((((((((((((((((((((((((((((((((      (((((        
       (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((      
     ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((    
    ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((    
      (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((     
        (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((       
         (((((((((((@@@@@@@(((((((((((((((((((((((((((@@@@@@@(((((((((((        
         (((((((((@@@@,,,,,@@@(((((((((((((((((((((@@@,,,,,@@@@(((((((((        
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((        
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((        
         (((((((((@@@,,,,,,,@@((((((((@@@@@((((((((@@,,,,,,,@@@(((((((((        
         ((((((((((((@@@@@@(((((((((((@@@@@(((((((((((@@@@@@((((((((((((        
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((        
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((        
         @@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@        
         ((((((((( @@@(((((((((((@@(((((((((((@@(((((((((((@@@ (((((((((        
         (((((((((( @@((((((((((@@@(((((((((((@@@((((((((((@@ ((((((((((        
          (((((((((((@@@@@@@@@@@@@@(((((((((((@@@@@@@@@@@@@@(((((((((((         
           (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((          
              (((((((((((((((((((((((((((((((((((((((((((((((((((((             
                 (((((((((((((((((((((((((((((((((((((((((((((((                
                        (((((((((((((((((((((((((((((((((                       
                                                                                

                          /$$      /$$  /$$$$$$  /$$$$$$$ 
                         | $$$    /$$$ /$$__  $$| $$__  $$
                         | $$$$  /$$$$| $$  \__/| $$  \ $$
                         | $$ $$/$$ $$| $$      | $$$$$$$/
                         | $$  $$$| $$| $$      | $$____/ 
                         | $$\  $ | $$| $$    $$| $$      
                         | $$ \/  | $$|  $$$$$$/| $$      
                         |__/     |__/ \______/ |__/       
```

A Model Context Protocol (MCP) server for interacting with the Godot game engine.

## Introduction

Godot MCP enables AI assistants to launch the Godot editor, run projects, capture debug output, and control project execution - all through a standardized interface.

This direct feedback loop helps AI assistants like Claude understand what works and what doesn't in real Godot projects, leading to better code generation and debugging assistance.

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
  - Recommended: Latest stable version
- Node.js and npm
- An AI assistant that supports MCP (Cline, Cursor, etc.)

### Version Compatibility

This MCP server requires **Godot 4.5.0 or later** to ensure compatibility with modern Godot features:

- **UID System**: Unique identifiers for resources (4.4+)
- **Compositor Effects**: Advanced rendering pipeline (4.5+)
- **Enhanced Physics**: Improved physics material system (4.5+)
- **Improved GDScript**: Better parser and type checking (4.5+)
- **Modern Node Types**: Latest node types and APIs (4.5+)

The server will automatically validate your Godot version when executing operations and provide clear error messages if your version is incompatible.

## Installation and Configuration

### Step 1: Install and Build

First, clone the repository and build the MCP server:

```bash
git clone https://github.com/Coding-Solo/godot-mcp.git
cd godot-mcp
npm install
npm run build
```

### Step 2: Configure with Your AI Assistant

#### Option A: Configure with Cline

Add to your Cline MCP settings file (`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`):

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
        "load_sprite",
        "export_mesh_library",
        "save_scene",
        "get_uid",
        "update_project_uids"
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

You can customize the server behavior with these environment variables:

- `GODOT_PATH`: Path to the Godot executable (overrides automatic detection)
- `DEBUG`: Set to "true" to enable detailed server-side debug logging

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

The Godot MCP server uses a bundled GDScript approach for complex operations:

1. **Direct Commands**: Simple operations like launching the editor or getting project info use Godot's built-in CLI commands directly.
2. **Bundled Operations Script**: Complex operations like creating scenes or adding nodes use a single, comprehensive GDScript file (`godot_operations.gd`) that handles all operations.

This architecture provides several benefits:

- **No Temporary Files**: Eliminates the need for temporary script files, keeping your system clean
- **Simplified Codebase**: Centralizes all Godot operations in one (somewhat) organized file
- **Better Maintainability**: Makes it easier to add new operations or modify existing ones
- **Improved Error Handling**: Provides consistent error reporting across all operations
- **Reduced Overhead**: Minimizes file I/O operations for better performance

The bundled script accepts operation type and parameters as JSON, allowing for flexible and dynamic operation execution without generating temporary files for each operation.

## Troubleshooting

- **Godot Not Found**: Set the GODOT_PATH environment variable to your Godot executable
- **Version Incompatibility**: If you see version errors, upgrade to Godot 4.5.0 or later from [godotengine.org](https://godotengine.org/download)
- **Connection Issues**: Ensure the server is running and restart your AI assistant
- **Invalid Project Path**: Ensure the path points to a directory containing a project.godot file
- **Build Issues**: Make sure all dependencies are installed by running `npm install`
- **For Cursor Specifically**:
-   Ensure the MCP server shows up and is enabled in Cursor settings (Settings > MCP)
-   MCP tools can only be run using the Agent chat profile (Cursor Pro or Business subscription)
-   Use "Yolo Mode" to automatically run MCP tool requests

### Version-Related Issues

If you encounter version-related errors:

1. Check your Godot version: Run `godot --version` in your terminal
2. Verify minimum version: Ensure you have Godot 4.5.0 or later
3. Update Godot: Download the latest version from [godotengine.org](https://godotengine.org/download)
4. Set GODOT_PATH: If you have multiple Godot versions, set the GODOT_PATH environment variable to point to the correct one

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/coding-solo-godot-mcp-badge.png)](https://mseep.ai/app/coding-solo-godot-mcp)
