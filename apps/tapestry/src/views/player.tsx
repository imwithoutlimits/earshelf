import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sheet } from '@wells/ui';
import { player, usePlayer } from '../audio';
import { Icon, PauseGlyph, PlayGlyph, fmt } from '../ui';
import { LiveWave } from '../livewave';
import { useNav } from '../nav';
import { useTranslation } from '../tr';
import { db } from '../db';
import { uid } from '@wells/offline';
import { award } from '../activity';
import { AmbientControls } from './ambient';

/** True only once `flag` has stayed on for `ms`. A voice that is ready in a moment never shows a "getting ready" message at all. */
function useAfter(flag: boolean, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { if (!flag) { setOn(false); return; } const t = setTimeout(() => setOn(true), ms); return () => clearTimeout(t); }, [flag, ms]);
  return on;
}

export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const p = usePlayer(); const it = p.queue[p.index]; const slow = useAfter(p.loading, 1200); if (!it) return null;
  return (
    <div className="mini"><button className="play" aria-label={p.playing ? 'Pause' : 'Play'} onClick={() => player.toggle()}>{p.playing ? <PauseGlyph /> : <PlayGlyph />}</button>
      <button className="grow" style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={onOpen} aria-label="Open player"><div className="b" style={{ fontSize: 15 }}>{it.title}</div><div className="sm mut">{slow ? 'Getting the voice ready…' : <>{it.wellName ? `${it.wellName} · ` : ''}{(p.queue[0]?.index ?? 0) + p.index + 1} of {(p.queue[0]?.index ?? 0) + p.queue.length}</>}</div></button></div>
  );
}

const SLEEP_OPTIONS: Array<[string, number | null]> = [['Off', null], ['5 minutes', 5], ['10 minutes', 10], ['15 minutes', 15], ['30 minutes', 30], ['45 minutes', 45], ['60 minutes', 60]];

/** Stops the reading after the chosen time. The moon is lit and counts down while it is on. */
function SleepSheet({ onClose, current }: { onClose: () => void; current: number | null }) {
  const left = current ? Math.max(1, Math.ceil((current - Date.now()) / 60_000)) : null;
  return (
    <Sheet label="Sleep timer" onClose={onClose}>
      <h2>Sleep timer</h2>
      <p className="mut">{left ? `Stops in about ${left} minute${left === 1 ? '' : 's'}.` : 'The reading stops by itself after the time you choose.'}</p>
      <div>{SLEEP_OPTIONS.map(([label, min]) => <button key={label} type="button" className="opt" aria-pressed={min === null ? !current : false} onClick={() => { player.setSleep(min); onClose(); }}>{label}</button>)}</div>
    </Sheet>
  );
}

export function PlayerView() {
  const tr = useTranslation(); const nav = useNav(); const p = usePlayer(); const it = p.queue[p.index];
  const marked = useLiveQuery(() => (it ? db.bookmarks.where('ref').equals(it.key).count() : Promise.resolve(0)), [it?.key], 0);
  const [sleepOpen, setSleepOpen] = useState(false); const mark = useRef<HTMLElement>(null); const slow = useAfter(p.loading, 1200);
  const cut = p.charPos;
  useEffect(() => { if (p.playing) mark.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [cut, p.playing]);
  if (!it) return <div className="screen"><button className="icon-btn plain" aria-label="Close player" onClick={nav.back}><Icon n="down" s={28} /></button><p className="mut">Nothing is playing. Choose a well or a passage to listen.</p></div>;
  const after = it.text.slice(cut); const m = /^(\s*)(\S+)/.exec(after); const word = m?.[2] ?? ''; const before = it.text.slice(0, cut) + (m?.[1] ?? ''); const rest = after.slice((m?.[0] ?? '').length); const off = p.queue[0]?.index ?? 0;
  const sleepLeft = p.sleepAt ? Math.max(1, Math.ceil((p.sleepAt - Date.now()) / 60_000)) : null;
  const toggleMark = async () => { if (marked) await db.bookmarks.where('ref').equals(it.key).delete(); else { await db.bookmarks.add({ id: uid(), ref: it.key, createdAt: Date.now() }); await award('save_passage', it.key); } };
  const repeatLabel = p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeat all' : 'Repeat one';
  const controls: Array<{ key: string; glyph: ReactNode; label: string; aria: string; on: boolean; f: () => void }> = [
    { key: 'speed', glyph: `${p.rate.toFixed(1)}×`, label: 'Speed', aria: `Speed ${p.rate.toFixed(1)} times. Change`, on: false, f: () => player.setRate(p.rate >= 1.3 ? 0.7 : Math.round((p.rate + 0.2) * 10) / 10) },
    { key: 'sleep', glyph: <Icon n="moon" fill={!!p.sleepAt} />, label: sleepLeft ? `${sleepLeft} min` : 'Sleep', aria: p.sleepAt ? `Sleep timer on, about ${sleepLeft} minutes left` : 'Sleep timer', on: !!p.sleepAt, f: () => setSleepOpen(true) },
    { key: 'repeat', glyph: <Icon n={p.repeat === 'one' ? 'repeat1' : 'repeat'} />, label: repeatLabel, aria: p.repeat === 'off' ? 'Repeat is off' : p.repeat === 'all' ? 'Repeating the whole well' : 'Repeating this passage', on: p.repeat !== 'off', f: () => player.setMode({ repeat: p.repeat === 'off' ? 'all' : p.repeat === 'all' ? 'one' : 'off' }) },
    { key: 'mark', glyph: <Icon n="mark" fill={!!marked} />, label: 'Bookmark', aria: marked ? 'Remove bookmark' : 'Bookmark this passage', on: !!marked, f: () => void toggleMark() },
    { key: 'note', glyph: <Icon n="note" />, label: 'Note', aria: 'Write a note', on: false, f: () => nav.go({ t: 'passage', key: it.key }) },
  ];
  return (
    <div className="screen stack" style={{ height: '100%' }}>
      <div className="row between"><button className="icon-btn plain" aria-label="Close player" onClick={nav.back} style={{ marginLeft: -10 }}><Icon n="down" s={28} /></button><div style={{ textAlign: 'center' }}><div className="label" style={{ fontSize: 12 }}>Playing from</div><div className="b" style={{ fontSize: 15 }}>{it.wellName ?? 'Single passage'}</div></div><div style={{ width: 34 }} /></div>
      <div><div className="serif" style={{ fontSize: 34, fontWeight: 500, lineHeight: 1.1 }}>{it.title}</div><div className="sm mut" style={{ marginTop: 4 }}>{tr.name} · passage {off + p.index + 1} of {off + p.queue.length}{p.engine === 'natural' && !p.loading ? ' · natural voice' : ''}{p.silence ? ' · scripture, then silence' : ''}</div></div>
      <div role="slider" aria-label="Playback position" aria-valuemin={0} aria-valuemax={Math.round(p.total)} aria-valuenow={Math.round(p.elapsed)} style={{ marginTop: 6 }}><LiveWave text={it.text} /></div>
      <div className="row between sm mut" style={{ marginTop: -6 }}><span>{fmt(p.elapsed)}</span><span>{slow ? 'Getting the voice ready…' : p.waiting ? 'Silence…' : `−${fmt(Math.max(0, p.total - p.elapsed))}`}</span></div>
      <p className="read" style={{ margin: '4px 0 0' }} aria-live="off"><span className="said">{before}</span>{word && <mark ref={mark}>{word}</mark>}<span className="mut">{rest}</span></p>
      {p.note && <p className="sm mut" role="status">{p.note}</p>}
      {p.voiceless && <p className="sm mut" role="status">No voice is available in this browser, so the page follows along silently. On a phone or a desktop browser with voices installed it will read aloud.</p>}
      <div className="row between" style={{ marginTop: 'auto' }}>
        <button className="icon-btn plain" aria-label="Replay sentence" onClick={() => player.replaySentence()}><Icon n="replay" s={28} /></button>
        <button className="icon-btn plain" aria-label="Back 15 seconds" onClick={() => player.skip(-15)}><Icon n="back" s={28} /></button>
        <button className="play lg" aria-label={p.playing ? 'Pause' : 'Play'} onClick={() => player.toggle()}>{p.playing ? <PauseGlyph s={30} /> : <PlayGlyph s={30} />}</button>
        <button className="icon-btn plain" aria-label="Forward 30 seconds" onClick={() => player.skip(30)}><Icon n="fwd" s={28} /></button>
        <button className="icon-btn plain" aria-label="Next passage" onClick={() => player.next()}><Icon n="next" s={28} /></button>
      </div>
      <div className="row hair" style={{ paddingTop: 10 }}>
        {controls.map((b) => <button key={b.key} className="grow ctl" aria-pressed={b.on} aria-label={b.aria} onClick={b.f}><span className="g">{b.glyph}</span>{b.label}</button>)}
      </div>
      <AmbientControls />
      {sleepOpen && <SleepSheet current={p.sleepAt} onClose={() => setSleepOpen(false)} />}
    </div>
  );
}
