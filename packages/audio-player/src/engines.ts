import type { Utterance } from '../../core/src/model.ts';
import type { AudioChunk } from './tts.ts';

export type EngineEvent =
  | { type: 'utterance'; index: number }
  | { type: 'ended' }
  | { type: 'gap'; index: number }
  | { type: 'error'; message: string };

export interface PlaybackEngine {
  readonly kind: 'speech' | 'audio';
  load(items: Utterance[]): void;
  play(from: number): void;
  pause(): void;
  stop(): void;
  setRate(r: number): void;
  setVolume(v: number): void;
  setVoice(id: string | null): void;
  on(cb: (e: EngineEvent) => void): void;
  /** How far through the current utterance it is, 0 to 1, moving smoothly while it plays. */
  fraction(): number;
  /** A 0 to 1 "how much sound right now" for the moving waveform. It follows the words, not the real audio signal. */
  energy(): number;
}

/** Sentence-by-sentence browser speech. Short utterances avoid Chrome's long-utterance cutoff. */
export class SpeechEngine implements PlaybackEngine {
  readonly kind = 'speech' as const;
  private items: Utterance[] = [];
  private cb: (e: EngineEvent) => void = () => {};
  private rate = 1;
  private volume = 1;
  private voiceURI: string | null = null;
  private token = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lang = 'en';
  private cur = { len: 1, estMs: 1000, startedAt: 0, charAt: 0, charTime: 0, msPerChar: 0, active: false, done: false };
  private lastBoundary = 0;

  static supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
  constructor(lang = 'en') { this.lang = lang; }
  on(cb: (e: EngineEvent) => void) { this.cb = cb; }
  load(items: Utterance[]) { this.stop(); this.items = items; }
  setRate(r: number) { this.rate = r; }
  setVolume(v: number) { this.volume = v; }
  setVoice(id: string | null) { this.voiceURI = id; }

  play(from: number) {
    this.stop();
    const my = ++this.token;
    const speakAt = (i: number) => {
      if (my !== this.token) return;
      if (i >= this.items.length) { this.cb({ type: 'ended' }); return; }
      const u = this.items[i];
      const words = Math.max(1, u.spoken.split(/\s+/).length);
      this.cur = { len: Math.max(1, u.spoken.length), estMs: (words / (2.6 * this.rate)) * 1000, startedAt: 0, charAt: 0, charTime: 0, msPerChar: 0, active: true, done: false };
      this.cb({ type: 'utterance', index: i });
      const ut = new SpeechSynthesisUtterance(u.spoken);
      ut.onstart = () => { this.cur.startedAt = this.cur.charTime = performance.now(); };
      ut.onboundary = (ev) => {
        if (ev.name && ev.name !== 'word') return;
        const now = performance.now();
        this.cur.charAt = ev.charIndex; this.cur.charTime = now; this.lastBoundary = now;
        if (ev.charIndex > 8 && this.cur.startedAt) this.cur.msPerChar = (now - this.cur.startedAt) / ev.charIndex;
      };
      ut.rate = this.rate;
      ut.volume = this.volume;
      ut.lang = this.lang;
      const v = this.voiceURI ? speechSynthesis.getVoices().find((x) => x.voiceURI === this.voiceURI) : undefined;
      if (v) { ut.voice = v; ut.lang = v.lang; }
      ut.onend = () => {
        if (my !== this.token) return;
        this.cur.active = false; this.cur.done = true;
        this.timer = setTimeout(() => speakAt(i + 1), u.pauseAfterMs / this.rate);
      };
      ut.onerror = (ev) => {
        if (my !== this.token) return;
        if (ev.error === 'interrupted' || ev.error === 'canceled') return;
        this.cb({ type: 'error', message: `Your device voice stopped (${ev.error}). Press play to continue.` });
      };
      speechSynthesis.speak(ut);
    };
    speakAt(from);
  }
  fraction(): number {
    const c = this.cur;
    if (c.done) return 1;
    if (!c.active || !c.startedAt) return 0;
    const perChar = c.msPerChar || c.estMs / c.len;
    const chars = c.charAt + (performance.now() - c.charTime) / perChar;
    return Math.min(0.99, Math.max(0, chars / c.len));
  }
  energy(): number {
    if (!this.cur.active || !this.cur.startedAt) return 0;
    return 0.3 + 0.7 * Math.exp(-(performance.now() - this.lastBoundary) / 140);
  }
  /** Pause = cancel and remember position; pause()/resume() are unreliable across mobile browsers. */
  pause() { this.cur.active = false; this.stop(); }
  stop() {
    this.token++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (SpeechEngine.supported()) speechSynthesis.cancel();
  }
}

/** Plays server-generated audio chunks with an <audio> element; survives screen lock and app switching. */
export class AudioChunkEngine implements PlaybackEngine {
  readonly kind = 'audio' as const;
  private el: HTMLAudioElement;
  private chunks: AudioChunk[] = [];
  private items: Utterance[] = [];
  private cb: (e: EngineEvent) => void = () => {};
  private currentUrl = '';
  private lastIndex = -1;

  constructor(el?: HTMLAudioElement) {
    this.el = el ?? new Audio();
    this.el.preload = 'auto';
    this.el.addEventListener('timeupdate', () => this.track());
    this.el.addEventListener('ended', () => this.nextChunk());
    this.el.addEventListener('error', () => this.cb({ type: 'error', message: 'This audio could not be loaded. Check your connection, or switch to the device voice.' }));
  }
  on(cb: (e: EngineEvent) => void) { this.cb = cb; }
  load(items: Utterance[]) { this.items = items; }
  /** Chunks may arrive in any order; they are kept sorted by the first utterance they cover. */
  setChunks(chunks: AudioChunk[]) { this.chunks = [...chunks].sort((a, b) => (a.items[0]?.index ?? 0) - (b.items[0]?.index ?? 0)); }
  setRate(r: number) { this.el.playbackRate = r; }
  setVolume(v: number) { this.el.volume = v; }
  setVoice() {}

  private chunkFor(index: number): AudioChunk | undefined {
    return this.chunks.find((c) => {
      const first = c.items[0]?.index ?? Infinity, last = c.items[c.items.length - 1]?.index ?? -1;
      return index >= first && index <= last;
    });
  }
  /** True when audio exists for this utterance; otherwise the controller falls back to browser speech. */
  covers(index: number) { return !!this.chunkFor(index); }

  play(from: number) {
    const c = this.chunkFor(from);
    if (!c) { this.cb({ type: 'gap', index: from }); return; }
    const startMs = c.items.find((it) => it.index === from)?.startMs ?? 0;
    const start = () => { this.el.currentTime = startMs / 1000; void this.el.play().catch(() => this.cb({ type: 'error', message: 'Playback was blocked. Tap play again.' })); };
    if (this.currentUrl !== c.url) {
      this.currentUrl = c.url;
      this.el.src = c.url;
      this.el.addEventListener('loadedmetadata', start, { once: true });
      this.el.load();
    } else start();
    this.lastIndex = -1;
  }
  private track() {
    const chunk = this.chunks.find((c) => c.url === this.currentUrl);
    if (!chunk) return;
    const t = this.el.currentTime * 1000;
    let idx = chunk.items[0]?.index ?? 0;
    for (const it of chunk.items) { if (it.startMs <= t) idx = it.index; else break; }
    if (idx !== this.lastIndex) { this.lastIndex = idx; this.cb({ type: 'utterance', index: idx }); }
  }
  private nextChunk() {
    const chunk = this.chunks.find((c) => c.url === this.currentUrl);
    const last = chunk?.items[chunk.items.length - 1]?.index ?? -1;
    if (last >= this.items.length - 1) { this.cb({ type: 'ended' }); return; }
    if (this.covers(last + 1)) this.play(last + 1);
    else this.cb({ type: 'gap', index: last + 1 }); // the controller fetches it and continues
  }
  fraction(): number {
    const chunk = this.chunks.find((c) => c.url === this.currentUrl);
    if (!chunk) return 0;
    const t = this.el.currentTime * 1000;
    let k = 0;
    for (let j = 0; j < chunk.items.length; j++) { if (chunk.items[j].startMs <= t) k = j; else break; }
    const start = chunk.items[k]?.startMs ?? 0;
    const end = chunk.items[k + 1]?.startMs ?? chunk.durationMs;
    return end > start ? Math.min(0.99, Math.max(0, (t - start) / (end - start))) : 0;
  }
  energy(): number {
    if (this.el.paused) return 0;
    // Server audio cannot be read from another origin without CORS, so the movement follows the speech rhythm instead of the real signal.
    const slot = Math.floor(this.el.currentTime * 3.4);
    const r = ((Math.sin(slot * 12.9898) * 43758.5453) % 1 + 1) % 1;
    return 0.3 + 0.7 * (0.35 + 0.65 * r) * (0.55 + 0.45 * Math.sin((this.el.currentTime * 3.4 % 1) * Math.PI));
  }
  pause() { this.el.pause(); }
  stop() { this.el.pause(); this.lastIndex = -1; }
}
