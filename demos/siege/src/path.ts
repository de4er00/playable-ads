// The spiral road on the ground (x right, z toward the camera). The snake enters at the far top,
// coils clockwise one and a half turns and ends at the tower's gate, facing the camera.
// Everything that moves along it works in arc length s, 0 at the portal and LENGTH at the gate.

export const CENTER = { x: 0, z: -4.2 };
export const R_OUT = 7.6;
export const R_IN = 3.3;
export const TURNS = 1.5;
export const ROAD_WIDTH = 1.7;
const A0 = -Math.PI / 2;
const A1 = A0 + TURNS * Math.PI * 2;

function at(k: number) {
  const a = A0 + (A1 - A0) * k;
  const r = R_OUT + (R_IN - R_OUT) * k;
  return { x: CENTER.x + Math.cos(a) * r, z: CENTER.z + Math.sin(a) * r };
}

// arc-length table: s -> parameter k, so speeds are true speeds on screen
const N = 2048;
const S = new Float32Array(N + 1);
{
  let prev = at(0);
  for (let i = 1; i <= N; i++) {
    const p = at(i / N);
    S[i] = S[i - 1] + Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
}
export const LENGTH = S[N];

function kOf(s: number) {
  if (s <= 0) return 0;
  if (s >= LENGTH) return 1;
  let lo = 0;
  let hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S[mid] < s) lo = mid;
    else hi = mid;
  }
  return (lo + (s - S[lo]) / (S[hi] - S[lo])) / N;
}

/** Point and heading (radians about y, 0 = facing +x) at arc length s. Before the portal the road runs straight back. */
export function pathPoint(s: number) {
  if (s < 0) {
    const p = at(0);
    const d = at(1 / N);
    const len = Math.hypot(d.x - p.x, d.z - p.z);
    const dx = (d.x - p.x) / len;
    const dz = (d.z - p.z) / len;
    return { x: p.x + dx * s, z: p.z + dz * s, heading: Math.atan2(dz, dx) };
  }
  const k = kOf(s);
  const p = at(k);
  const q = at(Math.min(1, k + 1 / N));
  const o = at(Math.max(0, k - 1 / N));
  return { ...p, heading: Math.atan2(q.z - o.z, q.x - o.x) };
}
