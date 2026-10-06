// Every Spiral Siege model, built from code with the shared low-poly helpers in kit/lowpoly.
// Snake parts face +x (the road's heading 0); everything stands on y = 0.
import {
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { box, cyl, glowMaterial, litMaterial, merge, part, type V3 } from "../../../kit/lowpoly";

export const C = {
  red: 0xd8372c,
  redLight: 0xf0574a,
  redDark: 0x8e1c18,
  maw: 0x3a0a0a,
  silver: 0xdfe3ea,
  steel: 0x8b95a5,
  crimson: 0x9a1626,
  crimsonDark: 0x2c0b12,
  gold: 0xffc23d,
  goldDark: 0xc98a12,
  stone: 0xb4afa4,
  stoneDark: 0x8f8a80,
  stoneLight: 0xcdc8bc,
  wood: 0x7a4a24,
  woodDark: 0x4e2e14,
  iron: 0x3a3f48,
  banner: 0x2f6fd6,
  eye: 0xffd84a,
};

/** Unit colours by level: blue, teal, purple, gold (index 0 unused). */
export const LEVEL_COLOR = [0, 0x3f8cff, 0x1fc4b4, 0x9a5bff, 0xffc23d];
export const LEVEL_DARK = [0, 0x1f4fa8, 0x0f7a70, 0x5a2aa8, 0xc98a12];

const sphere = (r: number, w = 14, h = 10) => new SphereGeometry(r, w, h);
const cone = (r: number, h: number, seg = 6) => new ConeGeometry(r, h, seg);

/** A spike leaning back (toward -x) and out to one side, base at pos. */
function spike(pos: V3, r: number, h: number, color: number, out = 0, back = 0.55): BufferGeometry {
  return part(cone(r, h, 6).translate(0, h / 2, 0), color, pos, [out, 0, back]);
}

/** One body segment of the snake: a scaled red bead with shingled plates, a dorsal spike and two side spikes. */
export function snakeSegment(boss = false) {
  const body = boss ? C.crimson : C.red;
  const light = boss ? 0xc22a38 : C.redLight;
  const belly = boss ? C.crimsonDark : C.redDark;
  const spikeColor = boss ? C.gold : C.silver;
  return merge([
    part(sphere(0.5), body, [0, 0.42, 0], [0, 0, 0], [1.08, 0.74, 0.98]),
    part(sphere(0.47, 12, 8), belly, [0, 0.27, 0], [0, 0, 0], [1.02, 0.5, 0.92]),
    // shingled plates over the back, front one highest
    part(sphere(0.3, 10, 6), light, [0.18, 0.66, 0], [0, 0, 0.2], [1.0, 0.36, 1.25]),
    part(sphere(0.3, 10, 6), body, [-0.14, 0.64, 0], [0, 0, 0.2], [1.0, 0.36, 1.3]),
    spike([0.02, 0.72, 0], 0.13, 0.48, spikeColor),
    spike([0, 0.5, 0.42], 0.1, 0.34, spikeColor, 1.15, 0.45),
    spike([0, 0.5, -0.42], 0.1, 0.34, spikeColor, -1.15, 0.45),
    spike([-0.36, 0.56, 0], 0.08, 0.26, spikeColor),
  ]);
}

/** The snake's head: horned skull, open jaw with teeth, glowing slit eyes (glow is a separate geometry). */
export function snakeHead(boss = false) {
  const body = boss ? C.crimson : C.red;
  const dark = boss ? C.crimsonDark : C.redDark;
  const horn = boss ? C.gold : C.silver;
  const teeth: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++)
    for (const side of [-1, 1]) {
      teeth.push(part(cone(0.05, 0.16, 4), 0xf4efe2, [0.42 + i * 0.12, 0.27, side * (0.27 - i * 0.04)], [Math.PI, 0, 0]));
      teeth.push(part(cone(0.04, 0.12, 4), 0xf4efe2, [0.44 + i * 0.11, 0.17, side * (0.24 - i * 0.04)], [0, 0, -0.3]));
    }
  const parts = [
    part(sphere(0.6), body, [0.02, 0.46, 0], [0, 0, 0], [1.25, 0.68, 1.15]),
    part(sphere(0.45), body, [0.55, 0.42, 0], [0, 0, 0.06], [1.25, 0.52, 0.98]),
    part(sphere(0.4, 12, 8), dark, [0.48, 0.15, 0], [0, 0, -0.3], [1.3, 0.34, 0.92]),
    part(sphere(0.36, 12, 8), C.maw, [0.5, 0.25, 0], [0, 0, -0.12], [1.22, 0.28, 0.82]),
    // pale cheek plates
    part(sphere(0.3, 10, 6), boss ? 0x5a1a22 : 0xf08a6e, [0.15, 0.24, 0.32], [0, 0.3, 0], [1.1, 0.5, 0.6]),
    part(sphere(0.3, 10, 6), boss ? 0x5a1a22 : 0xf08a6e, [0.15, 0.24, -0.32], [0, -0.3, 0], [1.1, 0.5, 0.6]),
    // eye sockets, then angry brows over the eyes
    part(sphere(0.18, 10, 8), dark, [0.3, 0.72, 0.33]),
    part(sphere(0.18, 10, 8), dark, [0.3, 0.72, -0.33]),
    part(box(0.36, 0.1, 0.18, 0.04), dark, [0.34, 0.88, 0.3], [0.3, 0, -0.4]),
    part(box(0.36, 0.1, 0.18, 0.04), dark, [0.34, 0.88, -0.3], [-0.3, 0, -0.4]),
    // black slit pupils in front of the glowing eyes
    part(box(0.05, 0.2, 0.06, 0.02), 0x0b0b0b, [0.45, 0.76, 0.35], [0, 0.35, 0]),
    part(box(0.05, 0.2, 0.06, 0.02), 0x0b0b0b, [0.45, 0.76, -0.35], [0, -0.35, 0]),
    part(sphere(0.05, 6, 4), C.maw, [0.98, 0.5, 0.14]),
    part(sphere(0.05, 6, 4), C.maw, [0.98, 0.5, -0.14]),
    // swept-back horns and a crest down the neck
    spike([-0.2, 0.8, 0.3], 0.14, 0.78, horn, 0.55, 1.1),
    spike([-0.2, 0.8, -0.3], 0.14, 0.78, horn, -0.55, 1.1),
    spike([-0.42, 0.74, 0], 0.11, 0.42, horn),
    spike([-0.12, 0.84, 0], 0.08, 0.3, horn),
    ...teeth,
  ];
  if (boss) {
    // a crown of extra horns and cheek blades
    for (const side of [-1, 1]) {
      parts.push(spike([0.12, 0.84, side * 0.12], 0.07, 0.42, C.gold, side * 0.2, 0.6));
      parts.push(spike([0.0, 0.4, side * 0.6], 0.1, 0.55, C.gold, side * 1.3, 0.8));
    }
  }
  const glow = merge([part(sphere(0.15, 10, 8), C.eye, [0.36, 0.75, 0.34], [0, 0, 0], [0.85, 1, 1]), part(sphere(0.15, 10, 8), C.eye, [0.36, 0.75, -0.34], [0, 0, 0], [0.85, 1, 1])]);
  return { body: merge(parts), glow };
}

function ring<T>(n: number, f: (i: number, a: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => f(i, (i / n) * Math.PI * 2));
}

/** Stone tower on a round plaza, gate facing the camera (+z). The crystal on top is returned apart to recolour and bob. */
export function tower() {
  const shades = [C.stone, C.stoneDark, C.stoneLight, 0xa39e93];
  const bricks: BufferGeometry[] = [];
  for (let row = 0; row < 7; row++) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = ((i + (row % 2) * 0.5) / n) * Math.PI * 2;
      // leave the gate opening free on the two lowest rows
      if (row < 2 && Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.42) continue;
      const shade = shades[(row * 7 + i * 3) % shades.length];
      bricks.push(part(box(0.52, 0.34, 0.3, 0.05), shade, [Math.cos(a) * 1.02, 0.42 + row * 0.36, Math.sin(a) * 1.02], [0, -a + Math.PI / 2, 0]));
    }
  }
  const merlons = ring(10, (i, a) => part(box(0.36, 0.38, 0.3, 0.05), shades[i % 3], [Math.cos(a) * 1.2, 3.18, Math.sin(a) * 1.2], [0, -a + Math.PI / 2, 0]));
  const flagstones = ring(14, (i, a) => part(box(0.62, 0.06, 0.42, 0.03), i % 2 ? C.stoneLight : C.stone, [Math.cos(a) * 1.45, 0.21, Math.sin(a) * 1.45], [0, -a + Math.PI / 2, 0]));
  const arch = ring(7, (i) => {
    const a = (i / 6) * Math.PI;
    return part(box(0.2, 0.18, 0.34, 0.04), C.stoneLight, [Math.cos(a) * 0.42, 0.98 + Math.sin(a) * 0.36, 1.06], [0, 0, a - Math.PI / 2]);
  });
  const body = merge([
    part(cyl(1.8, 1.92, 0.2, 14), C.stoneDark, [0, 0.1, 0]),
    ...flagstones,
    part(cyl(0.98, 1.0, 2.7, 14), 0x7d786f, [0, 1.55, 0]),
    ...bricks,
    part(cyl(1.32, 1.12, 0.3, 14), C.stone, [0, 2.88, 0]),
    part(cyl(1.3, 1.3, 0.12, 14), C.stoneDark, [0, 3.02, 0]),
    ...merlons,
    // gate: plank door with iron bands under a stone arch, two steps in front
    part(box(0.66, 0.92, 0.12, 0.03), C.wood, [0, 0.64, 1.0]),
    part(box(0.7, 0.07, 0.14, 0.02), C.iron, [0, 0.42, 1.04]),
    part(box(0.7, 0.07, 0.14, 0.02), C.iron, [0, 0.84, 1.04]),
    part(box(0.05, 0.9, 0.14, 0.02), C.woodDark, [0, 0.64, 1.05]),
    ...arch,
    part(box(0.95, 0.1, 0.36, 0.03), C.stoneLight, [0, 0.25, 1.32]),
    // arrow slits
    part(box(0.12, 0.42, 0.1, 0.03), 0x23262c, [0.62, 2.1, 0.8], [0, 0.65, 0]),
    part(box(0.12, 0.42, 0.1, 0.03), 0x23262c, [-0.62, 2.1, 0.8], [0, -0.65, 0]),
    // blue banners with gold hems on the two front corners
    part(box(0.46, 0.95, 0.05, 0.02), C.banner, [0.86, 2.3, 0.86], [0, 0.785, 0]),
    part(box(0.48, 0.09, 0.07, 0.02), C.gold, [0.87, 1.82, 0.87], [0, 0.785, 0]),
    part(box(0.12, 0.12, 0.07, 0.02), C.gold, [0.88, 2.35, 0.88], [0, 0.785, 0.785]),
    part(box(0.46, 0.95, 0.05, 0.02), C.banner, [-0.86, 2.3, 0.86], [0, -0.785, 0]),
    part(box(0.48, 0.09, 0.07, 0.02), C.gold, [-0.87, 1.82, 0.87], [0, -0.785, 0]),
    part(box(0.12, 0.12, 0.07, 0.02), C.gold, [-0.88, 2.35, 0.88], [0, -0.785, 0.785]),
    // brazier for the crystal
    part(cyl(0.42, 0.26, 0.26, 10), C.iron, [0, 3.22, 0]),
    part(cyl(0.46, 0.46, 0.06, 10), C.goldDark, [0, 3.36, 0]),
  ]);
  const crystal = new OctahedronGeometry(0.42, 0);
  crystal.scale(1, 1.5, 1);
  return { body, crystal };
}

/** Gold trim and two pennants the tower gains at level 3. */
export function towerTrim() {
  return merge([
    part(new TorusGeometry(1.26, 0.06, 6, 28), C.gold, [0, 2.74, 0], [Math.PI / 2, 0, 0]),
    part(cyl(0.035, 0.035, 1.1, 6), C.iron, [0.9, 3.75, -0.5]),
    part(box(0.5, 0.3, 0.03, 0.01), C.gold, [1.14, 4.1, -0.5]),
    part(cyl(0.035, 0.035, 1.1, 6), C.iron, [-0.9, 3.75, -0.5]),
    part(box(0.5, 0.3, 0.03, 0.01), C.gold, [-0.66, 4.1, -0.5]),
  ]);
}

/**
 * A unit on the board: a hooded mage on a stone pedestal, facing the camera (+z). Robe in the level's
 * colour, a dark face under the hood with glowing eyes, a staff whose crystal floats at its top
 * (returned apart so it can bob and spin). Each level adds something you can read at a glance:
 * metal pauldrons (2), a tall wizard hat and a rune band (3), a crown, halo and wings in gold (4).
 */
export function unit(level: number) {
  const col = LEVEL_COLOR[level];
  const dark = LEVEL_DARK[level];
  const trim = level === 4 ? 0xfff3c4 : level === 3 ? C.gold : 0xe6ebf2;
  // the legendary mage wears an ivory hood under a gold crown
  const hood = level === 4 ? 0xfff3c4 : col;
  const k = 0.85 + level * 0.12;
  const y0 = 0.26;
  const sx = 0.38 * k;
  const sz = 0.14 * k;
  const parts: BufferGeometry[] = [
    part(cyl(0.5, 0.58, 0.18, 8), C.stoneDark, [0, 0.09, 0]),
    part(cyl(0.44, 0.5, 0.08, 8), C.stoneLight, [0, 0.22, 0]),
    // robe: a flared cone with a darker front panel and a light hem
    part(cyl(0.15 * k, 0.46 * k, 0.92 * k, 12), col, [0, y0 + 0.46 * k, 0]),
    part(box(0.17 * k, 0.78 * k, 0.05, 0.02), dark, [0, y0 + 0.4 * k, 0.29 * k], [-0.32, 0, 0]),
    part(new TorusGeometry(0.45 * k, 0.035 * k, 6, 24), trim, [0, y0 + 0.03, 0], [Math.PI / 2, 0, 0]),
    part(cyl(0.25 * k, 0.27 * k, 0.07 * k, 12), level >= 2 ? trim : dark, [0, y0 + 0.62 * k, 0]),
    // shoulders, metal from level 2
    part(sphere(0.17 * k, 10, 8), level >= 2 ? trim : col, [0.2 * k, y0 + 0.86 * k, 0], [0, 0, 0], [1.15, 0.72, 1.05]),
    part(sphere(0.17 * k, 10, 8), level >= 2 ? trim : col, [-0.2 * k, y0 + 0.86 * k, 0], [0, 0, 0], [1.15, 0.72, 1.05]),
    // hood with a dark face in its opening
    part(sphere(0.21 * k, 12, 10), hood, [0, y0 + 1.04 * k, -0.02 * k]),
    part(sphere(0.15 * k, 10, 8), 0x14161c, [0, y0 + 1.02 * k, 0.09 * k], [0, 0, 0], [1, 1.05, 0.8]),
    part(new TorusGeometry(0.15 * k, 0.045 * k, 6, 16), dark, [0, y0 + 1.03 * k, 0.12 * k], [0.25, 0, 0]),
    // sleeves reaching for the staff, and the staff itself
    part(cyl(0.07 * k, 0.1 * k, 0.4 * k, 8), col, [0.28 * k, y0 + 0.7 * k, 0.08 * k], [-0.5, 0, 0.75]),
    part(cyl(0.07 * k, 0.1 * k, 0.36 * k, 8), col, [-0.24 * k, y0 + 0.66 * k, 0.12 * k], [-0.8, 0, -0.35]),
    part(sphere(0.06 * k, 8, 6), C.iron, [sx, y0 + 0.62 * k, sz]),
    part(cyl(0.032 * k, 0.04 * k, 1.5 * k, 6), C.wood, [sx, y0 + 0.75 * k, sz]),
    part(cyl(0.06 * k, 0.05 * k, 0.08 * k, 6), trim, [sx, y0 + 1.48 * k, sz]),
    ...ring(3, (_, a) => part(cone(0.03 * k, 0.24 * k, 4), trim, [sx + Math.cos(a) * 0.07 * k, y0 + 1.6 * k, sz + Math.sin(a) * 0.07 * k], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5])),
  ];
  if (level === 1) parts.push(part(cone(0.2 * k, 0.32 * k, 10), col, [0, y0 + 1.22 * k, -0.06 * k], [-0.35, 0, 0]));
  if (level === 2) parts.push(part(cone(0.22 * k, 0.4 * k, 10), col, [0, y0 + 1.25 * k, -0.07 * k], [-0.4, 0, 0]));
  if (level === 3) {
    // a wide-brimmed wizard hat, its tip bent back
    parts.push(part(cyl(0.36 * k, 0.36 * k, 0.04 * k, 16), dark, [0, y0 + 1.18 * k, 0]));
    parts.push(part(cone(0.2 * k, 0.5 * k, 10), col, [0, y0 + 1.44 * k, -0.03 * k], [-0.15, 0, 0]));
    parts.push(part(cone(0.1 * k, 0.32 * k, 8), col, [0, y0 + 1.76 * k, -0.12 * k], [-0.9, 0, 0]));
    parts.push(part(cyl(0.21 * k, 0.21 * k, 0.06 * k, 12), trim, [0, y0 + 1.24 * k, 0]));
  }
  if (level === 4) {
    parts.push(part(cone(0.2 * k, 0.3 * k, 10), hood, [0, y0 + 1.2 * k, -0.06 * k], [-0.3, 0, 0]));
    parts.push(part(cyl(0.2 * k, 0.18 * k, 0.08 * k, 10), C.gold, [0, y0 + 1.22 * k, -0.02 * k]));
    parts.push(...ring(5, (_, a) => part(cone(0.045 * k, 0.2 * k, 4), C.gold, [Math.cos(a) * 0.17 * k, y0 + 1.34 * k, -0.02 * k + Math.sin(a) * 0.17 * k])));
    parts.push(part(new OctahedronGeometry(0.05 * k, 0), 0xff4a6a, [0, y0 + 1.24 * k, 0.17 * k]));
    parts.push(...ring(7, (_, a) => part(cone(0.05, 0.2, 4), C.gold, [Math.cos(a) * 0.5, 0.34, Math.sin(a) * 0.5])));
    // two wings of four feathers, fanned up and out behind the shoulders
    for (const side of [-1, 1])
      for (let f = 0; f < 4; f++) {
        const a = 0.25 + f * 0.3;
        parts.push(part(box(0.58 - f * 0.07, 0.15, 0.05, 0.04), f % 2 ? C.goldDark : C.gold, [side * (0.22 + Math.cos(a) * 0.36) * k, y0 + (0.82 + Math.sin(a) * 0.36) * k, -0.22 * k], [0, 0, side * a]));
      }
  }
  // glow: the eyes, and the rune band on the belt from level 3, drawn unlit
  const glowParts = [
    part(sphere(0.032 * k, 6, 5), 0xffffff, [0.055 * k, y0 + 1.03 * k, 0.21 * k]),
    part(sphere(0.032 * k, 6, 5), 0xffffff, [-0.055 * k, y0 + 1.03 * k, 0.21 * k]),
  ];
  if (level >= 3) glowParts.push(part(new TorusGeometry(0.27 * k, 0.02 * k, 6, 24), 0xffffff, [0, y0 + 0.62 * k, 0], [Math.PI / 2, 0, 0]));
  if (level === 4) glowParts.push(part(new TorusGeometry(0.3 * k, 0.025 * k, 6, 28), 0xffffff, [0, y0 + 1.12 * k, -0.22 * k]));
  const crystalY = y0 + 1.86 * k;
  const crystal = new OctahedronGeometry(0.13 * k + 0.03 * level, 0);
  crystal.scale(1, 1.55, 1);
  const extras: BufferGeometry[] = [];
  if (level >= 2) extras.push(...ring(level === 2 ? 2 : 3, (_, a) => part(new OctahedronGeometry(0.06, 0), col, [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [0, 0, 0], [1, 1.6, 1])));
  if (level >= 3) extras.push(part(new TorusGeometry(0.26, 0.02, 6, 24), level === 4 ? C.gold : col, [0, 0, 0], [Math.PI / 2 - 0.3, 0, 0]));
  return { body: merge(parts), glow: merge(glowParts), crystal, crystalX: sx, crystalZ: sz, crystalY, orbit: extras.length ? merge(extras) : null, color: col };
}

/** The snake's portal: a ring of stones round a hole in the ground, four rune stones standing guard.
 *  Seen from the game's high camera it reads as a well of purple light; runes are a separate glow geometry. */
export function portal() {
  const blocks: BufferGeometry[] = ring(12, (i, a) => part(box(0.62, 0.32, 0.4, 0.07), i % 3 ? C.stone : C.stoneDark, [Math.cos(a) * 1.42, 0.16, Math.sin(a) * 1.42], [0, -a + Math.PI / 2, (i % 2) * 0.08]));
  const runes: BufferGeometry[] = [];
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    const x = Math.cos(a) * 2.0;
    const z = Math.sin(a) * 2.0;
    blocks.push(part(box(0.42, 1.25, 0.34, 0.08), C.stoneDark, [x, 0.62, z], [0, -a, 0.06]));
    blocks.push(part(cone(0.3, 0.35, 4), C.stone, [x, 1.4, z], [0, -a + 0.785, 0]));
    runes.push(part(box(0.1, 0.5, 0.06, 0.02), 0xffffff, [x - Math.cos(a) * 0.15, 0.7, z - Math.sin(a) * 0.15], [0, -a + Math.PI / 2, 0]));
  }
  return { body: merge(blocks), runes: merge(runes) };
}

/** Round low-poly tree: trunk and two or three faceted crowns. */
export function tree(seed: number) {
  const greens = [0x4f9a3a, 0x5fae45, 0x3f8a33, 0x6dbb4f];
  const g = (i: number) => greens[(seed + i) % greens.length];
  const s = 0.85 + ((seed * 37) % 10) / 25;
  return merge([
    part(cyl(0.12, 0.18, 1.0, 6), 0x7a5232, [0, 0.5, 0], [0, 0, 0], [s, s, s]),
    part(new IcosahedronGeometry(0.75, 0), g(0), [0, 1.35 * s, 0], [seed, seed * 2, 0], [s, s * 0.9, s]),
    part(new IcosahedronGeometry(0.55, 0), g(1), [0.35 * s, 1.75 * s, 0.1], [seed * 3, 0, seed], [s, s, s]),
    part(new IcosahedronGeometry(0.5, 0), g(2), [-0.3 * s, 1.65 * s, -0.15], [0, seed, seed * 2], [s, s, s]),
  ]);
}

/** Pine: stacked cones on a short trunk. */
export function pine(seed: number) {
  const s = 0.9 + ((seed * 53) % 10) / 22;
  return merge([
    part(cyl(0.1, 0.14, 0.6, 6), 0x6a4528, [0, 0.3, 0], [0, 0, 0], [s, s, s]),
    part(cone(0.8, 1.0, 7), 0x2f7a3a, [0, 0.95 * s, 0], [0, seed, 0], [s, s, s]),
    part(cone(0.62, 0.85, 7), 0x3a8a44, [0, 1.45 * s, 0], [0, seed * 2, 0], [s, s, s]),
    part(cone(0.42, 0.7, 7), 0x47994c, [0, 1.9 * s, 0], [0, seed * 3, 0], [s, s, s]),
  ]);
}

export function bush(seed: number) {
  const s = 0.7 + ((seed * 29) % 10) / 20;
  return merge([
    part(new IcosahedronGeometry(0.42, 0), 0x4c9a3c, [0, 0.3, 0], [seed, seed, 0], [s, s * 0.8, s]),
    part(new IcosahedronGeometry(0.32, 0), 0x5daf48, [0.3 * s, 0.25, 0.1], [0, seed, seed], [s, s * 0.8, s]),
    part(sphere(0.06, 6, 4), seed % 2 ? 0xff6f91 : 0xfff3a8, [0.1, 0.55 * s, 0.25], [0, 0, 0], [s, s, s]),
  ]);
}

export function stone(seed: number) {
  const s = 0.5 + ((seed * 41) % 10) / 14;
  return part(new DodecahedronGeometry(0.4, 0), seed % 2 ? 0x9b978f : 0xaaa69d, [0, 0.16 * s, 0], [seed, seed * 2, seed * 3], [s, s * 0.6, s * 0.9]);
}

/** One cell of the board: a stone slab with a raised rim, stood in a wooden frame by the game. */
export function boardSlab(size: number) {
  const r = size / 2 - 0.12;
  return merge([
    part(box(size - 0.12, 0.22, size - 0.12, 0.08), C.stoneDark, [0, 0.11, 0]),
    part(box(size - 0.34, 0.08, size - 0.34, 0.05), 0xa9a397, [0, 0.24, 0]),
    part(new TorusGeometry(size * 0.3, 0.035, 4, 24), 0x7d776c, [0, 0.285, 0], [Math.PI / 2, 0, 0]),
    ...ring(4, (_, a) => part(box(0.18, 0.06, 0.18, 0.03), C.stone, [Math.cos(a + 0.785) * r * 0.86, 0.25, Math.sin(a + 0.785) * r * 0.86])),
  ]);
}

/** The board's frame: dark wood planks and iron corners around COLS x ROWS cells. */
export function boardFrame(w: number, d: number) {
  return merge([
    part(box(w + 0.5, 0.18, d + 0.5, 0.08), C.woodDark, [0, 0.06, 0]),
    part(box(w + 0.62, 0.26, 0.26, 0.06), C.wood, [0, 0.13, d / 2 + 0.2]),
    part(box(w + 0.62, 0.26, 0.26, 0.06), C.wood, [0, 0.13, -d / 2 - 0.2]),
    part(box(0.26, 0.26, d + 0.2, 0.06), C.wood, [w / 2 + 0.2, 0.13, 0]),
    part(box(0.26, 0.26, d + 0.2, 0.06), C.wood, [-w / 2 - 0.2, 0.13, 0]),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(box(0.4, 0.3, 0.4, 0.06), C.iron, [sx * (w / 2 + 0.2), 0.15, sz * (d / 2 + 0.2)]))),
  ]);
}

export function coin() {
  return merge([part(cyl(0.22, 0.22, 0.07, 14), C.gold, [0, 0, 0], [Math.PI / 2, 0, 0]), part(cyl(0.13, 0.13, 0.08, 14), C.goldDark, [0, 0, 0], [Math.PI / 2, 0, 0])]);
}

/** Crystal material: lit, coloured, with its own glow so it reads at a distance. */
export function crystalMaterial(color: number) {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.1, flatShading: true });
}

/** Builds the unit as a Group: body, crystal (userData.crystal), orbiting parts (userData.orbit). */
export function unitGroup(level: number) {
  const u = unit(level);
  const g = new Group();
  g.add(new Mesh(u.body, litMaterial()), new Mesh(u.glow, glowMaterial(new Color(u.color).lerp(new Color(0xffffff), 0.45).getHex())));
  const crystal = new Mesh(u.crystal, crystalMaterial(u.color));
  crystal.position.set(u.crystalX, u.crystalY, u.crystalZ);
  g.add(crystal);
  g.userData.crystal = crystal;
  g.userData.crystalY = u.crystalY;
  g.userData.crystalX = u.crystalX;
  g.userData.crystalZ = u.crystalZ;
  if (u.orbit) {
    const orbit = new Mesh(u.orbit, crystalMaterial(u.color));
    orbit.position.set(u.crystalX, u.crystalY, u.crystalZ);
    g.add(orbit);
    g.userData.orbit = orbit;
  }
  g.userData.level = level;
  return g;
}

export { glowMaterial, litMaterial, CylinderGeometry };
