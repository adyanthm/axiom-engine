import {
    TransformNode, Color3, Mesh, Observer, Scene,
    Light as BabylonLight, ArcRotateCamera
} from '@babylonjs/core';
import { SceneManager } from '../engine/SceneManager';
import { CoreEngine } from '../engine/CoreEngine';
import { editorState } from './EditorState';
import { Entity } from '../engine/Entity';

export class InspectorPanel {
    private container: HTMLElement;
    private sceneManager: SceneManager;
    private engine: CoreEngine;
    private syncObserver: Observer<Scene> | null = null;

    constructor(containerId: string, sceneManager: SceneManager, engine: CoreEngine) {
        this.container = document.getElementById(containerId)!;
        this.sceneManager = sceneManager;
        this.engine = engine;
        editorState.onSelectionChanged.push(() => this.render());
        editorState.onTransformChanged.push(() => this.render());
        this.render();
    }

    render() {
        this.stopLiveSync();

        const id = editorState.selectedEntityId;
        
        // --- Special case: No selection = Show help text or global settings ---
        if (!id) {
            this.renderEmptyState();
            return;
        }

        const entity = this.sceneManager.entities.get(id);
        if (!entity) { this.container.innerHTML = ''; return; }

        if (entity.type === 'Sky') {
            this.renderSkySettings(entity);
            return;
        }

        const bNode = this.sceneManager.babylonNodes.get(id);
        const parts: string[] = [];

        // ─── Godot Node Header ──────────────────────────────────────────
        parts.push(`
        <div class="insp-node-header">
            <span class="insp-node-icon">${this.iconFor(entity.type)}</span>
            <span class="insp-node-type">${this.labelFor(entity)} (${entity.meshType || entity.lightType || ''})</span>
        </div>`);

        // ─── Basic Settings (Name) ───────────────────────────────────────
        parts.push(`
        <div class="insp-section">
            <div class="insp-row">
                <div class="insp-label">Name</div>
                <div class="insp-field">
                    <input class="insp-text-input" type="text" id="prop-name" value="${this.esc(entity.name)}">
                </div>
            </div>
        </div>`);

        // ─── Transform ───────────────────────────────────────────────────
        if (bNode instanceof TransformNode) {
            const p = bNode.position, r = bNode.rotation, s = bNode.scaling;
            parts.push(`
            <div class="insp-section-header">Transform</div>
            <div class="insp-section">
                <div class="insp-row">
                    <div class="insp-label">Position</div>
                    <div class="insp-field">
                        ${this.coordField('px', 'x', p.x, 'm')}
                        ${this.coordField('py', 'y', p.y, 'm')}
                        ${this.coordField('pz', 'z', p.z, 'm')}
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Rotation</div>
                    <div class="insp-field">
                        ${this.coordField('rx', 'x', r.x, '°')}
                        ${this.coordField('ry', 'y', r.y, '°')}
                        ${this.coordField('rz', 'z', r.z, '°')}
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Scale</div>
                    <div class="insp-field">
                        ${this.coordField('sx', 'x', s.x, '')}
                        ${this.coordField('sy', 'y', s.y, '')}
                        ${this.coordField('sz', 'z', s.z, '')}
                    </div>
                </div>
            </div>`);
        }

        // ─── Material (Mesh) ─────────────────────────────────────────────
        // ─── Material / Mesh Settings ──────────────────────────────────────
        if (entity.type === 'Mesh' && (bNode instanceof Mesh || entity.meshType === 'ImportedModel')) {
            const isModel = entity.meshType === 'ImportedModel';
            
            parts.push(`
            <div class="insp-section-header">${isModel ? 'Model Info' : 'Material'}</div>
            <div class="insp-section panel-body">
                ${!isModel ? `
                <div class="insp-row">
                    <div class="insp-label">Albedo</div>
                    <div class="insp-field">
                        <input type="color" id="mat-color" class="insp-color-swatch" value="${entity.materialColor}">
                        <input type="text" id="mat-color-hex" class="insp-text-input" value="${entity.materialColor}">
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Emissive</div>
                    <div class="insp-field">
                        <label class="insp-toggle">
                            <input type="checkbox" id="emissive-enabled" ${entity.emissiveEnabled ? 'checked' : ''}>
                            <span class="insp-toggle-track"></span>
                        </label>
                        <input type="color" id="mat-emissive" class="insp-color-swatch" value="${entity.materialEmissive}">
                    </div>
                </div>
                ` : `
                <div class="insp-row">
                    <div class="insp-label">Asset</div>
                    <div class="insp-field">
                        <div class="asset-tag">${entity.name}</div>
                    </div>
                </div>
                `}
                <div class="insp-row">
                    <div class="insp-label">Cast Shadows</div>
                    <div class="insp-field">
                        <label class="insp-toggle">
                            <input type="checkbox" id="cast-shadows" ${entity.castShadows ? 'checked' : ''}>
                            <span class="insp-toggle-track"></span>
                        </label>
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Visible</div>
                    <div class="insp-field">
                        <label class="insp-toggle">
                            <input type="checkbox" id="prop-visible" ${entity.visible ? 'checked' : ''}>
                            <span class="insp-toggle-track"></span>
                        </label>
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label" title="Enable physical collisions. Requires a Collider.">Collidable</div>
                    <div class="insp-field">
                        <label class="insp-toggle ${!entity.hasCollider ? 'disabled' : ''}">
                            <input type="checkbox" id="prop-collidable" ${entity.collidable && entity.hasCollider ? 'checked' : ''} ${!entity.hasCollider ? 'disabled' : ''}>
                            <span class="insp-toggle-track"></span>
                        </label>
                    </div>
                </div>
            </div>`);

            // ─── Physics ──────────────────────────────────────────────────
            parts.push(`
            <div class="insp-section-header">Physics</div>
            <div class="insp-section">
                <div class="insp-row">
                    <div class="insp-label">Body Type</div>
                    <div class="insp-field">
                        <select id="physics-type" class="insp-text-input" style="appearance: auto; -webkit-appearance: auto;">
                            <option value="None" ${entity.physicsType === 'None' ? 'selected' : ''}>None</option>
                            <option value="Static" ${entity.physicsType === 'Static' ? 'selected' : ''}>Static</option>
                            <option value="Dynamic" ${entity.physicsType === 'Dynamic' ? 'selected' : ''}>Dynamic</option>
                            <option value="Kinematic" ${entity.physicsType === 'Kinematic' ? 'selected' : ''}>Kinematic</option>
                        </select>
                    </div>
                </div>
                <div id="physics-props" style="${entity.physicsType === 'None' ? 'display: none;' : ''}">
                    <div class="insp-row">
                        <div class="insp-label">Mass</div>
                        <div class="insp-field">
                            <input class="insp-text-input" id="physics-mass" type="number" step="0.1" value="${(entity.mass ?? 1.0).toFixed(2)}">
                        </div>
                    </div>
                    <div class="insp-row">
                        <div class="insp-label">Friction</div>
                        <div class="insp-field">
                            <input class="insp-text-input" id="physics-friction" type="number" step="0.1" value="${(entity.friction ?? 0.5).toFixed(2)}">
                        </div>
                    </div>
                    <div class="insp-row">
                        <div class="insp-label">Restitution</div>
                        <div class="insp-field">
                            <input class="insp-text-input" id="physics-restitution" type="number" step="0.1" value="${(entity.restitution ?? 0.1).toFixed(2)}">
                        </div>
                    </div>
                    <div class="insp-row">
                        <div class="insp-label">Linear Damping</div>
                        <div class="insp-field">
                            <input class="insp-text-input" id="physics-lin-damp" type="number" step="0.01" value="${(entity.linearDamping ?? 0.0).toFixed(2)}">
                        </div>
                    </div>
                    <div class="insp-row">
                        <div class="insp-label">Angular Damping</div>
                        <div class="insp-field">
                            <input class="insp-text-input" id="physics-ang-damp" type="number" step="0.01" value="${(entity.angularDamping ?? 0.0).toFixed(2)}">
                        </div>
                    </div>
                    ${this.renderCollisionBitfield('Layer', entity.collisionLayer ?? 1, 'collision-layer')}
                    ${this.renderCollisionBitfield('Mask', entity.collisionMask ?? 1, 'collision-mask')}
                    <div class="insp-row">
                        <div class="insp-label">Lock Rotation</div>
                        <div class="insp-field" style="gap: 10px;">
                            <label class="insp-toggle"><input type="checkbox" id="phys-lock-x" ${entity.lockRotationX ? 'checked' : ''}><div class="insp-toggle-track"></div> X</label>
                            <label class="insp-toggle"><input type="checkbox" id="phys-lock-y" ${entity.lockRotationY ? 'checked' : ''}><div class="insp-toggle-track"></div> Y</label>
                            <label class="insp-toggle"><input type="checkbox" id="phys-lock-z" ${entity.lockRotationZ ? 'checked' : ''}><div class="insp-toggle-track"></div> Z</label>
                        </div>
                    </div>
                </div>
            </div>`);
        }

        // ─── Light ───────────────────────────────────────────────────────
        if (bNode instanceof BabylonLight) {
            const dc = this.color3ToHex(bNode.diffuse);
            parts.push(`
            <div class="insp-section-header">Light3D</div>
            <div class="insp-section">
                <div class="insp-row">
                    <div class="insp-label">Intensity</div>
                    <div class="insp-field">
                        <input class="insp-text-input" id="light-intensity" type="number" step="0.1" value="${bNode.intensity.toFixed(2)}">
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Color</div>
                    <div class="insp-field">
                        <input type="color" id="light-color" class="insp-color-swatch" value="${dc}">
                        <input type="text" id="light-color-hex" class="insp-text-input" value="${dc}">
                    </div>
                </div>
            </div>`);
        }

        // ─── Camera ──────────────────────────────────────────────────────
        if (bNode instanceof ArcRotateCamera) {
            parts.push(`
            <div class="insp-section-header">Camera3D</div>
            <div class="insp-section">
                <div class="insp-row">
                    <div class="insp-label">FOV</div>
                    <div class="insp-field">
                        <input class="insp-text-input" id="cam-fov" type="number" step="0.01" value="${bNode.fov.toFixed(2)}">
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Near</div>
                    <div class="insp-field">
                        <input class="insp-text-input" id="cam-near" type="number" step="0.1" value="${bNode.minZ.toFixed(2)}">
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Far</div>
                    <div class="insp-field">
                        <input class="insp-text-input" id="cam-far" type="number" step="10" value="${bNode.maxZ.toFixed(0)}">
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Main Camera</div>
                    <div class="insp-field">
                        <label class="insp-toggle">
                            <input type="checkbox" id="cam-is-main" ${entity.isMainCamera ? 'checked' : ''}>
                            <span class="insp-toggle-track"></span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="insp-section-header">Camera Follow</div>
            <div class="insp-section">
                <div class="insp-row">
                    <div class="insp-label" title="The node to follow">Follow Target</div>
                    <div class="insp-field">
                        <select id="cam-follow-target" class="insp-text-input" style="appearance: auto; -webkit-appearance: auto;">
                            <option value="">None</option>
                            ${this.getFollowTargetOptions(entity.cameraFollowTargetId)}
                        </select>
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label" title="Distance from target">Target Offset</div>
                    <div class="insp-field">
                        ${this.coordField('ox', 'x', entity.cameraOffset.x, '')}
                        ${this.coordField('oy', 'y', entity.cameraOffset.y, '')}
                        ${this.coordField('oz', 'z', entity.cameraOffset.z, '')}
                    </div>
                </div>
            </div>`);
        }

        this.container.innerHTML = parts.join('');

        // ═══ Event Bindings ═══════════════════════════════════════════════
        this.bindBaseEvents(entity, bNode);
    }

    private renderSkySettings(entity: Entity) {
        const parts: string[] = [];
        parts.push(`
        <div class="insp-node-header">
            <span class="insp-node-icon">🌤</span>
            <span class="insp-node-type">WorldEnvironment</span>
        </div>
        <div class="insp-section-header">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="custom-sky-enabled" ${entity.customSkyEnabled ? 'checked' : ''}>
                <span>Custom Sky</span>
            </label>
        </div>
        <div id="custom-sky-controls" class="insp-section" style="${entity.customSkyEnabled ? '' : 'display: none;'}">
            <div class="insp-row">
                <div class="insp-label">Sky Color</div>
                <div class="insp-field">
                    <input type="color" id="sky-top-color" class="insp-color-swatch" value="${entity.skyTopColor}">
                    <input type="text" id="sky-top-hex" class="insp-text-input" value="${entity.skyTopColor}">
                </div>
            </div>
            <div class="insp-row">
                <div class="insp-label">Horizon Color</div>
                <div class="insp-field">
                    <input type="color" id="sky-hor-color" class="insp-color-swatch" value="${entity.skyHorizonColor}">
                    <input type="text" id="sky-hor-hex" class="insp-text-input" value="${entity.skyHorizonColor}">
                </div>
            </div>
            <div class="insp-row">
                <div class="insp-label">Curve</div>
                <div class="insp-field">
                    <div class="insp-slider-row">
                        <input type="range" id="sky-curve-slider" class="insp-slider" min="0" max="1" step="0.01" value="${entity.skyCurve}">
                        <input type="number" id="sky-curve-num" class="insp-text-input" style="width: 42px; flex: none;" value="${entity.skyCurve.toFixed(3)}">
                    </div>
                </div>
            </div>
            <div class="insp-row">
                <div class="insp-label" title="Energy Multiplier">Energy</div>
                <div class="insp-field">
                    <div class="insp-slider-row">
                        <input type="range" id="sky-energy-slider" class="insp-slider" min="0" max="5" step="0.1" value="${entity.skyEnergy}">
                        <input type="number" id="sky-energy-num" class="insp-text-input" style="width: 42px; flex: none;" value="${entity.skyEnergy.toFixed(1)}">
                    </div>
                </div>
            </div>
        </div>

        <div id="procedural-sky-controls" style="${entity.customSkyEnabled ? 'display: none;' : ''}">
            <div class="insp-section-header">Atmosphere (Scattering)</div>
            <div class="insp-section">
                <div class="insp-row">
                    <div class="insp-label" title="Atmospheric thickness (haze)">Turbidity</div>
                    <div class="insp-field">
                        <input class="insp-text-input" id="sky-turb" type="number" step="0.1" value="${entity.skyTurbidity.toFixed(2)}">
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label" title="Sky depth (Blue intensity)">Rayleigh</div>
                    <div class="insp-field">
                        <input class="insp-text-input" id="sky-ray" type="number" step="0.1" value="${entity.skyRayleigh.toFixed(2)}">
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label" title="Aerosol scattering">Mie Coeff</div>
                    <div class="insp-field">
                        <input class="insp-text-input" id="sky-mie" type="number" step="0.001" value="${entity.skyMieCoefficient.toFixed(4)}">
                    </div>
                </div>
            </div>
            <div class="insp-section-header">Sun Position</div>
            <div class="insp-section">
                <div class="insp-row">
                    <div class="insp-label">Inclination</div>
                    <div class="insp-field">
                        <div class="insp-slider-row">
                            <input type="range" id="sky-inc-slider" class="insp-slider" min="-0.5" max="0.5" step="0.01" value="${entity.skyInclination}">
                            <input type="number" id="sky-inc-num" class="insp-text-input" style="width: 42px; flex: none;" value="${entity.skyInclination.toFixed(2)}">
                        </div>
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Azimuth</div>
                    <div class="insp-field">
                        <div class="insp-slider-row">
                            <input type="range" id="sky-az-slider" class="insp-slider" min="0" max="1" step="0.01" value="${entity.skyAzimuth}">
                            <input type="number" id="sky-az-num" class="insp-text-input" style="width: 42px; flex: none;" value="${entity.skyAzimuth.toFixed(2)}">
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="insp-section-header">Global Lighting</div>
        <div class="insp-section">
            <div class="insp-row" id="lum-row" style="${entity.customSkyEnabled ? 'display: none;' : ''}">
                <div class="insp-label">Luminance</div>
                <div class="insp-field">
                    <input class="insp-text-input" id="sky-lum" type="number" step="0.1" value="${entity.skyLuminance.toFixed(2)}">
                </div>
            </div>
            <div class="insp-row">
                <div class="insp-label">Env Intensity</div>
                <div class="insp-field">
                    <input class="insp-text-input" id="env-intensity" type="number" step="0.1" value="${entity.environmentIntensity.toFixed(2)}">
                </div>
            </div>
            </div>
        </div>
        
        <div class="insp-section-header">Ground Level (Physics)</div>
        <div class="insp-section">
            <div class="insp-row">
                <div class="insp-label">Enable Ground</div>
                <div class="insp-field">
                    <label class="insp-toggle">
                        <input type="checkbox" id="ground-enabled" ${entity.groundLevelEnabled ? 'checked' : ''}>
                        <span class="insp-toggle-track"></span>
                    </label>
                </div>
            </div>
            <div class="insp-row" id="ground-pos-row" style="${entity.groundLevelEnabled ? '' : 'display: none;'}">
                <div class="insp-label">Y Position</div>
                <div class="insp-field">
                    <input class="insp-text-input" id="ground-y" type="number" step="0.1" value="${entity.groundLevel.toFixed(2)}">
                </div>
            </div>
            <div class="insp-row" id="ground-coll-row" style="${entity.groundLevelEnabled ? '' : 'display: none;'}">
                <div class="insp-label">Collidable</div>
                <div class="insp-field">
                    <label class="insp-toggle">
                        <input type="checkbox" id="ground-collidable" ${entity.groundLevelCollidable ? 'checked' : ''}>
                        <span class="insp-toggle-track"></span>
                    </label>
                </div>
            </div>
        </div>`);

        this.container.innerHTML = parts.join('');

        // --- Bind Events ---
        const toggle = this.container.querySelector<HTMLInputElement>('#custom-sky-enabled');
        toggle?.addEventListener('change', () => {
            entity.customSkyEnabled = toggle.checked;
            this.engine.updateEnvironment(entity);
            this.render(); // Re-render to show/hide sections
            editorState.notifyTransformChanged();
        });

        this.bindColorPair('#sky-top-color', '#sky-top-hex', hex => {
            entity.skyTopColor = hex;
            this.engine.updateEnvironment(entity);
        });
        this.bindColorPair('#sky-hor-color', '#sky-hor-hex', hex => {
            entity.skyHorizonColor = hex;
            this.engine.updateEnvironment(entity);
        });

        // Sliders helper - real-time preview without re-render, save on release
        const setupSlider = (sId: string, nId: string, prop: keyof Entity, toFixedDigits: number = 2) => {
            const s = this.container.querySelector<HTMLInputElement>(`#${sId}`);
            const n = this.container.querySelector<HTMLInputElement>(`#${nId}`);
            
            // Update preview (real-time, no re-render, no save)
            const updatePreview = (v: string) => {
                (entity as any)[prop] = parseFloat(v);
                if (s) s.value = v;
                if (n) n.value = parseFloat(v).toFixed(toFixedDigits);
                this.engine.updateEnvironment(entity);
            };
            
            // Save on release
            const save = () => {
                editorState.notifyTransformChanged();
            };
            
            // Slider: real-time preview, save on release
            s?.addEventListener('input', () => updatePreview(s.value));
            s?.addEventListener('change', save);
            
            // Number input: real-time preview, save on change
            n?.addEventListener('input', () => updatePreview(n.value));
            n?.addEventListener('change', save);
        };

        // Sliders for Custom Sky
        setupSlider('sky-curve-slider', 'sky-curve-num', 'skyCurve', 3);
        setupSlider('sky-energy-slider', 'sky-energy-num', 'skyEnergy', 1);

        // --- Bind Sky Events (real-time preview, save on change) ---
        const bind = (id: string, prop: keyof Entity, isNum = true) => {
            const el = this.container.querySelector<HTMLInputElement>(`#${id}`);
            el?.addEventListener('input', () => {
                const val = isNum ? parseFloat(el.value) : el.value;
                (entity as any)[prop] = val;
                this.engine.updateEnvironment(entity);
            });
            el?.addEventListener('change', () => {
                editorState.notifyTransformChanged();
            });
        };

        bind('sky-turb', 'skyTurbidity');
        bind('sky-ray', 'skyRayleigh');
        bind('sky-mie', 'skyMieCoefficient');
        bind('sky-lum', 'skyLuminance');
        bind('env-intensity', 'environmentIntensity');

        this.bindColorPair('#ambient-color', '#ambient-color-hex', hex => {
            entity.ambientColor = hex;
            this.engine.updateEnvironment(entity);
        });

        // Sliders for Sun (Procedural)
        setupSlider('sky-inc-slider', 'sky-inc-num', 'skyInclination');
        setupSlider('sky-az-slider', 'sky-az-num', 'skyAzimuth');

        // Ground Level Events
        const gEnabled = this.container.querySelector<HTMLInputElement>('#ground-enabled');
        gEnabled?.addEventListener('change', () => {
            entity.groundLevelEnabled = gEnabled.checked;
            this.render(); // Redraw to show/hide
            editorState.notifyTransformChanged();
        });

        const gColl = this.container.querySelector<HTMLInputElement>('#ground-collidable');
        gColl?.addEventListener('change', () => {
            entity.groundLevelCollidable = gColl.checked;
            editorState.notifyTransformChanged();
        });

        const gY = this.container.querySelector<HTMLInputElement>('#ground-y');
        gY?.addEventListener('input', () => {
            entity.groundLevel = parseFloat(gY.value) || 0;
            editorState.notifyTransformChanged();
        });
    }

    private renderEmptyState() {
        this.container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🎮</div>
            <h3>Scene Inspector</h3>
            <p>Select a node to edit its properties.</p>
        </div>`;
    }

    private bindBaseEvents(entity: Entity, bNode: any) {
        // Name
        const nameEl = this.container.querySelector<HTMLInputElement>('#prop-name');
        nameEl?.addEventListener('change', () => {
            entity.name = nameEl.value;
            if (bNode) bNode.name = entity.name;
            editorState.notifyTreeChanged();
        });

        // Transform - real-time preview, save on change
        if (bNode instanceof TransformNode) {
            const nb = (sel: string, setter: (v: number) => void) => {
                this.container.querySelector<HTMLInputElement>(sel)?.addEventListener('input', e => {
                    const v = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) setter(v);
                });
                this.container.querySelector<HTMLInputElement>(sel)?.addEventListener('change', () => {
                    editorState.notifyTransformChanged();
                });
            };
            nb('#px', v => bNode.position.x = v);
            nb('#py', v => bNode.position.y = v);
            nb('#pz', v => bNode.position.z = v);
            nb('#rx', v => bNode.rotation.x = v);
            nb('#ry', v => bNode.rotation.y = v);
            nb('#rz', v => bNode.rotation.z = v);
            nb('#sx', v => bNode.scaling.x = Math.max(0.0001, v));
            nb('#sy', v => bNode.scaling.y = Math.max(0.0001, v));
            nb('#sz', v => bNode.scaling.z = Math.max(0.0001, v));
            this.startLiveSync(bNode);
        }

        // Material
        if (entity.type === 'Mesh' && bNode instanceof Mesh) {
            this.bindColorPair('#mat-color', '#mat-color-hex', hex => {
                entity.materialColor = hex;
                this.engine.applyMaterialToEntity(entity);
            });
            this.bindColorPair('#mat-emissive', '#mat-emissive-hex', hex => {
                entity.materialEmissive = hex;
                this.engine.applyMaterialToEntity(entity);
            });
            this.container.querySelector<HTMLInputElement>('#emissive-enabled')?.addEventListener('change', e => {
                entity.emissiveEnabled = (e.target as HTMLInputElement).checked;
                this.engine.applyMaterialToEntity(entity);
                editorState.notifyTransformChanged();
            });
            const eSlider = this.container.querySelector<HTMLInputElement>('#emissive-energy-slider');
            const eNum = this.container.querySelector<HTMLInputElement>('#emissive-energy-num');
            const updateEm = (v: string) => {
                entity.emissiveIntensity = parseFloat(v);
                if (eSlider) eSlider.value = v;
                if (eNum) eNum.value = v;
                this.engine.applyMaterialToEntity(entity);
                editorState.notifyTransformChanged();
            };
            eSlider?.addEventListener('input', () => updateEm(eSlider.value));
            eNum?.addEventListener('input', () => updateEm(eNum.value));

            this.container.querySelector<HTMLInputElement>('#cast-shadows')?.addEventListener('change', e => {
                entity.castShadows = (e.target as HTMLInputElement).checked;
                editorState.notifyTransformChanged();
            });
            this.container.querySelector<HTMLInputElement>('#prop-visible')?.addEventListener('change', e => {
                entity.visible = (e.target as HTMLInputElement).checked;
                if (bNode) bNode.setEnabled(entity.visible);
                editorState.notifyTransformChanged();
            });
            this.container.querySelector<HTMLInputElement>('#prop-collidable')?.addEventListener('change', e => {
                entity.collidable = (e.target as HTMLInputElement).checked;
                editorState.notifyTransformChanged();
            });
        }

        // Lights
        if (bNode instanceof BabylonLight) {
            this.container.querySelector<HTMLInputElement>('#light-intensity')?.addEventListener('input', e => {
                bNode.intensity = parseFloat((e.target as HTMLInputElement).value);
            });
            this.container.querySelector<HTMLInputElement>('#light-intensity')?.addEventListener('change', () => {
                editorState.notifyTransformChanged();
            });
            this.bindColorPair('#light-color', '#light-color-hex', hex => {
                bNode.diffuse = Color3.FromHexString(hex);
            });
        }

        // Camera
        if (bNode instanceof ArcRotateCamera) {
            const bind = (id: string, setter: (v: number) => void) => {
                this.container.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', e => {
                    const v = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) setter(v);
                });
                this.container.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', () => {
                    editorState.notifyTransformChanged();
                });
            };
            bind('cam-fov', v => bNode.fov = v);
            bind('cam-near', v => bNode.minZ = v);
            bind('cam-far', v => bNode.maxZ = v);

            this.container.querySelector<HTMLSelectElement>('#cam-follow-target')?.addEventListener('change', e => {
                entity.cameraFollowTargetId = (e.target as HTMLSelectElement).value || null;
                editorState.notifyTransformChanged();
            });

            const bindOff = (id: string, prop: 'x'|'y'|'z') => {
                this.container.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', e => {
                    entity.cameraOffset[prop] = parseFloat((e.target as HTMLInputElement).value);
                    editorState.notifyTransformChanged();
                });
            };
            bindOff('ox', 'x'); bindOff('oy', 'y'); bindOff('oz', 'z');

            this.container.querySelector<HTMLInputElement>('#cam-is-main')?.addEventListener('change', e => {
                const checked = (e.target as HTMLInputElement).checked;
                
                if (checked) {
                    // Turn off any other main camera
                    for (const other of this.sceneManager.entities.values()) {
                        if (other.type === 'Camera') {
                            other.isMainCamera = (other.id === entity.id);
                        }
                    }
                } else {
                    entity.isMainCamera = false;
                }
                
                editorState.notifyTreeChanged(); // Icon in tree might change
                editorState.notifyTransformChanged(); // For saving
            });
        }

        // Physics
        const pType = this.container.querySelector<HTMLSelectElement>('#physics-type');
        pType?.addEventListener('change', () => {
            entity.physicsType = pType.value as any;
            const node = this.sceneManager.babylonNodes.get(entity.id);
            if (node) {
                this.engine.applyPhysicsToEntity(entity);
                this.engine.updateColliderVisuals(entity, node);
            }
            this.render(); // Re-render to show/hide properties
            editorState.notifyTransformChanged();
        });

        const bindPhys = (id: string, prop: keyof Entity) => {
            const el = this.container.querySelector<HTMLInputElement>(`#${id}`);
            el?.addEventListener('input', () => {
                (entity as any)[prop] = parseFloat(el.value) || 0;
                this.engine.applyPhysicsToEntity(entity);
            });
            el?.addEventListener('change', () => {
                editorState.notifyTransformChanged();
            });
        };
        bindPhys('physics-mass', 'mass');
        bindPhys('physics-friction', 'friction');
        bindPhys('physics-restitution', 'restitution');
        bindPhys('physics-lin-damp', 'linearDamping');
        bindPhys('physics-ang-damp', 'angularDamping');

        const bindBitfield = (prefix: string, prop: 'collisionLayer' | 'collisionMask') => {
            for (let i = 0; i < 8; i++) {
                const el = this.container.querySelector<HTMLInputElement>(`#${prefix}-bit-${i}`);
                el?.addEventListener('change', () => {
                    if (el.checked) {
                        (entity as any)[prop] |= (1 << i);
                    } else {
                        (entity as any)[prop] &= ~(1 << i);
                    }
                    this.engine.applyPhysicsToEntity(entity);
                    editorState.notifyTransformChanged();
                });
            }
        };
        bindBitfield('collision-layer', 'collisionLayer');
        bindBitfield('collision-mask', 'collisionMask');

        const bindCheck = (id: string, prop: keyof Entity) => {
            this.container.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (e) => {
                (entity as any)[prop] = (e.target as HTMLInputElement).checked;
                this.engine.applyPhysicsToEntity(entity);
                editorState.notifyTransformChanged();
            });
        };
        bindCheck('phys-lock-x', 'lockRotationX');
        bindCheck('phys-lock-y', 'lockRotationY');
        bindCheck('phys-lock-z', 'lockRotationZ');
    }

    private getFollowTargetOptions(currentId: string | null): string {
        let options = '';
        for (const [id, e] of this.sceneManager.entities.entries()) {
            if (e.type === 'Mesh' || e.type === 'Node') {
                options += `<option value="${id}" ${id === currentId ? 'selected' : ''}>${e.name}</option>`;
            }
        }
        return options;
    }

    private coordField(id: string, tag: string, val: number, unit: string): string {
        return `
        <div class="coord-box">
            <span class="coord-tag ${tag}">${tag}</span>
            <input type="number" id="${id}" step="0.1" value="${val.toFixed(3)}">
            <span class="coord-unit">${unit}</span>
        </div>`;
    }

    private renderCollisionBitfield(label: string, value: number, prefix: string): string {
        let bits = '';
        for (let i = 0; i < 8; i++) {
            const checked = (value & (1 << i)) !== 0;
            bits += `
            <div class="bit-toggle" title="Layer ${i + 1}">
                <input type="checkbox" id="${prefix}-bit-${i}" ${checked ? 'checked' : ''}>
                <label for="${prefix}-bit-${i}">${i + 1}</label>
            </div>`;
        }
        return `
        <div class="insp-row">
            <div class="insp-label">${label}</div>
            <div class="insp-field bitfield">
                ${bits}
            </div>
        </div>`;
    }

    private bindColorPair(swatchSel: string, hexSel: string, onChange: (hex: string) => void) {
        const swatch = this.container.querySelector<HTMLInputElement>(swatchSel);
        const hexInput = this.container.querySelector<HTMLInputElement>(hexSel);
        swatch?.addEventListener('input', e => {
            const h = (e.target as HTMLInputElement).value;
            if (hexInput) hexInput.value = h;
            onChange(h); // Preview only
        });
        swatch?.addEventListener('change', () => {
            editorState.notifyTransformChanged(); // Save on release
        });
        hexInput?.addEventListener('change', e => {
            const h = (e.target as HTMLInputElement).value;
            if (swatch) swatch.value = h;
            onChange(h);
            editorState.notifyTransformChanged(); // Save on change
        });
    }

    private startLiveSync(tn: TransformNode) {
        this.syncObserver = this.engine.babylonScene.onBeforeRenderObservable.add(() => {
            if (document.activeElement?.tagName === 'INPUT') return;
            const set = (id: string, v: number) => {
                const el = this.container.querySelector<HTMLInputElement>(`#${id}`);
                if (el) el.value = v.toFixed(3);
            };
            set('px', tn.position.x); set('py', tn.position.y); set('pz', tn.position.z);
            set('rx', tn.rotation.x); set('ry', tn.rotation.y); set('rz', tn.rotation.z);
            set('sx', tn.scaling.x); set('sy', tn.scaling.y); set('sz', tn.scaling.z);
        });
    }

    private stopLiveSync() {
        if (this.syncObserver) {
            this.engine.babylonScene.onBeforeRenderObservable.remove(this.syncObserver);
            this.syncObserver = null;
        }
    }

    private color3ToHex(c: Color3): string {
        const f = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
        return `#${f(c.r)}${f(c.g)}${f(c.b)}`;
    }

    private iconFor(t: string): string {
        const m: any = { Mesh: '📦', Light: '💡', Camera: '🎥', Node: '⬜', Sky: '🌤' };
        return m[t] || '⬜';
    }

    private labelFor(e: any): string {
        if (e.type === 'Mesh') return 'MeshInstance3D';
        if (e.type === 'Light') return 'Light3D';
        if (e.type === 'Camera') return 'Camera3D';
        if (e.type === 'Sky') return 'WorldEnvironment';
        return 'Node3D';
    }

    private esc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
