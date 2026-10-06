import { createAudio } from "../../../kit/audio";
import { boot } from "../../../kit/boot";
import { createCta } from "../../../kit/cta";
import { fpsOverlay } from "../../../kit/fps";
import { currentNetwork } from "../../../kit/network";
import { installStubs } from "../../../kit/stubs";
import variants from "../variants.json";
import { Game, type Variant } from "./game";

declare const __VARIANT_ID__: string | undefined;

// A fictional game: the store link is a placeholder, the network SDK decides where it really goes.
const STORE_URL = "https://play.google.com/store/apps/details?id=com.example.spiralsiege";

const params = new URLSearchParams(location.search);
const variantId = typeof __VARIANT_ID__ === "string" ? __VARIANT_ID__ : params.get("v") || "a";
const variant = (variants as Record<string, Variant>)[variantId] ?? (variants as Record<string, Variant>).a;
const { network, stubbed } = currentNetwork(document, location.search);
if (stubbed) installStubs(window, network);

const audio = createAudio(window);
const cta = createCta(network, window, STORE_URL);
const game = new Game(variant, audio, cta);
let startWanted = false;
let ready = false;

boot(window, {
  onStart() {
    startWanted = true;
    if (ready) game.start();
  },
  onPause() {
    game.pause();
    audio.mute(true);
  },
  onResume() {
    game.resume();
    audio.mute(false);
  },
});

game.init().then(() => {
  ready = true;
  addEventListener("resize", () => requestAnimationFrame(() => game.resize()));
  document.getElementById("loader")?.remove();
  cta.ready();
  fpsOverlay(window);
  if (startWanted) game.start();
  if (params.has("e2e")) (window as any).__playable = { game, network, variant: variantId };
});
