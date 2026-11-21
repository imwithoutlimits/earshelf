import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { googleErrorText, signInWithGoogle } from './google.ts';

export const AuthContext = createContext<Session | null>(null);
/** The signed-in session shared by the whole app (null when signed out or running on this device only). */
export const useUser = () => useContext(AuthContext);

export function useSession(supabase: SupabaseClient | null): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);
  return { session, ready };
}

/** Google's own "G", as drawn in their brand guidelines. */
const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

export function SignIn({ supabase, brand, blurb, onSkip, google = true }: { supabase: SupabaseClient | null; brand: string; blurb: string; onSkip?: () => void; /** Show "Continue with Google". Turn off with VITE_GOOGLE_SIGNIN=off until the Google provider is set up. */ google?: boolean }) {
  const [mode, setMode] = useState<'in' | 'up' | 'link'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'link') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        setMsg({ kind: 'info', text: 'Check your email for a sign-in link.' });
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) setMsg({ kind: 'info', text: 'Account created. Check your email to confirm it, then sign in.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Something went wrong.';
      setMsg({ kind: 'error', text: /invalid login/i.test(m) ? 'That email and password do not match. Check them and try again, or create an account.' : m });
    } finally { setBusy(false); }
  };

  return (
    <main className="auth">
      <form className="auth-card stack" onSubmit={(e) => void submit(e)}>
        <h1 className="brand-big">{brand}</h1>
        <p className="hint">{blurb}</p>
        {google && supabase && (
          <>
            <button type="button" className="btn auth-google" disabled={busy} onClick={() => { setBusy(true); setMsg(null); void signInWithGoogle(supabase).then(({ error }) => { if (error) { setBusy(false); setMsg({ kind: 'error', text: googleErrorText(error) }); } }); }}>
              <GoogleG /> Continue with Google
            </button>
            <p className="auth-or" aria-hidden="true"><span>or use your email</span></p>
          </>
        )}
        <label className="field">Email
          <input className="text-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'link' && (
          <label className="field">Password
            <input className="text-input" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'up' && <span className="hint">At least 8 characters.</span>}
          </label>
        )}
        {msg && <p role={msg.kind === 'error' ? 'alert' : 'status'} className={msg.kind === 'error' ? 'error-text' : 'hint'}>{msg.text}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Email me a link'}</button>
        <div className="auth-links">
          {mode !== 'in' && <button type="button" className="link-btn" onClick={() => setMode('in')}>I have an account</button>}
          {mode !== 'up' && <button type="button" className="link-btn" onClick={() => setMode('up')}>Create an account</button>}
          {mode !== 'link' && <button type="button" className="link-btn" onClick={() => setMode('link')}>Use an email link instead</button>}
          {onSkip && <button type="button" className="link-btn" onClick={onSkip}>Continue on this device only</button>}
        </div>
      </form>
    </main>
  );
}
