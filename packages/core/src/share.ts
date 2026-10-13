export type ShareIntent = { kind: 'url'; url: string } | { kind: 'text'; text: string; title?: string };

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const cleanUrl = (s: string): string | null => {
  try { const u = new URL(s.trim().replace(/[.,;)]+$/, '')); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
};

/**
 * Understands what the phone's Share menu, or the browser extension, sent to the app.
 * Android often puts the link inside "text" instead of "url", so both are checked.
 */
export function parseShare(search: string): ShareIntent | null {
  const p = new URLSearchParams(search);
  const direct = p.get('import') ?? p.get('url');
  const text = (p.get('text') ?? '').trim();
  const fromText = URL_RE.exec(text)?.[0];
  const url = cleanUrl(direct ?? '') ?? (fromText ? cleanUrl(fromText) : null);
  if (url && (direct || text.replace(fromText ?? '', '').trim().length < 40)) return { kind: 'url', url };
  if (text.length >= 40) return { kind: 'text', text: text.slice(0, 200_000), title: p.get('title')?.trim() || undefined };
  return null;
}
