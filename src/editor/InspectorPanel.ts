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

        const bNode = this.engine.babylonNodes.get(id);
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
        if (entity.type === 'Mesh' && bNode instanceof Mesh) {
            parts.push(`
            <div class="insp-section-header">Material</div>
            <div class="insp-section panel-body">
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
                            <span style="font-size: 10px; opacity: 0.7;">On</span>
                        </label>
                        <input type="color" id="mat-emissive" class="insp-color-swatch" value="${entity.materialEmissive}">
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Energy</div>
                    <div class="insp-field">
                       <div class="insp-slider-row">
                           <input type="range" id="emissive-energy-slider" class="insp-slider" min="0" max="10" step="0.1" value="${entity.emissiveIntensity}">
                           <input type="number" id="emissive-energy-num" class="insp-text-input" style="width: 42px; flex: none;" value="${entity.emissiveIntensity}">
                       </div>
                    </div>
                </div>
                <div class="insp-row">
                    <div class="insp-label">Cast Shadows</div>
                    <div class="insp-field">
                        <label class="insp-toggle">
                            <input type="checkbox" id="cast-shadows" ${entity.castShadows ? 'checked' : ''}>
                            <span class="insp-toggle-track"></span>
                        </label>
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
            <div class="insp-row" id="ambient-row" style="${entity.customSkyEnabled ? 'display: none;' : ''}">
                <div class="insp-label">Ambient Color</div>
                <div class="insp-field">
                    <input type="color" id="ambient-color" class="insp-color-swatch" value="${entity.ambientColor}">
                    <input type="text" id="ambient-color-hex" class="insp-text-input" value="${entity.ambientColor}">
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
            editorState.notifyTransformChanged();
        });
        this.bindColorPair('#sky-hor-color', '#sky-hor-hex', hex => {
            entity.skyHorizonColor = hex;
            this.engine.updateEnvironment(entity);
            editorState.notifyTransformChanged();
        });

        // Sliders helper
        const setupSlider = (sId: string, nId: string, prop: keyof Entity, toFixedDigits: number = 2) => {
            const s = this.container.querySelector<HTMLInputElement>(`#${sId}`);
            const n = this.container.querySelector<HTMLInputElement>(`#${nId}`);
            const update = (v: string) => {
                (entity as any)[prop] = parseFloat(v);
                if (s) s.value = v;
                if (n) n.value = parseFloat(v).toFixed(toFixedDigits);
                this.engine.updateEnvironment(entity);
                editorState.notifyTransformChanged();
            };
            s?.addEventListener('input', () => update(s.value));
            n?.addEventListener('input', () => update(n.value));
        };

        // Sliders for Custom Sky
        setupSlider('sky-curve-slider', 'sky-curve-num', 'skyCurve', 3);
        setupSlider('sky-energy-slider', 'sky-energy-num', 'skyEnergy', 1);

        // --- Bind Sky Events ---
        const bind = (id: string, prop: keyof Entity, isNum = true) => {
            const el = this.container.querySelector<HTMLInputElement>(`#${id}`);
            el?.addEventListener('input', () => {
                const val = isNum ? parseFloat(el.value) : el.value;
                (entity as any)[prop] = val;
                this.engine.updateEnvironment(entity);
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
            editorState.notifyTransformChanged();
        });

        // Sliders for Sun (Procedural)
        setupSlider('sky-inc-slider', 'sky-inc-num', 'skyInclination');
        setupSlider('sky-az-slider', 'sky-az-num', 'skyAzimuth');
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

        // Transform
        if (bNode instanceof TransformNode) {
            const nb = (sel: string, setter: (v: number) => void) => {
                this.container.querySelector<HTMLInputElement>(sel)?.addEventListener('input', e => {
                    const v = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) { setter(v); editorState.notifyTransformChanged(); }
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
                editorState.notifyTransformChanged();
            });
            this.bindColorPair('#mat-emissive', '#mat-emissive-hex', hex => {
                entity.materialEmissive = hex;
                this.engine.applyMaterialToEntity(entity);
                editorState.notifyTransformChanged();
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
        }

        // Lights
        if (bNode instanceof BabylonLight) {
            this.container.querySelector<HTMLInputElement>('#light-intensity')?.addEventListener('input', e => {
                bNode.intensity = parseFloat((e.target as HTMLInputElement).value);
                editorState.notifyTransformChanged();
            });
            this.bindColorPair('#light-color', '#light-color-hex', hex => {
                bNode.diffuse = Color3.FromHexString(hex);
                editorState.notifyTransformChanged();
            });
        }

        // Camera
        if (bNode instanceof ArcRotateCamera) {
            const bind = (id: string, setter: (v: number) => void) => {
                this.container.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', e => {
                    const v = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) { setter(v); editorState.notifyTransformChanged(); }
                });
            };
            bind('cam-fov', v => bNode.fov = v);
            bind('cam-near', v => bNode.minZ = v);
            bind('cam-far', v => bNode.maxZ = v);
        }
    }

    private coordField(id: string, tag: string, val: number, unit: string): string {
        return `
        <div class="coord-box">
            <span class="coord-tag ${tag}">${tag}</span>
            <input type="number" id="${id}" step="0.1" value="${val.toFixed(3)}">
            <span class="coord-unit">${unit}</span>
        </div>`;
    }

    private bindColorPair(swatchSel: string, hexSel: string, onChange: (hex: string) => void) {
        const swatch = this.container.querySelector<HTMLInputElement>(swatchSel);
        const hexInput = this.container.querySelector<HTMLInputElement>(hexSel);
        swatch?.addEventListener('input', e => {
            const h = (e.target as HTMLInputElement).value;
            if (hexInput) hexInput.value = h;
            onChange(h);
        });
        hexInput?.addEventListener('change', e => {
            const h = (e.target as HTMLInputElement).value;
            if (swatch) swatch.value = h;
            onChange(h);
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
