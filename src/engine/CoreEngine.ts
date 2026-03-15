import {
    Engine, Scene, ArcRotateCamera, Vector3,
    HemisphericLight, DirectionalLight, PointLight, SpotLight,
    MeshBuilder, TransformNode, Mesh, Color3, Color4,
    StandardMaterial, GizmoManager,
    ShadowGenerator, Node as BabylonNode
} from '@babylonjs/core';
import { SkyMaterial, GridMaterial, GradientMaterial } from '@babylonjs/materials';
import '@babylonjs/inspector';
import { SceneManager } from './SceneManager';
import { Entity } from './Entity';
import { GameRuntime } from './GameRuntime';
import { editorState } from '../editor/EditorState';
import type { GizmoMode } from '../editor/EditorState';

export class CoreEngine {
    public babylonEngine: Engine;
    public babylonScene: Scene;
    public sceneManager: SceneManager;
    public shadowGenerator: ShadowGenerator | null = null;
    public skyMaterial: SkyMaterial | null = null;

    private runtime: GameRuntime;
    private isPlaying: boolean = false;
    private gizmoManager!: GizmoManager;
    private debugLayerVisible = false;

    constructor(canvas: HTMLCanvasElement) {
        this.babylonEngine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.babylonScene = new Scene(this.babylonEngine);
        this.sceneManager = new SceneManager(this.babylonScene);
        this.runtime = new GameRuntime(this.babylonScene, this.sceneManager);

        this.babylonScene.clearColor = new Color4(0.15, 0.18, 0.22, 1.0);

        this.setupEditorEnvironment(canvas);
        this.setupGizmos();
        this.setupPicking();

        editorState.onGizmoModeChanged.push((mode) => this.applyGizmoMode(mode));
        editorState.onSelectionChanged.push((id) => this._handleSelectionVisuals(id));

        this.babylonEngine.runRenderLoop(() => {
            if (this.isPlaying) {
                const delta = this.babylonEngine.getDeltaTime() / 1000;
                this.runtime.update(delta);
            }
            this.babylonScene.render();
        });
        window.addEventListener('resize', () => this.babylonEngine.resize());
    }

    private setupEditorEnvironment(canvas: HTMLCanvasElement) {
        // Editor camera
        const camera = new ArcRotateCamera('editorCamera', -Math.PI / 4, Math.PI / 3.5, 14, Vector3.Zero(), this.babylonScene);
        camera.attachControl(canvas, true);
        camera.wheelPrecision = 50;
        camera.minZ = 0.1;
        camera.lowerRadiusLimit = 1;

        // Tone mapping
        this.babylonScene.imageProcessingConfiguration.toneMappingEnabled = true;
        this.babylonScene.imageProcessingConfiguration.toneMappingType = 1; // ACES

        // Ambient hemisphere light (editor only)
        // Increased intensity for better global illumination
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

        // Grid (using GridMaterial for a professional look)
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
        ground.position.y = -0.01; // Avoid Z-fighting with other planes
    }

    public setupSky() {
        // Remove existing sky
        const existing = this.babylonScene.getMeshByName('__sky__');
        if (existing) existing.dispose();

        // Inverted sphere is better for sky
        const skybox = MeshBuilder.CreateSphere('__sky__', { diameter: 1000, segments: 32 }, this.babylonScene);
        this.skyMaterial = new SkyMaterial('__skyMat__', this.babylonScene);
        this.skyMaterial.backFaceCulling = false;
        
        // Realistic light-blue Godot-like settings
        this.skyMaterial.turbidity = 1.5; 
        this.skyMaterial.luminance = 1.0; 
        this.skyMaterial.inclination = 0.2; // Angle from horizon (0.2 = bright day)
        this.skyMaterial.azimuth = 0.15;
        this.skyMaterial.mieCoefficient = 0.002;
        this.skyMaterial.mieDirectionalG = 0.85;
        this.skyMaterial.rayleigh = 2.0;
        
        skybox.material = this.skyMaterial;
        skybox.isPickable = false;
        
        // Environment intensity
        this.babylonScene.environmentIntensity = 1.0;
    }

    private setupGizmos() {
        this.gizmoManager = new GizmoManager(this.babylonScene);
        this.gizmoManager.usePointerToAttachGizmos = false;
        this.gizmoManager.positionGizmoEnabled = false;
        this.gizmoManager.rotationGizmoEnabled = false;
        this.gizmoManager.scaleGizmoEnabled = false;
        this.gizmoManager.boundingBoxGizmoEnabled = false;
    }

    private applyGizmoMode(mode: GizmoMode) {
        this.gizmoManager.positionGizmoEnabled = false;
        this.gizmoManager.rotationGizmoEnabled = false;
        this.gizmoManager.scaleGizmoEnabled = false;
        this.gizmoManager.boundingBoxGizmoEnabled = false;

        const id = editorState.selectedEntityId;
        if (!id) return;
        const node = this.sceneManager.babylonNodes.get(id);
        if (!(node instanceof Mesh)) return;

        this.gizmoManager.attachToMesh(node);
        if (this.isPlaying) return;
        if (mode === 'move')   this.gizmoManager.positionGizmoEnabled = true;
        if (mode === 'rotate') this.gizmoManager.rotationGizmoEnabled = true;
        if (mode === 'scale')  this.gizmoManager.scaleGizmoEnabled = true;
        if (mode === 'select') this.gizmoManager.boundingBoxGizmoEnabled = true;
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
        const node = this.sceneManager.babylonNodes.get(selectedId);
        if (node instanceof Mesh && !node.name.startsWith('__')) {
            node.renderOutline = true;
            node.outlineColor = Color3.FromHexString('#ff8800');
            node.outlineWidth = 0.025;
            this.applyGizmoMode(editorState.gizmoMode);
        }
    }

    private setupPicking() {
        this.babylonScene.onPointerDown = (evt, pickResult) => {
            if (this.isPlaying) return;
            if (evt.button !== 0) return;
            if (pickResult.hit && pickResult.pickedMesh && !pickResult.pickedMesh.name.startsWith('__')) {
                const entry = [...this.sceneManager.babylonNodes.entries()].find(([, n]) => n === pickResult.pickedMesh);
                if (entry) { editorState.selectEntity(entry[0]); return; }
            }
            editorState.clearSelection();
        };
    }

    public toggleDebugLayer() {
        if (this.debugLayerVisible) {
            this.babylonScene.debugLayer.hide();
        } else {
            this.babylonScene.debugLayer.show({ embedMode: true });
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
            // Switch to Gradient Sky (Godot-like)
            if (!(skybox.material instanceof GradientMaterial)) {
                skybox.material = new GradientMaterial('__skyMat_gradient__', this.babylonScene);
                (skybox.material as GradientMaterial).backFaceCulling = false;
            }
            const gMat = skybox.material as GradientMaterial;
            
            // Apply Energy Multiplier to colors
            const top = Color3.FromHexString(entity.skyTopColor).scale(entity.skyEnergy);
            const hor = Color3.FromHexString(entity.skyHorizonColor).scale(entity.skyEnergy);
            
            gMat.topColor = top;
            gMat.bottomColor = hor;
            
            // Smoother mapping for Curve to offset
            // Godot 0.15 is very subtle. Babylon offset 0.0 is center.
            // Let's map entity.skyCurve (0 to 1) to offset (-0.5 to 0.5)
            gMat.offset = (entity.skyCurve * 2.0) - 1.0; 
            gMat.smoothness = 1.0;
        } else {
            // Switch to Procedural Sky
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
            // In Custom Sky mode, we sync the ambient light to the horizon for realism
            const horizon = Color3.FromHexString(entity.skyHorizonColor);
            const skyAmbient = horizon.scale(entity.skyEnergy * 0.8); // Slightly dimmed ambient
            
            this.babylonScene.ambientColor = skyAmbient;
            if (hemi) {
                hemi.diffuse = skyAmbient;
                hemi.groundColor = skyAmbient.scale(0.2); // Darker floor bounce
                hemi.intensity = entity.environmentIntensity;
            }
        } else {
            // Procedural mode uses the dedicated ambient control
            const amb = Color3.FromHexString(entity.ambientColor);
            this.babylonScene.ambientColor = amb;
            if (hemi) {
                hemi.diffuse = amb;
                hemi.groundColor = new Color3(0.1, 0.1, 0.1);
                hemi.intensity = 1.0;
            }
        }
    }

    public syncEntity(entity: Entity) {
        if (this.sceneManager.babylonNodes.has(entity.id)) {
            // If it already exists, just update environment if it's sky
            if (entity.type === 'Sky') this.updateEnvironment(entity);
            return;
        }

        let node: BabylonNode;

        if (entity.type === 'Mesh') {
            let mesh: Mesh;
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
            } else {
                mesh = MeshBuilder.CreateBox(entity.name, { size: 1 }, this.babylonScene);
            }

            // Apply material
            const mat = new StandardMaterial(`${entity.name}_mat`, this.babylonScene);
            mat.diffuseColor = Color3.FromHexString(entity.materialColor);
            mesh.material = mat;

            // Shadows
            if (this.shadowGenerator) {
                this.shadowGenerator.addShadowCaster(mesh);
            }
            mesh.receiveShadows = entity.receiveShadows;
            mesh.position.y = entity.meshType === 'Plane' ? 0 : 0.5;

            node = mesh;

        } else if (entity.type === 'Light') {
            if (entity.lightType === 'Directional') {
                const dl = new DirectionalLight(entity.name, new Vector3(-0.5, -1, -0.5), this.babylonScene);
                dl.intensity = 1.5;
                dl.diffuse = new Color3(1, 0.95, 0.85);
                dl.position = new Vector3(5, 10, 5);
                node = dl;
            } else if (entity.lightType === 'Point') {
                const pl = new PointLight(entity.name, new Vector3(0, 3, 0), this.babylonScene);
                pl.intensity = 1.0;
                pl.range = 20;
                node = pl;
            } else if (entity.lightType === 'Spot') {
                const sl = new SpotLight(entity.name, new Vector3(0, 5, 0), new Vector3(0, -1, 0), Math.PI / 4, 2, this.babylonScene);
                sl.intensity = 1.5;
                node = sl;
            } else {
                const hl = new HemisphericLight(entity.name, new Vector3(0, 1, 0), this.babylonScene);
                hl.intensity = 0.7;
                node = hl;
            }

        } else if (entity.type === 'Camera') {
            node = new ArcRotateCamera(entity.name, -Math.PI / 2, Math.PI / 3, 10, Vector3.Zero(), this.babylonScene);
        } else if (entity.type === 'Sky') {
            // Sky is managed via skyMaterial — represented as empty transform
            node = new TransformNode(entity.name, this.babylonScene);
        } else {
            node = new TransformNode(entity.name, this.babylonScene);
        }

        node.name = entity.name;
        node.setEnabled(entity.visible);
        this.sceneManager.babylonNodes.set(entity.id, node);
    }

    public startGame() {
        this.isPlaying = true;
        
        // Clear editor selection visuals
        editorState.clearSelection();
        
        // Find main camera
        const mainCamEntity = Array.from(this.sceneManager.entities.values()).find(e => e.type === 'Camera' && e.isMainCamera);
        if (mainCamEntity) {
            const bCam = this.sceneManager.babylonNodes.get(mainCamEntity.id) as ArcRotateCamera;
            if (bCam) {
                // Detach editor camera
                const editorCam = this.babylonScene.getCameraByName('editorCamera');
                editorCam?.detachControl();
                
                // Set main camera as active
                this.babylonScene.activeCamera = bCam;
                bCam.attachControl(this.babylonEngine.getRenderingCanvas(), true);
            }
        }

        this.runtime.start();
    }

    public stopGame() {
        this.isPlaying = false;
        this.runtime.stop();

        // Restore editor camera
        const editorCam = this.babylonScene.getCameraByName('editorCamera');
        if (editorCam) {
            this.babylonScene.activeCamera = editorCam;
            editorCam.attachControl(this.babylonEngine.getRenderingCanvas(), true);
        }
    }
}
