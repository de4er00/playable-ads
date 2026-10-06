// Model stand: every model large under the game's lights, to judge it before it goes into the scene.
import { Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from "three";
import { glowMaterial, litMaterial } from "../../../kit/lowpoly";
import { C, boardFrame, boardSlab, bush, coin, crystalMaterial, pine, portal, snakeHead, snakeSegment, stone, tower, towerTrim, tree, unitGroup } from "./models";
import { lights } from "./scene";

const r = new WebGLRenderer({ antialias: true });
r.setPixelRatio(1);
r.setSize(innerWidth, innerHeight);
document.body.appendChild(r.domElement);
const view = new URLSearchParams(location.search).get("view") || "units";
const scene = new Scene();
scene.background = new Color(0x3a4150);
lights(scene, r);
const cam = new PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
const floor = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: 0x5f9e45, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function add(obj: Group | Mesh, x: number, z: number, s = 1, ry = 0) {
  obj.position.set(x, 0, z);
  obj.scale.setScalar(s);
  obj.rotation.y = ry;
  scene.add(obj);
  return obj;
}

function snake(x: number, z: number, boss: boolean, s: number) {
  const g = new Group();
  const h = snakeHead(boss);
  const head = new Group();
  head.add(new Mesh(h.body, litMaterial()), new Mesh(h.glow, glowMaterial(C.eye)));
  head.position.x = 0.9;
  g.add(head);
  for (let i = 0; i < 4; i++) {
    const m = new Mesh(snakeSegment(boss), litMaterial());
    m.position.x = -i * 0.66;
    m.position.z = Math.sin(i * 0.9) * 0.15;
    m.rotation.y = Math.cos(i * 0.9) * 0.2;
    g.add(m);
  }
  return add(g, x, z, s, -0.5);
}

if (view === "units") {
  for (let l = 1; l <= 4; l++) add(unitGroup(l), -4.5 + (l - 1) * 3, 0, 1.6, 0.3);
  cam.position.set(0, 4.5, 13);
  cam.lookAt(0, 1.6, 0);
} else if (view === "snake") {
  snake(-2.4, 0, false, 1.7);
  snake(3.2, 0.6, true, 1.7);
  cam.position.set(0, 6, 11);
  cam.lookAt(0.4, 0.8, 0);
} else if (view === "tower") {
  const t = tower();
  const g = new Group();
  g.add(new Mesh(t.body, litMaterial()), new Mesh(towerTrim(), litMaterial()));
  const cr = new Mesh(t.crystal, crystalMaterial(0x63f5ff));
  cr.position.y = 3.9;
  g.add(cr);
  add(g, -2.6, 0, 1.2, 0);
  const p = portal();
  const pg = new Group();
  pg.add(new Mesh(p.body, litMaterial()));
  const disc = new Mesh(new PlaneGeometry(2, 2.8), glowMaterial(0xa45bff));
  disc.position.set(0, 1.4, 0);
  pg.add(disc);
  add(pg, 3.4, -0.5, 1.1, -0.3);
  cam.position.set(0, 6, 14);
  cam.lookAt(0.3, 2, 0);
} else if (view === "props") {
  add(new Mesh(tree(1), litMaterial()) as unknown as Group, -5, 0, 1.4);
  add(new Mesh(tree(4), litMaterial()) as unknown as Group, -2.8, -0.5, 1.4);
  add(new Mesh(pine(2), litMaterial()) as unknown as Group, -0.8, 0, 1.4);
  add(new Mesh(bush(3), litMaterial()) as unknown as Group, 1, 0.6, 1.6);
  add(new Mesh(stone(5), litMaterial()) as unknown as Group, 2.4, 0.6, 1.6);
  const c = new Mesh(coin(), litMaterial());
  c.position.set(3.6, 0.5, 0.6);
  c.rotation.y = 0.6;
  c.scale.setScalar(2);
  scene.add(c);
  const board = new Group();
  board.add(new Mesh(boardFrame(6.6, 4.4), litMaterial()));
  for (let i = 0; i < 6; i++) {
    const s = new Mesh(boardSlab(2.2), litMaterial());
    s.position.set(((i % 3) - 1) * 2.2, 0.08, (Math.floor(i / 3) - 0.5) * 2.2);
    board.add(s);
  }
  add(board, 1.5, 5, 0.7);
  cam.position.set(0, 7, 14);
  cam.lookAt(0, 1, 1.5);
}
cam.updateProjectionMatrix();
r.render(scene, cam);
(window as any).READY = true;
