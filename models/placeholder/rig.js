// Rig for the placeholder character.
//
// Hierarchy
//   bodyRot (rotation, BodyAngleZ)
//   └ bodyWarp (warp, BodyAngleX/Y, Breath) ── body, neck
//     └ headRot (rotation, AngleZ)
//       └ head (pseudo-3D, AngleX/Y)
//         ├ face, blush, nose, mouth, eyes, brows   (direct, with vertex keyforms)
//         ├ hairFrontWarp ── hair_front             (HairFront, physics)
//         ├ hairSideLWarp / hairSideRWarp           (HairSide, physics)
//         ├ hairBackWarp ── hair_back               (HairBack, physics)
//         └ ahogeWarp ── ahoge                      (HairAhoge, physics)

import {
  CANVAS, HEAD, EYES, BROW,
  eyeT, lashY, closedY, closedSmileY, mouthT, mouthLineY,
} from './geometry.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const S = [-1, 0, 1];

const parameters = [
  { id: 'ParamAngleX', name: '고개 좌우', group: '머리', min: -30, max: 30 },
  { id: 'ParamAngleY', name: '고개 상하', group: '머리', min: -30, max: 30 },
  { id: 'ParamAngleZ', name: '고개 기울기', group: '머리', min: -30, max: 30 },
  { id: 'ParamEyeLOpen', name: '왼눈 뜨기', group: '눈', min: 0, max: 1, default: 1 },
  { id: 'ParamEyeLSmile', name: '왼눈 웃음', group: '눈', min: 0, max: 1 },
  { id: 'ParamEyeROpen', name: '오른눈 뜨기', group: '눈', min: 0, max: 1, default: 1 },
  { id: 'ParamEyeRSmile', name: '오른눈 웃음', group: '눈', min: 0, max: 1 },
  { id: 'ParamEyeBallX', name: '눈동자 X', group: '눈' },
  { id: 'ParamEyeBallY', name: '눈동자 Y', group: '눈' },
  { id: 'ParamBrowLY', name: '왼눈썹 상하', group: '눈썹' },
  { id: 'ParamBrowRY', name: '오른눈썹 상하', group: '눈썹' },
  { id: 'ParamBrowLAngle', name: '왼눈썹 각도', group: '눈썹' },
  { id: 'ParamBrowRAngle', name: '오른눈썹 각도', group: '눈썹' },
  { id: 'ParamMouthForm', name: '입 모양', group: '입' },
  { id: 'ParamMouthOpenY', name: '입 벌림', group: '입', min: 0, max: 1 },
  { id: 'ParamCheek', name: '홍조', group: '얼굴', min: 0, max: 1 },
  { id: 'ParamBodyAngleX', name: '몸 좌우', group: '몸', min: -10, max: 10 },
  { id: 'ParamBodyAngleY', name: '몸 상하', group: '몸', min: -10, max: 10 },
  { id: 'ParamBodyAngleZ', name: '몸 기울기', group: '몸', min: -10, max: 10 },
  { id: 'ParamBreath', name: '호흡', group: '몸', min: 0, max: 1 },
  { id: 'ParamHairFront', name: '앞머리 흔들림', group: '머리카락' },
  { id: 'ParamHairSide', name: '옆머리 흔들림', group: '머리카락' },
  { id: 'ParamHairBack', name: '뒷머리 흔들림', group: '머리카락' },
  { id: 'ParamHairAhoge', name: '바보털 흔들림', group: '머리카락' },
];

// ---- helpers ---------------------------------------------------------------

// sway: lattice rows further from the root move more
const sway = (amount, power = 2, root = 'top') => (s) => (x, y, u, v) => {
  const k = root === 'top' ? v : 1 - v;
  return [s * amount * Math.pow(k, power), -Math.abs(s) * amount * 0.1 * Math.pow(k, power)];
};
const swayForms = (fn) => S.map((s) => (s === 0 ? null : fn(s)));

function eyeParts(side) {
  const eye = EYES[side];
  const open = `ParamEye${side}Open`;
  const smile = `ParamEye${side}Smile`;
  const top = eye.cy - 38;
  // forms ordered [open0/smile0, open1/smile0, open0/smile1, open1/smile1]
  const lidGrid = (forms) => ({ params: [open, smile], keys: [[0, 1], [0, 1]], forms });

  return [
    {
      id: `eye_white_${side}`, src: `parts/eye_white_${side}.svg`, parent: 'head', order: 350, mesh: { cell: 10 },
      keys: [lidGrid([
        (x, y) => [0, closedY(eye, eyeT(eye, x)) + 1 - y],
        null,
        (x, y) => [0, closedSmileY(eye, eyeT(eye, x)) + 1 - y],
        (x, y) => [0, -14 * clamp01((y - top) / 74)],
      ])],
    },
    {
      id: `iris_${side}`, src: `parts/iris_${side}.svg`, parent: 'head', order: 360, z: 0.02, mesh: { cell: 12 },
      clip: [`eye_white_${side}`],
      keys: [
        { param: 'ParamEyeBallX', keys: S, forms: [() => [-15, 0], null, () => [15, 0]] },
        { param: 'ParamEyeBallY', keys: S, forms: [() => [0, 9], null, () => [0, -9]] },
      ],
    },
    {
      id: `lash_lower_${side}`, src: `parts/lash_lower_${side}.svg`, parent: 'head', order: 370, mesh: { cell: 10 },
      keys: [lidGrid([{ opacity: -1 }, null, { opacity: -1 }, () => [0, -13]])],
    },
    {
      id: `lash_upper_${side}`, src: `parts/lash_upper_${side}.svg`, parent: 'head', order: 380, mesh: { cell: 8 },
      keys: [lidGrid([
        (x) => { const t = eyeT(eye, x); return [0, closedY(eye, t) - lashY(eye, t)]; },
        null,
        (x) => { const t = eyeT(eye, x); return [0, closedSmileY(eye, t) - lashY(eye, t)]; },
        () => [0, 3],
      ])],
    },
    {
      id: `brow_${side}`, src: `parts/brow_${side}.svg`, parent: 'head', order: 390, z: 0.03, mesh: { cell: 10 },
      keys: [
        { param: `ParamBrow${side}Y`, keys: S, forms: [() => [0, 12], null, () => [0, -14]] },
        {
          param: `ParamBrow${side}Angle`, keys: S,
          // +1: inner ends up (worried), -1: inner ends down (angry)
          forms: S.map((a) => (a === 0 ? null : (x) => {
            const inward = (-(x - eye.cx) * eye.outer) / BROW.hw;
            return [0, -a * 11 * inward];
          })),
        },
      ],
    },
  ];
}

// mouth corners: up for smile (+1), down for frown (-1)
const corner = (f, t) => (f > 0 ? -11 * f * t * t : -7 * f * t * t);
// forms ordered [open0/form-1, open1/form-1, open0/form0, open1/form0, open0/form+1, open1/form+1]
const mouthGrid = (fn) => ({
  params: ['ParamMouthOpenY', 'ParamMouthForm'],
  keys: [[0, 1], S],
  forms: S.flatMap((f) => [fn(0, f), fn(1, f)]),
});

export default {
  name: 'placeholder',
  canvas: CANVAS,
  frame: [112, 120, 800, 1220],
  lookAt: { anchor: [512, 560], range: [520, 620] },
  meshCell: 24,
  parameters,

  deformers: [
    {
      id: 'bodyRot', type: 'rotation', origin: [512, 1400],
      keys: [{ param: 'ParamBodyAngleZ', keys: [-10, 0, 10], forms: [{ angle: -4 }, null, { angle: 4 }] }],
    },
    {
      id: 'bodyWarp', type: 'warp', parent: 'bodyRot', rect: [80, 140, 864, 1260], grid: [4, 5],
      keys: [
        {
          param: 'ParamBodyAngleX', keys: [-10, 0, 10],
          forms: [-1, 0, 1].map((s) => (s === 0 ? null : (x, y, u, v) => {
            const k = Math.pow(1 - v, 1.4);
            // lean + slight perspective squash on the far side
            return [s * 30 * k + s * 10 * (u - 0.5) * k, 0];
          })),
        },
        {
          param: 'ParamBodyAngleY', keys: [-10, 0, 10],
          forms: [-1, 0, 1].map((s) => (s === 0 ? null : (x, y, u, v) => [0, -s * 14 * (1 - v)])),
        },
        {
          param: 'ParamBreath', keys: [0, 1],
          forms: [null, (x, y, u, v) => [(u - 0.5) * 8 * (1 - v), -7 * Math.pow(1 - v, 0.7)]],
        },
      ],
    },
    {
      id: 'headRot', type: 'rotation', parent: 'bodyWarp', origin: [512, 790],
      keys: [{ param: 'ParamAngleZ', keys: [-30, 0, 30], forms: [{ angle: -11 }, null, { angle: 11 }] }],
    },
    {
      id: 'head', type: 'head3d', parent: 'headRot', center: HEAD.center, radius: HEAD.radius, depth: 0.65,
      keys: [
        { param: 'ParamAngleX', keys: [-30, 0, 30], forms: [{ yaw: -24 }, null, { yaw: 24 }] },
        { param: 'ParamAngleY', keys: [-30, 0, 30], forms: [{ pitch: -14 }, null, { pitch: 14 }] },
      ],
    },
    {
      id: 'hairFrontWarp', type: 'warp', parent: 'head', z: 0.06, rect: [290, 230, 444, 370], grid: [6, 5],
      keys: [{ param: 'ParamHairFront', keys: S, forms: swayForms(sway(22, 2)) }],
    },
    {
      id: 'hairSideRWarp', type: 'warp', parent: 'head', z: 0.25, surface: false, rect: [262, 420, 100, 610], grid: [2, 5],
      keys: [{ param: 'ParamHairSide', keys: S, forms: swayForms(sway(38, 1.6)) }],
    },
    {
      id: 'hairSideLWarp', type: 'warp', parent: 'head', z: 0.25, surface: false, rect: [662, 420, 100, 610], grid: [2, 5],
      keys: [{ param: 'ParamHairSide', keys: S, forms: swayForms(sway(38, 1.6)) }],
    },
    {
      id: 'hairBackWarp', type: 'warp', parent: 'head', z: -0.4, surface: false, rect: [210, 226, 604, 940], grid: [4, 6],
      keys: [{ param: 'ParamHairBack', keys: S, forms: swayForms(sway(28, 2)) }],
    },
    {
      id: 'ahogeWarp', type: 'warp', parent: 'head', z: 0.3, surface: false, rect: [470, 130, 110, 140], grid: [2, 3],
      keys: [{ param: 'ParamHairAhoge', keys: S, forms: swayForms(sway(34, 1.5, 'bottom')) }],
    },
  ],

  parts: [
    { id: 'hair_back', src: 'parts/hair_back.svg', parent: 'hairBackWarp', order: 100 },
    { id: 'body', src: 'parts/body.svg', parent: 'bodyWarp', order: 200 },
    { id: 'neck', src: 'parts/neck.svg', parent: 'bodyWarp', order: 210 },
    { id: 'face', src: 'parts/face.svg', parent: 'head', order: 300, mesh: { cell: 20 } },
    {
      id: 'blush', src: 'parts/blush.svg', parent: 'head', order: 310, opacity: 0, z: 0.02,
      keys: [{ param: 'ParamCheek', keys: [0, 1], forms: [null, { opacity: 1 }] }],
    },
    { id: 'nose', src: 'parts/nose.svg', parent: 'head', order: 320, z: 0.12, mesh: { cell: 10 } },
    {
      id: 'mouth_inner', src: 'parts/mouth_inner.svg', parent: 'head', order: 330, z: 0.02, mesh: { cell: 8 },
      keys: [mouthGrid((open, f) => (x, y) => {
        const t = mouthT(x);
        const collapse = open ? 0 : mouthLineY(t) - y;
        return [f > 0 ? t * 6 * f : 0, collapse + corner(f, t)];
      })],
    },
    {
      id: 'mouth_line', src: 'parts/mouth_line.svg', parent: 'head', order: 340, z: 0.02, mesh: { cell: 8 },
      keys: [mouthGrid((open, f) => (open === 0 && f === 0 ? null : (x) => {
        const t = mouthT(x);
        return [f > 0 ? t * 6 * f : 0, (open ? -5 : 0) + corner(f, t)];
      }))],
    },
    ...eyeParts('R'),
    ...eyeParts('L'),
    { id: 'hair_side_R', src: 'parts/hair_side_R.svg', parent: 'hairSideRWarp', order: 440 },
    { id: 'hair_side_L', src: 'parts/hair_side_L.svg', parent: 'hairSideLWarp', order: 440 },
    { id: 'hair_front', src: 'parts/hair_front.svg', parent: 'hairFrontWarp', order: 450, mesh: { cell: 16 } },
    { id: 'ahoge', src: 'parts/ahoge.svg', parent: 'ahogeWarp', order: 460, mesh: { cell: 12 } },
  ],

  expressions: {
    neutral: { label: '기본', params: {} },
    smile: { label: '미소', params: { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamCheek: 0.5 } },
    happy: {
      label: '행복',
      params: { ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.7, ParamCheek: 1 },
    },
    surprised: { label: '놀람', params: { ParamBrowLY: 1, ParamBrowRY: 1, ParamMouthOpenY: 0.8, ParamMouthForm: -0.2 } },
    angry: {
      label: '화남',
      params: { ParamBrowLAngle: -1, ParamBrowRAngle: -1, ParamBrowLY: -0.5, ParamBrowRY: -0.5, ParamMouthForm: -1, ParamEyeLOpen: 0.75, ParamEyeROpen: 0.75 },
    },
    sad: {
      label: '슬픔',
      params: { ParamBrowLAngle: 1, ParamBrowRAngle: 1, ParamMouthForm: -0.7, ParamEyeLOpen: 0.65, ParamEyeROpen: 0.65 },
    },
  },

  // Physics outputs are inverted so a positive head movement makes hair lag
  // behind (tips swing the opposite way), matching the sway forms above.
  physics: [
    {
      id: 'hairFront',
      input: [
        { param: 'ParamAngleX', type: 'x', weight: 0.6 },
        { param: 'ParamAngleZ', type: 'angle', weight: 0.6 },
        { param: 'ParamBodyAngleX', type: 'x', weight: 0.4 },
      ],
      particles: [{ radius: 0 }, { radius: 15, mobility: 0.95, delay: 0.9, acceleration: 1.5 }],
      output: [{ param: 'ParamHairFront', particle: 1, scale: 1.6, invert: true }],
    },
    {
      id: 'hairSide',
      input: [
        { param: 'ParamAngleX', type: 'x', weight: 0.6 },
        { param: 'ParamAngleZ', type: 'angle', weight: 0.6 },
        { param: 'ParamBodyAngleX', type: 'x', weight: 0.4 },
      ],
      particles: [{ radius: 0 }, { radius: 18, mobility: 0.95, delay: 0.85, acceleration: 1.4 }],
      output: [{ param: 'ParamHairSide', particle: 1, scale: 1.8, invert: true }],
    },
    {
      id: 'hairBack',
      input: [
        { param: 'ParamAngleX', type: 'x', weight: 0.6 },
        { param: 'ParamAngleZ', type: 'angle', weight: 0.6 },
        { param: 'ParamBodyAngleX', type: 'x', weight: 0.4 },
      ],
      particles: [{ radius: 0 }, { radius: 22, mobility: 0.92, delay: 0.8, acceleration: 1.2 }],
      output: [{ param: 'ParamHairBack', particle: 1, scale: 1.5, invert: true }],
    },
    {
      id: 'ahoge',
      input: [
        { param: 'ParamAngleX', type: 'x', weight: 0.7 },
        { param: 'ParamAngleY', type: 'x', weight: 0.3 },
        { param: 'ParamAngleZ', type: 'angle', weight: 0.8 },
      ],
      particles: [
        { radius: 0 },
        { radius: 8, mobility: 0.98, delay: 0.95, acceleration: 2 },
        { radius: 8, mobility: 0.98, delay: 0.95, acceleration: 2 },
      ],
      output: [{ param: 'ParamHairAhoge', particle: 2, scale: 1.2, invert: true }],
    },
  ],
};
