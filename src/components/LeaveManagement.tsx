import React, { useState, useMemo } from 'react';
import { Staff } from '../types';
import { dbLocal } from '../db';
import { format, parseISO, isAfter, isBefore, startOfDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Calendar, UserPlus, Clock, FileText, CheckCircle, Search, Edit2, Trash2, Plus, X } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { logAction } from '../services/auditService';

interface LeaveManagementProps {
  staffList: Staff[];
  onStaffUpdate: () => void;
}

export default function LeaveManagement({ staffList, onStaffUpdate }: LeaveManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingLeave, setEditingLeave] = useState<{ staffId: string; leaveId: string } | null>(null);
  
  const [formData, setFormData] = useState({
    staffId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    type: 'annual' as const,
    reason: '',
    backupStaffId: ''
  });

  const currentUser = useAuthStore(state => state.user);

  const leaveTypes = {
    annual: { label: 'Yıllık İzin', color: 'bg-blue-100 text-blue-800' },
    sick: { label: 'Sağlık Raporu', color: 'bg-red-100 text-red-800' },
    half_morning: { label: 'Yarım Gün (Sabah)', color: 'bg-orange-100 text-orange-800' },
    half_afternoon: { label: 'Yarım Gün (Öğleden Sonra)', color: 'bg-yellow-100 text-yellow-800' },
    unpaid: { label: 'Ücretsiz İzin', color: 'bg-slate-100 text-slate-800' },
    other: { label: 'Diğer / Mazeret', color: 'bg-purple-100 text-purple-800' }
  };

  const allLeaves = useMemo(() => {
    const leaves: any[] = [];
    staffList.forEach(staff => {
      if (staff.leaves) {
        staff.leaves.forEach(leave => {
          leaves.push({
            ...leave,
            staffId: staff.id,
            staffName: `${staff.name} ${staff.surname}`,
            isActive: !isBefore(parseISO(leave.endDate), startOfDay(new Date()))
          });
        });
      }
    });
    return leaves.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [staffList]);

  const filteredLeaves = allLeaves.filter(leave => 
    leave.staffName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (leave.reason && leave.reason.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenModal = (leave?: any) => {
    if (leave) {
      setEditingLeave({ staffId: leave.staffId, leaveId: leave.id });
      setFormData({
        staffId: leave.staffId,
        startDate: leave.startDate,
        endDate: leave.endDate,
        type: leave.type,
        reason: leave.reason || '',
        backupStaffId: leave.backupStaffId || ''
      });
    } else {
      setEditingLeave(null);
      setFormData({
        staffId: staffList[0]?.id || '',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd'),
        type: 'annual',
        reason: '',
        backupStaffId: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.staffId) return;

    try {
      const staff = staffList.find(s => s.id === formData.staffId);
      if (!staff) return;

      const currentLeaves = staff.leaves || [];
      let updatedLeaves = [...currentLeaves];

      if (editingLeave) {
        updatedLeaves = updatedLeaves.map(l => 
          l.id === editingLeave.leaveId 
            ? { ...l, ...formData, id: l.id } 
            : l
        );
      } else {
        updatedLeaves.push({
          id: Date.now().toString(),
          startDate: formData.startDate,
          endDate: formData.endDate,
          type: formData.type as any,
          reason: formData.reason,
          backupStaffId: formData.backupStaffId || undefined
        });
      }

      await dbLocal.staff.update(staff.id!, { leaves: updatedLeaves });
      
      logAction(
        currentUser?.id || 'system',
        currentUser ? `${currentUser.name} ${currentUser.surname}` : 'System',
        editingLeave ? 'İzin Güncelleme' : 'Yeni İzin Ekleme',
        `${staff.name} ${staff.surname} personeli için ${formData.startDate} - ${formData.endDate} arası ${leaveTypes[formData.type as keyof typeof leaveTypes].label} kaydedildi.`
      );

      setIsModalOpen(false);
      onStaffUpdate();
    } catch (error) {
      console.error('Error saving leave:', error);
      alert('İzin kaydedilirken bir hata oluştu.');
    }
  };

  const handleDelete = async (staffId: string, leaveId: string) => {
    if (!window.confirm('Bu izin kaydını silmek istediğinize emin misiniz?')) return;

    try {
      const staff = staffList.find(s => s.id === staffId);
      if (!staff) return;

      const updatedLeaves = (staff.leaves || []).filter(l => l.id !== leaveId);
      await dbLocal.staff.update(staff.id!, { leaves: updatedLeaves });
      
      logAction(
        currentUser?.id || 'system',
        currentUser ? `${currentUser.name} ${currentUser.surname}` : 'System',
        'İzin Silme',
        `${staff.name} ${staff.surname} personelinin bir izin kaydı silindi.`
      );

      onStaffUpdate();
    } catch (error) {
      console.error('Error deleting leave:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-slate-900">İzin ve Mazeret Yönetimi</h2>
          <p className="text-sm text-slate-500 mt-1">Personellerin izin durumlarını ve devamsızlıklarını takip edin.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Yeni İzin Ekle
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="relative w-full max-w-md">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Personel adı veya mazeret ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50/30">
                <th className="px-6 py-4">Personel</th>
                <th className="px-6 py-4">İzin Tipi</th>
                <th className="px-6 py-4">Tarih Aralığı</th>
                <th className="px-6 py-4">Açıklama</th>
                <th className="px-6 py-4">Durum</th>
                <th className="px-6 py-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeaves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Kayıtlı izin bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredLeaves.map(leave => (
                  <tr key={`${leave.staffId}-${leave.id}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{leave.staffName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${leaveTypes[leave.type as keyof typeof leaveTypes]?.color || leaveTypes.other.color}`}>
                        {leaveTypes[leave.type as keyof typeof leaveTypes]?.label || 'Bilinmeyen'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {format(parseISO(leave.startDate), 'dd MMM yyyy', { locale: tr })}
                        {leave.startDate !== leave.endDate && (
                          <>
                            <span className="text-slate-300">-</span>
                            {format(parseISO(leave.endDate), 'dd MMM yyyy', { locale: tr })}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600 truncate max-w-[200px]" title={leave.reason}>
                        {leave.reason || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {leave.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                          <Clock className="w-3.5 h-3.5" /> Devam Ediyor / Gelecek
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                          <CheckCircle className="w-3.5 h-3.5" /> Tamamlandı
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleOpenModal(leave)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(leave.staffId, leave.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">
                {editingLeave ? 'İzin Düzenle' : 'Yeni İzin Ekle'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              {!editingLeave && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Personel</label>
                  <select 
                    value={formData.staffId}
                    onChange={(e) => setFormData({...formData, staffId: e.target.value})}
                    className="w-full border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Personel Seçin</option>
                    {staffList.filter(s => s.isActive).map(staff => (
                      <option key={staff.id} value={staff.id}>{staff.name} {staff.surname}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">İzin Tipi</label>
                <select 
                  value={formData.type}
                  onChange={(e) => {
                    const newType = e.target.value as any;
                    const isHalfDay = newType === 'half_morning' || newType === 'half_afternoon';
                    setFormData({
                      ...formData, 
                      type: newType,
                      endDate: isHalfDay ? formData.startDate : Math.max(new Date(formData.startDate).getTime(), new Date(formData.endDate).getTime()) === new Date(formData.startDate).getTime() ? formData.startDate : formData.endDate
                    });
                  }}
                  className="w-full border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  {Object.entries(leaveTypes).map(([key, {label}]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div className={`grid ${['half_morning', 'half_afternoon'].includes(formData.type) ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {['half_morning', 'half_afternoon'].includes(formData.type) ? 'İzin Tarihi' : 'Başlangıç Tarihi'}
                  </label>
                  <input 
                    type="date" 
                    value={formData.startDate}
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      const isHalfDay = formData.type === 'half_morning' || formData.type === 'half_afternoon';
                      let newEndDate = formData.endDate;
                      if (isHalfDay || newEndDate < newStartDate) {
                        newEndDate = newStartDate;
                      }
                      setFormData({ ...formData, startDate: newStartDate, endDate: newEndDate });
                    }}
                    className="w-full border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                {!['half_morning', 'half_afternoon'].includes(formData.type) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Bitiş Tarihi</label>
                    <input 
                      type="date" 
                      value={formData.endDate}
                      onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                      className="w-full border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 text-sm"
                      min={formData.startDate}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Yerine Geçecek Personel (Opsiyonel)</label>
                <select 
                  value={formData.backupStaffId}
                  onChange={(e) => setFormData({...formData, backupStaffId: e.target.value})}
                  className="w-full border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">Seçilmedi (Boş Bırakılacak)</option>
                  {staffList.filter(s => s.isActive && s.id !== formData.staffId && !s.partnerId).map(s => (
                    <option key={s.id} value={s.id}>{s.name} {s.surname} (Ekibi Yok)</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Sadece aktif bir ekibi olmayan personeller yedek olarak seçilebilir.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Açıklama / Mazeret</label>
                <textarea 
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  className="w-full border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 text-sm"
                  rows={3}
                  placeholder="İzin veya rapor ile ilgili ek açıklamalar..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
              >
                İptal
              </button>
              <button 
                onClick={handleSave}
                disabled={!formData.staffId}
                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
