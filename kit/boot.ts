export interface BootHooks {
  onStart(): void;
  onPause(): void;
  onResume(): void;
  /** Some SDKs never send viewableChange; start anyway after this long. */
  timeoutMs?: number;
}

/**
 * Start the playable only when the ad container says it is shown.
 * With MRAID: wait for "ready", then for isViewable() or viewableChange(true), with a timeout fallback.
 * Without MRAID (Google, Meta, Moloco, TikTok, preview): start at once.
 */
export function boot(win: any, hooks: BootHooks): void {
  const { onStart, onPause, onResume, timeoutMs = 2000 } = hooks;
  const mraid = win.mraid;
  let started = false;
  let paused = false;

  const pause = () => {
    if (started && !paused) {
      paused = true;
      onPause();
    }
  };
  const resume = () => {
    if (started && paused) {
      paused = false;
      onResume();
    }
  };
  const start = () => {
    if (started) return;
    started = true;
    onStart();
  };

  win.document?.addEventListener?.("visibilitychange", () => (win.document.hidden ? pause() : resume()));

  if (!mraid) {
    start();
    return;
  }

  mraid.addEventListener("viewableChange", (viewable: boolean) => {
    if (!started) {
      if (viewable) start();
    } else if (viewable) {
      resume();
    } else {
      pause();
    }
  });

  const afterReady = () => {
    if (mraid.isViewable?.()) start();
    else setTimeout(start, timeoutMs);
  };

  if (mraid.getState?.() === "loading") mraid.addEventListener("ready", afterReady);
  else afterReady();
}
