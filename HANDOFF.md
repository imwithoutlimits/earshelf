# Handoff: earshelf + Tapestry on one foundation

This is the single current description of the project. If anything here disagrees with older notes, this file wins. Rules for AI tools are in `AGENTS.md` (read it first). The product requirements are in `earshelf_n_tapestry.pdf` (kept by the owner, not in the repo).

## 1. What this is
Two products from one repository:
- **earshelf**: turns documents into organised, listenable, searchable audio (`apps/earshelf`). Live.
- **Tapestry**: find, collect, listen to and reflect on Scripture (`apps/tapestry`). Built, now being tested.

They share one GitHub repo, one Supabase project (same logins), one server, and common code in `packages/`. They look different on purpose: earshelf is blue-teal, Tapestry is mulberry and gold.

## 2. Where things run, and what triggers a deploy
| Piece | Where | Triggered by |
|---|---|---|
| Websites | **Two Netlify sites** from this repo. Both use the root `netlify.toml`, Base directory empty, command `npm run build:site`, publish `site-dist`. The Tapestry site has the setting `SITE_APP=tapestry`; the earshelf site has none. | A push to the site's production branch (normally `main`), and deploy previews for pull requests |
| Server | `services/api` on a free **Oracle Cloud** machine (2 CPU, 12 GB) managed by **Coolify**, from `deploy/docker-compose.yml`: services `api`, `kokoro` (voices), `ollama` (optional free AI) | A push to the branch Coolify tracks (`main`) if the webhook is on, or the Redeploy button |
| Database, logins, files | **Supabase** (tables, Row Level Security, Auth, Storage buckets `originals` and `audio`) | SQL files in `supabase/migrations` are run **by hand** in the SQL Editor. Nothing runs them automatically. |
| Payments | Lemon Squeezy sends signed webhooks to the server | Webhook only. A "thank you" page never grants access. |
| Checks | GitHub Actions `.github/workflows/ci.yml`: `test` (unit tests, type check, earshelf build), `server-image` (builds the server for ARM), `licenses` | Every push and pull request |

**Consequence:** merging to `main` redeploys both websites and the server together. Always use a branch and a pull request, and read the Netlify deploy preview for each site before merging.

## 3. Folder map
- `apps/earshelf`, `apps/tapestry`: the two React/Vite web apps (PWAs). Plain CSS, no Tailwind or Radix. Dialogs use `Sheet` from `@wells/ui`.
- `packages/core`: earshelf document model, parsing, narration, search, exporters and other earshelf logic.
- `packages/audio-player`: queue, sleep timer, voice engines, controller, TTS provider interface (earshelf).
- `packages/billing`: plans, feature gates, usage limits, Lemon Squeezy webhook logic, per-product plan variants.
- `packages/auth`: Supabase client factory, API helper (`makeApi`), session hook, sign-in form. Both apps use it.
- `packages/offline`: sync engine pieces (change queue, status, paging changes down), settings helpers. Each app supplies its own tables.
- `packages/ui`: `Sheet`, `ErrorBoundary`.
- `packages/scripture`: Bible books, reference parser, query classifier, passage ids, verse-file parser, memorization, AI guardrails, the 16 starter wells (editorial draft).
- `packages/activity`: XP and daily cap, levels, the listening "thread" with a weekly rest day, weekly target, badges, weekly insight.
- `packages/design-tokens`: earshelf colour and font tokens. Tapestry's tokens live in `apps/tapestry/src/styles.css`.
- `services/api`: the Node server. Earshelf routes under `/v1/...`; Tapestry routes in `services/api/src/tapestry/` under `/v1/tapestry/...` (merged in `server.ts`). Product for plan checks is decided from that path prefix.
- `supabase/migrations`: SQL files `0001`-`0005` (shared and earshelf), `0050` (Tapestry content), `0051` (activity). Next free numbers: earshelf `0006`-`0049`, Tapestry `0052` and up.
- `scripts/build-site.mjs`: builds earshelf or Tapestry for Netlify (see section 2).
- `apps/tapestry/preview`: a demo bundle (in-memory stand-ins for the database) for showing the UI without servers. Not part of production.

## 4. Rules that keep both apps safe (invariants)
1. One repo, one Supabase project. Shared tables carry a `product` column (`'earshelf'` or `'tapestry'`). Entitlements are per product. Row Level Security: people see only their own rows. Never remove it.
2. Every new shared table needs a `product` column and an entry in `PRODUCT_TABLES` (`services/api/src/supa.ts`) so account deletion, sync and export only touch that app's rows. Earshelf can never delete or read Tapestry's data, and vice versa.
3. Migrations are append-only. Never edit one that exists.
4. Tapestry's activity tables (`xp_events`, `activity_days`, `listening_sessions`, `badge_awards`, `weekly_insights`) can only be written by the server (service role or the `record_activity` function). The phone reports what happened; the server decides points, caps the day and keeps the record.
5. Scripture tables (`translations`, `bible_*`, `curated_*`, `verse_topics`...) are public-read, server-write. A translation's text is readable only when `translations.enabled = true`, which is set only after its license is reviewed. WEB (`engwebp`, public domain) is the only one reviewed.
6. Scripture text is never generated or altered by AI. Tapestry AI only chooses and orders passages from a candidate list, writes reflection questions, and drafts well names; every output is validated (`guard.ts`) and labelled "Suggested by AI" or "AI-generated reflection prompt". If no AI is configured the app falls back to curated content.
7. Secrets: the website only has `VITE_*` values (publishable key). The server (Coolify) holds the secret key, Lemon Squeezy secret and API keys. Nothing secret in git.
8. Packages are configured by parameters, not by `import.meta.env`. Only `apps/*` read `import.meta.env`.
9. `services/api` imports packages by relative path (`../../../packages/...ts`) because the Docker image copies the folder tree. Packages import each other as `@wells/...`.
10. Server and package code runs under Node type stripping (Docker uses `--experimental-strip-types`; tests use `node --test`). Plain TypeScript only: no `enum`, `namespace`, parameter properties; import local files with `.ts`.
11. Plans change only through verified webhooks. The webhook reads `product` and `user_id` from the checkout's custom data and maps variants per product (`LS_VARIANT_EARSHELF_*`, `LS_VARIANT_TAPESTRY_*`).
12. Decisions already made, do not reverse without asking: plain CSS on tokens; Supabase is the source of truth with an IndexedDB offline copy and a change queue; new Supabase keys (publishable on the website, secret on the server in the `apikey` header only); voices through a provider interface and Edge voices owner-only; AI answers cite sources and say when not found; spaced repetition is SM-2 style.

## 5. Settings by place (names only; values are never in the repo)
- **Netlify, both sites:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`. Earshelf only also: `VITE_LS_CHECKOUT_PLUS`, `VITE_LS_CHECKOUT_PRO`, `VITE_LS_PORTAL_URL`, `VITE_SENTRY_DSN`. **Tapestry site only:** `SITE_APP=tapestry`.
- **Coolify (server):** see `.env.example` section 2. Important ones: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ALLOWED_ORIGINS` (both Netlify addresses, comma separated, no trailing slash), `LEMON_SQUEEZY_SIGNING_SECRET`, `LS_VARIANT_*`, `TAPESTRY_TRANSLATION_ID`, `TAPESTRY_ADMIN_USER_IDS`, `AI_PROVIDER`/`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`, `TTS_*`, `ELEVENLABS_*`, `EMBED_*`, `EDGE_TTS_*`, and for earshelf reminder notifications `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (see section 12).
- **Supabase:** Authentication, URL Configuration must list both site addresses as redirect URLs. Storage buckets and policies come from the migrations.
- **Shared AI setting:** there is one `AI_*` setting for the whole server, so changing it changes earshelf's summaries and quiz answers as well as Tapestry's.
- **Voices:** natural voices appear only when the API has an engine switched on: for Kokoro that means `TTS_KOKORO_HOSTPORT` (for example `kokoro:8880`) must be set on the API service and reachable from it. Ollama is used for AI summaries and search (`AI_*`, `EMBED_*`), not for speech. Natural voices are also a Plus feature (`natural_tts` in `packages/billing/src/plans.ts`), so a free account will not be able to use them. earshelf generates server audio through the provider interface (Kokoro container, ElevenLabs, an OpenAI-compatible endpoint via `TTS_OPENAI_*`, Edge voices owner-only). Tapestry currently uses the browser's built-in voice only. Connecting Tapestry to server voices must go through the same provider interface and the existing `/v1/...` audio routes, not a new vendor.

## 6. How to change things safely
1. Create a branch. Make one small change. Run `npm install`, `npm test`, `npm run typecheck`, `npm run build`, `npm run build:tapestry`.
2. Push the branch. Open a pull request. Wait for GitHub's `test`, `server-image` and `licenses` checks (green) and for Netlify's two deploy previews.
3. Open each Netlify preview and look at it (earshelf must still load; Tapestry must still show Tapestry).
4. The owner merges. Watch both Netlify deploys and the Coolify deployment finish healthy, then run the manual checks in `GUIDE.md`.
5. If something breaks: Netlify, Deploys, publish the last green deploy. Coolify, Deployments, redeploy the last good one. GitHub, revert the pull request. Database changes are additive and are not undone.

Recipes:
- **New earshelf or Tapestry screen:** add under that app's `src/views`, keep states (loading, empty, error, retry, offline), reuse `Sheet`, follow the app's tokens. Do not touch the other app.
- **New database table:** new migration file, RLS, `product` column, `PRODUCT_TABLES`, tell the owner to run the file. Never edit old ones.
- **New server route:** earshelf routes in `server.ts`; Tapestry routes in `services/api/src/tapestry/routes.ts`. Add a unit test. Check the plan with `getPlan(userId, product)`.
- **Changing UI look:** change tokens, not hard-coded colours. See section 7.
- **New dependency:** add it to the package that needs it, record the license, and check the `licenses` job.

## 7. Design systems
**Tapestry** (`apps/tapestry/src/styles.css`): calm, reflective, uncluttered. Three themes by `data-theme` on `<html>`: `dark` (default), `light`, `field` (mulberry colour field). Colours are CSS variables `--bg --surf --ink --mut --line --acc --fg --tx --dot --today --vw`. One gold accent for the primary action. Fonts: Newsreader (`--s`, verses and headings) and Instrument Sans (`--f`, interface). Motifs: thin hairlines, a constellation of stars for a well, a weekly "weave", pills, no stacked cards. Sentence case. 44px targets. AI content always labelled. Calm gamification: no confetti, no red warnings, no guilt wording; one rest day a week keeps the thread. Scripture is shown as stored, never rewritten.
**earshelf** (`packages/design-tokens/tokens.css`, `apps/earshelf/src/styles.css`, `apps/earshelf/src/look.css`): three looks chosen in Profile, kept per person and synced: **Light** (cream and ink, red accent, serif), **Dark** (black, yellow accent, Barlow Condensed headings), **Blue** (cobalt and cream, Outfit). Colours are tokens in `tokens.css`; `App.tsx` sets `data-theme` (the choice, absent for "match my device") and `data-look` (what is on screen) on `<html>`. The library can be shown as a shelf, grid or list (small switch at the top of the shelf; setting `homeLayout`). Do not use earshelf colours in Tapestry or the reverse.

## 8. Status
**Done and unit tested (`npm test`, 120 tests):** shared packages; earshelf using them; per-product billing and entitlements; Scripture and activity logic; Tapestry server routes (recommend, reflect, well-draft, search, activity, target, owner setup); migrations `0050`, `0051`; Tapestry app (Home, Wells, Activity, Search, Passage, Memorize, Player, Profile); GitHub checks green on the `tapestry` branch.
**Built but only partly verified:** The earshelf facelift branch (three looks, shelf/grid/list library, reader with player dock, Activity tab, search icon on the library screen) was checked in a headless browser: the earshelf Playwright specs were run locally in a headless browser (19 passed, 3 failed). The 3 failures also fail on the original code before this branch and were left alone: the accessibility scan of the Wells screen on the original colours, `create a well` (its `.check()` on a checkbox that is saved to IndexedDB first), and `library still opens offline`. The `skip link` spec is intermittent on both the original and this branch (it presses Tab before the page has necessarily rendered). The new `looks.spec.ts` (tabs, search icon, shelf/grid/list, three looks, Activity, and accessibility scans of Library, Activity, Profile and the reader in light, dark and blue) passes. Cross-device listening time (see section 11) has unit tests for its rules and the server check, but has **not** been tried against live Supabase or a deployed API by a person. Tapestry has been exercised in a headless browser with stand-ins and type-checked in CI, but not tested against live Supabase and the live server by a person. Earshelf's refactor onto the shared packages passes CI but has not been used in a browser since. Earshelf's Playwright specs (`apps/earshelf/e2e`, run with `npm run test:e2e -w @wells/earshelf`) are not run by CI.
**Not built yet:** syncing Tapestry wells, notes and bookmarks across devices (only activity syncs); Tapestry upgrade/payment screen; Kokoro server voice for Scripture; reminders and scheduled listening (table exists, no sender); translation comparison; guided paths content; sharing; Tapestry browser tests; per-app AI settings.
**Needs a human:** read the 16 starter wells (`packages/scripture/src/starter.ts`, marked `draft`); run the owner setup in Tapestry's Profile and read its report.

## 9. Known traps
- Uploading to `main` redeploys everything. Use branches.
- `apps/tapestry/netlify.toml` is an unused alternative (only read if Netlify's Base directory is set to `apps/tapestry`). Leave it; do not delete or "fix" the root `netlify.toml`.
- Type check in CI covers `packages`, `services`, earshelf and Tapestry. React and Dexie types are real in CI; a local environment without them will show false errors.
- `import.meta.env` values are baked in at build time. Changing a Netlify variable needs a new deploy.
- Test count and numbers in older documents are out of date. Trust `npm test`.

- `deploy/docker-compose.yml` uses `context: .` (not `..`) on purpose: Coolify runs compose from the repo root, so a `..` context points outside the repo and the server build fails with "lstat /artifacts/services: no such file". Do not change it back.

## 10. Starting prompt for an AI tool
> Read `AGENTS.md` and `HANDOFF.md` in full before doing anything. This repository runs two live products. Work only on a new branch, never on `main`. Keep every change small and limited to what I ask. Do not touch migrations that already exist, the Netlify build files, environment variable names, or tests. Before you say you are done, run the commands in section 6 and report the results, the files you changed, and anything I must do by hand. If anything in my request would conflict with these rules, stop and ask me first. My request is: [paste your request here].

## 11. Earshelf facelift branch: what changed and what to do by hand
**What changed.** Tabs are Library, Wells, Activity, You (Search is now an icon at the top right of Library). Three looks. Library as shelf, grid or list. Reader with chapter label, ⋮ menu and a player dock (-15s, +30s, speed, bookmark, full player). Activity shows the listening streak, this week and a weekly goal, then Recently played and Saved passages as before. Documents get generated covers.

**A bug that was already in the repo, fixed.** In `packages/audio-player/src/controller.ts`, `set()` passed the previous snapshot into `build()`, whose trailing `...p` overwrote the fresh document, place and length with stale values, so the player never showed. The fix is a few lines and has a regression test (`controller.test.ts`) that fails on the old code.

**Listening time across devices, with no database change.** The app counts time on the device (works offline and signed out) and, when signed in, sends what the server has not seen to a new route `POST /v1/earshelf/activity` (`services/api/src/earshelf/activity.ts`, registered by two lines in `server.ts`). That calls the existing `record_activity` function with `product = 'earshelf'` and awards no points. The app reads its own `activity_days` rows (product `earshelf`) back for the Activity screen. The weekly goal syncs with the other preferences. Tapestry's route, tables and packages are untouched.

**Do by hand.**
1. Create a branch, copy the files in, run the commands in section 6.
2. Redeploy the API (Coolify). Until it is redeployed, the app still works and counts time on each device; it just cannot share the time between devices.
3. Run `npm run test:e2e -w @wells/earshelf` locally (not run by CI). Two existing specs reached Search through the old tab; only that navigation step changed (they now press the Search icon, and Profile is now You).
4. Check the two Netlify previews as in section 6, and look at all three looks on a phone.

**Known limits.** Time listened is the time the player was playing on that device, counted per local day. A day counts toward the streak after one minute and one rest day a week is forgiven (the shared rules in `@wells/activity`). A device offline for more than 30 days cannot report older days. Streaks do not yet award points or badges in earshelf.

## 12. Earshelf second round: playback, reminders, import choices
**Resume and Now playing.** The Resume button now loads the book and starts it straight away and opens the full player ("Now playing"), without opening the reader (`ResumeLoader.tsx`, `player.prime()` runs inside the tap so browsers allow sound to start). The same path is used when a reminder notification is tapped (`/?continue=<book id>`).

**Moving waveform.** `LiveWave.tsx` draws one bar per spoken word and scrolls them past a fixed playhead, so it moves with every word rather than once per sentence. Position comes from `player.getPosition()` (word boundaries for device voices, the audio clock for natural voices). The small swell around the playhead follows the speech rhythm. It is a picture of the speech, not the real audio signal: a browser does not let a page read the audio of a device voice.

**Lock screen and background playback.** Two parts. (1) The Media Session now sends artwork, a position/seek bar and seek handlers. (2) The keep-alive sound the original code used was exact silence at 1% volume, which Chrome treats as not playing, so the page was not kept alive and no media notification appeared. It is now ten seconds of a 25 Hz hum at about -50 dB, which counts as audible but cannot be heard on a phone. **This has not been tested on a real phone**; it was written to the specifications and checked in a desktop browser only. Device voices (the browser's built-in speech) can still pause when the screen locks on some phones, because the browser owns them. Natural voices are real audio files played through an audio element, which is the reliable way to keep playing on a lock screen.

**Reminder notifications.** Uses Web Push, with the encryption and VAPID signing written with Node's built-in crypto (`services/api/src/earshelf/webpush.ts`, tested byte for byte against the RFC 8291 example), so there is no new dependency. (The usual `web-push` library is MPL-2.0, which AGENTS.md says to ask about first.) Subscriptions and a short "sent today" log are stored in the existing shared `notifications` table (`kind` = `push_subscription` or `push_sent`, `product` = `earshelf`), so there is **no database change**. The planner (`packages/core/src/notify.ts`) allows at most 3 a day, none at night (21:30 to 07:00 local), none once the person has listened today, a morning daily read, a midday continue, an evening streak reminder only when a streak of 2 or more is at risk, fewer after 3 and 7 days away, and none after 14. The server checks every ten minutes while it is running; **run one API instance only**, or each instance will send.
To turn on: generate keys once with `node -e "const c=require('crypto');const e=c.createECDH('prime256v1');e.generateKeys();console.log('VAPID_PUBLIC_KEY='+e.getPublicKey('base64url'));console.log('VAPID_PRIVATE_KEY='+e.getPrivateKey('base64url'))"`, set both in Coolify together with `VAPID_SUBJECT=mailto:you@yourdomain` (a real address you read), and redeploy the API. Keep the private key secret and never change the pair once people have turned reminders on (they would need to turn them off and on again). On iPhone, web push only works after the app is added to the Home Screen.

**Import choices.** Every item in the "We found" list can now be ticked whether or not it was detected (before, anything with zero found was greyed out). New things to skip: tables, figure captions, web and email addresses, table of contents, code blocks, emoji. A collapsed list lets whole chapters or sections be skipped (for example acknowledgements, index, appendix), with a button that ticks likely back matter. The same list is in the reader's Reading settings. Titles such as "Unknown", "Untitled", "Microsoft Word - ..." or a phone's file number are no longer used; the first heading is used instead, and the title and author can be typed on import and edited later from the document's options (the "..." button).

**Library count.** The shelf now lists every document. Before, the book shown in the Resume card was left off the shelf, so a library of 5 showed 4 and the free limit of 5 looked wrong. The count now reads "5 of 5" on the free plan.

**Tabs.** The Wells tab uses the same water-drop icon as Tapestry (`components/WellsIcon.tsx`, copied from Tapestry's `ui.tsx`; Tapestry itself is untouched).

**Test on a real phone before merging.** (1) Resume starts audio and opens Now playing. (2) With a natural voice: lock the screen, audio continues, and the lock screen and notification shade show title, artwork, play/pause, skip and a seek bar. (3) With a device voice: lock the screen and note whether it continues. (4) Turn reminders on in You, send a test, tap it with the app closed and open. (5) The dark reader's waveform scrolls word by word.

