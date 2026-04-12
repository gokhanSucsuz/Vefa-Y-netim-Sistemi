import { useState, useEffect, useCallback } from 'react';
import { Cloud, Loader2, CheckCircle2, AlertCircle, ShieldCheck, AlertTriangle } from 'lucide-react';
import { APP_LOGO_URL } from '../constants/logo';

interface BackupManagerProps {
  onAuthChange?: (authenticated: boolean, email?: string) => void;
  isInitialLoad?: boolean;
}

export default function BackupManager({ onAuthChange, isInitialLoad = false }: BackupManagerProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-xs text-gray-600 font-medium truncate">Firestore Bağlı</span>
        </div>
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
