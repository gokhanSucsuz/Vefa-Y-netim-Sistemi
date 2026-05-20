import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { LogIn, Loader2, ShieldAlert, CheckCircle2, ShieldCheck } from 'lucide-react';
import { APP_LOGO_URL } from '../constants/logo';
import { dbLocal } from '../db';
import { useAuthStore } from '../store/useAuthStore';

export default function GoogleLogin() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore(state => state.setAuth);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const setFirebaseUser = useAuthStore.getState().setFirebaseUser;
      setFirebaseUser(result.user);

      const email = result.user.email;

      if (!email) {
        throw new Error('E-posta bilgisi alınamadı.');
      }

      // 1. Check if user is a registered system user (Admin/Superadmin)
      const systemUsers = await dbLocal.systemUsers.toArray();
      const existingUser = systemUsers.find(u => u.email === email);

      if (existingUser) {
        setAuth(existingUser);
        return;
      }

      // 3. SPECIAL CASE: If this is the ALLOWED_EMAIL, allow them to proceed to StaffLogin even if not in DB
      const ALLOWED_EMAIL = "edirnesydv@gmail.com";
      if (email.toLowerCase() === ALLOWED_EMAIL.toLowerCase()) {
        return;
      }

      // 2. Check if user is a registered and approved staff member
      const staffList = await dbLocal.staff.toArray();
      const staffMember = staffList.find(s => s.googleEmail === email);

      if (staffMember) {
        if (staffMember.resignationDate) {
          setError('Bu personel işten ayrılmış durumdadır ve sisteme giriş yetkisi bulunmamaktadır.');
          await auth.signOut();
          return;
        }

        if (!staffMember.isApproved) {
          setError('Google hesabınız sisteme kayıtlı ancak yönetici onayı bekleniyor. Lütfen yönetici ile iletişime geçin.');
          await auth.signOut();
          return;
        }

        // Create a temporary system user for the session
        setAuth({
          id: staffMember.id?.toString(),
          name: staffMember.name,
          surname: staffMember.surname,
          tcNo: staffMember.tcNo,
          email: staffMember.googleEmail || '',
          passwordHash: '',
          role: 'staff',
          createdAt: new Date().toISOString()
        });
        return;
      }

      // 3. If neither, unauthorized
      setError('Bu Google hesabı sisteme kayıtlı değil. Lütfen yetkili personelle iletişime geçin.');
      await auth.signOut();

    } catch (err: any) {
      console.error('Google login error:', err);
      setError('Google ile giriş yapılamadı. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#041226] flex flex-col items-center justify-center p-4">
      {/* Dynamic Background Light Sources */}
      <div className="absolute top-[-25%] left-[-25%] w-[80%] h-[80%] rounded-full bg-gradient-to-br from-blue-900/40 to-cyan-900/10 blur-[150px] animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-[-25%] right-[-25%] w-[80%] h-[80%] rounded-full bg-gradient-to-br from-[#0d2e5c]/40 to-blue-950/20 blur-[150px] animate-pulse-slow pointer-events-none" />

      {/* Abstract Grid Line Backdrop */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <div className="relative bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 p-8 lg:p-12 shadow-[0_32px_64px_rgba(0,0,0,0.4)] max-w-md w-full text-center transition-all duration-500 animate-float">
        <div className="flex justify-center mb-8 relative">
          <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full scale-75 animate-pulse" />
          <img 
            src={APP_LOGO_URL} 
            alt="Logo" 
            className="w-24 h-24 object-contain relative hover:scale-105 transition-transform duration-300 drop-shadow-[0_4px_12px_rgba(255,255,255,0.1)]"
            referrerPolicy="no-referrer"
          />
        </div>
        
        <h1 className="text-3xl font-black text-white tracking-tight mb-2 uppercase">EDİRNE SYDV</h1>
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-10">VEFA SOSYAL DESTEK YÖNETİM SİSTEMİ</p>

        {error && (
          <div className="mb-8 p-5 bg-red-950/40 backdrop-blur-md border border-red-500/30 text-red-200 text-xs font-bold rounded-2xl flex flex-col gap-3 text-left animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {error.includes('Google ile giriş yapılamadı') && (
              <div className="mt-2 p-3 bg-red-900/20 rounded-xl border border-red-500/10 text-red-300 font-medium">
                Not: Giriş penceresi açılmıyorsa uygulamayı <strong>yeni bir tarayıcı sekmesinde</strong> açarak tekrar deneyin.
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 to-[#0d2e5c] hover:from-blue-500 hover:to-[#163e75] text-white font-extrabold py-4.5 px-6 rounded-2xl transition-all duration-300 shadow-lg shadow-blue-500/10 hover:shadow-xl hover:shadow-blue-500/25 active:scale-98 disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-white" />
          ) : (
            <div className="flex items-center justify-center gap-3">
              <img src="https://www.gstatic.com/images/branding/product/1x/googleg_32dp.png" alt="Google" className="w-5 h-5 brightness-110 contrast-125" />
              GOOGLE HESABI İLE YETKİLENDİR
            </div>
          )}
        </button>

        <div className="mt-10 pt-8 border-t border-white/5 flex items-center justify-center gap-2 text-slate-500">
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            GÜVENLİ RESMİ PERSONEL GİRİŞ KAPISI
          </p>
        </div>
      </div>
    </div>
  );
}

