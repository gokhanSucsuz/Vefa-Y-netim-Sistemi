import React, { useState } from 'react';
import { Shield, User, Phone, CreditCard, Save, Loader2 } from 'lucide-react';
import { dbLocal } from '../db';
import { Admin } from '../types';
import { logAction } from '../services/auditService';

interface AdminRegistrationProps {
  email: string;
  onComplete: (admin: Admin) => void;
}

export default function AdminRegistration({ email, onComplete }: AdminRegistrationProps) {
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    tcNo: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.surname || !formData.tcNo || !formData.phone) {
      setError('Lütfen tüm alanları doldurunuz.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newAdmin: Admin = {
        ...formData,
        email,
        createdAt: new Date().toISOString(),
      };
      const id = await dbLocal.admins.add(newAdmin);
      logAction(id, `${newAdmin.name} ${newAdmin.surname}`, 'Yetkili Kaydı', 'Sistemin ilk yetkili personeli kaydedildi.');
      onComplete({ ...newAdmin, id });
    } catch (err: any) {
      console.error('Admin registration error:', err);
      setError('Kayıt sırasında bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-xl max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-2xl">
            <Shield className="w-10 h-10 text-blue-600" />
          </div>
        </div>
        
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Yetkili Personel Kaydı</h2>
          <p className="text-gray-500 text-sm mt-2">
            Sistemi ilk kez başlattığınız için yetkili personel bilgilerini tanımlamanız gerekmektedir.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Ad</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Adınız"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Soyad</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={formData.surname}
                  onChange={e => setFormData({ ...formData, surname: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Soyadınız"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase ml-1">T.C. Kimlik No</label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                maxLength={11}
                value={formData.tcNo}
                onChange={e => setFormData({ ...formData, tcNo: e.target.value.replace(/\D/g, '') })}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="11 Haneli T.C. No"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Telefon</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="05xx xxx xx xx"
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
              * Bu personel, sistemdeki tüm işlemlerden ve raporlamalardan sorumlu olacaktır. Raporların altında bu personelin bilgileri yer alacaktır.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-200"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Kaydı Tamamla ve Giriş Yap
          </button>
        </form>
      </div>
    </div>
  );
}
