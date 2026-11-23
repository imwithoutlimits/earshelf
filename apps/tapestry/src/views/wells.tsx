import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Sheet, openPlans } from '@wells/ui';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { STARTER_WELLS, LINK_LABEL, GUIDE_KINDS, MAX_GUIDE_PASSAGES, DRAFT_LABEL, draftToText, estimateMinutes, formatReference, guideToText, parseRefKey, wellsForText, type DraftLength, type DraftTone, type GuideKind, type SermonDraft, type StudyGuide } from '@wells/scripture';
import { db } from '../db';
import { api, supabase } from '../api';
import { addToWell, copyStarter, createWell, deleteWell, loadPassage, moveItem, removeItem, wellView, type Passage, type WellView } from '../data';
import { usePlan } from '../billing';
import { ShareWellSheet } from './together';
import { useTranslation } from '../tr';
import { player, usePlayer } from '../audio';
import { Icon, PlayGlyph } from '../ui';
import { useNav } from '../nav';
import { queueFor } from './home';

function MiniStars({ n, done }: { n: number; done: number }) {
  const k = Math.max(2, Math.min(n, 9)); const pts = Array.from({ length: k }, (_, i) => [4 + (i * 56) / (k - 1), 8 + ((i * 17 + 7) % 5) * 5]);
  return <svg width="64" height="36" viewBox="0 0 64 36" aria-hidden="true" style={{ flex: 'none' }}>{pts.slice(0, -1).map((p, i) => <line key={i} x1={p[0]} y1={p[1]} x2={pts[i + 1][0]} y2={pts[i + 1][1]} stroke="var(--dot)" strokeWidth=".75" opacity=".6" />)}{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.6" fill={i < done ? 'var(--dot)' : 'var(--bg)'} stroke="var(--dot)" />)}</svg>;
}
export function Wells() {
  const nav = useNav(); const pl = usePlayer(); const [draft, setDraft] = useState(false);
  const mine = useLiveQuery(() => db.wells.filter((w) => !w.deleted).toArray(), [], []); const items = useLiveQuery(() => db.items.toArray(), [], []); const prog = useLiveQuery(() => db.progress.toArray(), [], []);
  const row = (id: string, name: string, n: number, mins: number, done: number, now: boolean) => (
    <button key={id} className="item" onClick={() => nav.go({ t: 'well', id })}><MiniStars n={n} done={done} /><div className="grow"><div className="well-name">{name}</div><div className="sm mut">{n} passages · {mins} min{done ? ` · ${Math.min(done, n)} listened` : ''}</div></div>{now && <span className="sm tx b">Playing</span>}</button>
  );
  return (
    <div className="screen">
      <div className="row between"><h1 className="h1">Wells</h1><button className="btn" onClick={nav.newWell}><Icon n="plus" s={20} />New well</button></div>
      <div className="label" style={{ margin: '18px 0 4px' }}>Yours</div>
      {mine.length === 0 && <p className="mut sec">No wells of your own yet. Save a passage from search, copy a starter well, or make one from a feeling.</p>}
      {mine.map((w) => { const its = items.filter((i) => i.wellId === w.id); return row(w.id, w.name, its.length, Math.max(1, Math.round((its.length * 24) / 60)), prog.find((p) => p.wellId === w.id)?.index ?? 0, pl.playing && pl.queue[0]?.wellId === w.id); })}
      <div className="sec row"><div className="grow"><div className="sm tx b">Suggested by AI</div><div className="well-name">Make a well from a feeling</div><div className="sm mut">Describe what you need. You review every passage.</div></div><button className="btn primary" onClick={() => setDraft(true)}>Start</button></div>
      <div className="label" style={{ margin: '18px 0 4px' }}>Starter wells</div>
      {STARTER_WELLS.map((w) => row(w.id, w.name, w.items.length, estimateMinutes(w), prog.find((p) => p.wellId === w.id)?.index ?? 0, pl.playing && pl.queue[0]?.wellId === w.id))}
      {draft && <DraftSheet onClose={() => setDraft(false)} />}
    </div>
  );
}
function DraftSheet({ onClose }: { onClose: () => void }) {
  const nav = useNav(); const [goal, setGoal] = useState(''); const [busy, setBusy] = useState(false); const [out, setOut] = useState<{ name: string; description: string; refs: string[]; label: string } | null>(null); const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true); setErr(''); setOut(null);
    try {
      if (supabase && api.apiUrl && (await supabase.auth.getSession()).data.session) { const r = await api.apiPost<{ name: string; description: string; refs: string[]; label: string }>('/v1/tapestry/well-draft', { goal }); setOut(r); return; }
    } catch { /* fall back to the on-device version below */ }
    const hit = wellsForText(goal)[0]; const w = STARTER_WELLS.find((x) => x.id === hit?.wellId);
    if (w) setOut({ name: w.name, description: w.description, refs: w.items.slice(0, 8).map((i) => i.ref), label: 'From curated wells' }); else setErr('We could not find passages for that. Try describing a feeling or a situation, like "worried about work".');
    setBusy(false);
  };
  return (
    <Sheet label="Make a well from a feeling" onClose={onClose}>
      <h2>Make a well from a feeling</h2>
      <textarea className="ta" aria-label="Describe what you need" placeholder="For example: I feel worried about a decision" value={goal} onChange={(e) => setGoal(e.target.value)} />
      {err && <p role="alert" className="error-text">{err}</p>}
      {out && <div className="stack"><div className="sm tx b">{out.label}</div><div className="well-name">{out.name}</div><p className="mut">{out.description}</p><p className="sm mut">{out.refs.map((r) => { const x = parseRefKey(r); return x ? formatReference(x) : r; }).join(' · ')}</p><button className="btn primary big" onClick={async () => { const id = await createWell(out.name, out.description, out.refs, 'ai'); onClose(); nav.go({ t: 'well', id }); }}>Create this well</button></div>}
      {!out && <button className="btn primary big" disabled={busy || goal.trim().length < 3} onClick={() => void run()}>{busy ? 'Finding passages…' : 'Find passages'}</button>}
    </Sheet>
  );
}
export function WellDetail({ id }: { id: string }) {
  const nav = useNav(); const pl = usePlayer(); const [w, setW] = useState<WellView | null>(null); const [guide, setGuide] = useState(false); const [share, setShare] = useState(false);
  const stamp = useLiveQuery(() => db.items.where('wellId').equals(id).toArray(), [id], []);
  useEffect(() => { void wellView(id).then(setW); }, [id, stamp]);
  if (!w) return <div className="screen"><button className="icon-btn plain" aria-label="Back" onClick={nav.back}><Icon n="left" /></button><p className="mut">This well was not found.</p></div>;
  const playing = pl.playing && pl.queue[0]?.wellId === id;
  return (
    <div className="screen">
      <div className="row between"><button className="icon-btn plain" aria-label="Back" onClick={nav.back} style={{ marginLeft: -10 }}><Icon n="left" /></button>{!w.starter && <button className="icon-btn plain" aria-label="Delete well" onClick={async () => { if (confirm(`Delete “${w.name}”? Your saved passages stay in other wells.`)) { await deleteWell(id); nav.back(); } }}><Icon n="trash" /></button>}</div>
      <h1 className="h1" style={{ fontSize: 34, marginTop: 6 }}>{w.name}</h1><p className="mut" style={{ marginTop: 8 }}>{w.intro ?? w.description}</p>
      <p className="sm mut" style={{ marginTop: 6 }}>{w.items.length} passages · {w.minutes} min{w.starter ? ' · editorial draft, every passage can be reviewed' : ''}</p>
      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn primary big" onClick={async () => { if (playing) { player.toggle(); return; } const q = await queueFor(w); if (q.length) { player.setMode({ silence: true }); player.play(q); nav.go({ t: 'player' }); } else nav.toast('Passages are not on this device yet. Connect once to download them.'); }}><PlayGlyph />{playing ? 'Pause' : 'Listen to this well'}</button>
        {w.items.length > 0 && <button className="btn big" onClick={() => setGuide(true)}>Study guide</button>}
        {w.items.length > 0 && <button className="btn big" onClick={() => setShare(true)}>Share to a vault</button>}
        {w.starter && <button className="btn big" onClick={async () => { const n = await copyStarter(id); if (n) { nav.toast('Saved to your wells'); nav.go({ t: 'well', id: n }); } }}>Save as my well</button>}
      </div>
      <div style={{ marginTop: 16 }}>{w.items.map((it, i) => { const r = parseRefKey(it.key); return (
        <div key={it.key} className="item" style={{ alignItems: 'flex-start' }}>
          <button style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', gap: 14 }} onClick={() => nav.go({ t: 'passage', key: it.key, wellId: id })}><span className="no" style={{ fontWeight: 700, color: 'var(--mut)', width: 28 }}>{String(i + 1).padStart(2, '0')}</span><span><span className="t">{r ? formatReference(r) : it.key}</span>{it.link && <span className="sm tx" style={{ display: 'block' }}>{LINK_LABEL[it.link as keyof typeof LINK_LABEL]}</span>}{it.note && <span className="sm mut" style={{ display: 'block' }}>{it.note}</span>}</span></button>
          {!w.starter && it.id && <span className="row" style={{ gap: 0 }}><button className="icon-btn plain" aria-label="Move up" disabled={i === 0} onClick={() => void moveItem(id, it.id!, -1)}><Icon n="up" s={20} /></button><button className="icon-btn plain" aria-label="Move down" disabled={i === w.items.length - 1} onClick={() => void moveItem(id, it.id!, 1)}><Icon n="down" s={20} /></button><button className="icon-btn plain" aria-label={`Remove ${r ? formatReference(r) : ''}`} onClick={() => void removeItem(it.id!)}><Icon n="x" s={20} /></button></span>}
        </div>); })}</div>
      {guide && <GuideSheet well={w} onClose={() => setGuide(false)} />}
      {share && <ShareWellSheet well={w} onClose={() => setShare(false)} />}
    </div>
  );
}

/** Pro: a study guide or talk outline from the passages in a well. The questions may be AI-suggested; the verses are always the app's own text, word for word. */
function GuideSheet({ well, onClose }: { well: WellView; onClose: () => void }) {
  const nav = useNav(); const plan = usePlan(); const tr = useTranslation(); const pro = hasFeature(plan, 'sermon_generator');
  const keys = well.items.map((i) => i.key);
  const [kind, setKind] = useState<GuideKind>('study'); const [pick, setPick] = useState<string[]>(keys.slice(0, MAX_GUIDE_PASSAGES));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [out, setOut] = useState<StudyGuide | null>(null); const [texts, setTexts] = useState<Record<string, Passage | null>>({});
  const titleOf = (k: string) => { const r = parseRefKey(k); return r ? formatReference(r) : k; };
  const toggle = (k: string) => setPick((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= MAX_GUIDE_PASSAGES ? cur : [...cur, k]));
  const make = async () => {
    setBusy(true); setErr('');
    try {
      const g = await api.apiPost<StudyGuide>('/v1/tapestry/study-guide', { refs: keys.filter((k) => pick.includes(k)), kind, title: well.name });
      const t: Record<string, Passage | null> = {};
      for (const s of g.sections) for (const k of s.refs) if (!(k in t)) t[k] = await loadPassage(k);
      setTexts(t); setOut(g);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not make the guide. Try again.'); } finally { setBusy(false); }
  };
  const plain = () => out ? guideToText(out, Object.fromEntries(Object.entries(texts).map(([k, p]) => [k, p?.text ?? ''])), tr.abbreviation) : '';
  const copy = async () => { try { await navigator.clipboard.writeText(plain()); nav.toast('Copied'); } catch { nav.toast('Could not copy'); } };
  const share = async () => { try { if (navigator.share) await navigator.share({ title: out?.title, text: plain() }); else await copy(); } catch { /* the person closed the share sheet */ } };
  return (
    <Sheet label="Study guide" onClose={onClose}>
      <h2>Study guide</h2>
      {!pro ? (
        <>
          <p className="mut">Turn the passages in this well into a group study or a talk outline, with questions to think about. Included with Pro.</p>
          <button className="btn primary big" onClick={() => { onClose(); openPlans(); }}>See plans</button>
        </>
      ) : !out ? (
        <>
          <div className="pills" role="group" aria-label="What to make">{(Object.keys(GUIDE_KINDS) as GuideKind[]).map((g) => <button key={g} type="button" className="pill" aria-pressed={kind === g} onClick={() => setKind(g)}>{GUIDE_KINDS[g].label}</button>)}</div>
          <p className="sm mut">{GUIDE_KINDS[kind].blurb}</p>
          <div className="label" style={{ margin: '14px 0 4px' }}>Passages to include ({pick.length} of {Math.min(keys.length, MAX_GUIDE_PASSAGES)} chosen)</div>
          {keys.length > MAX_GUIDE_PASSAGES && <p className="sm mut">A guide can hold up to {MAX_GUIDE_PASSAGES} passages.</p>}
          {keys.map((k) => <label key={k} className="check"><input type="checkbox" checked={pick.includes(k)} onChange={() => toggle(k)} /> {titleOf(k)}</label>)}
          {err && <p role="alert" className="up-error">{err}</p>}
          <button className="btn primary big" style={{ marginTop: 12 }} disabled={busy || pick.length === 0} onClick={() => void make()}>{busy ? 'Making your guide…' : 'Make the guide'}</button>
          <p className="sm mut" style={{ marginTop: 8 }}>The questions may be suggested by AI. The Scripture is never written by AI: it is the text from your own Bible, word for word.</p>
        </>
      ) : (
        <>
          <p className="sm mut">{GUIDE_KINDS[out.kind].label} · {out.label}</p>
          <h3 className="guide-title">{out.title}</h3>
          {out.opening.length > 0 && <div className="sec"><div className="b">To begin</div><ul className="guide-q">{out.opening.map((q) => <li key={q}>{q}</li>)}</ul></div>}
          {out.sections.map((s, i) => (
            <div key={s.heading + i} className="sec">
              <div className="b">{i + 1}. {s.heading}</div>
              {s.refs.map((k) => <div key={k}><div className="sm tx">{titleOf(k)} · {tr.abbreviation}</div>{texts[k] ? <p className="read" style={{ fontSize: 18, margin: '4px 0 8px' }}>{texts[k]!.verses.map((v) => <span key={v.n}>{texts[k]!.verses.length > 1 && <sup>{v.n}</sup>}{v.text} </span>)}</p> : <p className="sm mut">This passage is not on this device yet. Connect once to save it.</p>}</div>)}
              <ul className="guide-q">{s.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          ))}
          {out.closing.length > 0 && <div className="sec"><div className="b">To close</div><ul className="guide-q">{out.closing.map((q) => <li key={q}>{q}</li>)}</ul></div>}
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}><button className="btn primary" onClick={() => void copy()}>Copy as text</button><button className="btn" onClick={() => void share()}>Share</button><button className="btn" onClick={() => setOut(null)}>Change</button></div>
          <DraftBox refs={out.sections.flatMap((s) => s.refs)} title={well.name} texts={texts} translation={tr.abbreviation} />
          <p className="sm mut" style={{ marginTop: 8 }}>{out.source === 'ai' ? 'Questions were suggested by AI. ' : ''}The Scripture text is not AI-written. {tr.notice}</p>
        </>
      )}
    </Sheet>
  );
}
/** Pro: an AI-written first draft of a message from the same passages. The verses are the app's own text, word for word; only the writing around them is AI. */
function DraftBox({ refs, title, texts, translation }: { refs: string[]; title: string; texts: Record<string, Passage | null>; translation: string }) {
  const nav = useNav();
  const [tone, setTone] = useState<DraftTone>('pastoral'); const [length, setLength] = useState<DraftLength>('short');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [draft, setDraft] = useState<SermonDraft | null>(null);
  const titleOf = (k: string) => { const r = parseRefKey(k); return r ? formatReference(r) : k; };
  const make = async () => {
    setBusy(true); setErr('');
    try { setDraft(await api.apiPost<SermonDraft>('/v1/tapestry/sermon-draft', { refs, title, tone, length })); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not write the draft. Try again.'); } finally { setBusy(false); }
  };
  const plain = () => draft ? draftToText(draft, Object.fromEntries(Object.entries(texts).map(([k, p]) => [k, p?.text ?? ''])), translation) : '';
  const copy = async () => { try { await navigator.clipboard.writeText(plain()); nav.toast('Copied'); } catch { nav.toast('Could not copy'); } };
  const share = async () => { try { if (navigator.share) await navigator.share({ title: draft?.title, text: plain() }); else await copy(); } catch { /* the person closed the share sheet */ } };
  return (
    <div className="sec">
      <div className="row between"><span className="b">Message draft</span><span className="sm tx">AI</span></div>
      {!draft ? (
        <>
          <p className="sm mut">Write a first draft of a message from these passages. {DRAFT_LABEL}</p>
          <div className="pills" role="group" aria-label="Tone" style={{ marginTop: 8 }}>{([['pastoral', 'Pastoral'], ['teaching', 'Teaching']] as const).map(([v, l]) => <button key={v} type="button" className="pill" aria-pressed={tone === v} onClick={() => setTone(v)}>{l}</button>)}</div>
          <div className="pills" role="group" aria-label="Length" style={{ marginTop: 8 }}>{([['short', 'Short, about 450 words'], ['medium', 'Longer, about 800 words']] as const).map(([v, l]) => <button key={v} type="button" className="pill" aria-pressed={length === v} onClick={() => setLength(v)}>{l}</button>)}</div>
          {err && <p role="alert" className="up-error" style={{ marginTop: 8 }}>{err}</p>}
          <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={() => void make()}>{busy ? 'Writing your draft…' : 'Write a draft'}</button>
        </>
      ) : (
        <>
          <p className="sm tx" role="status">{draft.label}</p>
          <h3 className="guide-title">{draft.title}</h3>
          {draft.intro && <p>{draft.intro}</p>}
          {draft.sections.map((s, i) => (
            <div key={s.heading + i} style={{ marginTop: 12 }}>
              <div className="b">{i + 1}. {s.heading}</div>
              {s.refs.map((k) => <div key={k}><div className="sm tx">{titleOf(k)} · {translation}</div>{texts[k] && <p className="read" style={{ fontSize: 18, margin: '4px 0 8px' }}>{texts[k]!.verses.map((v) => <span key={v.n}>{texts[k]!.verses.length > 1 && <sup>{v.n}</sup>}{v.text} </span>)}</p>}</div>)}
              {s.body && <p>{s.body}</p>}
            </div>
          ))}
          {draft.closing && <p style={{ marginTop: 12 }}>{draft.closing}</p>}
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}><button className="btn primary" onClick={() => void copy()}>Copy draft</button><button className="btn" onClick={() => void share()}>Share</button><button className="btn" onClick={() => setDraft(null)}>Write another</button></div>
          <p className="sm mut" style={{ marginTop: 8 }}>The Scripture text above is not AI-written. The rest of this draft is.</p>
        </>
      )}
    </div>
  );
}
export function SaveSheet({ keys, onClose }: { keys: string[]; onClose: () => void }) {
  const nav = useNav(); const mine = useLiveQuery(() => db.wells.filter((w) => !w.deleted).toArray(), [], []); const [name, setName] = useState('');
  return (
    <Sheet label="Save to a well" onClose={onClose}>
      <h2>Save to a well</h2>
      {mine.map((w) => <button key={w.id} className="item" onClick={async () => { let n = 0; for (const k of keys) if (await addToWell(w.id, k)) n++; onClose(); nav.toast(n ? `Saved to ${w.name}` : `Already in ${w.name}`); }}><span className="well-name grow">{w.name}</span></button>)}
      <label className="field">New well<input className="text-input" placeholder="Name your well" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button className="btn primary big" disabled={!name.trim()} onClick={async () => { await createWell(name, '', keys); onClose(); nav.toast(`Saved to ${name.trim()}`); }}>Create and save</button>
    </Sheet>
  );
}
export function NewWellSheet({ onClose }: { onClose: () => void }) {
  const nav = useNav(); const [name, setName] = useState('');
  return (
    <Sheet label="New well" onClose={onClose}>
      <h2>New well</h2><label className="field">Name<input className="text-input" placeholder="For example: Verses for courage" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button className="btn primary big" disabled={!name.trim()} onClick={async () => { const id = await createWell(name); onClose(); nav.go({ t: 'well', id }); }}>Create well</button>
    </Sheet>
  );
}
