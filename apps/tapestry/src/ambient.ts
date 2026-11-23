import { CHORD_SECONDS, chordHz, layersOf, type Soundscape } from '@wells/scripture';

/**
 * Makes the soundscape on the device with the Web Audio API: filtered noise for rain, soft tones for the pad.
 * No audio files, so nothing is downloaded, stored or licensed. Fades in and out so it never starts or stops abruptly.
 */
const LEVEL = 0.6; // the person's volume is a share of this, so even full volume stays gentle under the voice

class Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stoppers: Array<() => void> = [];
  private timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = [];
  private mode: Soundscape = 'off';
  private offTimer: ReturnType<typeof setTimeout> | null = null;
  on = false;

  start(mode: Soundscape, volume: number) {
    if (this.on && this.mode === mode) { this.setVolume(volume); return; }
    this.teardown();
    const AC: typeof AudioContext | undefined = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    try {
      const ctx = (this.ctx ??= new AC());
      void ctx.resume();
      const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      this.master = master; this.mode = mode; this.on = true;
      const { rain, pad } = layersOf(mode);
      if (rain) this.rain(ctx, master);
      if (pad) this.pad(ctx, master);
      master.gain.setTargetAtTime(volume * LEVEL, ctx.currentTime, 1.2); // fade in
    } catch { this.teardown(); }
  }

  setVolume(volume: number) { if (this.ctx && this.master && this.on) this.master.gain.setTargetAtTime(volume * LEVEL, this.ctx.currentTime, 0.25); }

  stop() {
    if (!this.on || !this.ctx || !this.master) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5); // fade out, then clean up
    if (this.offTimer) clearTimeout(this.offTimer);
    this.offTimer = setTimeout(() => { if (!this.on) this.teardown(); }, 2500);
  }

  private teardown() {
    if (this.offTimer) { clearTimeout(this.offTimer); this.offTimer = null; }
    this.timers.forEach((t) => { clearTimeout(t as ReturnType<typeof setTimeout>); clearInterval(t as ReturnType<typeof setInterval>); });
    this.timers = [];
    this.stoppers.forEach((f) => { try { f(); } catch { /* already stopped */ } });
    this.stoppers = [];
    try { this.master?.disconnect(); } catch { /* ignore */ }
    this.master = null; this.on = false; this.mode = 'off';
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  private rain(ctx: AudioContext, out: AudioNode) {
    // Steady rain: four seconds of soft brown noise on a loop, warmed up with a low-pass filter.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    const g = ctx.createGain(); g.gain.value = 0.9;
    src.connect(hp).connect(lp).connect(g).connect(out); src.start();
    this.stoppers.push(() => src.stop());
    // Now and then a single soft drop.
    const drop = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
    const dd = drop.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / dd.length);
    const next = () => {
      const t = setTimeout(() => {
        if (!this.on) return;
        const s = ctx.createBufferSource(); s.buffer = drop;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 2200; bp.Q.value = 1.2;
        const dg = ctx.createGain(); dg.gain.value = 0.05 + Math.random() * 0.08;
        s.connect(bp).connect(dg).connect(out); s.start();
        next();
      }, 120 + Math.random() * 380);
      this.timers.push(t);
    };
    next();
  }

  private pad(ctx: AudioContext, out: AudioNode) {
    // A slow chord made of four soft tones, gliding to the next chord every sixteen seconds.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.2;
    lp.connect(g).connect(out);
    const oscs = chordHz(0).map((hz, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz; o.detune.value = (i % 2 ? 1 : -1) * 6;
      o.connect(lp); o.start(); return o;
    });
    this.stoppers.push(() => oscs.forEach((o) => o.stop()));
    let chord = 0;
    const t = setInterval(() => {
      if (!this.on) return;
      chord += 1;
      chordHz(chord).forEach((hz, i) => oscs[i].frequency.setTargetAtTime(hz, ctx.currentTime, 3));
    }, CHORD_SECONDS * 1000);
    this.timers.push(t);
  }
}

export const ambient = new Engine();
