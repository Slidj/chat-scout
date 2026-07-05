import { useState, useEffect } from 'react';
import { Settings, MessageCircle, ChevronLeft, Check, Key, Shield } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { ChatPanel } from './components/ChatPanel';
import { AdminPanel } from './components/AdminPanel';
import { Provider, AiModel } from './types';
import { fetchModels, Model } from './lib/api';
import { getProviders, getModels } from './lib/db';

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
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Data State
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Navigation State
  const [currentView, setCurrentView] = useState<'home' | 'provider' | 'model'>('home');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedModelDetails, setSelectedModelDetails] = useState<AiModel | null>(null);
  
  // Api State
  const [apiModels, setApiModels] = useState<Model[]>([]);
  const [activeChatModelId, setActiveChatModelId] = useState<string>(''); // The actual model ID used for chat

  const [tgUser, setTgUser] = useState<any>(null);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      const p = await getProviders();
      const m = await getModels();
      setProviders(p);
      setModels(m);
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
        // Fallback to 64px if the API is missing or returns a value that is too small for the native header
        const rawSafeTop = window.Telegram.WebApp.contentSafeAreaInset?.top || window.Telegram.WebApp.safeAreaInset?.top || 0;
        const safeTop = Math.max(rawSafeTop, 64);
        document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
        
        // Let's also set header color to match our dark/light theme
        try {
          window.Telegram.WebApp.setHeaderColor(
            document.documentElement.classList.contains('dark') ? '#111827' : '#ffffff'
          );
        } catch (e) {}
      }

      const telegramUser = window.Telegram.WebApp.initDataUnsafe?.user;
      if (telegramUser) {
        setTgUser(telegramUser);
        if (telegramUser.id === ADMIN_TELEGRAM_ID) {
          isUserAdmin = true;
        }
      }
    }

    if (window.location.search.includes('admin=true')) {
      isUserAdmin = true;
    }

    setIsAdmin(isUserAdmin);
    loadData();
  }, []);

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
    if (!apiKey) {
      alert("Будь ласка, введіть ваш персональний API ключ у налаштуваннях для використання чату.");
      setIsSettingsOpen(true);
      return;
    }
    setActiveChatModelId(apiModelId);
    setIsChatOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans pb-20">
      {/* App Header */}
      <header 
        className="sticky top-0 z-30 flex items-center justify-between px-4 pb-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800"
        style={{ paddingTop: 'calc(0.75rem + var(--safe-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          {currentView !== 'home' ? (
            <button 
              onClick={() => {
                if (currentView === 'model') setCurrentView('provider');
                else goHome();
              }}
              className="p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
          ) : (
            tgUser?.photo_url ? (
              <img src={tgUser.photo_url} alt={tgUser.first_name} className="w-8 h-8 rounded-lg shadow-sm object-cover" />
            ) : (
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
                {tgUser?.first_name ? tgUser.first_name.charAt(0).toUpperCase() : 'S'}
              </div>
            )
          )}
          <h1 className="font-semibold text-lg text-gray-900 dark:text-white tracking-tight">
            {currentView === 'home' && (tgUser?.first_name || 'Scout AI Hub')}
            {currentView === 'provider' && selectedProvider?.name}
            {currentView === 'model' && selectedModelDetails?.name}
          </h1>
        </div>
        <div className="flex items-center">
          {isAdmin && (
            <button
              onClick={() => setIsAdminOpen(true)}
              className="p-2 mr-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Admin Panel"
            >
              <Shield size={20} />
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className={`p-2 rounded-full transition-colors ${!apiKey ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Settings size={22} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-4 max-w-3xl mx-auto">
        
        {/* HOME VIEW: Providers List */}
        {currentView === 'home' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {!apiKey && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-4 flex gap-3 items-start">
                <Key className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-300 text-sm mb-1">Потрібен API ключ</h3>
                  <p className="text-xs text-blue-700 dark:text-blue-400/80 mb-2">Щоб спілкуватися з моделями, додайте свій ключ у налаштуваннях.</p>
                  <button onClick={() => setIsSettingsOpen(true)} className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg">Додати ключ</button>
                </div>
              </div>
            )}
            
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Постачальники ШІ</h2>
              {isLoadingData ? (
                <div className="text-center py-8 text-gray-500">Завантаження...</div>
              ) : providers.length === 0 ? (
                <div className="text-center py-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
                  <p className="text-gray-500 mb-4">База даних порожня</p>
                  {isAdmin && (
                    <button onClick={() => setIsAdminOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">Відкрити Адмін Панель</button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {providers.map((provider) => (
                    <div 
                      key={provider.id}
                      onClick={() => openProvider(provider)}
                      className="group cursor-pointer bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center aspect-[4/5] justify-center"
                    >
                      <div className={`w-16 h-16 rounded-2xl ${provider.color} text-white flex items-center justify-center font-bold text-2xl shadow-inner mb-4 group-hover:scale-110 transition-transform`}>
                        {provider.name.charAt(0)}
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{provider.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{provider.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROVIDER VIEW: Models List */}
        {currentView === 'provider' && selectedProvider && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{selectedProvider.description}</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Доступні моделі</h2>
            
            <div className="space-y-3">
              {models
                .filter(m => m.providerId === selectedProvider.id)
                .filter(m => !apiKey || apiModels.some(am => am.id === m.apiModelId))
                .map(model => (
                <div 
                  key={model.id}
                  onClick={() => openModelDetails(model)}
                  className="bg-white dark:bg-[#1C2128] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer transition-colors flex overflow-hidden"
                >
                  <div className="p-4 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-base">{model.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{providers.find(p => p.id === model.providerId)?.name}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border-l border-emerald-100 dark:border-emerald-800/50 px-5 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {model.shortPriceInfo ? model.shortPriceInfo.replace(/\//g, '-') : model.priceInfo}
                    </span>
                  </div>
                </div>
              ))}
              {models
                .filter(m => m.providerId === selectedProvider.id)
                .filter(m => !apiKey || apiModels.some(am => am.id === m.apiModelId))
                .length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">Немає доступних моделей для цього постачальника за вашим API ключем.</p>
              )}
            </div>
          </div>
        )}

        {/* MODEL DETAILS VIEW */}
        {currentView === 'model' && selectedModelDetails && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-gray-800 shadow-sm text-center max-w-md mx-auto mt-4">
              <div className={`w-20 h-20 mx-auto rounded-3xl ${providers.find(p => p.id === selectedModelDetails.providerId)?.color || 'bg-gray-600'} text-white flex items-center justify-center font-bold text-3xl shadow-inner mb-6`}>
                 {providers.find(p => p.id === selectedModelDetails.providerId)?.name.charAt(0) || 'M'}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{selectedModelDetails.name}</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{selectedModelDetails.description}</p>
              
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mb-8 text-left">
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-500">Вартість</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{selectedModelDetails.priceInfo}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-500">API ID</span>
                  <span className="text-xs font-mono bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-800 dark:text-gray-200">{selectedModelDetails.apiModelId}</span>
                </div>
              </div>

              <button
                onClick={() => activateModelForChat(selectedModelDetails.apiModelId)}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all flex justify-center items-center gap-2"
              >
                <MessageCircle size={20} />
                Почати чат з цією моделлю
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Floating Chat Button */}
      <button
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-6 right-4 sm:right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center z-30"
        aria-label="Open Chat"
      >
        <MessageCircle size={28} />
        {activeChatModelId && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-950 rounded-full"></span>
        )}
      </button>

      {/* Chat Panel Overlay */}
      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        apiKey={apiKey}
        selectedModel={activeChatModelId}
        onChangeModel={setActiveChatModelId}
        apiModels={apiModels}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        currentApiKey={apiKey}
        onSave={handleSaveApiKey}
      />

      {isAdminOpen && (
        <AdminPanel 
          onClose={() => {
            setIsAdminOpen(false);
            loadData();
          }} 
          apiModels={apiModels}
        />
      )}
    </div>
  );
}


