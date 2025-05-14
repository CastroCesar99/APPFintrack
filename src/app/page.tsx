
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
  
  const effectMountedRef = useRef(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);
  const userId = user?.uid;

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (language && isClient) { // Ensure isClient is true before using language for client-side date formatting
      const date = new Date();
      const month = date.toLocaleString(language === 'pt' ? 'pt-BR' : 'en-US', { month: 'long' });
      setCurrentMonthName(month.charAt(0).toUpperCase() + month.slice(1));
      console.log("Dashboard: TRACER --- currentMonthName set to", month.charAt(0).toUpperCase() + month.slice(1));
    }
  }, [language, isClient]);


  // Main data fetching and subscription effect
  useEffect(() => {
    effectMountedRef.current = true;
    console.log("Dashboard: TRACER --- Main useEffect running. UserID:", userId, "AuthLoading:", authLoading, "isClient:", isClient, "InitiatedFor:", mainFetchInitiatedForUser.current);

    const cleanupListener = () => {
      if (unsubscribeSnapshotRef.current) {
        console.log("Dashboard: TRACER --- useEffect Cleanup: Unsubscribing snapshot listener for UserID:", mainFetchInitiatedForUser.current);
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }
    };

    if (authLoading) {
      console.log("Dashboard: TRACER --- Auth is loading, waiting...");
      // setIsLoadingTransactions(true); // Already initially true, or handled by main loading screen logic
      return; // Wait for auth to resolve; cleanup will run if deps change before resolution
    }

    if (!userId && isClient) { // User is definitively logged out (and client is hydrated)
      console.log("Dashboard: TRACER --- No user ID. Cleaning up listener and stopping loading.");
      cleanupListener();
      setIsLoadingTransactions(false);
      mainFetchInitiatedForUser.current = null; // Reset fetch initiator state
      router.push('/login'); // Redirect to login if no user
      return;
    }
    
    // Async function to perform the actual data fetching and subscription setup
    const fetchDataInternal = async (currentUserId: string) => {
      if (!effectMountedRef.current) {
          console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early.");
          return;
      }
      console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

      try {
        const userDocRef = doc(db, "users", currentUserId);
        const userDocSnap = await getDoc(userDocRef);

        if (!effectMountedRef.current) {
          console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted while fetching user doc.");
          return;
        }

        if (!userDocSnap.exists()) {
          console.warn("Dashboard: TRACER --- fetchDataInternal: User document not found. Redirecting to signup.");
          if (effectMountedRef.current) {
            router.push('/signup');
            setIsLoadingTransactions(false);
          }
          return;
        }

        if (!userDocSnap.data().onboardingComplete) {
          console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding not complete. Redirecting to onboarding.");
          if (effectMountedRef.current) {
            router.push('/onboarding');
            setIsLoadingTransactions(false);
          }
          return;
        }

        console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding complete. Setting up onSnapshot listener.");
        const transactionsColRef = collection(db, `users/${currentUserId}/transactions`);
        const q_transactions = query(transactionsColRef, orderBy("date", "desc"));
        
        // Explicitly clean up any existing listener before attaching a new one
        // This is important if the effect re-runs for the same user due to other dep changes (though less likely now)
        if (unsubscribeSnapshotRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Stale snapshot listener found, unsubscribing before new setup.");
            unsubscribeSnapshotRef.current();
            unsubscribeSnapshotRef.current = null;
        }

        unsubscribeSnapshotRef.current = onSnapshot(q_transactions, async (querySnapshot) => {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- onSnapshot: Effect unmounted. Skipping state update.");
            return;
          }
          console.log("Dashboard: TRACER --- onSnapshot: Received data. Empty:", querySnapshot.empty, "PendingWrites:", querySnapshot.metadata.hasPendingWrites);

          if (querySnapshot.empty && !querySnapshot.metadata.hasPendingWrites) {
            const userTransactionsStatusRef = doc(db, `users/${currentUserId}/status`, "transactions");
            let statusSnap;
            try {
              statusSnap = await getDoc(userTransactionsStatusRef);
              if (!effectMountedRef.current) return;

              if (!statusSnap.exists() || !statusSnap.data().seeded) {
                console.log("Dashboard: TRACER --- onSnapshot: Transactions not seeded. Seeding now.");
                const batch = writeBatch(db);
                seedTransactions.forEach(txData => {
                  const id = uuidv4();
                  const docRef = doc(db, `users/${currentUserId}/transactions`, id);
                  batch.set(docRef, { ...txData, id, userId: currentUserId, createdAt: serverTimestamp() });
                });
                batch.set(userTransactionsStatusRef, { seeded: true, seededAt: serverTimestamp() });
                
                try {
                  await batch.commit();
                  console.log("Dashboard: TRACER --- onSnapshot: Seed transactions committed. Waiting for next snapshot.");
                  // DO NOT set isLoadingTransactions(false) here. Let the next snapshot trigger handle it.
                } catch (commitError: any) {
                  console.error("Dashboard: TRACER --- onSnapshot: Error seeding transactions:", commitError);
                  if (effectMountedRef.current) {
                    toast({
                      title: translate({ en: "Seeding Error", pt: "Erro ao Popular Dados" }),
                      description: translate({
                        en: "Could not seed initial transactions. Please try refreshing.",
                        pt: "Não foi possível popular as transações iniciais. Por favor, atualize a página."
                      }) + (commitError.message ? ` (${commitError.message})` : ''),
                      variant: "destructive",
                    });
                    setTransactions([]); // Ensure UI reflects empty state on error
                    setIsLoadingTransactions(false);
                    console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot seed commit error.");
                  }
                }
              } else {
                console.log("Dashboard: TRACER --- onSnapshot: Transactions collection empty, but already marked as seeded.");
                if (effectMountedRef.current) {
                  setTransactions([]);
                  setIsLoadingTransactions(false);
                  console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot empty but seeded.");
                }
              }
            } catch (docError: any) {
               console.error("Dashboard: TRACER --- onSnapshot: Error fetching transaction seed status:", docError);
               if (effectMountedRef.current) {
                 toast({
                    title: translate({ en: "Connection Error", pt: "Erro de Conexão" }),
                    description: translate({ en: "Could not verify transaction status.", pt: "Não foi possível verificar o status das transações."}) + (docError.message ? ` (${docError.message})` : ''),
                    variant: "destructive",
                  });
                  setTransactions([]);
                  setIsLoadingTransactions(false);
                  console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot seed status fetch error.");
               }
            }
          } else { // Snapshot has data or pending writes
            const fetchedTransactions = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Transaction));
            if (effectMountedRef.current) {
              console.log(`Dashboard: TRACER --- onSnapshot: Setting ${fetchedTransactions.length} transactions.`);
              setTransactions(fetchedTransactions);
              setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) after processing snapshot data.");
            }
          }
        }, (error: any) => {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- onSnapshot error callback: Effect unmounted.");
            return;
          }
          console.error("Dashboard: TRACER --- onSnapshot: Error listening to transactions snapshot:", error);
          if (effectMountedRef.current) {
            toast({
              title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }),
              description: translate({
                en: "Could not fetch transactions. Please check your connection.",
                pt: "Não foi possível buscar as transações. Verifique sua conexão."
              }) + (error.message ? ` (${error.message})` : ''),
              variant: "destructive",
            });
            setIsLoadingTransactions(false);
            console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot error callback.");
          }
        });

      } catch (error: any) {
        if (!effectMountedRef.current) {
          console.log("Dashboard: TRACER --- fetchDataInternal: Main try-catch, effect unmounted.");
          return;
        }
        console.error("Dashboard: TRACER --- fetchDataInternal: Error in main data fetching logic:", error);
        if (effectMountedRef.current) {
          toast({
            title: translate({ en: "Error", pt: "Erro" }),
            description: translate({ en: "Could not load dashboard data.", pt: "Não foi possível carregar dados do painel." }) + (error.message ? ` (${error.message})` : ''),
            variant: "destructive",
          });
          setIsLoadingTransactions(false);
          console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal main catch block.");
        }
      }
    };

    // Main logic gate for fetching
    if (userId && isClient && !authLoading) {
      if (mainFetchInitiatedForUser.current !== userId) {
        console.log("Dashboard: TRACER --- Conditions met for new fetch. Current UserID:", userId, "Previously initiated for:", mainFetchInitiatedForUser.current);
        cleanupListener(); // Clean up any old listener first
        
        if(effectMountedRef.current) setIsLoadingTransactions(true); // Set loading true *before* starting async fetch
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) before calling fetchDataInternal for user:", userId);
        
        mainFetchInitiatedForUser.current = userId; // Mark that fetch is being initiated for THIS user
        fetchDataInternal(userId);
      } else {
        console.log("Dashboard: TRACER --- Fetch already initiated for user:", userId, ". Snapshot listener should be handling updates.");
        // If fetch was already initiated, we assume the snapshot listener is active.
        // If isLoadingTransactions is still true here, it means the initial snapshot hasn't resolved yet.
        // If it's false, data has loaded. No action needed in this path for setIsLoadingTransactions.
      }
    } else {
      console.log("Dashboard: TRACER --- Main useEffect: Conditions for data fetch NOT met. userId:", userId, "isClient:", isClient, "authLoading:", authLoading);
      // If auth is not loading, isClient is true, but there's no userId, it means user is logged out.
      // This case is handled by the early return for !userId.
      // If isClient is false, it's server render/pre-hydration, no client-side fetch yet.
      // If authLoading is true, we're waiting.
      // This else branch might not need to do anything with setIsLoadingTransactions if other paths cover it.
    }

    return () => {
      console.log("Dashboard: TRACER --- Main useEffect CLEANUP (outer). Current UserID for potential cleanup:", mainFetchInitiatedForUser.current);
      effectMountedRef.current = false;
      cleanupListener(); // This will run when dependencies change or component unmounts.
      // Do not reset mainFetchInitiatedForUser.current here,
      // as the effect might re-run for a minor dep change for the *same user*.
      // It's reset when userId becomes null or changes.
    };
  }, [userId, authLoading, isClient]); // Removed router and toast

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
  console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions:", transactions.length);


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

    