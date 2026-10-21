# Licenses

Status of every entry is **not yet reviewed**. Licenses below are what each project states as far as I know; confirm against the version you install before shipping a paid product. Pin exact versions and source URLs here when you do.

| Component | Stated license | Notes |
|---|---|---|
| React, React DOM | MIT | |
| Vite, @vitejs/plugin-react | MIT | |
| vite-plugin-pwa, Workbox | MIT | |
| Dexie, dexie-react-hooks | Apache-2.0 | |
| lucide-react | ISC | |
| pdfjs-dist | Apache-2.0 | |
| mammoth | BSD-2-Clause | |
| JSZip | MIT or GPL-3.0 (dual) | Use under MIT. |
| @supabase/supabase-js | MIT | |
| Tesseract.js | Apache-2.0 | Language data downloads at first use. |
| @mozilla/readability | Apache-2.0 | Server-side article extraction. |
| linkedom | ISC | |
| FFmpeg (installed in the server image) | LGPL/GPL depending on build | Run as a separate program to encode MP3. Check the Debian build's terms if you redistribute the image. |
| Inter, Literata (via @fontsource-variable) | SIL OFL 1.1 | Attribution and font-file terms apply. |

## TTS engines and voices

| Engine | Concern |
|---|---|
| Browser SpeechSynthesis | Uses voices installed on the user's device, licensed by the OS vendor. No server cost. |
| Edge TTS (`edge-tts-universal`) | Library is AGPL-3.0-or-later (v1.4.0) and Microsoft's service is an unofficial route. Kept optional and restricted to the owner's account by `EDGE_TTS_ALLOWED_USER_IDS`. Do not offer to customers. |
| ElevenLabs | Paid service. Whether you may resell audio depends on your ElevenLabs plan and its terms. Check before charging customers. |
| Kokoro-FastAPI server image | Reported Apache-2.0, running the Kokoro model (also reported Apache-2.0). Confirm both for the exact version you deploy. |
| OpenAI-compatible endpoint | The server sends text to whatever endpoint you configure. Review that provider's terms and the license of the model behind it (Kokoro: Apache-2.0 as reported). |
| Kokoro | Reported Apache-2.0 model and code. Confirm the exact weights and voice pack you download. |
| Piper | Code license changed across versions, and each voice model has its own license. Check both. |
| VoiceStudio | AGPL-3.0, and its default model may be non-commercial. Keep it as a separate internal tool. |

## Scripture translations (tapestry)

| Field | World English Bible (WEB) |
|---|---|
| id / abbreviation | `engwebp` / WEB |
| license | Public domain |
| notice stored in `translations.copyright_notice` | The World English Bible is in the public domain. "World English Bible" is a trademark of eBible.org: if the text is changed in any way, it must not be called the World English Bible. |
| source | https://ebible.org/Scriptures/details.php?id=engwebp (verse-per-line download: `engwebp_vpl.zip`) |
| commercial use | Allowed (public domain). Reviewed from the eBible.org details page. |
| restriction | Do not alter the text and still call it WEB. Tapestry never rewrites Scripture. |

Other translations stay disabled (`translations.enabled = false`) until their terms are read and recorded here. Starter-well passage lists are our own editorial selection (references only).

## Additional Bible translations (tapestry)
All four are listed on their eBible.org pages as public domain (checked October 2026). The text is loaded by `packages/scripture/src/translations.ts` + `services/api/src/tapestry/setup.ts` from `https://ebible.org/Scriptures/<id>_vpl.zip`. Each is stored with its notice in `translations.copyright_notice`.

| Translation | id | License | Notice and restrictions |
|---|---|---|---|
| World English Bible | `engwebp` | Public domain | See above. Do not alter the text and still call it WEB. |
| Berean Standard Bible | `engbsb` | Public domain (dedicated by its publishers) | Apps that keep the verbatim text may use the Berean name. A changed text should not. https://ebible.org/details.php?id=engbsb |
| King James Version (1769 text) | `eng-kjv2006` | Public domain | In the United Kingdom the Crown holds letters patent for printing the KJV; this has no effect elsewhere. https://ebible.org/details.php?id=eng-kjv2006 |
| American Standard Version (1901) | `eng-asv` | Public domain | https://ebible.org/details.php?id=eng-asv |

Not added: any translation whose terms were not checked (for example NIV, ESV, NLT, NASB, CSB). Collections on GitHub often mix public-domain and copyrighted translations; use eBible.org's per-translation status instead.

## Fonts and libraries added with Tapestry

| Item | License | Notes |
|---|---|---|
| Newsreader (variable) | SIL Open Font License 1.1 | Scripture and headings. `@fontsource-variable/newsreader` |
| Instrument Sans (variable) | SIL Open Font License 1.1 | Interface text. `@fontsource-variable/instrument-sans` |
| Dexie, dexie-react-hooks | Apache-2.0 | On-device database |
| fflate | MIT | Unzips the WEB download on the server |
| React, Vite, vite-plugin-pwa | MIT | Same as earshelf |

The sample verses inside the preview page (`apps/tapestry/preview/preview.tsx`) were typed by hand for demonstration only and are never used by the real app.

## Hosting and services (added with the move to Oracle Cloud)

| Service | Note |
|---|---|
| Oracle Cloud Always Free | Free allowances and idle-reclaim rules are set by Oracle and have changed before. Re-read their terms. Upgrading to Pay As You Go keeps free-tier resources free but needs a card. |
| Coolify | Open-source deployment panel. Check its license for your use. |
| sslip.io and DuckDNS | Free naming services used for HTTPS addresses. No account data is shared with them beyond the server's public IP. |
| license-checker (CI only) | Used to list dependency licenses. Not shipped in the app. |
