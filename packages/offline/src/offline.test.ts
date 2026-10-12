import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesceOutbox, makeStatusStore, makePullTable, settingsOf, queueOf } from './index.ts';

test('many edits to one record become one push of the latest operation', () => {
  const m = coalesceOutbox([{ id: 1, table: 'wells', recordId: 'a', op: 'put' }, { id: 2, table: 'wells', recordId: 'a', op: 'put' }, { id: 3, table: 'wells', recordId: 'a', op: 'delete' }, { id: 4, table: 'notes', recordId: 'a', op: 'put' }]);
  assert.equal(m.size, 2); const w = m.get('wells:a')!; assert.equal(w.op, 'delete'); assert.deepEqual(w.ids, [1, 2, 3]);
});
test('status store notifies subscribers', () => {
  const s = makeStatusStore(); let n = 0; const off = s.subscribe(() => n++);
  s.set({ state: 'syncing' }); s.set({ state: 'idle', lastSyncedAt: 5 }); off(); s.set({ state: 'error' });
  assert.equal(n, 2); assert.equal(s.get().state, 'error');
});
test('pull pages by cursor, scopes shared tables to the app, and holds back edits that have not been pushed', async () => {
  const kv = new Map<string, unknown>(); const { getSetting, setSetting } = { getSetting: async <T,>(k: string, f: T) => (kv.has(k) ? (kv.get(k) as T) : f), setSetting: async (k: string, v: unknown) => { kv.set(k, v); } };
  const pages = [Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, updated_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` })), [{ id: 'last', updated_at: '2026-02-01T00:00:00Z' }]];
  const asked: Array<{ eq: Array<[string, string]>; gt: string }> = []; let call = 0;
  const client = { from: () => { const rec = { eq: [] as Array<[string, string]>, gt: '' }; const q: any = { select: () => q, eq: (k: string, v: string) => { rec.eq.push([k, v]); return q; }, gt: (_k: string, v: string) => { rec.gt = v; asked.push(rec); return q; }, order: () => q, limit: async () => ({ data: pages[call++] ?? [], error: null }) }; return q; } };
  const applied: string[] = []; let suppress = false; const seenSuppress: boolean[] = [];
  const pull = makePullTable({ getClient: () => client, getUid: () => 'u1', product: 'tapestry', getSetting, setSetting, pending: async () => new Set(['wells:r1']), setSuppress: (v) => { suppress = v; } });
  await pull('wells', async (rows, pending) => { seenSuppress.push(suppress); for (const r of rows) if (!pending.has(`wells:${r.id}`)) applied.push(r.id); }, true);
  assert.equal(applied.length, 500); assert.ok(!applied.includes('r1')); assert.deepEqual(seenSuppress, [true, true]); assert.equal(suppress, false);
  assert.deepEqual(asked[0].eq, [['user_id', 'u1'], ['product', 'tapestry']]); assert.equal(asked[0].gt, '1970-01-01T00:00:00Z'); assert.equal(await getSetting('cursor:wells', ''), '2026-02-01T00:00:00Z');
});
test('settings and queue helpers work over any table-like object', async () => {
  const rows = new Map<string, { key: string; value: unknown }>(); const s = settingsOf({ get: async (k) => rows.get(k), put: async (r) => { rows.set(r.key, r); } });
  assert.equal(await s.getSetting('theme', 'dark'), 'dark'); await s.setSetting('theme', 'light'); assert.equal(await s.getSetting('theme', 'dark'), 'light');
  const added: unknown[] = []; await queueOf({ add: async (r) => { added.push(r); } })('wells', 'x'); assert.equal((added[0] as { op: string }).op, 'put');
});
