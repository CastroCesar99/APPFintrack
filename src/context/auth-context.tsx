
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
import { doc, onSnapshot } from 'firebase/firestore';

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
      return;
    }

    setLoading(true);
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeDoc = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let status: SubscriptionStatus = data.subscriptionStatus || 'inactive';
        const trialEndDate = data.trialEndDate?.toDate();
        const subscriptionEndDate = data.subscriptionEndDate?.toDate();
        const now = new Date();

        let isActive = false;
        
        if (status === 'trial' && trialEndDate && trialEndDate >= now) {
          isActive = true;
        } else if (status === 'active' && subscriptionEndDate && subscriptionEndDate >= now) {
          isActive = true;
        } else if (status === 'trial' && trialEndDate && trialEndDate < now) {
          status = 'expired';
        } else if (status === 'active' && subscriptionEndDate && subscriptionEndDate < now) {
          status = 'expired';
        }
        
        setIsSubscriptionActive(isActive);
        setSubscriptionStatus(status);
      } else {
        setIsSubscriptionActive(false);
        setSubscriptionStatus('inactive');
      }
      setLoading(false);
    }, (error) => {
        console.error("AuthContext: Error listening to user document:", error);
        setIsSubscriptionActive(false);
        setSubscriptionStatus(null);
        setLoading(false);
    });

    return () => unsubscribeDoc();
  }, [user]);


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
