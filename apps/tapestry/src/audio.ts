import { useSyncExternalStore } from 'react';
import { logListen } from './activity';
import { setProgress } from './data';

export interface QItem { key: string; title: string; text: string; wellId?: string; wellName?: string; index?: number }
export interface PlayerState { queue: QItem[]; index: number; playing: boolean; waiting: boolean; elapsed: number; total: number; progress: number; charPos: number; rate: number; silence: boolean; repeat: 'off' | 'one' | 'all'; shuffle: boolean; sleepAt: number | null; voiceless: boolean }
const wpm = (rate: number) => 2.5 * rate; // words per second at normal speed, a gentle pace for Scripture
const words = (t: string) => Math.max(1, t.trim().split(/\s+/).length);

class Player {
  s: PlayerState = { queue: [], index: 0, playing: false, waiting: false, elapsed: 0, total: 0, progress: 0, charPos: 0, rate: 0.9, silence: true, repeat: 'off', shuffle: false, sleepAt: null, voiceless: false };
  private subs = new Set<() => void>(); private timer: ReturnType<typeof setInterval> | null = null; private gap: ReturnType<typeof setTimeout> | null = null;
  private pendingSec = 0; private startChar = 0; private token = 0; private sinceFlush = 0;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get = () => this.s;
  private set(p: Partial<PlayerState>) { this.s = { ...this.s, ...p }; this.subs.forEach((f) => f()); }
  get item(): QItem | undefined { return this.s.queue[this.s.index]; }

  play(queue: QItem[], index = 0) { this.stopAll(); this.set({ queue, index, elapsed: 0, charPos: 0, progress: 0 }); this.start(0); }
  private start(fromChar: number) {
    const it = this.item; if (!it) return; const my = ++this.token; this.startChar = fromChar;
    const total = words(it.text) / wpm(this.s.rate); const frac = fromChar / Math.max(1, it.text.length);
    this.set({ playing: true, waiting: false, total, elapsed: total * frac, charPos: fromChar, progress: frac });
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
      synth.cancel(); const u = new SpeechSynthesisUtterance(it.text.slice(fromChar)); u.rate = this.s.rate; u.lang = 'en-US';
      const v = synth.getVoices().find((x) => /en[-_]US/i.test(x.lang) && /natural|google|samantha|aria|jenny/i.test(x.name)) ?? synth.getVoices().find((x) => /^en/i.test(x.lang)); if (v) u.voice = v;
      u.onboundary = (e) => { if (my === this.token) { const c = fromChar + e.charIndex; this.set({ charPos: c, progress: c / it.text.length }); } };
      u.onend = () => { if (my === this.token) this.finished(); }; u.onerror = () => { if (my === this.token) this.set({ voiceless: true }); };
      synth.speak(u); this.set({ voiceless: false });
    } else this.set({ voiceless: true });
    this.tick(my);
  }
  private tick(my: number) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (my !== this.token || !this.s.playing) return;
      this.pendingSec += 0.25; this.sinceFlush += 0.25;
      const e = this.s.elapsed + 0.25; const p = this.s.voiceless ? Math.min(1, e / this.s.total) : this.s.progress;
      this.set({ elapsed: e, progress: p, charPos: this.s.voiceless ? Math.round(p * (this.item?.text.length ?? 0)) : this.s.charPos });
      if (this.s.voiceless && p >= 1) this.finished();
      if (this.s.sleepAt && Date.now() >= this.s.sleepAt) this.pause(true);
      if (this.sinceFlush >= 30) this.flushListen();
    }, 250);
  }
  private flushListen() { const s = Math.floor(this.pendingSec); if (s >= 1) { void logListen(s, this.item?.wellName); this.pendingSec -= s; } this.sinceFlush = 0; }
  private finished() {
    if (this.timer) clearInterval(this.timer); this.flushListen(); const it = this.item;
    if (it?.wellId && it.index !== undefined) void setProgress(it.wellId, it.index + 1);
    const gapMs = this.s.silence ? Math.min(12000, 3000 + words(it?.text ?? '') * 120) : 600; this.set({ waiting: true });
    this.gap = setTimeout(() => this.advance(1, true), gapMs);
  }
  private advance(dir: 1 | -1, auto = false) {
    const { queue, index, repeat, shuffle } = this.s; let next = index + dir;
    if (auto && repeat === 'one') next = index; else if (shuffle && auto) next = Math.floor(Math.random() * queue.length);
    if (next >= queue.length) { if (repeat === 'all') next = 0; else { this.set({ playing: false, waiting: false, progress: 1 }); return; } }
    if (next < 0) next = 0;
    this.set({ index: next, elapsed: 0 }); this.start(0);
  }
  private stopAll() { this.token++; if (this.timer) clearInterval(this.timer); if (this.gap) clearTimeout(this.gap); if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); this.flushListen(); }
  pause(force = false) { if (!this.s.playing && !force) return; this.token++; if (this.timer) clearInterval(this.timer); if (this.gap) clearTimeout(this.gap); if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); this.flushListen(); this.set({ playing: false, waiting: false, sleepAt: force ? null : this.s.sleepAt }); this.startChar = this.s.charPos; }
  toggle() { if (this.s.playing) this.pause(); else if (this.item) this.start(this.s.progress >= 1 ? 0 : this.startChar); }
  next() { this.stopAll(); this.advance(1); } prev() { this.stopAll(); if (this.s.elapsed > 3) this.start(0); else this.advance(-1); }
  /** Seek by seconds inside the current passage. */
  skip(sec: number) { const it = this.item; if (!it) return; this.token++; if (this.gap) clearTimeout(this.gap); const frac = Math.max(0, Math.min(0.98, (this.s.elapsed + sec) / Math.max(1, this.s.total))); let c = Math.round(frac * it.text.length); while (c > 0 && it.text[c - 1] !== ' ') c--; this.start(c); }
  replaySentence() { const it = this.item; if (!it) return; const upto = it.text.slice(0, this.s.charPos); const c = Math.max(0, Math.max(upto.lastIndexOf('. ', upto.length - 3), upto.lastIndexOf('? '), upto.lastIndexOf('! ')) + 2); this.token++; this.start(c); }
  setRate(r: number) { this.set({ rate: r }); if (this.s.playing) { this.token++; this.start(this.s.charPos); } }
  setSleep(min: number | null) { this.set({ sleepAt: min ? Date.now() + min * 60_000 : null }); }
  setMode(p: Partial<Pick<PlayerState, 'silence' | 'repeat' | 'shuffle'>>) { this.set(p); }
  stop() { this.stopAll(); this.set({ queue: [], index: 0, playing: false, waiting: false, progress: 0, elapsed: 0 }); }
}
export const player = new Player();
export const usePlayer = () => useSyncExternalStore(player.subscribe, player.get);
