// Gameplay without rendering: positions on the ground plane (x right, z toward the camera), shells, hits.
// The renderer reads this state and turns the returned events into effects and sounds.

export interface P {
  x: number;
  z: number;
}
export interface Tank extends P {
  turret: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  cooldown: number;
}
export interface Box extends P {
  w: number;
  d: number;
  alive: boolean;
}
export interface Shell extends P {
  vx: number;
  vz: number;
  owner: "player" | "enemy";
  alive: boolean;
}
export type SimEvent =
  | { type: "shot"; x: number; z: number; angle: number }
  | { type: "enemyShot"; x: number; z: number; angle: number }
  | { type: "hit"; x: number; z: number; index: number }
  | { type: "kill"; x: number; z: number; index: number }
  | { type: "crate"; x: number; z: number; index: number }
  | { type: "wall"; x: number; z: number }
  | { type: "playerHit"; x: number; z: number }
  | { type: "win" };

export type Difficulty = "normal" | "hard";

export const ARENA = { halfW: 7, halfD: 10 };
export const PLAYER_START: P = { x: 0, z: 7.6 };
const TANK_R = 0.95;
const PLAYER_RELOAD = 0.4;
const SHELL_SPEED = 20;
const ENEMY_SHELL_SPEED = 6.5;
const BARREL = 1.35;

const SETTINGS: Record<Difficulty, { hp: number; enemyReload: number }> = {
  normal: { hp: 2, enemyReload: 2.4 },
  hard: { hp: 3, enemyReload: 1.7 },
};

export function aimAt(from: P, to: P): number {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

export class Sim {
  player: Tank;
  enemies: Tank[];
  crates: Box[];
  walls: Box[];
  shells: Shell[] = [];
  over = false;
  /** Enemies hold fire until the player shoots, so the ad does not play itself while waiting. */
  engaged = false;
  private won = false;
  private reload: number;

  constructor(difficulty: Difficulty) {
    const s = SETTINGS[difficulty];
    this.reload = s.enemyReload;
    this.player = { ...PLAYER_START, turret: -Math.PI / 2, hp: 1, maxHp: 1, alive: true, cooldown: 0 };
    this.enemies = [
      { x: -4, z: -2.5 },
      { x: 4.2, z: -1 },
      { x: 0.5, z: -6.2 },
    ].map((p, i) => ({ ...p, turret: Math.PI / 2, hp: s.hp, maxHp: s.hp, alive: true, cooldown: 1.2 + i * 0.7 }));
    // Crates screen each enemy, so the first shots break cover before they land.
    this.crates = [
      { x: -3.9, z: 0.4 },
      { x: -2.9, z: 0.9 },
      { x: 3.6, z: 1.6 },
      { x: 4.6, z: 1.6 },
      { x: 0.6, z: -3.6 },
      { x: -0.4, z: -3.6 },
    ].map((p) => ({ ...p, w: 0.9, d: 0.9, alive: true }));
    this.walls = [
      { x: -5.5, z: 4.2, w: 2.2, d: 0.6, alive: true },
      { x: 5.5, z: 4.6, w: 2.2, d: 0.6, alive: true },
    ];
  }

  tick(dt: number, input: { held: boolean; x: number; z: number }): SimEvent[] {
    const events: SimEvent[] = [];
    const p = this.player;
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (input.held) {
      this.engaged = true;
      p.turret = aimAt(p, input);
      if (p.cooldown === 0) {
        p.cooldown = PLAYER_RELOAD;
        this.fire(p, "player", SHELL_SPEED);
        events.push({ type: "shot", x: p.x, z: p.z, angle: p.turret });
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.turret = aimAt(e, p);
      e.cooldown -= dt;
      if (!this.engaged) continue;
      if (e.cooldown <= 0 && !this.won) {
        e.cooldown = this.reload;
        this.fire(e, "enemy", ENEMY_SHELL_SPEED);
        events.push({ type: "enemyShot", x: e.x, z: e.z, angle: e.turret });
      }
    }

    for (const s of this.shells) {
      if (!s.alive) continue;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      this.collide(s, events);
    }
    this.shells = this.shells.filter((s) => s.alive);

    if (!this.won && this.enemies.every((e) => !e.alive)) {
      this.won = true;
      this.shells = this.shells.filter((s) => s.owner === "player");
      events.push({ type: "win" });
    }
    return events;
  }

  private fire(t: Tank, owner: Shell["owner"], speed: number) {
    const dx = Math.cos(t.turret);
    const dz = Math.sin(t.turret);
    this.shells.push({ x: t.x + dx * BARREL, z: t.z + dz * BARREL, vx: dx * speed, vz: dz * speed, owner, alive: true });
  }

  private collide(s: Shell, events: SimEvent[]) {
    if (Math.abs(s.x) > ARENA.halfW + 1 || Math.abs(s.z) > ARENA.halfD + 1) {
      s.alive = false;
      return;
    }
    for (const w of this.walls) {
      if (inBox(s, w)) {
        s.alive = false;
        events.push({ type: "wall", x: s.x, z: s.z });
        return;
      }
    }
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      if (c.alive && inBox(s, c)) {
        s.alive = false;
        // only the player breaks cover; enemy shells just thud into it
        if (s.owner === "enemy") {
          events.push({ type: "wall", x: s.x, z: s.z });
          return;
        }
        c.alive = false;
        events.push({ type: "crate", x: c.x, z: c.z, index: i });
        return;
      }
    }
    if (s.owner === "player") {
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.alive && Math.hypot(s.x - e.x, s.z - e.z) < TANK_R) {
          s.alive = false;
          e.hp -= 1;
          if (e.hp <= 0) {
            e.alive = false;
            events.push({ type: "kill", x: e.x, z: e.z, index: i });
          } else events.push({ type: "hit", x: e.x, z: e.z, index: i });
          return;
        }
      }
    } else if (Math.hypot(s.x - this.player.x, s.z - this.player.z) < TANK_R) {
      // A hit shakes the camera and nothing more: this ad never ends in a loss.
      s.alive = false;
      events.push({ type: "playerHit", x: s.x, z: s.z });
    }
  }
}

function inBox(p: P, b: Box): boolean {
  return Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2;
}
