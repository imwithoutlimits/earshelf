import { player, usePlayer } from '../audio';
import { Icon, PauseGlyph, PlayGlyph, Waveform, fmt } from '../ui';
import { useNav } from '../nav';
import { db } from '../db';
import { uid } from '@wells/offline';
import { award } from '../activity';

export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const p = usePlayer(); const it = p.queue[p.index]; if (!it) return null;
  return (
    <div className="mini"><button className="play" aria-label={p.playing ? 'Pause' : 'Play'} onClick={() => player.toggle()}>{p.playing ? <PauseGlyph /> : <PlayGlyph />}</button>
      <button className="grow" style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={onOpen} aria-label="Open player"><div className="b" style={{ fontSize: 15 }}>{it.title}</div><div className="sm mut">{it.wellName ? `${it.wellName} · ` : ''}{(p.queue[0]?.index ?? 0) + p.index + 1} of {(p.queue[0]?.index ?? 0) + p.queue.length}</div></button></div>
  );
}
export function PlayerView() {
  const nav = useNav(); const p = usePlayer(); const it = p.queue[p.index];
  if (!it) return <div className="screen"><button className="icon-btn plain" aria-label="Close player" onClick={nav.back}><Icon n="down" s={28} /></button><p className="mut">Nothing is playing. Choose a well or a passage to listen.</p></div>;
  const cut = p.charPos; const after = it.text.slice(cut); const m = /^(\s*)(\S+)/.exec(after); const word = m?.[2] ?? ''; const before = it.text.slice(0, cut) + (m?.[1] ?? ''); const rest = after.slice((m?.[0] ?? '').length); const off = p.queue[0]?.index ?? 0;
  return (
    <div className="screen stack" style={{ height: '100%' }}>
      <div className="row between"><button className="icon-btn plain" aria-label="Close player" onClick={nav.back} style={{ marginLeft: -10 }}><Icon n="down" s={28} /></button><div style={{ textAlign: 'center' }}><div className="label" style={{ fontSize: 12 }}>Playing from</div><div className="b" style={{ fontSize: 15 }}>{it.wellName ?? 'Single passage'}</div></div><div style={{ width: 34 }} /></div>
      <div><div className="serif" style={{ fontSize: 34, fontWeight: 500, lineHeight: 1.1 }}>{it.title}</div><div className="sm mut" style={{ marginTop: 4 }}>World English Bible · passage {off + p.index + 1} of {off + p.queue.length}{p.silence ? ' · scripture, then silence' : ''}</div></div>
      <div role="slider" aria-label="Playback position" aria-valuemin={0} aria-valuemax={Math.round(p.total)} aria-valuenow={Math.round(p.elapsed)} style={{ marginTop: 6 }}><Waveform progress={p.progress} live={p.playing} /></div>
      <div className="row between sm mut" style={{ marginTop: -6 }}><span>{fmt(p.elapsed)}</span><span>{p.waiting ? 'Silence…' : `−${fmt(Math.max(0, p.total - p.elapsed))}`}</span></div>
      <p className="read" style={{ margin: '4px 0 0' }} aria-live="off"><span className="mut">{before}</span>{word && <mark>{word}</mark>}<span className="mut">{rest}</span></p>
      {p.voiceless && <p className="sm mut" role="status">No voice is available in this browser, so the page follows along silently. On a phone or a desktop browser with voices installed it will read aloud.</p>}
      <div className="row between" style={{ marginTop: 'auto' }}>
        <button className="icon-btn plain" aria-label="Replay sentence" onClick={() => player.replaySentence()}><Icon n="replay" s={28} /></button>
        <button className="icon-btn plain" aria-label="Back 15 seconds" onClick={() => player.skip(-15)}><Icon n="back" s={28} /></button>
        <button className="play lg" aria-label={p.playing ? 'Pause' : 'Play'} onClick={() => player.toggle()}>{p.playing ? <PauseGlyph s={30} /> : <PlayGlyph s={30} />}</button>
        <button className="icon-btn plain" aria-label="Forward 30 seconds" onClick={() => player.skip(30)}><Icon n="fwd" s={28} /></button>
        <button className="icon-btn plain" aria-label="Next passage" onClick={() => player.next()}><Icon n="next" s={28} /></button>
      </div>
      <div className="row hair" style={{ paddingTop: 10 }}>
        {[{ l: `${p.rate.toFixed(1)}×`, a: 'Speed', f: () => player.setRate(p.rate >= 1.3 ? 0.7 : Math.round((p.rate + 0.2) * 10) / 10) }, { l: <Icon n="moon" />, a: p.sleepAt ? 'Sleep timer on' : 'Sleep timer', f: () => player.setSleep(p.sleepAt ? null : 15) }, { l: <Icon n="repeat" />, a: `Repeat ${p.repeat}`, f: () => player.setMode({ repeat: p.repeat === 'off' ? 'one' : p.repeat === 'one' ? 'all' : 'off' }) }, { l: <Icon n="mark" />, a: 'Bookmark', f: async () => { await db.bookmarks.add({ id: uid(), ref: it.key, createdAt: Date.now() }); await award('save_passage', it.key); nav.toast('Bookmarked'); } }, { l: <Icon n="note" />, a: 'Note', f: () => nav.go({ t: 'passage', key: it.key }) }].map((b) => (
          <button key={b.a} className="grow" style={{ background: 'none', border: 0, minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 12 }} onClick={() => void b.f()} aria-label={b.a}><span style={{ fontWeight: 700, fontSize: 16, display: 'flex' }}>{b.l}</span>{b.a.split(' ')[0]}</button>))}
      </div>
    </div>
  );
}
