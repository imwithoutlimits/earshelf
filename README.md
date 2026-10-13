# earshelf (Wells monorepo)

Personal document-to-audio library. Shared foundation for earshelf and, later, tapestry.

## Run it

```bash
npm install
cp .env.example .env.local      # only needed for Supabase / billing
npm run dev                     # http://localhost:5173
npm test                        # 21 unit tests: core, billing, player
npm run build                   # typecheck + production build
```

Use `VITE_DEV_PLAN=pro` in `apps/earshelf/.env.local` to try Plus and Pro features in dev. It is ignored in production builds.

## Building the second app

See `HANDOFF.md` for the shared-foundation map and the rules for keeping Earshelf and Tapestry from breaking each other.

## Go live

Follow `GUIDE.md`. It needs no terminal: GitHub, Netlify, Coolify (on a free Oracle Cloud server) and Supabase all build and run from the repository.

## What works

- Import: PDF, EPUB, DOCX, Markdown, TXT, HTML, pasted text, links (through the server), photos and scanned PDFs (OCR in the browser, Plus).
- Cleanup with a review step, five reading modes, ten voice styles, pronunciations. **A voice style can be set per well.**
- Reader with sentence highlighting, auto-follow, contents, search, bookmarks, highlights, notes.
- Player: device voices or natural server voices, +/-15/30 s, paragraph and section skip, replay, speed, sleep timer, media-session controls, offline audio downloads.
- Voices: Kokoro (runs beside the server in `deploy/docker-compose.yml`), ElevenLabs (with neighbouring-sentence context and retry), any OpenAI-style server, and Edge voices for the owner only.
- **Audiobook export (Pro):** one MP3 or M4B with a chapter per section, made on the server as a resumable job.
- **Search by meaning:** keyword plus vector search merged with rank fusion; documents are prepared in the background.
- **Explain a table or figure (Pro):** from the table's cells or the caption and nearby text, never from invented detail.
- **Review cards:** spaced repetition (SM-2 style, four buttons), saved from AI flashcards and quizzes, synced across devices.
- Supabase: sign-in, cross-device sync (the device keeps an offline cache), private storage, Row Level Security everywhere, real "delete all my content".
- AI (server): summaries in twelve forms, ask-this-document with checked citations, quizzes, flashcards.
- Billing: signed, idempotent Lemon Squeezy webhook, entitlements, plan gates, monthly usage limits.
- **Error reports:** optional Sentry or GlitchTip, with emails, tokens and keys removed and no document text.
- Tests: unit tests across core, billing, player and API (including real ffmpeg packaging), Playwright specs in `apps/earshelf/e2e`, CI on every push.

## Also built

Spoken equations (LaTeX), citation modes (skip, author and year, full), a second voice for quoted speech (Pro), highlights and notes export (Markdown, CSV, Readwise CSV), phone Share-menu import, a Chrome and Edge extension (`apps/extension`), accessibility fixes with automatic checks and a manual checklist (`ACCESSIBILITY.md`), and a license report in the automatic checks.

## Not built yet

Reading the picture inside a figure (needs a vision model and image extraction), email-to-library, structured PDF parsing with Docling or Marker, public sharing links for wells, private podcast feed, direct Notion and Readwise connections (the exports cover manual import), cloud-drive import, "explain simply" for equations, footnotes read at the end of a section, a second voice on device voices.

## Layout

```
apps/earshelf          React + Vite PWA (plain CSS on shared design tokens)
packages/core          document model, cleanup, structure, narration, chunk planning (pure, tested)
packages/audio-player  queue, sleep timer, engines, controller, provider interface
packages/billing       plans, gates, limits, webhook logic
packages/design-tokens CSS variables for earshelf and tapestry
services/api           one Node service on Coolify: voices, audio, AI, search, export, link import, payments
apps/extension        Chrome and Edge extension (load unpacked, no build)
deploy                 docker-compose for Coolify (server and Kokoro voices)
supabase               migrations 0001 to 0004 and seed
```
