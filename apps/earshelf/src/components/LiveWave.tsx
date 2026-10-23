import { useEffect, useMemo, useRef, useState } from 'react';
import type { Utterance } from '@wells/core';
import { player, usePlayer } from '../hooks';

/**
 * A strip of bars, one per spoken word, that scrolls past a fixed playhead as the words are spoken.
 * Position comes from the player every frame (word boundaries for device voices, the audio clock for natural voices),
 * so it moves with every word rather than once per sentence. The little swell around the playhead follows the speech rhythm;
 * browsers do not let a page read the real audio of a device voice, so this is a picture of the speech, not a measurement of it.
 */
const PITCH = 7;        // px between bars
const BEFORE = 60;      // words kept to the left of the playhead
const AFTER = 140;      // and to the right
const PLAYHEAD = 0.3;   // where the playhead sits across the strip

const wordsOf = (u: Utterance) => u.text.split(/\s+/).filter(Boolean);
const hash = (n: number) => { let h = (n + 1) * 2654435761; h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };

export function LiveWave({ items, height = 64, className = '' }: { items: Utterance[]; height?: number; className?: string }) {
  const s = usePlayer();
  const wrap = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState(0);
  const winRef = useRef(0);
  const lastCw = useRef(-1);
  const prefix = useMemo(() => { const p = [0]; items.forEach((u) => p.push(p[p.length - 1] + Math.max(1, wordsOf(u).length))); return p; }, [items]);
  const total = prefix[prefix.length - 1];
  const wordCache = useRef(new Map<number, string[]>());
  useEffect(() => { wordCache.current.clear(); }, [items]);

  /** The utterance holding global word k. */
  const utteranceAt = (k: number) => { let lo = 0, hi = items.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (prefix[mid] <= k) lo = mid; else hi = mid - 1; } return lo; };
  const wordLen = (k: number) => {
    const u = utteranceAt(k);
    let w = wordCache.current.get(u);
    if (!w) { w = wordsOf(items[u]); wordCache.current.set(u, w); }
    return (w[k - prefix[u]] ?? 'word').length;
  };
  const wordPos = (pos: number) => { if (!items.length) return 0; const i = Math.min(items.length - 1, Math.max(0, Math.floor(pos))); return prefix[i] + (pos - i) * (prefix[i + 1] - prefix[i]); };

  const bars = useMemo(() => {
    const out: Array<{ k: number; h: number }> = [];
    for (let k = win; k < Math.min(total, win + BEFORE + AFTER); k++) out.push({ k, h: Math.round(height * (0.16 + 0.84 * Math.min(1, (wordLen(k) / 9) * (0.55 + 0.45 * hash(k)))) ) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, total, items, height]);

  useEffect(() => { winRef.current = win; lastCw.current = -1; }, [win]);

  useEffect(() => {
    const el = strip.current, box = wrap.current;
    if (!el || !box || !items.length) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const kids = () => el.children as HTMLCollectionOf<HTMLElement>;
    const paint = () => {
      const wp = wordPos(player.getPosition());
      const base = winRef.current;
      // Re-centre the window of bars when the playhead gets near its edges.
      if (wp - base > BEFORE + AFTER * 0.55 || (wp < base && base > 0)) { setWin(Math.max(0, Math.floor(wp) - BEFORE)); return; }
      const shown = reduce ? Math.floor(wp) : wp;
      el.style.transform = `translate3d(${box.clientWidth * PLAYHEAD - (shown - base) * PITCH}px,0,0)`;
      const cw = Math.floor(wp) - base, list = kids();
      if (cw !== lastCw.current) {
        const from = Math.min(Math.max(lastCw.current, 0), cw), to = Math.max(lastCw.current, cw);
        const scan = lastCw.current < 0 || Math.abs(cw - lastCw.current) > 30 ? [0, list.length - 1] : [Math.max(0, from - 1), Math.min(list.length - 1, to + 1)];
        for (let i = scan[0]; i <= scan[1]; i++) { const b = list[i]; if (b) b.className = i < cw ? 'played' : i === cw ? 'current' : ''; }
        lastCw.current = cw;
      }
      if (!reduce) {
        const e = player.getLevel();
        for (let d = -4; d <= 4; d++) { const b = list[cw + d]; if (b) b.style.transform = e > 0 ? `scaleY(${1 + e * 0.6 * (1 - Math.abs(d) / 5)})` : ''; }
      }
    };
    const loop = () => { paint(); raf = requestAnimationFrame(loop); };
    if (s.status === 'playing') raf = requestAnimationFrame(loop); else paint();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.status, s.index, items, win, bars]);

  if (!items.length) return null;
  const seek = (e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest('i[data-k]') as HTMLElement | null;
    if (t) player.seekTo(utteranceAt(Number(t.dataset.k)));
  };
  return (
    <div ref={wrap} className={`livewave ${className}`} style={{ height }} aria-hidden onClick={seek}>
      <div ref={strip} className="livewave-strip">
        {bars.map((b, i) => <i key={b.k} data-k={b.k} style={{ left: i * PITCH, height: b.h, top: (height - b.h) / 2 }} />)}
      </div>
      <span className="livewave-head" style={{ left: `${PLAYHEAD * 100}%` }} />
    </div>
  );
}
