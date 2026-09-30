import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Sparkles, X, ChevronDown, Plus, Mic, ArrowLeft,
  Camera, Image as ImageIcon, FileText, FolderPlus, Globe, Paperclip, Clock,
  Check
} from 'lucide-react';
import { Message, generateChatResponse } from '../lib/api';
import { ChatMessage } from './ChatMessage';
import { getTierClasses, getTierTextColor, resolveColorToHex } from '../lib/utils';

export interface ChatModelOption {
  id: string;
  name: string;
  tier?: string;
  shortPriceInfo?: string;
  priceInfo?: string;
  providerName?: string;
  providerColor?: string;
  providerLogoUrl?: string;
}

interface ChatPanelProps {
  apiKey: string;
  selectedModel: string | null;
  onChangeModel: (modelId: string) => void;
  apiModels: ChatModelOption[];
  onClose: () => void;
  isOpen: boolean;
}

export function ChatPanel({ apiKey, selectedModel, onChangeModel, apiModels, onClose, isOpen }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  
  // Client-side typewriter animation state
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const fullTextMapRef = useRef<Record<string, string>>({});

  // Toggles for "Add to chat" sheet
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeModelObj = apiModels.find(m => m.id === selectedModel);

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
  }, [messages, isLoading, isOpen, typingMessageId]);

  // Clean up any running typing timers on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
      }
    };
  }, []);

  /**
   * Animates text output on client side progressively without server stream
   */
  const animateTextReveal = (messageId: string, fullText: string) => {
    fullTextMapRef.current[messageId] = fullText;
    setTypingMessageId(messageId);

    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    // Adaptive speed calculation
    const totalChars = fullText.length;
    // Aim for smooth 1.2 to 3.2 seconds total duration
    const targetDurationMs = Math.min(Math.max(totalChars * 12, 1000), 3200);
    const intervalMs = 24; // ~40 updates per second
    const totalSteps = targetDurationMs / intervalMs;
    const charsPerStep = Math.max(1, Math.ceil(totalChars / totalSteps));

    let currentLength = 0;

    typingTimerRef.current = window.setInterval(() => {
      currentLength += charsPerStep;

      if (currentLength >= totalChars) {
        currentLength = totalChars;
        if (typingTimerRef.current) {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
        }
        setTypingMessageId(null);
      }

      const chunk = fullText.slice(0, currentLength);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: chunk } : m));
    }, intervalMs);
  };

  /**
   * Skips typing animation and reveals entire text immediately
   */
  const handleSkipTyping = () => {
    if (typingMessageId && typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
      const fullText = fullTextMapRef.current[typingMessageId];
      if (fullText) {
        setMessages(prev => prev.map(m => m.id === typingMessageId ? { ...m, text: fullText } : m));
      }
      setTypingMessageId(null);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !apiKey || !selectedModel || isLoading) return;

    // If previous message was still typing, finish it immediately
    handleSkipTyping();

    const userText = inputValue.trim();
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
    };

    const updatedHistory = [...messages, newUserMessage];
    setMessages(updatedHistory);
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      // 1. Fetch full non-streamed response from API (saves server resources on free tier)
      const responseText = await generateChatResponse(apiKey, selectedModel, userText, messages);
      
      const newModelId = (Date.now() + 1).toString();
      const placeholderModelMessage: Message = {
        id: newModelId,
        role: 'model',
        text: '',
      };
      
      // Stop loading state
      setIsLoading(false);

      // Add empty message container
      setMessages(prev => [...prev, placeholderModelMessage]);

      // 2. Beautiful client-side typewriter animation
      animateTextReveal(newModelId, responseText);
    } catch (error: any) {
      console.error(error);
      setIsLoading(false);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `Помилка: ${error.message || 'Щось пішло не так при зверненні до API. Перевірте ваш ключ та з\'єднання.'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRetry = async () => {
    if (messages.length === 0 || isLoading) return;
    
    // Find last user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage || !apiKey || !selectedModel) return;

    handleSkipTyping();
    setIsLoading(true);

    try {
      const historyWithoutLastModel = messages.filter((_, idx) => idx < messages.length - 1);
      const responseText = await generateChatResponse(apiKey, selectedModel, lastUserMessage.text, historyWithoutLastModel);
      
      const modelId = Date.now().toString();
      setIsLoading(false);
      setMessages(prev => [...prev.slice(0, -1), { id: modelId, role: 'model', text: '' }]);
      animateTextReveal(modelId, responseText);
    } catch (error: any) {
      setIsLoading(false);
      setMessages(prev => [...prev.slice(0, -1), { 
        id: Date.now().toString(), 
        role: 'model', 
        text: `Помилка: ${error.message || 'Не вдалося повторити відповідь'}` 
      }]);
    }
  };

  const handleNewChat = () => {
    handleSkipTyping();
    setMessages([]);
  };

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setInputValue((prev) => `${prev} [Файл: ${file.name}] `);
      setIsAddSheetOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#171614] text-[#ECE8E1] overflow-hidden">
      
      {/* Top Header - Claude Mobile App Style */}
      <header 
        className="flex items-center justify-between px-4 pb-3 bg-[#171614] border-b border-[#2C2A26] shrink-0 z-20"
        style={{ paddingTop: 'calc(0.75rem + var(--safe-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              handleSkipTyping();
              onClose();
            }}
            className="p-2 -ml-2 rounded-full hover:bg-[#252421] text-[#ECE8E1] transition-colors"
            title="Назад"
          >
            <ArrowLeft size={22} />
          </button>
          
          <div className="flex items-center gap-2">
            <span className="font-medium text-base text-[#ECE8E1] tracking-tight">
              {activeModelObj?.name || 'Чат'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="p-2 rounded-full hover:bg-[#252421] text-[#ECE8E1] transition-colors"
            title="Новий чат"
          >
            <Plus size={20} />
          </button>
          <button
            onClick={() => {
              handleSkipTyping();
              onClose();
            }}
            className="p-2 rounded-full hover:bg-[#252421] text-[#9E9A92] hover:text-[#ECE8E1] transition-colors"
            title="Закрити"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Conversation Stream */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full flex flex-col">
        {!apiKey ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-[#282723] text-[#CC785C] flex items-center justify-center mb-4">
              <Sparkles size={24} />
            </div>
            <h3 className="font-semibold text-lg text-[#ECE8E1] mb-2">Потрібен API ключ</h3>
            <p className="text-sm text-[#9E9A92] max-w-sm mb-4">
              Щоб почати спілкування з моделями, вкажіть ваш персональний ключ у налаштуваннях.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            {activeModelObj?.providerLogoUrl ? (
              <div 
                style={{ backgroundColor: resolveColorToHex(activeModelObj.providerColor) }}
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-md overflow-hidden"
              >
                <img src={activeModelObj.providerLogoUrl} alt="" className="w-full h-full object-contain p-2.5" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-[#282723] text-[#CC785C] flex items-center justify-center mb-4 border border-[#3A3834]">
                <Sparkles size={26} />
              </div>
            )}
            <h2 className="font-claude-serif text-3xl font-normal text-[#ECE8E1] mb-2 tracking-tight">
              {activeModelObj ? `Чим можу допомогти?` : 'Оберіть модель'}
            </h2>
            <p className="text-sm text-[#9E9A92] max-w-xs leading-relaxed">
              {activeModelObj?.priceInfo 
                ? `${activeModelObj.name} готовий до роботи (${activeModelObj.priceInfo})` 
                : 'Поставте запитання, щоб почати новий діалог'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 pb-4">
            {messages.map((m, index) => (
              <ChatMessage 
                key={m.id} 
                message={m} 
                isLast={index === messages.length - 1}
                isTyping={typingMessageId === m.id}
                onSkipTyping={handleSkipTyping}
                onRetry={index === messages.length - 1 && m.role === 'model' ? handleRetry : undefined}
              />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-[#9E9A92] text-sm py-2 animate-in fade-in">
                <div className="w-2 h-2 rounded-full bg-[#CC785C] animate-ping" />
                <span>Генерую відповідь...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Signature Claude Input Box (Screenshot 4) */}
      <footer 
        className="p-4 bg-gradient-to-t from-[#171614] via-[#171614] to-transparent shrink-0"
        style={{ paddingBottom: 'calc(1rem + var(--safe-bottom, 0px))' }}
      >
        <div className="max-w-3xl mx-auto w-full bg-[#242320] border border-[#383632] rounded-3xl p-3 shadow-2xl transition-all focus-within:border-[#4E4B45]">
          
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Reply to ${activeModelObj?.name || 'Claude'}...`}
            disabled={!apiKey || !selectedModel || isLoading}
            className="w-full bg-transparent px-2 pt-1 text-[15px] text-[#ECE8E1] placeholder-[#76736C] focus:outline-none resize-none leading-relaxed"
            style={{ maxHeight: '120px' }}
          />

          {/* Controls Bar inside the Input Box */}
          <div className="flex items-center justify-between mt-2 pt-1">
            
            <div className="flex items-center gap-2 min-w-0">
              {/* + Action Sheet Trigger */}
              <button
                type="button"
                onClick={() => setIsAddSheetOpen(true)}
                className="w-8 h-8 rounded-full bg-[#302E2B] hover:bg-[#3B3935] text-[#ECE8E1] flex items-center justify-center transition-colors shrink-0"
                title="Додати до чату"
              >
                <Plus size={18} />
              </button>

              {/* Model Selector Pill (Screenshot 4) */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="bg-[#302E2B] hover:bg-[#3B3935] border border-[#403D38] text-[#ECE8E1] rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  {activeModelObj?.providerLogoUrl ? (
                    <div 
                      style={{ backgroundColor: resolveColorToHex(activeModelObj.providerColor) }}
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                    >
                      <img src={activeModelObj.providerLogoUrl} alt="" className="w-full h-full object-contain p-0.5" />
                    </div>
                  ) : null}
                  <span className="truncate max-w-[120px]">
                    {activeModelObj ? activeModelObj.name : 'Оберіть модель'}
                  </span>
                  <ChevronDown size={12} className="text-[#9E9A92] shrink-0" />
                </button>

                {/* Model Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto bg-[#252421] border border-[#3A3834] rounded-2xl shadow-2xl p-1.5 flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-[#8A8780] uppercase tracking-wider">
                      Доступні моделі
                    </div>
                    {apiModels.map(m => (
                      <div
                        key={m.id}
                        onClick={() => {
                          onChangeModel(m.id);
                          setIsDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-colors ${
                          m.id === selectedModel 
                            ? 'bg-[#33312D] text-white' 
                            : 'hover:bg-[#2C2A26] text-[#ECE8E1]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          {m.providerLogoUrl ? (
                            <div 
                              style={{ backgroundColor: resolveColorToHex(m.providerColor) }}
                              className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 overflow-hidden shadow-2xs"
                            >
                              <img src={m.providerLogoUrl} alt="" className="w-full h-full object-contain p-0.5" />
                            </div>
                          ) : (
                            <span 
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" 
                              style={{ backgroundColor: resolveColorToHex(m.providerColor) }}
                            />
                          )}
                          <span className={`font-medium truncate ${getTierTextColor(m.tier)}`}>{m.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {m.shortPriceInfo && (
                            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                              {m.shortPriceInfo.replace(/\//g, '-')}
                            </span>
                          )}
                          {m.id === selectedModel && <Check size={14} className="text-[#CC785C]" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Send or Mic Button */}
            <div className="flex items-center gap-1 shrink-0">
              {inputValue.trim() ? (
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || !apiKey || !selectedModel || isLoading}
                  className="w-9 h-9 rounded-full bg-[#CC785C] hover:bg-[#D97757] text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                  title="Надіслати"
                >
                  <Send size={16} className="translate-x-0.5 -translate-y-0.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full hover:bg-[#302E2B] text-[#9E9A92] hover:text-[#ECE8E1] flex items-center justify-center transition-colors"
                    title="Голосовий ввід"
                  >
                    <Mic size={18} />
                  </button>
                  {/* Waveform icon button (Screenshot 4) */}
                  <div 
                    className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-xs cursor-pointer hover:bg-gray-100 transition-colors"
                    title="Голосовий режим"
                  >
                    <div className="flex items-center gap-0.5 h-3.5">
                      <span className="w-0.5 h-2 bg-black rounded-full" />
                      <span className="w-0.5 h-3.5 bg-black rounded-full" />
                      <span className="w-0.5 h-2.5 bg-black rounded-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </footer>

      {/* Claude "Add to chat" Bottom Action Sheet (Screenshot 3) */}
      {isAddSheetOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsAddSheetOpen(false)}
        >
          <div 
            className="w-full max-w-lg bg-[#1E1D1A] border-t border-[#363430] rounded-t-3xl p-5 shadow-2xl animate-in slide-in-from-bottom duration-250 flex flex-col space-y-5"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom, 0px))' }}
          >
            {/* Grab handle */}
            <div className="w-10 h-1 bg-[#4A4742] rounded-full mx-auto" />

            {/* Title & Close */}
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setIsAddSheetOpen(false)}
                className="p-1 rounded-full text-[#9E9A92] hover:text-white"
              >
                <X size={20} />
              </button>
              <h3 className="text-base font-bold text-[#ECE8E1]">Add to chat</h3>
              <div className="w-6" />
            </div>

            {/* 3 Action Tiles (Camera, Photos, Files) */}
            <div className="grid grid-cols-3 gap-3">
              <label 
                className="bg-[#292825] hover:bg-[#33312D] border border-[#383632] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={handleAttachFile} 
                />
                <div className="w-11 h-11 rounded-full bg-[#35332F] flex items-center justify-center text-[#ECE8E1]">
                  <Camera size={20} />
                </div>
                <span className="text-xs font-medium text-[#ECE8E1]">Camera</span>
              </label>

              <label 
                className="bg-[#292825] hover:bg-[#33312D] border border-[#383632] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleAttachFile} 
                />
                <div className="w-11 h-11 rounded-full bg-[#35332F] flex items-center justify-center text-[#ECE8E1]">
                  <ImageIcon size={20} />
                </div>
                <span className="text-xs font-medium text-[#ECE8E1]">Photos</span>
              </label>

              <label 
                className="bg-[#292825] hover:bg-[#33312D] border border-[#383632] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  onChange={handleAttachFile} 
                />
                <div className="w-11 h-11 rounded-full bg-[#35332F] flex items-center justify-center text-[#ECE8E1]">
                  <FileText size={20} />
                </div>
                <span className="text-xs font-medium text-[#ECE8E1]">Files</span>
              </label>
            </div>

            {/* List Options with Toggles & Chevrons */}
            <div className="bg-[#242320] border border-[#35332F] rounded-2xl divide-y divide-[#33312D] overflow-hidden text-sm">
              
              {/* Add to project */}
              <div className="flex items-center justify-between p-3.5 hover:bg-[#2A2925] transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#302E2B] flex items-center justify-center text-[#ECE8E1]">
                    <FolderPlus size={16} />
                  </div>
                  <div>
                    <div className="font-medium text-[#ECE8E1]">Add to project</div>
                    <div className="text-xs text-[#8A8780]">None</div>
                  </div>
                </div>
                <span className="text-[#8A8780] text-sm">›</span>
              </div>

              {/* Web search toggle */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#302E2B] flex items-center justify-center text-[#ECE8E1]">
                    <Globe size={16} />
                  </div>
                  <span className="font-medium text-[#ECE8E1]">Web search</span>
                </div>
                <button
                  type="button"
                  onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    webSearchEnabled ? 'bg-[#3B82F6]' : 'bg-[#403D38]'
                  }`}
                >
                  <span 
                    className={`block w-5 h-5 bg-white rounded-full transition-transform transform ${
                      webSearchEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
                    }`} 
                  />
                </button>
              </div>

              {/* Connectors */}
              <div className="flex items-center justify-between p-3.5 hover:bg-[#2A2925] transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#302E2B] flex items-center justify-center text-[#ECE8E1]">
                    <Paperclip size={16} />
                  </div>
                  <span className="font-medium text-[#ECE8E1]">Connectors</span>
                </div>
                <span className="text-[#8A8780] text-sm">›</span>
              </div>

              {/* Memory toggle */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#302E2B] flex items-center justify-center text-[#ECE8E1]">
                    <Clock size={16} />
                  </div>
                  <span className="font-medium text-[#ECE8E1]">Memory</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMemoryEnabled(!memoryEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    memoryEnabled ? 'bg-[#3B82F6]' : 'bg-[#403D38]'
                  }`}
                >
                  <span 
                    className={`block w-5 h-5 bg-white rounded-full transition-transform transform ${
                      memoryEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
                    }`} 
                  />
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
