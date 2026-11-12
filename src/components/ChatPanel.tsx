import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Sparkles, X, ChevronDown, Plus, Mic, ArrowLeft, ArrowDown,
  Camera, Image as ImageIcon, FileText, FolderPlus, Globe, Paperclip, Clock,
  Check, Square, History, Trash2, MessageSquare, Mail
} from 'lucide-react';
import { Message, streamChatResponse, generateChatResponse } from '../lib/api';
import { ChatMessage } from './ChatMessage';
import { getTierClasses, getTierTextColor, resolveColorToHex } from '../lib/utils';
import { 
  logQueryEvent, getOrInitClientId, 
  saveChatSession, subscribeUserChats, deleteChatSession, clearUserChats, 
  cleanupExpiredChats, ChatSession, CHAT_RETENTION_DAYS 
} from '../lib/db';

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
  currentUser?: any;
  unreadCouponsCount?: number;
  onOpenCoupons?: () => void;
  activeChatId?: string | null;
}

export function ChatPanel({ 
  apiKey, 
  selectedModel, 
  onChangeModel, 
  apiModels, 
  onClose, 
  isOpen, 
  currentUser,
  unreadCouponsCount = 0,
  onOpenCoupons,
  activeChatId
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  
  // Chat Session & Persistence state (Real-time Firestore + 3-day auto-expiry retention)
  const currentUid = currentUser?.id ? String(currentUser.id) : getOrInitClientId();
  const [currentChatId, setCurrentChatId] = useState<string>(() => 'chat_' + Date.now());
  const [savedChats, setSavedChats] = useState<ChatSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<string>('Новий чат');
  const chatCreatedAtRef = useRef<number>(Date.now());

  // Track unread/unviewed history badge count
  const [lastViewedCount, setLastViewedCount] = useState<number>(() => {
    const saved = localStorage.getItem('last_viewed_chat_count');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Auto-scroll control state (allows user to tap/scroll to pause auto-following)
  const isAutoScrollPausedRef = useRef<boolean>(false);
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState<boolean>(false);

  const pauseAutoScroll = () => {
    if (!isAutoScrollPausedRef.current) {
      isAutoScrollPausedRef.current = true;
      setIsAutoScrollPaused(true);
    }
  };

  const resumeAutoScroll = () => {
    isAutoScrollPausedRef.current = false;
    setIsAutoScrollPaused(false);
    scrollToBottom(true);
  };

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
    setLastViewedCount(savedChats.length);
    localStorage.setItem('last_viewed_chat_count', String(savedChats.length));
  };

  // Streaming & Generation state
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // High-performance Fluid Token Stream Refs (Liquid Text Pacing)
  const streamTargetRef = useRef<string>('');
  const streamDisplayedRef = useRef<string>('');
  const streamFrameIdRef = useRef<number | null>(null);
  const isStreamingActiveRef = useRef<boolean>(false);

  // Toggles for "Add to chat" sheet
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  const mainScrollRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeModelObj = apiModels.find(m => m.id === selectedModel);

  // Subscribe to user's saved chats & auto-clean expired ones in the background
  useEffect(() => {
    // 1. Silent background pruning of chats older than 3 days
    cleanupExpiredChats().catch(console.error);

    // 2. Real-time subscription to user's chats
    const unsubscribe = subscribeUserChats(currentUid, (chats) => {
      setSavedChats(chats);
    });

    return () => unsubscribe();
  }, [currentUid]);

  const lastHandledActiveChatIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;
    if (activeChatId === null && lastHandledActiveChatIdRef.current !== null) {
      lastHandledActiveChatIdRef.current = null;
      handleNewChat();
    } else if (activeChatId && activeChatId !== lastHandledActiveChatIdRef.current) {
      const targetChat = savedChats.find(c => c.id === activeChatId);
      if (targetChat) {
        lastHandledActiveChatIdRef.current = activeChatId;
        handleSelectChat(targetChat);
      }
    }
  }, [activeChatId, savedChats, isOpen]);

  const persistChat = (msgs: Message[], customTitle?: string) => {
    if (msgs.length === 0) return;
    const title = customTitle || (currentTitle !== 'Новий чат' ? currentTitle : (msgs[0]?.text?.slice(0, 45) || 'Діалог'));
    if (currentTitle === 'Новий чат') {
      setCurrentTitle(title);
    }
    saveChatSession({
      id: currentChatId,
      userId: currentUid,
      title,
      modelId: selectedModel || '',
      messages: msgs,
      createdAt: chatCreatedAtRef.current,
      updatedAt: Date.now(),
    }).catch(console.error);
  };

  const formatChatDate = (timestamp: number | string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    const timeStr = date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0 && date.getDate() === now.getDate()) {
      return `Сьогодні, ${timeStr}`;
    }
    if (diffDays === 1 || (diffDays === 0 && date.getDate() !== now.getDate())) {
      return `Вчора, ${timeStr}`;
    }
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleScroll = () => {
    if (!mainScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = mainScrollRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceToBottom > 120);

    // If streaming/loading and user scrolled up away from bottom, pause auto-scrolling
    if ((isLoading || typingMessageId) && distanceToBottom > 60) {
      pauseAutoScroll();
    }

    // If user manually scrolled all the way to bottom, resume auto-scrolling
    if (distanceToBottom < 30 && isAutoScrollPausedRef.current) {
      isAutoScrollPausedRef.current = false;
      setIsAutoScrollPaused(false);
    }
  };

  useEffect(() => {
    if (isOpen && !isAutoScrollPausedRef.current) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Clean up any running stream and animation frame on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (streamFrameIdRef.current) {
        cancelAnimationFrame(streamFrameIdRef.current);
      }
    };
  }, []);

  /**
   * Fluid Token Stream Loop (60 FPS Pacing)
   * Eliminates all network packet jumps, stuttering, and layout flashing
   */
  const stopFluidLoop = () => {
    if (streamFrameIdRef.current) {
      cancelAnimationFrame(streamFrameIdRef.current);
      streamFrameIdRef.current = null;
    }
  };

  const startFluidLoop = (targetMessageId: string) => {
    if (streamFrameIdRef.current) return;

    const tick = () => {
      const target = streamTargetRef.current;
      const current = streamDisplayedRef.current;

      if (current.length < target.length) {
        const diff = target.length - current.length;

        // Dynamic fluid pacing:
        // When diff is small (1-10 chars): 1-2 chars per frame (~60-120 chars/sec) - smooth liquid stream
        // When diff is large (e.g. 50-200 chars burst from network buffer):
        // smoothly accelerates so it never falls behind, but avoids single-frame jarring dumps
        let step = 1;
        if (diff > 160) {
          step = Math.min(Math.ceil(diff / 6), 14);
        } else if (diff > 80) {
          step = Math.min(Math.ceil(diff / 8), 10);
        } else if (diff > 30) {
          step = Math.min(Math.ceil(diff / 10), 5);
        } else if (diff > 8) {
          step = 2;
        } else {
          step = 1;
        }

        const nextLen = Math.min(current.length + step, target.length);
        const nextText = target.slice(0, nextLen);
        streamDisplayedRef.current = nextText;

        setMessages(prev =>
          prev.map(m => m.id === targetMessageId ? { ...m, text: nextText } : m)
        );

        // Smooth scroll follow ONLY if user has not paused auto-scroll
        if (!isAutoScrollPausedRef.current && mainScrollRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = mainScrollRef.current;
          const distanceToBottom = scrollHeight - scrollTop - clientHeight;
          if (distanceToBottom < 120) {
            mainScrollRef.current.scrollTop = scrollHeight;
          }
        }

        streamFrameIdRef.current = requestAnimationFrame(tick);
      } else if (!isStreamingActiveRef.current) {
        // Stream completed and queue fully emptied
        stopFluidLoop();
        setTypingMessageId(null);
      } else {
        // Waiting for next chunk from network
        streamFrameIdRef.current = requestAnimationFrame(tick);
      }
    };

    streamFrameIdRef.current = requestAnimationFrame(tick);
  };

  /**
   * Fast-forwards the fluid animation to show all received text immediately on tap
   */
  const handleFastForward = (messageId: string) => {
    if (typingMessageId === messageId) {
      const target = streamTargetRef.current;
      if (target) {
        streamDisplayedRef.current = target;
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: target } : m));
      }
      if (!isStreamingActiveRef.current) {
        stopFluidLoop();
        setTypingMessageId(null);
      }
    }
  };

  /**
   * Stops ongoing generation immediately
   */
  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingActiveRef.current = false;
    stopFluidLoop();
    setIsLoading(false);
    
    // Save whatever text was generated so far
    if (typingMessageId && streamDisplayedRef.current) {
      setMessages(prev => {
        const updated = prev.map(m => m.id === typingMessageId ? { ...m, text: streamDisplayedRef.current } : m);
        persistChat(updated);
        return updated;
      });
    }
    setTypingMessageId(null);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !apiKey || !selectedModel || isLoading) return;

    // Abort any previous request & stop fluid loop
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    stopFluidLoop();

    const userText = inputValue.trim();
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
    };

    const newHistory = [...messages, newUserMessage];
    setMessages(newHistory);
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Persist immediately with initial prompt
    const chatTitle = currentTitle === 'Новий чат' ? userText.slice(0, 45) : currentTitle;
    persistChat(newHistory, chatTitle);

    const newModelId = (Date.now() + 1).toString();
    const placeholderModelMessage: Message = {
      id: newModelId,
      role: 'model',
      text: '',
    };

    // Immediately show placeholder with Claude "Міркує..." indicator
    setMessages(prev => [...prev, placeholderModelMessage]);
    setIsLoading(true);
    setTypingMessageId(newModelId);

    // Reset fluid stream buffers & auto-scroll state
    streamTargetRef.current = '';
    streamDisplayedRef.current = '';
    isStreamingActiveRef.current = true;
    isAutoScrollPausedRef.current = false;
    setIsAutoScrollPaused(false);
    scrollToBottom(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const startTime = Date.now();

    try {
      // Real-time token streaming with smooth fluid animation
      await streamChatResponse(
        apiKey,
        selectedModel,
        userText,
        newHistory.slice(0, -1),
        (_chunk, accumulated) => {
          streamTargetRef.current = accumulated;
          startFluidLoop(newModelId);
        },
        abortController.signal
      );

      isStreamingActiveRef.current = false;

      // Persist completed chat response to Firestore
      const finalAssistantMessage: Message = {
        id: newModelId,
        role: 'model',
        text: streamTargetRef.current,
      };
      const finalHistory = [...newHistory, finalAssistantMessage];
      persistChat(finalHistory, chatTitle);

      const durationMs = Date.now() - startTime;
      logQueryEvent({
        userId: currentUser?.id ? String(currentUser.id) : getOrInitClientId(),
        userName: currentUser?.first_name || (currentUser?.username ? `@${currentUser.username}` : 'Web User'),
        modelId: selectedModel,
        promptSnippet: userText.slice(0, 100),
        durationMs,
        status: 'success'
      });
    } catch (error: any) {
      isStreamingActiveRef.current = false;
      if (error.name === 'AbortError') {
        // Generation cancelled by user, keep whatever text was generated
        return;
      }
      console.error(error);
      const durationMs = Date.now() - startTime;
      
      logQueryEvent({
        userId: currentUser?.id ? String(currentUser.id) : getOrInitClientId(),
        userName: currentUser?.first_name || (currentUser?.username ? `@${currentUser.username}` : 'Web User'),
        modelId: selectedModel,
        promptSnippet: userText.slice(0, 100),
        durationMs,
        status: 'error',
        errorMessage: error.message
      });

      stopFluidLoop();
      const errorContent = `Помилка: ${error.message || 'Щось пішло не так при зверненні до API. Перевірте з\'єднання.'}`;
      setMessages(prev =>
        prev.map(m => m.id === newModelId
          ? { 
              ...m, 
              text: m.text 
                ? `${m.text}\n\n*(Зв'язок перервано: ${error.message || 'помилка'}*` 
                : errorContent
            }
          : m
        )
      );

      persistChat([...newHistory, { id: newModelId, role: 'model', text: errorContent }], chatTitle);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
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

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    stopFluidLoop();

    const modelId = Date.now().toString();
    const historyWithoutLast = messages[messages.length - 1].role === 'model'
      ? messages.slice(0, -1)
      : messages;

    setMessages([...historyWithoutLast, { id: modelId, role: 'model', text: '' }]);
    setIsLoading(true);
    setTypingMessageId(modelId);

    // Reset fluid stream buffers & auto-scroll state
    streamTargetRef.current = '';
    streamDisplayedRef.current = '';
    isStreamingActiveRef.current = true;
    isAutoScrollPausedRef.current = false;
    setIsAutoScrollPaused(false);
    scrollToBottom(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const startTime = Date.now();

    try {
      await streamChatResponse(
        apiKey,
        selectedModel,
        lastUserMessage.text,
        historyWithoutLast.slice(0, -1),
        (_chunk, accumulated) => {
          streamTargetRef.current = accumulated;
          startFluidLoop(modelId);
        },
        abortController.signal
      );

      isStreamingActiveRef.current = false;

      const finalAssistantMessage: Message = {
        id: modelId,
        role: 'model',
        text: streamTargetRef.current,
      };
      persistChat([...historyWithoutLast, finalAssistantMessage]);

      const durationMs = Date.now() - startTime;
      logQueryEvent({
        userId: currentUser?.id ? String(currentUser.id) : getOrInitClientId(),
        userName: currentUser?.first_name || (currentUser?.username ? `@${currentUser.username}` : 'Web User'),
        modelId: selectedModel,
        promptSnippet: lastUserMessage.text.slice(0, 100),
        durationMs,
        status: 'success'
      });
    } catch (error: any) {
      isStreamingActiveRef.current = false;
      if (error.name === 'AbortError') return;
      stopFluidLoop();
      const retryErrorText = `Помилка: ${error.message || 'Не вдалося повторити відповідь'}`;
      setMessages(prev =>
        prev.map(m => m.id === modelId
          ? { 
              ...m, 
              text: m.text 
                ? `${m.text}\n\n*(Зв'язок перервано: ${error.message || 'помилка'}*` 
                : retryErrorText
            }
          : m
        )
      );
      persistChat([...historyWithoutLast, { id: modelId, role: 'model', text: retryErrorText }]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleNewChat = () => {
    handleStopGenerating();
    const newId = 'chat_' + Date.now();
    setCurrentChatId(newId);
    chatCreatedAtRef.current = Date.now();
    setCurrentTitle('Новий чат');
    setMessages([]);
    setIsHistoryOpen(false);
  };

  const handleSelectChat = (chat: ChatSession) => {
    handleStopGenerating();
    setCurrentChatId(chat.id);
    setMessages(chat.messages || []);
    setCurrentTitle(chat.title || 'Чат');
    chatCreatedAtRef.current = typeof chat.createdAt === 'number' 
      ? chat.createdAt 
      : (new Date(chat.createdAt).getTime() || Date.now());
    if (chat.modelId && chat.modelId !== selectedModel) {
      onChangeModel(chat.modelId);
    }
    setIsHistoryOpen(false);
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteChatSession(chatId);
      if (chatId === currentChatId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Error deleting chat session:', err);
    }
  };

  const handleClearAllChats = async () => {
    if (window.confirm('Ви впевнені, що хочете видалити всі збережені чати з бази даних?')) {
      try {
        await clearUserChats(currentUid);
        handleNewChat();
      } catch (err) {
        console.error('Error clearing user chats:', err);
      }
    }
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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#181715] text-[#EDE9DF] overflow-hidden">
      
      {/* Top Header - Claude Mobile App Style */}
      <header 
        className="flex items-center justify-between px-4 pb-3 bg-[#181715] border-b border-[#2C2A26] shrink-0 z-20"
        style={{ paddingTop: 'calc(2.75rem + var(--safe-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              handleStopGenerating();
              onClose();
            }}
            className="p-2 -ml-2 rounded-full hover:bg-[#252421] text-[#EDE9DF] transition-colors"
            title="Назад"
          >
            <ArrowLeft size={22} />
          </button>
          
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-sm text-[#EDE9DF] tracking-tight truncate max-w-[180px] sm:max-w-xs">
              {currentTitle !== 'Новий чат' ? currentTitle : (activeModelObj?.name || 'Чат')}
            </span>
            {currentTitle !== 'Новий чат' && (
              <span className="text-[11px] text-[#9E9A92] truncate">
                {activeModelObj?.name || 'Чат'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {unreadCouponsCount > 0 && onOpenCoupons && (
            <button
              onClick={onOpenCoupons}
              className="relative p-2 rounded-full animate-envelope-pulse transition-all ring-1 ring-amber-500/40"
              title="Вам надіслано купон на поповнення!"
            >
              <Mail size={20} className="stroke-[2.2]" />
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-[#181715]"></span>
              </span>
            </button>
          )}

          <button
            onClick={handleOpenHistory}
            className="relative p-2 rounded-full hover:bg-[#252421] text-[#EDE9DF] transition-colors"
            title="Історія діалогів (зберігаються 3 дні)"
          >
            <History size={20} />
            {savedChats.length > lastViewedCount && (
              <span className="absolute -top-0.5 -right-0.5 bg-[#CC785C] text-[#181715] text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center shadow animate-in zoom-in-75">
                {savedChats.length - lastViewedCount}
              </span>
            )}
          </button>
          <button
            onClick={handleNewChat}
            className="p-2 rounded-full hover:bg-[#252421] text-[#EDE9DF] transition-colors"
            title="Новий чат"
          >
            <Plus size={20} />
          </button>
          <button
            onClick={() => {
              handleStopGenerating();
              onClose();
            }}
            className="p-2 rounded-full hover:bg-[#252421] text-[#9E9A92] hover:text-[#EDE9DF] transition-colors"
            title="Закрити"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Conversation Stream */}
      <main 
        ref={mainScrollRef}
        onScroll={handleScroll}
        onWheel={(e) => {
          if ((isLoading || typingMessageId) && e.deltaY < 0) {
            pauseAutoScroll();
          }
        }}
        onTouchStart={() => {
          if (isLoading || typingMessageId) {
            pauseAutoScroll();
          }
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
          if (isLoading || typingMessageId) {
            pauseAutoScroll();
          }
        }}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full flex flex-col relative"
      >
        {!apiKey ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-[#282723] text-[#CC785C] flex items-center justify-center mb-4">
              <Sparkles size={24} />
            </div>
            <h3 className="font-semibold text-lg text-[#EDE9DF] mb-2">Потрібен API ключ</h3>
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
            <h2 className="font-claude-serif text-3xl font-normal text-[#EDE9DF] tracking-tight">
              Чим можу допомогти?
            </h2>
          </div>
        ) : (
          <div className="flex flex-col flex-1 pb-4">
            {messages.map((m, index) => (
              <ChatMessage 
                key={m.id} 
                message={m} 
                isLast={index === messages.length - 1}
                isTyping={typingMessageId === m.id}
                onSkipTyping={() => handleFastForward(m.id)}
                onRetry={index === messages.length - 1 && m.role === 'model' ? handleRetry : undefined}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Floating Controls: Resume Auto-Scroll or Jump to Bottom */}
        {(isAutoScrollPaused && (isLoading || typingMessageId)) ? (
          <button
            onClick={resumeAutoScroll}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[#242320]/95 border border-[#CC785C] text-[#EDE9DF] hover:bg-[#2C2A26] flex items-center gap-2 shadow-xl backdrop-blur-md z-30 transition-all active:scale-95 animate-in fade-in"
            title="Слідкувати за відповіддю"
          >
            <span className="w-2 h-2 rounded-full bg-[#CC785C] animate-ping" />
            <span className="text-xs font-semibold text-[#EDE9DF]">Слідкувати за текстом</span>
            <ArrowDown size={14} className="text-[#CC785C]" />
          </button>
        ) : showScrollBottom ? (
          <button
            onClick={resumeAutoScroll}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-[#2C2A26]/90 border border-[#403E3A] text-[#EDE9DF] hover:bg-[#383632] flex items-center justify-center shadow-lg backdrop-blur-sm z-30 transition-all active:scale-95 animate-in fade-in zoom-in-95"
            title="До кінця чату"
          >
            <ArrowDown size={18} />
          </button>
        ) : null}
      </main>

      {/* Signature Claude Input Box (Screenshot 4) */}
      <footer 
        className="p-3 sm:p-4 bg-gradient-to-t from-[#181715] via-[#181715] to-transparent shrink-0"
        style={{ paddingBottom: 'calc(1rem + var(--safe-bottom, 0px))' }}
      >
        <div className="max-w-3xl mx-auto w-full bg-[#242320] border border-[#383632] rounded-3xl p-3 shadow-2xl transition-all focus-within:border-[#4E4B45]">
          
          {/* Textarea with enhanced readable size (16.5px) */}
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
            className="w-full bg-transparent px-2.5 pt-1 text-[16.5px] leading-[1.5] text-[#EDE9DF] placeholder-[#7E7B74] focus:outline-none resize-none"
            style={{ maxHeight: '120px' }}
          />

          {/* Controls Bar inside the Input Box */}
          <div className="flex items-center justify-between mt-2 pt-1">
            
            <div className="flex items-center gap-2 min-w-0">
              {/* + Action Sheet Trigger */}
              <button
                type="button"
                onClick={() => setIsAddSheetOpen(true)}
                className="w-8 h-8 rounded-full bg-[#302E2B] hover:bg-[#3B3935] text-[#EDE9DF] flex items-center justify-center transition-colors shrink-0"
                title="Додати до чату"
              >
                <Plus size={18} />
              </button>

              {/* Model Selector Pill (Screenshot 4) */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="bg-[#302E2B] hover:bg-[#3B3935] border border-[#403D38] text-[#EDE9DF] rounded-full px-3.5 py-1.5 text-[13px] font-medium flex items-center gap-1.5 transition-colors"
                >
                  {activeModelObj?.providerLogoUrl ? (
                    <div 
                      style={{ backgroundColor: resolveColorToHex(activeModelObj.providerColor) }}
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                    >
                      <img src={activeModelObj.providerLogoUrl} alt="" className="w-full h-full object-contain p-0.5" />
                    </div>
                  ) : null}
                  <span className="truncate max-w-[130px]">
                    {activeModelObj ? activeModelObj.name : 'Оберіть модель'}
                  </span>
                  <ChevronDown size={13} className="text-[#9E9A92] shrink-0" />
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
                            : 'hover:bg-[#2C2A26] text-[#EDE9DF]'
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

            {/* Right: Send, Stop or Mic Button */}
            <div className="flex items-center gap-1 shrink-0">
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleStopGenerating}
                  className="w-9 h-9 rounded-full bg-[#2C2A26] border border-[#CC785C]/60 hover:bg-[#383530] text-[#EDE9DF] flex items-center justify-center shadow-md active:scale-95 transition-all group"
                  title="Зупинити генерацію"
                >
                  <Square size={13} className="fill-[#CC785C] text-[#CC785C] group-hover:scale-110 transition-transform" />
                </button>
              ) : inputValue.trim() ? (
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || !apiKey || !selectedModel}
                  className="w-9 h-9 rounded-full bg-[#CC785C] hover:bg-[#D97757] text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                  title="Надіслати"
                >
                  <Send size={16} className="translate-x-0.5 -translate-y-0.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full hover:bg-[#302E2B] text-[#9E9A92] hover:text-[#EDE9DF] flex items-center justify-center transition-colors"
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
              <h3 className="text-base font-bold text-[#EDE9DF]">Add to chat</h3>
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
                <div className="w-11 h-11 rounded-full bg-[#35332F] flex items-center justify-center text-[#EDE9DF]">
                  <Camera size={20} />
                </div>
                <span className="text-xs font-medium text-[#EDE9DF]">Camera</span>
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
                <div className="w-11 h-11 rounded-full bg-[#35332F] flex items-center justify-center text-[#EDE9DF]">
                  <ImageIcon size={20} />
                </div>
                <span className="text-xs font-medium text-[#EDE9DF]">Photos</span>
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
                <div className="w-11 h-11 rounded-full bg-[#35332F] flex items-center justify-center text-[#EDE9DF]">
                  <FileText size={20} />
                </div>
                <span className="text-xs font-medium text-[#EDE9DF]">Files</span>
              </label>
            </div>

            {/* List Options with Toggles & Chevrons */}
            <div className="bg-[#242320] border border-[#35332F] rounded-2xl divide-y divide-[#33312D] overflow-hidden text-sm">
              
              {/* Add to project */}
              <div className="flex items-center justify-between p-3.5 hover:bg-[#2A2925] transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#302E2B] flex items-center justify-center text-[#EDE9DF]">
                    <FolderPlus size={16} />
                  </div>
                  <div>
                    <div className="font-medium text-[#EDE9DF]">Add to project</div>
                    <div className="text-xs text-[#8A8780]">None</div>
                  </div>
                </div>
                <span className="text-[#8A8780] text-sm">›</span>
              </div>

              {/* Web search toggle */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#302E2B] flex items-center justify-center text-[#EDE9DF]">
                    <Globe size={16} />
                  </div>
                  <span className="font-medium text-[#EDE9DF]">Web search</span>
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
                  <div className="w-8 h-8 rounded-lg bg-[#302E2B] flex items-center justify-center text-[#EDE9DF]">
                    <Paperclip size={16} />
                  </div>
                  <span className="font-medium text-[#EDE9DF]">Connectors</span>
                </div>
                <span className="text-[#8A8780] text-sm">›</span>
              </div>

              {/* Memory toggle */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#302E2B] flex items-center justify-center text-[#EDE9DF]">
                    <Clock size={16} />
                  </div>
                  <span className="font-medium text-[#EDE9DF]">Memory</span>
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

      {/* History Slide-over Drawer with smooth transition */}
      <div 
        className={`fixed inset-0 z-50 flex justify-end transition-[visibility] duration-300 ${
          isHistoryOpen ? 'pointer-events-auto visible' : 'pointer-events-none invisible'
        }`}
      >
        {/* Backdrop */}
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ease-out ${
            isHistoryOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsHistoryOpen(false)}
        />

        {/* Drawer Panel */}
        <div 
          className={`relative w-full max-w-sm sm:max-w-md h-full bg-[#1A1917] border-l border-[#2E2C28] flex flex-col z-10 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isHistoryOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
            {/* Drawer Header */}
            <div 
              className="p-4 border-b border-[#2E2C28] flex items-center justify-between bg-[#1A1917] shrink-0"
              style={{ paddingTop: 'calc(1rem + var(--safe-top, 0px))' }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#282723] text-[#CC785C] flex items-center justify-center">
                  <History size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-[#EDE9DF]">Історія діалогів</h3>
                  <div className="flex items-center gap-1.5 text-xs text-[#9E9A92]">
                    <Clock size={12} className="text-[#CC785C]" />
                    <span>Зберігаються {CHAT_RETENTION_DAYS} дні • Автоочищення</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsHistoryOpen(false)}
                className="p-2 rounded-full hover:bg-[#282723] text-[#9E9A92] hover:text-[#EDE9DF] transition-colors"
                title="Закрити історію"
              >
                <X size={18} />
              </button>
            </div>

            {/* Actions Bar */}
            <div className="p-3 bg-[#201F1C] border-b border-[#2E2C28] flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={handleNewChat}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#282723] hover:bg-[#32302C] text-xs font-medium text-[#EDE9DF] border border-[#3A3833] transition-colors"
              >
                <Plus size={14} className="text-[#CC785C]" />
                <span>Новий діалог</span>
              </button>

              {savedChats.length > 0 && (
                <button
                  onClick={handleClearAllChats}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#282723] hover:bg-rose-950/40 text-xs font-medium text-rose-300 border border-[#3A3833] hover:border-rose-900/60 transition-colors"
                  title="Очистити всі мої чати"
                >
                  <Trash2 size={14} />
                  <span>Очистити все</span>
                </button>
              )}
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {savedChats.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#9E9A92]">
                  <div className="w-12 h-12 rounded-2xl bg-[#242320] flex items-center justify-center mb-3 text-[#CC785C]">
                    <MessageSquare size={22} />
                  </div>
                  <p className="font-medium text-sm text-[#EDE9DF] mb-1">Немає збережених діалогів</p>
                  <p className="text-xs text-[#8A8780] max-w-xs leading-relaxed">
                    Почніть спілкування з ШІ моделлю. Всі ваші діалоги автоматично збережуться в хмарі на {CHAT_RETENTION_DAYS} дні.
                  </p>
                </div>
              ) : (
                savedChats.map((chat) => {
                  const isActive = chat.id === currentChatId;
                  const chatModelObj = apiModels.find(m => m.id === chat.modelId);
                  const modelTitle = chatModelObj?.name || chat.modelId.split('/').pop() || 'Модель';

                  return (
                    <div
                      key={chat.id}
                      onClick={() => handleSelectChat(chat)}
                      className={`group relative p-3 rounded-xl border cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#282622] border-[#CC785C]/60 ring-1 ring-[#CC785C]/30'
                          : 'bg-[#22211E] border-[#2E2C28] hover:bg-[#282723] hover:border-[#3E3C36]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="text-sm font-medium text-[#EDE9DF] line-clamp-1 flex-1 pr-1 group-hover:text-white transition-colors">
                          {chat.title || 'Діалог без назви'}
                        </h4>
                        <button
                          onClick={(e) => handleDeleteChat(chat.id, e)}
                          className="opacity-70 group-hover:opacity-100 p-1.5 rounded-md text-[#8A8780] hover:text-rose-400 hover:bg-[#32302C] transition-all"
                          title="Видалити цей чат"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#8A8780]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-[#1A1917] border border-[#2E2C28] text-[#D8D4CC] font-mono text-[10px] truncate max-w-[130px]">
                            {modelTitle}
                          </span>
                          <span>•</span>
                          <span className="shrink-0">{chat.messages?.length || 0} пов.</span>
                        </div>
                        <span className="text-[10px] shrink-0 ml-1">
                          {formatChatDate(chat.updatedAt || chat.createdAt)}
                        </span>
                      </div>

                      {isActive && (
                        <div className="mt-2 pt-2 border-t border-[#36342F] flex items-center gap-1.5 text-[10px] text-[#CC785C] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#CC785C]" />
                          Поточний відкритий діалог
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Retention Notice Footer */}
            <div 
              className="p-3 bg-[#161513] border-t border-[#2A2824] text-[11px] text-[#8A8780] flex items-start gap-2 shrink-0"
              style={{ paddingBottom: 'calc(0.75rem + var(--safe-bottom, 0px))' }}
            >
              <Clock size={13} className="text-[#CC785C] shrink-0 mt-0.5" />
              <p className="leading-tight">
                Безкоштовне хмарне сховище автоматично звільняє місце, видаляючи діалоги через {CHAT_RETENTION_DAYS} дні неактивності.
              </p>
            </div>
          </div>
        </div>

    </div>
  );
}
