/**
 * One shared line in front of the voice engine. Pro listeners go first, Free previews go last, and anyone who has waited
 * too long is served next whatever their plan, so a busy Pro hour can never leave other people waiting for ever.
 */
export type Priority = 'high' | 'normal' | 'low';
const RANK: Record<Priority, number> = { high: 2, normal: 1, low: 0 };

export interface Gate {
  run<T>(priority: Priority, task: () => Promise<T>): Promise<T>;
  stats(): { running: number; waiting: number };
}

export function makeGate(slots: number, opts: { maxWaitMs?: number; now?: () => number } = {}): Gate {
  const maxWait = opts.maxWaitMs ?? 30_000, now = opts.now ?? Date.now;
  const size = Math.max(1, Math.floor(slots) || 1);
  let running = 0;
  const waiting: Array<{ p: Priority; at: number; go: () => void }> = [];

  const pump = () => {
    while (running < size && waiting.length) {
      const t = now();
      let pick = waiting.findIndex((w) => t - w.at >= maxWait); // the oldest overdue person first (the list is in arrival order)
      if (pick < 0) { pick = 0; for (let i = 1; i < waiting.length; i++) if (RANK[waiting[i].p] > RANK[waiting[pick].p]) pick = i; }
      const [w] = waiting.splice(pick, 1);
      running++;
      w.go();
    }
  };

  return {
    run: <T>(priority: Priority, task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
      waiting.push({ p: priority, at: now(), go: () => { Promise.resolve().then(task).then(resolve, reject).finally(() => { running--; pump(); }); } });
      pump();
    }),
    stats: () => ({ running, waiting: waiting.length }),
  };
}
