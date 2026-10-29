import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PrefsAdapter } from '../../adapters/types';

/** Stops mouse/keyboard events inside our UI from reaching the game (steering, boosting). */
const stop = (e: Event) => e.stopPropagation();
export const shield = {
  onMouseDown: stop, onMouseUp: stop, onMouseMove: stop, onClick: stop, onKeyDown: stop, onKeyUp: stop,
  onKeyPress: stop, onWheel: stop, onTouchStart: stop, onTouchMove: stop, onContextMenu: stop,
};

/** Makes a fixed-position box draggable by a handle; remembers the position in prefs. */
export function useDraggable(prefs: PrefsAdapter, key: string) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => prefs.get(key, null));
  const onHandleDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    e.preventDefault();
    const r = box.current!.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    let last = { x: r.left, y: r.top };
    const mv = (ev: MouseEvent) => {
      last = {
        x: Math.max(0, Math.min(innerWidth - 60, ev.clientX - ox)),
        y: Math.max(0, Math.min(innerHeight - 30, ev.clientY - oy)),
      };
      setPos(last);
    };
    const up = () => {
      removeEventListener('mousemove', mv, true);
      removeEventListener('mouseup', up, true);
      prefs.set(key, last);
    };
    addEventListener('mousemove', mv, true);
    addEventListener('mouseup', up, true);
  };
  const style = pos ? { left: pos.x + 'px', top: pos.y + 'px' } : undefined;
  return { box, style, onHandleDown };
}

export function Card(props: { label?: string; children: ComponentChildren }) {
  return (
    <div class="slc-card">
      {props.label && <div class="slc-lbl">{props.label}</div>}
      {props.children}
    </div>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="slc-tog">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange((e.currentTarget as HTMLInputElement).checked)} />
      {props.label}
    </label>
  );
}

export function Range(props: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div class="slc-set">
      <span>{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onInput={(e) => props.onChange(Number((e.currentTarget as HTMLInputElement).value))} />
      <output>{props.format(props.value)}</output>
    </div>
  );
}

export function ColorSetting(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div class="slc-set">
      <span>{props.label}</span>
      <span />
      <input type="color" value={props.value} onInput={(e) => props.onChange((e.currentTarget as HTMLInputElement).value)} />
    </div>
  );
}

export function Segmented<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="slc-seg">
      {props.options.map(([v, label]) => (
        <button key={v} class={v === props.value ? 'on' : ''} onClick={() => props.onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

/** Re-render every `ms` (for "12s ago" style texts). */
export function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
