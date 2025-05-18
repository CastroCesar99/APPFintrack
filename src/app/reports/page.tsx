
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Info, Lightbulb, CheckCircle, TrendingDown, TrendingUp, MinusCircle, Package, Target, Wallet } from "lucide-react"; 
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel } from "@/types";
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
  isWithinInterval
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

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch User Preferences (for category display names and icons)
  useEffect(() => {
    if (!user || !isClient || authLoading) {
      setIsLoadingPreferences(false); 
      setUserDisplayCategories([...CATEGORIES]); 
      return;
    }
    setIsLoadingPreferences(true);
    const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
    
    const unsubscribe = onSnapshot(preferencesDocRef, (docSnap) => {
        let finalCategories: DisplayCategory[] = [];
        if (docSnap.exists()) {
            const prefsData = docSnap.data() as UserPreferences;
            const customCategoriesFromDb: CustomCategoryData[] = prefsData.userDefinedCategories || [];
            const deselectedPredefinedNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
            
            const customCategoriesMap = new Map<string, CustomCategoryData>();
            customCategoriesFromDb.forEach(cc => customCategoriesMap.set(cc.name.toLowerCase(), cc));

            finalCategories = CATEGORIES
                .filter(pCat => !deselectedPredefinedNames.has(pCat.name.toLowerCase()))
                .map(pCat => {
                    const customOverride = customCategoriesMap.get(pCat.name.toLowerCase());
                    if (customOverride) {
                        customCategoriesMap.delete(pCat.name.toLowerCase()); 
                        return { ...pCat, ...customOverride, type: pCat.type }; 
                    }
                    return pCat;
                });
            
            customCategoriesMap.forEach(customCat => {
                if (!finalCategories.some(c => c.name.toLowerCase() === customCat.name.toLowerCase())) {
                    finalCategories.push(customCat);
                }
            });
        } else {
            finalCategories = [...CATEGORIES];
        }
        
        if (finalCategories.length === 0) { 
            finalCategories = [...CATEGORIES];
        }
        
        setUserDisplayCategories(finalCategories.sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
    }, (error) => {
        console.error("ReportsPage: Error fetching user preferences:", error);
        toast({
            title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }),
            description: translate({ en: "Could not load category details.", pt: "Não foi possível carregar detalhes das categorias." }),
            variant: "destructive",
        });
        setUserDisplayCategories([...CATEGORIES].sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
    });
    return () => unsubscribe();
  }, [user, isClient, authLoading, language, toast, translate]);


  // Fetch Transactions
  useEffect(() => {
    if (!user || authLoading || !isClient) {
      if (!authLoading && !user && isClient) router.push('/login');
      setIsLoadingTransactions(false);
      setAllTransactions([]);
      return;
    }

    setIsLoadingTransactions(true);
    const transactionsColRef = collection(db, 'users/' + user.uid + '/transactions');
    const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

    const unsubscribe = onSnapshot(q_transactions, (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let dateString = "";
        if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
          dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
        } else if (typeof data.date === 'string') {
          if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
            dateString = data.date;
          } else if (data.date.includes('T')) {
            try { 
                dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); 
            }
            catch (e1) { 
                try {
                    dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                } catch (e2) {
                    console.warn("ReportsPage (TX Date Parse ISO Fallback): Failed for tx " + docSnap.id + ": " + String(data.date), e2); dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                }
            }
          } else {
             try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd"); }
             catch (e) { console.warn("ReportsPage (TX Date Parse General): Failed for tx " + docSnap.id + ": " + String(data.date), e); dateString = formatDateFns(new Date(), "yyyy-MM-dd");}
          }
        } else {
           console.warn("ReportsPage (TX Date Parse Missing/Invalid): Invalid date for tx " + docSnap.id + ":", data.date);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd");
        }

        let effectiveMonthString = data.effectiveMonth;
        if (!effectiveMonthString && dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            try {
                effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
            } catch (e) {
                console.warn("ReportsPage: Could not parse date " + String(dateString) + " to derive effectiveMonth for tx " + String(docSnap.id));
                effectiveMonthString = formatDateFns(new Date(), "yyyy-MM"); 
            }
        } else if (!effectiveMonthString) {
            effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
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
      setAllTransactions(fetchedTransactions);
      setIsLoadingTransactions(false);
    }, (error) => {
      console.error("ReportsPage: Error fetching transactions:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not fetch transactions.", pt: "Não foi possível buscar as transações." }),
        variant: "destructive",
      });
      setAllTransactions([]);
      setIsLoadingTransactions(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, isClient, toast, translate, router]);

  // Fetch Budgets for the displayed month
  useEffect(() => {
    if (!user || authLoading || !isClient) {
      setIsLoadingBudgets(false);
      setLoadedBudgets(null);
      return;
    }
    setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    const budgetDocRef = doc(db, `users/${user.uid}/budgets/${budgetMonthKey}`);
    
    const fetchBudgets = async () => {
      try {
        const docSnap = await getDoc(budgetDocRef);
        if (docSnap.exists()) {
          const budgetData = docSnap.data() as Record<string, any>; 
          const validBudgets: Record<string, number> = {};
          for (const key in budgetData) {
            if (key !== 'lastUpdated' && typeof budgetData[key] === 'number') { 
              validBudgets[key] = budgetData[key];
            }
          }
          setLoadedBudgets(validBudgets);
        } else {
          setLoadedBudgets({}); 
        }
      } catch (error) {
        console.error("ReportsPage: Error loading budgets:", error);
        toast({
          title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }),
          description: translate({ en: "Could not load budget data for comparison.", pt: "Não foi possível carregar os dados do orçamento para comparação." }),
          variant: "destructive"
        });
        setLoadedBudgets({});
      } finally {
        setIsLoadingBudgets(false);
      }
    };
    if(user) fetchBudgets();
  }, [user, authLoading, isClient, displayedDate, toast, translate]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); // 0-indexed
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    const targetEffectiveMonthString = formatDateFns(displayedDate, "yyyy-MM");

    let filtered: Transaction[] = [];

    allTransactions.forEach(t => {
      let includeTransaction = false;
      let transactionDateForComparison: Date;
      try {
        transactionDateForComparison = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
      } catch (e) {
        console.warn(`ReportsPage: Invalid original date format for transaction ID ${t.id}: ${t.date}`);
        return; // Skip this transaction if date is unparseable
      }

      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        const installmentSeriesStartDate = startOfMonth(transactionDateForComparison);
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        if (monthDiff >= 0 && monthDiff < t.installments) {
          includeTransaction = true;
        }
      } else if (t.isRecurring === true && t.expenseType !== 'installment') {
        const originalTransactionYear = getYearFns(transactionDateForComparison);
        const originalTransactionMonth = getMonthFns(transactionDateForComparison);
        if (originalTransactionYear < targetYear || (originalTransactionYear === targetYear && originalTransactionMonth <= targetMonth)) {
          includeTransaction = true;
        }
      } else if (!t.isRecurring && t.expenseType !== 'installment') {
        if (t.effectiveMonth === targetEffectiveMonthString) {
          includeTransaction = true;
        }
      } else if (t.type === 'income') { // Handle income separately for clarity
         if (t.isRecurring === true) {
            const originalTransactionYear = getYearFns(transactionDateForComparison);
            const originalTransactionMonth = getMonthFns(transactionDateForComparison);
            if (originalTransactionYear < targetYear || (originalTransactionYear === targetYear && originalTransactionMonth <= targetMonth)) {
                includeTransaction = true;
            }
         } else { // Non-recurring income
            if (t.effectiveMonth === targetEffectiveMonthString) {
                includeTransaction = true;
            }
         }
      }
      
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    return filtered;
  }, [allTransactions, displayedDate]);


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
    if (!loadedBudgets || isLoadingPreferences || userDisplayCategories.length === 0) {
      return [];
    }

    const actualSpending: Record<string, number> = {};
    transactionsForDisplayedPeriod
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const categoryKey = t.category as string; 
        actualSpending[categoryKey] = (actualSpending[categoryKey] || 0) + t.amount;
      });

    const budgetKeys = Object.keys(loadedBudgets || {}).filter(key => key !== 'lastUpdated');
    const spendingKeys = Object.keys(actualSpending);
    const allRelevantCategoryInternalNames = new Set<string>([...budgetKeys, ...spendingKeys]);
    
    if (allRelevantCategoryInternalNames.size === 0 && budgetKeys.every(key => (loadedBudgets[key] || 0) === 0)) {
        return []; 
    }

    return Array.from(allRelevantCategoryInternalNames).map(internalName => {
      const categoryInfo = userDisplayCategories.find(cat => cat.name.toLowerCase() === internalName.toLowerCase());
      const displayName = categoryInfo ? getCategoryDisplayLabel(categoryInfo, language) : internalName;
      const icon = categoryInfo?.icon || 'CircleHelp'; 
      
      const budgeted = loadedBudgets[internalName] || 0;
      const actual = actualSpending[internalName] || 0;
      const difference = budgeted - actual;
      const percentageRaw = budgeted > 0 ? (actual / budgeted) * 100 : (actual > 0 ? 1000 : 0); 
      
      return {
        categoryName: displayName,
        icon: icon,
        budgeted,
        actual,
        difference,
        percentage: percentageRaw
      };
    }).filter(item => item.budgeted > 0 || item.actual > 0) 
      .sort((a,b) => (b.budgeted + b.actual) - (a.budgeted + a.actual)); 
  }, [loadedBudgets, transactionsForDisplayedPeriod, userDisplayCategories, language, isLoadingPreferences]);

  const expenseDataForChart = useMemo(() => {
    const expensesByCategory = transactionsForDisplayedPeriod
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        const categoryInternalName = t.category as string; 
        acc[categoryInternalName] = (acc[categoryInternalName] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

     return Object.entries(expensesByCategory)
      .map(([internalName, value]) => {
        const categoryDetail = userDisplayCategories.find(cat => cat.name.toLowerCase() === internalName.toLowerCase());
        return {
          name: internalName, 
          value,
          displayName: categoryDetail ? getCategoryDisplayLabel(categoryDetail, language) : internalName,
        };
      })
      .sort((a, b) => b.value - a.value); 
  }, [transactionsForDisplayedPeriod, userDisplayCategories, language]);


  const pageTitle = translate({ en: "Reports", pt: "Relatórios" });
  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;

  if (overallLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <Skeleton className="h-9 w-1/3" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => <Skeleton key={`summary-skel-${i}`} className="h-24 w-full" />)}
          </div>
           <div className="grid gap-4 md:grid-cols-2">
            {[...Array(2)].map((_, i) => <Skeleton key={`fixed-var-skel-${i}`} className="h-24 w-full" />)}
          </div>
          <Card className="shadow-lg bg-muted/50">
            <CardHeader>
              <Skeleton className="h-6 w-1/2 mb-2" />
              <Skeleton className="h-4 w-3/4" />
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
                    {[...Array(3)].map((_, i) => <Skeleton key={`budget-skeleton-${i}`} className="h-20 w-full rounded-md" />)}
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {pageTitle} - {displayedMonthYearLabel}
          </h1>
          <ExportData transactions={transactionsForDisplayedPeriod} />
        </div>

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
              <MinusCircle className={`h-4 w-4 ${netFlowForPeriod >= 0 ? 'text-green-500' : 'text-red-500'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${netFlowForPeriod >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatCurrency(netFlowForPeriod)}</div>
            </CardContent>
          </Card>
        </div>

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
                {[...Array(3)].map((_, i) => <Skeleton key={`budget-skeleton-${i}`} className="h-20 w-full rounded-md" />)}
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
                            ? `${formatCurrency(item.difference)} ${translate({en: "under", pt: "abaixo"})}`
                            : `${formatCurrency(Math.abs(item.difference))} ${translate({en: "over", pt: "acima"})}`
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
                        ) : (item.actual > 0 ? "bg-primary" : "bg-secondary") 
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

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Expense Breakdown by Category", pt: "Detalhamento de Despesas por Categoria" })}</CardTitle>
            <CardDescription>
               {translate({ en: "How your expenses were distributed in", pt: "Como suas despesas foram distribuídas em" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length > 0 ? (
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

    
