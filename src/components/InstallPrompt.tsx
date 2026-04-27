import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, Share } from 'lucide-react';

export default function InstallPrompt() {
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
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowPrompt(false);
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
              <div className="mt-3 bg-blue-50 rounded-lg p-3">
                <p className="text-[11px] text-blue-800 font-medium flex items-center flex-wrap gap-1">
                  Alttaki <Share className="w-3 h-3 inline" /> butonuna tıklayın ve 
                  <span className="font-bold underline text-blue-900">"Ana Ekrana Ekle"</span> 
                  seçeneğini seçin.
                </p>
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
