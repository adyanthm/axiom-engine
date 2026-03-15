export type EntityType = 'Node' | 'Mesh' | 'Light' | 'Camera' | 'Sky' | 'Particles';
export type MeshType = 'Cube' | 'Sphere' | 'Cylinder' | 'Plane' | 'Torus' | 'Capsule' | 'Cone' | 'Disc';
export type LightType = 'Directional' | 'Point' | 'Spot' | 'Hemispheric';

export class Entity {
    public id: string;
    public name: string;
    public parent: Entity | null = null;
    public children: Entity[] = [];

    // Node type
    public type: EntityType = 'Node';
    public meshType?: MeshType;
    public lightType?: LightType;

    // Sky / Environment properties
    public skyTurbidity: number = 2.0;
    public skyRayleigh: number = 2.0;
    public skyMieCoefficient: number = 0.005;
    public skyMieDirectionalG: number = 0.8;
    public skyLuminance: number = 1.0;
    public skyInclination: number = 0.2;
    public skyAzimuth: number = 0.15;
    public environmentIntensity: number = 1.5;
    public ambientColor: string = '#ffffff';
    
    // Custom Sky (Godot-like)
    public customSkyEnabled: boolean = false;
    public skyTopColor: string = '#61748d'; // Soft blue
    public skyHorizonColor: string = '#a4a9ad'; // Light gray
    public skyCurve: number = 0.15;
    public skyEnergy: number = 1.0;

    // Ground Level (Global setting in Sky)
    public groundLevelEnabled: boolean = true;
    public groundLevel: number = 0;
    public groundLevelCollidable: boolean = true;

    // Camera properties
    public isMainCamera: boolean = false;
    public cameraFollowTargetId: string | null = null;
    public cameraOffset: { x: number, y: number, z: number } = { x: 0, y: 5, z: -10 };

    // Scripting
    public script: string = '';

    // Material properties (for Mesh entities)
    public materialColor: string = '#b4b4b4';
    public materialEmissive: string = '#000000';
    public emissiveEnabled: boolean = false;
    public emissiveIntensity: number = 1.0;
    public materialMetallic: number = 0;
    public materialRoughness: number = 0.7;

    // Visibility and Collision
    public visible: boolean = true;
    public collidable: boolean = true;

    // Shadow options
    public castShadows: boolean = true;
    public receiveShadows: boolean = true;

    constructor(name: string = 'Node') {
        this.id = crypto.randomUUID();
        this.name = name;
    }

    addChild(child: Entity) {
        if (child.parent) child.parent.removeChild(child);
        child.parent = this;
        this.children.push(child);
    }

    removeChild(child: Entity) {
        const i = this.children.indexOf(child);
        if (i !== -1) { this.children.splice(i, 1); child.parent = null; }
    }
}
