import type { ReactNode } from 'react';
import { ErrorBoundary as SharedBoundary } from '@wells/ui';
import { reportError } from '../monitor';

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return <SharedBoundary appName="earshelf" onError={(e, where, extra) => reportError(e, where, extra)}>{children}</SharedBoundary>;
}
