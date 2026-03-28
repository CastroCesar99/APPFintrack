
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
import { auth, db } from '@/lib/firebase'; 
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { whitelistedEmails } from '@/lib/whitelist';

export type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'canceled' | 'expired';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isSubscriptionActive: boolean;
  subscriptionStatus: SubscriptionStatus | null;
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
  const [isSubscriptionActive, setIsSubscriptionActive] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      console.log("AuthContext: Auth state changed. User:", currentUser?.uid);
      setUser(currentUser);
      if (!currentUser) {
        setIsSubscriptionActive(false);
        setSubscriptionStatus(null);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      if (loading) setLoading(false);
      return;
    }

    // Whitelist check
    if (user.email && whitelistedEmails.includes(user.email)) {
      console.log(`AuthContext: User ${user.email} is whitelisted. Granting subscription access.`);
      setIsSubscriptionActive(true);
      setSubscriptionStatus('active');
      setLoading(false);
      return; // Skip Firestore check
    }

    console.log("AuthContext: User detected (",user.uid,"), setting up Firestore listener for subscription status.");
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeDoc = onSnapshot(userDocRef, (docSnap) => {
      console.log("AuthContext: Firestore snapshot received for user", user.uid);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const status: SubscriptionStatus = data.subscriptionStatus || 'inactive';
        const endDate: Date | null = data.subscriptionEndDate?.toDate() || null;
        const now = new Date();
        
        console.log(`AuthContext: Checking status. Read from DB -> Status: '${status}', EndDate:`, endDate);

        let isActive = false;
        if (status === 'active' && endDate && endDate > now) {
          isActive = true;
        }
        
        console.log(`AuthContext: Final calculation -> isActive: ${isActive}`);
        
        setIsSubscriptionActive(isActive);
        setSubscriptionStatus(status);
      } else {
        console.log("AuthContext: User document does not exist yet. Defaulting to inactive.");
        setIsSubscriptionActive(false);
        setSubscriptionStatus('inactive');
      }
      setLoading(false);
      console.log("AuthContext: Loading set to false after reading user doc.");
    }, (error) => {
        console.error("AuthContext: Error listening to user document:", error);
        setIsSubscriptionActive(false);
        setSubscriptionStatus(null);
        setLoading(false);
    });

    return () => unsubscribeDoc();
  }, [user]);


  const signUp = useCallback(async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error signing up:", error);
      setLoading(false);
      return null;
    }
  }, []);

  const logIn = useCallback(async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error logging in:", error); 
      setLoading(false); 
      return null;
    }
  }, []);

  const logOut = useCallback(async () => {
    try {
      await signOut(auth);
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
      await currentUser.reload();
      setUser(auth.currentUser ? {...auth.currentUser} : null); 
    }
  }, []);

  const value = {
    user,
    loading,
    isSubscriptionActive,
    subscriptionStatus,
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
