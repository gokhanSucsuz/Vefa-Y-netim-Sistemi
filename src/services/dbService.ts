import { Applicant, Staff, WorkDay, Schedule, Program, Admin } from '../types';

const API_BASE = '/api';

async function apiFetch(path: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Bilinmeyen hata' }));
    throw new Error(error.error || `API hatası: ${response.status}`);
  }
  return response.json();
}

type Listener = () => void;
const listeners = new Set<Listener>();

export const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

export const subscribeToDbChanges = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

class ApiTable<T extends { id?: string }> {
  collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  async toArray(): Promise<T[]> {
    return apiFetch(`/${this.collectionName}`);
  }

  async add(item: T): Promise<string> {
    const res = await apiFetch(`/${this.collectionName}`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
    notifyListeners();
    return res.id;
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    await apiFetch(`/${this.collectionName}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(changes),
    });
    notifyListeners();
  }

  async delete(id: string): Promise<void> {
    await apiFetch(`/${this.collectionName}/${id}`, {
      method: 'DELETE',
    });
    notifyListeners();
  }

  async clear(): Promise<void> {
    await apiFetch(`/${this.collectionName}`, {
      method: 'DELETE',
    });
    notifyListeners();
  }

  async count(): Promise<number> {
    const items = await this.toArray();
    return items.length;
  }

  async bulkAdd(items: T[]): Promise<void> {
    if (items.length === 0) return;
    await apiFetch(`/${this.collectionName}/bulk`, {
      method: 'POST',
      body: JSON.stringify(items),
    });
    notifyListeners();
  }

  async bulkDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.delete(id);
    }
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
    const createQueryMethods = (op: '<' | '<=' | '==' | '>=' | '>', value: any) => ({
      toArray: async (): Promise<T[]> => {
        const all = await this.toArray();
        return all.filter((item: any) => {
          const val = item[field];
          if (op === '==') return val === value;
          if (op === '<') return val < value;
          if (op === '<=') return val <= value;
          if (op === '>') return val > value;
          if (op === '>=') return val >= value;
          return false;
        });
      },
      delete: async (): Promise<void> => {
        const items = await this.where(field).equals(value).toArray();
        for (const item of items) {
          if (item.id) await this.delete(item.id);
        }
      },
      count: async (): Promise<number> => {
        const items = await this.where(field).equals(value).toArray();
        return items.length;
      }
    });

    return {
      equals: (value: any) => createQueryMethods('==', value),
      above: (value: any) => createQueryMethods('>', value),
      aboveOrEqual: (value: any) => createQueryMethods('>=', value),
      below: (value: any) => createQueryMethods('<', value),
      belowOrEqual: (value: any) => createQueryMethods('<=', value),
    };
  }

  orderBy(field: string) {
    return {
      last: async (): Promise<T | undefined> => {
        const all = await this.toArray();
        if (all.length === 0) return undefined;
        return all.sort((a: any, b: any) => (a[field] < b[field] ? -1 : 1)).pop();
      },
      reverse: () => ({
        first: async (): Promise<T | undefined> => {
          const all = await this.toArray();
          if (all.length === 0) return undefined;
          return all.sort((a: any, b: any) => (a[field] > b[field] ? -1 : 1)).shift();
        },
        last: async (): Promise<T | undefined> => {
          const all = await this.toArray();
          if (all.length === 0) return undefined;
          return all.sort((a: any, b: any) => (a[field] < b[field] ? -1 : 1)).pop();
        }
      })
    };
  }
}

export const dbService = {
  applicants: new ApiTable<Applicant>('applicants'),
  staff: new ApiTable<Staff>('staff'),
  workDays: new ApiTable<WorkDay>('workdays'),
  schedules: new ApiTable<Schedule>('schedules'),
  programs: new ApiTable<Program>('programs'),
  admins: new ApiTable<Admin>('admins'),
  auditLogs: new ApiTable<any>('auditlogs'),
  users: new ApiTable<any>('users'),
  
  transaction: async (mode: string, tables: any, callback: () => Promise<void>) => {
    await callback();
  }
};
