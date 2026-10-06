import { describe, expect, it } from "vitest";
import { ARENA, Sim, aimAt } from "../demos/tanks/src/sim";

function run(sim: Sim, seconds: number, input: { held: boolean; x: number; z: number }) {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...sim.tick(1 / 60, input).map((e) => e.type));
  return events;
}

describe("tank sim", () => {
  it("aims the turret at the finger", () => {
    expect(aimAt({ x: 0, z: 0 }, { x: 0, z: -5 })).toBeCloseTo(-Math.PI / 2);
    expect(aimAt({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(0);
  });

  it("does not fire until the finger is down", () => {
    const sim = new Sim("normal");
    expect(run(sim, 2, { held: false, x: 0, z: -5 })).not.toContain("shot");
  });

  it("fires about every 0.4 s while held", () => {
    const sim = new Sim("normal");
    const shots = run(sim, 2, { held: true, x: 0, z: -5 }).filter((e) => e === "shot").length;
    expect(shots).toBeGreaterThanOrEqual(4);
    expect(shots).toBeLessThanOrEqual(6);
  });

  it("a crate in the line of fire stops the shell and breaks", () => {
    const sim = new Sim("normal");
    const crate = sim.crates[0];
    const events = run(sim, 1.5, { held: true, x: crate.x, z: crate.z });
    expect(events).toContain("crate");
    expect(crate.alive).toBe(false);
  });

  it("holding fire on each enemy in turn destroys all of them and wins", () => {
    for (const difficulty of ["normal", "hard"] as const) {
      const sim = new Sim(difficulty);
      const events: string[] = [];
      for (const enemy of sim.enemies) events.push(...run(sim, 6, { held: true, x: enemy.x, z: enemy.z }));
      expect(sim.enemies.every((e) => !e.alive)).toBe(true);
      expect(events.filter((e) => e === "win")).toHaveLength(1);
    }
  });

  it("enemies take more hits on hard", () => {
    expect(new Sim("hard").enemies[0].hp).toBeGreaterThan(new Sim("normal").enemies[0].hp);
  });

  it("enemies hold fire until the player shoots", () => {
    const sim = new Sim("hard");
    expect(run(sim, 10, { held: false, x: 0, z: 0 })).not.toContain("enemyShot");
  });

  it("enemy shells do not break crates", () => {
    const sim = new Sim("hard");
    run(sim, 0.05, { held: true, x: 6.5, z: 9 });
    run(sim, 20, { held: false, x: 0, z: 0 });
    expect(sim.crates.every((c) => c.alive)).toBe(true);
  });

  it("enemy shells can hit the player but never end the game", () => {
    const sim = new Sim("hard");
    run(sim, 0.05, { held: true, x: 6.5, z: 9 });
    const events = run(sim, 20, { held: false, x: 0, z: 0 });
    expect(events).toContain("playerHit");
    expect(sim.over).toBe(false);
  });

  it("shells leave the arena instead of flying forever", () => {
    const sim = new Sim("normal");
    run(sim, 0.5, { held: true, x: 6.5, z: 9 });
    run(sim, 3, { held: false, x: 0, z: 0 });
    expect(sim.shells.filter((s) => s.owner === "player")).toHaveLength(0);
    expect(ARENA.halfW).toBeGreaterThan(0);
  });
});
