export interface Fit {
  orientation: "portrait" | "landscape";
  /** Screen pixels per world unit. */
  scale: number;
  /** Top-left of the world on screen. */
  x: number;
  y: number;
  /** Ad networks draw their close button in the top corners; keep this many pixels there empty. */
  safeCorner: number;
}

/**
 * Place a fixed-size world on the screen. In portrait the UI sits in bands above and below the world;
 * in landscape the world takes the full height and the UI moves to the sides.
 */
export function fit(
  width: number,
  height: number,
  world: { w: number; h: number },
  bands: { top: number; bottom: number },
): Fit {
  const orientation = width >= height ? "landscape" : "portrait";
  const safeCorner = 50;
  if (orientation === "portrait") {
    const free = Math.max(1, height - bands.top - bands.bottom);
    const scale = Math.min(width / world.w, free / world.h);
    return {
      orientation,
      scale,
      x: (width - world.w * scale) / 2,
      y: bands.top + (free - world.h * scale) / 2,
      safeCorner,
    };
  }
  const scale = Math.min(height / world.h, width / world.w);
  return { orientation, scale, x: (width - world.w * scale) / 2, y: (height - world.h * scale) / 2, safeCorner };
}
