import { SceneManager } from '../engine/SceneManager';
import { Entity } from '../engine/Entity';
import { editorState } from './EditorState';

export class HierarchyPanel {
    private container: HTMLElement;
    private sceneManager: SceneManager;

    constructor(containerId: string, sceneManager: SceneManager) {
        this.container = document.getElementById(containerId)!;
        this.sceneManager = sceneManager;

        editorState.onTreeChanged.push(() => this.render());
        editorState.onSelectionChanged.push(() => this.updateHighlight());

        this.render();
    }

    render() {
        this.container.innerHTML = '';
        for (const child of this.sceneManager.root.children) {
            this.renderNode(child, 0);
        }
        this.updateHighlight();
    }

    private iconFor(entity: Entity): string {
        if (entity.type === 'Light') return '💡';
        if (entity.type === 'Camera') return '🎥';
        if (entity.type === 'Mesh') return '📦';
        return '⬜';
    }

    private colorFor(entity: Entity): string {
        if (entity.type === 'Light') return '#e6b450';
        if (entity.type === 'Camera') return '#c084fc';
        if (entity.type === 'Mesh') return '#ff8800';
        return '#a5b0c4';
    }

    private renderNode(entity: Entity, depth: number) {
        const row = document.createElement('div');
        row.className = 'tree-item';
        row.dataset.id = entity.id;

        // Indentation
        for (let i = 0; i < depth; i++) {
            const sp = document.createElement('span');
            sp.className = 'indent';
            row.appendChild(sp);
        }

        // Expand arrow placeholder (keeps layout consistent)
        const arrow = document.createElement('span');
        arrow.style.width = '12px';
        arrow.style.display = 'inline-block';
        arrow.style.marginRight = '2px';
        arrow.style.color = 'var(--g-text-dim)';
        arrow.innerText = entity.children.length > 0 ? '▾' : ' ';
        row.appendChild(arrow);

        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.innerText = this.iconFor(entity);
        icon.style.color = this.colorFor(entity);
        row.appendChild(icon);

        const label = document.createElement('span');
        label.innerText = entity.name;
        row.appendChild(label);

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            editorState.selectEntity(entity.id);
        });

        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            editorState.selectEntity(entity.id);
            this.showContextMenu(e.clientX, e.clientY, entity);
        });

        this.container.appendChild(row);

        for (const child of entity.children) {
            this.renderNode(child, depth + 1);
        }
    }

    private showContextMenu(x: number, y: number, entity: Entity) {
        // Remove existing
        document.querySelector('.context-menu')?.remove();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const hasScript = entity.script && entity.script.trim() !== '';
        const items = [
            { 
                label: hasScript ? 'Edit Script' : 'Attach Script', 
                action: () => {
                    if (!hasScript) {
                        entity.script = `// ${entity.name}.js\n\nfunction _ready() {\n    // Called when node enters scene\n}\n\nfunction _process(delta) {\n    // Called every frame\n}\n`;
                    }
                    editorState.setViewMode('script');
                }
            },
            { label: 'Delete', action: () => {
                this.sceneManager.removeEntity(entity.id);
                editorState.clearSelection();
                editorState.notifyTreeChanged();
            }}
        ];

        items.forEach((item: any) => {
            const el = document.createElement('div');
            el.className = `menu-item-action ${item.disabled ? 'disabled' : ''}`;
            el.innerText = item.label;
            el.onclick = () => {
                if (!item.disabled) {
                    item.action();
                    menu.remove();
                }
            };
            menu.appendChild(el);
        });

        document.body.appendChild(menu);

        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }

    private updateHighlight() {
        this.container.querySelectorAll('.tree-item').forEach(el => {
            const div = el as HTMLElement;
            div.classList.toggle('selected', div.dataset.id === editorState.selectedEntityId);
        });
    }
}
