// Screen-space overlay: progress bar, coin counter, the always-visible CTA, banners and the end card.
import { Container, Graphics, Text } from "pixi.js";
import { COLORS, Hero, makeCoin } from "./art";

const FONT = "Arial Black, Arial Rounded MT Bold, Arial, sans-serif";

function label(text: string, size: number, fill = 0xffffff, stroke = 0x1b1b1b, strokeWidth = size / 6): Text {
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: "900", fill, stroke: { color: stroke, width: strokeWidth, join: "round" }, align: "center" } });
  t.anchor.set(0.5);
  return t;
}

export class Button extends Container {
  private face = new Graphics();
  private pulse = 0;
  constructor(text: string, private w = 280, private h = 86) {
    super();
    this.face
      .roundRect(-w / 2, -h / 2 + 8, w, h, h / 2)
      .fill(COLORS.ctaDark)
      .roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill(COLORS.cta)
      .roundRect(-w / 2 + 14, -h / 2 + 8, w - 28, h / 3, h / 6)
      .fill({ color: 0xffffff, alpha: 0.22 });
    this.addChild(this.face, label(text, h * 0.42, 0xffffff, COLORS.ctaDark, 7));
    this.eventMode = "static";
    this.cursor = "pointer";
  }
  update(dt: number) {
    this.pulse += dt;
    const s = 1 + Math.sin(this.pulse * 5) * 0.04;
    this.scale.set(s);
  }
}

export class Hud {
  root = new Container();
  cta = new Button("PLAY NOW");
  private bar = new Graphics();
  private barW = 320;
  private progress = 0;
  private shown = 0;
  private coinIcon = makeCoin(16);
  private coinText = label("0", 34);
  private hint = label("", 34, 0xffffff, 0x1b1b1b, 7);
  private banner = new Container();
  private flash = new Graphics();
  private title = label("SHADOW STEP", 30, 0xffffff, COLORS.heroDark, 7);
  coins = 0;
  private bannerPop = 1;
  private bannerFit = 1;
  coinTarget = { x: 0, y: 0 };
  private width = 0;
  private height = 0;

  constructor() {
    this.root.addChild(this.flash, this.bar, this.coinIcon, this.coinText, this.title, this.hint, this.banner, this.cta);
  }

  /** world: where the room sits on screen; in landscape the HUD moves into the side panels. */
  layout(width: number, height: number, world: { x: number; w: number }) {
    this.width = width;
    this.height = height;
    const left = world.x;
    const right = width - (world.x + world.w);
    const sides = height < width && Math.min(left, right) > 150;
    if (!sides) {
      this.barW = Math.min(330, width - 210);
      const top = 34;
      const barX = width / 2 - this.barW / 2 - 24;
      this.bar.position.set(barX, top);
      this.coinIcon.position.set(barX + this.barW + 52, top + 12);
      this.coinText.position.set(barX + this.barW + 52, top + 46);
      this.title.position.set(width / 2, top + 72);
      this.title.scale.set(Math.min(1, (width - 40) / 300));
      this.title.visible = height > width;
      const ctaScale = Math.min(1, width / 420);
      this.cta.scale.set(ctaScale);
      this.cta.position.set(width / 2, height - 70 * ctaScale - 10);
      this.hint.position.set(width / 2, height - 170 * ctaScale);
      this.hintMax = width - 30;
      this.hintCap = 1;
    } else {
      this.barW = Math.min(260, left - 50);
      this.title.visible = true;
      this.title.scale.set(Math.min(1, (left - 30) / 300));
      this.title.position.set(left / 2, 78);
      this.bar.position.set(left / 2 - this.barW / 2 - 8, 120);
      this.hint.position.set(left / 2, height / 2 + 30);
      this.hintMax = left - 24;
      this.hintCap = 0.8;
      const rx = width - right / 2;
      this.coinIcon.position.set(rx, 90);
      this.coinText.position.set(rx, 124);
      const ctaScale = Math.min(1, (right - 44) / 290);
      this.cta.scale.set(ctaScale);
      this.cta.position.set(rx, height - 70 * ctaScale - 16);
    }
    this.coinText.scale.set(0.7);
    this.coinTarget = { x: this.coinIcon.x, y: this.coinIcon.y };
    this.banner.position.set(width / 2, height * 0.38);
    this.banner.scale.set(Math.min(1, (width - 20) / 460));
    this.fitHint();
    this.drawBar();
  }

  setProgress(p: number) {
    this.progress = Math.max(this.progress, Math.min(1, p));
  }

  setHint(text: string) {
    this.hint.text = text;
    this.fitHint();
  }

  private hintMax = 360;
  private hintCap = 1;

  private fitHint() {
    this.hint.scale.set(1);
    const w = this.hint.width || 1;
    this.hint.scale.set(Math.min(this.hintCap, this.hintMax / w));
  }

  /** The end card has its own button; the HUD steps back. */
  endMode() {
    this.cta.visible = false;
    this.hint.visible = false;
    this.banner.alpha = 0;
  }

  addCoin() {
    this.coins += 1;
    this.coinText.text = String(this.coins * 10);
    this.coinIcon.scale.set(1.35);
  }

  showBanner(title: string, subtitle: string, color: number) {
    this.banner.removeChildren();
    const t = label(title, 64, color, 0xffffff, 10);
    const s = label(subtitle, 30, 0xffffff, 0x1b1b1b, 6);
    s.y = 62;
    this.banner.addChild(t, s);
    this.bannerFit = Math.min(1, (this.width - 20) / 460);
    this.bannerPop = 0;
    this.banner.alpha = 1;
  }

  hideBanner() {
    this.banner.alpha = 0;
  }

  redFlash() {
    this.flash.clear().rect(0, 0, this.width, this.height).fill({ color: COLORS.alarm, alpha: 0.45 });
    this.flash.alpha = 1;
  }

  update(dt: number) {
    this.cta.update(dt);
    if (this.shown < this.progress) {
      this.shown = Math.min(this.progress, this.shown + dt * 1.5);
      this.drawBar();
    }
    this.coinIcon.scale.set(1 + (this.coinIcon.scale.x - 1) * Math.pow(0.001, dt));
    if (this.bannerPop < 1) {
      this.bannerPop = Math.min(1, this.bannerPop + dt * 5);
      this.banner.scale.set(this.bannerFit * (0.2 + 0.8 * this.bannerPop));
    }
    this.flash.alpha = Math.max(0, this.flash.alpha - dt * 2.2);
  }

  private drawBar() {
    const w = this.barW;
    this.bar
      .clear()
      .roundRect(0, 0, w, 24, 12)
      .fill({ color: 0x000000, alpha: 0.45 })
      .roundRect(3, 3, Math.max(18, (w - 6) * this.shown), 18, 9)
      .fill(0x7cde45)
      .roundRect(3, 3, Math.max(18, (w - 6) * this.shown), 7, 4)
      .fill({ color: 0xffffff, alpha: 0.3 })
      .circle(w, 12, 17)
      .fill(COLORS.guard)
      .stroke({ width: 3, color: 0xffffff })
      .circle(w, 12, 7)
      .fill(COLORS.guardDark);
  }
}

/** The last screen. "level2": a locked door and three guards; "upgrade": the hero in a gold cape. */
export class EndCard {
  root = new Container();
  private dim = new Graphics();
  private panel = new Container();
  cta = new Button("PLAY NOW", 320, 96);
  private t = 0;
  private base = 1;

  constructor(kind: "level2" | "upgrade") {
    this.root.visible = false;
    this.root.eventMode = "static";
    const card = new Graphics().roundRect(-230, -300, 460, 560, 36).fill(0x2b2440).stroke({ width: 6, color: 0xffffff });
    this.panel.addChild(card);
    const title = label(kind === "level2" ? "LEVEL 2" : "NEW GEAR!", 62, 0xffd23f, COLORS.heroDark, 10);
    title.y = -228;
    this.panel.addChild(title);
    const art = new Container();
    art.y = -40;
    if (kind === "level2") {
      const door = new Graphics()
        .roundRect(-90, -110, 180, 200, 16)
        .fill(0x6b7a8f)
        .stroke({ width: 6, color: 0x1e2533 })
        .roundRect(-28, -10, 56, 48, 10)
        .fill(COLORS.gold)
        .stroke({ width: 5, color: COLORS.goldDark })
        .arc(0, -10, 18, Math.PI, 0)
        .stroke({ width: 8, color: COLORS.goldDark });
      art.addChild(door);
      for (const x of [-150, 150, 0]) {
        const g = new Graphics()
          .circle(0, 0, 20)
          .fill(COLORS.guardDark)
          .stroke({ width: 3, color: 0x000000 })
          .moveTo(0, 0)
          .poly([0, 0, -38, 70, 38, 70])
          .fill({ color: COLORS.light, alpha: 0.55 });
        g.position.set(x, x === 0 ? 120 : 70);
        art.addChild(g);
      }
    } else {
      const holder = new Container();
      const hero = new Hero(holder);
      hero.place({ x: 0, y: 0 });
      hero.update(0.016, 0);
      holder.scale.set(2.1);
      const cape = new Graphics()
        .poly([-46, -14, 46, -14, 84, 92, 0, 78, -84, 92])
        .fill(COLORS.gold)
        .stroke({ width: 5, color: COLORS.goldDark, join: "round" })
        .poly([-30, 0, 30, 0, 50, 70, -50, 70])
        .fill({ color: 0xffffff, alpha: 0.18 });
      cape.y = 6;
      art.addChild(cape, holder);
      const plus = label("+50% STEALTH", 34, 0x7cde45, 0x1b1b1b, 7);
      plus.y = 130;
      art.addChild(plus);
    }
    this.panel.addChild(art);
    const tag = label(kind === "level2" ? "Can you sneak past 3 guards?" : "Unlock it in the full game", 24, 0xffffff, 0x1b1b1b, 5);
    tag.y = 150;
    this.cta.y = 215;
    this.panel.addChild(tag, this.cta);
    this.root.addChild(this.dim, this.panel);
  }

  layout(width: number, height: number) {
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x0b0814, alpha: 0.72 });
    this.panel.position.set(width / 2, height / 2 + 10);
    this.base = Math.min(1, (width - 40) / 470, (height - 60) / 600);
    this.panel.scale.set(this.base);
  }

  show() {
    this.root.visible = true;
    this.t = 0;
  }

  update(dt: number) {
    if (!this.root.visible) return;
    this.t += dt;
    const k = Math.min(1, this.t / 0.35);
    const pop = 1 + Math.sin(k * Math.PI) * 0.12;
    this.root.alpha = k;
    this.panel.angle = (1 - k) * -6;
    this.panel.scale.set(this.base * pop);
    this.cta.update(dt);
  }
}
