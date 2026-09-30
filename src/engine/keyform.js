// Keyform interpolation, the core of Live2D-style rigging.
//
// A binding ties a set of parameters to a grid of keyforms. Each keyform is a
// vector of deltas (vertex offsets, rotation angle, opacity ...). At runtime
// the current parameter values select a cell of the grid and the corners are
// blended multilinearly. Several bindings on the same object are additive.

export class Binding {
  // paramIndices: number[]            which parameters drive this binding
  // keys:        number[][]           sorted key values per parameter
  // forms:       (Float32Array|null)[] one per grid cell, first parameter fastest
  constructor(paramIndices, keys, forms) {
    if (paramIndices.length !== keys.length) throw new Error('params/keys length mismatch');
    const cells = keys.reduce((n, k) => n * k.length, 1);
    if (forms.length !== cells) throw new Error(`expected ${cells} forms, got ${forms.length}`);
    for (const k of keys) {
      for (let i = 1; i < k.length; i++) if (!(k[i] > k[i - 1])) throw new Error('keys must be strictly ascending');
    }
    this.params = paramIndices;
    this.keys = keys;
    this.forms = forms;
    this.strides = [];
    let s = 1;
    for (const k of keys) {
      this.strides.push(s);
      s *= k.length;
    }
    const n = keys.length;
    this._i = new Int32Array(n);
    this._t = new Float32Array(n);
  }

  // out += interpolated form
  accumulate(values, out) {
    const n = this.params.length;
    for (let k = 0; k < n; k++) {
      const keys = this.keys[k];
      const v = values[this.params[k]];
      const last = keys.length - 1;
      if (last === 0 || v <= keys[0]) {
        this._i[k] = 0;
        this._t[k] = 0;
      } else if (v >= keys[last]) {
        this._i[k] = last - 1;
        this._t[k] = 1;
      } else {
        let i = 0;
        while (v > keys[i + 1]) i++;
        this._i[k] = i;
        this._t[k] = (v - keys[i]) / (keys[i + 1] - keys[i]);
      }
    }
    const corners = 1 << n;
    for (let c = 0; c < corners; c++) {
      let w = 1;
      let idx = 0;
      for (let k = 0; k < n; k++) {
        const bit = (c >> k) & 1;
        const t = this._t[k];
        w *= bit ? t : 1 - t;
        if (w === 0) break;
        idx += (this._i[k] + bit) * this.strides[k];
      }
      if (w === 0) continue;
      const form = this.forms[idx];
      if (!form) continue;
      for (let j = 0; j < form.length; j++) out[j] += form[j] * w;
    }
  }
}

export class Keyform {
  constructor(length, bindings = []) {
    this.length = length;
    this.bindings = bindings;
  }

  // out = sum of all binding deltas
  evaluate(values, out) {
    out.fill(0);
    for (const b of this.bindings) b.accumulate(values, out);
    return out;
  }
}
