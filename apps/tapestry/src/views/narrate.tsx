import { useUser } from '@wells/auth';
import { usePrefs } from '../audio';
import { useNav } from '../nav';

/**
 * Which voice the Listen button will use, with a way to change it. The natural voice is chosen once, in Profile, and used everywhere:
 * the player reads every passage and well with it. (It used to live in a section of its own deep inside each passage.)
 */
export function VoiceLine() {
  const prefs = usePrefs(); const user = useUser(); const nav = useNav();
  const text = prefs.mode === 'device' ? 'Reading with this phone’s voice.' : !user ? 'Sign in to hear the natural voice. Until then this phone’s voice reads.' : prefs.style === 'dramatized' ? 'Reading with the natural voice, dramatized.' : 'Reading with the natural voice.';
  return <p className="sm mut" style={{ marginTop: 10 }}>{text} <button type="button" className="link-btn" style={{ minHeight: 0, display: 'inline' }} onClick={() => nav.tab('profile')}>Change voice in Profile</button></p>;
}
