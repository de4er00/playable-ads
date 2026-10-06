import { describe, expect, it } from "vitest";
import { type Card, type Settings, Sim, applyGate, bestSide, gateLabel, squadRadius } from "../demos/mechrush/src/sim";

const DT = 1 / 60;

/** Plays a whole run: steers to the better gate of the next pair, picks the given card. */
function play(settings: Settings, card: Card = "rockets", steer = true) {
  const sim = new Sim(settings);
  const events: string[] = [];
  for (let t = 0; t < 60 && sim.phase !== "over"; t += DT) {
    if (sim.phase === "pick") events.push(...sim.choose(card).map((e) => e.type));
    const next = sim.gates.find((g) => !g.used);
    const x = steer && next ? bestSide(sim, next.pair) * 2.2 : null;
    events.push(...sim.tick(DT, x).map((e) => e.type));
  }
  return { sim, events };
}

describe("mech rush rules", () => {
  it("gates add, multiply and subtract, never below zero", () => {
    expect(applyGate(5, { kind: "mul", value: 2 })).toBe(10);
    expect(applyGate(5, { kind: "add", value: 20 })).toBe(25);
    expect(applyGate(2, { kind: "sub", value: 5 })).toBe(0);
    expect(gateLabel({ kind: "mul", value: 3 })).toBe("×3");
  });

  it("the squad spreads with its size but stays on the road", () => {
    expect(squadRadius(100)).toBeGreaterThan(squadRadius(5));
    expect(squadRadius(10000)).toBeLessThan(4.4);
  });

  it("passing a gate changes the squad and uses up both panels of the pair", () => {
    const sim = new Sim({ outcome: "win", quickStart: false });
    const events = [];
    for (let t = 0; t < 4; t += DT) events.push(...sim.tick(DT, -2.2));
    const gate = events.find((e) => e.type === "gate");
    expect(gate && gate.type === "gate" && gate.after).toBe(10);
    expect(sim.gates.filter((g) => g.pair === 0).every((g) => g.used)).toBe(true);
  });

  it("stops for the card pick and resumes after a choice", () => {
    const sim = new Sim({ outcome: "win", quickStart: false });
    for (let t = 0; t < 30 && sim.phase !== "pick"; t += DT) sim.tick(DT, -2.2);
    expect(sim.phase).toBe("pick");
    const z = sim.z;
    sim.tick(1, null);
    expect(sim.z).toBe(z);
    expect(sim.choose("barrel")[0]).toEqual({ type: "picked", card: "barrel" });
    expect(sim.phase).toBe("run");
  });

  it("the barricade holds the squad until it is shot down", () => {
    const sim = new Sim({ outcome: "win", quickStart: false });
    let minFront = Infinity;
    for (let t = 0; t < 40 && sim.phase !== "pick"; t += DT) {
      sim.tick(DT, -2.2);
      if (sim.block.alive) minFront = Math.min(minFront, sim.front);
    }
    expect(minFront).toBeGreaterThanOrEqual(sim.block.z);
    expect(sim.block.alive).toBe(false);
  });

  it("variant a: a good run beats the boss with a few mechs left", () => {
    for (const card of ["barrel", "rockets", "shield"] as Card[]) {
      const { sim, events } = play({ outcome: "win", quickStart: false }, card);
      expect(sim.outcome, card).toBe("win");
      expect(sim.count, card).toBeGreaterThan(0);
      expect(sim.count, card).toBeLessThan(40);
      expect(events).toContain("bossDown");
    }
  });

  it("variant b: the same good run falls just short of the boss", () => {
    const { sim } = play({ outcome: "close", quickStart: false });
    expect(sim.outcome).toBe("close");
    expect(sim.boss.hp / sim.boss.maxHp).toBeLessThan(0.25);
    expect(sim.boss.hp).toBeGreaterThan(0);
  });

  it("a run that takes the bad gates still reaches the boss, smaller", () => {
    const { sim } = play({ outcome: "win", quickStart: false }, "rockets", false);
    expect(["win", "close"]).toContain(sim.outcome);
  });

  it("the whole run fits an ad: 15 to 30 seconds", () => {
    const { sim } = play({ outcome: "win", quickStart: false });
    expect(sim.time).toBeGreaterThan(15);
    expect(sim.time).toBeLessThan(30);
  });
});
