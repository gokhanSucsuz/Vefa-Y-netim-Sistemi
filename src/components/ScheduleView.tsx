import { useState, useMemo } from 'react';
import { dbLocal } from '../db';
import { Applicant, Staff, WorkDay, Schedule, DailyAssignment, EDIRNE_NEIGHBORHOODS } from '../types';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Wand2, FileSpreadsheet, FileText, Users, Map as MapIcon, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

// Rough coordinates for Edirne neighborhoods for the "offline" map feel
const NEIGHBORHOOD_COORDS: Record<string, [number, number]> = {
  "1. Murat": [41.675, 26.570],
  "Abdurrahman": [41.670, 26.560],
  "Babademirtaş": [41.678, 26.555],
  "Barutluk": [41.685, 26.550],
  "Çavuşbey": [41.672, 26.545],
  "Dilaverbey": [41.676, 26.552],
  "Fatih": [41.665, 26.580],
  "İstasyon": [41.660, 26.575],
  "Karaağaç": [41.650, 26.520],
  "Kocasinan": [41.672, 26.565],
  "Medrese Alibey": [41.680, 26.562],
  "Menzilahir": [41.675, 26.540],
  "Mithatpaşa": [41.677, 26.558],
  "Nişancıpaşa": [41.682, 26.568],
  "Sabuni": [41.679, 26.554],
  "Sarıcapaşa": [41.674, 26.562],
  "Şükrüpaşa": [41.680, 26.585],
  "Talataşa": [41.671, 26.555],
  "Umurbey": [41.673, 26.548],
  "Yeniimaret": [41.685, 26.530],
  "Yıldırım Beyazıt": [41.690, 26.540],
  "Yıldırım Hacı Sarraf": [41.695, 26.545]
};

interface Props {
  applicants: Applicant[];
  staff: Staff[];
  workDays: WorkDay[];
  schedules: Schedule[];
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 13);
  return null;
}

export default function ScheduleView({ applicants, staff, workDays, schedules }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showMap, setShowMap] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

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
            staff: staff.find(s => s.id === a.staffId)
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
    if (currentMonthWorkDays.length === 0) {
      alert('Lütfen bu ay için iş günlerini belirleyin.');
      return;
    }

    setIsGenerating(true);
    try {
      // Clear existing schedules for this month
      const existingIds = schedules
        .filter(s => {
          const d = parseISO(s.date);
          return d >= monthStart && d <= monthEnd;
        })
        .map(s => s.id!);
      
      if (existingIds.length > 0) {
        await dbLocal.schedules.bulkDelete(existingIds);
      }

      // Sort applicants by neighborhood to keep them together
      const sortedApplicants = [...applicants].sort((a, b) => a.neighborhood.localeCompare(b.neighborhood));

      let applicantIndex = 0;
      for (const wd of currentMonthWorkDays) {
        const dailyAssignments: { applicantId: number }[] = [];
        for (let i = 0; i < 6; i++) {
          dailyAssignments.push({ applicantId: sortedApplicants[applicantIndex].id! });
          applicantIndex = (applicantIndex + 1) % sortedApplicants.length;
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

  const updateStaffAssignment = async (date: string, applicantId: number, staffId: number) => {
    const schedule = schedules.find(s => s.date === date);
    if (!schedule) return;

    const newAssignments = schedule.assignments.map(a => 
      a.applicantId === applicantId ? { ...a, staffId } : a
    );

    await dbLocal.schedules.update(schedule.id!, { assignments: newAssignments });
  };

  const exportToExcel = () => {
    const data = assignments.flatMap(a => a.items.map(item => ({
      'Tarih': format(parseISO(a.date), 'dd MMMM yyyy', { locale: tr }),
      'Mahalle': item.applicant.neighborhood,
      'Müracaatçı': `${item.applicant.name} ${item.applicant.surname}`,
      'TC No': item.applicant.tcNo,
      'Görevli Personel': item.staff ? `${item.staff.name} ${item.staff.surname}` : 'Atanmamış'
    })));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Temizlik Programı");
    XLSX.writeFile(wb, `SYDV_Temizlik_Programi_${format(selectedMonth, 'MMMM_yyyy', { locale: tr })}.xlsx`);
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
      item.staff ? trFix(`${item.staff.name} ${item.staff.surname}`) : 'Atanmamis'
    ]));

    autoTable(doc, {
      startY: 25,
      head: [[trFix('Tarih'), trFix('Mahalle'), trFix('Muracaatci'), trFix('Gorevli Personel')]],
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
    return day.items.map(item => ({
      pos: NEIGHBORHOOD_COORDS[item.applicant.neighborhood] || [41.675, 26.570],
      name: `${item.applicant.name} ${item.applicant.surname}`,
      neighborhood: item.applicant.neighborhood
    }));
  }, [expandedDay, assignments]);

  return (
    <div className="space-y-6">
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
              <Marker key={i} position={m.pos}>
                <Popup>
                  <div className="font-bold">{m.name}</div>
                  <div className="text-xs text-gray-500">{m.neighborhood}</div>
                </Popup>
              </Marker>
            ))}
            {expandedDay && activeMarkers.length > 0 && <MapUpdater center={activeMarkers[0].pos} />}
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
                        {a.items.length > 0 ? `${[...new Set(a.items.map(i => i.applicant.neighborhood))].join(', ')}` : 'Atama Yapılmamış'}
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
                              <div className="text-xs text-blue-600 font-medium">{item.applicant.neighborhood}</div>
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
                                    {app.name} {app.surname} ({app.neighborhood})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Temizlik Görevlisi</label>
                              <select
                                value={item.staff?.id || ''}
                                onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, parseInt(e.target.value))}
                                className="w-full text-sm bg-gray-50 border-none rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Personel Seçin...</option>
                                {staff.map(s => {
                                  const isAssignedToOther = a.items.some(i => i.staff?.id === s.id && i.applicant.id !== item.applicant.id);
                                  return (
                                    <option 
                                      key={s.id} 
                                      value={s.id} 
                                      disabled={isAssignedToOther}
                                      className={isAssignedToOther ? 'text-gray-300' : ''}
                                    >
                                      {s.name} {s.surname} {isAssignedToOther ? '(Meşgul)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>
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
