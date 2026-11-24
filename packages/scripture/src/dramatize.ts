/**
 * Dramatized reading (Tapestry Pro): the narration is read by one voice, the words of God and Jesus by a second, and everyone else who
 * speaks by a third. It only decides WHICH VOICE reads each stretch. It never adds, removes or changes a word of the text.
 * The voices are chosen by simple rules from the quotation marks and a speaker who is named next to the quote, so now and then a
 * line may be read by the wrong voice. Anything the rules are not sure about is read by the ordinary "speaker" voice, never the divine one.
 */
export type Role = 'narrator' | 'divine' | 'speaker';
export interface Segment { role: Role; text: string; verse: number }
export interface DramaVerse { n: number; text: string }

const OPEN = '“', CLOSE = '”';
const SPEECH_VERB = /\b(said|says|saying|replied|answered|answers|spoke|speaks|called|commanded|declared|declares|asked|asks|cried|told|tells|swore|sworn|prayed|proclaimed)\b/i;
// Not "Jesus'" or "God's": a possessive is not the one speaking ("Jesus' disciples said").
const DIVINE_NAME = /\b(Jesus|Christ|God|Yahweh|the LORD|the Lord|LORD|Lord)\b(?![’'])/;
const clauseBefore = (before: string): string => before.split(/[.?!”]\s*/).pop() ?? '';

/**
 * Who speaks a quote that begins right after `before`, judged only by the words in front of the opening quote.
 * The divine voice is used only when God, the LORD, Jesus or Christ is named BEFORE the speech word, as the one speaking:
 * "Jesus answered him," "God said," "Then the LORD said to Moses." Anything else, such as "They asked Jesus," "Peter said to Jesus,"
 * "Satan said to Jesus," or "Jesus' disciples said," is an ordinary speaker.
 */
export function speakerBefore(before: string): Role {
  const clause = clauseBefore(before);
  const name = DIVINE_NAME.exec(clause), verb = SPEECH_VERB.exec(clause);
  return name && verb && name.index < verb.index ? 'divine' : 'speaker';
}
/** A quote can also be named after it: "Follow me," Jesus said. Only used to upgrade a speaker quote to divine. */
export function speakerAfter(after: string): boolean {
  const a = after.slice(0, 70);
  return /^\s*,?\s*(?:and\s+)?(?:said|says|replied|answered|declared|cried)?\s*(?:Jesus|God|the LORD|the Lord|Yahweh)\b/.test(a) && SPEECH_VERB.test(a.slice(0, 40));
}

/** Splits the verses of a passage into stretches for each voice. Quotes that run over several verses keep their voice. */
export function segmentVerses(verses: readonly DramaVerse[]): Segment[] {
  const out: Segment[] = [];
  let open: Role | null = null; // the voice of a quote that is still open at the end of a verse
  for (const v of verses) {
    const text = v.text;
    let buf = '', startIdx = out.length;
    const flush = (role: Role) => {
      const t = buf.replace(/\s+/g, ' ').trim();
      buf = '';
      if (t) out.push({ role, text: t, verse: v.n });
    };
    for (let k = 0; k < text.length; k++) {
      const ch = text[k];
      const isOpen = ch === OPEN || (ch === '"' && open === null);
      const isClose = ch === CLOSE || (ch === '"' && open !== null);
      if (isOpen) {
        if (open !== null) continue; // a repeated opening quote at the start of a new paragraph of the same speech, or a nested quote: keep the same voice
        flush('narrator');
        open = speakerBefore(text.slice(0, k));
        startIdx = out.length;
        continue;
      }
      if (isClose && open !== null) {
        flush(open);
        if (open === 'speaker' && speakerAfter(text.slice(k + 1))) for (let j = startIdx; j < out.length; j++) if (out[j].role === 'speaker') out[j].role = 'divine';
        open = null;
        continue;
      }
      buf += ch;
    }
    flush(open ?? 'narrator');
  }
  return out;
}

export interface CastVoice { id: string; lang: string }
export interface Cast { narrator: string; divine: string; speaker: string }
const male = (id: string) => /^[a-z]m_/i.test(id), female = (id: string) => /^[a-z]f_/i.test(id);
/** Three different voices if the engine has them: the narrator (as chosen), a male voice for God and Jesus, a third for everyone else. */
export function pickCast(voices: readonly CastVoice[], narrator: string): Cast {
  const en = voices.filter((v) => /^en/i.test(v.lang)).map((v) => v.id);
  const pool = en.length ? en : voices.map((v) => v.id);
  const others = pool.filter((id) => id !== narrator);
  const divine = others.find(male) ?? others[0] ?? narrator;
  const rest = others.filter((id) => id !== divine);
  const speaker = (male(narrator) ? rest.find(female) : rest.find(male) ?? rest.find(female)) ?? rest[0] ?? narrator;
  return { narrator, divine, speaker };
}

export const DRAMATIZED_NOTE = 'Voices are chosen by simple rules from the quotation marks and who is named as speaking, so a line may occasionally be read by the wrong voice. The words themselves are never changed.';
