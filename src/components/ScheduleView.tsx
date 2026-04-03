import { useState, useMemo, useEffect } from 'react';
import { dbLocal } from '../db';
import { Applicant, Staff, WorkDay, Schedule, DailyAssignment, EDIRNE_NEIGHBORHOODS } from '../types';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Wand2, FileSpreadsheet, FileText, Users, Map as MapIcon, ChevronDown, ChevronUp, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { geocodeAddress } from '../services/geocoding';
import { EDIRNE_NEIGHBORHOOD_COORDS } from '../constants/edirne_data';

// Fix Leaflet icon issue
const icon = new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href;
const iconShadow = new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href;
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Props {
  applicants: Applicant[];
  staff: Staff[];
  workDays: WorkDay[];
  schedules: Schedule[];
}

function MapUpdater({ markers }: { markers: { pos: [number, number] }[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => m.pos));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
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

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

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
      const items = schedule 
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

    setIsGenerating(true);
    try {
      // 1. Calculate total visits needed (each applicant twice)
      const totalVisitsNeeded = applicants.length * 2;
      const daysNeeded = Math.ceil(totalVisitsNeeded / 6);

      // 2. Clear existing schedules for this month
      const existingIds = schedules
        .filter(s => {
          const d = parseISO(s.date);
          return d >= monthStart && d <= monthEnd;
        })
        .map(s => s.id!);
      
      if (existingIds.length > 0) {
        await dbLocal.schedules.bulkDelete(existingIds);
      }

      // 3. Ensure we have enough work days. If not, auto-create them.
      // We'll pick the first N weekdays of the month.
      let availableWorkDays = currentMonthWorkDays;
      if (availableWorkDays.length < daysNeeded) {
        const newWorkDays: WorkDay[] = [];
        let currentDate = monthStart;
        let addedCount = 0;
        
        while (addedCount < daysNeeded && currentDate <= monthEnd) {
          const dateStr = format(currentDate, 'yyyy-MM-dd');
          const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
          
          if (!isWeekend) {
            const existing = workDays.find(wd => wd.date === dateStr);
            if (!existing || !existing.isWorkDay) {
              newWorkDays.push({ date: dateStr, isWorkDay: true });
            }
            addedCount++;
          }
          currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
        }
        
        if (newWorkDays.length > 0) {
          await dbLocal.workDays.bulkPut(newWorkDays);
          // We need to wait a bit for the useLiveQuery to update or manually update local list
          // For simplicity in this function, we'll just assume they are there or use the calculated list
          availableWorkDays = [...availableWorkDays, ...newWorkDays].sort((a, b) => a.date.localeCompare(b.date));
        }
      }

      // 4. Create the visit list (each ID twice)
      // Sort applicants by address to keep them together
      const sortedApplicants = [...applicants].sort((a, b) => a.address.localeCompare(b.address));
      const visitList = [...sortedApplicants, ...sortedApplicants];
      
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

      // 6. Distribute into days
      let visitIndex = 0;
      for (let d = 0; d < daysNeeded; d++) {
        const wd = availableWorkDays[d];
        if (!wd) break;

        const dailyAssignments: { applicantId: number, staffIds: number[] }[] = [];
        
        for (let i = 0; i < 6; i++) {
          let applicant = visitList[visitIndex];
          
          // If we ran out of visits (shouldn't happen with daysNeeded calculation but for safety)
          // or if it's the last day and we need to fill to 6
          if (!applicant) {
            applicant = sortedApplicants[i % sortedApplicants.length];
          }

          const teamIndex = Math.floor(i / 2) % teams.length;
          const team = teams[teamIndex];

          dailyAssignments.push({ 
            applicantId: applicant.id!,
            staffIds: team || []
          });
          
          visitIndex++;
        }
        
        await dbLocal.schedules.add({
          date: wd.date,
          assignments: dailyAssignments
        });
      }
    } catch (error) {
      console.error("Error generating schedule:", error);
    } finally {
      setIsGenerating(false);
    }
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
            } else {
              // Fallback to neighborhood coordinates if geocoding fails
              const fallback = EDIRNE_NEIGHBORHOOD_COORDS[item.applicant.neighborhood || ''] || [41.675, 26.570];
              await dbLocal.applicants.update(item.applicant.id!, {
                lat: fallback[0] + (Math.random() - 0.5) * 0.01,
                lng: fallback[1] + (Math.random() - 0.5) * 0.01
              });
            }
            
            // Respect rate limit
            if (i < itemsWithMissingCoords.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1200));
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
    if (!day) return [];
    return day.items.map((item, i) => ({
      pos: [
        item.applicant.lat || (41.675 + (i * 0.002)), 
        item.applicant.lng || (26.570 + (i * 0.002))
      ] as [number, number],
      name: `${item.applicant.name} ${item.applicant.surname}`,
      address: item.applicant.address
    }));
  }, [expandedDay, assignments]);

  return (
    <div className="space-y-6 relative">
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
          <MapContainer center={[41.675, 26.570]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {activeMarkers.map((m, i) => (
              <Marker key={`${expandedDay}-${i}`} position={m.pos}>
                <Popup>
                  <div className="font-bold">{m.name}</div>
                  <div className="text-xs text-gray-500">{m.address}</div>
                </Popup>
              </Marker>
            ))}
            {expandedDay && activeMarkers.length > 0 && <MapUpdater markers={activeMarkers} />}
          </MapContainer>
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
                      {a.items.map((item, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-gray-900">{item.applicant.name} {item.applicant.surname}</div>
                              <div className="text-[10px] text-blue-600 font-medium line-clamp-1">{item.applicant.address}</div>
                            </div>
                            <div className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">{item.applicant.tcNo}</div>
                          </div>
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Müracaatçı Değiştir</label>
                              <select
                                value={item.applicant.id || ''}
                                onChange={(e) => {
                                  const newId = parseInt(e.target.value);
                                  const schedule = schedules.find(s => s.date === a.date);
                                  if (schedule) {
                                    const newAssignments = schedule.assignments.map((assignment, i) => 
                                      i === idx ? { ...assignment, applicantId: newId } : assignment
                                    );
                                    dbLocal.schedules.update(schedule.id!, { assignments: newAssignments });
                                  }
                                }}
                                className="w-full text-sm bg-gray-50 border-none rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
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
                                    onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, sIdx, parseInt(e.target.value))}
                                    className="w-full text-xs bg-gray-50 border-none rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">Seç...</option>
                                    {staff.map(s => {
                                      // Check if this staff is already assigned to THIS applicant in the OTHER slot
                                      const isAlreadyInThisApp = item.staffMembers.some((sm, idx) => sm.id === s.id && idx !== sIdx);
                                      // Check if this staff is assigned to OTHER applicants on the SAME day
                                      // (A staff member can visit 2 applicants per day)
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
                          <button 
                            onClick={() => saveDay(a.date)}
                            className={`w-full mt-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                              lastSavedDay === a.date 
                                ? 'bg-green-600 text-white shadow-lg shadow-green-100' 
                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {lastSavedDay === a.date ? 'Kaydedildi!' : 'Günü Kaydet ve Onayla'}
                          </button>
                        </div>
                      ))}
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
