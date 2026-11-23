import type { ParsedDocument, SourceType } from './model.ts';

/**
 * Tags and advanced search for the library. Pure functions: the apps decide when a person may use them (Plus).
 * Query words: tag:history  type:pdf  author:smith  title:war  is:finished|unfinished|started|new  "exact phrase"  -excluded
 */
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 30;

/** One tidy form for every tag: lowercase, no # sign, letters, numbers, spaces, - and _ only. */
export function normalizeTag(raw: string): string {
  return raw.replace(/^#+/, '').toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
}

/** Adds a tag unless it is empty, already there, or the document already has the maximum. Returns the new list. */
export function addTag(tags: readonly string[], raw: string): string[] {
  const t = normalizeTag(raw);
  if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return [...tags];
  return [...tags, t];
}
export const removeTag = (tags: readonly string[], tag: string): string[] => tags.filter((x) => x !== tag);

export interface TagCount { tag: string; count: number }
/** Every tag in the library, most used first. */
export function tagCounts(docs: ReadonlyArray<{ tags?: readonly string[] }>): TagCount[] {
  const m = new Map<string, number>();
  for (const d of docs) for (const t of d.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export type ReadState = 'new' | 'started' | 'finished';
export interface LibraryQuery {
  words: string[];
  phrases: string[];
  exclude: string[];
  tags: string[];
  types: SourceType[];
  authors: string[];
  titles: string[];
  status: 'finished' | 'unfinished' | 'started' | 'new' | null;
  /** True when any tag:/type:/author:/title:/is: word was used. */
  hasFilters: boolean;
}

const TYPE_WORDS: Record<string, SourceType[]> = {
  pdf: ['pdf'], epub: ['epub'], docx: ['docx'], word: ['docx'], image: ['image'], scan: ['image'], paste: ['paste'], pasted: ['paste'],
  web: ['url', 'html'], article: ['url'], page: ['html'], url: ['url'], text: ['txt', 'md', 'paste'], txt: ['txt'], notes: ['md'], md: ['md'],
};
const STATUS_WORDS: Record<string, NonNullable<LibraryQuery['status']>> = { finished: 'finished', done: 'finished', unfinished: 'unfinished', started: 'started', inprogress: 'started', new: 'new', unopened: 'new' };

export function parseLibraryQuery(input: string): LibraryQuery {
  const q: LibraryQuery = { words: [], phrases: [], exclude: [], tags: [], types: [], authors: [], titles: [], status: null, hasFilters: false };
  const re = /(-?)(?:(tag|type|author|title|is):)?(?:"([^"]*)"|(\S+))/gi;
  for (const m of input.matchAll(re)) {
    const neg = m[1] === '-', op = m[2]?.toLowerCase(), value = (m[3] ?? m[4] ?? '').trim().toLowerCase();
    if (!value) continue;
    if (op) {
      q.hasFilters = true;
      if (op === 'tag') { const t = normalizeTag(value); if (t) q.tags.push(t); }
      else if (op === 'type') q.types.push(...(TYPE_WORDS[value] ?? []));
      else if (op === 'author') q.authors.push(value);
      else if (op === 'title') q.titles.push(value);
      else if (op === 'is' && STATUS_WORDS[value]) q.status = STATUS_WORDS[value];
    } else if (neg) {
      if (value.length >= 2) q.exclude.push(value);
    } else if (m[3] !== undefined) q.phrases.push(value);
    else q.words.push(value);
  }
  return q;
}

export interface LibraryDocInfo { id: string; title: string; author?: string; tags: readonly string[]; sourceType: SourceType }

const hay = (d: LibraryDocInfo) => `${d.title} ${d.author ?? ''} ${d.tags.join(' ')}`.toLowerCase();

/** Do the filter words (tag, type, author, title, is, and -excluded) allow this document? Plain words are not checked here. */
export function docPassesFilters(d: LibraryDocInfo, q: LibraryQuery, state: ReadState): boolean {
  if (q.tags.some((t) => !d.tags.includes(t))) return false;
  if (q.types.length && !q.types.includes(d.sourceType)) return false;
  if (q.authors.some((a) => !(d.author ?? '').toLowerCase().includes(a))) return false;
  if (q.titles.some((t) => !d.title.toLowerCase().includes(t))) return false;
  if (q.status === 'unfinished' ? state === 'finished' : q.status && q.status !== state) return false;
  const h = hay(d);
  if (q.exclude.some((x) => h.includes(x))) return false;
  return true;
}

export interface TextHit { blockId: string; snippet: string }
/** Blocks that contain every word and every exact phrase and none of the excluded words. */
export function advancedHits(doc: ParsedDocument, q: LibraryQuery, limit = 3): TextHit[] {
  const needles = [...q.phrases, ...q.words];
  if (!needles.length) return [];
  const out: TextHit[] = [];
  for (const b of doc.blocks) {
    const lower = b.text.toLowerCase();
    if (!needles.every((n) => lower.includes(n)) || q.exclude.some((x) => lower.includes(x))) continue;
    const at = lower.indexOf(needles[0]);
    const start = Math.max(0, at - 60), end = Math.min(b.text.length, at + needles[0].length + 80);
    out.push({ blockId: b.id, snippet: `${start > 0 ? '…' : ''}${b.text.slice(start, end)}${end < b.text.length ? '…' : ''}` });
    if (out.length >= limit) break;
  }
  return out;
}

export interface LibraryResult { docId: string; titleHit: boolean; hits: TextHit[] }
/** The whole advanced search. A filters-only query (tag:history) lists the matching documents. */
export function searchLibrary(items: ReadonlyArray<{ doc: LibraryDocInfo; parsed: ParsedDocument; state: ReadState }>, q: LibraryQuery): LibraryResult[] {
  const needles = [...q.phrases, ...q.words];
  const out: LibraryResult[] = [];
  for (const { doc, parsed, state } of items) {
    if (!docPassesFilters(doc, q, state)) continue;
    if (!needles.length) { if (q.hasFilters) out.push({ docId: doc.id, titleHit: true, hits: [] }); continue; }
    const h = hay(doc);
    const titleHit = needles.every((n) => h.includes(n));
    const hits = advancedHits(parsed, q);
    if (titleHit || hits.length) out.push({ docId: doc.id, titleHit, hits });
  }
  return out.sort((a, b) => Number(b.titleHit) - Number(a.titleHit) || b.hits.length - a.hits.length);
}
