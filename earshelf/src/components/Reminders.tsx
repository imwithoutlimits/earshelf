import { useState } from 'react';
import { Bell } from 'lucide-react';
import { DEFAULT_NOTIFY, type NotifyPrefs } from '@wells/core';
import { useUser } from '../auth';
import { useSetting } from '../hooks';
import { disablePush, enablePush, pushSupported, refreshPush, sendTestPush } from '../push';

/** Reminders: up to three a day, only when you have not listened yet. */
export function Reminders() {
  const user = useUser();
  const [enabled] = useSetting<boolean>('pushEnabled', false);
  const [prefs, setPrefs] = useSetting<NotifyPrefs>('notifyPrefs', DEFAULT_NOTIFY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const p = { ...DEFAULT_NOTIFY, ...prefs };
  const supported = pushSupported();

  const toggle = async (on: boolean) => {
    setBusy(true); setMsg(null);
    if (on) { const r = await enablePush(p); if (!r.ok) setMsg(r.message); else setMsg('Reminders are on.'); }
    else { await disablePush(); setMsg('Reminders are off.'); }
    setBusy(false);
  };
  const change = async (next: NotifyPrefs) => { await setPrefs(next); if (enabled) void refreshPush(next); };
  const test = async () => { setBusy(true); setMsg(null); const r = await sendTestPush(); setMsg(r.ok ? 'Sent. It should arrive in a few seconds.' : r.message); setBusy(false); };

  return (
    <div className="card stack">
      <h2 className="sub"><Bell size={18} aria-hidden /> Reminders</h2>
      <p className="hint">At most three a day, and none once you have listened: a morning daily read, a nudge to pick up where you left off, and an evening reminder when a streak is at risk. Nothing is sent at night, and fewer if you have been away.</p>
      {!supported && <p className="hint">This browser cannot show reminders. On an iPhone or iPad, add earshelf to your Home Screen and open it from there.</p>}
      {supported && !user && <p className="hint">Sign in to turn on reminders, so they follow you across your devices.</p>}
      {supported && user && (
        <>
          <label className="check-row"><input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => void toggle(e.target.checked)} /> Remind me to listen</label>
          {enabled && (
            <>
              <label className="check-row"><input type="checkbox" checked={p.daily} onChange={(e) => void change({ ...p, daily: e.target.checked })} /> Daily read, in the morning</label>
              <label className="check-row"><input type="checkbox" checked={p.continue} onChange={(e) => void change({ ...p, continue: e.target.checked })} /> Continue where I left off, around midday</label>
              <label className="check-row"><input type="checkbox" checked={p.streak} onChange={(e) => void change({ ...p, streak: e.target.checked })} /> Keep my streak, in the evening</label>
              <label className="field">Morning reminder at
                <input className="text-input" type="time" value={p.time} onChange={(e) => { if (e.target.value) void change({ ...p, time: e.target.value }); }} />
              </label>
              <div className="row-end"><button className="btn" disabled={busy} onClick={() => void test()}>Send me a test</button></div>
            </>
          )}
        </>
      )}
      {msg && <p className="hint" role="status">{msg}</p>}
    </div>
  );
}
