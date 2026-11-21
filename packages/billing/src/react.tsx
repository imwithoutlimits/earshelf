import { useSyncExternalStore } from 'react';
import type { PlanStore } from './planStore.ts';
import type { PlanInfo } from './trial.ts';

/** The live plan for this app: re-renders when the plan, the trial day count or sign-in changes. */
export const usePlanInfo = (store: PlanStore): PlanInfo => useSyncExternalStore(store.subscribe, store.get, store.get);
/** True when a person is signed in (the free trial and paid plans need an account). */
export const useSignedIn = (store: PlanStore): boolean => useSyncExternalStore(store.subscribe, () => store.uid() !== '', () => false);
