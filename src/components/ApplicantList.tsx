import React, { useState, useRef, useEffect, useMemo } from 'react';
import { dbLocal } from '../db';
import { Applicant, EDIRNE_NEIGHBORHOODS, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { Plus, Trash2, Edit2, X, Check, UserPlus, MapPin, FileSpreadsheet, Search, Map as MapIcon, RefreshCw, ArrowUp, ArrowDown, Hash, ArrowUpDown, BarChart3, Eye, EyeOff, GripVertical } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Map, Marker, NavigationControl, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AnimatePresence, motion, Reorder } from 'motion/react';

import { formatPhone, formatTC } from '../lib/format';
import { geocodeAddress } from '../services/geocoding';
import ApplicantStatsModal from './ApplicantStatsModal';
import { reAlignActiveProgramSchedules } from '../services/scheduleService';

// Leaflet icon fix removed as it's not needed for MapLibre

function LocationPicker({ position, setPosition }: { position: [number, number], setPosition: (pos: [number, number]) => void }) {
  const { current: map } = useMap();
  
  useEffect(() => {
    if (map) {
      map.flyTo({ center: [position[1], position[0]], zoom: 15 });
    }
  }, [position, map]);

  return (
    <Marker 
      latitude={position[0]} 
      longitude={position[1]} 
      draggable 
      onDragEnd={(e) => setPosition([e.lngLat.lat, e.lngLat.lng])}
    >
      <div className="w-8 h-8 -mt-4 -ml-4 bg-red-500 text-white rounded-full flex items-center justify-center border-2 border-white shadow-lg cursor-pointer">
        <MapPin className="w-4 h-4" />
      </div>
    </Marker>
  );
}

interface Props {
  applicants: Applicant[];
  currentUser: SystemUser;
  isPriorityMode?: boolean;
}

export default function ApplicantList({ applicants, currentUser, isPriorityMode = false }: Props) {
  const activeApplicants = applicants.filter(a => !a.isDeleted);
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Applicant>({
    name: '',
    surname: '',
    tcNo: '',
    haneNo: '',
    phone: '',
    address: '',
    neighborhood: '',
    lat: 41.675,
    lng: 26.570,
    priority: 0
  });

  const [isImporting, setIsImporting] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'neighborhood'>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedStatsApplicant, setSelectedStatsApplicant] = useState<Applicant | null>(null);
  const [hasActiveProgram, setHasActiveProgram] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const checkPrograms = async () => {
      const activePrograms = (applicants.length > 0) ? (await dbLocal.programs.toArray()).filter(p => p.status === 'active') : [];
      setHasActiveProgram(activePrograms.length > 0);
    };
    checkPrograms();
  }, [applicants]);

  const reindexPriorities = async () => {
    const allApplicants = await dbLocal.applicants.toArray();
    // Sort by current priority, then by ID as fallback
    const sorted = allApplicants.sort((a, b) => {
      if ((a.priority || 0) !== (b.priority || 0)) {
        return (a.priority || 0) - (b.priority || 0);
      }
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const updates = [];
    for (let i = 0; i < sorted.length; i++) {
       if (sorted[i].priority !== i + 1) {
         updates.push({ id: sorted[i].id!, changes: { priority: i + 1 } });
       }
    }
    if (updates.length > 0) {
      await dbLocal.applicants.bulkUpdate(updates);
    }
  };

  const handleGeocode = async () => {
    if (!formData.neighborhood) {
      alert('Lütfen önce bir mahalle veya köy seçin.');
      return;
    }
    setIsGeocoding(true);
    const result = await geocodeAddress(formData.address, formData.neighborhood);
    if (result) {
      setFormData(prev => ({ ...prev, lat: result.lat, lng: result.lng }));
    }
    setIsGeocoding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check TC No uniqueness
    if (applicants.some(a => a.tcNo === formData.tcNo && a.id !== editingId)) {
      alert('Bu TC Kimlik Numarası ile kayıtlı bir hane zaten mevcut.');
      return;
    }

    // Check Hane No uniqueness
    if (formData.haneNo && applicants.some(a => a.haneNo === formData.haneNo && a.id !== editingId)) {
      alert('Bu Hane Numarası ile kayıtlı bir hane zaten mevcut.');
      return;
    }

    try {
      if (editingId) {
        await dbLocal.applicants.update(editingId, formData);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Hane Güncelleme', `${formData.name} ${formData.surname} hanesi güncellendi.`);
        setEditingId(null);
      } else {
        const maxPriority = applicants.reduce((max, a) => Math.max(max, a.priority || 0), 0);
        await dbLocal.applicants.add({ ...formData, priority: maxPriority + 1 });
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Hane Ekleme', `${formData.name} ${formData.surname} hanesi eklendi.`);
        setIsAdding(false);
      }
      setFormData({ name: '', surname: '', tcNo: '', phone: '', address: '', neighborhood: '', lat: 41.675, lng: 26.570, priority: 0 });
      await reindexPriorities();
      await reAlignActiveProgramSchedules();
    } catch (error) {
      console.error("Error saving applicant:", error);
    }
  };

  const handleEdit = (applicant: Applicant) => {
    setFormData(applicant);
    setEditingId(applicant.id!);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    const applicant = applicants.find(a => a.id === id);
    if (confirm('Bu haneyi silmek istediğinize emin misiniz?')) {
      await dbLocal.applicants.update(id, { isDeleted: true });
      if (applicant) {
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Hane Silme', `${applicant.name} ${applicant.surname} hanesi silindi.`);
      }
      await reindexPriorities();
      await reAlignActiveProgramSchedules();
    }
  };

  const handleDeleteAll = async () => {
    if (confirm('TÜM hane kayıtlarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) {
      try {
        setIsProcessing(true);
        await dbLocal.applicants.clear();
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Tüm Haneleri Silme', 'Tüm hane kayıtları temizlendi.');
      } catch (error) {
        console.error("Error clearing applicants:", error);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handlePriorityUpdate = async (updates: any[]) => {
    if (hasActiveProgram) {
      if (!confirm('Sistemde aktif bir program bulunmaktadır. Öncelik sırasını değiştirmek programın yeniden düzenlenmesine neden olabilir (Kaydet butonuna bastığınızda). Devam etmek istiyor musunuz?')) {
        return false;
      }
    }
    
    try {
      await dbLocal.applicants.bulkUpdate(updates);
      await reindexPriorities();
      return true;
    } catch (e) {
      console.error("Priority update error:", e);
      return false;
    }
  };

  const fixNeighborhoods = async () => {
    if (!confirm('Mevcut tüm hanelerin mahalle bilgileri adreslerine göre yeniden taranacak. Onaylıyor musunuz?')) return;
    
    let fixedCount = 0;
    for (const applicant of applicants) {
      const upperAddress = applicant.address.toLocaleUpperCase('tr-TR');
      let detectedNeighborhood = applicant.neighborhood;
      
      for (const n of EDIRNE_NEIGHBORHOODS) {
        if (upperAddress.includes(n.toLocaleUpperCase('tr-TR'))) {
          detectedNeighborhood = n;
          break;
        }
      }
      
      if (detectedNeighborhood !== applicant.neighborhood) {
        const coords = await geocodeAddress('', detectedNeighborhood);
        await dbLocal.applicants.update(applicant.id!, { 
          neighborhood: detectedNeighborhood,
          lat: coords?.lat,
          lng: coords?.lng
        });
        fixedCount++;
      }
    }
    alert(`${fixedCount} hanenin mahalle bilgisi düzeltildi.`);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setIsImporting(true);
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        
        setImportProgress({ current: 0, total: data.length });

        const newApplicants: Applicant[] = [];
        
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          setImportProgress(prev => ({ ...prev, current: i + 1 }));
          
          const fullName = (row['isim-soyisim'] || row['İsim Soyisim'] || row['Ad Soyad'] || '').toString().trim();
          const parts = fullName.split(/\s+/);
          let name = '';
          let surname = '';
          
          if (parts.length > 1) {
            surname = parts.pop() || '';
            name = parts.join(' ');
          } else {
            name = fullName;
          }

          const address = (row['adres'] || row['Adres'] || '').toString();
          const neighborhoodFromExcel = (row['mahalle-köy'] || row['Mahalle/Köy'] || row['Mahalle'] || '').toString().trim();

          // Try to detect neighborhood from Excel column first, then from address
          let detectedNeighborhood = '';
          const upperNeighborhoodExcel = neighborhoodFromExcel.toLocaleUpperCase('tr-TR');
          const upperAddress = address.toLocaleUpperCase('tr-TR');

          // 1. Check if the provided neighborhood matches any in our list
          if (upperNeighborhoodExcel) {
            for (const n of EDIRNE_NEIGHBORHOODS) {
              const nUpper = n.toLocaleUpperCase('tr-TR');
              if (upperNeighborhoodExcel.includes(nUpper) || nUpper.includes(upperNeighborhoodExcel)) {
                detectedNeighborhood = n;
                break;
              }
            }
          }

          // 2. If not found, try to detect from address
          if (!detectedNeighborhood) {
            for (const n of EDIRNE_NEIGHBORHOODS) {
              if (upperAddress.includes(n.toLocaleUpperCase('tr-TR'))) {
                detectedNeighborhood = n;
                break;
              }
            }
          }

          // Default to first neighborhood if still not found
          if (!detectedNeighborhood) {
            detectedNeighborhood = EDIRNE_NEIGHBORHOODS[0];
          }

          const coords = await geocodeAddress('', detectedNeighborhood);

          newApplicants.push({
            name: name,
            surname: surname,
            tcNo: (row['tc kimlik no'] || row['TC No'] || '').toString().replace(/\D/g, ''),
            haneNo: (row['hane no'] || row['Hane No'] || '').toString(),
            phone: (row['telefon'] || row['Telefon'] || '').toString(),
            address: address,
            householdSize: parseInt(row['kişi sayısı'] || row['Kişi Sayısı'] || '1'),
            neighborhood: detectedNeighborhood,
            lat: coords?.lat,
            lng: coords?.lng,
            priority: i + 1 // Temporary priority, will be reindexed
          });
        }

        if (newApplicants.length > 0) {
          await dbLocal.applicants.bulkAdd(newApplicants);
          logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Excel İçe Aktarma', `${newApplicants.length} hane Excel'den yüklendi.`);
          await reindexPriorities();
          await reAlignActiveProgramSchedules();
          alert(`${newApplicants.length} hane başarıyla yüklendi.`);
        }
      } catch (error) {
        console.error("Excel import error:", error);
        alert("Excel dosyası okunurken bir hata oluştu. Lütfen sütun başlıklarını kontrol edin.");
      } finally {
        setIsImporting(false);
        setImportProgress({ current: 0, total: 0 });
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const [localReorderList, setLocalReorderList] = useState<Applicant[]>([]);
  const [prioritySearch, setPrioritySearch] = useState('');

  const filteredAndSortedApplicants = useMemo(() => {
    return [...applicants]
      .filter(a => !a.isDeleted)
      .filter(a => {
        const search = searchTerm.toLowerCase();
        return (
          a.name.toLowerCase().includes(search) ||
          a.surname.toLowerCase().includes(search) ||
          a.tcNo.includes(search) ||
          (a.neighborhood || '').toLowerCase().includes(search)
        );
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'priority') {
          comparison = (a.priority || 0) - (b.priority || 0);
        } else if (sortBy === 'name') {
          comparison = (a.name + a.surname).localeCompare(b.name + b.surname);
        } else if (sortBy === 'neighborhood') {
          comparison = (a.neighborhood || '').localeCompare(b.neighborhood || '');
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [applicants, searchTerm, sortBy, sortOrder]);

  const handleManualPriorityChange = (id: string, newIndex: number) => {
    const list = [...localReorderList];
    const currentIndex = list.findIndex(a => a.id === id);
    if (currentIndex === -1) return;
    
    const targetIndex = Math.max(0, Math.min(list.length - 1, newIndex - 1));
    const [movedItem] = list.splice(currentIndex, 1);
    list.splice(targetIndex, 0, movedItem);
    setLocalReorderList(list);
  };

  const [priorityInputs, setPriorityInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isPriorityMode) {
      setLocalReorderList(filteredAndSortedApplicants);
      const inputs: Record<string, string> = {};
      filteredAndSortedApplicants.forEach((a, i) => {
        inputs[a.id!] = (i + 1).toString();
      });
      setPriorityInputs(inputs);
    }
  }, [isPriorityMode, filteredAndSortedApplicants]);

  const filteredLocalReorderList = useMemo(() => {
    if (!prioritySearch) return localReorderList;
    const searchLow = prioritySearch.toLowerCase();
    return localReorderList.filter(a => 
      a.name.toLowerCase().includes(searchLow) || 
      a.surname.toLowerCase().includes(searchLow) || 
      a.tcNo.includes(searchLow) ||
      (a.haneNo && a.haneNo.includes(searchLow))
    );
  }, [localReorderList, prioritySearch]);

  const handlePriorityReorder = (newOrder: Applicant[]) => {
    let updatedList: Applicant[];
    if (prioritySearch) {
      // If searching, we need to merge the reordered visible items back into the master list
      updatedList = [...localReorderList];
      const visibleIds = filteredLocalReorderList.map(item => item.id);
      
      let visibleIdx = 0;
      for (let i = 0; i < updatedList.length; i++) {
        if (visibleIds.includes(updatedList[i].id)) {
          updatedList[i] = newOrder[visibleIdx++];
        }
      }
    } else {
      updatedList = newOrder;
    }
    
    setLocalReorderList(updatedList);
    
    // Update inputs to match new sequence
    const inputs: Record<string, string> = {};
    updatedList.forEach((a, i) => {
      inputs[a.id!] = (i + 1).toString();
    });
    setPriorityInputs(inputs);
  };

  const handleSavePriorityAndRegenerate = async () => {
    const listToSave = localReorderList.length > 0 ? localReorderList : filteredAndSortedApplicants;
    
    if (hasActiveProgram) {
      if (!confirm('Hane sıralaması kaydedilecek ve mevcut programın gerçekleşmemiş tüm ziyaretleri araya yeni haneler eklenecek/çıkarılacak şekilde kaydırılarak güncellenecektir. Devam etmek istiyor musunuz?')) {
        return;
      }
    }

    setIsProcessing(true);
    try {
      // 1. Save new priorities
      const updates = listToSave.map((item, index) => ({
        id: item.id!,
        changes: { priority: index + 1 }
      }));
      await dbLocal.applicants.bulkUpdate(updates);

      // 2. If there's an active program, delete uncompleted schedules
      if (hasActiveProgram) {
        await reAlignActiveProgramSchedules();
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Sıralama Güncelleme', 'Hane sıralaması güncellendi ve program kaydırılarak yeniden düzenlendi.');
        alert('Sıralama başarıyla kaydedildi ve aktif program yeni sıralamaya göre güncellendi.');
      } else {
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Sıralama Güncelleme', 'Hane sıralaması güncellendi.');
        alert('Sıralama başarıyla kaydedildi.');
      }
    } catch (e) {
      console.error("Save priority failed:", e);
      alert('Sıralama kaydedilirken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSort = (field: 'priority' | 'name' | 'neighborhood') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{isPriorityMode ? 'Hane Sıralama & Öncelik' : 'Hane Listesi'}</h2>
          <p className="text-gray-500">{isPriorityMode ? 'Hanelerin öncelik sırasını (' : 'Temizlik hizmeti alan hanelerin kayıtlarını'} yönetin.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {isPriorityMode && (
            <button
              onClick={handleSavePriorityAndRegenerate}
              disabled={isProcessing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 font-bold text-sm"
            >
              <Check className="w-5 h-5" />
              Sıralamayı Kaydet ve Uygula
            </button>
          )}
          {isImporting && !isPriorityMode && (
            <div className="flex items-center gap-3 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 animate-pulse w-full sm:w-auto">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-blue-700">
                Yükleniyor: {importProgress.current} / {importProgress.total}
              </span>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleExcelImport}
            accept=".xlsx, .xls"
            className="hidden"
          />
          {!isAdding && !isImporting && !isPriorityMode && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl hover:bg-green-100 transition-all font-semibold border border-green-200 text-sm"
            >
              <FileSpreadsheet className="w-5 h-5" />
              Excel'den Yükle
            </button>
          )}
          {activeApplicants.length > 0 && !isAdding && !isImporting && !isPriorityMode && (
            <button
              onClick={fixNeighborhoods}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-xl hover:bg-amber-100 transition-all font-semibold border border-amber-200 text-sm"
              title="Adres metninden mahalleyi otomatik tespit eder"
            >
              <RefreshCw className="w-5 h-5" />
              Mahalleleri Düzelt
            </button>
          )}
          {activeApplicants.length > 0 && !isAdding && !isImporting && !isPriorityMode && (
            <button
              onClick={handleDeleteAll}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl hover:bg-red-100 transition-all font-semibold text-sm"
            >
              <Trash2 className="w-5 h-5" />
              Tümünü Sil
            </button>
          )}
          {!isAdding && !isImporting && !isPriorityMode && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 text-sm"
            >
              <UserPlus className="w-5 h-5" />
              Yeni Hane Ekle
            </button>
          )}
        </div>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Hane Düzenle' : 'Yeni Hane Kaydı'}
            </h3>
            <button onClick={() => { setIsAdding(false); setEditingId(null); setFormData({ name: '', surname: '', tcNo: '', phone: '', address: '', neighborhood: EDIRNE_NEIGHBORHOODS[0] }); }} className="text-gray-400 hover:text-gray-600">
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
              <label className="text-sm font-medium text-gray-700">Hane No</label>
              <input
                type="text"
                value={formData.haneNo || ''}
                onChange={e => setFormData({ ...formData, haneNo: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="İsteğe bağlı"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Mahalle / Köy</label>
              <select
                required
                value={formData.neighborhood}
                onChange={async (e) => {
                  const n = e.target.value;
                  const coords = await geocodeAddress('', n);
                  setFormData({ 
                    ...formData, 
                    neighborhood: n,
                    lat: coords?.lat || formData.lat,
                    lng: coords?.lng || formData.lng
                  });
                }}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="" disabled>Seçiniz...</option>
                {EDIRNE_NEIGHBORHOODS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Kişi Sayısı (Hane)</label>
              <input
                required
                type="number"
                min="1"
                value={formData.householdSize || 1}
                onChange={e => setFormData({ ...formData, householdSize: parseInt(e.target.value) })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Öncelik Sırası</label>
              <input
                type="number"
                min="1"
                value={formData.priority || ''}
                onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Otomatik atanır"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Durum</label>
              <select
                value={formData.status || 'active'}
                onChange={e => setFormData({ ...formData, status: e.target.value as 'active' | 'passive' })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="active">Aktif</option>
                <option value="passive">Pasif</option>
              </select>
            </div>
            {formData.status === 'passive' && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Pasiflik Bitiş Tarihi</label>
                <input
                  type="date"
                  value={formData.passiveUntil || ''}
                  onChange={e => setFormData({ ...formData, passiveUntil: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
            )}
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm font-medium text-gray-700">Adres</label>
              <div className="flex gap-2">
                <textarea
                  required
                  placeholder="Örn: Abdurrahman Mah. Şehit Emniyet Müdürü Ertan Nezihi Turhan Cad. No: 5"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24"
                />
                <button
                  type="button"
                  onClick={handleGeocode}
                  disabled={isGeocoding}
                  className="px-4 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all flex flex-col items-center justify-center gap-1 border border-blue-100"
                >
                  <Search className={`w-5 h-5 ${isGeocoding ? 'animate-spin' : ''}`} />
                  <span className="text-[10px] font-bold">Konumu Bul</span>
                </button>
              </div>
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-blue-600" />
                Harita Üzerinde Konum (Tıklayarak veya İşaretçiyi Kaydırarak Ayarlayın)
              </label>
              <div className="h-[300px] rounded-2xl border border-gray-200 overflow-hidden relative z-0">
                <Map
                  initialViewState={{
                    latitude: formData.lat || 41.675,
                    longitude: formData.lng || 26.570,
                    zoom: 15
                  }}
                  mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                  style={{ width: '100%', height: '100%' }}
                  onClick={(e) => setFormData(prev => ({ ...prev, lat: e.lngLat.lat, lng: e.lngLat.lng }))}
                >
                  <NavigationControl position="top-right" />
                  <LocationPicker 
                    position={[(formData.lat || 41.675) as number, (formData.lng || 26.570) as number]} 
                    setPosition={(pos) => setFormData(prev => ({ ...prev, lat: pos[0], lng: pos[1] }))} 
                  />
                </Map>
              </div>
              <div className="text-[10px] text-gray-400 font-mono">
                Koordinatlar: {formData.lat?.toFixed(6)}, {formData.lng?.toFixed(6)}
              </div>
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
            placeholder="Hane ara (Ad, Soyad, TC, Mahalle)..."
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
              <option value="priority">Öncelik</option>
              <option value="name">Ad Soyad</option>
              <option value="neighborhood">Mahalle</option>
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
          {!isPriorityMode ? (
            <table className="w-full text-left border-collapse min-w-[900px] lg:min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 w-20 lg:w-24 uppercase tracking-wider">Sıra</th>
                  <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">Ad Soyad</th>
                  <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">Mahalle/Köy</th>
                  <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">Adres Bilgisi</th>
                  <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">TC Kimlik / Hane No</th>
                  <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 uppercase tracking-wider">Kişi Sayısı</th>
                  <th className="px-4 lg:px-6 py-4 text-xs lg:text-sm font-bold text-gray-600 text-right uppercase tracking-wider">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {applicants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-medium">
                      Henüz kayıtlı hane bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedApplicants.map(applicant => (
                    <tr key={applicant.id} className="hover:bg-gray-50/50 transition-all group">
                      <td className="px-4 lg:px-6 py-4">
                        <div className="font-bold text-blue-600 bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center border border-blue-100 text-xs shadow-sm">
                          {applicant.priority}
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4">
                        <div className="font-bold text-gray-900 text-sm">{applicant.name} {applicant.surname}</div>
                        <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
                          {formatPhone(applicant.phone)}
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4">
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-lg border border-slate-200 uppercase tracking-wider">
                          {applicant.neighborhood}
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 max-w-xs">
                        <div className="flex items-start gap-1.5 text-xs text-gray-600">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-institution-blue/60" />
                          <span className="line-clamp-2 leading-relaxed">
                            {applicant.address}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4">
                        <div className="text-gray-600 font-mono text-xs font-bold">
                          {applicant.tcNo}
                        </div>
                        {applicant.haneNo && (
                          <div className="text-[10px] text-gray-500 font-medium mt-0.5">Hane: {applicant.haneNo}</div>
                        )}
                      </td>
                      <td className="px-4 lg:px-6 py-4 text-gray-600 text-xs font-medium">{applicant.householdSize || 1} Kişi</td>
                      <td className="px-4 lg:px-6 py-4 text-right">
                        <div className="flex justify-end gap-1 lg:gap-2">
                          <button
                            onClick={() => setSelectedStatsApplicant(applicant)}
                            className="p-2 text-institution-blue hover:bg-blue-50 rounded-lg transition-all"
                            title="İstatistik ve Rapor"
                          >
                            <BarChart3 className="w-4 h-4 lg:w-5 lg:h-5" />
                          </button>
                          <button
                            onClick={() => handleEdit(applicant)}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                            title="Düzenle"
                          >
                            <Edit2 className="w-4 h-4 lg:w-5 lg:h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(applicant.id!)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4 lg:w-5 lg:h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <div className="p-4">
               <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-600 text-white p-2 rounded-lg">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium text-blue-800">
                      Öncelik sırasını sürükleyerek düzenleyebilirsiniz.
                    </p>
                  </div>
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Hane ara (Sıralama için)..."
                      value={prioritySearch}
                      onChange={e => setPrioritySearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-blue-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
               </div>
               <Reorder.Group 
                 axis="y" 
                 values={filteredLocalReorderList} 
                 onReorder={handlePriorityReorder}
                 className="space-y-2"
               >
                 {filteredLocalReorderList.map((applicant) => (
                   <Reorder.Item 
                     key={applicant.id} 
                     value={applicant}
                     className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:border-blue-300 hover:shadow-md transition-all cursor-grab active:cursor-grabbing group"
                   >
                     <GripVertical className="w-5 h-5 text-gray-400 shrink-0 group-hover:text-blue-500 transition-colors" />
                     <div className="bg-blue-50 text-blue-700 font-bold w-12 h-10 rounded-lg flex items-center justify-center border border-blue-100 shrink-0 relative overflow-hidden">
                       <input
                         type="text"
                         className="w-full h-full bg-transparent text-center focus:bg-white outline-none transition-colors"
                         value={priorityInputs[applicant.id!] || ''}
                         onChange={e => setPriorityInputs(prev => ({ ...prev, [applicant.id!]: e.target.value.replace(/\D/g, '') }))}
                         onKeyDown={e => {
                           if (e.key === 'Enter') {
                             const val = parseInt(priorityInputs[applicant.id!]);
                             if (!isNaN(val)) {
                               handleManualPriorityChange(applicant.id!, val);
                             }
                           }
                         }}
                       />
                     </div>
                     <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 truncate">{applicant.name} {applicant.surname}</div>
                        <div className="text-xs text-gray-500 truncate">{applicant.neighborhood} - {applicant.address}</div>
                     </div>
                     <div className="hidden sm:block text-right">
                        <div className="text-xs font-bold text-gray-700 font-mono">{formatTC(applicant.tcNo)}</div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">{applicant.haneNo || '-'}</div>
                     </div>
                   </Reorder.Item>
                 ))}
               </Reorder.Group>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedStatsApplicant && (
          <ApplicantStatsModal 
            applicant={selectedStatsApplicant} 
            currentUser={currentUser}
            onClose={() => setSelectedStatsApplicant(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
