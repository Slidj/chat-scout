import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowUp, Sparkles, X, ChevronDown, Plus, Mic, MicOff, ArrowLeft, ArrowDown,
  Camera, Image as ImageIcon, FileText, FolderPlus, Globe, Paperclip, Clock,
  Check, Square, History, Trash2, MessageSquare, Mail, Bot, Film
} from 'lucide-react';
import {
  Message,
  streamChatResponse,
  generateMediaImage,
  generateMediaVideo,
  inferModelMediaType
} from '../lib/api';
import { Agent, ModelMediaType } from '../types';
import { ChatMessage } from './ChatMessage';
import { getTierClasses, getTierTextColor, resolveColorToHex } from '../lib/utils';
import { cleanupExpiredMediaCache } from '../lib/mediaCache';
import { 
  logQueryEvent, getOrInitClientId, 
  saveChatSession, subscribeUserChats, deleteChatSession, clearUserChats, 
  cleanupExpiredChats, ChatSession, CHAT_RETENTION_DAYS 
} from '../lib/db';

export interface ChatModelOption {
  id: string;
  name: string;
  tier?: string;
  modelType?: ModelMediaType;
  supportedEndpoints?: string[];
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
  activeAgent?: Agent | null;
  agents?: Agent[];
  onSelectAgent?: (agent: Agent | null) => void;
  onBalanceChange?: () => void;
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
  activeChatId,
  activeAgent = null,
  agents = [],
  onSelectAgent,
  onBalanceChange
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
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
  const lastStreamPaintRef = useRef<number>(0);
  const isStreamingActiveRef = useRef<boolean>(false);

  // Toggles for "Add to chat" sheet
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  // Composer focus & voice dictation state
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);

  const mainScrollRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const micNoticeTimeoutRef = useRef<number | null>(null);

  const activeModelObj = apiModels.find(m => m.id === selectedModel);

  // Subscribe to user's saved chats & auto-clean expired chats + temp local media in the background
  useEffect(() => {
    // 1. Silent background pruning of chats and cached media older than 3 days
    cleanupExpiredChats().catch(console.error);
    cleanupExpiredMediaCache().catch(console.error);

    // 2. Real-time subscription to user's chats
    const unsubscribe = subscribeUserChats(currentUid, (chats) => {
      setSavedChats(chats);
    });

    return () => unsubscribe();
  }, [currentUid]);

  const lastHandledActiveChatIdRef = useRef<string | null | undefined>(undefined);
  const lastHandledAgentIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;
    if (activeChatId === null && (lastHandledActiveChatIdRef.current !== null || lastHandledAgentIdRef.current !== (activeAgent?.id || null))) {
      lastHandledActiveChatIdRef.current = null;
      lastHandledAgentIdRef.current = activeAgent?.id || null;
      handleNewChat();
    } else if (activeChatId && activeChatId !== lastHandledActiveChatIdRef.current) {
      const targetChat = savedChats.find(c => c.id === activeChatId);
      if (targetChat) {
        lastHandledActiveChatIdRef.current = activeChatId;
        handleSelectChat(targetChat);
      }
    }
  }, [activeChatId, activeAgent?.id, savedChats, isOpen]);

  const effectiveModel = activeAgent?.modelId || selectedModel || '';
  const effectiveModelObj = apiModels.find(m => m.id === effectiveModel) || activeModelObj;
  const effectiveModelType = inferModelMediaType(
    effectiveModel,
    effectiveModelObj?.modelType,
    effectiveModelObj?.supportedEndpoints
  );

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
      modelId: effectiveModel,
      agentId: activeAgent?.id,
      agentName: activeAgent?.name,
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
    if (isOpen && !isAutoScrollPausedRef.current && !typingMessageId) {
      scrollToBottom(false);
    }
  }, [messages.length, isOpen]);

  // Clean up any running stream, animation frame, and speech recognition on unmount or close
  useEffect(() => {
    if (!isOpen && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (streamFrameIdRef.current) {
        cancelAnimationFrame(streamFrameIdRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (micNoticeTimeoutRef.current) {
        window.clearTimeout(micNoticeTimeoutRef.current);
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

    const tick = (now: number) => {
      // Pace DOM updates at ~20 FPS (~48ms) to keep Android WebView compositor & layout memory light
      if (now - lastStreamPaintRef.current < 48) {
        streamFrameIdRef.current = requestAnimationFrame(tick);
        return;
      }
      lastStreamPaintRef.current = now;

      const target = streamTargetRef.current;
      const current = streamDisplayedRef.current;

      if (current.length < target.length) {
        const diff = target.length - current.length;

        let step = 3;
        if (diff > 240) {
          step = Math.min(Math.ceil(diff / 4), 48);
        } else if (diff > 100) {
          step = Math.min(Math.ceil(diff / 5), 24);
        } else if (diff > 35) {
          step = Math.min(Math.ceil(diff / 6), 12);
        } else if (diff > 10) {
          step = 5;
        } else {
          step = Math.min(diff, 4);
        }

        const nextLen = Math.min(current.length + step, target.length);
        const nextText = target.slice(0, nextLen);
        streamDisplayedRef.current = nextText;

        setMessages(prev =>
          prev.map(m => m.id === targetMessageId ? { ...m, text: nextText } : m)
        );

        // Direct scrollTop update (zero smooth-scroll animation queue buildup)
        if (!isAutoScrollPausedRef.current && mainScrollRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = mainScrollRef.current;
          const distanceToBottom = scrollHeight - scrollTop - clientHeight;
          if (distanceToBottom < 140) {
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
      if (onBalanceChange) {
        setTimeout(onBalanceChange, 700);
      }
    }
    setTypingMessageId(null);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !apiKey || !effectiveModel || isLoading) return;

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
    setIsComposerFocused(false);
    setIsDropdownOpen(false);
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.blur();
    }

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
    lastStreamPaintRef.current = 0;
    isStreamingActiveRef.current = true;
    isAutoScrollPausedRef.current = false;
    setIsAutoScrollPaused(false);
    scrollToBottom(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const startTime = Date.now();
    let latestSearchQueries: string[] = [];
    let latestReadUrls: string[] = [];
    setToolStatus(null);

    try {
      let finalAssistantMessage: Message;

      if (effectiveModelType === 'image' || effectiveModelType === 'video') {
        const mediaResult = effectiveModelType === 'video'
          ? await generateMediaVideo(apiKey, effectiveModel, userText, abortController.signal, {
              systemPrompt: activeAgent?.systemPrompt,
              onStatusChange: (status) => setToolStatus(status)
            })
          : await generateMediaImage(apiKey, effectiveModel, userText, abortController.signal, {
              systemPrompt: activeAgent?.systemPrompt,
              onStatusChange: (status) => setToolStatus(status)
            });

        isStreamingActiveRef.current = false;
        setToolStatus(null);
        setTypingMessageId(null);

        finalAssistantMessage = {
          id: newModelId,
          role: 'model',
          text: mediaResult.text || '',
          ...(mediaResult.mediaItems.length > 0 ? { mediaItems: mediaResult.mediaItems } : {})
        };
        setMessages(prev => prev.map(m => m.id === newModelId ? finalAssistantMessage : m));
      } else {
        // Real-time token streaming with smooth fluid animation + Custom Agent System Prompt & Tool Calling
        await streamChatResponse(
          apiKey,
          effectiveModel,
          userText,
          newHistory.slice(0, -1),
          (_chunk, accumulated) => {
            streamTargetRef.current = accumulated;
            startFluidLoop(newModelId);
          },
          abortController.signal,
          activeAgent
            ? {
                systemPrompt: activeAgent.systemPrompt,
                webSearchEnabled: activeAgent.webSearchEnabled,
                webReaderEnabled: !!activeAgent.webReaderEnabled,
                searchUrl: activeAgent.searchUrl,
                onStatusChange: (status) => setToolStatus(status),
                onSearchQueries: (queries) => {
                  latestSearchQueries = queries;
                  setMessages(prev => prev.map(m => m.id === newModelId ? { ...m, searchQueries: queries } : m));
                },
                onReadUrls: (urls) => {
                  latestReadUrls = urls;
                  setMessages(prev => prev.map(m => m.id === newModelId ? { ...m, readUrls: urls } : m));
                }
              }
            : undefined
        );

        isStreamingActiveRef.current = false;
        setToolStatus(null);

        finalAssistantMessage = {
          id: newModelId,
          role: 'model',
          text: streamTargetRef.current,
          ...(latestSearchQueries.length > 0 ? { searchQueries: latestSearchQueries } : {}),
          ...(latestReadUrls.length > 0 ? { readUrls: latestReadUrls } : {})
        };
      }

      // Persist completed chat response to Firestore
      const finalHistory = [...newHistory, finalAssistantMessage];
      persistChat(finalHistory, chatTitle);

      const durationMs = Date.now() - startTime;
      logQueryEvent({
        userId: currentUser?.id ? String(currentUser.id) : getOrInitClientId(),
        userName: currentUser?.first_name || (currentUser?.username ? `@${currentUser.username}` : 'Web User'),
        modelId: activeAgent ? `${activeAgent.name} (${effectiveModel})` : effectiveModel,
        promptSnippet: userText.slice(0, 100),
        durationMs,
        status: 'success'
      });
      if (onBalanceChange) {
        setTimeout(onBalanceChange, 700);
      }
    } catch (error: any) {
      isStreamingActiveRef.current = false;
      setToolStatus(null);
      if (error.name === 'AbortError') {
        // Generation cancelled by user, keep whatever text was generated
        return;
      }
      console.error(error);
      const durationMs = Date.now() - startTime;
      
      logQueryEvent({
        userId: currentUser?.id ? String(currentUser.id) : getOrInitClientId(),
        userName: currentUser?.first_name || (currentUser?.username ? `@${currentUser.username}` : 'Web User'),
        modelId: activeAgent ? `${activeAgent.name} (${effectiveModel})` : effectiveModel,
        promptSnippet: userText.slice(0, 100),
        durationMs,
        status: 'error',
        errorMessage: error.message
      });

      stopFluidLoop();
      setTypingMessageId(null);
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
      setToolStatus(null);
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
    if (!lastUserMessage || !apiKey || !effectiveModel) return;

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
    lastStreamPaintRef.current = 0;
    isStreamingActiveRef.current = true;
    isAutoScrollPausedRef.current = false;
    setIsAutoScrollPaused(false);
    scrollToBottom(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const startTime = Date.now();
    let latestSearchQueries: string[] = [];
    let latestReadUrls: string[] = [];
    setToolStatus(null);

    try {
      let finalAssistantMessage: Message;

      if (effectiveModelType === 'image' || effectiveModelType === 'video') {
        const mediaResult = effectiveModelType === 'video'
          ? await generateMediaVideo(apiKey, effectiveModel, lastUserMessage.text, abortController.signal, {
              systemPrompt: activeAgent?.systemPrompt,
              onStatusChange: (status) => setToolStatus(status)
            })
          : await generateMediaImage(apiKey, effectiveModel, lastUserMessage.text, abortController.signal, {
              systemPrompt: activeAgent?.systemPrompt,
              onStatusChange: (status) => setToolStatus(status)
            });

        isStreamingActiveRef.current = false;
        setToolStatus(null);
        setTypingMessageId(null);

        finalAssistantMessage = {
          id: modelId,
          role: 'model',
          text: mediaResult.text || '',
          ...(mediaResult.mediaItems.length > 0 ? { mediaItems: mediaResult.mediaItems } : {})
        };
        setMessages(prev => prev.map(m => m.id === modelId ? finalAssistantMessage : m));
      } else {
        await streamChatResponse(
          apiKey,
          effectiveModel,
          lastUserMessage.text,
          historyWithoutLast.slice(0, -1),
          (_chunk, accumulated) => {
            streamTargetRef.current = accumulated;
            startFluidLoop(modelId);
          },
          abortController.signal,
          activeAgent
            ? {
                systemPrompt: activeAgent.systemPrompt,
                webSearchEnabled: activeAgent.webSearchEnabled,
                webReaderEnabled: !!activeAgent.webReaderEnabled,
                searchUrl: activeAgent.searchUrl,
                onStatusChange: (status) => setToolStatus(status),
                onSearchQueries: (queries) => {
                  latestSearchQueries = queries;
                  setMessages(prev => prev.map(m => m.id === modelId ? { ...m, searchQueries: queries } : m));
                },
                onReadUrls: (urls) => {
                  latestReadUrls = urls;
                  setMessages(prev => prev.map(m => m.id === modelId ? { ...m, readUrls: urls } : m));
                }
              }
            : undefined
        );

        isStreamingActiveRef.current = false;
        setToolStatus(null);

        finalAssistantMessage = {
          id: modelId,
          role: 'model',
          text: streamTargetRef.current,
          ...(latestSearchQueries.length > 0 ? { searchQueries: latestSearchQueries } : {}),
          ...(latestReadUrls.length > 0 ? { readUrls: latestReadUrls } : {})
        };
      }

      persistChat([...historyWithoutLast, finalAssistantMessage]);

      const durationMs = Date.now() - startTime;
      logQueryEvent({
        userId: currentUser?.id ? String(currentUser.id) : getOrInitClientId(),
        userName: currentUser?.first_name || (currentUser?.username ? `@${currentUser.username}` : 'Web User'),
        modelId: activeAgent ? `${activeAgent.name} (${effectiveModel})` : effectiveModel,
        promptSnippet: lastUserMessage.text.slice(0, 100),
        durationMs,
        status: 'success'
      });
      if (onBalanceChange) {
        setTimeout(onBalanceChange, 700);
      }
    } catch (error: any) {
      isStreamingActiveRef.current = false;
      setToolStatus(null);
      if (error.name === 'AbortError') return;
      stopFluidLoop();
      setTypingMessageId(null);
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
      setToolStatus(null);
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
    setToolStatus(null);
    setIsHistoryOpen(false);
  };

  const handleSelectChat = (chat: ChatSession) => {
    handleStopGenerating();
    setCurrentChatId(chat.id);
    setMessages(chat.messages || []);
    setCurrentTitle(chat.title || 'Чат');
    setToolStatus(null);
    chatCreatedAtRef.current = typeof chat.createdAt === 'number' 
      ? chat.createdAt 
      : (new Date(chat.createdAt).getTime() || Date.now());
    if (onSelectAgent) {
      if (chat.agentId) {
        const matchedAgent = agents.find(a => a.id === chat.agentId) || null;
        onSelectAgent(matchedAgent);
      } else {
        onSelectAgent(null);
      }
    }
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
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const showMicNotice = (msg: string) => {
    setMicNotice(msg);
    if (micNoticeTimeoutRef.current) {
      window.clearTimeout(micNoticeTimeoutRef.current);
    }
    micNoticeTimeoutRef.current = window.setTimeout(() => {
      setMicNotice(null);
    }, 2600);
  };

  const handleToggleVoice = () => {
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      showMicNotice('Голосовий ввід не підтримується цим браузером');
      textareaRef.current?.focus();
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'uk-UA';
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
        setMicNotice(null);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results || [])
          .map((res: any) => res?.[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript) {
          setInputValue((prev) => {
            const next = prev.trim() ? `${prev.trimEnd()} ${transcript}` : transcript;
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 132)}px`;
              }
            });
            return next;
          });
          setIsComposerFocused(true);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          showMicNotice('Немає доступу до мікрофона');
        } else if (event?.error !== 'aborted' && event?.error !== 'no-speech') {
          showMicNotice('Не вдалося розпізнати голос');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      showMicNotice('Голосовий ввід недоступний');
    }
  };

  const hasInputText = inputValue.trim().length > 0;
  const isComposerExpanded =
    isComposerFocused ||
    inputValue.length > 0 ||
    isDropdownOpen ||
    isAddSheetOpen ||
    isListening;

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
            <div className="flex items-center gap-1.5 min-w-0">
              {activeAgent && (
                <span 
                  className="inline-flex items-center justify-center w-5 h-5 rounded-md text-white shrink-0"
                  style={{ backgroundColor: resolveColorToHex(activeAgent.color || '#CC785C') }}
                >
                  <Bot size={12} />
                </span>
              )}
              <span className="font-medium text-sm text-[#EDE9DF] tracking-tight truncate max-w-[170px] sm:max-w-xs">
                {activeAgent
                  ? (currentTitle !== 'Новий чат' ? currentTitle : activeAgent.name)
                  : (currentTitle !== 'Новий чат' ? currentTitle : (activeModelObj?.name || selectedModel || 'Чат'))}
              </span>
            </div>
            {(activeAgent || currentTitle !== 'Новий чат') && (
              <span className="text-[11px] text-[#9E9A92] truncate max-w-[210px] sm:max-w-xs">
                {activeAgent
                  ? `${activeAgent.name} • ${effectiveModel}`
                  : (activeModelObj?.name || selectedModel || 'Чат')}
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
            {activeAgent ? (
              <div className="max-w-md w-full flex flex-col items-center space-y-3">
                <div 
                  style={{ backgroundColor: resolveColorToHex(activeAgent.color || '#CC785C') }}
                  className="w-16 h-16 rounded-3xl text-white flex items-center justify-center shadow-lg border border-white/10"
                >
                  <Bot size={30} />
                </div>
                <div>
                  <div className="inline-flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#292723] border border-[#3C3933] text-[10px] font-semibold uppercase tracking-wider text-[#CC785C] mb-1.5">
                    <span>Кастомний Агент</span>
                    {effectiveModelType === 'image' && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-violet-300">
                          <ImageIcon size={10} />
                          Зображення
                        </span>
                      </>
                    )}
                    {effectiveModelType === 'video' && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Film size={10} />
                          Відео
                        </span>
                      </>
                    )}
                    {activeAgent.webSearchEnabled && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Globe size={10} />
                          Веб-пошук
                        </span>
                      </>
                    )}
                    {activeAgent.webReaderEnabled && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-sky-400">
                          <FileText size={10} />
                          Читач сторінок
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="font-claude-serif text-2xl sm:text-3xl font-normal text-[#EDE9DF] tracking-tight">
                    {activeAgent.name}
                  </h2>
                </div>
                {activeAgent.description ? (
                  <p className="text-xs sm:text-sm text-[#A5A096] leading-relaxed">
                    {activeAgent.description}
                  </p>
                ) : (
                  <p className="text-xs text-[#8E8B83] line-clamp-3 bg-[#21201D] border border-[#32302B] rounded-2xl px-4 py-2.5 italic">
                    {activeAgent.systemPrompt}
                  </p>
                )}
                <div className="text-[11px] font-mono text-[#7E7B74]">
                  Модель: <span className="text-[#C8C3B8]">{effectiveModel}</span>
                </div>
              </div>
            ) : (
              <>
                {activeModelObj?.providerLogoUrl ? (
                  <div 
                    style={{ backgroundColor: resolveColorToHex(activeModelObj.providerColor) }}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-md overflow-hidden"
                  >
                    <img src={activeModelObj.providerLogoUrl} alt="" className="w-full h-full object-contain p-2.5" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-[#282723] text-[#CC785C] flex items-center justify-center mb-4 border border-[#3A3834]">
                    {effectiveModelType === 'video' ? (
                      <Film size={26} />
                    ) : effectiveModelType === 'image' ? (
                      <ImageIcon size={26} />
                    ) : (
                      <Sparkles size={26} />
                    )}
                  </div>
                )}
                {effectiveModelType !== 'text' && (
                  <span className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#292723] border border-[#3C3933] text-[11px] font-medium text-[#CC785C]">
                    {effectiveModelType === 'video' ? <Film size={12} /> : <ImageIcon size={12} />}
                    <span>{effectiveModelType === 'video' ? 'Генерація відео' : 'Генерація зображень'}</span>
                  </span>
                )}
                <h2 className="font-claude-serif text-3xl font-normal text-[#EDE9DF] tracking-tight">
                  {effectiveModelType === 'video'
                    ? 'Яке відео створити?'
                    : effectiveModelType === 'image'
                    ? 'Що намалювати?'
                    : 'Чим можу допомогти?'}
                </h2>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col flex-1 pb-4">
            {messages.map((m, index) => (
              <ChatMessage 
                key={m.id} 
                message={m} 
                isLast={index === messages.length - 1}
                isTyping={typingMessageId === m.id}
                toolStatus={typingMessageId === m.id ? toolStatus : null}
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
            style={{
              bottom: isComposerExpanded
                ? 'calc(9rem + var(--safe-bottom, 0px))'
                : 'calc(5.5rem + var(--safe-bottom, 0px))'
            }}
            className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[#242320]/95 border border-[#CC785C]/90 text-[#FAF8F5] hover:bg-[#2C2A26] flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.65)] backdrop-blur-md z-30 transition-all active:scale-95 animate-in fade-in"
            title="Слідкувати за відповіддю"
          >
            <span className="w-2 h-2 rounded-full bg-[#CC785C] animate-ping" />
            <span className="text-xs font-semibold text-[#FAF8F5]">Слідкувати за текстом</span>
            <ArrowDown size={14} className="text-[#CC785C]" />
          </button>
        ) : showScrollBottom ? (
          <button
            onClick={resumeAutoScroll}
            style={{
              bottom: isComposerExpanded
                ? 'calc(9rem + var(--safe-bottom, 0px))'
                : 'calc(5.5rem + var(--safe-bottom, 0px))'
            }}
            className="fixed left-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-[#272623]/95 hover:bg-[#33312C] border border-[#ECE8E1]/35 hover:border-[#ECE8E1]/60 ring-1 ring-black/50 text-[#FAF8F5] flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.68)] backdrop-blur-md z-30 transition-all active:scale-95 animate-in fade-in zoom-in-95"
            title="До кінця чату"
            aria-label="Прокрутити до кінця чату"
          >
            <ArrowDown size={20} strokeWidth={2.2} />
          </button>
        ) : null}
      </main>

      {/* Modern Animated Morphing Input Bar (Compact resting pill -> Expanded 2-row composer) */}
      <footer
        className="px-3 sm:px-4 pt-2 bg-gradient-to-t from-[#181715] via-[#181715]/95 to-transparent shrink-0"
        style={{ paddingBottom: 'calc(0.9rem + var(--safe-bottom, 0px))' }}
      >
        <div className="max-w-3xl mx-auto w-full">
          {micNotice && (
            <div className="mb-2 text-center animate-in fade-in duration-150">
              <span className="inline-block text-[11.5px] font-medium text-[#EDE9DF] bg-[#292724] border border-[#3E3B35] rounded-full px-3 py-1 shadow-md">
                {micNotice}
              </span>
            </div>
          )}

          <div
            ref={composerRef}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('button')) {
                textareaRef.current?.focus();
              }
            }}
            className={`w-full border transition-[border-radius,border-color,background-color,padding,box-shadow] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
              isComposerExpanded
                ? 'rounded-[26px] bg-[#22211E] border-[#45423C] px-3.5 pt-3 pb-2.5 shadow-[0_14px_40px_rgba(0,0,0,0.55)]'
                : 'rounded-[28px] bg-[#201F1C] border-[#33312D] px-2 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.4)] hover:border-[#3F3D38]'
            }`}
          >
            {/* Top Row: [Inline +] [Always-mounted Textarea] [Inline Mic + Send/Stop] */}
            <div className="flex items-center">
              {/* Inline Left '+' Button (visible only in compact resting pill) */}
              <div
                className={`shrink-0 overflow-hidden transition-[width,margin,opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                  isComposerExpanded
                    ? 'w-0 mr-0 opacity-0 scale-75 pointer-events-none'
                    : 'w-10 mr-2 opacity-100 scale-100'
                }`}
              >
                <button
                  type="button"
                  tabIndex={isComposerExpanded ? -1 : 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setIsAddSheetOpen(true)}
                  className="w-10 h-10 rounded-full bg-[#2B2926] hover:bg-[#363430] text-[#ECE8E1] flex items-center justify-center transition-colors active:scale-95"
                  title="Додати до чату"
                  aria-label="Додати до чату"
                >
                  <Plus size={19} />
                </button>
              </div>

              {/* Single-mount Textarea (never unmounts, preserves focus & mobile keyboard) */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputValue}
                onFocus={() => setIsComposerFocused(true)}
                onBlur={(e) => {
                  const nextTarget = e.relatedTarget as Node | null;
                  if (nextTarget && composerRef.current?.contains(nextTarget)) {
                    return;
                  }
                  setIsComposerFocused(false);
                }}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  isListening
                    ? 'Слухаю вас...'
                    : effectiveModelType === 'video'
                      ? 'Опишіть сцену для відео...'
                      : effectiveModelType === 'image'
                        ? 'Опишіть зображення...'
                        : activeAgent
                          ? `Напишіть ${activeAgent.name}...`
                          : 'Введіть повідомлення...'
                }
                disabled={!apiKey || !effectiveModel || isLoading}
                className={`flex-1 min-w-0 bg-transparent text-[#EDE9DF] placeholder-[#8A867E] focus:outline-none resize-none transition-[padding,font-size] duration-200 motion-reduce:transition-none ${
                  isComposerExpanded
                    ? 'px-1 py-0.5 text-[16.5px] leading-[1.5]'
                    : 'px-1.5 py-2 text-[15.5px] leading-[1.35]'
                }`}
                style={{ maxHeight: '132px' }}
              />

              {/* Inline Right Controls (visible only in compact resting pill) */}
              <div
                className={`shrink-0 overflow-hidden flex items-center gap-1.5 transition-[width,margin,opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                  isComposerExpanded
                    ? 'w-0 ml-0 opacity-0 scale-75 pointer-events-none'
                    : 'w-[86px] ml-1.5 opacity-100 scale-100'
                }`}
              >
                <button
                  type="button"
                  tabIndex={isComposerExpanded ? -1 : 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleToggleVoice}
                  disabled={!apiKey || !effectiveModel || isLoading}
                  className="w-10 h-10 rounded-full bg-[#2B2926] hover:bg-[#363430] text-[#B8B4AA] hover:text-[#EDE9DF] flex items-center justify-center transition-colors active:scale-95 shrink-0 disabled:opacity-40"
                  title="Голосовий ввід"
                  aria-label="Голосовий ввід"
                >
                  <Mic size={18} />
                </button>

                {isLoading ? (
                  <button
                    type="button"
                    tabIndex={isComposerExpanded ? -1 : 0}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleStopGenerating}
                    className="w-10 h-10 rounded-full bg-[#2B2926] border border-[#CC785C]/70 hover:bg-[#383530] text-[#EDE9DF] flex items-center justify-center shadow-sm active:scale-95 transition-all shrink-0 group"
                    title="Зупинити генерацію"
                    aria-label="Зупинити генерацію"
                  >
                    <Square size={13} className="fill-[#CC785C] text-[#CC785C] group-hover:scale-110 transition-transform" />
                  </button>
                ) : (
                  <button
                    type="button"
                    tabIndex={isComposerExpanded ? -1 : 0}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleSendMessage}
                    disabled={!hasInputText || !apiKey || !effectiveModel}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                      hasInputText && apiKey && effectiveModel
                        ? 'bg-[#CC785C] hover:bg-[#D97757] text-white shadow-md active:scale-95'
                        : 'bg-[#2B2926] text-[#6E6B64] cursor-default'
                    }`}
                    title="Надіслати"
                    aria-label="Надіслати"
                  >
                    <ArrowUp size={18} strokeWidth={2.3} />
                  </button>
                )}
              </div>
            </div>

            {/* Expandable Bottom Toolbar (animated smoothly via CSS grid-rows) */}
            <div
              className={`grid transition-[grid-template-rows,opacity,margin] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                isComposerExpanded
                  ? 'grid-rows-[1fr] opacity-100 mt-2.5'
                  : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
              }`}
            >
              <div className={`min-h-0 ${isDropdownOpen ? 'overflow-visible' : 'overflow-hidden'}`}>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Expanded '+' Action Sheet Trigger */}
                    <button
                      type="button"
                      tabIndex={isComposerExpanded ? 0 : -1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setIsAddSheetOpen(true)}
                      className="w-10 h-10 rounded-full bg-[#2E2C29] hover:bg-[#3A3733] text-[#ECE8E1] flex items-center justify-center transition-colors active:scale-95 shrink-0"
                      title="Додати до чату"
                      aria-label="Додати до чату"
                    >
                      <Plus size={19} />
                    </button>

                    {/* Model Selector Pill (only shown in direct model chats; agents use their built-in model) */}
                    {!activeAgent && (
                      <div className="relative min-w-0" ref={dropdownRef}>
                        <button
                          type="button"
                          tabIndex={isComposerExpanded ? 0 : -1}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="h-10 bg-[#2E2C29] hover:bg-[#3A3733] border border-[#3E3B35] text-[#EDE9DF] rounded-full px-3.5 text-[13px] font-medium flex items-center gap-1.5 transition-colors max-w-full"
                        >
                          {activeModelObj?.providerLogoUrl ? (
                            <div
                              style={{ backgroundColor: resolveColorToHex(activeModelObj.providerColor) }}
                              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                            >
                              <img src={activeModelObj.providerLogoUrl} alt="" className="w-full h-full object-contain p-0.5" />
                            </div>
                          ) : null}
                          <span className="truncate max-w-[135px] sm:max-w-[190px]">
                            {activeModelObj ? activeModelObj.name : (selectedModel || 'Оберіть модель')}
                          </span>
                          <ChevronDown
                            size={14}
                            className={`text-[#9E9A92] shrink-0 transition-transform duration-200 ${
                              isDropdownOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {/* Model Dropdown Menu */}
                        {isDropdownOpen && (
                          <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto bg-[#252421] border border-[#3A3834] rounded-2xl shadow-2xl p-1.5 flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-3 py-1.5 text-[11px] font-semibold text-[#8A8780] uppercase tracking-wider">
                              Доступні моделі
                            </div>
                            {apiModels.map(m => {
                              const mMediaType = inferModelMediaType(m.id, m.modelType, m.supportedEndpoints);
                              return (
                                <div
                                  key={m.id}
                                  onMouseDown={(e) => e.preventDefault()}
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
                                    {mMediaType === 'image' && (
                                      <span className="inline-flex items-center gap-0.5 text-[9.5px] font-medium text-violet-300 bg-violet-950/60 px-1.5 py-0.5 rounded border border-violet-800/40">
                                        <ImageIcon size={9} />
                                        Фото
                                      </span>
                                    )}
                                    {mMediaType === 'video' && (
                                      <span className="inline-flex items-center gap-0.5 text-[9.5px] font-medium text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                                        <Film size={9} />
                                        Відео
                                      </span>
                                    )}
                                    {m.shortPriceInfo && (
                                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                                        {m.shortPriceInfo.replace(/\//g, '-')}
                                      </span>
                                    )}
                                    {m.id === selectedModel && <Check size={14} className="text-[#CC785C]" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expanded Right Controls: Voice Input + Send / Stop */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      tabIndex={isComposerExpanded ? 0 : -1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleToggleVoice}
                      disabled={!apiKey || !effectiveModel || isLoading}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                        isListening
                          ? 'bg-rose-500/20 border border-rose-500/60 text-rose-400 animate-pulse'
                          : 'bg-[#2E2C29] hover:bg-[#3A3733] text-[#B8B4AA] hover:text-[#EDE9DF]'
                      }`}
                      title={isListening ? 'Зупинити диктування' : 'Голосовий ввід'}
                      aria-label={isListening ? 'Зупинити диктування' : 'Голосовий ввід'}
                    >
                      {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>

                    {isLoading ? (
                      <button
                        type="button"
                        tabIndex={isComposerExpanded ? 0 : -1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleStopGenerating}
                        className="w-10 h-10 rounded-full bg-[#2E2C29] border border-[#CC785C]/70 hover:bg-[#3A3733] text-[#EDE9DF] flex items-center justify-center shadow-md active:scale-95 transition-all group"
                        title="Зупинити генерацію"
                        aria-label="Зупинити генерацію"
                      >
                        <Square size={13} className="fill-[#CC785C] text-[#CC785C] group-hover:scale-110 transition-transform" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        tabIndex={isComposerExpanded ? 0 : -1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleSendMessage}
                        disabled={!hasInputText || !apiKey || !effectiveModel}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          hasInputText && apiKey && effectiveModel
                            ? 'bg-[#CC785C] hover:bg-[#D97757] text-white shadow-md active:scale-95'
                            : 'bg-[#2E2C29] text-[#6E6B64] cursor-default'
                        }`}
                        title="Надіслати"
                        aria-label="Надіслати"
                      >
                        <ArrowUp size={18} strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
          className={`fixed inset-0 bg-black/60 transition-opacity duration-300 ease-out ${
            isHistoryOpen ? 'opacity-100 backdrop-blur-xs' : 'opacity-0'
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
                  const isAgentChat = Boolean(chat.agentId || chat.agentName);
                  const matchedAgentName = chat.agentName || (chat.agentId ? agents.find(a => a.id === chat.agentId)?.name : undefined);

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

                      <div className="flex items-center justify-between gap-2 text-[11px] text-[#8A8780]">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          {isAgentChat && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2D221D] border border-[#CC785C]/45 text-[#E59275] font-semibold text-[10px] shrink-0 max-w-[130px]">
                              <Bot size={10} className="shrink-0" />
                              <span className="truncate">{matchedAgentName ? `Агент: ${matchedAgentName}` : 'Агент'}</span>
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-[#1A1917] border border-[#2E2C28] text-[#D8D4CC] font-mono text-[10px] truncate max-w-[115px]">
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
