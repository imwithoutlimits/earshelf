/** The app-independent parts of offline sync: change queue, status, and paging changes down from the server. Each app supplies its own tables. */
export interface OutboxRow { id?: number; table: string; recordId: string; op: 'put' | 'delete' }
export interface Pending { table: string; recordId: string; op: 'put' | 'delete'; ids: number[] }
/** Many edits to one record become one push of its latest state. */
export function coalesceOutbox(rows: OutboxRow[]): Map<string, Pending> {
  const latest = new Map<string, Pending>();
  for (const o of rows) {
    const k = `${o.table}:${o.recordId}`;
    const e = latest.get(k) ?? { table: o.table, recordId: o.recordId, op: o.op, ids: [] };
    e.op = o.op; if (o.id !== undefined) e.ids.push(o.id); latest.set(k, e);
  }
  return latest;
}

export interface SyncStatus { state: 'off' | 'idle' | 'syncing' | 'offline' | 'error'; lastSyncedAt?: number; error?: string }
export function makeStatusStore() {
  let status: SyncStatus = { state: 'off' };
  const listeners = new Set<() => void>();
  return {
    get: () => status,
    set: (s: SyncStatus) => { status = s; listeners.forEach((l) => l()); },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface PullDeps {
  getClient: () => { from: (t: string) => any } | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  getUid: () => string | null; product: string;
  getSetting: <T>(key: string, fallback: T) => Promise<T>; setSetting: (key: string, value: unknown) => Promise<void>;
  pending: () => Promise<Set<string>>; setSuppress: (v: boolean) => void;
}
/** Pages through rows changed since the last cursor. scoped = the table is shared between apps, so only this app's rows are asked for. */
export function makePullTable(d: PullDeps) {
  return async function pullTable(name: string, apply: (rows: Row[], pending: Set<string>) => Promise<void>, scoped = false) {
    const client = d.getClient(); const uid = d.getUid();
    if (!client || !uid) return;
    const cursorKey = `cursor:${name}`;
    let cursor = await d.getSetting<string>(cursorKey, '1970-01-01T00:00:00Z');
    for (;;) {
      let q = client.from(name).select('*').eq('user_id', uid);
      if (scoped) q = q.eq('product', d.product);
      const { data, error } = await q.gt('updated_at', cursor).order('updated_at', { ascending: true }).limit(500);
      if (error) throw error;
      if (!data.length) return;
      const pending = await d.pending();
      d.setSuppress(true);
      try { await apply(data as Row[], pending); } finally { d.setSuppress(false); }
      cursor = data[data.length - 1].updated_at as string;
      await d.setSetting(cursorKey, cursor);
      if (data.length < 500) return;
    }
  };
}

export const uid = (): string => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);
export const ms = (s: string | null | undefined) => (s ? Date.parse(s) : undefined);
