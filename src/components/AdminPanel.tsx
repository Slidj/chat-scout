import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  getProviders, getModels, saveProvider, updateProvider, deleteProvider, 
  saveModel, updateModel, deleteModel, getUsers, getRecentActivities, getQueries,
  subscribeToUsers, subscribeToQueries, subscribeToActivities,
  deleteUser, toggleBlockUser,
  AppUser, ActivityEvent, QueryLog, logActivityEvent,
  TopupRequest, subscribeToTopups, updateTopupStatus, sendCouponToUser,
  subscribePaymentSettings, updatePaymentSettings, PaymentSettings, DEFAULT_PAYMENT_SETTINGS,
  subscribePreloaderSettings, updatePreloaderSettings, PreloaderSettings, DEFAULT_PRELOADER_SETTINGS
} from '../lib/db';
import { fetchModels, resolveMediaLink } from '../lib/api';
import { Provider, AiModel } from '../types';
import { AppPreloader } from './AppPreloader';
import { 
  Plus, Edit2, Edit3, Trash2, X, Upload, Check, Palette, Shield, 
  LayoutDashboard, Building2, Cpu, Key, Users, Menu, TrendingUp, 
  Clock, RefreshCw, Eye, EyeOff, Search, ChevronRight, Activity, 
  Sparkles, CheckCircle2, AlertCircle, BarChart3, Globe, Zap,
  UserCheck, ArrowUpRight, Copy, Ban, Unlock, ChevronLeft,
  ChevronsLeft, ChevronsRight, Info, CreditCard, Gift, Send,
  ExternalLink, FileText, Image as ImageIcon, CheckCircle, XCircle,
  Film, Play, Waves, Sliders, Volume2, MonitorPlay
} from 'lucide-react';
import { resolveColorToHex, COLOR_PRESETS, ColorPreset, resizeImageFile, getTierClasses } from '../lib/utils';

type AdminTab = 'dashboard' | 'providers' | 'models' | 'api-keys' | 'users' | 'topups' | 'preloader';
type DrillDownModal = null | 'all_users' | 'active_today' | 'queries_detail' | 'models_overview' | 'chart_point' | 'provider_detail';

interface AdminPanelProps {
  onClose: () => void;
  apiModels?: { id: string; name: string }[];
  currentUser?: any;
}

export function AdminPanel({ onClose, apiModels = [], currentUser }: AdminPanelProps) {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Real-time Data State from Firestore
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [queries, setQueries] = useState<QueryLog[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [topups, setTopups] = useState<TopupRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Top-up & Coupon Management State
  const [topupFilter, setTopupFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all');
  const [topupSearch, setTopupSearch] = useState('');
  const [selectedTopupForReply, setSelectedTopupForReply] = useState<TopupRequest | null>(null);
  const [replyCouponCode, setReplyCouponCode] = useState('');
  const [replyAmount, setReplyAmount] = useState<number | string>('');
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingCoupon, setIsSendingCoupon] = useState(false);
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState<string | null>(null);

  // Dynamic Payment / Bank Card Settings State
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [isEditingPaymentSettings, setIsEditingPaymentSettings] = useState(false);
  const [cardFormNumber, setCardFormNumber] = useState('');
  const [cardFormBank, setCardFormBank] = useState('');
  const [cardFormRecipient, setCardFormRecipient] = useState('');
  const [cardFormNote, setCardFormNote] = useState('');
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [cardSaveSuccess, setCardSaveSuccess] = useState(false);

  // Dynamic Custom Preloader & Video/GIF Splash Settings State
  const [preloaderSettings, setPreloaderSettings] = useState<PreloaderSettings>(DEFAULT_PRELOADER_SETTINGS);
  const [preloaderEnabled, setPreloaderEnabled] = useState(true);
  const [preloaderMediaType, setPreloaderMediaType] = useState<'video' | 'gif' | 'image' | 'none'>('none');
  const [preloaderMediaUrl, setPreloaderMediaUrl] = useState('');
  const [preloaderDuration, setPreloaderDuration] = useState(15);
  const [preloaderTitle, setPreloaderTitle] = useState('');
  const [preloaderSubtext, setPreloaderSubtext] = useState('');
  const [preloaderAllowSkip, setPreloaderAllowSkip] = useState(true);
  const [preloaderSecondaryImage, setPreloaderSecondaryImage] = useState('');
  const [preloaderSecondaryDuration, setPreloaderSecondaryDuration] = useState(3);
  const [preloaderSecondaryText, setPreloaderSecondaryText] = useState('Завантаження застосунку...');
  const [isSavingPreloader, setIsSavingPreloader] = useState(false);
  const [preloaderSaveSuccess, setPreloaderSaveSuccess] = useState(false);
  const [adminTestingPreloader, setAdminTestingPreloader] = useState(false);
  const [isResolvingMedia, setIsResolvingMedia] = useState(false);
  const [mediaResolveFeedback, setMediaResolveFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Drill-down Modal State (Clickable Cards & Stats)
  const [drillModal, setDrillModal] = useState<DrillDownModal>(null);
  const [selectedChartPoint, setSelectedChartPoint] = useState<{ label: string; users: number; queries: number } | null>(null);
  const [selectedProviderDetail, setSelectedProviderDetail] = useState<Provider | null>(null);

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

  // Search & Filters within views
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [modelProviderFilter, setModelProviderFilter] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');
  const [modalSearch, setModalSearch] = useState('');

  // Pagination State for Users View
  const [userPage, setUserPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  // Pagination State for Modal
  const [modalUserPage, setModalUserPage] = useState<number>(1);
  const [modalPageSize, setModalPageSize] = useState<number>(10);

  // Copy Feedback State
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyText = (text: string, keyId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // 1. Initial Load & Realtime Subscriptions
  useEffect(() => {
    const savedKey = localStorage.getItem('adminApiKey');
    if (savedKey) {
      setAdminApiKey(savedKey);
      fetchModels(savedKey).then(setAdminApiModels).catch(console.error);
    }

    loadInitialStaticData();

    // Subscribe to live Firestore updates
    const unsubUsers = subscribeToUsers((liveUsers) => setUsers(liveUsers));
    const unsubQueries = subscribeToQueries((liveQueries) => setQueries(liveQueries));
    const unsubActivities = subscribeToActivities((liveActs) => setActivities(liveActs));
    const unsubTopups = subscribeToTopups((liveTopups) => setTopups(liveTopups));
    const unsubPayment = subscribePaymentSettings((settings) => {
      setPaymentSettings(settings);
      setCardFormNumber(settings.cardNumber);
      setCardFormBank(settings.bankName || '');
      setCardFormRecipient(settings.recipientName || '');
      setCardFormNote(settings.note || '');
    });
    const unsubPreloader = subscribePreloaderSettings((settings) => {
      setPreloaderSettings(settings);
      setPreloaderEnabled(settings.isEnabled);
      setPreloaderMediaType(settings.mediaType);
      setPreloaderMediaUrl(settings.mediaUrl || '');
      setPreloaderDuration(settings.durationSeconds || 15);
      setPreloaderTitle(settings.title || '');
      setPreloaderSubtext(settings.subtext || '');
      setPreloaderAllowSkip(settings.allowSkip ?? true);
      setPreloaderSecondaryImage(settings.secondaryImageUrl || '');
      setPreloaderSecondaryDuration(settings.secondaryDurationSeconds || 3);
      setPreloaderSecondaryText(settings.secondaryText || 'Завантаження застосунку...');
    });

    return () => {
      unsubUsers();
      unsubQueries();
      unsubActivities();
      unsubTopups();
      unsubPayment();
      unsubPreloader();
    };
  }, []);

  const loadInitialStaticData = async () => {
    setIsLoading(true);
    try {
      const [p, m, u, q, a] = await Promise.all([
        getProviders(),
        getModels(),
        getUsers(),
        getQueries(),
        getRecentActivities()
      ]);
      setProviders(p);
      setModels(m);
      if (u.length > 0) setUsers(u);
      if (q.length > 0) setQueries(q);
      if (a.length > 0) setActivities(a);
    } catch (e) {
      console.error('Error loading static admin data:', e);
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

  // Delete User handler
  const handleDeleteUser = async (u: AppUser) => {
    if (u.telegramId === 1365018137) {
      alert('Неможливо видалити головного адміністратора!');
      return;
    }
    const displayName = u.firstName || (u.username ? `@${u.username}` : `ID ${u.telegramId || u.id}`);
    if (!confirm(`Ви дійсно бажаєте видалити користувача "${displayName}" з бази даних?\nЦю дію неможливо скасувати.`)) {
      return;
    }
    try {
      await deleteUser(u.id);
    } catch (err: any) {
      alert('Помилка видалення: ' + err.message);
    }
  };

  // Block / Unblock User handler
  const handleToggleBlock = async (u: AppUser) => {
    if (u.telegramId === 1365018137) {
      alert('Неможливо заблокувати головного адміністратора!');
      return;
    }
    const willBlock = !u.isBlocked;
    let reason = 'Обмеження доступу за рішенням адміністрації';

    if (willBlock) {
      const inputReason = prompt(
        `Вкажіть причину обмеження доступу для користувача ${u.firstName || u.username || u.id} (користувач побачить її у ввічливому повідомленні):`,
        reason
      );
      if (inputReason === null) return; // User cancelled prompt
      if (inputReason.trim()) reason = inputReason.trim();
    }

    try {
      await toggleBlockUser(u.id, willBlock, reason);
    } catch (err: any) {
      alert('Помилка зміни статусу блокування: ' + err.message);
    }
  };

  // -------------------------------------------------------------
  // Dynamic Real Metrics Calculations
  // -------------------------------------------------------------
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const fifteenMinMs = 15 * 60 * 1000;

  // Active in last 24h
  const active24hUsers = useMemo(() => {
    return users.filter(u => {
      if (!u.lastActive) return false;
      const t = new Date(u.lastActive).getTime();
      return now - t <= oneDayMs;
    });
  }, [users, now]);

  // Online right now (last 15 minutes)
  const onlineNowUsers = useMemo(() => {
    return users.filter(u => {
      if (!u.lastActive) return false;
      const t = new Date(u.lastActive).getTime();
      return now - t <= fifteenMinMs;
    });
  }, [users, now]);

  // Total query count
  const totalQueriesCount = useMemo(() => {
    if (queries.length > 0) return queries.length;
    return users.reduce((acc, u) => acc + (u.totalQueries || 0), 0);
  }, [queries, users]);

  // Average response time
  const averageResponseTimeMs = useMemo(() => {
    if (queries.length === 0) return 2100;
    const total = queries.reduce((acc, q) => acc + (q.durationMs || 0), 0);
    return Math.round(total / queries.length);
  }, [queries]);

  // Success rate
  const successRatePct = useMemo(() => {
    if (queries.length === 0) return 98.6;
    const successful = queries.filter(q => q.status === 'success').length;
    return Math.round((successful / queries.length) * 1000) / 10;
  }, [queries]);

  // -------------------------------------------------------------
  // Real Chart Data Aggregation
  // -------------------------------------------------------------
  const chartData = useMemo(() => {
    if (chartTimeframe === '24h') {
      const hours = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      const realUserCounts = hours.map(() => 0);
      const realQueryCounts = hours.map(() => 0);

      queries.forEach(q => {
        const d = new Date(q.timestamp);
        if (now - d.getTime() <= oneDayMs) {
          const h = d.getHours();
          const bucket = Math.min(Math.floor(h / 2), hours.length - 1);
          realQueryCounts[bucket] += 1;
        }
      });

      users.forEach(u => {
        if (!u.lastActive) return;
        const d = new Date(u.lastActive);
        if (now - d.getTime() <= oneDayMs) {
          const h = d.getHours();
          const bucket = Math.min(Math.floor(h / 2), hours.length - 1);
          realUserCounts[bucket] += 1;
        }
      });

      return hours.map((hour, idx) => {
        const u = realUserCounts[idx] || (users.length > 0 ? 1 : 0);
        const q = realQueryCounts[idx] || Math.round(u * 2);
        return {
          label: hour,
          users: Math.max(u, idx === 10 ? Math.max(users.length, 1) : 0),
          queries: Math.max(q, idx === 10 ? totalQueriesCount : 0)
        };
      });
    } else if (chartTimeframe === '7d') {
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
      const realUserCounts = days.map(() => 0);
      const realQueryCounts = days.map(() => 0);

      queries.forEach(q => {
        const d = new Date(q.timestamp);
        if (now - d.getTime() <= 7 * oneDayMs) {
          const dayIdx = (d.getDay() + 6) % 7;
          realQueryCounts[dayIdx] += 1;
        }
      });

      users.forEach(u => {
        if (!u.lastActive) return;
        const d = new Date(u.lastActive);
        if (now - d.getTime() <= 7 * oneDayMs) {
          const dayIdx = (d.getDay() + 6) % 7;
          realUserCounts[dayIdx] += 1;
        }
      });

      return days.map((day, idx) => {
        const u = realUserCounts[idx];
        const q = realQueryCounts[idx];
        return {
          label: day,
          users: u > 0 ? u : (users.length > 0 ? 1 : 0),
          queries: q > 0 ? q : (totalQueriesCount > 0 ? Math.ceil(totalQueriesCount / 7) : 0)
        };
      });
    } else {
      const points = [];
      for (let i = 28; i >= 0; i -= 4) {
        const targetDate = new Date(now - i * oneDayMs);
        const label = `${targetDate.getDate()} ${targetDate.toLocaleDateString('uk-UA', { month: 'short' })}`;
        
        const qCount = queries.filter(q => {
          const qd = new Date(q.timestamp);
          return Math.abs(qd.getTime() - targetDate.getTime()) <= 2 * oneDayMs;
        }).length;

        const uCount = users.filter(u => {
          if (!u.lastActive) return false;
          const ud = new Date(u.lastActive);
          return Math.abs(ud.getTime() - targetDate.getTime()) <= 2 * oneDayMs;
        }).length;

        points.push({
          label,
          users: Math.max(uCount, users.length > 0 ? 1 : 0),
          queries: Math.max(qCount, totalQueriesCount > 0 ? Math.ceil(totalQueriesCount / 8) : 0)
        });
      }
      return points;
    }
  }, [chartTimeframe, queries, users, now, totalQueriesCount]);

  // SVG Chart Dimensions
  const chartWidth = 560;
  const chartHeight = 160;
  const paddingX = 24;
  const paddingY = 20;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const maxVal = Math.max(...chartData.map(d => Math.max(d.users, d.queries)), 4);
  const minVal = 0;

  const points = chartData.map((d, idx) => {
    const val = d.users;
    const x = paddingX + (idx / Math.max(chartData.length - 1, 1)) * plotWidth;
    const y = chartHeight - paddingY - ((val - minVal) / (maxVal - minVal)) * plotHeight;
    return { ...d, x, y };
  });

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

  // -------------------------------------------------------------
  // Filtered & Paginated Users for TAB 5
  // -------------------------------------------------------------
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const str = `${u.firstName || ''} ${u.lastName || ''} ${u.username || ''} ${u.telegramId || ''} ${u.id}`.toLowerCase();
      return str.includes(userSearch.toLowerCase());
    });
  }, [users, userSearch]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  
  // Safe page correction
  const safeUserPage = Math.min(Math.max(1, userPage), totalUserPages);

  const paginatedUsers = useMemo(() => {
    const start = (safeUserPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, safeUserPage, pageSize]);

  // Reset to page 1 on search change
  useEffect(() => {
    setUserPage(1);
  }, [userSearch, pageSize]);

  // Helper to generate page buttons
  const getPaginationRange = (current: number, total: number) => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const delta = 1;
    const range: (number | string)[] = [];
    const left = current - delta;
    const right = current + delta;

    range.push(1);
    if (left > 2) range.push('...');

    for (let i = Math.max(2, left); i <= Math.min(total - 1, right); i++) {
      range.push(i);
    }

    if (right < total - 1) range.push('...');
    range.push(total);

    return range;
  };

  const pendingTopupsCount = topups.filter(t => t.status === 'pending').length;

  const handleOpenReplyModal = (req: TopupRequest) => {
    setSelectedTopupForReply(req);
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    setReplyCouponCode(`TOPUP-${req.amount}-${randomSuffix}`);
    setReplyAmount(req.amount);
    setReplyMessage(`Дякуємо за поповнення! Платіж на суму ${req.amount} грн підтверджено. Ваш персональний промокод для чату активовано.`);
  };

  const handleGenerateNewCouponCode = () => {
    if (!selectedTopupForReply) return;
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    setReplyCouponCode(`TOPUP-${selectedTopupForReply.amount}-${randomSuffix}`);
  };

  const handleSendCouponSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopupForReply || !replyCouponCode.trim()) return;

    setIsSendingCoupon(true);
    try {
      // 1. Send coupon to user
      await sendCouponToUser({
        topupId: selectedTopupForReply.id,
        userId: selectedTopupForReply.userId,
        userName: selectedTopupForReply.userName,
        couponCode: replyCouponCode.trim(),
        amount: replyAmount,
        currency: '₴',
        message: replyMessage.trim() || undefined,
      });

      // 2. Mark topup as completed with admin coupon info
      await updateTopupStatus(selectedTopupForReply.id, 'completed', {
        adminCouponCode: replyCouponCode.trim(),
        adminCouponAmount: replyAmount,
        adminReplyMessage: replyMessage.trim() || undefined,
      });

      setSelectedTopupForReply(null);
    } catch (err) {
      console.error('Error sending coupon:', err);
      alert('Помилка при відправці купона');
    } finally {
      setIsSendingCoupon(false);
    }
  };

  const handleRejectTopup = async (req: TopupRequest) => {
    const reason = prompt('Вкажіть причину відхилення (наприклад: Платіж не знайдено на картці):', 'Платіж не знайдено на картці');
    if (reason === null) return;
    try {
      await updateTopupStatus(req.id, 'rejected', {
        adminReplyMessage: reason.trim() || 'Платіж не підтверджено'
      });
    } catch (err) {
      console.error('Error rejecting topup:', err);
    }
  };

  const handleSaveCardSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardFormNumber.trim()) {
      alert('Будь ласка, вкажіть номер картки');
      return;
    }
    setIsSavingCard(true);
    try {
      await updatePaymentSettings({
        cardNumber: cardFormNumber.trim(),
        bankName: cardFormBank.trim() || undefined,
        recipientName: cardFormRecipient.trim() || undefined,
        note: cardFormNote.trim() || undefined
      }, currentUser?.first_name || currentUser?.username || 'Admin');
      setIsEditingPaymentSettings(false);
      setCardSaveSuccess(true);
      setTimeout(() => setCardSaveSuccess(false), 3500);
    } catch (err: any) {
      alert('Помилка збереження реквізитів: ' + err.message);
    } finally {
      setIsSavingCard(false);
    }
  };

  const handleResolveMediaUrl = async (customUrl?: string) => {
    const rawTarget = typeof customUrl === 'string' ? customUrl : preloaderMediaUrl;
    const target = rawTarget.trim();
    if (!target) {
      setMediaResolveFeedback({
        type: 'error',
        message: 'Будь ласка, вставте посилання на Pinterest (напр. https://pin.it/... або https://pinterest.com/pin/...) або пряме посилання.'
      });
      return;
    }

    setIsResolvingMedia(true);
    setMediaResolveFeedback(null);
    try {
      const res = await resolveMediaLink(target);
      if (res.success && res.mediaUrl) {
        setPreloaderMediaUrl(res.mediaUrl);
        if (res.mediaType) {
          setPreloaderMediaType(res.mediaType);
        }
        setMediaResolveFeedback({
          type: 'success',
          message: '✓ Відео з Pinterest успішно розпізнано! Прямий HD відеопотік (.mp4) підключено.'
        });
      } else {
        setMediaResolveFeedback({
          type: 'error',
          message: res.error || 'Не вдалося автоматично знайти відео за цим посиланням.'
        });
      }
    } catch (err: any) {
      setMediaResolveFeedback({
        type: 'error',
        message: 'Помилка підключення: ' + (err.message || 'Спробуйте ще раз')
      });
    } finally {
      setIsResolvingMedia(false);
    }
  };

  const handleSavePreloaderConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Guard against large base64 strings exceeding Firestore 1MB document limit
    if (preloaderMediaUrl.startsWith('data:') && preloaderMediaUrl.length > 800 * 1024) {
      alert(
        '⚠️ Розмір медіа-файлу перевищує ліміт бази даних (1 МБ).\n\n' +
        '👉 Скопіюйте посилання на це відео з Pinterest (наприклад: https://pin.it/...) та вставте його замість прямого файлу — це дозволить транслювати відео у високій якості без обмежень!'
      );
      return;
    }

    // Auto-detect video if URL contains mp4 / pinimg
    const cleanUrl = preloaderMediaUrl.trim();
    let finalType = preloaderMediaType;
    if (cleanUrl) {
      if (cleanUrl.includes('.mp4') || cleanUrl.includes('.webm') || cleanUrl.includes('pinimg.com')) {
        finalType = 'video';
      } else if (finalType === 'none') {
        finalType = 'image';
      }
    }

    // Automatically generate a fresh version ID on every save so ALL users (and admin) immediately see the new video!
    const freshVersionId = `v_${Date.now()}`;

    setIsSavingPreloader(true);
    try {
      await updatePreloaderSettings({
        isEnabled: preloaderEnabled,
        mediaType: finalType,
        mediaUrl: cleanUrl,
        durationSeconds: Number(preloaderDuration) || 15,
        title: preloaderTitle.trim(),
        subtext: preloaderSubtext.trim(),
        allowSkip: preloaderAllowSkip,
        secondaryImageUrl: preloaderSecondaryImage.trim(),
        secondaryDurationSeconds: Number(preloaderSecondaryDuration) || 3,
        secondaryText: preloaderSecondaryText.trim() || 'Завантаження застосунку...',
        versionId: freshVersionId
      }, currentUser?.first_name || currentUser?.username || 'Admin');

      // Clear local seen state for this new version so admin sees the new video campaign right away
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`seen_preloader_version_${freshVersionId}`);
      }

      setPreloaderMediaType(finalType);
      setPreloaderSaveSuccess(true);
      setTimeout(() => setPreloaderSaveSuccess(false), 3500);
    } catch (err: any) {
      alert('Помилка збереження налаштувань прелоадера: ' + err.message);
    } finally {
      setIsSavingPreloader(false);
    }
  };

  const handleResetPreloaderVersion = async () => {
    const isConfirmed = window.confirm(
      'Оновити версію відео-заставки для всіх? Це змусить абсолютно всіх користувачів побачити це відео знову при наступному відкритті застосунку (навіть якщо вони вже бачили попереднє).'
    );
    if (!isConfirmed) return;

    setIsSavingPreloader(true);
    try {
      const newVersionId = `holiday_${Date.now()}`;
      await updatePreloaderSettings({
        versionId: newVersionId
      }, currentUser?.first_name || currentUser?.username || 'Admin');
      alert(`Версію оновлено (${newVersionId})! Усі користувачі побачать це відео знову при наступному вході.`);
    } catch (err: any) {
      alert('Помилка оновлення версії: ' + err.message);
    } finally {
      setIsSavingPreloader(false);
    }
  };

  const handlePreloaderFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict safety check: Firestore document max size is 1MB. Base64 expands by ~33%.
    // To fit comfortably with other fields, cap device uploads at 750KB.
    const MAX_ALLOWED_BYTES = 750 * 1024;
    if (file.size > MAX_ALLOWED_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      alert(
        `⚠️ Файл завеликий для збереження в базі даних (${sizeMb} МБ).\n` +
        `Хмарна база даних підтримує файли з пристрою розміром до 750 КБ.\n\n` +
        `💡 Рекомендовано: замість файлу вставте посилання на відео з Pinterest (наприклад: https://pin.it/... або https://pinterest.com/pin/...) і натисніть «Розпізнати» — це працює миттєво та транслює HD якість!`
      );
      e.target.value = '';
      return;
    }

    if (file.type.startsWith('video/')) {
      setPreloaderMediaType('video');
    } else if (file.type === 'image/gif') {
      setPreloaderMediaType('gif');
    } else if (file.type.startsWith('image/')) {
      setPreloaderMediaType('image');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setPreloaderMediaUrl(event.target.result as string);
        setMediaResolveFeedback({
          type: 'info',
          message: `Файл з пристрою готовий (${(file.size / 1024).toFixed(0)} КБ)`
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSecondaryImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 750 * 1024) {
      alert(`⚠️ Зображення завелике (${(file.size / (1024 * 1024)).toFixed(2)} МБ). Оберіть файл до 750 КБ.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setPreloaderSecondaryImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const navItems = [
    { id: 'dashboard' as AdminTab, label: 'Дашборд', icon: LayoutDashboard, badge: null, desc: 'Жива статистика та аналітика' },
    { id: 'topups' as AdminTab, label: 'Поповнення & Купони', icon: CreditCard, badge: pendingTopupsCount > 0 ? pendingTopupsCount : null, desc: 'Перевірка чеків, видача купонів' },
    { id: 'preloader' as AdminTab, label: 'Прелоадер & Заставка', icon: Film, badge: null, desc: 'Pinterest відео, GIF, хвиля' },
    { id: 'users' as AdminTab, label: 'Користувачі', icon: Users, badge: users.length, desc: 'Акаунти, блокування, сторінки' },
    { id: 'providers' as AdminTab, label: 'Постачальники', icon: Building2, badge: providers.length, desc: 'Бренди, кольори, лого' },
    { id: 'models' as AdminTab, label: 'ШІ Моделі', icon: Cpu, badge: models.length, desc: 'Каталог, API, RPG тарифи' },
    { id: 'api-keys' as AdminTab, label: 'API Ключі & Сервер', icon: Key, badge: null, desc: 'Master key, синхронізація' },
  ];

  const currentTabTitle = navItems.find(n => n.id === activeTab)?.label || 'Дашборд';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#171614] text-[#ECE8E1] overflow-hidden font-sans select-none">
      
      {/* Top Header */}
      <header 
        className="flex items-center justify-between px-4 sm:px-6 pb-3.5 bg-[#1C1B18] border-b border-[#2C2A26] shrink-0 z-20"
        style={{ paddingTop: 'calc(2.75rem + var(--safe-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
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

        {/* Live Status and Refresh */}
        <div className="flex items-center gap-2.5">
          <button 
            onClick={loadInitialStaticData} 
            className="p-2 text-[#9E9A92] hover:text-[#ECE8E1] hover:bg-[#252421] rounded-xl transition-colors"
            title="Оновити дані вручну"
          >
            <RefreshCw size={17} className={isLoading ? 'animate-spin text-[#CC785C]' : ''} />
          </button>

          <div className="flex items-center gap-1.5 bg-[#252421] border border-[#3A3834] px-2.5 py-1 rounded-full text-xs font-medium text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden xs:inline">Firebase Live</span>
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

        {/* Backdrop for Animated Sidebar */}
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
              {currentUser?.photo_url ? (
                <img 
                  src={currentUser.photo_url} 
                  alt={currentUser.first_name || 'Admin'} 
                  className="w-11 h-11 rounded-2xl object-cover border border-[#44413C] shadow-md shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-[#CC785C] text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">
                  {currentUser?.first_name ? currentUser.first_name.charAt(0).toUpperCase() : 'Є'}
                </div>
              )}
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
              Розділи управління
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
                Firestore Live
              </span>
              <span className="font-mono text-[11px] text-emerald-400 font-semibold">Синхронно</span>
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
              
              {/* Banner */}
              <div className="bg-gradient-to-r from-[#2B231D] via-[#242320] to-[#1F1E1B] p-5 sm:p-6 rounded-3xl border border-[#44332A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#CC785C] bg-[#3A2A22] px-2.5 py-0.5 rounded-full mb-2">
                    <Sparkles size={12} />
                    <span>Жива аналітика та контроль доступу</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#FAF8F5] tracking-tight">
                    Вітаємо, {currentUser?.first_name || 'Адмін'}!
                  </h2>
                  <p className="text-xs sm:text-sm text-[#A09D95] mt-1 max-w-xl">
                    Усі дані нижче синхронізуються в реальному часі. <strong>Натискайте на будь-яку картку</strong> або показник, щоб відкрити розгорнутий список користувачів та звіт.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="flex items-center gap-2 bg-[#CC785C] hover:bg-[#D97757] text-white px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-md transition-all active:scale-95"
                  >
                    <Menu size={16} />
                    <span>Меню адміна</span>
                  </button>
                </div>
              </div>

              {/* 4 Clickable Metric Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                
                {/* 1. Total Users */}
                <div 
                  onClick={() => { setModalSearch(''); setModalUserPage(1); setDrillModal('all_users'); }}
                  className="bg-[#242320] p-4 sm:p-5 rounded-3xl border border-[#363430] hover:border-[#CC785C] cursor-pointer transition-all active:scale-98 flex flex-col justify-between group shadow-xs hover:shadow-md"
                  title="Натисніть для перегляду всіх користувачів"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8E8B83] group-hover:text-[#ECE8E1] transition-colors flex items-center gap-1">
                      <span>Користувачі</span>
                      <ArrowUpRight size={13} className="text-[#CC785C] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                    <div className="p-2 rounded-xl bg-[#2E2822] text-[#CC785C] group-hover:bg-[#CC785C] group-hover:text-white transition-colors">
                      <Users size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#ECE8E1] tracking-tight">
                      {users.length}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400 font-medium">
                      <TrendingUp size={12} />
                      <span>{onlineNowUsers.length} зараз онлайн</span>
                    </div>
                  </div>
                </div>

                {/* 2. Active in 24h */}
                <div 
                  onClick={() => { setModalSearch(''); setModalUserPage(1); setDrillModal('active_today'); }}
                  className="bg-[#242320] p-4 sm:p-5 rounded-3xl border border-[#363430] hover:border-emerald-500 cursor-pointer transition-all active:scale-98 flex flex-col justify-between group shadow-xs hover:shadow-md"
                  title="Натисніть для списку активних користувачів за добу"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8E8B83] group-hover:text-[#ECE8E1] transition-colors flex items-center gap-1">
                      <span>Активні за добу</span>
                      <ArrowUpRight size={13} className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                    <div className="p-2 rounded-xl bg-[#212E27] text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                      <UserCheck size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#ECE8E1] tracking-tight">
                      {active24hUsers.length}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#8E8B83]">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Переглянути список</span>
                    </div>
                  </div>
                </div>

                {/* 3. AI Queries */}
                <div 
                  onClick={() => { setModalSearch(''); setDrillModal('queries_detail'); }}
                  className="bg-[#242320] p-4 sm:p-5 rounded-3xl border border-[#363430] hover:border-indigo-400 cursor-pointer transition-all active:scale-98 flex flex-col justify-between group shadow-xs hover:shadow-md"
                  title="Натисніть для перегляду журналу запитів"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8E8B83] group-hover:text-[#ECE8E1] transition-colors flex items-center gap-1">
                      <span>Запити до ШІ</span>
                      <ArrowUpRight size={13} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                    <div className="p-2 rounded-xl bg-[#262432] text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                      <Zap size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#ECE8E1] tracking-tight">
                      {totalQueriesCount}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-[#8E8B83]">
                      <span>~{(averageResponseTimeMs / 1000).toFixed(1)}с • {successRatePct}% успіх</span>
                    </div>
                  </div>
                </div>

                {/* 4. Models & Providers */}
                <div 
                  onClick={() => { setModalSearch(''); setDrillModal('models_overview'); }}
                  className="bg-[#242320] p-4 sm:p-5 rounded-3xl border border-[#363430] hover:border-amber-400 cursor-pointer transition-all active:scale-98 flex flex-col justify-between group shadow-xs hover:shadow-md"
                  title="Натисніть для огляду та розподілу моделей"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#8E8B83] group-hover:text-[#ECE8E1] transition-colors flex items-center gap-1">
                      <span>Моделі / Провайдери</span>
                      <ArrowUpRight size={13} className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                    <div className="p-2 rounded-xl bg-[#2D281F] text-amber-400 group-hover:bg-amber-400 group-hover:text-black transition-colors">
                      <Cpu size={16} />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#ECE8E1] tracking-tight">
                      {models.length} <span className="text-base font-normal text-[#8E8B83]">/ {providers.length}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-amber-400 font-medium">
                      <span>Натисніть для деталей</span>
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
                      <h3 className="text-base font-bold text-[#ECE8E1]">Активність користувачів (Реальні дані)</h3>
                    </div>
                    <p className="text-xs text-[#8E8B83] mt-0.5">
                      Клікайте на точки графіка для розгортання подій конкретної години чи дня
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
                    </defs>

                    {/* Grid lines */}
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
                        <g 
                          key={idx} 
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedChartPoint({ label: pt.label, users: pt.users, queries: pt.queries });
                            setDrillModal('chart_point');
                          }}
                        >
                          <circle 
                            cx={pt.x} 
                            cy={pt.y} 
                            r="14" 
                            fill="transparent"
                            onMouseEnter={() => setHoveredPoint(pt)}
                            onTouchStart={() => setHoveredPoint(pt)}
                          />
                          <circle 
                            cx={pt.x} 
                            cy={pt.y} 
                            r={isHovered ? 6 : 4} 
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

                {/* Footer insights */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#302E2A]">
                  <div 
                    onClick={() => { setModalSearch(''); setModalUserPage(1); setDrillModal('active_today'); }}
                    className="flex items-center gap-2.5 p-2 rounded-2xl hover:bg-[#1F1E1B] cursor-pointer transition-colors"
                  >
                    <div className="p-2 bg-[#1B1A17] text-[#CC785C] rounded-xl">
                      <Clock size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#8E8B83]">Активність за добу</div>
                      <div className="text-xs font-bold text-[#ECE8E1]">{active24hUsers.length} користувачів</div>
                    </div>
                  </div>

                  <div 
                    onClick={() => { setModalSearch(''); setDrillModal('queries_detail'); }}
                    className="flex items-center gap-2.5 p-2 rounded-2xl hover:bg-[#1F1E1B] cursor-pointer transition-colors"
                  >
                    <div className="p-2 bg-[#1B1A17] text-emerald-400 rounded-xl">
                      <Zap size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#8E8B83]">Швидкість відповіді</div>
                      <div className="text-xs font-bold text-[#ECE8E1]">~{(averageResponseTimeMs / 1000).toFixed(2)}с середня</div>
                    </div>
                  </div>

                  <div 
                    onClick={() => { setModalSearch(''); setModalUserPage(1); setDrillModal('all_users'); }}
                    className="flex items-center gap-2.5 p-2 rounded-2xl hover:bg-[#1F1E1B] cursor-pointer transition-colors"
                  >
                    <div className="p-2 bg-[#1B1A17] text-indigo-400 rounded-xl">
                      <Users size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#8E8B83]">База користувачів</div>
                      <div className="text-xs font-bold text-[#ECE8E1]">{users.length} зареєстровано</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Provider Usage Distribution & Real Recent Activities */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                
                {/* Clickable Provider Breakdown */}
                <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-[#ECE8E1] flex items-center gap-2">
                        <Building2 size={16} className="text-[#CC785C]" />
                        <span>Розподіл за провайдерами</span>
                      </h3>
                      <button 
                        onClick={() => setActiveTab('providers')}
                        className="text-xs text-[#CC785C] hover:underline font-semibold flex items-center gap-1"
                      >
                        Керування ({providers.length}) <ChevronRight size={14} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {providers.map((p) => {
                        const provModels = models.filter(m => m.providerId === p.id);
                        const provQueries = queries.filter(q => provModels.some(m => m.apiModelId === q.modelId));
                        const pct = totalQueriesCount > 0 ? Math.round((provQueries.length / totalQueriesCount) * 100) : Math.round(100 / Math.max(providers.length, 1));
                        const hex = resolveColorToHex(p.color);

                        return (
                          <div 
                            key={p.id}
                            onClick={() => {
                              setSelectedProviderDetail(p);
                              setDrillModal('provider_detail');
                            }}
                            className="p-2.5 rounded-2xl hover:bg-[#1F1E1B] cursor-pointer transition-colors group"
                            title="Натисніть для перегляду статистики провайдера"
                          >
                            <div className="flex justify-between items-center text-xs mb-1.5">
                              <span className="font-semibold text-[#ECE8E1] flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hex }} />
                                {p.name}
                                <ArrowUpRight size={12} className="text-[#CC785C] opacity-0 group-hover:opacity-100 transition-opacity" />
                              </span>
                              <span className="text-[#8E8B83] font-mono">
                                {provModels.length} мод. • {provQueries.length} запитів ({pct}%)
                              </span>
                            </div>
                            <div className="w-full bg-[#1B1A17] h-2 rounded-full overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all duration-500" 
                                style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: hex }} 
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-[#302E2A] flex justify-between items-center text-xs text-[#8E8B83]">
                    <span>Активних постачальників:</span>
                    <span className="font-bold text-[#FAF8F5]">
                      {providers.length} підключено
                    </span>
                  </div>
                </div>

                {/* Real-time Activities Log */}
                <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-[#ECE8E1] flex items-center gap-2">
                        <Activity size={16} className="text-[#CC785C]" />
                        <span>Журнал активності (Realtime)</span>
                      </h3>
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Live
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {activities.length > 0 ? (
                        activities.slice(0, 5).map((act, i) => (
                          <div 
                            key={i} 
                            className="flex items-start gap-3 p-2.5 rounded-xl bg-[#1B1A17] border border-[#2E2C28] text-xs hover:border-[#3D3A34] transition-colors"
                          >
                            <div className="p-1.5 rounded-lg bg-[#2B2925] text-[#CC785C] shrink-0 mt-0.5">
                              {act.type === 'query' ? <Zap size={13} /> : <Sparkles size={13} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-[#ECE8E1] truncate">{act.description}</div>
                              <div className="text-[10px] text-[#7E7B74] mt-0.5 flex items-center gap-2">
                                <span className="text-[#A09D95] font-semibold">{act.user || 'Користувач'}</span>
                                <span>•</span>
                                <span>{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-xs text-[#8E8B83]">
                          Очікуємо перших запитів... Запустіть чат і надішліть повідомлення для появи реальних логів!
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#302E2A] flex justify-between items-center text-xs">
                    <span className="text-[#8E8B83]">Всього записів у лозі:</span>
                    <span className="text-emerald-400 font-semibold font-mono">
                      {activities.length} подій
                    </span>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: PROVIDERS */}
          {activeTab === 'providers' && (
            <div className="space-y-6 animate-fadeIn">
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
                                    loadInitialStaticData(); 
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
                            <span 
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5 border border-white/10"
                              style={{ backgroundColor: `${provColor}25`, color: provColor }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: provColor }} />
                              {prov?.name || 'Провайдер'}
                            </span>

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
                                loadInitialStaticData(); 
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
                      Ключ адміністратора для вивантаження та синхронізації каталогу OpenRouter / AI Studio
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
                        setKeyStatusMessage({ type: 'success', text: 'Ключ збережено в локальному сховищі' });
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
                      <span>Завантажено моделей:</span>
                      <span className="font-mono text-[#ECE8E1]">{adminApiModels.length}</span>
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
                    <span>Безпека та конфіденційність</span>
                  </h3>
                  <p className="text-xs text-[#8E8B83] leading-relaxed">
                    Ключі користувачів зберігаються виключно в безпечному локальному сховищі браузера (BYOK). Запити та статистика автоматично надсилаються у Firebase для контролю якості та аналітики.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: USERS (With Avatars, Delete, Block, Copy, and Numbered Pagination) */}
          {activeTab === 'users' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#242320] p-5 rounded-3xl border border-[#363430]">
                <div>
                  <h2 className="text-lg font-bold text-[#ECE8E1] flex items-center gap-2">
                    <Users size={20} className="text-[#CC785C]" />
                    <span>Користувачі ({users.length})</span>
                  </h2>
                  <p className="text-xs text-[#8E8B83] mt-0.5">
                    Керування доступом: блокування, видалення, копіювання контактів та швидка пагінація
                  </p>
                </div>

                {/* Per Page Selector */}
                <div className="flex items-center gap-2 self-start sm:self-auto text-xs bg-[#1B1A17] p-1 rounded-xl border border-[#35332F]">
                  <span className="text-[#8E8B83] px-2">Показувати по:</span>
                  <button
                    onClick={() => setPageSize(5)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      pageSize === 5 ? 'bg-[#CC785C] text-white shadow-xs' : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                    }`}
                  >
                    5
                  </button>
                  <button
                    onClick={() => setPageSize(10)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      pageSize === 10 ? 'bg-[#CC785C] text-white shadow-xs' : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                    }`}
                  >
                    10
                  </button>
                </div>
              </div>

              {/* Search Bar */}
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

              {/* Users List with Real Avatars, Actions & Copy */}
              <div className="space-y-3">
                {paginatedUsers.length > 0 ? (
                  paginatedUsers.map(u => {
                    const isAdminUser = u.telegramId === 1365018137;
                    const isOnline = u.lastActive && (now - new Date(u.lastActive).getTime() <= fifteenMinMs);
                    const copyIdKey = `id_${u.id}`;
                    const copyUserKey = `user_${u.id}`;

                    return (
                      <div 
                        key={u.id}
                        className={`p-4 sm:p-5 rounded-3xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          u.isBlocked 
                            ? 'bg-[#291F1E] border-red-900/40' 
                            : 'bg-[#242320] border-[#363430] hover:border-[#4B4842]'
                        }`}
                      >
                        {/* User Identity Info */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          {/* Real Telegram Avatar or Fallback Letter */}
                          <div className="relative shrink-0">
                            {u.photoUrl ? (
                              <img 
                                src={u.photoUrl} 
                                alt={u.firstName || 'User'} 
                                className="w-12 h-12 rounded-2xl object-cover border border-[#44413C] shadow-sm"
                                onError={(e) => {
                                  // Fallback if image fails to load
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : null}
                            {!u.photoUrl && (
                              <div className="w-12 h-12 rounded-2xl bg-[#CC785C] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                                {u.firstName ? u.firstName.charAt(0).toUpperCase() : 'U'}
                              </div>
                            )}

                            {/* Status Indicator Dot */}
                            {isOnline ? (
                              <span 
                                className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#242320] shadow-sm"
                                title="Онлайн зараз" 
                              />
                            ) : u.isBlocked ? (
                              <span 
                                className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-[#242320] shadow-sm"
                                title="Заблоковано" 
                              />
                            ) : null}
                          </div>

                          {/* Text info and copy buttons */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Clickable Full Name to Copy */}
                              <button
                                onClick={() => handleCopyText(`${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Користувач', `name_${u.id}`)}
                                className="font-bold text-[#ECE8E1] text-base hover:text-[#CC785C] transition-colors truncate flex items-center gap-1.5 group"
                                title="Натисніть щоб скопіювати ім'я"
                              >
                                <span>{u.firstName} {u.lastName}</span>
                                {copiedKey === `name_${u.id}` ? (
                                  <Check size={14} className="text-emerald-400" />
                                ) : (
                                  <Copy size={13} className="text-[#7E7B74] opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                              </button>

                              {isAdminUser && (
                                <span className="text-[10px] bg-[#3B2820] text-[#CC785C] font-semibold px-2 py-0.5 rounded-full border border-[#5A382A]">
                                  Admin
                                </span>
                              )}

                              {u.isBlocked ? (
                                <span className="text-[10px] bg-red-950/60 text-red-300 font-semibold px-2.5 py-0.5 rounded-full border border-red-800/60 flex items-center gap-1">
                                  <Ban size={10} />
                                  <span>Заблоковано</span>
                                </span>
                              ) : isOnline ? (
                                <span className="text-[10px] bg-emerald-950/40 text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-800/40">
                                  Онлайн
                                </span>
                              ) : null}
                            </div>

                            {/* Username & Telegram ID with One-click Copy */}
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs font-mono text-[#8E8B83]">
                              {u.username && (
                                <button
                                  onClick={() => handleCopyText(`@${u.username}`, copyUserKey)}
                                  className="hover:text-[#ECE8E1] hover:bg-[#1B1A17] px-1.5 py-0.5 rounded-md border border-transparent hover:border-[#35332F] transition-all flex items-center gap-1"
                                  title="Скопіювати юзернейм"
                                >
                                  <span>@{u.username}</span>
                                  {copiedKey === copyUserKey ? <Check size={12} className="text-emerald-400" /> : <Copy size={11} className="text-[#6E6B64]" />}
                                </button>
                              )}

                              <button
                                onClick={() => handleCopyText(String(u.telegramId || u.id), copyIdKey)}
                                className="hover:text-[#ECE8E1] hover:bg-[#1B1A17] px-1.5 py-0.5 rounded-md border border-transparent hover:border-[#35332F] transition-all flex items-center gap-1"
                                title="Скопіювати ID"
                              >
                                <span>ID: {u.telegramId || u.id}</span>
                                {copiedKey === copyIdKey ? <Check size={12} className="text-emerald-400" /> : <Copy size={11} className="text-[#6E6B64]" />}
                              </button>

                              <span>•</span>
                              <span className="text-[#6E6B64] capitalize">{u.platform || 'telegram'}</span>
                              <span>•</span>
                              <span className="text-[#C5C2BA]">{u.totalQueries || 0} запитів</span>
                            </div>

                            {u.isBlocked && u.blockedReason && (
                              <div className="text-[11px] text-red-300 mt-1 italic">
                                Причина: {u.blockedReason}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons: Block/Unblock & Delete */}
                        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                          
                          {/* Block/Unblock Button */}
                          {!isAdminUser && (
                            <button
                              onClick={() => handleToggleBlock(u)}
                              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 border ${
                                u.isBlocked
                                  ? 'bg-[#1F2E24] hover:bg-[#273B2E] text-emerald-300 border-emerald-800/40'
                                  : 'bg-[#2E1E1C] hover:bg-[#3B2522] text-red-300 border-red-900/40'
                              }`}
                              title={u.isBlocked ? 'Розблокувати доступ' : 'Заблокувати доступ'}
                            >
                              {u.isBlocked ? (
                                <>
                                  <Unlock size={14} className="text-emerald-400" />
                                  <span>Розблокувати</span>
                                </>
                              ) : (
                                <>
                                  <Ban size={14} className="text-red-400" />
                                  <span>Заблокувати</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Delete from DB Button */}
                          {!isAdminUser && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-2 text-[#8E8B83] hover:text-red-400 hover:bg-red-950/20 rounded-xl border border-transparent hover:border-red-900/30 transition-colors"
                              title="Видалити з бази"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}

                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-xs text-[#8E8B83] bg-[#242320] rounded-3xl border border-[#363430]">
                    Користувачів не знайдено за заданим фільтром.
                  </div>
                )}
              </div>

              {/* Numbered Pagination Controls */}
              {totalUserPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#302E2A]">
                  <div className="text-xs text-[#8E8B83]">
                    Показано <strong className="text-[#ECE8E1]">{(safeUserPage - 1) * pageSize + 1}</strong>–<strong className="text-[#ECE8E1]">{Math.min(safeUserPage * pageSize, filteredUsers.length)}</strong> із <strong className="text-[#ECE8E1]">{filteredUsers.length}</strong> користувачів
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    {/* First & Prev */}
                    <button
                      onClick={() => setUserPage(1)}
                      disabled={safeUserPage === 1}
                      className="p-1.5 rounded-lg text-xs bg-[#1F1E1B] border border-[#35332F] text-[#8E8B83] hover:text-[#ECE8E1] disabled:opacity-40 transition-colors"
                      title="Перша сторінка"
                    >
                      <ChevronsLeft size={16} />
                    </button>
                    <button
                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                      disabled={safeUserPage === 1}
                      className="p-1.5 rounded-lg text-xs bg-[#1F1E1B] border border-[#35332F] text-[#8E8B83] hover:text-[#ECE8E1] disabled:opacity-40 transition-colors"
                      title="Попередня"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    {/* Numbered Page Buttons: 1, 2, 3, 4, 5... */}
                    {getPaginationRange(safeUserPage, totalUserPages).map((item, idx) => {
                      if (item === '...') {
                        return <span key={idx} className="px-1.5 text-xs text-[#6E6B64]">...</span>;
                      }
                      const pageNum = Number(item);
                      const isCur = pageNum === safeUserPage;
                      return (
                        <button
                          key={idx}
                          onClick={() => setUserPage(pageNum)}
                          className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition-all ${
                            isCur 
                              ? 'bg-[#CC785C] text-white shadow-xs' 
                              : 'bg-[#1F1E1B] border border-[#35332F] text-[#8E8B83] hover:text-[#ECE8E1] hover:border-[#4B4842]'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {/* Next & Last */}
                    <button
                      onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                      disabled={safeUserPage === totalUserPages}
                      className="p-1.5 rounded-lg text-xs bg-[#1F1E1B] border border-[#35332F] text-[#8E8B83] hover:text-[#ECE8E1] disabled:opacity-40 transition-colors"
                      title="Наступна"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => setUserPage(totalUserPages)}
                      disabled={safeUserPage === totalUserPages}
                      className="p-1.5 rounded-lg text-xs bg-[#1F1E1B] border border-[#35332F] text-[#8E8B83] hover:text-[#ECE8E1] disabled:opacity-40 transition-colors"
                      title="Остання сторінка"
                    >
                      <ChevronsRight size={16} />
                    </button>

                    {/* Direct Page Jump Input */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const p = parseInt(jumpPageInput);
                        if (!isNaN(p) && p >= 1 && p <= totalUserPages) {
                          setUserPage(p);
                          setJumpPageInput('');
                        }
                      }}
                      className="flex items-center gap-1 ml-2"
                    >
                      <input 
                        type="number"
                        min="1"
                        max={totalUserPages}
                        value={jumpPageInput}
                        onChange={(e) => setJumpPageInput(e.target.value)}
                        placeholder="Стор."
                        className="w-14 px-2 py-1 bg-[#1B1A17] border border-[#35332F] rounded-lg text-xs text-center text-[#ECE8E1] focus:outline-none focus:border-[#CC785C]"
                      />
                      <button
                        type="submit"
                        className="px-2 py-1 bg-[#2D2B27] hover:bg-[#383631] text-[#ECE8E1] rounded-lg text-xs font-medium border border-[#383632] transition-colors"
                      >
                        Перейти
                      </button>
                    </form>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TOPUPS & COUPONS TAB */}
          {activeTab === 'topups' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header & Stats Banner */}
              <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard size={20} className="text-[#CC785C]" />
                    <h2 className="text-lg font-bold text-[#FAF8F5]">Заявки на поповнення & Купони</h2>
                  </div>
                  <p className="text-xs text-[#8E8B83] mt-1">
                    Перевіряйте квитанції користувачів та видавайте їм персональні коди купонів
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="px-3 py-1.5 rounded-2xl bg-[#1B1A17] border border-[#35332F] text-center">
                    <div className="text-[10px] text-[#8E8B83] font-medium">Очікують</div>
                    <div className={`text-sm font-bold ${pendingTopupsCount > 0 ? 'text-amber-400 font-extrabold' : 'text-[#ECE8E1]'}`}>
                      {pendingTopupsCount}
                    </div>
                  </div>

                  <div className="px-3 py-1.5 rounded-2xl bg-[#1B1A17] border border-[#35332F] text-center">
                    <div className="text-[10px] text-[#8E8B83] font-medium">Підтверджено</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {topups.filter(t => t.status === 'completed').length}
                    </div>
                  </div>

                  <div className="px-3 py-1.5 rounded-2xl bg-[#1B1A17] border border-[#35332F] text-center">
                    <div className="text-[10px] text-[#8E8B83] font-medium">Всього</div>
                    <div className="text-sm font-bold text-[#FAF8F5]">
                      {topups.length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Payment Card Settings Box (Admin can change card number anytime) */}
              <div className="bg-[#242320] p-5 rounded-3xl border border-[#3D352E] shadow-sm relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#36271D] text-[#CC785C] border border-[#523A2A] flex items-center justify-center shrink-0 shadow-xs">
                      <CreditCard size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-[#FAF8F5]">Реквізити банківської картки</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 font-semibold border border-emerald-800/40">
                          Активні для користувачів
                        </span>
                      </div>
                      <p className="text-xs text-[#8E8B83] mt-0.5">
                        Усі користувачі бачать цей номер у вікні «Поповнити баланс» при здійсненні переказу
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsEditingPaymentSettings(!isEditingPaymentSettings);
                      setCardFormNumber(paymentSettings.cardNumber);
                      setCardFormBank(paymentSettings.bankName || '');
                      setCardFormRecipient(paymentSettings.recipientName || '');
                      setCardFormNote(paymentSettings.note || '');
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#CC785C] hover:bg-[#D97757] text-white rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-sm shrink-0"
                  >
                    <Edit3 size={15} />
                    <span>{isEditingPaymentSettings ? 'Приховати форму' : 'Змінити номер картки'}</span>
                  </button>
                </div>

                {/* Current Active Info Cards */}
                <div className="mt-4 pt-4 border-t border-[#33302B] grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#1C1A17] p-3 rounded-2xl border border-[#35322D]">
                    <div className="text-[10px] uppercase font-semibold text-[#8E8B83] tracking-wider mb-1">Номер картки</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm sm:text-base font-bold text-[#FAF8F5] tracking-wider truncate">
                        {paymentSettings.cardNumber}
                      </span>
                      <button
                        onClick={() => handleCopyText(paymentSettings.cardNumber.replace(/\s+/g, ''), 'admin_card')}
                        className="text-[#8E8B83] hover:text-[#ECE8E1] p-1 transition-colors"
                        title="Скопіювати номер картки"
                      >
                        {copiedKey === 'admin_card' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#1C1A17] p-3 rounded-2xl border border-[#35322D]">
                    <div className="text-[10px] uppercase font-semibold text-[#8E8B83] tracking-wider mb-1">Банк & Отримувач</div>
                    <div className="text-xs font-medium text-[#ECE8E1] truncate">
                      {paymentSettings.bankName || 'Банк'} • {paymentSettings.recipientName || 'Адміністратор'}
                    </div>
                  </div>

                  <div className="bg-[#1C1A17] p-3 rounded-2xl border border-[#35322D]">
                    <div className="text-[10px] uppercase font-semibold text-[#8E8B83] tracking-wider mb-1">Статус налаштувань</div>
                    <div className="text-xs text-[#8E8B83] truncate">
                      {paymentSettings.updatedAt 
                        ? `Оновлено ${new Date(paymentSettings.updatedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}`
                        : 'За замовчуванням'} ({paymentSettings.updatedBy || 'Admin'})
                    </div>
                  </div>
                </div>

                {cardSaveSuccess && (
                  <div className="mt-3 p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-2xl text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 size={16} />
                    <span>Реквізити картки успішно збережено в базі! Тепер усі користувачі бачать новий номер.</span>
                  </div>
                )}

                {/* Inline Edit Form */}
                {isEditingPaymentSettings && (
                  <form onSubmit={handleSaveCardSettings} className="mt-4 pt-4 border-t border-[#38332C] space-y-3.5 bg-[#1C1A17] p-4 rounded-2xl border border-[#483B30] animate-in zoom-in-95">
                    <div className="text-xs font-bold text-[#FAF8F5] flex items-center gap-2">
                      <Edit3 size={14} className="text-[#CC785C]" />
                      <span>Редагування реквізитів для прийому платежів</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#9E9A92] uppercase tracking-wider mb-1">
                          Номер банківської картки *
                        </label>
                        <input
                          type="text"
                          required
                          value={cardFormNumber}
                          onChange={(e) => setCardFormNumber(e.target.value)}
                          placeholder="4441 1144 5555 8888"
                          className="w-full px-3 py-2 bg-[#252320] border border-[#3E3C37] rounded-xl text-sm font-mono text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#9E9A92] uppercase tracking-wider mb-1">
                          Назва банку
                        </label>
                        <input
                          type="text"
                          value={cardFormBank}
                          onChange={(e) => setCardFormBank(e.target.value)}
                          placeholder="Monobank / ПриватБанк / Sense..."
                          className="w-full px-3 py-2 bg-[#252320] border border-[#3E3C37] rounded-xl text-sm text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#9E9A92] uppercase tracking-wider mb-1">
                          Отримувач (ПІБ або назва)
                        </label>
                        <input
                          type="text"
                          value={cardFormRecipient}
                          onChange={(e) => setCardFormRecipient(e.target.value)}
                          placeholder="ФОП / ПІБ отримувача"
                          className="w-full px-3 py-2 bg-[#252320] border border-[#3E3C37] rounded-xl text-sm text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#9E9A92] uppercase tracking-wider mb-1">
                          Підказка для призначення або коментаря
                        </label>
                        <input
                          type="text"
                          value={cardFormNote}
                          onChange={(e) => setCardFormNote(e.target.value)}
                          placeholder="Вказуйте ваш нік або надсилайте чек"
                          className="w-full px-3 py-2 bg-[#252320] border border-[#3E3C37] rounded-xl text-sm text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingPaymentSettings(false)}
                        className="px-4 py-2 bg-[#292723] hover:bg-[#32302B] text-xs font-semibold rounded-xl text-[#9E9A92] transition-colors"
                      >
                        Скасувати
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingCard}
                        className="px-5 py-2 bg-[#CC785C] hover:bg-[#D97757] text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
                      >
                        {isSavingCard ? 'Збереження...' : 'Зберегти нові реквізити'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Filters & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="inline-flex bg-[#1F1E1B] p-1 rounded-2xl border border-[#33312D] overflow-x-auto">
                  <button
                    onClick={() => setTopupFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      topupFilter === 'all' 
                        ? 'bg-[#CC785C] text-white shadow-xs' 
                        : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                    }`}
                  >
                    Всі ({topups.length})
                  </button>
                  <button
                    onClick={() => setTopupFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      topupFilter === 'pending' 
                        ? 'bg-[#CC785C] text-white shadow-xs' 
                        : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                    }`}
                  >
                    <span>Очікують</span>
                    {pendingTopupsCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    )}
                    <span className="text-[11px] font-mono">({pendingTopupsCount})</span>
                  </button>
                  <button
                    onClick={() => setTopupFilter('completed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      topupFilter === 'completed' 
                        ? 'bg-[#CC785C] text-white shadow-xs' 
                        : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                    }`}
                  >
                    Підтверджені ({topups.filter(t => t.status === 'completed').length})
                  </button>
                  <button
                    onClick={() => setTopupFilter('rejected')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      topupFilter === 'rejected' 
                        ? 'bg-[#CC785C] text-white shadow-xs' 
                        : 'text-[#8E8B83] hover:text-[#ECE8E1]'
                    }`}
                  >
                    Відхилені ({topups.filter(t => t.status === 'rejected').length})
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#76736C]" />
                  <input
                    type="text"
                    value={topupSearch}
                    onChange={(e) => setTopupSearch(e.target.value)}
                    placeholder="Пошук за користувачем..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#242320] border border-[#383632] text-xs text-[#ECE8E1] placeholder-[#76736C] focus:outline-none focus:border-[#CC785C] transition-colors"
                  />
                </div>
              </div>

              {/* Requests List */}
              {(() => {
                const filtered = topups.filter(t => {
                  const matchStatus = topupFilter === 'all' || t.status === topupFilter;
                  const matchSearch = !topupSearch.trim() || 
                    t.userName?.toLowerCase().includes(topupSearch.toLowerCase()) ||
                    t.userUsername?.toLowerCase().includes(topupSearch.toLowerCase()) ||
                    String(t.telegramId || '').includes(topupSearch) ||
                    String(t.amount || '').includes(topupSearch);
                  return matchStatus && matchSearch;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center bg-[#242320] border border-[#363430] rounded-3xl text-[#8E8B83]">
                      <div className="w-12 h-12 rounded-2xl bg-[#2D2820] text-[#CC785C] flex items-center justify-center mx-auto mb-3">
                        <CreditCard size={24} />
                      </div>
                      <p className="font-semibold text-sm text-[#FAF8F5]">Заявок не знайдено</p>
                      <p className="text-xs text-[#76736C] mt-1">
                        {topupFilter === 'pending' ? 'Всі заявки на поповнення вже опрацьовано' : 'Користувачі ще не надсилали заявок на поповнення'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {filtered.map(req => {
                      const userNick = req.userUsername ? `@${req.userUsername}` : req.userName;
                      const copyId = `user_${req.id}`;
                      const isCopied = copiedKey === copyId;

                      return (
                        <div 
                          key={req.id}
                          className={`bg-[#242320] border rounded-3xl p-5 space-y-4 transition-all shadow-xs ${
                            req.status === 'pending'
                              ? 'border-amber-500/40 hover:border-amber-500/70 bg-gradient-to-r from-[#242320] to-[#26221B]'
                              : req.status === 'completed'
                              ? 'border-[#363430] hover:border-emerald-500/40'
                              : 'border-[#363430] opacity-80'
                          }`}
                        >
                          {/* Top Row: User details & Amount */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {req.userPhotoUrl ? (
                                <img 
                                  src={req.userPhotoUrl} 
                                  alt={req.userName} 
                                  className="w-12 h-12 rounded-2xl object-cover border border-[#44413C] shadow-sm shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-2xl bg-[#CC785C] text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                                  {req.userName.charAt(0).toUpperCase()}
                                </div>
                              )}

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-[#FAF8F5]">{req.userName}</span>
                                  {req.userUsername && (
                                    <span className="text-xs text-[#CC785C] font-mono">@{req.userUsername}</span>
                                  )}
                                  <button
                                    onClick={() => handleCopyText(userNick, copyId)}
                                    className="p-1 rounded-md text-[#8E8B83] hover:text-[#FAF8F5] hover:bg-[#34322D] transition-colors"
                                    title="Скопіювати нікнейм користувача"
                                  >
                                    {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                  </button>
                                </div>

                                <div className="text-[11px] text-[#7A7770] flex items-center gap-2 mt-0.5">
                                  <span>ID: {req.telegramId || req.userId}</span>
                                  <span>•</span>
                                  <span>{new Date(req.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                            </div>

                            {/* Amount & Status Badge */}
                            <div className="flex items-center gap-3 self-end sm:self-auto">
                              <div className="text-right">
                                <div className="text-lg sm:text-xl font-black text-emerald-400 font-mono tracking-tight">
                                  ₴{req.amount}
                                </div>
                                <div className="text-[10px] text-[#7A7770]">UAH Переказ</div>
                              </div>

                              <div>
                                {req.status === 'pending' && (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/70 text-amber-300 border border-amber-800/60 shadow-xs">
                                    <Clock size={12} className="animate-spin" />
                                    <span>Очікує звірки</span>
                                  </span>
                                )}
                                {req.status === 'completed' && (
                                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
                                    <CheckCircle size={12} />
                                    <span>Видано купон</span>
                                  </span>
                                )}
                                {req.status === 'rejected' && (
                                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-950/70 text-rose-300 border border-rose-800/60">
                                    <XCircle size={12} />
                                    <span>Відхилено</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Middle Row: Attached Receipt / Screenshot & Comment */}
                          <div className="p-3.5 bg-[#1B1A17] border border-[#33312D] rounded-2xl space-y-3">
                            {req.userComment && (
                              <div className="text-xs text-[#C8C4BC] flex items-start gap-2">
                                <span className="font-semibold text-[#8E8B83] shrink-0">Коментар користувача:</span>
                                <span>«{req.userComment}»</span>
                              </div>
                            )}

                            {/* Attachment viewer */}
                            {req.attachmentUrl && (
                              <div className="pt-2 border-t border-[#2C2A26] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {req.attachmentType?.startsWith('image/') || req.attachmentUrl.startsWith('data:image/') ? (
                                    <div 
                                      onClick={() => setPreviewAttachmentUrl(req.attachmentUrl!)}
                                      className="relative group/thumb cursor-pointer"
                                    >
                                      <img 
                                        src={req.attachmentUrl} 
                                        alt="Чек" 
                                        className="w-16 h-16 rounded-xl object-cover border border-[#44413C] group-hover/thumb:opacity-90 transition-opacity" 
                                      />
                                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity text-white text-[10px] font-bold">
                                        Збільшити
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-12 h-12 rounded-xl bg-[#282723] text-[#CC785C] flex items-center justify-center border border-[#3A3834]">
                                      <FileText size={22} />
                                    </div>
                                  )}

                                  <div>
                                    <div className="text-xs font-medium text-[#FAF8F5]">
                                      {req.attachmentName || 'Квитанція_переказу'}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewAttachmentUrl(req.attachmentUrl!)}
                                      className="text-[11px] text-[#CC785C] hover:underline flex items-center gap-1 mt-0.5"
                                    >
                                      <ExternalLink size={11} />
                                      <span>Відкрити чек на весь екран</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Completed Coupon Information */}
                          {req.status === 'completed' && req.adminCouponCode && (
                            <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <Gift size={16} className="text-emerald-400 shrink-0" />
                                <div>
                                  <span className="text-[#8E8B83]">Виданий купон: </span>
                                  <span className="font-mono font-bold text-emerald-300 tracking-wider">
                                    {req.adminCouponCode}
                                  </span>
                                  <span className="text-[#8E8B83] ml-2 font-semibold">({req.adminCouponAmount || req.amount} грн)</span>
                                </div>
                              </div>
                              {req.adminReplyMessage && (
                                <div className="text-[11px] text-[#A8A49C] truncate max-w-sm">
                                  «{req.adminReplyMessage}»
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action Buttons for Admin */}
                          <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
                            {req.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRejectTopup(req)}
                                  className="px-4 py-2 rounded-xl bg-[#2A2925] hover:bg-rose-950/50 text-xs font-semibold text-rose-300 border border-[#3E3C36] hover:border-rose-800/60 transition-colors"
                                >
                                  Відхилити заявку
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenReplyModal(req)}
                                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#CC785C] to-[#E08A6E] hover:from-[#D97757] hover:to-[#EB967A] text-xs font-bold text-white shadow-md transition-all active:scale-98 flex items-center gap-1.5"
                                >
                                  <Gift size={15} />
                                  <span>Відповісти & Надіслати купон</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenReplyModal(req)}
                                className="px-3 py-1.5 rounded-xl bg-[#292723] hover:bg-[#34322D] text-xs font-medium text-[#8E8B83] hover:text-[#FAF8F5] transition-colors"
                              >
                                Надіслати ще купон
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* -------------------------------------------------------------
              PRELOADER & VIDEO/GIF SPLASH TAB
              ------------------------------------------------------------- */}
          {activeTab === 'preloader' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Header Banner */}
              <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Film size={22} className="text-[#CC785C]" />
                    <h2 className="text-lg font-bold text-[#FAF8F5]">Прелоадер & Відео-заставка</h2>
                    {preloaderEnabled ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 font-semibold border border-emerald-800/50">
                        Увімкнено
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 font-semibold">
                        Вимкнено
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8E8B83] mt-1">
                    Керуйте святковими вертикальними відео (Pinterest / GIF), тривалістю показу та стильним хвильовим прелоадером
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAdminTestingPreloader(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2D2A26] hover:bg-[#383530] text-[#EDE9DF] rounded-xl text-xs font-semibold border border-[#444039] transition-all active:scale-95 shadow-xs"
                    title="Побачити прелоадер так, як його бачить користувач"
                  >
                    <Play size={14} className="text-[#CC785C]" />
                    <span>Тестовий перегляд</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetPreloaderVersion}
                    disabled={isSavingPreloader}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2B231D] hover:bg-[#3B2D23] text-amber-300 hover:text-amber-200 rounded-xl text-xs font-semibold border border-amber-800/50 transition-all active:scale-95 shadow-xs"
                    title="Скидає лічильник переглядів — усі користувачі побачать нове відео знову"
                  >
                    <RefreshCw size={14} className={isSavingPreloader ? 'animate-spin' : ''} />
                    <span>Показати всім знову</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSavePreloaderConfig()}
                    disabled={isSavingPreloader}
                    className="flex items-center gap-1.5 px-5 py-2 bg-[#CC785C] hover:bg-[#D97757] text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md disabled:opacity-50"
                  >
                    <Check size={15} />
                    <span>{isSavingPreloader ? 'Збереження...' : 'Зберегти'}</span>
                  </button>
                </div>
              </div>

              {/* Save Success Alert */}
              {preloaderSaveSuccess && (
                <div className="p-3.5 bg-emerald-950/70 border border-emerald-800/60 rounded-2xl text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={16} />
                  <span>Налаштування прелоадера успішно збережено в базі! Зміни активні для всіх користувачів.</span>
                </div>
              )}

              {/* CARD 1: PRIMARY MEDIA (VIDEO / GIF) */}
              <div className="bg-[#242320] p-5 sm:p-6 rounded-3xl border border-[#363430] space-y-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#33312D] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#36271D] text-[#CC785C] flex items-center justify-center">
                      <MonitorPlay size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#FAF8F5]">
                        Головна заставка (Перший показ або при зміні відео)
                      </h3>
                      <p className="text-xs text-[#8E8B83]">
                        Відтворюється користувачу при першому відкритті або коли ви ставите нове святкове відео
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-xs text-[#8E8B83]">Активна</span>
                    <input
                      type="checkbox"
                      checked={preloaderEnabled}
                      onChange={(e) => setPreloaderEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-[#CC785C] focus:ring-[#CC785C] bg-[#1C1A17] border-[#3E3C36]"
                    />
                  </label>
                </div>

                {/* Media Type Radios */}
                <div>
                  <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-2">
                    Тип медіа для заставки
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'video', label: 'Відео (Pinterest / MP4)', desc: 'Вертикальне або горизонтальне' },
                      { id: 'gif', label: 'GIF Анімація', desc: 'Рухоме зображення' },
                      { id: 'image', label: 'Фото / Банер', desc: 'Статичне зображення' },
                      { id: 'none', label: 'Без відео', desc: 'Лише швидка хвиля (3с)' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPreloaderMediaType(m.id as any)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          preloaderMediaType === m.id
                            ? 'bg-[#2E251E] border-[#CC785C] text-white shadow-xs ring-1 ring-[#CC785C]/40'
                            : 'bg-[#1C1A17] border-[#363430] text-[#9E9A92] hover:text-[#ECE8E1] hover:border-[#4A4742]'
                        }`}
                      >
                        <div className="font-semibold text-xs flex items-center justify-between">
                          <span>{m.label}</span>
                          {preloaderMediaType === m.id && <Check size={13} className="text-[#CC785C]" />}
                        </div>
                        <div className="text-[10px] text-[#7A7770] mt-0.5">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Media URL & Upload if not 'none' */}
                {preloaderMediaType !== 'none' && (
                  <div className="space-y-4 pt-1">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <label className="text-xs font-semibold text-[#9E9A92] uppercase tracking-wider flex items-center gap-1.5">
                          <span>Посилання на медіа (URL) *</span>
                          <span className="text-[10px] text-amber-400 font-normal normal-case bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800/40">
                            Підтримує Pinterest, pin.it, GIF, MP4
                          </span>
                        </label>

                        <label className="text-xs text-[#CC785C] hover:underline cursor-pointer flex items-center gap-1">
                          <Upload size={12} />
                          <span>Файл з пристрою (до 750 КБ)</span>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/*,image/gif,image/jpeg,image/png,image/webp"
                            onChange={handlePreloaderFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Input with embedded / attached Resolve Button */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={preloaderMediaUrl}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPreloaderMediaUrl(val);
                              // Auto-suggest resolution if Pinterest link pasted
                              if ((val.includes('pin.it/') || val.includes('pinterest.com/pin/')) && !val.includes('.mp4')) {
                                setMediaResolveFeedback({
                                  type: 'info',
                                  message: '📌 Виявлено посилання на Pinterest! Натисніть «Розпізнати Pinterest», щоб отримати пряме HD відео.'
                                });
                              }
                            }}
                            onPaste={(e) => {
                              const pasted = e.clipboardData.getData('text');
                              if (pasted && (pasted.includes('pin.it/') || pasted.includes('pinterest.com/pin/'))) {
                                // Auto-trigger resolution on paste
                                setTimeout(() => {
                                  handleResolveMediaUrl(pasted);
                                }, 80);
                              }
                            }}
                            placeholder="Вставте https://pin.it/... або пряме посилання на mp4/webm/gif"
                            className="w-full px-3.5 py-2.5 bg-[#1C1A17] border border-[#383632] rounded-xl text-sm font-mono text-[#FAF8F5] focus:outline-none focus:border-[#CC785C] placeholder:text-[#5E5B54]"
                          />
                          {preloaderMediaUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setPreloaderMediaUrl('');
                                setMediaResolveFeedback(null);
                              }}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7770] hover:text-[#ECE8E1] p-1"
                              title="Очистити"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleResolveMediaUrl()}
                          disabled={isResolvingMedia || !preloaderMediaUrl.trim()}
                          className="px-4 py-2.5 bg-[#CC785C] hover:bg-[#D97757] text-white rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 shadow-xs shrink-0"
                          title="Автоматично витягти прямий MP4 відео-потік із Pinterest"
                        >
                          <Sparkles size={14} className={isResolvingMedia ? 'animate-spin' : ''} />
                          <span>{isResolvingMedia ? 'Розпізнавання...' : 'Розпізнати Pinterest'}</span>
                        </button>
                      </div>

                      {/* Feedback Banner */}
                      {mediaResolveFeedback && (
                        <div className={`mt-2 p-2.5 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
                          mediaResolveFeedback.type === 'success'
                            ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
                            : mediaResolveFeedback.type === 'error'
                            ? 'bg-rose-950/70 border-rose-800/60 text-rose-300'
                            : 'bg-amber-950/70 border-amber-800/60 text-amber-300'
                        }`}>
                          {mediaResolveFeedback.type === 'success' && <CheckCircle2 size={15} className="shrink-0" />}
                          {mediaResolveFeedback.type === 'error' && <AlertCircle size={15} className="shrink-0" />}
                          {mediaResolveFeedback.type === 'info' && <Info size={15} className="shrink-0" />}
                          <span className="flex-1 leading-snug">{mediaResolveFeedback.message}</span>
                        </div>
                      )}

                      {/* Pinterest Quick Example Button */}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8E8B83]">
                        <div className="flex items-center gap-1.5">
                          <span>💡 Приклад посилання:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const exampleUrl = 'https://pin.it/4q6ov1wS0';
                              setPreloaderMediaUrl(exampleUrl);
                              handleResolveMediaUrl(exampleUrl);
                            }}
                            className="text-[#CC785C] hover:underline font-mono bg-[#252421] px-2 py-0.5 rounded-md border border-[#3A3834]"
                            title="Натисніть для перевірки прикладу з Pinterest"
                          >
                            https://pin.it/4q6ov1wS0
                          </button>
                        </div>

                        {preloaderMediaUrl && (
                          <span className="font-mono text-[10px] text-[#A8A49C]">
                            {preloaderMediaUrl.startsWith('data:') 
                              ? `Локальний файл (~${Math.round(preloaderMediaUrl.length / 1024)} КБ)` 
                              : preloaderMediaUrl.includes('pinimg.com')
                              ? '✓ Pinterest CDN (HD stream)'
                              : 'Зовнішнє посилання'
                            }
                          </span>
                        )}
                      </div>

                      <div className="mt-2 p-3 bg-[#1C1B18] rounded-2xl border border-[#35322D] text-[11px] text-[#A8A49C] leading-relaxed">
                        ✨ <strong className="text-white">Як працює підтримка Pinterest:</strong> просто скопіюйте посилання на відео з додатка Pinterest (наприклад <span className="font-mono text-amber-300">https://pin.it/...</span> або повний <span className="font-mono text-amber-300">pinterest.com/pin/...</span>) і вставте в поле вище. Застосунок сам знайде прямий HD потік відео <strong className="text-white">без необхідності шукати файл MP4 вручну</strong>, а завдяки розумному дзеркальному розмиттю вертикальні відео виглядають бездоганно без чорних смуг.
                      </div>
                    </div>

                    {/* Duration Controls */}
                    <div className="p-4 bg-[#1C1A17] border border-[#33312D] rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-[#FAF8F5] flex items-center gap-1.5">
                          <Clock size={14} className="text-[#CC785C]" />
                          <span>Тривалість заставки:</span>
                        </label>
                        <div className="flex items-center gap-1 text-sm font-bold text-amber-300 font-mono">
                          <span>{preloaderDuration}</span>
                          <span className="text-xs text-[#8E8B83]">сек.</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="3"
                          max="60"
                          step="1"
                          value={preloaderDuration}
                          onChange={(e) => setPreloaderDuration(Number(e.target.value))}
                          className="flex-1 accent-[#CC785C] cursor-pointer"
                        />
                        <input
                          type="number"
                          min="3"
                          max="120"
                          value={preloaderDuration}
                          onChange={(e) => setPreloaderDuration(Number(e.target.value))}
                          className="w-16 px-2 py-1 bg-[#252320] border border-[#3D3B36] rounded-lg text-xs font-mono text-center text-[#FAF8F5]"
                        />
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-[#7A7770]">Швидкий вибір:</span>
                        {[10, 15, 20, 30, 45, 60].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setPreloaderDuration(sec)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors ${
                              preloaderDuration === sec
                                ? 'bg-[#CC785C] text-white'
                                : 'bg-[#292723] text-[#8E8B83] hover:text-[#EDE9DF]'
                            }`}
                          >
                            {sec}с
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Thematic Greeting Titles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1">
                          Заголовок / Привітання
                        </label>
                        <input
                          type="text"
                          value={preloaderTitle}
                          onChange={(e) => setPreloaderTitle(e.target.value)}
                          placeholder="напр. Зі святом! або AI Studio"
                          className="w-full px-3 py-2 bg-[#1C1A17] border border-[#383632] rounded-xl text-sm text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1">
                          Підзаголовок
                        </label>
                        <input
                          type="text"
                          value={preloaderSubtext}
                          onChange={(e) => setPreloaderSubtext(e.target.value)}
                          placeholder="напр. Підключення нейромереж..."
                          className="w-full px-3 py-2 bg-[#1C1A17] border border-[#383632] rounded-xl text-sm text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                        />
                      </div>
                    </div>

                    {/* Allow Skip Checkbox */}
                    <div className="flex items-center justify-between p-3 bg-[#1C1A17] rounded-xl border border-[#33312D]">
                      <div>
                        <div className="text-xs font-semibold text-[#FAF8F5]">
                          Кнопка «Пропустити» (Skip)
                        </div>
                        <div className="text-[11px] text-[#8E8B83]">
                          Дозволяє користувачеві в будь-який момент натиснути «Пропустити» і перейти в застосунок
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={preloaderAllowSkip}
                        onChange={(e) => setPreloaderAllowSkip(e.target.checked)}
                        className="w-4 h-4 rounded text-[#CC785C] focus:ring-[#CC785C] bg-[#252320] border-[#3E3C36]"
                      />
                    </div>

                    {/* In-Panel Live Preview Box */}
                    {preloaderMediaUrl && (
                      <div className="space-y-1.5 pt-2">
                        <div className="text-xs font-semibold text-[#8E8B83] flex items-center gap-1.5">
                          <Eye size={13} className="text-[#CC785C]" />
                          <span>Попередній перегляд медіа (із дзеркальним розмиттям фону):</span>
                        </div>
                        <div className="relative h-64 sm:h-80 rounded-2xl overflow-hidden border border-[#3D3A34] bg-black flex items-center justify-center">
                          {preloaderMediaType === 'video' ? (
                            <>
                              <video
                                src={preloaderMediaUrl}
                                autoPlay
                                playsInline
                                muted
                                loop
                                className="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-40 pointer-events-none"
                              />
                              <video
                                src={preloaderMediaUrl}
                                autoPlay
                                playsInline
                                muted
                                loop
                                controls
                                className="relative z-10 w-full h-full object-contain max-h-full"
                              />
                            </>
                          ) : (
                            <>
                              <img
                                src={preloaderMediaUrl}
                                alt="Preview"
                                className="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-40 pointer-events-none"
                              />
                              <img
                                src={preloaderMediaUrl}
                                alt="Preview"
                                className="relative z-10 w-full h-full object-contain max-h-full"
                              />
                            </>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>

              {/* CARD 2: SECONDARY PRELOADER WITH STYLIZED HARMONIC WAVE */}
              <div className="bg-[#242320] p-5 sm:p-6 rounded-3xl border border-[#363430] space-y-5 shadow-sm">
                <div className="flex items-center gap-2.5 border-b border-[#33312D] pb-3">
                  <div className="w-8 h-8 rounded-xl bg-[#282E22] text-emerald-400 flex items-center justify-center">
                    <Waves size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FAF8F5]">
                      Вторинний прелоадер (Для тих, хто вже бачив відео)
                    </h3>
                    <p className="text-xs text-[#8E8B83]">
                      Показується користувачам при повторних відкриттях: швидка заставка (3 сек) зі стильною гармонійною хвилею
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Secondary settings */}
                  <div className="space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-[#9E9A92] uppercase tracking-wider">
                          Зображення або логотип
                        </label>
                        <label className="text-xs text-[#CC785C] hover:underline cursor-pointer flex items-center gap-1">
                          <Upload size={12} />
                          <span>Завантажити фото</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSecondaryImageUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        value={preloaderSecondaryImage}
                        onChange={(e) => setPreloaderSecondaryImage(e.target.value)}
                        placeholder="URL зображення (якщо пусто — фірмова зірка)"
                        className="w-full px-3 py-2 bg-[#1C1A17] border border-[#383632] rounded-xl text-xs text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-[#9E9A92] uppercase tracking-wider">
                          Тривалість вторинного показу: {preloaderSecondaryDuration} сек.
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="6"
                          step="0.5"
                          value={preloaderSecondaryDuration}
                          onChange={(e) => setPreloaderSecondaryDuration(Number(e.target.value))}
                          className="flex-1 accent-[#CC785C] cursor-pointer"
                        />
                        <div className="text-xs font-mono font-bold text-[#FAF8F5] w-10 text-right">
                          {preloaderSecondaryDuration}с
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#9E9A92] uppercase tracking-wider mb-1">
                        Текст під хвилею
                      </label>
                      <input
                        type="text"
                        value={preloaderSecondaryText}
                        onChange={(e) => setPreloaderSecondaryText(e.target.value)}
                        placeholder="Завантаження застосунку..."
                        className="w-full px-3 py-2 bg-[#1C1A17] border border-[#383632] rounded-xl text-xs text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                      />
                    </div>
                  </div>

                  {/* Interactive Wave Equalizer Demo */}
                  <div className="bg-[#1C1A17] border border-[#35322D] rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="text-[11px] font-semibold text-[#8E8B83] uppercase tracking-wider">
                      Жива стильна хвиля (Демо)
                    </div>

                    {/* Logo/Image Preview */}
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3D261B] to-[#1C1814] border border-[#5A382A] text-[#CC785C] flex items-center justify-center shadow-lg overflow-hidden">
                      {preloaderSecondaryImage ? (
                        <img src={preloaderSecondaryImage} alt="Logo" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Sparkles size={24} className="text-[#CC785C]" />
                      )}
                    </div>

                    {/* 9 Pulsating Harmonic Wave Bars */}
                    <div className="flex items-center justify-center gap-1.5 h-10 px-3 py-1.5 rounded-xl bg-[#24221E] border border-[#38342D]">
                      {[0, 0.15, 0.3, 0.45, 0.6, 0.45, 0.3, 0.15, 0].map((delay, idx) => {
                        const heights = [30, 50, 75, 95, 100, 90, 65, 45, 25];
                        return (
                          <div
                            key={idx}
                            className="w-1.5 rounded-full bg-gradient-to-t from-[#CC785C] via-amber-400 to-[#FAF8F5] animate-wave-bar"
                            style={{
                              height: `${heights[idx]}%`,
                              animationDelay: `${delay}s`,
                            }}
                          />
                        );
                      })}
                    </div>

                    <div className="text-[11px] text-[#A8A49C]">
                      «{preloaderSecondaryText || 'Завантаження застосунку...'}»
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 3: AUDIENCE & VERSION RESET */}
              <div className="bg-[#242320] p-5 rounded-3xl border border-[#363430] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <div className="text-xs uppercase font-bold text-[#8E8B83] tracking-wider mb-0.5">
                    Поточна версія відео-заставки
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-amber-300">
                      {preloaderSettings.versionId || 'v1_init'}
                    </span>
                    <span className="text-xs text-[#8E8B83]">
                      (Користувачі, які вже бачили цю версію, дивляться коротку хвилю)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetPreloaderVersion}
                  disabled={isSavingPreloader}
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-600/30 to-[#CC785C]/30 hover:from-amber-600/50 hover:to-[#CC785C]/50 text-amber-300 border border-amber-600/50 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm flex items-center justify-center gap-2 shrink-0"
                >
                  <RefreshCw size={14} className={isSavingPreloader ? 'animate-spin' : ''} />
                  <span>Показати нове відео всім знову</span>
                </button>
              </div>

            </div>
          )}

        </main>
      </div>

      {/* -------------------------------------------------------------
          DRILL-DOWN MODALS (Interactive Clickable Dashboard Categories)
          ------------------------------------------------------------- */}
      {drillModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-[#242320] text-[#ECE8E1] p-5 sm:p-6 rounded-3xl w-full max-w-2xl shadow-2xl border border-[#3A3834] max-h-[88vh] flex flex-col my-auto">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-[#33312D] pb-3 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#FAF8F5] flex items-center gap-2">
                  {drillModal === 'all_users' && <><Users size={18} className="text-[#CC785C]" /> <span>Всі зареєстровані користувачі ({users.length})</span></>}
                  {drillModal === 'active_today' && <><UserCheck size={18} className="text-emerald-400" /> <span>Активні користувачі за останні 24 години ({active24hUsers.length})</span></>}
                  {drillModal === 'queries_detail' && <><Zap size={18} className="text-indigo-400" /> <span>Детальна статистика та журнал запитів ({totalQueriesCount})</span></>}
                  {drillModal === 'models_overview' && <><Cpu size={18} className="text-amber-400" /> <span>Огляд моделей та RPG тарифів ({models.length})</span></>}
                  {drillModal === 'chart_point' && <><BarChart3 size={18} className="text-[#CC785C]" /> <span>Події за період: {selectedChartPoint?.label}</span></>}
                  {drillModal === 'provider_detail' && <><Building2 size={18} className="text-[#CC785C]" /> <span>Статистика провайдера: {selectedProviderDetail?.name}</span></>}
                </h3>
                <p className="text-xs text-[#8E8B83] mt-0.5">
                  Розгорнута аналітика та записи з бази даних у реальному часі
                </p>
              </div>
              <button 
                onClick={() => setDrillModal(null)} 
                className="p-1.5 text-[#8E8B83] hover:text-[#ECE8E1] hover:bg-[#302E2A] rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              
              {/* MODAL 1: ALL USERS (With Avatars, Delete, Block, Copy, and Numbered Pagination) */}
              {drillModal === 'all_users' && (() => {
                const modalFiltered = users.filter(u => 
                  `${u.firstName || ''} ${u.username || ''} ${u.telegramId || ''}`.toLowerCase().includes(modalSearch.toLowerCase())
                );
                const modalTotalPages = Math.max(1, Math.ceil(modalFiltered.length / modalPageSize));
                const safeModalPage = Math.min(Math.max(1, modalUserPage), modalTotalPages);
                const modalSlice = modalFiltered.slice((safeModalPage - 1) * modalPageSize, safeModalPage * modalPageSize);

                return (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E7B74]" />
                        <input 
                          type="text"
                          placeholder="Фільтр за ім'ям, ID або нікнеймом..."
                          value={modalSearch}
                          onChange={e => { setModalSearch(e.target.value); setModalUserPage(1); }}
                          className="w-full pl-9 pr-4 py-2 bg-[#1B1A17] border border-[#35332F] rounded-xl text-xs text-[#ECE8E1] focus:outline-none focus:border-[#CC785C]"
                        />
                      </div>
                      <div className="flex items-center gap-1 text-xs bg-[#1B1A17] px-2 rounded-xl border border-[#35332F]">
                        <button
                          onClick={() => setModalPageSize(5)}
                          className={`px-2 py-1 rounded-lg ${modalPageSize === 5 ? 'bg-[#CC785C] text-white font-bold' : 'text-[#8E8B83]'}`}
                        >
                          5
                        </button>
                        <button
                          onClick={() => setModalPageSize(10)}
                          className={`px-2 py-1 rounded-lg ${modalPageSize === 10 ? 'bg-[#CC785C] text-white font-bold' : 'text-[#8E8B83]'}`}
                        >
                          10
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {modalSlice.map(u => {
                        const isAdminUser = u.telegramId === 1365018137;
                        return (
                          <div key={u.id} className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-2xl flex items-center justify-between text-xs gap-3">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {u.photoUrl ? (
                                <img src={u.photoUrl} alt={u.firstName || 'User'} className="w-9 h-9 rounded-xl object-cover shrink-0" />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-[#CC785C] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                  {u.firstName ? u.firstName.charAt(0) : 'U'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-[#ECE8E1] truncate flex items-center gap-1.5">
                                  <span>{u.firstName} {u.lastName}</span>
                                  {u.isBlocked && <span className="text-[9px] text-red-400 bg-red-950/40 px-1.5 py-0.2 rounded border border-red-800/40">Заблоковано</span>}
                                </div>
                                <div className="text-[10px] text-[#8E8B83] font-mono flex items-center gap-2">
                                  <span>{u.username ? `@${u.username}` : `ID: ${u.telegramId || u.id}`}</span>
                                  <span>•</span>
                                  <span>{u.totalQueries || 0} зап.</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleCopyText(`@${u.username || u.telegramId || u.id}`, `modal_copy_${u.id}`)}
                                className="p-1.5 text-[#8E8B83] hover:text-[#ECE8E1] hover:bg-[#252421] rounded-lg transition-colors"
                                title="Скопіювати"
                              >
                                {copiedKey === `modal_copy_${u.id}` ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                              </button>

                              {!isAdminUser && (
                                <button
                                  onClick={() => handleToggleBlock(u)}
                                  className={`p-1.5 rounded-lg text-xs font-semibold ${
                                    u.isBlocked ? 'text-emerald-400 hover:bg-emerald-950/30' : 'text-red-400 hover:bg-red-950/30'
                                  }`}
                                  title={u.isBlocked ? 'Розблокувати' : 'Заблокувати'}
                                >
                                  {u.isBlocked ? <Unlock size={14} /> : <Ban size={14} />}
                                </button>
                              )}

                              {!isAdminUser && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 text-[#8E8B83] hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-colors"
                                  title="Видалити з бази"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {modalTotalPages > 1 && (
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-[#2E2C28]">
                        <span className="text-[#8E8B83]">Стор. {safeModalPage} з {modalTotalPages}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setModalUserPage(p => Math.max(1, p - 1))}
                            disabled={safeModalPage === 1}
                            className="px-2 py-1 bg-[#1B1A17] border border-[#35332F] rounded-lg disabled:opacity-40"
                          >
                            ‹
                          </button>
                          <button
                            onClick={() => setModalUserPage(p => Math.min(modalTotalPages, p + 1))}
                            disabled={safeModalPage === modalTotalPages}
                            className="px-2 py-1 bg-[#1B1A17] border border-[#35332F] rounded-lg disabled:opacity-40"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* MODAL 2: ACTIVE TODAY */}
              {drillModal === 'active_today' && (
                <div className="space-y-3">
                  <div className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-2xl flex items-center justify-between text-xs">
                    <span className="text-[#8E8B83]">Користувачів з активністю за 24г:</span>
                    <strong className="text-emerald-400 font-mono text-sm">{active24hUsers.length}</strong>
                  </div>

                  <div className="space-y-2">
                    {active24hUsers.map(u => (
                      <div key={u.id} className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          {u.photoUrl ? (
                            <img src={u.photoUrl} alt={u.firstName || 'User'} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#20362B] text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-700/30">
                              {u.firstName ? u.firstName.charAt(0) : 'A'}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-[#ECE8E1] flex items-center gap-1.5">
                              <span>{u.firstName} {u.lastName}</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            </div>
                            <div className="text-[10px] text-[#8E8B83] font-mono">
                              {u.username ? `@${u.username}` : `ID: ${u.telegramId || u.id}`} • {u.platform || 'telegram'}
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-[11px]">
                          <div className="text-emerald-400 font-semibold">{u.totalQueries || 0} зап. сьогодні</div>
                          <div className="text-[10px] text-[#7E7B74]">
                            {u.lastActive ? new Date(u.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MODAL 3: QUERIES DETAIL */}
              {drillModal === 'queries_detail' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-xl text-center">
                      <div className="text-[10px] text-[#8E8B83]">Всього запитів</div>
                      <div className="text-base font-bold text-[#ECE8E1]">{totalQueriesCount}</div>
                    </div>
                    <div className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-xl text-center">
                      <div className="text-[10px] text-[#8E8B83]">Середня швидкість</div>
                      <div className="text-base font-bold text-emerald-400">~{(averageResponseTimeMs / 1000).toFixed(1)}с</div>
                    </div>
                    <div className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-xl text-center">
                      <div className="text-[10px] text-[#8E8B83]">Успішність</div>
                      <div className="text-base font-bold text-indigo-400">{successRatePct}%</div>
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-[#8E8B83] mt-2">Останні запити в реальному часі:</div>

                  <div className="space-y-2">
                    {queries.slice(0, 15).map((q, idx) => (
                      <div key={idx} className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#ECE8E1] flex items-center gap-1.5">
                            <Zap size={13} className={q.status === 'success' ? 'text-emerald-400' : 'text-red-400'} />
                            <span>{q.modelId}</span>
                          </span>
                          <span className="text-[10px] font-mono text-[#8E8B83]">
                            {q.durationMs}мс • {new Date(q.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        {q.promptSnippet && (
                          <div className="text-[11px] text-[#A09D95] italic bg-[#242320] px-2 py-1 rounded-md">
                            «{q.promptSnippet}»
                          </div>
                        )}
                        <div className="flex justify-between items-center text-[10px] text-[#6E6B64] pt-0.5">
                          <span>Користувач: {q.userName}</span>
                          <span className={q.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                            {q.status === 'success' ? 'Успішно' : `Помилка: ${q.errorMessage || ''}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MODAL 4: MODELS OVERVIEW */}
              {drillModal === 'models_overview' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-xl">
                      <div className="text-[#8E8B83]">Провайдерів у базі:</div>
                      <div className="text-lg font-bold text-[#ECE8E1]">{providers.length}</div>
                    </div>
                    <div className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-xl">
                      <div className="text-[#8E8B83]">Всього моделей:</div>
                      <div className="text-lg font-bold text-amber-400">{models.length}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {models.map(m => {
                      const prov = providers.find(p => p.id === m.providerId);
                      const tierCls = getTierClasses(m.tier || 'common');
                      return (
                        <div key={m.id} className="p-3 bg-[#1B1A17] border border-[#2E2C28] rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-[#ECE8E1] flex items-center gap-2">
                              <span>{m.name}</span>
                              <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded border ${tierCls}`}>
                                {m.tier || 'Common'}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-[#8E8B83] mt-0.5">
                              {prov?.name || 'Провайдер'} • {m.apiModelId}
                            </div>
                          </div>
                          <div className="text-right text-[11px] font-mono text-[#C5C2BA]">
                            {m.shortPriceInfo || m.priceInfo}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MODAL 5: CHART POINT DETAIL */}
              {drillModal === 'chart_point' && selectedChartPoint && (
                <div className="space-y-3">
                  <div className="p-4 bg-[#1B1A17] border border-[#302E2A] rounded-2xl flex items-center justify-between text-xs">
                    <div>
                      <div className="text-[#8E8B83]">Часовий інтервал:</div>
                      <div className="text-sm font-bold text-[#FAF8F5]">{selectedChartPoint.label}</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-[#CC785C] font-bold text-sm">{selectedChartPoint.users} онлайн</div>
                      <div className="text-[#A09D95] text-[11px]">{selectedChartPoint.queries} запитів</div>
                    </div>
                  </div>

                  <div className="text-xs text-[#8E8B83]">
                    Показники зафіксовано на основі подій у базі Firestore за вибраний проміжок часу.
                  </div>
                </div>
              )}

              {/* MODAL 6: PROVIDER DETAIL */}
              {drillModal === 'provider_detail' && selectedProviderDetail && (
                <div className="space-y-3">
                  <div className="p-4 bg-[#1B1A17] border border-[#302E2A] rounded-2xl flex items-center gap-3">
                    <div 
                      style={{ backgroundColor: resolveColorToHex(selectedProviderDetail.color) }}
                      className="w-12 h-12 rounded-xl text-white flex items-center justify-center font-bold text-lg shrink-0 overflow-hidden"
                    >
                      {selectedProviderDetail.logoUrl ? (
                        <img src={selectedProviderDetail.logoUrl} alt={selectedProviderDetail.name} className="w-full h-full object-contain p-2" />
                      ) : (
                        <span>{selectedProviderDetail.name.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-[#ECE8E1]">{selectedProviderDetail.name}</h4>
                      <p className="text-xs text-[#8E8B83]">{selectedProviderDetail.description || 'Немає опису'}</p>
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-[#8E8B83]">Моделі цього провайдера:</div>
                  <div className="space-y-2">
                    {models.filter(m => m.providerId === selectedProviderDetail.id).map(m => (
                      <div key={m.id} className="p-2.5 bg-[#1B1A17] border border-[#2E2C28] rounded-xl text-xs flex justify-between items-center">
                        <span className="font-semibold text-[#ECE8E1]">{m.name}</span>
                        <span className="font-mono text-[#CC785C] text-[11px]">{m.apiModelId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="border-t border-[#33312D] pt-3 flex justify-end shrink-0">
              <button
                onClick={() => setDrillModal(null)}
                className="px-4 py-2 bg-[#2D2B27] hover:bg-[#383631] text-[#ECE8E1] rounded-xl text-xs font-semibold transition-colors"
              >
                Закрити
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Editor Modals */}
      {(isAddingProvider || editingProvider) && (
        <ProviderFormModal 
          provider={editingProvider} 
          onClose={() => { setIsAddingProvider(false); setEditingProvider(null); }}
          onSave={async (p: any) => {
            try {
              if (editingProvider) await updateProvider({ ...p, id: editingProvider.id });
              else await saveProvider(p);
              loadInitialStaticData();
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
              loadInitialStaticData();
              setIsAddingModel(false); setEditingModel(null);
            } catch (err: any) {
              alert('Помилка збереження моделі: ' + err.message);
              console.error(err);
            }
          }}
        />
      )}

      {/* Reply & Send Coupon Modal */}
      {selectedTopupForReply && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div 
            className="bg-[#242320] text-[#ECE8E1] p-5 sm:p-6 rounded-3xl w-full max-w-lg shadow-2xl border border-[#3E3C37] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#33312D] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <Gift size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#FAF8F5]">Видача купона користувачу</h3>
                  <p className="text-xs text-[#8E8B83]">
                    {selectedTopupForReply.userName} ({selectedTopupForReply.userUsername ? `@${selectedTopupForReply.userUsername}` : `ID: ${selectedTopupForReply.userId}`})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTopupForReply(null)}
                className="p-1.5 rounded-full hover:bg-[#34322D] text-[#8E8B83] hover:text-[#ECE8E1] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendCouponSubmit} className="space-y-4">
              {/* Payment Summary */}
              <div className="p-3 bg-[#1B1A17] border border-[#33312D] rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-[#8E8B83]">Заявлена сума переказу:</span>
                  <span className="font-bold text-emerald-400 ml-1.5 text-sm">₴{selectedTopupForReply.amount}</span>
                </div>
                <div className="text-[11px] text-[#7A7770]">
                  {new Date(selectedTopupForReply.createdAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              {/* Coupon Code Generator */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#A8A49C]">
                    Код купона для користувача: *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateNewCouponCode}
                    className="text-[11px] text-[#CC785C] hover:underline flex items-center gap-1"
                  >
                    <Sparkles size={11} />
                    <span>Згенерувати інший</span>
                  </button>
                </div>
                
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={replyCouponCode}
                    onChange={(e) => setReplyCouponCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#1B1A17] border border-[#3E3C36] font-mono font-bold text-sm text-amber-300 tracking-wider focus:outline-none focus:border-[#CC785C]"
                  />
                </div>
              </div>

              {/* Amount to issue */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#A8A49C]">
                  Номінал купона (₴ UAH): *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={replyAmount}
                  onChange={(e) => setReplyAmount(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#1B1A17] border border-[#3E3C36] text-sm text-[#FAF8F5] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              {/* Message to User */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#A8A49C]">
                  Повідомлення до купона:
                </label>
                <textarea
                  rows={2}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Вкажіть коментар або привітання..."
                  className="w-full px-3 py-2 rounded-xl bg-[#1B1A17] border border-[#3E3C36] text-xs text-[#ECE8E1] focus:outline-none focus:border-[#CC785C] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#33312D]">
                <button
                  type="button"
                  onClick={() => setSelectedTopupForReply(null)}
                  className="px-4 py-2 text-xs font-medium text-[#8E8B83] hover:text-[#ECE8E1] hover:bg-[#34322D] rounded-xl transition-colors"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isSendingCoupon || !replyCouponCode.trim()}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#CC785C] to-[#E08A6E] hover:from-[#D97757] hover:to-[#EB967A] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-98 flex items-center gap-2"
                >
                  <Send size={14} />
                  <span>{isSendingCoupon ? 'Відправка...' : 'Надіслати купон користувачу'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attachment Fullscreen Lightbox Modal */}
      {previewAttachmentUrl && (
        <div 
          onClick={() => setPreviewAttachmentUrl(null)}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewAttachmentUrl(null)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-[#CC785C] transition-colors"
              title="Закрити"
            >
              <X size={24} />
            </button>
            <img 
              src={previewAttachmentUrl} 
              alt="Квитанція повний розмір" 
              className="max-h-[85vh] max-w-full rounded-2xl object-contain border border-[#363430] shadow-2xl" 
            />
          </div>
        </div>
      )}

      {/* Admin Testing Preloader Fullscreen Preview */}
      {adminTestingPreloader && (
        <AppPreloader
          settings={{
            isEnabled: true,
            mediaType: preloaderMediaType,
            mediaUrl: preloaderMediaUrl,
            durationSeconds: Number(preloaderDuration) || 15,
            versionId: 'admin_test_preview',
            title: preloaderTitle,
            subtext: preloaderSubtext,
            allowSkip: preloaderAllowSkip,
            secondaryImageUrl: preloaderSecondaryImage,
            secondaryDurationSeconds: Number(preloaderSecondaryDuration) || 3,
            secondaryText: preloaderSecondaryText
          }}
          isPreviewMode={true}
          onFinished={() => setAdminTestingPreloader(false)}
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
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
                  <p className="text-xs text-[#8A8780] mt-0.5">Підтримуються PNG, SVG, JPG, WebP</p>
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

          <div className="pt-1">
            <div className="text-[11px] font-medium text-[#8A8780] mb-1.5">
              Власний колір (HEX або Tailwind):
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
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
