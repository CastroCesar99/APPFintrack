
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
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase'; 
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { whitelistedEmails } from '@/lib/whitelist';

export type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'canceled' | 'expired';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isFetchingProfile: boolean;
  isSubscriptionActive: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  isOnboarded: boolean;
  fallbackTriggered: boolean;
  signUp: (email: string, pass: string) => Promise<User | null>;
  logIn: (email: string, pass: string) => Promise<User | null>;
  signInWithGoogle: () => Promise<User | null>;
  logOut: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFetchingProfile, setIsFetchingProfile] = useState(true);
  const [isSubscriptionActive, setIsSubscriptionActive] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [fallbackTriggered, setFallbackTriggered] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      console.log("AuthContext: Auth state changed. User:", currentUser?.uid);
      if (currentUser) {
        // Reiniciamos o loading no evento para dar tempo de montar o snapshot
        setLoading(true); 
        setIsFetchingProfile(true);
        setUser(currentUser);
      } else {
        setUser(null);
        setIsSubscriptionActive(false);
        setSubscriptionStatus(null);
        setIsOnboarded(false);
        setIsFetchingProfile(false);
        setLoading(false);
      }
    });

    // Safety timeout: If nothing happens for 10 seconds, clear loading
    // to prevent infinite spinner if Firebase/Plugins hang.
    const timer = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn("AuthContext: Safety timeout reached. Clearing loading state.");
          return false;
        }
        return prev;
      });
    }, 8000);

    return () => {
      unsubscribeAuth();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      // Reset completo de estado quando não há usuário
      setIsFetchingProfile(false);
      setLoading(false);
      setIsOnboarded(false);
      setIsSubscriptionActive(false);
      setSubscriptionStatus(null);
      setFallbackTriggered(false);
      return;
    }

    // Função assíncrona para buscar perfil com getDoc
    const fetchUserProfile = async () => {
      try {
        console.log("AuthContext: Buscando perfil do usuário com getDoc para", user.uid);
        
        // Whitelist check
        if (user.email && whitelistedEmails.includes(user.email)) {
          console.log(`AuthContext: User ${user.email} is whitelisted. Granting subscription access.`);
          setIsSubscriptionActive(true);
          setSubscriptionStatus('active');
          setIsOnboarded(true);
        }

        const { doc, getDoc, setDoc, serverTimestamp, Timestamp } = await import('firebase/firestore');
        const userDocRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userDocRef);
        
        if (!docSnap.exists()) {
          // Auto-provision user doc for new social logins
          console.log("AuthContext: User document does not exist yet. Creating basic doc for social user...");
          await setDoc(userDocRef, {
            uid: user.uid,
            name: user.displayName || "",
            email: user.email,
            createdAt: serverTimestamp(),
            onboardingComplete: false,
            subscriptionStatus: 'inactive',
            subscriptionEndDate: Timestamp.fromDate(new Date(0)),
          }, { merge: true });
          
          // Para novos usuários, assume valores padrão
          const onboarded = !!(user.email && whitelistedEmails.includes(user.email));
          setIsOnboarded(onboarded);
          setIsSubscriptionActive(onboarded);
          setSubscriptionStatus(onboarded ? 'active' : 'inactive');
        } else {
          const data = docSnap.data();
          let onboarded = data.onboardingComplete === true;
          
          // Force onboarded = true for whitelisted users (stable identity)
          if (user.email && whitelistedEmails.includes(user.email)) {
            console.log("AuthContext: Whitelisted user detected in snapshot. Forcing onboarded=true.");
            onboarded = true;
          }

          const status: SubscriptionStatus = data.subscriptionStatus || 'inactive';
          const endDate: Date | null = data.subscriptionEndDate?.toDate() || null;
          const now = new Date();
          
          console.log(`AuthContext: Checking. Onboarded: ${onboarded}, Status: '${status}', EndDate:`, endDate);

          let isActive = false;
          // Whitelist also overrides subscription activity check
          if ((status === 'active' && endDate && endDate > now) || (user.email && whitelistedEmails.includes(user.email))) {
            isActive = true;
          }
          
          // Aplicar estados de forma síncrona
          setIsOnboarded(onboarded);
          setIsSubscriptionActive(isActive);
          setSubscriptionStatus(status);
        }

        console.log("AuthContext: Perfil carregado com sucesso usando getDoc");
      } catch (error) {
        console.error("AuthContext: Erro ao buscar perfil do usuário com getDoc:", error);
        
        // Fallback para usuários whitelist em caso de erro
        if (user.email && whitelistedEmails.includes(user.email)) {
          console.warn("AuthContext: Erro no Firestore para usuário whitelist. Usando fallback.");
          setIsOnboarded(true);
          setIsSubscriptionActive(true);
          setSubscriptionStatus('active');
        } else {
          // Para usuários não whitelist, assume padrão gratuito
          setIsOnboarded(false);
          setIsSubscriptionActive(false);
          setSubscriptionStatus('inactive');
        }
        
        // Marcar fallback como triggered
        setFallbackTriggered(true);
      } finally {
        // OBRIGATÓRIO: Sempre liberar o loading
        setIsFetchingProfile(false);
        setLoading(false);
      }
    };

    // Timeout para fallback de 5 segundos
    const fallbackTimer = setTimeout(() => {
      if (isFetchingProfile) {
        console.warn("AuthContext: Timeout de 5s alcançado. Ativando fallback.");
        setFallbackTriggered(true);
        
        // Assume valores padrão para liberar o app
        if (user.email && whitelistedEmails.includes(user.email)) {
          setIsOnboarded(true);
          setIsSubscriptionActive(true);
          setSubscriptionStatus('active');
        } else {
          setIsOnboarded(false);
          setIsSubscriptionActive(false);
          setSubscriptionStatus('inactive');
        }
        
        setIsFetchingProfile(false);
        setLoading(false);
      }
    }, 5000);

    // Executa a busca
    fetchUserProfile();

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [user?.uid, user?.email]);


  const signUp = useCallback(async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      setLoading(false);
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
      setLoading(false);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error logging in:", error); 
      setLoading(false); 
      return null;
    }
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    setLoading(true);
    try {
      // Standard Web Popup Login
      console.log("AuthContext: Starting web signInWithPopup...");
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);

      setLoading(false);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error with Google login:", error);
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
    isFetchingProfile,
    isSubscriptionActive,
    subscriptionStatus,
    isOnboarded,
    fallbackTriggered,
    signUp,
    logIn,
    signInWithGoogle,
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
