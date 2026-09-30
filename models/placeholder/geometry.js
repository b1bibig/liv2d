// Shared landmarks for the placeholder character. The SVG generator draws the
// layers from these curves and rig.js uses the same curves to know where the
// eyelids/mouth must move, so art and rig never drift apart.

export const CANVAS = { width: 1024, height: 1400 };

export const HEAD = { center: [512, 545], radius: [215, 260] };

export const EYE_HW = 56;

// Named from the character's point of view (Cubism convention):
// L = character's left = right side of the screen.
export const EYES = {
  L: { cx: 592, cy: 590, outer: 1 },
  R: { cx: 432, cy: 590, outer: -1 },
};

export const eyeT = (eye, x) => Math.max(-1, Math.min(1, (x - eye.cx) / EYE_HW));

// centerline of the upper lash; outer corner sits a bit higher
export const lashY = (eye, t) => eye.cy - 40 + 40 * t * t - 6 * t * eye.outer;
export const lashWidth = (eye, t) => 6 + 6 * Math.max(0, 1 - Math.abs(t - 0.35 * eye.outer));
export const whiteTop = (eye, t) => lashY(eye, t) + 2;
export const whiteBottom = (eye, t) => eye.cy + 34 * Math.sqrt(Math.max(0, 1 - t * t)) - 6 * t * eye.outer + 2;

// closed eye: gentle downward bow; smiling closed eye: ^ shape
export const closedY = (eye, t) => eye.cy + 20 + 8 * (1 - t * t) - 3 * t * eye.outer;
export const closedSmileY = (eye, t) => eye.cy + 26 - 18 * (1 - t * t) - 3 * t * eye.outer;

export const IRIS = { dy: 4, rx: 30, ry: 38 };

export const BROW = { dy: -84, hw: 50 };
export const browY = (eye, t) => eye.cy + BROW.dy - 8 * (1 - t * t) + 4 * t * eye.outer;

export const MOUTH = { cx: 512, y: 712, hw: 28, innerHw: 30, depth: 46 };
export const mouthT = (x) => Math.max(-1, Math.min(1, (x - MOUTH.cx) / MOUTH.hw));
export const mouthLineY = (t) => MOUTH.y + 2 * (1 - t * t);
