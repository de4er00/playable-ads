// Everything on screen is drawn here from shapes; the build carries no image files.
import { Container, Graphics, Text } from "pixi.js";
import type { Rect, Vec } from "./level";
import { LEVEL } from "./level";

export const COLORS = {
  bg: 0x1d1830,
  tileA: 0xd9c7a1,
  tileB: 0xcfbb92,
  grout: 0xb9a57d,
  wall: 0x3b2f4a,
  wallTop: 0x5a4870,
  crate: 0xc08a45,
  crateDark: 0x7d5223,
  crateLight: 0xdcaa62,
  hero: 0x4b2e83,
  heroDark: 0x2a1a4b,
  band: 0xe63946,
  guard: 0x2f5da8,
  guardDark: 0x1e2d4f,
  skin: 0xf2c29b,
  light: 0xffe680,
  alarm: 0xff5050,
  gold: 0xffc83d,
  goldDark: 0xd99a14,
  cta: 0x3cc24f,
  ctaDark: 0x22862f,
};

// Deterministic per-tile variation, so the floor looks worn the same way on every load.
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function mix(a: number, b: number, t: number): number {
  const ch = (c: number, shift: number) => (c >> shift) & 255;
  const lerp = (shift: number) => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * t);
  return (lerp(16) << 16) | (lerp(8) << 8) | lerp(0);
}

export function drawRoom(): Container {
  const root = new Container();
  const g = new Graphics();
  const { world, wall, room } = LEVEL;
  g.rect(0, 0, world.w, world.h).fill(COLORS.wall);
  const size = 48;
  for (let y = room.y; y < room.y + room.h; y += size) {
    for (let x = room.x; x < room.x + room.w; x += size) {
      const base = ((x - room.x) / size + (y - room.y) / size) % 2 === 0 ? COLORS.tileA : COLORS.tileB;
      const n = hash(x, y);
      const tone = n < 0.5 ? mix(base, 0xffffff, (0.5 - n) * 0.12) : mix(base, 0x000000, (n - 0.5) * 0.1);
      g.rect(x, y, Math.min(size, room.x + room.w - x), Math.min(size, room.y + room.h - y)).fill(tone);
      if (n > 0.86) g.circle(x + 10 + n * 20, y + 12 + n * 18, 2 + n * 3).fill({ color: COLORS.grout, alpha: 0.5 });
    }
  }
  for (let x = room.x; x <= room.x + room.w; x += size) g.moveTo(x, room.y).lineTo(x, room.y + room.h);
  for (let y = room.y; y <= room.y + room.h; y += size) g.moveTo(room.x, y).lineTo(room.x + room.w, y);
  g.stroke({ width: 1.5, color: COLORS.grout, alpha: 0.55 });
  // wall caps with a lit inner edge
  g.rect(0, 0, world.w, wall).fill(COLORS.wallTop);
  g.rect(room.x, room.y, room.w, 6).fill({ color: 0x000000, alpha: 0.18 });
  g.rect(room.x, room.y, 6, room.h).fill({ color: 0x000000, alpha: 0.12 });
  root.addChild(g);
  root.addChild(drawVaultDoor(), drawProps());
  return root;
}

/** Decoration kept out of the flashlight's reach, so it never looks like cover that does not work. */
function drawProps(): Graphics {
  const g = new Graphics();
  // rug under the start
  g.roundRect(250, 790, 220, 120, 18).fill(0x8e3b46).stroke({ width: 6, color: 0x6a2833 });
  g.roundRect(266, 806, 188, 88, 12).stroke({ width: 3, color: 0xe2b35a, alpha: 0.8 });
  for (let i = 0; i < 9; i++) g.rect(258 + i * 24, 912, 4, 10).fill(0xe2b35a);
  for (const [x, y, s] of [
    [650, 880, 1],
    [70, 880, 0.85],
    [655, 90, 0.9],
  ]) {
    g.circle(x + 5, y + 7, 30 * s).fill({ color: 0x000000, alpha: 0.2 });
    g.circle(x, y, 26 * s).fill(0xb5653c).stroke({ width: 4, color: 0x7a3f22 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + s;
      g.ellipse(x + Math.cos(a) * 15 * s, y + Math.sin(a) * 15 * s, 14 * s, 8 * s).fill(k % 2 ? 0x3f9b4b : 0x4fb85b);
    }
    g.circle(x, y, 9 * s).fill(0x2f7d3a);
  }
  return g;
}

function drawVaultDoor(): Graphics {
  // The thing the guard protects, set into the top wall.
  const g = new Graphics();
  const cx = 560;
  g.roundRect(cx - 62, 2, 124, 40, 8).fill(0x6b7a8f).stroke({ width: 4, color: 0x2e3746 });
  g.circle(cx, 22, 13).fill(0x9aa7b8).stroke({ width: 3, color: 0x2e3746 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(cx, 22).lineTo(cx + Math.cos(a) * 11, 22 + Math.sin(a) * 11);
  }
  g.stroke({ width: 2, color: 0x2e3746 });
  return g;
}

export function drawCrates(crates: Rect[]): Graphics {
  const g = new Graphics();
  for (const c of crates) g.roundRect(c.x + 7, c.y + 9, c.w, c.h, 6).fill({ color: 0x000000, alpha: 0.22 });
  for (const c of crates) {
    const n = hash(c.x, c.y);
    const body = mix(COLORS.crate, COLORS.crateLight, n * 0.4);
    g.roundRect(c.x, c.y, c.w, c.h, 6).fill(body).stroke({ width: 5, color: COLORS.crateDark });
    const inset = 12;
    for (let k = 1; k < 4; k++) {
      const y = c.y + (c.h * k) / 4;
      g.moveTo(c.x + 6, y).lineTo(c.x + c.w - 6, y);
    }
    g.stroke({ width: 2, color: COLORS.crateDark, alpha: 0.55 });
    g.moveTo(c.x + inset, c.y + inset).lineTo(c.x + c.w - inset, c.y + c.h - inset).stroke({ width: 9, color: COLORS.crateDark });
    g.moveTo(c.x + inset, c.y + inset).lineTo(c.x + c.w - inset, c.y + c.h - inset).stroke({ width: 4, color: COLORS.crateLight });
    for (const [px, py] of [
      [c.x + 9, c.y + 9],
      [c.x + c.w - 9, c.y + 9],
      [c.x + 9, c.y + c.h - 9],
      [c.x + c.w - 9, c.y + c.h - 9],
    ]) g.circle(px, py, 3).fill(0x4a3016);
  }
  return g;
}

/** Top-down hero: hood, shoulders, two feet that step by distance walked, headband tails on springs. */
export class Hero {
  root = new Container();
  private body = new Container();
  private feet: Graphics[] = [];
  private tails = new Graphics();
  private chains: Vec[][] = [];
  private stride = 0;
  heading = -Math.PI / 2;
  squash = 0;

  constructor(parent: Container) {
    const shadow = new Graphics().ellipse(0, 8, 26, 20).fill({ color: 0x000000, alpha: 0.25 });
    this.root.addChild(shadow);
    for (const side of [-1, 1]) {
      const f = new Graphics().ellipse(0, 0, 7, 10).fill(COLORS.heroDark);
      f.x = side * 10;
      this.feet.push(f);
      this.body.addChild(f);
    }
    const torso = new Graphics().ellipse(0, 2, 21, 15).fill(COLORS.hero).stroke({ width: 3, color: COLORS.heroDark });
    const head = new Graphics()
      .circle(0, -1, 13)
      .fill(COLORS.heroDark)
      .rect(-13, -6, 26, 7)
      .fill(COLORS.band)
      .ellipse(0, -10, 6, 3)
      .fill({ color: 0xffffff, alpha: 0.15 });
    this.body.addChild(torso, head);
    this.root.addChild(this.body);
    this.root.scale.set(1.35);
    parent.addChild(this.tails, this.root);
    for (let i = 0; i < 2; i++) this.chains.push(Array.from({ length: 5 }, () => ({ x: 0, y: 0 })));
  }

  place(p: Vec) {
    this.root.position.set(p.x, p.y);
    for (const chain of this.chains) for (const q of chain) Object.assign(q, p);
  }

  /** moved: world units travelled this frame. */
  update(dt: number, moved: number) {
    this.stride += moved * 0.11;
    const step = moved > 0.01 ? Math.sin(this.stride) : 0;
    this.feet[0].y = step * 9;
    this.feet[1].y = -step * 9;
    const bob = Math.abs(step) * 0.05 + this.squash;
    this.body.scale.set(1 + bob, 1 - bob);
    this.body.rotation = this.heading + Math.PI / 2;
    this.squash *= Math.pow(0.02, dt);
    this.updateTails(dt);
  }

  private updateTails(dt: number) {
    const back = this.heading + Math.PI;
    const knot = {
      x: this.root.x + Math.cos(back) * 14,
      y: this.root.y + Math.sin(back) * 14,
    };
    this.tails.clear();
    this.chains.forEach((chain, k) => {
      const spread = (k === 0 ? -0.35 : 0.35) + Math.sin(performance.now() / 180 + k) * 0.15;
      chain[0] = { ...knot };
      for (let i = 1; i < chain.length; i++) {
        const prev = chain[i - 1];
        const want = { x: prev.x + Math.cos(back + spread) * 9, y: prev.y + Math.sin(back + spread) * 9 };
        const q = chain[i];
        const k2 = 1 - Math.pow(0.0005, dt);
        q.x += (want.x - q.x) * k2;
        q.y += (want.y - q.y) * k2;
        const d = Math.hypot(q.x - prev.x, q.y - prev.y) || 1;
        q.x = prev.x + ((q.x - prev.x) / d) * 9;
        q.y = prev.y + ((q.y - prev.y) / d) * 9;
      }
      for (let i = 1; i < chain.length; i++) {
        this.tails
          .moveTo(chain[i - 1].x, chain[i - 1].y)
          .lineTo(chain[i].x, chain[i].y)
          .stroke({ width: 8 - i * 1.3, color: COLORS.band, cap: "round" });
      }
    });
  }
}

export class Guard {
  root = new Container();
  private body = new Container();
  private alertBubble = new Container();
  private stars = new Graphics();
  facing = Math.PI / 2;
  private t = 0;
  knockedOut = false;
  private koTime = 0;

  constructor(parent: Container) {
    this.root.addChild(new Graphics().ellipse(0, 10, 36, 28).fill({ color: 0x000000, alpha: 0.25 }));
    for (const side of [-1, 1]) {
      const f = new Graphics().roundRect(-7, -9, 14, 20, 6).fill(0x161b26);
      f.position.set(side * 13, 10);
      this.body.addChild(f);
    }
    const torso = new Graphics()
      .ellipse(0, 2, 31, 22)
      .fill(COLORS.guard)
      .stroke({ width: 3, color: COLORS.guardDark })
      .rect(-31, 4, 62, 6)
      .fill(0x22252e);
    // arm reaching forward with the flashlight
    const arm = new Graphics()
      .roundRect(14, -26, 12, 24, 6)
      .fill(COLORS.guard)
      .stroke({ width: 2, color: COLORS.guardDark })
      .roundRect(15, -40, 10, 16, 3)
      .fill(0x3a3f4a)
      .rect(15, -42, 10, 4)
      .fill(COLORS.light);
    const head = new Graphics()
      .circle(0, -4, 16)
      .fill(COLORS.skin)
      .circle(0, -1, 14)
      .fill(COLORS.guardDark)
      .roundRect(-12, -22, 24, 9, 4)
      .fill(0x16203a)
      .circle(0, 0, 3)
      .fill(COLORS.light);
    this.body.addChild(torso, arm, head);
    this.root.addChild(this.body, this.stars);

    const bubble = new Graphics().circle(0, 0, 24).fill(0xffffff).stroke({ width: 4, color: 0x1b1b1b });
    bubble.poly([-8, 18, 8, 18, 0, 34]).fill(0xffffff);
    const mark = new Text({ text: "!", style: { fontFamily: "Arial Black, Arial, sans-serif", fontSize: 36, fontWeight: "900", fill: COLORS.alarm } });
    mark.anchor.set(0.5);
    this.alertBubble.addChild(bubble, mark);
    this.alertBubble.position.set(0, -78);
    this.alertBubble.scale.set(0);
    this.root.addChild(this.alertBubble);
    this.root.position.set(LEVEL.guard.x, LEVEL.guard.y);
    this.root.scale.set(1.3);
    parent.addChild(this.root);
  }

  alert() {
    this.alertBubble.scale.set(0.1);
  }

  calm() {
    this.alertBubble.scale.set(0);
  }

  knockOut() {
    this.knockedOut = true;
    this.koTime = 0;
  }

  update(dt: number) {
    this.t += dt;
    if (this.knockedOut) {
      this.koTime += dt;
      const k = Math.min(1, this.koTime / 0.35);
      this.body.rotation += dt * 18 * (1 - k);
      this.body.scale.set(1 + 0.25 * k, 1 - 0.45 * k);
      this.stars.clear();
      for (let i = 0; i < 3; i++) {
        const a = this.t * 4 + (i * Math.PI * 2) / 3;
        this.stars.star(Math.cos(a) * 30, -30 + Math.sin(a) * 10, 5, 8, 4).fill(COLORS.gold);
      }
      return;
    }
    const breathe = Math.sin(this.t * 2.2) * 0.02;
    this.body.scale.set(1 + breathe, 1 - breathe);
    this.body.rotation = this.facing + Math.PI / 2;
    const s = this.alertBubble.scale.x;
    if (s > 0 && s < 1) this.alertBubble.scale.set(Math.min(1, s + dt * 6) + Math.sin(s * Math.PI) * 0.25);
  }
}

/** The flashlight: the same polygon the detection uses (level.visionPolygon). */
export function drawCone(g: Graphics, poly: Vec[], alarm: boolean) {
  g.clear();
  const color = alarm ? COLORS.alarm : COLORS.light;
  g.poly(poly.flatMap((p) => [p.x, p.y])).fill({ color, alpha: alarm ? 0.38 : 0.3 });
  // brighter core near the lamp
  const o = poly[0];
  const core = poly.map((p, i) => (i === 0 ? p : { x: o.x + (p.x - o.x) * 0.55, y: o.y + (p.y - o.y) * 0.55 }));
  g.poly(core.flatMap((p) => [p.x, p.y])).fill({ color, alpha: 0.16 });
}

export function drawPath(g: Graphics, path: Vec[], color = 0xffffff) {
  g.clear();
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = (18 - acc) % 18; s < len; s += 18) {
      const k = s / len;
      g.circle(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 5).fill({ color, alpha: 0.95 });
    }
    acc = (acc + len) % 18;
  }
  if (path.length > 1) {
    const end = path[path.length - 1];
    g.circle(end.x, end.y, 11).stroke({ width: 4, color, alpha: 0.95 });
  }
}

/** White glove pointer; the fingertip is at (0, 0). */
export function makeHand(): Container {
  const c = new Container();
  const g = new Graphics()
    .roundRect(-9, -2, 18, 44, 9)
    .fill(0xffffff)
    .stroke({ width: 4, color: 0x222222 })
    .roundRect(-16, 26, 44, 40, 16)
    .fill(0xffffff)
    .stroke({ width: 4, color: 0x222222 })
    .roundRect(-9, -2, 18, 30, 9)
    .fill(0xffffff);
  c.addChild(g);
  return c;
}

export function makeCoin(r = 13): Graphics {
  return new Graphics()
    .circle(0, 0, r)
    .fill(COLORS.gold)
    .stroke({ width: 3, color: COLORS.goldDark })
    .circle(0, 0, r * 0.6)
    .stroke({ width: 2, color: COLORS.goldDark, alpha: 0.6 })
    .ellipse(-r * 0.35, -r * 0.4, r * 0.25, r * 0.15)
    .fill({ color: 0xffffff, alpha: 0.7 });
}
