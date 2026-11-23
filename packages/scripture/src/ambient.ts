/**
 * Ambient soundscapes for Tapestry (Plus). Nothing is downloaded and no recordings are used: the sounds are made on the device
 * from simple tones and filtered noise, so there is nothing to license and nothing to store. This file is only the pure part
 * (what to play); the browser audio lives in apps/tapestry/src/ambient.ts.
 */
export type Soundscape = 'off' | 'rain' | 'pad' | 'both';
export const SOUNDSCAPES: ReadonlyArray<{ id: Soundscape; label: string }> = [
  { id: 'off', label: 'Off' }, { id: 'rain', label: 'Soft rain' }, { id: 'pad', label: 'Prayer pad' }, { id: 'both', label: 'Rain and pad' },
];
export const isSoundscape = (v: unknown): v is Soundscape => SOUNDSCAPES.some((s) => s.id === v);

export const DEFAULT_VOLUME = 0.35;
export const clampVolume = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME);

export const midiToHz = (n: number): number => 440 * 2 ** ((n - 69) / 12);
/** Four slow, open chords (D major 9, B minor 7, G major 7, A sus). They loop; each is held for about sixteen seconds. */
export const PAD_PROGRESSION: ReadonlyArray<readonly number[]> = [[50, 54, 57, 64], [47, 50, 54, 57], [43, 47, 50, 54], [45, 52, 57, 59]];
export const CHORD_SECONDS = 16;
export const chordHz = (index: number): number[] => {
  const i = ((Math.floor(index) % PAD_PROGRESSION.length) + PAD_PROGRESSION.length) % PAD_PROGRESSION.length;
  return PAD_PROGRESSION[i].map(midiToHz);
};

/** Which layers a choice turns on. */
export const layersOf = (s: Soundscape): { rain: boolean; pad: boolean } => ({ rain: s === 'rain' || s === 'both', pad: s === 'pad' || s === 'both' });

/** The soundscape follows the reading: it plays only while something is being read, and only for people who have it. */
export const shouldPlayAmbient = (o: { mode: Soundscape; allowed: boolean; playing: boolean }): boolean => o.allowed && o.playing && o.mode !== 'off';
