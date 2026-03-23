# Contributing to Axiom

Thank you for your interest in Axiom. We are committed to building the highest-performance game engine for the web. To maintain the project's quality, we follow a strict and professional engineering workflow.

---

## 🏗️ Technical Stack

Axiom is built with a minimalist, high-speed philosophy.
*   **Language**: Strict TypeScript 5.x
*   **Physics**: Havok (UMD / WASM)
*   **Graphics**: Babylon.js 6.x
*   **Build**: Vite 5.x
*   **Styling**: Vanilla CSS (Modern CSS variables)

---

## 🛠️ The PR Workflow

Every pull request must maintain the project's integrity. We follow the philosophy of clear, high-impact changes.

### 1. The Branching Model
*   `main`: Always stable. Production-ready code only.
*   `feature/*`: For new engine or editor features.
*   `bugfix/*`: For targeted fixes.

## 📂 Project Hierarchy

Axiom is separated into a clean Engine vs. Editor boundary.

```text
GameEngine/
├── src/
│   ├── engine/          # High-Performance Core (Babylon + Havok)
│   │   ├── CoreEngine.ts    # Main entry, loop, and API
│   │   ├── GameRuntime.ts   # Script execution engine
│   │   └── SceneManager.ts  # Node tree & transform logic
│   └── editor/          # Professional Interface (Vanilla TS/CSS)
│       ├── Exporter.ts      # One-click HTML export magic
│       ├── EditorState.ts   # Global UI state (Gizmos, Selection)
│       └── InspectorPanel.ts # Property binding system
├── index.html           # Editor Entry Point
└── package.json         # Unified build configuration
```

### 2. Commit Standards
We use **Conventional Commits**. This allows us to auto-generate high-quality changelogs.
*   `feat: add MESH collision support to exporter`
*   `fix: resolve inverse zoom sensitivity in CoreEngine`
*   `perf: optimize transform propagation in SceneManager`

---

## 🖋️ Engineering Guidelines

### Type Safety
*   **No `any`**: The use of `any` is strictly prohibited. Use `unknown` or define a proper interface.
*   **Explicit Returns**: All public methods in `CoreEngine` and `SceneManager` must have explicit return types.

### Performance (Hot Loops)
*   **Zero-Allocation**: No object or array allocation is allowed inside the `_process` or `update` loops. Reuse `Vector3` and `Matrix` objects from a shared pool where possible.
*   **Matrix Math**: Prefer Babylon's `copyFrom` or `addInPlace` methods to avoid GC thrashing.

### Naming Conventions
*   **Classes/Interfaces**: `PascalCase` (e.g., `SceneManager`)
*   **Methods/Variables**: `camelCase` (e.g., `syncEntity`)
*   **Internal Parsers**: `_snake_case` (only for script bridge context)

---

## 🛡️ Getting Help

If you're stuck or have an architectural question, please join our community discussion or open a **Discussion** thread on GitHub.

*Axiom is built by a game developer, for game developers. Simple to use and powerful to create games..*
