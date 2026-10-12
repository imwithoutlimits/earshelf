import { findBook, type Book } from './books.ts';

export interface Ref { book: Book; chapter: number; verseStart?: number; verseEnd?: number }
export type QueryKind = 'reference' | 'book' | 'phrase' | 'natural';

const RE = /^\s*((?:[1-3]|i{1,3}|first|second|third)?\s*[a-z][a-z .]*?)\s*(?:(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?|\s*[-–—]\s*(\d{1,3}))?)?\s*$/i;

/** Parses "John 3:16", "Psalm 23", "Romans 8:28–39", "1 Jn 4:7", "Ps 23:1-3". Returns null for anything that is not a real reference. */
export function parseReference(input: string): Ref | null {
  const m = RE.exec(input.normalize('NFKC'));
  if (!m) return null;
  const book = findBook(m[1].trim());
  if (!book || m[2] === undefined) return null;
  const chapter = Number(m[2]);
  if (chapter < 1 || chapter > book.chapters) return null;
  if (m[3] !== undefined) {
    const a = Number(m[3]), b = m[4] !== undefined ? Number(m[4]) : undefined;
    if (a < 1 || (b !== undefined && b < a)) return null;
    return { book, chapter, verseStart: a, verseEnd: b };
  }
  if (m[5] !== undefined) return null; // "John 3-4" (chapter ranges) is not supported yet: better to ask than to guess
  return { book, chapter };
}

export function formatReference(r: Ref): string {
  const { book, chapter, verseStart: a, verseEnd: b } = r;
  if (a === undefined) return `${book.name} ${chapter}`;
  return `${book.name} ${chapter}:${a}${b !== undefined && b !== a ? `–${b}` : ''}`;
}

/** Canonical id such as JHN.3.16-18. Stable across translations, so notes and bookmarks survive a translation change. */
export function refKey(r: Ref): string {
  const v = r.verseStart === undefined ? '' : `.${r.verseStart}${r.verseEnd !== undefined && r.verseEnd !== r.verseStart ? `-${r.verseEnd}` : ''}`;
  return `${r.book.code}.${r.chapter}${v}`;
}
export function parseRefKey(k: string): Ref | null {
  const m = /^([1-3A-Z]{3})\.(\d{1,3})(?:\.(\d{1,3})(?:-(\d{1,3}))?)?$/.exec(k);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book || Number(m[2]) > book.chapters) return null;
  return { book, chapter: Number(m[2]), verseStart: m[3] ? Number(m[3]) : undefined, verseEnd: m[4] ? Number(m[4]) : undefined };
}
export const verseCount = (r: Ref): number => (r.verseStart === undefined ? 0 : (r.verseEnd ?? r.verseStart) - r.verseStart + 1);

const QUESTION = /^(what|which|where|when|why|how|who|help|i |i'm|im |my |scriptures? (for|about|on)|verses? (for|about|on)|passages? (for|about|on)|something|anything|for when|when )/i;
/** Decides which search to run first. References and quoted or short exact phrases are matched exactly; sentences about a feeling or situation go to discovery. */
export function classifyQuery(input: string): { kind: QueryKind; ref?: Ref; text: string } {
  const text = input.trim().replace(/\s+/g, ' ');
  const ref = parseReference(text);
  if (ref) return { kind: 'reference', ref, text };
  if (findBook(text)) return { kind: 'book', text };
  const words = text.split(' ').filter(Boolean);
  if (/^["“].+["”]$/.test(text)) return { kind: 'phrase', text: text.slice(1, -1) };
  if (QUESTION.test(text) || words.length >= 7) return { kind: 'natural', text };
  return { kind: 'phrase', text };
}
