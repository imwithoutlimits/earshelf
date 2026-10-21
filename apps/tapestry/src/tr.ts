import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_TR, getTranslation, infoOf } from './data';
import type { TranslationInfo } from '@wells/scripture';

/** The translation the person has chosen, kept up to date as they change it. */
export function useTranslation(): TranslationInfo {
  const id = useLiveQuery(() => getTranslation(), [], DEFAULT_TR);
  return infoOf(id);
}
