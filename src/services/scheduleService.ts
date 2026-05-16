import { dbLocal } from '../db';
import { Schedule, WorkDay } from '../types';
import { format, parseISO, addDays, isWeekend } from 'date-fns';

/** Per-team cleaning task limit per day */
export const TEAM_DAILY_LIMIT = 2;

/** Canonical key for a team from their staffIds array */
export function getTeamKey(staffIds: string[]): string {
  return [...staffIds].sort().join(',');
}

/** True if two staffIds arrays share at least one member (same team) */
export function sameTeam(a: string[], b: string[]): boolean {
  return a.some(id => b.includes(id));
}

/** Count assignments already assigned to the same team on a given assignment list */
export function countTeamAssignments(
  assignments: Schedule['assignments'],
  staffIds: string[]
): number {
  if (!staffIds.length) return 0;
  return assignments.filter(a => !a.isCompleted && sameTeam(a.staffIds || [], staffIds)).length;
}

/**
 * Tags an array of assignments with 'morning' or 'afternoon' based on position.
 * First half (up to Math.ceil(limit/2)) = morning, rest = afternoon.
 */
export function tagAssignmentsWithShift<T extends { shift?: 'morning' | 'afternoon' }>(
  assignments: T[],
  limit: number
): T[] {
  const morningCount = Math.ceil(limit / 2);
  return assignments.map((a, i) => ({
    ...a,
    shift: i < morningCount ? ('morning' as const) : ('afternoon' as const),
  }));
}

/**
 * Examines the active program. If its last day has fewer than dailyLimit assignments,
 * it repeatedly pulls from the all uncompleted applicant list (in priority order) to fill the gap.
 * Also assigns teams based on the team with the lowest count in that day.
 */
export async function autoFillLastDayOfProgram(dailyLimit: number) {
  const activeProgram = await dbLocal.programs.where('status').equals('active').first();
  if (!activeProgram) return;

  const progSchedules = await dbLocal.schedules.where('programId').equals(activeProgram.id!).toArray();
  if (progSchedules.length === 0) return;

  // Find the true literal last date
  progSchedules.sort((a, b) => a.date.localeCompare(b.date));
  const lastSchedule = progSchedules[progSchedules.length - 1];
  
  if (lastSchedule.assignments.length >= dailyLimit) return;

  const needed = dailyLimit - lastSchedule.assignments.length;
  if (needed <= 0) return;

  const applicantsObj = await dbLocal.applicants.toArray();
  const sortedApplicants = applicantsObj.filter(a => !a.isDeleted).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  if (sortedApplicants.length === 0) return;

  // We need to pick applicants. Start after the last global applicant.
  const lastIdx = activeProgram.lastApplicantId ? sortedApplicants.findIndex(a => a.id === activeProgram.lastApplicantId) : -1;
  let nextIdx = (lastIdx + 1) % sortedApplicants.length;

  const newAssignments: any[] = [];
  let added = 0;
  let checks = 0;

  // Build current team capacities for the last day
  const dayTeamCounts = new Map<string, number>();
  // We need active staff to form teams
  const staffObj = await dbLocal.staff.toArray();
  const activeStaff = staffObj.filter(s => s.isActive !== false && s.isBackup !== true && !s.name.toLowerCase().includes('deneme') && !s.surname.toLowerCase().includes('deneme'));
  
  // Quick team generator for fallback
  const dailyTeams: string[][] = [];
  const processedStaff = new Set<string>();
  activeStaff.forEach(s => {
    if (processedStaff.has(s.id!)) return;
    if (s.partnerId && activeStaff.find(as => as.id === s.partnerId)) {
      dailyTeams.push([s.id!, s.partnerId]);
      processedStaff.add(s.id!);
      processedStaff.add(s.partnerId);
    }
  });
  const individuals = activeStaff.filter(s => !processedStaff.has(s.id!));
  for (let i = 0; i < individuals.length; i += 2) {
    const pair = [individuals[i].id!];
    if (individuals[i+1]) pair.push(individuals[i+1].id!);
    dailyTeams.push(pair);
  }
  const dailyTeamsList = dailyTeams.map(t => t.slice().sort().join(','));

  // Pre-seed day counts
  lastSchedule.assignments.forEach(a => {
    if (a.staffIds && a.staffIds.length > 0) {
      const k = getTeamKey(a.staffIds);
      dayTeamCounts.set(k, (dayTeamCounts.get(k) || 0) + 1);
    }
  });

  // Re-build lastTeamMap real quick to assign proper teams
  const lastTeamMap = new Map<string, string[]>();
  const allSchedules = await dbLocal.schedules.toArray();
  allSchedules.sort((a, b) => a.date.localeCompare(b.date)).forEach(s => {
    s.assignments.forEach(a => {
      if (a.staffIds && a.staffIds.length > 0) {
        lastTeamMap.set(a.applicantId, a.staffIds);
      }
    });
  });

  while (added < needed && checks < sortedApplicants.length * 2) {
    const applicant = sortedApplicants[nextIdx];

    // Check passive status
    if (applicant.status === 'passive') {
      if (!applicant.passiveUntil || lastSchedule.date <= applicant.passiveUntil) {
        nextIdx = (nextIdx + 1) % sortedApplicants.length;
        checks++;
        continue;
      }
    }
    
    // Ensure they are not already in the day
    const alreadyInDay = lastSchedule.assignments.some(a => a.applicantId === applicant.id) ||
                         newAssignments.some(a => a.applicantId === applicant.id);

    if (!alreadyInDay) {
      const preferredTeamIds = lastTeamMap.get(applicant.id!);
      let assignedTeam: string[] | null = null;
      
      if (preferredTeamIds && preferredTeamIds.length > 0) {
        const prefKey = preferredTeamIds.slice().sort().join(',');
        const teamIdx = dailyTeamsList.indexOf(prefKey);
        if (teamIdx !== -1) {
          const count = dayTeamCounts.get(prefKey) || 0;
          if (count < TEAM_DAILY_LIMIT) {
            assignedTeam = dailyTeams[teamIdx];
            dayTeamCounts.set(prefKey, count + 1);
          }
        }
      }

      if (!assignedTeam && dailyTeamsList.length > 0) {
        let lowestTeamIdx = 0;
        let lowestCount = 9999;
        for (let tIdx = 0; tIdx < dailyTeamsList.length; tIdx++) {
          const count = dayTeamCounts.get(dailyTeamsList[tIdx]) || 0;
          if (count < lowestCount) {
            lowestCount = count;
            lowestTeamIdx = tIdx;
          }
        }
        const fallbackKey = dailyTeamsList[lowestTeamIdx];
        if (fallbackKey) {
          dayTeamCounts.set(fallbackKey, lowestCount + 1);
          assignedTeam = dailyTeams[lowestTeamIdx];
        }
      }

      newAssignments.push({
        applicantId: applicant.id!,
        staffIds: assignedTeam || [],
        isCompleted: false
      });
      added++;
    }
    
    nextIdx = (nextIdx + 1) % sortedApplicants.length;
    checks++;
  }

  if (newAssignments.length > 0) {
    const updatedAssignments = [...lastSchedule.assignments, ...newAssignments];
    const tagged = tagAssignmentsWithShift(updatedAssignments, dailyLimit);
    await dbLocal.schedules.update(lastSchedule.id!, { assignments: tagged });
    
    const finalAppId = newAssignments[newAssignments.length - 1].applicantId;
    await dbLocal.programs.update(activeProgram.id!, { lastApplicantId: finalAppId });
  }
}

/**
 * Scans all schedules and fixes days where any team has more than TEAM_DAILY_LIMIT

 * assignments. Excess tasks are moved forward in order, preserving sequence.
 * Returns the number of assignments that were moved.
 */
export async function cleanupOverloadedSchedules(): Promise<number> {
  const allSchedules = (await dbLocal.schedules.toArray()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const workDays = await dbLocal.workDays.toArray();
  const workDayMap = new Map(workDays.map(w => [w.date, w.isWorkDay]));

  let movedCount = 0;

  for (let i = 0; i < allSchedules.length; i++) {
    const schedule = allSchedules[i];
    const assignments = [...schedule.assignments];

    // Group: keep up to TEAM_DAILY_LIMIT per team per day (completed always kept)
    const teamCounts = new Map<string, number>();
    const keep: typeof assignments = [];
    const overflow: typeof assignments = [];

    for (const a of assignments) {
      if (a.isCompleted) { keep.push(a); continue; }

      const staffIds = a.staffIds || [];
      // If no staffIds assigned yet, treat as its own "slot" — use placeholder key
      const key = staffIds.length ? getTeamKey(staffIds) : `__unassigned_${keep.length + overflow.length}`;
      const count = teamCounts.get(key) || 0;

      if (staffIds.length === 0 || count < TEAM_DAILY_LIMIT) {
        keep.push(a);
        if (staffIds.length) teamCounts.set(key, count + 1);
      } else {
        overflow.push(a);
        movedCount++;
      }
    }

    if (overflow.length === 0) continue;

    // Persist the fixed day
    await dbLocal.schedules.update(schedule.id!, { assignments: keep });
    // Update local cache
    allSchedules[i] = { ...schedule, assignments: keep };

    // Distribute overflow to subsequent days in sequence
    let overflowQueue = [...overflow];
    let checkDate = addDays(parseISO(schedule.date), 1);
    let safety = 180;

    while (overflowQueue.length > 0 && safety-- > 0) {
      const dateStr = format(checkDate, 'yyyy-MM-dd');
      const explicit = workDayMap.get(dateStr);
      const isWorkable =
        explicit === true ? true : explicit === false ? false : !isWeekend(checkDate);

      if (isWorkable) {
        // Find existing schedule for this date in our local cache
        let targetIdx = allSchedules.findIndex(s => s.date === dateStr);
        let targetAssignments: typeof assignments =
          targetIdx >= 0 ? [...allSchedules[targetIdx].assignments] : [];

        // Count existing team slots
        const dayTeamCounts = new Map<string, number>();
        targetAssignments.filter(a => !a.isCompleted).forEach(a => {
          const k = getTeamKey(a.staffIds || []);
          if ((a.staffIds || []).length)
            dayTeamCounts.set(k, (dayTeamCounts.get(k) || 0) + 1);
        });

        const dailyLimit = parseInt(localStorage?.getItem?.('dailyLimit') || '6') || 6;
        const currentTotal = targetAssignments.length;
        const toAdd: typeof assignments = [];
        const stillOverflow: typeof assignments = [];

        for (const a of overflowQueue) {
          const staffIds = a.staffIds || [];
          const k = staffIds.length ? getTeamKey(staffIds) : `__unassigned_${toAdd.length}`;
          const teamCount = dayTeamCounts.get(k) || 0;
          
          const canAddThisTeam = staffIds.length === 0 || teamCount < TEAM_DAILY_LIMIT;
          const hasDailyCapacity = (currentTotal + toAdd.length) < dailyLimit;

          if (canAddThisTeam && hasDailyCapacity) {
            toAdd.push(a);
            if (staffIds.length) dayTeamCounts.set(k, teamCount + 1);
          } else {
            stillOverflow.push(a);
          }
        }

        overflowQueue = stillOverflow;

        if (toAdd.length > 0) {
          const combined = [...targetAssignments, ...toAdd];
          // Re-tag everything on this target day to ensure morning/afternoon distribution is correct
          const tagged = tagAssignmentsWithShift(combined, dailyLimit);
          
          if (targetIdx >= 0) {
            await dbLocal.schedules.update(allSchedules[targetIdx].id!, {
              assignments: tagged,
            });
            allSchedules[targetIdx] = { ...allSchedules[targetIdx], assignments: tagged };
          } else {
            // Need to find the programId from the source schedule
            const newSched = {
              date: dateStr,
              programId: schedule.programId,
              assignments: tagged,
            };
            const newId = await dbLocal.schedules.add(newSched);
            allSchedules.push({ ...newSched, id: String(newId) });
          }
        }
      }

      checkDate = addDays(checkDate, 1);
    }
  }

  return movedCount;
}

/**
 * Re-aligns all future uncompleted assignments in an active program to the current work day calendar.
 * Respects TEAM_DAILY_LIMIT (2 tasks per team per day) when staffIds are set.
 * This is triggered when the work day calendar changes.
 */
export async function reAlignActiveProgramSchedules() {
  const activeProgram = await dbLocal.programs.where('status').equals('active').first();
  if (!activeProgram) return;

  const today = format(new Date(), 'yyyy-MM-dd');

  const tempSchedules = await dbLocal.schedules.toArray();
  const allSchedules = tempSchedules.filter(s => s.programId === activeProgram.id!);

  const completedAssignments = allSchedules.flatMap(s =>
    s.assignments.filter(a => a.isCompleted || s.date < today)
  );

  const allApplicantsRaw = await dbLocal.applicants.toArray();
  const allApplicants = allApplicantsRaw.filter(a => !a.isDeleted);
  const priorityMap = new Map(allApplicants.map(a => [a.id, a.priority || 0]));

  const validApplicantIds = new Set(allApplicants.map(a => a.id));

  let uncompletedQueueRaw = allSchedules
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(s => s.assignments.filter(a => {
      if (a.isCompleted) return false;
      const app = allApplicants.find(x => x.id === a.applicantId);
      if (!app) return false;
      if (app.status === 'passive' && (!app.passiveUntil || s.date <= app.passiveUntil)) {
        return false;
      }
      return true;
    }));

  const assignmentEncounter = new Map<string, number>();

  completedAssignments.forEach(a => {
    assignmentEncounter.set(a.applicantId, (assignmentEncounter.get(a.applicantId) || 0) + 1);
  });

  const enrichedUncompleted = uncompletedQueueRaw.map(a => {
    const count = (assignmentEncounter.get(a.applicantId) || 0) + 1;
    assignmentEncounter.set(a.applicantId, count);
    return { ...a, _cycle: count, _priority: priorityMap.get(a.applicantId) || 0 };
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
        _priority: app.priority || 0,
      });
      assignmentEncounter.set(app.id!, count);
    }
  });

  enrichedUncompleted.sort((a, b) => {
    if (a._cycle !== b._cycle) return a._cycle - b._cycle;
    return a._priority - b._priority;
  });

  const uncompletedQueue = enrichedUncompleted.map(({ _cycle, _priority, ...rest }) => rest);

  if (uncompletedQueue.length === 0) return;

  // Clear uncompleted future schedules
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

  // Build available date list
  const explicitWorkSettings = await dbLocal.workDays.where('date').aboveOrEqual(today).toArray();
  const settingsMap = new Map(
    explicitWorkSettings.map(s => [s.date, s.isWorkDay !== undefined ? s.isWorkDay : false])
  );

  const availableDates: string[] = [];
  let checkDate = parseISO(today);
  let daysChecked = 0;

  while (availableDates.length < Math.max(uncompletedQueue.length, 60) && daysChecked < 240) {
    const dateStr = format(checkDate, 'yyyy-MM-dd');
    const explicit = settingsMap.get(dateStr);
    if (explicit === true) availableDates.push(dateStr);
    else if (explicit === false) { /* holiday, skip */ }
    else if (!isWeekend(checkDate)) availableDates.push(dateStr);
    checkDate = addDays(checkDate, 1);
    daysChecked++;
  }

  // Re-distribute with per-team limit
  const dailyLimit = parseInt(localStorage?.getItem?.('dailyLimit') || '6') || 6;
  // Track what we've planned per date (team → count)
  const perDateTeamCounts = new Map<string, Map<string, number>>();

  const getDateTeamMap = (dateStr: string) => {
    if (!perDateTeamCounts.has(dateStr)) perDateTeamCounts.set(dateStr, new Map());
    return perDateTeamCounts.get(dateStr)!;
  };

  // queue index approach: we may need to skip an item and come back
  const remainingQueue = [...uncompletedQueue];
  let dateIdx = 0;

  while (remainingQueue.length > 0 && dateIdx < availableDates.length) {
    const targetDate = availableDates[dateIdx];
    const existingSchedule = await dbLocal.schedules.where('date').equals(targetDate).first();
    const completedOnes = existingSchedule
      ? existingSchedule.assignments.filter(a => a.isCompleted)
      : [];
    const existingUncompleted = existingSchedule
      ? existingSchedule.assignments.filter(a => !a.isCompleted)
      : [];

    // Seed team counts from already-existing uncompleted on this day
    const teamMap = getDateTeamMap(targetDate);
    existingUncompleted.forEach(a => {
      const k = getTeamKey(a.staffIds || []);
      if ((a.staffIds || []).length) teamMap.set(k, (teamMap.get(k) || 0) + 1);
    });

    const capacity = dailyLimit - completedOnes.length - existingUncompleted.length;
    if (capacity <= 0) { dateIdx++; continue; }

    // Take up to capacity items, respecting TEAM_DAILY_LIMIT
    const toAdd: typeof remainingQueue = [];
    const deferred: typeof remainingQueue = [];

    for (const item of remainingQueue) {
      if (toAdd.length >= capacity) { deferred.push(item); continue; }

      const applicant = allApplicants.find(a => a.id === item.applicantId);
      if (applicant?.status === 'passive') {
        if (!applicant.passiveUntil || targetDate <= applicant.passiveUntil) {
          deferred.push(item);
          continue;
        }
      }

      const staffIds = item.staffIds || [];
      if (staffIds.length > 0) {
        const k = getTeamKey(staffIds);
        const count = teamMap.get(k) || 0;
        if (count >= TEAM_DAILY_LIMIT) { deferred.push(item); continue; }
        teamMap.set(k, count + 1);
      }
      toAdd.push(item);
    }

    // Items that were deferred go back to the queue for the next date
    remainingQueue.splice(0, remainingQueue.length, ...deferred.concat(
      remainingQueue.filter(item => !toAdd.includes(item) && !deferred.includes(item))
    ));
    // Actually rebuild properly:
    remainingQueue.splice(0, remainingQueue.length, ...deferred);

    if (toAdd.length > 0) {
      const tagged = tagAssignmentsWithShift(toAdd, dailyLimit);
      if (existingSchedule) {
        await dbLocal.schedules.update(existingSchedule.id!, {
          assignments: [...completedOnes, ...existingUncompleted, ...tagged],
        });
      } else {
        await dbLocal.schedules.add({
          date: targetDate,
          programId: activeProgram.id!,
          assignments: tagged,
        });
      }
    }

    dateIdx++;
  }

  if (remainingQueue.length > 0) {
    console.warn(`${remainingQueue.length} assignments could not be placed within 240 days.`);
  }
}



