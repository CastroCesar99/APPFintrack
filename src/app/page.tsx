
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
import type { Transaction, CategoryName } from "@/types";
import { CATEGORIES, getCategoryLabel } from "@/types";
import { useLanguage } from '@/context/language-context';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { useDateNavigation } from '@/context/date-navigation-context';

const MONTHLY_BUDGET = 0;

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { translate, language } = useLanguage();
  const { toast } = useToast();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isClient, setIsClient] = useState(false);

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
      // Ensure loading is set to true if auth is still pending, as data fetch depends on user
      if (effectMountedRef.current && !isLoadingTransactions) {
          // setIsLoadingTransactions(true); // Potentially re-enable if issues persist with initial load state
      }
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

    // Core data fetching logic for a specific user
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log(`Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: ${userId}. PrevInitiatedFor: ${mainFetchInitiatedForUser.current}. ListenerExisted: ${!!unsubscribeSnapshotRef.current}`);
      cleanupListener(); 

      if (effectMountedRef.current && !isLoadingTransactions) {
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
        setIsLoadingTransactions(true);
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
              router.push('/onboarding');
            }
            return;
          }

          if (!userDocSnap.data().onboardingComplete) {
            console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding NOT complete for UserID:", currentUserId, ". Redirecting to onboarding.");
            if (effectMountedRef.current) {
              if(isLoadingTransactions) setIsLoadingTransactions(false);
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
            
            const fetchedTransactions = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Transaction));
            
            if (effectMountedRef.current) {
              console.log(`Dashboard: TRACER --- onSnapshot: Setting ${fetchedTransactions.length} transactions for UserID: ${currentUserId}.`);
              setTransactions(fetchedTransactions);
              if(isLoadingTransactions) {
                setIsLoadingTransactions(false);
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
                }) + (error.message ? ` (Code: ${error.code || 'N/A'})` : ''),
                variant: "destructive",
              });
              setTransactions([]);
              if(isLoadingTransactions) {
                setIsLoadingTransactions(false);
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (error callback) for UserID:", currentUserId);
              }
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
              description: translate({ en: "Could not load dashboard data.", pt: "Não foi possível carregar dados do painel." }) + (error.message ? ` (Code: ${error.code || 'N/A'})` : ''),
              variant: "destructive",
            });
            setTransactions([]);
            if(isLoadingTransactions) {
              setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (main catch block) for UserID:", currentUserId);
            }
          }
        }
      };
      fetchDataInternal(userId);
    } else {
      console.log(`Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: ${userId}. isLoadingTransactions: ${isLoadingTransactions}. Snapshot ref present: ${!!unsubscribeSnapshotRef.current}`);
      // If listener is active, and we are still loading, but we already have transactions (or it's empty but confirmed by listener), stop loading.
      if (isLoadingTransactions && unsubscribeSnapshotRef.current && effectMountedRef.current) {
          // This condition can be tricky. The listener might be active, but the first snapshot hasn't arrived yet.
          // Only set to false if there's a reason to believe data state is settled (e.g. transactions array has content, or listener is up and implies it's empty)
          // For now, will let onSnapshot callback handle setting isLoadingTransactions to false.
      } else if (isLoadingTransactions && !unsubscribeSnapshotRef.current && effectMountedRef.current) {
        console.warn("Dashboard: TRACER --- Main useEffect: No active listener but still loading. This might be an issue. Forcing false for UserID:", userId);
        if (effectMountedRef.current) setIsLoadingTransactions(false);
      }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient, router, toast, translate, isLoadingTransactions]); // Added isLoadingTransactions to dependencies


  const onAddTransaction = async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => {
    if (!userId) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }),
        variant: "destructive",
      });
      return;
    }

    const optimisticTransaction: Transaction = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description: newTransactionData.description,
      amount: newTransactionData.amount,
      type: newTransactionData.type,
      category: newTransactionData.category,
      date: newTransactionData.date,
      paymentMethod: newTransactionData.paymentMethod,
      installments: newTransactionData.installments,
      isRecurring: newTransactionData.isRecurring,
    };

    setTransactions(prevTransactions => 
      [optimisticTransaction, ...prevTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    );

    try {
      const transactionsColRef = collection(db, `users/${userId}/transactions`);
      
      // Prepare the object for Firestore, ensuring no undefined properties are sent
      const fullPayload = {
        description: newTransactionData.description,
        amount: newTransactionData.amount,
        type: newTransactionData.type,
        category: newTransactionData.category,
        date: newTransactionData.date,
        paymentMethod: newTransactionData.paymentMethod,
        installments: newTransactionData.installments,
        isRecurring: newTransactionData.isRecurring, // Form default is false, so it should be boolean
        userId: userId,
        createdAt: serverTimestamp(),
      };

      // Clean the payload: remove any properties that have an undefined value
      const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
      );
      
      // Ensure isRecurring is present, defaulting to false if it was initially undefined and thus removed.
      // newTransactionData.isRecurring is expected to be true/false from the form's checkbox.
      if (!('isRecurring' in dataToSave) && newTransactionData.isRecurring !== undefined) {
        // This case implies newTransactionData.isRecurring was undefined, which shouldn't happen for a checkbox
        // but as a safeguard, if it was passed as undefined and then removed:
         dataToSave.isRecurring = newTransactionData.isRecurring ?? false;
      } else if (!('isRecurring' in dataToSave)) {
        // If isRecurring was not in newTransactionData at all (which is unlikely for this field)
        dataToSave.isRecurring = false;
      }


      await addDoc(transactionsColRef, dataToSave);

      toast({
        title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }),
        description: `${newTransactionData.description} ${translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })}`,
      });
    } catch (error: any) {
      console.error("DashboardPage: Error adding transaction to Firestore:", error);
      setTransactions(prevTransactions => prevTransactions.filter(t => t.id !== optimisticTransaction.id));
      toast({
        title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }),
        description: (error.message || translate({ en: "Could not add transaction.", pt: "Não foi possível adicionar a transação." })) + (error.code ? ` (Code: ${error.code})` : ''),
        variant: "destructive",
      });
    }
  };


  const transactionsForDisplayedPeriod = useMemo(() => {
    const year = displayedDate.getFullYear();
    const month = displayedDate.getMonth();
    return transactions.filter(t => {
      const transactionDate = new Date(t.date);
      const transactionYear = transactionDate.getFullYear();
      const transactionMonth = transactionDate.getMonth();
      return (transactionYear === year && transactionMonth === month) || t.isRecurring === true;
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
  }, [transactionsForDisplayedPeriod, language]);


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
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod}
          monthlyBudget={MONTHLY_BUDGET}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />

        <QuickActionsSection onAddTransaction={onAddTransaction} />

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

    