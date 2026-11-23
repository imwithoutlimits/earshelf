import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { openPlans } from '@wells/ui';

/** A locked-feature line with a way to fix it. */
export function UpgradeNote({ children }: { children: ReactNode }) {
  return <p className="locked"><Lock size={16} /> <span>{children}</span> <button type="button" className="link-btn inline" onClick={openPlans}>See plans</button></p>;
}
