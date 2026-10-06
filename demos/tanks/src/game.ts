// Flow: hook -> hold and drag to aim -> break cover -> destroy three tanks -> the bunker blows -> end card.
import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  type Mesh,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Audio } from "../../../kit/audio";
import type { Cta } from "../../../kit/cta";
import { Fx, recoil } from "./fx";
import { Hud } from "./hud";
import { PALETTE, bunker, crate, ground, lowWall, setColor, shellMesh, tank, type TankModel } from "./models";
import { type Difficulty, PLAYER_START, Sim } from "./sim";

export interface Variant {
  hook: "flyin" | "instant";
  difficulty: Difficulty;
  endcard: "level2" | "upgrade";
}

type State = "intro" | "play" | "finale" | "end";

const IDLE_HINT = 2.5;

export class Game {
  state: State = "intro";
  stateTime = 0;
  private scene = new Scene();
  private camera = new PerspectiveCamera(48, 1, 0.1, 100);
  private renderer: WebGLRenderer;
  private sim: Sim;
  private hud: Hud;
  private fx: Fx;
  private player: TankModel;
  private enemies: TankModel[];
  private crates;
  private bunkerModel = bunker();
  private shells = new Map<object, Mesh>();
  private input = { held: false, x: 0, z: 0 };
  private interacted = false;
  private idle = 0;
  private shake = 0;
  private sinceShot = 1;
  private enemyFlash: number[] = [];
  private camFrom = new Vector3(0, 6, -16);
  private camRest = new Vector3();
  private look = new Vector3(0, 0, -0.5);
  private ray = new Raycaster();
  private floor = new Plane(new Vector3(0, 1, 0), 0);
  private running = false;
  private last = 0;

  constructor(
    canvasHost: HTMLElement,
    private variant: Variant,
    private audio: Audio,
    private cta: Cta,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x2a2338);
    canvasHost.appendChild(this.renderer.domElement);
    this.sim = new Sim(variant.difficulty);
    this.hud = new Hud(this.sim.enemies.length, variant.endcard);
    this.fx = new Fx(this.scene);

    this.scene.add(new HemisphereLight(0xffffff, 0x8a7a66, 1.2), new AmbientLight(0xffffff, 0.25));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 12, 6);
    this.scene.add(sun, ground());

    this.player = tank(PALETTE.player, PALETTE.playerDark);
    this.player.root.position.set(PLAYER_START.x, 0, PLAYER_START.z);
    this.scene.add(this.player.root);
    this.enemies = this.sim.enemies.map((e) => {
      const m = tank(PALETTE.enemy, PALETTE.enemyDark);
      m.root.position.set(e.x, 0, e.z);
      m.hull.rotation.y = Math.PI;
      this.scene.add(m.root);
      this.enemyFlash.push(0);
      return m;
    });
    this.crates = this.sim.crates.map((c) => {
      const m = crate();
      m.position.set(c.x, 0, c.z);
      m.rotation.y = (c.x * 7.1) % 0.4;
      this.scene.add(m);
      return m;
    });
    for (const w of this.sim.walls) {
      const m = lowWall(w.w, w.d);
      m.position.set(w.x, 0, w.z);
      this.scene.add(m);
    }
    this.bunkerModel.position.set(-3.6, 0, -8.2);
    this.scene.add(this.bunkerModel);

    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => this.down(e));
    el.addEventListener("pointermove", (e) => this.move(e));
    addEventListener("pointerup", () => this.up());
    addEventListener("pointercancel", () => this.up());
    // Networks reject builds whose first tap opens the store: a press only counts after a game touch.
    const press = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      const armed = this.interacted;
      this.firstTouch();
      if (armed) this.cta.open();
    };
    this.hud.cta.addEventListener("pointerdown", press);
    this.hud.endCta.parentElement!.parentElement!.addEventListener("pointerdown", press);
    this.resize();
    if (variant.hook === "instant") this.camera.position.copy(this.camRest);
    else this.camera.position.copy(this.camFrom);
    this.camera.lookAt(this.look);
    this.hud.setHint("HOLD & DRAG TO AIM!");
    this.renderer.render(this.scene, this.camera);
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
    this.camera.fov = 45;
    this.camera.updateProjectionMatrix();
    this.frameArena(w, h);
    if (this.state !== "intro") this.camera.position.copy(this.camRest);
  }

  /**
   * Fixed camera angle; solve for distance and target so the whole arena fits the free part of the
   * screen: under the enemy counter, above the CTA in portrait, between the side panels in landscape.
   */
  private frameArena(w: number, h: number) {
    const portrait = h > w;
    const box = portrait
      ? { left: 6, right: w - 6, top: 112, bottom: h - 190 }
      : { left: w * 0.2, right: w * 0.8, top: 64, bottom: h - 12 };
    // In portrait the side walls may run off screen: the play area (x within ±5.8) is what has to fit.
    const halfX = portrait ? 5.8 : 7.4;
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new Vector3(sx * halfX, 0, sz * 10.4)));
    let dist = 16;
    let lz = 0;
    for (let i = 0; i < 60; i++) {
      this.camRest.set(0, dist * 0.94, lz + dist * 0.62);
      this.look.set(0, 0, lz);
      this.camera.position.copy(this.camRest);
      this.camera.lookAt(this.look);
      this.camera.updateMatrixWorld();
      const pts = corners.map((c) => {
        const v = c.clone().project(this.camera);
        return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
      });
      const minX = Math.min(...pts.map((p) => p.x));
      const maxX = Math.max(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const maxY = Math.max(...pts.map((p) => p.y));
      const over = Math.max((maxX - minX) / (box.right - box.left), (maxY - minY) / (box.bottom - box.top));
      dist *= Math.pow(over, 0.5);
      const err = ((minY + maxY) / 2 - (box.top + box.bottom) / 2) / h;
      lz += err * dist * 0.6;
    }
  }

  /** For automated checks. */
  enemyScreen(i: number) {
    const e = this.sim.enemies[i];
    return this.project(e.x, e.z);
  }
  enemyAlive(i: number) {
    return this.sim.enemies[i].alive;
  }
  ctaPoint() {
    const r = this.hud.cta.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private project(x: number, z: number) {
    const v = new Vector3(x, 0.6, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }

  private toGround(e: PointerEvent): Vector3 | null {
    const ndc = new Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    return this.ray.ray.intersectPlane(this.floor, hit) ? hit : null;
  }

  private firstTouch() {
    this.idle = 0;
    if (this.interacted) return;
    this.interacted = true;
    this.audio.unlock();
    this.cta.arm();
  }

  private down(e: PointerEvent) {
    this.firstTouch();
    if (this.state !== "play" && this.state !== "intro") return;
    if (this.state === "intro") this.enterPlay();
    const p = this.toGround(e);
    if (!p) return;
    this.input = { held: true, x: p.x, z: p.z };
    this.hud.setHint("");
  }

  private move(e: PointerEvent) {
    if (!this.input.held) return;
    const p = this.toGround(e);
    if (p) {
      this.input.x = p.x;
      this.input.z = p.z;
    }
  }

  private up() {
    this.input.held = false;
  }

  private enterPlay() {
    this.state = "play";
    this.stateTime = 0;
    this.idle = IDLE_HINT;
    this.camera.position.copy(this.camRest);
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.stateTime += dt;

    if (this.state === "intro" && this.variant.hook === "instant") this.enterPlay();
    if (this.state === "intro") {
      const k = Math.min(1, Math.max(0, (this.stateTime - 0.3) / 1.5));
      const e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.camFrom, this.camRest, e);
      if (k >= 1) this.enterPlay();
    }

    if (this.state === "play" || this.state === "finale") {
      const events = this.sim.tick(dt, this.state === "play" ? this.input : { held: false, x: 0, z: 0 });
      for (const ev of events) this.onEvent(ev);
      if (this.state === "play" && !this.input.held) {
        this.idle += dt;
      } else this.idle = 0;
    }

    if (this.state === "finale") {
      if (this.stateTime > 0.7 && this.bunkerModel.visible) {
        this.bunkerModel.visible = false;
        this.fx.blast(this.bunkerModel.position.x, this.bunkerModel.position.z, 2.4);
        this.fx.shatter(this.bunkerModel.position.x, this.bunkerModel.position.z, 0x7c8592, 14, 0.45, 8);
        this.audio.play("boom");
        this.shake = 0.6;
      }
      if (this.stateTime > 2.2) {
        this.state = "end";
        this.stateTime = 0;
        this.audio.play("win");
        this.cta.end();
        this.hud.showEnd();
      }
    }

    this.animate(dt);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private onEvent(ev: ReturnType<Sim["tick"]>[number]) {
    switch (ev.type) {
      case "shot":
        this.sinceShot = 0;
        this.audio.play("shot");
        this.fx.spark(ev.x + Math.cos(ev.angle) * 1.4, ev.z + Math.sin(ev.angle) * 1.4);
        break;
      case "enemyShot":
        this.audio.play("tap");
        break;
      case "crate":
        this.crates[ev.index].visible = false;
        this.fx.shatter(ev.x, ev.z, PALETTE.crate, 8, 0.32);
        this.fx.blast(ev.x, ev.z, 0.6);
        this.audio.play("hit");
        this.shake = Math.max(this.shake, 0.15);
        break;
      case "wall":
        this.fx.spark(ev.x, ev.z);
        break;
      case "hit":
        this.enemyFlash[ev.index] = 0.12;
        this.fx.spark(ev.x, ev.z);
        this.audio.play("hit");
        break;
      case "kill": {
        const m = this.enemies[ev.index];
        m.root.visible = false;
        this.fx.blast(ev.x, ev.z, 1.4);
        this.fx.shatter(ev.x, ev.z, PALETTE.enemy, 10, 0.4, 7);
        this.fx.shatter(ev.x, ev.z, PALETTE.track, 4, 0.35, 5);
        this.hud.kill(ev.index);
        this.hud.flash(["NICE!", "BOOM!", "AWESOME!"][ev.index % 3]);
        this.audio.play("boom");
        this.shake = 0.45;
        break;
      }
      case "playerHit":
        this.fx.spark(ev.x, ev.z);
        this.shake = Math.max(this.shake, 0.25);
        this.audio.play("hit");
        break;
      case "win":
        this.state = "finale";
        this.stateTime = 0;
        this.input.held = false;
        break;
    }
  }

  private animate(dt: number) {
    const p = this.sim.player;
    this.player.turret.rotation.y = -p.turret;
    this.sinceShot += dt;
    recoil(this.player.barrel, this.sinceShot);
    this.sim.enemies.forEach((e, i) => {
      const m = this.enemies[i];
      m.turret.rotation.y = -e.turret;
      this.enemyFlash[i] = Math.max(0, this.enemyFlash[i] - dt);
      setColor(m.hull, this.enemyFlash[i] > 0 ? 0xffffff : PALETTE.enemy);
      m.root.position.y = Math.abs(Math.sin(performance.now() / 300 + i)) * 0.03;
    });
    // shells: one mesh per sim shell, created and removed as the sim adds and drops them
    const live = new Set<object>(this.sim.shells);
    for (const s of this.sim.shells) {
      let m = this.shells.get(s);
      if (!m) {
        m = shellMesh(s.owner === "player" ? PALETTE.shell : 0xff7a5c);
        this.scene.add(m);
        this.shells.set(s, m);
      }
      m.position.set(s.x, 0.75, s.z);
    }
    for (const [s, m] of this.shells) {
      if (!live.has(s)) {
        this.scene.remove(m);
        this.shells.delete(s);
      }
    }
    const flag = this.bunkerModel.getObjectByName("flag");
    if (flag) flag.rotation.y = Math.sin(performance.now() / 250) * 0.4;

    // hint hand: press-and-drag toward the nearest live enemy
    if (this.state === "play" && this.idle >= IDLE_HINT) {
      const target = this.sim.enemies.find((e) => e.alive);
      if (target) {
        const t = (this.idle - IDLE_HINT) % 1.6;
        const from = this.project(p.x, p.z - 3);
        const to = this.project(target.x, target.z);
        const k = Math.min(1, Math.max(0, (t - 0.25) / 0.9));
        this.hud.setHand(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, t < 1.45, t > 0.15);
      }
    } else this.hud.setHand(0, 0, false, false);

    if (this.state !== "intro") {
      const s = this.shake;
      this.camera.position.set(
        this.camRest.x + (Math.random() - 0.5) * s,
        this.camRest.y + (Math.random() - 0.5) * s,
        this.camRest.z + (Math.random() - 0.5) * s,
      );
      this.shake *= Math.pow(0.01, dt);
    }
    this.camera.lookAt(this.look);
  }
}
