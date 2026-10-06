// Shared PixiJS widgets for the 2D layer over a 3D scene: chunky outlined text, glossy buttons,
// and the rarity card used by "pick 1 of 3" screens and end cards.
import { Container, FillGradient, Graphics, Text, type TextStyleOptions } from "pixi.js";

export const FONT = '"Arial Black", "Arial Rounded MT Bold", Impact, Arial, sans-serif';

export function gradient(top: number, bottom: number) {
  return new FillGradient({ type: "linear", start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }], textureSpace: "local" });
}

/** White text, dark outline, hard drop shadow: the number style of 2026 mobile ads. Anchored at its centre. */
export function text(value: string, size: number, opts: Partial<TextStyleOptions> = {}): Text {
  const t = new Text({
    text: value,
    style: {
      fontFamily: FONT,
      fontSize: size,
      fontWeight: "900",
      fill: 0xffffff,
      stroke: { color: 0x14213d, width: Math.max(3, size * 0.16), join: "round" },
      dropShadow: { color: 0x000000, alpha: 0.35, blur: 0, distance: Math.max(2, size * 0.08), angle: Math.PI / 2 },
      align: "center",
      ...opts,
    },
  });
  t.anchor.set(0.5);
  return t;
}

/** A chunky glossy button: darker base for depth, a lighter top highlight, outlined label. */
export class Button extends Container {
  private t = 0;
  /** Layout scale; pulse() breathes around it. */
  base = 1;
  readonly caption: Text;
  constructor(label: string, w: number, h: number, top = 0x4be05f, bottom = 0x1f9a34, edge = 0x146b24) {
    super();
    const g = new Graphics()
      .roundRect(-w / 2, -h / 2 + 6, w, h, h * 0.42)
      .fill(edge)
      .roundRect(-w / 2, -h / 2, w, h, h * 0.42)
      .fill(gradient(top, bottom))
      .stroke({ width: 3, color: 0x0d3b16 })
      .roundRect(-w / 2 + 10, -h / 2 + 5, w - 20, h * 0.36, h * 0.18)
      .fill({ color: 0xffffff, alpha: 0.28 });
    this.caption = text(label, h * 0.44, { stroke: { color: edge, width: h * 0.09, join: "round" } });
    this.addChild(g, this.caption);
    this.eventMode = "static";
    this.cursor = "pointer";
  }
  pulse(dt: number) {
    this.t += dt;
    this.scale.set(this.base * (1 + Math.sin(this.t * 6) * 0.04));
  }
}

export interface Rarity {
  name: string;
  top: number;
  bottom: number;
  glow: number;
  title: string;
  info: string;
}

/** A card in a rarity frame: ribbon with the rarity, an icon on a dark inset, title and one line of info. */
export class RarityCard<K extends string = string> extends Container {
  glow = new Graphics();
  vy = 0;
  targetY = 0;
  delay = 0;
  constructor(public card: K, r: Rarity, icon: Container, highlighted: boolean, w = 168, h = 248) {
    super();
    this.glow.roundRect(-w / 2 - 16, -h / 2 - 16, w + 32, h + 32, 30).fill({ color: r.glow, alpha: 0.45 });
    this.glow.visible = highlighted;
    const frame = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, 20)
      .fill(gradient(r.top, r.bottom))
      .stroke({ width: 5, color: 0x101624 })
      .roundRect(-w / 2 + 10, -h / 2 + 44, w - 20, h - 54, 14)
      .fill(gradient(0x26304a, 0x141a2b))
      .roundRect(-w / 2 + 10, -h / 2 + 44, w - 20, 8, 4)
      .fill({ color: 0xffffff, alpha: 0.12 });
    const ribbon = text(r.name, 22, { stroke: { color: 0x101624, width: 5, join: "round" } });
    ribbon.y = -h / 2 + 24;
    icon.y = -18;
    const title = text(r.title, 21, { wordWrap: true, wordWrapWidth: w - 24, lineHeight: 22 });
    title.y = h / 2 - 66;
    const info = text(r.info, 15, { fill: 0xbfe9ff, stroke: { color: 0x101624, width: 4, join: "round" }, dropShadow: false });
    info.y = h / 2 - 28;
    this.addChild(this.glow, frame, ribbon, icon, title, info);
    this.eventMode = "static";
    this.cursor = "pointer";
  }
}
