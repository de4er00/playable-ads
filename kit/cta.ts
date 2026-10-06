import type { Network } from "./network";

export interface Cta {
  /** Call on the player's first game interaction; until then open() does nothing. */
  arm(): void;
  /** Send the player to the store through the network's own API. Returns false if nothing was called. */
  open(): boolean;
  /** Mintegral wants to know when the playable has loaded and when it has ended. */
  ready(): void;
  end(): void;
}

export function createCta(network: Network, win: any, storeUrl: string): Cta {
  let armed = false;

  const call = (): boolean => {
    switch (network) {
      case "applovin":
      case "unity":
        return invoke(win.mraid?.open, win.mraid, storeUrl);
      case "liftoff":
        return invoke(win.Liftoff?.open, win.Liftoff) || invoke(win.mraid?.open, win.mraid, storeUrl);
      case "google":
        return invoke(win.ExitApi?.exit, win.ExitApi);
      case "meta":
      case "moloco":
        return invoke(win.FbPlayableAd?.onCTAClick, win.FbPlayableAd);
      case "mintegral":
        return invoke(win.install, win);
      case "tiktok":
        return invoke(win.openAppStore, win);
      case "preview":
        win.parent?.postMessage?.({ type: "cta", network, storeUrl }, "*");
        return true;
    }
  };

  return {
    arm() {
      armed = true;
    },
    open() {
      // Networks reject builds that send the first tap to the store.
      return armed ? call() : false;
    },
    ready() {
      if (network === "mintegral") invoke(win.gameReady, win);
    },
    end() {
      if (network === "mintegral") invoke(win.gameEnd, win);
    },
  };
}

// A missing network API is not an error worth a crash, and window.open is forbidden by every network.
function invoke(fn: unknown, self: unknown, ...args: unknown[]): boolean {
  if (typeof fn !== "function") return false;
  fn.apply(self, args);
  return true;
}
