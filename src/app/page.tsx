
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
import type { Transaction, DisplayCategory, UserPreferences, DisplayPaymentMethod, ExpenseType, CategoryName } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel, getCategoryLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch, updateDoc, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { PiggyBank, Package, Wallet, TrendingUp, TrendingDown, DollarSign, ListChecks, Terminal } from "lucide-react"; // Package and Wallet imported here
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
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);

  const effectMountedRef = useRef(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

  // Listener for User Preferences
  useEffect(() => {
    const cleanupListener = () => {
      if (unsubscribePreferencesRef.current) {
        console.log("DashboardPage: TRACER --- Cleaning up preferences listener for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
    };

    if (!userId || !isClient || authLoading) {
      if (effectMountedRef.current) {
        // Default to all predefined categories if preferences can't be loaded
        const allPredefinedCategories: DisplayCategory[] = [...CATEGORIES];
        const allPredefinedPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        
        setUserCategories(allPredefinedCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(allPredefinedPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        if (isLoadingPreferences) setIsLoadingPreferences(false);
      }
      cleanupListener();
      return;
    }

    console.log("DashboardPage: TRACER --- Setting up REAL-TIME listener for user preferences for UserID:", userId);
    if (effectMountedRef.current && !isLoadingPreferences) setIsLoadingPreferences(true);
    
    const preferencesDocRef = doc(db, 'users/' + userId + '/preferences/userPreferences');
    cleanupListener(); // Clean up any existing listener before setting up a new one

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
        
        const predefinedCategoryNames = new Set(CATEGORIES.map(cat => cat.name.toLowerCase()));
        customCategoriesWithType.forEach(customCat => {
            if (!predefinedCategoryNames.has(customCat.name.toLowerCase())) {
                finalCategories.push(customCat); // Add custom if not a predefined name
            }
        });
        
        const customPaymentMethodDefs = preferencesData.userDefinedPaymentMethods || [];
        const customMethodsAsDisplay: DisplayPaymentMethod[] = customPaymentMethodDefs.map(customPm => ({ ...customPm, label: customPm.label || {en: customPm.name, pt: customPm.name}}));
        
        const predefinedPaymentMethodNames = new Set(PAYMENT_METHODS.map(pm => pm.name.toLowerCase()));
        customMethodsAsDisplay.forEach(customPm => {
            if (!predefinedPaymentMethodNames.has(customPm.name.toLowerCase())) {
                finalPaymentMethods.push(customPm); // Add custom if not a predefined name
            }
        });
        
        // Filter by selectedPaymentMethods if available (for display in forms, not just for this dashboard)
        // This logic might be more relevant on pages that directly list payment methods for selection
        // For the dashboard's TransactionForm, we usually want all available (predefined + custom) methods.
        const selectedPmNames = new Set((preferencesData.selectedPaymentMethods || []).map(name => name.toLowerCase()));
        if (selectedPmNames.size > 0) { // If user made explicit selections during onboarding
             finalPaymentMethods = finalPaymentMethods.filter(pm => selectedPmNames.has(pm.name.toLowerCase()));
             if(finalPaymentMethods.length === 0) { // Fallback if selection results in empty
                finalPaymentMethods = [...PAYMENT_METHODS, ...customMethodsAsDisplay]; // Re-include all
             }
        }

      } else {
        console.log("DashboardPage: TRACER --- No preferences document found for UserID:", userId, ". Using all predefined categories and payment methods.");
      }
      
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
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
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)))); 
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)))); 
        setIsLoadingPreferences(false);
      }
    });

    return cleanupListener;
  }, [userId, isClient, authLoading, language, toast, translate]);


  useEffect(() => {
    effectMountedRef.current = true;
    const cleanupListener = () => {
      if (unsubscribeSnapshotRef.current) {
        console.log("Dashboard: TRACER --- cleanupListener: Unsubscribing TRXs snapshot for UserID:", mainFetchInitiatedForUser.current);
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }
    };
    const fullCleanup = () => {
      console.log("Dashboard: TRACER --- Main useEffect FULL CLEANUP for UserID:", mainFetchInitiatedForUser.current);
      cleanupListener();
      effectMountedRef.current = false;
    };

    console.log("Dashboard: TRACER --- Main useEffect START. UserID:", userId, ", AuthLoading:", authLoading, ", isClient:", isClient, ", InitiatedFor:", mainFetchInitiatedForUser.current, ", isLoadingTransactions:", isLoadingTransactions);
    
    if (!isClient) {
      console.log("Dashboard: TRACER --- Main useEffect: Not client yet, waiting.");
      return;
    }
    if (authLoading) {
      console.log("Dashboard: TRACER --- Main useEffect: Auth is loading, waiting...");
      // No explicit setIsLoadingTransactions(true) here, overallLoading handles it
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

        if (unsubscribeSnapshotRef.current) {
            console.warn("Dashboard: TRACER --- fetchDataInternal: Stale transaction snapshot ref found before new onSnapshot. Cleaning up again.");
            unsubscribeSnapshotRef.current();
            unsubscribeSnapshotRef.current = null;
        }
        
        unsubscribeSnapshotRef.current = onSnapshot(q_transactions, (querySnapshot) => {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- onSnapshot: Effect unmounted for UserID:", currentUserId, ". Skipping state update.");
            return;
          }
          console.log("Dashboard: TRACER --- onSnapshot: Received data for UserID: " + currentUserId + ". Empty: " + querySnapshot.empty + ", PendingWrites: " + querySnapshot.metadata.hasPendingWrites);

          const fetchedTransactions = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            let dateString = data.date; // Assume YYYY-MM-DD string
            let effectiveMonthString = data.effectiveMonth; // Assume YYYY-MM string

            if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
              dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
            } else if (typeof data.date === 'string' && data.date.includes('T')) { // Handle ISO datetime strings
              try { dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); }
              catch (e) {
                console.warn("Dashboard: TRACER --- Failed to parse existing ISO datetime string to yyyy-MM-dd: " + String(data.date), e);
                dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }
            } else if (typeof data.date !== 'string' || (typeof data.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(data.date))) {
               console.warn("Dashboard: TRACER --- Transaction has unexpected date format, or not YYYY-MM-DD. Fallback to current date YYYY-MM-DD. Date was:", data.date, "ID:", docSnap.id);
               dateString = formatDateFns(new Date(), "yyyy-MM-dd"); // Fallback
            }

            if (!effectiveMonthString && dateString) {
                try {
                    effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date()), "yyyy-MM");
                } catch (e) {
                    console.warn("DashboardPage: Could not parse date " + String(dateString) + " to derive effectiveMonth for tx " + String(docSnap.id));
                    effectiveMonthString = formatDateFns(new Date(), "yyyy-MM"); // Fallback
                }
            }


            return {
              ...data,
              id: docSnap.id,
              date: dateString,
              effectiveMonth: effectiveMonthString, // Ensure this is set
              isRecurring: data.isRecurring === true,
              expenseType: data.expenseType, // Ensure this is passed
              installments: data.installments, // Ensure this is passed
              paymentMethod: data.paymentMethod,
              expenseNature: data.expenseNature
            } as Transaction;
          });

          if (effectMountedRef.current) {
            console.log("Dashboard: TRACER --- onSnapshot: Setting " + fetchedTransactions.length + " transactions for UserID: " + currentUserId + ".");
            setTransactions(fetchedTransactions);
             if (isLoadingTransactions) { // Only set to false if it was true
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
            if (isLoadingTransactions) { // Only set to false if it was true
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

    console.log("Dashboard: TRACER --- Main useEffect: Current state before deciding to fetch: mainFetchInitiatedForUser.current:", mainFetchInitiatedForUser.current, "userId:", userId, "unsubscribeSnapshotRef.current:", unsubscribeSnapshotRef.current ? 'EXISTS' : 'NULL');
    
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log("Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: " + String(userId) + ". PrevInitiatedFor: " + String(mainFetchInitiatedForUser.current) + ". ListenerExisted: " + (!!unsubscribeSnapshotRef.current));
      cleanupListener(); // Clean up previous listener if user changes
      if (effectMountedRef.current && !isLoadingTransactions) {
         setIsLoadingTransactions(true); // Set loading true only if we're starting a new fetch for a new user
         console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
      }
      mainFetchInitiatedForUser.current = userId;
      fetchDataInternal(userId);
    } else {
      console.log("Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: " + String(userId) + ". isLoadingTransactions: " + isLoadingTransactions + ". Snapshot ref present: " + (!!unsubscribeSnapshotRef.current));
       if(effectMountedRef.current && isLoadingTransactions && unsubscribeSnapshotRef.current) {
        // This case is fine, means we are waiting for the initial snapshot from an already setup listener
        console.log("Dashboard: TRACER --- Main useEffect: Listener active, but isLoadingTransactions true. Likely waiting for initial snapshot for user:", userId);
      } else if (effectMountedRef.current && isLoadingTransactions && !unsubscribeSnapshotRef.current) {
        // This might indicate an issue if we are loading but no listener is active (e.g., previous cleanup was too aggressive)
        console.warn("Dashboard: TRACER --- Main useEffect: isLoadingTransactions is true, but NO snapshot listener is active. This might be an issue for user:", userId);
        if (effectMountedRef.current) setIsLoadingTransactions(false); // Safety net
      }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient]); // Removed router, toast, translate


 const loadBudgets = useCallback(async () => {
    if (!userId || !isClient || !effectMountedRef.current) { // Added effectMountedRef check
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false);
      }
      return;
    }
    if(effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log("Dashboard: TRACER --- Loading budgets for user " + String(userId) + ", month: " + budgetMonthKey);
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) return;

      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, any>;
        console.log("Dashboard: TRACER --- Budget data found:", JSON.stringify(budgetData));
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          // Ensure not to process 'lastUpdated' or other non-numeric fields as budget categories
          if (key !== 'lastUpdated' && Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        setLoadedBudgetsForMonth(validBudgets);
      } else {
        console.log("Dashboard: TRACER --- No budget document found for this month.");
        setLoadedBudgetsForMonth({}); // Set to empty object if no doc found
      }
    } catch (error) {
      if (!effectMountedRef.current) return;
      console.error("Dashboard: TRACER --- LoadBudgets: Error loading budgets for month:", budgetMonthKey, error);
      setLoadedBudgetsForMonth({}); // Set to empty object on error
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({ en: "Could not load your budgets for the summary.", pt: "Não foi possível carregar seus orçamentos para o resumo." }), variant: "destructive" });
    } finally {
      if (effectMountedRef.current) setIsLoadingBudgets(false);
    }
  }, [userId, isClient, displayedDate, toast, translate]); // Added toast, translate as they are used


  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]); // loadBudgets is now memoized by useCallback

 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    console.log("Dashboard: TRACER --- onAddTransaction: Full newTransactionData received from form:", JSON.stringify(newTransactionData, null, 2));
    console.log("Dashboard: TRACER --- onAddTransaction: Received date from form:", newTransactionData.date);
    
    const effectiveMonthForNewTx = formatDateFns(displayedDate, "yyyy-MM");

    const fullPayload = {
      ...newTransactionData, // description, amount, type, category, date (YYYY-MM-DD string), paymentMethod?, installments?, isRecurring?, expenseNature?, expenseType?
      userId: userId,
      effectiveMonth: effectiveMonthForNewTx,
      createdAt: serverTimestamp(),
    };

    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;

    if (dataToSave.isRecurring === undefined) { // Ensure isRecurring has a boolean value
        dataToSave.isRecurring = false;
    }
    
    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "effectiveMonth:", dataToSave.effectiveMonth, "Full dataToSave:", JSON.stringify(dataToSave));

    try {
      const transactionsColRef = collection(db, 'users/' + userId + '/transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: "" + newTransactionData.description + " " + translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })});
    } catch (error: any) {
      console.error("DashboardPage: Error adding transaction to Firestore:", error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({ en: "Could not add transaction.", pt: "Não foi possível adicionar a transação." })) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''), variant: "destructive" });
    }
  }, [userId, toast, translate, displayedDate]); // displayedDate added as it's used for effectiveMonth


  const transactionsForDisplayedPeriod = useMemo(() => {
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year:", getYearFns(displayedDate), "Month:", getMonthFns(displayedDate), `(0-indexed for ${displayedMonthYearLabel}), All transactions count:`, transactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const filtered = transactions.filter(t => {
        const transactionEffectiveMonth = t.effectiveMonth || (t.date ? formatDateFns(parseDateFns(t.date, "yyyy-MM-dd", new Date()), "yyyy-MM") : "");
        const matches = transactionEffectiveMonth === targetEffectiveMonth;

        // Detailed log for each transaction being processed by this filter
        // console.log(`Dashboard: TRACER --- Tx Filter for Period: ID: ${t.id}, DateStr: ${t.date}, EffectiveMonth: ${transactionEffectiveMonth}, TargetEM: ${targetEffectiveMonth}, Matches: ${matches}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);
        return matches;
    });
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Found " + filtered.length + " transactions for the period.");
    return filtered;
  }, [transactions, displayedDate, displayedMonthYearLabel]);


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
      const categoryName = typeof transaction.category === 'string' ? transaction.category : transaction.category.name;
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
      // Try to find in userCategories first (which includes custom ones)
      let categoryDetail = userCategories.find(cat => cat.name === largestCategoryKey);
      if (!categoryDetail) { // Fallback to predefined if not in userCategories (should be rare if userCategories is comprehensive)
         categoryDetail = CATEGORIES.find(cat => cat.name === largestCategoryKey);
      }
      
      return {
        name: largestCategoryKey,
        amount: maxAmount,
        icon: categoryDetail?.icon || 'CircleHelp', // Use found detail's icon or fallback
        label: categoryDetail?.label || { en: largestCategoryKey, pt: largestCategoryKey }, // Use found detail's label or fallback
        type: 'expense' // Assuming it's an expense category
      } as DisplayCategory & { amount: number };
    }
    return null;
  }, [transactionsForDisplayedPeriod, userCategories]); // userCategories added

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
    console.log(`Dashboard: TRACER --- recentIncome: Recalculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'income') {
        if (t.isRecurring) {
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          if (startOfMonth(originalTransactionDate) <= startOfMonth(displayedDate)) {
            const projectedDate = setDateFnsDate(startOfMonth(displayedDate), getDateFns(originalTransactionDate));
             // Handle day overflow for projected date
            const lastDayOfDisplayedMonth = lastDayOfMonth(displayedDate);
            const finalProjectedDate = getDateFns(projectedDate) > getDateFns(lastDayOfDisplayedMonth) ? lastDayOfDisplayedMonth : projectedDate;

            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(finalProjectedDate, "yyyy-MM-dd"), // Projected date for display
              id: `${t.id}_proj_${targetEffectiveMonth}` // Unique ID for projected item
            });
            console.log(`Dashboard: TRACER --- recentIncome: Added projected recurring: ${t.description}, Date: ${formatDateFns(finalProjectedDate, "yyyy-MM-dd")}`);
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) {
          monthlyDisplayTransactions.push(t);
          console.log(`Dashboard: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}`);
        }
      }
    });
    
    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentIncome: Found ${sorted.length} items for display.`);
    return sorted;
  }, [transactions, displayedDate, displayedMonthYearLabel, translate]); // translate was missing

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0,5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    console.log(`Dashboard: TRACER --- recentExpenses: Recalculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'expense') {
        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          const originalInstallmentStartDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          const monthDiff = differenceInCalendarMonths(startOfMonth(displayedDate), startOfMonth(originalInstallmentStartDate));
          const currentInstallmentNum = monthDiff + 1;

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            // Project to current displayed month, keeping original day
            const projectedDateDay = getDateFns(originalInstallmentStartDate);
            let projectedDate = setDateFnsDate(startOfMonth(displayedDate), projectedDateDay);
             // Handle day overflow
            const lastDayOfDisplayedMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(startOfMonth(displayedDate), Math.min(projectedDateDay, getDateFns(lastDayOfDisplayedMonth)));
            }
            
            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(projectedDate, "yyyy-MM-dd"),
              description: `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`,
              id: `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}`
            });
            console.log(`Dashboard: TRACER --- recentExpenses: Added projected installment: ${t.description} (${currentInstallmentNum}/${t.installments}), Date: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          }
        } else if (t.isRecurring && t.expenseType !== 'installment') { // Generic recurring expense
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          if (startOfMonth(originalTransactionDate) <= startOfMonth(displayedDate)) {
            const projectedDate = setDateFnsDate(startOfMonth(displayedDate), getDateFns(originalTransactionDate));
            // Handle day overflow for projected date
            const lastDayOfDisplayedMonth = lastDayOfMonth(displayedDate);
            const finalProjectedDate = getDateFns(projectedDate) > getDateFns(lastDayOfDisplayedMonth) ? lastDayOfDisplayedMonth : projectedDate;

            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(finalProjectedDate, "yyyy-MM-dd"),
              id: `${t.id}_proj_${targetEffectiveMonth}`
            });
             console.log(`Dashboard: TRACER --- recentExpenses: Added projected recurring: ${t.description}, Date: ${formatDateFns(finalProjectedDate, "yyyy-MM-dd")}`);
          }
        } else if (!t.isRecurring && t.expenseType !== 'installment' && t.effectiveMonth === targetEffectiveMonth) { // Non-recurring, non-installment
          monthlyDisplayTransactions.push(t);
          console.log(`Dashboard: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}`);
        }
      }
    });

    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentExpenses: Found ${sorted.length} items for display.`);
    return sorted;
  }, [transactions, displayedDate, displayedMonthYearLabel, translate]); // translate added

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
            <Skeleton className="h-10 w-1/3 mb-4" /> {/* For month nav placeholder */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={`summary-skel-${i}`} className="h-24 w-full" />)}
            </div>
             <Card className="shadow-lg bg-muted/50">
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <Terminal className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
                <div className="flex-grow">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
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
         <Card className="shadow-lg bg-muted/50">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Terminal className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
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
                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center">
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

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center">
                    <p className="text-sm font-medium text-foreground mb-1">
                      {translate({ en: "Total", pt: "Total de Gastos" })}
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

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center">
                   <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Total", pt: "Total de Gastos" })}
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
          onSave={onAddTransaction} // Changed from onAddTransaction to onSave
          currentDisplayedDate={displayedDate}
          userCategories={userCategories} // Pass down
          userPaymentMethods={userPaymentMethods} // Pass down
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
