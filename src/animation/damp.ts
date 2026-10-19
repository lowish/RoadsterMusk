/**
 * Frame-rate independent exponential smoothing factor.
 * `lambda` is the response rate (higher = snappier); use as `lerp(a, b, dampFactor(lambda, dt))`.
 */
export function dampFactor(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * dampFactor(lambda, dt);
}

export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
