import { useEffect, useState } from 'react';
import { Sheet } from '@wells/ui';
import { classifyQuery, formatReference, parseRefKey, refKey } from '@wells/scripture';
import { addToWell, loadPassage, type Passage } from '../data';
import { Icon } from '../ui';
import { run } from './search';

/**
 * Add passages to a well from inside the well: type a reference (John 3:16-18, Psalm 23), a phrase or a feeling, and tap the plus.
 * Every result stays on screen with its own button, so several can be added one after another.
 */
export function AddPassageSheet({ wellId, wellName, have, onClose }: { wellId: string; wellName: string; have: string[]; onClose: () => void }) {
  const [q, setQ] = useState(''); const [hits, setHits] = useState<string[] | null>(null); const [chapters, setChapters] = useState<{ code: string; n: number } | null>(null);
  const [texts, setTexts] = useState<Record<string, Passage | null>>({}); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const [added, setAdded] = useState<Set<string>>(() => new Set(have));
  const find = async (text = q) => {
    const t = text.trim(); if (t.length < 2) return;
    setBusy(true); setMsg(''); setHits(null); setChapters(null);
    try {
      const c = classifyQuery(t);
      if (c.kind === 'reference' && c.ref) { setHits([refKey(c.ref)]); return; }
      const r = await run(t);
      if (r.kind === 'book' && r.chapters) { setChapters(r.chapters); return; }
      setHits(r.hits.map((h) => h.key));
      if (!r.hits.length) setMsg('Nothing matched. Try a reference like Psalm 23, words from a passage, or how you feel.');
    } catch { setMsg('Could not search just now. Check your connection and try again.'); } finally { setBusy(false); }
  };
  useEffect(() => {
    let live = true; setTexts({});
    void (async () => { for (const k of hits ?? []) { const p = await loadPassage(k).catch(() => null); if (!live) return; setTexts((cur) => ({ ...cur, [k]: p })); } })();
    return () => { live = false; };
  }, [hits]);
  const add = async (key: string) => {
    try { await addToWell(wellId, key); setAdded((cur) => new Set(cur).add(key)); setMsg(''); }
    catch { setMsg('Could not add that passage. Try again.'); }
  };
  const title = (k: string) => { const r = parseRefKey(k); return r ? formatReference(r) : k; };
  return (
    <Sheet label="Add a passage" onClose={onClose}>
      <h2>Add to {wellName}</h2>
      <div className="row" style={{ gap: 8 }}>
        <input className="text-input grow" aria-label="Passage, phrase or feeling" placeholder="John 3:16, a phrase, or how you feel" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void find(); }} enterKeyHint="search" />
        <button className="btn primary" disabled={busy || q.trim().length < 2} onClick={() => void find()}>{busy ? 'Searching…' : 'Find'}</button>
      </div>
      {chapters && <><p className="mut">Choose a chapter.</p><div className="pills">{Array.from({ length: chapters.n }, (_, i) => <button key={i} className="pill" onClick={() => { setChapters(null); setHits([`${chapters.code}.${i + 1}`]); }}>{i + 1}</button>)}</div></>}
      {msg && <p className="sm mut" role="status">{msg}</p>}
      {hits?.map((k) => {
        const p = texts[k]; const done = added.has(k);
        return (
          <div key={k} className="row" style={{ alignItems: 'flex-start', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div className="grow"><div className="b" style={{ fontSize: 15 }}>{title(k)}</div><div className="serif" style={{ fontSize: 18, lineHeight: 1.35 }}>{!(k in texts) ? 'Loading…' : p ? (p.text.length > 160 ? `${p.text.slice(0, 157).replace(/\s+\S*$/, '')}…` : p.text) : 'This passage is not on this device yet. You can still add it.'}</div></div>
            <button className="icon-btn" aria-label={done ? `${title(k)} is in this well` : `Add ${title(k)}`} disabled={done} onClick={() => void add(k)} style={done ? { background: 'var(--acc)', color: 'var(--fg)', borderColor: 'var(--acc)' } : undefined}>{done ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : <Icon n="plus" />}</button>
          </div>
        );
      })}
      <button className="btn big" onClick={onClose}>Done</button>
    </Sheet>
  );
}
