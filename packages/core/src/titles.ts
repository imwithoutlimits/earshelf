// Embedded file titles are often junk ("Unknown", "Microsoft Word - Document1.docx", "Untitled"). These helpers decide when to ignore them.

const PLACEHOLDERS = /^(?:unknown|untitled|no title|notitle|none|null|undefined|n\/a|na|title|document|doc|new document|new doc|slide \d+|word document|powerpoint presentation|presentation\d*|document\d+|doc\d+|book\d*|pdf|scan|scanned document|default|test|sample)$/i;
const APP_PREFIX = /^(?:microsoft (?:word|powerpoint|excel|publisher)|adobe (?:acrobat|indesign|illustrator)|pages|libreoffice writer)\s+[-–—]\s+/i;
const EXTENSION = /\.(?:docx?|pdf|txt|rtf|odt|epub|indd|pptx?|qxd|tex|md|html?|jpe?g|png|gif|webp|heic|tiff?|bmp)$/i;
const CAMERA_NAME = /^(?:img|dsc|scan|image|photo|screenshot|file|download|untitled|new|document|doc)[\s_-]*\d*$/i;
const PLACEHOLDER_AUTHORS = /^(?:unknown|anonymous|admin|administrator|user|author|none|null|n\/a|na|owner|windows user|microsoft|adobe|default|test)$/i;

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Strips app prefixes and file extensions, and turns snake_case file names into words. */
export function normalizeTitle(raw: string | null | undefined): string {
  let t = tidy(raw ?? '');
  t = t.replace(APP_PREFIX, '').replace(EXTENSION, '');
  if (!t.includes(' ') && /[_]/.test(t)) t = t.replace(/_+/g, ' ');
  return tidy(t);
}

export function isPlaceholderTitle(raw: string | null | undefined): boolean {
  const t = normalizeTitle(raw);
  if (t.length < 2) return true;
  if (PLACEHOLDERS.test(t) || CAMERA_NAME.test(t) || /^untitled\b/i.test(t)) return true;
  if (/^[\d\W_]+$/.test(t)) return true; // only digits and punctuation, like a phone's file number
  return false;
}

/** The first candidate that is a real title, tidied up. Undefined when none is. */
export function pickTitle(candidates: Array<string | null | undefined>): string | undefined {
  for (const c of candidates) {
    if (c && !isPlaceholderTitle(c)) return normalizeTitle(c).slice(0, 200);
  }
  return undefined;
}

/** A title taken from a file name, or undefined when the name is just a camera or scanner number. */
export function titleFromFileName(name: string): string | undefined {
  let n = name.trim();
  try { n = decodeURIComponent(n); } catch { /* keep as is */ }
  return pickTitle([n]);
}

export function cleanAuthor(raw: string | null | undefined): string | undefined {
  const a = tidy(raw ?? '');
  if (a.length < 2 || PLACEHOLDER_AUTHORS.test(a)) return undefined;
  return a.slice(0, 160);
}
