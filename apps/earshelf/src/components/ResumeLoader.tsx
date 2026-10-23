import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { loadIntoPlayer, player, useUtterances } from '../hooks';

/**
 * Loads a book into the player and starts it, without opening the reader. It renders nothing.
 * It uses the same hooks as the reader (voice settings, pronunciations, narration choices), so the book is read exactly as it would be there.
 */
export function ResumeLoader({ docId, onDone }: { docId: string; onDone: (started: boolean) => void }) {
  const doc = useLiveQuery(() => db.docs.get(docId), [docId], null);
  const utterances = useUtterances(doc ?? undefined);
  const ran = useRef(false);
  useEffect(() => {
    if (doc === undefined && !ran.current) { ran.current = true; onDone(false); } // not on this device (yet)
  }, [doc, onDone]);
  useEffect(() => {
    if (!doc || !utterances.length || ran.current) return;
    ran.current = true;
    void (async () => {
      try { await loadIntoPlayer(doc, utterances); await player.play(); onDone(true); } catch { onDone(false); }
    })();
  }, [doc, utterances, onDone]);
  return null;
}
