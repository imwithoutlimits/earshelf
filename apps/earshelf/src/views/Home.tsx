import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, FolderPlus, LayoutGrid, Library, List as ListIcon, Play, Plus, Search as SearchIcon, Trash2, X } from 'lucide-react';
import { chapterAtFraction } from '@wells/core';
import { db, deleteDocument, uid, type DocRecord } from '../db';
import { formatClock as clock, formatDuration, useLook, useSetting, type HomeLayout, type Look } from '../hooks';
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
      {onMenu && <button className="icon-btn" onClick={onMenu} aria-label={`Options for ${doc.title}`}><FolderPlus size={20} /></button>}
    </div>
  );
}

export function WellPicker({ docId, onClose }: { docId: string; onClose: () => void }) {
  const wells = useLiveQuery(() => db.wells.filter((w) => w.kind !== 'smart').toArray(), [], []);
  const items = useLiveQuery(() => db.wellItems.where('docId').equals(docId).toArray(), [docId], []);
  const doc = useLiveQuery(() => db.docs.get(docId), [docId]);
  const [confirm, setConfirm] = useState(false);
  const toggle = async (wellId: string) => {
    const existing = items.find((i) => i.wellId === wellId);
    if (existing) await db.wellItems.delete(existing.id);
    else await db.wellItems.add({ id: uid(), wellId, docId, position: Date.now() });
  };
  return (
    <Sheet onClose={onClose} label="Document options">
        <header className="sheet-head"><h2>{doc?.title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={22} /></button></header>
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
/** "3 h 01 min" for the blue look, "42 min" under an hour. */
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

function Hero({ item, look, onOpen, onMenu }: { item: LibItem; look: Look; onOpen: () => void; onMenu: () => void }) {
  const { doc, progress } = item;
  const f = progressFraction(doc, progress);
  const left = doc.durationMin * 60 * (1 - f);
  const chapter = useMemo(() => chapterAtFraction(doc.parsed, f), [doc.parsed, f]);
  const tm = minutesLeft(left);
  const segments = Math.min(14, Math.max(4, chapter?.total ?? 10));
  const resume = (
    <span className="hero-actions">
      <button className="resume-pill" onClick={onOpen}><Play size={18} fill="currentColor" aria-hidden /> Resume</button>
      <button className="icon-btn" onClick={onMenu} aria-label={`Options for ${doc.title}`}><FolderPlus size={20} /></button>
    </span>
  );
  const label = chapter ? `Chapter ${chapter.index} of ${chapter.total}` : typeLabel(doc.sourceType);

  if (look === 'dark') return (
    <section className="hero hero-dark" aria-label="Continue listening">
      <p className="eyebrow between"><span>Now playing</span>{chapter && <span>Ch {chapter.index} / {chapter.total}</span>}</p>
      <p className="hero-clock" aria-label={`${leftWords(left)} left`}>{clock(left)}</p>
      <p className="eyebrow">Remaining</p>
      <h2 className="hero-title">{doc.title}</h2>
      {doc.author && <p className="hero-author">{doc.author}</p>}
      {resume}
    </section>
  );
  if (look === 'blue') return (
    <section className="hero hero-blue" aria-label="Continue listening">
      <p className="eyebrow">{label}</p>
      <h2 className="hero-title">{doc.title}</h2>
      <span className="segs" aria-hidden>{Array.from({ length: segments }, (_, i) => { const fill = Math.min(1, Math.max(0, f * segments - i)); return <span key={i}><span style={{ width: `${fill * 100}%` }} /></span>; })}</span>
      <p className="hero-meta between"><span>{leftWords(left)} left</span>{doc.author && <span>{doc.author}</span>}</p>
      {resume}
    </section>
  );
  return (
    <section className="hero hero-light" aria-label="Continue listening">
      <button className="hero-cover" onClick={onOpen} aria-label={`Open ${doc.title}`}><DocCover doc={doc} /></button>
      <div className="hero-info">
        <p className="eyebrow">{label}</p>
        <h2 className="hero-chapter">{chapter?.title ?? doc.title}</h2>
        <p className="hero-time"><span className="hero-num">{tm >= 60 ? `${Math.floor(tm / 60)}:${pad2(tm % 60)}` : tm}</span><span>{tm >= 60 ? 'hours left' : 'minutes left'}</span></p>
        {resume}
      </div>
    </section>
  );
}

function Row({ item, n, onOpen, onMenu }: { item: LibItem; n: number; onOpen: () => void; onMenu: () => void }) {
  const { doc, progress } = item;
  const f = progressFraction(doc, progress);
  const sub = progress?.completed ? 'Finished' : f > 0 ? `${Math.round(f * 100)}% listened` : doc.author;
  return (
    <li className={`list-row type-${typeKey(doc.sourceType)}`}>
      <button className="list-open" onClick={onOpen}>
        <span className="list-no" aria-hidden>{pad2(n)}</span>
        <span className="list-bar" aria-hidden />
        <DocCover doc={doc} className="list-cover" />
        <span className="list-text">
          <span className="list-title">{doc.title}</span>
          <span className="list-sub">{[typeLabel(doc.sourceType), sub].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="list-end">{progress?.completed ? 'Done' : formatDuration(doc.durationMin * 60 * (1 - f))}</span>
      </button>
      <button className="icon-btn" onClick={onMenu} aria-label={`Options for ${doc.title}`}><FolderPlus size={20} /></button>
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
      <button className="tile-menu" onClick={onMenu} aria-label={`Options for ${doc.title}`}><FolderPlus size={16} aria-hidden /></button>
    </li>
  );
}

export function Home({ onOpen, onImport, onReview, onSearch }: { onOpen: (docId: string, opts?: { play?: boolean }) => void; onImport: () => void; onReview: () => void; onSearch: () => void }) {
  const lib = useLibrary();
  const look = useLook();
  const [layout, setLayout] = useSetting<HomeLayout>('homeLayout', 'shelf');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const resume = lib.find((l) => l.progress && !l.progress.completed && l.progress.index > 0);
  const rest = lib.filter((l) => l !== resume);
  return (
    <section className="page home">
      <header className="home-head">
        {look === 'blue' ? <><h1 className="sr-only">Library</h1><span className="wordmark" aria-hidden>earshelf</span></> : <h1>Library</h1>}
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
          {resume && <Hero item={resume} look={look} onOpen={() => onOpen(resume.doc.id, { play: true })} onMenu={() => setMenuFor(resume.doc.id)} />}
          {rest.length > 0 && (
            <>
              <div className="shelf-head">
                <h2 className="eyebrow">{layout === 'shelf' ? 'On the shelf' : 'Library'}</h2>
                <span className="count" aria-label={`${rest.length} ${rest.length === 1 ? 'document' : 'documents'}`}>{rest.length}</span>
                <div className="seg" role="group" aria-label="Library layout">
                  {LAYOUTS.map(({ id, label, Icon }) => (
                    <button key={id} className="seg-btn" aria-pressed={layout === id} aria-label={label} title={label} onClick={() => setLayout(id)}><Icon size={18} aria-hidden /></button>
                  ))}
                </div>
              </div>
              {layout === 'list' ? (
                <ul className="list-rows">{rest.map((it, i) => <Row key={it.doc.id} item={it} n={i + (resume ? 2 : 1)} onOpen={() => onOpen(it.doc.id)} onMenu={() => setMenuFor(it.doc.id)} />)}</ul>
              ) : (
                <ul className={layout === 'grid' ? 'tiles grid' : 'tiles shelf'}>
                  {rest.map((it) => <Tile key={it.doc.id} item={it} layout={layout} onOpen={() => onOpen(it.doc.id)} onMenu={() => setMenuFor(it.doc.id)} />)}
                </ul>
              )}
            </>
          )}
        </>
      )}
      {menuFor && <WellPicker docId={menuFor} onClose={() => setMenuFor(null)} />}
    </section>
  );
}
