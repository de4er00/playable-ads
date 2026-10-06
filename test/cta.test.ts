import { describe, expect, it, vi } from "vitest";
import { createCta } from "../kit/cta";
import type { Network } from "../kit/network";

const STORE = "https://play.google.com/store/apps/details?id=demo";

function windowFor(network: Network) {
  const calls: string[] = [];
  const log = (name: string) => () => calls.push(name);
  const win: any = {
    mraid: { open: (url: string) => calls.push(`mraid.open ${url}`) },
    ExitApi: { exit: log("ExitApi.exit") },
    FbPlayableAd: { onCTAClick: log("FbPlayableAd.onCTAClick") },
    install: log("install"),
    openAppStore: log("openAppStore"),
    gameReady: log("gameReady"),
    gameEnd: log("gameEnd"),
    parent: { postMessage: (m: any) => calls.push(`postMessage ${m.type}`) },
  };
  if (network === "liftoff") win.Liftoff = { open: log("Liftoff.open") };
  return { win, calls };
}

const expected: Record<Network, string> = {
  applovin: `mraid.open ${STORE}`,
  unity: `mraid.open ${STORE}`,
  liftoff: "Liftoff.open",
  google: "ExitApi.exit",
  meta: "FbPlayableAd.onCTAClick",
  moloco: "FbPlayableAd.onCTAClick",
  mintegral: "install",
  tiktok: "openAppStore",
  preview: "postMessage cta",
};

describe("cta", () => {
  for (const [network, call] of Object.entries(expected) as [Network, string][]) {
    it(`${network} calls ${call}`, () => {
      const { win, calls } = windowFor(network);
      const cta = createCta(network, win, STORE);
      cta.arm();
      expect(cta.open()).toBe(true);
      expect(calls).toContain(call);
    });
  }

  it("does nothing before the first game interaction", () => {
    const { win, calls } = windowFor("applovin");
    const cta = createCta("applovin", win, STORE);
    expect(cta.open()).toBe(false);
    expect(calls).toEqual([]);
  });

  it("never falls back to window.open when the network API is missing", () => {
    const open = vi.fn();
    const cta = createCta("meta", { open } as any, STORE);
    cta.arm();
    expect(cta.open()).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("tells Mintegral when the game is ready and when it ends", () => {
    const { win, calls } = windowFor("mintegral");
    const cta = createCta("mintegral", win, STORE);
    cta.ready();
    cta.end();
    expect(calls).toEqual(["gameReady", "gameEnd"]);
  });

  it("does not call Mintegral hooks on other networks", () => {
    const { win, calls } = windowFor("unity");
    const cta = createCta("unity", win, STORE);
    cta.ready();
    cta.end();
    expect(calls).toEqual([]);
  });
});
