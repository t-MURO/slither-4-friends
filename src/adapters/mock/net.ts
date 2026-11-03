// Mock network: simulated friends whose connection state, server, position
// and score are set from the dev panel. Implements NetAdapter.
import type { PeerStatus, Sighting, SignalState, StateMsg } from '../../core/types';
import { normCode } from '../../core/util';
import type { NetAdapter } from '../types';
import type { MockWorld } from './world';

export type MockLink = 'connected' | 'connecting' | 'offline' | 'failed' | 'waiting';

export interface MockFriend {
  /** friend code, any format */
  code: string;
  /** name they show to friends */
  name: string;
  /** their in-game nickname (to find them on the leaderboard / map) */
  gnick: string;
  link: MockLink;
  /** false = they haven't added your code (status "hasn't added you") */
  addsMe: boolean;
  alive: boolean;
  /** same = same server, same-ipv6 = same server via its IPv6 address, other = different server */
  server: 'same' | 'same-ipv6' | 'other';
  otherSid: number;
  /** distance from you in world units */
  dist: number;
  /** angle around you in degrees */
  angle: number;
  /** slowly circle around you */
  orbit: boolean;
  score: number;
  color: string;
  /** name of a player near them that they report to you ('' = none) */
  sees: string;
}

export interface MockNet extends NetAdapter {
  friends: MockFriend[];
  signal: SignalState;
  lastSent: StateMsg | null;
  myCode: string;
  /** name we'd send along with friend requests */
  myName: string;
  listed: string[];
}

export function createMockNet(world: MockWorld): MockNet {
  let onMsg: (code: string, msg: StateMsg) => void = () => {};
  let onReq: (code: string, name: string) => void = () => {};
  let reqAt = 0;
  const net: MockNet = {
    friends: [],
    signal: 'online',
    lastSent: null,
    myCode: '',
    myName: '',
    listed: [],
    start(code) { net.myCode = code; },
    setFriends(codes) { net.listed = [...codes]; },
    send(msg) { net.lastSent = msg; },
    onMessage(fn) { onMsg = fn; },
    onRequest(fn) { onReq = fn; },
    setName(name) { net.myName = name; },
    peerStatus(code): PeerStatus {
      const f = net.friends.find((x) => normCode(x.code) === code);
      if (!f) return 'offline';
      if (f.link === 'offline') return 'offline';
      if (!f.addsMe) return 'noanswer';
      return f.link;
    },
    signalState: () => net.signal,
    stop() { clearInterval(timer); },
  };

  let last = performance.now();
  const timer = setInterval(() => {
    const t = performance.now(), dt = (t - last) / 1000;
    last = t;
    const keep = new Set<string>();
    // friends who added us but aren't on our list keep trying to connect: a friend request (~every 3 s here)
    const askNow = t - reqAt > 3000;
    if (askNow) reqAt = t;
    for (const f of net.friends) {
      const code = normCode(f.code);
      if (f.orbit) f.angle = (f.angle + dt * 12) % 360;
      const a = (f.angle * Math.PI) / 180;
      const x = world.self.x + Math.cos(a) * f.dist, y = world.self.y + Math.sin(a) * f.dist;
      const onServer = !!world.server && (world.phase === 'playing' || world.phase === 'dead');
      const sameSrv = f.server !== 'other';
      // show the friend's snake in the world when they'd be visible to you
      if (f.alive && onServer && sameSrv) { world.puppet(code, f.gnick, f.color, x, y, f.score); keep.add(code); }
      if (askNow && f.addsMe && f.link !== 'offline' && !net.listed.includes(code)) onReq(code, f.name);
      if (f.link !== 'connected' || !f.addsMe || !net.listed.includes(code)) continue;
      const sid = world.server?.sid ?? 7806;
      const srv = !f.alive ? null
        : f.server === 'same' ? { sid, ip: world.server?.ip ?? '57.129.37.42', po: world.server?.po ?? 444 }
        : f.server === 'same-ipv6' ? { sid, ip: '[2001:41d0:304:200::5a3]', po: world.server?.po ?? 444 }
        : { sid: f.otherSid, ip: `92.222.100.${f.otherSid % 200}`, po: 444 };
      const sees = (f.sees ?? '').trim();   // older saved playground states lack it
      const v: Sighting[] | undefined = f.alive && sees ? [[sees, Math.round(x + 260), Math.round(y - 180), 3100]] : undefined;
      onMsg(code, { t: 's', n: f.name, a: f.alive, sc: f.alive ? f.score : null, g: f.gnick, x: Math.round(x), y: Math.round(y), srv, v });
    }
    world.removePuppets(keep);
  }, 100);

  return net;
}
