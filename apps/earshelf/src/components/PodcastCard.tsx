import { useEffect, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { ApiError, apiGet, apiPost } from '../supabase';
import { useUser } from '../auth';
import { usePlan } from '../hooks';
import { UpgradeNote } from './UpgradeNote';

export interface PodcastState {
  feedUrl: string | null;
  episodes: Array<{ id: string; title: string; author: string; ext: 'mp3' | 'm4b'; bytes: number; durationMs: number; publishedAt: string; expiresAt: string }>;
  usage: { count: number; bytes: number; maxCount: number; maxBytes: number; keepDays: number };
}
export const getPodcast = () => apiGet<PodcastState>('/v1/podcast');
export const enablePodcast = () => apiPost<PodcastState>('/v1/podcast/enable', {});
export const addToPodcast = (jobId: string) => apiPost<PodcastState>('/v1/podcast/episodes', { jobId });
const mb = (b: number) => (b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 1);
const say = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong. Try again.');

/** Pro: a private podcast feed. Finished audiobook files can be added to it and played in a podcast app. */
export function PodcastCard() {
  const plan = usePlan(); const user = useUser(); const pro = hasFeature(plan, 'podcast_feed');
  const [st, setSt] = useState<PodcastState | null>(null);
  const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (pro && user) getPodcast().then(setSt).catch((e) => setErr(say(e))); }, [pro, user?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<PodcastState>) => { setBusy(true); setErr(''); setNote(''); try { setSt(await fn()); } catch (e) { setErr(say(e)); } finally { setBusy(false); } };
  const copy = async () => { try { await navigator.clipboard.writeText(st!.feedUrl!); setNote('Address copied.'); } catch { setNote('Press and hold the address to copy it.'); } };

  return (
    <div className="card stack">
      <h2 className="sub">Private podcast feed</h2>
      {!pro ? <UpgradeNote>A private podcast feed of your audiobooks, for Apple Podcasts, Overcast and other podcast apps, is included with Pro.</UpgradeNote>
        : !user ? <p className="hint">Sign in to make a private podcast feed.</p>
        : !st ? (err ? <p role="alert" className="error-text">{err}</p> : <p className="hint">Loading…</p>)
        : !st.feedUrl ? (
          <>
            <p className="hint">Turn your finished audiobook files into a private podcast that only you can follow. Nothing is public.</p>
            <button className="btn primary" disabled={busy} onClick={() => void run(enablePodcast)}>Create my feed</button>
          </>
        ) : (
          <>
            <label className="field">Your private feed address
              <input className="text-input" readOnly value={st.feedUrl} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <div className="row-end"><button className="btn" onClick={() => void copy()}><Copy size={16} aria-hidden /> Copy address</button></div>
            <p className="hint">Add it in your podcast app: <strong>Apple Podcasts</strong>, Library, the three dots, Follow a Show by URL. <strong>Overcast</strong>, the plus button, Add URL. Pocket Casts and most other apps accept it too. Spotify does not accept private feed addresses. Anyone who has this address can listen, so keep it to yourself.</p>
            <h3 className="sub left">Episodes ({st.usage.count} of {st.usage.maxCount}, {mb(st.usage.bytes)} of {st.usage.maxBytes / 1048576} MB)</h3>
            {st.episodes.length === 0 && <p className="hint">Nothing here yet. Create an audiobook file in a book's Natural voice settings, then choose Add to my podcast feed.</p>}
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {st.episodes.map((e) => (
                <li key={e.id} className="row-end" style={{ justifyContent: 'space-between' }}>
                  <span className="grow"><strong>{e.title}</strong><br /><span className="hint">{mb(e.bytes)} MB · removed on {new Date(e.expiresAt).toLocaleDateString()}</span></span>
                  <button className="btn" aria-label={`Remove ${e.title} from the feed`} disabled={busy} onClick={() => void run(() => apiPost<PodcastState>('/v1/podcast/remove', { id: e.id }))}><Trash2 size={16} aria-hidden /></button>
                </li>
              ))}
            </ul>
            <p className="hint">Each episode and its audio file are removed {st.usage.keepDays} days after you add it. Add it again from a new audiobook file any time.</p>
            <button className="btn" disabled={busy} onClick={() => { if (confirm('Make a new feed address? The old one stops working, so you will need to follow the new one in your podcast app.')) void run(() => apiPost<PodcastState>('/v1/podcast/rotate', {})); }}>Make a new address</button>
          </>
        )}
      {err && st && <p role="alert" className="error-text">{err}</p>}
      {note && <p className="hint" role="status">{note}</p>}
    </div>
  );
}
