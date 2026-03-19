import { Entity } from './Entity';
import { Node as BabylonNode, Scene } from '@babylonjs/core';

export class SceneManager {
    public root: Entity;
    public entities = new Map<string, Entity>();
    public babylonNodes = new Map<string, BabylonNode>();

    constructor(_scene: Scene) {
        this.root = new Entity('Root');
        this.entities.set(this.root.id, this.root);
    }

    createEntity(name: string, parent?: Entity): Entity {
        const entity = new Entity(name);
        const parentNode = parent ?? this.root;
        parentNode.addChild(entity);
        this.entities.set(entity.id, entity);
        return entity;
    }

    /** Used by persistence to restore saved entities with their original IDs */
    forceCreateEntity(id: string, name: string): Entity {
        const entity = new Entity(name);
        (entity as any).id = id; // Override auto-generated UUID
        this.entities.set(entity.id, entity);
        return entity;
    }

    removeEntity(id: string) {
        const entity = this.entities.get(id);
        if (!entity || entity === this.root) return;
        // Remove all descendants too
        this.removeDescendants(entity);
        entity.parent?.removeChild(entity);
        this.entities.delete(id);
    }

    reparentEntity(entityId: string, newParentId: string | null) {
        const entity = this.entities.get(entityId);
        if (!entity || entity === this.root) return;

        const newParent = newParentId ? this.entities.get(newParentId) : this.root;
        if (!newParent) return;

        // Prevent infinite loops (parenting to own descendant)
        let check: Entity | null = newParent;
        while (check) {
            if (check.id === entityId) return;
            check = check.parent;
        }

        newParent.addChild(entity); 

        // 2. Babylon Reparent
        const node = this.babylonNodes.get(entityId);
        const parentNode = this.babylonNodes.get(newParent.id);

        if (node) {
            // Use setParent(target, true) to keep world transform
            (node as any).setParent(parentNode || null);
        }
    }

    private removeDescendants(entity: Entity) {
        for (const child of entity.children) {
            this.removeDescendants(child);
            this.entities.delete(child.id);
        }
    }
}
