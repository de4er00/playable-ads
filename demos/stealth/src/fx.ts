import { Container, Graphics } from "pixi.js";
import { makeCoin } from "./art";

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
}

interface Flyer {
  g: Graphics;
  from: { x: number; y: number };
  t: number;
  delay: number;
  arc: number;
  done: boolean;
}

/** Dust puffs live in the world; coins fly from the world into the HUD counter. */
export class Fx {
  private puffs: Particle[] = [];
  private flyers: Flyer[] = [];

  constructor(private world: Container, private screen: Container) {}

  dust(x: number, y: number, count = 10, color = 0xf4ead2) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 60 + Math.random() * 120;
      const g = new Graphics().circle(0, 0, 8 + Math.random() * 8).fill({ color, alpha: 0.85 });
      g.position.set(x, y);
      this.world.addChild(g);
      this.puffs.push({ g, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0, max: 0.45 + Math.random() * 0.3, grow: 1.6 });
    }
  }

  /** Coins burst out of a world point and arc into the HUD target (screen coordinates). */
  coins(worldX: number, worldY: number, count: number, onArrive: () => void) {
    const start = this.world.toGlobal({ x: worldX, y: worldY });
    for (let i = 0; i < count; i++) {
      const g = makeCoin(14);
      g.position.set(start.x, start.y);
      this.screen.addChild(g);
      this.flyers.push({ g, from: { x: start.x, y: start.y }, t: 0, delay: i * 0.07, arc: (Math.random() - 0.5) * 220, done: false });
    }
    this.onArrive = onArrive;
  }

  private onArrive: () => void = () => {};

  update(dt: number, target: { x: number; y: number }) {
    for (const p of this.puffs) {
      p.life += dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.vx *= Math.pow(0.05, dt);
      p.vy *= Math.pow(0.05, dt);
      const k = p.life / p.max;
      p.g.scale.set(1 + k * p.grow);
      p.g.alpha = 1 - k;
    }
    this.puffs = this.puffs.filter((p) => {
      if (p.life < p.max) return true;
      p.g.destroy();
      return false;
    });
    for (const f of this.flyers) {
      if (f.done) continue;
      f.t += dt;
      const k = Math.min(1, Math.max(0, (f.t - f.delay) / 0.7));
      const e = k * k * (3 - 2 * k);
      // out-and-up first, then into the counter
      const midX = (f.from.x + target.x) / 2 + f.arc;
      const midY = Math.min(f.from.y, target.y) - 160;
      const x = (1 - e) * (1 - e) * f.from.x + 2 * (1 - e) * e * midX + e * e * target.x;
      const y = (1 - e) * (1 - e) * f.from.y + 2 * (1 - e) * e * midY + e * e * target.y;
      f.g.position.set(x, y);
      f.g.scale.set(1 + Math.sin(e * Math.PI) * 0.5);
      f.g.rotation = e * 8;
      if (k >= 1) {
        f.done = true;
        f.g.destroy();
        this.onArrive();
      }
    }
    this.flyers = this.flyers.filter((f) => !f.done);
  }
}
