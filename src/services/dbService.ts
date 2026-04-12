import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, writeBatch, getDoc, orderBy, limit } from 'firebase/firestore';
import { Applicant, Staff, WorkDay, Schedule, Program } from '../types';

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

class FirestoreTable<T extends { id?: string }> {
  collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  async toArray(): Promise<T[]> {
    const querySnapshot = await getDocs(collection(db, this.collectionName));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as T));
  }

  async add(item: T): Promise<string> {
    const docRef = await addDoc(collection(db, this.collectionName), item);
    notifyListeners();
    return docRef.id;
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    const docRef = doc(db, this.collectionName, id);
    await updateDoc(docRef, changes as any);
    notifyListeners();
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, this.collectionName, id));
    notifyListeners();
  }

  async clear(): Promise<void> {
    const querySnapshot = await getDocs(collection(db, this.collectionName));
    const batch = writeBatch(db);
    querySnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    notifyListeners();
  }

  async count(): Promise<number> {
    const querySnapshot = await getDocs(collection(db, this.collectionName));
    return querySnapshot.size;
  }

  async bulkAdd(items: T[]): Promise<void> {
    if (items.length === 0) return;
    const batch = writeBatch(db);
    items.forEach(item => {
      const docRef = doc(collection(db, this.collectionName));
      batch.set(docRef, item);
    });
    await batch.commit();
    notifyListeners();
  }

  async bulkDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const batch = writeBatch(db);
    ids.forEach(id => {
      const docRef = doc(db, this.collectionName, id);
      batch.delete(docRef);
    });
    await batch.commit();
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
    const createQueryMethods = (op: '<' | '<=' | '==' | '>=' | '>', value: any) => ({
      toArray: async (): Promise<T[]> => {
        const q = query(collection(db, this.collectionName), where(field, op, value));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as T));
      },
      delete: async (): Promise<void> => {
        const q = query(collection(db, this.collectionName), where(field, op, value));
        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);
        querySnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        notifyListeners();
      },
      count: async (): Promise<number> => {
        const q = query(collection(db, this.collectionName), where(field, op, value));
        const querySnapshot = await getDocs(q);
        return querySnapshot.size;
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
        const q = query(collection(db, this.collectionName), orderBy(field, 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return undefined;
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() } as unknown as T;
      },
      reverse: () => ({
        first: async (): Promise<T | undefined> => {
          const q = query(collection(db, this.collectionName), orderBy(field, 'desc'), limit(1));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) return undefined;
          const doc = querySnapshot.docs[0];
          return { id: doc.id, ...doc.data() } as unknown as T;
        },
        last: async (): Promise<T | undefined> => {
          const q = query(collection(db, this.collectionName), orderBy(field, 'asc'), limit(1));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) return undefined;
          const doc = querySnapshot.docs[0];
          return { id: doc.id, ...doc.data() } as unknown as T;
        }
      })
    };
  }
}

export const dbService = {
  applicants: new FirestoreTable<Applicant>('applicants'),
  staff: new FirestoreTable<Staff>('staff'),
  workDays: new FirestoreTable<WorkDay>('workDays'),
  schedules: new FirestoreTable<Schedule>('schedules'),
  programs: new FirestoreTable<Program>('programs'),
  
  transaction: async (mode: string, tables: any, callback: () => Promise<void>) => {
    await callback();
  }
};
