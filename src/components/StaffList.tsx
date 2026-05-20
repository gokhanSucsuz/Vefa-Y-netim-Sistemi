import { useConfirmDialog } from '../hooks/useConfirmDialog';
import toast from 'react-hot-toast';
import React, { useState, useRef, useMemo } from 'react';
import { dbLocal } from '../db';
import { Staff, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { Plus, Trash2, Edit2, X, Check, UserPlus, Users, FileSpreadsheet, Search, ArrowUpDown, ArrowUp, ArrowDown, BarChart3, ChevronRight, Eye, EyeOff, CalendarRange } from 'lucide-react';
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
  
  // Usability state: Quick Filter Chips
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'backup' | 'passive' | 'resigned'>('all');
  
  // Usability state: Mobile Accordion expand track
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Clean undefined fields
      const dataToSave = { ...formData };
      
      // If passive or resigned, they cannot have an active partner
      if (dataToSave.isActive === false || dataToSave.resignationDate) {
        dataToSave.partnerId = undefined;
      }

      if (dataToSave.resignationDate) {
        dataToSave.isApproved = false;
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
        // Search Term Filter
        const search = searchTerm.toLowerCase();
        const matchesSearch = (
          s.name.toLowerCase().includes(search) ||
          s.surname.toLowerCase().includes(search) ||
          s.tcNo.includes(search) ||
          (s.phone || '').includes(search)
        );

        if (!matchesSearch) return false;

        // Usability: Quick Filter Chip selection
        if (activeFilter === 'active') return s.isActive !== false && !s.isBackup && !s.resignationDate;
        if (activeFilter === 'backup') return s.isActive !== false && s.isBackup && !s.resignationDate;
        if (activeFilter === 'passive') return s.isActive === false && !s.resignationDate;
        if (activeFilter === 'resigned') return !!s.resignationDate;
        return true;
      })
      .sort((a, b) => {
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
  }, [staff, searchTerm, sortBy, sortOrder, activeFilter]);

  const paginatedStaff = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedStaff.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedStaff, currentPage]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">PERSONEL YÖNETİMİ</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Saha ekiplerini, yedek personeli ve izin durumlarını yönetin.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleExcelImport}
            accept=".xlsx, .xls"
            className="hidden"
            id="field-wwm2esz"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 px-5 py-3 rounded-2xl transition-all duration-200 font-bold border border-emerald-150 text-sm cursor-pointer"
          >
            <FileSpreadsheet className="w-4.5 h-4.5" />
            Excel İçe Aktar
          </button>
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
            className="hidden md:flex flex-1 sm:flex-none items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-[#082142] text-white px-5 py-3 rounded-2xl hover:shadow-lg hover:shadow-blue-500/10 transition-all font-bold text-sm cursor-pointer"
          >
            <UserPlus className="w-4.5 h-4.5" />
            Yeni Personel Ekle
          </button>
        </div>
      </div>

      {/* Usability Overhaul: Sliding Right Drawer for Add/Edit Form */}
      {isAdding && (
        <>
          {/* Backdrop Glass Overlay */}
          <div 
            className="official-drawer-overlay animate-in fade-in duration-300"
            onClick={() => { setIsAdding(false); setEditingId(null); }}
          />
          {/* Slide-over Sheet Panel */}
          <div className="official-drawer translate-x-0 animate-in slide-in-from-right duration-500">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  {editingId ? 'Personel Bilgilerini Düzenle' : 'Yeni Personel Kaydı'}
                </h3>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-0.5">Vefa Saha Görevlisi Formu</p>
              </div>
              <button 
                onClick={() => { setIsAdding(false); setEditingId(null); }}
                className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Drawer Form Viewport */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Ad</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-semibold text-slate-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Soyad</label>
                  <input
                    required
                    type="text"
                    value={formData.surname}
                    onChange={e => setFormData({ ...formData, surname: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">TC Kimlik No</label>
                <input
                  required
                  type="text"
                  maxLength={11}
                  value={formData.tcNo}
                  onChange={e => setFormData({ ...formData, tcNo: e.target.value.replace(/\D/g, '') })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-semibold text-slate-800"
                  placeholder="11 haneli T.C. kimlik numarası"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Telefon Numarası</label>
                <input
                  type="tel"
                  placeholder="Örn: 05051234567"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Görev Durumu</label>
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-bold text-slate-800 cursor-pointer"
                >
                  <option value="active">Aktif (Sahada / Ekip)</option>
                  <option value="backup">Yedek (Görev Atanmamış)</option>
                  <option value="passive">Pasif (Farklı Görevde)</option>
                  <option value="resigned">İşten Ayrıldı (Erişim Kapatılır)</option>
                </select>
              </div>

              {formData.isActive === false && !formData.resignationDate && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Geçici Görev Yeri</label>
                  <input
                    type="text"
                    required
                    placeholder="Şu an bulunduğu kurum veya birim"
                    value={formData.dutyLocation || ''}
                    onChange={e => setFormData({ ...formData, dutyLocation: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-semibold text-slate-800"
                  />
                </div>
              )}

              {formData.resignationDate !== undefined && formData.resignationDate !== null && (
                <>
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">İşten Ayrılış Tarihi</label>
                    <input
                      type="date"
                      required
                      value={formData.resignationDate}
                      onChange={e => setFormData({ ...formData, resignationDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-bold text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Ayrılma Nedeni / Açıklama</label>
                    <input
                      type="text"
                      placeholder="Örn: Kendi isteğiyle, Tayin vb."
                      value={formData.resignationReason || ''}
                      onChange={e => setFormData({ ...formData, resignationReason: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-semibold text-slate-800"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Ekip Ortağı</label>
                <select
                  value={formData.partnerId || ''}
                  onChange={e => setFormData({ ...formData, partnerId: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-bold text-slate-800 cursor-pointer"
                >
                  <option value="">Partner Yok (Bireysel Çalışıyor)</option>
                  {staff
                    .filter(s => s.id !== editingId && !s.resignationDate && s.isActive !== false)
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.surname} {s.partnerId ? '(Başka Ortağı Var)' : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Google / Gmail E-posta</label>
                <input
                  required
                  type="email"
                  placeholder="ad.soyad@gmail.com"
                  value={formData.googleEmail || ''}
                  onChange={e => setFormData({ ...formData, googleEmail: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Panel Erişim Yetkisi</label>
                <div className={`flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 ${formData.resignationDate ? 'opacity-55' : ''}`}>
                  <input
                    type="checkbox"
                    id="isApproved"
                    disabled={!!formData.resignationDate}
                    checked={!formData.resignationDate && (formData.isApproved || false)}
                    onChange={e => setFormData({ ...formData, isApproved: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded border-slate-350 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="isApproved" className={`text-sm font-bold text-slate-800 ${formData.resignationDate ? 'cursor-not-allowed select-none' : 'cursor-pointer'}`}>
                    {formData.resignationDate 
                      ? 'Erişim Yetkisi Tamamen İptal Edildi' 
                      : (formData.isApproved ? 'Saha Personeli Giriş Yapabilir' : 'Erişim Yok (Onay Bekliyor)')}
                  </label>
                </div>
              </div>
            </form>

            {/* Drawer Footer Actions */}
            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => { setIsAdding(false); setEditingId(null); }}
                className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all font-bold text-sm cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="px-6 py-3 rounded-xl bg-[#082142] hover:bg-[#041226] text-white transition-all font-bold text-sm cursor-pointer shadow-lg shadow-blue-900/10 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingId ? 'Bilgileri Güncelle' : 'Personeli Kaydet'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Usability Overhaul: Search, Sort and Horizontal Quick Filter Chips */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        {/* Core Search & Sort */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Personel ara (Ad, Soyad, TC, Telefon)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all text-sm font-semibold text-slate-800"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 w-full md:w-auto">
              <ArrowUpDown className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Sırala:</span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-sm font-extrabold text-slate-800 outline-none cursor-pointer"
              >
                <option value="name">Ad Soyad</option>
                <option value="tcNo">T.C. No</option>
              </select>
              <button 
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="ml-2 p-1 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 text-slate-700" /> : <ArrowDown className="w-4 h-4 text-slate-700" />}
              </button>
            </div>
          </div>
        </div>

        {/* Horizontal Quick Filter Chips */}
        <div className="filter-chips-container">
          <button 
            onClick={() => { setActiveFilter('all'); setCurrentPage(1); }}
            className={`filter-chip ${activeFilter === 'all' ? 'filter-chip-active' : ''}`}
          >
            Tüm Personel ({staff.length})
          </button>
          <button 
            onClick={() => { setActiveFilter('active'); setCurrentPage(1); }}
            className={`filter-chip ${activeFilter === 'active' ? 'filter-chip-active' : ''}`}
          >
            Aktif Ekip ({staff.filter(s => s.isActive !== false && !s.isBackup && !s.resignationDate).length})
          </button>
          <button 
            onClick={() => { setActiveFilter('backup'); setCurrentPage(1); }}
            className={`filter-chip ${activeFilter === 'backup' ? 'filter-chip-active' : ''}`}
          >
            Yedek Ekipler ({staff.filter(s => s.isActive !== false && s.isBackup && !s.resignationDate).length})
          </button>
          <button 
            onClick={() => { setActiveFilter('passive'); setCurrentPage(1); }}
            className={`filter-chip ${activeFilter === 'passive' ? 'filter-chip-active' : ''}`}
          >
            Pasif Ekipler ({staff.filter(s => s.isActive === false && !s.resignationDate).length})
          </button>
          <button 
            onClick={() => { setActiveFilter('resigned'); setCurrentPage(1); }}
            className={`filter-chip ${activeFilter === 'resigned' ? 'filter-chip-active' : ''}`}
          >
            İşten Ayrılanlar ({staff.filter(s => !!s.resignationDate).length})
          </button>
        </div>
      </div>

      {/* Usability: Touch-friendly Mobile Accordion Cards (visible only on small viewports) */}
      <div className="block md:hidden space-y-3">
        {filteredAndSortedStaff.length === 0 ? (
          <div className="bg-white p-12 text-center text-slate-400 font-medium border border-slate-100 rounded-2xl">
            Kayıt bulunamadı.
          </div>
        ) : (
          paginatedStaff.map(s => {
            const partner = staff.find(p => p.id === s.partnerId);
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const activeLeave = partner?.leaves?.find(l => l.startDate <= todayStr && l.endDate >= todayStr);
            const backupStaff = activeLeave?.backupStaffId ? staff.find(b => b.id === activeLeave.backupStaffId) : null;
            const isExpanded = expandedId === s.id;

            return (
              <div key={s.id} className="mobile-accordion-card">
                <div className="mobile-accordion-header" onClick={() => toggleExpand(s.id!)}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 text-[#082142] rounded-xl flex items-center justify-center shrink-0 border border-slate-100">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <div className="font-extrabold text-slate-900 text-sm">{s.name} {s.surname}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {s.resignationDate ? (
                          <span className="text-[8px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-rose-100">İşten Ayrıldı</span>
                        ) : s.isActive === false ? (
                          <span className="text-[8px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-amber-100">Pasif</span>
                        ) : s.isBackup ? (
                          <span className="text-[8px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-blue-100">Yedek</span>
                        ) : (
                          <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-emerald-100">Aktif</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-slate-400 transition-transform duration-350">
                    {isExpanded ? <X className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mobile-accordion-content">
                    <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">T.C. Kimlik No</div>
                        <div className="text-slate-800 font-mono mt-1 font-bold">{s.tcNo}</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Telefon</div>
                        <div className="text-slate-800 mt-1 font-bold">{formatPhone(s.phone)}</div>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl text-xs font-semibold">
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Ekip Durumu</div>
                      {partner ? (
                        activeLeave ? (
                          backupStaff ? (
                            <div className="space-y-1.5">
                              <span className="inline-block text-[8px] font-black bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-200">ORTAK İZİNLİ</span>
                              <div className="text-slate-700 font-bold">Yedek: {backupStaff.name} {backupStaff.surname}</div>
                            </div>
                          ) : (
                            <span className="inline-block text-[8px] font-black bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-200">ORTAK İZİNLİ</span>
                          )
                        ) : (
                          <div className="text-slate-800 font-bold flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {partner.name} {partner.surname}
                          </div>
                        )
                      ) : (
                        <span className="inline-block text-[8px] font-black bg-slate-200 text-slate-500 px-2.5 py-0.5 rounded border border-slate-300">BİREYSEL ÇALIŞIYOR</span>
                      )}
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl text-xs font-semibold">
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Panel Erişim Yetkisi</div>
                      {s.resignationDate ? (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded border border-slate-200">ERİŞİM YOK</span>
                      ) : s.isApproved ? (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded border border-emerald-200">ONAYLI</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black bg-amber-50 text-amber-600 px-2.5 py-0.5 rounded border border-amber-200">ONAY BEKLİYOR</span>
                      )}
                    </div>

                    {/* Operational Actions */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => setSelectedStatsStaff(s)}
                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200/80 rounded-xl text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <BarChart3 className="w-4 h-4" /> İstatistik
                      </button>
                      <button
                        onClick={() => handleEdit(s)}
                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200/80 rounded-xl text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Edit2 className="w-4 h-4" /> Düzenle
                      </button>
                      <button
                        onClick={() => handleDelete(s.id!)}
                        className="flex-1 py-3 bg-rose-50 hover:bg-rose-100 rounded-xl text-rose-600 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Trash2 className="w-4 h-4" /> Sil
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Dense High-Fidelity Data Table (visible only on medium viewports and above) */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
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
                          <div className="w-10 h-10 bg-blue-50 text-institution-blue rounded-xl flex items-center justify-center shrink-0 border border-blue-100 animate-pulse-slow">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{s.name} {s.surname}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                Vefa Saha Görevlisi
                              </span>
                              {s.resignationDate ? (
                                <span className="text-[9px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-rose-100 cursor-help" title={s.resignationReason ? `Ayrılma Sebebi: ${s.resignationReason}` : 'Ayrılma sebebi belirtilmemiş'}>
                                  İşten Ayrıldı - {s.resignationDate}
                                </span>
                              ) : s.isActive === false ? (
                                <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-amber-100">
                                  Pasif - {s.dutyLocation}
                                </span>
                              ) : s.isBackup ? (
                                <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-blue-100">
                                  Yedek
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-mono text-xs font-bold">
                        <span className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
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
                                <span className="text-[9px] font-black bg-amber-50 text-amber-600 px-2.5 py-1 rounded-xl border border-amber-200 uppercase tracking-widest w-fit">
                                  PARTNER İZİNLİ
                                </span>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black bg-blue-50 text-blue-600 border border-blue-200 uppercase tracking-widest w-fit shadow-sm">
                                  <Users className="w-3 h-3" />
                                  YEDEK: {backupStaff.name}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[9px] font-black bg-amber-50 text-amber-600 px-2.5 py-1 rounded-xl border border-amber-200 uppercase tracking-widest w-fit">
                                EKİP ARKADAŞI İZİNLİ
                              </span>
                            )
                          ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black bg-blue-50 text-institution-blue border border-blue-100 uppercase tracking-widest w-fit shadow-sm">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              {partner.name} {partner.surname}
                            </div>
                          )
                        ) : (
                          <span className="text-[9px] font-black bg-slate-100 text-slate-400 px-2.5 py-1 rounded-xl border border-slate-200 uppercase tracking-widest w-fit">
                            BİREYSEL
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {s.resignationDate ? (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-widest w-fit" title="İşten ayrılan personelin erişim yetkisi tamamen iptal edilmiştir.">
                            <X className="w-3 h-3" /> ERİŞİM YOK
                          </span>
                        ) : s.isApproved ? (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-widest w-fit">
                            <Check className="w-3 h-3" /> ONAYLI
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-widest w-fit">
                            <X className="w-3 h-3" /> ONAY BEKLİYOR
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedStatsStaff(s)}
                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                            title="İstatistik"
                          >
                            <BarChart3 className="w-4.5 h-4.5" />
                          </button>

                          <button
                            onClick={() => handleEdit(s)}
                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                            title="Düzenle"
                          >
                            <Edit2 className="w-4.5 h-4.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id!)}
                            className="p-2 text-rose-300 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
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

      {/* Usability: Floating Action Button (FAB) for Mobile Quick Add */}
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
          className="md:hidden official-fab"
          title="Yeni Personel Ekle"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      )}

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
