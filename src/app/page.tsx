
'use client';
import React, { useRef } from 'react';
import { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { ExpenseCategoryChart } from "@/components/dashboard/charts/expense-category-chart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction } from "@/types";
import { useLanguage } from '@/context/language-context';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { v4 as uuidv4 } from 'uuid';
import { useToast } from "@/hooks/use-toast";

// This can be used to seed initial transactions if the user has none
const seedTransactions: Omit<Transaction, 'id'>[] = [
  { date: '2025-05-08', description: 'Salário Gi', amount: 4100, type: 'income', category: 'Salary' },
  { date: '2025-05-08', description: 'Salary', amount: 2500, type: 'income', category: 'Salary' },
  { date: '2025-05-01', description: 'Freelance Project', amount: 300, type: 'income', category: 'Freelance' },
  { date: '2025-04-08', description: 'Salary', amount: 2400, type: 'income', category: 'Salary' },
  { date: '2025-05-10', description: 'Stock Dividends', amount: 200, type: 'income', category: 'Investment' },
  { date: '2025-05-08', description: 'Lunch at Cafe', amount: 12.50, type: 'expense', category: 'Dining Out' },
  { date: '2025-05-07', description: 'Weekly groceries', amount: 55.00, type: 'expense', category: 'Groceries' },
  { date: '2025-05-06', description: 'Electricity Bill', amount: 250.00, type: 'expense', category: 'Utilities' },
  { date: '2025-05-08', description: 'Gasoline', amount: 30.00, type: 'expense', category: 'Transport' },
  { date: '2025-05-07', description: 'New T-shirt', amount: 75.00, type: 'expense', category: 'Shopping' },
  { date: '2025-04-15', description: 'Rent Payment', amount: 1500, type: 'expense', category: 'Rent/Mortgage' },
  { date: '2025-05-03', description: 'Movie Tickets', amount: 25.00, type: 'expense', category: 'Entertainment' },
];


const MONTHLY_BUDGET = 900;

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { translate, language } = useLanguage();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [currentMonthName, setCurrentMonthName] = useState('');
  const [isClient, setIsClient] = useState(false);

  const effectMountedRef = useRef(true); // To track if the effect is still mounted
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null); // Track for which user fetch was started

  const userId = user?.uid; // Stable primitive or undefined

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (language && isClient) {
      const date = new Date();
      const month = date.toLocaleString(language === 'pt' ? 'pt-BR' : 'en-US', { month: 'long' });
      setCurrentMonthName(month.charAt(0).toUpperCase() + month.slice(1));
      console.log("Dashboard: TRACER --- currentMonthName set to", month.charAt(0).toUpperCase() + month.slice(1));
    }
  }, [language, isClient]);


  // Main data fetching and subscription effect
  useEffect(() => {
    effectMountedRef.current = true; // Mark effect as active for this run
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
            console.warn("Dashboard: TRACER --- fetchDataInternal: User document NOT FOUND for UserID:", currentUserId, ". Redirecting to onboarding (was signup).");
            if (effectMountedRef.current) {
              if(isLoadingTransactions) setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (user doc not found).");
              router.push('/onboarding'); // Changed from /signup
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

          unsubscribeSnapshotRef.current = onSnapshot(q_transactions, async (querySnapshot) => {
            if (!effectMountedRef.current) {
              console.log("Dashboard: TRACER --- onSnapshot: Effect unmounted for UserID:", currentUserId, ". Skipping state update.");
              return;
            }
            console.log(`Dashboard: TRACER --- onSnapshot: Received data for UserID: ${currentUserId}. Empty: ${querySnapshot.empty}, PendingWrites: ${querySnapshot.metadata.hasPendingWrites}`);

            if (querySnapshot.empty && !querySnapshot.metadata.hasPendingWrites) {
              const userTransactionsStatusRef = doc(db, `users/${currentUserId}/status`, "transactions");
              let statusSnap;
              try {
                statusSnap = await getDoc(userTransactionsStatusRef);
                if (!effectMountedRef.current) return;

                if (!statusSnap.exists() || !statusSnap.data().seeded) {
                  console.log("Dashboard: TRACER --- onSnapshot: Transactions not seeded for UserID:", currentUserId, ". Seeding now.");
                  const batch = writeBatch(db);
                  seedTransactions.forEach(txData => {
                    const id = uuidv4();
                    const docRef = doc(db, `users/${currentUserId}/transactions`, id);
                    batch.set(docRef, { ...txData, id, userId: currentUserId, createdAt: serverTimestamp() });
                  });
                  batch.set(userTransactionsStatusRef, { seeded: true, seededAt: serverTimestamp() });
                  
                  try {
                    await batch.commit();
                    console.log("Dashboard: TRACER --- onSnapshot: Seed transactions committed for UserID:", currentUserId, ". Waiting for next snapshot.");
                  } catch (commitError: any) {
                    console.error("Dashboard: TRACER --- onSnapshot: Error seeding transactions for UserID:", currentUserId, commitError);
                    if (effectMountedRef.current) {
                      toast({
                        title: translate({ en: "Seeding Error", pt: "Erro ao Popular Dados" }),
                        description: translate({
                          en: "Could not seed initial transactions. Please try refreshing.",
                          pt: "Não foi possível popular as transações iniciais. Por favor, atualize a página."
                        }) + (commitError.message ? ` (${commitError.message})` : ''),
                        variant: "destructive",
                      });
                      setTransactions([]);
                      if(isLoadingTransactions) setIsLoadingTransactions(false);
                      console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (seed commit error) for UserID:", currentUserId);
                    }
                  }
                } else {
                  console.log("Dashboard: TRACER --- onSnapshot: Transactions collection empty for UserID:", currentUserId, ", but already marked as seeded.");
                  if (effectMountedRef.current) {
                    setTransactions([]);
                    if(isLoadingTransactions) setIsLoadingTransactions(false);
                    console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (empty but seeded) for UserID:", currentUserId);
                  }
                }
              } catch (docError: any) {
                 console.error("Dashboard: TRACER --- onSnapshot: Error fetching transaction seed status for UserID:", currentUserId, docError);
                 if (effectMountedRef.current) {
                   toast({
                      title: translate({ en: "Connection Error", pt: "Erro de Conexão" }),
                      description: translate({ en: "Could not verify transaction status.", pt: "Não foi possível verificar o status das transações."}) + (docError.message ? ` (${docError.message})` : ''),
                      variant: "destructive",
                    });
                    setTransactions([]);
                    if(isLoadingTransactions) setIsLoadingTransactions(false);
                    console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (seed status fetch error) for UserID:", currentUserId);
                 }
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
            if(isLoadingTransactions) setIsLoadingTransactions(false);
            console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (main catch block) for UserID:", currentUserId);
          }
        }
      };

      fetchDataInternal(userId);

    } else {
      console.log(`Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: ${userId}. isLoadingTransactions: ${isLoadingTransactions}. Snapshot ref present: ${!!unsubscribeSnapshotRef.current}`);
    }

    return fullCleanup;

  }, [userId, authLoading, isClient, router, translate, toast]);


  const transactionsThisMonth = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    return transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.getFullYear() === currentYear && transactionDate.getMonth() === currentMonth;
    });
  }, [transactions]);

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
          transactionsThisMonth={transactionsThisMonth}
          monthlyBudget={MONTHLY_BUDGET}
          currentMonthName={currentMonthName}
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
            <CardTitle>{translate({ en: "Spending by Category", pt: "Gastos por Categoria" })}</CardTitle>
            <CardDescription>{translate({ en: "Current month's spending distribution.", pt: "Distribuição de gastos do mês atual." })}</CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsThisMonth.filter(t => t.type === 'expense').length > 0 ? (
              <ExpenseCategoryChart transactions={transactionsThisMonth} />
            ) : (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-muted-foreground">
                  {translate({
                    en: "No expense data for this month to display chart.",
                    pt: "Sem dados de despesa para este mês para exibir o gráfico."
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
