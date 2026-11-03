// Hot zones: crowded areas (from the game's whole-map occupancy grid) and
// places where snakes recently died. Pure functions — covered by tests.

/** a kill (snake death) somewhere in the world */
export interface Kill { x: number; y: number; score: number | null; t: number }

/** a crowded block of the map, in world units; heat 0..1 relative to the most crowded block */
export interface CrowdCell { x: number; y: number; r: number; heat: number }

/** several recent kills close together */
export interface KillCluster { x: number; y: number; count: number }

/** kills count for this long */
export const KILL_MS = 90_000;
/** kills closer than this belong to one cluster (world units) */
export const CLUSTER_RADIUS = 700;
/** a cluster with at least this many kills is a hot zone */
export const HOT_KILLS = 3;

/**
 * Share of occupied pixels per block of the occupancy grid (size × size, 1 = snake there).
 * The grid covers the map like the minimap: pixel (n/2, n/2) is the center, n/2 pixels = flux.
 * Returns one value per block, row-major, (size / block)² entries.
 */
export function crowdGrid(occ: { size: number; data: ArrayLike<number> }, block: number): number[] {
  const n = occ.size, m = Math.ceil(n / block);
  const out = new Array<number>(m * m).fill(0);
  const cnt = new Array<number>(m * m).fill(0);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = Math.floor(y / block) * m + Math.floor(x / block);
      cnt[i]++;
      if (occ.data[y * n + x]) out[i]++;
    }
  }
  return out.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
}

/** Blocks that stand out: at least `min` occupied and at least half as crowded as the most crowded block. */
export function crowdCells(grid: number[], size: number, block: number, grd: number, flux: number, max = 10, min = 0.12): CrowdCell[] {
  const m = Math.ceil(size / block);
  const top = Math.max(0, ...grid);
  if (top < min) return [];
  const px = (flux * 2) / size;   // world units per grid pixel
  const cells: CrowdCell[] = [];
  grid.forEach((v, i) => {
    if (v < min || v < top * 0.5) return;
    const bx = (i % m) * block + block / 2, by = Math.floor(i / m) * block + block / 2;
    cells.push({ x: grd + (bx - size / 2) * px, y: grd + (by - size / 2) * px, r: block * px * 0.75, heat: v / top });
  });
  return cells.sort((a, b) => b.heat - a.heat).slice(0, max);
}

/** Group kills that are close together (greedy, heaviest area first). */
export function killClusters(kills: Kill[], radius = CLUSTER_RADIUS): KillCluster[] {
  const left = kills.slice();
  const out: KillCluster[] = [];
  while (left.length) {
    // the kill with the most neighbours seeds the next cluster
    let best = 0, bestN = -1;
    left.forEach((k, i) => {
      const n = left.filter((o) => Math.hypot(o.x - k.x, o.y - k.y) <= radius).length;
      if (n > bestN) { bestN = n; best = i; }
    });
    const seed = left[best];
    const members = left.filter((o) => Math.hypot(o.x - seed.x, o.y - seed.y) <= radius);
    out.push({ x: members.reduce((s, k) => s + k.x, 0) / members.length, y: members.reduce((s, k) => s + k.y, 0) / members.length, count: members.length });
    for (const k of members) left.splice(left.indexOf(k), 1);
  }
  return out;
}
