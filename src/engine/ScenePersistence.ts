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
        const bNode = engine.babylonNodes.get(entity.id);
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
                const bNode = engine.babylonNodes.get(se.id);
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
