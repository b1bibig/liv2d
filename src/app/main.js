import { loadModel } from '../engine/loader.js';
import { Renderer } from '../engine/renderer.js';
import { Animator, LipSync } from './animator.js';
import { createPanel } from './panel.js';

const query = new URLSearchParams(location.search);
const modelName = query.get('model') || 'placeholder';
const still = query.has('still');

const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const status = document.getElementById('status');

async function main() {
  const renderer = new Renderer(canvas);
  const model = await loadModel(`models/${modelName}/`);
  renderer.setModel(model);
  const animator = new Animator(model);
  animator.enabled = !still;

  const view = { scale: 1, x: 0, y: 0, dpr: 1 };
  const options = { wireframe: query.has('wire') };

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = stage.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    renderer.resize(W, H);
    const [fx, fy, fw, fh] = model.rig.frame ?? [0, 0, model.canvas.width, model.canvas.height];
    const scale = Math.min(W / fw, H / fh);
    Object.assign(view, { dpr, scale, x: (W - fw * scale) / 2 - fx * scale, y: H - fh * scale - fy * scale });
  }
  new ResizeObserver(layout).observe(stage);
  layout();

  const toModel = (e) => [(e.clientX * view.dpr - view.x) / view.scale, (e.clientY * view.dpr - view.y) / view.scale];
  window.addEventListener('pointermove', (e) => animator.setPointer(...toModel(e)));
  window.addEventListener('pointerdown', (e) => animator.setPointer(...toModel(e)));
  document.addEventListener('pointerleave', () => animator.clearPointer());

  const lipSync = new LipSync();
  animator.lipSync = lipSync;

  const panel = createPanel({ model, animator, options, lipSync });

  function frame(dt) {
    animator.update(dt);
    model.update();
    renderer.render(model, view, options);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame(dt);
    panel.sync();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  status.remove();

  // handle for debugging and automated snapshots
  window.liv2d = {
    model,
    animator,
    renderer,
    view,
    options,
    // render one frame with exact parameter values (no animation)
    pose(values = {}) {
      animator.enabled = false;
      animator.unpinAll();
      for (const [id, v] of Object.entries(values)) animator.pin(id, v);
      frame(0);
    },
  };
}

main().catch((err) => {
  console.error(err);
  status.textContent = `로드 실패: ${err.message}`;
  status.classList.add('error');
});
