/**
 * Guided audio memorization loop (Plus). For each level the passage is read aloud while some words are hidden on screen,
 * then there is a pause for the person to say it themselves; the hidden share grows until every word is hidden.
 * One last full reading lets them check themselves. Pure: it only plans the steps and their timing.
 */
export interface LoopStep { kind: 'speak' | 'recite'; level: number; ms: number; label: string }
export interface LoopOptions { rate?: number; startLevel?: number; endLevel?: number }

const wordsIn = (t: string) => Math.max(1, t.trim().split(/\s+/).length);
/** Same pace the Tapestry player uses: 2.5 words a second at normal speed. */
export const speakMs = (text: string, rate = 0.9): number => Math.round((wordsIn(text) / (2.5 * Math.max(0.5, rate))) * 1000);
/** Reciting from memory is slower than reading aloud, and people need a moment to begin. */
export const reciteMs = (text: string, rate = 0.9): number => Math.max(4000, Math.round((wordsIn(text) / (1.6 * Math.max(0.5, rate))) * 1000) + 2000);

export function loopPlan(text: string, o: LoopOptions = {}): LoopStep[] {
  const rate = o.rate ?? 0.9;
  const from = Math.max(0, Math.min(4, Math.floor(o.startLevel ?? 0)));
  const to = Math.max(from, Math.min(4, Math.floor(o.endLevel ?? 4)));
  const steps: LoopStep[] = [];
  for (let level = from; level <= to; level++) {
    steps.push({ kind: 'speak', level, ms: speakMs(text, rate), label: level === 0 ? 'Listen to the whole passage' : 'Listen, and follow along' });
    steps.push({ kind: 'recite', level, ms: reciteMs(text, rate), label: level === 4 ? 'Now say it from memory' : 'Your turn: say it aloud' });
  }
  steps.push({ kind: 'speak', level: 0, ms: speakMs(text, rate), label: 'Listen once more to check yourself' });
  return steps;
}
export const loopTotalMs = (steps: readonly LoopStep[]): number => steps.reduce((n, s) => n + s.ms, 0);
