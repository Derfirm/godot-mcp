# Version Validation System

## Overview

The Godot MCP Server includes a comprehensive version validation system to ensure compatibility with Godot 4.5+ features. This system automatically validates the Godot version on startup and before executing operations.

## Minimum Requirements

- **Minimum Version**: Godot 4.5.0
- **Recommended**: Latest stable version of Godot

## VersionValidator Class

The `VersionValidator` class provides the following functionality:

### Version Parsing

Parses Godot version strings into structured objects:

```typescript
const version = VersionValidator.parseVersion("4.5.0.stable.official");
// Returns: { major: 4, minor: 5, patch: 0, status: "stable", full: "4.5.0.stable.official" }
```

### Version Validation

Validates versions against minimum requirements:

```typescript
const result = VersionValidator.validate("4.5.0");
// Returns: { valid: true, version: {...}, message: "Godot version 4.5.0 is compatible." }
```

### Version Comparison

Compares two versions:

```typescript
const comparison = VersionValidator.compareVersions(v1, v2);
// Returns: -1 (v1 < v2), 0 (v1 === v2), or 1 (v1 > v2)
```

### Feature Detection

Detects supported features based on version:

```typescript
const features = VersionValidator.getSupportedFeatures(version);
// Returns: {
//   uidSystem: boolean,
//   compositorEffects: boolean,
//   enhancedPhysics: boolean,
//   improvedGDScript: boolean,
//   modernNodeTypes: boolean
// }
```

## Supported Features by Version

### Godot 4.4.0+
- ✓ UID System: Unique identifiers for resources

### Godot 4.5.0+
- ✓ UID System
- ✓ Compositor Effects: Advanced rendering pipeline
- ✓ Enhanced Physics: Improved physics material system with absorbent property
- ✓ Improved GDScript: Better parser and type checking
- ✓ Modern Node Types: Latest node types and APIs

## Integration with Server

The version validation is integrated into the server at multiple levels:

### 1. Startup Validation

When the server starts, it validates the Godot version:

```typescript
const version = await this.validateGodotVersion();
```

### 2. Operation Execution

Before executing any operation, the version is validated:

```typescript
private async executeOperation(operation: string, params: OperationParams, projectPath: string) {
  // Validate version before executing
  await this.validateGodotVersion();
  // ... execute operation
}
```

### 3. Version Information Tool

The `get_godot_version` tool provides detailed version information:

```
Godot Version: 4.5.0.stable

Compatibility: ✓ Compatible with Godot MCP Server
Minimum Required: 4.5.0

Supported Features:
  - UID System: ✓
  - Compositor Effects: ✓
  - Enhanced Physics: ✓
  - Improved GDScript: ✓
  - Modern Node Types: ✓
```

## Error Handling

When an incompatible version is detected, the server provides clear error messages:

```
Godot version 4.4.0 does not meet minimum requirement of 4.5.0. 
Please upgrade to Godot 4.5.0 or later.
```

Possible solutions are also provided:
- Ensure Godot 4.5.0 or later is installed
- Set GODOT_PATH environment variable to specify the correct path
- Upgrade your Godot installation if using an older version

## Testing

A test script is provided to verify the VersionValidator functionality:

```bash
npm run build
node build/test-version-validator.js
```

This will run comprehensive tests on:
- Version parsing
- Version validation
- Feature detection
- Version comparison

## Future Enhancements

Planned improvements for the version validation system:

1. **Version-Specific Operation Support**: Automatically enable/disable operations based on Godot version
2. **Deprecation Warnings**: Warn users about deprecated features in newer Godot versions
3. **Migration Assistance**: Provide guidance for upgrading projects between Godot versions
4. **Version Caching**: Cache version information to reduce validation overhead
