import React, { useState, useEffect } from 'react';
import { User, Shield, CheckCircle, XCircle, Trash2, Loader2, Search, Mail, Phone, CreditCard, Activity, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { dbService } from '../db';
import { SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { maskTcNo } from '../lib/masking';

interface UserManagerProps {
  currentUser: SystemUser;
}

export default function UserManager({ currentUser }: UserManagerProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [revealedItems, setRevealedItems] = useState<Set<string>>(new Set());

  const toggleReveal = (id: string) => {
    const newRevealed = new Set(revealedItems);
    if (newRevealed.has(id)) {
      newRevealed.delete(id);
    } else {
      newRevealed.add(id);
    }
    setRevealedItems(newRevealed);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await dbService.users.toArray();
      setUsers(data as any);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleApproval = async (user: SystemUser) => {
    if (isProcessing) return;
    setIsProcessing(user.id!);
    try {
      await dbService.users.update(user.id!, { 
        isApproved: !user.isApproved,
        status: !user.isApproved ? 'active' : 'inactive' 
      });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Kullanıcı Onay Durumu Değiştirme', `${user.name} ${user.surname} kullanıcısının onay durumu ${!user.isApproved ? 'Aktif' : 'Pasif'} olarak güncellendi.`);
      await fetchUsers();
    } catch (err) {
      console.error('Error updating user:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDeleteUser = async (user: SystemUser) => {
    if (user.isSuperAdmin) {
      alert('Süper Admin silinemez!');
      return;
    }
    if (!window.confirm(`${user.name} ${user.surname} kullanıcısını silmek istediğinize emin misiniz?`)) return;
    
    setIsProcessing(user.id!);
    try {
      await dbService.users.delete(user.id!);
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Kullanıcı Silme', `${user.name} ${user.surname} kullanıcısı sistemden silindi.`);
      await fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleToggleRole = async (user: SystemUser) => {
    if (user.isSuperAdmin) return;
    if (isProcessing) return;
    setIsProcessing(user.id!);
    try {
      const newRole = user.role === 'admin' ? 'staff' : 'admin';
      await dbService.users.update(user.id!, { role: newRole });
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Kullanıcı Rol Değiştirme', `${user.name} ${user.surname} kullanıcısının rolü ${newRole === 'admin' ? 'Yönetici' : 'Personel'} olarak güncellendi.`);
      await fetchUsers();
    } catch (err) {
      console.error('Error updating role:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  const filteredUsers = users.filter(u => {
    const name = (u.name || '').toLowerCase();
    const surname = (u.surname || '').toLowerCase();
    const tcNo = (u.tcNo || '');
    const email = (u.email || '').toLowerCase();
    const search = searchTerm.toLowerCase();

    return (
      `${name} ${surname}`.includes(search) ||
      tcNo.includes(search) ||
      email.includes(search) ||
      (u.role || '').toLowerCase().includes(search)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Yetkili Personel Yönetimi</h2>
          <p className="text-gray-500 text-sm">Sisteme kayıtlı personellerin yetki ve onay durumlarını yönetin.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {currentUser.isSuperAdmin && (
            <button
              onClick={async () => {
                if (confirm('Tüm hane ve personel kayıtları silinecek ve yerlerine gerçekçi örnek veriler yüklenecek. Onaylıyor musunuz?')) {
                  try {
                    setIsProcessing('mock-reset');
                    const response = await fetch('/api/admin/reset-mock-data', {
                      method: 'POST',
                      headers: {
                        'x-user-role': currentUser.role || '',
                        'x-user-id': currentUser.id || ''
                      }
                    });
                    const data = await response.json();
                    if (data.success) {
                      alert(data.message);
                      window.location.reload();
                    } else {
                      alert('Hata: ' + data.error);
                    }
                  } catch (err) {
                    alert('Sıfırlama sırasında bir hata oluştu.');
                  } finally {
                    setIsProcessing(null);
                  }
                }
              }}
              disabled={isProcessing === 'mock-reset'}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-rose-50 text-rose-700 px-4 py-2 rounded-xl hover:bg-rose-100 transition-all font-bold border border-rose-100 text-xs"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing === 'mock-reset' ? 'animate-spin' : ''}`} />
              SİSTEMİ SIFIRLA (MOCK DATA)
            </button>
          )}

          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Personel ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Kullanıcı Bilgileri</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-48">E-Posta</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-44">T.C. No</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-32">Rol</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-32">Durum</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest w-64 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((user) => (
                <tr key={user.id} className={`hover:bg-slate-50/50 transition-all group ${user.isSuperAdmin ? 'bg-orange-50/20' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${user.isSuperAdmin ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          {user.name} {user.surname}
                          {user.isSuperAdmin && (
                            <span className="bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">S.Admin</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{user.id?.substring(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-slate-600 font-medium">
                      {revealedItems.has(user.id!) ? user.email : '*******@****.***'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-slate-700 font-mono font-bold bg-white border border-slate-100 px-2 py-0.5 rounded w-fit">
                      {revealedItems.has(user.id!) ? user.tcNo : maskTcNo(user.tcNo)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold capitalize text-slate-600">
                    {user.role}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold">
                    {user.isApproved ? (
                      <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Aktif</span>
                    ) : (
                      <span className="text-amber-600 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bekliyor</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => toggleReveal(user.id!)}
                        className={`p-2 rounded-xl transition-all ${revealedItems.has(user.id!) ? 'text-amber-600 bg-amber-50 shadow-sm border border-amber-100' : 'text-slate-400 hover:bg-slate-100'}`}
                        title={revealedItems.has(user.id!) ? 'Gizle' : 'Göster'}
                      >
                        {revealedItems.has(user.id!) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      
                      <button
                        onClick={() => handleToggleApproval(user)}
                        disabled={isProcessing === user.id || (user.isSuperAdmin && user.id === currentUser.id)}
                        className={`p-2 rounded-xl transition-all ${
                          user.isApproved ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={user.isApproved ? 'Durdur' : 'Onayla'}
                      >
                        {user.isApproved ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                      </button>
                      
                      {!user.isSuperAdmin && (
                        <button
                          onClick={() => handleToggleRole(user)}
                          disabled={isProcessing === user.id}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title={user.role === 'admin' ? 'Personel Yap' : 'Admin Yap'}
                        >
                          <Shield className="w-5 h-5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteUser(user)}
                        disabled={isProcessing === user.id || user.isSuperAdmin}
                        className="p-2 text-red-300 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
                        title="Sil"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="bg-gray-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-gray-900 font-bold">Kullanıcı bulunamadı</h3>
          <p className="text-gray-500 text-sm">Arama kriterlerinize uygun personel kaydı mevcut değil.</p>
        </div>
      )}
    </div>
  );
}
