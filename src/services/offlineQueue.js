/**
 * TFG Offline Action Queue & Resilience Engine
 * Stores critical actions in IndexedDB when offline and auto-syncs when online.
 */

const DB_NAME = 'tfg_offline_store';
const DB_VERSION = 1;
const STORE_NAME = 'queued_actions';

const openDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const enqueueOfflineAction = async (type, payload) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        type,
        payload,
        timestamp: Date.now(),
        retries: 0
      };
      const req = store.add(record);
      req.onsuccess = () => {
        resolve({ success: true, queuedId: req.result });
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineQueue] Failed to enqueue:', err);
    return { success: false, error: err.message };
  }
};

export const getPendingActionsCount = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
};

export const processOfflineQueue = async (actionExecutors = {}) => {
  if (!navigator.onLine) return { processed: 0, remaining: 0 };

  try {
    const db = await openDB();
    const actions = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (actions.length === 0) return { processed: 0, remaining: 0 };

    let processedCount = 0;

    for (const action of actions) {
      const executor = actionExecutors[action.type];
      if (typeof executor === 'function') {
        try {
          await executor(action.payload);
          // Action succeeded -> delete from queue
          await new Promise((res) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(action.id);
            tx.oncomplete = () => res();
          });
          processedCount++;
        } catch (execErr) {
          console.warn(`[OfflineQueue] Execution failed for action ${action.id} (${action.type}):`, execErr);
        }
      }
    }

    const remaining = await getPendingActionsCount();
    return { processed: processedCount, remaining };
  } catch (err) {
    console.warn('[OfflineQueue] Sync failed:', err);
    return { processed: 0, remaining: 0 };
  }
};

// Automatic listener when internet connection is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('[OfflineQueue] Network connection restored. Auto-sync triggered.');
    window.dispatchEvent(new CustomEvent('tfg_trigger_offline_sync'));
  });
}
