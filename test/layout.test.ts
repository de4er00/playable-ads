import { describe, expect, it } from "vitest";
import { fit } from "../kit/layout";

const world = { w: 720, h: 960 };

describe("layout", () => {
  it("fits the world into a portrait phone with room for the UI bands", () => {
    const f = fit(390, 844, world, { top: 70, bottom: 110 });
    expect(f.orientation).toBe("portrait");
    expect(f.scale * world.w).toBeLessThanOrEqual(390 + 1e-9);
    expect(f.y).toBeGreaterThanOrEqual(70);
    expect(f.y + f.scale * world.h).toBeLessThanOrEqual(844 - 110 + 1e-9);
  });

  it("fits the world into a landscape phone and centres it", () => {
    const f = fit(844, 390, world, { top: 70, bottom: 110 });
    expect(f.orientation).toBe("landscape");
    expect(f.scale * world.h).toBeLessThanOrEqual(390 + 1e-9);
    expect(Math.abs(f.x + (f.scale * world.w) / 2 - 844 / 2)).toBeLessThan(1);
  });

  it("keeps the top corners free for the network close button", () => {
    const f = fit(390, 844, world, { top: 70, bottom: 110 });
    expect(f.safeCorner).toBe(50);
  });
});
