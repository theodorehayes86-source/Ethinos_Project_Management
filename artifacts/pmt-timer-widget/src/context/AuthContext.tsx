import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, db } from "../firebase";
import { PMTUser } from "../types";

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  pmtUser: PMTUser | null;
  loading: boolean;
  error: string | null;
  pmtUserNotFound: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [pmtUser, setPmtUser] = useState<PMTUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pmtUserNotFound, setPmtUserNotFound] = useState(false);

  async function resolvePmtUser(fbUser: FirebaseUser) {
    setPmtUserNotFound(false);
    try {
      const snap = await get(ref(db, "users"));
      if (!snap.exists()) {
        setPmtUserNotFound(true);
        return;
      }
      const val = snap.val();
      const list: PMTUser[] = Array.isArray(val) ? val : Object.values(val);
      const match = list.find(
        (u) => u.email?.toLowerCase() === fbUser.email?.toLowerCase()
      );
      if (match) {
        setPmtUser(match);
      } else {
        setPmtUserNotFound(true);
      }
    } catch {
      setPmtUserNotFound(true);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await resolvePmtUser(user);
      } else {
        setPmtUser(null);
        setPmtUserNotFound(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "Login failed");
      throw err;
    }
  }

  async function logout() {
    await signOut(auth);
    setPmtUser(null);
    setPmtUserNotFound(false);
  }

  return (
    <AuthContext.Provider
      value={{ firebaseUser, pmtUser, loading, error, pmtUserNotFound, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
