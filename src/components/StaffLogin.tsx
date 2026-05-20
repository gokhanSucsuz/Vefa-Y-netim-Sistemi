import React, { useState, useEffect } from 'react';
import { Shield, User, Lock, LogIn, Loader2, UserPlus, CreditCard, Mail, Phone, Save, LogOut } from 'lucide-react';
import { dbService } from '../db';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { User as FirebaseUser } from 'firebase/auth';
import { SystemUser } from '../types';
import CryptoJS from 'crypto-js';

interface StaffLoginProps {
  onLogin: (user: SystemUser) => void;
  firebaseUser: FirebaseUser | null;
}

export default function StaffLogin({ onLogin, firebaseUser }: StaffLoginProps) {
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
      const staffList = await dbService.staff.toArray();

      // Filter out users who have corresponding staff record with a resignation date
      const nonResignedUsers = usersList.filter(u => {
        const staffMember = staffList.find(s => s.tcNo === u.tcNo);
        return !staffMember?.resignationDate;
      });
      setUsers(nonResignedUsers as any);

      if (firebaseUser?.email) {
        // 1. Check if user is already a SystemUser with this email
        const existingSystemUser = usersList.find(u => u.email.toLowerCase() === firebaseUser.email.toLowerCase());
        
        if (existingSystemUser) {
          const staffMember = staffList.find(s => s.tcNo === existingSystemUser.tcNo);
          if (staffMember?.resignationDate) {
            setError('Bu personel işten ayrılmış durumdadır ve sisteme giriş yetkisi bulunmamaktadır.');
            setMode('select');
            await signOut(auth);
            return;
          }

          if (existingSystemUser.isApproved) {
            onLogin(existingSystemUser);
            return;
          } else {
            setError('Hesabınız onay bekliyor. Lütfen yöneticinizle iletişime geçin.');
            setMode('select');
          }
        } else {
          // 2. Check if user is a Staff member with this googleEmail
          const staffMember = staffList.find(s => s.googleEmail?.toLowerCase() === firebaseUser.email.toLowerCase());

          if (staffMember) {
            if (staffMember.resignationDate) {
              setError('Bu personel işten ayrılmış durumdadır ve sisteme giriş yetkisi bulunmamaktadır.');
              setMode('select');
              await signOut(auth);
              return;
            }

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

    const staffList = await dbService.staff.toArray();
    const staffMember = staffList.find(s => s.tcNo === selectedUser.tcNo);
    if (staffMember?.resignationDate) {
      setError('Bu personel işten ayrılmış durumdadır ve sisteme giriş yetkisi bulunmamaktadır.');
      setIsSubmitting(false);
      return;
    }

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
      const allUsers = await dbService.users.toArray();
      const existing = allUsers.filter(u => u.tcNo === regData.tcNo);
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
    <div className="min-h-screen relative overflow-hidden bg-[#041226] flex items-center justify-center p-4">
      {/* Dynamic Background Light Sources */}
      <div className="absolute top-[-25%] left-[-25%] w-[80%] h-[80%] rounded-full bg-gradient-to-br from-blue-900/40 to-cyan-900/10 blur-[150px] animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-[-25%] right-[-25%] w-[80%] h-[80%] rounded-full bg-gradient-to-br from-[#0d2e5c]/40 to-blue-950/20 blur-[150px] animate-pulse-slow pointer-events-none" />

      {/* Abstract Grid Line Backdrop */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <div className="relative bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 p-8 lg:p-12 shadow-[0_32px_64px_rgba(0,0,0,0.4)] max-w-md w-full transition-all duration-500 animate-float">
        <div className="flex justify-center mb-8 relative">
          <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full scale-75 animate-pulse" />
          <div className="bg-white/10 p-5 rounded-[1.5rem] border border-white/10 shadow-lg relative">
            <Shield className="w-12 h-12 text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.2)]" />
          </div>
        </div>

        {mode === 'select' && (
          <div className="text-center animate-in fade-in duration-300">
            <h2 className="text-3xl font-black text-white tracking-tight mb-2 uppercase">KULLANICI SEÇİMİ</h2>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-8">İşlem yapacak personeli seçiniz</p>
            
            <div className="space-y-4 mb-8 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedUser(u);
                    setMode('login');
                  }}
                  className="w-full flex items-center gap-4 p-4.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-2xl transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 group active:scale-98 cursor-pointer"
                >
                  <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-all shrink-0">
                    <User className="w-5 h-5 text-slate-300 group-hover:text-white" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-bold text-white flex items-center gap-2 truncate">
                      {u.name} {u.surname}
                      {u.isSuperAdmin && (
                        <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter shrink-0 shadow-md shadow-orange-500/20">S.Admin</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">{u.role === 'admin' ? 'YÖNETİCİ' : 'PERSONEL'}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => setMode('register')}
                className="flex items-center justify-center gap-2 text-white font-extrabold text-sm hover:text-blue-400 transition-colors cursor-pointer py-2"
              >
                <UserPlus className="w-4 h-4" />
                YENİ PERSONEL KAYDI
              </button>

              <div className="h-px bg-white/5 my-2" />

              <button
                onClick={handleGoogleLogout}
                className="flex items-center justify-center gap-2 text-red-400 font-extrabold text-sm hover:text-red-300 hover:bg-red-950/20 py-3 rounded-xl transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                GOOGLE HESABINDAN ÇIKIŞ YAP
              </button>
            </div>
          </div>
        )}

        {mode === 'login' && selectedUser && (
          <form onSubmit={handleLogin} className="space-y-6 animate-in fade-in duration-300">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-white tracking-tight uppercase">{selectedUser.name} {selectedUser.surname}</h2>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-2">Lütfen şifrenizi giriniz</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">ŞİFRE</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-4 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 hover:border-white/20 focus:border-blue-500 rounded-2xl text-sm text-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-300"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-950/40 backdrop-blur-md border border-red-500/20 text-red-300 text-xs font-bold rounded-2xl text-center">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-[#0d2e5c] hover:from-blue-500 hover:to-[#163e75] text-white py-4.5 rounded-2xl font-extrabold transition-all duration-300 disabled:opacity-50 shadow-lg shadow-blue-500/10 hover:shadow-xl hover:shadow-blue-500/25 active:scale-98 cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                SİSTEME GİRİŞ YAP
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('select');
                  setPassword('');
                  setError(null);
                }}
                className="text-slate-400 hover:text-white font-extrabold text-xs uppercase tracking-wider py-2 cursor-pointer transition-colors"
              >
                KULLANICI SEÇİMİNE GERİ DÖN
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in duration-300">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-white tracking-tight uppercase">PERSONEL KAYDI</h2>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-2">Sisteme yeni personel tanımlayın</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">AD</label>
                <input
                  type="text"
                  required
                  value={regData.name}
                  onChange={e => setRegData({ ...regData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 hover:border-white/20 focus:border-blue-500 rounded-2xl text-sm text-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-300"
                  placeholder="Ad"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">SOYAD</label>
                <input
                  type="text"
                  required
                  value={regData.surname}
                  onChange={e => setRegData({ ...regData, surname: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 hover:border-white/20 focus:border-blue-500 rounded-2xl text-sm text-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-300"
                  placeholder="Soyad"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">T.C. KİMLİK NO</label>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  maxLength={11}
                  value={regData.tcNo}
                  onChange={e => setRegData({ ...regData, tcNo: e.target.value.replace(/\D/g, '') })}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 hover:border-white/20 focus:border-blue-500 rounded-2xl text-sm text-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-300"
                  placeholder="11 Haneli T.C. No"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">E-POSTA</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={regData.email}
                  onChange={e => setRegData({ ...regData, email: e.target.value })}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 hover:border-white/20 focus:border-blue-500 rounded-2xl text-sm text-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-300"
                  placeholder="eposta@sydv.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">ŞİFRE</label>
                <input
                  type="password"
                  required
                  value={regData.password}
                  onChange={e => setRegData({ ...regData, password: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 hover:border-white/20 focus:border-blue-500 rounded-2xl text-sm text-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-300"
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">ŞİFRE TEKRAR</label>
                <input
                  type="password"
                  required
                  value={regData.confirmPassword}
                  onChange={e => setRegData({ ...regData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 hover:border-white/20 focus:border-blue-500 rounded-2xl text-sm text-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all duration-300"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-950/40 backdrop-blur-md border border-red-500/20 text-red-300 text-xs font-bold rounded-2xl text-center animate-pulse">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-[#0d2e5c] hover:from-blue-500 hover:to-[#163e75] text-white py-4.5 rounded-2xl font-extrabold transition-all duration-300 disabled:opacity-50 shadow-lg shadow-blue-500/10 hover:shadow-xl hover:shadow-blue-500/25 active:scale-98 cursor-pointer animate-pulse-slow"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                KAYDI TAMAMLA
              </button>
              {users.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="text-slate-400 hover:text-white font-extrabold text-xs uppercase tracking-wider py-2 cursor-pointer transition-colors"
                >
                  GERİ DÖN
                </button>
              )}
            </div>
          </form>
        )}
        
        <div className="mt-10 pt-8 border-t border-white/5 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
            SİSTEM TASARIM VE YÖNETİM: <span className="text-white font-black">GÖKHAN SUÇSUZ</span>
          </p>
        </div>
      </div>
    </div>
  );
}
