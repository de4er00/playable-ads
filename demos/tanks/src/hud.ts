// HTML overlay: crisp text at any density for free, and the CTA is a real button.
const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: "Arial Black", Arial, sans-serif; color: #fff; user-select: none; }
#hud .top { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; }
#hud .pip { width: 30px; height: 30px; border-radius: 50%; background: #e2533d; border: 4px solid #fff; box-shadow: 0 3px 0 #9c2f22; transition: transform .2s, background .2s; }
#hud .pip.dead { background: #555; box-shadow: 0 3px 0 #222; transform: scale(.8); }
#hud .title { position: absolute; top: 62px; left: 50%; transform: translateX(-50%); font-size: 28px; letter-spacing: 1px; text-shadow: 0 3px 0 #1b1b22, 0 0 6px #1b1b22; white-space: nowrap; }
#hud .hint { position: absolute; left: 50%; bottom: 128px; transform: translateX(-50%); font-size: 30px; white-space: nowrap; text-shadow: 0 3px 0 #1b1b22, 0 0 8px #1b1b22; }
#hud .hand { position: absolute; width: 64px; height: 84px; margin: -6px 0 0 -14px; opacity: 0; transition: opacity .2s; }
#hud button.cta { pointer-events: auto; position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); white-space: nowrap; font: 900 clamp(24px, 8vw, 36px) "Arial Black", Arial, sans-serif; color: #fff; background: #3cc24f; border: 0; border-radius: 48px; padding: 18px 54px; box-shadow: 0 8px 0 #22862f; text-shadow: 0 3px 0 #22862f; animation: pulse 1.2s ease-in-out infinite; }
#hud .banner { position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%) scale(0); font-size: 58px; color: #ffd23f; text-shadow: 0 5px 0 #1b1b22, 0 0 10px #1b1b22; transition: transform .25s cubic-bezier(.3,1.6,.5,1); white-space: nowrap; }
#hud .banner.on { transform: translate(-50%, -50%) scale(1); }
#end { position: fixed; inset: 0; display: none; place-items: center; background: rgba(11,8,20,.72); font-family: "Arial Black", Arial, sans-serif; color: #fff; }
#end.on { display: grid; animation: fadein .35s ease-out; }
#end .card { box-sizing: border-box; width: min(440px, 92vw); padding: 28px 20px 32px; border-radius: 34px; background: #2b2440; border: 6px solid #fff; text-align: center; animation: pop .45s cubic-bezier(.3,1.6,.5,1); }
#end h1 { margin: 0 0 10px; font-size: clamp(30px, 10vw, 52px); white-space: nowrap; color: #ffd23f; text-shadow: 0 5px 0 #1b1b22; }
#end p { margin: 14px 0 22px; font-size: 22px; }
#end svg { width: 70%; height: auto; }
#end button { white-space: nowrap; font: 900 clamp(26px, 8vw, 38px) "Arial Black", Arial, sans-serif; color: #fff; background: #3cc24f; border: 0; border-radius: 48px; padding: 18px 60px; box-shadow: 0 8px 0 #22862f; animation: pulse 1.2s ease-in-out infinite; }
@media (orientation: landscape) and (max-height: 520px) {
  #hud .title { display: none; }
  #hud .hint { bottom: auto; top: 50%; left: 16px; transform: none; width: 18vw; white-space: normal; text-align: center; font-size: 20px; }
  #hud button.cta { left: auto; right: 22px; transform: none; font-size: 26px; padding: 14px 34px; }
  #end .card { transform: scale(.72); }
}
@keyframes pulse { 50% { scale: 1.05; } }
@keyframes pop { from { transform: scale(.4) rotate(-6deg); } }
@keyframes fadein { from { opacity: 0; } }
`;

const HAND = `<svg viewBox="0 0 64 84"><path d="M22 4c5 0 8 3 8 8v24l14 2c8 1 13 6 12 14l-3 20c-1 6-6 10-12 10H24c-5 0-8-2-10-6L4 50c-2-4 0-8 4-9s7 1 9 4l-3-5V12c0-5 3-8 8-8z" fill="#fff" stroke="#222" stroke-width="4" stroke-linejoin="round"/></svg>`;

const UPGRADE_ART = `<svg viewBox="0 0 200 120"><rect x="30" y="58" width="140" height="44" rx="12" fill="#47b04f" stroke="#1b1b22" stroke-width="6"/><circle cx="100" cy="56" r="28" fill="#2b7a33" stroke="#1b1b22" stroke-width="6"/><rect x="104" y="30" width="80" height="12" rx="5" fill="#ffd23f" stroke="#1b1b22" stroke-width="5"/><rect x="104" y="48" width="80" height="12" rx="5" fill="#ffd23f" stroke="#1b1b22" stroke-width="5"/><rect x="22" y="96" width="156" height="16" rx="8" fill="#2b2e35"/></svg>`;
const LEVEL2_ART = `<svg viewBox="0 0 200 120"><circle cx="100" cy="64" r="44" fill="#7c8592" stroke="#1b1b22" stroke-width="6"/><rect x="72" y="58" width="56" height="10" fill="#22252b"/><circle cx="34" cy="96" r="18" fill="#e2533d" stroke="#1b1b22" stroke-width="5"/><circle cx="166" cy="96" r="18" fill="#e2533d" stroke="#1b1b22" stroke-width="5"/><circle cx="100" cy="112" r="14" fill="#e2533d" stroke="#1b1b22" stroke-width="5"/><text x="100" y="40" font-size="30" text-anchor="middle" fill="#ffd23f" stroke="#1b1b22" stroke-width="3" font-family="Arial Black">BOSS</text></svg>`;

export class Hud {
  root: HTMLDivElement;
  cta: HTMLButtonElement;
  endCta: HTMLButtonElement;
  private pips: HTMLDivElement[] = [];
  private hint: HTMLDivElement;
  private hand: HTMLDivElement;
  private banner: HTMLDivElement;
  private end: HTMLDivElement;

  constructor(enemies: number, endcard: "level2" | "upgrade") {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement("div");
    this.root.id = "hud";
    const top = document.createElement("div");
    top.className = "top";
    for (let i = 0; i < enemies; i++) {
      const pip = document.createElement("div");
      pip.className = "pip";
      this.pips.push(pip);
      top.appendChild(pip);
    }
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "TANK RUSH";
    this.hint = document.createElement("div");
    this.hint.className = "hint";
    this.hand = document.createElement("div");
    this.hand.className = "hand";
    this.hand.innerHTML = HAND;
    this.banner = document.createElement("div");
    this.banner.className = "banner";
    this.cta = document.createElement("button");
    this.cta.className = "cta";
    this.cta.textContent = "PLAY NOW";
    this.root.append(top, title, this.hint, this.hand, this.banner, this.cta);
    this.end = document.createElement("div");
    this.end.id = "end";
    const upgrade = endcard === "upgrade";
    this.end.innerHTML = `<div class="card"><h1>${upgrade ? "DOUBLE BARREL!" : "LEVEL 2"}</h1>${upgrade ? UPGRADE_ART : LEVEL2_ART}<p>${
      upgrade ? "Unlock it in the full game" : "Can you beat the boss tank?"
    }</p><button>PLAY NOW</button></div>`;
    this.endCta = this.end.querySelector("button")!;
    document.body.append(this.root, this.end);
  }

  setHint(text: string) {
    this.hint.textContent = text;
    const max = Math.min(innerWidth - 24, 520);
    this.hint.style.scale = "1";
    const w = this.hint.getBoundingClientRect().width || 1;
    this.hint.style.scale = String(Math.min(1, max / w));
  }

  /** Fingertip at (x, y) in CSS pixels; visible false hides it. */
  setHand(x: number, y: number, visible: boolean, pressed: boolean) {
    this.hand.style.left = `${x}px`;
    this.hand.style.top = `${y}px`;
    this.hand.style.opacity = visible ? "1" : "0";
    this.hand.style.transform = pressed ? "scale(.85)" : "scale(1)";
  }

  kill(index: number) {
    this.pips[index]?.classList.add("dead");
  }

  flash(text: string) {
    this.banner.textContent = text;
    this.banner.classList.add("on");
    setTimeout(() => this.banner.classList.remove("on"), 900);
  }

  showEnd() {
    this.root.style.display = "none";
    this.end.classList.add("on");
  }

  get endShown() {
    return this.end.classList.contains("on");
  }
}
