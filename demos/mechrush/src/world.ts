// The bridge and the canyon: road, markings, curbs, rails, lamps, piers, rocks, distant mesas and the sky.
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  type Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { C, glowMaterial, litMaterial, merge, part, rock } from "./models";
import { ROAD_HALF } from "./sim";

export const LEVEL_FROM = 24;
export const LEVEL_TO = -160;
const LENGTH = LEVEL_FROM - LEVEL_TO;
const box = (w: number, h: number, d: number, r = 0.05) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999);

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Asphalt with grain, patches, cracks and tyre marks; tiles along the bridge. */
function asphaltTexture(): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 512;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#4b5059";
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 9000; i++) {
    const v = 60 + Math.floor(hash(i) * 40);
    g.fillStyle = `rgba(${v},${v + 4},${v + 10},${0.25 + hash(i + 7) * 0.35})`;
    g.fillRect(hash(i + 1) * 256, hash(i + 2) * 512, 1 + hash(i + 3) * 2, 1 + hash(i + 4) * 2);
  }
  // darker repair patches
  for (let i = 0; i < 5; i++) {
    g.fillStyle = "rgba(30,33,38,0.1)";
    g.beginPath();
    g.ellipse(hash(i + 50) * 220 + 18, hash(i + 60) * 470 + 20, 18 + hash(i + 70) * 30, 12 + hash(i + 80) * 26, hash(i) * 3, 0, Math.PI * 2);
    g.fill();
  }
  // cracks: short jittered polylines
  g.strokeStyle = "rgba(20,22,26,0.32)";
  g.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    let x = hash(i + 100) * 256;
    let y = hash(i + 110) * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (hash(i * 10 + k) - 0.5) * 22;
      y += 6 + hash(i * 13 + k) * 12;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // tyre marks along the lanes
  for (const x of [52, 76, 180, 204]) {
    const grad = g.createLinearGradient(x - 6, 0, x + 6, 0);
    grad.addColorStop(0, "rgba(25,27,31,0)");
    grad.addColorStop(0.5, "rgba(25,27,31,0.22)");
    grad.addColorStop(1, "rgba(25,27,31,0)");
    g.fillStyle = grad;
    g.fillRect(x - 6, 0, 12, 512);
  }
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, LENGTH / 18);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function skyTexture(): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 2;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#3d6fc4");
  grad.addColorStop(0.45, "#8fb3e6");
  grad.addColorStop(0.72, "#f2c7a1");
  grad.addColorStop(1, "#e59a72");
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function buildWorld(scene: Scene, glowTex: Texture) {
  scene.background = skyTexture();
  const root = new Group();
  scene.add(root);
  const mid = (LEVEL_FROM + LEVEL_TO) / 2;

  // deck: asphalt top, concrete slab below, curbs and edge lines
  const road = new Mesh(new PlaneGeometry(ROAD_HALF * 2, LENGTH), new MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92, metalness: 0 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, mid);
  root.add(road);
  const deck = merge([
    part(box(ROAD_HALF * 2 + 2.4, 1.1, LENGTH, 0.1), 0x8d8a84, [0, -0.6, mid]),
    part(box(0.7, 0.32, LENGTH, 0.08), 0xc4bfb5, [-ROAD_HALF - 0.35, 0.12, mid]),
    part(box(0.7, 0.32, LENGTH, 0.08), 0xc4bfb5, [ROAD_HALF + 0.35, 0.12, mid]),
    part(box(0.12, 0.02, LENGTH, 0.01), 0xf2f2ee, [-ROAD_HALF + 0.25, 0.012, mid]),
    part(box(0.12, 0.02, LENGTH, 0.01), 0xf2f2ee, [ROAD_HALF - 0.25, 0.012, mid]),
  ]);
  root.add(new Mesh(deck, litMaterial()));

  // dashed lane lines: one instanced mesh
  const dash = new InstancedMesh(box(0.14, 0.02, 1.6, 0.01), new MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6 }), 2 * Math.ceil(LENGTH / 4));
  const o = new Object3D();
  let n = 0;
  for (const x of [-ROAD_HALF / 3, ROAD_HALF / 3]) {
    for (let z = LEVEL_FROM; z > LEVEL_TO; z -= 4) {
      o.position.set(x, 0.012, z);
      o.updateMatrix();
      dash.setMatrixAt(n++, o.matrix);
    }
  }
  dash.count = n;
  root.add(dash);

  // guard rails: posts with reflectors, two steel rails each side
  const postGeo = merge([
    part(box(0.16, 1.0, 0.16, 0.03), C.steel, [0, 0.5, 0]),
    part(box(0.22, 0.12, 0.22, 0.02), C.dark, [0, 0.06, 0]),
  ]);
  const posts = new InstancedMesh(postGeo, litMaterial(), 2 * Math.ceil(LENGTH / 2.4));
  const reflectors = new InstancedMesh(box(0.06, 0.1, 0.03, 0.01), glowMaterial(0xff9d3a), 2 * Math.ceil(LENGTH / 2.4));
  n = 0;
  for (const side of [-1, 1]) {
    for (let z = LEVEL_FROM; z > LEVEL_TO; z -= 2.4) {
      o.position.set(side * (ROAD_HALF + 0.55), 0.28, z);
      o.updateMatrix();
      posts.setMatrixAt(n, o.matrix);
      o.position.set(side * (ROAD_HALF + 0.46), 0.95, z);
      o.updateMatrix();
      reflectors.setMatrixAt(n, o.matrix);
      n++;
    }
  }
  posts.count = reflectors.count = n;
  const rails = merge([-1, 1].flatMap((side) => [0.72, 1.08].map((y) => part(box(0.08, 0.16, LENGTH, 0.03), 0xb7bec9, [side * (ROAD_HALF + 0.48), y + 0.28, mid]))));
  root.add(posts, reflectors, new Mesh(rails, new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.7 })));

  // street lamps every 14 units, alternating sides, with a warm halo
  const lampGeo = merge([
    part(box(0.14, 4.2, 0.14, 0.04), 0x5d6672, [0, 2.1 + 0.3, 0]),
    part(box(1.3, 0.12, 0.14, 0.04), 0x5d6672, [0.6, 4.3 + 0.3, 0]),
    part(box(0.5, 0.16, 0.3, 0.05), C.dark, [1.15, 4.2 + 0.3, 0]),
    part(box(0.34, 0.3, 0.34, 0.05), C.dark, [0, 0.15 + 0.3, 0]),
  ]);
  const lampCount = Math.ceil(LENGTH / 14);
  const lamps = new InstancedMesh(lampGeo, litMaterial(), lampCount);
  const halos = new Group();
  for (let i = 0; i < lampCount; i++) {
    const side = i % 2 ? 1 : -1;
    const z = LEVEL_FROM - i * 14;
    o.position.set(side * (ROAD_HALF + 0.9), 0, z);
    o.rotation.set(0, side > 0 ? Math.PI : 0, 0);
    o.updateMatrix();
    lamps.setMatrixAt(i, o.matrix);
    const halo = new Sprite(new SpriteMaterial({ map: glowTex, color: 0xffd9a0, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.85 }));
    halo.position.set(side * (ROAD_HALF + 0.9 - 1.15), 4.4, z);
    halo.scale.setScalar(1.1);
    halo.material.opacity = 0.55;
    halos.add(halo);
    const bulb = new Mesh(box(0.36, 0.06, 0.2, 0.02), glowMaterial(0xfff1c9));
    bulb.position.set(side * (ROAD_HALF + 0.9 - 1.15), 4.4, z);
    halos.add(bulb);
  }
  o.rotation.set(0, 0, 0);
  root.add(lamps, halos);

  // piers going down into the canyon every 30 units
  const pierGeo = merge([
    part(box(3.2, 34, 2.2, 0.2), 0x9a948b, [0, -17.6, 0]),
    part(box(ROAD_HALF * 2 + 3.4, 1.4, 2.6, 0.15), 0x8a847c, [0, -1.5, 0]),
  ]);
  const piers = new InstancedMesh(pierGeo, litMaterial(), Math.ceil(LENGTH / 30));
  n = 0;
  for (let z = LEVEL_FROM - 6; z > LEVEL_TO; z -= 30) {
    o.position.set(0, 0, z);
    o.updateMatrix();
    piers.setMatrixAt(n++, o.matrix);
  }
  piers.count = n;
  root.add(piers);

  // canyon walls: stacked rocks, each one a different shape and shade
  const rockMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const rocks = new Group();
  const shades = [0xb86b46, 0xa35a3a, 0xc98256, 0x8f4d33, 0xd29a6c];
  for (let k = 0; k < 6; k++) {
    const geo = part(rock(k), shades[k % shades.length]);
    const inst = new InstancedMesh(geo, rockMat, 60);
    let m = 0;
    for (let i = 0; i < 60; i++) {
      const seed = k * 100 + i;
      const side = hash(seed) < 0.5 ? -1 : 1;
      const tier = Math.floor(hash(seed + 1) * 4);
      const s = 3 + hash(seed + 2) * 5 + tier * 1.5;
      o.position.set(side * (ROAD_HALF + 9 + tier * 6 + hash(seed + 3) * 6), -24 + tier * 7 + hash(seed + 4) * 4, LEVEL_FROM - hash(seed + 5) * LENGTH);
      o.rotation.set(hash(seed + 6) * 3, hash(seed + 7) * 3, 0);
      o.scale.set(s, s * (0.8 + hash(seed + 8) * 0.8), s);
      o.updateMatrix();
      inst.setMatrixAt(m++, o.matrix);
    }
    rocks.add(inst);
  }
  o.scale.set(1, 1, 1);
  o.rotation.set(0, 0, 0);
  root.add(rocks);

  // canyon floor and a river glint far below
  const floor = new Mesh(new PlaneGeometry(200, LENGTH + 120), new MeshStandardMaterial({ color: 0x6e4632, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -34, mid);
  const river = new Mesh(new PlaneGeometry(7, LENGTH + 120), new MeshBasicMaterial({ color: 0x8fc7e8 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(-3, -33.8, mid);
  root.add(floor, river);

  // distant mesas behind the end of the bridge
  const mesaMat = new MeshStandardMaterial({ color: new Color(0xb67a5a), roughness: 1, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const mesa = new Mesh(rock(50 + i), mesaMat);
    mesa.scale.set(14 + hash(i) * 14, 10 + hash(i + 9) * 12, 8);
    mesa.position.set(-60 + i * 20 + hash(i + 3) * 8, -6, LEVEL_TO - 30 - hash(i + 5) * 30);
    root.add(mesa);
  }
  return root;
}
