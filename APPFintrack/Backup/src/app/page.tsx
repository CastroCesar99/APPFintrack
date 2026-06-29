
'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, CustomPaymentMethodData, DisplayPaymentMethod, CategoryName, PaymentMethodName } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, type Unsubscribe } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { Package, Wallet, TrendingUp, TrendingDown, DollarSign, ListChecks } from "lucide-react"; 
import { CategoryIcon } from "@/components/icons";
import { useDateNavigation } from '@/context/date-navigation-context';
import { useLanguage } from '@/context/language-context';
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

  console.log("DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection:", displayedDate.toISOString());

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  
  const [userCategories, setUserCategories] = useState<DisplayCategory[]>([]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  
  const [loadedBudgetsForMonth, setLoadedBudgetsForMonth] = useState<Record<string, number> | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);
  
  const [isClient, setIsClient] = useState(false);
  const effectMountedRef = useRef(true); 
  const unsubscribeTransactionsRef = useRef<Unsubscribe | null>(null);
  const unsubscribePreferencesRef = useRef<Unsubscribe | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);


  const cleanupListener = useCallback((listenerRef: React.MutableRefObject<Unsubscribe | null>, type: string, currentUserIdForCleanup?: string | null) => {
    if (listenerRef.current && typeof listenerRef.current === 'function') {
      console.log(`DashboardPage: TRACER --- cleanupListener: Unsubscribing ${type} for UserID:`, currentUserIdForCleanup || "N/A");
      listenerRef.current();
      listenerRef.current = null;
    }
  }, []);

  useEffect(() => {
    console.log("DashboardPage: TRACER --- isClient useEffect running");
    setIsClient(true);
    effectMountedRef.current = true; 
    
    return () => {
      console.log("DashboardPage: TRACER --- isClient useEffect UNMOUNTING / Component Unmounting");
      effectMountedRef.current = false; 
      const currentInitiatedUser = mainFetchInitiatedForUser.current;
      console.log("DashboardPage: TRACER --- Component UNMOUNT: Cleaning up ALL listeners for UserID:", currentInitiatedUser);
      cleanupListener(unsubscribeTransactionsRef, "transactions", currentInitiatedUser);
      cleanupListener(unsubscribePreferencesRef, "preferences", currentInitiatedUser);
    };
  }, [cleanupListener]); 


  // Listener for User Preferences
  useEffect(() => {
    if (!userId || !isClient || authLoading) {
      if (effectMountedRef.current) {
        const defaultCats: DisplayCategory[] = [...CATEGORIES];
        const defaultPms: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        setUserCategories(defaultCats.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(defaultPms.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        setIsLoadingPreferences(false);
      }
      cleanupListener(unsubscribePreferencesRef, "preferences (no user/auth/client)", userId);
      return;
    }

    if (effectMountedRef.current) setIsLoadingPreferences(true);
    console.log("DashboardPage: TRACER --- Setting up preferences listener for UserID:", userId);
    const preferencesDocRef = doc(db, 'users', userId, 'preferences/userPreferences');
    
    cleanupListener(unsubscribePreferencesRef, "preferences (before new listener)", userId);

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences onSnapshot: Component unmounted for UserID:", userId);
        return;
      }
      console.log("DashboardPage: TRACER --- Preferences onSnapshot: Received data for UserID:", userId);
      
      let finalCategories: DisplayCategory[] = [...CATEGORIES]; // Start with all predefined
      let finalPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS]; // Start with all predefined

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        const userDefinedCategoriesFromPrefs: CustomCategoryData[] = prefsData.userDefinedCategories || [];
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        
        // Filter out deselected predefined categories
        finalCategories = finalCategories.filter(
          predefCat => !deselectedPredefinedCatNames.has(predefCat.name.toLowerCase())
        );

        // Merge/override with user-defined categories
        const customCategoriesMap = new Map<string, CustomCategoryData>();
        userDefinedCategoriesFromPrefs.forEach(udc => customCategoriesMap.set(udc.name.toLowerCase(), udc));

        finalCategories = finalCategories.map(predefCat => {
          const customOverride = customCategoriesMap.get(predefCat.name.toLowerCase());
          if (customOverride) {
            customCategoriesMap.delete(predefCat.name.toLowerCase()); 
            return { ...predefCat, ...customOverride }; 
          }
          return predefCat;
        });
        customCategoriesMap.forEach(customCat => finalCategories.push(customCat));


        const userDefinedPaymentMethodsFromPrefs: CustomPaymentMethodData[] = prefsData.userDefinedPaymentMethods || [];
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));

        finalPaymentMethods = finalPaymentMethods.filter(
          predefPm => !deselectedPredefinedPmNames.has(predefPm.name.toLowerCase())
        );
        const customPmMap = new Map<string, CustomPaymentMethodData>();
        userDefinedPaymentMethodsFromPrefs.forEach(udpm => customPmMap.set(udpm.name.toLowerCase(), udpm));
        
        finalPaymentMethods = finalPaymentMethods.map(predefPm => {
            const customOverride = customPmMap.get(predefPm.name.toLowerCase());
            if (customOverride) {
                customPmMap.delete(predefPm.name.toLowerCase());
                return { ...predefPm, ...customOverride };
            }
            return predefPm;
        });
        customPmMap.forEach(customPm => finalPaymentMethods.push(customPm));

      } else {
         console.log("DashboardPage: TRACER --- Preferences onSnapshot: No preferences doc found for UserID:", userId);
      }
      
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Preferences onSnapshot: Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items for UserID:", userId);
      }
    }, (error) => {
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: Error listening to user preferences:", error);
      toast({ title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }), description: translate({en: "Could not load your settings.", pt: "Não foi possível carregar suas configurações."}), variant: "destructive" });
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)))); 
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)))); 
        setIsLoadingPreferences(false);
      }
    });

    return () => cleanupListener(unsubscribePreferencesRef, "preferences (cleanup)", userId);
  }, [userId, isClient, authLoading, language, toast, translate, cleanupListener]);


  useEffect(() => {
    console.log(`DashboardPage: TRACER --- Main data fetching useEffect START. UserID: ${userId}, AuthLoading: ${authLoading}, isClient: ${isClient}, InitiatedFor: ${mainFetchInitiatedForUser.current}`);
    
    if (!isClient) {
      console.log("DashboardPage: TRACER --- Main useEffect: Not client yet, waiting.");
      return;
    }
    if (authLoading) {
      console.log("DashboardPage: TRACER --- Main useEffect: Auth is loading, waiting...");
      if(effectMountedRef.current) setIsLoadingTransactions(true); 
      return;
    }
    if (!userId) {
      console.log("DashboardPage: TRACER --- Main useEffect: No user ID, redirecting to login. Cleaning up listeners.");
      cleanupListener(unsubscribeTransactionsRef, "transactions (no userId)", userId);
      mainFetchInitiatedForUser.current = null;
      if (effectMountedRef.current) {
        setAllTransactions([]);
        setIsLoadingTransactions(false); 
      }
      router.push('/login');
      return;
    }

    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeTransactionsRef.current) {
      console.log(`DashboardPage: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: ${userId}. PrevInitiatedFor: ${mainFetchInitiatedForUser.current}. ListenerExisted: ${!!unsubscribeTransactionsRef.current}`);
      cleanupListener(unsubscribeTransactionsRef, "transactions (stale before new)", mainFetchInitiatedForUser.current); 
      mainFetchInitiatedForUser.current = userId; 

      const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
          if (effectMountedRef.current) setIsLoadingTransactions(false);
          return;
        }
        if (effectMountedRef.current) setIsLoadingTransactions(true);
        console.log("DashboardPage: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", currentUserId);
        console.log("DashboardPage: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

        try {
          const userDocRef = doc(db, "users", currentUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (!effectMountedRef.current) {
            if (effectMountedRef.current) setIsLoadingTransactions(false);
            return;
          }

          if (!userDocSnap.exists()) {
            if (effectMountedRef.current) {
              setIsLoadingTransactions(false);
              router.push('/onboarding'); 
            }
            return;
          }
          if (!userDocSnap.data()?.onboardingComplete) {
            if (effectMountedRef.current) {
              setIsLoadingTransactions(false);
              router.push('/onboarding');
            }
            return;
          }
          
          console.log("DashboardPage: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener.");
          const transactionsColRef = collection(db, 'users', currentUserId, 'transactions');
          const q_transactions = query(transactionsColRef); 
          
          if (unsubscribeTransactionsRef.current) { 
            console.log("DashboardPage: TRACER --- fetchDataInternal: Stale snapshot ref found before new onSnapshot. Cleaning up again for UserID:", currentUserId);
            unsubscribeTransactionsRef.current();
            unsubscribeTransactionsRef.current = null;
          }

          unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
            if (!effectMountedRef.current) {
              console.log("DashboardPage: TRACER --- Transaction onSnapshot: Component unmounted for UserID:", currentUserId);
              return;
            }
            console.log("DashboardPage: TRACER --- onSnapshot: Received data for UserID:", currentUserId, "Empty:", querySnapshot.empty, "PendingWrites:", querySnapshot.metadata.hasPendingWrites);
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
                        try { 
                            dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); 
                        } catch (e1){ 
                          try { 
                              dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                          } catch(e2) { 
                              console.warn("DashboardPage TX Date Parse (string T for " + docSnap.id + "): Failed for date '" + String(data.date) + "'. Error: " + String(e2) + ". Fallback to current date.");
                              dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                          }
                        }
                    } else { 
                         console.warn("DashboardPage TX Date Parse (string other for " + docSnap.id + "): Unhandled format: '" + String(data.date) + "'. Attempting general parse.");
                         try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");}
                         catch(e) {
                             console.warn("DashboardPage TX Date Parse (string other general for " + docSnap.id + "): Failed for date '" + String(data.date) + "'. Error: " + String(e) + ". Fallback to current date.");
                             dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                         }
                    }
                } else { 
                   console.warn("DashboardPage TX Date Parse (missing/invalid for " + docSnap.id + "): Date was '" + String(data.date) + "'. Fallback to current date.");
                   dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                }
              } else {
                 console.warn("DashboardPage TX Date Parse (missing for " + docSnap.id + "). Fallback to current date.");
                 dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }

              if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
                 if (dateString && dateString !== "1970-01-01") {
                    try {
                        effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                    } catch (e) {
                        console.warn('DashboardPage TX effectiveMonth Derivation: Failed for tx ' + docSnap.id + ' from date ' + dateString + '. Error: ' + String(e) + '. Fallback to current month.');
                        effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                    }
                 } else {
                    console.warn('DashboardPage TX effectiveMonth Derivation: Date string invalid or missing for tx ' + docSnap.id + '. Fallback to current month.');
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
              setAllTransactions(fetchedTransactions);
              console.log("DashboardPage: TRACER --- onSnapshot: Setting", fetchedTransactions.length, "transactions for UserID:", currentUserId);
              setIsLoadingTransactions(false);
              console.log("DashboardPage: TRACER --- setIsLoadingTransactions(false) after processing snapshot data for UserID:", currentUserId);
            }
          }, (error: any) => {
            if (!effectMountedRef.current) return;
            console.error("DashboardPage: TRACER --- Transaction onSnapshot: Error listening for UserID:", currentUserId, error);
            toast({ title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }), description: translate({en: "Could not load transactions.", pt: "Não foi possível carregar as transações."}), variant: "destructive" });
            if (effectMountedRef.current) {
              setAllTransactions([]);
              setIsLoadingTransactions(false);
            }
          });
        } catch (error) {
          if (!effectMountedRef.current) return;
          console.error("DashboardPage: TRACER --- fetchDataInternal: Error for UserID:", currentUserId, error);
          toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({en: "An error occurred loading data.", pt: "Ocorreu um erro ao carregar os dados."}), variant: "destructive" });
          if (effectMountedRef.current) {
            setAllTransactions([]);
            setIsLoadingTransactions(false); 
          }
        }
      };
      
      fetchDataInternal(userId);
    }
  }, [userId, authLoading, isClient, router, toast, translate, cleanupListener]); 

  const loadBudgets = useCallback(async () => {
    if (!effectMountedRef.current || !userId || !isClient || authLoading ) {
      if (effectMountedRef.current) {
        setLoadedBudgetsForMonth(null); 
        setIsLoadingBudgets(false); 
      }
      return;
    }
    
    if (effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log("DashboardPage: TRACER --- Loading budgets for user", userId, "month:", budgetMonthKey);
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    
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
        if (effectMountedRef.current) {
          setLoadedBudgetsForMonth(validBudgets);
          console.log(`DashboardPage: TRACER --- Budgets loaded for ${budgetMonthKey}:`, validBudgets);
        }
      } else {
        if (effectMountedRef.current) {
          setLoadedBudgetsForMonth({}); 
          console.log(`DashboardPage: TRACER --- No budget document found for ${budgetMonthKey}`);
        }
      }
    } catch (error) {
      if (!effectMountedRef.current) {
         if (effectMountedRef.current) setIsLoadingBudgets(false);
         return;
      }
      console.error("DashboardPage: TRACER --- Error loading budgets for UserID:", userId, "Month:", budgetMonthKey, error);
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({en: "Could not load your budget data for this month.", pt: "Não foi possível carregar seus dados de orçamento para este mês."}), variant: "destructive" });
      if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
    } finally {
      if (effectMountedRef.current) {
        setIsLoadingBudgets(false);
      }
    }
  }, [userId, isClient, authLoading, displayedDate, toast, translate]); 

  useEffect(() => {
    if (userId && isClient && !authLoading) { 
        loadBudgets();
    } else if (effectMountedRef.current) { 
        setLoadedBudgetsForMonth(null); 
        setIsLoadingBudgets(false); 
    }
  }, [userId, isClient, authLoading, displayedDate, loadBudgets]);


  const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    
    const transactionDateString = newTransactionData.date; // This is YYYY-MM-DD from the form
    // IMPORTANT: effectiveMonth is based on the month being VIEWED on the dashboard
    const effectiveMonthForSave = formatDateFns(displayedDate, "yyyy-MM"); 

    console.log("Dashboard: TRACER --- onAddTransaction: Full newTransactionData received from form:", newTransactionData);
    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with actual transaction date:", transactionDateString, "and Effective Month:", effectiveMonthForSave);

    const fullPayload = {
      ...newTransactionData,
      date: transactionDateString, 
      effectiveMonth: effectiveMonthForSave, 
      userId: userId,
      createdAt: serverTimestamp(),
    };
    
    // Filter out undefined properties before saving
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;
    
    if (dataToSave.type === 'expense') {
      dataToSave.isRecurring = dataToSave.expenseType === 'recurring';
    } else {
       dataToSave.isRecurring = dataToSave.isRecurring ?? false;
    }


    try {
      const transactionsColRef = collection(db, 'users', userId, 'transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: newTransactionData.description + " " + translate({en:"added.", pt:"adicionada."})});
    } catch (error: any) {
      console.error("Dashboard: TRACER --- onAddTransaction: Error adding transaction for UserID:", userId, error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({en:"Could not save your transaction.", pt: "Não foi possível salvar sua transação."})), variant: "destructive" });
    }
  }, [userId, displayedDate, toast, translate]); 


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    console.log(`Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year: ${getYearFns(displayedDate)} Month: ${getMonthFns(displayedDate)} (0-indexed for ${displayedMonthYearLabel}), TargetEffMonth: ${targetEffectiveMonth} All transactions count: ${allTransactions.length}`);
     if (allTransactions.length > 0) {
      console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod - Sample of allTransactions:", allTransactions.slice(0,3).map(t => ({id: t.id, date: t.date, effectiveMonth: t.effectiveMonth, type: t.type, isRec: t.isRecurring, expType: t.expenseType, inst: t.installments, amount: t.amount})));
    }


    if (allTransactions.length === 0) {
      console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
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
        console.warn(`DashboardPage: transactionsForDisplayedPeriod - Could not parse t.date '${t.date}' for tx ID ${t.id}. Error:`, e);
        return; 
      }
      
      // Logic for including transactions
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        reason = "Installment Check";
        const installmentSeriesEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0)); // Base off effectiveMonth for start
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, startOfMonth(installmentSeriesEffectiveStartDate));
        const isActive = monthDiff >= 0 && monthDiff < t.installments;
        if (isActive) includeTransaction = true;
        console.log(`Dashboard: TRACER --- Tx Filter (Installment Check): ID: ${t.id}, OrigDate: ${t.date}, EffMonth: ${t.effectiveMonth}, monthDiff: ${monthDiff}, installments: ${t.installments}, isActive: ${isActive}, targetEffMonth: ${targetEffectiveMonth}`);

      } else if (t.isRecurring === true && t.expenseType !== 'installment') { 
        reason = "Recurring Check";
        const recurrenceEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0)); // Base off effectiveMonth
        if (startOfMonth(recurrenceEffectiveStartDate) <= firstDayOfTargetMonth) {
          includeTransaction = true;
        }
         console.log(`Dashboard: TRACER --- Tx Filter (Recurring Check): ID: ${t.id}, OrigDate: ${t.date}, EffMonth: ${t.effectiveMonth}, recEffStart: ${recurrenceEffectiveStartDate.toISOString()}, targetStart: ${firstDayOfTargetMonth.toISOString()}, Included: ${includeTransaction}`);
      } else { // Non-recurring, non-installment
        reason = "Non-Recurring Check";
        if (t.effectiveMonth === targetEffectiveMonth) {
          includeTransaction = true;
        }
        console.log(`Dashboard: TRACER --- Tx Filter (Non-Recurring Check): ID: ${t.id}, OrigDate: ${t.date}, EffMonth: ${t.effectiveMonth}, targetEffMonth: ${targetEffectiveMonth}, Included: ${includeTransaction}`);
      }
      
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log(`DashboardPage: TRACER --- transactionsForDisplayedPeriod: Found ${filtered.length} transactions for the period.`);
    return filtered;
  }, [allTransactions, displayedDate, displayedMonthYearLabel]);


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
                           { name: largestCategoryKey!, type: 'expense', icon: 'CircleHelp', label: { en: largestCategoryKey!, pt: largestCategoryKey! } };
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
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];
    console.log(`Dashboard: TRACER --- recentIncome: Calculating for ${targetEffectiveMonth}. Total transactions: ${allTransactions.length}`);

    allTransactions.forEach(t => {
      if (t.type !== 'income') return;

      if (t.isRecurring) {
        const recurrenceEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        if (startOfMonth(recurrenceEffectiveStartDate) <= firstDayOfDisplayedMonth) {
          try {
            const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
            const projectedDateDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
            
            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
            }
            const projectedDateString = formatDateFns(projectedDate, "yyyy-MM-dd");
            monthlyDisplayTransactions.push({ ...t, date: projectedDateString, id: `${t.id}_proj_${targetEffectiveMonth}` });
            console.log(`Dashboard: TRACER --- recentIncome: Added projected recurring: ${t.description}, OrigDate: ${t.date}, ProjDate: ${projectedDateString}`);
          } catch (e) {
            console.warn(`DashboardPage: TRACER --- recentIncome: Failed to parse date for recurring income tx ${t.id}: ${t.date}`, e);
          }
        }
      } else if (t.effectiveMonth === targetEffectiveMonth) { 
        monthlyDisplayTransactions.push(t);
        console.log(`Dashboard: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}`);
      }
    });
    console.log(`Dashboard: TRACER --- recentIncome: Found ${monthlyDisplayTransactions.length} items before sort.`);
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [allTransactions, displayedDate]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0, 5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];
    console.log(`Dashboard: TRACER --- recentExpenses: Calculating for ${targetEffectiveMonth}. Total transactions: ${allTransactions.length}`);

    allTransactions.forEach(t => {
      if (t.type !== 'expense') return;

      try {
        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          const installmentSeriesEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          const monthDiff = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(installmentSeriesEffectiveStartDate));
          const currentInstallmentNum = monthDiff + 1;

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            const installmentDescription = `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`;
            monthlyDisplayTransactions.push({ 
              ...t, 
              date: t.date, // Use original date for installments
              description: installmentDescription, 
              id: `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}` 
            });
            console.log(`Dashboard: TRACER --- recentExpenses: Added projected installment: ${installmentDescription}, OrigDate: ${t.date}`);
          }
        } else if (t.isRecurring && t.expenseType !== 'installment') { 
          const recurrenceEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          if (startOfMonth(recurrenceEffectiveStartDate) <= firstDayOfDisplayedMonth) {
            const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0)); 
            const projectedDateDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
            }
            const projectedDateString = formatDateFns(projectedDate, "yyyy-MM-dd");
            monthlyDisplayTransactions.push({ ...t, date: t.date, id: `${t.id}_proj_${targetEffectiveMonth}` }); // Use original date for display
            console.log(`Dashboard: TRACER --- recentExpenses: Added projected recurring: ${t.description}, OrigDate: ${t.date}, ProjDate: ${projectedDateString}`);
          }
        } else if (t.effectiveMonth === targetEffectiveMonth && t.expenseType !== 'installment' && !t.isRecurring) { 
          monthlyDisplayTransactions.push(t);
          console.log(`Dashboard: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}`);
        }
      } catch (e) {
         console.warn(`DashboardPage: TRACER --- recentExpenses: Failed to process date for expense tx ${t.id}: ${String(t.date)}`, e);
      }
    });
    console.log(`Dashboard: TRACER --- recentExpenses: Found ${monthlyDisplayTransactions.length} items before sort.`);
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [allTransactions, displayedDate, translate]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);

  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;
  
  console.log(`DashboardPage: TRACER --- RENDERING. overallLoading: ${overallLoading}. isClient: ${isClient}, authLoading: ${authLoading}, isLoadingTransactions: ${isLoadingTransactions}, isLoadingPreferences: ${isLoadingPreferences}, isLoadingBudgets: ${isLoadingBudgets}`);
  
  if (overallLoading) {
    console.log("DashboardPage: TRACER --- RENDERING LOADING SCREEN.");
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full p-4">
          <div className="space-y-4 w-full">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={"summary-skel-" + i} className="h-24 w-full rounded-lg" />)}
            </div>
            <Card className="shadow-lg bg-background dark:bg-card rounded-lg">
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 p-4 md:p-6">
                  <div className="flex-grow">
                    <div className="text-xl font-medium leading-none tracking-tight text-foreground">
                      <Skeleton className="h-6 w-1/2 mb-2"/>
                    </div>
                    <CardDescription className="mt-1">
                      <Skeleton className="h-4 w-3/4"/>
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={"spending-sum-skel-" + i} className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                        <div className="text-sm font-medium text-foreground mb-1">
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
                <CardHeader  className="p-4 md:p-6"><Skeleton className="h-6 w-1/4"/></CardHeader>
                <CardContent  className="p-4 md:p-6 pt-0">
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

  console.log("Dashboard: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);

  return (
    <AppLayout>
      <div className="space-y-6">
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod}
          monthlyBudget={totalCalculatedMonthlyBudget}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />
        
        <Card className="shadow-lg bg-background dark:bg-card rounded-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0 p-4 md:p-6">
            <div className="flex-grow">
              <div className="text-xl font-medium leading-none tracking-tight text-foreground">
                {translate({ en: "Spending Summary", pt: "Resumo de Gastos" })}
              </div>
              <CardDescription className="mt-1">
                {translate({ en: "Your spending breakdown for", pt: "Seu detalhamento de gastos em" })} {displayedMonthYearLabel}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            {transactionsForDisplayedPeriod.filter(t => t.type === 'expense').length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                  <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}:
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
                    {translate({ en: "Total", pt: "Total de Gastos"})}
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
                    {translate({ en: "Total", pt: "Total de Gastos"})}
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
            description={translate({ en: "Your latest income entries for", pt: "Suas últimas entradas de receita para" }) + ` ${displayedMonthYearLabel}`}
            transactions={recentIncomeToDisplay}
            allUserCategories={userCategories}
            type="income"
            onSeeMore={() => setShowAllRecentIncome(prev => !prev)}
            isExpanded={showAllRecentIncome}
            totalItemsForMonth={fullRecentIncomeList.length}
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={translate({ en: "Your latest expense entries for", pt: "Suas últimas entradas de despesa para" }) + ` ${displayedMonthYearLabel}`}
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
    

    