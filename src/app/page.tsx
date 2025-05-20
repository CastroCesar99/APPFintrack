
'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, CustomCategoryData, PaymentMethodName, DisplayPaymentMethod, CustomPaymentMethodData, CategoryName } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { Package, Wallet, DollarSign, ListChecks, TrendingDown, TrendingUp } from "lucide-react";
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

  // console.log("DashboardPage TRACER --- About to RENDER. displayedDate for QuickActionsSection:", displayedDate.toISOString());

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  
  const [userCategories, setUserCategories] = useState<DisplayCategory[]>(() => [...CATEGORIES]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>(() => [...PAYMENT_METHODS]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  
  const [loadedBudgetsForMonth, setLoadedBudgetsForMonth] = useState<Record<string, number> | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);
  
  const [isClient, setIsClient] = useState(false);
  const effectMountedRef = useRef(true); 
  const unsubscribeTransactionsRef = useRef<(() => void) | null>(null);
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);


  const cleanupListener = useCallback((listenerRef: React.MutableRefObject<(() => void) | null>, type: string, currentUserIdForCleanup?: string | null) => {
    if (listenerRef.current && typeof listenerRef.current === 'function') {
      console.log(`DashboardPage: TRACER --- cleanupListener: Unsubscribing ${type} for UserID:`, currentUserIdForCleanup || "N/A");
      listenerRef.current();
      listenerRef.current = null;
    } else {
      // console.log(`DashboardPage: TRACER --- cleanupListener: No ${type} listener to unsubscribe or ref not a function for UserID:`, currentUserIdForCleanup || "N/A");
    }
  }, []);

  useEffect(() => {
    // console.log("DashboardPage: TRACER --- isClient useEffect running");
    setIsClient(true);
    effectMountedRef.current = true; 
    
    const currentUserIdForCleanup = mainFetchInitiatedForUser.current; 
    return () => {
      // console.log("DashboardPage: TRACER --- Component UNMOUNT: Cleaning up ALL listeners for UserID:", currentUserIdForCleanup);
      effectMountedRef.current = false; 
      cleanupListener(unsubscribeTransactionsRef, "transactions", currentUserIdForCleanup);
      cleanupListener(unsubscribePreferencesRef, "preferences", currentUserIdForCleanup);
    };
  }, [cleanupListener]); 


  // Listener for User Preferences (Categories and Payment Methods)
  useEffect(() => {
    if (!userId || !isClient || authLoading) {
      if (effectMountedRef.current) {
        const defaultCats: DisplayCategory[] = [...CATEGORIES];
        const defaultPms: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        setUserCategories(defaultCats.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(defaultPms.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        if (isLoadingPreferences) setIsLoadingPreferences(false);
      }
      cleanupListener(unsubscribePreferencesRef, "preferences (no user/auth/client)", userId);
      return;
    }

    if (effectMountedRef.current && !isLoadingPreferences) setIsLoadingPreferences(true);
    // console.log("DashboardPage: TRACER --- Setting up preferences listener for UserID:", userId);
    const preferencesDocRef = doc(db, 'users', userId, 'preferences/userPreferences');
    
    cleanupListener(unsubscribePreferencesRef, "preferences (before new listener)", userId);

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        // console.log("DashboardPage: TRACER --- Preferences onSnapshot: Component unmounted for UserID:", userId);
        return;
      }
      // console.log("DashboardPage: TRACER --- Preferences onSnapshot: Received data for UserID:", userId);
      
      let finalCategories: DisplayCategory[] = []; 
      let finalPaymentMethods: DisplayPaymentMethod[] = []; 

      const predefinedCategoriesArray: DisplayCategory[] = [...CATEGORIES];
      const predefinedPaymentMethodsArray: DisplayPaymentMethod[] = [...PAYMENT_METHODS];

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        
        const userDefinedCategoriesFromPrefs: CustomCategoryData[] = prefsData.userDefinedCategories || [];
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        const customCategoriesMap = new Map<string, CustomCategoryData>();
        userDefinedCategoriesFromPrefs.forEach(cc => customCategoriesMap.set(cc.name.toLowerCase(), cc));

        finalCategories = predefinedCategoriesArray
          .filter(predefCat => !deselectedPredefinedCatNames.has(predefCat.name.toLowerCase()))
          .map(predefCat => {
            const customOverride = customCategoriesMap.get(predefCat.name.toLowerCase());
            if (customOverride) {
              customCategoriesMap.delete(predefCat.name.toLowerCase()); 
              return { ...predefCat, ...customOverride }; 
            }
            return predefCat;
          });
        customCategoriesMap.forEach(customCat => {
          if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
            finalCategories.push(customCat);
          }
        });
        
        const userDefinedPaymentMethodsFromPrefs: CustomPaymentMethodData[] = prefsData.userDefinedPaymentMethods || [];
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        const customPaymentMethodsMap = new Map<string, CustomPaymentMethodData>();
        userDefinedPaymentMethodsFromPrefs.forEach(customPm => customPaymentMethodsMap.set(customPm.name.toLowerCase(), customPm));

        finalPaymentMethods = predefinedPaymentMethodsArray
          .filter(predefPm => !deselectedPredefinedPmNames.has(predefPm.name.toLowerCase()))
          .map(predefPm => {
            const customOverride = customPaymentMethodsMap.get(predefPm.name.toLowerCase());
            if (customOverride) {
              customPaymentMethodsMap.delete(predefPm.name.toLowerCase());
              return { ...predefPm, ...customOverride };
            }
            return predefPm;
          });
        customPaymentMethodsMap.forEach(customPm => {
          if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customPm.name.toLowerCase())) {
            finalPaymentMethods.push(customPm);
          }
        });

      } else { 
        //  console.log("DashboardPage: TRACER --- Preferences onSnapshot: No preferences doc found for UserID:", userId, ". Using all predefined.");
         finalCategories = [...predefinedCategoriesArray];
         finalPaymentMethods = [...predefinedPaymentMethodsArray];
      }
      
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        setIsLoadingPreferences(false);
        // console.log("DashboardPage: TRACER --- Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items for UserID:", userId);
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

    return () => cleanupListener(unsubscribePreferencesRef, "preferences (cleanup)", userId);
  }, [userId, isClient, authLoading, language, toast, translate, cleanupListener]);


  // Main useEffect for fetching transactions and user onboarding status
  useEffect(() => {
    // console.log("DashboardPage TRACER --- Main useEffect START. UserID:", userId, "AuthLoading:", authLoading, "isClient:", isClient, "InitiatedFor:", mainFetchInitiatedForUser.current);
    
    const fullCleanup = () => {
      // console.log("DashboardPage TRACER --- Main useEffect FULL CLEANUP for UserID:", mainFetchInitiatedForUser.current);
      cleanupListener(unsubscribeTransactionsRef, "transactions (full cleanup)", mainFetchInitiatedForUser.current);
      mainFetchInitiatedForUser.current = null;
    };

    if (!isClient) {
      // console.log("DashboardPage: TRACER --- Main useEffect: Not client yet, waiting.");
      return fullCleanup;
    }
    if (authLoading) {
      // console.log("DashboardPage: TRACER --- Main useEffect: Auth is loading, waiting...");
      if (effectMountedRef.current && !isLoadingTransactions) setIsLoadingTransactions(true);
      return fullCleanup;
    }
    if (!userId) {
      // console.log("DashboardPage: TRACER --- Main useEffect: No user ID, redirecting to login. Cleaning up listeners.");
      if (effectMountedRef.current) {
        setTransactions([]);
        if(isLoadingTransactions) setIsLoadingTransactions(false); 
      }
      router.push('/login');
      return fullCleanup;
    }

    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeTransactionsRef.current) {
      // console.log("DashboardPage: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID:", userId, ". PrevInitiatedFor:", mainFetchInitiatedForUser.current, ". ListenerExisted:", !!unsubscribeTransactionsRef.current);
      cleanupListener(unsubscribeTransactionsRef, "transactions (stale before new)", mainFetchInitiatedForUser.current); 
      mainFetchInitiatedForUser.current = userId; 

      const fetchDataInternal = async (currentUserId: string) => {
        if (!effectMountedRef.current) {
          // console.log("DashboardPage: TRACER --- fetchDataInternal: Component unmounted, aborting fetch for UserID:", currentUserId);
          if(effectMountedRef.current) setIsLoadingTransactions(false);
          return;
        }
        if (effectMountedRef.current) setIsLoadingTransactions(true); 
        // console.log("DashboardPage: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", currentUserId);

        try {
          const userDocRef = doc(db, "users", currentUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (!effectMountedRef.current) {
            // console.log("DashboardPage: TRACER --- fetchDataInternal: Component unmounted after getDoc(userDocRef) for UserID:", currentUserId);
             if(effectMountedRef.current) setIsLoadingTransactions(false);
            return;
          }

          if (!userDocSnap.exists() || !userDocSnap.data()?.onboardingComplete) {
            if (effectMountedRef.current) {
              const reason = !userDocSnap.exists() ? "User doc does NOT exist" : "User onboarding NOT complete";
              console.log(`DashboardPage: TRACER --- fetchDataInternal: ${reason} for UserID: ${currentUserId}. Redirecting to /onboarding.`);
              setIsLoadingTransactions(false);
              router.push('/onboarding'); 
            }
            return;
          }
          
          // console.log("DashboardPage: TRACER --- fetchDataInternal: User onboarding complete for UserID:", currentUserId, ". Setting up onSnapshot listener.");
          const transactionsColRef = collection(db, 'users', currentUserId, 'transactions');
          const q_transactions = query(transactionsColRef); 
          
          if (unsubscribeTransactionsRef.current) { 
            // console.log("DashboardPage: TRACER --- fetchDataInternal: Stale snapshot ref found before new onSnapshot. Cleaning up again for UserID:", currentUserId);
            unsubscribeTransactionsRef.current();
            unsubscribeTransactionsRef.current = null;
          }

          unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
            if (!effectMountedRef.current) {
              // console.log("DashboardPage: TRACER --- Transaction onSnapshot: Component unmounted for UserID:", currentUserId);
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
                              console.warn("DashboardPage TX Date Parse (string T general for " + String(docSnap.id) + "): Failed for date '" + String(data.date) + "'. Error: " + String(e2) + ". Fallback to current date.");
                              dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                          }
                        }
                    } else { 
                         console.warn("DashboardPage TX Date Parse (string other for " + String(docSnap.id) + "): Unhandled format: '" + String(data.date) + "'. Attempting general parse.");
                         try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");}
                         catch(e) {
                             console.warn("DashboardPage TX Date Parse (string other general for " + String(docSnap.id) + "): Failed for date '" + String(data.date) + "'. Error: " + String(e) + ". Fallback to current date.");
                             dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                         }
                    }
                } else { 
                   console.warn("DashboardPage TX Date Parse (missing/invalid for " + String(docSnap.id) + "): Date was '" + String(data.date) + "'. Fallback to current date.");
                   dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                }
              } else {
                 console.warn("DashboardPage TX Date Parse (missing for " + String(docSnap.id) + "). Fallback to current date.");
                 dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }

              if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
                 if (dateString && dateString !== "1970-01-01") { 
                    try {
                        effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                    } catch (e) {
                        console.warn("DashboardPage TX effectiveMonth Derivation: Failed for tx " + String(docSnap.id) + " from date " + dateString + ". Error: " + String(e) + ". Fallback to current month.");
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
              setTransactions(fetchedTransactions);
              console.log("DashboardPage: TRACER --- onSnapshot: Setting", fetchedTransactions.length, "transactions for UserID:", currentUserId);
              setIsLoadingTransactions(false);
              // console.log("DashboardPage: TRACER --- setIsLoadingTransactions(false) after processing snapshot data for UserID:", currentUserId);
            }
          }, (error: any) => {
            if (!effectMountedRef.current) {
              // console.log("DashboardPage: TRACER --- Transaction onSnapshot: Error, but component unmounted for UserID:", currentUserId);
              return;
            }
            console.error("DashboardPage: TRACER --- Transaction onSnapshot: Error listening for UserID:", currentUserId, error);
            toast({ title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }), description: translate({en: "Could not load transactions.", pt: "Não foi possível carregar as transações."}), variant: "destructive" });
            if (effectMountedRef.current) {
              setTransactions([]);
              setIsLoadingTransactions(false);
            }
          });
        } catch (error) {
          if (!effectMountedRef.current) {
            // console.log("DashboardPage: TRACER --- fetchDataInternal: Error, but component unmounted for UserID:", currentUserId);
            if(effectMountedRef.current) setIsLoadingTransactions(false); 
            return;
          }
          console.error("DashboardPage: TRACER --- fetchDataInternal: Error for UserID:", currentUserId, error);
          toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({en: "An error occurred loading data.", pt: "Ocorreu um erro ao carregar os dados."}), variant: "destructive" });
          if (effectMountedRef.current) {
            setTransactions([]);
            setIsLoadingTransactions(false); 
          }
        }
      };
      
      fetchDataInternal(userId);
    } else {
        // console.log("DashboardPage: TRACER --- Main useEffect: Fetch NOT initiated for UserID:", userId, "because mainFetchInitiatedForUser.current is", mainFetchInitiatedForUser.current, "and listener ref is", unsubscribeTransactionsRef.current ? "set" : "null");
        if(effectMountedRef.current && isLoadingTransactions) { 
            setIsLoadingTransactions(false); 
            // console.log("DashboardPage: TRACER --- Main useEffect: Ensured isLoadingTransactions is false as fetch was not re-initiated.");
        }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient, router, cleanupListener]); 

  const loadBudgets = useCallback(async () => {
    if (!effectMountedRef.current || !userId || !isClient || authLoading ) {
      if (effectMountedRef.current) {
        setLoadedBudgetsForMonth(null); 
        setIsLoadingBudgets(false); 
      }
      return;
    }
    
    if (effectMountedRef.current) {
      // console.log("Dashboard: TRACER --- setIsLoadingBudgets(true) for loadBudgets call.");
      setIsLoadingBudgets(true);
    }
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    // console.log("Dashboard: TRACER --- Loading budgets for user", userId, "month:", budgetMonthKey);
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) { 
        if(effectMountedRef.current) setIsLoadingBudgets(false);
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
          // console.log("DashboardPage: TRACER --- Budgets loaded for", budgetMonthKey + ":", JSON.stringify(validBudgets));
        }
      } else {
        if (effectMountedRef.current) {
          setLoadedBudgetsForMonth({}); 
          // console.log("DashboardPage: TRACER --- No budget document found for " + budgetMonthKey);
        }
      }
    } catch (error) {
      if (!effectMountedRef.current) {
         if(effectMountedRef.current) setIsLoadingBudgets(false);
         return;
      }
      console.error("Dashboard: TRACER --- Error loading budgets for UserID:", userId, "Month:", budgetMonthKey, error);
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({en: "Could not load your budget data for this month.", pt: "Não foi possível carregar seus dados de orçamento para este mês."}), variant: "destructive" });
      if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
    } finally {
      if (effectMountedRef.current) {
        setIsLoadingBudgets(false);
        // console.log("Dashboard: TRACER --- setIsLoadingBudgets(false) in finally block of loadBudgets.");
      }
    }
  }, [userId, isClient, authLoading, displayedDate, toast, translate]); // Removed effectMountedRef, setIsLoadingBudgets, setLoadedBudgets from deps

  useEffect(() => {
    if (userId && isClient && !authLoading) { 
        loadBudgets();
    } else if (effectMountedRef.current) { 
        setLoadedBudgetsForMonth(null); 
        setIsLoadingBudgets(false); 
        //  console.log("Dashboard: TRACER --- Budget load skipped or reset, setIsLoadingBudgets(false).");
    }
  }, [userId, isClient, authLoading, displayedDate, loadBudgets]);


 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }

    // Date from form (YYYY-MM-DD string)
    const transactionDate = newTransactionData.date; 
    // Effective month is based on the month being VIEWED on the dashboard/page when adding
    const effectiveMonthForSave = formatDateFns(displayedDate, "yyyy-MM");

    console.log("DashboardPage TRACER --- onAddTransaction: Full newTransactionData from form:", JSON.stringify(newTransactionData));
    console.log("DashboardPage TRACER --- onAddTransaction: Saving with transactionDate:", transactionDate, "and effectiveMonthForSave:", effectiveMonthForSave);
    
    const fullPayload = {
      ...newTransactionData,
      date: transactionDate, 
      effectiveMonth: effectiveMonthForSave, 
      userId: userId,
      createdAt: serverTimestamp(),
    };
    
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;
    
    console.log("DashboardPage TRACER --- onAddTransaction: dataToSave for Firestore:", JSON.stringify(dataToSave));

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

    console.log(`DashboardPage: TRACER --- transactionsForDisplayedPeriod: Recalculating. TargetEffMonth: ${targetEffectiveMonth}, All transactions count: ${transactions.length}`);
    
    if (transactions.length === 0) {
      // console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions, returning empty.");
      return [];
    }
    
    const filtered: Transaction[] = [];
    transactions.forEach(t => {
      let includeTransaction = false;
      let reason = "N/A";
      
      try {
        // For financial summaries, the "effectiveMonth" is the primary grouping mechanism for non-recurring items.
        // For recurring and installments, their impact is projected based on their start date (t.date) and the targetEffectiveMonth.
        
        if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
          reason = "Installment Check";
          // The installment series starts based on its `effectiveMonth`
          const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          const monthDiffFromEffectiveStart = differenceInCalendarMonths(firstDayOfTargetMonth, startOfMonth(firstImpactMonthDate));
          const isInstallmentActiveThisMonth = monthDiffFromEffectiveStart >= 0 && monthDiffFromEffectiveStart < t.installments;
          if (isInstallmentActiveThisMonth) includeTransaction = true;

        } else if (t.isRecurring === true && t.expenseType !== 'installment') { 
          reason = "Recurring Check";
           // A recurring transaction's financial impact starts from its `effectiveMonth`
          const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          if (startOfMonth(firstImpactMonthDate) <= firstDayOfTargetMonth) {
            includeTransaction = true;
          }
        } else { // Non-recurring, non-installment
          reason = "Non-Recurring Check";
          if (t.effectiveMonth === targetEffectiveMonth) {
            includeTransaction = true;
          }
        }
        // console.log(`DashboardPage TRACER --- Tx Filter (Summary): ID: ${t.id}, Date: ${t.date}, EffMonth: ${t.effectiveMonth}, Type: ${t.type}, ExpType: ${t.expenseType}, isRec: ${t.isRecurring}, Inst: ${t.installments}, Amount: ${t.amount}, Included: ${includeTransaction}, Reason: ${reason}, Target: ${targetEffectiveMonth}`);
        if (includeTransaction) {
          filtered.push(t);
        }
      } catch (e) {
        console.error(`DashboardPage: TRACER --- Error processing transaction ${t.id} in transactionsForDisplayedPeriod:`, e, t);
      }
    });
    // console.log(`DashboardPage: TRACER --- transactionsForDisplayedPeriod: Found ${filtered.length} transactions for the period.`);
    return filtered;
  }, [transactions, displayedDate]); 


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
    // console.log(`DashboardPage: TRACER --- recentIncome: Calculating for ${targetEffectiveMonth}. Total transactions: ${transactions.length}`);

    transactions.forEach(t => {
      if (t.type !== 'income') return;
      let includeTransaction = false;
      let displayDateForList = t.date; // Default to original transaction date
      
      try {
        if (t.isRecurring) {
          // Recurring items are active if their effectiveMonth is on or before the current displayed month.
          const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          if (startOfMonth(firstImpactMonthDate) <= firstDayOfDisplayedMonth) {
            includeTransaction = true;
            // For display in "Recent" list, project its date to the current displayed month
            const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
            const originalDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, originalDay);
            const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== originalDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(originalDay, getDateFns(lastDayOfCurrentMonth)));
            }
            displayDateForList = formatDateFns(projectedDate, "yyyy-MM-dd");
            // console.log(`DashboardPage: TRACER --- recentIncome: Added projected recurring: ${t.description}, OrigDate: ${t.date}, EffMonth: ${t.effectiveMonth}, ProjDate: ${displayDateForList}, TargetEffMonth: ${targetEffectiveMonth}`);
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) { // Non-recurring
          includeTransaction = true;
          displayDateForList = t.date; // Use its actual date
          // console.log(`DashboardPage: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}, EffMonth: ${t.effectiveMonth}, TargetEffMonth: ${targetEffectiveMonth}`);
        }
        
        if (includeTransaction) {
          monthlyDisplayTransactions.push({
            ...t,
            date: displayDateForList, 
            id: (t.isRecurring) ? `${t.id}_proj_${targetEffectiveMonth}` : t.id 
          });
        }
      } catch(e) {
        console.error(`DashboardPage: TRACER --- Error processing transaction ${t.id} in fullRecentIncomeList:`, e, t);
      }
    });
    // console.log(`DashboardPage: TRACER --- recentIncome: Found ${monthlyDisplayTransactions.length} items before sort.`);
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  }, [transactions, displayedDate]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0, 5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];
    // console.log(`DashboardPage: TRACER --- recentExpenses: Calculating for ${targetEffectiveMonth}. Total transactions: ${transactions.length}`);

    transactions.forEach(t => {
      if (t.type !== 'expense') return;
      let includeTransaction = false;
      let displayDateForList = t.date; // Default to original transaction date
      let currentDescription = t.description;
      let uniqueIdSuffix = ""; // For installments, makes projected ID unique per month
      
      try {
        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          const monthDiffFromEffectiveStart = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(firstImpactMonthDate));
          const currentInstallmentNum = monthDiffFromEffectiveStart + 1;

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            includeTransaction = true;
            currentDescription = `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`;
            displayDateForList = t.date; // Display the original purchase date for installments
            uniqueIdSuffix = `_inst_${currentInstallmentNum}`; // Suffix for React key
            // console.log(`DashboardPage: TRACER --- recentExpenses: Added projected installment: ${currentDescription}, OrigDate: ${t.date}, EffMonth: ${t.effectiveMonth}, TargetEffMonth: ${targetEffectiveMonth}`);
          }
        } else if (t.isRecurring && t.expenseType !== 'installment') { 
          const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          if (startOfMonth(firstImpactMonthDate) <= firstDayOfDisplayedMonth) {
            includeTransaction = true;
            displayDateForList = t.date; // Display original start date for generic recurring
            uniqueIdSuffix = "_proj";
            // console.log(`DashboardPage: TRACER --- recentExpenses: Added projected recurring: ${t.description}, OrigDate: ${t.date}, EffMonth: ${t.effectiveMonth}, TargetEffMonth: ${targetEffectiveMonth}`);
          }
        } else if (t.effectiveMonth === targetEffectiveMonth && t.expenseType !== 'installment' && !t.isRecurring) { 
          includeTransaction = true;
          displayDateForList = t.date; // Use its actual date
          //  console.log(`DashboardPage: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}, EffMonth: ${t.effectiveMonth}, TargetEffMonth: ${targetEffectiveMonth}`);
        }
        
        if (includeTransaction) {
          monthlyDisplayTransactions.push({ 
            ...t, 
            date: displayDateForList,
            description: currentDescription, 
            id: t.id + uniqueIdSuffix + `_${targetEffectiveMonth}` 
          });
        }
      } catch (e) {
        console.error(`DashboardPage: TRACER --- Error processing transaction ${t.id} in fullRecentExpensesList:`, e, t);
      }
    });
    // console.log(`DashboardPage: TRACER --- recentExpenses: Found ${monthlyDisplayTransactions.length} items before sort.`);
    return monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
  },[transactions, displayedDate, translate]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);

  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;
  
  // console.log(`DashboardPage: TRACER --- RENDERING. overallLoading: ${overallLoading}, isClient: ${isClient}, authLoading: ${authLoading}, isLoadingTransactions: ${isLoadingTransactions}, isLoadingPreferences: ${isLoadingPreferences}, isLoadingBudgets: ${isLoadingBudgets}`);
  // console.log(`DashboardPage: TRACER --- Final values before render: Displayed Month: ${displayedMonthYearLabel}, transactionsInPeriod: ${transactionsForDisplayedPeriod.length}, totalIncomeForSummary: ${totalIncomeForSummary}, totalExpensesForSummary: ${totalExpensesForSummary}`);
  
  if (overallLoading) {
    // console.log("DashboardPage: TRACER --- RENDERING LOADING SCREEN.");
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full p-4">
          <div className="space-y-4 w-full">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={`summary-skel-${i}`} className="h-24 w-full rounded-lg" />)}
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
                      <div key={`spending-sum-skel-${i}`} className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center shadow-md border">
                        <div className="text-sm font-medium text-foreground mb-1"> {/* Changed from text-muted-foreground */}
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

  // console.log(`DashboardPage: TRACER --- RENDERING DASHBOARD CONTENT. Transactions: ${transactions.length} isLoadingTransactions: ${isLoadingTransactions} Displayed Period Transactions: ${transactionsForDisplayedPeriod.length}`);

  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
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
                    {translate({ en: "Total", pt: "Total de Gastos" })}
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
                    {translate({ en: "Total", pt: "Total de Gastos" })}
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
    
