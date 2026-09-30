import { X, Key } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentApiKey: string;
  onSave: (apiKey: string) => void;
}

export function SettingsModal({ isOpen, onClose, currentApiKey, onSave }: SettingsModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState(currentApiKey);

  useEffect(() => {
    setApiKeyInput(currentApiKey);
  }, [currentApiKey]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#242320] text-[#ECE8E1] rounded-3xl shadow-2xl overflow-hidden border border-[#383632]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#312F2B]">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-[#CC785C]" />
            <h2 className="text-base font-semibold text-[#ECE8E1] tracking-tight">Налаштування</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[#312F2B] transition-colors text-[#9E9A92] hover:text-[#ECE8E1]"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-2">
              API Ключ (Scout AI / Gemini)
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3.5 py-2.5 border border-[#383632] rounded-xl focus:outline-none focus:border-[#CC785C] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] text-sm font-mono"
            />
            <p className="mt-2 text-xs text-[#9E9A92] leading-relaxed">
              Ваш ключ зберігається виключно локально у вашому браузері/застосунку та використовується для запитів до моделей.
            </p>
          </div>
          
          <button
            onClick={() => {
              onSave(apiKeyInput.trim());
              onClose();
            }}
            className="w-full py-3 px-4 bg-[#CC785C] hover:bg-[#D97757] text-white font-medium rounded-xl transition-all shadow-md active:scale-98 text-sm"
          >
            Зберегти налаштування
          </button>
        </div>
      </div>
    </div>
  );
}
