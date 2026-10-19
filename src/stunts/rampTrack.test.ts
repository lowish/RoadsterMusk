import { describe, expect, it } from 'vitest';
import {
  buildRampMesh,
  buildTruss,
  distanceToSegment,
  LIP_HEIGHT,
  RAMP_LENGTH,
  RAMP_TRACK,
  rampDeckAt,
  RIG_TOP,
} from './rampTrack';
import { curveAt, radiusAt } from './rampCurve';
import { CAR_HALF_HEIGHT, poseAt, RAMP, RAMP_DECK_TOP, RAMP_PHASES, type Vec3 } from './routines';

const P = RAMP_PHASES;
const DEG = Math.PI / 180;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const launchT = P.settle + P.drive + P.ramp;
const landT = launchT + P.air + P.descent;

describe('open vertical ramp', () => {
  it('is the exact surface the routine drives: wheels on the deck from the run-up to the lip', () => {
    for (let t = P.settle; t <= launchT; t += 0.01) {
      const pose = poseAt('loop', t);
      // Deck frame for this pose: from its centre z on the flat, from its pitch (= deck angle) on the curve.
      const f = pose.pitch === 0 ? rampDeckAt(RAMP.leadIn + pose.position[2]) : curveAt(pose.pitch);
      const expected = f.point.map((v, i) => v + f.up[i] * CAR_HALF_HEIGHT) as Vec3;
      expect(dist(pose.position, expected)).toBeLessThan(1e-6);
      // The car's roof vector for its pitch (YXZ, nose-up positive) is the deck normal.
      expect(f.up[1]).toBeCloseTo(Math.cos(pose.pitch * DEG), 6);
      expect(f.up[2]).toBeCloseTo(-Math.sin(pose.pitch * DEG), 6);
    }
  });

  it('is open and single-sided: a flat lead-in curving up past vertical into a J-curve overhang', () => {
    expect(rampDeckAt(0).point).toEqual([0, RAMP_DECK_TOP, -RAMP.leadIn]);
    const lip = rampDeckAt(RAMP_LENGTH);
    expect(RAMP.sweep).toBeGreaterThanOrEqual(110);
    expect(LIP_HEIGHT).toBeGreaterThan(10);
    // Over vertical: the deck at the lip faces down and back over the run-up, and the lip
    // overhangs the deepest point of the curve.
    expect(lip.up[1]).toBeLessThan(-0.3);
    expect(lip.up[2]).toBeLessThan(-0.8);
    expect(lip.tangent[2]).toBeLessThan(-0.3);
    expect(lip.point[2]).toBeLessThan(curveAt(90).point[2] - 0.5);
    // Continuous surface, joined smoothly to the lead-in.
    for (let s = 0; s < RAMP_LENGTH; s += 0.05) {
      expect(dist(rampDeckAt(s).point, rampDeckAt(s + 0.05).point)).toBeLessThan(0.0501);
    }
    expect(dist(rampDeckAt(RAMP.leadIn).point, [0, RAMP_DECK_TOP, 0])).toBeLessThan(1e-9);
  });

  it('tightens its curvature toward the lip (constant at the bottom, smoothly down to the top radius)', () => {
    expect(radiusAt(0)).toBe(RAMP.radius);
    expect(radiusAt(RAMP.easeFrom)).toBe(RAMP.radius);
    expect(radiusAt(RAMP.sweep)).toBeCloseTo(RAMP.topRadius, 9);
    for (let phi = 1; phi <= RAMP.sweep; phi++) expect(radiusAt(phi)).toBeLessThanOrEqual(radiusAt(phi - 1) + 1e-12);
    // The built surface has that radius: deck distance per radian of turn.
    for (const phi of [20, 70, 100, 118]) {
      const a = curveAt(phi - 1).point;
      const b = curveAt(phi + 1).point;
      expect(dist(a, b) / (2 * DEG)).toBeCloseTo(radiusAt(phi), 1);
    }
  });

  it('builds a valid mesh: deck with UVs and a centre line at u = 0.5, slab, and red edge strips', () => {
    const mesh = buildRampMesh();
    const verts = mesh.positions.length / 3;
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.uvs.length).toBe(verts * 2);
    for (const i of mesh.indices) expect(i).toBeLessThan(verts);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      expect(Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2])).toBeCloseTo(1, 5);
    }
    // Triangle winding agrees with the normals (otherwise double-sided shading lights the wrong side).
    const v = (i: number) => [0, 1, 2].map((k) => mesh.positions[i * 3 + k]);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]].map(v);
      const e1 = b.map((x, k) => x - a[k]);
      const e2 = c.map((x, k) => x - a[k]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const i = mesh.indices[t] * 3;
      expect(n[0] * mesh.normals[i] + n[1] * mesh.normals[i + 1] + n[2] * mesh.normals[i + 2]).toBeGreaterThan(0);
    }
    expect(mesh.groups.map((g) => g.count).reduce((a, b) => a + b)).toBe(mesh.indices.length);
    for (const g of mesh.groups) expect(g.count).toBeGreaterThan(0);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(Math.abs(mesh.positions[i])).toBeLessThanOrEqual(RAMP_TRACK.width / 2 + 1e-6);
    }
    // Deck u runs 0..1 across the width, so x = 0 (the centre line) maps to u = 0.5.
    const us = Array.from(mesh.uvs.filter((_, i) => i % 2 === 0));
    expect(Math.max(...us)).toBeCloseTo(1, 6);
  });
});

describe('scaffolding', () => {
  const beams = buildTruss();
  const samples = (b: { a: Vec3; b: Vec3 }) =>
    Array.from({ length: 21 }, (_, i) => b.a.map((v, k) => v + ((b.b[k] - v) * i) / 20) as Vec3);

  it('stands on the floor and rises above the lip', () => {
    expect(beams.length).toBeGreaterThan(60);
    for (const b of beams) {
      expect(Math.min(b.a[1], b.b[1])).toBeGreaterThanOrEqual(-1e-9);
      expect(dist(b.a, b.b)).toBeGreaterThan(0.05);
    }
    expect(Math.max(...beams.flatMap((b) => [b.a[1], b.b[1]]))).toBeCloseTo(RIG_TOP);
    expect(RIG_TOP).toBeGreaterThan(LIP_HEIGHT);
  });

  it('sits strictly behind the back face of the curve, overhang included (never on the deck side or the run-up)', () => {
    const deck = Array.from({ length: 1201 }, (_, i) => curveAt((i / 1200) * RAMP.sweep));
    for (const b of beams) {
      for (const p of samples(b)) {
        expect(p[2]).toBeGreaterThan(0);
        // Signed distance from the nearest deck point along its normal: behind the slab's back face.
        let best = Infinity;
        let signed = 0;
        for (const f of deck) {
          const d = dist(p, f.point);
          if (d < best) {
            best = d;
            signed = (p[1] - f.point[1]) * f.up[1] + (p[2] - f.point[2]) * f.up[2];
          }
        }
        expect(signed).toBeLessThan(-RAMP_TRACK.thickness + 0.02);
      }
    }
  });

  it('frames the overhang: struts reach the back of the lip and the tower rises above it', () => {
    const lipBack = curveAt(RAMP.sweep);
    const nearLip = beams.filter((b) => [b.a, b.b].some((e) => Math.hypot(e[1] - lipBack.point[1], e[2] - lipBack.point[2]) < 0.5));
    expect(nearLip.length).toBeGreaterThanOrEqual(4);
    expect(RIG_TOP).toBeGreaterThan(LIP_HEIGHT + 1);
  });
});

describe('launch, flip and landing', () => {
  it('clears the ramp and the scaffolding in flight (until the cushioned descent onto the lead-in)', () => {
    const deck = Array.from({ length: 400 }, (_, i) => rampDeckAt((i / 399) * RAMP_LENGTH).point);
    const beams = buildTruss();
    for (let t = launchT + 0.25; t < launchT + P.air; t += 0.02) {
      const c = poseAt('loop', t).position;
      for (const d of deck) expect(dist(c, d)).toBeGreaterThan(1.5);
      for (const b of beams) expect(distanceToSegment(c, b.a, b.b)).toBeGreaterThan(2);
    }
  });

  it('touches down softly on the lead-in at its starting spot', () => {
    const end = poseAt('loop', landT - 1e-6);
    expect(end.position[1]).toBeCloseTo(RAMP.base, 6);
    expect(end.position[2]).toBeCloseTo(RAMP.landZ, 6);
    // On the deck, well inside the lead-in.
    expect(RAMP.landZ).toBeGreaterThan(-RAMP.leadIn + 2.2);
    // Sink rate at touchdown is ~0.
    const dy = poseAt('loop', landT - 1e-3).position[1] - poseAt('loop', landT - 2e-3).position[1];
    expect(Math.abs(dy / 1e-3)).toBeLessThan(0.02);
  });
});
