// Pure geometry helpers — covered by tests.

/** Slither's own length/score formula (same numbers as "Your length" and the leaderboard). */
export function slitherScore(sct: number, fam: number, fpsls: ArrayLike<number>, fmlts: ArrayLike<number>): number | null {
  const v = Math.floor((fpsls[sct] + fam / fmlts[sct] - 1) * 15 - 5);
  return Number.isFinite(v) ? v : null;
}

/** distance from point (px, py) to segment a-b */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** distance from a point to a polyline given as flat [x0, y0, x1, y1, ...] */
export function polylineDist(px: number, py: number, pts: ArrayLike<number>): number {
  if (pts.length < 2) return Infinity;
  if (pts.length < 4) return Math.hypot(px - pts[0], py - pts[1]);
  let best = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const d = segDist(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    if (d < best) best = d;
  }
  return best;
}

export interface HitTarget {
  id: number;
  width: number;
  points(): number[];
}

/**
 * Which snake is under a world point? A click counts when it is within half
 * the body width plus `slack` world units of the body line. Closest wins.
 */
export function hitTest<T extends HitTarget>(wx: number, wy: number, snakes: readonly T[], slack: number): T | null {
  let best: T | null = null, bd = Infinity;
  for (const s of snakes) {
    const d = polylineDist(wx, wy, s.points());
    if (d < s.width / 2 + slack && d < bd) { bd = d; best = s; }
  }
  return best;
}

/** Point on the screen edge (inset by `margin`) in the direction of (sx, sy) from the center. */
export function edgePoint(sx: number, sy: number, vw: number, vh: number, margin: number): { x: number; y: number; ang: number } {
  const cx = vw / 2, cy = vh / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const s = Math.min((vw / 2 - margin) / Math.abs(dx || 1e-6), (vh / 2 - margin) / Math.abs(dy || 1e-6));
  return { x: cx + dx * s, y: cy + dy * s, ang };
}

/** Minimap: world -> map position for a map centered at (cx, cy) with radius rad. */
export function worldToMap(x: number, y: number, grd: number, flux: number, cx: number, cy: number, rad: number): [number, number] {
  return [cx + (rad * (x - grd)) / flux, cy + (rad * (y - grd)) / flux];
}
