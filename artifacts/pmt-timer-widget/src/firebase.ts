import { initializeApp } from "firebase/app";
import { getDatabase, ref } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAC3-FnGQH3HoIbG8fllYtJK6t8YWt--Nk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ethinos-project-management.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://ethinos-project-management-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ethinos-project-management",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ethinos-project-management.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "418382176848",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:418382176848:web:15d900e9837d26fd16e755",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

/** Firebase's own connection sentinel — far more reliable than navigator.onLine.
 *  Subscribe with onValue; value is boolean true when actively connected. */
export const connectedRef = ref(db, ".info/connected");

export default app;
