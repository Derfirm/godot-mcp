# Testing list_missing_assets Operation

## Test Setup

To test the `list_missing_assets` operation, you'll need a Godot project with some missing asset references.

## Test Case 1: Basic Missing Asset Detection

### Setup
1. Create a test Godot project
2. Create a scene file that references a non-existent texture:
   ```gdscript
   # In a script or scene file
   var texture = load("res://textures/missing_sprite.png")
   ```
3. Make sure the file `res://textures/missing_sprite.png` does NOT exist

### Expected Result
The operation should:
- Detect the missing texture
- Report it in the missing assets list
- Show which file references it
- Provide suggested fixes

### Test Command
```bash
# Using the MCP tool
{
  "tool": "list_missing_assets",
  "arguments": {
    "projectPath": "/path/to/test/project"
  }
}
```

## Test Case 2: Filtered Asset Types

### Setup
Same as Test Case 1, but also add missing audio and script references

### Test Command
```bash
# Check only textures
{
  "tool": "list_missing_assets",
  "arguments": {
    "projectPath": "/path/to/test/project",
    "checkTypes": ["texture"]
  }
}
```

### Expected Result
Should only report missing textures, not audio or scripts

## Test Case 3: No Missing Assets

### Setup
A clean project with all assets present

### Expected Result
```
✓ No missing assets found! All resource references are valid.
```

## Test Case 4: Similar Files Detection

### Setup
1. Create a file `res://textures/player_sprite.png`
2. Reference `res://textures/player_sprit.png` (typo) in a scene
3. The similar file detection should suggest the correct file

### Expected Result
The suggested fixes should include:
```
Similar files found: ["res://textures/player_sprite.png"]
```

## Verification Checklist

- [ ] Missing textures are detected
- [ ] Missing audio files are detected
- [ ] Missing scripts are detected
- [ ] Missing scenes are detected
- [ ] Missing materials are detected
- [ ] Missing meshes are detected
- [ ] Referenced by list is accurate
- [ ] Suggested fixes are helpful
- [ ] Similar files are found correctly
- [ ] Filter by checkTypes works
- [ ] Report format is readable
- [ ] Timestamp is included
- [ ] Checked paths list is complete

## Known Limitations

1. The operation scans .tscn, .tres, .gd, and .gdscript files
2. It uses regex patterns to find resource references
3. Some dynamic resource loading may not be detected
4. External resource packs are not currently supported

## Performance Notes

- Scanning large projects may take some time
- The operation is read-only and safe to run
- Results are returned as JSON for easy parsing
