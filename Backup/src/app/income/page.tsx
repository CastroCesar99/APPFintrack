"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from 'next/navigation';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionForm } from "@/components/dashboard/transaction-form";
import { TransactionItemCard } from "@/components/transactions/transaction-item-card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import type { Transaction, DisplayCategory, DisplayPaymentMethod, UserPreferences, CustomCategoryData, CustomPaymentMethodData } from "@/types";
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, serverTimestamp, Timestamp, doc, deleteDoc, getDoc, type Unsubscribe } from "firebase/firestore";
import { 
  format as formatDateFns, 
  parseISO as parseISODateFns, 
  getYear as getYearFns, 
  getMonth as getMonthFns, 
  parse as parseDateFns,
  startOfMonth,
  getDate as getDateFns,
  setDate as setDateFnsDate,
  lastDayOfMonth
} from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type SortOptionValue = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc' | 'categoryAsc' | 'descriptionAsc';

export default function IncomePage() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const router = useRouter();
  const { language, translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  const [userCategories, setUserCategories] = useState<DisplayCategory[]>([]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const unsubscribePreferencesRef = useRef<Unsubscribe | null>(null);

  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);

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
          if (!deselectedPredefinedCatNames.has(pCatNameLower)) {
            const customOverride = userDefinedCategoriesFromPrefs.find(udc => udc.name.toLowerCase() === pCatNameLower);
            finalCategories.push(customOverride ? { ...pCat, ...customOverride } : { ...pCat });
          }
        });
        userDefinedCategoriesFromPrefs.forEach(customCat => {
          if (!finalCategories.some(fc => fc.name.toLowerCase() === customCat.name.toLowerCase())) {
            finalCategories.push(customCat);
          }
        });
        if (finalCategories.length === 0 && CATEGORIES.length > 0) {
          finalCategories = [...CATEGORIES]; 
        }

        const userDefinedPaymentMethodsFromPrefs: CustomPaymentMethodData[] = prefsData.userDefinedPaymentMethods || [];
        const deselectedPredefinedPmNames = new Set((prefsData.deselectedPredefinedPaymentMethods || []).map(name => name.toLowerCase()));
        
        predefinedPaymentMethodsMap.forEach((pPm, pPmNameLower) => {
          if (!deselectedPredefinedPmNames.has(pPmNameLower)) {
            const customOverride = userDefinedPaymentMethodsFromPrefs.find(udpm => udpm.name.toLowerCase() === pPmNameLower);
            finalPaymentMethods.push(customOverride ? { ...pPm, ...customOverride } : { ...pPm });
          }
        });
        userDefinedPaymentMethodsFromPrefs.forEach(customPm => {
            if (!finalPaymentMethods.some(fpm => fpm.name.toLowerCase() === customPm.name.toLowerCase())) {
                finalPaymentMethods.push(customPm);
            }
        });
         if (finalPaymentMethods.length === 0 && PAYMENT_METHODS.length > 0) {
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
      console.error("IncomePage: Error listening to user preferences:", error);
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
  }, [userId, isClient, authLoading, language, toast, translate, displayedDate]); // Added displayedDate


  useEffect(() => {
    if (!userId || authLoading || !isClient) {
      if (!authLoading && !userId && isClient) router.push('/login');
      setIsLoadingTransactions(false);
      setAllTransactions([]);
      return;
    }

    setIsLoadingTransactions(true);
    const transactionsColRef = collection(db, "users", userId, "transactions");
    const q_transactions = query(transactionsColRef); // No order by date, will be handled by display logic

    const unsubscribe = onSnapshot(q_transactions, (querySnapshot) => {
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
                   try { 
                       dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                   } catch (e2) {
                       console.warn("IncomePage: Failed to parse existing datetime string to yyyy-MM-dd (fallback for " + String(data.date) + "): " + String(e2));
                       dateString = formatDateFns(new Date(), "yyyy-MM-dd");
                   }
                }
            } else {
                 console.warn("IncomePage: Transaction has unexpected date string format. Attempting general parse. Date was:", data.date, "ID:", docSnap.id);
                 try {
                    dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd");
                 } catch (e) {
                    console.warn("IncomePage: General parse failed for date string. Fallback to current date. Date was:", data.date, "ID:", docSnap.id, e);
                    dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
                 }
            }
        } else {
           console.warn("IncomePage: Transaction has missing or non-string/non-Timestamp date. Fallback to current date YYYY-MM-DD. Date was:", data.date, "ID:", docSnap.id);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
        }

        if (!effectiveMonthString || !/^\d{4}-\d{2}$/.test(effectiveMonthString)) {
             if (dateString && dateString !== "1970-01-01") {
                try {
                    effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
                } catch (e) {
                    console.warn('IncomePage TX effectiveMonth Derivation: Failed for tx ' + docSnap.id + ' from date ' + dateString + '. Error: ' + String(e) + '. Fallback to current month.');
                    effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
                }
             } else {
                console.warn('IncomePage TX effectiveMonth Derivation: Date string invalid or missing for tx ' + docSnap.id + '. Fallback to current month.');
                effectiveMonthString = formatDateFns(new Date(), "yyyy-MM");
             }
        }


        return {
          ...data,
          id: docSnap.id,
          date: dateString,
          effectiveMonth: effectiveMonthString,
          isRecurring: data.isRecurring === true,
        } as Transaction;
      });
      setAllTransactions(fetchedTransactions);
      setIsLoadingTransactions(false);
    }, (error) => {
      console.error("IncomePage: Error fetching transactions:", error);
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

  const incomeForDisplayedPeriod = useMemo(() => {
    const targetEffectiveMonth = formatDateFns(displayedDate, "yyyy-MM");
    const firstDayOfDisplayedMonth = startOfMonth(displayedDate);
    
    const monthlyDisplayTransactions: Transaction[] = [];
    console.log(`IncomePage: Calculating incomeForDisplayedPeriod for ${targetEffectiveMonth}. All transactions: ${allTransactions.length}`);

    allTransactions.forEach(t => {
      if (t.type !== 'income') return;

      let includeTransaction = false;
      let projectedDateForDisplayString = t.date; // Default to original date
      let reason = "";

      if (t.isRecurring) {
        reason = "Recurring Check";
        const recurrenceEffectiveStartDate = parseDateFns(t.effectiveMonth + "-01", "yyyy-MM-dd", new Date(0));
        if (startOfMonth(recurrenceEffectiveStartDate) <= firstDayOfDisplayedMonth) {
          includeTransaction = true;
          const originalTransactionDate = parseDateFns(t.date, "yyyy-MM-dd", new Date(0));
          const projectedDateDay = getDateFns(originalTransactionDate);
          let projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, projectedDateDay);
          const lastDayOfCurrentMonth = lastDayOfMonth(displayedDate);
          if (getDateFns(projectedDate) !== projectedDateDay || getMonthFns(projectedDate) !== getMonthFns(displayedDate)) {
               projectedDate = setDateFnsDate(firstDayOfDisplayedMonth, Math.min(projectedDateDay, getDateFns(lastDayOfCurrentMonth)));
          }
          projectedDateForDisplayString = formatDateFns(projectedDate, "yyyy-MM-dd");
        }
      } else if (t.effectiveMonth === targetEffectiveMonth) { 
        reason = "Non-Recurring (Effective Month Match)";
        includeTransaction = true;
      }
      
      console.log(`IncomePage TX Filter: ID: ${t.id}, Desc: ${t.description}, Date: ${t.date}, EffMonth: ${t.effectiveMonth}, Type: ${t.type}, isRec: ${t.isRecurring}, Amount: ${t.amount}, Included: ${includeTransaction}, Reason: ${reason}, ProjectedDate: ${projectedDateForDisplayString}, Target: ${targetEffectiveMonth}`);
      if (includeTransaction) {
        monthlyDisplayTransactions.push({
          ...t,
          date: projectedDateForDisplayString, // Use projected date for display
          id: t.isRecurring ? `${t.id}_proj_${targetEffectiveMonth}` : t.id 
        });
      }
    });

    // Sorting logic
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
  }, [allTransactions, displayedDate, sortOption, language, getCategoryObjectByName, translate]); // Added translate for description modification

  const handleOpenAddDialog = () => {
    setTransactionToEdit(null);
    setIsAddFormOpen(true);
  };

  const handleOpenEditDialog = (transactionId: string) => {
    const originalId = transactionId.includes("_proj_") ? transactionId.split("_proj_")[0] : transactionId;
    const tx = allTransactions.find(t => t.id === originalId);
    if (tx) {
      setTransactionToEdit(tx);
      setIsEditFormOpen(true);
    } else {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Transaction not found.", pt: "Transação não encontrada." }), variant: "destructive" });
    }
  };

  const handleSaveTransaction = async (formData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, idToUpdate?: string) => {
    if (!userId) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    
    // 'formData.date' is the actual transaction date from the calendar (YYYY-MM-DD)
    // 'effectiveMonth' is derived from 'displayedDate' (the month being viewed)
    const effectiveMonthForSave = formatDateFns(displayedDate, "yyyy-MM");

    const payload = { 
      ...formData, 
      type: 'income' as 'income', 
      effectiveMonth: effectiveMonthForSave, 
      userId 
    };
    
    const dataToSave = Object.fromEntries(
        Object.entries(payload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt?: any; updatedAt?: any; userId: string; effectiveMonth: string }>;

    if (dataToSave.isRecurring === undefined) {
      dataToSave.isRecurring = false;
    }


    if (idToUpdate) { 
      const transactionDocRef = doc(db, "users", userId, "transactions", idToUpdate);
      dataToSave.updatedAt = serverTimestamp();
      try {
        await updateDoc(transactionDocRef, dataToSave);
        toast({ title: translate({ en: "Income Updated", pt: "Receita Atualizada" }), description: formData.description + " " + translate({ en: "has been successfully updated.", pt: "foi atualizada com sucesso." }) });
        setIsEditFormOpen(false);
        setTransactionToEdit(null);
      } catch (error: any) {
        console.error("IncomePage: Error updating income:", error);
        toast({ title: translate({ en: "Error Updating Income", pt: "Erro ao Atualizar Receita" }), description: (error.message || translate({ en: "Could not update income.", pt: "Não foi possível atualizar a receita." })) + (error.code ? " (Code: " + error.code + ")" : ''), variant: "destructive" });
      }
    } else { 
      dataToSave.createdAt = serverTimestamp();
      try {
        const transactionsColRef = collection(db, "users", userId, "transactions");
        await addDoc(transactionsColRef, dataToSave);
        toast({ title: translate({ en: "Income Added", pt: "Receita Adicionada" }), description: formData.description + " " + translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." }) });
        setIsAddFormOpen(false);
      } catch (error: any) {
        console.error("IncomePage: Error adding income:", error);
        toast({ title: translate({ en: "Error Adding Income", pt: "Erro ao Adicionar Receita" }), description: (error.message || translate({ en: "Could not add income.", pt: "Não foi possível adicionar a receita." })) + (error.code ? " (Code: " + error.code + ")" : ''), variant: "destructive" });
      }
    }
  };

  const openDeleteConfirmation = (transactionId: string) => {
    const originalId = transactionId.includes("_proj_") ? transactionId.split("_proj_")[0] : transactionId;
    const tx = allTransactions.find(t => t.id === originalId);
    if (tx) {
      setTransactionToDelete(tx); 
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
        title: translate({ en: "Income Deleted", pt: "Receita Excluída" }),
        description: transactionToDelete.description + " " + translate({en: "has been deleted.", pt: "foi excluída."}),
      });
    } catch (error) {
      console.error("IncomePage: Error deleting income:", error);
      toast({
        title: translate({ en: "Error Deleting Income", pt: "Erro ao Excluir Receita" }),
        description: translate({ en: "Could not delete the income.", pt: "Não foi possível excluir a receita." }),
        variant: "destructive",
      });
    } finally {
      setTransactionToDelete(null);
    }
  };

  const pageTitle = translate({ en: "Income", pt: "Receitas" });
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
        <div className="sm:flex sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-4 sm:mb-0">
            {pageTitle} - {displayedMonthYearLabel}
          </h1>
          <Dialog open={isAddFormOpen} onOpenChange={setIsAddFormOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                {translate({ en: "Add New Income", pt: "Adicionar Nova Receita" })}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{translate({ en: "New Income", pt: "Nova Receita" })}</DialogTitle>
                <DialogDescription>
                  {translate({ en: "Fill in the details for your new income.", pt: "Preencha os detalhes da sua nova receita." })}
                </DialogDescription>
              </DialogHeader>
              <TransactionForm
                onSave={handleSaveTransaction}
                initialType="income"
                transactionToEdit={null}
                defaultDate={displayedDate}
                userCategories={userCategories}
                userPaymentMethods={userPaymentMethods}
                key={"add-income-" + displayedDate.toISOString()}
              />
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={isEditFormOpen} onOpenChange={setIsEditFormOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{translate({ en: "Edit Income", pt: "Editar Receita" })}</DialogTitle>
              <DialogDescription>
                {translate({ en: "Update the details of your income.", pt: "Atualize os detalhes da sua receita." })}
              </DialogDescription>
            </DialogHeader>
            {transactionToEdit && (
              <TransactionForm
                onSave={handleSaveTransaction}
                initialType="income"
                transactionToEdit={transactionToEdit}
                defaultDate={displayedDate} 
                userCategories={userCategories}
                userPaymentMethods={userPaymentMethods}
                key={"edit-income-" + transactionToEdit.id + "-" + displayedDate.toISOString()}
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
            <CardTitle className="text-2xl font-semibold">{translate({ en: "Income List", pt: "Lista de Receitas" })}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {translate({ en: "All your income for", pt: "Todas as suas receitas de" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
             {isLoadingPage ? (
              <div className="grid grid-cols-1 gap-4">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)}
              </div>
            ) : incomeForDisplayedPeriod.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {incomeForDisplayedPeriod.map(tx => (
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
                {translate({ en: "No income recorded for this period.", pt: "Nenhuma receita registrada para este período." })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
       {transactionToDelete && (
        <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translate({en: "Confirm Deletion", pt: "Confirmar Exclusão"})}</AlertDialogTitle>
              <AlertDialogDescription>
                {translate({en: "Are you sure you want to delete the income: ", pt: "Tem certeza que deseja excluir a receita: "})}
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