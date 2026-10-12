/** Small helpers over any Dexie-style tables, so each app keeps its own database but shares the habits (settings, outbox). */
interface KV { get(k: string): Promise<{ key: string; value: unknown } | undefined>; put(r: { key: string; value: unknown }): Promise<unknown> }
interface Outbox { add(r: { table: string; recordId: string; op: 'put' | 'delete'; createdAt: number }): Promise<unknown> }
export const settingsOf = (t: KV) => ({
  async getSetting<T>(key: string, fallback: T): Promise<T> { const r = await t.get(key); return r ? (r.value as T) : fallback; },
  async setSetting(key: string, value: unknown) { await t.put({ key, value }); },
});
export const queueOf = (t: Outbox) => async (table: string, recordId: string, op: 'put' | 'delete' = 'put') => { await t.add({ table, recordId, op, createdAt: Date.now() }); };
