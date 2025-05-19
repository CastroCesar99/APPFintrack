
'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, PaymentMethodName, DisplayPaymentMethod } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel, PAYMENT_METHODS, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { Package, Wallet, TrendingUp, TrendingDown, DollarSign, ListChecks } from "lucide-react";
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


  console.log("DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection:", displayedDate.toISOString());

  useEffect(() => {
    console.log("DashboardPage: TRACER --- isClient useEffect running");
    setIsClient(true);
    effectMountedRef.current = true; // Set to true when component mounts
    return () => {
      console.log("DashboardPage: TRACER --- isClient useEffect UNMOUNTING");
      effectMountedRef.current = false; // Set to false when component unmounts
    };
  }, []);

  const cleanupListener = useCallback((listenerRef: React.MutableRefObject<(() => void) | null>, type: string, currentUserIdForCleanup?: string | null) => {
    if (listenerRef.current && typeof listenerRef.current === 'function') {
      console.log(`DashboardPage: TRACER --- cleanupListener: Unsubscribing ${type} for UserID:`, currentUserIdForCleanup || "N/A");
      listenerRef.current();
      listenerRef.current = null;
    } else {
      console.log(`DashboardPage: TRACER --- cleanupListener: No listener to unsubscribe or ref is not a function for ${type}, UserID:`, currentUserIdForCleanup || "N/A");
    }
  }, []);

  // Effect for User Preferences
  useEffect(() => {
    console.log(`DashboardPage: TRACER --- Preferences useEffect START. UserID: ${userId}, AuthLoading: ${authLoading}, isClient: ${isClient}`);
    if (!isClient || authLoading || !userId) {
      if (effectMountedRef.current) {
        const allPredefinedCategories: DisplayCategory[] = [...CATEGORIES];
        const allPredefinedPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        
        setUserCategories(allPredefinedCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(allPredefinedPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Preferences useEffect: No user/auth/client, setting defaults. isLoadingPreferences set to false.");
      }
      cleanupListener(unsubscribePreferencesRef, "preferences stale (no user/auth/client)", userId);
      return;
    }

    if (effectMountedRef.current) setIsLoadingPreferences(true);
    console.log("DashboardPage: TRACER --- Preferences useEffect: Setting up REAL-TIME listener for UserID:", userId);
    const preferencesDocRef = doc(db, 'users', userId, 'preferences/userPreferences');
    
    cleanupListener(unsubscribePreferencesRef, "preferences stale before new", userId); 

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences snapshot: Effect unmounted for UserID:", userId);
        return;
      }
      console.log("DashboardPage: TRACER --- Preferences snapshot received for UserID:", userId, "Exists:", docSnap.exists());
      let finalCategories: DisplayCategory[] = [];
      let finalPaymentMethods: DisplayPaymentMethod[] = [];

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        // Combine predefined categories with user-defined ones (overrides)
        const customCategoriesMap = new Map((prefsData.userDefinedCategories || []).map(cc => [cc.name.toLowerCase(), cc]));
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));

        finalCategories = CATEGORIES
            .filter(pCat => !deselectedPredefinedCatNames.has(pCat.name.toLowerCase()))
            .map(pCat => {
                const customOverride = customCategoriesMap.get(pCat.name.toLowerCase());
                return customOverride ? { ...pCat, ...customOverride } : pCat;
            });
        
        // Add any purely custom categories (not overrides of predefined)
        (prefsData.userDefinedCategories || []).forEach(customCat => {
            if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
                finalCategories.push(customCat);
            }
        });
        
        // Combine predefined payment methods with user-defined ones
        const customPaymentMethodsMap = new Map((prefsData.userDefinedPaymentMethods || []).map(cpm => [cpm.name.toLowerCase(), cpm]));
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        
        finalPaymentMethods = PAYMENT_METHODS
            .filter(pPm => !deselectedPredefinedPmNames.has(pPm.name.toLowerCase()))
            .map(pPm => {
                const customOverride = customPaymentMethodsMap.get(pPm.name.toLowerCase());
                return customOverride ? { ...pPm, ...customOverride } : pPm;
            });
        
        (prefsData.userDefinedPaymentMethods || []).forEach(customPm => {
            if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customPm.name.toLowerCase())) {
                finalPaymentMethods.push(customPm);
            }
        });

      } else { 
        console.log("DashboardPage: TRACER --- Preferences snapshot: No preferences doc found for UserID:", userId, "Using all predefined.");
        finalCategories = [...CATEGORIES];
        finalPaymentMethods = [...PAYMENT_METHODS];
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
      toast({ title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }), description: translate({en: "Could not load your settings.", pt: "Não foi possível carregar suas configurações."}), variant: "destructive" });
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)))); 
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)))); 
        setIsLoadingPreferences(false);
      }
    });
    return () => cleanupListener(unsubscribePreferencesRef, "preferences", userId);
  }, [userId, isClient, authLoading, language, toast, translate, cleanupListener]);


  // Effect for Transactions
  useEffect(() => {
    console.log(`DashboardPage: TRACER --- Main data fetching useEffect START. UserID: ${userId}, AuthLoading: ${authLoading}, isClient: ${isClient}, InitiatedFor: ${mainFetchInitiatedForUser.current}`);
    
    if (!isClient) {
      console.log("DashboardPage: TRACER --- Main useEffect: Not client yet, waiting.");
      // Do not set isLoadingTransactions to false here, let overallLoading handle it
      return;
    }
    if (authLoading) {
      console.log("DashboardPage: TRACER --- Main useEffect: Auth is loading, waiting...");
      // Do not set isLoadingTransactions to false here
      return;
    }
    if (!userId) {
      console.log("DashboardPage: TRACER --- Main useEffect: No user ID, redirecting to login. Cleaning up listeners.");
      cleanupListener(unsubscribeTransactionsRef, "transactions (no userId)", userId);
      mainFetchInitiatedForUser.current = null;
      if (effectMountedRef.current) {
        setTransactions([]);
        setIsLoadingTransactions(false);
      }
      router.push('/login');
      return;
    }

    // Only proceed if this user's data hasn't been fetched yet OR if listener was lost
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeTransactionsRef.current) {
      console.log(`DashboardPage: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: ${userId}. PrevInitiatedFor: ${mainFetchInitiatedForUser.current}. ListenerExisted: ${!!unsubscribeTransactionsRef.current}`);
      cleanupListener(unsubscribeTransactionsRef, "transactions stale before new", userId); 
      mainFetchInitiatedForUser.current = userId; 

      const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
          console.log("DashboardPage: TRACER --- fetchDataInternal: Unmounted before starting.");
          if (effectMountedRef.current) setIsLoadingTransactions(false);
          return;
        }
        console.log("DashboardPage: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", currentUserId);
        if (effectMountedRef.current) setIsLoadingTransactions(true);
        console.log("DashboardPage: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

        try {
          const userDocRef = doc(db, "users", currentUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (!effectMountedRef.current) {
            console.log("DashboardPage: TRACER --- fetchDataInternal: Unmounted during userDoc fetch.");
            if (effectMountedRef.current) setIsLoadingTransactions(false);
            return;
          }

          if (!userDocSnap.exists()) {
            if (effectMountedRef.current) {
              setIsLoadingTransactions(false);
              console.log("DashboardPage: TRACER --- fetchDataInternal: User document not found for UserID:", currentUserId, ". Redirecting to onboarding (was signup).");
              router.push('/onboarding'); 
            }
            return;
          }
          if (!userDocSnap.data()?.onboardingComplete) {
            if (effectMountedRef.current) {
              setIsLoadingTransactions(false);
              console.log("DashboardPage: TRACER --- fetchDataInternal: User onboarding incomplete for UserID:", currentUserId, ". Redirecting to onboarding.");
              router.push('/onboarding');
            }
            return;
          }
          
          console.log("DashboardPage: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener.");
          const transactionsColRef = collection(db, 'users', currentUserId, 'transactions');
          const q_transactions = query(transactionsColRef, orderBy("date", "desc"));
          
          if (unsubscribeTransactionsRef.current) {
            console.log("DashboardPage: TRACER --- fetchDataInternal: Stale snapshot ref found before new onSnapshot. Cleaning up again.");
            unsubscribeTransactionsRef.current();
            unsubscribeTransactionsRef.current = null;
          }

          unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
            if (!effectMountedRef.current) {
              console.log("DashboardPage: TRACER --- onSnapshot: Effect unmounted for UserID:", currentUserId);
              return;
            }
            console.log("DashboardPage: TRACER --- onSnapshot: Received data for UserID:", currentUserId, "Empty:", querySnapshot.empty, "PendingWrites:", querySnapshot.metadata.hasPendingWrites);
            const fetchedTransactions = querySnapshot.docs.map(docSnap => {
              const data = docSnap.data();
              let dateString = data.date; 
              let effectiveMonthString = data.effectiveMonth;

              if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
                dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
              } else if (typeof data.date === 'string') {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) { /* OK */ } 
                  else if (data.date.includes('T')) { 
                      try { dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); } 
                      catch (e1){ 
                        try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd"); }
                        catch(e2) { 
                            console.warn("DashboardPage TX Date Parse (string T): Failed for tx " + docSnap.id + ":", data.date, e2);
                            dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                        }
                      }
                  } else { 
                      console.warn("DashboardPage TX Date Parse (string other): Unhandled format for tx " + docSnap.id + ":", data.date, "Attempting general parse.");
                      try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");}
                      catch(e) {
                          console.warn("DashboardPage TX Date Parse (string other general): Failed for tx " + docSnap.id + ":", data.date, e, "Fallback to current date.");
                          dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                      }
                  }
              } else { 
                 console.warn("DashboardPage TX Date Parse (missing/invalid): Missing or invalid date for tx " + docSnap.id + ":", data.date, "Fallback to current date.");
                 dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
              }

              if (dateString && (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) ) { 
                  try { effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM"); } 
                  catch (e){ 
                      console.warn('DashboardPage TX effectiveMonth Derivation: Failed for tx ' + docSnap.id + ' from date ' + dateString, e, "Fallback to current month.");
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
                  installments: data.installments
              } as Transaction;
            });
            if (effectMountedRef.current) {
              console.log("DashboardPage: TRACER --- onSnapshot: Setting", fetchedTransactions.length, "transactions for UserID:", currentUserId);
              setTransactions(fetchedTransactions);
              console.log("DashboardPage: TRACER --- setIsLoadingTransactions(false) after processing snapshot data for UserID:", currentUserId);
              setIsLoadingTransactions(false);
            }
          }, (error: any) => {
            if (!effectMountedRef.current) return;
            console.error("DashboardPage: TRACER --- Transaction onSnapshot: Error listening for UserID:", currentUserId, error);
            toast({ title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }), description: translate({en: "Could not load transactions.", pt: "Não foi possível carregar as transações."}), variant: "destructive" });
            if (effectMountedRef.current) {
              setTransactions([]);
              setIsLoadingTransactions(false);
              console.log("DashboardPage: TRACER --- Transactions snapshot ERROR: isLoadingTransactions set to false.");
            }
          });
        } catch (error) {
          if (!effectMountedRef.current) return;
          console.error("DashboardPage: TRACER --- fetchDataInternal: Error for UserID:", currentUserId, error);
          toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({en: "An error occurred loading data.", pt: "Ocorreu um erro ao carregar os dados."}), variant: "destructive" });
          if (effectMountedRef.current) {
            setTransactions([]);
            setIsLoadingTransactions(false); 
            console.log("DashboardPage: TRACER --- fetchDataInternal CATCH: isLoadingTransactions set to false.");
          }
        }
      };
      
      fetchDataInternal(userId);
    } else {
      console.log(`DashboardPage: TRACER --- Main useEffect: Data already initiated or listener exists for UserID: ${userId}. PrevInitiatedFor: ${mainFetchInitiatedForUser.current}. ListenerExisted: ${!!unsubscribeTransactionsRef.current}`);
      if (effectMountedRef.current && !authLoading && userId && !unsubscribeTransactionsRef.current) { // If listener somehow got lost, re-initiate
          console.warn("DashboardPage: TRACER --- Listener was lost, re-initiating fetch.");
          mainFetchInitiatedForUser.current = null; // Force re-initiation in next effect run if needed or call fetchDataInternal directly
          // This case might need a direct call to fetchDataInternal(userId) or a mechanism to re-trigger the if block.
          // For now, simply logging and ensuring loading is false if no refetch is triggered.
          setIsLoadingTransactions(false);
      } else if (effectMountedRef.current && !authLoading && userId) {
         setIsLoadingTransactions(false); 
      }
    }
    return () => {
      const currentInitiatedUser = mainFetchInitiatedForUser.current; // Capture for log
      console.log("DashboardPage: TRACER --- Main data fetching useEffect FULL CLEANUP for UserID:", currentInitiatedUser);
      cleanupListener(unsubscribeTransactionsRef, "transactions on cleanup", currentInitiatedUser);
      // Do not reset mainFetchInitiatedForUser.current here; it's reset on logout or user change.
    };
  }, [userId, authLoading, isClient, router, toast, translate, cleanupListener]);


 const loadBudgets = useCallback(async () => {
    if (!effectMountedRef.current || !userId || !isClient) {
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false);
      }
      return;
    }
    
    if(effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log('DashboardPage: TRACER --- Loading budgets for user ' + userId + ', month: ' + budgetMonthKey);
    const budgetDocRef = doc(db, 'users', userId, 'budgets', budgetMonthKey);
    
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) { 
        if (effectMountedRef.current) setIsLoadingBudgets(false);
        return;
      }
      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, any>;
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
         if (effectMountedRef.current) setIsLoadingBudgets(false);
         return;
      }
      console.error("DashboardPage: TRACER --- LoadBudgets: Error loading budgets for UserID:", userId, "Month:", budgetMonthKey, error);
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({en: "Could not load your budget data for this month.", pt: "Não foi possível carregar seus dados de orçamento para este mês."}), variant: "destructive" });
      if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
    } finally {
      if (effectMountedRef.current) {
        setIsLoadingBudgets(false);
      }
    }
  }, [userId, isClient, displayedDate, toast, translate]); 

  useEffect(() => {
    console.log(`DashboardPage: TRACER --- Budgets useEffect START. UserID: ${userId}, AuthLoading: ${authLoading}, isClient: ${isClient}, DisplayedDate: ${displayedDate.toISOString()}`);
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
    
    const transactionDateObject = parseDateFns(newTransactionData.date, "yyyy-MM-dd", new Date());
    const effectiveMonthForNewTx = formatDateFns(displayedDate, "yyyy-MM");
    
    console.log("Dashboard: TRACER --- onAddTransaction: Received date from form:", newTransactionData.date);
    console.log("Dashboard: TRACER --- onAddTransaction: Using effectiveMonth from displayedDate:", effectiveMonthForNewTx);
    console.log("Dashboard: TRACER --- onAddTransaction: Full newTransactionData:", newTransactionData);


    const fullPayload = {
      ...newTransactionData, 
      userId: userId,
      createdAt: serverTimestamp(),
      effectiveMonth: effectiveMonthForNewTx, 
      date: newTransactionData.date, // Keep original date from form as "YYYY-MM-DD"
    };

    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;
    
    if (dataToSave.type === 'expense' && dataToSave.isRecurring === undefined && dataToSave.expenseType !== 'recurring' && dataToSave.expenseType !== 'installment') {
        dataToSave.isRecurring = false;
    } else if (dataToSave.type === 'income' && dataToSave.isRecurring === undefined) {
        dataToSave.isRecurring = false;
    }
    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with date:", newTransactionData.date, "Full dataToSave:", dataToSave);

    try {
      const transactionsColRef = collection(db, 'users', userId, 'transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: `${newTransactionData.description} ${translate({en:"added.", pt:"adicionada."})}`});
    } catch (error: any) {
      console.error("Dashboard: TRACER --- onAddTransaction: Error adding transaction for UserID:", userId, error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: error.message || translate({en:"Could not save your transaction.", pt: "Não foi possível salvar sua transação."}), variant: "destructive" });
    }
  }, [userId, toast, translate, displayedDate]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); 

    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year: ${targetYear} Month: ${targetMonth} (0-indexed for ${displayedMonthYearLabel}), TargetEffMonth: ${targetEffectiveMonth} All transactions count: ${transactions.length}`);
    
    if (!transactions || transactions.length === 0) {
      console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
      return [];
    }
    
    let filtered: Transaction[] = [];
    transactions.forEach(t => {
      let includeTransaction = false;
      let reason = "";
      let originalTransactionDate: Date | null = null;

      try {
        originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
      } catch (e) {
        console.warn(`Dashboard TX Filter: Could not parse t.date '${t.date}' for tx ID ${t.id}. Skipping. Error: ${e}`);
        return; 
      }

      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        const isInstallmentActiveThisMonth = monthDiff >= 0 && monthDiff < t.installments;
        reason = "Installment Check";
        if (isInstallmentActiveThisMonth) includeTransaction = true;
        console.log(`Dashboard: TRACER --- Tx Filter (Installment Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, StartSeries: ${installmentSeriesStartDate.toISOString()}, TargetMonthStart: ${firstDayOfTargetMonth.toISOString()}, monthDiff: ${monthDiff}, installments: ${t.installments}, isActive: ${isInstallmentActiveThisMonth}, isRec: ${t.isRecurring}, expType: ${t.expenseType}`);
      } else if (t.isRecurring === true && (t.expenseType !== 'installment')) { 
        const originalTxYear = getYearFns(originalTransactionDate);
        const originalTxMonth = getMonthFns(originalTransactionDate);
        const isRecurringActiveThisMonth = originalTxYear < targetYear || (originalTxYear === targetYear && originalTxMonth <= targetMonth);
        reason = "Recurring Check";
        if (isRecurringActiveThisMonth) includeTransaction = true;
        console.log(`Dashboard: TRACER --- Tx Filter (Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, OrigY: ${originalTxYear}, OrigM: ${originalTxMonth}, TargetY: ${targetYear}, TargetM: ${targetMonth}, isActive: ${isRecurringActiveThisMonth}, isRec: ${t.isRecurring}, expType: ${t.expenseType}`);
      } else if ((!t.isRecurring || t.isRecurring === false) && (!t.expenseType || t.expenseType !== 'installment')) { 
        const transactionEffectiveMonthToUse = t.effectiveMonth || formatDateFns(originalTransactionDate, "yyyy-MM");
        reason = "Non-Recurring Check";
        if (transactionEffectiveMonthToUse === targetEffectiveMonth) {
          includeTransaction = true;
        }
        console.log(`Dashboard: TRACER --- Tx Filter (Non-Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, EffMonth: ${transactionEffectiveMonthToUse}, TargetEffMonth: ${targetEffectiveMonth}, MatchesNonRec: ${includeTransaction}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);
      }
      
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Found ${filtered.length} transactions for the period.`);
    return filtered;
  }, [transactions, displayedDate, displayedMonthYearLabel]); // displayedMonthYearLabel for logging only


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
    expensesThisPeriod.forEach(tx => { expensesByCategory[tx.category as string] = (expensesByCategory[tx.category as string] || 0) + tx.amount; });
    let maxAmount = 0; let largestCategoryKey: string | null = null;
    for (const key in expensesByCategory) { if (expensesByCategory[key] > maxAmount) { maxAmount = expensesByCategory[key]; largestCategoryKey = key; } }
    if (largestCategoryKey) {
      let categoryDetail = userCategories.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase());
      if (!categoryDetail) { 
          categoryDetail = CATEGORIES.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase()) || 
                           { name: largestCategoryKey!, type: 'expense', icon: 'CircleHelp', label: { en: largestCategoryKey!, pt: largestCategoryKey! } };
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
    console.log(`Dashboard: TRACER --- recentIncome: Recalculating for ${displayedMonthYearLabel}. Total transactions in 'transactions' state: ${transactions.length}`);
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
            monthlyDisplayTransactions.push({ ...t, date: formatDateFns(projectedDate, "yyyy-MM-dd"), effectiveMonth: targetEffectiveMonth, id: `${t.id}_proj_${targetEffectiveMonth}` });
            console.log(`Dashboard: TRACER --- recentIncome: Added projected recurring: ${t.description}, Orig Date: ${t.date}, Projected Date: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) { 
          monthlyDisplayTransactions.push(t);
          console.log(`Dashboard: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}`);
        }
      }
    });
    console.log(`Dashboard: TRACER --- recentIncome: Found ${monthlyDisplayTransactions.length} items for display.`);
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [transactions, displayedDate, displayedMonthYearLabel]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0,5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    console.log(`Dashboard: TRACER --- recentExpenses: Recalculating for ${displayedMonthYearLabel}. Total transactions in 'transactions' state: ${transactions.length}`);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'expense') {
        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          const originalInstallmentStartDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          const monthDiff = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(originalInstallmentStartDate));
          const currentInstallmentNum = monthDiff + 1;

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            const projectedDateDay = getDateFns(originalInstallmentStartDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
             if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
            }
            const installmentDescription = `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`;
            monthlyDisplayTransactions.push({ ...t, date: formatDateFns(projectedDate, "yyyy-MM-dd"), effectiveMonth: targetEffectiveMonth, description: installmentDescription, id: `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}` });
            console.log(`Dashboard: TRACER --- recentExpenses: Added projected installment: ${installmentDescription}, Orig Date: ${t.date}, Projected Date: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
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
            monthlyDisplayTransactions.push({ ...t, date: formatDateFns(projectedDate, "yyyy-MM-dd"), effectiveMonth: targetEffectiveMonth, id: `${t.id}_proj_${targetEffectiveMonth}` });
            console.log(`Dashboard: TRACER --- recentExpenses: Added projected recurring: ${t.description}, Orig Date: ${t.date}, Projected Date: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          }
        } else if ((!t.isRecurring || t.isRecurring === false) && (!t.expenseType || t.expenseType !== 'installment')) { 
          if (t.effectiveMonth === targetEffectiveMonth) {
            monthlyDisplayTransactions.push(t);
            console.log(`Dashboard: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}`);
          }
        }
      }
    });
    console.log(`Dashboard: TRACER --- recentExpenses: Found ${monthlyDisplayTransactions.length} items for display.`);
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [transactions, displayedDate, translate, displayedMonthYearLabel]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);

  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;
  console.log(`DashboardPage: TRACER --- Rendering. overallLoading: ${overallLoading}. isClient: ${isClient}, authLoading: ${authLoading}, isLoadingTransactions: ${isLoadingTransactions}, isLoadingPreferences: ${isLoadingPreferences}, isLoadingBudgets: ${isLoadingBudgets}`);

  if (overallLoading) {
    console.log("DashboardPage: TRACER --- RENDERING LOADING SCREEN.");
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full p-4">
          <div className="space-y-4 w-full">
            <Skeleton className="h-10 w-1/3 mb-4" /> 
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={`summary-skel-${i}`} className="h-24 w-full" />)}
            </div>
             <Card className="shadow-lg bg-background dark:bg-card">
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <div className="flex-grow">
                  <Skeleton className="h-6 w-1/2 mb-2"/>
                  <Skeleton className="h-4 w-3/4"/>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={`spending-sum-skel-${i}`} className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                         <Skeleton className="h-5 w-3/5 mb-2"/>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Skeleton className="h-7 w-7 mb-1 rounded-full"/>
                        <Skeleton className="h-5 w-4/5 mb-1"/>
                      </div>
                      <Skeleton className="h-7 w-2/5"/>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md bg-muted/50">
                <CardHeader><Skeleton className="h-6 w-1/4"/></CardHeader>
                <CardContent><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div></CardContent>
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
  console.log(`Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions: ${transactions.length} isLoadingTransactions: ${isLoadingTransactions} Displayed Period Transactions: ${transactionsForDisplayedPeriod.length}`);
  console.log(`DashboardPage TRACER --- RENDERING with: displayedMonth: ${displayedMonthYearLabel} transactionsInPeriod: ${transactionsForDisplayedPeriod.length} totalIncomeForSummary: ${totalIncomeForSummary} totalExpensesForSummary: ${totalExpensesForSummary}`);

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
                
                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
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
                    <p className="text-sm text-muted-foreground mt-2">{translate({ en: "N/A", pt: "N/D"})}</p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                  <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Total Fixed", pt: "Total de Gastos"})}</p>
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
                  <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Total Variable", pt: "Total de Gastos"})}</p>
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
    
      
    

