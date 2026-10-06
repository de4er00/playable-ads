// Instanced units: up to 90 squad mechs and the whole drone horde, a few draw calls in total.
// Squad mechs stand in a sunflower formation; each one walks with its own phase, recoils when the squad fires,
// and new mechs grow out of their slot on the road with a springy pop.
import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  type Scene,
  type Texture,
  Vector3,
} from "three";
import { C, drone, glowMaterial, litMaterial, miniMech } from "./models";
import { type Sim, squadRadius } from "./sim";

export const CAP = 90;
const MECH_SCALE = 0.55;
const GOLDEN = 2.39996323;

interface Slot {
  x: number;
  z: number;
  pop: number; // 0 just born .. 1 settled
  vel: number;
  phase: number;
}

const m4 = new Matrix4();
const base = new Matrix4();
const local = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s = new Vector3();
const X = new Vector3(1, 0, 0);

export class Squad {
  body: InstancedMesh;
  legL: InstancedMesh;
  legR: InstancedMesh;
  glow: InstancedMesh;
  slots: Slot[] = [];
  private hip: number;
  private recoil = 0;

  constructor(scene: Scene) {
    const m = miniMech();
    this.hip = m.hip;
    const mat = litMaterial();
    this.body = new InstancedMesh(m.body, mat, CAP);
    this.legL = new InstancedMesh(m.legL, mat, CAP);
    this.legR = new InstancedMesh(m.legR, mat, CAP);
    this.glow = new InstancedMesh(m.glow, glowMaterial(C.cyan), CAP);
    for (const im of [this.body, this.legL, this.legR, this.glow]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
  }

  fired() {
    this.recoil = 1;
  }

  /** Keep one slot per visible mech; returns world positions of mechs that were removed this frame. */
  sync(sim: Sim): { x: number; z: number }[] {
    const want = Math.min(sim.count, CAP);
    const removed: { x: number; z: number }[] = [];
    while (this.slots.length > want) {
      const s0 = this.slots.pop()!;
      removed.push({ x: s0.x, z: s0.z });
    }
    while (this.slots.length < want) {
      const t = this.target(this.slots.length, want, sim);
      this.slots.push({ x: t.x, z: t.z, pop: 0, vel: 0, phase: Math.random() * Math.PI * 2 });
    }
    return removed;
  }

  private target(i: number, n: number, sim: Sim) {
    const spacing = squadRadius(sim.count) / Math.sqrt(Math.max(1, n));
    const r = spacing * Math.sqrt(i + 0.5);
    const a = i * GOLDEN;
    return { x: sim.x + Math.cos(a) * r, z: sim.z + Math.sin(a) * r * 0.8 };
  }

  update(dt: number, time: number, sim: Sim, walking: boolean) {
    const n = this.slots.length;
    this.recoil = Math.max(0, this.recoil - dt * 9);
    for (let i = 0; i < n; i++) {
      const sl = this.slots[i];
      const t = this.target(i, n, sim);
      sl.x += (t.x - sl.x) * (1 - Math.pow(0.002, dt));
      sl.z += (t.z - sl.z) * (1 - Math.pow(0.002, dt));
      // spring the birth scale toward 1 with overshoot
      sl.vel += (1 - sl.pop) * 260 * dt - sl.vel * 14 * dt;
      sl.pop += sl.vel * dt;
      const sc = Math.max(0, sl.pop) * MECH_SCALE;
      const step = walking ? Math.sin(time * 11 + sl.phase) : 0;
      const bob = Math.abs(step) * 0.05 + (1 - Math.min(1, sl.pop)) * 0.2;
      const kick = this.recoil * 0.06 * ((i * 7) % 3 === 0 ? 1 : 0.5);
      base.compose(v.set(sl.x, 0, sl.z + kick), q.identity(), s.set(sc, sc, sc));
      local.makeTranslation(0, bob / Math.max(sc, 0.01), 0);
      m4.multiplyMatrices(base, local);
      this.body.setMatrixAt(i, m4);
      this.glow.setMatrixAt(i, m4);
      for (const [mesh, sign] of [[this.legL, 1], [this.legR, -1]] as const) {
        local.compose(v.set(0, this.hip, 0), q.setFromAxisAngle(X, step * 0.55 * sign), s.set(1, 1, 1));
        m4.multiplyMatrices(base, local);
        mesh.setMatrixAt(i, m4);
      }
    }
    for (const im of [this.body, this.legL, this.legR, this.glow]) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

export class Horde {
  body: InstancedMesh;
  glow: InstancedMesh;

  constructor(scene: Scene, size: number) {
    const d = drone();
    this.body = new InstancedMesh(d.body, litMaterial(), size);
    this.glow = new InstancedMesh(d.glow, glowMaterial(C.orange), size);
    for (const im of [this.body, this.glow]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      scene.add(im);
    }
  }

  update(time: number, sim: Sim) {
    let n = 0;
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const bob = Math.abs(Math.sin(time * 9 + e.id)) * 0.06;
      const yaw = Math.sin(time * 2 + e.id * 1.7) * 0.15;
      m4.compose(v.set(e.x, bob, e.z), q.setFromAxisAngle(new Vector3(0, 1, 0), yaw), s.set(0.62, 0.62, 0.62));
      this.body.setMatrixAt(n, m4);
      this.glow.setMatrixAt(n, m4);
      n++;
    }
    this.body.count = this.glow.count = n;
    this.body.instanceMatrix.needsUpdate = this.glow.instanceMatrix.needsUpdate = true;
  }
}

/** Soft round shadows under every unit: one instanced quad lying on the road. */
export class Shadows {
  mesh: InstancedMesh;
  constructor(scene: Scene, tex: Texture, cap: number) {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new InstancedMesh(geo, new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 }), cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  update(squad: Squad, sim: Sim) {
    let n = 0;
    for (const sl of squad.slots) {
      const r = 0.95 * Math.max(0, Math.min(1.2, sl.pop));
      m4.compose(v.set(sl.x, 0.02, sl.z), q.identity(), s.set(r, 1, r));
      this.mesh.setMatrixAt(n++, m4);
    }
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      m4.compose(v.set(e.x, 0.02, e.z), q.identity(), s.set(0.85, 1, 0.85));
      this.mesh.setMatrixAt(n++, m4);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
