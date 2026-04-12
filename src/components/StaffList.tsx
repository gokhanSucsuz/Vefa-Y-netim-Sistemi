import React, { useState, useRef } from 'react';
import { dbLocal } from '../db';
import { Staff } from '../types';
import { Plus, Trash2, Edit2, X, Check, UserPlus, Users, FileSpreadsheet, Search, ArrowUpDown, ArrowUp, ArrowDown, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AnimatePresence } from 'motion/react';
import { maskTcNo, maskPhone } from '../lib/masking';
import StaffStatsModal from './StaffStatsModal';

interface Props {
  staff: Staff[];
}

export default function StaffList({ staff }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Staff>({
    name: '',
    surname: '',
    tcNo: '',
    phone: '',
    partnerId: undefined
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'tcNo'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedStatsStaff, setSelectedStatsStaff] = useState<Staff | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let newId: string;
      if (editingId) {
        await dbLocal.staff.update(editingId, formData);
        newId = editingId;
      } else {
        newId = await dbLocal.staff.add(formData);
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

  const handleDelete = async (id: string) => {
    if (confirm('Bu personeli silmek istediğinize emin misiniz?')) {
      const s = staff.find(item => item.id === id);
      if (s?.partnerId) {
        await dbLocal.staff.update(s.partnerId, { partnerId: undefined });
      }
      await dbLocal.staff.delete(id);
    }
  };

  const filteredAndSortedStaff = [...staff]
    .filter(s => {
      const search = searchTerm.toLowerCase();
      return (
        s.name.toLowerCase().includes(search) ||
        s.surname.toLowerCase().includes(search) ||
        s.tcNo.includes(search) ||
        (s.phone || '').includes(search)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = (a.name + a.surname).localeCompare(b.name + b.surname);
      } else if (sortBy === 'tcNo') {
        comparison = a.tcNo.localeCompare(b.tcNo);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Personel Listesi</h2>
          <p className="text-gray-500">Temizlik görevlilerini yönetin.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
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
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl hover:bg-green-100 transition-all font-semibold border border-green-200 text-sm"
            >
              <FileSpreadsheet className="w-5 h-5" />
              Excel'den Yükle
            </button>
          )}
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 text-sm"
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

      {/* Search and Sort Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Personel ara (Ad, Soyad, TC, Tel)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
            <ArrowUpDown className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600 font-medium">Sırala:</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-sm font-semibold text-gray-900 outline-none cursor-pointer"
            >
              <option value="name">Ad Soyad</option>
              <option value="tcNo">TC Kimlik No</option>
            </select>
            <button 
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="ml-2 p-1 hover:bg-gray-200 rounded transition-colors"
            >
              {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden w-full">
        <div className="overflow-x-auto scrollbar-hide w-full">
          <table className="w-full text-left border-collapse min-w-[800px] lg:min-w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">Ad Soyad</th>
                <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">TC Kimlik No</th>
                <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">Telefon</th>
                <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">Ekip Arkadaşı</th>
                <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 text-right uppercase tracking-wider">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredAndSortedStaff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-medium">
                    Arama kriterlerine uygun personel bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredAndSortedStaff.map(s => {
                  const partner = staff.find(p => p.id === s.partnerId);
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-all group">
                      <td className="px-4 lg:px-6 py-4">
                        <div className="font-bold text-gray-900 text-sm">{s.name} {s.surname}</div>
                        <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Vefa Personeli</div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 text-gray-600 font-mono text-xs font-bold">{maskTcNo(s.tcNo)}</td>
                      <td className="px-4 lg:px-6 py-4 text-gray-600 text-xs font-medium">{maskPhone(s.phone) || '-'}</td>
                      <td className="px-4 lg:px-6 py-4">
                        {partner ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wider">
                            <Users className="w-3 h-3" />
                            {partner.name} {partner.surname}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-gray-50 text-gray-400 px-2 py-1 rounded-lg border border-gray-100 uppercase tracking-wider">
                            Bireysel
                          </span>
                        )}
                      </td>
                      <td className="px-4 lg:px-6 py-4 text-right">
                        <div className="flex justify-end gap-1 lg:gap-2 opacity-100 transition-all">
                          <button
                            onClick={() => setSelectedStatsStaff(s)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Performans ve Rapor"
                          >
                            <BarChart3 className="w-4 h-4 lg:w-5 lg:h-5" />
                          </button>
                          <button
                            onClick={() => handleEdit(s)}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                            title="Düzenle"
                          >
                            <Edit2 className="w-4 h-4 lg:w-5 lg:h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id!)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4 lg:w-5 lg:h-5" />
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

      <AnimatePresence>
        {selectedStatsStaff && (
          <StaffStatsModal 
            staff={selectedStatsStaff} 
            onClose={() => setSelectedStatsStaff(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
