# Rules for any AI coding tool working in this repository

This repo runs two live products (earshelf and Tapestry) on shared infrastructure. A careless change can break a live website, the database, or the server. Read this file, then `HANDOFF.md`, before changing anything. If a rule here conflicts with what you were asked to do, stop and ask the owner.

## Never do these
1. **Never edit, rename, reorder or delete an existing file in `supabase/migrations/`.** Those files may already have been run on the live database. Only add a new file. Earshelf changes use numbers `0006` to `0049`. Tapestry uses `0053` and up (`0050` to `0052` exist). Check the highest existing number first.
2. **Never push to `main`.** Work on a branch, open a pull request, let the checks pass, and wait for the owner to merge. Pushing to `main` redeploys both websites and the server.
3. **Never change the build contract:** root `netlify.toml`, `scripts/build-site.mjs`, the `build:site` script, the `site-dist` folder, or the `SITE_APP` setting. Two Netlify sites depend on them.
4. **Never change names or meanings of environment variables** listed in `.env.example`, `deploy/docker-compose.yml` or `services/api/src/config.ts`. You may add new optional ones, and you must say so.
5. **Never put a secret in code or in a file** (Supabase secret key, Lemon Squeezy secret, API keys, Coolify tokens). Browser code only ever sees `VITE_*` values. Do not ask the owner to paste secrets to you.
6. **Never loosen security:** Row Level Security, the `product` column on shared tables, `PRODUCT_TABLES` in `services/api/src/supa.ts`, or the rule that plans are granted only by the verified payment webhook.
7. **Never make one app import from the other.** Shared code goes in `packages/`. Apps may import packages. Packages never import apps.
8. **Never delete or weaken tests to make them pass.** If a test is wrong, say why and propose the change.
9. **Never rewrite Scripture text, invent references, or weaken the AI guardrails in Tapestry** (`packages/scripture/src/guard.ts`, `services/api/src/tapestry/ai.ts`). AI output must stay labelled and must never be presented as Scripture.
10. **Never add a dependency, model, voice, font or Bible translation without recording its license in `LICENSES.md`.** Ask first for anything not clearly permissive.
11. **Never change `deploy/docker-compose.yml` structure:** keep `build.context: .` (Coolify runs it from the repo root, and `..` breaks the build), keep the service names `api`, `kokoro`, `ollama`, `ollama-models`, and keep the `api` health check. Other services and settings depend on them.
12. **Never add anything that can grow without limit on a free plan.** Supabase Free allows a 500 MB database, 1 GB file storage and 5 GB egress a month and pauses after a week idle. Do not load more Bible translations, store audio, uploads, logs or embeddings in bulk, or add heavy indexes without the owner's approval and a size estimate. The owner wants to stay on free plans until there are paid users.
13. **Never add a new always-on service** to `deploy/docker-compose.yml`. The free Oracle server has 12 GB of memory and is already near its limit (api, kokoro, ollama, Coolify).

## Always do these
- Keep changes small and focused. One feature per branch. Do not "clean up", rename, reformat or restructure code you were not asked to touch.
- Before saying a task is done, run from the repo root and report the results: `npm install`, `npm test`, `npm run typecheck`, `npm run build` (earshelf) and `npm run build:tapestry`. All must pass. Do not skip steps you cannot run: say which ones you could not.
- Code in `packages/` and `services/api/` runs directly under Node's type stripping. Use plain TypeScript only: no `enum`, no `namespace`, no constructor parameter properties, and always import local files with the `.ts` extension.
- Keep loading, empty, error, retry and offline states on every screen you touch. Keep 44px touch targets, visible focus, labels for screen readers, and respect reduced motion.
- Every new database table needs: a new migration, Row Level Security, a `product` column if it is user data, and an entry in `PRODUCT_TABLES`. Say clearly that the owner must run the new file in the Supabase SQL Editor.
- Environment variable names are a contract: the website reads `VITE_*` (Netlify), the server reads the names in `services/api/src/config.ts` (Coolify), Supabase holds none. When you add one, update `config.ts` (or the app code), `.env.example` and the compose passthrough together, and tell the owner which place needs the new value.
- Update `HANDOFF.md` (status section) and `LICENSES.md` when you change what exists.
- Finish with a short report: files changed, tests run and results, anything the owner must do by hand (run SQL, set a setting), and anything you were unsure about.

## Stop and ask the owner before
Changing the database, deployment, or payment logic; adding a service or vendor; changing how login works; deleting data or files; anything that touches live settings in Supabase, Netlify, Coolify or Lemon Squeezy.
