// Controller behavior against fake adapters (no browser, no game, no network).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Adapters, ClickInfo, GameAdapter, NetAdapter, StorageAdapter } from '../src/adapters/types';
import { createController } from '../src/app/controller';
import type { GameSnapshot, PeerStatus, ServerRef, SnakeInfo, StateMsg } from '../src/core/types';

function snake(id: number, name: string, x: number, y: number): SnakeInfo {
  return { id, name, x, y, score: 500, color: '#fff', width: 30, points: () => [x, y, x + 100, y] };
}

function setup(opts: { phase?: GameSnapshot['phase']; server?: ServerRef | null; snakes?: SnakeInfo[] } = {}) {
  let clock = 1000;
  const snap: GameSnapshot = {
    phase: opts.phase ?? 'playing',
    self: { x: 1000, y: 1000, ang: 0, score: 100 },
    server: opts.server === undefined ? { sid: 4263, ip: '57.129.37.42', po: 444 } : opts.server,
    snakes: opts.snakes ?? [],
    leaderboard: [],
    rank: 5,
    playerCount: 50,
    camera: { toScreen: (x, y) => [x, y], toWorld: (x, y) => [x, y] },
    minimap: null,
    nickname: 'Me',
  };
  const joined: ServerRef[] = [];
  let steering: ((s: { ang: number }) => number) | null = null;
  let click: ((c: ClickInfo) => boolean) | null = null;
  const game: GameAdapter = {
    snapshot: () => snap,
    joinServer: (s) => { joined.push(s); return true; },
    pendingServer: () => joined.at(-1) ?? null,
    startGame: () => {},
    setSteeringOverride: (fn) => { steering = fn; },
    setMouseEnabled: () => {},
    onGameClick: (fn) => { click = fn; },
    setNativeMinimapVisible: () => {},
    setNativeLeaderboardVisible: () => {},
    destroy: () => {},
  };
  let onMsg: (code: string, m: StateMsg) => void = () => {};
  const status = new Map<string, PeerStatus>();
  const net: NetAdapter = {
    start: () => {},
    setFriends: () => {},
    send: () => {},
    onMessage: (fn) => { onMsg = fn; },
    peerStatus: (code) => status.get(code) ?? 'waiting',
    signalState: () => 'online',
    stop: () => {},
  };
  let saved: any = null;
  const storage: StorageAdapter = {
    kind: 'memory',
    load: async () => ({ profile: { code: 'AAAA-2222', name: 'Me' }, friends: [{ code: 'BBBB-3333', label: 'Bob' }], settings: {} }),
    save: (c) => { saved = c; },
    onExternalChange: () => {},
  };
  const prefs = { get: <T,>(_: string, d: T) => d, set: () => {} };
  const ad: Adapters = { game, net, storage, prefs };
  const c = createController(ad, { now: () => clock });
  after(() => c.destroy());
  const msg = (patch: Partial<StateMsg> = {}): StateMsg => ({
    t: 's', n: 'Bob', a: true, sc: 1234, g: 'bobby', x: 1500, y: 1000, srv: { sid: 4263, ip: '[2001:db8::1]', po: 444 }, ...patch,
  });
  return {
    c, snap, joined, status,
    send: (m: StateMsg) => onMsg('BBBB3333', m),
    msg,
    tick: (ms: number) => { clock += ms; },
    steering: () => steering,
    click: (x: number, y: number) => click!({ x, y, button: 0, shiftKey: false }),
    saved: () => saved,
  };
}

test('friend on the same server via a different address shows distance, not "other server"', async () => {
  const t = setup();
  await t.c.init();
  t.status.set('BBBB3333', 'connected');
  t.send(t.msg());
  t.c.frame(t.snap);
  t.c.refresh();
  const row = t.c.view.get().friendRows[0];
  t.c.destroy();
  assert.equal(row.short, '500 away');
  assert.equal(row.canJoin, false);
  assert.equal(row.score, 1234);
});

test('friend on another server can be joined', async () => {
  const t = setup();
  await t.c.init();
  t.status.set('BBBB3333', 'connected');
  t.send(t.msg({ srv: { sid: 7806, ip: '10.0.0.1', po: 444 } }));
  t.c.frame(t.snap);
  t.c.refresh();
  const row = t.c.view.get().friendRows[0];
  assert.equal(row.canJoin, true);
  t.c.joinFriend('BBBB3333');
  t.c.destroy();
  assert.equal(t.joined.at(-1)?.sid, 7806);
});

test('statuses: hasn\'t added you / offline / stale data', async () => {
  const t = setup();
  await t.c.init();
  t.status.set('BBBB3333', 'noanswer');
  t.c.frame(t.snap);
  t.c.refresh();
  assert.equal(t.c.view.get().friendRows[0].short, "hasn't added you");
  t.status.set('BBBB3333', 'connected');
  t.send(t.msg());
  t.tick(6000); // older than STALE_MS
  t.c.frame(t.snap);
  t.c.refresh();
  assert.notEqual(t.c.view.get().friendRows[0].state, 'ok');
  t.c.destroy();
});

test('adding friends validates codes', async () => {
  const t = setup();
  await t.c.init();
  assert.match(t.c.addFriend('xx', '') ?? '', /8 letters/);
  assert.match(t.c.addFriend('aaaa2222', '') ?? '', /your own code/);
  assert.match(t.c.addFriend('bbbb-3333', '') ?? '', /Already/);
  assert.equal(t.c.addFriend('cccc-4444', 'Cy'), null);
  assert.deepEqual(t.c.view.get().friends.map((f) => f.code), ['BBBB-3333', 'CCCC-4444']);
  t.c.destroy();
});

test('pause only works while playing and steers sideways', async () => {
  const t = setup();
  await t.c.init();
  t.c.frame(t.snap);
  t.c.refresh();
  t.c.setPaused(true);
  assert.equal(t.c.view.get().paused, true);
  assert.ok(Math.abs(t.steering()!({ ang: 1 }) - 2.75) < 1e-9);
  t.snap.phase = 'dead';
  t.c.frame(t.snap); // dying ends the pause
  assert.equal(t.c.view.get().paused, false);
  assert.equal(t.steering(), null);
  t.c.destroy();
});

test('clicking a snake tracks it: named -> saved, nameless -> this game only', async () => {
  const t = setup({ snakes: [snake(1, 'MALFOY', 2000, 2000), snake(2, '', 3000, 3000)] });
  await t.c.init();
  t.c.frame(t.snap);
  t.c.refresh();
  assert.equal(t.click(2050, 2005), true);
  assert.equal(t.click(3050, 2995), true);
  assert.equal(t.click(100, 100), false); // empty space -> boost as usual
  const rows = t.c.view.get().trackRows;
  assert.deepEqual(rows.map((r) => [r.label, r.temp]), [['MALFOY', false], ['(no name) · 500', true]]);
  assert.deepEqual(t.c.view.get().settings.tracked.map((x) => x.name), ['MALFOY']);
  t.c.destroy();
});
