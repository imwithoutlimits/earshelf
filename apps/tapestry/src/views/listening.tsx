import { useEffect, useState } from 'react';
import { DRAMATIZED_NOTE, NARRATION_TRANSLATIONS } from '@wells/scripture';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { openPlans } from '@wells/ui';
import { useUser } from '@wells/auth';
import { api } from '../api';
import { player, saveVoicePrefs, sharedAudio, unlockAudio, usePlayer, usePrefs } from '../audio';
import { getTranslation } from '../data';
import { usePlan } from '../billing';
import { Seg } from '../ui';
import { AmbientControls } from './ambient';

interface VoiceInfo { id: string; name: string; lang?: string }
const SPEEDS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3];

/**
 * How Tapestry sounds, everywhere: in passages, in wells and in the player. The voice, the way it reads, its speed and the soundscape are set once here.
 * The natural voice is for everyone. Free accounts have a daily allowance; Plus and Pro have a much larger monthly one.
 */
export function ListeningSettings({ onSignIn }: { onSignIn: () => void }) {
  const user = useUser(); const plan = usePlan(); const prefs = usePrefs(); const pl = usePlayer();
  const canDrama = hasFeature(plan, 'dramatized_audio');
  const [voices, setVoices] = useState<VoiceInfo[] | null>(null); const [voiceErr, setVoiceErr] = useState('');
  const [sample, setSample] = useState<'idle' | 'loading' | 'playing'>('idle'); const [sampleErr, setSampleErr] = useState('');
  useEffect(() => {
    if (!user || prefs.mode !== 'natural') return;
    let live = true;
    api.apiGet<VoiceInfo[]>('/v1/voices?provider=kokoro').then((v) => { if (live) { setVoices(v); setVoiceErr(''); } }).catch(() => { if (live) setVoiceErr('The list of voices is not available right now. The standard natural voice will be used.'); });
    return () => { live = false; };
  }, [user?.user.id, prefs.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const hear = async () => {
    if (sample === 'playing') { sharedAudio().pause(); setSample('idle'); return; }
    setSampleErr(''); setSample('loading'); player.pause(); unlockAudio(); // inside the tap
    try {
      const trId = await getTranslation();
      const part = await api.apiPost<{ url: string }>('/v1/tapestry/narrate', { ref: 'JHN.1.1-3', translation: NARRATION_TRANSLATIONS.includes(trId) ? trId : 'engwebp', chunk: 0, mode: 'single', voice: prefs.voice || undefined });
      const a = sharedAudio(); a.onended = () => setSample('idle'); a.onerror = () => setSample('idle'); a.src = part.url; a.playbackRate = 1; await a.play(); setSample('playing');
    } catch (e) {
      setSample('idle');
      const code = (e as { code?: string })?.code;
      setSampleErr(code === 'limit_reached' ? 'Today’s free natural voice time is used up. It resets tomorrow.' : e instanceof Error ? e.message : 'Could not play a sample.');
    }
  };

  return (
    <div className="sec">
      <div className="b">Listening</div>
      <p className="mut sm" style={{ marginTop: 4 }}>These choices apply everywhere: passages, wells and the player.</p>
      <div style={{ marginTop: 12 }}><Seg label="Voice" value={prefs.mode} onChange={(m) => void saveVoicePrefs({ mode: m })} options={[['natural', 'Natural voice'], ['device', 'Phone voice']]} /></div>
      {prefs.mode === 'device' && <p className="sm mut" style={{ marginTop: 8 }}>The voice built into this phone or browser. It works offline and has no limit.</p>}
      {prefs.mode === 'natural' && <>
        {!user && <p className="sm mut" style={{ marginTop: 8 }}>Sign in to use natural voices. Until then the phone’s own voice reads. <button type="button" className="link-btn" style={{ minHeight: 0 }} onClick={onSignIn}>Sign in</button></p>}
        <p className="sm mut" style={{ marginTop: 8 }}>{plan === 'free' ? 'Free accounts get up to 20 minutes of natural voice each day, then the phone’s voice takes over. Plus and Pro have much more.' : 'Included in your plan, with a generous monthly allowance.'} Natural voices read the World English Bible, King James Version and American Standard Version.</p>
        <div className="label" style={{ margin: '14px 0 6px' }}>How it reads</div>
        <div className="pills" role="group" aria-label="How it reads">
          <button type="button" className="pill" aria-pressed={prefs.style === 'single'} onClick={() => void saveVoicePrefs({ style: 'single' })}>One voice</button>
          <button type="button" className="pill" aria-pressed={prefs.style === 'dramatized' && canDrama} onClick={() => { if (canDrama) void saveVoicePrefs({ style: 'dramatized' }); else openPlans(); }}>Dramatized{canDrama ? '' : ' (Pro)'}</button>
        </div>
        {prefs.style === 'dramatized' && canDrama && <p className="sm mut" style={{ marginTop: 6 }}>{DRAMATIZED_NOTE}</p>}
        {!canDrama && <p className="sm mut" style={{ marginTop: 6 }}>Dramatized reading gives a narrator, God and Jesus, and other speakers their own voices. Included with Pro.</p>}
        <div className="label" style={{ margin: '14px 0 6px' }}>Voice</div>
        <div className="pills" role="group" aria-label="Voice">
          <button type="button" className="pill" aria-pressed={!prefs.voice} onClick={() => void saveVoicePrefs({ voice: '' })}>Automatic</button>
          {(voices ?? []).map((v) => <button key={v.id} type="button" className="pill" aria-pressed={prefs.voice === v.id} onClick={() => void saveVoicePrefs({ voice: v.id })}>{v.name}</button>)}
        </div>
        {voiceErr && <p className="sm mut" style={{ marginTop: 6 }}>{voiceErr}</p>}
        {prefs.style === 'dramatized' && canDrama && <p className="sm mut" style={{ marginTop: 6 }}>In a dramatized reading the voice you pick is the narrator.</p>}
        {user && <button type="button" className="btn" style={{ marginTop: 10 }} disabled={sample === 'loading'} onClick={() => void hear()}>{sample === 'loading' ? 'Getting a sample…' : sample === 'playing' ? 'Stop sample' : 'Hear this voice'}</button>}
        {sampleErr && <p role="alert" className="up-error sm" style={{ marginTop: 8 }}>{sampleErr}</p>}
      </>}
      <div className="label" style={{ margin: '16px 0 6px' }}>Speed</div>
      <div className="pills" role="group" aria-label="Speed">{SPEEDS.map((r) => <button key={r} type="button" className="pill" aria-pressed={Math.abs(pl.rate - r) < 0.05} onClick={() => player.setRate(r)}>{r.toFixed(1)}×</button>)}</div>
      <div style={{ marginTop: 6 }}><AmbientControls /></div>
    </div>
  );
}
