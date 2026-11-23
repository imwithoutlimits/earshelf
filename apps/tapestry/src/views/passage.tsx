import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { alignVerses, GENERIC_PROMPTS, hideWords, loopPlan, nextReview, parseRefKey, scheduleRecall, STARTER_WELLS, type Token, type TranslationInfo } from '@wells/scripture';
import { speakAloud, stopSpeaking, wait } from '../speech';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { Sheet, openPlans } from '@wells/ui';
import { uid } from '@wells/offline';
import { api, supabase } from '../api';
import { NaturalListen } from './narrate';
import { db } from '../db';
import { loadPassage, loadChapter, enabledTranslations, infoOf, type Passage } from '../data';
import { useTranslation } from '../tr';
import { award } from '../activity';
import { player } from '../audio';
import { Icon, PlayGlyph, UpgradeNote } from '../ui';
import { usePlan } from '../billing';
import { useNav } from '../nav';

export function PassageView({ k, wellId }: { k: string; wellId?: string }) {
  const plan = usePlan(); const [cmpLocked, setCmpLocked] = useState(false); const [related, setRelated] = useState(false);
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
        <button className="btn" onClick={async () => { if (!hasFeature(plan, 'translation_compare')) { setCmpLocked(true); return; } const ids = await enabledTranslations(); setCmp(await Promise.all(ids.map(async (id) => ({ info: infoOf(id), p: await loadPassage(k, id) })))); }}>Compare</button>
        <button className="btn" onClick={() => setRelated(true)}>Related</button>
      </div>
      <NaturalListen k={k} />
      {ctx && <div className="sec"><div className="label">Whole chapter · {ctx.title}</div><p className="read" style={{ fontSize: 18, marginTop: 6 }}>{ctx.verses.map((v) => <span key={v.n}><sup>{v.n}</sup>{v.text} </span>)}</p></div>}
      <div className="sec"><div className="row between"><span className="b">Reflect</span><span className="sm tx">{prompts?.label ?? 'Editorial prompt'}</span></div>{(prompts?.list ?? list).map((x) => <p key={x} className="serif" style={{ fontSize: 19, margin: '8px 0' }}>{x}</p>)}{supabase && api.apiUrl && <button className="btn" onClick={() => void ai()}>Suggest prompts with AI</button>}</div>
      <div className="sec"><div className="b">Notes</div>{notes.map((n) => <p key={n.id} className="serif" style={{ fontSize: 18, margin: '8px 0' }}>{n.body}</p>)}<textarea className="ta" aria-label="Write a note" placeholder="Write a note. It stays private." value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn primary" style={{ marginTop: 8 }} disabled={!note.trim()} onClick={async () => { const now = Date.now(); await db.notes.add({ id: uid(), ref: k, body: note.trim(), createdAt: now, updatedAt: now }); setNote(''); await award('write_note', k); }}>Save note</button></div>
      <p className="sm mut" style={{ marginTop: 16 }}>{tr.notice}</p>
      {cmp && <CompareSheet items={cmp} onClose={() => setCmp(null)} />}
      {related && <RelatedSheet k={k} locked={!hasFeature(plan, 'cross_ref_graph')} onClose={() => setRelated(false)} />}
      {cmpLocked && <Sheet label="Compare translations" onClose={() => setCmpLocked(false)}><h2>Compare translations</h2><p className="mut">Reading translations side by side is included with Plus. On the Free plan you read one translation at a time, and you can switch it in Profile.</p><button className="btn primary big" onClick={() => { setCmpLocked(false); openPlans(); }}>See plans</button></Sheet>}
    </div>
  );
}
/** Plus: the same passage in up to three translations, lined up verse by verse. Each keeps its own wording and license. */
function CompareSheet({ items, onClose }: { items: Array<{ info: TranslationInfo; p: Passage | null }>; onClose: () => void }) {
  const current = useTranslation();
  const [pick, setPick] = useState<string[]>(() => [current.id, ...items.map((i) => i.info.id).filter((id) => id !== current.id)].slice(0, 3));
  const shown = items.filter((i) => pick.includes(i.info.id));
  const table = alignVerses(shown.map(({ info, p }) => ({ id: info.id, abbreviation: info.abbreviation, name: info.name, verses: p?.verses ?? null })));
  const toggle = (id: string) => setPick((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : cur.length >= 3 ? [...cur.slice(1), id] : [...cur, id]));
  const missing = table.columns.filter((c) => !c.available);
  return (
    <Sheet label="Compare translations" onClose={onClose}>
      <h2>Compare translations</h2>
      {items.length < 2 ? <p className="mut" role="status">Only {items[0]?.info.name ?? 'one translation'} is switched on, so there is nothing to put beside it yet. More translations appear here once they are loaded (Owner setup in Profile).</p> : (
        <>
          <div className="pills" role="group" aria-label="Translations to compare">{items.map(({ info }) => <button key={info.id} type="button" className="pill" aria-pressed={pick.includes(info.id)} title={info.name} onClick={() => toggle(info.id)}>{info.abbreviation}</button>)}</div>
          <div className="cmp-wrap"><table className="cmp"><thead><tr><th scope="col">Verse</th>{table.columns.map((c) => <th key={c.id} scope="col" title={c.name}>{c.abbreviation}</th>)}</tr></thead>
            <tbody>{table.rows.map((r) => <tr key={r.n}><th scope="row">{r.n}</th>{r.cells.map((t, i) => <td key={table.columns[i].id}>{t ?? <span className="mut">–</span>}</td>)}</tr>)}</tbody></table></div>
          {missing.length > 0 && <p className="sm mut" role="status">{missing.map((m) => m.name).join(', ')} {missing.length === 1 ? 'is' : 'are'} not on this device yet. Choose {missing.length === 1 ? 'it' : 'one'} in Profile and connect once to save it.</p>}
        </>
      )}
      <p className="sm mut">Each translation keeps its own wording and its own license.</p>
    </Sheet>
  );
}
/** Pro: other passages that speak to the one you are reading, from the OpenBible.info cross-references. */
function RelatedSheet({ k, locked, onClose }: { k: string; locked: boolean; onClose: () => void }) {
  const nav = useNav();
  const [data, setData] = useState<{ credit: string; items: Array<{ ref: string; label: string; votes: number }> } | null>(null); const [err, setErr] = useState('');
  useEffect(() => { if (!locked) api.apiGet<NonNullable<typeof data>>(`/v1/tapestry/cross-refs?ref=${encodeURIComponent(k)}`).then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load related passages.')); }, [k, locked]);
  return (
    <Sheet label="Related passages" onClose={onClose}>
      <h2>Related passages</h2>
      {locked ? (
        <>
          <p className="mut">See other passages that speak to this one. Included with Pro.</p>
          <button className="btn primary big" onClick={() => { onClose(); openPlans(); }}>See plans</button>
        </>
      ) : err ? <p role="alert" className="up-error">{err}</p>
        : !data ? <p className="mut">Looking…</p>
        : data.items.length === 0 ? <p className="mut">No related passages were found for this one.</p>
        : (
          <>
            <ul className="guide-q" style={{ listStyle: 'none', paddingLeft: 0 }}>{data.items.map((i) => <li key={i.ref}><button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { onClose(); nav.go({ t: 'passage', key: i.ref }); }}>{i.label}</button></li>)}</ul>
            <p className="sm mut">{data.credit}</p>
          </>
        )}
    </Sheet>
  );
}
export function Memorize({ k }: { k: string }) {
  const plan = usePlan(); const pro = hasFeature(plan, 'recall_scheduling');
  const nav = useNav(); const [p, setP] = useState<Passage | null>(null); const [level, setLevel] = useState(0); const [show, setShow] = useState(false); const memo = useLiveQuery(() => db.memo.get(k), [k], undefined);
  useEffect(() => { void loadPassage(k).then(setP); }, [k]);
  // Plus: a guided audio loop. It reads the passage, pauses for you to say it, and hides more words each round.
  const canLoop = hasFeature(plan, 'memorize_loops');
  const [loop, setLoop] = useState<{ step: number; of: number; label: string } | null>(null); const loopToken = useRef(0);
  useEffect(() => () => { loopToken.current += 1; stopSpeaking(); }, []);
  const stopLoop = () => { loopToken.current += 1; stopSpeaking(); setLoop(null); };
  const runLoop = async () => {
    if (!p) return;
    const my = ++loopToken.current; const rate = player.get().rate; const steps = loopPlan(p.text, { rate });
    setShow(false);
    for (let i = 0; i < steps.length; i++) {
      if (my !== loopToken.current) return;
      const s = steps[i];
      setLevel(s.level); setLoop({ step: i + 1, of: steps.length, label: s.label });
      if (s.kind === 'speak') await speakAloud(p.text, rate, s.ms); else await wait(s.ms);
    }
    if (my === loopToken.current) { setLoop(null); setLevel(0); nav.toast('Loop finished. Rate how it went below.'); }
  };
  const toks: Token[] = p ? hideWords(p.text, show ? 0 : level) : [];
  return (
    <div className="screen">
      <button className="icon-btn plain" aria-label="Back" onClick={nav.back} style={{ marginLeft: -10 }}><Icon n="left" /></button>
      <h1 className="h1" style={{ fontSize: 30, marginTop: 4 }}>Memorize</h1><p className="mut">{p?.title}</p>
      {memo && <p className="sm mut">Last practised with confidence {memo.confidence} of 5. Review {new Date(memo.reviewAt).toLocaleDateString()}.</p>}
      <p className="read" style={{ marginTop: 18 }} aria-live="polite">{toks.map((t, i) => t.hidden ? <span key={i} className="hide" aria-label="hidden word">{t.text}</span> : <span key={i}>{t.text}</span>)}</p>
      <div className="row" style={{ margin: '18px 0', flexWrap: 'wrap' }}>
        {p && <button className="btn" onClick={() => { player.setMode({ silence: false }); player.play([{ key: k, title: p.title, text: p.text }]); }}><PlayGlyph />Hear it</button>}
        <button className="btn" disabled={level >= 4} onClick={() => { setShow(false); setLevel(level + 1); }}>Hide more words</button><button className="btn" disabled={level === 0} onClick={() => { setShow(false); setLevel(level - 1); }}>Show some</button><button className="btn" onClick={() => setShow(!show)}>{show ? 'Hide again' : 'Reveal'}</button>{p && canLoop && (loop ? <button className="btn" onClick={stopLoop}>Stop loop</button> : <button className="btn" onClick={() => void runLoop()}>Guided loop</button>)}
      </div>
      <p className="sm mut">Level {level} of 4. Say the passage aloud, then reveal it and rate how it went.</p>{loop && <p role="status" className="b" style={{ marginTop: 8 }}>Step {loop.step} of {loop.of}: {loop.label}</p>}{!canLoop && <UpgradeNote>A guided audio loop reads the passage, pauses for you to say it, then hides more words each round. Included with Plus.</UpgradeNote>}
      <div className="sec"><div className="b">How well did you recall it?</div><div className="pills" style={{ marginTop: 10 }}>{([1, 2, 3, 4, 5] as const).map((c) => <button key={c} className="pill" onClick={async () => {
          if (pro) {
            // Pro: the gap grows each time you recall it well and resets when you do not.
            const r = scheduleRecall(memo ?? undefined, c);
            await db.memo.put({ ref: k, level, confidence: c, reviewAt: r.reviewAt, ease: r.ease, intervalDays: r.intervalDays, reps: r.reps, lapses: r.lapses, updatedAt: Date.now() });
            nav.toast(`Review on ${new Date(r.reviewAt).toLocaleDateString()} (in ${r.intervalDays} ${r.intervalDays === 1 ? 'day' : 'days'})`);
            return;
          }
          const at = nextReview(c); await db.memo.put({ ref: k, level, confidence: c, reviewAt: at, updatedAt: Date.now() }); nav.toast(`Review on ${new Date(at).toLocaleDateString()}`);
        }}>{c}</button>)}</div><p className="sm mut" style={{ marginTop: 8 }}>1 = barely, 5 = word for word. A higher number means a longer wait before the next review.</p>{!pro && <UpgradeNote>Pro adapts the wait to how well you remember each passage, and lists what is ready to recall each day.</UpgradeNote>}</div>
    </div>
  );
}
