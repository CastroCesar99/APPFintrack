
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Info, Lightbulb, CheckCircle, TrendingDown, TrendingUp, MinusCircle, Package, Target, Wallet, FileText } from "lucide-react"; 
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, CategoryName } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel, PAYMENT_METHODS } from "@/types";
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
import { Skeleton } from '@/components/ui/skeleton';
import { ExpenseCategoryBarChart } from '@/components/dashboard/charts/expense-category-bar-chart';
import { formatCurrency, cn } from '@/lib/utils';
import { ExportData } from '@/components/dashboard/export-data';
import { Progress } from "@/components/ui/progress";
import { CategoryIcon } from "@/components/icons";

interface BudgetComparisonItem {
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
  const router = useRouter(); 
  const { translate, language } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast(); 

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isClient, setIsClient] = useState(false);

  const [userDisplayCategories, setUserDisplayCategories] = useState<DisplayCategory[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  
  const [loadedBudgets, setLoadedBudgets] = useState<Record<string, number> | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);

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
        console.log("ReportsPage: Unsubscribing transaction listener for UserID:", userId);
        unsubscribeTransactionsRef.current();
        unsubscribeTransactionsRef.current = null;
      }
      if (unsubscribePreferencesRef.current) {
        console.log("ReportsPage: Unsubscribing preferences listener for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
    };
  }, [userId]);

  // Fetch Transactions
  useEffect(() => {
    if (!effectMountedRef.current) return;

    if (!userId || authLoading || !isClient) {
      if (effectMountedRef.current) {
        setIsLoadingTransactions(false);
        setAllTransactions([]);
      }
      if (unsubscribeTransactionsRef.current) {
        console.log("ReportsPage (TX Effect): No user/auth/client, cleaning up existing TX listener for UserID:", userId);
        unsubscribeTransactionsRef.current();
        unsubscribeTransactionsRef.current = null;
      }
      return;
    }

    if (effectMountedRef.current && !isLoadingTransactions) setIsLoadingTransactions(true);
    console.log("ReportsPage (TX Effect): Setting up transaction listener for UserID:", userId);
    const transactionsColRef = collection(db, 'users/' + userId + '/transactions');
    const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

    if (unsubscribeTransactionsRef.current) {
        console.log("ReportsPage (TX Effect): Stale TX listener found, unsubscribing for UserID:", userId);
        unsubscribeTransactionsRef.current();
    }

    unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
      if (!effectMountedRef.current) {
        console.log("ReportsPage (TX Snapshot): Effect unmounted for UserID:", userId, "- skipping state update.");
        return;
      }
      console.log("ReportsPage (TX Snapshot): Transaction listener fired. Docs count:", querySnapshot.docs.length, "for UserID:", userId);
      const fetchedTransactions = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let dateString = "";
        let effectiveMonthString = data.effectiveMonth;

        if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
          dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
        } else if (typeof data.date === 'string') {
          if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
            dateString = data.date;
          } else if (data.date.includes('T')) {
            try {
                dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
            } catch (e1) {
                try {
                    dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                } catch (e2) {
                    console.warn("ReportsPage (TX Date Parse ISO Fallback): Failed for tx " + String(docSnap.id) + ": " + String(data.date), e2); dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                }
            }
          } else {
             console.warn("ReportsPage (TX Date Parse String Other): Unhandled format for tx " + String(docSnap.id) + ": " + String(data.date) + ". Attempting general parse.");
             try {
                 dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
             } catch(e) {
                 console.warn("ReportsPage (TX Date Parse String Other Fallback): General parse failed for tx " + String(docSnap.id) + ": " + String(data.date), e);
                 dateString = formatDateFns(new Date(), "yyyy-MM-dd");
             }
          }
        } else {
           console.warn("ReportsPage (TX Date Parse Missing/Invalid): Missing or invalid date for tx " + String(docSnap.id) + ":", data.date);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd");
        }

        if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
             if (dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
                try {
                    effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                } catch (e) {
                    console.warn('ReportsPage: Could not parse date ' + dateString + ' to derive effectiveMonth for tx ' + docSnap.id + '. Defaulting to current month.', e);
                    effectiveMonthString = formatDateFns(new Date(), "yyyy-MM"); 
                }
             } else {
                console.warn('ReportsPage: Invalid or missing effectiveMonth and invalid dateString for tx ' + docSnap.id + '. Defaulting effectiveMonth. Date: ' + dateString + ', EffMonth: ' + data.effectiveMonth);
                effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
             }
        }
        
        return {
            ...data,
            id: docSnap.id,
            date: dateString,
            effectiveMonth: effectiveMonthString,
            paymentMethod: data.paymentMethod,
            installments: data.installments,
            isRecurring: data.isRecurring === true,
            expenseNature: data.expenseNature,
            expenseType: data.expenseType,
        } as Transaction;
      });
      if (effectMountedRef.current) {
        setAllTransactions(fetchedTransactions);
        setIsLoadingTransactions(false);
      }
    }, (error) => {
      if (!effectMountedRef.current) return;
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
  }, [userId, authLoading, isClient]);

  // Fetch User Preferences
  useEffect(() => {
    if (!effectMountedRef.current) return;
    if (!userId || !isClient || authLoading) {
      if (effectMountedRef.current) {
        setUserDisplayCategories([...CATEGORIES].sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
      }
      if (unsubscribePreferencesRef.current) {
        console.log("ReportsPage (Prefs Effect): No user/client/auth, cleaning up existing prefs listener for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
      return;
    }

    if (effectMountedRef.current && !isLoadingPreferences) setIsLoadingPreferences(true);
    const preferencesDocRef = doc(db, "users/" + userId + "/preferences/userPreferences");
    
    if (unsubscribePreferencesRef.current) {
        console.log("ReportsPage (Prefs Effect): Stale prefs listener found, unsubscribing for UserID:", userId);
        unsubscribePreferencesRef.current();
    }

    console.log("ReportsPage (Prefs Effect): Setting up preferences listener for UserID:", userId);
    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("ReportsPage (Prefs Snapshot): Effect unmounted for UserID:", userId, "- skipping state update.");
        return;
      }
      console.log("ReportsPage (Prefs Snapshot): Preferences snapshot received for UserID:", userId);
        
      let finalCategories: DisplayCategory[] = [];
      const predefinedCategoriesMap = new Map(CATEGORIES.map(cat => [cat.name.toLowerCase(), { ...cat }]));

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        const customCategoriesFromDb: CustomCategoryData[] = prefsData.userDefinedCategories || [];
        const deselectedPredefinedNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        
        // Start with predefined that are not deselected
        CATEGORIES.forEach(pCat => {
          if (!deselectedPredefinedNames.has(pCat.name.toLowerCase())) {
            const customOverride = customCategoriesFromDb.find(cc => cc.name.toLowerCase() === pCat.name.toLowerCase());
            if (customOverride) {
              finalCategories.push({ ...pCat, ...customOverride, name: pCat.name });
            } else {
              finalCategories.push({ ...pCat });
            }
          }
        });

        // Add purely custom categories
        customCategoriesFromDb.forEach(customCat => {
          if (!CATEGORIES.some(pCat => pCat.name.toLowerCase() === customCat.name.toLowerCase())) {
            finalCategories.push(customCat);
          }
        });

      } else {
        console.log("ReportsPage (Prefs Snapshot): No preferences document for UserID:", userId, ". Using default predefined categories.");
        finalCategories = [...CATEGORIES];
      }
      
      if (effectMountedRef.current) {
        setUserDisplayCategories(finalCategories.sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
        console.log("ReportsPage (Prefs Snapshot): UserDisplayCategories set. Count:", finalCategories.length);
      }
    }, (error) => {
      if (!effectMountedRef.current) return;
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
  }, [userId, isClient, authLoading, language, toast, translate]);

  // Fetch Budgets for the displayed month
  const fetchBudgetsInternal = useCallback(async () => {
    if (!userId || !isClient || !displayedDate || !effectMountedRef.current) {
      if (effectMountedRef.current) {
        setLoadedBudgets(null);
        if (isLoadingBudgets) setIsLoadingBudgets(false); 
      }
      return;
    }

    if (effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log('ReportsPage: Fetching budgets for month: ' + budgetMonthKey + ' for UserID: ' + userId);
    const budgetDocRef = doc(db, "users/" + userId + "/budgets/" + budgetMonthKey);
    
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) {
        if(isLoadingBudgets) setIsLoadingBudgets(false);
        return;
      }

      if (docSnap.exists()) {
        const budgetData = docSnap.data(); 
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (key !== 'lastUpdated' && typeof budgetData[key] === 'number') { 
            validBudgets[key] = budgetData[key];
          }
        }
        console.log('ReportsPage: Budgets data loaded for ' + budgetMonthKey + ':', validBudgets);
        setLoadedBudgets(validBudgets);
      } else {
        console.log('ReportsPage: No budget document for ' + budgetMonthKey + '. Setting empty.');
        setLoadedBudgets({}); 
      }
    } catch (error) {
      if (!effectMountedRef.current) {
        if(isLoadingBudgets) setIsLoadingBudgets(false);
        return;
      }
      console.error("ReportsPage: Error loading budgets for month " + budgetMonthKey + ":", error);
      toast({
        title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }),
        description: translate({ en: "Could not load budget data for comparison.", pt: "Não foi possível carregar os dados do orçamento para comparação." }),
        variant: "destructive"
      });
      if (effectMountedRef.current) setLoadedBudgets({});
    } finally {
      if (effectMountedRef.current && isLoadingBudgets) setIsLoadingBudgets(false);
    }
  }, [userId, isClient, displayedDate, toast, translate]); // Removed isLoadingBudgets

  useEffect(() => {
    fetchBudgetsInternal();
  }, [fetchBudgetsInternal]); // fetchBudgetsInternal is now a stable useCallback


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); 
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");

    console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year:", targetYear, "Month:", targetMonth, "(0-indexed for", displayedMonthYearLabel,"), TargetEffMonth:", targetEffectiveMonth, "All transactions count:", allTransactions.length);
    
    if (!allTransactions || allTransactions.length === 0) {
      console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
      return [];
    }
    
    let filtered: Transaction[] = [];

    allTransactions.forEach(t => {
      let includeTransaction = false;
      let reason = "";
      const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));

      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        const isInstallmentActiveThisMonth = monthDiff >= 0 && monthDiff < t.installments;
        reason = "Installment Check";
        if (isInstallmentActiveThisMonth) includeTransaction = true;
      } else if (t.isRecurring === true && t.expenseType !== 'installment') {
        const originalTransactionYear = getYearFns(originalTransactionDate);
        const originalTransactionMonth = getMonthFns(originalTransactionDate);
        reason = "Recurring Check";
        if (originalTransactionYear < targetYear || (originalTransactionYear === targetYear && originalTransactionMonth <= targetMonth)) {
          includeTransaction = true;
        }
      } else if (!t.isRecurring && t.expenseType !== 'installment') {
        const transactionEffectiveMonthToUse = t.effectiveMonth || formatDateFns(originalTransactionDate, "yyyy-MM");
        reason = "Non-Recurring Check";
        if (transactionEffectiveMonthToUse === targetEffectiveMonth) {
          includeTransaction = true;
        }
      }
      
      if (effectMountedRef.current) {
          console.log("ReportsPage TX Filter: ID:", t.id, "Date:", t.date, "EffMonth:", t.effectiveMonth, "Type:", t.type, "ExpType:", t.expenseType, "isRec:", t.isRecurring, "Inst:", t.installments, "Amount:", t.amount, "Included:", includeTransaction, "Reason:", reason, "Target:", targetEffectiveMonth);
      }

      if (includeTransaction) {
        filtered.push(t);
      }
    });
    if (effectMountedRef.current) {
        console.log("ReportsPage: TRACER --- transactionsForDisplayedPeriod: Found", filtered.length, "transactions for the period.");
    }
    return filtered;
  }, [allTransactions, displayedDate, displayedMonthYearLabel]);


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
    if (!loadedBudgets || isLoadingPreferences || userDisplayCategories.length === 0 || isLoadingBudgets) {
      console.log("ReportsPage: budgetVsActualData - Skipping calculation due to loading state or missing data. LoadedBudgets:", !!loadedBudgets, "isLoadingPrefs:", isLoadingPreferences, "userDisplayCategories empty:", userDisplayCategories.length === 0, "isLoadingBudgets:", isLoadingBudgets);
      return [];
    }
    console.log("ReportsPage: budgetVsActualData - Calculating. LoadedBudgets:", loadedBudgets, "UserDisplayCategories count:", userDisplayCategories.length);

    const actualSpending: Record<string, number> = {};
    transactionsForDisplayedPeriod
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const categoryKey = t.category as string; 
        actualSpending[categoryKey] = (actualSpending[categoryKey] || 0) + t.amount;
      });
    console.log("ReportsPage: budgetVsActualData - Actual spending calculated:", actualSpending);

    const budgetKeys = Object.keys(loadedBudgets || {}).filter(key => key !== 'lastUpdated');
    const spendingKeys = Object.keys(actualSpending);
    const allRelevantCategoryInternalNames = new Set<string>([...budgetKeys, ...spendingKeys]);
    
    console.log("ReportsPage: budgetVsActualData - All relevant category internal names:", Array.from(allRelevantCategoryInternalNames));
    
    if (allRelevantCategoryInternalNames.size === 0 && budgetKeys.every(key => (loadedBudgets[key] || 0) === 0)) {
        console.log("ReportsPage: budgetVsActualData - No relevant categories or all budgets are zero, returning empty array.");
        return []; 
    }

    const comparisonData = Array.from(allRelevantCategoryInternalNames).map(internalName => {
      const categoryInfo = userDisplayCategories.find(cat => cat.name.toLowerCase() === internalName.toLowerCase());
      const displayName = categoryInfo ? getCategoryDisplayLabel(categoryInfo, language) : internalName;
      const icon = categoryInfo?.icon || 'CircleHelp'; 
      
      const budgeted = loadedBudgets[internalName] || 0;
      const actual = actualSpending[internalName] || 0;
      const difference = budgeted - actual;
      let percentage = 0;
      if (budgeted > 0) {
        percentage = (actual / budgeted) * 100;
      } else if (actual > 0) {
        percentage = 1000; 
      }
      
      return {
        categoryName: displayName,
        icon: icon,
        budgeted,
        actual,
        difference,
        percentage
      };
    }).filter(item => item.budgeted > 0 || item.actual > 0) 
      .sort((a,b) => (b.budgeted + b.actual) - (a.budgeted + a.actual)); 
      
    console.log("ReportsPage: budgetVsActualData - Final comparison data:", comparisonData);
    return comparisonData;

  }, [loadedBudgets, transactionsForDisplayedPeriod, userDisplayCategories, language, isLoadingPreferences, isLoadingBudgets]);

  const expenseDataForChart = useMemo(() => {
    console.log("ReportsPage: Calculating expenseDataForChart. userDisplayCategories count:", userDisplayCategories.length);
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
  }, [transactionsForDisplayedPeriod, userDisplayCategories, language]);


  const pageTitle = translate({ en: "Reports", pt: "Relatórios" });
  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;

  if (overallLoading) {
    console.log("ReportsPage: Rendering loading state. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions, "isLoadingPreferences:", isLoadingPreferences, "isLoadingBudgets:", isLoadingBudgets);
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-9 w-1/3" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => <Skeleton key={"summary-skel-" + i} className="h-24 w-full" />)}
          </div>
           <div className="grid gap-4 md:grid-cols-2">
            {[...Array(2)].map((_, i) => <Skeleton key={"fixed-var-skel-" + i} className="h-24 w-full" />)}
          </div>
          <Card className="shadow-lg bg-muted/50">
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <Terminal className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
              <div className="flex-grow">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardHeader>
            <CardContent><Skeleton className="h-16 w-full" /></CardContent>
          </Card>
          <Card className="shadow-lg bg-muted/50">
            <CardHeader>
              <Skeleton className="h-6 w-1/2 mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent>
                <div className="space-y-4 py-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={"budget-skeleton-" + i} className="h-20 w-full rounded-md" />)}
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {pageTitle} - {displayedMonthYearLabel}
          </h1>
          <ExportData transactions={transactionsForDisplayedPeriod} />
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Total Income", pt: "Receita Total"})}</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalIncomeForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Total Expenses", pt: "Despesa Total"})}</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalExpensesForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Net Cash Flow", pt: "Fluxo de Caixa Líquido"})}</CardTitle>
              <MinusCircle className={cn("h-4 w-4 ", netFlowForPeriod >= 0 ? 'text-green-500' : 'text-red-500')} />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold ", netFlowForPeriod >= 0 ? 'text-green-500' : 'text-red-500')}>{formatCurrency(netFlowForPeriod)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Fixed vs Variable Expenses */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Total Fixed Expenses", pt: "Despesas Fixas Totais"})}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalFixedExpensesForPeriod)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Total Variable Expenses", pt: "Despesas Variáveis Totais"})}</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalVariableExpensesForPeriod)}</div>
            </CardContent>
          </Card>
        </div>

        {/* AI Insights */}
        <Card className="shadow-lg bg-muted/50">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Terminal className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Financial Insights by AI", pt: "Insights Financeiros por IA" })}</CardTitle>
              <CardDescription>
                {translate({ en: "AI-generated summary and advice for", pt: "Resumo e conselhos gerados por IA para" })} {displayedMonthYearLabel}.
                <br />
                {translate({ en: "This feature is in development. AI analysis will use transactions and defined budgets once fully integrated.", pt: "Esta funcionalidade está em desenvolvimento. A análise da IA usará transações e orçamentos definidos quando totalmente integrada."})}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
             <p className="text-muted-foreground text-center">
              {translate({ en: "AI insights are coming soon!", pt: "Insights da IA em breve!"})}
            </p>
          </CardContent>
        </Card>
        
        {/* Budget vs. Actual Spending */}
        <Card className="shadow-lg bg-muted/50">
          <CardHeader>
            <CardTitle>{translate({ en: "Budget vs. Actual Spending", pt: "Orçamento vs. Gasto Real" })}</CardTitle>
            <CardDescription>
               {translate({ en: "Comparison of your spending against defined budgets for", pt: "Comparação dos seus gastos com os orçamentos definidos para" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingBudgets || isLoadingTransactions || isLoadingPreferences ? (
              <div className="space-y-4 py-4">
                {[...Array(3)].map((_, i) => <Skeleton key={"budget-skeleton-" + i} className="h-20 w-full rounded-md" />)}
              </div>
            ) : budgetVsActualData.length > 0 ? (
              <div className="space-y-3">
                {budgetVsActualData.map((item) => (
                  <div key={item.categoryName} className="p-3 rounded-md border bg-card hover:bg-accent/10 transition-colors">
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
                          {item.difference >= 0 
                            ? translate({en: "under", pt: "abaixo"}) + " " + formatCurrency(item.difference)
                            : translate({en: "over", pt: "acima"}) + " " + formatCurrency(Math.abs(item.difference))
                          }
                        </span>
                       )}
                    </div>
                     <Progress 
                      value={item.budgeted > 0 ? Math.min(item.percentage, 100) : (item.actual > 0 ? 100 : 0) } 
                      className="h-2 mb-1" 
                      indicatorClassName={
                        item.budgeted > 0 ? (
                          item.percentage > 100 ? "bg-destructive" 
                          : item.percentage > 80 ? "bg-yellow-500" 
                          : "bg-primary"
                        ) : (item.actual > 0 ? "bg-destructive" : "bg-secondary") 
                      }
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{translate({en: "Spent:", pt: "Gasto:"})} {formatCurrency(item.actual)}</span>
                      <span>{translate({en: "Budget:", pt: "Orçado:"})} {formatCurrency(item.budgeted)}</span>
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

        {/* Expense Breakdown Chart */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Expense Breakdown by Category", pt: "Detalhamento de Despesas por Categoria" })}</CardTitle>
            <CardDescription>
               {translate({ en: "How your expenses were distributed in", pt: "Como suas despesas foram distribuídas em" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTransactions || isLoadingPreferences ? (
                <Skeleton className="h-80 w-full" />
            ) : expenseDataForChart.length > 0 ? (
               <ExpenseCategoryBarChart transactions={transactionsForDisplayedPeriod} userCategories={userDisplayCategories} />
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No expense data to display chart.", pt: "Sem dados de despesa para exibir o gráfico."})}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
 

