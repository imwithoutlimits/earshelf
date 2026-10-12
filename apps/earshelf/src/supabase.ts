import { createSupabase, makeApi } from '@wells/auth';
import { reportError } from './monitor';

export { ApiError } from '@wells/auth';
/** null when Supabase is not configured: the app then runs on this device only. */
export const supabase = createSupabase(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY);
const api = makeApi({ supabase, apiUrl: import.meta.env.VITE_API_URL ?? '', appName: 'earshelf', onServerError: (path, status) => reportError(new Error(`${path} returned ${status}`), 'api', { status }) });
export const { apiUrl, accessToken, apiGet, apiPost, apiBlob } = api;
