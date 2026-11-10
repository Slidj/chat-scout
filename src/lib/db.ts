import { 
  collection, getDocs, doc, setDoc, deleteDoc, addDoc, 
  onSnapshot, query, orderBy, limit, increment, Unsubscribe 
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
  lastActive: string;
  firstSeen: string;
  totalQueries?: number;
  lastModelUsed?: string;
  platform?: string;
}

export interface ActivityEvent {
  id?: string;
  type: 'visit' | 'query' | 'model_change' | 'admin_action';
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

export const trackUserSession = async (user?: any) => {
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
    } else {
      payload.firstName = 'Web User';
      payload.username = userId.slice(0, 8);
    }

    await setDoc(userRef, {
      firstSeen: now,
      totalQueries: 0,
      ...payload
    }, { merge: true });

    // Also log user session event
    await addDoc(collection(db, 'activity'), {
      type: 'visit',
      description: `Активна сесія: ${isTg ? (user.first_name || user.username || user.id) : 'Web відвідувач'}`,
      user: isTg ? (user.first_name || `@${user.username}`) : 'Web User',
      timestamp: now
    });
  } catch (err) {
    console.warn('Could not track user session:', err);
  }
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

