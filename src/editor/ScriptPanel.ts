import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState as CMState } from '@codemirror/state';
import { editorState } from './EditorState';
import type { ViewMode } from './EditorState';
import { SceneManager } from '../engine/SceneManager';

export class ScriptPanel {
    private container: HTMLElement;
    private sceneManager: SceneManager;
    private editor: EditorView | null = null;
    private currentEntityId: string | null = null;

    constructor(containerId: string, sceneManager: SceneManager) {
        this.container = document.getElementById(containerId)!;
        this.sceneManager = sceneManager;

        this.initLayout();
        editorState.onViewModeChanged.push((mode) => this.onViewChange(mode));
        editorState.onSelectionChanged.push((id) => this.onSelectionChange(id));
    }

    private initLayout() {
        this.container.innerHTML = `
            <div class="script-editor-layout">
                <div class="script-sidebar" id="script-sidebar">
                    <div class="sidebar-section">
                        <div class="section-header">Scripts</div>
                        <div class="sidebar-toolbar">
                            <input type="text" placeholder="Filter Scripts" class="sidebar-filter">
                        </div>
                        <div id="script-list" class="list-container"></div>
                    </div>
                    <div class="sidebar-section">
                        <div class="section-header">Methods</div>
                        <div class="sidebar-toolbar">
                            <input type="text" placeholder="Filter Methods" class="sidebar-filter">
                        </div>
                        <div id="method-list" class="list-container"></div>
                    </div>
                </div>
                <div class="resizer" id="script-resizer"></div>
                <div class="script-main">
                    <div class="script-tabs">
                        <div id="script-tab-container" class="tab-scroll"></div>
                    </div>
                    <div id="cm-editor-container" class="editor-container"></div>
                </div>
            </div>
        `;
        this.setupResizer();
    }

    private setupResizer() {
        const resizer = this.container.querySelector('#script-resizer') as HTMLElement;
        const sidebar = this.container.querySelector('#script-sidebar') as HTMLElement;
        if (!resizer || !sidebar) return;

        let startX: number;
        let startWidth: number;

        const onMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - startX;
            let newWidth = startWidth + dx;
            newWidth = Math.max(150, Math.min(500, newWidth));
            sidebar.style.width = `${newWidth}px`;
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

            const overlay = document.createElement('div');
            overlay.className = 'resizer-overlay';
            document.body.appendChild(overlay);

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    private onViewChange(mode: ViewMode) {
        if (mode === 'script') {
            this.container.classList.remove('hidden');
            this.refresh();
        } else {
            this.container.classList.add('hidden');
        }
    }

    private onSelectionChange(id: string | null) {
        if (editorState.viewMode === 'script') {
            this.currentEntityId = id;
            this.refresh();
        }
    }

    private refresh() {
        this.updateScriptList();
        this.loadCurrentScript();
    }

    private updateScriptList() {
        const list = this.container.querySelector('#script-list')!;
        list.innerHTML = '';

        // Only show entities that have scripts
        for (const entity of Array.from(this.sceneManager.entities.values())) {
            if (entity.script !== undefined) {
                 const item = document.createElement('div');
                 item.className = `list-item ${entity.id === this.currentEntityId ? 'active' : ''}`;
                 item.innerHTML = `<span class="icon">📜</span> ${entity.name}.js`;
                 item.onclick = () => {
                     editorState.selectEntity(entity.id);
                 };
                 list.appendChild(item);
            }
        }
    }

    private loadCurrentScript() {
        const editorContainer = this.container.querySelector('#cm-editor-container')!;
        
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }

        if (!this.currentEntityId) {
            editorContainer.innerHTML = '<div class="empty-editor">Select a node with a script to edit</div>';
            return;
        }

        const entity = this.sceneManager.entities.get(this.currentEntityId);
        if (!entity) return;

        editorContainer.innerHTML = '';

        const startState = CMState.create({
            doc: entity.script || `// ${entity.name}.js\n\nfunction _ready() {\n    console.log("Ready!");\n}\n\nfunction _process(delta) {\n    // logic\n}\n`,
            extensions: [
                basicSetup,
                javascript(),
                oneDark,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        entity.script = update.state.doc.toString();
                        editorState.notifyTransformChanged(); // Trigger auto-save
                    }
                })
            ]
        });

        this.editor = new EditorView({
            state: startState,
            parent: editorContainer
        });
    }
}
