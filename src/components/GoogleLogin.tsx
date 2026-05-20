import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { LogIn, Loader2, ShieldAlert, CheckCircle2 } from 'lucide-react';
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
      // This is crucial for the first-time setup or for the main admin account.
      const ALLOWED_EMAIL = "edirnesydv@gmail.com";
      if (email.toLowerCase() === ALLOWED_EMAIL.toLowerCase()) {
        // We return and let App.tsx show StaffLogin
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
    <div className="min-h-screen relative overflow-hidden bg-slate-50 flex flex-col items-center justify-center p-4">
      {/* Ambient decorative gradient backgrounds */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-blue-600/10 to-indigo-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-indigo-600/10 to-blue-600/5 blur-[120px] pointer-events-none" />

      <div className="relative bg-white/75 backdrop-blur-xl rounded-[2rem] border border-white/80 p-8 lg:p-10 shadow-[0_20px_50px_rgba(8,33,66,0.05)] max-w-sm w-full text-center transition-all duration-500">
        <div className="flex justify-center mb-6">
          <img 
            src={APP_LOGO_URL} 
            alt="Logo" 
            className="w-20 h-20 object-contain hover:scale-105 transition-transform duration-300"
            referrerPolicy="no-referrer"
          />
        </div>
        
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-2">Edirne SYDV Vefa</h2>
        <p className="text-gray-500 text-sm font-medium mb-8">Vefa Sosyal Destek Yönetim Sistemi Girişi</p>

        {error && (
          <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border border-red-100 text-red-600 text-xs font-bold rounded-2xl flex flex-col gap-3 text-left animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {error.includes('Google ile giriş yapılamadı') && (
              <div className="mt-2 p-2 bg-white rounded-lg border border-red-200 text-red-500 font-medium">
                Not: Iframe kısıtlamaları nedeniyle giriş penceresi açılmıyor olabilir. Lütfen uygulamayı <strong>yeni sekmede açarak</strong> tekrar deneyin.
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200/80 hover:border-blue-200 hover:bg-blue-50/50 text-slate-700 font-bold py-4 px-4 rounded-2xl transition-all shadow-[0_4px_12px_rgba(0,0,0,0.02)] active:scale-98 disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          ) : (
            <div className="flex items-center justify-center gap-3">
              <img src="https://www.gstatic.com/images/branding/product/1x/googleg_32dp.png" alt="Google" className="w-5 h-5" />
              Google İle Giriş Yap
            </div>
          )}
        </button>

        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Resmi Personel Giriş Kapısı
          </p>
        </div>
      </div>
    </div>
  );
}
