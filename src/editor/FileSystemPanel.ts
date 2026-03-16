import { assetDB } from './AssetDatabase';
import type { FileAsset } from './AssetDatabase';

export class FileSystemPanel {
    private container: HTMLElement;
    private assets: FileAsset[] = [];
    private filter: string = '';

    constructor(container: HTMLElement) {
        this.container = container;
        this.init();

        const filterInput = document.getElementById('fs-filter') as HTMLInputElement;
        filterInput?.addEventListener('input', () => {
            this.filter = filterInput.value.toLowerCase();
            this.render();
        });
    }

    public async init() {
        await this.loadAssets();
    }

    private async loadAssets() {
        try {
            this.assets = await assetDB.getAllAssets();
            console.log(`Loaded ${this.assets.length} assets from IndexedDB.`);
            this.render();
        } catch (e) {
            console.error("Failed to load assets:", e);
        }
    }

    private render() {
        if (!this.container) return;

        const filtered = this.assets.filter(a => a.name.toLowerCase().includes(this.filter));

        this.container.innerHTML = `
            <div class="tree-item root-item">
                <span class="icon" style="color:#e0b152">📂</span> res://
            </div>
            <div id="asset-items-container">
                ${filtered.map(asset => `
                    <div class="tree-item indent-1 asset-item" data-id="${asset.id}" title="${asset.name} (${(asset.size / 1024).toFixed(1)} KB)">
                        <span class="icon">${this.getIcon(asset.type)}</span>
                        <span class="asset-name">${asset.name}</span>
                        <span class="delete-asset" style="margin-left:auto; opacity:0.5; padding: 0 4px">×</span>
                    </div>
                `).join('')}
            </div>
        `;

        // Bind delete buttons
        this.container.querySelectorAll('.delete-asset').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = (btn.parentElement as HTMLElement).dataset.id;
                if (id) {
                    await assetDB.deleteAsset(id);
                    this.assets = this.assets.filter(a => a.id !== id);
                    this.render();
                }
            });
        });
    }

    private getIcon(type: string): string {
        if (type.startsWith('image/')) return '🖼️';
        if (type.startsWith('audio/')) return '🎵';
        if (type.includes('javascript') || type.endsWith('.js')) return '📜';
        return '📄';
    }

    public handleUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        const files = input.files;
        if (!files || files.length === 0) return;

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                const result = event.target?.result as string;
                
                const newAsset: FileAsset = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    size: file.size,
                    data: result
                };

                await assetDB.saveAsset(newAsset);
                this.assets.push(newAsset);
                this.render();
                console.log(`Saved to IndexedDB: ${file.name}`);
            };

            reader.readAsDataURL(file);
        });

        input.value = '';
    }
}
