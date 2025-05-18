
'use client';
import React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, DisplayPaymentMethod, ExpenseType } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { PiggyBank, Package, Wallet } from "lucide-react"; // Ensure Package and Wallet are imported
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
  
  const [userCategories, setUserCategories] = useState<DisplayCategory[]>([]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);

  const effectMountedRef = useRef(true);
  const unsubscribeTransactionsRef = useRef<(() => void) | null>(null);
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

  // Listener for User Preferences
  useEffect(() => {
    if (!userId || !isClient || authLoading) {
      if (effectMountedRef.current) {
        const defaultCats = [...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)));
        const defaultPMs = [...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)));
        setUserCategories(defaultCats);
        setUserPaymentMethods(defaultPMs);
        setIsLoadingPreferences(false);
      }
      if (unsubscribePreferencesRef.current) {
        console.log("DashboardPage: TRACER --- Cleaning up STALE preferences listener (no user/auth).");
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
      return;
    }

    console.log("DashboardPage: TRACER --- Setting up REAL-TIME listener for user preferences for UserID:", userId);
    if (effectMountedRef.current && !isLoadingPreferences) setIsLoadingPreferences(true);
    
    const preferencesDocRef = doc(db, `users/${userId}/preferences/userPreferences`);

    if (unsubscribePreferencesRef.current) {
        console.log("DashboardPage: TRACER --- Cleaning up existing preferences listener before new setup for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
    }

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences snapshot received, but effect unmounted for UserID:", userId);
        return;
      }
      console.log("DashboardPage: TRACER --- Preferences snapshot received for UserID:", userId);

      let finalCategories: DisplayCategory[] = [...CATEGORIES];
      let finalPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];

      if (docSnap.exists()) {
        const preferencesData = docSnap.data() as UserPreferences;
        console.log("DashboardPage: TRACER --- Preferences data found for UserID:", userId, JSON.stringify(preferencesData));
        
        const customCategoryDefs = preferencesData.userDefinedCategories || [];
        const customCategoriesWithType: DisplayCategory[] = customCategoryDefs.map(c => ({ ...c, type: c.type || 'expense', label: c.label || {en: c.name, pt: c.name} }));
        
        const combinedCategoriesMap = new Map<string, DisplayCategory>();
        CATEGORIES.forEach(cat => combinedCategoriesMap.set(cat.name.toLowerCase(), cat));
        customCategoriesWithType.forEach(customCat => combinedCategoriesMap.set(customCat.name.toLowerCase(), customCat));
        finalCategories = Array.from(combinedCategoriesMap.values());

        const customPaymentMethodDefs = preferencesData.userDefinedPaymentMethods || [];
        const customMethodsAsDisplay: DisplayPaymentMethod[] = customPaymentMethodDefs.map(customPm => ({ ...customPm, label: customPm.label || {en: customPm.name, pt: customPm.name}}));
        
        const combinedPaymentMethodsMap = new Map<string, DisplayPaymentMethod>();
        PAYMENT_METHODS.forEach(pm => combinedPaymentMethodsMap.set(pm.name.toLowerCase(), pm));
        customMethodsAsDisplay.forEach(customPm => combinedPaymentMethodsMap.set(customPm.name.toLowerCase(), customPm));
        
        const selectedPaymentMethodNames = preferencesData.selectedPaymentMethods || [];
        if (selectedPaymentMethodNames.length > 0) {
            const effectivePMs = Array.from(combinedPaymentMethodsMap.values()).filter(pm => 
                selectedPaymentMethodNames.some(name => name.toLowerCase() === pm.name.toLowerCase())
            );
            finalPaymentMethods = effectivePMs.length > 0 ? effectivePMs : Array.from(combinedPaymentMethodsMap.values());
        } else {
            finalPaymentMethods = Array.from(combinedPaymentMethodsMap.values());
        }
      } else {
        console.log("DashboardPage: TRACER --- No preferences document found for UserID:", userId, ". Using all predefined categories and payment methods.");
      }
      
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items");
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
        const defaultCatsError = [...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)));
        const defaultPMsError = [...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)));
        setUserCategories(defaultCatsError); 
        setUserPaymentMethods(defaultPMsError); 
        setIsLoadingPreferences(false);
      }
    });

    return () => {
      if (unsubscribePreferencesRef.current) {
        console.log("DashboardPage: TRACER --- Cleaning up preferences listener on unmount/dependency change for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
    };
  }, [userId, isClient, authLoading, language, toast, translate]);


  // Main data fetching useEffect for transactions
  useEffect(() => {
    const cleanupListener = () => {
      if (unsubscribeTransactionsRef.current) {
        console.log("Dashboard: TRACER --- cleanupListener: Unsubscribing TRXs snapshot for UserID:", mainFetchInitiatedForUser.current);
        unsubscribeTransactionsRef.current();
        unsubscribeTransactionsRef.current = null;
      }
    };
    const fullCleanup = () => {
      console.log("Dashboard: TRACER --- Main useEffect FULL CLEANUP for UserID:", mainFetchInitiatedForUser.current);
      cleanupListener();
      effectMountedRef.current = false; 
    };

    console.log("Dashboard: TRACER --- Main useEffect START. UserID:", userId, ", AuthLoading:", authLoading, ", isClient:", isClient, ", InitiatedFor:", mainFetchInitiatedForUser.current, ", isLoadingTransactions:", isLoadingTransactions);
    effectMountedRef.current = true; 

    if (!isClient) {
      console.log("Dashboard: TRACER --- Main useEffect: Not client yet, waiting.");
      return; 
    }
    if (authLoading) {
      console.log("Dashboard: TRACER --- Main useEffect: Auth is loading, waiting...");
      return; 
    }
    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      if (effectMountedRef.current) {
        cleanupListener();
        setTransactions([]); 
        if (isLoadingTransactions) setIsLoadingTransactions(false); 
        mainFetchInitiatedForUser.current = null; 
        router.push('/login'); 
      }
      return; 
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

        if (unsubscribeTransactionsRef.current) {
            console.warn("Dashboard: TRACER --- fetchDataInternal: Stale transaction snapshot ref found before new onSnapshot. Cleaning up for UserID:", currentUserId);
            unsubscribeTransactionsRef.current();
            unsubscribeTransactionsRef.current = null;
        }
        
        unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- onSnapshot: Effect unmounted for UserID:", currentUserId, ". Skipping state update.");
            return;
          }
          console.log("Dashboard: TRACER --- onSnapshot: Received data for UserID: " + currentUserId + ". Empty: " + querySnapshot.empty + ", PendingWrites: " + querySnapshot.metadata.hasPendingWrites);

          const fetchedTransactions = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            let dateString = data.date; 

            if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
              dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
            } else if (typeof data.date === 'string' && data.date.includes('T')) { 
              try { dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); }
              catch (e) {
                console.warn("Dashboard: TRACER --- Failed to parse existing ISO datetime string to yyyy-MM-dd: " + String(data.date), e);
                dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
              }
            } else if (typeof data.date !== 'string' || (typeof data.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(data.date))) {
               console.warn("Dashboard: TRACER --- Transaction has unexpected date format, or not YYYY-MM-DD. Fallback to current date YYYY-MM-DD. Date was:", data.date);
               dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
            }

            return {
              ...data,
              id: docSnap.id,
              date: dateString, 
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
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) after processing transaction snapshot data for UserID:", currentUserId);
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
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (error callback) for UserID:", currentUserId);
            }
          }
        });

      } catch (error: any) {
        if (!effectMountedRef.current) {
          console.log("Dashboard: TRACER --- fetchDataInternal: Main try-catch, effect unmounted for UserID:", currentUserId);
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
            console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (main catch block) for UserID:", currentUserId);
          }
        }
      }
    };

    console.log("Dashboard: TRACER --- Main useEffect: Current state before deciding to fetch: mainFetchInitiatedForUser.current:", mainFetchInitiatedForUser.current, "userId:", userId, "unsubscribeTransactionsRef.current:", unsubscribeTransactionsRef.current ? 'EXISTS' : 'NULL');
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeTransactionsRef.current) {
      console.log("Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: " + String(userId) + ". PrevInitiatedFor: " + String(mainFetchInitiatedForUser.current) + ". ListenerExisted: " + (!!unsubscribeTransactionsRef.current));
      cleanupListener(); 
      if (effectMountedRef.current && !isLoadingTransactions) {
         setIsLoadingTransactions(true);
         console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
      }
      mainFetchInitiatedForUser.current = userId; 
      fetchDataInternal(userId);
    } else {
      console.log("Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: " + String(userId) + ". isLoadingTransactions: " + isLoadingTransactions + ". Snapshot ref present: " + (!!unsubscribeTransactionsRef.current));
       if(effectMountedRef.current && isLoadingTransactions && unsubscribeTransactionsRef.current) { 
        console.log("Dashboard: TRACER --- Main useEffect: Listener active, but isLoadingTransactions true. Likely waiting for initial snapshot for user:", userId);
      } else if (effectMountedRef.current && isLoadingTransactions && !unsubscribeTransactionsRef.current) {
        console.warn("Dashboard: TRACER --- Main useEffect: isLoadingTransactions is true, but NO snapshot listener is active. This might be an issue for user:", userId);
        if (effectMountedRef.current) setIsLoadingTransactions(false); 
      }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient]);


 const loadBudgets = useCallback(async () => {
    if (!userId || !isClient) { 
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false);
      }
      return; 
    }
    if(effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) return; 

      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, any>; 
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (key !== 'lastUpdated' && Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        setLoadedBudgetsForMonth(validBudgets);
      } else { 
        setLoadedBudgetsForMonth({}); 
      }
    } catch (error) {
      if (!effectMountedRef.current) return;
      console.error("Dashboard: TRACER --- LoadBudgets: Error loading budgets for month:", budgetMonthKey, error);
      setLoadedBudgetsForMonth({}); 
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({ en: "Could not load your budgets for the summary.", pt: "Não foi possível carregar seus orçamentos para o resumo." }), variant: "destructive" });
    } finally {
      if (effectMountedRef.current) setIsLoadingBudgets(false);
    }
  }, [userId, isClient, displayedDate, toast, translate]); 


  useEffect(() => { 
    loadBudgets(); 
  }, [loadBudgets]);

 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    console.log("Dashboard: TRACER --- onAddTransaction: Full newTransactionData received from form:", JSON.stringify(newTransactionData, null, 2));
    console.log("Dashboard: TRACER --- onAddTransaction: Received date from form:", newTransactionData.date);

    const fullPayload = {
      ...newTransactionData, 
      userId: userId,
      createdAt: serverTimestamp(),
    };
    
    // Ensure only defined values are saved, especially for optional fields
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string }>;

    // Explicitly handle isRecurring if it became undefined after filtering
    if (dataToSave.isRecurring === undefined) {
        dataToSave.isRecurring = false;
    }
    
    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "Full dataToSave:", JSON.stringify(dataToSave));
    
    try {
      const transactionsColRef = collection(db, `users/${userId}/transactions`);
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: "" + newTransactionData.description + " " + translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })});
    } catch (error: any) {
      console.error("DashboardPage: Error adding transaction to Firestore:", error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({ en: "Could not add transaction.", pt: "Não foi possível adicionar a transação." })) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''), variant: "destructive" });
    }
  }, [userId, toast, translate]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating. displayedDate:", displayedDate.toISOString(), "All transactions count:", transactions.length);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); 
    const firstDayOfTargetMonth = startOfMonth(displayedDate);

    const filtered: Transaction[] = [];
    transactions.forEach(t => {
      const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0)); 
      
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const installmentSeriesEndDate = endOfMonth(addMonths(installmentSeriesStartDate, t.installments - 1));
        const isInstallmentActiveThisMonth = isWithinInterval(firstDayOfTargetMonth, { start: installmentSeriesStartDate, end: installmentSeriesEndDate });
        
        console.log(`Dashboard: TRACER --- Tx Filter (Installment Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, StartSeries: ${installmentSeriesStartDate.toISOString()}, EndSeries: ${installmentSeriesEndDate.toISOString()}, TargetMonthStart: ${firstDayOfTargetMonth.toISOString()}, installments: ${t.installments}, isActive: ${isInstallmentActiveThisMonth}, isRec: ${t.isRecurring}, expType: ${t.expenseType}`);
        
        if (isInstallmentActiveThisMonth) {
           filtered.push(t);
        }
      }
      else if (t.isRecurring === true && t.expenseType !== 'installment') { 
        const transactionYear = getYearFns(originalTransactionDate);
        const transactionMonth = getMonthFns(originalTransactionDate);
        const matchesRecurringCriteria = transactionYear < targetYear || (transactionYear === targetYear && transactionMonth <= targetMonth);
        
        console.log(`Dashboard: TRACER --- Tx Filter (Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, TxY: ${transactionYear}, TxM: ${transactionMonth}, TargetY: ${targetYear}, TargetM: ${targetMonth}, MatchesRec: ${matchesRecurringCriteria}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);
        
        if (matchesRecurringCriteria) {
           filtered.push(t);
        }
      }
      else if (!t.isRecurring && t.expenseType !== 'installment') { 
        const transactionYear = getYearFns(originalTransactionDate);
        const transactionMonth = getMonthFns(originalTransactionDate);
        const matchesNonRec = transactionYear === targetYear && transactionMonth === targetMonth;
         console.log(`Dashboard: TRACER --- Tx Filter (Non-Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, TxY: ${transactionYear}, TxM: ${transactionMonth}, TargetY: ${targetYear}, TargetM: ${targetMonth}, MatchesNonRec: ${matchesNonRec}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);
        if (matchesNonRec) {
          filtered.push(t);
        }
      } else if (t.type === 'income') { // Generic income handling (recurring or non-recurring)
         const transactionYear = getYearFns(originalTransactionDate);
         const transactionMonth = getMonthFns(originalTransactionDate);
         let matchesIncome = false;
         if (t.isRecurring) { // Recurring income
            if (transactionYear < targetYear || (transactionYear === targetYear && transactionMonth <= targetMonth)) { 
                matchesIncome = true;
            }
         } else { // Non-recurring income
            if (transactionYear === targetYear && transactionMonth === targetMonth) {
                matchesIncome = true;
            }
         }
         console.log(`Dashboard: TRACER --- Tx Filter (Income Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, TxY: ${transactionYear}, TxM: ${transactionMonth}, TargetY: ${targetYear}, TargetM: ${targetMonth}, MatchesIncome: ${matchesIncome}, isRec: ${t.isRecurring}`);
         if(matchesIncome){
            filtered.push(t);
         }
      }
    });
    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Found ${filtered.length} transactions for the period.`);
    return filtered;
  }, [transactions, displayedDate]);


  const fullRecentIncomeList = useMemo(() => {
    console.log(`Dashboard: TRACER --- recentIncome: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);
    const targetMonthStart = startOfMonth(displayedDate);

    const monthlyDisplayTransactions: Transaction[] = [];
    transactions.forEach(t => {
        if (t.type !== 'income') return;

        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
        const originalTransactionDay = getDateFns(originalTransactionDate);

        if (t.isRecurring) {
            if (startOfMonth(originalTransactionDate) <= targetMonthStart) {
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) { 
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                const projectedTx = {
                    ...t,
                    id: `${t.id}_projected_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`, 
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"), 
                    description: `${t.description} (${translate({en: "Monthly", pt: "Mensal"})})`,
                };
                monthlyDisplayTransactions.push(projectedTx);
                console.log(`Dashboard: TRACER --- recentIncome: Added projected recurring: ${projectedTx.description}, Date: ${projectedTx.date}`);
            }
        } else { 
            if (getYearFns(originalTransactionDate) === targetYear && getMonthFns(originalTransactionDate) === targetMonth) {
                monthlyDisplayTransactions.push(t);
                console.log(`Dashboard: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}`);
            }
        }
    });
    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentIncome: Found ${sorted.length} items for display.`);
    return sorted;
  }, [transactions, displayedDate, displayedMonthYearLabel, translate]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0,5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    console.log(`Dashboard: TRACER --- recentExpenses: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);
    const targetMonthStart = startOfMonth(displayedDate);

    const monthlyDisplayTransactions: Transaction[] = [];
    transactions.forEach(t => {
        if (t.type !== 'expense') return;

        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
        const originalTransactionDay = getDateFns(originalTransactionDate);

        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
            const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
            const monthDiff = differenceInCalendarMonths(targetMonthStart, installmentSeriesStartDate);
            const currentInstallmentNum = monthDiff + 1;
            
            console.log(`Dashboard: TRACER --- recentExpenses (Installment Check): ID: ${t.id}, OrigDate: ${t.date}, currentInstallmentNum: ${currentInstallmentNum}, totalInstallments: ${t.installments}, monthDiff: ${monthDiff}, expType: ${t.expenseType}`);

            if (monthDiff >= 0 && monthDiff < t.installments) { 
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) { 
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                const projectedInstallment = {
                    ...t,
                    id: `${t.id}_inst_${currentInstallmentNum}_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"),
                    description: `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`,
                };
                monthlyDisplayTransactions.push(projectedInstallment);
                 console.log(`Dashboard: TRACER --- recentExpenses: Added projected installment: ${projectedInstallment.description}, Date: ${projectedInstallment.date}`);
            }
        } 
        else if (t.isRecurring && t.expenseType !== 'installment') { 
            if (startOfMonth(originalTransactionDate) <= targetMonthStart) {
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) { 
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                 const projectedTx = {
                    ...t,
                    id: `${t.id}_projected_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
                    description: `${t.description} (${translate({en: "Monthly", pt: "Mensal"})})`,
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"),
                };
                monthlyDisplayTransactions.push(projectedTx);
                console.log(`Dashboard: TRACER --- recentExpenses: Added projected recurring: ${projectedTx.description}, Date: ${projectedTx.date}`);
            }
        } 
        else if (!t.isRecurring && t.expenseType !== 'installment') { 
            if (getYearFns(originalTransactionDate) === targetYear && getMonthFns(originalTransactionDate) === targetMonth) {
                monthlyDisplayTransactions.push(t);
                console.log(`Dashboard: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}`);
            }
        }
    });

    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentExpenses: Found ${sorted.length} items for display.`);
    return sorted;
  }, [transactions, displayedDate, displayedMonthYearLabel, translate]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]); 


  const largestExpenseCategoryForDisplayedPeriod = useMemo(() => {
    const expensesThisPeriod = transactionsForDisplayedPeriod.filter(t => t.type === 'expense');
    if (expensesThisPeriod.length === 0) return null;
    const expensesByCategory: Record<string, number> = {};
    for (const transaction of expensesThisPeriod) {
      const categoryName = typeof transaction.category === 'string' ? transaction.category : transaction.category.name;
      expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + transaction.amount;
    }
    let maxAmount = 0; let largestCategoryKey: string | null = null;
    for (const categoryKey in expensesByCategory) {
      if (Object.prototype.hasOwnProperty.call(expensesByCategory, categoryKey)) {
        if (expensesByCategory[categoryKey] > maxAmount) {
          maxAmount = expensesByCategory[categoryKey];
          largestCategoryKey = categoryKey;
        }
      }
    }
    if (largestCategoryKey) {
      const categoryDetail = userCategories.find(cat => cat.name === largestCategoryKey) || CATEGORIES.find(cat => cat.name === largestCategoryKey);
      return { 
        name: largestCategoryKey, 
        amount: maxAmount, 
        icon: categoryDetail?.icon || 'CircleHelp', 
        label: categoryDetail?.label || { en: largestCategoryKey, pt: largestCategoryKey }, 
        type: 'expense' 
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

  const totalIncomeForSummary = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalExpensesForSummary = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);
  
  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;
  
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
            <Card className="shadow-lg">
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </CardContent>
            </Card>
            <Skeleton className="h-32 w-full mb-8" /> 
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-60 w-full" />
              <Skeleton className="h-60 w-full" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  console.log("Dashboard: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);

  return (
    <AppLayout>
      <div className="space-y-8">
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod} 
          monthlyBudget={totalCalculatedMonthlyBudget} 
          displayedMonthYearLabel={displayedMonthYearLabel}
        />
         <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Spending Summary", pt: "Resumo de Gastos" })}</CardTitle>
            <CardDescription>
              {translate({ en: "Your spending breakdown for", pt: "Seu detalhamento de gastos em" })} {displayedMonthYearLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length > 0 ? (
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-start gap-2"> {/* items-start for better vertical alignment */}
                    {largestExpenseCategoryForDisplayedPeriod ? (
                      <>
                        <CategoryIcon iconName={largestExpenseCategoryForDisplayedPeriod.icon} className="h-7 w-7 text-primary flex-shrink-0 mt-1" />
                        <div>
                          <p className="text-sm font-medium text-foreground text-left">
                            {translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}:
                          </p>
                          <span className="font-semibold text-lg block text-left"> {/* block for category name */}
                            {getCategoryDisplayLabel(largestExpenseCategoryForDisplayedPeriod, language)}
                          </span>
                          <p className="text-xl font-bold text-primary mt-1 text-left"> {/* text-left for amount */}
                            {formatCurrency(largestExpenseCategoryForDisplayedPeriod.amount)}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center text-center w-full"> {/* Centering if no category */}
                         <p className="text-sm font-medium text-foreground mb-1">
                          {translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}:
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          {translate({ en: "N/A", pt: "N/D"})}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-start gap-2">
                    <Package className="h-7 w-7 text-primary flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-sm font-medium text-foreground text-left">
                        {translate({ en: "Total Fixed Expenses", pt: "Total de Gastos Fixos" })}
                      </p>
                      <p className="text-xl font-bold text-primary mt-1 text-left">
                        {formatCurrency(totalFixedExpensesForDisplayedPeriod)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                   <div className="flex items-start gap-2">
                    <Wallet className="h-7 w-7 text-primary flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-sm font-medium text-foreground text-left">
                        {translate({ en: "Total Variable Expenses", pt: "Total de Gastos Variáveis" })}
                      </p>
                      <p className="text-xl font-bold text-primary mt-1 text-left">
                        {formatCurrency(totalVariableExpensesForDisplayedPeriod)}
                      </p>
                    </div>
                  </div>
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
          onAddTransaction={onAddTransaction}
          currentDisplayedDate={displayedDate} 
          userCategories={userCategories}
          userPaymentMethods={userPaymentMethods}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecentTransactionsSection
            title={translate({ en: "Recent Income", pt: "Receitas Recentes" })}
            description={translate({ en: "Your latest income entries for", pt: "Suas últimas entradas de receita para" }) + " " + displayedMonthYearLabel}
            transactions={recentIncomeToDisplay} 
            type="income"
            onSeeMore={() => setShowAllRecentIncome(prev => !prev)}
            isExpanded={showAllRecentIncome}
            totalItemsForMonth={fullRecentIncomeList.length}
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={translate({ en: "Your latest expense entries for", pt: "Suas últimas entradas de despesa para" }) + " " + displayedMonthYearLabel}
            transactions={recentExpensesToDisplay} 
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


    