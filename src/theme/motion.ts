/**
 * Material 3 Expressive motion: every movement is a physical spring.
 *
 * Tokens come from the M3 Expressive motion spec:
 *   spatial = position/size/shape (may overshoot a little, feels alive)
 *   effects = color/opacity (no overshoot, never "wobbles")
 */

function spring(stiffness: number, dampingRatio: number) {
  return {
    type: "spring" as const,
    stiffness,
    // damping = 2 * ratio * sqrt(stiffness * mass), mass = 1
    damping: 2 * dampingRatio * Math.sqrt(stiffness),
    mass: 1,
  };
}

export const springs = {
  fastSpatial: spring(800, 0.6),
  spatial: spring(380, 0.8),
  slowSpatial: spring(200, 0.8),
  fastEffects: spring(3800, 1),
  effects: spring(1600, 1),
  slowEffects: spring(800, 1),
};

/**
 * CSS can't run springs natively, but it can follow any curve with `linear()`.
 * We simulate the same springs here and hand them to CSS as easing curves,
 * so hover/press effects written in CSS move with identical physics.
 */
function springCurve(stiffness: number, dampingRatio: number): { easing: string; duration: number } {
  const w0 = Math.sqrt(stiffness);
  const z = dampingRatio;
  const position = (t: number): number => {
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };

  // Find when the spring has visually settled (within 0.1% of the target).
  const step = 1 / 240;
  let settle = 0;
  for (let t = 0; t <= 3; t += step) {
    if (Math.abs(1 - position(t)) > 0.001) settle = t;
  }
  const duration = Math.max(settle, step * 12);

  const samples = 48;
  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const value = i === samples ? 1 : position((duration * i) / samples);
    points.push(value.toFixed(4));
  }
  return { easing: `linear(${points.join(", ")})`, duration: Math.round(duration * 1000) };
}

/** Publishes the springs as CSS variables: --spring-<name> and --spring-<name>-duration. */
export function installCssSprings(): void {
  const root = document.documentElement;
  const table: Array<[string, number, number]> = [
    ["fast-spatial", 800, 0.6],
    ["spatial", 380, 0.8],
    ["slow-spatial", 200, 0.8],
    ["fast-effects", 3800, 1],
    ["effects", 1600, 1],
    ["slow-effects", 800, 1],
  ];
  for (const [name, stiffness, ratio] of table) {
    const curve = springCurve(stiffness, ratio);
    root.style.setProperty(`--spring-${name}`, curve.easing);
    root.style.setProperty(`--spring-${name}-duration`, `${curve.duration}ms`);
  }
}
