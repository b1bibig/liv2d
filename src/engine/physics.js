// Pendulum physics in the style of Cubism's physics3.json.
//
// Each rig reads some parameters as "inputs" (they move the pendulum's anchor
// sideways or tilt its gravity), simulates a chain of particles, and writes
// the swing angle of chosen particles back into "output" parameters, which in
// turn drive hair/accessory deformers through ordinary keyforms.

const DEG = Math.PI / 180;
const AIR_RESISTANCE = 5;
const STEP = 1 / 60;

function directionToRadian(fx, fy, tx, ty) {
  let r = Math.atan2(ty, tx) - Math.atan2(fy, fx);
  while (r < -Math.PI) r += Math.PI * 2;
  while (r > Math.PI) r -= Math.PI * 2;
  return r;
}

class PendulumRig {
  constructor(spec, params) {
    this.id = spec.id;
    // indexOf throws on unknown ids, which catches typos in the rig early
    this.inputs = spec.input.map((i) => {
      params.indexOf(i.param);
      return { param: i.param, type: i.type ?? 'x', weight: i.weight ?? 1, invert: !!i.invert };
    });
    this.outputs = spec.output.map((o) => {
      params.indexOf(o.param);
      return {
        param: o.param,
        particle: o.particle ?? spec.particles.length - 1,
        scale: o.scale ?? 1,
        weight: o.weight ?? 1,
        invert: !!o.invert,
      };
    });
    this.normPosition = spec.normalization?.position ?? 10;
    this.normAngle = spec.normalization?.angle ?? 10;
    this.defs = spec.particles.map((p) => ({
      radius: p.radius ?? 0,
      mobility: p.mobility ?? 1,
      delay: p.delay ?? 1,
      acceleration: p.acceleration ?? 1,
    }));
    this.reset();
  }

  reset() {
    let y = 0;
    this.particles = this.defs.map((d) => {
      y += d.radius;
      return { ...d, x: 0, y, lx: 0, ly: y, vx: 0, vy: 0, gx: 0, gy: 1 };
    });
  }

  readInputs(params) {
    let tx = 0;
    let angle = 0;
    for (const i of this.inputs) {
      const n = params.normalized(i.param) * (i.invert ? -1 : 1);
      if (i.type === 'angle') angle += n * this.normAngle * i.weight;
      else tx += n * this.normPosition * i.weight;
    }
    return [tx, angle];
  }

  step(dt, tx, angleDeg) {
    const rad = angleDeg * DEG;
    const gx = Math.sin(rad);
    const gy = Math.cos(rad);
    const P = this.particles;
    P[0].x = tx;
    P[0].y = 0;
    for (let i = 1; i < P.length; i++) {
      const p = P[i];
      const q = P[i - 1];
      p.lx = p.x;
      p.ly = p.y;
      const delay = p.delay * dt * 30;
      // carry the previous direction around with the change of gravity
      let dx = p.x - q.x;
      let dy = p.y - q.y;
      const r = directionToRadian(p.gx, p.gy, gx, gy) / AIR_RESISTANCE;
      const c = Math.cos(r);
      const s = Math.sin(r);
      [dx, dy] = [c * dx - s * dy, s * dx + c * dy];
      p.x = q.x + dx + p.vx * delay + gx * p.acceleration * delay * delay;
      p.y = q.y + dy + p.vy * delay + gy * p.acceleration * delay * delay;
      // keep segment length
      const nx = p.x - q.x;
      const ny = p.y - q.y;
      const len = Math.hypot(nx, ny) || 1;
      p.x = q.x + (nx / len) * p.radius;
      p.y = q.y + (ny / len) * p.radius;
      if (delay !== 0) {
        p.vx = ((p.x - p.lx) / delay) * p.mobility;
        p.vy = ((p.y - p.ly) / delay) * p.mobility;
      }
      p.gx = gx;
      p.gy = gy;
    }
  }

  writeOutputs(params) {
    const P = this.particles;
    for (const o of this.outputs) {
      const i = o.particle;
      const tx = P[i].x - P[i - 1].x;
      const ty = P[i].y - P[i - 1].y;
      let fx = 0;
      let fy = 1;
      if (i >= 2) {
        fx = P[i - 1].x - P[i - 2].x;
        fy = P[i - 1].y - P[i - 2].y;
      }
      let v = directionToRadian(fx, fy, tx, ty) * o.scale;
      if (o.invert) v = -v;
      params.blend(o.param, v, o.weight);
    }
  }
}

export class Physics {
  constructor(specs, params) {
    this.rigs = specs.map((s) => new PendulumRig(s, params));
    this.acc = 0;
  }

  reset() {
    this.rigs.forEach((r) => r.reset());
    this.acc = 0;
  }

  outputParams() {
    return new Set(this.rigs.flatMap((r) => r.outputs.map((o) => o.param)));
  }

  // Reads inputs from params, advances with a fixed timestep, writes outputs.
  update(dt, params) {
    this.acc += Math.min(dt, 0.1);
    const inputs = this.rigs.map((r) => r.readInputs(params));
    while (this.acc >= STEP) {
      this.rigs.forEach((r, k) => r.step(STEP, inputs[k][0], inputs[k][1]));
      this.acc -= STEP;
    }
    this.rigs.forEach((r) => r.writeOutputs(params));
  }
}
