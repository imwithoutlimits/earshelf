import { useEffect, useRef, useState } from 'react';
import { DRAMATIZED_NOTE, NARRATION_TRANSLATIONS } from '@wells/scripture';
import { openPlans } from '@wells/ui';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { api } from '../api';
import { player } from '../audio';
import { usePlan } from '../billing';
import { useTranslation } from '../tr';
import { UpgradeNote } from '../ui';

interface Part { chunkIndex: number; chunkCount: number; durationMs: number; url: string; verses: Array<{ n: number; startMs: number }>; note?: string }

/**
 * Plus: listen to a passage in the natural voice. The audio is made part by part when asked for and is never saved on the server,
 * so listening again makes it again. Only for public domain translations. It stops the phone's own voice while it plays.
 */
export function NaturalListen({ k }: { k: string }) {
  const plan = usePlan(); const tr = useTranslation();
  const allowed = hasFeature(plan, 'natural_tts'); const narratable = NARRATION_TRANSLATIONS.includes(tr.id); const canDrama = hasFeature(plan, 'dramatized_audio');
  const [drama, setDrama] = useState(false); const dramatized = drama && canDrama;
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [part, setPart] = useState<{ i: number; of: number } | null>(null); const [verse, setVerse] = useState<number | null>(null); const [err, setErr] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null); const token = useRef(0); const parts = useRef(new Map<number, Promise<Part>>());

  const fetchPart = (i: number): Promise<Part> => {
    let p = parts.current.get(i);
    if (!p) { p = api.apiPost<Part>('/v1/tapestry/narrate', { ref: k, translation: tr.id, chunk: i, mode: dramatized ? 'dramatized' : 'single' }); parts.current.set(i, p); p.catch(() => parts.current.delete(i)); }
    return p;
  };
  const stop = () => { token.current += 1; audio.current?.pause(); audio.current = null; parts.current.clear(); setState('idle'); setPart(null); setVerse(null); };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stop(); setErr(''); }, [k, tr.id, dramatized]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = async (i: number, my: number) => {
    try {
      setState('loading');
      const cur = await fetchPart(i);
      if (my !== token.current) return;
      setPart({ i: cur.chunkIndex + 1, of: cur.chunkCount });
      const a = new Audio(cur.url); audio.current = a;
      a.ontimeupdate = () => { const t = a.currentTime * 1000; setVerse([...cur.verses].reverse().find((v) => v.startMs <= t)?.n ?? cur.verses[0]?.n ?? null); };
      a.onended = () => { if (my !== token.current) return; if (i + 1 < cur.chunkCount) void play(i + 1, my); else stop(); };
      a.onerror = () => { if (my === token.current) { setErr('The audio could not play. Try again.'); stop(); } };
      await a.play();
      setState('playing');
      if (i + 1 < cur.chunkCount) void fetchPart(i + 1).catch(() => {}); // get the next part ready while this one plays
    } catch (e) { if (my === token.current) { setErr(e instanceof Error ? e.message : 'Could not start the natural voice.'); stop(); } }
  };
  const start = () => { setErr(''); if (player.get().playing) player.pause(); const my = ++token.current; parts.current.clear(); void play(0, my); };
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) { void a.play(); setState('playing'); } else { a.pause(); setState('paused'); } };

  if (!allowed) return <UpgradeNote>Natural voice reading of Scripture is included with Plus.</UpgradeNote>;
  if (!narratable) return <p className="sm mut" style={{ margin: '10px 0' }}>Natural voice reading is available for the World English Bible, King James Version and American Standard Version. Choose one of them in Profile.</p>;
  return (
    <div className="sec" style={{ marginTop: 12 }}>
      <div className="row between"><span className="b">Natural voice</span><span className="sm tx">Plus</span></div>
      <div className="pills" role="group" aria-label="Voices" style={{ marginTop: 8 }}>
        <button type="button" className="pill" aria-pressed={!dramatized} onClick={() => setDrama(false)}>One voice</button>
        <button type="button" className="pill" aria-pressed={dramatized} onClick={() => { if (canDrama) setDrama(true); else openPlans(); }}>Dramatized{canDrama ? '' : ' (Pro)'}</button>
      </div>
      {dramatized && <p className="sm mut" style={{ marginTop: 6 }}>{DRAMATIZED_NOTE}</p>}
      {!canDrama && <p className="sm mut" style={{ marginTop: 6 }}>Dramatized reading gives a narrator, God and Jesus, and other speakers their own voices. Included with Pro.</p>}
      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {state === 'idle' ? <button className="btn" onClick={start}>Listen</button> : <><button className="btn" onClick={toggle} disabled={state === 'loading'}>{state === 'paused' ? 'Resume' : 'Pause'}</button><button className="btn" onClick={stop}>Stop</button></>}
      </div>
      {state !== 'idle' && <p className="sm mut" role="status" style={{ marginTop: 8 }}>{state === 'loading' ? 'Getting the voice ready…' : `Part ${part?.i ?? 1} of ${part?.of ?? 1}${verse ? ` · verse ${verse}` : ''}`}</p>}
      {err && <p role="alert" className="up-error" style={{ marginTop: 8 }}>{err}</p>}
      <p className="sm mut" style={{ marginTop: 8 }}>Made when you press Listen, so it can take a moment to start. Counts toward your monthly natural voice time.</p>
    </div>
  );
}
