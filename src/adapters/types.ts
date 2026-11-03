// The three boundaries between the Coop code and the outside world.
// Real implementations live in ./real (Slither page, PeerJS/WebRTC, extension
// storage); mock implementations in ./mock drive the dev playground.
import type { GameSnapshot, PeerStatus, ServerRef, SignalState, StateMsg } from '../core/types';

export interface ClickInfo {
  x: number;
  y: number;
  button: number;
  shiftKey: boolean;
}

export interface GameAdapter {
  /** Current game state. Called every animation frame — keep it cheap. */
  snapshot(): GameSnapshot;
  /** Make the *next* game start on this server. false = no usable address. */
  joinServer(srv: ServerRef): boolean;
  /** Server the next game will use, if one was chosen. */
  pendingServer(): ServerRef | null;
  /** Press "Play" (only in the menu). */
  startGame(): void;
  /** While set, the snake steers toward the returned angle every frame (pause). */
  setSteeringOverride(fn: ((self: { ang: number }) => number) | null): void;
  /** false = mouse no longer steers or boosts (arrow keys still work). */
  setMouseEnabled(on: boolean): void;
  /** Clicks on the game. Return true to consume the click (no boost). */
  onGameClick(fn: ((click: ClickInfo) => boolean) | null): void;
  /** Zoom on top of the game's own view scale (1 = unchanged), applied while in a game. */
  setZoom(factor: number): void;
  setNativeMinimapVisible(visible: boolean): void;
  setNativeLeaderboardVisible(visible: boolean): void;
  destroy(): void;
}

export interface NetAdapter {
  /** (Re)connect with our friend code (normalized, no dash). */
  start(myCode: string): void;
  /** Codes (normalized) we accept and dial. Mutual rule: both sides must list each other. */
  setFriends(codes: string[]): void;
  /** Send to every connected friend. */
  send(msg: StateMsg): void;
  onMessage(fn: (code: string, msg: StateMsg) => void): void;
  /** Someone not on our list is trying to connect (they added our code): a friend request.
   *  Repeats about every 10 s while they keep trying. name = what they call themselves ('' = unknown). */
  onRequest(fn: (code: string, name: string) => void): void;
  /** Our display name, sent along with connection attempts (shown in their friend request). */
  setName(name: string): void;
  peerStatus(code: string): PeerStatus;
  signalState(): SignalState;
  stop(): void;
}

export interface StorageAdapter {
  readonly kind: 'extension' | 'local' | 'memory';
  load(): Promise<unknown>;
  save(config: unknown): void;
  /** Changes made elsewhere (another tab). */
  onExternalChange(fn: (raw: unknown) => void): void;
}

/** Per-browser UI conveniences (panel position, open tab, ...). */
export interface PrefsAdapter {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export interface Adapters {
  game: GameAdapter;
  net: NetAdapter;
  storage: StorageAdapter;
  prefs: PrefsAdapter;
}
