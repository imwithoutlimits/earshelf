import type { DocRecord } from '../db';

/** Documents have no cover image, so each one gets a quiet typographic cover made from its id. The same document always gets the same cover. */
const COVERS: Array<{ bg: string; ink: string; art: 'sun' | 'bars' | 'rings' | 'lines' | 'dots' | 'waves' }> = [
  { bg: '#c9962f', ink: '#1c1a14', art: 'sun' },
  { bg: '#3a444d', ink: '#f1efe8', art: 'bars' },
  { bg: '#27438a', ink: '#eef0fa', art: 'rings' },
  { bg: '#27322f', ink: '#eceee9', art: 'lines' },
  { bg: '#f3f2ec', ink: '#1d1d1b', art: 'dots' },
  { bg: '#6d3d5a', ink: '#f6ecf1', art: 'waves' },
];
// FNV-1a with a final mix, so ids that differ only slightly still get different covers.
const hash = (s: string) => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return h >>> 0; };
export const coverFor = (id: string) => COVERS[hash(id) % COVERS.length];

function Art({ kind, ink, seed }: { kind: (typeof COVERS)[number]['art']; ink: string; seed: number }) {
  switch (kind) {
    case 'sun':
      return <g><circle cx="60" cy="128" r="34" fill={ink} /><rect x="14" y="132" width="92" height="3" fill="#c9962f" /><rect x="14" y="140" width="92" height="3.5" fill={ink} /><rect x="14" y="149" width="92" height="4" fill={ink} /><rect x="14" y="159" width="92" height="4.5" fill={ink} /></g>;
    case 'bars':
      return <g fill={ink} opacity=".92">{[22, 40, 28, 58, 46, 70].map((h, i) => <rect key={i} x={16 + i * 16} y={168 - h} width="9" height={h} />)}<path d="M14 168H106" stroke={ink} strokeWidth="1.5" /></g>;
    case 'rings':
      return <g fill="none" stroke={ink} strokeWidth="1.4">{[34, 26, 18, 10].map((r, i) => <circle key={r} cx="60" cy="118" r={r} opacity={0.5 + i * 0.15} />)}</g>;
    case 'lines':
      return <g fill="none" stroke={ink} strokeWidth="1.1">{[38, 31, 24, 17, 10, 4].map((r, i) => <ellipse key={r} cx="60" cy="120" rx={r + 6} ry={r} opacity={0.4 + i * 0.1} transform={`rotate(${(seed % 5) * 6} 60 120)`} />)}</g>;
    case 'dots':
      return <g>{Array.from({ length: 49 }, (_, i) => { const x = i % 7, y = Math.floor(i / 7); const v = ((seed >> (i % 16)) + x * 3 + y * 5) % 5; return <rect key={i} x={22 + x * 11.5} y={84 + y * 11.5} width="9" height="9" fill={ink} opacity={0.12 + v * 0.2} />; })}</g>;
    case 'waves':
      return <g fill="none" stroke={ink} strokeLinecap="round"><path d="M-4 150 C 30 120, 50 160, 128 100" strokeWidth="9" opacity=".92" /><path d="M-4 168 C 30 138, 50 178, 128 118" strokeWidth="3" opacity=".55" /></g>;
  }
}

export function DocCover({ doc, className = '' }: { doc: Pick<DocRecord, 'id' | 'title' | 'author'>; className?: string }) {
  const c = coverFor(doc.id);
  return (
    <span className={`cover ${className}`} style={{ background: c.bg, color: c.ink }} aria-hidden>
      <svg viewBox="0 0 120 180" preserveAspectRatio="xMidYMid slice" focusable="false"><Art kind={c.art} ink={c.ink} seed={hash(doc.id)} /></svg>
      <span className="cover-title">{doc.title}</span>
    </span>
  );
}
