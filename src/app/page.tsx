
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
import { Package, Wallet, Star } from "lucide-react"; 
import { CategoryIcon } from "@/components/icons"; 
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch, type Unsubscribe } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
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
  const { user, loading: authLoading, isSubscriptionActive } = useAuth();
  const userId = user?.uid;
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  const [userCategories, setUserCategories] = useState<DisplayCategory[]>(() => [...CATEGORIES]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>(() => [...PAYMENT_METHODS]);
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

  console.log("DashboardPage TRACER --- Top Level Render. UserID:", userId, "AuthLoading:", authLoading, "isClient:", isClient, "DisplayedDate:", displayedDate.toISOString());

  useEffect(() => {
    console.log("DashboardPage: TRACER --- isClient useEffect running");
    setIsClient(true);
    effectMountedRef.current = true;
    return () => {
      console.log("DashboardPage: TRACER --- Main Component UNMOUNTING. Cleaning up for UserID:", mainFetchInitiatedForUser.current);
      effectMountedRef.current = false;
    };
  }, []);

  const cleanupListener = useCallback((listenerRef: React.MutableRefObject<Unsubscribe | null>, type: string, forUserId?: string | null) => {
    if (listenerRef.current && typeof listenerRef.current === 'function') {
      console.log("DashboardPage: TRACER --- cleanupListener: Unsubscribing " + type + " for UserID:", forUserId || "N/A");
      listenerRef.current();
      listenerRef.current = null;
    } else {
      console.log("DashboardPage: TRACER --- cleanupListener: No " + type + " listener to unsubscribe or ref is not a function for UserID:", forUserId || "N/A");
    }
  }, []);

  useEffect(() => {
    const currentUserId = userId;
    console.log("DashboardPage: TRACER --- Preferences useEffect START. UserID:", currentUserId, "AuthLoading:", authLoading, "isClient:", isClient);

    if (!isClient || authLoading) {
      console.log("DashboardPage: TRACER --- Preferences: Not ready, waiting. isClient:", isClient, "authLoading:", authLoading);
      if (!currentUserId && !authLoading && effectMountedRef.current) {
          setUserCategories([...CATEGORIES]);
          setUserPaymentMethods([...PAYMENT_METHODS]);
          setIsLoadingPreferences(false);
      }
      return;
    }

    if (!currentUserId) {
      console.log("DashboardPage: TRACER --- Preferences: No user ID. Using defaults & stopping loading.");
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES]);
        setUserPaymentMethods([...PAYMENT_METHODS]);
        setIsLoadingPreferences(false);
      }
      return;
    }

    console.log("DashboardPage: TRACER --- Preferences: Setting up listener for UserID:", currentUserId);
    if (effectMountedRef.current) setIsLoadingPreferences(true);
    
    cleanupListener(unsubscribePreferencesRef, "preferences old (before new setup)", currentUserId);

    const preferencesDocRef = doc(db, 'users', currentUserId, 'preferences/userPreferences');
    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences snapshot received, but component unmounted for UserID:", currentUserId);
        return;
      }
      console.log("DashboardPage: TRACER --- Preferences snapshot received for UserID:", currentUserId, "Exists:", docSnap.exists());

      let finalCategories: DisplayCategory[] = [];
      let finalPaymentMethods: DisplayPaymentMethod[] = [];

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
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
            finalCategories = [...CATEGORIES.filter(c => !deselectedPredefinedCatNames.has(c.name.toLowerCase()))];
            if (finalCategories.length === 0) finalCategories = [...CATEGORIES]; 
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
            if (finalPaymentMethods.length === 0) finalPaymentMethods = [...PAYMENT_METHODS];
        }
      } else {
         console.log("DashboardPage: TRACER --- Preferences: No preferences document found for UserID:", currentUserId, ". Using all predefined categories/methods.");
         finalCategories = [...CATEGORIES];
         finalPaymentMethods = [...PAYMENT_METHODS];
      }

      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        console.log("DashboardPage: TRACER --- Preferences: Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items for UserID:", currentUserId);
      }
      if (effectMountedRef.current) setIsLoadingPreferences(false);
    }, (error: any) => {
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: TRACER --- Preferences: Error listening for UserID:", currentUserId, error);
      toast({ title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }), description: translate({en: "Could not load your settings.", pt: "Não foi possível carregar suas configurações."}), variant: "destructive" });
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        setIsLoadingPreferences(false);
      }
    });

    return () => {
      console.log("DashboardPage: TRACER --- Preferences useEffect CLEANUP for UserID:", currentUserId);
      cleanupListener(unsubscribePreferencesRef, "preferences", currentUserId);
    };
  }, [userId, isClient, authLoading, language, toast, translate, cleanupListener]);

  useEffect(() => {
    const targetUserId = userId;
    console.log("DashboardPage: TRACER --- Transactions useEffect START. UserID:", targetUserId, "AuthLoading:", authLoading, "isClient:", isClient, "InitiatedFor:", mainFetchInitiatedForUser.current);
    
    if (!isClient || authLoading) {
      console.log("DashboardPage: TRACER --- Transactions: Not ready. isClient:", isClient, "AuthLoading:", authLoading);
      if (!targetUserId && !authLoading && effectMountedRef.current) setIsLoadingTransactions(false);
      return;
    }

    if (!targetUserId) {
      console.log("DashboardPage: TRACER --- Transactions: No user ID. Clearing transactions and stopping loading.");
      if (effectMountedRef.current) {
        setAllTransactions([]);
        setIsLoadingTransactions(false);
        mainFetchInitiatedForUser.current = null;
        router.push('/login');
      }
      return;
    }

    if (user && !user.emailVerified) {
        console.log("DashboardPage: TRACER --- Transactions: User email not verified. Redirecting.");
        if (effectMountedRef.current) {
            setAllTransactions([]);
            setIsLoadingTransactions(false);
            mainFetchInitiatedForUser.current = null;
            router.push('/verify-email');
        }
        return;
    }
    
    const fetchDataInternal = async () => {
        if (!effectMountedRef.current) {
            console.log("DashboardPage: TRACER --- fetchDataInternal (Transactions): Component unmounted before starting for UserID:", targetUserId);
            if (effectMountedRef.current) setIsLoadingTransactions(false);
            return;
        }
        console.log("DashboardPage: TRACER --- fetchDataInternal: Starting for UserID:", targetUserId);
        
        try {
            const userDocRef = doc(db, "users", targetUserId);
            const userDocSnap = await getDoc(userDocRef);

            if (!effectMountedRef.current) {
                console.log("DashboardPage: TRACER --- fetchDataInternal (Transactions): Component unmounted after getDoc for UserID:", targetUserId);
                if (effectMountedRef.current) setIsLoadingTransactions(false);
                return;
            }

            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              if (!userData.onboardingComplete) {
                console.log("DashboardPage: Onboarding not complete. Redirecting.");
                router.push('/onboarding');
                return;
              }
              // Subscription check that was here is removed. It's now handled by the AuthContext and UI components.
            } else {
              console.log("DashboardPage: No user document found. Redirecting to onboarding.");
              router.push('/onboarding');
              return;
            }

            console.log("DashboardPage: TRACER --- fetchDataInternal: User onboarding OK for UserID:", targetUserId, ". Setting up onSnapshot listener for transactions.");

            cleanupListener(unsubscribeTransactionsRef, "transactions old (before new setup)", targetUserId);
            
            const transactionsColPath = 'users/' + targetUserId + '/transactions';
            console.log("DashboardPage: TRACER --- Transactions: Firestore query path:", transactionsColPath);
            const transactionsColRef = collection(db, transactionsColPath);
            const q_transactions = query(transactionsColRef);

            unsubscribeTransactionsRef.current = onSnapshot(q_transactions, (querySnapshot) => {
                if (!effectMountedRef.current) {
                    console.log("DashboardPage: TRACER --- Transaction onSnapshot: Received data, but component unmounted for UserID:", targetUserId);
                    return;
                }
                console.log("DashboardPage: TRACER --- Transaction onSnapshot: Received data for UserID:", targetUserId, ". Empty:", querySnapshot.empty, "Docs count:", querySnapshot.docs.length, "PendingWrites:", querySnapshot.metadata.hasPendingWrites);
                
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
                          } else {
                            try {
                              dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
                            } catch (e1) {
                              try {
                                dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                              } catch (e2) {
                                console.warn("DashboardPage: TRACER --- TX Date Parse (string general for " + String(docSnap.id) + "): Failed for date '" + String(data.date) + "'. Error: " + String(e2) + ". Fallback.");
                                dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                              }
                            }
                          }
                        } else {
                          console.warn("DashboardPage: TRACER --- TX Date Parse (non-string, non-Timestamp for " + String(docSnap.id) + "): Date was", data.date, ". Fallback.");
                          dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                        }
                      } else {
                        console.warn("DashboardPage: TRACER --- TX Date Parse (missing for " + String(docSnap.id) + "): Date field is missing. Fallback.");
                        dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                      }
        
                      if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
                         if (dateString && dateString !== "1970-01-01") {
                            try { 
                              effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM"); 
                            } catch (e) {
                              console.warn("DashboardPage: TRACER --- TX effectiveMonth Derivation: Failed for tx " + String(docSnap.id) + " from date " + String(dateString) + ". Error: " + String(e) + ". Fallback to current month.");
                              effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                            }
                         } else {
                            console.warn("DashboardPage: TRACER --- TX effectiveMonth Derivation: Date string invalid or missing for tx " + String(docSnap.id) + ". Fallback to current month.");
                            effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                         }
                      }
                    const txObject = {
                        ...data,
                        id: docSnap.id,
                        date: dateString,
                        effectiveMonth: effectiveMonthString,
                        isRecurring: data.isRecurring === true,
                        expenseType: data.expenseType,
                        installments: data.installments,
                        expenseNature: data.expenseNature
                    } as Transaction;
                    if(querySnapshot.docs.length > 0 && docSnap.id === querySnapshot.docs[0].id) {
                        console.log("DashboardPage: TRACER --- Transaction onSnapshot: Mapped transaction (sample):", JSON.stringify(txObject));
                    }
                    return txObject;
                });

                if (effectMountedRef.current) {
                  console.log("DashboardPage: TRACER --- Transaction onSnapshot: Setting " + fetchedTransactions.length + " transactions for UserID:", targetUserId);
                  setAllTransactions(fetchedTransactions);
                  setIsLoadingTransactions(false);
                }
            }, (error: any) => {
                if (!effectMountedRef.current) return;
                console.error("DashboardPage: TRACER --- Transaction onSnapshot: Error listening for UserID:", targetUserId, error);
                toast({ title: translate({ en: "Transaction Error", pt: "Erro nas Transações" }), description: translate({en: "Could not load transactions.", pt: "Não foi possível carregar as transações."}), variant: "destructive" });
                if (effectMountedRef.current) {
                  setAllTransactions([]);
                  setIsLoadingTransactions(false);
                }
            });
        } catch (error) {
            if (!effectMountedRef.current) {
                 if (effectMountedRef.current) setIsLoadingTransactions(false);
                return;
            }
            console.error("DashboardPage: TRACER --- fetchDataInternal (Transactions): Error for UserID:", targetUserId, error);
            toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({en: "An error occurred loading data.", pt: "Ocorreu um erro ao carregar os dados."}), variant: "destructive" });
            if (effectMountedRef.current) {
                setAllTransactions([]);
                setIsLoadingTransactions(false);
            }
        }
    };
    
    if (mainFetchInitiatedForUser.current !== targetUserId || !unsubscribeTransactionsRef.current) {
      console.log("DashboardPage: TRACER --- Transactions: Initiating NEW fetch/listener for UserID:", targetUserId, ". PrevInitiatedFor:", mainFetchInitiatedForUser.current, ". ListenerExisted:", !!unsubscribeTransactionsRef.current);
      if (effectMountedRef.current) setIsLoadingTransactions(true);
      fetchDataInternal();
      mainFetchInitiatedForUser.current = targetUserId;
    } else {
       console.log("DashboardPage: TRACER --- Transactions: Fetch already initiated for UserID:", targetUserId, "and listener exists. Skipping new setup.");
       if (effectMountedRef.current) setIsLoadingTransactions(false); 
    }

    return () => {
      console.log("DashboardPage: TRACER --- Transactions useEffect CLEANUP for UserID:", targetUserId);
      cleanupListener(unsubscribeTransactionsRef, "transactions", targetUserId);
    };
  }, [userId, isClient, authLoading, router, toast, translate, cleanupListener]);


  const loadBudgets = useCallback(async () => {
    const currentUserId = userId; 
    if (!effectMountedRef.current || !currentUserId || !isClient ) {
      console.log("DashboardPage: TRACER --- loadBudgets: Early exit. Conditions not met.");
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false);
      }
      return;
    }

    console.log("DashboardPage: TRACER --- loadBudgets: Fetching budgets for user " + currentUserId + ", month based on displayedDate:", displayedDate.toISOString());
    if (effectMountedRef.current) setIsLoadingBudgets(true); 
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    const budgetDocRef = doc(db, 'users/' + currentUserId + '/budgets/' + budgetMonthKey);

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
        console.log('DashboardPage: TRACER --- Budgets data loaded for', budgetMonthKey + ':', JSON.stringify(validBudgets));
        if (effectMountedRef.current) setLoadedBudgetsForMonth(validBudgets);
      } else {
        console.log('DashboardPage: TRACER --- No budget document found for', budgetMonthKey, "UserID:", currentUserId);
        if (effectMountedRef.current) setLoadedBudgetsForMonth({}); 
      }
    } catch (error) {
      if (!effectMountedRef.current) {
         if(effectMountedRef.current) setIsLoadingBudgets(false);
         return;
      }
      console.error("DashboardPage: TRACER --- Error loading budgets for UserID:", currentUserId, "Month:", budgetMonthKey, error);
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({en: "Could not load your budget data for this month.", pt: "Não foi possível carregar seus dados de orçamento para este mês."}), variant: "destructive" });
      if (effectMountedRef.current) setLoadedBudgetsForMonth({});
    } finally {
      if (effectMountedRef.current) {
        setIsLoadingBudgets(false);
        console.log("DashboardPage: TRACER --- loadBudgets: setIsLoadingBudgets(false) in finally block. UserID:", currentUserId);
      }
    }
  }, [userId, isClient, displayedDate, toast, translate]);

  useEffect(() => {
    console.log("DashboardPage: TRACER --- Budgets useEffect. UserID:", userId, "isClient:", isClient, "AuthLoading:", authLoading, "DisplayedDate:", displayedDate.toISOString());
    if (userId && isClient && !authLoading) {
        loadBudgets();
    } else if (effectMountedRef.current) { 
      console.log("DashboardPage: TRACER --- Budgets useEffect: Conditions not met or user changed, setting budgets to null and loading to false.");
      setLoadedBudgetsForMonth(null); 
      setIsLoadingBudgets(false); 
    }
  }, [userId, isClient, authLoading, displayedDate, loadBudgets]);

  const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    const currentUserId = userId;
    if (!currentUserId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    
    const transactionActualDate = newTransactionData.date; 
    const effectiveMonthForSave = formatDateFns(displayedDate, "yyyy-MM"); 

    console.log("DashboardPage TRACER --- onAddTransaction: Received date from form:", transactionActualDate);
    console.log("DashboardPage TRACER --- onAddTransaction: Full newTransactionData from form:", JSON.stringify(newTransactionData, null, 2));
    console.log("DashboardPage TRACER --- onAddTransaction: Effective month for save:", effectiveMonthForSave, "based on displayedDate:", displayedDate.toISOString());

    const fullPayload = {
      ...newTransactionData,
      date: transactionActualDate, 
      effectiveMonth: effectiveMonthForSave, 
      userId: currentUserId,
      createdAt: serverTimestamp(),
    };
    
    const dataToSave = Object.fromEntries(
      Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;
    
    if(dataToSave.isRecurring === undefined) { dataToSave.isRecurring = false; }
    if(dataToSave.type === 'expense' && !dataToSave.expenseType){ dataToSave.expenseType = 'upfront'; }
    
    console.log("DashboardPage TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "and effectiveMonth:", dataToSave.effectiveMonth, "Full dataToSave:", JSON.stringify(dataToSave, null, 2));

    try {
      const transactionsColRef = collection(db, 'users/' + currentUserId + '/transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: newTransactionData.description + " " + translate({en:"added.", pt:"adicionada."})});
    } catch (error: any) {
      console.error("DashboardPage: TRACER --- onAddTransaction: Error adding transaction for UserID:", currentUserId, error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({en:"Could not save your transaction.", pt: "Não foi possível salvar sua transação."})), variant: "destructive" });
    }
  }, [userId, displayedDate, toast, translate]);

  const transactionsForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate);
    console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: Recalculating for TargetEffMonth:", targetEffectiveMonth, "DisplayedDate:", displayedDate.toISOString(), "All transactions count:", allTransactions.length);

    if (!allTransactions || allTransactions.length === 0) {
      console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: No transactions in allTransactions state, returning empty.");
      return [];
    }

    const filtered: Transaction[] = [];
    allTransactions.forEach(t => {
      let includeTransaction = false;
      let reason = "N/A";
      
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        reason = "Installment Check";
        const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        const monthDiffFromEffectiveStart = differenceInCalendarMonths(firstDayOfTargetMonth, startOfMonth(firstImpactMonthDate));
        includeTransaction = monthDiffFromEffectiveStart >= 0 && monthDiffFromEffectiveStart < t.installments;
      } else if (t.isRecurring === true && t.expenseType !== 'installment') { 
        reason = "Recurring Check";
        const firstImpactMonthDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        includeTransaction = startOfMonth(firstImpactMonthDate) <= firstDayOfTargetMonth;
      } else { 
        reason = "Non-Recurring Check";
        includeTransaction = t.effectiveMonth === targetEffectiveMonth;
      }
      console.log("DashboardPage: TRACER --- Tx Filter (Summary): ID:", t.id, "Date:", t.date, "EffMonth:", t.effectiveMonth, "Type:", t.type, "ExpType:", t.expenseType, "isRec:", t.isRecurring, "Inst:", t.installments, "Amount:", t.amount, "Included:", includeTransaction, "Reason:", reason, "Target:", targetEffectiveMonth);
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log("DashboardPage: TRACER --- transactionsForDisplayedPeriod: Found " + filtered.length + " transactions for the period.");
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
    console.log("DashboardPage: TRACER --- recentIncome: Recalculating for", displayedMonthYearLabel, ". All transactions count:", allTransactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    allTransactions.forEach(t => {
      if (t.type !== 'income') return;
      try {
        let includeTransaction = false;
        let dateForDisplay = t.date; 
        let idForDisplay = t.id;
        let reason = "";

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
            dateForDisplay = formatDateFns(projectedDate, "yyyy-MM-dd");
            idForDisplay = `${t.id}_proj_${targetEffectiveMonth}`;
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) { 
          reason = "Non-Recurring Income Check";
          includeTransaction = true;
        }
        
        if (includeTransaction) {
          console.log("DashboardPage: TRACER --- recentIncome: Added", reason, t.description, "Date:", dateForDisplay);
          monthlyDisplayTransactions.push({
            ...t,
            date: dateForDisplay,
            id: idForDisplay
          });
        }
      } catch(e) {
        console.error("DashboardPage: TRACER --- Error processing transaction", t.id, "in fullRecentIncomeList:", e, t);
      }
    });
    const sorted = monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log("DashboardPage: TRACER --- recentIncome: Found", sorted.length, "items for display.");
    return sorted;
  }, [allTransactions, displayedDate, displayedMonthYearLabel]);

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0, 5);
  }, [fullRecentIncomeList, showAllRecentIncome]);

  const fullRecentExpensesList = useMemo(() => {
    console.log("DashboardPage: TRACER --- recentExpenses: Recalculating for", displayedMonthYearLabel, ". All transactions count:", allTransactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    const monthlyDisplayTransactions: Transaction[] = [];

    allTransactions.forEach(t => {
      if (t.type !== 'expense') return;
      try {
        let includeTransaction = false;
        let dateForDisplay = t.date;
        let descriptionForDisplay = t.description;
        let idForDisplay = t.id;
        let reason = "";

        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          reason = "Installment Expense Check";
          const firstImpactMonthForInstallment = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          const monthDiffFromEffectiveStart = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(firstImpactMonthForInstallment));
          const currentInstallmentNum = monthDiffFromEffectiveStart + 1;

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            includeTransaction = true;
            dateForDisplay = t.date;
            descriptionForDisplay = `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`;
            idForDisplay = `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}`; 
          }
        } else if (t.isRecurring && t.expenseType !== 'installment') {
          reason = "Recurring Expense Check";
          const firstImpactMonthForRecurrence = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
          if (startOfMonth(firstImpactMonthForRecurrence) <= firstDayOfDisplayedMonth) {
            includeTransaction = true;
            dateForDisplay = t.date; 
            idForDisplay = `${t.id}_proj_${targetEffectiveMonth}`; 
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) { 
          reason = "Non-Recurring Expense Check";
          includeTransaction = true;
        }
        
        if (includeTransaction) {
          console.log("DashboardPage: TRACER --- recentExpenses: Added", reason, descriptionForDisplay, "Date:", dateForDisplay);
          monthlyDisplayTransactions.push({
            ...t,
            date: dateForDisplay,
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
  },[allTransactions, displayedDate, displayedMonthYearLabel, translate]);

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

  console.log("DashboardPage: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsForDisplayedPeriod count:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);
  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod}
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
                     {translate({ en: "Total Expenses", pt: "Total de Gastos" })}
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
                    {translate({ en: "Total Expenses", pt: "Total de Gastos" })}
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
          isSubscriptionActive={isSubscriptionActive}
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
