import { useEffect, useRef, useState } from 'react';
import { CHIP_TO_WELL, LINK_LABEL, STARTER_WELLS, TOPIC_CHIPS, BOOKS, classifyQuery, formatReference, parseRefKey, refKey, wellsForText, type Link } from '@wells/scripture';
import { api, supabase } from '../api';
import { getSetting, setSetting } from '../db';
import { createWell, loadPassage, searchLocal, getTranslation, type Passage } from '../data';
import { useTranslation } from '../tr';
import { Icon } from '../ui';
import { useNav } from '../nav';

interface Hit { key: string; link?: Link; reason?: string; note?: string }
interface Result { kind: string; label: string; hits: Hit[]; wellName?: string; chapters?: { code: string; n: number } }
const TRY = ['Scriptures for when I feel worried', 'Passages about trusting God in uncertainty', 'Verses for strength during hard times'];

async function run(q: string): Promise<Result> {
  const c = classifyQuery(q);
  if (c.kind === 'book') { const b = BOOKS.find((x) => x.name.toLowerCase() === c.text.toLowerCase() || x.code.toLowerCase() === c.text.toLowerCase()) ?? BOOKS.find((x) => x.name.toLowerCase().startsWith(c.text.toLowerCase())); return { kind: 'book', label: b ? `${b.name} has ${b.chapters} chapters` : '', hits: [], chapters: b ? { code: b.code, n: b.chapters } : undefined }; }
  if (c.kind === 'phrase') {
    let keys = await searchLocal(c.text);
    if (!keys.length && supabase) { const { data } = await supabase.rpc('search_verses', { p_translation: await getTranslation(), p_query: c.text, p_limit: 20 }); keys = (data ?? []).map((r: { book: number; chapter: number; verse: number }) => `${BOOKS[r.book - 1].code}.${r.chapter}.${r.verse}`); }
    if (keys.length) return { kind: 'phrase', label: 'Exact matches', hits: keys.map((key) => ({ key })) };
  }
  // Feelings and situations: curated wells first (works offline and without AI), AI ordering when the account allows it.
  if (supabase && api.apiUrl && (await supabase.auth.getSession()).data.session) {
    try { const r = await api.apiPost<{ source: string; label: string; items: Array<{ ref: string; link: Link; reason?: string; note?: string }>; wells: Array<{ name: string }> }>('/v1/tapestry/recommend', { query: q }); if (r.items.length) return { kind: 'discover', label: r.label, wellName: r.wells[0]?.name, hits: r.items.map((i) => ({ key: i.ref, link: i.link, reason: i.reason, note: i.note })) }; } catch { /* use the on-device version */ }
  }
  const hit = wellsForText(c.text)[0]; const w = STARTER_WELLS.find((x) => x.id === hit?.wellId);
  if (!w) return { kind: 'none', label: '', hits: [] };
  return { kind: 'discover', label: 'From curated wells', wellName: w.name, hits: w.items.slice(0, 6).map((i) => ({ key: i.ref, link: i.link, note: i.note })) };
}
export function Search() {
  const tr = useTranslation(); const nav = useNav(); const [q, setQ] = useState(''); const [res, setRes] = useState<Result | null>(null); const [busy, setBusy] = useState(false); const [recent, setRecent] = useState<string[]>([]); const [texts, setTexts] = useState<Record<string, Passage | null>>({}); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { void getSetting<string[]>('recent', []).then(setRecent); ref.current?.focus(); }, []);
  useEffect(() => { void (async () => { const m: Record<string, Passage | null> = {}; for (const h of (res?.hits ?? []).slice(0, 10)) m[h.key] = await loadPassage(h.key); setTexts(m); })(); }, [res]);
  const submit = async (text = q) => {
    const t = text.trim(); if (t.length < 2) return; setQ(t); setBusy(true);
    const c = classifyQuery(t); if (c.kind === 'reference' && c.ref) { await setSetting('recent', [t, ...recent.filter((x) => x !== t)].slice(0, 6)); nav.go({ t: 'passage', key: refKey(c.ref) }); setBusy(false); return; }
    const r = await run(t); setRes(r); setBusy(false); const next = [t, ...recent.filter((x) => x !== t)].slice(0, 6); setRecent(next); await setSetting('recent', next);
  };
  const snippet = (k: string) => { const p = texts[k]; return p ? (p.text.length > 150 ? `${p.text.slice(0, 147).replace(/\s+\S*$/, '')}…` : p.text) : 'Text loads once this passage has been downloaded.'; };
  return (
    <div className="stack" style={{ height: '100%' }}>
      <div className="row" style={{ padding: 'max(16px,env(safe-area-inset-top)) 24px 0' }}>
        <div className="grow row" style={{ minHeight: 48, borderRadius: 99, border: '1.5px solid var(--ink)', padding: '0 14px' }}><span className="mut"><Icon n="search" s={20} /></span>
          <input ref={ref} className="grow" style={{ all: 'unset', flex: 1, minHeight: 44, fontSize: 16 }} aria-label="Search or ask in your own words" placeholder="Search or ask in your own words" value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setRes(null); }} onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} enterKeyHint="search" />
          {q && <button className="icon-btn plain" style={{ width: 32, height: 32, flex: 'none' }} aria-label="Clear" onClick={() => { setQ(''); setRes(null); ref.current?.focus(); }}><Icon n="x" s={20} /></button>}</div>
        <button className="btn" style={{ border: 0, padding: '0 6px', marginLeft: 6 }} onClick={nav.back}>Cancel</button></div>
      <div className="screen" style={{ paddingTop: 0 }}>
        {!res && !busy && <>
          <div className="pills" style={{ marginBottom: 12 }}><span className="pill">{tr.name}</span><span className="pill">All books</span><span className="pill">Any length</span></div>
          <p className="mut" style={{ fontSize: 15 }}>Type a reference like John 3:16, a phrase, a topic, or how you feel. Tapestry works out which.</p>
          {recent.length > 0 && <><div className="label" style={{ margin: '18px 0 4px' }}>Recent</div>{recent.map((r) => <button key={r} className="item" style={{ fontWeight: 500, fontSize: 17 }} onClick={() => void submit(r)}>{r}</button>)}</>}
          <div className="label" style={{ margin: '18px 0 4px' }}>Try asking</div>{TRY.map((r) => <button key={r} className="item" style={{ fontWeight: 500, fontSize: 17 }} onClick={() => void submit(r)}>{r}</button>)}
          <div className="label" style={{ margin: '18px 0 8px' }}>Browse by topic</div><div className="pills">{TOPIC_CHIPS.map((t) => <button key={t} className="pill" onClick={() => { nav.back(); nav.go({ t: 'well', id: CHIP_TO_WELL[t] }); }}>{t}</button>)}</div></>}
        {busy && <p className="mut" role="status">Searching…</p>}
        {res?.kind === 'none' && <p className="mut" role="status">Nothing matched. Try a feeling or situation (“worried about work”), a reference (“Psalm 23”), or words from a passage.</p>}
        {res?.kind === 'book' && res.chapters && <><p className="mut">{res.label}</p><div className="pills" style={{ marginTop: 10 }}>{Array.from({ length: res.chapters.n }, (_, i) => <button key={i} className="pill" onClick={() => nav.go({ t: 'passage', key: `${res.chapters!.code}.${i + 1}` })}>{i + 1}</button>)}</div></>}
        {res && res.hits.length > 0 && <>
          <div className="sm tx" style={{ fontWeight: 500 }}>{res.label === 'Suggested by AI' ? 'Suggested by AI' : res.label}{res.wellName ? ` · ${res.wellName}` : ''}</div>
          {res.hits.map((h) => { const r = parseRefKey(h.key); return (
            <div key={h.key} className="row sec" style={{ alignItems: 'flex-start' }}>
              <button style={{ all: 'unset', cursor: 'pointer', flex: 1 }} onClick={() => nav.go({ t: 'passage', key: h.key })}><div className="b" style={{ fontSize: 15 }}>{r ? formatReference(r) : h.key}</div>{h.link && <div className="sm tx" style={{ margin: '2px 0 6px' }}>{LINK_LABEL[h.link]}</div>}<div className="serif" style={{ fontSize: 20, lineHeight: 1.35 }}>{snippet(h.key)}</div>{h.reason && <div className="sm mut" style={{ marginTop: 4 }}>{h.reason}</div>}{h.note && <div className="sm mut" style={{ marginTop: 4 }}>{h.note}</div>}</button>
              <button className="icon-btn" aria-label={`Save ${r ? formatReference(r) : ''} to a well`} onClick={() => nav.save([h.key])}><Icon n="plus" /></button></div>); })}
          <p className="sm mut">The passages are Scripture ({tr.name}). Only the order and labels are suggested{res.label === 'Suggested by AI' ? ' by AI' : ' from curated wells'}.</p>
          {res.kind === 'discover' && <button className="btn primary big" style={{ marginTop: 14 }} onClick={async () => { const id = await createWell(res.wellName ?? q, `Passages for: ${q}`, res.hits.map((h) => h.key), 'ai'); nav.toast('Well created'); nav.back(); nav.go({ t: 'well', id }); }}>Make a well from these</button>}</>}
      </div>
    </div>
  );
}
