/** Small helpers for reading text aloud with the device's own voice and for waiting. Used by the guided memorization loop. */
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Speaks the text and resolves when it ends. Without a device voice it waits as long as the reading would take. It can never hang. */
export function speakAloud(text: string, rate: number, fallbackMs: number): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { setTimeout(resolve, fallbackMs); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(guard); resolve(); };
    const guard = setTimeout(finish, fallbackMs * 2 + 4000);
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text); u.rate = rate; u.lang = 'en-US';
    const v = synth.getVoices().find((x) => /en[-_]US/i.test(x.lang) && /natural|google|samantha|aria|jenny/i.test(x.name)) ?? synth.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.onend = finish; u.onerror = finish;
    synth.speak(u);
  });
}
export const stopSpeaking = () => { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); };
