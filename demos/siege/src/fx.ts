// Effects. Everything spawned in numbers is instanced: bolts, debris, coins. Flashes, chain beads and
// flames are pooled additive sprites. Rings are flat meshes on the ground for summons, merges and bites.
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  RingGeometry,
  type Scene,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector3,
} from "three";
import { coin } from "./models";

const m4 = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s = new Vector3();
const axis = new Vector3();
const color = new Color();
const UP = new Vector3(0, 1, 0);

interface Bolt {
  from: Vector3;
  to: Vector3;
  t: number;
  dur: number;
  color: number;
  size: number;
  done: () => void;
}

interface Piece {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  spin: number;
  size: number;
  life: number;
  max: number;
  color: number;
}

interface Flash {
  sprite: Sprite;
  life: number;
  max: number;
  size: number;
  rise: number;
}

interface Coin {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
}

interface Ring {
  mesh: Mesh;
  life: number;
  max: number;
  size: number;
}

export class Fx {
  private bolts: Bolt[] = [];
  private boltMesh: InstancedMesh;
  private debris: InstancedMesh;
  private coins: InstancedMesh;
  private pieces: Piece[] = [];
  private flashes: Flash[] = [];
  private flashPool: Sprite[] = [];
  private coinList: Coin[] = [];
  private rings: Ring[] = [];
  /** Coins hand over to the 2D layer after their hop: world position of each collected coin. */
  onCoin: (x: number, y: number, z: number) => void = () => {};

  constructor(private scene: Scene, private glowTex: Texture) {
    const boltGeo = new OctahedronGeometry(0.16, 0);
    boltGeo.scale(1, 2.6, 1);
    this.boltMesh = new InstancedMesh(boltGeo, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 200);
    this.debris = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }), 500);
    this.coins = new InstancedMesh(coin(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.8, emissive: 0x3a2400 }), 120);
    for (const im of [this.boltMesh, this.debris, this.coins]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
    this.boltMesh.setColorAt(0, color.set(0xffffff));
    this.debris.setColorAt(0, color.set(0xffffff));
  }

  /** A magic bolt flying from a crystal to its target; done() fires on impact. */
  bolt(from: Vector3, to: Vector3, tint: number, size: number, done: () => void) {
    if (this.bolts.length >= 200) {
      done();
      return;
    }
    const dur = Math.min(0.24, 0.07 + from.distanceTo(to) * 0.012);
    this.bolts.push({ from: from.clone(), to: to.clone(), t: 0, dur, color: tint, size, done });
  }

  /** Bright sprite that grows and fades: muzzle glow, hit star, flame puff. */
  flash(x: number, y: number, z: number, tint: number, size: number, max = 0.18, rise = 0) {
    if (this.flashes.length > 220) return;
    const sprite = this.flashPool.pop() ?? new Sprite(new SpriteMaterial({ map: this.glowTex, blending: AdditiveBlending, transparent: true, depthWrite: false }));
    sprite.material.color.set(tint);
    sprite.position.set(x, y, z);
    sprite.visible = true;
    this.scene.add(sprite);
    this.flashes.push({ sprite, life: 0, max, size, rise });
  }

  /** Chain lightning: a jagged line of bright beads between two points, with a star at each end. */
  chain(a: Vector3, b: Vector3, tint: number) {
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const jag = i === 0 || i === n ? 0 : 0.35;
      this.flash(a.x + (b.x - a.x) * k + (Math.random() - 0.5) * jag, a.y + (b.y - a.y) * k + (Math.random() - 0.5) * jag, a.z + (b.z - a.z) * k + (Math.random() - 0.5) * jag, i % 2 ? 0xffffff : tint, 0.55, 0.16);
    }
    this.flash(b.x, b.y, b.z, tint, 1.6, 0.2);
  }

  /** Chunks with gravity and a bounce on the ground. */
  burst(x: number, y: number, z: number, tint: number, count: number, size = 0.16, power = 4.5) {
    for (let i = 0; i < count && this.pieces.length < 500; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.4 + Math.random() * 0.8);
      this.pieces.push({
        x, y, z,
        vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * power, vz: Math.sin(a) * sp,
        rx: Math.random() * 6, spin: (Math.random() - 0.5) * 18,
        size: size * (0.5 + Math.random()), life: 0, max: 1.0 + Math.random() * 0.6, color: tint,
      });
    }
  }

  coinDrop(x: number, z: number, count = 1) {
    for (let i = 0; i < count && this.coinList.length < 120; i++) {
      const a = Math.random() * Math.PI * 2;
      this.coinList.push({ x, y: 0.6, z, vx: Math.cos(a) * 1.4, vy: 4.5 + Math.random() * 2.5, vz: Math.sin(a) * 1.4, spin: 8 + Math.random() * 8, life: -i * 0.05 });
    }
  }

  /** Flat ring on the ground. */
  ring(x: number, z: number, tint: number, size: number, max = 0.5) {
    const mesh = new Mesh(new RingGeometry(0.8, 1, 48), new MeshBasicMaterial({ color: tint, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.32, z);
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 0, max, size });
  }

  update(dt: number) {
    let nb = 0;
    for (const b of this.bolts) {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      v.lerpVectors(b.from, b.to, k);
      v.y += Math.sin(k * Math.PI) * 0.6;
      axis.subVectors(b.to, b.from).normalize();
      q.setFromUnitVectors(UP, axis);
      m4.compose(v, q, s.setScalar(b.size));
      this.boltMesh.setMatrixAt(nb, m4);
      this.boltMesh.setColorAt(nb, color.set(b.color));
      nb++;
      if (Math.random() < 0.5) this.flash(v.x, v.y, v.z, b.color, 0.5 * b.size, 0.12);
    }
    for (const b of this.bolts) if (b.t >= b.dur) b.done();
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
    this.boltMesh.count = nb;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    if (this.boltMesh.instanceColor) this.boltMesh.instanceColor.needsUpdate = true;

    let nd = 0;
    for (const p of this.pieces) {
      p.life += dt;
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.size * 0.5) {
        p.y = p.size * 0.5;
        p.vy = Math.abs(p.vy) * 0.3;
        p.vx *= 0.55;
        p.vz *= 0.55;
        p.spin *= 0.5;
      }
      p.rx += p.spin * dt;
      const fade = p.life > p.max - 0.3 ? Math.max(0, (p.max - p.life) / 0.3) : 1;
      q.setFromAxisAngle(axis.set(0.6, 0.8, 0.2).normalize(), p.rx);
      m4.compose(v.set(p.x, p.y, p.z), q, s.setScalar(p.size * fade));
      this.debris.setMatrixAt(nd, m4);
      this.debris.setColorAt(nd, color.set(p.color));
      nd++;
    }
    this.pieces = this.pieces.filter((p) => p.life < p.max);
    this.debris.count = nd;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;

    let nc = 0;
    for (const c of this.coinList) {
      c.life += dt;
      if (c.life < 0) continue;
      c.vy -= 20 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      if (c.y < 0.2) {
        c.y = 0.2;
        c.vy = Math.abs(c.vy) * 0.35;
        c.vx *= 0.5;
        c.vz *= 0.5;
      }
      q.setFromAxisAngle(UP, c.life * c.spin);
      m4.compose(v.set(c.x, c.y, c.z), q, s.setScalar(1.1));
      this.coins.setMatrixAt(nc++, m4);
    }
    // after a short hop each coin is picked up by the 2D layer
    for (const c of this.coinList) if (c.life > 0.5) this.onCoin(c.x, c.y, c.z);
    this.coinList = this.coinList.filter((c) => c.life <= 0.5);
    this.coins.count = nc;
    this.coins.instanceMatrix.needsUpdate = true;

    for (const f of this.flashes) {
      f.life += dt;
      const k = Math.min(1, f.life / f.max);
      f.sprite.scale.setScalar(f.size * (0.4 + k * 0.8));
      f.sprite.position.y += f.rise * dt;
      f.sprite.material.opacity = 1 - k * k;
    }
    this.flashes = this.flashes.filter((f) => {
      if (f.life < f.max) return true;
      this.scene.remove(f.sprite);
      this.flashPool.push(f.sprite);
      return false;
    });

    for (const r of this.rings) {
      r.life += dt;
      const k = Math.min(1, r.life / r.max);
      r.mesh.scale.setScalar(0.3 + k * r.size);
      (r.mesh.material as MeshBasicMaterial).opacity = 1 - k;
    }
    this.rings = this.rings.filter((r) => {
      if (r.life < r.max) return true;
      this.scene.remove(r.mesh);
      (r.mesh.material as MeshBasicMaterial).dispose();
      r.mesh.geometry.dispose();
      return false;
    });
  }
}
