import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, Download, Highlighter, StickyNote, Trash2 } from 'lucide-react';
import { toCsv, toMarkdown, toReadwiseCsv, type ExportItem } from '@wells/core';
import { db, queueSync } from '../db';
import { DocCard, useLibrary } from './Home';
import { DueCard } from './Review';

const ICON = { bookmark: Bookmark, highlight: Highlighter, note: StickyNote } as const;
const LABEL = { bookmark: 'Bookmark', highlight: 'Highlight', note: 'Note' } as const;

async function exportAnnotations(format: 'md' | 'csv' | 'readwise') {
  const [anns, docs] = await Promise.all([db.annotations.filter((a) => !a.deletedAt).toArray(), db.docs.toArray()]);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const items: ExportItem[] = anns.map((a) => {
    const d = byId.get(a.docId);
    return { kind: a.kind, docTitle: d?.title ?? 'Deleted document', docAuthor: d?.author, section: d?.parsed.sections.find((s) => s.blockIds.includes(a.blockId))?.title, text: a.text, body: a.body, createdAt: a.createdAt };
  });
  const [name, type, body] = format === 'md' ? ['earshelf-notes.md', 'text/markdown', toMarkdown(items)] : format === 'csv' ? ['earshelf-notes.csv', 'text/csv', '\ufeff' + toCsv(items)] : ['earshelf-readwise.csv', 'text/csv', '\ufeff' + toReadwiseCsv(items)];
  const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Activity({ onOpen, onReview }: { onOpen: (docId: string, blockId?: string) => void; onReview: () => void }) {
  const lib = useLibrary();
  const anns = useLiveQuery(() => db.annotations.filter((a) => !a.deletedAt).reverse().sortBy('createdAt').then((a) => a.reverse()), [], []);
  const titles = new Map(lib.map((l) => [l.doc.id, l.doc.title]));
  const recent = lib.filter((l) => l.doc.lastPlayedAt).sort((a, b) => (b.doc.lastPlayedAt ?? 0) - (a.doc.lastPlayedAt ?? 0)).slice(0, 8);

  return (
    <section className="page">
      <header className="page-head"><h1>Activity</h1></header>
      <DueCard onReview={onReview} />
      <h2 className="sub">Recently played</h2>
      {recent.length === 0 ? <div className="empty"><p>Documents you listen to will show up here.</p></div> : (
        <div className="doc-list">{recent.map(({ doc, progress }) => <DocCard key={doc.id} doc={doc} progress={progress} onOpen={() => onOpen(doc.id)} />)}</div>
      )}
      <h2 className="sub">Saved passages</h2>
      {anns.length > 0 && (
        <div className="row-end export-row">
          <span className="hint grow">Take your highlights and notes with you</span>
          <button className="chip" onClick={() => void exportAnnotations('md')}><Download size={16} /> Markdown</button>
          <button className="chip" onClick={() => void exportAnnotations('csv')}><Download size={16} /> CSV</button>
          <button className="chip" onClick={() => void exportAnnotations('readwise')}><Download size={16} /> Readwise</button>
        </div>
      )}
      {anns.length === 0 ? <div className="empty"><p>Tap a sentence in the reader to bookmark it, highlight it or add a note.</p></div> : (
        <ul className="ann-list">
          {anns.map((a) => {
            const Icon = ICON[a.kind];
            return (
              <li key={a.id} className="ann">
                <button className="ann-main" onClick={() => onOpen(a.docId, a.blockId)}>
                  <Icon size={18} aria-label={LABEL[a.kind]} />
                  <span>
                    <span className="ann-text reading">{a.text}</span>
                    {a.body && <span className="ann-body">{a.body}</span>}
                    <span className="doc-meta">{titles.get(a.docId) ?? 'Deleted document'}</span>
                  </span>
                </button>
                <button className="icon-btn small" aria-label={`Delete ${LABEL[a.kind].toLowerCase()}`} onClick={() => void db.annotations.update(a.id, { deletedAt: Date.now(), updatedAt: Date.now() }).then(() => queueSync('annotations', a.id, 'delete'))}><Trash2 size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
