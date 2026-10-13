export interface Segment { text: string; dialogue: boolean }

/**
 * Splits a paragraph into narration and quoted speech. Quote marks stay in the text.
 * A quote that is never closed runs to the end of the paragraph, which is how prose usually reads.
 */
export function segmentDialogue(text: string): Segment[] {
  const out: Segment[] = [];
  let cur = '';
  let inQuote = false;
  const flush = (dialogue: boolean) => { if (cur.trim()) out.push({ text: cur.trim(), dialogue }); cur = ''; };
  for (const ch of text) {
    if (!inQuote && (ch === '“' || ch === '"')) { flush(false); inQuote = true; cur = ch; continue; }
    if (inQuote && (ch === '”' || ch === '"')) { cur += ch; flush(true); inQuote = false; continue; }
    cur += ch;
  }
  flush(inQuote);
  return out;
}
