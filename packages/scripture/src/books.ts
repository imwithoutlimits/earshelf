export type Testament = 'OT' | 'NT';
export interface Book { n: number; code: string; name: string; chapters: number; testament: Testament; aliases: string[] }
// code = USFM code (also what eBible's verse-per-line files use). aliases are lowercase, spaces and dots removed.
const B = (n: number, code: string, name: string, chapters: number, testament: Testament, ...aliases: string[]): Book => ({ n, code, name, chapters, testament, aliases });
export const BOOKS: Book[] = [
  B(1, 'GEN', 'Genesis', 50, 'OT', 'gen', 'ge', 'gn'), B(2, 'EXO', 'Exodus', 40, 'OT', 'exod', 'ex', 'exo'), B(3, 'LEV', 'Leviticus', 27, 'OT', 'lev', 'le', 'lv'),
  B(4, 'NUM', 'Numbers', 36, 'OT', 'num', 'nu', 'nm'), B(5, 'DEU', 'Deuteronomy', 34, 'OT', 'deut', 'dt', 'de'), B(6, 'JOS', 'Joshua', 24, 'OT', 'josh', 'jos'),
  B(7, 'JDG', 'Judges', 21, 'OT', 'judg', 'jdg', 'jg'), B(8, 'RUT', 'Ruth', 4, 'OT', 'ru', 'rth'), B(9, '1SA', '1 Samuel', 31, 'OT', '1sam', '1sa', 'isamuel', 'firstsamuel'),
  B(10, '2SA', '2 Samuel', 24, 'OT', '2sam', '2sa', 'iisamuel', 'secondsamuel'), B(11, '1KI', '1 Kings', 22, 'OT', '1kgs', '1ki', 'ikings', 'firstkings'),
  B(12, '2KI', '2 Kings', 25, 'OT', '2kgs', '2ki', 'iikings', 'secondkings'), B(13, '1CH', '1 Chronicles', 29, 'OT', '1chron', '1chr', '1ch', 'ichronicles'),
  B(14, '2CH', '2 Chronicles', 36, 'OT', '2chron', '2chr', '2ch', 'iichronicles'), B(15, 'EZR', 'Ezra', 10, 'OT', 'ezr'), B(16, 'NEH', 'Nehemiah', 13, 'OT', 'neh', 'ne'),
  B(17, 'EST', 'Esther', 10, 'OT', 'esth', 'es'), B(18, 'JOB', 'Job', 42, 'OT', 'jb'), B(19, 'PSA', 'Psalms', 150, 'OT', 'psalm', 'ps', 'psa', 'pslm', 'pss'),
  B(20, 'PRO', 'Proverbs', 31, 'OT', 'prov', 'pr', 'prv'), B(21, 'ECC', 'Ecclesiastes', 12, 'OT', 'eccl', 'eccles', 'ec', 'qoh'),
  B(22, 'SNG', 'Song of Solomon', 8, 'OT', 'songofsongs', 'song', 'sos', 'ss', 'sng', 'sol', 'canticles'), B(23, 'ISA', 'Isaiah', 66, 'OT', 'is', 'isa'),
  B(24, 'JER', 'Jeremiah', 52, 'OT', 'jer', 'je'), B(25, 'LAM', 'Lamentations', 5, 'OT', 'la', 'lam'), B(26, 'EZK', 'Ezekiel', 48, 'OT', 'ezek', 'eze', 'ezk'),
  B(27, 'DAN', 'Daniel', 12, 'OT', 'dn', 'da'), B(28, 'HOS', 'Hosea', 14, 'OT', 'ho'), B(29, 'JOL', 'Joel', 3, 'OT', 'joe', 'jl', 'jol'), B(30, 'AMO', 'Amos', 9, 'OT', 'am'),
  B(31, 'OBA', 'Obadiah', 1, 'OT', 'obad', 'ob'), B(32, 'JON', 'Jonah', 4, 'OT', 'jnh'), B(33, 'MIC', 'Micah', 7, 'OT', 'mi'), B(34, 'NAM', 'Nahum', 3, 'OT', 'nah', 'na'),
  B(35, 'HAB', 'Habakkuk', 3, 'OT', 'hb'), B(36, 'ZEP', 'Zephaniah', 3, 'OT', 'zeph', 'zep'), B(37, 'HAG', 'Haggai', 2, 'OT', 'hg'), B(38, 'ZEC', 'Zechariah', 14, 'OT', 'zech', 'zec'),
  B(39, 'MAL', 'Malachi', 4, 'OT', 'ml'),
  B(40, 'MAT', 'Matthew', 28, 'NT', 'matt', 'mt', 'mat'), B(41, 'MRK', 'Mark', 16, 'NT', 'mk', 'mar', 'mrk'), B(42, 'LUK', 'Luke', 24, 'NT', 'lk', 'lu'),
  B(43, 'JHN', 'John', 21, 'NT', 'jn', 'joh', 'jhn'), B(44, 'ACT', 'Acts', 28, 'NT', 'ac', 'acts'), B(45, 'ROM', 'Romans', 16, 'NT', 'rom', 'ro', 'rm'),
  B(46, '1CO', '1 Corinthians', 16, 'NT', '1cor', '1co', 'icorinthians', 'firstcorinthians'), B(47, '2CO', '2 Corinthians', 13, 'NT', '2cor', '2co', 'iicorinthians'),
  B(48, 'GAL', 'Galatians', 6, 'NT', 'gal', 'ga'), B(49, 'EPH', 'Ephesians', 6, 'NT', 'eph', 'ep'), B(50, 'PHP', 'Philippians', 4, 'NT', 'phil', 'php', 'phi', 'pp'),
  B(51, 'COL', 'Colossians', 4, 'NT', 'col', 'co'), B(52, '1TH', '1 Thessalonians', 5, 'NT', '1thess', '1thes', '1th', 'ithessalonians'),
  B(53, '2TH', '2 Thessalonians', 3, 'NT', '2thess', '2thes', '2th', 'iithessalonians'), B(54, '1TI', '1 Timothy', 6, 'NT', '1tim', '1ti', 'itimothy'),
  B(55, '2TI', '2 Timothy', 4, 'NT', '2tim', '2ti', 'iitimothy'), B(56, 'TIT', 'Titus', 3, 'NT', 'ti', 'tit'), B(57, 'PHM', 'Philemon', 1, 'NT', 'philem', 'phm', 'pm'),
  B(58, 'HEB', 'Hebrews', 13, 'NT', 'heb'), B(59, 'JAS', 'James', 5, 'NT', 'jas', 'jam', 'jm'), B(60, '1PE', '1 Peter', 5, 'NT', '1pet', '1pe', 'ipeter', 'firstpeter'),
  B(61, '2PE', '2 Peter', 3, 'NT', '2pet', '2pe', 'iipeter'), B(62, '1JN', '1 John', 5, 'NT', '1jn', '1jo', '1joh', '1john', 'ijohn'), B(63, '2JN', '2 John', 1, 'NT', '2jn', '2jo', '2joh', 'iijohn'),
  B(64, '3JN', '3 John', 1, 'NT', '3jn', '3jo', '3joh', 'iiijohn'), B(65, 'JUD', 'Jude', 1, 'NT', 'jud', 'jde'), B(66, 'REV', 'Revelation', 22, 'NT', 'rev', 're', 'revelations', 'apocalypse'),
];
const key = (s: string) => s.toLowerCase().replace(/[.\s]/g, '').replace(/^(first|1st)/, '1').replace(/^(second|2nd)/, '2').replace(/^(third|3rd)/, '3');
const INDEX = new Map<string, Book>();
for (const b of BOOKS) { for (const k of [b.code, b.name, ...b.aliases]) INDEX.set(key(k), b); }
// Names where the numberless form is ambiguous are only matched with their number; plain names win.
export function findBook(s: string): Book | undefined { return INDEX.get(key(s)); }
export const bookByCode = (code: string): Book | undefined => BOOKS.find((b) => b.code === code.toUpperCase());
export const totalChapters = (): number => BOOKS.reduce((n, b) => n + b.chapters, 0);
