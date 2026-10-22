import { unzipSync, strFromU8 } from 'fflate';
import { BOOKS, STARTER_WELLS, TRANSLATIONS, parseVpl, looksComplete, validateStarter } from '../../../../packages/scripture/src/index.ts';
import { rest } from '../supa.ts';

async function download(id: string): Promise<string> {
  const res = await fetch(`https://ebible.org/Scriptures/${id}_vpl.zip`);
  if (!res.ok) throw new Error(`eBible returned ${res.status} for ${id}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const txt = Object.entries(files).filter(([n]) => /\.txt$/i.test(n)).sort((a, b) => b[1].length - a[1].length)[0];
  if (!txt) throw new Error('The download did not contain a text file.');
  return strFromU8(txt[1]);
}
const batches = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const upsert = (table: string, rows: unknown[], conflict: string) => rest(`${table}?on_conflict=${conflict}`, { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: rows });

/** Loads one reviewed translation from eBible.org. Only translations listed in packages/scripture/src/translations.ts can be loaded. */
export async function importTranslation(id: string, enable: boolean) {
  const m = TRANSLATIONS.find((t) => t.id === id);
  if (!m) throw new Error(`Translation ${id} is not in the reviewed list. Read its license, record it in LICENSES.md, then add it to translations.ts.`);
  const parsed = parseVpl(await download(id));
  if (!looksComplete(parsed)) throw new Error(`The text looks incomplete: ${parsed.books} of 66 books, ${parsed.verses.length} verses. Unrecognised book codes: ${parsed.unknownCodes.join(', ') || 'none'}. Example lines: ${parsed.skipped.slice(0, 3).join(' | ')}`);
  await upsert('translations', [{ id, name: m.name, abbreviation: m.abbreviation, copyright_notice: m.notice, license_name: 'Public Domain', license_url: m.licenseUrl, source_url: `https://ebible.org/Scriptures/${id}_vpl.zip`, commercial_use_allowed: true, enabled: false }], 'id');
  await upsert('bible_books', BOOKS.map((b) => ({ n: b.n, code: b.code, name: b.name, testament: b.testament, chapters: b.chapters })), 'n');
  const counts = new Map<string, number>();
  for (const v of parsed.verses) { const k = `${v.book}:${v.chapter}`; counts.set(k, Math.max(counts.get(k) ?? 0, v.verse)); }
  await upsert('bible_chapters', [...counts].map(([k, verses]) => { const [book, chapter] = k.split(':').map(Number); return { book, chapter, verses }; }), 'book,chapter');
  for (const part of batches(parsed.verses, 1000)) await upsert('bible_verses', part.map((v) => ({ translation_id: id, book: v.book, chapter: v.chapter, verse: v.verse, text: v.text })), 'translation_id,book,chapter,verse');
  await rest(`translations?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { verse_count: parsed.verses.length, imported_at: new Date().toISOString(), enabled: enable } });
  const problems = validateStarter((book, chapter) => counts.get(`${book}:${chapter}`));
  return { translation: id, verses: parsed.verses.length, books: parsed.books, enabled: enable, starterProblems: problems };
}

export async function seedStarter() {
  await upsert('curated_wells', STARTER_WELLS.map((w, i) => ({ id: w.id, name: w.name, description: w.description, intro: w.intro, tags: w.tags, memorize_ref: w.memorize, status: w.status, position: i })), 'id');
  for (const w of STARTER_WELLS) {
    await rest(`curated_well_items?well_id=eq.${w.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    await upsert('curated_well_items', w.items.map((it, p) => ({ well_id: w.id, position: p, ref: it.ref, link: it.link, note: it.note ?? null })), 'well_id,position');
    await rest(`reflection_prompts?well_id=eq.${w.id}&source=eq.editorial`, { method: 'DELETE', prefer: 'return=minimal' });
    await rest('reflection_prompts', { method: 'POST', prefer: 'return=minimal', body: w.prompts.map((body) => ({ well_id: w.id, body, source: 'editorial' })) });
  }
  return { wells: STARTER_WELLS.length, passages: STARTER_WELLS.reduce((n, w) => n + w.items.length, 0) };
}
