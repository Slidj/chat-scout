import { collection, getDocs, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
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
  totalRequests?: number;
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

export const trackUserSession = async (user: any) => {
  try {
    if (!user || !user.id) return;
    const userId = String(user.id);
    const userRef = doc(db, 'users', userId);
    const now = new Date().toISOString();
    
    await setDoc(userRef, {
      id: userId,
      telegramId: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      username: user.username || '',
      lastActive: now,
      firstSeen: now,
      platform: window?.Telegram?.WebApp?.platform || 'web'
    }, { merge: true });
  } catch (err) {
    console.warn('Could not track user session:', err);
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
    const snapshot = await getDocs(collection(db, 'activity'));
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityEvent));
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
  } catch (e) {
    return [];
  }
};
