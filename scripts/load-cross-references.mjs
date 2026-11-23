// Loads the OpenBible.info cross-references (CC BY 4.0) into Supabase for Tapestry Pro.
// Run it from GitHub: Actions tab, "Load cross-references", Run workflow. Safe to run again.
// It needs the repository secrets SUPABASE_URL and SUPABASE_SECRET_KEY, and migration 0053 must have been run first.
// DRY_RUN=1 downloads and checks the file and prints what it would load, without writing anything.
import { unzipSync, strFromU8 } from 'fflate';
import { CROSSREF_ZIP_URL, looksRight, parseCrossRefFile } from '../packages/scripture/src/index.ts';

const url = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), key = process.env.SUPABASE_SECRET_KEY || '';
const dry = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const minVotes = Number(process.env.MIN_VOTES || 5);
if (!dry && (!url || !key)) { console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Add them in GitHub: Settings, Secrets and variables, Actions.'); process.exit(1); }

console.log(`Downloading ${CROSSREF_ZIP_URL} ...`);
const res = await fetch(CROSSREF_ZIP_URL);
if (!res.ok) { console.error(`Download failed (${res.status}).`); process.exit(1); }
const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
const name = Object.keys(files).find((n) => /cross-references\.txt$/i.test(n)) ?? Object.keys(files).find((n) => n.endsWith('.txt'));
if (!name) { console.error(`No text file found in the zip. It contains: ${Object.keys(files).join(', ')}`); process.exit(1); }

const parsed = parseCrossRefFile(strFromU8(files[name]), { minVotes });
console.log(`Read ${parsed.dataLines} lines from ${name}. Understood ${parsed.dataLines - parsed.skipped}, skipped ${parsed.skipped}. Keeping ${parsed.rows.length} pairs with at least ${minVotes} votes.`);
if (!looksRight(parsed)) { console.error('The file does not look like what was expected (too small, or too many lines not understood). Nothing was loaded.'); process.exit(1); }
if (dry) { console.log('Dry run: nothing was written. Sample:', JSON.stringify(parsed.rows.slice(0, 3))); process.exit(0); }

let done = 0;
for (let i = 0; i < parsed.rows.length; i += 1000) {
  const batch = parsed.rows.slice(i, i + 1000).map((r) => ({ from_ref: r.from, to_ref: r.to, votes: r.votes }));
  const r = await fetch(`${url}/rest/v1/cross_references?on_conflict=from_ref,to_ref`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) });
  if (!r.ok) { console.error(`Saving failed at row ${i} (${r.status}): ${(await r.text()).slice(0, 300)}. Did you run migration 0053?`); process.exit(1); }
  done += batch.length;
  if (done % 10000 === 0 || done === parsed.rows.length) console.log(`Loaded ${done} of ${parsed.rows.length}`);
}
console.log('Done. Cross-references are ready.');
