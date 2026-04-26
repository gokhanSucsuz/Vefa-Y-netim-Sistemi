import { dbLocal } from '../db';
import { Schedule, Program, WorkDay } from '../types';
import { format, isAfter, parseISO, addDays, isWeekend } from 'date-fns';

/**
 * Re-aligns all future uncompleted assignments in an active program to the current work day calendar.
 * This is triggered when the work day calendar changes.
 */
export async function reAlignActiveProgramSchedules() {
  const activeProgram = await dbLocal.programs.where('status').equals('active').first();
  if (!activeProgram) return;

  const today = format(new Date(), 'yyyy-MM-dd');
  
  // 1. Get all schedules belonging to this program (using standard filter to avoid index requirements)
  const tempSchedules = await dbLocal.schedules.toArray();
  const allSchedules = tempSchedules.filter(s => s.programId === activeProgram.id!);
  
  // 2. Separate completed and uncompleted assignments
  // We only touch uncompleted assignments from today onwards.
  const completedAssignments = allSchedules.flatMap(s => 
    s.assignments.filter(a => a.isCompleted || s.date < today)
  );

  const uncompletedQueueRaw = allSchedules
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(s => s.assignments.filter(a => !a.isCompleted));

  // 2.5 Identify missing applicants and inject them into uncompletedQueue
  const allApplicantsRaw = await dbLocal.applicants.toArray();
  const allApplicants = allApplicantsRaw.filter(a => !a.isDeleted);
  const priorityMap = new Map(allApplicants.map(a => [a.id, a.priority || 0]));
  
  const assignmentEncounter = new Map<string, number>();
  
  completedAssignments.forEach(a => {
     assignmentEncounter.set(a.applicantId, (assignmentEncounter.get(a.applicantId) || 0) + 1);
  });

  const enrichedUncompleted = uncompletedQueueRaw.map(a => {
     const count = (assignmentEncounter.get(a.applicantId) || 0) + 1;
     assignmentEncounter.set(a.applicantId, count);
     return {
        ...a,
        _cycle: count,
        _priority: priorityMap.get(a.applicantId) || 0
     };
  });

  allApplicants.forEach(app => {
     let count = assignmentEncounter.get(app.id!) || 0;
     while (count < 2) {
        count++;
        enrichedUncompleted.push({
           applicantId: app.id!,
           staffIds: [], 
           isCompleted: false,
           _cycle: count,
           _priority: app.priority || 0
        });
        assignmentEncounter.set(app.id!, count);
     }
  });

  enrichedUncompleted.sort((a, b) => {
     if (a._cycle !== b._cycle) return a._cycle - b._cycle;
     return a._priority - b._priority;
  });

  const uncompletedQueue = enrichedUncompleted.map(a => {
     const { _cycle, _priority, ...rest } = a;
     return rest;
  });

  if (uncompletedQueue.length === 0) return;

  // 3. Clear all uncompleted slots from existing future schedules
  for (const s of allSchedules) {
    if (s.date >= today) {
      const remaining = s.assignments.filter(a => a.isCompleted);
      if (remaining.length === 0) {
        await dbLocal.schedules.delete(s.id!);
      } else {
        await dbLocal.schedules.update(s.id!, { assignments: remaining });
      }
    }
  }

  // 4. Get all explicit work day settings from today onwards
  const explicitWorkSettings = await dbLocal.workDays.where('date').aboveOrEqual(today).toArray();
  const settingsMap = new Map(explicitWorkSettings.map(s => [s.date, s.isWorkDay !== undefined ? s.isWorkDay : false]));

  // We'll look ahead up to 120 days to find enough work days
  const availableDates: string[] = [];
  let checkDate = parseISO(today);
  let daysChecked = 0;
  
  while (availableDates.length < Math.max(uncompletedQueue.length, 60) && daysChecked < 120) {
    const dateStr = format(checkDate, 'yyyy-MM-dd');
    const explicit = settingsMap.get(dateStr);
    
    if (explicit === true) {
      availableDates.push(dateStr);
    } else if (explicit === false) {
      // It's a holiday, skip
    } else {
      // No explicit setting, follow default: Work day if not weekend
      if (!isWeekend(checkDate)) {
        availableDates.push(dateStr);
      }
    }
    checkDate = addDays(checkDate, 1);
    daysChecked++;
  }

  // 5. Re-distribute uncompleted assignments
  const dailyLimit = 6; // Default
  
  // Group by date
  const newSchedules: Map<string, any[]> = new Map();
  
  let dateIdx = 0;
  while (uncompletedQueue.length > 0 && dateIdx < availableDates.length) {
    const targetDate = availableDates[dateIdx];
    const existingSchedule = await dbLocal.schedules.where('date').equals(targetDate).first();
    const completedCount = existingSchedule ? existingSchedule.assignments.filter(a => a.isCompleted).length : 0;
    
    const capacity = dailyLimit - completedCount;
    if (capacity > 0) {
      const assignmentsToAdd = uncompletedQueue.splice(0, capacity);
      if (existingSchedule) {
        await dbLocal.schedules.update(existingSchedule.id!, { 
          assignments: [...existingSchedule.assignments, ...assignmentsToAdd] 
        });
      } else {
        await dbLocal.schedules.add({
          date: targetDate,
          programId: activeProgram.id!,
          assignments: assignmentsToAdd
        });
      }
    }
    dateIdx++;
  }

  // 6. Handle leftovers (if no more work days)
  if (uncompletedQueue.length > 0) {
    console.warn("Leftover assignments after realignment. No more work days defined.");
  }
}
