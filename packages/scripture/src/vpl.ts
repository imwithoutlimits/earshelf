import { findBook } from './books.ts';
export interface VerseRow { book: number; chapter: number; verse: number; text: string }
export interface VplResult { verses: VerseRow[]; skipped: string[]; books: number }

/** Parses eBible "verse per line" text ("GEN 1:1 In the beginning…"). Unknown book codes are reported, never silently dropped. */
export function parseVpl(text: string): VplResult {
  const verses: VerseRow[] = []; const skipped: string[] = []; const seen = new Set<number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^((?:[1-3]\s?)?[A-Za-z]{2,}\.?)\s+(\d{1,3}):(\d{1,3})\s+(.+)$/.exec(line);
    if (!m) { if (skipped.length < 20) skipped.push(line.slice(0, 60)); continue; }
    const book = findBook(m[1]);
    if (!book) { if (skipped.length < 20) skipped.push(line.slice(0, 60)); continue; }
    seen.add(book.n);
    verses.push({ book: book.n, chapter: Number(m[2]), verse: Number(m[3]), text: m[4].replace(/\s+/g, ' ').trim() });
  }
  return { verses, skipped, books: seen.size };
}
/** A complete Protestant canon is 66 books and about 31,000 verses. Anything far from that is a bad download. */
export function looksComplete(r: VplResult): boolean { return r.books === 66 && r.verses.length > 30_500 && r.verses.length < 31_800; }
