import { useEffect, useState } from 'react';
import { subscribe } from './dexie-shim';
export function useLiveQuery<T, D = undefined>(fn: () => Promise<T> | T, deps: unknown[] = [], def?: D): T | D {
  const [v, setV] = useState<T | D>(def as D); const [n, setN] = useState(0);
  useEffect(() => subscribe(() => setN((x) => x + 1)), []);
  useEffect(() => { let ok = true; void Promise.resolve(fn()).then((r) => { if (ok) setV(r); }); return () => { ok = false; }; }, [...deps, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
