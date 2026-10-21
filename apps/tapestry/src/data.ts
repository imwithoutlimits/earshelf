import { db, getSetting, setSetting, type ItemRow, type WellRow } from './db';
import { supabase } from './api';
import { BOOKS, STARTER_WELLS, estimateMinutes, formatReference, parseRefKey, refKey, refOf, verseCount, TRANSLATIONS, DEFAULT_TRANSLATION, type Ref, type StarterWell, type TranslationInfo } from '@wells/scripture';
import { uid } from '@wells/offline';
import { award } from './activity';

export const DEFAULT_TR = DEFAULT_TRANSLATION;
export const infoOf = (id: string): TranslationInfo => TRANSLATIONS.find((t) => t.id === id) ?? TRANSLATIONS[0];
/** The translation the person chose (World English Bible until they change it). */
export async function getTranslation(): Promise<string> { const id = await getSetting<string>('translation', DEFAULT_TR); return TRANSLATIONS.some((t) => t.id === id) ? id : DEFAULT_TR; }
/** Translations that are loaded and licensed on the server. The last answer is kept so this works offline. */
export async function enabledTranslations(): Promise<string[]> {
  if (supabase && navigator.onLine) {
    try {
      const { data } = await supabase.from('translations').select('id');
      const have = (data ?? []).map((r: { id: string }) => r.id);
      const ordered = TRANSLATIONS.map((t) => t.id).filter((id) => have.includes(id));
      if (ordered.length) { await setSetting('enabledTranslations', ordered); return ordered; }
    } catch { /* offline or not configured: use what was saved last time */ }
  }
  return getSetting<string[]>('enabledTranslations', [DEFAULT_TR]);
}

export interface Passage { key: string; ref: Ref; title: string; verses: Array<{ n: number; text: string }>; text: string }
const build = (key: string, ref: Ref, rows: Array<{ verse: number; text: string }>): Passage => { const verses = rows.map((r) => ({ n: r.verse, text: r.text })); return { key, ref, title: formatReference(ref), verses, text: verses.map((v) => v.text).join(' ') }; };

/** Text comes from this device first, then the server (and is kept for offline), so a passage read once is always available. */
export async function loadPassage(key: string, trId?: string): Promise<Passage | null> {
  const ref = parseRefKey(key); if (!ref) return null;
  const tr = trId ?? await getTranslation();
  const from = ref.verseStart ?? 1, to = ref.verseEnd ?? ref.verseStart ?? 999;
  const inRange = (r: { verse: number }) => r.verse >= from && r.verse <= to;
  const local = (await db.verses.where('[tr+book+chapter]').equals([tr, ref.book.n, ref.chapter]).toArray()).filter(inRange).sort((a, b) => a.verse - b.verse);
  const need = ref.verseStart === undefined ? 1 : verseCount(ref);
  if (local.length >= need) return build(key, ref, local);
  if (supabase && navigator.onLine) {
    const { data } = await supabase.from('bible_verses').select('book,chapter,verse,text').eq('translation_id', tr).eq('book', ref.book.n).eq('chapter', ref.chapter).order('verse');
    if (data?.length) { await db.verses.bulkPut(data.map((r) => ({ key: `${tr}:${r.book}:${r.chapter}:${r.verse}`, tr: tr, book: r.book, chapter: r.chapter, verse: r.verse, text: r.text }))); return build(key, ref, data.filter(inRange)); }
  }
  return local.length ? build(key, ref, local) : null;
}
/** The whole chapter around a passage, for context. */
export async function loadChapter(key: string): Promise<Passage | null> { const r = parseRefKey(key); return r ? loadPassage(`${r.book.code}.${r.chapter}`) : null; }
export async function downloadBible(onProgress: (pct: number) => void, trId?: string): Promise<void> {
  const tr = trId ?? await getTranslation();
  if (!supabase) throw new Error('Connect Tapestry to your account to download the Bible for offline use.');
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('bible_verses').select('book,chapter,verse,text').eq('translation_id', tr).order('book').order('chapter').order('verse').range(from, from + 999);
    if (error) throw error; if (!data.length) break;
    await db.verses.bulkPut(data.map((r) => ({ key: `${tr}:${r.book}:${r.chapter}:${r.verse}`, tr: tr, book: r.book, chapter: r.chapter, verse: r.verse, text: r.text })));
    onProgress(Math.min(1, (from + data.length) / 31102));
    if (data.length < 1000) break;
  }
  await setSetting(`downloaded:${tr}`, true);
}
/** Exact phrase search over every verse stored on this device. */
export async function searchLocal(q: string, limit = 25): Promise<string[]> {
  const tr = await getTranslation();
  const needle = q.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim(); if (needle.length < 3) return [];
  const out: string[] = [];
  await db.verses.filter((v) => { if (out.length >= limit || v.tr !== tr) return false; return v.text.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').includes(needle); }).each((v) => { if (out.length < limit) out.push(`${BOOKS[v.book - 1].code}.${v.chapter}.${v.verse}`); });
  return out;
}

export interface WellView { id: string; name: string; description: string; intro?: string; starter: boolean; items: Array<{ key: string; link?: string; note?: string; id?: string }>; prompts: string[]; minutes: number; memorize?: string; source?: StarterWell }
const starterView = (w: StarterWell): WellView => ({ id: w.id, name: w.name, description: w.description, intro: w.intro, starter: true, items: w.items.map((i) => ({ key: i.ref, link: i.link, note: i.note })), prompts: w.prompts, minutes: estimateMinutes(w), memorize: w.memorize, source: w });
export async function wellView(id: string): Promise<WellView | null> {
  const s = STARTER_WELLS.find((w) => w.id === id); if (s) return starterView(s);
  const w = await db.wells.get(id); if (!w || w.deleted) return null;
  const items = (await db.items.where('wellId').equals(id).toArray()).sort((a, b) => a.position - b.position);
  const secs = items.reduce((n, i) => { const r = parseRefKey(i.ref); return n + Math.max(1, r ? verseCount(r) : 1) * 10 + 4; }, 0);
  return { id, name: w.name, description: w.description, starter: false, items: items.map((i) => ({ key: i.ref, link: i.link, note: i.note, id: i.id })), prompts: [], minutes: Math.max(1, Math.round(secs / 60)) };
}

export async function createWell(name: string, description = '', keys: string[] = [], kind: WellRow['kind'] = 'mine', sourceId?: string): Promise<string> {
  const now = Date.now(), id = uid();
  await db.wells.add({ id, name: name.trim().slice(0, 80) || 'Untitled well', description, kind, sourceId, createdAt: now, updatedAt: now });
  await db.items.bulkAdd(keys.map((ref, position) => ({ id: uid(), wellId: id, ref, position, updatedAt: now })));
  await award('create_well', id);
  for (const k of keys) await award('save_passage', k);
  return id;
}
export const copyStarter = async (id: string): Promise<string | null> => { const w = STARTER_WELLS.find((x) => x.id === id); if (!w) return null; const n = await createWell(w.name, w.description, w.items.map((i) => i.ref), 'copy', w.id); await db.items.where('wellId').equals(n).modify((i) => { i.link = w.items[i.position]?.link; i.note = w.items[i.position]?.note; }); return n; };
export async function addToWell(wellId: string, key: string): Promise<boolean> {
  const here = await db.items.where('wellId').equals(wellId).toArray(); if (here.some((i) => i.ref === key)) return false;
  const elsewhere = (await db.items.where('ref').equals(key).count?.()) ?? 0;
  await db.items.add({ id: uid(), wellId, ref: key, position: here.length, updatedAt: Date.now() }); await db.wells.update(wellId, { updatedAt: Date.now() });
  await award(elsewhere ? 'add_to_well' : 'save_passage', key); return true;
}
export const removeItem = async (id: string) => { const it = await db.items.get(id); await db.items.delete(id); if (it) { const rest = (await db.items.where('wellId').equals(it.wellId).toArray()).sort((a, b) => a.position - b.position); await Promise.all(rest.map((r, i) => db.items.update(r.id, { position: i }))); } };
/** Re-ordering a well is "structuring": it earns XP once per well per day. */
export async function moveItem(wellId: string, id: string, dir: -1 | 1) {
  const list = (await db.items.where('wellId').equals(wellId).toArray()).sort((a, b) => a.position - b.position); const i = list.findIndex((x) => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  await db.items.update(list[i].id, { position: j }); await db.items.update(list[j].id, { position: i }); await db.wells.update(wellId, { updatedAt: Date.now() }); await award('order_well', wellId);
}
export const deleteWell = async (id: string) => { await db.wells.update(id, { deleted: true, updatedAt: Date.now() }); await db.items.where('wellId').equals(id).delete(); };
export const progressOf = async (wellId: string) => (await db.progress.get(wellId))?.index ?? 0;
export const setProgress = (wellId: string, index: number) => db.progress.put({ wellId, index, updatedAt: Date.now() });
export const minutesLabel = (m: number) => `${m} min`;
export { refKey, refOf, formatReference, parseRefKey };
