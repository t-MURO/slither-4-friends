import { useState } from 'preact/hooks';
import type { Controller } from '../../app/controller';
import { useStore } from '../../core/store';
import { Card } from './common';

export function FriendsTab(props: { c: Controller }) {
  const { c } = props;
  const v = useStore(c.view, (v) => ({ profile: v.profile, rows: v.friendRows, friends: v.friends, kind: v.storeKind, def: v.settings.friendColor }));
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('Copy');
  const [editing, setEditing] = useState<string | null>(null);

  const add = () => {
    const e = c.addFriend(code, label);
    setErr(e ?? '');
    if (!e) { setCode(''); setLabel(''); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(v.profile.code); setCopied('Copied'); } catch { setCopied('Ctrl+C'); }
    setTimeout(() => setCopied('Copy'), 1300);
  };

  return (
    <>
      <Card label="Your friend code">
        <div class="slc-row">
          <span class="slc-code">{v.profile.code}</span>
          <span class="slc-grow" />
          <button class="slc-btn ghost" onClick={copy}>{copied}</button>
        </div>
        <div class="slc-lbl" style={{ marginTop: '9px' }}>Your name (shown to friends)</div>
        <input type="text" maxLength={24} placeholder="Uses your Slither nickname if empty" value={v.profile.name}
          onInput={(e) => c.setName((e.currentTarget as HTMLInputElement).value)} />
      </Card>

      <Card label="Add a friend">
        <div class="slc-row">
          <div class="slc-grow">
            <input type="text" class="mono" maxLength={12} placeholder="XXXX-XXXX" autocomplete="off" spellcheck={false} value={code}
              onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <div class="slc-grow">
            <input type="text" maxLength={24} placeholder="Name (optional)" autocomplete="off" value={label}
              onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <button class="slc-btn" onClick={add}>Add</button>
        </div>
        {err && <div class="slc-err">{err}</div>}
        <div class="slc-muted" style={{ marginTop: '7px' }}>You only see each other when <b>both</b> of you have added the other's code.</div>
      </Card>

      <Card label="Friends">
        <div class="slc-list">
          {!v.rows.length && <div class="slc-muted">No friends yet. Add their code above.</div>}
          {v.rows.map((r) => {
            const entry = v.friends.find((f) => f.code.replace('-', '') === r.code);
            return (
              <div class="slc-item" key={r.code}>
                <input type="color" value={entry?.color || v.def} title="Color on map and arrows"
                  onInput={(e) => c.setFriendColor(r.code, (e.currentTarget as HTMLInputElement).value)} />
                {editing === r.code ? (
                  <input type="text" maxLength={24} placeholder="Name" value={entry?.label ?? ''} ref={(el) => el?.focus()}
                    onBlur={(e) => { c.renameFriend(r.code, (e.currentTarget as HTMLInputElement).value); setEditing(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
                ) : (
                  <div class="slc-nm" title="Click to rename" style={{ cursor: 'text' }} onClick={() => setEditing(r.code)}>
                    {r.label}<span class="cd">{entry?.code}</span>
                  </div>
                )}
                {r.canJoin ? <button class="slc-go" title="Join this friend's server" onClick={() => c.joinFriend(r.code)}>Join</button> : <span />}
                <button class="rm" title="Remove friend" onClick={() => c.removeFriend(r.code)}>×</button>
                <div class={'st ' + r.state}>{r.long}</div>
              </div>
            );
          })}
        </div>
        <div class="slc-muted" style={{ marginTop: '8px' }}>
          {v.kind === 'extension' ? 'Saved in the extension (shared by slither.com and slither.io).'
            : v.kind === 'local' ? 'Saved in this browser for ' + location.hostname + '.' : 'Saved in memory (dev playground).'}
        </div>
      </Card>
    </>
  );
}
