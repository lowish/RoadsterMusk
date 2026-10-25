/**
 * Phone (portrait, stacked-HUD) framing for the stunt camera. Pure maths, no
 * Three.js, so it is testable.
 *
 * Landscape shots are composed side-on for a wide screen; on a tall phone a
 * long course cannot fit across the width, and the lower part of the screen
 * is covered by the stacked title and telemetry. So each stunt also declares
 * the points its action must keep in view and a portrait viewing direction
 * (more down the length of the course). This module finds the closest camera
 * distance at which every point lands inside the open band of the screen.
 *
 * The camera uses a projection offset to centre that band optically: it
 * renders a taller virtual frame (height H·(1 + 2·lift)) and shows its lower
 * part, so content rises by lift·H. Pixels stay square because the camera's
 * aspect is set to the virtual frame's (see `PortraitView`).
 */

export type V3 = [number, number, number];

export interface PortraitFrame {
  /** Unit-ish direction from the target to the camera (normalised here). */
  dir: V3;
  /** World points that must stay inside the open band of the screen. */
  points: V3[];
}

export interface Band {
  /** Open band of the screen, in px from the top. */
  top: number;
  bottom: number;
}

export interface PortraitView {
  position: V3;
  target: V3;
  /** Share of the height the image is lifted by (projection offset). */
  lift: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Lift that puts the band's centre at the optical centre, clamped to a sensible range. */
export function bandLift(height: number, band: Band): number {
  const lift = (height / 2 - (band.top + band.bottom) / 2) / height;
  return Math.min(0.3, Math.max(0, lift));
}

/**
 * Screen position (px) of world point `p` for a camera at `eye` looking at
 * `target` (up = +Y), vertical FOV `fovDeg` over the virtual frame, viewport
 * `width` × `height`, lifted by `lift`. Null when the point is behind the camera.
 */
export function projectToScreen(
  p: V3,
  eye: V3,
  target: V3,
  fovDeg: number,
  width: number,
  height: number,
  lift: number,
): [number, number] | null {
  const f = norm(sub(target, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const v = sub(p, eye);
  const z = dot(v, f);
  if (z <= 0.1) return null;
  const fullH = height * (1 + 2 * lift);
  // World units per pixel at unit depth, identical horizontally and vertically (square pixels).
  const perPx = (2 * Math.tan((fovDeg * Math.PI) / 360)) / fullH;
  const x = width / 2 + dot(v, r) / (z * perPx);
  const yFull = fullH / 2 - dot(v, u) / (z * perPx);
  return [x, yFull - 2 * lift * height];
}

/**
 * Closest camera placement that keeps every point of `frame` inside the band
 * (with `margin` px), looking at the centre of the points' bounding box.
 */
export function fitPortrait(
  frame: PortraitFrame,
  fovDeg: number,
  width: number,
  height: number,
  band: Band,
  margin = 10,
): PortraitView {
  const lo = [0, 1, 2].map((i) => Math.min(...frame.points.map((p) => p[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...frame.points.map((p) => p[i])));
  const target = lo.map((v, i) => (v + hi[i]) / 2) as V3;
  const dir = norm(frame.dir);
  const lift = bandLift(height, band);
  const eyeAt = (d: number): V3 => [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d];
  const fits = (d: number) =>
    frame.points.every((p) => {
      const s = projectToScreen(p, eyeAt(d), target, fovDeg, width, height, lift);
      return !!s && s[0] >= margin && s[0] <= width - margin && s[1] >= band.top + margin && s[1] <= band.bottom - margin;
    });
  // Fitting is monotonic in distance (further back, everything converges on the centre).
  let near = 2;
  let far = 600;
  if (!fits(far)) return { position: eyeAt(far), target, lift };
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  return { position: eyeAt(far), target, lift };
}
