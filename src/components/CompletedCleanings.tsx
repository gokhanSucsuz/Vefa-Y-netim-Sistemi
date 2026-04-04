import { useState, useMemo } from 'react';
import { Applicant, Staff, Schedule } from '../types';
import { Search, FileText, CheckCircle2, Calendar, User, MapPin } from 'lucide-react';
import { generateCleaningReport } from '../lib/pdfUtils';

interface CompletedCleaningsProps {
  applicants: Applicant[];
  staff: Staff[];
  schedules: Schedule[];
}

export default function CompletedCleanings({ applicants, staff, schedules }: CompletedCleaningsProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const completedItems = useMemo(() => {
    const items: any[] = [];
    schedules.forEach(schedule => {
      (schedule.assignments || []).forEach(assignment => {
        if (assignment.isCompleted) {
          const applicant = applicants.find(a => a.id === assignment.applicantId);
          const staffMembers = (assignment.staffIds || []).map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[];
          
          if (applicant) {
            items.push({
              id: `${schedule.id}-${assignment.applicantId}`,
              applicant,
              staffMembers,
              date: assignment.completionDate || schedule.date,
              originalDate: schedule.date,
              isCompleted: assignment.isCompleted,
              note: assignment.completionNote
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
            
            if (applicant) {
              items.push({
                id: `${schedule.id}-${assignment.applicantId}`,
                applicant,
                staffMembers,
                date: schedule.date,
                originalDate: schedule.date,
                isCompleted: false,
                note: assignment.completionNote
              });
            }
          }
        }
      });
    });
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [applicants, staff, schedules]);

  const filteredItems = completedItems.filter(item => 
    `${item.applicant.name} ${item.applicant.surname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.applicant.tcNo.includes(searchTerm) ||
    item.applicant.neighborhood?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900">Tamamlanan Temizlikler</h2>
          <p className="text-xs lg:text-sm text-gray-500 font-medium">Hizmet sunulan müracaatçıların listesi ve raporları</p>
        </div>
        
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Müracaatçı veya mahalle ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all group flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className={`p-2 rounded-lg ${item.isCompleted ? 'bg-green-50' : 'bg-orange-50'}`}>
                <CheckCircle2 className={`w-5 h-5 ${item.isCompleted ? 'text-green-600' : 'text-orange-600'}`} />
              </div>
              <button
                onClick={() => generateCleaningReport(item.applicant, item.staffMembers, item.date)}
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
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium">Temizlik Günü:</span>
                  <span className="font-bold text-blue-700">{new Date(item.date).toLocaleDateString('tr-TR')}</span>
                </div>
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
                      {item.staffMembers.map(s => (
                        <span key={s.id} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-[10px] font-bold">
                          {s.name} {s.surname}
                        </span>
                      ))}
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
