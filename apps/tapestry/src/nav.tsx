import { createContext, useContext } from 'react';
export type Overlay = { t: 'well'; id: string } | { t: 'passage'; key: string; wellId?: string } | { t: 'memorize'; key: string } | { t: 'search' } | { t: 'player' };
export interface Nav { go: (o: Overlay) => void; back: () => void; save: (keys: string[]) => void; newWell: () => void; toast: (m: string) => void; tab: (t: 'home' | 'wells' | 'activity' | 'profile') => void }
export const NavCtx = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(NavCtx);
