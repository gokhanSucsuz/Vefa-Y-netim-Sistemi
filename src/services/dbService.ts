import Dexie, { Table } from 'dexie';
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
    this.version(1).stores({
      applicants: '++id, tcNo, name, surname, neighborhood',
      staff: '++id, tcNo, name, surname, googleEmail',
      workDays: '++id, date',
      schedules: '++id, date',
      programs: '++id, status',
      admins: '++id, email',
      auditLogs: '++id, timestamp',
      systemUsers: '++id, email',
      syncQueue: '++id, collection, timestamp'
    });
  }
}

export const dexieDb = new VefaDatabase();

const API_BASE = '/api';

async function apiFetch(path: string, options?: RequestInit) {
  const user = useAuthStore.getState().user;
  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (user) {
    if (user.id) headers['x-user-id'] = user.id;
    if (user.role) headers['x-user-role'] = user.role;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
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
  if (isSyncing || !navigator.onLine) return;
  isSyncing = true;
  
  try {
    // 1. Pull latest data from server to refresh local
    const collections = ['applicants', 'staff', 'workdays', 'schedules', 'programs', 'admins', 'auditlogs', 'users'];
    for (const col of collections) {
      try {
        const data = await apiFetch(`/${col}`);
        const dexieCol = col === 'workdays' ? 'workDays' : col === 'auditlogs' ? 'auditLogs' : col === 'users' ? 'systemUsers' : col === 'schedules' ? 'schedules' : col;
        await (dexieDb as any)[dexieCol].clear();
        await (dexieDb as any)[dexieCol].bulkAdd(data);
      } catch (e) {
        console.warn(`Could not sync collection ${col}:`, e);
      }
    }

    // 2. Push local changes (simplified: we just pull for now as the server is source of truth in this architecture, 
    // but in a real app we'd push queued changes)
    // For this applet, the server is the primary DB. Dexie is for fast reads and offline access.
    
  } finally {
    isSyncing = false;
    notifyListeners();
  }
}

// Start sync period
setInterval(syncWithServer, 30000); // Sync every 30s
window.addEventListener('online', syncWithServer);

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
        await this.dexieTable.bulkAdd(data);
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
        console.warn("Add to server failed, will sync later", e);
      }
    }
    notifyListeners();
    return localId.toString();
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    await this.dexieTable.update(id, changes as any);
    if (navigator.onLine) {
      try {
        await apiFetch(`/${this.collectionName}/${id}`, {
          method: 'PUT',
          body: JSON.stringify(changes),
        });
      } catch (e) {
        console.warn("Update to server failed", e);
      }
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
        console.warn("Delete from server failed", e);
      }
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
        delete: async () => {
             const items = await this.dexieTable.where(field).equals(value).toArray();
             for(const item of items) if(item.id) await this.delete(item.id);
        },
        count: () => this.dexieTable.where(field).equals(value).count()
      }),
      above: (value: any) => ({ toArray: () => this.dexieTable.where(field).above(value).toArray() }),
      aboveOrEqual: (value: any) => ({ toArray: () => this.dexieTable.where(field).aboveOrEqual(value).toArray() }),
      below: (value: any) => ({ toArray: () => this.dexieTable.where(field).below(value).toArray() }),
      belowOrEqual: (value: any) => ({ toArray: () => this.dexieTable.where(field).belowOrEqual(value).toArray() }),
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
  
  transaction: async (mode: string, tables: any, callback: () => Promise<void>) => {
    await callback();
  }
};
