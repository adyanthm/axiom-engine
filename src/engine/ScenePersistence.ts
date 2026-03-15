import type { Entity, EntityType, MeshType, LightType } from './Entity';
import type { CoreEngine } from './CoreEngine';
import { TransformNode } from '@babylonjs/core';

const DB_NAME = 'AxiomEngine';
const DB_VERSION = 1;
const STORE_NAME = 'scene';
const SCENE_KEY = 'scene_v1';

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
}

interface SerializedScene {
    entities: SerializedEntity[];
    selectedEntityId: string | null;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
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
        });

        for (const child of entity.children) queue.push(child);
    }

    const data: SerializedScene = {
        entities: serialized,
        selectedEntityId: null, // don't restore selection
    };

    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data, SCENE_KEY);
        await new Promise<void>((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
        db.close();
    } catch (e) {
        console.warn('Failed to save scene:', e);
    }
}

export async function loadScene(engine: CoreEngine): Promise<boolean> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(SCENE_KEY);
        const data: SerializedScene | undefined = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        db.close();

        if (!data || !data.entities || data.entities.length === 0) return false;

        const sm = engine.sceneManager;
        const entityMap = new Map<string, Entity>();

        // First pass: create all entities (without parenting)
        for (const se of data.entities) {
            const entity = sm.forceCreateEntity(se.id, se.name);
            entity.type = se.type;
            entity.meshType = se.meshType;
            entity.lightType = se.lightType;

            if (se.skyTurbidity !== undefined) entity.skyTurbidity = se.skyTurbidity;
            if (se.skyRayleigh !== undefined) entity.skyRayleigh = se.skyRayleigh;
            if (se.skyMieCoefficient !== undefined) entity.skyMieCoefficient = se.skyMieCoefficient;
            if (se.skyMieDirectionalG !== undefined) entity.skyMieDirectionalG = se.skyMieDirectionalG;
            if (se.skyLuminance !== undefined) entity.skyLuminance = se.skyLuminance;
            if (se.skyInclination !== undefined) entity.skyInclination = se.skyInclination;
            if (se.skyAzimuth !== undefined) entity.skyAzimuth = se.skyAzimuth;
            if (se.environmentIntensity !== undefined) entity.environmentIntensity = se.environmentIntensity;
            if (se.ambientColor !== undefined) entity.ambientColor = se.ambientColor;
            if (se.customSkyEnabled !== undefined) entity.customSkyEnabled = se.customSkyEnabled;
            if (se.skyTopColor !== undefined) entity.skyTopColor = se.skyTopColor;
            if (se.skyHorizonColor !== undefined) entity.skyHorizonColor = se.skyHorizonColor;
            if (se.skyCurve !== undefined) entity.skyCurve = se.skyCurve;
            if (se.skyEnergy !== undefined) entity.skyEnergy = se.skyEnergy;
            if (se.cameraFollowTargetId !== undefined) entity.cameraFollowTargetId = se.cameraFollowTargetId;
            if (se.cameraOffset !== undefined) entity.cameraOffset = se.cameraOffset;
            if (se.script !== undefined) entity.script = se.script;
            if (se.materialColor !== undefined) entity.materialColor = se.materialColor;
            if (se.materialEmissive !== undefined) entity.materialEmissive = se.materialEmissive;
            if (se.emissiveEnabled !== undefined) entity.emissiveEnabled = se.emissiveEnabled;
            if (se.emissiveIntensity !== undefined) entity.emissiveIntensity = se.emissiveIntensity;
            if (se.materialMetallic !== undefined) entity.materialMetallic = se.materialMetallic;
            if (se.materialRoughness !== undefined) entity.materialRoughness = se.materialRoughness;
            if (se.castShadows !== undefined) entity.castShadows = se.castShadows;
            if (se.receiveShadows !== undefined) entity.receiveShadows = se.receiveShadows;
            if (se.visible !== undefined) entity.visible = se.visible;
            if (se.collidable !== undefined) entity.collidable = se.collidable;
            if (se.groundLevelEnabled !== undefined) entity.groundLevelEnabled = se.groundLevelEnabled;
            if (se.groundLevel !== undefined) entity.groundLevel = se.groundLevel;
            if (se.groundLevelCollidable !== undefined) entity.groundLevelCollidable = se.groundLevelCollidable;

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

        // Third pass: sync Babylon nodes and apply transforms
        for (const se of data.entities) {
            const entity = entityMap.get(se.id)!;
            engine.syncEntity(entity);

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
