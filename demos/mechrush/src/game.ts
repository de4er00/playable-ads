// Mech Rush: the squad walks the bridge, takes gates, shoots through drones and a barricade, picks a card,
// and meets the boss. The sim decides; this file shows it: camera, models, effects, sounds and the 2D layer.
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  SphereGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Audio } from "../../../kit/audio";
import type { Cta } from "../../../kit/cta";
import { Fx } from "./fx";
import { C, barricade, blobTexture, bossMech, drawLabel, gatePanel, glowMaterial, glowTexture, litMaterial, miniMech } from "./models";
import { atmosphere, lights } from "./scene";
import { type Card, type Outcome, ROAD_HALF, Sim, type SimEvent, gateLabel, squadRadius } from "./sim";
import { Ui } from "./ui";
import { CAP, Horde, Shadows, Squad } from "./units";
import { buildWorld } from "./world";

export interface Variant {
  outcome: Outcome;
  quickStart: boolean;
}

type State = "intro" | "run" | "pick" | "boss" | "end";
const IDLE_HINT = 2.2;
// landscape boss shot [height, distance behind the boss, look height], fov 40:
// boss top at 19% of the height, feet at 59%, the squad's back row at 92%
const LAND_BOSS = [5, 30, 2];

export class Game {
  state: State = "intro";
  stateTime = 0;
  sim: Sim;
  ui = new Ui();
  private scene = new Scene();
  private camera = new PerspectiveCamera(50, 1, 0.1, 400);
  private renderer: WebGLRenderer;
  private squad: Squad;
  private horde: Horde;
  private shadows: Shadows;
  private fx: Fx;
  private gates: { group: Group; glass: Mesh; used: boolean; sink: number }[] = [];
  private barricade = new Group();
  private blockLabel!: { canvas: HTMLCanvasElement; tex: CanvasTexture };
  private blockShake = 0;
  private boss = bossMech();
  private bossFlash = 0;
  private bossDead = false;
  private hero = new Group();
  private rays!: Mesh;
  private ray = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private steer: number | null = null;
  private interacted = false;
  private idle = 0;
  private shake = 0;
  private hitstop = 0;
  private lastShot = 0;
  private lastKillSound = 0;
  private camPos = new Vector3();
  private camLook = new Vector3();
  private running = false;
  private last = 0;
  private time = 0;
  private overTimer = -1;
  private prevZ = 0;
  private picks: Card[] = [];
  /** Shield drone: a glowing dome over the squad while it still has hits to absorb. */
  private dome = new Group();
  private domeFlash = 0;

  constructor(private variant: Variant, private audio: Audio, private cta: Cta) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const c = this.renderer.domElement;
    c.style.position = "fixed";
    c.style.inset = "0";
    document.body.appendChild(c);
    this.sim = new Sim({ outcome: variant.outcome, quickStart: variant.quickStart });
    lights(this.scene, this.renderer);
    atmosphere(this.scene);
    const glow = glowTexture();
    buildWorld(this.scene, glow);
    this.squad = new Squad(this.scene);
    this.horde = new Horde(this.scene, this.sim.enemies.length);
    this.shadows = new Shadows(this.scene, blobTexture(), CAP + this.sim.enemies.length);
    this.fx = new Fx(this.scene, glow);
    this.fx.onNut = (x, y, z) => {
      const p = this.project(x, y, z);
      this.ui.flyNut(p.x, p.y);
    };

    for (const g of this.sim.gates) {
      const panel = gatePanel(g.kind !== "sub", gateLabel(g));
      panel.group.position.set(g.side * ROAD_HALF * 0.5, 0, g.z);
      this.scene.add(panel.group);
      this.gates.push({ group: panel.group, glass: panel.glass, used: false, sink: 0 });
    }

    const bar = barricade(ROAD_HALF * 2);
    this.barricade.add(new Mesh(bar.body, litMaterial()), new Mesh(bar.glow, glowMaterial(0xff4a2a)));
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 128;
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    this.blockLabel = { canvas: cv, tex };
    this.drawBlockLabel(this.sim.block.hp);
    const plate = new Mesh(new PlaneGeometry(2.4, 1.2), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    plate.position.set(0, 2.3, 0.2);
    this.barricade.add(plate);
    this.barricade.position.set(0, 0, this.sim.block.z - 0.6);
    this.scene.add(this.barricade);

    this.boss.group.position.set(0, 0, this.sim.boss.z);
    this.boss.group.scale.setScalar(1.15);
    this.scene.add(this.boss.group);
    this.buildHero(glow);
    const hemi = new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const skin = new MeshBasicMaterial({ color: 0x63f5ff, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
    const lattice = new MeshBasicMaterial({ color: 0xbffcff, transparent: true, opacity: 0.4, wireframe: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.dome.add(new Mesh(hemi, skin), new Mesh(hemi, lattice));
    this.dome.visible = false;
    this.scene.add(this.dome);
  }

  async init() {
    await this.ui.init();
    const stage = this.ui.app.stage;
    stage.hitArea = this.ui.app.screen;
    stage.on("pointerdown", (e) => this.down(e.global.x, e.global.y));
    stage.on("pointermove", (e) => this.move(e.global.x, e.global.y));
    stage.on("pointerup", () => this.up());
    stage.on("pointerupoutside", () => this.up());
    // Networks reject builds whose first tap opens the store: a press only counts after a game touch.
    this.ui.cta.on("pointerdown", (e) => {
      e.stopPropagation();
      const armed = this.interacted;
      this.firstTouch();
      if (armed) this.cta.open();
    });
    this.resize();
    this.placeCamera(0);
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
    // landscape gets a longer lens: at fov 50 its 94-degree width was mostly canyon wall
    this.camera.fov = h >= w ? 50 : 40;
    this.camera.updateProjectionMatrix();
    this.ui.layout(w, h);
    if (this.state === "end") {
      this.placeEndCamera();
      this.render();
    }
  }

  // --- for automated checks -----------------------------------------------------------------
  roadToScreen(x: number, z: number) {
    return this.project(x, 0, z);
  }
  ctaPoint() {
    return { x: this.ui.cta.x, y: this.ui.cta.y };
  }

  private project(x: number, y: number, z: number) {
    const v = new Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, front: v.z < 1 };
  }

  private toRoadX(sx: number, sy: number): number | null {
    this.ray.setFromCamera(new Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), this.camera);
    const hit = new Vector3();
    return this.ray.ray.intersectPlane(this.ground, hit) ? hit.x : null;
  }

  private firstTouch() {
    this.idle = 0;
    if (this.interacted) return;
    this.interacted = true;
    this.audio.unlock();
    this.cta.arm();
  }

  private pointerDown = false;
  private grabOffset = 0;

  private down(x: number, y: number) {
    this.firstTouch();
    if (this.state === "end") return;
    if (this.state === "intro") this.enter("run");
    this.pointerDown = true;
    const rx = this.toRoadX(x, y);
    this.grabOffset = rx === null ? 0 : this.sim.x - rx;
    this.audio.play("tap");
  }

  private move(x: number, y: number) {
    if (!this.pointerDown) return;
    const rx = this.toRoadX(x, y);
    if (rx !== null) this.steer = rx + this.grabOffset;
  }

  private up() {
    this.pointerDown = false;
  }

  private enter(state: State) {
    this.state = state;
    this.stateTime = 0;
    if (state === "boss") {
      this.ui.showBanner("BOSS!", 0xff5a4a, "Take it down");
      this.audio.play("alert");
    }
  }

  /** For captures in a slow headless browser: run the game forward in fixed steps, then draw once. */
  fastForward(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 30) this.step(1 / 30, false);
    this.render();
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt, true);
  }

  private step(dtIn: number, draw: boolean) {
    let dt = dtIn;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt = 0;
    }
    this.time += dt;
    this.stateTime += dt;

    if (this.state === "intro" && (this.stateTime > (this.variant.quickStart ? 0.2 : 1.2) || this.interacted)) this.enter("run");
    if (this.state === "run" || this.state === "boss") {
      const evs = this.sim.tick(dt, this.pointerDown ? this.steer : null);
      for (const ev of evs) this.onEvent(ev);
      if (this.sim.phase === "boss" && this.state === "run") this.enter("boss");
      this.idle = this.pointerDown ? 0 : this.idle + dt;
    }
    if (this.overTimer >= 0) {
      this.overTimer -= dt;
      if (this.overTimer < 0) this.showEnd();
    }

    const removed = this.squad.sync(this.sim);
    for (const r of removed.slice(0, 6)) {
      this.fx.burst(r.x, 0.6, r.z, C.blue, 4, 0.12, 4);
      this.fx.flash(r.x, 0.6, r.z, 0x9ad8ff, 1.2, 0.15);
    }
    const walking = this.state === "run" && this.sim.z !== this.prevZ;
    this.prevZ = this.sim.z;
    this.squad.update(dt, this.time, this.sim, walking);
    this.horde.update(this.time, this.sim);
    this.shadows.update(this.squad, this.sim);
    this.fx.update(dt, this.sim);
    this.animateProps(dt);
    this.animateBoss(dt);
    this.placeCamera(dt);
    this.updateUi(dt);
    if (draw) this.render();
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
    this.ui.app.render();
  }

  private onEvent(ev: SimEvent) {
    switch (ev.type) {
      case "gate": {
        const i = this.sim.gates.indexOf(ev.gate);
        const g = this.gates[i];
        g.group.visible = false;
        const pair = this.gates[i % 2 === 0 ? i + 1 : i - 1];
        pair.used = true;
        const good = ev.after >= ev.before;
        const tint = good ? 0x7fd8ff : 0xff7a7a;
        this.fx.burst(g.group.position.x, 1.4, ev.gate.z, tint, 26, 0.2, 6);
        this.fx.flash(g.group.position.x, 1.4, ev.gate.z, tint, 5, 0.25);
        if (good) this.fx.ring(this.sim.x, this.sim.z, 0xffd34a, 4.2, 0.5);
        const p = this.project(this.sim.x, 2.4, this.sim.z);
        this.ui.popText(p.x, p.y - 40, gateLabel(ev.gate), good ? 0x7cf0ff : 0xff6a6a);
        this.audio.play(good ? "gate" : "fail");
        break;
      }
      case "volley":
        this.squad.fired();
        if (this.time - this.lastShot > 0.11) {
          this.lastShot = this.time;
          this.audio.play("shot");
        }
        for (let k = 0; k < 3; k++) {
          const s = this.squad.slots[Math.floor(Math.random() * Math.max(1, this.squad.slots.length))];
          if (s) this.fx.flash(s.x, 0.62, s.z - 0.45, 0x9ff6ff, 0.7, 0.07);
        }
        break;
      case "kill":
        this.fx.explode(ev.x, ev.z, 0.55, C.red);
        if (Math.random() < 0.7) this.fx.nutDrop(ev.x, ev.z);
        if (this.time - this.lastKillSound > 0.07) {
          this.lastKillSound = this.time;
          this.audio.play("hit");
        }
        break;
      case "hit":
        if (ev.boss) {
          this.bossFlash = 0.08;
          // gun damage is summed and shown in bursts on the boss's body; rocket hits get their own big number
          if (ev.rocket) {
            const p = this.project((Math.random() - 0.5) * 3, 3.5 + Math.random() * 3, this.sim.boss.z + 1.5);
            this.ui.float(p.x, p.y, String(Math.round(ev.dmg)), 0xffd34a, 38);
          } else this.bossDamage += ev.dmg;
          this.fx.flash(ev.x * 0.6, 3 + Math.random() * 3, this.sim.boss.z + 2.2, ev.rocket ? 0xffb35a : 0xbff8ff, ev.rocket ? 2.4 : 1, 0.12);
          if (ev.rocket) this.hitstop = Math.max(this.hitstop, 0.045);
        } else if (ev.rocket) {
          this.fx.flash(ev.x, 0.8, ev.z, 0xffb35a, 2.6, 0.22);
          this.fx.burst(ev.x, 0.6, ev.z, 0xff8a2a, 4, 0.12, 5);
        } else this.fx.flash(ev.x, 0.5, ev.z, 0xbff8ff, 0.7, 0.1);
        break;
      case "lost":
        this.fx.flash(ev.x, 0.6, ev.z, 0xff8a6a, 1.4, 0.15);
        break;
      case "shielded":
        // the dome lights up where the drone hit it; the last hit breaks it into shards
        this.domeFlash = 1;
        this.fx.flash(ev.x, 0.9, ev.z, 0x9ffcff, 2.2, 0.18);
        this.audio.play("tap");
        if (ev.left === 0) {
          this.fx.burst(this.sim.x, 1.4, this.sim.z, 0x63f5ff, 30, 0.14, 6);
          this.fx.ring(this.sim.x, this.sim.z, 0x63f5ff, 5, 0.5);
          const p = this.project(this.sim.x, 2.6, this.sim.z);
          this.ui.popText(p.x, p.y - 40, "SHIELD DOWN", 0x7cf0ff, 40);
        }
        break;
      case "blockHit":
        this.drawBlockLabel(ev.hp);
        this.blockShake = 0.12;
        this.fx.flash((Math.random() - 0.5) * ROAD_HALF * 1.6, 0.8, this.sim.block.z + 0.3, 0xffe1a8, 0.9, 0.1);
        break;
      case "blockDown":
        this.barricade.visible = false;
        for (let k = -2; k <= 2; k++) this.fx.explode(k * 1.8, ev.z, 0.9, 0xc9c2b6);
        this.shake = 0.5;
        this.audio.play("boom");
        break;
      case "pick":
        this.enter("pick");
        this.ui.pickCard(["barrel", "shield", "rockets"]).then((card) => this.picked(card));
        this.audio.play("card");
        break;
      case "bossSlam": {
        this.slamT = 0;
        break;
      }
      case "bossDown":
        this.killBoss();
        break;
      case "over":
        this.overTimer = ev.outcome === "win" ? 1.6 : 1.0;
        if (ev.outcome === "close") {
          this.ui.showBanner("SO CLOSE!", 0xffd34a, `Boss at ${Math.max(1, Math.round((this.sim.boss.hp / this.sim.boss.maxHp) * 100))}%`);
          this.audio.play("fail");
        }
        break;
    }
  }

  private picked(card: Card) {
    this.picks.push(card);
    for (const e of this.sim.choose(card)) this.onEvent(e);
    this.fx.ring(this.sim.x, this.sim.z, 0xffd34a, 5.5, 0.7);
    this.fx.flash(this.sim.x, 1, this.sim.z, 0xffe27a, 6, 0.35);
    const p = this.project(this.sim.x, 2.6, this.sim.z);
    this.ui.popText(p.x, p.y - 60, "LV+1", 0xffd34a);
    // the card's effect is named and shown at once, then kept on screen
    if (card === "barrel") {
      this.ui.showBanner("TWIN BARRELS!", 0xffd34a, "+60% damage");
      this.fx.goldTracers();
    } else if (card === "rockets") this.ui.showBanner("ROCKET POD!", 0xd08bff, "Splash rockets");
    else {
      this.ui.showBanner("SHIELD DRONE!", 0x7cf0ff, "Blocks 12 hits");
      this.dome.visible = true;
      this.domeFlash = 1;
    }
    this.audio.play("win");
    this.enter("run");
  }

  private slamT = -1;
  private bossDamage = 0;
  private bossDamageT = 0;

  private animateBoss(dt: number) {
    const b = this.boss;
    if (this.bossDead) return;
    const t = this.time;
    b.body.position.y = 4.4 + Math.sin(t * 2) * 0.08;
    b.body.rotation.y = Math.sin(t * 0.9) * 0.08;
    const firing = this.state === "boss";
    for (const arm of b.arms) {
      arm.userData.gatling.rotation.z += dt * (firing ? 18 : 2);
      arm.rotation.x = -0.15 + Math.sin(t * 3 + arm.position.x) * 0.05;
    }
    // slam: the boss rears up, then drops both fists; the shock ring rolls over the squad
    if (this.slamT >= 0) {
      this.slamT += dt;
      const k = this.slamT;
      const lift = k < 0.18 ? k / 0.18 : Math.max(0, 1 - (k - 0.18) / 0.12);
      for (const arm of b.arms) arm.rotation.x = -0.15 - lift * 1.1;
      b.body.position.y = 4.4 + lift * 0.6;
      if (k >= 0.3 && k - dt < 0.3) {
        this.shake = 0.7;
        this.fx.ring(0, this.sim.boss.z + 3, 0xffffff, 16, 0.6);
        this.fx.ring(this.sim.x, this.sim.z, 0xff8a6a, 6, 0.4);
        this.audio.play("slam");
        for (let i = 0; i < 6; i++) this.fx.flash((Math.random() - 0.5) * 6, 0.3, this.sim.boss.z + 3 + Math.random() * 4, 0xffd8a8, 2.2, 0.3, 1.4);
      }
      if (k > 0.6) this.slamT = -1;
    }
    this.bossFlash = Math.max(0, this.bossFlash - dt);
    const mat = (b.body.children[0] as Mesh).material as MeshStandardMaterial;
    mat.emissive.setHex(this.bossFlash > 0 ? 0x5a1a10 : 0x000000);
    const core = b.glow.material as MeshBasicMaterial;
    core.color.setScalar(0.85 + Math.sin(t * 8) * 0.15);
  }

  private killBoss() {
    this.bossDead = true;
    this.hitstop = 0.12;
    this.shake = 1.1;
    const z = this.sim.boss.z;
    this.boss.group.visible = false;
    this.fx.explode(0, z + 1, 3.4, C.red);
    this.fx.explode(-2.5, z, 2, C.redDark);
    this.fx.explode(2.5, z, 2, C.dark);
    for (let i = 0; i < 40; i++) setTimeout(() => this.fx.nutDrop((Math.random() - 0.5) * 6, z + 3 + Math.random() * 3), i * 25);
    this.ui.showBanner("VICTORY!", 0xffd34a);
    this.audio.play("boom");
  }

  private animateProps(dt: number) {
    if (this.dome.visible) {
      if (this.sim.shield <= 0) this.dome.visible = false;
      this.domeFlash = Math.max(0, this.domeFlash - dt * 3);
      const r = squadRadius(this.sim.count) + 0.9;
      this.dome.position.set(this.sim.x, 0.05, this.sim.z);
      this.dome.scale.set(r, r * 0.75, r);
      this.dome.rotation.y += dt * 0.6;
      const [skin, lattice] = this.dome.children.map((m) => (m as Mesh).material as MeshBasicMaterial);
      skin.opacity = 0.14 + this.domeFlash * 0.4;
      lattice.opacity = 0.3 + this.domeFlash * 0.6 + Math.sin(this.time * 6) * 0.05;
    }
    const perk = this.picks[0];
    if (perk === "shield") this.ui.setPerk(this.sim.shield > 0 ? `SHIELD ${this.sim.shield}` : "", 0x1c8fd6);
    else if (perk === "barrel") this.ui.setPerk("DMG x1.6", 0xd99a14);
    else if (perk === "rockets") this.ui.setPerk("ROCKETS", 0x6a2bd6);
    for (const g of this.gates) {
      if (g.used && g.group.visible) {
        g.sink += dt;
        g.group.position.y = -g.sink * g.sink * 6;
        if (g.sink > 0.6) g.group.visible = false;
      }
      if (g.group.visible) (g.glass.material as MeshStandardMaterial).emissiveIntensity = 0.3 + Math.sin(this.time * 5) * 0.08;
    }
    this.blockShake = Math.max(0, this.blockShake - dt);
    this.barricade.position.x = (Math.random() - 0.5) * this.blockShake * 0.6;
    if (this.state === "end") this.rays.rotation.z += dt * 0.25;
  }

  private drawBlockLabel(hp: number) {
    drawLabel(this.blockLabel.canvas, String(Math.max(0, Math.ceil(hp))), "#ffd0c8", "#5c0606");
    this.blockLabel.tex.needsUpdate = true;
  }

  private placeCamera(dt: number) {
    const portrait = innerHeight >= innerWidth;
    const z = this.sim.z;
    // landscape (fov 40) solved like the boss shot: squad at 79% of the height, 40 m of road ahead in view
    let height = portrait ? 13 : 7;
    let back = 9.5;
    let ahead = portrait ? 6.5 : 6;
    let lookY = 0;
    if (this.state === "boss" || (this.sim.phase === "over" && this.state !== "end")) {
      // a low camera far behind the squad: the boss stands whole under the HUD and looms over the squad.
      // Solved with the measured boss (antenna tips at y 8.8). Portrait, fov 50: its top at 28% of the
      // height, feet at 59%, the squad's back row at 89%. Landscape, fov 40: LAND_BOSS below.
      const [h, b, ly] = portrait ? [6.5, 30.5, 2.5] : LAND_BOSS;
      height = h;
      back = this.sim.boss.z + b - z;
      ahead = z - this.sim.boss.z;
      lookY = ly;
    }
    if (this.state === "intro" && !this.variant.quickStart) {
      // the hook: start high above the horde, settle behind the squad
      const k = Math.min(1, this.stateTime / 1.2);
      const e = 1 - Math.pow(1 - k, 3);
      height += (1 - e) * 10;
      ahead += (1 - e) * 10;
    }
    const wantPos = new Vector3(0, height, z + back);
    const wantLook = new Vector3(this.sim.x * 0.15, lookY, z - ahead);
    if (dt === 0 && this.camPos.lengthSq() === 0) {
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
    }
    const k = 1 - Math.pow(0.02, dt);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    if (this.state === "end") return;
    this.shake *= Math.pow(0.004, dt);
    const s = this.shake;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z);
    this.camera.lookAt(this.camLook);
  }

  private updateUi(dt: number) {
    // the badge rides on the visible squad, which trails the sim a little when it turns
    let cx = this.sim.x;
    let cz = this.sim.z;
    if (this.squad.slots.length) {
      cx = this.squad.slots.reduce((s, sl) => s + sl.x, 0) / this.squad.slots.length;
      cz = this.squad.slots.reduce((s, sl) => s + sl.z, 0) / this.squad.slots.length;
    }
    const top = this.project(cx, 2.2, cz - 0.4);
    this.ui.setBadge(top.x, top.y, this.sim.count, this.state !== "end" && this.sim.count > 0);
    if (this.state === "boss" || (this.sim.phase === "over" && !this.bossDead && this.state !== "end")) {
      // the bar hangs over the boss's head; where it would cross the logo and CTA it drops below them
      const top = this.project(0, 9.4, this.sim.boss.z);
      const clear = innerWidth / 2 - 110 > this.ui.hudRight + 10;
      this.ui.setBoss(innerWidth / 2, Math.max(clear ? 64 : this.ui.hudBottom + 44, top.y - 22), this.sim.boss.hp / this.sim.boss.maxHp, this.sim.boss.hp, true);
    } else this.ui.setBoss(0, 0, 0, 0, false);
    this.bossDamageT += dt;
    if (this.bossDamageT > 0.2 && this.bossDamage > 0) {
      this.bossDamageT = 0;
      const p = this.project((Math.random() - 0.5) * 3, 3.5 + Math.random() * 3, this.sim.boss.z + 1.5);
      this.ui.float(p.x, p.y, String(Math.round(this.bossDamage)), 0xffffff, 30);
      this.bossDamage = 0;
    }
    if (this.state === "run" && this.idle > IDLE_HINT && this.sim.phase === "run") {
      const k = Math.sin((this.idle - IDLE_HINT) * 2.6);
      const p = this.project(this.sim.x + k * 2.2, 0, this.sim.z + 1.6);
      this.ui.showHint(true, p.x, p.y, true);
    } else if (this.state !== "pick") this.ui.showHint(false);
    this.ui.update(dt);
  }

  private buildHero(glow: ReturnType<typeof glowTexture>) {
    // End-card key art, rendered in 3D: a big squad mech against a rotating sunburst.
    const m = miniMech();
    const mech = new Group();
    const mat = litMaterial();
    mech.add(new Mesh(m.body, mat), new Mesh(m.glow, glowMaterial(C.cyan)));
    const l = new Mesh(m.legL, mat);
    const r = new Mesh(m.legR, mat);
    l.position.y = r.position.y = m.hip;
    l.rotation.x = 0.25;
    r.rotation.x = -0.35;
    mech.add(l, r);
    mech.rotation.y = Math.PI + 0.45;
    mech.scale.setScalar(1.9);
    this.hero.add(mech);
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    // the plane is twice the old size (landscape shifts the camera sideways), so the stops are halved
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
    this.rays.position.set(0, 1.6, -3);
    this.hero.add(this.rays);
    for (let i = 0; i < 5; i++) {
      const s = new Sprite(new SpriteMaterial({ map: glow, color: 0xffe0a0, blending: AdditiveBlending, transparent: true, depthWrite: false }));
      s.position.set((Math.random() - 0.5) * 6, 1 + Math.random() * 3, -1.5);
      s.scale.setScalar(2 + Math.random() * 2);
      this.hero.add(s);
    }
    this.hero.visible = false;
    this.scene.add(this.hero);
  }

  /** Portrait: the hero in the middle. Landscape: the camera slides right so the hero stands in the
   *  left third and the UI column takes the rest. The shift is parallel, so the hero isn't turned. */
  private placeEndCamera() {
    const z = this.hero.position.z;
    const portrait = innerHeight >= innerWidth;
    const dist = portrait ? 12.5 : 9.5;
    const half = dist * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect;
    const dx = portrait ? 0 : half * 0.42;
    this.camera.position.set(dx, 2.4, z + dist);
    this.camera.lookAt(dx, portrait ? 1.0 : 1.4, z);
  }

  private showEnd() {
    this.enter("end");
    const z = this.sim.z - 40;
    this.hero.position.set(0, 0, z);
    this.hero.visible = true;
    this.scene.fog = null;
    this.placeEndCamera();
    const won = this.sim.outcome === "win";
    this.ui.showEnd(won ? "VICTORY!" : "SO CLOSE!", won ? "Build the strongest squad" : "Upgrade your squad and win", this.picks.length ? [...this.picks, "barrel", "rockets", "shield"].slice(0, 3) as Card[] : ["barrel", "rockets", "shield"]);
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
    this.audio.play("win");
  }
}
