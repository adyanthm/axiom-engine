import { Scene, Vector3 } from '@babylonjs/core';
import { SceneManager } from './SceneManager';

export class GameRuntime {
    private sceneManager: SceneManager;
    private activeScripts: Map<string, any> = new Map();
    private isRunning: boolean = false;

    constructor(_scene: Scene, sceneManager: SceneManager) {
        this.sceneManager = sceneManager;
    }

    public start() {
        this.isRunning = true;
        this.initializeScripts();
    }

    public stop() {
        this.isRunning = false;
        this.activeScripts.clear();
    }

    private initializeScripts() {
        for (const entity of Array.from(this.sceneManager.entities.values())) {
            if (entity.script && entity.script.trim() !== '') {
                try {
                    const node = this.sceneManager.babylonNodes.get(entity.id);
                    if (!node) continue;

                    const context = {
                        node: node,
                        entity: entity,
                        Vector3: Vector3,
                        Input: this.createInputManager(),
                        delta: 0,
                        get_node: (name: string) => {
                            const e = Array.from(this.sceneManager.entities.values()).find(en => en.name === name);
                            return e ? this.sceneManager.babylonNodes.get(e.id) : null;
                        },
                        translate: (x: number, y: number, z: number) => {
                            if ('position' in node) {
                                (node as any).position.addInPlace(new Vector3(x, y, z));
                            }
                        },
                        move_and_slide: (vx: number, vy: number, vz: number) => {
                            if (!('position' in node)) return;
                            const pos = (node as any).position;
                            let newPos = pos.add(new Vector3(vx, vy, vz));
                            let collided = false;
                            
                            // 1. Check Global Ground
                            const sky = Array.from(this.sceneManager.entities.values()).find(e => e.type === 'Sky');
                            if (sky && sky.groundLevelEnabled && sky.groundLevelCollidable) {
                                const surfaceY = sky.groundLevel + 0.5;
                                if (pos.y >= surfaceY - 0.01 && newPos.y < surfaceY) {
                                    newPos.y = surfaceY;
                                    collided = true;
                                }
                            }

                            // 2. Check Other Entities (Mesh Collision)
                            for (const otherE of this.sceneManager.entities.values()) {
                                if (otherE.id === entity.id || !otherE.collidable || otherE.type !== 'Mesh') continue;
                                const otherNode = this.sceneManager.babylonNodes.get(otherE.id);
                                if (otherNode && 'position' in otherNode) {
                                    const op = (otherNode as any).position;
                                    
                                    // Extremely simplified AABB (assuming meshes are 1x1x1 scaled)
                                    // Especially for 'Plane' (Floor), we check if we are on top
                                    if (otherE.meshType === 'Plane') {
                                        const dx = Math.abs(newPos.x - op.x);
                                        const dz = Math.abs(newPos.z - op.z);
                                        if (dx < 2.5 && dz < 2.5) { // Ground is 5x5
                                            const surfaceY = op.y + 0.5;
                                            const bottomY = op.y - 0.5;

                                            // 1. Landing from above (Floor)
                                            if (pos.y >= surfaceY - 0.1 && newPos.y < surfaceY) {
                                                newPos.y = surfaceY;
                                                collided = true;
                                            }
                                            // 2. Hitting from below (Ceiling / Bonk)
                                            else if (pos.y <= bottomY + 0.1 && newPos.y > bottomY) {
                                                newPos.y = bottomY;
                                                collided = true;
                                            }
                                        }
                                    } else {
                                        const dist = Vector3.Distance(newPos, op);
                                        if (dist < 1.0) {
                                            newPos = pos.clone(); // Blocked entirely
                                            collided = true;
                                        }
                                    }
                                }
                            }

                            pos.copyFrom(newPos);
                            return collided;
                        },
                        is_on_floor: () => {
                            if (!('position' in node)) return false;
                            const pos = (node as any).position;
                            
                            // Ground check
                            const sky = Array.from(this.sceneManager.entities.values()).find(e => e.type === 'Sky');
                            if (sky && sky.groundLevelEnabled && sky.groundLevelCollidable) {
                                if (Math.abs(pos.y - (sky.groundLevel + 0.5)) < 0.1) return true;
                            }
                            
                            // Mesh check
                            for (const e of this.sceneManager.entities.values()) {
                                if (e.id === entity.id || !e.collidable || e.type !== 'Mesh') continue;
                                const n = this.sceneManager.babylonNodes.get(e.id);
                                if (n && 'position' in n) {
                                    const op = (n as any).position;
                                    if (e.meshType === 'Plane') {
                                        const dx = Math.abs(pos.x - op.x);
                                        const dz = Math.abs(pos.z - op.z);
                                        if (dx < 2.5 && dz < 2.5 && Math.abs(pos.y - (op.y + 0.5)) < 0.1) return true;
                                    } else if (Vector3.Distance(pos, op) < 1.05) return true;
                                }
                            }
                            return false;
                        }
                    };

                    const scriptFunc = new Function('ctx', `
                        with(ctx) {
                            ${entity.script}
                            return {
                                _ready: typeof _ready !== 'undefined' ? _ready : null,
                                _process: typeof _process !== 'undefined' ? _process : null
                            };
                        }
                    `);

                    const hooks = scriptFunc(context);
                    this.activeScripts.set(entity.id, { hooks, context });

                    if (hooks._ready) {
                        hooks._ready.call(context);
                    }
                } catch (e) {
                    console.error(`Error in script for ${entity.name}:`, e);
                }
            }
        }
    }

    public update(delta: number) {
        if (!this.isRunning) return;

        for (const [id, data] of this.activeScripts.entries()) {
            if (data.hooks._process) {
                try {
                    data.context.delta = delta;
                    data.hooks._process.call(data.context, delta);
                } catch (e) {
                    console.error(`Error in _process for entity ${id}:`, e);
                }
            }
        }

        for (const entity of Array.from(this.sceneManager.entities.values())) {
            if (entity.type === 'Camera' && entity.cameraFollowTargetId) {
                const cam = this.sceneManager.babylonNodes.get(entity.id);
                const target = this.sceneManager.babylonNodes.get(entity.cameraFollowTargetId);
                
                if (cam && target && 'position' in cam && 'position' in target) {
                    const targetPos = (target as any).position;
                    const offset = new Vector3(entity.cameraOffset.x, entity.cameraOffset.y, entity.cameraOffset.z);
                    (cam as any).position.copyFrom(targetPos.add(offset));
                    (cam as any).setTarget(targetPos);
                }
            }
        }
    }

    private createInputManager() {
        const keys: Record<string, boolean> = {};
        const onDown = (e: KeyboardEvent) => keys[e.code] = true;
        const onUp = (e: KeyboardEvent) => keys[e.code] = false;
        
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);

        return {
            is_action_pressed: (action: string) => {
                if (action === 'ui_up' || action === 'move_forward') return keys['KeyW'] || keys['ArrowUp'];
                if (action === 'ui_down' || action === 'move_backward') return keys['KeyS'] || keys['ArrowDown'];
                if (action === 'ui_left' || action === 'move_left') return keys['KeyA'] || keys['ArrowLeft'];
                if (action === 'ui_right' || action === 'move_right') return keys['KeyD'] || keys['ArrowRight'];
                if (action === 'jump') return keys['Space'];
                return keys[action] || false;
            }
        };
    }
}
