import { CoreEngine } from './engine/CoreEngine';
import { loadScene } from './engine/ScenePersistence';

async function initGame() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const engine = await CoreEngine.Create(canvas);
    
    // Hide editor specific things
    // In a real project we'd have a 'GameOnlyEngine' but let's reuse CoreEngine for now
    
    const loading = document.getElementById('loading');
    
    console.log("Loading scene for game runtime...");
    const success = await loadScene(engine);
    
    if (success) {
        // Apply environment settings from WorldEnvironment entity
        const skyEntity = Array.from(engine.sceneManager.entities.values()).find(e => e.type === 'Sky');
        if (skyEntity) {
            engine.updateEnvironment(skyEntity);
        }
        
        if (loading) loading.style.display = 'none';
        console.log("Scene loaded. Starting game...");
        engine.startGame();
    } else {
        if (loading) loading.innerText = "Error: No scene found to run.";
    }
}

window.addEventListener('DOMContentLoaded', initGame);
