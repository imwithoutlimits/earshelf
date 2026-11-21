import type { SupabaseClient } from '@supabase/supabase-js';

/** Sends the person to Google, then back to this same site signed in. Needs the Google provider switched on in Supabase (UPGRADE-GUIDE.md part 4). */
export async function signInWithGoogle(supabase: Pick<SupabaseClient, 'auth'>, origin: string = location.origin): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin, queryParams: { prompt: 'select_account' } } });
  return { error: error ? error.message : null };
}

/** Plain-words version of what Supabase says when the Google provider has not been switched on yet. */
export const googleErrorText = (m: string): string => (/provider is not enabled|unsupported provider/i.test(m) ? 'Google sign-in is not switched on yet. Use your email for now.' : m);
