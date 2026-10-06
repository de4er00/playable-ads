// Shared helpers for code-built low-poly models: every model is chamfered boxes, cylinders and
// extrusions, one vertex colour per part. Parts that move together are merged into one geometry,
// so a crowd of eighty units stays a handful of draw calls.
import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type V3 = [number, number, number];

const tmp = new Object3D();

/** One part: geometry placed by position, rotation (Euler XYZ) and scale, painted one colour. */
export function part(geo: BufferGeometry, color: number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): BufferGeometry {
  tmp.position.set(...pos);
  tmp.rotation.set(...rot);
  tmp.scale.set(...scale);
  tmp.updateMatrix();
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(tmp.matrix);
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
  const c = new Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  return g;
}

export const box = (w: number, h: number, d: number, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
export const cyl = (rt: number, rb: number, h: number, seg = 12) => new CylinderGeometry(rt, rb, h, seg);

export const litMaterial = () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
export const glowMaterial = (color: number) => new MeshBasicMaterial({ color, toneMapped: false });

function radial(stops: [number, string][]): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}

/** Soft round shadow under each unit, as a texture for instanced quads. */
export const blobTexture = () => radial([[0, "rgba(0,0,0,0.55)"], [0.6, "rgba(0,0,0,0.25)"], [1, "rgba(0,0,0,0)"]]);

/** Additive glow sprite texture: hot centre, soft falloff. */
export function glowTexture(): CanvasTexture {
  const t = radial([[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,0.6)"], [1, "rgba(255,255,255,0)"]]);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Text written on a canvas, for labels that live in the 3D scene: thick outline, slight gradient. */
export function labelTexture(text: string, fill = "#ffffff", stroke = "#14213d", w = 256, h = 128): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  drawLabel(cv, text, fill, stroke);
  return t;
}

export function drawLabel(cv: HTMLCanvasElement, text: string, fill: string, stroke: string) {
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, cv.width, cv.height);
  const size = Math.round(cv.height * 0.72);
  g.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = size * 0.18;
  g.strokeStyle = stroke;
  g.strokeText(text, cv.width / 2, cv.height / 2 + size * 0.04);
  const grad = g.createLinearGradient(0, cv.height * 0.2, 0, cv.height * 0.8);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, fill);
  g.fillStyle = grad;
  g.fillText(text, cv.width / 2, cv.height / 2 + size * 0.04);
}
