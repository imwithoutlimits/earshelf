/**
 * Keeps the highlighted word in step with a natural voice. The server says when each verse starts in the audio; inside a verse the
 * place is spread over its characters, so the highlight moves word by word. The text is never changed: this only reads positions.
 */
export interface SyncVerse { n: number; startMs: number }
export interface SyncPart { verses: SyncVerse[]; durationMs: number }
/** The silence the server puts after each verse (services/api/src/tapestry/narrate.ts). */
export const VERSE_PAUSE_MS = 380;

/** Where each verse starts in a passage's text, which is its verses joined by single spaces. */
export function verseOffsets(verses: ReadonlyArray<{ n: number; text: string }>): Map<number, { start: number; len: number }> {
  const out = new Map<number, { start: number; len: number }>();
  let pos = 0;
  for (const v of verses) { out.set(v.n, { start: pos, len: v.text.length }); pos += v.text.length + 1; }
  return out;
}

/**
 * The place in the text, as a number of characters (a fraction is the place inside a word), at `tMs` into a part of the audio.
 * `fallback` (0 to 1, how far through the whole passage the audio is) is used when the verse positions are not known.
 */
export function charAt(tMs: number, part: SyncPart, offsets: Map<number, { start: number; len: number }> | null, textLen: number, fallback: number): number {
  const vs = part.verses; if (!vs.length) return fallback * textLen;
  let k = 0; for (let i = 0; i < vs.length; i++) if (vs[i].startMs <= tMs) k = i;
  const v = vs[k], last = k + 1 >= vs.length;
  const end = last ? part.durationMs : vs[k + 1].startMs;
  const speech = Math.max(200, end - v.startMs - (last ? 0 : VERSE_PAUSE_MS));
  const f = Math.min(1, Math.max(0, (tMs - v.startMs) / speech));
  const o = offsets?.get(v.n);
  return o ? o.start + f * o.len : fallback * textLen;
}

/** Moves a position back to the start of the word it is in. */
export function snapToWordStart(text: string, pos: number): number {
  let c = Math.min(text.length, Math.max(0, Math.round(pos)));
  while (c > 0 && text[c - 1] !== ' ') c--;
  return c;
}
