import { useConfirmDialog } from '../hooks/useConfirmDialog';
import toast from 'react-hot-toast';
import { useState, useMemo } from 'react';
import { dbLocal } from '../db';
import { Staff, Schedule, StaffAssignment, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { format, parseISO, addDays, isWeekend } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cleanupOverloadedSchedules } from '../services/scheduleService';
import {
  Briefcase, Plus, Trash2, Edit2, X, Check, ChevronDown,
  AlertTriangle, Users, Calendar, Clock, RefreshCw
} from 'lucide-react';

interface Props {
  staff: Staff[];
  schedules: Schedule[];
  assignments: StaffAssignment[];
  currentUser: SystemUser;
}

const ASSIGNMENT_TYPES = [
  { value: 'vakif', label: 'Vakıf İşleri' },
  { value: 'hasta_bakim', label: 'Hasta Bakım' },
  { value: 'idari', label: 'İdari Görev' },
  { value: 'diger', label: 'Diğer' },
] as const;

const SHIFT_LABELS = {
  morning: 'Sabah',
  afternoon: 'Öğleden Sonra',
  full: 'Tam Gün',
};

interface ConflictInfo {
  hasConflict: boolean;
  scheduleId?: string;
  scheduleDate?: string;
  conflictShift?: 'morning' | 'afternoon' | 'full';
  partnerId?: string;
  partnerName?: string;
  backupStaff: Staff[];
}

export default function AssignmentManagement({ staff, schedules, assignments, currentUser }: Props) {
  const { confirm } = useConfirmDialog();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Partial<StaffAssignment>>({
    staffId: '',
    assignmentType: 'vakif',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    shift: 'full',
    backupStaffId: '',
  });

  // Conflict modal state
  const [conflictModal, setConflictModal] = useState<{
    conflict: ConflictInfo;
    pendingForm: Partial<StaffAssignment>;
  } | null>(null);

  const backupStaffList = useMemo(() => staff.filter(s => s.isBackup === true), [staff]);

  const checkConflict = (staffId: string, date: string, shift: string): ConflictInfo => {
    const daySchedule = schedules.find(s => s.date === date);
    const hasCleaningDuty = daySchedule?.assignments?.some(a => a.staffIds?.includes(staffId));
    
    const memberStaff = staff.find(s => s.id === staffId);
    const partner = memberStaff?.partnerId ? staff.find(s => s.id === memberStaff.partnerId) : undefined;

    return {
      hasConflict: !!hasCleaningDuty,
      scheduleId: daySchedule?.id,
      scheduleDate: date,
      conflictShift: shift as any,
      partnerId: partner?.id,
      partnerName: partner ? `${partner.name} ${partner.surname}` : undefined,
      backupStaff: backupStaffList,
    };
  };

  /**
   * Moves only the assignments of the given staff member's team for the selected shift
   * to the next available work day. Other teams are NOT affected.
   */
  const shiftCleaningToNextDay = async (
    scheduleId: string,
    scheduleDate: string,
    staffId: string,
    assignmentShift: 'morning' | 'afternoon' | 'full'
  ) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    // Collect this staff member's team IDs (self + partner)
    const member = staff.find(s => s.id === staffId);
    const teamIds = new Set<string>([staffId]);
    if (member?.partnerId) teamIds.add(member.partnerId);

    // Determine which schedule-level shifts to target
    // 'full' assignment → move everything that belongs to the team
    // 'morning' → move only team's morning-tagged assignments
    // 'afternoon' → move only team's afternoon-tagged assignments
    const shouldMove = (a: Schedule['assignments'][0]) => {
      if (a.isCompleted) return false;
      // Must involve at least one team member
      const involvesTeam = a.staffIds?.some(id => teamIds.has(id));
      if (!involvesTeam) return false;
      // Shift matching
      if (assignmentShift === 'full') return true;
      if (!a.shift) return true; // untagged → treat as full-day → always move
      return a.shift === assignmentShift;
    };

    // Find next work day
    let checkDate = addDays(parseISO(scheduleDate), 1);
    let safetyLimit = 30;
    let nextWorkDayStr = '';
    while (safetyLimit-- > 0) {
      const dateStr = format(checkDate, 'yyyy-MM-dd');
      const isWeekdayDay = !isWeekend(checkDate);
      if (isWeekdayDay) { nextWorkDayStr = dateStr; break; }
      checkDate = addDays(checkDate, 1);
    }

    if (!nextWorkDayStr) {
      toast.error('Sonraki iş günü bulunamadı.');
      return;
    }

    const toMove = schedule.assignments.filter(a => shouldMove(a));
    const toKeep = schedule.assignments.filter(a => !shouldMove(a));

    if (toMove.length === 0) {
      toast('Bu vardiyada taşınacak ekip görevi bulunamadı.', { icon: 'ℹ️' });
      return;
    }

    // Update current day: keep everything except the moved ones
    await dbLocal.schedules.update(scheduleId, { assignments: toKeep });

    // Add moved assignments to next work day
    const nextDaySched = schedules.find(s => s.date === nextWorkDayStr);
    if (nextDaySched) {
      await dbLocal.schedules.update(nextDaySched.id!, {
        assignments: [...nextDaySched.assignments, ...toMove],
      });
    } else {
      await dbLocal.schedules.add({
        date: nextWorkDayStr,
        programId: schedule.programId,
        assignments: toMove,
      });
    }

    const shiftLabel = assignmentShift === 'morning' ? 'sabah' : assignmentShift === 'afternoon' ? 'öğleden sonra' : 'tam gün';
    toast.success(
      `${member?.name} ${member?.surname} ekibinin ${shiftLabel} temizlik görevi ${format(parseISO(nextWorkDayStr), 'dd.MM.yyyy')} tarihine kaydırıldı.`
    );

    // After shifting, run cleanup to ensure no team exceeds the 2-task limit on the target day(s)
    await cleanupOverloadedSchedules();
  };

  const handleSubmit = async (opts?: { backupStaffId?: string; shiftCleaning?: boolean }) => {
    if (!formData.staffId || !formData.date) {
      toast.error('Personel ve tarih zorunludur.');
      return;
    }

    const selectedStaff = staff.find(s => s.id === formData.staffId);
    if (selectedStaff?.resignationDate && formData.date && formData.date >= selectedStaff.resignationDate) {
      toast.error(`Bu personel ${selectedStaff.resignationDate} tarihinde işten ayrılmıştır. Bu tarihe veya sonrasına görevlendirilemez.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const conflict = checkConflict(formData.staffId!, formData.date!, formData.shift!);

      if (conflict.hasConflict && !opts) {
        setConflictModal({ conflict, pendingForm: { ...formData } });
        setIsSubmitting(false);
        return;
      }

      const absentStaffId = formData.staffId!;
      const assignmentShift = (formData.shift || 'full') as 'morning' | 'afternoon' | 'full';

      // ── BACKUP SELECTED: replace absent member's id in cleaning assignments ──
      if (opts?.backupStaffId && conflict.scheduleId) {
        const schedule = schedules.find(s => s.id === conflict.scheduleId);
        if (schedule) {
          const updatedAssignments = schedule.assignments.map(a => {
            if (!a.staffIds?.includes(absentStaffId)) return a;
            // Shift filter: only replace in matching shift
            if (assignmentShift !== 'full' && a.shift && a.shift !== assignmentShift) return a;
            return {
              ...a,
              staffIds: a.staffIds.map(id => (id === absentStaffId ? opts.backupStaffId! : id)),
            };
          });
          await dbLocal.schedules.update(conflict.scheduleId, { assignments: updatedAssignments });
          toast.success(`Yedek personel temizlik görevine eklendi.`);
        }
      }

      // ── NO BACKUP: shift this team's cleaning + auto-assign partner to vakıf ──
      if (!opts?.backupStaffId && opts?.shiftCleaning && conflict.scheduleId) {
        await shiftCleaningToNextDay(
          conflict.scheduleId,
          conflict.scheduleDate!,
          absentStaffId,
          assignmentShift
        );

        // Auto-assign partner to vakıf işleri for the same date if not already assigned
        if (conflict.partnerId) {
          const partnerAlreadyAssigned = assignments.some(
            a => a.staffId === conflict.partnerId && a.date === formData.date
          );
          if (!partnerAlreadyAssigned) {
            const partnerAssignment: import('../types').StaffAssignment = {
              staffId: conflict.partnerId!,
              assignmentType: 'vakif',
              description: `${staff.find(s => s.id === absentStaffId)?.name} personelinin görevlendirmesi nedeniyle vakıf işleri.`,
              date: formData.date!,
              shift: assignmentShift,
              cleaningShifted: false,
              createdAt: new Date().toISOString(),
              createdBy: currentUser.id!,
            };
            await dbLocal.assignments.add(partnerAssignment);
            const partnerName = staff.find(s => s.id === conflict.partnerId);
            toast(`${partnerName?.name} ${partnerName?.surname} otomatik olarak vakıf işlerine atandı.`, { icon: 'ℹ️' });
          }
        }
      }

      const payload: import('../types').StaffAssignment = {
        staffId: absentStaffId,
        assignmentType: formData.assignmentType as any,
        description: formData.description,
        date: formData.date!,
        shift: assignmentShift,
        backupStaffId: opts?.backupStaffId || formData.backupStaffId || undefined,
        cleaningShifted: opts?.shiftCleaning || false,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.id!,
      };

      if (editingId) {
        await dbLocal.assignments.update(editingId, payload);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Görevlendirme Güncelleme', `${formData.date} tarihli görevlendirme güncellendi.`);
        toast.success('Görevlendirme güncellendi.');
      } else {
        await dbLocal.assignments.add(payload);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Görevlendirme', `${staff.find(s => s.id === absentStaffId)?.name} personeli ${formData.date} tarihine görevlendirildi.`);
        toast.success('Görevlendirme kaydedildi.');
      }

      setShowForm(false);
      setEditingId(null);
      setConflictModal(null);
      setFormData({ staffId: '', assignmentType: 'vakif', description: '', date: format(new Date(), 'yyyy-MM-dd'), shift: 'full', backupStaffId: '' });
    } catch (err) {
      console.error(err);
      toast.error('Kayıt sırasında hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Bu görevlendirmeyi silmek istediğinize emin misiniz?', type: "warning" }))) return;
    await dbLocal.assignments.delete(id);
    logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Görevlendirme Silme', 'Görevlendirme silindi.');
    toast.success('Görevlendirme silindi.');
  };

  const handleEdit = (a: StaffAssignment) => {
    setFormData({ ...a });
    setEditingId(a.id!);
    setShowForm(true);
  };

  const sortedAssignments = useMemo(() =>
    [...assignments].sort((a, b) => b.date.localeCompare(a.date)),
    [assignments]
  );

  const getStaffName = (id: string) => {
    const s = staff.find(x => x.id === id);
    return s ? `${s.name} ${s.surname}` : '-';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Görevlendirme Yönetimi</h2>
          <p className="text-slate-500 text-sm mt-1">Personeli vakıf dışı görevlere atayın ve çakışmaları yönetin.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-200 font-semibold text-sm"
          >
            <Plus className="w-4 h-4" />
            Yeni Görevlendirme
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-bold text-slate-900">{editingId ? 'Görevlendirme Düzenle' : 'Yeni Görevlendirme'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Personel */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Personel</label>
              <select
                value={formData.staffId}
                onChange={e => setFormData({ ...formData, staffId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              >
                <option value="">-- Personel Seçin --</option>
                 {staff.filter(s => {
                  if (s.isActive === false || s.isBackup) return false;
                  if (s.resignationDate && formData.date && formData.date >= s.resignationDate) return false;
                  return true;
                }).map(s => (
                  <option key={s.id} value={s.id}>{s.name} {s.surname}</option>
                ))}
              </select>
            </div>

            {/* Tarih */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tarih</label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              />
            </div>

            {/* Vardiya */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Vardiya</label>
              <div className="flex gap-2">
                {(['morning', 'afternoon', 'full'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFormData({ ...formData, shift: s })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      formData.shift === s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {SHIFT_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Görev Türü */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Görev Türü</label>
              <div className="relative">
                <select
                  value={formData.assignmentType}
                  onChange={e => setFormData({ ...formData, assignmentType: e.target.value as any })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium appearance-none"
                >
                  {ASSIGNMENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Açıklama */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Açıklama (Opsiyonel)</label>
              <input
                type="text"
                placeholder="Görev detayı..."
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>

            {/* Yedek Personel */}
            {backupStaffList.length > 0 && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Yedek Personel (Opsiyonel)</label>
                <select
                  value={formData.backupStaffId || ''}
                  onChange={e => setFormData({ ...formData, backupStaffId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                >
                  <option value="">Yedek Atanmayacak</option>
                  {backupStaffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} {s.surname}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
            >
              İptal
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editingId ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {conflictModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Temizlik Görevi Çakışması</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Bu personelin <strong>{conflictModal.conflict.scheduleDate && format(parseISO(conflictModal.conflict.scheduleDate), 'dd.MM.yyyy')}</strong> tarihinde temizlik görevi bulunuyor.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Option 1: Assign backup */}
              {conflictModal.conflict.backupStaff.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-slate-700 mb-2">Seçenek 1: Yedek Personel Ata</p>
                  <select
                    id="backup-select"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3 outline-none focus:ring-2 focus:ring-blue-500"
                    defaultValue=""
                  >
                    <option value="">-- Yedek seçin --</option>
                    {conflictModal.conflict.backupStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.surname}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const sel = (document.getElementById('backup-select') as HTMLSelectElement).value;
                      if (!sel) { toast.error('Yedek personel seçin.'); return; }
                      setFormData({ ...conflictModal.pendingForm });
                      setConflictModal(null);
                      handleSubmit({ backupStaffId: sel });
                    }}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                  >
                    Yedek Ata ve Görevlendir
                  </button>
                </div>
              )}

              {/* Option 2: Shift cleaning */}
              <div className="border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-bold text-slate-700 mb-1">
                  {conflictModal.conflict.backupStaff.length > 0 ? 'Seçenek 2: ' : 'Seçenek 1: '}
                  Ekibin Temizlik Görevini Kaydır
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  {(() => {
                    const shift = conflictModal.pendingForm.shift;
                    const shiftText = shift === 'morning' ? 'sabah' : shift === 'afternoon' ? 'öğleden sonra' : 'tüm gün';
                    const memberName = staff.find(s => s.id === conflictModal.pendingForm.staffId);
                    const teamLabel = memberName
                      ? `${memberName.name} ${memberName.surname}${conflictModal.conflict.partnerName ? ` & ${conflictModal.conflict.partnerName}` : ''}`
                      : 'Bu ekip';
                    return (
                      <>
                        <strong>{teamLabel}</strong> ekibinin <strong>{shiftText}</strong> temizlik görevi sonraki iş gününe taşınır.{' '}
                        Diğer ekiplerin görevleri bu günde aynen devam eder.
                      </>
                    );
                  })()}
                </p>
                <button
                  onClick={() => {
                    setFormData({ ...conflictModal.pendingForm });
                    setConflictModal(null);
                    handleSubmit({ shiftCleaning: true });
                  }}
                  className="w-full py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600"
                >
                  Ekibin Görevini Kaydır ve Görevlendir
                </button>
              </div>

              <button
                onClick={() => setConflictModal(null)}
                className="w-full py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignments List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-widest">Görevlendirmeler</h3>
        </div>

        {sortedAssignments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Briefcase className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium text-sm">Henüz görevlendirme eklenmemiş.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {sortedAssignments.map(a => (
              <div key={a.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors group">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm">{getStaffName(a.staffId)}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(parseISO(a.date), 'dd.MM.yyyy', { locale: tr })}
                    </span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      {SHIFT_LABELS[a.shift]}
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                      {ASSIGNMENT_TYPES.find(t => t.value === a.assignmentType)?.label}
                    </span>
                    {a.backupStaffId && (
                      <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Yedek: {getStaffName(a.backupStaffId)}
                      </span>
                    )}
                    {a.cleaningShifted && (
                      <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Temizlik Kaydırıldı
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="text-xs text-slate-400 mt-1 truncate">{a.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(a)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(a.id!)} className="p-2 text-rose-300 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
