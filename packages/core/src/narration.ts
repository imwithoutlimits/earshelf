import type { NarrationOptions, ParsedDocument, PronunciationEntry, ReadingMode, Utterance } from './model.ts';
import { stripCitations, stripNumericCitations } from './cleanup.ts';
import { splitSentences, wrapLong } from './sentences.ts';
import { mathToSpeech, replaceInlineMath } from './math.ts';
import { segmentDialogue } from './dialogue.ts';
import type { NarrationOverrides } from './model.ts';

export const MODE_PRESETS: Record<ReadingMode, NarrationOptions> = {
  clean: { tables: 'announce', readCaptions: false, readFootnotes: 'never', citations: 'skip', equations: 'off', splitDialogue: false, headingPauseMs: 700, sectionPauseMs: 1100, paragraphPauseMs: 550, sentencePauseMs: 180 },
  complete: { tables: 'read', readCaptions: true, readFootnotes: 'inline', citations: 'author-year', equations: 'symbols', splitDialogue: false, headingPauseMs: 700, sectionPauseMs: 1100, paragraphPauseMs: 550, sentencePauseMs: 180 },
  audiobook: { tables: 'skip', readCaptions: false, readFootnotes: 'never', citations: 'skip', equations: 'off', splitDialogue: false, headingPauseMs: 900, sectionPauseMs: 1600, paragraphPauseMs: 650, sentencePauseMs: 120 },
  study: { tables: 'read', readCaptions: true, readFootnotes: 'never', citations: 'author-year', equations: 'symbols', splitDialogue: false, headingPauseMs: 800, sectionPauseMs: 1200, paragraphPauseMs: 700, sentencePauseMs: 220 },
  accessibility: { tables: 'announce', readCaptions: true, readFootnotes: 'never', citations: 'skip', equations: 'symbols', splitDialogue: false, headingPauseMs: 900, sectionPauseMs: 1400, paragraphPauseMs: 800, sentencePauseMs: 250 },
};

export function applyPronunciations(text: string, entries: PronunciationEntry[]): string {
  const sorted = entries.filter((e) => e.term.trim()).sort((a, b) => b.term.length - a.term.length);
  let out = text;
  for (const e of sorted) {
    const esc = e.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const left = /^\w/.test(e.term) ? '\\b' : '';
    const right = /\w$/.test(e.term) ? '\\b' : '';
    out = out.replace(new RegExp(left + esc + right, 'gi'), () => e.say);
  }
  return out;
}

export function buildUtterances(
  doc: ParsedDocument,
  opts: NarrationOptions,
  pronunciations: PronunciationEntry[] = [],
): Utterance[] {
  const out: Utterance[] = [];
  const blocks = new Map(doc.blocks.map((b) => [b.id, b]));
  const lang = doc.language ?? 'en';

  const speak = (t: string) => {
    const cited = opts.citations === 'skip' ? stripCitations(t) : opts.citations === 'full' ? t : stripNumericCitations(t);
    return applyPronunciations(replaceInlineMath(cited, opts.equations), pronunciations).replace(/\s+/g, ' ').trim();
  };

  doc.sections.forEach((section) => {
    section.blockIds.forEach((bid, bi) => {
      const b = blocks.get(bid);
      if (!b) return;
      const made: Utterance[] = [];
      const add = (kind: Utterance['kind'], text: string, spoken: string, pause: number) => {
        if (!spoken) return;
        made.push({ id: `${b.id}.${made.length}`, blockId: b.id, sectionId: section.id, kind, text, spoken, pauseAfterMs: pause });
      };

      const readProse = (endPause: number) => {
        const segments = opts.splitDialogue ? segmentDialogue(b.text) : [{ text: b.text, dialogue: false }];
        for (const seg of segments) {
          for (const s of splitSentences(seg.text, lang).flatMap((x) => wrapLong(x))) {
            // A quote cut mid-sentence ("Hello," she said) only gets a breath, not a full stop's pause.
            const endsSentence = /[.!?…]["”’')\]]*$/.test(s);
            const before = made.length;
            add(b.type, s, speak(s), opts.splitDialogue && !endsSentence ? 80 : opts.sentencePauseMs);
            if (seg.dialogue && made.length > before) made[made.length - 1].role = 'dialogue';
          }
        }
        if (made.length) made[made.length - 1].pauseAfterMs = endPause;
      };

      switch (b.type) {
        case 'heading':
          add('heading', b.text, speak(b.text), opts.headingPauseMs);
          if (bi === 0 && out.length > 0) {
            const prev = out[out.length - 1];
            prev.pauseAfterMs = Math.max(prev.pauseAfterMs, opts.sectionPauseMs);
          }
          break;
        case 'paragraph':
        case 'quote':
          readProse(opts.paragraphPauseMs);
          break;
        case 'list_item':
          readProse(350);
          break;
        case 'table': {
          const rows = b.rows ?? [];
          if (opts.tables === 'skip') break;
          const n = `Table with ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}.`;
          add('announce', n, n, 400);
          if (opts.tables === 'read') {
            rows.slice(0, 12).forEach((r, i) => {
              const line = `Row ${i + 1}: ${r.join(', ')}`;
              add('table', line, speak(line), 300);
            });
            if (rows.length > 12) add('announce', 'The table continues.', 'The table continues.', 400);
          }
          break;
        }
        case 'equation': {
          if (opts.equations === 'off') break;
          const said = `Equation. ${mathToSpeech(b.text)}`;
          add('equation', b.text, said, opts.paragraphPauseMs);
          break;
        }
        case 'caption':
        case 'figure':
          if (opts.readCaptions) readProse(opts.paragraphPauseMs);
          break;
        case 'footnote':
          if (opts.readFootnotes === 'inline') readProse(opts.paragraphPauseMs);
          break;
        case 'code':
          break;
      }
      out.push(...made);
    });
  });
  return out;
}

export function estimateMinutes(words: number, rate = 1): number {
  return Math.max(1, Math.round(words / (160 * rate)));
}

export function scaledNarration(mode: ReadingMode, scale: number, overrides?: NarrationOverrides): NarrationOptions {
  const p = MODE_PRESETS[mode];
  return {
    ...p,
    ...(overrides?.citations ? { citations: overrides.citations } : {}),
    ...(overrides?.equations ? { equations: overrides.equations } : {}),
    ...(overrides?.tables ? { tables: overrides.tables } : {}),
    splitDialogue: overrides?.dialogue ?? p.splitDialogue,
    headingPauseMs: p.headingPauseMs * scale, sectionPauseMs: p.sectionPauseMs * scale, paragraphPauseMs: p.paragraphPauseMs * scale, sentencePauseMs: p.sentencePauseMs * scale,
  };
}

/** Accepts only known values, so a request from outside can never inject anything else. */
export function sanitizeOverrides(raw: unknown): NarrationOverrides {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (allowed.includes(v as T) ? (v as T) : undefined);
  const out: NarrationOverrides = {};
  const c = pick(r.citations, ['skip', 'author-year', 'full'] as const); if (c) out.citations = c;
  const e = pick(r.equations, ['off', 'symbols'] as const); if (e) out.equations = e;
  const t = pick(r.tables, ['skip', 'announce', 'read'] as const); if (t) out.tables = t;
  if (typeof r.dialogue === 'boolean') out.dialogue = r.dialogue;
  return out;
}
