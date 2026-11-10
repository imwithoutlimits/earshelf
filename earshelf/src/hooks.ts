import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PlayerController } from '@wells/audio-player';
import { buildUtterances, pickWellStyle, sanitizeOverrides, scaledNarration } from '@wells/core';
import type { NarrationOverrides } from '@wells/core';
import type { ReadingMode, Utterance } from '@wells/core';
import { hasFeature, type Feature, type Plan } from '@wells/billing/src/plans.ts';
import { localDay } from '@wells/activity';
import { syncListeningSoon } from './activitySync';
import { refreshPushSoon } from './push';
import { db, queueSync, setSetting, type DocRecord } from './db';

export const player = new PlayerController();
player.onProgress = (docId, index, completed) => {
  const total = player.getSnapshot().length;
  void db.progress.put({ docId, index, total, completed, updatedAt: Date.now() });
  void db.docs.update(docId, { lastPlayedAt: Date.now() });
  void queueSync('playback_progress', docId);
};
export const usePlayer = () => useSyncExternalStore(player.subscribe, player.getSnapshot);

export function useSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const rec = useLiveQuery(() => db.settings.get(key), [key]);
  const value = rec ? (rec.value as T) : fallback;
  return [value, (v: T) => { void setSetting(key, v); }];
}

/** Plan is the entitlement written by the verified billing webhook and synced down. Free until then. */
export function usePlan(): Plan {
  const rec = useLiveQuery(() => db.settings.get('plan'), []);
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_PLAN) return import.meta.env.VITE_DEV_PLAN;
  return (rec?.value as Plan | undefined) ?? 'free';
}
export async function currentPlan(): Promise<Plan> {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_PLAN) return import.meta.env.VITE_DEV_PLAN;
  return ((await db.settings.get('plan'))?.value as Plan | undefined) ?? 'free';
}
export function useHasFeature(f: Feature): boolean { return hasFeature(usePlan(), f); }

export interface VoiceProfile { id: string; name: string; rate: number; pause: number; mode: ReadingMode; blurb: string }
export const VOICE_PROFILES: VoiceProfile[] = [
  { id: 'calm-nonfiction', name: 'Calm nonfiction', rate: 1, pause: 1.1, mode: 'clean', blurb: 'Steady pace, clear pauses' },
  { id: 'academic', name: 'Academic', rate: 0.95, pause: 1.2, mode: 'study', blurb: 'Keeps definitions and tables' },
  { id: 'business', name: 'Business', rate: 1.1, pause: 1, mode: 'clean', blurb: 'Brisk and to the point' },
  { id: 'warm-narrator', name: 'Warm narrator', rate: 0.95, pause: 1.2, mode: 'audiobook', blurb: 'Unhurried, continuous' },
  { id: 'energetic', name: 'Energetic', rate: 1.2, pause: 0.8, mode: 'clean', blurb: 'Faster, shorter pauses' },
  { id: 'focused-study', name: 'Focused study', rate: 0.9, pause: 1.3, mode: 'study', blurb: 'Slow, with room to think' },
  { id: 'bedtime', name: 'Bedtime', rate: 0.85, pause: 1.5, mode: 'audiobook', blurb: 'Slow and soft-paced' },
  { id: 'accessibility', name: 'Accessibility', rate: 0.9, pause: 1.4, mode: 'accessibility', blurb: 'Clear pacing, minimal clutter' },
  { id: 'fiction', name: 'Fiction', rate: 1, pause: 1.1, mode: 'audiobook', blurb: 'Smooth story flow' },
  { id: 'conversational', name: 'Conversational', rate: 1.05, pause: 0.9, mode: 'clean', blurb: 'Relaxed and natural' },
];

export const MODE_LABELS: Record<ReadingMode, { name: string; blurb: string }> = {
  clean: { name: 'Clean reading', blurb: 'Removes clutter, keeps the main content' },
  complete: { name: 'Complete reading', blurb: 'Reads everything that was extracted' },
  audiobook: { name: 'Audiobook', blurb: 'Smoothest continuous narration' },
  study: { name: 'Study', blurb: 'Keeps definitions, examples, tables and captions' },
  accessibility: { name: 'Accessibility', blurb: 'Longer pauses, captions read, minimal clutter' },
};

/** Pace and pauses for a document: its well's voice style if it has one, otherwise the person's own settings. */
export function useDocStyle(docId: string | undefined): { rate: number; pause: number; fromWell: boolean } {
  const [rate] = useSetting('rate', 1);
  const [pause] = useSetting('pauseScale', 1);
  const wells = useLiveQuery(() => db.wells.toArray(), [], []);
  const memberOf = useLiveQuery(async () => (docId ? (await db.wellItems.where('docId').equals(docId).toArray()).map((i) => i.wellId) : []), [docId], [] as string[]);
  return useMemo(() => {
    const s = pickWellStyle(wells, memberOf, VOICE_PROFILES);
    return { rate: s?.rate ?? rate, pause: s?.pause ?? pause, fromWell: !!s };
  }, [wells, memberOf, rate, pause]);
}

export interface Narration { overrides: NarrationOverrides; dialogueVoice: string }

/** The person's narration choices (citations, equations, tables, second voice for dialogue) on top of the reading mode. */
export function useNarration(): Narration {
  const [citations] = useSetting('narrCitations', '');
  const [equations] = useSetting('narrEquations', '');
  const [tables] = useSetting('narrTables', '');
  const [dialogueVoice] = useSetting('dialogueVoice', '');
  const [serverOn] = useSetting('useServerVoice', false);
  const canMulti = useHasFeature('multi_speaker');
  return useMemo(() => {
    const dialogue = !!dialogueVoice && serverOn && canMulti;
    // Always carries an explicit dialogue flag so the screen and the server build identical sentences.
    return { overrides: sanitizeOverrides({ citations: citations || undefined, equations: equations || undefined, tables: tables || undefined, dialogue }), dialogueVoice: dialogue ? dialogueVoice : '' };
  }, [citations, equations, tables, dialogueVoice, serverOn, canMulti]);
}

export function useUtterances(doc: DocRecord | undefined): Utterance[] {
  const scale = useDocStyle(doc?.id).pause;
  const narr = useNarration();
  const canPron = useHasFeature('pronunciation');
  const prons = useLiveQuery(() => db.pron.toArray(), [], []);
  return useMemo(() => {
    if (!doc) return [];
    const mine = canPron ? prons.filter((p) => !p.docId || p.docId === doc.id) : [];
    return buildUtterances(doc.parsed, scaledNarration(doc.readingMode, scale, narr.overrides), mine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.updatedAt, doc?.readingMode, scale, canPron, prons, narr]);
}

/** Loads a document into the shared player (resuming from saved progress) without starting playback. */
let loadedUtterances: Utterance[] | null = null;
export async function loadIntoPlayer(doc: DocRecord, utterances: Utterance[]) {
  if (loadedUtterances === utterances) return;
  const snap = player.getSnapshot();
  let start: number;
  if (snap.documentId === doc.id) start = snap.index; // settings changed mid-listen: keep place
  else {
    const prog = await db.progress.get(doc.id);
    start = prog && !prog.completed ? prog.index : 0;
  }
  loadedUtterances = utterances;
  const sectionTitles: Record<string, string> = {};
  doc.parsed.sections.forEach((sec) => { sectionTitles[sec.id] = sec.title; });
  const art = (file: string, size: number) => ({ src: new URL(`icons/${file}`, document.baseURI).href, sizes: `${size}x${size}`, type: 'image/png' });
  player.load({ documentId: doc.id, title: doc.title, author: doc.author, sectionTitles, artwork: [art('icon-192.png', 192), art('icon-512.png', 512)] }, utterances, Math.min(start, Math.max(0, utterances.length - 1)));
}

export function useVoices(lang = 'en'): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return useMemo(() => voices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())).sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name)), [voices, lang]);
}

/** 2:11:48 style clock for a number of seconds (1:05 under an hour). */
export function formatClock(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return 'Under a minute';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** The look the person chose. "system" follows the device's light or dark setting. */
export type ThemeSetting = 'system' | 'light' | 'dark' | 'blue';
export type Look = 'light' | 'dark' | 'blue';
export const THEMES: Array<{ id: ThemeSetting; label: string }> = [
  { id: 'system', label: 'Match my device' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'blue', label: 'Blue' },
];
export const THEME_COLOR: Record<Look, string> = { light: '#ecece7', dark: '#121212', blue: '#0b34b5' };

/** The look actually on screen, so a screen can lay itself out differently for light, dark and blue. */
export function useLook(): Look {
  const [theme] = useSetting<ThemeSetting>('theme', 'system');
  const [dark, setDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return theme === 'system' ? (dark ? 'dark' : 'light') : theme;
}

export type HomeLayout = 'shelf' | 'grid' | 'list';

/** Adds up the time spent actually listening, one local day at a time, and saves it every few seconds. Nothing leaves the device. */
export function startListeningMeter(): () => void {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let pending = 0;
  let last = Date.now();
  const flush = async () => {
    const whole = Math.floor(pending);
    if (whole < 1) return;
    pending -= whole;
    const day = localDay(Date.now(), tz);
    await db.transaction('rw', db.listening, async () => {
      const row = await db.listening.get(day);
      await db.listening.put({ day, seconds: (row?.seconds ?? 0) + whole, updatedAt: Date.now(), pushed: row?.pushed });
    });
    syncListeningSoon();
    refreshPushSoon();
  };
  const tick = () => {
    const now = Date.now();
    // A tab that was frozen in the background must not count the gap as listening.
    if (player.getSnapshot().status === 'playing') pending += Math.min(2, (now - last) / 1000);
    last = now;
    if (pending >= 10) void flush();
  };
  const timer = setInterval(tick, 1000);
  const onHide = () => { if (document.visibilityState === 'hidden') { tick(); void flush(); } };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); void flush(); };
}

/** Opens "Now playing" for a book and starts it. Used by the Resume button and by reminder notifications. */
export function useStartListening() {
  const [docId, setDocId] = useState<string | null>(null);
  return { docId, start: (id: string) => setDocId(id), done: () => setDocId(null) };
}
