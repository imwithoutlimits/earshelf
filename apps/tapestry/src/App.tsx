import { useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sheet } from '@wells/ui';
import { AuthContext, useSession } from '@wells/auth';
import { supabase } from './api';
import { db, getSetting, setSetting } from './db';
import { flush, setToast } from './activity';
import { usePlayer } from './audio';
import { Icon, Seg } from './ui';
import { NavCtx, type Nav, type Overlay } from './nav';
import { Home } from './views/home';
import { Wells, WellDetail, SaveSheet, NewWellSheet } from './views/wells';
import { Activity } from './views/activity';
import { Search } from './views/search';
import { PassageView, Memorize } from './views/passage';
import { MiniPlayer, PlayerView } from './views/player';
import { Profile } from './views/profile';
import { CHIP_TO_WELL, TOPIC_CHIPS } from '@wells/scripture';

type Tab = 'home' | 'wells' | 'activity' | 'profile';
const TABS: Array<[Tab, string]> = [['home', 'Home'], ['wells', 'Wells'], ['activity', 'Activity'], ['profile', 'Profile']];

function Onboarding({ onDone }: { onDone: () => void }) {
  const [topic, setTopic] = useState<string>('Courage'); const [mins, setMins] = useState<'3' | '5' | '10'>('5'); const [reflect, setReflect] = useState<'scripture' | 'reflect'>('reflect');
  return (
    <Sheet label="Welcome to Tapestry" onClose={() => void setSetting('onboarded', true)}>
      <h2>What would you like to explore?</h2>
      <div className="pills">{TOPIC_CHIPS.map((t) => <button key={t} className="pill" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t}</button>)}</div>
      <div><div className="label" style={{ marginBottom: 6 }}>How long do you usually have?</div><Seg label="Listening time" value={mins} onChange={setMins} options={[['3', '3 min'], ['5', '5 min'], ['10', '10 min']]} /></div>
      <div><div className="label" style={{ marginBottom: 6 }}>After each passage</div><Seg label="After the passage" value={reflect} onChange={setReflect} options={[['scripture', 'Scripture only'], ['reflect', 'Add a reflection']]} /></div>
      <p className="sm mut">Scripture text is the World English Bible. No account is needed to start.</p>
      <button className="btn primary big" onClick={async () => { await setSetting('currentWell', CHIP_TO_WELL[topic]); await setSetting('listenMinutes', Number(mins)); await setSetting('after', reflect); await setSetting('onboarded', true); onDone(); }}>Begin</button>
    </Sheet>
  );
}
export function App() {
  const { session } = useSession(supabase); const [tab, setTab] = useState<Tab>('home'); const [stack, setStack] = useState<Overlay[]>([]); const [saving, setSaving] = useState<string[] | null>(null); const [newWell, setNewWell] = useState(false); const [toast, setToastMsg] = useState('');
  const theme = useLiveQuery(() => getSetting('theme', 'dark'), [], 'dark'); const onboarded = useLiveQuery(() => getSetting<boolean | null>('onboarded', null), [], undefined); const pl = usePlayer();
  const say = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2200); }, []);
  useEffect(() => { setToast(say); const f = () => void flush(); window.addEventListener('online', f); document.addEventListener('visibilitychange', f); void flush(); return () => { window.removeEventListener('online', f); document.removeEventListener('visibilitychange', f); }; }, [say, session]);
  useEffect(() => { const t = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme; document.documentElement.dataset.theme = t; document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#e8dce0' : t === 'field' ? '#6b1e3f' : '#160d13'); }, [theme]);
  const nav: Nav = { go: (o) => setStack((s) => [...s, o]), back: () => setStack((s) => s.slice(0, -1)), save: setSaving, newWell: () => setNewWell(true), toast: say, tab: (t) => { setStack([]); setTab(t); } };
  const top = stack[stack.length - 1];
  return (
    <AuthContext.Provider value={session}><NavCtx.Provider value={nav}>
      <div className="app">
        <nav className="tabs" aria-label="Primary">{TABS.map(([id, label]) => <button key={id} aria-current={!top && tab === id ? 'page' : undefined} onClick={() => nav.tab(id)}><Icon n={label} />{label}</button>)}</nav>
        <div className="main" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
          {tab === 'home' && <Home />}{tab === 'wells' && <Wells />}{tab === 'activity' && <Activity />}{tab === 'profile' && <Profile theme={theme} setTheme={(t) => void setSetting('theme', t)} />}
          {pl.queue.length > 0 && top?.t !== 'player' && <MiniPlayer onOpen={() => nav.go({ t: 'player' })} />}
        </div>
        {top && <div className="overlay" role="region" aria-label={top.t}>
          {top.t === 'search' && <Search />}{top.t === 'well' && <WellDetail id={top.id} />}{top.t === 'passage' && <PassageView k={top.key} wellId={top.wellId} />}{top.t === 'memorize' && <Memorize k={top.key} />}{top.t === 'player' && <PlayerView />}
        </div>}
        {saving && <SaveSheet keys={saving} onClose={() => setSaving(null)} />}{newWell && <NewWellSheet onClose={() => setNewWell(false)} />}
        {onboarded === null && <Onboarding onDone={() => void db.settings.get('onboarded')} />}
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </NavCtx.Provider></AuthContext.Provider>
  );
}
