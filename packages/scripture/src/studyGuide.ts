import { formatReference, parseRefKey } from './reference.ts';
import { breaksBoundaries, cleanPrompt, keepValidRefs } from './guard.ts';
import { GENERIC_PROMPTS } from './starter.ts';

/**
 * A study guide or talk outline built from passages the person chose.
 * The Scripture text is never written here or by AI: the app puts the verses in from the database, word for word.
 * AI may only order and group the chosen passages, name each group in plain neutral words, and write open questions.
 * Everything AI returns goes through assembleGuide(), and anything that fails the guardrails is replaced by an editorial question.
 */
export type GuideKind = 'study' | 'talk';
export interface GuideSection { heading: string; refs: string[]; questions: string[] }
export interface StudyGuide { kind: GuideKind; source: 'ai' | 'editorial'; label: string; title: string; opening: string[]; sections: GuideSection[]; closing: string[] }

export const MAX_GUIDE_PASSAGES = 12;
export const GUIDE_KINDS: Record<GuideKind, { label: string; blurb: string }> = {
  study: { label: 'Group study', blurb: 'Questions to talk through together, passage by passage.' },
  talk: { label: 'Talk outline', blurb: 'A scaffold to prepare from: the passages in order, with questions to think about. You write the message.' },
};

const OPENING: Record<GuideKind, string[]> = {
  study: ['What is on your mind as we begin?'],
  talk: ['What would you like the people listening to take away?'],
};
const CLOSING: Record<GuideKind, string[]> = {
  study: ['What is one thing you want to remember from this time?', 'Is there a next step you would like to take this week?'],
  talk: ['What do you most want to say about these passages?', 'How could you invite people to respond?'],
};

/** A heading must be a short neutral label. No claims, no verse numbers (the app adds the references itself). */
export function cleanHeading(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim().replace(/[.:;]+$/, '');
  if (t.length < 3 || t.length > 60 || breaksBoundaries(t) || /\d+\s*:\s*\d+/.test(t) || /^https?:/i.test(t)) return null;
  return t;
}

/** Valid chosen passages only (real books and chapters), no repeats, capped. */
export function chosenRefs(raw: unknown): string[] {
  return keepValidRefs(raw).slice(0, MAX_GUIDE_PASSAGES);
}

const titleOf = (key: string): string => { const r = parseRefKey(key); return r ? formatReference(r) : key; };

/** The plain version with no AI at all: one section per passage in the order given, with the app's own open questions. */
export function scaffoldGuide(kind: GuideKind, title: string, refs: string[]): StudyGuide {
  return {
    kind, source: 'editorial', label: 'Editorial questions', title: title.trim() || 'Study guide',
    opening: OPENING[kind],
    sections: refs.map((k, i) => ({ heading: titleOf(k), refs: [k], questions: [GENERIC_PROMPTS[i % GENERIC_PROMPTS.length], GENERIC_PROMPTS[(i + 1) % GENERIC_PROMPTS.length]] })),
    closing: CLOSING[kind],
  };
}

interface RawGuide { sections?: unknown; opening?: unknown; closing?: unknown }
const questionsOf = (raw: unknown, max: number): string[] => (Array.isArray(raw) ? raw : []).map(cleanPrompt).filter((x): x is string => !!x).slice(0, max);

/**
 * Turns what the AI said into a guide that is safe to show. Only the chosen passages survive, each exactly once;
 * a passage the AI left out is added at the end; weak or unsafe questions are replaced by editorial ones.
 */
export function assembleGuide(raw: RawGuide | null | undefined, kind: GuideKind, title: string, refs: string[]): StudyGuide {
  const base = scaffoldGuide(kind, title, refs);
  if (!raw || !Array.isArray(raw.sections)) return base;
  const allowed = new Set(refs);
  const used = new Set<string>();
  const sections: GuideSection[] = [];
  for (const s of raw.sections as Array<Record<string, unknown>>) {
    if (!s || typeof s !== 'object') continue;
    const mine = keepValidRefs(s.refs, allowed).filter((k) => !used.has(k));
    if (!mine.length) continue;
    mine.forEach((k) => used.add(k));
    const questions = questionsOf(s.questions, 3);
    sections.push({
      heading: cleanHeading(s.heading) ?? mine.map(titleOf).join(', '),
      refs: mine,
      questions: questions.length ? questions : [GENERIC_PROMPTS[sections.length % GENERIC_PROMPTS.length]],
    });
  }
  if (!sections.length) return base;
  for (const k of refs) if (!used.has(k)) sections.push({ heading: titleOf(k), refs: [k], questions: [GENERIC_PROMPTS[sections.length % GENERIC_PROMPTS.length]] });
  const opening = questionsOf(raw.opening, 2), closing = questionsOf(raw.closing, 3);
  return { kind, source: 'ai', label: 'Questions suggested by AI', title: base.title, opening: opening.length ? opening : base.opening, sections, closing: closing.length ? closing : base.closing };
}

/** The guide as plain text for copying or sharing. `verses` holds the verbatim text per passage key, loaded from the person's own Bible text. */
export function guideToText(g: StudyGuide, verses: Record<string, string>, translation?: string): string {
  const out: string[] = [g.title, GUIDE_KINDS[g.kind].label, ''];
  const list = (qs: string[]) => qs.map((q) => `  - ${q}`);
  if (g.opening.length) out.push('To begin', ...list(g.opening), '');
  g.sections.forEach((s, i) => {
    out.push(`${i + 1}. ${s.heading}`);
    for (const k of s.refs) { out.push(`${titleOf(k)}${translation ? ` (${translation})` : ''}`); if (verses[k]) out.push(verses[k]); }
    out.push('Questions', ...list(s.questions), '');
  });
  if (g.closing.length) out.push('To close', ...list(g.closing), '');
  out.push(g.source === 'ai' ? 'Questions were suggested by AI. The Scripture text is not AI-written.' : 'The Scripture text is not AI-written.');
  return out.join('\n');
}
