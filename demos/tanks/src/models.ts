// Low-poly models built from primitives in code: no textures, no glTF.
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  Shape,
  SphereGeometry,
} from "three";
import { ARENA } from "./sim";

export const PALETTE = {
  sandA: 0xe8d3a0,
  sandB: 0xdcc58f,
  wall: 0x8c7a62,
  wallTop: 0xa8977d,
  crate: 0xc8893f,
  crateDark: 0x7e5321,
  player: 0x47b04f,
  playerDark: 0x2b7a33,
  enemy: 0xe2533d,
  enemyDark: 0x9c2f22,
  track: 0x2b2e35,
  metal: 0x5d6470,
  shell: 0xffe36e,
  outline: 0x1b1b22,
};

const outlineMat = new MeshBasicMaterial({ color: PALETTE.outline, side: BackSide });

/** Toon look: a slightly larger back-face copy behind the mesh reads as an outline. */
function outlined(mesh: Mesh, thickness = 1.06): Group {
  const g = new Group();
  const shell = new Mesh(mesh.geometry, outlineMat);
  shell.position.copy(mesh.position);
  shell.rotation.copy(mesh.rotation);
  shell.scale.copy(mesh.scale).multiplyScalar(thickness);
  g.add(shell, mesh);
  return g;
}

function lambert(color: number) {
  return new MeshLambertMaterial({ color, flatShading: true });
}

export function blobShadow(radius: number): Mesh {
  const m = new Mesh(new CircleGeometry(radius, 24), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

export function ground(): Group {
  const g = new Group();
  const w = ARENA.halfW * 2;
  const d = ARENA.halfD * 2;
  const geo = new PlaneGeometry(w, d, w, d).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i += 6) {
    // two triangles per tile share one colour; checker plus per-tile noise
    const x = Math.floor(pos.getX(i) + ARENA.halfW + 0.001);
    const z = Math.floor(pos.getZ(i) + ARENA.halfD + 0.001);
    const n = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    c.setHex((x + z) % 2 ? PALETTE.sandA : PALETTE.sandB).offsetHSL(0, 0, (n - 0.5) * 0.05);
    for (let k = 0; k < 6; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  g.add(new Mesh(geo, new MeshLambertMaterial({ vertexColors: true })));
  // a low wall around the arena
  const wallMat = lambert(PALETTE.wall);
  const topMat = lambert(PALETTE.wallTop);
  for (const [x, z, sx, sz] of [
    [0, -ARENA.halfD - 0.4, w + 1.6, 0.8],
    [0, ARENA.halfD + 0.4, w + 1.6, 0.8],
    [-ARENA.halfW - 0.4, 0, 0.8, d],
    [ARENA.halfW + 0.4, 0, 0.8, d],
  ]) {
    const wall = new Mesh(new BoxGeometry(sx, 0.9, sz), wallMat);
    wall.position.set(x, 0.45, z);
    const cap = new Mesh(new BoxGeometry(sx + 0.1, 0.12, sz + 0.1), topMat);
    cap.position.set(x, 0.95, z);
    g.add(wall, cap);
  }
  return g;
}

export function crate(): Group {
  const box = new Mesh(new BoxGeometry(0.9, 0.9, 0.9), lambert(PALETTE.crate));
  box.position.y = 0.45;
  const g = outlined(box);
  const strapMat = lambert(PALETTE.crateDark);
  for (const r of [0, Math.PI / 2]) {
    const strap = new Mesh(new BoxGeometry(0.95, 0.12, 0.95), strapMat);
    strap.position.y = 0.45;
    strap.rotation.x = r;
    strap.scale.set(1, 1, 0.14);
    g.add(strap);
  }
  g.add(blobShadow(0.7));
  return g;
}

export function lowWall(w: number, d: number): Group {
  const m = new Mesh(new BoxGeometry(w, 0.7, d), lambert(PALETTE.wall));
  m.position.y = 0.35;
  const g = outlined(m, 1.04);
  const cap = new Mesh(new BoxGeometry(w + 0.08, 0.1, d + 0.08), lambert(PALETTE.wallTop));
  cap.position.y = 0.72;
  g.add(cap);
  return g;
}

export interface TankModel {
  root: Group;
  turret: Group;
  barrel: Group;
  hull: Group;
}

export function tank(color: number, dark: number): TankModel {
  const root = new Group();
  const hull = new Group();
  const trackMat = lambert(PALETTE.track);
  const wheelMat = lambert(PALETTE.metal);
  for (const side of [-1, 1]) {
    const track = new Mesh(new BoxGeometry(0.42, 0.42, 1.75), trackMat);
    track.position.set(side * 0.62, 0.24, 0);
    hull.add(outlined(track, 1.05));
    for (let k = 0; k < 4; k++) {
      const wheel = new Mesh(new CylinderGeometry(0.16, 0.16, 0.1, 10), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.85, 0.22, -0.6 + k * 0.4);
      hull.add(wheel);
    }
  }
  const shape = new Shape();
  const hw = 0.55;
  const hd = 0.78;
  const r = 0.18;
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const body = new Mesh(
    new ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 3 }),
    lambert(color),
  );
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.66;
  hull.add(outlined(body, 1.05));

  const turret = new Group();
  turret.position.y = 0.7;
  const dome = new Mesh(new CylinderGeometry(0.4, 0.46, 0.3, 10), lambert(dark));
  dome.position.y = 0.14;
  turret.add(outlined(dome, 1.07));
  const barrel = new Group();
  const tube = new Mesh(new CylinderGeometry(0.1, 0.12, 1.0, 8), lambert(PALETTE.metal));
  tube.rotation.z = Math.PI / 2;
  tube.position.set(0.68, 0.16, 0);
  const muzzle = new Mesh(new CylinderGeometry(0.15, 0.15, 0.16, 8), lambert(PALETTE.track));
  muzzle.rotation.z = Math.PI / 2;
  muzzle.position.set(1.16, 0.16, 0);
  barrel.add(outlined(tube, 1.12), muzzle);
  turret.add(barrel);
  root.add(blobShadow(1.05), hull, turret);
  return { root, turret, barrel, hull };
}

export function bunker(): Group {
  const g = new Group();
  const base = new Mesh(new CylinderGeometry(1.5, 1.8, 1.0, 8), lambert(0x7c8592));
  base.position.y = 0.5;
  const dome = new Mesh(new SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x9aa3af));
  dome.position.y = 1.0;
  const slit = new Mesh(new BoxGeometry(1.2, 0.18, 0.2), lambert(0x22252b));
  slit.position.set(0, 0.75, 1.52);
  const pole = new Mesh(new CylinderGeometry(0.05, 0.05, 1.4, 6), lambert(PALETTE.metal));
  pole.position.set(0.9, 2.0, 0);
  const flag = new Mesh(new BoxGeometry(0.7, 0.42, 0.04), lambert(PALETTE.enemy));
  flag.name = "flag";
  flag.position.set(1.27, 2.45, 0);
  g.add(outlined(base, 1.04), outlined(dome, 1.04), slit, pole, flag, blobShadow(2));
  return g;
}

export function shellMesh(color = PALETTE.shell): Mesh {
  return new Mesh(new SphereGeometry(0.16, 8, 6), new MeshBasicMaterial({ color }));
}

export function chunk(color: number, size: number): Mesh {
  return new Mesh(new BoxGeometry(size, size, size), lambert(color));
}

export function puff(color: number): Mesh {
  return new Mesh(new DodecahedronGeometry(0.5, 0), new MeshBasicMaterial({ color, transparent: true }));
}

export function setColor(obj: Object3D, color: number) {
  obj.traverse((o) => {
    const m = (o as Mesh).material as MeshLambertMaterial | undefined;
    if (m && "color" in m && m.side !== BackSide) m.color.setHex(color);
  });
}
