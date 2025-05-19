
'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, PaymentMethodName, DisplayPaymentMethod, CategoryName } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch, Unsubscribe } from "firebase/firestore";
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

  const [transactions, setTransactions] = useState<Transaction[]>([]);
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
      console.log("DashboardPage: TRACER --- cleanupListener: Unsubscribing " + type + " for UserID:", currentUserIdForCleanup || "N/A");
      listenerRef.current();
      listenerRef.current = null;
    }
  }, []);


  useEffect(() => {
    console.log("DashboardPage: TRACER --- isClient useEffect running");
    setIsClient(true);
    effectMountedRef.current = true;
    return () => {
      console.log("DashboardPage: TRACER --- isClient useEffect UNMOUNTING");
      effectMountedRef.current = false;
      const currentInitiatedUser = mainFetchInitiatedForUser.current;
      console.log("DashboardPage: TRACER --- Main data fetching useEffect FULL CLEANUP (from isClient unmount) for UserID:", currentInitiatedUser);
      cleanupListener(unsubscribeTransactionsRef, "transactions", currentInitiatedUser);
      cleanupListener(unsubscribePreferencesRef, "preferences", currentInitiatedUser);
    };
  }, [cleanupListener]);


  // Effect for User Preferences
  useEffect(() => {
    console.log("DashboardPage: TRACER --- Preferences useEffect START. UserID: " + userId + ", AuthLoading: " + authLoading + ", isClient: " + isClient);
    if (!isClient || authLoading || !userId) {
      if (effectMountedRef.current) {
        const allPredefinedCategories: DisplayCategory[] = [...CATEGORIES];
        const allPredefinedPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        
        setUserCategories(allPredefinedCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(allPredefinedPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Preferences useEffect: No user/auth/client, setting defaults. isLoadingPreferences set to false.");
      }
      cleanupListener(unsubscribePreferencesRef, "preferences (no user/auth/client)", userId);
      return;
    }

    if (effectMountedRef.current) setIsLoadingPreferences(true);
    console.log("DashboardPage: TRACER --- Preferences useEffect: Setting up REAL-TIME listener for UserID:", userId);
    const preferencesDocRef = doc(db, 'users', userId, 'preferences/userPreferences');
    
    cleanupListener(unsubscribePreferencesRef, "preferences (before new listener)", userId); 

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences snapshot: Effect unmounted for UserID:", userId);
        return;
      }
      console.log("DashboardPage: TRACER --- Preferences snapshot received for UserID:", userId, "Exists:", docSnap.exists());
      
      let finalCategories: DisplayCategory[] = [];
      let finalPaymentMethods: DisplayPaymentMethod[] = [];

      const predefinedCategories: DisplayCategory[] = [...CATEGORIES]; 
      const predefinedPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        const userDefinedCategoriesFromPrefs: CustomCategoryData[] = prefsData.userDefinedCategories || [];
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        
        const customCategoriesMap = new Map<string, CustomCategoryData>();
        userDefinedCategoriesFromPrefs.forEach(cc => customCategoriesMap.set(cc.name.toLowerCase(), cc));

        finalCategories = predefinedCategories
          .filter(pCat => !deselectedPredefinedCatNames.has(pCat.name.toLowerCase()))
          .map(pCat => {
            const customOverride = customCategoriesMap.get(pCat.name.toLowerCase());
            if (customOverride) {
              customCategoriesMap.delete(pCat.name.toLowerCase());
              return { ...pCat, ...customOverride }; 
            }
            return pCat;
          });
        
        customCategoriesMap.forEach(customCat => { 
          if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
            finalCategories.push(customCat);
          }
        });
        
        const userDefinedPaymentMethodsFromPrefs: CustomPaymentMethodData[] = prefsData.userDefinedPaymentMethods || [];
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        const customPaymentMethodsMap = new Map<string, CustomPaymentMethodData>();
        userDefinedPaymentMethodsFromPrefs.forEach(cpm => customPaymentMethodsMap.set(cpm.name.toLowerCase(), cpm));
        
        finalPaymentMethods = predefinedPaymentMethods
         .filter(pPm => !deselectedPredefinedPmNames.has(pPm.name.toLowerCase()))
         .map(pPm => {
            const customOverride = customPaymentMethodsMap.get(pPm.name.toLowerCase());
            if (customOverride) {
              customPaymentMethodsMap.delete(pPm.name.toLowerCase());
              return { ...pPm, ...customOverride }; 
            }
            return pPm;
          });
        
        customPaymentMethodsMap.forEach(customPm => {
          if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customPm.name.toLowerCase())) {
            finalPaymentMethods.push(customPm);
          }
        });

      } else { 
        console.log("DashboardPage: TRACER --- Preferences snapshot: No preferences doc found for UserID:", userId, "Using all predefined.");
        finalCategories = [...predefinedCategories];
        finalPaymentMethods = [...predefinedPaymentMethods];
      }
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items");
      }
    }, (error) => {
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: TRACER --- Error listening to user preferences for UserID:", userId, error);
      toast({ title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }), description: translate({en: "Could not load your settings.", pt: "Não foi possível carregar suas configurações."}), variant: "destructive" });
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)))); 
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)))); 
        setIsLoadingPreferences(false);
      }
    });
    return () => cleanupListener(unsubscribePreferencesRef, "preferences", userId);
  }, [userId, isClient, authLoading, language, toast, translate, cleanupListener]);


  // Effect for Transactions
  useEffect(() => {
    console.log("DashboardPage: TRACER --- Main data fetching useEffect START. UserID: " + userId + ", AuthLoading: " + authLoading + ", isClient: " + isClient + ", InitiatedFor: " + mainFetchInitiatedForUser.current);
    
    if (!isClient) {
      console.log("DashboardPage: TRACER --- Main useEffect: Not client yet, waiting.");
      return;
    }
    if (authLoading) {
      console.log("DashboardPage: TRACER --- Main useEffect: Auth is loading, waiting...");
      return;
    }
    if (!userId) {
      console.log("DashboardPage: TRACER --- Main useEffect: No user ID, redirecting to login. Cleaning up listeners.");
      cleanupListener(unsubscribeTransactionsRef, "transactions (no userId)", userId);
      mainFetchInitiatedForUser.current = null;
      if (effectMountedRef.current) {
        setTransactions([]);
        setIsLoadingTransactions(false);
      }
      router.push('/login');
      return;
    }

    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeTransactionsRef.current) {
      console.log("DashboardPage: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: " + userId + ". PrevInitiatedFor: " + mainFetchInitiatedForUser.current + ". ListenerExisted: " + !!unsubscribeTransactionsRef.current);
      cleanupListener(unsubscribeTransactionsRef, "transactions (stale before new)", userId); 
      mainFetchInitiatedForUser.current = userId; 

      const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
          console.log("DashboardPage: TRACER --- fetchDataInternal: Unmounted before starting.");
          if (effectMountedRef.current) setIsLoadingTransactions(false);
          return;
        }
        console.log("DashboardPage: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", currentUserId);
        if (effectMountedRef.current) setIsLoadingTransactions(true);
        console.log("DashboardPage: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

        try {
          const userDocRef = doc(db, "users", currentUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (!effectMountedRef.current) {
            console.log("DashboardPage: TRACER --- fetchDataInternal: Unmounted during userDoc fetch.");
             if (effectMountedRef.current) setIsLoadingTransactions(false);
            return;
          }

          if (!userDocSnap.exists()) {
            if (effectMountedRef.current) {
              setIsLoadingTransactions(false);
              console.log("DashboardPage: TRACER --- fetchDataInternal: User document not found for UserID:", currentUserId, ". Redirecting to onboarding.");
              router.push('/onboarding'); 
            }
            return;
          }
          if (!userDocSnap.data()?.onboardingComplete) {
            if (effectMountedRef.current) {
              setIsLoadingTransactions(false);
              console.log("DashboardPage: TRACER --- fetchDataInternal: User onboarding incomplete for UserID:", currentUserId, ". Redirecting to onboarding.");
              router.push('/onboarding');
            }
            return;
          }
          
          console.log("DashboardPage: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener.");
          const transactionsColRef = collection(db, 'users', currentUserId, 'transactions');
          const q_transactions = query(transactionsColRef);
          
          if (unsubscribeTransactionsRef.current) { 
            console.log("DashboardPage: TRACER --- fetchDataInternal: Stale snapshot ref found before new onSnapshot. Cleaning up again.");
            unsubscribeTransactionsRef.current();
            unsubscribeTransactionsRef.current = null;
          }

          unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
            if (!effectMountedRef.current) {
              console.log("DashboardPage: TRACER --- onSnapshot: Effect unmounted for UserID:", currentUserId);
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
                    if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) { dateString = data.date; } 
                    else if (data.date.includes('T')) { 
                        try { 
                            dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); 
                        } catch (e1){ 
                          try { 
                              dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                          } catch(e2) { 
                              console.warn("DashboardPage TX Date Parse (string T): Failed for tx " + docSnap.id + ":", data.date, e2);
                              dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                          }
                        }
                    } else { 
                         console.warn("DashboardPage TX Date Parse (string other): Unhandled format for tx " + String(docSnap.id) + ": " + String(data.date) + ". Attempting general parse.");
                         try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");}
                         catch(e) {
                             console.warn("DashboardPage TX Date Parse (string other general): Failed for tx " + String(docSnap.id) + ": " + String(data.date) + ". Error: " + String(e) + ". Fallback to current date.");
                             dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                         }
                    }
                } else { 
                   console.warn("DashboardPage TX Date Parse (missing/invalid): Missing or invalid date for tx " + String(docSnap.id) + ":", data.date, "Fallback to current date.");
                   dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                }
              }

              if (!effectiveMonthString && dateString !== "1970-01-01") {
                try {
                  effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                } catch (e) {
                  console.warn("DashboardPage TX effectiveMonth Derivation: Failed for tx " + docSnap.id + " from date " + dateString + ". Error: " + String(e) + ". Fallback to current month.");
                  effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                }
              } else if (!effectiveMonthString) { 
                effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
              } else if (effectiveMonthString && !/^\d{4}-\d{2}$/.test(effectiveMonthString)) { 
                  console.warn("DashboardPage TX effectiveMonth Format: Invalid format for tx " + docSnap.id + ": " + String(effectiveMonthString) + ". Deriving from date.");
                  try {
                    effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                  } catch(e) {
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
                  installments: data.installments
              } as Transaction;
            });
            if (effectMountedRef.current) {
              console.log("DashboardPage: TRACER --- onSnapshot: Setting", fetchedTransactions.length, "transactions for UserID:", currentUserId);
              setTransactions(fetchedTransactions);
              console.log("DashboardPage: TRACER --- setIsLoadingTransactions(false) after processing snapshot data for UserID:", currentUserId);
              setIsLoadingTransactions(false);
            }
          }, (error: any) => {
            if (!effectMountedRef.current) return;
            console.error("DashboardPage: TRACER --- Transaction onSnapshot: Error listening for UserID:", currentUserId, error);
            toast({ title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }), description: translate({en: "Could not load transactions.", pt: "Não foi possível carregar as transações."}), variant: "destructive" });
            if (effectMountedRef.current) {
              setTransactions([]);
              setIsLoadingTransactions(false);
              console.log("DashboardPage: TRACER --- Transactions snapshot ERROR: isLoadingTransactions set to false.");
            }
          });
        } catch (error) {
          if (!effectMountedRef.current) return;
          console.error("DashboardPage: TRACER --- fetchDataInternal: Error for UserID:", currentUserId, error);
          toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({en: "An error occurred loading data.", pt: "Ocorreu um erro ao carregar os dados."}), variant: "destructive" });
          if (effectMountedRef.current) {
            setTransactions([]);
            setIsLoadingTransactions(false); 
            console.log("DashboardPage: TRACER --- fetchDataInternal CATCH: isLoadingTransactions set to false.");
          }
        }
      };
      
      fetchDataInternal(userId);
    } else {
      console.log("DashboardPage: TRACER --- Main useEffect: Data already initiated or listener exists for UserID: " + userId + ". PrevInitiatedFor: " + mainFetchInitiatedForUser.current + ". ListenerExisted: " + !!unsubscribeTransactionsRef.current);
      if (effectMountedRef.current && !authLoading && userId) {
        setIsLoadingTransactions(false); 
      }
    }
  }, [userId, authLoading, isClient, router, toast, translate, cleanupListener]);


  const loadBudgets = useCallback(async () => {
    if (!effectMountedRef.current || !userId || !isClient || authLoading ) {
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false);
      }
      return;
    }
    
    if(effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log('DashboardPage: TRACER --- Loading budgets for user ' + userId + ', month: ' + budgetMonthKey);
    const budgetDocRef = doc(db, 'users', userId, 'budgets', budgetMonthKey);
    
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) { 
        if (effectMountedRef.current) setIsLoadingBudgets(false);
        return; 
      }
      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, any>;
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
      console.error("DashboardPage: TRACER --- LoadBudgets: Error loading budgets for UserID:", userId, "Month:", budgetMonthKey, error);
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({en: "Could not load your budget data for this month.", pt: "Não foi possível carregar seus dados de orçamento para este mês."}), variant: "destructive" });
      if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
    } finally {
      if (effectMountedRef.current) {
        setIsLoadingBudgets(false);
      }
    }
  }, [userId, isClient, authLoading, displayedDate, toast, translate]); 

  useEffect(() => {
    console.log("DashboardPage: TRACER --- Budgets useEffect START. UserID: " + userId + ", AuthLoading: " + authLoading + ", isClient: " + isClient + ", DisplayedDate: " + displayedDate.toISOString());
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
    
    console.log("DashboardPage: TRACER --- onAddTransaction: Full newTransactionData received from form:", newTransactionData);
    const effectiveMonthForNewTx = formatDateFns(displayedDate, "yyyy-MM");
    console.log("DashboardPage: TRACER --- onAddTransaction: Using effectiveMonth based on displayedDate:", effectiveMonthForNewTx);
    console.log("DashboardPage: TRACER --- onAddTransaction: Transaction date selected in form:", newTransactionData.date);


    const fullPayload = {
      ...newTransactionData,
      userId: userId,
      createdAt: serverTimestamp(),
      effectiveMonth: effectiveMonthForNewTx,
    };

    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;
    
    if (dataToSave.type === 'expense' && dataToSave.isRecurring === undefined && dataToSave.expenseType !== 'recurring' && dataToSave.expenseType !== 'installment') {
        dataToSave.isRecurring = false;
    } else if (dataToSave.type === 'income' && dataToSave.isRecurring === undefined) {
        dataToSave.isRecurring = false;
    }
    if (dataToSave.type !== 'expense') {
      delete dataToSave.expenseType;
      delete dataToSave.installments;
      delete dataToSave.expenseNature;
    }
    
    console.log("DashboardPage: TRACER --- onAddTransaction: Saving to Firestore. Actual Date:", newTransactionData.date, "Effective Month:", effectiveMonthForNewTx, "Full dataToSave:", dataToSave);

    try {
      const transactionsColRef = collection(db, 'users', userId, 'transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: newTransactionData.description + " " + translate({en:"added.", pt:"adicionada."})});
    } catch (error: any) {
      console.error("DashboardPage: TRACER --- onAddTransaction: Error adding transaction for UserID:", userId, error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({en:"Could not save your transaction.", pt: "Não foi possível salvar sua transação."})), variant: "destructive" });
    }
  }, [userId, displayedDate, toast, translate]);


  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); // 0-indexed

    console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: Recalculating for Year:", targetYear, "Month:", targetMonth, "(0-indexed for", displayedMonthYearLabel, "), TargetEffMonth:", targetEffectiveMonth, "All transactions count:", transactions.length);
    
    if (transactions.length === 0) {
      console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
      return [];
    }
        
    const filtered: Transaction[] = [];
    transactions.forEach(t => {
      let includeTransaction = false;
      let reason = "";
      let originalTransactionDate: Date;

      try {
        originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
      } catch (e) {
        console.warn("DashboardPage TX Filter: Could not parse t.date '" + String(t.date) + "' for tx ID " + String(t.id) + ". Error:", e);
        return; 
      }
      
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        reason = "Installment Check";
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        const isInstallmentActiveThisMonth = monthDiff >= 0 && monthDiff < t.installments;

        if (isInstallmentActiveThisMonth) includeTransaction = true;

      } else if (t.isRecurring === true && t.expenseType !== 'installment') { 
        reason = "Recurring Check";
        const originalTransactionYear = getYearFns(originalTransactionDate);
        const originalTransactionMonth = getMonthFns(originalTransactionDate);
        const isRecurringActiveThisMonth = originalTransactionYear < targetYear || (originalTransactionYear === targetYear && originalTransactionMonth <= targetMonth);
        
        if (isRecurringActiveThisMonth) includeTransaction = true;

      } else if ((!t.isRecurring || t.isRecurring === false) && t.expenseType !== 'installment') { 
        reason = "Non-Recurring Check";
        if (t.effectiveMonth === targetEffectiveMonth) {
          includeTransaction = true;
        }
      }
      console.log("DashboardPage: TRACER --- Tx Filter: ID:", t.id, "Date:", t.date, "EffMonth:", t.effectiveMonth, "Type:", t.type, "ExpType:", t.expenseType, "isRec:", t.isRecurring, "Inst:", t.installments, "Amount:", t.amount, "Included:", includeTransaction, "Reason:", reason, "Target:", targetEffectiveMonth);
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: Found " + filtered.length + " transactions for the period.");
    return filtered;
  }, [transactions, displayedDate, displayedMonthYearLabel]); 


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
    console.log("DashboardPage: TRACER --- recentIncome: Calculating for " + displayedMonthYearLabel + ". Total transactions: " + transactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'income') {
        if (t.isRecurring) {
          try {
            const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
            if (startOfMonth(originalTransactionDate) <= firstDayOfDisplayedMonth) {
              const projectedDateDay = getDateFns(originalTransactionDate);
              let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
              const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
              if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                   projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
              }
              console.log("DashboardPage: TRACER --- recentIncome: Added projected recurring:", t.description, "Date:", formatDateFns(projectedDate, "yyyy-MM-dd"));
              monthlyDisplayTransactions.push({ ...t, date: formatDateFns(projectedDate, "yyyy-MM-dd"), effectiveMonth: targetEffectiveMonth, id: t.id + "_proj_" + targetEffectiveMonth });
            }
          } catch (e) {
            console.warn("DashboardPage: TRACER --- recentIncome: Failed to parse date for recurring income tx " + t.id + ": " + t.date, e);
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) { 
          console.log("DashboardPage: TRACER --- recentIncome: Added non-recurring:", t.description, "Date:", t.date);
          monthlyDisplayTransactions.push(t);
        }
      }
    });
    console.log("DashboardPage: TRACER --- recentIncome: Found " + monthlyDisplayTransactions.length + " items for display.");
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [transactions, displayedDate, displayedMonthYearLabel]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0,5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    console.log("DashboardPage: TRACER --- recentExpenses: Calculating for " + displayedMonthYearLabel + ". Total transactions: " + transactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'expense') {
        try {
          if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
            const originalInstallmentStartDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
            const monthDiff = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(originalInstallmentStartDate));
            const currentInstallmentNum = monthDiff + 1;

            if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
              const projectedDateDay = getDateFns(originalInstallmentStartDate);
              let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
              const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
               if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                   projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
              }
              const installmentDescription = t.description + " (" + translate({en: "Installment", pt: "Parcela"}) + ") " + currentInstallmentNum + "/" + t.installments;
              console.log("DashboardPage: TRACER --- recentExpenses: Added projected installment:", installmentDescription, "Date:", formatDateFns(projectedDate, "yyyy-MM-dd"));
              monthlyDisplayTransactions.push({ ...t, date: formatDateFns(projectedDate, "yyyy-MM-dd"), effectiveMonth: targetEffectiveMonth, description: installmentDescription, id: t.id + "_inst_" + currentInstallmentNum + "_" + targetEffectiveMonth });
            }
          } else if (t.isRecurring && t.expenseType !== 'installment') { 
            const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
            if (startOfMonth(originalTransactionDate) <= firstDayOfDisplayedMonth) {
              const projectedDateDay = getDateFns(originalTransactionDate);
              let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
              const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
              if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                   projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
              }
              console.log("DashboardPage: TRACER --- recentExpenses: Added projected recurring:", t.description, "Date:", formatDateFns(projectedDate, "yyyy-MM-dd"));
              monthlyDisplayTransactions.push({ ...t, date: formatDateFns(projectedDate, "yyyy-MM-dd"), effectiveMonth: targetEffectiveMonth, id: t.id + "_proj_" + targetEffectiveMonth });
            }
          } else if ((!t.isRecurring || t.isRecurring === false) && t.expenseType !== 'installment') { 
             if (t.effectiveMonth === targetEffectiveMonth) {
              console.log("DashboardPage: TRACER --- recentExpenses: Added non-recurring:", t.description, "Date:", t.date);
              monthlyDisplayTransactions.push(t);
            }
          }
        } catch (e) {
           console.warn("DashboardPage: TRACER --- recentExpenses: Failed to process date for expense tx " + t.id + ": " + t.date, e);
        }
      }
    });
    console.log("DashboardPage: TRACER --- recentExpenses: Found " + monthlyDisplayTransactions.length + " items for display.");
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [transactions, displayedDate, translate, displayedMonthYearLabel]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);

  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;
  console.log("DashboardPage: TRACER --- Rendering. overallLoading: " + overallLoading + ". isClient: " + isClient + ", authLoading: " + authLoading + ", isLoadingTransactions: " + isLoadingTransactions + ", isLoadingPreferences: " + isLoadingPreferences + ", isLoadingBudgets: " + isLoadingBudgets);

  if (overallLoading) {
    console.log("DashboardPage: TRACER --- RENDERING LOADING SCREEN.");
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full p-4">
          <div className="space-y-4 w-full">
            <Skeleton className="h-10 w-1/3 mb-4" /> 
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={"summary-skel-" + i} className="h-24 w-full" />)}
            </div>
             <Card className="shadow-lg bg-background dark:bg-card">
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <div className="flex-grow">
                   <div className="text-xl font-medium leading-none tracking-tight text-foreground">
                    <Skeleton className="h-6 w-1/2 mb-2"/>
                   </div>
                   <CardDescription className="mt-1">
                     <Skeleton className="h-4 w-3/4"/>
                   </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={"spending-sum-skel-" + i} className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                       <div className="text-sm font-medium text-foreground mb-1"> {/* Changed from p to div */}
                         <Skeleton className="h-5 w-3/5 mb-2"/>
                       </div>
                       <div className="flex items-center gap-2 mt-1">
                         <Skeleton className="h-7 w-7 rounded-full"/>
                         <span className="font-semibold text-lg text-foreground break-words">
                           <Skeleton className="h-5 w-4/5 mb-1"/>
                         </span>
                       </div>
                       <p className="text-xl font-bold text-primary mt-1">
                         <Skeleton className="h-7 w-2/5"/>
                       </p>
                     </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md bg-muted/50">
                <CardHeader><Skeleton className="h-6 w-1/4"/></CardHeader>
                <CardContent><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div></CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-60 w-full" />
              <Skeleton className="h-60 w-full" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  console.log("DashboardPage TRACER --- RENDERING DASHBOARD CONTENT. Transactions:", transactions.length, "isLoadingTransactions:", isLoadingTransactions, "Displayed Period Transactions:", transactionsForDisplayedPeriod.length);
  console.log("DashboardPage TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary, "largestExpenseCat:", largestExpenseCategoryForDisplayedPeriod?.name, "totalFixed:", totalFixedExpensesForDisplayedPeriod, "totalVariable:", totalVariableExpensesForDisplayedPeriod);


  return (
    <AppLayout>
      <div className="space-y-8">
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod}
          monthlyBudget={totalCalculatedMonthlyBudget}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />
         <Card className="shadow-lg bg-background dark:bg-card">
           <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <div className="flex-grow">
              <div className="text-xl font-medium leading-none tracking-tight text-foreground">
                {translate({ en: "Spending Summary", pt: "Resumo de Gastos" })}
              </div>
              <CardDescription className="mt-1">
                {translate({ en: "Your spending breakdown for", pt: "Seu detalhamento de gastos em" })} {displayedMonthYearLabel}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
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
                  <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Total", pt: "Total de Gastos"})}</p>
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
                  <p className="text-sm font-medium text-foreground mb-1">{translate({en: "Total", pt: "Total de Gastos"})}</p>
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
    
