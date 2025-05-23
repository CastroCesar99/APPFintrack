
'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, PaymentMethodName, DisplayPaymentMethod, CustomPaymentMethodData, CategoryName } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch, type Unsubscribe } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { Package, Wallet } from "lucide-react";
import { CategoryIcon } from "@/components/icons";
import { useDateNavigation } from '@/context/date-navigation-context';
import { useLanguage } from '@/context/language-context';
import {
  format as formatDateFns,
  parse as parseDateFns,
  getYear as getYearFns,
  getMonth as getMonthFns,
  getDate as getDateFns,
  startOfMonth,
  endOfMonth,
  addMonths,
  setDate as setDateFnsDate,
  differenceInCalendarMonths,
  isWithinInterval,
  lastDayOfMonth,
  parseISO as parseISODateFns
} from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  const [userCategories, setUserCategories] = useState<DisplayCategory[]>([]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  const [loadedBudgetsForMonth, setLoadedBudgetsForMonth] = useState<Record<string, number> | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);

  const [isClient, setIsClient] = useState(false);
  const effectMountedRef = useRef(true);

  const mainFetchInitiatedForUser = useRef<string | null>(null);
  const unsubscribeTransactionsRef = useRef<Unsubscribe | null>(null);
  const unsubscribePreferencesRef = useRef<Unsubscribe | null>(null);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);

  console.log("DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection:", displayedDate.toISOString());

  useEffect(() => {
    console.log("DashboardPage: TRACER --- isClient useEffect running");
    setIsClient(true);
    effectMountedRef.current = true;
    const currentUserIdForCleanup = mainFetchInitiatedForUser.current;
    return () => {
      console.log("DashboardPage: TRACER --- Main Component UNMOUNTING. Cleaning up all listeners for UserID:", currentUserIdForCleanup);
      effectMountedRef.current = false;
      cleanupListener(unsubscribeTransactionsRef, "transactions on unmount", currentUserIdForCleanup);
      cleanupListener(unsubscribePreferencesRef, "preferences on unmount", currentUserIdForCleanup);
    };
  }, []);

  const cleanupListener = useCallback((listenerRef: React.MutableRefObject<Unsubscribe | null>, type: string, currentUserIdForCleanup?: string | null) => {
    if (listenerRef.current && typeof listenerRef.current === 'function') {
      console.log("DashboardPage: TRACER --- cleanupListener: Unsubscribing " + type + " for UserID:", currentUserIdForCleanup || "N/A");
      listenerRef.current();
      listenerRef.current = null;
    }
  }, []);

  // Effect for User Preferences and Transactions
  useEffect(() => {
    const targetUserId = userId;
    console.log("DashboardPage: TRACER --- Main Data useEffect START. UserID:", targetUserId, "AuthLoading:", authLoading, "isClient:", isClient, "InitiatedFor:", mainFetchInitiatedForUser.current);

    if (!isClient) {
      console.log("DashboardPage: TRACER --- Main Data useEffect: Not client yet, waiting.");
      // Keep loading flags true until client is ready
      return;
    }

    if (authLoading) {
      console.log("DashboardPage: TRACER --- Main Data useEffect: Auth is loading, waiting...");
      // Keep loading flags true
      return;
    }

    if (!targetUserId) {
      console.log("DashboardPage: TRACER --- Main Data useEffect: No user ID, redirecting to login.");
      if (effectMountedRef.current) {
        setAllTransactions([]);
        setUserCategories([...CATEGORIES]);
        setUserPaymentMethods([...PAYMENT_METHODS]);
        setLoadedBudgetsForMonth(null);
        setIsLoadingTransactions(false);
        setIsLoadingPreferences(false);
        setIsLoadingBudgets(false);
      }
      router.push('/login');
      return;
    }

    if (user && !user.emailVerified) {
      console.log("DashboardPage: TRACER --- Main Data useEffect: User email not verified. Redirecting to /verify-email.");
      if (effectMountedRef.current) {
        // Reset states similarly
        setIsLoadingTransactions(false);
        setIsLoadingPreferences(false);
        setIsLoadingBudgets(false);
      }
      router.push('/verify-email');
      return;
    }

    // Fetch User Preferences
    if (mainFetchInitiatedForUser.current !== targetUserId || !unsubscribePreferencesRef.current) {
      console.log("DashboardPage: TRACER --- Preferences: Setting up listener for UserID:", targetUserId);
      cleanupListener(unsubscribePreferencesRef, "preferences old", mainFetchInitiatedForUser.current);
      if (effectMountedRef.current) setIsLoadingPreferences(true);

      const preferencesDocRef = doc(db, 'users', targetUserId, 'preferences/userPreferences');
      unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
        if (!effectMountedRef.current) {
          console.log("DashboardPage: TRACER --- Preferences snapshot received, but component unmounted for UserID:", targetUserId);
          return;
        }
        let finalCategories: DisplayCategory[] = [];
        let finalPaymentMethods: DisplayPaymentMethod[] = [];

        if (docSnap.exists()) {
          const prefsData = docSnap.data() as UserPreferences;
          console.log("DashboardPage: TRACER --- Preferences loaded for UserID:", targetUserId);
          const userDefinedCategoriesFromPrefs: CustomCategoryData[] = prefsData.userDefinedCategories || [];
          const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
          const customCategoriesMap = new Map<string, CustomCategoryData>();
          userDefinedCategoriesFromPrefs.forEach(cc => customCategoriesMap.set(cc.name.toLowerCase(), cc));

          finalCategories = CATEGORIES.map(predefCat => {
            const customOverride = customCategoriesMap.get(predefCat.name.toLowerCase());
            if (customOverride) {
              customCategoriesMap.delete(predefCat.name.toLowerCase());
              return { ...predefCat, ...customOverride, label: customOverride.label || predefCat.label };
            }
            return predefCat;
          }).filter(cat => !deselectedPredefinedCatNames.has(cat.name.toLowerCase()));

          customCategoriesMap.forEach(customCat => {
            if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
              finalCategories.push(customCat);
            }
          });
          if (finalCategories.length === 0 && CATEGORIES.length > 0) {
             finalCategories = [...CATEGORIES.filter(cat => !deselectedPredefinedCatNames.has(cat.name.toLowerCase()))];
             if(finalCategories.length === 0) finalCategories = [...CATEGORIES];
          }

          const userDefinedPaymentMethodsFromPrefs: CustomPaymentMethodData[] = prefsData.userDefinedPaymentMethods || [];
          const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
          const customPaymentMethodsMap = new Map<string, CustomPaymentMethodData>();
          userDefinedPaymentMethodsFromPrefs.forEach(customPm => customPaymentMethodsMap.set(customPm.name.toLowerCase(), customPm));

          finalPaymentMethods = PAYMENT_METHODS.map(predefPm => {
              const customOverride = customPaymentMethodsMap.get(predefPm.name.toLowerCase());
              if (customOverride) {
                customPaymentMethodsMap.delete(predefPm.name.toLowerCase());
                return { ...predefPm, ...customOverride, label: customOverride.label || predefPm.label };
              }
              return predefPm;
            }).filter(pm => !deselectedPredefinedPmNames.has(pm.name.toLowerCase()));

          customPaymentMethodsMap.forEach(customPm => {
            if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customPm.name.toLowerCase())) {
              finalPaymentMethods.push(customPm);
            }
          });
          if (finalPaymentMethods.length === 0 && PAYMENT_METHODS.length > 0) {
              finalPaymentMethods = [...PAYMENT_METHODS.filter(pm => !deselectedPredefinedPmNames.has(pm.name.toLowerCase()))];
              if(finalPaymentMethods.length === 0) finalPaymentMethods = [...PAYMENT_METHODS];
          }
        } else {
           console.log("DashboardPage: TRACER --- No preferences document found for UserID:", targetUserId, ". Using all predefined categories/methods.");
           finalCategories = [...CATEGORIES];
           finalPaymentMethods = [...PAYMENT_METHODS];
        }
        if (effectMountedRef.current) {
          setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
          setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
          setIsLoadingPreferences(false);
          console.log("DashboardPage: TRACER --- Preferences: Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items. isLoadingPreferences: false");
        }
      }, (error) => {
        if (!effectMountedRef.current) return;
        console.error("DashboardPage: TRACER --- Error listening to user preferences for UserID:", targetUserId, error);
        toast({ title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }), description: translate({en: "Could not load your settings.", pt: "Não foi possível carregar suas configurações."}), variant: "destructive" });
        if (effectMountedRef.current) {
          setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
          setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
          setIsLoadingPreferences(false);
        }
      });
    }

    // Fetch Transactions
    if (mainFetchInitiatedForUser.current !== targetUserId || !unsubscribeTransactionsRef.current) {
      console.log("DashboardPage: TRACER --- Transactions: Initiating NEW fetch/listener for UserID:", targetUserId);
      cleanupListener(unsubscribeTransactionsRef, "transactions old", mainFetchInitiatedForUser.current);
      if (effectMountedRef.current) setIsLoadingTransactions(true);

      const fetchDataInternal = async () => {
        if (!effectMountedRef.current || mainFetchInitiatedForUser.current !== targetUserId) {
          console.log("DashboardPage: TRACER --- fetchDataInternal (Transactions): Component unmounted or user changed before starting for UserID:", targetUserId);
          if (effectMountedRef.current) setIsLoadingTransactions(false);
          return;
        }
        console.log("DashboardPage: TRACER --- fetchDataInternal: Starting for UserID:", targetUserId);

        try {
          const userDocRef = doc(db, "users", targetUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (!effectMountedRef.current) {
            console.log("DashboardPage: TRACER --- fetchDataInternal (Transactions): Component unmounted after getDoc for UserID:", targetUserId);
            if (effectMountedRef.current && isLoadingTransactions) setIsLoadingTransactions(false);
            return;
          }

          if (!userDocSnap.exists() || !userDocSnap.data()?.onboardingComplete) {
             if (effectMountedRef.current) {
              console.log("DashboardPage: TRACER --- fetchDataInternal (Transactions): User document not found or onboarding incomplete for UserID:", targetUserId, ". Redirecting to /onboarding.");
              if (effectMountedRef.current && isLoadingTransactions) setIsLoadingTransactions(false);
              router.push('/onboarding');
            }
            return;
          }

          console.log("DashboardPage: TRACER --- fetchDataInternal: User onboarding complete for UserID:", targetUserId, ". Setting up onSnapshot listener for transactions.");
          const transactionsColRef = collection(db, 'users', targetUserId, 'transactions');
          const q_transactions = query(transactionsColRef);

          unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
            if (!effectMountedRef.current) {
                console.log("DashboardPage: TRACER --- Transaction onSnapshot: Received data, but component unmounted for UserID:", targetUserId);
                return;
            }
            console.log("DashboardPage: TRACER --- Transaction onSnapshot: Received data for UserID:", targetUserId, ". Empty:", querySnapshot.empty, "PendingWrites:", querySnapshot.metadata.hasPendingWrites);
            const fetchedTransactions = querySnapshot.docs.map(docSnap => {
              const data = docSnap.data();
              let dateString = "1970-01-01";
              let effectiveMonthString = data.effectiveMonth;

              if (data.date) {
                if (data.date instanceof Timestamp) {
                  dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
                } else if (typeof data.date === 'string') {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
                    dateString = data.date;
                  } else if (data.date.includes('T')) {
                    try { dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); }
                    catch (e1){
                      try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd"); }
                      catch (e2){
                        console.warn("DashboardPage TX Date Parse (string T general for " + String(docSnap.id) + "): Failed for date '" + String(data.date) + "'. Error: " + String(e2) + ". Fallback.");
                        dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                      }
                    }
                  } else {
                    console.warn("DashboardPage TX Date Parse (string other for " + String(docSnap.id) + "): Date was '" + String(data.date) + "'. Attempting general parse.");
                    try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd"); }
                    catch (e){ dateString = formatDateFns(new Date(), "yyyy-MM-dd"); }
                  }
                } else {
                  console.warn("DashboardPage TX Date Parse (non-string, non-Timestamp for " + String(docSnap.id) + "): Date was", data.date, ". Fallback.");
                  dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                }
              } else {
                console.warn("DashboardPage TX Date Parse (missing for " + String(docSnap.id) + "): Date field is missing. Fallback.");
                dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }

              if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
                 if (dateString && dateString !== "1970-01-01") {
                    try { effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM"); }
                    catch (e) {
                      console.warn("DashboardPage TX effectiveMonth Derivation: Failed for tx " + String(docSnap.id) + " from date " + String(dateString) + ". Error: " + String(e) + ". Fallback to current month.");
                      effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                    }
                 } else {
                    console.warn("DashboardPage TX effectiveMonth Derivation: Date string invalid or missing for tx " + String(docSnap.id) + ". Fallback to current month.");
                    effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                 }
              }
              return {
                  ...data,
                  id: docSnap.id,
                  date: dateString,
                  effectiveMonth: effectiveMonthString,
                  isRecurring: data.isRecurring === true,
                  expenseType: data.expenseType,
                  installments: data.installments,
                  expenseNature: data.expenseNature
              } as Transaction;
            });
            if (effectMountedRef.current) {
              console.log("DashboardPage: TRACER --- Transaction onSnapshot: Setting " + fetchedTransactions.length + " transactions for UserID:", targetUserId);
              setAllTransactions(fetchedTransactions);
              setIsLoadingTransactions(false);
            }
          }, (error: any) => {
            if (!effectMountedRef.current) {
                 console.log("DashboardPage: TRACER --- Transaction onSnapshot Error: Component unmounted, skipping error handling for UserID:", targetUserId);
                 return;
            }
            console.error("DashboardPage: TRACER --- Transaction onSnapshot: Error listening for UserID:", targetUserId, error);
            toast({ title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }), description: translate({en: "Could not load transactions.", pt: "Não foi possível carregar as transações."}), variant: "destructive" });
            if (effectMountedRef.current) {
              setAllTransactions([]);
              setIsLoadingTransactions(false);
            }
          });
        } catch (error) {
          if (!effectMountedRef.current) {
            console.log("DashboardPage: TRACER --- fetchDataInternal (Transactions) Catch Block: Component unmounted, skipping error handling for UserID:", targetUserId);
            if (effectMountedRef.current && isLoadingTransactions) setIsLoadingTransactions(false);
            return;
          }
          console.error("DashboardPage: TRACER --- fetchDataInternal (Transactions): Error for UserID:", targetUserId, error);
          toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({en: "An error occurred loading data.", pt: "Ocorreu um erro ao carregar os dados."}), variant: "destructive" });
          if (effectMountedRef.current) {
            setAllTransactions([]);
            if (effectMountedRef.current && isLoadingTransactions) setIsLoadingTransactions(false);
          }
        }
      };
      fetchDataInternal();
    }

    mainFetchInitiatedForUser.current = targetUserId; // Mark that fetch has been initiated for this user

  }, [userId, isClient, authLoading, router, toast, translate, language, cleanupListener]);

  const loadBudgets = useCallback(async () => {
    const targetUserId = userId;
    if (!effectMountedRef.current || !targetUserId || !isClient || authLoading) {
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false); // Ensure this is set
      }
      return;
    }

    if (effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log("DashboardPage: TRACER --- Loading budgets for user " + targetUserId + ", month: " + budgetMonthKey);
    const budgetDocRef = doc(db, 'users/' + targetUserId + '/budgets/' + budgetMonthKey);

    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) {
        if (effectMountedRef.current) setIsLoadingBudgets(false);
        return;
      }
      if (docSnap.exists()) {
        const budgetData = docSnap.data();
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (key !== 'lastUpdated' && Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        if (effectMountedRef.current) setLoadedBudgetsForMonth(validBudgets);
      } else {
        if (effectMountedRef.current) setLoadedBudgetsForMonth({});
      }
    } catch (error) {
      if (!effectMountedRef.current) {
         if (effectMountedRef.current) setIsLoadingBudgets(false);
         return;
      }
      console.error("DashboardPage: TRACER --- Error loading budgets for UserID:", targetUserId, "Month:", budgetMonthKey, error);
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({en: "Could not load your budget data for this month.", pt: "Não foi possível carregar seus dados de orçamento para este mês."}), variant: "destructive" });
      if (effectMountedRef.current) setLoadedBudgetsForMonth({});
    } finally {
      if (effectMountedRef.current) {
        setIsLoadingBudgets(false);
      }
    }
  }, [userId, isClient, authLoading, displayedDate, toast, translate]);

  useEffect(() => {
    console.log("DashboardPage: TRACER --- Budget useEffect. UserID:", userId, "isClient:", isClient, "AuthLoading:", authLoading, "DisplayedDate:", displayedDate.toISOString());
    if (userId && isClient && !authLoading) {
        loadBudgets();
    } else if (effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false); // Ensure this is set if conditions aren't met
    }
  }, [userId, isClient, authLoading, displayedDate, loadBudgets]);

  const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    const targetUserId = userId;
    if (!targetUserId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }

    const transactionActualDate = newTransactionData.date; // This is YYYY-MM-DD string from form
    const effectiveMonthForSave = formatDateFns(displayedDate, "yyyy-MM"); // Based on dashboard's displayed month

    console.log("DashboardPage TRACER --- onAddTransaction: Received date from form:", transactionActualDate);
    console.log("DashboardPage TRACER --- onAddTransaction: Full newTransactionData from form:", JSON.stringify(newTransactionData, null, 2));

    const fullPayload = {
      ...newTransactionData,
      date: transactionActualDate,
      effectiveMonth: effectiveMonthForSave,
      userId: targetUserId,
      createdAt: serverTimestamp(),
    };

    const dataToSave = Object.fromEntries(
      Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;

    if(dataToSave.isRecurring === undefined) {
        dataToSave.isRecurring = false;
    }
    if(dataToSave.type === 'expense' && !dataToSave.expenseType){
        dataToSave.expenseType = 'upfront';
    }

    console.log("DashboardPage TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "and effectiveMonth:", dataToSave.effectiveMonth, "Full dataToSave:", JSON.stringify(dataToSave, null, 2));

    try {
      const transactionsColRef = collection(db, 'users', targetUserId, 'transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: newTransactionData.description + " " + translate({en:"added.", pt:"adicionada."})});
    } catch (error: any) {
      console.error("DashboardPage: TRACER --- onAddTransaction: Error adding transaction for UserID:", targetUserId, error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({en:"Could not save your transaction.", pt: "Não foi possível salvar sua transação."})), variant: "destructive" });
    }
  }, [userId, displayedDate, toast, translate]);

  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: Recalculating for TargetEffMonth:", targetEffectiveMonth, "All transactions count:", allTransactions.length);

    if (allTransactions.length === 0) {
      console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
      return [];
    }

    const filtered: Transaction[] = [];
    allTransactions.forEach(t => {
      let includeTransaction = false;
      let reason = "N/A";
      let originalTransactionDate: Date;

      try {
        originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
      } catch (e) {
        console.warn("DashboardPage: TRACER --- Tx Filter: Could not parse t.date '" + String(t.date) + "' for tx ID " + String(t.id) + ". Error:", e);
        return;
      }

      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        reason = "Installment Check";
        const installmentSeriesEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, startOfMonth(installmentSeriesEffectiveStartDate));
        const isInstallmentActiveThisMonth = monthDiff >= 0 && monthDiff < t.installments;
        if (isInstallmentActiveThisMonth) includeTransaction = true;
      } else if (t.isRecurring === true && t.expenseType !== 'installment') {
        reason = "Recurring Check";
        const recurrenceEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        if (startOfMonth(recurrenceEffectiveStartDate) <= firstDayOfTargetMonth) {
          includeTransaction = true;
        }
      } else if (t.effectiveMonth === targetEffectiveMonth) {
        reason = "Non-Recurring Check";
        includeTransaction = true;
      }
      console.log("DashboardPage: TRACER --- Tx Filter: ID:", t.id, "Date:", t.date, "EffMonth:", t.effectiveMonth, "Type:", t.type, "ExpType:", t.expenseType, "isRec:", t.isRecurring, "Inst:", t.installments, "Amount:", t.amount, "Included:", includeTransaction, "Reason:", reason, "Target:", targetEffectiveMonth);
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: Found", filtered.length, "transactions for the period.");
    return filtered;
  }, [allTransactions, displayedDate]);

  const totalIncomeForSummary = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalExpensesForSummary = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const largestExpenseCategoryForDisplayedPeriod = useMemo(() => {
    const expensesThisPeriod = transactionsForDisplayedPeriod.filter(t => t.type === 'expense');
    if (expensesThisPeriod.length === 0) return null;

    const expensesByCategory: Record<string, number> = {};
    expensesThisPeriod.forEach(tx => {
      const categoryName = tx.category as string;
      expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + tx.amount;
    });

    let maxAmount = 0;
    let largestCategoryKey: string | null = null;
    for (const key in expensesByCategory) {
      if (expensesByCategory[key] > maxAmount) {
        maxAmount = expensesByCategory[key];
        largestCategoryKey = key;
      }
    }

    if (largestCategoryKey) {
      let categoryDetail: DisplayCategory | undefined = userCategories.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase());
      if (!categoryDetail) {
          categoryDetail = CATEGORIES.find(cat => cat.name.toLowerCase() === largestCategoryKey!.toLowerCase()) ||
                           {
                             name: largestCategoryKey!,
                             type: 'expense',
                             icon: 'CircleHelp',
                             label: { en: largestCategoryKey!, pt: largestCategoryKey! }
                           };
      }
      return { ...categoryDetail, amount: maxAmount } as DisplayCategory & { amount: number };
    }
    return null;
  }, [transactionsForDisplayedPeriod, userCategories, language]);

  const totalFixedExpensesForDisplayedPeriod = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === 'expense' && t.expenseNature === 'fixed').reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalVariableExpensesForDisplayedPeriod = useMemo(() => {
    return transactionsForDisplayedPeriod.filter(t => t.type === 'expense' && t.expenseNature === 'variable').reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalCalculatedMonthlyBudget = useMemo(() => {
    if (!loadedBudgetsForMonth) return 0;
    return Object.values(loadedBudgetsForMonth).reduce((sum, budget) => sum + (budget || 0), 0);
  }, [loadedBudgetsForMonth]);

  const fullRecentIncomeList = useMemo(() => {
    console.log("DashboardPage: TRACER --- recentIncome: Calculating for", displayedMonthYearLabel, ". Total transactions:", allTransactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    allTransactions.forEach(t => {
      if (t.type !== 'income') return;
      try {
        let includeTransaction = false;
        let projectedDateForDisplay = t.date;
        let reason = "N/A";

        if (t.isRecurring) {
          reason = "Recurring Income Check";
          const firstImpactMonthForRecurrence = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          if (startOfMonth(firstImpactMonthForRecurrence) <= firstDayOfDisplayedMonth) {
            includeTransaction = true;
            const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
            const projectedDateDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
            }
            projectedDateForDisplay = formatDateFns(projectedDate, "yyyy-MM-dd");
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) {
          reason = "Non-Recurring Income Check";
          includeTransaction = true;
        }
        console.log("DashboardPage: TRACER --- recentIncome Filter: ID:", t.id, "Date:", t.date, "EffMonth:", t.effectiveMonth, "isRec:", t.isRecurring, "Included:", includeTransaction, "Reason:", reason, "ProjectedDate:", projectedDateForDisplay);
        if (includeTransaction) {
          monthlyDisplayTransactions.push({
            ...t,
            date: projectedDateForDisplay,
            id: t.isRecurring ? `${t.id}_proj_${targetEffectiveMonth}` : t.id
          });
        }
      } catch(e) {
        console.error("DashboardPage: TRACER --- Error processing transaction", t.id, "in fullRecentIncomeList:", e, t);
      }
    });
    const sorted = monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log("DashboardPage: TRACER --- recentIncome: Found", sorted.length, "items for display.");
    return sorted;
  }, [allTransactions, displayedDate, displayedMonthYearLabel, language, translate]);

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0, 5);
  }, [fullRecentIncomeList, showAllRecentIncome]);

  const fullRecentExpensesList = useMemo(() => {
    console.log("DashboardPage: TRACER --- recentExpenses: Calculating for", displayedMonthYearLabel, ". Total transactions:", allTransactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    allTransactions.forEach(t => {
      if (t.type !== 'expense') return;
      try {
        let includeTransaction = false;
        let projectedDateForDisplay = t.date;
        let descriptionForDisplay = t.description;
        let idForDisplay = t.id;
        let reason = "N/A";

        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          reason = "Installment Expense Check";
          const firstImpactMonthForInstallment = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          const monthDiffFromEffectiveStart = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(firstImpactMonthForInstallment));
          const currentInstallmentNum = monthDiffFromEffectiveStart + 1;

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            includeTransaction = true;
            projectedDateForDisplay = t.date; // Keep original date for installments display
            descriptionForDisplay = `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`;
            idForDisplay = `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}`;
          }
        }
        else if (t.isRecurring && t.expenseType !== 'installment') {
          reason = "Recurring Expense Check";
          const firstImpactMonthForRecurrence = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          if (startOfMonth(firstImpactMonthForRecurrence) <= firstDayOfDisplayedMonth) {
            includeTransaction = true;
            projectedDateForDisplay = t.date; // Keep original date for recurring display
            idForDisplay = `${t.id}_proj_${targetEffectiveMonth}`;
          }
        }
        else if (t.effectiveMonth === targetEffectiveMonth) { // Non-recurring, non-installment
          reason = "Non-Recurring Expense Check";
          includeTransaction = true;
        }
        console.log("DashboardPage: TRACER --- recentExpenses Filter: ID:", t.id, "Date:", t.date, "EffMonth:", t.effectiveMonth, "isRec:", t.isRecurring, "ExpType:", t.expenseType, "Inst:", t.installments, "Included:", includeTransaction, "Reason:", reason, "ProjectedDate:", projectedDateForDisplay);
        if (includeTransaction) {
          monthlyDisplayTransactions.push({
            ...t,
            date: projectedDateForDisplay,
            description: descriptionForDisplay,
            id: idForDisplay
          });
        }
      } catch (e) {
        console.error("DashboardPage: TRACER --- Error processing transaction", t.id, "in fullRecentExpensesList:", e, t);
      }
    });
    const sorted = monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log("DashboardPage: TRACER --- recentExpenses: Found", sorted.length, "items for display.");
    return sorted;
  },[allTransactions, displayedDate, displayedMonthYearLabel, language, translate]);

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);

  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;

  if (overallLoading) {
    console.log("DashboardPage: TRACER --- RENDERING LOADING SCREEN. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions, "isLoadingPreferences:", isLoadingPreferences, "isLoadingBudgets:", isLoadingBudgets);
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full p-4">
          <div className="space-y-4 w-full">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={`summary-skel-${i}`} className="h-24 w-full rounded-lg" />)}
            </div>
             <Card className="shadow-lg bg-background dark:bg-card rounded-lg">
              <CardHeader className="flex flex-col items-center text-center p-4 md:p-6">
                 <div className="text-xl font-medium leading-none tracking-tight text-foreground">
                   <Skeleton className="h-6 w-1/2 mb-2"/>
                 </div>
                 <CardDescription className="mt-1">
                   <Skeleton className="h-4 w-3/4"/>
                 </CardDescription>
               </CardHeader>
               <CardContent className="p-4 md:p-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={`spending-sum-skel-${i}`} className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                      <div className="text-sm font-medium text-foreground mb-1 break-words">
                        <Skeleton className="h-5 w-3/5 mb-2"/>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Skeleton className="h-7 w-7 rounded-full"/>
                        <Skeleton className="h-5 w-4/5 mb-1"/>
                      </div>
                      <div className="text-xl font-bold text-primary mt-1">
                        <Skeleton className="h-7 w-2/5"/>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md bg-muted/50 rounded-lg">
                <CardHeader className="p-4 md:p-6"><Skeleton className="h-6 w-1/4"/></CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Skeleton className="h-10 w-full rounded-md"/><Skeleton className="h-10 w-full rounded-md"/><Skeleton className="h-10 w-full rounded-md"/>
                  </div>
                </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-60 w-full rounded-lg" />
              <Skeleton className="h-60 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  console.log("DashboardPage: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);
  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod} // This should contain projected items
          monthlyBudget={totalCalculatedMonthlyBudget}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />

         <Card className="shadow-lg bg-background dark:bg-card rounded-lg">
           <CardHeader className="flex flex-col items-center text-center p-4 md:p-6">
             <div className="text-xl font-medium leading-none tracking-tight text-foreground">
               {translate({ en: "Spending Summary", pt: "Resumo de Gastos" })}
             </div>
             <CardDescription className="mt-1">
               {translate({ en: "Your spending breakdown for", pt: "Seu detalhamento de gastos em" })} {displayedMonthYearLabel}
             </CardDescription>
           </CardHeader>
           <CardContent className="p-4 md:p-6 pt-0">
            {transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                  <p className="text-sm font-medium text-foreground mb-1 break-words">
                    {translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}
                  </p>
                  {largestExpenseCategoryForDisplayedPeriod ? (
                    <>
                      <div className="flex items-center gap-2 mt-1">
                        <CategoryIcon iconName={largestExpenseCategoryForDisplayedPeriod.icon} className="h-7 w-7 text-primary" />
                        <span className="font-semibold text-lg text-foreground break-words">
                           {getCategoryDisplayLabel(largestExpenseCategoryForDisplayedPeriod, language)}
                        </span>
                      </div>
                      <p className="text-xl font-bold text-primary mt-1">
                        {formatCurrency(largestExpenseCategoryForDisplayedPeriod.amount)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">{translate({ en: "N/A", pt: "N/D"})}</p>
                  )}
                </div>

                 <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                   <p className="text-sm font-medium text-foreground mb-1">
                     {translate({ en: "Total Fixed Expenses", pt: "Total de Gastos Fixos" })}
                   </p>
                   <div className="flex items-center gap-2 mt-1">
                     <Package className="h-7 w-7 text-primary" />
                     <span className="font-semibold text-lg text-foreground">
                       {translate({ en: "Fixed", pt: "Fixos" })}
                     </span>
                   </div>
                   <p className="text-xl font-bold text-primary mt-1">
                     {formatCurrency(totalFixedExpensesForDisplayedPeriod)}
                   </p>
                 </div>

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                   <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Total Variable Expenses", pt: "Total de Gastos Variáveis" })}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Wallet className="h-7 w-7 text-primary" />
                    <span className="font-semibold text-lg text-foreground">
                      {translate({ en: "Variable", pt: "Variáveis" })}
                    </span>
                  </div>
                  <p className="text-xl font-bold text-primary mt-1">
                    {formatCurrency(totalVariableExpensesForDisplayedPeriod)}
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
          onSave={onAddTransaction}
          currentDisplayedDate={displayedDate}
          userCategories={userCategories}
          userPaymentMethods={userPaymentMethods}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecentTransactionsSection
            title={translate({ en: "Recent Income", pt: "Receitas Recentes" })}
            description={`${translate({ en: "Your latest income entries for", pt: "Suas últimas entradas de receita para" })} ${displayedMonthYearLabel}`}
            transactions={recentIncomeToDisplay}
            allUserCategories={userCategories}
            type="income"
            onSeeMore={() => setShowAllRecentIncome(prev => !prev)}
            isExpanded={showAllRecentIncome}
            totalItemsForMonth={fullRecentIncomeList.length}
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={`${translate({ en: "Your latest expense entries for", pt: "Suas últimas entradas de despesa para" })} ${displayedMonthYearLabel}`}
            transactions={recentExpensesToDisplay}
            allUserCategories={userCategories}
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

    