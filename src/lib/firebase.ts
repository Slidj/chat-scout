import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const DATABASE_ID = "ai-studio-tgminichat-283232b6-525b-4ea2-968b-886ae634d05f";
export const db = getFirestore(app, DATABASE_ID);
export const auth = getAuth(app);
