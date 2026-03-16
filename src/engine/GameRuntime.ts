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
                            const body = (node as any).physicsBody;
                            if (body && (node as any).position) {
                                const pos = (node as any).position.add(new Vector3(x, y, z));
                                body.transformData.position.copyFrom(pos);
                            } else if ('position' in node) {
                                (node as any).position.addInPlace(new Vector3(x, y, z));
                            }
                        },
                        move_and_slide: (vx: number, vy: number, vz: number) => {
                            const body = (node as any).physicsBody;
                            const d = (context as any).delta || 0.016;
                            if (body) {
                                body.setLinearVelocity(new Vector3(vx, vy, vz));
                                // Simple grounded check: is vertical velocity nearly zero?
                                const totalVel = body.getLinearVelocity();
                                return Math.abs(totalVel.y) < 0.1;
                            }
                            
                            if (!('position' in node)) return false;
                            const pos = (node as any).position;
                            pos.addInPlace(new Vector3(vx * d, vy * d, vz * d));
                            return false;
                        },
                        rotate_y: (angle: number) => {
                            if ('rotation' in node) {
                                (node as any).rotation.y += angle;
                                const body = (node as any).physicsBody;
                                if (body) {
                                    // Sync physics rotation if it's dynamic
                                    body.transformData.rotation.y = (node as any).rotation.y;
                                }
                            }
                        },
                        set_linear_velocity: (vx: number, vy: number, vz: number) => {
                            const body = (node as any).physicsBody;
                            if (body) body.setLinearVelocity(new Vector3(vx, vy, vz));
                        },
                        get_linear_velocity: () => {
                            const body = (node as any).physicsBody;
                            if (body) {
                                const vel = body.getLinearVelocity();
                                return { x: vel.x, y: vel.y, z: vel.z };
                            }
                            return { x: 0, y: 0, z: 0 };
                        },
                        apply_impulse: (vx: number, vy: number, vz: number) => {
                            const body = (node as any).physicsBody;
                            if (body && (node as any).position) body.applyImpulse(new Vector3(vx, vy, vz), (node as any).position);
                        },
                        is_on_floor: () => {
                            const body = (node as any).physicsBody;
                            if (body) {
                                // Simple raycast or velocity check for floor
                                const vel = body.getLinearVelocity();
                                return Math.abs(vel.y) < 0.01;
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
