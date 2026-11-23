import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Search as SearchIcon } from 'lucide-react';
import { parseLibraryQuery, searchDocument, searchLibrary, tagCounts, type ReadState } from '@wells/core';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { db } from '../db';
import { useUser } from '../auth';
import { usePlan } from '../hooks';
import { useCapabilities } from '../serverVoice';
import { askLibrary, searchMeaning, type LibraryAnswer, type MeaningHit } from '../semantic';
import { UpgradeNote } from '../components/UpgradeNote';
import { ApiError } from '../supabase';

export function Search({ onOpen, onBack }: { onOpen: (docId: string, blockId?: string) => void; onBack: () => void }) {
  const user = useUser();
  const plan = usePlan();
  const caps = useCapabilities(!!user);
  const docs = useLiveQuery(() => db.docs.toArray(), [], []);
  const progress = useLiveQuery(() => db.progress.toArray(), [], []);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'words' | 'meaning' | 'ask'>('words');
  const byMeaning = mode === 'meaning';
  const [answer, setAnswer] = useState<LibraryAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const advanced = hasFeature(plan, 'tags_search');
  const canAsk = !!user && !!caps?.embeddings && !!caps?.ai && hasFeature(plan, 'library_chat');
  const topTags = useMemo(() => tagCounts(docs).slice(0, 8), [docs]);
  const [hits, setHits] = useState<MeaningHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canMeaning = !!user && !!caps?.embeddings && hasFeature(plan, 'semantic_search');

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    if (advanced) {
      // Plus: tag:, type:, author:, title:, is:, "exact phrase" and -excluded words.
      const states = new Map(progress.map((p) => [p.docId, (p.completed ? 'finished' : p.index > 0 ? 'started' : 'new') as ReadState]));
      const byId = new Map(docs.map((d) => [d.id, d]));
      const found = searchLibrary(docs.map((d) => ({ doc: { id: d.id, title: d.title, author: d.author, tags: d.tags ?? [], sourceType: d.sourceType }, parsed: d.parsed, state: states.get(d.id) ?? 'new' })), parseLibraryQuery(q));
      return found.map((r) => ({ doc: byId.get(r.docId)!, titleHit: r.titleHit, hits: r.hits }));
    }
    return docs.map((d) => {
      const titleHit = `${d.title} ${d.author ?? ''}`.toLowerCase().includes(t);
      return { doc: d, titleHit, hits: searchDocument(d.parsed, q, 3) };
    }).filter((r) => r.titleHit || r.hits.length).sort((a, b) => Number(b.titleHit) - Number(a.titleHit) || b.hits.length - a.hits.length);
  }, [docs, progress, q, advanced]);

  useEffect(() => {
    if (!byMeaning || q.trim().length < 3) { setHits(null); setError(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      setBusy(true); setError(null);
      try { const r = await searchMeaning(q.trim()); if (live) setHits(r); }
      catch (e) {
        if (!live) return;
        setHits(null);
        setError(e instanceof ApiError && e.code === 'upgrade_required' ? 'Searching your whole library by meaning is included with Pro. You can still search by meaning inside a single document from the reader.' : e instanceof Error ? e.message : 'Search failed. Try again.');
      } finally { if (live) setBusy(false); }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [q, byMeaning]);

  const titles = new Map(docs.map((d) => [d.id, d.title]));
  const ask = async () => {
    const question = q.trim();
    if (question.length < 3 || asking) return;
    setAsking(true); setAskError(null); setAnswer(null);
    try { setAnswer(await askLibrary(question)); }
    catch (e) {
      setAskError(e instanceof ApiError ? (e.code === 'upgrade_required' ? 'Talking to your whole library is included with Pro.' : e.code === 'limit_reached' ? 'You have used this month\'s AI questions. They renew next month.' : e.code === 'ai_unavailable' || e.code === 'embeddings_unavailable' ? 'Asking questions is not switched on for this server yet.' : e.message) : 'Could not reach the server. Check your connection and try again.');
    } finally { setAsking(false); }
  };
  const grouped = useMemo(() => {
    const m = new Map<string, MeaningHit[]>();
    (hits ?? []).forEach((h) => m.set(h.documentId, [...(m.get(h.documentId) ?? []), h]));
    return [...m.entries()];
  }, [hits]);

  return (
    <section className="page">
      <header className="page-head"><button className="icon-btn" onClick={onBack} aria-label="Close search"><ArrowLeft size={22} /></button><h1>Search</h1></header>
      <div className="search-box">
        <SearchIcon size={20} aria-hidden />
        <input className="text-input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === 'ask' ? 'Ask a question about what you have saved' : byMeaning ? 'Describe what you are looking for' : 'Search titles and text across your library'} aria-label="Search your library" />
      </div>
      {(canMeaning || canAsk) && (
        <div className="seg search-modes" role="group" aria-label="How to search">
          <button type="button" className="seg-btn wide" aria-pressed={mode === 'words'} onClick={() => setMode('words')}>Words</button>
          {canMeaning && <button type="button" className="seg-btn wide" aria-pressed={mode === 'meaning'} onClick={() => setMode('meaning')}>Meaning</button>}
          {canAsk && <button type="button" className="seg-btn wide" aria-pressed={mode === 'ask'} onClick={() => setMode('ask')}>Ask</button>}
        </div>
      )}
      {mode === 'words' && advanced && topTags.length > 0 && (
        <div className="tag-filter" role="group" aria-label="Search within a tag">
          {topTags.map(({ tag }) => <button key={tag} type="button" className="tag-chip" onClick={() => setQ((cur) => `${cur.trim()} tag:${tag.includes(' ') ? `"${tag}"` : tag}`.trim())}>{tag}</button>)}
        </div>
      )}
      {mode === 'words' && !advanced && <UpgradeNote>Filter by tag, type or author, and search exact phrases, with Plus.</UpgradeNote>}
      {mode === 'words' && advanced && <p className="hint">Try <code>tag:history</code>, <code>type:pdf</code>, <code>author:smith</code>, <code>is:unfinished</code>, <code>"exact phrase"</code> or <code>-word</code> to leave something out.</p>}

      {mode === 'ask' ? (
        <div className="stack">
          <button type="button" className="btn primary" disabled={asking || q.trim().length < 3} onClick={() => void ask()}>{asking ? 'Reading your library…' : 'Ask'}</button>
          {askError && <p role="alert" className="error-text">{askError}</p>}
          {!answer && !asking && !askError && <p className="hint">Ask something like “What did I save about sleep and memory?”. The answer comes only from your own documents, and shows where each part was found.</p>}
          {answer && (
            <div className="card stack" role="status">
              <p>{answer.answer}</p>
              {answer.citations.length > 0 && (
                <>
                  <h3 className="sub">From your library</h3>
                  <ul className="results grouped">
                    {answer.citations.map((c) => <li key={c.documentId + c.blockId}><button type="button" className="link-btn snippet" onClick={() => onOpen(c.documentId, c.blockId)}><strong>{c.documentTitle}{c.sectionTitle ? ` · ${c.sectionTitle}` : ''}.</strong> {c.snippet}…</button></li>)}
                  </ul>
                </>
              )}
              <p className="hint">AI can make mistakes. Open the passages above to check.</p>
            </div>
          )}
        </div>
      ) : q.trim().length < 2 ? (
        <div className="empty"><p>{byMeaning ? 'Describe an idea and earshelf finds the passages about it, even when the words differ.' : 'Search finds exact words and phrases in every document on this device.'}</p></div>
      ) : byMeaning ? (
        <>
          {busy && <p className="hint" role="status">Searching…</p>}
          {error && <p role="alert" className="error-text">{error}</p>}
          {!busy && !error && hits && grouped.length === 0 && <div className="empty"><p>Nothing close to “{q.trim()}”. Try describing it differently, or wait a moment if you just added documents, since new ones are prepared in the background.</p></div>}
          <ul className="results grouped">
            {grouped.map(([docId, hs]) => (
              <li key={docId}>
                <button className="link-btn strong" onClick={() => onOpen(docId)}>{titles.get(docId) ?? 'Document'}</button>
                {hs.map((h) => <button key={h.blockId + h.snippet.slice(0, 12)} className="link-btn snippet" onClick={() => onOpen(docId, h.blockId)}><strong>{h.sectionTitle}.</strong> {h.snippet}…</button>)}
              </li>
            ))}
          </ul>
        </>
      ) : results.length === 0 ? (
        <div className="empty"><p>No matches for “{q.trim()}”. Try fewer or different words.</p></div>
      ) : (
        <ul className="results grouped">
          {results.map(({ doc, hits: hs }) => (
            <li key={doc.id}>
              <button className="link-btn strong" onClick={() => onOpen(doc.id)}>{doc.title}</button>
              {hs.map((h) => <button key={h.blockId} className="link-btn snippet" onClick={() => onOpen(doc.id, h.blockId)}>{h.snippet}</button>)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
