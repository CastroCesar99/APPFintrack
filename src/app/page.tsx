
'use client';
import React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction, CategoryName, DisplayCategory, UserPreferences } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel } from "@/types";
import { useLanguage } from '@/context/language-context';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { useDateNavigation } from '@/context/date-navigation-context';
import { 
  format as formatDateFns, 
  parse as parseDateFns, 
  getYear as getYearFns, 
  getMonth as getMonthFns, 
  getDate as getDateFns,
  parseISO as parseISODateFns, 
  startOfMonth, 
  endOfMonth,
  addMonths,
  setDate as setDateFnsDate, // Renamed to avoid conflict with local 'setDate' if any
  differenceInCalendarMonths,
  isWithinInterval,
  lastDayOfMonth
} from 'date-fns';


export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { language, translate } = useLanguage();
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

  console.log(`DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection: ${displayedDate.toISOString()}`);

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

  const loadBudgets = useCallback(async () => {
    if (!userId || !isClient) {
        console.log("Dashboard: TRACER --- LoadBudgets: Skipping, no userId or not client. UserID:", userId, "isClient:", isClient);
        setLoadedBudgetsForMonth(null);
        return;
    }
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log(`Dashboard: TRACER --- LoadBudgets: Attempting to load budgets for user ${userId}, month: ${budgetMonthKey}`);
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, number>;
         console.log(`Dashboard: TRACER --- LoadBudgets: Budget data found for ${budgetMonthKey}:`, JSON.stringify(budgetData, null, 2));
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        setLoadedBudgetsForMonth(validBudgets);
      } else {
        console.log(`Dashboard: TRACER --- LoadBudgets: No budget document found for ${budgetMonthKey}. Setting empty budgets.`);
        setLoadedBudgetsForMonth({});
      }
    } catch (error) {
      console.error("Dashboard: TRACER --- LoadBudgets: Error loading budgets:", error);
      setLoadedBudgetsForMonth({}); // Set to empty object on error to avoid breaking sum calculation
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
        console.log("Dashboard: TRACER --- cleanupListener: No snapshot to unsubscribe or ref is not a function for UserID:", mainFetchInitiatedForUser.current);
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
      if (!isLoadingTransactions && mainFetchInitiatedForUser.current !== userId) {
         console.log("Dashboard: TRACER --- Main useEffect: AuthLoading is true, and user might be changing or initial. Setting isLoadingTransactions to true.");
         if(effectMountedRef.current) setIsLoadingTransactions(true);
      }
      return fullCleanup;
    }

    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      cleanupListener();
      if (effectMountedRef.current) {
        setTransactions([]);
        if (isLoadingTransactions) setIsLoadingTransactions(false);
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
            console.warn("Dashboard: TRACER --- fetchDataInternal: Stale snapshot ref found before new onSnapshot. Cleaning up again for UserID:", currentUserId);
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
              } else if (typeof data.date === 'string' && data.date.includes('T')) { 
                try {
                  dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
                } catch (e) {
                  console.warn("Dashboard: TRACER --- Failed to parse existing ISO datetime string to yyyy-MM-dd: " + data.date, e);
                  dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                }
              } else if (typeof data.date !== 'string' || (typeof data.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(data.date))) {
                 console.warn("Dashboard: TRACER --- Transaction has unexpected date format, or not YYYY-MM-DD. Fallback to current date YYYY-MM-DD. Date was:", data.date);
                 dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }
              
              let isRecurringVal = data.isRecurring === true; 
              if (data.isRecurring !== true && data.isRecurring !== false) {
                  console.warn("Dashboard: TRACER --- Transaction ID: " + docSnap.id + " has unexpected isRecurring value: " + data.isRecurring + ". Defaulting to false.");
                  isRecurringVal = false;
              }
              
              return {
                ...data,
                id: docSnap.id,
                date: dateString, 
                isRecurring: isRecurringVal,
                expenseType: data.expenseType, // Ensure these are explicitly mapped
                installments: data.installments,
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
              setTransactions([]); 
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
      cleanupListener(); 
      if (effectMountedRef.current && !isLoadingTransactions) { 
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user (condition: !isLoadingTransactions):", userId);
        setIsLoadingTransactions(true);
      } else if (effectMountedRef.current && isLoadingTransactions && mainFetchInitiatedForUser.current !== userId){ 
         console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) because user changed while already loading. New User:", userId, "Old User:", mainFetchInitiatedForUser.current );
         // No need to set to true again if already true
      }

      mainFetchInitiatedForUser.current = userId;
      fetchDataInternal(userId);
    } else {
      console.log("Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: " + userId + ". isLoadingTransactions: " + isLoadingTransactions + ". Snapshot ref present: " + (!!unsubscribeSnapshotRef.current));
    }
    return fullCleanup;
  }, [userId, authLoading, isClient, router, toast, translate]); 


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

    if (dataToSave.isRecurring === undefined && typeof newTransactionData.isRecurring === 'boolean') {
        dataToSave.isRecurring = newTransactionData.isRecurring;
    } else if (dataToSave.isRecurring === undefined) {
       dataToSave.isRecurring = false; 
    }
    
    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "Full dataToSave:", JSON.stringify(dataToSave));

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
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating. displayedDate:", displayedDate.toISOString(), "All transactions count:", transactions.length);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); // 0-indexed
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    const lastDayOfTargetMonth = endOfMonth(displayedDate);


    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Filtering for Year: ${targetYear}, Month: ${targetMonth} (0-indexed for ${displayedMonthYearLabel})`);

    const filtered: Transaction[] = [];
    transactions.forEach(t => {
      const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date());

      // Handle installments
      if (t.expenseType === 'installment' && t.installments && t.installments > 0 && t.type === 'expense') {
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const installmentSeriesEndDate = endOfMonth(addMonths(originalTransactionDate, t.installments - 1));
        
        // Check if the displayed month is within the installment period
        if (isWithinInterval(firstDayOfTargetMonth, { start: installmentSeriesStartDate, end: installmentSeriesEndDate }) || 
            isWithinInterval(lastDayOfTargetMonth, { start: installmentSeriesStartDate, end: installmentSeriesEndDate }) ||
            (firstDayOfTargetMonth < installmentSeriesStartDate && lastDayOfTargetMonth > installmentSeriesEndDate) ) {
           // Check if the specific installment falls into this month based on its original day
           const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
           if (monthDiff >=0 && monthDiff < t.installments) {
             filtered.push(t); // Add the original transaction, its amount represents the installment
           }
        }
      } 
      // Handle generic recurring transactions (not installments)
      else if (t.isRecurring === true) {
        const originalTransactionYear = getYearFns(originalTransactionDate);
        const originalTransactionMonth = getMonthFns(originalTransactionDate);
        if (originalTransactionYear < targetYear || (originalTransactionYear === targetYear && originalTransactionMonth <= targetMonth)) {
          filtered.push(t);
        }
      } 
      // Handle non-recurring, non-installment transactions
      else {
        const transactionYear = getYearFns(originalTransactionDate);
        const transactionMonth = getMonthFns(originalTransactionDate);
        if (transactionYear === targetYear && transactionMonth === targetMonth) {
          filtered.push(t);
        }
      }
    });
    
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Found " + filtered.length + " transactions for the period.");
    return filtered;
  }, [transactions, displayedDate, displayedMonthYearLabel]);


  const recentIncome = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); 
    const targetMonthStart = startOfMonth(displayedDate);

    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
        if (t.type !== 'income') return;

        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date());
        const originalTransactionDay = getDateFns(originalTransactionDate);

        if (t.isRecurring) {
            // Only project if the recurring transaction started on or before the current displayed month
            if (startOfMonth(originalTransactionDate) <= targetMonthStart) {
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) { 
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                 monthlyDisplayTransactions.push({
                    ...t,
                    id: `${t.id}_projected_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"),
                });
            }
        } else {
            if (getYearFns(originalTransactionDate) === targetYear && getMonthFns(originalTransactionDate) === targetMonth) {
                monthlyDisplayTransactions.push(t);
            }
        }
    });
    
    return monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime())
      .slice(0, 5);
  }, [transactions, displayedDate, language, translate]);

  const recentExpenses = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); 
    const targetMonthStart = startOfMonth(displayedDate);
    
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
        if (t.type !== 'expense') return;

        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date());
        const originalTransactionDay = getDateFns(originalTransactionDate);

        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
            const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
            const monthDiff = differenceInCalendarMonths(targetMonthStart, installmentSeriesStartDate);
            const currentInstallmentNum = monthDiff + 1;

            if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) {
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                monthlyDisplayTransactions.push({
                    ...t,
                    id: `${t.id}_inst_${currentInstallmentNum}_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"),
                    description: `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`,
                });
            }
        } else if (t.isRecurring) { // Generic recurring, not an installment
            if (startOfMonth(originalTransactionDate) <= targetMonthStart) {
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) { 
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                monthlyDisplayTransactions.push({
                    ...t,
                    id: `${t.id}_projected_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"),
                });
            }
        } else { // Non-recurring, non-installment
            if (getYearFns(originalTransactionDate) === targetYear && getMonthFns(originalTransactionDate) === targetMonth) {
                monthlyDisplayTransactions.push(t);
            }
        }
    });
    
    return monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime())
      .slice(0, 5);
  }, [transactions, displayedDate, language, translate]);


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
      // Try to find in predefined categories first
      const predefinedCat = CATEGORIES.find(cat => cat.name === largestCategoryKey);
      if (predefinedCat) {
        return {
          name: largestCategoryKey as CategoryName, // Cast is okay as it's found in predefined
          amount: maxAmount,
          icon: predefinedCat.icon,
          label: predefinedCat.label, 
          type: 'expense'
        } as DisplayCategory & { amount: number };
      } else { 
        // If not predefined, it's a custom category. We don't have custom category definitions loaded here.
        // So, create a minimal DisplayCategory-like object for display purposes.
        // This part might need enhancement if custom category icons/full labels are needed here.
        return {
          name: largestCategoryKey, // The string name
          amount: maxAmount,
          icon: 'CircleHelp', // Default icon
          label: { en: largestCategoryKey, pt: largestCategoryKey }, // Use name as label
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
  }, [loadBudgets]); 

  const totalIncomeForSummary = transactionsForDisplayedPeriod.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const totalExpensesForSummary = transactionsForDisplayedPeriod.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  console.log("Dashboard: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);


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
  console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions:", transactions.length, "isLoadingTransactions:", isLoadingTransactions, "Displayed Period Transactions:", transactionsForDisplayedPeriod.length);

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
                          {getCategoryDisplayLabel(largestExpenseCategoryForDisplayedPeriod, language)}
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
