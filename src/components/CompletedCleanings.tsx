import toast from 'react-hot-toast';
import { useState, useMemo, useEffect } from 'react';
import { Applicant, Staff, Schedule, SystemUser } from '../types';
// HMR comment
import { logAction } from '../services/auditService';
import { Search, FileText, CheckCircle2, Calendar, User, MapPin, Download } from 'lucide-react';
import { generateCleaningReport, generateMassCleaningReport } from '../lib/pdfUtils';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';

interface CompletedCleaningsProps {
  applicants: Applicant[];
  staff: Staff[];
  schedules: Schedule[];
  currentUser: SystemUser;
}

export default function CompletedCleanings({ applicants, staff, schedules, currentUser }: CompletedCleaningsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const completedItems = useMemo(() => {
    const items: any[] = [];
    schedules.forEach(schedule => {
      (schedule.assignments || []).forEach(assignment => {
        if (assignment.isCompleted) {
          const applicant = applicants.find(a => a.id === assignment.applicantId);
          const staffMembers = (assignment.staffIds || []).map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[];
          
          if (staffMembers.some(s => s.name.toLowerCase().includes('deneme') || s.surname.toLowerCase().includes('deneme'))) return;

          if (applicant) {
            items.push({
              id: `${schedule.id}-${assignment.applicantId}`,
              applicant,
              staffMembers,
              date: assignment.completionDate || schedule.date,
              originalDate: schedule.date, // This is the scheduled YYYY-MM-DD
              isCompleted: assignment.isCompleted,
              note: assignment.completionNote,
              approvals: assignment.approvals
            });
          }
        } else {
          // Check if it's a past date
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const scheduleDate = new Date(schedule.date);
          scheduleDate.setHours(0, 0, 0, 0);

          if (scheduleDate < today) {
            const applicant = applicants.find(a => a.id === assignment.applicantId);
            const staffMembers = (assignment.staffIds || []).map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[];
            
            if (staffMembers.some(s => s.name.toLowerCase().includes('deneme') || s.surname.toLowerCase().includes('deneme'))) return;

            if (applicant) {
              items.push({
                id: `${schedule.id}-${assignment.applicantId}`,
                applicant,
                staffMembers,
                date: schedule.date,
                originalDate: schedule.date,
                isCompleted: false,
                note: assignment.completionNote,
                approvals: assignment.approvals
              });
            }
          }
        }
      });
    });
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [applicants, staff, schedules]);

  const filteredItems = useMemo(() => completedItems.filter(item => 
    `${item.applicant.name} ${item.applicant.surname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.applicant.tcNo.includes(searchTerm) ||
    item.applicant.neighborhood?.toLowerCase().includes(searchTerm.toLowerCase())
  ), [completedItems, searchTerm]);

  const groupedItems = useMemo(() => {
    const groups: { [key: string]: typeof filteredItems } = {};
    filteredItems.forEach(item => {
      const dateKey = item.originalDate; // YYYY-MM-DD
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });
    // sort keys descending
    return Object.entries(groups).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  }, [filteredItems]);

  const handleMassReport = async (type: 'day' | 'week' | 'month') => {
    const today = new Date();
    let itemsToReport = [];
    let periodName = '';

    if (type === 'day') {
      const todayStr = format(today, 'yyyy-MM-dd');
      itemsToReport = completedItems.filter(i => i.originalDate === todayStr);
      periodName = `Günlük Rapor (${format(today, 'dd.MM.yyyy')})`;
    } else if (type === 'week') {
      const start = startOfWeek(today, { weekStartsOn: 1 });
      const end = endOfWeek(today, { weekStartsOn: 1 });
      itemsToReport = completedItems.filter(i => {
        const d = parseISO(i.originalDate);
        return isWithinInterval(d, { start, end });
      });
      periodName = `Haftalık Rapor (${format(start, 'dd.MM.yyyy')} - ${format(end, 'dd.MM.yyyy')})`;
    } else if (type === 'month') {
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      itemsToReport = completedItems.filter(i => {
        const d = parseISO(i.originalDate);
        return isWithinInterval(d, { start, end });
      });
      periodName = `Aylık Rapor (${format(start, 'MMMM yyyy', { locale: tr })})`;
    }

    if (itemsToReport.length === 0) {
      toast.error('Seçilen dönem için kayıt bulunamadı.');
      return;
    }

    // Sort ascending by originalDate for the report
    itemsToReport.sort((a, b) => new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime());
    
    await generateMassCleaningReport(itemsToReport, periodName, currentUser);
    logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Toplu Rapor Alma', `${periodName} oluşturuldu.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900">Tamamlanan Temizlikler</h2>
          <p className="text-xs lg:text-sm text-gray-500 font-medium">Hizmet sunulan hanelerin listesi ve raporları</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm overflow-x-auto">
            <button onClick={() => handleMassReport('day')} className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Günlük
            </button>
            <button onClick={() => handleMassReport('week')} className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Haftalık
            </button>
            <button onClick={() => handleMassReport('month')} className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Aylık Rapor
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Hane veya mahalle ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
            />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {groupedItems.map(([dateKey, items]) => {
          const formattedDate = format(parseISO(dateKey), 'dd MMMM yyyy, EEEE', { locale: tr });
          return (
            <div key={dateKey} className="space-y-4">
              <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
                <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
                  <Calendar className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{formattedDate}</h3>
                <span className="text-xs font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded-full ml-auto">
                  {items.length} Kayıt
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all group flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-2 rounded-lg ${item.isCompleted ? 'bg-green-50' : 'bg-red-50'}`}>
                        <CheckCircle2 className={`w-5 h-5 ${item.isCompleted ? 'text-green-600' : 'text-red-500'}`} />
                      </div>
                      <button
                        onClick={() => {
                          generateCleaningReport(item.applicant, item.staffMembers, item.date, currentUser);
                          logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Rapor Oluşturma', `${item.applicant.name} ${item.applicant.surname} için rapor oluşturuldu.`);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-all"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Rapor Al
                      </button>
                    </div>

                    <div className="space-y-3 flex-1">
                      <div>
                        <h3 className="font-bold text-gray-900 leading-tight">
                          {item.applicant.name} {item.applicant.surname}
                        </h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                          TC: {item.applicant.tcNo}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 pt-2 border-t border-gray-50">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-medium">Mahalle:</span>
                          <span className="font-bold">{item.applicant.neighborhood || 'Belirtilmemiş'}</span>
                        </div>
                        <div className="flex items-start gap-2 text-xs text-gray-600">
                          <User className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
                          <div>
                            <span className="font-medium block mb-1">Görevli Personel:</span>
                            <div className="flex flex-wrap gap-1">
                              {item.staffMembers.map(s => {
                                const approval = item.approvals?.find((a: any) => a.staffId === s.id);
                                return (
                                  <div key={s.id} className="flex flex-col bg-gray-100 rounded-md p-1.5 min-w-[120px]">
                                    <span className="text-[10px] text-gray-700 font-bold mb-0.5">
                                      {s.name} {s.surname}
                                    </span>
                                    {(approval?.startTime || approval?.endTime) ? (
                                      <span className="text-[9px] text-gray-500 font-medium">
                                        {approval.startTime ? new Date(approval.startTime).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'}) : '--:--'} 
                                        {' - '}
                                        {approval.endTime ? new Date(approval.endTime).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-gray-400 italic">Zaman bilgisi yok</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {item.note && (
                        <div className="mt-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Temizlik Notu</p>
                          <p className="text-xs text-gray-700 italic leading-relaxed">"{item.note}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Henüz tamamlanmış bir temizlik kaydı bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
}
