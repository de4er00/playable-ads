// Mech Rush rules without rendering. The squad walks up a bridge (toward -z), gates change its size,
// drones walk into it, a barricade blocks the road until it is shot down, a card pick upgrades the
// weapons, and a boss mech ends the run. The renderer reads this state and turns events into effects.

export const ROAD_HALF = 4.4;
export const SPEED = 7.2;
const VOLLEY = 0.16; // seconds between volleys
const BULLET_SPEED = 34;
const ENEMY_SPEED = 2.6;
const BOSS_STOP = -110;
const BOSS_Z = -124;

export type GateKind = "add" | "mul" | "sub";
export type Card = "barrel" | "rockets" | "shield";
export type Outcome = "win" | "close";

export interface Gate {
  pair: number;
  side: -1 | 1;
  z: number;
  kind: GateKind;
  value: number;
  used: boolean;
}
export interface Enemy {
  id: number;
  x: number;
  z: number;
  hp: number;
  alive: boolean;
}
export interface Block {
  z: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}
export interface Bullet {
  x: number;
  z: number;
  dmg: number;
  rocket: boolean;
  alive: boolean;
}
export interface Boss {
  z: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  slam: number;
}

export type SimEvent =
  | { type: "gate"; gate: Gate; before: number; after: number }
  | { type: "volley"; count: number }
  | { type: "kill"; x: number; z: number }
  | { type: "hit"; x: number; z: number; dmg: number; boss: boolean; rocket: boolean }
  | { type: "lost"; n: number; x: number; z: number }
  | { type: "blockHit"; hp: number }
  | { type: "blockDown"; z: number }
  | { type: "pick" }
  | { type: "picked"; card: Card }
  | { type: "bossSlam"; killed: number }
  | { type: "bossDown" }
  | { type: "over"; outcome: Outcome };

export interface Settings {
  outcome: Outcome;
  /** First gates come sooner for the variant without an intro. */
  quickStart: boolean;
}

/** Small seeded generator: the same input gives the same run, which keeps tests and captures stable. */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyGate(count: number, g: Pick<Gate, "kind" | "value">): number {
  if (g.kind === "add") return count + g.value;
  if (g.kind === "mul") return count * g.value;
  return Math.max(0, count - g.value);
}

export function gateLabel(g: Pick<Gate, "kind" | "value">): string {
  return g.kind === "add" ? `+${g.value}` : g.kind === "mul" ? `×${g.value}` : `-${g.value}`;
}

/** Squad radius on the road for a given size: a packed disc that never spills over the rails. */
export function squadRadius(count: number): number {
  return Math.min(ROAD_HALF - 0.6, 0.55 + Math.sqrt(Math.max(1, count)) * 0.34);
}

export class Sim {
  phase: "run" | "pick" | "boss" | "over" = "run";
  outcome: Outcome | null = null;
  time = 0;
  count = 5;
  x = 0;
  z = 0;
  targetX = 0;
  gates: Gate[] = [];
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  block: Block;
  boss: Boss;
  cards: Card[] = [];
  readonly pickZ: number;
  private picked = false;
  private volleyT = 0;
  private rocketT = 0;
  private shield = 0;
  private rng = makeRng(7);

  constructor(private settings: Settings) {
    const g0 = settings.quickStart ? -9 : -15;
    this.pairs([
      [g0, { kind: "mul", value: 2 }, { kind: "sub", value: 3 }],
      [-40, { kind: "sub", value: 5 }, { kind: "add", value: 20 }],
      [-84, { kind: "mul", value: 3 }, { kind: "add", value: 12 }],
    ]);
    this.pack(-25, 6, 4, 1);
    this.pack(-66, 12, 7, 2);
    this.pack(-92, 10, 6, 2);
    this.block = { z: -52, hp: 140, maxHp: 140, alive: true };
    this.pickZ = -57;
    const bossHp = settings.outcome === "win" ? 1500 : 2300;
    this.boss = { z: BOSS_Z, hp: bossHp, maxHp: bossHp, alive: true, slam: 1.4 };
  }

  private pairs(list: [number, Pick<Gate, "kind" | "value">, Pick<Gate, "kind" | "value">][]) {
    list.forEach(([z, left, right], pair) => {
      this.gates.push({ pair, side: -1, z, ...left, used: false }, { pair, side: 1, z, ...right, used: false });
    });
  }

  private pack(z: number, cols: number, rows: number, hp: number) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -ROAD_HALF + 0.5 + ((c + 0.5) / cols) * (ROAD_HALF * 2 - 1) + (this.rng() - 0.5) * 0.35;
        this.enemies.push({ id: this.enemies.length, x, z: z - r * 1.05 + (this.rng() - 0.5) * 0.3, hp, alive: true });
      }
    }
  }

  get front(): number {
    return this.z - squadRadius(this.count);
  }

  choose(card: Card): SimEvent[] {
    if (this.phase !== "pick") return [];
    this.cards.push(card);
    if (card === "shield") this.shield = 12;
    this.phase = "run";
    return [{ type: "picked", card }];
  }

  tick(dt: number, steerX: number | null): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.phase === "pick" || this.phase === "over") return ev;
    this.time += dt;
    if (steerX !== null) this.targetX = Math.max(-ROAD_HALF + 1.2, Math.min(ROAD_HALF - 1.2, steerX));
    this.x += (this.targetX - this.x) * (1 - Math.pow(0.0005, dt));

    if (this.phase === "run") {
      const blocked = this.block.alive && this.front - SPEED * dt <= this.block.z + 0.8;
      if (!blocked) this.z = Math.max(BOSS_STOP, this.z - SPEED * dt);
      if (this.z <= BOSS_STOP) {
        this.phase = "boss";
        // The outcome is scripted by the variant, whatever the player did on the way:
        // the boss gets just enough health to fall at the last mechs, or to survive at a sliver.
        const damage = this.projectBossDamage();
        // Measured: the run deals about 4.5% more than this projection (bullets already in flight).
        const hp = Math.round(damage * (this.settings.outcome === "win" ? 0.93 : 1.1));
        this.boss.hp = this.boss.maxHp = Math.max(300, hp);
      }
      for (const pair of [0, 1, 2]) {
        const [l, r] = this.gates.filter((g) => g.pair === pair);
        if (!l.used && this.front <= l.z) {
          const g = this.x < 0 ? l : r;
          l.used = r.used = true;
          const before = this.count;
          this.count = applyGate(this.count, g);
          ev.push({ type: "gate", gate: g, before, after: this.count });
        }
      }
      if (!this.picked && this.z <= this.pickZ) {
        this.picked = true;
        this.phase = "pick";
        ev.push({ type: "pick" });
        return ev;
      }
    }

    this.fire(dt, ev);
    this.moveBullets(dt, ev);
    this.moveEnemies(dt, ev);
    if (this.phase === "boss") this.bossFight(dt, ev);

    // moveBullets and bossFight may have ended the run already
    if ((this.phase as string) !== "over" && this.count <= 0) {
      this.count = 0;
      this.phase = "over";
      this.outcome = "close";
      ev.push({ type: "over", outcome: "close" });
    }
    return ev;
  }

  private fire(dt: number, ev: SimEvent[]) {
    this.volleyT -= dt;
    if (this.volleyT <= 0) {
      this.volleyT = VOLLEY;
      // Every mech fires, but on screen a volley is capped: the damage carries the rest.
      const shown = Math.min(this.count, 14);
      const perBullet = (this.count / shown) * (this.cards.includes("barrel") ? 1.6 : 1);
      const r = squadRadius(this.count);
      for (let i = 0; i < shown; i++) {
        const x = this.x + (this.rng() * 2 - 1) * r * 0.85;
        this.bullets.push({ x, z: this.front, dmg: perBullet, rocket: false, alive: true });
      }
      ev.push({ type: "volley", count: shown });
    }
    if (this.cards.includes("rockets")) {
      this.rocketT -= dt;
      if (this.rocketT <= 0) {
        this.rocketT = 0.55;
        for (const side of [-1, 1]) this.bullets.push({ x: this.x + side * 0.6, z: this.front, dmg: 22, rocket: true, alive: true });
      }
    }
  }

  private moveBullets(dt: number, ev: SimEvent[]) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.z -= BULLET_SPEED * dt;
      if (b.z < this.z - 34) {
        b.alive = false;
        continue;
      }
      if (this.block.alive && b.z <= this.block.z + 0.6 && b.z >= this.block.z - 1.2) {
        b.alive = false;
        this.block.hp = Math.max(0, this.block.hp - b.dmg);
        ev.push({ type: "blockHit", hp: Math.ceil(this.block.hp) });
        if (this.block.hp <= 0) {
          this.block.alive = false;
          ev.push({ type: "blockDown", z: this.block.z });
        }
        continue;
      }
      if (this.boss.alive && this.phase === "boss" && b.z <= this.boss.z + 3) {
        b.alive = false;
        this.boss.hp = Math.max(0, this.boss.hp - b.dmg);
        ev.push({ type: "hit", x: b.x, z: this.boss.z + 2.5, dmg: b.dmg, boss: true, rocket: b.rocket });
        if (this.boss.hp <= 0) {
          this.boss.alive = false;
          this.phase = "over";
          this.outcome = "win";
          ev.push({ type: "bossDown" }, { type: "over", outcome: "win" });
        }
        continue;
      }
      const splash = b.rocket ? 1.4 : 0.45;
      for (const e of this.enemies) {
        if (!e.alive || Math.abs(e.z - b.z) > 0.6 || Math.abs(e.x - b.x) > splash) continue;
        b.alive = false;
        const victims = b.rocket ? this.enemies.filter((o) => o.alive && Math.hypot(o.x - b.x, o.z - b.z) < splash) : [e];
        for (const v of victims) {
          v.hp -= b.dmg;
          ev.push({ type: "hit", x: v.x, z: v.z, dmg: b.dmg, boss: false, rocket: b.rocket });
          if (v.hp <= 0) {
            v.alive = false;
            ev.push({ type: "kill", x: v.x, z: v.z });
          }
        }
        break;
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  private moveEnemies(dt: number, ev: SimEvent[]) {
    const r = squadRadius(this.count);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      // drones wake up when the squad is near and walk into it
      if (e.z > this.z - 26) e.z += ENEMY_SPEED * dt;
      if (e.z >= this.z - r && Math.abs(e.x - this.x) < r + 0.3) {
        e.alive = false;
        if (this.shield > 0) {
          this.shield -= 1;
          ev.push({ type: "kill", x: e.x, z: e.z });
        } else {
          const n = Math.min(this.count, 1);
          this.count -= n;
          ev.push({ type: "lost", n, x: e.x, z: e.z });
        }
      } else if (e.z > this.z + 2) e.alive = false; // slipped past along the rail
    }
  }

  /** Damage the squad would deal to an unkillable boss before it is wiped out, with the current cards. */
  projectBossDamage(): number {
    let count = this.count;
    let damage = 0;
    let slam = this.boss.slam;
    let rocket = 0;
    const barrel = this.cards.includes("barrel") ? 1.6 : 1;
    for (let t = 0; t < 60 && count > 0; t += VOLLEY) {
      damage += count * barrel;
      rocket -= VOLLEY;
      if (this.cards.includes("rockets") && rocket <= 0) {
        rocket = 0.55;
        damage += 44;
      }
      slam -= VOLLEY;
      if (slam <= 0) {
        slam = 1.15;
        count -= Math.min(count, Math.max(2, Math.round(count * 0.22)));
      }
    }
    return damage;
  }

  private bossFight(dt: number, ev: SimEvent[]) {
    if (!this.boss.alive) return;
    this.boss.slam -= dt;
    if (this.boss.slam <= 0) {
      this.boss.slam = 1.15;
      // Slams scale with the squad, so a big army still feels the boss and a small one is not wiped at once.
      const killed = Math.min(this.count, Math.max(2, Math.round(this.count * 0.22)));
      this.count -= killed;
      ev.push({ type: "bossSlam", killed });
    }
  }
}

/** The gate an autopilot would take: the one that leaves the bigger squad. Used by tests and the idle demo. */
export function bestSide(sim: Sim, pair: number): -1 | 1 {
  const [l, r] = sim.gates.filter((g) => g.pair === pair);
  return applyGate(sim.count, l) >= applyGate(sim.count, r) ? -1 : 1;
}
