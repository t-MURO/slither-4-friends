import { useEffect, useState } from 'preact/hooks';
import type { Controller } from '../../app/controller';
import { useStore } from '../../core/store';

export function Toast(props: { c: Controller }) {
  const toast = useStore(props.c.view, (v) => v.toast);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 2600);
    return () => clearTimeout(t);
  }, [toast?.id]);
  return <div class={'slc-toast' + (shown ? ' on' : '')}>{toast?.text}</div>;
}

/** Banner while paused and/or the mouse is off. */
export function StatusPill(props: { c: Controller }) {
  const v = useStore(props.c.view, (v) => ({ paused: v.paused, mouse: v.mouseLocked, side: v.settings.pauseSide }));
  if (!v.paused && !v.mouse) return null;
  return (
    <div class="slc-pill">
      {v.paused && <><b>⏸ Paused</b>circling {v.side} · P to resume</>}
      {v.paused && v.mouse && <>&nbsp;&nbsp;·&nbsp;&nbsp;</>}
      {v.mouse && <><b>🖱 Mouse off</b>arrows/space steer · M to turn back on</>}
    </div>
  );
}
