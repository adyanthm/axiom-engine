import type { Entity, EntityType, MeshType, LightType } from './Entity';
import type { CoreEngine } from './CoreEngine';
import { TransformNode } from '@babylonjs/core';

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

        if (bNode instanceof TransformNode) {
            const p = bNode.position;
            const r = bNode.rotation;
            const s = bNode.scaling;
            transform = {
                px: p.x, py: p.y, pz: p.z,
                rx: r.x, ry: r.y, rz: r.z,
                sx: s.x, sy: s.y, sz: s.z,
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
                skyTurbidity: se.skyTurbidity,
                skyRayleigh: se.skyRayleigh,
                skyMieCoefficient: se.skyMieCoefficient,
                skyMieDirectionalG: se.skyMieDirectionalG,
                skyLuminance: se.skyLuminance,
                skyInclination: se.skyInclination,
                skyAzimuth: se.skyAzimuth,
                environmentIntensity: se.environmentIntensity,
                ambientColor: se.ambientColor,
                customSkyEnabled: se.customSkyEnabled,
                skyTopColor: se.skyTopColor,
                skyHorizonColor: se.skyHorizonColor,
                skyCurve: se.skyCurve,
                skyEnergy: se.skyEnergy,
                cameraFollowTargetId: se.cameraFollowTargetId,
                cameraOffset: se.cameraOffset,
                script: se.script,
                materialColor: se.materialColor,
                materialEmissive: se.materialEmissive,
                emissiveEnabled: se.emissiveEnabled,
                emissiveIntensity: se.emissiveIntensity,
                materialMetallic: se.materialMetallic,
                materialRoughness: se.materialRoughness,
                castShadows: se.castShadows,
                receiveShadows: se.receiveShadows,
                visible: se.visible,
                collidable: se.collidable,
                groundLevelEnabled: se.groundLevelEnabled,
                groundLevel: se.groundLevel,
                groundLevelCollidable: se.groundLevelCollidable,
                isMainCamera: se.isMainCamera,
                modelAssetId: se.modelAssetId,
                hasCollider: se.hasCollider,
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
                if (bNode instanceof TransformNode) {
                    const t = se.transform;
                    bNode.position.set(t.px, t.py, t.pz);
                    bNode.rotation.set(t.rx, t.ry, t.rz);
                    bNode.scaling.set(t.sx, t.sy, t.sz);
                }
            }
        }

        return true;
    } catch (e) {
        console.warn('Failed to load scene:', e);
        return false;
    }
}