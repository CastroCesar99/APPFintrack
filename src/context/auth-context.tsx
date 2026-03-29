
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
  signInWithCredential,
  OAuthProvider
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { auth, db } from '@/lib/firebase'; 
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { whitelistedEmails } from '@/lib/whitelist';

export type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'canceled' | 'expired';

// Pre-load auth module for Web to prevent popup blocking
let webAuthModule: any = null;
if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
  import('firebase/auth').then(m => {
    webAuthModule = m;
    console.log("AuthContext: Web Auth module pre-loaded.");
  }).catch(err => console.error("AuthContext: Error pre-loading web auth:", err));
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isFetchingProfile: boolean;
  isSubscriptionActive: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  isOnboarded: boolean;
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
  const [isSocialInitialized, setIsSocialInitialized] = useState(false);
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

  // Helper to initialize Social Login
  const handleInitializeSocial = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || isSocialInitialized) return;
    
    try {
      console.log("AuthContext: Initializing SocialLogin...");
      const googleClientId = '627912670361-hcsfl4egpoeli1e8o2j8sqks6qmk7fn3.apps.googleusercontent.com';
      await SocialLogin.initialize({
        google: {
          webClientId: googleClientId,
          iOSClientId: googleClientId,
          iOSServerClientId: googleClientId,
        },
      });
      setIsSocialInitialized(true);
      console.log("AuthContext: SocialLogin initialized successfully.");
    } catch (error) {
      console.error("AuthContext: Error initializing SocialLogin:", error);
    }
  }, [isSocialInitialized]);

  // Initialize on mount if native
  useEffect(() => {
    handleInitializeSocial();
  }, [handleInitializeSocial]);

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
      setIsOnboarded(true); // Grant onboarding bypass immediately for whitelisted users
    }

    console.log("AuthContext: User detected (",user.uid,"), setting up Firestore listener for subscription/onboarding status.");
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeDoc = onSnapshot(userDocRef, async (docSnap) => {
      console.log("AuthContext: Firestore snapshot received for user", user.uid);
      
      if (!docSnap.exists() && user) {
         // Auto-provision user doc for new social logins
         console.log("AuthContext: User document does not exist yet. Creating basic doc for social user...");
         const { setDoc, serverTimestamp, Timestamp } = await import('firebase/firestore');
         await setDoc(userDocRef, {
           uid: user.uid,
           name: user.displayName || "",
           email: user.email,
           createdAt: serverTimestamp(),
           onboardingComplete: false,
           subscriptionStatus: 'inactive',
           subscriptionEndDate: Timestamp.fromDate(new Date(0)),
         }, { merge: true });
         // The listener will re-fire once the doc is created
         setIsFetchingProfile(false);
         setLoading(false); // <--- INSERIDO CONFORME ORDEM: Libera o lock se o Doc do usuário é novo
         return;
      }

      const data = docSnap.data();
      if (data) {
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
        
        // As regras de negócio avaliadas, aplicamos o state
        setIsOnboarded(onboarded);
        setIsSubscriptionActive(isActive);
        setSubscriptionStatus(status);

        // GARANTIA: Resolução Imediata do Loading (Conforme Ouro)
        setIsFetchingProfile(false);
        setLoading(false);
      } else {
        // Se `docSnap.data()` vier vazio, destrava.
        setIsFetchingProfile(false);
        setLoading(false);
      }

    }, (error) => {
        console.error("AuthContext: Error listening to user document:", error);
        // Fallback for whitelisted users to avoid redirect loops on connectivity/permission errors
        if (user.email && whitelistedEmails.includes(user.email)) {
          console.warn("AuthContext: Firestore error for whitelisted user. Using fallback states.");
          setIsOnboarded(true);
          setIsSubscriptionActive(true);
        } else {
          setIsSubscriptionActive(false);
          setSubscriptionStatus(null);
          setIsOnboarded(false);
        }
        setIsFetchingProfile(false);
        setLoading(false);
    });

    return () => unsubscribeDoc();
  }, [user]);


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
      let userCredential;

      if (Capacitor.isNativePlatform()) {
        // Ensure initialized
        if (!isSocialInitialized) {
          console.log("AuthContext: SocialLogin not initialized yet, forcing it now.");
          await handleInitializeSocial();
        }

        // Native Capacitor Login via Capgo Social Login
        console.log("AuthContext: Starting native SocialLogin.login...");
        const response = await SocialLogin.login({
          provider: 'google',
          options: {
            scopes: ['email', 'profile'],
          },
        });

        const result = response.result as any;
        const idToken = result.idToken || result.token;

        if (idToken) {
           console.log("AuthContext: Native token received, signing in with Firebase credential.");
           const credential = GoogleAuthProvider.credential(idToken);
           userCredential = await signInWithCredential(auth, credential);
        } else {
          throw new Error("No token received from Google Login");
        }
      } else {
        // Standard Web Popup Login
        console.log("AuthContext: Starting web signInWithPopup...");
        
        let signInWithPopupFunc;
        if (webAuthModule) {
          signInWithPopupFunc = webAuthModule.signInWithPopup;
        } else {
          // Fallback if not pre-loaded yet
          const { signInWithPopup } = await import('firebase/auth');
          signInWithPopupFunc = signInWithPopup;
        }

        const provider = new GoogleAuthProvider();
        userCredential = await signInWithPopupFunc(auth, provider);
      }

      setLoading(false);
      return userCredential.user;
    } catch (error) {
      console.error("AuthContext: Error with Google login:", error);
      setLoading(false);
      return null;
    }
  }, [handleInitializeSocial, isSocialInitialized]);


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
