
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
// Button, ChevronLeft, ChevronRight removed as they are in AppHeaderContent
import type { Transaction, CategoryName } from "@/types";
import { CATEGORIES, getCategoryLabel } from "@/types";
import { useLanguage } from '@/context/language-context';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
// format, subMonths, addMonths, ptBR, enUS removed, now handled by DateNavigationContext
import { useDateNavigation } from '@/context/date-navigation-context';

const MONTHLY_BUDGET = 0; // Changed from 900 to 0

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { translate, language } = useLanguage();
  const { toast } = useToast();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation(); // Using context

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isClient, setIsClient] = useState(false);
  // Removed local displayedDate and displayedMonthYearLabel state

  const effectMountedRef = useRef(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  const userId = user?.uid;

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

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
      // Removed setIsLoadingTransactions(true) here as it's handled below
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

      cleanupListener(); // Clean up any old listener

      if (effectMountedRef.current) {
        // Set loading to true ONLY when we are about to initiate a new fetch for a new user or if there's no listener.
        // This avoids setting it to true if the effect re-runs for other reasons when a listener is already active.
        if (!isLoadingTransactions) {
             console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
             setIsLoadingTransactions(true);
        } else {
             console.log("Dashboard: TRACER --- isLoadingTransactions is already true for user:", userId, "proceeding with fetch/setup.");
        }
      }

      mainFetchInitiatedForUser.current = userId; // Mark that we've initiated for this user

      // Define the asynchronous data fetching logic within the effect
      const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early for UserID:", currentUserId);
            // If the effect unmounted and we were loading, ensure loading is set to false if current effect instance is still valid
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

          // If we reach here, user is onboarded. Set up transaction listener.
          console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener.");
          const transactionsColRef = collection(db, `users/${currentUserId}/transactions`);
          const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

          // Defensive check: if another listener was somehow set up by a rapid re-render, clean it
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
                setTransactions([]); // Set to empty array
                if(isLoadingTransactions) setIsLoadingTransactions(false); // Now safe to set loading to false
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (empty snapshot) for UserID:", currentUserId);
              }
            } else {
              const fetchedTransactions = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Transaction));
              if (effectMountedRef.current) {
                console.log(`Dashboard: TRACER --- onSnapshot: Setting ${fetchedTransactions.length} transactions for UserID: ${currentUserId}.`);
                setTransactions(fetchedTransactions);
                if(isLoadingTransactions) setIsLoadingTransactions(false); // Data loaded, set loading to false
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
              setTransactions([]); // Clear transactions on error
              if(isLoadingTransactions) setIsLoadingTransactions(false); // Error occurred, set loading to false
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (error callback) for UserID:", currentUserId);
            }
          });

        } catch (error: any) {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Main try-catch, effect unmounted for UserID:", currentUserId);
            // No need to set loading false here as the cleanup for the effect should handle it or new effect will.
            return;
          }
          console.error("Dashboard: TRACER --- fetchDataInternal: Error in main data fetching logic for UserID:", currentUserId, error);
          if (effectMountedRef.current) { // Check mount status again before UI updates
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

      fetchDataInternal(userId); // Call the async function

    } else {
      // This block means a listener should already be active for the current userId.
      // We might be here due to a re-render not caused by userId or authLoading changing.
      console.log(`Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: ${userId}. isLoadingTransactions: ${isLoadingTransactions}. Snapshot ref present: ${!!unsubscribeSnapshotRef.current}`);
      // If we are still loading but a listener is active, and we have transactions OR it's confirmed empty (not from cache), turn off loading.
      // This is a safeguard against getting stuck in loading if initial snapshot was from cache and empty.
      if (isLoadingTransactions && unsubscribeSnapshotRef.current && effectMountedRef.current) {
          // Check if the listener is not from cache OR if we have transactions.
          // This helps ensure we don't turn off loading too early if the first snapshot is cached and empty.
          // The check `!unsubscribeSnapshotRef.current?.INTERNAL?.metadata?.fromCache` is indicative and might not be standard/stable.
          // A more robust way is often to track if the "first real fetch" has completed.
          // For now, if we have transactions or the listener exists, it's safer to assume loading might be done.
          if (transactions.length > 0 || (transactions.length === 0 && unsubscribeSnapshotRef.current )) {
             console.log("Dashboard: TRACER --- Main useEffect: Listener active, forcing isLoadingTransactions to false for UserID:", userId);
             setIsLoadingTransactions(false);
          }
      } else if (isLoadingTransactions && !unsubscribeSnapshotRef.current && effectMountedRef.current) {
        // If still loading but no listener ref exists, something is wrong.
        console.warn("Dashboard: TRACER --- Main useEffect: No active listener but still loading. This might indicate a problem. Forcing false for UserID:", userId);
        setIsLoadingTransactions(false);
      }
    }

    return fullCleanup; // Cleanup function for the effect
  }, [userId, authLoading, isClient]); // Removed router, toast, translate from dependencies


  const transactionsForDisplayedPeriod = useMemo(() => {
    const year = displayedDate.getFullYear();
    const month = displayedDate.getMonth();
    return transactions.filter(t => {
      const transactionDate = new Date(t.date);
      const transactionYear = transactionDate.getFullYear();
      const transactionMonth = transactionDate.getMonth();
      const isInCurrentMonth = transactionYear === year && transactionMonth === month;
      const isRecurring = t.isRecurring === true; // Check if isRecurring is explicitly true
      return isInCurrentMonth || isRecurring;
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
        {/* Month Navigation Card REMOVED from here */}

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
