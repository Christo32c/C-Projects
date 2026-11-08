# Character Sculptor (three.js)

A browser-based digital sculpting tool for blocking out and detailing characters, built on [three.js](https://threejs.org).

## Run it

It's plain ES modules with no build step. Serve the folder from any static server (ES modules don't load over `file://`):

```bash
cd threejs-character-sculptor
python3 -m http.server 8000
# open http://localhost:8000
```

three.js and three-mesh-bvh are loaded from the jsDelivr CDN through an import map, so you need an internet connection.

## Features

- **Base shapes**: humanoid (A-pose), head bust, creature, or a plain ball of clay, each at low, medium or high detail.
- **Brushes**: Draw, Clay, Inflate, Smooth, Flatten, Pinch, Crease, Grab and vertex-colour Paint.
- **X-axis symmetry** with a mirrored brush cursor, plus a one-shot *Mirror R→L*.
- **Undo/redo** with 40 steps.
- **Materials**: studio clay (PBR, soft shadows) and procedural matcaps (clay, red wax, jade, chrome). Wireframe and turntable modes.
- **Export**: GLB (with painted vertex colours), OBJ, STL for 3D printing, and PNG screenshots.

## Controls

| Action | Input |
| --- | --- |
| Sculpt | Left-drag on the model |
| Orbit / pan / zoom | Left-drag on background / right-drag / wheel |
| Smooth with any brush | Hold <kbd>Shift</kbd> |
| Invert brush | Hold <kbd>Ctrl</kbd> or <kbd>Alt</kbd>, or press <kbd>I</kbd> |
| Pick brush | <kbd>1</kbd>–<kbd>9</kbd> |
| Brush radius | <kbd>[</kbd> / <kbd>]</kbd> |
| Toggle symmetry / wireframe | <kbd>X</kbd> / <kbd>W</kbd> |
| Reset view | <kbd>F</kbd> |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> |

## How it works

| File | Role |
| --- | --- |
| `js/presets.js` | Base characters defined as signed distance functions (smooth unions of ellipsoids and tapered capsules). |
| `js/surfaceNets.js` | Surface Nets polygonizer that turns an SDF into a watertight, indexed mesh with shared vertices. |
| `js/sculptMesh.js` | The sculpting engine: vertex/face adjacency (CSR arrays), brush dabs with smooth falloff, incremental normal updates, grab, mirror and snapshots. |
| `js/main.js` | Scene, lighting, materials, pointer handling (stroke resampling, symmetry), UI and shortcuts. |
| `js/exporters.js` | GLB, OBJ and STL export through the three.js addon exporters. |

Picking uses [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh). The BVH is refit once per pointer event rather than rebuilt, which keeps strokes fast on meshes with 40k+ triangles.
