import { useState, useEffect } from 'react';
import { 
  Menu, Settings, MessageSquare, ChevronLeft, Shield, Key, Search,
  Plus, Layers, Cpu, Code2, Sparkles, X, Filter, SlidersHorizontal, ArrowRight,
  Wallet, Mail, Gift, CreditCard, Trash2
} from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { ChatPanel } from './components/ChatPanel';
import { AdminPanel } from './components/AdminPanel';
import { TopupModal } from './components/TopupModal';
import { CouponCardModal } from './components/CouponCardModal';
import { AppPreloader } from './components/AppPreloader';
import { Provider, AiModel } from './types';
import { fetchModels, Model } from './lib/api';
import { 
  getProviders, getModels, trackUserSession, subscribeToCurrentUser, getOrInitClientId,
  TopupRequest, UserCoupon, subscribeUserCoupons, subscribeToTopups,
  subscribePreloaderSettings, getCachedPreloaderSettings, PreloaderSettings, DEFAULT_PRELOADER_SETTINGS,
  ChatSession, subscribeUserChats, deleteChatSession
} from './lib/db';
import { getTierClasses, getTierTextColor, getTierSubtextColor, resolveColorToHex } from './lib/utils';

declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
    };
  }
}

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('app_api_key') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Topup & Coupons State
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [userCoupons, setUserCoupons] = useState<UserCoupon[]>([]);
  const [allUserTopups, setAllUserTopups] = useState<TopupRequest[]>([]);

  // User Chats State
  const [userChats, setUserChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Preloader State
  const [preloaderSettings, setPreloaderSettings] = useState<PreloaderSettings>(getCachedPreloaderSettings);
  const [isPreloaderActive, setIsPreloaderActive] = useState<boolean>(true);
  
  // Data State
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Search & Navigation State
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<'home' | 'provider' | 'model'>('home');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedModelDetails, setSelectedModelDetails] = useState<AiModel | null>(null);
  const [activeTab, setActiveTab] = useState<'providers' | 'models'>('providers');
  
  // Api State
  const [apiModels, setApiModels] = useState<Model[]>([]);
  const [activeChatModelId, setActiveChatModelId] = useState<string>(''); // The actual model ID used for chat

  const [tgUser, setTgUser] = useState<any>(null);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      const p = await getProviders();
      const m = await getModels();
      setProviders(p);
      setModels(m);
      if (m.length > 0 && !activeChatModelId) {
        setActiveChatModelId(m[0].apiModelId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    let isUserAdmin = false;
    const ADMIN_TELEGRAM_ID = 1365018137;

    // Initialize Telegram Mini App
    if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      try {
        if (window.Telegram.WebApp.isVersionAtLeast?.('8.0') && window.Telegram.WebApp.requestFullscreen) {
          window.Telegram.WebApp.requestFullscreen();
        }
        if (window.Telegram.WebApp.isVersionAtLeast?.('7.7') && window.Telegram.WebApp.disableVerticalSwipes) {
          window.Telegram.WebApp.disableVerticalSwipes();
        }
      } catch (e) {}

      const platform = window.Telegram.WebApp.platform;
      if (platform && platform !== 'unknown') {
        const rawSafeTop = window.Telegram.WebApp.contentSafeAreaInset?.top || window.Telegram.WebApp.safeAreaInset?.top || 0;
        const safeTop = Math.max(rawSafeTop, 56);
        document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
        
        try {
          window.Telegram.WebApp.setHeaderColor('#171614');
        } catch (e) {}
      }

      const telegramUser = window.Telegram.WebApp.initDataUnsafe?.user;
      const currentUid = telegramUser?.id ? String(telegramUser.id) : getOrInitClientId();
      
      if (telegramUser) {
        setTgUser(telegramUser);
        trackUserSession(telegramUser);
        if (telegramUser.id === ADMIN_TELEGRAM_ID) {
          isUserAdmin = true;
        }
      } else {
        trackUserSession();
      }

      // Live subscription to block status
      subscribeToCurrentUser(currentUid, (u) => {
        if (u?.isBlocked) {
          setIsUserBlocked(true);
          setBlockedReason(u.blockedReason || 'Обмеження доступу за рішенням адміністрації');
          setIsChatOpen(false);
        } else {
          setIsUserBlocked(false);
          setBlockedReason(null);
        }
      });
    } else {
      const currentUid = getOrInitClientId();
      trackUserSession();
      subscribeToCurrentUser(currentUid, (u) => {
        if (u?.isBlocked) {
          setIsUserBlocked(true);
          setBlockedReason(u.blockedReason || 'Обмеження доступу за рішенням адміністрації');
          setIsChatOpen(false);
        } else {
          setIsUserBlocked(false);
          setBlockedReason(null);
        }
      });
    }

    // Subscribe to current user's coupons and top-up requests
    const activeUid = window.Telegram?.WebApp?.initDataUnsafe?.user?.id 
      ? String(window.Telegram.WebApp.initDataUnsafe.user.id) 
      : getOrInitClientId();

    const unsubCoupons = subscribeUserCoupons(activeUid, (coupons) => {
      setUserCoupons(coupons);
    });

    const unsubTopups = subscribeToTopups((all) => {
      setAllUserTopups(all.filter(t => t.userId === activeUid));
    });

    const unsubChats = subscribeUserChats(activeUid, (chats) => {
      setUserChats(chats);
    });

    const unsubPreloader = subscribePreloaderSettings((settings) => {
      setPreloaderSettings(settings);
      if (!settings.isEnabled) {
        setIsPreloaderActive(false);
      }
    });

    if (window.location.search.includes('admin=true')) {
      isUserAdmin = true;
    }

    setIsAdmin(isUserAdmin);
    loadData();

    return () => {
      unsubCoupons();
      unsubTopups();
      unsubChats();
      unsubPreloader();
    };
  }, []);

  const unreadCouponsCount = userCoupons.filter(c => !c.isRead).length;

  useEffect(() => {
    if (apiKey) {
      loadApiModels(apiKey);
    }
  }, [apiKey]);

  const loadApiModels = async (key: string) => {
    try {
      const apiM = await fetchModels(key);
      setApiModels(apiM);
    } catch (error) {
      console.error("Error loading models from API", error);
    }
  };

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('app_api_key', key);
    loadApiModels(key);
  };

  const goHome = () => {
    setCurrentView('home');
    setSelectedProvider(null);
    setSelectedModelDetails(null);
  };

  const openProvider = (provider: Provider) => {
    setSelectedProvider(provider);
    setCurrentView('provider');
  };

  const openModelDetails = (model: AiModel) => {
    setSelectedModelDetails(model);
    setCurrentView('model');
  };

  const activateModelForChat = (apiModelId: string) => {
    if (isUserBlocked) return;
    if (!apiKey) {
      alert("Будь ласка, введіть ваш персональний API ключ у налаштуваннях для використання чату.");
      setIsSettingsOpen(true);
      return;
    }
    setActiveChatModelId(apiModelId);
    setIsChatOpen(true);
  };

  const handleStartNewChat = () => {
    if (isUserBlocked) return;
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }
    if (!activeChatModelId && models.length > 0) {
      setActiveChatModelId(models[0].apiModelId);
    }
    setActiveChatId(null);
    setIsChatOpen(true);
  };

  const handleSelectChatFromDrawer = (chat: ChatSession) => {
    if (isUserBlocked) return;
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }
    setActiveChatId(chat.id);
    setIsChatOpen(true);
    setIsDrawerOpen(false);
  };

  const handleDeleteChatFromDrawer = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Видалити цей чат з історії та з бази даних?')) {
      try {
        await deleteChatSession(chatId);
        if (activeChatId === chatId) {
          setActiveChatId(null);
        }
      } catch (err) {
        console.error('Error deleting chat from drawer:', err);
      }
    }
  };

  // Filtered providers and models based on search
  const filteredProviders = providers.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredModels = models.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.apiModelId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const enrichedChatModels = models.length > 0
    ? models
        .filter(m => !apiKey || apiModels.length === 0 || apiModels.some(am => am.id === m.apiModelId))
        .map(m => {
          const prov = providers.find(p => p.id === m.providerId);
          return {
            id: m.apiModelId,
            name: m.name,
            tier: m.tier,
            shortPriceInfo: m.shortPriceInfo,
            priceInfo: m.priceInfo,
            providerName: prov?.name,
            providerColor: prov?.color,
            providerLogoUrl: prov?.logoUrl,
          };
        })
    : apiModels.map(am => ({ id: am.id, name: am.name, tier: 'common' }));

  return (
    <div className="min-h-screen bg-[#171614] text-[#ECE8E1] font-sans pb-24 selection:bg-[#CC785C]/30 selection:text-white">
      
      {/* App Preloader (Video/GIF for 1st visit / new video, Harmonic Wave for repeat visits) */}
      {isPreloaderActive && (
        <AppPreloader
          settings={preloaderSettings}
          onFinished={() => setIsPreloaderActive(false)}
        />
      )}

      {/* Claude Mobile Top App Bar (Screenshot 2) */}
      <header 
        className="sticky top-0 z-30 flex items-center justify-between px-4 pb-3 bg-[#171614]/90 backdrop-blur-md border-b border-[#2C2A26]"
        style={{ paddingTop: 'calc(2.75rem + var(--safe-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          {currentView !== 'home' ? (
            <button 
              onClick={() => {
                if (currentView === 'model') setCurrentView('provider');
                else goHome();
              }}
              className="p-2 -ml-2 rounded-full hover:bg-[#252421] text-[#ECE8E1] transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
          ) : (
            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 -ml-2 rounded-full hover:bg-[#252421] text-[#ECE8E1] transition-colors"
              title="Меню"
            >
              <Menu size={22} />
            </button>
          )}

          <h1 className="font-semibold text-base text-[#ECE8E1] tracking-tight">
            {currentView === 'home' && (searchQuery ? 'Пошук' : 'Chats')}
            {currentView === 'provider' && selectedProvider?.name}
            {currentView === 'model' && selectedModelDetails?.name}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Animated Envelope for Topup / Admin Coupon notifications */}
          {(userCoupons.length > 0 || unreadCouponsCount > 0) && (
            <button
              onClick={() => setIsCouponModalOpen(true)}
              className={`relative p-2 rounded-full transition-all ${
                unreadCouponsCount > 0 
                  ? 'animate-envelope-pulse ring-1 ring-amber-500/40 bg-[#25201A]' 
                  : 'text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#252421]'
              }`}
              title={unreadCouponsCount > 0 ? "Вам надіслано новий купон на поповнення!" : "Мої купони"}
            >
              <Mail size={20} className={unreadCouponsCount > 0 ? 'stroke-[2.2]' : ''} />
              {unreadCouponsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-[#181715]"></span>
                </span>
              )}
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setIsAdminOpen(true)}
              className="p-2 rounded-full text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#252421] transition-colors"
              title="Admin Panel"
            >
              <Shield size={20} />
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className={`p-2 rounded-full transition-colors ${!apiKey ? 'text-[#CC785C] animate-pulse' : 'text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#252421]'}`}
            title="Налаштування"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-4 max-w-3xl mx-auto space-y-6">
        
        {/* Search Bar - Claude Style (Screenshot 2) */}
        {currentView === 'home' && (
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#76736C]" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-[#23221F] border border-[#383632] hover:border-[#4B4842] focus:border-[#CC785C] rounded-2xl pl-10 pr-10 py-2.5 text-sm text-[#ECE8E1] placeholder-[#76736C] focus:outline-none transition-all shadow-xs"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#76736C] hover:text-[#ECE8E1]"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* API Key Banner if missing */}
        {!apiKey && (
          <div className="bg-[#242320] border border-[#3E3C37] rounded-2xl p-4 flex gap-3.5 items-start">
            <div className="p-2 bg-[#2E2C29] text-[#CC785C] rounded-xl shrink-0">
              <Key size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm text-[#ECE8E1] mb-1">Потрібен API ключ</h3>
              <p className="text-xs text-[#9E9A92] mb-3 leading-relaxed">
                Додайте свій безкоштовний або персональний ключ, щоб розпочати діалоги з моделями.
              </p>
              <button 
                onClick={() => setIsSettingsOpen(true)} 
                className="text-xs font-semibold bg-[#CC785C] hover:bg-[#D97757] text-white px-3.5 py-1.5 rounded-lg transition-colors shadow-xs"
              >
                Ввести ключ
              </button>
            </div>
          </div>
        )}

        {/* HOME VIEW: Providers & Models Catalog */}
        {currentView === 'home' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* View Selector Tabs: Providers vs Models */}
            <div className="flex items-center gap-2 border-b border-[#2C2A26] pb-2">
              <button
                onClick={() => setActiveTab('providers')}
                className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                  activeTab === 'providers' 
                    ? 'bg-[#2E2C29] text-[#ECE8E1] font-semibold border border-[#3A3834]' 
                    : 'text-[#8A8780] hover:text-[#ECE8E1]'
                }`}
              >
                Постачальники ({filteredProviders.length})
              </button>
              <button
                onClick={() => setActiveTab('models')}
                className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                  activeTab === 'models' 
                    ? 'bg-[#2E2C29] text-[#ECE8E1] font-semibold border border-[#3A3834]' 
                    : 'text-[#8A8780] hover:text-[#ECE8E1]'
                }`}
              >
                Всі Моделі ({filteredModels.length})
              </button>
            </div>

            {isLoadingData ? (
              <div className="text-center py-16 text-[#8A8780] text-sm">Завантаження каталогу...</div>
            ) : activeTab === 'providers' ? (
              
              /* Providers Grid */
              <div>
                {filteredProviders.length === 0 ? (
                  <div className="text-center py-12 bg-[#242320] rounded-2xl border border-[#363430]">
                    <p className="text-sm text-[#9E9A92] mb-3">Постачальників не знайдено</p>
                    {isAdmin && (
                      <button onClick={() => setIsAdminOpen(true)} className="bg-[#CC785C] text-white px-4 py-2 rounded-xl text-xs font-semibold">
                        Відкрити адмінку
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                    {filteredProviders.map((provider) => {
                      const hexColor = resolveColorToHex(provider.color);
                      const modelCount = models.filter(m => m.providerId === provider.id).length;
                      return (
                        <div 
                          key={provider.id}
                          onClick={() => openProvider(provider)}
                          className="group cursor-pointer bg-[#242320] hover:bg-[#2A2926] rounded-2xl p-4 border border-[#363430] hover:border-[#4B4842] shadow-xs hover:shadow-md transition-all flex flex-col items-center text-center aspect-[4/5] justify-center relative overflow-hidden"
                        >
                          <div 
                            style={{ backgroundColor: hexColor }}
                            className="w-16 h-16 rounded-2xl text-white flex items-center justify-center font-bold text-2xl shadow-md mb-3.5 group-hover:scale-105 transition-transform overflow-hidden relative"
                          >
                            {provider.logoUrl ? (
                              <img 
                                src={provider.logoUrl} 
                                alt={provider.name} 
                                className="w-full h-full object-contain p-2.5 drop-shadow-sm" 
                              />
                            ) : (
                              <span>{provider.name.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          
                          <h3 className="font-semibold text-[#ECE8E1] text-sm group-hover:text-white transition-colors">{provider.name}</h3>
                          <p className="text-xs text-[#9E9A92] mt-1 line-clamp-2 leading-relaxed">{provider.description}</p>
                          <span className="text-[11px] text-[#7A776F] mt-2 font-medium">
                            {modelCount} {modelCount === 1 ? 'модель' : 'моделей'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            ) : (

              /* All Models List */
              <div className="space-y-3">
                {filteredModels.map(model => {
                  const prov = providers.find(p => p.id === model.providerId);
                  return (
                    <div 
                      key={model.id}
                      onClick={() => openModelDetails(model)}
                      className={`rounded-2xl cursor-pointer transition-all flex overflow-hidden relative border ${getTierClasses(model.tier)}`}
                    >
                      {model.tier && model.tier !== 'common' && (
                        <div className="stars-container opacity-40"></div>
                      )}
                      
                      <div className="p-3.5 flex-1 relative z-10 flex items-center gap-3">
                        {prov?.logoUrl ? (
                          <div 
                            style={{ backgroundColor: resolveColorToHex(prov.color) }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-xs"
                          >
                            <img src={prov.logoUrl} alt="" className="w-full h-full object-contain p-1.5" />
                          </div>
                        ) : null}
                        <div className="min-w-0">
                          <h3 className={`font-semibold text-sm ${getTierTextColor(model.tier)}`}>{model.name}</h3>
                          <p className={`text-xs mt-0.5 truncate ${getTierSubtextColor(model.tier)}`}>{prov?.name}</p>
                        </div>
                      </div>

                      <div className="px-4 flex items-center justify-center shrink-0 relative z-10 border-l border-[#33312D]/60 bg-[#1D1C19]/40">
                        <span className="text-xs font-semibold text-emerald-400 whitespace-nowrap">
                          {model.shortPriceInfo ? model.shortPriceInfo.replace(/\//g, '-') : model.priceInfo}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            )}

          </div>
        )}

        {/* PROVIDER VIEW: Models of Selected Provider */}
        {currentView === 'provider' && selectedProvider && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Provider banner in Claude dark style */}
            <div className="bg-[#242320] rounded-2xl p-4 border border-[#363430] flex items-center gap-4">
              <div 
                style={{ backgroundColor: resolveColorToHex(selectedProvider.color) }}
                className="w-14 h-14 rounded-2xl text-white flex items-center justify-center font-bold text-2xl shadow-sm shrink-0 overflow-hidden relative"
              >
                {selectedProvider.logoUrl ? (
                  <img src={selectedProvider.logoUrl} alt={selectedProvider.name} className="w-full h-full object-contain p-2" />
                ) : (
                  <span>{selectedProvider.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#ECE8E1]">{selectedProvider.name}</h2>
                <p className="text-xs text-[#9E9A92] mt-0.5 leading-relaxed line-clamp-2">{selectedProvider.description}</p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <h3 className="text-sm font-semibold text-[#ECE8E1]">Доступні моделі</h3>
              <span className="text-xs text-[#8A8780]">
                {models.filter(m => m.providerId === selectedProvider.id).length} моделей
              </span>
            </div>
            
            <div className="space-y-3">
              {models
                .filter(m => m.providerId === selectedProvider.id)
                .map(model => (
                <div 
                  key={model.id}
                  onClick={() => openModelDetails(model)}
                  className={`rounded-2xl cursor-pointer transition-all flex overflow-hidden relative border ${getTierClasses(model.tier)}`}
                >
                  {model.tier && model.tier !== 'common' && (
                    <div className="stars-container opacity-40"></div>
                  )}
                  <div className="p-3.5 flex-1 relative z-10">
                    <h3 className={`font-semibold text-sm ${getTierTextColor(model.tier)}`}>{model.name}</h3>
                    <p className={`text-xs mt-0.5 line-clamp-1 ${getTierSubtextColor(model.tier)}`}>{model.description}</p>
                  </div>
                  <div className="px-4 flex items-center justify-center shrink-0 relative z-10 border-l border-[#33312D]/60 bg-[#1D1C19]/40">
                    <span className="text-xs font-semibold text-emerald-400 whitespace-nowrap">
                      {model.shortPriceInfo ? model.shortPriceInfo.replace(/\//g, '-') : model.priceInfo}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODEL DETAILS VIEW */}
        {currentView === 'model' && selectedModelDetails && (() => {
          const prov = providers.find(p => p.id === selectedModelDetails.providerId);
          const hexColor = resolveColorToHex(prov?.color || '#CC785C');
          return (
            <div className="animate-in fade-in duration-200">
              <div className="bg-[#242320] rounded-3xl p-6 sm:p-8 border border-[#363430] shadow-md text-center max-w-md mx-auto">
                <div 
                  style={{ backgroundColor: hexColor }}
                  className="w-20 h-20 mx-auto rounded-3xl text-white flex items-center justify-center font-bold text-3xl shadow-md mb-5 overflow-hidden relative"
                >
                  {prov?.logoUrl ? (
                    <img src={prov.logoUrl} alt={prov.name} className="w-full h-full object-contain p-3 drop-shadow-sm" />
                  ) : (
                    <span>{prov?.name.charAt(0).toUpperCase() || 'M'}</span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-[#ECE8E1] mb-2">{selectedModelDetails.name}</h2>
                <p className="text-xs text-[#9E9A92] mb-6 leading-relaxed">{selectedModelDetails.description}</p>
                
                <div className="bg-[#1C1B18] border border-[#33312D] rounded-2xl p-4 mb-6 text-left space-y-3">
                  <div className="flex justify-between items-center py-1 border-b border-[#2C2A26]">
                    <span className="text-xs text-[#8A8780]">Постачальник</span>
                    <span className="text-xs font-medium text-[#ECE8E1] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hexColor }} />
                      {prov?.name || 'Невідомий'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[#2C2A26]">
                    <span className="text-xs text-[#8A8780]">Вартість</span>
                    <span className="text-xs font-medium text-[#ECE8E1]">{selectedModelDetails.priceInfo}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-[#8A8780]">API ID</span>
                    <span className="text-[11px] font-mono bg-[#282724] px-2 py-0.5 rounded text-[#CC785C]">{selectedModelDetails.apiModelId}</span>
                  </div>
                </div>

                <button
                  onClick={() => activateModelForChat(selectedModelDetails.apiModelId)}
                  className="w-full py-3.5 bg-[#CC785C] hover:bg-[#D97757] text-white font-medium rounded-xl shadow-md transition-all flex justify-center items-center gap-2 active:scale-98 text-sm"
                >
                  <MessageSquare size={18} />
                  Почати чат з цією моделлю
                </button>
              </div>
            </div>
          );
        })()}
      </main>

      {/* Claude Signature Floating "+ New chat" Pill (Screenshot 1 & Screenshot 2) */}
      <div 
        className="fixed bottom-6 right-4 sm:right-6 z-30"
        style={{ marginBottom: 'var(--safe-bottom, 0px)' }}
      >
        <button
          onClick={handleStartNewChat}
          className="bg-[#FAF8F5] hover:bg-white text-black font-semibold text-sm px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 active:scale-95 transition-all"
          title="Новий чат"
        >
          <Plus size={18} className="text-black" />
          <span>New chat</span>
        </button>
      </div>

      {/* Claude Left Navigation Drawer (Screenshot 1 & Smooth Slide Transition) */}
      <div 
        className={`fixed inset-0 z-50 flex transition-[visibility] duration-300 ${
          isDrawerOpen ? 'pointer-events-auto visible' : 'pointer-events-none invisible'
        }`}
      >
        {/* Dark Backdrop */}
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ease-out ${
            isDrawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsDrawerOpen(false)}
        />

        {/* Drawer Panel */}
        <div 
          className={`relative w-72 sm:w-80 bg-[#191816] border-r border-[#2C2B27] h-full flex flex-col p-5 shadow-2xl z-10 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={(e) => e.stopPropagation()}
          style={{ paddingTop: 'calc(2.5rem + var(--safe-top, 0px))', paddingBottom: 'calc(1.5rem + var(--safe-bottom, 0px))' }}
        >
            {/* Wordmark (Screenshot 1) */}
            <div className="flex items-center justify-between mb-8 px-1">
              <h1 className="font-claude-serif text-3xl font-normal text-[#ECE8E1] tracking-tight">
                Claude
              </h1>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-full text-[#8A8780] hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Main Menu Links (Screenshot 1) */}
            <div className="space-y-1">
              <div 
                onClick={() => { goHome(); setActiveTab('providers'); setIsDrawerOpen(false); }}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl cursor-pointer transition-colors text-sm font-medium ${
                  currentView === 'home' && !isChatOpen ? 'bg-[#2E2C29] text-[#ECE8E1]' : 'text-[#8A8780] hover:text-[#ECE8E1] hover:bg-[#242320]'
                }`}
              >
                <MessageSquare size={18} />
                <span>Chats</span>
              </div>

              <div 
                onClick={() => { goHome(); setActiveTab('models'); setIsDrawerOpen(false); }}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl cursor-pointer transition-colors text-sm font-medium text-[#8A8780] hover:text-[#ECE8E1] hover:bg-[#242320]"
              >
                <Cpu size={18} />
                <span>Projects</span>
              </div>

              <div 
                onClick={() => { handleStartNewChat(); setIsDrawerOpen(false); }}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl cursor-pointer transition-colors text-sm font-medium text-[#8A8780] hover:text-[#ECE8E1] hover:bg-[#242320]"
              >
                <Code2 size={18} />
                <span>Code</span>
              </div>

              {/* Top-up Balance Item */}
              <div 
                onClick={() => { setIsTopupModalOpen(true); setIsDrawerOpen(false); }}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl cursor-pointer transition-all text-sm font-medium text-[#ECE8E1] bg-[#22201D] hover:bg-[#2A2824] border border-[#3A352F] hover:border-[#CC785C]/50 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-[#3D291F] text-[#CC785C] flex items-center justify-center">
                    <Wallet size={14} />
                  </div>
                  <span className="group-hover:text-[#FAF8F5]">Поповнити баланс</span>
                </div>
                <span className="text-[10px] font-semibold text-[#CC785C] bg-[#34241B] px-2 py-0.5 rounded-full border border-[#523425]">
                  ₴ Карта
                </span>
              </div>

              {/* User Coupons Item */}
              {userCoupons.length > 0 && (
                <div 
                  onClick={() => { setIsCouponModalOpen(true); setIsDrawerOpen(false); }}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl cursor-pointer transition-all text-sm font-medium text-[#ECE8E1] hover:bg-[#242320] group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-[#3C321E] text-amber-400 flex items-center justify-center">
                      <Gift size={14} />
                    </div>
                    <span>Мої купони</span>
                  </div>
                  {unreadCouponsCount > 0 ? (
                    <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full animate-pulse shadow-sm">
                      +{unreadCouponsCount} нові
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-[#8A8780] bg-[#252421] px-2 py-0.5 rounded-full">
                      {userCoupons.length}
                    </span>
                  )}
                </div>
              )}

              {isAdmin && (
                <div 
                  onClick={() => { setIsAdminOpen(true); setIsDrawerOpen(false); }}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl cursor-pointer transition-colors text-sm font-medium text-[#8A8780] hover:text-[#ECE8E1] hover:bg-[#242320]"
                >
                  <Shield size={18} />
                  <span>Artifacts / Admin</span>
                </div>
              )}
            </div>

            {/* Recents Section - Real User Chat History (Screenshot 2) */}
            <div className="mt-6 flex-1 overflow-y-auto pr-1 min-h-[160px]">
              <div className="flex items-center justify-between px-3.5 mb-2">
                <span className="text-xs font-semibold text-[#76736C] uppercase tracking-wider">
                  Recents
                </span>
                {userChats.length > 0 && (
                  <span className="text-[10px] font-mono text-[#8A8780] bg-[#22201D] px-2 py-0.5 rounded-full border border-[#34322E]">
                    {userChats.length}
                  </span>
                )}
              </div>

              {userChats.length === 0 ? (
                <div className="px-3.5 py-4 text-center border border-dashed border-[#2E2C28] rounded-2xl bg-[#1C1B18]/50 my-1">
                  <MessageSquare size={18} className="mx-auto text-[#66635C] mb-1.5" />
                  <p className="text-xs text-[#8A8780] font-medium">Немає збережених чатів</p>
                  <p className="text-[11px] text-[#66635C] mt-0.5">Почніть новий діалог з ШІ</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {userChats.slice(0, 30).map(chat => {
                    const isSelected = activeChatId === chat.id && isChatOpen;
                    return (
                      <div
                        key={chat.id}
                        onClick={() => handleSelectChatFromDrawer(chat)}
                        className={`group relative flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-[#2E2C29] text-[#ECE8E1] font-semibold border border-[#3E3C37]' 
                            : 'text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#242320]'
                        }`}
                        title={chat.title || 'Чат'}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-1">
                          <MessageSquare 
                            size={15} 
                            className={`shrink-0 ${isSelected ? 'text-[#CC785C]' : 'text-[#76736C] group-hover:text-[#CC785C]'}`} 
                          />
                          <span className="truncate font-medium">{chat.title || 'Новий діалог'}</span>
                        </div>

                        {/* Delete Chat Button (Visible on hover on desktop, always accessible on mobile) */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteChatFromDrawer(chat.id, e)}
                          className="p-1.5 rounded-lg text-[#76736C] hover:text-red-400 hover:bg-red-950/40 transition-colors opacity-80 sm:opacity-0 group-hover:opacity-100 shrink-0"
                          title="Видалити чат з бази даних"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Bar: User Avatar & New Chat (Screenshot 1) */}
            <div className="pt-4 border-t border-[#2C2B27] flex items-center justify-between">
              {/* User Avatar in signature Claude Terracotta #CC785C */}
              {tgUser?.photo_url ? (
                <img 
                  src={tgUser.photo_url} 
                  alt={tgUser.first_name} 
                  className="w-10 h-10 rounded-full object-cover border border-[#44413C]" 
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#CC785C] text-white font-bold flex items-center justify-center text-sm shadow-sm">
                  {tgUser?.first_name ? tgUser.first_name.charAt(0).toUpperCase() : 'Є'}
                </div>
              )}

              {/* + New chat Pill in drawer */}
              <button
                onClick={() => { handleStartNewChat(); setIsDrawerOpen(false); }}
                className="bg-[#FAF8F5] hover:bg-white text-black font-semibold text-xs px-4 py-2 rounded-full shadow-md flex items-center gap-1.5 transition-all"
              >
                <Plus size={16} />
                <span>New chat</span>
              </button>
            </div>

          </div>
        </div>

      {/* Claude Chat Panel Overlay */}
      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        apiKey={apiKey}
        selectedModel={activeChatModelId}
        onChangeModel={setActiveChatModelId}
        apiModels={enrichedChatModels}
        currentUser={tgUser}
        unreadCouponsCount={unreadCouponsCount}
        onOpenCoupons={() => setIsCouponModalOpen(true)}
        activeChatId={activeChatId}
      />

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        currentApiKey={apiKey}
        onSave={handleSaveApiKey}
      />

      {/* Topup Request Modal */}
      <TopupModal
        isOpen={isTopupModalOpen}
        onClose={() => setIsTopupModalOpen(false)}
        currentUser={tgUser}
        userRequests={allUserTopups}
      />

      {/* Coupon Digital Card Modal */}
      <CouponCardModal
        isOpen={isCouponModalOpen}
        onClose={() => setIsCouponModalOpen(false)}
        coupons={userCoupons}
        onStartChat={handleStartNewChat}
      />

      {/* Admin Panel */}
      {isAdminOpen && (
        <AdminPanel 
          onClose={() => {
            setIsAdminOpen(false);
            loadData();
          }} 
          apiModels={apiModels}
          currentUser={tgUser}
        />
      )}

      {/* Blocked User Polite Notice Modal */}
      {isUserBlocked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-[#242320] text-[#ECE8E1] p-6 sm:p-8 rounded-3xl w-full max-w-md shadow-2xl border border-[#443830] text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#3D2820] text-[#CC785C] border border-[#5A382A] flex items-center justify-center mx-auto shadow-md">
              <Shield size={32} />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-[#FAF8F5] tracking-tight">
                Доступ до сервісу обмежено
              </h3>
              <p className="text-xs sm:text-sm text-[#A09D95] leading-relaxed">
                Шановний користувачу! Наразі дія вашого облікового запису тимчасово призупинена відповідно до правил використання або за рішенням адміністрації.
              </p>
            </div>

            {blockedReason && (
              <div className="p-3 bg-[#1B1A17] border border-[#33312D] rounded-2xl text-xs text-[#8E8B83]">
                <span className="font-semibold text-[#CC785C]">Причина:</span> {blockedReason}
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <a 
                href="https://t.me/slidj71" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full py-3 bg-[#CC785C] hover:bg-[#D97757] text-white rounded-2xl text-xs sm:text-sm font-semibold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Зв'язатися з адміністратором</span>
              </a>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 bg-[#1B1A17] hover:bg-[#2B2A27] text-[#8E8B83] hover:text-[#ECE8E1] rounded-2xl text-xs font-medium border border-[#363430] transition-colors"
              >
                Оновити статус
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
