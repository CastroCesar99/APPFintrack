
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionForm } from "@/components/dashboard/transaction-form";
import { TransactionItemCard } from "@/components/transactions/transaction-item-card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, ArrowUpDown } from "lucide-react";
import type { Transaction, DisplayCategory, DisplayPaymentMethod, UserPreferences, CustomCategoryData, CustomPaymentMethodData, CategoryName } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, serverTimestamp, Timestamp, doc, deleteDoc, getDoc, type Unsubscribe, writeBatch } from "firebase/firestore";
import { 
  format as formatDateFns, 
  parseISO as parseISODateFns, 
  getYear as getYearFns, 
  getMonth as getMonthFns, 
  parse as parseDateFns,
  startOfMonth,
  getDate as getDateFns,
  setDate as setDateFnsDate,
  lastDayOfMonth,
  differenceInCalendarMonths,
  endOfMonth,
  subMonths
} from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type SortOptionValue = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc' | 'categoryAsc' | 'descriptionAsc';

export default function ExpensesPage() {
  const { user, loading: authLoading, isSubscriptionActive } = useAuth();
  const userId = user?.uid;
  const router = useRouter();
  const { language, translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);

  const [isClient, setIsClient] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [showSubscriptionAlert, setShowSubscriptionAlert] = useState(false);

  const [userCategories, setUserCategories] = useState<DisplayCategory[]>([]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const unsubscribePreferencesRef = useRef<Unsubscribe | null>(null);

  const [sortOption, setSortOption] = useState<SortOptionValue>('dateDesc');

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Listener for User Preferences
  useEffect(() => {
    if (!userId || !isClient || authLoading) {
      const defaultCats: DisplayCategory[] = [...CATEGORIES];
      const defaultPms: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
      setUserCategories(defaultCats.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
      setUserPaymentMethods(defaultPms.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
      setIsLoadingPreferences(false);
      if (unsubscribePreferencesRef.current) {
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
      }
      return;
    }

    setIsLoadingPreferences(true);
    const preferencesDocRef = doc(db, 'users', userId, 'preferences/userPreferences');

    if (unsubscribePreferencesRef.current) {
        unsubscribePreferencesRef.current();
        unsubscribePreferencesRef.current = null;
    }

    unsubscribePreferencesRef.current = onSnapshot(preferencesDocRef, (docSnap) => {
      let finalCategories: DisplayCategory[] = [];
      let finalPaymentMethods: DisplayPaymentMethod[] = [];
      
      const predefinedCategoriesMap = new Map(CATEGORIES.map(cat => [cat.name.toLowerCase(), { ...cat }]));
      const predefinedPaymentMethodsMap = new Map(PAYMENT_METHODS.map(pm => [pm.name.toLowerCase(), { ...pm }]));

      if (docSnap.exists()) {
        const prefsData = docSnap.data() as UserPreferences;
        const userDefinedCategoriesFromPrefs: CustomCategoryData[] = prefsData.userDefinedCategories || [];
        const deselectedPredefinedCatNames = new Set((prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase()));

        predefinedCategoriesMap.forEach((pCat, pCatNameLower) => {
          const customOverride = userDefinedCategoriesFromPrefs.find(udc => udc.name.toLowerCase() === pCatNameLower);
          if (customOverride) { // If custom override exists, use it
            if(!deselectedPredefinedCatNames.has(pCatNameLower)){ // and if not deselected
                 finalCategories.push({ ...pCat, ...customOverride });
            }
          } else if (!deselectedPredefinedCatNames.has(pCatNameLower)) { // If no custom override, use predefined if not deselected
            finalCategories.push({ ...pCat });
          }
        });
        userDefinedCategoriesFromPrefs.forEach(customCat => { // Add purely custom categories
          if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
            finalCategories.push(customCat);
          }
        });
         if (finalCategories.length === 0 && CATEGORIES.length > 0) { // Fallback if all are deselected
          finalCategories = [...CATEGORIES]; 
        }


        const userDefinedPaymentMethodsFromPrefs: CustomPaymentMethodData[] = prefsData.userDefinedPaymentMethods || [];
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        
        predefinedPaymentMethodsMap.forEach((pPm, pPmNameLower) => {
          const customOverride = userDefinedPaymentMethodsFromPrefs.find(udpm => udpm.name.toLowerCase() === pPmNameLower);
          if (customOverride) {
            if(!deselectedPredefinedPmNames.has(pPmNameLower)){
                 finalPaymentMethods.push({ ...pPm, ...customOverride });
            }
          } else if (!deselectedPredefinedPmNames.has(pPmNameLower)) {
            finalPaymentMethods.push({ ...pPm });
          }
        });
        userDefinedPaymentMethodsFromPrefs.forEach(customPm => {
            if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customPm.name.toLowerCase())) {
                finalPaymentMethods.push(customPm);
            }
        });
        if (finalPaymentMethods.length === 0 && PAYMENT_METHODS.length > 0) { // Fallback
          finalPaymentMethods = [...PAYMENT_METHODS];
        }

      } else { 
        finalCategories = [...CATEGORIES];
        finalPaymentMethods = [...PAYMENT_METHODS];
      }
      
      setUserCategories(finalCategories.sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
      setUserPaymentMethods(finalPaymentMethods.sort((a,b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
      setIsLoadingPreferences(false);
    }, (error) => {
      console.error("ExpensesPage: Error listening to user preferences:", error);
      toast({
        title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }),
        description: translate({ en: "Could not load your preferences.", pt: "Não foi possível carregar suas preferências." }),
        variant: "destructive",
      });
      setUserCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b,language))));
      setUserPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
      setIsLoadingPreferences(false);
    });
    
    return () => {
      if (unsubscribePreferencesRef.current) {
        unsubscribePreferencesRef.current();
      }
    };
  }, [userId, isClient, authLoading, language, toast, translate]);


   // Fetch all transactions
   useEffect(() => {
    if (!userId || authLoading || !isClient) {
      if (!authLoading && !userId && isClient) router.push('/login');
      setAllTransactions([]);
      setIsLoadingTransactions(false);
      return;
    }

    setIsLoadingTransactions(true);
    const transactionsColRef = collection(db, 'users', userId, 'transactions');
    const q_transactions = query(transactionsColRef); 

    const unsubscribe = onSnapshot(q_transactions, (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let dateString = data.date; 
        let effectiveMonthString = data.effectiveMonth;
        let recurrenceEndDateString = data.recurrenceEndDate;

// Ensure recurrenceEndDate is a string if it's a Timestamp
if (data.recurrenceEndDate && data.recurrenceEndDate instanceof Timestamp) {
  recurrenceEndDateString = formatDateFns(data.recurrenceEndDate.toDate(), "yyyy-MM-dd");
}

        if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
          dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
        } else if (typeof data.date === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
                // Already in YYYY-MM-DD
            } else if (data.date.includes('T')) { 
                try { 
                    dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd"); 
                } catch (e1){ 
                   try { 
                       dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                   } catch (e2){
                       console.warn("ExpensesPage: Failed to parse existing datetime string to yyyy-MM-dd (fallback for " + String(data.date) + "): " + String(e2));
                       dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                   }
                }
            } else {
                 console.warn("ExpensesPage: Transaction has unexpected date string format. Attempting general parse. Date was:", data.date, "ID:", docSnap.id);
                 try {
                    dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                 } catch (e) {
                    console.warn("ExpensesPage: General parse failed for date string. Fallback to current date. Date was:", data.date, "ID:", docSnap.id, e);
                    dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                 }
            }
        } else {
           console.warn("ExpensesPage: Transaction has missing or non-string/non-Timestamp date. Fallback to current date YYYY-MM-DD. Date was:", data.date, "ID:", docSnap.id);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
        }

        if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
             if (dateString && dateString !== "1970-01-01") {
                try {
                    effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                } catch (e) {
                    console.warn("ExpensesPage TX effectiveMonth Derivation: Failed for tx " + docSnap.id + " from date " + dateString + ". Error: " + String(e) + ". Fallback to current month.");
                    effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                }
             } else {
                console.warn("ExpensesPage TX effectiveMonth Derivation: Date string invalid or missing for tx " + docSnap.id + ". Fallback to current month.");
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
          expenseNature: data.expenseNature,
          recurrenceEndDate: recurrenceEndDateString, // Use the processed string
        } as Transaction;
      });
      setAllTransactions(fetchedTransactions);
      setIsLoadingTransactions(false);
    }, (error) => {
      console.error("ExpensesPage: Error fetching transactions:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not fetch transactions.", pt: "Não foi possível buscar as transações." }),
        variant: "destructive",
      });
      setAllTransactions([]);
      setIsLoadingTransactions(false);
    });

    return () => unsubscribe();
  }, [userId, authLoading, isClient, toast, translate, router]);

  const getCategoryObjectByName = useCallback((name: string): DisplayCategory | undefined => {
    return userCategories.find(cat => cat.name.toLowerCase() === name.toLowerCase());
  }, [userCategories]);

  const expensesForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
        
    const monthlyDisplayTransactions: Transaction[] = [];
    
    allTransactions.forEach(t => {
      if (t.type !== 'expense') return;

      let includeTransaction = false;
      let modifiedDescription = t.description; 
      let displayDate = t.date;

      if (t.expenseType === 'installment' && t.installments && t.installments > 0) {
        const installmentSeriesEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        const monthDiff = differenceInCalendarMonths(firstDayOfDisplayedMonth, startOfMonth(installmentSeriesEffectiveStartDate));
        const currentInstallmentNum = monthDiff + 1;

        if (currentInstallmentNum >= 1 && currentInstallmentNum <= t.installments) {
          includeTransaction = true;
          modifiedDescription = `${t.description} (${translate({en: "Installment", pt: "Parcela"})}) ${currentInstallmentNum}/${t.installments}`;
          displayDate = t.date;
        }
      } else if (t.isRecurring === true && t.expenseType !== 'installment') { 
        const recurrenceEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        const hasEnded = t.recurrenceEndDate && firstDayOfDisplayedMonth > parseDateFns(t.recurrenceEndDate, 'yyyy-MM-dd', new Date(0));
        
        if (startOfMonth(recurrenceEffectiveStartDate) <= firstDayOfDisplayedMonth && !hasEnded) {
          includeTransaction = true;
          displayDate = t.date;
        }
      } else if (t.effectiveMonth === targetEffectiveMonth) {
        includeTransaction = true;
        displayDate = t.date;
      }
      
      if (includeTransaction) {
        monthlyDisplayTransactions.push({
          ...t,
          date: displayDate, 
          description: modifiedDescription,
          id: (t.expenseType === 'installment' || (t.isRecurring && t.expenseType !== 'installment')) 
            ? `${t.id}_proj_${targetEffectiveMonth}` 
            : t.id 
        });
      }
    });

    if (sortOption === 'dateAsc') {
      monthlyDisplayTransactions.sort((a, b) => parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime());
    } else if (sortOption === 'dateDesc') {
      monthlyDisplayTransactions.sort((a, b) => parseDateFns(b.date, "yyyy-MM-dd", new Date(0)).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date(0)).getTime());
    } else if (sortOption === 'amountAsc') {
      monthlyDisplayTransactions.sort((a, b) => a.amount - b.amount);
    } else if (sortOption === 'amountDesc') {
      monthlyDisplayTransactions.sort((a, b) => b.amount - a.amount);
    } else if (sortOption === 'categoryAsc') {
      monthlyDisplayTransactions.sort((a, b) => {
        const catA = getCategoryObjectByName(a.category as string);
        const catB = getCategoryObjectByName(b.category as string);
        const labelA = catA ? getCategoryDisplayLabel(catA, language) : (a.category as string);
        const labelB = catB ? getCategoryDisplayLabel(catB, language) : (b.category as string);
        return labelA.localeCompare(labelB);
      });
    } else if (sortOption === 'descriptionAsc') {
      monthlyDisplayTransactions.sort((a, b) => a.description.localeCompare(b.description));
    }

    return monthlyDisplayTransactions;
  }, [allTransactions, displayedDate, sortOption, language, getCategoryObjectByName, translate]);

  const handleOpenAddDialog = () => {
    if (!isSubscriptionActive) {
      setShowSubscriptionAlert(true);
      return;
    }
    setTransactionToEdit(null);
    setIsAddFormOpen(true);
  };

  const handleOpenEditDialog = (transactionId: string) => {
    const originalId = transactionId.includes("_proj_") ? transactionId.split("_proj_")[0] : transactionId;
    const originalTransaction = allTransactions.find(t => t.id === originalId);
    if (originalTransaction) {
      setTransactionToEdit(originalTransaction);
      setIsEditFormOpen(true);
    } else {
      toast({ title: translate({en:"Error", pt:"Erro"}), description: translate({en:"Original transaction not found for editing.", pt:"Transação original para edição não encontrada."}), variant: "destructive" });
    }
  };

  const handleSaveTransaction = async (formData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, idToUpdate?: string) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
  
    const originalTransaction = idToUpdate ? allTransactions.find(t => t.id === idToUpdate) : null;
    const viewEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const isEditingFutureRecurring = idToUpdate && originalTransaction?.isRecurring && originalTransaction.effectiveMonth < viewEffectiveMonth;

    if (isEditingFutureRecurring) {
      try {
        const batch = writeBatch(db);
        const originalDocRef = doc(db, "users", userId, "transactions", idToUpdate);
        const newEndDate = endOfMonth(subMonths(displayedDate, 1));
        batch.update(originalDocRef, { recurrenceEndDate: formatDateFns(newEndDate, "yyyy-MM-dd") });
  
        const payload = { ...formData, effectiveMonth: viewEffectiveMonth, userId, createdAt: serverTimestamp() };
        const dataToSave = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined));
        dataToSave.isRecurring = dataToSave.expenseType === 'recurring';
        const newDocRef = doc(collection(db, "users", userId, "transactions"));
        batch.set(newDocRef, dataToSave);
  
        await batch.commit();
        toast({ title: translate({en: "Recurring Expense Updated", pt:"Despesa Recorrente Atualizada"}), description: translate({en: "Changes will apply from this month forward.", pt: "As alterações serão aplicadas a partir deste mês."}) });
        
      } catch (error: any) {
        console.error("ExpensesPage: Error splitting recurring expense:", error);
        toast({ title: translate({en: "Error", pt: "Erro"}), description: translate({en:"Could not update recurring expense.", pt: "Não foi possível atualizar a despesa recorrente."}), variant: "destructive" });
      }
    } else if (idToUpdate) {
      const payload = { ...formData, updatedAt: serverTimestamp() };
      const dataToSave = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined));
       if (dataToSave.type === 'expense') { dataToSave.isRecurring = dataToSave.expenseType === 'recurring'; }

      const docRef = doc(db, "users", userId, "transactions", idToUpdate);
      try {
        await updateDoc(docRef, dataToSave);
        toast({ title: translate({en: "Expense Updated", pt: "Despesa Atualizada"}), description: `${formData.description} ${translate({en:"has been updated.", pt: "foi atualizada."})}`});
      } catch (error: any) {
        console.error("ExpensesPage: Error updating expense:", error);
        toast({ title: translate({en:"Error Updating Expense", pt:"Erro ao Atualizar Despesa"}), description: error.message, variant: "destructive" });
      }
    } else {
      const payload = { ...formData, userId, createdAt: serverTimestamp() };
      const dataToSave = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined));
      if (dataToSave.type === 'expense') { dataToSave.isRecurring = dataToSave.expenseType === 'recurring'; }
      // For new transactions, effectiveMonth is taken from the form
      dataToSave.effectiveMonth = formData.effectiveMonth;

      try {
        await addDoc(collection(db, "users", userId, "transactions"), dataToSave);
        toast({ title: translate({en: "Expense Added", pt: "Despesa Adicionada"}), description: `${formData.description} ${translate({en: "has been added.", pt: "foi adicionada."})}` });
      } catch (error: any) {
        console.error("ExpensesPage: Error adding expense:", error);
        toast({ title: translate({en: "Error Adding Expense", pt: "Erro ao Adicionar Despesa"}), description: error.message, variant: "destructive" });
      }
    }
    setIsAddFormOpen(false);
    setIsEditFormOpen(false);
    setTransactionToEdit(null);
  };

  const openDeleteConfirmation = (transactionId: string) => {
     const originalId = transactionId.includes("_proj_") ? transactionId.split("_proj_")[0] : transactionId;
     const originalTransaction = allTransactions.find(t => t.id === originalId);
    if (originalTransaction) {
      setTransactionToDelete(originalTransaction);
    } else {
       toast({ title: translate({en:"Error", pt:"Erro"}), description: translate({en:"Transaction to delete not found.", pt:"Transação para excluir não encontrada."}), variant: "destructive" });
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!userId || !transactionToDelete) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Transaction not found or user not authenticated.", pt: "Transação não encontrada ou usuário não autenticado." }),
        variant: "destructive",
      });
      setTransactionToDelete(null);
      return;
    }

    try {
      const docRef = doc(db, "users", userId, "transactions", transactionToDelete.id); 
      await deleteDoc(docRef);
      toast({
        title: translate({ en: "Expense Deleted", pt: "Despesa Excluída" }),
        description: transactionToDelete.description + " " + translate({en: "has been deleted.", pt: "foi excluída."}),
      });
    } catch (error) {
      console.error("ExpensesPage: Error deleting expense:", error);
      toast({
        title: translate({ en: "Error Deleting Expense", pt: "Erro ao Excluir Despesa" }),
        description: translate({ en: "Could not delete the expense.", pt: "Não foi possível excluir a despesa." }),
        variant: "destructive",
      });
    } finally {
      setTransactionToDelete(null);
    }
  };

  const pageTitle = translate({ en: "Expenses", pt: "Despesas" });
  const isLoadingPage = !isClient || authLoading || isLoadingTransactions || isLoadingPreferences;

  const sortOptions = [
    { value: 'dateDesc', label: translate({ en: "Date (Newest First)", pt: "Data (Mais Recente)" }) },
    { value: 'dateAsc', label: translate({ en: "Date (Oldest First)", pt: "Data (Mais Antiga)" }) },
    { value: 'amountDesc', label: translate({ en: "Amount (Highest First)", pt: "Valor (Maior Primeiro)" }) },
    { value: 'amountAsc', label: translate({ en: "Amount (Lowest First)", pt: "Valor (Menor Primeiro)" }) },
    { value: 'categoryAsc', label: translate({ en: "Category (A-Z)", pt: "Categoria (A-Z)" }) },
    { value: 'descriptionAsc', label: translate({ en: "Description (A-Z)", pt: "Descrição (A-Z)" }) },
  ];

  return (
    <AppLayout>
      <div className="space-y-6"> 
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-4 sm:mb-0">
            {pageTitle} - {displayedMonthYearLabel}
          </h1>
          <Button onClick={handleOpenAddDialog} variant="outline" className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" />
            {translate({ en: "Add New Expense", pt: "Adicionar Nova Despesa" })}
          </Button>
        </div>

        <Dialog open={isAddFormOpen} onOpenChange={setIsAddFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{translate({ en: "New Expense", pt: "Nova Despesa" })}</DialogTitle>
              <DialogDescription>
                {translate({ en: "Fill in the details for your new expense.", pt: "Preencha os detalhes da sua nova despesa." })}
              </DialogDescription>
            </DialogHeader>
            <TransactionForm
              onSave={handleSaveTransaction}
              initialType="expense"
              transactionToEdit={null}
              defaultDate={displayedDate}
              userCategories={userCategories}
              userPaymentMethods={userPaymentMethods}
              key={"add-expense-" + displayedDate.toISOString()}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={isEditFormOpen} onOpenChange={setIsEditFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{translate({ en: "Edit Expense", pt: "Editar Despesa" })}</DialogTitle>
              <DialogDescription>
                {translate({ en: "Update the details of your expense.", pt: "Atualize os detalhes da sua despesa." })}
              </DialogDescription>
            </DialogHeader>
            {isEditFormOpen && transactionToEdit && (
              <TransactionForm
                onSave={handleSaveTransaction}
                initialType="expense"
                transactionToEdit={transactionToEdit}
                defaultDate={displayedDate} 
                userCategories={userCategories}
                userPaymentMethods={userPaymentMethods}
                key={"edit-expense-" + transactionToEdit.id}
              />
            )}
          </DialogContent>
        </Dialog>

        <div className="mb-4">
          <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOptionValue)}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <ArrowUpDown className="mr-2 h-4 w-4" />
              <SelectValue placeholder={translate({ en: "Sort by...", pt: "Ordenar por..."})} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold">{translate({ en: "Expense List", pt: "Lista de Despesas" })}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {translate({ en: "All your expenses for", pt: "Todas as suas despesas de" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingPage ? (
              <div className="grid grid-cols-1 gap-4">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)}
              </div>
            ) : expensesForDisplayedPeriod.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {expensesForDisplayedPeriod.map(tx => (
                  <TransactionItemCard
                    key={tx.id} 
                    transaction={tx}
                    allUserCategories={userCategories}
                    onEdit={() => handleOpenEditDialog(tx.id)}
                    onDelete={() => openDeleteConfirmation(tx.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No expenses recorded for this period.", pt: "Nenhuma despesa registrada para este período." })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showSubscriptionAlert} onOpenChange={setShowSubscriptionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate({ en: "Subscription Required", pt: "Assinatura Necessária" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate({ en: "You need an active subscription to add new transactions. Please renew your subscription to continue.", pt: "Você precisa de uma assinatura ativa para adicionar novas transações. Por favor, renove sua assinatura para continuar." })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translate({ en: "Cancel", pt: "Cancelar" })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push('/subscription')}>
              {translate({ en: "Go to Subscription", pt: "Ir para Assinatura" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {transactionToDelete && (
        <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translate({en: "Confirm Deletion", pt: "Confirmar Exclusão"})}</AlertDialogTitle>
              <AlertDialogDescription>
                {translate({en: "Are you sure you want to delete the expense: ", pt: "Tem certeza que deseja excluir a despesa: "})}
                <strong>{transactionToDelete.description}</strong> ({formatCurrency(transactionToDelete.amount)})?
                {translate({en: " This action cannot be undone.", pt: " Esta ação não pode ser desfeita."})}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>{translate({en: "Cancel", pt: "Cancelar"})}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteTransaction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {translate({en: "Delete", pt: "Excluir"})}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppLayout>
  );
}

    