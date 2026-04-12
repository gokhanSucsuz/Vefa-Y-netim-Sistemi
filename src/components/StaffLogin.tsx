import React, { useState, useEffect } from 'react';
import { Shield, User, Lock, LogIn, Loader2, UserPlus, CreditCard, Mail, Phone, Save } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, query, where } from 'firebase/firestore';
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
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'system_users'));
      const usersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemUser));
      setUsers(usersList);
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
      // Check if TC or Email already exists
      const tcQuery = query(collection(db, 'system_users'), where('tcNo', '==', regData.tcNo));
      const tcSnap = await getDocs(tcQuery);
      if (!tcSnap.empty) {
        setError('Bu T.C. Kimlik No ile kayıtlı bir kullanıcı zaten var.');
        setIsSubmitting(false);
        return;
      }

      const newUser: Omit<SystemUser, 'id'> = {
        name: regData.name,
        surname: regData.surname,
        tcNo: regData.tcNo,
        email: regData.email,
        passwordHash: CryptoJS.SHA256(regData.password).toString(),
        role: users.length === 0 ? 'admin' : 'staff', // First user is admin
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'system_users'), newUser);
      onLogin({ id: docRef.id, ...newUser });
    } catch (err) {
      console.error('Registration error:', err);
      setError('Kayıt sırasında bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
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
                    <div className="font-bold text-gray-900">{u.name} {u.surname}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">{u.role === 'admin' ? 'Yönetici' : 'Personel'}</div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setMode('register')}
              className="flex items-center justify-center gap-2 text-blue-600 font-bold text-sm hover:underline"
            >
              <UserPlus className="w-4 h-4" />
              Yeni Personel Kaydı
            </button>
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
      </div>
    </div>
  );
}
