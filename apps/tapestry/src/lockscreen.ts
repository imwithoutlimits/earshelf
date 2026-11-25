import { LockScreen } from '@wells/audio-player/src/lockscreen.ts';
import { player } from './audio';

/**
 * The lock screen / notification card for the reading, so listening carries on with the phone in a pocket. A very quiet hum plays under
 * the voice (see packages/audio-player/src/lockscreen.ts): phones drop the card, and may freeze the page, when sound stops for a few seconds,
 * and Tapestry has such moments by design (the silence between passages, the next part of a natural voice being made).
 */
const base = import.meta.env.BASE_URL ?? '/';
export const lock = new LockScreen({
  artist: 'Tapestry', album: 'Tapestry',
  artwork: [
    { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
  ],
});

const OWNER = 'tapestry';

/** Connects the player to the lock screen. Call once at start-up. It runs inside the tap that starts the reading, which phones require. */
export function installLockScreen() {
  player.subscribe(() => {
    const s = player.get();
    const it = s.queue[s.index];
    if (s.playing) {
      lock.claim(OWNER, { title: it?.title ?? 'Scripture', artist: it?.wellName ?? 'Tapestry' }, {
        play: () => { if (!player.get().playing) player.toggle(); },
        pause: () => player.pause(),
        next: () => player.next(),
        previous: () => player.prev(),
        seekBackward: (sec) => player.skip(-sec),
        seekForward: (sec) => player.skip(sec),
      });
      // The quiet moments (silence between passages, the natural voice being made) keep the card and the hum.
      if (s.waiting || s.loading) lock.waiting(OWNER);
      else lock.position(OWNER, { duration: s.total, position: s.elapsed, rate: s.rate });
    } else if (s.queue.length && s.progress < 1) lock.paused(OWNER);
    else lock.release(OWNER);
  });
}
