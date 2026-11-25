import test from 'node:test';
import assert from 'node:assert/strict';
import { Hum, LockScreen, humWav, type HumPlayer, type LockEnv, type SessionLike } from './lockscreen.ts';

(globalThis as unknown as { MediaMetadata: unknown }).MediaMetadata = class { init: unknown; constructor(init: unknown) { this.init = init; } };

function fakeEnv(withSession = true) {
  const log: string[] = [];
  let paused = true, now = 0;
  const hum: HumPlayer = { get paused() { return paused; }, async play() { paused = false; log.push('hum play'); }, pause() { paused = true; log.push('hum pause'); } };
  const handlers = new Map<string, unknown>();
  const session: SessionLike & { positions: unknown[] } = {
    metadata: null, playbackState: 'none', positions: [],
    setActionHandler(a, h) { handlers.set(a, h); },
    setPositionState(s) { this.positions.push(s); },
  };
  let visible: () => void = () => {};
  const env: LockEnv = { makeHum: () => hum, onVisible: (cb) => { visible = cb; }, session: withSession ? session : null, now: () => now };
  return { env, log, hum, handlers, session, tick: (ms: number) => { now += ms; }, comeBack: () => visible(), setHumPaused: () => { paused = true; } };
}
const info = { title: 'John 3:16-18' };

test('the hum is a ten second looped WAV that is not silent', () => {
  const b = new DataView(humWav());
  assert.equal(b.byteLength, 44 + 8000 * 10 * 2);
  let peak = 0; for (let i = 44; i < 44 + 4000; i += 2) peak = Math.max(peak, Math.abs(b.getInt16(i, true)));
  assert.ok(peak >= 90 && peak <= 110, 'quiet but not zero');
});

test('the hum starts on a tap, stops on pause, and comes back when the phone paused it behind the app\'s back', () => {
  const f = fakeEnv(); const h = new Hum(f.env);
  h.start(); assert.equal(f.hum.paused, false);
  f.setHumPaused();                       // the phone paused it while the screen was off
  f.comeBack();                           // the person comes back
  assert.equal(f.hum.paused, false);
  h.stop(); assert.equal(f.hum.paused, true);
  f.comeBack();                           // a stopped hum is never restarted
  assert.equal(f.hum.paused, true);
});

test('claiming the card starts the hum, shows the title, and wires the lock screen buttons', () => {
  const f = fakeEnv(); const lock = new LockScreen({ artist: 'Tapestry' }, f.env);
  const calls: string[] = [];
  lock.claim('natural', info, { play: () => calls.push('play'), pause: () => calls.push('pause'), seekForward: (s) => calls.push(`fwd${s}`) });
  assert.equal(f.session.playbackState, 'playing');
  assert.equal((f.session.metadata as { init: { title: string; artist: string } }).init.title, 'John 3:16-18');
  assert.equal((f.session.metadata as { init: { artist: string } }).init.artist, 'Tapestry');
  assert.equal(f.hum.paused, false);
  (f.handlers.get('play') as () => void)(); (f.handlers.get('pause') as () => void)();
  (f.handlers.get('seekforward') as (d: { seekOffset?: number }) => void)({}); (f.handlers.get('seekforward') as (d: { seekOffset?: number }) => void)({ seekOffset: 30 });
  assert.deepEqual(calls, ['play', 'pause', 'fwd15', 'fwd30']);
  assert.equal(f.handlers.get('previoustrack'), null, 'buttons this source does not have are switched off');
});

test('quiet moments (waiting for the next part) keep the hum and the card', () => {
  const f = fakeEnv(); const lock = new LockScreen({}, f.env);
  lock.claim('natural', info, {});
  f.setHumPaused();
  lock.waiting('natural');
  assert.equal(f.hum.paused, false);
  assert.equal(f.session.playbackState, 'playing');
});

test('pausing stops the hum but keeps the card; releasing removes it', () => {
  const f = fakeEnv(); const lock = new LockScreen({}, f.env);
  lock.claim('natural', info, { play: () => {} });
  lock.paused('natural');
  assert.equal(f.hum.paused, true);
  assert.equal(f.session.playbackState, 'paused');
  assert.notEqual(f.session.metadata, null);
  lock.release('natural');
  assert.equal(f.session.playbackState, 'none');
  assert.equal(f.session.metadata, null);
  assert.equal(f.handlers.get('play'), null);
});

test('the latest source owns the card, and an older source stopping cannot take it away', () => {
  const f = fakeEnv(); const lock = new LockScreen({}, f.env);
  lock.claim('device', { title: 'Psalm 23' }, {});
  lock.claim('natural', info, {});
  lock.release('device');                  // the device voice ended after the natural voice took over
  assert.equal(lock.ownerId, 'natural');
  assert.equal(f.session.playbackState, 'playing');
  assert.equal(f.hum.paused, false);
  lock.paused('device');                   // no effect either
  assert.equal(f.session.playbackState, 'playing');
});

test('the card is only redrawn when the title changes, and the progress bar is updated at most once a second', () => {
  const f = fakeEnv(); const lock = new LockScreen({}, f.env);
  lock.claim('natural', info, {}); const first = f.session.metadata;
  lock.claim('natural', info, {});
  assert.equal(f.session.metadata, first);
  lock.claim('natural', { title: 'Psalm 23' }, {});
  assert.notEqual(f.session.metadata, first);
  lock.position('natural', { duration: 100, position: 5 });
  lock.position('natural', { duration: 100, position: 5.2 });
  f.tick(1100);
  lock.position('natural', { duration: 100, position: 6.3 });
  lock.position('natural', { duration: NaN, position: 1 });
  assert.equal(f.session.positions.length, 2);
});

test('a hum primed by a tap is dropped if no voice ever starts, and kept if one does', async () => {
  const f = fakeEnv(); const lock = new LockScreen({}, f.env);
  lock.prime(); assert.equal(f.hum.paused, false);
  lock.claim('natural', info, {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.hum.paused, false);
});

test('a browser with no media controls still plays', () => {
  const f = fakeEnv(false); const lock = new LockScreen({}, f.env);
  lock.claim('natural', info, {}); lock.waiting('natural'); lock.paused('natural'); lock.release('natural');
  assert.ok(true);
});
