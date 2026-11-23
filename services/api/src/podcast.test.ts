import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEP_DAYS, MAX_BYTES, MAX_EPISODES, TOKEN_RE, addEpisode, buildFeedXml, ensureFeed, escapeXml, expiryFor, newToken, publicBase, roomFor, type Episode, type PodcastStore } from './podcast.ts';

const MB = 1024 * 1024;
const ep = (n: number, over: Partial<Episode> = {}): Episode => ({ id: `00000000-0000-4000-8000-00000000000${n}`, jobId: `job-${n}`, title: `Book ${n}`, author: 'A. Writer', storagePath: `u/d${n}/exports/${n}.mp3`, ext: 'mp3', bytes: 50 * MB, durationMs: 3_600_000, publishedAt: `2026-11-0${n}T10:00:00.000Z`, expiresAt: '2027-01-01T00:00:00.000Z', ...over });

function fakeStore(o: { episodes?: Episode[]; job?: Parameters<PodcastStore['job']> extends never ? never : unknown } = {}) {
  const eps = [...(o.episodes ?? [])];
  let token: string | null = null;
  let jobInfo: Awaited<ReturnType<PodcastStore['job']>> = { state: 'ready', docId: 'd9', result: { path: 'u/d9/exports/9.m4b', ext: 'm4b', bytes: 40 * MB, durationMs: 7_200_000 } };
  const store: PodcastStore = {
    getToken: async () => token, setToken: async (_u, t) => { token = t; }, userByToken: async (t) => (t === token ? 'u' : null),
    list: async () => [...eps], byId: async (id) => { const e = eps.find((x) => x.id === id); return e ? { ...e, userId: 'u' } : null; },
    insert: async (_u, e) => { const row = { ...e, id: `00000000-0000-4000-8000-0000000000${String(eps.length + 10)}` }; eps.push(row); return row; },
    remove: async (_u, id) => { const i = eps.findIndex((x) => x.id === id); if (i >= 0) eps.splice(i, 1); },
    job: async () => jobInfo, doc: async () => ({ title: 'The Long Book', author: 'Ann Author' }),
  };
  return { store, eps, setJob: (j: typeof jobInfo) => { jobInfo = j; } };
}

test('the secret address is long, random and url-safe', () => {
  const a = newToken(), b = newToken();
  assert.ok(TOKEN_RE.test(a) && a !== b);
  assert.equal(a.length, 32);
});

test('limits: 5 episodes and 300 MB per person, 60 days to keep', () => {
  assert.deepEqual([MAX_EPISODES, MAX_BYTES / MB, KEEP_DAYS], [5, 300, 60]);
  assert.deepEqual(roomFor([ep(1), ep(2)], 100 * MB), { ok: true });
  assert.deepEqual(roomFor([ep(1), ep(2), ep(3), ep(4), ep(5)].map((e) => ({ ...e, bytes: 1 })), 1), { ok: false, reason: 'count' });
  assert.deepEqual(roomFor([{ bytes: 250 * MB }], 60 * MB), { ok: false, reason: 'size' });
  assert.deepEqual(roomFor([{ bytes: 250 * MB }], 50 * MB), { ok: true }, 'exactly at the limit is allowed');
  assert.equal(expiryFor(new Date('2026-11-22T00:00:00Z')), '2027-01-21T00:00:00.000Z');
});

test('the feed is valid podcast XML: private, newest first, safe text, real sizes', () => {
  const xml = buildFeedXml({ base: 'https://api.example.com', token: 'T'.repeat(32), title: 'My <audiobooks> & "more"', episodes: [ep(1), ep(3, { title: 'Tom & Jerry <the book>', ext: 'm4b' }), ep(2)] });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<itunes:block>Yes</itunes:block>'), 'asks directories not to list it');
  assert.ok(xml.includes('<title>My &lt;audiobooks&gt; &amp; &quot;more&quot;</title>'));
  assert.ok(xml.includes('Tom &amp; Jerry &lt;the book&gt;') && !xml.includes('<the book>'));
  assert.ok(xml.indexOf('Book 3'.replace('Book 3', 'Tom &amp; Jerry')) < xml.indexOf('Book 2') && xml.indexOf('Book 2') < xml.indexOf('Book 1'), 'newest first');
  assert.ok(xml.includes(`<enclosure url="https://api.example.com/feed/${'T'.repeat(32)}/${ep(3).id}.m4b" length="${50 * MB}" type="audio/mp4"/>`));
  assert.ok(xml.includes('type="audio/mpeg"'));
  assert.ok(xml.includes('<itunes:duration>3600</itunes:duration>'));
  assert.ok(xml.includes('<pubDate>Sun, 01 Nov 2026 10:00:00 GMT</pubDate>'));
  assert.ok(xml.includes(`href="https://api.example.com/feed/${'T'.repeat(32)}.xml" rel="self"`));
  assert.equal(escapeXml('a\u0001b'), 'ab', 'control characters that break XML are removed');
});

test('public address comes from the proxy headers, or from the setting', () => {
  assert.equal(publicBase({ host: 'api.1-2-3-4.sslip.io:10000', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api.1-2-3-4.sslip.io' }), 'https://api.1-2-3-4.sslip.io');
  assert.equal(publicBase({ host: 'localhost:10000' }), 'http://localhost:10000');
  assert.equal(publicBase({ host: 'x' }, 'https://api.mysite.com/'), 'https://api.mysite.com');
  assert.equal(publicBase({ host: 'api.example.com' }), 'https://api.example.com');
});

test('a feed is created once and keeps its address', async () => {
  const { store } = fakeStore();
  const a = await ensureFeed(store, 'u'), b = await ensureFeed(store, 'u');
  assert.equal(a, b);
});

test('a finished audiobook can be added, and adding it again changes nothing', async () => {
  const { store, eps } = fakeStore();
  const first = await addEpisode(store, 'u', 'job-9', new Date('2026-11-22T12:00:00Z'));
  assert.equal(first.title, 'The Long Book');
  assert.equal(first.expiresAt, expiryFor(new Date('2026-11-22T12:00:00Z')));
  const again = await addEpisode(store, 'u', 'job-9');
  assert.equal(again.id, first.id);
  assert.equal(eps.length, 1);
});

test('an unfinished or unknown audiobook is refused', async () => {
  const f = fakeStore();
  f.setJob({ state: 'generating', docId: 'd', result: null });
  await assert.rejects(addEpisode(f.store, 'u', 'j'), /Finish creating/);
  f.setJob(null);
  await assert.rejects(addEpisode(f.store, 'u', 'j'), /not found/);
  f.setJob({ state: 'ready', docId: 'd', result: { path: 'p', ext: 'wav', bytes: 10 } });
  await assert.rejects(addEpisode(f.store, 'u', 'j'), /Finish creating/, 'only mp3 and m4b are accepted');
});

test('a full feed says why, in plain words', async () => {
  const full = fakeStore({ episodes: [1, 2, 3, 4, 5].map((n) => ep(n, { bytes: 1 })) });
  await assert.rejects(addEpisode(full.store, 'u', 'job-9'), /up to 5 episodes/);
  const big = fakeStore({ episodes: [ep(1, { bytes: 290 * MB })] });
  await assert.rejects(addEpisode(big.store, 'u', 'job-9'), /300 MB/);
});
