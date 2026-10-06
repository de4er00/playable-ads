// Model stand: every model large under the game's lights, to judge it before it goes into the scene.
import { Mesh, PerspectiveCamera, Scene, WebGLRenderer, Group, Color } from "three";
import { atmosphere, lights } from "./scene";
import { buildWorld } from "./world";
import { glowTexture, gatePanel as gate2 } from "./models";
import { barricade, bossMech, drone, gatePanel, glowMaterial, litMaterial, miniMech, nut } from "./models";

const r = new WebGLRenderer({ antialias: true });
r.setPixelRatio(1);
r.setSize(innerWidth, innerHeight);
document.body.appendChild(r.domElement);
const view = new URLSearchParams(location.search).get("view") || "units";
const scene = new Scene();
scene.background = new Color(0x3a4150);
lights(scene, r);
const cam = new PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);

function mech(x: number, z: number, s: number, ry = 0) {
  const m = miniMech();
  const g = new Group();
  g.add(new Mesh(m.body, litMaterial()), new Mesh(m.glow, glowMaterial(0xffffff)));
  const l = new Mesh(m.legL, litMaterial());
  const rr = new Mesh(m.legR, litMaterial());
  l.position.y = rr.position.y = m.hip;
  l.rotation.x = 0.3;
  rr.rotation.x = -0.3;
  g.add(l, rr);
  (g.children[1] as Mesh).material = glowMaterial(0x63f5ff);
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  g.rotation.y = ry;
  scene.add(g);
}
function drn(x: number, z: number, s: number, ry = 0) {
  const d = drone();
  const g = new Group();
  g.add(new Mesh(d.body, litMaterial()), new Mesh(d.glow, glowMaterial(0xff8a2a)));
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  g.rotation.y = ry;
  scene.add(g);
}
if (view === "units") {
  mech(-3, 0, 2.2, Math.PI + 0.6);
  mech(-0.6, 0, 2.2, 0.5);
  drn(2.2, 0, 2.6, 0.5);
  drn(4.2, 0, 2.6, -0.7);
  const n = new Mesh(nut(), litMaterial());
  n.position.set(5.6, 0.6, 0.5);
  n.rotation.x = 1.1;
  n.scale.setScalar(1.6);
  scene.add(n);
  for (let i = 0; i < 6; i++) mech(-3 + i * 0.5, 3.2, 0.55, Math.PI);
  for (let i = 0; i < 6; i++) drn(1 + i * 0.6, 3.2, 0.6);
  cam.position.set(0.8, 4.2, 11);
  cam.lookAt(0.8, 1.2, 0.5);
} else if (view === "props") {
  const gp = gatePanel(true, "×2");
  gp.group.position.set(-2.4, 0, 0);
  scene.add(gp.group);
  const gn = gatePanel(false, "-3");
  gn.group.position.set(2.0, 0, 0);
  scene.add(gn.group);
  const bar = barricade();
  const b = new Group();
  b.add(new Mesh(bar.body, litMaterial()), new Mesh(bar.glow, glowMaterial(0xff4a2a)));
  b.position.set(0, 0, 4.5);
  scene.add(b);
  cam.position.set(0, 5, 15);
  cam.lookAt(0, 1.2, 1.5);
} else if (view === "world") {
  atmosphere(scene);
  buildWorld(scene, glowTexture());
  for (let i = 0; i < 30; i++) {
    const a = i * 2.39996;
    const r = 0.38 * Math.sqrt(i + 0.5);
    mech(Math.cos(a) * r, 2 + Math.sin(a) * r, 0.55, Math.PI);
  }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) drn(-3.6 + c * 1.03, -14 - r * 1.05, 0.6);
  const ga = gate2(true, "x2");
  ga.group.position.set(-2.2, 0, -6);
  scene.add(ga.group);
  const gb = gate2(false, "-3");
  gb.group.position.set(2.2, 0, -6);
  scene.add(gb.group);
  cam.fov = 50;
  cam.position.set(0, 13.5, 13);
  cam.lookAt(0, 0, -5);
} else {
  const boss = bossMech();
  boss.group.rotation.y = 0.5;
  scene.add(boss.group);
  for (let i = 0; i < 4; i++) mech(-4 + i * 0.7, 3, 0.55, Math.PI);
  cam.position.set(4, 7, 16);
  cam.lookAt(0, 3.5, 0);
}
cam.aspect = innerWidth / innerHeight;
cam.updateProjectionMatrix();
r.render(scene, cam);
(window as any).READY = true;
