import { stitch } from '../tts/pcm.ts';
import { mapPool } from '../tts/render.ts';
import type { TtsEngine, Voice } from '../tts/types.ts';
import type { Cast, Segment } from '../../../../packages/scripture/src/index.ts';

/**
 * Natural voice narration of Scripture (Tapestry Plus). Owner-approved design: the audio is made on request and sent straight back,
 * never saved (so it cannot fill up storage), and only for public domain translations. A chapter is read in short parts of a few verses.
 */
export { NARRATION_TRANSLATIONS } from '../../../../packages/scripture/src/index.ts';
export const MAX_NARRATED_VERSES = 200;
export const VERSE_PAUSE_MS = 380;

export interface NarrVerse { n: number; text: string }

/** Groups consecutive verses into parts of up to about maxChars, never splitting a verse. */
export function planNarration(verses: readonly NarrVerse[], maxChars = 700): NarrVerse[][] {
  const parts: NarrVerse[][] = [];
  let cur: NarrVerse[] = [], size = 0;
  for (const v of verses) {
    if (cur.length && size + v.text.length > maxChars) { parts.push(cur); cur = []; size = 0; }
    cur.push(v); size += v.text.length;
  }
  if (cur.length) parts.push(cur);
  return parts;
}

/** About 150 words a minute. Used to count the part against the person's monthly voice allowance before it is made. */
export const minutesFor = (verses: readonly NarrVerse[]): number => Math.max(0.05, verses.reduce((n, v) => n + v.text.split(/\s+/).filter(Boolean).length, 0) / 150);

/** The voice to use: the one asked for if the engine has it, otherwise the first English voice, otherwise the first voice. */
export function pickVoice(voices: readonly Voice[], wanted?: unknown): string | null {
  if (typeof wanted === 'string' && voices.some((v) => v.id === wanted)) return wanted;
  return (voices.find((v) => /^en/i.test(v.lang)) ?? voices[0])?.id ?? null;
}

export interface NarratedPart { mp3: Buffer; durationMs: number; verses: Array<{ n: number; startMs: number }> }
export async function narratePart(deps: { engine: TtsEngine; voice: string; toMp3: (samples: Int16Array, rate: number) => Promise<Buffer> }, verses: readonly NarrVerse[]): Promise<NarratedPart> {
  const clips = await mapPool([...verses], 2, (v) => deps.engine.synthesize(v.text, deps.voice));
  const rate = clips[0]?.sampleRate ?? 24000;
  if (clips.some((c) => c.sampleRate !== rate)) throw new Error('The voice engine returned mixed sample rates.');
  const s = stitch(clips.map((c, i) => ({ samples: c.samples, pauseAfterMs: i === clips.length - 1 ? 0 : VERSE_PAUSE_MS })), rate);
  return { mp3: await deps.toMp3(s.samples, rate), durationMs: s.durationMs, verses: verses.map((v, i) => ({ n: v.n, startMs: s.startMs[i] })) };
}

export const SEGMENT_PAUSE_MS = 170;
/**
 * A dramatized part: each stretch is read by the voice for its role (narrator, God and Jesus, or other speakers). The text is exactly what
 * segmentVerses() was given; this only chooses the voice and the pauses.
 */
export async function narrateSegments(deps: { engine: TtsEngine; cast: Cast; toMp3: (samples: Int16Array, rate: number) => Promise<Buffer> }, segments: readonly Segment[]): Promise<NarratedPart> {
  const clips = await mapPool([...segments], 2, (s) => deps.engine.synthesize(s.text, deps.cast[s.role]));
  const rate = clips[0]?.sampleRate ?? 24000;
  if (clips.some((c) => c.sampleRate !== rate)) throw new Error('The voice engine returned mixed sample rates.');
  const s = stitch(clips.map((c, i) => ({ samples: c.samples, pauseAfterMs: i === clips.length - 1 ? 0 : segments[i + 1].verse !== segments[i].verse ? VERSE_PAUSE_MS : SEGMENT_PAUSE_MS })), rate);
  const verses: Array<{ n: number; startMs: number }> = [];
  segments.forEach((seg, i) => { if (!verses.some((v) => v.n === seg.verse)) verses.push({ n: seg.verse, startMs: s.startMs[i] }); });
  return { mp3: await deps.toMp3(s.samples, rate), durationMs: s.durationMs, verses };
}
