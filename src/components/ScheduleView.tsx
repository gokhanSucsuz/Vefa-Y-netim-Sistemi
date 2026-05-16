import toast from 'react-hot-toast';
import { useState, useMemo, useEffect, useRef } from 'react';
import { dbLocal } from '../db';
import { Applicant, Staff, WorkDay, Schedule, DailyAssignment, EDIRNE_NEIGHBORHOODS, Program, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { tagAssignmentsWithShift, cleanupOverloadedSchedules, autoFillLastDayOfProgram } from '../services/scheduleService';
import { format, startOfMonth, endOfMonth, parseISO, addDays, differenceInDays, isWeekend } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Wand2, FileSpreadsheet, FileText, Users, Map as MapIcon, ChevronDown, ChevronUp, Calendar as CalendarIcon, CheckCircle2, AlertTriangle, Clock, Download, ChevronRight, RefreshCw, MapPin, Search, Eye, Settings2, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { APP_LOGO_URL } from '../constants/logo';
import { exportToExcel, exportToPDF, formatSafe } from '../utils/exportUtils';
import { setupPdfMakeFonts } from '../lib/pdfFonts';
import { formatPhone, formatTC } from '../lib/format';
import { Map as MapGL, Marker, Popup, NavigationControl, useMap } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { geocodeAddress } from '../services/geocoding';
import { EDIRNE_NEIGHBORHOOD_COORDS } from '../constants/edirne_data';
import ManualSchedulePlanner from './ManualSchedulePlanner';

// MapLibre GL JS doesn't need the Leaflet icon fix

interface Props {
  applicants: Applicant[];
  staff: Staff[];
  workDays: WorkDay[];
  schedules: Schedule[];
  programs: Program[]; // Added programs prop
  currentUser: SystemUser;
  initialDate?: string | null;
  focusedProgramId?: string | null;
}

function MapUpdater({ markers }: { markers: { pos: [number, number] }[] }) {
  const { current: map } = useMap();
  
  useEffect(() => {
    if (map && markers.length > 0) {
      const lats = markers.map(m => m.pos[0]);
      const lngs = markers.map(m => m.pos[1]);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      map.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 50, maxZoom: 15, duration: 1000 }
      );
    }
  }, [markers, map]);

  return null;
}

export default function ScheduleView({ applicants, staff, workDays, schedules, programs, currentUser, initialDate, focusedProgramId }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showManualPlanner, setShowManualPlanner] = useState(false);
  const [lastSavedDay, setLastSavedDay] = useState<string | null>(null);
  
  // Cleanup orphaned schedules (schedules pointing to non-existent programs)
  useEffect(() => {
    const cleanupOrphans = async () => {
      try {
        const allScheds = await dbLocal.schedules.toArray();
        const allProgs = await dbLocal.programs.toArray();
        // Create a set of string IDs for easy comparison
        const progIds = new Set(allProgs.map(p => String(p.id)));
        progIds.add('manual');
        progIds.add('history');
        progIds.add(''); // explicit manual/standalone

        const orphanIds = allScheds
          .filter(s => s.programId && !progIds.has(String(s.programId)))
          .map(s => s.id!);

        if (orphanIds.length > 0) {
          console.log(`Cleaning up ${orphanIds.length} orphaned schedules...`);
          await dbLocal.schedules.bulkDelete(orphanIds);
        }
      } catch (error) {
        console.error("Orphan cleanup failed:", error);
      }
    };
    cleanupOrphans();
  }, [programs]); // Re-run if programs list changes
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (initialDate) {
      const d = parseISO(initialDate);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return new Date();
  });
  const [showMap, setShowMap] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(initialDate || null);
  const [hoveredMarker, setHoveredMarker] = useState<number | null>(null);
  const [customTaskInputs, setCustomTaskInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialDate) {
      const d = parseISO(initialDate);
      if (!isNaN(d.getTime())) {
        setSelectedMonth(d);
        setExpandedDay(initialDate);
      }
    }
  }, [initialDate]);
  const [isGeocodingDay, setIsGeocodingDay] = useState(false);
  const [swapSelection, setSwapSelection] = useState<{ date: string; applicantId: string } | null>(null);
  const [completionModal, setCompletionModal] = useState<{ date: string; applicantId: string; name: string } | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState<{ date: string } | null>(null);
  const [targetRescheduleDate, setTargetRescheduleDate] = useState('');
  const [selectedCancelShift, setSelectedCancelShift] = useState<'morning' | 'afternoon' | undefined>(undefined);
  const [shiftAssignmentModal, setShiftAssignmentModal] = useState<{ date: string; applicantId: string; name: string } | null>(null);
  const [targetAssignmentDate, setTargetAssignmentDate] = useState('');
  const [dailyLimit, setDailyLimit] = useState(() => {
    const saved = localStorage.getItem('dailyLimit');
    return saved ? parseInt(saved) : 6;
  });



  // formatSafe imported from exportUtils
const validateAssignment = (applicantId: string, date: string, currentSchedules: Schedule[], excludeScheduleId?: string) => {
    // 1. Single visit per day check
    const daySchedule = currentSchedules.find(s => s.date === date);
    if (daySchedule && daySchedule.id !== excludeScheduleId) {
      if (daySchedule.assignments.some(a => a.applicantId === applicantId)) {
        return { valid: false, message: 'Bu hane bu güne zaten eklenmiş.' };
      }
    }

    // 2. 14-day interval check
    const targetDate = parseISO(date);
    const otherVisits = currentSchedules.flatMap(s => 
      s.assignments
        .filter(a => a.applicantId === applicantId)
        .map(a => ({ date: s.date, scheduleId: s.id }))
    ).filter(v => v.scheduleId !== excludeScheduleId);

    for (const visit of otherVisits) {
      const visitDate = parseISO(visit.date);
      const diffDays = Math.abs(differenceInDays(targetDate, visitDate));
      if (diffDays < 14) {
        return { 
          valid: false, 
          message: `İki ziyaret arasında en az 14 gün olmalıdır. (Mevcut ziyaret: ${format(visitDate, 'dd.MM.yyyy')}, Fark: ${diffDays} gün)` 
        };
      }
    }

    return { valid: true };
  };

  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const handleCleanupOverloaded = async () => {
    if (!confirm('Bu işlem, aynı ekibe aynı günde 2\'den fazla atanmış temizlik görevlerini sıra bozulmadan ileriki günlere taşıyacaktır. Devam edilsin mi?')) return;
    setIsCleaningUp(true);
    try {
      const moved = await cleanupOverloadedSchedules();
      
      if (moved === 0) {
        toast.success('Program temiz! Hiçbir ekipte günlük 2 görev aşımı yok.');
      } else {
        toast.success(`${moved} fazla görev ileriki günlere taşındı. Program düzenlendi.`);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Program Temizleme', `${moved} fazla atama ileriki günlere kaydırıldı.`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Program temizleme sırasında hata oluştu.');
    } finally {
      setIsCleaningUp(false);
    }
  };


  useEffect(() => {
    localStorage.setItem('dailyLimit', dailyLimit.toString());
  }, [dailyLimit]);

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

  const moveAssignment = async (date: string, idx: number, direction: 'up' | 'down') => {
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;
    const newAssignments = [...schedule.assignments];
    if (direction === 'up' && idx > 0) {
      const temp = newAssignments[idx];
      newAssignments[idx] = newAssignments[idx - 1];
      newAssignments[idx - 1] = temp;
    } else if (direction === 'down' && idx < newAssignments.length - 1) {
      const temp = newAssignments[idx];
      newAssignments[idx] = newAssignments[idx + 1];
      newAssignments[idx + 1] = temp;
    }
    await dbLocal.schedules.update(schedule.id!, { assignments: newAssignments });
  };

  const handleSwap = async (date: string, applicantId: string) => {
    if (!swapSelection) {
      setSwapSelection({ date, applicantId });
      return;
    }

    if (swapSelection.date === date && swapSelection.applicantId === applicantId) {
      setSwapSelection(null);
      return;
    }

    const schedule1 = schedules.find(s => s.date === swapSelection.date);
    const schedule2 = schedules.find(s => s.date === date);

    if (!schedule1 || !schedule2) return;

    // Validation checks for swap
    const check1 = validateAssignment(swapSelection.applicantId, date, schedules, schedule1.id);
    if (!check1.valid) {
      toast.error(`Hata (${applicants.find(a => a.id === swapSelection.applicantId)?.name}): ${check1.message}`);
      return;
    }

    const check2 = validateAssignment(applicantId, swapSelection.date, schedules, schedule2.id);
    if (!check2.valid) {
      toast.error(`Hata (${applicants.find(a => a.id === applicantId)?.name}): ${check2.message}`);
      return;
    }

    const newAssignments1 = [...schedule1.assignments];
    const newAssignments2 = [...schedule2.assignments];

    const idx1 = newAssignments1.findIndex(a => a.applicantId === swapSelection.applicantId);
    const idx2 = newAssignments2.findIndex(a => a.applicantId === applicantId);

    if (idx1 === -1 || idx2 === -1) return;

    // Swap applicant IDs
    const tempId = newAssignments1[idx1].applicantId;
    newAssignments1[idx1].applicantId = newAssignments2[idx2].applicantId;
    newAssignments2[idx2].applicantId = tempId;

    // Preserve completion status? Usually swapping happens before completion, 
    // but let's just swap the applicant and keep the rest of the slot data (staff) as is for that day/slot.
    // Actually, it's better to swap the entire assignment object except maybe the date/team if they are fixed.
    // The user said "yer değiştirme işlemi yapmamı sağlayacak düzenlemeyi de yap yani iki hanenin gününü değiştirebileyim"
    // This implies swapping their positions in the schedule.

    await dbLocal.transaction('rw', dbLocal.schedules, async () => {
      await dbLocal.schedules.update(schedule1.id!, { assignments: newAssignments1 });
      await dbLocal.schedules.update(schedule2.id!, { assignments: newAssignments2 });
    });

    logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Hane Yer Değiştirme', `${swapSelection.date} ve ${date} tarihlerindeki haneler yer değiştirildi.`);
    setSwapSelection(null);
    toast.success('Haneler başarıyla yer değiştirildi.');
  };

  const saveCustomTask = async (date: string, staffId: string, taskDesc: string, existingTaskId?: string) => {
    if (!taskDesc.trim() && !existingTaskId) return;

    let schedule = schedules.find(s => s.date === date);
    if (!schedule) {
      const activeProgram = programs.find(p => p.status === 'active');
      const newSchedule: Schedule = {
        date,
        programId: activeProgram ? activeProgram.id : '',
        assignments: [],
        customTasks: []
      };
      const id = await dbLocal.schedules.add(newSchedule);
      schedule = { ...newSchedule, id: id.toString() };
    }

    const currentTasks = schedule.customTasks || [];
    let newTasks = [...currentTasks];

    if (existingTaskId && !taskDesc.trim()) {
      // Delete
      newTasks = newTasks.filter(t => t.id !== existingTaskId);
    } else if (existingTaskId) {
      // Update
      newTasks = newTasks.map(t => t.id === existingTaskId ? { ...t, taskDescription: taskDesc } : t);
    } else {
      // Add
      newTasks.push({
        id: Date.now().toString(),
        staffId,
        taskDescription: taskDesc
      });
    }

    await dbLocal.schedules.update(schedule.id!, { customTasks: newTasks });
    setCustomTaskInputs(prev => ({ ...prev, [`${date}_${staffId}`]: '' }));
    logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Özel Görev', `${date} tarihinde personele özel görev atandı/güncellendi.`);
  };

  const performCancelAssignment = async (date: string, applicantId: string, reason: string) => {
    setIsRescheduling(true);
    setShiftAssignmentModal(null);
    try {
      const schedule = schedules.find(s => s.date === date);
      if (!schedule) return;

      const updatedAssignments = schedule.assignments.map(a => {
        if (a.applicantId === applicantId) {
          return { ...a, isCancelled: true, cancelReason: reason || 'Mazeret bildirildi' };
        }
        return a;
      });

      await dbLocal.schedules.update(schedule.id!, { assignments: updatedAssignments });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Ziyaret Pasife Alındı', `${date} tarihindeki hane ziyareti mazeretli olarak iptal edildi. Sebep: ${reason}`);
      toast.success('Ziyaret iptal edildi.');
    } catch (error) {
      console.error('Cancel assignment failed:', error);
      toast.error('İşlem başarısız oldu.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const performShiftAssignment = async (date: string, applicantId: string, targetDateStr?: string) => {
    setIsRescheduling(true);
    setShiftAssignmentModal(null);
    setTargetAssignmentDate('');
    try {
      await dbLocal.transaction('rw', [dbLocal.schedules, dbLocal.workDays], async () => {
        const allSchedules = await dbLocal.schedules.toArray();
        const futureSchedules = allSchedules
          .filter(s => s.date >= date)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (futureSchedules.length === 0) return;

        const currentDaySchedule = futureSchedules.find(s => s.date === date);
        if (!currentDaySchedule) return;

        const assignmentIndex = currentDaySchedule.assignments.findIndex(a => a.applicantId === applicantId);
        if (assignmentIndex === -1) return;

        const canceledAssignment = currentDaySchedule.assignments[assignmentIndex];
        if (canceledAssignment.isCompleted) {
          toast.success('Tamamlanmış bir ziyaret iptal edilemez.');
          return;
        }

        let uncompletedPool: any[] = [];
        for (const s of futureSchedules) {
          const uncompletedInDay = s.assignments.filter(a => !a.isCompleted && !a.isCancelled);
          uncompletedPool.push(...uncompletedInDay);
        }

        // Strict queue sliding - no priority sort to preserve user's manual arrangement
        
        // Find and extract the item being moved
        const moveIdx = uncompletedPool.findIndex(a => a.applicantId === applicantId);
        if (moveIdx === -1) {
          setIsRescheduling(false);
          return;
        }
        const [movedItem] = uncompletedPool.splice(moveIdx, 1);

        const firstDayCompleted = currentDaySchedule.assignments.filter(a => a.isCompleted || a.isCancelled).length;
        const firstDayOriginalUncompleted = currentDaySchedule.assignments.length - firstDayCompleted;

        let insertIndex = 0;
        if (targetDateStr) {
          for (const s of futureSchedules) {
            if (s.date >= targetDateStr) break;
            const completedCount = s.assignments.filter(a => a.isCompleted || a.isCancelled).length;
            if (s.date === date) {
               insertIndex += Math.max(0, firstDayOriginalUncompleted - 1);
            } else {
               insertIndex += Math.max(0, dailyLimit - completedCount);
            }
          }
        } else {
          insertIndex = Math.max(0, firstDayOriginalUncompleted - 1);
        }
        
        uncompletedPool.splice(insertIndex, 0, movedItem);
        const tempPool = [...uncompletedPool];
        
        // We need a way to track visits for the 14-day rule during redistribution
        // We'll use the existing schedules but ignore the uncompleted ones we are about to overwrite
        const baseSchedules = allSchedules.filter(s => s.date < date || s.assignments.some(a => a.isCompleted || a.isCancelled));

        const scheduleUpdates: { id: string, changes: Partial<Schedule> }[] = [];

        for (let i = 0; i < futureSchedules.length; i++) {
          const s = futureSchedules[i];
          const completedOnes = s.assignments.filter(a => a.isCompleted || a.isCancelled);
          const targetDate = parseISO(s.date);
          
          let targetUncompletedCount = Math.max(0, dailyLimit - completedOnes.length);
          if (s.date === date) {
             const movingToSameDay = targetDateStr === date;
             targetUncompletedCount = movingToSameDay ? firstDayOriginalUncompleted : Math.max(0, firstDayOriginalUncompleted - 1);
          }
          
          const newUncompleted: any[] = [];
          for (let j = 0; j < targetUncompletedCount; j++) {
            let foundIdx = -1;
            // Strict queue sliding - find first item not already in this day
            for (let pIdx = 0; pIdx < tempPool.length; pIdx++) {
              const item = tempPool[pIdx];
              const isAlreadyInDay = newUncompleted.some(a => a.applicantId === item.applicantId);
              if (!isAlreadyInDay) {
                foundIdx = pIdx;
                break;
              }
            }

            if (foundIdx !== -1) {
              newUncompleted.push(tempPool.splice(foundIdx, 1)[0]);
            }
          }
          
          const taggedUncompleted = newUncompleted.map((a: any, idx: number) => ({
            ...a,
            shift: (completedOnes.length + idx) < Math.ceil(dailyLimit / 2) ? 'morning' : 'afternoon'
          }));
          s.assignments = [...completedOnes, ...taggedUncompleted];
          scheduleUpdates.push({ id: s.id!, changes: { assignments: s.assignments } });
        }

        if (scheduleUpdates.length > 0) {
          await dbLocal.schedules.bulkUpdate(scheduleUpdates);
        }

        // 7. Handle leftovers — auto-derive next available day if workDays list is insufficient
        if (tempPool.length > 0) {
          const allWorkDays = await dbLocal.workDays.toArray();
          const allSchedules2 = await dbLocal.schedules.toArray();
          const scheduledDates = new Set(allSchedules2.map(s => s.date));
          let currentDateStr = futureSchedules.length > 0 ? futureSchedules[futureSchedules.length - 1].date : date;
          
          const leftoverSchedules = [];
          let safetyLimit = 120; // max 120 days ahead
          while(tempPool.length > 0 && safetyLimit-- > 0) {
            // Advance to next calendar day
            const nextDate = addDays(parseISO(currentDateStr), 1);
            const nextDateStr = format(nextDate, 'yyyy-MM-dd');
            currentDateStr = nextDateStr;

            // Check if this is a work day: explicit setting OR weekday (Mon-Fri)
            const explicitWd = allWorkDays.find(wd => wd.date === nextDateStr);
            const isWeekdayDay = nextDate.getDay() !== 0 && nextDate.getDay() !== 6;
            const isWorkable = explicitWd ? explicitWd.isWorkDay : isWeekdayDay;

            if (!isWorkable) continue;
            // Skip days that already have a schedule with assignments
            if (scheduledDates.has(nextDateStr)) {
              const existing = allSchedules2.find(s => s.date === nextDateStr);
              if (existing && existing.assignments.length >= dailyLimit) continue;
            }
            
            const newUncompleted: any[] = [];
            for (let j = 0; j < dailyLimit && tempPool.length > 0; j++) {
              newUncompleted.push(tempPool.shift());
            }
            
            leftoverSchedules.push({ date: currentDateStr, programId: currentDaySchedule.programId, assignments: newUncompleted });
          }
          if (leftoverSchedules.length > 0) {
            await dbLocal.schedules.bulkAdd(leftoverSchedules);
          }
          if (tempPool.length > 0) {
            toast.error(`${tempPool.length} ziyaret planlanamadı. Lütfen çalışma günü takvimini kontrol edin.`);
          }
        }
      });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Ziyaret Kaydırma', `${date} tarihindeki ${applicants.find(a => a.id === applicantId)?.name} ziyareti kaydırıldı.`);
      
      // Safety net: ensure per-team limit is maintained
      await cleanupOverloadedSchedules();
      
      toast.success('Ziyaret başarıyla sonraki güne kaydırıldı.');
    } catch (error) {
      console.error('Rescheduling error:', error);
      toast.error('Kaydırma işlemi sırasında bir hata oluştu.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleCancelDay = async (date: string, targetDateStr?: string, cancelShift?: 'morning' | 'afternoon') => {
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;

    // Filter uncompleted assignments based on the shift being cancelled
    const uncompletedAssignments = schedule.assignments.filter(a => {
      if (a.isCompleted || a.isCancelled) return false;
      // If no shift specified on the cancel call → cancel everything
      if (!cancelShift) return true;
      // If the assignment has no shift tag, include it only when cancelling the full day
      if (!a.shift) return !cancelShift;
      return a.shift === cancelShift;
    });

    if (uncompletedAssignments.length === 0) {
      const shiftLabel = cancelShift === 'morning' ? 'sabah' : cancelShift === 'afternoon' ? 'öğleden sonra' : '';
      toast.success(`Bu günde${shiftLabel ? ` (${shiftLabel})` : ''} iptal edilecek tamamlanmamış ziyaret bulunmamaktadır.`);
      return;
    }

    const shiftLabel = cancelShift === 'morning' ? ' (Sabah)' : cancelShift === 'afternoon' ? ' (Öğleden Sonra)' : '';
    const confirmMsg = targetDateStr 
      ? `Bu günkü${shiftLabel} tamamlanmamış (${uncompletedAssignments.length}) ziyareti iptal edip ${formatSafe(targetDateStr, 'dd.MM.yyyy')} tarihine ve sonrasına kaydırmak istediğinize emin misiniz?`
      : `Bu günkü${shiftLabel} tamamlanmamış (${uncompletedAssignments.length}) ziyareti iptal edip sonraki günlere kaydırmak istediğinize emin misiniz?`;

    const confirmCancel = confirm(confirmMsg);
    if (!confirmCancel) return;

    setIsRescheduling(true);
    try {
      await dbLocal.transaction('rw', [dbLocal.schedules, dbLocal.workDays], async () => {
        const allSchedules = await dbLocal.schedules.toArray();
        
        // If targetDateStr is provided, we shift everything from that date onwards
        const effectiveTargetDate = targetDateStr || date;

        const futureSchedules = allSchedules
          .filter(s => s.date >= effectiveTargetDate || s.date === date)
          .sort((a, b) => a.date.localeCompare(b.date));

        let uncompletedPool: any[] = [];
        // Add current day's uncompleted first
        uncompletedPool.push(...uncompletedAssignments);
        
        // Add other future uncompleted (excluding current day's which are already added)
        for (const s of futureSchedules) {
          if (s.date === date) continue;
          const uncompletedInDay = s.assignments.filter(a => !a.isCompleted && !a.isCancelled);
          uncompletedPool.push(...uncompletedInDay);
        }

        // Strict queue sliding - no deduplication or priority sort to preserve user's manual arrangement
        const tempPool = [...uncompletedPool];
        
        // We need to handle the case where targetDateStr is a new date not in futureSchedules
        let planningDates = futureSchedules.map(s => s.date);
        if (targetDateStr && !planningDates.includes(targetDateStr)) {
          planningDates.push(targetDateStr);
          planningDates.sort();
        }

        // Filter out the canceled day from receiving new assignments if it's the source
        const receivingDates = planningDates.filter(d => d !== date);
        const scheduleUpdates: { id: string, changes: Partial<Schedule> }[] = [];

        for (const dStr of receivingDates) {
          const s = allSchedules.find(as => as.date === dStr);
          const completedOnes = s ? s.assignments.filter(a => a.isCompleted || a.isCancelled) : [];
          const targetDate = parseISO(dStr);
          
          const targetUncompletedCount = Math.max(0, dailyLimit - completedOnes.length);
          
          const newUncompleted: any[] = [];
          for (let j = 0; j < targetUncompletedCount; j++) {
            let foundIdx = -1;
            // Strict queue sliding - find first item not already in this day
            for (let pIdx = 0; pIdx < tempPool.length; pIdx++) {
              const item = tempPool[pIdx];
              const isAlreadyInDay = newUncompleted.some(a => a.applicantId === item.applicantId);
              if (!isAlreadyInDay) {
                foundIdx = pIdx;
                break;
              }
            }

            if (foundIdx !== -1) {
              newUncompleted.push(tempPool.splice(foundIdx, 1)[0]);
            }
          }

          if (s) {
            const taggedUncompleted = newUncompleted.map((a: any, idx: number) => ({
              ...a,
              shift: (completedOnes.length + idx) < Math.ceil(dailyLimit / 2) ? 'morning' : 'afternoon'
            }));
            scheduleUpdates.push({ id: s.id!, changes: { assignments: [...completedOnes, ...taggedUncompleted] } });
          } else {
            // Check if it's a work day
            const workDays = await dbLocal.workDays.toArray();
            const wd = workDays.find(w => w.date === dStr);
            if (wd?.isWorkDay) {
              const taggedUncompleted = newUncompleted.map((a: any, idx: number) => ({
                ...a,
                shift: idx < Math.ceil(dailyLimit / 2) ? 'morning' : 'afternoon'
              }));
              await dbLocal.schedules.add({ date: dStr, programId: schedule.programId, assignments: taggedUncompleted });
            }
          }
        }

        if (scheduleUpdates.length > 0) {
          await dbLocal.schedules.bulkUpdate(scheduleUpdates);
        }

        // Clear only the cancelled shift's assignments; keep the other shift intact
        const remainingAssignments = schedule.assignments.filter(a => {
          if (a.isCompleted || a.isCancelled) return true; // always keep completed and cancelled
          if (!cancelShift) return false;  // full day cancel → remove all uncompleted
          // Keep assignments that belong to the OTHER shift
          if (!a.shift) return false;      // untagged → was in the cancelled batch
          return a.shift !== cancelShift;
        });
        await dbLocal.schedules.update(schedule.id!, { assignments: remainingAssignments });
        
        // Handle leftovers — auto-derive next available day if workDays is insufficient
        if (tempPool.length > 0) {
          const allWorkDays = await dbLocal.workDays.toArray();
          const allSchedForLeftover = await dbLocal.schedules.toArray();
          let currentDateStr = planningDates.length > 0 ? planningDates[planningDates.length - 1] : date;
          
          const leftoverSchedules = [];
          let safetyLimit = 120;
          while(tempPool.length > 0 && safetyLimit-- > 0) {
            const nextDate = addDays(parseISO(currentDateStr), 1);
            const nextDateStr = format(nextDate, 'yyyy-MM-dd');
            currentDateStr = nextDateStr;

            const explicitWd = allWorkDays.find(wd => wd.date === nextDateStr);
            const isWeekdayDay = nextDate.getDay() !== 0 && nextDate.getDay() !== 6;
            const isWorkable = explicitWd ? explicitWd.isWorkDay : isWeekdayDay;

            if (!isWorkable) continue;

            const newUncompleted: any[] = [];
            for (let j = 0; j < dailyLimit && tempPool.length > 0; j++) {
              newUncompleted.push(tempPool.shift());
            }
            // Tag shifts for this leftover day
            const taggedUncompleted = newUncompleted.map((a: any, idx: number) => ({
              ...a,
              shift: idx < Math.ceil(dailyLimit / 2) ? 'morning' : 'afternoon'
            }));
            leftoverSchedules.push({ date: currentDateStr, programId: schedule.programId, assignments: taggedUncompleted });
          }
          if (leftoverSchedules.length > 0) {
            await dbLocal.schedules.bulkAdd(leftoverSchedules);
          }
          if (tempPool.length > 0) {
            toast.error(`${tempPool.length} ziyaret planlanamadı. Lütfen çalışma günü takvimini kontrol edin.`);
          }
        }
      });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Gün İptali ve Kaydırma', `${date} tarihindeki tüm ziyaretler kaydırıldı.`);
      
      // Safety net: ensure per-team limit is maintained
      await cleanupOverloadedSchedules();
      
      toast.success('Ziyaretler başarıyla kaydırıldı.');
      setRescheduleModal(null);
      setTargetRescheduleDate('');
    } catch (error) {
      console.error('Rescheduling error:', error);
      toast.error('Kaydırma işlemi sırasında bir hata oluştu.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const currentMonthWorkDays = useMemo(() => {
    const daysInMonth = [];
    if (isNaN(monthStart.getTime())) return [];
    
    let d = parseISO(format(monthStart, 'yyyy-MM-dd'));
    while (d <= monthEnd) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const explicit = workDays.find(wd => wd.date === dateStr);
      let isUsable = false;
      if (explicit) {
        let val = explicit.isWorkDay;
        if (val === undefined) val = false; // Legacy fallback
        if (val) isUsable = true;
      } else {
        if (!isWeekend(d)) isUsable = true;
      }
      
      if (isUsable) {
        daysInMonth.push({ date: dateStr, isWorkDay: true });
      }
      d = addDays(d, 1);
    }
    return daysInMonth;
  }, [workDays, monthStart, monthEnd]);

  const assignments: DailyAssignment[] = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const result: DailyAssignment[] = [];
    
    // If focused on a program (including manual ones), we show ALL dates of that program regardless of currentMonth selection
    if (focusedProgramId) {
      const relevantSchedules = schedules
        .filter(s => (s.programId === focusedProgramId) || (focusedProgramId === 'manual' && (!s.programId || s.programId === 'manual')))
        .sort((a, b) => a.date.localeCompare(b.date));
        
      relevantSchedules.forEach(schedule => {
        const items = schedule.assignments.map(a => {
          const applicant = applicants.find(ap => ap.id === a.applicantId);
          const staffMembers = (a.staffIds || []).map(sid => staff.find(st => st.id === sid)).filter(Boolean) as Staff[];
          return { applicant: applicant!, staffMembers };
        }).filter(item => item.applicant);

        if (items.length > 0) {
          result.push({ date: schedule.date, items });
        }
      });
      return result;
    }

    currentMonthWorkDays.forEach(wd => {
      const schedule = schedules.find(s => s.date === wd.date);
      
      // Filter out schedules for programs that no longer exist
      const isValidSchedule = schedule && (
        !schedule.programId || 
        schedule.programId === 'manual' || 
        schedule.programId === 'history' || 
        programs.some(p => String(p.id) === String(schedule.programId))
      );

      const items = (isValidSchedule && schedule.assignments)
        ? schedule.assignments.map(a => ({
            applicant: applicants.find(p => p.id === a.applicantId)!,
            staffMembers: (a.staffIds || []).map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[]
          })).filter(i => i.applicant)
        : [];
      
      // Geçmiş günler geride kaldığı için, eğer herhangi bir atama yoksa listeye dahil etme
      if (wd.date <= todayStr && items.length === 0) {
        return;
      }
      
      result.push({ date: wd.date, items });
    });
    return result;
  }, [currentMonthWorkDays, schedules, applicants, staff, focusedProgramId]);

  const generateSchedule = async () => {
    if (applicants.length === 0) {
      toast.error('Lütfen önce hane ekleyin.');
      return;
    }

    // 1. Determine base planning start date (08:30 rule)
    const now = new Date();
    const tomorrowStr = format(addDays(now, 1), 'yyyy-MM-dd');
    const planningStartDate = tomorrowStr; // bugünden sonraki gün başla (her zaman)
    
    const activeProgram = programs.find(p => p.status === 'active');

    let actualPlanningStartDate = planningStartDate;
    
    if (activeProgram) {
      const daysLeft = differenceInDays(parseISO(activeProgram.endDate), now);
      if (daysLeft > 7) {
        toast.error(`Mevcut programın bitimine ${daysLeft} gün var. Yeni program ancak program bitimine 7 gün kala oluşturulabilir.`);
        return;
      }
      actualPlanningStartDate = format(addDays(parseISO(activeProgram.endDate), 1), 'yyyy-MM-dd');
      // Otomatik yeni program olarak devam et
    } else {
      // No active program, but there might be manual schedules in the future
      const manualSchedules = schedules.filter(s => s.date >= planningStartDate && (!s.programId || s.programId === ''));
      if (manualSchedules.length > 0) {
         const lastDate = [...manualSchedules].sort((a,b) => b.date.localeCompare(a.date))[0].date;
         actualPlanningStartDate = format(addDays(parseISO(lastDate), 1), 'yyyy-MM-dd');
      }
    }

    setIsGenerating(true);
    try {
      // 3. Determine starting applicant and cycle
      const sortedApplicants = [...applicants].sort((a, b) => (a.priority || 0) - (b.priority || 0));
      const lastProgram = await dbLocal.programs.orderBy("id").last();
      
      let globalStartIndex = 0;
      if (lastProgram && lastProgram.lastApplicantId) {
        const lastCycle = lastProgram.lastVisitCycle || 1;
        const lastIdxInCycle = sortedApplicants.findIndex(a => a.id === lastProgram.lastApplicantId);
        
        if (lastIdxInCycle !== -1) {
          const lastGlobalIndex = (lastCycle === 1) ? lastIdxInCycle : (sortedApplicants.length + lastIdxInCycle);
          globalStartIndex = (lastGlobalIndex + 1) % (sortedApplicants.length * 2);
        }
      }

      // We will loop through sortedApplicants indefinitely when planning a day.
      // 4. Determine pool size for work day calculation
      const totalRequiredVisits = applicants.reduce((sum, app) => {
        const scheduleCount = schedules.filter(s => s.assignments.some(a => a.applicantId === app.id)).length;
        return sum + Math.max(0, 2 - scheduleCount);
      }, 0);

      // 5. Find available work days starting from actualPlanningStartDate
      const explicitWorkSettings = await dbLocal.workDays.where("date").aboveOrEqual(actualPlanningStartDate).toArray();
      const settingsMap = new Map(explicitWorkSettings.map(s => [s.date, s.isWorkDay !== undefined ? s.isWorkDay : false]));
      const existingScheduleDates = new Set(schedules.map(s => s.date));
      
      let availableWorkDays: any[] = [];
      let checkDate = parseISO(actualPlanningStartDate);
      let daysChecked = 0;
      
      // Look ahead up to 90 days to find enough work days
      while (availableWorkDays.length < Math.max(60, Math.ceil(totalRequiredVisits / 3)) && daysChecked < 90) {
        const dateStr = format(checkDate, 'yyyy-MM-dd');
        const explicit = settingsMap.get(dateStr);
        
        let isUsable = false;
        if (explicit === true) isUsable = true;
        else if (explicit === false) isUsable = false;
        else if (!isWeekend(checkDate)) isUsable = true;
        
        if (isUsable && !existingScheduleDates.has(dateStr)) {
          availableWorkDays.push({ date: dateStr, isWorkDay: true });
        }
        checkDate = addDays(checkDate, 1);
        daysChecked++;
      }

      availableWorkDays.sort((a, b) => a.date.localeCompare(b.date));

      if (availableWorkDays.length === 0) {
        toast.error('Planlanacak uygun iş günü bulunamadı. Lütfen "İş Günleri" takviminden gelecek günler için iş günü tanımlayın veya tatilleri kontrol edin.');
        return;
      }

      // 6. Function to get teams for a specific date (ignoring staff on leave)
      const getTeamsForDate = (dateStr: string) => {
        const activeStaff = staff.filter(s => {
          if (s.isActive === false || s.isBackup === true) return false;
          if (s.name.toLowerCase().includes('deneme') || s.surname.toLowerCase().includes('deneme')) return false;
          // Check if on leave
          if (s.leaves && s.leaves.length > 0) {
            const onLeave = s.leaves.some(leave => dateStr >= leave.startDate && dateStr <= leave.endDate);
            if (onLeave) return false;
          }
          return true;
        });
        
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
        return dailyTeams;
      };

      // 7. Distribute into days respecting 14-day rule and 2 visits per month
      let lastAssignedId: string | undefined;
      let isLastDayOfProgram = false;

      const scheduleEntries: any[] = [];
      
      // Keep track of last visit date and team for each applicant
      const lastVisitMap = new Map<string, string>();
      const visitCountMap = new Map<string, number>();
      const lastTeamMap = new Map<string, string[]>();

      // Initialize with existing schedules
      const allExistingSchedules = await dbLocal.schedules.toArray();
      allExistingSchedules.sort((a, b) => a.date.localeCompare(b.date)).forEach(s => {
        s.assignments.forEach(a => {
          const prev = lastVisitMap.get(a.applicantId);
          if (!prev || s.date >= prev) {
            lastVisitMap.set(a.applicantId, s.date);
          }
          if (a.staffIds && a.staffIds.length > 0) {
            lastTeamMap.set(a.applicantId, a.staffIds);
          }
          visitCountMap.set(a.applicantId, (visitCountMap.get(a.applicantId) || 0) + 1);
        });
      });

      // We want to assign each applicant twice in the month
      // We'll create a pool where each applicant is present twice (minus existing visits this month)
      const targetVisits = 2;
      let applicantPool: Applicant[] = [];
      sortedApplicants.forEach(app => {
        const existingCount = visitCountMap.get(app.id!) || 0;
        const remaining = Math.max(0, targetVisits - existingCount);
        for (let j = 0; j < remaining; j++) {
            applicantPool.push(app);
        }
      });

      // Track resource sufficiency
      const totalAvailableCapacity = availableWorkDays.length * dailyLimit;
      if (applicantPool.length > totalAvailableCapacity) {
          toast.error(`Uyarı: Seçilen tarihler arasında toplam kapasite (${totalAvailableCapacity}) tüm hanelerin 2 kez ziyaret edilmesi için yeterli değil (${applicantPool.length} ziyaret gerekli). Bazı haneler sadece bir kez veya hiç planlanamayabilir.`);
      }

      for (let d = 0; d < availableWorkDays.length; d++) {
        const wd = availableWorkDays[d];
        const dailyAssignments: any[] = [];
        const targetDate = parseISO(wd.date);
        const dailyTeams = getTeamsForDate(wd.date);
        if (dailyTeams.length === 0) continue;
        
        const dailyTeamsList = dailyTeams.map(t => t.slice().sort().join(','));
        const dayTeamCounts = new Map<string, number>();

        for (let i = 0; i < dailyLimit; i++) {
          if (applicantPool.length === 0) {
            // Liste bittiğinde (havuz boşaldığında), eğer günlük limit dolmadıysa 
            // listenin başından günlük limiti tamamlayacak kadar kayıt ekle
            if (sortedApplicants.length > 0) {
               applicantPool.push(...sortedApplicants);
               // Havuz bittiği için bu gün programın son günü olacak
               isLastDayOfProgram = true;
            } else {
               break;
            }
          }

          let foundIdx = -1;
          
          // Try to find an applicant in the pool that satisfies the 14-day rule
          for (let pIdx = 0; pIdx < applicantPool.length; pIdx++) {
            const applicant = applicantPool[pIdx];
            const lastDateStr = lastVisitMap.get(applicant.id!);
            
            let isGapOk = true;
            if (lastDateStr) {
               const lastDate = parseISO(lastDateStr);
               if (Math.abs(differenceInDays(targetDate, lastDate)) < 14) {
                 isGapOk = false;
               }
            }

            const isAlreadyInDay = dailyAssignments.some(a => a.applicantId === applicant.id);

            if (isGapOk && !isAlreadyInDay) {
              foundIdx = pIdx;
              break;
            }
          }

          // If nobody satisfies 14-day rule, but pool isn't empty, 
          // we only pick if they are not already in the day (emergency fallback)
          if (foundIdx === -1) {
            for (let pIdx = 0; pIdx < applicantPool.length; pIdx++) {
               const applicant = applicantPool[pIdx];
               const isAlreadyInDay = dailyAssignments.some(a => a.applicantId === applicant.id);
               if (!isAlreadyInDay) {
                 foundIdx = pIdx;
                 break;
               }
            }
          }

          if (foundIdx !== -1) {
            const chosenApplicant = applicantPool.splice(foundIdx, 1)[0];
            
            // Try to assign the preferred team (last team to visit them)
            const preferredTeamIds = lastTeamMap.get(chosenApplicant.id!);
            let assignedTeam: string[] | null = null;
            
            if (preferredTeamIds && preferredTeamIds.length > 0) {
              const prefKey = preferredTeamIds.slice().sort().join(',');
              const teamIdx = dailyTeamsList.indexOf(prefKey);
              if (teamIdx !== -1) {
                const count = dayTeamCounts.get(prefKey) || 0;
                if (count < 2) {
                  assignedTeam = dailyTeams[teamIdx];
                  dayTeamCounts.set(prefKey, count + 1);
                }
              }
            }

            // Fallback to load balanced team assignment if preferred not found or full
            if (!assignedTeam) {
              // Find the team with the lowest count
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

            dailyAssignments.push({ 
              applicantId: chosenApplicant.id!,
              staffIds: assignedTeam || [],
              isCompleted: false
            });
            
            lastAssignedId = chosenApplicant.id;
            lastVisitMap.set(chosenApplicant.id!, wd.date);
            if (assignedTeam && assignedTeam.length > 0) {
              lastTeamMap.set(chosenApplicant.id!, assignedTeam);
            }
          }
        }
        
        if (dailyAssignments.length > 0) {
          // Assign shifts to the generated daily assignments
          const taggedDailyAssignments = tagAssignmentsWithShift(dailyAssignments, dailyLimit);

          scheduleEntries.push({
            date: wd.date,
            assignments: taggedDailyAssignments
          });
        }

        // Eğer havuz bittiyse ve son günü doldurduysak döngüden çık
        if (isLastDayOfProgram || applicantPool.length === 0) {
          break;
        }
      }

      // 8. Create Program Record
      // Determine final cycle based on how many times the last applicant has been visited
      const lastApplicantVisits = allExistingSchedules.flatMap(s => s.assignments).filter(a => a.applicantId === lastAssignedId).length + 
                                 scheduleEntries.flatMap(s => s.assignments).filter(a => a.applicantId === lastAssignedId).length;
      const finalCycle = (lastApplicantVisits % 2 === 0) ? 2 : 1;

      const programId = await dbLocal.programs.add({
        name: `${formatSafe(availableWorkDays[0].date, 'dd MMMM yyyy', { locale: tr })} - ${formatSafe(availableWorkDays[availableWorkDays.length - 1].date, 'dd MMMM yyyy', { locale: tr })} Vefa Programı`,
        startDate: availableWorkDays[0].date,
        endDate: availableWorkDays[availableWorkDays.length - 1].date,
        createdAt: new Date().toISOString(),
        status: 'active',
        lastApplicantId: lastAssignedId,
        lastVisitCycle: finalCycle
      });

      // 9. Save schedules
      const payloadSchedules = scheduleEntries.map(entry => ({
        ...entry,
        programId: programId as string
      }));
      await dbLocal.schedules.bulkAdd(payloadSchedules);
      
      const sessionDailyLimit = parseInt(localStorage.getItem('dailyLimit') || '6');
      await autoFillLastDayOfProgram(sessionDailyLimit);

      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Program Oluşturma', `${scheduleEntries.length} günlük yeni program oluşturuldu.`);
      toast.success('Planlama başarıyla tamamlandı.');
    } catch (error) {
      console.error("Error generating schedule:", error);
      toast.error('Planlama sırasında bir hata oluştu.');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCompletion = async (date: string, applicantId: string, note?: string) => {
    // Restriction: Cannot mark as completed if date is in the future
    const today = format(new Date(), 'yyyy-MM-dd');
    if (date > today) {
      toast.success('Gelecek tarihteki bir ziyaret henüz gerçekleşmediği için tamamlanamaz.');
      return;
    }

    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;

    const newAssignments = schedule.assignments.map(a => {
      if (a.applicantId === applicantId) {
        const isCompleted = !a.isCompleted;
        const applicant = applicants.find(p => p.id === applicantId);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, isCompleted ? 'Ziyaret Tamamlama' : 'Ziyaret Geri Alma', `${date} tarihindeki ${applicant?.name} ziyareti ${isCompleted ? 'tamamlandı' : 'tamamlanmadı olarak işaretlendi'}.${note ? ` Not: ${note}` : ''}`);

        const teamKey = [...(a.staffIds || [])].sort().join(',');
        const teamTasks = schedule.assignments.filter(sa => [...(sa.staffIds || [])].sort().join(',') === teamKey);
        const tIndex = teamTasks.findIndex(ta => ta.applicantId === applicantId);
        const isMorning = tIndex === 0;

        const targetDateObj = parseISO(date);
        const startDate = new Date(targetDateObj);
        const endDate = new Date(targetDateObj);
        
        if (isMorning) {
          startDate.setHours(9, 30, 0, 0);
          endDate.setHours(11, 30, 0, 0);
        } else {
          startDate.setHours(13, 30, 0, 0);
          endDate.setHours(16, 0, 0, 0);
        }

        let approvals = a.approvals || [];
        if (isCompleted) {
          approvals = (a.staffIds || []).map(staffId => {
            const existing = approvals.find(apr => apr.staffId === staffId) || { staffId, date };
            return {
              ...existing,
              startTime: startDate.toISOString(),
              endTime: endDate.toISOString()
            };
          });
        } else {
          approvals = approvals.map(apr => ({
            ...apr,
            startTime: undefined,
            endTime: undefined
          }));
        }

        return { 
          ...a, 
          isCompleted, 
          completionDate: isCompleted ? new Date().toISOString() : undefined,
          completionNote: isCompleted ? note : undefined,
          approvals
        };
      }
      return a;
    });

    await dbLocal.schedules.update(schedule.id!, { assignments: newAssignments });
    setCompletionModal(null);
    setCompletionNote('');
  };

  const updateStaffAssignment = async (date: string, applicantId: string, staffIndex: number, staffId: string) => {
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;

    const selectedStaff = staff.find(s => s.id === staffId);

    const newAssignments = schedule.assignments.map(a => {
      if (a.applicantId === applicantId) {
        const newStaffIds = [...(a.staffIds || [])];
        
        if (!staffId) { return { ...a, staffIds: [] }; } else {
          newStaffIds[staffIndex] = staffId;
          // If this staff has a partner, automatically set the partner in the other slot
          if (selectedStaff?.partnerId) {
            const otherIndex = staffIndex === 0 ? 1 : 0;
            newStaffIds[otherIndex] = selectedStaff.partnerId;
          }
        }
        return { ...a, staffIds: newStaffIds.filter(Boolean) }; // Filter out empty strings
      }
      return a;
    });

    await dbLocal.schedules.update(schedule.id!, { assignments: newAssignments });
  };

  const saveDay = async (date: string) => {
    setLastSavedDay(date);
    setTimeout(() => setLastSavedDay(null), 3000);
  };

  // Geocoding logic removed to prevent unauthorized backend updates on render.

  const reflowSchedules = async () => {
    if (!confirm('İş günleri değiştiği için programı kaydırmak istiyor musunuz? Bu işlem mevcut atamaları yeni iş günlerine sırasıyla dağıtacaktır.')) return;
    
    setIsGenerating(true);
    try {
      // 1. Get all schedules for this month
      const monthSchedules = schedules
        .filter(s => {
          const d = parseISO(s.date);
          return d >= monthStart && d <= monthEnd;
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      // 2. Separate completed and non-completed
      const completedSchedules = monthSchedules.filter(s => s.assignments.some(a => a.isCompleted));
      const nonCompletedSchedules = monthSchedules.filter(s => !s.assignments.some(a => a.isCompleted));
      
      const nonCompletedAssignments = nonCompletedSchedules.flatMap(s => s.assignments);
      
      if (nonCompletedAssignments.length === 0) {
        toast.success('Kaydırılacak (tamamlanmamış) planlama bulunamadı.');
        return;
      }

      // 3. Delete old non-completed schedules
      await dbLocal.schedules.bulkDelete(nonCompletedSchedules.map(s => s.id!));

      // 4. Get all work days for this month
      const monthWorkDays = currentMonthWorkDays;
      const completedDates = new Set(completedSchedules.map(s => s.date));
      
      // Filter work days that don't have a completed schedule
      const availableWorkDays = monthWorkDays.filter(wd => !completedDates.has(wd.date));

      // 5. Re-distribute assignments to new work days (dailyLimit per day) using greedy logic
      const tempPool = [...nonCompletedAssignments];
      const allSchedulesAfterReflow = [...completedSchedules];

      for (const wd of availableWorkDays) {
        const dailyAssignments: any[] = [];
        const targetDate = parseISO(wd.date);

        for (let i = 0; i < dailyLimit; i++) {
          let foundIdx = -1;
          // First pass: try to satisfy 14-day rule
          for (let pIdx = 0; pIdx < tempPool.length; pIdx++) {
            const item = tempPool[pIdx];
            const isAlreadyInDay = dailyAssignments.some(a => a.applicantId === item.applicantId);
            if (isAlreadyInDay) continue;

            const otherVisits = [
              ...allSchedulesAfterReflow.flatMap(as => as.assignments.filter(a => a.applicantId === item.applicantId).map(a => as.date)),
              ...dailyAssignments.filter(a => a.applicantId === item.applicantId).map(() => wd.date)
            ];
            let isGapOk = true;
            for (const vDateStr of otherVisits) {
              if (Math.abs(differenceInDays(targetDate, parseISO(vDateStr))) < 14) {
                isGapOk = false;
                break;
              }
            }
            if (isGapOk) {
              foundIdx = pIdx;
              break;
            }
          }

          // Second pass: fallback
          if (foundIdx === -1) {
            for (let pIdx = 0; pIdx < tempPool.length; pIdx++) {
              const item = tempPool[pIdx];
              const isAlreadyInDay = dailyAssignments.some(a => a.applicantId === item.applicantId);
              if (!isAlreadyInDay) {
                foundIdx = pIdx;
                break;
              }
            }
          }

          if (foundIdx !== -1) {
            dailyAssignments.push(tempPool.splice(foundIdx, 1)[0]);
          }
        }

        if (dailyAssignments.length > 0) {
          const newSchedule = {
            date: wd.date,
            assignments: dailyAssignments
          };
          await dbLocal.schedules.add(newSchedule);
          allSchedulesAfterReflow.push(newSchedule as any);
        }
      }
      
      // Handle leftovers if any
      if (tempPool.length > 0) {
        toast.error(`Uyarı: ${tempPool.length} ziyaret 14 gün kuralı nedeniyle bu aya sığmadı ve planlanamadı.`);
      }
      
      toast.success('Program başarıyla kaydırıldı.');
    } catch (error) {
      console.error("Error reflowing schedule:", error);
      toast.error('Program kaydırılırken bir hata oluştu.');
    } finally {
      setIsGenerating(false);
    }
  };

  const hasOrphanedSchedules = useMemo(() => {
    const monthSchedules = schedules.filter(s => {
      const d = parseISO(s.date);
      return d >= monthStart && d <= monthEnd;
    });
    return monthSchedules.some(s => !currentMonthWorkDays.some(wd => wd.date === s.date));
  }, [schedules, currentMonthWorkDays, monthStart, monthEnd]);

  const handleExportExcel = () => exportToExcel(assignments, selectedMonth);
  const handleExportPDF = () => exportToPDF(assignments, selectedMonth, currentUser);

  // Expand today or the first day that has items by default when the month changes or assignments load
  useEffect(() => {
    if (assignments.length > 0) {
      const isExpandedDayValid = assignments.some(a => a.date === expandedDay);
      if (!isExpandedDayValid) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const todayWithItems = assignments.find(a => a.date === todayStr && a.items.length > 0);
        
        if (todayWithItems) {
          setExpandedDay(todayStr);
        } else {
          const firstWithItems = assignments.find(a => a.items.length > 0);
          if (firstWithItems) {
            setExpandedDay(firstWithItems.date);
          } else {
            setExpandedDay(null);
          }
        }
      }
    } else {
      setExpandedDay(null);
    }
  }, [assignments, expandedDay]);

  const activeMarkers = useMemo(() => {
    if (!expandedDay) return [];
    const day = assignments.find(a => a.date === expandedDay);
    if (!day || !day.items || day.items.length === 0) return [];
    
    return day.items
      .map((item, i) => {
        const lat = (item.applicant.lat !== undefined && item.applicant.lat !== null && !isNaN(Number(item.applicant.lat))) 
          ? Number(item.applicant.lat) 
          : (41.675 + (i * 0.002));
        const lng = (item.applicant.lng !== undefined && item.applicant.lng !== null && !isNaN(Number(item.applicant.lng))) 
          ? Number(item.applicant.lng) 
          : (26.570 + (i * 0.002));
        
        return {
          pos: [lat, lng] as [number, number],
          name: `${item.applicant.name} ${item.applicant.surname}`,
          address: item.applicant.address
        };
      })
      .filter(m => !isNaN(m.pos[0]) && !isNaN(m.pos[1]));
  }, [expandedDay, assignments]);

  const isManualPlanDisabled = useMemo(() => {
    const activeProgram = programs.find(p => p.status === 'active');
    if (activeProgram) {
      const daysLeft = differenceInDays(parseISO(activeProgram.endDate), new Date());
      return daysLeft > 7;
    }
    return false;
  }, [programs]);

  const checkShiftDisabled = (date: string, applicantId: string) => {
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return { shiftDateDisabled: false, shiftWithinDayDisabled: false, swapDisabled: false, reason: '' };

    const assignment = schedule.assignments.find(a => a.applicantId === applicantId);
    if (!assignment) return { shiftDateDisabled: false, shiftWithinDayDisabled: false, swapDisabled: false, reason: '' };

    const isTaskCompleted = assignment.isCompleted;
    const isTaskStarted = assignment.approvals?.some((apr: any) => apr.startTime);

    if (isTaskCompleted) return { shiftDateDisabled: true, shiftWithinDayDisabled: true, swapDisabled: true, reason: 'Görev çoktan tamamlanmış.' };
    if (isTaskStarted) return { shiftDateDisabled: true, shiftWithinDayDisabled: true, swapDisabled: true, reason: 'Personel bu göreve başlamış. Önce yönetici müdahalesiyle iptal edilmeli veya bitirilmeli.' };

    const teamKey = [...(assignment.staffIds || [])].sort().join(',');
    const teamTasks = schedule.assignments.filter(a => [...(a.staffIds || [])].sort().join(',') === teamKey);
    const myIndex = teamTasks.findIndex(a => a.applicantId === applicantId);
    
    // Default disabled states
    let shiftDateDisabled = false;
    let shiftWithinDayDisabled = false;
    let swapDisabled = false;
    let reason = '';

    if (myIndex === 1) { // Afternoon task
      const morningTask = teamTasks[0];
      const morningStarted = morningTask?.approvals?.some((apr: any) => apr.startTime);
      const morningCompleted = morningTask?.isCompleted;

      if (morningCompleted) {
        shiftDateDisabled = true; // "sabah veya öğleden sonra için kaydırma işlemi sabah temizlik işi tamamlandıysa yapılamaz."
        shiftWithinDayDisabled = true;
        // Swap shouldn't be disabled? "ekipler arası değişim işlemi mümkün olabilir."
        reason = 'Sabah görevi tamamlandığı için bu takımın öğleden sonra görevi başka güne veya saate kaydırılamaz. (Sadece personeller arası değişime izin verilir.)';
      } else if (morningStarted) {
        // "ancak bir ekip üyesinin sabah temizlik işini başlatması sonrası gün içi kaydırma mümkün olmamalı"
        shiftWithinDayDisabled = true;
        // "ayrıca bir temizlik işi temizlik personeli tarafından başlatıldıysa yönetici iptal etmeden kaydırma işlemi yapılmaması gerekiyor"
        // (this already caught by `isTaskStarted` for the task itself, but does morning start block afternoon date shift? The prompt initially said: "sabah temizlik işi *tamamlandıysa* yapılamaz". But we'll block it to be safe or not?)
        // Let's block shiftWithinDay (Up/Down) if morning is started.
        reason = 'Sabah görevi başlatıldığı için bu takımın öğleden sonra görevinin sırası değiştirilemez.';
      }
    }

    return { shiftDateDisabled, shiftWithinDayDisabled, swapDisabled, reason };
  };

  return (
    <div className="space-y-6 relative">
      {/* Loading Overlay for Rescheduling */}
      {isRescheduling && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9999] flex items-center justify-center">
          <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm font-bold text-gray-900">Planlama Güncelleniyor...</p>
          </div>
        </div>
      )}



      {/* Reschedule Day Modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Günü İptal Et ve Kaydır</h3>
            <p className="text-sm text-gray-500 mb-4">
              {formatSafe(rescheduleModal.date, 'dd MMMM yyyy', { locale: tr })} tarihindeki ziyaretleri kaydırın.
            </p>

            {/* Shift selection */}
            {(() => {
              const daySched = schedules.find(s => s.date === rescheduleModal.date);
              const hasShiftData = daySched?.assignments.some(a => a.shift);
              const hasMorning = daySched?.assignments.some(a => !a.isCompleted && a.shift === 'morning');
              const hasAfternoon = daySched?.assignments.some(a => !a.isCompleted && a.shift === 'afternoon');
              const hasUntagged = daySched?.assignments.some(a => !a.isCompleted && !a.shift);

              return hasShiftData ? (
                <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Hangi Vardiyayı İptal Edeceksiniz?</p>
                  <div className="flex gap-2">
                    {hasMorning && (
                      <button
                        onClick={() => setSelectedCancelShift(selectedCancelShift === 'morning' ? undefined : 'morning')}
                        className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                          selectedCancelShift === 'morning'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                        }`}
                      >
                        🌅 Sabah
                      </button>
                    )}
                    {hasAfternoon && (
                      <button
                        onClick={() => setSelectedCancelShift(selectedCancelShift === 'afternoon' ? undefined : 'afternoon')}
                        className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                          selectedCancelShift === 'afternoon'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        🌇 Öğleden Sonra
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedCancelShift(undefined)}
                      className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                        selectedCancelShift === undefined
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      🗓 Tüm Gün
                    </button>
                  </div>
                  {selectedCancelShift && (
                    <p className="text-[10px] text-slate-400 mt-2 text-center">
                      {selectedCancelShift === 'morning' ? '☀️ Sabah' : '🌆 Öğleden sonra'} görevi kaydırılacak.
                      Diğer vardiya bu günde kalacak.
                    </p>
                  )}
                </div>
              ) : null;
            })()}
            
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleCancelDay(rescheduleModal.date, undefined, selectedCancelShift)}
                className="w-full py-3 px-4 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all text-left flex items-center justify-between"
              >
                <span>Bir Sonraki İş Gününe Kaydır</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Belirli Bir Tarihe Kaydır</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    min={format(addDays(parseISO(rescheduleModal.date), 1), 'yyyy-MM-dd')}
                    value={targetRescheduleDate}
                    onChange={(e) => setTargetRescheduleDate(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    disabled={!targetRescheduleDate}
                    onClick={() => handleCancelDay(rescheduleModal.date, targetRescheduleDate, selectedCancelShift)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                  >
                    Uygula
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setRescheduleModal(null);
                setTargetRescheduleDate('');
                setSelectedCancelShift(undefined);
              }}
              className="w-full py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-all"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}


      {/* Shift Single Assignment Modal */}
      {shiftAssignmentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Hanenin Gününü Değiştir veya Pasife Al</h3>
            <p className="text-sm text-gray-500 mb-6">
              <strong className="text-gray-800">{shiftAssignmentModal.name}</strong> hanesine ait {formatSafe(shiftAssignmentModal.date, 'dd MMMM yyyy', { locale: tr })} tarihindeki temizlik işi hakkında yapmak istediğiniz işlemi seçin.
            </p>
            
            <div className="space-y-3 mb-6">
              <button
                onClick={() => performShiftAssignment(shiftAssignmentModal.date, shiftAssignmentModal.applicantId)}
                className="w-full py-3 px-4 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all text-left flex items-center justify-between"
              >
                <div>
                  <div className="block">Sıradaki İlk Boşluğa Kaydır</div>
                  <div className="text-xs font-normal opacity-80">Sonraki güne kaydırıp tüm planları ileri öteler</div>
                </div>
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Belirli Bir Tarihe Kaydır</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    min={format(addDays(parseISO(shiftAssignmentModal.date), 1), 'yyyy-MM-dd')}
                    value={targetAssignmentDate}
                    onChange={(e) => setTargetAssignmentDate(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    disabled={!targetAssignmentDate}
                    onClick={() => performShiftAssignment(shiftAssignmentModal.date, shiftAssignmentModal.applicantId, targetAssignmentDate)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                  >
                    Uygula
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                     const reason = prompt('Mazeret veya sebep giriniz (opsiyonel):');
                     if (reason !== null) {
                       performCancelAssignment(shiftAssignmentModal.date, shiftAssignmentModal.applicantId, reason);
                     }
                  }}
                  className="w-full py-3 px-4 bg-rose-50 text-rose-700 rounded-xl text-sm font-bold hover:bg-rose-100 transition-all text-left flex items-center justify-between"
                >
                  <div>
                    <div className="block">İptal Et (Pasife Al)</div>
                    <div className="text-xs font-normal opacity-80">Bugünkü temizliği mazeretli say, diğer günleri etkileme</div>
                  </div>
                  <AlertTriangle className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <button
              onClick={() => {
                setShiftAssignmentModal(null);
                setTargetAssignmentDate('');
              }}
              className="w-full py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-all"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* Completion Note Modal */}
      {completionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Temizlik Tamamlandı</h3>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-semibold text-blue-600">{completionModal.name}</span> hanenin evi için temizlik bitti. Varsa eklemek istediğiniz bilgileri yazın.
            </p>
            <textarea
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              placeholder="Ev durumu, yapılan işlemler veya özel notlar..."
              className="w-full h-32 p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCompletionModal(null)}
                className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-all"
              >
                Vazgeç
              </button>
              <button
                onClick={() => toggleCompletion(completionModal.date, completionModal.applicantId, completionNote)}
                className="flex-1 py-3 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all shadow-lg shadow-green-100"
              >
                Onayla ve Bitir
              </button>
            </div>
          </div>
        </div>
      )}

      {isGeocodingDay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full text-center animate-in zoom-in duration-300">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
              <MapIcon className="w-6 h-6 text-blue-600 absolute inset-0 m-auto" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Lütfen Bekleyin</h3>
              <p className="text-gray-500 leading-relaxed">Konumlar harita üzerinde işaretleniyor. Bu işlem birkaç saniye sürebilir...</p>
            </div>
            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full animate-progress" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900">Program Planlama</h2>
          <p className="text-xs lg:text-sm text-gray-500">Mahalle bazlı otomatik planlama ve personel ataması.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowMap(!showMap)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl transition-all border text-sm font-bold ${showMap ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            <MapIcon className="w-4 h-4 lg:w-5 lg:h-5" />
            <span>Harita</span>
          </button>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">Günlük Limit:</span>
              <input 
                type="number" 
                min="1" 
                max="20"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Math.max(1, e.target.value || 1))}
                className="w-12 text-center text-sm font-bold text-blue-600 bg-transparent border-none focus:ring-0 p-0"
              />
            </div>
          </div>
          <button
            onClick={() => {
              if (isManualPlanDisabled) {
                toast.error('Mevcut programın bitimine 7 günden fazla var. Yeni manuel program ancak program bitimine 7 gün kala oluşturulabilir.');
                return;
              }
              setShowManualPlanner(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm font-bold"
          >
            <Settings2 className="w-4 h-4 lg:w-5 lg:h-5" />
            <span>Manuel Planla</span>
          </button>
          <button
            onClick={generateSchedule}
            disabled={isGenerating}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 text-sm font-bold"
          >
            <Wand2 className={`w-4 h-4 lg:w-5 lg:h-5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Otomatik Planla</span>
          </button>
          <button
            onClick={handleCleanupOverloaded}
            disabled={isCleaningUp}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-rose-500 text-white px-4 py-2 rounded-xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-100 disabled:opacity-50 text-sm font-bold"
            title="Aynı ekibe aynı günde 2'den fazla atanmış görevleri kaydırır"
          >
            <RefreshCw className={`w-4 h-4 lg:w-5 lg:h-5 ${isCleaningUp ? 'animate-spin' : ''}`} />
            <span>Programı Düzelt</span>
          </button>
          {hasOrphanedSchedules && (
            <button
              onClick={reflowSchedules}
              disabled={isGenerating}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 animate-pulse text-sm font-bold"
            >
              <CalendarIcon className="w-4 h-4 lg:w-5 lg:h-5" />
              <span>Kaydır</span>
            </button>
          )}
          <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white w-full sm:w-auto">
            <button onClick={handleExportExcel} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 hover:bg-gray-50 text-green-700 border-r border-gray-200 text-sm font-bold">
              <FileSpreadsheet className="w-4 h-4 lg:w-5 lg:h-5" /> <span>Excel</span>
            </button>
            <button onClick={handleExportPDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 hover:bg-gray-50 text-red-700 text-sm font-bold">
              <FileText className="w-4 h-4 lg:w-5 lg:h-5" /> <span>PDF</span>
            </button>
          </div>
        </div>
      </div>

      {showMap && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-[400px] relative z-0">
          <MapGL
            mapLib={maplibregl}
            initialViewState={{
              latitude: 41.675,
              longitude: 26.570,
              zoom: 13
            }}
            mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />
            {activeMarkers.map((m, i) => (
              <Marker 
                key={`${expandedDay}-${i}`} 
                latitude={m.pos[0]} 
                longitude={m.pos[1]}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setHoveredMarker(i);
                }}
              >
                <div className="group relative">
                  <div 
                    className="w-6 h-6 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                    onMouseEnter={() => setHoveredMarker(i)}
                  >
                    <MapIcon className="w-3 h-3 text-white" />
                  </div>
                </div>
              </Marker>
            ))}

            {hoveredMarker !== null && activeMarkers[hoveredMarker] && (
              <Popup
                latitude={activeMarkers[hoveredMarker].pos[0]}
                longitude={activeMarkers[hoveredMarker].pos[1]}
                anchor="bottom"
                onClose={() => setHoveredMarker(null)}
                closeButton={false}
                maxWidth="300px"
              >
                <div className="bg-white px-1 py-1 whitespace-nowrap flex flex-col gap-1">
                  <div className="font-bold text-xs text-gray-900">{activeMarkers[hoveredMarker].name}</div>
                  <div className="text-[10px] text-gray-500">{activeMarkers[hoveredMarker].address}</div>
                  <a 
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${activeMarkers[hoveredMarker].pos[0]},${activeMarkers[hoveredMarker].pos[1]}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1.5 rounded inline-flex items-center justify-center gap-1 mt-1 font-bold transition-colors"
                  >
                    <Eye className="w-3 h-3" /> Sokak Görünümü
                  </a>
                </div>
              </Popup>
            )}
            {expandedDay && activeMarkers.length > 0 && <MapUpdater markers={activeMarkers} />}
          </MapGL>
          {!expandedDay && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 pointer-events-none">
              <p className="text-white font-bold bg-black/60 px-4 py-2 rounded-full">Haritada görmek için bir gün seçin</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 lg:p-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
          <input 
            type="month" 
            value={format(selectedMonth, 'yyyy-MM')}
            onChange={(e) => {
              const d = parseISO(`${e.target.value}-01`);
              if (!isNaN(d.getTime())) {
                setSelectedMonth(d);
              }
            }}
            className="w-full sm:w-auto px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
          />
          <div className="text-xs lg:text-sm font-bold text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm">
            <span className="text-blue-600">{currentMonthWorkDays.length}</span> İŞ GÜNÜ
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {assignments.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="bg-orange-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-orange-100">
                <CalendarIcon className="w-8 h-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Mevcut Planlama Bulunamadı</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
                Sistemde seçili ay için planlanmış herhangi bir ziyaret veya manuel atama bulunmamaktadır. Lütfen yukarıdaki "Planla" butonunu kullanarak yeni bir program oluşturun.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => {
                    if (isManualPlanDisabled) {
                      toast.error('Mevcut programın bitimine 7 günden fazla var. Yeni manuel program ancak program bitimine 7 gün kala oluşturulabilir.');
                      return;
                    }
                    setShowManualPlanner(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-100 min-w-[200px]"
                >
                  <Settings2 className="w-5 h-5" />
                  Manuel Planla
                </button>
                <button
                  onClick={generateSchedule}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-100 min-w-[200px]"
                >
                  <Wand2 className="w-5 h-5" />
                  Otomatik Planla
                </button>
              </div>
            </div>
          ) : (
            assignments.map(a => {
              const currentDaySchedule = schedules.find(sc => sc.date === a.date);
              const uncompletedItems = a.items.filter(i => {
                const ass = currentDaySchedule?.assignments.find(as => as.applicantId === i.applicant.id);
                return !ass?.isCompleted;
              });
              const shiftStati = uncompletedItems.map(i => checkShiftDisabled(a.date, i.applicant.id!));
              const hasUnshiftableUncompletedTask = shiftStati.some(s => s.shiftDateDisabled);
              const dayShiftReason = shiftStati.find(s => s.shiftDateDisabled)?.reason;

              return (
              <div key={a.date} className={`transition-all ${expandedDay === a.date ? 'bg-blue-50/30' : ''}`}>
                <div 
                  className="px-4 lg:px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedDay(expandedDay === a.date ? null : a.date)}
                >
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-10 lg:w-12 text-center">
                      <div className="text-base lg:text-lg font-bold text-gray-900 leading-none">{formatSafe(a.date, 'dd')}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold mt-1">{formatSafe(a.date, 'EEE', { locale: tr })}</div>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div className="min-w-0">
                      <div className="text-xs lg:text-sm font-bold text-gray-700 truncate max-w-[150px] sm:max-w-xs">
                        {a.items.length > 0 ? `${a.items[0].applicant.address}` : 'Atama Yapılmamış'}
                      </div>
                      <div className="text-[10px] lg:text-xs text-gray-400 font-medium">{a.items.length} Hane</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!a.items.every(i => {
                      const s = schedules.find(sc => sc.date === a.date);
                      const ass = s?.assignments.find(as => as.applicantId === i.applicant.id);
                      return ass?.isCompleted;
                    }) && a.items.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasUnshiftableUncompletedTask) {
                            toast.error(dayShiftReason || 'Gün içindeki bazı ziyaretlere başlandığı veya atamalarına engel olan durumlar bulunduğu için gün tamamen kaydırılamaz.');
                            return;
                          }
                          setRescheduleModal({ date: a.date });
                        }}
                        className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${hasUnshiftableUncompletedTask ? 'text-gray-400 opacity-50 cursor-not-allowed hidden sm:flex' : 'text-orange-600 hover:bg-orange-50'}`}
                        title={hasUnshiftableUncompletedTask ? dayShiftReason : "Günü İptal Et ve Kaydır"}
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-[10px] font-bold hidden sm:inline">GÜNÜ KAYDIR</span>
                      </button>
                    )}
                    {a.items.every(i => {
                      const s = schedules.find(sc => sc.date === a.date);
                      const ass = s?.assignments.find(as => as.applicantId === i.applicant.id);
                      return ass?.isCompleted;
                    }) && a.items.length > 0 && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                    {expandedDay === a.date ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </div>

                {expandedDay === a.date && (
                  <div className="px-4 lg:px-6 pb-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {a.items.map((item, idx) => {
                        const schedule = schedules.find(s => s.date === a.date);
                        const assignment = schedule?.assignments[idx];
                        const isCompleted = assignment?.isCompleted;
                        const isCancelled = assignment?.isCancelled;
                        const isSelectedForSwap = swapSelection?.date === a.date && swapSelection?.applicantId === item.applicant.id;

                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                        const isFuture = a.date > todayStr;
                        const isPast = a.date < todayStr;
                        const shiftStatus = checkShiftDisabled(a.date, item.applicant.id!);

                        return (
                          <div key={idx} className={`official-card p-4 flex flex-col gap-3 relative transition-all ${
                            isCompleted ? 'bg-emerald-50 border-emerald-100 shadow-none' : 
                            isCancelled ? 'bg-rose-50 border-rose-100 shadow-none' :
                            isSelectedForSwap ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-100' : 'bg-white'
                          }`}>
                            {/* Timing Label (Sabah/Öğleden Sonra) */}
                            {(() => {
                              const teamKey = item.staffMembers.map(s => s.id).sort().join(',');
                              const teamTasks = a.items.filter(it => it.staffMembers.map(s => s.id).sort().join(',') === teamKey);
                              const teamTasksIndex = a.items.slice(0, idx).filter(it => it.staffMembers.map(s => s.id).sort().join(',') === teamKey).length;
                              
                              if (teamTasks.length === 2) {
                                const label = teamTasksIndex === 0 ? 'Sabah' : 'Öğleden Sonra';
                                return (
                                  <div className={`absolute top-0 right-0 mt-2 mr-2 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest z-10 ${
                                    label === 'Sabah' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                                  }`}>
                                    {label}
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[10px] font-extrabold bg-institution-blue text-white w-5 h-5 flex items-center justify-center rounded uppercase">
                                    {idx + 1}
                                  </span>
                                  <h4 className="font-bold text-slate-900 truncate text-sm">
                                    {item.applicant.name} {item.applicant.surname}
                                  </h4>
                                </div>
                                <div className="text-[10px] text-institution-blue font-bold truncate uppercase tracking-tight">
                                  {item.applicant.neighborhood}
                                </div>
                                <div className="text-[9px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-slate-300" />
                                  <span className="truncate">{item.applicant.address}</span>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <div className="text-[10px] font-mono font-bold text-slate-400">
                                  {item.applicant.tcNo}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  if (shiftStatus.swapDisabled && !isSelectedForSwap) {
                                    toast.error(shiftStatus.reason);
                                    return;
                                  }
                                  handleSwap(a.date, item.applicant.id!);
                                }}
                                disabled={isCompleted || isPast || (shiftStatus.swapDisabled && !isSelectedForSwap)}
                                className={`flex-1 py-1 text-[10px] font-bold rounded-xl border transition-all flex items-center justify-center gap-1 ${
                                  isSelectedForSwap 
                                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                } disabled:opacity-30 disabled:cursor-not-allowed`}
                                title={shiftStatus.swapDisabled && !isSelectedForSwap ? shiftStatus.reason : (isSelectedForSwap ? "Hedef" : "Değiştir")}
                              >
                                <RefreshCw className={`w-3 h-3 ${isSelectedForSwap ? 'animate-spin' : ''}`} />
                                {isSelectedForSwap ? 'Hedef' : 'Değiştir'}
                              </button>

                              {!isCompleted && (
                                <button
                                  onClick={() => {
                                    if (shiftStatus.shiftDateDisabled) {
                                      toast.error(shiftStatus.reason);
                                      return;
                                    }
                                    setShiftAssignmentModal({ date: a.date, applicantId: item.applicant.id!, name: `${item.applicant.name} ${item.applicant.surname}` });
                                  }}
                                  disabled={isPast || shiftStatus.shiftDateDisabled}
                                  className="p-1.5 rounded-xl transition-all flex items-center justify-center border disabled:opacity-30 disabled:cursor-not-allowed bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100"
                                  title={shiftStatus.shiftDateDisabled ? shiftStatus.reason : "Günü Değiştir ve Kaydır"}
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                              )}
                              
                              <button
                                onClick={() => moveAssignment(a.date, idx, 'up')}
                                disabled={isCompleted || idx === 0 || shiftStatus.shiftWithinDayDisabled}
                                className="p-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                title={shiftStatus.shiftWithinDayDisabled ? shiftStatus.reason : "Sırayı Yukarı Taşı (Sabah)"}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => moveAssignment(a.date, idx, 'down')}
                                disabled={isCompleted || idx === a.items.length - 1 || shiftStatus.shiftWithinDayDisabled}
                                className="p-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                title={shiftStatus.shiftWithinDayDisabled ? shiftStatus.reason : "Sırayı Aşağı Taşı (Öğleden Sonra)"}
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <button
                              disabled={(isFuture && !isCompleted && !isCancelled) || (isPast && isCompleted)}
                              onClick={() => {
                                if (!isCompleted && !isCancelled) {
                                  setCompletionModal({ date: a.date, applicantId: item.applicant.id!, name: `${item.applicant.name} ${item.applicant.surname}` });
                                } else if (isCancelled) {
                                  if (window.confirm('Bu pasife alma (iptal) işlemini geri almak istediğinize emin misiniz?')) {
                                    const schedule = schedules.find(s => s.date === a.date);
                                    if (schedule) {
                                      const updatedAssignments = schedule.assignments.map(assign => assign.applicantId === item.applicant.id ? { ...assign, isCancelled: false, cancelReason: undefined } : assign);
                                      dbLocal.schedules.update(schedule.id!, { assignments: updatedAssignments });
                                      toast.success('İptal işlemi geri alındı.');
                                    }
                                  }
                                } else if (isCompleted) {
                                  if (a.date === todayStr) {
                                    if (window.confirm('Bu ziyareti tamamlanmamış olarak işaretleyip geri almak istediğinize emin misiniz?')) {
                                      toggleCompletion(a.date, item.applicant.id!);
                                    }
                                  } else {
                                    toggleCompletion(a.date, item.applicant.id!);
                                  }
                                }
                              }}
                              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                isCompleted 
                                  ? (isPast ? 'bg-gray-100 text-gray-300' : 'bg-slate-100 text-slate-400 hover:bg-slate-200') 
                                  : isCancelled
                                  ? 'bg-rose-100 text-rose-600'
                                  : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-100'
                              } disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed`}
                            >
                              {isCompleted ? <RefreshCw className="w-3.5 h-3.5" /> : isCancelled ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                              <span className="truncate max-w-[200px]">
                                {isCompleted ? (isPast ? 'Geri Alınamaz' : 'Geri Al') : isCancelled ? `İptal: ${assignment?.cancelReason}` : (isFuture ? 'Zamanı Bekleniyor' : 'Ziyareti Tamamla')}
                              </span>
                            </button>

                            <div className="space-y-4 pt-2 border-t border-slate-50">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <MapPin className="w-3 h-3" />
                                  Ziyaret Edilecek Hane
                                </label>
                                <select
                                  value={item.applicant.id || ''}
                                  disabled={isCompleted}
                                  onChange={(e) => {
                                    const newId = e.target.value;
                                    if (schedule) {
                                      const check = validateAssignment(newId, a.date, schedules, schedule.id);
                                      if (!check.valid) {
                                        toast.error(check.message);
                                        return;
                                      }
                                      const newAssignments = schedule.assignments.map((assignment, i) => 
                                        i === idx ? { ...assignment, applicantId: newId } : assignment
                                      );
                                      dbLocal.schedules.update(schedule.id!, { assignments: newAssignments });
                                    }
                                  }}
                                  className="w-full text-xs font-bold bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-institution-blue/20 transition-all disabled:opacity-50 appearance-none"
                                >
                                    {applicants.map(app => (
                                      <option key={app.id} value={app.id}>
                                        {app.name} {app.surname}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <Users className="w-3 h-3" />
                                  Görevli Ekip
                                </label>
                                {item.staffMembers.length > 0 && (
                                  <div className="text-[11px] font-bold text-slate-700 bg-institution-blue/5 border border-institution-blue/20 p-2 rounded-xl text-center mb-2 shadow-sm">
                                    {item.staffMembers.map(s => s.name + ' ' + s.surname).join(' - ')}
                                  </div>
                                )}
                                <div className="flex gap-2 items-center">
                                  <select
                                    value={item.staffMembers[0]?.id ? (staff.find(st => st.id === item.staffMembers[0]?.id)?.partnerId ? (item.staffMembers[0].id < staff.find(st => st.id === item.staffMembers[0]?.id)!.partnerId! ? item.staffMembers[0].id : staff.find(st => st.id === item.staffMembers[0]?.id)!.partnerId!) : item.staffMembers[0].id) : ''}
                                    disabled={isCompleted}
                                    onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, 0, e.target.value)}
                                    className="flex-1 text-[10px] font-bold bg-slate-50 border border-slate-100 rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-institution-blue/20 transition-all disabled:opacity-50 appearance-none text-center"
                                  >
                                    <option value="">Ekip Seç...</option>
                                    {staff.reduce((acc, s) => {
                                      const teamId = s.partnerId ? (s.id < s.partnerId ? s.id : s.partnerId) : s.id;
                                      if (!acc.some(t => t.id === teamId)) {
                                        const partner = staff.find(p => p.id === s.partnerId);
                                        acc.push({
                                          id: teamId,
                                          name: partner ? `${s.name} ${s.surname} - ${partner.name} ${partner.surname}` : `${s.name} ${s.surname}`,
                                          staff1Id: s.id,
                                          staff2Id: s.partnerId
                                        });
                                      }
                                      return acc;
                                    }, [] as {id: string, name: string, staff1Id: string, staff2Id?: string}[]).map(t => {
                                      // Check how many tasks this team already has today
                                      const assignmentsOnSameDay = a.items.filter(i => 
                                        i.staffMembers.some(sm => sm.id === t.staff1Id || sm.id === t.staff2Id)
                                      );
                                      // If they already have 2 tasks, and THIS task is not one of them, disable!
                                      const isAlreadyInThisTask = item.staffMembers.some(sm => sm.id === t.staff1Id || sm.id === t.staff2Id);
                                      const isDisabled = assignmentsOnSameDay.length >= 2 && !isAlreadyInThisTask;
                                      
                                      return (
                                        <option key={t.id} value={t.id} disabled={isDisabled}>
                                          {t.name} {isDisabled ? '(Dolu)' : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {item.staffMembers.length > 0 && !isCompleted && (
                                    <button 
                                      onClick={() => updateStaffAssignment(a.date, item.applicant.id!, 0, '')}
                                      className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl border border-slate-100 transition-colors"
                                      title="Ekibi Bu Görevden Çıkar"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="pt-2">
                              <button 
                                onClick={() => {
                                  const applicant = item.applicant;
                                  const url = `https://www.google.com/maps/dir/?api=1&destination=${applicant.lat},${applicant.lng}`;
                                  window.open(url, '_blank');
                                }}
                                className="w-full py-2.5 text-[10px] font-bold rounded-xl bg-institution-blue text-white hover:bg-institution-dark shadow-sm transition-all flex items-center justify-center gap-2"
                              >
                                <MapIcon className="w-3.5 h-3.5" />
                                <span className="uppercase tracking-widest">Yol Tarifi Al</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* BOŞTAKİ PERSONELLER VE ÖZEL GÖREVLER */}
                    <div className="mt-8 pt-6 border-t border-slate-200">
                      <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-500" /> Boşta Kalan Personeller ve Özel Görevler
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {(() => {
                          const cSchedule = schedules.find(sc => sc.date === a.date);
                          const assignedStaffIds = new Set(
                            cSchedule?.assignments.flatMap(as => as.staffIds || []) || []
                          );
                          const customTasks = cSchedule?.customTasks || [];
                          
                          const idleStaff = staff.filter(s => {
                            if (!s.isActive) return false;
                            
                            // İzinli mi?
                            if (s.leaves) {
                               const isOnLeave = s.leaves.some(l => 
                                 l.startDate <= a.date && l.endDate >= a.date
                               );
                               if (isOnLeave) return false;
                            }
                            
                            // Ziyaret ataması var mı?
                            if (assignedStaffIds.has(s.id!)) return false;

                            return true;
                          });

                          if (idleStaff.length === 0) {
                            return <div className="text-xs text-slate-500 col-span-full">Bu gün için tüm aktif personeller bir göreve atanmış veya izinli.</div>;
                          }

                          return idleStaff.map(s => {
                            const existingTask = customTasks.find(t => t.staffId === s.id);
                            const inputKey = `${a.date}_${s.id}`;
                            const inputValue = customTaskInputs[inputKey] !== undefined ? customTaskInputs[inputKey] : (existingTask?.taskDescription || '');

                            return (
                              <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-3 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                                      {s.name[0]}{s.surname[0]}
                                    </div>
                                    <span className="text-xs font-bold text-slate-700">{s.name} {s.surname}</span>
                                  </div>
                                  {existingTask && (
                                    <span className="text-[9px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full uppercase">Görevli</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="text" 
                                    placeholder="Örn: Ofis İşi, Depo Temizliği..."
                                    value={inputValue}
                                    onChange={e => setCustomTaskInputs(prev => ({ ...prev, [inputKey]: e.target.value }))}
                                    className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                                  />
                                  <button 
                                    onClick={() => saveCustomTask(a.date, s.id!, inputValue, existingTask?.id)}
                                    className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                  {existingTask && (
                                    <button 
                                      onClick={() => {
                                        if(confirm('Görevi silmek istediğinize emin misiniz?')) {
                                          saveCustomTask(a.date, s.id!, '', existingTask.id);
                                        }
                                      }}
                                      className="bg-red-50 text-red-600 p-1.5 rounded-lg hover:bg-red-100 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
            })
          )}
        </div>
      </div>
      
      {showManualPlanner && (
        <ManualSchedulePlanner 
          applicants={applicants}
          staff={staff}
          workDays={workDays}
          schedules={schedules}
          currentUser={currentUser}
          onClose={() => setShowManualPlanner(false)}
        />
      )}
    </div>
  );
}
