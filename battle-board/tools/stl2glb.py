"""Convert a binary STL miniature into a painted, Y-up GLB for the battle board.

Usage: python3 stl2glb.py input.stl output.glb

The paint regions below are tuned for the paladin sculpt (base, armour, leather,
skin, cape, plume and blade). The output has four meshes, "paint" (vertex colours),
"base", "cloth" (tinted at runtime with the character colour) and "blade" (tinted
by the equipped weapon). 1 unit = one 5 ft square, so the base comes out ~0.96 wide.
"""
import struct, json, sys, numpy as np
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read()
a = np.frombuffer(d[84:], dtype=np.dtype([('n', '<3f4'), ('v', '<9f4'), ('a', '<u2')]))
T = a['v'].reshape(-1, 3, 3).astype(np.float64)
c = T.mean(1)
ax, ay = -1.5, -1.0                                   # body axis in the sculpt's XY
r = np.hypot(c[:, 0] - ax, c[:, 1] - ay)
fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12

# --- paint regions (per triangle) ---
BASE, STEEL, BLADE, HILT, LEATHER, SKIN, CLOTH, PLUME = range(8)
lab = np.full(len(T), STEEL)
lab[(c[:, 2] > 3.3) & (c[:, 2] < 12)] = LEATHER                       # boots and greaves
lab[(c[:, 2] >= 12) & (c[:, 2] < 19)] = STEEL                         # tassets / thighs
lab[(c[:, 1] < -5.2) & (np.abs(c[:, 0] - ax) < 2.6) & (c[:, 2] > 3) & (c[:, 2] < 20.5)] = BLADE
front = (c[:, 1] < -4.5) & (np.abs(c[:, 0] - ax) < 3.4)
lab[front & (c[:, 2] >= 20.5) & (c[:, 2] < 25.5)] = LEATHER               # gloved hands
lab[front & (np.abs(c[:, 0] - ax) < 2.2) & (((c[:, 2] >= 19.5) & (c[:, 2] < 21)) | ((c[:, 2] >= 25.5) & (c[:, 2] < 27.5)))] = HILT
lab[((c[:, 1] > 2.6) & (c[:, 2] > 6) & (c[:, 2] < 28)) | ((r > 6.2) & (c[:, 2] > 6) & (c[:, 2] < 19) & (c[:, 1] > -5))] = CLOTH
lab[c[:, 2] > 33.5] = PLUME
lab[(c[:, 2] > 28) & (c[:, 2] < 31.5) & (c[:, 1] < -3.2) & (np.abs(c[:, 0] - ax) < 1.6)] = SKIN
lab[c[:, 2] < 3.3] = BASE
PAL = {BASE: '#3b342d', STEEL: '#9ea7b1', BLADE: '#dfe6ee', HILT: '#c9a24a', LEATHER: '#5a3e2b', SKIN: '#d6a982'}

def hexrgb(h): return [int(h[i:i + 2], 16) for i in (1, 3, 5)]

# Y-up, centred on the base, scaled so the base is ~0.96 squares wide
bx, by = (T[:, :, 0].min() + T[:, :, 0].max()) / 2, (T[:, :, 1].min() + T[:, :, 1].max()) / 2
S = 0.96 / (T[:, :, 0].max() - T[:, :, 0].min())
def xf(P): return np.stack([(P[..., 0] - bx) * S, (P[..., 2] - T[:, :, 2].min()) * S, -(P[..., 1] - by) * S], -1)

prims = []
def build(mask, colors, weld=True):
    tris = xf(T[mask])                                   # (n,3,3)
    if weld:
        flat = tris.reshape(-1, 3); key = np.round(flat / 1e-5).astype(np.int64)
        uniq, inv = np.unique(key, axis=0, return_inverse=True)
        inv = inv.reshape(-1)
        pos = np.zeros((len(uniq), 3)); np.add.at(pos, inv, flat); cnt = np.bincount(inv, minlength=len(uniq))[:, None]; pos /= cnt
        idx = inv.reshape(-1, 3)
    else:
        pos = tris.reshape(-1, 3); idx = np.arange(len(pos)).reshape(-1, 3)
    fnn = np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]])
    nrm = np.zeros_like(pos); [np.add.at(nrm, idx[:, k], fnn) for k in range(3)]
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
    col = None
    if colors is not None:
        tc = colors[mask]; col = np.zeros((len(pos), 4), np.float64)
        for k in range(3): np.add.at(col, idx[:, k], np.c_[tc, np.ones(len(tc))])
        col = (col[:, :3] / col[:, 3:]).clip(0, 255)
        # cheap cavity darkening: concave-ish verts (normal facing down/inward) a touch darker
        col *= (0.82 + 0.18 * np.clip(nrm[:, 1] * 0.5 + 0.6, 0, 1))[:, None]
        col = ((col / 255.0) ** 2.2 * 255).clip(0, 255)          # glTF vertex colours are linear
        col = np.c_[col, np.full(len(col), 255)].astype(np.uint8)
    return pos.astype(np.float32), nrm.astype(np.float32), col, idx.astype(np.uint32 if len(pos) > 65535 else np.uint16)

tricol = np.zeros((len(T), 3))
for k, h in PAL.items(): tricol[lab == k] = hexrgb(h)
paint = build((lab != CLOTH) & (lab != PLUME) & (lab != BASE) & (lab != BLADE), tricol)
blade = build(lab == BLADE, None)
base = build(lab == BASE, tricol, weld=False)
cloth = build((lab == CLOTH) | (lab == PLUME), None)

bin_ = bytearray(); views = []; accs = []
def add(arr, target, comp, ctype, normalized=False, minmax=False):
    off = len(bin_); b = arr.tobytes(); bin_.extend(b); bin_.extend(b'\0' * ((4 - len(b) % 4) % 4))
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), **({'target': target} if target else {})})
    acc = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': len(arr), 'type': comp}
    if normalized: acc['normalized'] = True
    if minmax: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
    accs.append(acc); return len(accs) - 1
meshes, nodes, mats = [], [], [
    {'name': 'paint', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.55, 'roughnessFactor': 0.42}},
    {'name': 'base', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.85}},
    {'name': 'cloth', 'pbrMetallicRoughness': {'baseColorFactor': [0.25, 0.43, 0.56, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.8}, 'doubleSided': True},
    {'name': 'blade', 'pbrMetallicRoughness': {'baseColorFactor': [0.75, 0.79, 0.84, 1], 'metallicFactor': 0.9, 'roughnessFactor': 0.25}}]
for name, (pos, nrm, col, idx), m in [('paint', paint, 0), ('base', base, 1), ('cloth', cloth, 2), ('blade', blade, 3)]:
    at = {'POSITION': add(pos, 34962, 'VEC3', 5126, minmax=True), 'NORMAL': add(nrm, 34962, 'VEC3', 5126)}
    if col is not None: at['COLOR_0'] = add(col, 34962, 'VEC4', 5121, normalized=True)
    ia = add(idx.reshape(-1), 34963, 'SCALAR', 5125 if idx.dtype == np.uint32 else 5123)
    meshes.append({'name': name, 'primitives': [{'attributes': at, 'indices': ia, 'material': m}]})
    nodes.append({'name': name, 'mesh': len(meshes) - 1})
gl = {'asset': {'version': '2.0', 'generator': 'battle-board stl2glb'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
      'nodes': nodes, 'meshes': meshes, 'materials': mats, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gl, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
open(dst, 'wb').write(out)
print('tris', len(T), 'regions', np.bincount(lab, minlength=8).tolist(), 'bytes', len(out), 'height', float(xf(T)[..., 1].max()))
