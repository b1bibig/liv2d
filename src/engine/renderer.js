// WebGL2 renderer: textured meshes with premultiplied alpha, clipping masks
// (iris inside the eye white, etc.) and a debug wireframe overlay.

import { WarpDeformer } from './deformers.js';

const MESH_VS = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform vec4 u_xf;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos * u_xf.xy + u_xf.zw, 0.0, 1.0);
}`;

const MESH_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform float u_opacity;
uniform bool u_useMask;
uniform vec2 u_viewport;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_uv) * u_opacity;
  if (u_useMask) c *= texture(u_mask, gl_FragCoord.xy / u_viewport).a;
  o = c;
}`;

const LINE_VS = `#version 300 es
in vec2 a_pos;
uniform vec4 u_xf;
void main() { gl_Position = vec4(a_pos * u_xf.xy + u_xf.zw, 0.0, 1.0); }`;

const LINE_FS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 o;
void main() { o = u_color; }`;

function compile(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.bindAttribLocation(prog, 0, 'a_pos');
  gl.bindAttribLocation(prog, 1, 'a_uv');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const uniforms = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(prog, i).name;
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, uniforms };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.meshProg = compile(gl, MESH_VS, MESH_FS);
    this.lineProg = compile(gl, LINE_VS, LINE_FS);
    this.gpu = new Map();
    this.mask = null;
    this.lineBuf = gl.createBuffer();
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  setModel(model) {
    const gl = this.gl;
    for (const g of this.gpu.values()) this.freePart(g);
    this.gpu.clear();
    for (const p of model.parts) {
      if (p.indices.length === 0) continue;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const pos = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.bufferData(gl.ARRAY_BUFFER, p.world.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const uv = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uv);
      gl.bufferData(gl.ARRAY_BUFFER, p.uvs, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      const idx = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);

      const edgeVao = gl.createVertexArray();
      gl.bindVertexArray(edgeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const edges = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edges);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.edges, gl.STATIC_DRAW);
      gl.bindVertexArray(null);

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.image);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const type = p.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      this.gpu.set(p.id, { vao, pos, uv, idx, edgeVao, edges, tex, type, count: p.indices.length, edgeCount: p.edges.length });
    }
  }

  freePart(g) {
    const gl = this.gl;
    gl.deleteVertexArray(g.vao);
    gl.deleteVertexArray(g.edgeVao);
    [g.pos, g.uv, g.idx, g.edges].forEach((b) => gl.deleteBuffer(b));
    gl.deleteTexture(g.tex);
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  ensureMask(w, h) {
    const gl = this.gl;
    if (this.mask && this.mask.w === w && this.mask.h === h) return this.mask;
    if (this.mask) {
      gl.deleteFramebuffer(this.mask.fbo);
      gl.deleteTexture(this.mask.tex);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.mask = { tex, fbo, w, h };
    return this.mask;
  }

  // view: { scale, x, y } maps model space to device pixels: p * scale + (x, y)
  render(model, view, opts = {}) {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const xf = [(2 * view.scale) / W, (-2 * view.scale) / H, (2 * view.x) / W - 1, 1 - (2 * view.y) / H];

    for (const p of model.parts) {
      const g = this.gpu.get(p.id);
      if (!g) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, g.pos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, p.world);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const { prog, uniforms: u } = this.meshProg;
    gl.useProgram(prog);
    gl.uniform4fv(u.u_xf, xf);
    gl.uniform2f(u.u_viewport, W, H);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform1i(u.u_mask, 1);

    const drawPart = (p, opacity) => {
      const g = this.gpu.get(p.id);
      if (!g) return;
      gl.uniform1f(u.u_opacity, opacity);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, g.tex);
      gl.bindVertexArray(g.vao);
      gl.drawElements(gl.TRIANGLES, g.count, g.type, 0);
    };

    let maskKey = null;
    const mask = this.ensureMask(W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const p of model.drawOrder) {
      if (p.opacity <= 0.002 || !this.gpu.has(p.id)) continue;
      const clipped = p.clip.length > 0;
      if (clipped) {
        const key = p.clip.join('|');
        if (key !== maskKey) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, mask.fbo);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1i(u.u_useMask, 0);
          for (const id of p.clip) drawPart(model.partById.get(id), 1);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          maskKey = key;
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mask.tex);
      }
      gl.uniform1i(u.u_useMask, clipped ? 1 : 0);
      drawPart(p, p.opacity);
      if (clipped) {
        // mask texture must not stay bound while it is a render target
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    }

    if (opts.wireframe) this.drawWireframe(model, xf);
    gl.bindVertexArray(null);
  }

  drawWireframe(model, xf) {
    const gl = this.gl;
    const { prog, uniforms: u } = this.lineProg;
    gl.useProgram(prog);
    gl.uniform4fv(u.u_xf, xf);
    gl.uniform4f(u.u_color, 0.1, 0.55, 1.0, 0.55);
    for (const p of model.drawOrder) {
      const g = this.gpu.get(p.id);
      if (!g || p.opacity <= 0.002) continue;
      gl.bindVertexArray(g.edgeVao);
      gl.drawElements(gl.LINES, g.edgeCount, g.type, 0);
    }
    const lines = [];
    for (const d of model.deformers) {
      if (!(d instanceof WarpDeformer)) continue;
      const s = d.cols + 1;
      const W = d.world;
      for (let j = 0; j <= d.rows; j++) {
        for (let i = 0; i <= d.cols; i++) {
          const k = (j * s + i) * 2;
          if (i < d.cols) lines.push(W[k], W[k + 1], W[k + 2], W[k + 3]);
          if (j < d.rows) lines.push(W[k], W[k + 1], W[k + s * 2], W[k + s * 2 + 1]);
        }
      }
    }
    if (lines.length) {
      gl.uniform4f(u.u_color, 1.0, 0.35, 0.2, 0.8);
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, lines.length / 2);
    }
  }
}
