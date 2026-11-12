import { 
  collection, getDocs, getDoc, doc, setDoc, deleteDoc, addDoc, 
  onSnapshot, query, orderBy, limit, increment, Unsubscribe, where 
} from 'firebase/firestore';
import { db } from './firebase';
import { Provider, AiModel } from '../types';

export const getProviders = async (): Promise<Provider[]> => {
  const snapshot = await getDocs(collection(db, 'providers'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Provider));
};

export const getModels = async (): Promise<AiModel[]> => {
  const snapshot = await getDocs(collection(db, 'models'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AiModel));
};

export const saveProvider = async (provider: Omit<Provider, 'id'>) => {
  const docRef = await addDoc(collection(db, 'providers'), provider);
  return { ...provider, id: docRef.id } as Provider;
};

export const updateProvider = async (provider: Provider) => {
  const { id, ...data } = provider;
  await setDoc(doc(db, 'providers', id), data);
};

export const deleteProvider = async (id: string) => {
  await deleteDoc(doc(db, 'providers', id));
};

export const saveModel = async (model: Omit<AiModel, 'id'>) => {
  const docRef = await addDoc(collection(db, 'models'), model);
  return { ...model, id: docRef.id } as AiModel;
};

export const updateModel = async (model: AiModel) => {
  const { id, ...data } = model;
  await setDoc(doc(db, 'models', id), data);
};

export const deleteModel = async (id: string) => {
  await deleteDoc(doc(db, 'models', id));
};

export interface AppUser {
  id: string;
  telegramId?: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  lastActive: string;
  firstSeen: string;
  totalQueries?: number;
  lastModelUsed?: string;
  platform?: string;
  isBlocked?: boolean;
  blockedAt?: string;
  blockedReason?: string;
}

export interface ActivityEvent {
  id?: string;
  type: 'visit' | 'query' | 'model_change' | 'admin_action' | 'topup_request' | 'coupon_sent';
  description: string;
  timestamp: string;
  user?: string;
  details?: any;
}

export interface QueryLog {
  id?: string;
  userId: string;
  userName: string;
  modelId: string;
  promptSnippet?: string;
  timestamp: string;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export const getOrInitClientId = (): string => {
  let id = localStorage.getItem('app_client_uid');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('app_client_uid', id);
  }
  return id;
};

export const trackUserSession = async (user?: any): Promise<boolean> => {
  try {
    const isTg = !!user?.id;
    const userId = isTg ? String(user.id) : getOrInitClientId();
    const userRef = doc(db, 'users', userId);
    const now = new Date().toISOString();

    const payload: Partial<AppUser> = {
      id: userId,
      lastActive: now,
      platform: (window as any)?.Telegram?.WebApp?.platform || (isTg ? 'telegram' : 'web')
    };

    if (isTg) {
      payload.telegramId = user.id;
      if (user.first_name) payload.firstName = user.first_name;
      if (user.last_name) payload.lastName = user.last_name;
      if (user.username) payload.username = user.username;
      if (user.photo_url) payload.photoUrl = user.photo_url;
    } else {
      payload.firstName = 'Web User';
      payload.username = userId.slice(0, 8);
    }

    // Preserve existing isBlocked status if already blocked
    await setDoc(userRef, {
      firstSeen: now,
      totalQueries: 0,
      isBlocked: false,
      ...payload
    }, { merge: true });

    // Also log user session event
    await addDoc(collection(db, 'activity'), {
      type: 'visit',
      description: `Активна сесія: ${isTg ? (user.first_name || user.username || user.id) : 'Web відвідувач'}`,
      user: isTg ? (user.first_name || `@${user.username}`) : 'Web User',
      timestamp: now
    });

    return true;
  } catch (err) {
    console.warn('Could not track user session:', err);
    return false;
  }
};

export const deleteUser = async (userId: string) => {
  try {
    await deleteDoc(doc(db, 'users', userId));
    await addDoc(collection(db, 'activity'), {
      type: 'admin_action',
      description: `Видалено користувача ID: ${userId}`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    throw err;
  }
};

export const toggleBlockUser = async (userId: string, isBlocked: boolean, reason?: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const now = new Date().toISOString();
    await setDoc(userRef, {
      isBlocked,
      blockedAt: isBlocked ? now : null,
      blockedReason: isBlocked ? (reason || 'Обмеження доступу за рішенням адміністрації') : null
    }, { merge: true });

    await addDoc(collection(db, 'activity'), {
      type: 'admin_action',
      description: isBlocked ? `Заблоковано користувача ${userId}` : `Розблоковано користувача ${userId}`,
      timestamp: now
    });
  } catch (err) {
    console.error('Error toggling block on user:', err);
    throw err;
  }
};

export const subscribeToCurrentUser = (userId: string, callback: (user: AppUser | null) => void): Unsubscribe => {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() } as AppUser);
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn('Current user subscription error:', err);
  });
};

export const logQueryEvent = async (data: {
  userId: string;
  userName: string;
  modelId: string;
  promptSnippet?: string;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}) => {
  try {
    const now = new Date().toISOString();
    
    // 1. Add query record
    await addDoc(collection(db, 'queries'), {
      ...data,
      timestamp: now
    });

    // 2. Add activity record
    const statusText = data.status === 'success' ? 'успішно' : 'помилка';
    await addDoc(collection(db, 'activity'), {
      type: 'query',
      description: `Запит до ${data.modelId} (${statusText}, ${data.durationMs}мс)`,
      user: data.userName || 'Користувач',
      timestamp: now
    });

    // 3. Increment user stats
    const userRef = doc(db, 'users', data.userId);
    await setDoc(userRef, {
      totalQueries: increment(1),
      lastActive: now,
      lastModelUsed: data.modelId
    }, { merge: true });
  } catch (err) {
    console.warn('Error logging query event:', err);
  }
};

export const getUsers = async (): Promise<AppUser[]> => {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
  } catch (e) {
    console.error('Error fetching users:', e);
    return [];
  }
};

export const getQueries = async (): Promise<QueryLog[]> => {
  try {
    const q = query(collection(db, 'queries'), orderBy('timestamp', 'desc'), limit(150));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueryLog));
  } catch (e) {
    console.error('Error fetching queries:', e);
    return [];
  }
};

export const logActivityEvent = async (event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
  try {
    await addDoc(collection(db, 'activity'), {
      ...event,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Activity logging skipped:', err);
  }
};

export const getRecentActivities = async (): Promise<ActivityEvent[]> => {
  try {
    const q = query(collection(db, 'activity'), orderBy('timestamp', 'desc'), limit(40));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityEvent));
  } catch (e) {
    return [];
  }
};

// -------------------------------------------------------------
// Real-time Subscriptions (Live updating!)
// -------------------------------------------------------------
export const subscribeToUsers = (callback: (users: AppUser[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, 'users'), (snapshot) => {
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
    users.sort((a, b) => new Date(b.lastActive || 0).getTime() - new Date(a.lastActive || 0).getTime());
    callback(users);
  }, (err) => {
    console.warn('Users subscription error:', err);
  });
};

export const subscribeToQueries = (callback: (queries: QueryLog[]) => void): Unsubscribe => {
  const q = query(collection(db, 'queries'), orderBy('timestamp', 'desc'), limit(150));
  return onSnapshot(q, (snapshot) => {
    const queries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueryLog));
    callback(queries);
  }, (err) => {
    console.warn('Queries subscription error:', err);
  });
};

export const subscribeToActivities = (callback: (events: ActivityEvent[]) => void): Unsubscribe => {
  const q = query(collection(db, 'activity'), orderBy('timestamp', 'desc'), limit(40));
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityEvent));
    callback(events);
  }, (err) => {
    console.warn('Activities subscription error:', err);
  });
};

// -------------------------------------------------------------
// Chat History Persistence & Auto-Cleanup (Retention: 3 days)
// -------------------------------------------------------------
export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  modelId: string;
  messages: any[];
  createdAt: string | number;
  updatedAt: string | number;
  expiresAt: string | number;
}

export const CHAT_RETENTION_DAYS = 3;
export const CHAT_RETENTION_MS = CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Saves or updates a chat session in Firestore.
 * Automatically sets expiresAt to 3 days from the latest activity.
 */
export const saveChatSession = async (session: Omit<ChatSession, 'expiresAt'>): Promise<void> => {
  try {
    const expiresAt = new Date(Date.now() + CHAT_RETENTION_MS).toISOString();
    const chatRef = doc(db, 'chats', session.id);
    await setDoc(chatRef, {
      ...session,
      expiresAt
    }, { merge: true });
  } catch (e) {
    console.error('Error saving chat session:', e);
  }
};

/**
 * Subscribes to all chat sessions belonging to a specific user.
 */
export const subscribeUserChats = (userId: string, callback: (chats: ChatSession[]) => void): Unsubscribe => {
  const q = query(collection(db, 'chats'), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
    chats.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    callback(chats);
  }, (err) => {
    console.warn('Chats subscription error:', err);
  });
};

/**
 * Deletes a single chat session.
 */
export const deleteChatSession = async (chatId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'chats', chatId));
  } catch (e) {
    console.error('Error deleting chat session:', e);
  }
};

/**
 * Clears all chat sessions for a specific user.
 */
export const clearUserChats = async (userId: string): Promise<void> => {
  try {
    const q = query(collection(db, 'chats'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (e) {
    console.error('Error clearing user chats:', e);
  }
};

/**
 * Background auto-cleanup: deletes chats older than the retention threshold (>3 days).
 * Keeps the free Firestore database permanently lean and minimal.
 */
export const cleanupExpiredChats = async (): Promise<number> => {
  try {
    const nowIso = new Date().toISOString();
    const q = query(collection(db, 'chats'), where('expiresAt', '<', nowIso), limit(50));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;
    const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    console.log(`Auto-cleaned ${snapshot.size} expired chat(s) from database`);
    return snapshot.size;
  } catch (e) {
    console.warn('Cleanup expired chats skipped:', e);
    return 0;
  }
};

// -------------------------------------------------------------
// Top-up & Payment Requests + Admin Coupon Communications
// -------------------------------------------------------------
export interface TopupRequest {
  id: string;
  userId: string;
  userName: string;
  userUsername?: string;
  userPhotoUrl?: string;
  telegramId?: number;
  amount: number | string;
  currency: string;
  userComment?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  status: 'pending' | 'completed' | 'rejected';
  adminReplyMessage?: string;
  adminCouponCode?: string;
  adminCouponAmount?: number | string;
  createdAt: string;
  updatedAt: string;
}

export const COUPON_RETENTION_DAYS = 3;

export interface UserCoupon {
  id: string;
  topupId?: string;
  userId: string;
  userName?: string;
  couponCode: string;
  amount: number | string;
  currency: string;
  message?: string;
  isRead: boolean;
  isClaimed?: boolean;
  createdAt: string;
  expiresAt?: string;
}

export const createTopupRequest = async (
  data: Omit<TopupRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>
): Promise<string> => {
  const now = new Date().toISOString();
  const docRef = await addDoc(collection(db, 'topups'), {
    ...data,
    status: 'pending',
    createdAt: now,
    updatedAt: now
  });
  
  await logActivityEvent({
    type: 'topup_request',
    description: `Заявка на поповнення: ${data.amount} ${data.currency} від ${data.userName}`,
    user: data.userName || data.userId
  }).catch(console.warn);

  return docRef.id;
};

export const subscribeToTopups = (callback: (requests: TopupRequest[]) => void): Unsubscribe => {
  const q = query(collection(db, 'topups'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TopupRequest));
    callback(list);
  }, (err) => {
    console.warn('Topups subscription error:', err);
  });
};

export const updateTopupStatus = async (
  topupId: string,
  status: 'completed' | 'rejected',
  adminData?: {
    adminReplyMessage?: string;
    adminCouponCode?: string;
    adminCouponAmount?: number | string;
  }
): Promise<void> => {
  const ref = doc(db, 'topups', topupId);
  await setDoc(ref, {
    status,
    ...adminData,
    updatedAt: new Date().toISOString()
  }, { merge: true });
};

export const sendCouponToUser = async (
  couponData: Omit<UserCoupon, 'id' | 'createdAt' | 'isRead' | 'expiresAt'>
): Promise<string> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + COUPON_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  
  const docRef = await addDoc(collection(db, 'coupons'), {
    ...couponData,
    isRead: false,
    createdAt: now.toISOString(),
    expiresAt
  });

  await logActivityEvent({
    type: 'coupon_sent',
    description: `Купон ${couponData.couponCode} надіслано користувачу ${couponData.userName || couponData.userId}`,
    user: couponData.userName || couponData.userId
  }).catch(console.warn);

  return docRef.id;
};

/**
 * Removes coupons older than 3 days (COUPON_RETENTION_DAYS) from the database
 */
export const cleanupExpiredCoupons = async (userId?: string): Promise<number> => {
  try {
    const cutoffTime = Date.now() - COUPON_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const couponsRef = collection(db, 'coupons');
    const q = userId 
      ? query(couponsRef, where('userId', '==', userId))
      : couponsRef;

    const snapshot = await getDocs(q);
    let deletedCount = 0;

    for (const d of snapshot.docs) {
      const data = d.data();
      const createdAtMs = new Date(data.createdAt || 0).getTime();
      const expiresAtMs = data.expiresAt ? new Date(data.expiresAt).getTime() : 0;
      
      const isExpired = (expiresAtMs > 0 && expiresAtMs < Date.now()) || (createdAtMs > 0 && createdAtMs < cutoffTime);
      if (isExpired) {
        await deleteDoc(d.ref);
        deletedCount++;
      }
    }

    return deletedCount;
  } catch (e) {
    console.warn('Cleanup expired coupons skipped:', e);
    return 0;
  }
};

export const deleteUserCoupon = async (couponId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'coupons', couponId));
  } catch (e) {
    console.error('Error deleting coupon:', e);
  }
};

export const subscribeUserCoupons = (
  userId: string,
  callback: (coupons: UserCoupon[]) => void
): Unsubscribe => {
  // Fire background cleanup for this user
  cleanupExpiredCoupons(userId).catch(console.warn);

  const q = query(collection(db, 'coupons'), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    const cutoffTime = Date.now() - COUPON_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Map and filter out expired coupons
    const list = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as UserCoupon))
      .filter(c => {
        const cTime = new Date(c.createdAt || 0).getTime();
        const expTime = c.expiresAt ? new Date(c.expiresAt).getTime() : 0;
        if (expTime > 0 && expTime < now) return false;
        if (cTime > 0 && cTime < cutoffTime) return false;
        return true;
      });

    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    callback(list);
  }, (err) => {
    console.warn('User coupons subscription error:', err);
  });
};

export const markCouponAsRead = async (couponId: string): Promise<void> => {
  try {
    const ref = doc(db, 'coupons', couponId);
    await setDoc(ref, { isRead: true }, { merge: true });
  } catch (e) {
    console.error('Error marking coupon as read:', e);
  }
};

export const markCouponAsClaimed = async (couponId: string): Promise<void> => {
  try {
    const ref = doc(db, 'coupons', couponId);
    await setDoc(ref, { isClaimed: true, isRead: true }, { merge: true });
  } catch (e) {
    console.error('Error marking coupon as claimed:', e);
  }
};

// -------------------------------------------------------------
// Dynamic Payment Requisites / Bank Card Settings
// -------------------------------------------------------------
export interface PaymentSettings {
  cardNumber: string;
  bankName?: string;
  recipientName?: string;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  cardNumber: '4441 1144 5555 8888',
  bankName: 'Monobank / ПриватБанк',
  recipientName: 'Адміністратор сервісу',
  note: 'Вказуйте ваш нікнейм або надсилайте скріншот оплати через форму'
};

export const getPaymentSettings = async (): Promise<PaymentSettings> => {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'payment'));
    if (docSnap.exists()) {
      return { ...DEFAULT_PAYMENT_SETTINGS, ...docSnap.data() } as PaymentSettings;
    }
    return DEFAULT_PAYMENT_SETTINGS;
  } catch (e) {
    console.warn('Error reading payment settings:', e);
    return DEFAULT_PAYMENT_SETTINGS;
  }
};

export const updatePaymentSettings = async (
  settings: Partial<PaymentSettings>,
  adminName?: string
): Promise<void> => {
  const ref = doc(db, 'settings', 'payment');
  const now = new Date().toISOString();
  await setDoc(ref, {
    ...settings,
    updatedAt: now,
    updatedBy: adminName || 'Admin'
  }, { merge: true });

  await logActivityEvent({
    type: 'admin_action',
    description: `Оновлено банківські реквізити: картка ${settings.cardNumber ? settings.cardNumber.slice(-4).padStart(16, '•') : 'без змін'}`,
    user: adminName || 'Admin'
  }).catch(console.warn);
};

export const subscribePaymentSettings = (
  callback: (settings: PaymentSettings) => void
): Unsubscribe => {
  const ref = doc(db, 'settings', 'payment');
  return onSnapshot(ref, (docSnap) => {
    if (docSnap.exists()) {
      callback({ ...DEFAULT_PAYMENT_SETTINGS, ...docSnap.data() } as PaymentSettings);
    } else {
      callback(DEFAULT_PAYMENT_SETTINGS);
    }
  }, (err) => {
    console.warn('Payment settings subscription error:', err);
    callback(DEFAULT_PAYMENT_SETTINGS);
  });
};

// -------------------------------------------------------------
// Dynamic Custom Preloader & Video/GIF Splash Settings
// -------------------------------------------------------------
export interface PreloaderSettings {
  isEnabled: boolean;
  // Primary (Featured) media: Video or GIF
  mediaType: 'video' | 'gif' | 'image' | 'none';
  mediaUrl: string; // URL (mp4, webm, gif, etc.) or base64
  mediaPosterUrl?: string; // Optional poster image
  durationSeconds: number; // e.g. 10, 15, 30, 50s
  versionId: string; // Timestamp or hash identifying this video campaign; when changed, all users see the new video
  title?: string;
  subtext?: string;
  allowSkip: boolean;
  
  // Secondary (Return visitor) preloader with stylish wave
  secondaryImageUrl?: string;
  secondaryDurationSeconds: number; // 2, 3, 5s
  secondaryText?: string;

  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_PRELOADER_SETTINGS: PreloaderSettings = {
  isEnabled: true,
  mediaType: 'none',
  mediaUrl: '',
  mediaPosterUrl: '',
  durationSeconds: 15,
  versionId: 'v1_init',
  title: 'AI Studio Chats',
  subtext: 'Підключення передових моделей штучного інтелекту...',
  allowSkip: true,
  secondaryImageUrl: '',
  secondaryDurationSeconds: 3,
  secondaryText: 'Завантаження застосунку...'
};

export const getPreloaderSettings = async (): Promise<PreloaderSettings> => {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'preloader'));
    if (docSnap.exists()) {
      return { ...DEFAULT_PRELOADER_SETTINGS, ...docSnap.data() } as PreloaderSettings;
    }
    return DEFAULT_PRELOADER_SETTINGS;
  } catch (e) {
    console.warn('Error reading preloader settings:', e);
    return DEFAULT_PRELOADER_SETTINGS;
  }
};

export const updatePreloaderSettings = async (
  settings: Partial<PreloaderSettings>,
  adminName?: string
): Promise<void> => {
  if (settings.mediaUrl && settings.mediaUrl.startsWith('data:') && settings.mediaUrl.length > 800 * 1024) {
    throw new Error('Розмір завантаженого файлу перевищує ліміт бази даних (макс. 800 КБ). Будь ласка, використовуйте посилання на Pinterest (наприклад https://pin.it/...) замість прямого важкого файлу.');
  }
  const ref = doc(db, 'settings', 'preloader');
  const now = new Date().toISOString();
  await setDoc(ref, {
    ...settings,
    updatedAt: now,
    updatedBy: adminName || 'Admin'
  }, { merge: true });

  await logActivityEvent({
    type: 'admin_action',
    description: `Оновлено прелоадер (тип: ${settings.mediaType || 'налаштування'}, тривалість: ${settings.durationSeconds ?? 'звичайна'}с)`,
    user: adminName || 'Admin'
  }).catch(console.warn);
};

export const subscribePreloaderSettings = (
  callback: (settings: PreloaderSettings) => void
): Unsubscribe => {
  const ref = doc(db, 'settings', 'preloader');
  return onSnapshot(ref, (docSnap) => {
    if (docSnap.exists()) {
      callback({ ...DEFAULT_PRELOADER_SETTINGS, ...docSnap.data() } as PreloaderSettings);
    } else {
      callback(DEFAULT_PRELOADER_SETTINGS);
    }
  }, (err) => {
    console.warn('Preloader settings subscription error:', err);
    callback(DEFAULT_PRELOADER_SETTINGS);
  });
};



