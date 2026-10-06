// Level geometry and line of sight. Pure functions: the same polygon is drawn and used for detection.

export interface Vec {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Cone {
  x: number;
  y: number;
  angle: number;
  halfAngle: number;
  reach: number;
}

const WORLD = { w: 720, h: 960 };
const WALL = 24;

export const LEVEL = {
  world: WORLD,
  wall: WALL,
  room: { x: WALL, y: WALL, w: WORLD.w - 2 * WALL, h: WORLD.h - 2 * WALL } as Rect,
  hero: { x: 360, y: 860 },
  guard: { x: 430, y: 330 },
  // A column of crates along the left wall: the only way past the flashlight.
  crates: [
    { x: 112, y: 236, w: 92, h: 92 },
    { x: 112, y: 334, w: 92, h: 92 },
    { x: 112, y: 432, w: 92, h: 92 },
    { x: 112, y: 530, w: 92, h: 92 },
  ] as Rect[],
  // The hint the hand traces after the first failure: up the corridor, then across to the guard's back.
  safeRoute: [
    { x: 360, y: 860 },
    { x: 200, y: 760 },
    { x: 70, y: 660 },
    { x: 66, y: 400 },
    { x: 80, y: 200 },
    { x: 260, y: 170 },
    { x: 420, y: 262 },
  ] as Vec[],
  takedownRange: 78,
  difficulty: {
    normal: { sweepPeriod: 2.8, sweepArc: 0.5, halfAngle: 0.5, reach: 400 },
    hard: { sweepPeriod: 2.0, sweepArc: 0.55, halfAngle: 0.56, reach: 440 },
  },
};

export type Difficulty = (typeof LEVEL.difficulty)["normal"];

/** The guard looks down the room and sweeps the flashlight left and right. phase is 0..1 of a sweep. */
export function coneAt(phase: number, d: Difficulty): Cone {
  const angle = Math.PI / 2 + Math.sin(phase * Math.PI * 2) * d.sweepArc;
  return { x: LEVEL.guard.x, y: LEVEL.guard.y, angle, halfAngle: d.halfAngle, reach: d.reach };
}

/** Distance along a ray from o in direction (dx, dy) to the first crate or the room wall. */
export function castRay(o: Vec, dx: number, dy: number, maxDist: number, crates: Rect[]): number {
  let best = Math.min(maxDist, rayRectExit(o, dx, dy, LEVEL.room));
  for (const r of crates) {
    const t = rayRectEnter(o, dx, dy, r);
    if (t !== null && t < best) best = t;
  }
  return best;
}

export function visionPolygon(cone: Cone, crates: Rect[], rays = 64): Vec[] {
  const pts: Vec[] = [{ x: cone.x, y: cone.y }];
  for (let i = 0; i <= rays; i++) {
    const a = cone.angle - cone.halfAngle + (2 * cone.halfAngle * i) / rays;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = castRay(cone, dx, dy, cone.reach, crates);
    pts.push({ x: cone.x + dx * t, y: cone.y + dy * t });
  }
  return pts;
}

/** Inside the flashlight's reach and angle, with no crate in between. */
export function seen(p: Vec, cone: Cone, crates: Rect[]): boolean {
  return insidePolygon(p, visionPolygon(cone, crates, 64));
}

export function insidePolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function behind(p: Vec, guard: Vec, facing: number): boolean {
  return (p.x - guard.x) * Math.cos(facing) + (p.y - guard.y) * Math.sin(facing) < 0;
}

export function pathLength(path: Vec[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return s;
}

/** Point at distance s along a path, plus the heading there. */
export function pointAlong(path: Vec[], s: number): { p: Vec; heading: number; done: boolean } {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= len && len > 0) {
      const k = s / len;
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, heading: Math.atan2(b.y - a.y, b.x - a.x), done: false };
    }
    s -= len;
  }
  const n = path.length;
  const last = path[n - 1];
  const prev = path[Math.max(0, n - 2)];
  return { p: { ...last }, heading: Math.atan2(last.y - prev.y, last.x - prev.x), done: true };
}

/** Keep a drawn point inside the room and out of the crates. */
export function clampToFloor(p: Vec, radius = 28): Vec {
  const r = LEVEL.room;
  let x = Math.min(Math.max(p.x, r.x + radius), r.x + r.w - radius);
  let y = Math.min(Math.max(p.y, r.y + radius), r.y + r.h - radius);
  for (const c of LEVEL.crates) {
    if (x > c.x - radius && x < c.x + c.w + radius && y > c.y - radius && y < c.y + c.h + radius) {
      // push out along the shallowest axis
      const left = x - (c.x - radius);
      const right = c.x + c.w + radius - x;
      const up = y - (c.y - radius);
      const down = c.y + c.h + radius - y;
      const m = Math.min(left, right, up, down);
      if (m === left) x = c.x - radius;
      else if (m === right) x = c.x + c.w + radius;
      else if (m === up) y = c.y - radius;
      else y = c.y + c.h + radius;
    }
  }
  return { x, y };
}

function rayRectEnter(o: Vec, dx: number, dy: number, r: Rect): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const [p, d, lo, hi] of [
    [o.x, dx, r.x, r.x + r.w],
    [o.y, dy, r.y, r.y + r.h],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return null;
    } else {
      const t1 = (lo - p) / d;
      const t2 = (hi - p) / d;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
  }
  if (tmax < Math.max(tmin, 0)) return null;
  return tmin >= 0 ? tmin : null;
}

function rayRectExit(o: Vec, dx: number, dy: number, r: Rect): number {
  const tx = dx > 0 ? (r.x + r.w - o.x) / dx : dx < 0 ? (r.x - o.x) / dx : Infinity;
  const ty = dy > 0 ? (r.y + r.h - o.y) / dy : dy < 0 ? (r.y - o.y) / dy : Infinity;
  return Math.max(0, Math.min(tx, ty));
}
