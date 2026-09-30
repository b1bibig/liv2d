// Deformers transform points authored in rest (model) space into world space.
//
// Every deformer is evaluated once per frame (update) and can then map any
// rest-space point (map). Children call their parent's map, so transforms
// compose down the hierarchy exactly like Cubism's warp/rotation deformers.
//
// map(x, y, z, surface, out) -> out
//   z / surface are only consumed by Head3D (pseudo-3D depth); the other
//   deformers pass world points through their precomputed state.

const DEG = Math.PI / 180;
const tmp = [0, 0];
const tmp2 = [0, 0];

class Deformer {
  constructor(def) {
    this.id = def.id;
    this.parentId = def.parent ?? null;
    this.parent = null;
    this.z = def.z ?? 0;
    this.surface = def.surface ?? true;
    this.keyform = null;
    this.delta = null;
  }

  mapParent(x, y, out) {
    if (this.parent) return this.parent.map(x, y, this.z, this.surface, out);
    out[0] = x;
    out[1] = y;
    return out;
  }
}

// Lattice deformer. Control points form a (cols+1) x (rows+1) grid over a rest
// rectangle; keyforms move the control points and children are bilinearly
// interpolated inside (and linearly extrapolated outside) the lattice.
export class WarpDeformer extends Deformer {
  constructor(def) {
    super(def);
    const [x, y, w, h] = def.rect;
    this.rect = def.rect;
    this.cols = def.grid?.[0] ?? 3;
    this.rows = def.grid?.[1] ?? 3;
    const n = (this.cols + 1) * (this.rows + 1);
    this.rest = new Float32Array(n * 2);
    for (let j = 0; j <= this.rows; j++) {
      for (let i = 0; i <= this.cols; i++) {
        const k = (j * (this.cols + 1) + i) * 2;
        this.rest[k] = x + (w * i) / this.cols;
        this.rest[k + 1] = y + (h * j) / this.rows;
      }
    }
    this.world = new Float32Array(n * 2);
    this.delta = new Float32Array(n * 2);
  }

  get dataLength() {
    return this.rest.length;
  }

  // (x, y, u, v) of every control point, u/v in 0..1 over the rest rect
  controlPoints() {
    const pts = [];
    for (let j = 0; j <= this.rows; j++) {
      for (let i = 0; i <= this.cols; i++) {
        const k = (j * (this.cols + 1) + i) * 2;
        pts.push([this.rest[k], this.rest[k + 1], i / this.cols, j / this.rows]);
      }
    }
    return pts;
  }

  update(values) {
    if (this.keyform) this.keyform.evaluate(values, this.delta);
    const n = this.rest.length;
    for (let k = 0; k < n; k += 2) {
      this.mapParent(this.rest[k] + this.delta[k], this.rest[k + 1] + this.delta[k + 1], tmp);
      this.world[k] = tmp[0];
      this.world[k + 1] = tmp[1];
    }
  }

  map(x, y, _z, _surface, out) {
    const [rx, ry, rw, rh] = this.rect;
    const u = ((x - rx) / rw) * this.cols;
    const v = ((y - ry) / rh) * this.rows;
    const ci = Math.min(this.cols - 1, Math.max(0, Math.floor(u)));
    const cj = Math.min(this.rows - 1, Math.max(0, Math.floor(v)));
    const fu = u - ci;
    const fv = v - cj;
    const stride = this.cols + 1;
    const a = (cj * stride + ci) * 2;
    const b = a + 2;
    const c = a + stride * 2;
    const d = c + 2;
    const W = this.world;
    const w00 = (1 - fu) * (1 - fv);
    const w10 = fu * (1 - fv);
    const w01 = (1 - fu) * fv;
    const w11 = fu * fv;
    out[0] = W[a] * w00 + W[b] * w10 + W[c] * w01 + W[d] * w11;
    out[1] = W[a + 1] * w00 + W[b + 1] * w10 + W[c + 1] * w01 + W[d + 1] * w11;
    return out;
  }
}

// Rotates children around an origin. Keyform vector: [angleDeg, dx, dy, dScale].
export class RotationDeformer extends Deformer {
  constructor(def) {
    super(def);
    this.origin = def.origin;
    this.delta = new Float32Array(4);
    this.O = [0, 0];
    this.cos = 1;
    this.sin = 0;
    this.scale = 1;
  }

  get dataLength() {
    return 4;
  }

  update(values) {
    if (this.keyform) this.keyform.evaluate(values, this.delta);
    const [angle, dx, dy, ds] = this.delta;
    const ox = this.origin[0] + dx;
    const oy = this.origin[1] + dy;
    this.mapParent(ox, oy, this.O);
    // Inherit the parent's local rotation/scale by probing a point above the origin.
    let parentAngle = 0;
    let parentScale = 1;
    if (this.parent) {
      const R = 100;
      this.mapParent(ox, oy - R, tmp);
      const vx = tmp[0] - this.O[0];
      const vy = tmp[1] - this.O[1];
      parentAngle = Math.atan2(vx, -vy);
      parentScale = Math.hypot(vx, vy) / R;
    }
    const theta = angle * DEG + parentAngle;
    this.cos = Math.cos(theta);
    this.sin = Math.sin(theta);
    this.scale = (1 + ds) * parentScale;
  }

  map(x, y, _z, _surface, out) {
    const dx = (x - this.origin[0]) * this.scale;
    const dy = (y - this.origin[1]) * this.scale;
    out[0] = this.O[0] + this.cos * dx - this.sin * dy;
    out[1] = this.O[1] + this.sin * dx + this.cos * dy;
    return out;
  }
}

// Pseudo-3D head. Points inside the head ellipse are lifted onto a dome
// (plus a per-object depth offset), rotated by yaw/pitch and projected back.
// This gives the "face turns in 3D" look without hand-authoring every angle.
// Keyform vector: [yawDeg, pitchDeg].
export class Head3DDeformer extends Deformer {
  constructor(def) {
    super(def);
    this.center = def.center;
    this.radius = def.radius;
    this.depth = def.depth ?? 0.6;
    this.delta = new Float32Array(2);
    this.cy = 1;
    this.sy = 0;
    this.cp = 1;
    this.sp = 0;
  }

  get dataLength() {
    return 2;
  }

  update(values) {
    if (this.keyform) this.keyform.evaluate(values, this.delta);
    const yaw = this.delta[0] * DEG;
    const pitch = this.delta[1] * DEG;
    this.cy = Math.cos(yaw);
    this.sy = Math.sin(yaw);
    this.cp = Math.cos(pitch);
    this.sp = Math.sin(pitch);
  }

  // Rest-space point -> rotated point, still in this deformer's parent space.
  project(x, y, z, surface, out) {
    const [cx, cy] = this.center;
    const [rx, ry] = this.radius;
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    let Z = z;
    if (surface) {
      // paraboloid rather than sphere: no infinite slope at the rim, so coarse
      // warp lattices and fine meshes near the silhouette stay in agreement
      const r2 = nx * nx + ny * ny;
      if (r2 < 1) Z += (1 - r2) * this.depth;
    }
    const X1 = nx * this.cy + Z * this.sy;
    const Z1 = -nx * this.sy + Z * this.cy;
    const Y1 = ny * this.cp - Z1 * this.sp;
    out[0] = cx + X1 * rx;
    out[1] = cy + Y1 * ry;
    return out;
  }

  map(x, y, z, surface, out) {
    this.project(x, y, z, surface, tmp2);
    return this.mapParent(tmp2[0], tmp2[1], out);
  }
}

export const DEFORMER_TYPES = {
  warp: WarpDeformer,
  rotation: RotationDeformer,
  head3d: Head3DDeformer,
};
