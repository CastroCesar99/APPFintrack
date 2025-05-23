
"use client";

import type React from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail
} from 'firebase/auth';
import { auth } from '@/lib/firebase'; 
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, pass: string) => Promise<User | null>;
  logIn: (email: string, pass: string) => Promise<User | null>;
  logOut: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    console.log("AuthContext: useEffect for onAuthStateChanged, initial loading state:", loading);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("AuthContext: onAuthStateChanged fired. User:", currentUser, "Email Verified:", currentUser?.emailVerified);
      setUser(currentUser);
      setLoading(false);
    }, (error) => {
      console.error("AuthContext: Error in onAuthStateChanged listener:", error);
      setUser(null);
      setLoading(false);
    });
    return () => {
      console.log("AuthContext: Unsubscribing from onAuthStateChanged.");
      unsubscribe();
    }
  }, []);

  const signUp = useCallback(async (email: string, pass: string): Promise<User | null> => {
    console.log("AuthContext: signUp called. Setting loading to true.");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      console.log("AuthContext: signUp successful. User from credential:", userCredential.user);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error signing up:", error);
      return null;
    }
  }, []);

  const logIn = useCallback(async (email: string, pass: string): Promise<User | null> => {
    console.log("AuthContext: logIn called. Attempting login for email:", email); // Log do e-mail
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      console.log("AuthContext: logIn successful. User from credential:", userCredential.user);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error logging in:", error); 
      setLoading(false); 
      return null;
    }
  }, []);

  const logOut = useCallback(async () => {
    console.log("AuthContext: logOut called.");
    try {
      await signOut(auth);
      console.log("AuthContext: logOut successful. User should be null now.");
      router.push('/login');
    } catch (error) {
      console.error("AuthContext: Error logging out:", error);
    }
  }, [router]);

  const sendPasswordResetEmail = useCallback(async (emailAddress: string) => {
    return firebaseSendPasswordResetEmail(auth, emailAddress);
  }, []);

  const reloadUser = useCallback(async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      console.log("AuthContext: Reloading user data...");
      try {
        await currentUser.reload();
        const reloadedUser = auth.currentUser; 
        console.log("AuthContext: User reloaded. New emailVerified status:", reloadedUser?.emailVerified);
        setUser(reloadedUser ? {...reloadedUser} : null); 
      } catch (error) {
        console.error("AuthContext: Error during user.reload():", error);
        // Potentially handle specific errors here, e.g., user token expired
      }
    } else {
      console.log("AuthContext: No current user to reload.");
    }
  }, []);

  const value = {
    user,
    loading,
    signUp,
    logIn,
    logOut,
    sendPasswordResetEmail,
    reloadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
