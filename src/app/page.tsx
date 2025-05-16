
'use client';
import React, { useRef } from 'react';
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction, CategoryName, DisplayCategory, UserPreferences } from "@/types";
import { CATEGORIES, getCategoryLabel } from "@/types";
import { useLanguage } from '@/context/language-context';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { useDateNavigation } from '@/context/date-navigation-context';
import { format as formatDateFns, parse as parseDateFns, getYear as getYearFns, getMonth as getMonthFns, parseISO as parseISODateFns } from 'date-fns'; // Added parseISODateFns
import { v4 as uuidv4 } from 'uuid';


export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { translate, language } = useLanguage();
  const { toast } = useToast();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [loadedBudgetsForMonth, setLoadedBudgetsForMonth] = useState<Record<string, number> | null>(null);

  const effectMountedRef = useRef(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  const userId = user?.uid;

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

  const loadBudgets = useCallback(async () => {
    if (!userId || !isClient) {
        setLoadedBudgetsForMonth(null);
        return;
    }
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log('Dashboard: TRACER --- Loading budgets for user ' + userId + ', month: ' + budgetMonthKey);
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, number>;
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        setLoadedBudgetsForMonth(validBudgets);
        console.log('Dashboard: TRACER --- Budgets loaded for ' + budgetMonthKey + ':', validBudgets);
      } else {
        setLoadedBudgetsForMonth({});
        console.log('Dashboard: TRACER --- No budget document found for ' + budgetMonthKey + '.');
      }
    } catch (error) {
      console.error("Dashboard: TRACER --- Error loading budgets:", error);
      setLoadedBudgetsForMonth({}); // Set to empty object on error to prevent breaking calculations
      toast({
        title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }),
        description: translate({ en: "Could not load your budgets for the summary.", pt: "Não foi possível carregar seus orçamentos para o resumo." }),
        variant: "destructive",
      });
    }
  }, [userId, displayedDate, isClient, toast, translate]);


  useEffect(() => {
    effectMountedRef.current = true;
    console.log("Dashboard: TRACER --- Main useEffect START. UserID: " + userId + ", AuthLoading: " + authLoading + ", isClient: " + isClient + ", InitiatedFor: " + mainFetchInitiatedForUser.current + ", isLoadingTransactions: " + isLoadingTransactions);

    const cleanupListener = () => {
      if (unsubscribeSnapshotRef.current && typeof unsubscribeSnapshotRef.current === 'function') {
        console.log("Dashboard: TRACER --- cleanupListener: Unsubscribing snapshot for UserID:", mainFetchInitiatedForUser.current);
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      } else {
        // console.log("Dashboard: TRACER --- cleanupListener: No snapshot to unsubscribe or ref is not a function for UserID:", mainFetchInitiatedForUser.current);
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
      // No need to set isLoadingTransactions(true) here as the main loading screen handles authLoading
      return fullCleanup;
    }

    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      cleanupListener();
      if (effectMountedRef.current) {
        setTransactions([]);
        if (isLoadingTransactions) setIsLoadingTransactions(false); // Ensure loading stops if it was on
      }
      mainFetchInitiatedForUser.current = null;
      if (effectMountedRef.current) router.push('/login');
      return fullCleanup;
    }

    const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
          console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early for UserID:", currentUserId);
          if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
          return;
        }
        console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

        if (effectMountedRef.current && !isLoadingTransactions) {
             console.log("Dashboard: TRACER --- fetchDataInternal: Ensuring isLoadingTransactions is true for new fetch of user:", currentUserId);
             setIsLoadingTransactions(true);
        }

        try {
          const userDocRef = doc(db, "users", currentUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted while fetching user doc for UserID:", currentUserId);
            if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
            return;
          }

          if (!userDocSnap.exists()) {
            console.warn("Dashboard: TRACER --- fetchDataInternal: User document NOT FOUND for UserID:", currentUserId, ". Redirecting to onboarding.");
            if (effectMountedRef.current) {
              if (isLoadingTransactions) setIsLoadingTransactions(false);
              router.push('/onboarding');
            }
            return;
          }

          if (!userDocSnap.data().onboardingComplete) {
            console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding NOT complete for UserID:", currentUserId, ". Redirecting to onboarding.");
            if (effectMountedRef.current) {
              if (isLoadingTransactions) setIsLoadingTransactions(false);
              router.push('/onboarding');
            }
            return;
          }

          console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener.");
          const transactionsColRef = collection(db, 'users/' + currentUserId + '/transactions');
          const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

          if (unsubscribeSnapshotRef.current && typeof unsubscribeSnapshotRef.current === 'function') {
            console.warn("Dashboard: TRACER --- fetchDataInternal: Stale snapshot ref found before new onSnapshot. Cleaning up again.");
            unsubscribeSnapshotRef.current();
            unsubscribeSnapshotRef.current = null;
          }

          unsubscribeSnapshotRef.current = onSnapshot(q_transactions, (querySnapshot) => {
            if (!effectMountedRef.current) {
              console.log("Dashboard: TRACER --- onSnapshot: Effect unmounted for UserID:", currentUserId, ". Skipping state update.");
              return;
            }
            console.log("Dashboard: TRACER --- onSnapshot: Received data for UserID: " + currentUserId + ". Empty: " + querySnapshot.empty + ", PendingWrites: " + querySnapshot.metadata.hasPendingWrites);

            const fetchedTransactions = querySnapshot.docs.map(docSnap => {
              const data = docSnap.data();
              let dateString = data.date;

              if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
                dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
              } else if (typeof data.date === 'string' && data.date.includes('T')) { // Handle ISO 8601 datetime strings
                try {
                  dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
                } catch (e) {
                  console.warn("Dashboard: TRACER --- Failed to parse existing ISO datetime string to yyyy-MM-dd: " + data.date, e);
                  dateString = formatDateFns(new Date(), "yyyy-MM-dd"); // Fallback
                }
              } else if (typeof data.date !== 'string' || (typeof data.date === 'string' && !/^\\d{4}-\\d{2}-\\d{2}$/.test(data.date))) {
                 console.warn("Dashboard: TRACER --- Transaction has unexpected date format, or not YYYY-MM-DD. Fallback to current date YYYY-MM-DD. Date was:", data.date);
                 dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }

              return {
                ...data,
                id: docSnap.id,
                date: dateString,
              } as Transaction;
            });

            if (effectMountedRef.current) {
              console.log("Dashboard: TRACER --- onSnapshot: Setting " + fetchedTransactions.length + " transactions for UserID: " + currentUserId + ".");
              setTransactions(fetchedTransactions);
              if (isLoadingTransactions) {
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
                }) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''),
                variant: "destructive",
              });
              setTransactions([]); // Clear transactions on error
              if (isLoadingTransactions) {
                setIsLoadingTransactions(false);
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (error callback) for UserID:", currentUserId);
              }
            }
          });

        } catch (error: any) {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Main try-catch, effect unmounted for UserID:", currentUserId);
            if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
            return;
          }
          console.error("Dashboard: TRACER --- fetchDataInternal: Error in main data fetching logic for UserID:", currentUserId, error);
          if (effectMountedRef.current) {
            toast({
              title: translate({ en: "Error", pt: "Erro" }),
              description: translate({ en: "Could not load dashboard data.", pt: "Não foi possível carregar dados do painel." }) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''),
              variant: "destructive",
            });
            setTransactions([]);
            if (isLoadingTransactions) {
              setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (main catch block) for UserID:", currentUserId);
            }
          }
        }
      };

    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log("Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: " + userId + ". PrevInitiatedFor: " + mainFetchInitiatedForUser.current + ". ListenerExisted: " + (!!unsubscribeSnapshotRef.current));
      cleanupListener(); // Clean up any existing listener before starting a new one
      if (effectMountedRef.current) {
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
        setIsLoadingTransactions(true); // Set loading true *before* starting async fetch
      }
      mainFetchInitiatedForUser.current = userId;
      fetchDataInternal(userId);
    } else {
      console.log("Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: " + userId + ". isLoadingTransactions: " + isLoadingTransactions + ". Snapshot ref present: " + (!!unsubscribeSnapshotRef.current));
      // If listener is already active and we are still in loading state (which shouldn't happen often here)
      // or if not loading, data is presumably up-to-date from snapshot.
      if (isLoadingTransactions && effectMountedRef.current && transactions.length >= 0 && unsubscribeSnapshotRef.current) {
        // Still loading from initial snapshot, let onSnapshot handle setting to false
      } else if (isLoadingTransactions && effectMountedRef.current) {
        // This case means we might have missed setting loading to false somewhere.
        // However, the primary place is within onSnapshot or error handlers.
        // For safety, if somehow still loading and no active listener setup, set to false
        // but this ideally shouldn't be hit if logic above is sound.
      }
    }
    return fullCleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authLoading, isClient]);


 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => {
    if (!userId) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }),
        variant: "destructive",
      });
      return;
    }
    
    console.log("Dashboard: TRACER --- onAddTransaction: Received date from form:", newTransactionData.date);

    const fullPayload = {
      ...newTransactionData,
      userId: userId,
      createdAt: serverTimestamp(),
    };

    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string }>;

    // Ensure isRecurring is explicitly false if undefined after filtering and newTransactionData had it as boolean
    if (dataToSave.isRecurring === undefined && typeof newTransactionData.isRecurring === 'boolean') {
        dataToSave.isRecurring = newTransactionData.isRecurring;
    } else if (dataToSave.isRecurring === undefined) {
       dataToSave.isRecurring = false; // Default to false if not provided at all
    }


    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "Full dataToSave:", dataToSave);

    try {
      const transactionsColRef = collection(db, 'users/' + userId + '/transactions');
      await addDoc(transactionsColRef, dataToSave);

      toast({
        title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }),
        description: "" + newTransactionData.description + " " + translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." }),
      });
    } catch (error: any) {
      console.error("DashboardPage: Error adding transaction to Firestore:", error);
      toast({
        title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }),
        description: (error.message || translate({ en: "Could not add transaction.", pt: "Não foi possível adicionar a transação." })) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''),
        variant: "destructive",
      });
    }
  }, [userId, toast, translate]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); // 0-indexed

    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Filtering for Year: " + targetYear + ", Month: " + targetMonth + " (0-indexed for " + displayedMonthYearLabel + ")");

    const filtered = transactions.filter(t => {
      if (!t.date || typeof t.date !== 'string' || t.date.length !== 10) { // Expect YYYY-MM-DD
        console.warn("Dashboard: TRACER --- Tx Filter: ID: " + t.id + ", Invalid date format or missing: " + t.date + ", Skipping.");
        return false;
      }
      try {
        // Date string is YYYY-MM-DD
        const transactionYear = parseInt(t.date.substring(0, 4), 10);
        const transactionMonth = parseInt(t.date.substring(5, 7), 10) - 1; // 0-indexed

        const matches = transactionYear === targetYear && transactionMonth === targetMonth;
        // console.log(\`Dashboard: TRACER --- Tx Filter: ID: \${t.id}, DateStr: \${t.date}, TxY: \${transactionYear}, TxM: \${transactionMonth}, Matches: \${matches}, isRec: \${t.isRecurring}\`);
        return matches;
      } catch (e) {
        console.warn("Dashboard: TRACER --- Tx Filter: ID: " + t.id + ", Error parsing date " + t.date + ": ", e);
        return false;
      }
    });
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Found " + filtered.length + " transactions for the period.");
    return filtered;
  }, [transactions, displayedDate, displayedMonthYearLabel]); // displayedMonthYearLabel is fine here as it changes with displayedDate


  const recentIncome = useMemo(() => {
    return transactions
      .filter(t => t.type === 'income')
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime())
      .slice(0, 5);
  }, [transactions]);

  const recentExpenses = useMemo(() => {
    return transactions
      .filter(t => t.type === 'expense')
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime())
      .slice(0, 5);
  }, [transactions]);

  const largestExpenseCategoryForDisplayedPeriod = useMemo(() => {
    const expensesThisPeriod = transactionsForDisplayedPeriod.filter(t => t.type === 'expense');
    if (expensesThisPeriod.length === 0) {
      return null;
    }

    const expensesByCategory: Record<string, number> = {};
    for (const transaction of expensesThisPeriod) {
      expensesByCategory[transaction.category as string] = (expensesByCategory[transaction.category as string] || 0) + transaction.amount;
    }

    let maxAmount = 0;
    let largestCategoryKey: string | null = null;

    for (const categoryKey in expensesByCategory) {
       if (Object.prototype.hasOwnProperty.call(expensesByCategory, categoryKey)) {
        if (expensesByCategory[categoryKey] > maxAmount) {
          maxAmount = expensesByCategory[categoryKey];
          largestCategoryKey = categoryKey;
        }
      }
    }

    if (largestCategoryKey) {
      const predefinedCategory = CATEGORIES.find(cat => cat.name === largestCategoryKey);
      if (predefinedCategory) {
        return {
          name: largestCategoryKey as CategoryName,
          amount: maxAmount,
          icon: predefinedCategory.icon,
          label: predefinedCategory.label,
          type: 'expense'
        } as DisplayCategory & { amount: number };
      } else {
        return {
          name: largestCategoryKey,
          amount: maxAmount,
          icon: 'CircleHelp', // Default for custom
          label: { en: largestCategoryKey, pt: largestCategoryKey },
          type: 'expense',
        } as DisplayCategory & { amount: number };
      }
    }
    return null;
  }, [transactionsForDisplayedPeriod, language]);

  const totalFixedExpensesForDisplayedPeriod = useMemo(() => {
    return transactionsForDisplayedPeriod
      .filter(t => t.type === 'expense' && t.expenseNature === 'fixed')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalVariableExpensesForDisplayedPeriod = useMemo(() => {
    return transactionsForDisplayedPeriod
      .filter(t => t.type === 'expense' && t.expenseNature === 'variable')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalCalculatedMonthlyBudget = useMemo(() => {
    if (!loadedBudgetsForMonth) return 0;
    return Object.values(loadedBudgetsForMonth).reduce((sum, budget) => sum + (budget || 0), 0);
  }, [loadedBudgetsForMonth]);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]); // loadBudgets is wrapped in useCallback


  console.log("DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection:", displayedDate.toISOString());


  if (!isClient || authLoading || isLoadingTransactions) {
    console.log("Dashboard: TRACER --- RENDERING LOADING SCREEN. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions);
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full">
          <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..." })}</p>
        </div>
      </AppLayout>
    );
  }
  console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions: " + transactions.length + " isLoadingTransactions: " + isLoadingTransactions + " Displayed Period Transactions: " + transactionsForDisplayedPeriod.length);


  return (
    <AppLayout>
      <div className="space-y-8">
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod}
          monthlyBudget={totalCalculatedMonthlyBudget}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />

        <QuickActionsSection
          onAddTransaction={onAddTransaction}
          currentDisplayedDate={displayedDate}
        />

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
            <CardTitle>{translate({ en: "Spending Summary", pt: "Resumo de Gastos" })}</CardTitle>
            <CardDescription>
              {translate({ en: "Your spending breakdown for", pt: "Seu detalhamento de gastos em" })} {displayedMonthYearLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {largestExpenseCategoryForDisplayedPeriod && (
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium text-foreground mb-1">
                      {translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}:
                    </p>
                    <div className="flex items-start space-x-3">
                      <CategoryIcon iconName={largestExpenseCategoryForDisplayedPeriod.icon} className="h-8 w-8 text-primary flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-foreground truncate">
                          {getCategoryLabel(largestExpenseCategoryForDisplayedPeriod.name, language)}
                        </p>
                        <p className="text-xl font-bold text-primary text-center">
                          {formatCurrency(largestExpenseCategoryForDisplayedPeriod.amount)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium text-foreground text-center">
                    {translate({ en: "Total Fixed Expenses", pt: "Total de Gastos Fixos" })}:{' '}
                    <span className="text-xl font-bold text-primary">
                      {formatCurrency(totalFixedExpensesForDisplayedPeriod)}
                    </span>
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium text-foreground text-center">
                    {translate({ en: "Total Variable Expenses", pt: "Total de Gastos Variáveis" })}:{' '}
                    <span className="text-xl font-bold text-primary">
                      {formatCurrency(totalVariableExpensesForDisplayedPeriod)}
                    </span>
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
    

    