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
