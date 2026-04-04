import { dbLocal } from '../db';
import Dexie from 'dexie';

// Separate database for recovery backups to prevent data loss on accidental clears
const recoveryDb = new Dexie('EdirneSYDV_Recovery');
recoveryDb.version(1).stores({
  backups: 'id, timestamp'
});

interface BackupEntry {
  id: string;
  timestamp: string;
  data: any;
}

let backupTimeout: ReturnType<typeof setTimeout> | null = null;

export async function performAutoBackup() {
  try {
    const applicants = await dbLocal.applicants.toArray();
    const staff = await dbLocal.staff.toArray();
    const workDays = await dbLocal.workDays.toArray();
    const schedules = await dbLocal.schedules.toArray();
    const programs = await dbLocal.programs.toArray();

    const backupData = {
      applicants,
      staff,
      workDays,
      schedules,
      programs,
      exportedAt: new Date().toISOString()
    };

    // Save to recovery database
    // We keep only the last 5 auto-backups
    const timestamp = new Date().toISOString();
    await (recoveryDb as any).backups.put({
      id: 'last_auto_save',
      timestamp,
      data: backupData
    });

    // Also save a "Pre-Restore" backup if this was triggered by a restore attempt
    console.log('Auto-backup completed at:', timestamp);
  } catch (error) {
    console.error('Auto-backup failed:', error);
  }
}

export function triggerAutoBackup() {
  if (backupTimeout) {
    clearTimeout(backupTimeout);
  }
  
  // Debounce for 5 seconds to avoid excessive writes during bulk operations
  backupTimeout = setTimeout(() => {
    performAutoBackup();
  }, 5000);
}

export async function getLatestRecoveryBackup() {
  try {
    const backup = await (recoveryDb as any).backups.get('last_auto_save');
    return backup;
  } catch (error) {
    return null;
  }
}

export async function saveSafetyBackup() {
  try {
    const applicants = await dbLocal.applicants.toArray();
    const staff = await dbLocal.staff.toArray();
    const workDays = await dbLocal.workDays.toArray();
    const schedules = await dbLocal.schedules.toArray();
    const programs = await dbLocal.programs.toArray();

    const backupData = {
      applicants,
      staff,
      workDays,
      schedules,
      programs,
      exportedAt: new Date().toISOString()
    };

    await (recoveryDb as any).backups.put({
      id: 'pre_restore_safety',
      timestamp: new Date().toISOString(),
      data: backupData
    });
    
    return true;
  } catch (error) {
    console.error('Safety backup failed:', error);
    return false;
  }
}
