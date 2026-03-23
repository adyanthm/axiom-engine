# Axiom Engine Technical Manual

Axiom is a high-performance 3D engine for the web. This document covers its internal architecture, the Godot-style scene tree, Havok physics, and the scripting API.

---

## 🏗️ Architecture Overview

The core of Axiom is built on a high-speed **"Separation of Powers"** architecture.

### 🍱 The Trinity of Axiom
1.  **`CoreEngine`**: The bridge. It initializes the Babylon.js renderer, enables Havok physics, and manages the main game loop (72+ FPS).
2.  **`SceneManager`**: The brain. It manages the `Entity` tree, transform propagation, and keeps the engine in sync with the editor.
3.  **`GameRuntime`**: The play-head. It translates scripting logic into entity behavior during play/export.

---

## 🎲 Scene Tree & Entities

Axiom uses a **Godot-inspired** scene hierarchy. Every object is an `Entity`.

| Entity Type | Parentable | Description |
| :--- | :--- | :--- |
| **Node** | Yes | An empty transform node for organization. |
| **Mesh** | Yes | 3D visual objects (Cube, Sphere, Imported GLTF). |
| **Light** | Yes | Directional, Point, Spot, or Hemispheric. |
| **Camera** | Yes | Universal camera with follow/target modes. |
| **Sky** | No | Global environment (Azimuth, Turbidity, Ground Level). |

---

## 🖋️ Scripting API Reference

Axiom uses a **Global Context** bridge for scripting. Every script has access to a `ctx` object.

### 🚶 Transformation
*   `translate(x, y, z)`: Moves the node in **Local Space** (relative to rotation).
*   `rotate_y(angle)`: Rotates the node around the vertical Axis (Radians).
*   `node.position.set(x, y, z)`: Direct access to the Babylon `Vector3` position.

### 🎮 Input Management
*   `Input.is_action_pressed(action)`: Returns `true` if a key is held.
    *   **Common Actions**: `"move_forward"`, `"move_backward"`, `"move_left"`, `"move_right"`, `"jump"`.
    *   **Arrow/WASD**: Unified into the actions above.

### 🛡️ Physics (Havok)
*   `set_linear_velocity(x, y, z)`: Sets the velocity of a **Dynamic** or **Kinematic** body.
*   `get_linear_velocity()`: Returns an `{x, y, z}` object of current speed.
*   `apply_impulse(x, y, z)`: Applies a sudden force to the dynamic body.
*   `is_on_floor()`: Returns `true` if the object is grounded.
*   `move_and_slide(vx, vy, vz)`: High-level physics utility for character controllers.

### 🔍 Scene Access
*   `get_node(name)`: Returns the Babylon node of another entity in the scene by its name.

---

## 🛡️ Physics Body Academy

For beginners, choosing the right physics mode is critical. Axiom offers three standard body types:

*   **Static**: These objects are solid but never move (e.g., floors, buildings, mountains). They are extremely optimized and have zero performance overhead.
*   **Dynamic**: These are fully simulated by gravity and forces. They fall, bounce, and can be pushed by other objects (e.g., players, crates, balls).
*   **Kinematic (Animated)**: These are "unstoppable" objects. They moved via code or animation, and while they can push Dynamic objects, they are **not** affected by gravity or collisions themselves (e.g., moving platforms, sliding doors).

### Locking Rotation (Axis Constraints)
In the Inspector, you can lock rotation on the **X, Y, or Z** axes. 
*   **Use Case**: For a character controller, you usually want to **Lock Rotation X and Z** to prevent the player from falling over like a ragdoll when they bump into a wall.

### Single Click Mesh Collider
One of Axiom's most powerful tools is the **One-Click Mesh Generator**.
*   **Problem**: Large 3D models (like a whole map) have hundreds of "children." Normal engines struggle to make them all solid.
*   **Axiom Solution**: When you click "Add Mesh Collider" on a model, Axiom automatically clones every part of the model, merges it into a single high-fidelity ghost mesh, and uses it as the physical boundary. This ensures 100% accurate collisions with zero manual setup.

---

## 📦 Standalone Exporter

The exporter is the signature feature of Axiom. It generates a **Zero-Blob HTML** file.

*   **String Vault Architecture**: To bypass browser/Vite parser limits on large 3D data, the exporter segments the HTML code into a safe array of strings, ensuring 100% stability.
*   **Portability**: The exported file is a self-contained engine—it contains the Havok physics loader, the Babylon renderer core, and all your scene logic.

---

*Axiom Engine — Scaling the 3D Web.*
