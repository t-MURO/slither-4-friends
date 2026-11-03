// GameAdapter for the real Slither page. This is the only file that touches
// the game's globals (slither, slithers, view_xx, gsc, bso, sos, forcing, ...).
import { slitherScore, slitherZoom } from '../../core/geometry';
import { pickServerEntry } from '../../core/servers';
import type { Camera, GameSnapshot, LeaderboardRow, MinimapInfo, Phase, ServerRef, SnakeInfo } from '../../core/types';
import type { ClickInfo, GameAdapter } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W = window as any;

interface Wrapped { target: any; prop: string; orig: Function; fn: Function }

export function createSlitherGame(): GameAdapter {
  let steering: ((self: { ang: number }) => number) | null = null;
  let mouseEnabled = true;
  let clickFn: ((c: ClickInfo) => boolean) | null = null;
  let nativeMap = true;
  let nativeLb = true;
  let lastConsumed = 0;
  let lbCache: LeaderboardRow[] = [];
  let lbAt = 0;
  const wrapped: Wrapped[] = [];
  const dens = document.createElement('canvas');
  const dctx = dens.getContext('2d')!;
  let densAt = 0;

  // ---------------------------------------------------------------- input
  function wrap(target: any, prop: string, make: (orig: Function) => Function) {
    const orig = target[prop];
    if (typeof orig !== 'function' || orig.__slc) return;
    const fn = make(orig) as Function & { __slc?: boolean };
    fn.__slc = true;
    target[prop] = fn;
    wrapped.push({ target, prop, orig, fn });
  }
  function wrapInputs() {
    wrap(W, 'onmousemove', (orig) => function (this: unknown, e: MouseEvent) {
      if (steering || !mouseEnabled) return;
      return orig.call(this, e);
    });
    wrap(W, 'onmousedown', (orig) => function (this: unknown, e: MouseEvent) {
      if (steering) return;
      if (clickFn && e && clickFn({ x: e.clientX, y: e.clientY, button: e.button ?? 0, shiftKey: !!e.shiftKey })) {
        e.preventDefault?.();
        lastConsumed = performance.now();
        return;
      }
      if (!mouseEnabled) return;
      return orig.call(this, e);
    });
    wrap(document, 'onkeydown', (orig) => function (this: unknown, e: KeyboardEvent) {
      const v = (e || W.event).keyCode;
      if (steering && (v === 32 || v === 37 || v === 38 || v === 39)) return; // space + arrows while paused
      return orig.call(this, e);
    });
  }
  const onContextMenu = (e: Event) => { if (performance.now() - lastConsumed < 400) e.preventDefault(); };
  addEventListener('contextmenu', onContextMenu, true);

  // ---------------------------------------------------------------- state readers
  const inGame = () => !!W.playing && !!W.slither && typeof W.slither.xx === 'number';
  function phase(): Phase {
    if (W.connecting) return 'connecting';
    if (inGame()) return W.dead_mtm === -1 || W.dead_mtm === undefined ? 'playing' : 'dead';
    return 'menu';
  }
  const score = (o: any) => {
    try { return slitherScore(o.sct + (o.rsc || 0), o.fam, W.fpsls, W.fmlts); } catch { return null; }
  };
  function server(): ServerRef | null {
    if (!inGame() || !W.bso) return null;
    const sid = W.real_sid > 0 ? Number(W.real_sid) : Number(W.bso.sid) || 0;
    return { sid, ip: String(W.bso.ip), po: Number(W.bso.po) };
  }
  function snakes(): SnakeInfo[] {
    const out: SnakeInfo[] = [];
    for (const s of Array.isArray(W.slithers) ? W.slithers : []) {
      if (!s || s === W.slither || s.dead || typeof s.xx !== 'number') continue;
      const nk = typeof s.nk === 'string' ? s.nk : '';
      out.push({
        id: s.id,
        name: nk.trim() ? nk : '',
        x: s.xx + (s.fx || 0),
        y: s.yy + (s.fy || 0),
        score: score(s),
        color: s.cs || '#ffffff',
        width: 29 * (s.sc || 1),
        points() {
          const p: number[] = [s.xx + (s.fx || 0), s.yy + (s.fy || 0)];
          const pts = Array.isArray(s.pts) ? s.pts : [];
          for (let j = pts.length - 1; j >= 0; j--) {
            const q = pts[j];
            if (q) p.push(q.xx + (q.fx || 0), q.yy + (q.fy || 0));
          }
          return p;
        },
      });
    }
    return out;
  }
  function leaderboard(): LeaderboardRow[] {
    const t = performance.now();
    if (t - lbAt < 250) return lbCache;
    lbAt = t;
    if (!W.lbn?.querySelectorAll || !W.lbs?.querySelectorAll) return (lbCache = []);
    const ns = W.lbn.querySelectorAll('span'), ss = W.lbs.querySelectorAll('span');
    const rows: LeaderboardRow[] = [];
    for (let i = 0; i < ns.length; i++) {
      rows.push({
        pos: i + 1,
        name: ns[i].textContent.replace(/ /g, ' '),
        score: Number(String(ss[i]?.textContent ?? '').replace(/\D/g, '')) || 0,
        color: ns[i].style.color || '#fff',
        me: ns[i].style.fontWeight === 'bold',
      });
    }
    return (lbCache = rows);
  }
  function camera(): Camera | null {
    if (!inGame() || !W.mc?.width || typeof W.gsc !== 'number') return null;
    const k = (W.ww || innerWidth) / W.mc.width;
    return {
      toScreen: (x, y) => [(W.mww2 + (x - W.view_xx) * W.gsc) * k, (W.mhh2 + (y - W.view_yy) * W.gsc) * k],
      toWorld: (sx, sy) => [W.view_xx + (sx / k - W.mww2) / W.gsc, W.view_yy + (sy / k - W.mhh2) / W.gsc],
    };
  }
  const nativeMinimapBox = (): HTMLElement | null => W.myloc?.parentNode ?? null;
  function minimap(): MinimapInfo | null {
    if (!(W.mmrad > 0) || !(W.grd > 0)) return null;
    // The game draws other snakes as white pixels on two cross-fading canvases.
    const t = performance.now();
    const a1 = W.asmc, a2 = W.asmc2;
    if (a1?.width && t - densAt > 120) {
      densAt = t;
      if (dens.width !== a1.width || dens.height !== a1.height) { dens.width = a1.width; dens.height = a1.height; }
      dctx.clearRect(0, 0, dens.width, dens.height);
      const o1 = parseFloat(a1.style.opacity) || 0;
      const o2 = a2 ? parseFloat(a2.style.opacity) || 0 : 0;
      const tot = o1 + o2;
      if (tot > 0) {
        dctx.globalAlpha = o1 / tot; if (o1 > 0) dctx.drawImage(a1, 0, 0);
        dctx.globalAlpha = o2 / tot; if (o2 > 0 && a2) dctx.drawImage(a2, 0, 0);
        dctx.globalAlpha = 1;
      }
    }
    let nativeRect: MinimapInfo['nativeRect'] = null;
    const box = nativeMinimapBox();
    if (box && getComputedStyle(box).display !== 'none') {
      const r = box.getBoundingClientRect();
      const k = r.width / (W.mmrad * 2 + 24);
      nativeRect = { cx: r.left + (12 + W.mmrad) * k, cy: r.top + (12 + W.mmrad) * k, rad: W.mmrad * k };
    }
    const occupancy = W.mmdata instanceof Uint8Array && W.mmsz > 0 ? { size: Number(W.mmsz), data: W.mmdata as Uint8Array } : null;
    return { grd: W.grd, flux: W.flux_grd > 0 ? W.flux_grd : W.grd * 0.98, density: a1?.width ? dens : null, nativeRect, occupancy };
  }

  // ---------------------------------------------------------------- loops
  function applyNative() {
    const box = nativeMinimapBox();
    if (box) {
      const want = nativeMap ? '' : 'hidden';
      if (box.style.visibility !== want) box.style.visibility = want;
      if (box.style.transform) box.style.transform = ''; // undo v2's scaling
    }
    for (const n of ['lbh', 'lbs', 'lbn', 'lbp']) {
      const e = W[n];
      const want = nativeLb ? '' : 'hidden';
      if (e?.style && e.style.visibility !== want) e.style.visibility = want;
    }
  }
  const timers = [setInterval(wrapInputs, 1000), setInterval(applyNative, 500)];
  wrapInputs();
  let raf = 0;
  let zoom = 1;
  let zoomed = false;
  // the server marks killed snakes dead (they fade out); snakes that just leave the view are removed instead
  let killFn: ((k: { x: number; y: number; score: number | null }) => void) | null = null;
  const seenDead = new WeakSet<object>();
  function scanKills() {
    if (!killFn || !inGame() || !Array.isArray(W.slithers)) return;
    for (const s of W.slithers) {
      if (!s || !s.dead || s === W.slither || seenDead.has(s)) continue;
      seenDead.add(s);
      killFn({ x: s.xx + (s.fx || 0), y: s.yy + (s.fy || 0), score: score(s) });
    }
  }
  // The game eases gsc toward slitherZoom(length) by a tiny step per frame, so the factor is reapplied every frame.
  function applyZoom() {
    if (!inGame() || W.choosing_skin) { zoomed = false; return; }
    if (zoom === 1 && !zoomed) return;   // leave the game alone
    const target = slitherZoom(W.slither.sct) * zoom;
    zoomed = zoom !== 1;
    if (W.gsc === target) return;
    W.gsc = target;
    if (Array.isArray(W.bgees)) for (const b of W.bgees) if (b) b.sc = target * b.sp;   // background layers
  }
  const steer = () => {
    raf = requestAnimationFrame(steer);
    applyZoom();
    scanKills();
    if (!steering || phase() !== 'playing') return;
    const a = steering({ ang: W.slither.ang });
    W.xm = Math.cos(a) * 220;
    W.ym = Math.sin(a) * 220;
  };
  raf = requestAnimationFrame(steer);

  return {
    snapshot(): GameSnapshot {
      const ph = phase();
      const playing = ph === 'playing' || ph === 'dead';
      return {
        phase: ph,
        self: playing ? { x: W.slither.xx, y: W.slither.yy, ang: W.slither.ang || 0, score: score(W.slither) } : null,
        server: server(),
        snakes: playing ? snakes() : [],
        leaderboard: playing ? leaderboard() : [],
        rank: Number(W.rank) || 0,
        playerCount: Number(W.slither_count) || 0,
        camera: camera(),
        minimap: playing ? minimap() : null,
        nickname: String(W.my_nick || W.nick?.value || ''),
      };
    },
    joinServer(srv) {
      const entry = pickServerEntry(srv, Array.isArray(W.sos) ? W.sos : []);
      if (!entry) return false;
      W.fobso = entry;
      W.forcing = true;
      return true;
    },
    pendingServer() {
      if (!W.forcing || !W.fobso) return null;
      return { sid: Number(W.fobso.sid) || 0, ip: String(W.fobso.ip), po: Number(W.fobso.po) };
    },
    startGame() {
      if (!W.playing && !W.connecting && !W.want_play && W.play_btn?.elem) W.play_btn.elem.click();
    },
    setSteeringOverride(fn) {
      steering = fn;
      if (fn) {
        W.setAcceleration?.(0);
        W.kd_l = W.kd_r = W.kd_u = false;
      }
    },
    setMouseEnabled(on) {
      mouseEnabled = on;
      if (!on) W.setAcceleration?.(0);
    },
    onGameClick(fn) { clickFn = fn; },
    onKill(fn) { killFn = fn; },
    setZoom(f) { zoom = f; },
    setNativeMinimapVisible(v) { nativeMap = v; applyNative(); },
    setNativeLeaderboardVisible(v) { nativeLb = v; applyNative(); },
    destroy() {
      for (const t of timers) clearInterval(t);
      cancelAnimationFrame(raf);
      killFn = null;
      zoom = 1;
      applyZoom();   // back to the game's own scale
      removeEventListener('contextmenu', onContextMenu, true);
      for (const w of wrapped) if (w.target[w.prop] === w.fn) w.target[w.prop] = w.orig;
      nativeMap = nativeLb = true;
      applyNative();
    },
  };
}
