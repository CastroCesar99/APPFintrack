
"use client";

import type React from 'react'; // Ensure React is imported
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { TransactionForm } from "@/components/dashboard/transaction-form";
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
import { PlusCircle } from "lucide-react";
import type { Transaction, DisplayCategory, DisplayPaymentMethod, UserPreferences } from "@/types";
import { CATEGORIES, PAYMENT_METHODS } from "@/types";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, serverTimestamp, Timestamp, doc, deleteDoc, getDoc } from "firebase/firestore";
import { format as formatDateFns, parseISO as parseISODateFns, getYear as getYearFns, getMonth as getMonthFns } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

export default function ExpensesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  
  const [isClient, setIsClient] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  const [userCategories, setUserCategories] = useState<DisplayCategory[]>([]);
  const [userPaymentMethods, setUserPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchUserPreferences = useCallback(async () => {
    if (!user) {
      setUserCategories([...CATEGORIES]);
      setUserPaymentMethods([...PAYMENT_METHODS]);
      setIsLoadingPreferences(false);
      return;
    }
    setIsLoadingPreferences(true);
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const preferencesDocSnap = await getDoc(preferencesDocRef);

      if (preferencesDocSnap.exists()) {
        const preferencesData = preferencesDocSnap.data() as UserPreferences;
        
        const customCategoryDefs = preferencesData.userDefinedCategories || [];
        const baseCategories: DisplayCategory[] = [...CATEGORIES]; 
        const finalCategoriesMap = new Map<string, DisplayCategory>();

        baseCategories.forEach(cat => finalCategoriesMap.set(cat.name.toLowerCase(), cat));
        customCategoryDefs.forEach(customCat => {
             finalCategoriesMap.set(customCat.name.toLowerCase(), {...customCat, type: customCat.type || 'expense'});
        });
        setUserCategories(Array.from(finalCategoriesMap.values()));

        const customPaymentMethodDefs = preferencesData.userDefinedPaymentMethods || [];
        const basePaymentMethodsList: DisplayPaymentMethod[] = [...PAYMENT_METHODS];
        const finalPaymentMethodsMap = new Map<string, DisplayPaymentMethod>();
        
        basePaymentMethodsList.forEach(pm => finalPaymentMethodsMap.set(pm.name.toLowerCase(), pm));
        customPaymentMethodDefs.forEach(customPm => {
            finalPaymentMethodsMap.set(customPm.name.toLowerCase(), customPm);
        });
        
        const selectedPaymentMethodNames = preferencesData.selectedPaymentMethods || [];
        if (selectedPaymentMethodNames.length > 0) {
            const effectivePMs = Array.from(finalPaymentMethodsMap.values()).filter(pm => 
                selectedPaymentMethodNames.some(name => name.toLowerCase() === pm.name.toLowerCase())
            );
            setUserPaymentMethods(effectivePMs.length > 0 ? effectivePMs : Array.from(finalPaymentMethodsMap.values()));
        } else {
            setUserPaymentMethods(Array.from(finalPaymentMethodsMap.values()));
        }
      } else {
        setUserCategories([...CATEGORIES]);
        setUserPaymentMethods([...PAYMENT_METHODS]);
      }
    } catch (error) {
      console.error("ExpensesPage: Error fetching user preferences:", error);
      toast({
        title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }),
        description: translate({ en: "Could not load your preferences for the form.", pt: "Não foi possível carregar suas preferências para o formulário." }),
        variant: "destructive",
      });
      setUserCategories([...CATEGORIES]);
      setUserPaymentMethods([...PAYMENT_METHODS]);
    } finally {
      setIsLoadingPreferences(false);
    }
  }, [user, toast, translate]);

  useEffect(() => {
    if (user && !authLoading) {
      fetchUserPreferences();
    } else if (!authLoading && !user) {
      setUserCategories([...CATEGORIES]);
      setUserPaymentMethods([...PAYMENT_METHODS]);
      setIsLoadingPreferences(false);
    }
  }, [user, authLoading, fetchUserPreferences]);

  useEffect(() => {
    if (!user || authLoading || !isClient) {
      if (!authLoading && !user && isClient) router.push('/login');
      setIsLoadingTransactions(false); 
      return;
    }

    setIsLoadingTransactions(true);
    const transactionsColRef = collection(db, 'users/' + user.uid + '/transactions');
    const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

    const unsubscribe = onSnapshot(q_transactions, (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let dateString = data.date;
        if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
          dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
        } else if (typeof data.date === 'string' && data.date.includes('T')) {
          try {
            dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
          } catch (e) {
            console.warn("ExpensesPage: Failed to parse ISO date string: " + String(data.date), e);
            dateString = formatDateFns(new Date(), "yyyy-MM-dd");
          }
        } else if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
           console.warn("ExpensesPage: Transaction has unexpected date format. Fallback to current date. Date was:", data.date);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd");
        }
        return { 
          ...data, 
          id: docSnap.id, 
          date: dateString,
          expenseType: data.expenseType,
          installments: data.installments,
          paymentMethod: data.paymentMethod,
          isRecurring: data.isRecurring,
          expenseNature: data.expenseNature 
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
      setIsLoadingTransactions(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, isClient, toast, translate, router]);

  const expensesForDisplayedPeriod = useMemo(() => {
    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate);

    return allTransactions.filter(t => {
      if (t.type !== 'expense') return false;
      
      const dateParts = t.date.split('-');
      if (dateParts.length !== 3) {
        console.warn(\`ExpensesPage: Invalid date format for transaction ID \${t.id}: \${t.date}\`);
        return false;
      }
      const transactionYear = parseInt(dateParts[0], 10);
      const transactionMonth = parseInt(dateParts[1], 10) - 1; 

      if (isNaN(transactionYear) || isNaN(transactionMonth)) {
        console.warn(\`ExpensesPage: Could not parse year/month for transaction ID \${t.id}: \${t.date}\`);
        return false;
      }
      return transactionYear === targetYear && transactionMonth === targetMonth;
    });
  }, [allTransactions, displayedDate]);

  const handleOpenAddDialog = () => {
    setTransactionToEdit(null);
    setIsAddFormOpen(true);
  };

  const handleOpenEditDialog = (transactionId: string) => {
    const tx = allTransactions.find(t => t.id === transactionId);
    if (tx) {
      setTransactionToEdit(tx);
      setIsEditFormOpen(true);
    } else {
      toast({ title: translate({en:"Error", pt:"Erro"}), description: translate({en:"Transaction not found.", pt:"Transação não encontrada."}), variant: "destructive" });
    }
  };

  const handleSaveTransaction = async (formData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, id?: string) => {
    if (!user) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }

    const dataPayload = { ...formData, type: 'expense' as 'expense' };
    const cleanPayload = Object.fromEntries(Object.entries(dataPayload).filter(([_, v]) => v !== undefined)) as Partial<Transaction>;


    if (id) { // Editing existing transaction
      const transactionDocRef = doc(db, `users/${user.uid}/transactions`, id);
      try {
        await updateDoc(transactionDocRef, { ...cleanPayload, updatedAt: serverTimestamp() });
        toast({ title: translate({ en: "Expense Updated", pt: "Despesa Atualizada" }), description: `${formData.description} ${translate({ en: "has been successfully updated.", pt: "foi atualizada com sucesso." })}` });
        setIsEditFormOpen(false);
        setTransactionToEdit(null);
      } catch (error: any) {
        console.error("ExpensesPage: Error updating expense:", error);
        toast({ title: translate({ en: "Error Updating Expense", pt: "Erro ao Atualizar Despesa" }), description: (error.message || translate({ en: "Could not update expense.", pt: "Não foi possível atualizar a despesa." })) + (error.code ? ` (Code: ${error.code})` : ''), variant: "destructive" });
      }
    } else { // Adding new transaction
      try {
        const transactionsColRef = collection(db, `users/${user.uid}/transactions`);
        await addDoc(transactionsColRef, { ...cleanPayload, userId: user.uid, createdAt: serverTimestamp() });
        toast({ title: translate({ en: "Expense Added", pt: "Despesa Adicionada" }), description: `${formData.description} ${translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })}` });
        setIsAddFormOpen(false);
      } catch (error: any) {
        console.error("ExpensesPage: Error adding expense:", error);
        toast({ title: translate({ en: "Error Adding Expense", pt: "Erro ao Adicionar Despesa" }), description: (error.message || translate({ en: "Could not add expense.", pt: "Não foi possível adicionar a despesa." })) + (error.code ? ` (Code: ${error.code})` : ''), variant: "destructive" });
      }
    }
  };
  
  const openDeleteConfirmation = (transactionId: string) => {
    const tx = allTransactions.find(t => t.id === transactionId);
    if (tx) {
      setTransactionToDelete(tx);
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!user || !transactionToDelete) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Transaction not found or user not authenticated.", pt: "Transação não encontrada ou usuário não autenticado." }),
        variant: "destructive",
      });
      setTransactionToDelete(null);
      return;
    }

    try {
      const docRef = doc(db, `users/${user.uid}/transactions`, transactionToDelete.id);
      await deleteDoc(docRef);
      toast({
        title: translate({ en: "Expense Deleted", pt: "Despesa Excluída" }),
        description: `${transactionToDelete.description} ${translate({en: "has been deleted.", pt: "foi excluída."})}`,
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

  if (!isClient || authLoading || isLoadingTransactions || isLoadingPreferences) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full">
          <p className="text-foreground">{translate({ en: "Loading expenses...", pt: "Carregando despesas..." })}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6"> 
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {pageTitle} - {displayedMonthYearLabel}
          </h1>
          <Dialog open={isAddFormOpen} onOpenChange={setIsAddFormOpen} modal={false}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenAddDialog} variant="outline" className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                {translate({ en: "Add New Expense", pt: "Adicionar Nova Despesa" })}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{translate({ en: "New Expense", pt: "Nova Despesa" })}</DialogTitle>
                <DialogDescription>
                  {translate({ en: "Fill in the details for your new expense.", pt: "Preencha os detalhes da sua nova despesa." })}
                </DialogDescription>
              </DialogHeader>
              <TransactionForm
                onSave={handleSaveTransaction}
                initialType="expense"
                transactionToEdit={null} // Explicitly null for adding
                defaultDate={displayedDate}
                userCategories={userCategories}
                userPaymentMethods={userPaymentMethods}
                key={`add-${displayedDate.toISOString()}`} 
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Expense Dialog */}
        <Dialog open={isEditFormOpen} onOpenChange={setIsEditFormOpen} modal={false}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{translate({ en: "Edit Expense", pt: "Editar Despesa" })}</DialogTitle>
              <DialogDescription>
                {translate({ en: "Update the details of your expense.", pt: "Atualize os detalhes da sua despesa." })}
              </DialogDescription>
            </DialogHeader>
            {transactionToEdit && (
              <TransactionForm
                onSave={handleSaveTransaction}
                initialType="expense"
                transactionToEdit={transactionToEdit}
                userCategories={userCategories}
                userPaymentMethods={userPaymentMethods}
                key={`edit-${transactionToEdit.id}-${displayedDate.toISOString()}`}
              />
            )}
          </DialogContent>
        </Dialog>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">{translate({ en: "Expense List", pt: "Lista de Despesas" })}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {translate({ en: "All your expenses for", pt: "Todas as suas despesas de" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {expensesForDisplayedPeriod.length > 0 ? (
              <TransactionsTable 
                transactions={expensesForDisplayedPeriod} 
                onEditTransaction={handleOpenEditDialog}
                onDeleteTransaction={openDeleteConfirmation}
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No expenses recorded for this period.", pt: "Nenhuma despesa registrada para este período." })}
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

    