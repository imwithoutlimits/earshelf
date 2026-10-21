import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sheet } from '@wells/ui';
import { SignIn, useUser } from '@wells/auth';
import { TRANSLATIONS } from '@wells/scripture';
import { db, getSetting, setSetting } from '../db';
import { api, supabase } from '../api';
import { downloadBible, enabledTranslations, infoOf } from '../data';
import { useTranslation } from '../tr';
import { Seg } from '../ui';

export function Profile({ theme, setTheme }: { theme: string; setTheme: (t: string) => void }) {
  const user = useUser(); const tr = useTranslation();
  const [signIn, setSignIn] = useState(false); const [pct, setPct] = useState<number | null>(null); const [msg, setMsg] = useState('');
  const [admin, setAdmin] = useState(false); const [setup, setSetup] = useState(''); const [avail, setAvail] = useState<string[]>(['engwebp']);
  useEffect(() => { void enabledTranslations().then(setAvail); }, [user]);
  useEffect(() => { if (user) void api.apiGet<{ admin: boolean }>('/v1/tapestry/capabilities').then((c) => setAdmin(c.admin)).catch(() => setAdmin(false)); }, [user]);
  const have = useLiveQuery(() => db.verses.filter((v) => v.tr === tr.id).count(), [tr.id], 0);
  const downloaded = useLiveQuery(() => getSetting(`downloaded:${tr.id}`, false), [tr.id], false);
  return (
    <div className="screen">
      <h1 className="h1">Profile</h1>
      <div className="sec" style={{ marginTop: 18 }}><div className="b">Account</div>
        {user ? <><p className="mut">Signed in as {user.user.email}. Your activity follows you to every device.</p><button className="btn" style={{ marginTop: 8 }} onClick={() => void supabase?.auth.signOut()}>Sign out</button></>
          : <><p className="mut">You can use Tapestry without an account. Sign in to keep your activity across devices.</p>{supabase ? <button className="btn primary" style={{ marginTop: 8 }} onClick={() => setSignIn(true)}>Sign in or create an account</button> : <p className="sm mut">Account sign-in is not connected on this copy of the app.</p>}</>}</div>
      <div className="sec"><div className="b" style={{ marginBottom: 10 }}>Appearance</div><Seg label="Theme" value={theme as 'dark'} onChange={setTheme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark'], ['field', 'Colour']]} /></div>
      <div className="sec"><div className="b">Bible translation</div>
        <div className="pills" style={{ marginTop: 10 }} role="group" aria-label="Bible translation">{avail.map((id) => <button key={id} className="pill" aria-pressed={tr.id === id} onClick={() => void setSetting('translation', id)}>{infoOf(id).abbreviation}</button>)}</div>
        <p className="mut" style={{ marginTop: 10 }}><span className="b">{tr.name}.</span> {tr.description}</p>
        <p className="sm mut" style={{ marginTop: 6 }}>{tr.notice}</p><p className="sm mut"><a href={tr.licenseUrl} style={{ color: 'var(--tx)' }}>Source and license</a></p>
        {avail.length < 2 && <p className="sm mut">More translations appear here once they have been loaded for this app.</p>}</div>
      <div className="sec"><div className="b">Offline</div><p className="mut">{have.toLocaleString()} verses of {tr.abbreviation} are stored on this device{downloaded ? ' (the whole Bible)' : ''}. Passages you read are kept automatically.</p>
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>{supabase && <button className="btn" disabled={pct !== null} onClick={async () => { setMsg(''); setPct(0); try { await downloadBible(setPct); setMsg(`Done. The whole ${tr.abbreviation} is on this device.`); } catch (e) { setMsg(e instanceof Error ? e.message : 'Download failed. Check your connection and try again.'); } setPct(null); }}>{pct === null ? `Download the whole ${tr.abbreviation}` : `Downloading ${Math.round(pct * 100)}%`}</button>}
          <button className="btn" onClick={async () => { if (confirm('Remove downloaded Scripture from this device? Your wells and notes are kept.')) { await db.verses.clear(); for (const t of TRANSLATIONS) await setSetting(`downloaded:${t.id}`, false); setMsg('Offline Scripture removed.'); } }}>Remove offline data</button></div>{msg && <p role="status" className="sm mut" style={{ marginTop: 8 }}>{msg}</p>}</div>
      <div className="sec"><div className="b">Reminders</div><p className="mut">Daily reminders and scheduled listening are part of Plus and arrive in the next update.</p></div>
      {admin && <div className="sec"><div className="b">Owner setup</div><p className="mut">Loads the 16 starter wells and the Bible text (World English Bible) into your database. Takes a few minutes. Safe to run again.</p><button className="btn primary" style={{ marginTop: 8 }} disabled={setup === 'running'} onClick={async () => { setSetup('running'); try { const r = await api.apiPost<{ seeded: { wells: number; passages: number }; imported: Array<{ translation: string; verses?: number; starterProblems?: string[]; error?: string }> }>('/v1/tapestry/admin/setup', { enable: true }); const ok = r.imported.filter((x) => x.verses); const bad = r.imported.filter((x) => x.error); setSetup(`Loaded ${r.seeded.wells} wells and ${ok.length} translation(s) (${ok.reduce((n, x) => n + (x.verses ?? 0), 0).toLocaleString()} verses).${bad.length ? ` Problems: ${bad.map((x) => `${x.translation}: ${x.error}`).join('; ')}` : ' Every translation loaded.'}`); } catch (e) { setSetup(e instanceof Error ? e.message : 'Setup failed.'); } }}>{setup === 'running' ? 'Loading…' : 'Load starter wells and Scripture'}</button>{setup && setup !== 'running' && <p role="status" className="sm mut" style={{ marginTop: 8 }}>{setup}</p>}</div>}
      {signIn && supabase && <Sheet label="Sign in" onClose={() => setSignIn(false)}><SignIn supabase={supabase} brand="tapestry" blurb="Find the passages you need, gather them into wells, and come back to them." onSkip={() => setSignIn(false)} /></Sheet>}
    </div>
  );
}
