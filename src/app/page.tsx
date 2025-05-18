
'use client';
import React from 'react'; // Keep React import
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction, DisplayCategory, UserPreferences, DisplayPaymentMethod, ExpenseType, CategoryName } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel, getCategoryLabel } from "@/types";
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp, writeBatch, updateDoc, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { PiggyBank, Package, Wallet, TrendingUp, TrendingDown, DollarSign, ListChecks, Terminal } from "lucide-react"; 
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
  
  const [isClient, setIsClient] = useState(false);
  const [loadedBudgetsForMonth, setLoadedBudgetsForMonth] = useState<Record<string, number> | null>(null);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);

  const [userCategories, setUserCategories] = useState<DisplayCategory[]>([]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const unsubscribePreferencesRef = useRef<(() => void) | null>(null);

  const [showAllRecentIncome, setShowAllRecentIncome] = useState(false);
  const [showAllRecentExpenses, setShowAllRecentExpenses] = useState(false);

  const effectMountedRef = useRef(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const mainFetchInitiatedForUser = useRef<string | null>(null);

  useEffect(() => {
    console.log("Dashboard: TRACER --- isClient useEffect running");
    setIsClient(true);
  }, []);

  // Listener for User Preferences
 useEffect(() => {
    const cleanupListener = () => {
      if (unsubscribePreferencesRef.current) {
        console.log("DashboardPage: TRACER --- Cleaning up preferences listener for UserID:", userId);
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
    };

    if (!userId || !isClient || authLoading) {
      if (effectMountedRef.current) {
        const allPredefinedCategories: DisplayCategory[] = [...CATEGORIES];
        const allPredefinedPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        
        setUserCategories(allPredefinedCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
        setUserPaymentMethods(allPredefinedPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
        if (isLoadingPreferences) setIsLoadingPreferences(false);
      }
      cleanupListener();
      return;
    }

    console.log("DashboardPage: TRACER --- Setting up REAL-TIME listener for user preferences for UserID:", userId);
    if (effectMountedRef.current && !isLoadingPreferences) setIsLoadingPreferences(true);
    
    const preferencesDocRef = doc(db, 'users/' + userId + '/preferences/userPreferences');
    cleanupListener(); 

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      if (!effectMountedRef.current) {
        console.log("DashboardPage: TRACER --- Preferences snapshot received, but effect unmounted for UserID:", userId);
        return;
      }
      console.log("DashboardPage: TRACER --- Preferences snapshot received for UserID:", userId);

      let finalCategories: DisplayCategory[] = [];
      let finalPaymentMethods: DisplayPaymentMethod[] = [];
      
      const predefinedCategoryMap = new Map(CATEGORIES.map(cat => [cat.name.toLowerCase(), cat]));
      const predefinedPaymentMethodMap = new Map(PAYMENT_METHODS.map(pm => [pm.name.toLowerCase(), pm]));

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        console.log("DashboardPage: TRACER --- Preferences data found for UserID:", userId, JSON.stringify(prefsData));

        // CATEGORIES
        // Start with all predefined categories
        let tempCategories: DisplayCategory[] = [...CATEGORIES];
        
        // Apply user-defined customizations/overrides
        const customCategoryDefs = prefsData.userDefinedCategories || [];
        customCategoryDefs.forEach(customCat => {
          const existingIndex = tempCategories.findIndex(tc => tc.name.toLowerCase() === customCat.name.toLowerCase());
          if (existingIndex !== -1) {
            // It's a customization of a predefined category, merge carefully
             tempCategories[existingIndex] = { 
                ...tempCategories[existingIndex], // Keep original type and name
                label: customCat.label || tempCategories[existingIndex].label, // User's label takes precedence
                icon: customCat.icon || tempCategories[existingIndex].icon,   // User's icon takes precedence
             };
          } else {
            // It's a purely new custom category
            tempCategories.push(customCat);
          }
        });
        
        // Filter out deselected predefined categories
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));
        finalCategories = tempCategories.filter(cat => {
            const isOriginallyPredefined = CATEGORIES.some(pCat => pCat.name.toLowerCase() === cat.name.toLowerCase());
            if (isOriginallyPredefined && deselectedPredefinedCatNames.has(cat.name.toLowerCase())) {
                return false; 
            }
            return true;
        });
        
        // Ensure purely custom categories (that weren't overrides and aren't deselected) are present.
        customCategoryDefs.forEach(customCat => {
            if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
                finalCategories.push(customCat);
            }
        });
        // Remove duplicates by name, prioritizing user-defined ones if any conflict arose (though it shouldn't with above logic)
        const finalCategoriesMap = new Map<string, DisplayCategory>();
        finalCategories.forEach(cat => finalCategoriesMap.set(cat.name.toLowerCase(), cat));
        finalCategories = Array.from(finalCategoriesMap.values());


        // PAYMENT METHODS
        let tempPaymentMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        const customPaymentMethodDefs = prefsData.userDefinedPaymentMethods || [];

        customPaymentMethodDefs.forEach(customPm => {
          const existingIndex = tempPaymentMethods.findIndex(tpm => tpm.name.toLowerCase() === customPm.name.toLowerCase());
          if (existingIndex !== -1) {
            tempPaymentMethods[existingIndex] = {
                 ...tempPaymentMethods[existingIndex],
                 label: customPm.label || tempPaymentMethods[existingIndex].label,
                 icon: customPm.icon || tempPaymentMethods[existingIndex].icon,
            };
          } else {
            tempPaymentMethods.push(customPm);
          }
        });
        
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        finalPaymentMethods = tempPaymentMethods.filter(pm => {
            const isOriginallyPredefined = PAYMENT_METHODS.some(pPm => pPm.name.toLowerCase() === pm.name.toLowerCase());
            if (isOriginallyPredefined && deselectedPredefinedPmNames.has(pm.name.toLowerCase())) {
                return false;
            }
            return true;
        });

        customPaymentMethodDefs.forEach(customPm => {
            if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customPm.name.toLowerCase())) {
                finalPaymentMethods.push(customPm);
            }
        });
        const finalPaymentMethodsMap = new Map<string, DisplayPaymentMethod>();
        finalPaymentMethods.forEach(pm => finalPaymentMethodsMap.set(pm.name.toLowerCase(), pm));
        finalPaymentMethods = Array.from(finalPaymentMethodsMap.values());
        
      } else {
        console.log("DashboardPage: TRACER --- No preferences document found for UserID:", userId, ". Using all predefined categories and payment methods.");
        finalCategories = [...CATEGORIES];
        finalPaymentMethods = [...PAYMENT_METHODS];
      }
      
      if (effectMountedRef.current) {
        setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
        setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
        setIsLoadingPreferences(false);
        console.log("DashboardPage: TRACER --- Set userCategories:", finalCategories.length, "items; Set userPaymentMethods:", finalPaymentMethods.length, "items");
      }
    }, (error) => {
      if (!effectMountedRef.current) return;
      console.error("DashboardPage: TRACER --- Error listening to user preferences for UserID:", userId, error);
      toast({
        title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }),
        description: translate({ en: "Could not load your preferences in real-time.", pt: "Não foi possível carregar suas preferências em tempo real." }),
        variant: "destructive",
      });
      if (effectMountedRef.current) {
        setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)))); 
        setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language)))); 
        setIsLoadingPreferences(false);
      }
    });

    return cleanupListener;
  }, [userId, isClient, authLoading, language, toast, translate]);


 useEffect(() => {
    effectMountedRef.current = true;
    const cleanupListener = () => {
      if (unsubscribeSnapshotRef.current) {
        console.log("Dashboard: TRACER --- cleanupListener: Unsubscribing TRXs snapshot for UserID:", mainFetchInitiatedForUser.current);
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }
    };
    const fullCleanup = () => {
      console.log("Dashboard: TRACER --- Main useEffect FULL CLEANUP for UserID:", mainFetchInitiatedForUser.current);
      cleanupListener();
      effectMountedRef.current = false;
    };

    console.log("Dashboard: TRACER --- Main useEffect START. UserID:", userId, ", AuthLoading:", authLoading, ", isClient:", isClient, ", InitiatedFor:", mainFetchInitiatedForUser.current, ", isLoadingTransactions:", isLoadingTransactions);
    
    if (!isClient) {
      console.log("Dashboard: TRACER --- Main useEffect: Not client yet, waiting.");
      return;
    }
    if (authLoading) {
      console.log("Dashboard: TRACER --- Main useEffect: Auth is loading, waiting...");
      // Ensure loading state for transactions is true if auth is still loading
      if (effectMountedRef.current && !isLoadingTransactions) {
        setIsLoadingTransactions(true);
        console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) because auth is loading.");
      }
      return;
    }
    if (!userId) {
      console.log("Dashboard: TRACER --- Main useEffect: No userId. User logged out. Redirecting to login.");
      if (effectMountedRef.current) {
        cleanupListener();
        setTransactions([]);
        if (isLoadingTransactions) setIsLoadingTransactions(false);
        mainFetchInitiatedForUser.current = null;
        router.push('/login');
      }
      return;
    }

    const fetchDataInternal = async (currentUserId: string) => {
      if (!effectMountedRef.current) {
        console.log("Dashboard: TRACER --- fetchDataInternal: Effect unmounted early for UserID:", currentUserId);
        if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false);
        return;
      }
      console.log("Dashboard: TRACER --- fetchDataInternal: Starting for UserID:", currentUserId);

      try {
        const userDocRef = doc(db, "users", currentUserId);
        const userDocSnap = await getDoc(userDocRef);

        if (!effectMountedRef.current) {
          if (isLoadingTransactions && effectMountedRef.current) setIsLoadingTransactions(false); return;
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

        if (unsubscribeSnapshotRef.current) {
            console.warn("Dashboard: TRACER --- fetchDataInternal: Stale transaction snapshot ref found before new onSnapshot. Cleaning up again.");
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
            let effectiveMonthString = data.effectiveMonth;

            if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
              dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
            } else if (typeof data.date === 'string') {
                if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
                    // Already in YYYY-MM-DD
                } else if (data.date.includes('T')) { 
                    try { 
                        dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); 
                    } catch (e1) {
                       try { // Handle cases like 'YYYY-MM-DDTHH:MM:SS.sssZ' or 'YYYY-MM-DDTHH:MM:SSZ'
                           dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                       } catch (e2) {
                           console.warn("Dashboard: TRACER --- Failed to parse existing datetime string to yyyy-MM-dd (fallback): " + String(data.date), e2);
                           dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                       }
                    }
                } else {
                     console.warn("Dashboard: TRACER --- Transaction has unexpected date string format. Attempting general parse. Date was:", data.date, "ID:", docSnap.id);
                     try {
                        dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                     } catch (e) {
                        console.warn("Dashboard: TRACER --- General parse failed for date string. Fallback to current date. Date was:", data.date, "ID:", docSnap.id, e);
                        dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                     }
                }
            } else {
               console.warn("Dashboard: TRACER --- Transaction has missing or non-string/non-Timestamp date. Fallback to current date YYYY-MM-DD. Date was:", data.date, "ID:", docSnap.id);
               dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
            }

            if (!effectiveMonthString && dateString) {
                try {
                    effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                } catch (e) {
                    console.warn(`DashboardPage: Could not parse date ${dateString} to derive effectiveMonth for tx ${docSnap.id}`);
                    effectiveMonthString = formatDateFns(new Date(), "yyyy-MM"); 
                }
            }

            return {
              ...data,
              id: docSnap.id,
              date: dateString, // Ensure this is YYYY-MM-DD
              effectiveMonth: effectiveMonthString, 
              isRecurring: data.isRecurring === true,
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

    console.log("Dashboard: TRACER --- Main useEffect: Current state before deciding to fetch: mainFetchInitiatedForUser.current:", mainFetchInitiatedForUser.current, "userId:", userId, "unsubscribeSnapshotRef.current:", unsubscribeSnapshotRef.current ? 'EXISTS' : 'NULL');
    
    if (mainFetchInitiatedForUser.current !== userId || !unsubscribeSnapshotRef.current) {
      console.log("Dashboard: TRACER --- Main useEffect: Initiating NEW fetch/listener for UserID: " + String(userId) + ". PrevInitiatedFor: " + String(mainFetchInitiatedForUser.current) + ". ListenerExisted: " + (!!unsubscribeSnapshotRef.current));
      cleanupListener(); 
      if (effectMountedRef.current && !isLoadingTransactions) {
         setIsLoadingTransactions(true); 
         console.log("Dashboard: TRACER --- setIsLoadingTransactions(true) for new fetch/setup of user:", userId);
      }
      mainFetchInitiatedForUser.current = userId;
      if (userId) fetchDataInternal(userId); // Only call if userId is defined
    } else {
      console.log("Dashboard: TRACER --- Main useEffect: Listener should be active for UserID: " + String(userId) + ". isLoadingTransactions: " + isLoadingTransactions + ". Snapshot ref present: " + (!!unsubscribeSnapshotRef.current));
       if(effectMountedRef.current && isLoadingTransactions && unsubscribeSnapshotRef.current) {
        console.log("Dashboard: TRACER --- Main useEffect: Listener active, but isLoadingTransactions true. Likely waiting for initial snapshot for user:", userId);
      } else if (effectMountedRef.current && isLoadingTransactions && !unsubscribeSnapshotRef.current) {
        console.warn("Dashboard: TRACER --- Main useEffect: isLoadingTransactions is true, but NO snapshot listener is active. This might be an issue for user:", userId);
        if (effectMountedRef.current) setIsLoadingTransactions(false); 
      }
    }
    return fullCleanup;
  }, [userId, authLoading, isClient]); // Dependencies: userId, authLoading, isClient


 const loadBudgets = useCallback(async () => {
    if (!userId || !isClient || !effectMountedRef.current) { 
      if(effectMountedRef.current) {
        setLoadedBudgetsForMonth(null);
        setIsLoadingBudgets(false);
      }
      return;
    }
    if(effectMountedRef.current) setIsLoadingBudgets(true);
    const budgetMonthKey = formatDateFns(displayedDate, 'yyyy-MM');
    console.log("Dashboard: TRACER --- Loading budgets for user " + String(userId) + ", month: " + budgetMonthKey);
    const budgetDocRef = doc(db, 'users/' + userId + '/budgets/' + budgetMonthKey);
    try {
      const docSnap = await getDoc(budgetDocRef);
      if (!effectMountedRef.current) return;

      if (docSnap.exists()) {
        const budgetData = docSnap.data() as Record<string, any>;
        console.log("Dashboard: TRACER --- Budget data found:", JSON.stringify(budgetData));
        const validBudgets: Record<string, number> = {};
        for (const key in budgetData) {
          if (key !== 'lastUpdated' && Object.prototype.hasOwnProperty.call(budgetData, key) && typeof budgetData[key] === 'number') {
            validBudgets[key] = budgetData[key];
          }
        }
        setLoadedBudgetsForMonth(validBudgets);
      } else {
        console.log("Dashboard: TRACER --- No budget document found for this month.");
        setLoadedBudgetsForMonth({}); 
      }
    } catch (error) {
      if (!effectMountedRef.current) return;
      console.error("Dashboard: TRACER --- LoadBudgets: Error loading budgets for month:", budgetMonthKey, error);
      setLoadedBudgetsForMonth({}); 
      toast({ title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }), description: translate({ en: "Could not load your budgets for the summary.", pt: "Não foi possível carregar seus orçamentos para o resumo." }), variant: "destructive" });
    } finally {
      if (effectMountedRef.current) setIsLoadingBudgets(false);
    }
  }, [userId, isClient, displayedDate, toast, translate]); 


  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]); 

 const onAddTransaction = useCallback(async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    console.log("Dashboard: TRACER --- onAddTransaction: Full newTransactionData received from form:", JSON.stringify(newTransactionData, null, 2));
    
    const effectiveMonthForNewTx = formatDateFns(displayedDate, "yyyy-MM"); // This is the key change for associating with displayed month
    const dateFromForm = newTransactionData.date; // This is "YYYY-MM-DD" string from the form

    console.log("Dashboard: TRACER --- onAddTransaction: Received date from form:", dateFromForm);
    console.log("Dashboard: TRACER --- onAddTransaction: Using effectiveMonth:", effectiveMonthForNewTx);

    const fullPayload = {
      ...newTransactionData, 
      date: dateFromForm, // Keep the user-entered date
      effectiveMonth: effectiveMonthForNewTx, // Add the month it financially belongs to
      userId: userId,
      createdAt: serverTimestamp(),
    };

    // Remove undefined fields before saving to Firestore
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string; effectiveMonth: string }>;

    if (dataToSave.isRecurring === undefined && dataToSave.type === 'income') { 
        dataToSave.isRecurring = false;
    }
     if (dataToSave.isRecurring === undefined && dataToSave.type === 'expense' && dataToSave.expenseType !== 'recurring' && dataToSave.expenseType !== 'installment') {
        dataToSave.isRecurring = false;
    }
    
    console.log("Dashboard: TRACER --- onAddTransaction: Saving to Firestore with date:", dataToSave.date, "effectiveMonth:", dataToSave.effectiveMonth, "Full dataToSave:", JSON.stringify(dataToSave));

    try {
      const transactionsColRef = collection(db, 'users/' + userId + '/transactions');
      await addDoc(transactionsColRef, dataToSave);
      toast({ title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }), description: "" + newTransactionData.description + " " + translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })});
    } catch (error: any) {
      console.error("DashboardPage: Error adding transaction to Firestore:", error);
      toast({ title: translate({ en: "Error adding transaction", pt: "Erro ao adicionar transação" }), description: (error.message || translate({ en: "Could not add transaction.", pt: "Não foi possível adicionar a transação." })) + (error.code ? " (Code: " + (error.code || 'N/A') + ")" : ''), variant: "destructive" });
    }
  }, [userId, toast, translate, displayedDate]); 


  const transactionsForDisplayedPeriod = useMemo(() => {
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Recalculating. displayedDate:", displayedDate.toISOString(), "All transactions count:", transactions.length);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfTargetMonth = startOfMonth(displayedDate); // For calculating installment/recurring period
    
    let filtered: Transaction[] = [];

    transactions.forEach(t => {
      let includeTransaction = false;
      let reason = "";

      // Handle installments first
      if (t.type === 'expense' && t.expenseType === 'installment' && t.installments && t.installments > 0) {
        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
        const installmentSeriesStartDate = startOfMonth(originalTransactionDate);
        const monthDiff = differenceInCalendarMonths(firstDayOfTargetMonth, installmentSeriesStartDate);
        
        if (monthDiff >= 0 && monthDiff < t.installments) {
          includeTransaction = true;
          reason = "Installment active this month";
        } else {
          reason = "Installment not active this month";
        }
        console.log(`Dashboard: TRACER --- Tx Filter (Installment Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, StartSeries: ${installmentSeriesStartDate.toISOString()}, TargetEffMonth: ${targetEffectiveMonth}, TargetMonthStart: ${firstDayOfTargetMonth.toISOString()}, monthDiff: ${monthDiff}, installments: ${t.installments}, Included: ${includeTransaction}, Reason: ${reason}, isRec: ${t.isRecurring}, expType: ${t.expenseType}`);

      } else if (t.isRecurring === true && (t.expenseType !== 'installment')) { // Generic recurring (not installments)
        const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
        const originalTransactionYear = getYearFns(originalTransactionDate);
        const originalTransactionMonth = getMonthFns(originalTransactionDate); // 0-indexed
        const targetYear = getYearFns(displayedDate);
        const targetMonth = getMonthFns(displayedDate); // 0-indexed

        if (originalTransactionYear < targetYear || (originalTransactionYear === targetYear && originalTransactionMonth <= targetMonth)) {
          includeTransaction = true;
          reason = "Recurring, applies to this month or earlier";
        } else {
          reason = "Recurring, starts after this month";
        }
         console.log(`Dashboard: TRACER --- Tx Filter (Recurring Check): ID: ${t.id}, DateStr: ${t.date}, OrigDate: ${originalTransactionDate.toISOString()}, OrigY: ${originalTransactionYear}, OrigM: ${originalTransactionMonth}, TargetY: ${targetYear}, TargetM: ${targetMonth}, Included: ${includeTransaction}, Reason: ${reason}, isRec: ${t.isRecurring}, expType: ${t.expenseType}`);
      
      } else { // Non-recurring, non-installment
        if (t.effectiveMonth === targetEffectiveMonth) {
          includeTransaction = true;
          reason = "Non-recurring, effectiveMonth matches";
        } else {
           reason = `Non-recurring, effectiveMonth (${t.effectiveMonth}) does not match target (${targetEffectiveMonth})`;
        }
        console.log(`Dashboard: TRACER --- Tx Filter (Non-Recurring Check): ID: ${t.id}, DateStr: ${t.date}, EffMonth: ${t.effectiveMonth}, TargetEffMonth: ${targetEffectiveMonth}, Included: ${includeTransaction}, Reason: ${reason}, isRec: ${t.isRecurring}, expType: ${t.expenseType}, inst: ${t.installments}`);
      }
      
      if (includeTransaction) {
        filtered.push(t);
      }
    });
    console.log("Dashboard: TRACER --- transactionsForDisplayedPeriod: Found " + filtered.length + " transactions for the period.");
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
    for (const transaction of expensesThisPeriod) {
      const categoryName = typeof transaction.category === 'string' ? transaction.category : transaction.category.name;
      expensesByCategory[categoryName] = (expensesByCategory[categoryName] || 0) + transaction.amount;
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
      let categoryDetail = userCategories.find(cat => cat.name === largestCategoryKey);
      if (!categoryDetail) { 
         categoryDetail = CATEGORIES.find(cat => cat.name === largestCategoryKey); // Fallback to predefined if not in userCategories (e.g. if prefs not loaded yet)
      }
      
      return {
        name: largestCategoryKey,
        amount: maxAmount,
        icon: categoryDetail?.icon || 'CircleHelp', 
        label: categoryDetail?.label || { en: largestCategoryKey, pt: largestCategoryKey }, 
        type: 'expense' 
      } as DisplayCategory & { amount: number };
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
    console.log(`Dashboard: TRACER --- recentIncome: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'income') {
        if (t.isRecurring) {
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          // Check if the recurring income started on or before the current displayed month
          if (startOfMonth(originalTransactionDate) <= startOfMonth(displayedDate)) {
            const projectedDateDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(startOfMonth(displayedDate), projectedDateDay);
            
            // Adjust day if original day doesn't exist in projected month (e.g. original day 31, projected to Feb)
            const lastDayOfDisplayedMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(startOfMonth(displayedDate), Math.min(projectedDateDay, getDateFns(lastDayOfDisplayedMonth)));
            }

            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(projectedDate, "yyyy-MM-dd"), 
              id: `${t.id}_proj_${targetEffectiveMonth}` 
            });
            console.log(`Dashboard: TRACER --- recentIncome: Added projected recurring: ${t.description}, OrigDate: ${t.date}, ProjectedDate: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          } else {
            console.log(`Dashboard: TRACER --- recentIncome: Skipped projected recurring (starts after displayed month): ${t.description}, OrigDate: ${t.date}`);
          }
        } else if (t.effectiveMonth === targetEffectiveMonth) { // Non-recurring
          monthlyDisplayTransactions.push(t);
          console.log(`Dashboard: TRACER --- recentIncome: Added non-recurring: ${t.description}, Date: ${t.date}, EffMonth: ${t.effectiveMonth}`);
        }
      }
    });
    
    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentIncome: Found ${sorted.length} items for display for ${targetEffectiveMonth}.`);
    return sorted;
  }, [transactions, displayedDate, displayedMonthYearLabel]); 

  const recentIncomeToDisplay = useMemo(() => {
    return showAllRecentIncome ? fullRecentIncomeList : fullRecentIncomeList.slice(0,5);
  }, [fullRecentIncomeList, showAllRecentIncome]);


  const fullRecentExpensesList = useMemo(() => {
    console.log(`Dashboard: TRACER --- recentExpenses: Calculating for ${displayedMonthYearLabel}. Total transactions: ${transactions.length}`);
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const monthlyDisplayTransactions: Transaction[] = [];

    transactions.forEach(t => {
      if (t.type === 'expense') {
        if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
          const originalInstallmentStartDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          const monthDiff = differenceInCalendarMonths(startOfMonth(displayedDate), startOfMonth(originalInstallmentStartDate));
          const currentInstallmentNum = monthDiff + 1;

          console.log(`Dashboard: TRACER --- recentExpenses (Installment Check): ID: ${t.id}, OrigDate: ${t.date}, monthDiff: ${monthDiff}, currentNum: ${currentInstallmentNum}, totalInst: ${t.installments}`);

          if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
            const projectedDateDay = getDateFns(originalInstallmentStartDate);
            let projectedDate = setDateFnsDate(startOfMonth(displayedDate), projectedDateDay);
            
            const lastDayOfDisplayedMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(startOfMonth(displayedDate), Math.min(projectedDateDay, getDateFns(lastDayOfDisplayedMonth)));
            }
            
            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(projectedDate, "yyyy-MM-dd"),
              description: `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`,
              id: `${t.id}_inst_${currentInstallmentNum}_${targetEffectiveMonth}`
            });
            console.log(`Dashboard: TRACER --- recentExpenses: Added projected installment: ${t.description} (${currentInstallmentNum}/${t.installments}), ProjectedDate: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          }
        } else if (t.isRecurring && t.expenseType !== 'installment') { 
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          if (startOfMonth(originalTransactionDate) <= startOfMonth(displayedDate)) {
            const projectedDateDay = getDateFns(originalTransactionDate);
            let projectedDate = setDateFnsDate(startOfMonth(displayedDate), projectedDateDay);

            const lastDayOfDisplayedMonth = lastDayOfMonth(displayedDate);
            if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
                 projectedDate = setDateFnsDate(startOfMonth(displayedDate), Math.min(projectedDateDay, getDateFns(lastDayOfDisplayedMonth)));
            }

            monthlyDisplayTransactions.push({
              ...t,
              date: formatDateFns(projectedDate, "yyyy-MM-dd"),
              id: `${t.id}_proj_${targetEffectiveMonth}`
            });
             console.log(`Dashboard: TRACER --- recentExpenses: Added projected recurring: ${t.description}, OrigDate: ${t.date}, ProjectedDate: ${formatDateFns(projectedDate, "yyyy-MM-dd")}`);
          } else {
             console.log(`Dashboard: TRACER --- recentExpenses: Skipped projected recurring (starts after displayed month): ${t.description}, OrigDate: ${t.date}`);
          }
        } else if (!t.isRecurring && t.expenseType !== 'installment' && t.effectiveMonth === targetEffectiveMonth) { 
          monthlyDisplayTransactions.push(t);
          console.log(`Dashboard: TRACER --- recentExpenses: Added non-recurring: ${t.description}, Date: ${t.date}, EffMonth: ${t.effectiveMonth}`);
        }
      }
    });

    const sorted = monthlyDisplayTransactions
      .sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    console.log(`Dashboard: TRACER --- recentExpenses: Found ${sorted.length} items for display for ${targetEffectiveMonth}.`);
    return sorted;
  }, [transactions, displayedDate, displayedMonthYearLabel, translate]); 

  const recentExpensesToDisplay = useMemo(() => {
    return showAllRecentExpenses ? fullRecentExpensesList : fullRecentExpensesList.slice(0,5);
  },[fullRecentExpensesList, showAllRecentExpenses]);


  const overallLoading = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences || isLoadingBudgets;

  console.log("Dashboard: TRACER --- RENDERING with: displayedMonth:", displayedMonthYearLabel, "transactionsInPeriod:", transactionsForDisplayedPeriod.length, "totalIncomeForSummary:", totalIncomeForSummary, "totalExpensesForSummary:", totalExpensesForSummary);
  if (overallLoading) {
    console.log("Dashboard: TRACER --- RENDERING LOADING SCREEN. isClient:", isClient, "authLoading:", authLoading, "isLoadingTransactions:", isLoadingTransactions, "isLoadingPreferences:", isLoadingPreferences, "isLoadingBudgets:", isLoadingBudgets);
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full">
          <div className="space-y-4 w-full p-4">
            <Skeleton className="h-10 w-1/3 mb-4" /> 
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={`summary-skel-${i}`} className="h-24 w-full" />)}
            </div>
             <Card className="shadow-lg bg-muted/50">
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <Terminal className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
                <div className="flex-grow">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-md bg-muted/50">
              <CardHeader>
                <Skeleton className="h-6 w-1/4 mb-2"/>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
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
  console.log("Dashboard: TRACER --- RENDERING DASHBOARD CONTENT. Transactions:", transactions.length, "isLoadingTransactions:", isLoadingTransactions, "Displayed Period Transactions:", transactionsForDisplayedPeriod.length);

  return (
    <AppLayout>
      <div className="space-y-8">
        <SummarySection
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod}
          monthlyBudget={totalCalculatedMonthlyBudget}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />
         <Card className="shadow-lg bg-muted/50">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Terminal className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
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
                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center">
                  <p className="text-sm font-medium text-foreground mb-1">
                    {translate({ en: "Largest Expense Category", pt: "Principal Categoria de Gasto" })}:
                  </p>
                  {largestExpenseCategoryForDisplayedPeriod ? (
                    <>
                      <div className="flex items-center gap-2 mt-1">
                        <CategoryIcon iconName={largestExpenseCategoryForDisplayedPeriod.icon} className="h-7 w-7 text-primary" />
                        <span className="font-semibold text-lg text-foreground">
                          {getCategoryDisplayLabel(largestExpenseCategoryForDisplayedPeriod, language)}
                        </span>
                      </div>
                      <p className="text-xl font-bold text-primary mt-1">
                        {formatCurrency(largestExpenseCategoryForDisplayedPeriod.amount)}
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full">
                       <p className="text-sm text-muted-foreground mt-2">
                        {translate({ en: "N/A", pt: "N/D"})}
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center">
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

                <div className="p-4 rounded-lg bg-background dark:bg-card flex flex-col items-center text-center">
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
            description={translate({ en: "Your latest income entries for", pt: "Suas últimas entradas de receita para" }) + " " + displayedMonthYearLabel}
            transactions={recentIncomeToDisplay}
            allUserCategories={userCategories}
            type="income"
            onSeeMore={() => setShowAllRecentIncome(prev => !prev)}
            isExpanded={showAllRecentIncome}
            totalItemsForMonth={fullRecentIncomeList.length}
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={translate({ en: "Your latest expense entries for", pt: "Suas últimas entradas de despesa para" }) + " " + displayedMonthYearLabel}
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

