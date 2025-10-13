#!/usr/bin/env node
/**
 * Godot MCP Server
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */

import { fileURLToPath } from 'url';
import { join, dirname, basename, normalize } from 'path';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { VersionValidator, GodotVersion } from './version-validator.js';
import { DocumentationModule, ClassInfo, MethodInfo, SearchResult, BestPractice } from './documentation-module.js';

/**
 * Debug Module Interfaces
 */
interface RunDebugParams {
  projectPath: string;
  scene?: string;
  breakpoints?: Array<{
    script: string;
    line: number;
  }>;
  captureOutput?: boolean;
}

interface DebugSession {
  sessionId: string;
  output: string[];
  errors: ErrorInfo[];
  warnings: string[];
  performance?: PerformanceMetrics;
}

interface ErrorInfo {
  message: string;
  stack: StackFrame[];
  script: string;
  line: number;
  column?: number;
  type: 'runtime' | 'script' | 'engine';
}

interface StackFrame {
  function: string;
  script: string;
  line: number;
}

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  drawCalls: number;
}

/**
 * Run Scene Interfaces
 */
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

/**
 * Capture Screenshot Interfaces
 */
interface CaptureScreenshotParams {
  projectPath: string;
  outputPath: string;
  scenePath?: string; // If specified, run the scene and capture screenshot
  delay?: number; // Delay before capture (in seconds)
  size?: { width: number; height: number };
}

/**
 * List Missing Assets Interfaces
 */
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

/**
 * Remote Tree Dump Interfaces
 */
interface RemoteTreeDumpParams {
  projectPath: string;
  scenePath?: string; // If specified, run the scene first
  filter?: {
    nodeType?: string; // Filter by node type (e.g., "CharacterBody2D")
    nodeName?: string; // Filter by node name (regex support)
    hasScript?: boolean; // Only nodes with scripts
    depth?: number; // Maximum depth of tree
  };
  includeProperties?: boolean; // Include node properties
  includeSignals?: boolean; // Include connected signals
}

interface TreeDumpResult {
  nodes: NodeDumpInfo[];
  totalNodes: number;
  timestamp: string;
}

interface NodeDumpInfo {
  path: string;
  type: string;
  name: string;
  children: string[];
  properties?: Record<string, any>;
  signals?: SignalConnection[];
  script?: string;
}

interface SignalConnection {
  name: string;
  connections: Array<{
    target: string;
    method: string;
  }>;
}

/**
 * Toggle Debug Draw Interfaces
 */
interface ToggleDebugDrawParams {
  projectPath: string;
  mode: 'disabled' | 'unshaded' | 'lighting' | 'overdraw' | 'wireframe' |
  'normal_buffer' | 'voxel_gi_albedo' | 'voxel_gi_lighting' |
  'voxel_gi_emission' | 'shadow_atlas' | 'directional_shadow_atlas' |
  'scene_luminance' | 'ssao' | 'ssil' | 'pssm_splits' | 'decal_atlas' |
  'sdfgi' | 'sdfgi_probes' | 'gi_buffer' | 'disable_lod' | 'cluster_omni_lights' |
  'cluster_spot_lights' | 'cluster_decals' | 'cluster_reflection_probes' |
  'occluders' | 'motion_vectors' | 'internal_buffer'; // Godot 4.5+ debug draw modes
  viewport?: string; // Path to specific Viewport node
}

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';
const GODOT_DEBUG_MODE: boolean = true; // Always use GODOT DEBUG MODE

const execAsync = promisify(exec);

// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Interface representing a running Godot process
 */
interface GodotProcess {
  process: any;
  output: string[];
  errors: string[];
}

/**
 * Interface for server configuration
 */
interface GodotServerConfig {
  godotPath?: string;
  debugMode?: boolean;
  godotDebugMode?: boolean;
  strictPathValidation?: boolean; // New option to control path validation behavior
}

/**
 * Interface for operation parameters
 */
interface OperationParams {
  [key: string]: any;
}

/**
 * Main server class for the Godot MCP server
 */
class GodotServer {
  private server: Server;
  private activeProcess: GodotProcess | null = null;
  private godotPath: string | null = null;
  private operationsScriptPath: string;
  private validatedPaths: Map<string, boolean> = new Map();
  private strictPathValidation: boolean = false;
  private godotVersion: GodotVersion | null = null;
  private versionValidated: boolean = false;
  private documentationModule: DocumentationModule | null = null;

  /**
   * Parameter name mappings between snake_case and camelCase
   * This allows the server to accept both formats
   */
  private parameterMappings: Record<string, string> = {
    'project_path': 'projectPath',
    'scene_path': 'scenePath',
    'root_node_type': 'rootNodeType',
    'parent_node_path': 'parentNodePath',
    'node_type': 'nodeType',
    'node_name': 'nodeName',
    'texture_path': 'texturePath',
    'node_path': 'nodePath',
    'output_path': 'outputPath',
    'mesh_item_names': 'meshItemNames',
    'new_path': 'newPath',
    'file_path': 'filePath',
    'directory': 'directory',
    'recursive': 'recursive',
    'scene': 'scene',
  };

  /**
   * Reverse mapping from camelCase to snake_case
   * Generated from parameterMappings for quick lookups
   */
  private reverseParameterMappings: Record<string, string> = {};

  constructor(config?: GodotServerConfig) {
    // Initialize reverse parameter mappings
    for (const [snakeCase, camelCase] of Object.entries(this.parameterMappings)) {
      this.reverseParameterMappings[camelCase] = snakeCase;
    }
    // Apply configuration if provided
    let debugMode = DEBUG_MODE;
    let godotDebugMode = GODOT_DEBUG_MODE;

    if (config) {
      if (config.debugMode !== undefined) {
        debugMode = config.debugMode;
      }
      if (config.godotDebugMode !== undefined) {
        godotDebugMode = config.godotDebugMode;
      }
      if (config.strictPathValidation !== undefined) {
        this.strictPathValidation = config.strictPathValidation;
      }

      // Store and validate custom Godot path if provided
      if (config.godotPath) {
        const normalizedPath = normalize(config.godotPath);
        this.godotPath = normalizedPath;
        this.logDebug(`Custom Godot path provided: ${this.godotPath}`);

        // Validate immediately with sync check
        if (!this.isValidGodotPathSync(this.godotPath)) {
          console.warn(`[SERVER] Invalid custom Godot path provided: ${this.godotPath}`);
          this.godotPath = null; // Reset to trigger auto-detection later
        }
      }
    }

    // Set the path to the operations script
    this.operationsScriptPath = join(__dirname, 'scripts', 'godot_operations.gd');
    if (debugMode) console.debug(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);

    // Initialize the MCP server
    this.server = new Server(
      {
        name: 'godot-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up tool handlers
    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);

    // Cleanup on exit
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Log debug messages if debug mode is enabled
   */
  private logDebug(message: string): void {
    if (DEBUG_MODE) {
      console.debug(`[DEBUG] ${message}`);
    }
  }

  /**
   * Create a standardized error response with possible solutions
   */
  private createErrorResponse(message: string, possibleSolutions: string[] = []): any {
    // Log the error
    console.error(`[SERVER] Error response: ${message}`);
    if (possibleSolutions.length > 0) {
      console.error(`[SERVER] Possible solutions: ${possibleSolutions.join(', ')}`);
    }

    const response: any = {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };

    if (possibleSolutions.length > 0) {
      response.content.push({
        type: 'text',
        text: 'Possible solutions:\n- ' + possibleSolutions.join('\n- '),
      });
    }

    return response;
  }

  /**
   * Validate a path to prevent path traversal attacks
   */
  private validatePath(path: string): boolean {
    // Basic validation to prevent path traversal
    if (!path || path.includes('..')) {
      return false;
    }

    // Add more validation as needed
    return true;
  }

  /**
   * Synchronous validation for constructor use
   * This is a quick check that only verifies file existence, not executable validity
   * Full validation will be performed later in detectGodotPath
   * @param path Path to check
   * @returns True if the path exists or is 'godot' (which might be in PATH)
   */
  private isValidGodotPathSync(path: string): boolean {
    try {
      this.logDebug(`Quick-validating Godot path: ${path}`);
      return path === 'godot' || existsSync(path);
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      return false;
    }
  }

  /**
   * Validate if a Godot path is valid and executable
   */
  private async isValidGodotPath(path: string): Promise<boolean> {
    // Check cache first
    if (this.validatedPaths.has(path)) {
      return this.validatedPaths.get(path)!;
    }

    try {
      this.logDebug(`Validating Godot path: ${path}`);

      // Check if the file exists (skip for 'godot' which might be in PATH)
      if (path !== 'godot' && !existsSync(path)) {
        this.logDebug(`Path does not exist: ${path}`);
        this.validatedPaths.set(path, false);
        return false;
      }

      // Try to execute Godot with --version flag
      const command = path === 'godot' ? 'godot --version' : `"${path}" --version`;
      await execAsync(command);

      this.logDebug(`Valid Godot path: ${path}`);
      this.validatedPaths.set(path, true);
      return true;
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      this.validatedPaths.set(path, false);
      return false;
    }
  }

  /**
   * Detect the Godot executable path based on the operating system
   */
  private async detectGodotPath() {
    // If godotPath is already set and valid, use it
    if (this.godotPath && await this.isValidGodotPath(this.godotPath)) {
      this.logDebug(`Using existing Godot path: ${this.godotPath}`);
      return;
    }

    // Check environment variable next
    if (process.env.GODOT_PATH) {
      const normalizedPath = normalize(process.env.GODOT_PATH);
      this.logDebug(`Checking GODOT_PATH environment variable: ${normalizedPath}`);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Using Godot path from environment: ${this.godotPath}`);
        return;
      } else {
        this.logDebug(`GODOT_PATH environment variable is invalid`);
      }
    }

    // Auto-detect based on platform
    const osPlatform = process.platform;
    this.logDebug(`Auto-detecting Godot path for platform: ${osPlatform}`);

    const possiblePaths: string[] = [
      'godot', // Check if 'godot' is in PATH first
    ];

    // Add platform-specific paths
    if (osPlatform === 'darwin') {
      possiblePaths.push(
        '/Applications/Godot.app/Contents/MacOS/Godot',
        '/Applications/Godot_4.app/Contents/MacOS/Godot',
        `${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`
      );
    } else if (osPlatform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\Godot\\Godot.exe',
        'C:\\Program Files (x86)\\Godot\\Godot.exe',
        'C:\\Program Files\\Godot_4\\Godot.exe',
        'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
        `${process.env.USERPROFILE}\\Godot\\Godot.exe`
      );
    } else if (osPlatform === 'linux') {
      possiblePaths.push(
        '/usr/bin/godot',
        '/usr/local/bin/godot',
        '/snap/bin/godot',
        `${process.env.HOME}/.local/bin/godot`
      );
    }

    // Try each possible path
    for (const path of possiblePaths) {
      const normalizedPath = normalize(path);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Found Godot at: ${normalizedPath}`);
        return;
      }
    }

    // If we get here, we couldn't find Godot
    this.logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
    console.warn(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
    console.warn(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);

    if (this.strictPathValidation) {
      // In strict mode, throw an error
      throw new Error(`Could not find a valid Godot executable. Set GODOT_PATH or provide a valid path in config.`);
    } else {
      // Fallback to a default path in non-strict mode; this may not be valid and requires user configuration for reliability
      if (osPlatform === 'win32') {
        this.godotPath = normalize('C:\\Program Files\\Godot\\Godot.exe');
      } else if (osPlatform === 'darwin') {
        this.godotPath = normalize('/Applications/Godot.app/Contents/MacOS/Godot');
      } else {
        this.godotPath = normalize('/usr/bin/godot');
      }

      this.logDebug(`Using default path: ${this.godotPath}, but this may not work.`);
      console.warn(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
      console.warn(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
    }
  }

  /**
   * Set a custom Godot path
   * @param customPath Path to the Godot executable
   * @returns True if the path is valid and was set, false otherwise
   */
  public async setGodotPath(customPath: string): Promise<boolean> {
    if (!customPath) {
      return false;
    }

    // Normalize the path to ensure consistent format across platforms
    // (e.g., backslashes to forward slashes on Windows, resolving relative paths)
    const normalizedPath = normalize(customPath);
    if (await this.isValidGodotPath(normalizedPath)) {
      this.godotPath = normalizedPath;
      this.logDebug(`Godot path set to: ${normalizedPath}`);
      return true;
    }

    this.logDebug(`Failed to set invalid Godot path: ${normalizedPath}`);
    return false;
  }

  /**
   * Clean up resources when shutting down
   */
  private async cleanup() {
    this.logDebug('Cleaning up resources');
    if (this.activeProcess) {
      this.logDebug('Killing active Godot process');
      this.activeProcess.process.kill();
      this.activeProcess = null;
    }
    await this.server.close();
  }

  /**
   * Check if the Godot version is 4.4 or later
   * @param version The Godot version string
   * @returns True if the version is 4.4 or later
   */
  private isGodot44OrLater(version: string): boolean {
    const match = version.match(/^(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      return major > 4 || (major === 4 && minor >= 4);
    }
    return false;
  }

  /**
   * Validate and retrieve the Godot version
   * @returns The validated Godot version or throws an error
   */
  private async validateGodotVersion(): Promise<GodotVersion> {
    // Return cached version if already validated
    if (this.versionValidated && this.godotVersion) {
      return this.godotVersion;
    }

    // Ensure godotPath is set
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        throw new Error('Could not find a valid Godot executable path');
      }
    }

    try {
      this.logDebug('Validating Godot version...');

      // Execute Godot with --version flag
      const command = this.godotPath === 'godot'
        ? 'godot --version'
        : `"${this.godotPath}" --version`;

      const { stdout } = await execAsync(command);
      const versionString = stdout.trim();

      this.logDebug(`Godot version string: ${versionString}`);

      // Validate the version using VersionValidator
      const validationResult = VersionValidator.validate(versionString);

      if (!validationResult.valid) {
        console.error(`[SERVER] ${validationResult.message}`);
        throw new Error(validationResult.message);
      }

      this.godotVersion = validationResult.version;
      this.versionValidated = true;

      // Log supported features
      if (this.godotVersion) {
        const features = VersionValidator.getSupportedFeatures(this.godotVersion);
        this.logDebug(`Godot ${VersionValidator.formatVersion(this.godotVersion)} features:`);
        this.logDebug(`  - UID System: ${features.uidSystem}`);
        this.logDebug(`  - Compositor Effects: ${features.compositorEffects}`);
        this.logDebug(`  - Enhanced Physics: ${features.enhancedPhysics}`);
        this.logDebug(`  - Improved GDScript: ${features.improvedGDScript}`);
        this.logDebug(`  - Modern Node Types: ${features.modernNodeTypes}`);
      }

      console.log(`[SERVER] ${validationResult.message}`);
      return this.godotVersion!;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SERVER] Failed to validate Godot version: ${errorMessage}`);
      throw new Error(`Godot version validation failed: ${errorMessage}`);
    }
  }

  /**
   * Get the current Godot version (validates if not already done)
   * @returns The Godot version or null if not validated
   */
  async getGodotVersion(): Promise<GodotVersion | null> {
    try {
      return await this.validateGodotVersion();
    } catch (error) {
      this.logDebug(`Error getting Godot version: ${error}`);
      return null;
    }
  }

  /**
   * Check if a specific feature is supported by the current Godot version
   * @param feature Feature name to check
   * @returns True if the feature is supported
   */
  async isFeatureSupported(feature: keyof ReturnType<typeof VersionValidator.getSupportedFeatures>): Promise<boolean> {
    const version = await this.getGodotVersion();
    if (!version) {
      return false;
    }
    const features = VersionValidator.getSupportedFeatures(version);
    return features[feature];
  }

  /**
   * Initialize the documentation module
   * @returns The documentation module instance
   */
  private async getDocumentationModule(): Promise<DocumentationModule> {
    if (this.documentationModule) {
      return this.documentationModule;
    }

    // Ensure godotPath is set
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        throw new Error('Could not find a valid Godot executable path');
      }
    }

    this.documentationModule = new DocumentationModule(
      this.godotPath,
      undefined, // Use default cache directory
      DEBUG_MODE
    );

    return this.documentationModule;
  }

  /**
   * Normalize parameters to camelCase format
   * @param params Object with either snake_case or camelCase keys
   * @returns Object with all keys in camelCase format
   */
  private normalizeParameters(params: OperationParams): OperationParams {
    if (!params || typeof params !== 'object') {
      return params;
    }

    const result: OperationParams = {};

    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        let normalizedKey = key;

        // If the key is in snake_case, convert it to camelCase using our mapping
        if (key.includes('_') && this.parameterMappings[key]) {
          normalizedKey = this.parameterMappings[key];
        }

        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[normalizedKey] = this.normalizeParameters(params[key] as OperationParams);
        } else {
          result[normalizedKey] = params[key];
        }
      }
    }

    return result;
  }

  /**
   * Convert camelCase keys to snake_case
   * @param params Object with camelCase keys
   * @returns Object with snake_case keys
   */
  private convertCamelToSnakeCase(params: OperationParams): OperationParams {
    const result: OperationParams = {};

    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        // Convert camelCase to snake_case
        const snakeKey = this.reverseParameterMappings[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[snakeKey] = this.convertCamelToSnakeCase(params[key] as OperationParams);
        } else {
          result[snakeKey] = params[key];
        }
      }
    }

    return result;
  }

  /**
   * Execute a Godot operation using the operations script
   * @param operation The operation to execute
   * @param params The parameters for the operation
   * @param projectPath The path to the Godot project
   * @returns The stdout and stderr from the operation
   */
  private async executeOperation(
    operation: string,
    params: OperationParams,
    projectPath: string
  ): Promise<{ stdout: string; stderr: string }> {
    this.logDebug(`Executing operation: ${operation} in project: ${projectPath}`);
    this.logDebug(`Original operation params: ${JSON.stringify(params)}`);

    // Convert camelCase parameters to snake_case for Godot script
    const snakeCaseParams = this.convertCamelToSnakeCase(params);
    this.logDebug(`Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);

    // Validate Godot version before executing operations
    try {
      await this.validateGodotVersion();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot execute operation: ${errorMessage}`);
    }

    // Ensure godotPath is set
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        throw new Error('Could not find a valid Godot executable path');
      }
    }

    try {
      // Serialize the snake_case parameters to a valid JSON string
      const paramsJson = JSON.stringify(snakeCaseParams);
      // Escape single quotes in the JSON string to prevent command injection
      const escapedParams = paramsJson.replace(/'/g, "'\\''");
      // On Windows, cmd.exe does not strip single quotes, so we use
      // double quotes and escape them to ensure the JSON is parsed
      // correctly by Godot.
      const isWindows = process.platform === 'win32';
      const quotedParams = isWindows
        ? `\"${paramsJson.replace(/\"/g, '\\"')}\"`
        : `'${escapedParams}'`;


      // Add debug arguments if debug mode is enabled
      const debugArgs = GODOT_DEBUG_MODE ? ['--debug-godot'] : [];

      // For capture_screenshot, we need rendering (viewport), so don't use --headless
      // The script will quit automatically after capturing
      const needsRendering = operation === 'capture_screenshot';
      const headlessFlag = needsRendering ? [] : ['--headless'];

      // Construct the command with the operation and JSON parameters
      const cmd = [
        `"${this.godotPath}"`,
        ...headlessFlag,
        '--path',
        `"${projectPath}"`,
        '--script',
        `"${this.operationsScriptPath}"`,
        operation,
        quotedParams, // Pass the JSON string as a single argument
        ...debugArgs,
      ].join(' ');

      this.logDebug(`Command: ${cmd}`);

      const { stdout, stderr } = await execAsync(cmd);

      return { stdout, stderr };
    } catch (error: unknown) {
      // If execAsync throws, it still contains stdout/stderr
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string };
        return {
          stdout: execError.stdout,
          stderr: execError.stderr,
        };
      }

      throw error;
    }
  }

  /**
   * Get the structure of a Godot project
   * @param projectPath Path to the Godot project
   * @returns Object representing the project structure
   */
  private async getProjectStructure(projectPath: string): Promise<any> {
    try {
      // Get top-level directories in the project
      const entries = readdirSync(projectPath, { withFileTypes: true });

      const structure: any = {
        scenes: [],
        scripts: [],
        assets: [],
        other: [],
      };

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirName = entry.name.toLowerCase();

          // Skip hidden directories
          if (dirName.startsWith('.')) {
            continue;
          }

          // Count files in common directories
          if (dirName === 'scenes' || dirName.includes('scene')) {
            structure.scenes.push(entry.name);
          } else if (dirName === 'scripts' || dirName.includes('script')) {
            structure.scripts.push(entry.name);
          } else if (
            dirName === 'assets' ||
            dirName === 'textures' ||
            dirName === 'models' ||
            dirName === 'sounds' ||
            dirName === 'music'
          ) {
            structure.assets.push(entry.name);
          } else {
            structure.other.push(entry.name);
          }
        }
      }

      return structure;
    } catch (error) {
      this.logDebug(`Error getting project structure: ${error}`);
      return { error: 'Failed to get project structure' };
    }
  }

  /**
   * Find Godot projects in a directory
   * @param directory Directory to search
   * @param recursive Whether to search recursively
   * @returns Array of Godot projects
   */
  private findGodotProjects(directory: string, recursive: boolean): Array<{ path: string; name: string }> {
    const projects: Array<{ path: string; name: string }> = [];

    try {
      // Check if the directory itself is a Godot project
      const projectFile = join(directory, 'project.godot');
      if (existsSync(projectFile)) {
        projects.push({
          path: directory,
          name: basename(directory),
        });
      }

      // If not recursive, only check immediate subdirectories
      if (!recursive) {
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = join(directory, entry.name);
            const projectFile = join(subdir, 'project.godot');
            if (existsSync(projectFile)) {
              projects.push({
                path: subdir,
                name: entry.name,
              });
            }
          }
        }
      } else {
        // Recursive search
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = join(directory, entry.name);
            // Skip hidden directories
            if (entry.name.startsWith('.')) {
              continue;
            }
            // Check if this directory is a Godot project
            const projectFile = join(subdir, 'project.godot');
            if (existsSync(projectFile)) {
              projects.push({
                path: subdir,
                name: entry.name,
              });
            } else {
              // Recursively search this directory
              const subProjects = this.findGodotProjects(subdir, true);
              projects.push(...subProjects);
            }
          }
        }
      }
    } catch (error) {
      this.logDebug(`Error searching directory ${directory}: ${error}`);
    }

    return projects;
  }

  /**
   * Set up the tool handlers for the MCP server
   */
  private setupToolHandlers() {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'launch_editor',
          description: 'Launch Godot editor for a specific project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'run_project',
          description: 'Run the Godot project and capture output',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scene: {
                type: 'string',
                description: 'Optional: Specific scene to run',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'get_debug_output',
          description: 'Get the current debug output and errors',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'stop_project',
          description: 'Stop the currently running Godot project',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_godot_version',
          description: 'Get the installed Godot version',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'list_projects',
          description: 'List Godot projects in a directory',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'Directory to search for Godot projects',
              },
              recursive: {
                type: 'boolean',
                description: 'Whether to search recursively (default: false)',
              },
            },
            required: ['directory'],
          },
        },
        {
          name: 'get_project_info',
          description: 'Retrieve metadata about a Godot project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'create_scene',
          description: 'Create a new Godot scene file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path where the scene file will be saved (relative to project)',
              },
              rootNodeType: {
                type: 'string',
                description: 'Type of the root node (e.g., Node2D, Node3D)',
                default: 'Node2D',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'add_node',
          description: 'Add a node to an existing scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node (e.g., "root" or "root/Player")',
                default: 'root',
              },
              nodeType: {
                type: 'string',
                description: 'Type of node to add (e.g., Sprite2D, CollisionShape2D)',
              },
              nodeName: {
                type: 'string',
                description: 'Name for the new node',
              },
              properties: {
                type: 'object',
                description: 'Optional properties to set on the node',
              },
            },
            required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
          },
        },
        {
          name: 'create_animation_player',
          description: 'Create an AnimationPlayer node with basic animations',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node',
                default: 'root',
              },
              nodeName: {
                type: 'string',
                description: 'Name for the AnimationPlayer node',
                default: 'AnimationPlayer',
              },
              animations: {
                type: 'array',
                description: 'Optional array of animation names to create',
                items: {
                  type: 'string',
                },
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'add_keyframes',
          description: 'Add keyframes to an animation in an AnimationPlayer',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              animationPlayerPath: {
                type: 'string',
                description: 'Path to the AnimationPlayer node (e.g., "root/AnimationPlayer")',
              },
              animationName: {
                type: 'string',
                description: 'Name of the animation to add keyframes to',
              },
              track: {
                type: 'object',
                description: 'Track configuration with keyframes',
                properties: {
                  nodePath: {
                    type: 'string',
                    description: 'Path to the node to animate (relative to AnimationPlayer parent)',
                  },
                  property: {
                    type: 'string',
                    description: 'Property to animate (e.g., "position", "rotation", "modulate")',
                  },
                  keyframes: {
                    type: 'array',
                    description: 'Array of keyframe definitions',
                    items: {
                      type: 'object',
                      properties: {
                        time: {
                          type: 'number',
                          description: 'Time in seconds for this keyframe',
                        },
                        value: {
                          description: 'Value at this keyframe (type depends on property)',
                        },
                        transition: {
                          type: 'number',
                          description: 'Transition type (default: 1.0 for linear)',
                        },
                      },
                      required: ['time', 'value'],
                    },
                  },
                },
                required: ['nodePath', 'property', 'keyframes'],
              },
            },
            required: ['projectPath', 'scenePath', 'animationPlayerPath', 'animationName', 'track'],
          },
        },
        {
          name: 'setup_animation_tree',
          description: 'Setup an AnimationTree with a state machine for managing animations',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node',
                default: 'root',
              },
              nodeName: {
                type: 'string',
                description: 'Name for the AnimationTree node',
                default: 'AnimationTree',
              },
              animationPlayerPath: {
                type: 'string',
                description: 'Path to the AnimationPlayer node to connect to',
              },
              states: {
                type: 'array',
                description: 'Array of state names for the state machine',
                items: {
                  type: 'string',
                },
              },
              transitions: {
                type: 'array',
                description: 'Array of transition definitions between states',
                items: {
                  type: 'object',
                  properties: {
                    from: {
                      type: 'string',
                      description: 'Source state name',
                    },
                    to: {
                      type: 'string',
                      description: 'Target state name',
                    },
                    condition: {
                      type: 'string',
                      description: 'Optional condition parameter name',
                    },
                  },
                  required: ['from', 'to'],
                },
              },
            },
            required: ['projectPath', 'scenePath', 'animationPlayerPath'],
          },
        },
        {
          name: 'add_particles',
          description: 'Add GPUParticles2D or GPUParticles3D node with particle settings (Godot 4.5+)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node',
                default: 'root',
              },
              particleType: {
                type: 'string',
                description: 'Type of particle system',
                enum: ['GPUParticles2D', 'GPUParticles3D'],
              },
              nodeName: {
                type: 'string',
                description: 'Name for the particle node',
              },
              properties: {
                type: 'object',
                description: 'Particle system properties',
                properties: {
                  amount: {
                    type: 'number',
                    description: 'Number of particles (default: 8)',
                  },
                  lifetime: {
                    type: 'number',
                    description: 'Particle lifetime in seconds (default: 1.0)',
                  },
                  oneShot: {
                    type: 'boolean',
                    description: 'Whether particles emit once or continuously (default: false)',
                  },
                  preprocess: {
                    type: 'number',
                    description: 'Preprocess time in seconds (default: 0.0)',
                  },
                  speedScale: {
                    type: 'number',
                    description: 'Speed scale multiplier (default: 1.0)',
                  },
                  explosiveness: {
                    type: 'number',
                    description: 'Explosiveness ratio 0-1 (default: 0.0)',
                  },
                  randomness: {
                    type: 'number',
                    description: 'Randomness ratio 0-1 (default: 0.0)',
                  },
                  fixedFps: {
                    type: 'number',
                    description: 'Fixed FPS for particle simulation (default: 30)',
                  },
                  emitting: {
                    type: 'boolean',
                    description: 'Whether particles are emitting (default: true)',
                  },
                },
              },
              processMaterial: {
                type: 'object',
                description: 'ParticleProcessMaterial properties',
                properties: {
                  direction: {
                    type: 'object',
                    description: 'Emission direction (Vector3)',
                  },
                  spread: {
                    type: 'number',
                    description: 'Emission spread in degrees',
                  },
                  gravity: {
                    type: 'object',
                    description: 'Gravity vector (Vector3)',
                  },
                  initialVelocityMin: {
                    type: 'number',
                    description: 'Minimum initial velocity',
                  },
                  initialVelocityMax: {
                    type: 'number',
                    description: 'Maximum initial velocity',
                  },
                  angularVelocityMin: {
                    type: 'number',
                    description: 'Minimum angular velocity',
                  },
                  angularVelocityMax: {
                    type: 'number',
                    description: 'Maximum angular velocity',
                  },
                  scaleMin: {
                    type: 'number',
                    description: 'Minimum particle scale',
                  },
                  scaleMax: {
                    type: 'number',
                    description: 'Maximum particle scale',
                  },
                  color: {
                    type: 'object',
                    description: 'Particle color (Color with r, g, b, a)',
                  },
                },
              },
            },
            required: ['projectPath', 'scenePath', 'particleType', 'nodeName'],
          },
        },
        {
          name: 'create_ui_element',
          description: 'Create a UI element (Control node) in a scene with proper anchors',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node (e.g., "root" or "root/UI")',
                default: 'root',
              },
              elementType: {
                type: 'string',
                description: 'Type of UI element (Button, Label, TextEdit, Panel, VBoxContainer, HBoxContainer, etc.)',
              },
              elementName: {
                type: 'string',
                description: 'Name for the new UI element',
              },
              properties: {
                type: 'object',
                description: 'Optional properties to set on the element (text, size, etc.)',
              },
              anchors: {
                type: 'object',
                description: 'Anchor settings (anchor_left, anchor_top, anchor_right, anchor_bottom)',
                properties: {
                  anchor_left: { type: 'number' },
                  anchor_top: { type: 'number' },
                  anchor_right: { type: 'number' },
                  anchor_bottom: { type: 'number' },
                },
              },
            },
            required: ['projectPath', 'scenePath', 'elementType', 'elementName'],
          },
        },
        {
          name: 'apply_theme',
          description: 'Apply a Theme resource to a Control node or its children',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the Control node (e.g., "root/UI")',
              },
              themePath: {
                type: 'string',
                description: 'Path to the Theme resource file (relative to project)',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'themePath'],
          },
        },
        {
          name: 'setup_layout',
          description: 'Setup layout properties for Container nodes (VBoxContainer, HBoxContainer, GridContainer, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the Container node (e.g., "root/UI/VBoxContainer")',
              },
              properties: {
                type: 'object',
                description: 'Layout properties to set',
                properties: {
                  alignment: {
                    type: 'string',
                    description: 'Alignment for BoxContainer (BEGIN, CENTER, END)',
                  },
                  columns: {
                    type: 'number',
                    description: 'Number of columns for GridContainer',
                  },
                  separation: {
                    type: 'number',
                    description: 'Separation between children',
                  },
                },
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'properties'],
          },
        },
        {
          name: 'create_menu',
          description: 'Create a menu structure with buttons and navigation',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node (e.g., "root" or "root/UI")',
                default: 'root',
              },
              menuName: {
                type: 'string',
                description: 'Name for the menu container',
              },
              buttons: {
                type: 'array',
                description: 'Array of button definitions',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Button name',
                    },
                    text: {
                      type: 'string',
                      description: 'Button text',
                    },
                  },
                  required: ['name', 'text'],
                },
              },
              layout: {
                type: 'string',
                description: 'Layout type: vertical or horizontal',
                enum: ['vertical', 'horizontal'],
                default: 'vertical',
              },
            },
            required: ['projectPath', 'scenePath', 'menuName', 'buttons'],
          },
        },
        {
          name: 'import_asset',
          description: 'Import an asset into the Godot project with custom import settings',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              assetPath: {
                type: 'string',
                description: 'Path to the asset file to import (relative to project)',
              },
              importSettings: {
                type: 'object',
                description: 'Optional import settings for the asset',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['texture', 'audio', 'model', 'font'],
                    description: 'Type of asset being imported',
                  },
                  compression: {
                    type: 'string',
                    description: 'Compression mode for the asset',
                  },
                  mipmaps: {
                    type: 'boolean',
                    description: 'Generate mipmaps for textures',
                  },
                  filter: {
                    type: 'boolean',
                    description: 'Enable filtering for textures',
                  },
                },
              },
            },
            required: ['projectPath', 'assetPath'],
          },
        },
        {
          name: 'create_resource',
          description: 'Create a new resource (Material, Shader, etc.) in the Godot project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              resourcePath: {
                type: 'string',
                description: 'Path where the resource will be saved (relative to project)',
              },
              resourceType: {
                type: 'string',
                enum: ['StandardMaterial3D', 'ShaderMaterial', 'Shader', 'Theme', 'Environment', 'PhysicsMaterial'],
                description: 'Type of resource to create',
              },
              properties: {
                type: 'object',
                description: 'Optional properties to set on the resource',
              },
            },
            required: ['projectPath', 'resourcePath', 'resourceType'],
          },
        },
        {
          name: 'list_assets',
          description: 'List all assets in the Godot project with their metadata and UIDs',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              directory: {
                type: 'string',
                description: 'Optional: Specific directory to list (relative to project, defaults to entire project)',
              },
              fileTypes: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Optional: Filter by file types (e.g., ["tscn", "tres", "gd"])',
              },
              recursive: {
                type: 'boolean',
                description: 'Whether to search recursively (default: true)',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'configure_import',
          description: 'Configure or modify import settings for an asset',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              assetPath: {
                type: 'string',
                description: 'Path to the asset file (relative to project)',
              },
              importSettings: {
                type: 'object',
                description: 'Import settings to apply',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['texture', 'audio', 'model', 'font'],
                    description: 'Type of asset',
                  },
                  compression: {
                    type: 'string',
                    description: 'Compression mode',
                  },
                  mipmaps: {
                    type: 'boolean',
                    description: 'Generate mipmaps for textures',
                  },
                  filter: {
                    type: 'boolean',
                    description: 'Enable filtering for textures',
                  },
                  loop: {
                    type: 'boolean',
                    description: 'Enable looping for audio',
                  },
                },
              },
            },
            required: ['projectPath', 'assetPath', 'importSettings'],
          },
        },
        {
          name: 'create_script',
          description: 'Create a new GDScript file with template',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path where the script file will be saved (relative to project)',
              },
              template: {
                type: 'string',
                description: 'Template type: node, resource, or custom',
                enum: ['node', 'resource', 'custom'],
                default: 'node',
              },
              baseClass: {
                type: 'string',
                description: 'Base class for the script (e.g., Node2D, CharacterBody2D, Resource)',
              },
              signals: {
                type: 'array',
                description: 'Array of signal names to add to the script',
                items: {
                  type: 'string',
                },
              },
              exports: {
                type: 'array',
                description: 'Array of exported variables',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    defaultValue: { type: 'string' },
                  },
                },
              },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'attach_script',
          description: 'Attach a GDScript to a node in a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the node (e.g., "root/Player")',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the script file (relative to project)',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'scriptPath'],
          },
        },
        {
          name: 'validate_script',
          description: 'Validate a GDScript file for syntax and semantic errors',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the script file (relative to project)',
              },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'get_node_methods',
          description: 'Get available methods for a specific node type',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              nodeType: {
                type: 'string',
                description: 'Type of node (e.g., Node2D, CharacterBody2D, Sprite2D)',
              },
            },
            required: ['projectPath', 'nodeType'],
          },
        },
        {
          name: 'create_signal',
          description: 'Create a custom signal in a GDScript file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scriptPath: {
                type: 'string',
                description: 'Path to the script file (relative to project)',
              },
              signalName: {
                type: 'string',
                description: 'Name of the signal to create',
              },
              parameters: {
                type: 'array',
                description: 'Optional signal parameters with types',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Parameter name',
                    },
                    type: {
                      type: 'string',
                      description: 'Parameter type (e.g., int, String, Node)',
                    },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['projectPath', 'scriptPath', 'signalName'],
          },
        },
        {
          name: 'connect_signal',
          description: 'Connect a signal from one node to a method on another node using Godot 4.5+ Callable API',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              sourceNodePath: {
                type: 'string',
                description: 'Path to the node emitting the signal (e.g., "root/Button")',
              },
              signalName: {
                type: 'string',
                description: 'Name of the signal to connect',
              },
              targetNodePath: {
                type: 'string',
                description: 'Path to the node receiving the signal (e.g., "root/Player")',
              },
              methodName: {
                type: 'string',
                description: 'Name of the method to call when signal is emitted',
              },
              binds: {
                type: 'array',
                description: 'Optional additional parameters to bind to the callable',
                items: {
                  type: 'string',
                },
              },
              flags: {
                type: 'number',
                description: 'Optional connection flags (default: 0)',
              },
            },
            required: ['projectPath', 'scenePath', 'sourceNodePath', 'signalName', 'targetNodePath', 'methodName'],
          },
        },
        {
          name: 'list_signals',
          description: 'List all signals available on a node, including built-in and custom signals',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the node (e.g., "root/Button")',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'disconnect_signal',
          description: 'Disconnect a signal connection between two nodes',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              sourceNodePath: {
                type: 'string',
                description: 'Path to the node emitting the signal (e.g., "root/Button")',
              },
              signalName: {
                type: 'string',
                description: 'Name of the signal to disconnect',
              },
              targetNodePath: {
                type: 'string',
                description: 'Path to the node receiving the signal (e.g., "root/Player")',
              },
              methodName: {
                type: 'string',
                description: 'Name of the method that was connected',
              },
            },
            required: ['projectPath', 'scenePath', 'sourceNodePath', 'signalName', 'targetNodePath', 'methodName'],
          },
        },
        {
          name: 'remove_node',
          description: 'Remove a node from an existing scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the node to remove (e.g., "root/Player" or "root/Player/Sprite")',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'modify_node',
          description: 'Modify properties of an existing node in a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the node to modify (e.g., "root/Player" or "root/Player/Sprite")',
              },
              properties: {
                type: 'object',
                description: 'Properties to set on the node (e.g., {"position": {"x": 100, "y": 200}, "visible": true})',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'properties'],
          },
        },
        {
          name: 'duplicate_node',
          description: 'Duplicate an existing node in a scene with all its children',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the node to duplicate (e.g., "root/Player" or "root/Enemy")',
              },
              newName: {
                type: 'string',
                description: 'Name for the duplicated node',
              },
              parentNodePath: {
                type: 'string',
                description: 'Optional: Path to the parent node for the duplicate (defaults to same parent as original)',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'newName'],
          },
        },
        {
          name: 'query_node',
          description: 'Get detailed information about a node in a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the node to query (e.g., "root/Player" or "root/Enemy/Sprite")',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'load_sprite',
          description: 'Load a sprite into a Sprite2D node',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the Sprite2D node (e.g., "root/Player/Sprite2D")',
              },
              texturePath: {
                type: 'string',
                description: 'Path to the texture file (relative to project)',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'texturePath'],
          },
        },
        {
          name: 'export_mesh_library',
          description: 'Export a scene as a MeshLibrary resource',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (.tscn) to export',
              },
              outputPath: {
                type: 'string',
                description: 'Path where the mesh library (.res) will be saved',
              },
              meshItemNames: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Optional: Names of specific mesh items to include (defaults to all)',
              },
            },
            required: ['projectPath', 'scenePath', 'outputPath'],
          },
        },
        {
          name: 'save_scene',
          description: 'Save changes to a scene file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              newPath: {
                type: 'string',
                description: 'Optional: New path to save the scene to (for creating variants)',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'get_uid',
          description: 'Get the UID for a specific file in a Godot project (for Godot 4.4+)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              filePath: {
                type: 'string',
                description: 'Path to the file (relative to project) for which to get the UID',
              },
            },
            required: ['projectPath', 'filePath'],
          },
        },
        {
          name: 'update_project_uids',
          description: 'Update UID references in a Godot project by resaving resources (for Godot 4.4+)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'add_physics_body',
          description: 'Add a physics body (CharacterBody2D/3D, RigidBody2D/3D, StaticBody2D/3D, AnimatableBody2D/3D) to a scene with collision shape (Godot 4.5+)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node (e.g., "root" or "root/Player")',
                default: 'root',
              },
              bodyType: {
                type: 'string',
                description: 'Type of physics body',
                enum: ['CharacterBody2D', 'RigidBody2D', 'StaticBody2D', 'AnimatableBody2D', 'CharacterBody3D', 'RigidBody3D', 'StaticBody3D', 'AnimatableBody3D'],
              },
              nodeName: {
                type: 'string',
                description: 'Name for the physics body node',
              },
              collisionShape: {
                type: 'object',
                description: 'Collision shape configuration',
                properties: {
                  type: {
                    type: 'string',
                    description: 'Type of collision shape',
                    enum: ['RectangleShape2D', 'CircleShape2D', 'CapsuleShape2D', 'ConvexPolygonShape2D', 'BoxShape3D', 'SphereShape3D', 'CapsuleShape3D', 'CylinderShape3D', 'ConvexPolygonShape3D'],
                  },
                  size: {
                    type: 'object',
                    description: 'Size for rectangle/box shapes (Vector2 or Vector3)',
                  },
                  radius: {
                    type: 'number',
                    description: 'Radius for circle/sphere/capsule shapes',
                  },
                  height: {
                    type: 'number',
                    description: 'Height for capsule/cylinder shapes',
                  },
                },
                required: ['type'],
              },
              physicsProperties: {
                type: 'object',
                description: 'Physics properties (optional)',
                properties: {
                  mass: {
                    type: 'number',
                    description: 'Mass for RigidBody (default: 1.0)',
                  },
                  physicsMaterial: {
                    type: 'object',
                    description: 'Physics material properties',
                    properties: {
                      friction: {
                        type: 'number',
                        description: 'Friction coefficient (default: 1.0)',
                      },
                      bounce: {
                        type: 'number',
                        description: 'Bounce/restitution coefficient (default: 0.0)',
                      },
                      absorbent: {
                        type: 'boolean',
                        description: 'Whether the material is absorbent (Godot 4.5+, default: false)',
                      },
                    },
                  },
                  gravityScale: {
                    type: 'number',
                    description: 'Gravity scale multiplier (default: 1.0)',
                  },
                  linearDamp: {
                    type: 'number',
                    description: 'Linear damping (default: 0.0)',
                  },
                  angularDamp: {
                    type: 'number',
                    description: 'Angular damping (default: 0.0)',
                  },
                  motionMode: {
                    type: 'string',
                    description: 'Motion mode for CharacterBody',
                    enum: ['MOTION_MODE_GROUNDED', 'MOTION_MODE_FLOATING'],
                  },
                  platformOnLeave: {
                    type: 'string',
                    description: 'Platform behavior when leaving for CharacterBody',
                    enum: ['PLATFORM_ON_LEAVE_ADD_VELOCITY', 'PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY', 'PLATFORM_ON_LEAVE_DO_NOTHING'],
                  },
                },
              },
            },
            required: ['projectPath', 'scenePath', 'bodyType', 'nodeName', 'collisionShape'],
          },
        },
        {
          name: 'configure_physics',
          description: 'Configure physics properties of an existing physics body',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the physics body node (e.g., "root/Player")',
              },
              properties: {
                type: 'object',
                description: 'Physics properties to configure',
                properties: {
                  mass: {
                    type: 'number',
                    description: 'Mass for RigidBody',
                  },
                  physicsMaterial: {
                    type: 'object',
                    description: 'Physics material properties',
                    properties: {
                      friction: {
                        type: 'number',
                        description: 'Friction coefficient',
                      },
                      bounce: {
                        type: 'number',
                        description: 'Bounce/restitution coefficient',
                      },
                      absorbent: {
                        type: 'boolean',
                        description: 'Whether the material is absorbent (Godot 4.5+)',
                      },
                    },
                  },
                  gravityScale: {
                    type: 'number',
                    description: 'Gravity scale multiplier',
                  },
                  linearDamp: {
                    type: 'number',
                    description: 'Linear damping',
                  },
                  angularDamp: {
                    type: 'number',
                    description: 'Angular damping',
                  },
                  motionMode: {
                    type: 'string',
                    description: 'Motion mode for CharacterBody',
                    enum: ['MOTION_MODE_GROUNDED', 'MOTION_MODE_FLOATING'],
                  },
                  platformOnLeave: {
                    type: 'string',
                    description: 'Platform behavior when leaving for CharacterBody',
                    enum: ['PLATFORM_ON_LEAVE_ADD_VELOCITY', 'PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY', 'PLATFORM_ON_LEAVE_DO_NOTHING'],
                  },
                },
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'properties'],
          },
        },
        {
          name: 'setup_collision_layers',
          description: 'Configure collision layers and masks for a physics body',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the physics body node (e.g., "root/Player")',
              },
              collisionLayer: {
                type: 'number',
                description: 'Collision layer bitmask (which layers this body is on)',
              },
              collisionMask: {
                type: 'number',
                description: 'Collision mask bitmask (which layers this body can collide with)',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'create_area',
          description: 'Create an Area2D or Area3D node with collision shape for detecting overlaps',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node (e.g., "root" or "root/Player")',
                default: 'root',
              },
              areaType: {
                type: 'string',
                description: 'Type of area node',
                enum: ['Area2D', 'Area3D'],
              },
              nodeName: {
                type: 'string',
                description: 'Name for the area node',
              },
              collisionShape: {
                type: 'object',
                description: 'Collision shape configuration',
                properties: {
                  type: {
                    type: 'string',
                    description: 'Type of collision shape',
                    enum: ['RectangleShape2D', 'CircleShape2D', 'CapsuleShape2D', 'BoxShape3D', 'SphereShape3D', 'CapsuleShape3D'],
                  },
                  size: {
                    type: 'object',
                    description: 'Size for rectangle/box shapes (Vector2 or Vector3)',
                  },
                  radius: {
                    type: 'number',
                    description: 'Radius for circle/sphere/capsule shapes',
                  },
                  height: {
                    type: 'number',
                    description: 'Height for capsule shapes',
                  },
                },
                required: ['type'],
              },
              monitorable: {
                type: 'boolean',
                description: 'Whether other areas can detect this area (default: true)',
              },
              monitoring: {
                type: 'boolean',
                description: 'Whether this area can detect other bodies/areas (default: true)',
              },
            },
            required: ['projectPath', 'scenePath', 'areaType', 'nodeName', 'collisionShape'],
          },
        },
        {
          name: 'get_class_info',
          description: 'Get detailed information about a Godot class from the official documentation (Godot 4.5+)',
          inputSchema: {
            type: 'object',
            properties: {
              className: {
                type: 'string',
                description: 'Name of the Godot class (e.g., Node2D, CharacterBody2D, AnimationPlayer)',
              },
            },
            required: ['className'],
          },
        },
        {
          name: 'get_method_info',
          description: 'Get detailed information about a specific method of a Godot class',
          inputSchema: {
            type: 'object',
            properties: {
              className: {
                type: 'string',
                description: 'Name of the Godot class',
              },
              methodName: {
                type: 'string',
                description: 'Name of the method',
              },
            },
            required: ['className', 'methodName'],
          },
        },
        {
          name: 'search_docs',
          description: 'Search Godot documentation for classes, methods, properties, and signals',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "move_and_slide", "CharacterBody", "physics")',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_best_practices',
          description: 'Get best practices and recommendations for a specific Godot topic',
          inputSchema: {
            type: 'object',
            properties: {
              topic: {
                type: 'string',
                description: 'Topic to get best practices for (e.g., "physics", "signals", "gdscript", "scene organization")',
              },
            },
            required: ['topic'],
          },
        },
        {
          name: 'run_with_debug',
          description: 'Run the Godot project in debug mode and capture all console output, errors, and warnings',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scene: {
                type: 'string',
                description: 'Optional: Specific scene to run',
              },
              breakpoints: {
                type: 'array',
                description: 'Optional: Array of breakpoints to set',
                items: {
                  type: 'object',
                  properties: {
                    script: {
                      type: 'string',
                      description: 'Path to the script file',
                    },
                    line: {
                      type: 'number',
                      description: 'Line number for the breakpoint',
                    },
                  },
                  required: ['script', 'line'],
                },
              },
              captureOutput: {
                type: 'boolean',
                description: 'Whether to capture console output (default: true)',
                default: true,
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'get_error_context',
          description: 'Get detailed context for an error including stack trace and suggested solutions from documentation',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              errorMessage: {
                type: 'string',
                description: 'The error message to analyze',
              },
              script: {
                type: 'string',
                description: 'Optional: Path to the script where the error occurred',
              },
              line: {
                type: 'number',
                description: 'Optional: Line number where the error occurred',
              },
            },
            required: ['projectPath', 'errorMessage'],
          },
        },
        {
          name: 'capture_screenshot',
          description: 'Capture a screenshot from a running Godot scene using Viewport.get_texture(). Note: Without scenePath, captures empty viewport (gray screen).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              outputPath: {
                type: 'string',
                description: 'Path where the screenshot will be saved (relative to project or absolute)',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene to capture (relative to project). Recommended to avoid empty screenshots.',
              },
              delay: {
                type: 'number',
                description: 'Optional: Delay in seconds before capturing the screenshot (default: 0)',
              },
              size: {
                type: 'object',
                description: 'Optional: Custom viewport size for the screenshot',
                properties: {
                  width: {
                    type: 'number',
                    description: 'Width in pixels',
                  },
                  height: {
                    type: 'number',
                    description: 'Height in pixels',
                  },
                },
                required: ['width', 'height'],
              },
            },
            required: ['projectPath', 'outputPath'],
          },
        },
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
        },
        {
          name: 'update_project_settings',
          description: 'Update project settings in project.godot file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              settings: {
                type: 'object',
                description: 'Settings to update (e.g., {"application/config/name": "My Game", "display/window/size/width": 1920})',
              },
            },
            required: ['projectPath', 'settings'],
          },
        },
        {
          name: 'configure_input_map',
          description: 'Configure input action mappings in the project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              actions: {
                type: 'array',
                description: 'Array of input actions to configure',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Action name (e.g., "move_left", "jump")',
                    },
                    deadzone: {
                      type: 'number',
                      description: 'Deadzone for the action (default: 0.5)',
                    },
                    events: {
                      type: 'array',
                      description: 'Array of input events for this action',
                      items: {
                        type: 'object',
                        properties: {
                          type: {
                            type: 'string',
                            description: 'Event type',
                            enum: ['key', 'mouse_button', 'joypad_button', 'joypad_motion'],
                          },
                          keycode: {
                            type: 'string',
                            description: 'Key code for keyboard events (e.g., "KEY_A", "KEY_SPACE")',
                          },
                          button: {
                            type: 'number',
                            description: 'Button index for mouse/joypad button events',
                          },
                          axis: {
                            type: 'number',
                            description: 'Axis index for joypad motion events',
                          },
                          axisValue: {
                            type: 'number',
                            description: 'Axis value for joypad motion events (-1.0 or 1.0)',
                          },
                        },
                        required: ['type'],
                      },
                    },
                  },
                  required: ['name', 'events'],
                },
              },
            },
            required: ['projectPath', 'actions'],
          },
        },
        {
          name: 'setup_autoload',
          description: 'Register autoload (singleton) scripts in the project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              autoloads: {
                type: 'array',
                description: 'Array of autoload configurations',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Autoload name (will be accessible globally)',
                    },
                    path: {
                      type: 'string',
                      description: 'Path to the script or scene (relative to project, e.g., "res://scripts/GameManager.gd")',
                    },
                    enabled: {
                      type: 'boolean',
                      description: 'Whether the autoload is enabled (default: true)',
                    },
                  },
                  required: ['name', 'path'],
                },
              },
            },
            required: ['projectPath', 'autoloads'],
          },
        },
        {
          name: 'manage_plugins',
          description: 'Manage editor plugins (enable, disable, or list)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              action: {
                type: 'string',
                description: 'Action to perform',
                enum: ['list', 'enable', 'disable'],
              },
              pluginName: {
                type: 'string',
                description: 'Plugin name (required for enable/disable actions)',
              },
            },
            required: ['projectPath', 'action'],
          },
        },
        {
          name: 'run_scene',
          description: 'Run a specific scene in debug mode through Godot CLI with -d flag, capturing console output and errors',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file to run (relative to project, e.g., "scenes/main.tscn")',
              },
              debug: {
                type: 'boolean',
                description: 'Whether to run in debug mode with -d flag (default: true)',
                default: true,
              },
              additionalArgs: {
                type: 'array',
                description: 'Additional CLI arguments to pass to Godot',
                items: {
                  type: 'string',
                },
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'remote_tree_dump',
          description: 'Dump the remote scene tree during runtime with recursive traversal, supporting filtering by type, name, script presence, and depth. Optionally includes node properties and signal connections.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Optional: Path to the scene to run before dumping (relative to project)',
              },
              filter: {
                type: 'object',
                description: 'Optional: Filters to apply to the tree dump',
                properties: {
                  nodeType: {
                    type: 'string',
                    description: 'Filter by node type (e.g., "CharacterBody2D", "Sprite2D")',
                  },
                  nodeName: {
                    type: 'string',
                    description: 'Filter by node name (supports regex patterns)',
                  },
                  hasScript: {
                    type: 'boolean',
                    description: 'Only include nodes that have scripts attached',
                  },
                  depth: {
                    type: 'number',
                    description: 'Maximum depth of tree traversal (-1 for unlimited)',
                  },
                },
              },
              includeProperties: {
                type: 'boolean',
                description: 'Include node properties in the dump (default: false)',
                default: false,
              },
              includeSignals: {
                type: 'boolean',
                description: 'Include connected signals in the dump (default: false)',
                default: false,
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'toggle_debug_draw',
          description: 'Toggle Viewport debug draw mode for visual diagnostics. Supports all Godot 4.5+ debug draw modes including wireframe, overdraw, lighting, normal buffer, and various GI/shadow visualization modes.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              mode: {
                type: 'string',
                description: 'Debug draw mode to enable',
                enum: [
                  'disabled',
                  'unshaded',
                  'lighting',
                  'overdraw',
                  'wireframe',
                  'normal_buffer',
                  'voxel_gi_albedo',
                  'voxel_gi_lighting',
                  'voxel_gi_emission',
                  'shadow_atlas',
                  'directional_shadow_atlas',
                  'scene_luminance',
                  'ssao',
                  'ssil',
                  'pssm_splits',
                  'decal_atlas',
                  'sdfgi',
                  'sdfgi_probes',
                  'gi_buffer',
                  'disable_lod',
                  'cluster_omni_lights',
                  'cluster_spot_lights',
                  'cluster_decals',
                  'cluster_reflection_probes',
                  'occluders',
                  'motion_vectors',
                  'internal_buffer',
                ],
              },
              viewport: {
                type: 'string',
                description: 'Optional: Path to specific Viewport node (default: "/root")',
              },
            },
            required: ['projectPath', 'mode'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logDebug(`Handling tool request: ${request.params.name}`);
      switch (request.params.name) {
        case 'launch_editor':
          return await this.handleLaunchEditor(request.params.arguments);
        case 'run_project':
          return await this.handleRunProject(request.params.arguments);
        case 'get_debug_output':
          return await this.handleGetDebugOutput();
        case 'stop_project':
          return await this.handleStopProject();
        case 'get_godot_version':
          return await this.handleGetGodotVersion();
        case 'list_projects':
          return await this.handleListProjects(request.params.arguments);
        case 'get_project_info':
          return await this.handleGetProjectInfo(request.params.arguments);
        case 'create_scene':
          return await this.handleCreateScene(request.params.arguments);
        case 'add_node':
          return await this.handleAddNode(request.params.arguments);
        case 'create_script':
          return await this.handleCreateScript(request.params.arguments);
        case 'attach_script':
          return await this.handleAttachScript(request.params.arguments);
        case 'validate_script':
          return await this.handleValidateScript(request.params.arguments);
        case 'get_node_methods':
          return await this.handleGetNodeMethods(request.params.arguments);
        case 'create_signal':
          return await this.handleCreateSignal(request.params.arguments);
        case 'connect_signal':
          return await this.handleConnectSignal(request.params.arguments);
        case 'list_signals':
          return await this.handleListSignals(request.params.arguments);
        case 'disconnect_signal':
          return await this.handleDisconnectSignal(request.params.arguments);
        case 'remove_node':
          return await this.handleRemoveNode(request.params.arguments);
        case 'modify_node':
          return await this.handleModifyNode(request.params.arguments);
        case 'duplicate_node':
          return await this.handleDuplicateNode(request.params.arguments);
        case 'query_node':
          return await this.handleQueryNode(request.params.arguments);
        case 'load_sprite':
          return await this.handleLoadSprite(request.params.arguments);
        case 'export_mesh_library':
          return await this.handleExportMeshLibrary(request.params.arguments);
        case 'save_scene':
          return await this.handleSaveScene(request.params.arguments);
        case 'get_uid':
          return await this.handleGetUid(request.params.arguments);
        case 'update_project_uids':
          return await this.handleUpdateProjectUids(request.params.arguments);
        case 'import_asset':
          return await this.handleImportAsset(request.params.arguments);
        case 'create_resource':
          return await this.handleCreateResource(request.params.arguments);
        case 'list_assets':
          return await this.handleListAssets(request.params.arguments);
        case 'configure_import':
          return await this.handleConfigureImport(request.params.arguments);
        case 'add_physics_body':
          return await this.handleAddPhysicsBody(request.params.arguments);
        case 'configure_physics':
          return await this.handleConfigurePhysics(request.params.arguments);
        case 'setup_collision_layers':
          return await this.handleSetupCollisionLayers(request.params.arguments);
        case 'create_area':
          return await this.handleCreateArea(request.params.arguments);
        case 'create_animation_player':
          return await this.handleCreateAnimationPlayer(request.params.arguments);
        case 'add_keyframes':
          return await this.handleAddKeyframes(request.params.arguments);
        case 'setup_animation_tree':
          return await this.handleSetupAnimationTree(request.params.arguments);
        case 'add_particles':
          return await this.handleAddParticles(request.params.arguments);
        case 'get_class_info':
          return await this.handleGetClassInfo(request.params.arguments);
        case 'get_method_info':
          return await this.handleGetMethodInfo(request.params.arguments);
        case 'search_docs':
          return await this.handleSearchDocs(request.params.arguments);
        case 'get_best_practices':
          return await this.handleGetBestPractices(request.params.arguments);
        case 'run_with_debug':
          return await this.handleRunWithDebug(request.params.arguments);
        case 'get_error_context':
          return await this.handleGetErrorContext(request.params.arguments);
        case 'capture_screenshot':
          return await this.handleCaptureScreenshot(request.params.arguments);
        case 'list_missing_assets':
          return await this.handleListMissingAssets(request.params.arguments);
        case 'update_project_settings':
          return await this.handleUpdateProjectSettings(request.params.arguments);
        case 'configure_input_map':
          return await this.handleConfigureInputMap(request.params.arguments);
        case 'setup_autoload':
          return await this.handleSetupAutoload(request.params.arguments);
        case 'manage_plugins':
          return await this.handleManagePlugins(request.params.arguments);
        case 'run_scene':
          return await this.handleRunScene(request.params.arguments);
        case 'remote_tree_dump':
          return await this.handleRemoteTreeDump(request.params.arguments);
        case 'toggle_debug_draw':
          return await this.handleToggleDebugDraw(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  /**
   * Handle the launch_editor tool
   * @param args Tool arguments
   */
  private async handleLaunchEditor(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Launching Godot editor for project: ${args.projectPath}`);
      const process = spawn(this.godotPath, ['-e', '--path', args.projectPath], {
        stdio: 'pipe',
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot editor:', err);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Godot editor launched successfully for project at ${args.projectPath}.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to launch Godot editor: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the run_project tool
   * @param args Tool arguments
   */
  private async handleRunProject(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Kill any existing process
      if (this.activeProcess) {
        this.logDebug('Killing existing Godot process before starting a new one');
        this.activeProcess.process.kill();
      }

      const cmdArgs = ['-d', '--path', args.projectPath];
      if (args.scene && this.validatePath(args.scene)) {
        this.logDebug(`Adding scene parameter: ${args.scene}`);
        cmdArgs.push(args.scene);
      }

      this.logDebug(`Running Godot project: ${args.projectPath}`);
      const process = spawn(this.godotPath!, cmdArgs, { stdio: 'pipe' });
      const output: string[] = [];
      const errors: string[] = [];

      process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        output.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stdout] ${line}`);
        });
      });

      process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        errors.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stderr] ${line}`);
        });
      });

      process.on('exit', (code: number | null) => {
        this.logDebug(`Godot process exited with code ${code}`);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot process:', err);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      this.activeProcess = { process, output, errors };

      return {
        content: [
          {
            type: 'text',
            text: `Godot project started in debug mode. Use get_debug_output to see output.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to run Godot project: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_debug_output tool
   */
  private async handleGetDebugOutput() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process.',
        [
          'Use run_project to start a Godot project first',
          'Check if the Godot process crashed unexpectedly',
        ]
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              output: this.activeProcess.output,
              errors: this.activeProcess.errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle the stop_project tool
   */
  private async handleStopProject() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process to stop.',
        [
          'Use run_project to start a Godot project first',
          'The process may have already terminated',
        ]
      );
    }

    this.logDebug('Stopping active Godot process');
    this.activeProcess.process.kill();
    const output = this.activeProcess.output;
    const errors = this.activeProcess.errors;
    this.activeProcess = null;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Godot project stopped',
              finalOutput: output,
              finalErrors: errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle the get_godot_version tool
   */
  private async handleGetGodotVersion() {
    try {
      this.logDebug('Getting Godot version with validation');

      const version = await this.validateGodotVersion();
      const features = VersionValidator.getSupportedFeatures(version);

      // Build detailed version information
      const versionInfo = [
        `Godot Version: ${VersionValidator.formatVersion(version)}`,
        ``,
        `Compatibility: ✓ Compatible with Godot MCP Server`,
        `Minimum Required: ${VersionValidator.formatVersion(VersionValidator.getMinimumVersion())}`,
        ``,
        `Supported Features:`,
        `  - UID System: ${features.uidSystem ? '✓' : '✗'}`,
        `  - Compositor Effects: ${features.compositorEffects ? '✓' : '✗'}`,
        `  - Enhanced Physics: ${features.enhancedPhysics ? '✓' : '✗'}`,
        `  - Improved GDScript: ${features.improvedGDScript ? '✓' : '✗'}`,
        `  - Modern Node Types: ${features.modernNodeTypes ? '✓' : '✗'}`,
      ].join('\n');

      return {
        content: [
          {
            type: 'text',
            text: versionInfo,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to get Godot version: ${errorMessage}`,
        [
          'Ensure Godot 4.5.0 or later is installed',
          'Set GODOT_PATH environment variable to specify the correct path',
          'Upgrade your Godot installation if using an older version',
        ]
      );
    }
  }

  /**
   * Handle the list_projects tool
   */
  private async handleListProjects(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.directory) {
      return this.createErrorResponse(
        'Directory is required',
        ['Provide a valid directory path to search for Godot projects']
      );
    }

    if (!this.validatePath(args.directory)) {
      return this.createErrorResponse(
        'Invalid directory path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      this.logDebug(`Listing Godot projects in directory: ${args.directory}`);
      if (!existsSync(args.directory)) {
        return this.createErrorResponse(
          `Directory does not exist: ${args.directory}`,
          ['Provide a valid directory path that exists on the system']
        );
      }

      const recursive = args.recursive === true;
      const projects = this.findGodotProjects(args.directory, recursive);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list projects: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the directory exists and is accessible',
          'Check if you have permission to read the directory',
        ]
      );
    }
  }

  /**
   * Get the structure of a Godot project asynchronously by counting files recursively
   * @param projectPath Path to the Godot project
   * @returns Promise resolving to an object with counts of scenes, scripts, assets, and other files
   */
  private getProjectStructureAsync(projectPath: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        const structure = {
          scenes: 0,
          scripts: 0,
          assets: 0,
          other: 0,
        };

        const scanDirectory = (currentPath: string) => {
          const entries = readdirSync(currentPath, { withFileTypes: true });

          for (const entry of entries) {
            const entryPath = join(currentPath, entry.name);

            // Skip hidden files and directories
            if (entry.name.startsWith('.')) {
              continue;
            }

            if (entry.isDirectory()) {
              // Recursively scan subdirectories
              scanDirectory(entryPath);
            } else if (entry.isFile()) {
              // Count file by extension
              const ext = entry.name.split('.').pop()?.toLowerCase();

              if (ext === 'tscn') {
                structure.scenes++;
              } else if (ext === 'gd' || ext === 'gdscript' || ext === 'cs') {
                structure.scripts++;
              } else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'ttf', 'wav', 'mp3', 'ogg'].includes(ext || '')) {
                structure.assets++;
              } else {
                structure.other++;
              }
            }
          }
        };

        // Start scanning from the project root
        scanDirectory(projectPath);
        resolve(structure);
      } catch (error) {
        this.logDebug(`Error getting project structure asynchronously: ${error}`);
        resolve({
          error: 'Failed to get project structure',
          scenes: 0,
          scripts: 0,
          assets: 0,
          other: 0
        });
      }
    });
  }

  /**
   * Handle the get_project_info tool
   */
  private async handleGetProjectInfo(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Getting project info for: ${args.projectPath}`);

      // Get Godot version
      const execOptions = { timeout: 10000 }; // 10 second timeout
      const { stdout } = await execAsync(`"${this.godotPath}" --version`, execOptions);

      // Get project structure using the recursive method
      const projectStructure = await this.getProjectStructureAsync(args.projectPath);

      // Extract project name from project.godot file
      let projectName = basename(args.projectPath);
      try {
        const fs = require('fs');
        const projectFileContent = fs.readFileSync(projectFile, 'utf8');
        const configNameMatch = projectFileContent.match(/config\/name="([^"]+)"/);
        if (configNameMatch && configNameMatch[1]) {
          projectName = configNameMatch[1];
          this.logDebug(`Found project name in config: ${projectName}`);
        }
      } catch (error) {
        this.logDebug(`Error reading project file: ${error}`);
        // Continue with default project name if extraction fails
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: projectName,
                path: args.projectPath,
                godotVersion: stdout.trim(),
                structure: projectStructure,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get project info: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_scene tool
   */
  private async handleCreateScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Project path and scene path are required',
        ['Provide valid paths for both the project and the scene']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        rootNodeType: args.rootNodeType || 'Node2D',
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to create scene: ${stderr}`,
          [
            'Check if the root node type is valid',
            'Ensure you have write permissions to the scene path',
            'Verify the scene path is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Scene created successfully at: ${args.scenePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the add_node tool
   */
  private async handleAddNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodeType || !args.nodeName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodeType, and nodeName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        nodeType: args.nodeType,
        nodeName: args.nodeName,
      };

      // Add optional parameters
      if (args.parentNodePath) {
        params.parentNodePath = args.parentNodePath;
      }

      if (args.properties) {
        params.properties = args.properties;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('add_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to add node: ${stderr}`,
          [
            'Check if the node type is valid',
            'Ensure the parent node path exists',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node '${args.nodeName}' of type '${args.nodeType}' added successfully to '${args.scenePath}'.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add node: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the remove_node tool
   */
  private async handleRemoveNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and nodePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('remove_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to remove node: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node exists in the scene',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node '${args.nodePath}' removed successfully from '${args.scenePath}'.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to remove node: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the modify_node tool
   */
  private async handleModifyNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.properties) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and properties']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        properties: args.properties,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('modify_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to modify node: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node exists in the scene',
            'Verify the properties are valid for the node type',
            'Check property names and value types',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node '${args.nodePath}' modified successfully in '${args.scenePath}'.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to modify node: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the duplicate_node tool
   */
  private async handleDuplicateNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.newName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and newName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        newName: args.newName,
      };

      // Add optional parent node path
      if (args.parentNodePath) {
        params.parentNodePath = args.parentNodePath;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('duplicate_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to duplicate node: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node exists in the scene',
            'Verify the new name is valid',
            'Check if parent node path exists (if specified)',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node '${args.nodePath}' duplicated successfully as '${args.newName}' in '${args.scenePath}'.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to duplicate node: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the query_node tool
   */
  private async handleQueryNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and nodePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('query_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to query node: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node exists in the scene',
            'Verify the scene file is valid',
          ]
        );
      }

      // Parse the JSON output from the GDScript
      try {
        const nodeInfo = JSON.parse(stdout);
        return {
          content: [
            {
              type: 'text',
              text: `Node Information:\n\n${JSON.stringify(nodeInfo, null, 2)}`,
            },
          ],
        };
      } catch (parseError) {
        // If JSON parsing fails, return the raw output
        return {
          content: [
            {
              type: 'text',
              text: `Node information retrieved:\n\n${stdout}`,
            },
          ],
        };
      }
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to query node: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the load_sprite tool
   */
  private async handleLoadSprite(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.texturePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and texturePath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.nodePath) ||
      !this.validatePath(args.texturePath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Check if the texture file exists
      const texturePath = join(args.projectPath, args.texturePath);
      if (!existsSync(texturePath)) {
        return this.createErrorResponse(
          `Texture file does not exist: ${args.texturePath}`,
          [
            'Ensure the texture path is correct',
            'Upload or create the texture file first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        texturePath: args.texturePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('load_sprite', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to load sprite: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node is a Sprite2D, Sprite3D, or TextureRect',
            'Verify the texture file is a valid image format',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Sprite loaded successfully with texture: ${args.texturePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to load sprite: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the export_mesh_library tool
   */
  private async handleExportMeshLibrary(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.outputPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and outputPath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.outputPath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        outputPath: args.outputPath,
      };

      // Add optional parameters
      if (args.meshItemNames && Array.isArray(args.meshItemNames)) {
        params.meshItemNames = args.meshItemNames;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('export_mesh_library', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to export mesh library: ${stderr}`,
          [
            'Check if the scene contains valid 3D meshes',
            'Ensure the output path is valid',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `MeshLibrary exported successfully to: ${args.outputPath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to export mesh library: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the save_scene tool
   */
  private async handleSaveScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scenePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    // If newPath is provided, validate it
    if (args.newPath && !this.validatePath(args.newPath)) {
      return this.createErrorResponse(
        'Invalid new path',
        ['Provide a valid new path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
      };

      // Add optional parameters
      if (args.newPath) {
        params.newPath = args.newPath;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('save_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to save scene: ${stderr}`,
          [
            'Check if the scene file is valid',
            'Ensure you have write permissions to the output path',
            'Verify the scene can be properly packed',
          ]
        );
      }

      const savePath = args.newPath || args.scenePath;
      return {
        content: [
          {
            type: 'text',
            text: `Scene saved successfully to: ${savePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to save scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_uid tool
   */
  private async handleGetUid(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.filePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and filePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.filePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the file exists
      const filePath = join(args.projectPath, args.filePath);
      if (!existsSync(filePath)) {
        return this.createErrorResponse(
          `File does not exist: ${args.filePath}`,
          ['Ensure the file path is correct']
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execAsync(`"${this.godotPath}" --version`);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
          `UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
          [
            'Upgrade to Godot 4.4 or later to use UIDs',
            'Use resource paths instead of UIDs for this version of Godot',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        filePath: args.filePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('get_uid', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to get UID: ${stderr}`,
          [
            'Check if the file is a valid Godot resource',
            'Ensure the file path is correct',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `UID for ${args.filePath}: ${stdout.trim()}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get UID: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the update_project_uids tool
   */
  private async handleUpdateProjectUids(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execAsync(`"${this.godotPath}" --version`);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
          `UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
          [
            'Upgrade to Godot 4.4 or later to use UIDs',
            'Use resource paths instead of UIDs for this version of Godot',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        projectPath: args.projectPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('resave_resources', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to update project UIDs: ${stderr}`,
          [
            'Check if the project is valid',
            'Ensure you have write permissions to the project directory',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Project UIDs updated successfully.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to update project UIDs: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_script tool
   */
  private async handleCreateScript(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scriptPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scriptPath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scriptPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scriptPath: args.scriptPath,
        template: args.template || 'node',
      };

      // Add optional parameters
      if (args.baseClass) {
        params.baseClass = args.baseClass;
      }

      if (args.signals && Array.isArray(args.signals)) {
        params.signals = args.signals;
      }

      if (args.exports && Array.isArray(args.exports)) {
        params.exports = args.exports;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_script', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to create script: ${stderr}`,
          [
            'Check if the script path is valid',
            'Ensure the directory exists',
            'Verify you have write permissions',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Script created successfully at: ${args.scriptPath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create script: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the attach_script tool
   */
  private async handleAttachScript(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.scriptPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and scriptPath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath) || !this.validatePath(args.scriptPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Check if the script file exists
      const scriptPath = join(args.projectPath, args.scriptPath);
      if (!existsSync(scriptPath)) {
        return this.createErrorResponse(
          `Script file does not exist: ${args.scriptPath}`,
          [
            'Ensure the script path is correct',
            'Use create_script to create a new script first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        scriptPath: args.scriptPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('attach_script', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to attach script: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node exists in the scene',
            'Verify the script file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Script '${args.scriptPath}' attached successfully to node '${args.nodePath}' in '${args.scenePath}'.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to attach script: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the validate_script tool
   */
  private async handleValidateScript(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scriptPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scriptPath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scriptPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the script file exists
      const scriptPath = join(args.projectPath, args.scriptPath);
      if (!existsSync(scriptPath)) {
        return this.createErrorResponse(
          `Script file does not exist: ${args.scriptPath}`,
          [
            'Ensure the script path is correct',
            'Use create_script to create a new script first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scriptPath: args.scriptPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('validate_script', params, args.projectPath);

      // Parse the validation result from stdout
      let validationResult;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          validationResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        // If parsing fails, return the raw output
        validationResult = { valid: false, errors: [{ message: 'Failed to parse validation result', line: 0 }] };
      }

      if (validationResult && validationResult.valid) {
        return {
          content: [
            {
              type: 'text',
              text: `Script '${args.scriptPath}' is valid.\n\nValidation result: ${JSON.stringify(validationResult, null, 2)}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Script '${args.scriptPath}' has errors:\n\n${JSON.stringify(validationResult, null, 2)}`,
            },
          ],
        };
      }
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to validate script: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_node_methods tool
   */
  private async handleGetNodeMethods(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.nodeType) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and nodeType']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        nodeType: args.nodeType,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('get_node_methods', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to get node methods: ${stderr}`,
          [
            'Check if the node type is valid',
            'Ensure the node type exists in Godot',
          ]
        );
      }

      // Parse the methods result from stdout
      let methodsResult;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          methodsResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        // If parsing fails, return the raw output
        methodsResult = { methods: [], error: 'Failed to parse methods result' };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Methods for node type '${args.nodeType}':\n\n${JSON.stringify(methodsResult, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get node methods: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_signal tool
   */
  private async handleCreateSignal(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scriptPath || !args.signalName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scriptPath, and signalName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scriptPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation
      const params = {
        scriptPath: args.scriptPath,
        signalName: args.signalName,
        parameters: args.parameters || [],
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_signal', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to create signal: ${stderr}`,
          [
            'Check if the script file exists',
            'Ensure the signal name is valid',
            'Verify the script is a valid GDScript file',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Signal '${args.signalName}' created successfully in ${args.scriptPath}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create signal: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the connect_signal tool
   */
  private async handleConnectSignal(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.sourceNodePath ||
      !args.signalName || !args.targetNodePath || !args.methodName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, sourceNodePath, signalName, targetNodePath, and methodName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation
      const params = {
        scenePath: args.scenePath,
        sourceNodePath: args.sourceNodePath,
        signalName: args.signalName,
        targetNodePath: args.targetNodePath,
        methodName: args.methodName,
        binds: args.binds || [],
        flags: args.flags || 0,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('connect_signal', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to connect signal: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure both nodes exist in the scene',
            'Verify the signal exists on the source node',
            'Verify the method exists on the target node',
            'Check that method signature matches signal parameters',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Signal '${args.signalName}' connected from ${args.sourceNodePath} to ${args.targetNodePath}.${args.methodName}()`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to connect signal: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the list_signals tool
   */
  private async handleListSignals(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and nodePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('list_signals', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to list signals: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the node exists in the scene',
            'Verify the node path is correct',
          ]
        );
      }

      // Parse the signals result from stdout
      let signalsResult;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          signalsResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        // If parsing fails, return the raw output
        signalsResult = { signals: [], error: 'Failed to parse signals result' };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Signals for node '${args.nodePath}':\n\n${JSON.stringify(signalsResult, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list signals: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the disconnect_signal tool
   */
  private async handleDisconnectSignal(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.sourceNodePath ||
      !args.signalName || !args.targetNodePath || !args.methodName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, sourceNodePath, signalName, targetNodePath, and methodName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation
      const params = {
        scenePath: args.scenePath,
        sourceNodePath: args.sourceNodePath,
        signalName: args.signalName,
        targetNodePath: args.targetNodePath,
        methodName: args.methodName,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('disconnect_signal', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to disconnect signal: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure both nodes exist in the scene',
            'Verify the signal connection exists',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Signal '${args.signalName}' disconnected from ${args.sourceNodePath} to ${args.targetNodePath}.${args.methodName}()`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to disconnect signal: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the configure_import tool
   */
  private async handleConfigureImport(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.assetPath || !args.importSettings) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, assetPath, and importSettings']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.assetPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the asset file exists
      const assetPath = join(args.projectPath, args.assetPath);
      if (!existsSync(assetPath)) {
        return this.createErrorResponse(
          `Asset file does not exist: ${args.assetPath}`,
          [
            'Ensure the asset path is correct',
            'Verify the asset file exists in the project directory',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        assetPath: args.assetPath,
        importSettings: args.importSettings,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('configure_import', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to configure import settings: ${stderr}`,
          [
            'Check if the asset path is correct',
            'Ensure the import settings are valid',
            'Verify you have write permissions',
          ]
        );
      }

      // Parse the result from stdout
      let configResult;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          configResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        // If parsing fails, return the raw output
        configResult = { success: true, message: stdout };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Import settings configured successfully for: ${args.assetPath}\n\nResult: ${JSON.stringify(configResult, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to configure import settings: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the add_physics_body tool
   */
  private async handleAddPhysicsBody(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.bodyType || !args.nodeName || !args.collisionShape) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, bodyType, nodeName, and collisionShape']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        parentNodePath: args.parentNodePath || 'root',
        bodyType: args.bodyType,
        nodeName: args.nodeName,
        collisionShape: args.collisionShape,
      };

      if (args.physicsProperties) {
        params.physicsProperties = args.physicsProperties;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('add_physics_body', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to add physics body: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the parent node path is correct',
            'Verify the body type is valid for Godot 4.5+',
            'Check collision shape parameters',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Physics body '${args.nodeName}' of type '${args.bodyType}' added successfully to scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add physics body: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the configure_physics tool
   */
  private async handleConfigurePhysics(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.properties) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and properties']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        properties: args.properties,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('configure_physics', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to configure physics: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the node path is correct',
            'Verify the node is a physics body',
            'Check property names and values',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Physics properties configured successfully for node: ${args.nodePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to configure physics: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the setup_collision_layers tool
   */
  private async handleSetupCollisionLayers(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and nodePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
      };

      if (args.collisionLayer !== undefined) {
        params.collisionLayer = args.collisionLayer;
      }

      if (args.collisionMask !== undefined) {
        params.collisionMask = args.collisionMask;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('setup_collision_layers', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to setup collision layers: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the node path is correct',
            'Verify the node is a physics body or area',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Collision layers configured successfully for node: ${args.nodePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to setup collision layers: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_ui_element tool
   */
  private async handleCreateUIElement(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.elementType || !args.elementName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, elementType, and elementName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        parentNodePath: args.parentNodePath || 'root',
        elementType: args.elementType,
        elementName: args.elementName,
      };

      if (args.properties) {
        params.properties = args.properties;
      }

      if (args.anchors) {
        params.anchors = args.anchors;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_ui_element', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to create UI element: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the parent node path is correct',
            'Verify the element type is valid (Button, Label, Panel, etc.)',
            'Check anchor values are between 0 and 1',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `UI element '${args.elementName}' of type '${args.elementType}' created successfully in scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create UI element: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the apply_theme tool
   */
  private async handleApplyTheme(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.themePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and themePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath) || !this.validatePath(args.themePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the theme file exists
      const themePath = join(args.projectPath, args.themePath);
      if (!existsSync(themePath)) {
        return this.createErrorResponse(
          `Theme file does not exist: ${args.themePath}`,
          [
            'Ensure the theme path is correct',
            'Use create_resource to create a new Theme resource first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        themePath: args.themePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('apply_theme', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to apply theme: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the node path is correct',
            'Verify the node is a Control node',
            'Check if the theme file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Theme '${args.themePath}' applied successfully to node '${args.nodePath}' in scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to apply theme: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the setup_layout tool
   */
  private async handleSetupLayout(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.properties) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and properties']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        properties: args.properties,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('setup_layout', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to setup layout: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the node path is correct',
            'Verify the node is a Container node',
            'Check if the properties are valid for the container type',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Layout configured successfully for node '${args.nodePath}' in scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to setup layout: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_menu tool
   */
  private async handleCreateMenu(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.menuName || !args.buttons) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, menuName, and buttons']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    if (!Array.isArray(args.buttons) || args.buttons.length === 0) {
      return this.createErrorResponse(
        'Invalid buttons parameter',
        ['Provide an array of button definitions with at least one button']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        parentNodePath: args.parentNodePath || 'root',
        menuName: args.menuName,
        buttons: args.buttons,
        layout: args.layout || 'vertical',
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_menu', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to create menu: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the parent node path is correct',
            'Verify the button definitions are valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Menu '${args.menuName}' with ${args.buttons.length} buttons created successfully in scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create menu: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_area tool
   */
  private async handleCreateArea(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.areaType || !args.nodeName || !args.collisionShape) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, areaType, nodeName, and collisionShape']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        parentNodePath: args.parentNodePath || 'root',
        areaType: args.areaType,
        nodeName: args.nodeName,
        collisionShape: args.collisionShape,
      };

      if (args.monitorable !== undefined) {
        params.monitorable = args.monitorable;
      }

      if (args.monitoring !== undefined) {
        params.monitoring = args.monitoring;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_area', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to create area: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the parent node path is correct',
            'Verify the area type is valid (Area2D or Area3D)',
            'Check collision shape parameters',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Area '${args.nodeName}' of type '${args.areaType}' created successfully in scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create area: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_animation_player tool
   */
  private async handleCreateAnimationPlayer(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scenePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        parentNodePath: args.parentNodePath || 'root',
        nodeName: args.nodeName || 'AnimationPlayer',
      };

      // Add optional animations array
      if (args.animations && Array.isArray(args.animations)) {
        params.animations = args.animations;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_animation_player', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to create AnimationPlayer: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the parent node path is correct',
            'Verify the animation names are valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `AnimationPlayer '${params.nodeName}' created successfully in scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create AnimationPlayer: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the add_keyframes tool
   */
  private async handleAddKeyframes(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.animationPlayerPath || !args.animationName || !args.track) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, animationPlayerPath, animationName, and track']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        animationPlayerPath: args.animationPlayerPath,
        animationName: args.animationName,
        track: args.track,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('add_keyframes', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to add keyframes: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the AnimationPlayer node path is correct',
            'Verify the animation exists',
            'Check if the target node path is valid',
            'Ensure keyframe values match the property type',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Keyframes added successfully to animation '${args.animationName}' in AnimationPlayer '${args.animationPlayerPath}'\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add keyframes: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the setup_animation_tree tool
   */
  private async handleSetupAnimationTree(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.animationPlayerPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and animationPlayerPath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        parentNodePath: args.parentNodePath || 'root',
        nodeName: args.nodeName || 'AnimationTree',
        animationPlayerPath: args.animationPlayerPath,
      };

      // Add optional states and transitions
      if (args.states && Array.isArray(args.states)) {
        params.states = args.states;
      }

      if (args.transitions && Array.isArray(args.transitions)) {
        params.transitions = args.transitions;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('setup_animation_tree', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to setup AnimationTree: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the parent node path is correct',
            'Verify the AnimationPlayer path is valid',
            'Check if state names are valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `AnimationTree '${params.nodeName}' setup successfully in scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to setup AnimationTree: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the add_particles tool
   */
  private async handleAddParticles(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath || !args.particleType || !args.nodeName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, particleType, and nodeName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        parentNodePath: args.parentNodePath || 'root',
        particleType: args.particleType,
        nodeName: args.nodeName,
      };

      // Add optional properties
      if (args.properties) {
        params.properties = args.properties;
      }

      if (args.processMaterial) {
        params.processMaterial = args.processMaterial;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('add_particles', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to add particles: ${stderr}`,
          [
            'Check if the scene file exists',
            'Ensure the parent node path is correct',
            'Verify the particle type is valid (GPUParticles2D or GPUParticles3D)',
            'Check property values',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Particle system '${args.nodeName}' of type '${args.particleType}' added successfully to scene: ${args.scenePath}\n\nOutput:\n${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add particles: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_class_info tool
   */
  private async handleGetClassInfo(args: any) {
    if (!args.className) {
      return this.createErrorResponse(
        'Missing required parameter',
        ['Provide className']
      );
    }

    try {
      const docModule = await this.getDocumentationModule();
      const classInfo = await docModule.getClassInfo(args.className);

      // Format the response
      let response = `# ${classInfo.name}\n\n`;

      if (classInfo.inherits) {
        response += `**Inherits:** ${classInfo.inherits}\n\n`;
      }

      response += `## Description\n\n${classInfo.description}\n\n`;

      if (classInfo.properties.length > 0) {
        response += `## Properties\n\n`;
        for (const prop of classInfo.properties) {
          response += `- **${prop.name}**: ${prop.type}`;
          if (prop.defaultValue) {
            response += ` = ${prop.defaultValue}`;
          }
          if (prop.description) {
            response += ` - ${prop.description}`;
          }
          response += '\n';
        }
        response += '\n';
      }

      if (classInfo.methods.length > 0) {
        response += `## Methods\n\n`;
        for (const method of classInfo.methods.slice(0, 20)) { // Limit to first 20 methods
          const params = method.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
          response += `- **${method.name}**(${params}) -> ${method.returnType}\n`;
          if (method.description) {
            response += `  ${method.description}\n`;
          }
        }
        if (classInfo.methods.length > 20) {
          response += `\n... and ${classInfo.methods.length - 20} more methods\n`;
        }
        response += '\n';
      }

      if (classInfo.signals.length > 0) {
        response += `## Signals\n\n`;
        for (const signal of classInfo.signals) {
          const params = signal.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
          response += `- **${signal.name}**(${params})\n`;
          if (signal.description) {
            response += `  ${signal.description}\n`;
          }
        }
        response += '\n';
      }

      if (classInfo.constants.length > 0) {
        response += `## Constants\n\n`;
        for (const constant of classInfo.constants.slice(0, 10)) { // Limit to first 10 constants
          response += `- **${constant.name}** = ${constant.value}`;
          if (constant.description) {
            response += ` - ${constant.description}`;
          }
          response += '\n';
        }
        if (classInfo.constants.length > 10) {
          response += `\n... and ${classInfo.constants.length - 10} more constants\n`;
        }
        response += '\n';
      }

      response += `\n**Documentation:** ${classInfo.url}`;

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get class info: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the class name is correct',
          'Check if Godot is installed correctly',
          'Verify the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the get_method_info tool
   */
  private async handleGetMethodInfo(args: any) {
    if (!args.className || !args.methodName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide className and methodName']
      );
    }

    try {
      const docModule = await this.getDocumentationModule();
      const methodInfo = await docModule.getMethodInfo(args.className, args.methodName);

      if (!methodInfo) {
        return this.createErrorResponse(
          `Method '${args.methodName}' not found in class '${args.className}'`,
          [
            'Check if the method name is correct',
            'The method might be inherited from a parent class',
            'Use get_class_info to see all available methods',
          ]
        );
      }

      // Format the response
      const params = methodInfo.parameters.map(p => {
        let param = `${p.name}: ${p.type}`;
        if (p.defaultValue) {
          param += ` = ${p.defaultValue}`;
        }
        return param;
      }).join(', ');

      let response = `# ${args.className}.${methodInfo.name}\n\n`;
      response += `**Signature:** ${methodInfo.name}(${params}) -> ${methodInfo.returnType}\n\n`;
      response += `## Description\n\n${methodInfo.description}\n\n`;

      if (methodInfo.parameters.length > 0) {
        response += `## Parameters\n\n`;
        for (const param of methodInfo.parameters) {
          response += `- **${param.name}**: ${param.type}`;
          if (param.defaultValue) {
            response += ` (default: ${param.defaultValue})`;
          }
          if (param.description) {
            response += ` - ${param.description}`;
          }
          response += '\n';
        }
        response += '\n';
      }

      if (methodInfo.examples.length > 0) {
        response += `## Examples\n\n`;
        for (const example of methodInfo.examples) {
          response += `### ${example.title}\n\n`;
          response += `\`\`\`${example.language}\n${example.code}\n\`\`\`\n\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get method info: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the class name and method name are correct',
          'Check if Godot is installed correctly',
          'Verify the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the search_docs tool
   */
  private async handleSearchDocs(args: any) {
    if (!args.query) {
      return this.createErrorResponse(
        'Missing required parameter',
        ['Provide query']
      );
    }

    try {
      const docModule = await this.getDocumentationModule();
      const results = await docModule.searchDocs(args.query);

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No results found for query: "${args.query}"\n\nTry:\n- Using different keywords\n- Searching for class names (e.g., "CharacterBody2D")\n- Searching for method names (e.g., "move_and_slide")\n- Searching for topics (e.g., "physics", "animation")`,
            },
          ],
        };
      }

      // Format the response
      let response = `# Search Results for "${args.query}"\n\n`;
      response += `Found ${results.length} result(s):\n\n`;

      for (const result of results.slice(0, 20)) { // Limit to first 20 results
        response += `## ${result.type.toUpperCase()}: ${result.className}.${result.name}\n`;
        response += `${result.description}\n`;
        response += `Relevance: ${result.relevance.toFixed(0)}%\n\n`;
      }

      if (results.length > 20) {
        response += `\n... and ${results.length - 20} more results\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to search docs: ${error?.message || 'Unknown error'}`,
        [
          'Try a different search query',
          'Check if Godot is installed correctly',
          'Verify the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the get_best_practices tool
   */
  private async handleGetBestPractices(args: any) {
    if (!args.topic) {
      return this.createErrorResponse(
        'Missing required parameter',
        ['Provide topic']
      );
    }

    try {
      const docModule = await this.getDocumentationModule();
      const practices = await docModule.getBestPractices(args.topic);

      if (practices.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No best practices found for topic: "${args.topic}"\n\nAvailable topics:\n- physics\n- signals\n- gdscript\n- scene organization\n- animation\n- ui`,
            },
          ],
        };
      }

      // Format the response
      let response = `# Best Practices: ${args.topic}\n\n`;

      for (const practice of practices) {
        response += `## ${practice.title}\n\n`;
        response += `${practice.description}\n\n`;

        if (practice.examples.length > 0) {
          response += `### Examples\n\n`;
          for (const example of practice.examples) {
            response += `#### ${example.title}\n\n`;
            response += `\`\`\`${example.language}\n${example.code}\n\`\`\`\n\n`;
          }
        }

        if (practice.references.length > 0) {
          response += `### References\n\n`;
          for (const ref of practice.references) {
            response += `- ${ref}\n`;
          }
          response += '\n';
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get best practices: ${error?.message || 'Unknown error'}`,
        [
          'Try a different topic',
          'Check if Godot is installed correctly',
          'Verify the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the run_with_debug tool
   */
  private async handleRunWithDebug(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Missing required parameter',
        ['Provide projectPath']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Ensure the path does not contain ".." or other suspicious patterns']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          throw new Error('Could not find a valid Godot executable path');
        }
      }

      // Validate Godot version
      await this.validateGodotVersion();

      const projectPath = args.projectPath;
      const scene = args.scene || '';
      const captureOutput = args.captureOutput !== false;

      this.logDebug(`Running project with debug: ${projectPath}`);

      // Generate a unique session ID
      const sessionId = `debug_${Date.now()}`;

      // Build the command
      const cmdArgs = [
        '--path',
        `"${projectPath}"`,
      ];

      if (scene) {
        cmdArgs.push(`"${scene}"`);
      }

      // Add debug flags
      cmdArgs.push('--verbose');
      cmdArgs.push('--debug');

      const cmd = `"${this.godotPath}" ${cmdArgs.join(' ')}`;
      this.logDebug(`Debug command: ${cmd}`);

      // Spawn the process
      const godotProcess = spawn(this.godotPath, cmdArgs.join(' ').split(' ').filter(arg => arg !== ''), {
        cwd: projectPath,
        shell: true,
      });

      const output: string[] = [];
      const errors: ErrorInfo[] = [];
      const warnings: string[] = [];

      // Capture stdout
      godotProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        output.push(text);

        // Parse for errors and warnings
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.includes('ERROR:') || line.includes('SCRIPT ERROR:')) {
            const errorInfo = this.parseErrorLine(line);
            if (errorInfo) {
              errors.push(errorInfo);
            }
          } else if (line.includes('WARNING:')) {
            warnings.push(line);
          }
        }
      });

      // Capture stderr
      godotProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        output.push(text);

        // Parse for errors
        const lines = text.split('\n');
        for (const line of lines) {
          const errorInfo = this.parseErrorLine(line);
          if (errorInfo) {
            errors.push(errorInfo);
          }
        }
      });

      // Store the active process
      this.activeProcess = {
        process: godotProcess,
        output,
        errors: errors.map(e => e.message),
      };

      // Wait a bit for initial output
      await new Promise(resolve => setTimeout(resolve, 2000));

      const debugSession: DebugSession = {
        sessionId,
        output,
        errors,
        warnings,
      };

      // Format the response
      let response = `# Debug Session Started: ${sessionId}\n\n`;
      response += `Project: ${projectPath}\n`;
      if (scene) {
        response += `Scene: ${scene}\n`;
      }
      response += `\n## Initial Output\n\n`;

      if (output.length > 0) {
        response += '```\n';
        response += output.slice(0, 50).join('');
        if (output.length > 50) {
          response += `\n... (${output.length - 50} more lines)\n`;
        }
        response += '```\n\n';
      } else {
        response += 'No output yet\n\n';
      }

      if (errors.length > 0) {
        response += `## Errors (${errors.length})\n\n`;
        for (const error of errors.slice(0, 10)) {
          response += `### ${error.type.toUpperCase()} Error\n`;
          response += `**File:** ${error.script}:${error.line}\n`;
          response += `**Message:** ${error.message}\n\n`;
          if (error.stack.length > 0) {
            response += '**Stack Trace:**\n```\n';
            for (const frame of error.stack) {
              response += `  at ${frame.function} (${frame.script}:${frame.line})\n`;
            }
            response += '```\n\n';
          }
        }
      }

      if (warnings.length > 0) {
        response += `## Warnings (${warnings.length})\n\n`;
        for (const warning of warnings.slice(0, 5)) {
          response += `- ${warning}\n`;
        }
        if (warnings.length > 5) {
          response += `\n... and ${warnings.length - 5} more warnings\n`;
        }
      }

      response += '\n**Note:** Use `get_debug_output` to retrieve more output, or `stop_project` to stop the debug session.\n';

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to run project with debug: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the project path is correct',
          'Check if the project has a valid project.godot file',
          'Verify Godot is installed correctly',
        ]
      );
    }
  }

  /**
   * Parse an error line from Godot output
   */
  private parseErrorLine(line: string): ErrorInfo | null {
    // Pattern: ERROR: <message>
    //   at: <function> (<script>:<line>)
    // or SCRIPT ERROR: <message>
    //   at: <script>:<line>

    const errorMatch = line.match(/(?:ERROR|SCRIPT ERROR):\s*(.+)/);
    if (!errorMatch) {
      return null;
    }

    const message = errorMatch[1].trim();

    // Try to extract script and line info from the message
    const locationMatch = message.match(/(?:at|in)\s+(.+?):(\d+)/);

    let script = 'unknown';
    let lineNum = 0;
    let type: 'runtime' | 'script' | 'engine' = 'runtime';

    if (locationMatch) {
      script = locationMatch[1];
      lineNum = parseInt(locationMatch[2], 10);
    }

    if (line.includes('SCRIPT ERROR')) {
      type = 'script';
    } else if (line.includes('ENGINE')) {
      type = 'engine';
    }

    return {
      message,
      stack: [],
      script,
      line: lineNum,
      type,
    };
  }

  /**
   * Handle the get_error_context tool
   */
  private async handleGetErrorContext(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.errorMessage) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and errorMessage']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Ensure the path does not contain ".." or other suspicious patterns']
      );
    }

    try {
      const errorMessage = args.errorMessage;
      const script = args.script || 'unknown';
      const line = args.line || 0;

      this.logDebug(`Getting error context for: ${errorMessage}`);

      // Parse the error to extract relevant information
      const errorInfo: ErrorInfo = {
        message: errorMessage,
        stack: [],
        script,
        line,
        type: 'runtime',
      };

      // Try to identify the error type
      if (errorMessage.includes('parse') || errorMessage.includes('syntax')) {
        errorInfo.type = 'script';
      } else if (errorMessage.includes('engine') || errorMessage.includes('internal')) {
        errorInfo.type = 'engine';
      }

      // Extract class names and method names from the error
      const classMatches = errorMessage.match(/\b([A-Z][a-zA-Z0-9]*(?:2D|3D)?)\b/g) || [];
      const methodMatches = errorMessage.match(/\b([a-z_][a-z0-9_]*)\s*\(/g) || [];

      // Get documentation for relevant classes
      const docModule = await this.getDocumentationModule();
      const suggestions: string[] = [];

      // Search documentation for related information
      for (const className of classMatches.slice(0, 3)) {
        try {
          const classInfo = await docModule.getClassInfo(className);
          if (classInfo) {
            suggestions.push(`**${className}**: ${classInfo.description}`);
          }
        } catch (e) {
          // Ignore if class not found
        }
      }

      // Search for common error patterns and solutions
      const commonErrors: Record<string, string[]> = {
        'null': [
          'Check if the node or resource exists before accessing it',
          'Use `if node:` or `if is_instance_valid(node):` to verify',
          'Ensure the node path is correct',
        ],
        'invalid call': [
          'Verify the method exists on the object',
          'Check the method signature and parameters',
          'Ensure the object is of the correct type',
        ],
        'parse error': [
          'Check for syntax errors in the script',
          'Verify proper indentation (GDScript is indentation-sensitive)',
          'Ensure all brackets and parentheses are balanced',
        ],
        'type mismatch': [
          'Check the types of variables and parameters',
          'Use type hints to catch type errors early',
          'Verify the return type of functions',
        ],
        'not found': [
          'Check if the file or resource path is correct',
          'Verify the resource exists in the project',
          'Use res:// prefix for resource paths',
        ],
      };

      const errorLower = errorMessage.toLowerCase();
      for (const [pattern, solutions] of Object.entries(commonErrors)) {
        if (errorLower.includes(pattern)) {
          suggestions.push(...solutions);
        }
      }

      // Format the response
      let response = `# Error Context\n\n`;
      response += `**Type:** ${errorInfo.type.toUpperCase()}\n`;
      response += `**Message:** ${errorMessage}\n`;
      if (script !== 'unknown') {
        response += `**Location:** ${script}:${line}\n`;
      }
      response += '\n';

      if (errorInfo.stack.length > 0) {
        response += `## Stack Trace\n\n\`\`\`\n`;
        for (const frame of errorInfo.stack) {
          response += `  at ${frame.function} (${frame.script}:${frame.line})\n`;
        }
        response += `\`\`\`\n\n`;
      }

      if (suggestions.length > 0) {
        response += `## Possible Solutions\n\n`;
        for (const suggestion of suggestions.slice(0, 10)) {
          response += `- ${suggestion}\n`;
        }
        response += '\n';
      }

      // Add documentation links
      if (classMatches.length > 0) {
        response += `## Related Documentation\n\n`;
        for (const className of classMatches.slice(0, 3)) {
          response += `- [${className}](https://docs.godotengine.org/en/stable/classes/class_${className.toLowerCase()}.html)\n`;
        }
        response += '\n';
      }

      // Add best practices link
      response += `## Additional Help\n\n`;
      response += `- Use \`get_best_practices\` tool to learn more about Godot development\n`;
      response += `- Use \`search_docs\` tool to search for specific topics\n`;
      response += `- Use \`get_class_info\` tool to get detailed information about classes\n`;

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get error context: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the error message is provided',
          'Check if Godot is installed correctly',
        ]
      );
    }
  }

  /**
   * Handle the capture_screenshot tool
   */
  private async handleCaptureScreenshot(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.outputPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and outputPath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.outputPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Ensure paths do not contain ".." or other suspicious patterns']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          ['Ensure the path points to a directory containing a project.godot file']
        );
      }

      this.logDebug(`Capturing screenshot for project: ${args.projectPath}`);
      console.log(`[SCREENSHOT] Starting capture for: ${args.projectPath}`);
      console.log(`[SCREENSHOT] Output path: ${args.outputPath}`);
      console.log(`[SCREENSHOT] Scene path: ${args.scenePath || 'none'}`);

      // Execute the capture_screenshot operation
      const result = await this.executeOperation('capture_screenshot', args, args.projectPath);

      console.log(`[SCREENSHOT] Operation completed`);
      console.log(`[SCREENSHOT] STDOUT:\n${result.stdout}`);
      console.log(`[SCREENSHOT] STDERR:\n${result.stderr}`);

      // Parse the result
      const lines = result.stdout.split('\n').filter(line => line.trim());
      const lastLine = lines[lines.length - 1];

      this.logDebug(`Screenshot operation output: ${lastLine}`);

      // Try to parse as JSON
      try {
        const jsonResult = JSON.parse(lastLine);

        if (jsonResult.success) {
          let response = `# Screenshot Captured Successfully\n\n`;
          response += `**Output Path:** ${jsonResult.output_path}\n`;
          if (jsonResult.size) {
            response += `**Size:** ${jsonResult.size.width}x${jsonResult.size.height}\n`;
          }
          if (args.scenePath) {
            response += `**Scene:** ${args.scenePath}\n`;
          } else {
            response += `**Scene:** None (empty viewport)\n`;
            response += `⚠️ **Warning:** No scene was specified, screenshot shows empty gray viewport.\n`;
          }
          if (args.delay) {
            response += `**Delay:** ${args.delay} seconds\n`;
          }
          response += '\n';
          response += `The screenshot has been saved successfully.\n`;
          
          // Add full output log for debugging
          response += '\n## Operation Log\n\n```\n';
          response += result.stdout;
          response += '\n```\n';

          return {
            content: [
              {
                type: 'text',
                text: response,
              },
            ],
          };
        } else {
          return this.createErrorResponse(
            `Failed to capture screenshot: ${jsonResult.error || 'Unknown error'}`,
            [
              'Ensure the output path is writable',
              'Check if the scene path is valid (if provided)',
              'Verify the viewport size is valid (if provided)',
            ]
          );
        }
      } catch (parseError) {
        // If not JSON, treat as plain text output
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot operation completed:\n\n${result.stdout}`,
            },
          ],
        };
      }
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to capture screenshot: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed and accessible',
          'Check if the project path is correct',
          'Verify the output path is writable',
          'If capturing from a scene, ensure the scene path is valid',
        ]
      );
    }
  }

  /**
   * Handle the list_assets tool
   */
  private async handleListAssets(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Missing required parameter',
        ['Provide projectPath']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {};

      // Add optional parameters
      if (args.directory) {
        params.directory = args.directory;
      }

      if (args.fileTypes && Array.isArray(args.fileTypes)) {
        params.fileTypes = args.fileTypes;
      }

      if (args.recursive !== undefined) {
        params.recursive = args.recursive;
      } else {
        params.recursive = true; // Default to recursive
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('list_assets', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to list assets: ${stderr}`,
          [
            'Check if the directory path is valid',
            'Ensure you have read permissions',
          ]
        );
      }

      // Parse the result from stdout
      let assetsResult;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          assetsResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        // If parsing fails, return the raw output
        assetsResult = { assets: [], error: 'Failed to parse assets result' };
      }

      const assetCount = assetsResult.assets ? assetsResult.assets.length : 0;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${assetCount} assets in the project.\n\nAssets: ${JSON.stringify(assetsResult, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list assets: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_resource tool
   */
  private async handleCreateResource(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.resourcePath || !args.resourceType) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, resourcePath, and resourceType']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.resourcePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        resourcePath: args.resourcePath,
        resourceType: args.resourceType,
      };

      // Add optional properties
      if (args.properties) {
        params.properties = args.properties;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_resource', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to create resource: ${stderr}`,
          [
            'Check if the resource path is valid',
            'Ensure the directory exists',
            'Verify you have write permissions',
            'Check if the resource type is supported',
          ]
        );
      }

      // Parse the result from stdout
      let resourceResult;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          resourceResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        // If parsing fails, return the raw output
        resourceResult = { success: true, message: stdout };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Resource created successfully: ${args.resourcePath}\n\nResult: ${JSON.stringify(resourceResult, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create resource: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the import_asset tool
   */
  private async handleImportAsset(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.assetPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and assetPath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.assetPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the asset file exists
      const assetPath = join(args.projectPath, args.assetPath);
      if (!existsSync(assetPath)) {
        return this.createErrorResponse(
          `Asset file does not exist: ${args.assetPath}`,
          [
            'Ensure the asset path is correct',
            'Verify the asset file exists in the project directory',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        assetPath: args.assetPath,
      };

      // Add optional import settings
      if (args.importSettings) {
        params.importSettings = args.importSettings;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('import_asset', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to import asset: ${stderr}`,
          [
            'Check if the asset path is correct',
            'Ensure the asset file format is supported by Godot',
            'Verify you have write permissions',
          ]
        );
      }

      // Parse the import result from stdout
      let importResult;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          importResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        // If parsing fails, return the raw output
        importResult = { success: true, message: stdout };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Asset imported successfully: ${args.assetPath}\n\nResult: ${JSON.stringify(importResult, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to import asset: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the list_missing_assets tool
   */
  private async handleListMissingAssets(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Missing required parameter',
        ['Provide projectPath']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Ensure paths do not contain ".." or other suspicious patterns']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          ['Ensure the path points to a directory containing a project.godot file']
        );
      }

      this.logDebug(`Scanning for missing assets in project: ${args.projectPath}`);

      // Prepare parameters for the operation
      const params: any = {};

      // Add optional check types
      if (args.checkTypes && Array.isArray(args.checkTypes)) {
        params.checkTypes = args.checkTypes;
      }

      // Execute the list_missing_assets operation
      const result = await this.executeOperation('list_missing_assets', params, args.projectPath);

      // Parse the result
      const lines = result.stdout.split('\n').filter(line => line.trim());
      const lastLine = lines[lines.length - 1];

      this.logDebug(`Missing assets operation output: ${lastLine}`);

      // Try to parse as JSON
      try {
        const jsonResult = JSON.parse(lastLine);

        if (jsonResult.success) {
          const report: MissingAssetsReport = jsonResult.report;

          let response = `# Missing Assets Report\n\n`;
          response += `**Timestamp:** ${report.timestamp}\n`;
          response += `**Total Missing:** ${report.totalMissing}\n`;
          response += `**Checked Paths:** ${report.checkedPaths.length}\n\n`;

          if (report.totalMissing === 0) {
            response += `✓ No missing assets found! All resource references are valid.\n`;
          } else {
            response += `## Missing Assets (${report.totalMissing})\n\n`;

            for (const asset of report.missing) {
              response += `### ${asset.path}\n`;
              response += `**Type:** ${asset.type}\n`;
              response += `**Referenced By:**\n`;
              for (const ref of asset.referencedBy) {
                response += `  - ${ref}\n`;
              }

              if (asset.suggestedFixes && asset.suggestedFixes.length > 0) {
                response += `**Suggested Fixes:**\n`;
                for (const fix of asset.suggestedFixes) {
                  response += `  - ${fix}\n`;
                }
              }
              response += '\n';
            }
          }

          response += `## Checked Paths\n\n`;
          for (const path of report.checkedPaths.slice(0, 10)) {
            response += `- ${path}\n`;
          }
          if (report.checkedPaths.length > 10) {
            response += `\n_... and ${report.checkedPaths.length - 10} more paths_\n`;
          }

          return {
            content: [
              {
                type: 'text',
                text: response,
              },
            ],
          };
        } else {
          return this.createErrorResponse(
            `Failed to scan for missing assets: ${jsonResult.error || 'Unknown error'}`,
            [
              'Ensure the project has valid scene and resource files',
              'Check if you have read permissions for the project directory',
            ]
          );
        }
      } catch (parseError) {
        // If not JSON, treat as plain text output
        return {
          content: [
            {
              type: 'text',
              text: `Missing assets scan completed:\n\n${result.stdout}`,
            },
          ],
        };
      }
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to scan for missing assets: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed and accessible',
          'Check if the project path is correct',
          'Verify you have read permissions for the project directory',
        ]
      );
    }
  }

  /**
   * Handle the update_project_settings tool
   */
  private async handleUpdateProjectSettings(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.settings) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and settings']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation
      const params = {
        settings: args.settings,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('update_project_settings', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to update project settings: ${stderr}`,
          [
            'Check if the settings keys are valid',
            'Ensure the values are of the correct type',
            'Verify you have write permissions to project.godot',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Project settings updated successfully.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to update project settings: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the configure_input_map tool
   */
  private async handleConfigureInputMap(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.actions) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and actions']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation
      const params = {
        actions: args.actions,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('configure_input_map', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to configure input map: ${stderr}`,
          [
            'Check if the action names are valid',
            'Ensure event types are correct (key, mouse_button, joypad_button, joypad_motion)',
            'Verify key codes and button indices are valid',
          ]
        );
      }

      const actionCount = args.actions.length;
      return {
        content: [
          {
            type: 'text',
            text: `Input map configured successfully with ${actionCount} action(s).\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to configure input map: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the setup_autoload tool
   */
  private async handleSetupAutoload(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.autoloads) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and autoloads']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation
      const params = {
        autoloads: args.autoloads,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('setup_autoload', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to setup autoload: ${stderr}`,
          [
            'Check if the autoload names are valid',
            'Ensure the script/scene paths exist',
            'Verify paths use res:// prefix',
          ]
        );
      }

      const autoloadCount = args.autoloads.length;
      return {
        content: [
          {
            type: 'text',
            text: `Autoload configured successfully with ${autoloadCount} singleton(s).\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to setup autoload: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the manage_plugins tool
   */
  private async handleManagePlugins(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.action) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and action']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    // Validate action-specific requirements
    if ((args.action === 'enable' || args.action === 'disable') && !args.pluginName) {
      return this.createErrorResponse(
        'Missing required parameter',
        ['Provide pluginName for enable/disable actions']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation
      const params: any = {
        action: args.action,
      };

      if (args.pluginName) {
        params.pluginName = args.pluginName;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('manage_plugins', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to manage plugins: ${stderr}`,
          [
            'Check if the plugin name is correct',
            'Ensure the plugin exists in addons/ directory',
            'Verify the plugin has a valid plugin.cfg file',
          ]
        );
      }

      // Parse the result from stdout for list action
      if (args.action === 'list') {
        let pluginsResult;
        try {
          // Find JSON in the output
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            pluginsResult = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          // If parsing fails, return the raw output
          pluginsResult = { plugins: [], error: 'Failed to parse plugins result' };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Plugins:\n\n${JSON.stringify(pluginsResult, null, 2)}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Plugin '${args.pluginName}' ${args.action}d successfully.\n\nOutput: ${stdout}`,
            },
          ],
        };
      }
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to manage plugins: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the run_scene tool
   */
  private async handleRunScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scenePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const fullScenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(fullScenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
            'Check that the path is relative to the project directory',
          ]
        );
      }

      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          throw new Error('Could not find a valid Godot executable path');
        }
      }

      this.logDebug(`Running scene: ${args.scenePath} in project: ${args.projectPath}`);

      // Build the command arguments
      const cmdArgs: string[] = [
        '--path',
        args.projectPath,
        args.scenePath,
      ];

      // Add debug flag if requested (default: true)
      const debug = args.debug !== undefined ? args.debug : true;
      if (debug) {
        cmdArgs.push('-d');
      }

      // Add any additional arguments
      if (args.additionalArgs && Array.isArray(args.additionalArgs)) {
        cmdArgs.push(...args.additionalArgs);
      }

      this.logDebug(`Command: ${this.godotPath} ${cmdArgs.join(' ')}`);

      // Run the scene and capture output
      return new Promise((resolve) => {
        const output: string[] = [];
        const errors: ErrorInfo[] = [];
        let exitCode = 0;

        const godotProcess = spawn(this.godotPath!, cmdArgs, {
          cwd: args.projectPath,
        });

        // Capture stdout
        godotProcess.stdout.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              output.push(line);
              this.logDebug(`[STDOUT] ${line}`);

              // Try to parse errors from output
              const errorInfo = this.parseErrorLine(line);
              if (errorInfo) {
                errors.push(errorInfo);
              }
            }
          }
        });

        // Capture stderr
        godotProcess.stderr.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              output.push(`[STDERR] ${line}`);
              this.logDebug(`[STDERR] ${line}`);

              // Try to parse errors from stderr
              const errorInfo = this.parseErrorLine(line);
              if (errorInfo) {
                errors.push(errorInfo);
              }
            }
          }
        });

        // Handle process exit
        godotProcess.on('close', (code: number | null) => {
          exitCode = code || 0;
          this.logDebug(`Godot process exited with code: ${exitCode}`);

          const result: SceneRunResult = {
            success: exitCode === 0 && errors.length === 0,
            output,
            errors,
            exitCode,
          };

          // Format the response
          let responseText = `# Scene Run Result\n\n`;
          responseText += `**Scene:** ${args.scenePath}\n`;
          responseText += `**Exit Code:** ${exitCode}\n`;
          responseText += `**Status:** ${result.success ? '✓ Success' : '✗ Failed'}\n\n`;

          if (errors.length > 0) {
            responseText += `## Errors (${errors.length})\n\n`;
            for (const error of errors.slice(0, 10)) {
              responseText += `### ${error.type.toUpperCase()}: ${error.message}\n`;
              if (error.script !== 'unknown') {
                responseText += `**Location:** ${error.script}:${error.line}\n`;
              }
              if (error.stack.length > 0) {
                responseText += `**Stack:**\n\`\`\`\n`;
                for (const frame of error.stack.slice(0, 5)) {
                  responseText += `  at ${frame.function} (${frame.script}:${frame.line})\n`;
                }
                responseText += `\`\`\`\n`;
              }
              responseText += '\n';
            }
            if (errors.length > 10) {
              responseText += `_... and ${errors.length - 10} more errors_\n\n`;
            }
          }

          if (output.length > 0) {
            responseText += `## Console Output\n\n\`\`\`\n`;
            // Show last 50 lines of output
            const outputLines = output.slice(-50);
            if (output.length > 50) {
              responseText += `... (showing last 50 of ${output.length} lines)\n`;
            }
            responseText += outputLines.join('\n');
            responseText += `\n\`\`\`\n\n`;
          }

          responseText += `## Additional Tools\n\n`;
          responseText += `- Use \`get_error_context\` to get detailed information about specific errors\n`;
          responseText += `- Use \`get_class_info\` to learn about Godot classes mentioned in errors\n`;
          responseText += `- Use \`validate_script\` to check scripts for syntax errors\n`;

          resolve({
            content: [
              {
                type: 'text',
                text: responseText,
              },
            ],
          });
        });

        // Handle process errors
        godotProcess.on('error', (error: Error) => {
          this.logDebug(`Godot process error: ${error.message}`);
          resolve(
            this.createErrorResponse(
              `Failed to run scene: ${error.message}`,
              [
                'Ensure Godot is installed correctly',
                'Check if the GODOT_PATH environment variable is set correctly',
                'Verify the scene file is valid',
              ]
            )
          );
        });
      });
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to run scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
          'Ensure the scene file exists and is valid',
        ]
      );
    }
  }

  /**
   * Handle the remote_tree_dump tool
   */
  private async handleRemoteTreeDump(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // If scenePath is provided, we need to run the scene first
      // For now, we'll execute the remote_tree_dump operation directly
      // which will work on the current scene tree in headless mode

      // Prepare parameters for the operation
      const params: any = {};

      if (args.filter) {
        params.filter = args.filter;
      }

      if (args.includeProperties !== undefined) {
        params.includeProperties = args.includeProperties;
      }

      if (args.includeSignals !== undefined) {
        params.includeSignals = args.includeSignals;
      }

      if (args.scenePath) {
        params.scenePath = args.scenePath;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('remote_tree_dump', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to dump remote tree: ${stderr}`,
          [
            'Check if the scene path is valid (if provided)',
            'Ensure the filter parameters are correct',
            'Verify the project is properly configured',
          ]
        );
      }

      // Parse the result from stdout
      let dumpResult: TreeDumpResult;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          dumpResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in output');
        }
      } catch (parseError) {
        return this.createErrorResponse(
          `Failed to parse tree dump result: ${parseError}`,
          [
            'The operation may have failed to execute properly',
            'Check the Godot console output for errors',
          ]
        );
      }

      // Format the response
      let responseText = `# Remote Scene Tree Dump\n\n`;
      responseText += `**Total Nodes:** ${dumpResult.totalNodes}\n`;
      responseText += `**Timestamp:** ${dumpResult.timestamp}\n\n`;

      if (args.filter) {
        responseText += `## Filters Applied\n\n`;
        if (args.filter.nodeType) {
          responseText += `- **Node Type:** ${args.filter.nodeType}\n`;
        }
        if (args.filter.nodeName) {
          responseText += `- **Node Name Pattern:** ${args.filter.nodeName}\n`;
        }
        if (args.filter.hasScript !== undefined) {
          responseText += `- **Has Script:** ${args.filter.hasScript}\n`;
        }
        if (args.filter.depth !== undefined) {
          responseText += `- **Max Depth:** ${args.filter.depth}\n`;
        }
        responseText += '\n';
      }

      if (dumpResult.nodes.length === 0) {
        responseText += `No nodes found matching the specified filters.\n`;
      } else {
        responseText += `## Nodes (${dumpResult.nodes.length})\n\n`;

        for (const node of dumpResult.nodes.slice(0, 50)) {
          responseText += `### ${node.name} (${node.type})\n`;
          responseText += `**Path:** \`${node.path}\`\n`;

          if (node.script) {
            responseText += `**Script:** ${node.script}\n`;
          }

          if (node.children.length > 0) {
            responseText += `**Children:** ${node.children.length}\n`;
            responseText += `\`\`\`\n${node.children.slice(0, 10).join('\n')}\n`;
            if (node.children.length > 10) {
              responseText += `... and ${node.children.length - 10} more\n`;
            }
            responseText += `\`\`\`\n`;
          }

          if (args.includeProperties && node.properties) {
            responseText += `**Properties:**\n\`\`\`json\n${JSON.stringify(node.properties, null, 2)}\n\`\`\`\n`;
          }

          if (args.includeSignals && node.signals && node.signals.length > 0) {
            responseText += `**Signals:**\n`;
            for (const signal of node.signals) {
              responseText += `- **${signal.name}** (${signal.connections.length} connection(s))\n`;
              for (const conn of signal.connections) {
                responseText += `  - → ${conn.target}.${conn.method}()\n`;
              }
            }
          }

          responseText += '\n';
        }

        if (dumpResult.nodes.length > 50) {
          responseText += `_... and ${dumpResult.nodes.length - 50} more nodes_\n\n`;
        }
      }

      responseText += `## Additional Tools\n\n`;
      responseText += `- Use \`query_node\` to get detailed information about a specific node\n`;
      responseText += `- Use \`modify_node\` to change node properties\n`;
      responseText += `- Use \`list_signals\` to see all signals for a node\n`;

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to dump remote tree: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
          'Ensure the scene file exists and is valid (if scenePath provided)',
        ]
      );
    }
  }

  /**
   * Handle the toggle_debug_draw tool
   */
  private async handleToggleDebugDraw(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);

    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!args.mode) {
      return this.createErrorResponse(
        'Debug draw mode is required',
        ['Specify a valid debug draw mode (e.g., "wireframe", "overdraw", "disabled")']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Validate the debug draw mode
      const validModes = [
        'disabled', 'unshaded', 'lighting', 'overdraw', 'wireframe',
        'normal_buffer', 'voxel_gi_albedo', 'voxel_gi_lighting', 'voxel_gi_emission',
        'shadow_atlas', 'directional_shadow_atlas', 'scene_luminance', 'ssao', 'ssil',
        'pssm_splits', 'decal_atlas', 'sdfgi', 'sdfgi_probes', 'gi_buffer',
        'disable_lod', 'cluster_omni_lights', 'cluster_spot_lights', 'cluster_decals',
        'cluster_reflection_probes', 'occluders', 'motion_vectors', 'internal_buffer'
      ];

      if (!validModes.includes(args.mode)) {
        return this.createErrorResponse(
          `Invalid debug draw mode: ${args.mode}`,
          [
            `Valid modes are: ${validModes.join(', ')}`,
            'Check the Godot 4.5+ documentation for Viewport.DebugDraw enum',
          ]
        );
      }

      // Prepare parameters for the operation
      const params: any = {
        mode: args.mode,
      };

      if (args.viewport) {
        params.viewport = args.viewport;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('toggle_debug_draw', params, args.projectPath);

      if (stderr && stderr.includes('[ERROR]')) {
        return this.createErrorResponse(
          `Failed to toggle debug draw: ${stderr}`,
          [
            'Check if the viewport path is valid (if provided)',
            'Ensure the debug draw mode is supported by your Godot version',
            'Verify the project is properly configured',
          ]
        );
      }

      // Parse the result from stdout
      let result: any;
      try {
        // Find JSON in the output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in output');
        }
      } catch (parseError) {
        return this.createErrorResponse(
          `Failed to parse toggle debug draw result: ${parseError}`,
          [
            'The operation may have failed to execute properly',
            'Check the Godot console output for errors',
          ]
        );
      }

      // Format the response
      let responseText = `# Debug Draw Mode Changed\n\n`;
      responseText += `**Mode:** ${result.mode}\n`;
      responseText += `**Viewport:** ${result.viewport || '/root'}\n`;
      responseText += `**Status:** ${result.success ? '✓ Success' : '✗ Failed'}\n\n`;

      // Add mode description
      const modeDescriptions: Record<string, string> = {
        'disabled': 'Normal rendering without debug visualization',
        'unshaded': 'Render without shading, showing only base colors',
        'lighting': 'Visualize lighting calculations',
        'overdraw': 'Show overdraw (how many times pixels are drawn)',
        'wireframe': 'Render geometry as wireframe',
        'normal_buffer': 'Visualize normal buffer',
        'voxel_gi_albedo': 'Show VoxelGI albedo',
        'voxel_gi_lighting': 'Show VoxelGI lighting',
        'voxel_gi_emission': 'Show VoxelGI emission',
        'shadow_atlas': 'Visualize shadow atlas',
        'directional_shadow_atlas': 'Visualize directional shadow atlas',
        'scene_luminance': 'Show scene luminance',
        'ssao': 'Visualize Screen Space Ambient Occlusion',
        'ssil': 'Visualize Screen Space Indirect Lighting',
        'pssm_splits': 'Show Parallel Split Shadow Map splits',
        'decal_atlas': 'Visualize decal atlas',
        'sdfgi': 'Show Signed Distance Field Global Illumination',
        'sdfgi_probes': 'Show SDFGI probes',
        'gi_buffer': 'Visualize Global Illumination buffer',
        'disable_lod': 'Disable Level of Detail',
        'cluster_omni_lights': 'Show clustered omni lights',
        'cluster_spot_lights': 'Show clustered spot lights',
        'cluster_decals': 'Show clustered decals',
        'cluster_reflection_probes': 'Show clustered reflection probes',
        'occluders': 'Visualize occluders',
        'motion_vectors': 'Show motion vectors',
        'internal_buffer': 'Show internal rendering buffer',
      };

      if (modeDescriptions[args.mode]) {
        responseText += `## Mode Description\n\n`;
        responseText += `${modeDescriptions[args.mode]}\n\n`;
      }

      responseText += `## Usage Notes\n\n`;
      responseText += `- Debug draw modes are useful for diagnosing rendering issues\n`;
      responseText += `- Some modes (like SDFGI, VoxelGI) only work if those features are enabled in your scene\n`;
      responseText += `- Use \`disabled\` mode to return to normal rendering\n`;
      responseText += `- Debug draw affects the specified viewport and all its children\n\n`;

      responseText += `## Additional Tools\n\n`;
      responseText += `- Use \`run_scene\` to run a scene and see the debug visualization\n`;
      responseText += `- Use \`capture_screenshot\` to capture the debug visualization\n`;
      responseText += `- Use \`remote_tree_dump\` to inspect the scene tree structure\n`;

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to toggle debug draw: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
          'Ensure you are using Godot 4.5 or later for all debug draw modes',
        ]
      );
    }
  }

  /**
   * Run the MCP server
   */
  async run() {
    try {
      // Detect Godot path before starting the server
      await this.detectGodotPath();

      if (!this.godotPath) {
        console.error('[SERVER] Failed to find a valid Godot executable path');
        console.error('[SERVER] Please set GODOT_PATH environment variable or provide a valid path');
        process.exit(1);
      }

      // Check if the path is valid
      const isValid = await this.isValidGodotPath(this.godotPath);

      if (!isValid) {
        if (this.strictPathValidation) {
          // In strict mode, exit if the path is invalid
          console.error(`[SERVER] Invalid Godot path: ${this.godotPath}`);
          console.error('[SERVER] Please set a valid GODOT_PATH environment variable or provide a valid path');
          process.exit(1);
        } else {
          // In compatibility mode, warn but continue with the default path
          console.warn(`[SERVER] Warning: Using potentially invalid Godot path: ${this.godotPath}`);
          console.warn('[SERVER] This may cause issues when executing Godot commands');
          console.warn('[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.');
        }
      }

      console.log(`[SERVER] Using Godot at: ${this.godotPath}`);

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Godot MCP server running on stdio');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SERVER] Failed to start:', errorMessage);
      process.exit(1);
    }
  }
}

// Create and run the server
const server = new GodotServer();
server.run().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Failed to run server:', errorMessage);
  process.exit(1);
});
