import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Sheet } from '@wells/ui';
import { STARTER_WELLS, LINK_LABEL, estimateMinutes, formatReference, parseRefKey, wellsForText } from '@wells/scripture';
import { db } from '../db';
import { api, supabase } from '../api';
import { addToWell, copyStarter, createWell, deleteWell, moveItem, removeItem, wellView, type WellView } from '../data';
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
  const nav = useNav(); const pl = usePlayer(); const [w, setW] = useState<WellView | null>(null);
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
        {w.starter && <button className="btn big" onClick={async () => { const n = await copyStarter(id); if (n) { nav.toast('Saved to your wells'); nav.go({ t: 'well', id: n }); } }}>Save as my well</button>}
      </div>
      <div style={{ marginTop: 16 }}>{w.items.map((it, i) => { const r = parseRefKey(it.key); return (
        <div key={it.key} className="item" style={{ alignItems: 'flex-start' }}>
          <button style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', gap: 14 }} onClick={() => nav.go({ t: 'passage', key: it.key, wellId: id })}><span className="no" style={{ fontWeight: 700, color: 'var(--mut)', width: 28 }}>{String(i + 1).padStart(2, '0')}</span><span><span className="t">{r ? formatReference(r) : it.key}</span>{it.link && <span className="sm tx" style={{ display: 'block' }}>{LINK_LABEL[it.link as keyof typeof LINK_LABEL]}</span>}{it.note && <span className="sm mut" style={{ display: 'block' }}>{it.note}</span>}</span></button>
          {!w.starter && it.id && <span className="row" style={{ gap: 0 }}><button className="icon-btn plain" aria-label="Move up" disabled={i === 0} onClick={() => void moveItem(id, it.id!, -1)}><Icon n="up" s={20} /></button><button className="icon-btn plain" aria-label="Move down" disabled={i === w.items.length - 1} onClick={() => void moveItem(id, it.id!, 1)}><Icon n="down" s={20} /></button><button className="icon-btn plain" aria-label={`Remove ${r ? formatReference(r) : ''}`} onClick={() => void removeItem(it.id!)}><Icon n="x" s={20} /></button></span>}
        </div>); })}</div>
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
