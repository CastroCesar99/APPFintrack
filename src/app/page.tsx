
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
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";
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
  setDate as setDateFnsDate,
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
  const mainFetchInitiatedForUser = useRef<string | null>(null); // Tracks if the main fetch has been done for the current user

  const userId = user?.uid;

  console.log(`DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection: ${displayedDate.toISOString()}`);

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
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, number>;
        // Filter out any non-numeric budget values if necessary, though Firestore typically stores numbers correctly.
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        setLoadedBudgetsForMonth(validBudgets);
      } else {
        setLoadedBudgetsForMonth({}); // No budget set for this month
      }
    } catch (error) {
      console.error("Dashboard: TRACER --- LoadBudgets: Error loading budgets:", error);
      setLoadedBudgetsForMonth({}); // Default to empty on error
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
      // If auth is loading, but we were previously not loading transactions and user might be changing, reset loading state
      if (!isLoadingTransactions && mainFetchInitiatedForUser.current !== userId) {
         console.log("Dashboard: TRACER --- Main useEffect: AuthLoading is true, and user might be changing or initial. Setting isLoadingTransactions to true.");
         if(effectMountedRef.current) setIsLoadingTransactions(true);
      }
      return fullCleanup;
    }

    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      cleanupListener(); // Clean up any existing listener
      if (effectMountedRef.current) {
        setTransactions([]); // Clear transactions
        if (isLoadingTransactions) setIsLoadingTransactions(false); // Stop loading if it was
      }
      mainFetchInitiatedForUser.current = null; // Reset initiated fetch status
      if (effectMountedRef.current) router.push('/login');
      return fullCleanup;
    }

    // Core data fetching logic encapsulated
    const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
          console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early for UserID:", currentUserId);
          if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
          return;
        }
        console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

        // Ensure loading is true if we are about to fetch/listen for a new user or if no listener is active
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
              router.push('/onboarding'); // User exists in Auth but not in Firestore users collection
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

          // At this point, user is onboarded, proceed to fetch transactions
          console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener.");
          const transactionsColRef = collection(db, 'users/' + currentUserId + '/transactions');
          const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

          // Defensive cleanup, in case a previous listener wasn't properly detached (shouldn't happen with current structure but safe)
          if (unsubscribeSnapshotRef.current && typeof unsubscribeSnapshotRef.current === 'function') {
            console.warn("Dashboard: TRACER --- fetchDataInternal: Stale snapshot ref found before new onSnapshot. Cleaning up again for UserID:", currentUserId, unsubscribeSnapshotRef.current);
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
              let dateString = data.date; // Expecting YYYY-MM-DD

              // Normalize date from Firestore
              if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
                dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
              } else if (typeof data.date === 'string' && data.date.includes('T')) { // Handle ISO datetime strings if they exist
                try {
                  dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
                } catch (e) {
                  console.warn("Dashboard: TRACER --- Failed to parse existing ISO datetime string to yyyy-MM-dd: " + data.date, e);
                  dateString = formatDateFns(new Date(), "yyyy-MM-dd"); // Fallback
                }
              } else if (typeof data.date !== 'string' || (typeof data.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(data.date))) {
                 // This case handles if date is not a string or not in YYYY-MM-DD format.
                 console.warn("Dashboard: TRACER --- Transaction has unexpected date format, or not YYYY-MM-DD. Fallback to current date YYYY-MM-DD. Date was:", data.date);
                 dateString = formatDateFns(new Date(), "yyyy-MM-dd"); // Fallback
              }

              // Ensure isRecurring is a boolean, default to false if not present or not boolean
              let isRecurringVal = data.isRecurring === true;
              if (data.isRecurring !== true && data.isRecurring !== false) {
                  // console.warn("Dashboard: TRACER --- Transaction ID: " + docSnap.id + " has unexpected isRecurring value: " + data.isRecurring + ". Defaulting to false.");
                  isRecurringVal = false;
              }


              return {
                ...data,
                id: docSnap.id,
                date: dateString, // Ensure date is YYYY-MM-DD string
                isRecurring: isRecurringVal,
                expenseType: data.expenseType,
                installments: data.installments,
                paymentMethod: data.paymentMethod,
                expenseNature: data.expenseNature
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
            setTransactions([]); // Clear transactions
            if (isLoadingTransactions) {
              setIsLoadingTransactions(false);
              console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) in fetchDataInternal (main catch block) for UserID:", currentUserId);
            }
          }
        }
      };

    // Determine if a new fetch/listener setup is needed
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log("Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: " + userId + ". PrevInitiatedFor: " + mainFetchInitiatedForUser.current + ". ListenerExisted: " + (!!unsubscribeSnapshotRef.current));
      cleanupListener(); // Clean up any old listener before starting a new one
      if (effectMountedRef.current && !isLoadingTransactions) {
        // This condition might be too aggressive if listener was just cleaned up for the same user.
        // isLoadingTransactions should ideally be true if we are here to set up a new listener for a user.
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user (condition: !isLoadingTransactions):", userId);
        setIsLoadingTransactions(true);
      } else if (effectMountedRef.current && isLoadingTransactions && mainFetchInitiatedForUser.current !== userId){
         // This implies user changed while we were already in a loading state for the previous user.
         // isLoadingTransactions is already true, which is correct.
         console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) because user changed while already loading. New User:", userId, "Old User:", mainFetchInitiatedForUser.current );
      }

      mainFetchInitiatedForUser.current = userId; // Mark that fetch has been initiated for this user
      fetchDataInternal(userId);
    } else {
      // Listener should be active for the current userId, ensure loading state is false if it was true
      console.log("Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: " + userId + ". isLoadingTransactions: " + isLoadingTransactions + ". Snapshot ref present: " + (!!unsubscribeSnapshotRef.current));
       if(effectMountedRef.current && isLoadingTransactions) { // Ensure loading stops if effect re-runs but listener is already active
        console.log("Dashboard: TRACER --- Main useEffect: Listener active, but isLoadingTransactions true. Setting to false for user:", userId);
        setIsLoadingTransactions(false);
      }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient, router, toast, translate]); // Dependencies for the main effect


 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => {
    if (!userId) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }),
        variant: "destructive",
      });
      return;
    }

    console.log("Dashboard: TRACER --- onAddTransaction: Received date from form:", newTransactionData.date); // Should be YYYY-MM-DD

    const fullPayload = {
      ...newTransactionData, // date is already YYYY-MM-DD string
      userId: userId,
      createdAt: serverTimestamp(),
    };

    // Filter out undefined values before saving to Firestore
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string }>;

    // Ensure isRecurring defaults to false if not explicitly set to true
    if (dataToSave.isRecurring === undefined && typeof newTransactionData.isRecurring === 'boolean') {
        dataToSave.isRecurring = newTransactionData.isRecurring;
    } else if (dataToSave.isRecurring === undefined) {
       dataToSave.isRecurring = false; // Default to false if not provided or became undefined
    }


    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "Full dataToSave:", JSON.stringify(dataToSave));

    try {
      const transactionsColRef = collection(db, 'users/' + userId + '/transactions');
      await addDoc(transactionsColRef, dataToSave);

      // No optimistic update here, rely on onSnapshot
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
    const firstDayOfTargetMonth = startOfMonth(displayedDate);

    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year: ${targetYear}, Month: ${targetMonth} (0-indexed for ${displayedMonthYearLabel}), All transactions count: ${transactions.length}`);

    const filtered: Transaction[] = [];
    transactions.forEach(t => {
      const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0)); // Use new Date(0) to normalize

      // Handle installments
      if (t.expenseType === 'installment' && t.installments && t.installments > 0 && t.type === 'expense') {
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        const isInstallmentActiveThisMonth = monthDiff >= 0 && monthDiff < t.installments;

        console.log(`Dashboard: TRACER --- Tx Filter (Installment Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, StartSeries: ${installmentSeriesStartDate.toISOString()}, TargetMonthStart: ${firstDayOfTargetMonth.toISOString()}, monthDiff: ${monthDiff}, installments: ${t.installments}, isActive: ${isInstallmentActiveThisMonth}, isRec: ${t.isRecurring}, expType: ${t.expenseType}`);
        
        if (isInstallmentActiveThisMonth) {
           filtered.push(t);
        }
      }
      // Handle generic recurring transactions (MUST NOT BE INSTALLMENTS)
      else if (t.isRecurring === true && t.expenseType !== 'installment') {
        const originalTransactionYear = getYearFns(originalTransactionDate);
        const originalTransactionMonth = getMonthFns(originalTransactionDate);
        const matchesRecurringCriteria = originalTransactionYear < targetYear || (originalTransactionYear === targetYear && originalTransactionMonth <= targetMonth);
        
        console.log(`Dashboard: TRACER --- Tx Filter (Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, TxY: ${originalTransactionYear}, TxM: ${originalTransactionMonth}, MatchesRec: ${matchesRecurringCriteria}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);

        if (matchesRecurringCriteria) {
          filtered.push(t);
        }
      }
      // Handle non-recurring, non-installment transactions
      else if (!t.isRecurring && t.expenseType !== 'installment') {
        const transactionYear = getYearFns(originalTransactionDate);
        const transactionMonth = getMonthFns(originalTransactionDate);
        const matchesNonRecurringCriteria = transactionYear === targetYear && transactionMonth === targetMonth;

        console.log(`Dashboard: TRACER --- Tx Filter (Non-Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, TxY: ${transactionYear}, TxM: ${transactionMonth}, MatchesNonRec: ${matchesNonRecurringCriteria}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);
        
        if (matchesNonRecurringCriteria) {
          filtered.push(t);
        }
      }
    });

    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Found ${filtered.length} transactions for the period.`);
    return filtered;
  }, [transactions, displayedDate, displayedMonthYearLabel]);


  const recentIncome = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);
    const targetMonthStart = startOfMonth(displayedDate);

    const monthlyDisplayTransactions: Transaction[] = [];
    console.log(`Dashboard: TRACER --- recentIncome: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);

    transactions.forEach(t => {
        if (t.type !== 'income') return;

        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
        const originalTransactionDay = getDateFns(originalTransactionDate);

        if (t.isRecurring) {
            // Include if original start date is on or before the current displayed month's start
            if (startOfMonth(originalTransactionDate) <= targetMonthStart) {
                // Project this recurring income to the current displayed month
                // Try to keep the original day, but cap at last day of month if original day doesn't exist
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) { // e.g. original was Jan 31, current month is Feb
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                const projectedTx = {
                    ...t,
                    id: `${t.id}_projected_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`, // Make ID unique for display
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"), // Projected date
                };
                monthlyDisplayTransactions.push(projectedTx);
                console.log(`Dashboard: TRACER --- recentIncome: Added projected recurring: ${projectedTx.description}, Date: ${projectedTx.date}`);
            }
        } else {
            // Non-recurring: include only if it's actually in this month
            if (getYearFns(originalTransactionDate) === targetYear && getMonthFns(originalTransactionDate) === targetMonth) {
                monthlyDisplayTransactions.push(t);
                console.log(`Dashboard: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}`);
            }
        }
    });

    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    //   .slice(0, 5); // Temporarily removed for debugging
    console.log(`Dashboard: TRACER --- recentIncome: Found ${sorted.length} items for display.`);
    return sorted;
  }, [transactions, displayedDate, language, translate, displayedMonthYearLabel]); // Added displayedMonthYearLabel for logging

  const recentExpenses = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);
    const targetMonthStart = startOfMonth(displayedDate);

    const monthlyDisplayTransactions: Transaction[] = [];
    console.log(`Dashboard: TRACER --- recentExpenses: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);

    transactions.forEach(t => {
        if (t.type !== 'expense') return;

        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
        const originalTransactionDay = getDateFns(originalTransactionDate);

        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
            const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
            const monthDiff = differenceInCalendarMonths(targetMonthStart, installmentSeriesStartDate);
            const currentInstallmentNum = monthDiff + 1; // 1-indexed for display "Parcela X de Y"

            console.log(`Dashboard: TRACER --- recentExpenses (Installment Check): ID: ${t.id}, OrigDate: ${t.date}, currentInstallmentNum: ${currentInstallmentNum}, totalInstallments: ${t.installments}`);

            if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
                // Installment is active this month, project it
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) {
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                const projectedInstallment = {
                    ...t,
                    id: `${t.id}_inst_${currentInstallmentNum}_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"),
                    description: `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`,
                };
                monthlyDisplayTransactions.push(projectedInstallment);
                 console.log(`Dashboard: TRACER --- recentExpenses: Added projected installment: ${projectedInstallment.description}, Date: ${projectedInstallment.date}`);
            }
        } else if (t.isRecurring && t.expenseType !== 'installment') { // Generic recurring, not an installment
            if (startOfMonth(originalTransactionDate) <= targetMonthStart) {
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) {
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                 const projectedTx = {
                    ...t,
                    id: `${t.id}_projected_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"),
                };
                monthlyDisplayTransactions.push(projectedTx);
                console.log(`Dashboard: TRACER --- recentExpenses: Added projected recurring: ${projectedTx.description}, Date: ${projectedTx.date}`);
            }
        } else if (!t.isRecurring && t.expenseType !== 'installment') { // Non-recurring, non-installment
            if (getYearFns(originalTransactionDate) === targetYear && getMonthFns(originalTransactionDate) === targetMonth) {
                monthlyDisplayTransactions.push(t);
                console.log(`Dashboard: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}`);
            }
        }
    });

    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    //   .slice(0, 5); // Temporarily removed for debugging
    console.log(`Dashboard: TRACER --- recentExpenses: Found ${sorted.length} items for display.`);
    return sorted;
  }, [transactions, displayedDate, language, translate, displayedMonthYearLabel]); // Added displayedMonthYearLabel for logging


  const largestExpenseCategoryForDisplayedPeriod = useMemo(() => {
    // This uses transactionsForDisplayedPeriod which should already be correctly filtered for the month, including installments
    const expensesThisPeriod = transactionsForDisplayedPeriod.filter(t => t.type === 'expense');
    if (expensesThisPeriod.length === 0) {
      return null;
    }

    const expensesByCategory: Record<string, number> = {};
    for (const transaction of expensesThisPeriod) {
      // Use transaction.category directly as it's already a string (CategoryName or custom)
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
      // Attempt to find in predefined, otherwise treat as custom for display purposes
      const predefinedCat = CATEGORIES.find(cat => cat.name === largestCategoryKey);
      if (predefinedCat) {
        return {
          name: largestCategoryKey as CategoryName, // Cast to CategoryName if found
          amount: maxAmount,
          icon: predefinedCat.icon,
          label: predefinedCat.label, // This is an object {en: ..., pt: ...}
          type: 'expense'
        } as DisplayCategory & { amount: number };
      } else {
        // Fallback for custom category: name is the key, icon is default
        return {
          name: largestCategoryKey, // This will be the custom string name
          amount: maxAmount,
          icon: 'CircleHelp', // Default icon for custom categories not in predefined list
          label: { en: largestCategoryKey, pt: largestCategoryKey }, // Label will be the name itself
          type: 'expense',
        } as DisplayCategory & { amount: number };
      }
    }
    return null;
  }, [transactionsForDisplayedPeriod, language]); // language dependency for getCategoryDisplayLabel

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

  // Calculate total budget from loadedBudgetsForMonth
  const totalCalculatedMonthlyBudget = useMemo(() => {
    if (!loadedBudgetsForMonth) return 0;
    return Object.values(loadedBudgetsForMonth).reduce((sum, budget) => sum + (budget || 0), 0);
  }, [loadedBudgetsForMonth]);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]); // loadBudgets is wrapped in useCallback and depends on userId, displayedDate

  // For SummarySection props
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
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod} // Pass the correctly filtered transactions
          monthlyBudget={totalCalculatedMonthlyBudget} // Pass the sum of loaded budgets
          displayedMonthYearLabel={displayedMonthYearLabel}
        />

        <QuickActionsSection
          onAddTransaction={onAddTransaction}
          currentDisplayedDate={displayedDate} // For TransactionForm default date
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecentTransactionsSection
            title={translate({ en: "Recent Income", pt: "Receitas Recentes" })}
            description={translate({ en: "Your latest income entries.", pt: "Suas últimas entradas de receita." })}
            transactions={recentIncome} // Use memoized recentIncome
            type="income"
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={translate({ en: "Your last few transactions.", pt: "Suas últimas transações." })}
            transactions={recentExpenses} // Use memoized recentExpenses
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

    

    