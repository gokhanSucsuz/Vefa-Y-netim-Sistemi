import { useState, useEffect, useCallback } from 'react';
import { Cloud, CloudUpload, CloudDownload, LogIn, LogOut, Loader2, CheckCircle2, AlertCircle, Building2, ShieldCheck, History, RotateCcw } from 'lucide-react';
import { dbLocal } from '../db';
import { saveSafetyBackup, getLatestRecoveryBackup } from '../lib/autoBackup';

interface BackupManagerProps {
  onAuthChange?: (authenticated: boolean, email?: string) => void;
  isInitialLoad?: boolean;
}

export default function BackupManager({ onAuthChange, isInitialLoad = false }: BackupManagerProps) {
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean; email?: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recoveryBackup, setRecoveryBackup] = useState<any>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => {
    const saved = localStorage.getItem('autoSyncEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('autoSyncEnabled', JSON.stringify(autoSyncEnabled));
  }, [autoSyncEnabled]);

  const checkRecovery = useCallback(async () => {
    const backup = await getLatestRecoveryBackup();
    setRecoveryBackup(backup);
  }, []);

  useEffect(() => {
    checkRecovery();
  }, [checkRecovery]);

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      
      if (!res.ok) {
        throw new Error(`Auth status check failed with status ${res.status}`);
      }
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Auth status check returned non-JSON response');
      }

      const data = await res.json();
      setAuthStatus(data);
      if (onAuthChange) onAuthChange(data.authenticated, data.email);
      
      // Auto-restore on initial login if authenticated, local database is empty, and auto-sync is enabled
      if (data.authenticated && isInitialLoad && autoSyncEnabled) {
        const applicantsCount = await dbLocal.applicants.count();
        if (applicantsCount === 0) {
          handleRestore(true);
        }
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      const failStatus = { authenticated: false };
      setAuthStatus(failStatus);
      if (onAuthChange) onAuthChange(false);
    }
  }, [onAuthChange, isInitialLoad, autoSyncEnabled]);

  useEffect(() => {
    checkAuthStatus();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const newStatus = { authenticated: true, email: event.data.email };
        setAuthStatus(newStatus);
        if (onAuthChange) onAuthChange(true, event.data.email);
        setMessage({ type: 'success', text: 'Giriş başarılı. Veriler kontrol ediliyor...' });
        
        // Auto-restore after login ONLY if database is empty and auto-sync is enabled
        if (autoSyncEnabled) {
          dbLocal.applicants.count().then(count => {
            if (count === 0) {
              handleRestore(true);
            }
          });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkAuthStatus, onAuthChange, autoSyncEnabled]);

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Giriş sayfası açılamadı.');
      }
      
      window.open(data.url, 'google_oauth', 'width=600,height=700');
    } catch (error: any) {
      console.error('Login failed:', error);
      setMessage({ type: 'error', text: error.message || 'Giriş sayfası açılamadı.' });
    }
  };

  const handleLogout = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setMessage({ type: 'success', text: 'Veriler yedekleniyor ve çıkış yapılıyor...' });
    
    try {
      // Auto-backup before logout
      await performBackup();
      await fetch('/api/auth/logout', { method: 'POST' });
      setAuthStatus({ authenticated: false });
      if (onAuthChange) onAuthChange(false);
      setMessage({ type: 'success', text: 'Güvenli çıkış yapıldı.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Çıkış sırasında bir hata oluştu.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const performBackup = async () => {
    const applicants = await dbLocal.applicants.toArray();
    const staff = await dbLocal.staff.toArray();
    const workDays = await dbLocal.workDays.toArray();
    const schedules = await dbLocal.schedules.toArray();
    const programs = await dbLocal.programs.toArray();

    const backupData = {
      applicants,
      staff,
      workDays,
      schedules,
      programs,
      exportedAt: new Date().toISOString()
    };

    const res = await fetch('/api/drive/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'edirne_sydv_vefa_backup.json',
        data: backupData
      })
    });

    if (!res.ok) {
      const result = await res.json();
      throw new Error(result.error || 'Yedekleme başarısız.');
    }
    return true;
  };

  const handleBackup = async () => {
    if (!authStatus?.authenticated) return;
    setIsSyncing(true);
    setMessage(null);

    try {
      await performBackup();
      setMessage({ type: 'success', text: 'Veriler Google Drive\'a başarıyla yedeklendi.' });
    } catch (error: any) {
      console.error('Backup failed:', error);
      setMessage({ type: 'error', text: error.message || 'Yedekleme başarısız oldu.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestore = async (isAuto = false) => {
    if (!authStatus?.authenticated) return;
    if (!isAuto && !confirm('Mevcut yerel verileriniz silinecek ve yedekten geri yüklenecek. Emin misiniz?')) return;

    setIsSyncing(true);
    if (!isAuto) setMessage(null);

    try {
      // 1. Save safety backup BEFORE restoring
      if (!isAuto) {
        setMessage({ type: 'success', text: 'Güvenlik yedeği alınıyor...' });
        await saveSafetyBackup();
      }

      const res = await fetch('/api/drive/restore?filename=edirne_sydv_vefa_backup.json');
      if (!res.ok) {
        if (res.status === 404) {
          if (!isAuto) throw new Error('Yedek dosyası bulunamadı.');
          return; // Silent skip for auto-restore if no backup exists yet
        }
        throw new Error('Geri yükleme başarısız.');
      }

      const backupData = await res.json();

      await dbLocal.transaction('rw', [dbLocal.applicants, dbLocal.staff, dbLocal.workDays, dbLocal.schedules, dbLocal.programs], async () => {
        await dbLocal.applicants.clear();
        await dbLocal.staff.clear();
        await dbLocal.workDays.clear();
        await dbLocal.schedules.clear();
        await dbLocal.programs.clear();

        if (backupData.applicants) await dbLocal.applicants.bulkAdd(backupData.applicants);
        if (backupData.staff) await dbLocal.staff.bulkAdd(backupData.staff);
        if (backupData.workDays) await dbLocal.workDays.bulkAdd(backupData.workDays);
        if (backupData.schedules) await dbLocal.schedules.bulkAdd(backupData.schedules);
        if (backupData.programs) await dbLocal.programs.bulkAdd(backupData.programs);
      });

      setMessage({ type: 'success', text: 'Veriler senkronize edildi.' });
      if (!isAuto) setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Restore failed:', error);
      if (!isAuto) setMessage({ type: 'error', text: error.message || 'Geri yükleme başarısız oldu.' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Global auto-save on tab close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (authStatus?.authenticated) {
        // We can't reliably wait for fetch in beforeunload, 
        // but we can try to trigger a sync or warn the user.
        // Modern browsers don't allow custom messages anymore.
        // The best we can do is a periodic auto-save (implemented below).
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [authStatus]);

  // Periodic auto-save every 5 minutes
  useEffect(() => {
    if (!authStatus?.authenticated) return;
    const interval = setInterval(() => {
      performBackup().catch(console.error);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [authStatus]);

  const handleRecoveryRestore = async () => {
    if (!recoveryBackup) return;
    if (!confirm('Son otomatik yedekleme geri yüklenecek. Mevcut verileriniz silinecek. Emin misiniz?')) return;

    setIsSyncing(true);
    setMessage({ type: 'success', text: 'Kurtarma yedeği yükleniyor...' });

    try {
      const backupData = recoveryBackup.data;

      await dbLocal.transaction('rw', [dbLocal.applicants, dbLocal.staff, dbLocal.workDays, dbLocal.schedules, dbLocal.programs], async () => {
        await dbLocal.applicants.clear();
        await dbLocal.staff.clear();
        await dbLocal.workDays.clear();
        await dbLocal.schedules.clear();
        await dbLocal.programs.clear();

        if (backupData.applicants) await dbLocal.applicants.bulkAdd(backupData.applicants);
        if (backupData.staff) await dbLocal.staff.bulkAdd(backupData.staff);
        if (backupData.workDays) await dbLocal.workDays.bulkAdd(backupData.workDays);
        if (backupData.schedules) await dbLocal.schedules.bulkAdd(backupData.schedules);
        if (backupData.programs) await dbLocal.programs.bulkAdd(backupData.programs);
      });

      setMessage({ type: 'success', text: 'Veriler başarıyla kurtarıldı.' });
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Recovery failed:', error);
      setMessage({ type: 'error', text: 'Kurtarma işlemi başarısız oldu.' });
    } finally {
      setIsSyncing(false);
    }
  };

  if (!authStatus) return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
    </div>
  );

  if (!authStatus.authenticated && isInitialLoad) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in duration-500">
          <div className="p-8 text-center bg-blue-600 text-white">
            <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-1">Edirne Merkez SYDV</h1>
            <p className="text-blue-100 text-sm font-medium opacity-80">Vefa Yönetim Sistemi</p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4">
                <ShieldCheck className="w-3 h-3" />
                Güvenli Giriş Gerekli
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">
                Sisteme erişmek ve verilerinizi Google Drive ile senkronize etmek için lütfen yetkili hesap ile giriş yapın.
              </p>
            </div>

            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 group"
            >
              <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              Google ile Giriş Yap
            </button>

            <div className="pt-4 border-t border-gray-50 text-center">
              <p className="text-[10px] text-gray-400 font-medium">
                Sadece <span className="text-gray-600 font-bold">edirnesydv@gmail.com</span> hesabı yetkilidir.
              </p>
            </div>

            {message && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-bold ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {message.text}
              </div>
            )}
          </div>
        </div>
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
            <h3 className="text-sm font-bold text-gray-900">Bulut Yedekleme</h3>
            <p className="text-[10px] text-gray-500 font-medium">Drive Senkronizasyonu</p>
          </div>
        </div>
        
        {authStatus.authenticated && (
          <button 
            onClick={handleLogout}
            disabled={isSyncing}
            className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            title="Yedekle ve Çıkış Yap"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-xs text-gray-600 font-medium truncate">{authStatus.email}</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px] text-gray-600 font-bold uppercase">Otomatik Senkronizasyon</span>
          </div>
          <button
            onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
            className={`w-8 h-4 rounded-full transition-colors relative ${autoSyncEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${autoSyncEnabled ? 'left-4.5' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleBackup}
            disabled={isSyncing}
            className="flex flex-col items-center justify-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />}
            <span className="text-[10px] font-bold uppercase">Yedekle</span>
          </button>
          <button
            onClick={() => handleRestore(false)}
            disabled={isSyncing}
            className="flex flex-col items-center justify-center gap-2 p-3 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-all disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudDownload className="w-5 h-5" />}
            <span className="text-[10px] font-bold uppercase">Yükle</span>
          </button>
        </div>

        {recoveryBackup && (
          <button
            onClick={handleRecoveryRestore}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 p-2 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-all border border-amber-100 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase">Kurtarma Yedeğini Yükle</span>
          </button>
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
