import {
    Engine, Scene, ArcRotateCamera, Vector3, UniversalCamera,
    HemisphericLight, DirectionalLight, PointLight, SpotLight,
    MeshBuilder, TransformNode, Mesh, Color3, Color4,
    StandardMaterial, GizmoManager,
    ShadowGenerator, Node as BabylonNode,
    SceneLoader, HavokPlugin, PhysicsAggregate, PhysicsShapeType, PhysicsMotionType,
    PhysicsViewer
} from '@babylonjs/core';
import '@babylonjs/loaders';
import { SkyMaterial, GridMaterial, GradientMaterial } from '@babylonjs/materials';
import '@babylonjs/inspector';
import HavokPhysics from '@babylonjs/havok';
import { SceneManager } from './SceneManager';
import { Entity } from './Entity';
import { GameRuntime } from './GameRuntime';
import { EditorGizmos } from './EditorGizmos';
import { editorState } from '../editor/EditorState';
import { assetDB } from '../editor/AssetDatabase';
import type { GizmoMode } from '../editor/EditorState';

const GIZMO_PREFIX = '__gizmo__';

export class CoreEngine {
    public babylonEngine: Engine;
    public babylonScene: Scene;
    public sceneManager: SceneManager;
    public shadowGenerator: ShadowGenerator | null = null;
    public skyMaterial: SkyMaterial | null = null;

    private runtime: GameRuntime;
    private isPlaying: boolean = false;
    private gizmoManager!: GizmoManager;
    private editorGizmos!: EditorGizmos;
    private debugLayerVisible = false;
    private physicsViewer: PhysicsViewer | null = null;
    private static _havokInstance: any = null;
    /** Per-entity shadow generators (DirectionalLight only) */
    private shadowGenerators: Map<string, ShadowGenerator> = new Map();
    /** Proxy TransformNodes for lights/cameras so gizmos work on them */
    private gizmoProxies: Map<string, TransformNode> = new Map();
    /** Actual Babylon light objects, keyed by entity ID */
    private lightActuals: Map<string, DirectionalLight | PointLight | SpotLight | HemisphericLight> = new Map();

    /** User-adjustable sensitivity multipliers for viewport navigation */
    public _zoomSensitivity: number = 1.0;
    public _panSensitivity: number = 1.0;

    public getLightActual(id: string) {
        return this.lightActuals.get(id);
    }

    constructor(canvas: HTMLCanvasElement) {
        this.babylonEngine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.babylonScene = new Scene(this.babylonEngine);
        this.sceneManager = new SceneManager(this.babylonScene);
        this.runtime = new GameRuntime(this.babylonScene, this.sceneManager);

        this.babylonScene.clearColor = new Color4(0.15, 0.18, 0.22, 1.0);

        this.setupEditorEnvironment(canvas);
        this.setupGizmos();
        this.setupPicking();

        this.editorGizmos = new EditorGizmos(this.babylonScene, this.sceneManager);

        editorState.onGizmoModeChanged.push((mode) => this.applyGizmoMode(mode));
        editorState.onSelectionChanged.push((id) => this._handleSelectionVisuals(id));
        editorState.onTransformChanged.push(() => this.refreshAllColliderVisuals());

        this.babylonEngine.runRenderLoop(() => {
            if (this.isPlaying) {
                const delta = this.babylonEngine.getDeltaTime() / 1000;
                this.runtime.update(delta);
            }
            this.babylonScene.render();
        });
        window.addEventListener('resize', () => this.babylonEngine.resize());
    }

    public static async Create(canvas: HTMLCanvasElement): Promise<CoreEngine> {
        if (!CoreEngine._havokInstance) {
            CoreEngine._havokInstance = await HavokPhysics();
        }
        const engine = new CoreEngine(canvas);
        const hk = new HavokPlugin(true, CoreEngine._havokInstance);
        engine.babylonScene.enablePhysics(new Vector3(0, -9.81, 0), hk);
        engine.physicsViewer = new PhysicsViewer(engine.babylonScene);
        return engine;
    }

    private setupEditorEnvironment(canvas: HTMLCanvasElement) {
        // Editor camera
        const camera = new ArcRotateCamera('editorCamera', -Math.PI / 4, Math.PI / 3.5, 14, Vector3.Zero(), this.babylonScene);
        camera.attachControl(canvas, true);
        camera.wheelPrecision = 50;
        camera.minZ = 0.1;
        camera.lowerRadiusLimit = 1;

        // Maintain clip distance, zoom/pan sensitivity dynamically in real time
        this.babylonScene.onBeforeRenderObservable.add(() => {
            if (!this.isPlaying) {
                // 1. Ensure maxZ is huge enough to hold giant architectures
                camera.maxZ = Math.max(200000, camera.radius * 4);

                // 2. Dynamically shift the near-clip plane to prevent depth-buffer Z-fighting artifacts
                camera.minZ = Math.max(0.1, camera.maxZ / 100000);

                // 3. Scale scroll (zoom) speed relative to distance from subject
                camera.wheelPrecision = Math.max(0.01, 500 / Math.max(1, camera.radius)) * (this._zoomSensitivity ?? 1);

                // 4. Scale panning speed relative to distance from subject (high sensibility = slow pan)
                camera.panningSensibility = Math.max(1, 1200 / Math.max(1, camera.radius)) / (this._panSensitivity ?? 1);
            }
        });

        // Tone mapping
        this.babylonScene.imageProcessingConfiguration.toneMappingEnabled = true;
        this.babylonScene.imageProcessingConfiguration.toneMappingType = 1; // ACES

        // Ambient hemisphere light (editor only)
        const hemi = new HemisphericLight('__editor_hemi__', new Vector3(0, 1, 0), this.babylonScene);
        hemi.intensity = 0.6;
        hemi.diffuse = new Color3(0.9, 0.95, 1.0);
        hemi.groundColor = new Color3(0.1, 0.1, 0.1);

        // Default directional sun light
        const sun = new DirectionalLight('__editor_sun__', new Vector3(-1, -2, -1), this.babylonScene);
        sun.intensity = 1.8;
        sun.diffuse = new Color3(1.0, 1.0, 0.95);
        sun.position = new Vector3(20, 40, 20);

        // Shadow generator for editor sun
        this.shadowGenerator = new ShadowGenerator(2048, sun);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurScale = 2;
        this.shadowGenerator.setDarkness(0.3);

        // Procedural sky
        this.setupSky();

        // Grid
        const ground = MeshBuilder.CreateGround('__grid__', { width: 500, height: 500, subdivisions: 2 }, this.babylonScene);
        const gridMat = new GridMaterial('__gridMat__', this.babylonScene);
        gridMat.majorUnitFrequency = 10;
        gridMat.minorUnitVisibility = 0.25;
        gridMat.gridRatio = 1;
        gridMat.mainColor = new Color3(0.05, 0.06, 0.08);
        gridMat.lineColor = new Color3(0.2, 0.25, 0.35);
        gridMat.opacity = 0.6;
        ground.material = gridMat;
        ground.isPickable = false;
        ground.receiveShadows = true;
        ground.position.y = -0.01;
    }

    public setupSky() {
        const existing = this.babylonScene.getMeshByName('__sky__');
        if (existing) existing.dispose();

        const skybox = MeshBuilder.CreateSphere('__sky__', { diameter: 100000, segments: 32 }, this.babylonScene);
        skybox.infiniteDistance = true;
        this.skyMaterial = new SkyMaterial('__skyMat__', this.babylonScene);
        this.skyMaterial.backFaceCulling = false;

        this.skyMaterial.turbidity = 1.5;
        this.skyMaterial.luminance = 1.0;
        this.skyMaterial.inclination = 0.2;
        this.skyMaterial.azimuth = 0.15;
        this.skyMaterial.mieCoefficient = 0.002;
        this.skyMaterial.mieDirectionalG = 0.85;
        this.skyMaterial.rayleigh = 2.0;

        skybox.material = this.skyMaterial;
        skybox.isPickable = false;
        this.babylonScene.environmentIntensity = 1.0;
    }

    private setupGizmos() {
        this.gizmoManager = new GizmoManager(this.babylonScene);
        this.gizmoManager.usePointerToAttachGizmos = false;
        this.gizmoManager.positionGizmoEnabled = false;
        this.gizmoManager.rotationGizmoEnabled = false;
        this.gizmoManager.scaleGizmoEnabled = false;
        this.gizmoManager.boundingBoxGizmoEnabled = false;

        // Notify editor/inspector when gizmos are dragged
        const notifyDrag = () => {
            if (!this.isPlaying) editorState.notifyTransformChanged(false);
        };
        const notifyDragEnd = () => {
            if (!this.isPlaying) editorState.notifyTransformChanged(true);
        };

        this.gizmoManager.gizmos.positionGizmo?.onDragObservable.add(notifyDrag);
        this.gizmoManager.gizmos.positionGizmo?.onDragEndObservable.add(notifyDragEnd);
        this.gizmoManager.gizmos.rotationGizmo?.onDragObservable.add(notifyDrag);
        this.gizmoManager.gizmos.rotationGizmo?.onDragEndObservable.add(notifyDragEnd);
        this.gizmoManager.gizmos.scaleGizmo?.onDragObservable.add(notifyDrag);
        this.gizmoManager.gizmos.scaleGizmo?.onDragEndObservable.add(notifyDragEnd);
        this.gizmoManager.gizmos.boundingBoxGizmo?.onScaleBoxDragObservable.add(notifyDrag);
        this.gizmoManager.gizmos.boundingBoxGizmo?.onRotationSphereDragObservable.add(notifyDrag);
    }

    private applyGizmoMode(mode: GizmoMode) {
        this.gizmoManager.positionGizmoEnabled = false;
        this.gizmoManager.rotationGizmoEnabled = false;
        this.gizmoManager.scaleGizmoEnabled = false;
        this.gizmoManager.boundingBoxGizmoEnabled = false;

        const id = editorState.selectedEntityId;
        if (!id) return;
        if (this.isPlaying) return;

        const entity = this.sceneManager.entities.get(id);
        if (!entity) return;

        // Scale is NEVER allowed on lights or cameras (physically nonsensical)
        const allowScale = entity.type !== 'Light' && entity.type !== 'Camera';

        // Use gizmo proxy if available (lights + cameras), else use stored node
        const proxy = this.gizmoProxies.get(id);
        const node = proxy ?? this.sceneManager.babylonNodes.get(id);
        if (!node) return;

        // attachToNode works with any Node (TransformNode, Mesh, etc)
        (this.gizmoManager as any).attachToNode(node);
        if (typeof (this.gizmoManager as any).attachToNode !== 'function') {
            // Fallback if attachToNode not available
            if (node instanceof Mesh) this.gizmoManager.attachToMesh(node);
        }

        if (mode === 'move') this.gizmoManager.positionGizmoEnabled = true;
        if (mode === 'rotate') this.gizmoManager.rotationGizmoEnabled = true;
        if (mode === 'scale' && allowScale) this.gizmoManager.scaleGizmoEnabled = true;
        if (mode === 'select' && allowScale) this.gizmoManager.boundingBoxGizmoEnabled = true;
    }

    private _handleSelectionVisuals(selectedId: string | null) {
        this.babylonScene.meshes.forEach(m => {
            if (!m.name.startsWith('__')) m.renderOutline = false;
        });

        this.gizmoManager.attachToMesh(null);
        this.gizmoManager.positionGizmoEnabled = false;
        this.gizmoManager.rotationGizmoEnabled = false;
        this.gizmoManager.scaleGizmoEnabled = false;
        this.gizmoManager.boundingBoxGizmoEnabled = false;

        if (!selectedId) return;
        const entity = this.sceneManager.entities.get(selectedId);
        const node = this.sceneManager.babylonNodes.get(selectedId);
        const proxy = this.gizmoProxies.get(selectedId);

        // Show outline on meshes
        if (node instanceof Mesh && !node.name.startsWith('__')) {
            node.renderOutline = true;
            node.outlineColor = Color3.FromHexString('#ff8800');
            node.outlineWidth = 0.025;
        } else if (node instanceof TransformNode && !node.name.startsWith('__')) {
            node.getChildMeshes().forEach(m => {
                m.renderOutline = true;
                m.outlineColor = Color3.FromHexString('#ff8800');
                m.outlineWidth = 0.025;
            });
        }

        // Always apply gizmo mode when something is selected
        // (works for meshes, lights via proxy, and cameras)
        if (entity && (node instanceof Mesh || node instanceof TransformNode || node instanceof UniversalCamera || proxy)) {
            this.applyGizmoMode(editorState.gizmoMode);
        }
    }

    private setupPicking() {
        this.babylonScene.onPointerDown = (evt, pickResult) => {
            if (this.isPlaying) return;
            if (evt.button !== 0) return;
            if (pickResult.hit && pickResult.pickedMesh) {
                const pickedName = pickResult.pickedMesh.name;

                // Check if we clicked a gizmo helper mesh — find its owning entity
                if (pickedName.startsWith(GIZMO_PREFIX)) {
                    const uuidMatch = pickedName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
                    if (uuidMatch) {
                        editorState.selectEntity(uuidMatch[1]);
                        return;
                    }
                }

                if (!pickedName.startsWith('__')) {
                    // Find nearest entity parent
                    let current: BabylonNode | null = pickResult.pickedMesh;
                    while (current) {
                        const entry = [...this.sceneManager.babylonNodes.entries()].find(([, n]) => n === current);
                        if (entry) { editorState.selectEntity(entry[0]); return; }
                        current = current.parent;
                    }
                }
            }
            editorState.clearSelection();
        };
    }

    public applyShadowSettings(entity: Entity, _bNodeFromInspector: any) {
        // Always use the actual light object (not proxy TransformNode from Inspector)
        const light = this.lightActuals.get(entity.id);
        if (!light || !(light instanceof DirectionalLight)) return;

        const existing = this.shadowGenerators.get(entity.id);

        if (!entity.lightShadowEnabled) {
            if (existing) { existing.dispose(); this.shadowGenerators.delete(entity.id); }
            return;
        }

        // Dispose & recreate when map size changes
        if (existing && (existing as any)._mapSize !== entity.lightShadowMapSize) {
            existing.dispose();
            this.shadowGenerators.delete(entity.id);
        }

        let gen = this.shadowGenerators.get(entity.id);
        if (!gen) {
            gen = new ShadowGenerator(entity.lightShadowMapSize, light);
            (gen as any)._mapSize = entity.lightShadowMapSize;

            // Auto-calc frustum for directional shadows
            if (light instanceof DirectionalLight) {
                (light as any).autoUpdateExtends = true;
                (light as any).autoCalcShadowZBounds = true;
            }

            this.shadowGenerators.set(entity.id, gen);

            // Register all existing meshes as casters + receivers
            for (const [id] of this.sceneManager.entities) {
                const n = this.sceneManager.babylonNodes.get(id);
                if (n instanceof Mesh) {
                    gen.addShadowCaster(n, true);
                    n.receiveShadows = true;
                } else if (n instanceof TransformNode) {
                    n.getChildMeshes().forEach(m => {
                        gen!.addShadowCaster(m, true);
                        m.receiveShadows = true;
                    });
                }
            }
        }

        // Apply filter mode
        switch (entity.lightShadowBlur) {
            case 'Exponential': gen.filter = ShadowGenerator.FILTER_EXPONENTIALSHADOWMAP; break;
            case 'BlurExponential': gen.filter = ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP; break;
            case 'PCF': gen.filter = ShadowGenerator.FILTER_PCF; break;
            case 'PCSS': gen.filter = ShadowGenerator.FILTER_PCSS; break;
            default: gen.filter = ShadowGenerator.FILTER_NONE; break;
        }

        gen.setDarkness(entity.lightShadowDarkness);
        gen.bias = entity.lightShadowBias;
    }

    public toggleDebugLayer() {
        if (this.debugLayerVisible) {
            this.babylonScene.debugLayer.hide();
            // Hide physics debug
            for (const mesh of this.babylonScene.meshes) {
                if (mesh.parent instanceof BabylonNode && (mesh.parent as any).physicsBody) {
                    this.physicsViewer?.hideBody((mesh.parent as any).physicsBody);
                }
            }
        } else {
            this.babylonScene.debugLayer.show({ embedMode: true });
            // Show physics debug
            for (const mesh of this.babylonScene.meshes) {
                if ((mesh as any).physicsBody) {
                    this.physicsViewer?.showBody((mesh as any).physicsBody);
                }
            }
        }
        this.debugLayerVisible = !this.debugLayerVisible;
    }

    public applyMaterialToEntity(entity: Entity) {
        const node = this.sceneManager.babylonNodes.get(entity.id);
        if (!(node instanceof Mesh)) return;

        let mat = node.material as StandardMaterial | null;
        if (!mat || !(mat instanceof StandardMaterial)) {
            mat = new StandardMaterial(`${entity.name}_mat`, this.babylonScene);
            node.material = mat;
        }
        mat.diffuseColor = Color3.FromHexString(entity.materialColor);

        if (entity.emissiveEnabled) {
            const ec = Color3.FromHexString(entity.materialEmissive);
            mat.emissiveColor = ec.scale(entity.emissiveIntensity);
        } else {
            mat.emissiveColor = new Color3(0, 0, 0);
        }

        mat.specularColor = new Color3(entity.materialMetallic, entity.materialMetallic, entity.materialMetallic);
        mat.roughness = entity.materialRoughness;
    }

    public updateEnvironment(entity: Entity) {
        if (entity.type !== 'Sky') return;
        const skybox = this.babylonScene.getMeshByName('__sky__');
        if (!skybox) return;

        if (entity.customSkyEnabled) {
            if (!(skybox.material instanceof GradientMaterial)) {
                skybox.material = new GradientMaterial('__skyMat_gradient__', this.babylonScene);
                (skybox.material as GradientMaterial).backFaceCulling = false;
            }
            const gMat = skybox.material as GradientMaterial;
            const top = Color3.FromHexString(entity.skyTopColor).scale(entity.skyEnergy);
            const hor = Color3.FromHexString(entity.skyHorizonColor).scale(entity.skyEnergy);
            gMat.topColor = top;
            gMat.bottomColor = hor;
            gMat.offset = (entity.skyCurve * 2.0) - 1.0;
            gMat.smoothness = 1.0;
        } else {
            if (!(skybox.material instanceof SkyMaterial)) {
                skybox.material = new SkyMaterial('__skyMat_procedural__', this.babylonScene);
                (skybox.material as SkyMaterial).backFaceCulling = false;
            }
            const sMat = skybox.material as SkyMaterial;
            sMat.turbidity = entity.skyTurbidity;
            sMat.rayleigh = entity.skyRayleigh;
            sMat.mieCoefficient = entity.skyMieCoefficient;
            sMat.mieDirectionalG = entity.skyMieDirectionalG;
            sMat.luminance = entity.skyLuminance;
            sMat.inclination = entity.skyInclination;
            sMat.azimuth = entity.skyAzimuth;
            this.skyMaterial = sMat;
        }
        this.babylonScene.environmentIntensity = entity.environmentIntensity;
        const hemi = this.babylonScene.getLightByName('__editor_hemi__') as HemisphericLight;
        if (entity.customSkyEnabled) {
            const horizon = Color3.FromHexString(entity.skyHorizonColor);
            const skyAmbient = horizon.scale(entity.skyEnergy * 0.8);
            this.babylonScene.ambientColor = skyAmbient;
            if (hemi) {
                hemi.diffuse = skyAmbient;
                hemi.groundColor = skyAmbient.scale(0.2);
                hemi.intensity = entity.environmentIntensity;
            }
        } else {
            const amb = Color3.FromHexString(entity.ambientColor);
            this.babylonScene.ambientColor = amb;
            if (hemi) {
                hemi.diffuse = amb;
                hemi.groundColor = new Color3(0.1, 0.1, 0.1);
                hemi.intensity = 1.0;
            }
        }

        // Handle Grid visibility
        const grid = this.babylonScene.getMeshByName('__grid__');
        if (grid) {
            // In editor it is always visible. In play it depends on entity.showGrid
            grid.setEnabled(this.isPlaying ? entity.showGrid : true);
        }

        // Handle Global Ground Physics
        const groundBodyName = '__global_physics_ground__';
        let groundNode = this.babylonScene.getMeshByName(groundBodyName);

        if (entity.groundLevelEnabled && entity.groundLevelCollidable) {
            if (!groundNode) {
                // Extremely large static box for collision
                groundNode = MeshBuilder.CreateBox(groundBodyName, { width: 2000, height: 1, depth: 2000 }, this.babylonScene);
                groundNode.isVisible = false;
                groundNode.isPickable = false;
            }
            groundNode.position.y = entity.groundLevel - 0.5; // Surface at groundLevel

            if (!(groundNode as any).physicsBody && this.babylonScene.isPhysicsEnabled()) {
                const aggregate = new PhysicsAggregate(groundNode, PhysicsShapeType.BOX, { mass: 0, friction: 0.5, restitution: 0.1 }, this.babylonScene);
                (groundNode as any).physicsBody = aggregate.body;
            }
        } else if (groundNode) {
            if ((groundNode as any).physicsBody) (groundNode as any).physicsBody.dispose();
            groundNode.dispose();
        }
    }

    public updateCamera(entity: Entity) {
        if (entity.type !== 'Camera') return;
        const bCam = this.sceneManager.babylonNodes.get(entity.id) as UniversalCamera;
        if (!bCam) return;

        if (this.isPlaying) {
            const editorCam = this.babylonScene.getCameraByName('editorCamera') as ArcRotateCamera;

            if (entity.debugCamera) {
                // Switch to the orbit/debug camera
                this.babylonScene.activeCamera = editorCam;
                editorCam.attachControl(this.babylonEngine.getRenderingCanvas(), true);

                // Copy game camera current view as a starting point
                editorCam.setPosition(bCam.position.clone());
                const forward = bCam.getDirection(Vector3.Forward());
                editorCam.setTarget(bCam.position.add(forward.scale(10)));
            } else {
                // Return to the main game camera view
                const mainCamEntity = Array.from(this.sceneManager.entities.values()).find(e => e.type === 'Camera' && e.isMainCamera);
                if (mainCamEntity) {
                    const mainBCam = this.sceneManager.babylonNodes.get(mainCamEntity.id) as UniversalCamera;
                    if (mainBCam) {
                        this.babylonScene.activeCamera = mainBCam;
                    }
                }
                editorCam.detachControl();
            }
        }
    }


    public syncEntity(entity: Entity) {
        if (this.sceneManager.babylonNodes.has(entity.id)) {
            if (entity.type === 'Sky') this.updateEnvironment(entity);
            if (entity.type === 'Camera') this.updateCamera(entity);
            if (entity.type === 'Light') {
                const actual = this.lightActuals.get(entity.id);
                if (actual) {
                    actual.intensity = (entity as any).lightIntensity ?? 1.0;
                    if ((actual as any).diffuse && (entity as any).lightColor) {
                        (actual as any).diffuse = Color3.FromHexString((entity as any).lightColor);
                    }
                }
            }
            return;
        }

        let node: BabylonNode;

        if (entity.type === 'Mesh') {
            let mesh: Mesh | null = null;
            if (entity.meshType === 'Cube') {
                mesh = MeshBuilder.CreateBox(entity.name, { size: 1 }, this.babylonScene);
            } else if (entity.meshType === 'Sphere') {
                mesh = MeshBuilder.CreateSphere(entity.name, { diameter: 1, segments: 16 }, this.babylonScene);
            } else if (entity.meshType === 'Cylinder') {
                mesh = MeshBuilder.CreateCylinder(entity.name, { height: 2, diameter: 1, tessellation: 24 }, this.babylonScene);
            } else if (entity.meshType === 'Plane') {
                mesh = MeshBuilder.CreateGround(entity.name, { width: 5, height: 5, subdivisions: 4 }, this.babylonScene);
            } else if (entity.meshType === 'Torus') {
                mesh = MeshBuilder.CreateTorus(entity.name, { diameter: 1, thickness: 0.35, tessellation: 32 }, this.babylonScene);
            } else if (entity.meshType === 'Capsule') {
                mesh = MeshBuilder.CreateCapsule(entity.name, { radius: 0.5, height: 2 }, this.babylonScene);
            } else if (entity.meshType === 'Cone') {
                mesh = MeshBuilder.CreateCylinder(entity.name, { height: 2, diameterTop: 0, diameterBottom: 1, tessellation: 24 }, this.babylonScene);
            } else if (entity.meshType === 'Disc') {
                mesh = MeshBuilder.CreateDisc(entity.name, { radius: 1, tessellation: 32 }, this.babylonScene);
                mesh.rotation.x = Math.PI / 2;
            } else if (entity.meshType === 'ImportedModel') {
                node = new TransformNode(entity.name, this.babylonScene);
                this.loadImportedModel(entity, node as TransformNode);
            } else {
                mesh = MeshBuilder.CreateBox(entity.name, { size: 1 }, this.babylonScene);
            }

            if (entity.meshType !== 'ImportedModel' && mesh) {
                const mat = new StandardMaterial(`${entity.name}_mat`, this.babylonScene);
                mat.diffuseColor = Color3.FromHexString(entity.materialColor);
                mesh.material = mat;
                if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(mesh);
                for (const gen of this.shadowGenerators.values()) {
                    gen.addShadowCaster(mesh, true);
                }
                mesh.receiveShadows = entity.receiveShadows;
                mesh.position.y = entity.meshType === 'Plane' ? 0 : 0.5;
                node = mesh;
            } else if (!node!) {
                node = mesh!;
            }

        } else if (entity.type === 'Light') {
            let actualLight: DirectionalLight | PointLight | SpotLight | HemisphericLight;

            if (entity.lightType === 'Directional') {
                const dir = entity.lightDirection ?? { x: -1, y: -2, z: -1 };
                const dl = new DirectionalLight(entity.name,
                    new Vector3(dir.x, dir.y, dir.z).normalize(), this.babylonScene);
                dl.intensity = 1.5;
                dl.diffuse = new Color3(1, 0.95, 0.85);
                dl.position = new Vector3(0, 10, 0); // Temporary, fixed in proxy init
                actualLight = dl;
            } else if (entity.lightType === 'Point') {
                const pl = new PointLight(entity.name, Vector3.Zero(), this.babylonScene);
                pl.intensity = 1.0; pl.range = 20;
                actualLight = pl;
            } else if (entity.lightType === 'Spot') {
                const sl = new SpotLight(entity.name, Vector3.Zero(),
                    new Vector3(0, -1, 0), Math.PI / 4, 2, this.babylonScene);
                sl.intensity = 1.5;
                actualLight = sl;
            } else {
                actualLight = new HemisphericLight(entity.name, Vector3.Up(), this.babylonScene);
            }

            this.lightActuals.set(entity.id, actualLight);

            // Create a proxy TransformNode so the GizmoManager can attach to it
            const proxy = new TransformNode(`__proxy_light_${entity.id}`, this.babylonScene);
            proxy.position = (actualLight as any).position?.clone() ?? Vector3.Zero();
            if (actualLight instanceof DirectionalLight) {
                proxy.lookAt(proxy.position.add(actualLight.direction));
            }

            // Every frame: sync proxy's -Z world direction → light.direction
            //              sync proxy position         → light.position
            this.babylonScene.onBeforeRenderObservable.add(() => {
                if (actualLight instanceof DirectionalLight) {
                    // -Z in local space → world forward direction from proxy
                    const fwd = Vector3.TransformNormal(
                        new Vector3(0, 0, -1),
                        proxy.getWorldMatrix()
                    ).normalize();
                    actualLight.direction = fwd;
                    actualLight.position = proxy.getAbsolutePosition().clone();

                    // Keep entity lightDirection in sync so Inspector shows correct values
                    entity.lightDirection = { x: fwd.x, y: fwd.y, z: fwd.z };
                }
            });

            this.gizmoProxies.set(entity.id, proxy);
            node = proxy;   // store proxy so gizmos, picking, etc. all work
        } else if (entity.type === 'Camera') {
            node = new UniversalCamera(entity.name, Vector3.Zero(), this.babylonScene);
            (node as UniversalCamera).maxZ = 100000;
        } else {
            node = new TransformNode(entity.name, this.babylonScene);
        }

        node!.name = entity.name;
        node!.setEnabled(entity.visible);

        // Sync parent in Babylon
        if (entity.parent) {
            const babylonParent = this.sceneManager.babylonNodes.get(entity.parent.id);
            if (babylonParent) {
                (node as any).parent = babylonParent;
            }
        }

        this.sceneManager.babylonNodes.set(entity.id, node!);

        // Sync editor gizmo helpers for this entity
        setTimeout(() => this.editorGizmos?.syncEntity(entity.id, entity), 0);

        if (this.isPlaying) {
            this.applyPhysicsToEntity(entity);
        }

        this.updateColliderVisuals(entity, node!);
    }

    private refreshAllColliderVisuals() {
        for (const [id, entity] of this.sceneManager.entities) {
            const node = this.sceneManager.babylonNodes.get(id);
            if (node) this.updateColliderVisuals(entity, node);
        }
    }

    public refreshViewSettings() {
        this.refreshAllColliderVisuals();

        // Also refresh editor gizmos
        if (this.editorGizmos) {
            if (!this.isPlaying && editorState.showGizmos) {
                this.editorGizmos.showAll();
            } else {
                this.editorGizmos.hideAll();
            }
        }
    }

    public updateColliderVisuals(entity: Entity, node: BabylonNode) {
        if (!(node instanceof Mesh) && !(node instanceof TransformNode)) return;

        const meshes = (node instanceof Mesh) ? [node] : node.getChildMeshes();

        meshes.forEach(m => {
            if (m.name.startsWith('__physics_collider__')) {
                m.renderOverlay = false;
                m.isVisible = false;
                return;
            }

            // Only show blue overlay in editor AND only if physics is active AND it is collidable AND user wants to see it
            if (!this.isPlaying && entity.physicsType !== 'None' && entity.collidable && editorState.showColliders) {
                m.renderOverlay = true;
                m.overlayColor = new Color3(0.4, 0.7, 1.0); // Light Blue
                m.overlayAlpha = 0.25; // Semi-transparent
            } else {
                m.renderOverlay = false;
            }
        });
    }

    private async loadImportedModel(entity: Entity, parent: TransformNode) {
        if (!entity.modelAssetId) return;
        try {
            const assets = await assetDB.getAllAssets();
            const asset = assets.find(a => a.id === entity.modelAssetId);
            if (!asset || !asset.data) return;

            const base64 = asset.data as string;
            const result = await SceneLoader.ImportMeshAsync("", "", base64, this.babylonScene);

            result.meshes.forEach(m => {
                // Only parent top-level nodes from the imported file to avoid flattening hierarchy
                if (!m.parent) {
                    m.parent = parent;
                    // Standardize: clear Babylon's automatic root handedness conversion (often 90 deg rotation)
                    if (m.name === "__root__" || m === result.meshes[0]) {
                        m.rotationQuaternion = null;
                        m.rotation = Vector3.Zero();
                    }
                }

                if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(m, true);
                for (const gen of this.shadowGenerators.values()) gen.addShadowCaster(m, true);
                m.receiveShadows = entity.receiveShadows;
            });
            console.log(`Successfully loaded model asset: ${asset.name}`);

            // Re-apply physics now that the actual geometry is loaded
            if (entity.hasCollider) {
                this.applyPhysicsToEntity(entity);
                this.updateColliderVisuals(entity, parent);
            }
        } catch (e) {
            console.error("Failed to load imported model:", e);
        }
    }


    public focusOnEntity(entityId: string) {
        const cam = this.babylonScene.getCameraByName('editorCamera') as ArcRotateCamera;
        if (!cam) return;

        const node = this.sceneManager.babylonNodes.get(entityId);
        if (!node) return;

        // Compute world-space center and bounding radius
        let center = Vector3.Zero();
        let radius = 4; // default fallback distance

        if (node instanceof Mesh) {
            node.computeWorldMatrix(true);
            const bi = node.getBoundingInfo();
            center = bi.boundingSphere.centerWorld.clone();
            radius = Math.max(bi.boundingSphere.radiusWorld * 3.5, 1.5);
        } else if (node instanceof TransformNode) {
            node.computeWorldMatrix(true);
            const childMeshes = node.getChildMeshes();
            if (childMeshes.length > 0) {
                // Compute aggregate bounding box over all child meshes
                let min = new Vector3(Infinity, Infinity, Infinity);
                let max = new Vector3(-Infinity, -Infinity, -Infinity);
                childMeshes.forEach(m => {
                    m.computeWorldMatrix(true);
                    const bi = m.getBoundingInfo();
                    min = Vector3.Minimize(min, bi.boundingBox.minimumWorld);
                    max = Vector3.Maximize(max, bi.boundingBox.maximumWorld);
                });
                center = Vector3.Center(min, max);
                radius = Math.max(Vector3.Distance(min, max) * 1.5, 2);
            } else {
                // Empty transform node — just use its position
                center = node.getAbsolutePosition().clone();
                radius = 4;
            }
        } else if ('position' in node) {
            // Lights, cameras etc.
            center = (node as any).position.clone();
            radius = 6;
        }

        // Smoothly animate target and radius over ~300ms (20 steps at 60fps)
        const startTarget = cam.target.clone();
        const startRadius = cam.radius;
        const endTarget = center;
        const endRadius = radius;
        const steps = 20;
        let step = 0;

        const animInterval = setInterval(() => {
            step++;
            const t = step / steps;
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out quad

            cam.target = Vector3.Lerp(startTarget, endTarget, ease);
            cam.radius = startRadius + (endRadius - startRadius) * ease;

            if (step >= steps) {
                clearInterval(animInterval);
                cam.target = endTarget.clone();
                cam.radius = endRadius;
            }
        }, 16);
    }

    public startGame() {
        this.isPlaying = true;
        this.refreshAllColliderVisuals();
        this.editorGizmos?.hideAll();

        // Respect Sky showGrid setting
        const skyEntity = Array.from(this.sceneManager.entities.values()).find(e => e.type === 'Sky');
        if (skyEntity) {
            this.babylonScene.getMeshByName('__grid__')?.setEnabled(skyEntity.showGrid);
        }

        editorState.clearSelection();

        // Apply physics to all entities
        for (const entity of this.sceneManager.entities.values()) {
            this.applyPhysicsToEntity(entity);
        }

        const mainCamEntity = Array.from(this.sceneManager.entities.values()).find(e => e.type === 'Camera' && e.isMainCamera);
        if (mainCamEntity) {
            const bCam = this.sceneManager.babylonNodes.get(mainCamEntity.id) as UniversalCamera;
            if (bCam) {
                const editorCam = this.babylonScene.getCameraByName('editorCamera') as ArcRotateCamera;
                editorCam?.detachControl();

                if (mainCamEntity.debugCamera) {
                    this.babylonScene.activeCamera = editorCam;
                    editorCam.attachControl(this.babylonEngine.getRenderingCanvas(), true);

                    // Initial sync of the debug view to the game camera
                    editorCam.setPosition(bCam.position.clone());
                    const forward = bCam.getDirection(Vector3.Forward());
                    editorCam.setTarget(bCam.position.add(forward.scale(10)));
                } else {
                    this.babylonScene.activeCamera = bCam;
                    bCam.detachControl(); // Keep fixed
                }
            }
        }
        this.runtime.start();
    }

    public stopGame() {
        this.isPlaying = false;
        this.refreshAllColliderVisuals();
        this.runtime.stop();
        this.editorGizmos?.showAll();
        this.babylonScene.getMeshByName('__grid__')?.setEnabled(true);

        // Remove physics from all entities
        for (const id of this.sceneManager.entities.keys()) {
            const node = this.sceneManager.babylonNodes.get(id);
            if (node && (node as any).physicsBody) {
                (node as any).physicsBody.dispose();
                (node as any).physicsBody = null;
            }
        }

        // Detach controls from all scene cameras
        for (const [id, entity] of this.sceneManager.entities) {
            if (entity.type === 'Camera') {
                const bCam = this.sceneManager.babylonNodes.get(id);
                if (bCam && 'detachControl' in bCam) (bCam as any).detachControl();
            }
        }

        const editorCam = this.babylonScene.getCameraByName('editorCamera');
        if (editorCam) {
            this.babylonScene.activeCamera = editorCam;
            editorCam.attachControl(this.babylonEngine.getRenderingCanvas(), true);
        }
    }

    public applyPhysicsToEntity(entity: Entity) {
        if (!this.isPlaying) return;
        if (entity.physicsType === 'None' && !entity.hasCollider) return;
        const node = this.sceneManager.babylonNodes.get(entity.id);
        if (!(node instanceof Mesh) && !(node instanceof TransformNode)) return;

        // Clean up existing physics
        if ((node as any).physicsBody) {
            (node as any).physicsBody.dispose();
            (node as any).physicsBody = null;
        }

        // Determine shape and override for Planes (Ground)
        let shapeType = PhysicsShapeType.BOX;
        let extents: Vector3 | undefined;
        let mergedMesh: Mesh | null = null;

        if (entity.type === 'Mesh') {
            if (entity.meshType === 'Sphere') shapeType = PhysicsShapeType.SPHERE;
            else if (entity.meshType === 'Cylinder' || entity.meshType === 'Capsule') shapeType = PhysicsShapeType.CAPSULE;
            else if (entity.meshType === 'Plane') {
                shapeType = PhysicsShapeType.BOX;
                // Force a thickness for planes so objects don't tunnel through
                extents = new Vector3(5, 0.1, 5);
            }
            else if (entity.meshType === 'ImportedModel') {
                const childMeshes = node.getChildMeshes();
                if (childMeshes.length === 0) return; // Wait for async load to finish

                // Dispose of any old collider
                const oldCollider = node.getChildren((n) => n.name === '__physics_collider__', true)[0] as Mesh;
                if (oldCollider) oldCollider.dispose();

                // 1. Attempt to create a precise MESH collider by merging all valid child geometries
                const meshesToMerge: Mesh[] = [];
                childMeshes.forEach(m => {
                    if (m instanceof Mesh && m.name !== '__physics_collider__' && m.getTotalVertices() > 0) {
                        const clone = m.clone('__temp_clone__');
                        if (clone) {
                            clone.setParent(null); // Detach for a clean world-space merge
                            clone.computeWorldMatrix(true);
                            meshesToMerge.push(clone);
                        }
                    }
                });

                if (meshesToMerge.length > 0) {

                    try {
                        mergedMesh = Mesh.MergeMeshes(meshesToMerge, true, true, undefined, false, true);
                        if (mergedMesh) {
                            mergedMesh.name = '__physics_collider__';
                            mergedMesh.setParent(node);
                            mergedMesh.isVisible = false;
                            mergedMesh.isPickable = false;

                            shapeType = PhysicsShapeType.MESH;
                            // We will assign this to props.mesh later
                        }
                    } catch (e) {
                        console.warn('Mesh merging for precise collider failed, falling back to BOX extents:', e);
                        mergedMesh = null;
                    }
                }

                // 2. Fallback to a precise Bounding BOX if there were no valid geometries or merge failed
                if (!mergedMesh) {
                    shapeType = PhysicsShapeType.BOX;
                    let min = new Vector3(Infinity, Infinity, Infinity);
                    let max = new Vector3(-Infinity, -Infinity, -Infinity);
                    childMeshes.forEach(m => {
                        m.computeWorldMatrix(true);
                        const bi = m.getBoundingInfo().boundingBox;
                        min = Vector3.Minimize(min, bi.minimum);
                        max = Vector3.Maximize(max, bi.maximum);
                    });
                    extents = max.subtract(min);
                }
            }
        }

        let motionType = PhysicsMotionType.STATIC;
        if (entity.physicsType === 'Dynamic') motionType = PhysicsMotionType.DYNAMIC;
        else if (entity.physicsType === 'Kinematic') motionType = PhysicsMotionType.ANIMATED;

        try {
            const props: any = {
                mass: entity.physicsType === 'Static' || entity.physicsType === 'None' ? 0 : entity.mass,
                friction: entity.friction,
                restitution: entity.restitution
            };
            if (extents) props.extents = extents;

            const physicsTarget = (entity.meshType === 'ImportedModel' && mergedMesh) ? mergedMesh : node;

            const aggregate = new PhysicsAggregate(physicsTarget, shapeType, props, this.babylonScene);

            aggregate.body.setMotionType(motionType);
            aggregate.body.setLinearDamping(entity.linearDamping);
            aggregate.body.setAngularDamping(entity.angularDamping);

            // Lock Rotation
            if (entity.lockRotationX || entity.lockRotationY || entity.lockRotationZ) {
                const massProps = aggregate.body.getMassProperties();
                if (entity.lockRotationX) massProps.inertia!.x = 0;
                if (entity.lockRotationY) massProps.inertia!.y = 0;
                if (entity.lockRotationZ) massProps.inertia!.z = 0;
                aggregate.body.setMassProperties(massProps);
            }

            // Collision Filters
            if (entity.collidable) {
                aggregate.shape.filterMembershipMask = entity.collisionLayer;
                aggregate.shape.filterCollideMask = entity.collisionMask;
            } else {
                aggregate.shape.filterMembershipMask = 0;
                aggregate.shape.filterCollideMask = 0;
            }

            (node as any).physicsBody = aggregate.body;
        } catch (e) {
            console.error(`Failed to apply physics to ${entity.name}:`, e);
        }
    }
}
