import { type Group, type Mesh, type MeshBasicMaterial, type Scene } from "three";
import { chunk, puff } from "./models";

interface Debris {
  m: Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
}
interface Puff {
  m: Mesh;
  life: number;
  max: number;
  grow: number;
  rise: number;
}

/** Debris with gravity and a ground bounce, and expanding puffs for blasts and smoke. */
export class Fx {
  private debris: Debris[] = [];
  private puffs: Puff[] = [];

  constructor(private scene: Scene) {}

  shatter(x: number, z: number, color: number, count: number, size: number, power = 5) {
    for (let i = 0; i < count; i++) {
      const m = chunk(color, size * (0.6 + Math.random() * 0.6));
      m.position.set(x + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.5 + Math.random() * 0.6);
      this.debris.push({ m, vx: Math.cos(a) * s, vy: 4 + Math.random() * power, vz: Math.sin(a) * s, spin: (Math.random() - 0.5) * 14, life: 0 });
    }
  }

  blast(x: number, z: number, scale = 1) {
    const colors = [0xfff3b0, 0xffb03a, 0xff6a2a, 0x6b6b6b, 0x9a9a9a];
    for (let i = 0; i < 9; i++) {
      const m = puff(colors[Math.min(colors.length - 1, Math.floor(i / 2))]);
      m.position.set(x + (Math.random() - 0.5) * scale, 0.5 + Math.random() * 0.6 * scale, z + (Math.random() - 0.5) * scale);
      m.scale.setScalar(0.2 * scale);
      this.scene.add(m);
      this.puffs.push({ m, life: -i * 0.03, max: 0.55 + i * 0.05, grow: (1.4 + Math.random()) * scale, rise: 0.8 + i * 0.15 });
    }
  }

  spark(x: number, z: number) {
    const m = puff(0xfff3b0);
    m.position.set(x, 0.75, z);
    m.scale.setScalar(0.15);
    this.scene.add(m);
    this.puffs.push({ m, life: 0, max: 0.18, grow: 0.7, rise: 0 });
  }

  update(dt: number) {
    for (const d of this.debris) {
      d.life += dt;
      d.vy -= 18 * dt;
      d.m.position.x += d.vx * dt;
      d.m.position.y += d.vy * dt;
      d.m.position.z += d.vz * dt;
      if (d.m.position.y < 0.1) {
        d.m.position.y = 0.1;
        d.vy = Math.abs(d.vy) * 0.35;
        d.vx *= 0.6;
        d.vz *= 0.6;
        d.spin *= 0.6;
      }
      d.m.rotation.x += d.spin * dt;
      d.m.rotation.z += d.spin * 0.7 * dt;
      if (d.life > 2.2) d.m.scale.multiplyScalar(Math.pow(0.02, dt));
    }
    this.debris = this.debris.filter((d) => {
      if (d.life < 3) return true;
      this.scene.remove(d.m);
      return false;
    });
    for (const p of this.puffs) {
      p.life += dt;
      if (p.life < 0) continue;
      const k = Math.min(1, p.life / p.max);
      p.m.scale.setScalar(0.2 + k * p.grow);
      p.m.position.y += p.rise * dt;
      (p.m.material as MeshBasicMaterial).opacity = 1 - k * k;
    }
    this.puffs = this.puffs.filter((p) => {
      if (p.life < p.max) return true;
      this.scene.remove(p.m);
      return false;
    });
  }
}

/** Short kick back along the barrel and a squash of the hull. */
export function recoil(barrel: Group, t: number) {
  barrel.position.x = -0.22 * Math.max(0, 1 - t / 0.15);
}
