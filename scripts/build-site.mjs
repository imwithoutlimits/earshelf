// One build entry point for both websites. Netlify runs this; you never run it yourself.
// Which app is built is decided by one Netlify setting: SITE_APP=tapestry (anything else builds earshelf).
// The finished site is always copied to site-dist, so both Netlify sites use the same publish folder.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';

const app = process.env.SITE_APP === 'tapestry' ? 'tapestry' : 'earshelf';
console.log(`Building ${app} (SITE_APP=${process.env.SITE_APP ?? 'not set'})`);
execSync(`npm run build -w @wells/${app}`, { stdio: 'inherit' });
const from = `apps/${app}/dist`;
if (!existsSync(from)) { console.error(`Build finished but ${from} does not exist.`); process.exit(1); }
rmSync('site-dist', { recursive: true, force: true });
cpSync(from, 'site-dist', { recursive: true });
console.log(`Ready: ${from} copied to site-dist`);
