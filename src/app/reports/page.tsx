
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Package, Wallet, FileText, DollarSign, Target, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, Category, CategoryName } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
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
import { generateFinancialSummary, type FinancialSummaryInput, type FinancialSummaryOutput } from '@/ai/flows/financial-summary-flow';


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

  const [financialSummary, setFinancialSummary] = useState<FinancialSummaryOutput | null>(null);
  const [isLoadingFinancialSummary, setIsLoadingFinancialSummary] = useState(false);
  const [financialSummaryError, setFinancialSummaryError] = useState<string | null>(null);


  const effectMountedRef = useRef(true);
  const unsubscribeTransactionsRef = useRef<(() => void) | null>(null);
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIsClient(true);
    effectMountedRef.current = true;
    console.log("ReportsPage: Component mounted, effectMountedRef set to true");
    const currentUserIdForCleanup = userId; 
    return () => {
      effectMountedRef.current = false;
      console.log("ReportsPage: Component unmounting, effectMountedRef set to false. Cleaning up listeners for UserID:", currentUserIdForCleanup);
      if (unsubscribeTransactionsRef.current) {
        console.log("ReportsPage: Unsubscribing transaction listener on unmount for UserID:", currentUserIdForCleanup);
        unsubscribeTransactionsRef.current();
        unsubscribeTransactionsRef.current = null;
      }
      if (unsubscribePreferencesRef.current) {
        console.log("ReportsPage: Unsubscribing preferences listener on unmount for UserID:", currentUserIdForCleanup);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
    };
  }, [userId]);

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

    if (unsubscribeTransactionsRef.current) {
        unsubscribeTransactionsRef.current();
        unsubscribeTransactionsRef.current = null;
        console.log("ReportsPage (TX Effect): Cleaned up previous transaction listener before setting new one for UserID:", userId);
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
            } else if (data.date.includes('T')) { // Handles YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ
              try {
                dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
              } catch (e1){
                  try {
                     dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd"); // General ISO parse
                  } catch (e2) {
                     console.warn("ReportsPage TX Date Parse (string T general for " + String(docSnap.id) + "): Failed for date '" + String(data.date) + "'. Error: " + String(e2) + ". Fallback to current date.");
                     dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                  }
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
        } else {
             console.warn("ReportsPage TX Date Parse (missing): Date field is missing for tx " + String(docSnap.id) + ". Fallback to current date.");
             dateString = formatDateFns(new Date(), "yyyy-MM-dd");
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
        console.log("ReportsPage (TX Snapshot): allTransactions set, isLoadingTransactions set to false. Count:", fetchedTransactions.length);
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
  }, [userId, authLoading, isClient, toast, translate]);

  // Fetch User Preferences for Categories
  useEffect(() => {
    if (!isClient || authLoading || !userId) {
      if (effectMountedRef.current) {
        setUserDisplayCategories([...CATEGORIES].sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
      }
       if (unsubscribePreferencesRef.current) {
        console.log("ReportsPage (Prefs Effect): Cleaning up stale preferences listener (no user/auth/client) for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
      return;
    }

    if (effectMountedRef.current) setIsLoadingPreferences(true);
    console.log("ReportsPage (Prefs Effect): Setting up preferences listener for UserID:", userId);

    if (unsubscribePreferencesRef.current) {
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
        console.log("ReportsPage (Prefs Effect): Cleaned up previous preferences listener before setting new one for UserID:", userId);
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
  }, [userId, isClient, authLoading, language, toast, translate]);

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
  }, [userId, isClient, authLoading, displayedDate, toast, translate]); 

  useEffect(() => {
    if (userId && isClient && !authLoading) {
      fetchBudgetsInternal();
    } else if (effectMountedRef.current) { 
      setLoadedBudgets(null);
      setIsLoadingBudgets(false); 
    }
  }, [userId, isClient, authLoading, displayedDate, fetchBudgetsInternal]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year: " + getYearFns(displayedDate) + " Month: " + getMonthFns(displayedDate) + " (0-indexed for " + displayedMonthYearLabel + " ), TargetEffMonth: " + targetEffectiveMonth + " All transactions count: " + allTransactions.length);

    if (allTransactions.length === 0) {
      console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
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
        console.warn("ReportsPage TX Filter: Could not parse t.date '" + String(t.date) + "' for tx ID " + String(t.id) + ". Error:", e);
        return; 
      }
      
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        reason = "Installment Check";
        const installmentSeriesEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, startOfMonth(installmentSeriesEffectiveStartDate));
        const isActive = monthDiff >= 0 && monthDiff < t.installments;
        if (isActive) includeTransaction = true;
      } else if (t.isRecurring === true && t.expenseType !== 'installment') { 
        reason = "Recurring Check";
        const recurrenceEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        if (startOfMonth(recurrenceEffectiveStartDate) <= firstDayOfTargetMonth) {
          includeTransaction = true;
        }
      } else if (t.effectiveMonth === targetEffectiveMonth) { 
        reason = "Non-Recurring Check";
        includeTransaction = true;
      }
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: Found " + filtered.length + " transactions for the period.");
    return filtered;
  }, [allTransactions, displayedDate, displayedMonthYearLabel]);

  // Effect to trigger AI summary generation
  useEffect(() => {
    const fetchSummary = async () => {
      if (isLoadingTransactions || isLoadingBudgets || transactionsForDisplayedPeriod.length === 0) {
        if(effectMountedRef.current) {
          setFinancialSummary(null);
          setFinancialSummaryError(null);
          setIsLoadingFinancialSummary(false);
        }
        return;
      }

      if(effectMountedRef.current) {
        setIsLoadingFinancialSummary(true);
        setFinancialSummaryError(null);
      }

      const sanitizedTransactions = transactionsForDisplayedPeriod.map(t => {
        const { createdAt, updatedAt, userId, ...plainTransaction } = t;
        return {
          ...plainTransaction,
          category: getCategoryDisplayLabel(userDisplayCategories.find(c => c.name === t.category), 'en') || (t.category as string),
        };
      });

      const flowInput: FinancialSummaryInput = {
        transactionsForMonth: sanitizedTransactions,
        budgetsForMonth: loadedBudgets || undefined,
        monthYearLabel: displayedMonthYearLabel
      };

      try {
        const summaryOutput = await generateFinancialSummary(flowInput);
        if (effectMountedRef.current) {
          setFinancialSummary(summaryOutput);
        }
      } catch (error) {
        console.error("Error generating financial summary:", error);
        if (effectMountedRef.current) {
          setFinancialSummaryError(translate({
            en: "Could not generate AI summary at this time.",
            pt: "Não foi possível gerar o resumo de IA no momento."
          }));
        }
      } finally {
        if (effectMountedRef.current) {
          setIsLoadingFinancialSummary(false);
        }
      }
    };

    fetchSummary();
  }, [transactionsForDisplayedPeriod, loadedBudgets, isLoadingTransactions, isLoadingBudgets, displayedMonthYearLabel, userDisplayCategories, translate]);

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
        percentage = (actual / budgeted) * 100;
      } else if (actual > 0) { 
        percentage = 100; 
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
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground break-words">
            {pageTitle} - {displayedMonthYearLabel}
          </h1>
          <ExportData transactions={transactionsForDisplayedPeriod} />
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2 px-4 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium truncate" title={translate({ en: "Total Income", pt: "Receita Total" })}>{translate({ en: "Total Income", pt: "Receita Total" })}</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500 flex-shrink-0" />
            </CardHeader>
            <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
              <div className="text-base sm:text-lg md:text-2xl font-bold">{formatCurrency(totalIncomeForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2 px-4 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium truncate" title={translate({ en: "Total Expenses", pt: "Despesa Total" })}>{translate({ en: "Total Expenses", pt: "Despesa Total" })}</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500 flex-shrink-0" />
            </CardHeader>
            <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
              <div className="text-base sm:text-lg md:text-2xl font-bold">{formatCurrency(totalExpensesForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2 px-4 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium truncate" title={translate({ en: "Net Cash Flow", pt: "Fluxo de Caixa Líquido" })}>{translate({ en: "Net Cash Flow", pt: "Fluxo de Caixa Líquido" })}</CardTitle>
              <DollarSign className={cn("h-4 w-4 flex-shrink-0", netFlowForPeriod >= 0 ? 'text-green-500' : 'text-red-500')} />
            </CardHeader>
            <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
              <div className={cn("text-base sm:text-lg md:text-2xl font-bold", netFlowForPeriod >= 0 ? 'text-green-500' : 'text-red-500')}>{formatCurrency(netFlowForPeriod)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2 px-4 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium truncate" title={translate({ en: "Total Fixed Expenses", pt: "Despesas Fixas Totais" })}>{translate({ en: "Total Fixed Expenses", pt: "Despesas Fixas Totais" })}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
              <div className="text-base sm:text-lg md:text-2xl font-bold">{formatCurrency(totalFixedExpensesForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2 px-4 pt-4 md:px-6 md:pt-6">
              <CardTitle className="text-sm font-medium truncate" title={translate({ en: "Total Variable Expenses", pt: "Despesas Variáveis Totais" })}>{translate({ en: "Total Variable Expenses", pt: "Despesas Variáveis Totais" })}</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
              <div className="text-base sm:text-lg md:text-2xl font-bold">{formatCurrency(totalVariableExpensesForPeriod)}</div>
            </CardContent>
          </Card>
        </div>
        
        <Card className="shadow-lg bg-muted/50 border-dashed">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0 p-6">
            <Terminal className="h-8 w-8 text-primary flex-shrink-0" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Financial Insights by AI", pt: "Insights Financeiros por IA" })}</CardTitle>
              <CardDescription className="text-wrap mt-1">
                {translate({ en: "AI-generated summary and advice for", pt: "Resumo e conselhos gerados por IA para" })} {displayedMonthYearLabel}.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
             {isLoadingFinancialSummary ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : financialSummaryError ? (
                <Alert variant="destructive">
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>{translate({ en: "Error", pt: "Erro" })}</AlertTitle>
                  <AlertDescription>{financialSummaryError}</AlertDescription>
                </Alert>
              ) : financialSummary ? (
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-1">{translate({ en: "Overall Status", pt: "Status Geral"})}</h4>
                    <p className="text-muted-foreground">{financialSummary.overallStatus}</p>
                  </div>
                   <div>
                    <h4 className="font-semibold mb-1">{translate({ en: "Key Observations", pt: "Observações Chave"})}</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      {financialSummary.keyObservations.map((obs, i) => <li key={i}>{obs}</li>)}
                    </ul>
                  </div>
                   <div>
                    <h4 className="font-semibold mb-1">{translate({ en: "Actionable Advice", pt: "Conselhos Práticos"})}</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      {financialSummary.actionableAdvice.map((adv, i) => <li key={i}>{adv}</li>)}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">{translate({ en: "No data to generate AI insights.", pt: "Sem dados para gerar insights de IA." })}</p>
              )}
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
              <div className="space-y-4">
                {budgetVsActualData.map((item) => {
                  const progressPercent = item.budgeted > 0 ? (item.actual / item.budgeted) * 100 : item.actual > 0 ? 100 : 0;
                  
                  return (
                    <div key={item.categoryInternalName} className="space-y-2 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <CategoryIcon iconName={item.icon} className="h-6 w-6 flex-shrink-0 text-primary" />
                        <p className="truncate font-semibold text-foreground" title={item.categoryName}>
                          {item.categoryName}
                        </p>
                      </div>

                      <Progress
                        value={progressPercent}
                        className="h-2"
                        indicatorClassName={cn(
                          item.budgeted === 0 && item.actual > 0
                            ? 'bg-muted-foreground'
                            : progressPercent > 100
                              ? 'bg-destructive'
                              : progressPercent > 80
                                ? 'bg-yellow-500'
                                : 'bg-primary'
                        )}
                      />
                      
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between text-sm gap-1 md:gap-4">
                        <p className="text-muted-foreground truncate">
                          {translate({ en: 'Spent:', pt: 'Gasto:' })}{' '}
                          <span className="font-medium text-foreground">
                            {formatCurrency(item.actual)}
                          </span>
                          {item.budgeted > 0 && (
                            <span className="text-muted-foreground">
                              {' '}/ {formatCurrency(item.budgeted)} ({Math.round(progressPercent)}%)
                            </span>
                          )}
                        </p>
                        
                        {item.budgeted > 0 ? (
                          <p className={cn(
                            'font-medium text-left md:text-right',
                            item.difference >= 0
                              ? 'text-green-600 dark:text-green-500'
                              : 'text-red-600 dark:text-red-500'
                          )}>
                            {formatCurrency(Math.abs(item.difference))}{' '}
                            {item.difference >= 0
                              ? translate({ en: 'left', pt: 'restante' })
                              : translate({ en: 'over', pt: 'acima' })}
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-left md:text-right">
                            {translate({ en: 'No budget', pt: 'Sem orçamento' })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
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
