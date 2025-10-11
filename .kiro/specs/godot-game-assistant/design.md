# Design Document

## Overview

Этот документ описывает архитектурный дизайн для расширения Godot MCP сервера до полноценного помощника для создания игр. Дизайн основан на существующей архитектуре с bundled GDScript подходом и расширяет её для поддержки всех требований.

### Целевая версия: Godot 4.5+

Дизайн ориентирован на Godot 4.5 и выше, используя современные API и возможности:
- **UID System**: Полная поддержка системы уникальных идентификаторов ресурсов (введена в 4.4, стабилизирована в 4.5)
- **Enhanced GDScript**: Использование улучшенного GDScript 2.0 с типизацией и новыми возможностями
- **Modern Node Types**: Поддержка всех современных типов узлов (CharacterBody3D, GPUParticles3D, etc.)
- **Compositor Effects**: Поддержка новой системы композитных эффектов
- **Improved Physics**: Использование улучшенного физического движка Godot 4.5+

### Ключевые принципы дизайна

1. **Модульность**: Каждая функциональная область (сцены, скрипты, физика и т.д.) реализуется как отдельный модуль
2. **Расширяемость**: Архитектура позволяет легко добавлять новые операции без изменения core логики
3. **Безопасность**: Все операции валидируются и санитизируются перед выполнением
4. **Современность**: Использование только Godot 4.5+ API без legacy поддержки
5. **Документация**: Интеграция с официальной документацией Godot 4.5+ для контекстной помощи

## Architecture

### High-Level Architecture

```mermaid
graph TB
    AI[AI Assistant] -->|MCP Protocol| Server[MCP Server]
    Server -->|Tool Calls| Router[Operation Router]
    Router -->|Scene Ops| SceneModule[Scene Module]
    Router -->|Script Ops| ScriptModule[Script Module]
    Router -->|Resource Ops| ResourceModule[Resource Module]
    Router -->|Physics Ops| PhysicsModule[Physics Module]
    Router -->|UI Ops| UIModule[UI Module]
    Router -->|Animation Ops| AnimationModule[Animation Module]
    Router -->|Audio Ops| AudioModule[Audio Module]
    Router -->|Debug Ops| DebugModule[Debug Module]
    Router -->|Project Ops| ProjectModule[Project Module]
    Router -->|3D Ops| ThreeDModule[3D Module]
    Router -->|Doc Ops| DocModule[Documentation Module]
    
    SceneModule -->|Execute| GodotOps[Godot Operations Script]
    ScriptModule -->|Execute| GodotOps
    ResourceModule -->|Execute| GodotOps
    PhysicsModule -->|Execute| GodotOps
    UIModule -->|Execute| GodotOps
    AnimationModule -->|Execute| GodotOps
    AudioModule -->|Execute| GodotOps
    DebugModule -->|Execute| GodotOps
    ProjectModule -->|Execute| GodotOps
    ThreeDModule -->|Execute| GodotOps
    
    GodotOps -->|Headless Mode| Godot[Godot Engine]
    DocModule -->|Query| DocCache[Documentation Cache]
    DocCache -->|Fetch| GodotDocs[Godot Docs API]
```

### Component Architecture

#### 1. MCP Server Layer (TypeScript)

**Существующие компоненты:**
- `GodotServer` - основной класс сервера
- `executeOperation()` - выполнение операций через Godot
- `detectGodotPath()` - определение пути к Godot
- Parameter normalization - конвертация snake_case ↔ camelCase

**Новые компоненты:**
- `OperationRegistry` - реестр всех доступных операций
- `ValidationLayer` - валидация параметров перед выполнением
- `CacheManager` - кэширование результатов и документации
- `VersionManager` - управление совместимостью версий Godot

#### 2. Godot Operations Script Layer (GDScript)

**Существующие операции:**
- `create_scene` - создание сцен
- `add_node` - добавление узлов
- `load_sprite` - загрузка спрайтов
- `export_mesh_library` - экспорт MeshLibrary
- `save_scene` - сохранение сцен
- `get_uid` - получение UID
- `resave_resources` - пересохранение ресурсов

**Новые операции (будут добавлены):**
- Scene operations: `remove_node`, `modify_node`, `duplicate_node`, `query_node`
- Script operations: `create_script`, `attach_script`, `validate_script`, `get_node_methods`
- Resource operations: `import_asset`, `create_resource`, `list_assets`, `configure_import`
- Signal operations: `create_signal`, `connect_signal`, `list_signals`, `disconnect_signal`
- Physics operations: `add_physics_body`, `configure_physics`, `setup_collision_layers`
- UI operations: `create_ui_element`, `apply_theme`, `setup_layout`
- Animation operations: `create_animation_player`, `add_keyframes`, `setup_animation_tree`
- Audio operations: `add_audio_player`, `configure_audio_bus`, `setup_3d_audio`
- Project operations: `update_project_settings`, `configure_input_map`, `setup_autoload`
- 3D operations: `create_3d_scene`, `import_3d_model`, `setup_materials`, `configure_environment`

## Components and Interfaces

### 1. Scene Management Module

#### Interface
```typescript
interface SceneOperations {
  createScene(params: CreateSceneParams): Promise<SceneResult>;
  addNode(params: AddNodeParams): Promise<NodeResult>;
  removeNode(params: RemoveNodeParams): Promise<OperationResult>;
  modifyNode(params: ModifyNodeParams): Promise<NodeResult>;
  duplicateNode(params: DuplicateNodeParams): Promise<NodeResult>;
  queryNode(params: QueryNodeParams): Promise<NodeInfo>;
}

interface CreateSceneParams {
  projectPath: string;
  scenePath: string;
  rootNodeType: string;
  template?: string; // Предустановленные шаблоны (2D platformer, 3D FPS, etc.)
}

interface ModifyNodeParams {
  projectPath: string;
  scenePath: string;
  nodePath: string;
  properties: Record<string, any>;
  transform?: Transform2D | Transform3D;
}
```

#### GDScript Implementation (Godot 4.5+)
```gdscript
func modify_node(params: Dictionary) -> Dictionary:
    # Load scene with UID support
    var scene_path := params.scene_path as String
    var scene: PackedScene = load(scene_path)
    if not scene:
        return create_error("Failed to load scene")
    
    var scene_root: Node = scene.instantiate()
    var node: Node = get_node_by_path(scene_root, params.node_path)
    
    if not node:
        return create_error("Node not found: " + params.node_path)
    
    # Apply properties with type checking (GDScript 2.0)
    var properties := params.properties as Dictionary
    for property in properties:
        if property in node:
            node.set(property, properties[property])
        else:
            push_warning("Property not found: " + property)
    
    # Apply transform if provided (using modern Transform2D/Transform3D)
    if params.has("transform"):
        apply_transform(node, params.transform)
    
    # Save with UID preservation
    var packed_scene := PackedScene.new()
    packed_scene.pack(scene_root)
    var error := ResourceSaver.save(packed_scene, scene_path)
    
    return {"success": error == OK, "node_path": params.node_path}
```

### 2. Script Management Module

#### Interface
```typescript
interface ScriptOperations {
  createScript(params: CreateScriptParams): Promise<ScriptResult>;
  attachScript(params: AttachScriptParams): Promise<OperationResult>;
  validateScript(params: ValidateScriptParams): Promise<ValidationResult>;
  getNodeMethods(params: GetMethodsParams): Promise<MethodInfo[]>;
}

interface CreateScriptParams {
  projectPath: string;
  scriptPath: string;
  template: 'node' | 'resource' | 'custom';
  baseClass?: string;
  signals?: string[];
  exports?: ExportVariable[];
}

interface ValidationResult {
  valid: boolean;
  errors: ScriptError[];
  warnings: ScriptWarning[];
}

interface ScriptError {
  line: number;
  column: number;
  message: string;
  type: 'syntax' | 'semantic' | 'runtime';
}
```

#### GDScript Implementation (Godot 4.5+)
```gdscript
func create_script(params: Dictionary) -> Dictionary:
    var script_content := generate_script_template(params)
    var script_path := params.script_path as String
    
    # Use modern FileAccess API (Godot 4.x)
    var file := FileAccess.open(script_path, FileAccess.WRITE)
    if not file:
        return create_error("Cannot create file: " + FileAccess.get_open_error())
    
    file.store_string(script_content)
    file.close()
    
    # Validate using GDScript parser (Godot 4.5+)
    var validation := validate_script_syntax(script_path)
    return validation

func validate_script(params: Dictionary) -> Dictionary:
    var script_path := params.script_path as String
    var script := load(script_path) as GDScript
    
    if not script:
        return {
            "valid": false, 
            "errors": [{"message": "Failed to load script", "line": 0}]
        }
    
    # Use GDScript parser for detailed error reporting (Godot 4.5+)
    var parser := GDScriptParser.new()
    var parse_result := parser.parse(script.source_code)
    
    var errors: Array[Dictionary] = []
    if parse_result != OK:
        for error in parser.get_errors():
            errors.append({
                "line": error.line,
                "column": error.column,
                "message": error.message,
                "type": "syntax"
            })
    
    return {
        "valid": errors.is_empty(), 
        "errors": errors,
        "warnings": parser.get_warnings()
    }
```

### 3. Resource Management Module

#### Interface
```typescript
interface ResourceOperations {
  importAsset(params: ImportAssetParams): Promise<ImportResult>;
  createResource(params: CreateResourceParams): Promise<ResourceResult>;
  listAssets(params: ListAssetsParams): Promise<AssetInfo[]>;
  configureImport(params: ConfigureImportParams): Promise<OperationResult>;
}

interface ImportAssetParams {
  projectPath: string;
  assetPath: string;
  importSettings?: {
    type: 'texture' | 'audio' | 'model' | 'font';
    compression?: string;
    mipmaps?: boolean;
    filter?: boolean;
  };
}

interface AssetInfo {
  path: string;
  type: string;
  size: number;
  dependencies: string[];
  uid?: string;
}
```

### 4. Signal System Module

#### Interface
```typescript
interface SignalOperations {
  createSignal(params: CreateSignalParams): Promise<OperationResult>;
  connectSignal(params: ConnectSignalParams): Promise<OperationResult>;
  listSignals(params: ListSignalsParams): Promise<SignalInfo[]>;
  disconnectSignal(params: DisconnectSignalParams): Promise<OperationResult>;
}

interface ConnectSignalParams {
  projectPath: string;
  scenePath: string;
  sourceNodePath: string;
  signalName: string;
  targetNodePath: string;
  methodName: string;
  binds?: any[];
  flags?: number;
}

interface SignalInfo {
  name: string;
  parameters: ParameterInfo[];
  connections: ConnectionInfo[];
}
```

#### GDScript Implementation (Godot 4.5+)
```gdscript
func connect_signal(params: Dictionary) -> Dictionary:
    var scene_path := params.scene_path as String
    var scene: PackedScene = load(scene_path)
    var scene_root := scene.instantiate()
    
    var source := get_node_by_path(scene_root, params.source_node_path)
    var target := get_node_by_path(scene_root, params.target_node_path)
    
    if not source or not target:
        return create_error("Node not found")
    
    # Validate signal exists (Godot 4.5+ API)
    var signal_name := params.signal_name as StringName
    if not source.has_signal(signal_name):
        return create_error("Signal not found: " + signal_name)
    
    # Validate method exists
    var method_name := params.method_name as StringName
    if not target.has_method(method_name):
        return create_error("Method not found: " + method_name)
    
    # Get signal info for validation (Godot 4.5+)
    var signal_list := source.get_signal_list()
    var signal_info: Dictionary
    for sig in signal_list:
        if sig.name == signal_name:
            signal_info = sig
            break
    
    # Validate method signature matches signal
    var method_list := target.get_method_list()
    var method_info: Dictionary
    for method in method_list:
        if method.name == method_name:
            method_info = method
            break
    
    # Connect using modern Callable API (Godot 4.x)
    var callable := Callable(target, method_name)
    var flags := params.get("flags", 0) as int
    
    if params.has("binds"):
        var binds := params.binds as Array
        callable = callable.bindv(binds)
    
    var error := source.connect(signal_name, callable, flags)
    if error != OK:
        return create_error("Failed to connect signal: " + str(error))
    
    # Save scene with connection metadata
    var packed_scene := PackedScene.new()
    packed_scene.pack(scene_root)
    ResourceSaver.save(packed_scene, scene_path)
    
    return {"success": true, "connection": signal_name + " -> " + method_name}
```

### 5. Physics Module (Godot 4.5+ Physics)

#### Interface
```typescript
interface PhysicsOperations {
  addPhysicsBody(params: AddPhysicsBodyParams): Promise<NodeResult>;
  configurePhysics(params: ConfigurePhysicsParams): Promise<OperationResult>;
  setupCollisionLayers(params: CollisionLayersParams): Promise<OperationResult>;
}

interface AddPhysicsBodyParams {
  projectPath: string;
  scenePath: string;
  parentNodePath: string;
  // Godot 4.5+ physics body types
  bodyType: 'CharacterBody2D' | 'RigidBody2D' | 'StaticBody2D' | 'AnimatableBody2D' |
            'CharacterBody3D' | 'RigidBody3D' | 'StaticBody3D' | 'AnimatableBody3D';
  collisionShape: {
    // Godot 4.5+ shape types
    type: 'RectangleShape2D' | 'CircleShape2D' | 'CapsuleShape2D' | 'ConvexPolygonShape2D' |
          'BoxShape3D' | 'SphereShape3D' | 'CapsuleShape3D' | 'CylinderShape3D' | 'ConvexPolygonShape3D';
    size?: Vector2 | Vector3;
    radius?: number;
    height?: number;
  };
  physicsProperties?: {
    // RigidBody specific (Godot 4.5+)
    mass?: number;
    physics_material?: {
      friction?: number;
      bounce?: number;
      absorbent?: boolean; // New in Godot 4.5+
    };
    gravity_scale?: number;
    linear_damp?: number;
    angular_damp?: number;
    // CharacterBody specific
    motion_mode?: 'MOTION_MODE_GROUNDED' | 'MOTION_MODE_FLOATING';
    platform_on_leave?: 'PLATFORM_ON_LEAVE_ADD_VELOCITY' | 'PLATFORM_ON_LEAVE_ADD_UPWARD_VELOCITY' | 'PLATFORM_ON_LEAVE_DO_NOTHING';
  };
}
```

#### GDScript Implementation (Godot 4.5+)
```gdscript
func add_physics_body(params: Dictionary) -> Dictionary:
    var scene: PackedScene = load(params.scene_path)
    var scene_root := scene.instantiate()
    var parent := get_node_by_path(scene_root, params.parent_node_path)
    
    # Create physics body using Godot 4.5+ API
    var body_type := params.body_type as String
    var body: PhysicsBody2D = ClassDB.instantiate(body_type)
    body.name = params.get("name", body_type)
    
    # Create collision shape
    var collision_shape: CollisionShape2D = CollisionShape2D.new()
    collision_shape.name = "CollisionShape"
    
    # Create shape resource (Godot 4.5+ shapes)
    var shape_type := params.collision_shape.type as String
    var shape: Shape2D = ClassDB.instantiate(shape_type)
    
    # Configure shape based on type
    match shape_type:
        "RectangleShape2D":
            shape.size = params.collision_shape.get("size", Vector2(32, 32))
        "CircleShape2D":
            shape.radius = params.collision_shape.get("radius", 16.0)
        "CapsuleShape2D":
            shape.radius = params.collision_shape.get("radius", 16.0)
            shape.height = params.collision_shape.get("height", 32.0)
    
    collision_shape.shape = shape
    body.add_child(collision_shape)
    collision_shape.owner = scene_root
    
    # Configure physics properties (Godot 4.5+)
    if params.has("physics_properties"):
        var props := params.physics_properties as Dictionary
        
        if body is RigidBody2D:
            if props.has("mass"):
                body.mass = props.mass
            if props.has("gravity_scale"):
                body.gravity_scale = props.gravity_scale
            if props.has("linear_damp"):
                body.linear_damp = props.linear_damp
            if props.has("angular_damp"):
                body.angular_damp = props.angular_damp
            
            # Physics material (Godot 4.5+)
            if props.has("physics_material"):
                var mat := PhysicsMaterial.new()
                var mat_props := props.physics_material as Dictionary
                mat.friction = mat_props.get("friction", 1.0)
                mat.bounce = mat_props.get("bounce", 0.0)
                mat.absorbent = mat_props.get("absorbent", false)
                body.physics_material_override = mat
        
        elif body is CharacterBody2D:
            if props.has("motion_mode"):
                body.motion_mode = CharacterBody2D[props.motion_mode]
            if props.has("platform_on_leave"):
                body.platform_on_leave = CharacterBody2D[props.platform_on_leave]
    
    parent.add_child(body)
    body.owner = scene_root
    
    # Save scene
    var packed_scene := PackedScene.new()
    packed_scene.pack(scene_root)
    ResourceSaver.save(packed_scene, params.scene_path)
    
    return {"success": true, "body_path": parent.get_path_to(body)}
```

### 6. UI Module

#### Interface
```typescript
interface UIOperations {
  createUIElement(params: CreateUIElementParams): Promise<NodeResult>;
  applyTheme(params: ApplyThemeParams): Promise<OperationResult>;
  setupLayout(params: SetupLayoutParams): Promise<OperationResult>;
}

interface CreateUIElementParams {
  projectPath: string;
  scenePath: string;
  parentNodePath: string;
  elementType: 'Button' | 'Label' | 'TextEdit' | 'Panel' | 'Container';
  properties: {
    text?: string;
    size?: Vector2;
    anchors?: {
      left?: number;
      top?: number;
      right?: number;
      bottom?: number;
    };
  };
}
```

### 7. Animation Module

#### Interface
```typescript
interface AnimationOperations {
  createAnimationPlayer(params: CreateAnimationPlayerParams): Promise<NodeResult>;
  addKeyframes(params: AddKeyframesParams): Promise<OperationResult>;
  setupAnimationTree(params: SetupAnimationTreeParams): Promise<OperationResult>;
}

interface AddKeyframesParams {
  projectPath: string;
  scenePath: string;
  animationPlayerPath: string;
  animationName: string;
  track: {
    nodePath: string;
    property: string;
    keyframes: Array<{
      time: number;
      value: any;
      transition?: number;
    }>;
  };
}
```

### 8. Audio Module

#### Interface
```typescript
interface AudioOperations {
  addAudioPlayer(params: AddAudioPlayerParams): Promise<NodeResult>;
  configureAudioBus(params: ConfigureAudioBusParams): Promise<OperationResult>;
  setup3DAudio(params: Setup3DAudioParams): Promise<NodeResult>;
}

interface AddAudioPlayerParams {
  projectPath: string;
  scenePath: string;
  parentNodePath: string;
  playerType: 'AudioStreamPlayer' | 'AudioStreamPlayer2D' | 'AudioStreamPlayer3D';
  audioPath: string;
  autoplay?: boolean;
  volume?: number;
  bus?: string;
}
```

### 9. Debug Module

#### Interface
```typescript
interface DebugOperations {
  runWithDebug(params: RunDebugParams): Promise<DebugSession>;
  setBreakpoint(params: SetBreakpointParams): Promise<OperationResult>;
  getVariables(params: GetVariablesParams): Promise<VariableInfo[]>;
  profilePerformance(params: ProfileParams): Promise<ProfileResult>;
}

interface DebugSession {
  sessionId: string;
  output: string[];
  errors: ErrorInfo[];
  performance: PerformanceMetrics;
}

interface ErrorInfo {
  message: string;
  stack: StackFrame[];
  script: string;
  line: number;
}
```

### 10. Documentation Module

#### Interface
```typescript
interface DocumentationOperations {
  getClassInfo(className: string): Promise<ClassInfo>;
  getMethodInfo(className: string, methodName: string): Promise<MethodInfo>;
  searchDocs(query: string): Promise<SearchResult[]>;
  getBestPractices(topic: string): Promise<BestPractice[]>;
}

interface ClassInfo {
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
```

#### Implementation Strategy (Godot 4.5+ Documentation)
```typescript
class DocumentationModule {
  private cache: Map<string, ClassInfo>;
  private godotVersion = '4.5';
  private docsBaseUrl = 'https://docs.godotengine.org/en/4.5/';
  
  async getClassInfo(className: string): Promise<ClassInfo> {
    // Check cache first
    if (this.cache.has(className)) {
      return this.cache.get(className)!;
    }
    
    // Fetch from Godot 4.5+ docs
    const info = await this.fetchClassInfo(className);
    this.cache.set(className, info);
    return info;
  }
  
  private async fetchClassInfo(className: string): Promise<ClassInfo> {
    // Option 1: Use Godot 4.5+ built-in --doctool to generate XML
    // godot --doctool <path> --gdscript-docs <path>
    const { stdout } = await execAsync(
      `"${this.godotPath}" --doctool ./docs --gdscript-docs ./docs`
    );
    
    // Parse XML documentation for Godot 4.5+
    const xmlPath = `./docs/classes/${className}.xml`;
    const classInfo = await this.parseClassXML(xmlPath);
    
    // Option 2: Fetch from online Godot 4.5+ documentation
    const url = `${this.docsBaseUrl}classes/class_${className.toLowerCase()}.html`;
    
    // Option 3: Use Godot 4.5+ API reference JSON
    // Available at: https://docs.godotengine.org/en/4.5/_static/api.json
    
    return classInfo;
  }
  
  async getGodot45Features(): Promise<string[]> {
    // Return list of new features in Godot 4.5+
    return [
      'Compositor Effects System',
      'Enhanced SDFGI',
      'Improved Physics Material',
      'Better Heightmap Support',
      'Enhanced Animation System',
      'Improved GDScript Parser',
      'Better UID Management',
      'Enhanced 3D Rendering'
    ];
  }
  
  async getDeprecatedFeatures(): Promise<Map<string, string>> {
    // Map of deprecated features and their replacements in Godot 4.5+
    return new Map([
      ['KinematicBody2D', 'CharacterBody2D'],
      ['KinematicBody3D', 'CharacterBody3D'],
      ['Particles2D', 'GPUParticles2D'],
      ['Particles3D', 'GPUParticles3D'],
      ['YSort', 'Use y_sort_enabled property on Node2D'],
    ]);
  }
}
```

### 11. Project Management Module

#### Interface
```typescript
interface ProjectOperations {
  updateProjectSettings(params: UpdateSettingsParams): Promise<OperationResult>;
  configureInputMap(params: ConfigureInputParams): Promise<OperationResult>;
  setupAutoload(params: SetupAutoloadParams): Promise<OperationResult>;
  managePlugins(params: ManagePluginsParams): Promise<PluginInfo[]>;
}

interface ConfigureInputParams {
  projectPath: string;
  actions: Array<{
    name: string;
    deadzone?: number;
    events: Array<{
      type: 'key' | 'mouse' | 'joypad';
      keycode?: string;
      button?: number;
      axis?: number;
    }>;
  }>;
}
```

### 12. 3D Module (Godot 4.5+ 3D Features)

#### Interface
```typescript
interface ThreeDOperations {
  create3DScene(params: Create3DSceneParams): Promise<SceneResult>;
  import3DModel(params: Import3DModelParams): Promise<NodeResult>;
  setupMaterials(params: SetupMaterialsParams): Promise<OperationResult>;
  configureEnvironment(params: ConfigureEnvironmentParams): Promise<OperationResult>;
  setupCompositor(params: SetupCompositorParams): Promise<OperationResult>; // New in Godot 4.5+
}

interface Create3DSceneParams {
  projectPath: string;
  scenePath: string;
  template: 'basic' | 'fps' | 'third_person' | 'custom';
  includeCamera?: boolean;
  includeLighting?: boolean;
  includeEnvironment?: boolean;
  // Godot 4.5+ rendering features
  renderingMethod?: 'forward_plus' | 'mobile' | 'gl_compatibility';
  useCompositor?: boolean; // New compositor system in Godot 4.5+
}

interface SetupMaterialsParams {
  projectPath: string;
  scenePath: string;
  nodePath: string;
  material: {
    type: 'StandardMaterial3D' | 'ORMMaterial3D' | 'ShaderMaterial';
    // Godot 4.5+ material properties
    albedo?: {
      color?: Color;
      texture?: string;
    };
    metallic?: number;
    roughness?: number;
    emission?: {
      enabled?: boolean;
      color?: Color;
      energy?: number;
      texture?: string;
    };
    normal?: {
      enabled?: boolean;
      texture?: string;
      scale?: number;
    };
    // New in Godot 4.5+
    heightmap?: {
      enabled?: boolean;
      texture?: string;
      scale?: number;
      deep_parallax?: boolean;
    };
  };
}

interface SetupCompositorParams {
  projectPath: string;
  effects: Array<{
    type: 'bloom' | 'dof' | 'ssao' | 'ssr' | 'fog' | 'custom';
    enabled: boolean;
    parameters?: Record<string, any>;
  }>;
}
```

#### GDScript Implementation (Godot 4.5+)
```gdscript
func create_3d_scene(params: Dictionary) -> Dictionary:
    var scene_root := Node3D.new()
    scene_root.name = "Root"
    
    # Add Camera3D with modern settings (Godot 4.5+)
    if params.get("include_camera", true):
        var camera := Camera3D.new()
        camera.name = "Camera"
        camera.position = Vector3(0, 2, 5)
        camera.look_at(Vector3.ZERO)
        
        # Set rendering method (Godot 4.5+)
        var rendering_method := params.get("rendering_method", "forward_plus")
        # This is set in project settings, but we can configure camera-specific settings
        
        scene_root.add_child(camera)
        camera.owner = scene_root
    
    # Add DirectionalLight3D with modern shadow settings (Godot 4.5+)
    if params.get("include_lighting", true):
        var light := DirectionalLight3D.new()
        light.name = "DirectionalLight"
        light.rotation_degrees = Vector3(-45, 45, 0)
        
        # Modern shadow settings (Godot 4.5+)
        light.shadow_enabled = true
        light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
        light.directional_shadow_max_distance = 100.0
        
        scene_root.add_child(light)
        light.owner = scene_root
    
    # Add WorldEnvironment with modern features (Godot 4.5+)
    if params.get("include_environment", true):
        var world_env := WorldEnvironment.new()
        world_env.name = "WorldEnvironment"
        
        var environment := Environment.new()
        
        # Sky setup (Godot 4.5+)
        var sky := Sky.new()
        var sky_material := ProceduralSkyMaterial.new()
        sky_material.sky_top_color = Color(0.385, 0.454, 0.55)
        sky_material.sky_horizon_color = Color(0.646, 0.656, 0.67)
        sky_material.ground_bottom_color = Color(0.2, 0.169, 0.133)
        sky_material.ground_horizon_color = Color(0.646, 0.656, 0.67)
        sky.sky_material = sky_material
        environment.sky = sky
        environment.background_mode = Environment.BG_SKY
        
        # Modern ambient light (Godot 4.5+)
        environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
        environment.ambient_light_energy = 1.0
        
        # SDFGI for global illumination (Godot 4.5+)
        environment.sdfgi_enabled = true
        environment.sdfgi_use_occlusion = true
        
        # Glow/Bloom (Godot 4.5+)
        environment.glow_enabled = true
        environment.glow_levels = 7
        environment.glow_intensity = 0.8
        environment.glow_strength = 1.0
        environment.glow_bloom = 0.0
        
        # SSAO (Godot 4.5+)
        environment.ssao_enabled = true
        environment.ssao_radius = 1.0
        environment.ssao_intensity = 2.0
        
        # SSR (Godot 4.5+)
        environment.ssr_enabled = true
        environment.ssr_max_steps = 64
        
        world_env.environment = environment
        scene_root.add_child(world_env)
        world_env.owner = scene_root
    
    # Setup compositor if requested (New in Godot 4.5+)
    if params.get("use_compositor", false):
        setup_compositor_effects(scene_root, params)
    
    # Save scene
    var packed_scene := PackedScene.new()
    packed_scene.pack(scene_root)
    var error := ResourceSaver.save(packed_scene, params.scene_path)
    
    return {"success": error == OK, "scene_path": params.scene_path}

func setup_materials(params: Dictionary) -> Dictionary:
    var scene: PackedScene = load(params.scene_path)
    var scene_root := scene.instantiate()
    var node := get_node_by_path(scene_root, params.node_path)
    
    if not node is MeshInstance3D:
        return create_error("Node is not a MeshInstance3D")
    
    var mesh_instance := node as MeshInstance3D
    var material_params := params.material as Dictionary
    var material_type := material_params.get("type", "StandardMaterial3D")
    
    var material: Material
    
    if material_type == "StandardMaterial3D":
        var std_mat := StandardMaterial3D.new()
        
        # Albedo (Godot 4.5+)
        if material_params.has("albedo"):
            var albedo := material_params.albedo as Dictionary
            if albedo.has("color"):
                std_mat.albedo_color = albedo.color
            if albedo.has("texture"):
                std_mat.albedo_texture = load(albedo.texture)
        
        # PBR properties (Godot 4.5+)
        if material_params.has("metallic"):
            std_mat.metallic = material_params.metallic
        if material_params.has("roughness"):
            std_mat.roughness = material_params.roughness
        
        # Emission (Godot 4.5+)
        if material_params.has("emission"):
            var emission := material_params.emission as Dictionary
            std_mat.emission_enabled = emission.get("enabled", false)
            if emission.has("color"):
                std_mat.emission = emission.color
            if emission.has("energy"):
                std_mat.emission_energy_multiplier = emission.energy
            if emission.has("texture"):
                std_mat.emission_texture = load(emission.texture)
        
        # Normal mapping (Godot 4.5+)
        if material_params.has("normal"):
            var normal := material_params.normal as Dictionary
            std_mat.normal_enabled = normal.get("enabled", false)
            if normal.has("texture"):
                std_mat.normal_texture = load(normal.texture)
            if normal.has("scale"):
                std_mat.normal_scale = normal.scale
        
        # Heightmap/Parallax (New in Godot 4.5+)
        if material_params.has("heightmap"):
            var heightmap := material_params.heightmap as Dictionary
            std_mat.heightmap_enabled = heightmap.get("enabled", false)
            if heightmap.has("texture"):
                std_mat.heightmap_texture = load(heightmap.texture)
            if heightmap.has("scale"):
                std_mat.heightmap_scale = heightmap.scale
            if heightmap.has("deep_parallax"):
                std_mat.heightmap_deep_parallax = heightmap.deep_parallax
        
        material = std_mat
    
    mesh_instance.material_override = material
    
    # Save scene
    var packed_scene := PackedScene.new()
    packed_scene.pack(scene_root)
    ResourceSaver.save(packed_scene, params.scene_path)
    
    return {"success": true, "material_type": material_type}
```

## Data Models

### Core Data Structures

```typescript
// Node representation
interface NodeData {
  name: string;
  type: string;
  properties: Record<string, any>;
  script?: string;
  children: NodeData[];
  signals: SignalConnection[];
}

// Scene representation
interface SceneData {
  path: string;
  root: NodeData;
  resources: ResourceReference[];
  externalScenes: string[];
}

// Project representation
interface ProjectData {
  path: string;
  name: string;
  version: string;
  godotVersion: string;
  settings: ProjectSettings;
  scenes: string[];
  scripts: string[];
  resources: string[];
}
```

## Error Handling

### Error Categories

1. **Validation Errors**: Неправильные параметры, несуществующие пути
2. **Godot Errors**: Ошибки выполнения в Godot Engine
3. **File System Errors**: Проблемы с доступом к файлам
4. **Version Compatibility Errors**: Несовместимость версий Godot

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    suggestions: string[];
    documentationUrl?: string;
  };
}
```

### Error Handling Strategy

```typescript
class ErrorHandler {
  handleError(error: Error, context: OperationContext): ErrorResponse {
    // Categorize error
    const category = this.categorizeError(error);
    
    // Get suggestions from documentation
    const suggestions = this.getSuggestions(category, context);
    
    // Find relevant documentation
    const docUrl = this.findDocumentation(category, context);
    
    return {
      success: false,
      error: {
        code: category,
        message: error.message,
        suggestions,
        documentationUrl: docUrl
      }
    };
  }
}
```

## Testing Strategy

### Unit Tests
- Тестирование каждого модуля изолированно
- Мокирование Godot операций
- Валидация параметров

### Integration Tests
- Тестирование взаимодействия модулей
- Реальные операции с тестовым Godot проектом
- Проверка корректности создаваемых файлов

### End-to-End Tests
- Полные сценарии использования
- Создание простой игры через MCP
- Проверка всех операций в связке

### Test Project Structure
```
tests/
├── fixtures/
│   ├── test_project/
│   │   ├── project.godot
│   │   └── scenes/
│   └── expected_outputs/
├── unit/
│   ├── scene.test.ts
│   ├── script.test.ts
│   └── ...
├── integration/
│   ├── scene_script.test.ts
│   └── ...
└── e2e/
    ├── create_platformer.test.ts
    └── ...
```

## Performance Considerations

### Caching Strategy
1. **Documentation Cache**: Кэширование информации о классах Godot
2. **Project Structure Cache**: Кэширование структуры проекта
3. **Validation Cache**: Кэширование результатов валидации

### Optimization Techniques
1. **Batch Operations**: Группировка множественных операций
2. **Lazy Loading**: Загрузка документации по требованию
3. **Parallel Execution**: Параллельное выполнение независимых операций

### Resource Management
```typescript
class ResourceManager {
  private activeProcesses: Map<string, GodotProcess>;
  private maxConcurrentProcesses = 3;
  
  async executeOperation(operation: Operation): Promise<Result> {
    // Wait if too many processes
    await this.waitForSlot();
    
    // Execute operation
    const result = await this.execute(operation);
    
    // Release slot
    this.releaseSlot();
    
    return result;
  }
}
```

## Security Considerations

### Input Validation
- Валидация всех путей на path traversal
- Санитизация параметров скриптов
- Проверка размеров файлов

### Sandboxing
- Выполнение Godot в headless режиме
- Ограничение доступа к файловой системе
- Таймауты для операций

### Code Injection Prevention
```typescript
class SecurityValidator {
  validateScriptContent(content: string): ValidationResult {
    // Check for dangerous patterns
    const dangerousPatterns = [
      /OS\.execute/,
      /OS\.shell_open/,
      /FileAccess\.open.*\/\.\./,
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        return {
          valid: false,
          error: 'Potentially dangerous code detected'
        };
      }
    }
    
    return { valid: true };
  }
}
```

## Deployment and Configuration

### Configuration File
```json
{
  "godot": {
    "path": "/path/to/godot",
    "version": "4.5",
    "minVersion": "4.5.0",
    "headless": true,
    "features": {
      "uidSystem": true,
      "compositor": true,
      "modernPhysics": true
    }
  },
  "cache": {
    "enabled": true,
    "ttl": 3600,
    "maxSize": "100MB"
  },
  "documentation": {
    "source": "https://docs.godotengine.org/en/4.5/",
    "updateInterval": "weekly",
    "version": "4.5"
  },
  "security": {
    "validateScripts": true,
    "maxFileSize": "10MB",
    "allowedOperations": ["all"]
  }
}
```

### Environment Variables
- `GODOT_PATH`: Путь к Godot 4.5+ executable
- `GODOT_VERSION`: Версия Godot (минимум 4.5.0)
- `MCP_CACHE_DIR`: Директория для кэша
- `MCP_DEBUG`: Режим отладки
- `GODOT_DOCS_PATH`: Путь к локальной документации Godot 4.5+

### Version Validation
```typescript
class VersionValidator {
  private minVersion = [4, 5, 0];
  
  async validateGodotVersion(godotPath: string): Promise<boolean> {
    const { stdout } = await execAsync(`"${godotPath}" --version`);
    const version = this.parseVersion(stdout);
    
    if (!this.isVersionCompatible(version)) {
      throw new Error(
        `Godot version ${version.join('.')} is not supported. ` +
        `Minimum required version is ${this.minVersion.join('.')}`
      );
    }
    
    return true;
  }
  
  private isVersionCompatible(version: number[]): boolean {
    for (let i = 0; i < this.minVersion.length; i++) {
      if (version[i] > this.minVersion[i]) return true;
      if (version[i] < this.minVersion[i]) return false;
    }
    return true;
  }
}
```

## Godot 4.5+ Specific Features

### Key Differences from Earlier Versions

#### 1. UID System (Stabilized in 4.5+)
- Все ресурсы имеют уникальные идентификаторы
- Автоматическое обновление ссылок при перемещении файлов
- Поддержка в MCP через операции `get_uid` и `update_project_uids`

#### 2. Modern GDScript 2.0
```gdscript
# Typed variables and functions
func process_node(node: Node3D) -> Dictionary:
    var result: Dictionary = {}
    var position: Vector3 = node.global_position
    return result

# Lambda functions
var callback := func(x: int) -> int: return x * 2

# Better type inference
var items := [1, 2, 3]  # Array[int]
```

#### 3. Enhanced Physics
- `PhysicsMaterial` с новым свойством `absorbent`
- Улучшенная система collision layers
- Новые режимы движения для `CharacterBody`

#### 4. Compositor System (New in 4.5+)
- Программируемый pipeline рендеринга
- Кастомные пост-эффекты
- Лучшая производительность

#### 5. Improved 3D Rendering
- SDFGI (Signed Distance Field Global Illumination)
- Enhanced SSR (Screen Space Reflections)
- Better shadow quality
- Heightmap parallax mapping

### API Changes to Support

```typescript
// Old API (Godot 4.0-4.4)
interface OldPhysicsBody {
  friction: number;
  bounce: number;
}

// New API (Godot 4.5+)
interface NewPhysicsBody {
  physics_material: {
    friction: number;
    bounce: number;
    absorbent: boolean; // NEW
  };
}

// Migration helper
function migratePhysicsProperties(old: OldPhysicsBody): NewPhysicsBody {
  return {
    physics_material: {
      friction: old.friction,
      bounce: old.bounce,
      absorbent: false
    }
  };
}
```

### Documentation Integration with Godot 4.5+

```typescript
interface Godot45Documentation {
  // Direct links to Godot 4.5+ docs
  classReference: (className: string) => string;
  tutorialLink: (topic: string) => string;
  apiChanges: () => Promise<ApiChange[]>;
  
  // New in 4.5+
  compositorDocs: () => string;
  modernPhysicsDocs: () => string;
  uidSystemDocs: () => string;
}

const docs: Godot45Documentation = {
  classReference: (className) => 
    `https://docs.godotengine.org/en/4.5/classes/class_${className.toLowerCase()}.html`,
  
  tutorialLink: (topic) => 
    `https://docs.godotengine.org/en/4.5/tutorials/${topic}.html`,
  
  apiChanges: async () => {
    // Fetch API changes from 4.4 to 4.5
    return [
      {
        type: 'added',
        class: 'PhysicsMaterial',
        property: 'absorbent',
        description: 'Makes the body absorb forces instead of bouncing'
      },
      {
        type: 'added',
        class: 'Environment',
        property: 'compositor',
        description: 'New compositor effects system'
      }
    ];
  },
  
  compositorDocs: () => 
    'https://docs.godotengine.org/en/4.5/tutorials/rendering/compositor.html',
  
  modernPhysicsDocs: () => 
    'https://docs.godotengine.org/en/4.5/tutorials/physics/physics_introduction.html',
  
  uidSystemDocs: () => 
    'https://docs.godotengine.org/en/4.5/tutorials/assets_pipeline/import_process.html#uid-system'
};
```

## Migration Path

### Phase 1: Core Extensions with Godot 4.5+ Support (Weeks 1-2)
- Расширение scene operations с поддержкой UID
- Добавление script operations с GDScript 2.0
- Базовая документация для Godot 4.5+
- Version validation (минимум 4.5.0)

### Phase 2: Advanced Features (Weeks 3-4)
- Physics module с новым PhysicsMaterial API
- UI module с современными Control узлами
- Animation module с улучшенным AnimationTree
- 3D module с compositor support

### Phase 3: Polish and Integration (Weeks 5-6)
- Documentation integration для Godot 4.5+
- Debug capabilities с улучшенным error reporting
- Performance optimization
- Comprehensive testing на Godot 4.5+

### Version Requirements
- **Minimum Version**: Godot 4.5.0
- **Recommended Version**: Godot 4.5.x (latest stable)
- **No Backward Compatibility**: Не поддерживаем Godot 4.4 и ниже для упрощения кодовой базы
- **Future Proof**: Архитектура готова к Godot 4.6+ и 5.0
