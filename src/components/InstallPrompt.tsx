import { useConfirmDialog } from '../hooks/useConfirmDialog';
import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, Share } from 'lucide-react';

export default function InstallPrompt() {
  const { confirm } = useConfirmDialog();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');

  useEffect(() => {
    // Check platform
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/android/.test(ua)) {
      setPlatform('android');
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const showHandler = () => setShowPrompt(true);
    window.addEventListener('show-install-prompt', showHandler);

    // For iOS, we show the prompt manually after a delay if not standalone
    if (/iphone|ipad|ipod/.test(ua) && !window.matchMedia('(display-mode: standalone)').matches) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 5000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('show-install-prompt', showHandler);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('show-install-prompt', showHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
    } catch (error) {
      console.error('PWA Kurulum Hatası:', error);
      toast.error('Uygulama yüklenirken bir hata oluştu. Lütfen tarayıcı menüsünden manuel olarak "Ana Ekrana Ekle" seçeneğini kullanın.');
    } finally {
      // Prompt can only be used once
      setDeferredPrompt(null);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
        
        <button 
          onClick={() => setShowPrompt(false)}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4 pr-6">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Smartphone className="w-6 h-6 text-blue-600" />
          </div>
          
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 text-sm">Uygulama Olarak Kullanın</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Daha hızlı erişim ve daha iyi bir deneyim için uygulamayı ana ekranınıza ekleyin.
            </p>

            {platform === 'ios' ? (
              <div className="mt-3 bg-blue-50/50 rounded-xl p-4 border border-blue-100">
                <p className="text-[12px] text-blue-900 font-bold mb-2">
                  iPhone Kurulum Rehberi:
                </p>
                <ol className="text-[11px] text-blue-800 space-y-2 font-medium">
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-200 text-blue-700 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">1</span>
                    <span>Safari'nin en altındaki <Share className="w-3.5 h-3.5 inline mx-0.5 text-blue-600" /> <b>Paylaş</b> ikonuna dokunun.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-200 text-blue-700 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">2</span>
                    <span>Açılan menüyü aşağı kaydırın.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-200 text-blue-700 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">3</span>
                    <span><b className="underline">Ana Ekrana Ekle</b> (Add to Home Screen) seçeneğine dokunun.</span>
                  </li>
                </ol>
                <div className="mt-3 text-[10px] text-blue-600/80 bg-blue-100/50 p-2 rounded-lg italic">
                  Not: Eğer uygulamayı Instagram/Google içinden açtıysanız sağ alt köşeden "Safari'de Aç" demelisiniz.
                </div>
              </div>
            ) : platform === 'android' && !deferredPrompt ? (
              <div className="mt-3 bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
                <p className="text-[12px] text-emerald-900 font-bold mb-2">
                  Android Kurulum Rehberi:
                </p>
                <ol className="text-[11px] text-emerald-800 space-y-2 font-medium">
                  <li className="flex items-start gap-2">
                    <span className="bg-emerald-200 text-emerald-700 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">1</span>
                    <span>Tarayıcının sağ üst köşesindeki <b>Üç Nokta (⋮)</b> menüsüne dokunun (veya alt menü).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-emerald-200 text-emerald-700 w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">2</span>
                    <span>Açılan menüden <b className="underline">Ana Ekrana Ekle</b> veya <b className="underline">Uygulamayı Yükle</b> seçeneğine dokunun.</span>
                  </li>
                </ol>
                <div className="mt-3 text-[10px] text-emerald-600/80 bg-emerald-100/50 p-2 rounded-lg italic">
                  Not: Eğer uygulamayı uygulama içi tarayıcıdan (Instagram vb.) açtıysanız sağ üstteki menüden "Chrome'da Aç" demelisiniz.
                </div>
              </div>
            ) : (
              <button
                onClick={handleInstallClick}
                className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
              >
                <Download className="w-4 h-4" />
                Uygulamayı İndir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
