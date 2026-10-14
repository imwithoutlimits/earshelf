import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const esbuild = createRequire('/home/claude/.npm-global/lib/node_modules/tsx/node_modules/')('esbuild');
const R = path.resolve(import.meta.dirname, '../../..'); const P = (p) => path.join(R, p);
const out = await esbuild.build({
  entryPoints: [P('apps/tapestry/preview/preview.tsx')], bundle: true, minify: true, format: 'iife', target: 'es2020', jsx: 'automatic', write: false, legalComments: 'none',
  nodePaths: ['/home/claude/.npm-global/lib/node_modules'], logLevel: 'warning',
  alias: { dexie: P('apps/tapestry/preview/dexie-shim.ts'), 'dexie-react-hooks': P('apps/tapestry/preview/hooks-shim.ts'), '@supabase/supabase-js': P('apps/tapestry/preview/supabase-stub.ts'), '@wells/scripture': P('packages/scripture/src/index.ts'), '@wells/activity': P('packages/activity/src/index.ts'), '@wells/auth': P('packages/auth/src/index.ts'), '@wells/offline': P('packages/offline/src/index.ts'), '@wells/ui': P('packages/ui/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.VITE_SUPABASE_URL': 'undefined', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': 'undefined', 'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined', 'import.meta.env.VITE_API_URL': 'undefined' },
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'); const css = fs.readFileSync(P('apps/tapestry/src/styles.css'), 'utf8');
const html = `<!doctype html><html lang="en" data-app="tapestry"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#160d13"><title>tapestry</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..800;1,6..72,400..800&family=Instrument+Sans:wght@400;500;600;700&display=swap"><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
fs.mkdirSync('/mnt/user-data/outputs', { recursive: true }); fs.writeFileSync('/mnt/user-data/outputs/tapestry-preview.html', html); console.log('built', (html.length / 1024).toFixed(0) + ' KB');
