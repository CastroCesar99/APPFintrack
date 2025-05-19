
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Package, Wallet, FileText, DollarSign, Target, TrendingUp, TrendingDown } from "lucide-react";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, Category, CategoryName } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types"; // PAYMENT_METHODS might not be needed here
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, doc, getDoc } from "firebase/firestore";
import {
  format as formatDateFns,
  parseISO as parseISODateFns,
  parse as parseDateFns,
  startOfMonth,
  endOfMonth,
  getYear as getYearFns,
  getMonth as getMonthFns,
  getDate as getDateFns,
  setDate as setDateFnsDate,
  lastDayOfMonth,
  differenceInCalendarMonths,
  isWithinInterval,
  addMonths
} from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpenseCategoryBarChart } from '@/components/dashboard/charts/expense-category-bar-chart';
import { formatCurrency, cn } from '@/lib/utils';
import { ExportData } from '@/components/dashboard/export-data';
import { Progress } from "@/components/ui/progress";
import { CategoryIcon } from "@/components/icons";

interface BudgetComparisonItem {
  categoryInternalName: string;
  categoryName: string;
  icon: string;
  budgeted: number;
  actual: number;
  difference: number;
  percentage: number;
}

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const { translate, language } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  const [userDisplayCategories, setUserDisplayCategories] = useState<DisplayCategory[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  const [loadedBudgets, setLoadedBudgets] = useState<Record<string, number> | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);

  const [isClient, setIsClient] = useState(false);

  const effectMountedRef = useRef(true);
  const unsubscribeTransactionsRef = useRef<(() => void) | null>(null);
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIsClient(true);
    effectMountedRef.current = true;
    console.log("ReportsPage: Component mounted, effectMountedRef set to true");
    return () => {
      effectMountedRef.current = false;
      console.log("ReportsPage: Component unmounting, effectMountedRef set to false. Cleaning up listeners.");
      if (unsubscribeTransactionsRef.current) {
        console.log("ReportsPage: Unsubscribing transaction listener on unmount for UserID:", userId);
        unsubscribeTransactionsRef.current();
      }
      if (unsubscribePreferencesRef.current) {
        console.log("ReportsPage: Unsubscribing preferences listener on unmount for UserID:", userId);
        unsubscribePreferencesRef.current();
      }
    };
  }, [userId]); // Added userId to re-evaluate mounted state if user changes, though primary cleanup is still component unmount

  // Fetch All Transactions
  useEffect(() => {
    if (!isClient || authLoading || !userId) {
      if (effectMountedRef.current) {
        setAllTransactions([]);
        setIsLoadingTransactions(false);
      }
      if (unsubscribeTransactionsRef.current) {
        console.log("ReportsPage (TX Effect): Cleaning up stale transaction listener for UserID:", userId);
        unsubscribeTransactionsRef.current();
        unsubscribeTransactionsRef.current = null;
      }
      return;
    }

    if (effectMountedRef.current) setIsLoadingTransactions(true);
    console.log("ReportsPage (TX Effect): Setting up transaction listener for UserID:", userId);

    // Clean up previous listener before setting a new one
    if (unsubscribeTransactionsRef.current) {
        unsubscribeTransactionsRef.current();
        unsubscribeTransactionsRef.current = null;
    }
    
    const transactionsColRef = collection(db, 'users', userId, 'transactions');
    const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

    unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
      if (!effectMountedRef.current) {
        console.log("ReportsPage (TX Snapshot): Component unmounted, skipping state update for UserID:", userId);
        return;
      }
      console.log("ReportsPage (TX Snapshot): Transaction listener fired. Docs count:", querySnapshot.docs.length, "for UserID:", userId);
      const fetchedTransactions = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let dateString = "1970-01-01"; 
        let effectiveMonthString = data.effectiveMonth;

        if (data.date) {
          if (data.date instanceof Timestamp) {
            dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
          } else if (typeof data.date === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
              dateString = data.date;
            } else if (data.date.includes('T')) {
              try {
                dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
              } catch (e) {
                console.warn("ReportsPage: Failed to parse ISO date string: " + String(data.date), e);
                dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }
            } else {
                 console.warn("ReportsPage TX Date Parse (string other): Unhandled format for tx " + String(docSnap.id) + ": " + String(data.date) + ". Attempting general parse.");
                 try {
                    dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                 } catch (e) {
                    console.warn("ReportsPage TX Date Parse (string other general): Failed for tx " + String(docSnap.id) + ": " + String(data.date) + ". Error: " + String(e) + ". Fallback to current date.");
                    dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                 }
            }
          } else {
            console.warn("ReportsPage TX Date Parse (missing/invalid): Missing or invalid date for tx " + String(docSnap.id) + ": " + String(data.date) + ". Fallback to current date.");
            dateString = formatDateFns(new Date(), "yyyy-MM-dd");
          }
        }

        if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
          if (dateString !== "1970-01-01") {
            try {
              effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
            } catch (e) {
              console.warn('ReportsPage: Could not derive effectiveMonth from date ' + dateString + ' for tx ' + docSnap.id + '. Defaulting to current month. Error:' + String(e));
              effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
            }
          } else {
            effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
          }
        }
        return {
          ...data,
          id: docSnap.id,
          date: dateString,
          effectiveMonth: effectiveMonthString,
          expenseType: data.expenseType,
          installments: data.installments,
          isRecurring: data.isRecurring === true,
          expenseNature: data.expenseNature
        } as Transaction;
      });
      if (effectMountedRef.current) {
        setAllTransactions(fetchedTransactions);
        setIsLoadingTransactions(false);
      }
    }, (error) => {
      if (!effectMountedRef.current) {
        console.log("ReportsPage (TX Snapshot Error): Component unmounted, skipping error handling for UserID:", userId);
        return;
      }
      console.error("ReportsPage (TX Snapshot): Error fetching transactions for UserID:", userId, error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not fetch transactions.", pt: "Não foi possível buscar as transações." }),
        variant: "destructive",
      });
      if (effectMountedRef.current) {
        setAllTransactions([]);
        setIsLoadingTransactions(false);
      }
    });

    return () => {
      if (unsubscribeTransactionsRef.current) {
        console.log("ReportsPage (TX Effect Cleanup): Unsubscribing transaction listener for UserID:", userId);
        unsubscribeTransactionsRef.current();
        unsubscribeTransactionsRef.current = null;
      }
    };
  }, [userId, authLoading, isClient, toast, translate]); // Removed effectMountedRef as it is a ref

  // Fetch User Preferences for Categories
  useEffect(() => {
    if (!isClient || authLoading || !userId) {
      if (effectMountedRef.current) {
        setUserDisplayCategories([...CATEGORIES].sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
      }
      if (unsubscribePreferencesRef.current) {
        console.log("ReportsPage (Prefs Effect): Cleaning up stale preferences listener for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
      return;
    }

    if (effectMountedRef.current) setIsLoadingPreferences(true);
    console.log("ReportsPage (Prefs Effect): Setting up preferences listener for UserID:", userId);

    // Clean up previous listener
    if (unsubscribePreferencesRef.current) {
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
    }

    const preferencesDocRef = doc(db, "users", userId, "preferences/userPreferences");

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
         console.log("ReportsPage (Prefs Snapshot): Component unmounted, skipping state update for UserID:", userId);
        return;
      }
      console.log("ReportsPage (Prefs Snapshot): Preferences snapshot received for UserID:", userId);
      let finalCategories: DisplayCategory[] = [];
      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        const userDefinedCategoriesFromPrefs: CustomCategoryData[] = prefsData.userDefinedCategories || [];
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        
        const customCategoriesMap = new Map<string, CustomCategoryData>();
        userDefinedCategoriesFromPrefs.forEach(cc => customCategoriesMap.set(cc.name.toLowerCase(), cc));

        // Start with predefined categories that are not deselected
        finalCategories = CATEGORIES
          .filter(predefCat => !deselectedPredefinedCatNames.has(predefCat.name.toLowerCase()))
          .map(predefCat => {
            const customOverride = customCategoriesMap.get(predefCat.name.toLowerCase());
            if (customOverride) {
              customCategoriesMap.delete(predefCat.name.toLowerCase()); 
              return { ...predefCat, ...customOverride }; 
            }
            return predefCat;
          });
        
        customCategoriesMap.forEach(customCat => { 
          if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
            finalCategories.push(customCat);
          }
        });

      } else {
        console.log("ReportsPage (Prefs Snapshot): No preferences doc found for UserID:", userId, ". Using all predefined categories.");
        finalCategories = [...CATEGORIES];
      }

      if (effectMountedRef.current) {
        setUserDisplayCategories(finalCategories.sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
        console.log("ReportsPage (Prefs Snapshot): UserDisplayCategories set. Count:", finalCategories.length);
      }
    }, (error) => {
      if (!effectMountedRef.current) {
        console.log("ReportsPage (Prefs Snapshot Error): Component unmounted, skipping error handling for UserID:", userId);
        return;
      }
      console.error("ReportsPage (Prefs Snapshot): Error fetching user preferences for UserID:", userId, error);
      toast({
        title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }),
        description: translate({ en: "Could not load category details.", pt: "Não foi possível carregar detalhes das categorias." }),
        variant: "destructive",
      });
      if (effectMountedRef.current) {
        setUserDisplayCategories([...CATEGORIES].sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
      }
    });
    return () => {
      if (unsubscribePreferencesRef.current) {
        console.log("ReportsPage (Prefs Effect Cleanup): Unsubscribing preferences listener for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
    };
  }, [userId, isClient, authLoading, language, toast, translate]); // Removed effectMountedRef

  const fetchBudgetsInternal = useCallback(async () => {
    if (!effectMountedRef.current || !userId || !isClient || authLoading ) {
      if(effectMountedRef.current) {
        setLoadedBudgets(null);
        setIsLoadingBudgets(false);
      }
      return;
    }
    
    if(effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log("ReportsPage: Fetching budgets for month: " + budgetMonthKey + " for UserID:", userId);
    const budgetDocRef = doc(db, 'users', userId, 'budgets', budgetMonthKey);

    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) { 
        if(effectMountedRef.current) setIsLoadingBudgets(false);
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
        console.log('ReportsPage: Budgets data loaded for', budgetMonthKey + ':', validBudgets);
        if (effectMountedRef.current) setLoadedBudgets(validBudgets);
      } else {
        console.log('ReportsPage: No budget document found for', budgetMonthKey);
        if (effectMountedRef.current) setLoadedBudgets({}); 
      }
    } catch (error) {
      if (!effectMountedRef.current) {
         if(effectMountedRef.current) setIsLoadingBudgets(false);
         return;
      }
      console.error("ReportsPage: Error loading budgets for month " + budgetMonthKey + ":", error, "for UserID:", userId);
      toast({
        title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }),
        description: translate({ en: "Could not load budget data for comparison.", pt: "Não foi possível carregar os dados do orçamento para comparação." }),
        variant: "destructive"
      });
      if (effectMountedRef.current) setLoadedBudgets({});
    } finally {
      if (effectMountedRef.current) {
        setIsLoadingBudgets(false);
      }
    }
  }, [userId, isClient, authLoading, displayedDate, toast, translate]); // Removed effectMountedRef, setIsLoadingBudgets, setLoadedBudgets

  useEffect(() => {
    if (userId && isClient && !authLoading) {
      fetchBudgetsInternal();
    } else if (effectMountedRef.current) { 
      setLoadedBudgets(null);
      setIsLoadingBudgets(false); 
    }
  }, [userId, isClient, authLoading, displayedDate, fetchBudgetsInternal]); // Added displayedDate to re-fetch budgets when month changes


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); 
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);

    console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year: " + targetYear + " Month: " + targetMonth + " (0-indexed for " + displayedMonthYearLabel + " ), TargetEffMonth: " + targetEffectiveMonth + " All transactions count: " + allTransactions.length);

    if (allTransactions.length === 0) {
      console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
      return [];
    }

    const filtered: Transaction[] = [];
    allTransactions.forEach(t => {
      let includeTransaction = false;
      let reason = "";
      let originalTransactionDate: Date;

      try {
        originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
      } catch (e) {
        console.warn("ReportsPage TX Filter: Could not parse t.date '" + String(t.date) + "' for tx ID " + String(t.id) + ". Error:", e);
        return; 
      }
      
      const originalTxYear = getYearFns(originalTransactionDate);
      const originalTxMonth = getMonthFns(originalTransactionDate);

      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        reason = "Installment Check";
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        const isInstallmentActiveThisMonth = monthDiff >= 0 && monthDiff < t.installments;
        if (isInstallmentActiveThisMonth) includeTransaction = true;
      } else if (t.isRecurring === true && t.expenseType !== 'installment') { 
        reason = "Recurring Check";
        const isRecurringActiveThisMonth = originalTxYear < targetYear || (originalTxYear === targetYear && originalTxMonth <= targetMonth);
        if (isRecurringActiveThisMonth) includeTransaction = true;
      } else if ((!t.isRecurring || t.isRecurring === false) && t.expenseType !== 'installment') { 
        reason = "Non-Recurring Check";
        if (t.effectiveMonth === targetEffectiveMonth) {
          includeTransaction = true;
        }
      }
      console.log("ReportsPage TX Filter: ID: " + t.id + " Date: " + t.date + " EffMonth: " + t.effectiveMonth + " Type: " + t.type + " ExpType: " + t.expenseType + " isRec: " + t.isRecurring + " Inst: " + t.installments + " Amount: " + t.amount + " Included: " + includeTransaction + " Reason: " + reason + " Target: " + targetEffectiveMonth);
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: Found " + filtered.length + " transactions for the period.");
    return filtered;
  }, [allTransactions, displayedDate, displayedMonthYearLabel]); // displayedMonthYearLabel only for logging

  const totalIncomeForPeriod = useMemo(() =>
    transactionsForDisplayedPeriod
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0),
  [transactionsForDisplayedPeriod]);

  const totalExpensesForPeriod = useMemo(() =>
    transactionsForDisplayedPeriod
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0),
  [transactionsForDisplayedPeriod]);

  const netFlowForPeriod = useMemo(() => totalIncomeForPeriod - totalExpensesForPeriod, [totalIncomeForPeriod, totalExpensesForPeriod]);

  const totalFixedExpensesForPeriod = useMemo(() =>
    transactionsForDisplayedPeriod
      .filter(t => t.type === 'expense' && t.expenseNature === 'fixed')
      .reduce((sum, t) => sum + t.amount, 0),
  [transactionsForDisplayedPeriod]);

  const totalVariableExpensesForPeriod = useMemo(() =>
    transactionsForDisplayedPeriod
      .filter(t => t.type === 'expense' && t.expenseNature === 'variable')
      .reduce((sum, t) => sum + t.amount, 0),
  [transactionsForDisplayedPeriod]);

  const budgetVsActualData = useMemo<BudgetComparisonItem[]>(() => {
    console.log("ReportsPage: budgetVsActualData - Recalculating. isLoadingBudgets:", isLoadingBudgets, "isLoadingPrefs:", isLoadingPreferences, "loadedBudgets empty:", !loadedBudgets || Object.keys(loadedBudgets).length === 0, "userDisplayCategories empty:", userDisplayCategories.length === 0);
    if (isLoadingBudgets || isLoadingPreferences || !loadedBudgets || userDisplayCategories.length === 0) {
      console.log("ReportsPage: budgetVsActualData - Skipping calculation due to loading state or missing data. LoadedBudgets:", !!loadedBudgets, "isLoadingPrefs:", isLoadingPreferences, "userDisplayCategories empty:", userDisplayCategories.length === 0, "isLoadingBudgets:", isLoadingBudgets);
      return [];
    }

    const actualSpending: Record<string, number> = {};
    transactionsForDisplayedPeriod
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const categoryInternalName = t.category as string; 
        actualSpending[categoryInternalName] = (actualSpending[categoryInternalName] || 0) + t.amount;
      });

    const allRelevantCategoryNames = new Set<string>();
    Object.keys(loadedBudgets).filter(key => key !== 'lastUpdated').forEach(name => allRelevantCategoryNames.add(name));
    Object.keys(actualSpending).forEach(name => allRelevantCategoryNames.add(name));
    
    const comparisonData = Array.from(allRelevantCategoryNames).map(internalName => {
      const categoryInfo = userDisplayCategories.find(cat => cat.name.toLowerCase() === internalName.toLowerCase() && cat.type === 'expense');
      
      const displayName = categoryInfo ? getCategoryDisplayLabel(categoryInfo, language) : internalName;
      const icon = categoryInfo?.icon || 'CircleHelp';
      
      const budgeted = loadedBudgets[internalName] || 0;
      const actual = actualSpending[internalName] || 0;
      const difference = budgeted - actual;
      let percentage = 0;
      if (budgeted > 0) {
        percentage = Math.min(Math.round((actual / budgeted) * 100), 1000); 
      } else if (actual > 0) { 
        percentage = 1000; 
      }
      return { categoryInternalName: internalName, categoryName: displayName, icon: icon, budgeted, actual, difference, percentage };
    }).filter(item => item.budgeted > 0 || item.actual > 0) 
      .sort((a,b) => (b.budgeted + b.actual) - (a.budgeted + a.actual)); 
    
    console.log("ReportsPage: budgetVsActualData calculated:", comparisonData);
    return comparisonData;
  }, [loadedBudgets, transactionsForDisplayedPeriod, userDisplayCategories, language, isLoadingPreferences, isLoadingBudgets]);

  const expenseDataForChart = useMemo(() => {
    console.log("ReportsPage: Calculating expenseDataForChart. userDisplayCategories count:", userDisplayCategories.length);
    if (isLoadingPreferences || userDisplayCategories.length === 0 || isLoadingTransactions || transactionsForDisplayedPeriod.length === 0) {
      return [];
    }
    
    const expensesByCategory = transactionsForDisplayedPeriod
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        const categoryInternalName = t.category as string;
        acc[categoryInternalName] = (acc[categoryInternalName] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    const chartData = Object.entries(expensesByCategory)
      .map(([internalName, value]) => {
        const categoryDetail = userDisplayCategories.find(cat => cat.name.toLowerCase() === internalName.toLowerCase());
        return {
          name: internalName, 
          value,
          displayName: categoryDetail ? getCategoryDisplayLabel(categoryDetail, language) : internalName, 
        };
      })
      .sort((a, b) => b.value - a.value); 
    console.log("ReportsPage: Expense data for chart calculated:", chartData);
    return chartData;
  }, [transactionsForDisplayedPeriod, userDisplayCategories, language, isLoadingPreferences, isLoadingTransactions]);

  const pageTitle = translate({ en: "Reports", pt: "Relatórios" });
  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;

  if (overallLoading) {
    console.log("ReportsPage: Rendering loading state. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions, "isLoadingPreferences:", isLoadingPreferences, "isLoadingBudgets:", isLoadingBudgets);
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-9 w-1/3 mb-4 sm:mb-0" />
            <Skeleton className="h-9 w-full sm:w-32" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Card className="shadow-lg bg-muted/50 border-dashed">
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <Terminal className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
              <div className="flex-grow">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardHeader>
            <CardContent><p className="text-muted-foreground text-center py-4">{translate({ en: "AI insights are loading...", pt: "Carregando insights da IA..." })}</p></CardContent>
          </Card>
           <Card className="shadow-lg bg-background dark:bg-card">
            <CardHeader>
                <Skeleton className="h-6 w-1/2 mb-2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent>
                <div className="space-y-4 py-4">
                {[...Array(3)].map((_, i) => <Skeleton key={"budget-vs-actual-skeleton-" + i} className="h-20 w-full rounded-md" />)}
                </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader>
              <Skeleton className="h-6 w-1/2 mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent><Skeleton className="h-80 w-full" /></CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }
  console.log("ReportsPage: Rendering main content. Transactions for period:", transactionsForDisplayedPeriod.length);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-4 sm:mb-0">
            {pageTitle} - {displayedMonthYearLabel}
          </h1>
          <ExportData transactions={transactionsForDisplayedPeriod} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({ en: "Total Income", pt: "Receita Total" })}</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalIncomeForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({ en: "Total Expenses", pt: "Despesa Total" })}</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalExpensesForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({ en: "Net Cash Flow", pt: "Fluxo de Caixa Líquido" })}</CardTitle>
              <DollarSign className={cn("h-4 w-4 ", netFlowForPeriod >= 0 ? 'text-green-500' : 'text-red-500')} />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold ", netFlowForPeriod >= 0 ? 'text-green-500' : 'text-red-500')}>{formatCurrency(netFlowForPeriod)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({ en: "Total Fixed Expenses", pt: "Despesas Fixas Totais" })}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalFixedExpensesForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({ en: "Total Variable Expenses", pt: "Despesas Variáveis Totais" })}</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalVariableExpensesForPeriod)}</div>
            </CardContent>
          </Card>
        </div>
        
        <Card className="shadow-lg bg-muted/50 border-dashed">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Terminal className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Financial Insights by AI", pt: "Insights Financeiros por IA" })}</CardTitle>
              <CardDescription className="text-wrap"> {translate({ en: "AI-generated summary and advice for", pt: "Resumo e conselhos gerados por IA para" })} {displayedMonthYearLabel}.
                <br />
                {translate({ en: "This feature is in development. AI analysis will use transactions and defined budgets once fully integrated.", pt: "Esta funcionalidade está em desenvolvimento. A análise da IA usará transações e orçamentos definidos quando totalmente integrada." })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
              <p className="text-muted-foreground text-center">
                {translate({ en: "AI insights are coming soon!", pt: "Insights da IA em breve!" })}
              </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-background dark:bg-card">
          <CardHeader>
            <CardTitle>{translate({ en: "Budget vs. Actual Spending", pt: "Orçamento vs. Gasto Real" })}</CardTitle>
            <CardDescription>
              {translate({ en: "Comparison of your spending against defined budgets for", pt: "Comparação dos seus gastos com os orçamentos definidos para" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {budgetVsActualData.length > 0 ? (
              <div className="space-y-3">
                {budgetVsActualData.map((item) => (
                  <div key={item.categoryInternalName} className="p-3 rounded-md border bg-card hover:bg-accent/10 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <CategoryIcon iconName={item.icon} className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium text-sm">{item.categoryName}</span>
                      </div>
                      {item.budgeted > 0 && ( 
                        <span className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full",
                          item.difference >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/70 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/70 dark:text-red-300'
                        )}>
                          {formatCurrency(Math.abs(item.difference))} {' '}
                          {item.difference >= 0
                            ? translate({ en: "under budget", pt: "abaixo do orçamento" })
                            : translate({ en: "over budget", pt: "acima do orçamento" })
                          }
                        </span>
                      )}
                    </div>
                    <Progress
                      value={item.budgeted > 0 ? Math.min(Math.round(item.percentage), 1000) : (item.actual > 0 ? 1000 : 0) }
                      className="h-2 mb-1"
                      indicatorClassName={cn(
                         item.budgeted === 0 && item.actual > 0 ? "bg-muted-foreground" 
                        : item.budgeted > 0 && item.actual > 0 && item.percentage > 100 ? "bg-destructive" 
                        : item.budgeted > 0 && item.actual > 0 && item.percentage > 80 ? "bg-yellow-500 dark:bg-yellow-600" 
                        : "bg-primary" 
                      )}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{translate({ en: "Spent:", pt: "Gasto:" })} {formatCurrency(item.actual)}</span>
                      <span>{translate({ en: "Budget:", pt: "Orçado:" })} {formatCurrency(item.budgeted)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[150px] text-center">
                <Target className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {translate({
                    en: "No budget data set for this month, or no expenses recorded to compare.",
                    pt: "Nenhum dado de orçamento definido para este mês, ou nenhuma despesa registrada para comparar."
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {translate({
                    en: "Set your budgets on the 'Budgets' page.",
                    pt: "Defina seus orçamentos na página 'Orçamentos'."
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Expense Breakdown by Category", pt: "Detalhamento de Despesas por Categoria" })}</CardTitle>
            <CardDescription>
              {translate({ en: "How your expenses were distributed in", pt: "Como suas despesas foram distribuídas em" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length === 0) ? (
               <div className="flex items-center justify-center h-80">
                 <p className="text-muted-foreground">{translate({en: "No expense data to display chart.", pt: "Sem dados de despesa para exibir o gráfico."})}</p>
              </div>
            ) : (
              <ExpenseCategoryBarChart transactions={transactionsForDisplayedPeriod} userCategories={userDisplayCategories} />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
