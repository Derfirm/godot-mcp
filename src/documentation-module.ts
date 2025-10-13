/**
 * Documentation Module for Godot 4.5+
 * 
 * This module provides access to Godot documentation, including:
 * - Class information
 * - Method information
 * - Documentation search
 * - Best practices
 */

import { promisify } from 'util';
import { exec } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseStringPromise } from 'xml2js';

const execAsync = promisify(exec);

/**
 * Interface for class information
 */
export interface ClassInfo {
  name: string;
  inherits: string;
  description: string;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  signals: SignalInfo[];
  constants: ConstantInfo[];
  examples: CodeExample[];
  url: string;
}

/**
 * Interface for method information
 */
export interface MethodInfo {
  name: string;
  returnType: string;
  description: string;
  parameters: ParameterInfo[];
  examples: CodeExample[];
}

/**
 * Interface for property information
 */
export interface PropertyInfo {
  name: string;
  type: string;
  description: string;
  defaultValue?: string;
}

/**
 * Interface for signal information
 */
export interface SignalInfo {
  name: string;
  description: string;
  parameters: ParameterInfo[];
}

/**
 * Interface for parameter information
 */
export interface ParameterInfo {
  name: string;
  type: string;
  description?: string;
  defaultValue?: string;
}

/**
 * Interface for constant information
 */
export interface ConstantInfo {
  name: string;
  value: string;
  description: string;
}

/**
 * Interface for code examples
 */
export interface CodeExample {
  title: string;
  code: string;
  language: string;
}

/**
 * Interface for search results
 */
export interface SearchResult {
  type: 'class' | 'method' | 'property' | 'signal';
  className: string;
  name: string;
  description: string;
  relevance: number;
}

/**
 * Interface for best practices
 */
export interface BestPractice {
  topic: string;
  title: string;
  description: string;
  examples: CodeExample[];
  references: string[];
}

/**
 * Documentation Module for Godot 4.5+
 */
export class DocumentationModule {
  private cache: Map<string, ClassInfo> = new Map();
  private searchCache: Map<string, SearchResult[]> = new Map();
  private godotVersion: string = '4.5';
  private docsBaseUrl: string = 'https://docs.godotengine.org/en/stable/';
  private godotPath: string;
  private docsCachePath: string;
  private debugMode: boolean;

  constructor(godotPath: string, cacheDir?: string, debugMode: boolean = false) {
    this.godotPath = godotPath;
    this.debugMode = debugMode;

    // Priority: 1. Provided cacheDir, 2. MCP_CACHE_DIR env var, 3. User's home directory
    if (cacheDir) {
      this.docsCachePath = cacheDir;
    } else if (process.env.MCP_CACHE_DIR) {
      this.docsCachePath = join(process.env.MCP_CACHE_DIR, '.godot-docs-cache');
    } else {
      const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
      this.docsCachePath = join(homeDir, '.godot-docs-cache');
    }

    // Ensure cache directory exists
    try {
      if (!existsSync(this.docsCachePath)) {
        mkdirSync(this.docsCachePath, { recursive: true });
      }
      this.logDebug(`Documentation module initialized with cache at: ${this.docsCachePath}`);
    } catch (error) {
      console.error(`[DOC MODULE] Failed to create cache directory at ${this.docsCachePath}: ${error}`);
      // Fall back to temp directory
      const tempDir = process.env.TMPDIR || process.env.TEMP || '/tmp';
      this.docsCachePath = join(tempDir, '.godot-docs-cache');
      try {
        if (!existsSync(this.docsCachePath)) {
          mkdirSync(this.docsCachePath, { recursive: true });
        }
        console.warn(`[DOC MODULE] Using fallback cache directory: ${this.docsCachePath}`);
      } catch (fallbackError) {
        throw new Error(`Failed to create cache directory: ${fallbackError}`);
      }
    }
  }

  /**
   * Log debug messages if debug mode is enabled
   */
  private logDebug(message: string): void {
    if (this.debugMode) {
      console.debug(`[DOC MODULE] ${message}`);
    }
  }

  /**
   * Get class information from Godot documentation
   */
  async getClassInfo(className: string): Promise<ClassInfo> {
    console.log(`[DOC MODULE] getClassInfo called for: ${className}`);
    console.log(`[DOC MODULE] Cache path: ${this.docsCachePath}`);
    console.log(`[DOC MODULE] Memory cache size: ${this.cache.size}`);
    
    // Check memory cache first
    if (this.cache.has(className)) {
      console.log(`[DOC MODULE] Returning from memory cache: ${className}`);
      return this.cache.get(className)!;
    }

    // Check disk cache
    const cacheFile = join(this.docsCachePath, `${className}.json`);
    console.log(`[DOC MODULE] Checking disk cache: ${cacheFile}`);
    console.log(`[DOC MODULE] Cache file exists: ${existsSync(cacheFile)}`);
    
    if (existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(readFileSync(cacheFile, 'utf-8'));
        this.cache.set(className, cached);
        console.log(`[DOC MODULE] Loaded from disk cache: ${className}`);
        console.log(`[DOC MODULE] Cached class has ${cached.methods?.length || 0} methods`);
        return cached;
      } catch (error) {
        console.error(`[DOC MODULE] Failed to load cached class info:`, error);
      }
    }

    // Fetch from Godot
    console.log(`[DOC MODULE] Fetching from Godot: ${className}`);
    const classInfo = await this.fetchClassInfo(className);

    // Cache in memory and on disk
    this.cache.set(className, classInfo);
    try {
      writeFileSync(cacheFile, JSON.stringify(classInfo, null, 2));
      this.logDebug(`Cached class info to disk: ${className}`);
    } catch (error) {
      this.logDebug(`Failed to cache class info to disk: ${error}`);
    }

    return classInfo;
  }

  /**
   * Fetch class information from Godot using --doctool
   */
  private async fetchClassInfo(className: string): Promise<ClassInfo> {
    try {
      console.log(`[DOC MODULE] Fetching class info for: ${className}`);
      console.log(`[DOC MODULE] Godot path: ${this.godotPath}`);
      console.log(`[DOC MODULE] Cache path: ${this.docsCachePath}`);

      // Generate documentation using Godot's --doctool
      const docToolPath = join(this.docsCachePath, 'doctool');
      console.log(`[DOC MODULE] DocTool path: ${docToolPath}`);

      if (!existsSync(docToolPath)) {
        console.log(`[DOC MODULE] Creating doctool directory...`);
        mkdirSync(docToolPath, { recursive: true });
      } else {
        console.log(`[DOC MODULE] DocTool directory already exists`);
      }

      // Run Godot with --doctool to generate XML documentation
      // Note: --no-docbase generates structure without descriptions, but keeps files
      // We'll enhance descriptions from online docs or provide basic info
      const command = this.godotPath === 'godot'
        ? `godot --doctool "${docToolPath}" --no-docbase --headless --quit`
        : `"${this.godotPath}" --doctool "${docToolPath}" --no-docbase --headless --quit`;

      console.log(`[DOC MODULE] Running doctool command: ${command}`);

      try {
        const result = await execAsync(command);
        console.log(`[DOC MODULE] doctool completed successfully`);
      } catch (error) {
        // doctool may exit with non-zero even on success, check if files were created
        console.log(`[DOC MODULE] doctool command completed (may have non-zero exit):`, error);
      }

      // Parse the generated XML file
      // Try both possible locations (Godot 4.5+ uses doc/classes/)
      let xmlPath = join(docToolPath, 'doc', 'classes', `${className}.xml`);
      console.log(`[DOC MODULE] Checking primary XML path: ${xmlPath}`);
      console.log(`[DOC MODULE] Primary path exists: ${existsSync(xmlPath)}`);

      if (!existsSync(xmlPath)) {
        // Fallback to old location
        xmlPath = join(docToolPath, 'classes', `${className}.xml`);
        console.log(`[DOC MODULE] Checking fallback XML path: ${xmlPath}`);
        console.log(`[DOC MODULE] Fallback path exists: ${existsSync(xmlPath)}`);

        if (!existsSync(xmlPath)) {
          // List what files are actually there
          const docClassesPath = join(docToolPath, 'doc', 'classes');
          if (existsSync(docClassesPath)) {
            const files = require('fs').readdirSync(docClassesPath);
            console.log(`[DOC MODULE] Files in doc/classes (first 10):`, files.slice(0, 10));
          }
          throw new Error(`Documentation XML file not found for class: ${className}`);
        }
      }

      this.logDebug(`Reading XML from: ${xmlPath}`);
      const xmlContent = readFileSync(xmlPath, 'utf-8');
      this.logDebug(`XML content length: ${xmlContent.length} bytes`);

      const classInfo = await this.parseClassXML(xmlContent, className);
      this.logDebug(`Successfully parsed class info for ${className}`);

      return classInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DOC MODULE] Error fetching class info for ${className}: ${errorMessage}`);
      console.error(`[DOC MODULE] Stack trace:`, error);

      // Return minimal class info if fetch fails
      return {
        name: className,
        inherits: '',
        description: `Documentation not available for ${className}. Error: ${errorMessage}`,
        methods: [],
        properties: [],
        signals: [],
        constants: [],
        examples: [],
        url: `${this.docsBaseUrl}classes/class_${className.toLowerCase()}.html`,
      };
    }
  }

  /**
   * Parse Godot XML documentation
   */
  private async parseClassXML(xmlContent: string, className: string): Promise<ClassInfo> {
    try {
      const result = await parseStringPromise(xmlContent);
      const classData = result.class;

      const briefDesc = this.extractDescription(classData.brief_description);
      const fullDesc = this.extractDescription(classData.description);

      // If no description available, provide a helpful message
      let description = briefDesc || fullDesc;
      if (!description || description.trim() === '') {
        description = `${className} class in Godot ${this.godotVersion}. ` +
          `Inherits from ${classData.$.inherits || 'Object'}. ` +
          `For full documentation, visit: ${this.docsBaseUrl}classes/class_${className.toLowerCase()}.html`;
      }

      const classInfo: ClassInfo = {
        name: className,
        inherits: classData.$.inherits || '',
        description,
        methods: [],
        properties: [],
        signals: [],
        constants: [],
        examples: [],
        url: `${this.docsBaseUrl}classes/class_${className.toLowerCase()}.html`,
      };

      // Parse methods
      if (classData.methods && classData.methods[0] && classData.methods[0].method) {
        for (const method of classData.methods[0].method) {
          classInfo.methods.push(this.parseMethod(method));
        }
      }

      // Parse properties
      if (classData.members && classData.members[0] && classData.members[0].member) {
        for (const member of classData.members[0].member) {
          classInfo.properties.push(this.parseProperty(member));
        }
      }

      // Parse signals
      if (classData.signals && classData.signals[0] && classData.signals[0].signal) {
        for (const signal of classData.signals[0].signal) {
          classInfo.signals.push(this.parseSignal(signal));
        }
      }

      // Parse constants
      if (classData.constants && classData.constants[0] && classData.constants[0].constant) {
        for (const constant of classData.constants[0].constant) {
          classInfo.constants.push(this.parseConstant(constant));
        }
      }

      return classInfo;
    } catch (error) {
      this.logDebug(`Error parsing XML: ${error}`);
      throw error;
    }
  }

  /**
   * Parse method from XML
   */
  private parseMethod(methodData: any): MethodInfo {
    const method: MethodInfo = {
      name: methodData.$.name || '',
      returnType: methodData.return?.[0]?.$.type || 'void',
      description: this.extractDescription(methodData.description) || '',
      parameters: [],
      examples: [],
    };

    // Parse parameters
    if (methodData.param) {
      for (const param of methodData.param) {
        method.parameters.push({
          name: param.$.name || '',
          type: param.$.type || '',
          defaultValue: param.$.default,
        });
      }
    }

    return method;
  }

  /**
   * Parse property from XML
   */
  private parseProperty(memberData: any): PropertyInfo {
    return {
      name: memberData.$.name || '',
      type: memberData.$.type || '',
      description: this.extractDescription(memberData._) || '',
      defaultValue: memberData.$.default,
    };
  }

  /**
   * Parse signal from XML
   */
  private parseSignal(signalData: any): SignalInfo {
    const signal: SignalInfo = {
      name: signalData.$.name || '',
      description: this.extractDescription(signalData.description) || '',
      parameters: [],
    };

    // Parse parameters
    if (signalData.param) {
      for (const param of signalData.param) {
        signal.parameters.push({
          name: param.$.name || '',
          type: param.$.type || '',
        });
      }
    }

    return signal;
  }

  /**
   * Parse constant from XML
   */
  private parseConstant(constantData: any): ConstantInfo {
    return {
      name: constantData.$.name || '',
      value: constantData.$.value || '',
      description: this.extractDescription(constantData._) || '',
    };
  }

  /**
   * Extract description text from XML element
   */
  private extractDescription(element: any): string {
    if (!element) return '';
    if (typeof element === 'string') return element.trim();
    if (Array.isArray(element) && element.length > 0) {
      return this.extractDescription(element[0]);
    }
    return '';
  }

  /**
   * Get method information for a specific class and method
   */
  async getMethodInfo(className: string, methodName: string): Promise<MethodInfo | null> {
    const classInfo = await this.getClassInfo(className);
    const method = classInfo.methods.find(m => m.name === methodName);

    if (!method) {
      // Check parent class
      if (classInfo.inherits) {
        return this.getMethodInfo(classInfo.inherits, methodName);
      }
      return null;
    }

    return method;
  }

  /**
   * Search documentation
   */
  async searchDocs(query: string): Promise<SearchResult[]> {
    const cacheKey = query.toLowerCase();

    // Check cache
    if (this.searchCache.has(cacheKey)) {
      this.logDebug(`Returning cached search results for: ${query}`);
      return this.searchCache.get(cacheKey)!;
    }

    this.logDebug(`Searching documentation for: ${query}`);
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    // Search through cached classes
    for (const [className, classInfo] of this.cache.entries()) {
      // Search class name
      if (className.toLowerCase().includes(queryLower)) {
        results.push({
          type: 'class',
          className: className,
          name: className,
          description: classInfo.description,
          relevance: this.calculateRelevance(className, query),
        });
      }

      // Search methods
      for (const method of classInfo.methods) {
        if (method.name.toLowerCase().includes(queryLower)) {
          results.push({
            type: 'method',
            className: className,
            name: method.name,
            description: method.description,
            relevance: this.calculateRelevance(method.name, query),
          });
        }
      }

      // Search properties
      for (const property of classInfo.properties) {
        if (property.name.toLowerCase().includes(queryLower)) {
          results.push({
            type: 'property',
            className: className,
            name: property.name,
            description: property.description,
            relevance: this.calculateRelevance(property.name, query),
          });
        }
      }

      // Search signals
      for (const signal of classInfo.signals) {
        if (signal.name.toLowerCase().includes(queryLower)) {
          results.push({
            type: 'signal',
            className: className,
            name: signal.name,
            description: signal.description,
            relevance: this.calculateRelevance(signal.name, query),
          });
        }
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    // Cache results
    this.searchCache.set(cacheKey, results);

    return results;
  }

  /**
   * Calculate relevance score for search results
   */
  private calculateRelevance(text: string, query: string): number {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact match
    if (textLower === queryLower) return 100;

    // Starts with query
    if (textLower.startsWith(queryLower)) return 80;

    // Contains query
    if (textLower.includes(queryLower)) return 60;

    // Fuzzy match (simple implementation)
    let score = 0;
    let queryIndex = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        score += 1;
        queryIndex++;
      }
    }

    return (score / queryLower.length) * 40;
  }

  /**
   * Get best practices for a specific topic
   */
  async getBestPractices(topic: string): Promise<BestPractice[]> {
    this.logDebug(`Getting best practices for: ${topic}`);

    // Built-in best practices for common topics
    const practices = this.getBuiltInBestPractices(topic);

    return practices;
  }

  /**
   * Get built-in best practices
   */
  private getBuiltInBestPractices(topic: string): BestPractice[] {
    const topicLower = topic.toLowerCase();
    const practices: BestPractice[] = [];

    // Physics best practices
    if (topicLower.includes('physics') || topicLower.includes('collision')) {
      practices.push({
        topic: 'physics',
        title: 'Physics Best Practices in Godot 4.5+',
        description: 'Use CharacterBody2D/3D for player-controlled characters, RigidBody2D/3D for physics-simulated objects, and StaticBody2D/3D for immovable objects.',
        examples: [
          {
            title: 'CharacterBody2D Setup',
            language: 'gdscript',
            code: `extends CharacterBody2D

const SPEED = 300.0
const JUMP_VELOCITY = -400.0

func _physics_process(delta: float) -> void:
    # Add gravity
    if not is_on_floor():
        velocity += get_gravity() * delta
    
    # Handle jump
    if Input.is_action_just_pressed("ui_accept") and is_on_floor():
        velocity.y = JUMP_VELOCITY
    
    # Get input direction
    var direction := Input.get_axis("ui_left", "ui_right")
    if direction:
        velocity.x = direction * SPEED
    else:
        velocity.x = move_toward(velocity.x, 0, SPEED)
    
    move_and_slide()`,
          },
        ],
        references: [
          'https://docs.godotengine.org/en/stable/tutorials/physics/physics_introduction.html',
        ],
      });
    }

    // Signals best practices
    if (topicLower.includes('signal')) {
      practices.push({
        topic: 'signals',
        title: 'Signal Best Practices in Godot 4.5+',
        description: 'Use signals for loose coupling between nodes. Always use typed signals and Callable API in Godot 4.x.',
        examples: [
          {
            title: 'Defining and Using Signals',
            language: 'gdscript',
            code: `extends Node

# Define signal with typed parameters
signal health_changed(new_health: int, max_health: int)
signal player_died()

var health: int = 100:
    set(value):
        health = clamp(value, 0, max_health)
        health_changed.emit(health, max_health)
        if health == 0:
            player_died.emit()

var max_health: int = 100

func _ready() -> void:
    # Connect using Callable API
    health_changed.connect(_on_health_changed)
    player_died.connect(_on_player_died)

func _on_health_changed(new_health: int, max_health: int) -> void:
    print("Health: %d/%d" % [new_health, max_health])

func _on_player_died() -> void:
    print("Player died!")`,
          },
        ],
        references: [
          'https://docs.godotengine.org/en/stable/getting_started/step_by_step/signals.html',
        ],
      });
    }

    // GDScript best practices
    if (topicLower.includes('gdscript') || topicLower.includes('script')) {
      practices.push({
        topic: 'gdscript',
        title: 'GDScript 2.0 Best Practices',
        description: 'Use static typing, type annotations, and modern GDScript 2.0 features for better performance and error detection.',
        examples: [
          {
            title: 'Static Typing Example',
            language: 'gdscript',
            code: `extends Node2D

# Use type annotations for variables
var speed: float = 100.0
var direction: Vector2 = Vector2.ZERO

# Use type annotations for functions
func move_character(delta: float) -> void:
    position += direction * speed * delta

# Use typed arrays
var enemies: Array[Enemy] = []

# Use typed dictionaries (Godot 4.x)
var inventory: Dictionary = {}

# Use @export with type hints
@export var max_health: int = 100
@export var player_name: String = "Player"`,
          },
        ],
        references: [
          'https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html',
        ],
      });
    }

    // Scene organization best practices
    if (topicLower.includes('scene') || topicLower.includes('organization')) {
      practices.push({
        topic: 'scene_organization',
        title: 'Scene Organization Best Practices',
        description: 'Organize scenes hierarchically, use scene inheritance, and keep scenes focused on single responsibilities.',
        examples: [
          {
            title: 'Scene Structure Example',
            language: 'text',
            code: `Game/
├── Scenes/
│   ├── Characters/
│   │   ├── Player.tscn
│   │   └── Enemy.tscn
│   ├── Levels/
│   │   ├── Level1.tscn
│   │   └── Level2.tscn
│   └── UI/
│       ├── MainMenu.tscn
│       └── HUD.tscn
├── Scripts/
│   ├── Characters/
│   └── Managers/
└── Assets/
    ├── Textures/
    ├── Audio/
    └── Models/`,
          },
        ],
        references: [
          'https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html',
        ],
      });
    }

    return practices;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
    this.searchCache.clear();
    this.logDebug('All caches cleared');
  }

  /**
   * Get Godot 4.5+ specific features
   */
  getGodot45Features(): string[] {
    return [
      'Compositor Effects System',
      'Enhanced SDFGI (Signed Distance Field Global Illumination)',
      'Improved Physics Material with absorbent property',
      'Better Heightmap Support with deep parallax',
      'Enhanced Animation System',
      'Improved GDScript Parser with better error reporting',
      'Better UID Management for resources',
      'Enhanced 3D Rendering with modern techniques',
      'GPUParticles improvements',
      'Better shader compilation',
    ];
  }

  /**
   * Get deprecated features and their replacements
   */
  getDeprecatedFeatures(): Map<string, string> {
    return new Map([
      ['KinematicBody2D', 'CharacterBody2D'],
      ['KinematicBody3D', 'CharacterBody3D'],
      ['Particles2D', 'GPUParticles2D'],
      ['Particles3D', 'GPUParticles3D'],
      ['YSort', 'Use y_sort_enabled property on Node2D'],
      ['VisibilityNotifier', 'VisibleOnScreenNotifier2D/3D'],
      ['StreamTexture', 'CompressedTexture2D'],
    ]);
  }
}
