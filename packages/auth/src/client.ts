import { createClient, type SupabaseClient } from '@supabase/supabase-js';
/** null when Supabase is not configured: the app then runs on this device only. */
export function createSupabase(url?: string, key?: string): SupabaseClient | null {
  return url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
}
