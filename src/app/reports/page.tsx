
"use client";

import type React from 'react';
import { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Info, Lightbulb, CheckCircle, TrendingDown, TrendingUp, MinusCircle, PieChart as PieChartIcon, CreditCard, Package, Target } from "lucide-react"; // Added Target
import type { Transaction, CategoryName } from "@/types";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { format as formatDateFns, parseISO as parseISODateFns } from 'date-fns';
// import { generateFinancialSummary, type FinancialSummaryOutput, type FinancialSummaryInput } from '@/ai/flows/financial-summary-flow';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpenseCategoryChart } from '@/components/dashboard/charts/expense-category-chart';
import { formatCurrency } from '@/lib/utils';
import { ExportData } from '@/components/dashboard/export-data';

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { translate, language } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  // const [financialInsights, setFinancialInsights] = useState<FinancialSummaryOutput | null>(null);
  // const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!user || authLoading || !isClient) {
      if (!authLoading && !user && isClient) router.push('/login');
      return;
    }

    setIsLoadingTransactions(true);
    const transactionsColRef = collection(db, 'users/' + user.uid + '/transactions');
    const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

    const unsubscribe = onSnapshot(q_transactions, (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let dateString = data.date;
        if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
          dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
        } else if (typeof data.date === 'string' && data.date.includes('T')) {
          try {
            dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
          } catch (e) {
            console.warn("ReportsPage: Failed to parse ISO date string: " + data.date, e);
            dateString = formatDateFns(new Date(), "yyyy-MM-dd");
          }
        } else if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
           console.warn("ReportsPage: Transaction has unexpected date format. Fallback to current date. Date was:", data.date);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd");
        }
        return {
            ...data,
            id: docSnap.id,
            date: dateString,
            paymentMethod: data.paymentMethod,
            installments: data.installments,
            isRecurring: data.isRecurring,
            expenseNature: data.expenseNature,
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
      setIsLoadingTransactions(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, isClient, toast, translate, router]);

  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetYear = displayedDate.getFullYear();
    const targetMonth = displayedDate.getMonth(); 

    return allTransactions.filter(t => {
      const dateParts = t.date.split('-');
      if (dateParts.length !== 3) return false;
      const transactionYear = parseInt(dateParts[0], 10);
      const transactionMonth = parseInt(dateParts[1], 10) - 1;
      return transactionYear === targetYear && transactionMonth === targetMonth;
    });
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

  // useEffect(() => {
  //   const fetchInsights = async () => {
  //     if (transactionsForDisplayedPeriod.length === 0 && !isLoadingTransactions) {
  //       setFinancialInsights({
  //         overallStatus: translate({ en: "No data for insights.", pt: "Sem dados para insights." }),
  //         keyObservations: [translate({ en: "Add transactions to see your financial summary.", pt: "Adicione transações para ver seu resumo financeiro." })],
  //         actionableAdvice: []
  //       });
  //       return;
  //     }
      
  //     if (transactionsForDisplayedPeriod.length > 0) {
  //       setIsLoadingInsights(true);
  //       setFinancialInsights(null); 

  //       const simulatedBudgetsForMonth: Record<CategoryName, number> = {};
        
  //       const plainTransactions = transactionsForDisplayedPeriod.map(t => ({
  //         id: t.id,
  //         date: t.date,
  //         description: t.description,
  //         amount: t.amount,
  //         type: t.type,
  //         category: t.category,
  //         paymentMethod: t.paymentMethod,
  //         installments: t.installments,
  //         isRecurring: t.isRecurring,
  //         expenseNature: t.expenseNature,
  //       }));

  //       try {
  //         const input: FinancialSummaryInput = {
  //           transactionsForMonth: plainTransactions,
  //           budgetsForMonth: Object.keys(simulatedBudgetsForMonth).length > 0 ? simulatedBudgetsForMonth : undefined,
  //           monthYearLabel: displayedMonthYearLabel,
  //         };
  //         // const insights = await generateFinancialSummary(input);
  //         // setFinancialInsights(insights);
  //       } catch (error) {
  //         console.error("ReportsPage: Error generating financial insights:", error);
  //         // setFinancialInsights({
  //         //   overallStatus: translate({ en: "Could not load insights.", pt: "Não foi possível carregar os insights." }),
  //         //   keyObservations: [translate({ en: "An error occurred while generating the summary.", pt: "Ocorreu um erro ao gerar o resumo." })],
  //         //   actionableAdvice: []
  //         // });
  //         toast({
  //           title: translate({ en: "AI Insights Error", pt: "Erro nos Insights da IA" }),
  //           description: translate({ en: "Could not generate financial summary.", pt: "Não foi possível gerar o resumo financeiro." }),
  //           variant: "destructive",
  //         });
  //       } finally {
  //         // setIsLoadingInsights(false);
  //       }
  //     }
  //   };

  //   if (!isLoadingTransactions && isClient) {
  //     fetchInsights();
  //   }
  // }, [transactionsForDisplayedPeriod, isLoadingTransactions, displayedMonthYearLabel, translate, toast, isClient]);


  const pageTitle = translate({ en: "Reports", pt: "Relatórios" });

  if (!isClient || authLoading || (isLoadingTransactions && allTransactions.length === 0)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-foreground">{translate({ en: "Loading reports...", pt: "Carregando relatórios..." })}</p>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Total Income", pt: "Receita Total"})}</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalIncomeForPeriod)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Total Expenses", pt: "Despesa Total"})}</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalExpensesForPeriod)}</div>
            </CardContent>
          </Card>
          <Card>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Total Fixed Expenses", pt: "Despesas Fixas Totais"})}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalFixedExpensesForPeriod)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{translate({en: "Total Variable Expenses", pt: "Despesas Variáveis Totais"})}</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
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
                {translate({ en: "This feature is in development. Saving and loading budgets is required for full insights.", pt: "Esta funcionalidade está em desenvolvimento. Salvar e carregar orçamentos é necessário para insights completos."})}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
             <p className="text-muted-foreground text-center">
              {translate({ en: "AI insights are coming soon!", pt: "Insights da IA em breve!"})}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>{translate({ en: "Budget vs. Actual", pt: "Orçamento vs. Real" })}</CardTitle>
            <CardDescription>
               {translate({ en: "Comparison of your spending against defined budgets for", pt: "Comparação dos seus gastos com os orçamentos definidos para" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[200px]"> {/* Adjusted height */}
            <div className="text-center">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {translate({ 
                  en: "Detailed budget comparison is coming soon. Please set and save your budgets on the 'Budgets' page to enable this view.", 
                  pt: "A comparação detalhada do orçamento estará disponível em breve. Por favor, defina e salve seus orçamentos na página 'Orçamentos' para habilitar esta visualização."
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{translate({ en: "Expense Breakdown", pt: "Detalhamento de Despesas" })}</CardTitle>
            <CardDescription>
               {translate({ en: "How your expenses were distributed in", pt: "Como suas despesas foram distribuídas em" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length > 0 ? (
              <ExpenseCategoryChart transactions={transactionsForDisplayedPeriod} />
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


    