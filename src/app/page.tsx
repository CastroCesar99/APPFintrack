
'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, PaymentMethodName, DisplayPaymentMethod, CustomPaymentMethodData, CategoryName } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch, type Unsubscribe } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons"; // Correct import for CategoryIcon
import { Package, Wallet } from "lucide-react"; // Correct import for Package and Wallet
import { useDateNavigation } from '@/context/date-navigation-context';
import { useLanguage } from '@/context/language-context';
import { 
  format as formatDateFns, 
  parse as parseDateFns, 
  getYear as getYearFns, 
  getMonth as getMonthFns, 
  getDate as getDateFns,
  startOfMonth, 
  endOfMonth, 
  addMonths,
  setDate as setDateFnsDate,
  differenceInCalendarMonths,
  isWithinInterval,
  lastDayOfMonth,
  parseISO as parseISODateFns
} from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  
  const [userCategories, setUserCategories] = useState<DisplayCategory[]>([]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  
  const [loadedBudgetsForMonth, setLoadedBudgetsForMonth] = useState<Record<string, number> | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);
  
  const [isClient, setIsClient] = useState(false);
  const effectMountedRef = useRef(true); 
  const mainFetchInitiatedForUser = useRef<string | null>(null);
  const unsubscribeTransactionsRef = useRef<Unsubscribe | null>(null);
  const unsubscribePreferencesRef = useRef<Unsubscribe | null>(null);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);
  
  console.log("DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection:", displayedDate.toISOString());

  const cleanupListener = useCallback((listenerRef: React.MutableRefObject<Unsubscribe | null>, type: string, currentUserIdForCleanup?: string | null) => {
    if (listenerRef.current && typeof listenerRef.current === 'function') {
      console.log("DashboardPage: TRACER --- cleanupListener: Unsubscribing " + type + " for UserID:", currentUserIdForCleanup || "N/A");
      listenerRef.current();
      listenerRef.current = null;
    } else {
      console.log("DashboardPage: TRACER --- cleanupListener: No snapshot to unsubscribe for " + type + " or ref is not a function for UserID:", currentUserIdForCleanup || "N/A");
    }
  }, []);

  useEffect(() => {
    console.log("DashboardPage: TRACER --- isClient useEffect running");
    setIsClient(true);
    effectMountedRef.current = true; 
    const currentUserIdForCleanupOnUnmount = mainFetchInitiatedForUser.current; 

    return () => {
      effectMountedRef.current = false; 
      console.log("DashboardPage: TRACER --- Main useEffect (isClient) UNMOUNTING/CLEANUP for UserID:", currentUserIdForCleanupOnUnmount);
      cleanupListener(unsubscribeTransactionsRef, "transactions on unmount", currentUserIdForCleanupOnUnmount);
      cleanupListener(unsubscribePreferencesRef, "preferences on unmount", currentUserIdForCleanupOnUnmount);
    };
  }, [cleanupListener]); 

  // Listener for User Preferences
  useEffect(() => {
    const currentUserId = userId; 
    if (!isClient || authLoading || !currentUserId) {
      if (effectMountedRef.current) {
        const defaultCats: DisplayCategory[] = [...CATEGORIES];
        const defaultPms: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        setUserCategories(defaultCats.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(defaultPms.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        if (isLoadingPreferences) setIsLoadingPreferences(false);
      }
      cleanupListener(unsubscribePreferencesRef, "preferences (no user/auth/client or effect unmounted)", currentUserId);
      return;
    }

    if (effectMountedRef.current && !isLoadingPreferences) setIsLoadingPreferences(true);
    console.log("DashboardPage: TRACER --- Setting up preferences listener for UserID:", currentUserId);
    const preferencesDocRef = doc(db, 'users', currentUserId, 'preferences/userPreferences');
    
    cleanupListener(unsubscribePreferencesRef, "preferences (before new listener)", currentUserId);

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences snapshot received, but component unmounted for UserID:", currentUserId);
        return;
      }
      
      let finalCategories: DisplayCategory[] = []; 
      let finalPaymentMethods: DisplayPaymentMethod[] = []; 
      const predefinedCategoriesArray: DisplayCategory[] = [...CATEGORIES];
      const predefinedPaymentMethodsArray: DisplayPaymentMethod[] = [...PAYMENT_METHODS];

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        console.log("DashboardPage: TRACER --- Preferences loaded:", prefsData);
        
        // Process Categories
        const userDefinedCategoriesFromPrefs: CustomCategoryData[] = prefsData.userDefinedCategories || [];
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        const customCategoriesMap = new Map<string, CustomCategoryData>();
        userDefinedCategoriesFromPrefs.forEach(cc => customCategoriesMap.set(cc.name.toLowerCase(), cc));

        finalCategories = predefinedCategoriesArray
          .map(predefCat => {
            const customOverride = customCategoriesMap.get(predefCat.name.toLowerCase());
            if (customOverride) {
              customCategoriesMap.delete(predefCat.name.toLowerCase()); 
              return { ...predefCat, ...customOverride }; 
            }
            return predefCat;
          })
          .filter(cat => !deselectedPredefinedCatNames.has(cat.name.toLowerCase()));
        
        customCategoriesMap.forEach(customCat => {
          if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
            finalCategories.push(customCat);
          }
        });
        if (finalCategories.length === 0 && predefinedCategoriesArray.length > 0) {
           finalCategories = [...predefinedCategoriesArray.filter(cat => !deselectedPredefinedCatNames.has(cat.name.toLowerCase()))];
           if(finalCategories.length === 0) finalCategories = [...predefinedCategoriesArray];
        }

        // Process Payment Methods
        const userDefinedPaymentMethodsFromPrefs: CustomPaymentMethodData[] = prefsData.userDefinedPaymentMethods || [];
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        const customPaymentMethodsMap = new Map<string, CustomPaymentMethodData>();
        userDefinedPaymentMethodsFromPrefs.forEach(customPm => customPaymentMethodsMap.set(customPm.name.toLowerCase(), customPm));

        finalPaymentMethods = predefinedPaymentMethodsArray
          .map(predefPm => {
            const customOverride = customPaymentMethodsMap.get(predefPm.name.toLowerCase());
            if (customOverride) {
              customPaymentMethodsMap.delete(predefPm.name.toLowerCase());
              return { ...predefPm, ...customOverride };
            }
            return predefPm;
          })
          .filter(pm => !deselectedPredefinedPmNames.has(pm.name.toLowerCase()));

        customPaymentMethodsMap.forEach(customPm => {
          if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customPm.name.toLowerCase())) {
            finalPaymentMethods.push(customPm);
          }
        });
        if (finalPaymentMethods.length === 0 && predefinedPaymentMethodsArray.length > 0) {
            finalPaymentMethods = [...predefinedPaymentMethodsArray.filter(pm => !deselectedPredefinedPmNames.has(pm.name.toLowerCase()))];
            if(finalPaymentMethods.length === 0) finalPaymentMethods = [...predefinedPaymentMethodsArray];
        }

      } else { 
         console.log("DashboardPage: TRACER --- No preferences document found for UserID:", currentUserId);
         finalCategories = [...predefinedCategoriesArray];
         finalPaymentMethods = [...predefinedPaymentMethodsArray];
      }
      
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items");
      }
    }, (error) => {
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: TRACER --- Error listening to user preferences for UserID:", currentUserId, error);
      toast({ title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }), description: translate({en: "Could not load your settings.", pt: "Não foi possível carregar suas configurações."}), variant: "destructive" });
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)))); 
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)))); 
        setIsLoadingPreferences(false);
      }
    });
    return () => cleanupListener(unsubscribePreferencesRef, "preferences (cleanup)", currentUserId);
  }, [userId, isClient, authLoading, language, toast, translate, cleanupListener]);

  // Main useEffect for fetching transactions and user onboarding status
  useEffect(() => {
    const currentUserId = userId;
    console.log("Dashboard: TRACER --- Main useEffect START. UserID:", currentUserId, ", AuthLoading:", authLoading, ", isClient:", isClient, ", InitiatedFor:", mainFetchInitiatedForUser.current, ", isLoadingTransactions:", isLoadingTransactions);

    if (!isClient) {
      console.log("Dashboard: TRACER --- Main useEffect: Not client yet, waiting.");
      return;
    }
    if (authLoading) {
      console.log("Dashboard: TRACER --- Main useEffect: Auth is loading, waiting...");
      // Don't set isLoadingTransactions to false here yet, wait for auth to resolve.
      return;
    }
    if (!currentUserId) {
      console.log("Dashboard: TRACER --- Main useEffect: No user ID, redirecting to login. Setting all loading false.");
      if (effectMountedRef.current) {
        setIsLoadingTransactions(false); 
        setIsLoadingPreferences(false); 
        setIsLoadingBudgets(false); 
      }
      router.push('/login');
      return;
    }
     if (user && !user.emailVerified) {
      console.log("Dashboard: TRACER --- Main useEffect: User email not verified, redirecting. Setting all loading false.");
      if(effectMountedRef.current) {
        setIsLoadingTransactions(false);
        setIsLoadingPreferences(false);
        setIsLoadingBudgets(false);
      }
      router.push('/verify-email');
      return;
    }

    if (mainFetchInitiatedForUser.current !== currentUserId || !unsubscribeTransactionsRef.current) {
      console.log("Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID:", currentUserId, ". PrevInitiatedFor:", mainFetchInitiatedForUser.current, ". ListenerExisted:", !!unsubscribeTransactionsRef.current);
      cleanupListener(unsubscribeTransactionsRef, "transactions (stale before new)", mainFetchInitiatedForUser.current); 
      mainFetchInitiatedForUser.current = currentUserId; 
      
      const fetchDataInternal = async (targetUserId: string) => {
        if (!effectMountedRef.current) {
          console.log("Dashboard: TRACER --- fetchDataInternal: Component unmounted before starting for UserID:", targetUserId);
          if (effectMountedRef.current && isLoadingTransactions) setIsLoadingTransactions(false); 
          return;
        }
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", targetUserId);
        if (effectMountedRef.current) setIsLoadingTransactions(true); 
        console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", targetUserId);
        
        try {
          const userDocRef = doc(db, "users", targetUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Component unmounted after getDoc for UserID:", targetUserId);
             if (effectMountedRef.current && isLoadingTransactions) setIsLoadingTransactions(false);
            return;
          }

          if (!userDocSnap.exists() || !userDocSnap.data()?.onboardingComplete) {
            if (effectMountedRef.current) {
              console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding not complete or doc doesn't exist for UserID:", targetUserId, ". Redirecting to onboarding.");
              setIsLoadingTransactions(false); // Ensure loading is false before redirect
              setIsLoadingPreferences(false); // Also related to user data
              setIsLoadingBudgets(false); // Also related to user data
              router.push('/onboarding'); 
            }
            return;
          }
          console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding complete for UserID:", targetUserId, ". Setting up onSnapshot listener for transactions.");
          
          const transactionsColRef = collection(db, 'users', targetUserId, 'transactions');
          const q_transactions = query(transactionsColRef); 
          
          if (unsubscribeTransactionsRef.current) { 
            console.log("Dashboard: TRACER --- fetchDataInternal: Stale transaction snapshot ref found before new onSnapshot. Cleaning up again for UserID:", targetUserId);
            unsubscribeTransactionsRef.current(); 
            unsubscribeTransactionsRef.current = null;
          }

          unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
            if (!effectMountedRef.current) {
                console.log("Dashboard: TRACER --- Transaction onSnapshot: Received data, but component unmounted for UserID:", targetUserId);
                return;
            }
            console.log("Dashboard: TRACER --- Transaction onSnapshot: Received data for UserID:", targetUserId, ". Empty:", querySnapshot.empty, "PendingWrites:", querySnapshot.metadata.hasPendingWrites);
            const fetchedTransactions = querySnapshot.docs.map(docSnap => {
              const data = docSnap.data();
              let dateString = "1970-01-01"; 
              let effectiveMonthString = data.effectiveMonth;

              // Date processing
              if (data.date) {
                if (data.date instanceof Timestamp) {
                  dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
                } else if (typeof data.date === 'string') {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) { 
                    dateString = data.date; 
                  } else if (data.date.includes('T')) {
                    try { 
                      dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
                    } catch (e1){ 
                      try { 
                        dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                      } catch (e2){
                        console.warn("DashboardPage TX Date Parse (string T general for " + String(docSnap.id) + "): Failed for date '" + String(data.date) + "'. Error: " + String(e2) + ". Fallback to current date.");
                        dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                      }
                    }
                  } else { 
                    console.warn("DashboardPage TX Date Parse (string other for " + String(docSnap.id) + "): Date was '" + String(data.date) + "'. Attempting general parse.");
                    try {
                      dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                    } catch (e){
                      console.warn("DashboardPage TX Date Parse (string other general for " + String(docSnap.id) + "): Failed. Error: " + String(e) + ". Fallback to current date.");
                      dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                    }
                  }
                } else { 
                   console.warn("DashboardPage TX Date Parse (missing/invalid for " + String(docSnap.id) + "): Date was '" + String(data.date) + "'. Fallback to current date.");
                   dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                }
              } else {
                 console.warn("DashboardPage TX Date Parse (missing for " + String(docSnap.id) + "). Fallback to current date.");
                 dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }

              // EffectiveMonth processing
              if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
                 if (dateString && dateString !== "1970-01-01") { 
                    try {
                        effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                    } catch (e) {
                        console.warn("DashboardPage TX effectiveMonth Derivation: Failed for tx " + String(docSnap.id) + " from date " + dateString + ". Error: " + String(e) + ". Fallback to current month.");
                        effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                    }
                 } else {
                    console.warn("DashboardPage TX effectiveMonth Derivation: Date string invalid or missing for tx " + String(docSnap.id) + ". Fallback to current month.");
                    effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                 }
              }
              return { 
                  ...data, 
                  id: docSnap.id, 
                  date: dateString, 
                  effectiveMonth: effectiveMonthString, 
                  isRecurring: data.isRecurring === true,
                  expenseType: data.expenseType,
                  installments: data.installments,
                  expenseNature: data.expenseNature
              } as Transaction;
            });
            if (effectMountedRef.current) {
              console.log("Dashboard: TRACER --- Transaction onSnapshot: Setting " + fetchedTransactions.length + " transactions for UserID:", targetUserId);
              setAllTransactions(fetchedTransactions);
              setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) after processing snapshot data for UserID:", targetUserId);
            }
          }, (error: any) => {
            if (!effectMountedRef.current) {
              console.log("Dashboard: TRACER --- Transaction onSnapshot error, but component unmounted for UserID:", targetUserId);
              return;
            }
            console.error("DashboardPage: TRACER --- Transaction onSnapshot: Error listening for UserID:", targetUserId, error);
            toast({ title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }), description: translate({en: "Could not load transactions.", pt: "Não foi possível carregar as transações."}), variant: "destructive" });
            if (effectMountedRef.current) {
              setAllTransactions([]);
              setIsLoadingTransactions(false);
            }
          });
        } catch (error) {
          if (!effectMountedRef.current) {
             console.log("Dashboard: TRACER --- fetchDataInternal: Error, but component unmounted for UserID:", targetUserId);
            if(effectMountedRef.current && isLoadingTransactions) setIsLoadingTransactions(false); 
            return;
          }
          console.error("DashboardPage: TRACER --- fetchDataInternal: Error for UserID:", targetUserId, error);
          toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({en: "An error occurred loading data.", pt: "Ocorreu um erro ao carregar os dados."}), variant: "destructive" });
          if (effectMountedRef.current) {
            setAllTransactions([]);
            setIsLoadingTransactions(false); 
          }
        }
      };
      fetchDataInternal(currentUserId);
    } else {
        console.log("Dashboard: TRACER --- Main useEffect: Fetch already initiated for this user or listener exists. CurrentUser:", currentUserId, "mainFetchInitiatedForUser:", mainFetchInitiatedForUser.current, "ListenerExists:", !!unsubscribeTransactionsRef.current);
        if(effectMountedRef.current && isLoadingTransactions) { 
            // This case is tricky: if the effect re-runs due to other dep changes but fetch shouldn't happen,
            // ensure loading is false if it was true for some reason.
            // However, if a fetch for this user IS in progress, this could prematurely set it to false.
            // The `mainFetchInitiatedForUser` and `!unsubscribeTransactionsRef.current` checks should handle this.
        }
    }
    // Cleanup function for the main useEffect
    return () => {
      console.log("Dashboard: TRACER --- Main useEffect FULL CLEANUP for UserID:", currentUserId);
      cleanupListener(unsubscribeTransactionsRef, "transactions (main effect cleanup)", currentUserId);
    };
  }, [userId, authLoading, isClient, router, toast, translate, cleanupListener]); // Dependencies for main data fetching effect

  const loadBudgets = useCallback(async () => {
    const currentUserId = userId; // Use userId from the outer scope
    if (!effectMountedRef.current || !currentUserId || !isClient || authLoading ) {
      if (effectMountedRef.current) {
        setLoadedBudgetsForMonth(null); 
        if (isLoadingBudgets) setIsLoadingBudgets(false); 
      }
      return;
    }
    
    if (effectMountedRef.current && !isLoadingBudgets) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log("Dashboard: TRACER --- Loading budgets for user " + currentUserId + ", month: " + budgetMonthKey);
    const budgetDocRef = doc(db, 'users/' + currentUserId + '/budgets/' + budgetMonthKey);
    
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) { 
        if(effectMountedRef.current && isLoadingBudgets) setIsLoadingBudgets(false);
        return; 
      }
      if (docSnap.exists()) {
        const budgetData = docSnap.data();
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (key !== 'lastUpdated' && Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        if (effectMountedRef.current) setLoadedBudgetsForMonth(validBudgets);
      } else {
        if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
      }
    } catch (error) {
      if (!effectMountedRef.current) {
         if(effectMountedRef.current && isLoadingBudgets) setIsLoadingBudgets(false);
         return;
      }
      console.error("Dashboard: TRACER --- Error loading budgets for UserID:", currentUserId, "Month:", budgetMonthKey, error);
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({en: "Could not load your budget data for this month.", pt: "Não foi possível carregar seus dados de orçamento para este mês."}), variant: "destructive" });
      if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
    } finally {
      if (effectMountedRef.current && isLoadingBudgets) setIsLoadingBudgets(false);
    }
  }, [userId, isClient, authLoading, displayedDate, toast, translate, isLoadingBudgets]); 

  useEffect(() => {
    console.log("Dashboard: TRACER --- useEffect for loadBudgets. UserID:", userId, "isClient:", isClient, "AuthLoading:", authLoading);
    if (userId && isClient && !authLoading) { 
        loadBudgets();
    } else if (effectMountedRef.current && isLoadingBudgets) { 
        console.log("Dashboard: TRACER --- useEffect for loadBudgets: Conditions not met, ensuring budgets loading is false.");
        setLoadedBudgetsForMonth(null); 
        setIsLoadingBudgets(false); 
    }
  }, [userId, isClient, authLoading, displayedDate, loadBudgets]);


 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    const currentUserId = userId; 
    if (!currentUserId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    
    // The date from the form is already YYYY-MM-DD string
    const transactionActualDate = newTransactionData.date; 
    // Effective month is based on the month currently being viewed on the dashboard
    const effectiveMonthForSave = formatDateFns(displayedDate, "yyyy-MM"); 
    
    console.log("DashboardPage TRACER --- onAddTransaction: Received date from form:", transactionActualDate);
    
    const fullPayload = {
      ...newTransactionData,
      date: transactionActualDate, 
      effectiveMonth: effectiveMonthForSave, 
      userId: currentUserId,
      createdAt: serverTimestamp(),
    };

    const dataToSave = Object.fromEntries(
      Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;
    
    // Ensure isRecurring is explicitly false if not otherwise set (especially for upfront/installment expenses)
    if (dataToSave.type === 'expense') {
      if (dataToSave.expenseType === 'recurring') {
        dataToSave.isRecurring = true;
      } else {
        dataToSave.isRecurring = false; // Explicitly false for upfront or installment
      }
    } else { // income
      dataToSave.isRecurring = dataToSave.isRecurring ?? false;
    }
    
    console.log("DashboardPage TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "and effectiveMonth:", dataToSave.effectiveMonth);
    console.log("DashboardPage TRACER --- onAddTransaction: Full dataToSave:", JSON.stringify(dataToSave, null, 2));
    console.log("DashboardPage TRACER --- onAddTransaction: Full newTransactionData from form:", JSON.stringify(newTransactionData, null, 2));


    try {
      const transactionsColRef = collection(db, 'users', currentUserId, 'transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: newTransactionData.description + " " + translate({en:"added.", pt:"adicionada."})});
    } catch (error: any) {
      console.error("Dashboard: TRACER --- onAddTransaction: Error adding transaction for UserID:", currentUserId, error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({en:"Could not save your transaction.", pt: "Não foi possível salvar sua transação."})), variant: "destructive" });
    }
  }, [userId, displayedDate, toast, translate]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year:", getYearFns(displayedDate), "Month:", getMonthFns(displayedDate), "(0-indexed for", displayedMonthYearLabel, "), TargetEffMonth:", targetEffectiveMonth, "All transactions count:", allTransactions.length);

    if (allTransactions.length === 0) {
      console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
      return [];
    }
    
    const filtered: Transaction[] = [];
    allTransactions.forEach(t => {
      let includeTransaction = false;
      let reason = "N/A";
      let originalTransactionDate: Date;
      
      try {
        originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
      } catch (e) {
        console.warn("Dashboard: TRACER --- Tx Filter: Could not parse t.date '" + String(t.date) + "' for tx ID " + String(t.id) + ". Error:", e);
        return; 
      }
      
      // Handle installments
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        reason = "Installment Check";
        // For summaries, an installment applies if its effectiveMonth is the start of the series,
        // AND the current displayedDate is within the installment period.
        const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        const monthDiffFromEffectiveStart = differenceInCalendarMonths(firstDayOfTargetMonth, startOfMonth(firstImpactMonthDate));
        const isInstallmentActiveThisMonth = monthDiffFromEffectiveStart >= 0 && monthDiffFromEffectiveStart < t.installments;
        
        if (isInstallmentActiveThisMonth) {
          includeTransaction = true;
        }
      } 
      // Handle generic recurring (non-installment)
      else if (t.isRecurring === true && t.expenseType !== 'installment') { 
        reason = "Recurring Check";
        // For summaries, a recurring item applies if its effectiveMonth is on or before the current displayed month
        const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        if (startOfMonth(firstImpactMonthDate) <= firstDayOfTargetMonth) {
          includeTransaction = true;
        }
      } 
      // Handle non-recurring, non-installment
      else { 
        reason = "Non-Recurring Check";
        if (t.effectiveMonth === targetEffectiveMonth) { 
          includeTransaction = true;
        }
      }
      console.log("Dashboard: TRACER --- Tx Filter: ID:", t.id, "Date:", t.date, "EffMonth:", t.effectiveMonth, "Type:", t.type, "ExpType:", t.expenseType, "isRec:", t.isRecurring, "Inst:", t.installments, "Amount:", t.amount, "Included:", includeTransaction, "Reason:", reason, "Target:", targetEffectiveMonth);
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Found", filtered.length, "transactions for the period.");
    return filtered;
  }, [allTransactions, displayedDate, displayedMonthYearLabel]); 


  const totalIncomeForSummary = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalExpensesForSummary = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);
  
  const largestExpenseCategoryForDisplayedPeriod = useMemo(() => {
    const expensesThisPeriod = transactionsForDisplayedPeriod.filter(t => t.type === 'expense');
    if (expensesThisPeriod.length === 0) return null;

    const expensesByCategory: Record<string, number> = {};
    expensesThisPeriod.forEach(tx => { 
      const categoryName = tx.category as string; 
      expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + tx.amount; 
    });

    let maxAmount = 0; 
    let largestCategoryKey: string | null = null;
    for (const key in expensesByCategory) { 
      if (expensesByCategory[key] > maxAmount) { 
        maxAmount = expensesByCategory[key]; 
        largestCategoryKey = key; 
      } 
    }

    if (largestCategoryKey) {
      let categoryDetail: DisplayCategory | undefined = userCategories.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase());
      if (!categoryDetail) { 
          categoryDetail = CATEGORIES.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase()) || 
                           { 
                             name: largestCategoryKey!, 
                             type: 'expense', 
                             icon: 'CircleHelp', 
                             label: { en: largestCategoryKey!, pt: largestCategoryKey! } 
                           };
      }
      return { ...categoryDetail, amount: maxAmount } as DisplayCategory & { amount: number };
    }
    return null;
  }, [transactionsForDisplayedPeriod, userCategories, language]); 

  const totalFixedExpensesForDisplayedPeriod = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === 'expense' && t.expenseNature === 'fixed').reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalVariableExpensesForDisplayedPeriod = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === 'expense' && t.expenseNature === 'variable').reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalCalculatedMonthlyBudget = useMemo(() => {
    if (!loadedBudgetsForMonth) return 0;
    return Object.values(loadedBudgetsForMonth).reduce((sum, budget) => sum + (budget || 0), 0);
  }, [loadedBudgetsForMonth]);


 const fullRecentIncomeList = useMemo(() => {
    console.log("Dashboard: TRACER --- recentIncome: Calculating for", displayedMonthYearLabel, ". Total transactions in allTransactions:", allTransactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    allTransactions.forEach(t => {
      if (t.type !== 'income') return;
      
      try {
        // Non-recurring income for the current effectiveMonth
        if (!t.isRecurring && t.effectiveMonth === targetEffectiveMonth) {
          console.log("Dashboard: TRACER --- recentIncome: Adding non-recurring:", t.description, "Date:", t.date, "EffMonth:", t.effectiveMonth);
          monthlyDisplayTransactions.push(t);
        } 
        // Recurring income
        else if (t.isRecurring) {
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          const firstImpactMonthForRecurrence = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));

          if (startOfMonth(firstImpactMonthForRecurrence) <= firstDayOfDisplayedMonth) {
            const originalDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, originalDay);
            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== originalDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(originalDay, getDateFns(lastDayOfCurrentMonth)));
            }
            const projectedDateForDisplayString = formatDateFns(projectedDate, "yyyy-MM-dd");
            
            console.log("Dashboard: TRACER --- recentIncome: Added projected recurring:", t.description, "Orig Date:", t.date, "Orig EffMonth:", t.effectiveMonth, "Projected Date:", projectedDateForDisplayString);
            monthlyDisplayTransactions.push({
              ...t,
              date: projectedDateForDisplayString, 
              id: `${t.id}_proj_${targetEffectiveMonth}` 
            });
          }
        }
      } catch(e) {
        console.error("DashboardPage: TRACER --- Error processing transaction", t.id, "in fullRecentIncomeList:", e, t);
      }
    });
    const sorted = monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log("Dashboard: TRACER --- recentIncome: Found", sorted.length, "items for display.");
    return sorted;
  }, [allTransactions, displayedDate, displayedMonthYearLabel, language, translate]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0, 5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    console.log("Dashboard: TRACER --- recentExpenses: Calculating for", displayedMonthYearLabel, ". Total transactions in allTransactions:", allTransactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    allTransactions.forEach(t => {
      if (t.type !== 'expense') return;
      let currentDescription = t.description;
      
      try {
        // Installment expenses
        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          const firstImpactMonthForInstallment = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0)); 
          const monthDiffFromEffectiveStart = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(firstImpactMonthForInstallment));
          const currentInstallmentNum = monthDiffFromEffectiveStart + 1;

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            currentDescription = `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`;
            console.log("Dashboard: TRACER --- recentExpenses: Added projected installment:", currentDescription, "Orig Date:", t.date, "Orig EffMonth:", t.effectiveMonth, "Display Date:", t.date); // Display original date
            monthlyDisplayTransactions.push({ 
              ...t, 
              date: t.date, // Display original date for installments
              description: currentDescription, 
              id: `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}` 
            });
          }
        } 
        // Generic recurring expenses (non-installment)
        else if (t.isRecurring && t.expenseType !== 'installment') { 
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          const firstImpactMonthForRecurrence = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));

          if (startOfMonth(firstImpactMonthForRecurrence) <= firstDayOfDisplayedMonth) {
             console.log("Dashboard: TRACER --- recentExpenses: Added projected recurring:", t.description, "Orig Date:", t.date, "Orig EffMonth:", t.effectiveMonth, "Display Date:", t.date); // Display original date
            monthlyDisplayTransactions.push({ 
              ...t, 
              date: t.date, // Display original date
              id: `${t.id}_proj_${targetEffectiveMonth}` 
            });
          }
        } 
        // Non-recurring, non-installment expenses
        else if (!t.isRecurring && t.expenseType !== 'installment' && t.effectiveMonth === targetEffectiveMonth) {
          console.log("Dashboard: TRACER --- recentExpenses: Added non-recurring:", t.description, "Date:", t.date, "EffMonth:", t.effectiveMonth);
          monthlyDisplayTransactions.push(t);
        }
      } catch (e) {
        console.error("DashboardPage: TRACER --- Error processing transaction", t.id, "in fullRecentExpensesList:", e, t);
      }
    });
    const sorted = monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log("Dashboard: TRACER --- recentExpenses: Found", sorted.length, "items for display.");
    return sorted;
  },[allTransactions, displayedDate, displayedMonthYearLabel, language, translate]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);

  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;
  
  console.log("Dashboard: TRACER --- RENDERING. OverallLoading:", overallLoading, "isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions, "isLoadingPreferences:", isLoadingPreferences, "isLoadingBudgets:", isLoadingBudgets);
  console.log("Dashboard: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);


  if (overallLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full p-4">
          <div className="space-y-4 w-full">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={`summary-skel-${i}`} className="h-24 w-full rounded-lg" />)}
            </div>
             <Card className="shadow-lg bg-background dark:bg-card rounded-lg">
                <CardHeader className="flex flex-col items-center text-center p-4 md:p-6">
                  <div className="text-xl font-medium leading-none tracking-tight text-foreground">
                       <Skeleton className="h-6 w-1/2 mb-2"/>
                  </div>
                  <CardDescription className="mt-1">
                      <Skeleton className="h-4 w-3/4"/>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={`spending-sum-skel-${i}`} className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                      <div className="text-sm font-medium text-foreground mb-1 break-words">
                         <Skeleton className="h-5 w-3/5 mb-2"/>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Skeleton className="h-7 w-7 rounded-full"/>
                         <Skeleton className="h-5 w-4/5 mb-1"/>
                      </div>
                      <div className="text-xl font-bold text-primary mt-1">
                        <Skeleton className="h-7 w-2/5"/>
                      </div>
                    </div>
                  ))}
                </div>
                </CardContent>
              </Card>
            <Card className="shadow-md bg-muted/50 rounded-lg">
                <CardHeader className="p-4 md:p-6"><Skeleton className="h-6 w-1/4"/></CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Skeleton className="h-10 w-full rounded-md"/><Skeleton className="h-10 w-full rounded-md"/><Skeleton className="h-10 w-full rounded-md"/>
                  </div>
                </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-60 w-full rounded-lg" />
              <Skeleton className="h-60 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions:", allTransactions.length, "isLoadingTransactions:", isLoadingTransactions, "Displayed Period Transactions:", transactionsForDisplayedPeriod.length);
  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        <SummarySection
          totalIncomeThisPeriod={totalIncomeForSummary}
          totalExpensesThisPeriod={totalExpensesForSummary}
          monthlyBudget={totalCalculatedMonthlyBudget}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />
        
        <Card className="shadow-lg bg-background dark:bg-card rounded-lg">
          <CardHeader className="flex flex-col items-center text-center p-4 md:p-6">
            <div className="text-xl font-medium leading-none tracking-tight text-foreground">
              {translate({ en: "Spending Summary", pt: "Resumo de Gastos" })}
            </div>
            <CardDescription className="mt-1">
              {translate({ en: "Your spending breakdown for", pt: "Seu detalhamento de gastos em" })} {displayedMonthYearLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            {transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                  <p className="text-sm font-medium text-foreground mb-1 break-words">
                    {translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}
                  </p>
                  {largestExpenseCategoryForDisplayedPeriod ? (
                    <>
                      <div className="flex items-center gap-2 mt-1">
                        <CategoryIcon iconName={largestExpenseCategoryForDisplayedPeriod.icon} className="h-7 w-7 text-primary" />
                        <span className="font-semibold text-lg text-foreground break-words">
                          {getCategoryDisplayLabel(largestExpenseCategoryForDisplayedPeriod, language)}
                        </span>
                      </div>
                      <p className="text-xl font-bold text-primary mt-1">
                        {formatCurrency(largestExpenseCategoryForDisplayedPeriod.amount)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">{translate({ en: "N/A", pt: "N/D"})}</p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                  <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Total Fixed", pt: "Total de Gastos" })}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Package className="h-7 w-7 text-primary" />
                    <span className="font-semibold text-lg text-foreground">
                      {translate({ en: "Fixed", pt: "Fixos" })}
                    </span>
                  </div>
                  <p className="text-xl font-bold text-primary mt-1">
                    {formatCurrency(totalFixedExpensesForDisplayedPeriod)}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                   <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Total Variable", pt: "Total de Gastos" })}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Wallet className="h-7 w-7 text-primary" />
                    <span className="font-semibold text-lg text-foreground">
                      {translate({ en: "Variable", pt: "Variáveis" })}
                    </span>
                  </div>
                  <p className="text-xl font-bold text-primary mt-1">
                    {formatCurrency(totalVariableExpensesForDisplayedPeriod)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[100px]">
                <p className="text-muted-foreground">
                  {translate({
                    en: "No expense data for this period.",
                    pt: "Sem dados de despesa para este período."
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <QuickActionsSection
          onSave={onAddTransaction} 
          currentDisplayedDate={displayedDate}
          userCategories={userCategories} 
          userPaymentMethods={userPaymentMethods} 
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecentTransactionsSection
            title={translate({ en: "Recent Income", pt: "Receitas Recentes" })}
            description={`${translate({ en: "Your latest income entries for", pt: "Suas últimas entradas de receita para" })} ${displayedMonthYearLabel}`}
            transactions={recentIncomeToDisplay}
            allUserCategories={userCategories}
            type="income"
            onSeeMore={() => setShowAllRecentIncome(prev => !prev)}
            isExpanded={showAllRecentIncome}
            totalItemsForMonth={fullRecentIncomeList.length}
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={`${translate({ en: "Your latest expense entries for", pt: "Suas últimas entradas de despesa para" })} ${displayedMonthYearLabel}`}
            transactions={recentExpensesToDisplay}
            allUserCategories={userCategories}
            type="expense"
            onSeeMore={() => setShowAllRecentExpenses(prev => !prev)}
            isExpanded={showAllRecentExpenses}
            totalItemsForMonth={fullRecentExpensesList.length}
          />
        </div>
      </div>
    </AppLayout>
  );
}

    