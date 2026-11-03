// Adapter check for the REAL game. Load it into slither.com (like inject.js)
// while playing; it verifies that the game adapter still finds everything it
// needs (useful after a Slither update) and that two network adapters can
// connect to each other. Results: console + window.__slcCheck.
import { createPeerNet, ICE_SERVERS } from '../adapters/real/peer-net';
import { createSlitherGame } from '../adapters/real/slither-game';
import { slitherZoom } from '../core/geometry';
import { newCode, normCode } from '../core/util';

declare global {
  interface Window { __slcCheck?: Record<string, unknown> }
}

const W = window as any;

async function run() {
  const r: Record<string, unknown> = {};
  const ok = (name: string, pass: boolean, info?: unknown) => { r[name] = pass ? 'OK' : ['FAIL', info]; };

  // ---------------- game adapter
  const game = createSlitherGame();
  const snap = game.snapshot();
  r.phase = snap.phase;
  ok('globals', ['slither', 'slithers', 'view_xx', 'gsc', 'mww2', 'bso', 'sos', 'connect'].every((k) => k in W),
    ['slither', 'slithers', 'view_xx', 'gsc', 'mww2', 'bso', 'sos', 'connect'].filter((k) => !(k in W)));
  if (snap.phase === 'playing' || snap.phase === 'dead') {
    ok('self', !!snap.self && Number.isFinite(snap.self.x) && Number.isFinite(snap.self.score ?? NaN), snap.self);
    ok('server id', !!snap.server && snap.server.sid > 0 && snap.server.sid === Number(W.real_sid || W.bso?.sid), snap.server);
    const cam = snap.camera!;
    const [sx, sy] = cam.toScreen(snap.self!.x, snap.self!.y);
    const [wx, wy] = cam.toWorld(sx, sy);
    ok('camera round trip', Math.abs(wx - snap.self!.x) < 0.01 && Math.abs(wy - snap.self!.y) < 0.01, { sx, sy, wx, wy });
    ok('camera centers on you', Math.abs(sx - innerWidth / 2) < innerWidth * 0.3 && Math.abs(sy - innerHeight / 2) < innerHeight * 0.3, { sx, sy });
    ok('snakes', Array.isArray(snap.snakes) && snap.snakes.every((s) => s.points().length >= 2 && s.width > 0), snap.snakes.length);
    r.snakesSeen = snap.snakes.length;
    ok('leaderboard', snap.leaderboard.length > 0 && snap.leaderboard.every((x) => Number.isFinite(x.score)), snap.leaderboard.slice(0, 3));
    // the rank arrives with the first leaderboard packet, shortly after spawning
    let s2 = snap;
    for (let i = 0; i < 12 && !s2.leaderboard.some((x) => x.me) && !(s2.rank > 0); i++) {
      await new Promise((res) => setTimeout(res, 250));
      s2 = game.snapshot();
    }
    ok('my row on leaderboard or rank', s2.leaderboard.some((x) => x.me) || s2.rank > 10, { rank: s2.rank });
    ok('minimap', !!snap.minimap && snap.minimap.grd > 0 && !!snap.minimap.density, snap.minimap && { grd: snap.minimap.grd, flux: snap.minimap.flux });
    // hot zones read the game's whole-map snake grid; kills are snakes the server marks `dead`
    ok('occupancy grid (hot zones)', !!snap.minimap?.occupancy && snap.minimap.occupancy.size > 0 && snap.minimap.occupancy.data.length === snap.minimap.occupancy.size ** 2,
      snap.minimap?.occupancy && { size: snap.minimap.occupancy.size });
    // pending server: choose our own server again by id and restore the game's state afterwards
    const before = { forcing: W.forcing, fobso: W.fobso };
    ok('joinServer picks IPv4 entry', game.joinServer({ ...snap.server!, ip: '[2001:db8::1]' }) && !String(W.fobso?.ip).startsWith('['), W.fobso);
    W.forcing = before.forcing; W.fobso = before.fobso;
    // steering override (pause) for half a second
    const a0 = W.slither.ang;
    game.setSteeringOverride((s) => s.ang + 1.75);
    await new Promise((res) => setTimeout(res, 600));
    game.setSteeringOverride(null);
    ok('pause turns the snake', Math.abs(Math.atan2(Math.sin(W.slither.ang - a0), Math.cos(W.slither.ang - a0))) > 0.5 || !W.playing, { a0, a1: W.slither.ang });
    // zoom: the game's own scale follows slitherZoom (it eases there slowly), and setZoom scales it
    ok('zoom formula matches the game', Math.abs(W.gsc - slitherZoom(W.slither.sct)) < 0.05, { gsc: W.gsc, formula: slitherZoom(W.slither.sct) });
    const zoomGame = createSlitherGame();
    zoomGame.setZoom(1.2);
    await new Promise((res) => setTimeout(res, 300));
    const zoomed = W.gsc / slitherZoom(W.slither.sct);
    zoomGame.destroy();
    ok('setZoom scales the view', Math.abs(zoomed - 1.2) < 0.01 && Math.abs(W.gsc - slitherZoom(W.slither.sct)) < 0.01, { zoomed, after: W.gsc });
  } else {
    r.note = 'Start a game for the in-game checks.';
  }
  game.destroy();
  ok('handlers restored', !W.onmousemove?.__slc && !W.onmousedown?.__slc);

  // ---------------- TURN relay: gathering a relay candidate proves the credentials work
  if (!__TURN_SERVERS__.length) r['TURN relay reachable'] = 'not configured (turn.json)';
  else {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceTransportPolicy: 'relay' });
    let relay = false;
    pc.onicecandidate = (e) => { if (e.candidate?.type === 'relay') relay = true; };
    pc.createDataChannel('check');
    await pc.setLocalDescription(await pc.createOffer());
    for (let i = 0; i < 40 && !relay; i++) await new Promise((res) => setTimeout(res, 250));
    pc.close();
    ok('TURN relay reachable', relay);
  }

  // ---------------- network adapter: two peers that list each other
  const a = createPeerNet(), b = createPeerNet();
  const ca = normCode(newCode()), cb = normCode(newCode());
  let got: unknown = null;
  b.onMessage((code, m) => { if (code === ca) got = m; });
  a.start(ca); b.start(cb);
  a.setFriends([cb]); b.setFriends([ca]);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(a.peerStatus(cb) === 'connected' && b.peerStatus(ca) === 'connected')) {
    await new Promise((res) => setTimeout(res, 250));
  }
  a.send({ t: 's', n: 'check', a: true, sc: 1, g: 'check', x: 1, y: 2, srv: null });
  await new Promise((res) => setTimeout(res, 500));
  ok('peers connect (mutual)', a.peerStatus(cb) === 'connected' && b.peerStatus(ca) === 'connected', { a: a.peerStatus(cb), b: b.peerStatus(ca), signal: [a.signalState(), b.signalState()] });
  ok('message arrives', !!got, got);
  // one-sided: c lists a, but a does not list c -> must not connect
  const c = createPeerNet(), cc = normCode(newCode());
  c.start(cc); c.setFriends([ca]);
  await new Promise((res) => setTimeout(res, 12000));
  ok('one-sided does not connect', c.peerStatus(ca) !== 'connected', c.peerStatus(ca));
  a.stop(); b.stop(); c.stop();

  window.__slcCheck = r;
  console.table(r);
  return r;
}

void run();
