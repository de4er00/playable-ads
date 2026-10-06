// Every sound is synthesised, so the build carries zero audio bytes.
// Networks forbid sound before the first touch, so the AudioContext is not even created until unlock().

export type Sound = "tap" | "step" | "alert" | "fail" | "whoosh" | "hit" | "coin" | "win" | "shot" | "boom";

export interface Audio {
  readonly unlocked: boolean;
  unlock(): void;
  mute(on: boolean): void;
  play(sound: Sound): void;
}

export function createAudio(win: any): Audio {
  const Ctx = win.AudioContext || win.webkitAudioContext;
  let ctx: any = null;
  let master: any = null;
  let muted = false;
  let noise: any = null;

  const tone = (type: string, f0: number, f1: number, dur: number, vol: number, delay = 0) => {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  const burst = (freq: number, dur: number, vol: number, q = 0.7) => {
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noise;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq / 8, 40), t + dur);
    filter.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  };

  const recipes: Record<Sound, () => void> = {
    tap: () => tone("triangle", 660, 880, 0.06, 0.15),
    step: () => burst(900, 0.05, 0.08),
    alert: () => {
      tone("square", 880, 880, 0.09, 0.12);
      tone("square", 1175, 1175, 0.12, 0.12, 0.1);
    },
    fail: () => tone("sawtooth", 320, 70, 0.5, 0.18),
    whoosh: () => burst(3000, 0.25, 0.15, 1.5),
    hit: () => {
      burst(1400, 0.18, 0.35);
      tone("sine", 160, 45, 0.25, 0.4);
    },
    coin: () => {
      tone("square", 988, 988, 0.06, 0.08);
      tone("square", 1319, 1319, 0.18, 0.08, 0.06);
    },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.22, 0.14, i * 0.09)),
    shot: () => {
      burst(2500, 0.12, 0.3);
      tone("square", 220, 60, 0.12, 0.12);
    },
    boom: () => {
      burst(600, 0.9, 0.6, 0.3);
      tone("sine", 90, 30, 0.8, 0.5);
    },
  };

  return {
    get unlocked() {
      return ctx !== null;
    },
    unlock() {
      if (ctx || !Ctx) return;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      if (muted) ctx.suspend();
      else ctx.resume?.();
    },
    mute(on: boolean) {
      muted = on;
      if (!ctx) return;
      if (on) ctx.suspend();
      else ctx.resume();
    },
    play(sound: Sound) {
      if (!ctx || muted) return;
      recipes[sound]();
    },
  };
}
