// NetAdapter over WebRTC data channels. The public PeerJS server (0.peerjs.com)
// is only used to exchange the handshake (it speaks the PeerJS protocol, and
// drops connections whose messages don't look exactly like PeerJS ones).
//
// Mutual friends: of two friends, the one whose code sorts first dials; the
// other side only answers codes on its own list. The other side says hello
// (every DIAL_EVERY_MS while not connected), so the dialer doesn't wait for its
// next retry. Offers and hellos carry our name: when they reach someone who
// hasn't added us yet, that's a friend request (onRequest).
//
// When both sides' networks block direct connections, the data goes through a
// TURN relay from __TURN_SERVERS__ (turn.json, built in, see README); without
// it only direct connections work.
import type { PeerStatus, SignalState, StateMsg } from '../../core/types';
import { randomToken } from '../../core/util';
import type { NetAdapter } from '../types';

const SIGNAL_HOST = '0.peerjs.com';
const PREFIX = 'slcoop2-';
const DIAL_EVERY_MS = 10_000;
/** connectionId of the "I'm online, dial me" message (a CANDIDATE, so the PeerJS server forwards it) */
const HELLO = 'hello';
/** no ANSWER by then: they haven't added our code */
const ANSWER_MS = 8_000;
/** answered, but the connection itself didn't open (ICE through NAT/TURN can be slow) */
const CONNECT_MS = 30_000;
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, ...__TURN_SERVERS__];

interface Link {
  peerId: string;
  code: string;
  cid: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  cands: RTCIceCandidateInit[];
  /** they answered our offer (or we answered theirs) */
  answered: boolean;
  open: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export function createPeerNet(): NetAdapter {
  let ws: WebSocket | null = null;
  let wsClosed = true;
  let hb: ReturnType<typeof setInterval> | undefined;
  let state: SignalState = 'starting';
  let myCode = '';
  let myName = '';
  let friends: string[] = [];
  const links = new Map<string, Link>();
  const lastDial = new Map<string, number>();
  const peerState = new Map<string, 'trying' | 'offline' | 'noanswer' | 'failed'>();
  /** hello sent, and neither EXPIRE (offline) nor an offer (they listed us) came back yet */
  const helloPending = new Set<string>();
  let onMsg: (code: string, msg: StateMsg) => void = () => {};
  let onReq: (code: string, name: string) => void = () => {};
  const dialTimer = setInterval(() => dialTick(), 2000);

  // ---------------------------------------------------------------- signaling
  function raw(o: object) { if (ws?.readyState === 1) ws.send(JSON.stringify(o)); }
  // key order + payload shape mirror the official PeerJS client
  const signal = (type: string, dst: string, payload: object) => raw({ type, payload, dst });

  function connect() {
    const sock = new WebSocket(`wss://${SIGNAL_HOST}/peerjs?key=peerjs&id=${encodeURIComponent(PREFIX + myCode)}&token=${randomToken(11)}&version=1.5.4`);
    ws = sock;
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      let m: any;
      try { m = JSON.parse(e.data); } catch { return; }
      onSignal(m);
    };
    sock.onclose = () => {
      clearInterval(hb);
      if (ws !== sock || wsClosed) return;
      state = 'reconnecting';
      setTimeout(() => { if (ws === sock && !wsClosed) connect(); }, 3000);
    };
    clearInterval(hb);
    hb = setInterval(() => raw({ type: 'HEARTBEAT' }), 5000);
  }
  function closeSignal() {
    wsClosed = true;
    clearInterval(hb);
    try { ws?.close(); } catch { /* ignore */ }
    ws = null;
  }

  function onSignal(m: any) {
    switch (m.type) {
      case 'OPEN': state = 'online'; lastDial.clear(); dialTick(true); break;
      case 'ID-TAKEN': {
        // the same code is already online (game open in another tab)
        state = 'id-taken';
        const sock = ws;
        closeSignal();
        setTimeout(() => { if (ws === null && sock && myCode && state === 'id-taken') { wsClosed = false; state = 'connecting'; connect(); } }, 15000);
        break;
      }
      case 'ERROR': case 'INVALID-KEY': state = 'error'; break;
      case 'OFFER': if (m.payload) acceptOffer(m.src, m.payload); break;
      case 'ANSWER': {
        const l = links.get(m.src);
        if (!l || !m.payload || l.cid !== m.payload.connectionId) break;
        l.answered = true;
        if (peerState.get(l.code) === 'noanswer') peerState.set(l.code, 'trying');
        l.pc.setRemoteDescription(m.payload.sdp).then(() => flush(l)).catch(() => {});
        break;
      }
      case 'CANDIDATE': {
        const l = links.get(m.src);
        if (m.payload?.connectionId === HELLO) { helloFrom(m.src, m.payload); break; }
        if (!l || !m.payload || l.cid !== m.payload.connectionId) break;
        if (l.pc.remoteDescription) l.pc.addIceCandidate(m.payload.candidate).catch(() => {});
        else l.cands.push(m.payload.candidate);
        break;
      }
      case 'EXPIRE':
        // the friend we tried to reach is not online
        if (typeof m.src === 'string') {
          const l = links.get(m.src);
          if (l && !l.open) drop(m.src);
          helloPending.delete(m.src);
          peerState.set(m.src.slice(PREFIX.length), 'offline');
        }
        break;
      case 'LEAVE': drop(m.src); break;
    }
  }

  // ---------------------------------------------------------------- links
  function newLink(peerId: string, cid: string): Link {
    drop(peerId);
    helloPending.delete(peerId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const l: Link = { peerId, code: peerId.slice(PREFIX.length), cid, pc, dc: null, cands: [], answered: false, open: false, timer: undefined };
    pc.onicecandidate = (e) => { if (e.candidate) signal('CANDIDATE', peerId, { candidate: e.candidate.toJSON(), type: 'data', connectionId: cid }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') down(l); };
    links.set(peerId, l);
    return l;
  }
  function wire(l: Link, dc: RTCDataChannel) {
    l.dc = dc;
    dc.onopen = () => { l.open = true; clearTimeout(l.timer); peerState.delete(l.code); };
    dc.onclose = () => down(l);
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data.length > 2000 || !friends.includes(l.code)) return;
      let m: any;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m && m.t === 's') onMsg(l.code, m as StateMsg);
    };
  }
  const flush = (l: Link) => { for (const c of l.cands.splice(0)) l.pc.addIceCandidate(c).catch(() => {}); };
  function drop(peerId: string) {
    const l = links.get(peerId);
    if (!l) return;
    links.delete(peerId);
    clearTimeout(l.timer);
    try { l.dc?.close(); } catch { /* ignore */ }
    try { l.pc.close(); } catch { /* ignore */ }
  }
  function down(l: Link) {
    if (links.get(l.peerId) !== l) return;
    // both sides were willing, but no network path was found
    if (l.answered && !l.open) peerState.set(l.code, 'failed');
    drop(l.peerId);
    lastDial.delete(l.peerId);
  }

  /** dial the friends we dial; say hello to the others. now = ignore the retry interval */
  function dialTick(now = false) {
    if (state !== 'online' || !myCode) return;
    const me = PREFIX + myCode;
    const t = Date.now();
    for (const code of friends) {
      const peerId = PREFIX + code;
      if (links.has(peerId)) continue;
      if (!now && t - (lastDial.get(peerId) || 0) < DIAL_EVERY_MS) continue;
      lastDial.set(peerId, t);
      if (me < peerId) void dial(peerId);
      else hello(peerId);
    }
  }
  // tell a friend who dials us that we're here (offline: EXPIRE; not added us yet: a request for them)
  function hello(peerId: string) {
    const code = peerId.slice(PREFIX.length);
    helloPending.add(peerId);
    // no EXPIRE (so it reached them) and they didn't dial: they haven't added us
    setTimeout(() => { if (helloPending.has(peerId) && !links.has(peerId)) peerState.set(code, 'noanswer'); }, ANSWER_MS);
    signal('CANDIDATE', peerId, { candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 }, type: 'data', connectionId: HELLO, metadata: { name: myName } });
  }
  function requestFrom(src: string, p: any) {
    const code = src.slice(PREFIX.length);
    if (code.length !== 8 || code === myCode) return;
    onReq(code, typeof p?.metadata?.name === 'string' ? p.metadata.name.slice(0, 24) : '');
  }
  function helloFrom(src: unknown, p: any) {
    if (typeof src !== 'string' || !src.startsWith(PREFIX)) return;
    if (!friends.includes(src.slice(PREFIX.length))) { requestFrom(src, p); return; }
    const l = links.get(src);
    if (l?.answered) return;
    // an unanswered offer was sent while they were still offline: dial again now
    if (l) drop(src);
    lastDial.delete(src);
    dialTick();
  }
  async function dial(peerId: string) {
    const cid = 'dc_' + randomToken(10);
    const l = newLink(peerId, cid);
    if (!peerState.has(l.code)) peerState.set(l.code, 'trying');
    wire(l, l.pc.createDataChannel(cid, { ordered: false, maxRetransmits: 0 }));
    try {
      const offer = await l.pc.createOffer();
      await l.pc.setLocalDescription(offer);
      signal('OFFER', peerId, { sdp: { sdp: offer.sdp, type: offer.type }, type: 'data', connectionId: cid, label: cid, reliable: false, serialization: 'binary', metadata: { name: myName } });
    } catch { drop(peerId); return; }
    // no answer: online but they haven't added our code (offline would have produced EXPIRE)
    l.timer = setTimeout(() => {
      if (links.get(peerId) !== l || l.open) return;
      if (!l.answered) { drop(peerId); peerState.set(l.code, 'noanswer'); return; }
      l.timer = setTimeout(() => { if (links.get(peerId) === l && !l.open) down(l); }, CONNECT_MS - ANSWER_MS);
    }, ANSWER_MS);
  }
  async function acceptOffer(src: unknown, p: any) {
    if (typeof src !== 'string' || !src.startsWith(PREFIX)) return;
    if (!friends.includes(src.slice(PREFIX.length))) { requestFrom(src, p); return; } // mutual rule
    const l = newLink(src, p.connectionId);
    l.answered = true;
    l.pc.ondatachannel = (e) => wire(l, e.channel);
    try {
      await l.pc.setRemoteDescription(p.sdp);
      flush(l);
      const ans = await l.pc.createAnswer();
      await l.pc.setLocalDescription(ans);
      signal('ANSWER', src, { sdp: { sdp: ans.sdp, type: ans.type }, type: 'data', connectionId: p.connectionId });
    } catch { drop(src); }
  }

  return {
    start(code) {
      closeSignal();
      for (const id of [...links.keys()]) drop(id);
      lastDial.clear();
      peerState.clear();
      helloPending.clear();
      myCode = code;
      if (!code) { state = 'no-profile'; return; }
      state = 'connecting';
      wsClosed = false;
      connect();
    },
    setFriends(codes) {
      friends = [...codes];
      for (const id of [...links.keys()]) if (!friends.includes(id.slice(PREFIX.length))) drop(id);
      dialTick(true);
    },
    send(msg) {
      const s = JSON.stringify(msg);
      for (const l of links.values()) if (l.open && l.dc?.readyState === 'open') { try { l.dc.send(s); } catch { /* ignore */ } }
    },
    onMessage(fn) { onMsg = fn; },
    onRequest(fn) { onReq = fn; },
    setName(name) { myName = name.slice(0, 24); },
    peerStatus(code): PeerStatus {
      const l = links.get(PREFIX + code);
      if (l?.open) return 'connected';
      const ps = peerState.get(code);
      if (ps === 'offline') return 'offline';
      if (ps === 'noanswer') return 'noanswer';
      if (ps === 'failed') return 'failed';   // stays while we retry
      if (l) return 'connecting';
      return 'waiting';
    },
    signalState: () => state,
    stop() {
      clearInterval(dialTimer);
      closeSignal();
      for (const id of [...links.keys()]) drop(id);
    },
  };
}
