
'use client';
import React from 'react'; // Keep React import
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, DisplayPaymentMethod, CustomPaymentMethodData, CategoryName } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel, PAYMENT_METHODS, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch, updateDoc, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons"; 
import { Package, Wallet } from "lucide-react"; 
import { useDateNavigation } from '@/context/date-navigation-context';
import { useLanguage } from '@/context/language-context';
import {
  format as formatDateFns,
  parse as parseDateFns,
  getYear as getYearFns,
  getMonth as getMonthFns,
  getDate as getDateFns,
  parseISO as parseISODateFns,
  startOfMonth,
  endOfMonth,
  addMonths,
  setDate as setDateFnsDate,
  differenceInCalendarMonths,
  isWithinInterval,
  lastDayOfMonth
} from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';


export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();

  console.log("DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection:", displayedDate.toISOString());

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  
  const [isClient, setIsClient] = useState(false);
  const [loadedBudgetsForMonth, setLoadedBudgetsForMonth] = useState<Record<string, number> | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);

  const [userCategories, setUserCategories] = useState<DisplayCategory[]>(() => [...CATEGORIES]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>(() => [...PAYMENT_METHODS]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);
  
  const effectMountedRef = useRef(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);


  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
    return () => {
      console.log("Dashboard: TRACER --- isClient useEffect UNMOUNT");
      effectMountedRef.current = false; 
    };
  }, []);

  const cleanupListener = useCallback((listenerRef: React.MutableRefObject<(() => void) | null>, type: string) => {
    if (listenerRef.current) {
      console.log(`Dashboard: TRACER --- cleanupListener: Unsubscribing ${type} for UserID:`, mainFetchInitiatedForUser.current);
      listenerRef.current();
      listenerRef.current = null;
    }
  }, []);

  // Listener for User Preferences
  useEffect(() => {
    if (!effectMountedRef.current) {
      console.log("DashboardPage: TRACER --- Preferences effect early exit: effectMountedRef is false.");
      return;
    }
    if (!userId || !isClient || authLoading) {
      if (effectMountedRef.current) {
        const allPredefinedCategories: DisplayCategory[] = [...CATEGORIES];
        const allPredefinedPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        
        setUserCategories(allPredefinedCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(allPredefinedPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        if (isLoadingPreferences) setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Preferences effect: No user/client/auth. Set default categories/payment methods. isLoadingPreferences set to false.");
      }
      cleanupListener(unsubscribePreferencesRef, "preferences");
      return;
    }

    console.log("DashboardPage: TRACER --- Setting up REAL-TIME listener for user preferences for UserID:", userId);
    if (effectMountedRef.current && !isLoadingPreferences) setIsLoadingPreferences(true);
    
    const preferencesDocRef = doc(db, 'users', userId, 'preferences/userPreferences');
    cleanupListener(unsubscribePreferencesRef, "preferences"); 

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences snapshot received, but effect unmounted for UserID:", userId);
        return;
      }
      console.log("DashboardPage: TRACER --- Preferences snapshot received for UserID:", userId);

      let finalCategories: DisplayCategory[] = [...CATEGORIES]; // Start with all predefined
      let finalPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS]; // Start with all predefined
      
      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        console.log("DashboardPage: TRACER --- Preferences data found for UserID:", userId, "Data:", prefsData);

        const userDefinedCategoriesFromPrefs = prefsData.userDefinedCategories || [];
        const customCategoriesMap = new Map(userDefinedCategoriesFromPrefs.map(cat => [cat.name.toLowerCase(), cat]));
        
        // Merge predefined with custom, custom taking precedence for label/icon
        finalCategories = CATEGORIES.map(pCat => {
          const customOverride = customCategoriesMap.get(pCat.name.toLowerCase());
          return customOverride ? { ...pCat, ...customOverride } : pCat;
        });
        // Add purely custom categories
        userDefinedCategoriesFromPrefs.forEach(udc => {
          if (!finalCategories.some(fc => fc.name.toLowerCase() === udc.name.toLowerCase())) {
            finalCategories.push(udc);
          }
        });
        
        // Apply deselected
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        finalCategories = finalCategories.filter(cat => !deselectedPredefinedCatNames.has(cat.name.toLowerCase()));


        const userDefinedPaymentMethodsFromPrefs = prefsData.userDefinedPaymentMethods || [];
        const customPaymentMethodsMap = new Map(userDefinedPaymentMethodsFromPrefs.map(pm => [pm.name.toLowerCase(), pm]));

        finalPaymentMethods = PAYMENT_METHODS.map(pPm => {
            const customOverride = customPaymentMethodsMap.get(pPm.name.toLowerCase());
            return customOverride ? { ...pPm, ...customOverride } : pPm;
        });
        userDefinedPaymentMethodsFromPrefs.forEach(udpm => {
            if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === udpm.name.toLowerCase())) {
                finalPaymentMethods.push(udpm);
            }
        });
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        finalPaymentMethods = finalPaymentMethods.filter(pm => !deselectedPredefinedPmNames.has(pm.name.toLowerCase()));
        
      } else {
        console.log("DashboardPage: TRACER --- No preferences document found for UserID:", userId, ". Using all predefined categories and payment methods.");
      }
      
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items. isLoadingPreferences set to false.");
      }
    }, (error) => {
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: TRACER --- Error listening to user preferences for UserID:", userId, error);
      toast({
        title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }),
        description: translate({ en: "Could not load your preferences in real-time.", pt: "Não foi possível carregar suas preferências em tempo real." }),
        variant: "destructive",
      });
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)))); 
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)))); 
        setIsLoadingPreferences(false);
      }
    });

    return () => cleanupListener(unsubscribePreferencesRef, "preferences");
  }, [userId, isClient, authLoading, language, toast, translate, cleanupListener]);


 useEffect(() => {
    const fullCleanup = () => {
      console.log("Dashboard: TRACER --- Main useEffect FULL CLEANUP for UserID:", mainFetchInitiatedForUser.current);
      cleanupListener(unsubscribeSnapshotRef, "transactions");
    };

    console.log("Dashboard: TRACER --- Main useEffect START. UserID:", userId, ", AuthLoading:", authLoading, ", isClient:", isClient, ", InitiatedFor:", mainFetchInitiatedForUser.current, ", isLoadingTransactions:", isLoadingTransactions);
    
    if (!isClient) {
      console.log("Dashboard: TRACER --- Main useEffect: Not client yet, waiting.");
      return fullCleanup;
    }
    if (authLoading) {
      console.log("Dashboard: TRACER --- Main useEffect: Auth is loading, waiting...");
      // No need to set isLoadingTransactions here, overallLoading handles authLoading
      return fullCleanup;
    }
    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      if (effectMountedRef.current) {
        setTransactions([]);
        if (isLoadingTransactions) setIsLoadingTransactions(false);
        mainFetchInitiatedForUser.current = null;
        router.push('/login');
      }
      return fullCleanup;
    }

    const fetchDataInternal = async (currentUserId: string) => {
      if (!effectMountedRef.current) {
        console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early for UserID:", currentUserId);
        if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
        return;
      }
      console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

      try {
        const userDocRef = doc(db, "users", currentUserId);
        const userDocSnap = await getDoc(userDocRef);

        if (!effectMountedRef.current) {
          if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false); return;
        }
        if (!userDocSnap.exists()) {
          console.warn("Dashboard: TRACER --- fetchDataInternal: User document NOT FOUND for UserID:", currentUserId, ". Redirecting to onboarding.");
          if (effectMountedRef.current) {
            if (isLoadingTransactions) setIsLoadingTransactions(false);
            router.push('/onboarding');
          }
          return;
        }
        if (!userDocSnap.data().onboardingComplete) {
          console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding NOT complete for UserID:", currentUserId, ". Redirecting to onboarding.");
          if (effectMountedRef.current) {
            if (isLoadingTransactions) setIsLoadingTransactions(false);
            router.push('/onboarding');
          }
          return;
        }
        
        console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener for transactions.");
        
        const transactionsColRef = collection(db, 'users/' + currentUserId + '/transactions');
        const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

        if (unsubscribeSnapshotRef.current) {
            console.warn("Dashboard: TRACER --- fetchDataInternal: Stale transaction snapshot ref found before new onSnapshot. Cleaning up again for UserID:", currentUserId);
            cleanupListener(unsubscribeSnapshotRef, "transactions stale");
        }
        
        unsubscribeSnapshotRef.current = onSnapshot(q_transactions, (querySnapshot) => {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- onSnapshot: Effect unmounted for UserID:", currentUserId, ". Skipping state update.");
            return;
          }
          console.log("Dashboard: TRACER --- onSnapshot: Received data for UserID: " + currentUserId + ". Empty: " + querySnapshot.empty + ", PendingWrites: " + querySnapshot.metadata.hasPendingWrites);

          const fetchedTransactions = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            let dateString = data.date; 
            let effectiveMonthString = data.effectiveMonth;

            if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
              dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
            } else if (typeof data.date === 'string') {
                if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
                    // Already in YYYY-MM-DD
                } else if (data.date.includes('T')) { 
                    try { 
                        dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); 
                    } catch (e1) {
                       try { 
                           dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                       } catch (e2) {
                           console.warn("Dashboard: TRACER --- Failed to parse existing datetime string to yyyy-MM-dd (fallback for " + String(data.date) + "): " + String(e2));
                           dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                       }
                    }
                } else {
                     console.warn("Dashboard: TRACER --- Transaction has unexpected date string format. Attempting general parse. Date was:", data.date, "ID:", docSnap.id);
                     try {
                        dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                     } catch (e) {
                        console.warn("Dashboard: TRACER --- General parse failed for date string. Fallback to current date. Date was:", data.date, "ID:", docSnap.id, e);
                        dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                     }
                }
            } else {
               console.warn("Dashboard: TRACER --- Transaction has missing or non-string/non-Timestamp date. Fallback to current date YYYY-MM-DD. Date was:", data.date, "ID:", docSnap.id);
               dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
            }

            if (dateString && !effectiveMonthString) { 
              try {
                  effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
              } catch (e) {
                  console.warn('DashboardPage: Could not parse date ' + dateString + ' to derive effectiveMonth for tx ' + docSnap.id + '. Defaulting to current month.');
                  effectiveMonthString = formatDateFns(new Date(), "yyyy-MM"); 
              }
            } else if (effectiveMonthString && !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
                console.warn('DashboardPage: Invalid effectiveMonth format for tx ' + docSnap.id + ': ' + effectiveMonthString + '. Attempting to derive from date ' + dateString);
                 try {
                    effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                } catch (e) {
                    console.warn('DashboardPage: Could not re-parse date ' + dateString + ' to derive effectiveMonth for tx ' + docSnap.id + '. Defaulting.');
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
              paymentMethod: data.paymentMethod,
              expenseNature: data.expenseNature
            } as Transaction;
          });

          if (effectMountedRef.current) {
            console.log("Dashboard: TRACER --- onSnapshot: Setting " + fetchedTransactions.length + " transactions for UserID: " + currentUserId + ".");
            setTransactions(fetchedTransactions);
             if (isLoadingTransactions) { 
                setIsLoadingTransactions(false);
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) after processing snapshot data for UserID:", currentUserId);
             }
          }
        }, (error: any) => {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- onSnapshot error callback: Effect unmounted for UserID:", currentUserId);
            return;
          }
          console.error("Dashboard: TRACER --- onSnapshot: Error listening to transactions snapshot for UserID:", currentUserId, error);
          if (effectMountedRef.current) {
            toast({
              title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }),
              description: translate({
                en: "Could not fetch transactions. Please check your connection.",
                pt: "Não foi possível buscar as transações. Verifique sua conexão."
              }) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''),
              variant: "destructive",
            });
            setTransactions([]);
            if (isLoadingTransactions) { 
                setIsLoadingTransactions(false);
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) after onSnapshot error for UserID:", currentUserId);
            }
          }
        });

      } catch (error: any) {
        if (!effectMountedRef.current) {
          if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
          return;
        }
        console.error("Dashboard: TRACER --- fetchDataInternal: Error in main data fetching logic for UserID:", currentUserId, error);
        if (effectMountedRef.current) {
          toast({
            title: translate({ en: "Error", pt: "Erro" }),
            description: translate({ en: "Could not load dashboard data.", pt: "Não foi possível carregar dados do painel." }) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''),
            variant: "destructive",
          });
          setTransactions([]);
          if (isLoadingTransactions) {
            setIsLoadingTransactions(false);
            console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal catch block for UserID:", currentUserId);
          }
        }
      }
    };
    
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log("Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: " + String(userId) + ". PrevInitiatedFor: " + String(mainFetchInitiatedForUser.current) + ". ListenerExisted: " + (!!unsubscribeSnapshotRef.current));
      cleanupListener(unsubscribeSnapshotRef, "transactions before new fetch"); 
      if (effectMountedRef.current && !isLoadingTransactions) {
         setIsLoadingTransactions(true); 
         console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
      }
      mainFetchInitiatedForUser.current = userId;
      if (userId) fetchDataInternal(userId);
    } else {
      console.log("Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: " + String(userId) + ". isLoadingTransactions: " + isLoadingTransactions + ". Snapshot ref present: " + (!!unsubscribeSnapshotRef.current));
       if(effectMountedRef.current && isLoadingTransactions && unsubscribeSnapshotRef.current) {
        // Still waiting for initial snapshot from active listener
      } else if (effectMountedRef.current && isLoadingTransactions && !unsubscribeSnapshotRef.current) {
        console.warn("Dashboard: TRACER --- Main useEffect: isLoadingTransactions is true, but NO snapshot listener is active. Setting loading false for user:", userId);
        if (effectMountedRef.current) setIsLoadingTransactions(false); 
      }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient, router, toast, translate, cleanupListener]);


  const loadBudgets = useCallback(async () => {
    if (!userId || !isClient || !effectMountedRef.current) { 
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false);
      }
      return;
    }
    if(effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log("Dashboard: TRACER --- Loading budgets for user " + String(userId) + ", month: " + budgetMonthKey);
    const budgetDocRef = doc(db, 'users', userId, 'budgets', budgetMonthKey);
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) {
        if (isLoadingBudgets && effectMountedRef.current) setIsLoadingBudgets(false); 
        return;
      }

      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, any>;
        console.log("Dashboard: TRACER --- Budget data found:", JSON.stringify(budgetData));
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (key !== 'lastUpdated' && Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        if (effectMountedRef.current) setLoadedBudgetsForMonth(validBudgets);
      } else {
        console.log("Dashboard: TRACER --- No budget document found for this month.");
        if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
      }
    } catch (error) {
      if (!effectMountedRef.current) {
        if (isLoadingBudgets && effectMountedRef.current) setIsLoadingBudgets(false);
        return;
      }
      console.error("Dashboard: TRACER --- LoadBudgets: Error loading budgets for month:", budgetMonthKey, error);
      if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({ en: "Could not load your budgets for the summary.", pt: "Não foi possível carregar seus orçamentos para o resumo." }), variant: "destructive" });
    } finally {
      if (effectMountedRef.current) setIsLoadingBudgets(false);
    }
  }, [userId, isClient, displayedDate, toast, translate]); 


  useEffect(() => {
    if (userId && isClient && !authLoading) { 
        loadBudgets();
    } else if (effectMountedRef.current) { 
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false);
    }
  }, [userId, isClient, authLoading, displayedDate, loadBudgets]); 

 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    console.log("Dashboard: TRACER --- onAddTransaction: Received date from form:", newTransactionData.date);
    console.log("Dashboard: TRACER --- onAddTransaction: Full newTransactionData from form:", JSON.stringify(newTransactionData));

    const effectiveMonthForNewTx = formatDateFns(parseDateFns(newTransactionData.date, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
    
    const fullPayload = {
      ...newTransactionData,
      userId: userId,
      createdAt: serverTimestamp(),
      effectiveMonth: effectiveMonthForNewTx,
    };
    
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;

    if (dataToSave.type === 'expense' && dataToSave.isRecurring === undefined && dataToSave.expenseType !== 'recurring' && dataToSave.expenseType !== 'installment') {
        dataToSave.isRecurring = false;
    } else if (dataToSave.type === 'income' && dataToSave.isRecurring === undefined) {
        dataToSave.isRecurring = false;
    }
    
    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with date:", newTransactionData.date, "effectiveMonth:", effectiveMonthForNewTx, "Full dataToSave:", dataToSave);

    try {
      const transactionsColRef = collection(db, 'users', userId, 'transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: "" + newTransactionData.description + " " + translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })});
    } catch (error: any) {
      console.error("DashboardPage: Error adding transaction to Firestore:", error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({ en: "Could not add transaction.", pt: "Não foi possível adicionar a transação." })) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''), variant: "destructive" });
    }
  }, [userId, toast, translate]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year:", getYearFns(displayedDate), "Month:", getMonthFns(displayedDate), "(0-indexed for", displayedMonthYearLabel, "), All transactions count:", transactions.length);
    if (transactions.length === 0) {
      console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
      return [];
    }
    
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); 
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    
    let filtered: Transaction[] = [];
    transactions.forEach(t => {
      let includeTransaction = false;
      let reason = "";
      const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));

      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        reason = "Installment Check";
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        // const installmentSeriesEndDate = endOfMonth(addMonths(installmentSeriesStartDate, t.installments - 1));
        // includeTransaction = isWithinInterval(firstDayOfTargetMonth, { start: installmentSeriesStartDate, end: installmentSeriesEndDate });
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        includeTransaction = monthDiff >= 0 && monthDiff < t.installments;
        console.log(`Dashboard: TRACER --- Tx Filter (Installment Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, StartSeries: ${installmentSeriesStartDate.toISOString()}, TargetMonthStart: ${firstDayOfTargetMonth.toISOString()}, monthDiff: ${monthDiff}, installments: ${t.installments}, isActive: ${includeTransaction}, EffMonth: ${t.effectiveMonth}`);
      } else if (t.isRecurring === true && (t.expenseType !== 'installment')) { 
        reason = "Recurring Check";
        const originalTxYear = getYearFns(originalTransactionDate);
        const originalTxMonth = getMonthFns(originalTransactionDate);
        if (originalTxYear < targetYear || (originalTxYear === targetYear && originalTxMonth <= targetMonth)) {
          includeTransaction = true;
        }
        console.log(`Dashboard: TRACER --- Tx Filter (Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, OrigY: ${originalTxYear}, OrigM: ${originalTxMonth}, TargetY: ${targetYear}, TargetM: ${targetMonth}, isActive: ${includeTransaction}, EffMonth: ${t.effectiveMonth}`);
      } else if ((!t.isRecurring || t.isRecurring === false) && t.expenseType !== 'installment') { 
        reason = "Non-Recurring Check";
        if (t.effectiveMonth === targetEffectiveMonth) includeTransaction = true;
         console.log(`Dashboard: TRACER --- Tx Filter (Non-Recurring Check): ID: ${t.id}, DateStr: ${t.date}, EffMonth: ${t.effectiveMonth}, TargetEffMonth: ${targetEffectiveMonth}, Matches: ${includeTransaction}`);
      }
      
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Found", filtered.length, "transactions for the period.");
    return filtered;
  }, [transactions, displayedDate]); 


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
    for (const transaction of expensesThisPeriod) {
      const categoryName = typeof transaction.category === 'string' ? transaction.category : (transaction.category as any).name; 
      expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + transaction.amount;
    }

    let maxAmount = 0;
    let largestCategoryKey: string | null = null;
    for (const categoryKey in expensesByCategory) {
      if (Object.prototype.hasOwnProperty.call(expensesByCategory, categoryKey)) {
        if (expensesByCategory[categoryKey] > maxAmount) {
          maxAmount = expensesByCategory[categoryKey];
          largestCategoryKey = categoryKey;
        }
      }
    }

    if (largestCategoryKey) {
      let categoryDetail = userCategories.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase());
      if (!categoryDetail) { 
         categoryDetail = CATEGORIES.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase()) || 
                          { name: largestCategoryKey!, type: 'expense', icon: 'CircleHelp', label: { en: largestCategoryKey!, pt: largestCategoryKey! } }; 
      }
      
      return {
        ...categoryDetail,
        amount: maxAmount
      } as DisplayCategory & { amount: number };
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
    console.log(`Dashboard: TRACER --- recentIncome: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'income') {
        if (t.isRecurring) {
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          if (startOfMonth(originalTransactionDate) <= firstDayOfDisplayedMonth) {
            const projectedDateDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
            
            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
            }

            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(projectedDate, "yyyy-MM-dd"), 
              id: `${t.id}_proj_${targetEffectiveMonth}` 
            });
            console.log(`Dashboard: TRACER --- recentIncome: Added projected recurring: ${t.description}, OrigDate: ${t.date}, ProjectedDate: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) { 
          monthlyDisplayTransactions.push(t);
          console.log(`Dashboard: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}, EffMonth: ${t.effectiveMonth}`);
        }
      }
    });
    
    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentIncome: Found ${sorted.length} items for display for ${targetEffectiveMonth}.`);
    return sorted;
  }, [transactions, displayedDate, displayedMonthYearLabel]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0,5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    console.log(`Dashboard: TRACER --- recentExpenses: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'expense') {
        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          const originalInstallmentStartDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          const monthDiff = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(originalInstallmentStartDate));
          const currentInstallmentNum = monthDiff + 1;

          console.log(`Dashboard: TRACER --- recentExpenses (Installment Check): ID: ${t.id}, OrigDate: ${t.date}, monthDiff: ${monthDiff}, currentNum: ${currentInstallmentNum}, totalInst: ${t.installments}`);

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            const projectedDateDay = getDateFns(originalInstallmentStartDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
            
            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
             if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
            }
            
            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(projectedDate, "yyyy-MM-dd"),
              description: `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`,
              id: `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}`
            });
            console.log(`Dashboard: TRACER --- recentExpenses: Added projected installment: ${t.description} (${currentInstallmentNum}/${t.installments}), ProjectedDate: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          }
        } else if (t.isRecurring && t.expenseType !== 'installment') { 
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          if (startOfMonth(originalTransactionDate) <= firstDayOfDisplayedMonth) {
            const projectedDateDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);

            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
            }

            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(projectedDate, "yyyy-MM-dd"),
              id: `${t.id}_proj_${targetEffectiveMonth}`
            });
             console.log(`Dashboard: TRACER --- recentExpenses: Added projected recurring: ${t.description}, OrigDate: ${t.date}, ProjectedDate: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          }
        } else if ((!t.isRecurring || t.isRecurring === false) && (!t.expenseType || t.expenseType !== 'installment')) { 
          if (t.effectiveMonth === targetEffectiveMonth) {
            monthlyDisplayTransactions.push(t);
            console.log(`Dashboard: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}, EffMonth: ${t.effectiveMonth}`);
          }
        }
      }
    });

    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentExpenses: Found ${sorted.length} items for display for ${targetEffectiveMonth}.`);
    return sorted;
  }, [transactions, displayedDate, displayedMonthYearLabel, translate]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);


  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;

  console.log("Dashboard: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);
  if (overallLoading) {
    console.log("Dashboard: TRACER --- RENDERING LOADING SCREEN. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions, "isLoadingPreferences:", isLoadingPreferences, "isLoadingBudgets:", isLoadingBudgets);
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full">
          <div className="space-y-4 w-full p-4">
            <Skeleton className="h-10 w-1/3 mb-4" /> 
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={`summary-skel-${i}`} className="h-24 w-full" />)}
            </div>
            <Card className="shadow-lg bg-background dark:bg-card">
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <div className="flex-grow">
                  <div className="text-xl font-medium leading-none tracking-tight text-foreground">
                    {translate({ en: "Spending Summary", pt: "Resumo de Gastos" })}
                  </div>
                  <CardDescription className="mt-1">
                    {translate({ en: "Your spending breakdown for", pt: "Seu detalhamento de gastos em" })} {displayedMonthYearLabel}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md">
                    <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Largest Expense Category", pt: "Principal Categoria de Gasto"})}:</p>
                    <Skeleton className="h-7 w-7 mb-1 rounded-full"/>
                    <Skeleton className="h-5 w-3/4 mb-1"/>
                    <Skeleton className="h-7 w-1/3"/>
                  </div>
                  <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md">
                    <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Total Expenses", pt: "Total de Gastos"})}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Skeleton className="h-7 w-7 rounded-full"/>
                      <Skeleton className="h-5 w-1/2"/>
                    </div>
                    <Skeleton className="h-7 w-1/3 mt-1"/>
                  </div>
                  <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md">
                    <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Total Expenses", pt: "Total de Gastos"})}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Skeleton className="h-7 w-7 rounded-full"/>
                      <Skeleton className="h-5 w-1/2"/>
                    </div>
                    <Skeleton className="h-7 w-1/3 mt-1"/>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md bg-muted/50">
              <CardHeader>
                <Skeleton className="h-6 w-1/4 mb-2"/>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-60 w-full" />
              <Skeleton className="h-60 w-full" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions:", transactions.length, "isLoadingTransactions:", isLoadingTransactions, "Displayed Period Transactions:", transactionsForDisplayedPeriod.length);

  return (
    <AppLayout>
      <div className="space-y-8">
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod}
          monthlyBudget={totalCalculatedMonthlyBudget}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />
        <Card className="shadow-lg bg-background dark:bg-card">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <div className="flex-grow">
              <div className="text-xl font-medium leading-none tracking-tight text-foreground">
                {translate({ en: "Spending Summary", pt: "Resumo de Gastos" })}
              </div>
              <CardDescription className="mt-1">
                {translate({ en: "Your spending breakdown for", pt: "Seu detalhamento de gastos em" })} {displayedMonthYearLabel}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md">
                  <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}:
                  </p>
                  {largestExpenseCategoryForDisplayedPeriod ? (
                    <>
                      <div className="flex items-center gap-2 mt-1">
                        <CategoryIcon iconName={largestExpenseCategoryForDisplayedPeriod.icon} className="h-7 w-7 text-primary" />
                        <span className="font-semibold text-lg text-foreground">
                          {getCategoryDisplayLabel(largestExpenseCategoryForDisplayedPeriod, language)}
                        </span>
                      </div>
                      <p className="text-xl font-bold text-primary mt-1">
                        {formatCurrency(largestExpenseCategoryForDisplayedPeriod.amount)}
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full">
                      <p className="text-sm text-muted-foreground mt-2">
                        {translate({ en: "N/A", pt: "N/D"})}
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md">
                  <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Total Expenses", pt: "Total de Gastos" })}
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

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md">
                  <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Total Expenses", pt: "Total de Gastos" })}
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
            description={translate({ en: "Your latest income entries for", pt: "Suas últimas entradas de receita para" }) + " " + displayedMonthYearLabel}
            transactions={recentIncomeToDisplay}
            allUserCategories={userCategories}
            type="income"
            onSeeMore={() => setShowAllRecentIncome(prev => !prev)}
            isExpanded={showAllRecentIncome}
            totalItemsForMonth={fullRecentIncomeList.length}
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={translate({ en: "Your latest expense entries for", pt: "Suas últimas entradas de despesa para" }) + " " + displayedMonthYearLabel}
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

    