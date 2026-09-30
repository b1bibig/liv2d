// Loads a model folder: rig.js + layer images (SVG or PNG).
// Each layer is rasterized onto the model canvas, cropped to its visible
// pixels, and meshed from its alpha channel.

import { Model } from './model.js';
import { alphaBBox, padBBox, gridMesh, edgeIndices } from './mesh.js';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export async function loadModel(baseUrl) {
  const base = new URL(baseUrl, location.href);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const { default: rig } = await import(new URL('rig.js', base).href);
  const { width, height } = rig.canvas;

  const meshes = new Map();
  const images = new Map();
  await Promise.all(
    rig.parts.map(async (def) => {
      const img = await loadImage(new URL(def.src, base).href);
      const layer = makeCanvas(width, height);
      const ctx = layer.getContext('2d', { willReadFrequently: true });
      const [ox, oy] = def.at ?? [0, 0];
      // SVGs are authored at canvas size; PNG layers may be cropped and placed with `at`
      ctx.drawImage(img, ox, oy);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const alpha = new Uint8Array(width * height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
      const bbox = alphaBBox(alpha, width, height);
      if (!bbox) {
        console.warn(`part "${def.id}" is fully transparent`);
        meshes.set(def.id, { positions: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint16Array(0) });
        images.set(def.id, makeCanvas(1, 1));
        return;
      }
      const box = padBBox(bbox, 2, width, height);
      meshes.set(def.id, gridMesh(alpha, width, height, box, def.mesh?.cell ?? rig.meshCell ?? 24));
      const crop = makeCanvas(box.w, box.h);
      crop.getContext('2d').drawImage(layer, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      images.set(def.id, crop);
    }),
  );

  const model = new Model(rig, meshes);
  for (const p of model.parts) {
    p.image = images.get(p.id);
    p.edges = edgeIndices(p.indices);
  }
  return model;
}
