import { createContext, useContext, useState, ReactNode } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'info';
  withPrompt?: boolean;
  promptPlaceholder?: string;
};

type ConfirmContextType = {
  confirm: (options: ConfirmOptions) => Promise<boolean | string | null>;
};

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
  const [resolver, setResolver] = useState<{ resolve: (value: boolean | string | null) => void } | null>(null);
  const [promptValue, setPromptValue] = useState('');

  const confirm = (opts: ConfirmOptions) => {
    setOptions(opts);
    setPromptValue('');
    setIsOpen(true);
    return new Promise<boolean | string | null>((resolve) => {
      setResolver({ resolve });
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolver) {
      if (options.withPrompt) {
        resolver.resolve(promptValue);
      } else {
        resolver.resolve(true);
      }
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolver) resolver.resolve(options.withPrompt ? null : false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in duration-300">
            <div className="flex gap-4 items-start mb-4">
              <div className={`p-3 rounded-2xl ${
                options.type === 'danger' ? 'bg-rose-100 text-rose-600' : 
                options.type === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 mt-1">
                <h3 className="text-xl font-bold text-slate-900 leading-tight">
                  {options.title || 'Emin misiniz?'}
                </h3>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                  {options.message}
                </p>
              </div>
            </div>

            {options.withPrompt && (
              <div className="mt-4 mb-6">
                 <input 
                   autoFocus
                   type="text" 
                   value={promptValue} 
                   onChange={e => setPromptValue(e.target.value)} 
                   placeholder={options.promptPlaceholder || "Cevabınızı girin..."} 
                   className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                 />
              </div>
            )}

            <div className={`flex gap-3 ${options.withPrompt ? '' : 'mt-8'}`}>
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                {options.cancelLabel || 'İptal'}
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-lg ${
                  options.type === 'danger' 
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' 
                    : options.type === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                }`}
              >
                <Check className="w-4 h-4" />
                {options.confirmLabel || 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirmDialog = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirmDialog must be used within ConfirmProvider');
  return context;
};
