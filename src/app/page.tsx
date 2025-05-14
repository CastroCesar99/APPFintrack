
"use client";
import type React from 'react';
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

  const userId = user?.uid;

  useEffect(() => {
    // console.log("Dashboard: isClient useEffect running");
    setIsClient(true);
    if (language) {
      const date = new Date();
      const month = date.toLocaleString(language === 'pt' ? 'pt-BR' : 'en-US', { month: 'long' });
      setCurrentMonthName(month.charAt(0).toUpperCase() + month.slice(1));
      // console.log("Dashboard: currentMonthName set to", month.charAt(0).toUpperCase() + month.slice(1));
    }
  }, [language]);

  useEffect(() => {
    let isEffectMounted = true;
    let unsubscribeFromSnapshot: (() => void) | undefined;
    console.log("Dashboard: Main data fetching useEffect TRACER --- Start. AuthLoading:", authLoading, "UserId:", userId, "isLoadingTransactions:", isLoadingTransactions);


    const fetchData = async () => {
      if (!isEffectMounted) {
        console.log("Dashboard: TRACER --- fetchData aborted, effect unmounted early.");
        return;
      }

      if (authLoading) {
        console.log("Dashboard: TRACER --- Auth is loading. Waiting...");
        // No need to set isLoadingTransactions(true) here; main loading div handles it.
        return;
      }

      if (!userId) {
        console.log("Dashboard: TRACER --- No user ID after auth. Redirecting to login.");
        router.push('/login');
        if (isEffectMounted) {
            console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (no userId).");
            setIsLoadingTransactions(false);
        }
        return;
      }
      
      console.log("Dashboard: TRACER --- Auth resolved, user ID available. Setting isLoadingTransactions to TRUE to fetch user data.");
      // This is the primary point to set loading for user-specific data
      if (isEffectMounted) setIsLoadingTransactions(true);

      try {
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);

        if (!isEffectMounted) {
          console.log("Dashboard: TRACER --- fetchData aborted, effect unmounted while fetching user doc.");
          return;
        }

        if (!userDocSnap.exists()) {
          console.warn("Dashboard: TRACER --- User document not found. Redirecting to signup.");
          router.push('/signup');
          if (isEffectMounted) {
            console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (user doc not found).");
            setIsLoadingTransactions(false);
          }
          return;
        }

        if (!userDocSnap.data().onboardingComplete) {
          console.log("Dashboard: TRACER --- User onboarding not complete. Redirecting to onboarding.");
          router.push('/onboarding');
          if (isEffectMounted) {
            console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (onboarding not complete).");
            setIsLoadingTransactions(false);
          }
          return;
        }
        
        console.log("Dashboard: TRACER --- User onboarding complete. Setting up onSnapshot listener for transactions.");
        const transactionsColRef = collection(db, `users/${userId}/transactions`);
        const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

        unsubscribeFromSnapshot = onSnapshot(q_transactions, async (querySnapshot) => {
          if (!isEffectMounted) {
            console.log("Dashboard: TRACER --- onSnapshot fired but effect is unmounted.");
            return;
          }
          console.log(`Dashboard: TRACER --- Transactions snapshot received. Empty: ${querySnapshot.empty}, PendingWrites: ${querySnapshot.metadata.hasPendingWrites}`);

          if (querySnapshot.empty && !querySnapshot.metadata.hasPendingWrites) {
            console.log("Dashboard: TRACER --- Transactions snapshot is empty and no pending writes. Checking seed status.");
            const userTransactionsStatusRef = doc(db, `users/${userId}/status`, "transactions");
            let statusSnap;
            try {
              statusSnap = await getDoc(userTransactionsStatusRef);
            } catch (docError) {
               console.error("Dashboard: TRACER --- Error fetching transaction status doc:", docError);
               if (isEffectMounted) {
                 toast({
                    title: translate({ en: "Connection Error", pt: "Erro de Conexão" }),
                    description: translate({ en: "Could not verify transaction status. Please check connection.", pt: "Não foi possível verificar o status das transações. Verifique a conexão."}),
                    variant: "destructive",
                  });
                  setTransactions([]); 
                  console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (error fetching transaction status).");
                  setIsLoadingTransactions(false);
               }
               return;
            }
            
            if (!isEffectMounted) {
              console.log("Dashboard: TRACER --- onSnapshot aborted, effect unmounted while checking seed status.");
              return;
            }

            if (!statusSnap.exists() || !statusSnap.data().seeded) {
              console.log("Dashboard: TRACER --- Transactions not seeded. Seeding now.");
              const batch = writeBatch(db);
              seedTransactions.forEach(txData => {
                const id = uuidv4();
                const docRef = doc(db, `users/${userId}/transactions`, id);
                batch.set(docRef, { ...txData, id, userId: userId, createdAt: serverTimestamp() });
              });
              batch.set(userTransactionsStatusRef, { seeded: true, seededAt: serverTimestamp() });
              try {
                await batch.commit();
                console.log("Dashboard: TRACER --- Seed transactions committed. Waiting for onSnapshot to reflect changes (isLoadingTransactions remains true).");
                // We intentionally DO NOT set isLoadingTransactions(false) here.
                // The onSnapshot listener will fire again with the new data.
              } catch (commitError) {
                console.error("Dashboard: TRACER --- Error seeding transactions:", commitError);
                if (isEffectMounted) {
                  toast({
                    title: translate({ en: "Seeding Error", pt: "Erro ao Popular Dados" }),
                    description: translate({
                      en: "Could not seed initial transactions. Please try refreshing.",
                      pt: "Não foi possível popular as transações iniciais. Por favor, atualize a página."
                    }),
                    variant: "destructive",
                  });
                  setTransactions([]);
                  console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (error seeding transactions).");
                  setIsLoadingTransactions(false);
                }
              }
            } else {
              console.log("Dashboard: TRACER --- Transactions collection is empty, but already marked as seeded.");
              if (isEffectMounted) {
                setTransactions([]);
                console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (confirmed empty and seeded).");
                setIsLoadingTransactions(false);
              }
            }
          } else { 
            console.log(`Dashboard: TRACER --- Processing ${querySnapshot.docs.length} transactions. Has pending writes: ${querySnapshot.metadata.hasPendingWrites}.`);
            const fetchedTransactions = querySnapshot.docs.map(docSnap => ({
              id: docSnap.id,
              ...docSnap.data(),
            } as Transaction));
            if (isEffectMounted) {
              setTransactions(fetchedTransactions);
              console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (data processed from snapshot).");
              setIsLoadingTransactions(false);
            }
          }
        }, (error) => { 
          if (!isEffectMounted) {
            console.log("Dashboard: TRACER --- onSnapshot error callback, but effect unmounted.");
            return;
          }
          console.error("Dashboard: TRACER --- Error listening to transactions snapshot:", error);
          if (isEffectMounted) {
            toast({
              title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }),
              description: translate({
                en: "Could not fetch transactions. Please check your connection.",
                pt: "Não foi possível buscar as transações. Verifique sua conexão."
              }),
              variant: "destructive",
            });
            console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (snapshot listener error).");
            setIsLoadingTransactions(false);
          }
        });

      } catch (error) {
        if (!isEffectMounted) {
          console.log("Dashboard: TRACER --- Main fetchData try-catch, but effect unmounted.");
          return;
        }
        console.error("Dashboard: TRACER --- Error in main data fetching logic (outer try-catch):", error);
        if (isEffectMounted) {
          toast({
            title: translate({ en: "Error", pt: "Erro" }),
            description: translate({ en: "Could not load dashboard data. Please check connection.", pt: "Não foi possível carregar dados do painel. Verifique sua conexão." }),
            variant: "destructive",
          });
          console.log("Dashboard: TRACER --- Setting isLoadingTransactions to FALSE (main fetch logic error).");
          setIsLoadingTransactions(false);
        }
      }
    };

    fetchData();

    return () => {
      console.log("Dashboard: TRACER --- Main data fetching useEffect CLEANUP. Unsubscribing from snapshot if active.");
      isEffectMounted = false;
      if (unsubscribeFromSnapshot) {
        unsubscribeFromSnapshot();
      }
    };
  // Removed translate and language from dependencies to test stability
  }, [userId, authLoading, router, toast]); 

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
    // console.log("Dashboard: TRACER --- RENDERING LOADING SCREEN. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions);
    return (
        <div className="flex items-center justify-center h-screen w-full bg-background">
          <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..."})}</p>
        </div>
    );
  }
  // console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT.");


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

