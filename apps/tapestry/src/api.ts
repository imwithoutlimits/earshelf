import { createSupabase, makeApi } from '@wells/auth';
import { reportError } from './monitor';

export const supabase = createSupabase(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY);
export const api = makeApi({ supabase, apiUrl: import.meta.env.VITE_API_URL ?? '', appName: 'tapestry', onServerError: (p, s) => reportError(new Error(`${p} ${s}`), 'api') });
