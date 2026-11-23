import { randomBytes } from 'node:crypto';
import { HttpError } from './entitlements.ts';
import { rest, storageRemove } from './supa.ts';

/**
 * Private podcast feed (earshelf Pro). Each person has one secret feed address. Finished audiobook exports can be added to it and then
 * appear in Apple Podcasts, Overcast, Pocket Casts and most other podcast apps that can follow a show by its address.
 * Owner-approved limits: 5 episodes and 300 MB per person; an episode (and its audio file) is removed 60 days after it was added.
 */
export const MAX_EPISODES = 5;
export const MAX_BYTES = 300 * 1024 * 1024;
export const KEEP_DAYS = 60;

export interface Episode { id: string; jobId: string; title: string; author: string; storagePath: string; ext: 'mp3' | 'm4b'; bytes: number; durationMs: number; publishedAt: string; expiresAt: string }

export const newToken = (): string => randomBytes(24).toString('base64url'); // 32 characters, 192 bits: impossible to guess
export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export const expiryFor = (now: Date): string => new Date(now.getTime() + KEEP_DAYS * 86_400_000).toISOString();

export function roomFor(existing: ReadonlyArray<Pick<Episode, 'bytes'>>, bytes: number): { ok: true } | { ok: false; reason: 'count' | 'size' } {
  if (existing.length >= MAX_EPISODES) return { ok: false, reason: 'count' };
  if (existing.reduce((n, e) => n + e.bytes, 0) + bytes > MAX_BYTES) return { ok: false, reason: 'size' };
  return { ok: true };
}

// ---------- the feed itself ----------
export const escapeXml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const rfc822 = (iso: string): string => new Date(iso).toUTCString();
export const mimeOf = (ext: 'mp3' | 'm4b'): string => (ext === 'm4b' ? 'audio/mp4' : 'audio/mpeg');

/** Where podcast apps fetch things from: this server's public address, as the request reached it. */
export function publicBase(headers: Record<string, string | string[] | undefined>, override = ''): string {
  if (override) return override.replace(/\/+$/, '');
  const pick = (h: string | string[] | undefined) => (Array.isArray(h) ? h[0] : h)?.split(',')[0].trim();
  const host = pick(headers['x-forwarded-host']) || pick(headers.host) || 'localhost';
  const proto = pick(headers['x-forwarded-proto']) || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
export const feedUrl = (base: string, token: string) => `${base}/feed/${token}.xml`;
export const episodeUrl = (base: string, token: string, e: Pick<Episode, 'id' | 'ext'>) => `${base}/feed/${token}/${e.id}.${e.ext}`;

export function buildFeedXml(o: { base: string; token: string; title: string; episodes: Episode[] }): string {
  const items = [...o.episodes].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).map((e) => `
    <item>
      <title>${escapeXml(e.title)}</title>
      <description>${escapeXml(e.author ? `${e.title} by ${e.author}. Made with earshelf.` : `${e.title}. Made with earshelf.`)}</description>
      <enclosure url="${escapeXml(episodeUrl(o.base, o.token, e))}" length="${Math.max(0, Math.round(e.bytes))}" type="${mimeOf(e.ext)}"/>
      <guid isPermaLink="false">${escapeXml(e.id)}</guid>
      <pubDate>${rfc822(e.publishedAt)}</pubDate>
      <itunes:duration>${Math.max(1, Math.round(e.durationMs / 1000))}</itunes:duration>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(o.title)}</title>
    <link>${escapeXml(o.base)}</link>
    <description>Your own audiobooks from earshelf. This is a private feed, only for you.</description>
    <language>en</language>
    <atom:link href="${escapeXml(feedUrl(o.base, o.token))}" rel="self" type="application/rss+xml"/>
    <itunes:author>earshelf</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:block>Yes</itunes:block>${items}
  </channel>
</rss>
`;
}

// ---------- storage-independent rules, testable with a fake store ----------
export interface JobInfo { state: string; docId: string; result: { path?: string; ext?: string; bytes?: number; durationMs?: number } | null }
export interface PodcastStore {
  getToken(userId: string): Promise<string | null>;
  setToken(userId: string, token: string): Promise<void>;
  userByToken(token: string): Promise<string | null>;
  list(userId: string): Promise<Episode[]>;
  byId(id: string): Promise<(Episode & { userId: string }) | null>;
  insert(userId: string, e: Omit<Episode, 'id'>): Promise<Episode>;
  remove(userId: string, id: string): Promise<void>;
  job(userId: string, jobId: string): Promise<JobInfo | null>;
  doc(userId: string, docId: string): Promise<{ title: string; author: string } | null>;
}

export async function ensureFeed(store: PodcastStore, userId: string): Promise<string> {
  const have = await store.getToken(userId);
  if (have) return have;
  const t = newToken();
  await store.setToken(userId, t);
  return t;
}

/** Adds a finished audiobook export to the person's feed, if there is room. Adding the same export twice changes nothing. */
export async function addEpisode(store: PodcastStore, userId: string, jobId: string, now = new Date()): Promise<Episode> {
  const job = await store.job(userId, jobId);
  if (!job) throw new HttpError(404, 'no_such_job', 'That audiobook file was not found.');
  const r = job.result;
  if (job.state !== 'ready' || !r?.path || (r.ext !== 'mp3' && r.ext !== 'm4b') || !(r.bytes! > 0)) throw new HttpError(409, 'not_ready', 'Finish creating the audiobook file first, then add it to your feed.');
  const existing = await store.list(userId);
  const again = existing.find((e) => e.jobId === jobId);
  if (again) return again;
  const room = roomFor(existing, r.bytes!);
  if (!room.ok) throw new HttpError(409, 'feed_full', room.reason === 'count' ? `Your feed holds up to ${MAX_EPISODES} episodes. Remove one first.` : `Your feed holds up to ${MAX_BYTES / 1048576} MB. Remove an episode to make room.`);
  const d = await store.doc(userId, job.docId);
  return store.insert(userId, { jobId, title: (d?.title || 'Audiobook').slice(0, 200), author: (d?.author || '').slice(0, 200), storagePath: r.path, ext: r.ext, bytes: r.bytes!, durationMs: r.durationMs ?? 0, publishedAt: now.toISOString(), expiresAt: expiryFor(now) });
}

// ---------- the real database ----------
type Row = { id: string; user_id: string; job_id: string; title: string; author: string | null; storage_path: string; ext: 'mp3' | 'm4b'; bytes: number; duration_ms: number | null; published_at: string; expires_at: string };
const toEpisode = (r: Row): Episode => ({ id: r.id, jobId: r.job_id, title: r.title, author: r.author ?? '', storagePath: r.storage_path, ext: r.ext, bytes: Number(r.bytes), durationMs: Number(r.duration_ms ?? 0), publishedAt: r.published_at, expiresAt: r.expires_at });
const COLS = 'id,user_id,job_id,title,author,storage_path,ext,bytes,duration_ms,published_at,expires_at';

export const supaPodcastStore: PodcastStore = {
  async getToken(userId) { return (await rest<Array<{ token: string }>>(`podcast_feeds?user_id=eq.${userId}&select=token`))[0]?.token ?? null; },
  async setToken(userId, token) { await rest('podcast_feeds?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { user_id: userId, token } }); },
  async userByToken(token) { return TOKEN_RE.test(token) ? ((await rest<Array<{ user_id: string }>>(`podcast_feeds?token=eq.${token}&select=user_id`))[0]?.user_id ?? null) : null; },
  async list(userId) { return (await rest<Row[]>(`podcast_episodes?user_id=eq.${userId}&select=${COLS}&order=published_at.desc`)).map(toEpisode); },
  async byId(id) { const r = (await rest<Row[]>(`podcast_episodes?id=eq.${encodeURIComponent(id)}&select=${COLS}`))[0]; return r ? { ...toEpisode(r), userId: r.user_id } : null; },
  async insert(userId, e) {
    const [r] = await rest<Row[]>('podcast_episodes', { method: 'POST', prefer: 'return=representation', body: { user_id: userId, product: 'earshelf', job_id: e.jobId, title: e.title, author: e.author, storage_path: e.storagePath, ext: e.ext, bytes: e.bytes, duration_ms: e.durationMs, published_at: e.publishedAt, expires_at: e.expiresAt } });
    return toEpisode(r);
  },
  async remove(userId, id) {
    const r = (await rest<Row[]>(`podcast_episodes?id=eq.${encodeURIComponent(id)}&user_id=eq.${userId}&select=${COLS}`))[0];
    if (!r) return;
    await rest(`podcast_episodes?id=eq.${r.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    await storageRemove('audio', [r.storage_path]).catch(() => {}); // the row is gone; a leftover file is cleaned by "delete my content"
  },
  async job(userId, jobId) {
    const r = (await rest<Array<{ state: string; subject_id: string; result: JobInfo['result'] }>>(`processing_jobs?id=eq.${encodeURIComponent(jobId)}&user_id=eq.${userId}&kind=eq.audio_export&select=state,subject_id,result`))[0];
    return r ? { state: r.state, docId: r.subject_id, result: r.result } : null;
  },
  async doc(userId, docId) { const r = (await rest<Array<{ title: string; author: string | null }>>(`documents?id=eq.${encodeURIComponent(docId)}&user_id=eq.${userId}&select=title,author`))[0]; return r ? { title: r.title, author: r.author ?? '' } : null; },
};

/** Removes episodes (and their audio files) once their 60 days are up. Runs on a timer. */
export async function sweepExpired(now = new Date()): Promise<number> {
  const rows = await rest<Row[]>(`podcast_episodes?expires_at=lt.${encodeURIComponent(now.toISOString())}&select=${COLS}&limit=100`);
  if (!rows.length) return 0;
  await storageRemove('audio', rows.map((r) => r.storage_path)).catch(() => {});
  await rest(`podcast_episodes?id=in.(${rows.map((r) => r.id).join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
  return rows.length;
}
export function startPodcastSweeper() {
  const run = () => { void sweepExpired().then((n) => { if (n) console.log(`podcast: removed ${n} expired episode(s)`); }).catch(() => {}); };
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 3600_000).unref();
}
