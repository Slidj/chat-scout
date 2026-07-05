import { X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentApiKey: string;
  onSave: (apiKey: string) => void;
}

export function SettingsModal({ isOpen, onClose, currentApiKey, onSave }: SettingsModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState(currentApiKey);

  // Sync state if currentApiKey changes externally
  useEffect(() => {
    setApiKeyInput(currentApiKey);
  }, [currentApiKey]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Налаштування</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Ключ
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Ваш API ключ зберігається локально і використовується для доступу до моделей через сервіс.
            </p>
          </div>
          
          <button
            onClick={() => {
              onSave(apiKeyInput.trim());
              onClose();
            }}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}
