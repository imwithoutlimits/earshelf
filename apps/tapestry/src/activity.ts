import { db } from './db';
import { api, supabase } from './api';
import { uid } from '@wells/offline';
import { buildSummary, listenedDays, localDay, xpAward, isXpKind, DEFAULT_TARGET_DAYS, type XpKind, type Session } from '@wells/activity';
import { getSetting } from './db';

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const today = () => localDay(Date.now(), tz());
export type Toast = (msg: string) => void; let toast: Toast = () => {}; export const setToast = (t: Toast) => { toast = t; };

/** Points for capturing and organising Scripture. Once per passage per day, and capped per day. The server repeats the same rules and is the record of truth. */
export async function award(kind: XpKind, ref: string): Promise<number> {
  if (!isXpKind(kind)) return 0;
  const day = today(); const events = await db.events.where('day').equals(day).toArray();
  if (events.some((e) => e.kind === kind && e.ref === ref)) return 0;
  const amount = xpAward(kind, events.reduce((n, e) => n + e.amount, 0)); if (!amount) return 0;
  await db.events.add({ id: uid(), kind, ref, day, amount, at: Date.now(), synced: 0 });
  toast(`+${amount} XP`); void flush(); return amount;
}
export async function logListen(seconds: number, wellName?: string) {
  if (seconds < 1) return; const day = today(); const before = await daySeconds(day);
  await db.listens.add({ id: uid(), day, at: Date.now(), seconds: Math.round(seconds), wellName, synced: 0 });
  if (before < 60 && before + seconds >= 60) { await award('listen_day', ''); toast('Your thread is kept for today'); }
  void flush();
}
const daySeconds = async (day: string) => (await db.listens.where('day').equals(day).toArray()).reduce((n, l) => n + l.seconds, 0);

export async function summary() {
  const [events, listens, target] = await Promise.all([db.events.toArray(), db.listens.toArray(), getSetting<number>('targetDays', DEFAULT_TARGET_DAYS)]);
  const byDay = new Map<string, number>(); listens.forEach((l) => byDay.set(l.day, (byDay.get(l.day) ?? 0) + l.seconds));
  const t = today(); const weekAgo = Date.now() - 8 * 86_400_000;
  const sessions: Session[] = listens.filter((l) => l.at >= weekAgo).map((l) => ({ ts: l.at, seconds: l.seconds, wellName: l.wellName }));
  const from = (() => { const d = new Date(`${t}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  return { ...buildSummary({ today: t, tz: tz(), listenedDays: listenedDays([...byDay].map(([day, seconds]) => ({ day, seconds }))), xpTotal: events.reduce((n, e) => n + e.amount, 0), xpWeek: events.filter((e) => e.day >= from).reduce((n, e) => n + e.amount, 0), target, sessions }), weekEvents: events.filter((e) => e.day >= from) };
}

let flushing = false;
/** Sends what happened on this device to the server when signed in and online. Safe to call any time; failures just try again later. */
export async function flush() {
  if (flushing || !supabase || !navigator.onLine || !api.apiUrl) return;
  const session = (await supabase.auth.getSession()).data.session; if (!session) return;
  flushing = true;
  try {
    for (const e of await db.events.where('synced').equals(0).toArray()) { await api.apiPost('/v1/tapestry/activity', { kind: e.kind, ref: e.ref || undefined, day: e.day, tz: tz() }); await db.events.update(e.id, { synced: 1 }); }
    for (const l of await db.listens.where('synced').equals(0).toArray()) { await api.apiPost('/v1/tapestry/activity', { kind: 'listen', seconds: l.seconds, day: l.day, wellName: l.wellName, tz: tz() }); await db.listens.update(l.id, { synced: 1 }); }
  } catch { /* offline or server busy: stays queued */ } finally { flushing = false; }
}
