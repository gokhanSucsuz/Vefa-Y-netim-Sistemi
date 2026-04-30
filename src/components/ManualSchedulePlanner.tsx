import { useState, useMemo } from 'react';
import { Applicant, Schedule, WorkDay, Program, SystemUser } from '../types';
import { dbLocal } from '../db';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, Calendar } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { logAction } from '../services/auditService';

interface Props {
  applicants: Applicant[];
  workDays: WorkDay[];
  schedules: Schedule[];
  currentUser: SystemUser;
  onClose: () => void;
}

export default function ManualSchedulePlanner({ applicants, workDays, schedules, currentUser, onClose }: Props) {
  const [currentDateIndex, setCurrentDateIndex] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(6);
  const [selectedApplicants, setSelectedApplicants] = useState<string[]>([]);
  
  // Bulunacak sonraki çalışma günleri. 
  const availableDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = [];
    
    // Look ahead 90 days to find available workdays
    for (let i = 0; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = format(d, 'yyyy-MM-dd');
      
      const explicitSetting = workDays.find(wd => wd.date === dateStr);
      const isWeekendDay = d.getDay() === 0 || d.getDay() === 6; // 0 is Sunday, 6 is Saturday
      
      const isWorkDay = explicitSetting ? explicitSetting.isWorkDay : !isWeekendDay;
      
      if (isWorkDay && dateStr > format(new Date(), 'yyyy-MM-dd')) {
        dates.push({ date: dateStr });
      }
    }
    
    return dates;
  }, [workDays]);

  const currentDateObj = availableDates[currentDateIndex];
  
  const currentDaySchedule = schedules.find(s => s.date === currentDateObj?.date);
  const existingCount = currentDaySchedule ? currentDaySchedule.assignments.length : 0;
  
  // List applicant availability for the CURRENT date
  const applicantAvailability = useMemo(() => {
    if (!currentDateObj) return [];
    const tDate = parseISO(currentDateObj.date);
    
    return applicants.map(app => {
      // Find last visit
      const visits = schedules.flatMap(s => 
        s.assignments.filter(a => a.applicantId === app.id).map(() => s.date)
      ).concat(selectedApplicants.includes(app.id!) ? [currentDateObj.date] : []); // add pending selection
      
      let isAvailable = true;
      let reason = '';
      
      // 14 day rule check
      for (const vDate of visits) {
        if (vDate === currentDateObj.date && !selectedApplicants.includes(app.id!)) {
           isAvailable = false;
           reason = 'Bu gün zaten listede';
           break;
        }
        if (vDate !== currentDateObj.date) {
           const daysDiff = Math.abs(differenceInDays(tDate, parseISO(vDate)));
           if (daysDiff < 14) {
             isAvailable = false;
             reason = `Son ziyaret: ${format(parseISO(vDate), 'dd.MM.yyyy')} (${daysDiff} gün önce)`;
             break;
           }
        }
      }
      return { applicant: app, isAvailable, reason };
    });
  }, [applicants, schedules, currentDateObj, selectedApplicants]);

  const handleSelect = (appId: string) => {
    if (existingCount + selectedApplicants.length >= dailyLimit) {
      alert(`Günlük limite (${dailyLimit}) ulaştınız.`);
      return;
    }
    setSelectedApplicants([...selectedApplicants, appId]);
  };

  const handleRemove = (appId: string) => {
    setSelectedApplicants(selectedApplicants.filter(id => id !== appId));
  };
  
  const handleSaveDay = async () => {
    if (!currentDateObj) return;
    if (selectedApplicants.length === 0) {
      alert('Hiç hane seçmediniz.');
      return;
    }
    
    try {
       const sched = schedules.find(s => s.date === currentDateObj.date);
       const newAssignments = selectedApplicants.map(id => ({ applicantId: id, isCompleted: false }));
       
       const activeProgram = await dbLocal.programs.where('status').equals('active').first();
       
       if (sched) {
          await dbLocal.schedules.update(sched.id!, { 
             assignments: [...sched.assignments, ...newAssignments]
          });
       } else {
          let pId = activeProgram?.id || 'manual';
          await dbLocal.schedules.add({
             date: currentDateObj.date,
             programId: pId,
             assignments: newAssignments
          });
       }
       
       logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Manuel Atama', `${currentDateObj.date} tarihine ${selectedApplicants.length} hane eklendi.`);
       setSelectedApplicants([]);
       if (currentDateIndex < availableDates.length - 1) {
          setCurrentDateIndex(currentDateIndex + 1);
       } else {
          alert('Tüm uygun günlere ulaştınız.');
       }
       
    } catch(err) {
       console.error(err);
       alert('Kaydetme hatası.');
    }
  };

  if (availableDates.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-3xl w-full max-w-md text-center">
           <h3 className="text-xl font-bold mb-4">Manuel Planlama</h3>
           <p className="text-gray-500 mb-6">Planlama yapılabilecek ileri tarihli iş günü bulunamadı. Lütfen "İş Günleri" takviminden gün ayarlayınız.</p>
           <button onClick={onClose} className="bg-gray-100 px-4 py-2 rounded-xl font-bold w-full">Kapat</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b flex items-center justify-between bg-slate-50">
           <div>
             <h3 className="text-xl font-bold flex items-center gap-2"><Calendar className="text-blue-500"/> Manuel Program Planlama</h3>
             <p className="text-sm text-gray-500">Haneleri günlere tek tek seçerek atayın.</p>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5"/></button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
           {/* Sol Taraf: Gün Seçimi ve Atananlar */}
           <div className="w-1/3 border-r bg-slate-50 flex flex-col">
              <div className="p-4 border-b bg-white flex justify-between items-center shadow-sm z-10">
                 <button 
                   disabled={currentDateIndex === 0} 
                   onClick={() => { setCurrentDateIndex(currentDateIndex - 1); setSelectedApplicants([]); }}
                   className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"
                 >
                   <ChevronLeft className="w-5 h-5"/>
                 </button>
                 <div className="text-center">
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Tarih</div>
                    <div className="text-xl font-black text-blue-700">{format(parseISO(currentDateObj.date), 'dd.MM.yyyy')}</div>
                 </div>
                 <button 
                   disabled={currentDateIndex === availableDates.length - 1} 
                   onClick={() => { setCurrentDateIndex(currentDateIndex + 1); setSelectedApplicants([]); }}
                   className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"
                 >
                   <ChevronRight className="w-5 h-5"/>
                 </button>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto">
                 <div className="flex justify-between items-center mb-4">
                    <span className="font-bold text-sm text-slate-700">Seçilen Haneler</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md font-bold">
                      {existingCount + selectedApplicants.length} / {dailyLimit}
                    </span>
                 </div>
                 
                 {/* Zaten planda olanlar */}
                 {currentDaySchedule?.assignments.map(a => {
                    const applicant = applicants.find(p => p.id === a.applicantId);
                    return applicant ? (
                      <div key={a.applicantId} className="bg-white p-3 rounded-xl border mb-2 flex justify-between items-center opacity-60">
                         <span className="text-sm font-bold text-slate-700 truncate">{applicant.name} {applicant.surname}</span>
                         <span className="text-[10px] uppercase text-gray-400 font-bold">Önceden Eklendi</span>
                      </div>
                    ) : null;
                 })}
                 
                 {/* Yeni seçilenler */}
                 {selectedApplicants.map(id => {
                    const applicant = applicants.find(p => p.id === id);
                    return applicant ? (
                      <div key={id} className="bg-blue-50 p-3 rounded-xl border border-blue-200 mb-2 flex justify-between items-center ring-1 ring-blue-500 shadow-sm animate-in slide-in-from-right-4 duration-200">
                         <span className="text-sm font-bold text-blue-900 truncate">{applicant.name} {applicant.surname}</span>
                         <button onClick={() => handleRemove(id)} className="p-1 hover:bg-white rounded-md text-red-500 transition-colors">
                           <Trash2 className="w-4 h-4"/>
                         </button>
                      </div>
                    ) : null;
                 })}

                 {existingCount === 0 && selectedApplicants.length === 0 && (
                   <div className="text-center py-10 opacity-50">
                     <p className="text-sm font-medium">Bu güne henüz hane atanmadı.</p>
                   </div>
                 )}
              </div>
              
              <div className="p-4 border-t bg-white">
                 <button 
                   onClick={handleSaveDay}
                   disabled={selectedApplicants.length === 0}
                   className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg active:scale-[0.98]"
                 >
                   Günü Kaydet ve Sonraki Güne Geç
                 </button>
              </div>
           </div>
           
           {/* Sağ Taraf: Hane Havuzu */}
           <div className="flex-[2] flex flex-col bg-white overflow-hidden relative">
              <div className="p-4 border-b flex justify-between items-center bg-white z-10 shadow-sm">
                 <h4 className="font-bold text-sm text-gray-700 uppercase tracking-widest">Uygun Haneler</h4>
                 <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                    Günlük Limit: 
                    <input 
                      type="number" 
                      min="1" max="20" 
                      value={dailyLimit} 
                      onChange={e => setDailyLimit(Number(e.target.value))} 
                      className="w-16 p-1.5 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg ml-1 text-center font-bold text-black outline-none transition-all"
                    />
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start bg-slate-50/50">
                 {applicantAvailability.map((item, idx) => (
                    <div 
                      key={item.applicant.id}
                      className={`p-4 rounded-xl border transition-all flex justify-between items-center group relative overflow-hidden ${
                         item.isAvailable && !selectedApplicants.includes(item.applicant.id!)
                         ? 'border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer bg-white' 
                         : 'border-slate-100 bg-slate-50/50 opacity-60 cursor-not-allowed'
                      }`}
                      onClick={() => {
                         if (item.isAvailable && !selectedApplicants.includes(item.applicant.id!)) handleSelect(item.applicant.id!);
                      }}
                    >
                       <div className="min-w-0 pr-4 relative z-10">
                         <div className={`font-bold text-sm truncate ${item.isAvailable ? 'text-gray-900 group-hover:text-blue-700 transition-colors' : 'text-gray-500'}`}>
                           {item.applicant.name} {item.applicant.surname}
                         </div>
                         <div className="text-[10px] text-gray-500 truncate mt-0.5">{item.applicant.neighborhood}</div>
                         {!item.isAvailable && <div className="text-[10px] font-bold text-red-500 mt-1.5 flex items-center gap-1"><X className="w-3 h-3"/> {item.reason}</div>}
                       </div>
                       
                       {item.isAvailable && !selectedApplicants.includes(item.applicant.id!) && (
                         <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-active:scale-90 border border-slate-200 group-hover:border-transparent shrink-0 transition-all z-10 relative">
                            <Plus className="w-5 h-5" />
                         </div>
                       )}

                       {/* Decorative highlight background */}
                       {item.isAvailable && !selectedApplicants.includes(item.applicant.id!) && (
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent to-blue-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                       )}
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
