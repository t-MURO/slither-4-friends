// Controller behavior against fake adapters (no browser, no game, no network).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Adapters, ClickInfo, GameAdapter, NetAdapter, StorageAdapter } from '../src/adapters/types';
import { createController } from '../src/app/controller';
import type { GameSnapshot, PeerStatus, ServerRef, SnakeInfo, StateMsg } from '../src/core/types';

function snake(id: number, name: string, x: number, y: number): SnakeInfo {
  return { id, name, x, y, score: 500, color: '#fff', width: 30, points: () => [x, y, x + 100, y] };
}

function setup(opts: { phase?: GameSnapshot['phase']; server?: ServerRef | null; snakes?: SnakeInfo[]; tracked?: unknown[] } = {}) {
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
  const zooms: number[] = [];
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
    setZoom: (f) => { zooms.push(f); },
    setNativeMinimapVisible: () => {},
    setNativeLeaderboardVisible: () => {},
    destroy: () => {},
  };
  let onMsg: (code: string, m: StateMsg) => void = () => {};
  let onReq: (code: string, name: string) => void = () => {};
  const listed: string[][] = [];
  const sent: StateMsg[] = [];
  const status = new Map<string, PeerStatus>();
  const net: NetAdapter = {
    start: () => {},
    setFriends: (codes) => { listed.push(codes); },
    send: (m) => { sent.push(m); },
    onMessage: (fn) => { onMsg = fn; },
    onRequest: (fn) => { onReq = fn; },
    setName: () => {},
    peerStatus: (code) => status.get(code) ?? 'waiting',
    signalState: () => 'online',
    stop: () => {},
  };
  let saved: any = null;
  const storage: StorageAdapter = {
    kind: 'memory',
    load: async () => ({ profile: { code: 'AAAA-2222', name: 'Me' }, friends: [{ code: 'BBBB-3333', label: 'Bob' }], settings: { tracked: opts.tracked ?? [] } }),
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
    c, snap, joined, status, sent, listed, zooms,
    request: (code: string, name: string) => onReq(code, name),
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
  assert.equal(t.c.view.get().friendRows[0].short, 'request sent');
  t.status.set('BBBB3333', 'failed');
  t.c.refresh();
  assert.equal(t.c.view.get().friendRows[0].short, "can't connect");
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
  assert.match(t.c.addFriend('CCCC-4O44', '') ?? '', /typos/);
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

test('we send the named snakes near us with every 5th message', async (ctx) => {
  ctx.mock.timers.enable({ apis: ['setInterval'] });
  const t = setup({ snakes: [snake(1, 'MALFOY', 2000, 2000), snake(2, '', 3000, 3000)] });
  await t.c.init();
  ctx.mock.timers.tick(500);
  assert.equal(t.sent.length, 5);
  assert.equal(t.sent.filter((m) => m.v).length, 1);
  assert.deepEqual(t.sent[4].v, [['MALFOY', 2000, 2000, 500]]);
  t.c.destroy();
});

test('a tracked player a friend can see shows on the map, then as last seen; arrows follow the toggle', async () => {
  const t = setup({ tracked: [{ name: 'ZAINE', color: '#ff0000' }] });
  await t.c.init();
  t.send(t.msg({ v: [['zaine', 9000, 1000, 4000], ['other', 0, 0, 10]] }));
  t.c.frame(t.snap);
  t.c.refresh();
  assert.deepEqual(t.c.trackedRemote().map((r) => [r.label, r.x, r.via]), [['zaine', 9000, 'Bob']]);
  assert.match(t.c.view.get().trackRows[0].status, /^seen by Bob · /);
  assert.deepEqual(t.c.trackedArrows(), []); // arrow is off by default
  t.c.setTrackArrow('n:zaine', true);
  assert.equal(t.c.view.get().settings.tracked[0].arrow, true);
  assert.deepEqual(t.c.trackedArrows().map((a) => [a.source, a.x]), [['friend', 9000]]);

  // friend's list goes stale -> last seen position
  t.tick(2000);
  t.send(t.msg());
  t.c.frame(t.snap);
  assert.deepEqual(t.c.trackedRemote(), []);
  assert.deepEqual(t.c.trackedLastSeen().map((l) => [l.label, l.x]), [['zaine', 9000]]);
  assert.deepEqual(t.c.trackedArrows().map((a) => [a.source, a.age]), [['seen', 2000]]);

  // a friend on another server doesn't count
  t.send(t.msg({ srv: { sid: 1, ip: '1.2.3.4', po: 444 }, v: [['ZAINE', 5000, 1000, 4000]] }));
  t.c.frame(t.snap);
  assert.deepEqual(t.c.trackedRemote(), []);

  // seen by ourselves -> that position wins
  t.send(t.msg({ v: [['ZAINE', 5000, 1000, 4000]] }));
  t.snap.snakes = [snake(7, 'ZAINE', 1200, 1000)];
  t.c.frame(t.snap);
  assert.deepEqual(t.c.trackedRemote(), []);
  assert.deepEqual(t.c.trackedArrows().map((a) => [a.source, a.x]), [['here', 1200]]);
  t.c.destroy();
});

test('friend requests: shown, accepted into the list, declined for the session, expire', async () => {
  const t = setup();
  await t.c.init();
  t.request('CCCC4444', 'Cy');
  t.request('cccc-4444', 'Cy');           // repeats don't duplicate
  t.request('BBBB3333', 'Bob');           // already a friend
  t.request('AAAA2222', 'Me');            // my own code
  assert.deepEqual(t.c.view.get().requests, [{ code: 'CCCC-4444', name: 'Cy' }]);
  assert.match(t.c.view.get().toast?.text ?? '', /Cy wants to add you/);

  t.c.acceptRequest('CCCC-4444');
  assert.deepEqual(t.c.view.get().requests, []);
  assert.deepEqual(t.c.view.get().friends.map((f) => [f.code, f.label]), [['BBBB-3333', 'Bob'], ['CCCC-4444', 'Cy']]);
  assert.ok(t.listed.at(-1)?.includes('CCCC4444'), 'new friend is passed to the network');

  t.request('DDDD5555', '');
  assert.deepEqual(t.c.view.get().requests, [{ code: 'DDDD-5555', name: '' }]);
  t.c.declineRequest('DDDD-5555');
  t.request('DDDD5555', '');
  assert.deepEqual(t.c.view.get().requests, [], 'declined code stays hidden');

  t.request('EEEE6666', 'Eve');
  t.tick(31_000);                          // they stopped trying
  t.c.refresh();
  assert.deepEqual(t.c.view.get().requests, []);
  t.c.destroy();
});

test('"request sent" status for friends who have not accepted yet', async () => {
  const t = setup();
  await t.c.init();
  t.status.set('BBBB3333', 'noanswer');
  t.c.refresh();
  assert.equal(t.c.view.get().friendRows[0].short, 'request sent');
  t.c.destroy();
});

test('zoom: steps within limits, saved, passed to the game', async () => {
  const t = setup();
  await t.c.init();
  assert.equal(t.zooms.at(-1), 1);
  t.c.zoomBy(1);
  assert.equal(t.c.view.get().settings.zoom, 1.1);
  assert.equal(t.zooms.at(-1), 1.1);
  assert.match(t.c.view.get().toast?.text ?? '', /Zoom 110%/);
  t.c.zoomBy(20);
  assert.equal(t.c.view.get().settings.zoom, 1.5);
  t.c.zoomBy(-40);
  assert.equal(t.c.view.get().settings.zoom, 0.7);
  t.c.updateSettings({ zoom: 1 });
  assert.equal(t.zooms.at(-1), 1);
  t.c.destroy();
});
