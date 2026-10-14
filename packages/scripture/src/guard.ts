import { parseRefKey, parseReference, refKey, type Ref } from './reference.ts';

/** Keeps only references that are real (valid book and chapter) and, when candidates are given, that were actually offered. Nothing the AI invents survives. */
export function keepValidRefs(raw: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const r: Ref | null = parseRefKey(x.trim().toUpperCase()) ?? parseReference(x);
    if (!r) continue;
    const k = refKey(r);
    if (allowed && !allowed.has(k)) continue;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

const PROMISE = /\b(guarantee[sd]?|will (surely )?(heal|cure|fix|prosper|make you (rich|wealthy|well))|you will be (healed|cured|rich|wealthy)|god (will|promises to) (heal|cure|make you rich)|never (get|be) sick)\b/i;
const MEDICAL = /\b(stop(ping)? (taking |using )?(your |the |all )?(medic\w*|treatment|therapy|pills|meds)|instead of (medic\w*|treatment|therapy|a doctor|seeing a doctor)|no need (for|to see) (a )?(doctor|therapist)|diagnos(e|is)|dosage)\b/i;
const AUTHORITY = /\b(as (your|a) (pastor|priest|minister|prophet|theologian)|thus says the lord|god (is telling|told) you|the bible (clearly )?(teaches|says) that you (must|should))\b/i;
export function breaksBoundaries(text: string): boolean { return PROMISE.test(text) || MEDICAL.test(text) || AUTHORITY.test(text); }

/** A reflection prompt must be a short question or invitation, never a claim. Returns null when it should be discarded. */
export function cleanPrompt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length < 12 || t.length > 200 || breaksBoundaries(t)) return null;
  if (!/[?]$/.test(t) && !/^(take|notice|write|choose|pause|consider|name|think|which|what|how|is there)\b/i.test(t)) return null;
  return t;
}
