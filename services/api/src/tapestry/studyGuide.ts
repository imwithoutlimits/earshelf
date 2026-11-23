import { assembleGuide, scaffoldGuide, type GuideKind, type StudyGuide } from '../../../../packages/scripture/src/index.ts';
import { parseJson, type AiProvider } from '../ai/provider.ts';

/**
 * Pro: a study guide or talk outline from passages the person chose in a well.
 * Same rules as the rest of Tapestry's AI (packages/scripture/src/guard.ts): the AI never writes, quotes or paraphrases Scripture,
 * never interprets doctrine or speaks with authority. It only groups and orders the chosen passages, names each group neutrally,
 * and writes open questions. assembleGuide() throws away anything that breaks those rules. The verses themselves are added by the app.
 */
const RULES = 'You help someone prepare to study Bible passages they chose. Never write, quote or paraphrase Scripture. Never invent references: use only the refs you are given. Never interpret doctrine, state what a passage means, or speak with spiritual authority. Never give medical advice or promise healing, prosperity or outcomes. Headings are short neutral labels of at most six words with no verse numbers. Questions are open questions or invitations that make no claim. Reply with JSON only.';

export interface GuidePassage { key: string; label: string; text: string }

export async function buildGuide(ai: AiProvider | null, kind: GuideKind, title: string, passages: GuidePassage[]): Promise<StudyGuide> {
  const refs = passages.map((p) => p.key);
  if (!ai) return scaffoldGuide(kind, title, refs);
  try {
    const raw = await ai.complete(RULES, JSON.stringify({
      task: kind === 'study'
        ? 'Group these passages into sections in a good order for a small group conversation. For each section give a short neutral heading, the refs it covers, and one to three open questions. Also give up to two opening questions and up to three closing questions.'
        : 'Group these passages into sections in a good order for someone preparing a talk. For each section give a short neutral heading, the refs it covers, and one to three open questions about what the text says or how it is put together (observation), not what it means. Also give up to two opening questions and up to three closing questions.',
      reply: '{"sections":[{"heading":string,"refs":[string],"questions":[string]}],"opening":[string],"closing":[string]}',
      passages: passages.map((p) => ({ ref: p.key, label: p.label, text: p.text.slice(0, 1500) })),
    }), { maxTokens: 1100 });
    return assembleGuide(parseJson(raw), kind, title, refs);
  } catch { return scaffoldGuide(kind, title, refs); }
}
