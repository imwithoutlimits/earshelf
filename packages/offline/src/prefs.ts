/**
 * Settings that follow a person between their devices, without one device undoing another.
 * The cloud copy is a flat object of setting values (so older versions of the app can still read it) plus a reserved "__at" entry:
 * the time each setting was last changed. A change only wins over another if it is newer, setting by setting. Before this,
 * the whole object was replaced, so a device that had not seen a change (or pulled while the person was changing it) would
 * quietly put the old value back, and a tick box would switch itself off again.
 */
export const PREFS_AT = '__at';
export interface LocalPref { value: unknown; updatedAt?: number }
type Cloud = Record<string, unknown> | null | undefined;

const atOf = (cloud: Cloud, key: string): number => {
  const m = cloud?.[PREFS_AT];
  const t = m && typeof m === 'object' ? (m as Record<string, unknown>)[key] : 0;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : 0;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What to save to the cloud: its current copy, with this device's settings laid over it wherever they are newer or the cloud has none. */
export function mergePrefsForPush(keys: readonly string[], local: ReadonlyMap<string, LocalPref>, cloud: Cloud): Record<string, unknown> {
  const out: Record<string, unknown> = {}; const at: Record<string, number> = {};
  if (cloud) for (const [k, v] of Object.entries(cloud)) { if (k === PREFS_AT) continue; out[k] = v; const t = atOf(cloud, k); if (t) at[k] = t; }
  for (const k of keys) {
    const l = local.get(k); if (!l) continue;
    const lt = l.updatedAt ?? 0;
    const cloudHas = !!cloud && k !== PREFS_AT && k in cloud;
    if (!cloudHas || lt > atOf(cloud, k)) { out[k] = l.value; if (lt) at[k] = lt; else delete at[k]; }
  }
  out[PREFS_AT] = at;
  return out;
}

/** Which cloud settings to apply on this device: the ones it has never had, and the ones that are newer than its own. */
export function prefsToApply(keys: readonly string[], local: ReadonlyMap<string, LocalPref>, cloud: Cloud): Array<{ key: string; value: unknown; updatedAt: number }> {
  const out: Array<{ key: string; value: unknown; updatedAt: number }> = [];
  if (!cloud) return out;
  for (const k of keys) {
    if (k === PREFS_AT || !(k in cloud)) continue;
    const ct = atOf(cloud, k), l = local.get(k);
    if (!l) { out.push({ key: k, value: cloud[k], updatedAt: ct }); continue; }
    const lt = l.updatedAt ?? 0;
    // Neither side has a time (both written before times existed): the cloud copy wins, as it always did.
    if (ct > lt || (ct === 0 && lt === 0 && !same(l.value, cloud[k]))) out.push({ key: k, value: cloud[k], updatedAt: ct });
  }
  return out;
}
