import toast from 'react-hot-toast';
import { useMemo, useState } from 'react';
import { Program, Schedule, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { dbLocal } from '../db';
import { Calendar, Trash2, XCircle, CheckCircle2, Clock, MapPin, ChevronRight, ExternalLink } from 'lucide-react';
import Pagination from './Pagination';

interface ProgramManagementProps {
  programs: Program[];
  schedules: Schedule[];
  currentUser: SystemUser;
  onNavigate: (date?: string, programId?: string) => void;
}

export default function ProgramManagement({ programs, schedules, currentUser, onNavigate }: ProgramManagementProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  // Separate Automatic Programs
  const autoPrograms = useMemo(() => 
    [...programs].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    }),
  [programs]);

  // Group Manual Schedules by Date
  const manualSchedulesByDate = useMemo(() => {
    const manualOnes = schedules.filter(s => s.programId === 'manual' || !s.programId);
    const grouped = manualOnes.reduce((acc: Record<string, Schedule>, s) => {
      if (!acc[s.date]) acc[s.date] = { ...s };
      else {
        // Merge assignments if somehow split
        acc[s.date].assignments = [...acc[s.date].assignments, ...s.assignments];
      }
      return acc;
    }, {});
    
    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
  }, [schedules]);

  const paginatedPrograms = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return autoPrograms.slice(startIndex, startIndex + itemsPerPage);
  }, [autoPrograms, currentPage]);

  const handleDelete = async (id: string) => {
    const program = programs.find(p => p.id === id);
    if (!confirm('Bu programı silmek istediğinize emin misiniz? Tamamlanmış temizlik kayıtları geçmişten silinmeyecek, ancak henüz tamamlanmamış kayıtlar silinecektir.')) return;
    
    try {
      await dbLocal.transaction("rw", [dbLocal.programs, dbLocal.schedules], async () => {
        await dbLocal.programs.delete(id);
        const tempScheds = await dbLocal.schedules.toArray();
        const programSchedules = tempScheds.filter(s => s.programId === id);
        for (const s of programSchedules) {
          const completedAssignments = (s.assignments || []).filter(a => a.isCompleted);
          if (completedAssignments.length > 0) {
            await dbLocal.schedules.update(s.id!, { 
              assignments: completedAssignments,
              programId: 'history'
            });
          } else {
            await dbLocal.schedules.delete(s.id!);
          }
        }
      });
      if (program) {
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Program Silme', `${program.name} silindi. Tamamlanmış işlemler korundu.`);
      }
    } catch (error) {
      console.error('Program deletion failed:', error);
      toast.error('Program silinemedi.');
    }
  };

  const handleCancel = async (id: string) => {
    const program = programs.find(p => p.id === id);
    if (!confirm('Bu programı iptal etmek istediğinize emin misiniz?')) return;
    try {
      await dbLocal.programs.update(id, { status: 'cancelled' });
      if (program) {
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Program İptali', `${program.name} iptal edildi.`);
      }
    } catch (error) {
      console.error('Program cancellation failed:', error);
      toast.error('Program iptal edilemedi.');
    }
  };

  return (
    <div className="space-y-12">
      {/* ======================================================== */}
      {/* OTOMATİK PROGRAMLAR */}
      {/* ======================================================== */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Otomatik Programlar
            </h2>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Sistem tarafından oluşturulan toplu planlamalar</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedPrograms.map((program) => {
            const programSchedules = schedules.filter(s => s.programId === program.id);
            const totalAssignments = programSchedules.reduce((acc, s) => acc + s.assignments.length, 0);
            const completedAssignments = programSchedules.reduce((acc, s) => 
              acc + s.assignments.filter(a => a.isCompleted).length, 0);
            const progress = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;

            return (
              <div 
                key={program.id} 
                className={`group bg-white rounded-[2rem] border-2 p-6 transition-all duration-300 hover:shadow-xl hover:shadow-blue-600/5 ${
                  program.status === 'active' ? 'border-blue-50' : 'border-slate-100'
                }`}
              >
                <div className="flex items-start justify-between mb-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${program.status === 'active' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {program.status === 'active' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancel(program.id!); }}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        title="İptal Et"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(program.id!); }}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      title="Sil"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="cursor-pointer" onClick={() => onNavigate(program.startDate, program.id)}>
                    <div className="flex items-center gap-2 mb-2">
                       <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                         program.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                       }`}>
                         {program.status === 'active' ? 'AKTİF PROGRAM' : 'TAMAMLANDI'}
                       </span>
                       <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                         {new Date(program.createdAt).toLocaleDateString('tr-TR')}
                       </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 leading-none group-hover:text-blue-600 transition-colors uppercase tracking-tight">{program.name}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">DÖNEM BAŞI</span>
                      <span className="text-sm font-bold text-slate-700">
                        {new Date(program.startDate).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">DÖNEM SONU</span>
                      <span className="text-sm font-bold text-slate-700">
                        {new Date(program.endDate).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                      <span className="text-slate-400">Genel İlerleme</span>
                      <span className="text-blue-600">%{Math.round(progress)}</span>
                    </div>
                    <div className="w-full h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5">
                      <div 
                        className="h-full bg-blue-600 rounded-full transition-all duration-700 shadow-sm shadow-blue-600/30"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                      <span>{completedAssignments} Hane Tamamlandı</span>
                      <span>{totalAssignments} Toplam Hane</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => onNavigate(program.startDate, program.id)}
                    className="w-full py-3 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg shadow-slate-900/10 active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Programa Git
                  </button>
                </div>
              </div>
            );
          })}

          {programs.length === 0 && (
            <div className="col-span-full py-16 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
              <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Kayıtlı Program Yok</h3>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-2">Henüz otomatik bir çalışma programı oluşturulmamış.</p>
            </div>
          )}
        </div>

        <Pagination 
          currentPage={currentPage}
          totalItems={autoPrograms.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </section>

      {/* ======================================================== */}
      {/* MANUEL PROGRAMLAR (Mini Cards) */}
      {/* ======================================================== */}
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-orange-500" />
            Manuel Atamalar
          </h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Takvim üzerinden elle yapılan günlük planlamalar</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {manualSchedulesByDate.map((sched) => {
            const completedCount = sched.assignments.filter(a => a.isCompleted).length;
            const totalCount = sched.assignments.length;
            const isFullyCompleted = completedCount === totalCount && totalCount > 0;

            return (
              <div 
                key={sched.date}
                onClick={() => onNavigate(sched.date)}
                className="group cursor-pointer bg-white rounded-2xl border border-slate-100 p-4 transition-all hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/5 active:scale-95"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isFullyCompleted ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                    <Calendar className="w-5 h-5" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors" />
                </div>
                
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    {new Date(sched.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {new Date(sched.date).toLocaleDateString('tr-TR', { weekday: 'long' })}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-600">{totalCount} Hane</span>
                  </div>
                  <div className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isFullyCompleted ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {isFullyCompleted ? 'BİTTİ' : `${completedCount}/${totalCount}`}
                  </div>
                </div>
              </div>
            );
          })}

          {manualSchedulesByDate.length === 0 && (
            <div className="col-span-full py-12 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Henüz manuel bir planlama yapılmamış.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
