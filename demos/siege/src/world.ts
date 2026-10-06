// The meadow: painted grass, the sandy spiral with a dirt edge and pebbles, trees, bushes and rocks
// placed off the road, and the portal at the road's start. Static, built once.
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  type Scene,
  SRGBColorSpace,
} from "three";
import { blobTexture, litMaterial } from "../../../kit/lowpoly";
import { bush, pine, portal, stone, tree } from "./models";
import { CENTER, LENGTH, R_IN, R_OUT, ROAD_WIDTH, pathPoint } from "./path";
import { makeRng } from "./sim";

function canvas(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return { cv, g: cv.getContext("2d")! };
}

function texture(cv: HTMLCanvasElement, repeat = 1) {
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/** Grass: a mottled base, darker and lighter patches, then hundreds of short blade strokes. Tiles. */
function grassTexture() {
  const { cv, g } = canvas(512, 512);
  const rnd = makeRng(11);
  g.fillStyle = "#6cad48";
  g.fillRect(0, 0, 512, 512);
  // patches drawn three times, shifted by the tile size, so the texture wraps without seams
  const blot = (x: number, y: number, r: number, color: string) => {
    for (const dx of [-512, 0, 512])
      for (const dy of [-512, 0, 512]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        grad.addColorStop(0, color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
  };
  for (let i = 0; i < 26; i++) blot(rnd() * 512, rnd() * 512, 40 + rnd() * 90, rnd() < 0.5 ? "rgba(70,130,45,0.45)" : "rgba(150,200,90,0.35)");
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const l = 3 + rnd() * 5;
    g.strokeStyle = rnd() < 0.5 ? "rgba(55,110,35,0.55)" : "rgba(160,215,100,0.5)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 2.5, y - l);
    g.stroke();
  }
  return texture(cv, 6);
}

/** Packed sand along the road: warm base, wheel-worn lighter middle, darker banks at both edges, pebbles. */
function sandTexture() {
  const { cv, g } = canvas(128, 256);
  const rnd = makeRng(5);
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, "#b48a52");
  grad.addColorStop(0.12, "#d6b075");
  grad.addColorStop(0.5, "#e6c88e");
  grad.addColorStop(0.88, "#d6b075");
  grad.addColorStop(1, "#b48a52");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 128;
    const y = rnd() * 256;
    g.fillStyle = rnd() < 0.5 ? "rgba(140,105,60,0.35)" : "rgba(255,240,200,0.35)";
    g.beginPath();
    g.ellipse(x, y, 1 + rnd() * 2.2, 0.8 + rnd() * 1.6, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = texture(cv);
  t.wrapS = RepeatWrapping;
  return t;
}

/** A flat strip along the road between offsets a and b from its centre line, v running with arc length. */
function strip(from: number, to: number, a: number, b: number, y: number, vScale: number) {
  const step = 0.2;
  const n = Math.ceil((to - from) / step) + 1;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = from + (i / (n - 1)) * (to - from);
    const p = pathPoint(s);
    // left normal of the heading on the ground
    const nx = Math.sin(p.heading);
    const nz = -Math.cos(p.heading);
    pos.set([p.x + nx * a, y, p.z + nz * a, p.x + nx * b, y, p.z + nz * b], i * 6);
    uv.set([0, s * vScale, 1, s * vScale], i * 4);
    if (i < n - 1) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("uv", new BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Distance from a ground point to the nearest point of the road's centre line (coarse, for placing props). */
function roadDistance(x: number, z: number) {
  let best = Infinity;
  for (let s = -3; s <= LENGTH; s += 0.5) {
    const p = pathPoint(s);
    best = Math.min(best, Math.hypot(p.x - x, p.z - z));
  }
  return best;
}

/** Portal swirl: a purple disc of spiral arms, drawn once, spun by the game. */
function swirlTexture() {
  const { cv, g } = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,230,255,1)");
  grad.addColorStop(0.35, "rgba(190,110,255,0.95)");
  grad.addColorStop(0.85, "rgba(90,30,170,0.9)");
  grad.addColorStop(1, "rgba(60,10,120,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,255,255,0.45)";
  g.lineWidth = 6;
  for (let arm = 0; arm < 4; arm++) {
    g.beginPath();
    for (let t = 0; t < 1; t += 0.02) {
      const a = arm * (Math.PI / 2) + t * 5;
      const r = 12 + t * 105;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      if (t === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface World {
  swirl: Mesh;
}

/** keepClear: ground circles where no props may stand (the board's spots in both layouts). */
export function buildWorld(scene: Scene, keepClear: { x: number; z: number; r: number }[]): World {
  const ground = new Mesh(new PlaneGeometry(90, 90), new MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // dirt bank under the road, then the sand on top
  const bank = new Mesh(strip(-0.6, LENGTH + 0.6, -ROAD_WIDTH / 2 - 0.22, ROAD_WIDTH / 2 + 0.22, 0.012, 0.5), new MeshStandardMaterial({ color: 0x9a7444, roughness: 1 }));
  const road = new Mesh(strip(-0.6, LENGTH + 0.6, -ROAD_WIDTH / 2, ROAD_WIDTH / 2, 0.024, 0.35), new MeshStandardMaterial({ map: sandTexture(), roughness: 0.95 }));
  scene.add(bank, road);

  const rnd = makeRng(3);
  const dummy = new Object3D();
  const clear = (x: number, z: number, margin: number) => {
    if (Math.hypot(x - CENTER.x, z - CENTER.z) < R_IN - ROAD_WIDTH / 2) return false;
    if (keepClear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) return false;
    return roadDistance(x, z) > ROAD_WIDTH / 2 + margin;
  };

  // pebbles along both banks
  const pebbles = new InstancedMesh(stone(1), litMaterial(), 160);
  for (let i = 0; i < 160; i++) {
    const s = 1.2 + rnd() * (LENGTH - 1);
    const p = pathPoint(s);
    const side = rnd() < 0.5 ? -1 : 1;
    const off = ROAD_WIDTH / 2 + 0.12 + rnd() * 0.25;
    dummy.position.set(p.x + Math.sin(p.heading) * off * side, 0, p.z - Math.cos(p.heading) * off * side);
    dummy.rotation.set(0, rnd() * 6, 0);
    dummy.scale.setScalar(0.18 + rnd() * 0.22);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);
  }
  scene.add(pebbles);

  // trees and bushes: rejection-sample spots off the road, outside the plaza and the board
  const shadows: { x: number; z: number; r: number }[] = [];
  const place = (count: number, make: (seed: number) => BufferGeometry, variants: number, area: () => [number, number], margin: number, scale: () => number, shadow: number) => {
    const per = Math.ceil(count / variants);
    for (let v = 0; v < variants; v++) {
      const mesh = new InstancedMesh(make(v * 7 + 1), litMaterial(), per);
      let n = 0;
      for (let tries = 0; n < per && tries < per * 60; tries++) {
        const [x, z] = area();
        if (!clear(x, z, margin)) continue;
        const s = scale();
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, rnd() * 6.28, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
        shadows.push({ x, z, r: shadow * s });
      }
      mesh.count = n;
      scene.add(mesh);
    }
  };
  const ringArea = (r0: number, r1: number) => () => {
    const a = rnd() * Math.PI * 2;
    const r = r0 + rnd() * (r1 - r0);
    return [CENTER.x + Math.cos(a) * r, CENTER.z + Math.sin(a) * r * 1.15] as [number, number];
  };
  place(26, tree, 3, ringArea(R_OUT + 1.6, R_OUT + 9), 0.9, () => 0.9 + rnd() * 0.5, 0.9);
  place(14, pine, 2, ringArea(R_OUT + 2.2, R_OUT + 10), 0.9, () => 0.9 + rnd() * 0.5, 0.8);
  place(26, bush, 2, ringArea(R_IN, R_OUT + 3), 0.32, () => 0.55 + rnd() * 0.4, 0.45);
  place(16, stone, 2, ringArea(R_IN, R_OUT + 6), 0.3, () => 0.5 + rnd() * 0.8, 0.35);

  // flowers: tiny bright dots between the road's coils
  const flowers = new InstancedMesh(new CircleGeometry(0.06, 6).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffffff }), 220);
  const petals = [0xffffff, 0xfff38a, 0xff9ac1, 0xc7a6ff];
  let fn = 0;
  for (let tries = 0; fn < 220 && tries < 4000; tries++) {
    const [x, z] = ringArea(R_IN, R_OUT + 7)();
    if (!clear(x, z, 0.2)) continue;
    dummy.position.set(x, 0.03, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.7 + rnd() * 0.8);
    dummy.updateMatrix();
    flowers.setMatrixAt(fn, dummy.matrix);
    flowers.setColorAt(fn, new MeshBasicMaterial({ color: petals[fn % petals.length] }).color);
    fn++;
  }
  flowers.count = fn;
  scene.add(flowers);

  // soft round shadows under every prop
  const blob = blobTexture();
  const shadowMesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }), shadows.length);
  shadows.forEach((s, i) => {
    dummy.position.set(s.x + 0.15, 0.035, s.z + 0.1);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(s.r * 2.2);
    dummy.updateMatrix();
    shadowMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(shadowMesh);

  // the portal: a glowing well at the road's start that the snake crawls out of
  const start = pathPoint(-0.4);
  const gate = new Group();
  const p = portal();
  gate.add(new Mesh(p.body, litMaterial()), new Mesh(p.runes, new MeshBasicMaterial({ color: 0xd9a8ff, toneMapped: false })));
  const swirl = new Mesh(new CircleGeometry(1.25, 40), new MeshBasicMaterial({ map: swirlTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  swirl.rotation.x = -Math.PI / 2;
  swirl.position.y = 0.05;
  gate.add(swirl);
  gate.position.set(start.x, 0, start.z);
  scene.add(gate);
  return { swirl };
}
