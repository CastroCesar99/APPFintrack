
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
import type { Transaction, CategoryName, DisplayCategory, UserPreferences, DisplayPaymentMethod, ExpenseType } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getCategoryLabel } from "@/types";
import { useLanguage } from '@/context/language-context';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
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
// import { v4 as uuidv4 } from 'uuid'; // No longer needed if optimistic updates are removed


export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [loadedBudgetsForMonth, setLoadedBudgetsForMonth] = useState<Record<string, number> | null>(null);
  
  const [userCategories, setUserCategories] = useState<DisplayCategory[]>(() => [...CATEGORIES]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>(() => [...PAYMENT_METHODS]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);

  const effectMountedRef = useRef(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  console.log("DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection:", displayedDate.toISOString());


  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
    return () => {
      effectMountedRef.current = false;
    }
  }, []);

  // Listener for User Preferences
  useEffect(() => {
    if (!userId || !isClient || authLoading) {
      setUserCategories([...CATEGORIES]);
      setUserPaymentMethods([...PAYMENT_METHODS]);
      setIsLoadingPreferences(false);
      if (unsubscribePreferencesRef.current) {
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
      return;
    }

    console.log("DashboardPage: TRACER --- Setting up listener for user preferences for UserID:", userId);
    setIsLoadingPreferences(true);
    const preferencesDocRef = doc(db, `users/${userId}/preferences/userPreferences`);

    const unsubscribe = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) return;
      console.log("DashboardPage: TRACER --- Preferences snapshot received.");

      let finalCategories: DisplayCategory[] = [...CATEGORIES];
      let finalPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];

      if (docSnap.exists()) {
        const preferencesData = docSnap.data() as UserPreferences;
        console.log("DashboardPage: TRACER --- Preferences data found:", preferencesData);

        const customCategoryDefs = preferencesData.userDefinedCategories || [];
        const allCategoriesMap = new Map<string, DisplayCategory>();
        CATEGORIES.forEach(cat => allCategoriesMap.set(cat.name.toLowerCase(), cat));
        customCategoryDefs.forEach(customCat => {
            allCategoriesMap.set(customCat.name.toLowerCase(), { ...customCat, type: customCat.type || 'expense' });
        });
        finalCategories = Array.from(allCategoriesMap.values());

        const customPaymentMethodDefs = preferencesData.userDefinedPaymentMethods || [];
        const basePaymentMethodsMap = new Map<string, DisplayPaymentMethod>();
        PAYMENT_METHODS.forEach(pm => basePaymentMethodsMap.set(pm.name.toLowerCase(), pm));
        customPaymentMethodDefs.forEach(customPm => basePaymentMethodsMap.set(customPm.name.toLowerCase(), customPm));
        
        const selectedPaymentMethodNames = preferencesData.selectedPaymentMethods || [];
        if (selectedPaymentMethodNames.length > 0) {
            const effectivePMs = Array.from(basePaymentMethodsMap.values()).filter(pm => 
                selectedPaymentMethodNames.some(name => name.toLowerCase() === pm.name.toLowerCase())
            );
            finalPaymentMethods = effectivePMs.length > 0 ? effectivePMs : Array.from(basePaymentMethodsMap.values());
        } else {
            finalPaymentMethods = Array.from(basePaymentMethodsMap.values());
        }
      } else {
        console.log("DashboardPage: TRACER --- No preferences document found. Using defaults.");
      }
      setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
      setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
      setIsLoadingPreferences(false);
      console.log("DashboardPage: TRACER --- Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items");

    }, (error) => {
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: TRACER --- Error listening to user preferences for UserID:", userId, error);
      toast({
        title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }),
        description: translate({ en: "Could not load your preferences in real-time.", pt: "Não foi possível carregar suas preferências em tempo real." }),
        variant: "destructive",
      });
      setUserCategories([...CATEGORIES]); 
      setUserPaymentMethods([...PAYMENT_METHODS]); 
      setIsLoadingPreferences(false);
    });

    unsubscribePreferencesRef.current = unsubscribe;

    return () => {
      console.log("DashboardPage: TRACER --- Cleaning up preferences listener for UserID:", userId);
      unsubscribe();
      unsubscribePreferencesRef.current = null;
    };
  }, [userId, isClient, authLoading, language, toast, translate]);


  // Main data fetching useEffect for transactions and initial setup
  useEffect(() => {
    console.log("Dashboard: TRACER --- Main data fetching useEffect START. UserID:", userId, ", AuthLoading:", authLoading, ", isClient:", isClient, ", InitiatedFor:", mainFetchInitiatedForUser.current, ", isLoadingTransactions:", isLoadingTransactions);

    const cleanupListener = () => {
      if (unsubscribeSnapshotRef.current && typeof unsubscribeSnapshotRef.current === 'function') {
        console.log("Dashboard: TRACER --- cleanupListener: Unsubscribing snapshot for UserID:", mainFetchInitiatedForUser.current);
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null; // Crucial to mark as unsubscribed
      } else {
        console.log("Dashboard: TRACER --- cleanupListener: No snapshot to unsubscribe or ref is not a function for UserID:", mainFetchInitiatedForUser.current);
      }
    };

    if (!isClient) {
      console.log("Dashboard: TRACER --- Main useEffect: Not client yet, waiting.");
      return cleanupListener;
    }

    if (authLoading) {
      console.log("Dashboard: TRACER --- Main useEffect: Auth is loading, waiting...");
      // If auth is loading, we are definitely not ready to fetch user-specific transactions.
      // Ensure isLoadingTransactions is true if we haven't initiated a fetch for the current (or any) user.
      if (mainFetchInitiatedForUser.current === null && !isLoadingTransactions) {
        // This case might be redundant if isLoadingTransactions defaults to true
      }
      return cleanupListener;
    }

    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      if (effectMountedRef.current) {
        cleanupListener(); // Clean up any existing listener
        setTransactions([]);
        if (isLoadingTransactions) setIsLoadingTransactions(false);
        mainFetchInitiatedForUser.current = null; // Reset initiated user
        router.push('/login');
      }
      return cleanupListener;
    }

    // Core data fetching and listener setup logic
    const fetchDataInternal = async (currentUserId: string) => {
      if (!effectMountedRef.current) {
        console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early for UserID:", currentUserId);
        if (isLoadingTransactions) setIsLoadingTransactions(false);
        return;
      }
      console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

      try {
        const userDocRef = doc(db, "users", currentUserId);
        const userDocSnap = await getDoc(userDocRef);

        if (!effectMountedRef.current) {
          console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted while fetching user doc for UserID:", currentUserId);
          if (isLoadingTransactions) setIsLoadingTransactions(false);
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
        
        console.log("Dashboard: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener for transactions.");
        
        const transactionsColRef = collection(db, 'users/' + currentUserId + '/transactions');
        const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

        if (unsubscribeSnapshotRef.current && typeof unsubscribeSnapshotRef.current === 'function') {
            console.warn("Dashboard: TRACER --- fetchDataInternal: Stale transaction snapshot ref found before new onSnapshot. Cleaning up again for UserID:", currentUserId);
            unsubscribeSnapshotRef.current(); // Clean up the old listener
            unsubscribeSnapshotRef.current = null;
        }
        
        unsubscribeSnapshotRef.current = onSnapshot(q_transactions, (querySnapshot) => {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- Transactions onSnapshot: Effect unmounted for UserID:", currentUserId, ". Skipping state update.");
            return;
          }
          console.log("Dashboard: TRACER --- Transactions onSnapshot: Received data for UserID: " + currentUserId + ". Empty: " + querySnapshot.empty + ", PendingWrites: " + querySnapshot.metadata.hasPendingWrites);

          const fetchedTransactions = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            let dateString = data.date; 

            if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
              dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
            } else if (typeof data.date === 'string' && data.date.includes('T')) { 
              try {
                dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
              } catch (e) {
                console.warn("Dashboard: TRACER --- Failed to parse existing ISO datetime string to yyyy-MM-dd: " + String(data.date), e);
                dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
              }
            } else if (typeof data.date !== 'string' || (typeof data.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(data.date))) {
               console.warn("Dashboard: TRACER --- Transaction has unexpected date format, or not YYYY-MM-DD. Fallback to current date YYYY-MM-DD. Date was:", data.date);
               dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
            }

            return {
              ...data,
              id: docSnap.id,
              date: dateString, 
              isRecurring: data.isRecurring === true,
              expenseType: data.expenseType,
              installments: data.installments,
              paymentMethod: data.paymentMethod,
              expenseNature: data.expenseNature
            } as Transaction;
          });

          if (effectMountedRef.current) {
            console.log("Dashboard: TRACER --- Transactions onSnapshot: Setting " + fetchedTransactions.length + " transactions for UserID: " + currentUserId + ".");
            setTransactions(fetchedTransactions);
            // Only set loading to false after the first successful snapshot data is processed
             if (isLoadingTransactions) {
                setIsLoadingTransactions(false);
                console.log("Dashboard: TRACER --- setIsLoadingTransactions(false) after processing transaction snapshot data for UserID:", currentUserId);
             }
          }
        }, (error: any) => {
          if (!effectMountedRef.current) {
            console.log("Dashboard: TRACER --- Transactions onSnapshot error callback: Effect unmounted for UserID:", currentUserId);
            return;
          }
          console.error("Dashboard: TRACER --- Transactions onSnapshot: Error listening to transactions snapshot for UserID:", currentUserId, error);
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
          if (isLoadingTransactions) setIsLoadingTransactions(false);
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

    // Condition to initiate a new fetch or listener setup
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log("Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: " + String(userId) + ". PrevInitiatedFor: " + String(mainFetchInitiatedForUser.current) + ". ListenerExisted: " + (!!unsubscribeSnapshotRef.current));
      cleanupListener(); // Clean up previous listener *before* setting up new one
      if (effectMountedRef.current && !isLoadingTransactions) {
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user (condition: !isLoadingTransactions):", userId);
         setIsLoadingTransactions(true);
      }
      mainFetchInitiatedForUser.current = userId; 
      fetchDataInternal(userId);
    } else {
      console.log("Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: " + String(userId) + ". isLoadingTransactions: " + isLoadingTransactions + ". Snapshot ref present: " + (!!unsubscribeSnapshotRef.current));
      // If listener is supposedly active but we are still in a loading state, something is wrong
      // or this is the very first successful pass for a user.
      if(effectMountedRef.current && isLoadingTransactions && unsubscribeSnapshotRef.current) { 
        // This might happen if onSnapshot hasn't fired its first batch yet.
        // Or if an error previously occurred and we are retrying.
        console.log("Dashboard: TRACER --- Main useEffect: Listener active, but isLoadingTransactions true. Waiting for snapshot or error to resolve for user:", userId);
      }
    }
    return cleanupListener;
  }, [userId, authLoading, isClient, router, toast, translate]); // Removed isLoadingTransactions


 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }),
        variant: "destructive",
      });
      return;
    }
    console.log("Dashboard: TRACER --- onAddTransaction: Received date from form:", newTransactionData.date);
    console.log("Dashboard: TRACER --- onAddTransaction: Full newTransactionData:", JSON.stringify(newTransactionData, null, 2));


    const fullPayload = {
      ...newTransactionData, 
      userId: userId,
      createdAt: serverTimestamp(),
      // ensure isRecurring is boolean
      isRecurring: typeof newTransactionData.isRecurring === 'boolean' ? newTransactionData.isRecurring : false,
    };
    
    // Filter out undefined values BEFORE saving
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string }>;


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
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year:", getYearFns(displayedDate), "Month:", getMonthFns(displayedDate), `(0-indexed for ${displayedMonthYearLabel}), All transactions count:`, transactions.length);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);
    const firstDayOfTargetMonth = startOfMonth(displayedDate);

    const filtered: Transaction[] = [];
    transactions.forEach(t => {
      const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
      const transactionYear = getYearFns(originalTransactionDate);
      const transactionMonth = getMonthFns(originalTransactionDate);
      let includeTransaction = false;

      // Handle installments
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const installmentSeriesEndDate = endOfMonth(addMonths(installmentSeriesStartDate, t.installments - 1));
        const isInstallmentActiveThisMonth = isWithinInterval(firstDayOfTargetMonth, { start: installmentSeriesStartDate, end: installmentSeriesEndDate });
        
        console.log(`Dashboard: TRACER --- Tx Filter (Installment Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, StartSeries: ${installmentSeriesStartDate.toISOString()}, EndSeries: ${installmentSeriesEndDate.toISOString()}, TargetMonthStart: ${firstDayOfTargetMonth.toISOString()}, installments: ${t.installments}, isActive: ${isInstallmentActiveThisMonth}, isRec: ${t.isRecurring}, expType: ${t.expenseType}`);

        if (isInstallmentActiveThisMonth) {
          includeTransaction = true;
        }
      }
      // Handle generic recurring transactions (MUST NOT BE INSTALLMENTS)
      else if (t.isRecurring === true && t.expenseType !== 'installment') {
        const matchesRecurringCriteria = transactionYear < targetYear || (transactionYear === targetYear && transactionMonth <= targetMonth);
        console.log(`Dashboard: TRACER --- Tx Filter (Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, TxY: ${transactionYear}, TxM: ${transactionMonth}, MatchesRec: ${matchesRecurringCriteria}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);
        if (matchesRecurringCriteria) {
          includeTransaction = true;
        }
      }
      // Handle non-recurring, non-installment transactions
      else if (!t.isRecurring && t.expenseType !== 'installment') {
        const matchesNonRecurringCriteria = transactionYear === targetYear && transactionMonth === targetMonth;
         console.log(`Dashboard: TRACER --- Tx Filter (Non-Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, TxY: ${transactionYear}, TxM: ${transactionMonth}, MatchesNonRec: ${matchesNonRecurringCriteria}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);
        if (matchesNonRecurringCriteria) {
          includeTransaction = true;
        }
      }
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Found ${filtered.length} transactions for the period.`);
    return filtered;
  }, [transactions, displayedDate, displayedMonthYearLabel]);

  const fullRecentIncomeList = useMemo(() => {
    console.log(`Dashboard: TRACER --- recentIncome: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);
    const targetMonthStart = startOfMonth(displayedDate);

    const monthlyDisplayTransactions: Transaction[] = [];
    transactions.forEach(t => {
        if (t.type !== 'income') return;

        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
        const originalTransactionDay = getDateFns(originalTransactionDate);

        if (t.isRecurring) {
            if (startOfMonth(originalTransactionDate) <= targetMonthStart) {
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                // Ensure the projected date is within the target month (e.g., if original was 31st and target month has 30 days)
                if (getMonthFns(projectedDateForMonth) !== targetMonth) { 
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                const projectedTx = {
                    ...t,
                    id: `${t.id}_projected_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`, 
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"), 
                    description: `${t.description} (${translate({en: "Monthly", pt: "Mensal"})})`,
                };
                monthlyDisplayTransactions.push(projectedTx);
                console.log(`Dashboard: TRACER --- recentIncome: Added projected recurring: ${projectedTx.description}, Date: ${projectedTx.date}`);
            }
        } else { // Non-recurring income
            if (getYearFns(originalTransactionDate) === targetYear && getMonthFns(originalTransactionDate) === targetMonth) {
                monthlyDisplayTransactions.push(t);
                console.log(`Dashboard: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}`);
            }
        }
    });
    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentIncome: Found ${sorted.length} items for display (full list).`);
    return sorted;
  }, [transactions, displayedDate, language, translate, displayedMonthYearLabel]); 

  const recentIncomeToDisplay = showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList; // Removed .slice(0,5)


  const fullRecentExpensesList = useMemo(() => {
    console.log(`Dashboard: TRACER --- recentExpenses: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);
    const targetMonthStart = startOfMonth(displayedDate);

    const monthlyDisplayTransactions: Transaction[] = [];
    transactions.forEach(t => {
        if (t.type !== 'expense') return;

        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
        const originalTransactionDay = getDateFns(originalTransactionDate);

        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
            const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
            const monthDiff = differenceInCalendarMonths(targetMonthStart, installmentSeriesStartDate);
            const currentInstallmentNum = monthDiff + 1;
            
            console.log(`Dashboard: TRACER --- recentExpenses (Installment Check): ID: ${t.id}, OrigDate: ${t.date}, currentInstallmentNum: ${currentInstallmentNum}, totalInstallments: ${t.installments}, monthDiff: ${monthDiff}, expType: ${t.expenseType}`);

            if (monthDiff >= 0 && monthDiff < t.installments) { // Check if current month is within the installment period
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                // Ensure the projected date is within the target month
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
        } else if (t.isRecurring && t.expenseType !== 'installment') { 
            if (startOfMonth(originalTransactionDate) <= targetMonthStart) {
                let projectedDateForMonth = setDateFnsDate(targetMonthStart, originalTransactionDay);
                if (getMonthFns(projectedDateForMonth) !== targetMonth) {
                    projectedDateForMonth = lastDayOfMonth(targetMonthStart);
                }
                 const projectedTx = {
                    ...t,
                    id: `${t.id}_projected_${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
                    description: `${t.description} (${translate({en: "Monthly", pt: "Mensal"})})`,
                    date: formatDateFns(projectedDateForMonth, "yyyy-MM-dd"),
                };
                monthlyDisplayTransactions.push(projectedTx);
                console.log(`Dashboard: TRACER --- recentExpenses: Added projected recurring: ${projectedTx.description}, Date: ${projectedTx.date}`);
            }
        } else if (!t.isRecurring && t.expenseType !== 'installment') { 
            if (getYearFns(originalTransactionDate) === targetYear && getMonthFns(originalTransactionDate) === targetMonth) {
                monthlyDisplayTransactions.push(t);
                console.log(`Dashboard: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}`);
            }
        }
    });

    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentExpenses: Found ${sorted.length} items for display (full list).`);
    return sorted;
  }, [transactions, displayedDate, language, translate, displayedMonthYearLabel]); 

  const recentExpensesToDisplay = showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList; // Removed .slice(0,5)


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
      const categoryDetail = userCategories.find(cat => cat.name === largestCategoryKey) || CATEGORIES.find(cat => cat.name === largestCategoryKey);
      return {
        name: largestCategoryKey,
        amount: maxAmount,
        icon: categoryDetail?.icon || 'CircleHelp',
        label: categoryDetail?.label || { en: largestCategoryKey, pt: largestCategoryKey },
        type: 'expense',
      } as DisplayCategory & { amount: number };
    }
    return null;
  }, [transactionsForDisplayedPeriod, userCategories, language]);

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

  const loadBudgets = useCallback(async () => {
    if (!userId || !isClient) {
        setLoadedBudgetsForMonth(null);
        return;
    }
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log(`Dashboard: TRACER --- Loading budgets for user ${userId}, month: ${budgetMonthKey}`);
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, number>;
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          // Ensure we are not picking up 'lastUpdated' or other non-numeric fields as budget categories
          if (key !== 'lastUpdated' && Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        setLoadedBudgetsForMonth(validBudgets);
        console.log(`Dashboard: TRACER --- Budgets loaded for ${budgetMonthKey}:`, validBudgets);
      } else {
        setLoadedBudgetsForMonth({}); 
        console.log(`Dashboard: TRACER --- No budget document found for ${budgetMonthKey}.`);
      }
    } catch (error) {
      console.error("Dashboard: TRACER --- LoadBudgets: Error loading budgets for month:", budgetMonthKey, error);
      setLoadedBudgetsForMonth({}); 
      toast({
        title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }),
        description: translate({ en: "Could not load your budgets for the summary.", pt: "Não foi possível carregar seus orçamentos para o resumo." }),
        variant: "destructive",
      });
    }
  }, [userId, displayedDate, isClient, toast, translate]);


  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]); // `loadBudgets` is memoized with `useCallback` and its dependencies are correct

  const totalIncomeForSummary = useMemo(() => {
    return transactionsForDisplayedPeriod
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalExpensesForSummary = useMemo(() => {
    return transactionsForDisplayedPeriod
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);
  
  console.log("Dashboard: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);


  if (!isClient || authLoading || isLoadingTransactions || isLoadingPreferences) {
    console.log("Dashboard: TRACER --- RENDERING LOADING SCREEN. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions, "isLoadingPreferences:", isLoadingPreferences);
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

        <QuickActionsSection
          onAddTransaction={onAddTransaction}
          currentDisplayedDate={displayedDate} 
          userCategories={userCategories}
          userPaymentMethods={userPaymentMethods}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecentTransactionsSection
            title={translate({ en: "Recent Income", pt: "Receitas Recentes" })}
            description={translate({ en: "Your latest income entries.", pt: "Suas últimas entradas de receita." })}
            transactions={recentIncomeToDisplay} 
            type="income"
            onSeeMore={() => setShowAllRecentIncome(prev => !prev)}
            isExpanded={showAllRecentIncome}
            totalItemsForMonth={fullRecentIncomeList.length}
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={translate({ en: "Your last few transactions.", pt: "Suas últimas transações." })}
            transactions={recentExpensesToDisplay} 
            type="expense"
            onSeeMore={() => setShowAllRecentExpenses(prev => !prev)}
            isExpanded={showAllRecentExpenses}
            totalItemsForMonth={fullRecentExpensesList.length}
          />
        </div>

      </div>
    </AppLayout>
  );
}

    
    