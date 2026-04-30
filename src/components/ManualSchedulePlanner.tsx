import { useState, useMemo } from 'react';
import { Applicant, Schedule, WorkDay, Program, SystemUser, Staff } from '../types';
import { dbLocal } from '../db';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, Calendar, Users, MapPin, CheckCircle2 } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { logAction } from '../services/auditService';

interface Props {
  applicants: Applicant[];
  staff: Staff[];
  workDays: WorkDay[];
  schedules: Schedule[];
  currentUser: SystemUser;
  onClose: () => void;
}

interface SelectedAssignment {
  applicantId: string;
  staffIds: string[];
}

export default function ManualSchedulePlanner({ applicants, staff, workDays, schedules, currentUser, onClose }: Props) {
  const [currentDateIndex, setCurrentDateIndex] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(6);
  const [selectedAssignments, setSelectedAssignments] = useState<SelectedAssignment[]>([]);
  
  // Teams calculated from staff
  const teams = useMemo(() => {
    const pairs: Staff[][] = [];
    const used = new Set<string>();
    staff.filter(s => s.isActive && !s.isBackup).forEach(s => {
      if (!used.has(s.id!)) {
        const p = staff.find(p => p.id === s.partnerId && !used.has(p.id!));
        if (p) {
          pairs.push([s, p]);
          used.add(s.id!);
          used.add(p.id!);
        } else {
          pairs.push([s]);
          used.add(s.id!);
        }
      }
    });
    return pairs;
  }, [staff]);

  // Find next available workdays
  const availableDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = [];
    
    for (let i = 0; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = format(d, 'yyyy-MM-dd');
      
      const explicitSetting = workDays.find(wd => wd.date === dateStr);
      const isWeekendDay = d.getDay() === 0 || d.getDay() === 6;
      
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
    const selectedIds = selectedAssignments.map(a => a.applicantId);
    
    return applicants.map(app => {
      // Find last visit
      const visits = schedules.flatMap(s => 
        s.assignments.filter(a => a.applicantId === app.id).map(() => s.date)
      ).concat(selectedIds.includes(app.id!) ? [currentDateObj.date] : []); 
      
      let isAvailable = true;
      let reason = '';
      
      for (const vDate of visits) {
        if (vDate === currentDateObj.date && !selectedIds.includes(app.id!)) {
           isAvailable = false;
           reason = 'Bugün zaten listede';
           break;
        }
        if (vDate !== currentDateObj.date) {
           const daysDiff = Math.abs(differenceInDays(tDate, parseISO(vDate)));
           if (daysDiff < 14) {
             isAvailable = false;
             reason = `Son ziyaret: ${daysDiff} gün önce`;
             break;
           }
        }
      }
      return { applicant: app, isAvailable, reason };
    }).sort((a, b) => {
      // Prioritize available, then by priority number (highest first)
      if (a.isAvailable && !b.isAvailable) return -1;
      if (!a.isAvailable && b.isAvailable) return 1;
      return (b.applicant.priority || 0) - (a.applicant.priority || 0);
    });
  }, [applicants, schedules, currentDateObj, selectedAssignments]);

  const handleSelect = (appId: string) => {
    if (existingCount + selectedAssignments.length >= dailyLimit) {
      alert(`Günlük limite (${dailyLimit}) ulaştınız.`);
      return;
    }
    setSelectedAssignments([...selectedAssignments, { applicantId: appId, staffIds: [] }]);
  };

  const handleRemove = (appId: string) => {
    setSelectedAssignments(selectedAssignments.filter(a => a.applicantId !== appId));
  };

  const handleUpdateTeam = (appId: string, staffIds: string[]) => {
    setSelectedAssignments(selectedAssignments.map(a => 
      a.applicantId === appId ? { ...a, staffIds } : a
    ));
  };
  
  const handleSaveDay = async () => {
    if (!currentDateObj) return;
    if (selectedAssignments.length === 0) {
      alert('Hiç hane seçmediniz.');
      return;
    }
    
    try {
       const sched = schedules.find(s => s.date === currentDateObj.date);
       const newAssignments = selectedAssignments.map(a => ({ 
         applicantId: a.applicantId, 
         staffIds: a.staffIds,
         isCompleted: false 
       }));
       
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
       
       logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Manuel Atama', `${currentDateObj.date} tarihine ${selectedAssignments.length} hane eklendi.`);
       setSelectedAssignments([]);
       if (currentDateIndex < availableDates.length - 1) {
          setCurrentDateIndex(currentDateIndex + 1);
       } else {
          alert('Tüm uygun günlere ulaştınız.');
          onClose();
       }
       
    } catch(err) {
       console.error(err);
       alert('Kaydetme hatası.');
    }
  };

  if (availableDates.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl w-full max-w-md text-center shadow-2xl animate-in zoom-in-95 duration-200">
           <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
             <Calendar className="w-8 h-8 text-blue-500" />
           </div>
           <h3 className="text-xl font-bold text-slate-900 mb-2">Manuel Planlama</h3>
           <p className="text-slate-500 text-sm mb-8 leading-relaxed">
             Planlama yapılabilecek ileri tarihli iş günü bulunamadı. Lütfen "İş Günleri" takviminden çalışma günlerini kontrol ediniz.
           </p>
           <button onClick={onClose} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-all active:scale-95">
             Kapat
           </button>
        </div>
      </div>
    );
  }

  const selectedIds = selectedAssignments.map(a => a.applicantId);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 lg:p-8">
      <div className="bg-white rounded-[2rem] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white relative z-20">
           <div>
             <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
               <span className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-inner shadow-blue-400/50">
                 <Settings2 className="w-5 h-5"/>
               </span>
               Özel Planlama Modu
             </h3>
             <p className="text-sm font-medium text-slate-500 mt-1 pl-13">Haneleri ve ekipleri günlere göre özel olarak atayın.</p>
           </div>
           <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full transition-colors">
             <X className="w-5 h-5"/>
           </button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
           {/* Sol Taraf: Seçilenler ve Gün Kaydetme */}
           <div className="w-[40%] min-w-[350px] border-r border-slate-100 bg-slate-50 flex flex-col relative z-10">
              
              {/* Tarih Seçici */}
              <div className="p-6 bg-white border-b border-slate-100 flex justify-between items-center shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
                 <button 
                   disabled={currentDateIndex === 0} 
                   onClick={() => { setCurrentDateIndex(currentDateIndex - 1); setSelectedAssignments([]); }}
                   className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-full disabled:opacity-30 transition-all shadow-sm"
                 >
                   <ChevronLeft className="w-5 h-5 text-slate-600"/>
                 </button>
                 <div className="text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Planlanan Gün</div>
                    <div className="text-xl font-black text-slate-800 tracking-tight">
                      {format(parseISO(currentDateObj.date), 'dd MMMM yyyy', { locale: tr })}
                    </div>
                 </div>
                 <button 
                   disabled={currentDateIndex === availableDates.length - 1} 
                   onClick={() => { setCurrentDateIndex(currentDateIndex + 1); setSelectedAssignments([]); }}
                   className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-full disabled:opacity-30 transition-all shadow-sm"
                 >
                   <ChevronRight className="w-5 h-5 text-slate-600"/>
                 </button>
              </div>
              
              <div className="p-6 flex-1 overflow-y-auto">
                 <div className="flex justify-between items-end mb-6">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Seçilen Atamalar</h4>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-1">Bu gün için taslak planınız</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Doluluk</span>
                      <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center gap-2">
                        <span className="text-blue-600 font-black text-sm">{existingCount + selectedAssignments.length}</span>
                        <span className="text-slate-300 font-bold">/</span>
                        <span className="text-slate-500 font-bold text-sm">{dailyLimit}</span>
                      </div>
                    </div>
                 </div>
                 
                 <div className="space-y-3">
                   {/* Zaten planda olanlar */}
                   {currentDaySchedule?.assignments.map(a => {
                      const applicant = applicants.find(p => p.id === a.applicantId);
                      return applicant ? (
                        <div key={a.applicantId} className="bg-slate-100 p-4 rounded-2xl border border-slate-200 flex justify-between items-center opacity-60">
                           <div>
                             <div className="text-sm font-bold text-slate-600 line-through decoration-slate-300">{applicant.name} {applicant.surname}</div>
                             <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">Mevcut Planda Kayıtlı</div>
                           </div>
                           <CheckCircle2 className="w-5 h-5 text-slate-400" />
                        </div>
                      ) : null;
                   })}
                   
                   {/* Yeni seçilenler */}
                   {selectedAssignments.map((assignment, idx) => {
                      const applicant = applicants.find(p => p.id === assignment.applicantId);
                      if (!applicant) return null;
                      
                      return (
                        <div key={assignment.applicantId} className="bg-white p-4 rounded-2xl border border-blue-100 shadow-[0_4px_12px_rgba(37,99,235,0.05)] relative group animate-in slide-in-from-right-4 duration-300">
                           <div className="flex justify-between items-start mb-3">
                             <div>
                               <div className="text-sm font-bold text-slate-900">{applicant.name} {applicant.surname}</div>
                               <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mt-1">
                                 <MapPin className="w-3 h-3 text-blue-500" />
                                 {applicant.neighborhood}
                               </div>
                             </div>
                             <button 
                               onClick={() => handleRemove(assignment.applicantId)} 
                               className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-all"
                             >
                               <Trash2 className="w-4 h-4"/>
                             </button>
                           </div>
                           
                           {/* Ekip Seçimi */}
                           <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 mt-2">
                             <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">
                               Görevli Ekibi Seçin
                             </label>
                             <select
                               className="w-full bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                               value={assignment.staffIds.join(',')}
                               onChange={(e) => {
                                 const val = e.target.value;
                                 handleUpdateTeam(assignment.applicantId, val ? val.split(',') : []);
                               }}
                             >
                               <option value="">-- Ekip Atanmadı --</option>
                               {teams.map((team, tIdx) => (
                                 <option key={tIdx} value={team.map(t => t.id).join(',')}>
                                   Ekip {tIdx + 1}: {team.map(t => t.name).join(' & ')}
                                 </option>
                               ))}
                             </select>
                           </div>
                        </div>
                      );
                   })}
                 </div>

                 {existingCount === 0 && selectedAssignments.length === 0 && (
                   <div className="h-48 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 mt-4">
                     <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                       <Plus className="w-5 h-5 text-slate-300" />
                     </div>
                     <p className="text-sm font-bold text-slate-500 mb-1">Atama Yapılmadı</p>
                     <p className="text-xs text-slate-400">Sağdaki listeden hane seçerek bu güne görev atamaya başlayın.</p>
                   </div>
                 )}
              </div>
              
              <div className="p-6 bg-white border-t border-slate-100">
                 <button 
                   onClick={handleSaveDay}
                   disabled={selectedAssignments.length === 0}
                   className="w-full bg-slate-900 text-white font-bold text-sm py-4 rounded-xl hover:bg-slate-800 disabled:opacity-30 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-[0_8px_16px_rgba(0,0,0,0.1)] active:scale-[0.98] flex items-center justify-center gap-2"
                 >
                   Günü Kaydet ve Devam Et
                   <ChevronRight className="w-4 h-4" />
                 </button>
              </div>
           </div>
           
           {/* Sağ Taraf: Hane Havuzu */}
           <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative z-0">
              <div className="px-8 py-5 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm">
                 <div>
                   <h4 className="font-bold text-sm text-slate-900">Bekleyen Haneler Havuzu</h4>
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Sadece ziyaret sırası gelenler aktiftir</p>
                 </div>
                 <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Günlük Kota:</span>
                    <input 
                      type="number" 
                      min="1" max="20" 
                      value={dailyLimit} 
                      onChange={e => setDailyLimit(Number(e.target.value))} 
                      className="w-12 bg-transparent text-center font-black text-blue-600 text-sm outline-none border-b-2 border-transparent focus:border-blue-500 transition-colors"
                    />
                 </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
                   {applicantAvailability.map((item) => {
                      const isSelected = selectedIds.includes(item.applicant.id!);
                      return (
                        <div 
                          key={item.applicant.id}
                          onClick={() => {
                             if (item.isAvailable && !isSelected) handleSelect(item.applicant.id!);
                          }}
                          className={`group relative overflow-hidden p-5 rounded-2xl border transition-all duration-200 ${
                             item.isAvailable && !isSelected
                             ? 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-[0_8px_20px_-4px_rgba(37,99,235,0.1)] cursor-pointer' 
                             : 'bg-slate-100 border-transparent opacity-60 cursor-not-allowed'
                          }`}
                        >
                           <div className="relative z-10 flex justify-between items-start">
                             <div className="pr-10">
                               <div className="flex items-center gap-2 mb-1.5">
                                 <span className={`px-2 py-0.5 rounded uppercase font-black text-[9px] tracking-wider ${
                                   item.applicant.priority === 1 ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
                                 }`}>
                                   P{item.applicant.priority || 0}
                                 </span>
                                 <h5 className={`font-bold text-sm leading-tight ${item.isAvailable ? 'text-slate-900 group-hover:text-blue-700' : 'text-slate-500'}`}>
                                   {item.applicant.name} {item.applicant.surname}
                                 </h5>
                               </div>
                               <div className="text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                                 <MapPin className="w-3 h-3 text-slate-300" />
                                 {item.applicant.neighborhood}
                               </div>
                               
                               {!item.isAvailable && (
                                 <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded-md mt-2">
                                   <X className="w-3 h-3 text-red-500" />
                                   <span className="text-[10px] font-bold text-red-600">{item.reason}</span>
                                 </div>
                               )}
                             </div>
                             
                             {item.isAvailable && !isSelected && (
                               <div className="absolute right-0 top-0 w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all shadow-sm">
                                  <Plus className="w-4 h-4" />
                               </div>
                             )}
                           </div>

                           {/* Interactive Background Gradient */}
                           {item.isAvailable && !isSelected && (
                             <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0" />
                           )}
                        </div>
                      )
                   })}
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

