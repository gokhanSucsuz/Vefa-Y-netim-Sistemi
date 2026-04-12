import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { AuditLog } from '../types';

export const logAction = async (userId: string, userName: string, action: string, details: string) => {
  try {
    const log: Omit<AuditLog, 'id'> = {
      userId,
      userName,
      action,
      details,
      timestamp: new Date().toISOString(),
    };
    await addDoc(collection(db, 'audit_logs'), log);
  } catch (error) {
    console.error('Error logging action:', error);
  }
};
