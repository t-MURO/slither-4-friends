// Tiny observable store + Preact hook. Components subscribe to exactly the
// slice they render, so they can be mounted on their own with any store.
import { useEffect, useState } from 'preact/hooks';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: (v: T) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next) {
      const v = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
      if (Object.is(v, value)) return;
      value = v;
      for (const fn of [...subs]) fn(value);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/** Re-render when the selected part of the store changes (shallow compare). */
export function useStore<T, S = T>(store: Store<T>, select: (v: T) => S = (v) => v as unknown as S): S {
  const [sel, setSel] = useState(() => select(store.get()));
  useEffect(() => {
    let last = select(store.get());
    setSel(() => last);
    return store.subscribe((v) => {
      const next = select(v);
      if (!shallowEqual(last, next)) { last = next; setSel(() => next); }
    });
  }, [store]);
  return sel;
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as any)[k], (b as any)[k])) return false;
  return true;
}
