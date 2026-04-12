import { useState, useEffect } from 'react';
import { Cloud, Loader2, CheckCircle2, AlertCircle, LogIn, LogOut, DownloadCloud } from 'lucide-react';
import { auth, db } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';

interface BackupManagerProps {
  onAuthChange?: (authenticated: boolean, email?: string) => void;
  isInitialLoad?: boolean;
}

export default function BackupManager({ onAuthChange, isInitialLoad = false }: BackupManagerProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [user, setUser] = useState<any>(null);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(localStorage.getItem('lastBackupDate'));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (onAuthChange) {
        onAuthChange(!!currentUser, currentUser?.email || undefined);
      }
    });
    return () => unsubscribe();
  }, [onAuthChange]);

  // Check for auto-backup every time user logs in or app loads
  useEffect(() => {
    if (user && user.email === 'edirnesydv@gmail.com') {
      const checkAutoBackup = async () => {
        const lastBackup = localStorage.getItem('lastBackupDate');
        if (!lastBackup) {
          // No backup ever, let's wait for manual trigger or we can trigger it.
          return;
        }
        const lastBackupTime = new Date(lastBackup).getTime();
        const now = new Date().getTime();
        const daysSinceLastBackup = (now - lastBackupTime) / (1000 * 3600 * 24);

        if (daysSinceLastBackup >= 10) {
          // We need a fresh token for Drive API. We can't automatically get it without user interaction
          // if the scopes weren't granted recently. We'll prompt the user or just show a warning.
          setMessage({ type: 'error', text: 'Son yedeklemenin üzerinden 10 günden fazla geçti. Lütfen manuel yedekleme yapın.' });
        }
      };
      checkAutoBackup();
    }
  }, [user]);

  const handleLogin = async () => {
    setIsSyncing(true);
    setMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      // Add Drive scope for backup
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      setMessage({ type: 'error', text: 'Giriş yapılamadı: ' + error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    setIsSyncing(true);
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error('Logout error:', error);
      setMessage({ type: 'error', text: 'Çıkış yapılamadı.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualBackup = async () => {
    if (!user) return;
    setIsSyncing(true);
    setMessage({ type: 'success', text: 'Yedekleme hazırlanıyor...' });

    try {
      // 1. Get fresh token with Drive scope
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error('Google Drive erişim izni alınamadı.');
      }

      // 2. Fetch all data from Firestore
      const collections = ['applicants', 'staff', 'workDays', 'schedules', 'programs'];
      const backupData: Record<string, any[]> = {};

      for (const colName of collections) {
        const querySnapshot = await getDocs(collection(db, colName));
        backupData[colName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      const fileContent = JSON.stringify(backupData, null, 2);
      const fileName = `vefa_yedek_${new Date().toISOString().split('T')[0]}.json`;

      // 3. Upload to Google Drive
      const metadata = {
        name: fileName,
        mimeType: 'application/json',
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (!response.ok) {
        throw new Error('Google Drive\'a yükleme başarısız oldu.');
      }

      const now = new Date().toISOString();
      localStorage.setItem('lastBackupDate', now);
      setLastBackupDate(now);
      setMessage({ type: 'success', text: 'Yedekleme Google Drive\'a başarıyla kaydedildi.' });

    } catch (error: any) {
      console.error('Backup error:', error);
      setMessage({ type: 'error', text: 'Yedekleme hatası: ' + error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  if (isInitialLoad) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-lg max-w-md w-full mx-auto text-center mt-20">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full">
            <Cloud className="w-10 h-10 text-blue-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Edirne SYDV Vefa</h2>
        
        {!user ? (
          <>
            <p className="text-gray-500 mb-8">Sisteme erişmek için yetkili hesap ile giriş yapmalısınız.</p>
            <button
              onClick={handleLogin}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              Google ile Giriş Yap
            </button>
          </>
        ) : (
          <>
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 text-sm">
              <p className="font-bold mb-1">Yetkisiz Hesap</p>
              <p>{user.email} hesabının bu sisteme erişim yetkisi yoktur. Lütfen yetkili hesap ile giriş yapın.</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-3 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
              Farklı Hesapla Giriş Yap
            </button>
          </>
        )}

        {message && (
          <div className={`mt-4 p-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Cloud className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Bulut Veritabanı</h3>
            <p className="text-[10px] text-gray-500 font-medium">Firestore Senkronizasyonu</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-xs text-gray-600 font-medium truncate">
              {user ? user.email : 'Bağlı Değil'}
            </span>
          </div>
          {user && (
            <button
              onClick={handleLogout}
              disabled={isSyncing}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Çıkış Yap"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </button>
          )}
        </div>

        {user && user.email === 'edirnesydv@gmail.com' && (
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={handleManualBackup}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
              Drive'a Yedekle
            </button>
            {lastBackupDate && (
              <p className="text-[9px] text-gray-400 text-center mt-2">
                Son Yedek: {new Date(lastBackupDate).toLocaleDateString('tr-TR')}
              </p>
            )}
          </div>
        )}
      </div>

      {message && (
        <div className={`mt-3 flex items-center gap-2 p-2 rounded-lg text-[10px] font-bold uppercase ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {message.text}
        </div>
      )}
    </div>
  );
}
