// Naive Surface Nets polygonizer.
// Samples a signed distance function (negative = inside) on a uniform grid and
// produces an indexed, watertight triangle mesh with shared vertices, which is
// exactly what a vertex-based sculpting engine needs (stable neighbourhoods).

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

// The 12 cube edges as pairs of corner indices (corners differ in exactly one bit).
const EDGES = [];
for (let i = 0; i < 8; i++) {
  for (let bit = 1; bit < 8; bit <<= 1) {
    const j = i | bit;
    if (j !== i) EDGES.push([i, j]);
  }
}

/**
 * @param {(x:number,y:number,z:number)=>number} sdf
 * @param {{min:number[],max:number[]}} bounds
 * @param {number} cellSize
 * @returns {{positions: Float32Array, indices: Uint32Array}}
 */
export function surfaceNets(sdf, bounds, cellSize) {
  const h = cellSize;
  // Pad by two cells so the surface never touches the grid boundary.
  const min = bounds.min.map((v) => v - 2 * h);
  const max = bounds.max.map((v) => v + 2 * h);
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;

  const field = new Float32Array(nx * ny * nz);
  let p = 0;
  for (let z = 0; z < nz; z++) {
    const wz = min[2] + z * h;
    for (let y = 0; y < ny; y++) {
      const wy = min[1] + y * h;
      for (let x = 0; x < nx; x++) {
        field[p++] = sdf(min[0] + x * h, wy, wz);
      }
    }
  }

  const sx = 1, sy = nx, sz = nx * ny;
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cellVert = new Int32Array(cnx * cny * cnz).fill(-1);
  const pos = [];
  const cornerOffset = CORNERS.map(([a, b, c]) => a * sx + b * sy + c * sz);
  const v = new Float32Array(8);

  // Pass 1: one vertex per cell that straddles the surface.
  for (let z = 0; z < cnz; z++) {
    for (let y = 0; y < cny; y++) {
      for (let x = 0; x < cnx; x++) {
        const base = x * sx + y * sy + z * sz;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = field[base + cornerOffset[c]];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let ax = 0, ay = 0, az = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const [i, j] = EDGES[e];
          const vi = v[i], vj = v[j];
          if ((vi < 0) === (vj < 0)) continue;
          const t = vi / (vi - vj);
          const ci = CORNERS[i], cj = CORNERS[j];
          ax += ci[0] + t * (cj[0] - ci[0]);
          ay += ci[1] + t * (cj[1] - ci[1]);
          az += ci[2] + t * (cj[2] - ci[2]);
          n++;
        }
        cellVert[x + cnx * (y + cny * z)] = pos.length / 3;
        pos.push(
          min[0] + (x + ax / n) * h,
          min[1] + (y + ay / n) * h,
          min[2] + (z + az / n) * h,
        );
      }
    }
  }

  // Pass 2: one quad per grid edge that crosses the surface.
  const idx = [];
  const dims = [nx, ny, nz];
  const cstride = [1, cnx, cnx * cny];
  const gstride = [sx, sy, sz];
  const coord = [0, 0, 0];
  const positions = pos; // alias for diagonal length tests

  const d2 = (a, b) => {
    const dx = positions[a * 3] - positions[b * 3];
    const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
    const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };

  for (let z = 0; z < nz; z++) {
    coord[2] = z;
    for (let y = 0; y < ny; y++) {
      coord[1] = y;
      for (let x = 0; x < nx; x++) {
        coord[0] = x;
        const g = x * sx + y * sy + z * sz;
        const c = x + cnx * (y + cny * z);
        for (let a = 0; a < 3; a++) {
          const u = (a + 1) % 3, w = (a + 2) % 3;
          if (coord[a] >= dims[a] - 1) continue;
          if (coord[u] < 1 || coord[w] < 1) continue;
          if (coord[u] >= dims[u] - 1 || coord[w] >= dims[w] - 1) continue;
          const f0 = field[g], f1 = field[g + gstride[a]];
          const in0 = f0 < 0;
          if (in0 === (f1 < 0)) continue;

          const q0 = cellVert[c - cstride[u] - cstride[w]];
          const q1 = cellVert[c - cstride[w]];
          const q2 = cellVert[c];
          const q3 = cellVert[c - cstride[u]];
          if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) continue;

          // (q0,q1,q2,q3) winds counter-clockwise around +a. Outward normal
          // points from inside to outside, so flip when the edge starts outside.
          let A = q0, B = q1, C = q2, D = q3;
          if (!in0) { B = q3; D = q1; }
          if (d2(A, C) <= d2(B, D)) idx.push(A, B, C, A, C, D);
          else idx.push(A, B, D, B, C, D);
        }
      }
    }
  }

  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}
