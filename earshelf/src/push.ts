import { chapterAtFraction, DEFAULT_NOTIFY, type NotifyPrefs } from '@wells/core';
import { localDay } from '@wells/activity';
import { apiGet, apiPost, supabase } from './supabase';
import { db, setSetting } from './db';

// Reminder notifications: the browser's push subscription is sent to the earshelf server, together with a small snapshot of what the person
// is reading (title, chapter, time left) so that a reminder can name their book. The server decides what to send and when.
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const get = async <T,>(key: string, fallback: T): Promise<T> => ((await db.settings.get(key))?.value as T | undefined) ?? fallback;

export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

async function deviceId(): Promise<string> {
  let id = await get<string>('pushDeviceId', '');
  if (!id) { id = crypto.randomUUID(); await setSetting('pushDeviceId', id); }
  return id;
}

/** What the reminders can say about the person's reading: the book in progress and one they have not started. */
export async function readingSnapshot() {
  const [progress, docs] = await Promise.all([db.progress.toArray(), db.docs.toArray()]);
  const byDoc = new Map(progress.map((p) => [p.docId, p]));
  const fraction = (p: { index: number; total: number }) => (p.total > 1 ? Math.min(1, p.index / (p.total - 1)) : 0);
  const current = progress
    .filter((p) => !p.completed && p.index > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((p) => ({ p, doc: docs.find((d) => d.id === p.docId) }))
    .find((x) => x.doc);
  const book = current?.doc ? (() => {
    const f = fraction(current.p);
    return { id: current.doc.id, title: current.doc.title, chapter: chapterAtFraction(current.doc.parsed, f)?.title, minutesLeft: Math.max(1, Math.round(current.doc.durationMin * (1 - f))) };
  })() : null;
  const fresh = docs.filter((d) => !byDoc.has(d.id) || (byDoc.get(d.id)!.index === 0 && !byDoc.get(d.id)!.completed)).sort((a, b) => b.createdAt - a.createdAt)[0];
  const next = fresh ? { id: fresh.id, title: fresh.title, minutes: fresh.durationMin } : null;
  return { book, next };
}

async function post(sub: PushSubscription, prefs: NotifyPrefs): Promise<void> {
  const { book, next } = await readingSnapshot();
  let since = await get<string>('pushSince', '');
  if (!since) { since = localDay(Date.now(), tz()); await setSetting('pushSince', since); }
  await apiPost('/v1/earshelf/push/subscribe', { deviceId: await deviceId(), subscription: sub.toJSON(), tz: tz(), prefs, book, next, since });
}

export type PushResult = { ok: true } | { ok: false; message: string };

export async function enablePush(prefs: NotifyPrefs): Promise<PushResult> {
  try {
    if (!pushSupported()) return { ok: false, message: 'This browser cannot show reminders. On an iPhone, add earshelf to your Home Screen first, then open it from there.' };
    if (!supabase || !(await supabase.auth.getSession()).data.session) return { ok: false, message: 'Sign in first, so reminders can follow you across your devices.' };
    const cfg = await apiGet<{ enabled: boolean; publicKey: string }>('/v1/earshelf/push/config');
    if (!cfg.enabled) return { ok: false, message: 'Reminders are not switched on for this server yet.' };
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, message: 'Notifications are blocked for earshelf. Allow them in your browser or phone settings, then try again.' };
    const reg = await navigator.serviceWorker.ready;
    const key = keyBytes(cfg.publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; } // the server's key changed
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
    await post(sub, prefs);
    await setSetting('pushEnabled', true);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Reminders could not be turned on. Try again.' };
  }
}

export async function disablePush(): Promise<void> {
  await setSetting('pushEnabled', false);
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    await apiPost('/v1/earshelf/push/unsubscribe', { deviceId: await deviceId() }).catch(() => undefined);
    await sub?.unsubscribe();
  } catch { /* nothing to undo */ }
}

/** Sends the current choices and reading snapshot to the server. Quiet when reminders are off. */
export async function refreshPush(prefs?: NotifyPrefs): Promise<void> {
  try {
    if (!pushSupported() || !(await get('pushEnabled', false)) || Notification.permission !== 'granted') return;
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return;
    await post(sub, prefs ?? (await get<NotifyPrefs>('notifyPrefs', DEFAULT_NOTIFY)));
  } catch { /* the next refresh will try again */ }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let last = 0;
/** Called as the person listens: keeps the book named in reminders current without sending more than every ten minutes. */
export function refreshPushSoon(): void {
  if (timer || Date.now() - last < 10 * 60_000) return;
  timer = setTimeout(() => { timer = null; last = Date.now(); void refreshPush(); }, 20_000);
}

export async function sendTestPush(): Promise<PushResult & { sent?: number }> {
  try {
    await refreshPush();
    const r = await apiPost<{ sent: number; devices: number }>('/v1/earshelf/push/test', {});
    return r.sent > 0 ? { ok: true, sent: r.sent } : { ok: false, message: r.devices ? 'The notification could not be delivered. Turn reminders off and on again.' : 'No device is registered for reminders yet.' };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : 'The test could not be sent.' }; }
}
