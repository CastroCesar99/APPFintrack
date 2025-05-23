
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
  sendPasswordResetEmail as firebaseSendPasswordResetEmail // Renamed to avoid conflict if we had a local one
} from 'firebase/auth';
import { auth } from '@/lib/firebase'; 
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, pass: string) => Promise<User | null>;
  logIn: (email: string, pass: string) => Promise<User | null>;
  logOut: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>; // Added
  reloadUser: () => Promise<void>; // Added
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
      // User object here might not immediately have emailVerified: true,
      // and displayName might not be set yet by updateProfile.
      // We rely on onAuthStateChanged to get the final state after profile updates/verification.
      console.log("AuthContext: signUp successful. User from credential:", userCredential.user);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error signing up:", error);
      return null;
    } finally {
      console.log("AuthContext: signUp finished. Setting loading to false.");
      // setLoading(false); // Let onAuthStateChanged handle this
    }
  }, []);

  const logIn = useCallback(async (email: string, pass: string): Promise<User | null> => {
    console.log("AuthContext: logIn called. Setting loading to true.");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      // onAuthStateChanged will update user and loading state
      console.log("AuthContext: logIn successful. User from credential:", userCredential.user);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error logging in:", error);
      setLoading(false); // Ensure loading is false on login error
      return null;
    }
    // setLoading(false) will be handled by onAuthStateChanged
  }, []);

  const logOut = useCallback(async () => {
    console.log("AuthContext: logOut called.");
    // setLoading(true); // Let onAuthStateChanged handle this
    try {
      await signOut(auth);
      // setUser(null) and setLoading(false) will be handled by onAuthStateChanged
      console.log("AuthContext: logOut successful. User should be null now.");
      router.push('/login');
    } catch (error) {
      console.error("AuthContext: Error logging out:", error);
      // setLoading(false); // Ensure loading is false on logout error
    }
  }, [router]);

  const sendPasswordResetEmail = useCallback(async (email: string) => {
    return firebaseSendPasswordResetEmail(auth, email);
  }, []);

  const reloadUser = useCallback(async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      console.log("AuthContext: Reloading user data...");
      await currentUser.reload();
      // After reload, onAuthStateChanged should fire with the updated user state.
      // For immediate UI reflection if onAuthStateChanged is slow or doesn't pick it up,
      // we can manually update our local user state if needed, but typically reload()
      // followed by onAuthStateChanged is the pattern.
      // Forcing a local state update to ensure reactivity if onAuthStateChanged doesn't fire quickly enough
      // after manual reload for emailVerified change.
      const reloadedUser = auth.currentUser; // Get the potentially updated user object
      console.log("AuthContext: User reloaded. New emailVerified status:", reloadedUser?.emailVerified);
      setUser(reloadedUser ? {...reloadedUser} : null); // Spread to ensure new object reference if needed for reactivity
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
