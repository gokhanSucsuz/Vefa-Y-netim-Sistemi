import React, { useState, useEffect } from 'react';
import { Shield, User, Lock, LogIn, Loader2, UserPlus, CreditCard, Mail, Phone, Save, LogOut } from 'lucide-react';
import { dbService } from '../db';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { SystemUser } from '../types';
import CryptoJS from 'crypto-js';

interface StaffLoginProps {
  onLogin: (user: SystemUser) => void;
}

export default function StaffLogin({ onLogin }: StaffLoginProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'select' | 'login' | 'register'>('select');
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Registration form state
  const [regData, setRegData] = useState({
    name: '',
    surname: '',
    tcNo: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    fetchUsersAndCheckGoogle();
  }, [firebaseUser]);

  const fetchUsersAndCheckGoogle = async () => {
    setLoading(true);
    try {
      const usersList = await dbService.users.toArray();
      setUsers(usersList as any);

      if (firebaseUser?.email) {
        // 1. Check if user is already a SystemUser with this email
        const existingSystemUser = usersList.find(u => u.email.toLowerCase() === firebaseUser.email.toLowerCase());
        
        if (existingSystemUser) {
          if (existingSystemUser.isApproved) {
            onLogin(existingSystemUser);
            return;
          } else {
            setError('Hesabınız onay bekliyor. Lütfen yöneticinizle iletişime geçin.');
            setMode('select');
          }
        } else {
          // 2. Check if user is a Staff member with this googleEmail
          const staffList = await dbService.staff.toArray();
          const staffMember = staffList.find(s => s.googleEmail?.toLowerCase() === firebaseUser.email.toLowerCase());

          if (staffMember) {
            if (staffMember.isApproved) {
              // Create a temporary system user for this session or add to users table
              const staffUser: SystemUser = {
                id: staffMember.id,
                name: staffMember.name,
                surname: staffMember.surname,
                tcNo: staffMember.tcNo,
                email: firebaseUser.email,
                passwordHash: '', // Not needed for Google login
                role: 'staff',
                isApproved: true,
                createdAt: new Date().toISOString()
              };
              onLogin(staffUser);
              return;
            } else {
              setError('Personel kaydınız onay bekliyor.');
              setMode('select');
            }
          }
        }
      }

      if (usersList.length === 0) {
        setMode('register');
      } else {
        setMode('select');
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Kullanıcı listesi alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsSubmitting(true);
    setError(null);

    const hash = CryptoJS.SHA256(password).toString();
    if (hash === selectedUser.passwordHash) {
      if (!selectedUser.isApproved) {
        setError('Hesabınız henüz onaylanmamıştır. Lütfen Süper Admin onayı bekleyin.');
        setIsSubmitting(false);
        return;
      }
      onLogin(selectedUser);
    } else {
      setError('Hatalı şifre.');
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regData.password !== regData.confirmPassword) {
      setError('Şifreler uyuşmuyor.');
      return;
    }
    if (regData.tcNo.length !== 11) {
      setError('T.C. Kimlik No 11 haneli olmalıdır.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Check if TC already exists
      const existing = await dbService.users.where('tcNo').equals(regData.tcNo).toArray();
      if (existing.length > 0) {
        setError('Bu T.C. Kimlik No ile kayıtlı bir kullanıcı zaten var.');
        setIsSubmitting(false);
        return;
      }

      const isFirstUser = users.length === 0;

      const newUser: Omit<SystemUser, 'id'> = {
        name: regData.name,
        surname: regData.surname,
        tcNo: regData.tcNo,
        email: regData.email,
        passwordHash: CryptoJS.SHA256(regData.password).toString(),
        role: isFirstUser ? 'superadmin' : 'staff',
        isApproved: isFirstUser, 
        isSuperAdmin: isFirstUser,
        createdAt: new Date().toISOString(),
      };

      const id = await dbService.users.add(newUser as any);
      
      if (isFirstUser) {
        const fullUser = { id, ...newUser };
        onLogin(fullUser);
      } else {
        setError('Kaydınız alındı. Giriş yapabilmek için Süper Admin onayı gerekmektedir.');
        setIsSubmitting(false);
        setMode('select');
        fetchUsersAndCheckGoogle();
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Kayıt sırasında bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Google çıkış hatası:', err);
      setError('Oturum kapatılırken bir hata oluştu.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-xl max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-2xl">
            <Shield className="w-10 h-10 text-blue-600" />
          </div>
        </div>

        {mode === 'select' && (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Kullanıcı Seçimi</h2>
            <p className="text-gray-500 text-sm mb-6">Lütfen işlem yapacak personeli seçiniz.</p>
            
            <div className="space-y-3 mb-6">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedUser(u);
                    setMode('login');
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-2xl transition-all group"
                >
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-gray-100 group-hover:border-blue-200">
                    <User className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-900 flex items-center gap-2">
                      {u.name} {u.surname}
                      {u.isSuperAdmin && (
                        <span className="bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">S.Admin</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">{u.role === 'admin' ? 'Yönetici' : 'Personel'}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => setMode('register')}
                className="flex items-center justify-center gap-2 text-blue-600 font-bold text-sm hover:underline"
              >
                <UserPlus className="w-4 h-4" />
                Yeni Personel Kaydı
              </button>

              <div className="h-px bg-gray-100 my-2" />

              <button
                onClick={handleGoogleLogout}
                className="flex items-center justify-center gap-2 text-red-600 font-bold text-sm hover:bg-red-50 py-3 rounded-xl transition-all"
              >
                <LogOut className="w-4 h-4" />
                Google Hesabından Çıkış Yap
              </button>
            </div>
          </div>
        )}

        {mode === 'login' && selectedUser && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">{selectedUser.name} {selectedUser.surname}</h2>
              <p className="text-gray-500 text-sm mt-1">Lütfen şifrenizi giriniz.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl text-center">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-200"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                Giriş Yap
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('select');
                  setPassword('');
                  setError(null);
                }}
                className="text-gray-500 font-bold text-sm py-2"
              >
                Geri Dön
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Personel Kaydı</h2>
              <p className="text-gray-500 text-sm mt-1">Sisteme yeni personel tanımlayın.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Ad</label>
                <input
                  type="text"
                  required
                  value={regData.name}
                  onChange={e => setRegData({ ...regData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Ad"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Soyad</label>
                <input
                  type="text"
                  required
                  value={regData.surname}
                  onChange={e => setRegData({ ...regData, surname: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Soyad"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">T.C. Kimlik No</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  required
                  maxLength={11}
                  value={regData.tcNo}
                  onChange={e => setRegData({ ...regData, tcNo: e.target.value.replace(/\D/g, '') })}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="11 Haneli T.C. No"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">E-Posta</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  required
                  value={regData.email}
                  onChange={e => setRegData({ ...regData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="eposta@adres.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Şifre</label>
                <input
                  type="password"
                  required
                  value={regData.password}
                  onChange={e => setRegData({ ...regData, password: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Şifre Tekrar</label>
                <input
                  type="password"
                  required
                  value={regData.confirmPassword}
                  onChange={e => setRegData({ ...regData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl text-center">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-200"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Kaydı Tamamla
              </button>
              {users.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="text-gray-500 font-bold text-sm py-2"
                >
                  Geri Dön
                </button>
              )}
            </div>
          </form>
        )}
        
        <div className="mt-8 pt-6 border-t border-gray-50 text-center">
          <p className="text-[10px] text-gray-400 font-medium tracking-wide">
            Sistem Tasarım ve Yönetim: <span className="text-gray-500">Gökhan SUÇSUZ</span>
          </p>
        </div>
      </div>
    </div>
  );
}
