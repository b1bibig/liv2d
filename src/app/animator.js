// Drives parameters every frame: pointer look-at, idle motion, blinking,
// breathing, expressions, lip sync, physics and manual (pinned) overrides.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class Animator {
  constructor(model) {
    this.model = model;
    this.params = model.params;
    this.rig = model.rig;
    this.enabled = true;
    this.time = 0;
    this.pointer = null;
    this.pointerTime = -Infinity;
    this.look = { x: 0, y: 0 };
    this.body = 0;
    this.blinkNext = 1.5;
    this.blinkStart = -1;
    this.expressions = this.rig.expressions ?? { neutral: { label: '기본', params: {} } };
    this.expression = 'neutral';
    this.exprCurrent = new Map();
    this.exprTarget = new Map();
    this.lipSync = null;
    this.mouth = 0;
    this.pinned = new Map();
  }

  // pointer in model space
  setPointer(x, y) {
    this.pointer = [x, y];
    this.pointerTime = this.time;
  }

  clearPointer() {
    this.pointer = null;
  }

  setExpression(name) {
    const expr = this.expressions[name];
    if (!expr) return;
    this.expression = name;
    const ids = new Set([...this.exprTarget.keys(), ...Object.keys(expr.params)]);
    for (const id of ids) {
      const v = expr.params[id];
      this.exprTarget.set(id, v ?? this.params.def(id).default);
      if (!this.exprCurrent.has(id)) this.exprCurrent.set(id, this.params.def(id).default);
    }
  }

  pin(id, v) {
    this.pinned.set(id, v);
  }

  unpin(id) {
    this.pinned.delete(id);
  }

  unpinAll() {
    this.pinned.clear();
  }

  applyPinned() {
    for (const [id, v] of this.pinned) this.params.set(id, v);
  }

  blinkFactor() {
    const t = this.time;
    if (this.blinkStart < 0 && t >= this.blinkNext) this.blinkStart = t;
    if (this.blinkStart < 0) return 1;
    const phase = (t - this.blinkStart) / 0.2;
    if (phase >= 1) {
      this.blinkStart = -1;
      this.blinkNext = t + (Math.random() < 0.2 ? 0.15 : 2 + Math.random() * 4);
      return 1;
    }
    return phase < 0.4 ? 1 - phase / 0.4 : (phase - 0.4) / 0.6;
  }

  update(dt) {
    const P = this.params;
    P.reset();
    if (!this.enabled) {
      this.applyPinned();
      return;
    }
    this.time += dt;
    const t = this.time;

    // where to look: pointer while it is active, otherwise a slow wander
    let tx;
    let ty;
    const la = this.rig.lookAt ?? { anchor: [this.model.canvas.width / 2, this.model.canvas.height / 3], range: [500, 500] };
    if (this.pointer && t - this.pointerTime < 4) {
      tx = clamp((this.pointer[0] - la.anchor[0]) / la.range[0], -1, 1);
      ty = clamp((this.pointer[1] - la.anchor[1]) / la.range[1], -1, 1);
    } else {
      tx = 0.35 * Math.sin(t * 0.37) + 0.12 * Math.sin(t * 0.91 + 2);
      ty = 0.18 * Math.sin(t * 0.53 + 1);
    }
    this.look.x = approach(this.look.x, tx, 5, dt);
    this.look.y = approach(this.look.y, ty, 5, dt);
    this.body = approach(this.body, tx, 2, dt);
    const { x: lx, y: ly } = this.look;

    P.set('ParamAngleX', lx * 30);
    P.set('ParamAngleY', -ly * 30);
    P.set('ParamAngleZ', -lx * ly * 25 + 3 * Math.sin(t * 0.6));
    P.set('ParamEyeBallX', clamp(tx, -1, 1));
    P.set('ParamEyeBallY', clamp(-ty, -1, 1));
    P.set('ParamBodyAngleX', this.body * 8);
    P.set('ParamBodyAngleZ', 2 * Math.sin(t * 0.45));
    P.set('ParamBreath', 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 3.4));

    for (const [id, target] of this.exprTarget) {
      const v = approach(this.exprCurrent.get(id), target, 9, dt);
      this.exprCurrent.set(id, v);
      P.set(id, v);
    }

    const blink = this.blinkFactor();
    for (const id of ['ParamEyeLOpen', 'ParamEyeROpen']) P.set(id, P.get(id) * blink);

    if (this.lipSync?.active) {
      this.mouth = approach(this.mouth, this.lipSync.level(), 18, dt);
      P.set('ParamMouthOpenY', Math.max(P.get('ParamMouthOpenY'), this.mouth));
    }

    this.applyPinned();
    this.model.physics.update(dt, P);
    this.applyPinned();
  }
}

// Microphone loudness -> mouth opening.
export class LipSync {
  constructor() {
    this.active = false;
    this.ctx = null;
    this.stream = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.active = true;
  }

  stop() {
    this.active = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
  }

  level() {
    if (!this.active) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    const rms = Math.sqrt(sum / this.buf.length);
    return clamp((rms - 0.015) * 9, 0, 1);
  }
}
