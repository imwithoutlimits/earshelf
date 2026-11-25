/**
 * Keeps the lock screen / notification player alive while a PWA is playing, and lets it be controlled from there.
 *
 * Why this exists: a phone shows the playback card (and keeps the page running) only while the page is playing *audible* sound.
 * Whenever a player goes quiet for a few seconds (loading the next part, a pause between passages, switching from one audio file to the next)
 * the browser drops the card and may freeze the page, and then playback stops for good. So a very quiet hum plays under everything
 * for as long as the listener has not paused, and the card stays put through those quiet moments.
 *
 * It is plain TypeScript with no framework, and every browser object can be replaced, so it is tested without a browser.
 */

/** Ten seconds of a 25 Hz hum at about -50 dB, looped. Phones count exact silence as "not playing", but this level cannot be heard.
 *  250 whole cycles, so the loop has no click. Ten seconds because very short clips are not given a notification. */
export function humWav(): ArrayBuffer {
  const rate = 8000, n = rate * 10, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(100 * Math.sin((2 * Math.PI * 25 * i) / rate)), true);
  return buf;
}

/** The few things of a browser this file touches, so a test can stand in for them. */
export interface LockEnv {
  /** Makes the looping hum player. */
  makeHum(): HumPlayer;
  /** Fires when the page becomes visible again (the person unlocked the phone or came back to the app). */
  onVisible(cb: () => void): void;
  session: SessionLike | null;
  now(): number;
}
export interface HumPlayer { play(): Promise<void>; pause(): void; readonly paused: boolean }
export interface SessionLike {
  metadata: unknown; playbackState: string;
  setActionHandler(action: string, handler: ((d: { seekOffset?: number; seekTime?: number }) => void) | null): void;
  setPositionState?(s?: { duration: number; position: number; playbackRate: number }): void;
}

function browserEnv(): LockEnv {
  const w = typeof window !== 'undefined' ? window : undefined;
  return {
    makeHum() {
      const a = new Audio(URL.createObjectURL(new Blob([humWav()], { type: 'audio/wav' })));
      a.loop = true; a.setAttribute('aria-hidden', 'true');
      return a;
    },
    onVisible(cb) { w?.document.addEventListener('visibilitychange', () => { if (w.document.visibilityState === 'visible') cb(); }); },
    session: typeof navigator !== 'undefined' && 'mediaSession' in navigator ? (navigator.mediaSession as unknown as SessionLike) : null,
    now: () => Date.now(),
  };
}

/** The hum on its own. Start it from a tap; stop it when the listener pauses. */
export class Hum {
  private el: HumPlayer | null = null;
  private wanted = false;
  private env: LockEnv;
  constructor(env: LockEnv = browserEnv()) {
    this.env = env;
    // Back from the lock screen or another app: if the phone paused the hum on its own, start it again.
    env.onVisible(() => { if (this.wanted) this.kick(); });
  }
  get running() { return this.wanted; }
  start() { this.wanted = true; this.kick(); }
  stop() { this.wanted = false; this.el?.pause(); }
  private kick() {
    try { this.el ??= this.env.makeHum(); if (this.el.paused) void this.el.play().catch(() => {}); } catch { /* no audio in this browser */ }
  }
}

export interface LockInfo { title: string; artist?: string; album?: string; artwork?: Array<{ src: string; sizes?: string; type?: string }> }
export interface LockHandlers {
  play?: () => void; pause?: () => void; next?: () => void; previous?: () => void;
  /** Seconds. */ seekBackward?: (seconds: number) => void; seekForward?: (seconds: number) => void;
}

/**
 * The lock screen card, shared by everything in an app that makes sound. Several sources may use it (a device voice, a natural voice);
 * whoever started last owns the card, and one source stopping never takes the card away from another.
 */
export class LockScreen {
  private hum: Hum;
  private owner: string | null = null;
  private state: 'playing' | 'paused' = 'paused';
  private lastMeta = '';
  private lastPos = -Infinity;
  private beat: ReturnType<typeof setInterval> | null = null;
  private primeTimer: ReturnType<typeof setTimeout> | null = null;
  private defaults: Partial<LockInfo>;
  private env: LockEnv;

  constructor(defaults: Partial<LockInfo> = {}, env: LockEnv = browserEnv()) {
    this.defaults = defaults;
    this.env = env;
    this.hum = new Hum(env);
  }

  /** Call inside the tap itself, before anything is awaited: phones only let sound start from a real tap. */
  prime() {
    this.hum.start();
    if (this.primeTimer) clearTimeout(this.primeTimer);
    // If nothing takes over (the voice never started), do not leave the hum running.
    this.primeTimer = setTimeout(() => { if (!this.owner) this.hum.stop(); }, 15_000);
  }

  /** A source starts or resumes. Safe to call on every change: the card is only redrawn when the title changes. */
  claim(source: string, info: LockInfo, handlers: LockHandlers) {
    if (this.primeTimer) { clearTimeout(this.primeTimer); this.primeTimer = null; }
    const switched = this.owner !== source;
    this.owner = source;
    this.state = 'playing';
    this.hum.start();
    const s = this.env.session;
    if (s) {
      try {
        const meta = `${source}|${info.title}|${info.artist ?? ''}|${info.album ?? ''}`;
        if (meta !== this.lastMeta && typeof MediaMetadata !== 'undefined') {
          this.lastMeta = meta;
          s.metadata = new MediaMetadata({ title: info.title, artist: info.artist ?? this.defaults.artist ?? '', album: info.album ?? this.defaults.album ?? '', artwork: info.artwork ?? this.defaults.artwork ?? [] });
        }
        if (switched) this.bind(s, handlers);
        s.playbackState = 'playing';
      } catch { /* a browser without media controls must never stop playback */ }
    }
    this.startBeat();
  }

  /** The sound is quiet on purpose or while waiting (next part loading, a pause between passages). The card stays and the hum keeps playing. */
  waiting(source: string) { if (this.owner === source) { this.state = 'playing'; this.hum.start(); this.assert(); } }

  /** The listener paused. The card stays so they can resume, but nothing plays. */
  paused(source: string) {
    if (this.owner !== source) return;
    this.state = 'paused'; this.hum.stop(); this.stopBeat(); this.assert();
  }

  /** The source finished or was stopped. Only the current owner can remove the card. */
  release(source: string) {
    if (this.owner !== source) return;
    this.owner = null; this.state = 'paused'; this.lastMeta = '';
    this.hum.stop(); this.stopBeat();
    const s = this.env.session;
    if (!s) return;
    try {
      s.playbackState = 'none'; s.metadata = null;
      for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto', 'stop']) { try { s.setActionHandler(a, null); } catch { /* unsupported */ } }
      s.setPositionState?.();
    } catch { /* ignore */ }
  }

  /** The progress bar on the lock screen. At most once a second. */
  position(source: string, p: { duration: number; position: number; rate?: number }) {
    if (this.owner !== source || !this.env.session?.setPositionState) return;
    const t = this.env.now();
    if (t - this.lastPos < 1000) return;
    this.lastPos = t;
    if (!(p.duration > 0) || !Number.isFinite(p.duration)) return;
    try { this.env.session.setPositionState({ duration: p.duration, position: Math.min(p.duration, Math.max(0, p.position)), playbackRate: p.rate || 1 }); } catch { /* ignore */ }
  }

  get ownerId() { return this.owner; }
  get humRunning() { return this.hum.running; }

  private bind(s: SessionLike, h: LockHandlers) {
    const set = (a: string, fn: ((d: { seekOffset?: number; seekTime?: number }) => void) | null) => { try { s.setActionHandler(a, fn); } catch { /* unsupported action */ } };
    set('play', h.play ? () => h.play!() : null);
    set('pause', h.pause ? () => h.pause!() : null);
    set('stop', h.pause ? () => h.pause!() : null);
    set('previoustrack', h.previous ? () => h.previous!() : null);
    set('nexttrack', h.next ? () => h.next!() : null);
    set('seekbackward', h.seekBackward ? (d) => h.seekBackward!(d.seekOffset ?? 15) : null);
    set('seekforward', h.seekForward ? (d) => h.seekForward!(d.seekOffset ?? 15) : null);
  }
  private assert() { try { if (this.env.session && this.owner) this.env.session.playbackState = this.state; } catch { /* ignore */ } }
  /** Every few seconds while playing, say again that this is playing. Some phones forget it after a quiet moment. */
  private startBeat() { if (!this.beat) this.beat = setInterval(() => this.assert(), 8000); (this.beat as unknown as { unref?: () => void }).unref?.(); }
  private stopBeat() { if (this.beat) clearInterval(this.beat); this.beat = null; }
}
