/** Talking to the shared server. Used by every app; the app supplies its own name, address and error reporter. */
export class ApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export interface SessionSource { auth: { getSession(): Promise<{ data: { session: { access_token: string } | null } }> } }
export interface ApiConfig { supabase: SessionSource | null; apiUrl: string; appName: string; onServerError?: (path: string, status: number) => void; fetchImpl?: typeof fetch }

export function makeApi(cfg: ApiConfig) {
  const apiUrl = cfg.apiUrl.replace(/\/$/, '');
  const doFetch = cfg.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  async function accessToken(): Promise<string | null> {
    if (!cfg.supabase) return null;
    const { data } = await cfg.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }
  async function call(path: string, init: RequestInit): Promise<Response> {
    if (!apiUrl) throw new ApiError(0, 'no_api', `The ${cfg.appName} server is not connected yet.`);
    const token = await accessToken();
    if (!token) throw new ApiError(401, 'unauthorized', 'Sign in to use this.');
    let res: Response;
    try { res = await doFetch(`${apiUrl}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } }); }
    catch { throw new ApiError(0, 'network', `Could not reach the ${cfg.appName} server. Check your connection and try again.`); }
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.status >= 500) cfg.onServerError?.(path.split('?')[0], res.status);
      throw new ApiError(res.status, j.error ?? 'error', j.message ?? `Request failed (${res.status}).`);
    }
    return res;
  }
  return {
    apiUrl, accessToken,
    apiGet: async <T,>(path: string) => (await call(path, {})).json() as Promise<T>,
    apiPost: async <T,>(path: string, body: unknown) => (await call(path, { method: 'POST', body: JSON.stringify(body) })).json() as Promise<T>,
    apiBlob: async (path: string, body: unknown) => (await call(path, { method: 'POST', body: JSON.stringify(body) })).blob(),
  };
}
