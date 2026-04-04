import { useState, useMemo, useEffect } from 'react';
import { dbLocal } from '../db';
import { Applicant, Staff, WorkDay, Schedule, DailyAssignment, EDIRNE_NEIGHBORHOODS, Program } from '../types';
import { format, startOfMonth, endOfMonth, parseISO, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Wand2, FileSpreadsheet, FileText, Users, Map as MapIcon, ChevronDown, ChevronUp, Calendar as CalendarIcon, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Map, Marker, Popup, NavigationControl, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { geocodeAddress } from '../services/geocoding';
import { EDIRNE_NEIGHBORHOOD_COORDS } from '../constants/edirne_data';

// MapLibre GL JS doesn't need the Leaflet icon fix

interface Props {
  applicants: Applicant[];
  staff: Staff[];
  workDays: WorkDay[];
  schedules: Schedule[];
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

export default function ScheduleView({ applicants, staff, workDays, schedules }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastSavedDay, setLastSavedDay] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showMap, setShowMap] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [isGeocodingDay, setIsGeocodingDay] = useState(false);
  const [swapSelection, setSwapSelection] = useState<{ date: string; applicantId: number } | null>(null);
  const [completionModal, setCompletionModal] = useState<{ date: string; applicantId: number; name: string } | null>(null);
  const [completionNote, setCompletionNote] = useState('');

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

  const handleSwap = async (date: string, applicantId: number) => {
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
    // The user said "yer değiştirme işlemi yapmamı sağlayacak düzenlemeyi de yap yani iki müracaatçının gününü değiştirebileyim"
    // This implies swapping their positions in the schedule.

    await dbLocal.transaction('rw', dbLocal.schedules, async () => {
      await dbLocal.schedules.update(schedule1.id!, { assignments: newAssignments1 });
      await dbLocal.schedules.update(schedule2.id!, { assignments: newAssignments2 });
    });

    setSwapSelection(null);
    alert('Müracaatçılar başarıyla yer değiştirildi.');
  };

  const currentMonthWorkDays = useMemo(() => {
    return workDays
      .filter(wd => {
        const d = parseISO(wd.date);
        return d >= monthStart && d <= monthEnd;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [workDays, monthStart, monthEnd]);

  const assignments: DailyAssignment[] = useMemo(() => {
    return currentMonthWorkDays.map(wd => {
      const schedule = schedules.find(s => s.date === wd.date);
      const items = (schedule && schedule.assignments)
        ? schedule.assignments.map(a => ({
            applicant: applicants.find(p => p.id === a.applicantId)!,
            staffMembers: (a.staffIds || []).map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[]
          })).filter(i => i.applicant)
        : [];
      return { date: wd.date, items };
    });
  }, [currentMonthWorkDays, schedules, applicants, staff]);

  const generateSchedule = async () => {
    if (applicants.length === 0) {
      alert('Lütfen önce müracaatçı ekleyin.');
      return;
    }

    // Check for existing active program
    const activeProgram = await dbLocal.programs.where('status').equals('active').first();
    if (activeProgram) {
      if (!confirm('Hali hazırda aktif bir program bulunuyor. Yeni bir program oluşturmak mevcut programı iptal edecektir. Devam etmek istiyor musunuz?')) {
        return;
      }
      // Cancel existing program
      await dbLocal.programs.update(activeProgram.id!, { status: 'cancelled' });
    }

    setIsGenerating(true);
    try {
      // 1. Determine starting point
      const lastProgram = await dbLocal.programs.orderBy('id').last();
      const sortedApplicants = [...applicants].sort((a, b) => (a.priority || 0) - (b.priority || 0));
      
      let globalStartIndex = 0;
      if (lastProgram && lastProgram.lastApplicantId) {
        const lastCycle = lastProgram.lastVisitCycle || 1;
        const lastIdxInCycle = sortedApplicants.findIndex(a => a.id === lastProgram.lastApplicantId);
        
        if (lastIdxInCycle !== -1) {
          // Calculate where we left off in the 2N sequence
          // Cycle 1 is index 0 to N-1, Cycle 2 is index N to 2N-1
          const lastGlobalIndex = (lastCycle === 1) ? lastIdxInCycle : (sortedApplicants.length + lastIdxInCycle);
          globalStartIndex = (lastGlobalIndex + 1) % (sortedApplicants.length * 2);
        }
      }

      // 2. Create the full 2N visit list
      const fullVisitList = [...sortedApplicants, ...sortedApplicants];
      
      // Re-order the 2N list to start from globalStartIndex
      const visitList = [
        ...fullVisitList.slice(globalStartIndex),
        ...fullVisitList.slice(0, globalStartIndex),
        ...fullVisitList // Add more for safety if needed, but 2N is usually enough for a month
      ];

      // 3. Determine planning start date (08:30 rule)
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const isAfter830 = currentHour > 8 || (currentHour === 8 && currentMinute >= 30);
      
      const todayStr = format(now, 'yyyy-MM-dd');
      const tomorrowStr = format(addDays(now, 1), 'yyyy-MM-dd');
      
      const planningStartDate = isAfter830 ? tomorrowStr : todayStr;

      // 4. Get available work days in the SELECTED MONTH starting from planningStartDate
      const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
      let availableWorkDays = workDays
        .filter(wd => wd.date >= planningStartDate && wd.date <= monthEndStr && wd.isWorkDay)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (availableWorkDays.length === 0) {
        alert('Seçili ayda planlanacak iş günü bulunamadı. Lütfen önce "İş Günleri Belirleme" sayfasından günleri seçin.');
        return;
      }

      const daysToPlan = availableWorkDays.length;

      // 5. Group staff into teams
      const teams: number[][] = [];
      const processedStaff = new Set<number>();
      staff.forEach(s => {
        if (processedStaff.has(s.id!)) return;
        if (s.partnerId) {
          teams.push([s.id!, s.partnerId]);
          processedStaff.add(s.id!);
          processedStaff.add(s.partnerId);
        }
      });
      const individuals = staff.filter(s => !processedStaff.has(s.id!));
      for (let i = 0; i < individuals.length; i += 2) {
        const pair = [individuals[i].id!];
        if (individuals[i+1]) pair.push(individuals[i+1].id!);
        teams.push(pair);
      }

      // 6. Distribute into days and track the last assignment
      let visitIndex = 0;
      let lastAssignedId: number | undefined;
      let lastAssignedGlobalIndex: number | undefined;

      const scheduleEntries: any[] = [];
      for (let d = 0; d < daysToPlan; d++) {
        const wd = availableWorkDays[d];
        const dailyAssignments: any[] = [];
        
        for (let i = 0; i < 6; i++) {
          let applicant = visitList[visitIndex];
          if (!applicant) break;

          const teamIndex = Math.floor(i / 2) % teams.length;
          const team = teams[teamIndex];

          dailyAssignments.push({ 
            applicantId: applicant.id!,
            staffIds: team || [],
            isCompleted: false
          });
          
          lastAssignedId = applicant.id;
          lastAssignedGlobalIndex = (globalStartIndex + visitIndex) % (sortedApplicants.length * 2);
          visitIndex++;
        }
        
        scheduleEntries.push({
          date: wd.date,
          assignments: dailyAssignments
        });
      }

      // 7. Create Program Record with precise spillover tracking
      // Determine cycle of the last assigned applicant
      const finalCycle = (lastAssignedGlobalIndex !== undefined && lastAssignedGlobalIndex >= sortedApplicants.length) ? 2 : 1;

      const programId = await dbLocal.programs.add({
        name: `${format(parseISO(availableWorkDays[0].date), 'dd MMMM yyyy', { locale: tr })} - ${format(parseISO(availableWorkDays[daysToPlan - 1].date), 'dd MMMM yyyy', { locale: tr })} Vefa Programı`,
        startDate: availableWorkDays[0].date,
        endDate: availableWorkDays[daysToPlan - 1].date,
        createdAt: new Date().toISOString(),
        status: 'active',
        lastApplicantId: lastAssignedId,
        lastVisitCycle: finalCycle
      });

      // 8. Save schedules
      for (const entry of scheduleEntries) {
        await dbLocal.schedules.add({
          ...entry,
          programId: programId as number
        });
      }
    } catch (error) {
      console.error("Error generating schedule:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCompletion = async (date: string, applicantId: number, note?: string) => {
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;

    const newAssignments = schedule.assignments.map(a => {
      if (a.applicantId === applicantId) {
        const isCompleted = !a.isCompleted;
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

  const updateStaffAssignment = async (date: string, applicantId: number, staffIndex: number, staffId: number) => {
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;

    const selectedStaff = staff.find(s => s.id === staffId);

    const newAssignments = schedule.assignments.map(a => {
      if (a.applicantId === applicantId) {
        const newStaffIds = [...(a.staffIds || [])];
        newStaffIds[staffIndex] = staffId;

        // If this staff has a partner, automatically set the partner in the other slot
        if (selectedStaff?.partnerId) {
          const otherIndex = staffIndex === 0 ? 1 : 0;
          newStaffIds[otherIndex] = selectedStaff.partnerId;
        }

        return { ...a, staffIds: newStaffIds };
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
      // Get all schedules for this month
      const monthSchedules = schedules
        .filter(s => {
          const d = parseISO(s.date);
          return d >= monthStart && d <= monthEnd;
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      // Get all work days for this month
      const monthWorkDays = currentMonthWorkDays;

      // Extract all assignments in order
      const allAssignments = monthSchedules.flatMap(s => s.assignments);
      
      // Delete old schedules
      await dbLocal.schedules.bulkDelete(monthSchedules.map(s => s.id!));

      // Re-distribute assignments to new work days (6 per day)
      let assignmentIndex = 0;
      for (const wd of monthWorkDays) {
        const dailyAssignments = allAssignments.slice(assignmentIndex, assignmentIndex + 6);
        if (dailyAssignments.length > 0) {
          await dbLocal.schedules.add({
            date: wd.date,
            assignments: dailyAssignments
          });
        }
        assignmentIndex += 6;
      }
    } catch (error) {
      console.error("Error reflowing schedule:", error);
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
      'Tarih': format(parseISO(a.date), 'dd MMMM yyyy', { locale: tr }),
      'Mahalle': item.applicant.neighborhood,
      'Müracaatçı': `${item.applicant.name} ${item.applicant.surname}`,
      'TC No': item.applicant.tcNo,
      'Hane Kişi Sayısı': item.applicant.householdSize || 1,
      'Görevli Personeller': item.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ') || 'Atanmamış'
    })));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vefa Programı");
    XLSX.writeFile(wb, `SYDV_Vefa_Programi_${format(selectedMonth, 'MMMM_yyyy', { locale: tr })}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const monthName = format(selectedMonth, 'MMMM yyyy', { locale: tr });
    
    // Helper to replace Turkish characters for standard PDF fonts
    const trFix = (text: string) => {
      const chars: Record<string, string> = {
        'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S', 
        'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
      };
      return text.replace(/[ğĞüÜşŞıİöÖçÇ]/g, m => chars[m] || m);
    };

    doc.setFont("helvetica", "bold");
    doc.text(trFix(`Edirne Merkez SYDV Vefa Programi - ${monthName}`), 14, 15);
    
    const tableData = assignments.flatMap(a => a.items.map(item => [
      format(parseISO(a.date), 'dd.MM.yyyy'),
      trFix(item.applicant.neighborhood),
      trFix(`${item.applicant.name} ${item.applicant.surname}`),
      trFix(item.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ') || 'Atanmamis')
    ]));

    autoTable(doc, {
      startY: 25,
      head: [[trFix('Tarih'), trFix('Mahalle'), trFix('Muracaatci'), trFix('Gorevli Personeller')]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8, cellPadding: 2 }
    });

    doc.save(`SYDV_Vefa_Programi_${monthName}.pdf`);
  };

  const activeMarkers = useMemo(() => {
    if (!expandedDay) return [];
    const day = assignments.find(a => a.date === expandedDay);
    if (!day || !day.items || day.items.length === 0) return [];
    
    return day.items
      .map((item, i) => {
        const lat = typeof item.applicant.lat === 'number' ? item.applicant.lat : (41.675 + (i * 0.002));
        const lng = typeof item.applicant.lng === 'number' ? item.applicant.lng : (26.570 + (i * 0.002));
        
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
      {/* Completion Note Modal */}
      {completionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Temizlik Tamamlandı</h3>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-semibold text-blue-600">{completionModal.name}</span> müracaatçının evi için temizlik bitti. Varsa eklemek istediğiniz bilgileri yazın.
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

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Program Planlama</h2>
          <p className="text-gray-500">Mahalle bazlı otomatik planlama ve personel ataması.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowMap(!showMap)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border ${showMap ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            <MapIcon className="w-5 h-5" />
            Harita Görünümü
          </button>
          <button
            onClick={generateSchedule}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
          >
            <Wand2 className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
            Otomatik Planla
          </button>
          {hasOrphanedSchedules && (
            <button
              onClick={reflowSchedules}
              disabled={isGenerating}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 animate-pulse"
            >
              <CalendarIcon className="w-5 h-5" />
              Programı Kaydır
            </button>
          )}
          <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white">
            <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-green-700 border-r border-gray-200">
              <FileSpreadsheet className="w-5 h-5" /> Excel
            </button>
            <button onClick={exportToPDF} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-red-700">
              <FileText className="w-5 h-5" /> PDF
            </button>
          </div>
        </div>
      </div>

      {showMap && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-[400px] relative z-0">
          <Map
            initialViewState={{
              latitude: 41.675,
              longitude: 26.570,
              zoom: 13
            }}
            mapStyle="https://tiles.openfreemap.org/styles/liberty"
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />
            {activeMarkers.map((m, i) => (
              <Marker key={`${expandedDay}-${i}`} latitude={m.pos[0]} longitude={m.pos[1]}>
                <div className="group relative">
                  <div className="w-6 h-6 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                    <MapIcon className="w-3 h-3 text-white" />
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                    <div className="bg-white px-3 py-2 rounded-lg shadow-xl border border-gray-100 whitespace-nowrap">
                      <div className="font-bold text-xs text-gray-900">{m.name}</div>
                      <div className="text-[10px] text-gray-500">{m.address}</div>
                    </div>
                  </div>
                </div>
              </Marker>
            ))}
            {expandedDay && activeMarkers.length > 0 && <MapUpdater markers={activeMarkers} />}
          </Map>
          {!expandedDay && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 pointer-events-none">
              <p className="text-white font-bold bg-black/60 px-4 py-2 rounded-full">Haritada görmek için bir gün seçin</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
          <input 
            type="month" 
            value={format(selectedMonth, 'yyyy-MM')}
            onChange={(e) => setSelectedMonth(new Date(e.target.value))}
            className="px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <div className="text-sm font-medium text-gray-500">
            <span className="text-blue-600 font-bold">{currentMonthWorkDays.length}</span> İş Günü
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {assignments.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">Bu ay için henüz iş günü belirlenmemiş.</div>
          ) : (
            assignments.map(a => (
              <div key={a.date} className={`transition-all ${expandedDay === a.date ? 'bg-blue-50/30' : ''}`}>
                <div 
                  className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedDay(expandedDay === a.date ? null : a.date)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 text-center">
                      <div className="text-lg font-bold text-gray-900">{format(parseISO(a.date), 'dd')}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">{format(parseISO(a.date), 'EEE', { locale: tr })}</div>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div>
                      <div className="text-sm font-semibold text-gray-700">
                        {a.items.length > 0 ? `${a.items[0].applicant.address.substring(0, 30)}...` : 'Atama Yapılmamış'}
                      </div>
                      <div className="text-xs text-gray-400">{a.items.length} Müracaatçı</div>
                    </div>
                  </div>
                  {expandedDay === a.date ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>

                {expandedDay === a.date && (
                  <div className="px-6 pb-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {a.items.map((item, idx) => {
                        const schedule = schedules.find(s => s.date === a.date);
                        const assignment = schedule?.assignments[idx];
                        const isCompleted = assignment?.isCompleted;
                        const isSelectedForSwap = swapSelection?.date === a.date && swapSelection?.applicantId === item.applicant.id;

                        return (
                          <div key={idx} className={`p-4 rounded-2xl border shadow-sm space-y-3 transition-all ${
                            isCompleted ? 'bg-green-50 border-green-200' : 
                            isSelectedForSwap ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-white border-gray-100'
                          }`}>
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="font-bold text-gray-900">{item.applicant.name} {item.applicant.surname}</div>
                                <div className="text-[10px] text-blue-600 font-medium line-clamp-1">{item.applicant.address}</div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <div className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">{item.applicant.tcNo}</div>
                                {isCompleted && (
                                  <span className="text-[8px] bg-green-600 text-white px-1.5 py-0.5 rounded font-bold uppercase">Tamamlandı</span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSwap(a.date, item.applicant.id!)}
                                disabled={isCompleted}
                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all flex items-center justify-center gap-1 ${
                                  isSelectedForSwap 
                                    ? 'bg-blue-600 text-white border-blue-600' 
                                    : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50'
                                }`}
                              >
                                <Wand2 className="w-3 h-3" />
                                {isSelectedForSwap ? 'Hedef Seçin' : 'Yer Değiştir'}
                              </button>
                              {swapSelection && !isSelectedForSwap && (
                                <button
                                  onClick={() => handleSwap(a.date, item.applicant.id!)}
                                  className="flex-1 py-1.5 text-[10px] font-bold rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-all"
                                >
                                  Buraya Taşı
                                </button>
                              )}
                            </div>
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Müracaatçı Değiştir</label>
                                <select
                                  value={item.applicant.id || ''}
                                  disabled={isCompleted}
                                  onChange={(e) => {
                                    const newId = parseInt(e.target.value);
                                    if (schedule) {
                                      const newAssignments = schedule.assignments.map((assignment, i) => 
                                        i === idx ? { ...assignment, applicantId: newId } : assignment
                                      );
                                      dbLocal.schedules.update(schedule.id!, { assignments: newAssignments });
                                    }
                                  }}
                                  className="w-full text-sm bg-gray-50 border-none rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                    {applicants.map(app => (
                                      <option key={app.id} value={app.id}>
                                        {app.name} {app.surname} ({app.address.substring(0, 20)}...)
                                      </option>
                                    ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Temizlik Görevlileri (2 Kişi)</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {[0, 1].map(sIdx => (
                                    <select
                                      key={sIdx}
                                      value={item.staffMembers[sIdx]?.id || ''}
                                      disabled={isCompleted}
                                      onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, sIdx, parseInt(e.target.value))}
                                      className="w-full text-xs bg-gray-50 border-none rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
                                            className={(isAlreadyInThisApp || isAssignedElsewhere) ? 'text-gray-300' : ''}
                                          >
                                            {s.name} {s.surname} {isAssignedElsewhere ? '(Dolu)' : ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  ))}
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 mt-4">
                              <button 
                                onClick={() => {
                                  if (isCompleted) {
                                    toggleCompletion(a.date, item.applicant.id!);
                                  } else {
                                    setCompletionModal({ date: a.date, applicantId: item.applicant.id!, name: `${item.applicant.name} ${item.applicant.surname}` });
                                  }
                                }}
                                className={`py-2 text-[10px] font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                                  isCompleted 
                                    ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' 
                                    : 'bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-100'
                                }`}
                              >
                                {isCompleted ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                {isCompleted ? 'İptal Et' : 'Temizlik Bitti'}
                              </button>
                              <button 
                                onClick={() => saveDay(a.date)}
                                className={`py-2 text-[10px] font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                                  lastSavedDay === a.date 
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                {lastSavedDay === a.date ? 'Onaylandı' : 'Günü Onayla'}
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
