// Parameter table. Values live in one Float32Array so keyform bindings can
// index them directly without string lookups in the hot path.

export class Parameters {
  constructor(defs) {
    this.defs = defs.map((d) => ({
      id: d.id,
      name: d.name ?? d.id,
      group: d.group ?? '',
      min: d.min ?? -1,
      max: d.max ?? 1,
      default: d.default ?? 0,
    }));
    this.index = new Map(this.defs.map((d, i) => [d.id, i]));
    if (this.index.size !== this.defs.length) throw new Error('duplicate parameter id');
    this.values = new Float32Array(this.defs.map((d) => d.default));
  }

  indexOf(id) {
    const i = this.index.get(id);
    if (i === undefined) throw new Error(`unknown parameter "${id}"`);
    return i;
  }

  has(id) {
    return this.index.has(id);
  }

  def(id) {
    return this.defs[this.indexOf(id)];
  }

  get(id) {
    const i = this.index.get(id);
    return i === undefined ? 0 : this.values[i];
  }

  set(id, v) {
    const i = this.index.get(id);
    if (i === undefined) return;
    const d = this.defs[i];
    this.values[i] = Math.min(d.max, Math.max(d.min, v));
  }

  // Blend toward v with the given weight (0..1).
  blend(id, v, weight = 1) {
    const i = this.index.get(id);
    if (i === undefined) return;
    this.set(id, this.values[i] + (v - this.values[i]) * weight);
  }

  reset() {
    this.defs.forEach((d, i) => (this.values[i] = d.default));
  }

  // Map a value to [-1, 1] around its default (used by physics inputs).
  normalized(id) {
    const i = this.index.get(id);
    if (i === undefined) return 0;
    const d = this.defs[i];
    const v = this.values[i];
    if (v >= d.default) return d.max === d.default ? 0 : (v - d.default) / (d.max - d.default);
    return d.min === d.default ? 0 : -(v - d.default) / (d.min - d.default);
  }
}
