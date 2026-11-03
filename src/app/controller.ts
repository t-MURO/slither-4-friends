// The "brain": all Coop behavior, independent of how the game, network and
// storage are provided. UI components only read `controller.view` and call
// the action methods; the overlay asks for per-frame models.
import type { Adapters, ClickInfo } from '../adapters/types';
import { hitTest } from '../core/geometry';
import { sameServer } from '../core/servers';
import { sanitizeConfig, sanitizeSettings, DEFAULT_SETTINGS, MAP_KEYS, TRACK_COLORS } from '../core/settings';
import { createStore, type Store } from '../core/store';
import type {
  Config, FriendEntry, GameSnapshot, LeaderboardRow, Phase, Profile, ServerRef, Settings, Sighting, SignalState, SnakeInfo, StateMsg, TrackedEntry,
} from '../core/types';
import { fmtCode, fmtDist, fmtScore, impossibleCode, isColor, nameKey, normCode } from '../core/util';

export const SEND_MS = 100;
export const STALE_MS = 5000;
export const LAST_SEEN_MS = 120_000;
/** a friend's list of snakes near them counts for this long */
export const SIGHTINGS_MS = 1500;
const MAX_SIGHTINGS = 60;
/** a friend request disappears this long after its last repeat (they closed the game or removed us) */
export const REQUEST_MS = 30_000;
const MAX_REQUESTS = 5;

export interface FriendRow {
  code: string;
  label: string;
  color: string;
  state: 'ok' | 'try' | 'off';
  /** short status for the HUD */
  short: string;
  /** longer status for the Friends tab */
  long: string;
  score: number | null;
  near: boolean;
  canJoin: boolean;
}

export interface TrackRow {
  key: string;
  label: string;
  color: string;
  temp: boolean;
  arrow: boolean;
  status: string;
  nearby: boolean;
}

export interface LbViewRow extends LeaderboardRow {
  mark: string;
  tag: '' | 'YOU' | 'FRIEND' | 'TRACKED';
}

export interface Candidate {
  key: string;
  name: string;
  snakeId: number | null;
  score: number | null;
  dist: number | null;
  color: string;
  pos: number | null;
  tracked: boolean;
}

export interface View {
  ready: boolean;
  signal: SignalState;
  storeKind: 'extension' | 'local' | 'memory';
  profile: Profile;
  friends: FriendEntry[];
  settings: Settings;
  phase: Phase;
  friendRows: FriendRow[];
  trackRows: TrackRow[];
  lbRows: LbViewRow[];
  rank: number;
  playerCount: number;
  myScore: number | null;
  paused: boolean;
  mouseLocked: boolean;
  pendingJoin: string | null;
  others: string[];
  serverId: number;
  /** friend requests: people who added our code but aren't on our list */
  requests: { code: string; name: string }[];
  toast: { id: number; text: string } | null;
}

export interface LiveFriend {
  code: string;
  name: string;
  gnick: string;
  alive: boolean;
  x: number;
  y: number;
  /** smoothed position for drawing */
  dx: number;
  dy: number;
  score: number | null;
  srv: ServerRef | null;
  seen: number;
  /** named snakes near them */
  sights: { name: string; x: number; y: number; score: number | null }[];
  sightsAt: number;
}

/** A tracked player one of your friends can see. */
export interface RemoteTracked { key: string; x: number; y: number; color: string; label: string; score: number | null; via: string }

/** Where to point a tracked player's arrow: from your own view, a friend's view, or where they were last seen. */
export interface TrackTarget { x: number; y: number; color: string; label: string; score: number | null; source: 'here' | 'friend' | 'seen'; age: number }

interface TempTracked { id: number; color: string; label: string; added: number; arrow: boolean }
interface SeenEntry { key: string; name: string; x: number; y: number; t: number; score: number | null }

export interface Controller {
  view: Store<View>;
  init(): Promise<void>;
  /** call once per animation frame with the current snapshot */
  frame(snap: GameSnapshot): void;
  /** recompute the view now (normally done 4× per second) */
  refresh(): void;
  // ---- overlay models
  friendsHere(): (LiveFriend & { label: string; color: string })[];
  trackedVisible(): { snake: SnakeInfo; color: string; label: string }[];
  trackedLastSeen(): { x: number; y: number; color: string; label: string; age: number }[];
  /** tracked players outside your view that a friend on your server can see */
  trackedRemote(): RemoteTracked[];
  /** one target per tracked player whose arrow is on (and whose position is known) */
  trackedArrows(): TrackTarget[];
  // ---- actions
  setName(name: string): void;
  addFriend(code: string, label: string): string | null;
  removeFriend(code: string): void;
  renameFriend(code: string, label: string): void;
  setFriendColor(code: string, color: string): void;
  joinFriend(code: string): void;
  acceptRequest(code: string): void;
  /** hide this request until the game is reloaded */
  declineRequest(code: string): void;
  updateSettings(patch: Partial<Settings>): void;
  resetMap(): void;
  trackName(name: string, color?: string): string | null;
  toggleTrackName(name: string, color?: string): void;
  toggleTrackSnake(id: number, color?: string): void;
  untrack(key: string): void;
  setTrackColor(key: string, color: string): void;
  setTrackArrow(key: string, on: boolean): void;
  nextTrackColor(): string;
  candidates(): Candidate[];
  setPaused(on: boolean): void;
  setMouseLocked(on: boolean): void;
  toast(text: string): void;
  destroy(): void;
}

const EMPTY_PROFILE: Profile = { code: '', name: '' };

export function createController(ad: Adapters, opts: { now?: () => number } = {}): Controller {
  const now = opts.now ?? (() => performance.now());
  const { game, net, storage } = ad;

  let cfg: Config = { profile: EMPTY_PROFILE, friends: [], settings: { ...DEFAULT_SETTINGS } };
  let myCode = '';
  let friendCodes: string[] = [];
  const live = new Map<string, LiveFriend>();
  const temp: TempTracked[] = [];
  const requests = new Map<string, { name: string; seen: number }>();
  const declined = new Set<string>();
  const seen = new Map<string, SeenEntry>();
  let visible: { snake: SnakeInfo; key: string; color: string; label: string }[] = [];
  let remote: RemoteTracked[] = [];
  let sendCount = 0;
  let seenSid = 0;
  let snap: GameSnapshot = game.snapshot();
  let paused = false;
  let mouseLocked = false;
  let pendingLabel: string | null = null;
  let toastId = 0;
  let destroyed = false;
  const timers: ReturnType<typeof setInterval>[] = [];

  const view = createStore<View>({
    ready: false,
    signal: 'starting',
    storeKind: storage.kind,
    profile: EMPTY_PROFILE,
    friends: [],
    settings: cfg.settings,
    phase: 'menu',
    friendRows: [],
    trackRows: [],
    lbRows: [],
    rank: 0,
    playerCount: 0,
    myScore: null,
    paused: false,
    mouseLocked: false,
    pendingJoin: null,
    others: [],
    serverId: 0,
    requests: [],
    toast: null,
  });

  // ------------------------------------------------------------- config
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSavedJson = '';
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { lastSavedJson = JSON.stringify(cfg); storage.save(cfg); }, 250);
  }

  function applyConfig(raw: unknown) {
    const { config, generatedCode } = sanitizeConfig(raw);
    const oldCode = myCode;
    cfg = config;
    myCode = normCode(cfg.profile.code);
    syncFriendCodes();
    if (myCode !== oldCode) {
      live.clear();
      requests.clear();
      net.start(myCode);
    }
    if (generatedCode) save();
    refresh();
  }

  function syncFriendCodes() {
    friendCodes = cfg.friends.map((f) => normCode(f.code)).filter((c) => c && c !== myCode);
    for (const code of [...live.keys()]) if (!friendCodes.includes(code)) live.delete(code);
    for (const code of friendCodes) requests.delete(code);
    net.setFriends(friendCodes);
  }

  // ------------------------------------------------------------- helpers
  const entry = (code: string) => cfg.friends.find((f) => normCode(f.code) === code);
  const colorOf = (code: string) => entry(code)?.color || cfg.settings.friendColor;
  const labelOf = (code: string) => entry(code)?.label || live.get(code)?.name || fmtCode(code);
  const fresh = (f: LiveFriend | undefined): f is LiveFriend => !!f && now() - f.seen < STALE_MS;
  const alive = () => snap.phase === 'playing' && !!snap.self;
  const inGame = () => (snap.phase === 'playing' || snap.phase === 'dead') && !!snap.self;

  function myName(): string {
    return (cfg.profile.name.trim() || snap.nickname.trim() || 'Friend').slice(0, 24);
  }

  // ------------------------------------------------------------- network
  net.onMessage((code, m) => {
    if (!friendCodes.includes(code) || !m || m.t !== 's') return;
    let f = live.get(code);
    const isNew = !f;
    if (!f) {
      f = { code, name: '', gnick: '', alive: false, x: 0, y: 0, dx: 0, dy: 0, score: null, srv: null, seen: 0, sights: [], sightsAt: 0 };
      live.set(code, f);
    }
    f.name = String(m.n ?? '').slice(0, 24);
    f.gnick = String(m.g ?? '').slice(0, 24);
    f.alive = !!m.a;
    f.x = Number(m.x) || 0;
    f.y = Number(m.y) || 0;
    f.score = f.alive && typeof m.sc === 'number' && Number.isFinite(m.sc) ? m.sc : null;
    f.srv = m.srv && typeof m.srv.ip === 'string'
      ? { sid: Number(m.srv.sid) || 0, ip: m.srv.ip.slice(0, 64), po: Number(m.srv.po) || 0 }
      : null;
    if (isNew || !f.alive) { f.dx = f.x; f.dy = f.y; }
    f.seen = now();
    if (Array.isArray(m.v)) {
      f.sights = [];
      for (const s of m.v.slice(0, MAX_SIGHTINGS)) {
        if (!Array.isArray(s) || typeof s[0] !== 'string' || !s[0].trim()) continue;
        const x = Number(s[1]), y = Number(s[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        f.sights.push({ name: s[0].slice(0, 24), x, y, score: typeof s[3] === 'number' && Number.isFinite(s[3]) ? s[3] : null });
      }
      f.sightsAt = f.seen;
    }
  });

  net.onRequest((rawCode, rawName) => {
    const code = normCode(rawCode);
    if (code.length !== 8 || impossibleCode(code) || code === myCode || friendCodes.includes(code) || declined.has(code)) return;
    const isNew = !requests.has(code);
    if (isNew && requests.size >= MAX_REQUESTS) return;
    const name = String(rawName ?? '').trim().slice(0, 24);
    requests.set(code, { name, seen: now() });
    if (isNew) { toast((name || fmtCode(code)) + ' wants to add you as a friend'); refresh(); }
  });

  function sendState() {
    net.setName(myName());
    const a = alive();
    const msg: StateMsg = {
      t: 's',
      n: myName(),
      a,
      sc: a ? snap.self!.score : null,
      g: snap.nickname.trim().slice(0, 24),
      x: a ? Math.round(snap.self!.x) : 0,
      y: a ? Math.round(snap.self!.y) : 0,
      srv: inGame() ? snap.server : null,
    };
    // named snakes near us, so friends can find the players they track (~2x per second)
    if (a && ++sendCount % 5 === 0) {
      msg.v = snap.snakes.filter((s) => s.name.trim()).slice(0, MAX_SIGHTINGS)
        .map((s): Sighting => [s.name.slice(0, 24), Math.round(s.x), Math.round(s.y), s.score]);
    }
    net.send(msg);
  }

  // ------------------------------------------------------------- following friends' servers
  function followTick() {
    if (!game.pendingServer()) pendingLabel = null;
    if (!cfg.settings.autoFollow || snap.phase === 'playing' || snap.phase === 'connecting') return;
    // even when we were on the same server: a new game would otherwise pick a random one
    for (const code of friendCodes) {
      const f = live.get(code);
      if (!fresh(f) || !f.alive || !f.srv) continue;
      if (game.joinServer(f.srv)) pendingLabel = labelOf(code);
      return;
    }
  }

  // ------------------------------------------------------------- tracking
  const tkey = (t: TrackedEntry) => 'n:' + nameKey(t.name);
  const allTracked = () => [
    ...cfg.settings.tracked.map((t) => ({ key: tkey(t), label: t.name, color: t.color, temp: false, arrow: t.arrow })),
    ...temp.map((t) => ({ key: 'i:' + t.id, label: t.label, color: t.color, temp: true, arrow: t.arrow })),
  ];

  function trackedFor(name: string): TrackedEntry | null {
    const k = nameKey(name);
    if (!k) return null;
    for (const t of cfg.settings.tracked) {
      const tk = nameKey(t.name);
      if (k === tk || (cfg.settings.trackPartial && tk.length >= 2 && k.includes(tk))) return t;
    }
    return null;
  }

  function updateTracking() {
    const sid = snap.server?.sid ?? 0;
    if (sid && sid !== seenSid) { seen.clear(); temp.length = 0; seenSid = sid; }
    visible = [];
    remote = [];
    if (!inGame()) return;
    const t = now();
    for (const s of snap.snakes) {
      const tmp = temp.find((x) => x.id === s.id);
      const named = !tmp && s.name ? trackedFor(s.name) : null;
      if (!tmp && !named) continue;
      const key = tmp ? 'i:' + tmp.id : tkey(named!);
      const color = tmp ? tmp.color : named!.color;
      const label = s.name || '(no name)';
      visible.push({ snake: s, key, color, label });
      seen.set(key + '|' + s.id, { key, name: label, x: s.x, y: s.y, t, score: s.score });
    }
    // tracked players near a friend on our server (nameless ones can't be matched)
    for (const code of friendCodes) {
      const f = live.get(code);
      if (!fresh(f) || !f.alive || t - f.sightsAt > SIGHTINGS_MS || !sameServer(snap.server, f.srv)) continue;
      for (const s of f.sights) {
        const named = trackedFor(s.name);
        if (!named) continue;
        const key = tkey(named);
        if (visible.some((v) => v.key === key) || remote.some((r) => r.key === key)) continue;
        remote.push({ key, x: s.x, y: s.y, color: named.color, label: s.name, score: s.score, via: labelOf(code) });
        seen.set(key + '|friend', { key, name: s.name, x: s.x, y: s.y, t, score: s.score });
      }
    }
    const keys = new Set(allTracked().map((x) => x.key));
    for (const [k, v] of seen) if (t - v.t > LAST_SEEN_MS || !keys.has(v.key)) seen.delete(k);
    for (let i = temp.length - 1; i >= 0; i--) {
      const k = 'i:' + temp[i].id;
      if (t - temp[i].added > 5000 && ![...seen.values()].some((v) => v.key === k)) temp.splice(i, 1);
    }
  }

  function trackStatus(key: string): { text: string; nearby: boolean } {
    const parts: string[] = [];
    const vis = visible.find((v) => v.key === key);
    const rem = remote.find((r) => r.key === key);
    let nearby = false;
    if (vis && alive()) {
      const s = vis.snake, me = snap.self!;
      parts.push('nearby · ' + fmtDist(Math.hypot(s.x - me.x, s.y - me.y)) + ' away · ' + fmtScore(s.score));
      nearby = true;
    } else if (rem && alive()) {
      const me = snap.self!;
      parts.push('seen by ' + rem.via + ' · ' + fmtDist(Math.hypot(rem.x - me.x, rem.y - me.y)) + ' away · ' + fmtScore(rem.score));
      nearby = true;
    } else {
      let last: SeenEntry | null = null;
      for (const v of seen.values()) if (v.key === key && (!last || v.t > last.t)) last = v;
      if (last) parts.push('last seen ' + Math.round((now() - last.t) / 1000) + 's ago');
    }
    if (key.startsWith('n:')) {
      const lb = snap.leaderboard.find((r) => !r.me && trackedFor(r.name) && tkey(trackedFor(r.name)!) === key);
      if (lb) parts.push('#' + lb.pos + ' on leaderboard · ' + fmtScore(lb.score));
    }
    return { text: parts.length ? parts.join(' · ') : inGame() ? 'not seen yet' : 'start a game to look for them', nearby };
  }

  function tryMark(click: ClickInfo): boolean {
    const mode = cfg.settings.markMode;
    if (mode === 'off' || !inGame() || !snap.camera) return false;
    if (mode === 'click' && click.button !== 0) return false;
    if (mode === 'shift' && !(click.button === 0 && click.shiftKey)) return false;
    if (mode === 'right' && click.button !== 2) return false;
    const [wx, wy] = snap.camera.toWorld(click.x, click.y);
    const [wx2] = snap.camera.toWorld(click.x + 10, click.y);
    const s = hitTest(wx, wy, snap.snakes, Math.abs(wx2 - wx));
    if (!s) return false;
    toggleTrackSnake(s.id);
    return true;
  }

  // ------------------------------------------------------------- view model
  function friendRows(): FriendRow[] {
    return friendCodes.map((code) => {
      const f = live.get(code);
      const st = net.peerStatus(code);
      const base = { code, label: labelOf(code), color: colorOf(code), score: null as number | null, near: false, canJoin: false };
      if (st === 'connected' && fresh(f)) {
        if (!f.alive || !f.srv) return { ...base, state: 'ok', short: 'in menu', long: 'Connected · in menu' };
        const scoreTxt = f.score != null ? ' · length ' + fmtScore(f.score) : '';
        if (sameServer(snap.server, f.srv) && inGame()) {
          if (!alive()) return { ...base, score: f.score, state: 'ok', short: 'same server', long: 'Connected · same server' + scoreTxt };
          const d = fmtDist(Math.hypot(f.x - snap.self!.x, f.y - snap.self!.y)) + ' away';
          return { ...base, score: f.score, near: true, state: 'ok', short: d, long: 'Connected · ' + d + scoreTxt };
        }
        const short = inGame() ? 'other server' : 'playing';
        return { ...base, score: f.score, canJoin: true, state: 'ok', short, long: 'Connected · ' + short + scoreTxt };
      }
      if (st === 'offline') return { ...base, state: 'off', short: 'offline', long: 'Offline (game not open)' };
      if (st === 'failed') return { ...base, state: 'off', short: "can't connect", long: "You've added each other, but the connection is blocked (network or firewall). Retrying…" };
      if (st === 'noanswer') return { ...base, state: 'try', short: 'request sent', long: 'Online · friend request sent, waiting for them to accept' };
      if (st === 'connecting') return { ...base, state: 'try', short: 'connecting…', long: 'Connecting…' };
      return { ...base, state: 'off', short: 'waiting…', long: 'Waiting for them to open the game' };
    });
  }

  function lbRows(): LbViewRow[] {
    const friendNames = new Map<string, string>();
    for (const code of friendCodes) {
      const f = live.get(code);
      if (fresh(f) && f.alive && f.gnick && sameServer(snap.server, f.srv)) friendNames.set(nameKey(f.gnick), colorOf(code));
    }
    return snap.leaderboard.map((r) => {
      if (r.me) return { ...r, mark: '', tag: 'YOU' };
      const tr = trackedFor(r.name);
      if (tr) return { ...r, mark: tr.color, tag: 'TRACKED' };
      const fc = friendNames.get(nameKey(r.name));
      if (fc) return { ...r, mark: fc, tag: 'FRIEND' };
      return { ...r, mark: '', tag: '' };
    });
  }

  function refresh() {
    if (destroyed) return;
    for (const [code, r] of requests) if (now() - r.seen > REQUEST_MS) requests.delete(code);
    const others: string[] = [];
    for (const code of friendCodes) {
      const f = live.get(code);
      if (fresh(f) && f.alive && f.srv && inGame() && !sameServer(snap.server, f.srv)) others.push(labelOf(code));
    }
    view.set((v) => ({
      ...v,
      ready: true,
      signal: net.signalState(),
      storeKind: storage.kind,
      profile: cfg.profile,
      friends: cfg.friends,
      settings: cfg.settings,
      phase: snap.phase,
      friendRows: friendRows(),
      trackRows: allTracked().map((t) => {
        const st = trackStatus(t.key);
        return { key: t.key, label: t.label, color: t.color, temp: t.temp, arrow: t.arrow, status: st.text, nearby: st.nearby };
      }),
      lbRows: lbRows(),
      rank: snap.rank,
      playerCount: snap.playerCount,
      myScore: alive() ? snap.self!.score : null,
      paused,
      mouseLocked,
      pendingJoin: game.pendingServer() ? pendingLabel : null,
      others,
      serverId: snap.server?.sid ?? 0,
      requests: [...requests].map(([code, r]) => ({ code: fmtCode(code), name: r.name })),
    }));
  }

  // ------------------------------------------------------------- actions
  function setSettings(next: Settings) {
    cfg = { ...cfg, settings: next };
    game.setNativeMinimapVisible(!next.betterMap);
    game.setNativeLeaderboardVisible(!next.lbImproved);
    save();
    refresh();
  }

  function setFriends(friends: FriendEntry[]) {
    cfg = { ...cfg, friends };
    syncFriendCodes();
    save();
    refresh();
  }

  function toast(text: string) {
    view.set((v) => ({ ...v, toast: { id: ++toastId, text } }));
  }

  function toggleTrackSnake(id: number, color?: string) {
    const s = snap.snakes.find((x) => x.id === id);
    if (s?.name) return toggleTrackName(s.name, color);
    const i = temp.findIndex((t) => t.id === id);
    if (i >= 0) { temp.splice(i, 1); toast('Stopped tracking that snake'); }
    else {
      temp.push({ id, color: color || nextTrackColor(), label: '(no name) · ' + fmtScore(s?.score), added: now(), arrow: false });
      toast('Tracking this nameless snake (for this game)');
    }
    refresh();
  }

  function toggleTrackName(name: string, color?: string) {
    name = name.replace(/ /g, ' ').trim().slice(0, 24);
    if (!name) return;
    const list = cfg.settings.tracked;
    const exists = list.some((t) => nameKey(t.name) === nameKey(name));
    const tracked = exists
      ? list.filter((t) => nameKey(t.name) !== nameKey(name))
      : [...list, { name, color: color && isColor(color) ? color : nextTrackColor(), arrow: false }];
    toast(exists ? 'Stopped tracking ' + name : 'Tracking ' + name);
    setSettings({ ...cfg.settings, tracked });
  }

  function nextTrackColor() {
    return TRACK_COLORS[(cfg.settings.tracked.length + temp.length) % TRACK_COLORS.length];
  }

  function setPaused(on: boolean) {
    on = on && alive();
    if (on === paused) return;
    paused = on;
    game.setSteeringOverride(on ? (self) => self.ang + (cfg.settings.pauseSide === 'left' ? -1.75 : 1.75) : null);
    refresh();
  }

  function setMouseLocked(on: boolean) {
    mouseLocked = on;
    game.setMouseEnabled(!on);
    refresh();
  }

  game.onGameClick(tryMark);

  const controller: Controller = {
    view,

    async init() {
      applyConfig(await storage.load());
      // ignore the echo of our own save (it could undo what the user typed since)
      storage.onExternalChange((raw) => { if (JSON.stringify(sanitizeConfig(raw).config) !== lastSavedJson) applyConfig(raw); });
      game.setNativeMinimapVisible(!cfg.settings.betterMap);
      game.setNativeLeaderboardVisible(!cfg.settings.lbImproved);
      timers.push(setInterval(sendState, SEND_MS));
      timers.push(setInterval(followTick, 400));
      timers.push(setInterval(() => {
        if (now() - lastFrame > 500) { snap = game.snapshot(); updateTracking(); }   // no frames (hidden tab)
        refresh();
      }, 250));
    },

    frame(s) {
      lastFrame = now();
      snap = s;
      if (paused && !alive()) setPaused(false);
      updateTracking();
      for (const f of live.values()) { f.dx += (f.x - f.dx) * 0.25; f.dy += (f.y - f.dy) * 0.25; }
    },

    refresh,

    friendsHere() {
      const out: (LiveFriend & { label: string; color: string })[] = [];
      if (!inGame()) return out;
      for (const code of friendCodes) {
        const f = live.get(code);
        if (fresh(f) && f.alive && sameServer(snap.server, f.srv)) out.push({ ...f, label: labelOf(code), color: colorOf(code) });
      }
      return out;
    },
    trackedVisible: () => visible.map((v) => ({ snake: v.snake, color: v.color, label: v.label })),
    trackedLastSeen() {
      const vis = new Set(visible.map((v) => v.snake.id));
      const located = new Set(remote.map((r) => r.key));
      const colors = new Map(allTracked().map((t) => [t.key, t.color]));
      const out: { x: number; y: number; color: string; label: string; age: number }[] = [];
      for (const [k, v] of seen) {
        if (vis.has(Number(k.split('|')[1])) || located.has(v.key)) continue;
        const color = colors.get(v.key);
        if (color) out.push({ x: v.x, y: v.y, color, label: v.name, age: now() - v.t });
      }
      return out;
    },
    trackedRemote: () => remote.slice(),
    trackedArrows() {
      const out: TrackTarget[] = [];
      if (!alive()) return out;
      const me = snap.self!;
      const t = now();
      for (const tr of allTracked()) {
        if (!tr.arrow) continue;
        let best: TrackTarget | null = null;
        for (const v of visible) {
          if (v.key !== tr.key) continue;
          if (!best || Math.hypot(v.snake.x - me.x, v.snake.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y)) {
            best = { x: v.snake.x, y: v.snake.y, color: tr.color, label: v.label, score: v.snake.score, source: 'here', age: 0 };
          }
        }
        const r = remote.find((x) => x.key === tr.key);
        if (!best && r) best = { x: r.x, y: r.y, color: tr.color, label: r.label, score: r.score, source: 'friend', age: 0 };
        if (!best) {
          let last: SeenEntry | null = null;
          for (const v of seen.values()) if (v.key === tr.key && (!last || v.t > last.t)) last = v;
          if (last) best = { x: last.x, y: last.y, color: tr.color, label: last.name, score: last.score, source: 'seen', age: t - last.t };
        }
        if (best) out.push(best);
      }
      return out;
    },

    setName(name) {
      cfg = { ...cfg, profile: { ...cfg.profile, name: name.slice(0, 24) } };
      save();
      refresh();
    },
    addFriend(code, label) {
      const c = normCode(code);
      if (impossibleCode(c)) return 'Friend codes never contain 0, O, 1, I or L. Check the code for typos.';
      if (c.length !== 8) return 'A friend code has 8 letters/numbers, like ABCD-2345.';
      if (c === myCode) return "That's your own code. Send it to your friend instead.";
      if (cfg.friends.some((f) => normCode(f.code) === c)) return 'Already in your list.';
      setFriends([...cfg.friends, { code: fmtCode(c), label: label.trim().slice(0, 24), color: '' }]);
      return null;
    },
    removeFriend(code) {
      setFriends(cfg.friends.filter((f) => normCode(f.code) !== normCode(code)));
    },
    renameFriend(code, label) {
      setFriends(cfg.friends.map((f) => (normCode(f.code) === normCode(code) ? { ...f, label: label.trim().slice(0, 24) } : f)));
    },
    setFriendColor(code, color) {
      if (!isColor(color)) return;
      setFriends(cfg.friends.map((f) => (normCode(f.code) === normCode(code) ? { ...f, color } : f)));
    },
    joinFriend(code) {
      const f = live.get(normCode(code));
      if (!f?.srv) return;
      if (!game.joinServer(f.srv)) { toast("Can't reach that server from here."); return; }
      pendingLabel = labelOf(normCode(code));
      if (snap.phase === 'menu') game.startGame();
      else toast(`Your next game joins ${pendingLabel}'s server.`);
      refresh();
    },
    acceptRequest(code) {
      const c = normCode(code);
      const r = requests.get(c);
      if (!r) return;
      requests.delete(c);
      const err = controller.addFriend(c, r.name);
      toast(err ?? 'Added ' + (r.name || fmtCode(c)) + '. Connecting…');
    },
    declineRequest(code) {
      const c = normCode(code);
      requests.delete(c);
      declined.add(c);
      refresh();
    },
    updateSettings(patch) {
      setSettings(sanitizeSettings({ ...cfg.settings, ...patch }));
      if ('pauseSide' in patch && paused) { paused = false; setPaused(true); }
    },
    resetMap() {
      const next = { ...cfg.settings } as Record<string, unknown>;
      for (const k of MAP_KEYS) next[k] = DEFAULT_SETTINGS[k];
      setSettings(sanitizeSettings(next));
    },
    trackName(name, color) {
      const n = name.trim().slice(0, 24);
      if (!n) return "Type the player's name.";
      if (cfg.settings.tracked.some((t) => nameKey(t.name) === nameKey(n))) return 'Already tracked.';
      toggleTrackName(n, color);
      return null;
    },
    toggleTrackName,
    toggleTrackSnake,
    untrack(key) {
      if (key.startsWith('i:')) {
        const i = temp.findIndex((t) => 'i:' + t.id === key);
        if (i >= 0) temp.splice(i, 1);
        refresh();
      } else {
        setSettings({ ...cfg.settings, tracked: cfg.settings.tracked.filter((t) => tkey(t) !== key) });
      }
    },
    setTrackColor(key, color) {
      if (!isColor(color)) return;
      const t = temp.find((x) => 'i:' + x.id === key);
      if (t) { t.color = color; refresh(); return; }
      setSettings({ ...cfg.settings, tracked: cfg.settings.tracked.map((x) => (tkey(x) === key ? { ...x, color } : x)) });
    },
    setTrackArrow(key, on) {
      const t = temp.find((x) => 'i:' + x.id === key);
      if (t) { t.arrow = on; refresh(); return; }
      setSettings({ ...cfg.settings, tracked: cfg.settings.tracked.map((x) => (tkey(x) === key ? { ...x, arrow: on } : x)) });
    },
    nextTrackColor,
    candidates() {
      const out = new Map<string, Candidate>();
      const me = alive() ? snap.self : null;
      for (const s of snap.snakes) {
        const key = s.name ? 'n:' + nameKey(s.name) : 'i:' + s.id;
        const d = me ? Math.hypot(s.x - me.x, s.y - me.y) : null;
        const c = out.get(key);
        if (c && c.dist != null && d != null && c.dist <= d) continue;
        const tracked = s.name ? !!trackedFor(s.name) : temp.some((t) => t.id === s.id);
        out.set(key, { key, name: s.name, snakeId: s.id, score: s.score, dist: d, color: s.color, pos: null, tracked });
      }
      for (const r of snap.leaderboard) {
        if (r.me || !r.name.trim()) continue;
        const key = 'n:' + nameKey(r.name);
        const c = out.get(key);
        if (c) c.pos = r.pos;
        else out.set(key, { key, name: r.name, snakeId: null, score: r.score, dist: null, color: r.color, pos: r.pos, tracked: !!trackedFor(r.name) });
      }
      return [...out.values()].sort((a, b) => (a.dist ?? 1e12) - (b.dist ?? 1e12) || (a.pos ?? 999) - (b.pos ?? 999));
    },
    setPaused,
    setMouseLocked,
    toast,
    destroy() {
      destroyed = true;
      for (const t of timers) clearInterval(t);
      clearTimeout(saveTimer);
      game.setSteeringOverride(null);
      game.setMouseEnabled(true);
      game.onGameClick(null);
      net.stop();
    },
  };
  let lastFrame = 0;
  return controller;
}
