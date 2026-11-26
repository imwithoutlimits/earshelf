import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePrefsForPush, prefsToApply, PREFS_AT, type LocalPref } from './prefs.ts';

const KEYS = ['useServerVoice', 'ttsProvider', 'ttsVoice', 'rate'];
const local = (o: Record<string, LocalPref>) => new Map(Object.entries(o));

test('a newer change on this device goes to the cloud, and a newer cloud setting is kept', () => {
  const cloud = { useServerVoice: false, ttsVoice: 'af_nicole', [PREFS_AT]: { useServerVoice: 100, ttsVoice: 500 } };
  const out = mergePrefsForPush(KEYS, local({ useServerVoice: { value: true, updatedAt: 300 }, ttsVoice: { value: 'bm_george', updatedAt: 200 } }), cloud);
  assert.equal(out.useServerVoice, true);
  assert.equal(out.ttsVoice, 'af_nicole');
  assert.deepEqual(out[PREFS_AT], { useServerVoice: 300, ttsVoice: 500 });
});

test('a device that missed a change cannot put the old value back (the tick box that switched itself off)', () => {
  // Device A ticks the box at 1000 and the cloud learns it.
  let cloud = mergePrefsForPush(KEYS, local({ useServerVoice: { value: true, updatedAt: 1000 } }), { useServerVoice: false, [PREFS_AT]: { useServerVoice: 10 } });
  assert.equal(cloud.useServerVoice, true);
  // Device B still holds the old unticked value from long ago and saves something else.
  cloud = mergePrefsForPush(KEYS, local({ useServerVoice: { value: false, updatedAt: 10 }, rate: { value: 1.2, updatedAt: 1200 } }), cloud);
  assert.equal(cloud.useServerVoice, true, 'the older value does not win');
  assert.equal(cloud.rate, 1.2);
  // Device B then pulls, and gets the tick.
  assert.deepEqual(prefsToApply(KEYS, local({ useServerVoice: { value: false, updatedAt: 10 } }), cloud).map((a) => [a.key, a.value]), [['useServerVoice', true], ['ttsProvider', undefined], ['ttsVoice', undefined], ['rate', 1.2]].filter(([k]) => k === 'useServerVoice' || k === 'rate'));
});

test('a pull never undoes a change made on this device after the cloud copy was written', () => {
  const cloud = { useServerVoice: false, [PREFS_AT]: { useServerVoice: 100 } };
  assert.deepEqual(prefsToApply(KEYS, local({ useServerVoice: { value: true, updatedAt: 250 } }), cloud), []);
});

test('settings this device has never had are taken from the cloud, with their time', () => {
  const out = prefsToApply(KEYS, local({}), { ttsProvider: 'kokoro', ttsVoice: 'af_nicole', other: 1, [PREFS_AT]: { ttsProvider: 40 } });
  assert.deepEqual(out, [{ key: 'ttsProvider', value: 'kokoro', updatedAt: 40 }, { key: 'ttsVoice', value: 'af_nicole', updatedAt: 0 }]);
});

test('older copies without times keep working: the cloud wins when neither side has a time, and a timed change beats an untimed one', () => {
  assert.deepEqual(prefsToApply(KEYS, local({ rate: { value: 1 } }), { rate: 1.5 }), [{ key: 'rate', value: 1.5, updatedAt: 0 }]);
  assert.deepEqual(prefsToApply(KEYS, local({ rate: { value: 1, updatedAt: 5 } }), { rate: 1.5 }), []);
  const out = mergePrefsForPush(KEYS, local({ rate: { value: 1.1, updatedAt: 7 } }), { rate: 1.5 });
  assert.equal(out.rate, 1.1);
  assert.deepEqual(out[PREFS_AT], { rate: 7 });
});

test('the bookkeeping entry is never treated as a setting, and settings this app does not know are kept', () => {
  assert.deepEqual(prefsToApply([...KEYS, PREFS_AT], local({}), { [PREFS_AT]: { rate: 1 } }), []);
  const out = mergePrefsForPush(KEYS, local({ rate: { value: 1, updatedAt: 3 } }), { somethingNew: 'x', [PREFS_AT]: { somethingNew: 9 } });
  assert.equal(out.somethingNew, 'x');
  assert.deepEqual(out[PREFS_AT], { somethingNew: 9, rate: 3 });
});
