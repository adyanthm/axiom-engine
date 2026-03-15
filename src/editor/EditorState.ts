export type GizmoMode = 'select' | 'move' | 'rotate' | 'scale';

class EditorState {
    public selectedEntityId: string | null = null;
    public gizmoMode: GizmoMode = 'select';
    public onSelectionChanged: ((id: string | null) => void)[] = [];
    public onTreeChanged: (() => void)[] = [];
    public onGizmoModeChanged: ((mode: GizmoMode) => void)[] = [];
    public onTransformChanged: (() => void)[] = [];

    selectEntity(id: string | null) {
        if (this.selectedEntityId !== id) {
            this.selectedEntityId = id;
            this.notifySelectionListeners();
        }
    }

    clearSelection() {
        this.selectEntity(null);
    }

    setGizmoMode(mode: GizmoMode) {
        this.gizmoMode = mode;
        for (const fn of this.onGizmoModeChanged) fn(mode);
    }

    notifySelectionListeners() {
        for (const fn of this.onSelectionChanged) fn(this.selectedEntityId);
    }

    notifyTreeChanged() {
        for (const fn of this.onTreeChanged) fn();
    }

    notifyTransformChanged() {
        for (const fn of this.onTransformChanged) fn();
    }
}

export const editorState = new EditorState();
