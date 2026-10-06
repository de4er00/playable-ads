// The 2D layer, drawn by PixiJS over the Three.js scene: HUD, numbers on objects, cards, banners, end-card text.
import { Application, BitmapText, Container, Graphics, type Text } from "pixi.js";
import { Button, RarityCard, type Rarity, gradient, text } from "../../../kit/hud";
import type { Card } from "./sim";

const RARITY: Record<Card, Rarity> = {
  barrel: { name: "RARE", top: 0x5cc0ff, bottom: 0x1c5fd6, glow: 0x5cc0ff, title: "TWIN BARREL", info: "+60% damage" },
  rockets: { name: "EPIC", top: 0xd08bff, bottom: 0x6a2bd6, glow: 0xc06bff, title: "ROCKET POD", info: "Splash rockets" },
  shield: { name: "LEGENDARY", top: 0xffe27a, bottom: 0xff8a1c, glow: 0xffc23d, title: "SHIELD DRONE", info: "Blocks 12 hits" },
};

function cardIcon(card: Card): Graphics {
  const g = new Graphics();
  if (card === "barrel") {
    for (const dx of [-16, 16]) {
      g.roundRect(dx - 10, -34, 20, 62, 8).fill(0xc9d3e0).stroke({ width: 4, color: 0x1b2433 });
      g.roundRect(dx - 13, -42, 26, 14, 5).fill(0x2a3140).stroke({ width: 4, color: 0x1b2433 });
    }
    g.roundRect(-34, 20, 68, 24, 8).fill(0x2f7be6).stroke({ width: 4, color: 0x1b2433 });
  } else if (card === "rockets") {
    for (const dx of [-20, 20]) {
      g.poly([dx, -46, dx + 11, -26, dx + 11, 22, dx - 11, 22, dx - 11, -26]).fill(0xeef1f6).stroke({ width: 4, color: 0x1b2433 });
      g.poly([dx - 11, 6, dx - 20, 26, dx - 11, 22]).fill(0xe2412f).stroke({ width: 3, color: 0x1b2433 });
      g.poly([dx + 11, 6, dx + 20, 26, dx + 11, 22]).fill(0xe2412f).stroke({ width: 3, color: 0x1b2433 });
      g.poly([dx - 7, 24, dx + 7, 24, dx, 46]).fill(0xffb13a);
      g.rect(dx - 11, -18, 22, 7).fill(0xe2412f);
    }
  } else {
    const hex = Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2 - Math.PI / 2) * 46, Math.sin((i / 6) * Math.PI * 2 - Math.PI / 2) * 46]).flat();
    g.poly(hex).fill({ color: 0x63f5ff, alpha: 0.35 }).stroke({ width: 5, color: 0x63f5ff });
    g.circle(0, 0, 18).fill(0x2f7be6).stroke({ width: 4, color: 0x1b2433 });
    g.rect(-30, -4, 60, 8).fill(0x1b2433);
    g.circle(-30, 0, 7).fill(0xc9d3e0).stroke({ width: 3, color: 0x1b2433 });
    g.circle(30, 0, 7).fill(0xc9d3e0).stroke({ width: 3, color: 0x1b2433 });
    g.circle(0, 0, 6).fill(0x63f5ff);
  }
  return g;
}

type CardView = RarityCard<Card>;
const cardView = (card: Card): CardView => new RarityCard(card, RARITY[card], cardIcon(card), card === "shield");

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
  private logo = new Container();
  private pill = new Container();
  private pillText!: Text;
  private nutIcon = new Graphics();
  private badge = new Container();
  private badgeText!: Text;
  private badgeBump = 0;
  private bossBar = new Container();
  private bossFill = new Graphics();
  private bossText!: Text;
  private hand = new Container();
  private hint!: Text;
  private banner = new Container();
  private bannerT = 1;
  private floaters: Floater[] = [];
  private flyers: Flyer[] = [];
  private cards = new Container();
  private dim = new Graphics();
  private endLayer = new Container();
  private endTitle!: Text;
  private endSub!: Text;
  private endCards: CardView[] = [];
  endCta!: Button;
  coins = 0;
  w = 0;
  h = 0;

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

    const title = text("MECH RUSH", 30, { fill: gradient(0xffe27a, 0xff8a1c), stroke: { color: 0x3a1600, width: 6, join: "round" } });
    const sub = text("SQUAD WARS", 13, { fill: 0xffffff, stroke: { color: 0x14213d, width: 4, join: "round" }, dropShadow: false });
    sub.y = 24;
    this.logo.addChild(title, sub);
    this.cta = new Button("PLAY NOW", 150, 46);

    this.pill.addChild(new Graphics().roundRect(-62, -20, 124, 40, 20).fill({ color: 0x0b1020, alpha: 0.6 }).stroke({ width: 2, color: 0xffffff, alpha: 0.15 }));
    this.nutIcon.poly(Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * 15, Math.sin((i / 6) * Math.PI * 2) * 15]).flat()).fill(gradient(0xffe27a, 0xd99a14)).stroke({ width: 3, color: 0x5a3a08 }).circle(0, 0, 6).fill(0x5a3a08);
    this.nutIcon.x = -40;
    this.pillText = text("0", 24);
    this.pillText.x = 14;
    this.pill.addChild(this.nutIcon, this.pillText);

    this.badge.addChild(new Graphics().roundRect(-34, -22, 68, 44, 22).fill(gradient(0x5cc0ff, 0x1c5fd6)).stroke({ width: 4, color: 0x0b2a5a }));
    this.badgeText = text("5", 28);
    this.badge.addChild(this.badgeText);

    this.bossBar.addChild(new Graphics().roundRect(-110, -14, 220, 28, 14).fill({ color: 0x0b1020, alpha: 0.75 }).stroke({ width: 3, color: 0x000000 }), this.bossFill);
    this.bossText = text("", 20);
    const bossLabel = text("BOSS", 22, { fill: gradient(0xff8a7a, 0xd62a1a) });
    bossLabel.y = -30;
    this.bossBar.addChild(this.bossText, bossLabel);
    this.bossBar.visible = false;

    const glove = new Graphics()
      .roundRect(-9, -2, 18, 46, 9).fill(0xffffff).stroke({ width: 4, color: 0x222222 })
      .roundRect(-16, 28, 46, 40, 16).fill(0xffffff).stroke({ width: 4, color: 0x222222 })
      .roundRect(-9, -2, 18, 32, 9).fill(0xffffff);
    this.hand.addChild(glove);
    this.hand.visible = false;
    this.hint = text("DRAG TO MOVE", 30);
    this.hint.visible = false;

    this.cards.visible = false;
    this.dim.visible = false;
    // overlays never take touches, so nothing decorative can swallow a tap on a card
    for (const o of [this.badge, this.bossBar, this.banner, this.hand, this.hint, this.logo, this.pill]) o.eventMode = "none";
    this.root.addChild(this.dim, this.badge, this.bossBar, this.banner, this.cards, this.hand, this.hint, this.logo, this.cta, this.pill, this.endLayer);
    this.endLayer.visible = false;
  }

  layout(w: number, h: number) {
    this.w = w;
    this.h = h;
    // top corners stay free for the network's close button: everything starts 56 px down
    // logo and CTA hug the left edge under the corner; scale down on narrow screens
    const ls = Math.min(1, (w * 0.46) / 220);
    this.logo.scale.set(ls);
    this.logo.position.set(14 + 110 * ls, 72);
    this.cta.base = Math.min(1, w / 360);
    this.cta.position.set(14 + 75 * this.cta.base, 72 + 70 * ls);
    this.pill.position.set(w - 78, 74);
    this.hint.position.set(w / 2, h * 0.78);
    this.hint.scale.set(Math.min(1, (w - 40) / 320));
    this.banner.position.set(w / 2, h * 0.32);
    if (this.endLayer.visible) this.layoutEnd();
  }

  /** Lowest screen y the top-left HUD (logo + CTA, 46 px tall with a 6 px lip) reaches. */
  get hudBottom() {
    return this.cta.y + 29 * this.cta.base;
  }

  /** Right edge of the top-left HUD (the logo is the wider of the two). */
  get hudRight() {
    return Math.max(this.logo.x + 110 * this.logo.scale.x, this.cta.x + 75 * this.cta.base);
  }

  setCoins(n: number) {
    this.coins = n;
    this.pillText.text = String(n);
    this.nutIcon.scale.set(1.35);
  }

  /** A nut collected in 3D continues in 2D: arcs from its screen point into the counter. */
  flyNut(x: number, y: number) {
    const g = new Graphics().poly(Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * 10, Math.sin((i / 6) * Math.PI * 2) * 10]).flat()).fill(gradient(0xffe27a, 0xd99a14)).stroke({ width: 2, color: 0x5a3a08 });
    g.position.set(x, y);
    g.eventMode = "none";
    this.root.addChild(g);
    this.flyers.push({ view: g, fx: x, fy: y, t: 0, arc: (Math.random() - 0.5) * 120 });
  }

  setBadge(x: number, y: number, count: number, visible: boolean) {
    this.badge.visible = visible;
    this.badge.position.set(x, y);
    if (this.badgeText.text !== String(count)) {
      this.badgeText.text = String(count);
      this.badgeBump = 1;
    }
  }

  setBoss(x: number, y: number, frac: number, hp: number, visible: boolean) {
    this.bossBar.visible = visible;
    if (!visible) return;
    this.bossBar.position.set(x, y);
    this.bossFill.clear().roundRect(-106, -10, Math.max(8, 212 * frac), 20, 10).fill(gradient(0xff6a5a, 0xc0201a));
    this.bossText.text = String(Math.ceil(hp));
  }

  /** Damage numbers and gate results, floating up from a screen point. */
  float(x: number, y: number, value: string, color = 0xffffff, size = 26) {
    if (this.floaters.length > 40) return;
    const t = new BitmapText({ text: value, style: { fontFamily: "Arial Black", fontSize: size, fill: color, stroke: { color: 0x14213d, width: Math.max(3, size * 0.18) } } });
    t.anchor.set(0.5);
    // numbers rise about 50 px: start them low enough to stay clear of the HUD and the coin counter
    x = this.clampX(x + (Math.random() - 0.5) * 30, t.width * 0.6);
    y = Math.max(y, 150, x - t.width / 2 < this.hudRight + 10 ? this.hudBottom + 60 : 0);
    t.position.set(x, y);
    t.eventMode = "none";
    this.root.addChild(t);
    this.floaters.push({ view: t, vy: -110 - Math.random() * 40, life: 0, max: 0.7 });
  }

  /** Keeps a label of the given half-width on screen. */
  private clampX(x: number, half: number) {
    return Math.min(this.w - half - 8, Math.max(half + 8, x));
  }

  popText(x: number, y: number, value: string, color: number) {
    const t = text(value, 54, { fill: color, stroke: { color: 0x14213d, width: 9, join: "round" } });
    // floaters pop up to 1.2x, so clamp the grown width
    t.position.set(this.clampX(x, t.width * 0.6), y);
    t.eventMode = "none";
    this.root.addChild(t);
    this.floaters.push({ view: t, vy: -70, life: 0, max: 0.9 });
  }

  showBanner(title: string, color: number, sub = "") {
    this.banner.removeChildren();
    const t = text(title, 64, { fill: color, stroke: { color: 0x14213d, width: 11, join: "round" } });
    this.banner.addChild(t);
    if (sub) {
      const s = text(sub, 26);
      s.y = 54;
      this.banner.addChild(s);
    }
    this.bannerT = 0;
  }

  showHint(visible: boolean, x = 0, y = 0, pressed = false) {
    this.hand.visible = visible;
    this.hint.visible = visible;
    if (!visible) return;
    this.hand.position.set(x, y);
    this.hand.scale.set(pressed ? 0.88 : 1);
  }

  /** Three cards drop in with a bounce; the gold one glows. Resolves with the card the player taps. */
  pickCard(choices: Card[], autoAfter = 6): Promise<Card> {
    this.dim.clear().rect(0, 0, this.w, this.h).fill({ color: 0x050812, alpha: 0.62 });
    this.dim.visible = true;
    this.cards.removeChildren();
    this.cards.visible = true;
    const title = text("CHOOSE AN UPGRADE", 34, { fill: gradient(0xffffff, 0xbfe9ff) });
    const portrait = this.h >= this.w;
    const scale = Math.min(1, (this.w - 24) / (3 * 176), (this.h * 0.7) / 300);
    title.position.set(this.w / 2, this.h * (portrait ? 0.28 : 0.16));
    title.scale.set(Math.min(1, (this.w - 24) / 420));
    this.cards.addChild(title);
    // in landscape the title runs into the logo: the logo steps aside while the cards are up
    this.logo.visible = portrait;
    const views = choices.map((c, i) => {
      const v = cardView(c);
      v.scale.set(scale);
      v.position.set(this.w / 2 + (i - 1) * 176 * scale, -200);
      v.targetY = this.h * (portrait ? 0.48 : 0.56);
      v.delay = i * 0.12;
      this.cards.addChild(v);
      return v;
    });
    return new Promise((resolve) => {
      let done = false;
      let idle = 0;
      const finish = (card: Card) => {
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
            this.logo.visible = true;
            this.dim.alpha = 1;
            resolve(card);
          }
        };
        outro();
      };
      for (const v of views) v.on("pointerdown", (e) => { e.stopPropagation(); finish(v.card); });
      const start = performance.now();
      const intro = () => {
        const now = performance.now();
        const el = (now - start) / 1000;
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
        if (idle > 1.6) {
          const gold = views.find((v) => v.card === "shield") ?? views[1];
          this.showHint(true, gold.x, gold.y + 40 * scale, Math.sin(now / 120) > 0);
          this.hint.visible = false;
        }
        if (idle > autoAfter) finish(views[1].card);
        if (!done) requestAnimationFrame(intro);
        else this.showHint(false);
      };
      intro();
    });
  }

  showEnd(title: string, sub: string, picks: Card[]) {
    this.endLayer.removeChildren();
    this.endLayer.visible = true;
    this.badge.visible = this.bossBar.visible = false;
    this.cta.visible = false;
    this.logo.visible = false;
    this.endTitle = text(title, 62, { fill: gradient(0xffe27a, 0xff8a1c), stroke: { color: 0x3a1600, width: 10, join: "round" } });
    this.endSub = text(sub, 26);
    this.endCards = picks.map((c) => {
      const v = cardView(c);
      v.eventMode = "none";
      return v;
    });
    this.endCta = new Button("PLAY NOW", 260, 78);
    this.endLayer.addChild(this.endTitle, this.endSub, ...this.endCards, this.endCta);
    this.layoutEnd();
  }

  /** Portrait: a column over the hero. Landscape: the hero stands in the left third (the camera
   *  shifts it there) and title, cards and button make a column on the right. Re-run on rotation. */
  private layoutEnd() {
    const portrait = this.h >= this.w;
    const cx = portrait ? this.w / 2 : this.w * 0.63;
    // landscape: keep the title clear of the coin counter on the right
    const room = portrait ? this.w - 30 : Math.min(this.w * 0.6, 2 * (this.w - 150 - cx));
    const t = this.endTitle;
    t.scale.set(Math.min(1, room / 420));
    // portrait: the title starts under the coin counter, which stays up as the run's score
    t.position.set(cx, portrait ? Math.max(this.h * 0.14, 104 + 34 * t.scale.y) : Math.max(52, this.h * 0.15));
    const s = this.endSub;
    s.scale.set(1);
    s.scale.set(Math.min(1, (portrait ? this.w - 28 : this.w * 0.62) / s.width));
    s.position.set(cx, t.y + 58 * t.scale.y);
    const cardScale = portrait ? 0.42 : Math.min(0.42, (this.h * 0.32) / 300);
    this.endCards.forEach((v, i) => {
      v.scale.set(cardScale);
      v.position.set(cx + (i - (this.endCards.length - 1) / 2) * 190 * cardScale, this.h * (portrait ? 0.7 : 0.56));
    });
    this.endCta.base = portrait ? 1 : Math.min(1, (this.h * 0.17) / 78);
    this.endCta.position.set(cx, this.h * (portrait ? 0.85 : 0.85));
  }

  update(dt: number) {
    this.cta.pulse(dt);
    this.endCta?.pulse(dt);
    this.nutIcon.scale.set(1 + (this.nutIcon.scale.x - 1) * Math.pow(0.001, dt));
    this.badgeBump = Math.max(0, this.badgeBump - dt * 5);
    this.badge.scale.set(1 + Math.sin(this.badgeBump * Math.PI) * 0.35);
    if (this.bannerT < 1.4) {
      this.bannerT += dt;
      const k = this.bannerT;
      const pop = k < 0.25 ? 0.4 + (k / 0.25) * 0.75 : k < 0.4 ? 1.15 - ((k - 0.25) / 0.15) * 0.15 : 1;
      this.banner.scale.set(pop * Math.min(1, (this.w - 20) / 460));
      this.banner.alpha = k > 1.1 ? Math.max(0, 1 - (k - 1.1) / 0.3) : 1;
    }
    for (const f of this.floaters) {
      f.life += dt;
      f.view.y += f.vy * dt;
      f.vy *= Math.pow(0.08, dt);
      const k = f.life / f.max;
      f.view.alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      f.view.scale.set(k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, k * 0.3));
    }
    this.floaters = this.floaters.filter((f) => {
      if (f.life < f.max) return true;
      f.view.destroy();
      return false;
    });
    const tx = this.pill.x - 40;
    const ty = this.pill.y;
    for (const f of this.flyers) {
      f.t += dt / 0.55;
      const k = Math.min(1, f.t);
      const e = k * k * (3 - 2 * k);
      const mx = (f.fx + tx) / 2 + f.arc;
      const my = Math.min(f.fy, ty) - 60;
      f.view.position.set((1 - e) * (1 - e) * f.fx + 2 * (1 - e) * e * mx + e * e * tx, (1 - e) * (1 - e) * f.fy + 2 * (1 - e) * e * my + e * e * ty);
      f.view.rotation = e * 6;
      if (k >= 1) {
        f.view.destroy();
        this.setCoins(this.coins + 1);
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < 1);
  }
}
