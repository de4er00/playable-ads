import type { Network } from "./network";

/**
 * Preview only: stand-ins for each network's API that report every call to the parent page,
 * so the portfolio site can show which function a real build would hit. Never part of a network build.
 */
export function installStubs(win: any, network: Network): void {
  const report = (call: string) => win.parent?.postMessage?.({ type: "network-call", network, call }, "*");
  const listeners: Record<string, ((...a: any[]) => void)[]> = {};
  if (network === "applovin" || network === "unity" || network === "liftoff") {
    win.mraid = {
      getState: () => "default",
      isViewable: () => true,
      addEventListener: (name: string, fn: (...a: any[]) => void) => (listeners[name] ||= []).push(fn),
      removeEventListener() {},
      open: (url: string) => report(`mraid.open("${url}")`),
    };
  }
  if (network === "liftoff") win.Liftoff = { open: () => report("Liftoff.open()") };
  if (network === "google") win.ExitApi = { exit: () => report("ExitApi.exit()") };
  if (network === "meta" || network === "moloco") win.FbPlayableAd = { onCTAClick: () => report("FbPlayableAd.onCTAClick()") };
  if (network === "mintegral") {
    win.install = () => report("window.install()");
    win.gameReady = () => report("window.gameReady()");
    win.gameEnd = () => report("window.gameEnd()");
  }
  if (network === "tiktok") win.openAppStore = () => report("window.openAppStore()");
}
