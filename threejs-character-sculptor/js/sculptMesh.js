import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { surfaceNets } from './surfaceNets.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

/**
 * Holds a sculptable mesh: geometry, adjacency, per-face normals and all the
 * brush operations. Positions and colours are edited in place.
 */
export class SculptMesh {
  constructor(material) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.raycast = acceleratedRaycast;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  build(sdf, cellSize, baseColor) {
    const { positions, indices } = surfaceNets(sdf, sdf.bounds, cellSize);
    relax(positions, indices, 2, 0.35);

    const old = this.mesh.geometry;
    if (old.boundsTree) old.disposeBoundsTree();
    old.dispose();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(positions.length), 3).setUsage(THREE.DynamicDrawUsage));
    const colors = new Float32Array(positions.length);
    const c = new THREE.Color(baseColor);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    // The BVH may reorder the index buffer, so build adjacency afterwards.
    geo.computeBoundsTree();
    this.mesh.geometry = geo;

    this.pos = positions;
    this.rest = positions.slice(); // rest pose, used to pair mirrored vertices
    this.col = colors;
    this.nrm = geo.attributes.normal.array;
    this.index = geo.index.array;
    this.vertexCount = positions.length / 3;
    this.faceCount = this.index.length / 3;
    this.buildAdjacency();
    this.faceN = new Float32Array(this.faceCount * 3);
    this.updateAllNormals();
    // scratch buffers
    this.vStamp = new Uint32Array(this.vertexCount);
    this.fStamp = new Uint32Array(this.faceCount);
    this.stamp = 1;
    this.tmp = new Float32Array(this.vertexCount * 3);
    this.sel = new Int32Array(this.vertexCount);
    this.selW = new Float32Array(this.vertexCount);
  }

  buildAdjacency() {
    const n = this.vertexCount, idx = this.index, fc = this.faceCount;
    // vertex -> faces (CSR)
    const fCount = new Uint32Array(n + 1);
    for (let i = 0; i < idx.length; i++) fCount[idx[i] + 1]++;
    for (let i = 0; i < n; i++) fCount[i + 1] += fCount[i];
    const fList = new Uint32Array(idx.length);
    const fill = fCount.slice(0, n);
    for (let f = 0; f < fc; f++) {
      for (let k = 0; k < 3; k++) { const v = idx[f * 3 + k]; fList[fill[v]++] = f; }
    }
    this.vfStart = fCount; this.vfList = fList;

    // vertex -> neighbouring vertices (CSR, deduplicated)
    const nStart = new Uint32Array(n + 1);
    const tmp = [];
    let total = 0;
    const seen = new Int32Array(n).fill(-1);
    for (let v = 0; v < n; v++) {
      nStart[v] = total;
      for (let j = fCount[v]; j < fCount[v + 1]; j++) {
        const f = fList[j];
        for (let k = 0; k < 3; k++) {
          const u = idx[f * 3 + k];
          if (u !== v && seen[u] !== v) { seen[u] = v; tmp.push(u); total++; }
        }
      }
    }
    nStart[n] = total;
    this.nStart = nStart; this.nList = Uint32Array.from(tmp);
  }

  computeFaceNormal(f) {
    const p = this.pos, i = this.index;
    const a = i[f * 3] * 3, b = i[f * 3 + 1] * 3, c = i[f * 3 + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    // unnormalised cross product: area weighted
    this.faceN[f * 3] = e1y * e2z - e1z * e2y;
    this.faceN[f * 3 + 1] = e1z * e2x - e1x * e2z;
    this.faceN[f * 3 + 2] = e1x * e2y - e1y * e2x;
  }

  computeVertexNormal(v) {
    let x = 0, y = 0, z = 0;
    for (let j = this.vfStart[v]; j < this.vfStart[v + 1]; j++) {
      const f = this.vfList[j] * 3;
      x += this.faceN[f]; y += this.faceN[f + 1]; z += this.faceN[f + 2];
    }
    const l = Math.hypot(x, y, z) || 1;
    this.nrm[v * 3] = x / l; this.nrm[v * 3 + 1] = y / l; this.nrm[v * 3 + 2] = z / l;
  }

  updateAllNormals() {
    for (let f = 0; f < this.faceCount; f++) this.computeFaceNormal(f);
    for (let v = 0; v < this.vertexCount; v++) this.computeVertexNormal(v);
  }

  /** Recompute normals around the given vertices (and their one-ring). */
  updateNormals(list, count) {
    const s = ++this.stamp;
    const ring = [];
    for (let i = 0; i < count; i++) {
      const v = list[i];
      for (let j = this.vfStart[v]; j < this.vfStart[v + 1]; j++) {
        const f = this.vfList[j];
        if (this.fStamp[f] === s) continue;
        this.fStamp[f] = s;
        this.computeFaceNormal(f);
        for (let k = 0; k < 3; k++) {
          const u = this.index[f * 3 + k];
          if (this.vStamp[u] !== s) { this.vStamp[u] = s; ring.push(u); }
        }
      }
    }
    for (const v of ring) this.computeVertexNormal(v);
  }

  /** Collects vertices inside a sphere with smooth falloff into this.sel / this.selW. */
  select(cx, cy, cz, r) {
    const p = this.pos, r2 = r * r;
    let n = 0;
    for (let v = 0, i = 0; v < this.vertexCount; v++, i += 3) {
      const dx = p[i] - cx;
      if (dx > r || dx < -r) continue;
      const dy = p[i + 1] - cy;
      if (dy > r || dy < -r) continue;
      const dz = p[i + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      const t = 1 - d2 / r2; // smooth bell: (1 - (d/r)^2)^2
      this.sel[n] = v;
      this.selW[n] = t * t;
      n++;
    }
    return n;
  }

  areaFrame(n) {
    // Weighted average normal and centre of the selection.
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0, wsum = 0;
    for (let i = 0; i < n; i++) {
      const v = this.sel[i] * 3, w = this.selW[i];
      nx += this.nrm[v] * w; ny += this.nrm[v + 1] * w; nz += this.nrm[v + 2] * w;
      cx += this.pos[v] * w; cy += this.pos[v + 1] * w; cz += this.pos[v + 2] * w;
      wsum += w;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    wsum = wsum || 1;
    return { nx: nx / l, ny: ny / l, nz: nz / l, cx: cx / wsum, cy: cy / wsum, cz: cz / wsum };
  }

  /**
   * Apply a single brush dab.
   * @returns {number} number of affected vertices (also left in this.sel)
   */
  dab(tool, center, radius, strength, invert, paintColor) {
    const n = this.select(center.x, center.y, center.z, radius);
    if (n === 0) return 0;
    const p = this.pos, nrm = this.nrm, sel = this.sel, w = this.selW;
    const sign = invert ? -1 : 1;

    switch (tool) {
      case 'draw': {
        const f = this.areaFrame(n);
        const amt = radius * 0.12 * strength * sign;
        for (let i = 0; i < n; i++) {
          const v = sel[i] * 3, d = amt * w[i];
          p[v] += f.nx * d; p[v + 1] += f.ny * d; p[v + 2] += f.nz * d;
        }
        break;
      }
      case 'clay': {
        // Draw towards a plane slightly above the surface: builds up flat strokes.
        const f = this.areaFrame(n);
        const off = radius * 0.12 * strength * sign;
        const px = f.cx + f.nx * off, py = f.cy + f.ny * off, pz = f.cz + f.nz * off;
        for (let i = 0; i < n; i++) {
          const v = sel[i] * 3;
          const dist = (p[v] - px) * f.nx + (p[v + 1] - py) * f.ny + (p[v + 2] - pz) * f.nz;
          if (dist * sign > 0) continue; // already past the plane
          const k = -dist * Math.min(1, w[i] * strength * 0.6);
          p[v] += f.nx * k; p[v + 1] += f.ny * k; p[v + 2] += f.nz * k;
        }
        break;
      }
      case 'inflate': {
        const amt = radius * 0.06 * strength * sign;
        for (let i = 0; i < n; i++) {
          const v = sel[i] * 3, d = amt * w[i];
          p[v] += nrm[v] * d; p[v + 1] += nrm[v + 1] * d; p[v + 2] += nrm[v + 2] * d;
        }
        break;
      }
      case 'smooth':
        this.smoothSelection(n, Math.min(1, strength * 0.9));
        break;
      case 'flatten': {
        const f = this.areaFrame(n);
        for (let i = 0; i < n; i++) {
          const v = sel[i] * 3;
          const dist = (p[v] - f.cx) * f.nx + (p[v + 1] - f.cy) * f.ny + (p[v + 2] - f.cz) * f.nz;
          const k = -dist * Math.min(1, w[i] * strength * 0.5);
          p[v] += f.nx * k; p[v + 1] += f.ny * k; p[v + 2] += f.nz * k;
        }
        break;
      }
      case 'pinch': {
        const f = this.areaFrame(n);
        const amt = 0.18 * strength * sign;
        for (let i = 0; i < n; i++) {
          const v = sel[i] * 3;
          let dx = center.x - p[v], dy = center.y - p[v + 1], dz = center.z - p[v + 2];
          const dn = dx * f.nx + dy * f.ny + dz * f.nz; // keep movement tangential
          dx -= f.nx * dn; dy -= f.ny * dn; dz -= f.nz * dn;
          const k = amt * w[i];
          p[v] += dx * k; p[v + 1] += dy * k; p[v + 2] += dz * k;
        }
        break;
      }
      case 'crease': {
        // Pinch + carve a groove (or a ridge when inverted).
        const f = this.areaFrame(n);
        const depth = -radius * 0.08 * strength * sign;
        for (let i = 0; i < n; i++) {
          const v = sel[i] * 3;
          let dx = center.x - p[v], dy = center.y - p[v + 1], dz = center.z - p[v + 2];
          const dn = dx * f.nx + dy * f.ny + dz * f.nz;
          dx -= f.nx * dn; dy -= f.ny * dn; dz -= f.nz * dn;
          const wi = w[i], k = 0.15 * strength * wi, d = depth * wi * wi;
          p[v] += dx * k + f.nx * d; p[v + 1] += dy * k + f.ny * d; p[v + 2] += dz * k + f.nz * d;
        }
        break;
      }
      case 'paint': {
        const c = this.col;
        for (let i = 0; i < n; i++) {
          const v = sel[i] * 3, k = Math.min(1, w[i] * strength * 0.8) * (invert ? 0.5 : 1);
          const tr = invert ? 1 - paintColor.r : paintColor.r; // invert paints the complement softly
          const tg = invert ? 1 - paintColor.g : paintColor.g;
          const tb = invert ? 1 - paintColor.b : paintColor.b;
          c[v] += (tr - c[v]) * k; c[v + 1] += (tg - c[v + 1]) * k; c[v + 2] += (tb - c[v + 2]) * k;
        }
        return n;
      }
    }
    this.updateNormals(sel, n);
    return n;
  }

  smoothSelection(n, amount) {
    const p = this.pos, t = this.tmp, sel = this.sel, w = this.selW;
    for (let i = 0; i < n; i++) {
      const v = sel[i];
      let ax = 0, ay = 0, az = 0;
      const s = this.nStart[v], e = this.nStart[v + 1];
      for (let j = s; j < e; j++) {
        const u = this.nList[j] * 3;
        ax += p[u]; ay += p[u + 1]; az += p[u + 2];
      }
      const cnt = e - s || 1;
      t[i * 3] = ax / cnt; t[i * 3 + 1] = ay / cnt; t[i * 3 + 2] = az / cnt;
    }
    for (let i = 0; i < n; i++) {
      const v = sel[i] * 3, k = amount * w[i];
      p[v] += (t[i * 3] - p[v]) * k;
      p[v + 1] += (t[i * 3 + 1] - p[v + 1]) * k;
      p[v + 2] += (t[i * 3 + 2] - p[v + 2]) * k;
    }
  }

  // ---- Grab (snake-hook style move) -------------------------------------
  beginGrab(center, radius, mirror) {
    const weights = new Map(); // vertex -> [wPrimary, wMirror]
    const collect = (cx, slot) => {
      const n = this.select(cx, center.y, center.z, radius);
      for (let i = 0; i < n; i++) {
        const v = this.sel[i];
        let e = weights.get(v);
        if (!e) { e = [0, 0]; weights.set(v, e); }
        e[slot] = this.selW[i];
      }
    };
    collect(center.x, 0);
    if (mirror) collect(-center.x, 1);
    const count = weights.size;
    const ids = new Int32Array(count), wa = new Float32Array(count), wb = new Float32Array(count);
    const orig = new Float32Array(count * 3);
    let i = 0;
    for (const [v, [a, b]] of weights) {
      ids[i] = v; wa[i] = a; wb[i] = b;
      orig[i * 3] = this.pos[v * 3]; orig[i * 3 + 1] = this.pos[v * 3 + 1]; orig[i * 3 + 2] = this.pos[v * 3 + 2];
      i++;
    }
    this.grab = { ids, wa, wb, orig, count };
  }

  updateGrab(dx, dy, dz) {
    const g = this.grab;
    if (!g) return;
    const p = this.pos;
    for (let i = 0; i < g.count; i++) {
      const v = g.ids[i] * 3, a = g.wa[i], b = g.wb[i];
      p[v] = g.orig[i * 3] + dx * a - dx * b;
      p[v + 1] = g.orig[i * 3 + 1] + dy * (a + b);
      p[v + 2] = g.orig[i * 3 + 2] + dz * (a + b);
    }
    this.updateNormals(g.ids, g.count);
  }

  endGrab() { this.grab = null; }

  // ---- Bookkeeping ------------------------------------------------------
  markDirty({ positions = true, colors = false } = {}) {
    const a = this.mesh.geometry.attributes;
    if (positions) { a.position.needsUpdate = true; a.normal.needsUpdate = true; }
    if (colors) a.color.needsUpdate = true;
  }

  refit() {
    const g = this.mesh.geometry;
    g.boundsTree.refit();
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }

  snapshot() {
    return { pos: this.pos.slice(), col: this.col.slice() };
  }

  restore(s) {
    this.pos.set(s.pos);
    this.col.set(s.col);
    this.updateAllNormals();
    this.markDirty({ positions: true, colors: true });
    this.refit();
  }

  fillColor(color) {
    for (let i = 0; i < this.col.length; i += 3) {
      this.col[i] = color.r; this.col[i + 1] = color.g; this.col[i + 2] = color.b;
    }
    this.markDirty({ positions: false, colors: true });
  }

  /** Global relax pass, useful after heavy edits. */
  smoothAll(iterations = 1, amount = 0.5) {
    relax(this.pos, this.index, iterations, amount, this);
    this.updateAllNormals();
    this.markDirty();
    this.refit();
  }

  /** Mirror the +X half onto the -X half (or vice versa). */
  mirror(fromPositive = true) {
    // Pair each vertex with its mirror partner using the (symmetric) rest
    // positions, then copy the partner's current, mirrored position.
    const p = this.pos, r = this.rest, n = this.vertexCount;
    const box = this.mesh.geometry.boundingBox;
    const cell = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) / 64;
    const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const grid = new Map();
    for (let v = 0; v < n; v++) {
      const x = r[v * 3];
      if (fromPositive ? x < 0 : x > 0) continue;
      const k = key(x, r[v * 3 + 1], r[v * 3 + 2]);
      let arr = grid.get(k); if (!arr) grid.set(k, arr = []); arr.push(v);
    }
    const out = p.slice();
    const outC = this.col.slice();
    for (let v = 0; v < n; v++) {
      const x = r[v * 3], y = r[v * 3 + 1], z = r[v * 3 + 2];
      if (fromPositive ? x >= 0 : x <= 0) continue;
      const mx = -x;
      const cx = Math.floor(mx / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      let best = -1, bd = Infinity;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const arr = grid.get(`${cx + i},${cy + j},${cz + k}`);
        if (!arr) continue;
        for (const u of arr) {
          const d = (r[u * 3] - mx) ** 2 + (r[u * 3 + 1] - y) ** 2 + (r[u * 3 + 2] - z) ** 2;
          if (d < bd) { bd = d; best = u; }
        }
      }
      if (best < 0) continue;
      out[v * 3] = -p[best * 3]; out[v * 3 + 1] = p[best * 3 + 1]; out[v * 3 + 2] = p[best * 3 + 2];
      outC[v * 3] = this.col[best * 3]; outC[v * 3 + 1] = this.col[best * 3 + 1]; outC[v * 3 + 2] = this.col[best * 3 + 2];
    }
    this.pos.set(out);
    this.col.set(outC);
    this.updateAllNormals();
    this.markDirty({ positions: true, colors: true });
    this.refit();
  }
}

/** Uniform Laplacian relaxation over the whole mesh. */
function relax(pos, index, iterations, amount, adj) {
  const n = pos.length / 3;
  let nStart = adj?.nStart, nList = adj?.nList;
  if (!nStart) {
    // build a quick edge-based neighbour sum without CSR
    const sum = new Float32Array(pos.length), cnt = new Uint16Array(n);
    for (let it = 0; it < iterations; it++) {
      sum.fill(0); cnt.fill(0);
      for (let f = 0; f < index.length; f += 3) {
        for (let k = 0; k < 3; k++) {
          const a = index[f + k], b = index[f + ((k + 1) % 3)];
          sum[a * 3] += pos[b * 3]; sum[a * 3 + 1] += pos[b * 3 + 1]; sum[a * 3 + 2] += pos[b * 3 + 2];
          sum[b * 3] += pos[a * 3]; sum[b * 3 + 1] += pos[a * 3 + 1]; sum[b * 3 + 2] += pos[a * 3 + 2];
          cnt[a]++; cnt[b]++;
        }
      }
      for (let v = 0; v < n; v++) {
        if (!cnt[v]) continue;
        for (let k = 0; k < 3; k++) pos[v * 3 + k] += (sum[v * 3 + k] / cnt[v] - pos[v * 3 + k]) * amount;
      }
    }
    return;
  }
  const t = new Float32Array(pos.length);
  for (let it = 0; it < iterations; it++) {
    for (let v = 0; v < n; v++) {
      let ax = 0, ay = 0, az = 0;
      const s = nStart[v], e = nStart[v + 1];
      for (let j = s; j < e; j++) { const u = nList[j] * 3; ax += pos[u]; ay += pos[u + 1]; az += pos[u + 2]; }
      const c = e - s || 1;
      t[v * 3] = ax / c; t[v * 3 + 1] = ay / c; t[v * 3 + 2] = az / c;
    }
    for (let i = 0; i < pos.length; i++) pos[i] += (t[i] - pos[i]) * amount;
  }
}
