import type { CleanupReport } from './model.ts';
import { countWords, guessHeading, isHeadingLine } from './structure.ts';

export interface CleanupOptions {
  pageNumbers: boolean;
  repeatedHeaders: boolean;
  hyphenation: boolean;
  lineWraps: boolean;
  footnotes: boolean;
  references: boolean;
  citations: boolean;
  /** Everything below is optional so documents saved earlier keep working. Unset means off. */
  tables?: boolean;
  figures?: boolean;
  urls?: boolean;
  contents?: boolean;
  emoji?: boolean;
  code?: boolean;
  /** Keys from listSections() for sections the person does not want read. */
  skipSections?: string[];
}
/** The on/off options (everything except the list of skipped sections). */
export type CleanupFlag = Exclude<keyof CleanupOptions, 'skipSections'>;

export const DEFAULT_CLEANUP: CleanupOptions = {
  pageNumbers: true,
  repeatedHeaders: true,
  hyphenation: true,
  lineWraps: true,
  footnotes: false,
  references: false,
  citations: false,
};

interface Line {
  text: string;
  page: number;
  pageNumber: boolean;
  repeated: boolean;
  footnote: boolean;
}

const LIGATURES: Record<string, string> = { 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl' };

export function normalizeText(s: string): string {
  return s
    .replace(/[ﬁﬂﬀﬃﬄ]/g, (c) => LIGATURES[c] ?? c)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[ \t]+$/gm, '');
}

const PAGE_NUM_EXPLICIT = /^\s*(?:page\s+\d{1,4}(?:\s+of\s+\d{1,4})?|[-–—]\s*\d{1,4}\s*[-–—])\s*$/i;
const PAGE_NUM_EDGE = /^\s*(?:[-–—]\s*)?(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?(?:\s*[-–—])?\s*$/i;
const ROMAN_LOWER = /^(?=[ivxlc]+$)(?:x{0,3})(?:ix|iv|v?i{0,3})$/;
const FOOTNOTE_START = /^\s*(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+|\d{1,2}(?=\s+[A-Za-z(“"])|[*†‡§])\s*\S/;
const REFERENCES_HEADING = /^\s*(references|bibliography|works cited|endnotes|literature cited)\s*:?\s*$/i;

function normKey(s: string): string {
  return s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

function classify(pages: string[]): Line[] {
  const multi = pages.length > 1;
  const perPage = pages.map((p) => normalizeText(p).replace(/\r\n?/g, '\n').split('\n'));

  const pageEdges = perPage.map((pl) => {
    const nonEmpty: Array<{ i: number; t: string }> = [];
    pl.forEach((raw, i) => {
      const t = raw.trim();
      if (t) nonEmpty.push({ i, t });
    });
    return nonEmpty;
  });

  const keyPages = new Map<string, number>();
  if (multi) {
    pageEdges.forEach((ne) => {
      const edge = new Set<number>();
      ne.slice(0, 2).forEach((e) => edge.add(e.i));
      ne.slice(-2).forEach((e) => edge.add(e.i));
      const keys = new Set<string>();
      ne.filter((e) => edge.has(e.i)).forEach((e) => {
        const k = normKey(e.t);
        if (k.length >= 3 && k.length <= 90 && k !== '#') keys.add(k);
      });
      keys.forEach((k) => keyPages.set(k, (keyPages.get(k) ?? 0) + 1));
    });
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const repeatedKeys = new Set<string>();
  keyPages.forEach((count, k) => {
    if (count >= threshold) repeatedKeys.add(k);
  });

  const out: Line[] = [];
  perPage.forEach((pl, pageIdx) => {
    const ne = pageEdges[pageIdx];
    const firstEdge = new Set(ne.slice(0, 3).map((e) => e.i));
    const lastEdge = new Set(ne.slice(-3).map((e) => e.i));
    const footCount = Math.max(1, Math.min(6, Math.ceil(ne.length * 0.25)));
    const footSet = new Set(ne.slice(-footCount).map((e) => e.i));
    const twoEdge = new Set([...ne.slice(0, 2), ...ne.slice(-2)].map((e) => e.i));

    pl.forEach((raw, i) => {
      const t = raw.trim();
      let pageNumber = false;
      let repeated = false;
      let footnote = false;
      if (t) {
        if (multi && (firstEdge.has(i) || lastEdge.has(i))) {
          pageNumber = PAGE_NUM_EDGE.test(t) || ROMAN_LOWER.test(t);
        } else {
          pageNumber = PAGE_NUM_EXPLICIT.test(t);
        }
        if (!pageNumber && multi && twoEdge.has(i) && repeatedKeys.has(normKey(t))) repeated = true;
        if (!pageNumber && !repeated && multi && footSet.has(i) && FOOTNOTE_START.test(t)) footnote = true;
      }
      out.push({ text: raw, page: pageIdx + 1, pageNumber, repeated, footnote });
    });
  });
  return out;
}

export function findReferencesStart(lines: string[]): number {
  const from = Math.floor(lines.length * 0.4);
  for (let i = from; i < lines.length; i++) {
    if (REFERENCES_HEADING.test(lines[i])) return i;
  }
  return -1;
}

const NUMERIC_CITATION = /\s?\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]/g;
const AUTHOR_YEAR = /\s?\((?:[A-Z][A-Za-z'’-]+(?: et al\.)?(?:(?:,| and| &) [A-Z][A-Za-z'’-]+)*,? \d{4}[a-z]?(?:; )?)+\)/g;

export function stripNumericCitations(text: string): string {
  return text.replace(NUMERIC_CITATION, '').replace(/ +([,.;:!?])/g, '$1');
}

export function stripCitations(text: string): string {
  return stripNumericCitations(text).replace(AUTHOR_YEAR, '').replace(/ +([,.;:!?])/g, '$1');
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
  return m ? m.length : 0;
}

export function analyze(pages: string[]): CleanupReport {
  const info = classify(pages);
  const pageNumbers = info.filter((l) => l.pageNumber).length;
  const repeatedHeaders = info.filter((l) => l.repeated).length;
  const footnotes = info.filter((l) => l.footnote).length;

  const bodyLines = info.filter((l) => !l.pageNumber && !l.repeated).map((l) => l.text);
  const refStart = findReferencesStart(bodyLines);
  let references = 0;
  if (refStart >= 0) {
    const tail = bodyLines.slice(refStart + 1);
    const starts = tail.filter((l) => /^\s*(\[\d+\]|\d+\.\s|[A-Z][A-Za-z'’-]+,\s)/.test(l)).length;
    const paras = tail.join('\n').split(/\n{2,}/).filter((p) => p.trim()).length;
    references = starts || paras;
  }
  const body = (refStart >= 0 ? bodyLines.slice(0, refStart) : bodyLines).join('\n');

  const citations = countMatches(body, NUMERIC_CITATION) + countMatches(body, AUTHOR_YEAR);
  const captionLines = body.split('\n');
  const figures = captionLines.filter((l) => /^\s*(figure|fig\.)\s+\d+/i.test(l)).length;
  let tables = captionLines.filter((l) => /^\s*table\s+\d+/i.test(l)).length;
  let inPipe = false;
  for (const l of captionLines) {
    const isPipe = /^\s*\|/.test(l);
    if (isPipe && !inPipe) tables++;
    inPipe = isPipe;
  }
  const hyphenatedWords = countMatches(pages.map(normalizeText).join('\n'), /[a-z]-\n[a-z]/);

  return { pageNumbers, repeatedHeaders, footnotes, references, citations, tables, figures, hyphenatedWords, ...countExtras(pages) };
}

/** Rejoins hard-wrapped lines into paragraphs (paragraphs separated by blank lines). */
export function reflow(text: string): string {
  const lines = text.split('\n');
  const lens = lines.map((l) => l.trim().length).filter((n) => n > 0).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  const paras: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) {
      paras.push(cur.join(' '));
      cur = [];
    }
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      flush();
      continue;
    }
    if (/^(#{1,6}\s|\|)/.test(t) || isHeadingLine(t)) {
      flush();
      paras.push(t);
      continue;
    }
    if (/^([-*+]|\d+[.)])\s+/.test(t) || /^>\s?/.test(t)) flush();
    cur.push(t);
    if (/[.!?…]["”’')\]]*$/.test(t) && t.length < median * 0.7) flush();
  }
  flush();
  return paras.join('\n\n');
}

export function cleanPages(pages: string[], opts: CleanupOptions = DEFAULT_CLEANUP): string {
  const info = classify(pages);
  let kept = info
    .filter((l) => !(opts.pageNumbers && l.pageNumber))
    .filter((l) => !(opts.repeatedHeaders && l.repeated))
    .filter((l) => !(opts.footnotes && l.footnote))
    .map((l) => l.text);

  if (opts.references) {
    const idx = findReferencesStart(kept);
    if (idx >= 0) kept = kept.slice(0, idx);
  }
  if (opts.contents) {
    const toc = findContents(kept);
    if (toc) kept = [...kept.slice(0, toc.from), ...kept.slice(toc.to)];
  }
  if (opts.tables) kept = kept.filter((l) => !/^\s*\|/.test(l) && !/^\s*table\s+\d+/i.test(l));
  if (opts.figures) kept = kept.filter((l) => !/^\s*(figure|fig\.)\s+\d+/i.test(l));

  let text = kept.join('\n');
  if (opts.code) text = stripCodeBlocks(text);
  if (opts.hyphenation) text = text.replace(/([a-z])-\n([a-z])/g, '$1$2');
  text = opts.lineWraps ? reflow(text) : text.replace(/\n{3,}/g, '\n\n');
  if (opts.citations) text = stripCitations(text);
  if (opts.urls) text = stripUrls(text);
  if (opts.emoji) text = stripEmoji(text);
  if (opts.skipSections?.length) text = dropSections(text, opts.skipSections);
  return text.trim();
}

/* ---------- more things a person can choose not to have read ---------- */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>]*[^\s<>.,;:!?'"”’)\]]/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const EMOJI_RE = /(?![\u00a9\u00ae\u2122])\p{Extended_Pictographic}|[\ufe0f\u200d]/gu;
const TOC_HEAD = /^\s*(?:table of )?contents\s*$/i;
const TOC_LINE = /^.{2,90}?(?:\.{2,}|·{2,}|…+|\s{3,})\s*(?:\d{1,4}|[ivxlc]{1,6})\s*$/i;

export function stripUrls(text: string): string {
  return text.replace(URL_RE, '').replace(EMAIL_RE, '').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])/g, '$1');
}
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ');
}
export function stripCodeBlocks(text: string): string {
  return text.replace(/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm, '').replace(/\n{3,}/g, '\n\n');
}

/** Index range [from, to) of a table of contents near the start (a Contents heading followed by lines ending in page numbers). */
export function findContents(lines: string[]): { from: number; to: number; entries: number } | null {
  const limit = Math.floor(lines.length * 0.5);
  for (let i = 0; i < limit; i++) {
    if (!TOC_HEAD.test(lines[i])) continue;
    let j = i + 1, entries = 0, blanks = 0;
    while (j < lines.length) {
      const t = lines[j].trim();
      if (!t) { if (++blanks > 3) break; j++; continue; }
      if (!TOC_LINE.test(t)) break;
      entries++; blanks = 0; j++;
    }
    if (entries >= 3) return { from: i, to: j, entries };
  }
  return null;
}

const normKeyTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

export interface SectionItem { key: string; title: string; level: number; words: number }

/** The headings found in cleaned text, with a stable key for each (the same title twice gets 1 and 2) so a choice survives other changes. */
export function listSections(text: string): SectionItem[] {
  const seen = new Map<string, number>();
  const out: SectionItem[] = [];
  let cur: SectionItem | null = null;
  for (const p of text.split(/\n{2,}/)) {
    const h = p.includes('\n') ? null : guessHeading(p);
    if (h) {
      const base = normKeyTitle(h.text);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      cur = { key: `${base}|${n}`, title: h.text, level: h.level, words: 0 };
      out.push(cur);
    } else if (cur) cur.words += countWords(p);
  }
  return out;
}

/** Removes the chosen sections: each heading and everything under it until the next heading of the same or higher level. */
export function dropSections(text: string, keys: string[] | undefined): string {
  if (!keys?.length) return text;
  const drop = new Set(keys);
  const seen = new Map<string, number>();
  const kept: string[] = [];
  let skipLevel: number | null = null;
  for (const p of text.split(/\n{2,}/)) {
    const h = p.includes('\n') ? null : guessHeading(p);
    if (h) {
      const base = normKeyTitle(h.text);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      if (skipLevel !== null && h.level <= skipLevel) skipLevel = null;
      if (skipLevel === null && drop.has(`${base}|${n}`)) skipLevel = h.level;
    }
    if (skipLevel === null) kept.push(p);
  }
  return kept.join('\n\n');
}

/** Counts for the checklist, so each choice can say how much it would remove. */
export function countExtras(pages: string[]): { urls: number; emoji: number; contents: number; code: number } {
  const text = pages.map(normalizeText).join('\n');
  const toc = findContents(text.split('\n'));
  return {
    urls: countMatches(text, URL_RE) + countMatches(text, EMAIL_RE),
    emoji: countMatches(text, EMOJI_RE),
    contents: toc?.entries ?? 0,
    code: countMatches(text, /^[ \t]*```/m) / 2 | 0,
  };
}
