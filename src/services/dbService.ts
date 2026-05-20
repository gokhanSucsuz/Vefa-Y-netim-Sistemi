import Dexie, { Table } from 'dexie';
import { io } from 'socket.io-client';
import { Applicant, Staff, WorkDay, Schedule, Program, Admin, StaffAssignment } from '../types';
import { useAuthStore } from '../store/useAuthStore';

// local database schema
class VefaDatabase extends Dexie {
  applicants!: Table<Applicant>;
  staff!: Table<Staff>;
  workDays!: Table<WorkDay>;
  schedules!: Table<Schedule>;
  programs!: Table<Program>;
  admins!: Table<Admin>;
  auditLogs!: Table<any>;
  systemUsers!: Table<any>;
  assignments!: Table<StaffAssignment>;
  syncQueue!: Table<{ id?: number; collection: string; action: 'add' | 'update' | 'delete' | 'bulkAdd'; data: any; timestamp: number }>;

  constructor() {
    super('VefaDB');
    this.version(2).stores({
      applicants: '++id, tcNo, name, surname, neighborhood',
      staff: '++id, tcNo, name, surname, googleEmail',
      workDays: '++id, date',
      schedules: '++id, date, programId',
      programs: '++id, status',
      admins: '++id, email',
      auditLogs: '++id, timestamp',
      systemUsers: '++id, email',
      syncQueue: '++id, collection, timestamp'
    });
    this.version(3).stores({
      applicants: '++id, tcNo, name, surname, neighborhood',
      staff: '++id, tcNo, name, surname, googleEmail',
      workDays: '++id, date',
      schedules: '++id, date, programId',
      programs: '++id, status',
      admins: '++id, email',
      auditLogs: '++id, timestamp',
      systemUsers: '++id, email',
      assignments: '++id, staffId, date',
      syncQueue: '++id, collection, timestamp'
    });
  }
}

export const dexieDb = new VefaDatabase();

const API_BASE = window.location.origin + '/api';

async function apiFetch(path: string, options?: RequestInit) {
  options = { ...options, cache: 'no-store' };
  const user = useAuthStore.getState().user;
  const headers: any = {
    'Content-Type': 'application/json',
  };
  if (user && user.role) headers['x-user-role'] = user.role;
  if (user && user.id) headers['x-user-id'] = user.id;
  if (user && user.email) headers['x-user-email'] = user.email;

  // console.log(`fetching: ${API_BASE}${path}`);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include', // Ensure secure cookies are sent to the backend
      headers: {
        ...headers,
        ...options?.headers,
      },
    });

    if (!response.ok) {
       const text = await response.text();
       let errorData;
       try {
         errorData = JSON.parse(text);
       } catch {
         errorData = { error: text };
       }
       const err: any = new Error(errorData.error || `API Hatası: ${response.status}`);
       err.status = response.status;
       err.data = errorData;
       throw err;
    }
    return response.json();
  } catch (error) {
    // If it's a network error, we'll handle it outside
    throw error;
  }
}

// Background sync process
let isSyncing = false;
export async function syncWithServer() {
  if (isSyncing) return;
  
  // Real check for internet: try to fetch a health endpoint or just check online status
  if (!navigator.onLine) return;
  
  isSyncing = true;
  
  try {
    // 1. Process sync queue (push local changes)
    const queue = await dexieDb.syncQueue.orderBy('timestamp').toArray();
    for (const item of queue) {
      try {
        if (item.action === 'add') {
          const res = await apiFetch(`/${item.collection}`, {
            method: 'POST',
            body: JSON.stringify(item.data.item),
          });
          const table = (dexieDb as any)[item.collection === 'workdays' ? 'workDays' : item.collection === 'auditlogs' ? 'auditLogs' : item.collection === 'users' ? 'systemUsers' : item.collection === 'assignments' ? 'assignments' : item.collection];
          if (table) {
             // Since primary keys are immutable in Dexie/IndexedDB, we must retrieve, delete, and add with the new server ID
             const record = await table.get(item.data.localId);
             if (record) {
               await table.delete(item.data.localId);
               await table.add({ ...record, id: res.id });
             } else {
               // Fallback: in case it already exists or was created with string primary key
               await table.update(item.data.localId, { id: res.id });
             }
          }
          // Update any pending sync queue items that still use the localId
          const pendingItems = await dexieDb.syncQueue.where('collection').equals(item.collection).toArray();
          for (const pending of pendingItems) {
            if (pending.timestamp > item.timestamp) {
              let updated = false;
              if ((pending.action === 'update' || pending.action === 'delete') && !pending.data.isBulk && pending.data.id === item.data.localId) {
                pending.data.id = res.id;
                updated = true;
              }
              if (pending.data.isBulk && pending.data.updates) {
                pending.data.updates = pending.data.updates.map((u: any) => {
                  if (u.id === item.data.localId) return { ...u, id: res.id };
                  return u;
                });
                updated = true;
              }
              if (pending.data.isBulk && pending.data.ids) {
                pending.data.ids = pending.data.ids.map((id: string) => id === item.data.localId ? res.id : id);
                updated = true;
              }
              if (updated) {
                await dexieDb.syncQueue.put(pending);
              }
            }
          }
        } else if (item.action === 'bulkAdd') {
          await apiFetch(`/${item.collection}/bulk`, {
            method: 'POST',
            body: JSON.stringify(item.data.items),
          });
        } else if (item.action === 'update') {
          if (item.data.isBulk) {
            await apiFetch(`/${item.collection}/bulk-update`, {
              method: 'PUT',
              body: JSON.stringify(item.data.updates),
            });
          } else {
            await apiFetch(`/${item.collection}/${item.data.id}`, {
              method: 'PUT',
              body: JSON.stringify(item.data.changes),
            });
          }
        } else if (item.action === 'delete') {
          if (item.data.isBulk) {
            await apiFetch(`/${item.collection}/bulk`, {
              method: 'DELETE',
              body: JSON.stringify({ ids: item.data.ids }),
            });
          } else {
            try {
              await apiFetch(`/${item.collection}/${item.data.id}`, {
                method: 'DELETE',
              });
            } catch (e: any) {
              // If already gone (404), that's fine for a delete
              if (e.status !== 404) throw e;
            }
          }
        }
        await dexieDb.syncQueue.delete(item.id!);
      } catch (e: any) {
        // If it's a 404 (Not Found), it means the resource is gone on server
        // We should remove it from the queue to prevent blocking
        if (e.status === 404) {
          console.warn(`Resource not found on server for ${item.collection}, removing from sync queue:`, item.data.id || item.data.localId);
          await dexieDb.syncQueue.delete(item.id!);
          
          // Optionally remove from local DB if it's a persistent 404 on update/delete
          if (item.action === 'update' || item.action === 'delete') {
             const table = (dexieDb as any)[item.collection === 'workdays' ? 'workDays' : item.collection === 'auditlogs' ? 'auditLogs' : item.collection === 'users' ? 'systemUsers' : item.collection === 'assignments' ? 'assignments' : item.collection];
             if (table && item.data.id) {
               await table.delete(item.data.id);
             }
          }
        } else {
          console.warn(`Failed to process sync item for ${item.collection}:`, e);
          // For other errors (network, 500), break and try again later
          break; 
        }
      }
    }

    // 2. Only pull if queue is empty to avoid overwriting unpushed changes
    const remainingQueue = await dexieDb.syncQueue.count();
    if (remainingQueue === 0) {
      const collections = ['applicants', 'staff', 'workdays', 'schedules', 'programs', 'admins', 'auditlogs', 'users', 'assignments'];
      for (const col of collections) {
        try {
          const data = await apiFetch(`/${col}`);
          const dexieCol = col === 'workdays' ? 'workDays' : col === 'auditlogs' ? 'auditLogs' : col === 'users' ? 'systemUsers' : col === 'schedules' ? 'schedules' : col;
          // Use bulkPut to update existing and add new without clearing everything first
          // This is safer than clear() + bulkPut()
          const table = (dexieDb as any)[dexieCol];
          if (table) {
            await table.bulkPut(data);
          }
        } catch (e: any) {
          // If 401/403, stop syncing, user probably logged out or session expired
          if (e.status === 401 || e.status === 403) break;
          console.warn(`Could not sync collection ${col}:`, e);
        }
      }
    }
  } catch (error) {
    console.error("Critical sync error:", error);
  } finally {
    isSyncing = false;
    notifyListeners();
  }
}

// Start sync period
// Run an initial sync
setTimeout(syncWithServer, 100);
setInterval(syncWithServer, 1000 * 60 * 5); // Fallback sync every 5 minutes
window.addEventListener('online', syncWithServer);
window.addEventListener('focus', syncWithServer); // Sync when user comes back to the tab

// Real-time socket connection
const socket = io(window.location.origin);
socket.on('connect', () => {
  console.log('Real-time connection established');
});
socket.on('db_update', (data) => {
  console.log('Remote data change detected:', data);
  syncWithServer();
});
socket.on('disconnect', () => {
  console.log('Real-time connection lost');
});

type Listener = () => void;
const listeners = new Set<Listener>();

let notifyTimeout: NodeJS.Timeout | null = null;
export const notifyListeners = () => {
  if (notifyTimeout) clearTimeout(notifyTimeout);
  notifyTimeout = setTimeout(() => {
    listeners.forEach(listener => listener());
  }, 100);
};

export const subscribeToDbChanges = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

class ApiTable<T extends { id?: string }> {
  collectionName: string;
  dexieTable: Table<T>;

  constructor(collectionName: string, dexieTable: Table<T>) {
    this.collectionName = collectionName;
    this.dexieTable = dexieTable;
  }

  toArray() {
    return this.dexieTable.toArray();
  }

  async add(item: T): Promise<string> {
    const localId = await this.dexieTable.add(item);
    if (navigator.onLine) {
      try {
        const res = await apiFetch(`/${this.collectionName}`, {
          method: 'POST',
          body: JSON.stringify(item),
        });
        // To update local with server ID, since primary keys are immutable in Dexie/IndexedDB,
        // we must retrieve, delete, and add with the new server ID
        const record = await this.dexieTable.get(localId);
        if (record) {
          await this.dexieTable.delete(localId);
          await this.dexieTable.add({ ...record, id: res.id });
        } else {
          // Fallback: in case it already exists or was created with string primary key
          await this.dexieTable.update(localId, { id: res.id } as any);
        }
        notifyListeners();
        return res.id;
      } catch (e) {
        console.warn("Add to server failed, queuing for sync", e);
        await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'add', data: { localId, item }, timestamp: Date.now() });
      }
    } else {
      await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'add', data: { localId, item }, timestamp: Date.now() });
    }
    notifyListeners();
    return localId.toString();
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    const safeChanges = { ...changes };
    delete (safeChanges as any).id;
    // Remove undefined properties which might cause Dexie errors
    Object.keys(safeChanges).forEach(key => {
      if ((safeChanges as any)[key] === undefined) {
        delete (safeChanges as any)[key];
      }
    });

    // Resolve the actual Dexie primary key and the real MongoDB ObjectId
    // A valid MongoDB ObjectId is exactly 24 lowercase hex characters
    const isMongoId = /^[0-9a-f]{24}$/i.test(id);
    let dexiePrimaryKey: any = id;
    let serverIdToUse: string = id;

    if (!isMongoId && !isNaN(Number(id))) {
      // The id is a numeric auto-increment Dexie key
      // Fetch the record to find its real MongoDB ObjectId stored in the 'id' field
      const record = await this.dexieTable.get(Number(id) as any);
      if (record && /^[0-9a-f]{24}$/i.test((record as any).id)) {
        serverIdToUse = (record as any).id;
        dexiePrimaryKey = Number(id);
      }
    }

    // Update Dexie locally
    let updatedCount = await this.dexieTable.update(dexiePrimaryKey, safeChanges as any);
    if (updatedCount === 0 && !isNaN(Number(dexiePrimaryKey))) {
      updatedCount = await this.dexieTable.update(Number(dexiePrimaryKey) as any, safeChanges as any);
    }

    // Send to server using the correct MongoDB ObjectId
    if (navigator.onLine) {
      try {
        await apiFetch(`/${this.collectionName}/${serverIdToUse}`, {
          method: 'PUT',
          body: JSON.stringify(changes),
        });
      } catch (e) {
        console.error(`[dbService] Update failed for ${this.collectionName}/${serverIdToUse}, queuing:`, e);
        await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'update', data: { id: serverIdToUse, changes }, timestamp: Date.now() });
      }
    } else {
      await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'update', data: { id: serverIdToUse, changes }, timestamp: Date.now() });
    }
    notifyListeners();
  }

  async delete(id: string): Promise<void> {
    await this.dexieTable.delete(id);
    if (typeof id === 'string' && !isNaN(Number(id))) await this.dexieTable.delete(Number(id) as any);
    if (typeof id === 'number') await this.dexieTable.delete(String(id) as any);
    
    // Clean up sync queue for this ID to avoid orphaned updates
    await dexieDb.syncQueue
      .where('collection').equals(this.collectionName)
      .filter(item => item.data && (item.data.id === id || item.data.localId === id))
      .delete();

    if (navigator.onLine) {
      try {
        await apiFetch(`/${this.collectionName}/${id}`, {
          method: 'DELETE',
        });
      } catch (e: any) {
        if (e.status === 404) {
          // Already gone, no problem
        } else {
          console.warn("Delete from server failed, queuing for sync", e);
          await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'delete', data: { id }, timestamp: Date.now() });
        }
      }
    } else {
      await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'delete', data: { id }, timestamp: Date.now() });
    }
    notifyListeners();
  }

  async clear(): Promise<void> {
    await this.dexieTable.clear();
    if (navigator.onLine) {
      await apiFetch(`/${this.collectionName}`, { method: 'DELETE' });
    }
    notifyListeners();
  }

  async count(): Promise<number> {
    return this.dexieTable.count();
  }

  async bulkAdd(items: T[]): Promise<void> {
    await this.dexieTable.bulkAdd(items);
    if (navigator.onLine) {
      try {
        await apiFetch(`/${this.collectionName}/bulk`, {
          method: 'POST',
          body: JSON.stringify(items),
        });
        await this.toArray();
      } catch (e) {
        console.warn(`Bulk add to server failed for ${this.collectionName}, queuing`, e);
        await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'bulkAdd', data: { items }, timestamp: Date.now() });
      }
    } else {
      await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'bulkAdd', data: { items }, timestamp: Date.now() });
    }
    notifyListeners();
  }

  async bulkDelete(ids: string[]): Promise<void> {
    await this.dexieTable.bulkDelete(ids as any);
    if (navigator.onLine) {
      try {
        await apiFetch(`/${this.collectionName}/bulk`, {
          method: 'DELETE',
          body: JSON.stringify({ ids }),
        });
      } catch (e) {
        console.warn(`Bulk delete from server failed for ${this.collectionName}, queuing`, e);
        await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'delete', data: { ids, isBulk: true }, timestamp: Date.now() });
      }
    } else {
      await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'delete', data: { ids, isBulk: true }, timestamp: Date.now() });
    }
    notifyListeners();
  }

  async bulkUpdate(updates: { id: string, changes: Partial<T> }[]): Promise<void> {
    for (const u of updates) {
      await this.dexieTable.update(u.id, u.changes as any);
    }
    if (navigator.onLine) {
      try {
        await apiFetch(`/${this.collectionName}/bulk-update`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
      } catch (e) {
        console.warn(`Bulk update to server failed for ${this.collectionName}, queuing`, e);
        await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'update', data: { updates, isBulk: true }, timestamp: Date.now() });
      }
    } else {
      await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'update', data: { updates, isBulk: true }, timestamp: Date.now() });
    }
    notifyListeners();
  }

  async put(item: T): Promise<string> {
    if (item.id) {
      await this.update(item.id, item);
      return item.id;
    } else {
      return await this.add(item);
    }
  }

  where(field: string) {
    return {
      equals: (value: any) => ({
        toArray: () => this.dexieTable.where(field).equals(value).toArray(),
        first: () => this.dexieTable.where(field).equals(value).first(),
        delete: async () => {
             const items = await this.dexieTable.where(field).equals(value).toArray();
             for(const item of items) if(item.id) await this.delete(item.id);
        },
        count: () => this.dexieTable.where(field).equals(value).count()
      }),
      above: (value: any) => ({ 
        toArray: () => this.dexieTable.where(field).above(value).toArray(),
        first: () => this.dexieTable.where(field).above(value).first()
      }),
      aboveOrEqual: (value: any) => ({ 
        toArray: () => this.dexieTable.where(field).aboveOrEqual(value).toArray(),
        first: () => this.dexieTable.where(field).aboveOrEqual(value).first()
      }),
      below: (value: any) => ({ 
        toArray: () => this.dexieTable.where(field).below(value).toArray(),
        first: () => this.dexieTable.where(field).below(value).first()
      }),
      belowOrEqual: (value: any) => ({ 
        toArray: () => this.dexieTable.where(field).belowOrEqual(value).toArray(),
        first: () => this.dexieTable.where(field).belowOrEqual(value).first()
      }),
    };
  }

  orderBy(field: string) {
    return {
      last: async () => {
        const all = await this.dexieTable.orderBy(field).toArray();
        return all[all.length - 1];
      },
      reverse: () => ({
        first: async () => {
            const all = await this.dexieTable.orderBy(field).reverse().toArray();
            return all[0];
        },
        last: async () => {
            const all = await this.dexieTable.orderBy(field).toArray();
            return all[all.length - 1];
        }
      })
    };
  }
}

export const dbService = {
  applicants: new ApiTable<Applicant>('applicants', dexieDb.applicants),
  staff: new ApiTable<Staff>('staff', dexieDb.staff),
  workDays: new ApiTable<WorkDay>('workdays', dexieDb.workDays),
  schedules: new ApiTable<Schedule>('schedules', dexieDb.schedules),
  programs: new ApiTable<Program>('programs', dexieDb.programs),
  admins: new ApiTable<Admin>('admins', dexieDb.admins),
  auditLogs: new ApiTable<any>('auditlogs', dexieDb.auditLogs),
  systemUsers: new ApiTable<any>('users', dexieDb.systemUsers),
  users: new ApiTable<any>('users', dexieDb.systemUsers),
  assignments: new ApiTable<StaffAssignment>('assignments', dexieDb.assignments),
  syncQueue: dexieDb.syncQueue,
  
  transaction: async (mode: string, tables: any, callback: () => Promise<void>) => {
    await callback();
  }
};
