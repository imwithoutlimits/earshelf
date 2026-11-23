import { BOOKS } from './books.ts';

/**
 * Cross-references (Tapestry Pro), from OpenBible.info: about 340,000 pairs, mostly from the public domain Treasury of Scripture Knowledge,
 * licensed CC BY 4.0. The app must credit it (CROSSREF_CREDIT). This file turns their text file into Tapestry's own passage keys.
 */
export const CROSSREF_CREDIT = 'Cross-references from OpenBible.info, used under CC BY 4.0.';
export const CROSSREF_ZIP_URL = 'https://a.openbible.info/data/cross-references.zip';

// OSIS book ids in canon order, so the position matches Tapestry's book number 1 to 66.
const OSIS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];
export const OSIS_TO_CODE: Readonly<Record<string, string>> = Object.fromEntries(OSIS.map((o, i) => [o.toLowerCase(), BOOKS[i].code]));

const REF = '([1-3]?[A-Za-z]+)\\.(\\d+)\\.(\\d+)';
const LINE = new RegExp(`^${REF}\\s+${REF}(?:-${REF})?\\s+(-?\\d+)\\s*$`);

export interface CrossRef { from: string; to: string; votes: number }

/** One data line, e.g. "Gen.1.1<TAB>Prov.8.22-Prov.8.30<TAB>59". Returns null for anything else (header lines, blanks, unknown books). */
export function parseCrossRefLine(line: string): CrossRef | null {
  const m = LINE.exec(line.trim());
  if (!m) return null;
  const code = (osis: string) => OSIS_TO_CODE[osis.toLowerCase()];
  const [, b1, c1, v1, b2, c2, v2, b3, c3, v3, votes] = m;
  const from = code(b1), to = code(b2);
  if (!from || !to) return null;
  const toStart = `${to}.${Number(c2)}.${Number(v2)}`;
  let toRef = toStart;
  // A range inside one chapter keeps its end (PRO.8.22-30). A range that crosses chapters keeps only its first verse.
  if (b3 && code(b3) === to && Number(c3) === Number(c2) && Number(v3) > Number(v2)) toRef = `${toStart}-${Number(v3)}`;
  return { from: `${from}.${Number(c1)}.${Number(v1)}`, to: toRef, votes: Number(votes) };
}

export interface CrossRefParse { rows: CrossRef[]; dataLines: number; skipped: number }
/** The whole file. Keeps pairs with at least minVotes, one row per pair (the best vote). `dataLines` counts lines that looked like data. */
export function parseCrossRefFile(text: string, opts: { minVotes?: number } = {}): CrossRefParse {
  const min = opts.minVotes ?? 5;
  const best = new Map<string, CrossRef>();
  let dataLines = 0, skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !/\d+\.\d+/.test(line)) continue; // blank lines and the header
    dataLines++;
    const r = parseCrossRefLine(line);
    if (!r) { skipped++; continue; }
    if (r.votes < min || r.from === r.to) continue;
    const k = `${r.from}>${r.to}`, have = best.get(k);
    if (!have || r.votes > have.votes) best.set(k, r);
  }
  return { rows: [...best.values()], dataLines, skipped };
}
/** The loader stops if the file does not look like what we expect, instead of loading rubbish. */
export const looksRight = (p: CrossRefParse): boolean => p.dataLines > 1000 && p.skipped / p.dataLines < 0.1;

/** Verse keys inside a passage key, for looking up its cross-references. Chapters are handled by the database (prefix search). */
export function versesIn(key: string): string[] | 'chapter' | null {
  const m = /^([A-Z0-9]{3})\.(\d+)(?:\.(\d+)(?:-(\d+))?)?$/.exec(key);
  if (!m) return null;
  if (m[3] === undefined) return 'chapter';
  const a = Number(m[3]), b = m[4] ? Number(m[4]) : a;
  if (b < a || b - a > 60) return null;
  return Array.from({ length: b - a + 1 }, (_, i) => `${m[1]}.${Number(m[2])}.${a + i}`);
}

export interface RelatedRow { from_ref: string; to_ref: string; votes: number }
export interface Related { ref: string; votes: number; from: string[] }
/** The strongest related passages for a passage: pairs with the same target are added together, and anything inside the passage itself is left out. */
export function rankRelated(rows: readonly RelatedRow[], key: string, limit = 25): Related[] {
  const verses = versesIn(key);
  const inside = (to: string): boolean => {
    const m = /^([A-Z0-9]{3})\.(\d+)\.(\d+)/.exec(to);
    if (!m || !verses) return false;
    return verses === 'chapter' ? key === `${m[1]}.${Number(m[2])}` : verses.includes(`${m[1]}.${Number(m[2])}.${Number(m[3])}`);
  };
  const by = new Map<string, Related>();
  for (const r of rows) {
    if (inside(r.to_ref)) continue;
    const cur = by.get(r.to_ref) ?? { ref: r.to_ref, votes: 0, from: [] };
    cur.votes += r.votes;
    if (!cur.from.includes(r.from_ref)) cur.from.push(r.from_ref);
    by.set(r.to_ref, cur);
  }
  return [...by.values()].sort((a, b) => b.votes - a.votes || a.ref.localeCompare(b.ref)).slice(0, limit);
}
