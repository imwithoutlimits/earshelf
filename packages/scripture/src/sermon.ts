import { formatReference, parseReference, parseRefKey, refKey } from './reference.ts';
import { breaksBoundaries, keepValidRefs } from './guard.ts';
import { cleanHeading } from './studyGuide.ts';

/**
 * An AI-written message draft from passages the person chose (Tapestry Pro). The owner approved this with limits, and the limits live
 * here in code, not only in the prompt:
 *  - The Scripture text is always the app's own, word for word. The draft may refer to a passage by its reference but must not quote or restate it.
 *  - No promises of healing or outcomes, no medical advice, no claiming to speak for God (guard.ts rules still apply).
 *  - It is labelled as an AI draft to review before use.
 * Every sentence the AI writes is checked; a sentence that breaks a rule is dropped.
 */
export type DraftTone = 'pastoral' | 'teaching';
export type DraftLength = 'short' | 'medium';
export const DRAFT_LABEL = 'AI draft. Review it, change it and make it your own before you use it.';
export const DRAFT_WORDS: Record<DraftLength, number> = { short: 450, medium: 800 };

export interface DraftSection { heading: string; refs: string[]; body: string }
export interface SermonDraft { source: 'ai'; label: string; tone: DraftTone; title: string; intro: string; sections: DraftSection[]; closing: string }

export const QUOTE_RUN = 6; // six or more words in a row that match a chosen passage count as quoting it

const words = (t: string): string[] => t.toLowerCase().replace(/[^\p{L}\p{N}'\s-]/gu, ' ').split(/\s+/).filter(Boolean);

/** The longest run of consecutive words that the sentence shares with the passage. */
export function longestSharedRun(sentence: string, passage: string): number {
  const a = words(sentence), b = words(passage);
  let best = 0, prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
    prev = cur;
  }
  return best;
}

const REF_LIKE = /\b(?:[1-3]\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)?\s\d{1,3}(?::\d{1,3}(?:\s?[-–]\s?\d{1,3})?)?/g;
/** Does the sentence name a real passage that the person did not choose? Chosen passages and made-up names are fine. */
export function mentionsOtherRef(sentence: string, allowed: ReadonlySet<string>): boolean {
  for (const m of sentence.matchAll(REF_LIKE)) {
    const r = parseReference(m[0]);
    if (!r) continue;
    const key = refKey(r);
    const chapter = `${r.book.code}.${r.chapter}`;
    if (![...allowed].some((a) => a === key || a.startsWith(`${chapter}.`) || a === chapter)) return true;
  }
  return false;
}

/** Splits on the space after . ! or ? so that a web address or a decimal is never cut in the middle. */
const sentencesOf = (t: string): string[] => t.replace(/\s+/g, ' ').trim().split(/(?<=[.!?]["')\]]?) (?=["“'(A-Z0-9])/).map((x) => x.trim()).filter(Boolean);

export interface ProseContext { passages: Readonly<Record<string, string>>; allowed: ReadonlySet<string>; maxChars: number }
/** Keeps the sentences that follow the rules, in order, up to a size. Returns '' when too little is left to be worth showing. */
export function cleanProse(raw: unknown, ctx: ProseContext): string {
  if (typeof raw !== 'string') return '';
  const texts = Object.values(ctx.passages);
  const kept: string[] = [];
  let size = 0;
  for (const s of sentencesOf(raw)) {
    if (s.length < 12 || s.length > 420) continue;
    if (breaksBoundaries(s)) continue;
    if (/https?:\/\//i.test(s)) continue;
    if (texts.some((p) => longestSharedRun(s, p) >= QUOTE_RUN)) continue;
    if (/["“][^"”]{40,}["”]/.test(s)) continue; // a long quotation of anything
    if (mentionsOtherRef(s, ctx.allowed)) continue;
    if (size + s.length > ctx.maxChars) break;
    kept.push(s); size += s.length + 1;
  }
  return kept.length >= 2 ? kept.join(' ') : '';
}

const titleOf = (key: string): string => { const r = parseRefKey(key); return r ? formatReference(r) : key; };

interface RawDraft { title?: unknown; intro?: unknown; sections?: unknown; closing?: unknown }
/** Turns what the AI wrote into a draft that is safe to show, or null when too little of it survives. */
export function assembleDraft(raw: RawDraft | null | undefined, tone: DraftTone, fallbackTitle: string, refs: string[], passages: Readonly<Record<string, string>>): SermonDraft | null {
  if (!raw || !Array.isArray(raw.sections)) return null;
  const allowed = new Set(refs);
  const ctx = (maxChars: number): ProseContext => ({ passages, allowed, maxChars });
  const used = new Set<string>();
  const sections: DraftSection[] = [];
  for (const s of raw.sections as Array<Record<string, unknown>>) {
    if (!s || typeof s !== 'object') continue;
    const mine = keepValidRefs(s.refs, allowed).filter((k) => !used.has(k));
    if (!mine.length) continue;
    const body = cleanProse(s.body, ctx(1800));
    if (!body) continue; // a section whose text did not survive is left out rather than shown half-written
    mine.forEach((k) => used.add(k));
    sections.push({ heading: cleanHeading(s.heading) ?? mine.map(titleOf).join(', '), refs: mine, body });
  }
  if (!sections.length) return null;
  const rest = refs.filter((k) => !used.has(k));
  if (rest.length) sections.push({ heading: 'Also read', refs: rest, body: '' });
  const title = typeof raw.title === 'string' ? (cleanHeading(raw.title) ?? fallbackTitle) : fallbackTitle;
  return { source: 'ai', label: DRAFT_LABEL, tone, title: title || 'Message draft', intro: cleanProse(raw.intro, ctx(900)), sections, closing: cleanProse(raw.closing, ctx(900)) };
}

/** The draft as plain text for copying. Verses come from the person's own Bible text, word for word. */
export function draftToText(d: SermonDraft, verses: Readonly<Record<string, string>>, translation?: string): string {
  const out: string[] = [d.title, d.label, ''];
  if (d.intro) out.push(d.intro, '');
  d.sections.forEach((s, i) => {
    out.push(`${i + 1}. ${s.heading}`);
    for (const k of s.refs) { out.push(`${titleOf(k)}${translation ? ` (${translation})` : ''}`); if (verses[k]) out.push(verses[k]); }
    if (s.body) out.push('', s.body);
    out.push('');
  });
  if (d.closing) out.push(d.closing, '');
  out.push('The Scripture text above is not AI-written. The rest of this draft is.');
  return out.join('\n');
}
