import {
    Scene, Mesh, MeshBuilder, Vector3, Color3, Color4,
    StandardMaterial, TransformNode,
    ArcRotateCamera,
    Quaternion, Matrix
} from '@babylonjs/core';
import { SceneManager } from './SceneManager';
import { Entity } from './Entity';
import { editorState } from '../editor/EditorState';

const GIZMO_PREFIX = '__gizmo__';
const CAM_COLOR    = new Color3(0.55, 0.82, 1.0);   // sky-blue for cameras
const LIGHT_COLOR  = new Color3(1.0,  0.85, 0.2);   // warm yellow for directional lights
const DIM_ALPHA    = 0.6;

/**
 * Manages all editor-only helper wireframe / icon meshes.
 *   - Camera entities  → perspective frustum wireframe (sky-blue)
 *   - Directional Light → sun disk + rays + direction arrow (warm yellow)
 * All helpers are editor-only: hidden on Play, restored on Stop.
 */
export class EditorGizmos {
    /** Store the raw Babylon scene separately (SceneManager doesn't expose it) */
    private bScene: Scene;
    private sceneManager: SceneManager;
    /** entityId → array of helper objects owned by that entity */
    private helpers: Map<string, Array<Mesh | TransformNode>> = new Map();
    private isVisible: boolean = true;

    constructor(babylonScene: Scene, sceneManager: SceneManager) {
        this.bScene = babylonScene;
        this.sceneManager = sceneManager;

        editorState.onTreeChanged.push(() => this.syncAll());
        // Movement is now handled via parenting, so onTransformChanged is no longer needed here
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    public syncAll() {
        // Sync existing entities
        for (const [id, entity] of this.sceneManager.entities) {
            this.syncEntity(id, entity);
        }
        // Remove helpers for entities that no longer exist
        for (const id of Array.from(this.helpers.keys())) {
            if (!this.sceneManager.entities.has(id)) {
                this.disposeHelpers(id);
            }
        }
    }

    public syncEntity(id: string, entity: Entity) {
        const bNode = this.sceneManager.babylonNodes.get(id);
        if (!bNode) { this.disposeHelpers(id); return; }
        this.disposeHelpers(id);

        if (entity.type === 'Camera') {
            this.buildCameraFrustum(id, bNode as ArcRotateCamera);
        } else if (entity.type === 'Light' && entity.lightType === 'Directional') {
            this.buildSunIcon(id, bNode as TransformNode, entity);
        } else {
            this.disposeHelpers(id);
        }

        // Apply current visibility state to newly created helpers
        const items = this.helpers.get(id);
        if (items) {
            let typeEnabled = true;
            if (entity.type === 'Camera') typeEnabled = editorState.showCameraGizmos;
            else if (entity.type === 'Light') typeEnabled = editorState.showLightGizmos;

            items.forEach(m => m.setEnabled(this.isVisible && editorState.showGizmos && typeEnabled));
        }
    }

    public showAll() {
        this.isVisible = true;
        this.helpers.forEach((items, id) => {
            const entity = this.sceneManager.entities.get(id);
            let typeEnabled = true;
            if (entity) {
                if (entity.type === 'Camera') typeEnabled = editorState.showCameraGizmos;
                else if (entity.type === 'Light') typeEnabled = editorState.showLightGizmos;
            }
            items.forEach(m => m.setEnabled(true && editorState.showGizmos && typeEnabled));
        });
    }

    public hideAll() {
        this.isVisible = false;
        this.helpers.forEach(items => items.forEach(m => m.setEnabled(false)));
    }

    public disposeAll() {
        for (const id of Array.from(this.helpers.keys())) this.disposeHelpers(id);
    }

    // ─── Camera Frustum ──────────────────────────────────────────────────────

    private buildCameraFrustum(id: string, cam: ArcRotateCamera) {
        this.disposeHelpers(id);
        const items: Array<Mesh | TransformNode> = [];

        const fov    = cam.fov    ?? 0.8;
        const aspect = this.bScene.getEngine().getAspectRatio(cam);
        const near   = 0.15;
        const far    = 2.5;

        const hnear = Math.tan(fov / 2) * near;
        const hfar  = Math.tan(fov / 2) * far;
        const wnear = hnear * aspect;
        const wfar  = hfar  * aspect;

        // Corners in camera-local space (looking down +Z from the origin)
        const NTL = new Vector3(-wnear,  hnear, near);
        const NTR = new Vector3( wnear,  hnear, near);
        const NBL = new Vector3(-wnear, -hnear, near);
        const NBR = new Vector3( wnear, -hnear, near);
        const FTL = new Vector3(-wfar,   hfar,  far);
        const FTR = new Vector3( wfar,   hfar,  far);
        const FBL = new Vector3(-wfar,  -hfar,  far);
        const FBR = new Vector3( wfar,  -hfar,  far);

        const c4 = new Color4(CAM_COLOR.r, CAM_COLOR.g, CAM_COLOR.b, DIM_ALPHA);
        const lines: Vector3[][] = [
            // Near rect
            [NTL, NTR], [NTR, NBR], [NBR, NBL], [NBL, NTL],
            // Far rect
            [FTL, FTR], [FTR, FBR], [FBR, FBL], [FBL, FTL],
            // Connecting edges
            [NTL, FTL], [NTR, FTR], [NBL, FBL], [NBR, FBR],
        ];
        const colors = lines.map(seg => seg.map(() => new Color4(c4.r, c4.g, c4.b, c4.a)));

        const frustum = MeshBuilder.CreateLineSystem(
            `${GIZMO_PREFIX}cam_frustum_${id}`,
            { lines, colors },
            this.bScene
        ) as unknown as Mesh;
        frustum.isPickable = false;

        // Anchor that follows the camera's eye position and orientation
        const anchor = new TransformNode(`${GIZMO_PREFIX}cam_anchor_${id}`, this.bScene);
        anchor.parent = cam; // Parent to the actual camera node!
        (frustum as any).parent = anchor;

        const updateAnchor = () => {
            anchor.position.copyFrom(cam.globalPosition);
            // Build rotation from camera axes
            const forward = cam.getForwardRay(1).direction.normalize();
            const up      = cam.upVector.normalize();
            const right   = Vector3.Cross(forward, up).normalize();
            const realUp  = Vector3.Cross(right, forward).normalize();
            // Matrix col-major (Babylon is row-major internally, but FromValues is column)
            const m = Matrix.FromValues(
                right.x,   right.y,   right.z,   0,
                realUp.x,  realUp.y,  realUp.z,  0,
                forward.x, forward.y, forward.z, 0,
                0, 0, 0, 1
            );
            const q = new Quaternion();
            m.decompose(undefined, q, undefined);
            anchor.rotationQuaternion = q;
        };

        this.bScene.onBeforeRenderObservable.add(updateAnchor);
        (anchor as any).__unsubscribeFn = () =>
            this.bScene.onBeforeRenderObservable.removeCallback(updateAnchor);

        items.push(frustum, anchor);
        this.helpers.set(id, items);
    }

    // ─── Directional Light Sun Icon ──────────────────────────────────────────

    private buildSunIcon(id: string, proxy: any, entity: Entity) {
        this.disposeHelpers(id);
        const items: Array<Mesh | TransformNode> = [];

        // Main container parented to proxy ensures movement is synced automatically
        const container = new TransformNode(`${GIZMO_PREFIX}sun_container_${id}`, this.bScene);
        container.parent = proxy;
        items.push(container);

        const mat = this.getOrCreateMat(`${GIZMO_PREFIX}light_mat_${id}`, LIGHT_COLOR);
        
        // ── Sun body (sphere) ──
        const sunBody = MeshBuilder.CreateSphere(
            `${GIZMO_PREFIX}sun_body_${id}`,
            { diameter: 0.5, segments: 8 },
            this.bScene
        );
        sunBody.material = mat;
        sunBody.isPickable = false;
        (sunBody as any).parent = container;
        items.push(sunBody);

        // ── Rays (8 short lines radiating outward) ──
        const RAY_COUNT = 8;
        const INNER = 0.35;
        const OUTER = 0.7;
        const rayLines: Vector3[][] = [];
        const rayColors: Color4[][] = [];
        const rc4 = new Color4(LIGHT_COLOR.r, LIGHT_COLOR.g, LIGHT_COLOR.b, 0.9);

        for (let i = 0; i < RAY_COUNT; i++) {
            const a = (i / RAY_COUNT) * Math.PI * 2;
            rayLines.push([
                new Vector3(Math.cos(a) * INNER, Math.sin(a) * INNER, 0),
                new Vector3(Math.cos(a) * OUTER, Math.sin(a) * OUTER, 0),
            ]);
            rayColors.push([rc4, rc4]);
        }

        // Anchor for rays so we can billboard them
        const rayAnchor = new TransformNode(`${GIZMO_PREFIX}ray_anchor_${id}`, this.bScene);
        rayAnchor.parent = container;

        const rays = MeshBuilder.CreateLineSystem(
            `${GIZMO_PREFIX}sun_rays_${id}`,
            { lines: rayLines, colors: rayColors },
            this.bScene
        ) as unknown as Mesh;
        rays.isPickable = false;
        (rays as any).parent = rayAnchor;
        items.push(rays, rayAnchor);

        // ── Direction arrow (shows where light aims) ──
        const edX = entity.lightDirection?.x ?? -1;
        const edY = entity.lightDirection?.y ?? -2;
        const edZ = entity.lightDirection?.z ?? -1;
        const dir = new Vector3(edX, edY, edZ).normalizeToNew();
        
        // Arrow is parented to container (proxy position), so it starts at Zero locally
        const arrowStart = Vector3.Zero();
        const arrowEnd   = dir.scale(2.0);
        const perpV      = this.perp(dir).scale(0.2);
        const arrowHead1 = arrowEnd.subtract(dir.scale(0.4)).add(perpV);
        const arrowHead2 = arrowEnd.subtract(dir.scale(0.4)).subtract(perpV);

        const arrowLines: Vector3[][] = [
            [arrowStart, arrowEnd],
            [arrowEnd, arrowHead1],
            [arrowEnd, arrowHead2],
        ];
        const ac4 = new Color4(LIGHT_COLOR.r, LIGHT_COLOR.g, LIGHT_COLOR.b, 0.95);
        const arrowColors = arrowLines.map(seg => seg.map(() => new Color4(ac4.r, ac4.g, ac4.b, ac4.a)));

        const arrow = MeshBuilder.CreateLineSystem(
            `${GIZMO_PREFIX}sun_arrow_${id}`,
            { lines: arrowLines, colors: arrowColors },
            this.bScene
        ) as unknown as Mesh;
        arrow.isPickable = false;
        (arrow as any).parent = container;
        items.push(arrow);

        // ── Billboard update: make the sun body + rays face the editor camera ──
        const updateBillboard = () => {
            const cam = this.bScene.getCameraByName('editorCamera') as ArcRotateCamera | null;
            if (!cam) return;

            const sunPos = container.getAbsolutePosition();
            const toCamera = cam.globalPosition.subtract(sunPos).normalize();
            const worldUp  = Vector3.Up();
            const right    = Vector3.Cross(toCamera, worldUp).normalize();
            const realUp   = Vector3.Cross(right, toCamera).normalize();

            const bm = Matrix.FromValues(
                right.x,   right.y,   right.z,   0,
                realUp.x,  realUp.y,  realUp.z,  0,
                toCamera.x, toCamera.y, toCamera.z, 0,
                0, 0, 0, 1
            );
            const q = new Quaternion();
            bm.decompose(undefined, q, undefined);
            sunBody.rotationQuaternion = q.clone();
            rayAnchor.rotationQuaternion = q.clone();
        };

        this.bScene.onBeforeRenderObservable.add(updateBillboard);
        (sunBody as any).__unsubscribeFn = () =>
            this.bScene.onBeforeRenderObservable.removeCallback(updateBillboard);

        this.helpers.set(id, items);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private perp(v: Vector3): Vector3 {
        if (Math.abs(v.y) < 0.99) return Vector3.Cross(v, Vector3.Up()).normalize();
        return Vector3.Cross(v, Vector3.Right()).normalize();
    }

    private getOrCreateMat(name: string, color: Color3): StandardMaterial {
        const existing = this.bScene.getMaterialByName(name) as StandardMaterial | null;
        if (existing) return existing;
        const mat = new StandardMaterial(name, this.bScene);
        mat.diffuseColor  = color;
        mat.emissiveColor = color.scale(0.75);
        mat.disableLighting = true;
        return mat;
    }

    private disposeHelpers(id: string) {
        const items = this.helpers.get(id);
        if (!items) return;
        items.forEach(m => {
            if ((m as any).__unsubscribeFn) (m as any).__unsubscribeFn();
            m.dispose();
        });
        this.helpers.delete(id);
    }
}
