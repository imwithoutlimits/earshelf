// Loads Tapestry's Scripture translations and the 16 starter wells into Supabase.
// Safe to run again. Run it from GitHub: Actions tab, "Load Tapestry content", Run workflow.
// It needs three repository secrets: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY.
import { importTranslation, seedStarter } from '../services/api/src/tapestry/setup.ts';
import { DEFAULT_TRANSLATION } from '../packages/scripture/src/index.ts';

for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[k]) { console.error(`Missing ${k}. Add it in GitHub: Settings, Secrets and variables, Actions, New repository secret.`); process.exit(1); }
}
const wanted = (process.env.TRANSLATIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
// Only the default translation unless asked: every extra translation uses database space, and the free plan allows 500 MB.
const ids = wanted.length ? wanted : [DEFAULT_TRANSLATION];

console.log('Starter wells loaded:', JSON.stringify(await seedStarter()));
let failed = 0;
for (const id of ids) {
  try {
    const r = await importTranslation(id, true);
    console.log(`Loaded ${id}: ${r.verses} verses, enabled=${r.enabled}.`);
    if (r.starterProblems.length) { console.log(`  ${r.starterProblems.length} starter passages differ in this translation:`); for (const p of r.starterProblems.slice(0, 12)) console.log('   -', p); }
    else console.log('  Every starter passage exists in this translation.');
  } catch (e) { failed++; console.error(`FAILED ${id}: ${e instanceof Error ? e.message : e}`); }
}
console.log(failed ? `Done with ${failed} problem(s). The others loaded.` : 'Done.');
process.exit(failed ? 1 : 0);
