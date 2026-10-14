export interface ExportItem { kind: 'bookmark' | 'highlight' | 'note'; docTitle: string; docAuthor?: string; section?: string; text: string; body?: string; createdAt: number }

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** One file for Obsidian, Notion and any notes app: documents as headings, passages as quotes, notes underneath. */
export function toMarkdown(items: ExportItem[], title = 'My highlights and notes'): string {
  const byDoc = new Map<string, ExportItem[]>();
  [...items].sort((a, b) => a.createdAt - b.createdAt).forEach((i) => byDoc.set(i.docTitle, [...(byDoc.get(i.docTitle) ?? []), i]));
  const lines = [`# ${title}`, ''];
  for (const [doc, list] of byDoc) {
    lines.push(`## ${doc}`, '');
    for (const i of list) {
      const label = i.kind === 'highlight' ? 'Highlight' : i.kind === 'bookmark' ? 'Bookmark' : 'Note';
      lines.push(`> ${i.text.replace(/\n+/g, ' ')}`, '', `*${label}${i.section ? `, ${i.section}` : ''}, ${day(i.createdAt)}*`);
      if (i.body) lines.push('', `- ${i.body.replace(/\n+/g, ' ')}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** Stops a spreadsheet from running a cell that starts with = + - @ as a formula. */
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const cell = (v: string | undefined) => `"${safe(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

export function toCsv(items: ExportItem[]): string {
  const head = ['Document', 'Section', 'Type', 'Passage', 'Note', 'Date'];
  const rows = [...items].sort((a, b) => a.createdAt - b.createdAt).map((i) => [i.docTitle, i.section, i.kind, i.text, i.body, day(i.createdAt)].map(cell).join(','));
  return [head.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}

/** The column layout Readwise's CSV import expects. */
export function toReadwiseCsv(items: ExportItem[]): string {
  const head = ['Highlight', 'Title', 'Author', 'URL', 'Note', 'Location', 'Date'];
  const rows = items.filter((i) => i.kind !== 'bookmark').sort((a, b) => a.createdAt - b.createdAt)
    .map((i) => [i.text, i.docTitle, i.docAuthor, '', i.body, i.section, day(i.createdAt)].map(cell).join(','));
  return [head.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}
