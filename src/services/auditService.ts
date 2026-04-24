import { dbService } from '../db';
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
    await dbService.auditLogs.add(log as any);
  } catch (error) {
    console.error('Error logging action:', error);
  }
};
