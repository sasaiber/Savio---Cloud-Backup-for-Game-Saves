/**
 * Material 3 Expressive shape library (cookie, sunny, clover, squircle...).
 *
 * Every shape is described as "radius by angle", sampled at the same angles.
 * Because all shapes share the same sample points, any shape can smoothly
 * morph into any other just by blending the radii.
 */

export type ShapeName =
  | "circle"
  | "cookie9"
  | "cookie12"
  | "sunny"
  | "flower"
  | "clover4"
  | "squircle"
  | "pentagon";

const SAMPLES = 96;
const TAU = Math.PI * 2;

function softPolygon(sides: number, softness: number) {
  return (a: number) => {
    const seg = TAU / sides;
    const local = ((a % seg) + seg) % seg - seg / 2;
    const polygon = Math.cos(Math.PI / sides) / Math.cos(local);
    return polygon * (1 - softness) + softness;
  };
}

const RADIUS: Record<ShapeName, (angle: number) => number> = {
  circle: () => 1,
  cookie9: (a) => 1 + 0.075 * Math.cos(9 * a),
  cookie12: (a) => 1 + 0.055 * Math.cos(12 * a),
  sunny: (a) => 1 + 0.1 * Math.cos(8 * a),
  flower: (a) => 1 + 0.17 * Math.cos(6 * a),
  clover4: (a) => 1 + 0.24 * Math.cos(4 * a),
  squircle: (a) => Math.pow(Math.pow(Math.abs(Math.cos(a)), 4) + Math.pow(Math.abs(Math.sin(a)), 4), -1 / 4),
  pentagon: softPolygon(5, 0.45),
};

const cache = new Map<ShapeName, number[]>();

/** Radii of a shape (normalized so the outermost point is exactly 1). */
export function shapeRadii(name: ShapeName): number[] {
  const hit = cache.get(name);
  if (hit) return hit;
  const fn = RADIUS[name];
  const raw: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    // Start at the top (-90°) so lobes point upward.
    raw.push(fn((i / SAMPLES) * TAU - Math.PI / 2 + Math.PI / 2));
  }
  const max = Math.max(...raw);
  const result = raw.map((r) => r / max);
  cache.set(name, result);
  return result;
}

export function blendRadii(from: number[], to: number[], t: number): number[] {
  return from.map((r, i) => Math.max(0.05, r + (to[i] - r) * t));
}

/** Smooth closed SVG path through the sampled points (Catmull-Rom curves). */
export function pathFromRadii(radii: number[], size: number): string {
  const c = size / 2;
  const n = radii.length;
  const pts = radii.map((r, i) => {
    const a = (i / n) * TAU - Math.PI / 2;
    return [c + Math.cos(a) * r * c, c + Math.sin(a) * r * c] as const;
  });
  const p = (i: number) => pts[(i + n) % n];
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d}Z`;
}
