// Every model is built here from code: chamfered boxes, cylinders and extrusions, one vertex colour per part.
// Parts that move together are merged into one geometry, so a squad of 80 mechs is a handful of draw calls.
import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  ConeGeometry,
  BoxGeometry,
  DoubleSide,
  AdditiveBlending,
  SRGBColorSpace,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const C = {
  blue: 0x2f7be6,
  blueDark: 0x1b4f9e,
  blueLight: 0x6fb4ff,
  white: 0xdfe5ee,
  steel: 0x8b95a5,
  dark: 0x262b35,
  cyan: 0x63f5ff,
  red: 0xe2412f,
  redDark: 0x8e1f19,
  orange: 0xff8a2a,
  yellow: 0xffc93c,
  gold: 0xffc23d,
  asphalt: 0x4a4f58,
  concrete: 0xb9b4aa,
};

const tmp = new Object3D();

/** One part: geometry placed by position, rotation (Euler XYZ) and scale, painted one colour. */
export function part(geo: BufferGeometry, color: number, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): BufferGeometry {
  tmp.position.set(...pos);
  tmp.rotation.set(...rot);
  tmp.scale.set(...scale);
  tmp.updateMatrix();
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
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

const box = (w: number, h: number, d: number, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
const cyl = (rt: number, rb: number, h: number, seg = 12) => new CylinderGeometry(rt, rb, h, seg);
const X90: [number, number, number] = [Math.PI / 2, 0, 0];
const Z90: [number, number, number] = [0, 0, Math.PI / 2];

export const litMaterial = () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
export const glowMaterial = (color: number) => new MeshBasicMaterial({ color, toneMapped: false });

/**
 * Mini mech, facing -z, feet at y = 0, about 1.3 tall before the instance scale.
 * body: everything above the hips; legs: hip pivot at the origin so a rotation about x swings them.
 */
export function miniMech(primary = C.blue, dark = C.blueDark, light = C.blueLight) {
  const body = merge([
    part(box(0.62, 0.22, 0.42, 0.06), C.dark, [0, 0.62, 0]), // pelvis
    part(box(0.96, 0.58, 0.72, 0.12), primary, [0, 0.98, 0.02]), // torso
    part(box(0.78, 0.3, 0.12, 0.05), light, [0, 1.06, -0.36]), // chest plate
    part(box(0.6, 0.12, 0.08, 0.03), C.dark, [0, 1.14, -0.43]), // visor housing
    part(box(0.98, 0.1, 0.74, 0.04), dark, [0, 0.72, 0.02]), // belly band
    part(box(0.34, 0.3, 0.42, 0.08), C.white, [-0.62, 1.12, 0]), // left shoulder
    part(box(0.34, 0.3, 0.42, 0.08), C.white, [0.62, 1.12, 0]), // right shoulder
    part(box(0.2, 0.34, 0.24, 0.05), C.dark, [-0.66, 0.84, -0.04]), // left arm
    part(box(0.2, 0.34, 0.24, 0.05), C.dark, [0.66, 0.84, -0.04]), // right arm
    part(cyl(0.07, 0.08, 0.62), C.steel, [-0.66, 0.78, -0.36], X90), // left gun barrel
    part(cyl(0.07, 0.08, 0.62), C.steel, [0.66, 0.78, -0.36], X90),
    part(cyl(0.11, 0.11, 0.14), C.dark, [-0.66, 0.78, -0.66], X90), // muzzle brakes
    part(cyl(0.11, 0.11, 0.14), C.dark, [0.66, 0.78, -0.66], X90),
    part(box(0.36, 0.24, 0.34, 0.05), dark, [0.28, 1.39, 0.12]), // missile pod on the back
    part(box(0.36, 0.24, 0.34, 0.05), dark, [-0.28, 1.39, 0.12]),
    part(cyl(0.025, 0.025, 0.36, 6), C.steel, [0.36, 1.62, 0.22]), // antenna
    part(box(0.5, 0.26, 0.2, 0.05), C.steel, [0, 0.98, 0.43]), // backpack
    part(cyl(0.07, 0.09, 0.14), C.dark, [-0.14, 0.84, 0.54], X90), // exhausts
    part(cyl(0.07, 0.09, 0.14), C.dark, [0.14, 0.84, 0.54], X90),
  ]);
  const leg = (side: number) =>
    merge([
      part(box(0.24, 0.3, 0.28, 0.06), C.white, [side * 0.22, -0.14, 0]), // thigh
      part(cyl(0.09, 0.09, 0.3, 10), C.dark, [side * 0.22, -0.32, 0], Z90), // knee
      part(box(0.2, 0.26, 0.24, 0.05), primary, [side * 0.22, -0.46, 0.02]), // shin
      part(box(0.28, 0.1, 0.4, 0.04), C.dark, [side * 0.22, -0.6, -0.04]), // foot
    ]);
  // glowing bits drawn unlit: visor slit, antenna tip, pod lamps, muzzle rings
  const glow = merge([
    part(box(0.5, 0.05, 0.04, 0.02), C.cyan, [0, 1.14, -0.47]),
    part(new SphereGeometry(0.045, 8, 6), C.cyan, [0.36, 1.81, 0.22]),
    part(box(0.06, 0.06, 0.02, 0.01), C.cyan, [-0.44, 1.18, -0.21]),
    part(box(0.06, 0.06, 0.02, 0.01), C.cyan, [0.44, 1.18, -0.21]),
    part(new TorusGeometry(0.08, 0.018, 6, 12), C.cyan, [-0.66, 0.78, -0.74]),
    part(new TorusGeometry(0.08, 0.018, 6, 12), C.cyan, [0.66, 0.78, -0.74]),
  ]);
  return { body, legL: leg(-1), legR: leg(1), glow, hip: 0.62 };
}

/** Red spider drone of the horde: armoured shell, spikes, one glowing eye, four legs. Faces +z. */
export function drone() {
  const legs: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    legs.push(part(cyl(0.035, 0.05, 0.42, 6), C.dark, [dx * 0.34, 0.26, dz * 0.34], [dz * 0.9, 0, -dx * 0.9]));
    legs.push(part(cyl(0.05, 0.02, 0.32, 6), C.dark, [dx * 0.5, 0.12, dz * 0.5], [-dz * 0.35, 0, dx * 0.35]));
  }
  const spikes: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    spikes.push(part(new ConeGeometry(0.06, 0.22, 6), C.steel, [Math.cos(a) * 0.2, 0.6, Math.sin(a) * 0.2 - 0.04], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]));
  }
  const body = merge([
    part(new DodecahedronGeometry(0.34, 1), C.red, [0, 0.42, 0], [0, 0, 0], [1, 0.72, 1.1]),
    part(new DodecahedronGeometry(0.3, 0), C.redDark, [0, 0.33, 0], [0, 0, 0], [1.05, 0.5, 1.12]), // underside
    part(box(0.36, 0.08, 0.3, 0.03), C.redDark, [0, 0.62, -0.06]), // top plate
    part(cyl(0.13, 0.15, 0.1, 12), C.dark, [0, 0.42, 0.36], X90), // eye socket
    ...legs,
    ...spikes,
  ]);
  const glow = merge([part(new SphereGeometry(0.085, 10, 8), C.orange, [0, 0.42, 0.41])]);
  return { body, glow };
}

/** Gold hex nut: the currency the drones drop. */
export function nut() {
  return merge([
    part(cyl(0.22, 0.22, 0.12, 6), C.gold, [0, 0, 0]),
    part(cyl(0.11, 0.11, 0.13, 12), 0x8a5a12, [0, 0, 0]),
  ]);
}

/** Soft round shadow under each unit, as a texture for instanced quads. */
export function blobTexture(): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.6, "rgba(0,0,0,0.25)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}

/** Additive glow sprite texture: hot centre, soft falloff. */
export function glowTexture(): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Number written on a canvas, for gate panels and the barricade: thick outline, slight gradient. */
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

/** A gate panel: two posts, a lit glass sheet tinted by sign, a chevron header and the number. */
export function gatePanel(positive: boolean, text: string, width = 4.1) {
  const g = new Group();
  const tint = positive ? 0x29b6ff : 0xff3b3b;
  const deep = positive ? 0x0b5fa8 : 0x9e1414;
  const frame = merge([
    part(box(0.34, 2.6, 0.34, 0.08), C.steel, [-width / 2, 1.3, 0]),
    part(box(0.34, 2.6, 0.34, 0.08), C.steel, [width / 2, 1.3, 0]),
    part(box(0.44, 0.2, 0.44, 0.06), C.dark, [-width / 2, 0.1, 0]),
    part(box(0.44, 0.2, 0.44, 0.06), C.dark, [width / 2, 0.1, 0]),
    part(box(width + 0.3, 0.32, 0.36, 0.08), deep, [0, 2.6, 0]),
    part(box(width + 0.1, 0.08, 0.38, 0.03), C.dark, [0, 2.42, 0]),
  ]);
  g.add(new Mesh(frame, litMaterial()));
  const glass = new Mesh(
    new PlaneGeometry(width - 0.12, 2.1),
    new MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.42, roughness: 0.1, metalness: 0.1, emissive: tint, emissiveIntensity: 0.35, side: DoubleSide, depthWrite: false }),
  );
  glass.position.set(0, 1.32, 0);
  g.add(glass);
  // bright edge strips sell the glass better than any shader on a phone
  const edge = new Mesh(merge([
    part(box(width - 0.1, 0.06, 0.06, 0.02), 0xffffff, [0, 2.36, 0]),
    part(box(width - 0.1, 0.06, 0.06, 0.02), 0xffffff, [0, 0.28, 0]),
    part(box(0.06, 2.06, 0.06, 0.02), 0xffffff, [-width / 2 + 0.06, 1.32, 0]),
    part(box(0.06, 2.06, 0.06, 0.02), 0xffffff, [width / 2 - 0.06, 1.32, 0]),
  ]), new MeshBasicMaterial({ color: tint, toneMapped: false }));
  g.add(edge);
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  drawLabel(cv, text, positive ? "#bfe9ff" : "#ffd0d0", positive ? "#06315c" : "#5c0606");
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  const label = new Mesh(new PlaneGeometry(2.6, 1.3), new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  label.position.set(0, 1.42, -0.02);
  // PlaneGeometry faces +z: toward the squad and the camera behind it.
  g.add(label);
  // chevrons on the header
  const chevrons = new Mesh(merge(Array.from({ length: 5 }, (_, i) => part(new ConeGeometry(0.12, 0.2, 3), 0xffffff, [-1 + i * 0.5, 2.6, 0.19], [Math.PI / 2, 0, positive ? Math.PI : 0]))), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  g.add(chevrons);
  return { group: g, glass };
}

/** Concrete jersey barriers with hazard stripes facing the squad, warning lamps, and steel plates behind. */
export function barricade(width = 8.8) {
  const shape = new Shape();
  shape.moveTo(-0.45, 0);
  shape.lineTo(0.45, 0);
  shape.lineTo(0.22, 0.32);
  shape.lineTo(0.16, 1.05);
  shape.lineTo(-0.16, 1.05);
  shape.lineTo(-0.22, 0.32);
  shape.lineTo(-0.45, 0);
  const seg = new ExtrudeGeometry(shape, { depth: 1.35, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  seg.translate(0, 0, -0.675);
  const parts: BufferGeometry[] = [];
  const glow: BufferGeometry[] = [];
  const n = Math.floor(width / 1.42);
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + 0.71 + i * ((width - 1.42) / (n - 1));
    parts.push(part(seg, i % 2 ? C.concrete : 0xc9c2b6, [x, 0, 0], [0, Math.PI / 2, 0]));
    // hazard band on the face toward the squad (+z), tilted with the barrier's slope
    for (let k = 0; k < 4; k++) parts.push(part(box(0.26, 0.2, 0.07, 0.02), k % 2 ? C.dark : C.yellow, [x - 0.42 + k * 0.28, 0.66, 0.255], [-0.08, 0, 0.62]));
    parts.push(part(cyl(0.06, 0.07, 0.1, 8), C.dark, [x, 1.1, 0]));
    glow.push(part(new SphereGeometry(0.07, 8, 6), 0xff4a2a, [x, 1.19, 0]));
  }
  // steel plates and posts behind the barriers, leaning back
  for (let i = 0; i < n - 1; i++) {
    const x = -width / 2 + 1.42 + i * ((width - 1.42) / (n - 1));
    parts.push(part(box(1.25, 1.7, 0.1, 0.03), 0x6b7380, [x, 0.85, -0.62], [-0.12, 0, 0]));
    parts.push(part(box(1.2, 0.08, 0.12, 0.02), C.dark, [x, 1.35, -0.58], [-0.12, 0, 0]));
    parts.push(part(cyl(0.05, 0.05, 1.8, 8), C.dark, [x - 0.6, 0.9, -0.72]));
  }
  return { body: merge(parts), glow: merge(glow) };
}

/** Big enemy mech, faces +z: layered armour, grilled chest, reactor ring, gatling arms, missile pods, pistons. */
export function bossMech() {
  const g = new Group();
  const body = new Group();
  body.position.y = 4.4;
  g.add(body);
  const bolts = (pts: [number, number, number][]) => pts.map((q) => part(cyl(0.06, 0.06, 0.06, 8), C.steel, q, X90));
  // torso: a trapezoid extruded front to back, wider at the shoulders
  const torsoShape = new Shape();
  torsoShape.moveTo(-1.35, -1.0);
  torsoShape.lineTo(1.35, -1.0);
  torsoShape.lineTo(1.75, 0.9);
  torsoShape.lineTo(1.2, 1.55);
  torsoShape.lineTo(-1.2, 1.55);
  torsoShape.lineTo(-1.75, 0.9);
  torsoShape.lineTo(-1.35, -1.0);
  const torso = new ExtrudeGeometry(torsoShape, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2 });
  torso.translate(0, 0, -1.1);
  const grill: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) grill.push(part(box(1.1, 0.07, 0.08, 0.02), C.dark, [0, -0.62 + i * 0.13, 1.28]));
  const plates = [
    part(torso, C.red),
    part(box(2.3, 0.95, 0.24, 0.12), C.redDark, [0, 0.95, 1.2]),
    part(box(1.0, 0.8, 0.22, 0.1), C.redDark, [-1.05, 0.0, 1.18], [0, 0.35, 0]),
    part(box(1.0, 0.8, 0.22, 0.1), C.redDark, [1.05, 0.0, 1.18], [0, -0.35, 0]),
    part(box(1.3, 0.75, 0.12, 0.05), 0x3a2224, [0, -0.38, 1.22]),
    part(box(2.4, 0.06, 0.06, 0.02), C.dark, [0, 0.45, 1.33]),
    part(new TorusGeometry(0.46, 0.13, 10, 24), C.steel, [0, 0.95, 1.36]),
    part(box(0.9, 0.5, 1.4, 0.1), C.dark, [0, 1.75, -0.3]),
    ...grill,
    ...bolts([[-1.05, 1.32, 1.34], [1.05, 1.32, 1.34], [-1.05, 0.58, 1.34], [1.05, 0.58, 1.34]]),
  ];
  // head: angular helmet with a crest and antennae
  const helm = new Shape();
  helm.moveTo(-0.62, -0.38);
  helm.lineTo(0.62, -0.38);
  helm.lineTo(0.7, 0.22);
  helm.lineTo(0.3, 0.52);
  helm.lineTo(-0.3, 0.52);
  helm.lineTo(-0.7, 0.22);
  helm.lineTo(-0.62, -0.38);
  const head = new ExtrudeGeometry(helm, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
  head.translate(0, 0, -0.55);
  const headParts = [
    part(head, C.red, [0, 2.15, 0.25]),
    part(box(1.05, 0.2, 0.16, 0.05), C.dark, [0, 2.12, 0.85]),
    part(box(0.16, 0.7, 0.9, 0.06), C.redDark, [0, 2.75, 0.15], [0.25, 0, 0]),
    part(cyl(0.035, 0.035, 0.9, 6), C.steel, [-0.55, 2.85, -0.1], [-0.3, 0, 0.25]),
    part(cyl(0.035, 0.035, 0.9, 6), C.steel, [0.55, 2.85, -0.1], [-0.3, 0, -0.25]),
  ];
  // pauldrons with hazard stripes, missile pods on top
  const shoulders: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    shoulders.push(part(box(1.5, 0.9, 1.8, 0.28), C.redDark, [sx * 2.3, 1.15, 0]));
    shoulders.push(part(box(1.56, 0.22, 1.86, 0.08), C.dark, [sx * 2.3, 0.72, 0]));
    for (let i = 0; i < 6; i++) shoulders.push(part(box(0.18, 0.18, 0.05, 0.02), i % 2 ? C.dark : C.yellow, [sx * 2.3 - 0.5 + i * 0.2, 0.92, 0.92], [0, 0, 0.7]));
    shoulders.push(part(box(1.25, 0.85, 1.3, 0.12), C.dark, [sx * 2.3, 1.98, -0.25]));
    for (let i = 0; i < 6; i++) shoulders.push(part(cyl(0.13, 0.13, 0.14, 10), 0x3a3f4a, [sx * 2.3 - 0.36 + (i % 3) * 0.36, 1.82 + Math.floor(i / 3) * 0.34, 0.42], X90));
    shoulders.push(...bolts([[sx * 2.3 - 0.6, 1.45, 0.92], [sx * 2.3 + 0.6, 1.45, 0.92]]));
  }
  const waist = [
    part(box(2.2, 0.5, 1.5, 0.12), C.dark, [0, -1.25, 0]),
    part(box(0.8, 0.9, 0.18, 0.08), C.redDark, [0, -1.5, 0.78], [-0.15, 0, 0]),
    part(box(0.7, 0.8, 0.18, 0.08), C.redDark, [-0.85, -1.45, 0.7], [-0.15, 0.3, 0]),
    part(box(0.7, 0.8, 0.18, 0.08), C.redDark, [0.85, -1.45, 0.7], [-0.15, -0.3, 0]),
    part(box(1.9, 1.3, 0.9, 0.15), C.steel, [0, 0.55, -1.55]),
    part(cyl(0.18, 0.22, 0.5, 10), C.dark, [-0.55, 1.2, -1.75]),
    part(cyl(0.18, 0.22, 0.5, 10), C.dark, [0.55, 1.2, -1.75]),
  ];
  body.add(new Mesh(merge([...plates, ...headParts, ...shoulders, ...waist]), litMaterial()));
  const glowParts = [
    part(box(0.85, 0.08, 0.05, 0.02), 0xff5a2a, [0, 2.12, 0.95]),
    part(new SphereGeometry(0.34, 16, 12), C.orange, [0, 0.95, 1.36]),
    ...[-1, 1].flatMap((sx) => [0, 1, 2, 3, 4, 5].map((i) => part(new SphereGeometry(0.07, 8, 6), 0xff3b2a, [sx * 2.3 - 0.36 + (i % 3) * 0.36, 1.82 + Math.floor(i / 3) * 0.34, 0.5]))),
    ...[-1, 1].map((sx) => part(new SphereGeometry(0.05, 6, 4), 0xff3b2a, [sx * 0.75, 3.27, -0.38])),
  ];
  const glow = new Mesh(merge(glowParts), new MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  body.add(glow);
  // gatling arms with ammo drums
  const arms: Group[] = [];
  for (const sx of [-1, 1]) {
    const arm = new Group();
    arm.position.set(sx * 2.3, 0.2, 0.3);
    arm.add(new Mesh(merge([
      part(box(0.85, 1.3, 0.95, 0.18), C.dark, [0, -0.35, 0]),
      part(box(0.95, 0.5, 1.0, 0.15), C.redDark, [0, -0.05, 0.05]),
      part(cyl(0.5, 0.5, 0.55, 16), C.steel, [0, -0.95, 0.65], X90),
      part(cyl(0.38, 0.38, 0.6, 14), 0x6a5a3a, [sx * 0.55, -0.95, 0.3], Z90),
      part(cyl(0.2, 0.2, 0.25, 12), C.dark, [0, -0.95, 1.0], X90),
    ]), litMaterial()));
    const gatling = new Group();
    gatling.position.set(0, -0.95, 1.1);
    gatling.add(new Mesh(merge([
      ...Array.from({ length: 6 }, (_, i) => part(cyl(0.1, 0.1, 1.7, 8), C.steel, [Math.cos((i / 6) * Math.PI * 2) * 0.27, Math.sin((i / 6) * Math.PI * 2) * 0.27, 0.85], X90)),
      part(cyl(0.42, 0.42, 0.12, 14), C.dark, [0, 0, 1.45], X90),
      part(cyl(0.42, 0.42, 0.12, 14), C.dark, [0, 0, 0.5], X90),
    ]), litMaterial()));
    arm.add(gatling);
    arm.userData.gatling = gatling;
    body.add(arm);
    arms.push(arm);
  }
  // legs: hip joint, armoured thigh, pistons, knee cap, shin, three-toed foot
  const legs: Group[] = [];
  for (const sx of [-1, 1]) {
    const leg = new Group();
    leg.position.set(sx * 1.1, 3.2, 0);
    leg.add(new Mesh(merge([
      part(cyl(0.52, 0.52, 0.95, 16), C.dark, [0, 0, 0], Z90),
      part(box(0.95, 1.5, 1.05, 0.2), C.red, [0, -0.85, 0.1]),
      part(box(1.0, 0.7, 0.2, 0.08), C.redDark, [0, -0.7, 0.66], [0.1, 0, 0]),
      part(cyl(0.08, 0.08, 1.3, 8), C.steel, [sx * 0.42, -0.9, -0.5]),
      part(cyl(0.12, 0.12, 0.6, 8), C.dark, [sx * 0.42, -0.45, -0.5]),
      part(cyl(0.44, 0.44, 1.05, 16), C.dark, [0, -1.7, 0.2], Z90),
      part(box(0.8, 0.6, 0.45, 0.18), C.redDark, [0, -1.65, 0.65]),
      part(box(0.82, 1.35, 0.92, 0.16), C.red, [0, -2.4, 0.05]),
      part(box(0.86, 0.9, 0.18, 0.06), C.redDark, [0, -2.3, 0.55]),
      part(box(1.3, 0.36, 1.2, 0.14), C.dark, [0, -3.0, 0.05]),
      ...[-0.42, 0, 0.42].map((dx) => part(box(0.34, 0.3, 0.9, 0.1), C.dark, [dx, -3.02, 0.85])),
      part(box(1.2, 0.1, 0.25, 0.04), C.yellow, [0, -2.86, 0.62]),
    ]), litMaterial()));
    g.add(leg);
    legs.push(leg);
  }
  return { group: g, body, arms, legs, glow };
}

/** Low-poly rocks for the canyon walls: an icosahedron pushed around by a hash so every rock differs. */
export function rock(seed: number): BufferGeometry {
  const geo = new IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin(v.x * 12.9 + v.y * 78.2 + v.z * 37.7 + seed * 11.3) * 43758.5;
    v.multiplyScalar(0.78 + (h - Math.floor(h)) * 0.42);
    pos.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

