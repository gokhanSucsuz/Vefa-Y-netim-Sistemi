import Dexie, { Table } from 'dexie';
import { io } from 'socket.io-client';
import { Applicant, Staff, WorkDay, Schedule, Program, Admin } from '../types';
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
  }
}

export const dexieDb = new VefaDatabase();

const API_BASE = window.location.origin + '/api';

async function apiFetch(path: string, options?: RequestInit) {
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
       throw new Error(text || `API Hatası: ${response.status}`);
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
          const table = (dexieDb as any)[item.collection === 'workdays' ? 'workDays' : item.collection === 'auditlogs' ? 'auditLogs' : item.collection === 'users' ? 'systemUsers' : item.collection];
          if (table) {
             await table.update(item.data.localId, { id: res.id });
          }
        } else if (item.action === 'update') {
          await apiFetch(`/${item.collection}/${item.data.id}`, {
            method: 'PUT',
            body: JSON.stringify(item.data.changes),
          });
        } else if (item.action === 'delete') {
          await apiFetch(`/${item.collection}/${item.data.id}`, {
            method: 'DELETE',
          });
        }
        await dexieDb.syncQueue.delete(item.id!);
      } catch (e) {
        // If it's a server error (4xx, 5xx), maybe we should keep it in queue but for now skip and try next
        console.warn(`Failed to process sync item for ${item.collection}:`, e);
        // Break to avoid hammering the server if it's a network issue
        break; 
      }
    }

    // 2. Only pull if queue is empty to avoid overwriting unpushed changes
    const remainingQueue = await dexieDb.syncQueue.count();
    if (remainingQueue === 0) {
      const collections = ['applicants', 'staff', 'workdays', 'schedules', 'programs', 'admins', 'auditlogs', 'users'];
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
        } catch (e) {
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
// setInterval(syncWithServer, 5000); // 🚨 REMOVED: 5-second polling causes DDoS risk. Socket.io handles real-time updates!
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

  async toArray(): Promise<T[]> {
    try {
      if (navigator.onLine) {
        const data = await apiFetch(`/${this.collectionName}`);
        await this.dexieTable.clear();
        await this.dexieTable.bulkPut(data);
        return data;
      }
    } catch (e) {
      console.warn("Fetch failed, using local data", e);
    }
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
        // Update local with server ID
        await this.dexieTable.update(localId, { id: res.id } as any);
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

    await this.dexieTable.update(id, safeChanges as any);
    if (navigator.onLine) {
      try {
        await apiFetch(`/${this.collectionName}/${id}`, {
          method: 'PUT',
          body: JSON.stringify(changes),
        });
      } catch (e) {
        console.warn("Update to server failed, queuing for sync", e);
        await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'update', data: { id, changes }, timestamp: Date.now() });
      }
    } else {
      await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'update', data: { id, changes }, timestamp: Date.now() });
    }
    notifyListeners();
  }

  async delete(id: string): Promise<void> {
    await this.dexieTable.delete(id);
    if (navigator.onLine) {
      try {
        await apiFetch(`/${this.collectionName}/${id}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.warn("Delete from server failed, queuing for sync", e);
        await dexieDb.syncQueue.add({ collection: this.collectionName, action: 'delete', data: { id }, timestamp: Date.now() });
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
        await apiFetch(`/${this.collectionName}/bulk`, {
          method: 'POST',
          body: JSON.stringify(items),
        });
    }
    notifyListeners();
  }

  async bulkDelete(ids: string[]): Promise<void> {
    await this.dexieTable.bulkDelete(ids as any);
    if (navigator.onLine) {
        await apiFetch(`/${this.collectionName}/bulk`, {
          method: 'DELETE',
          body: JSON.stringify({ ids }),
        });
    }
    notifyListeners();
  }

  async bulkUpdate(updates: { id: string, changes: Partial<T> }[]): Promise<void> {
    for (const u of updates) {
      await this.dexieTable.update(u.id, u.changes as any);
    }
    if (navigator.onLine) {
        await apiFetch(`/${this.collectionName}/bulk-update`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
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
  syncQueue: dexieDb.syncQueue,
  
  transaction: async (mode: string, tables: any, callback: () => Promise<void>) => {
    await callback();
  }
};
