
"use client";

import type React from 'react';
import { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { AppLayout } from "@/components/layout/app-layout";
// Button import removed as ExportData has its own
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Info, Lightbulb, CheckCircle, TrendingDown, TrendingUp, MinusCircle, Cog } from "lucide-react"; // Added Cog for placeholder
import type { Transaction } from "@/types";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { format as formatDateFns, parseISO as parseISODateFns } from 'date-fns';
// AI Flow import removed
// import { generateFinancialSummary, type FinancialSummaryOutput, type FinancialSummaryInput } from '@/ai/flows/financial-summary-flow';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpenseCategoryChart } from '@/components/dashboard/charts/expense-category-chart';
import { formatCurrency } from '@/lib/utils';
import { ExportData } from '@/components/dashboard/export-data';

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  // isLoadingInsights and financialInsights state removed
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
            createdAt: data.createdAt,
            userId: data.userId
        } as Transaction & { createdAt?: any, userId?: string };
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
    const targetMonth = displayedDate.getMonth(); // 0-indexed

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

  // useEffect for fetching insights removed

  const pageTitle = translate({ en: "Reports", pt: "Relatórios" });

  if (!isClient || authLoading || (isLoadingTransactions && !allTransactions.length) ) {
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

        {/* Basic Financial Summary Cards */}
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

        {/* AI Financial Insights Section - Replaced with "Coming Soon" placeholder */}
        <Card className="shadow-lg bg-muted/50 border-dashed">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
             <Cog className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
                <CardTitle>{translate({ en: "Financial Insights", pt: "Insights Financeiros" })}</CardTitle>
                <CardDescription>
                {translate({ en: "AI-generated summary and advice for", pt: "Resumo e conselhos gerados por IA para" })} {displayedMonthYearLabel}.
                </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 text-center">
            <p className="text-muted-foreground">
              {translate({ en: "This feature is coming soon!", pt: "Esta funcionalidade estará disponível em breve!" })}
            </p>
          </CardContent>
        </Card>

        {/* Expense Category Chart */}
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
