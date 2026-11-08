// Signed distance base shapes used to generate starting meshes.
// All functions take plain numbers (no vector allocations) because they are
// evaluated millions of times while building the grid.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}

function sphere(x, y, z, cx, cy, cz, r) {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = x - cx, py = y - cy, pz = z - cz;
  const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
  const k1 = Math.sqrt((px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

// Capsule whose radius tapers linearly from ra (at a) to rb (at b).
function limb(x, y, z, a, b, ra, rb) {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}

// ---------------------------------------------------------------------------
// Humanoid in a relaxed A-pose. Y is up, +Z faces the viewer, height ~1.8.

function humanoidSide(x, y, z) {
  // Evaluated for the +X side only; the caller mirrors with |x|.
  const arm = smin(
    smin(
      limb(x, y, z, [0.2, 0.46, -0.01], [0.33, 0.2, -0.01], 0.058, 0.045),
      limb(x, y, z, [0.33, 0.2, -0.01], [0.44, -0.03, 0.03], 0.043, 0.032),
      0.025,
    ),
    ellipsoid(x, y, z, 0.47, -0.11, 0.035, 0.032, 0.075, 0.05),
    0.03,
  );
  const leg = smin(
    smin(
      limb(x, y, z, [0.1, -0.02, 0.0], [0.115, -0.43, 0.015], 0.09, 0.058),
      limb(x, y, z, [0.115, -0.43, 0.015], [0.125, -0.82, -0.02], 0.056, 0.038),
      0.03,
    ),
    limb(x, y, z, [0.125, -0.865, -0.03], [0.135, -0.885, 0.1], 0.04, 0.032),
    0.03,
  );
  const shoulder = sphere(x, y, z, 0.18, 0.46, -0.01, 0.07);
  return { arm, leg, shoulder };
}

export function humanoid(x, y, z) {
  const ax = Math.abs(x);
  const s = humanoidSide(ax, y, z);

  let torso = ellipsoid(x, y, z, 0, 0.36, 0, 0.19, 0.17, 0.115);
  torso = smin(torso, ellipsoid(x, y, z, 0, 0.15, 0.0, 0.15, 0.17, 0.1), 0.08);
  torso = smin(torso, ellipsoid(x, y, z, 0, -0.01, -0.005, 0.175, 0.12, 0.115), 0.08);
  torso = smin(torso, s.shoulder, 0.07);
  // Subtle chest and glute volumes
  torso = smin(torso, ellipsoid(ax, y, z, 0.085, 0.37, 0.06, 0.08, 0.07, 0.06), 0.05);
  torso = smin(torso, ellipsoid(ax, y, z, 0.075, -0.04, -0.06, 0.08, 0.08, 0.065), 0.05);

  const neck = limb(x, y, z, [0, 0.5, -0.01], [0, 0.66, 0.0], 0.056, 0.05);
  let head = ellipsoid(x, y, z, 0, 0.77, 0.0, 0.098, 0.12, 0.112);
  head = smin(head, ellipsoid(x, y, z, 0, 0.7, 0.04, 0.07, 0.06, 0.07), 0.04); // jaw
  head = smin(head, ellipsoid(x, y, z, 0, 0.76, 0.105, 0.016, 0.03, 0.02), 0.02); // nose
  head = smin(head, ellipsoid(ax, y, z, 0.098, 0.765, -0.005, 0.012, 0.03, 0.02), 0.012); // ears

  let body = smin(torso, neck, 0.05);
  body = smin(body, head, 0.04);
  body = smin(body, s.arm, 0.035);
  body = smin(body, s.leg, 0.045);
  return body;
}
humanoid.bounds = { min: [-0.55, -0.93, -0.2], max: [0.55, 0.92, 0.2] };
humanoid.target = [0, 0.02, 0];

// ---------------------------------------------------------------------------
// Head and shoulders bust, scaled up for facial detail.

export function bust(x, y, z) {
  const ax = Math.abs(x);
  let head = ellipsoid(x, y, z, 0, 0.32, 0, 0.3, 0.37, 0.34);
  head = smin(head, ellipsoid(x, y, z, 0, 0.1, 0.12, 0.2, 0.16, 0.2), 0.12); // jaw
  head = smin(head, ellipsoid(x, y, z, 0, 0.28, 0.31, 0.04, 0.07, 0.045), 0.04); // nose
  head = smin(head, ellipsoid(ax, y, z, 0.3, 0.3, -0.02, 0.035, 0.09, 0.06), 0.035); // ears
  head = smin(head, ellipsoid(ax, y, z, 0.13, 0.42, 0.24, 0.1, 0.05, 0.06), 0.06); // brow
  const neck = limb(x, y, z, [0, -0.35, -0.03], [0, 0.05, 0.0], 0.17, 0.15);
  let shoulders = ellipsoid(x, y, z, 0, -0.52, -0.03, 0.62, 0.2, 0.25);
  shoulders = smin(shoulders, ellipsoid(ax, y, z, 0.15, -0.48, 0.13, 0.17, 0.13, 0.1), 0.1);
  let body = smin(head, neck, 0.12);
  body = smin(body, shoulders, 0.16);
  // Flat cut at the bottom like a sculpted bust
  return Math.max(body, -(y + 0.62));
}
bust.bounds = { min: [-0.65, -0.65, -0.4], max: [0.65, 0.72, 0.45] };
bust.target = [0, 0.05, 0];

// ---------------------------------------------------------------------------
// A plain ball of clay for freeform sculpting.

export function clayBall(x, y, z) {
  return sphere(x, y, z, 0, 0, 0, 0.6);
}
clayBall.bounds = { min: [-0.6, -0.6, -0.6], max: [0.6, 0.6, 0.6] };
clayBall.target = [0, 0, 0];

// ---------------------------------------------------------------------------
// Chunky creature: big belly, stubby limbs, horns.

export function creature(x, y, z) {
  const ax = Math.abs(x);
  let body = ellipsoid(x, y, z, 0, -0.05, 0, 0.42, 0.45, 0.38);
  body = smin(body, ellipsoid(x, y, z, 0, 0.42, 0.06, 0.3, 0.26, 0.28), 0.12); // head
  body = smin(body, ellipsoid(x, y, z, 0, 0.36, 0.3, 0.17, 0.09, 0.08), 0.06); // snout
  body = smin(body, limb(ax, y, z, [0.18, 0.6, 0.0], [0.3, 0.82, -0.08], 0.06, 0.012), 0.04); // horns
  body = smin(body, limb(ax, y, z, [0.35, 0.1, 0.02], [0.55, -0.15, 0.12], 0.1, 0.075), 0.08); // arms
  body = smin(body, limb(ax, y, z, [0.2, -0.4, 0.0], [0.24, -0.72, 0.03], 0.14, 0.11), 0.08); // legs
  body = smin(body, ellipsoid(ax, y, z, 0.24, -0.76, 0.1, 0.12, 0.06, 0.16), 0.05); // feet
  body = smin(body, limb(x, y, z, [0, -0.3, -0.3], [0, -0.55, -0.62], 0.12, 0.03), 0.08); // tail
  return body;
}
creature.bounds = { min: [-0.7, -0.84, -0.7], max: [0.7, 0.84, 0.5] };
creature.target = [0, 0, 0];

export const PRESETS = { humanoid, bust, creature, clayBall };
