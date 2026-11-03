// Dev playground control panel (left sidebar). Everything the Coop code
// normally gets from outside — game state, friends, network, stored config —
// is mocked and can be changed here while you watch the result on the right.
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { MockFriend } from '../adapters/mock/net';
import { normCode } from '../core/util';
import type { Phase, SignalState } from '../core/types';
import { COMPONENTS } from '../ui/App';
import { ALL_LAYERS, type Layer } from '../ui/overlay/overlay';
import type { DevApi } from './frame';
import { resetState, sampleFriend, VIEWPORTS, type DevState } from './state';

const css = `
*{box-sizing:border-box} body{margin:0;background:#0b0f16;color:#dfe7f1;font:12px/1.4 system-ui,Segoe UI,Arial,sans-serif;display:grid;grid-template-columns:350px 1fr;height:100vh;overflow:hidden}
aside{overflow:auto;border-right:1px solid #1f2a3b;padding:10px 12px 40px}
main{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#0e131c 0 25%,#0b0f16 0 50%) 0 0/24px 24px}
h1{font-size:15px;margin:2px 0 2px} .sub{color:#7f8fa3;margin-bottom:10px}
details{background:#121a27;border:1px solid #1f2a3b;border-radius:9px;margin-bottom:9px} summary{cursor:pointer;padding:8px 10px;font-weight:600}
.box{padding:2px 10px 10px} .r{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap} .r>label{min-width:84px;color:#9fb0c3}
input[type=text],input[type=number],select,textarea{background:#0a0f18;border:1px solid #2b374c;border-radius:6px;color:#fff;padding:4px 6px;font:inherit}
input[type=text]{width:120px} input[type=number]{width:80px} input[type=range]{flex:1} textarea{width:100%;height:170px;font:11px Consolas,monospace}
button{background:#263247;border:0;border-radius:6px;color:#fff;padding:5px 9px;cursor:pointer;font:inherit} button:hover{filter:brightness(1.2)} button.on{background:#2c6bed}
.f{border:1px solid #263247;border-radius:8px;padding:6px 8px;margin-top:8px} .f h3{margin:0;font-size:12px;display:flex;gap:6px;align-items:center}
.f h3 span{width:10px;height:10px;border-radius:50%} .muted{color:#7f8fa3} pre{white-space:pre-wrap;font:11px Consolas,monospace;margin:6px 0 0;color:#9fb0c3}
.tag{font-size:10px;padding:1px 5px;border-radius:4px;background:#263247;color:#9fb0c3}
iframe{border:0;background:#000;box-shadow:0 0 0 1px #2b374c,0 20px 60px rgba(0,0,0,.6);transform-origin:center}
.kbd{font:11px Consolas,monospace;background:#263247;border-radius:4px;padding:0 4px}
`;

function Panel() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [, setTick] = useState(0);
  const [scale, setScale] = useState(1);
  const dev = (): DevApi | undefined => (frame.current?.contentWindow as any)?.__dev;
  const d = dev();
  const s: DevState | undefined = d?.state;

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 400);
    return () => clearInterval(t);
  }, []);

  // fit the iframe into the main area
  const vp = s ? VIEWPORTS[s.viewport] : null;
  useEffect(() => {
    const fit = () => {
      const main = frame.current?.parentElement;
      if (!main || !vp) { setScale(1); return; }
      setScale(Math.min(1, (main.clientWidth - 40) / vp[0], (main.clientHeight - 40) / vp[1]));
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [vp?.[0], vp?.[1]]);

  const up = (fn: (s: DevState) => void) => { dev()?.update(fn); setTick((n) => n + 1); };
  const reloadFrame = () => frame.current?.contentWindow?.location.reload();
  const listed = (code: string) => !!d?.net.listed.includes(normCode(code));

  const setFriend = (i: number, patch: Partial<MockFriend>) => up((st) => { st.friends[i] = { ...st.friends[i], ...patch }; });
  const preset = (patch: Partial<MockFriend>) => up((st) => { st.friends.push(sampleFriend(st.friends.length, patch)); });

  return (
    <>
      <aside>
        <h1>Slither Coop · Dev playground</h1>
        <div class="sub">Everything on the right runs the real Coop code against mocks. Code changes reload automatically.</div>
        {!s && <div class="muted">Loading frame…</div>}
        {s && d && (
          <>
            <details open>
              <summary>View</summary>
              <div class="box">
                <div class="r"><label>Show</label>
                  <select value={s.mode} onChange={(e) => { up((st) => { st.mode = (e.currentTarget as HTMLSelectElement).value as DevState['mode']; }); reloadFrame(); }}>
                    <option value="app">Whole app</option>
                    {COMPONENTS.map((c) => <option key={c} value={c}>Only: {c}</option>)}
                  </select>
                </div>
                <div class="r"><label>Viewport</label>
                  <select value={s.viewport} onChange={(e) => up((st) => { st.viewport = (e.currentTarget as HTMLSelectElement).value; })}>
                    {Object.keys(VIEWPORTS).map((k) => <option key={k} value={k}>{k === 'fill' ? 'Fill window' : k}</option>)}
                  </select>
                </div>
                <div class="r"><label>Overlay</label>
                  {ALL_LAYERS.map((l) => (
                    <button key={l} class={s.layers.includes(l) ? 'on' : ''}
                      onClick={() => up((st) => { st.layers = st.layers.includes(l) ? st.layers.filter((x) => x !== l) : [...st.layers, l as Layer]; })}>{l}</button>
                  ))}
                </div>
                <div class="r muted">Keys in the game: <span class="kbd">Enter</span> play · <span class="kbd">← →</span> steer · <span class="kbd">Space</span> boost · <span class="kbd">P</span> pause · <span class="kbd">M</span> mouse</div>
              </div>
            </details>

            <details open>
              <summary>Game <span class="tag">{d.world.phase}{d.world.server ? ' · server ' + d.world.server.sid : ''}</span></summary>
              <div class="box">
                <div class="r"><label>Phase</label>
                  {(['menu', 'playing', 'dead'] as Phase[]).map((p) => (
                    <button key={p} class={d.world.phase === p ? 'on' : ''} onClick={() => up((st) => { st.phase = p; })}>{p}</button>
                  ))}
                </div>
                <div class="r"><label>Server</label>
                  <input type="number" value={d.world.server?.sid ?? 0} onChange={(e) => { if (d.world.server) d.world.server = { ...d.world.server, sid: Number((e.currentTarget as HTMLInputElement).value) }; }} />
                  <span class="muted">{d.world.pending ? 'next game: ' + d.world.pending.sid : ''}</span>
                </div>
                <div class="r"><label>My length</label>
                  <input type="range" min={10} max={40000} value={d.world.self.score} onInput={(e) => { d.world.self.score = Number((e.currentTarget as HTMLInputElement).value); }} />
                  <span>{Math.round(d.world.self.score)}</span>
                </div>
                <div class="r"><label>Nickname</label>
                  <input type="text" value={s.nickname} onChange={(e) => up((st) => { st.nickname = (e.currentTarget as HTMLInputElement).value; })} />
                </div>
                <div class="r"><label>Zoom</label>
                  <input type="range" min={0.3} max={1.6} step={0.05} value={s.zoom} onInput={(e) => up((st) => { st.zoom = Number((e.currentTarget as HTMLInputElement).value); })} />
                  <span>{s.zoom.toFixed(2)}</span>
                </div>
                <div class="r"><label>Bots</label>
                  <input type="range" min={0} max={40} value={s.bots} onChange={(e) => up((st) => { st.bots = Number((e.currentTarget as HTMLInputElement).value); })} />
                  <span>{s.bots}</span>
                </div>
                <div class="r"><label>Named</label>
                  <input type="range" min={0} max={1} step={0.1} value={s.namedRatio} onChange={(e) => up((st) => { st.namedRatio = Number((e.currentTarget as HTMLInputElement).value); })} />
                  <span>{Math.round(s.namedRatio * 100)}%</span>
                </div>
                <SpawnRow onSpawn={(n) => d.world.spawnNear(n)} />
              </div>
            </details>

            <details open>
              <summary>Friends (mock) <span class="tag">{s.friends.length}</span></summary>
              <div class="box">
                <div class="r">
                  <button onClick={() => preset({})}>+ nearby</button>
                  <button onClick={() => preset({ server: 'other', dist: 4000 })}>+ other server</button>
                  <button onClick={() => preset({ server: 'same-ipv6' })}>+ same server via IPv6</button>
                  <button onClick={() => preset({ addsMe: false })}>+ hasn't added me</button>
                  <button onClick={() => preset({ link: 'offline' })}>+ offline</button>
                  <span class="muted">New ones aren't in my list yet: if they've added me, that's a friend request.</span>
                </div>
                {s.friends.map((f, i) => (
                  <div class="f" key={i}>
                    <h3><span style={{ background: f.color }} />{f.name || '(no name)'} <span class="muted">{f.code}</span>
                      <span style={{ flex: 1 }} />
                      <button onClick={() => up((st) => { st.friends.splice(i, 1); })}>×</button>
                    </h3>
                    <div class="r"><label>In my list</label>
                      <input type="checkbox" checked={listed(f.code)} onChange={(e) => {
                        const on = (e.currentTarget as HTMLInputElement).checked;
                        if (on) d.app.controller.addFriend(f.code, f.name); else d.app.controller.removeFriend(f.code);
                      }} />
                      <label style={{ minWidth: 0 }}>Has added me</label>
                      <input type="checkbox" checked={f.addsMe} onChange={(e) => setFriend(i, { addsMe: (e.currentTarget as HTMLInputElement).checked })} />
                    </div>
                    <div class="r"><label>Code / name</label>
                      <input type="text" value={f.code} onChange={(e) => setFriend(i, { code: (e.currentTarget as HTMLInputElement).value })} />
                      <input type="text" style={{ width: '80px' }} value={f.name} onChange={(e) => setFriend(i, { name: (e.currentTarget as HTMLInputElement).value })} />
                    </div>
                    <div class="r"><label>Nickname</label>
                      <input type="text" value={f.gnick} onChange={(e) => setFriend(i, { gnick: (e.currentTarget as HTMLInputElement).value })} />
                      <input type="color" value={f.color} onInput={(e) => setFriend(i, { color: (e.currentTarget as HTMLInputElement).value })} />
                    </div>
                    <div class="r"><label>Connection</label>
                      <select value={f.link} onChange={(e) => setFriend(i, { link: (e.currentTarget as HTMLSelectElement).value as MockFriend['link'] })}>
                        {['connected', 'connecting', 'offline', 'failed', 'waiting'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <label style={{ minWidth: 0 }}>Alive</label>
                      <input type="checkbox" checked={f.alive} onChange={(e) => setFriend(i, { alive: (e.currentTarget as HTMLInputElement).checked })} />
                    </div>
                    <div class="r"><label>Server</label>
                      <select value={f.server} onChange={(e) => setFriend(i, { server: (e.currentTarget as HTMLSelectElement).value as MockFriend['server'] })}>
                        <option value="same">same as me</option>
                        <option value="same-ipv6">same (IPv6 address)</option>
                        <option value="other">other</option>
                      </select>
                      {f.server === 'other' && <input type="number" value={f.otherSid} onChange={(e) => setFriend(i, { otherSid: Number((e.currentTarget as HTMLInputElement).value) })} />}
                    </div>
                    <div class="r"><label>Distance</label>
                      <input type="range" min={0} max={9000} step={50} value={f.dist} onInput={(e) => setFriend(i, { dist: Number((e.currentTarget as HTMLInputElement).value) })} />
                      <span>{f.dist}</span>
                    </div>
                    <div class="r"><label>Direction</label>
                      <input type="range" min={0} max={359} value={Math.round(f.angle)} onInput={(e) => setFriend(i, { angle: Number((e.currentTarget as HTMLInputElement).value), orbit: false })} />
                      <label style={{ minWidth: 0 }}>Orbit</label>
                      <input type="checkbox" checked={f.orbit} onChange={(e) => setFriend(i, { orbit: (e.currentTarget as HTMLInputElement).checked })} />
                    </div>
                    <div class="r"><label>Length</label>
                      <input type="range" min={10} max={40000} step={10} value={f.score} onInput={(e) => setFriend(i, { score: Number((e.currentTarget as HTMLInputElement).value) })} />
                      <span>{f.score}</span>
                    </div>
                    <div class="r"><label>Sees player</label>
                      <input type="text" placeholder="name (track it to test)" value={f.sees ?? ''} onChange={(e) => setFriend(i, { sees: (e.currentTarget as HTMLInputElement).value })} />
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <details>
              <summary>Network <span class="tag">{s.signal}</span></summary>
              <div class="box">
                <div class="r"><label>Signal server</label>
                  <select value={s.signal} onChange={(e) => up((st) => { st.signal = (e.currentTarget as HTMLSelectElement).value as SignalState; })}>
                    {['online', 'connecting', 'reconnecting', 'id-taken', 'error'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div class="muted" style={{ marginTop: '6px' }}>What you send to friends (10×/s):</div>
                <pre>{JSON.stringify(d.net.lastSent, null, 1)}</pre>
              </div>
            </details>

            <StorageBox dev={d} onReset={() => { resetState(); location.reload(); }} />
          </>
        )}
      </aside>
      <main>
        <iframe ref={frame} src="frame.html"
          style={vp ? { width: vp[0] + 'px', height: vp[1] + 'px', transform: `scale(${scale})`, flex: 'none' } : { width: '100%', height: '100%' }} />
      </main>
    </>
  );
}

function SpawnRow(props: { onSpawn: (name: string) => void }) {
  const [name, setName] = useState('MALFOY');
  return (
    <div class="r"><label>Spawn near me</label>
      <input type="text" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      <button onClick={() => props.onSpawn(name)}>Spawn</button>
    </div>
  );
}

function StorageBox(props: { dev: DevApi; onReset: () => void }) {
  const { dev } = props;
  const current = JSON.stringify(dev.storage.data, null, 1);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState('');
  return (
    <details>
      <summary>Stored config (extension storage)</summary>
      <div class="box">
        <textarea value={text ?? current} onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} />
        <div class="r">
          <button onClick={() => {
            try { dev.storage.externalChange(JSON.parse(text ?? current)); setText(null); setErr(''); } catch (e) { setErr(String(e)); }
          }}>Apply (as if changed in another tab)</button>
          <button onClick={() => setText(null)}>Revert</button>
        </div>
        <div class="r">
          <button onClick={() => { dev.storage.externalChange({}); setText(null); }}>New user (empty storage)</button>
          <button onClick={props.onReset}>Reset whole scenario</button>
        </div>
        {err && <div style={{ color: '#ff7b7b' }}>{err}</div>}
      </div>
    </details>
  );
}

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
render(<Panel />, document.body);

// live reload on every rebuild (esbuild dev server)
new EventSource('/esbuild').addEventListener('change', () => location.reload());
