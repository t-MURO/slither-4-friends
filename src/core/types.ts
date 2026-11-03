// Shared data types. Everything the UI and the controller know about the
// outside world goes through these shapes, so real and mock adapters are
// interchangeable.

/** A game server. Servers are identified by `sid` (the "server 1234" number):
 *  the game lists each server twice (IPv4 + IPv6 address), so two players on
 *  the same server can have different `ip` values. */
export interface ServerRef {
  sid: number;
  ip: string;
  po: number;
}

export type Phase = 'menu' | 'connecting' | 'playing' | 'dead';

export interface SelfInfo {
  x: number;
  y: number;
  /** heading in radians */
  ang: number;
  score: number | null;
}

/** Another snake the game currently knows about (only snakes near you). */
export interface SnakeInfo {
  id: number;
  /** '' when the player has no name */
  name: string;
  x: number;
  y: number;
  score: number | null;
  /** skin color, CSS color string */
  color: string;
  /** body width in world units (head diameter) */
  width: number;
  /** body points from head to tail, flat [x0, y0, x1, y1, ...] in world units */
  points(): number[];
}

export interface LeaderboardRow {
  pos: number;
  name: string;
  score: number;
  color: string;
  me: boolean;
}

export interface Camera {
  toScreen(x: number, y: number): [number, number];
  toWorld(sx: number, sy: number): [number, number];
}

export interface MinimapInfo {
  /** world center (and radius) */
  grd: number;
  /** world radius covered by the minimap */
  flux: number;
  /** square canvas: non-transparent pixels = other snakes (the game's density map) */
  density: HTMLCanvasElement | null;
  /** where the game's own minimap is on screen (used when the Coop map is off) */
  nativeRect: { cx: number; cy: number; rad: number } | null;
  /** the game's whole-map snake grid (size × size, 1 = a snake there), laid out like `density` */
  occupancy: { size: number; data: ArrayLike<number> } | null;
}

export interface GameSnapshot {
  phase: Phase;
  self: SelfInfo | null;
  server: ServerRef | null;
  snakes: SnakeInfo[];
  leaderboard: LeaderboardRow[];
  rank: number;
  playerCount: number;
  camera: Camera | null;
  minimap: MinimapInfo | null;
  /** nickname typed in the game */
  nickname: string;
}

/** What a friend sends us 10 times a second. */
export interface StateMsg {
  t: 's';
  /** display name */
  n: string;
  /** alive */
  a: boolean;
  /** score (length) */
  sc: number | null;
  /** in-game nickname (to find them on the leaderboard) */
  g: string;
  x: number;
  y: number;
  srv: ServerRef | null;
  /** named snakes near the sender, sent with every 5th message (older versions omit it) */
  v?: Sighting[];
  /** kills the sender saw since its last message: [x, y, score] (older versions omit it) */
  k?: [number, number, number | null][];
}

/** [name, x, y, score] of a snake a friend can see */
export type Sighting = [string, number, number, number | null];

export type PeerStatus = 'connected' | 'connecting' | 'offline' | 'noanswer' | 'failed' | 'waiting';
export type SignalState = 'starting' | 'no-profile' | 'connecting' | 'online' | 'reconnecting' | 'id-taken' | 'error';

export interface FriendEntry {
  /** formatted "ABCD-2345" */
  code: string;
  label: string;
  /** '' = use the default friend color */
  color: string;
}

export interface TrackedEntry {
  name: string;
  color: string;
  /** show an arrow to them at the screen edge */
  arrow: boolean;
}

export interface Profile {
  code: string;
  name: string;
}

export type MapCorner = 'tl' | 'tr' | 'bl' | 'br';
export type MarkMode = 'click' | 'shift' | 'right' | 'off';

export interface Settings {
  arrows: boolean;
  autoFollow: boolean;
  hud: boolean;
  betterMap: boolean;
  mapSize: number;
  mapCorner: MapCorner;
  mapBg: string;
  mapBgAlpha: number;
  densityColor: string;
  densityAlpha: number;
  myColor: string;
  friendColor: string;
  dotSize: number;
  mapNames: boolean;
  mapLines: boolean;
  mapGrid: boolean;
  outline: boolean;
  pauseSide: 'left' | 'right';
  lbImproved: boolean;
  tracked: TrackedEntry[];
  trackPartial: boolean;
  markMode: MarkMode;
  /** view zoom on top of the game's own (1 = the game's) */
  zoom: number;
  /** crowded areas and recent kills on the minimap */
  hotZones: boolean;
}

export interface Config {
  profile: Profile;
  friends: FriendEntry[];
  settings: Settings;
}
