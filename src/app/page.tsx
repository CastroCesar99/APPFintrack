
"use client";
import type React from 'react';
import { useState, useEffect, useMemo } from "react"; // Added useMemo
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


  useEffect(() => {
    setIsClient(true);
    if (language) {
      const date = new Date();
      const month = date.toLocaleString(language === 'pt' ? 'pt-BR' : 'en-US', { month: 'long' });
      setCurrentMonthName(month.charAt(0).toUpperCase() + month.slice(1));
    }
  }, [language]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      router.push('/login');
      return;
    }

    setIsLoadingTransactions(true);

    const checkOnboardingAndFetchTransactions = async () => {
      try {
        if (!user) {
            setIsLoadingTransactions(false);
            router.push('/login'); 
            return;
        }

        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          console.warn("User document not found for UID:", user.uid, "Redirecting to signup.");
          router.push('/signup');
          setIsLoadingTransactions(false);
          return;
        }

        if (!userDocSnap.data().onboardingComplete) {
          router.push('/onboarding');
          setIsLoadingTransactions(false);
          return;
        }

        const transactionsColRef = collection(db, `users/${user.uid}/transactions`);
        const q = query(transactionsColRef, orderBy("date", "desc"));

        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
          if (querySnapshot.empty && querySnapshot.metadata.hasPendingWrites === false) {
            const userTransactionsStatusRef = doc(db, `users/${user.uid}/status`, "transactions");
            const statusSnap = await getDoc(userTransactionsStatusRef);

            if (!statusSnap.exists() || !statusSnap.data().seeded) {
              const batch = writeBatch(db);
              const seededTxs: Transaction[] = [];
              seedTransactions.forEach(txData => {
                const id = uuidv4();
                const docRef = doc(db, `users/${user.uid}/transactions`, id);
                batch.set(docRef, { ...txData, id, userId: user.uid, createdAt: serverTimestamp() });
                seededTxs.push({ ...txData, id });
              });
              batch.set(userTransactionsStatusRef, { seeded: true, seededAt: serverTimestamp() });
              try {
                await batch.commit();
                setTransactions(seededTxs);
              } catch (commitError) {
                 console.error("Error seeding transactions:", commitError);
                 toast({
                    title: translate({ en: "Seeding Error", pt: "Erro ao Popular Dados" }),
                    description: translate({
                      en: "Could not seed initial transactions. Please try refreshing.",
                      pt: "Não foi possível popular as transações iniciais. Por favor, atualize a página."
                    }),
                    variant: "destructive",
                  });
              }
            } else {
               setTransactions([]);
            }
          } else {
            const fetchedTransactions = querySnapshot.docs.map(docSnap => ({
              id: docSnap.id,
              ...docSnap.data(),
            } as Transaction));
            setTransactions(fetchedTransactions);
          }
          setIsLoadingTransactions(false);
        }, (error) => {
          console.error("Error fetching transactions:", error);
          toast({
            title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }),
            description: translate({
              en: "Could not fetch transactions. Please check your connection and ensure you are online.",
              pt: "Não foi possível buscar as transações. Verifique sua conexão e se está online."
            }),
            variant: "destructive",
          });
          setIsLoadingTransactions(false);
        });
        return () => unsubscribe();

      } catch (error) {
        console.error("Error in checkOnboardingAndFetchTransactions:", error);
        toast({
          title: translate({ en: "Error", pt: "Erro" }),
          description: translate({ en: "Could not load dashboard data. Please check your connection and try again.", pt: "Não foi possível carregar os dados do painel. Verifique sua conexão e tente novamente." }),
          variant: "destructive",
        });
        setIsLoadingTransactions(false); 
      }
    };

    let unsubscribeFromTransactions: (() => void) | undefined;
    const manageTransactions = async () => {
        unsubscribeFromTransactions = await checkOnboardingAndFetchTransactions();
    }
    manageTransactions();


    return () => {
      if (unsubscribeFromTransactions) {
        unsubscribeFromTransactions();
      }
    };
  }, [user, authLoading, router, toast, translate, language]);

  const transactionsThisMonth = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    return transactions.filter(t => {
      const transactionDate = new Date(t.date); // Assuming t.date is 'YYYY-MM-DD'
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
    return (
        <div className="flex items-center justify-center h-screen w-full bg-background">
          <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..."})}</p>
        </div>
    );
  }


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
