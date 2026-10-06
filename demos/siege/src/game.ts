// Spiral Siege: the 3D meadow (Three.js) under the 2D layer (PixiJS). The rules live in sim.ts;
// this file draws them, turns touches into board moves, and plays the ad for viewers who don't touch.
import {
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  AdditiveBlending,
  DynamicDrawUsage,
} from "three";
import type { Audio } from "../../../kit/audio";
import type { Cta } from "../../../kit/cta";
import { blobTexture, glowMaterial, glowTexture, litMaterial } from "../../../kit/lowpoly";
import { Fx } from "./fx";
import { C, LEVEL_COLOR, boardFrame, boardSlab, crystalMaterial, snakeHead, snakeSegment, tower, towerTrim, unitGroup } from "./models";
import { CENTER, LENGTH, R_OUT, ROAD_WIDTH, pathPoint } from "./path";
import { lights, sky } from "./scene";
import { CELLS, COLS, type Element, type Outcome, SUMMON_COST, type Segment, Sim, type SimEvent, XP_LV2, XP_LV3 } from "./sim";
import { Ui } from "./ui";
import { buildWorld } from "./world";

export interface Variant {
  outcome: Outcome;
  rush: boolean;
}

type State = "play" | "pick" | "end";

const CELL = 3.0;
/** Render scales: the snake fills the road, the tower and units read at phone size. */
const SEG_SCALE = 1.22;
const HEAD_SCALE = 1.4;
const TOWER_SCALE = 1.25;
const UNIT_SCALE = 1.95;
const ELEMENT_TINT: Record<Element, number> = { water: 0x7fe3ff, flash: 0xd9a8ff, fire: 0xffa040 };
const BOSS_SCALE = 1.9;
const BOSS_HEAD_SCALE = 2.3;
/** Idle viewers: the hint hand shows after this long, and the move is made for them after AUTO_AFTER. */
const HINT_AFTER = 1.2;
const AUTO_AFTER = 3;
const AUTO_AGAIN = 1.5;

const obj = new Object3D();
const tint = new Color();
const tmpV = new Vector3();

interface Ghost {
  x: number;
  z: number;
  heading: number;
  boss: boolean;
  t: number;
}

interface AutoMove {
  kind: "merge" | "summon";
  from: number;
  to: number;
  t: number;
}

export class Game {
  state: State = "play";
  stateTime = 0;
  sim: Sim;
  ui = new Ui();
  private scene = new Scene();
  private camera = new PerspectiveCamera(42, 1, 0.1, 300);
  private renderer: WebGLRenderer;
  private fx: Fx;
  private swirl: Mesh;
  private cells: Vector3[] = [];
  private board = new Group();
  private units: (Group | null)[] = Array.from({ length: CELLS }, () => null);
  private unitPop: number[] = Array.from({ length: CELLS }, () => 0);
  private unitDrop: number[] = Array.from({ length: CELLS }, () => 0);
  private towerGroup = new Group();
  private towerCrystal: Mesh;
  private towerTrim: Mesh;
  private towerShake = 0;
  private waveMesh: InstancedMesh;
  private bossMesh: InstancedMesh;
  private shadowMesh: InstancedMesh;
  private waveHead = new Group();
  private bossHead = new Group();
  private flashes = new Map<number, number>();
  private ghosts: Ghost[] = [];
  private pending = new Map<number, { dmg: number; t: number; seg: Segment; style: "hit" | "burn" | "bolt" }>();
  private highlight: Mesh;
  private hero = new Group();
  private rays!: Mesh;
  private ray = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), -0.3);
  private drag: { cell: number; x: number; z: number } | null = null;
  private auto: AutoMove | null = null;
  private interacted = false;
  private idle = 0;
  private shake = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private overTimer = -1;
  private sounds: Record<string, number> = {};
  private camBase = new Vector3();
  private camLook = new Vector3();

  constructor(variant: Variant, private audio: Audio, private cta: Cta) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const c = this.renderer.domElement;
    c.style.position = "fixed";
    c.style.inset = "0";
    document.body.appendChild(c);
    this.sim = new Sim({ outcome: variant.outcome, rush: variant.rush });
    lights(this.scene, this.renderer);
    sky(this.scene);
    const glow = glowTexture();
    // the board's area is kept clear of trees in both layouts
    this.swirl = buildWorld(this.scene, [
      { x: 0, z: CENTER.z + R_OUT + 4.0, r: 6.4 },
      { x: CENTER.x + R_OUT + 5.0, z: CENTER.z + 0.6, r: 6.4 },
    ]).swirl;
    this.fx = new Fx(this.scene, glow);
    this.fx.onCoin = (x, y, z) => {
      const p = this.project(x, y, z);
      this.ui.flyCoin(p.x, p.y);
    };

    const t = tower();
    this.towerGroup.add(new Mesh(t.body, litMaterial()));
    this.towerCrystal = new Mesh(t.crystal, crystalMaterial(0xffffff));
    this.towerCrystal.position.y = 3.95;
    this.towerTrim = new Mesh(towerTrim(), litMaterial());
    this.towerTrim.visible = false;
    this.towerGroup.add(this.towerCrystal, this.towerTrim);
    const towerGlow = new Sprite(new SpriteMaterial({ map: glow, color: 0xffffff, blending: AdditiveBlending, transparent: true, depthWrite: false }));
    towerGlow.position.y = 3.95;
    towerGlow.scale.setScalar(2.2);
    this.towerGroup.add(towerGlow);
    this.towerGroup.userData.glow = towerGlow;
    this.towerGroup.position.set(CENTER.x, 0, CENTER.z);
    this.towerGroup.rotation.y = 0;
    this.scene.add(this.towerGroup);

    this.waveMesh = new InstancedMesh(snakeSegment(false), litMaterial(), this.sim.wave.length + 4);
    this.bossMesh = new InstancedMesh(snakeSegment(true), litMaterial(), 16);
    this.shadowMesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), 80);
    for (const im of [this.waveMesh, this.bossMesh, this.shadowMesh]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      this.scene.add(im);
    }
    this.waveMesh.setColorAt(0, tint.set(0xffffff));
    this.bossMesh.setColorAt(0, tint.set(0xffffff));
    const wh = snakeHead(false);
    this.waveHead.add(new Mesh(wh.body, litMaterial()), new Mesh(wh.glow, glowMaterial(C.eye)));
    this.waveHead.scale.setScalar(HEAD_SCALE);
    const bh = snakeHead(true);
    this.bossHead.add(new Mesh(bh.body, litMaterial()), new Mesh(bh.glow, glowMaterial(0xff5a2a)));
    this.bossHead.scale.setScalar(BOSS_HEAD_SCALE);
    this.bossHead.visible = false;
    this.scene.add(this.waveHead, this.bossHead);

    this.highlight = new Mesh(new RingGeometry(0.78, 0.98, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffd34a, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.highlight.visible = false;
    this.scene.add(this.highlight, this.board);
    this.buildHero(glow);
  }

  async init() {
    await this.ui.init();
    const stage = this.ui.app.stage;
    stage.hitArea = this.ui.app.screen;
    stage.on("pointerdown", (e) => this.down(e.global.x, e.global.y));
    stage.on("pointermove", (e) => this.move(e.global.x, e.global.y));
    stage.on("pointerup", (e) => this.up(e.global.x, e.global.y));
    stage.on("pointerupoutside", (e) => this.up(e.global.x, e.global.y));
    // Networks reject builds whose first tap opens the store: a press only counts after a game touch.
    this.ui.cta.on("pointerdown", (e) => {
      e.stopPropagation();
      const armed = this.interacted;
      this.firstTouch();
      if (armed) this.cta.open();
    });
    this.ui.summon.on("pointerdown", (e) => {
      e.stopPropagation();
      this.firstTouch();
      if (this.state === "play") this.trySummon();
    });
    // a tap on an element card is a game touch too
    this.ui.onTouch = () => this.firstTouch();
    this.resize();
    for (let i = 0; i < CELLS; i++) if (this.sim.board[i]) this.setUnit(i, this.sim.board[i]!.level);
    this.updateUi(0);
    this.render();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  pause() {
    this.renderer.setAnimationLoop(null);
  }

  resume() {
    if (!this.running) return;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.ui.layout(w, h);
    this.placeBoard();
    if (this.state === "end") this.placeEndCamera();
    else this.fitCamera();
    this.render();
  }

  // --- for automated checks -----------------------------------------------------------------
  cellToScreen(i: number) {
    const c = this.cells[i];
    return this.project(c.x, 0.6, c.z);
  }
  summonPoint() {
    return { x: this.ui.summon.x, y: this.ui.summon.y };
  }
  ctaPoint() {
    return { x: this.ui.cta.x, y: this.ui.cta.y };
  }
  /** For captures in a slow headless browser: run the game forward in fixed steps, then draw once. */
  fastForward(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 30) this.step(1 / 30, false);
    this.render();
  }

  // --- layout -----------------------------------------------------------------------------------
  /** Portrait: the board under the spiral. Landscape: right of it, turned so its rows run down the screen. */
  private placeBoard() {
    const portrait = innerHeight >= innerWidth;
    this.board.clear();
    const w = COLS * CELL;
    const d = (CELLS / COLS) * CELL;
    const frame = new Mesh(boardFrame(w, d), litMaterial());
    this.board.add(frame);
    for (let i = 0; i < CELLS; i++) {
      const slab = new Mesh(boardSlab(CELL), litMaterial());
      slab.position.set(((i % COLS) - (COLS - 1) / 2) * CELL, 0.08, (Math.floor(i / COLS) - 0.5) * CELL);
      this.board.add(slab);
    }
    const center = portrait ? new Vector3(0, 0, CENTER.z + R_OUT + 4.0) : new Vector3(CENTER.x + R_OUT + 5.0, 0, CENTER.z + 0.6);
    this.board.position.copy(center);
    this.board.rotation.y = portrait ? 0 : -Math.PI / 2;
    this.board.updateMatrixWorld(true);
    this.cells = Array.from({ length: CELLS }, (_, i) => {
      const local = new Vector3(((i % COLS) - (COLS - 1) / 2) * CELL, 0.3, (Math.floor(i / COLS) - 0.5) * CELL);
      return local.applyMatrix4(this.board.matrixWorld);
    });
    for (let i = 0; i < CELLS; i++) {
      const u = this.units[i];
      if (u) u.position.set(this.cells[i].x, 0.3, this.cells[i].z);
    }
  }

  /**
   * Places the camera at a fixed tilt so the spiral, the portal and the board fill the space between
   * the HUD and the bottom controls. Solved by iteration on the projected bounding box.
   */
  private fitCamera() {
    const w = innerWidth;
    const h = innerHeight;
    const portrait = h >= w;
    const pts: Vector3[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = R_OUT + ROAD_WIDTH / 2 + 0.2;
      pts.push(new Vector3(CENTER.x + Math.cos(a) * r, 0, CENTER.z + Math.sin(a) * r));
    }
    // the portal's well and rune stones, the tower's top, and each cell with the board's frame around it
    const well = pathPoint(-0.4);
    for (const [dx, dz] of [[-2.3, 0], [2.3, 0], [0, -2.3], [0, 2.3]]) pts.push(new Vector3(well.x + dx, 1.6, well.z + dz));
    pts.push(new Vector3(CENTER.x, 4.6 * TOWER_SCALE, CENTER.z));
    for (const c of this.cells) pts.push(new Vector3(c.x - 1.95, 0, c.z - 1.95), new Vector3(c.x + 1.95, 0, c.z + 1.95), new Vector3(c.x, 2.4, c.z));
    const rect = portrait
      ? { x0: 6, x1: w - 6, y0: this.ui.hudBottom + 4, y1: this.ui.xp.y - 22 }
      : { x0: Math.max(this.ui.hudRight, 220) + 24, x1: w - 10, y0: 16, y1: h - 8 };
    const tilt = portrait ? 0.98 : 1.0;
    const dir = new Vector3(0, Math.sin(tilt), Math.cos(tilt));
    this.camera.fov = portrait ? 42 : 36;
    this.camera.updateProjectionMatrix();
    const target = new Vector3(0, 0, -1.5);
    let dist = 30;
    for (let iter = 0; iter < 40; iter++) {
      this.camera.position.copy(target).addScaledVector(dir, dist);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        const s = this.project(p.x, p.y, p.z);
        x0 = Math.min(x0, s.x);
        x1 = Math.max(x1, s.x);
        y0 = Math.min(y0, s.y);
        y1 = Math.max(y1, s.y);
      }
      const f = Math.max((x1 - x0) / (rect.x1 - rect.x0), (y1 - y0) / (rect.y1 - rect.y0));
      const worldPerPx = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
      target.x += (((x0 + x1) / 2 - (rect.x0 + rect.x1) / 2) * worldPerPx) * 0.6;
      target.z += (((y0 + y1) / 2 - (rect.y0 + rect.y1) / 2) * worldPerPx) * 0.6 * 1.3;
      dist *= Math.pow(f, 0.6);
    }
    this.camBase.copy(this.camera.position);
    this.camLook.copy(target);
  }

  private project(x: number, y: number, z: number) {
    const v = tmpV.set(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }

  private groundAt(sx: number, sy: number): Vector3 | null {
    this.ray.setFromCamera(new Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.camera);
    const hit = new Vector3();
    return this.ray.ray.intersectPlane(this.ground, hit) ? hit : null;
  }

  private cellAt(p: Vector3, reach = CELL * 0.62) {
    let best = -1;
    let bd = reach;
    this.cells.forEach((c, i) => {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  // --- input ------------------------------------------------------------------------------------
  private firstTouch() {
    this.idle = 0;
    this.auto = null;
    this.ui.showHand(false);
    if (this.interacted) return;
    this.interacted = true;
    this.audio.unlock();
    this.cta.arm();
  }

  private down(x: number, y: number) {
    this.firstTouch();
    if (this.state !== "play" || this.sim.phase === "over") return;
    const p = this.groundAt(x, y);
    if (!p) return;
    const cell = this.cellAt(p);
    if (cell >= 0 && this.sim.board[cell]) {
      this.drag = { cell, x: p.x, z: p.z };
      this.audio.play("tap");
    }
  }

  private move(x: number, y: number) {
    if (!this.drag) return;
    this.idle = 0;
    const p = this.groundAt(x, y);
    if (!p) return;
    this.drag.x = p.x;
    this.drag.z = p.z;
  }

  private up(x: number, y: number) {
    if (!this.drag) return;
    const from = this.drag.cell;
    const p = this.groundAt(x, y);
    this.drag = null;
    this.highlight.visible = false;
    const to = p ? this.cellAt(p, CELL * 0.75) : -1;
    if (to >= 0 && to !== from && this.sim.move(from, to)) return;
    // dropped nowhere useful: the unit slides home
    this.unitDrop[from] = 0.2;
  }

  private trySummon() {
    if (!this.sim.summon()) {
      this.audio.play("fail");
      this.ui.summon.scale.set(this.ui.summon.base * 0.9);
    }
  }

  // --- loop -------------------------------------------------------------------------------------
  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt, true);
  }

  private step(dt: number, draw: boolean) {
    this.time += dt;
    this.stateTime += dt;
    if (this.state === "play") {
      for (const ev of this.sim.tick(dt)) this.onEvent(ev);
      this.autoplay(dt);
    }
    if (this.overTimer >= 0) {
      this.overTimer -= dt;
      if (this.overTimer < 0) this.showEnd();
    }
    this.drawSnake(dt);
    this.animateUnits(dt);
    this.animateTower(dt);
    this.flushNumbers(dt);
    this.fx.update(dt);
    this.swirl.rotation.z -= dt * 2.2;
    if (this.state === "end") {
      this.rays.rotation.z += dt * 0.25;
      for (const u of this.hero.userData.units as Group[]) {
        const crystal = u.userData.crystal as Mesh;
        crystal.rotation.y += dt * 1.4;
        crystal.position.y = (u.userData.crystalY as number) + Math.sin(this.time * 2.5 + u.position.x) * 0.1;
        const orbit = u.userData.orbit as Mesh | undefined;
        if (orbit) {
          orbit.position.y = crystal.position.y;
          orbit.rotation.y -= dt * 2;
        }
      }
    }
    if (this.state !== "end") {
      this.shake *= Math.pow(0.003, dt);
      const s = this.shake;
      this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * s, this.camBase.y + (Math.random() - 0.5) * s, this.camBase.z);
      this.camera.lookAt(this.camLook);
    }
    this.updateUi(dt);
    if (draw) this.render();
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
    this.ui.app.render();
  }

  private play(name: Parameters<Audio["play"]>[0], gap = 0.07) {
    if (this.time - (this.sounds[name] ?? -9) < gap) return;
    this.sounds[name] = this.time;
    this.audio.play(name);
  }

  /** Untouched ads still have to show the game: the hand demonstrates, then makes the move itself. */
  private autoplay(dt: number) {
    if (this.drag || this.sim.phase !== "run") return;
    this.idle += dt;
    if (this.auto) {
      const a = this.auto;
      a.t += dt;
      if (a.kind === "summon") {
        const b = this.ui.summon;
        this.ui.showHand(true, b.x + 20, b.y + 6, a.t > 0.35);
        if (a.t > 0.45) {
          this.trySummon();
          this.auto = null;
        }
      } else {
        const k = Math.min(1, Math.max(0, (a.t - 0.25) / 0.6));
        const e = k * k * (3 - 2 * k);
        const from = this.cells[a.from];
        const to = this.cells[a.to];
        const x = from.x + (to.x - from.x) * e;
        const z = from.z + (to.z - from.z) * e;
        const u = this.units[a.from];
        if (u && a.t > 0.25) u.position.set(x, 0.3 + Math.sin(k * Math.PI) * 0.9, z);
        const p = this.project(x, 0.8, z);
        this.ui.showHand(true, p.x + 8, p.y + 10, a.t > 0.2);
        if (a.t > 0.95) {
          this.auto = null;
          if (!this.sim.move(a.from, a.to)) this.unitDrop[a.from] = 0.2;
        }
      }
      if (!this.auto) {
        this.ui.showHand(false);
        this.idle = AUTO_AFTER - AUTO_AGAIN;
      }
      return;
    }
    const s = this.sim.suggest();
    if (!s) {
      this.ui.showHand(false);
      return;
    }
    if (this.idle > AUTO_AFTER) {
      this.auto = s.kind === "merge" ? { kind: "merge", from: s.from, to: s.to, t: 0 } : { kind: "summon", from: -1, to: -1, t: 0 };
      return;
    }
    if (this.idle > HINT_AFTER) {
      // the hint: a hand sliding from one unit to its twin, or tapping the summon button
      const k = ((this.idle - HINT_AFTER) % 1.2) / 1.2;
      if (s.kind === "merge") {
        const a = this.cellToScreen(s.from);
        const b = this.cellToScreen(s.to);
        const e = Math.min(1, k / 0.7);
        this.ui.showHand(true, a.x + (b.x - a.x) * e + 8, a.y + (b.y - a.y) * e + 10, k < 0.8, this.interacted ? "" : "MERGE TWO ALIKE!");
      } else {
        const b = this.ui.summon;
        this.ui.showHand(true, b.x + 20, b.y + 6, k > 0.5, "");
      }
    } else this.ui.showHand(false);
  }

  // --- events -----------------------------------------------------------------------------------
  private segPos(seg: Segment) {
    const p = pathPoint(seg.s);
    return new Vector3(p.x, seg.boss ? 1.1 : 0.55, p.z);
  }

  private onEvent(ev: SimEvent) {
    switch (ev.type) {
      case "shot": {
        const u = this.units[ev.cell];
        const level = this.sim.board[ev.cell]?.level ?? 1;
        const from = u ? new Vector3(u.position.x + (u.userData.crystalX as number) * UNIT_SCALE, u.position.y + (u.userData.crystalY as number) * UNIT_SCALE, u.position.z + (u.userData.crystalZ as number) * UNIT_SCALE) : this.cells[ev.cell].clone();
        const seg = ev.target;
        const to = this.segPos(seg);
        const el = this.sim.element;
        const color = el ? ELEMENT_TINT[el] : LEVEL_COLOR[level];
        if (u) u.userData.kick = 1;
        this.fx.flash(from.x, from.y, from.z, color, 1.0, 0.12);
        this.play("tap", 0.09);
        this.fx.bolt(from, to, color, 0.8 + level * 0.25, () => {
          const at = this.segPos(seg);
          this.fx.flash(at.x, at.y, at.z, ev.crit ? 0xffe27a : color, ev.crit ? 2.2 : 1.3, 0.16);
          this.flashes.set(seg.id, 0.1);
          if (ev.crit) {
            const p = this.project(at.x, at.y + 0.8, at.z);
            this.ui.float(p.x, p.y, String(ev.dmg), "crit");
          } else this.addNumber(seg, ev.dmg, "hit");
          if (el === "water" && Math.random() < 0.4) this.fx.ring(at.x, at.z, 0x9fe8ff, 1.2, 0.35);
          if (el === "fire") this.fx.flash(at.x, at.y + 0.3, at.z, 0xff7a2a, 1.1, 0.3, 1.5);
        });
        break;
      }
      case "chain": {
        const a = this.segPos(ev.from);
        const b = this.segPos(ev.to);
        // the chain jumps the moment the bolt lands
        setTimeout(() => {
          this.fx.chain(a, b, ELEMENT_TINT.flash);
          this.flashes.set(ev.to.id, 0.1);
          this.addNumber(ev.to, ev.dmg, "bolt");
        }, 110);
        break;
      }
      case "burn":
        this.addNumber(ev.target, ev.dmg, "burn");
        break;
      case "kill": {
        const p = pathPoint(ev.seg.s);
        this.ghosts.push({ x: p.x, z: p.z, heading: p.heading, boss: false, t: 0.12 });
        break;
      }
      case "bossShed": {
        const p = pathPoint(ev.seg.s);
        this.ghosts.push({ x: p.x, z: p.z, heading: p.heading, boss: true, t: 0.1 });
        this.shake = Math.max(this.shake, 0.25);
        break;
      }
      case "bossDown": {
        const p = pathPoint(ev.seg.s);
        this.ghosts.push({ x: p.x, z: p.z, heading: p.heading, boss: true, t: 0.05 });
        this.bossHead.visible = false;
        this.fx.coinDrop(p.x, p.z, 12);
        this.ui.whiteFlash(0.9);
        this.shake = 1.2;
        this.play("boom", 0);
        this.ui.showBanner("VICTORY!", 0xffd34a, "The tower stands");
        break;
      }
      case "bite": {
        this.towerShake = 0.5;
        this.ui.hurt();
        const p = this.project(CENTER.x, 2.4, CENTER.z);
        if (ev.base > 0) {
          this.ui.popText(p.x + 40, p.y, "-4%", 0xff5a4a, 34);
          this.play("hit", 0.15);
          this.fx.burst(CENTER.x, 1.2, CENTER.z + 1.1, C.stone, 5, 0.16, 3);
        } else {
          // the boss breaks through
          this.shake = 1.4;
          this.fx.burst(CENTER.x, 1.8, CENTER.z, C.stone, 40, 0.3, 7);
          this.fx.flash(CENTER.x, 2, CENTER.z, 0xff6a3a, 6, 0.4);
          this.play("slam", 0);
          this.play("fail", 0);
          this.ui.showBanner("SO CLOSE!", 0xffd34a, `Boss at ${Math.max(1, Math.round((this.sim.boss.hp / this.sim.boss.maxHp) * 100))}%`);
        }
        break;
      }
      case "summon": {
        this.setUnit(ev.cell, 1);
        this.unitDrop[ev.cell] = 1;
        this.play("whoosh", 0);
        break;
      }
      case "merge": {
        const from = this.units[ev.from];
        if (from) this.scene.remove(from);
        this.units[ev.from] = null;
        this.setUnit(ev.to, ev.level);
        this.unitPop[ev.to] = 1;
        const c = this.cells[ev.to];
        this.fx.ring(c.x, c.z, LEVEL_COLOR[ev.level], 2.6, 0.5);
        this.fx.flash(c.x, 1.2, c.z, 0xffffff, 3.2, 0.25);
        this.fx.burst(c.x, 1, c.z, LEVEL_COLOR[ev.level], 14, 0.14, 4);
        const p = this.project(c.x, 2.4, c.z);
        if (ev.level === 4) {
          this.ui.whiteFlash(0.7);
          this.ui.popText(p.x, p.y - 20, "LEGENDARY!", 0xffd34a, 40);
          this.play("card", 0);
          this.shake = 0.5;
        } else this.ui.popText(p.x, p.y - 20, `LV ${ev.level}!`, LEVEL_COLOR[ev.level], 40);
        this.play("gate", 0);
        break;
      }
      case "move": {
        const u = this.units[ev.from];
        this.units[ev.to] = u;
        this.units[ev.from] = null;
        this.unitDrop[ev.to] = 0.2;
        break;
      }
      case "level": {
        if (ev.level === 3) this.ui.showBanner("TOWER LV 3!", 0x7fd8ff, "+25% damage");
        this.fx.ring(CENTER.x, CENTER.z, 0xffd34a, 4, 0.6);
        this.towerShake = 0.3;
        if (ev.level === 3) this.towerTrim.visible = true;
        this.play("win", 0);
        break;
      }
      case "pick":
        this.state = "pick";
        this.drag = null;
        this.auto = null;
        this.ui.showHand(false);
        this.ui.pickCard(["water", "flash", "fire"]).then((el) => {
          this.idle = 0;
          this.sim.choose(el);
          this.state = "play";
        });
        this.play("card", 0);
        break;
      case "picked": {
        const t = ELEMENT_TINT[ev.element];
        (this.towerCrystal.material as MeshStandardMaterial).color.set(t);
        (this.towerCrystal.material as MeshStandardMaterial).emissive.set(t);
        (this.towerGroup.userData.glow as Sprite).material.color.set(t);
        this.fx.ring(CENTER.x, CENTER.z, t, 6, 0.7);
        this.ui.showBanner(ev.element === "water" ? "FROST!" : ev.element === "flash" ? "CHAIN BOLT!" : "WILDFIRE!", t);
        break;
      }
      case "bossSpawn": {
        this.ui.showBanner("BOSS!", 0xff5a4a, "Defend the tower");
        this.play("alert", 0);
        this.shake = 0.6;
        const p = pathPoint(0);
        this.fx.flash(p.x, 1.6, p.z, 0xc07bff, 5, 0.5);
        break;
      }
      case "over":
        this.overTimer = 2.0;
        this.ui.showHand(false);
        break;
    }
  }

  /** Numbers are pooled for a moment so a burst of hits reads as one: per segment, or across the boss's whole body. */
  private addNumber(seg: Segment, dmg: number, style: "hit" | "burn" | "bolt") {
    const key = (seg.boss ? 0 : seg.id) * 4 + (style === "hit" ? 0 : style === "burn" ? 1 : 2);
    const cur = this.pending.get(key);
    if (cur) cur.dmg += dmg;
    else this.pending.set(key, { dmg, t: seg.boss ? 0.2 : 0.12, seg, style });
  }

  private flushNumbers(dt: number) {
    for (const [key, n] of this.pending) {
      n.t -= dt;
      if (n.t > 0) continue;
      this.pending.delete(key);
      const at = n.seg.boss ? this.bossHeadPos() : pathPoint(n.seg.s);
      const p = this.project(at.x + (Math.random() - 0.5) * 0.6, n.seg.boss ? 2.6 : 1.2, at.z);
      this.ui.float(p.x, p.y, String(Math.round(n.dmg)), n.style);
    }
  }

  private bossHeadPos() {
    const head = this.sim.bossTrain[0];
    return head ? pathPoint(head.s) : pathPoint(LENGTH);
  }

  // --- drawing ----------------------------------------------------------------------------------
  private setUnit(i: number, level: number) {
    const old = this.units[i];
    if (old) this.scene.remove(old);
    const g = unitGroup(level);
    g.position.set(this.cells[i].x, 0.3, this.cells[i].z);
    g.scale.setScalar(UNIT_SCALE);
    g.userData.kick = 0;
    this.scene.add(g);
    this.units[i] = g;
  }

  /** Positions every visible segment along the road with a slither, flashes the ones just hit. */
  private drawSnake(dt: number) {
    for (const [id, t] of this.flashes) {
      if (t - dt <= 0) this.flashes.delete(id);
      else this.flashes.set(id, t - dt);
    }
    let shadows = 0;
    const put = (mesh: InstancedMesh, i: number, seg: { s: number; id: number; burn?: number }, scale: number) => {
      const p = pathPoint(seg.s);
      const wig = Math.sin(seg.s * 1.6 - this.time * 7) * 0.12;
      const nx = Math.sin(p.heading);
      const nz = -Math.cos(p.heading);
      const hit = this.flashes.get(seg.id) ?? 0;
      obj.position.set(p.x + nx * wig, Math.abs(Math.sin(seg.s * 1.6 - this.time * 7)) * 0.05, p.z + nz * wig);
      obj.rotation.set(0, -p.heading + Math.cos(seg.s * 1.6 - this.time * 7) * 0.25, 0);
      obj.scale.setScalar(scale * (1 + hit * 1.6) * (seg.s < 0.3 ? Math.max(0, (seg.s + 0.3) / 0.6) : 1));
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
      if (hit > 0) tint.setRGB(2.4, 2.4, 2.4);
      else if ((seg.burn ?? 0) > 0) tint.setRGB(1.5, 0.95, 0.6);
      else if (this.sim.element === "water") tint.setRGB(0.82, 0.95, 1.35);
      else tint.setRGB(1, 1, 1);
      mesh.setColorAt(i, tint);
      if (shadows < 80) {
        obj.position.y = 0.04;
        obj.rotation.set(0, 0, 0);
        obj.scale.setScalar(scale * 1.25);
        obj.updateMatrix();
        this.shadowMesh.setMatrixAt(shadows++, obj.matrix);
      }
      if ((seg.burn ?? 0) > 0 && Math.random() < dt * 8) this.fx.flash(p.x, 0.6 * scale, p.z, Math.random() < 0.5 ? 0xff8a2a : 0xffd34a, 0.9 * scale, 0.35, 2);
    };
    let n = 0;
    const wave = this.sim.wave;
    for (let i = 1; i < wave.length; i++) if (wave[i].s > -0.3) put(this.waveMesh, n++, wave[i], SEG_SCALE);
    // ghosts: segments the sim has already removed, shown flashing until their bolt lands
    for (const g of this.ghosts) {
      if (g.boss) continue;
      obj.position.set(g.x, 0, g.z);
      obj.rotation.set(0, -g.heading, 0);
      obj.scale.setScalar(SEG_SCALE * 1.25);
      obj.updateMatrix();
      this.waveMesh.setMatrixAt(n, obj.matrix);
      this.waveMesh.setColorAt(n, tint.setRGB(2.6, 2.6, 2.6));
      n++;
    }
    this.waveMesh.count = n;
    this.waveMesh.instanceMatrix.needsUpdate = true;
    if (this.waveMesh.instanceColor) this.waveMesh.instanceColor.needsUpdate = true;

    const head = wave[0];
    this.waveHead.visible = !!head && head.s > -0.3;
    if (head) {
      const p = pathPoint(head.s);
      const hit = this.flashes.get(head.id) ?? 0;
      this.waveHead.position.set(p.x, 0, p.z);
      this.waveHead.rotation.y = -p.heading + Math.sin(this.time * 7) * 0.12;
      this.waveHead.scale.setScalar(HEAD_SCALE * (1 + hit * 1.4) * (head.s < 0.3 ? Math.max(0.01, (head.s + 0.3) / 0.6) : 1));
      obj.position.set(p.x, 0.04, p.z);
      obj.rotation.set(0, 0, 0);
      obj.scale.setScalar(HEAD_SCALE * 1.4);
      obj.updateMatrix();
      if (shadows < 80) this.shadowMesh.setMatrixAt(shadows++, obj.matrix);
    }

    let b = 0;
    const train = this.sim.bossTrain;
    for (let i = 1; i < train.length; i++) if (train[i].s > -0.3) put(this.bossMesh, b++, train[i], BOSS_SCALE);
    this.bossMesh.count = b;
    this.bossMesh.instanceMatrix.needsUpdate = true;
    if (this.bossMesh.instanceColor) this.bossMesh.instanceColor.needsUpdate = true;
    const bh = train[0];
    this.bossHead.visible = !!bh && this.sim.boss.alive && bh.s > -0.5;
    if (bh) {
      const p = pathPoint(bh.s);
      const hit = this.flashes.get(bh.id) ?? 0;
      this.bossHead.position.set(p.x, 0, p.z);
      this.bossHead.rotation.y = -p.heading + Math.sin(this.time * 5) * 0.1;
      this.bossHead.scale.setScalar(BOSS_HEAD_SCALE * (1 + hit * 0.5) * (bh.s < 0.5 ? Math.max(0.01, (bh.s + 0.5) / 1) : 1));
    }
    this.shadowMesh.count = shadows;
    this.shadowMesh.instanceMatrix.needsUpdate = true;

    // ghosts pop once their time is up
    for (const g of this.ghosts) {
      g.t -= dt;
      if (g.t > 0) continue;
      const k = g.boss ? BOSS_SCALE : SEG_SCALE;
      this.fx.burst(g.x, 0.5 * k, g.z, g.boss ? C.crimson : C.red, g.boss ? 14 : 8, 0.15 * k, 4.5);
      this.fx.burst(g.x, 0.7 * k, g.z, g.boss ? C.gold : C.silver, g.boss ? 5 : 3, 0.12 * k, 5);
      this.fx.flash(g.x, 0.6 * k, g.z, 0xffe0c0, 2.2 * k, 0.2);
      this.fx.coinDrop(g.x, g.z, g.boss ? 3 : 1);
      this.play("hit", 0.08);
      this.play("coin", 0.12);
    }
    this.ghosts = this.ghosts.filter((g) => g.t > 0);
  }

  private animateUnits(dt: number) {
    // the dragged unit follows the finger, lifted; its possible targets light up
    this.highlight.visible = false;
    if (this.drag) {
      const u = this.units[this.drag.cell];
      if (u) u.position.set(this.drag.x, 1.1, this.drag.z);
      const target = this.cellAt(new Vector3(this.drag.x, 0, this.drag.z), CELL * 0.75);
      if (target >= 0 && target !== this.drag.cell) {
        const ok = this.sim.canMerge(this.drag.cell, target) || !this.sim.board[target];
        this.highlight.visible = ok;
        this.highlight.position.set(this.cells[target].x, 0.42, this.cells[target].z);
        (this.highlight.material as MeshBasicMaterial).color.set(this.sim.canMerge(this.drag.cell, target) ? 0xffd34a : 0xffffff);
        this.highlight.scale.setScalar(1 + Math.sin(this.time * 10) * 0.06);
      }
    }
    for (let i = 0; i < CELLS; i++) {
      const u = this.units[i];
      if (!u) continue;
      const crystal = u.userData.crystal as Mesh;
      const cy = u.userData.crystalY as number;
      u.userData.kick = Math.max(0, (u.userData.kick as number) - dt * 6);
      crystal.position.y = cy + Math.sin(this.time * 3 + i) * 0.08 + (u.userData.kick as number) * 0.12;
      crystal.rotation.y += dt * 1.6;
      crystal.scale.setScalar(1 + (u.userData.kick as number) * 0.25);
      const orbit = u.userData.orbit as Mesh | undefined;
      if (orbit) {
        orbit.position.y = crystal.position.y;
        orbit.rotation.y -= dt * 2.4;
      }
      const dragged = this.drag?.cell === i || (this.auto?.kind === "merge" && this.auto.from === i && this.auto.t > 0.25);
      if (dragged) continue;
      // summon drops from the sky and squashes on landing; moves and failed drops slide home
      const home = this.cells[i];
      if (this.unitDrop[i] > 0) {
        this.unitDrop[i] = Math.max(0, this.unitDrop[i] - dt * 3);
        const k = this.unitDrop[i];
        if (k > 0.25) u.position.set(home.x, 0.3 + (k - 0.25) * 8, home.z);
        else {
          u.position.lerp(tmpV.set(home.x, 0.3, home.z), Math.min(1, dt * 18));
          if (k === 0) {
            this.unitPop[i] = Math.max(this.unitPop[i], 0.6);
            this.fx.ring(home.x, home.z, 0xffffff, 1.8, 0.35);
          }
        }
      } else u.position.lerp(tmpV.set(home.x, 0.3, home.z), Math.min(1, dt * 14));
      this.unitPop[i] = Math.max(0, this.unitPop[i] - dt * 2.5);
      const pk = this.unitPop[i];
      u.scale.set(UNIT_SCALE * (1 + Math.sin(pk * Math.PI) * 0.35), UNIT_SCALE * (1 + Math.sin(pk * Math.PI * 2) * 0.25), UNIT_SCALE * (1 + Math.sin(pk * Math.PI) * 0.35));
    }
  }

  private animateTower(dt: number) {
    this.towerShake = Math.max(0, this.towerShake - dt * 2);
    const s = this.towerShake;
    this.towerGroup.position.set(CENTER.x + (Math.random() - 0.5) * s * 0.3, 0, CENTER.z + (Math.random() - 0.5) * s * 0.3);
    this.towerGroup.scale.set(TOWER_SCALE * (1 + s * 0.12), TOWER_SCALE * (1 - s * 0.1), TOWER_SCALE * (1 + s * 0.12));
    this.towerCrystal.rotation.y += dt * 1.2;
    this.towerCrystal.position.y = 3.95 + Math.sin(this.time * 2.4) * 0.1;
  }

  private updateUi(dt: number) {
    if (this.state === "end") {
      this.ui.update(dt);
      return;
    }
    this.ui.setCoins(this.sim.coins);
    this.ui.setSummon(SUMMON_COST, this.sim.coins >= SUMMON_COST && this.sim.board.some((u) => !u));
    const tp = this.project(CENTER.x, 5.0 * TOWER_SCALE, CENTER.z);
    this.ui.setTower(tp.x, tp.y - 6, this.sim.level, this.sim.base);
    const lvl = this.sim.level;
    const frac = lvl === 1 ? this.sim.xp / XP_LV2 : lvl === 2 ? (this.sim.xp - XP_LV2) / (XP_LV3 - XP_LV2) : 1;
    this.ui.setXp(Math.min(lvl, 3), Math.min(1, frac));
    for (let i = 0; i < CELLS; i++) {
      const u = this.sim.board[i];
      const g = this.units[i];
      if (!u || !g) this.ui.setPip(i, 0, 0, 0);
      else {
        const p = this.project(g.position.x - 0.7, g.position.y + 0.1, g.position.z + 0.75);
        this.ui.setPip(i, p.x, p.y, u.level);
      }
    }
    if (this.sim.boss.alive && this.sim.bossTrain[0] && this.sim.bossTrain[0].s > 0) {
      const h = this.bossHeadPos();
      const p = this.project(h.x, 3.6, h.z);
      this.ui.setBoss(Math.min(innerWidth - 112, Math.max(112, p.x)), Math.max(this.ui.hudBottom + 40, p.y - 20), this.sim.boss.hp / this.sim.boss.maxHp, this.sim.boss.hp, true);
    } else this.ui.setBoss(0, 0, 0, 0, false);
    this.ui.update(dt);
  }

  // --- end card ---------------------------------------------------------------------------------
  private buildHero(glow: ReturnType<typeof glowTexture>) {
    // End-card key art, rendered in 3D: the legendary unit flanked by the epic and rare ones,
    // on a stone dais, against a rotating sunburst.
    const lineup: [number, number, number, number][] = [
      [4, 0, 0, 1.75],
      [3, -2.5, -1.1, 1.3],
      [2, 2.5, -1.1, 1.2],
    ];
    const units: Group[] = [];
    for (const [level, x, z, scale] of lineup) {
      const u = unitGroup(level);
      u.position.set(x, 0.3, z);
      u.scale.setScalar(scale);
      u.rotation.y = -x * 0.12;
      this.hero.add(u);
      units.push(u);
    }
    this.hero.userData.units = units;
    const dais = new Mesh(boardSlab(7.5), litMaterial());
    dais.scale.set(1, 1.2, 0.55);
    dais.position.set(0, 0, -0.5);
    this.hero.add(dais);
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    grad.addColorStop(0, "#fff3c4");
    grad.addColorStop(0.18, "#ffb347");
    grad.addColorStop(0.5, "#c2410c");
    grad.addColorStop(1, "#9a3412");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * Math.PI * 2;
      g.beginPath();
      g.moveTo(256, 256);
      g.arc(256, 256, 400, a0, a0 + Math.PI / 30);
      g.fill();
    }
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    this.rays = new Mesh(new PlaneGeometry(44, 44), new MeshBasicMaterial({ map: tex, toneMapped: false, depthWrite: false }));
    this.rays.position.set(0, 2.2, -3);
    this.hero.add(this.rays);
    for (let i = 0; i < 5; i++) {
      const s = new Sprite(new SpriteMaterial({ map: glow, color: 0xffe0a0, blending: AdditiveBlending, transparent: true, depthWrite: false }));
      s.position.set((Math.random() - 0.5) * 6, 1 + Math.random() * 3, -1.5);
      s.scale.setScalar(2 + Math.random() * 2);
      this.hero.add(s);
    }
    this.hero.position.set(0, 0, 34);
    this.hero.visible = false;
    this.scene.add(this.hero);
  }

  /** Portrait: the hero in the middle. Landscape: the camera slides right so the hero stands in the left third. */
  private placeEndCamera() {
    const z = this.hero.position.z;
    const portrait = innerHeight >= innerWidth;
    this.camera.fov = portrait ? 50 : 40;
    this.camera.updateProjectionMatrix();
    const dist = portrait ? 15 : 11;
    const half = dist * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect;
    const dx = portrait ? 0 : half * 0.42;
    this.camera.position.set(dx, 3.4, z + dist);
    this.camera.lookAt(dx, portrait ? 2.2 : 2.4, z);
  }

  private showEnd() {
    this.state = "end";
    this.stateTime = 0;
    this.hero.visible = true;
    this.placeEndCamera();
    const won = this.sim.outcome === "win";
    this.ui.showEnd(won ? "VICTORY!" : "SO CLOSE!", won ? "Merge your way to Legendary" : "Merge stronger and win", [1, 2, 4, 3], this.sim.element);
    // the whole end card is the button; the first-ever tap still only arms it
    const press = (e: { stopPropagation(): void }) => {
      e.stopPropagation();
      const armed = this.interacted;
      this.firstTouch();
      if (armed) this.cta.open();
    };
    this.ui.endCta.on("pointerdown", press);
    this.ui.app.stage.on("pointerdown", (e) => {
      if (this.state === "end") press(e);
    });
    this.cta.end();
    this.play("win", 0);
  }
}

