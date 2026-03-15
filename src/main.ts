import './style.css';
import { CoreEngine } from './engine/CoreEngine';
import { HierarchyPanel } from './editor/HierarchyPanel';
import { InspectorPanel } from './editor/InspectorPanel';
import { editorState } from './editor/EditorState';
import type { GizmoMode } from './editor/EditorState';
import { saveScene, loadScene } from './engine/ScenePersistence';

// Debounced save so we don't thrash IndexedDB on every keystroke
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(engine: CoreEngine) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveScene(engine), 500);
}

const initEditor = async () => {
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    const engine = new CoreEngine(canvas);
    const sm = engine.sceneManager;

    // Wire up panels
    new HierarchyPanel('scene-tree', sm);
    new InspectorPanel('inspector-content', sm, engine);

    // Auto-save on any tree change (add node, rename, etc.)
    editorState.onTreeChanged.push(() => scheduleSave(engine));
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
        engine.syncEntity(cam);
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

    // Keyboard shortcuts: Q/W/E/R (Godot / Blender style)
    window.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        const map: Record<string, string> = { q: 'tool-select', w: 'tool-move', e: 'tool-rotate', r: 'tool-scale' };
        const btnId = map[e.key.toLowerCase()];
        if (btnId) {
            editorState.setGizmoMode(toolMap[btnId]);
            setActiveTool(btnId);
        }
    });

    function setActiveTool(id: string) {
        document.querySelectorAll('.center-tools .icon-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
    }

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

    // Search filter
    const searchInput = dialog.querySelector('.search-node-input') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        nodeItems.forEach(item => {
            (item as HTMLElement).style.display =
                (item as HTMLElement).innerText.toLowerCase().includes(q) ? '' : 'none';
        });
    });
};

window.addEventListener('DOMContentLoaded', initEditor);
