// The 2D layer, drawn by PixiJS over the Three.js scene: HUD, numbers on objects, the summon button,
// the element pick, banners and the end card.
import { Application, BitmapFont, BitmapText, Container, Graphics, type Text } from "pixi.js";
import { Button, RarityCard, type Rarity, gradient, text } from "../../../kit/hud";
import type { Element } from "./sim";

const ELEMENTS: Record<Element, Rarity> = {
  water: { name: "RARE", top: 0x5cc0ff, bottom: 0x1c5fd6, glow: 0x5cc0ff, title: "FROST", info: "Snake 30% slower" },
  flash: { name: "EPIC", top: 0xd08bff, bottom: 0x6a2bd6, glow: 0xc06bff, title: "CHAIN BOLT", info: "Hits jump twice" },
  fire: { name: "LEGENDARY", top: 0xffe27a, bottom: 0xff8a1c, glow: 0xffc23d, title: "WILDFIRE", info: "Hits set it ablaze" },
};

/** Unit cards for the end card, by level. */
const UNITS: Rarity[] = [
  { name: "", top: 0, bottom: 0, glow: 0, title: "", info: "" },
  { name: "COMMON", top: 0x9fc4ff, bottom: 0x3f6fc4, glow: 0x9fc4ff, title: "SPARK", info: "Level 1" },
  { name: "RARE", top: 0x6ff0e0, bottom: 0x109a8c, glow: 0x6ff0e0, title: "TIDE", info: "Level 2" },
  { name: "EPIC", top: 0xd08bff, bottom: 0x6a2bd6, glow: 0xc06bff, title: "ARCANE", info: "Level 3" },
  { name: "LEGENDARY", top: 0xffe27a, bottom: 0xff8a1c, glow: 0xffc23d, title: "SUNLORD", info: "Level 4" },
];
const LEVEL_FILL = [0, 0x3f8cff, 0x1fc4b4, 0x9a5bff, 0xffc23d];

function elementIcon(el: Element): Graphics {
  const g = new Graphics();
  if (el === "water") {
    g.moveTo(0, -48).bezierCurveTo(26, -10, 36, 8, 36, 20).arc(0, 20, 36, 0, Math.PI).bezierCurveTo(-36, 8, -26, -10, 0, -48).fill(gradient(0x9fe6ff, 0x1c7fd6)).stroke({ width: 5, color: 0x0b2a5a });
    g.ellipse(-12, 14, 7, 12).fill({ color: 0xffffff, alpha: 0.7 });
    for (const [x, y] of [[-30, -34], [30, -24]]) g.poly([x, y - 10, x + 4, y, x, y + 10, x - 4, y]).fill(0xdff6ff);
  } else if (el === "flash") {
    g.poly([10, -50, -24, 6, -2, 6, -12, 50, 26, -8, 4, -8]).fill(gradient(0xfff3ff, 0xb070ff)).stroke({ width: 5, color: 0x2a0d5a, join: "round" });
  } else {
    g.moveTo(0, -50).bezierCurveTo(30, -18, 38, 6, 30, 26).bezierCurveTo(22, 46, -22, 46, -30, 26).bezierCurveTo(-38, 6, -18, -10, -8, -22).bezierCurveTo(-6, -6, 4, -2, 8, -10).bezierCurveTo(10, -24, 4, -38, 0, -50).fill(gradient(0xffe27a, 0xff4a1c)).stroke({ width: 5, color: 0x5a1a08, join: "round" });
    g.moveTo(0, 0).bezierCurveTo(14, 12, 16, 24, 10, 32).bezierCurveTo(4, 40, -10, 40, -14, 30).bezierCurveTo(-18, 18, -6, 12, 0, 0).fill(0xfff3b0);
  }
  return g;
}

/** A crystal on a pedestal, in the level's colour: the unit icon for cards and the summon button. */
function unitIcon(level: number, s = 1): Graphics {
  const c = LEVEL_FILL[level];
  const g = new Graphics();
  g.roundRect(-30 * s, 26 * s, 60 * s, 16 * s, 6 * s).fill(0x8f8a80).stroke({ width: 4 * s, color: 0x1b2433 });
  g.poly([-18 * s, 26 * s, 18 * s, 26 * s, 13 * s, -6 * s, -13 * s, -6 * s]).fill(c).stroke({ width: 4 * s, color: 0x1b2433 });
  g.poly([0, -50 * s, 16 * s, -26 * s, 0, -6 * s, -16 * s, -26 * s]).fill(gradient(0xffffff, c)).stroke({ width: 4 * s, color: 0x1b2433, join: "round" });
  g.poly([0, -50 * s, 6 * s, -26 * s, 0, -10 * s, -4 * s, -26 * s]).fill({ color: 0xffffff, alpha: 0.55 });
  if (level === 4)
    for (const side of [-1, 1]) g.poly([side * 16 * s, 0, side * 40 * s, -24 * s, side * 34 * s, -4 * s, side * 44 * s, -6 * s, side * 22 * s, 12 * s]).fill(0xffc23d).stroke({ width: 3 * s, color: 0x5a3a08 });
  return g;
}

interface Floater {
  view: Container;
  vy: number;
  life: number;
  max: number;
}

interface Flyer {
  view: Graphics;
  fx: number;
  fy: number;
  t: number;
  arc: number;
}

export class Ui {
  app = new Application();
  root = new Container();
  cta!: Button;
  summon!: Button;
  private logo = new Container();
  private pill = new Container();
  private pillText!: Text;
  private coinIcon = new Graphics();
  private tower = new Container();
  private towerText!: Text;
  private baseFill = new Graphics();
  private towerBump = 0;
  readonly xp = new Container();
  private xpFill = new Graphics();
  private xpFrom!: Text;
  private xpTo!: Text;
  private xpShown = 0;
  private xpTarget = 0;
  private pips: Container[] = [];
  private bossBar = new Container();
  private bossFill = new Graphics();
  private bossText!: Text;
  private hand = new Container();
  private hint!: Text;
  private banner = new Container();
  private bannerT = 9;
  private bannerFit = 1;
  private floaters: Floater[] = [];
  private flyers: Flyer[] = [];
  private cards = new Container();
  private dim = new Graphics();
  private vignette = new Graphics();
  private vignetteT = 0;
  private flash = new Graphics();
  private flashT = 0;
  private summonCost!: Text;
  private endLayer = new Container();
  private endTitle!: Text;
  private endSub!: Text;
  private endCards: RarityCard[] = [];
  endCta!: Button;
  coins = 0;
  w = 0;
  h = 0;
  /** Called when the player touches something the game itself doesn't see (the element cards). */
  onTouch: () => void = () => {};

  async init() {
    await this.app.init({ backgroundAlpha: 0, resizeTo: window, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), preference: "webgl", autoStart: false });
    const c = this.app.canvas;
    c.style.position = "fixed";
    c.style.inset = "0";
    c.style.touchAction = "none";
    document.body.appendChild(c);
    this.app.ticker.stop();
    this.app.stage.addChild(this.root);
    this.app.stage.eventMode = "static";
    // the four number styles used in play, installed once instead of one font per new style
    const num = (name: string, size: number, fill: number) => BitmapFont.install({ name, style: { fontFamily: "Arial Black", fontSize: size, fill, stroke: { color: 0x14213d, width: Math.max(3, size * 0.18) } }, chars: [["0", "9"], "-+%!"] });
    num("hit", 24, 0xffffff);
    num("crit", 34, 0xffd34a);
    num("burn", 22, 0xffa040);
    num("bolt", 22, 0xd9a8ff);

    const title = text("SPIRAL SIEGE", 28, { fill: gradient(0xffe27a, 0xff8a1c), stroke: { color: 0x3a1600, width: 6, join: "round" } });
    const sub = text("MERGE DEFENSE", 13, { fill: 0xffffff, stroke: { color: 0x14213d, width: 4, join: "round" }, dropShadow: false });
    sub.y = 23;
    this.logo.addChild(title, sub);
    this.cta = new Button("PLAY NOW", 150, 46);

    this.pill.addChild(new Graphics().roundRect(-62, -20, 124, 40, 20).fill({ color: 0x0b1020, alpha: 0.6 }).stroke({ width: 2, color: 0xffffff, alpha: 0.15 }));
    this.coinIcon.circle(0, 0, 15).fill(gradient(0xffe27a, 0xd99a14)).stroke({ width: 3, color: 0x5a3a08 }).circle(0, 0, 8).stroke({ width: 3, color: 0xb87a10 });
    this.coinIcon.x = -40;
    this.pillText = text("0", 24);
    this.pillText.x = 14;
    this.pill.addChild(this.coinIcon, this.pillText);

    // tower badge "LVL n" with the base's health under it
    this.tower.addChild(new Graphics().roundRect(-40, -17, 80, 34, 17).fill(gradient(0x5cc0ff, 0x1c5fd6)).stroke({ width: 4, color: 0x0b2a5a }));
    this.towerText = text("LVL 1", 20);
    this.tower.addChild(this.towerText);
    const baseBack = new Graphics().roundRect(-44, 22, 88, 14, 7).fill({ color: 0x0b1020, alpha: 0.75 }).stroke({ width: 2, color: 0x000000 });
    this.tower.addChild(baseBack, this.baseFill);

    // XP bar: "LV.1 [=====      ] LV.2"
    this.xp.addChild(new Graphics().roundRect(-110, -11, 220, 22, 11).fill({ color: 0x0b1020, alpha: 0.7 }).stroke({ width: 3, color: 0x000000 }), this.xpFill);
    this.xpFrom = text("LV.1", 16);
    this.xpFrom.x = -140;
    this.xpTo = text("LV.2", 16);
    this.xpTo.x = 140;
    this.xp.addChild(this.xpFrom, this.xpTo);

    this.summon = new Button("SUMMON", 210, 66, 0x5cc0ff, 0x1c5fd6, 0x0b3a7a);
    this.summon.caption.y = -9;
    this.summon.caption.scale.set(0.9);
    const cost = new Container();
    const coin = new Graphics().circle(0, 0, 10).fill(gradient(0xffe27a, 0xd99a14)).stroke({ width: 2, color: 0x5a3a08 });
    coin.x = -22;
    this.summonCost = text("100", 18, { stroke: { color: 0x0b3a7a, width: 4, join: "round" }, dropShadow: false });
    this.summonCost.x = 10;
    cost.addChild(coin, this.summonCost);
    cost.y = 17;
    const icon = unitIcon(1, 0.42);
    icon.position.set(-78, 0);
    this.summon.addChild(cost, icon);

    for (let i = 0; i < 6; i++) {
      const pip = new Container();
      pip.addChild(new Graphics().circle(0, 0, 13).fill(0x101624).stroke({ width: 3, color: 0xffffff }));
      const t = text("1", 15, { dropShadow: false });
      pip.addChild(t);
      pip.visible = false;
      this.pips.push(pip);
    }

    this.bossBar.addChild(new Graphics().roundRect(-100, -13, 200, 26, 13).fill({ color: 0x0b1020, alpha: 0.75 }).stroke({ width: 3, color: 0x000000 }), this.bossFill);
    this.bossText = text("", 18);
    const bossLabel = text("BOSS", 20, { fill: gradient(0xff8a7a, 0xd62a1a) });
    bossLabel.y = -27;
    this.bossBar.addChild(this.bossText, bossLabel);
    this.bossBar.visible = false;

    const glove = new Graphics()
      .roundRect(-9, -2, 18, 46, 9).fill(0xffffff).stroke({ width: 4, color: 0x222222 })
      .roundRect(-16, 28, 46, 40, 16).fill(0xffffff).stroke({ width: 4, color: 0x222222 })
      .roundRect(-9, -2, 18, 32, 9).fill(0xffffff);
    this.hand.addChild(glove);
    this.hand.visible = false;
    this.hint = text("MERGE TWO ALIKE!", 26);
    this.hint.visible = false;

    this.cards.visible = false;
    this.dim.visible = false;
    this.endLayer.visible = false;
    // overlays never take touches: a full-screen flash on top would otherwise swallow taps on the cards
    for (const o of [this.vignette, this.flash, this.hand, this.hint, this.banner, this.tower, this.bossBar, this.xp, this.logo, this.pill, ...this.pips]) o.eventMode = "none";
    this.root.addChild(this.vignette, ...this.pips, this.tower, this.bossBar, this.dim, this.banner, this.cards, this.xp, this.summon, this.logo, this.cta, this.pill, this.hand, this.hint, this.endLayer, this.flash);
  }

  layout(w: number, h: number) {
    this.w = w;
    this.h = h;
    const portrait = h >= w;
    // top corners stay free for the network's close button: everything starts 56 px down
    const ls = Math.min(1, (w * 0.46) / 220);
    this.logo.scale.set(ls);
    this.logo.position.set(14 + 110 * ls, 72);
    this.cta.base = Math.min(1, w / 360);
    this.cta.position.set(14 + 75 * this.cta.base, 72 + 70 * ls);
    this.pill.position.set(w - 78, 74);
    if (portrait) {
      this.summon.base = Math.min(1, w / 400);
      this.summon.position.set(w / 2, h - 52);
      this.xp.scale.set(Math.min(1, (w - 30) / 310));
      this.xp.position.set(w / 2, h - 104);
    } else {
      // landscape: the summon button and the XP bar stack in the left column under the CTA,
      // the meadow takes everything right of it
      const col = Math.max(this.hudRight, 220);
      this.summon.base = Math.min(0.9, (col - 20) / 210, h / 430);
      this.summon.position.set(14 + col / 2, h - 18 - 36 * this.summon.base);
      this.xp.scale.set(Math.min(0.7, (col - 10) / 310));
      this.xp.position.set(14 + col / 2, this.summon.y - 52 * this.summon.base);
    }
    this.hint.position.set(w / 2, portrait ? h * 0.56 : h * 0.3);
    this.hint.scale.set(Math.min(1, (w - 40) / 320));
    this.banner.position.set(w / 2, h * (portrait ? 0.3 : 0.32));
    this.vignette.clear();
    for (let i = 0; i < 6; i++) this.vignette.rect(-i * 10, -i * 10, w + i * 20, h + i * 20).stroke({ width: 26, color: 0xff1a1a, alpha: 0.16 });
    this.vignette.alpha = 0;
    this.flash.clear().rect(0, 0, w, h).fill(0xffffff);
    this.flash.alpha = 0;
    if (this.endLayer.visible) this.layoutEnd();
  }

  get hudBottom() {
    return this.cta.y + 29 * this.cta.base;
  }

  get hudRight() {
    return Math.max(this.logo.x + 110 * this.logo.scale.x, this.cta.x + 75 * this.cta.base);
  }

  setCoins(n: number) {
    if (n > this.coins) this.coinIcon.scale.set(1.35);
    this.coins = n;
    this.pillText.text = String(n);
  }

  setSummon(cost: number, enabled: boolean) {
    this.summonCost.text = String(cost);
    this.summon.alpha = enabled ? 1 : 0.55;
  }

  /** A coin dropped in 3D continues in 2D: arcs from its screen point into the counter. */
  flyCoin(x: number, y: number) {
    if (this.flyers.length > 24) return;
    const g = new Graphics().circle(0, 0, 9).fill(gradient(0xffe27a, 0xd99a14)).stroke({ width: 2, color: 0x5a3a08 });
    g.position.set(x, y);
    g.eventMode = "none";
    this.root.addChild(g);
    this.flyers.push({ view: g, fx: x, fy: y, t: 0, arc: (Math.random() - 0.5) * 120 });
  }

  setTower(x: number, y: number, level: number, base: number) {
    this.tower.position.set(x, y);
    const label = `LVL ${level}`;
    if (this.towerText.text !== label) {
      this.towerText.text = label;
      this.towerBump = 1;
    }
    const color = base > 0.5 ? 0x5ee36a : base > 0.25 ? 0xffc23d : 0xff4a3a;
    this.baseFill.clear().roundRect(-42, 24, Math.max(6, 84 * base), 10, 5).fill(color);
  }

  setXp(level: number, frac: number) {
    this.xpFrom.text = `LV.${level}`;
    this.xpTo.text = `LV.${level + 1}`;
    this.xpTarget = frac;
    if (frac < this.xpShown) this.xpShown = 0;
  }

  /** The level number at each unit's feet. */
  setPip(i: number, x: number, y: number, level: number) {
    const pip = this.pips[i];
    pip.visible = level > 0;
    if (!level) return;
    pip.position.set(x, y);
    const g = pip.children[0] as Graphics;
    g.clear().circle(0, 0, 13).fill(LEVEL_FILL[level]).stroke({ width: 3, color: 0x101624 });
    (pip.children[1] as Text).text = String(level);
  }

  setBoss(x: number, y: number, frac: number, hp: number, visible: boolean) {
    this.bossBar.visible = visible;
    if (!visible) return;
    this.bossBar.position.set(x, y);
    this.bossFill.clear().roundRect(-96, -9, Math.max(8, 192 * frac), 18, 9).fill(gradient(0xff6a5a, 0xc0201a));
    this.bossText.text = String(Math.ceil(hp));
  }

  /** Damage numbers float up from a screen point; four styles (see init). */
  float(x: number, y: number, value: string, style: "hit" | "crit" | "burn" | "bolt") {
    if (this.floaters.length > 46) return;
    const t = new BitmapText({ text: value, style: { fontFamily: style, fontSize: style === "crit" ? 34 : style === "hit" ? 24 : 22 } });
    t.anchor.set(0.5);
    x = this.clampX(x + (Math.random() - 0.5) * 26, t.width * 0.6);
    y = Math.max(y, 150, x - t.width / 2 < this.hudRight + 10 ? this.hudBottom + 60 : 0);
    t.position.set(x, y);
    t.eventMode = "none";
    this.root.addChild(t);
    this.floaters.push({ view: t, vy: -110 - Math.random() * 40, life: 0, max: style === "crit" ? 0.9 : 0.7 });
  }

  private clampX(x: number, half: number) {
    return Math.min(this.w - half - 8, Math.max(half + 8, x));
  }

  popText(x: number, y: number, value: string, color: number, size = 44) {
    const t = text(value, size, { fill: color, stroke: { color: 0x14213d, width: size * 0.17, join: "round" } });
    t.position.set(this.clampX(x, t.width * 0.6), Math.max(y, 140));
    t.eventMode = "none";
    this.root.addChild(t);
    this.floaters.push({ view: t, vy: -70, life: 0, max: 0.9 });
  }

  showBanner(title: string, color: number, sub = "") {
    this.banner.removeChildren();
    const t = text(title, 58, { fill: color, stroke: { color: 0x14213d, width: 10, join: "round" } });
    this.banner.addChild(t);
    if (sub) {
      const s = text(sub, 24);
      s.y = 50;
      this.banner.addChild(s);
    }
    this.bannerFit = Math.min(1, (this.w - 24) / this.banner.width);
    this.bannerT = 0;
  }

  showHand(visible: boolean, x = 0, y = 0, pressed = false, caption = "") {
    this.hand.visible = visible;
    this.hint.visible = visible && caption !== "";
    if (!visible) return;
    this.hint.text = caption;
    this.hand.position.set(x, y);
    this.hand.scale.set(pressed ? 0.86 : 1);
  }

  hurt() {
    this.vignetteT = 1;
  }

  whiteFlash(strength = 1) {
    this.flashT = strength;
  }

  /** Three element cards drop in with a bounce; the gold one glows. Resolves with the card tapped (or auto-picked). */
  pickCard(choices: Element[], autoAfter = 4): Promise<Element> {
    this.dim.clear().rect(0, 0, this.w, this.h).fill({ color: 0x050812, alpha: 0.62 });
    this.dim.visible = true;
    this.cards.removeChildren();
    this.cards.visible = true;
    const portrait = this.h >= this.w;
    const title = text("TOWER LEVEL UP!", 30, { fill: gradient(0xffffff, 0xbfe9ff) });
    const sub = text("Choose an element", 20, { fill: 0xffe27a });
    const scale = Math.min(1, (this.w - 24) / (3 * 176), (this.h * 0.62) / 300);
    title.position.set(this.w / 2, this.h * (portrait ? 0.27 : 0.15));
    title.scale.set(Math.min(1, (this.w - 24) / 340));
    sub.position.set(this.w / 2, title.y + 36);
    this.cards.addChild(title, sub);
    this.logo.visible = portrait;
    const views = choices.map((c, i) => {
      const v = new RarityCard(c, ELEMENTS[c], elementIcon(c), c === "fire");
      v.scale.set(scale);
      v.position.set(this.w / 2 + (i - 1) * 176 * scale, -200);
      v.targetY = this.h * (portrait ? 0.48 : 0.58);
      v.delay = i * 0.12;
      this.cards.addChild(v);
      return v;
    });
    return new Promise((resolve) => {
      let done = false;
      let idle = 0;
      const finish = (card: Element) => {
        if (done) return;
        done = true;
        for (const v of views) v.eventMode = "none";
        const chosen = views.find((v) => v.card === card)!;
        const t0 = performance.now();
        const outro = () => {
          const k = Math.min(1, (performance.now() - t0) / 450);
          chosen.scale.set(scale * (1 + Math.sin(k * Math.PI) * 0.25));
          for (const v of views) if (v !== chosen) v.alpha = 1 - k;
          this.dim.alpha = 1 - k;
          if (k < 1) requestAnimationFrame(outro);
          else {
            this.cards.visible = false;
            this.dim.visible = false;
            this.dim.alpha = 1;
            this.logo.visible = true;
            resolve(card);
          }
        };
        outro();
      };
      for (const v of views)
        v.on("pointerdown", (e) => {
          e.stopPropagation();
          this.onTouch();
          finish(v.card);
        });
      // card-screen time: real time, but a stalled frame counts at most 0.25 s, so a hitch on a slow
      // device can't drop the cards in and auto-pick before the player has seen them
      let el = 0;
      let last = performance.now();
      const intro = () => {
        const now = performance.now();
        el += Math.min(0.25, (now - last) / 1000);
        last = now;
        // drop-in by the clock, not by frames: a slow device sees the same timing (ease-out-back, small bounce)
        for (const v of views) {
          const k = Math.min(1, Math.max(0, (el - v.delay) / 0.5));
          const e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
          v.y = -200 + (v.targetY + 200) * e;
          v.glow.alpha = 0.6 + Math.sin(now / 160) * 0.4;
        }
        // the card screen draws itself: on a slow device it stays smooth, and taps hit where the cards are
        this.app.render();
        idle = el;
        // nobody taps: the hand points at the gold card, then it is taken for them
        if (idle > 1.4) {
          const gold = views.find((v) => v.card === "fire") ?? views[1];
          this.showHand(true, gold.x, gold.y + 40 * scale, Math.sin(now / 120) > 0);
        }
        if (idle > autoAfter) finish(views.find((v) => v.card === "fire")?.card ?? views[1].card);
        if (!done) requestAnimationFrame(intro);
        else this.showHand(false);
      };
      intro();
    });
  }

  showEnd(title: string, sub: string, levels: number[], element: Element | null) {
    this.endLayer.removeChildren();
    this.endLayer.visible = true;
    for (const p of this.pips) p.visible = false;
    this.tower.visible = this.bossBar.visible = this.xp.visible = this.summon.visible = false;
    this.cta.visible = this.logo.visible = false;
    this.showHand(false);
    this.endTitle = text(title, 60, { fill: gradient(0xffe27a, 0xff8a1c), stroke: { color: 0x3a1600, width: 10, join: "round" } });
    this.endSub = text(sub, 26);
    const cards: RarityCard[] = levels.map((l) => new RarityCard(String(l), UNITS[l], unitIcon(l), l === 4));
    if (element) cards.push(new RarityCard(element, ELEMENTS[element], elementIcon(element), false));
    for (const c of cards) c.eventMode = "none";
    this.endCards = cards;
    this.endCta = new Button("PLAY NOW", 260, 78);
    this.endLayer.addChild(this.endTitle, this.endSub, ...cards, this.endCta);
    this.layoutEnd();
  }

  /** Portrait: a column over the hero. Landscape: the hero stands in the left third and the UI column takes the rest. */
  private layoutEnd() {
    const portrait = this.h >= this.w;
    const cx = portrait ? this.w / 2 : this.w * 0.63;
    const room = portrait ? this.w - 30 : Math.min(this.w * 0.6, 2 * (this.w - 150 - cx));
    const t = this.endTitle;
    t.scale.set(Math.min(1, room / 420));
    t.position.set(cx, portrait ? Math.max(this.h * 0.14, 104 + 34 * t.scale.y) : Math.max(52, this.h * 0.15));
    const s = this.endSub;
    s.scale.set(1);
    s.scale.set(Math.min(1, (portrait ? this.w - 28 : this.w * 0.62) / s.width));
    s.position.set(cx, t.y + 58 * t.scale.y);
    // a fan: the middle card highest and straight, the outer ones lower and turned out
    const n = this.endCards.length;
    const cardScale = portrait ? Math.min(0.42, (this.w - 30) / (n * 120 + 60)) : Math.min(0.38, (this.h * 0.3) / 300);
    const step = 118 * cardScale * (portrait ? 1 : 1.05);
    const cy = this.h * (portrait ? 0.7 : 0.56);
    this.endCards.forEach((v, i) => {
      const k = i - (n - 1) / 2;
      v.scale.set(cardScale);
      v.position.set(cx + k * step, cy + Math.abs(k) * Math.abs(k) * 7 * cardScale * 2);
      v.rotation = k * 0.12;
    });
    // the legendary card sits on top of its neighbours
    const legend = this.endCards.find((c) => c.card === "4");
    if (legend) this.endLayer.setChildIndex(legend, this.endLayer.children.length - 2);
    this.endCta.base = portrait ? 1 : Math.min(1, (this.h * 0.17) / 78);
    this.endCta.position.set(cx, this.h * 0.86);
  }

  update(dt: number) {
    this.cta.pulse(dt);
    this.endCta?.pulse(dt);
    this.summon.pulse(this.summon.alpha === 1 ? dt : 0);
    this.coinIcon.scale.set(1 + (this.coinIcon.scale.x - 1) * Math.pow(0.001, dt));
    this.towerBump = Math.max(0, this.towerBump - dt * 3);
    this.tower.scale.set(1 + Math.sin(this.towerBump * Math.PI) * 0.35);
    this.xpShown += (this.xpTarget - this.xpShown) * Math.min(1, dt * 6);
    this.xpFill.clear().roundRect(-107, -8, Math.max(10, 214 * this.xpShown), 16, 8).fill(gradient(0x9cf06a, 0x2fa83a));
    this.vignetteT = Math.max(0, this.vignetteT - dt * 1.8);
    this.vignette.alpha = this.vignetteT;
    this.flashT = Math.max(0, this.flashT - dt * 2.2);
    this.flash.alpha = this.flashT * 0.85;
    if (this.bannerT < 1.5) {
      this.bannerT += dt;
      const k = this.bannerT;
      const pop = k < 0.25 ? 0.4 + (k / 0.25) * 0.75 : k < 0.4 ? 1.15 - ((k - 0.25) / 0.15) * 0.15 : 1;
      this.banner.scale.set(pop * this.bannerFit);
      this.banner.alpha = k > 1.2 ? Math.max(0, 1 - (k - 1.2) / 0.3) : 1;
    } else this.banner.alpha = 0;
    for (const f of this.floaters) {
      f.life += dt;
      f.view.y += f.vy * dt;
      f.vy *= Math.pow(0.08, dt);
      const k = f.life / f.max;
      f.view.alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      f.view.scale.set(k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, k * 0.3));
    }
    for (const f of this.floaters.filter((f) => f.life >= f.max)) f.view.destroy();
    this.floaters = this.floaters.filter((f) => f.life < f.max);
    for (const f of this.flyers) {
      f.t += dt / 0.6;
      const k = Math.min(1, f.t);
      const e = k * k * (3 - 2 * k);
      const tx = this.pill.x - 40;
      const ty = this.pill.y;
      f.view.position.set(f.fx + (tx - f.fx) * e + Math.sin(k * Math.PI) * f.arc, f.fy + (ty - f.fy) * e - Math.sin(k * Math.PI) * 60);
      f.view.scale.set(1 + Math.sin(k * Math.PI) * 0.4);
    }
    for (const f of this.flyers.filter((f) => f.t >= 1)) {
      f.view.destroy();
      this.coinIcon.scale.set(1.35);
    }
    this.flyers = this.flyers.filter((f) => f.t < 1);
  }
}
