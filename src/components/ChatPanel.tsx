import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, AlertCircle, ChevronDown } from 'lucide-react';
import { Message, generateChatResponse, Model } from '../lib/api';
import { ChatMessage } from './ChatMessage';
import { getTierClasses, getTierTextColor, getTierSubtextColor } from '../lib/utils';

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
              <div className="relative" ref={dropdownRef}>
                <div 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`flex items-center justify-between w-full cursor-pointer rounded-md overflow-hidden relative transition-colors border ${
                    selectedModel 
                      ? getTierClasses(apiModels.find(m => m.id === selectedModel)?.tier).replace('shadow-[0_0_15px_rgba(245,158,11,0.2)]', '').replace('shadow-[0_0_15px_rgba(239,68,68,0.2)]', '').replace('shadow-[0_0_15px_rgba(168,85,247,0.2)]', '').replace('shadow-[0_0_15px_rgba(59,130,246,0.2)]', '').replace('border-gray-200', 'border-transparent').replace('dark:border-gray-800', 'border-transparent').replace('shadow-sm', '')
                      : 'bg-transparent border-transparent'
                  }`}
                  style={{ padding: selectedModel ? '2px 6px' : '0' }}
                >
                  {selectedModel && apiModels.find(m => m.id === selectedModel)?.tier && apiModels.find(m => m.id === selectedModel)?.tier !== 'common' && (
                    <div className="stars-container opacity-50"></div>
                  )}
                  <span className={`text-xs truncate relative z-10 ${selectedModel ? getTierTextColor(apiModels.find(m => m.id === selectedModel)?.tier) : 'text-gray-500'}`}>
                    {selectedModel ? apiModels.find(m => m.id === selectedModel)?.name : 'Оберіть модель'}
                  </span>
                  <ChevronDown size={12} className={`relative z-10 ml-1 shrink-0 ${selectedModel ? getTierTextColor(apiModels.find(m => m.id === selectedModel)?.tier) : 'text-gray-500'}`} />
                </div>
                
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-64 max-h-64 overflow-y-auto bg-white dark:bg-[#1C2128] border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl z-50 flex flex-col p-1 gap-1">
                    {apiModels.map(m => (
                      <div
                        key={m.id}
                        onClick={() => {
                          onChangeModel(m.id);
                          setIsDropdownOpen(false);
                        }}
                        className={`flex justify-between items-center px-3 py-2 rounded-lg cursor-pointer text-sm overflow-hidden relative transition-all ${getTierClasses(m.tier)}`}
                      >
                        {m.tier && m.tier !== 'common' && (
                          <div className="stars-container"></div>
                        )}
                        <div className="flex flex-col relative z-10 min-w-0 pr-2">
                          <span className={`font-medium truncate ${getTierTextColor(m.tier)}`}>{m.name}</span>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/40 border-l border-emerald-100 dark:border-emerald-800/50 pl-2 pr-1 py-0.5 rounded flex items-center justify-center shrink-0 relative z-10 ml-auto">
                          <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap drop-shadow-sm">
                            {m.shortPriceInfo ? m.shortPriceInfo.replace(/\//g, '-') : (() => {
                              const matches = m.priceInfo?.match(/\$\d+(\.\d+)?/g);
                              if (matches && matches.length >= 2) {
                                return `${matches[0]}-${matches[1]}`;
                              }
                              return m.priceInfo;
                            })()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
