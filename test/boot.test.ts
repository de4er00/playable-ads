import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boot } from "../kit/boot";

class Emitter {
  handlers: Record<string, ((...a: any[]) => void)[]> = {};
  addEventListener(name: string, fn: (...a: any[]) => void) {
    (this.handlers[name] ||= []).push(fn);
  }
  removeEventListener(name: string, fn: (...a: any[]) => void) {
    this.handlers[name] = (this.handlers[name] || []).filter((f) => f !== fn);
  }
  emit(name: string, ...args: any[]) {
    for (const fn of [...(this.handlers[name] || [])]) fn(...args);
  }
}

function fakeMraid(state: string, viewable: boolean) {
  const m: any = new Emitter();
  m.state = state;
  m.viewable = viewable;
  m.getState = () => m.state;
  m.isViewable = () => m.viewable;
  return m;
}

function env(mraid?: any) {
  const doc: any = new Emitter();
  doc.hidden = false;
  const win: any = new Emitter();
  win.document = doc;
  if (mraid) win.mraid = mraid;
  return { win, doc };
}

function hooks() {
  return { onStart: vi.fn(), onPause: vi.fn(), onResume: vi.fn() };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("boot", () => {
  it("starts at once without mraid", () => {
    const { win } = env();
    const h = hooks();
    boot(win, h);
    expect(h.onStart).toHaveBeenCalledTimes(1);
  });

  it("waits for mraid ready and then for visibility", () => {
    const mraid = fakeMraid("loading", false);
    const { win } = env(mraid);
    const h = hooks();
    boot(win, { ...h, timeoutMs: 5000 });
    expect(h.onStart).not.toHaveBeenCalled();
    mraid.state = "default";
    mraid.emit("ready");
    expect(h.onStart).not.toHaveBeenCalled();
    mraid.viewable = true;
    mraid.emit("viewableChange", true);
    expect(h.onStart).toHaveBeenCalledTimes(1);
  });

  it("starts at once when mraid is ready and already viewable", () => {
    const { win } = env(fakeMraid("default", true));
    const h = hooks();
    boot(win, h);
    expect(h.onStart).toHaveBeenCalledTimes(1);
  });

  it("falls back to a timeout if visibility never arrives", () => {
    const { win } = env(fakeMraid("default", false));
    const h = hooks();
    boot(win, { ...h, timeoutMs: 2000 });
    vi.advanceTimersByTime(1999);
    expect(h.onStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.onStart).toHaveBeenCalledTimes(1);
  });

  it("starts only once", () => {
    const mraid = fakeMraid("default", false);
    const { win } = env(mraid);
    const h = hooks();
    boot(win, { ...h, timeoutMs: 2000 });
    mraid.emit("viewableChange", true);
    vi.advanceTimersByTime(5000);
    mraid.emit("viewableChange", true);
    expect(h.onStart).toHaveBeenCalledTimes(1);
  });

  it("pauses and resumes with mraid visibility after the start", () => {
    const mraid = fakeMraid("default", true);
    const { win } = env(mraid);
    const h = hooks();
    boot(win, h);
    mraid.emit("viewableChange", false);
    expect(h.onPause).toHaveBeenCalledTimes(1);
    mraid.emit("viewableChange", true);
    expect(h.onResume).toHaveBeenCalledTimes(1);
  });

  it("pauses and resumes when the page is hidden", () => {
    const { win, doc } = env();
    const h = hooks();
    boot(win, h);
    doc.hidden = true;
    doc.emit("visibilitychange");
    expect(h.onPause).toHaveBeenCalledTimes(1);
    doc.hidden = false;
    doc.emit("visibilitychange");
    expect(h.onResume).toHaveBeenCalledTimes(1);
  });
});
