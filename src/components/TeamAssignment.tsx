import { useConfirmDialog } from '../hooks/useConfirmDialog';
import toast from 'react-hot-toast';
import { useState, useMemo } from 'react';
import { dbLocal } from '../db';
import { Applicant, Staff, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { Users, Search, Building2, UserMinus, Plus, Trash2 } from 'lucide-react';

interface Props {
  applicants: Applicant[];
  staff: Staff[];
  currentUser: SystemUser;
}

interface Team {
  id: string; // derived key: sorted staffIds joined by '_'
  members: Staff[];
  label: string;
}

export default function TeamAssignment({ applicants, staff, currentUser }: Props) {
  const { confirm } = useConfirmDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Build teams from staff partner pairs
  const teams = useMemo((): Team[] => {
    const seen = new Set<string>();
    const result: Team[] = [];
    staff.filter(s => s.isActive !== false && !s.isBackup).forEach(s => {
      if (seen.has(s.id!)) return;
      const partner = s.partnerId ? staff.find(p => p.id === s.partnerId) : undefined;
      const members = partner ? [s, partner] : [s];
      const id = members.map(m => m.id!).sort().join('_');
      if (!seen.has(id)) {
        result.push({ id, members, label: members.map(m => `${m.name} ${m.surname}`).join(' & ') });
        members.forEach(m => seen.add(m.id!));
      }
    });
    return result;
  }, [staff]);

  const activeApplicants = applicants.filter(a => !a.isDeleted);

  // Separate applicants into unassigned and team-assigned
  const unassignedApplicants = activeApplicants.filter(a => !a.teamId).filter(a => {
    const term = searchTerm.toLowerCase();
    return !term || 
      a.name.toLowerCase().includes(term) ||
      a.surname.toLowerCase().includes(term) ||
      (a.neighborhood || '').toLowerCase().includes(term);
  }).sort((a, b) => (a.priority || 0) - (b.priority || 0));

  const teamAssignments = useMemo(() => {
    const map = new Map<string, typeof activeApplicants>();
    activeApplicants.forEach(a => {
      if (a.teamId) {
        if (!map.has(a.teamId)) map.set(a.teamId, []);
        map.get(a.teamId)!.push(a);
      }
    });
    return map;
  }, [activeApplicants]);

  const assignTeam = async (applicantIds: string[], teamId: string | null) => {
    setIsSaving(true);
    try {
      await Promise.all(
        applicantIds.map(async id => {
          await dbLocal.applicants.update(id, { teamId: teamId || '' });

          // Update future uncompleted schedules for this applicant to reflect the new team
          const today = new Date().toISOString().split('T')[0];
          const futureSchedules = await dbLocal.schedules.where('date').aboveOrEqual(today).toArray();
          
          const team = teamId ? teams.find(t => t.id === teamId) : undefined;
          const newStaffIds = team ? team.members.map(m => m.id!) : [];

          for (const schedule of futureSchedules) {
            let changed = false;
            const newAssignments = schedule.assignments.map(a => {
              // we must use weak equal since id might be number or string
              if (String(a.applicantId) === String(id) && !a.isCompleted) {
                changed = true;
                return { ...a, staffIds: newStaffIds };
              }
              return a;
            });
            if (changed) {
              await dbLocal.schedules.update(schedule.id!, { assignments: newAssignments });
            }
          }
        })
      );
      
      const teamLabel = teamId ? teams.find(t => t.id === teamId)?.label : 'Kaldırıldı';
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Ekip-Hane Ataması',
        `${applicantIds.length} hane için ekip ataması: ${teamLabel}`);
      toast.success(`${applicantIds.length} hane ${teamId ? 'ekibe atandı' : 'ekipten çıkarıldı'}.`);
    } catch (err) {
      console.error(err);
      toast.error('Güncelleme sırasında hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Ekip-Hane Ataması</h2>
        <p className="text-slate-500 text-sm mt-1">Haneleri temizlik ekiplerine atayın. Ekip bazlı listeleri buradan görüntüleyebilirsiniz.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Teams */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {teams.length === 0 && (
              <div className="md:col-span-2 py-16 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-900">Ekip Bulunamadı</h3>
                <p className="text-slate-500 text-sm mt-1">Lütfen personel sayfasından personelleri eşleştirerek ekipler oluşturun.</p>
              </div>
            )}
            
            {teams.map(team => {
              const assigned = teamAssignments.get(team.id) || [];
              assigned.sort((a, b) => (a.priority || 0) - (b.priority || 0));

              return (
                <div key={team.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                  <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm leading-tight">{team.label}</h3>
                        <span className="text-xs text-slate-500 font-medium">{assigned.length} hane atanmış</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 p-4 bg-slate-50/30">
                    {assigned.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center py-6">
                        <p className="text-slate-400 text-sm font-medium">Bu ekibe henüz hane atanmamış.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {assigned.map(applicant => (
                          <div key={applicant.id} className="bg-white border border-slate-100 p-3 rounded-xl flex items-center gap-3 group hover:border-blue-200 transition-colors shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0">
                              {applicant.priority || '-'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-900 text-sm truncate">{applicant.name} {applicant.surname}</div>
                              <div className="text-xs text-slate-400 truncate">{applicant.neighborhood}</div>
                            </div>
                            <button
                              disabled={isSaving}
                              onClick={() => assignTeam([applicant.id!], null)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                              title="Ekipten Çıkar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Unassigned Applicants */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col mt-6 lg:mt-0 max-h-[800px]">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-amber-500" />
              Atanmamış Haneler 
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs font-black">{unassignedApplicants.length}</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1">Bir ekibe atanmayı bekleyen haneler.</p>
            
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Arama yapın..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {unassignedApplicants.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium text-sm">Tüm haneler atanmış durumda veya sonuç bulunamadı.</p>
              </div>
            ) : (
              unassignedApplicants.map(applicant => (
                <div key={applicant.id} className="border border-slate-100 p-3 rounded-xl hover:shadow-md transition-all group bg-slate-50">
                  <div className="flex gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 font-black text-xs flex items-center justify-center shrink-0">
                      {applicant.priority || '-'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate">{applicant.name} {applicant.surname}</div>
                      <div className="text-xs text-slate-500 truncate">{applicant.neighborhood}</div>
                    </div>
                  </div>
                  
                  {teams.length > 0 && (
                    <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white mt-1">
                      <select 
                        className="flex-1 bg-transparent text-xs px-2 py-1.5 outline-none font-medium cursor-pointer"
                        onChange={(e) => {
                          if (e.target.value) {
                            assignTeam([applicant.id!], e.target.value);
                            e.target.value = ""; // reset
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Hemen Ata...</option>
                        {teams.map(team => (
                          <option key={team.id} value={team.id}>{team.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
