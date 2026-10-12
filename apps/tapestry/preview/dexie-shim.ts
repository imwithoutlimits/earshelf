// Preview only: an in-memory stand-in for Dexie so the real app code runs in a single HTML page with no install. Production uses the real Dexie.
const listeners = new Set<() => void>(); const bump = () => listeners.forEach((l) => l());
export const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
type R = Record<string, any>;
const fieldsOf = (idx: string) => (idx.startsWith('[') ? idx.slice(1, -1).split('+') : [idx]);
const val = (r: R, idx: string) => { const f = fieldsOf(idx); return f.length > 1 ? f.map((x) => r[x]) : r[f[0]]; };
class Coll { constructor(private rows: () => R[], private t: Table) {}
  toArray = async () => this.rows().map((r) => ({ ...r })); count = async () => this.rows().length; first = async () => this.rows()[0];
  each = async (fn: (r: R) => void) => { this.rows().forEach(fn); }; filter = (fn: (r: R) => boolean) => new Coll(() => this.rows().filter(fn), this.t);
  delete = async () => { this.rows().forEach((r) => this.t.m.delete(this.t.keyOf(r))); bump(); };
  modify = async (fn: (r: R) => void) => { this.rows().forEach((r) => { const live = this.t.m.get(this.t.keyOf(r))!; fn(live); }); bump(); }; }
class Table { m = new Map<any, R>(); auto = 1; key: string; constructor(spec: string) { this.key = spec.split(',')[0].trim(); }
  keyOf(r: R) { return r[this.key.replace('++', '')]; }
  get = async (k: any) => { const r = this.m.get(k); return r ? { ...r } : undefined; };
  put = async (r: R) => { const k = this.key.startsWith('++') ? (r[this.key.slice(2)] ??= this.auto++) : this.keyOf(r); this.m.set(k, { ...r }); bump(); return k; };
  add = async (r: R) => this.put(r); bulkPut = async (rs: R[]) => { for (const r of rs) await this.put(r); }; bulkAdd = async (rs: R[]) => { for (const r of rs) await this.put(r); };
  update = async (k: any, ch: R) => { const r = this.m.get(k); if (r) Object.assign(r, ch); bump(); return r ? 1 : 0; };
  delete = async (k: any) => { this.m.delete(k); bump(); }; clear = async () => { this.m.clear(); bump(); }; count = async () => this.m.size;
  toArray = async () => [...this.m.values()].map((r) => ({ ...r })); filter = (fn: (r: R) => boolean) => new Coll(() => [...this.m.values()].filter(fn), this);
  where = (idx: string) => ({ equals: (v: any) => new Coll(() => [...this.m.values()].filter((r) => JSON.stringify(val(r, idx)) === JSON.stringify(v)), this) }); }
export default class Dexie { constructor(_n: string) {} version(_v: number) { return { stores: (s: Record<string, string>) => { for (const [k, spec] of Object.entries(s)) (this as R)[k] = new Table(spec); } }; } }
export type { Table };
