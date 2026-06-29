
"use client";

import type React from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User
} from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Using the initialized auth from firebase.ts
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, pass: string) => Promise<User | null>;
  logIn: (email: string, pass: string) => Promise<User | null>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    console.log("AuthContext: useEffect for onAuthStateChanged, initial loading state:", loading);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("AuthContext: onAuthStateChanged fired. User:", currentUser, "Setting loading to false.");
      setUser(currentUser);
      setLoading(false);
    }, (error) => {
      console.error("AuthContext: Error in onAuthStateChanged listener:", error);
      setUser(null); // Ensure user is null on auth error
      setLoading(false); // Ensure loading is false even on auth error
    });
    return () => {
      console.log("AuthContext: Unsubscribing from onAuthStateChanged.");
      unsubscribe();
    }
  }, []); // Empty dependency array means this runs once on mount and cleans up on unmount

  const signUp = useCallback(async (email: string, pass: string): Promise<User | null> => {
    console.log("AuthContext: signUp called. Setting loading to true.");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      setUser(userCredential.user);
      console.log("AuthContext: signUp successful. User:", userCredential.user);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error signing up:", error);
      return null;
    } finally {
      console.log("AuthContext: signUp finished. Setting loading to false.");
      setLoading(false);
    }
  }, []);

  const logIn = useCallback(async (email: string, pass: string): Promise<User | null> => {
    console.log("AuthContext: logIn called. Setting loading to true.");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      setUser(userCredential.user);
      console.log("AuthContext: logIn successful. User:", userCredential.user);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error logging in:", error); // This is where "auth/invalid-credential" would be caught
      return null;
    } finally {
      console.log("AuthContext: logIn finished. Setting loading to false.");
      setLoading(false);
    }
  }, []);

  const logOut = useCallback(async () => {
    console.log("AuthContext: logOut called. Setting loading to true.");
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      console.log("AuthContext: logOut successful. User set to null.");
      router.push('/login');
    } catch (error) {
      console.error("AuthContext: Error logging out:", error);
    } finally {
      console.log("AuthContext: logOut finished. Setting loading to false.");
      setLoading(false);
    }
  }, [router]);

  const value = {
    user,
    loading,
    signUp,
    logIn,
    logOut,
  };

  // console.log("AuthContext: Provider rendering. Current loading state:", loading, "User:", user); // This log can be very noisy
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

    