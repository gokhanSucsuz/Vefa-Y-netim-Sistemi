import { useState, useMemo, useEffect, useRef } from 'react';
import { dbLocal } from '../db';
import { Applicant, Staff, WorkDay, Schedule, DailyAssignment, EDIRNE_NEIGHBORHOODS, Program, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { format, startOfMonth, endOfMonth, parseISO, addDays, differenceInDays, isWeekend } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Wand2, FileSpreadsheet, FileText, Users, Map as MapIcon, ChevronDown, ChevronUp, Calendar as CalendarIcon, CheckCircle2, AlertTriangle, Clock, Download, ChevronRight, RefreshCw, MapPin, Search, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import { APP_LOGO_URL } from '../constants/logo';
import { setupPdfMakeFonts } from '../lib/pdfFonts';
import { formatPhone, formatTC } from '../lib/format';
import { Map as MapGL, Marker, Popup, NavigationControl, useMap } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { geocodeAddress } from '../services/geocoding';
import { EDIRNE_NEIGHBORHOOD_COORDS } from '../constants/edirne_data';

// MapLibre GL JS doesn't need the Leaflet icon fix

interface Props {
  applicants: Applicant[];
  staff: Staff[];
  workDays: WorkDay[];
  schedules: Schedule[];
  programs: Program[]; // Added programs prop
  currentUser: SystemUser;
  initialDate?: string | null;
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

export default function ScheduleView({ applicants, staff, workDays, schedules, programs, currentUser, initialDate }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastSavedDay, setLastSavedDay] = useState<string | null>(null);
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
  const [shiftAssignmentModal, setShiftAssignmentModal] = useState<{ date: string; applicantId: string; name: string } | null>(null);
  const [targetAssignmentDate, setTargetAssignmentDate] = useState('');
  const [dailyLimit, setDailyLimit] = useState(() => {
    const saved = localStorage.getItem('dailyLimit');
    return saved ? parseInt(saved) : 6;
  });

  const formatSafe = (dateStr: string, formatStr: string, options?: any) => {
    if (!dateStr) return '-';
    try {
      const d = parseISO(dateStr);
      if (isNaN(d.getTime())) return '-';
      return format(d, formatStr, options);
    } catch {
      return '-';
    }
  };

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

  const reportRef = useRef<HTMLDivElement>(null);

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
      alert(`Hata (${applicants.find(a => a.id === swapSelection.applicantId)?.name}): ${check1.message}`);
      return;
    }

    const check2 = validateAssignment(applicantId, swapSelection.date, schedules, schedule2.id);
    if (!check2.valid) {
      alert(`Hata (${applicants.find(a => a.id === applicantId)?.name}): ${check2.message}`);
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
    alert('Haneler başarıyla yer değiştirildi.');
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
          alert('Tamamlanmış bir ziyaret iptal edilemez.');
          return;
        }

        let uncompletedPool: any[] = [];
        for (const s of futureSchedules) {
          const uncompletedInDay = s.assignments.filter(a => !a.isCompleted);
          uncompletedPool.push(...uncompletedInDay);
        }

        const poolIdx = uncompletedPool.findIndex(a => a.applicantId === applicantId);
        if (poolIdx === -1) return;

        const [item] = uncompletedPool.splice(poolIdx, 1);
        
        let insertIndex = 0;
        if (targetDateStr) {
          for (const s of futureSchedules) {
            if (s.date >= targetDateStr) break;
            insertIndex += s.assignments.filter(a => !a.isCompleted).length;
          }
          if (targetDateStr > date) {
            insertIndex = Math.max(0, insertIndex - 1);
          }
        } else {
          insertIndex = currentDaySchedule.assignments.filter(a => !a.isCompleted).length - 1;
        }
        
        uncompletedPool.splice(insertIndex, 0, item);

        // 6. Redistribute back to schedules using greedy logic to respect 14-day rule
        let poolOffset = 0;
        const tempPool = [...uncompletedPool];
        
        // We need a way to track visits for the 14-day rule during redistribution
        // We'll use the existing schedules but ignore the uncompleted ones we are about to overwrite
        const baseSchedules = allSchedules.filter(s => s.date < date || s.assignments.some(a => a.isCompleted));

        for (let i = 0; i < futureSchedules.length; i++) {
          const s = futureSchedules[i];
          const completedOnes = s.assignments.filter(a => a.isCompleted);
          const targetDate = parseISO(s.date);
          
          let targetUncompletedCount;
          if (s.date === date) {
            targetUncompletedCount = Math.max(0, (s.assignments.length - completedOnes.length) - 1);
          } else {
            targetUncompletedCount = Math.max(0, dailyLimit - completedOnes.length);
          }
          
          const newUncompleted: any[] = [];
          for (let j = 0; j < targetUncompletedCount; j++) {
            let foundIdx = -1;
            // First pass: try to satisfy 14-day rule
            for (let pIdx = 0; pIdx < tempPool.length; pIdx++) {
              const item = tempPool[pIdx];
              const isAlreadyInDay = newUncompleted.some(a => a.applicantId === item.applicantId);
              if (isAlreadyInDay) continue;

              const otherVisits = [
                ...allSchedules.filter(as => as.date < date).flatMap(as => as.assignments.filter(a => a.applicantId === item.applicantId).map(a => as.date)),
                ...newUncompleted.filter(a => a.applicantId === item.applicantId).map(() => s.date),
                ...futureSchedules.slice(0, i).flatMap(fs => fs.assignments.filter(a => a.applicantId === item.applicantId).map(a => fs.date))
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

            // Second pass: fallback to first available
            if (foundIdx === -1) {
              for (let pIdx = 0; pIdx < tempPool.length; pIdx++) {
                const item = tempPool[pIdx];
                const isAlreadyInDay = newUncompleted.some(a => a.applicantId === item.applicantId);
                if (!isAlreadyInDay) {
                  foundIdx = pIdx;
                  break;
                }
              }
            }

            if (foundIdx !== -1) {
              newUncompleted.push(tempPool.splice(foundIdx, 1)[0]);
            }
          }
          
          await dbLocal.schedules.update(s.id!, { assignments: [...completedOnes, ...newUncompleted] });
          // Update the futureSchedules array so subsequent iterations see the new assignments
          s.assignments = [...completedOnes, ...newUncompleted];
        }

        // 7. Handle leftovers
        if (tempPool.length > 0) {
          const allWorkDays = await dbLocal.workDays.toArray();
          let currentDateStr = futureSchedules.length > 0 ? futureSchedules[futureSchedules.length - 1].date : date;
          
          const leftoverSchedules = [];
          while(tempPool.length > 0) {
            // Find next work day
            const nextWd = allWorkDays.find(wd => wd.date > currentDateStr && wd.isWorkDay);
            if (!nextWd) {
              alert('Kalan ziyaretleri planlamak için yeterli iş günü bulunamadı. Lütfen takvimden yeni iş günleri ekleyin.');
              break;
            }
            currentDateStr = nextWd.date;
            
            const newUncompleted: any[] = [];
            for (let j = 0; j < dailyLimit && tempPool.length > 0; j++) {
              newUncompleted.push(tempPool.shift());
            }
            
            leftoverSchedules.push({ date: currentDateStr, programId: currentDaySchedule.programId, assignments: newUncompleted });
          }
          if (leftoverSchedules.length > 0) {
            await dbLocal.schedules.bulkAdd(leftoverSchedules);
          }
        }
      });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Ziyaret Kaydırma', `${date} tarihindeki ${applicants.find(a => a.id === applicantId)?.name} ziyareti kaydırıldı.`);
      alert('Ziyaret başarıyla sonraki güne kaydırıldı.');
    } catch (error) {
      console.error('Rescheduling error:', error);
      alert('Kaydırma işlemi sırasında bir hata oluştu.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleCancelDay = async (date: string, targetDateStr?: string) => {
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;

    const uncompletedAssignments = schedule.assignments.filter(a => !a.isCompleted);
    if (uncompletedAssignments.length === 0) {
      alert('Bu günde iptal edilecek tamamlanmamış ziyaret bulunmamaktadır.');
      return;
    }

    const confirmMsg = targetDateStr 
      ? `Bu gündeki tüm tamamlanmamış (${uncompletedAssignments.length}) ziyaretleri iptal edip ${formatSafe(targetDateStr, 'dd.MM.yyyy')} tarihine ve sonrasına kaydırmak istediğinize emin misiniz?`
      : `Bu gündeki tüm tamamlanmamış (${uncompletedAssignments.length}) ziyaretleri iptal edip sonraki günlere kaydırmak istediğinize emin misiniz?`;

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
          const uncompletedInDay = s.assignments.filter(a => !a.isCompleted);
          uncompletedPool.push(...uncompletedInDay);
        }

        // Deduplicate pool (just in case)
        const seenIds = new Set();
        const uniquePool = uncompletedPool.filter(a => {
          if (seenIds.has(a.applicantId)) return false;
          seenIds.add(a.applicantId);
          return true;
        });

        const tempPool = [...uniquePool];
        
        // We need to handle the case where targetDateStr is a new date not in futureSchedules
        let planningDates = futureSchedules.map(s => s.date);
        if (targetDateStr && !planningDates.includes(targetDateStr)) {
          planningDates.push(targetDateStr);
          planningDates.sort();
        }

        // Filter out the canceled day from receiving new assignments if it's the source
        const receivingDates = planningDates.filter(d => d !== date);

        for (const dStr of receivingDates) {
          const s = allSchedules.find(as => as.date === dStr);
          const completedOnes = s ? s.assignments.filter(a => a.isCompleted) : [];
          const targetDate = parseISO(dStr);
          
          const targetUncompletedCount = Math.max(0, dailyLimit - completedOnes.length);
          
          const newUncompleted: any[] = [];
          for (let j = 0; j < targetUncompletedCount; j++) {
            let foundIdx = -1;
            for (let pIdx = 0; pIdx < tempPool.length; pIdx++) {
              const item = tempPool[pIdx];
              const isAlreadyInDay = newUncompleted.some(a => a.applicantId === item.applicantId);
              if (isAlreadyInDay) continue;

              const otherVisits = [
                ...allSchedules.filter(as => as.date < dStr && as.date !== date).flatMap(as => as.assignments.filter(a => a.applicantId === item.applicantId).map(a => as.date)),
                ...newUncompleted.filter(a => a.applicantId === item.applicantId).map(() => dStr)
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

            if (foundIdx === -1) {
              for (let pIdx = 0; pIdx < tempPool.length; pIdx++) {
                const item = tempPool[pIdx];
                const isAlreadyInDay = newUncompleted.some(a => a.applicantId === item.applicantId);
                if (!isAlreadyInDay) {
                  foundIdx = pIdx;
                  break;
                }
              }
            }

            if (foundIdx !== -1) {
              newUncompleted.push(tempPool.splice(foundIdx, 1)[0]);
            }
          }

          if (s) {
            await dbLocal.schedules.update(s.id!, { assignments: [...completedOnes, ...newUncompleted] });
          } else {
            // Check if it's a work day
            const workDays = await dbLocal.workDays.toArray();
            const wd = workDays.find(w => w.date === dStr);
            if (wd?.isWorkDay) {
              await dbLocal.schedules.add({ date: dStr, programId: schedule.programId, assignments: newUncompleted });
            }
          }
        }

        // Clear the canceled day's uncompleted assignments
        const completedToday = schedule.assignments.filter(a => a.isCompleted);
        await dbLocal.schedules.update(schedule.id!, { assignments: completedToday });
        
        // Handle leftovers
        if (tempPool.length > 0) {
          const allWorkDays = await dbLocal.workDays.toArray();
          let currentDateStr = planningDates.length > 0 ? planningDates[planningDates.length - 1] : date;
          
          const leftoverSchedules = [];
          while(tempPool.length > 0) {
            // Find next work day
            const nextWd = allWorkDays.find(wd => wd.date > currentDateStr && wd.isWorkDay);
            if (!nextWd) {
              alert('Kalan ziyaretleri planlamak için yeterli iş günü bulunamadı. Kalanlar silinmemesi için lütfen takvimden yeni iş günleri ekleyin.');
              break;
            }
            currentDateStr = nextWd.date;
            
            const newUncompleted: any[] = [];
            for (let j = 0; j < dailyLimit && tempPool.length > 0; j++) {
              newUncompleted.push(tempPool.shift());
            }
            
            leftoverSchedules.push({ date: currentDateStr, programId: schedule.programId, assignments: newUncompleted });
          }
          if (leftoverSchedules.length > 0) {
            await dbLocal.schedules.bulkAdd(leftoverSchedules);
          }
        }
      });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Gün İptali ve Kaydırma', `${date} tarihindeki tüm ziyaretler kaydırıldı.`);
      alert('Ziyaretler başarıyla kaydırıldı.');
      setRescheduleModal(null);
      setTargetRescheduleDate('');
    } catch (error) {
      console.error('Rescheduling error:', error);
      alert('Kaydırma işlemi sırasında bir hata oluştu.');
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
    currentMonthWorkDays.forEach(wd => {
      const schedule = schedules.find(s => s.date === wd.date);
      const items = (schedule && schedule.assignments)
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
  }, [currentMonthWorkDays, schedules, applicants, staff]);

  const generateSchedule = async () => {
    if (applicants.length === 0) {
      alert('Lütfen önce hane ekleyin.');
      return;
    }

    // 1. Determine base planning start date (08:30 rule)
    const now = new Date();
    const tomorrowStr = format(addDays(now, 1), 'yyyy-MM-dd');
    const planningStartDate = tomorrowStr; // bugünden sonraki gün başla (her zaman)
    
    const activeProgram = programs.find(p => p.status === 'active');

    let actualPlanningStartDate = planningStartDate;
    
    if (activeProgram) {
      actualPlanningStartDate = format(addDays(parseISO(activeProgram.endDate), 1), 'yyyy-MM-dd');
      // Otomatik yeni program olarak devam et
    } else {
      // No active program, but maybe some orphaned future schedules?
      const orphanedSchedules = schedules.filter(s => s.date >= planningStartDate && !s.assignments.some(a => a.isCompleted));
      if (orphanedSchedules.length > 0) {
         if (confirm('Gelecek tarihlerde programı olmayan ziyaret planları bulundu. Bunları temizleyip yeniden planlamak ister misiniz?')) {
            await dbLocal.schedules.bulkDelete(orphanedSchedules.map(s => s.id!));
         } else {
            const lastDate = [...orphanedSchedules].sort((a,b) => b.date.localeCompare(a.date))[0].date;
            actualPlanningStartDate = format(addDays(parseISO(lastDate), 1), 'yyyy-MM-dd');
         }
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
        alert('Planlanacak uygun iş günü bulunamadı. Lütfen "İş Günleri" takviminden gelecek günler için iş günü tanımlayın veya tatilleri kontrol edin.');
        return;
      }

      // 6. Function to get teams for a specific date (ignoring staff on leave)
      const getTeamsForDate = (dateStr: string) => {
        const activeStaff = staff.filter(s => {
          if (s.isActive === false || s.isBackup === true) return false;
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
      
      // Keep track of last visit date for each applicant
      const lastVisitMap = new Map<string, string>();
      const visitCountMap = new Map<string, number>();

      // Initialize with existing schedules for the current month
      const allExistingSchedules = await dbLocal.schedules.toArray();
      allExistingSchedules.forEach(s => {
        s.assignments.forEach(a => {
          const prev = lastVisitMap.get(a.applicantId);
          if (!prev || s.date > prev) {
            lastVisitMap.set(a.applicantId, s.date);
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
          alert(`Uyarı: Seçilen tarihler arasında toplam kapasite (${totalAvailableCapacity}) tüm hanelerin 2 kez ziyaret edilmesi için yeterli değil (${applicantPool.length} ziyaret gerekli). Bazı haneler sadece bir kez veya hiç planlanamayabilir.`);
      }

      for (let d = 0; d < availableWorkDays.length; d++) {
        const wd = availableWorkDays[d];
        const dailyAssignments: any[] = [];
        const targetDate = parseISO(wd.date);
        const dailyTeams = getTeamsForDate(wd.date);
        if (dailyTeams.length === 0) continue;
        
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
            
            const teamIndex = Math.floor(i / 2) % dailyTeams.length;
            const team = dailyTeams[teamIndex];

            dailyAssignments.push({ 
              applicantId: chosenApplicant.id!,
              staffIds: team || [],
              isCompleted: false
            });
            
            lastAssignedId = chosenApplicant.id;
            lastVisitMap.set(chosenApplicant.id!, wd.date);
          }
        }
        
        if (dailyAssignments.length > 0) {
          scheduleEntries.push({
            date: wd.date,
            assignments: dailyAssignments
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

      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Program Oluşturma', `${scheduleEntries.length} günlük yeni program oluşturuldu.`);
      alert('Planlama başarıyla tamamlandı.');
    } catch (error) {
      console.error("Error generating schedule:", error);
      alert('Planlama sırasında bir hata oluştu.');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCompletion = async (date: string, applicantId: string, note?: string) => {
    // Restriction: Cannot mark as completed if date is in the future
    const today = format(new Date(), 'yyyy-MM-dd');
    if (date > today) {
      alert('Gelecek tarihteki bir ziyaret henüz gerçekleşmediği için tamamlanamaz.');
      return;
    }

    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;

    const newAssignments = schedule.assignments.map(a => {
      if (a.applicantId === applicantId) {
        const isCompleted = !a.isCompleted;
        const applicant = applicants.find(p => p.id === applicantId);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, isCompleted ? 'Ziyaret Tamamlama' : 'Ziyaret Geri Alma', `${date} tarihindeki ${applicant?.name} ziyareti ${isCompleted ? 'tamamlandı' : 'tamamlanmadı olarak işaretlendi'}.${note ? ` Not: ${note}` : ''}`);
        return { 
          ...a, 
          isCompleted, 
          completionDate: isCompleted ? new Date().toISOString() : undefined,
          completionNote: isCompleted ? note : undefined
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
        
        if (!staffId) {
          // Remove staff from this slot
          newStaffIds[staffIndex] = '';
        } else {
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

  // On-demand geocoding when a day is expanded
  useEffect(() => {
    const geocodeMissingAddresses = async () => {
      if (!expandedDay) return;
      
      const day = assignments.find(a => a.date === expandedDay);
      if (!day) return;

      const itemsWithMissingCoords = day.items.filter(item => !item.applicant.lat || !item.applicant.lng);
      
      if (itemsWithMissingCoords.length > 0) {
        setIsGeocodingDay(true);
        try {
          for (let i = 0; i < itemsWithMissingCoords.length; i++) {
            const item = itemsWithMissingCoords[i];
            const result = await geocodeAddress(item.applicant.address, item.applicant.neighborhood);
            
            if (result) {
              await dbLocal.applicants.update(item.applicant.id!, {
                lat: result.lat,
                lng: result.lng
              });
            }
          }
        } catch (error) {
          console.error("Error geocoding day addresses:", error);
        } finally {
          setIsGeocodingDay(false);
        }
      }
    };

    geocodeMissingAddresses();
  }, [expandedDay, assignments]);

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
        alert('Kaydırılacak (tamamlanmamış) planlama bulunamadı.');
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
        alert(`Uyarı: ${tempPool.length} ziyaret 14 gün kuralı nedeniyle bu aya sığmadı ve planlanamadı.`);
      }
      
      alert('Program başarıyla kaydırıldı.');
    } catch (error) {
      console.error("Error reflowing schedule:", error);
      alert('Program kaydırılırken bir hata oluştu.');
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

  const exportToExcel = () => {
    const data = assignments.flatMap(a => a.items.map(item => ({
      'Tarih': formatSafe(a.date, 'dd MMMM yyyy', { locale: tr }),
      'Mahalle': item.applicant.neighborhood,
      'Hane': `${item.applicant.name} ${item.applicant.surname}`,
      'TC No': item.applicant.tcNo,
      'Hane Kişi Sayısı': item.applicant.householdSize || 1,
      'Görevli Personeller': item.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ') || 'Atanmamış'
    })));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vefa Programı");
    XLSX.writeFile(wb, `SYDV_Vefa_Programi_${format(selectedMonth, 'MMMM_yyyy', { locale: tr })}.xlsx`);
  };

  const exportToPDF = async () => {
    const pdfMake = await setupPdfMakeFonts();
    if (!pdfMake) {
      console.error("Fonts could not be loaded for pdfmake");
      return;
    }
    
    let logoBase64 = '';
    try {
      const getBase64ImageFromURL = (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.setAttribute('crossOrigin', 'anonymous');
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
          };
          img.onerror = (error) => reject(error);
          img.src = url;
        });
      };
      logoBase64 = await getBase64ImageFromURL(`https://images.weserv.nl/?url=${encodeURIComponent(APP_LOGO_URL)}`);
    } catch (e) {
      console.error("Logo could not be added to PDF", e);
    }

    const tableData = assignments.flatMap(a => a.items.map(item => [
      formatSafe(a.date, 'dd.MM.yyyy'),
      item.applicant.neighborhood || '-',
      `${item.applicant.name} ${item.applicant.surname}`,
      item.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ') || '-'
    ]));

    const docDefinition: any = {
      content: [
        logoBase64 ? {
          image: logoBase64,
          width: 50,
          alignment: 'center',
          margin: [0, 0, 0, 10]
        } : null,
        { text: 'T.C.', style: 'header', alignment: 'center' },
        { text: 'EDİRNE VALİLİĞİ', style: 'header', alignment: 'center' },
        { text: 'Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı', style: 'subheader', alignment: 'center' },
        { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1 }] },
        { 
          text: `VEFA PROGRAMI ÇİZELGESİ (${format(startOfMonth(selectedMonth), 'dd.MM.yyyy')} - ${format(endOfMonth(selectedMonth), 'dd.MM.yyyy')})`, 
          style: 'title', 
          alignment: 'center', 
          margin: [0, 15, 0, 15] 
        },
        { text: `Rapor Tarihi: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, alignment: 'right', fontSize: 8, color: '#666', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: [70, 100, '*', '*'],
            body: [
              [
                { text: 'Tarih', style: 'tableHeader' },
                { text: 'Mahalle', style: 'tableHeader' },
                { text: 'Hane', style: 'tableHeader' },
                { text: 'Görevli Personeller', style: 'tableHeader' }
              ],
              ...tableData
            ]
          },
          layout: 'lightHorizontalLines'
        }
      ],
      watermark: { 
        text: 'Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı', 
        color: '#666', 
        opacity: 0.05, 
        bold: true, 
        fontSize: 25
      },
      footer: (currentPage: number, pageCount: number) => {
        return {
          text: `Bu belge elektronik ortamda ${currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'} tarafından ${format(new Date(), 'dd.MM.yyyy')} tarihinde oluşturulmuştur. Sayfa ${currentPage} / ${pageCount}`,
          alignment: 'center',
          fontSize: 8,
          color: '#666',
          margin: [0, 10, 0, 0]
        };
      },
      styles: {
        header: { fontSize: 14, bold: true, margin: [0, 2, 0, 2] },
        subheader: { fontSize: 11, bold: true, margin: [0, 2, 0, 2] },
        title: { fontSize: 12, bold: true },
        tableHeader: { bold: true, fontSize: 10, fillColor: '#f8fafc', alignment: 'left' }
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 9
      },
      pageMargins: [40, 40, 40, 60]
    };

    pdfMake.createPdf(docDefinition).download(`SYDV_Vefa_Programi_${format(selectedMonth, 'MMMM_yyyy', { locale: tr })}.pdf`);
  };

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

      {/* Hidden Report for PDF Generation */}
      <div className="absolute opacity-0 pointer-events-none" style={{ width: '210mm', padding: '25mm', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt', lineHeight: '1.5' }}>
        <div ref={reportRef} style={{ backgroundColor: '#ffffff', padding: '20px', color: '#000000' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <img 
              src={APP_LOGO_URL} 
              alt="Logo" 
              crossOrigin="anonymous"
              style={{ width: '80px', height: '80px', margin: '0 auto 15px', display: 'block', objectFit: 'contain' }} 
              referrerPolicy="no-referrer"
            />
            <h1 style={{ fontSize: '16pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' }}>T.C.</h1>
            <h2 style={{ fontSize: '14pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' }}>EDİRNE VALİLİĞİ</h2>
            <h3 style={{ fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '20px', borderBottom: '1px solid #000', paddingBottom: '10px' }}>Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı</h3>
            <h4 style={{ fontSize: '13pt', fontWeight: 'bold', marginTop: '20px' }}>{format(selectedMonth, 'MMMM yyyy', { locale: tr }).toUpperCase()} AYI VEFA PROGRAMI ÇİZELGESİ</h4>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '9pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #94a3b8' }}>Tarih</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #94a3b8' }}>Mahalle</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #94a3b8' }}>Hane</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #94a3b8' }}>Görevli Personeller</th>
              </tr>
            </thead>
            <tbody>
              {assignments.flatMap(a => a.items.map((item, idx) => (
                <tr key={`${a.date}-${idx}`}>
                  <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{formatSafe(a.date, 'dd.MM.yyyy')}</td>
                  <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{item.applicant.neighborhood}</td>
                  <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{item.applicant.name} {item.applicant.surname}</td>
                  <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{item.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ') || '-'}</td>
                </tr>
              )))}
            </tbody>
          </table>

          <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center', width: '200px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>Vakıf Müdürü</p>
              <p style={{ fontSize: '10pt', marginBottom: '40px' }}>{currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'}</p>
              <p>(İmza)</p>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: '15mm', left: '20mm', right: '20mm', textAlign: 'center', fontSize: '8pt', color: '#94a3b8', borderTop: '0.5px solid #cbd5e1', paddingTop: '10px' }}>
            Bu belge elektronik ortamda {currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'} tarafından {format(new Date(), 'dd.MM.yyyy')} tarihinde oluşturulmuştur.
          </div>
        </div>
      </div>

      {/* Reschedule Day Modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Günü İptal Et ve Kaydır</h3>
            <p className="text-sm text-gray-500 mb-6">
              {formatSafe(rescheduleModal.date, 'dd MMMM yyyy', { locale: tr })} tarihindeki tüm tamamlanmamış ziyaretleri nereye kaydırmak istersiniz?
            </p>
            
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleCancelDay(rescheduleModal.date)}
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
                    onClick={() => handleCancelDay(rescheduleModal.date, targetRescheduleDate)}
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
            <h3 className="text-xl font-bold text-gray-900 mb-2">Hanenin Gününü Değiştir</h3>
            <p className="text-sm text-gray-500 mb-6">
              <strong className="text-gray-800">{shiftAssignmentModal.name}</strong> hanesine ait {formatSafe(shiftAssignmentModal.date, 'dd MMMM yyyy', { locale: tr })} tarihindeki temizlik işi iptal edilecektir. Sıra düzeni bozulmadan bu haneyi nereye yerleştirmek istersiniz?
            </p>
            
            <div className="space-y-3 mb-6">
              <button
                onClick={() => performShiftAssignment(shiftAssignmentModal.date, shiftAssignmentModal.applicantId)}
                className="w-full py-3 px-4 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all text-left flex items-center justify-between"
              >
                <span>Sıradaki İlk Boşluğa (Veya Sonraki Güne) Kaydır</span>
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
            onClick={generateSchedule}
            disabled={isGenerating}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 text-sm font-bold"
          >
            <Wand2 className={`w-4 h-4 lg:w-5 lg:h-5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Planla</span>
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
            <button onClick={exportToExcel} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 hover:bg-gray-50 text-green-700 border-r border-gray-200 text-sm font-bold">
              <FileSpreadsheet className="w-4 h-4 lg:w-5 lg:h-5" /> <span>Excel</span>
            </button>
            <button onClick={exportToPDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 hover:bg-gray-50 text-red-700 text-sm font-bold">
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
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
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
          {programs.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="bg-orange-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-orange-100">
                <CalendarIcon className="w-8 h-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Mevcut Program Bulunamadı</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
                Sistemde planlanmış aktif bir program bulunmamaktadır. Lütfen yukarıdaki "Planla" butonunu kullanarak yeni bir program oluşturun.
              </p>
              <button
                onClick={generateSchedule}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-100"
              >
                <Wand2 className="w-5 h-5" />
                Hemen Planla
              </button>
            </div>
          ) : assignments.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">Bu ay için henüz iş günü belirlenmemiş.</div>
          ) : (
            assignments.map(a => (
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
                          setRescheduleModal({ date: a.date });
                        }}
                        className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-1"
                        title="Günü İptal Et ve Kaydır"
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
                        const isSelectedForSwap = swapSelection?.date === a.date && swapSelection?.applicantId === item.applicant.id;

                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                        const isFuture = a.date > todayStr;
                        const isPast = a.date < todayStr;

                        return (
                          <div key={idx} className={`official-card p-4 flex flex-col gap-3 relative transition-all ${
                            isCompleted ? 'bg-emerald-50 border-emerald-100 shadow-none' : 
                            isSelectedForSwap ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-100' : 'bg-white'
                          }`}>
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
                                onClick={() => handleSwap(a.date, item.applicant.id!)}
                                disabled={isCompleted || isPast}
                                className={`flex-1 py-1 text-[10px] font-bold rounded-xl border transition-all flex items-center justify-center gap-1 ${
                                  isSelectedForSwap 
                                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                } disabled:opacity-30 disabled:cursor-not-allowed`}
                              >
                                <RefreshCw className={`w-3 h-3 ${isSelectedForSwap ? 'animate-spin' : ''}`} />
                                {isSelectedForSwap ? 'Hedef' : 'Değiştir'}
                              </button>

                              {!isCompleted && (
                                <button
                                  onClick={() => setShiftAssignmentModal({ date: a.date, applicantId: item.applicant.id!, name: `${item.applicant.name} ${item.applicant.surname}` })}
                                  disabled={isPast}
                                  className="p-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl hover:bg-rose-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Günü Değiştir ve Kaydır"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                              )}
                              
                              <button
                                onClick={() => moveAssignment(a.date, idx, 'up')}
                                disabled={isCompleted || idx === 0}
                                className="p-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Sırayı Yukarı Taşı (Sabah)"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => moveAssignment(a.date, idx, 'down')}
                                disabled={isCompleted || idx === a.items.length - 1}
                                className="p-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Sırayı Aşağı Taşı (Öğleden Sonra)"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <button
                              disabled={isFuture && !isCompleted}
                              onClick={() => {
                                if (!isCompleted) {
                                  setCompletionModal({ date: a.date, applicantId: item.applicant.id!, name: `${item.applicant.name} ${item.applicant.surname}` });
                                } else {
                                  toggleCompletion(a.date, item.applicant.id!);
                                }
                              }}
                              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                isCompleted 
                                  ? 'bg-slate-100 text-slate-400 hover:bg-slate-200' 
                                  : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-100'
                              } disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed`}
                            >
                              {isCompleted ? <RefreshCw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              {isCompleted ? 'Geri Al' : (isFuture ? 'Zamanı Bekleniyor' : 'Ziyareti Tamamla')}
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
                                        alert(check.message);
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
                                <div className="grid grid-cols-2 gap-2">
                                  {[0, 1].map(sIdx => (
                                    <select
                                      key={sIdx}
                                      value={item.staffMembers[sIdx]?.id || ''}
                                      disabled={isCompleted}
                                      onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, sIdx, e.target.value)}
                                      className="w-full text-[10px] font-bold bg-slate-50 border border-slate-100 rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-institution-blue/20 transition-all disabled:opacity-50 appearance-none text-center"
                                    >
                                      <option value="">Seç...</option>
                                      {staff.map(s => {
                                        const isAlreadyInThisApp = item.staffMembers.some((sm, idx) => sm.id === s.id && idx !== sIdx);
                                        const assignmentsOnSameDay = a.items.filter(i => i.staffMembers.some(sm => sm.id === s.id));
                                        const isAssignedElsewhere = assignmentsOnSameDay.length >= 2 && !assignmentsOnSameDay.some(i => i.applicant.id === item.applicant.id);
                                        
                                        return (
                                          <option 
                                            key={s.id} 
                                            value={s.id} 
                                            disabled={isAlreadyInThisApp || isAssignedElsewhere}
                                          >
                                            {s.name} {s.surname} {s.isBackup ? '(Yedek)' : ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  ))}
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
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
