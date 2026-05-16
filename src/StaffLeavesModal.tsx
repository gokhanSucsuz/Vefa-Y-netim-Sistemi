import toast from 'react-hot-toast';
import React, { useState } from 'react';
import { Staff, SystemUser } from '../types';
import { dbLocal } from '../db';
import { logAction } from '../services/auditService';
import { X, Plus, Trash2, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Props {
  staff: Staff;
  currentUser: SystemUser;
  onClose: () => void;
  onUpdated: () => void;
}

export default function StaffLeavesModal({ staff, currentUser, onClose, onUpdated }: Props) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const leaves = staff.leaves || [];

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    if (startDate > endDate) {
      toast.error('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
      return;
    }

    const newLeave = { 
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      startDate, 
      endDate, 
      type: 'annual' as const,
      reason 
    };
    const updatedLeaves = [...leaves, newLeave];

    try {
      await dbLocal.staff.update(staff.id!, { leaves: updatedLeaves });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'İzin Eklendi', `${staff.name} ${staff.surname} için izin eklendi: ${startDate} - ${endDate}`);
      setStartDate('');
      setEndDate('');
      setReason('');
      onUpdated();
    } catch (error) {
      console.error('İzin eklenirken hata oluştu:', error);
      toast.error('İzin eklenirken bir hata oluştu.');
    }
  };

  const handleDeleteLeave = async (index: number) => {
    if (!confirm('Bu izin kaydını silmek istediğinize emin misiniz?')) return;
    
    const updatedLeaves = [...leaves];
    const deleted = updatedLeaves.splice(index, 1)[0];
    
    try {
      await dbLocal.staff.update(staff.id!, { leaves: updatedLeaves });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'İzin Silindi', `${staff.name} ${staff.surname} personelinin ${deleted.startDate} tarihli izni silindi.`);
      onUpdated();
    } catch (error) {
      console.error('İzin silinirken hata:', error);
      toast.error('İzin silinirken bir hata oluştu.');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-orange-50/50">
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-gray-900">{staff.name} {staff.surname}</h3>
            <p className="text-sm text-gray-500">İzin Günleri Yönetimi</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={handleAddLeave} className="space-y-4 mb-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <h4 className="font-semibold text-gray-700 flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-orange-500" />
              Yeni İzin Ekle
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Başlangıç</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bitiş</label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama / Sebep (Opsiyonel)</label>
              <input
                type="text"
                placeholder="Yıllık izin, sağlık izni vb."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              İzin Kaydet
            </button>
          </form>

          <div className="space-y-3 max-h-[30vh] overflow-y-auto">
            <h4 className="font-semibold text-gray-700">Mevcut İzinler</h4>
            {leaves.length === 0 ? (
              <p className="text-sm text-gray-500 italic p-4 text-center bg-gray-50 rounded-xl">Kayıtlı izin bulunmuyor.</p>
            ) : (
              leaves.map((leave, index) => (
                <div key={index} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl bg-white shadow-sm">
                  <div>
                    <div className="font-medium text-sm text-gray-800">
                      {format(parseISO(leave.startDate), 'dd MMM yyyy', { locale: tr })} - {format(parseISO(leave.endDate), 'dd MMM yyyy', { locale: tr })}
                    </div>
                    {leave.reason && <div className="text-xs text-gray-500 mt-0.5">{leave.reason}</div>}
                  </div>
                  <button 
                    onClick={() => handleDeleteLeave(index)}
                    className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                    title="İzni Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
