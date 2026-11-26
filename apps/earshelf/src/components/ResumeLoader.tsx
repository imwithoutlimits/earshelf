import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { loadIntoPlayer, player, useDocStyle, useNarration, useUtterances } from '../hooks';
import { registerDocument } from '../serverVoice';

/**
 * Loads a book into the player and starts it, without opening the reader. It renders nothing.
 * It uses the same hooks as the reader (voice settings, pronunciations, narration choices), so the book is read exactly as it would be there.
 */
export function ResumeLoader({ docId, onDone }: { docId: string; onDone: (started: boolean) => void }) {
  const doc = useLiveQuery(() => db.docs.get(docId), [docId], null);
  const utterances = useUtterances(doc ?? undefined);
  const style = useDocStyle(doc?.id); const narr = useNarration();
  const ran = useRef(false);
  useEffect(() => {
    if (doc === undefined && !ran.current) { ran.current = true; onDone(false); } // not on this device (yet)
  }, [doc, onDone]);
  useEffect(() => {
    if (!doc || !utterances.length || ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        // Without this the natural voice never learns which book is playing when it is started from the library, and the phone's voice reads instead.
        await registerDocument(doc, utterances, style.pause, narr);
        await loadIntoPlayer(doc, utterances); await player.play(); onDone(true);
      } catch { onDone(false); }
    })();
  }, [doc, utterances, onDone]);
  return null;
}
