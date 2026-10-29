// NetAdapter over WebRTC data channels. The public PeerJS server (0.peerjs.com)
// is only used to exchange the handshake (it speaks the PeerJS protocol, and
// drops connections whose messages don't look exactly like PeerJS ones).
//
// Mutual friends: of two friends, the one whose code sorts first dials; the
// other side only answers codes on its own list.
import type { PeerStatus, SignalState, StateMsg } from '../../core/types';
import { randomToken } from '../../core/util';
import type { NetAdapter } from '../types';

const SIGNAL_HOST = '0.peerjs.com';
const PREFIX = 'slcoop2-';
const DIAL_EVERY_MS = 10_000;
const ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];

interface Link {
  peerId: string;
  code: string;
  cid: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  cands: RTCIceCandidateInit[];
  open: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export function createPeerNet(): NetAdapter {
  let ws: WebSocket | null = null;
  let wsClosed = true;
  let hb: ReturnType<typeof setInterval> | undefined;
  let state: SignalState = 'starting';
  let myCode = '';
  let friends: string[] = [];
  const links = new Map<string, Link>();
  const lastDial = new Map<string, number>();
  const peerState = new Map<string, 'trying' | 'offline' | 'noanswer'>();
  let onMsg: (code: string, msg: StateMsg) => void = () => {};
  const dialTimer = setInterval(dialTick, 2000);

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
      case 'OPEN': state = 'online'; lastDial.clear(); dialTick(); break;
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
        if (l && m.payload && l.cid === m.payload.connectionId) l.pc.setRemoteDescription(m.payload.sdp).then(() => flush(l)).catch(() => {});
        break;
      }
      case 'CANDIDATE': {
        const l = links.get(m.src);
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
          peerState.set(m.src.slice(PREFIX.length), 'offline');
        }
        break;
      case 'LEAVE': drop(m.src); break;
    }
  }

  // ---------------------------------------------------------------- links
  function newLink(peerId: string, cid: string): Link {
    drop(peerId);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const l: Link = { peerId, code: peerId.slice(PREFIX.length), cid, pc, dc: null, cands: [], open: false, timer: undefined };
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
    drop(l.peerId);
    lastDial.delete(l.peerId);
  }

  function dialTick() {
    if (state !== 'online' || !myCode) return;
    const me = PREFIX + myCode;
    const t = Date.now();
    for (const code of friends) {
      const peerId = PREFIX + code;
      if (!(me < peerId) || links.has(peerId)) continue; // the other side dials
      if (t - (lastDial.get(peerId) || 0) < DIAL_EVERY_MS) continue;
      lastDial.set(peerId, t);
      void dial(peerId);
    }
  }
  async function dial(peerId: string) {
    const cid = 'dc_' + randomToken(10);
    const l = newLink(peerId, cid);
    if (!peerState.has(l.code)) peerState.set(l.code, 'trying');
    wire(l, l.pc.createDataChannel(cid, { ordered: false, maxRetransmits: 0 }));
    try {
      const offer = await l.pc.createOffer();
      await l.pc.setLocalDescription(offer);
      signal('OFFER', peerId, { sdp: { sdp: offer.sdp, type: offer.type }, type: 'data', connectionId: cid, label: cid, reliable: false, serialization: 'binary' });
    } catch { drop(peerId); return; }
    // no answer: online but they haven't added our code (offline would have produced EXPIRE)
    l.timer = setTimeout(() => { if (links.get(peerId) === l && !l.open) { drop(peerId); peerState.set(l.code, 'noanswer'); } }, 8000);
  }
  async function acceptOffer(src: unknown, p: any) {
    if (typeof src !== 'string' || !src.startsWith(PREFIX)) return;
    if (!friends.includes(src.slice(PREFIX.length))) return; // mutual rule
    const l = newLink(src, p.connectionId);
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
      myCode = code;
      if (!code) { state = 'no-profile'; return; }
      state = 'connecting';
      wsClosed = false;
      connect();
    },
    setFriends(codes) {
      friends = [...codes];
      for (const id of [...links.keys()]) if (!friends.includes(id.slice(PREFIX.length))) drop(id);
      dialTick();
    },
    send(msg) {
      const s = JSON.stringify(msg);
      for (const l of links.values()) if (l.open && l.dc?.readyState === 'open') { try { l.dc.send(s); } catch { /* ignore */ } }
    },
    onMessage(fn) { onMsg = fn; },
    peerStatus(code): PeerStatus {
      const l = links.get(PREFIX + code);
      if (l?.open) return 'connected';
      const ps = peerState.get(code);
      if (ps === 'offline') return 'offline';
      if (ps === 'noanswer') return 'noanswer';
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
