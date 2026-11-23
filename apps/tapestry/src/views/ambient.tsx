import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SOUNDSCAPES, DEFAULT_VOLUME, clampVolume, isSoundscape, shouldPlayAmbient, type Soundscape } from '@wells/scripture';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { usePlayer } from '../audio';
import { usePlan } from '../billing';
import { getSetting, setSetting } from '../db';
import { ambient } from '../ambient';
import { UpgradeNote } from '../ui';

const useMode = (): Soundscape => { const m = useLiveQuery(() => getSetting<string>('ambient', 'off'), [], 'off'); return isSoundscape(m) ? m : 'off'; };
const useVolume = (): number => clampVolume(useLiveQuery(() => getSetting<number>('ambientVol', DEFAULT_VOLUME), [], DEFAULT_VOLUME));

/** Mount once in the app shell. The soundscape follows the reading: it fades in when a passage starts being read and out when it stops. */
export function AmbientHost() {
  const pl = usePlayer(); const plan = usePlan(); const mode = useMode(); const vol = useVolume();
  const on = shouldPlayAmbient({ mode, allowed: hasFeature(plan, 'soundscapes'), playing: pl.playing });
  useEffect(() => { if (on) ambient.start(mode, vol); else ambient.stop(); }, [on, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (on) ambient.setVolume(vol); }, [vol, on]);
  useEffect(() => () => ambient.stop(), []);
  return null;
}

/** The soundscape choice and volume, shown on the player screen. */
export function AmbientControls() {
  const plan = usePlan(); const mode = useMode(); const vol = useVolume();
  if (!hasFeature(plan, 'soundscapes')) return <UpgradeNote>Soft rain and a prayer pad under the reading are included with Plus.</UpgradeNote>;
  return (
    <div className="sec" style={{ marginTop: 12 }}>
      <div className="b" style={{ marginBottom: 8 }}>Soundscape</div>
      <div className="pills" role="group" aria-label="Soundscape">{SOUNDSCAPES.map((s) => <button key={s.id} type="button" className="pill" aria-pressed={mode === s.id} onClick={() => void setSetting('ambient', s.id)}>{s.label}</button>)}</div>
      {mode !== 'off' && <label className="row" style={{ marginTop: 10, gap: 12 }}><span className="sm mut">Volume</span><input type="range" className="grow" min={0} max={100} value={Math.round(vol * 100)} onChange={(e) => void setSetting('ambientVol', Number(e.target.value) / 100)} aria-label="Soundscape volume" /></label>}
      <p className="sm mut" style={{ marginTop: 8 }}>Made on your device, nothing to download. It plays while a passage is being read.</p>
    </div>
  );
}
