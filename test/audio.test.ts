import { describe, expect, it, vi } from "vitest";
import { createAudio } from "../kit/audio";

function fakeContext() {
  const made: any[] = [];
  class Ctx {
    state = "running";
    currentTime = 0;
    sampleRate = 44100;
    destination = {};
    constructor() {
      made.push(this);
    }
    createGain() {
      return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
    createOscillator() {
      return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} };
    }
    createBuffer(_c: number, n: number) {
      return { getChannelData: () => new Float32Array(n) };
    }
    createBufferSource() {
      return { buffer: null, connect() {}, start() {}, stop() {} };
    }
    createBiquadFilter() {
      return { type: "", frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 }, connect() {} };
    }
    suspend = vi.fn(async () => {});
    resume = vi.fn(async () => {});
  }
  return { Ctx, made };
}

describe("audio", () => {
  it("creates no AudioContext and plays nothing before the first touch", () => {
    const { Ctx, made } = fakeContext();
    const audio = createAudio({ AudioContext: Ctx } as any);
    audio.play("coin");
    expect(made).toHaveLength(0);
    expect(audio.unlocked).toBe(false);
  });

  it("plays after unlock", () => {
    const { Ctx, made } = fakeContext();
    const audio = createAudio({ AudioContext: Ctx } as any);
    audio.unlock();
    expect(made).toHaveLength(1);
    expect(() => audio.play("coin")).not.toThrow();
  });

  it("suspends while muted and resumes after", () => {
    const { Ctx, made } = fakeContext();
    const audio = createAudio({ AudioContext: Ctx } as any);
    audio.unlock();
    audio.mute(true);
    expect(made[0].suspend).toHaveBeenCalled();
    audio.mute(false);
    expect(made[0].resume).toHaveBeenCalled();
  });

  it("does not resume on unlock while muted", () => {
    const { Ctx, made } = fakeContext();
    const audio = createAudio({ AudioContext: Ctx } as any);
    audio.mute(true);
    audio.unlock();
    expect(made[0].suspend).toHaveBeenCalled();
  });

  it("survives a browser without WebAudio", () => {
    const audio = createAudio({} as any);
    audio.unlock();
    expect(() => audio.play("boom")).not.toThrow();
  });
});
