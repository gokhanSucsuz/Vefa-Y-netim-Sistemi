import toast from 'react-hot-toast';
import { useState, useMemo } from 'react';
import { dbLocal } from '../db';
import { Applicant, Staff, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { Users, Search, Building2, CheckCircle2, X, ArrowRight, Filter } from 'lucide-react';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'assigned' | 'unassigned'>('all');
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

  const filteredApplicants = useMemo(() => {
    return applicants
      .filter(a => {
        const term = searchTerm.toLowerCase();
        const matchSearch = !term ||
          a.name.toLowerCase().includes(term) ||
          a.surname.toLowerCase().includes(term) ||
          (a.neighborhood || '').toLowerCase().includes(term) ||
          (a.haneNo || '').toLowerCase().includes(term);

        const matchFilter =
          filterMode === 'all' ||
          (filterMode === 'assigned' && !!a.teamId) ||
          (filterMode === 'unassigned' && !a.teamId);

        return matchSearch && matchFilter;
      })
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }, [applicants, searchTerm, filterMode]);

  const assignTeam = async (applicantIds: string[], teamId: string | null) => {
    setIsSaving(true);
    try {
      await Promise.all(
        applicantIds.map(id => dbLocal.applicants.update(id, { teamId: teamId || undefined }))
      );
      const teamLabel = teamId ? teams.find(t => t.id === teamId)?.label : 'Kaldırıldı';
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Ekip-Hane Ataması',
        `${applicantIds.length} hane için ekip ataması: ${teamLabel}`);
      toast.success(`${applicantIds.length} hane güncellendi.`);
    } catch (err) {
      console.error(err);
      toast.error('Güncelleme sırasında hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  const getTeamForApplicant = (teamId?: string) =>
    teamId ? teams.find(t => t.id === teamId) : undefined;

  const teamCounts = useMemo(() => {
    const map = new Map<string, number>();
    applicants.forEach(a => {
      if (a.teamId) map.set(a.teamId, (map.get(a.teamId) || 0) + 1);
    });
    return map;
  }, [applicants]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Ekip-Hane Ataması</h2>
        <p className="text-slate-500 text-sm mt-1">Haneleri temizlik ekiplerine atayın ve atamaları yönetin.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol: Ekipler */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-widest">Ekipler</h3>
            </div>
            <div className="divide-y divide-slate-50">
              <button
                onClick={() => setSelectedTeamId(null)}
                className={`w-full px-5 py-3.5 text-left flex items-center gap-3 transition-colors ${
                  selectedTeamId === null ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedTeamId === null ? 'bg-white/20' : 'bg-slate-100'}`}>
                  <Users className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm">Tüm Haneler</div>
                  <div className={`text-xs ${selectedTeamId === null ? 'text-white/70' : 'text-slate-400'}`}>
                    {applicants.length} hane
                  </div>
                </div>
              </button>

              {teams.map(team => {
                const count = teamCounts.get(team.id) || 0;
                const isSelected = selectedTeamId === team.id;
                return (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`w-full px-5 py-3.5 text-left flex items-center gap-3 transition-colors ${
                      isSelected ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white/20' : 'bg-blue-50'}`}>
                      <Users className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-blue-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{team.label}</div>
                      <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                        {count} hane atanmış
                      </div>
                    </div>
                    {count > 0 && (
                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}

              {teams.length === 0 && (
                <div className="px-5 py-8 text-center text-slate-400 text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  Ekip bulunamadı.<br />Personel sayfasından ekip kurun.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sağ: Haneler */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Hane ara (ad, mahalle, hane no)..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {(['all', 'assigned', 'unassigned'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {mode === 'all' ? 'Tümü' : mode === 'assigned' ? 'Atanmış' : 'Atanmamış'}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk assign button */}
          {selectedTeamId && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-blue-700 font-medium">
                Seçili ekip: <strong>{teams.find(t => t.id === selectedTeamId)?.label}</strong>
              </span>
              <button
                onClick={() => {
                  const unassigned = filteredApplicants.filter(a => !a.teamId).map(a => a.id!);
                  if (unassigned.length === 0) { toast.error('Atanmamış hane yok.'); return; }
                  if (!confirm(`${unassigned.length} atanmamış haneyi bu ekibe atamak istediğinize emin misiniz?`)) return;
                  assignTeam(unassigned, selectedTeamId);
                }}
                className="text-xs font-bold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
              >
                <ArrowRight className="w-3 h-3" />
                Tümünü Ata
              </button>
            </div>
          )}

          {/* Applicants Grid */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {filteredApplicants.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium text-sm">Hane bulunamadı.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredApplicants.map(applicant => {
                  const currentTeam = getTeamForApplicant(applicant.teamId);
                  const isCurrentTeamSelected = applicant.teamId === selectedTeamId;

                  return (
                    <div
                      key={applicant.id}
                      className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/50 transition-colors group"
                    >
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 text-slate-500 font-bold text-xs">
                        {applicant.priority || '-'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm">
                          {applicant.name} {applicant.surname}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {applicant.neighborhood} {applicant.haneNo ? `· ${applicant.haneNo}` : ''}
                        </div>
                      </div>

                      {/* Current team badge */}
                      <div className="flex items-center gap-2">
                        {currentTeam ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg border uppercase tracking-wider flex items-center gap-1 ${
                              isCurrentTeamSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-blue-50 text-blue-700 border-blue-100'
                            }`}>
                              <CheckCircle2 className="w-3 h-3" />
                              {currentTeam.label.split(' & ')[0]}
                            </span>
                            <button
                              onClick={() => assignTeam([applicant.id!], null)}
                              className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Ekibi Kaldır"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg uppercase tracking-wider">
                            Atanmamış
                          </span>
                        )}

                        {/* Assign button */}
                        {selectedTeamId && applicant.teamId !== selectedTeamId && (
                          <button
                            onClick={() => assignTeam([applicant.id!], selectedTeamId)}
                            disabled={isSaving}
                            className="text-[10px] font-black bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-1 disabled:opacity-50"
                          >
                            <ArrowRight className="w-3 h-3" />
                            Ata
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 text-right">
            {filteredApplicants.length} hane gösteriliyor
          </p>
        </div>
      </div>
    </div>
  );
}
