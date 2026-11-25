import { useSyncExternalStore } from 'react';
import { NARRATION_TRANSLATIONS, charAt, snapToWordStart, verseOffsets } from '@wells/scripture';
import { logListen } from './activity';
import { api, supabase } from './api';
import { getSetting, setSetting } from './db';
import { getTranslation, loadPassage, setProgress } from './data';

export interface QItem { key: string; title: string; text: string; wellId?: string; wellName?: string; index?: number }
export interface PlayerState {
  queue: QItem[]; index: number; playing: boolean; waiting: boolean; elapsed: number; total: number; progress: number; charPos: number; rate: number;
  silence: boolean; repeat: 'off' | 'one' | 'all'; shuffle: boolean; sleepAt: number | null; voiceless: boolean;
  /** Which voice is reading right now. */
  engine: 'device' | 'natural';
  /** The natural voice is being made. */
  loading: boolean;
  /** Why the natural voice is not being used (signed out, daily time used up...). Empty when all is well. */
  note: string;
}
const wpm = (rate: number) => 2.5 * rate; // words per second at normal speed, a gentle pace for Scripture
const words = (t: string) => Math.max(1, t.trim().split(/\s+/).length);

// ---- the person's voice choices, for everything: passages, wells, the player ----
export interface VoicePrefs { mode: 'natural' | 'device'; style: 'single' | 'dramatized'; voice: string }
let prefs: VoicePrefs = { mode: 'natural', style: 'single', voice: '' };
const prefSubs = new Set<() => void>();
export const voicePrefs = (): VoicePrefs => prefs;
export const usePrefs = (): VoicePrefs => useSyncExternalStore((f) => { prefSubs.add(f); return () => { prefSubs.delete(f); }; }, voicePrefs);
/** Kept in memory so a tap can start the voice at once: browsers only allow sound to start inside the tap itself. */
export async function loadVoicePrefs(): Promise<void> {
  const [mode, style, voice, rate] = await Promise.all([getSetting<string>('voiceMode', 'natural'), getSetting<string>('voiceStyle', 'single'), getSetting<string>('voice', ''), getSetting<number>('rate', 0.9)]);
  prefs = { mode: mode === 'device' ? 'device' : 'natural', style: style === 'dramatized' ? 'dramatized' : 'single', voice: typeof voice === 'string' ? voice : '' };
  if (typeof rate === 'number' && rate >= 0.5 && rate <= 2) player.initRate(rate);
  prefSubs.forEach((f) => f());
}
export async function saveVoicePrefs(p: Partial<VoicePrefs>): Promise<void> {
  prefs = { ...prefs, ...p };
  prefSubs.forEach((f) => f());
  await Promise.all([setSetting('voiceMode', prefs.mode), setSetting('voiceStyle', prefs.style), setSetting('voice', prefs.voice)]);
}

// ---- one audio element for every natural-voice part ----
// A phone only lets a page start sound from an element a tap has already unlocked. A new element for each part would work with the screen on
// and then fail at the end of the first part with the screen off, so one element is reused and its source is swapped.
let el: HTMLAudioElement | null = null;
export const sharedAudio = (): HTMLAudioElement => (el ??= new Audio());
const SILENCE = (() => {
  try {
    const n = 1600, b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer);
    const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
  } catch { return ''; }
})();
let unlocked = false;
/** Called inside the tap: plays a moment of silence so the element may play the real audio after the network has answered. */
export function unlockAudio() {
  if (unlocked || !SILENCE) return;
  const a = sharedAudio();
  try { a.src = SILENCE; void a.play().then(() => { unlocked = true; if (a.src === SILENCE) a.pause(); }).catch(() => {}); } catch { /* no audio here */ }
}

interface NPart { chunkIndex: number; chunkCount: number; durationMs: number; url: string; verses: Array<{ n: number; startMs: number }> }
interface Nat { my: number; key: string; trId: string; style: 'single' | 'dramatized'; voice: string; text: string; offsets: Map<number, { start: number; len: number }> | null; parts: Map<number, Promise<NPart>>; known: number[]; count: number; i: number; part: NPart | null }

/** A short sentence for each reason the natural voice could not be used. The reading carries on in the phone's own voice. */
function whyNot(e: unknown): string {
  const code = (e as { code?: string })?.code, status = (e as { status?: number })?.status;
  if (code === 'signed_out') return 'Sign in to use the natural voice. Reading with this phone’s voice for now.';
  if (code === 'limit_reached' || status === 429) return 'Today’s free natural voice time is used up, so this phone’s voice is reading. It resets tomorrow, and Plus has much more.';
  if (code === 'not_narratable') return 'Natural voices read the World English Bible, King James Version and American Standard Version. Reading with this phone’s voice.';
  if (status === 503) return 'The natural voice is not available right now. Reading with this phone’s voice.';
  return 'The natural voice could not be reached. Reading with this phone’s voice.';
}
const fail = (code: string, message = code) => Object.assign(new Error(message), { code });

class Player {
  s: PlayerState = { queue: [], index: 0, playing: false, waiting: false, elapsed: 0, total: 0, progress: 0, charPos: 0, rate: 0.9, silence: true, repeat: 'off', shuffle: false, sleepAt: null, voiceless: false, engine: 'device', loading: false, note: '' };
  private subs = new Set<() => void>(); private timer: ReturnType<typeof setInterval> | null = null; private gap: ReturnType<typeof setTimeout> | null = null;
  private pendingSec = 0; private startChar = 0; private token = 0; private sinceFlush = 0; private lastBoundary = 0; private nat: Nat | null = null; private resumeAdvance = false; private lastTick = 0;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get = () => this.s;
  private set(p: Partial<PlayerState>) { this.s = { ...this.s, ...p }; this.subs.forEach((f) => f()); }
  get item(): QItem | undefined { return this.s.queue[this.s.index]; }
  initRate(r: number) { if (!this.s.playing) this.set({ rate: r }); }

  /** Where the voice is in the text, as a number you can read every frame. The wave moves with it. */
  getCharPos = (): number => {
    if (this.s.engine === 'natural' && this.nat?.part && el && !el.paused) return this.natPos()?.charFloat ?? this.s.charPos;
    return this.s.charPos;
  };
  /** 0 to 1 "how much sound right now". It follows the words: browsers do not let a page read the real audio of a voice. */
  getLevel = (): number => {
    if (!this.s.playing || this.s.waiting || this.s.loading) return 0;
    if (this.s.engine === 'natural') { if (!el || el.paused) return 0; const t = el.currentTime * 3.4; const r = (((Math.sin(Math.floor(t) * 12.9898) * 43758.5453) % 1) + 1) % 1; return 0.3 + 0.7 * (0.35 + 0.65 * r) * (0.55 + 0.45 * Math.sin((t % 1) * Math.PI)); }
    return 0.3 + 0.7 * Math.exp(-(performance.now() - this.lastBoundary) / 140);
  };

  play(queue: QItem[], index = 0) { this.stopAll(); this.set({ queue, index, elapsed: 0, charPos: 0, progress: 0, note: '' }); this.start(0); }

  // ---- starting a passage: the natural voice when chosen and possible, otherwise the phone's own ----
  private start(fromChar: number) {
    const it = this.item; if (!it) return; const my = ++this.token; this.startChar = fromChar; this.resumeAdvance = false;
    const total = words(it.text) / wpm(this.s.rate); const frac = fromChar / Math.max(1, it.text.length);
    const natural = prefs.mode === 'natural';
    this.set({ playing: true, waiting: false, total, elapsed: total * frac, charPos: fromChar, progress: frac, engine: natural ? 'natural' : 'device', loading: natural, note: natural ? this.s.note : '' });
    if (!natural) { this.startDevice(it, fromChar, my); return; }
    unlockAudio(); // inside the tap
    void this.startNatural(it, my).catch((e) => {
      if (my !== this.token) return;
      el?.pause(); this.nat = null;
      this.set({ engine: 'device', loading: false, note: whyNot(e) });
      this.startDevice(it, 0, my);
    });
  }
  private startDevice(it: QItem, fromChar: number, my: number) {
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
      synth.cancel(); const u = new SpeechSynthesisUtterance(it.text.slice(fromChar)); u.rate = this.s.rate; u.lang = 'en-US';
      const v = synth.getVoices().find((x) => /en[-_]US/i.test(x.lang) && /natural|google|samantha|aria|jenny/i.test(x.name)) ?? synth.getVoices().find((x) => /^en/i.test(x.lang)); if (v) u.voice = v;
      u.onboundary = (e) => { if (my === this.token) { const c = fromChar + e.charIndex; this.lastBoundary = performance.now(); this.set({ charPos: c, progress: c / it.text.length }); } };
      u.onend = () => { if (my === this.token) this.finished(); }; u.onerror = () => { if (my === this.token) this.set({ voiceless: true }); };
      synth.speak(u); this.set({ voiceless: false });
    } else this.set({ voiceless: true });
    this.tick(my);
  }

  // ---- the natural voice ----
  private async startNatural(it: QItem, my: number) {
    if (!supabase || !api.apiUrl || !(await supabase.auth.getSession()).data.session) throw fail('signed_out');
    const trId = await getTranslation();
    if (!NARRATION_TRANSLATIONS.includes(trId)) throw fail('not_narratable');
    // Where each verse sits in the text, so the highlight can follow the voice word by word.
    let offsets: Nat['offsets'] = null;
    const p = await loadPassage(it.key, trId).catch(() => null);
    if (p && p.text === it.text) offsets = verseOffsets(p.verses);
    if (my !== this.token) return;
    this.nat = { my, key: it.key, trId, style: prefs.style, voice: prefs.voice, text: it.text, offsets, parts: new Map(), known: [], count: 1, i: 0, part: null };
    await this.playPart(0, my);
  }
  private fetchPart(i: number): Promise<NPart> {
    const n = this.nat!; let p = n.parts.get(i);
    if (!p) {
      const ask = (mode: string) => api.apiPost<NPart>('/v1/tapestry/narrate', { ref: n.key, translation: n.trId, chunk: i, mode, voice: n.voice || undefined });
      p = ask(n.style).catch((e) => { if (n.style === 'dramatized' && (e as { code?: string }).code === 'upgrade_required') { n.style = 'single'; return ask('single'); } throw e; });
      n.parts.set(i, p); p.catch(() => n.parts.delete(i));
    }
    return p;
  }
  private async playPart(i: number, my: number) {
    const n = this.nat; if (!n) return;
    this.set({ loading: true });
    const part = await this.fetchPart(i);
    if (my !== this.token || this.nat !== n) return;
    n.i = i; n.part = part; n.count = part.chunkCount; n.known[i] = part.durationMs;
    const a = sharedAudio(); a.onended = null; a.onerror = null;
    a.src = part.url; a.playbackRate = this.s.rate;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    a.onended = () => { if (my !== this.token) return; if (i + 1 < n.count) void this.playPart(i + 1, my).catch((e) => this.natFailed(e, my)); else this.finished(); };
    a.onerror = () => this.natFailed(fail('audio'), my);
    await a.play();
    if (my !== this.token) return;
    this.set({ playing: true, loading: false, engine: 'natural', note: '' });
    this.tickNatural(my);
    if (i + 1 < n.count) void this.fetchPart(i + 1).catch(() => {}); // the next part is made while this one plays
  }
  private natFailed(e: unknown, my: number) {
    if (my !== this.token) return;
    const it = this.item; if (!it) return;
    const at = this.nat?.part ? this.natPos()?.charPos ?? 0 : 0;
    el?.pause(); this.nat = null;
    this.set({ engine: 'device', loading: false, note: whyNot(e) });
    this.startDevice(it, at, my);
  }
  /** Where the natural voice is: seconds, and the place in the text. Verses give exact times; inside a verse the place is spread over its words. */
  private natPos(): { elapsed: number; total: number; charPos: number; charFloat: number } | null {
    const n = this.nat; if (!n?.part || !el) return null;
    const t = el.currentTime * 1000;
    let before = 0, sum = 0, cnt = 0;
    n.known.forEach((d, i) => { if (d > 0) { sum += d; cnt++; if (i < n.i) before += d; } });
    const total = sum + (n.count - cnt) * (cnt ? sum / cnt : 0);
    const charFloat = charAt(t, n.part, n.offsets, n.text.length, (before + t) / Math.max(1, total));
    const c = snapToWordStart(n.text, charFloat);
    return { elapsed: (before + t) / 1000, total: total / 1000, charPos: c, charFloat };
  }
  private tickNatural(my: number) {
    if (this.timer) clearInterval(this.timer);
    this.lastTick = performance.now();
    this.timer = setInterval(() => {
      if (my !== this.token || !this.s.playing) return;
      const now = performance.now(), dt = (now - this.lastTick) / 1000; this.lastTick = now;
      if (!el || el.paused || this.s.loading) return;
      this.pendingSec += dt; this.sinceFlush += dt;
      const p = this.natPos(); if (p) this.set({ elapsed: p.elapsed, total: p.total, charPos: p.charPos, progress: Math.min(1, p.charPos / Math.max(1, this.nat?.text.length ?? 1)) });
      this.checkSleep(); if (this.sinceFlush >= 30) this.flushListen();
    }, 120);
  }

  private tick(my: number) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (my !== this.token || !this.s.playing) return;
      this.pendingSec += 0.25; this.sinceFlush += 0.25;
      const e = this.s.elapsed + 0.25; const p = this.s.voiceless ? Math.min(1, e / this.s.total) : this.s.progress;
      this.set({ elapsed: e, progress: p, charPos: this.s.voiceless ? Math.round(p * (this.item?.text.length ?? 0)) : this.s.charPos });
      if (this.s.voiceless && p >= 1) this.finished();
      this.checkSleep(); if (this.sinceFlush >= 30) this.flushListen();
    }, 250);
  }
  private checkSleep() { if (this.s.sleepAt && Date.now() >= this.s.sleepAt) this.pause(true); }
  private flushListen() { const s = Math.floor(this.pendingSec); if (s >= 1) { void logListen(s, this.item?.wellName); this.pendingSec -= s; } this.sinceFlush = 0; }
  private finished() {
    if (this.timer) clearInterval(this.timer); this.flushListen(); const it = this.item;
    if (it?.wellId && it.index !== undefined) void setProgress(it.wellId, it.index + 1);
    el?.pause(); this.nat = null;
    const gapMs = this.s.silence ? Math.min(12000, 3000 + words(it?.text ?? '') * 120) : 600; this.set({ waiting: true, loading: false });
    this.gap = setTimeout(() => this.advance(1, true), gapMs);
  }
  private advance(dir: 1 | -1, auto = false) {
    const { queue, index, repeat, shuffle } = this.s; let next = index + dir;
    if (auto && repeat === 'one') next = index; else if (shuffle && auto) next = Math.floor(Math.random() * queue.length);
    if (next >= queue.length) { if (repeat === 'all') next = 0; else { this.set({ playing: false, waiting: false, loading: false, progress: 1 }); return; } }
    if (next < 0) next = 0;
    this.set({ index: next, elapsed: 0 }); this.start(0);
  }
  private stopAll() { this.token++; if (this.timer) clearInterval(this.timer); if (this.gap) clearTimeout(this.gap); if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); el?.pause(); this.nat = null; this.flushListen(); }

  /** Pause keeps the place. The natural voice is paused where it is; the phone's own voice is stopped and restarted from the same word. */
  pause(force = false) {
    if (!this.s.playing && !force) return;
    const natural = this.s.engine === 'natural' && !!this.nat?.part;
    if (this.timer) clearInterval(this.timer); if (this.gap) clearTimeout(this.gap);
    this.resumeAdvance = this.s.waiting;
    if (natural) el?.pause(); else { this.token++; if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); }
    this.flushListen(); this.set({ playing: false, waiting: false, loading: false, sleepAt: force ? null : this.s.sleepAt }); this.startChar = this.s.charPos;
  }
  toggle() {
    if (this.s.playing) { this.pause(); return; }
    if (!this.item) return;
    if (this.resumeAdvance) { this.resumeAdvance = false; this.advance(1); return; }
    if (this.s.engine === 'natural' && this.nat?.part && el && el.src && el.paused) {
      void el.play().then(() => { this.set({ playing: true }); this.tickNatural(this.nat?.my ?? this.token); }).catch(() => this.start(0));
      return;
    }
    this.start(this.s.progress >= 1 ? 0 : this.startChar);
  }
  next() { this.stopAll(); this.advance(1); } prev() { this.stopAll(); if (this.s.elapsed > 3) this.start(0); else this.advance(-1); }

  /** Seek by seconds inside the current passage. */
  skip(sec: number) {
    const it = this.item; if (!it) return;
    if (this.s.engine === 'natural' && this.nat?.part && el) {
      const n = this.nat, t = el.currentTime + sec;
      if (t < 0 && n.i > 0) { const my = ++this.token; void this.playPart(n.i - 1, my).catch((e) => this.natFailed(e, my)); return; }
      el.currentTime = Math.max(0, Math.min(Number.isFinite(el.duration) ? el.duration : t, t)); // past the end moves on to the next part
      const p = this.natPos(); if (p) this.set({ elapsed: p.elapsed, charPos: p.charPos, progress: p.charPos / Math.max(1, it.text.length) });
      return;
    }
    this.token++; if (this.gap) clearTimeout(this.gap); const frac = Math.max(0, Math.min(0.98, (this.s.elapsed + sec) / Math.max(1, this.s.total))); let c = Math.round(frac * it.text.length); while (c > 0 && it.text[c - 1] !== ' ') c--; this.start(c);
  }
  replaySentence() {
    const it = this.item; if (!it) return;
    if (this.s.engine === 'natural' && this.nat?.part && el) {
      const vs = this.nat.part.verses, t = el.currentTime * 1000; let k = 0; for (let i = 0; i < vs.length; i++) if (vs[i].startMs <= t) k = i;
      if (t - vs[k].startMs < 1500 && k > 0) k -= 1;
      el.currentTime = vs[k].startMs / 1000; return;
    }
    const upto = it.text.slice(0, this.s.charPos); const c = Math.max(0, Math.max(upto.lastIndexOf('. ', upto.length - 3), upto.lastIndexOf('? '), upto.lastIndexOf('! ')) + 2); this.token++; this.start(c);
  }
  setRate(r: number) {
    this.set({ rate: r }); void setSetting('rate', r);
    if (this.s.engine === 'natural' && el && this.nat?.part) { el.playbackRate = r; return; } // the voice changes speed at once, without restarting
    if (this.s.playing) { this.token++; this.start(this.s.charPos); }
  }
  /** A number of minutes, or null to switch it off. */
  setSleep(min: number | null) { this.set({ sleepAt: min ? Date.now() + min * 60_000 : null }); }
  setMode(p: Partial<Pick<PlayerState, 'silence' | 'repeat' | 'shuffle'>>) { this.set(p); }
  stop() { this.stopAll(); this.set({ queue: [], index: 0, playing: false, waiting: false, loading: false, progress: 0, elapsed: 0, note: '' }); }
}
export const player = new Player();
export const usePlayer = () => useSyncExternalStore(player.subscribe, player.get);
void loadVoicePrefs().catch(() => {});
