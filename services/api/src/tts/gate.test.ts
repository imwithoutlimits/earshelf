import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGate } from './gate.ts';

const deferred = () => { let go!: () => void; const p = new Promise<void>((r) => { go = r; }); return { p, go }; };

test('Pro goes first, then normal, then Free preview, whatever the arrival order', async () => {
  const gate = makeGate(1);
  const order: string[] = [];
  const hold = deferred();
  const first = gate.run('normal', async () => { await hold.p; order.push('first'); });
  const low = gate.run('low', async () => { order.push('low'); });
  const normal = gate.run('normal', async () => { order.push('normal'); });
  const high = gate.run('high', async () => { order.push('high'); });
  assert.deepEqual(gate.stats(), { running: 1, waiting: 3 });
  hold.go();
  await Promise.all([first, low, normal, high]);
  assert.deepEqual(order, ['first', 'high', 'normal', 'low']);
});

test('the same priority is served in arrival order', async () => {
  const gate = makeGate(1);
  const order: number[] = [];
  const hold = deferred();
  const a = gate.run('high', async () => { await hold.p; });
  const rest = [1, 2, 3].map((n) => gate.run('high', async () => { order.push(n); }));
  hold.go();
  await Promise.all([a, ...rest]);
  assert.deepEqual(order, [1, 2, 3]);
});

test('nobody waits for ever: someone who waited too long is served before newer Pro requests', async () => {
  let t = 0;
  const gate = makeGate(1, { maxWaitMs: 30_000, now: () => t });
  const order: string[] = [];
  const hold = deferred();
  const busy = gate.run('high', async () => { await hold.p; });
  const old = gate.run('low', async () => { order.push('old low'); });
  t = 31_000;
  const fresh = gate.run('high', async () => { order.push('fresh high'); });
  hold.go();
  await Promise.all([busy, old, fresh]);
  assert.deepEqual(order, ['old low', 'fresh high']);
});

test('never more than the allowed number run at once, and every task finishes', async () => {
  const gate = makeGate(2);
  let live = 0, peak = 0, done = 0;
  await Promise.all(Array.from({ length: 8 }, () => gate.run('normal', async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; done++; })));
  assert.equal(peak, 2);
  assert.equal(done, 8);
  assert.deepEqual(gate.stats(), { running: 0, waiting: 0 });
});

test('a failing task frees its place and does not block the line', async () => {
  const gate = makeGate(1);
  const bad = gate.run('normal', async () => { throw new Error('engine down'); });
  const good = gate.run('normal', async () => 'ok');
  await assert.rejects(bad, /engine down/);
  assert.equal(await good, 'ok');
  await assert.rejects(gate.run('normal', () => { throw new Error('sync boom'); }), /sync boom/);
  assert.equal(await gate.run('low', async () => 7), 7);
});

test('a slot count that makes no sense falls back to one', async () => {
  for (const n of [0, -3, Number.NaN]) assert.equal(await makeGate(n).run('normal', async () => 'ok'), 'ok');
});
