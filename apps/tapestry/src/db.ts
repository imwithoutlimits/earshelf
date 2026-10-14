import Dexie, { type Table } from 'dexie';
import { queueOf, settingsOf } from '@wells/offline';

export interface WellRow { id: string; name: string; description: string; kind: 'mine' | 'ai' | 'copy'; sourceId?: string; createdAt: number; updatedAt: number; deleted?: boolean }
export interface ItemRow { id: string; wellId: string; ref: string; position: number; link?: string; note?: string; updatedAt: number }
export interface VerseRow { key: string; tr: string; book: number; chapter: number; verse: number; text: string }
export interface NoteRow { id: string; ref: string; body: string; createdAt: number; updatedAt: number }
export interface BookmarkRow { id: string; ref: string; createdAt: number }
export interface ProgressRow { wellId: string; index: number; updatedAt: number }
export interface MemoRow { ref: string; level: number; confidence: number; reviewAt: number; updatedAt: number }
export interface EventRow { id: string; kind: string; ref: string; day: string; amount: number; at: number; synced: 0 | 1 }
export interface ListenRow { id: string; day: string; at: number; seconds: number; wellName?: string; synced: 0 | 1 }

class TapestryDb extends Dexie {
  wells!: Table<WellRow, string>; items!: Table<ItemRow, string>; verses!: Table<VerseRow, string>; notes!: Table<NoteRow, string>;
  bookmarks!: Table<BookmarkRow, string>; progress!: Table<ProgressRow, string>; memo!: Table<MemoRow, string>;
  events!: Table<EventRow, string>; listens!: Table<ListenRow, string>; settings!: Table<{ key: string; value: unknown }, string>;
  outbox!: Table<{ id?: number; table: string; recordId: string; op: 'put' | 'delete'; createdAt: number }, number>;
  constructor() {
    super('tapestry');
    this.version(1).stores({ wells: 'id,updatedAt', items: 'id,wellId', verses: 'key,[tr+book+chapter]', notes: 'id,ref', bookmarks: 'id,ref', progress: 'wellId', memo: 'ref,reviewAt', events: 'id,day,synced', listens: 'id,day,synced', settings: 'key', outbox: '++id' });
  }
}
export const db = new TapestryDb();
export const { getSetting, setSetting } = settingsOf(db.settings);
export const queue = queueOf(db.outbox);
