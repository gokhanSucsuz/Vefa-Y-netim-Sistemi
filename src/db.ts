import Dexie, { Table } from 'dexie';
import { Applicant, Staff, WorkDay, Schedule, Program } from './types';
import { triggerAutoBackup } from './lib/autoBackup';

export class AppDatabase extends Dexie {
  applicants!: Table<Applicant, number>;
  staff!: Table<Staff, number>;
  workDays!: Table<WorkDay, number>;
  schedules!: Table<Schedule, number>;
  programs!: Table<Program, number>;

  constructor() {
    super('EdirneSYDV_DB');
    this.version(2).stores({
      applicants: '++id, name, surname, tcNo, neighborhood',
      staff: '++id, name, surname',
      workDays: '++id, date',
      schedules: '++id, date, programId',
      programs: '++id, status, createdAt'
    });

    // Add hooks to all tables to trigger auto-backup on any change
    this.tables.forEach(table => {
      table.hook('creating', () => { triggerAutoBackup(); });
      table.hook('updating', () => { triggerAutoBackup(); });
      table.hook('deleting', () => { triggerAutoBackup(); });
    });
  }
}

export const dbLocal = new AppDatabase();
