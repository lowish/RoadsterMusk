import { describe, expect, it } from 'vitest';
import { bandLift, fitPortrait, projectToScreen, type Band } from './portraitFraming';
import { STUNTS } from './routines';

// A common phone: 390 × 844, open band between the stunt tabs and the stacked title.
const W = 390;
const H = 844;
const band: Band = { top: 150, bottom: 451 };
const FOV = 50;

describe('portrait stunt framing', () => {
  it('lifts the image so the open band sits at the optical centre', () => {
    const lift = bandLift(H, band);
    expect(lift).toBeCloseTo((H / 2 - (150 + 451) / 2) / H, 9);
    // The target (optical centre) lands in the middle of the band.
    const s = projectToScreen([0, 0, 0], [0, 0, 10], [0, 0, 0], FOV, W, H, lift)!;
    expect(s[0]).toBeCloseTo(W / 2, 6);
    expect(s[1]).toBeCloseTo((150 + 451) / 2, 6);
  });

  it('keeps square pixels: equal world offsets project to equal screen offsets', () => {
    const lift = 0.15;
    const c = projectToScreen([0, 0, 0], [0, 0, 10], [0, 0, 0], FOV, W, H, lift)!;
    const x = projectToScreen([1, 0, 0], [0, 0, 10], [0, 0, 0], FOV, W, H, lift)!;
    const y = projectToScreen([0, 1, 0], [0, 0, 10], [0, 0, 0], FOV, W, H, lift)!;
    expect(Math.abs(x[0] - c[0])).toBeCloseTo(Math.abs(y[1] - c[1]), 6);
  });

  it.each(STUNTS.map((s) => s.id))('%s: every key point fits inside the band, as close as possible', (id) => {
    const frame = STUNTS.find((s) => s.id === id)!.portrait;
    const view = fitPortrait(frame, FOV, W, H, band);
    for (const p of frame.points) {
      const s = projectToScreen(p, view.position, view.target, FOV, W, H, view.lift)!;
      expect(s).not.toBeNull();
      expect(s[0]).toBeGreaterThanOrEqual(9.9);
      expect(s[0]).toBeLessThanOrEqual(W - 9.9);
      expect(s[1]).toBeGreaterThanOrEqual(band.top + 9.9);
      expect(s[1]).toBeLessThanOrEqual(band.bottom - 9.9);
    }
    // Tight: 10% closer and something leaves the band.
    const d = Math.hypot(...view.position.map((v, i) => v - view.target[i]));
    const closer = view.position.map((v, i) => view.target[i] + ((v - view.target[i]) * 0.9 * d) / d) as typeof view.position;
    const escaped = frame.points.some((p) => {
      const s = projectToScreen(p, closer, view.target, FOV, W, H, view.lift);
      return !s || s[0] < 10 || s[0] > W - 10 || s[1] < band.top + 10 || s[1] > band.bottom - 10;
    });
    expect(escaped).toBe(true);
    // And close enough that the stage fog (subject distance + 70 m) never hides it.
    expect(d).toBeLessThan(120);
  });
});
