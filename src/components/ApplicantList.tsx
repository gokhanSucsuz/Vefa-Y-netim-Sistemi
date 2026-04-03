import React, { useState, useRef } from 'react';
import { dbLocal } from '../db';
import { Applicant, EDIRNE_NEIGHBORHOODS } from '../types';
import { Plus, Trash2, Edit2, X, Check, UserPlus, MapPin, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  applicants: Applicant[];
}

export default function ApplicantList({ applicants }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Applicant>({
    name: '',
    surname: '',
    tcNo: '',
    phone: '',
    address: '',
    neighborhood: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Mock geocoding based on address
      const lat = 41.675 + (Math.random() - 0.5) * 0.05;
      const lng = 26.570 + (Math.random() - 0.5) * 0.05;
      
      const dataToSave = { ...formData, lat, lng };

      if (editingId) {
        await dbLocal.applicants.update(editingId, dataToSave);
        setEditingId(null);
      } else {
        await dbLocal.applicants.add(dataToSave);
        setIsAdding(false);
      }
      setFormData({ name: '', surname: '', tcNo: '', phone: '', address: '', neighborhood: '' });
    } catch (error) {
      console.error("Error saving applicant:", error);
    }
  };

  const handleEdit = (applicant: Applicant) => {
    setFormData(applicant);
    setEditingId(applicant.id!);
    setIsAdding(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Bu müracaatçıyı silmek istediğinize emin misiniz?')) {
      await dbLocal.applicants.delete(id);
    }
  };

  const handleDeleteAll = async () => {
    if (confirm('TÜM müracaatçı kayıtlarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) {
      try {
        await dbLocal.applicants.clear();
      } catch (error) {
        console.error("Error clearing applicants:", error);
      }
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

        const newApplicants: Applicant[] = data.map(row => {
          const fullName = (row['isim-soyisim'] || row['Ad Soyad'] || '').toString().trim();
          const parts = fullName.split(' ');
          const surname = parts.length > 1 ? parts.pop() : '';
          const name = parts.join(' ');

          return {
            name: name || fullName,
            surname: surname || '',
            tcNo: (row['tc kimlik no'] || row['TC No'] || '').toString().replace(/\D/g, ''),
            phone: (row['telefon'] || row['Telefon'] || '').toString(),
            address: (row['adres'] || row['Adres'] || '').toString(),
            householdSize: parseInt(row['kişi sayısı'] || row['Kişi Sayısı'] || '1'),
            neighborhood: EDIRNE_NEIGHBORHOODS[0] // Default to first neighborhood if not in Excel
          };
        });

        if (newApplicants.length > 0) {
          await dbLocal.applicants.bulkAdd(newApplicants);
          alert(`${newApplicants.length} müracaatçı başarıyla yüklendi.`);
        }
      } catch (error) {
        console.error("Excel import error:", error);
        alert("Excel dosyası okunurken bir hata oluştu. Lütfen sütun başlıklarını kontrol edin.");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Müracaatçı Listesi</h2>
          <p className="text-gray-500">Temizlik hizmeti alan vatandaşların kayıtlarını yönetin.</p>
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
          {applicants.length > 0 && !isAdding && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl hover:bg-red-100 transition-all font-semibold"
            >
              <Trash2 className="w-5 h-5" />
              Tümünü Sil
            </button>
          )}
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              <UserPlus className="w-5 h-5" />
              Yeni Müracaatçı Ekle
            </button>
          )}
        </div>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Müracaatçı Düzenle' : 'Yeni Müracaatçı Kaydı'}
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
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm font-medium text-gray-700">Adres</label>
              <textarea
                required
                placeholder="Örn: Abdurrahman Mah. Şehit Emniyet Müdürü Ertan Nezihi Turhan Cad. No: 5"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24"
              />
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
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Adres Bilgisi</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">TC Kimlik No</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Kişi Sayısı</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {applicants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Henüz kayıtlı müracaatçı bulunmuyor.
                  </td>
                </tr>
              ) : (
                applicants.map(applicant => (
                  <tr key={applicant.id} className="hover:bg-gray-50 transition-all group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{applicant.name} {applicant.surname}</div>
                      <div className="text-xs text-gray-500">{applicant.phone}</div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="flex items-start gap-1 text-sm text-gray-600">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                        <span className="line-clamp-2">{applicant.address}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-sm">{applicant.tcNo}</td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{applicant.householdSize || 1} Kişi</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => handleEdit(applicant)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(applicant.id!)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
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
    </div>
  );
}
