import { PRICES, type Plan } from './plans.ts';
import type { ProductName } from './planStore.ts';

/**
 * What each plan says it includes, per app. This is the one place the pricing screens read from.
 * `soon: true` marks a promised feature that is not built yet. The screens show it with a "Soon" label, never as ready,
 * so nobody pays for something that is missing. Flip `soon` off in the same change that ships the feature.
 */
export interface PitchLine { text: string; soon?: boolean }
export interface PlanPitch { name: string; tagline: string; lines: PitchLine[] }

export const PITCH: Record<ProductName, Record<Plan, PlanPitch>> = {
  earshelf: {
    free: {
      name: 'Free', tagline: 'Read and listen on your device',
      lines: [
        { text: 'Web clips, PDF and EPUB imports' },
        { text: 'Standard device voices' },
        { text: '20 minutes a day of the natural Kokoro voice' },
        { text: 'Basic search' },
      ],
    },
    plus: {
      name: 'Plus', tagline: 'A natural voice for everything you save',
      lines: [
        { text: 'Natural Kokoro voice, no daily cap (fair use)' },
        { text: 'Smart cleanup: drop reference lists and citations' },
        { text: 'Two-voice dialogue narration' },
        { text: 'Audiobook export (.m4b / .mp3), 5 a month' },
        { text: 'AI summaries and search by meaning inside a document' },
        { text: 'OCR for scanned PDFs, offline audio, sync across devices' },
        { text: 'Tags and advanced search: filter by tag, type, author, exact phrase' },
        { text: 'Share a web article as a link' },
      ],
    },
    pro: {
      name: 'Pro', tagline: 'Your whole library, working for you',
      lines: [
        { text: 'Everything in Plus' },
        { text: 'Ask questions about a document, quizzes and flashcards' },
        { text: 'Search by meaning across all your documents' },
        { text: 'Explain tables and figures, import many files at once' },
        { text: 'Unlimited audio exports' },
        { text: 'Talk to Your Library: ask a question, get an answer from all your documents' },
        { text: 'Private podcast feed for Apple Podcasts, Overcast and other podcast apps (5 episodes, 300 MB)' },
        { text: 'Shared vaults for couples, book clubs and study groups: share article links and notes, never your files' },
        { text: 'Priority audio rendering: your voice is made first when the server is busy' },
      ],
    },
  },
  tapestry: {
    free: {
      name: 'Free', tagline: 'Read Scripture and keep what matters',
      lines: [
        { text: 'Core Scripture reading, World English Bible' },
        { text: 'Wells, bookmarks and your quiet-time streak' },
        { text: 'Basic text reading' },
      ],
    },
    plus: {
      name: 'Plus', tagline: 'Find the right passage and go deeper',
      lines: [
        { text: 'AI search, passage recommendations and reflection prompts' },
        { text: 'AI-drafted wells for any topic' },
        { text: 'Translations side by side, verse by verse' },
        { text: 'Guided audio memorization loops: hear it, say it, hide more words' },
        { text: 'Ambient soundscapes under the reading: soft rain, prayer pad' },
        { text: 'Natural voice reading of passages (WEB, KJV and ASV), part of your monthly voice time' },
        { text: 'Share wells with a partner' },
      ],
    },
    pro: {
      name: 'Pro', tagline: 'Study with the whole toolkit',
      lines: [
        { text: 'Everything in Plus' },
        { text: 'Study guide and talk outline from the passages in a well, plus an AI-written message draft you review and make your own' },
        { text: 'Spaced recall: memorized passages come back when you need them' },
        { text: 'Streak insights: longest thread, best day, weekly trends' },
        { text: 'Advanced guided paths', soon: true },
        { text: 'Related passages for any passage you read (about 50,000 of the strongest cross-references)' },
        { text: 'Hebrew and Greek word study', soon: true },
        { text: 'Multi-voice dramatized narration', soon: true },
        { text: 'Family devotional vaults (up to 8) and small group hubs (up to 25): share wells and comments' },
      ],
    },
  },
};

/**
 * Which paid plans can be bought today, per app. A plan stays off sale until real features back it up; a Pro made only of
 * "Soon" items should not be sold. The plans screen shows it as "Coming soon" and the server refuses to start a checkout for it.
 * Tapestry Pro went on sale once it had real features of its own (study guide, spaced recall, streak insights).
 */
export const SELLABLE: Record<ProductName, ReadonlyArray<'plus' | 'pro'>> = {
  earshelf: ['plus', 'pro'],
  tapestry: ['plus', 'pro'],
};

export const priceLabel = (plan: 'plus' | 'pro', interval: 'month' | 'year'): string => {
  const p = PRICES[plan][interval];
  return `$${Number.isInteger(p) ? p : p.toFixed(2)}/${interval === 'month' ? 'mo' : 'yr'}`;
};
/** "Save 26%" style note for the yearly choice, computed from the real prices. */
export const yearlySaving = (plan: 'plus' | 'pro'): number => Math.round((1 - PRICES[plan].year / (PRICES[plan].month * 12)) * 100);
