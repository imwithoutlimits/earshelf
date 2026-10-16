import { useEffect, useRef, useState } from 'react';
import { Activity as ActivityIcon, FolderOpen, Library as LibraryIcon, User, WifiOff } from 'lucide-react';
import { ensureDefaultWells, getSetting } from './db';
import { AuthContext, SignIn, useSession } from './auth';
import { supabase } from './supabase';
import { startSync, stopSync, syncNow, useSyncStatus } from './sync';
import { installServerVoice } from './serverVoice';
import { THEME_COLOR, player, startListeningMeter, useLook, usePlan, useSetting, type ThemeSetting } from './hooks';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { setMonitorUser } from './monitor';
import { parseShare } from '@wells/core';
import { useAutoIndex } from './semantic';
import { useCapabilities } from './serverVoice';
import { Review } from './views/Review';
import { PlayerBar } from './components/PlayerBar';
import { ImportSheet } from './components/ImportSheet';
import { Home } from './views/Home';
import { Wells } from './views/Wells';
import { Search } from './views/Search';
import { Activity } from './views/Activity';
import { Settings } from './views/Settings';
import { Reader } from './views/Reader';

// Search is not a tab. It opens from the icon at the top right of the library screen.
type View = 'home' | 'wells' | 'activity' | 'settings';
const NAV: Array<{ id: View; label: string; Icon: typeof LibraryIcon }> = [
  { id: 'home', label: 'Library', Icon: LibraryIcon },
  { id: 'wells', label: 'Wells', Icon: FolderOpen },
  { id: 'activity', label: 'Activity', Icon: ActivityIcon },
  { id: 'settings', label: 'You', Icon: User },
];

export default function App() {
  const { session, ready } = useSession();
  const [localOnly, setLocalOnly] = useState(() => localStorage.getItem('earshelf-local-only') === '1');
  const sync = useSyncStatus();
  const plan = usePlan();
  const caps = useCapabilities(!!session);
  const [reviewing, setReviewing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [fullPlayer, setFullPlayer] = useState(false);
  // Something shared from the phone's Share menu or the browser extension arrives in the address.
  const [share, setShare] = useState(() => parseShare(location.search));
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  // Documents are prepared for search by meaning in the background, after each sync.
  useAutoIndex(!!session && hasFeature(plan, 'semantic_search') && !!caps?.embeddings, sync.lastSyncedAt);
  useEffect(() => { setMonitorUser(session?.user.id); }, [session?.user.id]);
  const [view, setView] = useState<View>('home');
  const [reader, setReader] = useState<{ docId: string; blockId?: string; play?: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [theme] = useSetting<ThemeSetting>('theme', 'system');
  const look = useLook();

  useEffect(() => { installServerVoice(); }, []);
  // Counts the time spent listening, for the streak on the Activity screen.
  useEffect(() => startListeningMeter(), []);

  useEffect(() => {
    if (!session) return;
    void startSync(session);
    return () => stopSync();
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void ensureDefaultWells();
    void getSetting('rate', 1).then((r) => player.setRate(r));
    void getSetting<string | null>('voiceURI', null).then((v) => player.setVoice(v));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme; else root.dataset.theme = theme;
    root.dataset.look = look;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[look]);
  }, [theme, look]);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && t.tagName !== 'BUTTON') { e.preventDefault(); player.toggle(); }
      else if (e.key === 'j') player.back(15);
      else if (e.key === 'l') player.forward(30);
      else if (e.key === 'ArrowLeft' && t.tagName !== 'INPUT') player.previous();
      else if (e.key === 'ArrowRight' && t.tagName !== 'INPUT') player.next();
      else if (e.key === '[') player.setRate(player.getSnapshot().rate - 0.25);
      else if (e.key === ']') player.setRate(player.getSnapshot().rate + 0.25);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const gateOpen = ready && (!supabase || !!session || localOnly);
  useEffect(() => { if (share && gateOpen) { setImporting(true); history.replaceState(null, '', location.pathname); } }, [share, gateOpen]);
  // Moving to a new screen moves keyboard and screen-reader focus to it, instead of leaving it on the old button.
  useEffect(() => { if (firstRender.current) { firstRender.current = false; return; } if (searching && !reader && !reviewing) return; mainRef.current?.focus({ preventScroll: true }); }, [view, reader?.docId, reviewing, searching]);

  const open = (docId: string, blockId?: string) => setReader({ docId, blockId });
  const goTo = (id: View) => { setReader(null); setReviewing(false); setSearching(false); setView(id); };

  if (!ready) return <div className="splash" role="status">Loading…</div>;
  if (supabase && !session && !localOnly) return <SignIn onSkip={() => { localStorage.setItem('earshelf-local-only', '1'); setLocalOnly(true); }} />;

  return (
    <AuthContext.Provider value={session}>
    <div className={reader ? 'shell reading' : 'shell'}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <nav className="sidenav" aria-label="Primary">
        <div className="brand">earshelf</div>
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} className={view === id && !reader ? 'nav-item active' : 'nav-item'} aria-current={view === id && !reader ? 'page' : undefined} onClick={() => goTo(id)}>
            <Icon size={22} /><span>{label}</span>
          </button>
        ))}
      </nav>

      <main className="content" id="main" tabIndex={-1} ref={mainRef}>
        {!online && <div className="banner" role="status"><WifiOff size={16} /> You’re offline. Your library and device voices still work.</div>}
        {online && sync.state === 'error' && <div className="banner" role="alert">Your changes are saved on this device but could not sync yet. <button className="link-btn inline" onClick={() => void syncNow(true)}>Try again</button></div>}
        {reader ? <Reader docId={reader.docId} focusBlockId={reader.blockId} autoPlay={reader.play} onBack={() => setReader(null)} onOpenPlayer={() => setFullPlayer(true)} /> : reviewing ? <Review onClose={() => setReviewing(false)} onOpen={(d, b) => { setReviewing(false); open(d, b); }} /> : searching ? <Search onOpen={(d, b) => { open(d, b); }} onBack={() => setSearching(false)} /> : (
          <>
            {view === 'home' && <Home onOpen={(d, o) => setReader({ docId: d, play: o?.play })} onImport={() => setImporting(true)} onReview={() => setReviewing(true)} onSearch={() => setSearching(true)} />}
            {view === 'wells' && <Wells onOpen={open} />}
            {view === 'activity' && <Activity onOpen={open} onReview={() => setReviewing(true)} />}
            {view === 'settings' && <Settings />}
          </>
        )}
      </main>

      <PlayerBar reading={!!reader} open={fullPlayer} onOpenChange={setFullPlayer} onOpenReader={(docId) => open(docId)} />

      <nav className="bottomnav" aria-label="Primary">
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} className={view === id && !reader ? 'nav-item active' : 'nav-item'} aria-current={view === id && !reader ? 'page' : undefined} onClick={() => goTo(id)}>
            <Icon size={24} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {importing && <ImportSheet initial={share ?? undefined} onClose={() => { setImporting(false); setShare(null); }} onDone={(id) => { setImporting(false); setShare(null); open(id); }} />}
    </div>
    </AuthContext.Provider>
  );
}
