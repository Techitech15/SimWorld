// IndexedDB-backed manual save/load (section 8). localStorage's 5MB cap is too
// close for comfort once items and jobs pile up, so IndexedDB is the default.
import type { GameState } from '../core/types';
import { SaveLoadError, createSaveFile, migrateSave } from './saveFile';
import type { SaveFile } from './saveFile';

const DB_NAME = 'simworld';
const DB_VERSION = 1;
const STORE = 'saves';

export const DEFAULT_SLOT = 'slot-1';
/**
 * The autosave lives in its own slot on purpose: overwriting a save the player
 * deliberately made, with one the game made behind their back, is the one thing
 * an autosave must never do.
 */
export const AUTOSAVE_SLOT = 'autosave';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new SaveLoadError('Cannot open IndexedDB.'));
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = body(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function saveGame(state: GameState, slot: string = DEFAULT_SLOT): Promise<SaveFile> {
  // Round-trip through JSON so a non-serialisable value fails here, at save
  // time, instead of silently corrupting the slot.
  const save = JSON.parse(JSON.stringify(createSaveFile(state))) as SaveFile;
  await runTransaction('readwrite', (store) => store.put(save, slot));
  return save;
}

export async function loadGame(slot: string = DEFAULT_SLOT): Promise<GameState> {
  const raw = await runTransaction<SaveFile | undefined>('readonly', (store) => store.get(slot));
  if (!raw) throw new SaveLoadError(`No save found in "${slot}".`);
  return migrateSave(raw).state;
}

export async function hasSave(slot: string = DEFAULT_SLOT): Promise<boolean> {
  const raw = await runTransaction<SaveFile | undefined>('readonly', (store) => store.get(slot));
  return raw !== undefined;
}

export async function deleteSave(slot: string = DEFAULT_SLOT): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(slot));
}

export async function listSaves(): Promise<
  { slot: string; savedAtRealTime: string; tick: number }[]
> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();
    tx.oncomplete = () => {
      db.close();
      const keys = keysRequest.result as string[];
      const values = valuesRequest.result as SaveFile[];
      resolve(
        keys.map((slot, i) => ({
          slot,
          savedAtRealTime: values[i]?.savedAtRealTime ?? '',
          tick: values[i]?.savedAtTick ?? 0,
        })),
      );
    };
    tx.onerror = () => reject(tx.error);
  });
}
