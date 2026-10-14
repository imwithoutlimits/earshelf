# Handoff: the shared foundation, for whoever builds Tapestry next

## 0. Status after the Tapestry build (read this first)

**Done and unit tested (106 tests, run with `npm test`):** shared packages `@wells/auth`, `@wells/offline`, `@wells/ui` extracted from earshelf (earshelf now imports them); `@wells/scripture` (66-book canon, reference parser, query classifier, passage uuids, WEB verse-per-line parser, memorization, AI guardrails, the 16 starter wells, starter validation); `@wells/activity` (XP and daily cap, levels, listening thread with one rest day a week and time zones, weekly target, badges, weekly insight); per-product billing variants and plans; server routes under `/v1/tapestry/*` (recommend, reflect, well-draft, search, activity, target, admin setup); migrations `0050` (Scripture, topics, curated wells, search function) and `0051` (XP, activity, listening sessions, targets, badges, insights, push subscriptions, `profiles.timezone`).

**Built but not yet run for real:** `apps/tapestry` (React/Vite/Dexie PWA). Its code was bundled with esbuild and exercised in a headless browser with an in-memory stand-in for Dexie (no script errors; Home, Wells, Activity, Search and Player rendered and checked). It has **not** been type-checked (no React types offline), built with Vite, or run against live Supabase or the API. Earshelf's refactor to the shared packages was only syntax-checked. Run `npm run typecheck` and fix whatever it reports before anything else.

**Not built yet:** syncing wells, notes and bookmarks to Supabase from Tapestry (the activity queue does sync; wells and notes are on-device until sync adapters are written with `@wells/offline`); server voice (Kokoro) for Scripture, so audio uses the browser voice; push reminders and scheduled listening (table exists, no sender); translation comparison; guided paths content; sharing; Playwright specs for Tapestry; Sentry wiring in Tapestry; PWA icon PNGs (only the SVG exists); per-theme manifest colour.

**Needs a human:** the starter wells are an editorial draft (`status: draft`). Read each list before launch. Check the first import report in Profile, Owner setup (it lists any starter passage the imported text does not contain).

**Stale text in the sections below:** Render is gone; hosting is Oracle Cloud + Coolify (see GUIDE.md Part 4 and Part 13).


Read this first in a new chat. It replaces the conversation history: everything a new chat needs to know about what exists is here or in the repository. Product requirements are in `earshelf_n_tapestry.pdf` (the PRD).

## 1. Ground rules for two apps on one foundation
1. **One repository** (this monorepo). **One Supabase project.** One login works for both apps because both use the same Supabase Auth users.
2. Rows are separated by a `product` column (`'earshelf'` or `'tapestry'`), and entitlements are per product. Row Level Security is unchanged: people only ever see their own rows.
3. **Never edit a migration that has already been run.** Only add new files. Numbering: Earshelf fixes use `0005` to `0049`. Tapestry uses `0050` and up. This prevents two chats from creating the same number.
4. Before changing anything in `packages/`, run `npm test` (69 tests at the time of writing). Never leave the tests red.
5. Tapestry work happens in `apps/tapestry`. Earshelf work stays in `apps/earshelf`. Shared code goes in `packages/`. Neither app imports from the other. Tapestry files in storage live under `<user id>/tapestry/`.

## 2. What exists today

**Shared and ready (in `packages/`)**
- `core`: document model and parsing (Earshelf-specific), plus generic parts: `srs.ts` (spaced repetition), `monitor.ts` (error reporter), `chunks.ts` (audio chunk planning and cache keys), `narration.ts` (reading modes and overrides), `math.ts` (equations to words), `dialogue.ts`, `exporters.ts` (Markdown and CSV), `share.ts`, `wellVoice.ts`.
- `audio-player`: queue, sleep timer, device-voice and server-audio engines, controller, TTS provider interface.
- `billing`: plans, feature gates, monthly usage limits, signed and idempotent Lemon Squeezy webhook logic. Already accepts `product: 'tapestry'` in checkout data.
- `design-tokens`: colors and fonts, including the `data-app="tapestry"` theme.

**Database (`supabase/migrations`)**
- `0001` shared tables, all with Row Level Security: profiles, preferences, subscriptions, entitlements, usage, wells, well_items, playlists, audio, playback progress, bookmarks, highlights, notes, downloads, search queries, recommendations, notifications, jobs, AI generations, feature flags, billing events. Most carry a `product` column.
- `0002` Earshelf documents, plus the private `originals` and `audio` storage buckets.
- `0003` sync support (soft deletes, storage policies, atomic usage counter `consume_usage`).
- `0004` meaning search (`hybrid_search`), `review_cards`, export job states.
- **Tapestry tables do not exist yet:** translations, bible_books, bible_chapters, bible_verses, scripture_topics, verse_topics, guided_paths, guided_path_items, reflection_prompts. `review_cards` has no `product` column, so add one or treat it as shared.
- Nothing exists in the real Supabase project until its SQL files are run (`GUIDE.md`, Part 2).

**Server (`services/api`, one Node service on Coolify (Oracle Cloud), `deploy/docker-compose.yml`)**
Routes for voices and audio, AI, search, export, link import, account deletion, and the payment webhook. **It runs on a free Oracle Cloud server managed by Coolify** (`deploy/docker-compose.yml`, with the Kokoro voice engine beside it). Render is no longer used. Engines: Kokoro, ElevenLabs, OpenAI-style, Edge (owner only).

## 3. What is Earshelf-only today and must be extracted before Tapestry can reuse it
Do this as the **first job of the Tapestry build**, one package at a time, running the tests after each step. Do not start until Earshelf is deployed and working.

| Now in | Move to | Notes |
|---|---|---|
| `apps/earshelf/src/supabase.ts`, `auth.tsx` | `packages/auth` | Client, session context, sign-in screen, API helper. |
| `apps/earshelf/src/db.ts`, `sync.ts` | `packages/offline` | Make the table list configurable per app. Keep the automatic change capture (hooks and outbox). |
| `hooks.ts` (player singleton, `useSetting`, `usePlan`) | `packages/offline` and `packages/audio-player` | `usePlan` must take a product. |
| `components/Sheet.tsx`, `PlayerBar.tsx`, `NaturalVoice.tsx`, `ErrorBoundary.tsx`, `serverVoice.ts`, `monitor.ts` | `packages/ui` | Keep plain CSS on the shared tokens. |
| `views/Review.tsx` | `packages/ui` | Generic, Tapestry can use it for memorization. |
| Server: `entitlements.ts`, `tts/generate.ts`, `exportJob.ts`, `server.ts` | make `product` a parameter | The string `'earshelf'` is hard-coded in these places. `consume_usage` calls need the product too. |
| `LS_VARIANT_EARSHELF_PLUS/PRO` | per-product variant settings | Add Tapestry variants. |
| `netlify.toml` at the root | one per app | Give each Netlify site its own base directory (`apps/earshelf`, `apps/tapestry`). Change this carefully so the live Earshelf site does not break. |

## 4. Decisions already made (do not reverse without asking)
- Plain CSS on shared design tokens. No Tailwind or Radix. Dialogs use the accessible `Sheet` component.
- Supabase is the source of truth. Each device keeps an offline copy in IndexedDB, with a change queue that syncs automatically.
- New Supabase keys: publishable key on the website, secret key on the server only. Secret keys go in the `apikey` header only.
- Voices come through a provider interface. Edge voices are owner-only and never offered to customers.
- Plans are granted only by the verified payment webhook, never by the "thank you" page.
- AI answers must cite their source and say when something is not found. Tapestry's AI must follow the PRD boundaries (no doctrine, no invented references, no rewriting Scripture, visible AI labels).
- Spaced repetition is an SM-2 style scheduler with four buttons.

## 5. Tapestry build order (from the PRD)
1. Deploy and stabilise Earshelf. 2. Extract the shared packages (section 3). 3. Add the Tapestry tables in `0050+`, including translation license fields (name, abbreviation, copyright notice, license name and link, source link). 4. Import one clearly licensed translation. 5. Reference parser, exact and phrase search, topic search, and meaning search (reuse `hybrid_search`, generalised beyond documents). 6. Starter wells and paths. 7. Audio through the existing engines. 8. Memorization mode (reuse the review screen). 9. AI recommendations and reflection prompts with visible labels. 10. Billing entitlements for `tapestry`. Let people explore sample passages without an account, as the PRD requires.

## 6. Verification status
Logic and server are unit tested (69 tests, including real ffmpeg packaging) and the server was smoke tested. The Oracle and Coolify setup follows the official docs but was not run end to end here. The website has **never been built or run against live services**, because the build environment had no network. Expect small fixes on the first deploy. The Playwright specs are written but have not been run.

## 6b. Where things run
Netlify serves the website. A free Oracle Cloud machine runs the server through Coolify (`GUIDE.md`, Part 4). Supabase holds the data and files. Lemon Squeezy sends payment messages to the server. Another app built on this foundation reuses the same server, adding its own routes.

## 6c. Hosting and how Tapestry plugs in (Oracle Cloud + Coolify)

**One server serves both apps.** The earshelf server (`services/api`) runs on one free Oracle machine through Coolify. Tapestry does not get its own machine: it adds its own routes to the same server and reuses what is already there (voices, AI, search, export jobs, the payment webhook, account deletion). The free machine is small (2 CPUs, 12 GB), and Tapestry's text is tiny, so there is room.

| Piece | Earshelf | Tapestry |
|---|---|---|
| Website | Netlify site 1, base directory `apps/earshelf` | **Netlify site 2**, base directory `apps/tapestry`. Move the root `netlify.toml` into each app folder when the second site is created. |
| Server | `/v1/...` routes | Same server and same address. Add routes under a Tapestry prefix, for example `/v1/tapestry/...`. |
| Database | `product = 'earshelf'` | `product = 'tapestry'`, same Supabase project and same logins |
| Payments | one webhook address | **Same webhook address.** It reads `product` from the checkout data. |
| Files | `<user id>/<document id>/...` | **`<user id>/tapestry/...`** in the same buckets. Earshelf's delete-all skips this folder. |

**What must be added for Tapestry (small, but required):**
1. **Per-product plan variants.** `LS_VARIANT_EARSHELF_PLUS/PRO` map a Lemon Squeezy variant to a plan. Tapestry has different variants, so `decide()` in `packages/billing` and the server settings need a map per product, or Tapestry purchases will look like "free".
2. **`product` as a parameter** on the server where `'earshelf'` is written: `entitlements.ts` (`getPlan`, `consume`), the `consume_usage` calls, `tts/generate.ts`, `exportJob.ts`, `ai` logging.
3. **Allowed websites.** In Coolify, `ALLOWED_ORIGINS` takes several addresses separated by commas. Add Tapestry's Netlify address. In Supabase, Authentication, URL Configuration, add Tapestry's address to the redirect list.
4. **A Tapestry settings file** for the Coolify environment (new variables are added in Coolify, not in code).
5. **Account deletion for Tapestry:** `deleteUserContent(userId, 'tapestry')` already exists. Add its Tapestry-only tables to `APP_ONLY_TABLES` in `services/api/src/supa.ts` when they exist.

**Already protected (do not undo):** deleting content, syncing rows and cleaning files are all scoped to one app, so Earshelf can never remove or download Tapestry's data (migration `0005`, `deletionPlan` in `supa.ts`, product filters in `sync.ts`). Every new shared table needs a `product` column and must be added to `PRODUCT_TABLES`.

**Deploying safely.** One server means a change made for Tapestry also redeploys Earshelf's server. Coolify keeps the old version running until the new one reports healthy, and the automatic checks run on every push. Do Tapestry work on a branch such as `tapestry`, merge to `main` only when the checks are green, and point Coolify at `main`.

## 7. Starting the Tapestry chat
Upload: the latest `earshelf-monorepo.zip`, `earshelf_n_tapestry.pdf`, and this file. Then paste:

> We are building Tapestry, the second app on a shared foundation. Read HANDOFF.md first. Earshelf is already built and deployed from the same repository and the same Supabase project. Do not change Earshelf behaviour. Start with section 3 (extract the shared packages, tests green after every step), then follow section 5. Use migration numbers 0050 and up. The server is no longer on Render: it runs on Oracle Cloud through Coolify, so read section 6c before touching deployment. Keep updates short and give me the done / left / next breakdown before you run out of room. I do not want to run npm commands, so give me detailed click-by-click steps for anything manual.
