import type { Entity, EntityType, MeshType, LightType, PhysicsType } from './Entity';
import type { CoreEngine } from './CoreEngine';
import { Vector3 } from '@babylonjs/core';

const DB_NAME = 'AxiomEngine';
const DB_VERSION = 1;
const STORE_NAME = 'scene';
const SCENE_KEY = 'scene_v1';

// Cache DB connection to avoid reopening
let _dbPromise: Promise<IDBDatabase> | null = null;
function getDB(): Promise<IDBDatabase> {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

interface SerializedTransform {
    px: number; py: number; pz: number;
    rx: number; ry: number; rz: number;
    sx: number; sy: number; sz: number;
}

interface SerializedEntity {
    id: string;
    name: string;
    type: EntityType;
    meshType?: MeshType;
    lightType?: LightType;
    parentId: string | null;
    transform?: SerializedTransform;

    // Properties
    skyTurbidity?: number;
    skyRayleigh?: number;
    skyMieCoefficient?: number;
    skyMieDirectionalG?: number;
    skyLuminance?: number;
    skyInclination?: number;
    skyAzimuth?: number;
    environmentIntensity?: number;
    ambientColor?: string;
    customSkyEnabled?: boolean;
    skyTopColor?: string;
    skyHorizonColor?: string;
    skyCurve?: number;
    skyEnergy?: number;
    cameraFollowTargetId?: string | null;
    cameraOffset?: { x: number, y: number, z: number };
    script?: string;
    materialColor?: string;
    materialEmissive?: string;
    emissiveEnabled?: boolean;
    emissiveIntensity?: number;
    materialMetallic?: number;
    materialRoughness?: number;
    castShadows?: boolean;
    receiveShadows?: boolean;
    visible?: boolean;
    collidable?: boolean;
    groundLevelEnabled?: boolean;
    groundLevel?: number;
    groundLevelCollidable?: boolean;
    isMainCamera?: boolean;
    modelAssetId?: string | null;
    hasCollider?: boolean;

    // Physics
    physicsType?: PhysicsType;
    mass?: number;
    friction?: number;
    restitution?: number;
    linearDamping?: number;
    angularDamping?: number;
    collisionLayer?: number;
    collisionMask?: number;
    lockRotationX?: boolean;
    lockRotationY?: boolean;
    lockRotationZ?: boolean;

    // Grid and Camera
    showGrid?: boolean;
    debugCamera?: boolean;

    // Shadows and Light
    lightShadowEnabled?: boolean;
    lightShadowMapSize?: number;
    lightShadowDarkness?: number;
    lightShadowBias?: number;
    lightShadowBlur?: string;
    lightDirection?: { x: number, y: number, z: number };
}

interface SerializedScene {
    entities: SerializedEntity[];
    selectedEntityId: string | null;
}

export async function saveScene(engine: CoreEngine): Promise<void> {
    const sm = engine.sceneManager;
    const serialized: SerializedEntity[] = [];

    // BFS through hierarchy to maintain order
    const queue: Entity[] = [...sm.root.children];
    while (queue.length > 0) {
        const entity = queue.shift()!;
        const bNode = engine.sceneManager.babylonNodes.get(entity.id);
        let transform: SerializedTransform | undefined;

        if (bNode && ('position' in bNode)) {
            const p = (bNode as any).position;
            const q = (bNode as any).rotationQuaternion;
            const r = q ? q.toEulerAngles() : ((bNode as any).rotation ?? Vector3.Zero());
            const s = (bNode as any).scaling ?? { x: 1, y: 1, z: 1 };
            
            transform = {
                px: Number(p.x || 0), py: Number(p.y || 0), pz: Number(p.z || 0),
                rx: Number(r.x || 0), ry: Number(r.y || 0), rz: Number(r.z || 0),
                sx: Number(s.x || 1), sy: Number(s.y || 1), sz: Number(s.z || 1),
            };
        }

        serialized.push({
            id: entity.id,
            name: entity.name,
            type: entity.type,
            meshType: entity.meshType,
            lightType: entity.lightType,
            parentId: entity.parent?.id ?? null,
            transform,

            skyTurbidity: entity.skyTurbidity,
            skyRayleigh: entity.skyRayleigh,
            skyMieCoefficient: entity.skyMieCoefficient,
            skyMieDirectionalG: entity.skyMieDirectionalG,
            skyLuminance: entity.skyLuminance,
            skyInclination: entity.skyInclination,
            skyAzimuth: entity.skyAzimuth,
            environmentIntensity: entity.environmentIntensity,
            ambientColor: entity.ambientColor,
            customSkyEnabled: entity.customSkyEnabled,
            skyTopColor: entity.skyTopColor,
            skyHorizonColor: entity.skyHorizonColor,
            skyCurve: entity.skyCurve,
            skyEnergy: entity.skyEnergy,
            cameraFollowTargetId: entity.cameraFollowTargetId,
            cameraOffset: entity.cameraOffset,
            script: entity.script,
            materialColor: entity.materialColor,
            materialEmissive: entity.materialEmissive,
            emissiveEnabled: entity.emissiveEnabled,
            emissiveIntensity: entity.emissiveIntensity,
            materialMetallic: entity.materialMetallic,
            materialRoughness: entity.materialRoughness,
            castShadows: entity.castShadows,
            receiveShadows: entity.receiveShadows,
            visible: entity.visible,
            collidable: entity.collidable,
            groundLevelEnabled: entity.groundLevelEnabled,
            groundLevel: entity.groundLevel,
            groundLevelCollidable: entity.groundLevelCollidable,
            isMainCamera: entity.isMainCamera,
            modelAssetId: entity.modelAssetId,
            hasCollider: entity.hasCollider,

            physicsType: entity.physicsType,
            mass: entity.mass,
            friction: entity.friction,
            restitution: entity.restitution,
            linearDamping: entity.linearDamping,
            angularDamping: entity.angularDamping,
            collisionLayer: entity.collisionLayer,
            collisionMask: entity.collisionMask,
            lockRotationX: entity.lockRotationX,
            lockRotationY: entity.lockRotationY,
            lockRotationZ: entity.lockRotationZ,

            showGrid: entity.showGrid,
            debugCamera: entity.debugCamera,

            lightShadowEnabled: entity.lightShadowEnabled,
            lightShadowMapSize: entity.lightShadowMapSize,
            lightShadowDarkness: entity.lightShadowDarkness,
            lightShadowBias: entity.lightShadowBias,
            lightShadowBlur: entity.lightShadowBlur,
            lightDirection: entity.lightDirection,
        });

        for (const child of entity.children) queue.push(child);
    }

    const data: SerializedScene = {
        entities: serialized,
        selectedEntityId: null,
    };

    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data, SCENE_KEY);
        await new Promise<void>((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
        console.log(`[ScenePersistence] Saved ${serialized.length} entities to IndexedDB`);
    } catch (e) {
        console.warn('Failed to save scene:', e);
    }
}

export async function loadScene(engine: CoreEngine): Promise<boolean> {
    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(SCENE_KEY);
        const data: SerializedScene | undefined = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });

        if (!data || !data.entities || data.entities.length === 0) return false;

        const sm = engine.sceneManager;
        const entityMap = new Map<string, Entity>();

        // Single pass: create entities, set properties, and wire parents
        for (const se of data.entities) {
            const entity = sm.forceCreateEntity(se.id, se.name);
            entity.type = se.type;
            entity.meshType = se.meshType;
            entity.lightType = se.lightType;

            // Copy all properties in one go using object spread
            Object.assign(entity, {
                skyTurbidity: se.skyTurbidity ?? entity.skyTurbidity,
                skyRayleigh: se.skyRayleigh ?? entity.skyRayleigh,
                skyMieCoefficient: se.skyMieCoefficient ?? entity.skyMieCoefficient,
                skyMieDirectionalG: se.skyMieDirectionalG ?? entity.skyMieDirectionalG,
                skyLuminance: se.skyLuminance ?? entity.skyLuminance,
                skyInclination: se.skyInclination ?? entity.skyInclination,
                skyAzimuth: se.skyAzimuth ?? entity.skyAzimuth,
                environmentIntensity: se.environmentIntensity ?? entity.environmentIntensity,
                ambientColor: se.ambientColor ?? entity.ambientColor,
                customSkyEnabled: se.customSkyEnabled ?? entity.customSkyEnabled,
                skyTopColor: se.skyTopColor ?? entity.skyTopColor,
                skyHorizonColor: se.skyHorizonColor ?? entity.skyHorizonColor,
                skyCurve: se.skyCurve ?? entity.skyCurve,
                skyEnergy: se.skyEnergy ?? entity.skyEnergy,
                cameraFollowTargetId: se.cameraFollowTargetId ?? entity.cameraFollowTargetId,
                cameraOffset: se.cameraOffset ?? entity.cameraOffset,
                script: se.script ?? entity.script,
                materialColor: se.materialColor ?? entity.materialColor,
                materialEmissive: se.materialEmissive ?? entity.materialEmissive,
                emissiveEnabled: se.emissiveEnabled ?? entity.emissiveEnabled,
                emissiveIntensity: se.emissiveIntensity ?? entity.emissiveIntensity,
                materialMetallic: se.materialMetallic ?? entity.materialMetallic,
                materialRoughness: se.materialRoughness ?? entity.materialRoughness,
                castShadows: se.castShadows ?? entity.castShadows,
                receiveShadows: se.receiveShadows ?? entity.receiveShadows,
                visible: se.visible ?? entity.visible,
                collidable: se.collidable ?? entity.collidable,
                groundLevelEnabled: se.groundLevelEnabled ?? entity.groundLevelEnabled,
                groundLevel: se.groundLevel ?? entity.groundLevel,
                groundLevelCollidable: se.groundLevelCollidable ?? entity.groundLevelCollidable,
                isMainCamera: se.isMainCamera ?? entity.isMainCamera,
                modelAssetId: se.modelAssetId ?? entity.modelAssetId,
                hasCollider: se.hasCollider ?? entity.hasCollider,

                physicsType: se.physicsType ?? entity.physicsType,
                mass: se.mass ?? entity.mass,
                friction: se.friction ?? entity.friction,
                restitution: se.restitution ?? entity.restitution,
                linearDamping: se.linearDamping ?? entity.linearDamping,
                angularDamping: se.angularDamping ?? entity.angularDamping,
                collisionLayer: se.collisionLayer ?? entity.collisionLayer,
                collisionMask: se.collisionMask ?? entity.collisionMask,
                lockRotationX: se.lockRotationX ?? entity.lockRotationX,
                lockRotationY: se.lockRotationY ?? entity.lockRotationY,
                lockRotationZ: se.lockRotationZ ?? entity.lockRotationZ,

                showGrid: se.showGrid ?? entity.showGrid,
                debugCamera: se.debugCamera ?? entity.debugCamera,

                lightShadowEnabled: se.lightShadowEnabled ?? entity.lightShadowEnabled,
                lightShadowMapSize: se.lightShadowMapSize ?? entity.lightShadowMapSize,
                lightShadowDarkness: se.lightShadowDarkness ?? entity.lightShadowDarkness,
                lightShadowBias: se.lightShadowBias ?? entity.lightShadowBias,
                lightShadowBlur: se.lightShadowBlur ?? entity.lightShadowBlur,
                lightDirection: se.lightDirection ? { ...se.lightDirection } : entity.lightDirection,
            });

            entityMap.set(se.id, entity);
        }

        // Second pass: wire up parents
        for (const se of data.entities) {
            const entity = entityMap.get(se.id)!;
            if (se.parentId) {
                const parent = entityMap.get(se.parentId) ?? sm.root;
                parent.addChild(entity);
            } else {
                sm.root.addChild(entity);
            }
        }

        // Third pass: sync Babylon nodes, apply transforms, and update environment
        for (const se of data.entities) {
            const entity = entityMap.get(se.id)!;
            engine.syncEntity(entity);

            // Apply environment settings for Sky entities
            if (entity.type === 'Sky') {
                engine.updateEnvironment(entity);
            }

            if (se.transform) {
                const bNode = engine.sceneManager.babylonNodes.get(se.id);

                if (bNode && ('position' in bNode)) {
                    const t = se.transform;
                    (bNode as any).position.set(t.px, t.py, t.pz);

                    // If the node has a rotationQuaternion (like cameras or lights), 
                    // we must clear it so our Euler rotation (.rotation) is applied!
                    if ((bNode as any).rotationQuaternion !== undefined) {
                        (bNode as any).rotationQuaternion = null;
                        if ((bNode as any).rotation) {
                            (bNode as any).rotation.set(t.rx, t.ry, t.rz);
                        }
                    } else if ((bNode as any).rotation) {
                        (bNode as any).rotation.set(t.rx, t.ry, t.rz);
                    }
                    if ('scaling' in bNode && t.sx !== undefined) {
                        (bNode as any).scaling.set(t.sx, t.sy, t.sz);
                    }
                }
            }
        }

        return true;
    } catch (e) {
        console.warn('Failed to load scene:', e);
        return false;
    }
}