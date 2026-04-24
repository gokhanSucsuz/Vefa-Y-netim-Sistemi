import React, { useState, useEffect } from 'react';
import { User, Shield, CheckCircle, XCircle, Trash2, Loader2, Search, Mail, Phone, CreditCard, Activity } from 'lucide-react';
import { dbService } from '../db';
import { SystemUser } from '../types';

interface UserManagerProps {
  currentUser: SystemUser;
}

export default function UserManager({ currentUser }: UserManagerProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

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
      await fetchUsers();
    } catch (err) {
      console.error('Error updating role:', err);
    } finally {
      setIsProcessing(null);
    }
  };

  const filteredUsers = users.filter(u => 
    `${u.name} ${u.surname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.tcNo?.includes(searchTerm) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        
        <div className="relative w-full md:w-72">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <div 
            key={user.id} 
            className={`bg-white rounded-3xl border ${user.isSuperAdmin ? 'border-orange-200 ring-4 ring-orange-50' : 'border-gray-100'} p-6 shadow-sm hover:shadow-md transition-all relative overflow-hidden group`}
          >
            {user.isSuperAdmin && (
              <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                Süper Admin
              </div>
            )}
            
            <div className="flex items-start gap-4 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${user.isSuperAdmin ? 'bg-orange-100 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                <User className="w-6 h-6" />
              </div>
              <div className="overflow-hidden">
                <h3 className="font-bold text-gray-900 truncate">{user.name} {user.surname}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Activity className={`w-3 h-3 ${user.isApproved ? 'text-green-500' : 'text-amber-500'}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${user.isApproved ? 'text-green-600' : 'text-amber-600'}`}>
                    {user.isApproved ? 'Aktif / Onaylı' : 'Onay Bekliyor'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 mb-6">
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="truncate">{user.email || 'E-posta tanımlanmamış'}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <span>{user.tcNo}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <Shield className="w-4 h-4 text-gray-400" />
                <span className="capitalize">{user.role}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50">
              <button
                onClick={() => handleToggleApproval(user)}
                disabled={isProcessing === user.id || (user.isSuperAdmin && user.id === currentUser.id)}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  user.isApproved 
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50' 
                    : 'bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50'
                }`}
              >
                {isProcessing === user.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : user.isApproved ? (
                  <><XCircle className="w-4 h-4" /> Durdur</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Onayla</>
                )}
              </button>
              
              {!user.isSuperAdmin && (
                <button
                  onClick={() => handleToggleRole(user)}
                  disabled={isProcessing === user.id}
                  className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                  title={user.role === 'admin' ? 'Personel Yap' : 'Admin Yap'}
                >
                  <Shield className="w-4 h-4" /> {user.role === 'admin' ? 'Personel' : 'Yönetici'}
                </button>
              )}

              <button
                onClick={() => handleDeleteUser(user)}
                disabled={isProcessing === user.id || user.isSuperAdmin}
                className={`flex items-center justify-center gap-2 bg-red-50 text-red-700 hover:bg-red-100 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${user.isSuperAdmin || !user.isSuperAdmin && 'col-span-1'}`}
              >
                <Trash2 className="w-4 h-4" /> Sil
              </button>
            </div>
          </div>
        ))}
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
