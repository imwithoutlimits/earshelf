import { BOOKS } from './books.ts';

/**
 * Hebrew and Greek word study (Tapestry Pro), from STEPBible-Data (TAHOT and TAGNT), CC BY 4.0, by STEPBible.org / Tyndale House.
 * The licence lets us include the data in software without asking, requires the credit below, and asks that changes be recorded:
 * we drop columns we do not show and remove the separator marks ("/" and "\") in the Hebrew. No wording is changed.
 * The files are downloaded straight from STEPBible's own repository (scripts/load-original-languages.mjs); they are not copied into this repo.
 */
export const STEP_CREDIT = 'Hebrew and Greek word data from STEPBible.org (Tyndale House, Cambridge), CC BY 4.0. Reformatted from the original files: some columns were left out and separator marks removed; no wording was changed.';
export const STEP_DIR_API = 'https://api.github.com/repos/STEPBible/STEPBible-Data/contents/Translators%20Amalgamated%20OT%2BNT';

export type OrigLang = 'he' | 'gr';
/** [original word, transliteration, English gloss, Strong's number] */
export type OrigWord = [word: string, translit: string, gloss: string, strongs: string];
export interface OrigVerse { ref: string; lang: OrigLang; words: OrigWord[] }

export interface StepRow { ref: string; n: number; word: string; translit: string; gloss: string; strongs: string }

const CODES = new Set(BOOKS.map((b) => b.code));
const ROW = /^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)(?:\([^)]*\))?#(\d+)=(.*)$/;

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
/** "in/ beginning" becomes "in beginning". Angle and square brackets (words implied or not translated) are kept: they are STEPBible's own notation. */
const cleanGloss = (s: string) => tidy(s.replace(/\//g, ' '));
const cleanHebrew = (s: string) => s.replace(/[\\/]/g, '').trim();
/** The main Strong's number of a cell: the one in {curly brackets} if there is one (the root word), otherwise the first. "H9003/{H7225G}" gives "H7225". */
export function mainStrongs(cell: string): string {
  const root = /\{([HG]\d{4})[A-Za-z]?\}/.exec(cell) ?? /([HG]\d{4})/.exec(cell);
  return root ? root[1] : '';
}

/**
 * Reads a TAHOT (Hebrew) or TAGNT (Greek) file. It finds each file's columns from its own header row, so it does not depend on
 * column order. Returns one row per word of the main text, in the file's order.
 */
export function parseStepFile(text: string, lang: OrigLang): StepRow[] {
  const out: StepRow[] = [];
  let col = { word: 1, translit: -1, gloss: 3, strongs: 4, combined: false };
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('\t');
    const first = (cells[0] ?? '').trim();
    // Header rows name the columns.
    if (/Ref & Type|Word & Type/i.test(first) && cells.length > 3) {
      const find = (re: RegExp) => cells.findIndex((c, i) => i > 0 && re.test(c.trim()));
      const word = find(lang === 'he' ? /^hebrew$/i : /^greek$/i), translit = find(/^transliteration$/i), gloss = find(/^(english )?translation$/i), strongs = find(/^dstrongs/i);
      col = { word: word > 0 ? word : 1, translit, gloss: gloss > 0 ? gloss : 2, strongs: strongs > 0 ? strongs : 3, combined: /=/.test(cells[strongs] ?? '') };
      continue;
    }
    const m = ROW.exec(first);
    if (!m) continue;
    const code = m[1].toUpperCase();
    if (!CODES.has(code)) continue;
    const verse = Number(m[3]);
    if (verse < 1) continue; // psalm titles and the like have no verse number of their own in English Bibles
    const type = m[5];
    // Hebrew: keep the main text (Leningrad, Qere, restored). Greek: keep words that are in the NA text.
    if (lang === 'he' ? !/^[LQR]/.test(type) : !/N/.test(type)) continue;
    const ref = `${code}.${Number(m[2])}.${verse}`, n = Number(m[4]);
    const key = `${ref}#${n}`;
    if (seen.has(key)) continue; // the first reading of each word position wins
    const wordCell = (cells[col.word] ?? '').trim();
    if (!wordCell) continue;
    let translit = col.translit > 0 ? (cells[col.translit] ?? '').trim() : '';
    let word = lang === 'he' ? cleanHebrew(wordCell) : wordCell;
    const paren = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(word); // Greek cells often read "Βίβλος (Biblos)"
    if (lang === 'gr' && paren) { word = paren[1].trim(); if (!translit) translit = paren[2].trim(); }
    const gloss = cleanGloss(cells[col.gloss] ?? '');
    const strongs = mainStrongs(cells[col.strongs] ?? '');
    out.push({ ref, n, word, translit: lang === 'he' ? translit.replace(/\//g, '') : translit, gloss, strongs });
    seen.add(key);
  }
  return out;
}

/** One entry per verse, words in order. */
export function groupByVerse(rows: readonly StepRow[], lang: OrigLang): OrigVerse[] {
  const by = new Map<string, StepRow[]>();
  for (const r of rows) (by.get(r.ref) ?? by.set(r.ref, []).get(r.ref)!).push(r);
  return [...by.entries()].map(([ref, rs]) => ({ ref, lang, words: rs.sort((a, b) => a.n - b.n).map((r): OrigWord => [r.word, r.translit, r.gloss, r.strongs]) }));
}

/** The loader refuses a file that does not look like the real one (the whole Old Testament is about 305,000 words, the New Testament about 138,000). */
export function looksRightOriginal(v: readonly OrigVerse[], lang: OrigLang): boolean {
  const words = v.reduce((n, x) => n + x.words.length, 0);
  const complete = v.filter((x) => x.words.every((w) => w[0] && w[2])).length / Math.max(1, v.length);
  return lang === 'he' ? words > 200_000 && v.length > 20_000 && complete > 0.97 : words > 100_000 && v.length > 7_000 && complete > 0.97;
}

/** Roughly how much room the verses take in the database, so the owner can see it before anything is saved. */
export const approxBytes = (v: readonly OrigVerse[]): number => v.reduce((n, x) => n + x.ref.length + 20 + JSON.stringify(x.words).length, 0);

/** Verse keys to look up for a passage key like PSA.23, PSA.23.1 or ISA.40.28-31. Chapters return null (the database searches by prefix). */
export function verseKeys(key: string): string[] | null {
  const m = /^([A-Z0-9]{3})\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(key);
  if (!m) return null;
  const a = Number(m[3]), b = m[4] ? Number(m[4]) : a;
  if (b < a || b - a > 40) return null;
  return Array.from({ length: b - a + 1 }, (_, i) => `${m[1]}.${Number(m[2])}.${a + i}`);
}
export const langOf = (ref: string): OrigLang => (BOOKS.find((b) => b.code === ref.slice(0, 3))!.n <= 39 ? 'he' : 'gr');
