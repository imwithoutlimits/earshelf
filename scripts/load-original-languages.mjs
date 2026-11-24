// Loads the Hebrew and Greek word data (STEPBible-Data, CC BY 4.0, by STEPBible.org / Tyndale House Cambridge) into Supabase for Tapestry Pro.
// Run it from GitHub: Actions tab, "Load Hebrew and Greek", Run workflow. Run it with DRY RUN ticked first: it downloads and checks the
// files and prints how much database space they will take, and saves nothing. Then run it again with dry run unticked.
// The files are downloaded straight from STEPBible's own repository and are not copied into this one.
// Needs the repository secrets SUPABASE_URL and SUPABASE_SECRET_KEY and migration 0054. Safe to run again.
import { STEP_CREDIT, STEP_DIR_API, approxBytes, groupByVerse, looksRightOriginal, parseStepFile } from '../packages/scripture/src/index.ts';

const url = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), key = process.env.SUPABASE_SECRET_KEY || '';
const dry = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const wanted = (process.env.LANGS || 'he,gr').split(',').map((s) => s.trim()).filter(Boolean);
if (!dry && (!url || !key)) { console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Add them in GitHub: Settings, Secrets and variables, Actions.'); process.exit(1); }

const gh = { 'User-Agent': 'earshelf-loader', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
console.log('Listing the data files in STEPBible-Data ...');
const listing = await fetch(STEP_DIR_API, { headers: gh });
if (!listing.ok) { console.error(`Could not list the files (${listing.status}). STEPBible may have moved them; send me this log.`); process.exit(1); }
const files = (await listing.json()).filter((f) => f.type === 'file' && /\.txt$/i.test(f.name));
console.log(`Found ${files.length} text files: ${files.map((f) => f.name).join(' | ')}`);

const SOURCES = { he: files.filter((f) => /^TAHOT/i.test(f.name)), gr: files.filter((f) => /^TAGNT/i.test(f.name)) };
let loadedAny = false, failedAny = false;
for (const lang of wanted) {
  const list = SOURCES[lang] ?? [];
  const label = lang === 'he' ? 'Hebrew Old Testament' : 'Greek New Testament';
  if (!list.length) { console.error(`${label}: no matching files found.`); failedAny = true; continue; }
  let rows = [];
  for (const f of list) {
    const res = await fetch(f.download_url);
    if (!res.ok) { console.error(`Could not download ${f.name} (${res.status}).`); failedAny = true; continue; }
    const text = await res.text();
    const parsed = parseStepFile(text, lang);
    console.log(`${label}: ${f.name}: ${(text.length / 1048576).toFixed(1)} MB, ${parsed.length} words read.`);
    if (parsed.length === 0) { console.log('  No words were understood. First lines of the file, to help fix the reader:'); text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 14).forEach((l) => console.log('  | ' + l.slice(0, 220).replace(/\t/g, ' ⇥ '))); }
    rows = rows.concat(parsed);
  }
  const verses = groupByVerse(rows, lang);
  const mb = approxBytes(verses) / 1048576;
  console.log(`${label}: ${rows.length} words in ${verses.length} verses. About ${mb.toFixed(1)} MB of data (the database may use up to about ${(mb * 1.5).toFixed(0)} MB with its own overhead).`);
  if (verses.length) console.log('  Sample:', JSON.stringify(verses[0]));
  if (!looksRightOriginal(verses, lang)) { console.error(`${label}: this does not look like the whole Bible text (too small, or too many words are missing). NOTHING was loaded for it. Send me this log.`); failedAny = true; continue; }
  if (dry) { console.log(`${label}: dry run, nothing written.`); continue; }
  for (let i = 0; i < verses.length; i += 150) {
    const batch = verses.slice(i, i + 150).map((v) => ({ ref: v.ref, lang: v.lang, words: v.words }));
    const r = await fetch(`${url}/rest/v1/original_verses?on_conflict=ref`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) });
    if (!r.ok) { console.error(`Saving failed at verse ${i} (${r.status}): ${(await r.text()).slice(0, 300)}. Did you run migration 0054?`); process.exit(1); }
    if ((i / 150) % 40 === 0) console.log(`  ${label}: saved ${Math.min(i + 150, verses.length)} of ${verses.length} verses`);
  }
  console.log(`${label}: done.`);
  loadedAny = true;
}
console.log(`Credit shown in the app: ${STEP_CREDIT}`);
if (!dry && !loadedAny) process.exit(1);
if (dry && failedAny) process.exit(1);
