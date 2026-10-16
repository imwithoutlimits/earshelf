import type { DocSection, ParsedDocument } from './model.ts';

export interface ChapterInfo { index: number; total: number; title: string }

/** The top-level sections are the chapters. A document with a single level uses every section. */
export function chaptersOf(sections: DocSection[]): DocSection[] {
  if (!sections.length) return [];
  const top = Math.min(...sections.map((s) => s.level));
  return sections.filter((s) => s.level === top);
}

/** Which chapter a section belongs to (1-based), so "Chapter 4 of 11" can be shown while a sub-section is being read. */
export function chapterFor(sections: DocSection[], sectionId: string): ChapterInfo | null {
  const chapters = chaptersOf(sections);
  if (!chapters.length) return null;
  const top = chapters[0].level;
  let current = -1;
  for (const s of sections) {
    if (s.level === top) current++;
    if (s.id === sectionId) return { index: Math.max(0, current) + 1, total: chapters.length, title: chapters[Math.max(0, current)].title };
  }
  return null;
}

/** Best guess at the chapter for a place expressed as 0..1 through the document (used before the audio is loaded, e.g. on the library screen). */
export function chapterAtFraction(parsed: Pick<ParsedDocument, 'blocks' | 'sections'>, fraction: number): ChapterInfo | null {
  const { blocks, sections } = parsed;
  if (!blocks.length || !sections.length) return null;
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const blockId = blocks[Math.round(f * (blocks.length - 1))]?.id;
  const sec = sections.find((s) => s.blockIds.includes(blockId));
  return chapterFor(sections, (sec ?? sections[0]).id);
}

/** For each chapter, the id of its first block. The reader uses this to show a chapter number beside the heading. */
export function chapterStarts(sections: DocSection[]): Map<string, number> {
  const m = new Map<string, number>();
  chaptersOf(sections).forEach((s, i) => { if (s.blockIds[0]) m.set(s.blockIds[0], i + 1); });
  return m;
}
