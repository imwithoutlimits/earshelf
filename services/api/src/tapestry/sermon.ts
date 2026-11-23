import { DRAFT_WORDS, assembleDraft, type DraftLength, type DraftTone, type SermonDraft } from '../../../../packages/scripture/src/index.ts';
import { parseJson, type AiProvider } from '../ai/provider.ts';
import type { GuidePassage } from './studyGuide.ts';

/**
 * Pro: an AI-written message draft from passages the person chose. Approved by the owner with limits, which are enforced in
 * assembleDraft() (packages/scripture/src/sermon.ts): no quoting or restating the verses, no promises or medical advice, no speaking
 * for God, no passages that were not chosen. The verses are added by the app, word for word.
 */
const RULES = 'You help a speaker prepare a draft message from Bible passages they chose. The speaker will review and rewrite it, so write a draft, not a final word. Refer to a passage by its reference but never quote it or restate its wording. Never invent references: use only the refs you are given. Do not claim to speak for God and do not say "thus says the Lord". Never promise healing, prosperity or outcomes, and never give medical advice. Write plain, warm prose in short paragraphs. Reply with JSON only.';

export async function buildDraft(ai: AiProvider, tone: DraftTone, length: DraftLength, title: string, passages: GuidePassage[]): Promise<SermonDraft | null> {
  const refs = passages.map((p) => p.key);
  const texts = Object.fromEntries(passages.map((p) => [p.key, p.text]));
  try {
    const raw = await ai.complete(RULES, JSON.stringify({
      task: `Write a ${tone === 'pastoral' ? 'warm, pastoral' : 'clear, teaching-focused'} message draft of about ${DRAFT_WORDS[length]} words. Give a short title (at most six words), an introduction of two or three sentences, one section for each group of related passages (heading of at most six words with no verse numbers, the refs it covers, and a body of several sentences that helps people notice and think about the text), and a closing of two or three sentences.`,
      reply: '{"title":string,"intro":string,"sections":[{"heading":string,"refs":[string],"body":string}],"closing":string}',
      passages: passages.map((p) => ({ ref: p.key, label: p.label, text: p.text.slice(0, 1500) })),
    }), { maxTokens: length === 'short' ? 1100 : 1900 });
    return assembleDraft(parseJson(raw), tone, title || 'Message draft', refs, texts);
  } catch { return null; }
}
