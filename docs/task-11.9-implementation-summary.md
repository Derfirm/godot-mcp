# Task 11.9 Implementation Summary: list_missing_assets Operation

## Overview
Implemented the `list_missing_assets` operation that scans a Godot project for missing assets (textures, audio, scripts, scenes, materials, meshes) and generates a comprehensive report with suggested fixes.

## Implementation Details

### 1. TypeScript Interfaces (src/index.ts)

Added the following interfaces:

```typescript
interface ListMissingAssetsParams {
  projectPath: string;
  checkTypes?: ('texture' | 'audio' | 'script' | 'scene' | 'material' | 'mesh')[];
}

interface MissingAssetsReport {
  missing: MissingAssetInfo[];
  totalMissing: number;
  checkedPaths: string[];
  timestamp: string;
}

interface MissingAssetInfo {
  path: string;
  type: string;
  referencedBy: string[];
  suggestedFixes?: string[];
}
```

### 2. MCP Tool Definition

Added tool definition in `setupToolHandlers()`:

```typescript
{
  name: 'list_missing_assets',
  description: 'Scan the project for missing assets (textures, audio, scripts, scenes, materials, meshes) and generate a report with suggested fixes',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to the Godot project directory',
      },
      checkTypes: {
        type: 'array',
        description: 'Optional: Types of assets to check for (default: all types)',
        items: {
          type: 'string',
          enum: ['texture', 'audio', 'script', 'scene', 'material', 'mesh'],
        },
      },
    },
    required: ['projectPath'],
  },
}
```

### 3. Tool Handler (src/index.ts)

Implemented `handleListMissingAssets()` method that:
- Validates the project path
- Executes the GDScript operation
- Parses the JSON result
- Formats a comprehensive report showing:
  - Total missing assets
  - Details for each missing asset (path, type, referenced by)
  - Suggested fixes for each missing asset
  - List of checked paths

### 4. GDScript Implementation (src/scripts/godot_operations.gd)

Implemented `list_missing_assets()` function with the following features:

#### Main Function
- Accepts optional `check_types` parameter to filter asset types
- Scans the entire project directory recursively
- Tracks all resource references
- Checks if referenced resources exist
- Generates suggested fixes for missing assets

#### Helper Functions

**`_scan_directory_for_references()`**
- Recursively scans directories
- Processes .tscn, .tres, .gd, and .gdscript files
- Skips hidden files and directories
- Builds a map of resource references

**`_extract_resource_references()`**
- Parses file content for resource paths
- Supports multiple patterns:
  - `ExtResource("res://path/to/resource.ext")`
  - `path = "res://path/to/resource.ext"`
  - `load("res://path/to/resource.ext")`
  - `preload("res://path/to/resource.ext")`
  - Direct resource path strings
- Uses RegEx for pattern matching
- Normalizes paths to res:// format

**`_get_resource_type()`**
- Determines resource type from file extension
- Supports:
  - Textures: png, jpg, jpeg, webp, svg, bmp, tga
  - Audio: wav, mp3, ogg
  - Scripts: gd, gdscript, cs
  - Scenes: tscn
  - Resources: tres (with smart detection for materials/meshes)
  - Meshes: mesh, obj, fbx, gltf, glb

**`_find_similar_files()`**
- Searches for files with similar names
- Helps identify if a file was renamed or moved
- Limits results to 5 matches to avoid overwhelming output

**`_search_similar_in_directory()`**
- Recursively searches for similar filenames
- Case-insensitive matching
- Provides suggestions for potential replacements

### 5. Suggested Fixes Generation

For each missing asset, the system generates contextual suggestions:
- Check if the file was moved or renamed
- Search for the filename in the project directory
- Update references in specific files
- List similar files that might be the intended resource

## Output Format

The operation returns a JSON result with the following structure:

```json
{
  "success": true,
  "report": {
    "missing": [
      {
        "path": "res://textures/missing_sprite.png",
        "type": "texture",
        "referenced_by": [
          "res://scenes/player.tscn",
          "res://scripts/player.gd"
        ],
        "suggested_fixes": [
          "Check if the file was moved or renamed",
          "Search for 'missing_sprite.png' in the project directory",
          "Update references in: [...]",
          "Similar files found: [...]"
        ]
      }
    ],
    "total_missing": 1,
    "checked_paths": [
      "res://scenes/player.tscn",
      "res://scripts/player.gd",
      ...
    ],
    "timestamp": "2025-12-10T..."
  }
}
```

## User-Facing Report

The handler formats the report into a readable markdown format:

```markdown
# Missing Assets Report

**Timestamp:** 2025-12-10T...
**Total Missing:** 1
**Checked Paths:** 15

## Missing Assets (1)

### res://textures/missing_sprite.png
**Type:** texture
**Referenced By:**
  - res://scenes/player.tscn
  - res://scripts/player.gd
**Suggested Fixes:**
  - Check if the file was moved or renamed
  - Search for 'missing_sprite.png' in the project directory
  - Update references in: [...]
  - Similar files found: [...]

## Checked Paths

- res://scenes/player.tscn
- res://scripts/player.gd
...
```

## Requirements Satisfied

✅ **5.11**: WHEN пользователь запрашивает проверку ассетов THEN система SHALL вернуть список отсутствующих текстур/материалов/скриптов

✅ **13.11**: IF отсутствующие ассеты найдены THEN система SHALL предоставить пути к файлам и типы ресурсов

## Testing Recommendations

To test this implementation:

1. Create a test project with some missing asset references
2. Call the `list_missing_assets` tool with the project path
3. Verify that missing assets are correctly identified
4. Check that suggested fixes are helpful and accurate
5. Test with different `checkTypes` filters
6. Verify that similar file suggestions work correctly

## Future Enhancements

Potential improvements for future iterations:
- Add support for more resource types (fonts, shaders, etc.)
- Implement automatic fixing of references
- Add option to generate a detailed HTML report
- Support for external resource packs
- Integration with version control to track when assets were removed
