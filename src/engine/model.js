// Builds a runtime model from a rig description (see models/*/rig.js) and the
// meshes generated from its layer images.

import { Parameters } from './params.js';
import { Binding, Keyform } from './keyform.js';
import { DEFORMER_TYPES, WarpDeformer, RotationDeformer, Head3DDeformer } from './deformers.js';
import { Physics } from './physics.js';

const tmp = [0, 0];

export class ArtMesh {
  constructor(def, mesh) {
    this.id = def.id;
    this.parentId = def.parent ?? null;
    this.parent = null;
    this.z = def.z ?? 0;
    this.surface = def.surface ?? true;
    this.order = def.order ?? 0;
    this.clip = def.clip ?? [];
    this.baseOpacity = def.opacity ?? 1;
    this.rest = mesh.positions;
    this.uvs = mesh.uvs;
    this.indices = mesh.indices;
    this.vertexCount = mesh.positions.length / 2;
    this.delta = new Float32Array(mesh.positions.length + 1);
    this.world = new Float32Array(mesh.positions.length);
    this.opacity = this.baseOpacity;
    this.keyform = null;
  }

  get dataLength() {
    return this.rest.length + 1;
  }

  update(values) {
    const n = this.rest.length;
    if (this.keyform) this.keyform.evaluate(values, this.delta);
    this.opacity = Math.min(1, Math.max(0, this.baseOpacity + this.delta[n]));
    const P = this.parent;
    for (let k = 0; k < n; k += 2) {
      const x = this.rest[k] + this.delta[k];
      const y = this.rest[k + 1] + this.delta[k + 1];
      if (P) {
        P.map(x, y, this.z, this.surface, tmp);
        this.world[k] = tmp[0];
        this.world[k + 1] = tmp[1];
      } else {
        this.world[k] = x;
        this.world[k + 1] = y;
      }
    }
  }
}

// --- form conversion -------------------------------------------------------
// Rig authors write keyforms as small functions/objects; they are baked here
// into flat delta vectors that the runtime interpolates.

function bakeForm(target, form) {
  if (form == null) return null;
  if (form instanceof Float32Array) return form;
  if (Array.isArray(form)) return new Float32Array(form);
  const out = new Float32Array(target.dataLength);
  if (target instanceof WarpDeformer) {
    target.controlPoints().forEach(([x, y, u, v], i) => {
      const [dx, dy] = form(x, y, u, v);
      out[i * 2] = dx;
      out[i * 2 + 1] = dy;
    });
  } else if (target instanceof RotationDeformer) {
    out[0] = form.angle ?? 0;
    out[1] = form.x ?? 0;
    out[2] = form.y ?? 0;
    out[3] = form.scale ?? 0;
  } else if (target instanceof Head3DDeformer) {
    out[0] = form.yaw ?? 0;
    out[1] = form.pitch ?? 0;
  } else if (target instanceof ArtMesh) {
    const deform = typeof form === 'function' ? form : form.deform;
    if (deform) {
      const r = target.rest;
      for (let k = 0; k < r.length; k += 2) {
        const [dx, dy] = deform(r[k], r[k + 1]);
        out[k] = dx;
        out[k + 1] = dy;
      }
    }
    if (typeof form === 'object') out[target.rest.length] = form.opacity ?? 0;
  }
  return out;
}

function buildKeyform(target, specs, params) {
  if (!specs || specs.length === 0) return null;
  const bindings = specs.map((spec) => {
    const s = spec.param ? { params: [spec.param], keys: [spec.keys], forms: spec.forms } : spec;
    const idx = s.params.map((id) => params.indexOf(id));
    const forms = s.forms.map((f) => bakeForm(target, f));
    return new Binding(idx, s.keys, forms);
  });
  return new Keyform(target.dataLength, bindings);
}

export class Model {
  // rig: rig description; meshes: Map partId -> {positions, uvs, indices}
  constructor(rig, meshes) {
    this.rig = rig;
    this.canvas = rig.canvas;
    this.params = new Parameters(rig.parameters);

    const byId = new Map();
    const defs = rig.deformers ?? [];
    for (const def of defs) {
      const Type = DEFORMER_TYPES[def.type];
      if (!Type) throw new Error(`unknown deformer type "${def.type}" (${def.id})`);
      if (byId.has(def.id)) throw new Error(`duplicate id "${def.id}"`);
      byId.set(def.id, new Type(def));
    }
    for (const d of byId.values()) {
      if (d.parentId) {
        d.parent = byId.get(d.parentId);
        if (!d.parent) throw new Error(`deformer "${d.id}": unknown parent "${d.parentId}"`);
      }
    }
    // parents before children
    this.deformers = [];
    const visited = new Set();
    const visit = (d, stack = new Set()) => {
      if (visited.has(d)) return;
      if (stack.has(d)) throw new Error(`deformer cycle at "${d.id}"`);
      stack.add(d);
      if (d.parent) visit(d.parent, stack);
      visited.add(d);
      this.deformers.push(d);
    };
    for (const d of byId.values()) visit(d);
    this.deformerById = byId;
    for (const def of defs) byId.get(def.id).keyform = buildKeyform(byId.get(def.id), def.keys, this.params);

    this.parts = [];
    this.partById = new Map();
    for (const def of rig.parts) {
      const mesh = meshes.get(def.id);
      if (!mesh) throw new Error(`no mesh for part "${def.id}"`);
      const part = new ArtMesh(def, mesh);
      if (part.parentId) {
        part.parent = byId.get(part.parentId);
        if (!part.parent) throw new Error(`part "${part.id}": unknown parent "${part.parentId}"`);
      }
      part.keyform = buildKeyform(part, def.keys, this.params);
      this.parts.push(part);
      this.partById.set(part.id, part);
    }
    for (const p of this.parts) {
      for (const c of p.clip) if (!this.partById.has(c)) throw new Error(`part "${p.id}": unknown clip "${c}"`);
    }
    this.drawOrder = [...this.parts].sort((a, b) => a.order - b.order);
    this.physics = new Physics(rig.physics ?? [], this.params);
  }

  update() {
    const v = this.params.values;
    for (const d of this.deformers) d.update(v);
    for (const p of this.parts) p.update(v);
  }
}
