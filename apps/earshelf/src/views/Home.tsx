import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, LayoutGrid, Library, List as ListIcon, MoreHorizontal, Play, Plus, Search as SearchIcon, Trash2, X } from 'lucide-react';
import { chapterAtFraction } from '@wells/core';
import { checkUsage } from '@wells/billing/src/plans.ts';
import { db, deleteDocument, queueSync, uid, type DocRecord } from '../db';
import { formatDuration, player, usePlan, useSetting, type HomeLayout } from '../hooks';
import { Sheet } from '../components/Sheet';
import { DocCover } from '../components/DocCover';
import { DueCard } from './Review';

export function useLibrary() {
  return useLiveQuery(async () => {
    const [docs, progress] = await Promise.all([db.docs.toArray(), db.progress.toArray()]);
    const pm = new Map(progress.map((p) => [p.docId, p]));
    return docs.map((d) => ({ doc: d, progress: pm.get(d.id) })).sort((a, b) => (b.doc.lastPlayedAt ?? b.doc.createdAt) - (a.doc.lastPlayedAt ?? a.doc.createdAt));
  }, [], []);
}

export function progressFraction(d: DocRecord, p?: { index: number; total: number; completed: boolean }): number {
  if (!p) return 0;
  if (p.completed) return 1;
  return p.total > 1 ? p.index / (p.total - 1) : 0;
}

export function DocCard({ doc, progress, onOpen, onMenu }: { doc: DocRecord; progress?: { index: number; total: number; completed: boolean }; onOpen: () => void; onMenu?: () => void }) {
  const f = progressFraction(doc, progress);
  return (
    <div className="doc-card">
      <button className="doc-main" onClick={onOpen}>
        <span className="doc-type" aria-hidden>{doc.sourceType.toUpperCase().slice(0, 4)}</span>
        <span className="doc-text">
          <span className="doc-title">{doc.title}</span>
          <span className="doc-meta">{[doc.author, formatDuration(doc.durationMin * 60), progress?.completed ? 'Finished' : f > 0 ? `${Math.round(f * 100)}% listened` : null].filter(Boolean).join(' · ')}</span>
          <span className="bar" aria-hidden><span style={{ width: `${f * 100}%` }} /></span>
        </span>
      </button>
      {onMenu && <button className="icon-btn" onClick={onMenu} aria-label={`Options for ${doc.title}`}><MoreHorizontal size={20} /></button>}
    </div>
  );
}

export function WellPicker({ docId, onClose }: { docId: string; onClose: () => void }) {
  const wells = useLiveQuery(() => db.wells.filter((w) => w.kind !== 'smart').toArray(), [], []);
  const items = useLiveQuery(() => db.wellItems.where('docId').equals(docId).toArray(), [docId], []);
  const doc = useLiveQuery(() => db.docs.get(docId), [docId]);
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [saved, setSaved] = useState(false);
  const touched = useRef(false); // once the person has typed, a late-arriving document must not overwrite it
  useEffect(() => { if (doc && !touched.current) { setTitle(doc.title); setAuthor(doc.author ?? ''); } }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async (wellId: string) => {
    const existing = items.find((i) => i.wellId === wellId);
    if (existing) await db.wellItems.delete(existing.id);
    else await db.wellItems.add({ id: uid(), wellId, docId, position: Date.now() });
  };
  const changed = !!doc && (title.trim() !== doc.title || (author.trim() || undefined) !== doc.author);
  const saveDetails = async () => {
    const t = title.trim();
    if (!doc || !t) return;
    const a = author.trim() || undefined;
    await db.docs.update(docId, { title: t, author: a, parsed: { ...doc.parsed, title: t, author: a }, updatedAt: Date.now() });
    await queueSync('documents', docId);
    setSaved(true);
  };
  return (
    <Sheet onClose={onClose} label="Document options">
        <header className="sheet-head"><h2>{doc?.title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={22} /></button></header>
        <h3 className="sub">Details</h3>
        <div className="stack">
          <label className="field">Title
            <input className="text-input" value={title} onChange={(e) => { touched.current = true; setTitle(e.target.value); setSaved(false); }} placeholder="Give it a title" />
          </label>
          <label className="field">Author
            <input className="text-input" value={author} onChange={(e) => { touched.current = true; setAuthor(e.target.value); setSaved(false); }} placeholder="Optional" />
          </label>
          <div className="row-end">
            {saved && !changed && <span className="hint grow" role="status">Saved</span>}
            <button className="btn primary" disabled={!changed || !title.trim()} onClick={() => void saveDetails()}>Save details</button>
          </div>
        </div>
        <h3 className="sub">Wells</h3>
        <ul className="check-list">
          {wells.map((w) => (
            <li key={w.id}><label><input type="checkbox" checked={items.some((i) => i.wellId === w.id)} onChange={() => void toggle(w.id)} /> {w.name}</label></li>
          ))}
        </ul>
        {!confirm ? (
          <button className="btn danger" onClick={() => setConfirm(true)}><Trash2 size={16} /> Delete document</button>
        ) : (
          <div className="error-box"><p>Delete this document, its notes, highlights and progress from this device?</p>
            <div className="row-end"><button className="btn" onClick={() => setConfirm(false)}>Keep it</button><button className="btn danger" onClick={() => void deleteDocument(docId).then(onClose)}>Delete</button></div></div>
        )}
    </Sheet>
  );
}

type LibItem = ReturnType<typeof useLibrary>[number];
const pad2 = (n: number) => String(n).padStart(2, '0');
const minutesLeft = (sec: number) => Math.max(1, Math.round(sec / 60));
/** "3 h 01 min", or "42 min" under an hour. */
const leftWords = (sec: number) => { const tm = minutesLeft(sec); return tm >= 60 ? `${Math.floor(tm / 60)} h ${pad2(tm % 60)} min` : `${tm} min`; };
const typeKey = (t: DocRecord['sourceType']) => (t === 'pdf' || t === 'docx' || t === 'epub' ? t : 'other');
const typeLabel = (t: DocRecord['sourceType']) => ({ pdf: 'PDF', docx: 'DOCX', epub: 'EPUB', md: 'Notes', txt: 'Text', html: 'Page', image: 'Scan', url: 'Article', paste: 'Pasted' }[t]);

/** The short line under a cover or in a row: how long it is, how much is left, or that it is finished. */
function status(doc: DocRecord, progress: LibItem['progress']): string {
  const f = progressFraction(doc, progress);
  if (progress?.completed) return 'Finished';
  if (f > 0) return `${formatDuration(doc.durationMin * 60 * (1 - f))} left`;
  return formatDuration(doc.durationMin * 60);
}

const LAYOUTS: Array<{ id: HomeLayout; label: string; Icon: typeof Library }> = [
  { id: 'shelf', label: 'Shelf view', Icon: Library },
  { id: 'grid', label: 'Grid view', Icon: LayoutGrid },
  { id: 'list', label: 'List view', Icon: ListIcon },
];

/** Pick up where you left off. One look for every theme: chapter, big title, progress by chapter, time left, Resume. */
function Hero({ item, starting, onResume }: { item: LibItem; starting: boolean; onResume: () => void }) {
  const { doc, progress } = item;
  const f = progressFraction(doc, progress);
  const left = doc.durationMin * 60 * (1 - f);
  const chapter = useMemo(() => chapterAtFraction(doc.parsed, f), [doc.parsed, f]);
  const segments = Math.min(14, Math.max(4, chapter?.total ?? 10));
  return (
    <section className="hero" aria-label="Continue listening">
      <p className="eyebrow">{chapter ? `Chapter ${chapter.index} of ${chapter.total}` : typeLabel(doc.sourceType)}</p>
      <h2 className="hero-title">{doc.title}</h2>
      <span className="segs" aria-hidden>{Array.from({ length: segments }, (_, i) => { const fill = Math.min(1, Math.max(0, f * segments - i)); return <span key={i}><span style={{ width: `${fill * 100}%` }} /></span>; })}</span>
      <p className="hero-meta between"><span>{leftWords(left)} left</span>{doc.author && <span>{doc.author}</span>}</p>
      <span className="hero-actions">
        {/* prime() must run inside the tap itself: browsers only allow sound and speech to start from a real tap. */}
        <button className="resume-pill" disabled={starting} onClick={() => { player.prime(); onResume(); }}><Play size={18} fill="currentColor" aria-hidden /> {starting ? 'Starting…' : 'Resume'}</button>
      </span>
    </section>
  );
}

function Row({ item, onOpen, onMenu }: { item: LibItem; onOpen: () => void; onMenu: () => void }) {
  const { doc, progress } = item;
  const f = progressFraction(doc, progress);
  const sub = progress?.completed ? 'Finished' : f > 0 ? `${Math.round(f * 100)}% listened` : doc.author;
  return (
    <li className={`list-row type-${typeKey(doc.sourceType)}`}>
      <button className="list-open" onClick={onOpen}>
        <span className="list-bar" aria-hidden />
        <span className="list-text">
          <span className="list-title">{doc.title}</span>
          <span className="list-sub">{[typeLabel(doc.sourceType), sub].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="list-end">{progress?.completed ? 'Done' : formatDuration(doc.durationMin * 60 * (1 - f))}</span>
      </button>
      <button className="icon-btn" onClick={onMenu} aria-label={`Options for ${doc.title}`}><MoreHorizontal size={20} /></button>
    </li>
  );
}

function Tile({ item, layout, onOpen, onMenu }: { item: LibItem; layout: 'shelf' | 'grid'; onOpen: () => void; onMenu: () => void }) {
  const { doc, progress } = item;
  const f = progressFraction(doc, progress);
  return (
    <li className={`tile tile-${layout}`}>
      <button className="tile-open" onClick={onOpen}>
        <DocCover doc={doc} />
        <span className="tile-bar" aria-hidden><span style={{ width: `${f * 100}%` }} /></span>
        {layout === 'grid' && <span className="tile-title">{doc.title}</span>}
        <span className="tile-meta">{layout === 'shelf' && <span className="sr-only">{doc.title}. </span>}{layout === 'grid' && doc.author ? `${doc.author} · ` : ''}{status(doc, progress)}</span>
      </button>
      <button className="tile-menu" onClick={onMenu} aria-label={`Options for ${doc.title}`}><MoreHorizontal size={16} aria-hidden /></button>
    </li>
  );
}

export function Home({ onOpen, onResume, startingId, onImport, onReview, onSearch }: { onOpen: (docId: string) => void; onResume: (docId: string) => void; startingId: string | null; onImport: () => void; onReview: () => void; onSearch: () => void }) {
  const lib = useLibrary();
  const plan = usePlan();
  const [layout, setLayout] = useSetting<HomeLayout>('homeLayout', 'shelf');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const resume = lib.find((l) => l.progress && !l.progress.completed && l.progress.index > 0);
  const usage = checkUsage(plan, 'documents', lib.length);
  const limited = usage.limit >= 0; // a negative limit means unlimited
  return (
    <section className="page home">
      <header className="home-head">
        <h1 className="sr-only">Library</h1>
        <span className="wordmark" aria-hidden>earshelf</span>
        <button className="icon-btn" onClick={onSearch} aria-label="Search"><SearchIcon size={22} /></button>
        <button className="icon-btn" onClick={onImport} aria-label="Add a document"><Plus size={26} /></button>
      </header>

      {lib.length === 0 ? (
        <div className="empty">
          <BookOpen size={36} aria-hidden />
          <h2>Your library is empty</h2>
          <p>Add a PDF, EPUB, Word file or article. earshelf cleans it up and reads it to you, and your library stays on this device so it works offline.</p>
          <button className="btn primary" onClick={onImport}><Plus size={18} /> Add your first document</button>
        </div>
      ) : (
        <>
          <DueCard onReview={onReview} />
          {resume && <Hero item={resume} starting={startingId === resume.doc.id} onResume={() => onResume(resume.doc.id)} />}
          <div className="shelf-head">
            <h2 className="eyebrow">{layout === 'shelf' ? 'On the shelf' : 'Library'}</h2>
            <span className="count" aria-label={limited ? `${lib.length} of ${usage.limit} documents on the ${plan} plan` : `${lib.length} ${lib.length === 1 ? 'document' : 'documents'}`}>{limited ? `${lib.length} of ${usage.limit}` : lib.length}</span>
            <div className="seg" role="group" aria-label="Library layout">
              {LAYOUTS.map(({ id, label, Icon }) => (
                <button key={id} className="seg-btn" aria-pressed={layout === id} aria-label={label} title={label} onClick={() => setLayout(id)}><Icon size={18} aria-hidden /></button>
              ))}
            </div>
          </div>
          {layout === 'list' ? (
            <ul className="list-rows">{lib.map((it) => <Row key={it.doc.id} item={it} onOpen={() => onOpen(it.doc.id)} onMenu={() => setMenuFor(it.doc.id)} />)}</ul>
          ) : (
            <ul className={layout === 'grid' ? 'tiles grid' : 'tiles shelf'}>
              {lib.map((it) => <Tile key={it.doc.id} item={it} layout={layout} onOpen={() => onOpen(it.doc.id)} onMenu={() => setMenuFor(it.doc.id)} />)}
            </ul>
          )}
        </>
      )}
      {menuFor && <WellPicker docId={menuFor} onClose={() => setMenuFor(null)} />}
    </section>
  );
}
