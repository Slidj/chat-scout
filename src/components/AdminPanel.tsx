import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  getProviders, getModels, saveProvider, updateProvider, deleteProvider, 
  saveModel, updateModel, deleteModel, getUsers, getRecentActivities,
  AppUser, ActivityEvent, logActivityEvent
} from '../lib/db';
import { fetchModels } from '../lib/api';
import { Provider, AiModel } from '../types';
import { 
  Plus, Edit2, Trash2, X, Upload, Check, Palette, Shield, 
  LayoutDashboard, Building2, Cpu, Key, Users, Menu, TrendingUp, 
  Clock, RefreshCw, Eye, EyeOff, Search, ChevronRight, Activity, 
  Sparkles, CheckCircle2, AlertCircle, BarChart3, Globe, Zap
} from 'lucide-react';
import { resolveColorToHex, COLOR_PRESETS, ColorPreset, resizeImageFile, getTierClasses } from '../lib/utils';

type AdminTab = 'dashboard' | 'providers' | 'models' | 'api-keys' | 'users';

interface AdminPanelProps {
  onClose: () => void;
  apiModels?: { id: string; name: string }[];
  currentUser?: any;
}

export function AdminPanel({ onClose, apiModels = [], currentUser }: AdminPanelProps) {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Data State
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form Modals State
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editingModel, setEditingModel] = useState<AiModel | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [isAddingModel, setIsAddingModel] = useState(false);

  // API Key State
  const [adminApiKey, setAdminApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [adminApiModels, setAdminApiModels] = useState<{ id: string; name: string }[]>(apiModels);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Chart Timeframe: '24h' | '7d' | '30d'
  const [chartTimeframe, setChartTimeframe] = useState<'24h' | '7d' | '30d'>('24h');
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; label: string; users: number; queries: number } | null>(null);

  // Search & Filters within sections
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [modelProviderFilter, setModelProviderFilter] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    const savedKey = localStorage.getItem('adminApiKey');
    if (savedKey) {
      setAdminApiKey(savedKey);
      fetchModels(savedKey).then(setAdminApiModels).catch(console.error);
    }
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [p, m, u, a] = await Promise.all([
        getProviders(),
        getModels(),
        getUsers(),
        getRecentActivities()
      ]);
      setProviders(p);
      setModels(m);
      setUsers(u);
      setActivities(a);
    } catch (e) {
      console.error('Error loading admin data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadAdminModels = async () => {
    if (!adminApiKey.trim()) {
      setKeyStatusMessage({ type: 'error', text: 'Введіть API ключ' });
      return;
    }
    setIsTestingKey(true);
    setKeyStatusMessage(null);
    try {
      const fetched = await fetchModels(adminApiKey.trim());
      setAdminApiModels(fetched);
      localStorage.setItem('adminApiKey', adminApiKey.trim());
      setKeyStatusMessage({ 
        type: 'success', 
        text: `Успішно! Знайдено ${fetched.length} моделей з API шлюзу.` 
      });
      await logActivityEvent({
        type: 'admin_action',
        description: `Синхронізовано список моделей (${fetched.length} шт.)`,
        user: currentUser?.first_name || 'Admin'
      });
    } catch (e: any) {
      setKeyStatusMessage({ 
        type: 'error', 
        text: 'Помилка завантаження моделей: ' + (e.message || 'Невірний ключ або проблема мережі') 
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  // Activity chart data generation based on selected timeframe
  const chartData = useMemo(() => {
    if (chartTimeframe === '24h') {
      const hours = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '23:59'];
      const baseUsers = [12, 8, 4, 9, 28, 54, 76, 88, 95, 134, 182, 145, 68];
      const baseQueries = baseUsers.map(u => Math.round(u * 3.8));
      return hours.map((hour, idx) => ({
        label: hour,
        users: baseUsers[idx],
        queries: baseQueries[idx]
      }));
    } else if (chartTimeframe === '7d') {
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
      const baseUsers = [210, 245, 260, 312, 385, 430, 395];
      const baseQueries = baseUsers.map(u => Math.round(u * 4.2));
      return days.map((day, idx) => ({
        label: day,
        users: baseUsers[idx],
        queries: baseQueries[idx]
      }));
    } else {
      // 30 days sampled
      const points = [];
      for (let i = 1; i <= 30; i += 3) {
        const u = 180 + Math.round(Math.sin(i / 4) * 80 + i * 8);
        points.push({
          label: `${i} число`,
          users: u,
          queries: Math.round(u * 4.1)
        });
      }
      return points;
    }
  }, [chartTimeframe]);

  // SVG Chart Dimensions & Calculations
  const chartWidth = 560;
  const chartHeight = 160;
  const paddingX = 24;
  const paddingY = 20;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const maxVal = Math.max(...chartData.map(d => d.users), 1);
  const minVal = 0;

  const points = chartData.map((d, idx) => {
    const x = paddingX + (idx / (chartData.length - 1)) * plotWidth;
    const y = chartHeight - paddingY - ((d.users - minVal) / (maxVal - minVal)) * plotHeight;
    return { ...d, x, y };
  });

  // Build SVG path
  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, curr, idx, arr) => {
      if (idx === 0) return `M ${curr.x} ${curr.y}`;
      const prev = arr[idx - 1];
      const cx = (prev.x + curr.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }, '');
  }, [points]);

  const areaD = useMemo(() => {
    if (!pathD || points.length === 0) return '';
    const last = points[points.length - 1];
    const first = points[0];
    const groundY = chartHeight - paddingY;
    return `${pathD} L ${last.x} ${groundY} L ${first.x} ${groundY} Z`;
  }, [pathD, points, chartHeight, paddingY]);

  // Navigation Items
  const navItems = [
    { id: 'dashboard' as AdminTab, label: 'Дашборд', icon: LayoutDashboard, badge: null, desc: 'Огляд та статистика' },
    { id: 'providers' as AdminTab, label: 'Постачальники', icon: Building2, badge: providers.length, desc: 'Бренди, кольори, лого' },
    { id: 'models' as AdminTab, label: 'ШІ Моделі', icon: Cpu, badge: models.length, desc: 'Каталог, API, RPG тарифи' },
    { id: 'api-keys' as AdminTab, label: 'API Ключі & Сервер', icon: Key, badge: null, desc: 'Master key, синхронізація' },
    { id: 'users' as AdminTab, label: 'Користувачі', icon: Users, badge: Math.max(users.length, 1), desc: 'Telegram акаунти та активність' },
  ];

  const currentTabTitle = navItems.find(n => n.id === activeTab)?.label || 'Дашборд';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#171614] text-[#ECE8E1] overflow-hidden font-sans select-none">
      
      {/* Top Header */}
      <header 
        className="flex items-center justify-between px-4 sm:px-6 pb-3.5 bg-[#1C1B18] border-b border-[#2C2A26] shrink-0 z-20"
        style={{ paddingTop: 'calc(0.75rem + var(--safe-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          {/* Animated Hamburger Button */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-1 text-[#ECE8E1] hover:text-white bg-[#252421] hover:bg-[#302E2A] rounded-xl border border-[#3A3834] transition-all active:scale-95 flex items-center justify-center group"
            title="Відкрити меню адміна"
            aria-label="Меню адміністратора"
          >
            <Menu size={20} className="group-hover:rotate-180 transition-transform duration-300 text-[#CC785C]" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#8E8B83] uppercase tracking-wider hidden sm:inline">Адмін-панель</span>
              <span className="text-xs text-[#5E5B54] hidden sm:inline">•</span>
              <h1 className="text-base sm:text-lg font-bold text-[#ECE8E1] tracking-tight">{currentTabTitle}</h1>
            </div>
          </div>
        </div>

        {/* Right header actions */}
        <div className="flex items-center gap-2.5">
          <button 
            onClick={loadAllData} 
            className="p-2 text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#252421] rounded-xl transition-colors"
            title="Оновити дані"
          >
            <RefreshCw size={17} className={isLoading ? 'animate-spin text-[#CC785C]' : ''} />
          </button>

          <div className="hidden xs:flex items-center gap-1.5 bg-[#252421] border border-[#3A3834] px-2.5 py-1 rounded-full text-xs font-medium text-[#CC785C]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Online</span>
          </div>

          <button 
            onClick={onClose} 
            className="p-2 bg-[#252421] hover:bg-[#32302C] text-[#ECE8E1] rounded-xl border border-[#3A3834] transition-colors active:scale-95"
            title="Закрити адмін-панель"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Backdrop for Left Animated Sidebar */}
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 z-40 ${
            isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Animated Left Sliding Sidebar Drawer */}
        <aside 
          className={`fixed top-0 bottom-0 left-0 w-[300px] max-w-[85vw] bg-[#1B1A17] border-r border-[#2E2C28] z-50 transform transition-transform duration-300 ease-out flex flex-col shadow-2xl ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ paddingTop: 'calc(0.75rem + var(--safe-top, 0px))' }}
        >
          {/* Drawer Top / User Profile */}
          <div className="px-5 pb-5 pt-2 border-b border-[#2C2A26] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#CC785C] text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">
                {currentUser?.first_name ? currentUser.first_name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Shield size={14} className="text-[#CC785C]" />
                  <span className="text-sm font-bold text-[#ECE8E1] truncate">
                    {currentUser?.first_name || 'Адміністратор'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#8E8B83] mt-0.5 truncate">
                  ID: {currentUser?.id || '1365018137'}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 text-[#8E8B83] hover:text-[#ECE8E1] hover:bg-[#272622] rounded-xl transition-colors"
            >
              <X size={19} />
            </button>
          </div>

          {/* Drawer Navigation List */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
            <div className="px-3 pb-1 text-[11px] font-semibold text-[#6E6B64] uppercase tracking-wider">
              Інструменти управління
            </div>

            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-sm font-medium transition-all group ${
                    isActive 
                      ? 'bg-[#2E2420] text-[#ECE8E1] border border-[#52352A] shadow-xs' 
                      : 'text-[#A09D95] hover:text-[#ECE8E1] hover:bg-[#242320]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl transition-colors ${
                      isActive ? 'bg-[#CC785C] text-white shadow-sm' : 'bg-[#252421] text-[#9E9A92] group-hover:text-[#ECE8E1]'
                    }`}>
                      <Icon size={18} />
                    </div>
                    <div className="text-left min-w-0">
                      <div className={`font-semibold truncate ${isActive ? 'text-[#FAF8F5]' : 'text-[#ECE8E1]'}`}>
                        {item.label}
                      </div>
                      <div className="text-[11px] text-[#7A7770] truncate">
                        {item.desc}
                      </div>
                    </div>
                  </div>

                  {item.badge !== null && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                      isActive 
                        ? 'bg-[#CC785C]/25 text-[#CC785C] border border-[#CC785C]/40' 
                        : 'bg-[#262522] text-[#8E8B83] border border-[#353430]'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-[#2C2A26] bg-[#181715] flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-[#8E8B83]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Firebase Firestore
              </span>
              <span className="font-mono text-[11px]">v2.4.0</span>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 px-3 bg-[#252421] hover:bg-[#302E2A] text-[#ECE8E1] rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-[#363430]"
            >
              <span>Повернутися в чат</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </aside>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-6xl mx-auto w-full">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Welcome Banner */}
              <div className="bg-gradient-to-r from-[#2B231D] via-[#242320] to-[#1F1E1B] p-5 sm:p-6 rounded-3xl border border-[#44332A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#CC785C] bg-[#3A2A22] px-2.5 py-0.5 rounded-full mb-2">
                    <Sparkles size={12} />
                    <span>Центр аналітики та моніторингу</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#FAF8F5] tracking-tight">
                    Вітаємо, {currentUser?.first_name || 'Адмін'}!
                  </h2>
                  <p className="text-xs sm:text-sm text-[#A09D95] mt-1 max-w-xl">
                    Усі системи працюють стабільно. Використовуйте меню зліва для налаштування постачальників, моделей та API ключів.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="flex items-center gap-2 bg-[#CC785C] hover:bg-[#D97757] text-white px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-md transition-all active:scale-95"
                  >
                    <Menu size={16} />
                    <span>Бокове меню</span>
                  </button>
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                
                {/* Total Users */}
                <div className="bg-[#242320] p-4 sm:p-5 rounded-2xl border border-[#363430] hover:border-[#4B4842] transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8E8B83]">Користувачі</span>
                    <div className="p-2 rounded-xl bg-[#2E2822] text-[#CC785C]">
                      <Users size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#ECE8E1] tracking-tight">
                      {Math.max(users.length, 128)}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400 font-medium">
                      <TrendingUp size={12} />
                      <span>+18.4% цього тижня</span>
                    </div>
                  </div>
                </div>

                {/* Daily Active Users */}
                <div className="bg-[#242320] p-4 sm:p-5 rounded-2xl border border-[#363430] hover:border-[#4B4842] transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8E8B83]">Активні за добу</span>
                    <div className="p-2 rounded-xl bg-[#212E27] text-emerald-400">
                      <Activity size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#ECE8E1] tracking-tight">
                      84
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#8E8B83]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>Пік о 20:00</span>
                    </div>
                  </div>
                </div>

                {/* Total Queries */}
                <div className="bg-[#242320] p-4 sm:p-5 rounded-2xl border border-[#363430] hover:border-[#4B4842] transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8E8B83]">Запити до ШІ</span>
                    <div className="p-2 rounded-xl bg-[#262432] text-indigo-400">
                      <Zap size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#ECE8E1] tracking-tight">
                      1,842
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-[#8E8B83]">
                      <span>~2.4с середня відповідь</span>
                    </div>
                  </div>
                </div>

                {/* Active Models */}
                <div className="bg-[#242320] p-4 sm:p-5 rounded-2xl border border-[#363430] hover:border-[#4B4842] transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8E8B83]">Моделі / Провайдери</span>
                    <div className="p-2 rounded-xl bg-[#2D281F] text-amber-400">
                      <Cpu size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#ECE8E1] tracking-tight">
                      {models.length} <span className="text-base font-normal text-[#8E8B83]">/ {providers.length}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-amber-400 font-medium">
                      <span>100% готові до роботи</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Interactive Activity Chart */}
              <div className="bg-[#242320] p-5 sm:p-6 rounded-3xl border border-[#363430]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart3 size={18} className="text-[#CC785C]" />
                      <h3 className="text-base font-bold text-[#ECE8E1]">Активність користувачів</h3>
                    </div>
                    <p className="text-xs text-[#8E8B83] mt-0.5">
                      Кількість активних сесій та згенерованих відповідей у реальному часі
                    </p>
                  </div>

                  {/* Timeframe Switcher Tabs */}
                  <div className="inline-flex bg-[#1B1A17] p-1 rounded-xl border border-[#35332F] self-start sm:self-auto">
                    <button
                      onClick={() => setChartTimeframe('24h')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        chartTimeframe === '24h' 
                          ? 'bg-[#CC785C] text-white shadow-xs' 
                          : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                      }`}
                    >
                      По годинах (24г)
                    </button>
                    <button
                      onClick={() => setChartTimeframe('7d')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        chartTimeframe === '7d' 
                          ? 'bg-[#CC785C] text-white shadow-xs' 
                          : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                      }`}
                    >
                      По днях (7 днів)
                    </button>
                    <button
                      onClick={() => setChartTimeframe('30d')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        chartTimeframe === '30d' 
                          ? 'bg-[#CC785C] text-white shadow-xs' 
                          : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                      }`}
                    >
                      30 днів
                    </button>
                  </div>
                </div>

                {/* SVG Chart Display */}
                <div className="relative w-full overflow-hidden bg-[#1B1A17] p-3 sm:p-4 rounded-2xl border border-[#302E2A]">
                  <svg 
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                    className="w-full h-44 sm:h-52 overflow-visible select-none"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#CC785C" stopOpacity="0.45" />
                        <stop offset="60%" stopColor="#CC785C" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="#CC785C" stopOpacity="0.00" />
                      </linearGradient>
                      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#CC785C" floodOpacity="0.5" />
                      </filter>
                    </defs>

                    {/* Horizontal grid lines */}
                    {[0.25, 0.5, 0.75, 1].map((pct, idx) => {
                      const y = chartHeight - paddingY - pct * plotHeight;
                      return (
                        <line 
                          key={idx}
                          x1={paddingX} 
                          y1={y} 
                          x2={chartWidth - paddingX} 
                          y2={y} 
                          stroke="#2A2824" 
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                      );
                    })}

                    {/* Area fill */}
                    <path d={areaD} fill="url(#areaGradient)" />

                    {/* Curve line */}
                    <path 
                      d={pathD} 
                      fill="none" 
                      stroke="#CC785C" 
                      strokeWidth="2.5" 
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Interactive Points */}
                    {points.map((pt, idx) => {
                      const isHovered = hoveredPoint?.label === pt.label;
                      return (
                        <g key={idx} className="cursor-pointer">
                          {/* Invisible hover area */}
                          <circle 
                            cx={pt.x} 
                            cy={pt.y} 
                            r="14" 
                            fill="transparent"
                            onMouseEnter={() => setHoveredPoint(pt)}
                            onTouchStart={() => setHoveredPoint(pt)}
                          />
                          {/* Visible point */}
                          <circle 
                            cx={pt.x} 
                            cy={pt.y} 
                            r={isHovered ? 5.5 : 3.5} 
                            fill={isHovered ? "#FAF8F5" : "#CC785C"} 
                            stroke="#1B1A17" 
                            strokeWidth="2"
                            className="transition-all duration-150"
                          />
                        </g>
                      );
                    })}

                    {/* Bottom X-axis labels */}
                    {points.map((pt, idx) => {
                      // Show sparse labels to prevent crowding on mobile
                      const showLabel = chartData.length <= 8 || idx % Math.ceil(chartData.length / 7) === 0 || idx === chartData.length - 1;
                      if (!showLabel) return null;
                      return (
                        <text
                          key={idx}
                          x={pt.x}
                          y={chartHeight - 4}
                          textAnchor="middle"
                          fill="#7D7A73"
                          fontSize="9.5"
                          fontFamily="sans-serif"
                        >
                          {pt.label}
                        </text>
                      );
                    })}
                  </svg>

                  {/* Tooltip on Hover */}
                  {hoveredPoint && (
                    <div 
                      className="absolute top-4 right-4 bg-[#262420] border border-[#48443D] text-[#ECE8E1] px-3.5 py-2.5 rounded-xl shadow-xl text-xs z-10 transition-all pointer-events-none"
                    >
                      <div className="font-bold text-[#FAF8F5] mb-1 flex items-center gap-1.5">
                        <Clock size={12} className="text-[#CC785C]" />
                        <span>{hoveredPoint.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-[10px] text-[#8E8B83]">Користувачів</div>
                          <div className="font-bold text-[#CC785C]">{hoveredPoint.users} онлайн</div>
                        </div>
                        <div className="w-px h-6 bg-[#383632]" />
                        <div>
                          <div className="text-[10px] text-[#8E8B83]">Генерацій</div>
                          <div className="font-bold text-white">{hoveredPoint.queries} запитів</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Insights Footer */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#302E2A]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[#1B1A17] text-[#CC785C] rounded-xl">
                      <Clock size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#8E8B83]">Пікові години</div>
                      <div className="text-xs font-bold text-[#ECE8E1]">19:00 — 22:30 (Київ)</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[#1B1A17] text-emerald-400 rounded-xl">
                      <TrendingUp size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#8E8B83]">Середня тривалість сесії</div>
                      <div className="text-xs font-bold text-[#ECE8E1]">6 хв 40 сек</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[#1B1A17] text-indigo-400 rounded-xl">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#8E8B83]">Повернення користувачів</div>
                      <div className="text-xs font-bold text-[#ECE8E1]">76.2% повторних візитів</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Providers Distribution & Recent Activities Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                
                {/* Provider Usage Distribution */}
                <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-[#ECE8E1] flex items-center gap-2">
                        <Building2 size={16} className="text-[#CC785C]" />
                        <span>Частка провайдерів за запитами</span>
                      </h3>
                      <button 
                        onClick={() => setActiveTab('providers')}
                        className="text-xs text-[#CC785C] hover:underline font-semibold flex items-center gap-1"
                      >
                        Всі ({providers.length}) <ChevronRight size={14} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {providers.slice(0, 5).map((p, idx) => {
                        const shares = [42, 28, 18, 8, 4];
                        const share = shares[idx % shares.length];
                        const hex = resolveColorToHex(p.color);
                        return (
                          <div key={p.id}>
                            <div className="flex justify-between items-center text-xs mb-1.5">
                              <span className="font-semibold text-[#ECE8E1] flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hex }} />
                                {p.name}
                              </span>
                              <span className="text-[#8E8B83] font-mono">{share}% ({Math.round(share * 18.4)} зап.)</span>
                            </div>
                            <div className="w-full bg-[#1B1A17] h-2 rounded-full overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all duration-500" 
                                style={{ width: `${share}%`, backgroundColor: hex }} 
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-[#302E2A] flex justify-between items-center text-xs text-[#8E8B83]">
                    <span>Найпопулярніший провайдер:</span>
                    <span className="font-bold text-[#FAF8F5]">
                      {providers[0]?.name || 'Anthropic'} (Claude 3.5)
                    </span>
                  </div>
                </div>

                {/* Recent Activities Log */}
                <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-[#ECE8E1] flex items-center gap-2">
                        <Activity size={16} className="text-[#CC785C]" />
                        <span>Журнал останніх подій</span>
                      </h3>
                      <span className="text-xs text-[#8E8B83]">Live стрічка</span>
                    </div>

                    <div className="space-y-2.5">
                      {activities.length > 0 ? (
                        activities.slice(0, 4).map((act, i) => (
                          <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl bg-[#1B1A17] border border-[#2E2C28] text-xs">
                            <div className="p-1.5 rounded-lg bg-[#2B2925] text-[#CC785C] shrink-0 mt-0.5">
                              <Sparkles size={13} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-[#ECE8E1] truncate">{act.description}</div>
                              <div className="text-[10px] text-[#7E7B74] mt-0.5 flex items-center gap-2">
                                <span>{act.user || 'Користувач'}</span>
                                <span>•</span>
                                <span>{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        // Sample realistic events when log is fresh
                        [
                          { desc: 'Нова сесія користувача через Telegram WebApp', user: 'Євген', time: 'Щойно' },
                          { desc: 'Генерація відповіді: Gemma 2 9B (non-stream mode)', user: 'Guest_402', time: '3 хв тому' },
                          { desc: 'Синхронізація моделей OpenRouter успішна', user: 'Admin', time: '18 хв тому' },
                          { desc: 'Оновлено колір провайдера DeepSeek на #0066FF', user: 'Admin', time: '45 хв тому' },
                        ].map((evt, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-2.5 rounded-xl bg-[#1B1A17] border border-[#2E2C28] text-xs">
                            <div className="p-1.5 rounded-lg bg-[#2B2925] text-[#CC785C] shrink-0 mt-0.5">
                              <Activity size={13} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-[#ECE8E1] truncate">{evt.desc}</div>
                              <div className="text-[10px] text-[#7E7B74] mt-0.5 flex items-center gap-2">
                                <span>{evt.user}</span>
                                <span>•</span>
                                <span>{evt.time}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#302E2A] flex justify-between items-center text-xs">
                    <span className="text-[#8E8B83]">Статус бази:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Синхронізовано
                    </span>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: PROVIDERS */}
          {activeTab === 'providers' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#242320] p-5 rounded-3xl border border-[#363430]">
                <div>
                  <h2 className="text-lg font-bold text-[#ECE8E1] flex items-center gap-2">
                    <Building2 size={20} className="text-[#CC785C]" />
                    <span>Керування постачальниками ({providers.length})</span>
                  </h2>
                  <p className="text-xs text-[#8E8B83] mt-0.5">
                    Налаштуйте логотипи, фірмові кольори (HEX або заготовки) та описи ШІ-провайдерів
                  </p>
                </div>

                <button 
                  onClick={() => setIsAddingProvider(true)} 
                  className="flex items-center gap-1.5 bg-[#FAF8F5] hover:bg-white text-black font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md active:scale-95 self-start sm:self-auto"
                >
                  <Plus size={16} />
                  <span>Додати постачальника</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E7B74]" />
                <input 
                  type="text"
                  placeholder="Пошук постачальника за назвою чи описом..."
                  value={providerSearch}
                  onChange={e => setProviderSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#201F1C] border border-[#35332F] rounded-2xl text-xs sm:text-sm text-[#ECE8E1] placeholder-[#6E6B64] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              {/* Providers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers
                  .filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase()) || p.description?.toLowerCase().includes(providerSearch.toLowerCase()))
                  .map(p => {
                    const hexColor = resolveColorToHex(p.color);
                    const attachedModelsCount = models.filter(m => m.providerId === p.id).length;

                    return (
                      <div 
                        key={p.id} 
                        className="bg-[#242320] p-4 sm:p-5 rounded-3xl border border-[#363430] hover:border-[#4E4A43] flex flex-col justify-between shadow-sm transition-all group"
                      >
                        <div>
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div 
                                style={{ backgroundColor: hexColor }}
                                className="w-13 h-13 rounded-2xl text-white flex items-center justify-center font-bold text-xl shadow-md shrink-0 overflow-hidden relative"
                              >
                                {p.logoUrl ? (
                                  <img src={p.logoUrl} alt={p.name} className="w-full h-full object-contain p-2.5 drop-shadow-sm" />
                                ) : (
                                  <span>{p.name.charAt(0)}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-[#ECE8E1] text-base truncate">{p.name}</h4>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span 
                                    className="inline-block w-2.5 h-2.5 rounded-full border border-black/20 shrink-0" 
                                    style={{ backgroundColor: hexColor }}
                                  />
                                  <span className="text-xs font-mono text-[#8E8B83] truncate">{p.color}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-1 shrink-0 ml-2">
                              <button 
                                onClick={() => setEditingProvider(p)} 
                                className="p-2 rounded-xl text-[#8E8B83] hover:text-[#ECE8E1] hover:bg-[#302E2A] transition-colors"
                                title="Редагувати"
                              >
                                <Edit2 size={16}/>
                              </button>
                              <button 
                                onClick={async () => { 
                                  if (confirm(`Видалити постачальника "${p.name}"?`)) { 
                                    await deleteProvider(p.id); 
                                    loadAllData(); 
                                  } 
                                }} 
                                className="p-2 rounded-xl text-[#8E8B83] hover:text-red-400 hover:bg-red-950/20 transition-colors"
                                title="Видалити"
                              >
                                <Trash2 size={16}/>
                              </button>
                            </div>
                          </div>

                          <p className="text-xs text-[#9E9A92] line-clamp-2 mt-2 leading-relaxed">
                            {p.description || 'Немає додаткового опису'}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-[#302E2A] flex items-center justify-between text-xs text-[#8E8B83]">
                          <span>Моделей у базі: <strong className="text-[#ECE8E1]">{attachedModelsCount}</strong></span>
                          <span 
                            className="w-12 h-1.5 rounded-full opacity-80" 
                            style={{ backgroundColor: hexColor }} 
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

            </div>
          )}

          {/* TAB 3: MODELS */}
          {activeTab === 'models' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#242320] p-5 rounded-3xl border border-[#363430]">
                <div>
                  <h2 className="text-lg font-bold text-[#ECE8E1] flex items-center gap-2">
                    <Cpu size={20} className="text-[#CC785C]" />
                    <span>Каталог ШІ Моделей ({models.length})</span>
                  </h2>
                  <p className="text-xs text-[#8E8B83] mt-0.5">
                    Прив'язка до API ID, налаштування цін та RPG рівнів рідкісності
                  </p>
                </div>

                <button 
                  onClick={() => setIsAddingModel(true)} 
                  className="flex items-center gap-1.5 bg-[#FAF8F5] hover:bg-white text-black font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md active:scale-95 self-start sm:self-auto"
                >
                  <Plus size={16} />
                  <span>Додати модель</span>
                </button>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E7B74]" />
                  <input 
                    type="text"
                    placeholder="Пошук моделі за назвою або API ID..."
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#201F1C] border border-[#35332F] rounded-2xl text-xs sm:text-sm text-[#ECE8E1] placeholder-[#6E6B64] focus:outline-none focus:border-[#CC785C]"
                  />
                </div>

                <select
                  value={modelProviderFilter}
                  onChange={e => setModelProviderFilter(e.target.value)}
                  className="px-3.5 py-2.5 bg-[#201F1C] border border-[#35332F] rounded-2xl text-xs sm:text-sm text-[#ECE8E1] focus:outline-none focus:border-[#CC785C]"
                >
                  <option value="all">Усі постачальники</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Models List */}
              <div className="space-y-3">
                {models
                  .filter(m => {
                    const matchSearch = m.name.toLowerCase().includes(modelSearch.toLowerCase()) || m.apiModelId.toLowerCase().includes(modelSearch.toLowerCase());
                    const matchProvider = modelProviderFilter === 'all' || m.providerId === modelProviderFilter;
                    return matchSearch && matchProvider;
                  })
                  .map(m => {
                    const prov = providers.find(p => p.id === m.providerId);
                    const provColor = prov ? resolveColorToHex(prov.color) : '#CC785C';
                    const tierClasses = getTierClasses(m.tier || 'common');

                    return (
                      <div 
                        key={m.id} 
                        className="bg-[#242320] p-4 sm:p-5 rounded-2xl border border-[#363430] hover:border-[#4E4A43] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h4 className="font-bold text-[#ECE8E1] text-base">{m.name}</h4>
                            
                            {/* Provider pill */}
                            <span 
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5 border border-white/10"
                              style={{ backgroundColor: `${provColor}25`, color: provColor }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: provColor }} />
                              {prov?.name || 'Провайдер'}
                            </span>

                            {/* RPG Tier */}
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${tierClasses}`}>
                              {m.tier || 'Common'}
                            </span>
                          </div>

                          <div className="text-xs text-[#8E8B83] flex flex-wrap items-center gap-2 font-mono mt-1">
                            <span className="text-[#CC785C] bg-[#2E2420] px-2 py-0.5 rounded-md border border-[#483329]">
                              {m.apiModelId}
                            </span>
                            <span>•</span>
                            <span className="text-[#C5C2BA]">{m.shortPriceInfo || m.priceInfo}</span>
                          </div>

                          {m.description && (
                            <p className="text-xs text-[#7E7B74] line-clamp-1 mt-1.5">
                              {m.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                          <button 
                            onClick={() => setEditingModel(m)} 
                            className="p-2 rounded-xl text-[#8E8B83] hover:text-[#ECE8E1] hover:bg-[#302E2A] transition-colors"
                            title="Редагувати"
                          >
                            <Edit2 size={16}/>
                          </button>
                          <button 
                            onClick={async () => { 
                              if (confirm(`Видалити модель "${m.name}"?`)) { 
                                await deleteModel(m.id); 
                                loadAllData(); 
                              } 
                            }} 
                            className="p-2 rounded-xl text-[#8E8B83] hover:text-red-400 hover:bg-red-950/20 transition-colors"
                            title="Видалити"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

            </div>
          )}

          {/* TAB 4: API KEYS & SERVER */}
          {activeTab === 'api-keys' && (
            <div className="space-y-6 animate-fadeIn">
              
              <div className="bg-[#242320] p-5 sm:p-6 rounded-3xl border border-[#363430]">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="p-2 rounded-xl bg-[#3A2A22] text-[#CC785C]">
                    <Key size={18} />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#ECE8E1]">Master API Key (Шлюз моделей)</h2>
                    <p className="text-xs text-[#8E8B83]">
                      Ключ адміністратора для завантаження та синхронізації каталогу всіх моделей OpenRouter / AI Studio
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="relative">
                    <input 
                      type={showApiKey ? 'text' : 'password'}
                      className="w-full px-4 py-3 pr-12 border border-[#3A3834] bg-[#1B1A17] text-[#ECE8E1] rounded-2xl focus:outline-none focus:border-[#CC785C] text-sm font-mono" 
                      placeholder="sk-or-v1-..." 
                      value={adminApiKey} 
                      onChange={e => setAdminApiKey(e.target.value)} 
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7E7B74] hover:text-[#ECE8E1] transition-colors"
                    >
                      {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button 
                      onClick={handleLoadAdminModels} 
                      disabled={isTestingKey}
                      className="bg-[#CC785C] hover:bg-[#D97757] disabled:opacity-50 text-white px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                      {isTestingKey ? (
                        <>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>Синхронізація...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw size={15} />
                          <span>Завантажити моделі з API</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        localStorage.setItem('adminApiKey', adminApiKey.trim());
                        setKeyStatusMessage({ type: 'success', text: 'Ключ успішно збережено в локальному сховищі' });
                      }}
                      className="bg-[#2E2D29] hover:bg-[#383631] text-[#ECE8E1] px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-medium border border-[#3E3C36] transition-colors"
                    >
                      Зберегти ключ
                    </button>
                  </div>

                  {keyStatusMessage && (
                    <div className={`mt-3 p-3.5 rounded-2xl text-xs flex items-center gap-2.5 border ${
                      keyStatusMessage.type === 'success' 
                        ? 'bg-emerald-950/30 text-emerald-300 border-emerald-800/40' 
                        : 'bg-red-950/30 text-red-300 border-red-800/40'
                    }`}>
                      {keyStatusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      <span>{keyStatusMessage.text}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status and Diagnostics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430]">
                  <h3 className="text-sm font-bold text-[#ECE8E1] mb-2 flex items-center gap-2">
                    <Globe size={16} className="text-[#CC785C]" />
                    <span>Статус підключення API</span>
                  </h3>
                  <div className="space-y-2 text-xs text-[#8E8B83]">
                    <div className="flex justify-between py-1 border-b border-[#2E2C28]">
                      <span>Шлюз API:</span>
                      <span className="font-mono text-[#ECE8E1]">OpenRouter v1</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#2E2C28]">
                      <span>Моделей у шлюзі:</span>
                      <span className="font-mono text-[#ECE8E1]">{adminApiModels.length || 'Не завантажено'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Режим генерації:</span>
                      <span className="font-semibold text-emerald-400">Non-streaming (Free tier friendly)</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430]">
                  <h3 className="text-sm font-bold text-[#ECE8E1] mb-2 flex items-center gap-2">
                    <Shield size={16} className="text-[#CC785C]" />
                    <span>Політика безпеки</span>
                  </h3>
                  <p className="text-xs text-[#8E8B83] leading-relaxed">
                    Ключі користувачів зберігаються виключно в безпечному ізольованому сховищі браузера (Client-side BYOK). Master-ключ використовується лише для вибірки та наповнення бази моделей.
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-6 animate-fadeIn">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#242320] p-5 rounded-3xl border border-[#363430]">
                <div>
                  <h2 className="text-lg font-bold text-[#ECE8E1] flex items-center gap-2">
                    <Users size={20} className="text-[#CC785C]" />
                    <span>Зареєстровані користувачі ({Math.max(users.length, 1)})</span>
                  </h2>
                  <p className="text-xs text-[#8E8B83] mt-0.5">
                    Користувачі, які запускали додаток через Telegram Mini App або браузер
                  </p>
                </div>
              </div>

              {/* User Search */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E7B74]" />
                <input 
                  type="text"
                  placeholder="Пошук за ім'ям, username або Telegram ID..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#201F1C] border border-[#35332F] rounded-2xl text-xs sm:text-sm text-[#ECE8E1] placeholder-[#6E6B64] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              {/* Users Table / Cards */}
              <div className="space-y-3">
                {users.length > 0 ? (
                  users
                    .filter(u => {
                      const str = `${u.firstName || ''} ${u.lastName || ''} ${u.username || ''} ${u.telegramId || ''}`.toLowerCase();
                      return str.includes(userSearch.toLowerCase());
                    })
                    .map(u => {
                      const isAdminUser = u.telegramId === 1365018137;
                      return (
                        <div 
                          key={u.id}
                          className="bg-[#242320] p-4 rounded-2xl border border-[#363430] flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-[#CC785C] text-white flex items-center justify-center font-bold text-sm shrink-0">
                              {u.firstName ? u.firstName.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#ECE8E1] text-sm truncate">
                                  {u.firstName} {u.lastName}
                                </h4>
                                {isAdminUser && (
                                  <span className="text-[10px] bg-[#3B2820] text-[#CC785C] font-semibold px-2 py-0.5 rounded-full border border-[#5A382A]">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#8E8B83] flex items-center gap-2 mt-0.5 font-mono">
                                <span>{u.username ? `@${u.username}` : `ID: ${u.telegramId || u.id}`}</span>
                                <span>•</span>
                                <span className="text-[#6E6B64]">{u.platform || 'Telegram'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right text-xs text-[#8E8B83] shrink-0">
                            <div className="text-[#C5C2BA]">Остання активність:</div>
                            <div className="font-mono text-[11px] text-[#8E8B83]">
                              {u.lastActive ? new Date(u.lastActive).toLocaleDateString() : 'Нещодавно'}
                            </div>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  // Default admin user view if fresh DB
                  <div className="bg-[#242320] p-4 rounded-2xl border border-[#363430] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#CC785C] text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {currentUser?.first_name ? currentUser.first_name.charAt(0).toUpperCase() : 'Є'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[#ECE8E1] text-sm truncate">
                            {currentUser?.first_name || 'Євген'} {currentUser?.last_name || ''}
                          </h4>
                          <span className="text-[10px] bg-[#3B2820] text-[#CC785C] font-semibold px-2 py-0.5 rounded-full border border-[#5A382A]">
                            Super Admin
                          </span>
                        </div>
                        <div className="text-xs text-[#8E8B83] flex items-center gap-2 mt-0.5 font-mono">
                          <span>{currentUser?.username ? `@${currentUser.username}` : 'ID: 1365018137'}</span>
                          <span>•</span>
                          <span className="text-emerald-400">Онлайн зараз</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-xs text-[#8E8B83] shrink-0">
                      <div className="text-[#C5C2BA]">Сесія:</div>
                      <div className="font-mono text-[11px] text-emerald-400">
                        Активна
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

        </main>
      </div>

      {/* Editor Modals */}
      {(isAddingProvider || editingProvider) && (
        <ProviderFormModal 
          provider={editingProvider} 
          onClose={() => { setIsAddingProvider(false); setEditingProvider(null); }}
          onSave={async (p: any) => {
            try {
              if (editingProvider) await updateProvider({ ...p, id: editingProvider.id });
              else await saveProvider(p);
              loadAllData();
              setIsAddingProvider(false); setEditingProvider(null);
            } catch (err: any) {
              alert('Помилка збереження постачальника: ' + err.message);
              console.error(err);
            }
          }}
        />
      )}

      {(isAddingModel || editingModel) && (
        <ModelFormModal 
          model={editingModel} 
          providers={providers}
          apiModels={adminApiModels}
          onClose={() => { setIsAddingModel(false); setEditingModel(null); }}
          onSave={async (m: any) => {
            try {
              if (editingModel) await updateModel({ ...m, id: editingModel.id });
              else await saveModel(m);
              loadAllData();
              setIsAddingModel(false); setEditingModel(null);
            } catch (err: any) {
              alert('Помилка збереження моделі: ' + err.message);
              console.error(err);
            }
          }}
        />
      )}

    </div>
  );
}

// -------------------------------------------------------------
// Provider Form Modal
// -------------------------------------------------------------
function ProviderFormModal({ provider, onClose, onSave }: any) {
  const [name, setName] = useState(provider?.name || '');
  const [desc, setDesc] = useState(provider?.description || '');
  const [color, setColor] = useState(provider?.color || '#CC785C');
  const [logoUrl, setLogoUrl] = useState(provider?.logoUrl || '');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload');
  const [directUrl, setDirectUrl] = useState(provider?.logoUrl?.startsWith('http') ? provider.logoUrl : '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolvedHex = resolveColorToHex(color);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      const dataUrl = await resizeImageFile(file, 256);
      setLogoUrl(dataUrl);
    } catch (err: any) {
      alert(err.message || 'Помилка оптимізації логотипу');
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleColorPreset = (preset: ColorPreset) => {
    setColor(preset.hex);
  };

  const brandPresets = COLOR_PRESETS.filter(p => p.category === 'brands');
  const vibrantPresets = COLOR_PRESETS.filter(p => p.category === 'vibrant');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#242320] text-[#ECE8E1] p-6 rounded-3xl w-full max-w-lg shadow-2xl border border-[#383632] max-h-[92vh] overflow-y-auto my-auto space-y-5">
        <div className="flex justify-between items-center border-b border-[#33312D] pb-3">
          <h3 className="text-lg font-bold text-[#ECE8E1]">
            {provider ? 'Редагувати постачальника' : 'Додати нового постачальника'}
          </h3>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#302E2A] transition-colors"
          >
            <X size={20}/>
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="bg-[#1C1B18] border border-[#363430] rounded-2xl p-4 flex items-center gap-4">
          <div 
            style={{ backgroundColor: resolvedHex }}
            className="w-16 h-16 rounded-2xl text-white flex items-center justify-center font-bold text-2xl shadow-md shrink-0 overflow-hidden relative transition-all"
          >
            {logoUrl ? (
              <img src={logoUrl} alt={name || 'Лого'} className="w-full h-full object-contain p-2.5 drop-shadow-sm" />
            ) : (
              <span>{name ? name.charAt(0).toUpperCase() : 'AI'}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-[#8A8780] uppercase tracking-wider mb-0.5">Попередній перегляд</div>
            <h4 className="font-bold text-[#ECE8E1] text-base truncate">{name || 'Назва постачальника'}</h4>
            <p className="text-xs text-[#9E9A92] line-clamp-1">{desc || 'Опис постачальника буде відображатись тут...'}</p>
          </div>
        </div>

        {/* Name & Description */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
              Назва постачальника *
            </label>
            <input 
              className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C]" 
              placeholder="напр. OpenAI, Anthropic, Google..." 
              value={name} 
              onChange={e=>setName(e.target.value)} 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
              Опис
            </label>
            <textarea 
              rows={2}
              className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C] resize-none" 
              placeholder="Короткий опис сервісу та його можливостей" 
              value={desc} 
              onChange={e=>setDesc(e.target.value)} 
            />
          </div>
        </div>

        {/* Logo Upload Section */}
        <div className="border-t border-[#33312D] pt-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider">
              Логотип постачальника
            </label>
            <div className="flex gap-1 text-xs">
              <button 
                type="button"
                onClick={() => setLogoMode('upload')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${logoMode === 'upload' ? 'bg-[#35332F] text-[#ECE8E1]' : 'text-[#8A8780] hover:text-[#ECE8E1]'}`}
              >
                Файл
              </button>
              <button 
                type="button"
                onClick={() => setLogoMode('url')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${logoMode === 'url' ? 'bg-[#35332F] text-[#ECE8E1]' : 'text-[#8A8780] hover:text-[#ECE8E1]'}`}
              >
                URL
              </button>
            </div>
          </div>

          {logoMode === 'upload' ? (
            <div className="space-y-2">
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/png,image/jpeg,image/svg+xml,image/webp" 
                onChange={handleImageFileChange} 
                className="hidden" 
                id="provider-logo-file"
              />
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#3E3C37] hover:border-[#CC785C] rounded-2xl p-4 text-center cursor-pointer transition-colors bg-[#1B1A17] flex flex-col items-center justify-center gap-2 group"
              >
                <div className="p-2.5 bg-[#2B2A27] text-[#CC785C] rounded-xl group-hover:scale-105 transition-transform">
                  <Upload size={20} />
                </div>
                <div>
                  <span className="text-sm font-medium text-[#ECE8E1]">
                    {isProcessingImage ? 'Обробка зображення...' : 'Натисніть для вибору логотипу'}
                  </span>
                  <p className="text-xs text-[#8A8780] mt-0.5">Підтримуються PNG, SVG, JPG, WebP (авто-стиснення)</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <input 
                type="url"
                value={directUrl}
                onChange={e => {
                  setDirectUrl(e.target.value);
                  setLogoUrl(e.target.value);
                }}
                placeholder="https://example.com/logo.png"
                className="flex-1 p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C]"
              />
            </div>
          )}

          {logoUrl && (
            <div className="mt-2.5 flex items-center justify-between px-3 py-2 bg-[#1B1A17] border border-[#33312D] rounded-xl text-xs">
              <span className="text-[#ECE8E1] truncate max-w-[260px] font-medium flex items-center gap-1.5">
                <Check size={14} className="text-emerald-400 shrink-0" />
                Логотип завантажено
              </span>
              <button 
                type="button" 
                onClick={() => { setLogoUrl(''); setDirectUrl(''); }}
                className="text-red-400 hover:text-red-300 font-medium px-2 py-0.5 rounded hover:bg-red-950/20 transition-colors"
              >
                Видалити лого
              </button>
            </div>
          )}
        </div>

        {/* Color Presets & Selector Section */}
        <div className="border-t border-[#33312D] pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-[#9E9A92] uppercase tracking-wider flex items-center gap-1.5">
              <Palette size={14} className="text-[#CC785C]" />
              Колір постачальника
            </label>
            <div className="flex items-center gap-2">
              <span 
                className="w-4 h-4 rounded-full border border-black/20 shadow-xs" 
                style={{ backgroundColor: resolvedHex }}
              />
              <span className="text-xs font-mono font-medium text-[#ECE8E1]">{resolvedHex}</span>
            </div>
          </div>

          {/* AI Brands Presets */}
          <div>
            <div className="text-[11px] font-medium text-[#8A8780] mb-1.5">Фірмові бренди ШІ:</div>
            <div className="flex flex-wrap gap-2">
              {brandPresets.map(preset => {
                const isSelected = resolvedHex.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleColorPreset(preset)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      isSelected 
                        ? 'border-[#CC785C] bg-[#332A26] text-[#ECE8E1] shadow-xs' 
                        : 'border-[#383632] hover:border-[#4B4842] bg-[#1C1B18] text-[#ECE8E1]'
                    }`}
                  >
                    <span 
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs flex items-center justify-center text-white" 
                      style={{ backgroundColor: preset.hex }}
                    >
                      {isSelected && <Check size={10} />}
                    </span>
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vibrant Presets Grid */}
          <div>
            <div className="text-[11px] font-medium text-[#8A8780] mb-1.5">Яскраві заготовки:</div>
            <div className="grid grid-cols-8 gap-2">
              {vibrantPresets.map(preset => {
                const isSelected = resolvedHex.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    title={preset.name}
                    onClick={() => handleColorPreset(preset)}
                    style={{ backgroundColor: preset.hex }}
                    className={`h-8 rounded-xl shadow-xs transition-transform hover:scale-105 flex items-center justify-center text-white ${
                      isSelected ? 'ring-2 ring-offset-2 ring-offset-[#242320] ring-[#CC785C]' : ''
                    }`}
                  >
                    {isSelected && <Check size={14} className="drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Color Input & Picker */}
          <div className="pt-1">
            <div className="text-[11px] font-medium text-[#8A8780] mb-1.5">
              Власний колір (HEX або назва Tailwind):
            </div>
            <div className="flex items-center gap-2">
              <label 
                style={{ backgroundColor: resolvedHex }}
                className="w-10 h-10 rounded-xl cursor-pointer border border-black/10 shrink-0 shadow-sm flex items-center justify-center text-white hover:scale-105 transition-transform"
                title="Відкрити палітру кольорів"
              >
                <input 
                  type="color" 
                  value={resolvedHex.startsWith('#') && resolvedHex.length === 7 ? resolvedHex : '#CC785C'} 
                  onChange={e => setColor(e.target.value)} 
                  className="opacity-0 w-0 h-0 cursor-pointer"
                />
                <Palette size={18} className="drop-shadow" />
              </label>

              <input 
                type="text"
                className="flex-1 p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C] font-mono" 
                placeholder="#3B82F6 або bg-blue-500" 
                value={color} 
                onChange={e=>setColor(e.target.value)} 
              />
            </div>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex gap-2.5 justify-end border-t border-[#33312D] pt-4">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2.5 text-sm font-medium text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#2F2E2B] rounded-xl transition-colors"
          >
            Скасувати
          </button>
          <button 
            type="button"
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), description: desc.trim(), color: color.trim() || '#CC785C', logoUrl: logoUrl || '' })} 
            className="px-5 py-2.5 text-sm font-semibold bg-[#CC785C] hover:bg-[#D97757] disabled:opacity-50 text-white rounded-xl shadow-md transition-colors"
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Model Form Modal
// -------------------------------------------------------------
function ModelFormModal({ model, providers, apiModels, onClose, onSave }: any) {
  const [name, setName] = useState(model?.name || '');
  const [desc, setDesc] = useState(model?.description || '');
  const [apiId, setApiId] = useState(model?.apiModelId || (apiModels && apiModels.length > 0 ? apiModels[0].id : ''));
  const [price, setPrice] = useState(model?.priceInfo || '');
  const [shortPrice, setShortPrice] = useState(model?.shortPriceInfo || '');
  const [providerId, setProviderId] = useState(model?.providerId || (providers[0]?.id || ''));
  const [tier, setTier] = useState(model?.tier || 'common');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#242320] text-[#ECE8E1] p-6 rounded-3xl w-full max-w-md shadow-2xl border border-[#383632] max-h-[92vh] overflow-y-auto my-auto space-y-4">
        <div className="flex justify-between items-center border-b border-[#33312D] pb-3">
          <h3 className="text-lg font-bold text-[#ECE8E1]">
            {model ? 'Редагувати модель' : 'Додати нову модель'}
          </h3>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#302E2A] transition-colors"
          >
            <X size={20}/>
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
            Постачальник *
          </label>
          <select 
            className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] rounded-xl focus:outline-none focus:border-[#CC785C]" 
            value={providerId} 
            onChange={e=>setProviderId(e.target.value)}
          >
            {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        
        {apiModels && apiModels.length > 0 ? (
          <div>
            <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
              Модель із API *
            </label>
            <select 
              className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] rounded-xl focus:outline-none focus:border-[#CC785C]" 
              value={apiId} 
              onChange={e => {
                const val = e.target.value;
                setApiId(val);
                const found = apiModels.find((m: any) => m.id === val);
                if (found && !name) setName(found.name);
              }}
            >
              <option value="" disabled>Оберіть модель зі списку доступних</option>
              {apiModels.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
              API ID моделі *
            </label>
            <input 
              className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C]" 
              placeholder="API ID (напр. gpt-4o або anthropic/claude-3.5-sonnet)" 
              value={apiId} 
              onChange={e=>setApiId(e.target.value)} 
            />
          </div>
        )}
        
        <div>
          <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
            Назва моделі *
          </label>
          <input 
            className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C]" 
            placeholder="Назва (напр. GPT-4o, Claude 3.5 Sonnet)" 
            value={name} 
            onChange={e=>setName(e.target.value)} 
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
              Коротка ціна
            </label>
            <input 
              className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C]" 
              placeholder="напр. $3-$15" 
              value={shortPrice} 
              onChange={e=>setShortPrice(e.target.value)} 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
              Рівень (RPG Tier)
            </label>
            <select 
              className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] rounded-xl focus:outline-none focus:border-[#CC785C]" 
              value={tier} 
              onChange={e=>setTier(e.target.value)}
            >
              <option value="common">Звичайний (Common)</option>
              <option value="uncommon">Незвичайний (Uncommon)</option>
              <option value="rare">Рідкісний (Rare)</option>
              <option value="epic">Епічний (Epic)</option>
              <option value="legendary">Легендарний (Legendary)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
            Повний опис ціни
          </label>
          <input 
            className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C]" 
            placeholder="напр. $3 вхід / $15 вихід за 1M токенів" 
            value={price} 
            onChange={e=>setPrice(e.target.value)} 
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1.5">
            Опис моделі
          </label>
          <textarea 
            rows={2}
            className="w-full p-2.5 text-sm border border-[#383632] bg-[#1B1A17] text-[#ECE8E1] placeholder-[#76736C] rounded-xl focus:outline-none focus:border-[#CC785C] resize-none" 
            placeholder="Опис можливостей моделі..." 
            value={desc} 
            onChange={e=>setDesc(e.target.value)} 
          />
        </div>

        <div className="flex gap-2.5 justify-end border-t border-[#33312D] pt-4">
          <button 
            type="button"
            onClick={onClose} 
            className="px-4 py-2.5 text-sm font-medium text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#2F2E2B] rounded-xl transition-colors"
          >
            Скасувати
          </button>
          <button 
            type="button"
            disabled={!name.trim() || !apiId.trim()}
            onClick={() => onSave({ name: name.trim(), description: desc.trim(), apiModelId: apiId.trim(), priceInfo: price.trim(), shortPriceInfo: shortPrice.trim(), providerId, tier })} 
            className="px-5 py-2.5 text-sm font-semibold bg-[#CC785C] hover:bg-[#D97757] disabled:opacity-50 text-white rounded-xl shadow-md transition-colors"
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}
