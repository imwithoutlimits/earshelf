export interface Token { text: string; hidden: boolean; word: boolean }
/** Deterministic: the same passage and level always hide the same words, so people can practise. level 0 shows everything, 4 hides all words. */
export function hideWords(passage: string, level: number, seed = 7): Token[] {
  const parts = passage.split(/(\s+)/);
  const wordIdx = parts.map((p, i) => (/\w/.test(p) ? i : -1)).filter((i) => i >= 0);
  const share = [0, 0.25, 0.5, 0.75, 1][Math.max(0, Math.min(4, Math.floor(level)))];
  const rank = wordIdx.map((i, k) => ({ i, r: ((k + 1) * 2654435761 * seed) % 1000 })).sort((a, b) => a.r - b.r);
  const hide = new Set(rank.slice(0, Math.round(wordIdx.length * share)).map((x) => x.i));
  return parts.map((p, i) => ({ text: p, hidden: hide.has(i), word: wordIdx.includes(i) }));
}
export function nextReview(confidence: 1 | 2 | 3 | 4 | 5, from = Date.now()): number {
  const days = [1, 1, 3, 7, 14][confidence - 1];
  return from + days * 86_400_000;
}
