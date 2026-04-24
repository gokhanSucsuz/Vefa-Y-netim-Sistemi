import React, { useState, useEffect } from 'react';
import { Cloud, Loader2, CheckCircle2, AlertCircle, LogIn, LogOut, DownloadCloud, UploadCloud, Trash2 } from 'lucide-react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { dbLocal } from '../db';

interface BackupManagerProps {
  user: any;
  onAuthChange?: (authenticated: boolean, email?: string) => void;
  isInitialLoad?: boolean;
}

export default function BackupManager({ user, onAuthChange, isInitialLoad = false }: BackupManagerProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(localStorage.getItem('lastBackupDate'));

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
    
    // STRICT SECURITY CHECK: Only edirnesydv@gmail.com can initiate backup
    if (user.email !== 'edirnesydv@gmail.com') {
      setMessage({ type: 'error', text: 'Güvenlik İhlali: Yedekleme işlemi sadece yetkili hesap (edirnesydv@gmail.com) ile yapılabilir.' });
      return;
    }

    if (!window.confirm('Veritabanını Google Drive\'a yedeklemek istediğinize emin misiniz? Verileriniz güvenli bir şekilde JSON formatında kaydedilecektir.')) {
      return;
    }

    setIsSyncing(true);
    setMessage({ type: 'success', text: 'Yedekleme hazırlanıyor...' });

    try {
      // 1. Get fresh token with Drive scope
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      
      provider.setCustomParameters({ 
        login_hint: 'edirnesydv@gmail.com',
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      
      if (result.user.email !== 'edirnesydv@gmail.com') {
        throw new Error('Güvenlik İhlali: Seçilen hesap yetkisiz.');
      }

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error('Google Drive erişim izni alınamadı.');
      }

      // 2. Fetch all data from Firestore (Decrypted via dbLocal)
      const backupData: Record<string, any[]> = {
        applicants: await dbLocal.applicants.toArray(),
        staff: await dbLocal.staff.toArray(),
        workDays: await dbLocal.workDays.toArray(),
        schedules: await dbLocal.schedules.toArray(),
        programs: await dbLocal.programs.toArray()
      };

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

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (user.email !== 'edirnesydv@gmail.com') {
      setMessage({ type: 'error', text: 'Güvenlik İhlali: Geri yükleme işlemi sadece yetkili hesap ile yapılabilir.' });
      return;
    }

    if (!window.confirm('DİKKAT: Bu işlem mevcut tüm verileri silecek ve yedek dosyasındaki verileri yükleyecektir. Devam etmek istediğinize emin misiniz?')) {
      if (e.target) e.target.value = '';
      return;
    }

    setIsSyncing(true);
    setMessage({ type: 'success', text: 'Veriler geri yükleniyor...' });

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result as string;
        const backupData = JSON.parse(content);

        // Basic validation
        const requiredKeys = ['applicants', 'staff', 'workDays', 'schedules', 'programs'];
        const hasAllKeys = requiredKeys.every(key => Array.isArray(backupData[key]));

        if (!hasAllKeys) {
          throw new Error('Geçersiz yedek dosyası formatı.');
        }

        // Restore process
        for (const key of requiredKeys) {
          // Clear collection
          await (dbLocal as any)[key].clear();
          // Bulk add
          const items = backupData[key].map((item: any) => {
            const { id, ...rest } = item;
            return rest;
          });
          await (dbLocal as any)[key].bulkAdd(items);
        }

        setMessage({ type: 'success', text: 'Veriler başarıyla geri yüklendi. Sayfa yenileniyor...' });
        setTimeout(() => window.location.reload(), 2000);

      } catch (error: any) {
        console.error('Restore error:', error);
        setMessage({ type: 'error', text: 'Geri yükleme hatası: ' + error.message });
      } finally {
        setIsSyncing(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  if (!user) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center">
        <div className="flex justify-center mb-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Cloud className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        <h3 className="text-xs font-bold text-gray-900 mb-2">Veri Yedekleme</h3>
        <p className="text-[10px] text-gray-500 mb-3">İşlem yapabilmek için Google Drive erişimi gereklidir.</p>
        <button
          onClick={handleLogin}
          disabled={isSyncing}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-[10px] font-bold transition-colors disabled:opacity-50"
        >
          {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
          Google ile Bağlan
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-100 p-2 rounded-lg">
            <DownloadCloud className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Veri Yedekleme</h3>
            <p className="text-[10px] text-gray-500 font-medium">Google Drive Güvenli Yedek</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-2 h-2 bg-green-500 rounded-full shrink-0" />
            <span className="text-xs text-gray-600 font-medium truncate whitespace-nowrap">
              {user ? user.email : 'Bağlı Değil'}
            </span>
          </div>
        </div>

        {user && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <button
              onClick={handleManualBackup}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
              Drive'a Yedekle
            </button>
            
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleRestore}
                disabled={isSyncing}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                title="Yedekten Geri Yükle"
              />
              <button
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                Dosyadan Yükle
              </button>
            </div>

            {lastBackupDate && (
              <div className="mt-2 text-center">
                <p className="text-[9px] text-gray-400 font-medium">
                  Son Yedek: {new Date(lastBackupDate).toLocaleDateString('tr-TR')}
                </p>
                {(() => {
                  const days = Math.floor((new Date().getTime() - new Date(lastBackupDate).getTime()) / (1000 * 3600 * 24));
                  if (days >= 10) {
                    return (
                      <p className="text-[9px] text-red-500 font-bold animate-pulse mt-0.5">
                        DİKKAT: YEDEKLEME SÜRESİ GEÇTİ ({days} GÜN)
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
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
