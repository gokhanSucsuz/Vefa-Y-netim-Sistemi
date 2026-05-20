import { useConfirmDialog } from '../hooks/useConfirmDialog';
import toast from 'react-hot-toast';
import React, { useState, useRef, useMemo } from 'react';
import { dbLocal } from '../db';
import { Staff, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { Plus, Trash2, Edit2, X, Check, UserPlus, Users, FileSpreadsheet, Search, ArrowUpDown, ArrowUp, ArrowDown, BarChart3, Eye, EyeOff, CalendarRange } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AnimatePresence } from 'motion/react';
import { formatPhone } from '../lib/format';
import { format } from 'date-fns';
import StaffStatsModal from './StaffStatsModal';
import Pagination from './Pagination';

interface Props {
  staff: Staff[];
  currentUser: SystemUser;
}

export default function StaffList({ staff, currentUser }: Props) {
  const { confirm } = useConfirmDialog();
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Staff>({
    name: '',
    surname: '',
    tcNo: '',
    phone: '',
    googleEmail: '',
    isApproved: false,
    partnerId: undefined,
    isActive: true,
    dutyLocation: '',
    resignationDate: undefined,
    resignationReason: ''
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'tcNo'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;
  const [selectedStatsStaff, setSelectedStatsStaff] = useState<Staff | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Clean undefined fields
      const dataToSave = { ...formData };
      
      // If passive or resigned, they cannot have an active partner
      if (dataToSave.isActive === false || dataToSave.resignationDate) {
        dataToSave.partnerId = undefined;
      }

      if (dataToSave.partnerId === undefined) {
        delete dataToSave.partnerId;
      }

      let newId: string;
      if (editingId) {
        await dbLocal.staff.update(editingId, dataToSave);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Personel Güncelleme', `${formData.name} ${formData.surname} personeli güncellendi.`);
        newId = editingId;
      } else {
        newId = await dbLocal.staff.add(dataToSave);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Personel Ekleme', `${formData.name} ${formData.surname} personeli eklendi.`);
      }

      // Handle bidirectional partner link
      if (formData.partnerId && formData.isActive !== false && !formData.resignationDate) {
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
        // If partner was cleared, or staff is made passive/resigned, clear the other side too
        const oldStaff = staff.find(s => s.id === editingId);
        if (oldStaff?.partnerId) {
          await dbLocal.staff.update(oldStaff.partnerId, { partnerId: undefined });
        }
      }

      setEditingId(null);
      setIsAdding(false);
      setFormData({ 
        name: '', 
        surname: '', 
        tcNo: '', 
        phone: '', 
        googleEmail: '', 
        isApproved: false, 
        partnerId: undefined,
        isActive: true,
        isBackup: false,
        dutyLocation: '',
        resignationDate: undefined,
        resignationReason: ''
      });
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
          logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Excel İçe Aktarma (Personel)', `${newStaff.length} personel Excel'den yüklendi.`);
          toast.success(`${newStaff.length} personel başarıyla yüklendi.`);
        }
      } catch (error) {
        console.error("Excel import error:", error);
        toast.error("Excel dosyası okunurken bir hata oluştu. Lütfen sütun başlıklarını kontrol edin.");
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
    const s = staff.find(item => item.id === id);
    if ((await confirm({ message: 'Bu personeli silmek istediğinize emin misiniz?', type: "warning" }))) {
      if (s?.partnerId) {
        await dbLocal.staff.update(s.partnerId, { partnerId: undefined });
      }
      await dbLocal.staff.delete(id);
      if (s) {
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Personel Silme', `${s.name} ${s.surname} personeli silindi.`);
      }
    }
  };

  const filteredAndSortedStaff = useMemo(() => {
    return [...staff]
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
        // Resigned staff should always be at the bottom of the list
        const aResigned = !!a.resignationDate;
        const bResigned = !!b.resignationDate;
        if (aResigned && !bResigned) return 1;
        if (!aResigned && bResigned) return -1;

        let comparison = 0;
        if (sortBy === 'name') {
          comparison = (a.name + a.surname).localeCompare(b.name + b.surname);
        } else if (sortBy === 'tcNo') {
          comparison = a.tcNo.localeCompare(b.tcNo);
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [staff, searchTerm, sortBy, sortOrder]);

  const paginatedStaff = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedStaff.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedStaff, currentPage]);

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
           id="field-wwm2esz" />
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
              onClick={() => {
                setFormData({ 
                  name: '', 
                  surname: '', 
                  tcNo: '', 
                  phone: '', 
                  googleEmail: '', 
                  isApproved: false, 
                  partnerId: undefined, 
                  isActive: true, 
                  isBackup: false, 
                  dutyLocation: '',
                  resignationDate: undefined,
                  resignationReason: ''
                });
                setEditingId(null);
                setIsAdding(true);
              }}
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
            <button onClick={() => { setIsAdding(false); setEditingId(null); setFormData({ name: '', surname: '', tcNo: '', phone: '', googleEmail: '', isApproved: false, partnerId: undefined, isActive: true, isBackup: false, dutyLocation: '', resignationDate: undefined, resignationReason: '' }); }} className="text-gray-400 hover:text-gray-600">
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
              <label className="text-sm font-medium text-gray-700">Durum</label>
              <select
                value={formData.resignationDate ? 'resigned' : (formData.isActive !== false ? (formData.isBackup ? 'backup' : 'active') : 'passive')}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'resigned') {
                    setFormData({ 
                      ...formData, 
                      isActive: false, 
                      isBackup: false, 
                      resignationDate: formData.resignationDate || new Date().toISOString().split('T')[0],
                      dutyLocation: '',
                      partnerId: undefined
                    });
                  } else if (val === 'passive') {
                    setFormData({ ...formData, isActive: false, isBackup: false, resignationDate: undefined, resignationReason: undefined });
                  } else if (val === 'backup') {
                    setFormData({ ...formData, isActive: true, isBackup: true, resignationDate: undefined, resignationReason: undefined });
                  } else {
                    setFormData({ ...formData, isActive: true, isBackup: false, resignationDate: undefined, resignationReason: undefined });
                  }
                }}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="active">Aktif (Sahada / Ekip)</option>
                <option value="backup">Yedek (Görev Atanmamış)</option>
                <option value="passive">Pasif (Farklı Görevde)</option>
                <option value="resigned">İşten Ayrıldı (Pasif)</option>
              </select>
            </div>
            {formData.isActive === false && !formData.resignationDate && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Görev Yeri</label>
                <input
                  type="text"
                  required
                  placeholder="Şu an bulunduğu görev"
                  value={formData.dutyLocation || ''}
                  onChange={e => setFormData({ ...formData, dutyLocation: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
            )}
            {formData.resignationDate !== undefined && formData.resignationDate !== null && (
              <>
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="text-sm font-medium text-gray-700">İşten Ayrılış Tarihi</label>
                  <input
                    type="date"
                    required
                    value={formData.resignationDate}
                    onChange={e => setFormData({ ...formData, resignationDate: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="text-sm font-medium text-gray-700">Ayrılma Sebebi</label>
                  <input
                    type="text"
                    placeholder="Örn: Kendi isteğiyle, Emeklilik vb."
                    value={formData.resignationReason || ''}
                    onChange={e => setFormData({ ...formData, resignationReason: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Ekip Arkadaşı (Opsiyonel)</label>
              <select
                value={formData.partnerId || ''}
                onChange={e => setFormData({ ...formData, partnerId: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="">Ekip Arkadaşı Yok</option>
                {staff
                  .filter(s => s.id !== editingId && !s.resignationDate && s.isActive !== false) // Don't show self, resigned, or passive staff
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.surname} {s.partnerId ? '(Zaten Ekibi Var)' : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Google E-posta (Gmail)</label>
              <input
                required
                type="email"
                placeholder="Örn: ad.soyad@gmail.com"
                value={formData.googleEmail || ''}
                onChange={e => setFormData({ ...formData, googleEmail: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Panel Erişimi (Yönetici Onayı)</label>
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-xl border border-gray-200 h-[42px]">
                <input
                  type="checkbox"
                  id="isApproved"
                  checked={formData.isApproved || false}
                  onChange={e => setFormData({ ...formData, isApproved: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="isApproved" className="text-sm font-semibold text-gray-900 cursor-pointer">
                  {formData.isApproved ? 'Saha Paneline Erişebilir' : 'Erişim Yok (Onay Bekliyor)'}
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-4">
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

      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Personel Bilgileri</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-44">T.C. Kimlik No</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-40">Telefon</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-48">Ekip Arkadaşı</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Erişim Onayı</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-48 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredAndSortedStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                paginatedStaff.map(s => {
                  const partner = staff.find(p => p.id === s.partnerId);
                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                  const activeLeave = partner?.leaves?.find(l => l.startDate <= todayStr && l.endDate >= todayStr);
                  const backupStaff = activeLeave?.backupStaffId ? staff.find(b => b.id === activeLeave.backupStaffId) : null;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-all group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-50 text-institution-blue rounded-xl flex items-center justify-center shrink-0 border border-blue-100">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{s.name} {s.surname}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                                Vefa Saha Personeli
                              </span>
                              {s.resignationDate ? (
                                <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-rose-100 cursor-help" title={s.resignationReason ? `Ayrılma Sebebi: ${s.resignationReason}` : 'Ayrılma sebebi belirtilmemiş'}>
                                  İşten Ayrıldı - {s.resignationDate}
                                </span>
                              ) : s.isActive === false ? (
                                <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-amber-100">
                                  Pasif - {s.dutyLocation}
                                </span>
                              ) : s.isBackup ? (
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-blue-100">
                                  Yedek
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-mono text-xs font-bold bg-white/50">
                        <span className="bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          {s.tcNo}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-[10px] font-bold uppercase tracking-tighter">
                        {formatPhone(s.phone)}
                      </td>
                      <td className="px-6 py-4">
                        {partner ? (
                          activeLeave ? (
                            backupStaff ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black bg-amber-50 text-amber-600 px-3 py-1 rounded-xl border border-amber-200 uppercase tracking-widest w-fit">
                                  PARTNER İZİNLİ
                                </span>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black bg-blue-50 text-blue-600 border border-blue-200 uppercase tracking-widest w-fit shadow-sm">
                                  <Users className="w-3 h-3" />
                                  YEDEK: {backupStaff.name} {backupStaff.surname}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] font-black bg-amber-50 text-amber-600 px-3 py-1.5 rounded-xl border border-amber-200 uppercase tracking-widest w-fit">
                                EKİP ARKADAŞI İZİNLİ
                              </span>
                            )
                          ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black bg-blue-50 text-institution-blue border border-blue-100 uppercase tracking-widest w-fit shadow-sm">
                              <Users className="w-3 h-3" />
                              {partner.name} {partner.surname}
                            </div>
                          )
                        ) : (
                          <span className="text-[10px] font-black bg-slate-100 text-slate-400 px-3 py-1.5 rounded-xl border border-slate-200 uppercase tracking-widest w-fit">
                            BİREYSEL
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {s.isApproved ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-widest w-fit">
                            <Check className="w-3 h-3" /> ONAYLI
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-widest w-fit">
                            <X className="w-3 h-3" /> ONAY BEKLİYOR
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedStatsStaff(s)}
                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"
                            title="İstatistik"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleEdit(s)}
                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"
                            title="Düzenle"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id!)}
                            className="p-2 text-rose-300 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                            title="Sil"
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

      <Pagination 
        currentPage={currentPage}
        totalItems={filteredAndSortedStaff.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
      />

      <AnimatePresence>
        {selectedStatsStaff && (
          <StaffStatsModal 
            staff={selectedStatsStaff} 
            currentUser={currentUser}
            onClose={() => setSelectedStatsStaff(null)} 
          />
        )}

      </AnimatePresence>
    </div>
  );
}
