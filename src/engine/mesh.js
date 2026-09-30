// Mesh generation from a layer's alpha channel. DOM-free so it can be tested.

export function alphaBBox(alpha, width, height, threshold = 2) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function padBBox(b, pad, width, height) {
  const x = Math.max(0, b.x - pad);
  const y = Math.max(0, b.y - pad);
  return {
    x,
    y,
    w: Math.min(width, b.x + b.w + pad) - x,
    h: Math.min(height, b.y + b.h + pad) - y,
  };
}

// Regular grid over bbox; cells without any visible pixel are dropped so
// transparent areas do not get deformed or drawn.
//   alpha: Uint8 alpha of the full layer (width x height)
//   bbox:  region the texture was cropped to (positions are in layer space
//          offset by `origin`, uvs are relative to bbox)
export function gridMesh(alpha, width, height, bbox, cell = 24, origin = [0, 0]) {
  const cols = Math.max(1, Math.ceil(bbox.w / cell));
  const rows = Math.max(1, Math.ceil(bbox.h / cell));
  const cw = bbox.w / cols;
  const ch = bbox.h / rows;
  const keep = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const ya = Math.max(0, Math.floor(bbox.y + j * ch) - 1);
    const yb = Math.min(height, Math.ceil(bbox.y + (j + 1) * ch) + 1);
    for (let i = 0; i < cols; i++) {
      const xa = Math.max(0, Math.floor(bbox.x + i * cw) - 1);
      const xb = Math.min(width, Math.ceil(bbox.x + (i + 1) * cw) + 1);
      let hit = 0;
      for (let y = ya; y < yb && !hit; y++) {
        const row = y * width;
        for (let x = xa; x < xb; x++) {
          if (alpha[row + x] > 0) {
            hit = 1;
            break;
          }
        }
      }
      keep[j * cols + i] = hit;
    }
  }

  const nodeIndex = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
  const positions = [];
  const uvs = [];
  const indices = [];
  const node = (i, j) => {
    const k = j * (cols + 1) + i;
    if (nodeIndex[k] < 0) {
      nodeIndex[k] = positions.length / 2;
      positions.push(origin[0] + bbox.x + i * cw, origin[1] + bbox.y + j * ch);
      uvs.push(i / cols, j / rows);
    }
    return nodeIndex[k];
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!keep[j * cols + i]) continue;
      const a = node(i, j);
      const b = node(i + 1, j);
      const c = node(i, j + 1);
      const d = node(i + 1, j + 1);
      indices.push(a, b, d, a, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: positions.length / 2 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
  };
}

// Unique triangle edges, for wireframe display.
export function edgeIndices(indices) {
  const seen = new Set();
  const out = [];
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e];
      const b = indices[t + ((e + 1) % 3)];
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a, b);
    }
  }
  return indices instanceof Uint32Array ? new Uint32Array(out) : new Uint16Array(out);
}
