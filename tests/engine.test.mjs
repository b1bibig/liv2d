import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Parameters } from '../src/engine/params.js';
import { Binding, Keyform } from '../src/engine/keyform.js';
import { WarpDeformer, RotationDeformer, Head3DDeformer } from '../src/engine/deformers.js';
import { alphaBBox, gridMesh, edgeIndices } from '../src/engine/mesh.js';
import { Model } from '../src/engine/model.js';
import { Physics } from '../src/engine/physics.js';
import rig from '../models/placeholder/rig.js';

const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('parameters clamp and normalize around default', () => {
  const p = new Parameters([{ id: 'A', min: 0, max: 1, default: 1 }, { id: 'B', min: -30, max: 30 }]);
  p.set('A', 5);
  assert.equal(p.get('A'), 1);
  p.set('B', -15);
  close(p.normalized('B'), -0.5);
  p.set('A', 0.25);
  close(p.normalized('A'), -0.75);
  assert.throws(() => p.indexOf('nope'));
});

test('binding interpolates linearly and clamps outside keys', () => {
  const b = new Binding([0], [[-1, 0, 1]], [new Float32Array([-10]), null, new Float32Array([20])]);
  const out = new Float32Array(1);
  for (const [v, want] of [[-1, -10], [-0.5, -5], [0, 0], [0.25, 5], [1, 20], [3, 20], [-3, -10]]) {
    out[0] = 0;
    b.accumulate(new Float32Array([v]), out);
    close(out[0], want);
  }
});

test('binding over two parameters is bilinear', () => {
  // forms: (0,0)=0 (1,0)=1 (0,1)=2 (1,1)=10, first param fastest
  const f = (v) => new Float32Array([v]);
  const b = new Binding([0, 1], [[0, 1], [0, 1]], [f(0), f(1), f(2), f(10)]);
  const kf = new Keyform(1, [b]);
  const out = new Float32Array(1);
  kf.evaluate(new Float32Array([0.5, 0.5]), out);
  close(out[0], (0 + 1 + 2 + 10) / 4);
  kf.evaluate(new Float32Array([1, 0.5]), out);
  close(out[0], 5.5);
});

test('binding rejects bad specs', () => {
  assert.throws(() => new Binding([0], [[0, 1]], [null]));
  assert.throws(() => new Binding([0], [[1, 0]], [null, null]));
});

test('warp deformer at rest is identity, and extrapolates linearly', () => {
  const w = new WarpDeformer({ id: 'w', rect: [100, 100, 200, 100], grid: [2, 2] });
  w.update(new Float32Array(0));
  const out = [0, 0];
  for (const [x, y] of [[100, 100], [150, 130], [300, 200], [50, 250]]) {
    w.map(x, y, 0, true, out);
    close(out[0], x);
    close(out[1], y);
  }
});

test('warp keyform moves children', () => {
  const p = new Parameters([{ id: 'P' }]);
  const w = new WarpDeformer({ id: 'w', rect: [0, 0, 100, 100], grid: [1, 1] });
  // shift everything right by 10 at P=1
  w.keyform = new Keyform(8, [new Binding([0], [[0, 1]], [null, new Float32Array([10, 0, 10, 0, 10, 0, 10, 0])])]);
  p.set('P', 0.5);
  w.update(p.values);
  const out = w.map(50, 50, 0, true, [0, 0]);
  close(out[0], 55);
  close(out[1], 50);
});

test('rotation deformer rotates around its origin and inherits parent rotation', () => {
  const parent = new RotationDeformer({ id: 'a', origin: [0, 0] });
  parent.delta = new Float32Array([90, 0, 0, 0]);
  parent.keyform = null;
  // with no keyform the delta stays as set
  parent.update(new Float32Array(0));
  const out = parent.map(10, 0, 0, true, [0, 0]);
  close(out[0], 0);
  close(out[1], 10);

  const child = new RotationDeformer({ id: 'b', parent: 'a', origin: [10, 0] });
  child.parent = parent;
  child.update(new Float32Array(0));
  child.map(20, 0, 0, true, out);
  close(out[0], 0);
  close(out[1], 20);
});

test('head3d is identity at zero angles and turns the front more than the edge', () => {
  const h = new Head3DDeformer({ id: 'h', center: [0, 0], radius: [100, 100], depth: 1 });
  h.update(new Float32Array(0));
  const out = [0, 0];
  h.map(30, -20, 0, true, out);
  close(out[0], 30);
  close(out[1], -20);

  h.delta = new Float32Array([20, 0]);
  h.keyform = null;
  h.update(new Float32Array(0));
  const front = h.map(0, 0, 0, true, [0, 0])[0];
  const edge = h.map(99, 0, 0, true, [0, 0])[0] - 99;
  assert.ok(front > 30, `front moved ${front}`);
  assert.ok(Math.abs(edge) < front, 'edge moves less than the front');
  const behind = h.map(0, 0, -0.5, false, [0, 0])[0];
  assert.ok(behind < 0, 'negative depth moves the other way');
});

test('grid mesh covers only visible cells', () => {
  const W = 40;
  const H = 20;
  const alpha = new Uint8Array(W * H);
  // opaque block in the left half only
  for (let y = 0; y < H; y++) for (let x = 0; x < 10; x++) alpha[y * W + x] = 255;
  alpha[19 * W + 39] = 255; // one stray pixel far right
  const box = alphaBBox(alpha, W, H);
  assert.deepEqual(box, { x: 0, y: 0, w: 40, h: 20 });
  const m = gridMesh(alpha, W, H, box, 10);
  // 4x2 cells; block covers column 0 (+ neighbour through 1px dilation), stray pixel covers the last cell
  const cells = m.indices.length / 6;
  assert.ok(cells >= 3 && cells <= 5, `cells=${cells}`);
  assert.equal(m.positions.length, m.uvs.length);
  for (let i = 0; i < m.uvs.length; i++) assert.ok(m.uvs[i] >= 0 && m.uvs[i] <= 1);
  assert.ok(edgeIndices(m.indices).length > 0);
  assert.equal(alphaBBox(new Uint8Array(4), 2, 2), null);
});

function fakeMeshes() {
  // a small quad per part is enough to exercise the rig
  const m = new Map();
  for (const p of rig.parts) {
    m.set(p.id, {
      positions: new Float32Array([400, 500, 620, 500, 400, 700, 620, 700]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      indices: new Uint16Array([0, 1, 3, 0, 3, 2]),
    });
  }
  return m;
}

test('placeholder rig builds and is identity at default parameters', () => {
  const model = new Model(rig, fakeMeshes());
  model.update();
  for (const p of model.parts) {
    if (p.id.startsWith('hair') || p.id === 'ahoge') continue;
    for (let i = 0; i < p.rest.length; i++) close(p.world[i], p.rest[i] + p.delta[i], 1e-3);
  }
  assert.equal(model.partById.get('blush').opacity, 0);
  // parents come before children
  const seen = new Set();
  for (const d of model.deformers) {
    if (d.parent) assert.ok(seen.has(d.parent), `${d.id} evaluated before its parent`);
    seen.add(d);
  }
});

test('closing the eyes moves the upper lash down onto the lid', () => {
  const model = new Model(rig, fakeMeshes());
  const lash = model.partById.get('lash_upper_L');
  model.update();
  const openY = lash.world[1];
  model.params.set('ParamEyeLOpen', 0);
  model.update();
  assert.ok(lash.world[1] > openY, 'lash moved down');
  model.params.set('ParamEyeLSmile', 1);
  model.update();
  assert.equal(model.partById.get('lash_lower_L').opacity, 0);
});

test('model validates references', () => {
  const bad = { ...rig, parts: [{ ...rig.parts[0], parent: 'missing' }] };
  assert.throws(() => new Model(bad, fakeMeshes()), /unknown parent/);
  const badClip = { ...rig, parts: [{ ...rig.parts[0], clip: ['nope'] }] };
  assert.throws(() => new Model(badClip, fakeMeshes()), /unknown clip/);
});

test('physics: hair lags behind a head turn, then settles', () => {
  const params = new Parameters(rig.parameters);
  const physics = new Physics(rig.physics, params);
  const step = (angle) => {
    params.reset();
    params.set('ParamAngleX', angle);
    physics.update(1 / 60, params);
  };
  for (let i = 0; i < 5; i++) step(30);
  assert.ok(params.get('ParamHairFront') < -0.1, 'front hair swings opposite to the turn');
  for (let i = 0; i < 600; i++) step(30);
  close(params.get('ParamHairFront'), 0, 0.02);
  assert.ok(physics.outputParams().has('ParamHairAhoge'));
});
