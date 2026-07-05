import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, AlertCircle } from 'lucide-react';
import { Message, generateChatResponse, Model } from '../lib/api';
import { ChatMessage } from './ChatMessage';

interface ChatPanelProps {
  apiKey: string;
  selectedModel: string | null;
  onChangeModel: (modelId: string) => void;
  apiModels: Model[];
  onClose: () => void;
  isOpen: boolean;
}

export function ChatPanel({ apiKey, selectedModel, onChangeModel, apiModels, onClose, isOpen }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isLoading, isOpen]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !apiKey || !selectedModel) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputValue.trim(),
    };

    const updatedHistory = [...messages, newUserMessage];
    setMessages(updatedHistory);
    setInputValue('');
    setIsLoading(true);

    try {
      const responseText = await generateChatResponse(apiKey, selectedModel, newUserMessage.text, messages);
      
      const newModelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
      };
      
      setMessages((prev) => [...prev, newModelMessage]);
    } catch (error: any) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `Помилка: ${error.message || 'Щось пішло не так при зверненні до API. Перевірте ваш ключ та з\'єднання.'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50 dark:bg-gray-950 sm:inset-auto sm:right-4 sm:bottom-24 sm:w-96 sm:h-[600px] sm:rounded-2xl sm:shadow-2xl sm:border sm:border-gray-200 dark:sm:border-gray-800 overflow-hidden">
      {/* Header */}
      <header 
        className="flex items-center justify-between px-4 pb-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0"
        style={{ paddingTop: 'calc(0.75rem + var(--safe-top, 0px))' }}
      >
        <div className="flex items-center gap-3 text-gray-900 dark:text-white flex-1 min-w-0">
          <div className="p-1.5 bg-blue-600 rounded-lg text-white shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <h2 className="font-semibold text-sm leading-tight">Чат</h2>
            {apiModels.length > 0 ? (
              <select 
                value={selectedModel || ''}
                onChange={(e) => onChangeModel(e.target.value)}
                className="w-full bg-transparent border-none text-xs text-gray-500 focus:ring-0 p-0 m-0 dark:bg-gray-900 outline-none cursor-pointer"
              >
                <option value="" disabled>Оберіть модель</option>
                {apiModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-500 truncate">{selectedModel || 'Оберіть модель'}</p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors shrink-0"
        >
          <X size={20} />
        </button>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 flex flex-col bg-gray-50 dark:bg-gray-950">
        {!apiKey ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <AlertCircle className="text-red-500 mb-2" size={32} />
            <p className="text-sm text-gray-500 dark:text-gray-400">Введіть API ключ в налаштуваннях</p>
          </div>
        ) : !selectedModel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Sparkles className="text-blue-500 mb-2" size={32} />
            <p className="text-sm text-gray-500 dark:text-gray-400">Оберіть модель з каталогу, щоб почати</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Напишіть повідомлення, щоб почати діалог з {selectedModel}</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="flex gap-2 items-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-4 py-3 rounded-2xl rounded-bl-none">
                  <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-3 shrink-0">
        <div className="flex items-end gap-2">
          <div className="relative flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-transparent focus-within:border-blue-500 focus-within:bg-white dark:focus-within:bg-gray-900 transition-all overflow-hidden">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Повідомлення..."
              className="w-full bg-transparent px-3 py-2.5 text-sm focus:outline-none text-gray-900 dark:text-white placeholder-gray-500"
              disabled={isLoading || !selectedModel || !apiKey}
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading || !selectedModel || !apiKey}
            className="flex-shrink-0 p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl transition-colors shadow-sm"
          >
            <Send size={18} className={inputValue.trim() && !isLoading ? "translate-x-0.5 -translate-y-0.5 transition-transform" : ""} />
          </button>
        </div>
      </footer>
    </div>
  );
}
