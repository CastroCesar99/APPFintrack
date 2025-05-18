
'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, DisplayPaymentMethod, CategoryName } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel, PAYMENT_METHODS, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
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

  console.log("DashboardPage TRACER --- Top of component. displayedDate for QuickActionsSection:", displayedDate.toISOString());

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
  const unsubscribeTransactionsRef = useRef<(() => void) | null>(null);
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  useEffect(() => {
    console.log("DashboardPage: TRACER --- isClient useEffect mounting");
    setIsClient(true);
    effectMountedRef.current = true;
    return () => {
      console.log("DashboardPage: TRACER --- isClient useEffect UNMOUNTING, setting effectMountedRef to false");
      effectMountedRef.current = false; 
    };
  }, []);

  const cleanupListener = useCallback((listenerRef: React.MutableRefObject<(() => void) | null>, type: string) => {
    if (listenerRef.current && typeof listenerRef.current === 'function') {
      console.log(`DashboardPage: TRACER --- cleanupListener: Unsubscribing ${type} for UserID:`, mainFetchInitiatedForUser.current);
      listenerRef.current();
      listenerRef.current = null;
    }
  }, []);

  // Listener for User Preferences
  useEffect(() => {
    if (!effectMountedRef.current) {
      console.log("DashboardPage: TRACER --- Preferences effect: Early exit, component unmounted.");
      if (isLoadingPreferences) setIsLoadingPreferences(false); // Ensure reset
      return;
    }
    if (!isClient) {
      console.log("DashboardPage: TRACER --- Preferences effect: Early exit, not client yet.");
      if (isLoadingPreferences) setIsLoadingPreferences(false);
      return;
    }
    if (authLoading) {
      console.log("DashboardPage: TRACER --- Preferences effect: Early exit, auth is loading.");
      if (isLoadingPreferences) setIsLoadingPreferences(false);
      return;
    }
    if (!userId) {
      console.log("DashboardPage: TRACER --- Preferences effect: Early exit, no userId.");
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        if (isLoadingPreferences) setIsLoadingPreferences(false);
      }
      cleanupListener(unsubscribePreferencesRef, "preferences");
      return;
    }

    console.log("DashboardPage: TRACER --- Preferences effect: Setting up REAL-TIME listener for UserID:", userId);
    if (effectMountedRef.current && !isLoadingPreferences) setIsLoadingPreferences(true);
    
    const preferencesDocRef = doc(db, 'users', userId, 'preferences/userPreferences');
    cleanupListener(unsubscribePreferencesRef, "preferences"); 

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences snapshot: Effect unmounted for UserID:", userId);
        return;
      }
      console.log("DashboardPage: TRACER --- Preferences snapshot received for UserID:", userId);
      let finalCategories: DisplayCategory[] = [];
      let finalPaymentMethods: DisplayPaymentMethod[] = [];
      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        const userDefinedCategoriesFromPrefs = prefsData.userDefinedCategories || [];
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        finalCategories = CATEGORIES.filter(pCat => !deselectedPredefinedCatNames.has(pCat.name.toLowerCase())).map(pCat => {
                const customOverride = userDefinedCategoriesFromPrefs.find(udc => udc.name.toLowerCase() === pCat.name.toLowerCase());
                return customOverride ? { ...pCat, ...customOverride } : pCat;
            });
        userDefinedCategoriesFromPrefs.forEach(udc => {
            if (!finalCategories.some(fc => fc.name.toLowerCase() === udc.name.toLowerCase())) finalCategories.push(udc);
        });
        const userDefinedPaymentMethodsFromPrefs = prefsData.userDefinedPaymentMethods || [];
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        finalPaymentMethods = PAYMENT_METHODS.filter(pPm => !deselectedPredefinedPmNames.has(pPm.name.toLowerCase())).map(pPm => {
                const customOverride = userDefinedPaymentMethodsFromPrefs.find(udpm => udpm.name.toLowerCase() === pPm.name.toLowerCase());
                return customOverride ? { ...pPm, ...customOverride } : pPm;
            });
        userDefinedPaymentMethodsFromPrefs.forEach(udpm => {
            if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === udpm.name.toLowerCase())) finalPaymentMethods.push(udpm);
        });
      } else {
        finalCategories = [...CATEGORIES];
        finalPaymentMethods = [...PAYMENT_METHODS];
      }
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        setIsLoadingPreferences(false);
      }
    }, (error) => {
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: TRACER --- Error listening to user preferences for UserID:", userId, error);
      toast({ title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }), variant: "destructive" });
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)))); 
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)))); 
        setIsLoadingPreferences(false);
      }
    });
    return () => cleanupListener(unsubscribePreferencesRef, "preferences");
  }, [userId, isClient, authLoading, language, toast, translate, cleanupListener]);


 // Main useEffect for transactions
 useEffect(() => {
    const fullCleanup = () => {
      console.log("DashboardPage: TRACER --- Main TX useEffect FULL CLEANUP for UserID:", mainFetchInitiatedForUser.current);
      cleanupListener(unsubscribeTransactionsRef, "transactions");
    };

    if (!isClient) {
      if(isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
      return fullCleanup;
    }
    if (authLoading) {
      if(isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
      return fullCleanup;
    }
    if (!userId) {
      if (effectMountedRef.current) {
        setTransactions([]);
        if(isLoadingTransactions) setIsLoadingTransactions(false);
        mainFetchInitiatedForUser.current = null; 
        router.push('/login');
      }
      return fullCleanup;
    }

    const fetchDataInternal = async (currentUserId: string) => {
      if (!effectMountedRef.current) {
        if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
        return;
      }
      
      try {
        const userDocRef = doc(db, "users", currentUserId);
        const userDocSnap = await getDoc(userDocRef);
        if (!effectMountedRef.current) { 
            if(isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
            return; 
        }
        if (!userDocSnap.exists() || !userDocSnap.data().onboardingComplete) {
          if (effectMountedRef.current) {
            if(isLoadingTransactions) setIsLoadingTransactions(false);
            router.push('/onboarding');
          }
          return;
        }
        
        const transactionsColRef = collection(db, 'users/' + currentUserId + '/transactions');
        const q_transactions = query(transactionsColRef, orderBy("date", "desc"));
        cleanupListener(unsubscribeTransactionsRef, "transactions stale");
        
        unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
          if (!effectMountedRef.current) return;
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
                    catch { try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd"); } catch { dateString = formatDateFns(new Date(), "yyyy-MM-dd"); }}
                } else { dateString = formatDateFns(new Date(), "yyyy-MM-dd"); }
            } else { dateString = formatDateFns(new Date(), "yyyy-MM-dd"); }
            if (dateString && !effectiveMonthString) { 
              try { effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM"); } 
              catch { effectiveMonthString = formatDateFns(new Date(), "yyyy-MM"); }
            } else if (effectiveMonthString && !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
                 try { effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM"); } 
                 catch { effectiveMonthString = formatDateFns(new Date(), "yyyy-MM"); }
            }
            return { ...data, id: docSnap.id, date: dateString, effectiveMonth: effectiveMonthString, isRecurring: data.isRecurring === true } as Transaction;
          });
          if (effectMountedRef.current) {
            setTransactions(fetchedTransactions);
            if (isLoadingTransactions) setIsLoadingTransactions(false);
          }
        }, (error: any) => {
          if (!effectMountedRef.current) return;
          console.error("DashboardPage: TRACER --- Transaction onSnapshot: Error listening:", error);
          if (effectMountedRef.current) {
            toast({ title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }), variant: "destructive" });
            setTransactions([]);
            if (isLoadingTransactions) setIsLoadingTransactions(false);
          }
        });
      } catch (error: any) {
        if (!effectMountedRef.current) {
            if(isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
            return;
        }
        console.error("DashboardPage: TRACER --- fetchDataInternal (TX): Error in main logic:", error);
        if (effectMountedRef.current) {
          toast({ title: translate({ en: "Error", pt: "Erro" }), variant: "destructive" });
          setTransactions([]);
          if (isLoadingTransactions) setIsLoadingTransactions(false);
        }
      }
    };
    
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeTransactionsRef.current) {
      if (effectMountedRef.current && !isLoadingTransactions) setIsLoadingTransactions(true);
      mainFetchInitiatedForUser.current = userId;
      fetchDataInternal(userId);
    } else {
      if(effectMountedRef.current && isLoadingTransactions && !unsubscribeTransactionsRef.current) {
        if (effectMountedRef.current) setIsLoadingTransactions(false); 
      }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient, router, toast, translate, cleanupListener]);


 const loadBudgets = useCallback(async () => {
    if (!effectMountedRef.current) return;
    if (!userId || !isClient) { 
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        if (isLoadingBudgets) setIsLoadingBudgets(false);
      }
      return;
    }
    
    let budgetsStillLoading = true;
    if (effectMountedRef.current) setIsLoadingBudgets(true);

    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    const budgetDocRef = doc(db, 'users', userId, 'budgets', budgetMonthKey);
    
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) {
          budgetsStillLoading = false; // Ensure flag is updated if unmounted during fetch
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
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: TRACER --- LoadBudgets: Error loading budgets:", error);
      if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), variant: "destructive" });
    } finally {
      if (effectMountedRef.current && budgetsStillLoading) setIsLoadingBudgets(false);
    }
  }, [userId, isClient, displayedDate, toast, translate]); 

  useEffect(() => {
    if (userId && isClient && !authLoading) { 
        loadBudgets();
    } else if (effectMountedRef.current) { 
        setLoadedBudgetsForMonth(null);
        if (isLoadingBudgets) setIsLoadingBudgets(false);
    }
  }, [userId, isClient, authLoading, displayedDate, loadBudgets]);


  const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    
    const effectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const fullPayload = {
      ...newTransactionData,
      userId: userId,
      createdAt: serverTimestamp(),
      effectiveMonth: effectiveMonth, 
    };
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;
    if (dataToSave.type === 'expense' && dataToSave.isRecurring === undefined && dataToSave.expenseType !== 'recurring' && dataToSave.expenseType !== 'installment') {
        dataToSave.isRecurring = false;
    } else if (dataToSave.type === 'income' && dataToSave.isRecurring === undefined) {
        dataToSave.isRecurring = false;
    }
    try {
      const transactionsColRef = collection(db, 'users', userId, 'transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" })});
    } catch (error: any) {
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), variant: "destructive" });
    }
  }, [userId, toast, translate, displayedDate]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);
    if (transactions.length === 0) return [];
    const filtered: Transaction[] = [];
    transactions.forEach(t => {
      let includeTransaction = false;
      const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        if (monthDiff >= 0 && monthDiff < t.installments) includeTransaction = true;
      } else if (t.isRecurring === true && (t.expenseType !== 'installment')) {
        const originalTxYear = getYearFns(originalTransactionDate);
        const originalTxMonth = getMonthFns(originalTransactionDate);
        if (originalTxYear < targetYear || (originalTxYear === targetYear && originalTxMonth <= targetMonth)) {
          includeTransaction = true;
        }
      } else { 
        if (t.effectiveMonth === targetEffectiveMonth) includeTransaction = true;
      }
      if (includeTransaction) filtered.push(t);
    });
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
    expensesThisPeriod.forEach(tx => { expensesByCategory[tx.category as string] = (expensesByCategory[tx.category as string] || 0) + tx.amount; });
    let maxAmount = 0; let largestCategoryKey: string | null = null;
    for (const key in expensesByCategory) { if (expensesByCategory[key] > maxAmount) { maxAmount = expensesByCategory[key]; largestCategoryKey = key; } }
    if (largestCategoryKey) {
      let categoryDetail = userCategories.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase()) || 
                           CATEGORIES.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase()) || 
                           { name: largestCategoryKey!, type: 'expense', icon: 'CircleHelp', label: { en: largestCategoryKey!, pt: largestCategoryKey! } };
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
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) { 
          monthlyDisplayTransactions.push(t);
        }
      }
    });
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [transactions, displayedDate]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0,5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
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
            monthlyDisplayTransactions.push({ ...t, date: formatDateFns(projectedDate, "yyyy-MM-dd"), effectiveMonth: targetEffectiveMonth, description: `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`, id: `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}` });
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
          }
        } else if ((!t.isRecurring || t.isRecurring === false) && (!t.expenseType || t.expenseType !== 'installment')) { 
          if (t.effectiveMonth === targetEffectiveMonth) {
            monthlyDisplayTransactions.push(t);
          }
        }
      }
    });
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [transactions, displayedDate, translate]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);

  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;

  if (overallLoading) {
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
                    <div key={`spending-sum-skel-${i}`} className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md">
                      <Skeleton className="h-5 w-3/5 mb-2"/>
                      <Skeleton className="h-7 w-7 mb-1 rounded-full"/>
                      <Skeleton className="h-5 w-4/5 mb-1"/>
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
                    <p className="text-sm text-muted-foreground mt-2">{translate({ en: "N/A", pt: "N/D"})}</p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md">
                  <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Total Expenses", pt: "Total de Gastos"})}</p>
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
                  <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Total Expenses", pt: "Total de Gastos"})}</p>
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

    