export type EntityType = 'Node' | 'Mesh' | 'Light' | 'Camera' | 'Sky' | 'Particles';
export type MeshType = 'Cube' | 'Sphere' | 'Cylinder' | 'Plane' | 'Torus' | 'Capsule' | 'Cone' | 'Disc' | 'ImportedModel';
export type LightType = 'Directional' | 'Point' | 'Spot' | 'Hemispheric';
export type PhysicsType = 'None' | 'Static' | 'Dynamic' | 'Kinematic';

export class Entity {
    public id: string;
    public name: string;
    public parent: Entity | null = null;
    public children: Entity[] = [];

    // Node type
    public type: EntityType = 'Node';
    public meshType?: MeshType;
    public modelAssetId: string | null = null;
    public lightType?: LightType;

    // Physics properties
    public physicsType: PhysicsType = 'None';
    public mass: number = 1.0;
    public friction: number = 0.5;
    public restitution: number = 0.1;
    public linearDamping: number = 0.0;
    public angularDamping: number = 0.0;
    public collisionLayer: number = 1;
    public collisionMask: number = 1;
    public lockRotationX: boolean = false;
    public lockRotationY: boolean = false;
    public lockRotationZ: boolean = false;

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

    // Light shadow properties (Directional only for now)
    public lightShadowEnabled: boolean = false;
    public lightShadowMapSize: number = 1024;      // 512 | 1024 | 2048 | 4096
    public lightShadowDarkness: number = 0.3;      // 0..1
    public lightShadowBias: number = 0.0001;
    public lightShadowBlur: string = 'BlurExponential'; // None | Exponential | BlurExponential | PCF | PCSS
    public lightDirection: { x: number, y: number, z: number } = { x: -1, y: -2, z: -1 };

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
    public hasCollider: boolean = false;
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
