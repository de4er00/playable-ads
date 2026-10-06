// Spiral Siege rules, free of rendering, so tests can play whole runs in milliseconds.
// A red snake crawls the spiral toward the tower. Units on a 3x2 board in front of it shoot the
// segment nearest the gate; two equal units merge into a stronger one. Kills pay coins (Summon puts
// a new level-1 unit on the board) and tower XP; tower level 2 offers one of three elements.
// Then the boss snake comes. Its health is calibrated from the board's damage at that moment, and
// pinned to a line along its path, so variant a always wins and variant b always ends "so close".
import { LENGTH } from "./path";

export type Element = "water" | "flash" | "fire";
export type Outcome = "win" | "close";

export interface Settings {
  outcome: Outcome;
  /** Hook C: the snake starts halfway along the spiral, the tower in danger from the first second. */
  rush: boolean;
}

export const COLS = 3;
export const ROWS = 2;
export const CELLS = COLS * ROWS;
export const MAX_LEVEL = 4;
/** Damage per shot by unit level (index 0 unused). Each merge is worth about 30% more than its two parts. */
export const DAMAGE = [0, 75, 190, 480, 1200];
export const FIRE_EVERY = 0.4;
export const SUMMON_COST = 100;
export const KILL_COINS = 20;
export const SHED_COINS = 60;
export const GAP = 0.62;
export const BOSS_GAP = 1.2;
export const SPEED = 3.1;
/** A little faster than the snake; it never closes in on the snake's tail closer than BOSS_GAP. */
export const BOSS_SPEED = 3.5;
export const WAVE = 40;
export const BOSS_SEGMENTS = 10;
/** The boss enters at this time (and not before the element is chosen), right behind the first snake. */
export const BOSS_AT = 9.5;
export const XP_LV2 = 12;
export const XP_LV3 = 30;
const BITE = 0.04;
const CRIT_CHANCE = 0.15;
const CRIT_MUL = 2.5;
const CHAIN = 2;
const CHAIN_SHARE = 0.5;
const BURN_SHARE = 0.35;
const BURN_TIME = 2;
const BURN_TICK = 0.4;
const SLOW = 0.7;
const LV3_BONUS = 1.25;
/** Win: the boss is dead by this fraction of the road at the latest. Close: it reaches the gate with at least this much health. */
const WIN_BY = 0.85;
const CLOSE_LEFT = 0.1;

export interface Unit {
  level: number;
  cd: number;
}

export interface Segment {
  id: number;
  s: number;
  hp: number;
  maxHp: number;
  boss: boolean;
  burn: number;
  burnDps: number;
  burnTick: number;
}

export type SimEvent =
  | { type: "shot"; cell: number; target: Segment; dmg: number; crit: boolean }
  | { type: "chain"; from: Segment; to: Segment; dmg: number }
  | { type: "burn"; target: Segment; dmg: number }
  | { type: "kill"; seg: Segment; coins: number }
  | { type: "bite"; seg: Segment; base: number }
  | { type: "summon"; cell: number }
  | { type: "merge"; from: number; to: number; level: number }
  | { type: "move"; from: number; to: number }
  | { type: "level"; level: number }
  | { type: "pick" }
  | { type: "picked"; element: Element }
  | { type: "bossSpawn" }
  | { type: "bossShed"; seg: Segment; coins: number }
  | { type: "bossDown"; seg: Segment }
  | { type: "over"; outcome: Outcome };

export type Suggestion = { kind: "merge"; from: number; to: number } | { kind: "summon" } | null;

export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sim {
  time = 0;
  phase: "run" | "pick" | "over" = "run";
  outcome: Outcome | null = null;
  board: (Unit | null)[] = Array.from({ length: CELLS }, () => null);
  coins = 100;
  xp = 0;
  level = 1;
  base = 1;
  element: Element | null = null;
  wave: Segment[] = [];
  bossTrain: Segment[] = [];
  boss = { spawned: false, hp: 0, maxHp: 0, alive: false, taken: 0, diedAt: 0 };
  summons = 0;
  private rng: (() => number);
  private nextId = 1;
  private events: SimEvent[] = [];

  constructor(readonly settings: Settings, seed = 7) {
    this.rng = makeRng(seed);
    this.board[0] = { level: 1, cd: 0.1 };
    this.board[1] = { level: 1, cd: 0.38 };
    const start = settings.rush ? LENGTH * 0.42 : 0;
    for (let i = 0; i < WAVE; i++) {
      const hp = 420 + i * 16;
      this.wave.push(this.segment(start - i * GAP, hp, false));
    }
  }

  private segment(s: number, hp: number, boss: boolean): Segment {
    return { id: this.nextId++, s, hp, maxHp: hp, boss, burn: 0, burnDps: 0, burnTick: 0 };
  }

  get damageMul() {
    return this.level >= 3 ? LV3_BONUS : 1;
  }

  get speedMul() {
    return this.element === "water" ? SLOW : 1;
  }

  /** The board's expected damage per second, counting crits and the element. Used to size the boss. */
  dps(): number {
    let sum = 0;
    for (const u of this.board) if (u) sum += DAMAGE[u.level] / FIRE_EVERY;
    let k = this.damageMul * (1 + CRIT_CHANCE * (CRIT_MUL - 1));
    if (this.element === "flash") k *= 1 + CHAIN * CHAIN_SHARE;
    if (this.element === "fire") k *= 1 + BURN_SHARE * BURN_TIME;
    return sum * k;
  }

  /** How far along the road the boss's head is, 0..1. */
  get bossProgress() {
    const head = this.bossTrain[0];
    return head ? Math.min(1, Math.max(0, head.s / LENGTH)) : 0;
  }

  /** Board actions return false when they do nothing. */
  summon(): boolean {
    if (this.phase === "over" || this.coins < SUMMON_COST) return false;
    const empty = this.board.flatMap((u, i) => (u ? [] : [i]));
    if (!empty.length) return false;
    const cell = empty[Math.floor(this.rng() * empty.length)];
    this.board[cell] = { level: 1, cd: FIRE_EVERY * this.rng() };
    this.coins -= SUMMON_COST;
    this.summons++;
    this.events.push({ type: "summon", cell });
    return true;
  }

  canMerge(from: number, to: number) {
    const a = this.board[from];
    const b = this.board[to];
    return from !== to && !!a && !!b && a.level === b.level && a.level < MAX_LEVEL;
  }

  move(from: number, to: number): boolean {
    if (this.phase === "over" || from === to || !this.board[from]) return false;
    if (this.canMerge(from, to)) {
      const b = this.board[to]!;
      b.level++;
      b.cd = 0.05;
      this.board[from] = null;
      this.events.push({ type: "merge", from, to, level: b.level });
      return true;
    }
    if (!this.board[to]) {
      this.board[to] = this.board[from];
      this.board[from] = null;
      this.events.push({ type: "move", from, to });
      return true;
    }
    return false;
  }

  /** What an idle player would be shown (and, after a while, have done for them): the lowest merge first, else a summon. */
  suggest(): Suggestion {
    let best: Suggestion = null;
    let bestLevel = 99;
    for (let i = 0; i < CELLS; i++)
      for (let j = i + 1; j < CELLS; j++)
        if (this.canMerge(i, j) && this.board[i]!.level < bestLevel) {
          bestLevel = this.board[i]!.level;
          best = { kind: "merge", from: i, to: j };
        }
    if (best) return best;
    if (this.coins >= SUMMON_COST && this.board.some((u) => !u)) return { kind: "summon" };
    return null;
  }

  choose(element: Element) {
    if (this.phase !== "pick") return;
    this.element = element;
    this.phase = "run";
    this.events.push({ type: "picked", element });
  }

  tick(dt: number): SimEvent[] {
    if (this.phase === "run") this.step(dt);
    const out = this.events;
    this.events = [];
    return out;
  }

  private step(dt: number) {
    this.time += dt;
    this.advance(this.wave, SPEED * this.speedMul, GAP, dt);
    const tail = this.wave[this.wave.length - 1];
    if (this.boss.alive) this.advance(this.bossTrain, BOSS_SPEED * this.speedMul, BOSS_GAP, dt, tail ? tail.s - BOSS_GAP : Infinity);
    this.bites();
    if (this.phase !== "run") return;
    if (!this.boss.spawned && this.time >= BOSS_AT && this.element) this.spawnBoss();
    this.shoot(dt);
    this.burns(dt);
    if (this.boss.alive) this.pinBoss();
  }

  /** The head moves at the train's speed; followers keep their gap and run faster to close the holes kills leave. */
  private advance(train: Segment[], speed: number, gap: number, dt: number, limit = Infinity) {
    for (let i = 0; i < train.length; i++) {
      const seg = train[i];
      if (i === 0) seg.s = Math.min(limit, seg.s + speed * dt);
      else seg.s = Math.min(train[i - 1].s - gap, seg.s + speed * 1.8 * dt);
    }
  }

  private bites() {
    while (this.wave.length && this.wave[0].s >= LENGTH) {
      const seg = this.wave.shift()!;
      // a regular snake never takes the tower down: that is the boss's job in variant b
      this.base = Math.max(this.settings.outcome === "win" ? 0.25 : 0.2, this.base - BITE);
      this.events.push({ type: "bite", seg, base: this.base });
    }
    const head = this.bossTrain[0];
    if (this.boss.alive && head && head.s >= LENGTH) {
      this.base = 0;
      this.events.push({ type: "bite", seg: head, base: 0 });
      this.finish("close");
    }
  }

  /** The boss's head once it is out of the portal; otherwise the snake's head. What is left of the
   *  first snake meanwhile gets through and bites the tower: that is the tension of the boss fight. */
  private target(): Segment | null {
    const boss = this.bossTrain[0];
    if (boss && boss.s >= 0) return boss;
    const head = this.wave[0];
    return head && head.s >= 0 ? head : null;
  }

  private shoot(dt: number) {
    for (let cell = 0; cell < CELLS; cell++) {
      const u = this.board[cell];
      if (!u) continue;
      u.cd -= dt;
      if (u.cd > 0) continue;
      const target = this.target();
      if (!target) {
        u.cd = 0;
        continue;
      }
      u.cd += FIRE_EVERY;
      const crit = this.rng() < CRIT_CHANCE;
      const dmg = Math.round(DAMAGE[u.level] * this.damageMul * (crit ? CRIT_MUL : 1));
      this.events.push({ type: "shot", cell, target, dmg, crit });
      this.hurt(target, dmg);
      if (this.element === "flash") {
        // the bolt jumps to the next segments of the same train
        const train = target.boss ? this.bossTrain : this.wave;
        let from = target;
        for (let k = 1; k <= CHAIN; k++) {
          const to = train[train.indexOf(target) + k] ?? null;
          if (!to || to.s < 0) break;
          const d = Math.round(dmg * CHAIN_SHARE);
          this.events.push({ type: "chain", from, to, dmg: d });
          this.hurt(to, d);
          from = to;
        }
      }
      if (this.element === "fire" && this.alive(target)) {
        target.burn = BURN_TIME;
        target.burnDps = Math.max(target.burnDps, dmg * BURN_SHARE);
      }
      if (this.phase !== "run") return;
    }
  }

  private burns(dt: number) {
    for (const train of [this.wave, this.bossTrain])
      for (const seg of [...train]) {
        if (seg.burn <= 0) continue;
        seg.burn -= dt;
        seg.burnTick += dt;
        if (seg.burnTick >= BURN_TICK) {
          const dmg = Math.round(seg.burnDps * seg.burnTick);
          seg.burnTick = 0;
          this.events.push({ type: "burn", target: seg, dmg });
          this.hurt(seg, dmg);
        }
        if (seg.burn <= 0) seg.burnDps = 0;
      }
  }

  private alive(seg: Segment) {
    return seg.boss ? this.boss.alive && this.bossTrain.includes(seg) : this.wave.includes(seg);
  }

  private hurt(seg: Segment, dmg: number) {
    if (!this.alive(seg)) return;
    if (seg.boss) {
      this.boss.hp -= dmg;
      this.boss.taken += dmg;
      this.shed();
      return;
    }
    seg.hp -= dmg;
    if (seg.hp > 0) return;
    this.wave.splice(this.wave.indexOf(seg), 1);
    this.coins += KILL_COINS;
    this.events.push({ type: "kill", seg, coins: KILL_COINS });
    this.gainXp();
  }

  /** The boss loses a tail segment for every tenth of its health; at zero the head goes too. */
  private shed() {
    if (this.boss.hp <= 0) {
      this.boss.hp = 0;
      this.boss.alive = false;
      this.boss.diedAt = this.bossProgress;
      const head = this.bossTrain[0];
      for (const seg of this.bossTrain.slice(1).reverse()) this.events.push({ type: "bossShed", seg, coins: SHED_COINS });
      this.bossTrain = [];
      this.coins += SHED_COINS * 6;
      this.events.push({ type: "bossDown", seg: head });
      // the rest of the first snake falls apart with its master
      for (const seg of this.wave) this.events.push({ type: "kill", seg, coins: KILL_COINS });
      this.coins += KILL_COINS * this.wave.length;
      this.wave = [];
      this.finish("win");
      return;
    }
    const keep = Math.max(1, Math.ceil((this.boss.hp / this.boss.maxHp) * BOSS_SEGMENTS));
    while (this.bossTrain.length > keep) {
      const seg = this.bossTrain.pop()!;
      this.coins += SHED_COINS;
      this.events.push({ type: "bossShed", seg, coins: SHED_COINS });
      this.gainXp();
    }
  }

  private gainXp() {
    this.xp++;
    if (this.level === 1 && this.xp >= XP_LV2) {
      this.level = 2;
      this.events.push({ type: "level", level: 2 });
      this.phase = "pick";
      this.events.push({ type: "pick" });
    } else if (this.level === 2 && this.xp >= XP_LV3) {
      this.level = 3;
      this.events.push({ type: "level", level: 3 });
    }
  }

  private spawnBoss() {
    // what the board deals while the boss walks the road: win sizes it to die by 3/4 of the way
    // with no more merges, close to survive the whole road with health to spare
    const time = LENGTH / (BOSS_SPEED * this.speedMul);
    const damage = this.dps() * time;
    const hp = Math.round(Math.max(4000, damage * (this.settings.outcome === "win" ? 0.75 : 1.1)) / 100) * 100;
    this.boss = { spawned: true, hp, maxHp: hp, alive: true, taken: 0, diedAt: 0 };
    const tail = this.wave[this.wave.length - 1];
    const start = Math.min(0, tail ? tail.s - BOSS_GAP : 0);
    for (let i = 0; i < BOSS_SEGMENTS; i++) this.bossTrain.push(this.segment(start - i * BOSS_GAP, hp, true));
    this.events.push({ type: "bossSpawn" });
  }

  /** The scripted part: health stays under a line that reaches zero at WIN_BY (win), or above one ending at CLOSE_LEFT (close). */
  private pinBoss() {
    const p = this.bossProgress;
    const { maxHp } = this.boss;
    if (this.settings.outcome === "win") {
      const ceiling = maxHp * Math.max(0, 1 - p / WIN_BY);
      if (this.boss.hp > ceiling) {
        this.boss.hp = Math.max(ceiling, 0);
        if (this.boss.hp <= 0) this.boss.hp = 0.0001;
        this.shed();
        if (p >= WIN_BY && this.boss.alive) {
          this.boss.hp = 0;
          this.shed();
        }
      }
    } else {
      this.boss.hp = Math.max(this.boss.hp, maxHp * (1 - (1 - CLOSE_LEFT) * p));
    }
  }

  private finish(outcome: Outcome) {
    if (this.phase === "over") return;
    this.phase = "over";
    this.outcome = outcome;
    this.events.push({ type: "over", outcome });
  }
}
