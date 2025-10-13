# Task 11.4 Implementation Summary: run_scene Operation

## Overview
Implemented the `run_scene` operation to run specific Godot scenes through CLI with debug mode support, capturing console output and errors.

## Implementation Details

### 1. TypeScript Interfaces (src/index.ts)

Added two new interfaces for the run_scene operation:

```typescript
interface RunSceneParams {
  projectPath: string;
  scenePath: string;
  debug?: boolean;
  additionalArgs?: string[];
}

interface SceneRunResult {
  success: boolean;
  output: string[];
  errors: ErrorInfo[];
  exitCode: number;
}
```

### 2. MCP Tool Definition

Added the `run_scene` tool to the MCP server's tool list:

- **Name**: `run_scene`
- **Description**: Run a specific scene in debug mode through Godot CLI with -d flag, capturing console output and errors
- **Required Parameters**:
  - `projectPath`: Path to the Godot project directory
  - `scenePath`: Path to the scene file to run (relative to project)
- **Optional Parameters**:
  - `debug`: Whether to run in debug mode with -d flag (default: true)
  - `additionalArgs`: Additional CLI arguments to pass to Godot

### 3. Tool Handler Implementation

Implemented `handleRunScene` method with the following features:

#### Validation
- Validates project path and scene path
- Checks if project.godot exists
- Verifies scene file exists
- Ensures Godot executable is available

#### Execution
- Spawns Godot process with appropriate CLI arguments
- Runs scene with `--path`, scene path, and optional `-d` flag
- Supports additional CLI arguments
- Captures stdout and stderr in real-time

#### Output Parsing
- Parses console output line by line
- Identifies and extracts error information using `parseErrorLine` method
- Categorizes errors by type (runtime, script, engine)
- Captures stack traces when available

#### Response Formatting
- Provides structured output with:
  - Scene name and exit code
  - Success/failure status
  - Detailed error information (up to 10 errors shown)
  - Console output (last 50 lines)
  - Suggestions for additional tools to use

### 4. Integration

Added the tool handler to the switch statement in `setupToolHandlers`:

```typescript
case 'run_scene':
  return await this.handleRunScene(request.params.arguments);
```

## Key Features

1. **Debug Mode Support**: Automatically adds `-d` flag for debug mode (default: true)
2. **Real-time Output Capture**: Captures both stdout and stderr as the scene runs
3. **Error Parsing**: Automatically identifies and parses errors from Godot output
4. **Exit Code Tracking**: Tracks process exit code to determine success/failure
5. **Flexible Arguments**: Supports additional CLI arguments for advanced use cases
6. **Comprehensive Validation**: Validates all inputs before execution
7. **Helpful Error Messages**: Provides actionable suggestions when errors occur

## Usage Example

```typescript
{
  "projectPath": "/path/to/godot/project",
  "scenePath": "scenes/main.tscn",
  "debug": true,
  "additionalArgs": ["--verbose"]
}
```

## Response Format

The tool returns a formatted markdown response containing:

1. **Header**: Scene name, exit code, and status
2. **Errors Section**: Detailed error information with location and stack traces
3. **Console Output**: Last 50 lines of console output
4. **Additional Tools**: Suggestions for related tools (get_error_context, get_class_info, validate_script)

## Requirements Satisfied

✅ **Requirement 5.6**: WHEN пользователь запускает конкретную сцену THEN система SHALL запустить её в debug-режиме через CLI Godot

✅ **Requirement 13.6**: Related to scene execution and debugging

## Testing Recommendations

1. Test with valid scene files
2. Test with invalid scene paths
3. Test with scenes that have errors
4. Test with and without debug flag
5. Test with additional CLI arguments
6. Test error parsing with various error types
7. Test with scenes that produce warnings
8. Test exit code handling

## Notes

- The implementation uses Node.js `spawn` to run Godot as a separate process
- Output is captured in real-time and parsed for errors
- The operation is asynchronous and returns a Promise
- Error parsing reuses the existing `parseErrorLine` method
- The tool integrates seamlessly with other debug tools (get_error_context, etc.)

## Build Status

✅ TypeScript compilation successful
✅ No diagnostics errors
✅ Build completed successfully
