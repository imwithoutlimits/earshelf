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
        { text: 'Advanced search and tags', soon: true },
        { text: 'Link sharing with friends', soon: true },
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
        { text: 'Talk to Your Library: chat across everything you saved', soon: true },
        { text: 'Private podcast feed for Spotify, Apple Podcasts, Overcast', soon: true },
        { text: 'Shared vaults for couples, book clubs and study groups', soon: true },
        { text: 'Priority audio rendering', soon: true },
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
        { text: 'Natural voice chapter narration', soon: true },
        { text: 'Guided audio memorization loops', soon: true },
        { text: 'Translations side by side', soon: true },
        { text: 'Ambient soundscapes under the reading', soon: true },
        { text: 'Share verses and notes with a partner', soon: true },
      ],
    },
    pro: {
      name: 'Pro', tagline: 'Study with the whole toolkit',
      lines: [
        { text: 'Everything in Plus' },
        { text: 'Group wells and advanced guided paths', soon: true },
        { text: 'Cross-reference map', soon: true },
        { text: 'Hebrew and Greek word study', soon: true },
        { text: 'Multi-voice dramatized narration', soon: true },
        { text: 'Family devotional vaults and small group hubs', soon: true },
        { text: 'Sermon and study guide generator', soon: true },
      ],
    },
  },
};

/**
 * Which paid plans can be bought today, per app. A plan stays off sale until real features back it up; a Pro made only of
 * "Soon" items should not be sold. The plans screen shows it as "Coming soon" and the server refuses to start a checkout for it.
 * To put Tapestry Pro on sale, add 'pro' to the tapestry list when a few of its Pro features have shipped.
 */
export const SELLABLE: Record<ProductName, ReadonlyArray<'plus' | 'pro'>> = {
  earshelf: ['plus', 'pro'],
  tapestry: ['plus'],
};

export const priceLabel = (plan: 'plus' | 'pro', interval: 'month' | 'year'): string => {
  const p = PRICES[plan][interval];
  return `$${Number.isInteger(p) ? p : p.toFixed(2)}/${interval === 'month' ? 'mo' : 'yr'}`;
};
/** "Save 26%" style note for the yearly choice, computed from the real prices. */
export const yearlySaving = (plan: 'plus' | 'pro'): number => Math.round((1 - PRICES[plan].year / (PRICES[plan].month * 12)) * 100);
