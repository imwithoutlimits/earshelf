import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { player, usePlayer } from './audio';

/**
 * A strip of bars, one per spoken word, that scrolls past a fixed playhead as the words are spoken: the same moving wave as in Earshelf.
 * Position comes from the player every frame (word boundaries for the phone's voice, the audio clock for the natural voice), so it moves with
 * every word. The swell around the playhead follows the speech rhythm; browsers do not let a page read the real audio of a voice,
 * so this is a picture of the speech, not a measurement of it.
 */
const PITCH = 7;        // px between bars
const BEFORE = 60;      // words kept to the left of the playhead
const AFTER = 140;      // and to the right
const PLAYHEAD = 0.3;   // where the playhead sits across the strip
const hash = (n: number) => { let h = (n + 1) * 2654435761; h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };

export function LiveWave({ text, height = 64 }: { text: string; height?: number }) {
  const s = usePlayer();
  const wrap = useRef<HTMLDivElement>(null); const strip = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState(0); const winRef = useRef(0); const lastCw = useRef(-1);
  // Where each word starts in the text, so a character position can be turned into a word position.
  const words = useMemo(() => { const out: Array<{ start: number; len: number }> = []; const re = /\S+/g; let m: RegExpExecArray | null; while ((m = re.exec(text))) out.push({ start: m.index, len: m[0].length }); return out; }, [text]);
  const total = words.length;
  const wordPos = (c: number) => { if (!total) return 0; let lo = 0, hi = total - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (words[mid].start <= c) lo = mid; else hi = mid - 1; } const w = words[lo]; return lo + Math.min(1, Math.max(0, (c - w.start) / (w.len + 1))); };
  const bars = useMemo(() => Array.from({ length: Math.max(0, Math.min(total, win + BEFORE + AFTER) - win) }, (_, i) => { const k = win + i; return { k, h: Math.round(height * (0.16 + 0.84 * Math.min(1, (words[k].len / 9) * (0.55 + 0.45 * hash(k))))) }; }), [win, total, words, height]);
  useEffect(() => { winRef.current = win; lastCw.current = -1; }, [win]);
  useEffect(() => { setWin(0); }, [text]);

  useEffect(() => {
    const el = strip.current, box = wrap.current; if (!el || !box || !total) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const kids = () => el.children as HTMLCollectionOf<HTMLElement>;
    const paint = () => {
      const wp = wordPos(player.getCharPos()); const base = winRef.current;
      if (wp - base > BEFORE + AFTER * 0.55 || (wp < base && base > 0)) { setWin(Math.max(0, Math.floor(wp) - BEFORE)); return; } // re-centre the window of bars near its edges
      const shown = reduce ? Math.floor(wp) : wp;
      el.style.transform = `translate3d(${box.clientWidth * PLAYHEAD - (shown - base) * PITCH}px,0,0)`;
      const cw = Math.floor(wp) - base, list = kids();
      if (cw !== lastCw.current) {
        const from = Math.min(Math.max(lastCw.current, 0), cw), to = Math.max(lastCw.current, cw);
        const scan = lastCw.current < 0 || Math.abs(cw - lastCw.current) > 30 ? [0, list.length - 1] : [Math.max(0, from - 1), Math.min(list.length - 1, to + 1)];
        for (let i = scan[0]; i <= scan[1]; i++) { const b = list[i]; if (b) b.className = i < cw ? 'played' : i === cw ? 'current' : ''; }
        lastCw.current = cw;
      }
      if (!reduce) { const e = player.getLevel(); for (let d = -4; d <= 4; d++) { const b = list[cw + d]; if (b) b.style.transform = e > 0 ? `scaleY(${1 + e * 0.6 * (1 - Math.abs(d) / 5)})` : ''; } }
    };
    const loop = () => { paint(); raf = requestAnimationFrame(loop); };
    if (s.playing) raf = requestAnimationFrame(loop); else paint();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.playing, s.index, text, win, bars]);

  if (!total) return null;
  const seek = (e: MouseEvent) => { // tap a bar to jump to that word
    const t = (e.target as HTMLElement).closest('i[data-k]') as HTMLElement | null; if (!t) return;
    const target = Number(t.dataset.k) / total, now = s.progress; player.skip((target - now) * Math.max(1, s.total));
  };
  return (
    <div ref={wrap} className="livewave" style={{ height }} onClick={seek} role="img" aria-label="Where the voice is in the passage">
      <div ref={strip} className="livewave-strip">{bars.map((b, i) => <i key={b.k} data-k={b.k} style={{ left: i * PITCH, height: b.h, top: (height - b.h) / 2 }} />)}</div>
      <span className="livewave-head" style={{ left: `${PLAYHEAD * 100}%` }} />
    </div>
  );
}
