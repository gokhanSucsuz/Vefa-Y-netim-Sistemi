import React, { useState, useRef } from 'react';
import { dbLocal } from '../db';
import { Staff } from '../types';
import { Plus, Trash2, Edit2, X, Check, UserPlus, Users, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  staff: Staff[];
}

export default function StaffList({ staff }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Staff>({
    name: '',
    surname: '',
    tcNo: '',
    phone: '',
    partnerId: undefined
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let newId: number;
      if (editingId) {
        await dbLocal.staff.update(editingId, formData);
        newId = editingId;
      } else {
        newId = await dbLocal.staff.add(formData) as number;
      }

      // Handle bidirectional partner link
      if (formData.partnerId) {
        const partner = staff.find(s => s.id === formData.partnerId);
        if (partner) {
          // Clear old partner's link if any
          if (partner.partnerId && partner.partnerId !== newId) {
            await dbLocal.staff.update(partner.partnerId, { partnerId: undefined });
          }
          // Set new link
          await dbLocal.staff.update(partner.id!, { partnerId: newId });
        }
      } else if (editingId) {
        // If partner was cleared, clear the other side too
        const oldStaff = staff.find(s => s.id === editingId);
        if (oldStaff?.partnerId) {
          await dbLocal.staff.update(oldStaff.partnerId, { partnerId: undefined });
        }
      }

      setEditingId(null);
      setIsAdding(false);
      setFormData({ name: '', surname: '', tcNo: '', phone: '', partnerId: undefined });
    } catch (error) {
      console.error("Error saving staff:", error);
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const newStaff: Staff[] = data.map(row => {
          // 1. Try separate columns first
          let name = (row['ad'] || row['Ad'] || row['AD'] || row['isim'] || row['İsim'] || '').toString().trim();
          let surname = (row['soyad'] || row['Soyad'] || row['SOYAD'] || '').toString().trim();

          // 2. If separate columns are empty, try combined column
          if (!name && !surname) {
            const fullName = (row['ad-soyad'] || row['Ad Soyad'] || row['AD SOYAD'] || row['isim-soyisim'] || row['İsim Soyisim'] || row['Personel'] || '').toString().trim();
            if (fullName) {
              const parts = fullName.split(/\s+/);
              if (parts.length > 1) {
                surname = parts.pop() || '';
                name = parts.join(' ');
              } else {
                name = fullName;
                surname = '';
              }
            }
          }

          return {
            name: name,
            surname: surname,
            tcNo: (row['tc'] || row['TC No'] || row['tc kimlik no'] || row['TC Kimlik'] || '').toString().replace(/\D/g, ''),
            phone: (row['telefon'] || row['Telefon'] || row['tel'] || '').toString(),
          };
        });

        if (newStaff.length > 0) {
          await dbLocal.staff.bulkAdd(newStaff);
          alert(`${newStaff.length} personel başarıyla yüklendi.`);
        }
      } catch (error) {
        console.error("Excel import error:", error);
        alert("Excel dosyası okunurken bir hata oluştu. Lütfen sütun başlıklarını kontrol edin.");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const handleEdit = (s: Staff) => {
    setFormData(s);
    setEditingId(s.id!);
    setIsAdding(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Bu personeli silmek istediğinize emin misiniz?')) {
      const s = staff.find(item => item.id === id);
      if (s?.partnerId) {
        await dbLocal.staff.update(s.partnerId, { partnerId: undefined });
      }
      await dbLocal.staff.delete(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Personel Listesi</h2>
          <p className="text-gray-500">Temizlik görevlilerini yönetin.</p>
        </div>
        <div className="flex gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleExcelImport}
            accept=".xlsx, .xls"
            className="hidden"
          />
          {!isAdding && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl hover:bg-green-100 transition-all font-semibold border border-green-200"
            >
              <FileSpreadsheet className="w-5 h-5" />
              Excel'den Yükle
            </button>
          )}
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              <UserPlus className="w-5 h-5" />
              Yeni Personel Ekle
            </button>
          )}
        </div>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Personel Düzenle' : 'Yeni Personel Kaydı'}
            </h3>
            <button onClick={() => { setIsAdding(false); setEditingId(null); setFormData({ name: '', surname: '', tcNo: '', phone: '', partnerId: undefined }); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Ad</label>
              <input
                required
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Soyad</label>
              <input
                required
                type="text"
                value={formData.surname}
                onChange={e => setFormData({ ...formData, surname: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">TC Kimlik No</label>
              <input
                required
                type="text"
                maxLength={11}
                value={formData.tcNo}
                onChange={e => setFormData({ ...formData, tcNo: e.target.value.replace(/\D/g, '') })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Telefon</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Ekip Arkadaşı (Opsiyonel)</label>
              <select
                value={formData.partnerId || ''}
                onChange={e => setFormData({ ...formData, partnerId: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="">Ekip Arkadaşı Yok</option>
                {staff
                  .filter(s => s.id !== editingId) // Don't show self
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.surname} {s.partnerId ? '(Zaten Ekibi Var)' : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setIsAdding(false); setEditingId(null); }}
                className="px-6 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingId ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Ad Soyad</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">TC Kimlik No</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Telefon</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Ekip Arkadaşı</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Henüz kayıtlı personel bulunmuyor.
                  </td>
                </tr>
              ) : (
                staff.map(s => {
                  const partner = staff.find(p => p.id === s.partnerId);
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-all group">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{s.name} {s.surname}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-mono text-sm">{s.tcNo}</td>
                      <td className="px-6 py-4 text-gray-600">{s.phone || '-'}</td>
                      <td className="px-6 py-4">
                        {partner ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <Users className="w-3 h-3" />
                            {partner.name} {partner.surname}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Bireysel</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => handleEdit(s)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id!)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
