import Dexie, { Table } from 'dexie';
import { Applicant, Staff, WorkDay, Schedule, Program } from './types';

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
  }
}

export const dbLocal = new AppDatabase();
