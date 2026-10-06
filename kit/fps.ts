// ?fps on any build: a small overlay with frames per second and the slowest frames,
// so device numbers in the README come from real phones, not from a headless browser.
export function fpsOverlay(win: Window & typeof globalThis): void {
  if (!new URLSearchParams(win.location.search).has("fps")) return;
  const el = win.document.createElement("div");
  el.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:99;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.6);color:#7cde45;font:12px monospace;pointer-events:none;white-space:pre";
  win.document.body.appendChild(el);
  const frames: number[] = [];
  let last = win.performance.now();
  const loop = (now: number) => {
    frames.push(now - last);
    last = now;
    if (frames.length > 180) frames.shift();
    if (frames.length % 15 === 0) {
      const sorted = [...frames].sort((a, b) => a - b);
      const avg = frames.reduce((s, f) => s + f, 0) / frames.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const mem = (win.performance as any).memory?.usedJSHeapSize;
      el.textContent = `${(1000 / avg).toFixed(0)} fps  p95 ${p95.toFixed(1)} ms${mem ? `  heap ${(mem / 1048576).toFixed(0)} MB` : ""}`;
    }
    win.requestAnimationFrame(loop);
  };
  win.requestAnimationFrame(loop);
}
