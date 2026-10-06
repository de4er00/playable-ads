import { describe, expect, test } from "vitest";
import { CENTER, LENGTH, pathPoint } from "../demos/siege/src/path";
import { type Element, type Outcome, SUMMON_COST, Sim, XP_LV2 } from "../demos/siege/src/sim";

/** Plays a whole run. "active" acts every 0.8 s and picks in 1.2 s; "idle" is the auto-play an untouched ad gets. */
function play(outcome: Outcome, mode: "active" | "idle", card: Element = "fire", rush = false) {
  const sim = new Sim({ outcome, rush });
  let idle = 0;
  let real = 0;
  let bossShown = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 60 && sim.phase !== "over"; i++) {
    if (sim.phase === "pick") {
      real += mode === "active" ? 1.2 : 4;
      sim.choose(card);
    }
    real += dt;
    idle += dt;
    if (idle > (mode === "active" ? 0.8 : 3)) {
      const s = sim.suggest();
      if (s?.kind === "merge") sim.move(s.from, s.to);
      else if (s) sim.summon();
      idle = mode === "active" ? 0 : 1.5;
    }
    for (const e of sim.tick(dt)) if ((e.type === "shot" && e.target.boss) || (e.type === "chain" && e.to.boss)) bossShown++;
  }
  return { sim, real, bossShown, left: sim.boss.hp / sim.boss.maxHp };
}

describe("spiral road", () => {
  test("starts at the far top, ends at the gate facing the camera, about 46 m long", () => {
    expect(LENGTH).toBeGreaterThan(40);
    expect(LENGTH).toBeLessThan(52);
    const start = pathPoint(0);
    const end = pathPoint(LENGTH);
    expect(start.z).toBeLessThan(CENTER.z - 7);
    expect(Math.abs(start.x - CENTER.x)).toBeLessThan(0.01);
    expect(end.z).toBeGreaterThan(CENTER.z + 2);
  });

  test("equal steps in s are equal steps on the ground", () => {
    for (const s of [3, 15, 30, 44]) {
      const a = pathPoint(s);
      const b = pathPoint(s + 0.5);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 2);
    }
  });
});

describe("board", () => {
  test("two equal units merge one level up; unequal ones don't", () => {
    const sim = new Sim({ outcome: "win", rush: false });
    expect(sim.move(0, 1)).toBe(true);
    expect(sim.board[0]).toBeNull();
    expect(sim.board[1]!.level).toBe(2);
    sim.summon();
    const cell = sim.board.findIndex((u, i) => u && i !== 1);
    expect(sim.canMerge(cell, 1)).toBe(false);
  });

  test("a move onto an empty cell moves; the top level never merges", () => {
    const sim = new Sim({ outcome: "win", rush: false });
    expect(sim.move(0, 5)).toBe(true);
    expect(sim.board[5]!.level).toBe(1);
    sim.board[2] = { level: 4, cd: 0 };
    sim.board[3] = { level: 4, cd: 0 };
    expect(sim.canMerge(2, 3)).toBe(false);
  });

  test("summon costs coins and needs an empty cell", () => {
    const sim = new Sim({ outcome: "win", rush: false });
    expect(sim.coins).toBe(SUMMON_COST);
    expect(sim.summon()).toBe(true);
    expect(sim.coins).toBe(0);
    expect(sim.summon()).toBe(false);
    sim.coins = 10_000;
    while (sim.summon());
    expect(sim.board.every((u) => u)).toBe(true);
  });
});

describe("run", () => {
  test("tower level 2 pauses the game for the element pick", () => {
    const sim = new Sim({ outcome: "win", rush: false });
    let t = 0;
    while (sim.phase === "run" && t < 30) {
      sim.tick(1 / 60);
      t += 1 / 60;
    }
    expect(sim.phase).toBe("pick");
    expect(sim.xp).toBe(XP_LV2);
    const before = sim.time;
    sim.tick(1);
    expect(sim.time).toBe(before);
    sim.choose("water");
    expect(sim.phase).toBe("run");
  });

  for (const mode of ["active", "idle"] as const)
    for (const card of ["water", "flash", "fire"] as const)
      test(`variant a wins, ${mode} player, ${card}`, () => {
        const r = play("win", mode, card);
        expect(r.sim.outcome).toBe("win");
        // the board really shoots the boss down: hundreds of hits, not a scripted drain
        expect(r.bossShown).toBeGreaterThan(60);
        expect(r.sim.boss.taken).toBeGreaterThan(r.sim.boss.maxHp * 0.6);
        expect(r.real).toBeGreaterThan(17);
        expect(r.real).toBeLessThan(27);
        expect(r.sim.base).toBeGreaterThan(0.2);
      });

  for (const mode of ["active", "idle"] as const)
    test(`variant b ends so close, ${mode} player`, () => {
      const r = play("close", mode);
      expect(r.sim.outcome).toBe("close");
      expect(r.sim.base).toBe(0);
      expect(r.left).toBeGreaterThan(0.05);
      expect(r.left).toBeLessThan(0.25);
      expect(r.real).toBeLessThan(31);
    });

  test("hook C starts with the snake halfway in and still wins", () => {
    const sim = new Sim({ outcome: "win", rush: true });
    expect(sim.wave[0].s / LENGTH).toBeGreaterThan(0.4);
    expect(play("win", "idle", "fire", true).sim.outcome).toBe("win");
  });
});
