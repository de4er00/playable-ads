import { Application } from "pixi.js";
import { createAudio } from "../../../kit/audio";
import { boot } from "../../../kit/boot";
import { createCta } from "../../../kit/cta";
import { currentNetwork } from "../../../kit/network";
import { installStubs } from "../../../kit/stubs";
import variants from "../variants.json";
import { Game, type Variant } from "./game";
import { LEVEL } from "./level";

declare const __VARIANT_ID__: string | undefined;

// A fictional game: the store link is a placeholder, the network SDK decides where it really goes.
const STORE_URL = "https://play.google.com/store/apps/details?id=com.example.shadowstep";

const params = new URLSearchParams(location.search);
const variantId = typeof __VARIANT_ID__ === "string" ? __VARIANT_ID__ : params.get("v") || "a";
const variant = (variants as Record<string, Variant>)[variantId] ?? (variants as Record<string, Variant>).a;
const { network, stubbed } = currentNetwork(document, location.search);
if (stubbed) installStubs(window, network);

const audio = createAudio(window);
const cta = createCta(network, window, STORE_URL);
let game: Game | null = null;
let startWanted = false;

const app = new Application();

boot(window, {
  onStart() {
    startWanted = true;
    game?.start();
  },
  onPause() {
    app.ticker?.stop();
    audio.mute(true);
  },
  onResume() {
    app.ticker?.start();
    audio.mute(false);
  },
});

(async () => {
  await app.init({
    background: 0x1d1830,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: "webgl",
  });
  document.body.appendChild(app.canvas);
  game = new Game(app, variant, audio, cta);
  addEventListener("resize", () => requestAnimationFrame(() => game?.resize()));
  cta.ready();
  document.getElementById("loader")?.remove();
  if (startWanted) game.start();
  if (params.has("e2e")) (window as any).__playable = { game, network, variant: variantId, route: LEVEL.safeRoute };
})();
