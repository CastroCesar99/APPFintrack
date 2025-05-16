
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
import type { Transaction, CategoryName, ExpenseNature } from "@/types";
import { CATEGORIES, getCategoryLabel } from "@/types";
import { useLanguage } from '@/context/language-context';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { useDateNavigation } from '@/context/date-navigation-context';
import { format as formatDateFns, parse as parseDateFns, parseISO as parseISODateFns } from 'date-fns';

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
      if (unsubscribeSnapshotRef.current && typeof unsubscribeSnapshotRef.current === 'function') {
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
      // When auth is loading, we don't know the user yet, so ensure we are in a loading state for transactions if not already.
      if (effectMountedRef.current && !isLoadingTransactions) {
        // This might be redundant if the initial state of isLoadingTransactions is true, but safe.
        // setIsLoadingTransactions(true); 
      }
      return fullCleanup;
    }

    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      cleanupListener();
      if (effectMountedRef.current) {
        setTransactions([]); // Clear transactions for logged-out user
        if (isLoadingTransactions) setIsLoadingTransactions(false); // Stop loading if it was active
      }
      mainFetchInitiatedForUser.current = null; // Reset initiated fetch flag
      if (effectMountedRef.current) router.push('/login');
      return fullCleanup;
    }
    
    // Core logic: User is authenticated, client is mounted.
    // Fetch data or set up listener only if it hasn't been done for this user, or if the listener was lost.
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log(`Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: ${userId}. PrevInitiatedFor: ${mainFetchInitiatedForUser.current}. ListenerExisted: ${!!unsubscribeSnapshotRef.current}`);
      cleanupListener(); // Clean up any old listener first

      if (effectMountedRef.current && !isLoadingTransactions) {
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
        setIsLoadingTransactions(true);
      }
      mainFetchInitiatedForUser.current = userId; // Mark that fetch is initiated for this user

      const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early for UserID:", currentUserId);
            if(isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
            return;
        }
        console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);
        
        // Ensure loading state is true if we are starting a fresh fetch.
        if (effectMountedRef.current && !isLoadingTransactions) {
             console.log("Dashboard: TRACER --- fetchDataInternal: Ensuring isLoadingTransactions is true for new fetch/setup of user:", currentUserId);
             setIsLoadingTransactions(true);
        }

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
              router.push('/onboarding'); // Redirect to onboarding if user document doesn't exist
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

          // Defensive cleanup of any lingering snapshot reference before attaching a new one
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
            console.log(`Dashboard: TRACER --- onSnapshot: Received data for UserID: ${currentUserId}. Empty: ${querySnapshot.empty}, PendingWrites: ${querySnapshot.metadata.hasPendingWrites}`);
            
            const fetchedTransactions = querySnapshot.docs.map(docSnap => {
              const data = docSnap.data();
              // Ensure date is always a YYYY-MM-DD string
              let dateString = data.date; // Assume it might be correct
              if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
                dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
              } else if (typeof data.date === 'string' && data.date.includes('T')) { // Attempt to parse ISO datetime
                try {
                  dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
                } catch (e) {
                  console.warn(`Failed to parse existing ISO datetime string to yyyy-MM-dd: ${data.date}`, e);
                  // Fallback to current date if parsing fails catastrophically, though ideally source data is clean
                  dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                }
              } else if (typeof data.date !== 'string' || (typeof data.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(data.date))) {
                console.warn("Transaction has unexpected date format, or not YYYY-MM-DD. Fallback to current date YYYY-MM-DD. Date was:", data.date);
                dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
              }

              return {
                ...data, 
                id: docSnap.id, 
                date: dateString, // Store as YYYY-MM-DD
              } as Transaction;
            });
            
            if (effectMountedRef.current) {
              console.log(`Dashboard: TRACER --- onSnapshot: Setting ${fetchedTransactions.length} transactions for UserID: ${currentUserId}.`);
              setTransactions(fetchedTransactions);
              if(isLoadingTransactions) { // Only set to false if it was true
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
              setTransactions([]); // Clear transactions on error
              if(isLoadingTransactions) { // Only set to false if it was true
                setIsLoadingTransactions(false);
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in onSnapshot (error callback) for UserID:", currentUserId);
              }
            }
          });

        } catch (error: any) {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- fetchDataInternal: Main try-catch, effect unmounted for UserID:", currentUserId);
            if(isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
            return;
          }
          console.error("Dashboard: TRACER --- fetchDataInternal: Error in main data fetching logic for UserID:", currentUserId, error);
          if (effectMountedRef.current) {
            toast({
              title: translate({ en: "Error", pt: "Erro" }),
              description: translate({ en: "Could not load dashboard data.", pt: "Não foi possível carregar dados do painel." }) + (error.message ? ` (Code: ${error.code || 'N/A'})` : ''),
              variant: "destructive",
            });
            setTransactions([]); // Clear transactions
            if(isLoadingTransactions) { // Only set to false if it was true
              setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (main catch block) for UserID:", currentUserId);
            }
          }
        }
      };

      fetchDataInternal(userId);
    } else {
      // Listener should already be active, or no user. If still loading for some reason, ensure it's set to false.
      console.log(`Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: ${userId}. isLoadingTransactions: ${isLoadingTransactions}. Snapshot ref present: ${!!unsubscribeSnapshotRef.current}`);
       if (isLoadingTransactions && effectMountedRef.current && !unsubscribeSnapshotRef.current && transactions.length === 0) {
            // This case might indicate a lost listener or an incomplete setup from a previous run.
            // Forcing loading to false here if no listener and no data.
            console.warn("Dashboard: TRACER --- Main useEffect: No active listener, no transactions, but still loading. Forcing loading to false for UserID:", userId);
            if (effectMountedRef.current) setIsLoadingTransactions(false);
       }
    }

    return fullCleanup;
  // Dependencies: only re-run if userId, authLoading, or isClient changes.
  // Removing router, toast, translate to prevent loops if their references change unnecessarily.
  // isLoadingTransactions was removed as it was causing loops.
  }, [userId, authLoading, isClient, router, toast, translate]);


  const onAddTransaction = async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => {
    if (!userId) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }),
        variant: "destructive",
      });
      return;
    }

    // Optimistic update
    const optimisticTransaction: Transaction = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Temporary unique ID
      description: newTransactionData.description,
      amount: newTransactionData.amount,
      type: newTransactionData.type,
      category: newTransactionData.category,
      date: newTransactionData.date, // Expecting YYYY-MM-DD string
      paymentMethod: newTransactionData.paymentMethod,
      installments: newTransactionData.installments,
      isRecurring: newTransactionData.isRecurring,
      expenseNature: newTransactionData.expenseNature,
      // No userId or createdAt for optimistic version, they are backend/server values
    };

    // Add to local state immediately, sorted
    setTransactions(prevTransactions => 
      [optimisticTransaction, ...prevTransactions].sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime())
    );

    try {
      const transactionsColRef = collection(db, `users/${userId}/transactions`);
      
      const fullPayload = {
        description: newTransactionData.description,
        amount: newTransactionData.amount,
        type: newTransactionData.type,
        category: newTransactionData.category,
        date: newTransactionData.date, // YYYY-MM-DD string
        paymentMethod: newTransactionData.paymentMethod,
        installments: newTransactionData.installments,
        isRecurring: newTransactionData.isRecurring, // Should be boolean
        expenseNature: newTransactionData.expenseNature,
        userId: userId,
        createdAt: serverTimestamp(),
      };

      // Filter out undefined optional fields before saving to Firestore
      const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
      ) as Partial<Transaction & { createdAt: any; userId: string }>;
      
      // Ensure 'isRecurring' is explicitly false if not provided, as Firestore cannot store 'undefined'
      if (!('isRecurring' in dataToSave) && typeof newTransactionData.isRecurring === 'boolean') {
         dataToSave.isRecurring = newTransactionData.isRecurring;
      } else if (!('isRecurring' in dataToSave)) {
        dataToSave.isRecurring = false; // Default to false if not specified
      }


      await addDoc(transactionsColRef, dataToSave);

      toast({
        title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }),
        description: `${newTransactionData.description} ${translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })}`,
      });
      // No need to manually update local state here, onSnapshot will handle it
      // The optimistic transaction will be replaced by the real one from Firestore
    } catch (error: any) {
      console.error("DashboardPage: Error adding transaction to Firestore:", error);
      // Revert optimistic update on failure
      setTransactions(prevTransactions => prevTransactions.filter(t => t.id !== optimisticTransaction.id));
      toast({
        title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }),
        description: (error.message || translate({ en: "Could not add transaction.", pt: "Não foi possível adicionar a transação." })) + (error.code ? ` (Code: ${error.code})` : ''),
        variant: "destructive",
      });
    }
  };


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetYear = displayedDate.getFullYear();
    const targetMonth = displayedDate.getMonth(); // 0-indexed (0 for Jan, 1 for Feb, etc.)

    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Filtering for Year: ${targetYear}, Month: ${targetMonth} (0-indexed for ${displayedMonthYearLabel})`);

    return transactions.filter(t => {
      // Include recurring income regardless of its specific date's month, if it's active
      if (t.isRecurring === true && t.type === "income") { 
        // For simplicity, recurring income is counted in every period.
        // More complex logic might check start/end dates if those were added.
        console.log(`Dashboard: TRACER --- Tx Filter: ID: ${t.id}, DateStr: ${t.date}, Type: ${t.type}, IsRecurring: true, Matches: true (Recurring Income)`);
        return true;
      }
      
      // For non-recurring income and all expenses (including recurring ones, as they should have a specific month's date)
      const dateParts = t.date.split('-'); // t.date is YYYY-MM-DD
      if (dateParts.length !== 3) {
        console.warn(`Dashboard: TRACER --- Tx Filter: ID: ${t.id}, Invalid date format: ${t.date}, Matches: false`);
        return false; // Invalid date format for filtering
      }
      const transactionYear = parseInt(dateParts[0], 10);
      const transactionMonth = parseInt(dateParts[1], 10) - 1; // Convert MM (1-12) to 0-indexed month

      const matches = transactionYear === targetYear && transactionMonth === targetMonth;
      console.log(`Dashboard: TRACER --- Tx Filter: ID: ${t.id}, DateStr: ${t.date}, ParsedDateObj: (Using parts), TxY: ${transactionYear}, TxM: ${transactionMonth}, Matches: ${matches}, isRec: ${t.isRecurring}`);
      return matches;
    });
  }, [transactions, displayedDate, displayedMonthYearLabel]);


  const recentIncome = useMemo(() => {
    return transactions
      .filter(t => t.type === 'income')
      .sort((a,b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime())
      .slice(0, 5);
  }, [transactions]);

  const recentExpenses = useMemo(() => {
    return transactions
      .filter(t => t.type === 'expense')
      .sort((a,b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime())
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
        name: largestCategoryKey as CategoryName, // Cast, as we know it's a key from CATEGORIES
        amount: maxAmount,
        icon: categoryDetails?.icon || 'CircleHelp', // Fallback icon
      };
    }
    return null;
  }, [transactionsForDisplayedPeriod]);

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


  // Loading state prioritizes auth loading, then client mounting, then transaction loading.
  if (!isClient || authLoading || isLoadingTransactions) {
    console.log("Dashboard: TRACER --- RENDERING LOADING SCREEN. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions);
    return (
        <div className="flex items-center justify-center h-screen w-full bg-background">
          <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..."})}</p>
        </div>
    );
  }
  console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions:", transactions.length, "isLoadingTransactions:", isLoadingTransactions, "Displayed Period Transactions:", transactionsForDisplayedPeriod.length);


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
                    <div className="flex items-start space-x-3"> {/* Changed to items-start */}
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
    

    
    

    