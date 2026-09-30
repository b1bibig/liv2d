// Generates the placeholder character's layer SVGs into models/placeholder/parts.
// Stand-in art so the rig/runtime can be developed before the real artwork.
//   node tools/gen-placeholder.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANVAS, EYES, EYE_HW, IRIS, MOUTH,
  lashY, lashWidth, whiteTop, whiteBottom, browY, mouthLineY,
} from '../models/placeholder/geometry.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'models/placeholder/parts');
mkdirSync(outDir, { recursive: true });

const C = {
  skin: '#ffe7da',
  skinShade: '#f6c9b8',
  skinLine: '#d69c88',
  hair: '#5c4b91',
  hairShade: '#3f3270',
  hairLight: '#8e7fd0',
  lash: '#2b2035',
  brow: '#4a3b73',
  mouth: '#8c3d45',
  mouthInner: '#7a2635',
  tongue: '#e4717d',
  cloth: '#f6f7fc',
  clothLine: '#c3c7df',
  navy: '#2d3a6b',
  ribbon: '#d8374b',
};

const f = (n) => Math.round(n * 10) / 10;
const pts = (list) => list.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ');
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

function write(name, body, defs = '') {
  const { width, height } = CANVAS;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${defs}</defs>
${body}
</svg>
`;
  writeFileSync(join(outDir, `${name}.svg`), svg);
}

// ---- hair back ----------------------------------------------------------
write(
  'hair_back',
  `<path fill="url(#g)" d="M512 236 C760 236 818 420 796 620 C780 780 812 960 780 1130 C740 1110 700 1120 662 1150 C668 1000 640 900 600 850 L424 850 C384 900 356 1000 362 1150 C324 1120 284 1110 244 1130 C212 960 244 780 228 620 C206 420 264 236 512 236 Z"/>
<path fill="none" stroke="${C.hairShade}" stroke-width="4" opacity="0.5" d="M300 700 C290 850 300 1000 290 1100 M724 700 C734 850 724 1000 734 1100"/>`,
  `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hair}"/><stop offset="1" stop-color="${C.hairShade}"/></linearGradient>`,
);

// ---- body ----------------------------------------------------------------
write(
  'body',
  `<path fill="${C.cloth}" stroke="${C.clothLine}" stroke-width="3" d="M452 850 C420 880 330 900 250 930 C170 960 140 1040 130 1140 L110 1400 L914 1400 L894 1140 C884 1040 854 960 774 930 C694 900 604 880 572 850 Z"/>
<path fill="${C.navy}" d="M446 852 L512 1000 L578 852 L660 896 C630 960 566 1040 512 1096 C458 1040 394 960 364 896 Z"/>
<path fill="none" stroke="#fff" stroke-width="5" d="M380 902 C408 958 460 1024 512 1076 C564 1024 616 958 644 902"/>
<path fill="${C.ribbon}" d="M512 1010 L448 980 L436 1052 Z M512 1010 L576 980 L588 1052 Z M512 1010 L476 1100 L500 1104 Z M512 1010 L548 1100 L524 1104 Z"/>
<circle cx="512" cy="1012" r="14" fill="${C.ribbon}" stroke="#a82236" stroke-width="3"/>
<path fill="none" stroke="${C.clothLine}" stroke-width="4" d="M250 1080 C262 1180 258 1300 250 1400 M774 1080 C762 1180 766 1300 774 1400"/>`,
);

// ---- neck ----------------------------------------------------------------
write(
  'neck',
  `<path fill="${C.skin}" stroke="${C.skinLine}" stroke-width="3" d="M474 690 L474 880 C490 896 534 896 550 880 L550 690 Z"/>
<path fill="${C.skinShade}" d="M474 730 C496 790 528 790 550 730 L550 806 C530 822 494 822 474 806 Z"/>`,
);

// ---- face ----------------------------------------------------------------
write(
  'face',
  `<path fill="${C.skin}" stroke="${C.skinLine}" stroke-width="3" d="M512 300 C628 300 712 380 712 520 C712 610 688 668 640 718 C600 758 556 790 512 796 C468 790 424 758 384 718 C336 668 312 610 312 520 C312 380 396 300 512 300 Z"/>
<path fill="${C.skinShade}" opacity="0.55" d="M330 470 C360 420 420 400 512 398 C604 400 664 420 694 470 C690 430 640 380 512 376 C384 380 334 430 330 470 Z"/>`,
);

write(
  'blush',
  `<g filter="url(#b)" fill="#ff8fa3" opacity="0.6"><ellipse cx="410" cy="662" rx="42" ry="16"/><ellipse cx="614" cy="662" rx="42" ry="16"/></g>
<g stroke="#f06f8a" stroke-width="3" stroke-linecap="round" opacity="0.7"><path d="M392 668 L402 654 M410 668 L420 654 M428 668 L438 654 M596 668 L606 654 M614 668 L624 654 M632 668 L642 654"/></g>`,
  `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>`,
);

write('nose', `<path fill="none" stroke="${C.skinLine}" stroke-width="3.5" stroke-linecap="round" d="M514 646 C518 656 516 664 506 668"/>`);

// ---- eyes ----------------------------------------------------------------
for (const [side, eye] of Object.entries(EYES)) {
  const ts = range(-1, 1, 40);
  const top = ts.map((t) => [eye.cx + t * EYE_HW, whiteTop(eye, t)]);
  const bottom = [...ts].reverse().map((t) => [eye.cx + t * EYE_HW, whiteBottom(eye, t)]);
  write(`eye_white_${side}`, `<path fill="#ffffff" d="M${pts([...top, ...bottom])} Z"/>
<path fill="#d8dcf0" d="M${pts(top.map(([x, y]) => [x, y]))} L${pts([...top].reverse().map(([x, y]) => [x, y + 12]))} Z"/>`);

  const ix = eye.cx;
  const iy = eye.cy + IRIS.dy;
  write(
    `iris_${side}`,
    `<ellipse cx="${ix}" cy="${iy}" rx="${IRIS.rx}" ry="${IRIS.ry}" fill="url(#ir)" stroke="#1d3a66" stroke-width="3"/>
<ellipse cx="${ix}" cy="${iy + 4}" rx="13" ry="19" fill="#14213d"/>
<ellipse cx="${ix}" cy="${iy + 18}" rx="18" ry="9" fill="#9fe3ff" opacity="0.55"/>
<ellipse cx="${ix - 11}" cy="${iy - 16}" rx="9" ry="11" fill="#ffffff"/>
<circle cx="${ix + 12}" cy="${iy + 16}" r="4" fill="#ffffff"/>`,
    `<linearGradient id="ir" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a4f9a"/><stop offset="0.6" stop-color="#3f8fd8"/><stop offset="1" stop-color="#8fe0ff"/></linearGradient>`,
  );

  const lt = range(-1.04, 1.04, 40);
  const upper = lt.map((t) => [eye.cx + t * EYE_HW, lashY(eye, t) - lashWidth(eye, t) / 2]);
  const lower = [...lt].reverse().map((t) => [eye.cx + t * EYE_HW, lashY(eye, t) + lashWidth(eye, t) / 2]);
  // outer-corner flick
  const ox = eye.cx + eye.outer * EYE_HW * 1.04;
  const oy = lashY(eye, eye.outer * 1.04);
  const flick = `M${f(ox)} ${f(oy - 4)} L${f(ox + eye.outer * 16)} ${f(oy - 12)} L${f(ox - eye.outer * 2)} ${f(oy + 6)} Z`;
  write(`lash_upper_${side}`, `<path fill="${C.lash}" d="M${pts([...upper, ...lower])} Z"/><path fill="${C.lash}" d="${flick}"/>`);

  const lo = range(-0.55, 0.55, 16).map((t) => [eye.cx + t * EYE_HW, whiteBottom(eye, t) + 1]);
  write(`lash_lower_${side}`, `<path fill="none" stroke="#6b4a62" stroke-width="3" stroke-linecap="round" d="M${pts(lo)}"/>`);

  const bt = range(-0.9, 0.9, 24);
  const bw = (t) => 3 + 3 * (1 - Math.abs(t + 0.3 * eye.outer));
  const btop = bt.map((t) => [eye.cx + t * 50, browY(eye, t) - bw(t)]);
  const bbot = [...bt].reverse().map((t) => [eye.cx + t * 50, browY(eye, t) + bw(t)]);
  write(`brow_${side}`, `<path fill="${C.brow}" d="M${pts([...btop, ...bbot])} Z"/>`);
}

// ---- mouth ---------------------------------------------------------------
{
  const ts = range(-1, 1, 30);
  const line = ts.map((t) => [MOUTH.cx + t * MOUTH.hw, mouthLineY(t)]);
  write('mouth_line', `<path fill="none" stroke="${C.mouth}" stroke-width="4" stroke-linecap="round" d="M${pts(line)}"/>`);

  const top = ts.map((t) => [MOUTH.cx + t * MOUTH.innerHw, MOUTH.y - 4]);
  const bot = [...ts].reverse().map((t) => [MOUTH.cx + t * MOUTH.innerHw, MOUTH.y - 4 + MOUTH.depth * Math.pow(1 - t * t, 0.7)]);
  write(
    'mouth_inner',
    `<clipPath id="m"><path d="M${pts([...top, ...bot])} Z"/></clipPath>
<path fill="${C.mouthInner}" stroke="${C.mouth}" stroke-width="3" d="M${pts([...top, ...bot])} Z"/>
<g clip-path="url(#m)"><ellipse cx="${MOUTH.cx}" cy="${MOUTH.y + 40}" rx="22" ry="14" fill="${C.tongue}"/><rect x="${MOUTH.cx - 22}" y="${MOUTH.y - 4}" width="44" height="7" fill="#fff"/></g>`,
  );
}

// ---- front hair ------------------------------------------------------------
{
  const outline = 'M306 580 C290 360 400 246 512 244 C624 246 734 360 718 580';
  // bottom edge right -> left: alternating strand tips and notches
  const edge = [
    [700, 590], [676, 440], [652, 506], [622, 424], [598, 498], [568, 432],
    [542, 504], [514, 420], [486, 500], [458, 434], [430, 496], [402, 424],
    [376, 508], [350, 440], [326, 590],
  ];
  let d = outline;
  let [px, py] = [718, 580];
  for (const [x, y] of edge) {
    const cx = (px + x) / 2 + (y > py ? 6 : -6);
    const cy = (py + y) / 2;
    d += ` Q${cx} ${cy} ${x} ${y}`;
    [px, py] = [x, y];
  }
  d += ' Q316 590 306 580 Z';
  write(
    'hair_front',
    `<path fill="url(#g)" stroke="${C.hairShade}" stroke-width="3" d="${d}"/>
<path fill="none" stroke="${C.hairLight}" stroke-width="12" stroke-linecap="round" opacity="0.7" d="M392 326 Q512 286 632 326"/>
<path fill="none" stroke="${C.hairShade}" stroke-width="3" opacity="0.6" d="M514 300 Q510 360 514 420 M440 310 Q424 370 430 450 M588 310 Q604 370 598 450"/>`,
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hairLight}"/><stop offset="0.35" stop-color="${C.hair}"/><stop offset="1" stop-color="${C.hairShade}"/></linearGradient>`,
  );
}

const sideLock = 'M318 440 C290 560 292 700 300 820 C305 900 290 960 272 1010 C318 970 340 900 344 820 C350 700 350 560 352 450 Z';
const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${1024 - Number(x)} ${y}`);
const sideDefs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hair}"/><stop offset="1" stop-color="${C.hairShade}"/></linearGradient>`;
write('hair_side_R', `<path fill="url(#g)" stroke="${C.hairShade}" stroke-width="3" d="${sideLock}"/>`, sideDefs);
write('hair_side_L', `<path fill="url(#g)" stroke="${C.hairShade}" stroke-width="3" d="${mirror(sideLock)}"/>`, sideDefs);

write(
  'ahoge',
  `<path fill="${C.hair}" stroke="${C.hairShade}" stroke-width="3" d="M500 262 C478 204 498 152 562 140 C522 172 512 212 526 262 Z"/>`,
);

console.log(`wrote layers to ${outDir}`);
