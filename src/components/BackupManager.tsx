import { useConfirmDialog } from '../hooks/useConfirmDialog';
import React, { useState, useEffect } from 'react';
import { Cloud, Loader2, CheckCircle2, AlertCircle, DownloadCloud, UploadCloud, FileJson, FileSpreadsheet } from 'lucide-react';
import { dbLocal } from '../db';
import * as XLSX from 'xlsx';

interface BackupManagerProps {
  user: any;
  isInitialLoad?: boolean;
}

export default function BackupManager({ user, isInitialLoad = false }: BackupManagerProps) {
  const { confirm } = useConfirmDialog();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(localStorage.getItem('lastBackupDate'));

  // Check for auto-backup every time app loads
  useEffect(() => {
    if (user && user.email === 'edirnesydv@gmail.com') {
      const checkAutoBackup = async () => {
        const lastBackup = localStorage.getItem('lastBackupDate');
        if (!lastBackup) {
          return;
        }
        const lastBackupTime = new Date(lastBackup).getTime();
        const now = new Date().getTime();
        const daysSinceLastBackup = (now - lastBackupTime) / (1000 * 3600 * 24);

        if (daysSinceLastBackup >= 10) {
          setMessage({ type: 'error', text: 'Son yedeklemenin üzerinden 10 günden fazla geçti. Lütfen manuel yedekleme yapın.' });
        }
      };
      checkAutoBackup();
    }
  }, [user]);

  const handleManualBackup = async (format: 'json' | 'excel') => {
    if (!user) return;
    
    // STRICT SECURITY CHECK: Only edirnesydv@gmail.com can initiate backup
    if (user.email !== 'edirnesydv@gmail.com') {
      setMessage({ type: 'error', text: 'Güvenlik İhlali: Yedekleme işlemi sadece yetkili hesap (edirnesydv@gmail.com) ile yapılabilir.' });
      return;
    }

    if (!(await confirm({ message: `Veritabanını bilgisayarınıza ${format.toUpperCase()} formatında yedeklemek istediğinize emin misiniz?`, type: "warning" }))) {
      return;
    }

    setIsSyncing(true);
    setMessage({ type: 'success', text: 'Yedekleme hazırlanıyor...' });

    try {
      // Fetch all data from dbLocal
      const backupData: Record<string, any[]> = {
        applicants: await dbLocal.applicants.toArray(),
        staff: await dbLocal.staff.toArray(),
        workDays: await dbLocal.workDays.toArray(),
        schedules: await dbLocal.schedules.toArray(),
        programs: await dbLocal.programs.toArray()
      };

      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'json') {
        const fileContent = JSON.stringify(backupData, null, 2);
        const fileName = `vefa_yedek_${dateStr}.json`;
        
        const blob = new Blob([fileContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'excel') {
        const wb = XLSX.utils.book_new();
        for (const [key, dataArray] of Object.entries(backupData)) {
          // Exclude complex nested objects or stringify them if needed, but standard JSON array is usually fine
          const cleanData = dataArray.map(item => {
            const cleanItem: any = {};
            for (const [k, v] of Object.entries(item)) {
              if (typeof v === 'object' && v !== null) {
                cleanItem[k] = JSON.stringify(v);
              } else {
                cleanItem[k] = v;
              }
            }
            return cleanItem;
          });
          const ws = XLSX.utils.json_to_sheet(cleanData.length > 0 ? cleanData : [{}]);
          XLSX.utils.book_append_sheet(wb, ws, key);
        }
        XLSX.writeFile(wb, `vefa_yedek_${dateStr}.xlsx`);
      }

      const now = new Date().toISOString();
      localStorage.setItem('lastBackupDate', now);
      setLastBackupDate(now);
      setMessage({ type: 'success', text: `Yedekleme bilgisayarınıza başarıyla indirildi (${format.toUpperCase()}).` });

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

    if (!(await confirm({ message: 'DİKKAT: Bu işlem mevcut tüm verileri silecek ve yedek dosyasındaki verileri yükleyecektir. Devam etmek istediğinize emin misiniz?', type: "warning" }))) {
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
          throw new Error('Geçersiz yedek dosyası formatı. Yalnızca geçerli bir JSON yedeği kullanılabilir.');
        }

        // Restore process
        for (const key of requiredKeys) {
          await (dbLocal as any)[key].clear();
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

  if (!user || user.email !== 'edirnesydv@gmail.com') {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center max-w-2xl mx-auto mt-10">
        <div className="flex justify-center mb-4">
          <div className="bg-red-50 p-3 rounded-2xl">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Yetkisiz Erişim</h3>
        <p className="text-sm text-gray-500">Yedekleme ve geri yükleme işlemleri yalnızca sistem yöneticisi (edirnesydv@gmail.com) tarafından yapılabilir.</p>
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
            <p className="text-sm text-gray-500 font-medium">Sistem verilerini bilgisayarınıza güvenle yedekleyin.</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleManualBackup('json')}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-4 rounded-2xl text-sm font-bold transition-all shadow-md shadow-blue-100 disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileJson className="w-5 h-5" />}
            JSON İndir (Geri Yüklenebilir)
          </button>

          <button
            onClick={() => handleManualBackup('excel')}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-4 rounded-2xl text-sm font-bold transition-all shadow-md shadow-emerald-100 disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
            Excel Olarak İndir
          </button>
          
          <div className="relative md:col-span-2">
            <input
              type="file"
              accept=".json"
              onChange={handleRestore}
              disabled={isSyncing}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              title="Yedekten Geri Yükle"
             id="field-3mhb1i2" />
            <button
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-3 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-4 py-4 rounded-2xl text-sm font-bold transition-all disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
              Dosyadan Geri Yükle (.json)
            </button>
          </div>
        </div>

        {lastBackupDate && (
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
            <p className="text-sm text-gray-500 font-medium">
              Son Yedekleme Tarihi: <span className="font-bold text-gray-800">{new Date(lastBackupDate).toLocaleDateString('tr-TR')}</span>
            </p>
            {(() => {
              const days = Math.floor((new Date().getTime() - new Date(lastBackupDate).getTime()) / (1000 * 3600 * 24));
              if (days >= 10) {
                return (
                  <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-100 text-red-600 text-sm font-bold flex items-center justify-center gap-2">
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
          <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 text-center">
             <div className="text-sm text-orange-700 font-bold flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Henüz hiç yedek alınmamış. Lütfen güvenliğiniz için yedek alın.
             </div>
          </div>
        )}
      </div>

      {message && (
        <div className={`mt-6 flex items-center gap-2 p-4 rounded-2xl text-sm font-bold ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          {message.text}
        </div>
      )}
    </div>
  );
}
