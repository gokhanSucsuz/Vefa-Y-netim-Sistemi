import React, { useState, useEffect } from 'react';
import { Cloud, Loader2, CheckCircle2, AlertCircle, LogIn, LogOut, DownloadCloud, UploadCloud, Trash2 } from 'lucide-react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { dbLocal } from '../db';

interface BackupManagerProps {
  user: any;
  isInitialLoad?: boolean;
}

export default function BackupManager({ user, isInitialLoad = false }: BackupManagerProps) {
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
      provider.addScope('https://www.googleapis.com/auth/drive.appdata');
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
      provider.addScope('https://www.googleapis.com/auth/drive.appdata');
      
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

      // 3. Find or create the "vefa-yonetim-sistemi" folder
      const folderName = 'vefa-yonetim-sistemi';
      let folderId = null;

      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!searchResponse.ok) {
        throw new Error('Klasör aranırken hata oluştu.');
      }

      const searchData = await searchResponse.json();
      
      if (searchData.files && searchData.files.length > 0) {
        folderId = searchData.files[0].id;
      } else {
        // Create the folder
        const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
          })
        });

        if (!createResponse.ok) {
          throw new Error('Klasör oluşturulamadı.');
        }

        const createData = await createResponse.json();
        folderId = createData.id;
      }

      // 4. Upload to Google Drive using multipart/related
      const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: [folderId],
      };

      const boundary = '-------314159265358979323846';
      const delimiter = '\r\n--' + boundary + '\r\n';
      const closeDelim = '\r\n--' + boundary + '--';

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        fileContent +
        closeDelim;

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Google Drive yükleme hatası: ${errorData.error?.message || response.statusText}`);
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
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-10 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100 shadow-sm">
            <DownloadCloud className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">Sistem Veri Yedekleme</h2>
            <p className="text-sm text-gray-500 font-medium">Sistem verilerini Google Drive'a güvenle yedekleyin.</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full shrink-0 ${user ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-700 font-medium whitespace-nowrap">
              Google Drive Bağlantısı: {user ? user.email : 'Bağlı Değil'}
            </span>
          </div>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleManualBackup}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-md shadow-blue-100 disabled:opacity-50"
              >
                {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
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
                  className="w-full flex items-center justify-center gap-3 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-4 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                  Dosyadan Geri Yükle
                </button>
              </div>
            </div>

            {lastBackupDate && (
              <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100 text-center">
                <p className="text-sm text-gray-500 font-medium">
                  Son Yedekleme Tarihi: <span className="font-bold text-gray-800">{new Date(lastBackupDate).toLocaleDateString('tr-TR')}</span>
                </p>
                {(() => {
                  const days = Math.floor((new Date().getTime() - new Date(lastBackupDate).getTime()) / (1000 * 3600 * 24));
                  if (days >= 10) {
                    return (
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100 text-red-600 text-sm font-bold flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        DİKKAT: YEDEKLEME SÜRESİ GEÇTİ ({days} GÜN). LÜTFEN BİR YEDEK ALIN!
                      </div>
                    );
                  } else {
                    return (
                      <div className="mt-3 text-xs text-green-600 font-medium">
                        Sistem yedeği güncel. Yeniden yedek almak için kalan süre: {10 - days} gün.
                      </div>
                    );
                  }
                })()}
              </div>
            )}
            
            {!lastBackupDate && (
              <div className="mt-6 p-4 bg-orange-50 rounded-xl border border-orange-100 text-center">
                 <div className="mt-1 text-sm text-orange-700 font-bold flex items-center justify-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Henüz hiç yedek alınmamış. Lütfen güvenliğiniz için yedek alın.
                 </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-gray-50 rounded-2xl border border-gray-100">
            <LogIn className="w-8 h-8 text-gray-400" />
            <p className="text-sm text-gray-500 text-center">Yedekleme yapabilmek için Google hesabınızla giriş yapmalısınız.</p>
            <button
               onClick={handleLogin}
               className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-50 transition-all flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Google ile Giriş Yap
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className={`mt-6 flex items-center gap-2 p-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          {message.text}
        </div>
      )}
    </div>
  );
}
