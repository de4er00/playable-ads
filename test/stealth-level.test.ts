import { describe, expect, it } from "vitest";
import { LEVEL, behind, coneAt, insidePolygon, pathLength, seen, visionPolygon } from "../demos/stealth/src/level";

const normal = LEVEL.difficulty.normal;

describe("stealth level geometry", () => {
  it("lights the straight path up the middle", () => {
    // Whatever the sweep phase, a hero halfway up the centre is inside the lit area at some point.
    const hits = [0, 0.25, 0.5, 0.75].map((phase) => seen({ x: 380, y: 640 }, coneAt(phase, normal), LEVEL.crates));
    expect(hits.some(Boolean)).toBe(true);
  });

  it("never lights the corridor behind the crates", () => {
    for (const phase of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
      for (const y of [600, 520, 440, 360, 300]) {
        expect(seen({ x: 66, y }, coneAt(phase, normal), LEVEL.crates)).toBe(false);
      }
    }
  });

  it("crates cast shadows: a point straight behind a crate is hidden even inside the cone's reach", () => {
    const cone = { ...coneAt(0, normal), angle: Math.atan2(470 - LEVEL.guard.y, 100 - LEVEL.guard.x), halfAngle: 0.4 };
    expect(seen({ x: 100, y: 470 }, cone, LEVEL.crates)).toBe(false);
    expect(seen({ x: 100, y: 470 }, cone, [])).toBe(true);
  });

  it("the drawn cone and the detection use the same polygon", () => {
    const cone = coneAt(0.3, normal);
    const poly = visionPolygon(cone, LEVEL.crates, 64);
    for (const p of [{ x: 380, y: 640 }, { x: 66, y: 500 }, { x: 600, y: 500 }]) {
      expect(insidePolygon(p, poly)).toBe(seen(p, cone, LEVEL.crates));
    }
  });

  it("knows behind from in front of the guard", () => {
    const facing = Math.PI / 2; // looking down the screen
    expect(behind({ x: LEVEL.guard.x, y: LEVEL.guard.y - 50 }, LEVEL.guard, facing)).toBe(true);
    expect(behind({ x: LEVEL.guard.x, y: LEVEL.guard.y + 50 }, LEVEL.guard, facing)).toBe(false);
  });

  it("measures a path", () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
  });
});

describe("the hint route", () => {
  it("stays dark at every sweep phase and difficulty", async () => {
    const { pointAlong } = await import("../demos/stealth/src/level");
    const total = pathLength(LEVEL.safeRoute);
    for (const d of Object.values(LEVEL.difficulty)) {
      for (let s = 0; s <= total; s += 10) {
        const { p } = pointAlong(LEVEL.safeRoute, s);
        for (let phase = 0; phase < 1; phase += 0.05) expect(seen(p, coneAt(phase, d), LEVEL.crates)).toBe(false);
      }
    }
  });

  it("ends behind the guard within takedown range", () => {
    const end = LEVEL.safeRoute[LEVEL.safeRoute.length - 1];
    expect(Math.hypot(end.x - LEVEL.guard.x, end.y - LEVEL.guard.y)).toBeLessThan(LEVEL.takedownRange);
    expect(behind(end, LEVEL.guard, Math.PI / 2)).toBe(true);
  });
});
