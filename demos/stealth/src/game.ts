// The playable's flow: hook -> drag a path -> sneak -> spotted and retry, or takedown -> coins -> end card.
import { Application, Container, Graphics, type FederatedPointerEvent } from "pixi.js";
import type { Audio } from "../../../kit/audio";
import type { Cta } from "../../../kit/cta";
import { fit } from "../../../kit/layout";
import { Guard, Hero, drawCone, drawCrates, drawPath, drawRoom, makeHand } from "./art";
import { Fx } from "./fx";
import {
  LEVEL,
  type Vec,
  behind,
  clampToFloor,
  coneAt,
  insidePolygon,
  pathLength,
  pointAlong,
  visionPolygon,
} from "./level";
import { EndCard, Hud } from "./ui";

export interface Variant {
  hook: "sweep" | "instant";
  difficulty: "normal" | "hard";
  endcard: "level2" | "upgrade";
}

type State = "intro" | "await" | "drawing" | "walking" | "spotted" | "takedown" | "reward" | "end";

const SPEED = 270; // world units per second
const IDLE_HINT = 2.5; // seconds before the hand reappears

export class Game {
  state: State = "intro";
  attempts = 0;
  private world = new Container();
  private cam = new Container();
  private cone = new Graphics();
  private pathG = new Graphics();
  private hero: Hero;
  private guard: Guard;
  private hand = makeHand();
  private hud = new Hud();
  private end: EndCard;
  private fx: Fx;
  private path: Vec[] = [];
  private walked = 0;
  private heroPos: Vec = { ...LEVEL.hero };
  private stateTime = 0;
  private idle = 0;
  private sweep = 0;
  private alarm = false;
  private shake = 0;
  private zoom = 1;
  private interacted = false;
  private hintRoute: Vec[];
  private view = { width: 0, height: 0, scale: 1, x: 0, y: 0 };

  constructor(
    private app: Application,
    private variant: Variant,
    private audio: Audio,
    private cta: Cta,
  ) {
    const d = LEVEL.difficulty[variant.difficulty];
    this.world.addChild(drawRoom(), this.cone, drawCrates(LEVEL.crates), this.pathG);
    this.hero = new Hero(this.world);
    this.guard = new Guard(this.world);
    this.hero.place(this.heroPos);
    this.world.addChild(this.hand);
    this.cam.addChild(this.world);
    this.end = new EndCard(variant.endcard);
    this.fx = new Fx(this.world, this.hud.root);
    app.stage.addChild(this.cam, this.hud.root, this.end.root);
    this.hintRoute = [{ ...LEVEL.hero }, { x: LEVEL.hero.x + 10, y: LEVEL.hero.y - 220 }];
    this.zoom = variant.hook === "sweep" ? 1.7 : 1;
    this.sweep = 0.15;
    drawCone(this.cone, visionPolygon(coneAt(this.sweep, d), LEVEL.crates), false);

    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointerdown", (e) => this.down(e));
    app.stage.on("pointermove", (e) => this.move(e));
    app.stage.on("pointerup", () => this.up());
    app.stage.on("pointerupoutside", () => this.up());
    // The button swallows its own press so the stage never sees it. Networks reject builds whose
    // first tap opens the store, so a press only counts once the player has touched the game.
    const press = (e: FederatedPointerEvent) => {
      e.stopPropagation();
      const armed = this.interacted;
      this.firstTouch();
      if (armed) this.cta.open();
    };
    this.hud.cta.on("pointerdown", press);
    this.end.root.on("pointerdown", press);
    this.resize();
    this.hud.setHint(variant.hook === "instant" ? "DRAG TO SNEAK!" : "");
  }

  start() {
    this.app.ticker.add((t) => this.tick(Math.min(t.deltaMS / 1000, 0.05)));
  }

  resize() {
    const { width, height } = this.app.screen;
    const f = fit(width, height, LEVEL.world, { top: 96, bottom: 150 });
    this.view = { width, height, scale: f.scale, x: f.x, y: f.y };
    this.hud.layout(width, height, { x: f.x, w: LEVEL.world.w * f.scale });
    this.end.layout(width, height);
    this.applyCamera();
  }

  /** For automated checks: the centre of the always-visible CTA. */
  ctaPoint(): Vec {
    const b = this.hud.cta.getBounds();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** For automated checks: where a world point lands on screen. */
  worldToScreen(p: Vec): Vec {
    const g = this.world.toGlobal(p);
    return { x: g.x, y: g.y };
  }

  private applyCamera() {
    // Zoom around the guard during the hook, then settle on the whole room.
    const { scale, x, y } = this.view;
    const z = this.zoom;
    const focus = { x: LEVEL.guard.x, y: LEVEL.guard.y + 80 };
    const k = (z - 1) / 0.7;
    const cx = focus.x * k + (LEVEL.world.w / 2) * (1 - k);
    const cy = focus.y * k + (LEVEL.world.h / 2) * (1 - k);
    this.world.scale.set(scale * z);
    this.world.position.set(
      x + (LEVEL.world.w / 2) * scale - cx * scale * z + (Math.random() - 0.5) * this.shake,
      y + (LEVEL.world.h / 2) * scale - cy * scale * z + (Math.random() - 0.5) * this.shake,
    );
  }

  private firstTouch() {
    this.idle = 0;
    if (this.interacted) return;
    this.interacted = true;
    this.audio.unlock();
    this.cta.arm();
  }

  private toWorld(e: FederatedPointerEvent): Vec {
    const p = this.world.toLocal(e.global);
    return { x: p.x, y: p.y };
  }

  private down(e: FederatedPointerEvent) {
    this.firstTouch();
    if (this.state === "end") return;
    if (this.state !== "await" && this.state !== "intro") return;
    this.audio.play("tap");
    this.state = "drawing";
    this.stateTime = 0;
    this.hand.visible = false;
    this.hud.setHint("");
    this.hud.hideBanner();
    this.path = [{ ...this.heroPos }];
    this.extend(this.toWorld(e));
  }

  private move(e: FederatedPointerEvent) {
    if (this.state === "drawing") this.extend(this.toWorld(e));
  }

  private up() {
    if (this.state !== "drawing") return;
    if (pathLength(this.path) < 40) {
      this.state = "await";
      this.pathG.clear();
      return;
    }
    this.state = "walking";
    this.stateTime = 0;
    this.walked = 0;
  }

  private extend(p: Vec) {
    const q = clampToFloor(p);
    const last = this.path[this.path.length - 1];
    if (Math.hypot(q.x - last.x, q.y - last.y) < 10) return;
    this.path.push(q);
    drawPath(this.pathG, this.path);
  }

  private tick(dt: number) {
    this.stateTime += dt;
    const d = LEVEL.difficulty[this.variant.difficulty];
    if (!this.alarm && !this.guard.knockedOut) this.sweep = (this.sweep + dt / d.sweepPeriod) % 1;
    const cone = coneAt(this.sweep, d);
    if (this.alarm) cone.angle = this.guard.facing;
    const poly = visionPolygon(cone, LEVEL.crates);
    // A knocked-out guard has no flashlight; an empty cone would be a degenerate polygon.
    if (this.guard.knockedOut) this.cone.clear();
    else drawCone(this.cone, poly, this.alarm);
    if (!this.alarm) this.guard.facing = cone.angle;

    let moved = 0;
    switch (this.state) {
      case "intro":
        if (this.variant.hook === "sweep") {
          this.zoom = Math.max(1, 1.7 - Math.max(0, this.stateTime - 0.6) * 0.9);
          if (this.zoom === 1) this.enterAwait();
        } else this.enterAwait();
        break;
      case "await":
        this.idle += dt;
        if (this.idle > IDLE_HINT) this.animateHand(this.idle - IDLE_HINT);
        break;
      case "walking": {
        const before = { ...this.heroPos };
        this.walked += SPEED * dt;
        const at = pointAlong(this.path, this.walked);
        this.heroPos = at.p;
        this.hero.heading = at.heading;
        moved = Math.hypot(this.heroPos.x - before.x, this.heroPos.y - before.y);
        this.hud.setProgress(1 - Math.hypot(this.heroPos.x - LEVEL.guard.x, this.heroPos.y - LEVEL.guard.y) / 560);
        if (Math.floor((this.walked - SPEED * dt) / 46) !== Math.floor(this.walked / 46)) this.audio.play("step");
        if (insidePolygon(this.heroPos, poly)) this.spotted();
        else if (this.closeBehindGuard()) this.takedown();
        else if (at.done) {
          this.state = "await";
          this.idle = 0;
          this.pathG.clear();
        }
        break;
      }
      case "spotted":
        if (this.stateTime > 1.3) this.retry();
        break;
      case "takedown": {
        const k = Math.min(1, this.stateTime / 0.25);
        const from = this.takedownFrom;
        this.heroPos = { x: from.x + (LEVEL.guard.x - from.x) * k * 0.55, y: from.y + (LEVEL.guard.y - from.y) * k * 0.55 };
        if (this.stateTime > 0.25 && !this.guard.knockedOut) {
          this.guard.knockOut();
          this.hero.squash = 0.35;
          this.shake = 14;
          this.audio.play("hit");
          this.fx.dust(LEVEL.guard.x, LEVEL.guard.y, 14);
          this.fx.coins(LEVEL.guard.x, LEVEL.guard.y, 8, () => {
            this.hud.addCoin();
            this.audio.play("coin");
          });
          this.hud.setProgress(1);
        }
        if (this.stateTime > 1.6) {
          this.state = "end";
          this.stateTime = 0;
          this.audio.play("win");
          this.cta.end();
          this.hud.endMode();
          this.end.show();
        }
        break;
      }
    }

    this.hero.root.position.set(this.heroPos.x, this.heroPos.y);
    this.hero.update(dt, moved);
    this.guard.update(dt);
    this.hud.update(dt);
    this.end.update(dt);
    this.fx.update(dt, this.hud.coinTarget);
    this.shake *= Math.pow(0.002, dt);
    this.applyCamera();
  }

  private takedownFrom: Vec = { x: 0, y: 0 };

  private closeBehindGuard(): boolean {
    const dist = Math.hypot(this.heroPos.x - LEVEL.guard.x, this.heroPos.y - LEVEL.guard.y);
    return dist < LEVEL.takedownRange && behind(this.heroPos, LEVEL.guard, this.guard.facing);
  }

  private enterAwait() {
    this.state = "await";
    this.stateTime = 0;
    this.idle = IDLE_HINT; // show the hand at once on the first screen
    this.hud.setHint(this.attempts === 0 ? "DRAG TO SNEAK!" : "HIDE BEHIND THE CRATES!");
  }

  private animateHand(t: number) {
    const route = this.attempts === 0 ? this.hintRoute : LEVEL.safeRoute;
    const total = pathLength(route);
    const cycle = total / 380 + 0.9;
    const local = t % cycle;
    const s = Math.max(0, Math.min(total, (local - 0.3) * 380));
    const at = pointAlong(route, s);
    this.hand.visible = true;
    this.hand.position.set(at.p.x, at.p.y);
    this.hand.scale.set(local < 0.3 ? 1.15 - local * 0.5 : 1);
    this.hand.alpha = local > cycle - 0.3 ? (cycle - local) / 0.3 : 1;
    drawPath(this.pathG, route.filter((_, i, arr) => pathLength(arr.slice(0, i + 1)) <= s + 1), 0xffffff);
  }

  private spotted() {
    this.state = "spotted";
    this.stateTime = 0;
    this.alarm = true;
    this.guard.facing = Math.atan2(this.heroPos.y - LEVEL.guard.y, this.heroPos.x - LEVEL.guard.x);
    this.guard.alert();
    this.audio.play("alert");
    this.shake = 10;
    this.hud.redFlash();
    this.hud.showBanner("SPOTTED!", "Try again", 0xff3b3b);
    setTimeout(() => this.audio.play("fail"), 250);
  }

  private retry() {
    this.attempts += 1;
    this.alarm = false;
    this.guard.calm();
    this.heroPos = { ...LEVEL.hero };
    this.hero.place(this.heroPos);
    this.hero.heading = -Math.PI / 2;
    this.pathG.clear();
    this.hud.hideBanner();
    this.audio.play("whoosh");
    this.enterAwait();
  }

  private takedown() {
    this.state = "takedown";
    this.stateTime = 0;
    this.takedownFrom = { ...this.heroPos };
    this.pathG.clear();
    this.audio.play("whoosh");
  }
}
