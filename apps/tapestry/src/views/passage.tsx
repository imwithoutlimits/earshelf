import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { GENERIC_PROMPTS, hideWords, nextReview, parseRefKey, STARTER_WELLS, type Token, type TranslationInfo } from '@wells/scripture';
import { Sheet } from '@wells/ui';
import { uid } from '@wells/offline';
import { api, supabase } from '../api';
import { db } from '../db';
import { loadPassage, loadChapter, enabledTranslations, infoOf, type Passage } from '../data';
import { useTranslation } from '../tr';
import { award } from '../activity';
import { player } from '../audio';
import { Icon, PlayGlyph } from '../ui';
import { useNav } from '../nav';

export function PassageView({ k, wellId }: { k: string; wellId?: string }) {
  const tr = useTranslation(); const [cmp, setCmp] = useState<Array<{ info: TranslationInfo; p: Passage | null }> | null>(null);
  const nav = useNav(); const [p, setP] = useState<Passage | null | undefined>(undefined); const [ctx, setCtx] = useState<Passage | null>(null); const [prompts, setPrompts] = useState<{ label: string; list: string[] } | null>(null); const [note, setNote] = useState('');
  const marked = useLiveQuery(() => db.bookmarks.where('ref').equals(k).count(), [k], 0); const notes = useLiveQuery(() => db.notes.where('ref').equals(k).toArray(), [k], []);
  useEffect(() => { void loadPassage(k).then(setP); }, [k]);
  const well = STARTER_WELLS.find((w) => w.id === wellId); const list = well?.prompts ?? GENERIC_PROMPTS.slice(0, 3);
  const ai = async () => { try { const r = await api.apiPost<{ label: string; prompts: string[] }>('/v1/tapestry/reflect', { ref: k }); setPrompts({ label: r.label, list: r.prompts }); } catch (e) { nav.toast(e instanceof Error ? e.message : 'Could not get prompts.'); } };
  const ref = parseRefKey(k);
  return (
    <div className="screen">
      <button className="icon-btn plain" aria-label="Back" onClick={nav.back} style={{ marginLeft: -10 }}><Icon n="left" /></button>
      <h1 className="h1" style={{ fontSize: 34, marginTop: 4 }}>{p?.title ?? (ref ? `${ref.book.name} ${ref.chapter}` : k)}</h1><p className="sm mut" style={{ marginTop: 4 }}>{tr.name}</p>
      {p === undefined && <p className="mut" style={{ marginTop: 16 }}>Loading…</p>}
      {p === null && <p className="mut" style={{ marginTop: 16 }} role="status">This passage is not available in this translation on this device yet. Connect to the internet once and it will be saved for offline use. If it never appears, the owner has not loaded this translation.</p>}
      {p && <p className="read" style={{ marginTop: 16 }}>{p.verses.map((v) => <span key={v.n}>{p.verses.length > 1 && <sup>{v.n}</sup>}{v.text} </span>)}</p>}
      <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
        {p && <button className="btn primary" onClick={() => { player.setMode({ silence: false }); player.play([{ key: k, title: p.title, text: p.text }]); nav.go({ t: 'player' }); }}><PlayGlyph />Listen</button>}
        <button className="btn" aria-pressed={!!marked} onClick={async () => { if (marked) await db.bookmarks.where('ref').equals(k).delete(); else { await db.bookmarks.add({ id: uid(), ref: k, createdAt: Date.now() }); await award('save_passage', k); nav.toast('Bookmarked'); } }}><Icon n="mark" s={20} />{marked ? 'Bookmarked' : 'Bookmark'}</button>
        <button className="btn" onClick={() => nav.save([k])}><Icon n="plus" s={20} />Add to well</button>
        {p && <button className="btn" onClick={() => nav.go({ t: 'memorize', key: k })}>Memorize</button>}
        <button className="btn" onClick={async () => setCtx(ctx ? null : await loadChapter(k))}>{ctx ? 'Hide context' : 'Context'}</button>
        <button className="btn" onClick={async () => { const ids = await enabledTranslations(); setCmp(await Promise.all(ids.map(async (id) => ({ info: infoOf(id), p: await loadPassage(k, id) })))); }}>Compare</button>
      </div>
      {ctx && <div className="sec"><div className="label">Whole chapter · {ctx.title}</div><p className="read" style={{ fontSize: 18, marginTop: 6 }}>{ctx.verses.map((v) => <span key={v.n}><sup>{v.n}</sup>{v.text} </span>)}</p></div>}
      <div className="sec"><div className="row between"><span className="b">Reflect</span><span className="sm tx">{prompts?.label ?? 'Editorial prompt'}</span></div>{(prompts?.list ?? list).map((x) => <p key={x} className="serif" style={{ fontSize: 19, margin: '8px 0' }}>{x}</p>)}{supabase && api.apiUrl && <button className="btn" onClick={() => void ai()}>Suggest prompts with AI</button>}</div>
      <div className="sec"><div className="b">Notes</div>{notes.map((n) => <p key={n.id} className="serif" style={{ fontSize: 18, margin: '8px 0' }}>{n.body}</p>)}<textarea className="ta" aria-label="Write a note" placeholder="Write a note. It stays private." value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn primary" style={{ marginTop: 8 }} disabled={!note.trim()} onClick={async () => { const now = Date.now(); await db.notes.add({ id: uid(), ref: k, body: note.trim(), createdAt: now, updatedAt: now }); setNote(''); await award('write_note', k); }}>Save note</button></div>
      <p className="sm mut" style={{ marginTop: 16 }}>{tr.notice}</p>
      {cmp && <Sheet label="Compare translations" onClose={() => setCmp(null)}><h2>Compare translations</h2>{cmp.map(({ info, p: cp }) => <div key={info.id} className="sec" style={{ border: 0, padding: '4px 0' }}><div className="b">{info.name} <span className="sm mut">({info.abbreviation})</span></div><p className="read" style={{ fontSize: 19, marginTop: 4 }}>{cp ? cp.text : 'Not on this device yet. Choose this translation in Profile and connect once to save it.'}</p></div>)}<p className="sm mut">Each translation keeps its own wording and its own license.</p></Sheet>}
    </div>
  );
}
export function Memorize({ k }: { k: string }) {
  const nav = useNav(); const [p, setP] = useState<Passage | null>(null); const [level, setLevel] = useState(0); const [show, setShow] = useState(false); const memo = useLiveQuery(() => db.memo.get(k), [k], undefined);
  useEffect(() => { void loadPassage(k).then(setP); }, [k]);
  const toks: Token[] = p ? hideWords(p.text, show ? 0 : level) : [];
  return (
    <div className="screen">
      <button className="icon-btn plain" aria-label="Back" onClick={nav.back} style={{ marginLeft: -10 }}><Icon n="left" /></button>
      <h1 className="h1" style={{ fontSize: 30, marginTop: 4 }}>Memorize</h1><p className="mut">{p?.title}</p>
      {memo && <p className="sm mut">Last practised with confidence {memo.confidence} of 5. Review {new Date(memo.reviewAt).toLocaleDateString()}.</p>}
      <p className="read" style={{ marginTop: 18 }} aria-live="polite">{toks.map((t, i) => t.hidden ? <span key={i} className="hide" aria-label="hidden word">{t.text}</span> : <span key={i}>{t.text}</span>)}</p>
      <div className="row" style={{ margin: '18px 0', flexWrap: 'wrap' }}>
        {p && <button className="btn" onClick={() => { player.setMode({ silence: false }); player.play([{ key: k, title: p.title, text: p.text }]); }}><PlayGlyph />Hear it</button>}
        <button className="btn" disabled={level >= 4} onClick={() => { setShow(false); setLevel(level + 1); }}>Hide more words</button><button className="btn" disabled={level === 0} onClick={() => { setShow(false); setLevel(level - 1); }}>Show some</button><button className="btn" onClick={() => setShow(!show)}>{show ? 'Hide again' : 'Reveal'}</button>
      </div>
      <p className="sm mut">Level {level} of 4. Say the passage aloud, then reveal it and rate how it went.</p>
      <div className="sec"><div className="b">How well did you recall it?</div><div className="pills" style={{ marginTop: 10 }}>{([1, 2, 3, 4, 5] as const).map((c) => <button key={c} className="pill" onClick={async () => { const at = nextReview(c); await db.memo.put({ ref: k, level, confidence: c, reviewAt: at, updatedAt: Date.now() }); nav.toast(`Review on ${new Date(at).toLocaleDateString()}`); }}>{c}</button>)}</div><p className="sm mut" style={{ marginTop: 8 }}>1 = barely, 5 = word for word. A higher number means a longer wait before the next review.</p></div>
    </div>
  );
}
