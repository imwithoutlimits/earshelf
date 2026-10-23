import type { Utterance } from '../../core/src/model.ts';
import { PlaybackQueue, SleepTimer, type SleepSetting } from './queue.ts';
import { AudioChunkEngine, SpeechEngine, type PlaybackEngine, type EngineEvent } from './engines.ts';
import type { AudioChunk } from './tts.ts';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  status: PlayerStatus;
  documentId: string | null;
  index: number;
  length: number;
  utterance: Utterance | null;
  title: string;
  sectionTitle: string;
  rate: number;
  volume: number;
  engine: 'speech' | 'audio';
  voiceId: string | null;
  sleep: SleepSetting | null;
  error: string | null;
  remainingSeconds: number;
  /** Estimated length of the whole document at the current speed, so a screen can show time played as well as time left. */
  totalSeconds: number;
}

export interface TrackMeta {
  documentId: string;
  title: string;
  author?: string;
  sectionTitles: Record<string, string>;
  /** Pictures for the lock screen and the playback notification. */
  artwork?: Array<{ src: string; sizes?: string; type?: string }>;
}

/**
 * Ten seconds of a 25 Hz hum at about -50 dB, looped. Browsers keep a page alive and show playback controls only for media they count as audible,
 * and they treat exact silence (or a 1% volume of silence) as not playing at all. 25 Hz at this level cannot be heard on a phone or earphones.
 * Ten seconds because very short clips are not given a notification. 250 whole cycles, so the loop has no click.
 */
const KEEP_ALIVE_WAV = (() => {
  const rate = 8000, n = rate * 10, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(100 * Math.sin((2 * Math.PI * 25 * i) / rate)), true);
  return buf;
})();

export class PlayerController {
  private queue = new PlaybackQueue([]);
  private speech = new SpeechEngine();
  private audio: AudioChunkEngine | null = null;
  private engine: PlaybackEngine = this.speech;
  private meta: TrackMeta | null = null;
  private listeners = new Set<() => void>();
  private keepAlive: HTMLAudioElement | null = null;
  private sleepTimer = new SleepTimer(() => this.pause());
  private lastSection = '';
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  onProgress: (documentId: string, index: number, completed: boolean) => void = () => {};
  /** Lets the app fetch server audio before playback starts. If it throws, playback continues with the device voice. */
  beforePlay: ((index: number) => Promise<void>) | null = null;
  private wiredAudio = false;
  private lastMediaKey = '';
  private snap: PlayerState;

  constructor() {
    this.snap = this.build({ status: 'idle', rate: 1, volume: 1, voiceId: null, error: null });
    this.wire(this.speech);
    this.installMediaSession();
  }

  /** Fractional place in the document: the sentence number plus how far through that sentence it is. Read this every frame to animate. */
  getPosition = (): number => (this.queue.length ? this.queue.index + (this.snap.status === 'playing' ? this.engine.fraction() : 0) : 0);
  /** 0 to 1 "sound" level that follows the words, for the moving waveform. Zero when not playing. */
  getLevel = (): number => (this.snap.status === 'playing' ? this.engine.energy() : 0);
  getItems = (): Utterance[] => this.queue.items;

  /**
   * Call from a tap, before anything is awaited. Browsers only let audio and speech start from a real tap,
   * so this wakes both up while the tap is still fresh and the actual playback can start a moment later.
   */
  prime() {
    this.startKeepAlive();
    if (SpeechEngine.supported()) { try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; speechSynthesis.speak(u); } catch { /* not available */ } }
    setTimeout(() => { if (this.snap.status !== 'playing' && this.snap.status !== 'loading') this.stopKeepAlive(); }, 10000);
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;

  private build(p: Pick<PlayerState, 'status' | 'rate' | 'volume' | 'voiceId' | 'error'>): PlayerState {
    const u = this.queue.current ?? null;
    return {
      documentId: this.meta?.documentId ?? null,
      index: this.queue.index,
      length: this.queue.length,
      utterance: u,
      title: this.meta?.title ?? '',
      sectionTitle: u && this.meta ? this.meta.sectionTitles[u.sectionId] ?? '' : '',
      engine: this.engine.kind,
      sleep: this.sleepTimer.setting,
      remainingSeconds: this.queue.remainingSeconds(p.rate),
      totalSeconds: this.queue.totalSeconds(p.rate),
      ...p,
    };
  }
  private set(p: Partial<Pick<PlayerState, 'status' | 'rate' | 'volume' | 'voiceId' | 'error'>>) {
    // Carry over only the settings a caller can change. Everything else (document, index, length, utterance, time left) is read fresh from the queue,
    // so a stale copy of the previous snapshot must not be spread over it.
    const { status, rate, volume, voiceId, error } = { ...this.snap, ...p };
    this.snap = this.build({ status, rate, volume, voiceId, error });
    this.listeners.forEach((l) => l());
    this.syncMediaSession();
  }

  private wire(e: PlaybackEngine) {
    e.on((ev: EngineEvent) => {
      if (ev.type === 'utterance') {
        this.queue.setIndex(ev.index);
        const sid = this.queue.current?.sectionId ?? '';
        if (this.lastSection && sid !== this.lastSection) this.sleepTimer.sectionChanged();
        this.lastSection = sid;
        this.set({});
        this.scheduleProgress(false);
      } else if (ev.type === 'gap') {
        this.queue.setIndex(ev.index);
        void this.play();
      } else if (ev.type === 'ended') {
        this.set({ status: 'idle' });
        this.stopKeepAlive();
        if (this.meta) this.onProgress(this.meta.documentId, this.queue.index, true);
      } else {
        this.set({ status: 'error', error: ev.message });
        this.stopKeepAlive();
      }
    });
  }

  private scheduleProgress(now: boolean) {
    if (!this.meta) return;
    const send = () => this.meta && this.onProgress(this.meta.documentId, this.queue.index, false);
    if (now) { if (this.progressTimer) clearTimeout(this.progressTimer); this.progressTimer = null; send(); return; }
    if (this.progressTimer) return;
    this.progressTimer = setTimeout(() => { this.progressTimer = null; send(); }, 1500);
  }

  private ensureAudio(): AudioChunkEngine {
    if (!this.audio) this.audio = new AudioChunkEngine();
    if (!this.wiredAudio) { this.wire(this.audio); this.wiredAudio = true; }
    return this.audio;
  }

  /** Replaces the set of ready audio chunks for the loaded document. */
  setChunks(chunks: AudioChunk[]) {
    if (!chunks.length && !this.audio) return;
    const a = this.ensureAudio();
    a.load(this.queue.items);
    a.setChunks(chunks);
  }

  load(meta: TrackMeta, items: Utterance[], startIndex = 0) {
    this.pause();
    this.meta = meta;
    this.queue = new PlaybackQueue(items, startIndex);
    this.speech.load(items);
    this.audio?.load(items);
    this.audio?.setChunks([]);
    this.lastSection = items[startIndex]?.sectionId ?? '';
    this.engine = this.speech;
    this.set({ status: 'paused', error: null });
  }

  private pick(index: number): PlaybackEngine {
    if (this.audio?.covers(index)) return this.audio;
    return this.speech;
  }
  private applyEngineSettings(e: PlaybackEngine) {
    e.setRate(this.snap.rate);
    e.setVolume(this.snap.volume);
    e.setVoice(this.snap.voiceId);
  }

  async play() {
    if (!this.queue.length) return;
    const i = this.queue.index;
    let notice: string | null = null;
    if (this.beforePlay) {
      this.set({ status: 'loading', error: null });
      try { await this.beforePlay(i); }
      catch (e) { notice = `${e instanceof Error ? e.message : 'Natural voice is unavailable.'} Using the device voice for now.`; }
      if (this.snap.status !== 'loading') return; // the listener paused or moved on while audio was loading
    }
    const idx = this.queue.index;
    const next = this.pick(idx);
    if (next !== this.engine) { this.engine.stop(); this.engine = next; }
    this.applyEngineSettings(this.engine);
    if (this.engine.kind === 'speech') this.startKeepAlive();
    this.set({ status: 'playing', error: notice });
    this.engine.play(idx);
  }
  pause() {
    this.engine.pause();
    this.stopKeepAlive();
    this.scheduleProgress(true);
    if (this.snap.status === 'playing' || this.snap.status === 'loading') this.set({ status: 'paused' });
  }
  toggle() { if (this.snap.status === 'playing' || this.snap.status === 'loading') this.pause(); else void this.play(); }

  private moveTo(index: number) {
    this.queue.setIndex(index);
    this.set({});
    if (this.snap.status === 'playing') void this.play(); else this.scheduleProgress(true);
  }
  next() { this.moveTo(this.queue.paragraph(1)); }
  previous() { this.moveTo(this.queue.paragraph(-1)); }
  nextSection() { this.moveTo(this.queue.section(1)); }
  previousSection() { this.moveTo(this.queue.section(-1)); }
  back(seconds = 15) { this.moveTo(this.queue.seekSeconds(-seconds, this.snap.rate)); }
  forward(seconds = 30) { this.moveTo(this.queue.seekSeconds(seconds, this.snap.rate)); }
  replaySentence() { this.moveTo(this.queue.index); }
  replayParagraph() { this.moveTo(this.queue.paragraph(0)); }
  skipHeading() { this.moveTo(this.queue.skipHeading()); }
  seekTo(index: number) { this.moveTo(index); }

  setRate(r: number) {
    const rate = Math.min(3, Math.max(0.5, r));
    this.engine.setRate(rate);
    this.set({ rate });
    if (this.snap.status === 'playing' && this.engine.kind === 'speech') void this.play(); // apply to next sentence immediately
  }
  setVolume(v: number) { const volume = Math.min(1, Math.max(0, v)); this.engine.setVolume(volume); this.set({ volume }); }
  setVoice(id: string | null) { this.speech.setVoice(id); this.set({ voiceId: id }); }
  setSleep(s: SleepSetting | null) { if (s) this.sleepTimer.start(s); else this.sleepTimer.cancel(); this.set({}); }
  sleepRemainingMs() { return this.sleepTimer.remainingMs(); }

  private startKeepAlive() {
    if (typeof Audio === 'undefined') return;
    if (!this.keepAlive) {
      this.keepAlive = new Audio(URL.createObjectURL(new Blob([KEEP_ALIVE_WAV], { type: 'audio/wav' })));
      this.keepAlive.loop = true;
      this.keepAlive.setAttribute('aria-hidden', 'true');
    }
    void this.keepAlive.play().catch(() => {});
  }
  private stopKeepAlive() { this.keepAlive?.pause(); }

  private installMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler) => { try { ms.setActionHandler(a, h); } catch { /* unsupported action */ } };
    set('play', () => { void this.play(); });
    set('pause', () => this.pause());
    set('previoustrack', () => this.previous());
    set('nexttrack', () => this.nextSection());
    set('seekbackward', (d) => this.back(d.seekOffset ?? 15));
    set('seekforward', (d) => this.forward(d.seekOffset ?? 30));
    set('seekto', (d) => {
      if (typeof d.seekTime !== 'number') return;
      const elapsed = Math.max(0, this.snap.totalSeconds - this.snap.remainingSeconds);
      this.moveTo(this.queue.seekSeconds(d.seekTime - elapsed, this.snap.rate));
    });
    set('stop', () => this.pause());
  }
  private syncMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !this.meta) return;
    const ms = navigator.mediaSession;
    try {
      const title = this.snap.sectionTitle || this.meta.title, key = `${this.meta.documentId}|${title}`;
      if (key !== this.lastMediaKey) { // only when it changes, so the notification does not redraw on every sentence
        this.lastMediaKey = key;
        ms.metadata = new MediaMetadata({ title, artist: this.meta.author ?? 'earshelf', album: this.meta.title, artwork: this.meta.artwork ?? [] });
      }
      ms.playbackState = this.snap.status === 'playing' || this.snap.status === 'loading' ? 'playing' : this.snap.status === 'paused' ? 'paused' : 'none';
      const duration = this.snap.totalSeconds;
      if (duration > 0 && 'setPositionState' in ms) {
        const position = Math.min(duration, Math.max(0, duration - this.snap.remainingSeconds));
        ms.setPositionState({ duration, position, playbackRate: this.snap.rate });
      }
    } catch { /* an unsupported browser should never stop playback */ }
  }
}
