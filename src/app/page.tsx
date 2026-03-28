
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from 'next/navigation';

// UI Components
import { AppLayout } from "@/components/layout/app-layout";
import { Skeleton } from "@/components/ui/skeleton";

// Dashboard Components
import { SummarySection } from "@/components/dashboard/summary-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import { ExpenseCategoryChart } from '@/components/dashboard/charts/expense-category-chart';
import { AryaQuickAdd } from '@/components/dashboard/arya-quick-add';

// Types & Data
import type { Transaction, DisplayCategory, DisplayPaymentMethod } from "@/types";
import { CATEGORIES as defaultCategories, PAYMENT_METHODS as defaultPaymentMethods } from '@/types';

// Hooks & Contexts
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";

// Firebase & Date-fns
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, doc, Timestamp, addDoc, serverTimestamp, runTransaction, getDocs, setDoc } from "firebase/firestore";
import {
  format as formatDateFns,
  parseISO as parseISODateFns,
  parse as parseDateFns,
  startOfMonth,
  differenceInCalendarMonths,
} from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';


export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const router = useRouter();
  const { translate, language } = useLanguage();
  const { displayedDate } = useDateNavigation();
  const { toast } = useToast();

  // State Management
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allUserCategories, setAllUserCategories] = useState<DisplayCategory[]>([...defaultCategories]);
  const [allUserPaymentMethods, setAllUserPaymentMethods] = useState<DisplayPaymentMethod[]>([...defaultPaymentMethods]);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(0);
  const [isSubscriptionActive, setIsSubscriptionActive] = useState(true); // Assuming active
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  
  const [isIncomeExpanded, setIsIncomeExpanded] = useState(false);
  const [isExpenseExpanded, setIsExpenseExpanded] = useState(false);
  
  // Extracted transaction from Arya Quick Add
  const [extractedTransaction, setExtractedTransaction] = useState<any>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const displayedMonthYearLabel = useMemo(() => {
    return formatDateFns(displayedDate, 'MMMM yyyy', { locale: language === 'pt' ? ptBR : enUS });
  }, [displayedDate, language]);
  
  const targetEffectiveMonth = useMemo(() => {
      return formatDateFns(displayedDate, "yyyy-MM");
  }, [displayedDate]);

  // Main Data Fetching Effect (Transactions, Categories, Payment Methods)
  useEffect(() => {
    if (!userId || authLoading || !isClient) {
      if (!authLoading && !userId && isClient) router.push('/login');
      return;
    }

    setIsLoading(true);
    const unsubscribes: (() => void)[] = [];

    // Transactions Listener
    const transactionsColRef = collection(db, 'users', userId, 'transactions');
    unsubscribes.push(onSnapshot(query(transactionsColRef), (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let dateString = data.date;
        let effectiveMonthString = data.effectiveMonth;
        let recurrenceEndDateString = data.recurrenceEndDate;

        if (data.recurrenceEndDate && data.recurrenceEndDate instanceof Timestamp) {
          recurrenceEndDateString = formatDateFns(data.recurrenceEndDate.toDate(), "yyyy-MM-dd");
        }

        if (data.date && data.date instanceof Timestamp) {
          dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
        } else if (typeof data.date === 'string') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
                try { dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); } catch {
                    try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd"); } catch { dateString = formatDateFns(new Date(), "yyyy-MM-dd"); }
                }
            }
        } else { dateString = formatDateFns(new Date(), "yyyy-MM-dd"); }

        if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
          effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date()), "yyyy-MM");
        }

        return { ...data, id: docSnap.id, date: dateString, effectiveMonth: effectiveMonthString, isRecurring: data.isRecurring === true, recurrenceEndDate: recurrenceEndDateString } as Transaction;
      });
      setAllTransactions(fetchedTransactions);
    }, (error) => {
      console.error("Dashboard: Error fetching transactions:", error);
      toast({ title: "Error", description: "Could not fetch transactions.", variant: "destructive" });
    }));

    // Categories and Payment Methods Listener
    const preferencesDocRef = doc(db, 'users', userId, 'preferences', 'userPreferences');
    unsubscribes.push(onSnapshot(preferencesDocRef, async (docSnap) => {
      let finalCategories: DisplayCategory[] = [];
      let finalPaymentMethods: DisplayPaymentMethod[] = [];
      
      const predefinedCategoriesMap = new Map(defaultCategories.map(cat => [cat.name.toLowerCase(), { ...cat }]));
      const predefinedPaymentMethodsMap = new Map(defaultPaymentMethods.map(pm => [pm.name.toLowerCase(), { ...pm }]));

      if (docSnap.exists()) {
        const prefsData = docSnap.data();
        
        // Categories
        const userDefinedCategoriesFromPrefs = prefsData.userDefinedCategories || [];
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map((name: string) => name.toLowerCase()));

        predefinedCategoriesMap.forEach((pCat, pCatNameLower) => {
          const customOverride = userDefinedCategoriesFromPrefs.find((udc: any) => udc.name.toLowerCase() === pCatNameLower);
          if (customOverride) {
            if(!deselectedPredefinedCatNames.has(pCatNameLower)){
                 finalCategories.push({ ...pCat, ...customOverride });
            }
          } else if (!deselectedPredefinedCatNames.has(pCatNameLower)) {
            finalCategories.push({ ...pCat });
          }
        });
        userDefinedCategoriesFromPrefs.forEach((customCat: any) => {
          if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
            finalCategories.push(customCat);
          }
        });
        if (finalCategories.length === 0 && defaultCategories.length > 0) {
          finalCategories = [...defaultCategories]; 
        }
        setAllUserCategories(finalCategories);

        // Payment Methods
        const userDefinedPaymentMethodsFromPrefs = prefsData.userDefinedPaymentMethods || [];
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map((name: string) => name.toLowerCase()));
        
        predefinedPaymentMethodsMap.forEach((pMethod, pMethodNameLower) => {
          const customOverride = userDefinedPaymentMethodsFromPrefs.find((udpm: any) => udpm.name.toLowerCase() === pMethodNameLower);
          if (customOverride) {
            if(!deselectedPredefinedPmNames.has(pMethodNameLower)){
                 finalPaymentMethods.push({ ...pMethod, ...customOverride });
            }
          } else if (!deselectedPredefinedPmNames.has(pMethodNameLower)) {
            finalPaymentMethods.push({ ...pMethod });
          }
        });
        userDefinedPaymentMethodsFromPrefs.forEach((customMethod: any) => {
          if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customMethod.name.toLowerCase())) {
            finalPaymentMethods.push(customMethod);
          }
        });
        if (finalPaymentMethods.length === 0 && defaultPaymentMethods.length > 0) {
          finalPaymentMethods = [...defaultPaymentMethods]; 
        }
        setAllUserPaymentMethods(finalPaymentMethods);
      } else {
        // Migration logic: if userPreferences doesn't exist, fetch legacy data and create it
        try {
          const legacyCategoriesSnap = await getDocs(collection(db, 'users', userId, 'categories'));
          const legacyCategories = legacyCategoriesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as unknown as DisplayCategory[];
          
          const legacyPaymentMethodsSnap = await getDocs(collection(db, 'users', userId, 'paymentMethods'));
          const legacyPaymentMethods = legacyPaymentMethodsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as unknown as DisplayPaymentMethod[];
          
          const newPrefs = {
            userDefinedCategories: legacyCategories,
            userDefinedPaymentMethods: legacyPaymentMethods,
            deselectedPredefinedCategories: [],
            deselectedPredefinedPaymentMethods: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          
          await setDoc(preferencesDocRef, newPrefs);
          // The onSnapshot will trigger again with the new data
        } catch (migrationError) {
          console.error("Error migrating legacy preferences:", migrationError);
          setAllUserCategories([...defaultCategories]);
          setAllUserPaymentMethods([...defaultPaymentMethods]);
        }
      }
    }, (error) => {
        console.error("Error fetching preferences:", error);
        setAllUserCategories([...defaultCategories]);
        setAllUserPaymentMethods([...defaultPaymentMethods]);
    }));

    // Set loading to false after a delay
    const timer = setTimeout(() => setIsLoading(false), 1500);
    unsubscribes.push(() => clearTimeout(timer));

    return () => unsubscribes.forEach(unsub => unsub());
  }, [userId, authLoading, isClient, router, toast]);

  // Budget-specific fetching effect
  useEffect(() => {
    if (!userId) return;

    const budgetDocRef = doc(db, 'users', userId, 'budgets', targetEffectiveMonth);
    const unsubscribe = onSnapshot(budgetDocRef, (docSnap) => {
      setMonthlyBudget(docSnap.exists() ? docSnap.data().amount : 0);
    }, (error) => {
      console.error("Error fetching budget:", error);
      setMonthlyBudget(0); // Reset or handle error appropriately
    });
    
    return () => unsubscribe();
  }, [userId, targetEffectiveMonth]);

  // Save Transaction Handler for QuickActions
  const handleSaveTransaction = useCallback(async (transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, id?:string) => {
      if (!userId) throw new Error("User not authenticated");
      const docData = { ...transactionData, userId, updatedAt: serverTimestamp() };

      try {
          await runTransaction(db, async (transaction) => {
              const transactionRef = id ? doc(db, 'users', userId, 'transactions', id) : collection(db, 'users', userId, 'transactions');
              if (id) {
                  transaction.update(doc(db, 'users', userId, 'transactions', id), docData);
              } else {
                  await addDoc(collection(db, 'users', userId, 'transactions'), { ...docData, createdAt: serverTimestamp() });
              }
          });
          toast({ title: "Success", description: "Transaction saved successfully." });
      } catch (error) {
          console.error("Error saving transaction: ", error);
          toast({ title: "Error", description: "Failed to save transaction.", variant: "destructive" });
          throw error;
      }
  }, [userId, toast]);

  // Memoized transaction filtering
  const transactionsForDisplayedPeriod = useMemo(() => {
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    return allTransactions.filter(t => {
      if (t.expenseType === 'installment' && t.installments) {
        const seriesStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date());
        const monthDiff = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(seriesStartDate));
        return monthDiff >= 0 && monthDiff < t.installments;
      }
      if (t.isRecurring) {
        const seriesStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date());
        const hasEnded = t.recurrenceEndDate && firstDayOfDisplayedMonth > parseDateFns(t.recurrenceEndDate, 'yyyy-MM-dd', new Date());
        return firstDayOfDisplayedMonth >= startOfMonth(seriesStartDate) && !hasEnded;
      }
      return t.effectiveMonth === targetEffectiveMonth;
    });
  }, [allTransactions, displayedDate, targetEffectiveMonth]);

  const allIncomesForPeriod = useMemo(() => transactionsForDisplayedPeriod.filter(t => t.type === 'income').sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime()), [transactionsForDisplayedPeriod]);
  const allExpensesForPeriod = useMemo(() => transactionsForDisplayedPeriod.filter(t => t.type === 'expense').sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime()), [transactionsForDisplayedPeriod]);

  const displayedIncomes = useMemo(() => isIncomeExpanded ? allIncomesForPeriod : allIncomesForPeriod.slice(0, 5), [allIncomesForPeriod, isIncomeExpanded]);
  const displayedExpenses = useMemo(() => isExpenseExpanded ? allExpensesForPeriod : allExpensesForPeriod.slice(0, 5), [allExpensesForPeriod, isExpenseExpanded]);

  const isLoadingPage = !isClient || authLoading || isLoading;

  if (isLoadingPage) {
    return (
      <AppLayout>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mt-6">
          <Skeleton className="h-80 w-full rounded-lg" />
          <Skeleton className="h-80 w-full rounded-lg" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <SummarySection 
          transactionsForDisplayedPeriod={transactionsForDisplayedPeriod} 
          monthlyBudget={monthlyBudget}
          displayedMonthYearLabel={displayedMonthYearLabel}
        />
        <AryaQuickAdd 
          onQuickAdd={(data) => setExtractedTransaction(data)} 
          disabled={!isSubscriptionActive}
          userCategories={allUserCategories}
          userPaymentMethods={allUserPaymentMethods}
          recentTransactions={transactionsForDisplayedPeriod}
        />
        
        <QuickActionsSection 
          onSave={handleSaveTransaction}
          currentDisplayedDate={displayedDate}
          userCategories={allUserCategories}
          userPaymentMethods={allUserPaymentMethods}
          isSubscriptionActive={isSubscriptionActive}
          preFilledTransaction={extractedTransaction}
          onClearPreFilled={() => setExtractedTransaction(null)}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RecentTransactionsSection
            title={translate({ en: "Recent Incomes", pt: "Receitas Recentes" })}
            description={`${translate({ en: 'Your latest income for', pt: 'Suas últimas entradas de receita para' })} ${displayedMonthYearLabel}`}
            transactions={displayedIncomes}
            allUserCategories={allUserCategories}
            type="income"
            onSeeMore={() => setIsIncomeExpanded(!isIncomeExpanded)}
            isExpanded={isIncomeExpanded}
            totalItemsForMonth={allIncomesForPeriod.length}
          />
          <RecentTransactionsSection
            title={translate({ en: "Recent Expenses", pt: "Despesas Recentes" })}
            description={`${translate({ en: 'Your latest expenses for', pt: 'Suas últimas entradas de despesa para' })} ${displayedMonthYearLabel}`}
            transactions={displayedExpenses}
            allUserCategories={allUserCategories}
            type="expense"
            onSeeMore={() => setIsExpenseExpanded(!isExpenseExpanded)}
            isExpanded={isExpenseExpanded}
            totalItemsForMonth={allExpensesForPeriod.length}
          />
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          <ExpenseCategoryChart 
            transactions={allExpensesForPeriod} 
            allUserCategories={allUserCategories} 
          />
        </div>
      </div>
    </AppLayout>
  );
}
