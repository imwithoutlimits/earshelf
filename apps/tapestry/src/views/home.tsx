import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, getSetting, setSetting } from '../db';
import { wellView, loadPassage, progressOf, type WellView, type Passage } from '../data';
import { summary } from '../activity';
import { player, usePlayer } from '../audio';
import { Constellation, Icon, PlayGlyph, Ring, Seg } from '../ui';
import { useNav } from '../nav';
import { formatReference, parseRefKey } from '@wells/scripture';

/** The opening sentence or two of a passage, ending where a sentence ends. */
const lead = (t: string) => { const sx = t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [t]; let o = ''; for (const x of sx) { if ((o + x).trim().length > 90 && o) break; o += x; } return o.trim() || t.slice(0, 110); };
export const queueFor = async (w: WellView, from = 0) => {
  const out = []; for (let i = from; i < w.items.length; i++) { const p = await loadPassage(w.items[i].key); if (p) out.push({ key: p.key, title: p.title, text: p.text, wellId: w.id, wellName: w.name, index: i }); } return out;
};
export function Home() {
  const nav = useNav(); const pl = usePlayer();
  const [well, setWell] = useState<WellView | null>(null); const [idx, setIdx] = useState(0); const [p, setP] = useState<Passage | null>(null);
  const [after, setAfter] = useState<'scripture' | 'reflect' | 'journal'>('reflect'); const [prompt, setPrompt] = useState('');
  const sum = useLiveQuery(summary, [], null); const wellId = useLiveQuery(() => getSetting('currentWell', 'courage-for-difficult-days'), [], 'courage-for-difficult-days');
  const prog = useLiveQuery(() => db.progress.toArray(), [], []);
  useEffect(() => { void (async () => { const w = await wellView(wellId) ?? await wellView('courage-for-difficult-days'); if (!w) return; const i = Math.min(await progressOf(w.id), Math.max(0, w.items.length - 1)); setWell(w); setIdx(i); setP(await loadPassage(w.items[i]?.key ?? '')); })(); }, [wellId, prog]);
  if (!well) return <div className="screen"><p className="mut">Loading…</p></div>;
  const listened = Math.min(idx, well.items.length); const upNext = well.items.slice(idx + 1, idx + 3);
  const text = p?.text ?? ''; const ref = parseRefKey(well.items[idx]?.key ?? '');
  const listen = async () => { if (pl.playing && pl.queue[0]?.wellId === well.id) { player.toggle(); return; } const q = await queueFor(well, idx); if (q.length) { player.setMode({ silence: after !== 'scripture' || true }); player.play(q); } else nav.toast('This passage is not on this device yet. Connect once to download it.'); };
  return (
    <div className="screen">
      <div className="row between"><div><div className="label">{new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div><div className="b" style={{ fontSize: 16 }}>{well.name}</div></div>
        <button className="icon-btn" aria-label="Search" onClick={() => nav.go({ t: 'search' })}><Icon n="search" /></button></div>
      {sum && <button className="row sec" style={{ marginTop: 12, borderBottom: '1px solid var(--line)', background: 'none', border: 0, borderTop: '1px solid var(--line)', width: '100%', textAlign: 'left' }} onClick={() => nav.tab('activity')}>
        <Ring done={sum.weekly.done} target={sum.weekly.target} /><div className="grow"><div className="b">{sum.thread.count}-day thread</div><div className="sm mut">{sum.thread.atRisk ? 'Listen today to keep it' : sum.weekly.met ? 'Weekly target reached' : `${sum.weekly.remaining} more ${sum.weekly.remaining === 1 ? 'day' : 'days'} to your weekly target`}</div></div><span className="mut"><Icon n="right" s={20} /></span></button>}
      <div style={{ marginTop: 6 }}><Constellation n={well.items.length} done={listened} label={`${well.items.length} passages in ${well.name}; ${listened} listened, today's is the large star`} /></div>
      <p className="sm mut">Each star is a passage in this well. The large star is today's.</p>
      <div style={{ marginTop: 14 }}>
        {p ? <button style={{ all: 'unset', cursor: 'pointer', display: 'block' }} onClick={() => nav.go({ t: 'passage', key: p.key, wellId: well.id })}><h1 className="verse">{lead(text)}</h1></button> : <h1 className="verse">{ref ? formatReference(ref) : '—'}</h1>}
        <p className="mut" style={{ marginTop: 10, fontWeight: 500, fontSize: 15 }}>{ref ? formatReference(ref) : ''} · World English Bible{!p && ' · text loads after the first download'}</p>
        <button className="btn primary big" style={{ marginTop: 18 }} onClick={() => void listen()}><PlayGlyph />{pl.playing && pl.queue[0]?.wellId === well.id ? 'Pause' : 'Listen, then silence'}</button>
        <div className="label" style={{ margin: '16px 0 6px' }}>After the passage</div>
        <Seg label="After the passage" value={after} options={[['scripture', 'Scripture only'], ['reflect', '+ Reflection'], ['journal', '+ Journal']]} onChange={async (v) => { setAfter(v); setPrompt(v === 'scripture' ? '' : (well.prompts[idx % Math.max(1, well.prompts.length)] ?? 'What phrase stands out to you?')); await setSetting('after', v); }} />
        {after !== 'scripture' && <div className="sec" style={{ border: 0 }}><div className="sm tx">Editorial prompt</div><div className="serif" style={{ fontSize: 20, lineHeight: 1.35, marginTop: 2 }}>{prompt || well.prompts[0] || 'What phrase stands out to you?'}</div>{after === 'journal' && p && <button className="btn" style={{ marginTop: 10 }} onClick={() => nav.go({ t: 'passage', key: p.key, wellId: well.id })}>Write a note</button>}</div>}
      </div>
      {upNext.length > 0 && <div style={{ marginTop: 18 }}><div className="sm tx" style={{ fontWeight: 500, marginBottom: 4 }}>Up next in this well</div>{upNext.map((it, k) => { const r = parseRefKey(it.key); return <button key={it.key} className="item" onClick={() => nav.go({ t: 'passage', key: it.key, wellId: well.id })}><span className="no">{String(idx + k + 2).padStart(2, '0')}</span><span className="t grow">{r ? formatReference(r) : it.key}</span></button>; })}</div>}
    </div>
  );
}
