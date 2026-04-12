import { useMemo } from 'react';
import { Program, Schedule, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { dbLocal } from '../db';
import { Calendar, Trash2, XCircle, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface ProgramManagementProps {
  programs: Program[];
  schedules: Schedule[];
  currentUser: SystemUser;
}

export default function ProgramManagement({ programs, schedules, currentUser }: ProgramManagementProps) {
  const sortedPrograms = useMemo(() => 
    [...programs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  [programs]);

  const handleDelete = async (id: string) => {
    const program = programs.find(p => p.id === id);
    if (!confirm('Bu programı ve buna bağlı tüm planlamaları silmek istediğinize emin misiniz?')) return;
    
    try {
      await dbLocal.transaction("rw", [dbLocal.programs, dbLocal.schedules], async () => {
        await dbLocal.programs.delete(id);
        const programSchedules = await dbLocal.schedules.where('programId').equals(id).toArray();
        for (const s of programSchedules) {
          await dbLocal.schedules.delete(s.id!);
        }
      });
      if (program) {
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Program Silme', `${program.name} silindi.`);
      }
    } catch (error) {
      console.error('Program deletion failed:', error);
      alert('Program silinemedi.');
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
      alert('Program iptal edilemedi.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Yapılan Programlar</h2>
        <p className="text-sm text-gray-500 font-medium">Sistemde oluşturulmuş tüm çalışma programları</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedPrograms.map((program) => {
          const programSchedules = schedules.filter(s => s.programId === program.id);
          const totalAssignments = programSchedules.reduce((acc, s) => acc + s.assignments.length, 0);
          const completedAssignments = programSchedules.reduce((acc, s) => 
            acc + s.assignments.filter(a => a.isCompleted).length, 0);
          const progress = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;

          return (
            <div 
              key={program.id} 
              className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${
                program.status === 'active' ? 'border-green-200 ring-1 ring-green-100' : 'border-red-100'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2 rounded-lg ${program.status === 'active' ? 'bg-green-50' : 'bg-red-50'}`}>
                  {program.status === 'active' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {program.status === 'active' && (
                    <button
                      onClick={() => handleCancel(program.id!)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="İptal Et"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(program.id!)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-gray-900 leading-tight">{program.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      program.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {program.status === 'active' ? 'Aktif Program' : 'İptal Edilmiş'}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">
                      {new Date(program.createdAt).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-50">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Başlangıç</span>
                    <span className="text-xs font-bold text-gray-700">{new Date(program.startDate).toLocaleDateString('tr-TR')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Bitiş</span>
                    <span className="text-xs font-bold text-gray-700">{new Date(program.endDate).toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                    <span className="text-gray-500">İlerleme</span>
                    <span className={program.status === 'active' ? 'text-green-700' : 'text-red-700'}>
                      %{Math.round(progress)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${program.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold">
                    <span>{completedAssignments} Tamamlanan</span>
                    <span>{totalAssignments} Toplam</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {programs.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Henüz bir program oluşturulmadı.</p>
          </div>
        )}
      </div>
    </div>
  );
}
