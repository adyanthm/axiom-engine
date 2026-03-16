import './style.css';
import { CoreEngine } from './engine/CoreEngine';
import { HierarchyPanel } from './editor/HierarchyPanel';
import { InspectorPanel } from './editor/InspectorPanel';
import { ScriptPanel } from './editor/ScriptPanel';
import { FileSystemPanel } from './editor/FileSystemPanel';
import { assetDB } from './editor/AssetDatabase';
import { editorState } from './editor/EditorState';
import type { GizmoMode, ViewMode } from './editor/EditorState';
import { saveScene, loadScene } from './engine/ScenePersistence';

// Debounced save so we don't thrash IndexedDB on every keystroke
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(engine: CoreEngine) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveScene(engine), 500);
}

const initEditor = async () => {
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    const engine = await CoreEngine.Create(canvas);
    const sm = engine.sceneManager;

    // Wire up panels
    new HierarchyPanel('scene-tree', sm);
    new InspectorPanel('inspector-content', sm, engine);
    new ScriptPanel('script-panel', sm);
    
    const fsPanel = new FileSystemPanel(document.getElementById('filesystem-tree')!);
    
    // Wire up FileSystem uploads
    const uploadBtn = document.getElementById('btn-upload-asset');
    const uploadInput = document.getElementById('asset-upload-input') as HTMLInputElement;
    
    uploadBtn?.addEventListener('click', () => uploadInput?.click());
    uploadInput?.addEventListener('change', (e) => fsPanel.handleUpload(e));

    // --- Workspace Tabs ---
    const viewTabs = ['tab-2d', 'tab-3d', 'tab-script', 'tab-game', 'tab-assetlib'];
    const viewMap: Record<string, ViewMode> = {
        'tab-2d': '2d',
        'tab-3d': '3d',
        'tab-script': 'script',
        'tab-game': 'game',
        'tab-assetlib': 'assetlib'
    };

    viewTabs.forEach(id => {
        const btn = document.getElementById(id);
        btn?.addEventListener('click', () => {
            editorState.setViewMode(viewMap[id]);
        });
    });

    editorState.onViewModeChanged.push((mode) => {
        viewTabs.forEach(id => {
            const btn = document.getElementById(id);
            btn?.classList.toggle('active', viewMap[id] === mode);
        });

        // Hide/Show main panels
        const viewport = document.getElementById('viewport-panel')!;
        const scriptPanel = document.getElementById('script-panel')!;

        viewport.classList.toggle('hidden', mode !== '3d' && mode !== '2d');
        scriptPanel.classList.toggle('hidden', mode !== 'script');
    });

    // Auto-save on any tree change (add node, rename, etc.)
    editorState.onTreeChanged.push(() => scheduleSave(engine));

    // --- Viewport Drag & Drop ---
    const viewportPanel = document.getElementById('viewport-panel')!;
    viewportPanel.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        viewportPanel.style.outline = '2px solid var(--g-accent)';
    });

    viewportPanel.addEventListener('dragleave', () => {
        viewportPanel.style.outline = 'none';
    });

    viewportPanel.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        viewportPanel.style.outline = 'none';

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        for (const file of Array.from(files)) {
            const name = file.name.toLowerCase();
            if (name.endsWith('.glb') || name.endsWith('.gltf') || name.endsWith('.obj')) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const data = event.target?.result as string;
                    const asset = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        type: 'model/gltf-binary',
                        size: file.size,
                        data: data
                    };
                    await assetDB.saveAsset(asset);
                    fsPanel.init();

                    const modelEntity = sm.createEntity(file.name, sm.root.children[0] || sm.root);
                    modelEntity.type = 'Mesh';
                    modelEntity.meshType = 'ImportedModel';
                    modelEntity.modelAssetId = asset.id;
                    engine.syncEntity(modelEntity);
                    editorState.selectEntity(modelEntity.id);
                    editorState.notifyTreeChanged();
                };
                reader.readAsDataURL(file);
            }
        }
    });
    // Auto-save when inspector updates transforms (inspector fires this)
    editorState.onTransformChanged.push(() => scheduleSave(engine));

    // Try to restore from IndexedDB
    const restored = await loadScene(engine);

    if (!restored) {
        // Default scene: root "main" + DirectionalLight + Camera
        const sceneRoot = sm.createEntity('main');
        sceneRoot.type = 'Node';
        engine.syncEntity(sceneRoot);

        const env = sm.createEntity('WorldEnvironment', sceneRoot);
        env.type = 'Sky';
        engine.syncEntity(env);

        const dirLight = sm.createEntity('DirectionalLight3D', sceneRoot);
        dirLight.type = 'Light';
        dirLight.lightType = 'Directional';
        engine.syncEntity(dirLight);

        const cam = sm.createEntity('Camera3D', sceneRoot);
        cam.type = 'Camera';
        cam.isMainCamera = true;
        engine.syncEntity(cam);

        // --- Default Starter Content ---
        const cube = sm.createEntity('Cube', sceneRoot);
        cube.type = 'Mesh';
        cube.meshType = 'Cube';
        cube.physicsType = 'Dynamic';
        cube.mass = 1.0;
        cube.script = `// Physics-based Cube Controller
const SPEED = 10;
const JUMP_IMPULSE = 5;

function _ready() {
    console.log("Physics Player Ready!");
}

function _process(delta) {
    let move = new Vector3(0, 0, 0);
    
    if (Input.is_action_pressed("move_forward"))  move.z += 1;
    if (Input.is_action_pressed("move_backward")) move.z -= 1;
    if (Input.is_action_pressed("move_left"))     move.x -= 1;
    if (Input.is_action_pressed("move_right"))    move.x += 1;

    if (move.length() > 0) {
        move.normalize();
        let curVel = get_linear_velocity();
        set_linear_velocity(move.x * SPEED, curVel.y, move.z * SPEED);
    }

    if (Input.is_action_pressed("jump") && is_on_floor()) {
        apply_impulse(0, JUMP_IMPULSE, 0);
    }
}`;
        engine.syncEntity(cube);

        const plane = sm.createEntity('Floor', sceneRoot);
        plane.type = 'Mesh';
        plane.meshType = 'Plane';
        plane.physicsType = 'Static';
        plane.materialColor = '#2d2d2d';
        engine.syncEntity(plane);
        
        // Setup initial camera follow
        cam.cameraFollowTargetId = cube.id;
        cam.cameraOffset = { x: 0, y: 5, z: -10 };
    }

    editorState.notifyTreeChanged();

    // Default tool = Move (like Godot)
    editorState.setGizmoMode('move');
    setActiveTool('tool-move');

    // --- Tool buttons ---
    const toolMap: Record<string, GizmoMode> = {
        'tool-select': 'select',
        'tool-move': 'move',
        'tool-rotate': 'rotate',
        'tool-scale': 'scale',
    };

    Object.entries(toolMap).forEach(([id, mode]) => {
        document.getElementById(id)?.addEventListener('click', () => {
            editorState.setGizmoMode(mode);
            setActiveTool(id);
        });
    });

    const colBtn = document.getElementById('tool-collision');
    colBtn?.addEventListener('click', () => {
        const id = editorState.selectedEntityId;
        if (!id) return;
        const entity = sm.entities.get(id);
        if (entity && entity.type === 'Mesh') {
            entity.hasCollider = !entity.hasCollider;
            const node = sm.babylonNodes.get(id);
            if (node) {
                engine.updateColliderVisuals(entity, node);
                engine.applyPhysicsToEntity(entity);
            }
            updateCollisionBtnState();
            scheduleSave(engine);
        }
    });

    function updateCollisionBtnState() {
        if (!colBtn) return;
        const id = editorState.selectedEntityId;
        const entity = id ? sm.entities.get(id) : null;
        const isMesh = entity && (entity.type === 'Mesh');
        
        colBtn.style.opacity = isMesh ? '1' : '0.4';
        colBtn.style.pointerEvents = isMesh ? 'auto' : 'none';
        
        if (isMesh && entity.hasCollider) {
            colBtn.classList.add('active');
        } else {
            colBtn.classList.remove('active');
        }
    }

    // Keyboard shortcuts: Q/W/E/R (Godot / Blender style)
    window.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        const map: Record<string, string> = { 
            q: 'tool-select', 
            w: 'tool-move', 
            e: 'tool-rotate', 
            r: 'tool-scale',
            c: 'tool-collision'
        };
        const btnId = map[e.key.toLowerCase()];
        if (btnId) {
            if (btnId === 'tool-collision') {
                colBtn?.click();
            } else {
                editorState.setGizmoMode(toolMap[btnId]);
                setActiveTool(btnId);
            }
        }
    });

    function setActiveTool(id: string) {
        document.querySelectorAll('.center-tools .icon-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
    }

    // Selection change
    editorState.onSelectionChanged.push(() => {
        updateCollisionBtnState();
    });

    // Debug layer toggle
    document.getElementById('btn-debug-layer')?.addEventListener('click', () => engine.toggleDebugLayer());

    // --- Add Node dialog ---
    const dialog = document.getElementById('add-node-dialog')!;
    const nodeItems = dialog.querySelectorAll<HTMLElement>('.node-item');
    let selectedItem: HTMLElement | null = nodeItems[0];
    let nodeCount: Record<string, number> = {};

    nodeItems.forEach(item => {
        item.addEventListener('click', () => {
            nodeItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedItem = item;
        });
        item.addEventListener('dblclick', () => createNode());
    });

    const openDialog = () => {
        dialog.classList.remove('hidden');
        (dialog.querySelector('.search-node-input') as HTMLInputElement)?.focus();
    };
    const closeDialog = () => dialog.classList.add('hidden');

    // --- Play / Stop Controls ---
    const playBtn = document.querySelector('.play-btn') as HTMLElement;
    const stopBtn = document.querySelector('.top-controls .icon-btn[title="Stop"]') as HTMLElement;

    playBtn?.addEventListener('click', async () => {
        // Save current state first so game window can load it
        await saveScene(engine);
        
        // Open game in new window
        window.open('game.html', '_blank', 'width=1280,height=720');
        
        // For visual feedback in editor
        playBtn.classList.add('active');
        setTimeout(() => playBtn.classList.remove('active'), 1000);
    });

    stopBtn?.addEventListener('click', () => {
        engine.stopGame();
        playBtn.classList.remove('active');
        playBtn.innerText = '▶';
    });

    document.getElementById('btn-add-node')?.addEventListener('click', openDialog);
    document.getElementById('btn-close-dialog')?.addEventListener('click', closeDialog);
    document.getElementById('btn-dialog-cancel')?.addEventListener('click', closeDialog);
    document.getElementById('btn-dialog-create')?.addEventListener('click', () => createNode());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDialog(); });

    function createNode() {
        if (!selectedItem) return;
        const type = selectedItem.dataset.type as any;
        const meshType = selectedItem.dataset.mesh;
        const lightType = selectedItem.dataset.light;
        
        const baseName = meshType || lightType || type;
        nodeCount[baseName] = (nodeCount[baseName] ?? 0) + 1;
        const count = nodeCount[baseName];
        const name = count === 1 ? baseName : `${baseName}${count}`;

        const parentEntity = editorState.selectedEntityId
            ? sm.entities.get(editorState.selectedEntityId)
            : undefined;

        const entity = sm.createEntity(name, parentEntity);
        entity.type = type;
        if (meshType) entity.meshType = meshType as any;
        if (lightType) entity.lightType = lightType as any;

        engine.syncEntity(entity);
        editorState.notifyTreeChanged();
        editorState.selectEntity(entity.id);
        closeDialog();
    }

    // --- Panel Resizing Logic ---
    const setupResizer = (resizerId: string, sidebarId: string, isLeft: boolean) => {
        const resizer = document.getElementById(resizerId);
        const sidebar = document.getElementById(sidebarId);
        if (!resizer || !sidebar) return;

        let startX: number;
        let startWidth: number;

        const onMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - startX;
            let newWidth = isLeft ? (startWidth + dx) : (startWidth - dx);
            
            // Constrain width
            newWidth = Math.max(200, Math.min(600, newWidth));
            sidebar.style.width = `${newWidth}px`;
            
            // Re-sync engine sizes (if needed, Babylon usually handles this on next frame if canvas is % based)
            engine.babylonEngine.resize();
        };

        const onMouseUp = () => {
            resizer.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.querySelectorAll('.resizer-overlay').forEach(el => el.remove());
        };

        resizer.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startWidth = sidebar.getBoundingClientRect().width;
            resizer.classList.add('active');
            
            // Add a glass overlay to capture mouse events even if mouse goes over iframe/canvas
            const overlay = document.createElement('div');
            overlay.className = 'resizer-overlay';
            document.body.appendChild(overlay);

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    };

    setupResizer('resizer-left', 'left-sidebar', true);
    setupResizer('resizer-right', 'right-sidebar', false);
};

window.addEventListener('DOMContentLoaded', initEditor);
