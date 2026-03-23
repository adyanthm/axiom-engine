import { SceneManager } from '../engine/SceneManager';
import { Entity } from '../engine/Entity';
import { editorState } from './EditorState';
import { createIcons, Camera, Lightbulb, Box, Globe, ChevronDown, ChevronRight, Eye, EyeOff, Crosshair, Filter, MoreHorizontal, ArrowDownAZ, Boxes, Trash2, FileCode, ShieldPlus, ShieldAlert, Zap } from 'lucide';

export class HierarchyPanel {
    private container: HTMLElement;
    private sceneManager: SceneManager;
    private collapsed: Set<string> = new Set();
    private filterText: string = '';
    private draggedEntityId: string | null = null;

    constructor(containerId: string, sceneManager: SceneManager) {
        this.container = document.getElementById(containerId)!;
        this.sceneManager = sceneManager;

        // Inject CSS specifically for this panel's new custom layout
        if (!document.getElementById('scene-explorer-styles')) {
            const style = document.createElement('style');
            style.id = 'scene-explorer-styles';
            style.textContent = `
                .scene-explorer { display: flex; flex-direction: column; height: 100%; border-radius: 4px; overflow: hidden; }
                .explorer-list { flex: 1; overflow-y: auto; overflow-x: hidden; padding-bottom: 20px; }
                .explorer-list::-webkit-scrollbar { width: 6px; }
                .explorer-list::-webkit-scrollbar-track { background: transparent; }
                .explorer-list::-webkit-scrollbar-thumb { background: #5a5f66; border-radius: 3px; }
                .explorer-list::-webkit-scrollbar-thumb:hover { background: #7f8a9e; }
                .tree-item { user-select: none; position: relative; }
                .tree-item:hover { background-color: rgba(255, 255, 255, 0.05) !important; }
                .tree-item.drop-target { background-color: rgba(138, 180, 248, 0.2) !important; border-bottom: 2px solid #8ab4f8; }
            `;
            document.head.appendChild(style);
        }

        editorState.onTreeChanged.push(() => this.render());
        editorState.onSelectionChanged.push(() => this.updateHighlight());

        const targetFilter = document.getElementById('scene-filter-input');
        if (targetFilter) {
            targetFilter.addEventListener('input', (e) => {
                this.filterText = (e.target as HTMLInputElement).value.toLowerCase();
                this.updateFilterVisibility();
            });
        }

        this.render();
    }

    private getIconForEntityType(entity: Entity): string {
        switch (entity.type) {
            case 'Camera': return 'camera';
            case 'Light': return 'lightbulb';
            case 'Mesh': 
                if (entity.name === 'main') return 'crosshair';
                return 'box';
            default: return 'box';
        }
    }

    private getColorForEntity(entity: Entity): string {
        if (entity.name === 'main' || entity.type === 'Camera' || entity.type === 'Mesh') {
            return '#8ab4f8'; // Blue-ish
        }
        if (entity.type === 'Light') {
            return '#fceba6'; // Yellow-ish
        }
        return '#e8eaed';
    }

    render() {
        this.container.innerHTML = '';
        this.container.className = 'scene-explorer';

        // --- list area ---
        const listContainer = document.createElement('div');
        listContainer.className = 'explorer-list';
        listContainer.style.paddingLeft = '4px';
        listContainer.style.height = '100%'; // Allow dropping on empty space to root

        // Drag over empty space to reparent to root
        listContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer!.dropEffect = 'move';
        });

        listContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer!.getData('entityId') || this.draggedEntityId;
            if (draggedId) {
                this.sceneManager.reparentEntity(draggedId, null);
                this.draggedEntityId = null;
                this.render(); // Immediate update
                editorState.notifyTreeChanged();
            }
        });

        for (const child of this.sceneManager.root.children) {
            this.renderNode(child, 0, listContainer);
        }
        
        this.container.appendChild(listContainer);

        this.updateHighlight();
        this.updateFilterVisibility();

        // Initialize lucide icons for everything we just added
        createIcons({
            icons: {
                Camera, Lightbulb, Box, Globe, ChevronDown, ChevronRight, Eye, EyeOff, Crosshair, Filter, MoreHorizontal, ArrowDownAZ, Boxes, Trash2, FileCode, ShieldPlus, ShieldAlert, Zap
            }
        });
    }

    private renderNode(entity: Entity, depth: number, parentEl: HTMLElement) {
        const row = document.createElement('div');
        row.className = 'tree-item';
        row.dataset.id = entity.id;
        row.dataset.name = entity.name.toLowerCase();
        row.draggable = true;
        
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.padding = '4px 14px';
        row.style.paddingLeft = `${14 + depth * 16}px`;
        row.style.cursor = 'pointer';
        row.style.color = '#e8eaed';
        row.style.fontSize = '12px';
        row.style.transition = 'background-color 0.1s';
        row.style.borderBottom = '1px solid transparent'; // For drop indicator

        // Drag & Drop Logic
        row.addEventListener('dragstart', (e) => {
            this.draggedEntityId = entity.id;
            e.dataTransfer!.setData('entityId', entity.id);
            e.dataTransfer!.effectAllowed = 'move';
            row.style.opacity = '0.5';
        });

        row.addEventListener('dragend', () => {
            row.style.opacity = '1';
            this.draggedEntityId = null;
            this.container.querySelectorAll('.tree-item').forEach(el => (el as HTMLElement).classList.remove('drop-target'));
        });

        row.addEventListener('dragover', (e) => {
            if (this.draggedEntityId && this.draggedEntityId !== entity.id) {
                // Check for infinite recursion
                let isDescendant = false;
                let check: Entity | null = entity;
                while (check) {
                    if (check.id === this.draggedEntityId) { isDescendant = true; break; }
                    check = check.parent;
                }

                if (!isDescendant) {
                    e.preventDefault();
                    e.stopPropagation(); // Don't let parent nodes or the root list catch this
                    row.classList.add('drop-target');
                    e.dataTransfer!.dropEffect = 'move';
                }
            }
        });

        row.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            row.classList.remove('drop-target');
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            row.classList.remove('drop-target');
            
            const draggedId = e.dataTransfer!.getData('entityId') || this.draggedEntityId;
            if (draggedId && draggedId !== entity.id) {
                this.sceneManager.reparentEntity(draggedId, entity.id);
                this.collapsed.delete(entity.id); // Auto-expand target
                this.render(); // Immediate update
                editorState.notifyTreeChanged();
            }
            this.draggedEntityId = null;
        });

        // Arrow for folding
        const arrow = document.createElement('div');
        arrow.style.width = '14px';
        arrow.style.marginRight = '2px';
        arrow.style.color = '#9aa0a6';
        
        const isCollapsed = this.collapsed.has(entity.id);
        const hasChildren = entity.children.length > 0;

        if (hasChildren) {
            arrow.innerHTML = `<i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" style="width:14px; height:14px;"></i>`;
            arrow.onclick = (e) => {
                e.stopPropagation();
                if (isCollapsed) this.collapsed.delete(entity.id);
                else this.collapsed.add(entity.id);
                this.render();
            };
        } else {
            arrow.innerHTML = ' ';
        }
        row.appendChild(arrow);

        // Icon
        const iconContainer = document.createElement('div');
        iconContainer.style.width = '20px';
        iconContainer.style.display = 'flex';
        iconContainer.style.justifyContent = 'center';
        iconContainer.innerHTML = `<i data-lucide="${this.getIconForEntityType(entity)}" style="width:14px; height:14px; color:${this.getColorForEntity(entity)};"></i>`;
        row.appendChild(iconContainer);

        // Label
        const label = document.createElement('div');
        label.innerText = entity.name;
        label.style.marginLeft = '6px';
        label.style.flex = '1';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        
        if (entity.type === 'Camera' && entity.isMainCamera) {
            label.innerText += ' (Main)';
            label.style.fontWeight = 'bold';
        }
        if (!entity.visible) {
            label.style.opacity = '0.5';
            iconContainer.style.opacity = '0.5';
        }
        row.appendChild(label);

        // Eye Toggle
        const eye = document.createElement('div');
        eye.className = 'visibility-toggle';
        eye.innerHTML = `<i data-lucide="${entity.visible ? 'eye' : 'eye-off'}" style="width:14px; height:14px; color:#5aa1ea;"></i>`;
        // Make it only faintly visible when unchecked to match VS Code / modern editors
        if (!entity.visible) {
            eye.style.opacity = '0.5';
        } else {
            // Hide it normally, show on hover (CSS will handle the final polish, but inline styles for baseline)
            eye.style.opacity = '0.8'; 
        }

        eye.onclick = (e) => {
            e.stopPropagation();
            entity.visible = !entity.visible;
            const bNode = this.sceneManager.babylonNodes.get(entity.id);
            if (bNode) bNode.setEnabled(entity.visible);
            editorState.notifyTransformChanged(true); // forces render update + gizmo sync
            this.render();
        };
        row.appendChild(eye);

        // Selection logic
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            editorState.selectEntity(entity.id);
        });

        // Context Menu
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            editorState.selectEntity(entity.id);
            this.showContextMenu(e.clientX, e.clientY, entity);
        });

        parentEl.appendChild(row);

        if (!isCollapsed && hasChildren) {
            for (const child of entity.children) {
                this.renderNode(child, depth + 1, parentEl);
            }
        }
    }

    private updateFilterVisibility() {
        const items = this.container.querySelectorAll('.tree-item');
        items.forEach(el => {
            const htmlEl = el as HTMLElement;
            const name = htmlEl.dataset.name || '';
            if (this.filterText === '' || name.includes(this.filterText)) {
                htmlEl.style.display = 'flex';
            } else {
                htmlEl.style.display = 'none';
            }
        });
    }

    private showContextMenu(x: number, y: number, entity: Entity) {
        document.querySelector('.context-menu')?.remove();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const hasScript = entity.script && entity.script.trim() !== '';
        const items = [
            {
                label: hasScript ? 'Edit Script' : 'Attach Script',
                icon: 'file-code',
                action: () => {
                    if (!hasScript) {
                        entity.script = `// ${entity.name}.js\n\nfunction _ready() {\n    // Called when node enters scene\n}\n\nfunction _process(delta) {\n    // Called every frame\n}\n`;
                    }
                    editorState.setViewMode('script');
                }
            },
            { label: 'divider', action: () => { }, divider: true }
        ];

        // Physics Logic
        if (entity.type === 'Mesh' && entity.meshType === 'ImportedModel') {
            if (!entity.hasCollider) {
                items.push({
                    label: 'Add Mesh Collider',
                    icon: 'shield-plus',
                    action: () => {
                        entity.hasCollider = true;
                        entity.collidable = true;
                        editorState.notifyTreeChanged();
                        editorState.notifyTransformChanged();
                    }
                });
            } else {
                items.push({
                    label: 'Remove Mesh Collider',
                    icon: 'shield-alert',
                    action: () => {
                        entity.hasCollider = false;
                        entity.collidable = false;
                        editorState.notifyTreeChanged();
                        editorState.notifyTransformChanged();
                    }
                });
            }
        }

        items.push({ label: 'divider', action: () => { }, divider: true });
        
        items.push({
            label: 'Delete Entity',
            icon: 'trash-2',
            danger: true,
            action: () => {
                this.sceneManager.removeEntity(entity.id);
                editorState.clearSelection();
                editorState.notifyTreeChanged();
            }
        });

        items.forEach((item: any) => {
            if (item.divider) {
                const div = document.createElement('div');
                div.className = 'menu-item-action divider';
                menu.appendChild(div);
                return;
            }
            const el = document.createElement('div');
            el.className = `menu-item-action ${item.danger ? 'danger' : ''}`;

            el.innerHTML = `
                <i data-lucide="${item.icon}" style="width:14px; height:14px;"></i>
                <span>${item.label}</span>
            `;
            
            el.onclick = () => {
                if (!item.disabled) {
                    item.action();
                    menu.remove();
                }
            };
            menu.appendChild(el);
        });

        document.body.appendChild(menu);
        
        createIcons({
            icons: { Trash2, FileCode, ShieldPlus, ShieldAlert, Zap }
        });

        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }

    private updateHighlight() {
        this.container.querySelectorAll('.tree-item').forEach(el => {
            const div = el as HTMLElement;
            if (div.dataset.id === editorState.selectedEntityId) {
                div.style.backgroundColor = 'rgba(138, 180, 248, 0.15)'; // Select highlight
            } else {
                div.style.backgroundColor = 'transparent';
            }
        });
    }
}
