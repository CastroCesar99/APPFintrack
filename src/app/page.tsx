
'use client';
import React, { useRef } from 'react';
import { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Transaction, CategoryName } from "@/types";
import { CATEGORIES, getCategoryLabel } from "@/types";
import { useLanguage } from '@/context/language-context';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { format, subMonths, addMonths } from "date-fns";
import { ptBR, enUS } from 'date-fns/locale';

const MONTHLY_BUDGET = 900;

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { translate, language } = useLanguage();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [displayedDate, setDisplayedDate] = useState<Date>(new Date());
  const [displayedMonthYearLabel, setDisplayedMonthYearLabel] = useState('');


  const effectMountedRef = useRef(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  const userId = user?.uid;

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (language && isClient && displayedDate) {
      const locale = language === 'pt' ? ptBR : enUS;
      // Capitalize the first letter of the month
      const formattedMonth = format(displayedDate, "MMMM yyyy", { locale });
      setDisplayedMonthYearLabel(formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1));
      console.log("Dashboard: TRACER --- displayedMonthYearLabel set to", formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1));
    }
  }, [language, isClient, displayedDate]);


  useEffect(() => {
    effectMountedRef.current = true;
    console.log(`Dashboard: TRACER --- Main useEffect START. UserID: ${userId}, AuthLoading: ${authLoading}, isClient: ${isClient}, InitiatedFor: ${mainFetchInitiatedForUser.current}, isLoadingTransactions: ${isLoadingTransactions}`);

    const cleanupListener = () => {
      if (unsubscribeSnapshotRef.current) {
        console.log("Dashboard: TRACER --- cleanupListener: Unsubscribing snapshot for UserID:", mainFetchInitiatedForUser.current);
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }
    };

    const fullCleanup = () => {
      console.log("Dashboard: TRACER --- Main useEffect FULL CLEANUP for UserID:", mainFetchInitiatedForUser.current);
      cleanupListener();
      effectMountedRef.current = false;
    };

    if (!isClient) {
      console.log("Dashboard: TRACER --- Main useEffect: Not client yet, waiting.");
      return fullCleanup;
    }

    if (authLoading) {
      console.log("Dashboard: TRACER --- Main useEffect: Auth is loading, waiting...");
      return fullCleanup;
    }

    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      cleanupListener();
      if (effectMountedRef.current) {
        setTransactions([]);
        if(isLoadingTransactions) setIsLoadingTransactions(false);
      }
      mainFetchInitiatedForUser.current = null;
      if (effectMountedRef.current) router.push('/login');
      return fullCleanup;
    }

    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log(`Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: ${userId}. PrevInitiatedFor: ${mainFetchInitiatedForUser.current}. ListenerExisted: ${!!unsubscribeSnapshotRef.current}`);

      cleanupListener();

      if (effectMountedRef.current) {
        if (!isLoadingTransactions) {
             console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
             setIsLoadingTransactions(true);
        } else {
             console.log("Dashboard: TRACER --- isLoadingTransactions is already true for user:", userId, "proceeding with fetch/setup.");
        }
      }

      mainFetchInitiatedForUser.current = userId;

      const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early for UserID:", currentUserId);
            if(isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
            return;
        }
        console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

        try {
          const userDocRef = doc(db, "users", currentUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted while fetching user doc for UserID:", currentUserId);
            if(isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
            return;
          }

          if (!userDocSnap.exists()) {
            console.warn("Dashboard: TRACER --- fetchDataInternal: User document NOT FOUND for UserID:", currentUserId, ". Redirecting to onboarding.");
            if (effectMountedRef.current) {
              if(isLoadingTransactions) setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (user doc not found).");
              router.push('/onboarding');
            }
            return;
          }

          if (!userDocSnap.data().onboardingComplete) {
            console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding NOT complete for UserID:", currentUserId, ". Redirecting to onboarding.");
            if (effectMountedRef.current) {
              if(isLoadingTransactions) setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (onboarding not complete).");
              router.push('/onboarding');
            }
            return;
          }

          console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener.");
          const transactionsColRef = collection(db, `users/${currentUserId}/transactions`);
          const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

          if (unsubscribeSnapshotRef.current) {
              console.warn("Dashboard: TRACER --- fetchDataInternal: Stale snapshot ref found before new onSnapshot. Cleaning up again.");
              unsubscribeSnapshotRef.current();
              unsubscribeSnapshotRef.current = null;
          }

          unsubscribeSnapshotRef.current = onSnapshot(q_transactions, (querySnapshot) => {
            if (!effectMountedRef.current) {
              console.log("Dashboard: TRACER --- onSnapshot: Effect unmounted for UserID:", currentUserId, ". Skipping state update.");
              return;
            }
            console.log(`Dashboard: TRACER --- onSnapshot: Received data for UserID: ${currentUserId}. Empty: ${querySnapshot.empty}, PendingWrites: ${querySnapshot.metadata.hasPendingWrites}`);

            if (querySnapshot.empty) {
              console.log("Dashboard: TRACER --- onSnapshot: Transactions collection empty for UserID:", currentUserId);
              if (effectMountedRef.current) {
                setTransactions([]);
                if(isLoadingTransactions) setIsLoadingTransactions(false);
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (empty snapshot) for UserID:", currentUserId);
              }
            } else {
              const fetchedTransactions = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Transaction));
              if (effectMountedRef.current) {
                console.log(`Dashboard: TRACER --- onSnapshot: Setting ${fetchedTransactions.length} transactions for UserID: ${currentUserId}.`);
                setTransactions(fetchedTransactions);
                if(isLoadingTransactions) setIsLoadingTransactions(false);
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
                }) + (error.message ? ` (${error.message})` : ''),
                variant: "destructive",
              });
              setTransactions([]);
              if(isLoadingTransactions) setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (error callback) for UserID:", currentUserId);
            }
          });

        } catch (error: any) {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Main try-catch, effect unmounted for UserID:", currentUserId);
            return;
          }
          console.error("Dashboard: TRACER --- fetchDataInternal: Error in main data fetching logic for UserID:", currentUserId, error);
          if (effectMountedRef.current) {
            toast({
              title: translate({ en: "Error", pt: "Erro" }),
              description: translate({ en: "Could not load dashboard data.", pt: "Não foi possível carregar dados do painel." }) + (error.message ? ` (${error.message})` : ''),
              variant: "destructive",
            });
            setTransactions([]);
            if(isLoadingTransactions) setIsLoadingTransactions(false);
            console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (main catch block) for UserID:", currentUserId);
          }
        }
      };

      fetchDataInternal(userId);

    } else {
      console.log(`Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: ${userId}. isLoadingTransactions: ${isLoadingTransactions}. Snapshot ref present: ${!!unsubscribeSnapshotRef.current}`);
      // Ensure loading is false if listener is active and we have transactions or it's confirmed empty
      if (isLoadingTransactions && unsubscribeSnapshotRef.current && effectMountedRef.current) {
          if (transactions.length > 0 || (transactions.length === 0 && !unsubscribeSnapshotRef.current?.INTERNAL.metadata.fromCache)) { // Check if empty is from server or just initial state
             console.log("Dashboard: TRACER --- Main useEffect: Listener active, forcing isLoadingTransactions to false for UserID:", userId);
             setIsLoadingTransactions(false);
          }
      } else if (isLoadingTransactions && !unsubscribeSnapshotRef.current && effectMountedRef.current) {
        console.warn("Dashboard: TRACER --- Main useEffect: No active listener but still loading. This might indicate a problem. Forcing false for UserID:", userId);
        setIsLoadingTransactions(false);
      }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    const year = displayedDate.getFullYear();
    const month = displayedDate.getMonth();
    return transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.getFullYear() === year && transactionDate.getMonth() === month;
    });
  }, [transactions, displayedDate]);

  const recentIncome = useMemo(() => {
    return transactions
      .filter(t => t.type === 'income')
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [transactions]);

  const recentExpenses = useMemo(() => {
    return transactions
      .filter(t => t.type === 'expense')
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [transactions]);

  const largestExpenseCategoryForDisplayedPeriod = useMemo(() => {
    const expensesThisPeriod = transactionsForDisplayedPeriod.filter(t => t.type === 'expense');
    if (expensesThisPeriod.length === 0) {
      return null;
    }

    const expensesByCategory: Record<string, number> = {};
    for (const transaction of expensesThisPeriod) {
      expensesByCategory[transaction.category] = (expensesByCategory[transaction.category] || 0) + transaction.amount;
    }

    let maxAmount = 0;
    let largestCategoryKey: string | null = null;

    for (const categoryKey in expensesByCategory) {
      if (expensesByCategory[categoryKey] > maxAmount) {
        maxAmount = expensesByCategory[categoryKey];
        largestCategoryKey = categoryKey;
      }
    }

    if (largestCategoryKey) {
      const categoryDetails = CATEGORIES.find(cat => cat.name === largestCategoryKey);
      return {
        name: largestCategoryKey as CategoryName,
        amount: maxAmount,
        icon: categoryDetails?.icon || 'CircleHelp',
      };
    }
    return null;
  }, [transactionsForDisplayedPeriod]);


  const handlePreviousMonth = () => {
    setDisplayedDate(current => subMonths(current, 1));
  };

  const handleNextMonth = () => {
    setDisplayedDate(current => addMonths(current, 1));
  };


  if (!isClient || authLoading || isLoadingTransactions) {
    console.log("Dashboard: TRACER --- RENDERING LOADING SCREEN. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions);
    return (
        <div className="flex items-center justify-center h-screen w-full bg-background">
          <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..."})}</p>
        </div>
    );
  }
  console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions:", transactions.length, "isLoadingTransactions:", isLoadingTransactions);


  return (
    <AppLayout>
      <div className="space-y-8">
        <Card className="shadow-md rounded-lg">
          <CardContent className="p-4 flex items-center justify-between">
            <Button onClick={handlePreviousMonth} variant="outline" size="icon" aria-label={translate({en: "Previous Month", pt: "Mês Anterior"})}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-xl font-semibold text-center text-primary truncate px-2">
              {displayedMonthYearLabel}
            </h2>
            <Button onClick={handleNextMonth} variant="outline" size="icon" aria-label={translate({en: "Next Month", pt: "Próximo Mês"})}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </CardContent>
        </Card>

        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod}
          monthlyBudget={MONTHLY_BUDGET}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />

        <QuickActionsSection />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecentTransactionsSection
            title={translate({ en: "Recent Income", pt: "Receitas Recentes" })}
            description={translate({ en: "Your latest income entries.", pt: "Suas últimas entradas de receita." })}
            transactions={recentIncome}
            type="income"
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={translate({ en: "Your last few transactions.", pt: "Suas últimas transações." })}
            transactions={recentExpenses}
            type="expense"
          />
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}</CardTitle>
            <CardDescription>
              {translate({ en: "Your top spending category for", pt: "Sua principal categoria de gasto em" })} {displayedMonthYearLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {largestExpenseCategoryForDisplayedPeriod ? (
              <div className="flex items-center space-x-4 p-4 rounded-lg bg-card">
                <CategoryIcon iconName={largestExpenseCategoryForDisplayedPeriod.icon} className="h-10 w-10 text-primary flex-shrink-0" />
                <div className="flex-grow">
                  <p className="text-sm font-medium text-foreground truncate">
                    {getCategoryLabel(largestExpenseCategoryForDisplayedPeriod.name, language)}
                  </p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(largestExpenseCategoryForDisplayedPeriod.amount)}
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
      </div>
    </AppLayout>
  );
}
