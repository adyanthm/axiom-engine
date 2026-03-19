export type GizmoMode = 'select' | 'move' | 'rotate' | 'scale';
export type ViewMode = '2d' | '3d' | 'script' | 'game' | 'assetlib';

class EditorState {
    public selectedEntityId: string | null = null;
    public gizmoMode: GizmoMode = 'select';
    public viewMode: ViewMode = '3d';
    public showGizmos: boolean = true;
    public showCameraGizmos: boolean = true;
    public showLightGizmos: boolean = true;
    public showColliders: boolean = true;
    
    public onSelectionChanged: ((id: string | null) => void)[] = [];
    public onTreeChanged: (() => void)[] = [];
    public onGizmoModeChanged: ((mode: GizmoMode) => void)[] = [];
    public onTransformChanged: ((forceNow?: boolean) => void)[] = [];
    public onViewModeChanged: ((mode: ViewMode) => void)[] = [];
    public onViewSettingsChanged: (() => void)[] = [];

    setViewMode(mode: ViewMode) {
        if (this.viewMode !== mode) {
            this.viewMode = mode;
            for (const fn of this.onViewModeChanged) fn(mode);
        }
    }

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

    notifyTransformChanged(forceNow: boolean = false) {
        for (const fn of this.onTransformChanged) fn(forceNow);
    }

    setShowGizmos(show: boolean, type?: 'cam' | 'light') {
        if (!type) this.showGizmos = show;
        else if (type === 'cam') this.showCameraGizmos = show;
        else if (type === 'light') this.showLightGizmos = show;
        for (const fn of this.onViewSettingsChanged) fn();
    }

    setShowColliders(show: boolean) {
        this.showColliders = show;
        for (const fn of this.onViewSettingsChanged) fn();
    }
}

export const editorState = new EditorState();
