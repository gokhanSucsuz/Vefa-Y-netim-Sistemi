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

      // 2. Check if user is a registered and approved staff member
      const staffList = await dbLocal.staff.toArray();
      const staffMember = staffList.find(s => s.googleEmail === email);

      if (staffMember) {
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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-xl max-w-sm w-full text-center">
        <div className="flex justify-center mb-6">
          <img 
            src={APP_LOGO_URL} 
            alt="Logo" 
            className="w-20 h-20 object-contain"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Edirne SYDV Vefa</h2>
        <p className="text-gray-500 text-sm mb-8">Vefa Sosyal Destek Yönetim Sistemi Girişi</p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-2xl flex items-start gap-3 text-left">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 hover:border-blue-100 hover:bg-blue-50 text-gray-700 font-bold py-4 px-4 rounded-2xl transition-all shadow-sm disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          ) : (
            <>
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google İle Giriş Yap
            </>
          )}
        </button>

        <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Resmi Personel Giriş Kapısı
          </p>
        </div>
      </div>
    </div>
  );
}
