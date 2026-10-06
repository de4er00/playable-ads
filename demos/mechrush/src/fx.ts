// Effects. Everything that is spawned in numbers is instanced: tracers, debris, nuts. Flashes and smoke are
// pooled sprites. Rings are flat meshes on the road for slams and level-ups.
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  type Scene,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector3,
} from "three";
import { nut } from "./models";
import type { Sim } from "./sim";

const m4 = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s = new Vector3();
const e = new Vector3();
const color = new Color();

interface Piece {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
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

interface Nut {
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
  private tracers: InstancedMesh;
  private rockets: InstancedMesh;
  private debris: InstancedMesh;
  private nuts: InstancedMesh;
  private pieces: Piece[] = [];
  private flashes: Flash[] = [];
  private flashPool: Sprite[] = [];
  private nutList: Nut[] = [];
  private rings: Ring[] = [];
  /** Nuts hand over to the 2D layer after landing: world position of each collected nut. */
  onNut: (x: number, y: number, z: number) => void = () => {};
  private tracerScale = 1;

  /** Twin barrel: heavier, golden tracers for the rest of the run. */
  goldTracers() {
    this.tracerScale = 1.8;
    (this.tracers.material as MeshBasicMaterial).color.set(0xffd34a);
  }

  constructor(private scene: Scene, private glowTex: Texture) {
    const tracerGeo = new CylinderGeometry(0.05, 0.05, 1, 6);
    tracerGeo.rotateX(Math.PI / 2);
    this.tracers = new InstancedMesh(tracerGeo, new MeshBasicMaterial({ color: 0x8ff8ff, toneMapped: false }), 400);
    this.rockets = new InstancedMesh(new CylinderGeometry(0.15, 0.15, 0.9, 8).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: 0xffb35a, toneMapped: false }), 60);
    this.debris = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 }), 500);
    this.nuts = new InstancedMesh(nut(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.8, emissive: 0x3a2400 }), 160);
    for (const im of [this.tracers, this.rockets, this.debris, this.nuts]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
    this.debris.setColorAt(0, color.set(0xffffff));
  }

  /** Bright sprite that grows and fades: muzzle flash, hit star, explosion core. */
  flash(x: number, y: number, z: number, tint: number, size: number, max = 0.18, rise = 0) {
    const sprite = this.flashPool.pop() ?? new Sprite(new SpriteMaterial({ map: this.glowTex, blending: AdditiveBlending, transparent: true, depthWrite: false }));
    sprite.material.color.set(tint);
    sprite.position.set(x, y, z);
    sprite.visible = true;
    this.scene.add(sprite);
    this.flashes.push({ sprite, life: 0, max, size, rise });
  }

  /** Chunks with gravity and a bounce on the road. */
  burst(x: number, y: number, z: number, tint: number, count: number, size = 0.18, power = 5) {
    for (let i = 0; i < count && this.pieces.length < 500; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.4 + Math.random() * 0.8);
      this.pieces.push({
        x, y, z,
        vx: Math.cos(a) * sp, vy: 3 + Math.random() * power, vz: Math.sin(a) * sp,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 18,
        size: size * (0.5 + Math.random()), life: 0, max: 1.3 + Math.random() * 0.8, color: tint,
      });
    }
  }

  /** Explosion: hot core, fire puffs, smoke rising, chunks. */
  explode(x: number, z: number, scale: number, chunkColor: number) {
    this.flash(x, 0.8 * scale, z, 0xfff1c4, 3.2 * scale, 0.22);
    for (let i = 0; i < 6; i++) {
      this.flash(x + (Math.random() - 0.5) * scale, 0.5 + Math.random() * scale, z + (Math.random() - 0.5) * scale, i < 3 ? 0xff9a3a : 0xff5a2a, (1.4 + Math.random()) * scale, 0.35 + i * 0.05, 1.2);
    }
    this.burst(x, 0.8, z, chunkColor, Math.round(8 * scale), 0.22 * Math.sqrt(scale), 5 + scale * 2);
  }

  nutDrop(x: number, z: number) {
    if (this.nutList.length >= 160) return;
    const a = Math.random() * Math.PI * 2;
    this.nutList.push({ x, y: 0.6, z, vx: Math.cos(a) * 1.6, vy: 5 + Math.random() * 2, vz: Math.sin(a) * 1.6, spin: (Math.random() - 0.5) * 16, life: 0 });
  }

  /** Flat ring on the road: gold for level-up, white for a boss slam. */
  ring(x: number, z: number, tint: number, size: number, max = 0.5) {
    const mesh = new Mesh(new RingGeometry(0.8, 1, 48), new MeshBasicMaterial({ color: tint, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 0, max, size });
  }

  update(dt: number, sim: Sim) {
    // tracers and rockets mirror the sim's bullets, stretched along their flight
    let nt = 0;
    let nr = 0;
    for (const b of sim.bullets) {
      if (b.rocket) {
        m4.compose(v.set(b.x, 1.0, b.z), q.identity(), s.set(1, 1, 1));
        this.rockets.setMatrixAt(nr++, m4);
        // exhaust flame right behind the rocket, smoke left along its path
        this.flash(b.x, 1.0, b.z + 0.6, 0xffc46a, 0.9, 0.08);
        if (Math.random() < 0.6) this.flash(b.x, 1.0, b.z + 0.8, 0x9a8a7a, 0.8, 0.5, 0.6);
      } else {
        m4.compose(v.set(b.x, 0.62, b.z), q.identity(), s.set(this.tracerScale, this.tracerScale, 1.4));
        this.tracers.setMatrixAt(nt++, m4);
      }
    }
    this.tracers.count = nt;
    this.rockets.count = nr;
    this.tracers.instanceMatrix.needsUpdate = this.rockets.instanceMatrix.needsUpdate = true;

    let nd = 0;
    for (const p of this.pieces) {
      p.life += dt;
      p.vy -= 20 * dt;
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
      p.ry += p.spin * 0.7 * dt;
      const fade = p.life > p.max - 0.3 ? Math.max(0, (p.max - p.life) / 0.3) : 1;
      e.set(p.rx, p.ry, 0);
      q.setFromAxisAngle(e.normalize(), p.rx);
      m4.compose(v.set(p.x, p.y, p.z), q, s.setScalar(p.size * fade));
      this.debris.setMatrixAt(nd, m4);
      this.debris.setColorAt(nd, color.set(p.color));
      nd++;
    }
    this.pieces = this.pieces.filter((p) => p.life < p.max);
    this.debris.count = nd;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;

    let nn = 0;
    for (const n of this.nutList) {
      n.life += dt;
      n.vy -= 22 * dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.z += n.vz * dt;
      if (n.y < 0.15) {
        n.y = 0.15;
        n.vy = Math.abs(n.vy) * 0.35;
        n.vx *= 0.5;
        n.vz *= 0.5;
      }
      q.setFromAxisAngle(e.set(1, 0.3, 0).normalize(), n.life * n.spin);
      m4.compose(v.set(n.x, n.y, n.z), q, s.setScalar(0.85));
      this.nuts.setMatrixAt(nn++, m4);
    }
    // after a short bounce on the road each nut is picked up by the 2D layer
    for (const n of this.nutList) if (n.life > 0.55) this.onNut(n.x, n.y, n.z);
    this.nutList = this.nutList.filter((n) => n.life <= 0.55);
    this.nuts.count = nn;
    this.nuts.instanceMatrix.needsUpdate = true;

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
      return false;
    });
  }
}

