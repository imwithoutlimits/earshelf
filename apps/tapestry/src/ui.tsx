import type { ReactNode } from 'react';
const P: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>, plus: <path d="M12 5v14M5 12h14" />, down: <path d="M6 9l6 6 6-6" />, left: <path d="M15 6l-6 6 6 6" />, right: <path d="M9 6l6 6-6 6" />, x: <path d="M6 6l12 12M18 6L6 18" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />, mark: <path d="M6 4h12v17l-6-4-6 4z" />, note: <path d="M5 4h14v12l-5 5H5zM14 21v-5h5" />, moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  replay: <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" />, back: <><path d="M5 12a7 7 0 1 0 2-5M5 3v4h4" /><text x="12" y="15" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">15</text></>,
  fwd: <><path d="M19 12a7 7 0 1 1-2-5M19 3v4h-4" /><text x="12" y="15" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">30</text></>, next: <path d="M7 5v14l9-7zM19 5v14" />, prev: <path d="M17 5v14l-9-7zM5 5v14" />,
  Home: <path d="M4 11l8-7 8 7v9H4z" />, Wells: <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />, Activity: <path d="M3 12h4l3-7 4 14 3-7h4" />, Profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  shuffle: <path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" />, repeat: <path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" />, up: <path d="M6 15l6-6 6 6" />, trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
};
export function Icon({ n, s = 24, w = 1.75 }: { n: string; s?: number; w?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>;
}
export const PlayGlyph = ({ s = 20 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>;
export const PauseGlyph = ({ s = 20 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>;

/** A well drawn as stars: listened ones filled, today's large, the rest hollow. */
export function Constellation({ n, done, w = 390, h = 84, label }: { n: number; done: number; w?: number; h?: number; label: string }) {
  const k = Math.max(2, Math.min(n, 12)); const pts = Array.from({ length: k }, (_, i) => [24 + (i * (w - 48)) / (k - 1), h / 2 + ((i * 17 + 3) % 5 - 2) * (h / 7) * (i % 2 ? 1 : -1)]);
  const today = Math.min(done, k - 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label} style={{ display: 'block' }}>
      {pts.slice(0, -1).map((p, i) => <line key={i} x1={p[0]} y1={p[1]} x2={pts[i + 1][0]} y2={pts[i + 1][1]} stroke="var(--dot)" strokeWidth=".75" opacity=".6" />)}
      {pts.map((p, i) => i === today ? <circle key={i} cx={p[0]} cy={p[1]} r="7" fill="var(--today)" /> : i < today ? <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="var(--dot)" /> : <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--bg)" stroke="var(--dot)" strokeWidth="1" />)}
    </svg>
  );
}
export function Ring({ done, target }: { done: number; target: number }) {
  const C = 2 * Math.PI * 16;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={`${done} of ${target} days this week`} style={{ flex: 'none' }}>
      <circle cx="22" cy="22" r="16" fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle cx="22" cy="22" r="16" fill="none" stroke="var(--tx)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${C * Math.min(1, done / target)} ${C}`} transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)">{done}/{target}</text>
    </svg>
  );
}
/** Monday to Sunday: each day is a small vertical thread. */
export function Weave({ days, todayIdx }: { days: boolean[]; todayIdx: number }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start' }} role="img" aria-label={`Days listened this week: ${days.filter(Boolean).length}`}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
        <div key={i} className="grow stack" style={{ alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 34, borderRadius: 5, background: days[i] ? 'var(--acc)' : i === todayIdx ? 'none' : 'var(--line)', border: i === todayIdx && !days[i] ? '2px solid var(--acc)' : 0 }} />
          <span className="sm" style={{ fontWeight: i === todayIdx ? 700 : 500, color: i === todayIdx ? 'var(--ink)' : 'var(--mut)' }}>{d}</span>
        </div>
      ))}
    </div>
  );
}
/** Each badge has one more strand than the last. */
export function BadgeArt({ strands, state, progress = 0 }: { strands: number; state: 'earned' | 'next' | 'locked'; progress?: number }) {
  const C = 2 * Math.PI * 34, amp = 3 + strands * 1.5;
  const paths = Array.from({ length: strands }, (_, k) => 'M' + Array.from({ length: 20 }, (_, i) => `${(36 + amp * Math.sin((i / 19) * 2 * Math.PI * 1.25 + (2 * Math.PI * k) / strands)).toFixed(1)} ${(18 + (36 * i) / 19).toFixed(1)}`).join(' L'));
  const stroke = state === 'earned' ? 'var(--fg)' : state === 'next' ? 'var(--ink)' : 'var(--mut)';
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      {state === 'earned' ? <circle cx="36" cy="36" r="34" fill="var(--acc)" /> : <circle cx="36" cy="36" r="34" fill="none" stroke="var(--line)" strokeWidth="2" />}
      {state === 'next' && <circle cx="36" cy="36" r="34" fill="none" stroke="var(--tx)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${C * progress} ${C}`} transform="rotate(-90 36 36)" />}
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />)}
    </svg>
  );
}
export function Waveform({ progress, live, seed = 1 }: { progress: number; live: boolean; seed?: number }) {
  const N = 57, at = Math.floor(progress * N);
  return (
    <div className="wave" aria-hidden="true">
      {Array.from({ length: N }, (_, i) => {
        const h = Math.min(124, Math.round(14 + 70 * Math.abs(Math.sin((i + seed) * 0.7) * Math.cos((i + seed) * 0.23)) + (((i + seed) * 37) % 11) * 3));
        return <i key={i} className={live && i > at && i <= at + 8 ? 'live' : ''} style={{ height: h, background: i <= at ? 'var(--acc)' : 'var(--mut)', opacity: i <= at ? 1 : 0.5, animationDelay: `${(i % 5) * 0.15}s` }} />;
      })}
    </div>
  );
}
export const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) => (
  <div className="seg" role="group" aria-label={label}>{options.map(([v, t]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}</div>
);
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
