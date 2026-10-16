import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, Download, Highlighter, StickyNote, Trash2 } from 'lucide-react';
import { mergeDays, minutesOf, secondsBetween, toCsv, toMarkdown, toReadwiseCsv, type ExportItem } from '@wells/core';
import { DEFAULT_TARGET_DAYS, addDays, listenedDays, localDay, longestStreak, streakInfo, weekStart, weeklyProgress } from '@wells/activity';
import { db, queueSync } from '../db';
import { useSetting } from '../hooks';
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

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const minutesText = (sec: number) => { const m = minutesOf(sec); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

/** Streak, this week and the weekly goal, worked out from the time listened on this device. */
function Stats() {
  const local = useLiveQuery(() => db.listening.toArray(), [], []);
  const remote = useLiveQuery(() => db.remoteDays.toArray(), [], []);
  // Time from every device the person listens on, plus whatever this device has not uploaded yet.
  const rows = useMemo(() => mergeDays(local, remote), [local, remote]);
  const finished = useLiveQuery(() => db.progress.filter((p) => p.completed).toArray(), [], []);
  const [target, setTarget] = useSetting<number>('weeklyTarget', DEFAULT_TARGET_DAYS);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const today = localDay(Date.now(), tz);
  const s = useMemo(() => {
    const days = listenedDays(rows);
    const thread = streakInfo(days, today);
    const start = weekStart(today);
    const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return { day: d, seconds: secondsBetween(rows, d, d) }; });
    return {
      thread, longest: Math.max(longestStreak(days), thread.count), weekly: weeklyProgress(days, today, target), week,
      weekSeconds: week.reduce((n, d) => n + d.seconds, 0), todaySeconds: secondsBetween(rows, today, today), max: Math.max(60, ...week.map((d) => d.seconds)),
      finishedWeek: finished.filter((p) => localDay(p.updatedAt, tz) >= start).length,
    };
  }, [rows, finished, today, target, tz]);
  const { thread, weekly } = s;
  const line = thread.todayDone ? 'You have listened today. Nice work.' : thread.count > 0 ? 'Listen for a minute today to keep your streak going.' : 'Listen for a minute today to start a streak.';
  return (
    <>
      <section className="streak" aria-label="Listening streak">
        <p className="streak-num" aria-label={`${thread.count} day streak`}>{thread.count}</p>
        <div className="streak-text">
          <h2 className="streak-label">day streak</h2>
          <p>{line}</p>
          <p className="hint">A day counts after one minute of listening. One rest day a week keeps your streak.</p>
        </div>
      </section>

      <ul className="stat-tiles">
        <li><span className="stat-num">{minutesText(s.todaySeconds)}</span><span className="stat-label">Today</span></li>
        <li><span className="stat-num">{minutesText(s.weekSeconds)}</span><span className="stat-label">This week</span></li>
        <li><span className="stat-num">{s.finishedWeek}</span><span className="stat-label">Finished this week</span></li>
        <li><span className="stat-num">{s.longest}</span><span className="stat-label">Longest streak</span></li>
      </ul>

      <section className="week" aria-label="This week">
        <div className="week-head">
          <h2 className="sub">This week</h2>
          <label className="goal">Goal
            <select value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Days to listen each week">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'} a week</option>)}
            </select>
          </label>
        </div>
        <ul className="week-bars">
          {s.week.map((d, i) => {
            const isToday = d.day === today;
            return (
              <li key={d.day} className={[isToday ? 'today' : '', d.day > today ? 'future' : '', weekly.doneDays[i] ? 'done' : ''].filter(Boolean).join(' ')} aria-label={`${DAY_NAMES[i]}: ${d.seconds ? minutesText(d.seconds) : 'no listening'}${weekly.doneDays[i] ? ', counted' : ''}`}>
                <span className="bar-col" aria-hidden><span style={{ height: `${Math.max(d.seconds ? 8 : 3, (d.seconds / s.max) * 100)}%` }} /></span>
                <span className="bar-day" aria-hidden>{DAY_NAMES[i][0]}</span>
              </li>
            );
          })}
        </ul>
        <p className="hint" role="status">{weekly.met ? `Goal reached: ${weekly.done} of ${target} days.` : `${weekly.done} of ${target} days so far.${weekly.reachable ? '' : ' A fresh week starts on Monday.'}`}</p>
      </section>
    </>
  );
}

export function Activity({ onOpen, onReview }: { onOpen: (docId: string, blockId?: string) => void; onReview: () => void }) {
  const lib = useLibrary();
  const anns = useLiveQuery(() => db.annotations.filter((a) => !a.deletedAt).reverse().sortBy('createdAt').then((a) => a.reverse()), [], []);
  const titles = new Map(lib.map((l) => [l.doc.id, l.doc.title]));
  const recent = lib.filter((l) => l.doc.lastPlayedAt).sort((a, b) => (b.doc.lastPlayedAt ?? 0) - (a.doc.lastPlayedAt ?? 0)).slice(0, 8);

  return (
    <section className="page">
      <header className="page-head"><h1>Activity</h1></header>
      <Stats />
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
